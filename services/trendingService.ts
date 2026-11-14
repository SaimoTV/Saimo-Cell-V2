/**
 * Trending Service — Saimo TV
 *
 * Fluxo:
 *  1. Busca IDs de trending no TMDB (3 páginas em paralelo ≈ 60 itens)
 *  2. Cruza os IDs com a lista de filmes e séries do usuário (fichas.txt +
 *     índice de busca, por id do TMDB). Sem o endereço dessa lista: vazio, sem rede
 *  3. Retorna apenas o que o usuário pode assistir
 *  4. Cache em memória de 30 minutos (sem disco — dados efêmeros)
 */
import type { MediaItem } from '../types';
import { carregarAddons, getAddonsAtivos } from './addons';
import { filmografiaNoAcervo } from './saimoSources';
import { baseFilmes } from './enderecos';

const TMDB_API_KEY = '15d2ea6d0dc1d476efbca3eba2b9bbfb';
const TMDB_BASE = 'https://api.themoviedb.org/3';
const IMG_BASE = 'https://image.tmdb.org/t/p/';
const CACHE_TTL = 30 * 60 * 1000; // 30 minutos
const PAGES_TO_FETCH = 3;          // 3 páginas ≈ 60 IDs TMDB

let _todayItems: MediaItem[] | null = null;
let _weekItems: MediaItem[] | null = null;
let _todayAt = 0;
let _weekAt = 0;

// Busca IDs de trending de uma única página
async function fetchPage(period: 'day' | 'week', page: number): Promise<{ id: number; serie: boolean; raw: Record<string, unknown> }[]> {
    try {
        const url = `${TMDB_BASE}/trending/all/${period}?api_key=${TMDB_API_KEY}&language=pt-BR&page=${page}`;
        const res = await fetch(url, { headers: { Accept: 'application/json' } });
        if (!res.ok) return [];
        const data = await res.json();
        return (data.results || [])
            .filter((item: any) => (item?.media_type === 'movie' || item?.media_type === 'tv') && Number(item?.id) > 0)
            .map((item: any) => ({ id: Number(item.id), serie: item.media_type === 'tv', raw: item as Record<string, unknown> }));
    } catch {
        return [];
    }
}

function rawTrendingParaMediaItem(raw: Record<string, unknown>, serie: boolean): MediaItem {
    const idNum = Number(raw.id);
    const tipo: 'movie' | 'tv' = serie ? 'tv' : 'movie';
    const title = String(serie ? (raw.name || raw.original_name || '') : (raw.title || raw.original_title || ''));
    const rawDate = String(serie ? (raw.first_air_date || '') : (raw.release_date || ''));
    const year = rawDate.length >= 4 ? rawDate.slice(0, 4) : '';
    const poster = typeof raw.poster_path === 'string' && raw.poster_path ? `${IMG_BASE}w500${raw.poster_path}` : '';
    const posterHD = typeof raw.poster_path === 'string' && raw.poster_path ? `${IMG_BASE}w780${raw.poster_path}` : undefined;
    const backdrop = typeof raw.backdrop_path === 'string' && raw.backdrop_path ? `${IMG_BASE}w780${raw.backdrop_path}` : undefined;
    const backdropHD = typeof raw.backdrop_path === 'string' && raw.backdrop_path ? `${IMG_BASE}original${raw.backdrop_path}` : undefined;

    return {
        id: `tmdb|${tipo}|${idNum}`,
        name: title,
        url: '',
        category: 'Em alta',
        categoryLabel: 'Em alta',
        type: tipo,
        isAdult: false,
        logo: poster || undefined,
        tmdb: {
            id: idNum,
            title,
            originalTitle: String(serie ? (raw.original_name || title) : (raw.original_title || title)),
            overview: typeof raw.overview === 'string' ? raw.overview : '',
            releaseDate: rawDate,
            year,
            rating: Number(raw.vote_average || 0),
            voteCount: Number(raw.vote_count || 0),
            popularity: Number(raw.popularity || 0),
            genres: [],
            poster,
            posterHD,
            backdrop,
            backdropHD,
            cast: [],
        },
    };
}

// Busca PAGES_TO_FETCH páginas em paralelo e cruza com o catálogo local ou desbloqueia via addons
async function loadTrending(period: 'day' | 'week'): Promise<MediaItem[]> {
    const temLista = Boolean(await baseFilmes());
    let temAddon = false;
    if (!temLista) {
        await carregarAddons();
        temAddon = getAddonsAtivos().length > 0;
        if (!temAddon) return [];
    }

    const pageNums = Array.from({ length: PAGES_TO_FETCH }, (_, i) => i + 1);

    // Todas as páginas em paralelo
    const results = await Promise.allSettled(pageNums.map(p => fetchPage(period, p)));

    const creditos: { id: number; serie: boolean; raw: Record<string, unknown> }[] = [];
    for (const r of results) {
        if (r.status === 'fulfilled') creditos.push(...r.value);
    }
    if (!creditos.length) return [];

    if (!temLista && temAddon) {
        const vistos = new Set<string>();
        const saida: MediaItem[] = [];
        for (const c of creditos) {
            const k = `${c.serie ? 'tv' : 'movie'}:${c.id}`;
            if (vistos.has(k)) continue;
            vistos.add(k);
            saida.push(rawTrendingParaMediaItem(c.raw, c.serie));
        }
        return saida;
    }

    // Só entra o que existe no acervo (cruzamento pelo id do TMDB).
    try {
        return await filmografiaNoAcervo(creditos);
    } catch {
        return [];
    }
}

/** Tendências do dia. Cache de 30 min. */
export async function getTrendingToday(): Promise<MediaItem[]> {
    const now = Date.now();
    if (_todayItems !== null && now - _todayAt < CACHE_TTL) return _todayItems;
    _todayItems = await loadTrending('day');
    _todayAt = Date.now();
    return _todayItems;
}

/** Tendências da semana. Cache de 30 min. */
export async function getTrendingWeek(): Promise<MediaItem[]> {
    const now = Date.now();
    if (_weekItems !== null && now - _weekAt < CACHE_TTL) return _weekItems;
    _weekItems = await loadTrending('week');
    _weekAt = Date.now();
    return _weekItems;
}

/** Zera o cache (força re-fetch na próxima chamada). */
export function clearTrendingCache() {
    _todayItems = null;
    _weekItems = null;
    _todayAt = 0;
    _weekAt = 0;
}

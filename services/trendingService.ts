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
import { filmografiaNoAcervo } from './saimoSources';
import { baseFilmes } from './enderecos';

const TMDB_API_KEY = '15d2ea6d0dc1d476efbca3eba2b9bbfb';
const TMDB_BASE = 'https://api.themoviedb.org/3';
const CACHE_TTL = 30 * 60 * 1000; // 30 minutos
const PAGES_TO_FETCH = 3;          // 3 páginas ≈ 60 IDs TMDB

let _todayItems: MediaItem[] | null = null;
let _weekItems: MediaItem[] | null = null;
let _todayAt = 0;
let _weekAt = 0;

// Busca IDs de trending de uma única página
async function fetchPage(period: 'day' | 'week', page: number): Promise<{ id: number; serie: boolean }[]> {
    try {
        const url = `${TMDB_BASE}/trending/all/${period}?api_key=${TMDB_API_KEY}&language=pt-BR&page=${page}`;
        const res = await fetch(url, { headers: { Accept: 'application/json' } });
        if (!res.ok) return [];
        const data = await res.json();
        return (data.results || [])
            .map((item: any) => ({ id: Number(item.id), serie: item.media_type === 'tv' }))
            .filter((c: { id: number }) => c.id > 0);
    } catch {
        return [];
    }
}

// Busca PAGES_TO_FETCH páginas em paralelo e cruza com o catálogo local
async function loadTrending(period: 'day' | 'week'): Promise<MediaItem[]> {
    // Sem a lista de filmes não há com o que cruzar: nem a consulta ao TMDB sai.
    if (!(await baseFilmes())) return [];
    const pageNums = Array.from({ length: PAGES_TO_FETCH }, (_, i) => i + 1);

    // Todas as páginas em paralelo
    const results = await Promise.allSettled(pageNums.map(p => fetchPage(period, p)));

    const creditos: { id: number; serie: boolean }[] = [];
    for (const r of results) {
        if (r.status === 'fulfilled') creditos.push(...r.value);
    }
    if (!creditos.length) return [];

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

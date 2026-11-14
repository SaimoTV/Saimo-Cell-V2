// Busca de metadados no TMDB, com o mesmo algoritmo de casamento do
// `api-saimo-tv` — o gerador que enriquece o catálogo do Supabase.
//
// O Cinemeta que este app usava antes ficava com o primeiro resultado da
// busca, sem comparar nome nenhum: "A 13ª Emenda" batia com qualquer coisa
// que a busca por esse texto trouxesse primeiro. Aqui cada resultado ganha
// uma pontuação — título exato, título contido, ano de lançamento,
// popularidade — e só o suficiente para valer a pena costuma vencer.
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Episode, MediaCategory, MediaItem, SeriesEpisodes, TMDBData } from '../types';

const TMDB_API_KEY = '15d2ea6d0dc1d476efbca3eba2b9bbfb';
const TMDB_BASE = 'https://api.themoviedb.org/3';
const TMDB_MIN_SCORE = 10;
const IMG_BASE = 'https://image.tmdb.org/t/p/';
const CHAVE_BRIDGE = 'saimo_tmdb_imdb_v1';

type TmdbTipo = 'movie' | 'tv';

interface TmdbResultado {
  id: number;
  title?: string;
  name?: string;
  original_title?: string;
  original_name?: string;
  release_date?: string;
  first_air_date?: string;
  overview?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  vote_count?: number;
  vote_average?: number;
  popularity?: number;
  genre_ids?: number[];
}

const GENRE_NAMES: Record<number, string> = {
  28: 'Ação', 12: 'Aventura', 16: 'Animação', 35: 'Comédia', 80: 'Crime',
  99: 'Documentário', 18: 'Drama', 10751: 'Família', 14: 'Fantasia',
  36: 'História', 27: 'Terror', 10402: 'Música', 9648: 'Mistério',
  10749: 'Romance', 878: 'Ficção científica', 10770: 'Cinema TV',
  53: 'Suspense', 10752: 'Guerra', 37: 'Faroeste',
  10759: 'Ação & Aventura', 10762: 'Infantil', 10763: 'Notícias',
  10764: 'Reality', 10765: 'Ficção & Fantasia', 10766: 'Novela',
  10767: 'Talk', 10768: 'Guerra & Política',
};

const LEADING_ARTICLES = /^(o|a|os|as|um|uma|the|an?)\s+/i;

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanTitle(title: string): string {
  return title
    .replace(/\s*[([]\s*(leg|dub|dublado|legendado|dual|national|pt-br|pt-pt|eng|legendada)\s*[)\]]/gi, '')
    .replace(/\b(4K|UHD|HD|FHD|SD|BluRay|BDRip|WEB-DL|WEBRip|HDTV|DVDRip|CAM|HDR|SDR)\b/gi, '')
    .replace(/\s*[([]\d{4}[)\]]\s*/g, '')
    .replace(/\s+S\d{1,2}\s*(?:E|Ep)?\s*\d{1,3}.*/i, '')
    .replace(/\s+T\d{1,2}\s*(?:E|Ep)?\s*\d{1,3}.*/i, '')
    .replace(/\s+Temporada\s+\d+.*/i, '')
    .replace(/\s+\d{1,2}x\d{1,3}.*/i, '')
    .replace(/[\s.\-_]+$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildSearchVariants(name: string): string[] {
  const cleaned = cleanTitle(name);
  const variants = [cleaned];
  const add = (s: string | null) => { if (s && s.length > 1) variants.push(s); };

  const withoutLang = cleaned.replace(/\s*[([](leg|dub|dublado|legendado|dual|national)[)\]]/gi, '').trim();
  add(withoutLang !== cleaned ? withoutLang : null);

  const withoutArticle = cleaned.replace(LEADING_ARTICLES, '').trim();
  add(withoutArticle !== cleaned ? withoutArticle : null);

  const withoutSubtitle = cleaned.split(/\s*[:-]\s+/)[0].trim();
  add(withoutSubtitle !== cleaned && withoutSubtitle.length > 2 ? withoutSubtitle : null);

  const ascii = cleaned.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  add(ascii !== cleaned ? ascii : null);

  const withoutRoman = cleaned.replace(/\s+(?:II|III|IV|V|VI|VII|VIII|IX|X)$/i, '').trim();
  add(withoutRoman !== cleaned ? withoutRoman : null);

  return [...new Set(variants)];
}

function extrairAno(titulo: string): number | null {
  const m = titulo.match(/\b(20\d{2}|19\d{2})\b/);
  return m ? Number(m[1]) : null;
}

function pontuar(
  nomeLocal: string,
  resultado: TmdbResultado,
  tipo: TmdbTipo,
  ano: number | null,
  unico: boolean,
): number {
  const localNorm = normalizeName(cleanTitle(nomeLocal));
  const titulo = tipo === 'tv' ? resultado.name : resultado.title;
  const original = tipo === 'tv' ? resultado.original_name : resultado.original_title;
  const tituloNorm = normalizeName(titulo || '');
  const originalNorm = normalizeName(original || '');

  let pontos = 0;

  if (localNorm === tituloNorm || localNorm === originalNorm) pontos += 100;
  else if (tituloNorm.startsWith(localNorm) || localNorm.startsWith(tituloNorm)) pontos += 70;
  else if (originalNorm.startsWith(localNorm) || localNorm.startsWith(originalNorm)) pontos += 65;
  else if (tituloNorm.includes(localNorm) || localNorm.includes(tituloNorm)) pontos += 50;
  else if (originalNorm.includes(localNorm) || localNorm.includes(originalNorm)) pontos += 45;
  // A busca do TMDB já casa por título traduzido que nem `name` nem
  // `original_name` revelam de volta (ex.: "A Amiga Genial" só bate com "My
  // Brilliant Friend" pelo apelido em italiano que o TMDB conhece por
  // dentro); um resultado único da busca já é sinal suficiente.
  else if (unico) pontos += 12;

  const votos = resultado.vote_count || 0;
  if (votos > 1000) pontos += 15;
  else if (votos > 100) pontos += 8;

  if (ano) {
    const dataLancamento = tipo === 'tv' ? resultado.first_air_date : resultado.release_date;
    const anoTmdb = dataLancamento ? Number(dataLancamento.slice(0, 4)) : null;
    if (anoTmdb) {
      const diff = Math.abs(ano - anoTmdb);
      if (diff === 0) pontos += 25;
      else if (diff === 1) pontos += 10;
      else if (diff > 2) pontos -= 25;
    }
  }

  return pontos;
}

async function buscarUmaVez(query: string, tipo: TmdbTipo, lang: string): Promise<TmdbResultado[]> {
  const endpoint = tipo === 'tv' ? 'search/tv' : 'search/movie';
  const url = `${TMDB_BASE}/${endpoint}?query=${encodeURIComponent(query)}&api_key=${TMDB_API_KEY}&language=${lang}`;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const r = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!r.ok) return [];
    const json = await r.json();
    return json?.results ?? [];
  } catch {
    return [];
  }
}

async function buscarTMDB(query: string, tipo: TmdbTipo): Promise<TmdbResultado[]> {
  const pt = await buscarUmaVez(query, tipo, 'pt-BR');
  if (pt.length) return pt;
  return buscarUmaVez(query, tipo, 'en-US');
}

interface MelhorMatch {
  resultado: TmdbResultado;
  tipo: TmdbTipo;
}

async function melhorMatch(nome: string, tipoPrincipal: TmdbTipo): Promise<MelhorMatch | null> {
  const ano = extrairAno(nome);
  const variantes = buildSearchVariants(nome);
  const tipoAlternativo: TmdbTipo = tipoPrincipal === 'movie' ? 'tv' : 'movie';

  let melhor: TmdbResultado | null = null;
  let melhorPontos = 0;
  let tipoEncontrado = tipoPrincipal;

  for (const variante of variantes) {
    const resultados = await buscarTMDB(variante, tipoPrincipal);
    const unico = resultados.length === 1;
    for (const r of resultados.slice(0, 5)) {
      const pontos = pontuar(nome, r, tipoPrincipal, ano, unico);
      if (pontos > melhorPontos) { melhorPontos = pontos; melhor = r; }
    }
    if (melhorPontos >= 90) break;
  }

  if (melhorPontos < TMDB_MIN_SCORE) {
    for (const variante of variantes) {
      const resultados = await buscarTMDB(variante, tipoAlternativo);
      const unico = resultados.length === 1;
      for (const r of resultados.slice(0, 5)) {
        const pontos = pontuar(nome, r, tipoAlternativo, ano, unico);
        if (pontos > melhorPontos) { melhorPontos = pontos; melhor = r; tipoEncontrado = tipoAlternativo; }
      }
      if (melhorPontos >= 90) break;
    }
  }

  if (!melhor || melhorPontos < TMDB_MIN_SCORE) return null;
  return { resultado: melhor, tipo: tipoEncontrado };
}

function posterUrl(path: string | null | undefined, largura = 'w500'): string | undefined {
  return path ? `${IMG_BASE}${largura}${path}` : undefined;
}

const cache = new Map<string, Promise<Partial<TMDBData>>>();

export function clearTMDBCache(): void {
  cache.clear();
  detalhesCache.clear();
}

/** Metadados de um filme ou série pelo nome — mesma assinatura de `getCinemetaData`. */
export function getTMDBData(title: string, series: boolean): Promise<Partial<TMDBData>> {
  const key = `${series ? 's' : 'm'}:${title}`;
  const existente = cache.get(key);
  if (existente) return existente;

  const promessa = (async (): Promise<Partial<TMDBData>> => {
    const match = await melhorMatch(title, series ? 'tv' : 'movie');
    if (!match) return {};
    const { resultado, tipo } = match;
    const nomeExibido = (tipo === 'tv' ? resultado.name : resultado.title) || title;
    const dataLancamento = tipo === 'tv' ? resultado.first_air_date : resultado.release_date;
    return {
      id: resultado.id,
      title: nomeExibido,
      originalTitle: (tipo === 'tv' ? resultado.original_name : resultado.original_title) || undefined,
      overview: resultado.overview || '',
      releaseDate: dataLancamento || undefined,
      year: dataLancamento?.slice(0, 4) || /(?:19|20)\d{2}/.exec(title)?.[0] || '',
      rating: resultado.vote_average || 0,
      voteCount: resultado.vote_count,
      popularity: resultado.popularity,
      genres: (resultado.genre_ids || []).map((id) => GENRE_NAMES[id]).filter(Boolean),
      // w342: o cartão desenha a uns 300 px; o w500 era 40% a mais de bytes por capa.
      poster: posterUrl(resultado.poster_path, 'w342') || '',
      posterHD: posterUrl(resultado.poster_path, 'original'),
      backdrop: posterUrl(resultado.backdrop_path, 'w780'),
      backdropHD: posterUrl(resultado.backdrop_path, 'original'),
      cast: [],
    };
  })();

  cache.set(key, promessa);
  return promessa;
}

// ── Ficha completa ─────────────────────────────────────────────────────────
//
// A busca do TMDB devolve pouco: título, sinopse, nota, capa e os números dos
// gêneros. Duração, classificação indicativa, elenco, direção e produtora só
// existem no endereço do título, e é por isso que a tela de detalhe mostrava
// seções vazias — o elenco, em especial, chegava sempre como lista vazia.
//
// A ficha é pedida uma vez por título, quando a tela abre, e fica em memória.

interface TmdbPessoa {
  id: number;
  name: string;
  character?: string;
  job?: string;
  profile_path?: string | null;
}

/** A classificação indicativa brasileira, quando o TMDB a conhece. */
function certificacaoBR(json: any, tipo: TmdbTipo): string | undefined {
  if (tipo === 'tv') {
    const br = json?.content_ratings?.results?.find((r: any) => r.iso_3166_1 === 'BR');
    return br?.rating || undefined;
  }
  const br = json?.release_dates?.results?.find((r: any) => r.iso_3166_1 === 'BR');
  const comNota = br?.release_dates?.find((d: any) => d.certification);
  return comNota?.certification || undefined;
}

const detalhesCache = new Map<string, Promise<Partial<TMDBData>>>();

const tmdbParaImdb = new Map<string, string>();
const imdbParaTmdb = new Map<string, { tmdbId: number; series: boolean }>();
let bridgeCarregada: Promise<void> | null = null;
let bridgeDirtyTimer: ReturnType<typeof setTimeout> | null = null;

async function garantirBridgeCarregada(): Promise<void> {
  if (!bridgeCarregada) {
    bridgeCarregada = (async () => {
      try {
        const bruto = await AsyncStorage.getItem(CHAVE_BRIDGE);
        if (!bruto) return;
        const json = JSON.parse(bruto) as { t2i?: Record<string, string>; i2t?: Record<string, { tmdbId: number; series: boolean }> };
        if (json?.t2i) {
          for (const [k, v] of Object.entries(json.t2i)) {
            if (typeof v === 'string' && /^tt\d+$/i.test(v)) tmdbParaImdb.set(k, v);
          }
        }
        if (json?.i2t) {
          for (const [k, v] of Object.entries(json.i2t)) {
            if (v && typeof v.tmdbId === 'number') imdbParaTmdb.set(k, v);
          }
        }
      } catch {
        // segue com cache apenas em memória
      }
    })();
  }
  return bridgeCarregada;
}

function agendarSalvarBridge(): void {
  if (bridgeDirtyTimer) return;
  bridgeDirtyTimer = setTimeout(() => {
    bridgeDirtyTimer = null;
    const t2i: Record<string, string> = {};
    const i2t: Record<string, { tmdbId: number; series: boolean }> = {};
    // Limita em memória persistida aos 1500 vínculos mais recentes
    const entradasT = Array.from(tmdbParaImdb.entries()).slice(-1500);
    for (const [k, v] of entradasT) t2i[k] = v;
    const entradasI = Array.from(imdbParaTmdb.entries()).slice(-1500);
    for (const [k, v] of entradasI) i2t[k] = v;
    void AsyncStorage.setItem(CHAVE_BRIDGE, JSON.stringify({ t2i, i2t })).catch(() => {});
  }, 400);
}

export function registrarVinculoTmdbImdb(series: boolean, tmdbId: number, imdbId?: string | null): void {
  if (!tmdbId || !imdbId || !/^tt\d+$/i.test(imdbId.trim())) return;
  const imdbNorm = imdbId.trim();
  const chave = `${series ? 'tv' : 'movie'}:${tmdbId}`;
  const mudou = tmdbParaImdb.get(chave) !== imdbNorm || !imdbParaTmdb.has(imdbNorm);
  tmdbParaImdb.set(chave, imdbNorm);
  imdbParaTmdb.set(imdbNorm, { tmdbId, series });
  if (mudou) agendarSalvarBridge();
}

/** A ficha completa de um título já identificado no TMDB. */
export function getTMDBDetails(id: number, series: boolean): Promise<Partial<TMDBData>> {
  const tipo: TmdbTipo = series ? 'tv' : 'movie';
  const key = `${tipo}:${id}`;
  const existente = detalhesCache.get(key);
  if (existente) return existente;

  const promessa = (async (): Promise<Partial<TMDBData>> => {
    const extras = series ? 'credits,content_ratings,external_ids' : 'credits,release_dates,external_ids';
    const url = `${TMDB_BASE}/${tipo}/${id}?api_key=${TMDB_API_KEY}` +
      `&language=pt-BR&append_to_response=${extras}`;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      const r = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);
      if (!r.ok) return {};
      const json = await r.json();

      const imdbId = typeof json?.external_ids?.imdb_id === 'string' && /^tt\d+$/i.test(json.external_ids.imdb_id.trim())
        ? json.external_ids.imdb_id.trim()
        : undefined;
      if (imdbId) {
        registrarVinculoTmdbImdb(series, id, imdbId);
      }

      const equipe: TmdbPessoa[] = json?.credits?.crew ?? [];
      const elenco: TmdbPessoa[] = json?.credits?.cast ?? [];
      const criadores: TmdbPessoa[] = json?.created_by ?? [];

      const direcao = equipe.filter(p => p.job === 'Director').map(p => p.name);
      const roteiro = equipe
        .filter(p => p.job === 'Screenplay' || p.job === 'Writer' || p.job === 'Story')
        .map(p => p.name);
      // Série não tem diretor único: quem a assina é quem a criou.
      const assinatura = direcao.length ? direcao : criadores.map(p => p.name);

      const duracao = series
        ? (json?.episode_run_time?.[0] as number | undefined)
        : (json?.runtime as number | undefined);

      const generos: string[] = (json?.genres ?? []).map((g: any) => g.name).filter(Boolean);
      const elencoPronto = elenco.slice(0, 20).map(p => ({
        id: p.id,
        name: p.name,
        character: p.character || '',
        photo: p.profile_path ? `${IMG_BASE}w185${p.profile_path}` : null,
      }));

      // Campo vazio não entra: a ficha completa o que a busca trouxe, e
      // sobrescrever com nada seria apagar o que já estava na tela.
      const ficha: Partial<TMDBData> = {};
      if (imdbId) ficha.imdbId = imdbId;
      if (json?.tagline) ficha.tagline = json.tagline;
      if (json?.overview) ficha.overview = json.overview;
      if (json?.status) ficha.status = json.status;
      if (duracao) ficha.runtime = duracao;
      const cert = certificacaoBR(json, tipo);
      if (cert) ficha.certification = cert;
      if (generos.length) ficha.genres = generos;
      if (assinatura.length) ficha.director = assinatura.slice(0, 2).join(', ');
      if (roteiro.length) ficha.writer = [...new Set(roteiro)].slice(0, 2).join(', ');
      if (json?.production_companies?.[0]?.name) {
        ficha.productionCompany = json.production_companies[0].name;
      }
      if (elencoPronto.length) ficha.cast = elencoPronto;
      return ficha;
    } catch {
      return {};
    }
  })();

  detalhesCache.set(key, promessa);
  return promessa;
}

/**
 * Os trabalhos de um ator, como o TMDB os devolve: id e se é série, em ordem
 * de popularidade. O cruzamento com o acervo é de quem chama, que é quem tem
 * o índice — a lista inteira do TMDB não serve de dentro do aplicativo.
 */
export async function creditosDe(ator: number): Promise<{ id: number; serie: boolean }[]> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const r = await fetch(
      `${TMDB_BASE}/person/${ator}/combined_credits?api_key=${TMDB_API_KEY}&language=pt-BR`,
      { signal: controller.signal },
    );
    clearTimeout(timer);
    if (!r.ok) return [];
    const json = await r.json();
    const trabalhos: any[] = [...(json?.cast ?? []), ...(json?.crew ?? [])];
    trabalhos.sort((a, b) => (b?.popularity ?? 0) - (a?.popularity ?? 0));
    const vistos = new Set<string>();
    const saida: { id: number; serie: boolean }[] = [];
    for (const trabalho of trabalhos) {
      const id = Number(trabalho?.id);
      if (!Number.isFinite(id) || id <= 0) continue;
      const serie = trabalho?.media_type === 'tv';
      const marca = `${serie ? 's' : 'f'}:${id}`;
      if (vistos.has(marca)) continue;
      vistos.add(marca);
      saida.push({ id, serie });
    }
    return saida;
  } catch {
    return [];
  }
}

/**
 * Resolve o ID IMDb (tt...) a partir de um TMDB ID usando cache persistente e endpoint external_ids.
 */
export async function resolverImdbPorTmdb(
  tmdbId: number,
  series: boolean,
): Promise<string | undefined> {
  if (!tmdbId || tmdbId <= 0) return undefined;
  await garantirBridgeCarregada();
  const chave = `${series ? 'tv' : 'movie'}:${tmdbId}`;
  const cached = tmdbParaImdb.get(chave);
  if (cached) return cached;

  try {
    const tipo: TmdbTipo = series ? 'tv' : 'movie';
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 7000);
    const r = await fetch(
      `${TMDB_BASE}/${tipo}/${tmdbId}/external_ids?api_key=${TMDB_API_KEY}`,
      { signal: controller.signal },
    );
    clearTimeout(timer);
    if (!r.ok) return undefined;
    const json = await r.json();
    const imdb = typeof json?.imdb_id === 'string' ? json.imdb_id.trim() : '';
    if (/^tt\d+$/i.test(imdb)) {
      registrarVinculoTmdbImdb(series, tmdbId, imdb);
      return imdb;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

/**
 * Resolve o ID TMDB (e ficha básica) a partir de um ID IMDb (tt...) ou prefixo `tmdb:`.
 */
export async function resolverTmdbPorImdb(
  rawId: string,
  preferSeries?: boolean,
): Promise<{ tmdbId: number; series: boolean; imdbId?: string } | null> {
  const limpo = rawId.trim();
  if (!limpo) return null;

  const tmdbMatch = /^tmdb:(\d+)/i.exec(limpo);
  if (tmdbMatch) {
    return { tmdbId: Number(tmdbMatch[1]), series: Boolean(preferSeries) };
  }

  const ttMatch = /^(tt\d+)/i.exec(limpo);
  if (!ttMatch) return null;
  const imdbId = ttMatch[1];

  await garantirBridgeCarregada();
  const cached = imdbParaTmdb.get(imdbId);
  if (cached) {
    return { tmdbId: cached.tmdbId, series: cached.series, imdbId };
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 7000);
    const r = await fetch(
      `${TMDB_BASE}/find/${encodeURIComponent(imdbId)}?api_key=${TMDB_API_KEY}&external_source=imdb_id&language=pt-BR`,
      { signal: controller.signal },
    );
    clearTimeout(timer);
    if (!r.ok) return null;
    const json = await r.json();

    const movieHit = Array.isArray(json?.movie_results) ? json.movie_results[0] : undefined;
    const tvHit = Array.isArray(json?.tv_results) ? json.tv_results[0] : undefined;

    const escolhido = preferSeries === true
      ? (tvHit ? { hit: tvHit, series: true } : movieHit ? { hit: movieHit, series: false } : null)
      : preferSeries === false
        ? (movieHit ? { hit: movieHit, series: false } : tvHit ? { hit: tvHit, series: true } : null)
        : (movieHit ? { hit: movieHit, series: false } : tvHit ? { hit: tvHit, series: true } : null);

    if (!escolhido?.hit?.id) return null;
    const tmdbId = Number(escolhido.hit.id);
    registrarVinculoTmdbImdb(escolhido.series, tmdbId, imdbId);
    return { tmdbId, series: escolhido.series, imdbId };
  } catch {
    return null;
  }
}

function tmdbResultadoParaMediaItem(
  r: Record<string, unknown>,
  tipo: 'movie' | 'tv',
  categoria: string,
): MediaItem {
  const idNum = Number(r.id);
  const title = String(tipo === 'tv' ? (r.name || r.original_name || '') : (r.title || r.original_title || ''));
  const rawDate = String(tipo === 'tv' ? (r.first_air_date || '') : (r.release_date || ''));
  const year = rawDate.length >= 4 ? rawDate.slice(0, 4) : '';
  const genreIds = Array.isArray(r.genre_ids) ? (r.genre_ids as number[]) : [];
  const genres = genreIds.map((g) => GENRE_NAMES[g]).filter(Boolean);
  const poster = typeof r.poster_path === 'string' && r.poster_path ? `${IMG_BASE}w500${r.poster_path}` : '';
  const posterHD = typeof r.poster_path === 'string' && r.poster_path ? `${IMG_BASE}w780${r.poster_path}` : undefined;
  const backdrop = typeof r.backdrop_path === 'string' && r.backdrop_path ? `${IMG_BASE}w780${r.backdrop_path}` : undefined;
  const backdropHD = typeof r.backdrop_path === 'string' && r.backdrop_path ? `${IMG_BASE}original${r.backdrop_path}` : undefined;

  return {
    id: `tmdb|${tipo}|${idNum}`,
    name: title,
    url: '',
    category: categoria,
    categoryLabel: categoria,
    type: tipo,
    isAdult: false,
    logo: poster || undefined,
    tmdb: {
      id: idNum,
      title,
      originalTitle: String(tipo === 'tv' ? (r.original_name || title) : (r.original_title || title)),
      overview: typeof r.overview === 'string' ? r.overview : '',
      releaseDate: rawDate,
      year,
      rating: Number(r.vote_average || 0),
      voteCount: Number(r.vote_count || 0),
      popularity: Number(r.popularity || 0),
      genres,
      poster,
      posterHD,
      backdrop,
      backdropHD,
      cast: [],
    },
  };
}

/**
 * Carrega ficha completa de filme ou série do TMDB (incluindo temporadas e episódios da temporada 1).
 */
export async function carregarItemTMDBCompleto(
  tmdbId: number,
  series: boolean,
): Promise<MediaItem | null> {
  const tipo: TmdbTipo = series ? 'tv' : 'movie';
  const extras = series ? 'credits,content_ratings,external_ids' : 'credits,release_dates,external_ids';
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 9000);
    const r = await fetch(
      `${TMDB_BASE}/${tipo}/${tmdbId}?api_key=${TMDB_API_KEY}&language=pt-BR&append_to_response=${extras}`,
      { signal: controller.signal },
    );
    clearTimeout(timer);
    if (!r.ok) return null;
    const json = await r.json();

    const imdbId = typeof json?.external_ids?.imdb_id === 'string' && /^tt\d+$/i.test(json.external_ids.imdb_id.trim())
      ? json.external_ids.imdb_id.trim()
      : undefined;
    if (imdbId) {
      registrarVinculoTmdbImdb(series, tmdbId, imdbId);
    }

    const title = String(series ? (json.name || json.original_name || '') : (json.title || json.original_title || ''));
    const rawDate = String(series ? (json.first_air_date || '') : (json.release_date || ''));
    const year = rawDate.length >= 4 ? rawDate.slice(0, 4) : '';
    const generos: string[] = (json?.genres ?? []).map((g: any) => g.name).filter(Boolean);
    const poster = json?.poster_path ? `${IMG_BASE}w500${json.poster_path}` : '';
    const posterHD = json?.poster_path ? `${IMG_BASE}w780${json.poster_path}` : undefined;
    const backdrop = json?.backdrop_path ? `${IMG_BASE}w780${json.backdrop_path}` : undefined;
    const backdropHD = json?.backdrop_path ? `${IMG_BASE}original${json.backdrop_path}` : undefined;

    const equipe: TmdbPessoa[] = json?.credits?.crew ?? [];
    const elenco: TmdbPessoa[] = json?.credits?.cast ?? [];
    const criadores: TmdbPessoa[] = json?.created_by ?? [];
    const direcao = equipe.filter((p) => p.job === 'Director').map((p) => p.name);
    const roteiro = equipe
      .filter((p) => p.job === 'Screenplay' || p.job === 'Writer' || p.job === 'Story')
      .map((p) => p.name);
    const assinatura = direcao.length ? direcao : criadores.map((p) => p.name);

    let episodes: SeriesEpisodes | undefined;
    let totalSeasons: number | undefined;
    let totalEpisodes: number | undefined;

    if (series) {
      const seasons: Array<{ season_number: number; episode_count?: number }> = Array.isArray(json?.seasons)
        ? json.seasons.filter((s: any) => Number(s?.season_number) > 0)
        : [];
      totalSeasons = json?.number_of_seasons ?? (seasons.length || undefined);
      totalEpisodes = json?.number_of_episodes ?? undefined;
      episodes = {};
      // Carrega até as 6 primeiras temporadas em paralelo para UX instantânea na tela da série
      const carregarTemps = seasons.slice(0, 6);
      const epsPorTemp = await Promise.all(
        carregarTemps.map(async (s) => ({
          num: s.season_number,
          lista: await carregarEpisodiosTemporadaTmdb(tmdbId, s.season_number),
        })),
      );
      for (const { num, lista } of epsPorTemp) {
        if (lista.length > 0) {
          episodes[String(num)] = lista;
        }
      }
      // Preenche placeholders das temporadas restantes se existirem muitas
      for (const s of seasons.slice(6)) {
        const qtd = Number(s.episode_count || 0);
        if (qtd > 0) {
          episodes[String(s.season_number)] = Array.from({ length: qtd }, (_, i) => ({
            episode: i + 1,
            name: `Episódio ${i + 1}`,
            url: '',
            id: `tmdb|tv|${tmdbId}|${s.season_number}|${i + 1}`,
          }));
        }
      }
    }

    return {
      id: `tmdb|${tipo}|${tmdbId}`,
      name: title || `TMDB ${tmdbId}`,
      url: '',
      category: generos[0] || (series ? 'Séries' : 'Filmes'),
      categoryLabel: generos[0] || (series ? 'Séries' : 'Filmes'),
      type: tipo,
      isAdult: false,
      logo: poster || undefined,
      ...(imdbId ? { imdbId } : {}),
      ...(totalSeasons ? { totalSeasons } : {}),
      ...(totalEpisodes ? { totalEpisodes } : {}),
      ...(episodes ? { episodes } : {}),
      tmdb: {
        id: tmdbId,
        ...(imdbId ? { imdbId } : {}),
        title: title || `TMDB ${tmdbId}`,
        originalTitle: String(series ? (json.original_name || title) : (json.original_title || title)),
        tagline: json?.tagline || undefined,
        overview: json?.overview || '',
        status: json?.status || undefined,
        releaseDate: rawDate,
        year,
        runtime: series ? (json?.episode_run_time?.[0] as number | undefined) : (json?.runtime as number | undefined),
        rating: Number(json?.vote_average || 0),
        voteCount: Number(json?.vote_count || 0),
        popularity: Number(json?.popularity || 0),
        certification: certificacaoBR(json, tipo),
        genres: generos,
        poster,
        posterHD,
        backdrop,
        backdropHD,
        director: assinatura.slice(0, 2).join(', ') || undefined,
        writer: [...new Set(roteiro)].slice(0, 2).join(', ') || undefined,
        productionCompany: json?.production_companies?.[0]?.name || undefined,
        cast: elenco.slice(0, 20).map((p) => ({
          id: p.id,
          name: p.name,
          character: p.character || '',
          photo: p.profile_path ? `${IMG_BASE}w185${p.profile_path}` : null,
        })),
      },
    };
  } catch {
    return null;
  }
}

export async function carregarEpisodiosTemporadaTmdb(
  tmdbId: number,
  seasonNumber: number,
): Promise<Episode[]> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 7000);
    const r = await fetch(
      `${TMDB_BASE}/tv/${tmdbId}/season/${seasonNumber}?api_key=${TMDB_API_KEY}&language=pt-BR`,
      { signal: controller.signal },
    );
    clearTimeout(timer);
    if (!r.ok) return [];
    const json = await r.json();
    const eps: any[] = Array.isArray(json?.episodes) ? json.episodes : [];
    return eps.map((ep) => ({
      episode: Number(ep.episode_number || 0),
      name: String(ep.name || `Episódio ${ep.episode_number || ''}`),
      url: '',
      id: `tmdb|tv|${tmdbId}|${seasonNumber}|${ep.episode_number}`,
      ...(ep.still_path ? { logo: `${IMG_BASE}w500${ep.still_path}` } : {}),
    })).filter((e) => e.episode > 0);
  } catch {
    return [];
  }
}

/**
 * Descoberta via TMDB quando não há lista VOD configurada, mas há addons ativos.
 */
export async function carregarCatalogosDescobertaTMDB(
  filtro?: 'movie' | 'tv',
): Promise<MediaCategory[]> {
  const baseEndpoints: Array<{ id: string; name: string; tipo: 'movie' | 'tv'; url: string }> = [
    {
      id: 'tmdb:trending_movie',
      name: 'Filmes em Alta',
      tipo: 'movie',
      url: `${TMDB_BASE}/trending/movie/week?api_key=${TMDB_API_KEY}&language=pt-BR`,
    },
    {
      id: 'tmdb:trending_tv',
      name: 'Séries em Alta',
      tipo: 'tv',
      url: `${TMDB_BASE}/trending/tv/week?api_key=${TMDB_API_KEY}&language=pt-BR`,
    },
    {
      id: 'tmdb:popular_movie',
      name: 'Filmes Populares',
      tipo: 'movie',
      url: `${TMDB_BASE}/movie/popular?api_key=${TMDB_API_KEY}&language=pt-BR&region=BR`,
    },
    {
      id: 'tmdb:popular_tv',
      name: 'Séries Populares',
      tipo: 'tv',
      url: `${TMDB_BASE}/tv/popular?api_key=${TMDB_API_KEY}&language=pt-BR`,
    },
  ];
  const endpoints = baseEndpoints.filter((ep) => !filtro || ep.tipo === filtro);

  const resultados = await Promise.allSettled(
    endpoints.map(async (ep): Promise<MediaCategory | null> => {
      const r = await fetch(ep.url);
      if (!r.ok) return null;
      const json = await r.json();
      const lista = Array.isArray(json?.results) ? json.results : [];
      const items = lista
        .filter((x: any) => x?.id && (x?.title || x?.name))
        .slice(0, 20)
        .map((x: Record<string, unknown>) => tmdbResultadoParaMediaItem(x, ep.tipo, ep.name));
      if (items.length === 0) return null;
      return {
        id: ep.id,
        name: ep.name,
        items,
        lastUpdated: Date.now(),
      };
    }),
  );

  const saida: MediaCategory[] = [];
  for (const r of resultados) {
    if (r.status === 'fulfilled' && r.value !== null) {
      saida.push(r.value);
    }
  }
  return saida;
}

/**
 * Busca títulos no TMDB quando o usuário pesquisa sem lista VOD (com addons ativos).
 */
export async function buscarNoTMDB(query: string): Promise<MediaItem[]> {
  const termo = query.trim();
  if (!termo) return [];
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const r = await fetch(
      `${TMDB_BASE}/search/multi?api_key=${TMDB_API_KEY}&language=pt-BR&include_adult=false&query=${encodeURIComponent(termo)}`,
      { signal: controller.signal },
    );
    clearTimeout(timer);
    if (!r.ok) return [];
    const json = await r.json();
    const lista: any[] = Array.isArray(json?.results) ? json.results : [];
    return lista
      .filter((x) => (x?.media_type === 'movie' || x?.media_type === 'tv') && x?.id)
      .slice(0, 30)
      .map((x) =>
        tmdbResultadoParaMediaItem(
          x,
          x.media_type === 'tv' ? 'tv' : 'movie',
          x.media_type === 'tv' ? 'Séries' : 'Filmes',
        ),
      );
  } catch {
    return [];
  }
}

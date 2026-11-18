/** Adaptador do catálogo compartilhado por SaimoPlayer e SaimoTV-Android. */
import type { AddonMeta, Episode, MediaItem, SeriesEpisodes } from '../types';
import {
  analisarIdItemAddon,
  analisarIdItemTmdb,
  addonMetaParaMediaItem,
  buscarNosCatalogosAddons,
  carregarAddons,
  carregarCatalogosDosAddons,
  consultarMetaAddon,
  getAddonsAtivos,
  parseAnoReleaseInfo,
} from './addons';
import { baseFilmes } from './enderecos';
import { temAcervoDeListas } from './saimoSources';

/** Há filmes e séries: o endereço publicado ou o acervo de alguma lista do usuário. */
async function temFilmes(): Promise<boolean> {
  return !!(await baseFilmes()) || temAcervoDeListas();
}
import {
  clearSaimoSourceCache, getVodItem, loadVodCategory, loadVodIndex,
  loadVodCollection, parseVodId, searchVod, carregarDetalhes, detalheDe,
  loadCategorias,
  temCategoria,
  type CategoriaVod,
} from './saimoSources';
import {
  buscarNoTMDB,
  carregarCatalogosDescobertaTMDB,
  carregarItemTMDBCompleto,
  resolverTmdbPorImdb,
} from './tmdbService';

export interface APICategories {
  movies: { id: string; label: string; count: number }[];
  series: { id: string; label: string; count: number }[];
}
export interface CatalogResult {
  items: MediaItem[]; total: number; page: number; totalPages: number;
}

const CATEGORY_CACHE = new Map<string, MediaItem[]>();
const ITEM_CACHE = new Map<string, MediaItem>();
const PAGE_SIZE = 50;
const PREVIEW_SIZE = 20;
let stopRequested = false;

function categoryParts(categoryId: string): { type: 'movie' | 'series'; letter: string } | null {
  const match = /^(filmes|series)-(.+)$/.exec(categoryId);
  return match ? { type: match[1] === 'series' ? 'series' : 'movie', letter: match[2] } : null;
}

async function allCategoryIds(): Promise<string[]> {
  if (!(await temFilmes())) return [];
  const index = await loadVodIndex();
  // Animes e doramas são coleções do acervo publicado.
  const colecoes = (await baseFilmes()) ? ['animes', 'doramas'] : [];
  return [...colecoes, ...index.entries.flatMap(entry => [`filmes-${entry.letter}`, `series-${entry.letter}`])];
}

async function loadCategoryInternal(categoryId: string, force = false): Promise<MediaItem[]> {
  if (!force && CATEGORY_CACHE.has(categoryId)) return CATEGORY_CACHE.get(categoryId)!;
  if (!(await temFilmes())) return CATEGORY_CACHE.get(categoryId) ?? [];
  if (categoryId === 'animes' || categoryId === 'doramas') {
    const items = await loadVodCollection(categoryId, force);
    CATEGORY_CACHE.set(categoryId, items);
    for (const item of items) ITEM_CACHE.set(item.id, item);
    return items;
  }
  const parts = categoryParts(categoryId);
  if (!parts) return [];
  const items = await loadVodCategory(parts.type, parts.letter, force);
  CATEGORY_CACHE.set(categoryId, items);
  for (const item of items) ITEM_CACHE.set(item.id, item);
  return items;
}

export async function getHome(params: { p_items_per_category?: number; p_is_adult?: boolean } = {}) {
  const limit = params.p_items_per_category ?? PREVIEW_SIZE;
  const loaded = await loadAllPreviews(limit);
  return {
    categories: [...loaded.entries()].map(([id, items]) => ({
      id, label: items[0]?.categoryLabel || id,
      type: id.startsWith('series-') ? 'series' as const : 'movie' as const,
      items: items.slice(0, limit),
    })),
  };
}

export async function getCatalog(params: {
  p_page?: number; p_per_page?: number; p_type?: 'movie' | 'series';
  p_category?: string; p_search?: string; p_order_by?: 'rating' | 'new' | 'name' | 'popular';
  p_is_adult?: boolean;
  /** Filtros: gênero, faixa de anos, idade máxima (0 = Livre) e nota mínima. */
  p_genero?: string; p_anos?: [number, number]; p_idade?: number; p_nota?: number;
}): Promise<CatalogResult> {
  const page = Math.max(1, params.p_page ?? 1);
  const perPage = Math.max(1, params.p_per_page ?? PAGE_SIZE);
  // A lista filtrada e ordenada fica guardada: a página 2, 3... só corta.
  const { p_page: _p, p_per_page: _pp, ...resto } = params;
  const chave = JSON.stringify(resto);
  // Vale por dois minutos: o acervo pode ter sido atualizado nesse meio-tempo.
  const guardado = ultimoCatalogo && ultimoCatalogo.chave === chave && Date.now() - ultimoCatalogo.em < 120_000;
  const items = guardado && ultimoCatalogo ? ultimoCatalogo.items : await montarCatalogo(params);
  if (!guardado) ultimoCatalogo = { chave, items, em: Date.now() };
  const total = items.length;
  return {
    items: items.slice((page - 1) * perPage, page * perPage), total, page,
    totalPages: Math.max(1, Math.ceil(total / perPage)),
  };
}

let ultimoCatalogo: { chave: string; items: MediaItem[]; em: number } | null = null;

/** Ordena por uma chave calculada uma vez por título (e não a cada comparação). */
function ordenarPor<T extends number | string>(items: MediaItem[], chave: (i: MediaItem) => T, desc: boolean): MediaItem[] {
  const comChave = items.map((item, i) => ({ item, k: chave(item), i }));
  comChave.sort((a, b) => (a.k === b.k ? a.i - b.i : (a.k < b.k) !== desc ? -1 : 1));
  return comChave.map((x) => x.item);
}

function addonVideosParaEpisodes(meta: AddonMeta, itemId: string): SeriesEpisodes {
  const episodes: SeriesEpisodes = {};
  if (!Array.isArray(meta.videos)) return episodes;
  for (const v of meta.videos) {
    const season = typeof v.season === 'number' && v.season > 0 ? v.season : 1;
    const epNum = typeof v.episode === 'number' && v.episode > 0 ? v.episode : 0;
    if (!epNum) continue;
    const key = String(season);
    if (!episodes[key]) episodes[key] = [];
    const epObj: Episode = {
      episode: epNum,
      name: v.title || v.name || `Episódio ${epNum}`,
      url: '',
      id: `${itemId}|e|${season}:${epNum}`,
      ...(v.thumbnail ? { logo: v.thumbnail } : {}),
    };
    episodes[key].push(epObj);
  }
  for (const key of Object.keys(episodes)) {
    episodes[key].sort((a, b) => a.episode - b.episode);
  }
  return episodes;
}

async function resolverItemAddonOuTmdb(id: string): Promise<MediaItem | null> {
  const cached = ITEM_CACHE.get(id);
  if (cached) return cached;

  const tmdbParsed = analisarIdItemTmdb(id);
  if (tmdbParsed) {
    const item = await carregarItemTMDBCompleto(tmdbParsed.tmdbId, tmdbParsed.type === 'tv');
    if (item) {
      ITEM_CACHE.set(id, item);
      ITEM_CACHE.set(item.id, item);
    }
    return item;
  }

  const addonParsed = analisarIdItemAddon(id);
  if (!addonParsed) return null;

  const ehSerie = addonParsed.type === 'series';
  const [metaResp, ponteTmdb] = await Promise.all([
    consultarMetaAddon(addonParsed.type, [addonParsed.rawId], addonParsed.addonId).catch(() => null),
    resolverTmdbPorImdb(addonParsed.rawId, ehSerie).catch(() => null),
  ]);

  let tmdbItem: MediaItem | null = null;
  const tmdbId = ponteTmdb?.tmdbId
    ?? (metaResp?.meta?.tmdb_id ? Number(metaResp.meta.tmdb_id) : 0);

  if (tmdbId > 0) {
    tmdbItem = await carregarItemTMDBCompleto(tmdbId, ehSerie).catch(() => null);
  }

  if (tmdbItem && metaResp?.meta) {
    const addonEp = addonVideosParaEpisodes(metaResp.meta, id);
    const episodes = tmdbItem.episodes && Object.keys(tmdbItem.episodes).length > 0
      ? tmdbItem.episodes
      : (Object.keys(addonEp).length > 0 ? addonEp : undefined);
    const imdbFinal = metaResp.meta.imdb_id
      || (/^tt\d+$/i.test(addonParsed.rawId) ? addonParsed.rawId : undefined)
      || tmdbItem.imdbId;

    const combinado: MediaItem = {
      ...tmdbItem,
      id,
      ...(imdbFinal ? { imdbId: imdbFinal } : {}),
      addonId: addonParsed.addonId,
      addonRawId: addonParsed.rawId,
      addonMeta: metaResp.meta,
      ...(episodes ? { episodes } : {}),
      tmdb: tmdbItem.tmdb ? { ...tmdbItem.tmdb, ...(imdbFinal ? { imdbId: imdbFinal } : {}) } : tmdbItem.tmdb,
    };
    ITEM_CACHE.set(id, combinado);
    return combinado;
  }

  if (tmdbItem) {
    const combinado: MediaItem = {
      ...tmdbItem,
      id,
      addonId: addonParsed.addonId,
      addonRawId: addonParsed.rawId,
      ...(!tmdbItem.imdbId && /^tt\d+$/i.test(addonParsed.rawId) ? { imdbId: addonParsed.rawId } : {}),
    };
    ITEM_CACHE.set(id, combinado);
    return combinado;
  }

  if (metaResp?.meta) {
    const baseItem = addonMetaParaMediaItem(metaResp.meta, metaResp.addon, metaResp.addon.name);
    const episodes = ehSerie ? addonVideosParaEpisodes(metaResp.meta, id) : undefined;
    const itemFinal: MediaItem = {
      ...baseItem,
      id,
      ...(episodes && Object.keys(episodes).length > 0 ? { episodes } : {}),
    };
    ITEM_CACHE.set(id, itemFinal);
    return itemFinal;
  }

  return null;
}

async function montarCatalogoSemLista(params: Parameters<typeof getCatalog>[0]): Promise<MediaItem[]> {
  await carregarAddons();
  if (getAddonsAtivos().length === 0) return [];

  const filtroTipo = params.p_type === 'series' ? 'tv' : params.p_type === 'movie' ? 'movie' : undefined;
  let items: MediaItem[] = [];

  if (params.p_search?.trim()) {
    const [addonRes, tmdbRes] = await Promise.all([
      buscarNosCatalogosAddons(params.p_search),
      buscarNoTMDB(params.p_search),
    ]);
    const vistos = new Set<string>();
    for (const i of [...addonRes, ...tmdbRes]) {
      const k = `${i.type}:${i.imdbId || i.tmdb?.id || i.name.toLowerCase()}`;
      if (vistos.has(k)) continue;
      vistos.add(k);
      items.push(i);
    }
  } else {
    const [catsAddon, catsTmdb] = await Promise.all([
      carregarCatalogosDosAddons(filtroTipo),
      carregarCatalogosDescobertaTMDB(filtroTipo),
    ]);
    const vistos = new Set<string>();
    for (const c of [...catsAddon, ...catsTmdb]) {
      for (const i of c.items) {
        if (vistos.has(i.id)) continue;
        vistos.add(i.id);
        items.push(i);
      }
    }
  }

  if (filtroTipo) {
    items = items.filter((i) => i.type === filtroTipo);
  }
  if (params.p_genero) {
    items = items.filter((i) => (i.tmdb?.genres || []).includes(params.p_genero!));
  }
  if (params.p_anos) {
    items = items.filter((i) => {
      const a = Number(i.tmdb?.year || parseAnoReleaseInfo(i.addonMeta?.releaseInfo)) || 0;
      return a >= params.p_anos![0] && a <= params.p_anos![1];
    });
  }
  if (params.p_nota) {
    items = items.filter((i) => (i.tmdb?.rating ?? 0) >= params.p_nota!);
  }

  if (params.p_order_by === 'name') {
    items = ordenarPor(items, (i) => i.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(), false);
  } else if (params.p_order_by === 'new') {
    items = ordenarPor(items, (i) => Number(i.tmdb?.year) || 0, true);
  } else if (params.p_order_by === 'rating') {
    items = ordenarPor(items, (i) => i.tmdb?.rating || 0, true);
  } else if (params.p_order_by === 'popular') {
    items = ordenarPor(items, (i) => i.tmdb?.popularity || 0, true);
  }
  return items;
}

const CATEGORIA_DO_FILTRO: Record<string, CategoriaVod> = {
  animes: 'anime',
  doramas: 'dorama',
  novelas: 'novela',
  kids: 'kids',
};

/**
 * Animes, doramas, novelas e kids: os títulos do acervo marcados no
 * categorias.txt. Animes e doramas somam-se às coleções da RedeFlix, sem
 * repetir o mesmo nome.
 */
async function acervoDaCategoria(filtro: string, categoria: CategoriaVod, tipo?: 'movie' | 'series'): Promise<MediaItem[]> {
  const [mapa, acervo, colecao] = await Promise.all([
    loadCategorias(),
    searchVod('', tipo, Number.MAX_SAFE_INTEGER),
    filtro === 'animes' || filtro === 'doramas' ? loadCategoryInternal(filtro).catch(() => [] as MediaItem[]) : Promise.resolve([] as MediaItem[]),
  ]);
  const nome = (t: string) => t.replace(/\s*\(\d{4}\)\s*$/, '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const vistos = new Set(colecao.map((i) => nome(i.name)));
  const doAcervo = acervo.filter((i) => {
    if (!temCategoria(mapa, i.name, i.type === 'tv', categoria)) return false;
    const n = `${i.type}|${nome(i.name)}`;
    if (vistos.has(nome(i.name)) || vistos.has(n)) return false;
    vistos.add(n);
    return true;
  });
  return [...colecao, ...doAcervo];
}

async function montarCatalogo(params: Parameters<typeof getCatalog>[0]): Promise<MediaItem[]> {
  if (!(await temFilmes())) {
    return montarCatalogoSemLista(params);
  }

  const filtra = !!(params.p_genero || params.p_anos || params.p_idade !== undefined || params.p_nota);
  const precisaDetalhes = filtra || params.p_order_by === 'rating' || params.p_order_by === 'popular' || params.p_order_by === 'new';
  // Filtrando, ordenando ou navegando sem texto, o acervo inteiro entra (sem o
  // corte de 500 da busca): senão "até 12 anos" sairia só dos primeiros títulos.
  const limite = precisaDetalhes || !params.p_search?.trim() ? Number.MAX_SAFE_INTEGER : undefined;
  let items: MediaItem[];
  const categoria = CATEGORIA_DO_FILTRO[params.p_category || ''];
  if (params.p_search?.trim()) items = await searchVod(params.p_search, params.p_type, limite);
  else if (categoria) items = await acervoDaCategoria(params.p_category!, categoria, params.p_type);
  else if (params.p_category && categoryParts(params.p_category)) items = await loadCategoryInternal(params.p_category);
  else items = await searchVod('', params.p_type, limite);

  if (precisaDetalhes) await carregarDetalhes();
  const anoDe = (i: MediaItem) => detalheDe(i)?.ano || Number(i.tmdb?.year) || 0;
  if (filtra) {
    items = items.filter((i) => {
      if (params.p_genero && !(i.tmdb?.genres || []).includes(params.p_genero)) return false;
      const d = detalheDe(i);
      if (params.p_anos) { const a = anoDe(i); if (a < params.p_anos[0] || a > params.p_anos[1]) return false; }
      if (params.p_idade !== undefined && !(d && d.idade >= 0 && d.idade <= params.p_idade)) return false;
      if (params.p_nota && !(d && d.nota >= params.p_nota)) return false;
      return true;
    });
  }
  if (params.p_order_by === 'name') {
    items = ordenarPor(items, (i) => i.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(), false);
  } else if (params.p_order_by === 'new') items = ordenarPor(items, anoDe, true);
  else if (params.p_order_by === 'rating') items = ordenarPor(items, (i) => detalheDe(i)?.nota || 0, true);
  else if (params.p_order_by === 'popular') items = ordenarPor(items, (i) => detalheDe(i)?.popularidade || 0, true);
  return items;
}

export function invalidateItemCache(id: string): void { ITEM_CACHE.delete(id); }

export async function getItemAPI(id: string): Promise<MediaItem> {
  let rootId = id.includes('|e|') ? id.split('|e|')[0] : id;
  if (rootId.startsWith('tmdb|')) {
    const p = rootId.split('|');
    if (p.length >= 3) rootId = `tmdb|${p[1]}|${p[2]}`;
  }

  if (analisarIdItemAddon(rootId) || analisarIdItemTmdb(rootId)) {
    const resolvido = await resolverItemAddonOuTmdb(rootId);
    if (resolvido) return resolvido;
    throw new Error(`Item de addon indisponível: ${id}`);
  }

  const parsed = parseVodId(rootId);
  if (!parsed) throw new Error(`Item desconhecido: ${id}`);
  const cached = ITEM_CACHE.get(rootId);
  if (cached?.url && cached.tmdb?.poster && parsed.type === 'movie') return cached;
  if (cached?.episodes && parsed.type === 'series') return cached;
  const item = await getVodItem(rootId);
  ITEM_CACHE.set(rootId, item);
  return item;
}

export async function getCategories(): Promise<APICategories> {
  if (!(await temFilmes())) {
    const movies: { id: string; label: string; count: number }[] = [];
    const series: { id: string; label: string; count: number }[] = [];
    for (const [id, items] of CATEGORY_CACHE.entries()) {
      const label = items[0]?.categoryLabel || id;
      const ehSerie = items.some((i) => i.type === 'tv');
      if (ehSerie) series.push({ id, label, count: items.length });
      else movies.push({ id, label, count: items.length });
    }
    return { movies, series };
  }
  const index = await loadVodIndex();
  return {
    movies: index.entries.map(e => ({ id: `filmes-${e.letter}`, label: `Filmes • ${e.letter}`, count: e.movies })),
    series: index.entries.map(e => ({ id: `series-${e.letter}`, label: `Séries • ${e.letter}`, count: e.series })),
  };
}

export async function getFilmography(_params: { p_actor_id?: number; p_actor?: string; p_page?: number }): Promise<CatalogResult> {
  return { items: [], total: 0, page: 1, totalPages: 1 };
}

/** Carrega oito letras primeiro; as restantes entram em background. Quando só há addons, carrega catálogos + descoberta TMDB. */
export async function loadAllPreviews(limit = PREVIEW_SIZE): Promise<Map<string, MediaItem[]>> {
  if (CATEGORY_CACHE.size) return getAllLoadedCategories(limit);
  stopRequested = false;

  if (!(await temFilmes())) {
    await carregarAddons();
    if (getAddonsAtivos().length === 0) return new Map();

    const [catsAddon, catsTmdb] = await Promise.all([
      carregarCatalogosDosAddons().catch(() => []),
      carregarCatalogosDescobertaTMDB().catch(() => []),
    ]);

    for (const cat of [...catsAddon, ...catsTmdb]) {
      const rotuladas = cat.items.map((item) => ({
        ...item,
        categoryLabel: cat.name,
        category: cat.name,
      }));
      CATEGORY_CACHE.set(cat.id, rotuladas);
      for (const item of rotuladas) ITEM_CACHE.set(item.id, item);
    }
    return getAllLoadedCategories(limit);
  }

  const ids = (await allCategoryIds()).slice(0, 16);
  await Promise.all(ids.map(async id => {
    try { await loadCategoryInternal(id); }
    catch (error) { console.warn('[SaimoVOD] Falha na categoria', id, error); }
  }));
  return getAllLoadedCategories(limit);
}

export async function fetchCategoryPage(categoryId: string, page: number): Promise<MediaItem[]> {
  const items = await loadCategoryInternal(categoryId);
  return items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
}
export function getCategoryItems(categoryId: string): MediaItem[] { return CATEGORY_CACHE.get(categoryId) ?? []; }
export function categoryHasMore(categoryId: string): boolean { return (CATEGORY_CACHE.get(categoryId)?.length ?? 0) > PAGE_SIZE; }
export async function loadNextPage(categoryId: string) {
  return { items: await loadCategoryInternal(categoryId), hasMore: false };
}

export function searchInLoadedData(query: string): MediaItem[] {
  const wanted = query.trim().toLocaleLowerCase('pt-BR');
  const seen = new Set<string>();
  const result: MediaItem[] = [];
  for (const items of CATEGORY_CACHE.values()) for (const item of items) {
    if (seen.has(item.id) || (wanted && !item.name.toLocaleLowerCase('pt-BR').includes(wanted))) continue;
    seen.add(item.id); result.push(item);
  }
  return result;
}
export function getAllLoadedCategories(limit?: number): Map<string, MediaItem[]> {
  return new Map([...CATEGORY_CACHE.entries()].map(([id, items]) => [id, limit ? items.slice(0, limit) : items]));
}
export function getTotalLoadedCount(): number {
  let total = 0; for (const items of CATEGORY_CACHE.values()) total += items.length; return total;
}
/** Esquece o que foi carregado da lista de filmes e séries (memória e disco). */
export function clearAllCaches(): void {
  CATEGORY_CACHE.clear(); ITEM_CACHE.clear(); void clearSaimoSourceCache('filmes');
}
export async function stopLoading(): Promise<void> { stopRequested = true; }

export async function startBackgroundLoading(onProgress?: () => void): Promise<void> {
  stopRequested = false;
  const pending = (await allCategoryIds()).filter(id => !CATEGORY_CACHE.has(id));
  for (let offset = 0; offset < pending.length && !stopRequested; offset += 4) {
    await Promise.all(pending.slice(offset, offset + 4).map(async id => {
      try { await loadCategoryInternal(id); }
      catch (error) { console.warn('[SaimoVOD] Falha no background', id, error); }
    }));
    onProgress?.();
  }
}

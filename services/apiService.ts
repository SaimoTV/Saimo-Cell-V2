/** Adaptador do catálogo compartilhado por SaimoPlayer e SaimoTV-Android. */
import type { MediaItem } from '../types';
import {
  clearSaimoSourceCache, getVodItem, loadVodCategory, loadVodIndex,
  loadVodCollection, parseVodId, searchVod,
} from './saimoSources';

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
  const index = await loadVodIndex();
  return ['animes', 'doramas', ...index.entries.flatMap(entry => [`filmes-${entry.letter}`, `series-${entry.letter}`])];
}

async function loadCategoryInternal(categoryId: string, force = false): Promise<MediaItem[]> {
  if (!force && CATEGORY_CACHE.has(categoryId)) return CATEGORY_CACHE.get(categoryId)!;
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
  p_category?: string; p_search?: string; p_order_by?: 'rating' | 'new' | 'name';
  p_is_adult?: boolean;
}): Promise<CatalogResult> {
  const page = Math.max(1, params.p_page ?? 1);
  const perPage = Math.max(1, params.p_per_page ?? PAGE_SIZE);
  let items: MediaItem[];
  if (params.p_search?.trim()) items = await searchVod(params.p_search, params.p_type);
  else if (params.p_category && categoryParts(params.p_category)) items = await loadCategoryInternal(params.p_category);
  else items = await searchVod('', params.p_type);

  if (params.p_order_by === 'name') items = [...items].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  else if (params.p_order_by === 'new') items = [...items].sort((a, b) => (b.tmdb?.year || '').localeCompare(a.tmdb?.year || ''));
  const total = items.length;
  return {
    items: items.slice((page - 1) * perPage, page * perPage), total, page,
    totalPages: Math.max(1, Math.ceil(total / perPage)),
  };
}

export function invalidateItemCache(id: string): void { ITEM_CACHE.delete(id); }

export async function getItemAPI(id: string): Promise<MediaItem> {
  const rootId = id.includes('|e|') ? id.split('|e|')[0] : id;
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
  const index = await loadVodIndex();
  return {
    movies: index.entries.map(e => ({ id: `filmes-${e.letter}`, label: `Filmes • ${e.letter}`, count: e.movies })),
    series: index.entries.map(e => ({ id: `series-${e.letter}`, label: `Séries • ${e.letter}`, count: e.series })),
  };
}

export async function getFilmography(_params: { p_actor_id?: number; p_actor?: string; p_page?: number }): Promise<CatalogResult> {
  return { items: [], total: 0, page: 1, totalPages: 1 };
}

/** Carrega oito letras primeiro; as restantes entram em background. */
export async function loadAllPreviews(limit = PREVIEW_SIZE): Promise<Map<string, MediaItem[]>> {
  if (CATEGORY_CACHE.size) return getAllLoadedCategories(limit);
  stopRequested = false;
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

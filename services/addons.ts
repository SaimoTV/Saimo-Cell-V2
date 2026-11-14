import AsyncStorage from '@react-native-async-storage/async-storage';
import type {
  AddonCatalogDef,
  AddonManifest,
  AddonMeta,
  AddonStream,
  AddonStreamResolved,
  AddonSubtitle,
  AddonSyncEntry,
  InstalledAddon,
  MediaCategory,
  MediaItem,
} from '../types';
import {
  addonSuportaRecurso,
  catalogoExigeExtraObrigatorioSemSerBusca,
  catalogoSuportaBusca,
  classificarStreamAddon,
  construirUrlRecursoAddon,
  criarIdItemAddon,
  criarPlaceholderAddon,
  ErroAddon,
  escolherIdParaAddon,
  extrairTmdbImdbDeAddonMeta,
  normalizarUrlAddon,
  parseAnoReleaseInfo,
  validarManifestoAddon,
  type AddonExtraParam,
} from './addonsCore';

export * from './addonsCore';

export const CHAVE_STORAGE_ADDONS = 'saimo_addons_v1';
const PRAZO_REDE_MS = 12_000;
const PRAZO_STREAM_MS = 15_000;

let listaAddons: InstalledAddon[] = [];
let carregadoPromise: Promise<InstalledAddon[]> | null = null;
const ouvintes = new Set<() => void>();
let hidratando = false;

function emitir(): void {
  ouvintes.forEach((fn) => {
    try {
      fn();
    } catch {
      // ignora erro de ouvinte isolado
    }
  });
}

function normalizarOrdem(items: InstalledAddon[]): InstalledAddon[] {
  return [...items]
    .sort((a, b) => a.order - b.order || a.addedAt - b.addedAt)
    .map((item, idx) => ({
      ...item,
      url: item.transportUrl,
      order: idx,
    }));
}

async function persistir(): Promise<void> {
  listaAddons = normalizarOrdem(listaAddons);
  try {
    await AsyncStorage.setItem(CHAVE_STORAGE_ADDONS, JSON.stringify(listaAddons));
  } catch {
    // mantém em memória mesmo se o disco falhar
  }
  emitir();
}

async function fetchJsonComPrazo<T>(url: string, prazoMs = PRAZO_REDE_MS): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), prazoMs);
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new ErroAddon(`Servidor retornou HTTP ${res.status}.`, 'HTTP_ERRO');
    }
    const texto = await res.text();
    try {
      return JSON.parse(texto) as T;
    } catch {
      throw new ErroAddon('Resposta inválida: o endereço não retornou JSON válido.', 'JSON_INVALIDO');
    }
  } catch (err) {
    if (err instanceof ErroAddon) throw err;
    const msg = err instanceof Error && err.name === 'AbortError'
      ? 'Tempo limite esgotado ao consultar o addon.'
      : 'Não foi possível conectar ao endereço do addon.';
    throw new ErroAddon(msg, 'REDE_ERRO');
  } finally {
    clearTimeout(timer);
  }
}

function normalizarItemPersistido(raw: unknown, idx: number): InstalledAddon | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  const rawUrl = typeof obj.transportUrl === 'string'
    ? obj.transportUrl
    : (typeof obj.url === 'string' ? obj.url : '');
  if (!rawUrl) return null;

  try {
    const parsed = normalizarUrlAddon(rawUrl);
    if (obj.manifest && typeof obj.manifest === 'object') {
      try {
        const manifest = validarManifestoAddon(obj.manifest);
        return {
          id: manifest.id,
          name: manifest.name,
          version: manifest.version,
          ...(manifest.description ? { description: manifest.description } : {}),
          ...(manifest.logo ? { logo: manifest.logo } : {}),
          transportUrl: parsed.transportUrl,
          url: parsed.transportUrl,
          baseUrl: parsed.baseUrl,
          enabled: typeof obj.enabled === 'boolean' ? obj.enabled : true,
          order: typeof obj.order === 'number' ? obj.order : idx,
          manifest,
          addedAt: typeof obj.addedAt === 'number' ? obj.addedAt : Date.now(),
          hydrated: typeof obj.hydrated === 'boolean' ? obj.hydrated : true,
        };
      } catch {
        // cai para placeholder e rehidrata em seguida
      }
    }
    return criarPlaceholderAddon(parsed.transportUrl, {
      id: typeof obj.id === 'string' ? obj.id : undefined,
      name: typeof obj.name === 'string' ? obj.name : undefined,
      enabled: typeof obj.enabled === 'boolean' ? obj.enabled : true,
      order: typeof obj.order === 'number' ? obj.order : idx,
    });
  } catch {
    return null;
  }
}

export function aoMudarAddons(fn: () => void): () => void {
  ouvintes.add(fn);
  return () => {
    ouvintes.delete(fn);
  };
}

export function getAddons(): InstalledAddon[] {
  return listaAddons;
}

export function getAddonsAtivos(): InstalledAddon[] {
  return listaAddons.filter((a) => a.enabled);
}

export function temAddonAtivo(): boolean {
  return listaAddons.some((a) => a.enabled);
}

/**
 * Carrega addons salvos em AsyncStorage (`saimo_addons_v1`).
 * Inicia 100% vazio na primeira execução (sem addons pré-instalados).
 */
export async function carregarAddons(): Promise<InstalledAddon[]> {
  if (!carregadoPromise) {
    carregadoPromise = (async () => {
      try {
        const bruto = await AsyncStorage.getItem(CHAVE_STORAGE_ADDONS);
        if (bruto) {
          const arr = JSON.parse(bruto);
          if (Array.isArray(arr)) {
            const itens = arr
              .map((item, idx) => normalizarItemPersistido(item, idx))
              .filter((x): x is InstalledAddon => x !== null);
            listaAddons = normalizarOrdem(itens);
          }
        }
      } catch {
        listaAddons = [];
      }
      emitir();
      if (listaAddons.some((a) => a.hydrated === false)) {
        void hidratarAddonsPendentes();
      }
      return listaAddons;
    })();
  }
  return carregadoPromise;
}

/**
 * Busca e valida um manifest.json Stremio a partir de qualquer URL http/https/stremio.
 */
export async function buscarManifestoAddon(entradaUrl: string): Promise<{
  parsed: ReturnType<typeof normalizarUrlAddon>;
  manifest: AddonManifest;
}> {
  const parsed = normalizarUrlAddon(entradaUrl);
  const json = await fetchJsonComPrazo<unknown>(parsed.transportUrl);
  const manifest = validarManifestoAddon(json);
  return { parsed, manifest };
}

/**
 * Instala (ou atualiza se já existir pelo mesmo id/transportUrl) um addon Stremio.
 */
export async function instalarAddon(entradaUrl: string): Promise<InstalledAddon> {
  await carregarAddons();
  const { parsed, manifest } = await buscarManifestoAddon(entradaUrl);

  const existenteIdx = listaAddons.findIndex(
    (a) => a.transportUrl === parsed.transportUrl || a.id === manifest.id,
  );

  const novo: InstalledAddon = {
    id: manifest.id,
    name: manifest.name,
    version: manifest.version,
    ...(manifest.description ? { description: manifest.description } : {}),
    ...(manifest.logo ? { logo: manifest.logo } : {}),
    transportUrl: parsed.transportUrl,
    url: parsed.transportUrl,
    baseUrl: parsed.baseUrl,
    enabled: existenteIdx >= 0 ? listaAddons[existenteIdx].enabled : true,
    order: existenteIdx >= 0 ? listaAddons[existenteIdx].order : listaAddons.length,
    manifest,
    addedAt: existenteIdx >= 0 ? listaAddons[existenteIdx].addedAt : Date.now(),
    hydrated: true,
  };

  if (existenteIdx >= 0) {
    listaAddons = listaAddons.map((a, idx) => (idx === existenteIdx ? novo : a));
  } else {
    listaAddons = [...listaAddons, novo];
  }

  await persistir();
  return listaAddons.find((a) => a.id === novo.id || a.transportUrl === novo.transportUrl) ?? novo;
}

export async function toggleAddon(idOrUrl: string, enabled?: boolean): Promise<void> {
  await carregarAddons();
  let mudou = false;
  listaAddons = listaAddons.map((a) => {
    if (a.id === idOrUrl || a.transportUrl === idOrUrl) {
      mudou = true;
      return { ...a, enabled: typeof enabled === 'boolean' ? enabled : !a.enabled };
    }
    return a;
  });
  if (mudou) await persistir();
}

export async function moverAddon(idOrUrl: string, direcao: 'up' | 'down'): Promise<void> {
  await carregarAddons();
  const ordenados = normalizarOrdem(listaAddons);
  const idx = ordenados.findIndex((a) => a.id === idOrUrl || a.transportUrl === idOrUrl);
  if (idx === -1) return;
  const alvo = direcao === 'up' ? idx - 1 : idx + 1;
  if (alvo < 0 || alvo >= ordenados.length) return;

  const copia = [...ordenados];
  const [removido] = copia.splice(idx, 1);
  copia.splice(alvo, 0, removido);
  listaAddons = copia.map((item, i) => ({ ...item, order: i }));
  await persistir();
}

export async function removerAddon(idOrUrl: string): Promise<void> {
  await carregarAddons();
  const antes = listaAddons.length;
  listaAddons = listaAddons.filter((a) => a.id !== idOrUrl && a.transportUrl !== idOrUrl);
  if (listaAddons.length !== antes) {
    await persistir();
  }
}

export async function hidratarAddonsPendentes(): Promise<void> {
  if (hidratando) return;
  hidratando = true;
  try {
    const pendentes = listaAddons.filter((a) => a.hydrated === false);
    if (pendentes.length === 0) return;

    let atualizouAlgum = false;
    await Promise.allSettled(
      pendentes.map(async (addon) => {
        try {
          const { parsed, manifest } = await buscarManifestoAddon(addon.transportUrl);
          listaAddons = listaAddons.map((atual) =>
            atual.transportUrl === addon.transportUrl
              ? {
                  ...atual,
                  id: manifest.id,
                  name: manifest.name,
                  version: manifest.version,
                  ...(manifest.description ? { description: manifest.description } : {}),
                  ...(manifest.logo ? { logo: manifest.logo } : {}),
                  transportUrl: parsed.transportUrl,
                  url: parsed.transportUrl,
                  baseUrl: parsed.baseUrl,
                  manifest,
                  hydrated: true,
                }
              : atual,
          );
          atualizouAlgum = true;
        } catch {
          // addon pode estar offline no momento; preserva placeholder para tentar depois
        }
      }),
    );

    if (atualizouAlgum) {
      await persistir();
    }
  } finally {
    hidratando = false;
  }
}

export function exportarAddonsParaSync(): AddonSyncEntry[] {
  return normalizarOrdem(listaAddons).map((a, idx) => ({
    url: a.transportUrl,
    transportUrl: a.transportUrl,
    enabled: a.enabled,
    order: idx,
    id: a.id,
    name: a.name,
  }));
}

/**
 * Aplica lista vinda do Saimo Connect apenas quando o campo "addons" chega explicitamente como array.
 * Aceita tanto `transportUrl` quanto `url` e hidrata manifestos faltantes em segundo plano.
 */
export async function aplicarAddonsRemotos(rawAddons: unknown): Promise<boolean> {
  if (!Array.isArray(rawAddons)) return false;
  await carregarAddons();

  const existentesPorUrl = new Map<string, InstalledAddon>();
  for (const a of listaAddons) {
    existentesPorUrl.set(a.transportUrl, a);
  }

  const novos: InstalledAddon[] = [];
  const vistos = new Set<string>();

  for (let i = 0; i < rawAddons.length; i++) {
    const entrada = rawAddons[i];
    if (!entrada || typeof entrada !== 'object') continue;
    const obj = entrada as Record<string, unknown>;
    const rawUrl = typeof obj.transportUrl === 'string' && obj.transportUrl.trim()
      ? obj.transportUrl
      : (typeof obj.url === 'string' ? obj.url : '');
    if (!rawUrl.trim()) continue;

    let parsed: ReturnType<typeof normalizarUrlAddon>;
    try {
      parsed = normalizarUrlAddon(rawUrl);
    } catch {
      continue;
    }
    if (vistos.has(parsed.transportUrl)) continue;
    vistos.add(parsed.transportUrl);

    const ordem = typeof obj.order === 'number' ? obj.order : i;
    const ativo = typeof obj.enabled === 'boolean' ? obj.enabled : true;
    const existente = existentesPorUrl.get(parsed.transportUrl);

    if (existente && existente.hydrated !== false) {
      novos.push({
        ...existente,
        enabled: ativo,
        order: ordem,
      });
    } else if (obj.manifest && typeof obj.manifest === 'object') {
      try {
        const manifest = validarManifestoAddon(obj.manifest);
        novos.push({
          id: manifest.id,
          name: manifest.name,
          version: manifest.version,
          ...(manifest.description ? { description: manifest.description } : {}),
          ...(manifest.logo ? { logo: manifest.logo } : {}),
          transportUrl: parsed.transportUrl,
          url: parsed.transportUrl,
          baseUrl: parsed.baseUrl,
          enabled: ativo,
          order: ordem,
          manifest,
          addedAt: existente?.addedAt ?? Date.now(),
          hydrated: true,
        });
        continue;
      } catch {
        // se manifesto veio inválido, cai para placeholder e hidrata depois
      }
    }

    if (!novos.some((n) => n.transportUrl === parsed.transportUrl)) {
      novos.push(
        criarPlaceholderAddon(parsed.transportUrl, {
          id: typeof obj.id === 'string' ? obj.id : undefined,
          name: typeof obj.name === 'string' ? obj.name : undefined,
          enabled: ativo,
          order: ordem,
        }),
      );
    }
  }

  listaAddons = normalizarOrdem(novos);
  await persistir();
  if (listaAddons.some((a) => a.hydrated === false)) {
    void hidratarAddonsPendentes();
  }
  return true;
}

/**
 * Converte um AddonMeta (de catálogo ou /meta/) em MediaItem compatível com cards, detalhes e favoritos.
 */
export function addonMetaParaMediaItem(
  meta: AddonMeta,
  addonInfo: { id: string; name: string },
  categoriaRotulo?: string,
): MediaItem {
  const tipoSaimo: 'movie' | 'tv' = meta.type === 'series' ? 'tv' : 'movie';
  const ids = extrairTmdbImdbDeAddonMeta(meta);
  const ano = parseAnoReleaseInfo(meta.releaseInfo);
  const ratingNum = typeof meta.imdbRating === 'number'
    ? meta.imdbRating
    : Number(String(meta.imdbRating ?? '0').replace(',', '.')) || 0;

  return {
    id: criarIdItemAddon(meta.type, addonInfo.id, meta.id),
    name: meta.name || meta.id,
    url: '',
    category: categoriaRotulo || addonInfo.name,
    categoryLabel: categoriaRotulo || addonInfo.name,
    type: tipoSaimo,
    isAdult: false,
    logo: meta.poster || meta.background || meta.logo,
    ...(ids.imdbId ? { imdbId: ids.imdbId } : {}),
    addonId: addonInfo.id,
    addonRawId: meta.id,
    addonMeta: meta,
    tmdb: {
      id: ids.tmdbId ?? 0,
      ...(ids.imdbId ? { imdbId: ids.imdbId } : {}),
      title: meta.name || meta.id,
      overview: meta.description || '',
      year: ano,
      rating: Number.isFinite(ratingNum) ? ratingNum : 0,
      genres: Array.isArray(meta.genres) ? meta.genres : [],
      poster: meta.poster || '',
      posterHD: meta.poster,
      backdrop: meta.background || meta.poster,
      backdropHD: meta.background || meta.poster,
      logo: meta.logo,
      cast: (Array.isArray(meta.cast) ? meta.cast : []).slice(0, 12).map((nome, idx) => ({
        id: idx + 1,
        name: nome,
        character: '',
        photo: null,
      })),
      ...(Array.isArray(meta.director) && meta.director.length > 0 ? { director: meta.director.join(', ') } : {}),
      ...(Array.isArray(meta.writer) && meta.writer.length > 0 ? { writer: meta.writer.join(', ') } : {}),
    },
  };
}

/**
 * Consulta /catalog/{type}/{id}/{extra}.json de um addon específico.
 */
export async function consultarCatalogoAddon(
  addon: InstalledAddon,
  catalog: AddonCatalogDef,
  extra?: AddonExtraParam,
): Promise<MediaItem[]> {
  const url = construirUrlRecursoAddon(addon, 'catalog', catalog.type, catalog.id, extra);
  const json = await fetchJsonComPrazo<{ metas?: AddonMeta[] }>(url);
  const metas = Array.isArray(json?.metas) ? json.metas : [];
  const categoria = catalog.name ? `${addon.name} · ${catalog.name}` : addon.name;
  return metas
    .filter((m) => m && typeof m === 'object' && m.id && m.name)
    .map((m) => addonMetaParaMediaItem(m, addon, categoria));
}

/**
 * Carrega catálogos padrão (sem extra obrigatório) de todos os addons habilitados.
 */
export async function carregarCatalogosDosAddons(
  filtroTipo?: 'movie' | 'tv',
  limiteCatalogos = 10,
): Promise<MediaCategory[]> {
  await carregarAddons();
  const ativos = getAddonsAtivos();
  if (ativos.length === 0) return [];

  const tarefas: Array<{ addon: InstalledAddon; catalog: AddonCatalogDef }> = [];
  for (const addon of ativos) {
    for (const catalog of addon.manifest.catalogs) {
      if (catalog.type !== 'movie' && catalog.type !== 'series') continue;
      if (filtroTipo === 'movie' && catalog.type !== 'movie') continue;
      if (filtroTipo === 'tv' && catalog.type !== 'series') continue;
      if (catalogoExigeExtraObrigatorioSemSerBusca(catalog)) continue;
      // Catálogos exclusivos de busca exigem termo para responder
      const soBusca = catalog.extra?.every((e) => e.name === 'search' && e.isRequired);
      if (soBusca) continue;

      tarefas.push({ addon, catalog });
      if (tarefas.length >= limiteCatalogos) break;
    }
    if (tarefas.length >= limiteCatalogos) break;
  }

  const resultados = await Promise.allSettled(
    tarefas.map(async ({ addon, catalog }): Promise<MediaCategory> => {
      const items = await consultarCatalogoAddon(addon, catalog);
      const tipoTag = catalog.type === 'series' ? 'Séries' : 'Filmes';
      const nome = catalog.name ? `${catalog.name} · ${addon.name}` : `${addon.name} (${tipoTag})`;
      return {
        id: `addoncat:${addon.id}:${catalog.type}:${catalog.id}`,
        name: nome,
        items,
        lastUpdated: Date.now(),
      };
    }),
  );

  const saida: MediaCategory[] = [];
  for (const r of resultados) {
    if (r.status === 'fulfilled' && r.value.items.length > 0) {
      saida.push(r.value);
    }
  }
  return saida;
}

/**
 * Busca em catálogos de addons que declaram suporte a `search`.
 */
export async function buscarNosCatalogosAddons(query: string): Promise<MediaItem[]> {
  const termo = query.trim();
  if (!termo) return [];
  await carregarAddons();
  const ativos = getAddonsAtivos();
  if (ativos.length === 0) return [];

  const tarefas: Array<{ addon: InstalledAddon; catalog: AddonCatalogDef }> = [];
  for (const addon of ativos) {
    for (const catalog of addon.manifest.catalogs) {
      if (catalog.type !== 'movie' && catalog.type !== 'series') continue;
      if (!catalogoSuportaBusca(catalog)) continue;
      tarefas.push({ addon, catalog });
    }
  }

  if (tarefas.length === 0) return [];

  const resultados = await Promise.allSettled(
    tarefas.slice(0, 8).map(({ addon, catalog }) => consultarCatalogoAddon(addon, catalog, { search: termo })),
  );

  const saida: MediaItem[] = [];
  const vistos = new Set<string>();
  for (const r of resultados) {
    if (r.status !== 'fulfilled') continue;
    for (const item of r.value) {
      const chave = `${item.type}:${item.imdbId || item.addonRawId || item.name.toLowerCase()}`;
      if (vistos.has(chave)) continue;
      vistos.add(chave);
      saida.push(item);
    }
  }
  return saida;
}

/**
 * Consulta /meta/{type}/{id}.json no addon de origem ou em qualquer addon ativo com recurso `meta`.
 */
export async function consultarMetaAddon(
  type: 'movie' | 'series',
  candidatosId: Array<string | undefined | null>,
  addonPreferidoId?: string,
): Promise<{ meta: AddonMeta; addon: InstalledAddon } | null> {
  await carregarAddons();
  const ativos = getAddonsAtivos();
  const ordenados = addonPreferidoId
    ? [
        ...ativos.filter((a) => a.id === addonPreferidoId),
        ...ativos.filter((a) => a.id !== addonPreferidoId),
      ]
    : ativos;

  for (const addon of ordenados) {
    const idEscolhido = escolherIdParaAddon(addon.manifest, 'meta', type, candidatosId);
    if (!idEscolhido) continue;
    try {
      const url = construirUrlRecursoAddon(addon, 'meta', type, idEscolhido);
      const json = await fetchJsonComPrazo<{ meta?: AddonMeta }>(url);
      if (json?.meta && json.meta.name) {
        return { meta: json.meta, addon };
      }
    } catch {
      // tenta próximo addon com recurso meta
    }
  }
  return null;
}

/**
 * Consulta /stream/{type}/{id}.json em todos os addons habilitados que suportam o recurso `stream`.
 */
export async function buscarStreamsAddons(params: {
  type: 'movie' | 'series';
  imdbId?: string;
  tmdbId?: number;
  addonRawId?: string;
  season?: number;
  episode?: number;
}): Promise<{
  streams: AddonStreamResolved[];
  erros: Array<{ addonId: string; addonName: string; erro: string }>;
}> {
  await carregarAddons();
  const ativos = getAddonsAtivos();
  if (ativos.length === 0) return { streams: [], erros: [] };

  const sufixoEp = params.type === 'series' && params.season && params.episode
    ? `:${params.season}:${params.episode}`
    : '';

  const candidatosBase: Array<string | undefined> = [];
  if (params.imdbId) {
    candidatosBase.push(`${params.imdbId}${sufixoEp}`);
  }
  if (params.addonRawId) {
    const baseRaw = params.addonRawId.trim();
    if (baseRaw && baseRaw !== params.imdbId) {
      // Para séries, só anexa :S:E se addonRawId já não contiver :S:E
      const temEp = /:\d+:\d+$/.test(baseRaw);
      candidatosBase.push(params.type === 'series' && sufixoEp && !temEp ? `${baseRaw}${sufixoEp}` : baseRaw);
    }
  }
  if (params.tmdbId && params.tmdbId > 0) {
    candidatosBase.push(`tmdb:${params.tmdbId}${sufixoEp}`);
  }

  const resultados = await Promise.allSettled(
    ativos.map(async (addon) => {
      const idConsulta = escolherIdParaAddon(addon.manifest, 'stream', params.type, candidatosBase);
      if (!idConsulta) {
        return { addon, streams: [] as AddonStreamResolved[], ignorado: true };
      }

      const url = construirUrlRecursoAddon(addon, 'stream', params.type, idConsulta);
      const json = await fetchJsonComPrazo<{ streams?: AddonStream[] }>(url, PRAZO_STREAM_MS);
      const lista = Array.isArray(json?.streams) ? json.streams : [];
      const resolvidos = lista
        .map((s) => classificarStreamAddon(s, addon))
        .filter((s) => s.kind !== 'invalid');
      return { addon, streams: resolvidos, ignorado: false };
    }),
  );

  const streams: AddonStreamResolved[] = [];
  const erros: Array<{ addonId: string; addonName: string; erro: string }> = [];

  for (let i = 0; i < resultados.length; i++) {
    const r = resultados[i];
    const addon = ativos[i];
    if (r.status === 'fulfilled') {
      streams.push(...r.value.streams);
    } else {
      erros.push({
        addonId: addon.id,
        addonName: addon.name,
        erro: r.reason instanceof Error ? r.reason.message : 'Falha ao consultar addon.',
      });
    }
  }

  return { streams, erros };
}

/**
 * Consulta /subtitles/{type}/{id}[/{extra}].json nos addons habilitados com recurso `subtitles`.
 */
export async function buscarLegendasAddons(params: {
  type: 'movie' | 'series';
  imdbId?: string;
  tmdbId?: number;
  addonRawId?: string;
  season?: number;
  episode?: number;
  videoSize?: number;
  videoHash?: string;
  filename?: string;
}): Promise<AddonSubtitle[]> {
  await carregarAddons();
  const ativos = getAddonsAtivos();
  if (ativos.length === 0) return [];

  const sufixoEp = params.type === 'series' && params.season && params.episode
    ? `:${params.season}:${params.episode}`
    : '';

  const candidatos: Array<string | undefined> = [];
  if (params.imdbId) candidatos.push(`${params.imdbId}${sufixoEp}`);
  if (params.addonRawId) {
    const baseRaw = params.addonRawId.trim();
    const temEp = /:\d+:\d+$/.test(baseRaw);
    candidatos.push(params.type === 'series' && sufixoEp && !temEp ? `${baseRaw}${sufixoEp}` : baseRaw);
  }
  if (params.tmdbId && params.tmdbId > 0) candidatos.push(`tmdb:${params.tmdbId}${sufixoEp}`);

  const extraParams: Record<string, string | number | undefined> = {
    ...(params.videoHash ? { videoHash: params.videoHash } : {}),
    ...(params.videoSize ? { videoSize: params.videoSize } : {}),
    ...(params.filename ? { filename: params.filename } : {}),
  };
  const extraStr = Object.keys(extraParams).length > 0
    ? Object.entries(extraParams)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
        .join('&')
    : '';

  const resultados = await Promise.allSettled(
    ativos.map(async (addon) => {
      const idConsulta = escolherIdParaAddon(addon.manifest, 'subtitles', params.type, candidatos);
      if (!idConsulta) return [] as AddonSubtitle[];

      const urlBase = construirUrlRecursoAddon(addon, 'subtitles', params.type, idConsulta);
      const url = extraStr
        ? urlBase.replace(/\.json(\?.*)?$/, `/${extraStr}.json$1`)
        : urlBase;
      const json = await fetchJsonComPrazo<{ subtitles?: Array<Record<string, unknown>> }>(url);
      const lista = Array.isArray(json?.subtitles) ? json.subtitles : [];
      return lista
        .filter((s) => s && typeof s.url === 'string' && typeof s.lang === 'string')
        .map((s, idx) => ({
          id: String(s.id ?? `${addon.id}-${idx}`),
          url: String(s.url),
          lang: String(s.lang),
          ...(typeof s.label === 'string' && s.label.trim() ? { label: s.label.trim() } : {}),
          addonId: addon.id,
          addonName: addon.name,
        }));
    }),
  );

  const saida: AddonSubtitle[] = [];
  for (const r of resultados) {
    if (r.status === 'fulfilled') {
      saida.push(...r.value);
    }
  }
  return saida;
}

export function addonTemManifesto(manifest: AddonManifest): boolean {
  return Boolean(manifest.id && manifest.name);
}

let abrirAddonsPendente = false;
export function pedirAbrirAddons(): void {
  abrirAddonsPendente = true;
}
export function consumirPedidoAddons(): boolean {
  if (!abrirAddonsPendente) return false;
  abrirAddonsPendente = false;
  return true;
}

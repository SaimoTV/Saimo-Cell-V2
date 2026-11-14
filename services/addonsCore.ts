import type {
  AddonCatalogDef,
  AddonManifest,
  AddonMeta,
  AddonResource,
  AddonStream,
  AddonStreamKind,
  AddonStreamResolved,
  AddonSubtitle,
  AddonSyncEntry,
  InstalledAddon,
  MediaSource,
} from '../types';

export class ErroAddon extends Error {
  code?: string;

  constructor(message: string, code?: string) {
    super(message);
    this.name = 'ErroAddon';
    this.code = code;
  }
}

export interface ParsedAddonUrl {
  transportUrl: string;
  url: string;
  baseUrl: string;
  query: string;
}

export type AddonExtraParam =
  | string
  | Record<string, string | number | boolean | undefined | null>;

function decodeSeguro(valor: string): string {
  try {
    return decodeURIComponent(valor);
  } catch {
    return valor;
  }
}

/**
 * Normaliza uma URL de addon no protocolo Stremio:
 * - remove espaços nas pontas
 * - converte stremio:// -> https:// (incluindo stremio://https://...)
 * - preserva ?query
 * - remove /manifest.json e barras finais
 * - preserva segmentos de configuração no path (ex.: /sort=quality)
 */
export function normalizarUrlAddon(entrada: string): ParsedAddonUrl {
  if (typeof entrada !== 'string') {
    throw new ErroAddon('Endereço do addon inválido.', 'URL_INVALIDA');
  }

  let bruto = entrada.trim();
  if (!bruto) {
    throw new ErroAddon('Cole o endereço de um addon Stremio para continuar.', 'URL_VAZIA');
  }

  // Alguns links profundos vêm como stremio://https://... ou stremio://http://...
  const duploProtocolo = /^stremio:\/\/(https?:\/\/.+)$/i.exec(bruto);
  if (duploProtocolo) {
    bruto = duploProtocolo[1];
  } else if (/^stremio:\/\//i.test(bruto)) {
    bruto = bruto.replace(/^stremio:\/\//i, 'https://');
  }

  let parsed: URL;
  try {
    parsed = new URL(bruto);
  } catch {
    throw new ErroAddon('Endereço de addon inválido. Use http://, https:// ou stremio://.', 'URL_INVALIDA');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new ErroAddon(
      'Protocolo não suportado. Use apenas http://, https:// ou stremio://.',
      'PROTOCOLO_INVALIDO',
    );
  }

  if (!parsed.hostname) {
    throw new ErroAddon('Endereço de addon incompleto (sem domínio ou IP).', 'URL_INVALIDA');
  }

  const query = parsed.search || '';
  let pathname = parsed.pathname || '';
  pathname = pathname.replace(/\/+$/, '');
  pathname = pathname.replace(/\/manifest\.json$/i, '');
  pathname = pathname.replace(/\/+$/, '');

  const baseUrl = `${parsed.origin}${pathname}`;
  const transportUrl = `${baseUrl}/manifest.json${query}`;

  return {
    transportUrl,
    url: transportUrl,
    baseUrl,
    query,
  };
}

/**
 * Serializa parâmetros extras do catálogo Stremio mantendo pares chave=valor seguros para path.
 */
export function codificarExtraCatalogo(extra?: AddonExtraParam): string {
  if (!extra) return '';
  if (typeof extra === 'string') {
    const limpo = extra.trim().replace(/^\/+|\/+$/g, '').replace(/\.json$/i, '');
    if (!limpo) return '';
    // Se vier no formato key=val&key2=val2, percent-codifica cada segmento sem quebrar = e &
    return limpo
      .split('&')
      .filter(Boolean)
      .map((par) => {
        const idx = par.indexOf('=');
        if (idx === -1) return encodeURIComponent(decodeSeguro(par));
        const k = par.slice(0, idx);
        const v = par.slice(idx + 1);
        return `${encodeURIComponent(decodeSeguro(k))}=${encodeURIComponent(decodeSeguro(v))}`;
      })
      .join('&');
  }

  const partes: string[] = [];
  for (const [k, v] of Object.entries(extra)) {
    if (v === undefined || v === null || v === '') continue;
    partes.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  }
  return partes.join('&');
}

/**
 * Monta URL de consulta de recurso Stremio codificando os segmentos de path e reanexando ?query.
 */
export function construirUrlRecursoAddon(
  origem: string | Pick<InstalledAddon, 'baseUrl' | 'transportUrl'> | { baseUrl?: string; transportUrl?: string; url?: string },
  resource: 'catalog' | 'meta' | 'stream' | 'subtitles' | string,
  type: string,
  id: string,
  extra?: AddonExtraParam,
): string {
  let baseUrl = '';
  let query = '';

  if (typeof origem === 'string') {
    const parsed = normalizarUrlAddon(origem);
    baseUrl = parsed.baseUrl;
    query = parsed.query;
  } else if (origem.transportUrl || (origem as { url?: string }).url) {
    const parsed = normalizarUrlAddon(origem.transportUrl || (origem as { url?: string }).url || '');
    baseUrl = parsed.baseUrl;
    query = parsed.query;
  } else if (origem.baseUrl) {
    const parsed = normalizarUrlAddon(origem.baseUrl);
    baseUrl = parsed.baseUrl;
    query = parsed.query;
  } else {
    throw new ErroAddon('Addon sem URL configurada.', 'URL_INVALIDA');
  }

  const segResource = encodeURIComponent(resource);
  const segType = encodeURIComponent(type);
  const segId = encodeURIComponent(id).replace(/%3A/gi, ':');

  if (resource === 'catalog') {
    const segExtra = codificarExtraCatalogo(extra);
    if (segExtra) {
      // Codifica o segmento completo se houver caracteres reservados adicionais ou preserva pares codificados
      return `${baseUrl}/${segResource}/${segType}/${segId}/${segExtra}.json${query}`;
    }
  }

  return `${baseUrl}/${segResource}/${segType}/${segId}.json${query}`;
}

/**
 * Detecta manifestos de repositórios/plugins JS do Nuvio, que não usam HTTP /manifest.json do protocolo Stremio.
 */
export function detectarPluginNuvioJS(payload: unknown): boolean {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return false;
  }
  const obj = payload as Record<string, unknown>;
  const temResources = Array.isArray(obj.resources) && obj.resources.length > 0;
  if (Array.isArray(obj.scrapers) && !temResources) {
    return true;
  }
  // Plugin único estilo Nuvio: traz filename/supportedPlatforms/formats sem resources Stremio
  if (
    !temResources &&
    typeof obj.filename === 'string' &&
    (Array.isArray(obj.supportedTypes) || Array.isArray(obj.supportedPlatforms))
  ) {
    return true;
  }
  return false;
}

function normalizarListaStrings(valor: unknown): string[] {
  if (!Array.isArray(valor)) return [];
  return valor
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean);
}

function normalizarResources(valor: unknown): AddonResource[] {
  if (!Array.isArray(valor)) return [];
  const saida: AddonResource[] = [];
  for (const entry of valor) {
    if (typeof entry === 'string' && entry.trim()) {
      saida.push(entry.trim());
    } else if (entry && typeof entry === 'object') {
      const obj = entry as Record<string, unknown>;
      if (typeof obj.name === 'string' && obj.name.trim()) {
        const types = normalizarListaStrings(obj.types);
        const idPrefixes = normalizarListaStrings(obj.idPrefixes);
        saida.push({
          name: obj.name.trim(),
          ...(types.length ? { types } : {}),
          ...(idPrefixes.length ? { idPrefixes } : {}),
        });
      }
    }
  }
  return saida;
}

function normalizarCatalogs(valor: unknown): AddonCatalogDef[] {
  if (!Array.isArray(valor)) return [];
  const saida: AddonCatalogDef[] = [];
  for (const item of valor) {
    if (!item || typeof item !== 'object') continue;
    const obj = item as Record<string, unknown>;
    const type = typeof obj.type === 'string' ? obj.type.trim() : '';
    const id = typeof obj.id === 'string' ? obj.id.trim() : '';
    if (!type || !id) continue;

    const extra = Array.isArray(obj.extra)
      ? obj.extra
          .filter((e): e is Record<string, unknown> => !!e && typeof e === 'object')
          .map((e) => ({
            name: String(e.name ?? '').trim(),
            ...(typeof e.isRequired === 'boolean' ? { isRequired: e.isRequired } : {}),
            ...(Array.isArray(e.options) ? { options: normalizarListaStrings(e.options) } : {}),
            ...(typeof e.optionsLimit === 'number' ? { optionsLimit: e.optionsLimit } : {}),
          }))
          .filter((e) => !!e.name)
      : undefined;

    const extraSupported = normalizarListaStrings(obj.extraSupported);
    const extraRequired = normalizarListaStrings(obj.extraRequired);

    saida.push({
      type,
      id,
      ...(typeof obj.name === 'string' && obj.name.trim() ? { name: obj.name.trim() } : {}),
      ...(extra && extra.length ? { extra } : {}),
      ...(extraSupported.length ? { extraSupported } : {}),
      ...(extraRequired.length ? { extraRequired } : {}),
    });
  }
  return saida;
}

/**
 * Valida e normaliza um JSON de manifest.json no protocolo Stremio.
 */
export function validarManifestoAddon(raw: unknown): AddonManifest {
  if (detectarPluginNuvioJS(raw)) {
    const obj = raw as Record<string, unknown>;
    if (Array.isArray(obj.scrapers)) {
      const name = typeof obj.name === 'string' && obj.name.trim() ? obj.name.trim() : 'Nuvio Plugin';
      const id = typeof obj.id === 'string' && obj.id.trim()
        ? obj.id.trim()
        : `nuvio.${name.toLowerCase().replace(/\s+/g, '-')}`;
      const version = typeof obj.version === 'string' && obj.version.trim() ? obj.version.trim() : '1.0.0';
      const scrapersCount = obj.scrapers.length;
      const description = typeof obj.description === 'string' && obj.description.trim()
        ? obj.description.trim()
        : `Repositório Nuvio (${scrapersCount} scrapers)`;
      return {
        id,
        name,
        version,
        description,
        types: ['movie', 'series'],
        idPrefixes: ['tt', 'tmdb:'],
        resources: ['stream'],
        catalogs: [],
      };
    }
    throw new ErroAddon(
      'Plugin JS do Nuvio detectado: este formato executa scripts locais e não é compatível. O Saimo aceita apenas addons HTTP no protocolo Stremio (/manifest.json).',
      'NUVIO_JS_NAO_SUPORTADO',
    );
  }

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new ErroAddon('Manifesto inválido: o endereço não retornou um objeto JSON do Stremio.', 'MANIFESTO_INVALIDO');
  }

  const obj = raw as Record<string, unknown>;
  const id = typeof obj.id === 'string' ? obj.id.trim() : '';
  const name = typeof obj.name === 'string' ? obj.name.trim() : '';
  if (!id || !name) {
    throw new ErroAddon('Manifesto inválido: campos "id" ou "name" ausentes.', 'MANIFESTO_INVALIDO');
  }

  const resources = normalizarResources(obj.resources);
  const catalogs = normalizarCatalogs(obj.catalogs);
  if (resources.length === 0 && catalogs.length === 0) {
    throw new ErroAddon(
      'Manifesto inválido: nenhum recurso ("resources") ou catálogo Stremio declarado.',
      'MANIFESTO_INVALIDO',
    );
  }

  // Alguns addons omitem resources quando só oferecem catalog; garante 'catalog' se catalogs existir
  const resourcesFinais = resources.length > 0 ? resources : ['catalog'];

  const types = normalizarListaStrings(obj.types);
  const idPrefixes = normalizarListaStrings(obj.idPrefixes);

  const hintsRaw = obj.behaviorHints && typeof obj.behaviorHints === 'object'
    ? (obj.behaviorHints as Record<string, unknown>)
    : undefined;
  const behaviorHints = hintsRaw
    ? {
        ...(typeof hintsRaw.adult === 'boolean' ? { adult: hintsRaw.adult } : {}),
        ...(typeof hintsRaw.p2p === 'boolean' ? { p2p: hintsRaw.p2p } : {}),
        ...(typeof hintsRaw.configurable === 'boolean' ? { configurable: hintsRaw.configurable } : {}),
        ...(typeof hintsRaw.configurationRequired === 'boolean'
          ? { configurationRequired: hintsRaw.configurationRequired }
          : {}),
      }
    : undefined;

  return {
    id,
    name,
    version: typeof obj.version === 'string' && obj.version.trim() ? obj.version.trim() : '1.0.0',
    ...(typeof obj.description === 'string' && obj.description.trim()
      ? { description: obj.description.trim() }
      : {}),
    ...(typeof obj.logo === 'string' && obj.logo.trim() ? { logo: obj.logo.trim() } : {}),
    ...(typeof obj.background === 'string' && obj.background.trim()
      ? { background: obj.background.trim() }
      : {}),
    types: types.length > 0 ? types : Array.from(new Set(catalogs.map((c) => c.type))),
    resources: resourcesFinais,
    catalogs,
    ...(idPrefixes.length > 0 ? { idPrefixes } : {}),
    ...(behaviorHints && Object.keys(behaviorHints).length > 0 ? { behaviorHints } : {}),
  };
}

/**
 * Cria um InstalledAddon mínimo quando só o endereço chegou via Saimo Connect antes de hidratar o manifest.json.
 */
export function criarPlaceholderAddon(
  entradaUrl: string,
  extras?: Partial<Pick<AddonSyncEntry, 'id' | 'name' | 'enabled' | 'order'>>,
): InstalledAddon {
  const parsed = normalizarUrlAddon(entradaUrl);
  let fallbackName = 'Addon Stremio';
  try {
    fallbackName = new URL(parsed.transportUrl).hostname;
  } catch {
    // mantém padrão
  }

  const id = (extras?.id && extras.id.trim()) || `url:${parsed.transportUrl}`;
  const name = (extras?.name && extras.name.trim()) || fallbackName;

  return {
    id,
    name,
    version: '0.0.0',
    transportUrl: parsed.transportUrl,
    url: parsed.transportUrl,
    baseUrl: parsed.baseUrl,
    enabled: extras?.enabled ?? true,
    order: extras?.order ?? 0,
    addedAt: Date.now(),
    hydrated: false,
    manifest: {
      id,
      name,
      version: '0.0.0',
      types: ['movie', 'series'],
      resources: ['stream'],
      catalogs: [],
    },
  };
}

/**
 * Verifica se o manifesto suporta determinado recurso, tipo de conteúdo e prefixo de ID.
 */
export function addonSuportaRecurso(
  manifest: Pick<AddonManifest, 'resources' | 'types' | 'idPrefixes'>,
  resourceName: string,
  type?: string,
  id?: string,
): boolean {
  for (const entry of manifest.resources) {
    const nome = typeof entry === 'string' ? entry : entry.name;
    if (nome !== resourceName) continue;

    const tipos = typeof entry === 'string'
      ? manifest.types
      : (entry.types && entry.types.length > 0 ? entry.types : manifest.types);

    if (type && tipos.length > 0 && !tipos.includes(type)) {
      continue;
    }

    const prefixos = typeof entry === 'string'
      ? manifest.idPrefixes
      : (entry.idPrefixes && entry.idPrefixes.length > 0 ? entry.idPrefixes : manifest.idPrefixes);

    if (id && prefixos && prefixos.length > 0) {
      if (!prefixos.some((p) => id.startsWith(p))) {
        continue;
      }
    }

    return true;
  }
  return false;
}

/**
 * Escolhe o primeiro ID candidato aceito pelo manifesto para um recurso/tipo.
 */
export function escolherIdParaAddon(
  manifest: Pick<AddonManifest, 'resources' | 'types' | 'idPrefixes'>,
  resourceName: string,
  type: string,
  candidatos: Array<string | undefined | null>,
): string | null {
  for (const candidato of candidatos) {
    if (!candidato) continue;
    if (addonSuportaRecurso(manifest, resourceName, type, candidato)) {
      return candidato;
    }
  }
  return null;
}

export function catalogoSuportaBusca(catalogo: AddonCatalogDef): boolean {
  if (catalogo.extraSupported?.includes('search')) return true;
  return Boolean(catalogo.extra?.some((e) => e.name === 'search'));
}

export function catalogoExigeExtraObrigatorioSemSerBusca(catalogo: AddonCatalogDef): boolean {
  const req = catalogo.extraRequired ?? [];
  if (req.some((name) => name !== 'search' && name !== 'skip')) return true;
  return Boolean(catalogo.extra?.some((e) => e.isRequired && e.name !== 'search' && e.name !== 'skip'));
}

function limparHeadersProxy(raw: unknown): Record<string, string> | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const saida: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === 'string' && k.trim()) {
      saida[k.trim()] = v;
    }
  }
  return Object.keys(saida).length > 0 ? saida : undefined;
}

function normalizarSubtitlesInline(raw: unknown, addonId: string, addonName: string): AddonSubtitle[] {
  if (!Array.isArray(raw)) return [];
  const saida: AddonSubtitle[] = [];
  for (let i = 0; i < raw.length; i++) {
    const item = raw[i];
    if (!item || typeof item !== 'object') continue;
    const obj = item as Record<string, unknown>;
    const url = typeof obj.url === 'string' ? obj.url.trim() : '';
    const lang = typeof obj.lang === 'string' ? obj.lang.trim() : '';
    if (!url || !lang || !/^https?:\/\//i.test(url)) continue;
    saida.push({
      id: typeof obj.id === 'string' && obj.id ? obj.id : `inline-${addonId}-${i}`,
      url,
      lang,
      ...(typeof obj.label === 'string' && obj.label.trim() ? { label: obj.label.trim() } : {}),
      addonId,
      addonName,
    });
  }
  return saida;
}

/**
 * Classifica e normaliza um objeto stream retornado por um addon Stremio.
 */
export function classificarStreamAddon(
  stream: AddonStream,
  addonInfo: { id: string; name: string },
): AddonStreamResolved {
  const urlDireta = typeof stream.url === 'string' ? stream.url.trim() : '';
  const externalUrl = typeof stream.externalUrl === 'string' ? stream.externalUrl.trim() : '';
  const ytId = typeof stream.ytId === 'string' ? stream.ytId.trim() : '';
  const infoHash = typeof stream.infoHash === 'string' ? stream.infoHash.trim().toLowerCase() : '';

  let kind: AddonStreamKind = 'invalid';
  if (urlDireta && /^https?:\/\//i.test(urlDireta)) {
    kind = 'direct';
  } else if (infoHash && /^[a-f0-9]{40}$|^[a-z2-7]{32}$/i.test(infoHash)) {
    kind = 'torrent';
  } else if (ytId) {
    kind = 'youtube';
  } else if (externalUrl && /^https?:\/\//i.test(externalUrl)) {
    kind = 'external';
  }

  const hints = stream.behaviorHints;
  const headers = limparHeadersProxy(hints?.proxyHeaders?.request);
  const bingeGroup = typeof hints?.bingeGroup === 'string' && hints.bingeGroup.trim()
    ? hints.bingeGroup.trim()
    : undefined;

  const nomeBruto = (stream.name || addonInfo.name || '').trim();
  const descBruta = (stream.title || stream.description || '').trim();
  const primeiraLinha = nomeBruto.split('\n').map((s) => s.trim()).filter(Boolean).join(' · ');
  const segundaLinha = descBruta.split('\n').map((s) => s.trim()).filter(Boolean).join(' · ');

  const title = primeiraLinha || segundaLinha || addonInfo.name || 'Stream';
  const subtitle = primeiraLinha && segundaLinha ? segundaLinha : undefined;

  return {
    addonId: addonInfo.id,
    addonName: addonInfo.name,
    kind,
    stream,
    ...(kind === 'direct' ? { url: urlDireta } : {}),
    ...(kind === 'external' ? { externalUrl } : {}),
    ...(kind === 'youtube' ? { ytId } : {}),
    ...(infoHash ? { infoHash } : {}),
    ...(typeof stream.fileIdx === 'number' ? { fileIdx: stream.fileIdx } : {}),
    ...(Array.isArray(stream.sources) ? { sources: stream.sources.filter((s) => typeof s === 'string') } : {}),
    ...(headers ? { headers } : {}),
    ...(bingeGroup ? { bingeGroup } : {}),
    subtitles: normalizarSubtitlesInline(stream.subtitles, addonInfo.id, addonInfo.name),
    title,
    ...(subtitle ? { subtitle } : {}),
    ...(typeof hints?.notWebReady === 'boolean' ? { notWebReady: hints.notWebReady } : {}),
    ...(typeof hints?.filename === 'string' && hints.filename ? { filename: hints.filename } : {}),
    ...(typeof hints?.videoSize === 'number' ? { videoSize: hints.videoSize } : {}),
    ...(typeof hints?.videoHash === 'string' && hints.videoHash ? { videoHash: hints.videoHash } : {}),
  };
}

/**
 * Converte um stream resolvido de addon em MediaSource compatível com o player e SourceSheet do Saimo.
 */
export function addonStreamParaMediaSource(resolved: AddonStreamResolved): MediaSource {
  const prefixoDebrid = resolved.kind === 'torrent' ? '[Debrid] ' : '';
  const rotuloBase = resolved.subtitle
    ? `${resolved.title} — ${resolved.subtitle}`
    : resolved.title;

  return {
    url: resolved.url || resolved.externalUrl || '',
    label: `${prefixoDebrid}${rotuloBase}`,
    addonId: resolved.addonId,
    addonName: resolved.addonName,
    kind: resolved.kind,
    ...(resolved.headers ? { headers: resolved.headers } : {}),
    ...(resolved.bingeGroup ? { bingeGroup: resolved.bingeGroup } : {}),
    ...(resolved.infoHash ? { infoHash: resolved.infoHash, isTorrent: true } : {}),
    ...(typeof resolved.fileIdx === 'number' ? { fileIdx: resolved.fileIdx } : {}),
    ...(resolved.sources ? { sources: resolved.sources } : {}),
    ...(resolved.subtitles.length > 0 ? { subtitles: resolved.subtitles } : {}),
    ...(resolved.externalUrl ? { externalUrl: resolved.externalUrl } : {}),
    ...(resolved.ytId ? { ytId: resolved.ytId } : {}),
    ...(typeof resolved.notWebReady === 'boolean' ? { notWebReady: resolved.notWebReady } : {}),
    ...(resolved.filename ? { filename: resolved.filename } : {}),
    ...(typeof resolved.videoSize === 'number' ? { videoSize: resolved.videoSize } : {}),
    ...(resolved.videoHash ? { videoHash: resolved.videoHash } : {}),
  };
}

/**
 * Seleciona o stream prioritário para o próximo episódio usando behaviorHints.bingeGroup.
 */
export function selecionarStreamPorBingeGroup(
  streams: AddonStreamResolved[],
  bingeGroup?: string,
): AddonStreamResolved | null {
  const reproduziveis = streams.filter((s) => s.kind === 'direct' || s.kind === 'torrent');
  if (reproduziveis.length === 0) return null;

  if (bingeGroup && bingeGroup.trim()) {
    const grupo = bingeGroup.trim();
    const diretoMesmoGrupo = reproduziveis.find((s) => s.kind === 'direct' && s.bingeGroup === grupo);
    if (diretoMesmoGrupo) return diretoMesmoGrupo;
    const qualquerMesmoGrupo = reproduziveis.find((s) => s.bingeGroup === grupo);
    if (qualquerMesmoGrupo) return qualquerMesmoGrupo;
  }

  return reproduziveis.find((s) => s.kind === 'direct') ?? reproduziveis[0];
}

/**
 * Versão sobre MediaSource[] para uso direto no player durante auto-avanço de episódio.
 */
export function selecionarFontePorBingeGroup(
  sources: MediaSource[],
  bingeGroup?: string,
): { index: number; source: MediaSource } | null {
  if (!sources.length) return null;

  if (bingeGroup && bingeGroup.trim()) {
    const grupo = bingeGroup.trim();
    const idxDireto = sources.findIndex((s) => s.bingeGroup === grupo && !!s.url && !s.isTorrent);
    if (idxDireto >= 0) return { index: idxDireto, source: sources[idxDireto] };

    const idxQualquer = sources.findIndex((s) => s.bingeGroup === grupo && (!!s.url || !!s.infoHash));
    if (idxQualquer >= 0) return { index: idxQualquer, source: sources[idxQualquer] };
  }

  const primeiroDireto = sources.findIndex((s) => !!s.url && !s.isTorrent);
  if (primeiroDireto >= 0) return { index: primeiroDireto, source: sources[primeiroDireto] };
  return { index: 0, source: sources[0] };
}

/**
 * Mescla headers HTTP customizados do addon (`proxyHeaders.request`) com os headers da estratégia de reprodução.
 * Headers explícitos do addon têm precedência para evitar 403 Forbidden (Referer/User-Agent/Origin/Cookie/Authorization).
 */
export function mesclarHeadersReproducao(
  strategyHeaders?: Record<string, string>,
  addonHeaders?: Record<string, string>,
): Record<string, string> {
  const base: Record<string, string> = { ...(strategyHeaders ?? {}) };
  if (!addonHeaders) return base;

  const chavesExistentes = new Map<string, string>();
  for (const k of Object.keys(base)) {
    chavesExistentes.set(k.toLowerCase(), k);
  }

  for (const [k, v] of Object.entries(addonHeaders)) {
    if (!v) continue;
    const existente = chavesExistentes.get(k.toLowerCase());
    if (existente && existente !== k) {
      delete base[existente];
    }
    base[k] = v;
  }
  return base;
}

/**
 * Codifica/decodifica IDs canônicos de itens originados em catálogos de addons.
 * Formato: `addon|<type>|<addonId>|<rawId>`
 */
export function criarIdItemAddon(type: string, addonId: string, rawId: string): string {
  const tipoNorm = type === 'series' ? 'series' : 'movie';
  return `addon|${tipoNorm}|${encodeURIComponent(addonId)}|${encodeURIComponent(rawId)}`;
}

export function analisarIdItemAddon(
  id: string,
): { type: 'movie' | 'series'; addonId: string; rawId: string } | null {
  if (!id.startsWith('addon|')) return null;
  const partes = id.split('|');
  if (partes.length < 4) return null;
  const tipo = partes[1] === 'series' ? 'series' : 'movie';
  return {
    type: tipo,
    addonId: decodeSeguro(partes[2]),
    rawId: decodeSeguro(partes.slice(3).join('|')),
  };
}

/**
 * Formato de IDs de descoberta pura TMDB quando não há lista VOD configurada.
 * Formato: `tmdb|<movie|tv>|<tmdbId>`
 */
export function criarIdItemTmdb(type: 'movie' | 'tv', tmdbId: number): string {
  return `tmdb|${type}|${tmdbId}`;
}

export function analisarIdItemTmdb(id: string): { type: 'movie' | 'tv'; tmdbId: number } | null {
  if (!id.startsWith('tmdb|')) return null;
  const [, tipoRaw, numRaw] = id.split('|');
  const num = Number(numRaw);
  if (!Number.isFinite(num) || num <= 0) return null;
  return {
    type: tipoRaw === 'tv' ? 'tv' : 'movie',
    tmdbId: num,
  };
}

export function parseAnoReleaseInfo(releaseInfo?: string): string {
  if (!releaseInfo) return '';
  const m = /\b(19\d{2}|20\d{2})\b/.exec(releaseInfo);
  return m ? m[1] : '';
}

export function extrairTmdbImdbDeAddonMeta(meta?: AddonMeta | null): { imdbId?: string; tmdbId?: number } {
  if (!meta) return {};
  let imdbId: string | undefined;
  let tmdbId: number | undefined;

  if (typeof meta.imdb_id === 'string' && /^tt\d+$/i.test(meta.imdb_id.trim())) {
    imdbId = meta.imdb_id.trim();
  } else if (/^tt\d+$/i.test(meta.id)) {
    imdbId = meta.id;
  }

  if (typeof meta.tmdb_id === 'number' && meta.tmdb_id > 0) {
    tmdbId = meta.tmdb_id;
  } else if (typeof meta.tmdb_id === 'string' && /^\d+$/.test(meta.tmdb_id.trim())) {
    tmdbId = Number(meta.tmdb_id.trim());
  } else if (/^tmdb:\d+$/i.test(meta.id)) {
    tmdbId = Number(meta.id.slice(5));
  }

  return { imdbId, tmdbId };
}

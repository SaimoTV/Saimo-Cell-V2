import type { DebridConfig, DebridProviderId } from '../types';

export const ORDEM_PROVEDORES_DEBRID: DebridProviderId[] = [
  'torbox',
  'realdebrid',
  'alldebrid',
  'premiumize',
];

export const NOMES_PROVEDORES_DEBRID: Record<DebridProviderId, string> = {
  torbox: 'TorBox',
  realdebrid: 'Real-Debrid',
  alldebrid: 'AllDebrid',
  premiumize: 'Premiumize',
};

const EXTENSOES_VIDEO = /\.(mp4|mkv|avi|mov|wmv|flv|webm|m4v|ts|m2ts|mpg|mpeg)$/i;
const EXTENSOES_IGNORADAS = /\.(txt|nfo|srt|sub|idx|ass|ssa|jpg|jpeg|png|sfv|nzb|exe)$/i;

export class ErroDebrid extends Error {
  code?: string;
  provider?: DebridProviderId;

  constructor(message: string, code?: string, provider?: DebridProviderId) {
    super(message);
    this.name = 'ErroDebrid';
    this.code = code;
    this.provider = provider;
  }
}

export interface DebridFileCandidate {
  index?: number;
  id?: string | number;
  name: string;
  size: number;
  link?: string;
}

export interface DebridResolveParams {
  infoHash: string;
  fileIdx?: number;
  sources?: string[];
  filename?: string;
}

export interface DebridResolveResult {
  url: string;
  provider: DebridProviderId;
  providerName: string;
  filename?: string;
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export function criarConfigDebridPadrao(): DebridConfig {
  return {
    providers: {
      torbox: { apiKey: '', enabled: false },
      realdebrid: { apiKey: '', enabled: false },
      alldebrid: { apiKey: '', enabled: false },
      premiumize: { apiKey: '', enabled: false },
    },
    sincronizarConnect: false,
  };
}

export function normalizarConfigDebrid(raw: unknown): DebridConfig {
  const padrao = criarConfigDebridPadrao();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return padrao;
  }
  const obj = raw as Record<string, unknown>;
  const provRaw = obj.providers && typeof obj.providers === 'object'
    ? (obj.providers as Record<string, unknown>)
    : obj;

  for (const id of ORDEM_PROVEDORES_DEBRID) {
    const entrada = provRaw[id];
    if (entrada && typeof entrada === 'object') {
      const e = entrada as Record<string, unknown>;
      const apiKey = typeof e.apiKey === 'string' ? e.apiKey.trim() : '';
      const enabled = Boolean(e.enabled) && apiKey.length > 0;
      padrao.providers[id] = { apiKey, enabled };
    }
  }

  padrao.sincronizarConnect = Boolean(obj.sincronizarConnect);
  return padrao;
}

export function obterProvedoresDebridAtivos(config: DebridConfig): Array<{
  id: DebridProviderId;
  name: string;
  apiKey: string;
}> {
  const ativos: Array<{ id: DebridProviderId; name: string; apiKey: string }> = [];
  for (const id of ORDEM_PROVEDORES_DEBRID) {
    const item = config.providers[id];
    if (item?.enabled && item.apiKey.trim()) {
      ativos.push({
        id,
        name: NOMES_PROVEDORES_DEBRID[id],
        apiKey: item.apiKey.trim(),
      });
    }
  }
  return ativos;
}

export function ehArquivoVideo(nome: string): boolean {
  const limpo = (nome || '').trim();
  if (!limpo) return false;
  if (EXTENSOES_IGNORADAS.test(limpo)) return false;
  return EXTENSOES_VIDEO.test(limpo);
}

/**
 * Seleciona o arquivo de vídeo correto usando `fileIdx` do Stremio quando válido,
 * ou o maior arquivo de vídeo disponível como fallback.
 */
export function selecionarArquivoTorrent<T extends DebridFileCandidate>(
  arquivos: T[],
  fileIdx?: number,
): T | null {
  if (!Array.isArray(arquivos) || arquivos.length === 0) return null;

  if (typeof fileIdx === 'number' && Number.isFinite(fileIdx) && fileIdx >= 0) {
    const porIndex = arquivos.find((a) => a.index === fileIdx);
    if (porIndex && !EXTENSOES_IGNORADAS.test(porIndex.name)) {
      return porIndex;
    }
    if (fileIdx < arquivos.length && !EXTENSOES_IGNORADAS.test(arquivos[fileIdx].name)) {
      return arquivos[fileIdx];
    }
  }

  const apenasVideos = arquivos.filter((a) => ehArquivoVideo(a.name));
  const candidatos = apenasVideos.length > 0
    ? apenasVideos
    : arquivos.filter((a) => !EXTENSOES_IGNORADAS.test(a.name));

  const lista = candidatos.length > 0 ? candidatos : arquivos;
  return [...lista].sort((a, b) => (b.size || 0) - (a.size || 0))[0] ?? null;
}

export function montarMagnetLink(infoHash: string, sources?: string[], displayName?: string): string {
  const hash = infoHash.trim();
  const params = [`xt=urn:btih:${encodeURIComponent(hash)}`];
  if (displayName && displayName.trim()) {
    params.push(`dn=${encodeURIComponent(displayName.trim())}`);
  }
  if (Array.isArray(sources)) {
    for (const src of sources) {
      if (typeof src !== 'string') continue;
      const limpo = src.trim();
      if (limpo.startsWith('tracker:')) {
        params.push(`tr=${encodeURIComponent(limpo.slice(8))}`);
      } else if (/^(udp|https?|wss?):\/\//i.test(limpo)) {
        params.push(`tr=${encodeURIComponent(limpo)}`);
      }
    }
  }
  return `magnet:?${params.join('&')}`;
}

function criarFormUrlEncoded(campos: Record<string, string>): string {
  return Object.entries(campos)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
}

async function lerJsonSeguro(res: Response): Promise<Record<string, unknown>> {
  const txt = await res.text();
  try {
    return JSON.parse(txt) as Record<string, unknown>;
  } catch {
    return { raw: txt };
  }
}

function esperar(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function resolverComTorBox(
  apiKey: string,
  params: DebridResolveParams,
  fetchFn: FetchLike,
): Promise<DebridResolveResult> {
  const base = 'https://api.torbox.app/v1/api';
  const headersAuth = { Authorization: `Bearer ${apiKey}` };
  const magnet = montarMagnetLink(params.infoHash, params.sources, params.filename);

  const form = new FormData();
  form.append('magnet', magnet);

  const createRes = await fetchFn(`${base}/torrents/createtorrent`, {
    method: 'POST',
    headers: headersAuth,
    body: form as unknown as BodyInit,
  });
  const createJson = await lerJsonSeguro(createRes);
  if (!createRes.ok || createJson.success === false) {
    throw new ErroDebrid(
      String(createJson.detail || createJson.error || 'Falha ao enviar torrent ao TorBox.'),
      'TORBOX_ERRO',
      'torbox',
    );
  }

  const dataCreate = (createJson.data ?? {}) as Record<string, unknown>;
  const torrentId = dataCreate.torrent_id ?? dataCreate.id;
  if (!torrentId) {
    throw new ErroDebrid('TorBox não retornou ID do torrent.', 'TORBOX_ERRO', 'torbox');
  }

  let files: DebridFileCandidate[] = [];
  for (let tentativa = 0; tentativa < 4; tentativa++) {
    const infoRes = await fetchFn(`${base}/torrents/mylist?id=${encodeURIComponent(String(torrentId))}`, {
      headers: headersAuth,
    });
    const infoJson = await lerJsonSeguro(infoRes);
    const item = Array.isArray(infoJson.data)
      ? (infoJson.data[0] as Record<string, unknown> | undefined)
      : (infoJson.data as Record<string, unknown> | undefined);

    if (item && Array.isArray(item.files) && item.files.length > 0) {
      files = item.files.map((f: Record<string, unknown>, idx: number) => ({
        index: idx,
        id: Number(f.id ?? idx),
        name: String(f.short_name || f.name || `arquivo-${idx}`),
        size: Number(f.size || 0),
      }));
      break;
    }
    await esperar(750);
  }

  const escolhido = selecionarArquivoTorrent(files, params.fileIdx);
  const fileId = escolhido?.id ?? 0;

  const dlRes = await fetchFn(
    `${base}/torrents/requestdl?token=${encodeURIComponent(apiKey)}&torrent_id=${encodeURIComponent(String(torrentId))}&file_id=${encodeURIComponent(String(fileId))}&zip_link=false`,
    { headers: headersAuth },
  );
  const dlJson = await lerJsonSeguro(dlRes);
  if (!dlRes.ok || dlJson.success === false || typeof dlJson.data !== 'string') {
    throw new ErroDebrid(
      String(dlJson.detail || dlJson.error || 'Não foi possível gerar o link direto no TorBox.'),
      'TORBOX_DL_ERRO',
      'torbox',
    );
  }

  return {
    url: dlJson.data,
    provider: 'torbox',
    providerName: NOMES_PROVEDORES_DEBRID.torbox,
    ...(escolhido?.name ? { filename: escolhido.name } : {}),
  };
}

async function resolverComRealDebrid(
  apiKey: string,
  params: DebridResolveParams,
  fetchFn: FetchLike,
): Promise<DebridResolveResult> {
  const base = 'https://api.real-debrid.com/rest/1.0';
  const headersAuth = { Authorization: `Bearer ${apiKey}` };
  const magnet = montarMagnetLink(params.infoHash, params.sources, params.filename);

  const addRes = await fetchFn(`${base}/torrents/addMagnet`, {
    method: 'POST',
    headers: {
      ...headersAuth,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: criarFormUrlEncoded({ magnet }),
  });
  const addJson = await lerJsonSeguro(addRes);
  if (!addRes.ok || typeof addJson.id !== 'string') {
    throw new ErroDebrid(
      String(addJson.error || 'Falha ao enviar magnet ao Real-Debrid.'),
      'RD_ERRO',
      'realdebrid',
    );
  }

  const torrentId = addJson.id;
  let infoJson: Record<string, unknown> = {};
  let rdFiles: Array<{ id: number; path: string; bytes: number; selected?: number }> = [];

  for (let i = 0; i < 4; i++) {
    const res = await fetchFn(`${base}/torrents/info/${encodeURIComponent(torrentId)}`, {
      headers: headersAuth,
    });
    infoJson = await lerJsonSeguro(res);
    if (Array.isArray(infoJson.files) && infoJson.files.length > 0) {
      rdFiles = infoJson.files as typeof rdFiles;
      break;
    }
    await esperar(600);
  }

  const candidatos: DebridFileCandidate[] = rdFiles.map((f, idx) => ({
    index: idx,
    id: f.id,
    name: String(f.path || ''),
    size: Number(f.bytes || 0),
  }));
  const escolhido = selecionarArquivoTorrent(candidatos, params.fileIdx);
  const rdFileId = escolhido?.id !== undefined ? String(escolhido.id) : 'all';

  const selRes = await fetchFn(`${base}/torrents/selectFiles/${encodeURIComponent(torrentId)}`, {
    method: 'POST',
    headers: {
      ...headersAuth,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: criarFormUrlEncoded({ files: rdFileId }),
  });
  if (!selRes.ok && selRes.status !== 204) {
    const selJson = await lerJsonSeguro(selRes);
    throw new ErroDebrid(
      String(selJson.error || 'Não foi possível selecionar o arquivo no Real-Debrid.'),
      'RD_SELECT_ERRO',
      'realdebrid',
    );
  }

  let links: string[] = [];
  for (let i = 0; i < 6; i++) {
    const infoRes = await fetchFn(`${base}/torrents/info/${encodeURIComponent(torrentId)}`, {
      headers: headersAuth,
    });
    infoJson = await lerJsonSeguro(infoRes);
    if (Array.isArray(infoJson.links) && infoJson.links.length > 0) {
      links = infoJson.links.filter((l): l is string => typeof l === 'string');
      break;
    }
    const status = String(infoJson.status || '');
    if (status === 'magnet_error' || status === 'error' || status === 'virus' || status === 'dead') {
      throw new ErroDebrid(`Real-Debrid retornou status "${status}".`, 'RD_STATUS_ERRO', 'realdebrid');
    }
    await esperar(800);
  }

  if (links.length === 0) {
    throw new ErroDebrid(
      'Este torrent não está disponível em cache instantâneo no Real-Debrid no momento.',
      'RD_SEM_CACHE',
      'realdebrid',
    );
  }

  const unrestrictRes = await fetchFn(`${base}/unrestrict/link`, {
    method: 'POST',
    headers: {
      ...headersAuth,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: criarFormUrlEncoded({ link: links[0] }),
  });
  const unrestrictJson = await lerJsonSeguro(unrestrictRes);
  if (!unrestrictRes.ok || typeof unrestrictJson.download !== 'string') {
    throw new ErroDebrid(
      String(unrestrictJson.error || 'Falha ao gerar link final no Real-Debrid.'),
      'RD_UNRESTRICT_ERRO',
      'realdebrid',
    );
  }

  return {
    url: unrestrictJson.download,
    provider: 'realdebrid',
    providerName: NOMES_PROVEDORES_DEBRID.realdebrid,
    ...(typeof unrestrictJson.filename === 'string'
      ? { filename: unrestrictJson.filename }
      : escolhido?.name
        ? { filename: escolhido.name }
        : {}),
  };
}

function extrairArquivosAllDebrid(
  rawFiles: unknown,
  linksAcc: DebridFileCandidate[],
): void {
  if (!Array.isArray(rawFiles)) return;
  for (const item of rawFiles) {
    if (!item || typeof item !== 'object') continue;
    const obj = item as Record<string, unknown>;
    if (typeof obj.l === 'string' && obj.l) {
      linksAcc.push({
        index: linksAcc.length,
        name: String(obj.n || `arquivo-${linksAcc.length}`),
        size: Number(obj.s || 0),
        link: obj.l,
      });
    }
    if (Array.isArray(obj.e)) {
      extrairArquivosAllDebrid(obj.e, linksAcc);
    }
  }
}

async function resolverComAllDebrid(
  apiKey: string,
  params: DebridResolveParams,
  fetchFn: FetchLike,
): Promise<DebridResolveResult> {
  const base = 'https://api.alldebrid.com/v4';
  const authQuery = `agent=saimo&apikey=${encodeURIComponent(apiKey)}`;
  const headersAuth = { Authorization: `Bearer ${apiKey}` };
  const magnet = montarMagnetLink(params.infoHash, params.sources, params.filename);

  const upRes = await fetchFn(
    `${base}/magnet/upload?${authQuery}&magnets[]=${encodeURIComponent(magnet)}`,
    { headers: headersAuth },
  );
  const upJson = await lerJsonSeguro(upRes);
  const dataUp = (upJson.data ?? {}) as Record<string, unknown>;
  const magnetsArr = Array.isArray(dataUp.magnets) ? dataUp.magnets : [];
  const primeiro = (magnetsArr[0] ?? {}) as Record<string, unknown>;
  const magnetId = primeiro.id;

  if (!upRes.ok || upJson.status !== 'success' || !magnetId) {
    const errObj = (upJson.error ?? primeiro.error ?? {}) as Record<string, unknown>;
    throw new ErroDebrid(
      String(errObj.message || 'Falha ao enviar magnet ao AllDebrid.'),
      'AD_ERRO',
      'alldebrid',
    );
  }

  let candidatos: DebridFileCandidate[] = [];
  for (let i = 0; i < 4; i++) {
    const stRes = await fetchFn(
      `${base}/magnet/status?${authQuery}&id=${encodeURIComponent(String(magnetId))}`,
      { headers: headersAuth },
    );
    const stJson = await lerJsonSeguro(stRes);
    const stData = (stJson.data ?? {}) as Record<string, unknown>;
    const magnetObj = Array.isArray(stData.magnets)
      ? (stData.magnets[0] as Record<string, unknown> | undefined)
      : (stData.magnets as Record<string, unknown> | undefined);

    if (magnetObj) {
      if (Array.isArray(magnetObj.links) && magnetObj.links.length > 0) {
        candidatos = magnetObj.links.map((l: Record<string, unknown>, idx: number) => ({
          index: idx,
          name: String(l.filename || `arquivo-${idx}`),
          size: Number(l.size || 0),
          link: String(l.link || ''),
        })).filter((c: DebridFileCandidate) => !!c.link);
        break;
      }
      if (Array.isArray(magnetObj.files) && magnetObj.files.length > 0) {
        const acc: DebridFileCandidate[] = [];
        extrairArquivosAllDebrid(magnetObj.files, acc);
        if (acc.length > 0) {
          candidatos = acc;
          break;
        }
      }
    }
    await esperar(700);
  }

  const escolhido = selecionarArquivoTorrent(candidatos, params.fileIdx);
  if (!escolhido?.link) {
    throw new ErroDebrid(
      'Este torrent ainda não está pronto ou em cache no AllDebrid.',
      'AD_SEM_CACHE',
      'alldebrid',
    );
  }

  const unlockRes = await fetchFn(
    `${base}/link/unlock?${authQuery}&link=${encodeURIComponent(escolhido.link)}`,
    { headers: headersAuth },
  );
  const unlockJson = await lerJsonSeguro(unlockRes);
  const unlockData = (unlockJson.data ?? {}) as Record<string, unknown>;
  if (!unlockRes.ok || unlockJson.status !== 'success' || typeof unlockData.link !== 'string') {
    const errObj = (unlockJson.error ?? {}) as Record<string, unknown>;
    throw new ErroDebrid(
      String(errObj.message || 'Falha ao desbloquear link no AllDebrid.'),
      'AD_UNLOCK_ERRO',
      'alldebrid',
    );
  }

  return {
    url: unlockData.link,
    provider: 'alldebrid',
    providerName: NOMES_PROVEDORES_DEBRID.alldebrid,
    ...(escolhido.name ? { filename: escolhido.name } : {}),
  };
}

async function resolverComPremiumize(
  apiKey: string,
  params: DebridResolveParams,
  fetchFn: FetchLike,
): Promise<DebridResolveResult> {
  const magnet = montarMagnetLink(params.infoHash, params.sources, params.filename);
  const res = await fetchFn('https://www.premiumize.me/api/transfer/directdl', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: criarFormUrlEncoded({ apikey: apiKey, src: magnet }),
  });
  const json = await lerJsonSeguro(res);
  if (!res.ok || json.status !== 'success' || !Array.isArray(json.content)) {
    throw new ErroDebrid(
      String(json.message || 'Torrent indisponível em cache no Premiumize.'),
      'PM_ERRO',
      'premiumize',
    );
  }

  const candidatos: DebridFileCandidate[] = json.content
    .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
    .map((item, idx) => ({
      index: idx,
      name: String(item.path || `arquivo-${idx}`),
      size: Number(item.size || 0),
      link: String(item.stream_link || item.link || ''),
    }))
    .filter((c) => !!c.link);

  const escolhido = selecionarArquivoTorrent(candidatos, params.fileIdx);
  if (!escolhido?.link) {
    throw new ErroDebrid('Nenhum arquivo de vídeo reproduzível retornado pelo Premiumize.', 'PM_VAZIO', 'premiumize');
  }

  return {
    url: escolhido.link,
    provider: 'premiumize',
    providerName: NOMES_PROVEDORES_DEBRID.premiumize,
    ...(escolhido.name ? { filename: escolhido.name } : {}),
  };
}

/**
 * Resolve um `infoHash` de torrent sob demanda nos provedores Debrid habilitados.
 * Nunca usa libtorrent/P2P local: todas as chamadas vão via HTTPS para o Debrid escolhido.
 */
export async function resolverTorrentViaDebrid(
  config: DebridConfig,
  params: DebridResolveParams,
  fetchFn: FetchLike = fetch,
): Promise<DebridResolveResult> {
  const ativos = obterProvedoresDebridAtivos(config);
  if (ativos.length === 0) {
    throw new ErroDebrid(
      'Este stream é um torrent e exige um serviço Debrid configurado. Abra Ajustes > Addons e Debrid para informar sua chave (TorBox, Real-Debrid, AllDebrid ou Premiumize).',
      'DEBRID_NAO_CONFIGURADO',
    );
  }

  const erros: string[] = [];
  for (const prov of ativos) {
    try {
      switch (prov.id) {
        case 'torbox':
          return await resolverComTorBox(prov.apiKey, params, fetchFn);
        case 'realdebrid':
          return await resolverComRealDebrid(prov.apiKey, params, fetchFn);
        case 'alldebrid':
          return await resolverComAllDebrid(prov.apiKey, params, fetchFn);
        case 'premiumize':
          return await resolverComPremiumize(prov.apiKey, params, fetchFn);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'erro desconhecido';
      erros.push(`${prov.name}: ${msg}`);
    }
  }

  throw new ErroDebrid(
    erros.join('\n') || 'Não foi possível resolver este torrent nos provedores Debrid ativos.',
    'DEBRID_FALHOU',
  );
}

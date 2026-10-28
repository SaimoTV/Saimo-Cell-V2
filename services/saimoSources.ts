import AsyncStorage from '@react-native-async-storage/async-storage';
import { Paths, File as FSFile, Directory } from 'expo-file-system';

import type { Channel, ChannelStream, MediaItem, TMDBData } from '../types';

import { baseCanais, baseFilmes, exigirBaseCanais, exigirBaseFilmes, SemEnderecoError } from './enderecos';

const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Linux; Android 13; Mobile) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36';
const CACHE_PREFIX = 'saimo-source-v6:';
const CACHE_TTL = 6 * 60 * 60 * 1000;

interface CachedText {
  savedAt: number;
  text: string;
}

export interface VodIndexEntry {
  letter: string;
  movies: number;
  series: number;
  reserved: number;
}

export interface VodIndex {
  bases: string[];
  entries: VodIndexEntry[];
}

interface VodSearchEntry {
  title: string;
  series: boolean;
  letter: string;
  year: string;
}

function slug(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function normalise(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Ordem das seções da lista, a mesma do Mac e do site. */
export const ORDEM_CATEGORIAS = [
  'TV Aberta', 'Filmes e Séries', 'Esportes', 'Notícias', 'Infantil',
  'Documentários', 'Pluto TV', '24 Horas', 'Variedades', 'Adulto',
];

/** Seção de canal sem `categoria:` no catálogo (nenhuma regra pelo nome). */
export const CATEGORIA_PADRAO = 'Outros';

function channelId(name: string): string {
  return `remote-${slug(name)}`;
}

function cacheKey(name: string): string {
  return `${CACHE_PREFIX}${name.replace(/[^a-zA-Z0-9_.#-]/g, '_')}`;
}

/**
 * As listas baixadas ficam em arquivos, um por lista, e não no AsyncStorage.
 *
 * O AsyncStorage do Android tem 6 MB no total e estas listas já ocupavam 5,3:
 * o índice de busca e as fichas (4,8 MB juntos) nem cabiam mais — a gravação
 * falhava calada e eles eram baixados de novo a cada abertura — e o que
 * sobrava ficava apertado para favoritos e histórico. A data do arquivo é a
 * data da cópia.
 */
function arquivoDaLista(name: string): FSFile {
  const pasta = new Directory(Paths.cache, 'saimo-listas');
  if (!pasta.exists) pasta.create({ intermediates: true, idempotent: true });
  return new FSFile(pasta, cacheKey(name).slice(CACHE_PREFIX.length));
}

async function readCache(name: string): Promise<CachedText | null> {
  try {
    const arquivo = arquivoDaLista(name);
    if (arquivo.exists) return { savedAt: arquivo.lastModified ?? 0, text: arquivo.textSync() };
    // Cópia de antes da 2.1.4, no AsyncStorage: passa para o arquivo e sai de lá.
    const raw = await AsyncStorage.getItem(cacheKey(name));
    if (!raw) return null;
    const antiga = JSON.parse(raw) as CachedText;
    await AsyncStorage.removeItem(cacheKey(name));
    if (antiga?.text?.trim()) arquivo.write(antiga.text);
    return antiga;
  } catch {
    return null;
  }
}

async function writeCache(name: string, text: string): Promise<void> {
  try {
    arquivoDaLista(name).write(text);
  } catch {
    // A resposta da rede continua válida mesmo quando o aparelho está sem espaço.
  }
}

async function fetchText(url: string, name: string, force = false): Promise<string> {
  const cached = await readCache(name);
  if (!force && cached && Date.now() - cached.savedAt < CACHE_TTL && cached.text.trim()) {
    return cached.text;
  }

  try {
    const targetUrl = force
      ? `${url}${url.includes('?') ? '&' : '?'}t=${Date.now()}`
      : url;
    const response = await fetch(targetUrl, {
      cache: 'no-store',
      headers: {
        Accept: 'text/plain,*/*',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        Pragma: 'no-cache',
        'User-Agent': DEFAULT_USER_AGENT,
      },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const text = await response.text();
    if (!text.trim()) throw new Error('resposta vazia');
    await writeCache(name, text);
    return text;
  } catch (error) {
    if (cached?.text.trim()) return cached.text;
    throw error;
  }
}

/** Arquivo da lista de canais, no endereço de hoje. Sem endereço: nenhum pedido. */
async function textoCanais(arquivo: string, nomeNoCache: string, force = false): Promise<string> {
  const base = await exigirBaseCanais();
  return fetchText(`${base}${arquivo}`, nomeNoCache, force);
}

/** Arquivo da lista de filmes e séries, no endereço de hoje. */
async function textoFilmes(arquivo: string, nomeNoCache: string, force = false): Promise<string> {
  const base = await exigirBaseFilmes();
  return fetchText(`${base}${arquivo}`, nomeNoCache, force);
}

/** `guia.txt` (tabelas do guia de programação), servido pelo endereço dos canais. */
export async function lerGuiaTxt(force = false): Promise<string> {
  return textoCanais('guia.txt', 'guia.txt', force);
}

function streamHeaders(stream: ChannelStream): Record<string, string> {
  // O `Accept` e o `User-Agent` vão sempre: o player não manda Accept por conta
  // própria, e em DataSourceUtil.kt um stream sem headers reaproveita o factory
  // (e portanto o Referer/User-Agent) do stream anterior.
  const headers: Record<string, string> = {
    Accept: '*/*',
    'User-Agent': DEFAULT_USER_AGENT,
    ...(stream.headers ?? {}),
  };
  if (stream.url.includes('s1001604.lat') && !headers.Referer) {
    headers.Referer = 'https://meufut.top/';
  }
  return headers;
}

function channelFrom(name: string, logo: string, category: string, streams: ChannelStream[]): Channel {
  const normalizedStreams = streams.map(stream => ({
    ...stream,
    headers: streamHeaders(stream),
  }));
  const primary = normalizedStreams[0];
  return {
    id: channelId(name),
    name,
    logo,
    category: category || CATEGORIA_PADRAO,
    url: primary?.url ?? '',
    headers: primary?.headers,
    drm: primary?.drm,
    streams: normalizedStreams,
  };
}

/** Parser do formato rico de catalogo.txt (fonte/referer/agente/chave). */
export function parseChannelCatalog(text: string): Channel[] {
  if (text.trimStart().startsWith('#EXTM3U')) return parseM3U(text);

  const result: Channel[] = [];
  let name = '';
  let logo = '';
  let categoria = '';
  let streams: ChannelStream[] = [];

  const flush = () => {
    if (name && streams.length) {
      result.push(channelFrom(name, logo, categoria, streams));
    }
    name = '';
    logo = '';
    categoria = '';
    streams = [];
  };

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const colon = line.indexOf(':');
    if (colon <= 0) continue;
    const field = line.slice(0, colon).toLowerCase();
    const value = line.slice(colon + 1).trim();
    if (!value) continue;

    if (field === 'canal') {
      flush();
      name = value;
    } else if (field === 'logo') {
      logo = value;
    } else if (field === 'categoria') {
      categoria = value;
    } else if (field === 'fonte') {
      streams.push({ url: value });
    } else if (field === 'nome' && streams.length) {
      streams[streams.length - 1].name = value;
    } else if (field === 'qualidade' && streams.length) {
      streams[streams.length - 1].quality = value;
    } else if ((field === 'referer' || field === 'agente') && streams.length) {
      const current = streams[streams.length - 1];
      current.headers = {
        ...(current.headers ?? {}),
        [field === 'referer' ? 'Referer' : 'User-Agent']: value,
      };
    } else if (field === 'chave' && streams.length) {
      const parts = value.split(':').map(part => part.trim());
      if (parts.length === 2 && parts.every(Boolean)) {
        streams[streams.length - 1].drm = {
          clearKey: `${parts[0]}:${parts[1]}`,
        };
      } else {
        streams.pop();
      }
    }
  }
  flush();
  return result;
}

function readM3UAttribute(line: string, attribute: string): string {
  const match = new RegExp(`${attribute}="([^"]*)"`, 'i').exec(line);
  return match?.[1]?.trim() ?? '';
}

function m3uDisplayName(line: string): string {
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    if (line[index] === '"') quoted = !quoted;
    if (line[index] === ',' && !quoted) return line.slice(index + 1).trim();
  }
  return line.slice(line.lastIndexOf(',') + 1).trim();
}

/** Parser da lista M3U de reservas. Entradas com o mesmo tvg-id viram fontes. */
export function parseM3U(text: string): Channel[] {
  const result = new Map<string, Channel>();
  let pending: { name: string; logo: string; category: string } | null = null;

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line === '#EXTM3U') continue;
    if (line.startsWith('#EXTINF:')) {
      const tvgId = readM3UAttribute(line, 'tvg-id');
      const rawName = m3uDisplayName(line);
      pending = {
        name: tvgId || rawName.replace(/\s*\([^)]+\)$/, '').trim(),
        logo: readM3UAttribute(line, 'tvg-logo'),
        // O rótulo do grupo como a lista escreve; assembleChannels o ajusta às
        // seções do catálogo.
        category: readM3UAttribute(line, 'group-title'),
      };
      continue;
    }
    if (line.startsWith('#') || !pending?.name) continue;

    const key = normalise(pending.name);
    const current = result.get(key);
    if (current) {
      if (!current.streams?.some(stream => stream.url === line)) {
        const extraStream: ChannelStream = { url: line };
        extraStream.headers = streamHeaders(extraStream);
        current.streams = [...(current.streams ?? []), extraStream];
      }
    } else {
      result.set(key, channelFrom(pending.name, pending.logo, pending.category, [{ url: line }]));
    }
    pending = null;
  }
  return [...result.values()];
}

/** O catálogo rico manda; o M3U apenas completa categorias, logos e reservas. */
export function mergeChannels(primary: Channel[], extras: Channel[]): Channel[] {
  if (!primary.length) return extras.map((channel, index) => ({ ...channel, channelNumber: index + 1 }));
  const byName = new Map(extras.map(channel => [normalise(channel.name), channel]));
  const used = new Set<string>();
  const merged = primary.map(channel => {
    const key = normalise(channel.name);
    const extra = byName.get(key);
    if (!extra) return channel;
    used.add(key);
    const known = new Set((channel.streams ?? []).map(stream => stream.url));
    const additional = (extra.streams ?? []).filter(stream => !known.has(stream.url));
    // O catálogo rico publicado permanece na frente; as entradas do M3U Git
    // são reservas. O Android adapta nativamente os hosts especiais Telecine.
    const streams = [...(channel.streams ?? []), ...additional].map(stream => ({
      ...stream,
      headers: streamHeaders(stream),
    }));
    const first = streams[0];
    return {
      ...channel,
      // O catálogo declara a seção de cada canal; o M3U só completa.
      category: channel.category || extra.category,
      logo: channel.logo || extra.logo,
      streams,
      url: first?.url ?? channel.url,
      headers: first ? streamHeaders(first) : channel.headers,
      drm: first?.drm ?? channel.drm,
    };
  });
  merged.push(...extras.filter(channel => !used.has(normalise(channel.name))));
  return merged.map((channel, index) => ({ ...channel, channelNumber: index + 1 }));
}

function assembleChannels(catalogText: string, extrasText: string, restritosText: string): Channel[] {
  const primary = catalogText.trim() ? parseChannelCatalog(catalogText) : [];
  const reserves = extrasText.trim() ? parseM3U(extrasText) : [];
  const merged = mergeChannels(primary, reserves);
  if (!merged.length) return [];
  // Canal que só existe na lista de reservas: o rótulo do grupo vale se for uma
  // das seções que o catálogo declara; senão vai para "Outros".
  const secoes = new Map(primary.map(c => [normalise(c.category), c.category]));
  const doCatalogo = new Set(primary.map(c => normalise(c.name)));
  for (const channel of merged) {
    if (doCatalogo.has(normalise(channel.name))) continue;
    channel.category = secoes.get(normalise(channel.category)) ?? CATEGORIA_PADRAO;
  }
  if (restritosText.trim()) {
    const nomes = new Set(merged.map(channel => normalise(channel.name)));
    for (const channel of parseChannelCatalog(restritosText)) {
      if (nomes.has(normalise(channel.name))) continue;
      merged.push({ ...channel, category: 'Adulto' });
    }
  }
  const posicao = (categoria: string) => {
    if (categoria === CATEGORIA_PADRAO) return ORDEM_CATEGORIAS.length + 1;
    const i = ORDEM_CATEGORIAS.indexOf(categoria);
    return i < 0 ? ORDEM_CATEGORIAS.length : i;
  };
  return peneirarCanais([...merged])
    .sort((a, b) => posicao(a.category) - posicao(b.category) || a.name.localeCompare(b.name, 'pt-BR'))
    .map((channel, index) => ({ ...channel, channelNumber: index + 1 }));
}

/** Lê a lista já salva em disco sem tocar na rede, para abertura imediata. */
export async function loadCachedChannels(): Promise<Channel[] | null> {
  if (!(await baseCanais())) return null;
  const [catalog, extras, restritos] = await Promise.all([
    readCache('catalogo.txt'),
    readCache('canais.txt'),
    readCache('restritos.txt'),
  ]);
  const channels = assembleChannels(
    catalog?.text ?? '',
    extras?.text ?? '',
    restritos?.text ?? '',
  );
  return channels.length ? channels : null;
}

/** Sem endereço da lista de canais devolve [] sem ir à rede. */
export async function loadRemoteChannels(force = true): Promise<Channel[]> {
  if (!(await baseCanais())) return [];
  const [catalog, extras, restritos] = await Promise.allSettled([
    textoCanais('catalogo.txt', 'catalogo.txt', force),
    textoCanais('canais.txt', 'canais.txt', force),
    textoCanais('restritos.txt', 'restritos.txt', force),
  ]);
  const channels = assembleChannels(
    catalog.status === 'fulfilled' ? catalog.value : '',
    extras.status === 'fulfilled' ? extras.value : '',
    restritos.status === 'fulfilled' ? restritos.value : '',
  );
  if (!channels.length) throw new Error('A lista remota não contém canais válidos');
  return channels;
}

export function parseVodIndex(text: string): VodIndex {
  const bases: string[] = [];
  const entries: VodIndexEntry[] = [];
  for (const raw of text.split(/\r?\n/)) {
    if (raw.startsWith('base:')) {
      const match = /^base:\s+(\d+)\s+(.+)$/.exec(raw.trim());
      if (match) bases[Number(match[1])] = match[2].trim();
      continue;
    }
    const fields = raw.split('\t');
    if (fields.length >= 3 && fields[0].trim()) {
      entries.push({
        letter: fields[0].trim(),
        movies: Number(fields[1]) || 0,
        series: Number(fields[2]) || 0,
        reserved: Number(fields[3]) || 0,
      });
    }
  }
  return { bases, entries };
}

let vodIndex: VodIndex | null = null;

export async function loadVodIndex(force = false): Promise<VodIndex> {
  if (vodIndex && !force) return vodIndex;
  const text = await textoFilmes('indice.txt', 'vod-indice.txt', force);
  const parsed = parseVodIndex(text);
  if (!parsed.bases.length || !parsed.entries.length) throw new Error('Índice VOD inválido');
  vodIndex = parsed;
  return parsed;
}

function vodUrl(value: string, bases: string[]): string {
  if (/^https?:\/\//i.test(value)) return value;
  const colon = value.indexOf(':');
  if (colon <= 0) return '';
  const base = bases[Number(value.slice(0, colon))];
  if (!base) return '';
  const rest = value.slice(colon + 1);
  return `${base}${rest}${rest.includes('.') ? '' : '.mp4'}`;
}

export function makeVodId(type: 'movie' | 'series', letter: string, title: string, year = ''): string {
  return `saimo|${type === 'series' ? 's' : 'm'}|${encodeURIComponent(letter)}|${encodeURIComponent(title)}|${encodeURIComponent(year)}`;
}

export function parseVodId(id: string): { type: 'movie' | 'series'; letter: string; title: string; year: string } | null {
  const fields = id.split('|');
  if (fields.length !== 5 || fields[0] !== 'saimo' || !['m', 's'].includes(fields[1])) return null;
  try {
    return {
      type: fields[1] === 's' ? 'series' : 'movie',
      letter: decodeURIComponent(fields[2]),
      title: decodeURIComponent(fields[3]),
      year: decodeURIComponent(fields[4]),
    };
  } catch {
    return null;
  }
}

function basicTmdb(title: string, year = ''): TMDBData {
  return {
    id: 0,
    title,
    overview: '',
    year,
    rating: 0,
    genres: [],
    poster: '',
    cast: [],
  };
}

function movieItems(text: string, letter: string, bases: string[]): MediaItem[] {
  const result: MediaItem[] = [];
  for (const line of text.split(/\r?\n/)) {
    const fields = line.split('\t');
    const title = fields[0]?.trim();
    if (!title || fields.length < 2) continue;
    const sources = semDesligadas(fields.slice(1).flatMap(field => {
      const equals = field.indexOf('=');
      if (equals <= 0) return [];
      const label = field.slice(0, equals).trim();
      return field.slice(equals + 1).split(',')
        .map(value => vodUrl(value.trim(), bases))
        .filter(Boolean)
        .map(url => ({ url, label }));
    }));
    if (!sources.length) continue;
    const year = /(?:19|20)\d{2}/.exec(title)?.[0] ?? '';
    result.push({
      id: makeVodId('movie', letter, title),
      name: title,
      url: sources[0].url,
      sources,
      category: `filmes-${letter}`,
      categoryLabel: `Filmes • ${letter}`,
      type: 'movie',
      isAdult: false,
      tmdb: basicTmdb(title, year),
    });
  }
  return result;
}

function seriesItems(text: string, letter: string): MediaItem[] {
  const result: MediaItem[] = [];
  for (const line of text.split(/\r?\n/)) {
    const fields = line.split('\t');
    const title = fields[0]?.trim();
    if (!title || fields.length < 4) continue;
    const year = fields[1]?.trim() ?? '';
    const chunk = Number(fields[2]) || 0;
    const totalEpisodes = Number(fields[3]) || 0;
    result.push({
      id: makeVodId('series', letter, title, year),
      name: title,
      url: '',
      category: `series-${letter}`,
      categoryLabel: `Séries • ${letter}`,
      type: 'tv',
      isAdult: false,
      totalEpisodes,
      vodChunk: chunk,
      tmdb: basicTmdb(title, year),
    });
  }
  return result;
}

/** Animes e doramas publicados com os episódios no próprio arquivo. */
export async function loadVodCollection(
  kind: 'animes' | 'doramas',
  force = false,
): Promise<MediaItem[]> {
  const index = await loadVodIndex(force);
  const text = await textoFilmes(`redeflix/links-${kind}.txt`, `vod-redeflix-${kind}.txt`, force);
  const result: MediaItem[] = [];
  let current: MediaItem | null = null;
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    if (line.startsWith('@')) {
      const [title = '', year = '', tmdbId = ''] = line.slice(1).split('\t');
      if (!title.trim()) { current = null; continue; }
      current = {
        id: makeVodId('series', `redeflix-${kind}`, title.trim(), year.trim()),
        name: title.trim(),
        url: '',
        category: kind,
        categoryLabel: kind === 'animes' ? 'Animes' : 'Doramas',
        type: 'tv',
        isAdult: false,
        tmdb: { ...basicTmdb(title.trim(), year.trim()), id: Number(tmdbId) || 0 },
        episodes: {},
      };
      result.push(current);
      continue;
    }
    if (!current?.episodes) continue;
    const fields = line.split('\t');
    if (fields.length < 4) continue;
    const season = String(Number(fields[0]) || 0);
    const episode = Number(fields[1]) || 0;
    const label = fields[2] || 'dub';
    const sources = semDesligadas(fields[3].split(',')
      .map(url => vodUrl(url.trim(), index.bases))
      .filter(Boolean)
      .map(url => ({ url, label })));
    if (!sources.length) continue;
    if (!current.episodes[season]) current.episodes[season] = [];
    current.episodes[season].push({
      id: `${current.id}|e|${season}|${episode}`,
      episode,
      name: label === 'leg' ? 'Legendado' : 'Dublado',
      url: sources[0].url,
      sources,
    });
  }
  return result.filter(item => Object.keys(item.episodes || {}).length > 0).map(item => ({
    ...item,
    totalSeasons: Object.keys(item.episodes || {}).length,
    totalEpisodes: Object.values(item.episodes || {}).reduce((total, episodes) => total + episodes.length, 0),
  }));
}

export async function loadVodCategory(
  type: 'movie' | 'series',
  letter: string,
  force = false,
): Promise<MediaItem[]> {
  const index = await loadVodIndex(force);
  const safeLetter = letter === '#' ? '%23' : encodeURIComponent(letter);
  const file = `${type === 'movie' ? 'filmes' : 'series'}-${safeLetter}.txt`;
  const text = await textoFilmes(file, `vod-${file}`, force);
  return type === 'movie' ? movieItems(text, letter, index.bases) : seriesItems(text, letter);
}

async function loadSeriesEpisodes(item: MediaItem, letter: string): Promise<MediaItem> {
  const index = await loadVodIndex();
  const safeLetter = letter === '#' ? '%23' : encodeURIComponent(letter);
  const chunk = item.vodChunk ?? 0;
  const file = `series-${safeLetter}-${chunk}.txt`;
  const text = await textoFilmes(file, `vod-${file}`);
  const parsed = parseVodId(item.id);
  if (!parsed) return item;

  let inside = false;
  const episodes: NonNullable<MediaItem['episodes']> = {};
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith('@')) {
      if (inside) break;
      const [title, year = ''] = line.slice(1).split('\t');
      inside = title === parsed.title && year === parsed.year;
      continue;
    }
    if (!inside) continue;
    const fields = line.split('\t');
    if (fields.length < 4) continue;
    const season = String(Number(fields[0]) || 0);
    const episode = Number(fields[1]) || 0;
    const label = fields[2] || '';
    const sources = semDesligadas(fields[3].split(',')
      .map(value => vodUrl(value.trim(), index.bases))
      .filter(Boolean)
      .map(url => ({ url, label })));
    if (!sources.length) continue;
    if (!episodes[season]) episodes[season] = [];
    episodes[season].push({
      id: `${item.id}|e|${season}|${episode}`,
      episode,
      name: `${label === 'leg' ? 'Legendado' : 'Dublado'}`,
      url: sources[0].url,
      sources,
    });
  }
  return { ...item, episodes, totalSeasons: Object.keys(episodes).length };
}

// Buscava no Cinemeta e ficava com o primeiro resultado, sem comparar nome
// nenhum. `getTMDBData` (services/tmdbService.ts) pontua por título, ano e
// popularidade com o mesmo algoritmo do api-saimo-tv, que alimenta o
// catálogo do Supabase — o nome `getCinemetaData` ficou só para não mexer
// nos dois lugares que já chamam por ele.
import { getTMDBData, clearTMDBCache } from './tmdbService';
import { peneirar as semDesligadas, peneirarCanais } from './fontesDesativadas';
export { getTMDBData as getCinemetaData } from './tmdbService';

export async function enrichVodItem(item: MediaItem): Promise<MediaItem> {
  const meta = await getTMDBData(item.name, item.type === 'tv');
  return { ...item, tmdb: { ...basicTmdb(item.name, item.tmdb?.year), ...item.tmdb, ...meta } };
}

export async function getVodItem(id: string): Promise<MediaItem> {
  const parsed = parseVodId(id);
  if (!parsed) throw new Error('Identificador VOD inválido');
  if (parsed.letter === 'redeflix-animes' || parsed.letter === 'redeflix-doramas') {
    const kind = parsed.letter.endsWith('animes') ? 'animes' : 'doramas';
    const items = await loadVodCollection(kind);
    const item = items.find(candidate => candidate.name === parsed.title
      && (candidate.tmdb?.year ?? '') === parsed.year);
    if (!item) throw new Error('Título não encontrado na coleção atual');
    return enrichVodItem(item);
  }
  const items = await loadVodCategory(parsed.type, parsed.letter);
  // Expo Router decodifica os parâmetros da rota. O nome e o ano são a
  // identidade canônica no arquivo da categoria e não dependem de quantas
  // vezes caracteres reservados (#, %, ?, etc.) foram decodificados.
  let item = items.find(candidate => candidate.name === parsed.title
    && (parsed.type === 'movie' || (candidate.tmdb?.year ?? '') === parsed.year));
  if (!item) throw new Error('Título não encontrado no catálogo atual');
  if (parsed.type === 'series') item = await loadSeriesEpisodes(item, parsed.letter);
  return enrichVodItem(item);
}

let searchIndex: VodSearchEntry[] | null = null;

/// Nome e ano já normalizados, guardados na própria entrada: a normalização
/// rodava para os 32 mil títulos a cada letra digitada na busca.
const chavesDeBusca = new WeakMap<VodSearchEntry, string>();
function chaveDeBusca(entry: VodSearchEntry): string {
  let chave = chavesDeBusca.get(entry);
  if (chave === undefined) {
    chave = normalise(`${entry.title} ${entry.year}`);
    chavesDeBusca.set(entry, chave);
  }
  return chave;
}

async function loadSearchIndex(): Promise<VodSearchEntry[]> {
  if (searchIndex) return searchIndex;
  const text = await textoFilmes('busca.txt', 'vod-busca.txt');
  searchIndex = text.split(/\r?\n/).flatMap(line => {
    const fields = line.split('\t');
    if (fields.length < 3 || !fields[0]) return [];
    return [{ title: fields[0], series: fields[1] === 's', letter: fields[2], year: fields[3] || '' }];
  });
  return searchIndex;
}

/**
 * Títulos do índice que batem com a busca. `limite` corta a lista que vai
 * para a tela; quem precisa do índice inteiro (a filmografia de um ator, que
 * cruza por nome com todo o acervo) pede sem limite — com o corte em 500,
 * só os primeiros títulos em ordem alfabética entravam, e o elenco de quase
 * todo mundo aparecia vazio.
 */
export async function searchVod(query: string, type?: 'movie' | 'series', limite = 500): Promise<MediaItem[]> {
  const wanted = normalise(query);
  const index = await loadSearchIndex();
  return index
    .filter(entry => (!type || (entry.series ? 'series' : 'movie') === type))
    .filter(entry => !wanted || chaveDeBusca(entry).includes(wanted))
    .slice(0, limite)
    .map(itemDaBusca);
}

function itemDaBusca(entry: VodSearchEntry): MediaItem {
  return {
    id: makeVodId(entry.series ? 'series' : 'movie', entry.letter, entry.title, entry.year),
    name: entry.title,
    url: '',
    category: `${entry.series ? 'series' : 'filmes'}-${entry.letter}`,
    categoryLabel: `${entry.series ? 'Séries' : 'Filmes'} • ${entry.letter}`,
    type: entry.series ? 'tv' : 'movie',
    isAdult: false,
    tmdb: basicTmdb(entry.title, entry.year),
  };
}

const ARQUIVOS_DE_CANAIS = ['catalogo.txt', 'canais.txt', 'restritos.txt', 'guia.txt'];

/**
 * Apaga as cópias guardadas de uma lista (ou das duas): `canais` = catálogo,
 * reservas, restritos e guia.txt; `filmes` = tudo o que veio do endereço de filmes.
 */
export async function clearSaimoSourceCache(parte?: 'canais' | 'filmes'): Promise<void> {
  const filmes = !parte || parte === 'filmes';
  const canais = !parte || parte === 'canais';
  if (filmes) {
    vodIndex = null;
    searchIndex = null;
    fichasEmMemoria = null;
    clearTMDBCache();
  }
  try {
    const keys = await AsyncStorage.getAllKeys();
    const sourceKeys = keys.filter(key => key.startsWith(CACHE_PREFIX));
    if (sourceKeys.length) await AsyncStorage.multiRemove(sourceKeys);
  } catch {}
  try {
    const pasta = new Directory(Paths.cache, 'saimo-listas');
    if (!pasta.exists) return;
    if (!parte) { pasta.delete(); return; }
    const deCanais = new Set(ARQUIVOS_DE_CANAIS.map(n => cacheKey(n).slice(CACHE_PREFIX.length)));
    for (const entrada of pasta.list()) {
      const eCanais = deCanais.has(entrada.name);
      if ((eCanais && canais) || (!eCanais && filmes)) entrada.delete();
    }
  } catch {}
}

/**
 * As fileiras da tela inicial, prontas para desenhar.
 *
 * O acervo tem trinta e quatro mil títulos e nenhuma data de entrada, então o
 * aparelho não tem como descobrir sozinho o que é novidade — e listar o acervo
 * por letra inicial, que era o que esta tela fazia, é a ordem do arquivo, não
 * uma ordem que sirva a quem chega. A conta é feita no repositório
 * (`gerar_destaques.py`) e chega aqui pronta, no mesmo arquivo que a TV Box, o
 * Mac e o Windows leem: seis fileiras com o caminho do pôster junto.
 */
export interface DestaqueRow {
  title: string;
  items: MediaItem[];
}

export async function loadDestaques(force = false): Promise<DestaqueRow[]> {
  const text = await textoFilmes('destaques.txt', 'vod-destaques.txt', force);
  const rows: DestaqueRow[] = [];
  let current: DestaqueRow | null = null;
  let base = '';

  for (const line of text.split(/\r?\n/)) {
    if (!line.trim() || line.startsWith('#')) continue;
    if (line.startsWith('capa:')) { base = line.slice(5).trim(); continue; }
    if (line.startsWith('fila\t')) {
      current = { title: line.slice(5).trim(), items: [] };
      rows.push(current);
      continue;
    }
    if (!current) continue;
    const fields = line.split('\t');
    if (fields.length < 3) continue;
    const kind = fields[0]?.[0] ?? 'f';
    const title = fields[1]?.trim();
    if (!title) continue;
    const year = fields[3]?.trim() ?? '';
    const poster = fields[4]?.trim() ?? '';
    const trailer = fields[5]?.trim() ?? '';
    // Anime e dorama moram nas coleções: a letra deles é o nome da coleção.
    const letter = kind === 'a' ? 'redeflix-animes'
      : kind === 'd' ? 'redeflix-doramas'
      : fields[2]?.trim() ?? '';
    const type: 'movie' | 'series' = kind === 'f' ? 'movie' : 'series';
    const collection = kind === 'a' ? 'animes' : kind === 'd' ? 'doramas' : '';
    current.items.push({
      id: makeVodId(type, letter, title, year),
      name: title,
      url: '',
      category: collection || `${type === 'series' ? 'series' : 'filmes'}-${letter}`,
      categoryLabel: current.title,
      type: type === 'series' ? 'tv' : 'movie',
      isAdult: false,
      tmdb: { ...basicTmdb(title, year), poster: poster ? base + poster : '', trailer: trailer || undefined },
    });
  }
  return rows.filter(row => row.items.length > 0);
}

/**
 * As fichas publicadas: id do TMDB, pôster e gêneros de cada título do acervo.
 *
 * O mesmo arquivo que o Mac, a TV Box, o Windows e o site leem. Aqui ele serve
 * a duas coisas: dar o id do TMDB de um título sem busca por nome — que é
 * lenta e troca filmes de nome igual —, e o caminho inverso, que é o que
 * transforma a filmografia de um ator numa lista clicável: só entra o que
 * existe neste acervo.
 */
export interface Fichas {
  /** "f|Nome" ou "s|Nome" -> id do TMDB. */
  ids: Map<string, number>;
  /** id do TMDB -> título do acervo. Série entra com o id negativo. */
  porId: Map<number, string>;
  /** "f|Nome" ou "s|Nome" -> endereço do pôster. */
  capas: Map<string, string>;
}

let fichasEmMemoria: Fichas | null = null;

export async function loadFichas(force = false): Promise<Fichas> {
  if (fichasEmMemoria && !force) return fichasEmMemoria;
  const ids = new Map<string, number>();
  const porId = new Map<number, string>();
  const capas = new Map<string, string>();
  let base = '';
  try {
    const text = await textoFilmes('fichas.txt', 'vod-fichas.txt', force);
    // tipo \t título \t id do TMDB \t pôster \t gêneros
    for (const line of text.split(/\r?\n/)) {
      if (!line || line.startsWith('#')) continue;
      if (line.startsWith('capa:')) { base = line.slice(5).trim(); continue; }
      const fields = line.split('\t');
      if (fields.length < 5) continue;
      const key = `${fields[0]}|${fields[1]}`;
      if (fields[3]) capas.set(key, base + fields[3]);
      const id = Number(fields[2]);
      if (Number.isFinite(id) && id > 0) {
        ids.set(key, id);
        const marca = fields[0] === 's' ? -id : id;
        // Um mesmo id pode aparecer duas vezes no acervo (o mesmo filme em
        // duas grafias); o primeiro basta.
        if (!porId.has(marca)) porId.set(marca, fields[1]);
      }
    }
  } catch (error) {
    console.warn('[SaimoVOD] fichas.txt:', error);
  }
  fichasEmMemoria = { ids, porId, capas };
  return fichasEmMemoria;
}

function semAnoNoFim(titulo: string): string {
  return titulo.replace(/\s*\(\d{4}\)\s*$/, '').trim();
}

/** O id do TMDB de um título do acervo, quando o gerador o resolveu. */
export function idDaFicha(fichas: Fichas, titulo: string, serie: boolean): number | null {
  const marca = serie ? 's' : 'f';
  return fichas.ids.get(`${marca}|${titulo}`)
    ?? fichas.ids.get(`${marca}|${semAnoNoFim(titulo)}`)
    ?? null;
}

/**
 * O que um ator fez **e que existe neste acervo**, já pronto para abrir.
 *
 * A filmografia inteira do TMDB não serve de dentro do aplicativo: listar
 * oitenta títulos dos quais setenta não abrem é uma lista que frustra. O
 * cruzamento é pelo id do TMDB — nome igual não engana, e refilmagem não vira
 * o original.
 */
export async function filmografiaNoAcervo(
  creditos: { id: number; serie: boolean }[],
): Promise<MediaItem[]> {
  const [fichas, indice] = await Promise.all([loadFichas(), loadSearchIndex()]);
  // O índice inteiro, por nome — com o corte da busca da tela (500), só os
  // primeiros títulos em ordem alfabética entravam e o elenco de quase todo
  // mundo aparecia vazio. Só os achados viram item.
  const porNome = new Map<string, VodSearchEntry>();
  for (const entry of indice) porNome.set(`${entry.series ? 's' : 'f'}|${entry.title}`, entry);

  const vistos = new Set<string>();
  const saida: MediaItem[] = [];
  for (const credito of creditos) {
    const titulo = fichas.porId.get(credito.serie ? -credito.id : credito.id);
    if (!titulo) continue;
    const marca = credito.serie ? 's' : 'f';
    const achado = porNome.get(`${marca}|${titulo}`)
      ?? porNome.get(`${marca}|${semAnoNoFim(titulo)}`);
    if (!achado) continue;
    const item = itemDaBusca(achado);
    if (vistos.has(item.id)) continue;
    vistos.add(item.id);
    const capa = fichas.capas.get(`${marca}|${titulo}`)
      ?? fichas.capas.get(`${marca}|${semAnoNoFim(titulo)}`);
    saida.push(capa ? { ...item, tmdb: { ...item.tmdb!, poster: capa } } : item);
  }
  return saida;
}

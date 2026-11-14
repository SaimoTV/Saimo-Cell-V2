/**
 * Legendas externas de filmes e séries, pelo OpenSubtitles.
 *
 * O serviço é o addon público do Stremio para o OpenSubtitles
 * (opensubtitles-v3.strem.io): sem chave, sem cadastro, e entrega o arquivo já
 * em UTF-8. Só entende IMDb; o acervo só conhece o id do TMDB, e a ponte está
 * publicada em `vod/imdb/` (gerar_imdb.py) em fragmentos de uns 8 KB — baixa-se
 * o fragmento do título aberto, nunca o mapa inteiro. Mesma fonte do site, do
 * Mac, do Windows e da TV Box.
 *
 * Nada é baixado antes da hora: abrir um título custa uma lista de ~30 KB, e o
 * arquivo .srt (~40 KB) só vem quando a pessoa escolhe uma legenda.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import type { AddonSubtitle } from '../types';

import { buscarLegendasAddons } from './addons';
import { baseFilmes } from './enderecos';
import { resolverImdbPorTmdb } from './tmdbService';

const OPENSUBTITLES = 'https://opensubtitles-v3.strem.io/subtitles';
const FRAGMENTOS = 100;
const IDIOMA_GUARDADO = 'legenda-idioma';

/** Idiomas oferecidos, na ordem em que aparecem: código do OpenSubtitles, nome, ISO 639-1, versões. */
const IDIOMAS = [
  { codigo: 'pob', rotulo: 'Português (Brasil)', iso: 'pt', limite: 5 },
  { codigo: 'por', rotulo: 'Português (Portugal)', iso: 'pt', limite: 3 },
  { codigo: 'eng', rotulo: 'Inglês', iso: 'en', limite: 3 },
  { codigo: 'spa', rotulo: 'Espanhol', iso: 'es', limite: 2 },
] as const;

export interface LegendaOpcao {
  id: string;
  /** Código do idioma (ex.: "pob", "por", "eng", "spa", "pt-br"). */
  idioma: string;
  /** ISO 639-1, que é o que o player entende. */
  iso: string;
  rotulo: string;
  url: string;
  origem?: string;
  formato?: 'srt' | 'vtt';
}

export interface BuscarLegendasExtras {
  imdbId?: string;
  addonRawId?: string;
  inlineSubtitles?: AddonSubtitle[];
  filename?: string;
  videoSize?: number;
  videoHash?: string;
}

const fragmentos = new Map<string, Promise<Map<number, string>>>();
const listas = new Map<string, Promise<LegendaOpcao[]>>();

function fragmentoDe(serie: boolean, tmdb: number): Promise<Map<number, string>> {
  const nome = `${serie ? 's' : 'f'}-${String(tmdb % FRAGMENTOS).padStart(2, '0')}`;
  let pronto = fragmentos.get(nome);
  if (!pronto) {
    // Sem endereço da lista de filmes não há ponte para o IMDb: sem pedido.
    pronto = baseFilmes()
      .then((base) => (base ? fetch(`${base}imdb/${nome}.txt`) : null))
      .then((r) => (r && r.ok ? r.text() : ''))
      .then((texto) => {
        const mapa = new Map<number, string>();
        for (const linha of texto.split('\n')) {
          const [id, imdb] = linha.split('\t');
          if (id && imdb) mapa.set(Number(id), imdb.trim());
        }
        return mapa;
      })
      .catch(() => new Map<number, string>());
    // Falha de rede não pode ficar guardada: a próxima abertura tenta de novo.
    pronto.then((m) => { if (!m.size) fragmentos.delete(nome); });
    fragmentos.set(nome, pronto);
  }
  return pronto;
}

function mapearIdioma(langRaw: string): { codigo: string; iso: string; rotuloBase: string } {
  const norm = (langRaw || '').trim().toLowerCase();
  if (norm === 'pob' || norm === 'pt-br' || norm === 'pt_br' || norm === 'pb') {
    return { codigo: 'pob', iso: 'pt', rotuloBase: 'Português (Brasil)' };
  }
  if (norm === 'por' || norm === 'pt' || norm === 'pt-pt') {
    return { codigo: 'por', iso: 'pt', rotuloBase: 'Português' };
  }
  if (norm === 'eng' || norm === 'en' || norm.startsWith('en-')) {
    return { codigo: 'eng', iso: 'en', rotuloBase: 'Inglês' };
  }
  if (norm === 'spa' || norm === 'es' || norm.startsWith('es-')) {
    return { codigo: 'spa', iso: 'es', rotuloBase: 'Espanhol' };
  }
  const iso = norm.slice(0, 2) || 'und';
  return { codigo: norm || 'und', iso, rotuloBase: langRaw || 'Legenda' };
}

function mapearAddonSubtitles(subs: AddonSubtitle[], origemFallback: string): LegendaOpcao[] {
  const saida: LegendaOpcao[] = [];
  subs.forEach((s, idx) => {
    if (!s?.url) return;
    const info = mapearIdioma(s.lang);
    const origem = s.addonName || origemFallback;
    const detalhe = s.label || origem;
    saida.push({
      id: `ext-${(s.addonId || 'inline').replace(/[^\w-]/g, '_')}-${s.id || idx}`,
      idioma: info.codigo,
      iso: info.iso,
      rotulo: `${info.rotuloBase} · ${detalhe}`,
      url: s.url,
      origem,
      formato: /\.vtt(\?|$)/i.test(s.url) ? 'vtt' : 'srt',
    });
  });
  return saida;
}

/** As legendas do título (inline do stream + addons Stremio + OpenSubtitles), do melhor idioma para o pior. */
export async function buscarLegendas(
  tmdbId: number | undefined,
  serie: boolean,
  temporada = 0,
  episodio = 0,
  extras?: BuscarLegendasExtras,
): Promise<LegendaOpcao[]> {
  const inlineOpcoes = mapearAddonSubtitles(extras?.inlineSubtitles ?? [], 'Stream');

  const chaveBase = `${serie ? 's' : 'f'}|${tmdbId ?? 0}|${extras?.imdbId ?? ''}|${temporada}|${episodio}|${extras?.addonRawId ?? ''}`;
  let pronta = listas.get(chaveBase);
  if (!pronta) {
    pronta = (async () => {
      let imdb = extras?.imdbId;
      if (!imdb && tmdbId) {
        imdb = (await fragmentoDe(serie, tmdbId)).get(tmdbId);
      }
      if (!imdb && tmdbId && tmdbId > 0) {
        imdb = await resolverImdbPorTmdb(tmdbId, serie);
      }

      const tipoAddon: 'movie' | 'series' = serie ? 'series' : 'movie';
      const [addonsSubs, osSubs] = await Promise.all([
        buscarLegendasAddons({
          type: tipoAddon,
          imdbId: imdb,
          tmdbId,
          addonRawId: extras?.addonRawId,
          season: temporada > 0 ? temporada : undefined,
          episode: episodio > 0 ? episodio : undefined,
          filename: extras?.filename,
          videoSize: extras?.videoSize,
          videoHash: extras?.videoHash,
        }).catch(() => [] as AddonSubtitle[]),
        (async () => {
          if (!imdb) return [] as LegendaOpcao[];
          const alvo = serie && temporada > 0
            ? `series/${imdb}:${temporada}:${episodio}` : `movie/${imdb}`;
          const r = await fetch(`${OPENSUBTITLES}/${alvo}.json`);
          if (!r.ok) return [] as LegendaOpcao[];
          const json = await r.json() as { subtitles?: Record<string, unknown>[] };
          const out: LegendaOpcao[] = [];
          for (const idioma of IDIOMAS) {
            (json.subtitles ?? [])
              .filter((s) => s.lang === idioma.codigo && s.url)
              .slice(0, idioma.limite)
              .forEach((s, i) => {
                const versao = String(s.releaseGroup || s.releaseFormat || '').trim();
                out.push({
                  id: `${idioma.codigo}-${s.id ?? i}`,
                  idioma: idioma.codigo,
                  iso: idioma.iso,
                  rotulo: `${idioma.rotulo} · ${versao || i + 1}`,
                  url: String(s.url),
                  origem: 'OpenSubtitles',
                  formato: 'srt',
                });
              });
          }
          return out;
        })().catch(() => [] as LegendaOpcao[]),
      ]);

      return [
        ...mapearAddonSubtitles(addonsSubs, 'Addon'),
        ...osSubs,
      ];
    })().catch(() => []);
    pronta.then((l) => { if (!l.length) setTimeout(() => listas.delete(chaveBase), 60_000); });
    listas.set(chaveBase, pronta);
  }

  const remotas = await pronta;
  const combinadas: LegendaOpcao[] = [];
  const vistas = new Set<string>();
  for (const op of [...inlineOpcoes, ...remotas]) {
    if (!op.url || vistas.has(op.url)) continue;
    vistas.add(op.url);
    combinadas.push(op);
  }
  return combinadas;
}

const TEMPO = /(\d+):(\d{2}):(\d{2})[,.](\d{1,3})/g;

function formatar(ms: number, sep = ','): string {
  const t = Math.max(0, Math.round(ms));
  const p = (n: number, c = 2) => String(n).padStart(c, '0');
  return `${p(Math.floor(t / 3_600_000))}:${p(Math.floor(t / 60_000) % 60)}:${p(Math.floor(t / 1000) % 60)}${sep}${p(t % 1000, 3)}`;
}

/**
 * O mesmo SRT/VTT com todas as marcas de tempo deslocadas em [segundos] (positivo
 * atrasa, negativo adianta). O player nativo não tem atraso de legenda, então
 * o ajuste é feito no próprio arquivo, antes de entregar.
 */
export function deslocarSrt(srt: string, segundos: number): string {
  if (!segundos) return srt;
  const delta = Math.round(segundos * 1000);
  const sep = /^\s*WEBVTT/i.test(srt) ? '.' : ',';
  return srt.split('\n').map((linha) => (linha.includes('-->')
    ? linha.replace(TEMPO, (_m, h, m, s, ms) =>
      formatar(Number(h) * 3_600_000 + Number(m) * 60_000 + Number(s) * 1000 + Number(String(ms).padEnd(3, '0')) + delta, sep))
    : linha)).join('\n');
}

const arquivos = new Map<string, Promise<string | null>>();

/**
 * Baixa a legenda (.srt ou .vtt), aplica o atraso e devolve o endereço de um arquivo local —
 * o `react-native-video` abre `file://`, e assim o atraso não custa rede.
 */
export async function baixarLegenda(opcao: LegendaOpcao, atraso = 0): Promise<string | null> {
  let texto = arquivos.get(opcao.url);
  if (!texto) {
    texto = fetch(opcao.url)
      .then((r) => (r.ok ? r.text() : null))
      // Página de erro no lugar do arquivo: melhor sem legenda que com HTML na tela.
      .then((t) => (t && t.includes('-->') ? t : null))
      .catch(() => null);
    arquivos.set(opcao.url, texto);
    texto.then((t) => { if (!t) arquivos.delete(opcao.url); });
  }
  const conteudo = await texto;
  if (!conteudo) return null;
  const ehVtt = opcao.formato === 'vtt' || /^\s*WEBVTT/i.test(conteudo) || /\.vtt(\?|$)/i.test(opcao.url);
  const ext = ehVtt ? 'vtt' : 'srt';
  const pasta = `${FileSystem.cacheDirectory ?? ''}legendas/`;
  try {
    await FileSystem.makeDirectoryAsync(pasta, { intermediates: true });
    const arquivo = `${pasta}${opcao.id.replace(/[^\w-]/g, '_')}_${Math.round(atraso * 1000)}.${ext}`;
    await FileSystem.writeAsStringAsync(arquivo, deslocarSrt(conteudo, atraso));
    return arquivo;
  } catch {
    return null;
  }
}

/** O idioma escolhido da última vez; '' é "desligadas". */
export async function idiomaGuardado(): Promise<string> {
  try { return (await AsyncStorage.getItem(IDIOMA_GUARDADO)) ?? ''; } catch { return ''; }
}

export function guardarIdioma(codigo: string): void {
  AsyncStorage.setItem(IDIOMA_GUARDADO, codigo).catch(() => { /* sem armazenamento: só não lembra */ });
}

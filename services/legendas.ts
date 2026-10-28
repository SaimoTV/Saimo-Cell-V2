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

import { baseFilmes } from './enderecos';

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
  /** Código do OpenSubtitles: "pob", "por", "eng", "spa". */
  idioma: string;
  /** ISO 639-1, que é o que o player entende. */
  iso: string;
  rotulo: string;
  url: string;
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

/** As legendas do título, do melhor idioma para o pior. Vazio quando não há. */
export function buscarLegendas(
  tmdbId: number | undefined, serie: boolean, temporada = 0, episodio = 0,
): Promise<LegendaOpcao[]> {
  if (!tmdbId) return Promise.resolve([]);
  const chave = `${serie ? 's' : 'f'}|${tmdbId}|${temporada}|${episodio}`;
  let pronta = listas.get(chave);
  if (!pronta) {
    pronta = (async () => {
      const imdb = (await fragmentoDe(serie, tmdbId)).get(tmdbId);
      if (!imdb) return [];
      const alvo = serie && temporada > 0
        ? `series/${imdb}:${temporada}:${episodio}` : `movie/${imdb}`;
      const r = await fetch(`${OPENSUBTITLES}/${alvo}.json`);
      if (!r.ok) return [];
      const json = await r.json() as { subtitles?: Record<string, unknown>[] };
      const saida: LegendaOpcao[] = [];
      for (const idioma of IDIOMAS) {
        (json.subtitles ?? [])
          .filter((s) => s.lang === idioma.codigo && s.url)
          .slice(0, idioma.limite)
          .forEach((s, i) => {
            const versao = String(s.releaseGroup || s.releaseFormat || '').trim();
            saida.push({
              id: `${idioma.codigo}-${s.id ?? i}`,
              idioma: idioma.codigo,
              iso: idioma.iso,
              rotulo: `${idioma.rotulo} · ${versao || i + 1}`,
              url: String(s.url),
            });
          });
      }
      return saida;
    })().catch(() => []);
    // Lista vazia por falha não fica guardada; vazia de verdade custa pouco.
    pronta.then((l) => { if (!l.length) setTimeout(() => listas.delete(chave), 60_000); });
    listas.set(chave, pronta);
  }
  return pronta;
}

const TEMPO = /(\d+):(\d{2}):(\d{2})[,.](\d{1,3})/g;

function formatar(ms: number): string {
  const t = Math.max(0, Math.round(ms));
  const p = (n: number, c = 2) => String(n).padStart(c, '0');
  return `${p(Math.floor(t / 3_600_000))}:${p(Math.floor(t / 60_000) % 60)}:${p(Math.floor(t / 1000) % 60)},${p(t % 1000, 3)}`;
}

/**
 * O mesmo SRT com todas as marcas de tempo deslocadas em [segundos] (positivo
 * atrasa, negativo adianta). O player nativo não tem atraso de legenda, então
 * o ajuste é feito no próprio arquivo, antes de entregar.
 */
export function deslocarSrt(srt: string, segundos: number): string {
  if (!segundos) return srt;
  const delta = Math.round(segundos * 1000);
  return srt.split('\n').map((linha) => (linha.includes('-->')
    ? linha.replace(TEMPO, (_m, h, m, s, ms) =>
      formatar(Number(h) * 3_600_000 + Number(m) * 60_000 + Number(s) * 1000 + Number(String(ms).padEnd(3, '0')) + delta))
    : linha)).join('\n');
}

const arquivos = new Map<string, Promise<string | null>>();

/**
 * Baixa a legenda, aplica o atraso e devolve o endereço de um arquivo local —
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
  const srt = await texto;
  if (!srt) return null;
  const pasta = `${FileSystem.cacheDirectory ?? ''}legendas/`;
  try {
    await FileSystem.makeDirectoryAsync(pasta, { intermediates: true });
    const arquivo = `${pasta}${opcao.id.replace(/[^\w-]/g, '_')}_${Math.round(atraso * 1000)}.srt`;
    await FileSystem.writeAsStringAsync(arquivo, deslocarSrt(srt, atraso));
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

/**
 * Onde a TV está agora, para o som no celular tocar junto com a imagem dela.
 *
 * A TV manda, a cada segundo, o instante do conteúdo de cada tela (a régua
 * comum: hora real do trecho, a régua contínua do proxy /hls da TV, ou a
 * posição no filme). Aqui não entra relógio de parede: ele dá saltos (ajuste
 * de hora do sistema) e o som pulava junto. Tudo é medido no relógio
 * monotônico do celular (`performance.now`):
 *
 * - cada aviso dá `st - chegada`; o atraso do Wi-Fi só faz esse valor cair,
 *   então o maior dos últimos segundos é o aviso que chegou mais rápido;
 * - a esse se soma metade da menor ida e volta do ping, que é o atraso desse
 *   aviso mais rápido.
 *
 * Fica fora da store de propósito: muda várias vezes por segundo e não deve
 * redesenhar tela nenhuma.
 */

const agora = () => performance.now();

/** Menores idas e voltas recentes do ping, em ms. */
const idasEVoltas: number[] = [];

interface Tela {
  playing: boolean;
  /** Último instante informado, para a tela parada. */
  st: number;
  recebidaEm: number;
  /** `st - chegada` dos avisos dos últimos segundos. */
  janela: Array<{ v: number; em: number }>;
}

const telas = new Map<number, Tela>();

const JANELA_MS = 15000;
/** Um aviso que difere disto da base é a TV pulando ou travando. */
const SALTO_MS = 400;

/** `c0` é o `performance.now()` de quando o ping saiu (a TV só devolve). */
export function registrarPong(c0: number): void {
  const rtt = agora() - c0;
  if (!(rtt >= 0 && rtt < 5000)) return;
  idasEVoltas.push(rtt);
  if (idasEVoltas.length > 16) idasEVoltas.shift();
}

function meiaIdaEVolta(): number | null {
  if (!idasEVoltas.length) return null;
  return Math.min(...idasEVoltas) / 2;
}

export function registrarPosicoes(lista: Array<{ idx: number; st: number; playing: boolean }>): void {
  const em = agora();
  for (const t of lista) {
    if (typeof t.st !== 'number' || !Number.isFinite(t.st)) continue;
    const playing = Boolean(t.playing);
    const v = t.st - em;
    let tela = telas.get(t.idx);
    if (!tela) {
      tela = { playing, st: t.st, recebidaEm: em, janela: [] };
      telas.set(t.idx, tela);
    }
    const base = tela.janela.length ? Math.max(...tela.janela.map((a) => a.v)) : null;
    // Recomeça a conta quando a TV volta a tocar ou salta (troca de fonte,
    // travou para carregar): os avisos antigos já não valem.
    if (!playing || !tela.playing || (base != null && Math.abs(v - base) > SALTO_MS)) {
      tela.janela = [];
    }
    tela.playing = playing;
    tela.st = t.st;
    tela.recebidaEm = em;
    if (playing) {
      tela.janela.push({ v, em });
      tela.janela = tela.janela.filter((a) => em - a.em < JANELA_MS);
    }
  }
}

/**
 * O instante do conteúdo que a TV mostra agora, em ms, ou nulo quando não há
 * como saber (sem ping medido, aviso velho, canal sem régua).
 */
export function instanteDaTv(idx: number): number | null {
  const tela = telas.get(idx);
  const meia = meiaIdaEVolta();
  if (!tela || meia == null) return null;
  const t = agora();
  if (t - tela.recebidaEm > 5000) return null;
  if (!tela.playing || !tela.janela.length) return tela.playing ? null : tela.st;
  const base = Math.max(...tela.janela.map((a) => a.v));
  return base + t + meia;
}

/** Se a tela da TV está tocando (nulo quando não se sabe). */
export function tvTocando(idx: number): boolean | null {
  const tela = telas.get(idx);
  if (!tela || agora() - tela.recebidaEm > 5000) return null;
  return tela.playing;
}

export function limparSincronia(): void {
  idasEVoltas.length = 0;
  telas.clear();
}

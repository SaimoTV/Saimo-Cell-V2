import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { AppState, Dimensions, PixelRatio, Platform } from 'react-native';
import { naAmostra, PADRAO_PCT, pctValido } from '../utils/amostra';

/**
 * O que o Saimo Monitor fica sabendo deste celular.
 *
 * Que o app abriu (versão, modelo, Android), o que está tocando de tempos em
 * tempos, e quando uma fonte falha, um canal cai ou o app quebra. O aparelho é
 * um UUID sorteado aqui na primeira abertura — sem conta, sem identificador de
 * publicidade, e o IP não é gravado: a cidade sai da borda da Cloudflare.
 *
 * Tudo é fogo e esquece: sem rede, o monitor fica sem o dado e o app segue igual.
 *
 * Telemetria por amostra: o monitor é cobrado por pedido, então só uma fatia
 * fixa dos aparelhos (5%, lido de `telemetria.json`) conversa com ele — e o
 * painel multiplica. A conta de quem entra é a mesma do servidor
 * (`utils/amostra.ts`). Fora da amostra, só `crash` sai daqui; o resto do app
 * é igual.
 */

const BASE = 'https://saimo-tv.pages.dev/api/online/v1';
const PLATAFORMA = 'cell';
const CHAVE_ID = 'saimo-telemetria-id';
const CHAVE_CRASH = 'saimo-telemetria-crash';
/** Zapeando, cada canal que passa não vira batida: só quem ficou. */
const MINIMO_PARA_CONTAR_MS = 20_000;
/** Arquivo estático do monitor: servido sem rodar o Worker, não custa nada. */
const CONFIG = 'https://saimo-tv.pages.dev/telemetria.json';
const DESLIGADA = true;
const CHAVE_AMOSTRA = 'saimo-telemetria-amostra';
const CONFIG_VALIDADE_MS = 24 * 3_600_000;
/** Batidas fora de hora (pausa, troca de título, parada): no máximo uma a cada 30 s. */
const EXTRA_MINIMO_MS = 30_000;

export type Tipo = 'live' | 'vod';
interface Tocando { kind: Tipo; title: string; host: string | null }

const versao = Constants.expoConfig?.version ?? '?';
let id: string | null = null;
let fila: Array<[string, Record<string, unknown>]> = [];
let iniciado = false;
let intervaloMs = 300_000;
let relogio: ReturnType<typeof setInterval> | null = null;
let tocando: Tocando | null = null;
/** Só conta tempo com o vídeo andando: pausado ou carregando não é assistir. */
let acumuladoMs = 0;
let rodandoDesde = 0;
let pausado = false;
let qualidade: string | null = null;
let travouDesde = 0;
let ultimoPulo = 0;
let errosEnviados = 0;
let ultimaExtra = 0;
/** O percentual da amostra guardado; 5 enquanto nunca foi lido. */
let amostraPct = PADRAO_PCT;
let amostraEm = 0;

function dentro(): boolean {
  return !!id && naAmostra(id, amostraPct);
}

function guardarPct(pct: unknown, em = amostraEm) {
  if (pctValido(pct)) amostraPct = pct;
  amostraEm = em;
  void AsyncStorage.setItem(CHAVE_AMOSTRA, JSON.stringify({ pct: amostraPct, em: amostraEm })).catch(() => {});
}

async function carregarPct() {
  try {
    const salvo = JSON.parse((await AsyncStorage.getItem(CHAVE_AMOSTRA)) ?? 'null') as { pct?: unknown; em?: unknown } | null;
    if (pctValido(salvo?.pct)) amostraPct = salvo.pct;
    if (typeof salvo?.em === 'number') amostraEm = salvo.em;
  } catch { /* sem disco: fica o padrão */ }
}

/** Relê `telemetria.json` no máximo uma vez por dia. */
async function lerConfig() {
  const idade = Date.now() - amostraEm;
  if (idade >= 0 && idade < CONFIG_VALIDADE_MS) return;
  try {
    const r = await fetch(CONFIG, { headers: { Accept: 'application/json' } });
    // Respondeu (mesmo com erro): só tenta de novo amanhã.
    const corpo = r.ok ? ((await r.json()) as { amostraPct?: unknown }) : null;
    guardarPct(corpo?.amostraPct, Date.now());
  } catch { /* sem rede: tenta na próxima abertura */ }
}

function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function host(url?: string | null): string | null {
  if (!url) return null;
  const m = /^[a-z][a-z0-9+.-]*:\/\/([^/:?#]+)/i.exec(url);
  return m && !url.startsWith('file:') ? m[1].replace(/^www\./, '') : null;
}

function rodandoMs() {
  return acumuladoMs + (rodandoDesde ? Date.now() - rodandoDesde : 0);
}

function limparVideo() {
  acumuladoMs = 0;
  rodandoDesde = 0;
  pausado = false;
  qualidade = null;
  travouDesde = 0;
}

function aparelho(): Record<string, unknown> {
  const { width, height } = Dimensions.get('screen');
  const px = PixelRatio.get();
  let lang = '';
  try { lang = Intl.DateTimeFormat().resolvedOptions().locale; } catch { /* sem Intl */ }
  return { ...modelo(), screen: `${Math.round(width * px)}x${Math.round(height * px)}`, lang };
}

function modelo(): { model: string; os: string } {
  const c = (Platform.constants ?? {}) as Record<string, unknown>;
  const marca = String(c.Brand ?? c.Manufacturer ?? '').trim();
  const nome = String(c.Model ?? '').trim();
  const release = String(c.Release ?? Platform.Version ?? '');
  return {
    model: [marca, nome].filter(Boolean).join(' ') || Platform.OS,
    os: Platform.OS === 'android' ? `Android ${release} (API ${Platform.Version})` : `${Platform.OS} ${Platform.Version}`,
  };
}

async function postar(rota: string, corpo: Record<string, unknown>): Promise<Record<string, unknown> | null> {
  // Fora da amostra, nada vai ao monitor — menos quebra, que é rara e vale para todos.
  // Telemetria desligada (2.5.4): nada sai do aparelho, nem quebra.
  if (DESLIGADA) return null;
  if (!dentro() && !(rota === 'event' && corpo.type === 'crash')) return null;
  try {
    const r = await fetch(`${BASE}/${rota}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...corpo, deviceId: id, platform: PLATAFORMA, version: versao }),
    });
    if (!r.ok || r.status === 204) return null;
    return (await r.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Antes do id carregar do disco, guarda na fila; depois, manda direto. */
function enviar(rota: string, corpo: Record<string, unknown>) {
  if (!id) { fila.push([rota, corpo]); return; }
  void postar(rota, corpo);
}

function baterAgora() {
  const segundos = tocando ? Math.round(rodandoMs() / 1000) : 0;
  acumuladoMs = 0;
  if (rodandoDesde) rodandoDesde = Date.now();
  enviar('beat', { seconds: segundos, playing: tocando ? { ...tocando, paused: pausado, quality: qualidade } : null });
}

/** Batida fora do relógio: no máximo uma a cada 30 s. */
function baterExtra() {
  const agora = Date.now();
  if (ultimaExtra && agora - ultimaExtra < EXTRA_MINIMO_MS) return;
  ultimaExtra = agora;
  baterAgora();
}

/** O hello também diz o intervalo das batidas e o percentual da amostra. */
function lerHello(corpo: Record<string, unknown> | null) {
  const s = Number(corpo?.heartbeatSeconds);
  if (s >= 60 && s <= 3600) intervaloMs = s * 1000;
  const pct = pctValido(corpo?.amostraPct) ? corpo?.amostraPct : corpo?.amostra;
  if (pctValido(pct) && pct !== amostraPct) guardarPct(pct);
}

function agendar() {
  if (relogio) clearInterval(relogio);
  relogio = setInterval(baterAgora, intervaloMs);
}

function evento(type: string, extra: Record<string, unknown> = {}) {
  enviar('event', { type, ...extra });
}

/** Uma vez, no layout raiz. */
export function iniciar() {
  if (iniciado) return;
  iniciado = true;

  // Crash de JS: guarda antes de o app morrer e manda na próxima abertura.
  const global = globalThis as unknown as { ErrorUtils?: { getGlobalHandler: () => (e: Error, fatal?: boolean) => void; setGlobalHandler: (h: (e: Error, fatal?: boolean) => void) => void } };
  const anterior = global.ErrorUtils?.getGlobalHandler();
  global.ErrorUtils?.setGlobalHandler((erro, fatal) => {
    const texto = `${fatal ? 'fatal' : 'não fatal'} · ${erro?.message ?? erro}\n${erro?.stack ?? ''}`.slice(0, 2800);
    if (fatal) {
      void AsyncStorage.setItem(CHAVE_CRASH, texto);
    } else if (errosEnviados < 5) {
      errosEnviados++;
      evento('error', { detail: texto });
    }
    anterior?.(erro, fatal);
  });

  void (async () => {
    try {
      id = await AsyncStorage.getItem(CHAVE_ID);
      if (!id) { id = uuid(); await AsyncStorage.setItem(CHAVE_ID, id); }
    } catch {
      id = id ?? uuid();
    }
    await carregarPct();
    lerHello(await postar('hello', aparelho()));
    void lerConfig();
    agendar();
    const pendentes = fila;
    fila = [];
    for (const [rota, c] of pendentes) void postar(rota, c);
    try {
      const crash = await AsyncStorage.getItem(CHAVE_CRASH);
      if (crash) { evento('crash', { detail: crash }); await AsyncStorage.removeItem(CHAVE_CRASH); }
    } catch { /* sem disco, sem crash guardado */ }
  })();

  // Em segundo plano o celular não assiste nada: fecha a conta do tempo e
  // para de bater; ao voltar, é uma abertura nova.
  AppState.addEventListener('change', (estado) => {
    if (estado === 'active') {
      if (id) void postar('hello', aparelho()).then(lerHello);
      if (id) void lerConfig();
      agendar();
    } else if (estado === 'background') {
      if (relogio) { clearInterval(relogio); relogio = null; }
      if (rodandoDesde) { acumuladoMs += Date.now() - rodandoDesde; rodandoDesde = 0; }
      // A última batida, ao ir para segundo plano, sai mesmo sem o intervalo.
      baterAgora();
      if (tocando) evento('play_stop');
    }
  });
}

/** `nova` é falso quando é só a próxima fonte do mesmo título depois de uma falha. */
export function comecou(kind: Tipo, title: string, url: string, fonte: number, nova = true) {
  if (tocando && tocando.title !== title && rodandoMs() >= MINIMO_PARA_CONTAR_MS) baterExtra();
  if (tocando?.title !== title) limparVideo();
  travouDesde = 0;
  tocando = { kind, title, host: host(url) };
  if (nova) evento('play_start', { kind, title, host: host(url), source: fonte });
}

export function tocou(kind: Tipo, title: string, url: string, fonte: number, ms: number) {
  evento('play_ok', { kind, title, host: host(url), source: fonte, detail: `${Math.round(ms)} ms`, ms: Math.round(ms) });
}

export function falhou(kind: Tipo, title: string, url: string, fonte: number, detalhe: string) {
  evento('source_fail', { kind, title, host: host(url), source: fonte, detail: detalhe.slice(0, 200) });
}

export function caiu(kind: Tipo, title: string, fontes: number) {
  evento('channel_down', { kind, title, detail: `nenhuma das ${fontes} fonte(s) abriu` });
}

export function parou() {
  if (!tocando) return;
  if (rodandoMs() >= MINIMO_PARA_CONTAR_MS) baterExtra();
  tocando = null;
  limparVideo();
  evento('play_stop');
}

/**
 * O que o player está fazendo agora. `rodando` é o vídeo já aberto;
 * `carregando` é o player esperando dados. Pausar ou voltar bate na hora,
 * para o painel não mostrar como assistindo quem pausou; carregar depois de
 * ter começado é travamento — menos logo depois de pular.
 */
export function video(estado: { rodando: boolean; pausado: boolean; carregando: boolean; qualidade?: string | null }) {
  if (!tocando) return;
  const agora = Date.now();
  const andando = estado.rodando && !estado.pausado && !estado.carregando && AppState.currentState === 'active';
  if (andando && !rodandoDesde) rodandoDesde = agora;
  if (!andando && rodandoDesde) { acumuladoMs += agora - rodandoDesde; rodandoDesde = 0; }
  if (estado.rodando && estado.qualidade) qualidade = estado.qualidade;
  if (agora - ultimoPulo < 3000) {
    travouDesde = 0;
  } else if (estado.rodando && estado.carregando && !estado.pausado) {
    if (!travouDesde) travouDesde = agora;
  } else if (travouDesde) {
    const ms = agora - travouDesde;
    travouDesde = 0;
    if (ms >= 500 && !estado.pausado) {
      evento('stall', { kind: tocando.kind, title: tocando.title, host: tocando.host, ms, detail: `${ms} ms` });
    }
  }
  if (estado.rodando && estado.pausado !== pausado) {
    pausado = estado.pausado;
    baterExtra();
  }
}

/** Chamar ao pular para outro ponto: o carregamento em seguida não é travamento. */
export function pulou() {
  ultimoPulo = Date.now();
  travouDesde = 0;
}

const buscas: Record<string, { texto: string; espera: ReturnType<typeof setTimeout> | null; achou: () => boolean }> = {};

/** Busca parada 2 s sem resultado: o painel mostra o que procuram e não acham. */
export function buscou(kind: Tipo, texto: string, achou: () => boolean) {
  const t = texto.trim();
  const atual = buscas[kind];
  if (atual && atual.texto === t) { atual.achou = achou; return; }
  if (atual?.espera) clearTimeout(atual.espera);
  const nova = { texto: t, espera: null as ReturnType<typeof setTimeout> | null, achou };
  buscas[kind] = nova;
  if (t.length < 3) return;
  nova.espera = setTimeout(() => {
    if (buscas[kind] !== nova || nova.achou()) return;
    evento('search_miss', { kind, query: t });
  }, 2000);
}

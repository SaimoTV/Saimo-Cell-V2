// Conta Saimo (opcional): entrar com o e-mail, aprovar uma TV pelo QR e
// sincronizar perfis, onde parou, favoritos, listas e addons pela internet.
// Sem conta, nada muda: os dados ficam no aparelho e o Saimo Connect segue
// sincronizando na rede de casa. O servidor é o SaimoConta (Cloudflare Worker);
// o que viaja é o mesmo pacote do Connect (pacoteDeDados / aplicarDados).
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState, Platform } from 'react-native';
import Constants from 'expo-constants';
import { pacoteDeDados, aplicarDados } from './sincroniaDados';
import { useMediaStore } from '../stores/mediaStore';
import { useFavoritesStore } from '../stores/favoritesStore';
import { useLinksStore } from '../stores/linksStore';
import { aoMudar as aoMudarListas } from './minhasListas';
import { aoMudarAddons } from './addons';
import { assinarPerfis } from './perfis';

/** Endereço do servidor. Em teste: EXPO_PUBLIC_CONTA_API=http://10.0.2.2:8787 no build. */
export const CONTA_API = (process.env.EXPO_PUBLIC_CONTA_API || 'https://conta.saimo-tv.com.br').replace(/\/$/, '');
const CHAVE = 'saimo-conta-v1';
const DEZ_MIN = 10 * 60 * 1000;

export interface EstadoConta {
  token: string | null;
  email: string | null;
  /** Última sincronização que deu certo (ms) e o erro da última, se houve. */
  sincronizadaEm: number;
  erro: string | null;
  sincronizando: boolean;
}

let estado: EstadoConta = { token: null, email: null, sincronizadaEm: 0, erro: null, sincronizando: false };
const ouvintes = new Set<(e: EstadoConta) => void>();
let carregado: Promise<void> | null = null;

export function estadoConta(): EstadoConta { return estado; }
export function aoMudarConta(f: (e: EstadoConta) => void): () => void { ouvintes.add(f); return () => { ouvintes.delete(f); }; }
function mudar(parcial: Partial<EstadoConta>) {
  estado = { ...estado, ...parcial };
  ouvintes.forEach((f) => { try { f(estado); } catch { /* ouvinte não derruba */ } });
}

async function gravar() {
  await AsyncStorage.setItem(CHAVE, JSON.stringify({ token: estado.token, email: estado.email, sincronizadaEm: estado.sincronizadaEm }));
}

export class ErroConta extends Error {}

async function api(metodo: string, rota: string, corpo?: unknown, token = estado.token): Promise<any> {
  let r: Response;
  try {
    r = await fetch(CONTA_API + rota, {
      method: metodo,
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
    });
  } catch {
    throw new ErroConta('Sem conexão com a conta Saimo agora');
  }
  const j = await r.json().catch(() => ({}));
  if (r.status === 401 && token) {
    // Sessão encerrada em outro lugar (sair de todos, conta apagada).
    mudar({ token: null, email: null });
    await gravar();
  }
  if (!r.ok) throw new ErroConta(j?.mensagem || 'Não deu certo: tente de novo');
  return j;
}

function nomeDoAparelho(): string {
  const modelo = Constants.deviceName || (Platform.OS === 'ios' ? 'iPhone' : 'Android');
  return `Saimo no ${modelo}`.slice(0, 60);
}

// ---------- entrar e sair ----------

/** Manda o código de 6 números para o e-mail. Em teste o servidor devolve o código (`codigoDev`). */
export async function pedirCodigo(email: string): Promise<{ codigoDev?: string }> {
  return api('POST', '/v1/email/codigo', { email: email.trim() }, null);
}

export async function entrarComCodigo(email: string, codigo: string): Promise<void> {
  const j = await api('POST', '/v1/email/entrar', { email: email.trim(), codigo, aparelho: nomeDoAparelho() }, null);
  mudar({ token: j.token, email: j.conta?.email ?? email.trim().toLowerCase(), erro: null });
  await gravar();
  await sincronizar(true);
}

/** Entrar com e-mail e senha (para quem criou uma). */
export async function entrarComSenha(email: string, senha: string): Promise<void> {
  const j = await api('POST', '/v1/senha/entrar', { email: email.trim(), senha, aparelho: nomeDoAparelho() }, null);
  mudar({ token: j.token, email: j.conta?.email ?? email.trim().toLowerCase(), erro: null });
  ultimoEnviado = '';
  await gravar();
  await sincronizar(true);
}

/**
 * Criar a conta com senha, pôr uma senha na conta ou trocar a esquecida, com o
 * código que chegou no e-mail (pedirCodigo antes). Trocar encerra as outras sessões.
 */
export async function definirSenha(email: string, codigo: string, senha: string): Promise<void> {
  const j = await api('POST', '/v1/senha/definir', { email: email.trim(), codigo, senha, aparelho: nomeDoAparelho() }, null);
  mudar({ token: j.token, email: j.conta?.email ?? email.trim().toLowerCase(), erro: null });
  ultimoEnviado = '';
  await gravar();
  await sincronizar(true);
}

export async function sair(): Promise<void> {
  try { await api('POST', '/v1/sair'); } catch { /* sai daqui de qualquer jeito */ }
  mudar({ token: null, email: null, sincronizadaEm: 0, erro: null });
  ultimoEnviado = '';
  await gravar();
}

/** Apaga a conta e os dados dela no servidor (os daqui continuam no aparelho). */
export async function apagarConta(): Promise<void> {
  await api('DELETE', '/v1/conta');
  mudar({ token: null, email: null, sincronizadaEm: 0, erro: null });
  ultimoEnviado = '';
  await gravar();
}

/** O celular logado aprova a TV que mostra o QR (ou o código ABCD-2345). */
export async function aprovarTv(codigo: string): Promise<string> {
  if (!estado.token) throw new ErroConta('Entre na sua conta primeiro');
  const j = await api('POST', '/v1/tv/aprovar', { codigo });
  return j.aparelho as string;
}

/** O código da TV que veio no QR (https://saimo-tv.com.br/conectar?c=ABCD2345 ou saimo://conectar?c=...). */
export function codigoDoQr(texto: string): string | null {
  const m = /[?&]c=([A-Za-z0-9-]{8,9})/.exec(texto) ?? /^([A-Za-z0-9]{4}-?[A-Za-z0-9]{4})$/.exec(texto.trim());
  return m ? m[1].toUpperCase().replace(/[^A-Z0-9]/g, '') : null;
}

// ---------- sincronizar ----------

let ultimoEnviado = '';
let emCurso: Promise<void> | null = null;
let aplicandoAte = 0;

/**
 * Baixa o que a conta tem, junta aqui (as mesmas regras do Connect) e manda o
 * que este aparelho tem; o servidor junta de novo e guarda. Só manda quando
 * algo mudou desde o último envio.
 */
export function sincronizar(forcar = false): Promise<void> {
  if (!estado.token) return Promise.resolve();
  if (emCurso) return emCurso;
  emCurso = (async () => {
    mudar({ sincronizando: true });
    try {
      const remoto = await api('GET', '/v1/dados');
      if (remoto?.dados) {
        aplicandoAte = Date.now() + 4000;
        aplicarDados(remoto.dados);
        // aplicarDados grava em segundo plano: espera assentar antes de montar o pacote daqui.
        await new Promise((ok) => setTimeout(ok, 2500));
      }
      const pacote = pacoteDeDados();
      const texto = JSON.stringify(pacote);
      if (forcar || texto !== ultimoEnviado) {
        await api('PUT', '/v1/dados', { dados: pacote });
        ultimoEnviado = texto;
      }
      mudar({ sincronizadaEm: Date.now(), erro: null });
      await gravar();
    } catch (e) {
      mudar({ erro: e instanceof Error ? e.message : 'Não consegui sincronizar' });
    } finally {
      mudar({ sincronizando: false });
      emCurso = null;
    }
  })();
  return emCurso;
}

let agendado: ReturnType<typeof setTimeout> | null = null;
/** Algo mudou aqui: manda em alguns segundos (várias mudanças viram um envio só). */
function agendar(ms = 15000) {
  if (!estado.token || Date.now() < aplicandoAte) return;
  if (agendado) clearTimeout(agendado);
  agendado = setTimeout(() => { agendado = null; void sincronizar(); }, ms);
}

/** Na abertura do app: lê a sessão e começa a sincronizar (abrir, voltar ao app, mudanças, a cada 10 min). */
export function iniciarConta(): Promise<void> {
  if (carregado) return carregado;
  carregado = (async () => {
    try {
      const v = JSON.parse((await AsyncStorage.getItem(CHAVE)) ?? 'null');
      if (v?.token) mudar({ token: v.token, email: v.email ?? null, sincronizadaEm: Number(v.sincronizadaEm) || 0 });
    } catch { /* sem sessão */ }
    useMediaStore.subscribe((n, v) => { if (n.watchHistory !== v.watchHistory || n.favorites !== v.favorites) agendar(30000); });
    useFavoritesStore.subscribe((n, v) => { if (n.favorites !== v.favorites) agendar(); });
    useLinksStore.subscribe((n, v) => { if (n.linksEm !== v.linksEm) agendar(); });
    aoMudarListas(() => agendar());
    aoMudarAddons(() => agendar());
    assinarPerfis(() => agendar(5000));
    AppState.addEventListener('change', (s) => { if (s === 'active' && Date.now() - estado.sincronizadaEm > 60_000) void sincronizar(); });
    setInterval(() => { if (AppState.currentState === 'active') void sincronizar(); }, DEZ_MIN);
    if (estado.token) setTimeout(() => void sincronizar(), 4000);
  })();
  return carregado;
}

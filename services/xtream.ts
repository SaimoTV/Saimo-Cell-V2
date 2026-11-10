// Lista com usuário e senha (o formato "Xtream Codes" que a maioria dos
// provedores de IPTV usa). Sem dependência do React Native: roda em Node nos
// testes. Mesmo comportamento dos outros apps Saimo.
//
// Uma conta Xtream é guardada como um link M3U comum
// (http://servidor:porta/get.php?username=…&password=…&type=m3u_plus): assim ela
// viaja pelo Saimo Connect e entra em "Minhas listas" como qualquer outra. Quem
// cola esse link direto, ou digita servidor + usuário + senha, cai no mesmo
// caminho: o app lê os canais pela API do servidor (player_api.php), que é mais
// leve e traz as categorias. Se a API não responde, vale o M3U do get.php.
//
// A senha nunca é mostrada de volta nem entra em log ou em mensagem de erro.
import type { CanalM3U } from './minhasListasLeitor';

/** Chave de comparação do nome (a mesma de minhasListasLeitor: sem acentos, só a-z e 0-9). */
const chave = (nome: string) => nome.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]/g, '');

export interface ContaXtream {
  base: string;
  usuario: string;
  senha: string;
}

export class ErroXtream extends Error {}

const cod = (s: string) => encodeURIComponent(s);

export const linkM3u = (c: ContaXtream) =>
  `${c.base}/get.php?username=${cod(c.usuario)}&password=${cod(c.senha)}&type=m3u_plus&output=ts`;
export const urlApi = (c: ContaXtream, acao?: string) =>
  `${c.base}/player_api.php?username=${cod(c.usuario)}&password=${cod(c.senha)}${acao ? `&action=${acao}` : ''}`;
export const urlCanal = (c: ContaXtream, id: string, ext: string) => `${c.base}/live/${cod(c.usuario)}/${cod(c.senha)}/${id}.${ext}`;
export const urlFilme = (c: ContaXtream, id: string, ext: string) => `${c.base}/movie/${cod(c.usuario)}/${cod(c.senha)}/${id}.${ext}`;
export const urlEpisodio = (c: ContaXtream, id: string, ext: string) => `${c.base}/series/${cod(c.usuario)}/${cod(c.senha)}/${id}.${ext}`;

/**
 * Servidor digitado → base sem barra no fim (`http://host:porta`, com o caminho
 * do painel, se houver). Sem esquema ganha `http://` (a quase totalidade dos
 * painéis não tem https). null se não parece um endereço.
 */
export function normalizarServidor(texto: string): string | null {
  let t = (texto ?? '').trim();
  if (!t || /\s/.test(t)) return null;
  if (!t.includes('://')) t = `http://${t}`;
  const m = /^(https?):\/\/([^/?#]+)([^?#]*)/i.exec(t);
  if (!m) return null;
  const host = m[2];
  if (!/^(?:[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?|\[[0-9A-Fa-f:.]+\])(?::\d{1,5})?$/.test(host)) return null;
  let caminho = m[3];
  if (['/get.php', '/player_api.php', '/panel_api.php', '/c', '/c/'].includes(caminho.toLowerCase())) caminho = '';
  caminho = caminho.replace(/\/+$/, '');
  return `${m[1].toLowerCase()}://${host.toLowerCase()}${caminho}`;
}

/** Reconhece o link de uma conta (get.php ou player_api.php com usuário e senha). */
export function deLink(link: string): ContaXtream | null {
  const m = /^(https?:\/\/[^/?#]+(?:\/[^?#]*?)?)\/(?:get|player_api)\.php\?(.*)$/i.exec((link ?? '').trim());
  if (!m) return null;
  const params: Record<string, string> = {};
  for (const par of m[2].split('#')[0].split('&')) {
    const i = par.indexOf('=');
    if (i < 0) continue;
    let v = par.slice(i + 1);
    try { v = decodeURIComponent(v.replace(/\+/g, ' ')); } catch { /* fica como veio */ }
    params[par.slice(0, i).toLowerCase()] = v;
  }
  const usuario = params.username;
  const senha = params.password;
  const base = normalizarServidor(m[1]);
  if (!usuario || !senha || !base) return null;
  return { base, usuario, senha };
}

/** Sem `player_api.php` no servidor: resta tentar o M3U. */
export const SEM_API = '\u0000sem-api';

/** `''` se a conta vale; SEM_API; ou o motivo da recusa. */
export function verificarEntrada(json: string): string {
  let raiz: any;
  try { raiz = JSON.parse(json); } catch { return SEM_API; }
  const info = raiz?.user_info;
  if (!info || typeof info !== 'object') return SEM_API;
  const auth = String(info.auth ?? '');
  if (auth !== '1' && auth.toLowerCase() !== 'true') return 'Usuário ou senha incorretos';
  const status = String(info.status ?? '').trim();
  if (status && status.toLowerCase() !== 'active') return `Essa conta não está ativa (${status})`;
  const exp = Number(info.exp_date);
  if (Number.isFinite(exp) && exp > 0 && exp <= Date.now() / 1000) return 'Essa conta venceu';
  return '';
}

function categorias(json: string): Map<string, string> {
  const mapa = new Map<string, string>();
  try {
    for (const o of JSON.parse(json)) mapa.set(String(o?.category_id ?? ''), String(o?.category_name ?? '').trim());
  } catch { /* sem categorias */ }
  return mapa;
}

/** `get_live_streams` + categorias → canais, com `.m3u8` e `.ts` como duas fontes. */
export function canaisDaApi(conta: ContaXtream, streams: string, cats: string, limite = 20000): CanalM3U[] {
  let lista: any[];
  try { lista = JSON.parse(streams); } catch { return []; }
  if (!Array.isArray(lista)) return [];
  const mapa = categorias(cats);
  const porNome = new Map<string, CanalM3U>();
  const fonte = (url: string) => ({ url, referer: null, ua: null, keyId: null, key: null, qualidade: null });
  for (const o of lista) {
    if (porNome.size >= limite) break;
    const id = String(o?.stream_id ?? '').trim();
    if (!id) continue;
    let nome = String(o?.name ?? '').trim();
    if (!nome) nome = `Canal ${porNome.size + 1}`;
    const grupo = mapa.get(String(o?.category_id ?? '')) || null;
    const icone = String(o?.stream_icon ?? '').trim();
    const logo = /^https?:/i.test(icone) ? icone : null;
    const fontes = [fonte(urlCanal(conta, id, 'm3u8')), fonte(urlCanal(conta, id, 'ts'))];
    const k = chave(nome);
    const antigo = porNome.get(k);
    if (!antigo) porNome.set(k, { nome, grupo, logo, fontes });
    else porNome.set(k, { ...antigo, grupo: antigo.grupo ?? grupo, logo: antigo.logo ?? logo, fontes: [...antigo.fontes, ...fontes] });
  }
  return [...porNome.values()];
}

/** Entra na conta e devolve os canais. Erros em português, sem o link nem a senha. */
export async function canaisXtream(
  conta: ContaXtream,
  buscar: (url: string) => Promise<string>,
  lerM3U: (texto: string) => CanalM3U[],
): Promise<CanalM3U[]> {
  const doM3u = async () => {
    let texto: string;
    try { texto = await buscar(linkM3u(conta)); } catch { throw new ErroXtream('Não consegui falar com o servidor'); }
    const canais = lerM3U(texto);
    if (!canais.length) throw new ErroXtream('Essa conta não tem canais ao vivo');
    return canais;
  };
  let motivo: string;
  try { motivo = verificarEntrada(await buscar(urlApi(conta))); } catch { return doM3u(); }
  if (motivo === SEM_API) return doM3u();
  if (motivo) throw new ErroXtream(motivo);
  try {
    const cats = await buscar(urlApi(conta, 'get_live_categories')).catch(() => '[]');
    const canais = canaisDaApi(conta, await buscar(urlApi(conta, 'get_live_streams')), cats);
    return canais.length ? canais : doM3u();
  } catch {
    return doM3u();
  }
}

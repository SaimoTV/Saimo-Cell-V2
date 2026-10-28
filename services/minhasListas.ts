// "Minhas listas": o usuário cola o link de uma lista .m3u comum e os canais
// entram no app. Tudo fica só neste aparelho (AsyncStorage para os dados da
// lista, um arquivo por lista para os canais já lidos). Nada vai a servidor
// nosso, e o link nunca é mostrado nem registrado em log.
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import type { Channel, ChannelStream } from '../types';
import { chave, ehRestrito, lerM3U, pareceM3U, type CanalM3U } from './minhasListasLeitor';

export const CATEGORIA_MINHAS_LISTAS = 'Minhas listas';
export const MAX_LISTAS = 10;
const CHAVE_META = 'minhas_listas_v1';
const PRAZO_MS = 30_000;
const MAX_BYTES = 30 * 1024 * 1024;
const DOZE_HORAS = 12 * 60 * 60 * 1000;
const UA_LISTA = 'VLC/3.0.20 LibVLC/3.0.20';
const PASTA = (FileSystem.documentDirectory ?? '') + 'minhas_listas/';

export interface MinhaLista {
  id: string;
  nome: string;
  /** null quando a lista veio de um arquivo (não atualiza sozinha). */
  link: string | null;
  atualizadaEm: number;
  ativa: boolean;
  total: number;
}

export class ErroLista extends Error {}

let listas: MinhaLista[] = [];
const canaisPorLista = new Map<string, CanalM3U[]>();
let carregado: Promise<void> | null = null;
const ouvintes = new Set<() => void>();
let atualizandoVencidas = false;

/** Avisa quando as listas ou os canais mudam (a loja de canais se inscreve). */
export function aoMudar(fn: () => void): () => void {
  ouvintes.add(fn);
  return () => { ouvintes.delete(fn); };
}
function avisar() {
  ouvintes.forEach(fn => { try { fn(); } catch { /* ouvinte não derruba o resto */ } });
}

async function gravarMeta() {
  await AsyncStorage.setItem(CHAVE_META, JSON.stringify(listas));
}
async function gravarCanais(id: string, canais: CanalM3U[]) {
  await FileSystem.makeDirectoryAsync(PASTA, { intermediates: true }).catch(() => {});
  await FileSystem.writeAsStringAsync(PASTA + id + '.json', JSON.stringify(canais));
}
async function lerCanais(id: string): Promise<CanalM3U[]> {
  try {
    const t = await FileSystem.readAsStringAsync(PASTA + id + '.json');
    const v = JSON.parse(t);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

/** Lê do aparelho o que foi guardado (uma vez só; sem lista nenhuma é uma leitura mínima). */
export function carregarMinhasListas(): Promise<void> {
  if (!carregado) {
    carregado = (async () => {
      try {
        const bruto = await AsyncStorage.getItem(CHAVE_META);
        const v = bruto ? JSON.parse(bruto) : [];
        listas = Array.isArray(v) ? v : [];
      } catch {
        listas = [];
      }
      for (const l of listas) {
        if (l.ativa) canaisPorLista.set(l.id, await lerCanais(l.id));
      }
      avisar();
    })();
  }
  return carregado;
}

export function getListas(): MinhaLista[] {
  return listas;
}

function novoId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function montarCanal(lista: MinhaLista, c: CanalM3U): Channel {
  const streams: ChannelStream[] = c.fontes.map(f => {
    const headers: Record<string, string> = {
      Accept: '*/*',
      'User-Agent': f.ua || UA_LISTA,
    };
    if (f.referer) headers.Referer = f.referer;
    const s: ChannelStream = { url: f.url, headers };
    if (f.qualidade) s.quality = f.qualidade;
    if (f.keyId && f.key) s.drm = { clearKey: `${f.keyId}:${f.key}` };
    return s;
  });
  const primeira = streams[0];
  return {
    id: `minha-${lista.id}-${chave(c.nome)}`,
    name: c.nome,
    logo: c.logo ?? '',
    // Conteúdo adulto vai para a categoria que o app já esconde até o desbloqueio.
    category: ehRestrito(c.nome, c.grupo) ? 'Adulto' : CATEGORIA_MINHAS_LISTAS,
    url: primeira.url,
    headers: primeira.headers,
    drm: primeira.drm,
    streams,
  };
}

/** Canais das listas ativas, no formato do app. Vazio se não há lista. */
export function getCanaisMinhasListas(): Channel[] {
  const out: Channel[] = [];
  for (const l of listas) {
    if (!l.ativa) continue;
    for (const c of canaisPorLista.get(l.id) ?? []) out.push(montarCanal(l, c));
  }
  return out;
}

async function baixar(link: string): Promise<CanalM3U[]> {
  const controle = new AbortController();
  const prazo = setTimeout(() => controle.abort(), PRAZO_MS);
  let texto: string;
  try {
    const r = await fetch(link, {
      cache: 'no-store',
      redirect: 'follow',
      headers: { 'User-Agent': UA_LISTA, Accept: '*/*' },
      signal: controle.signal,
    });
    if (!r.ok) throw new ErroLista('Não consegui baixar essa lista');
    const tam = Number(r.headers.get('content-length') ?? 0);
    if (tam > MAX_BYTES) throw new ErroLista('Não consegui baixar essa lista');
    texto = await r.text();
    if (texto.length > MAX_BYTES) throw new ErroLista('Não consegui baixar essa lista');
  } catch (e) {
    if (e instanceof ErroLista) throw e;
    throw new ErroLista('Não consegui baixar essa lista');
  } finally {
    clearTimeout(prazo);
  }
  return analisar(texto);
}

/** Mesma validação para link e arquivo. */
function analisar(texto: string): CanalM3U[] {
  if (!pareceM3U(texto)) throw new ErroLista('Isso não parece uma lista .m3u');
  const canais = lerM3U(texto);
  if (!canais.length) throw new ErroLista('Essa lista não tem canais');
  return canais;
}

/** Lê o arquivo .m3u escolhido (até 30 MB). Devolve o texto, ou lança ErroLista. */
export async function lerArquivoEscolhido(uri: string): Promise<string> {
  try {
    const info = await FileSystem.getInfoAsync(uri);
    if (info.exists && (info.size ?? 0) > MAX_BYTES) throw new ErroLista('Não consegui ler esse arquivo');
    return await FileSystem.readAsStringAsync(uri);
  } catch (e) {
    if (e instanceof ErroLista) throw e;
    throw new ErroLista('Não consegui ler esse arquivo');
  }
}

export function linkValido(link: string): boolean {
  return /^https?:\/\/\S+$/i.test(link.trim());
}

export async function adicionarLista(link: string, nome: string): Promise<MinhaLista> {
  await carregarMinhasListas();
  const l = link.trim();
  if (!linkValido(l)) throw new ErroLista('O link precisa começar com http:// ou https://');
  if (listas.length >= MAX_LISTAS) throw new ErroLista(`Você pode ter até ${MAX_LISTAS} listas`);
  return guardarNova(l, nome, await baixar(l));
}

/** Lista vinda de um arquivo escolhido no aparelho (sem link). */
export async function adicionarListaDeArquivo(texto: string, nome: string): Promise<MinhaLista> {
  await carregarMinhasListas();
  if (listas.length >= MAX_LISTAS) throw new ErroLista(`Você pode ter até ${MAX_LISTAS} listas`);
  return guardarNova(null, nome, analisar(texto));
}

async function guardarNova(l: string | null, nome: string, canais: CanalM3U[]): Promise<MinhaLista> {
  let n = listas.length + 1;
  while (listas.some(x => x.nome === `Lista ${n}`)) n++;
  const lista: MinhaLista = {
    id: novoId(),
    nome: nome.trim() || `Lista ${n}`,
    link: l,
    atualizadaEm: Date.now(),
    ativa: true,
    total: canais.length,
  };
  await gravarCanais(lista.id, canais);
  canaisPorLista.set(lista.id, canais);
  listas = [...listas, lista];
  await gravarMeta();
  avisar();
  return lista;
}

/** Baixa de novo; se falhar, mantém a versão guardada e lança o erro. */
export async function atualizarLista(id: string, texto?: string): Promise<void> {
  await carregarMinhasListas();
  const atual = listas.find(l => l.id === id);
  if (!atual) return;
  let canais: CanalM3U[];
  if (texto !== undefined) canais = analisar(texto);
  else if (atual.link) canais = await baixar(atual.link);
  else throw new ErroLista('Escolha o arquivo de novo');
  await gravarCanais(id, canais);
  if (atual.ativa) canaisPorLista.set(id, canais);
  listas = listas.map(l => (l.id === id ? { ...l, atualizadaEm: Date.now(), total: canais.length } : l));
  await gravarMeta();
  avisar();
}

export async function alternarLista(id: string): Promise<void> {
  await carregarMinhasListas();
  const atual = listas.find(l => l.id === id);
  if (!atual) return;
  const ativa = !atual.ativa;
  if (ativa) canaisPorLista.set(id, await lerCanais(id));
  else canaisPorLista.delete(id);
  listas = listas.map(l => (l.id === id ? { ...l, ativa } : l));
  await gravarMeta();
  avisar();
}

export async function removerLista(id: string): Promise<void> {
  await carregarMinhasListas();
  canaisPorLista.delete(id);
  listas = listas.filter(l => l.id !== id);
  await FileSystem.deleteAsync(PASTA + id + '.json', { idempotent: true }).catch(() => {});
  await gravarMeta();
  avisar();
}

/** Ao abrir o app: atualiza em segundo plano as listas com mais de 12 h. Falha em silêncio. */
export async function atualizarVencidas(): Promise<void> {
  if (atualizandoVencidas) return;
  atualizandoVencidas = true;
  try {
    await carregarMinhasListas();
    for (const l of [...listas]) {
      if (l.link && Date.now() - l.atualizadaEm > DOZE_HORAS) {
        await atualizarLista(l.id).catch(() => {});
      }
    }
  } finally {
    atualizandoVencidas = false;
  }
}

export function textoAtualizada(ts: number, agora = Date.now()): string {
  const min = Math.floor((agora - ts) / 60_000);
  if (min < 1) return 'atualizada agora';
  if (min < 60) return `atualizada há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `atualizada há ${h} h`;
  const d = Math.floor(h / 24);
  return `atualizada há ${d} ${d === 1 ? 'dia' : 'dias'}`;
}

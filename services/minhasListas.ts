// "Minhas listas": o usuário cola o link de uma lista .m3u comum e os canais
// entram no app. Tudo fica só neste aparelho (AsyncStorage para os dados da
// lista, um arquivo por lista para os canais já lidos). Nada vai a servidor
// nosso, e o link nunca é mostrado nem registrado em log.
import { anotarLista } from './remocoes';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import type { Channel, ChannelStream } from '../types';
import { chave, criarLeitor, ehRestrito, lerM3U, lerTudoSemTravar, pareceM3U, type CanalM3U, type ItemVod } from './minhasListasLeitor';
import { apagar, baixarParaArquivo, lerLinhas } from './lerEmFluxo';
import { File as FSFile } from 'expo-file-system';
import { MontadorDeAcervo, montarAcervo, noDisco, type ResumoAcervo } from './acervoLista';
import { canaisXtream, deLink, ErroXtream, linkM3u, normalizarServidor } from './xtream';

export const CATEGORIA_MINHAS_LISTAS = 'Minhas listas';
export const MAX_LISTAS = 10;
const CHAVE_META = 'minhas_listas_v1';
// Listas com filmes e séries passam fácil de 70 MB (300 mil itens).
const PRAZO_MS = 300_000;
const MAX_BYTES = 250 * 1024 * 1024;
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
  /** Filmes e séries que foram para Filmes e séries (docs/listas-m3u.md). Sem o campo: lista de antes disso. */
  filmes?: number;
  series?: number;
}

/** O que a lista trouxe: os canais e os filmes e episódios. */
interface Lido { canais: CanalM3U[]; vod: ItemVod[] | MontadorDeAcervo }

/** A pasta do acervo da lista, no formato Saimo. */
export function pastaDoAcervo(id: string): string {
  return PASTA + id + '-acervo/';
}

/** As pastas de acervo das listas ativas que têm filmes ou séries. */
export function acervosDasListas(): string[] {
  return listas.filter(l => l.ativa && (l.filmes ?? 0) + (l.series ?? 0) > 0).map(l => pastaDoAcervo(l.id));
}

/** Grava o acervo da lista (apaga o que havia). */
async function gravarAcervo(id: string, vod: ItemVod[] | MontadorDeAcervo): Promise<ResumoAcervo> {
  const pasta = pastaDoAcervo(id);
  await FileSystem.deleteAsync(pasta, { idempotent: true }).catch(() => {});
  // Cede a vez à tela antes de montar (uns 2 s numa lista de 300 mil itens).
  await new Promise<void>((ok) => setTimeout(ok, 0));
  const { arquivos, resumo } = vod instanceof MontadorDeAcervo ? vod.montar() : montarAcervo(vod);
  if (!arquivos.size) return resumo;
  await FileSystem.makeDirectoryAsync(pasta, { intermediates: true }).catch(() => {});
  for (const [nome, texto] of arquivos) {
    await FileSystem.writeAsStringAsync(pasta + noDisco(nome), texto);
  }
  return resumo;
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
      // Listas de antes dos filmes e séries: os filmes e episódios estão como
      // canais. Baixa de novo uma vez, em segundo plano.
      setTimeout(() => {
        void (async () => {
          for (const l of [...listas]) {
            if (l.link && l.filmes === undefined) await atualizarLista(l.id).catch(() => {});
          }
        })();
      }, 5000);
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

/** Baixa um texto (M3U ou resposta da API). Erro genérico, sem o endereço. */
async function buscarTexto(link: string): Promise<string> {
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
  return texto;
}

async function baixar(link: string): Promise<Lido> {
  // Conta com usuário e senha (Xtream): canais pela API do servidor; filmes e
  // séries pelo M3U completo da conta.
  const conta = deLink(link);
  if (conta) {
    let canais: CanalM3U[] | null = null;
    let erro: unknown = null;
    try {
      canais = await canaisXtream(conta, buscarTexto, lerM3U);
    } catch (e) {
      erro = e instanceof ErroXtream ? new ErroLista(e.message) : e;
    }
    let vod: ItemVod[] | MontadorDeAcervo = [];
    try {
      vod = (await lerDoLink(linkM3u(conta))).vod;
    } catch { /* sem filmes e séries: ficam os canais */ }
    if (canais) return { canais, vod };
    if (vod.length) return { canais: [], vod };
    throw erro;
  }
  return lerDoLink(link);
}

/** Baixa para um arquivo e lê em pedaços (listas de 300 mil itens não cabem inteiras na memória). */
async function lerDoLink(link: string): Promise<Lido> {
  let arquivo: FSFile;
  try {
    arquivo = await baixarParaArquivo(link, { 'User-Agent': UA_LISTA, Accept: '*/*' });
  } catch {
    throw new ErroLista('Não consegui baixar essa lista');
  }
  try {
    return await lerDoArquivo(arquivo);
  } finally {
    apagar(arquivo);
  }
}

async function lerDoArquivo(arquivo: FSFile): Promise<Lido> {
  const vod = new MontadorDeAcervo();
  const leitor = criarLeitor(vod);
  await lerLinhas(arquivo, leitor.linha, (inicio) => {
    if (!pareceM3U(inicio)) throw new ErroLista('Isso não parece uma lista .m3u');
  });
  const canais = leitor.fim();
  if (!canais.length && !vod.length) throw new ErroLista('Essa lista não tem canais, filmes nem séries');
  return { canais, vod };
}

/** Mesma validação para link e arquivo. */
async function analisar(texto: string): Promise<Lido> {
  if (!pareceM3U(texto)) throw new ErroLista('Isso não parece uma lista .m3u');
  const lido = await lerTudoSemTravar(texto);
  if (!lido.canais.length && !lido.vod.length) throw new ErroLista('Essa lista não tem canais, filmes nem séries');
  return lido;
}

/**
 * O arquivo .m3u escolhido, copiado para o aparelho. Não lê o texto aqui: uma
 * lista de 70 MB inteira na memória derrubava o app; quem adiciona lê em
 * pedaços. Devolve a referência que [adicionarListaDeArquivo] e
 * [atualizarLista] aceitam no lugar do texto.
 */
export async function lerArquivoEscolhido(uri: string): Promise<string> {
  try {
    const info = await FileSystem.getInfoAsync(uri);
    if (info.exists && (info.size ?? 0) > MAX_BYTES) throw new ErroLista('Esse arquivo é grande demais');
    const destino = (FileSystem.cacheDirectory ?? '') + `escolhida-${Date.now().toString(36)}.m3u`;
    await FileSystem.copyAsync({ from: uri, to: destino });
    return PREFIXO_ARQUIVO + destino;
  } catch (e) {
    if (e instanceof ErroLista) throw e;
    throw new ErroLista('Não consegui ler esse arquivo');
  }
}

const PREFIXO_ARQUIVO = '\u0000arquivo:';

/** Texto ou arquivo escolhido (ver [lerArquivoEscolhido]): lê em pedaços quando é arquivo. */
async function analisarTextoOuArquivo(texto: string): Promise<Lido> {
  if (!texto.startsWith(PREFIXO_ARQUIVO)) return analisar(texto);
  const arquivo = new FSFile(texto.slice(PREFIXO_ARQUIVO.length));
  try {
    return await lerDoArquivo(arquivo);
  } finally {
    apagar(arquivo);
  }
}

/**
 * O link a guardar a partir do que a pessoa digitou. Com usuário e senha, o
 * primeiro campo é o servidor (Xtream); sem eles, é o link da lista. Devolve
 * `{ erro }` quando algo não fecha.
 */
export function linkDoFormulario(digitado: string, usuario: string, senha: string): { link: string } | { erro: string } {
  const u = usuario.trim();
  if (!u !== !senha) return { erro: 'Usuário e senha andam juntos: preencha os dois, ou deixe os dois em branco se a lista é só um link' };
  if (!u) return { link: digitado.trim() };
  const base = normalizarServidor(digitado);
  if (!base) return { erro: 'Esse servidor não parece um endereço válido' };
  return { link: linkM3u({ base, usuario: u, senha }) };
}

/** Telas vazias pedem "Adicionar lista": a seção de Ajustes abre o formulário ao aparecer. */
let pedidoDeAdicionar = false;
export const pedirAdicionarLista = () => { pedidoDeAdicionar = true; };
export function consumirPedidoDeAdicionar(): boolean { const p = pedidoDeAdicionar; pedidoDeAdicionar = false; return p; }

export function linkValido(link: string): boolean {
  return /^https?:\/\/\S+$/i.test(link.trim());
}

export async function adicionarLista(link: string, nome: string): Promise<MinhaLista> {
  await carregarMinhasListas();
  const l = link.trim();
  if (!linkValido(l)) throw new ErroLista('O link precisa começar com http:// ou https://');
  if (listas.length >= MAX_LISTAS) throw new ErroLista(`Você pode ter até ${MAX_LISTAS} listas`);
  const nova = await guardarNova(l, nome, await baixar(l));
  await anotarLista(l, false);
  return nova;
}

/** Lista vinda de um arquivo escolhido no aparelho (sem link). */
export async function adicionarListaDeArquivo(texto: string, nome: string): Promise<MinhaLista> {
  await carregarMinhasListas();
  if (listas.length >= MAX_LISTAS) throw new ErroLista(`Você pode ter até ${MAX_LISTAS} listas`);
  return guardarNova(null, nome, await analisarTextoOuArquivo(texto));
}

async function guardarNova(l: string | null, nome: string, { canais, vod }: Lido): Promise<MinhaLista> {
  let n = listas.length + 1;
  while (listas.some(x => x.nome === `Lista ${n}`)) n++;
  const id = novoId();
  const resumo = await gravarAcervo(id, vod);
  const lista: MinhaLista = {
    id,
    nome: nome.trim() || `Lista ${n}`,
    link: l,
    atualizadaEm: Date.now(),
    ativa: true,
    total: canais.length,
    filmes: resumo.filmes,
    series: resumo.series,
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
  let lido: Lido;
  if (texto !== undefined) lido = await analisarTextoOuArquivo(texto);
  else if (atual.link) lido = await baixar(atual.link);
  else throw new ErroLista('Escolha o arquivo de novo');
  const { canais } = lido;
  const resumo = await gravarAcervo(id, lido.vod);
  await gravarCanais(id, canais);
  if (atual.ativa) canaisPorLista.set(id, canais);
  listas = listas.map(l => (l.id === id ? { ...l, atualizadaEm: Date.now(), total: canais.length, filmes: resumo.filmes, series: resumo.series } : l));
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

/** `anotar` falso: quem tira é a sincronia (a remoção já veio de outro aparelho). */
export async function removerLista(id: string, anotar = true): Promise<void> {
  await carregarMinhasListas();
  const link = listas.find(l => l.id === id)?.link;
  if (anotar) await anotarLista(link, true);
  canaisPorLista.delete(id);
  listas = listas.filter(l => l.id !== id);
  await FileSystem.deleteAsync(PASTA + id + '.json', { idempotent: true }).catch(() => {});
  await FileSystem.deleteAsync(pastaDoAcervo(id), { idempotent: true }).catch(() => {});
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

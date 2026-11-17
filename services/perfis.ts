/**
 * Perfis: cada um com os seus favoritos, onde parou e novelinhas; listas,
 * fontes e ajustes são do aparelho todo. Contrato comum dos apps em
 * SaimoPlayer/docs/perfis.md.
 *
 * Armazenamento: o perfil principal usa as chaves de sempre (quem atualiza não
 * perde nada); os outros, a mesma chave com `@<id>`. Os stores de perfil
 * (favoritos de canal e mídia) gravam por [armazenamentoDoPerfil] e só se
 * hidratam depois de [iniciarPerfis] saber qual é o perfil ativo.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { sha256 } from './sha256';
import { AVATARES } from './avatares';

export interface Perfil {
  id: string;
  nome: string;
  avatar: string;
  /** Quando nome, avatar ou Kids mudaram por último (ms). */
  em: number;
  /** Perfil infantil: só títulos até 12 anos, nada adulto; sair pede o código. */
  kids?: boolean;
  /** SHA-256 de `saimo-kids:<id>:<código>`. */
  codigo?: string;
}

export interface Remocao { id: string; em: number }

export const PRINCIPAL = 'principal';
export const MAX_PERFIS = 10;
export const MAX_NOME = 20;

/** Chaves do AsyncStorage que são de cada perfil (apagadas junto com ele). */
export const CHAVES_DO_PERFIL = ['saimo-favorites', 'saimo-media-store', 'saimo-novelinhas-progresso'];

const CHAVE = 'saimo-perfis';

interface Estado { lista: Perfil[]; ativo: string; removidos: Remocao[]; perguntar: boolean }

let estado: Estado = { lista: [], ativo: PRINCIPAL, removidos: [], perguntar: true };
let iniciado = false;
let escolhidoNestaSessao = false;
const ouvintes = new Set<() => void>();

function principalPadrao(): Perfil {
  return { id: PRINCIPAL, nome: 'Principal', avatar: 'gato', em: 0 };
}

function normalizar(lista: Perfil[]): Perfil[] {
  const vistos = new Set<string>();
  const limpa = lista.filter((p) => p && typeof p.id === 'string' && p.id && !vistos.has(p.id) && vistos.add(p.id))
    .map((p) => (p.id === PRINCIPAL ? { ...p, kids: false, codigo: undefined } : p));
  const principal = limpa.find((p) => p.id === PRINCIPAL) ?? principalPadrao();
  return [principal, ...limpa.filter((p) => p.id !== PRINCIPAL)].slice(0, MAX_PERFIS);
}

async function gravar(): Promise<void> {
  try { await AsyncStorage.setItem(CHAVE, JSON.stringify(estado)); } catch { /* sem espaço: segue na memória */ }
  ouvintes.forEach((f) => { try { f(); } catch { /* ouvinte quebrado */ } });
}

/** Lê os perfis (uma vez, na partida). Antes disso o ativo é o principal. */
export async function iniciarPerfis(): Promise<void> {
  if (iniciado) return;
  try {
    const bruto = await AsyncStorage.getItem(CHAVE);
    if (bruto) {
      const e = JSON.parse(bruto) as Partial<Estado>;
      estado = {
        lista: Array.isArray(e.lista) ? e.lista : [],
        ativo: typeof e.ativo === 'string' ? e.ativo : PRINCIPAL,
        removidos: Array.isArray(e.removidos) ? e.removidos : [],
        perguntar: e.perguntar !== false,
      };
    }
  } catch { /* começa do zero */ }
  estado.lista = normalizar(estado.lista);
  if (!estado.lista.some((p) => p.id === estado.ativo)) estado.ativo = PRINCIPAL;
  iniciado = true;
}

export const perfis = (): Perfil[] => normalizar(estado.lista);
export const idAtivo = (): string => estado.ativo;
export const ativo = (): Perfil => perfis().find((p) => p.id === estado.ativo) ?? perfis()[0];
export const removidos = (): Remocao[] => estado.removidos;
export const kidsAtivo = (): boolean => ativo().kids === true;
export const perguntarAoAbrir = (): boolean => estado.perguntar;

export function definirPerguntar(sim: boolean): void { estado.perguntar = sim; void gravar(); }

export function deveEscolherAoAbrir(): boolean {
  return !escolhidoNestaSessao && estado.perguntar && perfis().length >= 2;
}

export function marcarEscolhido(): void { escolhidoNestaSessao = true; }

/** Chave de um dado de perfil para o perfil [id] (o ativo, se omitido). */
export function chaveDoPerfil(chave: string, id = estado.ativo): string {
  return id === PRINCIPAL ? chave : `${chave}@${id}`;
}

/**
 * Gravação dos stores de perfil pausada: até o primeiro carregamento e durante
 * a troca de perfil, um store vazio não pode gravar por cima dos dados de ninguém.
 */
let gravacaoLiberada = false;
export function liberarGravacao(sim: boolean): void { gravacaoLiberada = sim; }

/** Armazenamento dos stores de perfil: a mesma chave, no perfil ativo. */
export const armazenamentoDoPerfil = {
  getItem: (nome: string) => AsyncStorage.getItem(chaveDoPerfil(nome)),
  setItem: (nome: string, valor: string) =>
    (gravacaoLiberada ? AsyncStorage.setItem(chaveDoPerfil(nome), valor) : Promise.resolve()),
  removeItem: (nome: string) => AsyncStorage.removeItem(chaveDoPerfil(nome)),
};

// ---------- Kids ----------

export const hashCodigo = (id: string, codigo: string): string => sha256(`saimo-kids:${id}:${codigo}`);
export const pedeCodigo = (p: Perfil): boolean => !!p.kids && !!p.codigo;
export const conferirCodigo = (p: Perfil, codigo: string): boolean => !pedeCodigo(p) || hashCodigo(p.id, codigo) === p.codigo;

// ---------- criar, editar, apagar ----------

const limparNome = (nome: string) => nome.replace(/\s+/g, ' ').trim().slice(0, MAX_NOME);

function novoId(): string {
  const letras = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let s = 'p';
  for (let i = 0; i < 9; i++) s += letras[Math.floor(Math.random() * letras.length)];
  return s;
}

/** `kidsCodigo`: 4 dígitos liga o Kids com esse código. */
export function criar(nome: string, avatar: string, kidsCodigo?: string): Perfil | null {
  const lista = perfis();
  const limpo = limparNome(nome);
  if (!limpo || lista.length >= MAX_PERFIS) return null;
  const id = novoId();
  const p: Perfil = { id, nome: limpo, avatar, em: Date.now() };
  if (kidsCodigo && /^\d{4}$/.test(kidsCodigo)) { p.kids = true; p.codigo = hashCodigo(id, kidsCodigo); }
  estado.lista = [...lista, p];
  void gravar();
  avisarConnect();
  return p;
}

/** `kidsCodigo`: undefined mantém; '' desliga o Kids; 4 dígitos liga ou troca o código. */
export function editar(id: string, nome: string, avatar: string, kidsCodigo?: string): void {
  const limpo = limparNome(nome);
  if (!limpo) return;
  estado.lista = perfis().map((p) => {
    if (p.id !== id) return p;
    const novo: Perfil = { ...p, nome: limpo, avatar, em: Date.now() };
    if (kidsCodigo === '') { delete novo.kids; delete novo.codigo; }
    else if (kidsCodigo && /^\d{4}$/.test(kidsCodigo) && id !== PRINCIPAL) { novo.kids = true; novo.codigo = hashCodigo(id, kidsCodigo); }
    return novo;
  });
  void gravar();
  avisarConnect();
}

async function apagarDados(id: string): Promise<void> {
  if (id === PRINCIPAL) return;
  try { await AsyncStorage.multiRemove(CHAVES_DO_PERFIL.map((c) => chaveDoPerfil(c, id))); } catch { /* segue */ }
}

/** Apaga o perfil e os dados dele. O principal não sai. */
export async function apagar(id: string): Promise<void> {
  if (id === PRINCIPAL) return;
  await apagarDados(id);
  estado.lista = perfis().filter((p) => p.id !== id);
  guardarRemocao({ id, em: Date.now() });
  if (estado.ativo === id) await entrar(PRINCIPAL);
  await gravar();
  avisarConnect();
}

function guardarRemocao(r: Remocao): void {
  estado.removidos = [r, ...estado.removidos.filter((x) => x.id !== r.id)].sort((a, b) => b.em - a.em).slice(0, 50);
}

// ---------- trocar ----------

type AoTrocar = () => Promise<void> | void;
const aoTrocar: AoTrocar[] = [];
/** Quem guarda dado de perfil na memória registra aqui como recarregar. */
export function aoTrocarPerfil(f: AoTrocar): void { aoTrocar.push(f); }

/** Entra no perfil: grava e recarrega o que é de perfil. */
export async function entrar(id: string): Promise<void> {
  escolhidoNestaSessao = true;
  if (id === estado.ativo || !perfis().some((p) => p.id === id)) { void gravar(); return; }
  estado.ativo = id;
  await gravar();
  for (const f of aoTrocar) { try { await f(); } catch { /* um store que falha não trava a troca */ } }
}

export function assinarPerfis(f: () => void): () => void { ouvintes.add(f); return () => { ouvintes.delete(f); }; }

// ---------- sincronia (Saimo Connect) ----------

let avisarConnect: () => void = () => {};
/** A sincronia avisa a TV quando um perfil muda (posto por sincroniaDados). */
export function definirAvisoConnect(f: () => void): void { avisarConnect = f; }

/** Junta a lista de perfis vinda da TV. Devolve os ids que existem aqui depois. */
export async function mesclarPerfis(remotos: Perfil[], remocoes: Remocao[]): Promise<Set<string>> {
  const locaisRemovidos = new Map(estado.removidos.map((r) => [r.id, r]));
  for (const r of remocoes) {
    if (!r?.id || r.id === PRINCIPAL) continue;
    const local = perfis().find((p) => p.id === r.id);
    if (local && local.em <= r.em) {
      await apagarDados(r.id);
      estado.lista = perfis().filter((p) => p.id !== r.id);
      if (estado.ativo === r.id) await entrar(PRINCIPAL);
    }
    if ((locaisRemovidos.get(r.id)?.em ?? 0) < r.em) guardarRemocao(r);
  }
  let lista = perfis();
  const removidosAgora = new Map(estado.removidos.map((r) => [r.id, r]));
  for (const p of remocoes.length >= 0 ? remotos : []) {
    if (!p?.id || !p.nome) continue;
    const remocao = removidosAgora.get(p.id);
    if (remocao && remocao.em >= p.em) continue;
    const limpo: Perfil = { id: p.id, nome: limparNome(p.nome), avatar: p.avatar, em: p.em || 0,
      ...(p.kids && p.id !== PRINCIPAL ? { kids: true, codigo: p.codigo } : {}) };
    const local = lista.find((x) => x.id === p.id);
    if (!local && lista.length < MAX_PERFIS) lista = [...lista, limpo];
    else if (local && limpo.em > local.em) lista = lista.map((x) => (x.id === p.id ? limpo : x));
  }
  estado.lista = normalizar(lista);
  await gravar();
  return new Set(perfis().map((p) => p.id));
}

export function avatarValido(a: string): boolean { return (AVATARES as readonly string[]).includes(a); }

// Registro do que foi removido ("Continue assistindo", favoritos, canais
// favoritos, Minhas listas), para a sincronia (Conta Saimo e Saimo Connect) não
// trazer de volta. Contrato em SaimoPlayer/docs/perfis.md: cada remoção é
// `{…, em}` e um item só fica se for mais novo que ela (sem `em` conta como 0).
// As mesmas regras do servidor (SaimoConta/src/juntar.ts).
//
// Por perfil (`saimo-remocoes`): prog e fav ({tipo, titulo, ano, em}; ano vazio
// vale para qualquer ano), canal ({id, nome?, em}) e canalEm (quando cada canal
// virou favorito). Minhas listas (`saimo-minhas-removidas`, do aparelho): {link, em}.
// Sem imports de stores: as stores chamam daqui.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { chaveDoPerfil, idAtivo } from './perfis';

type Obj = Record<string, any>;

export interface Registro { prog: Obj[]; fav: Obj[]; canal: Obj[]; canalEm: Record<string, number> }

const CHAVE = 'saimo-remocoes';
const CHAVE_LISTAS = 'saimo-minhas-removidas';
const MAX = 300;
const VIDA = 180 * 24 * 3600_000;

const txt = (v: unknown) => (typeof v === 'string' ? v : '');
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : Number(v) || 0);
const arr = (v: unknown): Obj[] => (Array.isArray(v) ? v.filter((x) => x && typeof x === 'object') : []);
const mapa = (v: unknown): Record<string, number> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, number>) : {});
const tipoDe = (x: Obj) => (x.tipo === 's' ? 's' : 'f');
const chaveTitulo = (r: Obj) => (txt(r.titulo) ? `${tipoDe(r)}|${txt(r.titulo)}|${txt(r.ano)}` : '');
const chaveCanal = (r: Obj) => txt(r.id) || txt(r.nome);
const chaveLink = (r: Obj) => txt(r.link).trim();

function juntarPor(a: unknown, b: unknown, chave: (r: Obj) => string): Obj[] {
  const m = new Map<string, Obj>();
  const limite = Date.now() - VIDA;
  for (const r of [...arr(a), ...arr(b)]) {
    const k = chave(r);
    if (!k || !(num(r.em) > 0) || num(r.em) < limite) continue;
    const atual = m.get(k);
    if (!atual || num(r.em) > num(atual.em)) m.set(k, { ...atual, ...r });
  }
  return [...m.values()].sort((x, y) => num(y.em) - num(x.em)).slice(0, MAX);
}

/** Título e tipo de um id do acervo (`saimo|m|letra|titulo|ano`). Cópia de saimoSources.parseVodId (sem ciclo de imports). */
export function tituloDoId(id: string): { tipo: 'f' | 's'; titulo: string; ano: string } | null {
  const base = id.split('|e|')[0];
  const f = base.split('|');
  if (f.length !== 5 || f[0] !== 'saimo' || !['m', 's'].includes(f[1])) return null;
  try { return { tipo: f[1] === 's' ? 's' : 'f', titulo: decodeURIComponent(f[3]), ano: decodeURIComponent(f[4]) }; } catch { return null; }
}

export function tituloRemovido(rem: Obj[], x: { tipo: string; titulo: string; ano?: string }, emItem: number): boolean {
  const ano = txt(x.ano);
  return rem.some((r) => tipoDe(r) === tipoDe(x) && txt(r.titulo) === x.titulo
    && (!txt(r.ano) || !ano || txt(r.ano) === ano) && num(r.em) >= emItem);
}

/* ───────────── por perfil (em memória, gravado no armazenamento) ───────────── */

const cache = new Map<string, Registro>();
const VAZIO = (): Registro => ({ prog: [], fav: [], canal: [], canalEm: {} });

export async function carregarRegistro(id: string): Promise<Registro> {
  try {
    const v = JSON.parse((await AsyncStorage.getItem(chaveDoPerfil(CHAVE, id))) || '{}') ?? {};
    const r = { prog: arr(v.prog), fav: arr(v.fav), canal: arr(v.canal), canalEm: mapa(v.canalEm) };
    cache.set(id, r);
    return r;
  } catch { return registro(id); }
}

/** O registro do perfil, lido do armazenamento na primeira vez. */
export async function garantirRegistro(id: string): Promise<Registro> {
  return cache.has(id) ? registro(id) : carregarRegistro(id);
}

export function registro(id: string): Registro {
  let r = cache.get(id);
  if (!r) { r = VAZIO(); cache.set(id, r); }
  return r;
}

export function gravarRegistro(id: string, r: Registro): void {
  const limpo = {
    prog: juntarPor(r.prog, [], chaveTitulo), fav: juntarPor(r.fav, [], chaveTitulo),
    canal: juntarPor(r.canal, [], chaveCanal), canalEm: r.canalEm,
  };
  cache.set(id, limpo);
  void AsyncStorage.setItem(chaveDoPerfil(CHAVE, id), JSON.stringify(limpo)).catch(() => {});
}

/** Junta as remoções que vieram de fora (perfil do pacote). `idDoCanal` traduz o nome do canal. */
export function juntarRegistro(id: string, chegou: Obj, idDoCanal: (nome: string) => string): Registro {
  const r = registro(id);
  const canalEm = { ...r.canalEm };
  for (const [nome, em] of Object.entries(mapa(chegou.favCanaisEm))) {
    const c = idDoCanal(nome);
    if (num(em) > num(canalEm[c])) canalEm[c] = num(em);
  }
  const canaisDeFora = arr(chegou.favCanaisRemovidos).filter((c) => txt(c.nome)).map((c) => ({ id: idDoCanal(txt(c.nome)), nome: txt(c.nome), em: num(c.em) }));
  const novo = {
    prog: juntarPor(r.prog, chegou.progressoRemovido, chaveTitulo),
    fav: juntarPor(r.fav, chegou.favTitulosRemovidos, chaveTitulo),
    canal: juntarPor(r.canal, canaisDeFora, chaveCanal),
    canalEm,
  };
  gravarRegistro(id, novo);
  return registro(id);
}

/** As remoções no formato do pacote (o canal vai pelo nome; sem nome conhecido, não vai). */
export function camposDoPacote(r: Registro, nomeDoCanal: (id: string) => string | undefined): Obj {
  const canais = r.canal.map((c) => ({ nome: txt(c.nome) || nomeDoCanal(txt(c.id)) || '', em: num(c.em) })).filter((c) => c.nome);
  const canalEm: Record<string, number> = {};
  for (const [id, em] of Object.entries(r.canalEm)) { const n = nomeDoCanal(id); if (n) canalEm[n] = em; }
  return {
    ...(r.prog.length ? { progressoRemovido: r.prog.map(({ tipo, titulo, ano, em }) => ({ tipo, titulo, ano, em })) } : {}),
    ...(r.fav.length ? { favTitulosRemovidos: r.fav.map(({ tipo, titulo, ano, em }) => ({ tipo, titulo, ano, em })) } : {}),
    ...(canais.length ? { favCanaisRemovidos: canais } : {}),
    ...(Object.keys(canalEm).length ? { favCanaisEm: canalEm } : {}),
  };
}

export function canalRemovido(r: Registro, id: string, emItem = num(r.canalEm[id])): boolean {
  return r.canal.some((c) => txt(c.id) === id && num(c.em) >= emItem);
}

/* ───────────── o que as telas fazem (perfil ativo) ───────────── */

/** Tirou do "Continue assistindo" (id do filme ou da série). */
export function anotarContinuar(vodId: string): void {
  const t = tituloDoId(vodId);
  if (!t) return;
  const id = idAtivo(), em = Date.now();
  void garantirRegistro(id).then((r) => gravarRegistro(id, { ...r, prog: [...r.prog, { ...t, em }] }));
}

/** Desfavoritou (removido) ou favoritou um título. */
export function anotarFavorito(vodId: string, removido: boolean): void {
  const t = tituloDoId(vodId);
  if (!t) return;
  const id = idAtivo(), em = Date.now();
  const k = chaveTitulo(t);
  void garantirRegistro(id).then((r) =>
    gravarRegistro(id, { ...r, fav: removido ? [...r.fav, { ...t, em }] : r.fav.filter((x) => chaveTitulo(x) !== k) }));
}

/** Desfavoritou (removido) ou favoritou um canal. */
export function anotarCanal(canalId: string, removido: boolean): void {
  const id = idAtivo(), em = Date.now();
  void garantirRegistro(id).then((r) => {
    const canalEm = { ...r.canalEm };
    if (removido) delete canalEm[canalId]; else canalEm[canalId] = em;
    gravarRegistro(id, {
      ...r, canalEm,
      canal: removido ? [...r.canal, { id: canalId, em }] : r.canal.filter((c) => txt(c.id) !== canalId),
    });
  });
}

/* ───────────── Minhas listas (do aparelho) ───────────── */

export interface RegistroListas { rem: Obj[]; em: Record<string, number> }
let listasCache: RegistroListas | null = null;

export async function registroListas(): Promise<RegistroListas> {
  if (listasCache) return listasCache;
  try {
    const v = JSON.parse((await AsyncStorage.getItem(CHAVE_LISTAS)) || '{}') ?? {};
    listasCache = { rem: arr(v.rem), em: mapa(v.em) };
  } catch { listasCache = { rem: [], em: {} }; }
  return listasCache;
}

export async function gravarRegistroListas(r: RegistroListas): Promise<void> {
  listasCache = { rem: juntarPor(r.rem, [], chaveLink), em: r.em };
  await AsyncStorage.setItem(CHAVE_LISTAS, JSON.stringify(listasCache)).catch(() => {});
}

export function juntarRegistroListas(r: RegistroListas, chegou: unknown): RegistroListas {
  return { rem: juntarPor(r.rem, chegou, chaveLink), em: r.em };
}

export function listaRemovida(r: RegistroListas, link: string, emItem = num(r.em[link])): boolean {
  return r.rem.some((x) => chaveLink(x) === link && num(x.em) >= emItem);
}

/** Lista com link removida (ou adicionada) aqui. */
export async function anotarLista(link: string | null | undefined, removida: boolean): Promise<void> {
  if (!link) return;
  const r = await registroListas();
  const em = { ...r.em };
  if (removida) delete em[link]; else em[link] = Date.now();
  await gravarRegistroListas({ em, rem: removida ? [...r.rem, { link, em: Date.now() }] : r.rem.filter((x) => chaveLink(x) !== link) });
}

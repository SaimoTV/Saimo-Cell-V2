// Canal, filme ou episódio: a classificação dos itens de uma lista M3U.
// Regras em SaimoPlayer/docs/listas-m3u.md; referência em
// SaimoPlayer/scripts/classificar_m3u.py e gabarito em
// scripts/testes/classificar.* (scripts/testar_classificar.mjs confere).
// Sem dependência do React Native: roda em Node para o teste.

export interface Marca { temporada: number; episodio: number; /** em caracteres (UTF-16) do nome */ inicio: number; forte: boolean }
export type Tipo = { tipo: 'canal' } | { tipo: 'filme' } | { tipo: 'episodio'; marca: Marca };

export const VIDEO = new Set(['mp4', 'mkv', 'avi', 'mov', 'wmv', 'flv', 'webm', 'm4v', 'mpg', 'mpeg', '3gp', 'divx', 'ogv', 'vob']);
const TIPO_CANAL = new Set(['live', 'channel', 'tv', 'radio']);
const TIPO_FILME = new Set(['movie', 'movies', 'vod', 'film', 'filme']);
const TIPO_SERIE = new Set(['series', 'serie', 'tvshow', 'show', 'episode']);
const SEG_FILME = new Set(['movie', 'movies', 'vod', 'filmes']);
const SEG_SERIE = new Set(['series', 'serie']);
const PALAVRAS_ACERVO = new Set(['filme', 'filmes', 'movie', 'movies', 'vod', 'serie', 'series', 'novela', 'novelas',
  'anime', 'animes', 'dorama', 'doramas', 'temporada', 'temporadas']);
const SEPARADORES = new Set([' ', '-', ':', '|', '.', '_', '(', '[', '–', '—', '\t']);
const TAGS_LEG = new Set(['l', 'leg', 'legendado', 'legendada']);
const TAGS_DUB = new Set(['d', 'dub', 'dublado', 'dublada', 'nac', 'nacional']);
const PALAVRAS_EP = ['episodio', 'episode', 'capitulo', 'cap', 'ep'];

/** Minúsculas sem acento, um caractere (UTF-16) para cada caractere do original. */
export function dobrar(t: string): string {
  let s = '';
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    const code = c.charCodeAt(0);
    if (code < 128) { s += code >= 65 && code <= 90 ? String.fromCharCode(code + 32) : c; continue; }
    const d = c.normalize('NFD')[0]?.toLowerCase() ?? c;
    s += d.length === 1 ? d : c;
  }
  return s;
}

const LETRA_OU_NUMERO = /[\p{L}\p{N}]/u;
const LETRA = /\p{L}/u;
// ASCII (quase tudo) sem expressão regular: no celular ela é cara.
function alnum(c: string | undefined): boolean {
  if (!c) return false;
  const k = c.charCodeAt(0);
  if (k < 128) return (k >= 48 && k <= 57) || (k >= 65 && k <= 90) || (k >= 97 && k <= 122);
  return LETRA_OU_NUMERO.test(c);
}
function letra(c: string | undefined): boolean {
  if (!c) return false;
  const k = c.charCodeAt(0);
  if (k < 128) return (k >= 65 && k <= 90) || (k >= 97 && k <= 122);
  return LETRA.test(c);
}
const digito = (c: string | undefined) => !!c && c >= '0' && c <= '9';
const inicioDePalavra = (n: string, i: number) => i === 0 || !alnum(n[i - 1]);

function lerDigitos(n: string, j: number, maximo: number): [number, number] | null {
  let k = j;
  while (k < n.length && digito(n[k]) && k - j < maximo) k++;
  if (k === j || (k < n.length && digito(n[k]))) return null;
  return [Number(n.slice(j, k)), k];
}

function pular(n: string, j: number, chars: string): number {
  while (j < n.length && chars.includes(n[j])) j++;
  return j;
}

function palavraDeEpisodio(n: string, j: number): number | null {
  for (const p of PALAVRAS_EP) {
    if (!n.startsWith(p, j)) continue;
    let k = j + p.length;
    if (k < n.length && letra(n[k])) continue;
    k = pular(n, k, '.');
    k = pular(n, k, ' ');
    const r = lerDigitos(n, k, 4);
    if (r) return r[0];
  }
  return null;
}

function lerDigitosAte(n: string, j: number, maximo: number, seguinte: string): [number, number] | null {
  let k = j;
  while (k < n.length && digito(n[k])) k++;
  if (k === j || k - j > maximo || k >= n.length || n[k] !== seguinte) return null;
  return [Number(n.slice(j, k)), k];
}

/**
 * A marca de episódio do nome, em três passadas: S01E02/T01E02 no nome
 * inteiro; "Temporada N ... Episódio M"; 1x02 (nunca no começo do nome:
 * "4x4 Sob Medida" e "4x100" são títulos). A fraca (Ep 12) só sem forte.
 */
export function marca(nome: string): Marca | null {
  const n = dobrar(nome);
  for (let i = 0; i < n.length; i++) {
    const c = n[i];
    if ((c !== 's' && c !== 't') || !inicioDePalavra(n, i)) continue;
    const a = lerDigitos(n, i + 1, 3);
    if (!a) continue;
    let j = pular(n, a[1], ' ._-');
    if (j < n.length && (n[j] === 'e' || (c === 's' && n[j] === 'x'))) {
      j++;
      if (n[j] === 'p') j++;
      j = pular(n, j, ' .');
      const e = lerDigitos(n, j, 4);
      if (e) return { temporada: a[0], episodio: e[0], inicio: i, forte: true };
    }
  }
  for (let i = 0; i < n.length; i++) {
    if (!inicioDePalavra(n, i)) continue;
    for (const p of ['temporada', 'season']) {
      if (!n.startsWith(p, i)) continue;
      const a = lerDigitos(n, pular(n, i + p.length, ' '), 3);
      if (!a) continue;
      for (let k = a[1]; k < Math.min(a[1] + 13, n.length); k++) {
        if (!inicioDePalavra(n, k)) continue;
        const e = palavraDeEpisodio(n, k);
        if (e !== null) return { temporada: a[0], episodio: e, inicio: i, forte: true };
      }
    }
  }
  for (let i = 1; i < n.length; i++) {
    if (!digito(n[i]) || !inicioDePalavra(n, i)) continue;
    const a = lerDigitosAte(n, i, 2, 'x');
    if (!a) continue;
    const e = lerDigitos(n, a[1] + 1, 3);
    if (e && (e[1] === n.length || !alnum(n[e[1]]))) return { temporada: a[0], episodio: e[0], inicio: i, forte: true };
  }
  for (let i = 0; i < n.length; i++) {
    if (!inicioDePalavra(n, i)) continue;
    const e = palavraDeEpisodio(n, i);
    if (e !== null) return { temporada: 1, episodio: e, inicio: i, forte: false };
  }
  return null;
}

function caminho(url: string): string[] {
  let u = url.split('#')[0].split('?')[0];
  const e = u.indexOf('://');
  if (e >= 0) {
    const resto = u.slice(e + 3);
    const b = resto.indexOf('/');
    u = b >= 0 ? resto.slice(b + 1) : '';
  }
  return u.toLowerCase().split('/').filter(Boolean);
}

// O mesmo grupo se repete em milhares de itens: a resposta fica guardada.
const GRUPOS = new Map<string, boolean>();
function grupoDeAcervo(grupo: string): boolean {
  let r = GRUPOS.get(grupo);
  if (r === undefined) { r = grupoDeAcervoSemCache(grupo); if (GRUPOS.size < 5000) GRUPOS.set(grupo, r); }
  return r;
}
function grupoDeAcervoSemCache(grupo: string): boolean {
  const g = dobrar(grupo);
  const ws = g.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  if (!ws.some(w => PALAVRAS_ACERVO.has(w))) return false;
  if (g.includes('24h') || g.includes('24 horas') || g.includes('24/7') || g.includes('ao vivo')) return false;
  return !ws.some(w => w === 'canal' || w === 'canais' || w === 'live');
}

export function anoNoFim(nome: string): boolean {
  return /\((?:19|20)\d\d\)$/.test(nome.trimEnd());
}
const anoDoFim = (nome: string) => { const t = nome.trimEnd(); return t.slice(t.length - 5, t.length - 1); };

export function tipo(url: string, nome: string, grupo: string, declarado: string): Tipo {
  const m = marca(nome);
  const segs = caminho(url);
  // Arquivo de vídeo (.mp4, .mkv, .avi...) nunca é canal, nem declarado "live".
  const ultimo0 = segs[segs.length - 1] ?? '';
  const p0 = ultimo0.lastIndexOf('.');
  if (p0 >= 0 && VIDEO.has(ultimo0.slice(p0 + 1))) return m ? { tipo: 'episodio', marca: m } : { tipo: 'filme' };
  const d = declarado.trim().toLowerCase();
  if (TIPO_CANAL.has(d)) return { tipo: 'canal' };
  let acervo = TIPO_FILME.has(d) || TIPO_SERIE.has(d);
  if (!acervo) {
    for (const s of segs.slice(0, -1)) {
      if (SEG_FILME.has(s) || SEG_SERIE.has(s)) { acervo = true; break; }
      if (s === 'live') return { tipo: 'canal' };
    }
    // Canal Xtream sem prefixo: /usuario/senha/123(.ts|.m3u8).
    if (!acervo && segs.length === 3 && /^\d+(\.(ts|m3u8))?$/.test(segs[2])) return { tipo: 'canal' };
  }
  if (!acervo && segs.length) {
    const ultimo = segs[segs.length - 1];
    const p = ultimo.lastIndexOf('.');
    if (p >= 0) acervo = VIDEO.has(ultimo.slice(p + 1));
  }
  if (acervo) return m ? { tipo: 'episodio', marca: m } : { tipo: 'filme' };
  if (grupoDeAcervo(grupo)) {
    if (m && m.forte) return { tipo: 'episodio', marca: m };
    if (anoNoFim(limpar(nome)[0])) return { tipo: 'filme' };
  }
  return { tipo: 'canal' };
}

// ---------- títulos ----------

function resolucao(t: string): boolean { return /\d{3,}[pi]/i.test(t); }

const PALAVRAS = new Map<string, RegExp>();
function temPalavra(t: string, p: string): boolean {
  if (!t.includes(p)) return false;
  let r = PALAVRAS.get(p);
  if (!r) { r = new RegExp(`(^|[^\\p{L}\\p{N}_])${p}($|[^\\p{L}\\p{N}_])`, 'u'); PALAVRAS.set(p, r); }
  return r.test(t);
}

function tagRuim(conteudo: string): boolean {
  const t = conteudo.toLowerCase();
  return resolucao(t) || t.includes('not 24/7') || t.includes('geoblocked') || t.includes('geo-blocked') || t.includes('backup')
    || t.includes('vertical') || temPalavra(t, 'sd') || temPalavra(t, 'hd') || t.includes('fhd') || temPalavra(t, '4k');
}

/** Tira tags de qualidade e de versão; devolve [nome, versão]. */
export function limpar(original: string): [string, 'leg' | 'dub' | null] {
  let versao: 'leg' | 'dub' | null = null;
  let nome = original.trim();
  for (;;) {
    const t = nome.trimEnd();
    const fecha = t[t.length - 1];
    if (fecha === ')' || fecha === ']') {
      const pos = t.lastIndexOf(fecha === ')' ? '(' : '[');
      if (pos >= 0) {
        const conteudo = t.slice(pos + 1, -1).trim();
        const c = dobrar(conteudo);
        if (TAGS_LEG.has(c)) { versao = versao ?? 'leg'; nome = t.slice(0, pos); continue; }
        if (TAGS_DUB.has(c)) { versao = versao ?? 'dub'; nome = t.slice(0, pos); continue; }
        if (tagRuim(conteudo)) { nome = t.slice(0, pos); continue; }
      }
    }
    const esp = t.lastIndexOf(' ');
    if (esp >= 0 && ['leg', 'legendado', 'legendada'].includes(dobrar(t.slice(esp + 1)))) {
      versao = versao ?? 'leg'; nome = t.slice(0, esp); continue;
    }
    nome = t;
    break;
  }
  // Tags de versão no meio ("Filme [L] (2020)").
  for (const [abre, fecha] of [['[', ']'], ['(', ')']]) {
    let de = 0;
    for (;;) {
      const i = nome.indexOf(abre, de);
      if (i < 0) break;
      const f = nome.indexOf(fecha, i + 1);
      if (f < 0) break;
      const c = dobrar(nome.slice(i + 1, f).trim());
      if (TAGS_LEG.has(c) || TAGS_DUB.has(c)) {
        versao = versao ?? (TAGS_LEG.has(c) ? 'leg' : 'dub');
        nome = (nome.slice(0, i).trimEnd() + ' ' + nome.slice(f + 1).trimStart()).trim();
        de = Math.min(i, nome.length);
      } else de = f + 1;
    }
  }
  return [nome.split(/\s+/).filter(Boolean).join(' '), versao];
}

function anoRepetido(nome: string): string {
  let t = nome.trimEnd();
  while (anoNoFim(t)) {
    const antes = t.slice(0, -6).trimEnd();
    if (!anoNoFim(antes) || anoDoFim(antes) !== anoDoFim(t)) break;
    t = antes;
  }
  return t;
}

function semExtensao(nome: string): string {
  const t = nome.trim();
  const p = t.lastIndexOf('.');
  return p >= 0 && VIDEO.has(t.slice(p + 1).toLowerCase()) ? t.slice(0, p).trim() : t;
}

const VERSOES = new Map<string, 'leg' | 'dub'>();
function versaoDoGrupo(grupo: string): 'leg' | 'dub' {
  let v = VERSOES.get(grupo);
  if (!v) { v = dobrar(grupo).includes('legendad') ? 'leg' : 'dub'; if (VERSOES.size < 5000) VERSOES.set(grupo, v); }
  return v;
}

export interface Titulo { titulo: string; ano: string; versao: 'leg' | 'dub' }

export function tituloDoFilme(nome: string, grupo: string): Titulo {
  const [t0, versao] = limpar(semExtensao(nome));
  const t = anoRepetido(t0);
  return { titulo: t, ano: anoNoFim(t) ? anoDoFim(t) : '', versao: versao ?? versaoDoGrupo(grupo) };
}

function semSeparadoresNoFim(t: string): string {
  let i = t.length;
  while (i > 0 && SEPARADORES.has(t[i - 1])) i--;
  return t.slice(0, i);
}

export function tituloDaSerie(nome: string, inicio: number, grupo: string): Titulo {
  const [t0, v0] = limpar(semSeparadoresNoFim(nome.slice(0, inicio)));
  let t = semSeparadoresNoFim(t0).trim();
  const versao = v0 ?? limpar(nome.slice(inicio))[1];
  t = anoRepetido(t);
  let ano = '';
  if (anoNoFim(t)) {
    ano = anoDoFim(t);
    t = semSeparadoresNoFim(t.slice(0, -6)).trim();
  }
  if (!t) t = grupo.trim() || 'Série';
  return { titulo: t, ano, versao: versao ?? versaoDoGrupo(grupo) };
}

import { tipo, type Tipo } from './classificar';
// Leitor de listas .m3u comuns ("Minhas listas"). Sem dependência do React
// Native para poder ser testado em Node. Segue ESPEC_LISTAS_M3U.md e deve
// gerar exatamente a mesma saída do leitor de referência.

export interface FonteM3U {
  url: string;
  referer: string | null;
  ua: string | null;
  keyId: string | null;
  key: string | null;
  qualidade: string | null;
}

export interface CanalM3U {
  nome: string;
  grupo: string | null;
  logo: string | null;
  fontes: FonteM3U[];
}

export const LIMITE_CANAIS = 20000;

const TAG_RUIM = /\d{3,4}[pi]|not 24\/7|geo-?blocked|backup|vertical|\bsd\b|\bhd\b|fhd|\b4k\b/i;
const RES = /(\d{3,4}[pi])/i;

/** Chave de comparação: minúsculas, sem acentos, só a-z e 0-9. */
export function chave(nome: string): string {
  return nome.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

const REGEX_DO_ATRIBUTO = new Map<string, RegExp>();
function atributo(linha: string, nome: string): string | null {
  // Sem o atributo na linha, nem passa pela expressão regular (caro no celular).
  if (!linha.includes(nome + '="')) return null;
  let r = REGEX_DO_ATRIBUTO.get(nome);
  if (!r) { r = new RegExp('(?:^|[\\s:])' + nome.replace(/[-]/g, '\\-') + '="([^"]*)"'); REGEX_DO_ATRIBUTO.set(nome, r); }
  const m = r.exec(linha);
  return m ? m[1].trim() : null;
}

function nomeExibido(linha: string): string {
  let dentro = false;
  for (let i = 0; i < linha.length; i++) {
    const c = linha[i];
    if (c === '"') dentro = !dentro;
    else if (c === ',' && !dentro) return linha.slice(i + 1).trim();
  }
  return '';
}

function tirarTags(nome: string): [string, string | null] {
  let qualidade: string | null = null;
  for (;;) {
    const m = /\s*[(\[]([^)\]]*)[)\]]\s*$/.exec(nome);
    if (!m || !TAG_RUIM.test(m[1])) break;
    const r = RES.exec(m[1]);
    if (r && qualidade === null) qualidade = r[1].toLowerCase();
    nome = nome.slice(0, m.index);
  }
  return [nome.trim(), qualidade];
}

const HTTP = /^https?:\/\//i;

interface Pend {
  exibido: string;
  tvgName: string | null;
  tvgId: string | null;
  logo: string | null;
  grupo: string | null;
  /** tvg-type / type / media-type: o tipo que a lista declara. */
  declarado: string | null;
}

/** Um filme ou episódio da lista (docs/listas-m3u.md): vai para o acervo da lista. */
export interface ItemVod { tipo: Tipo; nome: string; grupo: string; url: string; logo: string | null }

export function lerM3U(textoEntrada: string): CanalM3U[] {
  try {
    return lerTudo(textoEntrada).canais;
  } catch {
    return [];
  }
}

/** Os canais e, à parte, os filmes e episódios da lista. */
export function lerTudo(textoEntrada: string): { canais: CanalM3U[]; vod: ItemVod[] } {
  const vod: ItemVod[] = [];
  const passos = ler(textoEntrada, vod);
  let r = passos.next();
  while (!r.done) r = passos.next();
  return { canais: r.value, vod };
}

/**
 * Igual a [lerTudo], mas cede a vez à tela a cada 4 mil linhas: uma lista de
 * 300 mil itens travava o app por vários segundos.
 */
export async function lerTudoSemTravar(textoEntrada: string): Promise<{ canais: CanalM3U[]; vod: ItemVod[] }> {
  const vod: ItemVod[] = [];
  const passos = ler(textoEntrada, vod);
  let r = passos.next();
  while (!r.done) {
    await new Promise<void>((ok) => setTimeout(ok, 0));
    r = passos.next();
  }
  return { canais: r.value, vod };
}

/**
 * O leitor linha a linha: [linha] para cada linha da lista, [fim] devolve os
 * canais (os filmes e episódios vão para `vod`). Assim a lista pode vir em
 * pedaços de um arquivo, sem caber inteira na memória.
 */
export function criarLeitor(vod: { push: (item: ItemVod) => void }): { linha: (bruta: string) => void; fim: () => CanalM3U[] } {
  const canais: CanalM3U[] = [];
  const indice = new Map<string, CanalM3U>();
  let pend: Pend | null = null;
  let opts: Record<string, string> = {};
  let primeira = true;
  const linha = (entrada: string) => {
    let bruta = entrada;
    if (primeira) { bruta = bruta.replace(/^\ufeff+/, ''); primeira = false; }
    const linha = bruta.trim();
    if (!linha) return;
    if (linha.toUpperCase().startsWith('#EXTM3U')) return;
    if (linha.startsWith('#EXTINF')) {
      pend = {
        exibido: nomeExibido(linha),
        tvgName: atributo(linha, 'tvg-name'),
        tvgId: atributo(linha, 'tvg-id'),
        logo: atributo(linha, 'tvg-logo'),
        grupo: atributo(linha, 'group-title'),
        declarado: atributo(linha, 'tvg-type') || atributo(linha, 'type') || atributo(linha, 'media-type'),
      };
      opts = {};
      return;
    }
    if (linha.startsWith('#EXTGRP:')) { opts.extgrp = linha.slice(8).trim(); return; }
    if (linha.startsWith('#EXTVLCOPT:')) {
      const kv = linha.slice(11);
      const i = kv.indexOf('=');
      if (i >= 0) {
        const k = kv.slice(0, i).trim().toLowerCase();
        const v = kv.slice(i + 1).trim();
        if (k === 'http-referrer' || k === 'http-referer') opts.referer = v;
        else if (k === 'http-user-agent') opts.ua = v;
      }
      return;
    }
    if (linha.startsWith('#KODIPROP:')) {
      const kv = linha.slice(10);
      const i = kv.indexOf('=');
      if (i >= 0) {
        const k = kv.slice(0, i).trim().toLowerCase();
        const v = kv.slice(i + 1).trim();
        if (k === 'inputstream.adaptive.license_type') opts.licTipo = v.toLowerCase();
        else if (k === 'inputstream.adaptive.license_key') opts.licChave = v;
      }
      return;
    }
    if (linha.startsWith('#')) return;

    // Linha de endereço.
    let url = linha;
    const extra: Record<string, string> = {};
    const barra = linha.indexOf('|');
    if (barra >= 0) {
      const antes = linha.slice(0, barra);
      const depois = linha.slice(barra + 1);
      if (depois.includes('=')) {
        url = antes.trim();
        for (const par of depois.split('&')) {
          const j = par.indexOf('=');
          if (j >= 0) extra[par.slice(0, j).trim().toLowerCase()] = par.slice(j + 1).trim();
        }
      }
    }
    if (!HTTP.test(url)) { pend = null; opts = {}; return; }

    const p: Pend = pend ?? { exibido: '', tvgName: null, tvgId: null, logo: null, grupo: null, declarado: null };
    const bruto = p.exibido || p.tvgName || p.tvgId || '';
    let grupo: string | null = p.grupo || opts.extgrp || null;
    if (grupo && grupo.includes(';')) grupo = grupo.split(';')[0].trim();
    grupo = grupo || null;
    const logo = p.logo && HTTP.test(p.logo) ? p.logo : null;
    const t = tipo(url, bruto, grupo ?? '', p.declarado ?? '');
    if (t.tipo !== 'canal') {
      // Filme ou episódio: vai para o acervo da lista (adulto não entra).
      if (!ehRestrito(bruto, grupo)) vod.push({ tipo: t, nome: bruto, grupo: grupo ?? '', url, logo });
      pend = null;
      opts = {};
      return;
    }
    let [nome, qual] = bruto ? tirarTags(bruto) : ['', null];
    if (!nome) nome = `Canal ${canais.length + 1}`;
    const fonte: FonteM3U = {
      url,
      referer: opts.referer || extra.referer || null,
      ua: opts.ua || extra['user-agent'] || null,
      keyId: null,
      key: null,
      qualidade: qual,
    };
    if ((opts.licTipo ?? '').includes('clearkey') && /^[0-9a-fA-F]{32}:[0-9a-fA-F]{32}$/.test(opts.licChave ?? '')) {
      const [kid, k] = opts.licChave.toLowerCase().split(':');
      fonte.keyId = kid;
      fonte.key = k;
    }
    const k = chave(nome);
    const existente = indice.get(k);
    if (existente) {
      if (!existente.fontes.some(f => f.url === url)) existente.fontes.push(fonte);
      existente.grupo = existente.grupo || grupo;
      existente.logo = existente.logo || logo;
    } else if (canais.length < LIMITE_CANAIS) {
      const c: CanalM3U = { nome, grupo, logo, fontes: [fonte] };
      indice.set(k, c);
      canais.push(c);
    }
    pend = null;
    opts = {};
    };
  return { linha, fim: () => canais };
}

function* ler(textoEntrada: string, vod: ItemVod[]): Generator<void, CanalM3U[], void> {
  const leitor = criarLeitor(vod);
  let n = 0;
  for (const bruta of String(textoEntrada ?? '').split(/\r\n|\n|\r/)) {
    if (++n % 4000 === 0) yield;
    leitor.linha(bruta);
  }
  return leitor.fim();
}

/** A resposta parece uma lista .m3u? (começa com #EXTM3U ou tem algum #EXTINF) */
export function pareceM3U(texto: string): boolean {
  const t = texto.replace(/^﻿+/, '').trimStart();
  return /^#EXTM3U/i.test(t) || t.includes('#EXTINF');
}

const RESTRITO = /(?:^|[^a-z0-9])(?:adult|adulto|adultos|xxx|porn|porno|sexo|sex|erotic|erotico|hentai)(?![a-z0-9])|\+18|18\+/;

function simplificar(s: string): string {
  // Só ASCII (quase sempre): sem normalizar, que é caro no celular.
  // eslint-disable-next-line no-control-regex
  if (/^[\x00-\x7f]*$/.test(s)) return s.toLowerCase();
  return s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

/** Grupo ou nome de conteúdo adulto (o canal "Adult Swim" não conta). */
export function ehRestrito(nome: string, grupo: string | null): boolean {
  for (const t of [nome, grupo ?? '']) {
    const s = simplificar(t).replace(/adult\s+swim/g, ' ');
    if (RESTRITO.test(s)) return true;
  }
  return false;
}

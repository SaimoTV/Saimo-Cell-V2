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

function atributo(linha: string, nome: string): string | null {
  const m = new RegExp('(?:^|[\\s:])' + nome.replace(/[-]/g, '\\-') + '="([^"]*)"').exec(linha);
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
}

export function lerM3U(textoEntrada: string): CanalM3U[] {
  try {
    return ler(textoEntrada);
  } catch {
    return [];
  }
}

function ler(textoEntrada: string): CanalM3U[] {
  const texto = String(textoEntrada ?? '').replace(/^﻿+/, '');
  const canais: CanalM3U[] = [];
  const indice = new Map<string, CanalM3U>();
  let pend: Pend | null = null;
  let opts: Record<string, string> = {};

  for (const bruta of texto.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')) {
    const linha = bruta.trim();
    if (!linha) continue;
    if (linha.toUpperCase().startsWith('#EXTM3U')) continue;
    if (linha.startsWith('#EXTINF')) {
      pend = {
        exibido: nomeExibido(linha),
        tvgName: atributo(linha, 'tvg-name'),
        tvgId: atributo(linha, 'tvg-id'),
        logo: atributo(linha, 'tvg-logo'),
        grupo: atributo(linha, 'group-title'),
      };
      opts = {};
      continue;
    }
    if (linha.startsWith('#EXTGRP:')) { opts.extgrp = linha.slice(8).trim(); continue; }
    if (linha.startsWith('#EXTVLCOPT:')) {
      const kv = linha.slice(11);
      const i = kv.indexOf('=');
      if (i >= 0) {
        const k = kv.slice(0, i).trim().toLowerCase();
        const v = kv.slice(i + 1).trim();
        if (k === 'http-referrer' || k === 'http-referer') opts.referer = v;
        else if (k === 'http-user-agent') opts.ua = v;
      }
      continue;
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
      continue;
    }
    if (linha.startsWith('#')) continue;

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
    if (!HTTP.test(url)) { pend = null; opts = {}; continue; }

    const p: Pend = pend ?? { exibido: '', tvgName: null, tvgId: null, logo: null, grupo: null };
    const bruto = p.exibido || p.tvgName || p.tvgId || '';
    let [nome, qual] = bruto ? tirarTags(bruto) : ['', null];
    if (!nome) nome = `Canal ${canais.length + 1}`;
    let grupo: string | null = p.grupo || opts.extgrp || null;
    if (grupo && grupo.includes(';')) grupo = grupo.split(';')[0].trim();
    grupo = grupo || null;
    const logo = p.logo && HTTP.test(p.logo) ? p.logo : null;
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
  }
  return canais;
}

/** A resposta parece uma lista .m3u? (começa com #EXTM3U ou tem algum #EXTINF) */
export function pareceM3U(texto: string): boolean {
  const t = texto.replace(/^﻿+/, '').trimStart();
  return /^#EXTM3U/i.test(t) || t.includes('#EXTINF');
}

const RESTRITO = /(?:^|[^a-z0-9])(?:adult|adulto|adultos|xxx|porn|porno|sexo|sex|erotic|erotico|hentai)(?![a-z0-9])|\+18|18\+/;

function simplificar(s: string): string {
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

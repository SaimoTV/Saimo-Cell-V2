// O acervo de filmes e séries de uma lista M3U/Xtream, no formato Saimo
// (SaimoPlayer/docs/formato-saimo.md, item 5; regras em docs/listas-m3u.md).
// Montado ao adicionar ou atualizar a lista e guardado numa pasta só dela; o
// saimoSources lê essa pasta como lê o acervo publicado, sem `base:`.
// Sem dependência do React Native (o teste roda em Node).
import { dobrar, tituloDaSerie, tituloDoFilme } from './classificar';
import type { ItemVod } from './minhasListasLeitor';

export interface ResumoAcervo { filmes: number; series: number }

/** A letra do título (item 5.1): primeira letra sem acento, em maiúscula; o resto vai em `#`. */
export function letraDoTitulo(titulo: string): string {
  const c = dobrar(titulo).trimStart()[0] ?? '';
  return c >= 'a' && c <= 'z' ? c.toUpperCase() : '#';
}

/** Nome do arquivo no disco (`#` vira `hash`). */
export function noDisco(nome: string): string {
  return nome.replace(/%23/g, 'hash').replace(/#/g, 'hash');
}

const chave = (t: string) => dobrar(t).replace(/[^a-z0-9]/g, '');
const campo = (t: string) => t.replace(/[\t\n\r]/g, ' ').trim();
const fonte = (u: string) => u.replace(/,/g, '%2C').replace(/[\t\n\r]/g, '');
const genero = (g: string) => campo(g.replace(/^[^\p{L}\p{N}]+/u, '')).replace(/,/g, ' ');

interface Titulo {
  titulo: string; ano: string; capa: string | null; generos: string[];
  versoes: Map<string, string[]>; episodios: Map<string, string[]>;
}

function completar(t: Titulo, item: ItemVod) {
  if (!t.capa && item.logo) t.capa = item.logo;
  const g = genero(item.grupo);
  if (g && !t.generos.includes(g)) t.generos.push(g);
}

/** Os arquivos do acervo (nome -> texto). Sem itens, nenhum arquivo. */
export function montarAcervo(itens: ItemVod[]): { arquivos: Map<string, string>; resumo: ResumoAcervo } {
  const m = new MontadorDeAcervo();
  for (const item of itens) m.push(item);
  return m.montar();
}

/**
 * Junta os filmes e episódios conforme a lista é lida (`push`, o mesmo nome do
 * array, para o leitor não saber a diferença): a lista de 300 mil itens não
 * fica inteira na memória, só os títulos.
 */
export class MontadorDeAcervo {
  private filmes = new Map<string, Titulo>();
  private series = new Map<string, Titulo>();
  private n = 0;
  get length(): number { return this.n; }

  push(item: ItemVod): void {
    this.n++;
    adicionar(this.filmes, this.series, item);
  }

  montar(): { arquivos: Map<string, string>; resumo: ResumoAcervo } {
    return gerar(this.filmes, this.series);
  }
}

function adicionar(filmes: Map<string, Titulo>, series: Map<string, Titulo>, item: ItemVod): void {
  {
    if (item.tipo.tipo === 'filme') {
      const t = tituloDoFilme(item.nome, item.grupo);
      const titulo = campo(t.titulo);
      if (!titulo) return;
      const k = chave(titulo);
      let f = filmes.get(k);
      if (!f) { f = { titulo, ano: t.ano, capa: null, generos: [], versoes: new Map(), episodios: new Map() }; filmes.set(k, f); }
      completar(f, item);
      const urls = f.versoes.get(t.versao) ?? [];
      const u = fonte(item.url);
      if (!urls.includes(u)) urls.push(u);
      f.versoes.set(t.versao, urls);
    } else if (item.tipo.tipo === 'episodio') {
      const m = item.tipo.marca;
      const t = tituloDaSerie(item.nome, m.inicio, item.grupo);
      const titulo = campo(t.titulo);
      const k = `${chave(titulo)}|${t.ano}`;
      let s = series.get(k);
      if (!s) { s = { titulo, ano: t.ano, capa: null, generos: [], versoes: new Map(), episodios: new Map() }; series.set(k, s); }
      completar(s, item);
      const ek = `${m.temporada}|${m.episodio}|${t.versao}`;
      const urls = s.episodios.get(ek) ?? [];
      const u = fonte(item.url);
      if (!urls.includes(u)) urls.push(u);
      s.episodios.set(ek, urls);
    }
  }
}

function gerar(filmes: Map<string, Titulo>, series: Map<string, Titulo>): { arquivos: Map<string, string>; resumo: ResumoAcervo } {
  const arquivos = new Map<string, string>();
  if (!filmes.size && !series.size) return { arquivos, resumo: { filmes: 0, series: 0 } };

  const chaves = new Map<Titulo, string>();
  const k = (t: Titulo) => { let c = chaves.get(t); if (c === undefined) { c = dobrar(t.titulo); chaves.set(t, c); } return c; };
  const ordem = (a: Titulo, b: Titulo) => (k(a) < k(b) ? -1 : k(a) > k(b) ? 1 : 0);
  const fs = [...filmes.values()].sort(ordem);
  const ss = [...series.values()].sort(ordem);
  const porLetra = new Map<string, { f: Titulo[]; s: Titulo[] }>();
  const da = (l: string) => { let x = porLetra.get(l); if (!x) { x = { f: [], s: [] }; porLetra.set(l, x); } return x; };
  for (const f of fs) da(letraDoTitulo(f.titulo)).f.push(f);
  for (const s of ss) da(letraDoTitulo(s.titulo)).s.push(s);

  let indice = '';
  const busca: string[] = [];
  const letras = [...porLetra.keys()].sort((a, b) => (a === '#' ? -1 : b === '#' ? 1 : a < b ? -1 : 1));
  for (const l of letras) {
    const { f: lf, s: ls } = porLetra.get(l)!;
    indice += `${l}\t${lf.length}\t${ls.length}\t0\n`;
    if (lf.length) {
      const linhas: string[] = [];
      for (const f of lf) {
        let linha = f.titulo;
        for (const [v, urls] of f.versoes) linha += `\t${v}=${urls.join(',')}`;
        linhas.push(linha);
        busca.push(`${f.titulo}\tf\t${l}\t${f.ano}`);
      }
      arquivos.set(`filmes-${l}.txt`, linhas.join('\n') + '\n');
    }
    if (ls.length) {
      const lista: string[] = [];
      let atual = '';
      let pedaco = 0;
      for (const s of ls) {
        const eps = [...s.episodios.entries()].map(([k, urls]) => {
          const [t, e, v] = k.split('|');
          return { t: Number(t), e: Number(e), v, urls };
        }).sort((a, b) => a.t - b.t || a.e - b.e || (a.v === 'dub' ? 0 : 1) - (b.v === 'dub' ? 0 : 1));
        let bloco = `@${s.titulo}\t${s.ano}\n`;
        for (const ep of eps) bloco += `${ep.t}\t${ep.e}\t${ep.v}\t${ep.urls.join(',')}\n`;
        if (atual && atual.length + bloco.length > 100 * 1024) {
          arquivos.set(`series-${l}-${pedaco}.txt`, atual);
          atual = '';
          pedaco++;
        }
        atual += bloco;
        lista.push(`${s.titulo}\t${s.ano}\t${pedaco}\t${s.episodios.size}`);
        busca.push(`${s.titulo}\ts\t${l}\t${s.ano}`);
      }
      if (atual) arquivos.set(`series-${l}-${pedaco}.txt`, atual);
      arquivos.set(`series-${l}.txt`, lista.join('\n') + '\n');
    }
  }
  arquivos.set('indice.txt', indice);
  arquivos.set('busca.txt', busca.join('\n') + '\n');
  // Capas e gêneros. Imagem usada por mais de 3 títulos é a genérica do
  // provedor: melhor sem capa que com a errada.
  const usos = new Map<string, number>();
  for (const t of [...fs, ...ss]) if (t.capa) usos.set(t.capa, (usos.get(t.capa) ?? 0) + 1);
  const fichas = ['capa: '];
  for (const [tipo, lista] of [['f', fs], ['s', ss]] as const) {
    for (const t of lista) {
      const capa = t.capa && (usos.get(t.capa) ?? 0) <= 3 ? fonte(t.capa) : '';
      if (!capa && !t.generos.length) continue;
      fichas.push(`${tipo}\t${t.titulo}\t0\t${capa}\t${t.generos.join(',')}`);
    }
  }
  arquivos.set('fichas.txt', fichas.join('\n') + '\n');
  return { arquivos, resumo: { filmes: fs.length, series: ss.length } };
}

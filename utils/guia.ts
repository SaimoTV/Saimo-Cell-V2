/**
 * `guia.txt`, servido pelo endereço da lista de canais: as tabelas do guia de
 * programação que antes viviam no código. Linhas com TAB; `#` comenta.
 *
 *   meuguia   <nome do canal no catálogo>  <código no meuguia.tv>
 *   guiadetv  <nome normalizado>           <página (slug) ou endereço no guiadetv.com>
 *   alias     <nome normalizado>           <nome do canal no feed XMLTV>
 *   feed      -                            <endereço de um feed XMLTV> (vale a ordem)
 *   pluto     -                            <endereço do guia da Pluto TV>
 */

export interface TabelasDoGuia {
  meuguia: Map<string, string>;
  guiadetv: Map<string, string>;
  alias: Map<string, string>;
  feeds: string[];
  pluto: string;
}

/** Mesma normalização que o serviço de guia aplica ao nome dos canais. */
export function normalizarNomeDoGuia(s: string): string {
  return s
    .replace(/^BR\s*-\s*/i, '').replace(/^BR\s+/i, '').replace(/^[A-Z]{2}\s*-\s*/, '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export function tabelasVazias(): TabelasDoGuia {
  return { meuguia: new Map(), guiadetv: new Map(), alias: new Map(), feeds: [], pluto: '' };
}

export function parseGuia(texto: string): TabelasDoGuia {
  const t = tabelasVazias();
  for (const bruta of (texto ?? '').split(/\r?\n/)) {
    const linha = bruta.replace(/\r$/, '');
    if (!linha.trim() || linha.trimStart().startsWith('#')) continue;
    const campos = linha.split('\t');
    if (campos.length < 3) continue;
    const tipo = campos[0].trim().toLowerCase();
    const chave = campos[1].trim();
    const valor = campos[2].trim();
    if (!valor) continue;
    switch (tipo) {
      case 'meuguia': if (chave) t.meuguia.set(chave, valor); break;
      case 'guiadetv': if (chave) t.guiadetv.set(normalizarNomeDoGuia(chave), valor); break;
      case 'alias': if (chave) t.alias.set(normalizarNomeDoGuia(chave), valor); break;
      case 'feed': if (/^https?:\/\//i.test(valor) && !t.feeds.includes(valor)) t.feeds.push(valor); break;
      case 'pluto': if (/^https?:\/\//i.test(valor) && !t.pluto) t.pluto = valor; break;
    }
  }
  return t;
}

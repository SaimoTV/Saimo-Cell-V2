// Ler uma lista grande sem tê-la inteira na memória: baixa direto para um
// arquivo (o texto inteiro de uma lista de 77 MB virava 154 MB de uma vez no
// lado nativo e o Android matava o app) e lê em pedaços de 1 MB, linha a linha.
import { Directory, File as FSFile, Paths } from 'expo-file-system';

const PEDACO = 1 << 20;

/** Baixa para um arquivo temporário (apagar com `apagar` depois de ler). */
export async function baixarParaArquivo(link: string, cabecalhos: Record<string, string>): Promise<FSFile> {
  const pasta = new Directory(Paths.cache, 'listas-baixando');
  if (!pasta.exists) pasta.create({ intermediates: true, idempotent: true });
  const destino = new FSFile(pasta, `l${Date.now().toString(36)}.m3u`);
  return FSFile.downloadFileAsync(link, destino, { headers: cabecalhos, idempotent: true });
}

export function apagar(arquivo: FSFile): void {
  try { if (arquivo.exists) arquivo.delete(); } catch { /* temporário */ }
}

/**
 * UTF-8 para texto, aos pedaços: os bytes de uma letra que ficam partidos no
 * fim de um pedaço voltam para o começo do seguinte. Byte inválido vira "�".
 */
function decodificador() {
  let resto = new Uint8Array(0);
  return (bytes: Uint8Array, ultimo: boolean): string => {
    let b = bytes;
    if (resto.length) { const j = new Uint8Array(resto.length + bytes.length); j.set(resto); j.set(bytes, resto.length); b = j; }
    let fim = b.length;
    if (!ultimo) {
      // Recua até o começo da última letra, se ela estiver incompleta.
      let k = fim - 1, n = 0;
      while (k >= 0 && n < 3 && (b[k] & 0xc0) === 0x80) { k--; n++; }
      if (k >= 0) {
        const c = b[k];
        const tam = c >= 0xf0 ? 4 : c >= 0xe0 ? 3 : c >= 0xc0 ? 2 : 1;
        if (k + tam > fim) fim = k;
      }
    }
    resto = b.slice(fim);
    const pedacos: string[] = [];
    const unidades: number[] = [];
    for (let i = 0; i < fim;) {
      const c = b[i];
      let cp: number;
      if (c < 0x80) {
        // Trecho só ASCII (quase tudo numa lista): de uma vez, sem byte a byte.
        let j = i + 1;
        while (j < fim && j - i < 4096 && b[j] < 0x80) j++;
        if (unidades.length) { pedacos.push(String.fromCharCode.apply(null, unidades as any)); unidades.length = 0; }
        pedacos.push(String.fromCharCode.apply(null, b.subarray(i, j) as any));
        i = j;
        continue;
      }
      else if (c >= 0xc0 && c < 0xe0 && i + 1 < fim) { cp = ((c & 0x1f) << 6) | (b[i + 1] & 0x3f); i += 2; }
      else if (c >= 0xe0 && c < 0xf0 && i + 2 < fim) { cp = ((c & 0x0f) << 12) | ((b[i + 1] & 0x3f) << 6) | (b[i + 2] & 0x3f); i += 3; }
      else if (c >= 0xf0 && i + 3 < fim) {
        cp = ((c & 0x07) << 18) | ((b[i + 1] & 0x3f) << 12) | ((b[i + 2] & 0x3f) << 6) | (b[i + 3] & 0x3f); i += 4;
      } else { cp = 0xfffd; i++; }
      if (cp > 0xffff) { cp -= 0x10000; unidades.push(0xd800 + (cp >> 10), 0xdc00 + (cp & 0x3ff)); }
      else unidades.push(cp);
      if (unidades.length >= 8192) { pedacos.push(String.fromCharCode.apply(null, unidades as any)); unidades.length = 0; }
    }
    if (unidades.length) pedacos.push(String.fromCharCode.apply(null, unidades as any));
    return pedacos.join('');
  };
}

/**
 * Lê o arquivo linha a linha: `aoLer(linha)` para cada uma, cedendo a vez à
 * tela entre um pedaço e outro. `inicio` recebe os primeiros 64 KB (para
 * conferir se é uma lista) e pode lançar.
 */
export async function lerLinhas(arquivo: FSFile, aoLer: (linha: string) => void, inicio?: (texto: string) => void): Promise<void> {
  const h = arquivo.open();
  try {
    const decodificar = decodificador();
    let sobra = '';
    let primeiro = true;
    for (;;) {
      const bytes = h.readBytes(PEDACO);
      const ultimo = bytes.length < PEDACO;
      const texto = sobra + decodificar(bytes, ultimo);
      if (primeiro) { inicio?.(texto.slice(0, 65536)); primeiro = false; }
      const linhas = texto.split(/\r\n|\n|\r/);
      sobra = ultimo ? '' : linhas.pop() ?? '';
      for (const l of linhas) aoLer(l);
      if (ultimo) break;
      await new Promise<void>((ok) => setTimeout(ok, 0));
    }
    if (sobra) aoLer(sobra);
  } finally {
    h.close();
  }
}

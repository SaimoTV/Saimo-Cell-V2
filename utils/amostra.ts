/**
 * Quem entra na amostra da telemetria — a mesma conta do monitor
 * (`amostrado` no worker.js): FNV-1a de 32 bits sobre os bytes UTF-8 do id em
 * minúsculas; entra quando `hash % 10000 < pct * 100`. Sorteio estável: o
 * mesmo aparelho fica sempre dentro ou sempre fora.
 */

export const PADRAO_PCT = 5;

export function pctValido(pct: unknown): pct is number {
  return typeof pct === 'number' && Number.isFinite(pct) && pct > 0 && pct <= 100;
}

/** Bytes UTF-8 sem depender de TextEncoder (nem todo motor JS do RN tem). */
function utf8(texto: string): number[] {
  const bytes: number[] = [];
  for (const ch of texto) {
    const c = ch.codePointAt(0)!;
    if (c < 0x80) bytes.push(c);
    else if (c < 0x800) bytes.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
    else if (c < 0x10000) bytes.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
    else bytes.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 0x3f), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
  }
  return bytes;
}

export function fnv1a(texto: string): number {
  let h = 0x811c9dc5;
  for (const b of utf8(texto.toLowerCase())) {
    h ^= b;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

export function naAmostra(id: string, pct: number): boolean {
  const p = pctValido(pct) ? pct : PADRAO_PCT;
  return fnv1a(id) % 10000 < p * 100;
}

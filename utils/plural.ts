/** "1 canal", "2 canais": o número com a palavra no singular ou no plural. */
export function plural(n: number, singular: string, pluralForma: string): string {
  return `${n} ${n === 1 ? singular : pluralForma}`;
}

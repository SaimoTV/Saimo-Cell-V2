/**
 * Os dois endereços de fábrica (UM só lugar). Valem enquanto a pessoa não
 * escolher outro em Ajustes > Listas; salvar vazio desliga a lista; "Restaurar
 * padrão" volta a estes.
 */
export const LINK_CANAIS_PADRAO = 'https://canais-saimo.pages.dev/';
export const LINK_FILMES_PADRAO = 'https://filmes-saimo.pages.dev/';

/**
 * Normalização do endereço de uma lista (contrato "app sem listas").
 *
 * Devolve:
 *  - ''   : campo vazio, ou seja, sem endereço;
 *  - null : endereço inválido;
 *  - o endereço-base normalizado, sempre terminado em "/".
 *
 * Regras, na ordem: trim; sem "://" prefixa https://; só http e https (outro
 * esquema, espaço no meio ou host vazio é inválido); tira ?query e #fragmento;
 * se o último trecho do caminho tem ponto (a pessoa colou o arquivo, não a
 * pasta) ele sai; garante "/" no fim.
 */
export function normalizarLink(entrada: string | null | undefined): string | null {
  const texto = (entrada ?? '').trim();
  if (!texto) return '';
  if (/\s/.test(texto)) return null;

  const comEsquema = texto.includes('://') ? texto : `https://${texto}`;
  const m = /^([A-Za-z][A-Za-z0-9+.-]*):\/\/(.*)$/.exec(comEsquema);
  if (!m) return null;
  const esquema = m[1].toLowerCase();
  if (esquema !== 'http' && esquema !== 'https') return null;

  const semExtras = m[2].split(/[?#]/)[0];
  const barra = semExtras.indexOf('/');
  const host = barra < 0 ? semExtras : semExtras.slice(0, barra);
  let caminho = barra < 0 ? '' : semExtras.slice(barra);

  // Host vazio ("https:///x") ou só usuário/porta ("https://:80").
  const nomeDoHost = host.slice(host.lastIndexOf('@') + 1).replace(/:\d*$/, '');
  if (!nomeDoHost) return null;

  const ultimaBarra = caminho.lastIndexOf('/');
  const ultimo = caminho.slice(ultimaBarra + 1);
  if (ultimo.includes('.')) caminho = caminho.slice(0, ultimaBarra + 1);
  if (!caminho.endsWith('/')) caminho += '/';

  return `${esquema}://${host}${caminho}`;
}

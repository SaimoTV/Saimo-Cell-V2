// Atualização do app: lê o versao.json do endereço fixo abaixo e valida o link
// de download, que vem do próprio arquivo.

/** O endereço de atualização: um só, fixo (não é uma lista, é infraestrutura). */
export const URL_VERSAO = 'https://canais-saimo.pages.dev/versao.json';

export interface ArquivoAtualizacao {
  nome: string;
  url: string;
  bytes: number;
  sha256: string;
}

export interface Atualizacao {
  version: string;
  url: string;
  notas: string;
  bytes: number;
  sha256: string;
}

const VERSAO = /^v?(\d+\.\d+(?:\.\d+)?)$/i;
const HOSTS_REDIRECT = new Set(['objects.githubusercontent.com', 'release-assets.githubusercontent.com']);

/** https + github.com/<dono>/<repo>/releases/download/... (ou os hosts de redirecionamento do GitHub). */
export function urlDeDownloadPermitida(valor: unknown): boolean {
  if (typeof valor !== 'string') return false;
  let u: URL;
  try {
    u = new URL(valor);
  } catch {
    return false;
  }
  if (u.protocol !== 'https:' || u.username || u.password || u.port) return false;
  if (HOSTS_REDIRECT.has(u.hostname)) return true;
  return u.hostname === 'github.com' && /^\/[^/]+\/[^/]+\/releases\/download\/[^/]+\/[^/]+/.test(u.pathname);
}

/** Interpreta o versao.json; qualquer coisa fora do formato vira null ("sem atualização"). */
export function interpretarVersao(json: any): Atualizacao | null {
  try {
    const version = VERSAO.exec(String(json?.versao ?? json?.tag ?? ''))?.[1] ?? '';
    const arq = json?.arquivos?.celular;
    if (!version || !arq || !urlDeDownloadPermitida(arq.url)) return null;
    const sha = String(arq.sha256 ?? '').trim().toLowerCase();
    return {
      version,
      url: String(arq.url),
      notas: textoDasNotas(String(json?.notas ?? '')),
      bytes: Number(arq.bytes) > 0 ? Number(arq.bytes) : 0,
      sha256: /^[0-9a-f]{64}$/.test(sha) ? sha : '',
    };
  } catch {
    return null;
  }
}

export function textoDasNotas(md: string): string {
  return md
    .replace(/\r/g, '')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^\s*[-*]\s+/gm, '• ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export async function ultimaAtualizacao(): Promise<Atualizacao | null> {
  try {
    const response = await fetch(URL_VERSAO, { cache: 'no-store' });
    if (!response.ok) return null;
    return interpretarVersao(await response.json());
  } catch {
    return null;
  }
}

/** Resultado de uma checagem pedida pelo botão de Ajustes. */
export type ResultadoChecagem = 'nova' | 'atual' | 'erro';

// O Updater (montado no layout) registra aqui como checar; Ajustes só pede.
let verificador: (() => Promise<ResultadoChecagem>) | null = null;

export function registrarVerificador(v: (() => Promise<ResultadoChecagem>) | null): void {
  verificador = v;
}

/** Checa agora; com versão nova, o aviso do Updater já abre sozinho. */
export async function verificarAtualizacaoAgora(): Promise<ResultadoChecagem> {
  return verificador ? verificador() : 'erro';
}

import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';

/**
 * Tocador de torrent embutido (Android, versão do GitHub). Na Play e no iPhone o
 * módulo não existe: `disponivel()` responde false e o app pede Debrid.
 */
interface ModuloNativo {
  disponivel(): boolean;
  endereco(infoHash: string, fileIdx: number | null, rastreadores: string[], titulo: string | null): Promise<string>;
  limpar(): void;
}

const nativo = Platform.OS === 'android' ? requireOptionalNativeModule<ModuloNativo>('SaimoTorrent') : null;

export function torrentEmbutidoDisponivel(): boolean {
  try {
    return !!nativo && nativo.disponivel();
  } catch {
    return false;
  }
}

export async function enderecoDoTorrent(
  infoHash: string,
  fileIdx?: number | null,
  rastreadores: string[] = [],
  titulo?: string | null,
): Promise<string> {
  if (!nativo) throw new Error('Tocador de torrent indisponível.');
  return nativo.endereco(infoHash, fileIdx ?? null, rastreadores, titulo ?? null);
}

export function limparTorrent(): void {
  try {
    nativo?.limpar();
  } catch {
    // nada a limpar
  }
}

export function ehEnderecoDoTorrent(url?: string | null): boolean {
  return !!url && url.startsWith('http://127.0.0.1:') && url.includes('/tocar?m=');
}

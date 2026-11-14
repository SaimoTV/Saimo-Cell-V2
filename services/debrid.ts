import AsyncStorage from '@react-native-async-storage/async-storage';
import type { DebridConfig, DebridProviderId } from '../types';
import {
  criarConfigDebridPadrao,
  normalizarConfigDebrid,
  obterProvedoresDebridAtivos,
  resolverTorrentViaDebrid,
  type DebridResolveParams,
  type DebridResolveResult,
} from './debridCore';

export * from './debridCore';

export const CHAVE_STORAGE_DEBRID = 'saimo_debrid_v1';

let configAtual: DebridConfig = criarConfigDebridPadrao();
let carregadoPromise: Promise<DebridConfig> | null = null;
const ouvintes = new Set<() => void>();

function emitir(): void {
  ouvintes.forEach((fn) => {
    try {
      fn();
    } catch {
      // ignora erro de ouvinte isolado
    }
  });
}

async function persistir(): Promise<void> {
  try {
    await AsyncStorage.setItem(CHAVE_STORAGE_DEBRID, JSON.stringify(configAtual));
  } catch {
    // mantém em memória mesmo se falhar gravação
  }
  emitir();
}

export function aoMudarDebrid(fn: () => void): () => void {
  ouvintes.add(fn);
  return () => {
    ouvintes.delete(fn);
  };
}

export function getDebridConfig(): DebridConfig {
  return configAtual;
}

export function temDebridAtivo(): boolean {
  return obterProvedoresDebridAtivos(configAtual).length > 0;
}

export async function carregarDebridConfig(): Promise<DebridConfig> {
  if (!carregadoPromise) {
    carregadoPromise = (async () => {
      try {
        const bruto = await AsyncStorage.getItem(CHAVE_STORAGE_DEBRID);
        if (bruto) {
          configAtual = normalizarConfigDebrid(JSON.parse(bruto));
        }
      } catch {
        configAtual = criarConfigDebridPadrao();
      }
      emitir();
      return configAtual;
    })();
  }
  return carregadoPromise;
}

export async function salvarProvedorDebrid(
  provider: DebridProviderId,
  apiKey: string,
  enabled?: boolean,
): Promise<DebridConfig> {
  await carregarDebridConfig();
  const chaveLimpa = apiKey.trim();
  const ativo = typeof enabled === 'boolean'
    ? enabled && chaveLimpa.length > 0
    : chaveLimpa.length > 0;

  configAtual = {
    ...configAtual,
    providers: {
      ...configAtual.providers,
      [provider]: {
        apiKey: chaveLimpa,
        enabled: ativo,
      },
    },
  };
  await persistir();
  return configAtual;
}

export async function setSincronizarDebridConnect(valor: boolean): Promise<DebridConfig> {
  await carregarDebridConfig();
  configAtual = {
    ...configAtual,
    sincronizarConnect: Boolean(valor),
  };
  await persistir();
  return configAtual;
}

export async function aplicarDebridRemoto(raw: unknown): Promise<boolean> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return false;
  await carregarDebridConfig();
  const norm = normalizarConfigDebrid(raw);
  // Preserva flag local se o dispositivo receptor já tinha sincronização ativa ou segue payload recebido
  configAtual = norm;
  await persistir();
  return true;
}

export function exportarDebridParaSync(): DebridConfig | undefined {
  if (!configAtual.sincronizarConnect) return undefined;
  return configAtual;
}

export async function resolverTorrentDebrid(
  params: DebridResolveParams,
): Promise<DebridResolveResult> {
  await carregarDebridConfig();
  return resolverTorrentViaDebrid(configAtual, params);
}

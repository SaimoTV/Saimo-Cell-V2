/**
 * O que o celular sincroniza com cada TV pelo Saimo Connect. Na primeira
 * conexão com uma TV o app pergunta (favoritos, listas, addons, histórico);
 * a resposta fica guardada por TV e dá para mudar depois no Connect.
 * Sem resposta, ou recusada, nada vai para a TV e nada da TV é aplicado.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface EscolhaSincronia {
  favoritos: boolean;
  listas: boolean;
  addons: boolean;
  historico: boolean;
}

export const TUDO: EscolhaSincronia = { favoritos: true, listas: true, addons: true, historico: true };
export const NADA: EscolhaSincronia = { favoritos: false, listas: false, addons: false, historico: false };

const CHAVE = '@saimo_connect_sincronia';
let cache: Record<string, EscolhaSincronia> | null = null;

async function carregar(): Promise<Record<string, EscolhaSincronia>> {
  if (cache) return cache;
  try {
    const bruto = await AsyncStorage.getItem(CHAVE);
    cache = bruto ? JSON.parse(bruto) : {};
  } catch {
    cache = {};
  }
  return cache!;
}

/** `null` = ainda não perguntou para esta TV. */
export async function escolhaDaTv(tvId: string): Promise<EscolhaSincronia | null> {
  const todas = await carregar();
  return todas[tvId] ?? null;
}

export async function guardarEscolha(tvId: string, escolha: EscolhaSincronia): Promise<void> {
  const todas = await carregar();
  todas[tvId] = escolha;
  try {
    await AsyncStorage.setItem(CHAVE, JSON.stringify(todas));
  } catch { /* fica valendo nesta sessão */ }
}

export function algumaLigada(e: EscolhaSincronia | null | undefined): boolean {
  return !!e && (e.favoritos || e.listas || e.addons || e.historico);
}

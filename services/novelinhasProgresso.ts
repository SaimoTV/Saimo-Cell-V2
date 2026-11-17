import AsyncStorage from '@react-native-async-storage/async-storage';

/** Onde a pessoa parou em cada novelinha: episódio e segundo. */
export interface ParadaNovelinha { ep: number; t: number; quando: number }

const CHAVE = 'saimo-novelinhas-progresso';
let memoria: Record<string, ParadaNovelinha> | null = null;

async function ler(): Promise<Record<string, ParadaNovelinha>> {
  if (memoria) return memoria;
  try { memoria = JSON.parse((await AsyncStorage.getItem(CHAVE)) || '{}'); } catch { memoria = {}; }
  return memoria!;
}

export async function paradaNovelinha(id: string): Promise<ParadaNovelinha | null> {
  return (await ler())[id] || null;
}

export async function todasAsParadas(): Promise<Record<string, ParadaNovelinha>> {
  return { ...(await ler()) };
}

export async function guardarParadaNovelinha(id: string, ep: number, t: number): Promise<void> {
  const tudo = await ler();
  tudo[id] = { ep, t: Math.floor(t), quando: Date.now() };
  // Só as 60 mais recentes: é um "continue assistindo", não um histórico.
  const chaves = Object.keys(tudo).sort((a, b) => tudo[b].quando - tudo[a].quando);
  for (const k of chaves.slice(60)) delete tudo[k];
  AsyncStorage.setItem(CHAVE, JSON.stringify(tudo)).catch(() => {});
}

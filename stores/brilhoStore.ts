import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Brilho do app (0 a 100; 100 é o normal). Um véu preto por cima do app, não
 * o brilho do aparelho. Em 0 a tela fica toda preta e qualquer toque traz o
 * brilho de volta, devagar (components/VeuDeBrilho.tsx).
 */
interface BrilhoStore {
  brilho: number;
  definir: (valor: number) => void;
}

export const BRILHO_ESCURO = 5;

export const useBrilhoStore = create<BrilhoStore>()(
  persist(
    (set) => ({
      brilho: 100,
      definir: (valor) => set({ brilho: Math.max(0, Math.min(100, Math.round(valor))) }),
    }),
    { name: 'saimo-brilho', storage: createJSONStorage(() => AsyncStorage) },
  ),
);

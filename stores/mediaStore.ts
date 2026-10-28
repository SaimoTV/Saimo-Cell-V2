// Store de mídia (filmes/séries) com Zustand
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { MediaFilterType, MediaSortType, SeriesProgress } from '../types';

interface MediaFavorite {
    id: string;
    addedAt: number;
}

interface MediaState {
    // Favoritos
    favorites: MediaFavorite[];
    favoriteIds: Set<string>;
    addFavorite: (id: string) => void;
    removeFavorite: (id: string) => void;
    isFavorite: (id: string) => boolean;

    // Histórico de visualização (filmes e episódios)
    watchHistory: { id: string; watchedAt: number; progress?: number; duration?: number }[];
    addToHistory: (id: string, progress?: number, duration?: number) => void;
    getProgress: (id: string) => { progress?: number; duration?: number } | undefined;

    // Progresso de séries (Continuar de onde parou a série)
    seriesProgress: (SeriesProgress & { progress?: number; duration?: number })[];
    setSeriesProgress: (seriesId: string, season: number, episode: number, episodeId: string, progress?: number, duration?: number) => void;
    getSeriesProgress: (seriesId: string) => (SeriesProgress & { progress?: number; duration?: number }) | undefined;

    // Filtros ativos
    activeFilter: MediaFilterType;
    activeSort: MediaSortType;
    activeGenre: string | null;
    activeYear: string | null;
    setFilter: (filter: MediaFilterType) => void;
    setSort: (sort: MediaSortType) => void;
    setGenre: (genre: string | null) => void;
    setYear: (year: string | null) => void;
    clearFilters: () => void;
}

/**
 * O id como ele é, sem a codificação de URL. O mesmo título chega das rotas
 * às vezes codificado ("The%20Boys") e às vezes não, e cada forma virava um
 * registro próprio: o "Continue assistindo" duplicava ou perdia o episódio.
 */
function semCodificacao(id: string): string {
    if (!id.includes('%')) return id;
    try { return decodeURIComponent(id); } catch { return id; }
}

/** Uma entrada por id (já sem codificação), a de `watchedAt` mais novo. */
function maisRecentePor<T extends { watchedAt: number }>(itens: T[] | undefined, chaveDe: (t: T) => string, normalizar: (t: T) => T): T[] {
    const porId = new Map<string, T>();
    for (const bruto of itens ?? []) {
        const item = normalizar(bruto);
        const chave = chaveDe(item);
        const atual = porId.get(chave);
        if (!atual || item.watchedAt > atual.watchedAt) porId.set(chave, item);
    }
    return [...porId.values()].sort((a, b) => b.watchedAt - a.watchedAt);
}

export const useMediaStore = create<MediaState>()(
    persist(
        (set, get) => ({
            // Favoritos
            favorites: [],
            favoriteIds: new Set<string>(),

            addFavorite: (id: string) => {
                const { favorites } = get();
                if (!favorites.some(f => f.id === id)) {
                    const newFavorites = [...favorites, { id, addedAt: Date.now() }];
                    set({
                        favorites: newFavorites,
                        favoriteIds: new Set(newFavorites.map(f => f.id)),
                    });
                }
            },

            removeFavorite: (id: string) => {
                const newFavorites = get().favorites.filter(f => f.id !== id);
                set({
                    favorites: newFavorites,
                    favoriteIds: new Set(newFavorites.map(f => f.id)),
                });
            },

            isFavorite: (id: string) => {
                return get().favoriteIds.has(id);
            },

            // Histórico (filmes e episódios)
            watchHistory: [],

            addToHistory: (idBruto: string, progress?: number, duration?: number) => {
                const id = semCodificacao(idBruto);
                const { watchHistory } = get();
                const existing = watchHistory.findIndex(h => h.id === id);
                const entry = { id, watchedAt: Date.now(), progress, duration };

                if (existing >= 0) {
                    const updated = [...watchHistory];
                    updated[existing] = entry;
                    set({ watchHistory: updated });
                } else {
                    const updated = [entry, ...watchHistory].slice(0, 500);
                    set({ watchHistory: updated });
                }
            },

            getProgress: (idBruto: string) => {
                const id = semCodificacao(idBruto);
                const entry = get().watchHistory.find(h => h.id === id);
                if (!entry) return undefined;
                return { progress: entry.progress, duration: entry.duration };
            },

            // Progresso de séries
            seriesProgress: [],

            setSeriesProgress: (serieBruta: string, season: number, episode: number, episodeId: string, progress?: number, duration?: number) => {
                const seriesId = semCodificacao(serieBruta);
                const { seriesProgress } = get();
                const existing = seriesProgress.findIndex(p => p.seriesId === seriesId);
                const entry: SeriesProgress & { progress?: number; duration?: number } = { 
                    seriesId, season, episode, episodeId, watchedAt: Date.now(), progress, duration 
                };

                if (existing >= 0) {
                    const updated = [...seriesProgress];
                    updated[existing] = entry;
                    set({ seriesProgress: updated });
                } else {
                    set({ seriesProgress: [...seriesProgress, entry] });
                }
            },

            getSeriesProgress: (serieBruta: string) => {
                const seriesId = semCodificacao(serieBruta);
                return get().seriesProgress.find(p => p.seriesId === seriesId);
            },

            // Filtros
            activeFilter: 'all',
            activeSort: 'name',
            activeGenre: null,
            activeYear: null,

            setFilter: (filter) => set({ activeFilter: filter }),
            setSort: (sort) => set({ activeSort: sort }),
            setGenre: (genre) => set({ activeGenre: genre }),
            setYear: (year) => set({ activeYear: year }),

            clearFilters: () => set({
                activeFilter: 'all',
                activeSort: 'name',
                activeGenre: null,
                activeYear: null,
            }),
        }),
        {
            name: 'saimo-media-store',
            storage: createJSONStorage(() => AsyncStorage),
            partialize: (state) => ({
                favorites: state.favorites,
                watchHistory: state.watchHistory,
                seriesProgress: state.seriesProgress,
            }),
            // Restore Set from favorites array on hydration
            onRehydrateStorage: () => (state) => {
                if (state && state.favoriteIds?.size === 0) {
                    state.favoriteIds = new Set(state.favorites.map(f => f.id));
                }
                // Até a 2.1.4 a mesma série podia ficar gravada duas vezes,
                // com o nome codificado para URL ("The%20Boys") e sem; junta
                // as duas ficando com a mais recente.
                if (state) {
                    state.seriesProgress = maisRecentePor(state.seriesProgress, p => p.seriesId,
                        p => ({ ...p, seriesId: semCodificacao(p.seriesId) }));
                    state.watchHistory = maisRecentePor(state.watchHistory, h => h.id,
                        h => ({ ...h, id: semCodificacao(h.id) }));
                }
            },
        }
    )
);

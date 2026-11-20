import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { armazenamentoDoPerfil } from '../services/perfis';
import { anotarCanal } from '../services/remocoes';

interface FavoritesStore {
    favorites: string[];
    favoriteIds: Set<string>;
    addFavorite: (channelId: string) => void;
    removeFavorite: (channelId: string) => void;
    toggleFavorite: (channelId: string) => void;
    isFavorite: (channelId: string) => boolean;
    clearFavorites: () => void;
}

export const useFavoritesStore = create<FavoritesStore>()(
    persist(
        (set, get) => ({
            favorites: [],
            favoriteIds: new Set<string>(),

            addFavorite: (channelId: string) => {
                const { favorites } = get();
                if (!favorites.includes(channelId)) {
                    anotarCanal(channelId, false);
                    const newFavorites = [...favorites, channelId];
                    set({
                        favorites: newFavorites,
                        favoriteIds: new Set(newFavorites),
                    });
                }
            },

            removeFavorite: (channelId: string) => {
                const { favorites } = get();
                if (favorites.includes(channelId)) anotarCanal(channelId, true);
                const newFavorites = favorites.filter(id => id !== channelId);
                set({
                    favorites: newFavorites,
                    favoriteIds: new Set(newFavorites),
                });
            },

            toggleFavorite: (channelId: string) => {
                const { favorites, addFavorite, removeFavorite } = get();
                if (favorites.includes(channelId)) {
                    removeFavorite(channelId);
                } else {
                    addFavorite(channelId);
                }
            },

            isFavorite: (channelId: string) => {
                return get().favoriteIds.has(channelId);
            },

            clearFavorites: () => {
                for (const c of get().favorites) anotarCanal(c, true);
                set({ favorites: [], favoriteIds: new Set<string>() });
            },
        }),
        {
            name: 'saimo-favorites',
            // De cada perfil: grava em saimo-favorites@<id> (o principal na chave de sempre) e
            // só carrega depois de iniciarPerfis() saber o perfil ativo (ver services/perfisStores.ts).
            storage: createJSONStorage(() => armazenamentoDoPerfil),
            skipHydration: true,
            // Convert Set to array for persistence
            partialize: (state) => ({
                favorites: state.favorites,
            }),
            // Restore Set from favorites array on hydration
            onRehydrateStorage: () => (state) => {
                if (state) {
                    state.favoriteIds = new Set(state.favorites);
                }
            },
        }
    )
);

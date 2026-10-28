import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

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
                    const newFavorites = [...favorites, channelId];
                    set({
                        favorites: newFavorites,
                        favoriteIds: new Set(newFavorites),
                    });
                }
            },

            removeFavorite: (channelId: string) => {
                const { favorites } = get();
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
                set({ favorites: [], favoriteIds: new Set<string>() });
            },
        }),
        {
            name: 'saimo-favorites',
            storage: createJSONStorage(() => AsyncStorage),
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

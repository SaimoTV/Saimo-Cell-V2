/**
 * Liga os stores de perfil (favoritos de canal e mídia) aos perfis: carrega o
 * do perfil ativo na partida e troca tudo quando o perfil muda. Fica num
 * arquivo à parte para services/perfis.ts não importar os stores (ciclo).
 */
import { useFavoritesStore } from '../stores/favoritesStore';
import { useMediaStore } from '../stores/mediaStore';
import { useSettingsStore } from '../stores/settingsStore';
import { carregarOutrosPerfis } from './sincroniaDados';
import { aoTrocarPerfil, iniciarPerfis, kidsAtivo, liberarGravacao } from './perfis';

async function carregar(): Promise<void> {
  await Promise.all([useFavoritesStore.persist.rehydrate(), useMediaStore.persist.rehydrate()]);
}

let preparado: Promise<void> | null = null;

/** Na partida, antes de mostrar favoritos e progresso. Pode chamar mais de uma vez. */
export function prepararPerfis(): Promise<void> {
  if (preparado) return preparado;
  preparado = (async () => {
    try {
      await iniciarPerfis();
      await carregar();
      await carregarOutrosPerfis();
    } finally {
      liberarGravacao(true);
    }
    // No Kids o conteúdo adulto nunca fica liberado.
    if (kidsAtivo()) useSettingsStore.getState().lockAdult();
  })();
  return preparado;
}

aoTrocarPerfil(async () => {
  liberarGravacao(false);
  try {
    useFavoritesStore.setState({ favorites: [], favoriteIds: new Set<string>() });
    useMediaStore.setState({ favorites: [], favoriteIds: new Set<string>(), watchHistory: [], seriesProgress: [] });
    await carregar();
  } finally {
    liberarGravacao(true);
  }
  // Trocou de perfil: o conteúdo adulto volta a ficar trancado.
  useSettingsStore.getState().lockAdult();
});

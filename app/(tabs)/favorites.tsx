import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  ScrollView,
  FlatList,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { Colors, Typography, Spacing } from '../../constants/Colors';
import { useFavoritesStore } from '../../stores/favoritesStore';
import { useMediaStore } from '../../stores/mediaStore';
import { getAllChannels } from '../../data/channels';
import { getMediaById } from '../../services/mediaService';
import ChannelCard from '../../components/ChannelCard';
import MediaCard from '../../components/MediaCard';
import type { MediaItem } from '../../types';
import { plural } from '../../utils/plural';

const { width } = Dimensions.get('window');
const CARD_WIDTH = (width - Spacing.lg * 3) / 2;

export default function FavoritesScreen() {
  const insets = useSafeAreaInsets();
  const { favorites: channelFavorites } = useFavoritesStore();
  const mediaFavorites = useMediaStore((s) => s.favorites);

  const [favoriteMedia, setFavoriteMedia] = useState<MediaItem[]>([]);

  // Canais favoritos
  const allChannels = getAllChannels(true);
  const favoriteChannels = allChannels.filter(ch => channelFavorites.includes(ch.id));

  // Carregar filmes/séries favoritos
  useEffect(() => {
    async function loadMedia() {
      if (mediaFavorites.length === 0) {
        setFavoriteMedia([]);
        return;
      }
      const items: MediaItem[] = [];
      for (const fav of mediaFavorites) {
        const item = await getMediaById(fav.id);
        if (item) items.push(item);
      }
      setFavoriteMedia(items);
    }
    loadMedia();
  }, [mediaFavorites]);

  const totalCount = favoriteChannels.length + favoriteMedia.length;

  // Divide canais em pares para layout de 2 colunas
  const channelRows: typeof favoriteChannels[] = [];
  for (let i = 0; i < favoriteChannels.length; i += 2) {
    channelRows.push(favoriteChannels.slice(i, i + 2));
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.background} />

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Favoritos</Text>
        <Text style={styles.subtitle}>{plural(totalCount, 'item', 'itens')}</Text>
      </View>

      {totalCount === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="heart-outline" size={64} color={Colors.textSecondary} />
          <Text style={styles.emptyTitle}>Nenhum favorito</Text>
          <Text style={styles.emptySubtitle}>
            Toque no coração nos canais, filmes{'\n'}ou séries para adicionar aos favoritos
          </Text>
        </View>
      ) : (
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={[styles.contentContainer, { paddingBottom: insets.bottom + 80 }]}
          showsVerticalScrollIndicator={false}
        >
          {/* Filmes e Séries Favoritos */}
          {favoriteMedia.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>
                Filmes e Séries ({favoriteMedia.length})
              </Text>
              <FlatList
                data={favoriteMedia}
                keyExtractor={(item) => item.id}
                horizontal
                showsHorizontalScrollIndicator={false}
                renderItem={({ item }) => (
                  <MediaCard item={item} size="medium" />
                )}
              />
            </View>
          )}

          {/* Canais Favoritos */}
          {favoriteChannels.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>
                Canais ({favoriteChannels.length})
              </Text>
              {channelRows.map((row, rowIndex) => (
                <View key={rowIndex} style={styles.row}>
                  {row.map((channel) => (
                    <ChannelCard key={channel.id} channel={channel} />
                  ))}
                  {row.length === 1 && <View style={{ width: CARD_WIDTH }} />}
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.md,
    backgroundColor: Colors.background,
  },
  title: {
    color: Colors.text,
    fontSize: Typography.h1.fontSize,
    fontWeight: '700',
  },
  subtitle: {
    color: Colors.textSecondary,
    fontSize: Typography.caption.fontSize,
    marginTop: 2,
  },
  scrollView: {
    flex: 1,
  },
  contentContainer: {
    padding: Spacing.lg,
  },
  section: {
    marginBottom: Spacing.xl,
  },
  sectionTitle: {
    color: Colors.text,
    fontSize: Typography.h3.fontSize,
    fontWeight: '700',
    marginBottom: Spacing.md,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.xxl,
  },
  emptyTitle: {
    color: Colors.text,
    fontSize: Typography.h2.fontSize,
    fontWeight: '600',
    marginTop: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  emptySubtitle: {
    color: Colors.textSecondary,
    fontSize: Typography.body.fontSize,
    textAlign: 'center',
    lineHeight: 22,
  },
});

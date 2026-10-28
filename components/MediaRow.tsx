import React, { memo } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

import type { MediaItem } from '../types';
import { Colors, Spacing, Typography } from '../constants/Colors';
import MediaCard from './MediaCard';

interface MediaRowProps {
  title: string;
  categoryId?: string;
  items: MediaItem[];
  onSeeAll?: () => void;
}

const { width } = Dimensions.get('window');
const CARD_WIDTH = width * 0.35; // Size medium
const CARD_HEIGHT = CARD_WIDTH * 1.5;

const MediaRow = memo(({ title, categoryId, items, onSeeAll }: MediaRowProps) => {
  const router = useRouter();

  if (items.length === 0) return null;

  const handleSeeAll = () => {
    if (onSeeAll) {
      onSeeAll();
    } else if (categoryId) {
      router.push({
        pathname: '/category/[id]' as any,
        params: { id: categoryId, name: title }
      });
    }
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        {(categoryId || onSeeAll) && (
          <TouchableOpacity style={styles.seeAllButton} onPress={handleSeeAll}>
            <Text style={styles.seeAllText}>Ver tudo</Text>
            <Ionicons name="chevron-forward" size={16} color={Colors.primary} />
          </TouchableOpacity>
        )}
      </View>
      
      {/* Horizontal List */}
      <FlashList
        horizontal
        data={items}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <MediaCard item={item} size="medium" />
        )}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: Spacing.lg }}
        removeClippedSubviews
      />
    </View>
  );
}, (prev, next) => {
  // Pela lista em si, não pelo tamanho: uma fileira trocada por outra do
  // mesmo tamanho (gêneros recarregados, "Continuar" atualizado) não mudava.
  return prev.categoryId === next.categoryId && prev.items === next.items;
});

MediaRow.displayName = 'MediaRow';

const styles = StyleSheet.create({
  container: {
    marginBottom: Spacing.xl,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
  },
  title: {
    color: Colors.text,
    fontSize: Typography.h3.fontSize,
    fontWeight: '700',
  },
  seeAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  seeAllText: {
    color: Colors.primary,
    fontSize: Typography.caption.fontSize,
    fontWeight: '600',
  },
  list: {
    paddingHorizontal: Spacing.lg,
  },
});

export default MediaRow;

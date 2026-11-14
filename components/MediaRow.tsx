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
  onRemove?: (item: MediaItem) => void;
}

const { width } = Dimensions.get('window');
const CARD_WIDTH = width * 0.35; // Size medium
const CARD_HEIGHT = CARD_WIDTH * 1.5;

const MediaRow = memo(({ title, categoryId, items, onSeeAll, onRemove }: MediaRowProps) => {
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
          <View style={styles.cardWrap}>
            <MediaCard item={item} size="medium" hideRating={Boolean(onRemove)} onRemove={onRemove} />
            {onRemove && (
              <TouchableOpacity
                style={styles.removeBtn}
                onPress={() => onRemove(item)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                accessibilityRole="button"
                accessibilityLabel={`Remover ${item.name} de Continue assistindo`}
              >
                <Ionicons name="close" size={16} color="#FFFFFF" />
              </TouchableOpacity>
            )}
          </View>
        )}
        extraData={onRemove}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: Spacing.lg }}
      />
    </View>
  );
}, (prev, next) => {
  // Pela lista em si, não pelo tamanho: uma fileira trocada por outra do
  // mesmo tamanho (gêneros recarregados, "Continuar" atualizado) não mudava.
  return prev.categoryId === next.categoryId && prev.items === next.items && prev.onRemove === next.onRemove;
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
  cardWrap: {
    position: 'relative',
  },
  removeBtn: {
    position: 'absolute',
    top: Spacing.sm,
    left: Spacing.sm,
    zIndex: 30,
    elevation: 16,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(10, 12, 22, 0.9)',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default MediaRow;

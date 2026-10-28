import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  StatusBar,
  TouchableOpacity,
  ActivityIndicator,
  FlatList,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { Colors, Typography, Spacing, BorderRadius } from '../../constants/Colors';
import { loadCategory, loadMoreForCategory, categoryHasMore } from '../../services/mediaService';
import { useShallow } from 'zustand/react/shallow';
import { useMediaStore } from '../../stores/mediaStore';
import type { MediaItem } from '../../types';
import MediaCard from '../../components/MediaCard';
import FilterBar from '../../components/FilterBar';
import { filterMedia, sortMedia, getAllGenres } from '../../services/mediaService';
import { plural } from '../../utils/plural';

export default function CategoryScreen() {
  const { id, name } = useLocalSearchParams<{ id: string; name: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  
  const [loading, setLoading] = useState(true);
  const [allItems, setAllItems] = useState<MediaItem[]>([]);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  
  // Só os filtros: com a store inteira, a tela era redesenhada a cada
  // gravação de progresso de um filme tocando.
  const {
    activeFilter, activeSort, activeGenre,
    setFilter, setSort, setGenre, clearFilters,
  } = useMediaStore(useShallow((s) => ({
    activeFilter: s.activeFilter, activeSort: s.activeSort, activeGenre: s.activeGenre,
    setFilter: s.setFilter, setSort: s.setSort, setGenre: s.setGenre, clearFilters: s.clearFilters,
  })));

  // Carregar primeira página online
  useEffect(() => {
    async function load() {
      if (!id) return;
      setLoading(true);
      const data = await loadCategory(id);
      setAllItems(data);
      setHasMore(categoryHasMore(id));
      setLoading(false);
    }
    load();
  }, [id]);

  const handleBack = () => router.back();

  // Gêneros
  const genres = useMemo(() => getAllGenres(allItems), [allItems]);

  // Filtrar e ordenar TODOS os itens carregados
  const filteredItems = useMemo(() => {
    let result = allItems;
    
    if (activeFilter !== 'all') {
      result = filterMedia(result, activeFilter);
    }
    if (activeGenre) {
      result = filterMedia(result, undefined, activeGenre);
    }
    result = sortMedia(result, activeSort);
    
    return result;
  }, [allItems, activeFilter, activeGenre, activeSort]);

  // Carregar mais páginas online
  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore || !id) return;
    
    setLoadingMore(true);
    try {
      const result = await loadMoreForCategory(id);
      setAllItems(result.items);
      setHasMore(result.hasMore);
    } catch (e) {
      console.warn('Erro ao carregar mais:', e);
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, hasMore, id]);

  // Footer com indicador de loading
  const renderFooter = useCallback(() => {
    if (!hasMore) return null;
    
    return (
      <View style={styles.footer}>
        {loadingMore ? (
          <ActivityIndicator size="small" color={Colors.primary} />
        ) : (
          <Text style={styles.footerText}>
            {plural(filteredItems.length, 'título carregado', 'títulos carregados')}
          </Text>
        )}
      </View>
    );
  }, [hasMore, loadingMore, filteredItems.length]);

  if (loading) {
    return (
      <View style={[styles.container, styles.center, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.background} />
      
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={handleBack}>
          <Ionicons name="arrow-back" size={24} color={Colors.text} />
        </TouchableOpacity>
        <View style={styles.titleContainer}>
          <Text style={styles.title}>{name || 'Categoria'}</Text>
          <Text style={styles.count}>
            {plural(filteredItems.length, 'título', 'títulos')}{hasMore ? '+' : ''}
          </Text>
        </View>
        <View style={{ width: 40 }} />
      </View>
      
      {/* Filters */}
      <FilterBar
        activeFilter={activeFilter}
        activeSort={activeSort}
        activeGenre={activeGenre}
        genres={genres}
        onFilterChange={setFilter}
        onSortChange={setSort}
        onGenreChange={setGenre}
        onClear={clearFilters}
      />
      
      {/* Grid com Infinite Scroll Online */}
      <FlatList
        data={filteredItems}
        keyExtractor={(item) => item.id}
        numColumns={3}
        contentContainerStyle={styles.grid}
        columnWrapperStyle={styles.row}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => (
          <MediaCard item={item} size="small" />
        )}
        // Performance
        initialNumToRender={15}
        maxToRenderPerBatch={15}
        windowSize={5}
        removeClippedSubviews
        // Infinite scroll - carrega próxima página online
        onEndReached={loadMore}
        onEndReachedThreshold={0.5}
        ListFooterComponent={renderFooter}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  center: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  backButton: {
    padding: Spacing.sm,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.full,
  },
  titleContainer: {
    flex: 1,
    alignItems: 'center',
  },
  title: {
    color: Colors.text,
    fontSize: Typography.h2.fontSize,
    fontWeight: '700',
  },
  count: {
    color: Colors.textSecondary,
    fontSize: Typography.caption.fontSize,
  },
  grid: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: 120,
  },
  row: {
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  footer: {
    paddingVertical: Spacing.lg,
    alignItems: 'center',
  },
  footerText: {
    color: Colors.textSecondary,
    fontSize: Typography.caption.fontSize,
  },
});

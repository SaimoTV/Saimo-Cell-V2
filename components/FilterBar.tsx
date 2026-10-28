import React, { memo, useCallback } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Colors, Spacing, Typography, BorderRadius } from '../constants/Colors';
import type { MediaFilterType, MediaSortType } from '../types';

interface FilterBarProps {
  activeFilter: MediaFilterType;
  activeSort: MediaSortType;
  activeGenre: string | null;
  genres: string[];
  onFilterChange: (filter: MediaFilterType) => void;
  onSortChange: (sort: MediaSortType) => void;
  onGenreChange: (genre: string | null) => void;
  onClear: () => void;
}

const FILTER_OPTIONS: { value: MediaFilterType; label: string; icon: string }[] = [
  { value: 'all', label: 'Todos', icon: 'apps' },
  { value: 'movie', label: 'Filmes', icon: 'film' },
  { value: 'tv', label: 'Séries', icon: 'tv' },
];

// "Nota" e "Popular" saíram: o índice do acervo não traz nota nem
// popularidade, e as duas mostravam a mesma ordem alfabética do "A-Z".
const SORT_OPTIONS: { value: MediaSortType; label: string }[] = [
  { value: 'name', label: 'A-Z' },
  { value: 'year', label: 'Ano' },
];

const FilterBar = memo(({
  activeFilter,
  activeSort,
  activeGenre,
  genres,
  onFilterChange,
  onSortChange,
  onGenreChange,
  onClear,
}: FilterBarProps) => {
  
  const hasActiveFilters = activeFilter !== 'all' || activeGenre !== null;

  return (
    <View style={styles.container}>
      {/* Type Filter */}
      <ScrollView 
        horizontal 
        showsHorizontalScrollIndicator={false}
        style={styles.row}
        contentContainerStyle={styles.rowContent}
      >
        {FILTER_OPTIONS.map((option) => (
          <TouchableOpacity
            key={option.value}
            style={[
              styles.chip,
              activeFilter === option.value && styles.chipActive
            ]}
            onPress={() => onFilterChange(option.value)}
          >
            <Ionicons 
              name={option.icon as any} 
              size={14} 
              color={activeFilter === option.value ? Colors.background : Colors.text} 
            />
            <Text style={[
              styles.chipText,
              activeFilter === option.value && styles.chipTextActive
            ]}>
              {option.label}
            </Text>
          </TouchableOpacity>
        ))}
        
        {/* Separator */}
        <View style={styles.separator} />
        
        {/* Sort Options */}
        {SORT_OPTIONS.map((option) => (
          <TouchableOpacity
            key={option.value}
            style={[
              styles.chipSmall,
              activeSort === option.value && styles.chipActive
            ]}
            onPress={() => onSortChange(option.value)}
          >
            <Text style={[
              styles.chipTextSmall,
              activeSort === option.value && styles.chipTextActive
            ]}>
              {option.label}
            </Text>
          </TouchableOpacity>
        ))}
        
        {/* Clear button */}
        {hasActiveFilters && (
          <TouchableOpacity style={styles.clearButton} onPress={onClear}>
            <Ionicons name="close-circle" size={16} color={Colors.error} />
            <Text style={styles.clearText}>Limpar</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
      
      {/* Genre Pills */}
      {genres.length > 0 && (
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false}
          style={styles.genreRow}
          contentContainerStyle={styles.rowContent}
        >
          <TouchableOpacity
            style={[styles.genreChip, !activeGenre && styles.genreChipActive]}
            onPress={() => onGenreChange(null)}
          >
            <Text style={[styles.genreText, !activeGenre && styles.genreTextActive]}>
              Todos
            </Text>
          </TouchableOpacity>
          
          {genres.slice(0, 15).map((genre) => (
            <TouchableOpacity
              key={genre}
              style={[styles.genreChip, activeGenre === genre && styles.genreChipActive]}
              onPress={() => onGenreChange(activeGenre === genre ? null : genre)}
            >
              <Text style={[styles.genreText, activeGenre === genre && styles.genreTextActive]}>
                {genre}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
    </View>
  );
});

FilterBar.displayName = 'FilterBar';

const styles = StyleSheet.create({
  container: {
    marginBottom: Spacing.md,
  },
  row: {
    marginBottom: Spacing.sm,
  },
  rowContent: {
    paddingHorizontal: Spacing.lg,
    gap: Spacing.sm,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    gap: 6,
  },
  chipActive: {
    backgroundColor: Colors.primary,
  },
  chipText: {
    color: Colors.text,
    fontSize: Typography.caption.fontSize,
    fontWeight: '600',
  },
  chipTextActive: {
    color: Colors.background,
  },
  chipSmall: {
    backgroundColor: Colors.surface,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
  },
  chipTextSmall: {
    color: Colors.textSecondary,
    fontSize: Typography.caption.fontSize,
    fontWeight: '500',
  },
  separator: {
    width: 1,
    backgroundColor: Colors.border,
    marginHorizontal: Spacing.xs,
  },
  clearButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.sm,
    gap: 4,
  },
  clearText: {
    color: Colors.error,
    fontSize: Typography.caption.fontSize,
  },
  genreRow: {
    marginTop: Spacing.xs,
  },
  genreChip: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
  },
  genreChipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  genreText: {
    color: Colors.textSecondary,
    fontSize: 12,
  },
  genreTextActive: {
    color: Colors.background,
    fontWeight: '600',
  },
});

export default FilterBar;

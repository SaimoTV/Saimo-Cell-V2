import React, { memo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, BorderRadius, Spacing, Typography } from '../constants/Colors';
import type { CategoryId } from '../types';

interface CategoryTabsProps {
  categories: string[];
  selectedCategory: string;
  onSelectCategory: (category: string) => void;
}

const categoryIcons: Record<string, string> = {
  'Todos': 'grid-outline',
  'Favoritos': 'heart',
  'TV Aberta': 'tv-outline',
  'Filmes': 'film-outline',
  'Series': 'albums-outline',
  'Esportes': 'football-outline',
  'Noticias': 'newspaper-outline',
  'Infantil': 'happy-outline',
  'Documentarios': 'earth-outline',
  'Entretenimento': 'sparkles-outline',
  'Internacionais': 'globe-outline',
  'Adulto': 'lock-closed-outline',
};

const CategoryTab = memo(({ 
  category, 
  isSelected, 
  onPress 
}: { 
  category: string; 
  isSelected: boolean;
  onPress: () => void;
}) => {
  const icon = categoryIcons[category] || 'list-outline';
  
  return (
    <Pressable
      style={[
        styles.tab,
        isSelected && styles.tabSelected,
      ]}
      onPress={onPress}
    >
      <Ionicons 
        name={icon as any} 
        size={18} 
        color={isSelected ? Colors.text : Colors.textSecondary} 
      />
      <Text style={[
        styles.tabText,
        isSelected && styles.tabTextSelected,
      ]}>
        {category}
      </Text>
    </Pressable>
  );
});

CategoryTab.displayName = 'CategoryTab';

const CategoryTabs = memo(({ 
  categories, 
  selectedCategory, 
  onSelectCategory 
}: CategoryTabsProps) => {
  const handlePress = useCallback((category: string) => {
    onSelectCategory(category);
  }, [onSelectCategory]);

  return (
    <View style={styles.container}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        removeClippedSubviews={Platform.OS === 'android'}
        scrollEventThrottle={16}
        overScrollMode="never"
      >
        {categories.map((category) => (
          <CategoryTab
            key={category}
            category={category}
            isSelected={selectedCategory === category}
            onPress={() => handlePress(category)}
          />
        ))}
      </ScrollView>
    </View>
  );
});

CategoryTabs.displayName = 'CategoryTabs';

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.surface,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  scrollContent: {
    paddingHorizontal: Spacing.md,
    gap: Spacing.sm,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.surfaceVariant,
    gap: Spacing.xs,
  },
  tabSelected: {
    backgroundColor: Colors.primary,
  },
  tabText: {
    color: Colors.textSecondary,
    fontSize: Typography.caption.fontSize,
    fontWeight: '500',
  },
  tabTextSelected: {
    color: Colors.text,
    fontWeight: '600',
  },
});

export default CategoryTabs;

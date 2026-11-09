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
  /** Filtros de ano, idade e nota (só aparecem com os detalhes do acervo). */
  comDetalhes?: boolean;
  /** Mostra Animes e Doramas junto de Filmes e Séries (aba de filmes). */
  comColecoes?: boolean;
  anos?: [number, number] | null;
  idade?: number | null;
  nota?: number;
  onAnosChange?: (anos: [number, number] | null) => void;
  onIdadeChange?: (idade: number | null) => void;
  onNotaChange?: (nota: number) => void;
}

/** As faixas de ano: os três últimos anos, as décadas e "antes de 1990". */
function faixasDeAno(): { rotulo: string; anos: [number, number] }[] {
  const atual = new Date().getFullYear();
  const out: { rotulo: string; anos: [number, number] }[] = [];
  for (let a = atual; a >= atual - 2; a--) out.push({ rotulo: String(a), anos: [a, a] });
  const decada = Math.floor(atual / 10) * 10;
  if (atual - 3 >= decada) out.push({ rotulo: `${decada}–${atual - 3}`, anos: [decada, atual - 3] });
  for (let d = decada - 10; d >= 1990; d -= 10) out.push({ rotulo: `Anos ${d}`, anos: [d, d + 9] });
  out.push({ rotulo: 'Antes de 1990', anos: [1, 1989] });
  return out;
}

const IDADES: { rotulo: string; idade: number }[] = [
  { rotulo: 'Livre', idade: 0 }, { rotulo: 'Até 10', idade: 10 }, { rotulo: 'Até 12', idade: 12 },
  { rotulo: 'Até 14', idade: 14 }, { rotulo: 'Até 16', idade: 16 },
];

const FILTER_OPTIONS: { value: MediaFilterType; label: string; icon: string }[] = [
  { value: 'all', label: 'Todos', icon: 'apps' },
  { value: 'movie', label: 'Filmes', icon: 'film' },
  { value: 'tv', label: 'Séries', icon: 'tv' },
];
// Animes e doramas são coleções à parte: só na aba de filmes e séries.
const COLECOES: { value: MediaFilterType; label: string; icon: string }[] = [
  { value: 'animes', label: 'Animes', icon: 'sparkles' },
  { value: 'doramas', label: 'Doramas', icon: 'heart-circle' },
];

// Nota e popularidade vêm de detalhes.txt (do TMDB); sem ele, só A-Z e Ano.
const SORT_OPTIONS: { value: MediaSortType; label: string; detalhes?: boolean }[] = [
  { value: 'popularity', label: 'Populares', detalhes: true },
  { value: 'rating', label: 'Mais bem avaliados', detalhes: true },
  { value: 'year', label: 'Mais novos' },
  { value: 'name', label: 'A-Z' },
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
  comDetalhes = false,
  comColecoes = false,
  anos = null,
  idade = null,
  nota = 0,
  onAnosChange,
  onIdadeChange,
  onNotaChange,
}: FilterBarProps) => {

  const hasActiveFilters = activeFilter !== 'all' || activeGenre !== null || !!anos || idade !== null || nota > 0;
  const linha = (rotulo: string, itens: { chave: string; texto: string; ativo: boolean; aoTocar: () => void }[]) => (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.genreRow} contentContainerStyle={styles.rowContent}>
      <Text style={styles.rotuloLinha}>{rotulo}</Text>
      {itens.map((i) => (
        <TouchableOpacity key={i.chave} style={[styles.genreChip, i.ativo && styles.genreChipActive]} onPress={i.aoTocar}>
          <Text style={[styles.genreText, i.ativo && styles.genreTextActive]}>{i.texto}</Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );

  return (
    <View style={styles.container}>
      {/* Type Filter */}
      <ScrollView 
        horizontal 
        showsHorizontalScrollIndicator={false}
        style={styles.row}
        contentContainerStyle={styles.rowContent}
      >
        {(comColecoes ? [...FILTER_OPTIONS, ...COLECOES] : FILTER_OPTIONS).map((option) => (
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
        {SORT_OPTIONS.filter((o) => comDetalhes || !o.detalhes).map((option) => (
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
          
          {genres.map((genre) => (
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

      {comDetalhes && onAnosChange && linha('Ano', [
        { chave: 'todos', texto: 'Todos', ativo: !anos, aoTocar: () => onAnosChange(null) },
        ...faixasDeAno().map((f) => ({
          chave: f.rotulo, texto: f.rotulo,
          ativo: !!anos && anos[0] === f.anos[0] && anos[1] === f.anos[1],
          aoTocar: () => onAnosChange(anos && anos[0] === f.anos[0] && anos[1] === f.anos[1] ? null : f.anos),
        })),
      ])}
      {comDetalhes && onIdadeChange && linha('Idade', [
        { chave: 'todas', texto: 'Todas', ativo: idade === null, aoTocar: () => onIdadeChange(null) },
        ...IDADES.map((i) => ({ chave: String(i.idade), texto: i.rotulo, ativo: idade === i.idade,
          aoTocar: () => onIdadeChange(idade === i.idade ? null : i.idade) })),
      ])}
      {comDetalhes && onNotaChange && linha('Nota', [0, 6, 7, 8].map((n) => ({
        chave: String(n), texto: n ? `${n}+` : 'Qualquer', ativo: nota === n, aoTocar: () => onNotaChange(n),
      })))}
    </View>
  );
});

FilterBar.displayName = 'FilterBar';

const styles = StyleSheet.create({
  rotuloLinha: { color: Colors.textSecondary, fontSize: 12, fontWeight: '700', alignSelf: 'center', marginRight: 2 },
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

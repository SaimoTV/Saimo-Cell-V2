import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  InteractionManager,
  ImageBackground,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import Video from 'react-native-video';
import { Ionicons } from '@expo/vector-icons';

import { Colors, Typography, Spacing, BorderRadius } from '../../constants/Colors';
import { useShallow } from 'zustand/react/shallow';
import { useMediaStore } from '../../stores/mediaStore';
import { deduplicateByName } from '../../services/mediaService';
import {
  loadAllPreviews,
  startBackgroundLoading,
  stopLoading,
  getAllLoadedCategories,
  getTotalLoadedCount,
  clearAllCaches,
  getCatalog,
} from '../../services/apiService';
import { loadDestaques, type DestaqueRow } from '../../services/saimoSources';
import { useSettingsStore } from '../../stores/settingsStore';
import { useLinksStore } from '../../stores/linksStore';
import { getTrendingToday, getTrendingWeek } from '../../services/trendingService';
import type { MediaItem } from '../../types';
import MediaRow from '../../components/MediaRow';
import MediaCard from '../../components/MediaCard';
import FilterBar from '../../components/FilterBar';
import * as telemetria from '../../services/telemetria';
import { getAllGenres, filterMedia, sortMedia } from '../../services/mediaService';
import { plural } from '../../utils/plural';

const ADULT_CATEGORY_IDS = [
  'hot-adultos-bella-da-semana',
  'hot-adultos-legendado',
  'hot-adultos',
  'adulto',
];

function isAdultContent(item: MediaItem): boolean {
  if (item.isAdult) return true;
  if (ADULT_CATEGORY_IDS.includes(item.category)) return true;
  const name = (item.tmdb?.title || item.name || '').toLowerCase();
  if (name.includes('[xxx]') || name.includes('(xxx)') || /\bxxx\b/.test(name) || name.includes('18+')) return true;
  return false;
}

function mapSortToAPI(sort: string): 'new' | 'name' {
  return sort === 'year' ? 'new' : 'name';
}

const SEARCH_DEBOUNCE = 600;
const MAX_GRID_RESULTS = 200;

type CategoryRowData = { id: string; name: string; items: MediaItem[] };

/**
 * Banner do primeiro destaque. Com trailer direto no catálogo (MP4/HLS, sexto
 * campo de destaques.txt) o vídeo começa mudo depois de 5 s; se ele tocou e a
 * aba continua na frente por mais 15 s, a ficha abre. Sem trailer, nada abre
 * sozinho, e com a aba fora de foco não há vídeo nem contagem.
 */
function TrailerBanner({ item, onOpen }: { item?: MediaItem; onOpen: () => void }) {
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);
  const tocou = useRef(false);
  const trailer = item?.tmdb?.trailer || '';
  const direct = /^https?:\/\/.*\.(mp4|m3u8)(\?.*)?$/i.test(trailer) ? trailer : '';
  useFocusEffect(useCallback(() => {
    setPlaying(false); setFailed(false); tocou.current = false;
    if (!item || !direct) return;
    const start = setTimeout(() => setPlaying(true), 5000);
    const open = setTimeout(() => { if (tocou.current) onOpen(); }, 20000);
    return () => { clearTimeout(start); clearTimeout(open); setPlaying(false); };
  }, [item, direct, onOpen]));
  if (!item) return null;
  const title = item.tmdb?.title || item.name;
  const image = item.tmdb?.backdrop || item.tmdb?.poster || '';
  return (
    <TouchableOpacity style={styles.trailerBanner} activeOpacity={0.9} onPress={onOpen}>
      {playing && direct && !failed ? (
        <Video source={{ uri: direct }} style={StyleSheet.absoluteFill} resizeMode="cover" muted repeat
          onLoad={() => { tocou.current = true; }}
          onError={() => { tocou.current = false; setFailed(true); setPlaying(false); }} />
      ) : <ImageBackground source={{ uri: image }} style={StyleSheet.absoluteFill} resizeMode="cover" />}
      <View style={styles.trailerShade} />
      <View style={styles.trailerContent}>
        <Text style={styles.trailerEyebrow}>{playing ? 'TRAILER' : 'DESTAQUE'}</Text>
        <Text style={styles.trailerTitle} numberOfLines={2}>{title}</Text>
        <View style={styles.trailerButton}><Ionicons name="information-circle-outline" size={16} color="#fff" /><Text style={styles.trailerButtonText}>Ver detalhes</Text></View>
      </View>
    </TouchableOpacity>
  );
}

export default function MoviesScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [categories, setCategories] = useState<Map<string, MediaItem[]>>(new Map());
  const [totalLoaded, setTotalLoaded] = useState(0);
  const [bgLoading, setBgLoading] = useState(false);

  const [destaques, setDestaques] = useState<DestaqueRow[]>([]);

  const [trendingToday, setTrendingToday] = useState<MediaItem[]>([]);
  const [trendingWeek, setTrendingWeek] = useState<MediaItem[]>([]);
  const [trendingLoading, setTrendingLoading] = useState(false);
  const trendingLoadedRef = useRef(false);

  const [searchInput, setSearchInput] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  const [catalogResults, setCatalogResults] = useState<MediaItem[]>([]);
  const [catalogPage, setCatalogPage] = useState(1);
  const [catalogTotalPages, setCatalogTotalPages] = useState(1);
  const [catalogLoading, setCatalogLoading] = useState(false);

  // Só os filtros: com a store inteira, a tela de Filmes (montada atrás do
  // player) era redesenhada a cada gravação de progresso do filme tocando.
  const {
    activeFilter, activeSort, activeGenre,
    setFilter, setSort, setGenre, clearFilters,
  } = useMediaStore(useShallow((s) => ({
    activeFilter: s.activeFilter, activeSort: s.activeSort, activeGenre: s.activeGenre,
    setFilter: s.setFilter, setSort: s.setSort, setGenre: s.setGenre, clearFilters: s.clearFilters,
  })));
  const { adultUnlocked } = useSettingsStore();
  const linksProntos = useLinksStore(s => s.pronto);
  const linkFilmes = useLinksStore(s => s.linkFilmes);
  const semEndereco = linksProntos && !linkFilmes;

  const mountedRef = useRef(true);
  const catalogLoadedRef = useRef(false);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      stopLoading();
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, []);

  const loadTrending = useCallback(async () => {
    if (!mountedRef.current) return;
    try {
      const [today, week] = await Promise.all([getTrendingToday(), getTrendingWeek()]);
      if (mountedRef.current) {
        setTrendingToday(today);
        setTrendingWeek(week);
      }
    } catch { /* silencioso */ } finally {
      if (mountedRef.current) setTrendingLoading(false);
    }
  }, []);

  const loadCatalog = useCallback(async (isRefresh: boolean) => {
    if (!isRefresh && catalogLoadedRef.current) {
      const cached = getAllLoadedCategories();
      if (cached.size > 0) {
        setCategories(cached);
        setTotalLoaded(getTotalLoadedCount());
        setLoading(false);
        return;
      }
    }
    setLoading(true);
    try {
      const result = await loadAllPreviews();
      if (!mountedRef.current) return;
      setCategories(result);
      setTotalLoaded(getTotalLoadedCount());
      catalogLoadedRef.current = true;
      setLoading(false);
      InteractionManager.runAfterInteractions(() => {
        if (!mountedRef.current) return;
        setBgLoading(true);
        startBackgroundLoading(() => {
          if (mountedRef.current) {
            setCategories(getAllLoadedCategories());
            setTotalLoaded(getTotalLoadedCount());
          }
        }).then(() => {
          if (mountedRef.current) setBgLoading(false);
        });
      });
    } catch (e) {
      console.error('[Movies] Erro ao carregar catálogo:', e);
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  // O catálogo e as fileiras de destaque saem do endereço da lista de filmes e
  // séries. Sem endereço nada é pedido e a tela mostra o estado vazio; trocado
  // ou apagado em Ajustes > Listas, a tela recomeça daqui.
  // As fileiras da tela inicial são sete quilobytes e não dependem do
  // catálogo: chegam antes dele e são a primeira coisa que aparece.
  useEffect(() => {
    if (!linksProntos) return;
    stopLoading();
    setCategories(new Map());
    setTotalLoaded(0);
    setTrendingToday([]);
    setTrendingWeek([]);
    setCatalogResults([]);
    setDestaques([]);
    catalogLoadedRef.current = false;
    trendingLoadedRef.current = false;
    if (!linkFilmes) { setLoading(false); return; }
    let active = true;
    loadCatalog(false);
    loadDestaques()
      .then(rows => { if (active) setDestaques(rows); })
      .catch(e => console.warn('[Movies] destaques:', e));
    return () => { active = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linksProntos, linkFilmes]);

  useEffect(() => {
    if (linkFilmes && !loading && !trendingLoadedRef.current) {
      trendingLoadedRef.current = true;
      setTrendingLoading(true);
      InteractionManager.runAfterInteractions(() => {
        if (mountedRef.current) loadTrending();
      });
    }
  }, [loading, loadTrending, linkFilmes]);

  const loadCatalogFiltered = useCallback(async (page: number) => {
    setCatalogLoading(true);
    const params: Parameters<typeof getCatalog>[0] = {
      p_page: page,
      p_order_by: mapSortToAPI(activeSort),
      p_is_adult: adultUnlocked,
    };
    if (debouncedQuery.trim()) params.p_search = debouncedQuery.trim();
    if (activeFilter === 'movie') params.p_type = 'movie';
    else if (activeFilter === 'tv') params.p_type = 'series';
    if (activeGenre) params.p_category = activeGenre;

    try {
      const result = await getCatalog(params);
      let items = result.items;
      if (!adultUnlocked) items = items.filter(item => !isAdultContent(item));
      items = deduplicateByName(items);
      if (items.length > MAX_GRID_RESULTS) items = items.slice(0, MAX_GRID_RESULTS);
      // Busca sem filtro que não achou nada: o monitor mostra o que falta.
      if (page === 1 && !items.length && params.p_search && !params.p_type && !params.p_category) {
        telemetria.buscou('vod', params.p_search, () => false);
      }
      if (mountedRef.current) {
        if (page === 1) setCatalogResults(items);
        else setCatalogResults(prev => deduplicateByName([...prev, ...items]));
        setCatalogPage(page);
        setCatalogTotalPages(result.totalPages);
      }
    } catch (e) {
      console.warn('[Movies] loadCatalogFiltered erro:', e);
    } finally {
      if (mountedRef.current) setCatalogLoading(false);
    }
  }, [debouncedQuery, activeFilter, activeSort, activeGenre, adultUnlocked]);

  useEffect(() => {
    if (debouncedQuery.trim() || activeFilter !== 'all' || activeGenre) {
      loadCatalogFiltered(1);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQuery, activeFilter, activeSort, activeGenre]);

  const loadMoreCatalog = useCallback(() => {
    if (catalogLoading || catalogPage >= catalogTotalPages) return;
    loadCatalogFiltered(catalogPage + 1);
  }, [catalogLoading, catalogPage, catalogTotalPages, loadCatalogFiltered]);

  const handleSearchChange = useCallback((text: string) => {
    setSearchInput(text);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (!text.trim()) { setDebouncedQuery(''); return; }
    searchTimerRef.current = setTimeout(() => {
      if (mountedRef.current) setDebouncedQuery(text.trim());
    }, SEARCH_DEBOUNCE);
  }, []);

  const clearSearch = useCallback(() => {
    setSearchInput('');
    setDebouncedQuery('');
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
  }, []);

  const handlePullRefresh = useCallback(() => {
    setRefreshing(true);
    const loaded = getAllLoadedCategories();
    setCategories(loaded);
    setTotalLoaded(getTotalLoadedCount());
    setRefreshing(false);
  }, []);

  const handleHardReload = useCallback(() => {
    setRefreshing(true);
    stopLoading();
    clearAllCaches();
    setCategories(new Map());
    setTotalLoaded(0);
    setTrendingToday([]);
    setTrendingWeek([]);
    setCatalogResults([]);
    loadDestaques(true).then(setDestaques).catch(() => {});
    catalogLoadedRef.current = false;
    trendingLoadedRef.current = false;
    loadCatalog(true).finally(() => {
      if (mountedRef.current) setRefreshing(false);
    });
  }, [loadCatalog]);

  const categoryData = useMemo((): CategoryRowData[] => {
    const result: CategoryRowData[] = [];
    categories.forEach((items, id) => {
      if (!adultUnlocked && ADULT_CATEGORY_IDS.includes(id)) return;
      const filtered = adultUnlocked ? items : items.filter(item => !isAdultContent(item));
      if (filtered.length === 0) return;
      result.push({
        id,
        name: filtered[0]?.categoryLabel || id,
        items: deduplicateByName(filtered).slice(0, 10),
      });
    });
    return result;
  }, [categories, adultUnlocked]);

  const allItems = useMemo(() => {
    let total = 0;
    categories.forEach(catItems => { total += catItems.length; });
    const items = new Array<MediaItem>(total);
    let idx = 0;
    categories.forEach(catItems => {
      for (let i = 0; i < catItems.length; i++) items[idx++] = catItems[i];
    });
    return deduplicateByName(items);
  }, [categories]);

  const genres = useMemo(() => getAllGenres(allItems), [allItems]);

  const showGrid = !!(debouncedQuery.trim() || activeFilter !== 'all' || activeGenre);
  const gridData = showGrid ? catalogResults : [];

  const renderCategoryRow = useCallback(({ item }: { item: CategoryRowData }) => (
    <MediaRow title={item.name} categoryId={item.id} items={item.items} />
  ), []);

  const renderGridItem = useCallback(({ item }: { item: MediaItem }) => (
    <MediaCard item={item} size="small" />
  ), []);

  const keyExtractorCategory = useCallback((item: CategoryRowData) => item.id, []);
  const keyExtractorGrid = useCallback((item: MediaItem) => item.id, []);

  /**
   * O topo da tela: as fileiras publicadas primeiro, depois as tendências.
   *
   * Antes a tela abria direto nas categorias por letra inicial — que é a
   * ordem do arquivo do acervo, não uma ordem que sirva a quem chega. As
   * fileiras vêm prontas do mesmo `destaques.txt` que a TV Box lê, com capa
   * junto, e as listas por letra continuam logo abaixo para quem navega.
   */
  /*
   * "Continue assistindo": filmes pela metade e séries em andamento, do mais
   * recente para o mais antigo. O progresso já era salvo — só não aparecia
   * em lugar nenhum da tela inicial.
   */
  const watchHistory = useMediaStore(s => s.watchHistory);
  const seriesProgress = useMediaStore(s => s.seriesProgress);
  const continuar = useMemo(() => {
    const porId = new Map(allItems.map(i => [i.id, i]));
    const entradas: { item: MediaItem; quando: number }[] = [];
    for (const h of watchHistory) {
      const fracao = h.progress && h.duration ? h.progress / h.duration : 0;
      if (fracao < 0.02 || fracao > 0.95) continue;
      const item = porId.get(h.id);
      if (item && item.type !== 'tv') entradas.push({ item, quando: h.watchedAt });
    }
    for (const sp of seriesProgress) {
      const item = porId.get(sp.seriesId);
      if (item) entradas.push({ item, quando: sp.watchedAt ?? 0 });
    }
    const vistos = new Set<string>();
    return entradas.sort((a, b) => b.quando - a.quando)
      .filter(e => (vistos.has(e.item.id) ? false : (vistos.add(e.item.id), true)))
      .slice(0, 20).map(e => e.item);
  }, [allItems, watchHistory, seriesProgress]);

  const bannerItem = destaques[0]?.items[0];
  const openBannerItem = useCallback(() => {
    if (!bannerItem) return;
    if (bannerItem.type === 'tv') router.push({ pathname: '/series/[id]' as any, params: { id: bannerItem.id } });
    else router.push({ pathname: '/media/[id]', params: { id: bannerItem.id } });
  }, [bannerItem, router]);
  const HomeHeader = useMemo(() => {
    const hasTrending = trendingToday.length > 0 || trendingWeek.length > 0;
    if (!destaques.length && !trendingLoading && !hasTrending && !continuar.length) return null;
    return (
      <View>
        <TrailerBanner item={bannerItem} onOpen={openBannerItem} />
        {continuar.length > 0 && <MediaRow title="Continue assistindo" items={continuar} />}
        {destaques.map(row => (
          <MediaRow key={row.title} title={row.title} items={row.items} />
        ))}
        {trendingLoading && trendingToday.length === 0 ? (
          <View style={styles.trendingPlaceholder}>
            <Text style={styles.trendingPlaceholderTitle}>Tendências</Text>
            <ActivityIndicator size="small" color={Colors.primary} />
          </View>
        ) : (
          <>
            {trendingToday.length > 0 && <MediaRow title="Tendências de hoje" items={trendingToday} />}
            {trendingWeek.length > 0 && <MediaRow title="Tendências da semana" items={trendingWeek} />}
          </>
        )}
      </View>
    );
  }, [destaques, bannerItem, openBannerItem, trendingToday, trendingWeek, trendingLoading, continuar]);

  const ListFooter = useMemo(() => {
    if (!bgLoading && !catalogLoading) return null;
    return (
      <View style={styles.bgLoadingContainer}>
        <ActivityIndicator size="small" color={Colors.primary} />
        <Text style={styles.bgLoadingText}>
          {catalogLoading ? 'Carregando...' : `Carregando mais... (${totalLoaded})`}
        </Text>
      </View>
    );
  }, [bgLoading, catalogLoading, totalLoaded]);

  const refreshControl = useMemo(() => (
    <RefreshControl
      refreshing={refreshing}
      onRefresh={handlePullRefresh}
      tintColor={Colors.primary}
      colors={[Colors.primary]}
    />
  ), [refreshing, handlePullRefresh]);

  if (semEndereco) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <StatusBar barStyle="light-content" backgroundColor={Colors.background} />
        <View style={styles.header}>
          <Text style={styles.title}>Filmes & Séries</Text>
        </View>
        <View style={[styles.center, { flex: 1, paddingHorizontal: Spacing.xl }]}>
          <Ionicons name="film-outline" size={64} color={Colors.textSecondary} />
          <Text style={styles.vazioTitulo}>Nenhum filme ou série.</Text>
          <Text style={styles.vazioTexto}>
            Informe o endereço da lista de filmes e séries em Ajustes {'>'} Listas.
          </Text>
          <TouchableOpacity
            style={styles.vazioBotao}
            onPress={() => router.push('/(tabs)/settings' as any)}
            accessibilityRole="button"
            testID="filmes-abrir-ajustes"
          >
            <Text style={styles.trailerButtonText}>Abrir Ajustes</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={[styles.container, styles.center, { paddingTop: insets.top }]}>
        <StatusBar barStyle="light-content" backgroundColor={Colors.background} />
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={styles.loadingText}>Carregando catálogo...</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.background} />

      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View>
            <Text style={styles.title}>Filmes & Séries</Text>
            <Text style={styles.subtitle}>
              {plural(categoryData.length, 'categoria', 'categorias')} • {plural(totalLoaded, 'título', 'títulos')}
              {bgLoading ? ' (carregando...)' : ''}
            </Text>
          </View>
          <View style={styles.headerButtons}>
            <TouchableOpacity
              style={styles.headerButton}
              onPress={() => { if (showSearch) { clearSearch(); setShowSearch(false); } else setShowSearch(true); }}
            >
              <Ionicons name={showSearch ? 'close' : 'search'} size={22} color={Colors.text} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.headerButton}
              onPress={() => setShowFilters(!showFilters)}
            >
              <Ionicons name="options" size={22} color={Colors.text} />
            </TouchableOpacity>
            <TouchableOpacity style={[styles.headerButton, styles.refreshButton]} onPress={handleHardReload}>
              <Ionicons name="refresh" size={20} color={Colors.text} />
            </TouchableOpacity>
          </View>
        </View>

        {showSearch && (
          <View style={styles.searchContainer}>
            <Ionicons name="search" size={20} color={Colors.textSecondary} />
            <TextInput
              style={styles.searchInput}
              placeholder="Buscar filmes e séries..."
              placeholderTextColor={Colors.textSecondary}
              value={searchInput}
              onChangeText={handleSearchChange}
              autoFocus
              autoCapitalize="none"
              autoCorrect={false}
            />
            {searchInput.length > 0 && (
              <TouchableOpacity onPress={clearSearch}>
                <Ionicons name="close-circle" size={20} color={Colors.textSecondary} />
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>

      {showFilters && (
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
      )}

      {showGrid ? (
        <FlashList
          // Tocar num pôster com o teclado aberto já abre o título (antes o
          // primeiro toque só fechava o teclado).
          keyboardShouldPersistTaps="handled"
          key="grid-view"
          data={gridData}
          keyExtractor={keyExtractorGrid}
          numColumns={3}
          renderItem={renderGridItem}
          contentContainerStyle={[styles.gridContainer, { paddingBottom: insets.bottom + 80 }]}
          showsVerticalScrollIndicator={false}
          refreshControl={refreshControl}
          ListHeaderComponent={
            catalogLoading && gridData.length === 0 ? (
              <View style={styles.searchingRow}>
                <ActivityIndicator size="small" color={Colors.primary} />
                <Text style={styles.resultsText}>Buscando...</Text>
              </View>
            ) : (
              <Text style={styles.resultsText}>{gridData.length} resultado{gridData.length !== 1 ? 's' : ''}</Text>
            )
          }
          ListFooterComponent={ListFooter}
          onEndReached={loadMoreCatalog}
          onEndReachedThreshold={0.5}
        />
      ) : (
        <FlashList
          // Tocar num pôster com o teclado aberto já abre o título (antes o
          // primeiro toque só fechava o teclado).
          keyboardShouldPersistTaps="handled"
          key="category-view"
          data={categoryData}
          keyExtractor={keyExtractorCategory}
          renderItem={renderCategoryRow}
          contentContainerStyle={{ paddingBottom: insets.bottom + 80 }}
          showsVerticalScrollIndicator={false}
          refreshControl={refreshControl}
          ListHeaderComponent={HomeHeader}
          ListFooterComponent={ListFooter}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  trailerBanner: { height: 230, marginHorizontal: Spacing.lg, marginBottom: Spacing.lg, borderRadius: BorderRadius.lg, overflow: 'hidden', backgroundColor: Colors.surface },
  trailerShade: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.46)' },
  trailerContent: { flex: 1, justifyContent: 'flex-end', padding: Spacing.lg },
  trailerEyebrow: { color: Colors.primary, fontSize: 11, fontWeight: '800', letterSpacing: 1.5 },
  trailerTitle: { color: '#fff', fontSize: 25, fontWeight: '800', marginTop: 4 },
  trailerButton: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', backgroundColor: Colors.primary, borderRadius: BorderRadius.full, paddingHorizontal: 14, paddingVertical: 8, marginTop: 10 },
  trailerButtonText: { color: '#fff', fontWeight: '700' },
  center: { justifyContent: 'center', alignItems: 'center' },
  vazioTitulo: { color: Colors.text, fontSize: 17, fontWeight: '700', marginTop: Spacing.md, textAlign: 'center' },
  vazioTexto: { color: Colors.textSecondary, fontSize: Typography.body.fontSize, marginTop: Spacing.sm, textAlign: 'center' },
  vazioBotao: { marginTop: Spacing.lg, backgroundColor: Colors.primary, borderRadius: BorderRadius.full, paddingHorizontal: 22, paddingVertical: 12 },
  loadingText: { color: Colors.textSecondary, marginTop: Spacing.md, fontSize: Typography.body.fontSize },
  header: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.md,
    backgroundColor: Colors.background,
  },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  title: { color: Colors.text, fontSize: Typography.h1.fontSize, fontWeight: '700' },
  subtitle: { color: Colors.textSecondary, fontSize: Typography.caption.fontSize, marginTop: 2 },
  headerButtons: { flexDirection: 'row', gap: Spacing.sm },
  headerButton: { padding: Spacing.sm, backgroundColor: Colors.surface, borderRadius: BorderRadius.full },
  refreshButton: { backgroundColor: Colors.primary },
  searchContainer: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.surface, borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.md, marginTop: Spacing.md, height: 44, gap: Spacing.sm,
  },
  searchInput: { flex: 1, color: Colors.text, fontSize: Typography.body.fontSize, height: '100%' },
  gridContainer: { paddingHorizontal: Spacing.lg },
  searchingRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.md },
  resultsText: { color: Colors.textSecondary, fontSize: Typography.caption.fontSize, marginBottom: Spacing.md },
  bgLoadingContainer: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: Spacing.lg, gap: Spacing.sm,
  },
  bgLoadingText: { color: Colors.textSecondary, fontSize: Typography.caption.fontSize },
  trendingPlaceholder: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.lg, marginBottom: Spacing.xl, height: 36, gap: Spacing.sm,
  },
  trendingPlaceholderTitle: { color: Colors.text, fontSize: Typography.h3.fontSize, fontWeight: '700' },
});

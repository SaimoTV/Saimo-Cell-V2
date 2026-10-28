import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  StatusBar,
  TouchableOpacity,
  ActivityIndicator,
  Dimensions,
  FlatList,
  Alert,
} from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { Colors, Typography, Spacing, BorderRadius } from '../../constants/Colors';
import { getItemAPI } from '../../services/apiService';
import { getTMDBDetails } from '../../services/tmdbService';
import { useMediaStore } from '../../stores/mediaStore';
import { downloadManager } from '../../services/downloadManager';
import DownloadButton from '../../components/DownloadButton';
import CastAction from '../../components/CastAction';
import SourceSheet from '../../components/SourceSheet';
import { primeiraFonteBaixavel } from '../../services/downloadUtils';
import { parseVodId } from '../../services/saimoSources';
import type { MediaItem, Episode, CastMember } from '../../types';

const { width, height } = Dimensions.get('window');

// Cor da classificação — a mesma régua da tela de filme.
/** Versão (dub/leg) de cada fonte, por endereço, para o player manter a escolhida. */
const rotulosDe = (fontes?: { url: string; label?: string }[]) =>
  Object.fromEntries((fontes ?? []).map(f => [f.url, f.label ?? 'dub']));

const getCertColor = (cert?: string) => {
  if (!cert) return Colors.textSecondary;
  const c = cert.toUpperCase();
  if (c === 'L') return '#10B981';
  if (c === '10') return '#3B82F6';
  if (c === '12') return '#F59E0B';
  if (c === '14') return '#F97316';
  if (c === '16' || c === '18') return '#EF4444';
  return Colors.textSecondary;
};

export default function SeriesDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  
  const [series, setSeries] = useState<MediaItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedSeason, setSelectedSeason] = useState<string>('1');
  
  const { isFavorite, addFavorite, removeFavorite, setSeriesProgress } = useMediaStore();
  const progress = useMediaStore(s => s.seriesProgress.find(p => p.seriesId === id));
  const [favorite, setFavorite] = useState(false);
  const [overviewExpanded, setOverviewExpanded] = useState(false);
  const [sourceSheet, setSourceSheet] = useState<Episode | null>(null);

  // Carregar série
  useEffect(() => {
    async function load() {
      if (!id) return;
      try {
        const item = await getItemAPI(id);
        setSeries(item);
        setFavorite(isFavorite(id));
        // Duração, classificação, elenco e quem assina só existem no
        // endereço do título: é o que faltava para a tela de série mostrar
        // o mesmo que a de filme.
        if (item.tmdb?.id) {
          getTMDBDetails(item.tmdb.id, true).then(ficha => {
            if (!Object.keys(ficha).length) return;
            setSeries(atual => (atual ? { ...atual, tmdb: { ...atual.tmdb!, ...ficha } } : atual));
          });
        }
        // Use the store's current state to set initial season
        const initialProgress = useMediaStore.getState().seriesProgress.find(p => p.seriesId === id);
        if (initialProgress) setSelectedSeason(initialProgress.season.toString());
      } catch (e) {
        console.warn('[SeriesDetail] Erro ao carregar:', id, e);
      } finally {
        setLoading(false);
      }
    }
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const isFav = isFavorite(id as string);
  useEffect(() => {
    setFavorite(isFav);
  }, [isFav]);

  // Temporadas disponíveis
  const seasons = useMemo(() => {
    if (!series?.episodes) return [];
    return Object.keys(series.episodes).sort((a, b) => parseInt(a) - parseInt(b));
  }, [series]);

  // Episódios da temporada selecionada
  const episodes = useMemo(() => {
    if (!series?.episodes || !selectedSeason) return [];
    return series.episodes[selectedSeason] || [];
  }, [series, selectedSeason]);

  const handleBack = useCallback(() => router.back(), [router]);

  const handleFavorite = useCallback(() => {
    if (!series) return;
    if (favorite) {
      removeFavorite(series.id);
    } else {
      addFavorite(series.id);
    }
    setFavorite(!favorite);
  }, [series, favorite, addFavorite, removeFavorite]);

  const handlePlayEpisode = useCallback((ep: Episode, season: string) => {
    if (!series) return;
    setSeriesProgress(series.id, parseInt(season), ep.episode, ep.id);

    // Descobre o próximo episódio (mesmo season ou próximo season)
    const seasonEps = series.episodes?.[season] || [];
    const currentIndex = seasonEps.findIndex(e => e.id === ep.id);
    let nextEp: Episode | null = null;
    let nextSeason = season;

    if (currentIndex >= 0 && currentIndex < seasonEps.length - 1) {
      nextEp = seasonEps[currentIndex + 1];
    } else {
      // Tenta avançar para próxima temporada
      const seasonNums = Object.keys(series.episodes || {}).sort((a, b) => parseInt(a) - parseInt(b));
      const seasonIdx = seasonNums.indexOf(season);
      if (seasonIdx >= 0 && seasonIdx < seasonNums.length - 1) {
        nextSeason = seasonNums[seasonIdx + 1];
        const nextSeasonEps = series.episodes?.[nextSeason] || [];
        if (nextSeasonEps.length > 0) nextEp = nextSeasonEps[0];
      }
    }

    router.push({
      pathname: '/media-player/[id]' as any,
      params: {
        id: ep.id,
        url: encodeURIComponent(ep.url),
        sources: encodeURIComponent(JSON.stringify((ep.sources ?? []).map(source => source.url))),
        sourceLabels: encodeURIComponent(JSON.stringify(rotulosDe(ep.sources))),
        title: `${series.name} - T${season} E${ep.episode}`,
        seriesId: series.id,
        season,
        episode: String(ep.episode),
        tmdb: series.tmdb?.id ? String(series.tmdb.id) : '',
        ...(nextEp && {
          nextId: nextEp.id,
          nextUrl: encodeURIComponent(nextEp.url),
          nextSources: encodeURIComponent(JSON.stringify((nextEp.sources ?? []).map(source => source.url))),
          nextSourceLabels: encodeURIComponent(JSON.stringify(rotulosDe(nextEp.sources))),
          nextTitle: `${series.name} - T${nextSeason} E${nextEp.episode}`,
          nextSeason,
          nextEpisode: String(nextEp.episode),
        }),
      }
    });
  }, [series, router, setSeriesProgress]);

  const handleContinue = useCallback(() => {
    if (!series || !progress) return;
    const seasonEps = series.episodes?.[progress.season.toString()];
    const ep = seasonEps?.find(e => e.episode === progress.episode);
    if (ep) {
      handlePlayEpisode(ep, progress.season.toString());
    }
  }, [series, progress, handlePlayEpisode]);

  /** O episódio que o botão "Transmitir" envia: o de onde a pessoa parou. */
  const castPayload = useCallback(() => {
    if (!series) return null;
    const ep = progress
      ? series.episodes?.[progress.season.toString()]?.find(e => e.episode === progress.episode)
      : episodes[0];
    const season = progress ? progress.season.toString() : selectedSeason;
    if (!ep?.url) return null;
    const parsed = parseVodId(series.id);
    return {
      url: ep.url,
      title: `${series.name} - T${season} E${ep.episode}${ep.name ? ` · ${ep.name}` : ''}`,
      poster: series.tmdb?.posterHD || series.tmdb?.poster,
      key: series.id,
      letter: parsed?.letter || '',
      year: parsed?.year || series.tmdb?.year || '',
      isSeries: true,
      temporada: Number(season) || 1,
      episodio: ep.episode,
      startTime: progress?.progress,
    };
  }, [series, progress, episodes, selectedSeason]);

  const handleActorPress = useCallback((actor: CastMember) => {
    router.push({
      pathname: '/actor/[id]',
      params: { id: actor.id.toString(), name: actor.name, photo: actor.photo || '' }
    });
  }, [router]);

  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  if (!series) {
    return (
      <View style={[styles.container, styles.center]}>
        <Ionicons name="tv-outline" size={64} color={Colors.textSecondary} />
        <Text style={styles.errorText}>Série não encontrada</Text>
        <TouchableOpacity style={styles.backBtn} onPress={handleBack}>
          <Text style={styles.backBtnText}>Voltar</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const tmdb = series.tmdb;
  const logo = series.episodes?.['1']?.[0]?.logo || tmdb?.poster || '';

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
      
      <ScrollView 
        style={styles.scroll}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        {/* Hero Section */}
        <View style={styles.hero}>
          <Image
            source={{ uri: tmdb?.backdrop || logo }}
            style={styles.backdrop}
            contentFit="cover"
            cachePolicy="memory-disk"
          />
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.5)', Colors.background]}
            style={styles.heroGradient}
          />
          
          {/* Back Button */}
          <TouchableOpacity 
            style={[styles.headerButton, { top: insets.top + 10 }]}
            onPress={handleBack}
          >
            <Ionicons name="arrow-back" size={24} color={Colors.text} />
          </TouchableOpacity>
          
          {/* Title + Info */}
          <View style={styles.heroContent}>
            <Image
              source={{ uri: tmdb?.poster || logo }}
              style={styles.poster}
              contentFit="cover"
              cachePolicy="memory-disk"
            />
            <View style={styles.heroInfo}>
              <Text style={styles.title} numberOfLines={2}>
                {tmdb?.title || series.name}
              </Text>
              <View style={styles.metaRow}>
                {seasons.length > 0 && (
                  <Text style={styles.metaText}>
                    {seasons.length} Temporada{seasons.length > 1 ? 's' : ''}
                  </Text>
                )}
                {seasons.length === 0 && series.totalSeasons != null && (
                  <Text style={styles.metaText}>
                    {series.totalSeasons} Temporada{series.totalSeasons > 1 ? 's' : ''}
                  </Text>
                )}
                {!!tmdb?.rating && (
                  <View style={styles.ratingBadge}>
                    <Ionicons name="star" size={12} color="#FFD700" />
                    <Text style={styles.ratingText}>{tmdb.rating.toFixed(1)}</Text>
                  </View>
                )}
              </View>
              {/* Ano, duração do episódio e classificação: o mesmo que a
                  tela de filme mostra, e que aqui não aparecia. */}
              <View style={styles.badges}>
                {!!tmdb?.year && (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{tmdb.year}</Text>
                  </View>
                )}
                {!!tmdb?.runtime && (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{tmdb.runtime} min/ep</Text>
                  </View>
                )}
                {!!tmdb?.certification && (
                  <View style={[styles.badge, { borderColor: getCertColor(tmdb.certification) }]}>
                    <Text style={[styles.badgeText, { color: getCertColor(tmdb.certification) }]}>
                      {tmdb.certification}
                    </Text>
                  </View>
                )}
              </View>
            </View>
          </View>
        </View>
        
        {/* Action Buttons */}
        <View style={styles.actions}>
          {progress ? (
            <TouchableOpacity style={styles.continueButton} onPress={handleContinue}>
              <View style={styles.continueButtonContent}>
                <Ionicons name="play" size={24} color="#000" />
                <Text style={styles.continueText}>
                  Continuar T{progress.season} E{progress.episode}
                </Text>
              </View>
              {progress.progress && progress.duration && (
                <View style={styles.continueProgressContainer}>
                  <View style={[styles.continueProgressFill, { width: `${(progress.progress / progress.duration) * 100}%` }]} />
                </View>
              )}
            </TouchableOpacity>
          ) : (
            <TouchableOpacity 
              style={styles.playButton} 
              onPress={() => episodes[0] && handlePlayEpisode(episodes[0], selectedSeason)}
            >
              <Ionicons name="play" size={24} color="#000" />
              <Text style={styles.playText}>Assistir</Text>
            </TouchableOpacity>
          )}
          
          <TouchableOpacity
            style={[styles.iconButton, favorite && styles.iconButtonActive]}
            onPress={handleFavorite}
          >
            <Ionicons
              name={favorite ? 'heart' : 'heart-outline'}
              size={24}
              color={favorite ? '#FF4757' : Colors.text}
            />
          </TouchableOpacity>

          <CastAction resolve={castPayload} style={styles.iconButton} />
        </View>
        
        {/* Gêneros */}
        {!!tmdb?.genres?.length && (
          <View style={styles.genres}>
            {tmdb.genres.map((genre, i) => (
              <View key={i} style={styles.genreChip}>
                <Text style={styles.genreText}>{genre}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Sinopse */}
        {tmdb?.overview && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Sinopse</Text>
            <Text
              style={styles.overview}
              numberOfLines={overviewExpanded ? undefined : 3}
            >
              {tmdb.overview}
            </Text>
            {tmdb.overview.length > 150 && (
              <TouchableOpacity
                onPress={() => setOverviewExpanded(v => !v)}
                style={styles.seeMoreBtn}
                activeOpacity={0.7}
              >
                <Text style={styles.seeMoreText}>
                  {overviewExpanded ? 'Ver menos' : 'Ver mais'}
                </Text>
                <Ionicons
                  name={overviewExpanded ? 'chevron-up' : 'chevron-down'}
                  size={14}
                  color={Colors.primary}
                />
              </TouchableOpacity>
            )}

            {/* Quem assina, como na tela de filme. */}
            <View style={styles.metaInfo}>
              {!!tmdb.director && (
                <Text style={styles.metaInfoText}>
                  <Text style={styles.metaLabel}>Criação: </Text>{tmdb.director}
                </Text>
              )}
              {!!tmdb.writer && (
                <Text style={styles.metaInfoText}>
                  <Text style={styles.metaLabel}>Roteiro: </Text>{tmdb.writer}
                </Text>
              )}
              {!!tmdb.productionCompany && (
                <Text style={styles.metaInfoText}>
                  <Text style={styles.metaLabel}>Produção: </Text>{tmdb.productionCompany}
                </Text>
              )}
            </View>
          </View>
        )}

        {/* Cast */}
        {tmdb?.cast && tmdb.cast.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Elenco</Text>
            <FlatList
              data={tmdb.cast}
              keyExtractor={(item) => item.id.toString()}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: Spacing.lg }}
              renderItem={({ item: actor }) => (
                <TouchableOpacity 
                  style={styles.castCard}
                  onPress={() => handleActorPress(actor)}
                >
                  <Image
                    source={{ uri: actor.photo || '' }}
                    style={styles.castPhoto}
                    contentFit="cover"
                    cachePolicy="memory-disk"
                  />
                  <Text style={styles.castName} numberOfLines={1}>{actor.name}</Text>
                  <Text style={styles.castCharacter} numberOfLines={1}>{actor.character}</Text>
                </TouchableOpacity>
              )}
            />
          </View>
        )}
        
        {/* Seletor de Temporadas */}
        <View style={styles.section}>
          <View style={styles.seasonHeader}>
            <Text style={styles.sectionTitle}>Temporadas</Text>
            {series && (
              <TouchableOpacity
                style={styles.downloadSeasonBtn}
                onPress={() => {
                  const seasonNum = parseInt(selectedSeason);
                  downloadManager.enqueueSeasonAll(series, seasonNum).catch((e: any) => {
                    Alert.alert('Download T' + selectedSeason, e.message ?? 'Não foi possível enfileirar.');
                  });
                }}
              >
                <Ionicons name="download-outline" size={14} color={Colors.primary} />
                <Text style={styles.downloadSeasonText}>Baixar T{selectedSeason}</Text>
              </TouchableOpacity>
            )}
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.seasonsRow}
          >
            {seasons.map((s) => (
              <TouchableOpacity
                key={s}
                style={[
                  styles.seasonChip,
                  selectedSeason === s && styles.seasonChipActive
                ]}
                onPress={() => setSelectedSeason(s)}
              >
                <Text style={[
                  styles.seasonChipText,
                  selectedSeason === s && styles.seasonChipTextActive
                ]}>
                  T{s}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

      <SourceSheet
        visible={!!sourceSheet}
        title={sourceSheet
          ? `Baixar · T${selectedSeason} E${sourceSheet.episode}`
          : 'Baixar'}
        sources={sourceSheet?.sources ?? []}
        onClose={() => setSourceSheet(null)}
        onPick={(url) => {
          const ep = sourceSheet;
          if (!ep || !series) return;
          downloadManager
            .enqueueEpisode(series, ep, parseInt(selectedSeason), url)
            .catch((e: any) => {
              if (e?.message === 'HLS_NOT_SUPPORTED') {
                Alert.alert('Baixar', 'Essa fonte é uma transmissão em pedaços: dá para assistir, não para baixar.');
              } else if (e?.message !== 'ALREADY_DOWNLOADED' && e?.message !== 'ALREADY_QUEUED') {
                Alert.alert('Baixar', 'Não foi possível iniciar o download.');
              }
            });
        }}
      />
        </View>
        
        {/* Lista de Episódios */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            Episódios ({episodes.length})
          </Text>
          {episodes.map((ep) => (
            <View
              key={ep.id}
              style={[
                styles.episodeCard,
                progress?.episodeId === ep.id && styles.episodeCardActive
              ]}
            >
              <TouchableOpacity
                style={styles.episodeNumber}
                onPress={() => handlePlayEpisode(ep, selectedSeason)}
              >
                <Text style={styles.episodeNumberText}>{ep.episode}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.episodeInfo}
                onPress={() => handlePlayEpisode(ep, selectedSeason)}
              >
                <Text style={styles.episodeName} numberOfLines={1}>
                  {ep.name || `Episódio ${ep.episode}`}
                </Text>
                {(() => {
                  const epProgress = useMediaStore.getState().watchHistory.find(h => h.id === ep.id);
                  if (epProgress?.progress && epProgress?.duration) {
                    const pct = (epProgress.progress / epProgress.duration) * 100;
                    return (
                      <View style={styles.epProgressRow}>
                        <View style={styles.epProgressContainer}>
                          <View style={[styles.epProgressFill, { width: `${pct}%` }]} />
                        </View>
                        <Text style={styles.epProgressPct}>{Math.round(pct)}%</Text>
                      </View>
                    );
                  }
                  return progress?.episodeId === ep.id ? (
                    <Text style={styles.episodeContinue}>Continuar assistindo</Text>
                  ) : null;
                })()}
              </TouchableOpacity>
              <CastAction
                size={22}
                color={Colors.textSecondary}
                resolve={() => {
                  if (!series || !ep.url) return null;
                  const parsed = parseVodId(series.id);
                  return {
                    url: ep.url,
                    title: `${series.name} - T${selectedSeason} E${ep.episode}` +
                      (ep.name ? ` · ${ep.name}` : ''),
                    poster: series.tmdb?.posterHD || series.tmdb?.poster,
                    key: series.id,
                    letter: parsed?.letter || '',
                    year: parsed?.year || series.tmdb?.year || '',
                    isSeries: true,
                    temporada: Number(selectedSeason) || 1,
                    episodio: ep.episode,
                  };
                }}
              />
              {series && (
                <DownloadButton
                  itemId={ep.id}
                  size="small"
                  onDownload={async () => {
                    // Episódio com mais de uma fonte: quem escolhe é quem baixa.
                    if ((ep.sources?.length ?? 0) > 1) {
                      setSourceSheet(ep);
                      return;
                    }
                    const fonte = primeiraFonteBaixavel(ep.sources, ep.url);
                    if (!fonte) throw new Error('HLS_NOT_SUPPORTED');
                    await downloadManager.enqueueEpisode(
                      series, ep, parseInt(selectedSeason), fonte);
                  }}
                />
              )}
              <TouchableOpacity onPress={() => handlePlayEpisode(ep, selectedSeason)}>
                <Ionicons name="play-circle" size={32} color={Colors.primary} />
              </TouchableOpacity>
            </View>
          ))}
        </View>
        
        {/* Bottom padding */}
        <View style={{ height: insets.bottom + 40 }} />
      </ScrollView>
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
  scroll: {
    flex: 1,
  },
  hero: {
    height: height * 0.4,
    position: 'relative',
  },
  backdrop: {
    width: '100%',
    height: '100%',
  },
  heroGradient: {
    ...StyleSheet.absoluteFill,
  },
  headerButton: {
    position: 'absolute',
    left: Spacing.lg,
    backgroundColor: 'rgba(0,0,0,0.5)',
    padding: Spacing.sm,
    borderRadius: BorderRadius.full,
    zIndex: 10,
  },
  heroContent: {
    position: 'absolute',
    bottom: 0,
    left: Spacing.lg,
    right: Spacing.lg,
    flexDirection: 'row',
    gap: Spacing.md,
    alignItems: 'flex-end',
    paddingBottom: Spacing.lg,
  },
  poster: {
    width: 90,
    height: 135,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.surface,
  },
  heroInfo: {
    flex: 1,
    paddingBottom: Spacing.xs,
  },
  title: {
    color: Colors.text,
    fontSize: Typography.h2.fontSize,
    fontWeight: '700',
    lineHeight: 28,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginTop: Spacing.xs,
  },
  metaText: {
    color: Colors.textSecondary,
    fontSize: Typography.caption.fontSize,
  },
  ratingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  ratingText: {
    color: '#FFD700',
    fontSize: Typography.caption.fontSize,
    fontWeight: '600',
  },
  actions: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    gap: Spacing.md,
  },
  playButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    gap: Spacing.sm,
  },
  playText: {
    color: '#000',
    fontSize: Typography.body.fontSize,
    fontWeight: '700',
  },
  continueButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    gap: Spacing.sm,
  },
  continueText: {
    color: '#000',
    fontSize: Typography.body.fontSize,
    fontWeight: '700',
  },
  iconButton: {
    backgroundColor: Colors.surface,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
  },
  iconButtonActive: {
    backgroundColor: 'rgba(255,71,87,0.2)',
  },
  section: {
    marginTop: Spacing.lg,
    paddingHorizontal: Spacing.lg,
  },
  badges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
    marginTop: Spacing.sm,
  },
  badge: {
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: BorderRadius.sm,
  },
  badgeText: {
    color: Colors.textSecondary,
    fontSize: 11,
    fontWeight: '600',
  },
  genres: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    marginTop: Spacing.lg,
  },
  genreChip: {
    backgroundColor: Colors.surface,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
  },
  genreText: {
    color: Colors.textSecondary,
    fontSize: 12,
  },
  metaInfo: {
    marginTop: Spacing.md,
    gap: 4,
  },
  metaInfoText: {
    color: Colors.textSecondary,
    fontSize: Typography.caption.fontSize,
  },
  metaLabel: {
    color: Colors.text,
    fontWeight: '600',
  },
  sectionTitle: {
    color: Colors.text,
    fontSize: Typography.h3.fontSize,
    fontWeight: '700',
    marginBottom: Spacing.md,
  },
  overview: {
    color: Colors.textSecondary,
    fontSize: Typography.body.fontSize,
    lineHeight: 22,
  },
  seeMoreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: Spacing.xs,
  },
  seeMoreText: {
    color: Colors.primary,
    fontSize: Typography.caption.fontSize,
    fontWeight: '600',
  },
  seasonHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  downloadSeasonBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    backgroundColor: 'rgba(99,102,241,0.12)',
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  downloadSeasonText: {
    color: Colors.primary,
    fontSize: 12,
    fontWeight: '600',
  },
  seasonsRow: {
    gap: Spacing.sm,
  },
  seasonChip: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.surface,
  },
  seasonChipActive: {
    backgroundColor: Colors.primary,
  },
  seasonChipText: {
    color: Colors.textSecondary,
    fontWeight: '600',
    fontSize: Typography.body.fontSize,
  },
  seasonChipTextActive: {
    color: '#000',
  },
  episodeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    gap: Spacing.md,
  },
  episodeCardActive: {
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  episodeNumber: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  episodeNumberText: {
    color: Colors.text,
    fontSize: Typography.h3.fontSize,
    fontWeight: '700',
  },
  episodeInfo: {
    flex: 1,
  },
  episodeName: {
    color: Colors.text,
    fontSize: Typography.body.fontSize,
    fontWeight: '500',
  },
  episodeContinue: {
    color: Colors.primary,
    fontSize: Typography.caption.fontSize,
    marginTop: 2,
  },
  errorText: {
    color: Colors.textSecondary,
    fontSize: Typography.body.fontSize,
    marginTop: Spacing.md,
  },
  backBtn: {
    marginTop: Spacing.lg,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
  },
  backBtnText: {
    color: '#000',
    fontWeight: '600',
  },
  // Cast Styles
  castCard: {
    width: 80,
    marginRight: Spacing.md,
    alignItems: 'center',
  },
  castPhoto: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: Colors.surface,
  },
  castName: {
    color: Colors.text,
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: Spacing.xs,
  },
  castCharacter: {
    color: Colors.textSecondary,
    fontSize: 10,
    textAlign: 'center',
  },
  continueButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  continueProgressContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 4,
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderBottomLeftRadius: BorderRadius.md,
    borderBottomRightRadius: BorderRadius.md,
    overflow: 'hidden',
  },
  continueProgressFill: {
    height: '100%',
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  epProgressContainer: {
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 1.5,
    overflow: 'hidden',
    flex: 1,
  },
  epProgressFill: {
    height: '100%',
    backgroundColor: Colors.primary,
  },
  epProgressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
    width: '90%',
  },
  epProgressPct: {
    color: Colors.textSecondary,
    fontSize: 10,
    fontWeight: '700',
  },
});

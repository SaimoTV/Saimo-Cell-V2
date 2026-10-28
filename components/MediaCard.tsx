import React, { memo, useCallback, useState, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  Modal,
  Alert,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useRemoteMediaClient } from 'react-native-google-cast';

import type { MediaItem } from '../types';
import { Colors, BorderRadius, Spacing, Typography } from '../constants/Colors';
import { useMediaStore } from '../stores/mediaStore';
import { getCinemetaData } from '../services/saimoSources';

interface MediaCardProps {
  item: MediaItem & { episodes?: any };
  size?: 'small' | 'medium' | 'large';
  cardWidth?: number;
}

const { width } = Dimensions.get('window');

/** Capas já achadas nesta sessão: um cartão que volta à tela mostra a certa na hora. */
const capasConhecidas = new Map<string, string>();

const SIZES = {
  small: { width: width * 0.28, height: width * 0.28 * 1.5 },
  medium: { width: width * 0.35, height: width * 0.35 * 1.5 },
  large: { width: width * 0.42, height: width * 0.42 * 1.5 },
};

// Cor da classificação indicativa
const getCertificationColor = (cert?: string) => {
  if (!cert) return Colors.textSecondary;
  const c = cert.toUpperCase();
  if (c === 'L' || c === 'LIVRE') return '#10B981'; // Verde
  if (c === '10') return '#3B82F6'; // Azul
  if (c === '12') return '#F59E0B'; // Amarelo
  if (c === '14') return '#F97316'; // Laranja
  if (c === '16' || c === '18') return '#EF4444'; // Vermelho
  return Colors.textSecondary;
};

// Cor da nota
const getRatingColor = (rating?: number) => {
  if (!rating) return Colors.textSecondary;
  if (rating >= 7) return '#FFD700'; // Dourado
  if (rating >= 5) return '#F59E0B'; // Amarelo
  return '#EF4444'; // Vermelho
};

const MediaCard = memo(({ item, size = 'medium', cardWidth }: MediaCardProps) => {
  const router = useRouter();
  const client = useRemoteMediaClient();
  // Seletores e não a store inteira: assinada inteira, cada gravação de
  // progresso (a cada 5 s durante um filme) redesenhava todos os cartões.
  const addFavorite = useMediaStore((s) => s.addFavorite);
  const removeFavorite = useMediaStore((s) => s.removeFavorite);
  const ehFavorito = useMediaStore((s) => s.favoriteIds.has(item.id));
  const [favorite, setFavorite] = useState(ehFavorito);
  useEffect(() => { setFavorite(ehFavorito); }, [ehFavorito]);

  // Determine active progress (movie or series)
  const hasSeries =
    item.type === 'tv' ||
    (item.totalSeasons != null && item.totalSeasons > 0) ||
    (item.episodes != null && Object.keys(item.episodes).length > 0);

  const seriesProgress = useMediaStore(s => s.seriesProgress.find(p => p.seriesId === item.id));
  const movieProgress = useMediaStore(s => s.watchHistory.find(h => h.id === item.id));

  const activeProgress = hasSeries ? seriesProgress : movieProgress;

  const progressPercent = (activeProgress?.progress && activeProgress?.duration)
    ? (activeProgress.progress / activeProgress.duration) * 100
    : 0;
  const [showOptions, setShowOptions] = useState(false);

  const dimensions = cardWidth
    ? { width: cardWidth, height: Math.round(cardWidth * 1.5) }
    : SIZES[size];
  const tmdb = item.tmdb;
  const chaveCapa = `${hasSeries ? 's' : 'm'}:${item.name}`;
  // A capa achada fica presa ao título a que pertence. A lista reaproveita o
  // mesmo cartão para outro título ao rolar, e a capa guardada no estado era a
  // do anterior: aparecia a errada e, quando a busca voltava, a certa.
  const [achada, setAchada] = useState<{ chave: string; url: string } | null>(null);
  const remotePoster = tmdb?.poster
    || (achada?.chave === chaveCapa ? achada.url : '')
    || capasConhecidas.get(chaveCapa)
    || '';

  // O catálogo compartilhado não guarda imagens. Busca somente os cards que
  // realmente chegaram à tela, como os apps macOS e Android TV fazem.
  useEffect(() => {
    if (tmdb?.poster || capasConhecidas.has(chaveCapa)) return;
    let active = true;
    getCinemetaData(item.name, hasSeries).then(meta => {
      if (!meta.poster) return;
      capasConhecidas.set(chaveCapa, meta.poster);
      if (active) setAchada({ chave: chaveCapa, url: meta.poster });
    });
    return () => { active = false; };
  }, [chaveCapa, item.name, hasSeries, tmdb?.poster]);

  const handlePress = useCallback(() => {
    if (hasSeries) {
      // Série com episódios -> tela de série
      router.push({
        pathname: '/series/[id]' as any,
        params: { id: item.id }
      });
    } else {
      // Filme ou conteúdo simples -> tela de mídia
      router.push({
        pathname: '/media/[id]',
        params: { 
            id: item.id,
            title: item.tmdb?.title || item.name,
            poster: item.tmdb?.poster,
            backdrop: item.tmdb?.backdrop,
            overview: item.tmdb?.overview,
            year: item.tmdb?.year,
            rating: item.tmdb?.rating?.toString(),
            genres: item.tmdb?.genres?.join(','),
        }
      });
    }
  }, [item.id, router, hasSeries]);

  const handleFavorite = useCallback((e: any) => {
    e.stopPropagation();
    if (favorite) {
      removeFavorite(item.id);
    } else {
      addFavorite(item.id);
    }
    setFavorite(!favorite);
  }, [item.id, favorite, addFavorite, removeFavorite]);

  const handleLongPress = useCallback(() => {
    setShowOptions(true);
  }, []);

  const handleOptionOpen = useCallback(() => {
    setShowOptions(false);
    handlePress();
  }, [handlePress]);

  const handleOptionCast = useCallback(() => {
    setShowOptions(false);
    if (!item.url) return;
    if (!client) {
      Alert.alert('Google Cast', 'Nenhum dispositivo Cast conectado. Conecte um Chromecast antes de transmitir.');
      return;
    }
    const title = item.tmdb?.title || item.name;
    client.loadMedia({
      mediaInfo: {
        contentUrl: item.url,
        metadata: {
          type: 'movie',
          title,
          images: item.tmdb?.poster ? [{ url: item.tmdb.poster }] : [],
        },
      },
      autoplay: true,
    });
  }, [client, item]);

  const handleOptionFavorite = useCallback(() => {
    setShowOptions(false);
    if (favorite) {
      removeFavorite(item.id);
    } else {
      addFavorite(item.id);
    }
    setFavorite(f => !f);
  }, [item.id, favorite, addFavorite, removeFavorite]);

  return (
    <TouchableOpacity
      style={[styles.container, { width: dimensions.width, height: dimensions.height }]}
      onPress={handlePress}
      onLongPress={handleLongPress}
      delayLongPress={600}
      activeOpacity={0.8}
    >
      {/* Poster */}
      <Image
        source={{ uri: remotePoster }}
        style={styles.poster}
        contentFit="cover"
        transition={0}
        cachePolicy="memory-disk"
        recyclingKey={item.id}
      />
      
      {/* Background Progress Fill Overlay */}
      {progressPercent > 0 && progressPercent < 95 && (
        <View 
          style={[
            styles.bgProgressFill, 
            { width: `${progressPercent}%` }
          ]} 
          pointerEvents="none" 
        />
      )}

      {/* Bottom-only overlay for title legibility */}
      <View style={styles.gradient} pointerEvents="none" />
      
      {/* Rating Badge */}
      {tmdb && (tmdb.rating ?? 0) > 0 && (
        <View style={[styles.ratingBadge, { backgroundColor: getRatingColor(tmdb.rating) }]}>
          <Ionicons name="star" size={10} color="#000" />
          <Text style={styles.ratingText}>{tmdb.rating!.toFixed(1)}</Text>
        </View>
      )}
      
      {/* Certification Badge */}
      {tmdb?.certification && (
        <View style={[styles.certBadge, { borderColor: getCertificationColor(tmdb?.certification) }]}>
          <Text style={[styles.certText, { color: getCertificationColor(tmdb?.certification) }]}>
            {tmdb?.certification}
          </Text>
        </View>
      )}
      
      {/* Favorite Button */}
      <TouchableOpacity 
        style={[styles.favoriteButton, favorite && styles.favoriteActive]}
        onPress={handleFavorite}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <Ionicons 
          name={favorite ? 'heart' : 'heart-outline'} 
          size={18} 
          color={favorite ? '#FF4757' : 'white'} 
        />
      </TouchableOpacity>
      
      {/* Progress Mini Badge */}
      {progressPercent > 0 && progressPercent < 95 && (
        <View style={styles.miniProgressBadge}>
          <Text style={styles.miniProgressText}>
            {hasSeries && seriesProgress ? `T${seriesProgress.season}E${seriesProgress.episode} · ` : ''}
            {Math.round(progressPercent)}%
          </Text>
        </View>
      )}

      {/* Type Badge (Movie/TV) */}
      <View style={styles.typeBadge}>
        <Ionicons 
          name={item.type === 'movie' ? 'film-outline' : 'tv-outline'} 
          size={12} 
          color="white" 
        />
      </View>
      
      {/* Title */}
      <View style={styles.titleContainer}>
        <Text style={styles.title} numberOfLines={2}>
          {tmdb?.title || item.name || 'Sem título'}
        </Text>
        {tmdb?.year && typeof tmdb.year === 'string' && tmdb.year.length > 0 && (
          <Text style={styles.year}>{tmdb.year}</Text>
        )}
      </View>

      {/* Long Press Action Sheet */}
      <Modal
        visible={showOptions}
        transparent
        animationType="slide"
        onRequestClose={() => setShowOptions(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          onPress={() => setShowOptions(false)}
          activeOpacity={1}
        >
          <View style={styles.actionSheet}>
            <View style={styles.actionSheetHandle} />
            <Text style={styles.actionSheetTitle} numberOfLines={1}>
              {tmdb?.title || item.name}
            </Text>

            <TouchableOpacity style={styles.actionItem} onPress={handleOptionOpen}>
              <Ionicons name="play-circle-outline" size={24} color={Colors.text} />
              <Text style={styles.actionItemText}>
                {hasSeries ? 'Ver episódios' : 'Assistir'}
              </Text>
            </TouchableOpacity>

            {!hasSeries && (
              <TouchableOpacity style={styles.actionItem} onPress={handleOptionCast}>
                <MaterialIcons name="cast" size={24} color={Colors.text} />
                <Text style={styles.actionItemText}>Transmitir</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity style={styles.actionItem} onPress={handleOptionFavorite}>
              <Ionicons
                name={favorite ? 'heart' : 'heart-outline'}
                size={24}
                color={favorite ? '#FF4757' : Colors.text}
              />
              <Text style={styles.actionItemText}>
                {favorite ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionItem, styles.cancelItem]}
              onPress={() => setShowOptions(false)}
            >
              <Text style={styles.cancelText}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </TouchableOpacity>
  );
}, (prev: MediaCardProps, next: MediaCardProps) =>
  prev.item.id === next.item.id &&
  prev.item.tmdb?.rating === next.item.tmdb?.rating &&
  prev.item.tmdb?.poster === next.item.tmdb?.poster
);

MediaCard.displayName = 'MediaCard';

const styles = StyleSheet.create({
  container: {
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
    backgroundColor: Colors.surface,
    marginRight: Spacing.sm,
  },
  poster: {
    width: '100%',
    height: '100%',
    backgroundColor: Colors.surface,
  },
  gradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '40%',
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  ratingBadge: {
    position: 'absolute',
    top: Spacing.sm,
    left: Spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: BorderRadius.sm,
    gap: 2,
  },
  ratingText: {
    color: '#000',
    fontSize: 11,
    fontWeight: '700',
  },
  certBadge: {
    position: 'absolute',
    bottom: 52,
    right: Spacing.sm,
    borderWidth: 1.5,
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
    backgroundColor: 'rgba(0,0,0,0.6)',
    zIndex: 2,
  },
  certText: {
    fontSize: 10,
    fontWeight: '700',
  },
  favoriteButton: {
    position: 'absolute',
    top: Spacing.sm,
    right: Spacing.sm,
    backgroundColor: 'rgba(0,0,0,0.5)',
    padding: 6,
    borderRadius: BorderRadius.full,
    zIndex: 3,
  },
  favoriteActive: {
    backgroundColor: 'rgba(255,71,87,0.3)',
  },
  typeBadge: {
    position: 'absolute',
    bottom: 52,
    left: Spacing.sm,
    backgroundColor: 'rgba(0,0,0,0.6)',
    padding: 4,
    borderRadius: BorderRadius.sm,
    zIndex: 2,
  },
  titleContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.md,
  },
  title: {
    color: Colors.text,
    fontSize: Typography.caption.fontSize,
    fontWeight: '600',
    lineHeight: 16,
  },
  year: {
    color: Colors.textSecondary,
    fontSize: 10,
    marginTop: 2,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  actionSheet: {
    backgroundColor: Colors.cardBg,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    paddingBottom: Spacing.xl,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
  },
  actionSheetHandle: {
    width: 40,
    height: 4,
    backgroundColor: Colors.textSecondary,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: Spacing.md,
    opacity: 0.4,
  },
  actionSheetTitle: {
    color: Colors.textSecondary,
    fontSize: Typography.caption.fontSize,
    fontWeight: '600',
    marginBottom: Spacing.md,
  },
  actionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    gap: Spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.surface,
  },
  actionItemText: {
    color: Colors.text,
    fontSize: Typography.body.fontSize,
  },
  cancelItem: {
    justifyContent: 'center',
    marginTop: Spacing.sm,
  },
  cancelText: {
    color: Colors.textSecondary,
    fontSize: Typography.body.fontSize,
    fontWeight: '600',
    textAlign: 'center',
    flex: 1,
  },
  progressBarContainer: {
    position: 'absolute',
    bottom: 50,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.2)',
    zIndex: 5,
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: Colors.primary,
  },
  bgProgressFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(99, 102, 241, 0.25)', // Primary with transparency
    zIndex: 1,
  },
  miniProgressBadge: {
    position: 'absolute',
    bottom: 53,
    left: Spacing.sm,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.5)',
    zIndex: 6,
  },
  miniProgressText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '800',
  },
});

export default MediaCard;

import React, { memo, useCallback, useState, useEffect, useRef, useMemo } from 'react';
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

import type { Channel, CurrentProgram } from '../types';
import { Colors, BorderRadius, Spacing, Typography, Shadows } from '../constants/Colors';
import { useFavoritesStore } from '../stores/favoritesStore';
import { useSettingsStore, type SettingsStore } from '../stores/settingsStore';
import { getCurrentProgram, onEPGUpdate } from '../services/epgService';
import { useConnectStore } from '../stores/connectStore';
import { saimoConnect } from '../services/saimoConnect';

interface ChannelCardProps {
  channel: Channel;
}

const { width, height } = Dimensions.get('window');
const CARD_WIDTH = (width - Spacing.lg * 3) / 2;

// Stable selectors to prevent unnecessary re-renders
const selectShowEPG = (state: SettingsStore) => state.showEPG;
const selectShowChannelNumber = (state: SettingsStore) => state.showChannelNumber;

const ChannelCard = memo(({ channel }: ChannelCardProps) => {
  const router = useRouter();
  // Seletores e não a store inteira: assinada inteira, cada favorito marcado
  // em qualquer lugar redesenhava todos os cartões da lista.
  const toggleFavorite = useFavoritesStore((s) => s.toggleFavorite);
  const ehFavorito = useFavoritesStore((s) => s.isFavorite(channel.id));
  const showEPG = useSettingsStore(selectShowEPG);
  const showChannelNumber = useSettingsStore(selectShowChannelNumber);
  const client = useRemoteMediaClient();

  const [favorite, setFavorite] = useState(ehFavorito);
  const [currentEPG, setCurrentEPG] = useState<CurrentProgram | null>(null);
  const [showOptions, setShowOptions] = useState(false);
  const isMountedRef = useRef(true);

  // Carrega EPG do cache e escuta atualizações (prefetch feito pelo index.tsx)
  // Remove interval per card - shared listener in EPG service handles updates
  useEffect(() => {
    isMountedRef.current = true;

    if (showEPG) {
      setCurrentEPG(getCurrentProgram(channel.id));
    }

    // Escuta atualizações do EPG (quando fetch terminar, atualiza o card)
    const unsubscribe = onEPGUpdate((updatedId) => {
      if (isMountedRef.current && updatedId === channel.id && showEPG) {
        setCurrentEPG(getCurrentProgram(channel.id));
      }
    });

    return () => {
      isMountedRef.current = false;
      unsubscribe();
    };
  }, [channel.id, showEPG]);

  // Sincroniza estado de favorito
  useEffect(() => {
    setFavorite(ehFavorito);
  }, [ehFavorito]);

  const handlePress = useCallback(() => {
    router.push({
      pathname: '/player/[id]',
      params: {
        id: channel.id,
        url: channel.url,
        name: channel.name,
        category: channel.category,
        logo: channel.logo ?? '',
        channelNumber: channel.channelNumber ?? '',
      },
    });
  }, [channel.id, router]);

  const handleLongPress = useCallback(() => {
    setShowOptions(true);
  }, []);

  const handleOptionOpen = useCallback(() => {
    setShowOptions(false);
    router.push({ pathname: '/player/[id]', params: { id: channel.id } });
  }, [channel.id, router]);

  const handleOptionCast = useCallback(() => {
    setShowOptions(false);
    const store = useConnectStore.getState();
    if (store.status === 'connected' && store.connectedTv) {
      if (store.tvState?.multi) {
        Alert.alert(
          'Sintonizar na TV',
          `Em qual tela deseja colocar "${channel.name}"?`,
          [
            {
              text: 'Canal 1 (Esquerda)',
              onPress: () => saimoConnect.tuneChannel(channel.name, 0),
            },
            {
              text: 'Canal 2 (Direita)',
              onPress: () => saimoConnect.tuneChannel(channel.name, 1),
            },
            { text: 'Cancelar', style: 'cancel' },
          ]
        );
        return;
      }
      saimoConnect.tuneChannel(channel.name);
      Alert.alert('Saimo Connect', `Sintonizando "${channel.name}" na ${store.connectedTv.name}...`);
      return;
    }

    if (!client) {
      store.setSheetVisible(true);
      return;
    }
    client.loadMedia({
      mediaInfo: {
        contentUrl: channel.url,
        metadata: {
          type: 'movie',
          title: channel.name,
          images: channel.logo ? [{ url: channel.logo }] : [],
        },
      },
      autoplay: true,
    });
  }, [client, channel]);

  const handleOptionFavorite = useCallback(() => {
    setShowOptions(false);
    toggleFavorite(channel.id);
    setFavorite((prev: boolean) => !prev);
  }, [channel.id, toggleFavorite]);

  const handleFavorite = useCallback(() => {
    toggleFavorite(channel.id);
    setFavorite((prev: boolean) => !prev);
  }, [channel.id, toggleFavorite]);

  return (
    <TouchableOpacity
      style={styles.container}
      onPress={handlePress}
      onLongPress={handleLongPress}
      delayLongPress={600}
      activeOpacity={0.7}
    >
      <View style={styles.imageContainer}>
        {channel.logo ? (
          <Image
            source={{ uri: channel.logo }}
            style={styles.logo}
            contentFit="contain"
            transition={0}
            cachePolicy="memory-disk"
            recyclingKey={channel.logo}
          />
        ) : (
          <View style={styles.placeholder}>
            <Ionicons name="tv-outline" size={32} color={Colors.textSecondary} />
            <Text style={styles.placeholderText}>{channel.name.charAt(0)}</Text>
          </View>
        )}
        
        <View style={styles.gradient} />

        {/* Número do canal */}
        {showChannelNumber && channel.channelNumber && (
          <View style={styles.numberBadge}>
            <Text style={styles.numberText}>{channel.channelNumber}</Text>
          </View>
        )}

        {/* Botão favoritar */}
        <TouchableOpacity 
          style={[styles.favoriteButton, favorite && styles.favoriteButtonActive]}
          onPress={handleFavorite}
          activeOpacity={0.7}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons 
            name={favorite ? 'heart' : 'heart-outline'} 
            size={22} 
            color={favorite ? '#FF4757' : Colors.text} 
          />
        </TouchableOpacity>
      </View>

      <View style={styles.info}>
        <Text style={styles.channelName} numberOfLines={1}>
          {channel.name}
        </Text>
        
        <Text style={styles.category} numberOfLines={1}>
          {channel.category}
        </Text>

        {/* EPG Info - só mostra se tiver no cache */}
        {showEPG && currentEPG?.current && (
          <View style={styles.epgContainer}>
            <View style={styles.liveIndicator}>
              <View style={styles.liveDot} />
              <Text style={styles.liveText}>AO VIVO</Text>
              {typeof currentEPG.remaining === 'number' && currentEPG.remaining > 0 && (
                <Text style={styles.remainingText}>{currentEPG.remaining}min</Text>
              )}
            </View>
            <Text style={styles.programTitle} numberOfLines={1}>
              {currentEPG.current.title}
            </Text>
            <View style={styles.progressBar}>
              <View 
                style={[
                  styles.progressFill, 
                  { width: `${currentEPG.progress}%` }
                ]} 
              />
            </View>
          </View>
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
              {channel.name}
            </Text>

            <TouchableOpacity style={styles.actionItem} onPress={handleOptionOpen}>
              <Ionicons name="play-circle-outline" size={24} color={Colors.text} />
              <Text style={styles.actionItemText}>Abrir</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.actionItem} onPress={handleOptionCast}>
              <MaterialIcons name="cast" size={24} color={Colors.text} />
              <Text style={styles.actionItemText}>Transmitir</Text>
            </TouchableOpacity>

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
}, (prevProps: ChannelCardProps, nextProps: ChannelCardProps) => {
  return prevProps.channel.id === nextProps.channel.id;
});

ChannelCard.displayName = 'ChannelCard';

const styles = StyleSheet.create({
  container: {
    width: CARD_WIDTH,
    backgroundColor: Colors.cardBg,
    borderRadius: BorderRadius.lg,
    ...Shadows.md,
  },
  imageContainer: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: Colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    borderTopLeftRadius: BorderRadius.lg,
    borderTopRightRadius: BorderRadius.lg,
  },
  logo: {
    width: '70%',
    height: '70%',
  },
  placeholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderText: {
    fontSize: 24,
    fontWeight: '700',
    color: Colors.textSecondary,
    marginTop: Spacing.xs,
  },
  gradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '50%',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  numberBadge: {
    position: 'absolute',
    top: Spacing.sm,
    left: Spacing.sm,
    backgroundColor: Colors.overlay,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
  },
  numberText: {
    color: Colors.text,
    fontSize: 11,
    fontWeight: '600',
  },
  favoriteButton: {
    position: 'absolute',
    top: Spacing.sm,
    right: Spacing.sm,
    backgroundColor: Colors.overlay,
    padding: Spacing.sm,
    borderRadius: BorderRadius.full,
  },
  favoriteButtonActive: {
    backgroundColor: 'rgba(255, 71, 87, 0.3)',
  },
  info: {
    padding: Spacing.md,
  },
  channelName: {
    color: Colors.text,
    fontSize: Typography.body.fontSize,
    fontWeight: '600',
    marginBottom: Spacing.xs,
  },
  category: {
    color: Colors.textSecondary,
    fontSize: Typography.caption.fontSize,
    marginBottom: Spacing.sm,
  },
  epgContainer: {
    marginTop: Spacing.xs,
  },
  liveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.xs,
    gap: Spacing.xs,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.live,
  },
  liveText: {
    color: Colors.live,
    fontSize: 9,
    fontWeight: '700',
  },
  remainingText: {
    color: Colors.textSecondary,
    fontSize: 9,
    marginLeft: 'auto',
  },
  programTitle: {
    color: Colors.textSecondary,
    fontSize: Typography.caption.fontSize,
    marginBottom: Spacing.xs,
  },
  progressBar: {
    height: 3,
    backgroundColor: Colors.progressBg,
    borderRadius: BorderRadius.xs,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: Colors.progressFill,
    borderRadius: BorderRadius.xs,
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
});

export default ChannelCard;

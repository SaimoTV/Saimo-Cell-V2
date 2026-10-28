import React, { memo, useMemo, useCallback, useEffect, useRef } from 'react';
import {
  View,
  StyleSheet,
  Text,
  Dimensions,
  Platform,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { FlashList, type FlashListRef } from '@shopify/flash-list';

import type { Channel } from '../types';
import { Colors, Spacing } from '../constants/Colors';
import ChannelCard from './ChannelCard';

interface ChannelListProps {
  channels: Channel[];
  /** A lista ainda está chegando: mostra a espera, e não "nenhum canal". */
  carregando?: boolean;
  /** Falta o endereço da lista de canais: estado vazio com atalho para Ajustes > Listas. */
  semEndereco?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
}

const { width } = Dimensions.get('window');
const CARD_WIDTH = (width - Spacing.lg * 3) / 2;

const ChannelList = memo(({ channels, carregando = false, semEndereco = false, refreshing = false, onRefresh }: ChannelListProps) => {
  const router = useRouter();
  // Divide canais em pares para layout de 2 colunas
  const rows = useMemo(() => {
    const result: Channel[][] = [];
    for (let i = 0; i < channels.length; i += 2) {
      result.push(channels.slice(i, i + 2));
    }
    return result;
  }, [channels]);

  // Trocar de categoria ou de busca volta ao topo. Sem isto a lista nova
  // abria na altura em que a anterior estava rolada — no fim, ou em branco.
  const lista = useRef<FlashListRef<Channel[]>>(null);
  const primeiro = channels[0]?.id;
  useEffect(() => {
    lista.current?.scrollToOffset({ offset: 0, animated: false });
  }, [primeiro, channels.length]);

  const renderRow = useCallback(({ item: row }: { item: Channel[] }) => (
    <View style={styles.row}>
      {row.map((channel) => (
        <ChannelCard key={channel.id} channel={channel} />
      ))}
      {row.length === 1 && <View style={{ width: CARD_WIDTH }} />}
    </View>
  ), []);

  if (channels.length === 0 && semEndereco) {
    return (
      <View style={styles.emptyContainer}>
        <Ionicons name="tv-outline" size={64} color={Colors.textSecondary} />
        <Text style={styles.emptyText}>Nenhum canal.</Text>
        <Text style={styles.emptyHint}>
          Informe o endereço da lista de canais em Ajustes {'>'} Listas.
        </Text>
        <TouchableOpacity
          style={styles.emptyButton}
          onPress={() => router.push('/(tabs)/settings' as any)}
          accessibilityRole="button"
          testID="canais-abrir-ajustes"
        >
          <Text style={styles.emptyButtonText}>Abrir Ajustes</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (channels.length === 0 && carregando) {
    return (
      <View style={styles.emptyContainer}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  if (channels.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Ionicons name="tv-outline" size={64} color={Colors.textSecondary} />
        <Text style={styles.emptyText}>Nenhum canal encontrado</Text>
      </View>
    );
  }

  return (
    <View style={styles.listContainer}>
      <FlashList
        ref={lista}
        data={rows}
        renderItem={renderRow}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
        keyExtractor={(item) => item[0].id}
        removeClippedSubviews={Platform.OS === 'android'}
        keyboardShouldPersistTaps="handled"
        refreshing={refreshing}
        onRefresh={onRefresh}
      />
    </View>
  );
});

ChannelList.displayName = 'ChannelList';

const styles = StyleSheet.create({
  listContainer: {
    flex: 1,
    minHeight: 200,
  },
  contentContainer: {
    padding: Spacing.lg,
    paddingBottom: 120, // Repassado via FlashList contentContainer
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: Spacing.xxxl * 2,
  },
  emptyHint: {
    color: Colors.textSecondary,
    fontSize: 14,
    marginTop: Spacing.sm,
    textAlign: 'center',
    paddingHorizontal: Spacing.xl,
  },
  emptyButton: {
    marginTop: Spacing.lg,
    backgroundColor: Colors.primary,
    borderRadius: 24,
    paddingHorizontal: 22,
    paddingVertical: 12,
  },
  emptyButtonText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  emptyText: {
    color: Colors.textSecondary,
    fontSize: 16,
    marginTop: Spacing.md,
  },
});

export default ChannelList;

import React, { useEffect, useMemo } from 'react';
import { View, StyleSheet, ActivityIndicator, Text, Pressable } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { Colors } from '../../constants/Colors';
import { useChannelStore } from '../../stores/channelStore';
import VideoPlayer from '../../components/VideoPlayer';
import type { Channel } from '../../types';

export default function PlayerScreen() {
  const params = useLocalSearchParams<{
    id: string;
    url?: string;
    name?: string;
    category?: string;
    logo?: string;
    channelNumber?: string;
  }>();
  const router = useRouter();
  const channels = useChannelStore(state => state.channels);
  const carregando = useChannelStore(state => state.isLoading);

  // Aberto por link com o app fechado: a lista só é baixada pela aba TV, e a
  // tela ficava preta para sempre esperando por ela.
  useEffect(() => {
    const loja = useChannelStore.getState();
    if (loja.channels.length === 0 && !loja.isLoading) void loja.fetchChannels();
  }, []);

  const channel = useMemo<Channel | null>(() => {
    // A lista Git já foi registrada aqui com DRM, headers e fontes reserva.
    // Fuzzy match for events and deep links:
    const slugLimpo = (params.id || '').replace(/remote-|-/g, '').toLowerCase();
    let remote = channels.find(ch => ch.id.replace(/remote-|-/g, '').toLowerCase() === slugLimpo);
    if (!remote) {
      remote = channels.find(ch => ch.name.replace(/[\s-]/g, '').toLowerCase() === slugLimpo);
    }
    
    if (remote) return remote;
    // Last resort: params only (no DRM info)
    if (params.url && params.name && params.category) {
      const num = params.channelNumber ? Number(params.channelNumber) : undefined;
      return {
        id: params.id,
        url: params.url,
        name: params.name,
        category: params.category,
        logo: params.logo ?? '',
        channelNumber: Number.isFinite(num) ? num : undefined,
      };
    }
    return null;
  }, [params.id, params.url, params.name, params.category, params.logo, params.channelNumber, channels]);

  if (!channel) {
    const esperando = carregando || channels.length === 0;
    return (
      <View style={[styles.container, styles.centro]}>
        {esperando ? (
          <ActivityIndicator size="large" color={Colors.primary} />
        ) : (
          <>
            <Text style={styles.aviso}>Canal não encontrado</Text>
            {/* Voltar leva à tela inicial: aberto por link, não há tela atrás. */}
            <Pressable
              style={styles.botao}
              onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
              accessibilityRole="button"
              accessibilityLabel="Voltar"
            >
              <Text style={styles.botaoTexto}>Voltar</Text>
            </Pressable>
          </>
        )}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <VideoPlayer channel={channel} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  centro: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  aviso: {
    color: Colors.text,
    fontSize: 16,
  },
  botao: {
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: Colors.primary,
  },
  botaoTexto: {
    color: '#fff',
    fontWeight: '600',
  },
});

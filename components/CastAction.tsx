import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, StyleSheet, TouchableOpacity, Alert, StyleProp, ViewStyle } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import GoogleCast, { CastButton, useRemoteMediaClient } from 'react-native-google-cast';

import { Colors } from '../constants/Colors';
import { useConnectStore } from '../stores/connectStore';
import { saimoConnect } from '../services/saimoConnect';

export interface CastPayload {
  url: string;
  title: string;
  poster?: string;
  /** Segundos já assistidos, para a TV continuar de onde parou. */
  startTime?: number;
  /** Chave única de VOD se disponível */
  key?: string;
  letter?: string;
  year?: string;
  isSeries?: boolean;
  temporada?: number;
  episodio?: number;
  fonte?: number;
}

interface CastActionProps {
  /** O que transmitir no momento do toque, ou nulo quando não há nada. */
  resolve?: () => CastPayload | null;
  /**
   * Quando a tela já tem o seu próprio efeito que envia o vídeo assim que a
   * sessão nasce — como o player de canais, que reenvia a cada troca de canal
   * —, o botão só abre a lista de aparelhos e não manda nada por conta.
   */
  onlyDialog?: boolean;
  style?: StyleProp<ViewStyle>;
  color?: string;
  size?: number;
}

async function avisarSemAparelho(): Promise<void> {
  const estado = await GoogleCast.getPlayServicesState().catch(() => null);
  if (estado && estado !== 'success') {
    await GoogleCast.showPlayServicesErrorDialog(estado).catch(() => false);
    return;
  }
  Alert.alert(
    'Transmitir',
    'Nenhum aparelho Cast encontrado. Confira se a TV está ligada e na mesma rede Wi-Fi.',
  );
}

export default function CastAction({
  resolve,
  onlyDialog = false,
  style,
  color = Colors.text,
  size = 24,
}: CastActionProps) {
  const client = useRemoteMediaClient();
  const [pending, setPending] = useState<CastPayload | null>(null);
  const lastSent = useRef<string>('');

  const connectStatus = useConnectStore((s) => s.status);
  const connectedTv = useConnectStore((s) => s.connectedTv);
  const tvState = useConnectStore((s) => s.tvState);
  const setSheetVisible = useConnectStore((s) => s.setSheetVisible);
  const setRemoteVisible = useConnectStore((s) => s.setRemoteVisible);
  const setMultiAudioVisible = useConnectStore((s) => s.setMultiAudioVisible);

  const isSaimoConnected = connectStatus === 'connected' && !!connectedTv;
  const isCastConnected = !!client || isSaimoConnected;

  const enviarGoogleCast = useCallback(
    (payload: CastPayload, client_: NonNullable<typeof client>) => {
      const marca = `${payload.url}@${Math.round(payload.startTime ?? 0)}`;
      if (lastSent.current === marca) return;
      lastSent.current = marca;
      client_
        .loadMedia({
          mediaInfo: {
            contentUrl: payload.url,
            metadata: {
              type: 'movie',
              title: payload.title,
              images: payload.poster ? [{ url: payload.poster }] : [],
            },
          },
          startTime: payload.startTime,
          autoplay: true,
        })
        .catch((e: unknown) => {
          Alert.alert('Transmitir', 'Não foi possível enviar para o Chromecast.');
          console.warn('[Cast] loadMedia falhou:', e);
        });
    },
    [],
  );

  const enviarSaimoTv = useCallback((payload: CastPayload) => {
    saimoConnect.sendCommand({
      t: 'playVod',
      key: payload.key || '',
      url: payload.url,
      title: payload.title,
      poster: payload.poster,
      startTime: payload.startTime,
      letter: payload.letter,
      year: payload.year,
      isSeries: payload.isSeries,
      temporada: payload.temporada,
      episodio: payload.episodio,
      fonte: payload.fonte,
    });
    Alert.alert('Saimo Connect', `Enviado para ${connectedTv?.name || 'sua TV'}!`);
  }, [connectedTv]);

  // A sessão do Google Cast nasce depois do toque
  useEffect(() => {
    if (!client || !pending) return;
    enviarGoogleCast(pending, client);
    setPending(null);
  }, [client, pending, enviarGoogleCast]);

  const aoTocar = useCallback(async () => {
    // 1. Se Saimo TV estiver conectada:
    if (isSaimoConnected) {
      if (onlyDialog) {
        const botoes: any[] = [
          {
            text: 'Controle Remoto',
            onPress: () => setRemoteVisible(true),
          },
        ];

        if (tvState?.multi) {
          botoes.push({
            text: 'Áudio Multi-Tela',
            onPress: () => setMultiAudioVisible(true),
          });
        }

        botoes.push({
          text: 'Gerenciar Aparelhos',
          onPress: () => setSheetVisible(true),
        });

        botoes.push({
          text: 'Google Cast',
          onPress: async () => {
            const abriu = await GoogleCast.showCastDialog().catch(() => false);
            if (!abriu) await avisarSemAparelho();
          },
        });

        botoes.push({ text: 'Fechar', style: 'cancel' });

        Alert.alert(connectedTv?.name || 'Saimo TV', 'O que deseja fazer?', botoes);
        return;
      }

      const payload = resolve?.() ?? null;
      if (!payload?.url) {
        setRemoteVisible(true);
        return;
      }

      Alert.alert(
        'Transmitir Título',
        `Deseja reproduzir "${payload.title}" na TV?`,
        [
          {
            text: `Reproduzir na ${connectedTv?.name || 'TV'}`,
            onPress: () => enviarSaimoTv(payload),
          },
          {
            text: 'Google Cast',
            onPress: async () => {
              if (client) {
                enviarGoogleCast(payload, client);
              } else {
                setPending(payload);
                const abriu = await GoogleCast.showCastDialog().catch(() => false);
                if (!abriu) {
                  setPending(null);
                  await avisarSemAparelho();
                }
              }
            },
          },
          { text: 'Cancelar', style: 'cancel' },
        ],
      );
      return;
    }

    // 2. Se Google Cast já estiver conectado
    if (client) {
      if (onlyDialog) {
        await GoogleCast.showCastDialog().catch(() => false);
        return;
      }
      const payload = resolve?.() ?? null;
      if (payload?.url) {
        enviarGoogleCast(payload, client);
        return;
      }
    }

    // 3. Nada conectado: pergunta. Antes abria direto o Saimo Connect, e quem
    // só queria mandar o vídeo para a TV (Chromecast, TV com Google Cast)
    // caía numa tela que não era a que procurava.
    const payload = onlyDialog ? null : (resolve?.() ?? null);
    Alert.alert(
      'Transmitir',
      payload?.title ? `Como quer assistir "${payload.title}"?` : 'Como quer transmitir?',
      [
        {
          text: 'Transferir para a TV',
          onPress: async () => {
            if (payload?.url) setPending(payload);
            const abriu = await GoogleCast.showCastDialog().catch(() => false);
            if (!abriu) {
              setPending(null);
              await avisarSemAparelho();
            }
          },
        },
        { text: 'Usar o Saimo Connect', onPress: () => setSheetVisible(true) },
        { text: 'Cancelar', style: 'cancel' },
      ],
    );
  }, [
    isSaimoConnected,
    onlyDialog,
    connectedTv,
    tvState?.multi,
    setRemoteVisible,
    setMultiAudioVisible,
    setSheetVisible,
    resolve,
    enviarSaimoTv,
    client,
    enviarGoogleCast,
  ]);

  return (
    <View style={styles.wrapper}>
      <TouchableOpacity style={style} onPress={aoTocar} accessibilityLabel="Transmitir">
        <MaterialIcons
          name={isSaimoConnected ? 'cast-connected' : 'cast'}
          size={size}
          color={isCastConnected ? Colors.primary : color}
        />
      </TouchableOpacity>
      {/* Invisível, mas montado: sem ele o Android não abre a lista do Google Cast. */}
      <CastButton style={styles.hidden} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { position: 'relative' },
  hidden: { position: 'absolute', width: 1, height: 1, opacity: 0 },
});

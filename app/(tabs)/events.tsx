import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  AppState,
  Alert,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';

import { Colors, Typography, Spacing, BorderRadius } from '../../constants/Colors';
import { useChannelStore } from '../../stores/channelStore';
import { useConnectStore } from '../../stores/connectStore';
import { saimoConnect } from '../../services/saimoConnect';
import { acabou, aoVivo, buscarJogos, type Jogo } from '../../services/eventos';
import { plural } from '../../utils/plural';

const HORA = 3_600_000;
/** O placar anda: com a aba aberta e o app na frente, busca de novo a cada minuto. */
const INTERVALO = 60_000;

type Linha = { tipo: 'grupo'; titulo: string } | { tipo: 'jogo'; jogo: Jogo };

const GRUPOS = ['Ao vivo agora', 'Começa em breve', 'Hoje mais tarde', 'Amanhã', 'Próximos dias'];

function diaDe(ms: number): number {
  const d = new Date(ms);
  return Math.round(new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() / 86_400_000);
}

const hora = (ms: number) =>
  new Date(ms).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

/** "21:30", "amanhã 16:00" ou "sáb 16:00". */
function quando(inicio: number, agora: number): string {
  const d = diaDe(inicio) - diaDe(agora);
  if (d <= 0) return hora(inicio);
  if (d === 1) return `amanhã ${hora(inicio)}`;
  const semana = new Date(inicio).toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '');
  return `${semana} ${hora(inicio)}`;
}

function grupoDe(j: Jogo, agora: number): number {
  if (aoVivo(j, agora)) return 0;
  if (j.inicio - agora <= 2 * HORA) return 1;
  const d = diaDe(j.inicio) - diaDe(agora);
  if (d <= 0) return 2;
  return d === 1 ? 3 : 4;
}

function Escudo({ uri }: { uri: string }) {
  return uri ? (
    <Image source={{ uri }} style={styles.teamLogo} contentFit="contain" recyclingKey={uri} />
  ) : (
    <View style={[styles.teamLogo, styles.placeholderLogo]}>
      <Ionicons name="shield-outline" size={24} color={Colors.textSecondary} />
    </View>
  );
}

const CartaoJogo = React.memo(function CartaoJogo({ jogo, agora }: { jogo: Jogo; agora: number }) {
  const vivo = aoVivo(jogo, agora);
  const isSaimoConnected = useConnectStore((s) => s.status === 'connected' && !!s.connectedTv);
  const connectedTv = useConnectStore((s) => s.connectedTv);

  const abrirNoCelular = () => {
    router.push({ pathname: '/player/[id]', params: { id: jogo.canal.id } });
  };

  const abrirNaTv = () => {
    saimoConnect.tuneChannel(jogo.canal.name);
    Alert.alert('Saimo Connect', `Sintonizando ${jogo.canal.name} em ${connectedTv?.name || 'sua TV'}!`);
  };

  const abrir = () => {
    if (isSaimoConnected) {
      Alert.alert(
        'Assistir Evento',
        `Onde deseja assistir a este jogo?\n\n${jogo.casa} x ${jogo.fora}\nCanal: ${jogo.canal.name}`,
        [
          {
            text: `Na TV Box (${connectedTv?.name || 'TV'})`,
            onPress: abrirNaTv,
          },
          {
            text: 'No Celular',
            onPress: abrirNoCelular,
          },
          {
            text: 'Cancelar',
            style: 'cancel',
          },
        ]
      );
    } else {
      abrirNoCelular();
    }
  };

  return (
    <TouchableOpacity
      style={[styles.card, vivo && styles.cardVivo]}
      onPress={abrir}
      activeOpacity={0.8}
      accessibilityLabel={`${jogo.casa} x ${jogo.fora}, no canal ${jogo.canal.name}`}
    >
      <View style={styles.cardHeader}>
        <View style={styles.leagueInfo}>
          {jogo.ligaLogo ? (
            <Image source={{ uri: jogo.ligaLogo }} style={styles.leagueIcon} contentFit="contain" />
          ) : (
            <Ionicons name="trophy-outline" size={16} color={Colors.textSecondary} />
          )}
          <Text style={styles.leagueName} numberOfLines={1}>{jogo.liga}</Text>
        </View>
        {vivo ? (
          <View style={styles.liveBadge}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>{['AO VIVO', jogo.tempo].filter(Boolean).join('  ')}</Text>
          </View>
        ) : (
          <View style={styles.timeBadge}>
            <Ionicons name="time-outline" size={14} color={Colors.textSecondary} style={{ marginRight: 4 }} />
            <Text style={styles.timeText}>{quando(jogo.inicio, agora)}</Text>
          </View>
        )}
      </View>

      <View style={styles.teamsContainer}>
        <View style={styles.team}>
          <Escudo uri={jogo.casaLogo} />
          <Text style={styles.teamName} numberOfLines={2}>{jogo.casa}</Text>
        </View>
        <View style={styles.vsContainer}>
          {jogo.placar ? (
            <Text style={[styles.score, vivo && styles.scoreVivo]}>{jogo.placar}</Text>
          ) : (
            <Text style={styles.vsText}>X</Text>
          )}
        </View>
        <View style={styles.team}>
          <Escudo uri={jogo.foraLogo} />
          <Text style={styles.teamName} numberOfLines={2}>{jogo.fora}</Text>
        </View>
      </View>

      <View style={styles.channelRow}>
        {jogo.canal.logo ? (
          <Image source={{ uri: jogo.canal.logo }} style={styles.channelLogo} contentFit="contain" />
        ) : (
          <Ionicons name="tv-outline" size={18} color={Colors.textSecondary} />
        )}
        <Text style={styles.channelName} numberOfLines={1}>{jogo.canal.name}</Text>
        <View style={styles.playPill}>
          <Ionicons name="play" size={14} color="#FFFFFF" />
          <Text style={styles.playText}>Assistir</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
});

export default function EventsScreen() {
  const insets = useSafeAreaInsets();
  const channels = useChannelStore(s => s.channels);
  const fetchChannels = useChannelStore(s => s.fetchChannels);
  const [jogos, setJogos] = useState<Jogo[] | null>(null);
  const [erro, setErro] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [agora, setAgora] = useState(Date.now());
  const buscando = useRef(false);

  useEffect(() => {
    if (channels.length === 0) void fetchChannels();
  }, [channels.length, fetchChannels]);

  // Canal adulto não entra na agenda.
  const canais = useMemo(
    () => channels.filter(c => c.category !== 'ADULTOS' && c.category !== 'Adulto'),
    [channels],
  );

  const carregar = useCallback(async (abrindo = false) => {
    if (buscando.current || canais.length === 0) return;
    buscando.current = true;
    const lidos = await buscarJogos(canais, abrindo);
    buscando.current = false;
    setAgora(Date.now());
    if (lidos) {
      setJogos(lidos);
      setErro(false);
    } else {
      setErro(true);
    }
    setIsRefreshing(false);
  }, [canais]);

  // Só com a aba à vista e o app em primeiro plano. A agenda do monitor
  // segue o próprio ritmo (3 min) dentro de buscarJogos.
  useFocusEffect(useCallback(() => {
    void carregar(true);
    const timer = setInterval(() => {
      if (AppState.currentState === 'active') void carregar();
    }, INTERVALO);
    const sub = AppState.addEventListener('change', s => {
      if (s === 'active') void carregar(true);
    });
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, [carregar]));

  const onRefresh = useCallback(() => {
    setIsRefreshing(true);
    void carregar(true);
  }, [carregar]);

  const { linhas, total, vivos } = useMemo(() => {
    const restantes = (jogos ?? []).filter(j => !acabou(j, agora)).sort((a, b) => a.inicio - b.inicio);
    const grupos: Jogo[][] = GRUPOS.map(() => []);
    for (const j of restantes) grupos[grupoDe(j, agora)].push(j);
    const saida: Linha[] = [];
    grupos.forEach((lista, i) => {
      if (lista.length === 0) return;
      saida.push({ tipo: 'grupo', titulo: GRUPOS[i] });
      for (const jogo of lista) saida.push({ tipo: 'jogo', jogo });
    });
    return { linhas: saida, total: restantes.length, vivos: grupos[0].length };
  }, [jogos, agora]);

  const renderItem = useCallback(({ item }: { item: Linha }) =>
    item.tipo === 'grupo' ? (
      <View style={styles.groupHeader}>
        {item.titulo === GRUPOS[0] && <View style={styles.liveDot} />}
        <Text style={styles.groupTitle}>{item.titulo}</Text>
      </View>
    ) : (
      <CartaoJogo jogo={item.jogo} agora={agora} />
    ), [agora]);

  const carregando = jogos === null && !erro;
  const resumo = jogos === null
    ? ''
    : `${plural(total, 'jogo', 'jogos')} nos canais da lista · ${vivos} ao vivo`;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Eventos</Text>
        {!!resumo && <Text style={styles.headerSub}>{resumo}</Text>}
      </View>

      {carregando ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : (
        <FlashList
          data={linhas}
          renderItem={renderItem}
          extraData={agora}
          getItemType={item => item.tipo}
          keyExtractor={item => item.tipo === 'grupo'
            ? `g-${item.titulo}`
            : `j-${item.jogo.casa}-${item.jogo.fora}-${item.jogo.inicio}`}
          contentContainerStyle={{ ...styles.listContent, paddingBottom: insets.bottom + 80 }}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={onRefresh}
              tintColor={Colors.primary}
              colors={[Colors.primary]}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="calendar-outline" size={64} color={Colors.textSecondary} />
              <Text style={styles.emptyText}>
                {erro
                  ? 'Não deu para carregar a agenda agora. Tentando de novo em um minuto.'
                  : 'Nenhum jogo nos canais da lista agora. A agenda se atualiza sozinha.'}
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  headerTitle: {
    fontSize: Typography.h2.fontSize,
    fontWeight: 'bold',
    color: Colors.text,
  },
  headerSub: {
    marginTop: 2,
    fontSize: Typography.caption.fontSize,
    color: Colors.textSecondary,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    padding: Spacing.md,
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.md,
  },
  groupTitle: {
    fontSize: Typography.h3.fontSize,
    fontWeight: 'bold',
    color: Colors.text,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  cardVivo: {
    borderColor: Colors.liveGlow,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
    paddingBottom: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  leagueInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: Spacing.sm,
  },
  leagueIcon: {
    width: 20,
    height: 20,
    marginRight: 6,
  },
  leagueName: {
    fontSize: Typography.caption.fontSize,
    color: Colors.textSecondary,
    fontWeight: '600',
    flex: 1,
  },
  timeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
  },
  timeText: {
    fontSize: Typography.caption.fontSize,
    color: Colors.textSecondary,
    fontWeight: '600',
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.live,
    marginRight: 6,
  },
  liveText: {
    fontSize: Typography.caption.fontSize,
    color: Colors.live,
    fontWeight: 'bold',
  },
  teamsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
  },
  team: {
    flex: 1,
    alignItems: 'center',
  },
  teamLogo: {
    width: 56,
    height: 56,
    marginBottom: Spacing.sm,
  },
  placeholderLogo: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 28,
  },
  teamName: {
    fontSize: Typography.body.fontSize,
    color: Colors.text,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  vsContainer: {
    paddingHorizontal: Spacing.md,
    minWidth: 80,
    alignItems: 'center',
  },
  vsText: {
    fontSize: Typography.h3.fontSize,
    color: Colors.textSecondary,
    fontWeight: '900',
    opacity: 0.5,
  },
  score: {
    fontSize: 26,
    color: Colors.text,
    fontWeight: '900',
  },
  scoreVivo: {
    color: Colors.text,
  },
  channelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surfaceVariant,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  channelLogo: {
    width: 36,
    height: 24,
  },
  channelName: {
    flex: 1,
    marginLeft: Spacing.sm,
    fontSize: Typography.body.fontSize,
    color: Colors.text,
    fontWeight: '600',
  },
  playPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: BorderRadius.full,
  },
  playText: {
    color: '#FFFFFF',
    fontSize: Typography.caption.fontSize,
    fontWeight: 'bold',
  },
  emptyContainer: {
    paddingTop: 60,
    paddingHorizontal: Spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    marginTop: Spacing.md,
    fontSize: Typography.body.fontSize,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
});

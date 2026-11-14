import React, { useEffect, useState, useCallback } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

import { BorderRadius, Colors, Spacing, Typography } from '../constants/Colors';
import { buscarStreamsAddons, pedirAbrirAddons } from '../services/addons';
import { ErroDebrid, resolverTorrentDebrid, temDebridAtivo } from '../services/debrid';
import { resolverImdbPorTmdb } from '../services/tmdbService';
import type { AddonStreamResolved, MediaSource } from '../types';

export interface AddonStreamPicked {
  resolved: AddonStreamResolved;
  resolvedUrl: string;
  allStreams: AddonStreamResolved[];
  imdbId?: string;
}

interface AddonStreamsModalProps {
  visible: boolean;
  title: string;
  type: 'movie' | 'series';
  tmdbId?: number;
  imdbId?: string;
  addonRawId?: string;
  season?: number;
  episode?: number;
  vodSources?: MediaSource[];
  onPickVod?: (url: string) => void;
  onPickAddon: (picked: AddonStreamPicked) => void;
  onClose: () => void;
}

function tipoBadge(kind: AddonStreamResolved['kind'], debridAtivo: boolean): {
  texto: string;
  cor: string;
  icone: keyof typeof Ionicons.glyphMap;
} {
  switch (kind) {
    case 'torrent':
      return {
        texto: debridAtivo ? 'Debrid' : 'Torrent · Requer Debrid',
        cor: debridAtivo ? '#10B981' : '#F59E0B',
        icone: 'magnet-outline',
      };
    case 'youtube':
      return { texto: 'YouTube', cor: '#EF4444', icone: 'logo-youtube' };
    case 'external':
      return { texto: 'Externo', cor: '#60A5FA', icone: 'open-outline' };
    default:
      return { texto: 'Direto', cor: Colors.primary, icone: 'play-circle-outline' };
  }
}

export default function AddonStreamsModal({
  visible,
  title,
  type,
  tmdbId,
  imdbId,
  addonRawId,
  season,
  episode,
  vodSources,
  onPickVod,
  onPickAddon,
  onClose,
}: AddonStreamsModalProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [streams, setStreams] = useState<AddonStreamResolved[]>([]);
  const [erros, setErros] = useState<Array<{ addonId: string; addonName: string; erro: string }>>([]);
  const [resolvendoIdx, setResolvendoIdx] = useState<number | null>(null);
  const [imdbResolvido, setImdbResolvido] = useState<string | undefined>(imdbId);
  const debridAtivo = temDebridAtivo();

  const carregar = useCallback(async () => {
    setLoading(true);
    setStreams([]);
    setErros([]);
    try {
      let imdbAtual = imdbId;
      if (!imdbAtual && tmdbId && tmdbId > 0) {
        imdbAtual = await resolverImdbPorTmdb(tmdbId, type === 'series');
      }
      setImdbResolvido(imdbAtual);

      const res = await buscarStreamsAddons({
        type,
        imdbId: imdbAtual,
        tmdbId,
        addonRawId,
        season,
        episode,
      });
      setStreams(res.streams);
      setErros(res.erros);
    } catch {
      setErros([{ addonId: 'addons', addonName: 'Addons', erro: 'Falha ao consultar addons.' }]);
    } finally {
      setLoading(false);
    }
  }, [type, tmdbId, imdbId, addonRawId, season, episode]);

  useEffect(() => {
    if (visible) {
      void carregar();
    } else {
      setResolvendoIdx(null);
    }
  }, [visible, carregar]);

  const handleSelectAddon = useCallback(async (item: AddonStreamResolved, index: number) => {
    if (resolvendoIdx !== null) return;

    if (item.kind === 'youtube' && item.ytId) {
      const ytUrl = `https://www.youtube.com/watch?v=${encodeURIComponent(item.ytId)}`;
      await Linking.openURL(ytUrl).catch(() => {
        Alert.alert('Erro', 'Não foi possível abrir o vídeo no YouTube.');
      });
      onClose();
      return;
    }

    if (item.kind === 'external' && item.externalUrl) {
      await Linking.openURL(item.externalUrl).catch(() => {
        Alert.alert('Erro', 'Não foi possível abrir o link externo.');
      });
      onClose();
      return;
    }

    if (item.kind === 'direct' && item.url) {
      onPickAddon({
        resolved: item,
        resolvedUrl: item.url,
        allStreams: streams,
        imdbId: imdbResolvido,
      });
      onClose();
      return;
    }

    if (item.kind === 'torrent' && item.infoHash) {
      setResolvendoIdx(index);
      try {
        const dl = await resolverTorrentDebrid({
          infoHash: item.infoHash,
          fileIdx: item.fileIdx,
          sources: item.sources,
          filename: item.filename,
        });
        const atualizado: AddonStreamResolved = {
          ...item,
          url: dl.url,
        };
        onPickAddon({
          resolved: atualizado,
          resolvedUrl: dl.url,
          allStreams: streams.map((s, i) => (i === index ? atualizado : s)),
          imdbId: imdbResolvido,
        });
        onClose();
      } catch (err) {
        if (err instanceof ErroDebrid && err.code === 'DEBRID_NAO_CONFIGURADO') {
          Alert.alert(
            'Debrid necessário',
            err.message,
            [
              { text: 'Agora não', style: 'cancel' },
              {
                text: 'Configurar Debrid',
                onPress: () => {
                  onClose();
                  pedirAbrirAddons();
                  router.push('/(tabs)/settings' as any);
                },
              },
            ],
          );
        } else {
          Alert.alert(
            'Não foi possível abrir via Debrid',
            err instanceof Error ? err.message : 'Tente outro stream.',
          );
        }
      } finally {
        setResolvendoIdx(null);
      }
    }
  }, [resolvendoIdx, streams, imdbResolvido, onPickAddon, onClose, router]);

  return (
    <Modal
      supportedOrientations={['portrait', 'portrait-upside-down', 'landscape', 'landscape-left', 'landscape-right']}
      transparent
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.container} onPress={() => {}}>
          <View style={styles.handle} />
          <View style={styles.headerRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title} numberOfLines={1}>{title}</Text>
              <Text style={styles.subtitle}>Fontes de addons e listas disponíveis</Text>
            </View>
            <TouchableOpacity onPress={carregar} style={styles.refreshIconBtn} accessibilityLabel="Recarregar fontes">
              <Ionicons name="refresh" size={18} color={Colors.text} />
            </TouchableOpacity>
          </View>

          {loading ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator size="large" color={Colors.primary} />
              <Text style={styles.loadingText}>Buscando streams nos addons ativos...</Text>
            </View>
          ) : (
            <ScrollView style={styles.scroll} bounces={false} showsVerticalScrollIndicator>
              {(vodSources ?? []).filter((s) => !!s.url).map((src, idx) => (
                <TouchableOpacity
                  key={`vod-${idx}-${src.url}`}
                  style={styles.row}
                  onPress={() => {
                    onPickVod?.(src.url);
                    onClose();
                  }}
                >
                  <Ionicons name="film-outline" size={20} color={Colors.primary} />
                  <View style={styles.rowText}>
                    <Text style={styles.rowTitle} numberOfLines={1}>
                      Lista VOD · {src.label === 'leg' ? 'Legendado' : src.label === 'dub' ? 'Dublado' : (src.label || `Fonte ${idx + 1}`)}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={Colors.textSecondary} />
                </TouchableOpacity>
              ))}

              {streams.map((item, idx) => {
                const badge = tipoBadge(item.kind, debridAtivo);
                const carregandoEste = resolvendoIdx === idx;
                return (
                  <TouchableOpacity
                    key={`${item.addonId}-${idx}`}
                    style={styles.row}
                    disabled={resolvendoIdx !== null}
                    onPress={() => void handleSelectAddon(item, idx)}
                  >
                    {carregandoEste ? (
                      <ActivityIndicator size="small" color={Colors.primary} />
                    ) : (
                      <Ionicons name={badge.icone} size={20} color={badge.cor} />
                    )}
                    <View style={styles.rowText}>
                      <View style={styles.rowTop}>
                        <Text style={styles.rowTitle} numberOfLines={2}>{item.title}</Text>
                      </View>
                      {!!item.subtitle && (
                        <Text style={styles.rowSubtitle} numberOfLines={3}>{item.subtitle}</Text>
                      )}
                      <View style={styles.badgeRow}>
                        <View style={[styles.badge, { borderColor: badge.cor }]}>
                          <Text style={[styles.badgeText, { color: badge.cor }]}>{badge.texto}</Text>
                        </View>
                        <Text style={styles.addonTag}>{item.addonName}</Text>
                        {!!item.bingeGroup && (
                          <Text style={styles.addonTag}>Binge</Text>
                        )}
                      </View>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={Colors.textSecondary} />
                  </TouchableOpacity>
                );
              })}

              {streams.length === 0 && (vodSources?.length ?? 0) === 0 && (
                <View style={styles.emptyBox}>
                  <Ionicons name="extension-puzzle-outline" size={36} color={Colors.textSecondary} />
                  <Text style={styles.emptyTitle}>Nenhum stream encontrado</Text>
                  <Text style={styles.emptyHint}>
                    Verifique seus addons em Ajustes {'>'} Addons e Debrid ou tente outro título.
                  </Text>
                  {erros.map((e, i) => (
                    <Text key={`${e.addonId}-${i}`} style={styles.errorLine}>
                      {e.addonName}: {e.erro}
                    </Text>
                  ))}
                  <TouchableOpacity
                    style={styles.configBtn}
                    onPress={() => {
                      onClose();
                      pedirAbrirAddons();
                      router.push('/(tabs)/settings' as any);
                    }}
                  >
                    <Text style={styles.configBtnText}>Configurar Addons e Debrid</Text>
                  </TouchableOpacity>
                </View>
              )}
            </ScrollView>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.68)', justifyContent: 'flex-end' },
  container: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: Spacing.xl,
    paddingBottom: 32,
    maxHeight: '85%',
  },
  handle: {
    width: 38,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
    marginBottom: Spacing.md,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  refreshIconBtn: {
    padding: Spacing.sm,
    backgroundColor: Colors.background,
    borderRadius: BorderRadius.full,
  },
  title: { color: Colors.text, fontSize: Typography.h3.fontSize, fontWeight: '700' },
  subtitle: { color: Colors.textSecondary, fontSize: Typography.caption.fontSize, marginTop: 2 },
  loadingBox: { alignItems: 'center', paddingVertical: Spacing.xxl, gap: Spacing.md },
  loadingText: { color: Colors.textSecondary, fontSize: Typography.body.fontSize },
  scroll: { flexGrow: 0 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  rowText: { flex: 1 },
  rowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rowTitle: { color: Colors.text, fontSize: Typography.body.fontSize, fontWeight: '600' },
  rowSubtitle: { color: Colors.textSecondary, fontSize: 12, marginTop: 3, lineHeight: 16 },
  badgeRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  badge: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  badgeText: { fontSize: 11, fontWeight: '700' },
  addonTag: { color: Colors.textSecondary, fontSize: 11 },
  emptyBox: { alignItems: 'center', paddingVertical: Spacing.xl, gap: Spacing.sm },
  emptyTitle: { color: Colors.text, fontSize: 16, fontWeight: '700' },
  emptyHint: { color: Colors.textSecondary, fontSize: 13, textAlign: 'center', paddingHorizontal: Spacing.md },
  errorLine: { color: '#F59E0B', fontSize: 12, textAlign: 'center' },
  configBtn: {
    marginTop: Spacing.sm,
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.full,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  configBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
});

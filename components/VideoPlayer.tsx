import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Pressable,
  Dimensions,
  StatusBar,
  AppState,
  BackHandler,
  Platform,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import Video, { BufferConfig, BufferingStrategyType, DRMType, SelectedTrackType, SelectedVideoTrackType, VideoRef } from 'react-native-video';
import { useRemoteMediaClient } from 'react-native-google-cast';
import * as ScreenOrientation from 'expo-screen-orientation';
import * as NavigationBar from 'expo-navigation-bar';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { Channel, CurrentProgram } from '../types';
import { Colors, BorderRadius, Spacing, Typography } from '../constants/Colors';
import { useFavoritesStore } from '../stores/favoritesStore';
import { useSettingsStore } from '../stores/settingsStore';
import { getCurrentProgram, fetchChannelEPG, onEPGUpdate } from '../services/epgService';
import EPGGuideModal from './EPGGuideModal';
import CastAction from './CastAction';
import { configureClearKey } from '../services/clearKeyServer';
import * as telemetria from '../services/telemetria';

function toResLabel(h: number): string {
  if (h >= 2160) return '4K';
  if (h >= 1440) return '2K';
  if (h >= 1080) return '1080p';
  if (h >= 720) return '720p';
  if (h >= 480) return '480p';
  if (h >= 360) return '360p';
  return `${h}p`;
}

function detailedResLabel(width?: number, height?: number): string | null {
  if (!height || height <= 0) return null;
  const size = width && width > 0 ? `${width}×${height} · ` : '';
  return `${size}${toResLabel(height)}`;
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function formatRemaining(min?: number): string {
  if (!min) return '';
  if (min < 60) return `${min}min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}h${m}min`;
}

interface VideoPlayerProps {
  channel: Channel;
}

/** Quanto tempo de tela parada conta como fonte caída. */
const SEM_IMAGEM_MS = 25_000;
/** Quantas vezes a mesma fonte é reaberta antes de descer para a seguinte. */
const RETOMADAS_MAX = 3;
/**
 * Configuração de buffer otimizada para transmissões AO VIVO com baixa latência (Live Edge).
 * - minBufferMs: 2000 (apenas 2s de buffer inicial, em vez de 15s-30s que causavam atraso)
 * - maxBufferMs: 5000
 * - bufferForPlaybackMs: 800 (inicia quase que instantaneamente)
 * - bufferForPlaybackAfterRebufferMs: 1500
 * - live: sincronização ativa com a ponta ao vivo (Live Edge) com ajuste dinâmico de velocidade (0.98x - 1.04x)
 */
const BUFFER_AO_VIVO: BufferConfig = {
  minBufferMs: 2000,
  maxBufferMs: 5000,
  bufferForPlaybackMs: 800,
  bufferForPlaybackAfterRebufferMs: 1500,
  maxHeapAllocationPercent: 0.3,
  minBufferMemoryReservePercent: 0.2,
  live: {
    targetOffsetMs: 1500,
    minOffsetMs: 500,
    maxOffsetMs: 4000,
    minPlaybackSpeed: 0.98,
    maxPlaybackSpeed: 1.04,
  },
};

export default function VideoPlayer({ channel }: VideoPlayerProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { zeroDelay, setZeroDelay } = useSettingsStore();

  const bufferConfig = useMemo((): BufferConfig | undefined => {
    if (zeroDelay === 'agressivo') {
      return {
        minBufferMs: 1500,
        maxBufferMs: 4000,
        bufferForPlaybackMs: 600,
        bufferForPlaybackAfterRebufferMs: 1200,
        maxHeapAllocationPercent: 0.3,
        minBufferMemoryReservePercent: 0.2,
        live: {
          targetOffsetMs: 1500,
          minOffsetMs: 500,
          maxOffsetMs: 3000,
          minPlaybackSpeed: 0.98,
          maxPlaybackSpeed: 1.08,
        },
      };
    }
    if (zeroDelay === 'equilibrado') {
      return {
        minBufferMs: 3000,
        maxBufferMs: 8000,
        bufferForPlaybackMs: 1200,
        bufferForPlaybackAfterRebufferMs: 2000,
        maxHeapAllocationPercent: 0.3,
        minBufferMemoryReservePercent: 0.2,
        live: {
          targetOffsetMs: 4000,
          minOffsetMs: 2000,
          maxOffsetMs: 6000,
          minPlaybackSpeed: 0.98,
          maxPlaybackSpeed: 1.04,
        },
      };
    }
    // 'off' (padrão seguro anti-travamento para IPTV)
    return {
      minBufferMs: 15000,
      maxBufferMs: 30000,
      bufferForPlaybackMs: 2500,
      bufferForPlaybackAfterRebufferMs: 5000,
      maxHeapAllocationPercent: 0.3,
      minBufferMemoryReservePercent: 0.2,
    };
  }, [zeroDelay]);

  const preferredForwardBufferDuration = useMemo(() => {
    if (zeroDelay === 'agressivo') return 1.5;
    if (zeroDelay === 'equilibrado') return 3.0;
    return 0;
  }, [zeroDelay]);

  const [activeChannel, setActiveChannel] = useState<Channel>(channel);
  const [sourceIndex, setSourceIndex] = useState(0);
  const [clearKeyLicenseUrl, setClearKeyLicenseUrl] = useState<string | null>(null);

  useEffect(() => {
    setActiveChannel((prev) => {
      if (prev.id !== channel.id) {
        setSourceIndex(0);
        return channel;
      }
      if ((channel.streams?.length ?? 0) !== (prev.streams?.length ?? 0) || channel.url !== prev.url) {
        setSourceIndex(0);
        return channel;
      }
      return prev;
    });
  }, [channel]);

  const activeStream = useMemo(() => {
    return activeChannel.streams?.[sourceIndex] ?? {
      url: activeChannel.url,
      headers: activeChannel.headers,
      drm: activeChannel.drm,
    };
  }, [activeChannel, sourceIndex]);

  const [resolvedDadinho, setResolvedDadinho] = useState<string | null>(null);

  useEffect(() => {
    if (!activeStream.url.includes('dadinhodetapioca.fun/play/')) {
      setResolvedDadinho(null);
      return;
    }
    let cancelled = false;
    fetch(activeStream.url, {
      headers: { Referer: 'https://rdcanais.org/' },
    })
      .then((res) => res.text())
      .then((html) => {
        if (cancelled) return;
        const match = html.match(/STREAM_URLS\s*=\s*\[\s*"([^"]+)"/);
        if (match) {
          const m3u8 = match[1].replace(/\\\//g, '/');
          setResolvedDadinho(m3u8);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [activeStream.url]);

  // A fonte do player num objeto estável: um objeto novo a cada render fazia
  // o componente do vídeo comparar e reenviar a fonte a cada atualização.
  const fonteDoPlayer = useMemo(() => {
    const isDadinho = activeStream.url.includes('dadinhodetapioca.fun');
    const uri = (isDadinho && resolvedDadinho) ? resolvedDadinho : activeStream.url;
    const baseHeaders: Record<string, string> = {
      Accept: '*/*',
      ...(activeStream.headers ?? {}),
    };
    if (uri.includes('s1001604.lat') && !baseHeaders.Referer) {
      baseHeaders.Referer = 'https://meufut.top/';
    }
    if ((uri.includes('s25-cloudfront-net.lat') || uri.includes('cloudfront-net.lat')) && !baseHeaders.Referer) {
      baseHeaders.Referer = 'https://w7.embedtv.cc/';
    }
    const headers = isDadinho
      ? { ...baseHeaders, Referer: 'https://dadinhodetapioca.fun/', Origin: 'https://dadinhodetapioca.fun' }
      : baseHeaders;
    const cleanPath = uri.split('?')[0].toLowerCase();
    const isHls = cleanPath.endsWith('.m3u8') || cleanPath.endsWith('.txt') || isDadinho;
    return {
      uri,
      headers,
      // Há provedores que publicam o master HLS como text/plain e com
      // extensão `.txt`. Como este campo já é uma fonte de mídia, todo
      // `.m3u8` e `.txt` aqui vai explicitamente para o demuxer HLS.
      type: isHls ? 'm3u8' : undefined,
    };
  }, [activeStream.url, activeStream.headers, resolvedDadinho]);

  const client = useRemoteMediaClient();
  const videoRef = useRef<VideoRef>(null);

  const [epg, setEpg] = useState<CurrentProgram | null>(null);
  const [hasError, setHasError] = useState(false);
  const [videoResolution, setVideoResolution] = useState<string | null>(null);
  const [showGuide, setShowGuide] = useState(false);
  const [osdVisible, setOsdVisible] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [menuPage, setMenuPage] = useState<'main' | 'audio' | 'video' | 'cc' | 'fontes'>('main');
  const [videoKey, setVideoKey] = useState(0);
  const [isCasting, setIsCasting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const [audioTracks, setAudioTracks] = useState<any[]>([]);
  const [videoTracks, setVideoTracks] = useState<any[]>([]);
  const [textTracks, setTextTracks] = useState<any[]>([]);
  const [selectedAudioIdx, setSelectedAudioIdx] = useState<number | null>(null);
  const [selectedVideoTrackId, setSelectedVideoTrackId] = useState<number | null>(null);
  const [selectedTextIdx, setSelectedTextIdx] = useState<number | null>(null);

  const { toggleFavorite, isFavorite } = useFavoritesStore();
  const [favorite, setFavorite] = useState(isFavorite(channel.id));

  const osdTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const switchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryIntervalRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isRetryingRef = useRef(false);
  const isMountedRef = useRef(true);
  const [isRetrying, setIsRetrying] = useState(false);

  // ─── OSD ───
  const showOSD = useCallback(() => {
    setOsdVisible(true);
    if (osdTimeoutRef.current) clearTimeout(osdTimeoutRef.current);
    osdTimeoutRef.current = setTimeout(() => setOsdVisible(false), 5000);
  }, []);

  const hideOSD = useCallback(() => {
    setOsdVisible(false);
    if (osdTimeoutRef.current) clearTimeout(osdTimeoutRef.current);
  }, []);

  useEffect(() => { showOSD(); }, [activeChannel.id]); // eslint-disable-line

  // ─── Channel switch ───
  const handleSwitchChannel = useCallback((target: Channel) => {
    if (target.id === activeChannel.id) return;
    if (retryTimerRef.current)    { clearTimeout(retryTimerRef.current);    retryTimerRef.current    = null; }
    if (retryIntervalRef.current) { clearTimeout(retryIntervalRef.current); retryIntervalRef.current = null; }
    if (switchDebounceRef.current){ clearTimeout(switchDebounceRef.current); switchDebounceRef.current = null; }
    isRetryingRef.current = false;
    setIsRetrying(false);
    setHasError(false);
    setVideoResolution(null);
    setAudioTracks([]);
    setVideoTracks([]);
    setTextTracks([]);
    setSelectedAudioIdx(null);
    setSelectedVideoTrackId(null);
    setSelectedTextIdx(null);
    setMenuPage('main');
    setIsLoading(true);
    setSourceIndex(0);
    setActiveChannel(target);
    switchDebounceRef.current = setTimeout(() => {
      if (!isMountedRef.current) return;
      setVideoKey(k => k + 1);
    }, 200);
  }, [activeChannel.id]);

  // ─── Favorite sync ───
  useEffect(() => {
    setFavorite(isFavorite(activeChannel.id));
  }, [activeChannel.id, isFavorite]);

  const handleToggleFavorite = useCallback(() => {
    toggleFavorite(activeChannel.id);
    setFavorite(prev => !prev);
  }, [activeChannel.id, toggleFavorite]);

  // ─── Cast ───
  const handleCast = useCallback(() => {
    if (!client) return;
    client.loadMedia({
      mediaInfo: {
        contentUrl: activeStream.url,
        metadata: {
          type: 'movie',
          title: activeChannel.name,
          images: activeChannel.logo ? [{ url: activeChannel.logo }] : [],
        },
      },
      autoplay: true,
    });
    setIsCasting(true);
  }, [client, activeChannel, activeStream.url]);

  useEffect(() => {
    if (client) handleCast();
    else setIsCasting(false);
  }, [client, handleCast]);

  // ─── EPG ───
  useEffect(() => {
    const cached = getCurrentProgram(activeChannel.id);
    if (cached) setEpg(cached);
    else {
      setEpg(null);
      fetchChannelEPG(activeChannel.id).catch(() => {});
    }
    const interval = setInterval(() => {
      if (isMountedRef.current) setEpg(getCurrentProgram(activeChannel.id));
    }, 30000);
    const unsub = onEPGUpdate((id) => {
      if (id === activeChannel.id && isMountedRef.current) {
        setEpg(getCurrentProgram(activeChannel.id));
      }
    });
    return () => { clearInterval(interval); unsub(); };
  }, [activeChannel.id]);

  // ─── Mount + Fullscreen ───
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (osdTimeoutRef.current)     clearTimeout(osdTimeoutRef.current);
      if (switchDebounceRef.current) clearTimeout(switchDebounceRef.current);
      if (retryTimerRef.current)     clearTimeout(retryTimerRef.current);
      if (retryIntervalRef.current)  clearTimeout(retryIntervalRef.current);
    };
  }, []);

  useEffect(() => {
    (async () => {
      try {
        await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
        if (Platform.OS === 'android') {
          await NavigationBar.setVisibilityAsync('hidden');
        }
      } catch {}
    })();
    return () => {
      (async () => {
        try {
          await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
          if (Platform.OS === 'android') {
            await NavigationBar.setVisibilityAsync('visible');
          }
        } catch {}
      })();
    };
  }, []);

  // A janela de um Modal (guia, lista de canais) e a volta do PiP trazem as
  // barras do sistema de volta por cima do vídeo: some com elas de novo.
  useEffect(() => {
    if (Platform.OS !== 'android' || showGuide || showMenu) return;
    // Depois da janela do Modal terminar de fechar: ela devolve as barras ao
    // sair, por cima de um pedido feito antes.
    const espera = setTimeout(() => {
      StatusBar.setHidden(true);
      NavigationBar.setVisibilityAsync('hidden').catch(() => {});
    }, 400);
    return () => clearTimeout(espera);
  }, [showGuide, showMenu]);
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const assinatura = AppState.addEventListener('change', (estado) => {
      if (estado !== 'active') return;
      StatusBar.setHidden(true);
      NavigationBar.setVisibilityAsync('hidden').catch(() => {});
    });
    return () => assinatura.remove();
  }, []);

  // ─── Back ───
  const handleBack = useCallback(async () => {
    router.back();
    try { await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP); } catch {}
  }, [router]);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (showMenu) { setShowMenu(false); return true; }
      if (showGuide) { setShowGuide(false); return true; }
      handleBack();
      return true;
    });
    return () => sub.remove();
  }, [showMenu, showGuide, handleBack]);

  // ─── Video callbacks ───
  const onLoad = useCallback((data: any) => {
    if (!isMountedRef.current) return;
    if (isRetryingRef.current) {
      isRetryingRef.current = false;
      setIsRetrying(false);
      if (retryTimerRef.current)    { clearTimeout(retryTimerRef.current);    retryTimerRef.current    = null; }
      if (retryIntervalRef.current) { clearTimeout(retryIntervalRef.current); retryIntervalRef.current = null; }
    }
    setHasError(false);
    setIsLoading(false);
    if (!tentativaRef.current.avisado) {
      tentativaRef.current.avisado = true;
      const n = noArRef.current;
      telemetria.tocou('live', n.nome, n.url, n.fonte, Date.now() - tentativaRef.current.desde);
    }
    const natural = data?.naturalSize;
    const label = detailedResLabel(natural?.width, natural?.height);
    if (label) setVideoResolution(label);
  }, []);

  /*
   * Prova de vida da fonte: o relógio do vídeo andando.
   *
   * Erro de player não é prova de queda — no celular a rede troca de antena, o
   * CDN devolve 5xx solto, um segmento se perde. Trocar de fonte a cada tropeço
   * recomeça o canal noutro servidor na frente de quem está assistindo, e às
   * vezes na fonte pior. Enquanto sai imagem, o erro é atendido na mesma fonte.
   */
  const ultimoTempoRef = useRef(-1);
  const ultimoAvancoRef = useRef(0);
  const retomadasRef = useRef(0);

  const onProgress = useCallback(({ currentTime }: { currentTime: number }) => {
    if (currentTime > ultimoTempoRef.current + 0.2) {
      ultimoTempoRef.current = currentTime;
      ultimoAvancoRef.current = Date.now();
      retomadasRef.current = 0;
    } else if (currentTime < ultimoTempoRef.current - 1) {
      // Relógio para trás é fluxo recomeçado: recomeça a contagem dali.
      ultimoTempoRef.current = currentTime;
      ultimoAvancoRef.current = Date.now();
    }
  }, []);

  const onError = useCallback((erro?: any) => {
    if (!isMountedRef.current) return;
    setIsLoading(false);
    const streams = activeChannel.streams ?? [];
    // Uma falha por fonte, não uma a cada reconexão de dois segundos.
    if (!isRetryingRef.current) {
      const detalhe = String(erro?.error?.errorString ?? erro?.error?.errorCode ?? erro?.error?.localizedDescription ?? 'erro do player');
      telemetria.falhou('live', activeChannel.name, activeStream.url, sourceIndex + 1, detalhe);
    }
    // A fonte estava entregando imagem até agora há pouco: o erro foi tropeço
    // de rede. Reabre o mesmo endereço em vez de trocar de origem.
    const entregandoImagem = ultimoAvancoRef.current > 0
      && Date.now() - ultimoAvancoRef.current < SEM_IMAGEM_MS;
    if (entregandoImagem && retomadasRef.current < RETOMADAS_MAX) {
      retomadasRef.current += 1;
      setHasError(false);
      setIsLoading(true);
      setVideoKey(key => key + 1);
      return;
    }
    if (sourceIndex + 1 < streams.length) {
      setSourceIndex(index => index + 1);
      setHasError(false);
      setIsLoading(true);
      setVideoKey(key => key + 1);
      return;
    }
    if (!isRetryingRef.current) {
      isRetryingRef.current = true;
      setIsRetrying(true);
      retryTimerRef.current = setTimeout(() => {
        if (!isMountedRef.current) return;
        isRetryingRef.current = false;
        setIsRetrying(false);
        setHasError(true);
      }, 8000);
    }
    if (retryIntervalRef.current) clearTimeout(retryIntervalRef.current);
    retryIntervalRef.current = setTimeout(() => {
      if (!isMountedRef.current || !isRetryingRef.current) return;
      setVideoKey(k => k + 1);
    }, 2000);
  }, [activeChannel.streams, activeChannel.name, activeStream.url, sourceIndex]);

  const onAudioTracks = useCallback((data: any) => {
    setAudioTracks(data?.audioTracks ?? []);
  }, []);

  const onVideoTracks = useCallback((data: any) => {
    const tracks = data?.videoTracks ?? [];
    setVideoTracks(tracks);
  }, []);

  const onTextTracks = useCallback((data: any) => {
    setTextTracks(data?.textTracks ?? []);
  }, []);

  const handleRetry = useCallback(() => {
    isRetryingRef.current = false;
    setIsRetrying(false);
    setHasError(false);
    setIsLoading(true);
    if (retryTimerRef.current)    { clearTimeout(retryTimerRef.current);    retryTimerRef.current    = null; }
    if (retryIntervalRef.current) { clearTimeout(retryIntervalRef.current); retryIntervalRef.current = null; }
    setVideoKey(k => k + 1);
  }, []);

  // Escolha manual, como no site e no Mac: a troca automática continua valendo
  // a partir da fonte escolhida se ela também cair.
  const escolherFonte = useCallback((indice: number) => {
    escolhaManualRef.current = true;
    isRetryingRef.current = false;
    setIsRetrying(false);
    if (retryTimerRef.current)    { clearTimeout(retryTimerRef.current);    retryTimerRef.current    = null; }
    if (retryIntervalRef.current) { clearTimeout(retryIntervalRef.current); retryIntervalRef.current = null; }
    setHasError(false);
    setIsLoading(true);
    setVideoResolution(null);
    setSourceIndex(indice);
    setVideoKey(k => k + 1);
    setMenuPage('main');
    setShowMenu(false);
  }, []);

  const totalDeFontes = activeChannel.streams?.length ?? 1;

  // ─── Monitor ───
  // Trocar de canal ou escolher fonte à mão é abertura; a próxima fonte depois
  // de uma falha, não.
  const canalAvisadoRef = useRef<string | null>(null);
  const escolhaManualRef = useRef(false);
  const tentativaRef = useRef<{ desde: number; avisado: boolean }>({ desde: Date.now(), avisado: false });
  // onLoad é memorizado sem dependências; lê o que está no ar por aqui.
  const noArRef = useRef({ nome: activeChannel.name, url: activeStream.url, fonte: sourceIndex + 1 });
  noArRef.current = { nome: activeChannel.name, url: activeStream.url, fonte: sourceIndex + 1 };
  useEffect(() => {
    const nova = canalAvisadoRef.current !== activeChannel.id || escolhaManualRef.current;
    canalAvisadoRef.current = activeChannel.id;
    escolhaManualRef.current = false;
    tentativaRef.current = { desde: Date.now(), avisado: false };
    ultimoTempoRef.current = -1;
    ultimoAvancoRef.current = 0;
    retomadasRef.current = 0;
    telemetria.comecou('live', activeChannel.name, activeStream.url, sourceIndex + 1, nova);
  }, [activeChannel.id, sourceIndex]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (hasError) telemetria.caiu('live', activeChannel.name, totalDeFontes);
  }, [hasError]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => telemetria.parou(), []);
  // Canal ao vivo não pausa aqui; o que para a conta é carregar.
  const [carregando, setCarregando] = useState(false);
  const onBuffer = useCallback(({ isBuffering }: { isBuffering: boolean }) => {
    if (isMountedRef.current) setCarregando(isBuffering);
  }, []);
  useEffect(() => {
    telemetria.video({
      rodando: tentativaRef.current.avisado && !hasError,
      pausado: false,
      carregando: isLoading || isRetrying || carregando,
      qualidade: videoResolution,
    });
  }, [isLoading, isRetrying, carregando, hasError, videoResolution]);

  const upscaling = useSettingsStore((s) => s.upscaling);
  const prevUpscalingRef = useRef(upscaling);

  useEffect(() => {
    try {
      const { NativeModules } = require('react-native');
      NativeModules.SaimoUpscaling?.setMode?.(upscaling);
    } catch {
      // ignora
    }
    if (prevUpscalingRef.current !== upscaling) {
      prevUpscalingRef.current = upscaling;
      setVideoKey((v) => v + 1);
    }
  }, [upscaling]);

  const onBandwidthUpdate = useCallback((data: any) => {
    if (!isMountedRef.current) return;
    const label = detailedResLabel(data?.width, data?.height);
    if (label) {
      const suffix = upscaling === 'hd' ? ' · Upscale FHD' : upscaling === '4k' ? ' · Upscale 4K' : '';
      setVideoResolution(`${label}${suffix}`);
    }
  }, [upscaling]);

  // ─── DRM config ───
  useEffect(() => {
    let active = true;
    const key = activeStream.drm?.clearKey;
    if (!key) {
      setClearKeyLicenseUrl(null);
      return () => { active = false; };
    }
    configureClearKey(key).then(url => {
      if (active) {
        setClearKeyLicenseUrl(url);
        if (url) setVideoKey(value => value + 1);
      }
    });
    return () => { active = false; };
  }, [activeStream.drm?.clearKey]);

  const drmConfig = useMemo(() => {
    if (!activeStream.drm?.clearKey || !clearKeyLicenseUrl) return undefined;
    return {
      type: DRMType.CLEARKEY,
      licenseServer: clearKeyLicenseUrl,
    };
  }, [activeStream.drm?.clearKey, clearKeyLicenseUrl]);

  // ─── Prev/Next ───
  // Sem channel store global; mantém apenas a interação via guia.
  const audioLanguages = useMemo(() => {
    return Array.from(new Set(audioTracks.map(t => t.language).filter(Boolean))).slice(0, 3);
  }, [audioTracks]);

  return (
    <View style={styles.container}>
      <StatusBar hidden />

      <Pressable
        style={styles.videoContainer}
        onPress={() => {
          if (showMenu || showGuide) return;
          osdVisible ? hideOSD() : showOSD();
        }}
        focusable={false}
        android_ripple={{ color: 'transparent' }}
      >
        <View style={styles.video} pointerEvents="none">
          <Video
            key={videoKey}
            ref={videoRef}
            source={fonteDoPlayer}
            drm={drmConfig}
            style={styles.video}
            resizeMode="contain"
            onLoad={onLoad}
            onError={onError}
            onProgress={onProgress}
            onBuffer={onBuffer}
            onAudioTracks={onAudioTracks}
            onVideoTracks={onVideoTracks}
            onTextTracks={onTextTracks}
            onBandwidthUpdate={onBandwidthUpdate}
            reportBandwidth={true}
            selectedAudioTrack={selectedAudioIdx !== null
              ? { type: SelectedTrackType.INDEX, value: selectedAudioIdx }
              : { type: SelectedTrackType.SYSTEM }}
            selectedVideoTrack={selectedVideoTrackId !== null
              ? { type: SelectedVideoTrackType.INDEX, value: selectedVideoTrackId }
              : { type: SelectedVideoTrackType.AUTO }}
            selectedTextTrack={selectedTextIdx !== null
              ? { type: SelectedTrackType.INDEX, value: selectedTextIdx }
              : { type: SelectedTrackType.DISABLED }}
            // O buffer cabe na memória do aparelho (ver BUFFER_AO_VIVO).
            bufferingStrategy={BufferingStrategyType.DEPENDING_ON_MEMORY}
            bufferConfig={bufferConfig}
            preferredForwardBufferDuration={preferredForwardBufferDuration}
            // Ao vivo só mostra o tempo no relógio: uma vez por segundo basta.
            progressUpdateInterval={1000}
            controls={false}
            repeat
            ignoreSilentSwitch="ignore"
            playInBackground={false}
            focusable={false}
          />
        </View>

        {(isLoading || isRetrying) && !hasError && (
          <View style={styles.loadingOverlay} pointerEvents="none">
            <ActivityIndicator size="large" color={Colors.primary} />
            {isRetrying && <Text style={styles.retryingText}>Conectando ao canal...</Text>}
          </View>
        )}

        {isCasting && (
          <View style={styles.castingOverlay}>
            <MaterialIcons name="cast" size={56} color={Colors.primary} />
            <Text style={styles.castingTitle}>Transmitindo</Text>
            <Text style={styles.castingSubtitle}>{activeChannel.name}</Text>
          </View>
        )}

        {hasError && (
          <View style={styles.errorContainer}>
            <Ionicons name="alert-circle-outline" size={64} color={Colors.error} />
            <Text style={styles.errorTitle}>Canal indisponível</Text>
            <Text style={styles.errorText}>
              Este canal está temporariamente fora do ar.
            </Text>
            <TouchableOpacity style={styles.retryButton} onPress={handleRetry}>
              <Ionicons name="refresh" size={20} color={Colors.text} />
              <Text style={styles.retryText}>Tentar novamente</Text>
            </TouchableOpacity>
            {totalDeFontes > 1 && (
              <TouchableOpacity
                style={styles.backButtonError}
                onPress={() => { setMenuPage('fontes'); setShowMenu(true); }}
              >
                <Text style={styles.backButtonText}>Escolher outra fonte</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.backButtonError} onPress={handleBack}>
              <Text style={styles.backButtonText}>Voltar aos canais</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Top Bar */}
        {osdVisible && !showMenu && !showGuide && !hasError && (
          <View style={[styles.topBar, { paddingTop: insets.top + Spacing.sm }]}>
            <TouchableOpacity style={styles.iconButton} onPress={handleBack}>
              <Ionicons name="arrow-back" size={24} color={Colors.text} />
            </TouchableOpacity>
            <View style={{ flex: 1 }} />
            {/* O botão nativo do Cast é uma view do Android e não disputa o
                toque com o `Pressable` que cobre o player inteiro: tocar nele
                só mostrava e escondia a barra. Um `TouchableOpacity` ganha o
                toque, e a lista de aparelhos abre por baixo dele. */}
            <CastAction onlyDialog style={styles.iconButton} />
            {Platform.OS === 'android' && (
              <TouchableOpacity
                style={styles.iconButton}
                accessibilityLabel="Janela flutuante"
                onPress={() => videoRef.current?.enterPictureInPicture()}
              >
                <MaterialIcons name="picture-in-picture-alt" size={22} color={Colors.text} />
              </TouchableOpacity>
            )}
            {totalDeFontes > 1 && (
              <TouchableOpacity
                style={styles.iconButton}
                onPress={() => { setMenuPage('fontes'); setShowMenu(true); }}
              >
                <Ionicons name="swap-horizontal" size={22} color={Colors.text} />
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.iconButton} onPress={() => setShowGuide(true)}>
              <Ionicons name="list" size={22} color={Colors.text} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.iconButton} onPress={() => { setMenuPage('main'); setShowMenu(true); }}>
              <Ionicons name="settings-outline" size={22} color={Colors.text} />
            </TouchableOpacity>
          </View>
        )}

        {/* OSD Banner */}
        {osdVisible && !showMenu && !showGuide && !hasError && (
          <View style={[styles.osdContainer, { bottom: insets.bottom + 24, left: 24, right: 24 }]}>
            <View style={styles.osdBanner}>
              <View style={styles.osdLogoCol}>
                <View style={styles.osdLogoWrap}>
                  {activeChannel.logo ? (
                    <Image
                      source={{ uri: activeChannel.logo }}
                      style={styles.osdLogo}
                      contentFit="contain"
                      cachePolicy="memory-disk"
                    />
                  ) : (
                    <Ionicons name="tv-outline" size={32} color={Colors.textSecondary} />
                  )}
                </View>
                {activeChannel.channelNumber != null && (
                  <View style={styles.osdChNumBadge}>
                    <Text style={styles.osdChNum}>{String(activeChannel.channelNumber).padStart(2, '0')}</Text>
                  </View>
                )}
                <Text style={styles.osdChannelName} numberOfLines={1}>{activeChannel.name}</Text>
              </View>

              <View style={styles.osdDivider} />

              <View style={styles.osdEpgCol}>
                <View style={styles.osdLiveRow}>
                  <View style={styles.osdCatPill}>
                    <Text style={styles.osdCatText}>{activeChannel.category}</Text>
                  </View>
                  {videoResolution && (
                    <View style={styles.osdResBadge}>
                      <Text style={styles.osdResText}>{videoResolution}</Text>
                    </View>
                  )}
                  {audioLanguages.map((lang) => (
                    <View key={`aud-${lang}`} style={styles.osdAudBadge}>
                      <Ionicons name="volume-medium" size={11} color={Colors.text} />
                      <Text style={styles.osdAudText}>{lang}</Text>
                    </View>
                  ))}
                  {textTracks.length > 0 && (
                    <View style={styles.osdCcBadge}>
                      <Ionicons name="logo-closed-captioning" size={12} color={Colors.text} />
                      <Text style={styles.osdCcText}>CC</Text>
                    </View>
                  )}
                  {epg?.remaining ? (
                    <Text style={styles.osdRemaining}>{formatRemaining(epg.remaining)}</Text>
                  ) : null}
                </View>

                {epg?.current ? (
                  <>
                    <View style={styles.osdProgTitleRow}>
                      <Text style={styles.osdProgTitle} numberOfLines={1}>{epg.current.title}</Text>
                      <Text style={styles.osdProgTime}>
                        {formatTime(epg.current.startTime)}{' – '}{formatTime(epg.current.endTime)}
                      </Text>
                    </View>
                    {epg.current.description ? (
                      <Text style={styles.osdProgDesc} numberOfLines={2}>{epg.current.description}</Text>
                    ) : null}
                    <View style={styles.osdProgBar}>
                      <View style={[styles.osdProgFill, { width: `${Math.min(100, epg.progress ?? 0)}%` }]} />
                    </View>
                    {epg.next && (
                      <View style={styles.osdNextRow}>
                        <Ionicons name="chevron-forward" size={13} color={Colors.textMuted} />
                        <Text style={styles.osdNextTitle} numberOfLines={1}>{epg.next.title}</Text>
                        <Text style={styles.osdNextTime}>{formatTime(epg.next.startTime)}</Text>
                      </View>
                    )}
                  </>
                ) : (
                  <Text style={styles.osdNoEpg}>Sem informação de programação</Text>
                )}
              </View>

              <TouchableOpacity
                style={styles.iconButton}
                onPress={handleToggleFavorite}
              >
                <Ionicons
                  name={favorite ? 'heart' : 'heart-outline'}
                  size={22}
                  color={favorite ? '#FF4757' : Colors.text}
                />
              </TouchableOpacity>
            </View>
          </View>
        )}
      </Pressable>

      {/* Menu */}
      {showMenu && !showGuide && (
        <Pressable style={styles.menuOverlay} onPress={() => setShowMenu(false)}>
          <Pressable style={styles.menuCard} onPress={e => e.stopPropagation()}>
            <View style={styles.menuHeader}>
              <Text style={styles.menuChannelName} numberOfLines={1}>{activeChannel.name}</Text>
              {menuPage !== 'main' && (
                <TouchableOpacity style={styles.menuBackButton} onPress={() => setMenuPage('main')}>
                  <Ionicons name="chevron-back" size={18} color={Colors.text} />
                </TouchableOpacity>
              )}
            </View>
            <View style={styles.menuSeparator} />

            {/* Com o player deitado o painel tem uns 290 pt de altura e as
                opções não cabem: todas as páginas rolam, não só a de fontes. */}
            <ScrollView style={styles.menuRolagem} bounces={false}>
            {menuPage === 'main' && (
              <>
                <TouchableOpacity style={styles.menuItem} onPress={() => { handleToggleFavorite(); setShowMenu(false); }}>
                  <Ionicons name={favorite ? 'heart' : 'heart-outline'} size={20} color={favorite ? '#FF4757' : Colors.text} />
                  <Text style={styles.menuItemText}>{favorite ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.menuItem} onPress={() => { setShowGuide(true); setShowMenu(false); }}>
                  <Ionicons name="calendar-outline" size={20} color={Colors.text} />
                  <Text style={styles.menuItemText}>Guia de Programação</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.menuItem, totalDeFontes <= 1 && styles.menuItemDisabled]}
                  disabled={totalDeFontes <= 1}
                  onPress={() => setMenuPage('fontes')}
                >
                  <Ionicons name="swap-horizontal" size={20} color={Colors.text} />
                  <Text style={styles.menuItemText}>
                    {activeChannel.streams?.[sourceIndex]?.name
                      ?? `Fonte · ${Math.min(sourceIndex + 1, totalDeFontes)} de ${totalDeFontes}`}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.menuItem, audioTracks.length === 0 && styles.menuItemDisabled]}
                  disabled={audioTracks.length === 0}
                  onPress={() => setMenuPage('audio')}
                >
                  <Ionicons name="musical-notes-outline" size={20} color={Colors.text} />
                  <Text style={styles.menuItemText}>
                    Áudio{selectedAudioIdx !== null && audioTracks[selectedAudioIdx] ? ` · ${audioTracks[selectedAudioIdx].language ?? selectedAudioIdx + 1}` : ' · Padrão'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.menuItem, videoTracks.length === 0 && styles.menuItemDisabled]}
                  disabled={videoTracks.length === 0}
                  onPress={() => setMenuPage('video')}
                >
                  <Ionicons name="layers-outline" size={20} color={Colors.text} />
                  <Text style={styles.menuItemText}>
                    Qualidade{selectedVideoTrackId !== null
                      ? (() => {
                          const t = videoTracks[selectedVideoTrackId];
                          return t ? ` · ${t.height ? t.height + 'p' : 'Manual'}` : '';
                        })()
                      : ' · Auto'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.menuItem, textTracks.length === 0 && styles.menuItemDisabled]}
                  disabled={textTracks.length === 0}
                  onPress={() => setMenuPage('cc')}
                >
                  <Ionicons name="logo-closed-captioning" size={20} color={Colors.text} />
                  <Text style={styles.menuItemText}>
                    Legendas{selectedTextIdx !== null && textTracks[selectedTextIdx] ? ` · ${textTracks[selectedTextIdx].language ?? selectedTextIdx + 1}` : ' · Off'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.menuItem}
                  onPress={() => {
                    const next = zeroDelay === 'off' ? 'equilibrado' : zeroDelay === 'equilibrado' ? 'agressivo' : 'off';
                    setZeroDelay(next);
                  }}
                >
                  <Ionicons name="flash-outline" size={20} color={zeroDelay !== 'off' ? '#FFD700' : Colors.text} />
                  <Text style={styles.menuItemText}>
                    Zero Delay · {zeroDelay === 'agressivo' ? 'Agressivo' : zeroDelay === 'equilibrado' ? 'Equilibrado' : 'Desligado'}
                  </Text>
                </TouchableOpacity>
              </>
            )}

            {menuPage === 'fontes' && (
              <>
                {(activeChannel.streams ?? []).map((stream, i) => (
                  <TouchableOpacity
                    key={`${i}-${stream.url}`}
                    style={styles.menuItem}
                    onPress={() => escolherFonte(i)}
                  >
                    <Ionicons
                      name={sourceIndex === i ? 'radio-button-on' : 'radio-button-off'}
                      size={18}
                      color={Colors.text}
                    />
                    <Text style={styles.menuItemText} numberOfLines={1}>
                      {/* Como no TV Box: o nome da fonte (a temporada, nos canais 24h) ou o número e a qualidade. Nunca o servidor. */}
                      {[stream.name ?? `Fonte ${i + 1}`,
                        stream.quality && stream.quality !== 'Qualidade não informada' ? stream.quality : null,
                      ].filter(Boolean).join(' · ')}{stream.drm?.clearKey ? ' · DRM' : ''}
                    </Text>
                  </TouchableOpacity>
                ))}
              </>
            )}

            {menuPage === 'audio' && audioTracks.map((track: any, i: number) => (
              <TouchableOpacity
                key={i}
                style={styles.menuItem}
                onPress={() => { setSelectedAudioIdx(i); setMenuPage('main'); }}
              >
                <Ionicons
                  name={selectedAudioIdx === i ? 'radio-button-on' : 'radio-button-off'}
                  size={18}
                  color={Colors.text}
                />
                <Text style={styles.menuItemText}>{track.language ?? track.title ?? `Faixa ${i + 1}`}</Text>
              </TouchableOpacity>
            ))}

            {menuPage === 'video' && [null, ...videoTracks].map((track: any, i: number) => {
              const label = i === 0 ? 'Automático' : track?.height ? `${track.height}p` : `Qualidade ${i}`;
              const isActive = i === 0 ? selectedVideoTrackId === null : selectedVideoTrackId === i - 1;
              return (
                <TouchableOpacity
                  key={i}
                  style={styles.menuItem}
                  onPress={() => {
                    setSelectedVideoTrackId(i === 0 ? null : i - 1);
                    setMenuPage('main');
                  }}
                >
                  <Ionicons name={isActive ? 'radio-button-on' : 'radio-button-off'} size={18} color={Colors.text} />
                  <Text style={styles.menuItemText}>{label}</Text>
                </TouchableOpacity>
              );
            })}

            {menuPage === 'cc' && [null, ...textTracks].map((track: any, i: number) => {
              const label = i === 0 ? 'Desativado' : track?.language ?? track?.title ?? `Legenda ${i}`;
              const isActive = i === 0 ? selectedTextIdx === null : selectedTextIdx === i - 1;
              return (
                <TouchableOpacity
                  key={i}
                  style={styles.menuItem}
                  onPress={() => {
                    setSelectedTextIdx(i === 0 ? null : i - 1);
                    setMenuPage('main');
                  }}
                >
                  <Ionicons name={isActive ? 'radio-button-on' : 'radio-button-off'} size={18} color={Colors.text} />
                  <Text style={styles.menuItemText}>{label}</Text>
                </TouchableOpacity>
              );
            })}
            </ScrollView>
          </Pressable>
        </Pressable>
      )}

      <EPGGuideModal
        visible={showGuide}
        onClose={() => setShowGuide(false)}
        onChannelPress={handleSwitchChannel}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  videoContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000' },
  video: { width: '100%', height: '100%' },
  loadingOverlay: { ...StyleSheet.absoluteFill, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.4)', gap: 12 },
  retryingText: { color: Colors.textSecondary, fontSize: Typography.body.fontSize, fontWeight: '500' },
  castingOverlay: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.92)',
    gap: Spacing.sm,
  },
  castingTitle: { color: Colors.text, fontSize: Typography.h2.fontSize, fontWeight: '700' },
  castingSubtitle: { color: Colors.textSecondary, fontSize: Typography.body.fontSize },
  errorContainer: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.95)',
    padding: Spacing.xxl,
    gap: Spacing.md,
  },
  errorTitle: { color: Colors.text, fontSize: Typography.h2.fontSize, fontWeight: '700' },
  errorText: { color: Colors.textSecondary, fontSize: Typography.body.fontSize, textAlign: 'center' },
  retryButton: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md,
    borderRadius: BorderRadius.lg,
  },
  retryText: { color: Colors.text, fontWeight: '600' },
  backButtonError: { padding: Spacing.md },
  backButtonText: { color: Colors.textSecondary },

  topBar: {
    position: 'absolute', top: 0, left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.lg, paddingBottom: Spacing.sm,
    gap: Spacing.sm,
  },
  iconButton: {
    width: 40, height: 40,
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderRadius: BorderRadius.full,
    justifyContent: 'center', alignItems: 'center',
  },
  castWrap: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },

  osdContainer: { position: 'absolute' },
  osdBanner: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(6,6,18,0.94)',
    borderRadius: 16, borderWidth: 1, borderColor: 'rgba(99,102,241,0.32)',
    paddingVertical: Spacing.md, paddingHorizontal: Spacing.lg,
    gap: Spacing.lg, minHeight: 100,
  },
  osdLogoCol: { alignItems: 'center', gap: Spacing.xs, flexShrink: 0, width: 96 },
  osdLogoWrap: {
    width: 88, height: 56, backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: BorderRadius.md, justifyContent: 'center', alignItems: 'center',
    overflow: 'hidden',
  },
  osdLogo: { width: '82%', height: '82%' },
  osdChNumBadge: {
    backgroundColor: 'rgba(99,102,241,0.18)', borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.sm, paddingVertical: 2,
    borderWidth: 1, borderColor: 'rgba(99,102,241,0.38)',
  },
  osdChNum: { color: Colors.primaryLight, fontSize: 14, fontWeight: '800', letterSpacing: 1 },
  osdChannelName: { color: Colors.text, fontSize: 12, fontWeight: '700', textAlign: 'center', maxWidth: 100 },
  osdDivider: { width: 1, alignSelf: 'stretch', backgroundColor: 'rgba(255,255,255,0.08)' },
  osdEpgCol: { flex: 1, gap: 6, justifyContent: 'center' },
  osdLiveRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flexWrap: 'wrap' },
  osdCatPill: {
    backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.sm, paddingVertical: 2,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
  },
  osdCatText: { color: Colors.textSecondary, fontSize: 11, fontWeight: '500' },
  osdResBadge: {
    backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: BorderRadius.sm,
    paddingHorizontal: 8, paddingVertical: 2,
  },
  osdResText: { color: Colors.text, fontSize: 10, fontWeight: '700' },
  osdAudBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: BorderRadius.sm,
    paddingHorizontal: 6, paddingVertical: 2,
  },
  osdAudText: { color: Colors.text, fontSize: 10, fontWeight: '600' },
  osdCcBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: BorderRadius.sm,
    paddingHorizontal: 6, paddingVertical: 2,
  },
  osdCcText: { color: Colors.text, fontSize: 10, fontWeight: '700' },
  osdRemaining: { color: Colors.textMuted, fontSize: 11, marginLeft: 'auto' },
  osdProgTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  osdProgTitle: { color: Colors.text, fontSize: Typography.body.fontSize, fontWeight: '600', flex: 1 },
  osdProgTime: { color: Colors.textMuted, fontSize: 11, fontVariant: ['tabular-nums'] },
  osdProgDesc: { color: Colors.textSecondary, fontSize: 12, lineHeight: 16 },
  osdProgBar: { height: 3, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 2, overflow: 'hidden' },
  osdProgFill: { height: '100%', backgroundColor: Colors.primary },
  osdNextRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  osdNextTitle: { color: Colors.textMuted, fontSize: 11, flex: 1 },
  osdNextTime: { color: Colors.textMuted, fontSize: 11 },
  osdNoEpg: { color: Colors.textMuted, fontSize: 12 },

  menuOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center', alignItems: 'center',
    zIndex: 200,
  },
  menuCard: {
    width: 340, maxHeight: '80%',
    backgroundColor: 'rgba(8,8,20,0.98)',
    borderRadius: 16, borderWidth: 1, borderColor: 'rgba(99,102,241,0.32)',
    overflow: 'hidden',
  },
  menuHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.lg },
  menuChannelName: { flex: 1, color: Colors.text, fontSize: Typography.h3.fontSize, fontWeight: '700' },
  menuBackButton: { padding: 6, borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.08)' },
  menuSeparator: { height: 1, backgroundColor: 'rgba(255,255,255,0.07)' },
  menuRolagem: { flexGrow: 0, flexShrink: 1 },
  menuItem: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
  },
  menuItemDisabled: { opacity: 0.4 },
  menuItemText: { flex: 1, color: Colors.text, fontSize: Typography.body.fontSize },
});

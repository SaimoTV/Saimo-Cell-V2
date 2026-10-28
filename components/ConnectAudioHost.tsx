import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { View, StyleSheet } from 'react-native';
import Video, { DRMType, SelectedVideoTrackType } from 'react-native-video';
import { useConnectStore, TvSource } from '../stores/connectStore';
import { configureClearKey } from '../services/clearKeyServer';
import { instanteDaTv, tvTocando } from '../services/sincroniaTv';

interface AudioTrackProps {
  source: TvSource;
  /** Tela da TV cujo som este player acompanha (0 ou 1). */
  screenIdx: number;
  /** Endereço do Saimo Connect da TV, para a lista passar pela régua dela. */
  tvBase?: string;
  /** Filme: a régua é a posição no filme, não a hora do trecho. */
  vod?: boolean;
  volume: number;
  liveOffsetMs?: number;
  userOffsetMs?: number;
  initialPositionMs?: number;
}

const dadinhoCache = new Map<string, { resolved: string; timestamp: number }>();
const DADINHO_CACHE_TTL_MS = 90 * 60 * 1000; // 90 min

async function resolveAudioStream(source: TvSource, tvBase?: string): Promise<{
  uri: string;
  headers?: Record<string, string>;
  type?: 'm3u8' | 'mpd';
  drm?: { type: DRMType; licenseServer: string };
}> {
  let uri = source.url;
  let headers: Record<string, string> = {};
  if (source.referer) headers.Referer = source.referer;
  if (source.userAgent) headers['User-Agent'] = source.userAgent;

  // 1. Resolução dinâmica de Dadinho / TikTok CDN
  if (uri.includes('dadinhodetapioca.fun/play/')) {
    const cached = dadinhoCache.get(uri);
    const now = Date.now();
    if (cached && now - cached.timestamp < DADINHO_CACHE_TTL_MS) {
      uri = cached.resolved;
    } else {
      try {
        const resp = await fetch(uri, {
          headers: {
            Referer: 'https://rdcanais.org/',
            'User-Agent':
              source.userAgent ||
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          },
        });
        if (resp.ok) {
          const html = await resp.text();
          const match = html.match(/STREAM_URLS\s*=\s*\[\s*"([^"]+)"/);
          if (match && match[1]) {
            uri = match[1].replace(/\\\//g, '/');
            dadinhoCache.set(source.url, { resolved: uri, timestamp: now });
          }
        }
      } catch (e) {
        console.warn('[ConnectAudio] Erro ao resolver stream dadinho:', e);
      }
    }
  }

  // Se o stream for do dadinho ou tiktokcdn, injeta os cabeçalhos obrigatórios
  if (uri.includes('dadinhodetapioca.fun') || uri.includes('tiktokcdn.live')) {
    headers = {
      ...headers,
      Referer: 'https://dadinhodetapioca.fun/',
      Origin: 'https://dadinhodetapioca.fun',
    };
  }

  // 2. ClearKey DRM
  let drm: { type: DRMType; licenseServer: string } | undefined = undefined;
  if (source.keyId && source.key) {
    const licenseUrl = await configureClearKey(`${source.keyId}:${source.key}`);
    if (licenseUrl) {
      drm = {
        type: DRMType.CLEARKEY,
        licenseServer: licenseUrl,
      };
    }
  }

  // 3. Determina o tipo do fluxo para ExoPlayer
  const isHls =
    uri.split('?')[0].toLowerCase().endsWith('.m3u8') ||
    uri.split('?')[0].toLowerCase().endsWith('.txt') ||
    uri.includes('dadinhodetapioca.fun') ||
    uri.includes('tiktokcdn.live');

  const isDash =
    uri.split('?')[0].toLowerCase().endsWith('.mpd') ||
    Boolean(source.keyId && source.key);

  const type = isHls ? 'm3u8' : isDash ? 'mpd' : undefined;

  // HLS sem DRM passa pelo proxy da TV: ela devolve a lista com a marca de
  // horário de cada trecho (a real ou a sintética dela), e aí o player daqui
  // mede o tempo na mesma régua que a TV. Os pedaços vêm direto da origem,
  // com os mesmos cabeçalhos.
  if (isHls && !drm && tvBase) {
    const q = [`u=${encodeURIComponent(uri)}`];
    const referer = headers.Referer || source.referer;
    const agente = headers['User-Agent'] || source.userAgent;
    if (referer) q.push(`r=${encodeURIComponent(referer)}`);
    if (agente) q.push(`ua=${encodeURIComponent(agente)}`);
    uri = `${tvBase}/hls?${q.join('&')}`;
  }

  return {
    uri,
    headers: Object.keys(headers).length > 0 ? headers : undefined,
    type,
    drm,
  };
}

const AUDIO_BUFFER_CONFIG = {
  minBufferMs: 30000,
  maxBufferMs: 60000,
  bufferForPlaybackMs: 2500,
  bufferForPlaybackAfterRebufferMs: 5000,
  // A velocidade é só do controle de sincronia daqui: o ajuste ao vivo do
  // ExoPlayer brigaria com ele.
  live: {
    targetOffsetMs: 12000,
    minOffsetMs: 2000,
    maxOffsetMs: 60000,
    minPlaybackSpeed: 1.0,
    maxPlaybackSpeed: 1.0,
  },
};

/** Abaixo disso, som e imagem estão juntos: nada a corrigir. */
const SYNC_OK_MS = 20;
/** Acima disso, a correção volta a agir (folga para não ficar oscilando). */
const SYNC_RETOMA_MS = 50;
/** Acima disso, pula direto em vez de acelerar ou frear. */
const SYNC_PULO_MS = 1000;

const SingleAudioTrack = React.memo(
  function SingleAudioTrack({
    source,
    screenIdx,
    tvBase,
    volume,
    userOffsetMs = 0,
    initialPositionMs,
    vod = false,
  }: AudioTrackProps) {
    const [streamData, setStreamData] = useState<{
      uri: string;
      headers?: Record<string, string>;
      type?: 'm3u8' | 'mpd';
      drm?: { type: DRMType; licenseServer: string };
    } | null>(null);

    const [keyCounter, setKeyCounter] = useState(0);
    const videoRef = useRef<any>(null);
    const [playbackRate, setPlaybackRate] = useState(1.0);
    const [tvPausada, setTvPausada] = useState(false);

    const offsetRef = useRef(userOffsetMs);
    const prevUserOffsetRef = useRef(userOffsetMs);
    const ultimoPuloRef = useRef(0);
    /** Pulos seguidos sem acertar: o ponto da TV está fora do alcance. */
    const pulosRef = useRef<number[]>([]);
    const pausaDePulosRef = useRef(0);
    const amostrasRef = useRef<number[]>([]);
    const puloPendenteRef = useRef(false);
    /** Quanto o player leva para voltar a tocar depois de um pulo, em ms. */
    const antecipacaoRef = useRef(300);
    const corrigindoRef = useRef(false);
    const temReguaRef = useRef(false);
    const ultimoTempoRef = useRef(0);

    // Captura a posição inicial no momento da montagem/mudança de canal para não reiniciar a cada tick
    const startPosRef = useRef<number | undefined>(
      initialPositionMs && initialPositionMs > 0 ? Math.round(initialPositionMs) : undefined
    );
    const isVod = vod;

    useEffect(() => {
      let ativo = true;

      resolveAudioStream(source, tvBase)
        .then((data) => {
          if (ativo) {
            setStreamData(data);
          }
        })
        .catch((err) => {
          console.warn('[ConnectAudio] Falha ao resolver áudio:', err);
        });

      return () => {
        ativo = false;
      };
    }, [source.url, source.keyId, source.key, source.referer, source.userAgent, tvBase, keyCounter]);

    // O ajuste manual (atraso do fone Bluetooth, por exemplo) entra na conta
    // do controle. Sem régua (canal TS direto), vira um pulo do mesmo tanto.
    useEffect(() => {
      const delta = userOffsetMs - prevUserOffsetRef.current;
      prevUserOffsetRef.current = userOffsetMs;
      offsetRef.current = userOffsetMs;
      if (delta === 0 || temReguaRef.current) return;
      if (videoRef.current && ultimoTempoRef.current > 0) {
        videoRef.current.seek(Math.max(0, ultimoTempoRef.current - delta / 1000));
      }
    }, [userOffsetMs]);

    // Segue a TV pela régua comum: pula quando está longe, e acelera ou freia
    // de leve até encostar.
    const onProgress = useCallback(
      (data: { currentTime: number; currentPlaybackTime?: number }) => {
        ultimoTempoRef.current = data.currentTime;
        const tocando = tvTocando(screenIdx);
        if (tocando != null) setTvPausada(!tocando);

        const naTv = instanteDaTv(screenIdx);
        const aqui = isVod
          ? data.currentTime * 1000
          : data.currentPlaybackTime != null && data.currentPlaybackTime > 1e12
            ? data.currentPlaybackTime
            : null;
        temReguaRef.current = naTv != null && aqui != null;
        if (naTv == null || aqui == null) {
          amostrasRef.current = [];
          setPlaybackRate(1.0);
          return;
        }
        const agora = Date.now();
        // Logo depois de um pulo o player ainda está se acomodando.
        if (agora - ultimoPuloRef.current < 1500) return;

        // Positivo: o celular está adiantado em relação à TV. A decisão usa a
        // mediana das últimas amostras: um aviso atrasado ou um soluço do
        // player não mexe no som.
        const bruto = aqui - (naTv - offsetRef.current);
        amostrasRef.current = [...amostrasRef.current.slice(-4), bruto];
        if (amostrasRef.current.length < 3) return;
        const ordenadas = [...amostrasRef.current].sort((x, y) => x - y);
        const diff = ordenadas[Math.floor(ordenadas.length / 2)];

        // O que sobrou do último pulo ensina quanto o player demora para
        // voltar a tocar depois de pular: o próximo já mira à frente disso.
        if (puloPendenteRef.current) {
          puloPendenteRef.current = false;
          antecipacaoRef.current = Math.min(3000, Math.max(0, antecipacaoRef.current - diff));
        }

        const abs = Math.abs(diff);
        if (abs > SYNC_PULO_MS) {
          // Três pulos em 20 s sem encaixar: o trecho que a TV mostra não
          // está mais (ou ainda não está) disponível aqui. Insistir só
          // deixava o som mudo, recarregando a cada pulo; toca normal e tenta
          // de novo daqui a pouco.
          if (agora < pausaDePulosRef.current) {
            setPlaybackRate(1.0);
            return;
          }
          pulosRef.current = pulosRef.current.filter((t) => agora - t < 20000);
          if (pulosRef.current.length >= 3) {
            pulosRef.current = [];
            pausaDePulosRef.current = agora + 15000;
            setPlaybackRate(1.0);
            return;
          }
          pulosRef.current.push(agora);
          ultimoPuloRef.current = agora;
          puloPendenteRef.current = true;
          amostrasRef.current = [];
          corrigindoRef.current = false;
          setPlaybackRate(1.0);
          videoRef.current?.seek(Math.max(0, data.currentTime + (antecipacaoRef.current - diff) / 1000));
          return;
        }
        if (abs > SYNC_RETOMA_MS || (corrigindoRef.current && abs > SYNC_OK_MS)) {
          corrigindoRef.current = true;
          // Até 8% mais rápido ou mais lento, proporcional à diferença: some
          // em poucos segundos sem dar para ouvir a mudança.
          const ajuste = Math.min(0.08, Math.max(0.02, abs / 4000));
          const rate = Math.round((diff > 0 ? 1 - ajuste : 1 + ajuste) * 100) / 100;
          setPlaybackRate(rate);
          return;
        }
        corrigindoRef.current = false;
        setPlaybackRate(1.0);
      },
      [screenIdx, isVod]
    );

    // Objeto estável e memoizado para o react-native-video nunca recriar o player sem necessidade
    const sourceProp = useMemo(() => {
      if (!streamData) return null;
      return {
        uri: streamData.uri,
        type: streamData.type,
        headers: streamData.headers,
        startPosition: startPosRef.current,
        bufferConfig: AUDIO_BUFFER_CONFIG,
        // Texto da notificação de mídia (o serviço que segura o som em segundo plano).
        metadata: { title: 'Som da TV', artist: 'Saimo Connect' },
      };
    }, [streamData?.uri, streamData?.type, streamData?.headers]);

    if (!streamData || !sourceProp) return null;

    return (
      <Video
        ref={videoRef}
        key={`audio-video-${streamData.uri}-${keyCounter}`}
        source={sourceProp}
        bufferConfig={AUDIO_BUFFER_CONFIG}
        drm={streamData.drm}
        paused={tvPausada}
        rate={playbackRate}
        volume={volume}
        muted={volume <= 0}
        playInBackground={true}
        playWhenInactive={true}
        // Serviço em primeiro plano de mídia: sem ele o Android congela ou mata
        // o app com a tela apagada e o som some depois de alguns minutos.
        showNotificationControls={true}
        ignoreSilentSwitch="ignore"
        disableFocus={true}
        preventsDisplaySleepDuringVideoPlayback={false}
        progressUpdateInterval={250}
        // Só o som: sem decodificar a imagem, o pulo é quase instantâneo e
        // gasta bem menos bateria.
        selectedVideoTrack={{ type: SelectedVideoTrackType.DISABLED }}
        onProgress={onProgress}
        style={styles.hiddenVideo}
        onError={(err) => {
          console.warn('[ConnectAudio] Erro ao tocar áudio no celular:', err);
          setTimeout(() => {
            setKeyCounter((k) => k + 1);
          }, 2500);
        }}
      />
    );
  },
  (prev, next) => {
    return (
      prev.source.url === next.source.url &&
      prev.source.keyId === next.source.keyId &&
      prev.source.key === next.source.key &&
      prev.source.referer === next.source.referer &&
      prev.source.userAgent === next.source.userAgent &&
      prev.screenIdx === next.screenIdx &&
      prev.tvBase === next.tvBase &&
      prev.vod === next.vod &&
      prev.volume === next.volume &&
      prev.userOffsetMs === next.userOffsetMs
    );
  }
);

/**
 * Host de áudio transparente montado no topo da árvore do app (_layout.tsx).
 * Toca apenas o som da fonte escolhida (Canal 1, Canal 2 ou ambos) com a tela
 * do celular desligada ou em segundo plano, sem desenhar vídeo.
 */
export default function ConnectAudioHost() {
  const phoneAudioMode = useConnectStore((s) => s.phoneAudioMode);
  const tvState = useConnectStore((s) => s.tvState);
  const status = useConnectStore((s) => s.status);
  const audioSyncDelayMs = useConnectStore((s) => s.audioSyncDelayMs);
  const connectedTv = useConnectStore((s) => s.connectedTv);
  const tvBase = connectedTv?.ip ? `http://${connectedTv.ip}:${connectedTv.port || 8999}` : undefined;

  if (status !== 'connected' || !tvState || phoneAudioMode === 'none') {
    return null;
  }

  const isVod = tvState.mode === 'vod';
  const vodPos = tvState.vod?.pos;

  const sc0 = tvState.screens?.find((s) => s.idx === 0);
  const sc1 = tvState.screens?.find((s) => s.idx === 1);
  const s0 = sc0?.source;
  const s1 = sc1?.source;

  const playScreen0 = (phoneAudioMode === '0' || phoneAudioMode === 'both') && Boolean(s0?.url);
  const playScreen1 = (phoneAudioMode === '1' || phoneAudioMode === 'both') && Boolean(s1?.url);

  return (
    <View pointerEvents="none" style={styles.container}>
      {playScreen0 && s0 && (
        <SingleAudioTrack
          key={`audio-track-0-${s0.url}`}
          source={s0}
          screenIdx={0}
          tvBase={tvBase}
          volume={1.0}
          userOffsetMs={audioSyncDelayMs}
          initialPositionMs={isVod ? vodPos : undefined}
          vod={isVod}
        />
      )}
      {playScreen1 && s1 && (
        <SingleAudioTrack
          key={`audio-track-1-${s1.url}`}
          source={s1}
          screenIdx={1}
          tvBase={tvBase}
          volume={1.0}
          userOffsetMs={audioSyncDelayMs}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: -100,
    left: -100,
    width: 2,
    height: 2,
    opacity: 0.01,
    overflow: 'hidden',
  },
  hiddenVideo: {
    width: 2,
    height: 2,
  },
});

import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Network from 'expo-network';
import { Platform } from 'react-native';

export interface TvSource {
  url: string;
  referer?: string | null;
  userAgent?: string | null;
  keyId?: string | null;
  key?: string | null;
}

export interface TvScreen {
  idx: number;
  channel: string;
  num: number;
  logo: string | null;
  program: string | null;
  source: TvSource;
  sourceIndex: number;
  liveOffset?: number; // em milissegundos
}

export interface EpisodioTv {
  numero: number;
  titulo?: string;
  /** 0 a 1: quanto já foi visto. */
  visto?: number;
  noAr?: boolean;
}

export interface TvState {
  mode: 'idle' | 'live' | 'vod' | 'radio';
  screen?: 'home' | 'live' | 'vod' | 'radio' | 'search' | 'settings' | 'guide' | 'idle';
  searchText?: string;
  playing: boolean;
  multi: boolean;
  active: number; // 0 ou 1
  tvAudio: '0' | '1' | 'mute';
  screens: TvScreen[];
  vod?: {
    title: string;
    subtitle?: string;
    poster?: string;
    pos: number;
    dur: number;
    key: string;
    /** Série: temporada e episódio no ar e as temporadas que existem (TV Box). */
    serie?: boolean;
    temporada?: number;
    episodio?: number;
    temporadas?: number[];
  };
  volume: number;
  muted: boolean;
  phoneAudio?: Array<{
    cid: string;
    name: string;
    src: '0' | '1' | 'both' | 'none';
  }>;
  /** Saimo Connect 2 (TV Box 3.2.1+): o que dá para escolher pelo celular. */
  versaoConnect?: number;
  /** O que a TV sabe fazer: fontes, faixas, favorito, anterior, timer, telas. */
  recursos?: string[];
  fontes?: Array<{ rotulo: string; detalhe?: string }>;
  fonteAtual?: number;
  faixas?: {
    audio: Array<{ rotulo: string; ativa: boolean }>;
    legendas: Array<{ rotulo: string; ativa: boolean }>;
    semLegenda: boolean;
  } | null;
  favorito?: boolean | null;
  /** Minutos que faltam no timer de desligar (0 = desligado). */
  timer?: number;
}

export interface DiscoveredTv {
  id: string;
  name: string;
  ip: string;
  port: number;
  version?: string;
  lastSeen: number;
}

export type ConnectionStatus =
  | 'disconnected'
  | 'discovering'
  | 'connecting'
  | 'pending'
  | 'connected';

export type PhoneAudioMode = 'none' | '0' | '1' | 'both';

interface ConnectStoreState {
  cid: string;
  phoneName: string;
  status: ConnectionStatus;
  discoveredTvs: DiscoveredTv[];
  connectedTv: DiscoveredTv | null;
  tvState: TvState | null;
  /** Quando o último estado chegou (para a barra do filme andar entre um e outro). */
  tvStateEm: number;
  phoneAudioMode: PhoneAudioMode;
  audioSyncDelayMs: number;
  isSheetVisible: boolean;
  isRemoteVisible: boolean;
  isMultiAudioVisible: boolean;
  textRequest: { hint: string; value: string } | null;
  pendingPin: string | null;
  /** Android 17 negou o acesso à rede local: a busca e a conexão não saem do celular. */
  semPermissaoRede: boolean;
  /** Episódios de uma temporada da série no ar, pedidos à TV. */
  episodiosTv: { temporada: number; lista: EpisodioTv[] } | null;
  setEpisodiosTv: (e: { temporada: number; lista: EpisodioTv[] } | null) => void;
  /** TV recém-conectada esperando a resposta de "sincronizar?". */
  sincroniaPergunta: DiscoveredTv | null;

  // Ações
  setCid: (cid: string) => void;
  setPhoneName: (name: string) => void;
  setStatus: (status: ConnectionStatus) => void;
  setDiscoveredTvs: (tvs: DiscoveredTv[]) => void;
  addDiscoveredTv: (tv: DiscoveredTv) => void;
  setConnectedTv: (tv: DiscoveredTv | null) => void;
  setTvState: (state: TvState | null) => void;
  setPhoneAudioMode: (mode: PhoneAudioMode) => void;
  setAudioSyncDelayMs: (delay: number) => void;
  setSheetVisible: (visible: boolean) => void;
  setRemoteVisible: (visible: boolean) => void;
  setMultiAudioVisible: (visible: boolean) => void;
  setTextRequest: (req: { hint: string; value: string } | null) => void;
  setPendingPin: (pin: string | null) => void;
  setSemPermissaoRede: (v: boolean) => void;
  setSincroniaPergunta: (tv: DiscoveredTv | null) => void;
}

const STORAGE_KEY_CID = '@saimo_connect_cid';
const STORAGE_KEY_LAST_TV = '@saimo_connect_last_tv';
const STORAGE_KEY_PHONE_NAME = '@saimo_connect_phone_name';

export const useConnectStore = create<ConnectStoreState>((set, get) => ({
  cid: '',
  phoneName: Platform.OS === 'ios' ? 'iPhone' : 'Celular Android',
  status: 'disconnected',
  discoveredTvs: [],
  connectedTv: null,
  tvState: null,
  tvStateEm: 0,
  phoneAudioMode: 'none',
  audioSyncDelayMs: 0,
  isSheetVisible: false,
  isRemoteVisible: false,
  isMultiAudioVisible: false,
  textRequest: null,
  pendingPin: null,
  semPermissaoRede: false,

  setCid: (cid) => set({ cid }),
  setPhoneName: (phoneName) => set({ phoneName }),
  setStatus: (status) => set({ status }),
  setDiscoveredTvs: (discoveredTvs) => set({ discoveredTvs }),
  addDiscoveredTv: (tv) => {
    const list = get().discoveredTvs.filter((item) => item.id !== tv.id);
    set({ discoveredTvs: [tv, ...list] });
  },
  setConnectedTv: (connectedTv) => {
    set({ connectedTv });
    if (connectedTv) {
      AsyncStorage.setItem(STORAGE_KEY_LAST_TV, JSON.stringify(connectedTv)).catch(() => {});
    }
  },
  setTvState: (tvState) => {
    const antes = get().tvState;
    // Filme começou na TV: abre o controle, com a barra de progresso à mão.
    const comecouFilme = tvState?.mode === 'vod' && antes?.mode !== 'vod';
    set(comecouFilme ? { tvState, tvStateEm: Date.now(), isRemoteVisible: true } : { tvState, tvStateEm: Date.now() });
  },
  setPhoneAudioMode: (phoneAudioMode) => set({ phoneAudioMode }),
  setAudioSyncDelayMs: (audioSyncDelayMs) => {
    set({ audioSyncDelayMs });
    AsyncStorage.setItem('@saimo_connect_audio_delay', String(audioSyncDelayMs)).catch(() => {});
  },
  setSheetVisible: (isSheetVisible) => set({ isSheetVisible }),
  setRemoteVisible: (isRemoteVisible) => set({ isRemoteVisible }),
  setMultiAudioVisible: (isMultiAudioVisible) => set({ isMultiAudioVisible }),
  setTextRequest: (textRequest) => set({ textRequest }),
  setPendingPin: (pendingPin) => set({ pendingPin }),
  setSemPermissaoRede: (semPermissaoRede) => set({ semPermissaoRede }),
  sincroniaPergunta: null,
  episodiosTv: null,
  setEpisodiosTv: (episodiosTv) => set({ episodiosTv }),
  setSincroniaPergunta: (sincroniaPergunta) => set({ sincroniaPergunta }),
}));

// Inicializador de persistência leve
export async function initConnectStore(): Promise<void> {
  try {
    let cid = await AsyncStorage.getItem(STORAGE_KEY_CID);
    if (!cid) {
      cid = 'cell-' + Math.random().toString(36).substring(2, 10) + '-' + Date.now().toString(36);
      await AsyncStorage.setItem(STORAGE_KEY_CID, cid);
    }
    useConnectStore.getState().setCid(cid);

    const savedName = await AsyncStorage.getItem(STORAGE_KEY_PHONE_NAME);
    if (savedName) {
      useConnectStore.getState().setPhoneName(savedName);
    }

    const savedDelay = await AsyncStorage.getItem('@saimo_connect_audio_delay');
    if (savedDelay !== null) {
      const parsedDelay = parseInt(savedDelay, 10);
      if (!isNaN(parsedDelay)) {
        useConnectStore.getState().setAudioSyncDelayMs(parsedDelay);
      }
    }

    const lastTvJson = await AsyncStorage.getItem(STORAGE_KEY_LAST_TV);
    if (lastTvJson) {
      const lastTv = JSON.parse(lastTvJson) as DiscoveredTv;
      useConnectStore.getState().addDiscoveredTv(lastTv);
    }
  } catch (_e) {}
}

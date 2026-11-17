import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { NativeModules, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { kidsAtivo } from '../services/perfis';

// Senha do controle parental: 0000 em todos os apps (até a 3.1 o celular vinha com 1234).
const DEFAULT_PIN = '0000';
const PIN_ANTIGO_DE_FABRICA = '1234';

export type UpscalingMode = 'off' | 'hd' | '4k';
export type ZeroDelayMode = 'off' | 'equilibrado' | 'agressivo';

function syncNativeUpscaling(mode: UpscalingMode) {
    if (Platform.OS === 'android') {
        try {
            NativeModules.SaimoUpscaling?.setMode?.(mode);
        } catch {
            // Ignora se o módulo nativo não estiver disponível
        }
    }
}

function syncNativeAudioInteligente(enabled: boolean) {
    if (Platform.OS === 'android') {
        try {
            NativeModules.SaimoAudioInteligente?.setEnabled?.(enabled);
        } catch {
            // Ignora se o módulo nativo não estiver disponível
        }
    }
}

export interface SettingsStore {
    // PIN e controle adulto
    adultPin: string;
    adultUnlocked: boolean;

    // Player
    autoplay: boolean;
    volume: number;
    upscaling: UpscalingMode;
    audioInteligente: boolean;
    zeroDelay: ZeroDelayMode;

    // UI
    showChannelNumber: boolean;
    showEPG: boolean;

    // Ações
    setAdultPin: (pin: string) => void;
    verifyPin: (pin: string) => boolean;
    unlockAdult: () => void;
    lockAdult: () => void;
    setAutoplay: (value: boolean) => void;
    setVolume: (value: number) => void;
    setUpscaling: (value: UpscalingMode) => void;
    setAudioInteligente: (value: boolean) => void;
    setZeroDelay: (value: ZeroDelayMode) => void;
    setShowChannelNumber: (value: boolean) => void;
    setShowEPG: (value: boolean) => void;
    resetSettings: () => void;
}

const initialState = {
    adultPin: DEFAULT_PIN,
    adultUnlocked: false,
    autoplay: true,
    volume: 1,
    upscaling: 'off' as UpscalingMode,
    audioInteligente: true,
    zeroDelay: 'off' as ZeroDelayMode,
    showChannelNumber: true,
    showEPG: true,
};

export const useSettingsStore = create<SettingsStore>()(
    persist(
        (set, get) => ({
            ...initialState,

            setAdultPin: (pin: string) => {
                if (pin.length === 4 && /^\d{4}$/.test(pin)) {
                    set({ adultPin: pin });
                }
            },

            verifyPin: (pin: string) => {
                // No perfil Kids o conteúdo adulto nunca destranca, nem com a senha.
                if (kidsAtivo()) return false;
                return get().adultPin === pin;
            },

            unlockAdult: () => {
                if (kidsAtivo()) return;
                set({ adultUnlocked: true });
            },

            lockAdult: () => {
                set({ adultUnlocked: false });
            },

            setAutoplay: (value: boolean) => {
                set({ autoplay: value });
            },

            setVolume: (value: number) => {
                set({ volume: Math.max(0, Math.min(1, value)) });
            },

            setUpscaling: (value: UpscalingMode) => {
                syncNativeUpscaling(value);
                set({ upscaling: value });
            },

            setAudioInteligente: (value: boolean) => {
                syncNativeAudioInteligente(value);
                set({ audioInteligente: value });
            },

            setZeroDelay: (value: ZeroDelayMode) => {
                set({ zeroDelay: value });
            },

            setShowChannelNumber: (value: boolean) => {
                set({ showChannelNumber: value });
            },

            setShowEPG: (value: boolean) => {
                set({ showEPG: value });
            },

            resetSettings: () => {
                syncNativeUpscaling('off');
                syncNativeAudioInteligente(true);
                set(initialState);
            },
        }),
        {
            name: 'saimo-settings',
            storage: createJSONStorage(() => AsyncStorage),
            partialize: (state) => ({
                adultPin: state.adultPin,
                adultUnlocked: state.adultUnlocked,
                autoplay: state.autoplay,
                volume: state.volume,
                upscaling: state.upscaling,
                audioInteligente: state.audioInteligente,
                zeroDelay: state.zeroDelay,
                showChannelNumber: state.showChannelNumber,
                showEPG: state.showEPG,
            }),
            onRehydrateStorage: () => (state) => {
                // Quem nunca trocou a senha estava com a de fábrica antiga: passa para 0000.
                if (state && state.adultPin === PIN_ANTIGO_DE_FABRICA) state.adultPin = DEFAULT_PIN;
                if (state?.upscaling) {
                    syncNativeUpscaling(state.upscaling);
                }
                if (state?.audioInteligente !== undefined) {
                    syncNativeAudioInteligente(state.audioInteligente);
                }
            },
        }
    )
);

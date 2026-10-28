import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { NativeModules, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const DEFAULT_PIN = '1234';

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
                return get().adultPin === pin;
            },

            unlockAdult: () => {
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

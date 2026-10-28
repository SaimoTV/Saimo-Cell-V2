import React, { useCallback, useEffect, useRef } from 'react';
import {
    TouchableOpacity,
    View,
    Text,
    StyleSheet,
    Alert,
    Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useDownloadStore } from '../stores/downloadStore';
import { downloadManager } from '../services/downloadManager';
import { Colors, Spacing, BorderRadius, Typography } from '../constants/Colors';
import type { DownloadStatus } from '../types';

// -----------------------------------------------------------------------
// Circular progress ring (two-half technique)
// -----------------------------------------------------------------------
function ProgressRing({ progress, size = 40 }: { progress: number; size?: number }) {
    const half = size / 2;
    const stroke = 2.5;
    const pct = Math.max(0, Math.min(1, progress));
    const deg = pct * 360;

    // First half: rotate from -180 to 0 (covers 0–50%)
    const firstRot = Math.min(deg, 180) - 180;
    // Second half: rotate from 0 to 180 (covers 50–100%)
    const secondRot = Math.max(deg - 180, 0);
    const showSecond = deg > 180;

    const circleStyle = {
        width: size,
        height: size,
        borderRadius: half,
        borderWidth: stroke,
    };

    return (
        <View style={{ width: size, height: size }}>
            {/* Track */}
            <View style={[circleStyle, { borderColor: Colors.border, position: 'absolute' }]} />

            {/* Left half (right side visible) — 0–180 deg */}
            <View
                style={{
                    position: 'absolute',
                    right: 0,
                    top: 0,
                    width: half,
                    height: size,
                    overflow: 'hidden',
                }}
            >
                <View
                    style={[
                        circleStyle,
                        {
                            position: 'absolute',
                            right: 0,
                            borderColor: pct > 0 ? Colors.primary : 'transparent',
                            transform: [{ rotate: `${firstRot}deg` }],
                        },
                    ]}
                />
            </View>

            {/* Right half (left side visible) — 180–360 deg */}
            {showSecond && (
                <View
                    style={{
                        position: 'absolute',
                        left: 0,
                        top: 0,
                        width: half,
                        height: size,
                        overflow: 'hidden',
                    }}
                >
                    <View
                        style={[
                            circleStyle,
                            {
                                position: 'absolute',
                                left: 0,
                                borderColor: Colors.primary,
                                transform: [{ rotate: `${secondRot}deg` }],
                            },
                        ]}
                    />
                </View>
            )}

            {/* Center percentage */}
            <View style={[StyleSheet.absoluteFill, { justifyContent: 'center', alignItems: 'center' }]}>
                <Text style={{ color: Colors.primary, fontSize: 9, fontWeight: '700' }}>
                    {Math.round(pct * 100)}
                </Text>
            </View>
        </View>
    );
}

// -----------------------------------------------------------------------
// Main DownloadButton
// -----------------------------------------------------------------------

interface DownloadButtonProps {
    itemId: string;
    onDownload: () => Promise<void>;
    size?: 'normal' | 'small';
    style?: object;
}

export default function DownloadButton({ itemId, onDownload, size = 'normal', style }: DownloadButtonProps) {
    const item = useDownloadStore((s) => s.items[itemId]);
    const task = useDownloadStore((s) => s.tasks[itemId]);
    const pulseAnim = useRef(new Animated.Value(1)).current;

    const status: DownloadStatus | 'idle' = item
        ? 'completed'
        : task?.status ?? 'idle';

    // Pulse for queued state
    useEffect(() => {
        if (status === 'queued') {
            const loop = Animated.loop(
                Animated.sequence([
                    Animated.timing(pulseAnim, { toValue: 0.4, duration: 700, useNativeDriver: true }),
                    Animated.timing(pulseAnim, { toValue: 1, duration: 700, useNativeDriver: true }),
                ])
            );
            loop.start();
            return () => loop.stop();
        } else {
            pulseAnim.setValue(1);
        }
    }, [status]);

    const handlePress = useCallback(async () => {
        switch (status as string) {
            case 'idle':
            case 'failed':
            case 'cancelled':
                try {
                    await onDownload();
                } catch (e: any) {
                    const msg = e.message;
                    if (msg === 'HLS_NOT_SUPPORTED') {
                        // Não é conteúdo ao vivo — era o que esta mensagem
                        // dizia, num filme comum, só porque a fonte publicada
                        // primeiro é uma playlist do EmbedPlayer.
                        Alert.alert(
                            'Não dá para baixar',
                            'As fontes deste título são transmissões em pedaços: dá para assistir, não para baixar.',
                        );
                    } else if (msg !== 'ALREADY_DOWNLOADED' && msg !== 'ALREADY_QUEUED') {
                        Alert.alert('Erro', 'Não foi possível iniciar o download.');
                    }
                }
                break;

            case 'queued':
                Alert.alert('Download na fila', 'Deseja cancelar?', [
                    { text: 'Não', style: 'cancel' },
                    { text: 'Cancelar download', style: 'destructive', onPress: () => downloadManager.cancel(itemId) },
                ]);
                break;

            case 'downloading':
                downloadManager.pause(itemId);
                break;

            case 'paused':
                downloadManager.resume(itemId);
                break;

            case 'completed':
                Alert.alert(
                    item?.title ?? 'Baixado',
                    'Conteúdo disponível offline.',
                    [
                        { text: 'Fechar', style: 'cancel' },
                        {
                            text: 'Excluir download',
                            style: 'destructive',
                            onPress: () =>
                                Alert.alert('Excluir?', 'O arquivo será removido do dispositivo.', [
                                    { text: 'Cancelar', style: 'cancel' },
                                    {
                                        text: 'Excluir',
                                        style: 'destructive',
                                        onPress: () => downloadManager.removeDownload(itemId),
                                    },
                                ]),
                        },
                    ]
                );
                break;
        }
    }, [status, itemId, item, onDownload]);

    if (size === 'small') {
        return (
            <TouchableOpacity
                onPress={handlePress}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                style={[styles.smallBtn, style]}
                activeOpacity={0.7}
            >
                {renderSmallIcon(status, task?.progress ?? 0, pulseAnim)}
            </TouchableOpacity>
        );
    }

    return (
        <TouchableOpacity
            onPress={handlePress}
            style={[styles.iconButton, getButtonActiveStyle(status), style]}
            activeOpacity={0.7}
        >
            {renderNormalIcon(status, task?.progress ?? 0, pulseAnim)}
        </TouchableOpacity>
    );
}

function renderNormalIcon(
    status: DownloadStatus | 'idle',
    progress: number,
    pulseAnim: Animated.Value
) {
    switch (status) {
        case 'idle':
            return <Ionicons name="download-outline" size={24} color={Colors.text} />;

        case 'queued':
            return (
                <Animated.View style={{ opacity: pulseAnim }}>
                    <Ionicons name="time-outline" size={24} color={Colors.primary} />
                </Animated.View>
            );

        case 'downloading':
            return <ProgressRing progress={progress} size={40} />;

        case 'paused':
            return <Ionicons name="pause-circle-outline" size={24} color={Colors.warning} />;

        case 'failed':
            return <Ionicons name="alert-circle-outline" size={24} color={Colors.error} />;

        case 'completed':
            return <Ionicons name="checkmark-circle" size={24} color={Colors.success} />;

        default:
            return <Ionicons name="download-outline" size={24} color={Colors.text} />;
    }
}

function renderSmallIcon(
    status: DownloadStatus | 'idle',
    progress: number,
    pulseAnim: Animated.Value
) {
    switch (status) {
        case 'idle':
            return <Ionicons name="download-outline" size={20} color={Colors.textSecondary} />;

        case 'queued':
            return (
                <Animated.View style={{ opacity: pulseAnim }}>
                    <Ionicons name="time-outline" size={20} color={Colors.primary} />
                </Animated.View>
            );

        case 'downloading':
            return (
                <View style={styles.smallProgress}>
                    <Text style={styles.smallProgressText}>{Math.round(progress * 100)}%</Text>
                </View>
            );

        case 'paused':
            return <Ionicons name="pause-circle-outline" size={20} color={Colors.warning} />;

        case 'failed':
            return <Ionicons name="alert-circle-outline" size={20} color={Colors.error} />;

        case 'completed':
            return <Ionicons name="checkmark-circle" size={20} color={Colors.success} />;

        default:
            return <Ionicons name="download-outline" size={20} color={Colors.textSecondary} />;
    }
}

function getButtonActiveStyle(status: DownloadStatus | 'idle') {
    if (status === 'completed') return styles.iconButtonSuccess;
    if (status === 'downloading' || status === 'queued') return styles.iconButtonActive;
    if (status === 'paused') return styles.iconButtonWarning;
    if (status === 'failed') return styles.iconButtonError;
    return {};
}

const styles = StyleSheet.create({
    iconButton: {
        backgroundColor: Colors.surface,
        padding: Spacing.md,
        borderRadius: BorderRadius.md,
        alignItems: 'center',
        justifyContent: 'center',
        width: 52,
        height: 52,
    },
    iconButtonActive: {
        backgroundColor: 'rgba(99,102,241,0.15)',
    },
    iconButtonSuccess: {
        backgroundColor: 'rgba(16,185,129,0.15)',
    },
    iconButtonWarning: {
        backgroundColor: 'rgba(245,158,11,0.15)',
    },
    iconButtonError: {
        backgroundColor: 'rgba(239,68,68,0.15)',
    },
    smallBtn: {
        padding: Spacing.xs,
        alignItems: 'center',
        justifyContent: 'center',
    },
    smallProgress: {
        width: 28,
        height: 28,
        borderRadius: 14,
        borderWidth: 2,
        borderColor: Colors.primary,
        alignItems: 'center',
        justifyContent: 'center',
    },
    smallProgressText: {
        color: Colors.primary,
        fontSize: 8,
        fontWeight: '700',
    },
});

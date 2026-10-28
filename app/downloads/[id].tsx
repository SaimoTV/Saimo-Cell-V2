import React, { useMemo, useCallback, useEffect, useState } from 'react';
import { useMediaStore } from '../../stores/mediaStore';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    StatusBar,
    Alert,
    ActivityIndicator,
} from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { Colors, Typography, Spacing, BorderRadius } from '../../constants/Colors';
import { useDownloadStore } from '../../stores/downloadStore';
import { downloadManager } from '../../services/downloadManager';
import { openDownload } from '../../services/playDownload';
import { formatBytes } from '../../services/downloadUtils';
import { resolveDownloadId } from '../../services/downloadRouting';
import type { DownloadItem } from '../../types';

// -----------------------------------------------------------------------
// Episode row component
// -----------------------------------------------------------------------
function EpisodeDownloadItem({ 
    ep, 
    onPlay, 
    onDelete 
}: { 
    ep: DownloadItem; 
    onPlay: (ep: DownloadItem) => void; 
    onDelete: (ep: DownloadItem) => void;
}) {
    const progress = useMediaStore(s => s.watchHistory.find(h => h.id === ep.id));
    const pct = (progress?.progress && progress?.duration) ? (progress.progress / progress.duration) * 100 : 0;

    return (
        <TouchableOpacity
            style={styles.episodeCard}
            onPress={() => onPlay(ep)}
            activeOpacity={0.8}
        >
            <View style={styles.episodeNumber}>
                <Text style={styles.episodeNumberText}>
                    {ep.episodeNumber ?? '?'}
                </Text>
            </View>

            <View style={styles.episodeInfo}>
                <Text style={styles.episodeName} numberOfLines={1}>
                    {ep.subtitle ?? `Episódio ${ep.episodeNumber}`}
                </Text>
                {pct > 0 && pct < 95 ? (
                    <View style={styles.epProgressRow}>
                        <View style={styles.epProgressContainer}>
                            <View style={[styles.epProgressFill, { width: `${pct}%` }]} />
                        </View>
                        <Text style={styles.epProgressPct}>{Math.round(pct)}%</Text>
                    </View>
                ) : (
                    <Text style={styles.episodeSize}>{formatBytes(ep.fileSize)}</Text>
                )}
            </View>

            <TouchableOpacity
                onPress={() => onDelete(ep)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                style={styles.deleteEpBtn}
            >
                <Ionicons name="trash-outline" size={18} color={Colors.textSecondary} />
            </TouchableOpacity>

            <Ionicons name="play-circle" size={32} color={Colors.primary} />
        </TouchableOpacity>
    );
}

export default function SeriesDownloadsDetailScreen() {
    const { id: routeId } = useLocalSearchParams<{ id: string }>();
    const router = useRouter();
    const insets = useSafeAreaInsets();

    const items = useDownloadStore((s) => s.items);
    const [hydrated, setHydrated] = useState(useDownloadStore.persist.hasHydrated());
    useEffect(() => {
        const unsubscribe = useDownloadStore.persist.onFinishHydration(() => setHydrated(true));
        setHydrated(useDownloadStore.persist.hasHydrated());
        return unsubscribe;
    }, []);
    const seriesId = useMemo(() => resolveDownloadId(
        routeId,
        Object.values(items).filter(i => i.itemType === 'episode').map(i => i.seriesId ?? i.mediaId),
    ), [routeId, items]);

    // All downloaded episodes for this series
    const episodes = useMemo(
        () =>
            Object.values(items)
                .filter((i) => (i.seriesId ?? i.mediaId) === seriesId && i.itemType === 'episode')
                .sort((a, b) => {
                    if (a.seasonNumber !== b.seasonNumber) return (a.seasonNumber ?? 0) - (b.seasonNumber ?? 0);
                    return (a.episodeNumber ?? 0) - (b.episodeNumber ?? 0);
                }),
        [items, seriesId]
    );

    // Group by season
    const seasons = useMemo(() => {
        const map: Record<number, DownloadItem[]> = {};
        for (const ep of episodes) {
            const s = ep.seasonNumber ?? 0;
            if (!map[s]) map[s] = [];
            map[s].push(ep);
        }
        return Object.entries(map)
            .map(([s, eps]) => ({ season: parseInt(s), episodes: eps }))
            .sort((a, b) => a.season - b.season);
    }, [episodes]);

    const first = episodes[0];
    const title = first?.mediaSnapshot.tmdb?.title || first?.title || 'Série';
    const poster = first?.posterUrl;
    const totalSize = episodes.reduce((a, e) => a + e.fileSize, 0);

    const handlePlayEpisode = useCallback(
        (ep: DownloadItem) => {
            openDownload(ep, router, {
                id: ep.id,
                url: encodeURIComponent(ep.localPath),
                title: `${title} · ${ep.subtitle ?? ''}`,
                offline: '1',
            });
        },
        [router, title]
    );

    const handleDeleteEpisode = useCallback((ep: DownloadItem) => {
        Alert.alert(
            'Excluir episódio?',
            ep.subtitle ?? ep.title,
            [
                { text: 'Cancelar', style: 'cancel' },
                {
                    text: 'Excluir',
                    style: 'destructive',
                    onPress: () => downloadManager.removeDownload(ep.id),
                },
            ]
        );
    }, []);

    const handleDeleteAll = useCallback(() => {
        Alert.alert(
            `Excluir ${title}?`,
            `${episodes.length} episódio${episodes.length !== 1 ? 's' : ''} serão removidos.`,
            [
                { text: 'Cancelar', style: 'cancel' },
                {
                    text: 'Excluir tudo',
                    style: 'destructive',
                    onPress: async () => {
                        for (const ep of episodes) {
                            await downloadManager.removeDownload(ep.id);
                        }
                        router.back();
                    },
                },
            ]
        );
    }, [episodes, title, router]);

    if (episodes.length === 0) {
        return (
            <View style={[styles.container, { paddingTop: insets.top + Spacing.lg, paddingHorizontal: Spacing.lg }]}>
                <StatusBar barStyle="light-content" />
                <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)/downloads')} accessibilityLabel="Voltar para downloads">
                    <Ionicons name="arrow-back" size={28} color={Colors.text} />
                </TouchableOpacity>
                <View style={styles.emptyContent}>
                    {!hydrated && <ActivityIndicator color={Colors.primary} />}
                    <Text style={styles.emptyText}>
                        {hydrated ? 'Nenhum episódio baixado encontrado para esta série.' : 'Carregando seus downloads…'}
                    </Text>
                </View>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

            <ScrollView
                showsVerticalScrollIndicator={false}
                bounces={false}
                contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
            >
                {/* Hero */}
                <View style={[styles.hero, { paddingTop: insets.top + 10 }]}>
                    <Image
                        source={{ uri: first?.mediaSnapshot.tmdb?.poster ?? poster ?? '' }}
                        style={styles.heroBg}
                        contentFit="cover"
                        cachePolicy="memory-disk"
                    />
                    <View style={styles.heroOverlay} />

                    {/* Back */}
                    <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
                        <Ionicons name="arrow-back" size={24} color={Colors.text} />
                    </TouchableOpacity>

                    <View style={styles.heroContent}>
                        <Image
                            source={{ uri: first?.mediaSnapshot.tmdb?.poster ?? poster ?? '' }}
                            style={styles.poster}
                            contentFit="cover"
                            cachePolicy="memory-disk"
                        />
                        <View style={styles.heroInfo}>
                            <Text style={styles.heroTitle} numberOfLines={2}>{title}</Text>
                            <Text style={styles.heroMeta}>
                                {episodes.length} episódio{episodes.length !== 1 ? 's' : ''} baixado{episodes.length !== 1 ? 's' : ''}
                            </Text>
                            <Text style={styles.heroSize}>{formatBytes(totalSize)}</Text>
                        </View>
                    </View>
                </View>

                {/* Delete all button */}
                <View style={styles.actions}>
                    <TouchableOpacity style={styles.deleteAllBtn} onPress={handleDeleteAll}>
                        <Ionicons name="trash-outline" size={18} color={Colors.error} />
                        <Text style={styles.deleteAllText}>Excluir todos os episódios</Text>
                    </TouchableOpacity>
                </View>

                {/* Episodes by season */}
                {seasons.map(({ season, episodes: eps }) => (
                    <View key={season} style={styles.seasonSection}>
                        <Text style={styles.seasonTitle}>
                            {season === 0 ? 'Episódios' : `Temporada ${season}`}
                        </Text>

                        {eps.map((ep) => (
                            <EpisodeDownloadItem
                                key={ep.id}
                                ep={ep}
                                onPlay={handlePlayEpisode}
                                onDelete={handleDeleteEpisode}
                            />
                        ))}
                    </View>
                ))}
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    emptyContent: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.md },
    emptyText: { color: Colors.textSecondary, textAlign: 'center' },
    container: {
        flex: 1,
        backgroundColor: Colors.background,
    },
    hero: {
        height: 260,
        position: 'relative',
        justifyContent: 'flex-end',
    },
    heroBg: {
        ...StyleSheet.absoluteFill,
    },
    heroOverlay: {
        ...StyleSheet.absoluteFill,
        backgroundColor: 'rgba(0,0,0,0.6)',
    },
    backBtn: {
        position: 'absolute',
        top: 50,
        left: Spacing.lg,
        backgroundColor: 'rgba(0,0,0,0.5)',
        padding: Spacing.sm,
        borderRadius: BorderRadius.full,
        zIndex: 10,
    },
    heroContent: {
        flexDirection: 'row',
        gap: Spacing.md,
        alignItems: 'flex-end',
        paddingHorizontal: Spacing.lg,
        paddingBottom: Spacing.lg,
    },
    poster: {
        width: 80,
        height: 120,
        borderRadius: BorderRadius.md,
        backgroundColor: Colors.surface,
    },
    heroInfo: {
        flex: 1,
        paddingBottom: Spacing.xs,
    },
    heroTitle: {
        color: Colors.text,
        fontSize: Typography.h2.fontSize,
        fontWeight: '700',
        lineHeight: 28,
    },
    heroMeta: {
        color: Colors.textSecondary,
        fontSize: Typography.caption.fontSize,
        marginTop: Spacing.xs,
    },
    heroSize: {
        color: Colors.primary,
        fontSize: Typography.caption.fontSize,
        fontWeight: '600',
        marginTop: 2,
    },
    actions: {
        paddingHorizontal: Spacing.lg,
        paddingVertical: Spacing.md,
        borderBottomWidth: 1,
        borderBottomColor: Colors.border,
    },
    deleteAllBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.sm,
        paddingVertical: Spacing.sm,
    },
    deleteAllText: {
        color: Colors.error,
        fontSize: Typography.body.fontSize,
        fontWeight: '600',
    },
    seasonSection: {
        marginTop: Spacing.lg,
        paddingHorizontal: Spacing.lg,
    },
    seasonTitle: {
        color: Colors.text,
        fontSize: Typography.h3.fontSize,
        fontWeight: '700',
        marginBottom: Spacing.md,
    },
    episodeCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: Colors.surface,
        borderRadius: BorderRadius.md,
        padding: Spacing.md,
        marginBottom: Spacing.sm,
        gap: Spacing.md,
    },
    episodeNumber: {
        width: 40,
        height: 40,
        borderRadius: BorderRadius.sm,
        backgroundColor: Colors.background,
        justifyContent: 'center',
        alignItems: 'center',
    },
    episodeNumberText: {
        color: Colors.text,
        fontSize: Typography.h3.fontSize,
        fontWeight: '700',
    },
    episodeInfo: {
        flex: 1,
    },
    episodeName: {
        color: Colors.text,
        fontSize: Typography.body.fontSize,
        fontWeight: '500',
    },
    episodeSize: {
        color: Colors.textSecondary,
        fontSize: Typography.caption.fontSize,
        marginTop: 2,
    },
    deleteEpBtn: {
        padding: Spacing.xs,
    },
    epProgressRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginTop: 4,
    },
    epProgressContainer: {
        height: 3,
        backgroundColor: 'rgba(255,255,255,0.1)',
        borderRadius: 1.5,
        overflow: 'hidden',
        flex: 1,
    },
    epProgressFill: {
        height: '100%',
        backgroundColor: Colors.primary,
    },
    epProgressPct: {
        color: Colors.textSecondary,
        fontSize: 10,
        fontWeight: '700',
    },
});

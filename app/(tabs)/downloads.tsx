import React, { useCallback, useMemo } from 'react';
import { useMediaStore } from '../../stores/mediaStore';
import {
    View,
    Text,
    StyleSheet,
    FlatList,
    TouchableOpacity,
    Alert,
    StatusBar,
    SectionList,
} from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

import { Colors, Typography, Spacing, BorderRadius } from '../../constants/Colors';
import { useDownloadStore } from '../../stores/downloadStore';
import { downloadManager } from '../../services/downloadManager';
import { openDownload } from '../../services/playDownload';
import { formatBytes, formatEta, formatSpeed } from '../../services/downloadUtils';
import type { DownloadItem, DownloadTask } from '../../types';

// -----------------------------------------------------------------------
// Active download card
// -----------------------------------------------------------------------
function ActiveDownloadCard({ task }: { task: DownloadTask }) {
    const isDownloading = task.status === 'downloading';
    const isPaused = task.status === 'paused';
    const isQueued = task.status === 'queued';
    const isFailed = task.status === 'failed';

    const handleAction = useCallback(() => {
        if (isFailed) {
            downloadManager.retry(task.id);
        }
    }, [task.id, isFailed]);

    const handleCancel = useCallback(() => {
        Alert.alert('Cancelar download?', task.title, [
            { text: 'Não', style: 'cancel' },
            { text: 'Cancelar', style: 'destructive', onPress: () => downloadManager.cancel(task.id) },
        ]);
    }, [task.id, task.title]);

    const statusLabel = isDownloading
        ? task.speedBps
            ? `${formatSpeed(task.speedBps)} · ${task.eta ? 'ETA ' + formatEta(task.eta) : ''}`
            : 'Baixando...'
        : isPaused
        ? 'Pausado'
        : isQueued
        ? 'Na fila...'
        : isFailed
        ? task.error ?? 'Falhou'
        : task.status;

    const pct = Math.round(task.progress * 100);
    const barColor = isFailed ? Colors.error : Colors.primary;
    const actionIcon = isFailed ? 'refresh' : undefined;
    const actionColor = isFailed ? Colors.error : Colors.primary;

    return (
        <View style={[styles.activeCard, isFailed && styles.activeCardFailed]}>
            <Image
                source={{ uri: task.posterUrl ?? '' }}
                style={styles.activePoster}
                contentFit="cover"
                cachePolicy="memory-disk"
            />
            <View style={styles.activeInfo}>
                <Text style={styles.activeTitle} numberOfLines={1}>{task.title}</Text>
                {task.subtitle && (
                    <Text style={styles.activeSubtitle} numberOfLines={1}>{task.subtitle}</Text>
                )}

                {/* Progress bar */}
                <View style={styles.progressBarBg}>
                    <View
                        style={[styles.progressBarFill, { width: `${pct}%`, backgroundColor: barColor }]}
                    />
                </View>

                <View style={styles.activeRow}>
                    <Text style={[styles.statusLabel, isFailed && styles.statusLabelFailed]} numberOfLines={1}>
                        {statusLabel}
                    </Text>
                    {!isFailed && <Text style={styles.pctLabel}>{pct}%</Text>}
                    {!isFailed && task.bytesTotal > 0 && (
                        <Text style={styles.bytesLabel}>
                            {formatBytes(task.bytesDownloaded)} / {formatBytes(task.bytesTotal)}
                        </Text>
                    )}
                </View>
            </View>

            <View style={styles.activeActions}>
                {/* Show action button for: failed (retry) */}
                {isFailed && (
                    <TouchableOpacity onPress={handleAction} style={styles.actionBtn}>
                        <Ionicons name="refresh" size={20} color={actionColor} />
                    </TouchableOpacity>
                )}
                <TouchableOpacity onPress={handleCancel} style={styles.actionBtn}>
                    <Ionicons name="close" size={20} color={Colors.textSecondary} />
                </TouchableOpacity>
            </View>
        </View>
    );
}

// -----------------------------------------------------------------------
// Completed download card (movie)
// -----------------------------------------------------------------------
function MovieDownloadCard({ item }: { item: DownloadItem }) {
    const router = useRouter();

    const handlePlay = useCallback(() => {
        openDownload(item, router, {
            id: item.id,
            url: encodeURIComponent(item.localPath),
            title: item.title,
            offline: '1',
        });
    }, [item, router]);

    const handleDelete = useCallback(() => {
        Alert.alert('Excluir download?', `"${item.title}" será removido do dispositivo.`, [
            { text: 'Cancelar', style: 'cancel' },
            { text: 'Excluir', style: 'destructive', onPress: () => downloadManager.removeDownload(item.id) },
        ]);
    }, [item]);

    const progress = useMediaStore(s => s.watchHistory.find(h => h.id === item.id));
    const pct = (progress?.progress && progress?.duration) ? (progress.progress / progress.duration) * 100 : 0;

    return (
        <TouchableOpacity style={styles.movieCard} onPress={handlePlay} activeOpacity={0.8}>
            <Image
                source={{ uri: item.posterUrl ?? '' }}
                style={styles.moviePoster}
                contentFit="cover"
                cachePolicy="memory-disk"
            />
            {pct > 0 && pct < 95 && (
                <View style={[styles.bgProgressFill, { width: `${pct}%` }]} pointerEvents="none" />
            )}
            <LinearGradient
                colors={['transparent', 'rgba(0,0,0,0.85)']}
                style={styles.movieGradient}
            />
            <View style={styles.movieFooter}>
                <TouchableOpacity
                    style={styles.moviePlayBtn}
                    onPress={handlePlay}
                >
                    <Ionicons name="play-circle" size={28} color={Colors.primary} />
                </TouchableOpacity>
                <TouchableOpacity
                    style={styles.movieDeleteBtn}
                    onPress={handleDelete}
                >
                    <Ionicons name="trash-outline" size={18} color={Colors.error} />
                </TouchableOpacity>
            </View>
            {pct > 0 && pct < 95 && (
                <View style={styles.miniProgressBadge}>
                    <Text style={styles.miniProgressText}>{Math.round(pct)}%</Text>
                </View>
            )}
            <Text style={styles.movieTitle} numberOfLines={2}>{item.mediaSnapshot.tmdb?.title || item.title}</Text>
            <Text style={styles.movieSize}>{formatBytes(item.fileSize)}</Text>
        </TouchableOpacity>
    );
}

// -----------------------------------------------------------------------
// Series row (groups all episodes of one series)
// -----------------------------------------------------------------------
function SeriesDownloadRow({ seriesId, episodes }: { seriesId: string; episodes: DownloadItem[] }) {
    const router = useRouter();
    const first = episodes[0];
    const totalSize = episodes.reduce((a, e) => a + e.fileSize, 0);

    const handlePress = useCallback(() => {
        router.push({
            pathname: '/downloads/[id]' as any,
            params: { id: seriesId },
        });
    }, [seriesId, router]);

    const seriesProgress = useMediaStore(s => s.seriesProgress.find(p => p.seriesId === seriesId));
    const pct = (seriesProgress?.progress && seriesProgress?.duration) ? (seriesProgress.progress / seriesProgress.duration) * 100 : 0;

    return (
        <TouchableOpacity style={styles.seriesRow} onPress={handlePress} activeOpacity={0.8}>
            <Image
                source={{ uri: first.posterUrl ?? '' }}
                style={styles.seriesPoster}
                contentFit="cover"
                cachePolicy="memory-disk"
            />
            {pct > 0 && pct < 95 && (
                <View style={[styles.bgProgressFillSeries, { width: `${pct}%` }]} pointerEvents="none" />
            )}
            <View style={styles.seriesInfo}>
                <Text style={styles.seriesTitle} numberOfLines={1}>
                    {first.mediaSnapshot.tmdb?.title || first.title}
                </Text>
                <Text style={styles.seriesMeta}>
                    {episodes.length} episódio{episodes.length !== 1 ? 's' : ''} · {formatBytes(totalSize)}
                </Text>
                {seriesProgress && pct > 0 && pct < 95 && (
                    <Text style={styles.seriesProgressText}>
                        Parei em: T{seriesProgress.season} E{seriesProgress.episode} · {Math.round(pct)}%
                    </Text>
                )}
            </View>
            <Ionicons name="chevron-forward" size={20} color={Colors.textSecondary} />
        </TouchableOpacity>
    );
}

// -----------------------------------------------------------------------
// Empty state
// -----------------------------------------------------------------------
function EmptyState() {
    return (
        <View style={styles.emptyContainer}>
            <View style={styles.emptyIconBg}>
                <Ionicons name="download-outline" size={48} color={Colors.primary} />
            </View>
            <Text style={styles.emptyTitle}>Nenhum download</Text>
            <Text style={styles.emptyBody}>
                Baixe filmes e episódios para assistir{'\n'}sem internet, quando quiser.
            </Text>
        </View>
    );
}

// -----------------------------------------------------------------------
// Main screen
// -----------------------------------------------------------------------
export default function DownloadsScreen() {
    const insets = useSafeAreaInsets();

    const items = useDownloadStore((s) => s.items);
    const tasks = useDownloadStore((s) => s.tasks);
    const getTotalBytes = useDownloadStore((s) => s.getTotalBytes);

    const activeTasks = useMemo(
        () =>
            Object.values(tasks)
                .filter((t) => ['queued', 'downloading', 'paused', 'failed'].includes(t.status))
                .sort((a, b) => a.createdAt - b.createdAt),
        [tasks]
    );

    const movieItems = useMemo(
        () =>
            Object.values(items)
                .filter((i) => i.itemType === 'movie')
                .sort((a, b) => b.downloadedAt - a.downloadedAt),
        [items]
    );

    // Group episodes by seriesId
    const seriesGroups = useMemo(() => {
        const episodes = Object.values(items).filter((i) => i.itemType === 'episode');
        const map: Record<string, DownloadItem[]> = {};
        for (const ep of episodes) {
            const key = ep.seriesId ?? ep.mediaId;
            if (!map[key]) map[key] = [];
            map[key].push(ep);
        }
        return Object.entries(map).sort(([, a], [, b]) => b[0].downloadedAt - a[0].downloadedAt);
    }, [items]);

    const totalBytes = getTotalBytes();
    const hasContent = activeTasks.length > 0 || movieItems.length > 0 || seriesGroups.length > 0;

    const handleDeleteAll = useCallback(() => {
        Alert.alert(
            'Apagar todos os downloads?',
            'Todos os arquivos serão removidos do dispositivo.',
            [
                { text: 'Cancelar', style: 'cancel' },
                {
                    text: 'Apagar tudo',
                    style: 'destructive',
                    onPress: async () => {
                        const allIds = Object.keys(items);
                        for (const id of allIds) {
                            await downloadManager.removeDownload(id);
                        }
                        for (const task of activeTasks) {
                            await downloadManager.cancel(task.id);
                        }
                    },
                },
            ]
        );
    }, [items, activeTasks]);

    return (
        <View style={[styles.container, { paddingTop: insets.top }]}>
            <StatusBar barStyle="light-content" backgroundColor={Colors.background} />

            {/* Header */}
            <View style={styles.header}>
                <View>
                    <Text style={styles.headerTitle}>Downloads</Text>
                    {totalBytes > 0 && (
                        <Text style={styles.headerSub}>{formatBytes(totalBytes)} armazenado</Text>
                    )}
                </View>
                {hasContent && (
                    <TouchableOpacity onPress={handleDeleteAll} style={styles.deleteAllBtn}>
                        <Ionicons name="trash-outline" size={20} color={Colors.error} />
                    </TouchableOpacity>
                )}
            </View>

            {!hasContent ? (
                <EmptyState />
            ) : (
                <FlatList
                    data={[]}
                    renderItem={null}
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={{ paddingBottom: insets.bottom + 80 }}
                    ListHeaderComponent={
                        <>
                            {/* Active downloads */}
                            {activeTasks.length > 0 && (
                                <View style={styles.section}>
                                    <Text style={styles.sectionTitle}>Em andamento</Text>
                                    {activeTasks.map((task) => (
                                        <ActiveDownloadCard key={task.id} task={task} />
                                    ))}
                                </View>
                            )}

                            {/* Movies */}
                            {movieItems.length > 0 && (
                                <View style={styles.section}>
                                    <Text style={styles.sectionTitle}>Filmes</Text>
                                    <View style={styles.moviesGrid}>
                                        {movieItems.map((item) => (
                                            <MovieDownloadCard key={item.id} item={item} />
                                        ))}
                                    </View>
                                </View>
                            )}

                            {/* Series */}
                            {seriesGroups.length > 0 && (
                                <View style={styles.section}>
                                    <Text style={styles.sectionTitle}>Séries</Text>
                                    {seriesGroups.map(([seriesId, episodes]) => (
                                        <SeriesDownloadRow
                                            key={seriesId}
                                            seriesId={seriesId}
                                            episodes={episodes}
                                        />
                                    ))}
                                </View>
                            )}
                        </>
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
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: Spacing.lg,
        paddingTop: Spacing.md,
        paddingBottom: Spacing.lg,
        borderBottomWidth: 1,
        borderBottomColor: Colors.border,
    },
    headerTitle: {
        color: Colors.text,
        fontSize: Typography.h2.fontSize,
        fontWeight: '700',
    },
    headerSub: {
        color: Colors.textSecondary,
        fontSize: Typography.caption.fontSize,
        marginTop: 2,
    },
    deleteAllBtn: {
        padding: Spacing.sm,
        backgroundColor: 'rgba(239,68,68,0.1)',
        borderRadius: BorderRadius.md,
    },
    section: {
        marginTop: Spacing.lg,
        paddingHorizontal: Spacing.lg,
    },
    sectionTitle: {
        color: Colors.text,
        fontSize: Typography.h3.fontSize,
        fontWeight: '700',
        marginBottom: Spacing.md,
    },

    // Active card
    activeCard: {
        flexDirection: 'row',
        backgroundColor: Colors.surface,
        borderRadius: BorderRadius.md,
        padding: Spacing.md,
        marginBottom: Spacing.sm,
        gap: Spacing.md,
        alignItems: 'center',
    },
    activeCardFailed: {
        borderWidth: 1,
        borderColor: 'rgba(239,68,68,0.3)',
    },
    activePoster: {
        width: 52,
        height: 76,
        borderRadius: BorderRadius.sm,
        backgroundColor: Colors.surfaceVariant,
    },
    activeInfo: {
        flex: 1,
        gap: 4,
    },
    activeTitle: {
        color: Colors.text,
        fontSize: Typography.body.fontSize,
        fontWeight: '600',
    },
    activeSubtitle: {
        color: Colors.textSecondary,
        fontSize: Typography.caption.fontSize,
    },
    progressBarBg: {
        height: 3,
        backgroundColor: Colors.border,
        borderRadius: 2,
        marginTop: 4,
    },
    progressBarFill: {
        height: '100%',
        backgroundColor: Colors.primary,
        borderRadius: 2,
    },
    activeRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.sm,
        marginTop: 2,
    },
    statusLabel: {
        flex: 1,
        color: Colors.textSecondary,
        fontSize: 11,
    },
    statusLabelFailed: {
        color: Colors.error,
    },
    pctLabel: {
        color: Colors.primary,
        fontSize: 11,
        fontWeight: '700',
    },
    bytesLabel: {
        color: Colors.textMuted,
        fontSize: 10,
    },
    activeActions: {
        flexDirection: 'row',
        gap: 4,
    },
    actionBtn: {
        padding: Spacing.sm,
        backgroundColor: Colors.surfaceVariant,
        borderRadius: BorderRadius.sm,
    },

    // Movies grid
    moviesGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: Spacing.md,
    },
    movieCard: {
        width: '47%',
        borderRadius: BorderRadius.md,
        overflow: 'hidden',
        backgroundColor: Colors.surface,
    },
    moviePoster: {
        width: '100%',
        aspectRatio: 2 / 3,
        backgroundColor: Colors.surfaceVariant,
    },
    movieGradient: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: 100,
    },
    movieFooter: {
        position: 'absolute',
        bottom: 40,
        left: 0,
        right: 0,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: Spacing.sm,
    },
    moviePlayBtn: {
        padding: 4,
    },
    movieDeleteBtn: {
        padding: 4,
        backgroundColor: 'rgba(0,0,0,0.5)',
        borderRadius: BorderRadius.sm,
    },
    movieTitle: {
        position: 'absolute',
        bottom: 16,
        left: Spacing.sm,
        right: Spacing.sm,
        color: Colors.text,
        fontSize: 11,
        fontWeight: '600',
    },
    movieSize: {
        position: 'absolute',
        bottom: 4,
        left: Spacing.sm,
        color: Colors.textSecondary,
        fontSize: 10,
    },

    // Series rows
    seriesRow: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: Colors.surface,
        borderRadius: BorderRadius.md,
        padding: Spacing.md,
        marginBottom: Spacing.sm,
        gap: Spacing.md,
    },
    seriesPoster: {
        width: 52,
        height: 76,
        borderRadius: BorderRadius.sm,
        backgroundColor: Colors.surfaceVariant,
    },
    seriesInfo: {
        flex: 1,
    },
    seriesTitle: {
        color: Colors.text,
        fontSize: Typography.body.fontSize,
        fontWeight: '600',
    },
    seriesMeta: {
        color: Colors.textSecondary,
        fontSize: Typography.caption.fontSize,
        marginTop: 4,
    },

    // Empty state
    emptyContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: Spacing.xxxl,
        gap: Spacing.md,
    },
    emptyIconBg: {
        width: 96,
        height: 96,
        borderRadius: 48,
        backgroundColor: 'rgba(99,102,241,0.1)',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: Spacing.md,
    },
    emptyTitle: {
        color: Colors.text,
        fontSize: Typography.h3.fontSize,
        fontWeight: '700',
        textAlign: 'center',
    },
    emptyBody: {
        color: Colors.textSecondary,
        fontSize: Typography.body.fontSize,
        textAlign: 'center',
        lineHeight: 22,
    },
    bgProgressFill: {
        position: 'absolute',
        left: 0,
        top: 0,
        bottom: 0,
        backgroundColor: 'rgba(99, 102, 241, 0.2)',
        zIndex: 1,
    },
    miniProgressBadge: {
        position: 'absolute',
        top: Spacing.sm,
        left: Spacing.sm,
        backgroundColor: 'rgba(0,0,0,0.7)',
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 4,
        zIndex: 5,
    },
    miniProgressText: {
        color: '#fff',
        fontSize: 10,
        fontWeight: '800',
    },
    bgProgressFillSeries: {
        position: 'absolute',
        left: 0,
        top: 0,
        bottom: 0,
        backgroundColor: 'rgba(99, 102, 241, 0.15)',
        zIndex: 0,
    },
    seriesProgressText: {
        color: Colors.primary,
        fontSize: 11,
        fontWeight: '700',
        marginTop: 4,
    },
});

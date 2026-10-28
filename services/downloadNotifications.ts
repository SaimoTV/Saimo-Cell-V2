import * as Notifications from 'expo-notifications';
import { Platform, Linking, Alert } from 'react-native';
import { formatBytes, formatEta, formatSpeed } from './downloadUtils';
import type { DownloadTask } from '../types';

const CHANNEL_PROGRESS = 'downloads-progress-v2';
const CHANNEL_COMPLETE = 'downloads-complete-v2';
const CHANNEL_FAILED = 'downloads-failed-v2';

const PREFIX_PROGRESS = 'dl-prog-';
const PREFIX_DONE = 'dl-done-';

let initialized = false;
let permissionGranted = false;
const lastUpdateAt = new Map<string, number>();
const PROGRESS_UPDATE_THROTTLE = 1200;

// -----------------------------------------------------------------------
// Init
// -----------------------------------------------------------------------

export async function initNotifications(): Promise<void> {
    if (initialized) return;
    initialized = true;

    // Show notifications when app is foregrounded
    Notifications.setNotificationHandler({
        handleNotification: async (notification) => {
            const type = notification.request.content.data?.type as string | undefined;
            const isProgress = type === 'progress';
            return {
                shouldShowBanner: true,
                shouldShowList: true,
                shouldPlaySound: !isProgress,
                shouldSetBadge: false,
            };
        },
    });

    if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync(CHANNEL_PROGRESS, {
            name: 'Downloads em andamento',
            importance: Notifications.AndroidImportance.DEFAULT,
            sound: null,
            enableVibrate: false,
            showBadge: false,
            lightColor: '#6366F1',
            lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
        });

        await Notifications.setNotificationChannelAsync(CHANNEL_COMPLETE, {
            name: 'Downloads concluídos',
            importance: Notifications.AndroidImportance.HIGH,
            sound: 'default',
            enableVibrate: true,
            vibrationPattern: [0, 200],
            lightColor: '#10B981',
            lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
        });

        await Notifications.setNotificationChannelAsync(CHANNEL_FAILED, {
            name: 'Downloads com erro',
            importance: Notifications.AndroidImportance.HIGH,
            sound: 'default',
            enableVibrate: true,
            lightColor: '#EF4444',
            lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
        });
    }

    await _requestPermission();
}

async function _requestPermission(): Promise<boolean> {
    const { status } = await Notifications.getPermissionsAsync();
    if (status === 'granted') {
        permissionGranted = true;
        return true;
    }
    if (status === 'denied') {
        permissionGranted = false;
        return false;
    }
    const result = await Notifications.requestPermissionsAsync({
        ios: {
            allowAlert: true,
            allowSound: true,
            allowBadge: false,
        },
    });
    permissionGranted = result.status === 'granted';
    return permissionGranted;
}

export function isNotificationsEnabled(): boolean {
    return permissionGranted;
}

// Call this when user triggers a download and permission is missing
export async function ensurePermission(): Promise<boolean> {
    if (permissionGranted) return true;

    const { status } = await Notifications.getPermissionsAsync();
    if (status === 'granted') {
        permissionGranted = true;
        return true;
    }

    if (status === 'denied') {
        Alert.alert(
            'Notificações bloqueadas',
            'Ative as notificações para acompanhar seus downloads.',
            [
                { text: 'Agora não', style: 'cancel' },
                { text: 'Ativar', onPress: () => Linking.openSettings() },
            ]
        );
        return false;
    }

    return _requestPermission();
}

// -----------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------

function makeProgressBar(progress: number, width = 14): string {
    const filled = Math.round(progress * width);
    const empty = width - filled;
    return '▰'.repeat(filled) + '▱'.repeat(empty);
}

function buildProgressBody(task: DownloadTask): string {
    const pct = Math.round(task.progress * 100);
    const lines: string[] = [];

    lines.push(`${makeProgressBar(task.progress)}  ${pct}%`);

    const parts: string[] = [];
    if (task.bytesTotal > 0) {
        parts.push(`${formatBytes(task.bytesDownloaded)} / ${formatBytes(task.bytesTotal)}`);
    }
    if (task.speedBps && task.speedBps > 0) {
        parts.push(formatSpeed(task.speedBps));
    }
    if (task.eta && isFinite(task.eta) && task.eta > 0) {
        parts.push(`ETA ${formatEta(task.eta)}`);
    }
    if (parts.length > 0) lines.push(parts.join(' · '));

    return lines.join('\n');
}

// -----------------------------------------------------------------------
// Per-task notifications
// -----------------------------------------------------------------------

export async function showProgressNotification(task: DownloadTask, force = false): Promise<void> {
    if (!permissionGranted) return;

    const now = Date.now();
    const last = lastUpdateAt.get(task.id) ?? 0;
    if (!force && now - last < PROGRESS_UPDATE_THROTTLE) return;
    lastUpdateAt.set(task.id, now);

    const pct = Math.round(task.progress * 100);
    const subtitle = task.subtitle ? ` · ${task.subtitle}` : '';

    const content: Notifications.NotificationContentInput = {
        title: `${task.title}${subtitle}`,
        body: task.status === 'queued'
            ? 'Aguardando na fila…'
            : task.status === 'paused'
            ? `Pausado em ${pct}%`
            : buildProgressBody(task),
        data: { taskId: task.id, type: 'progress' },
        sticky: true,
        autoDismiss: false,
    };

    const identifier = PREFIX_PROGRESS + task.id;

    try {
        await Notifications.scheduleNotificationAsync({
            identifier,
            content: {
                ...content,
                ...(Platform.OS === 'android' && {
                    categoryIdentifier: CHANNEL_PROGRESS,
                    color: '#6366F1',
                    priority: Notifications.AndroidNotificationPriority.DEFAULT,
                    vibrate: null,
                }),
            } as any,
            trigger: Platform.OS === 'android'
                ? { channelId: CHANNEL_PROGRESS } as any
                : null,
        });
    } catch (e) {
        console.warn('[Notifications] progress fail:', e);
    }
}

export async function showCompletedNotification(task: DownloadTask): Promise<void> {
    if (!permissionGranted) return;

    // Dismiss progress first with its prefix
    await dismissProgressNotification(task.id);

    const subtitle = task.subtitle ? ` · ${task.subtitle}` : '';
    const sizeStr = task.bytesTotal > 0 ? ` (${formatBytes(task.bytesTotal)})` : '';

    try {
        await Notifications.scheduleNotificationAsync({
            identifier: PREFIX_DONE + task.id,
            content: {
                title: 'Download concluído',
                body: `${task.title}${subtitle}${sizeStr}\nToque para assistir`,
                data: {
                    taskId: task.id,
                    type: 'completed',
                    mediaId: task.mediaId,
                    itemType: task.itemType,
                },
                ...(Platform.OS === 'android' && { color: '#10B981' }),
            } as any,
            trigger: Platform.OS === 'android'
                ? { channelId: CHANNEL_COMPLETE } as any
                : null,
        });
    } catch (e) {
        console.warn('[Notifications] complete fail:', e);
    }
}

export async function showFailedNotification(task: DownloadTask, errorMsg: string): Promise<void> {
    if (!permissionGranted) return;

    await dismissProgressNotification(task.id);

    const subtitle = task.subtitle ? ` · ${task.subtitle}` : '';

    try {
        await Notifications.scheduleNotificationAsync({
            identifier: PREFIX_DONE + task.id + '-fail',
            content: {
                title: 'Falha no download',
                body: `${task.title}${subtitle}\n${errorMsg}`,
                data: { taskId: task.id, type: 'failed' },
                ...(Platform.OS === 'android' && { color: '#EF4444' }),
            } as any,
            trigger: Platform.OS === 'android'
                ? { channelId: CHANNEL_FAILED } as any
                : null,
        });
    } catch (e) {
        console.warn('[Notifications] failed fail:', e);
    }
}

export async function dismissProgressNotification(taskId: string): Promise<void> {
    const identifier = PREFIX_PROGRESS + taskId;
    try {
        await Notifications.dismissNotificationAsync(identifier);
    } catch {}
    lastUpdateAt.delete(taskId);
}

export async function dismissAllDownloadNotifications(): Promise<void> {
    try {
        await Notifications.dismissAllNotificationsAsync();
    } catch {}
    lastUpdateAt.clear();
}

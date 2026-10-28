/**
 * Wrapper around @kesha-antonov/react-native-background-downloader.
 *
 * Why: raw `fetch()` in JS dies when OS suspends the app.
 * Native background download (Android ForegroundService + iOS NSURLSession)
 * persists across app close, screen-off, Doze mode.
 *
 * API mirrors FastDownload so DownloadManager can swap them transparently.
 */

import { Platform } from 'react-native';

export interface NativeDownloadCallbacks {
    onBegin?: (expectedBytes: number) => void;
    onProgress?: (bytesDownloaded: number, bytesTotal: number) => void;
    onDone?: () => void;
    onError?: (error: string) => void;
}

// Lazy-require so the module only loads on real devices (not web).
let RNBGDownloader: any = null;

function getDownloader() {
    if (RNBGDownloader) return RNBGDownloader;
    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        RNBGDownloader = require('@kesha-antonov/react-native-background-downloader').default;
    } catch {
        RNBGDownloader = null;
    }
    return RNBGDownloader;
}

export function isNativeDownloaderAvailable(): boolean {
    if (Platform.OS === 'web') return false;
    return !!getDownloader();
}

export interface NativeDownloadTask {
    pause(): void;
    resume(): void;
    stop(): void;
}

/**
 * Start a background download.
 * Returns a handle to pause/resume/stop.
 * Callbacks are fired even if the app was in background.
 */
export function startNativeDownload(
    taskId: string,
    url: string,
    destination: string,
    title: string,
    callbacks: NativeDownloadCallbacks
): NativeDownloadTask | null {
    const downloader = getDownloader();
    if (!downloader) return null;

    try {
        const task = downloader
            .download({
                id: taskId,
                url,
                destination,
                headers: {
                    'User-Agent': 'VLC/3.0.20 LibVLC/3.0.20',
                },
                // Android: show OS-level progress notification (foreground service)
                isNotificationVisible: true,
                notificationTitle: `⬇  ${title}`,
                notificationDescription: 'Baixando…',
                // Network: allow both WiFi and cellular
                network: downloader.Network?.ALL ?? 3,
            })
            .begin(({ expectedBytes }: { expectedBytes: number }) => {
                callbacks.onBegin?.(expectedBytes);
            })
            .progress(
                ({ bytesDownloaded, bytesTotal }: { bytesDownloaded: number; bytesTotal: number }) => {
                    callbacks.onProgress?.(bytesDownloaded, bytesTotal);
                }
            )
            .done(() => {
                callbacks.onDone?.();
            })
            .error(({ error }: { error: string }) => {
                callbacks.onError?.(error ?? 'Erro desconhecido');
            });

        return {
            pause: () => { try { task.pause(); } catch {} },
            resume: () => { try { task.resume(); } catch {} },
            stop: () => { try { task.stop(); } catch {} },
        };
    } catch (e: any) {
        console.warn('[NativeDownloader] start failed:', e?.message);
        return null;
    }
}

export interface ExistingDownload {
    id: string;
    percent: number;
    bytesDownloaded: number;
    bytesTotal: number;
}

/**
 * Recover tasks that completed/progressed while app was killed.
 * Call on app startup, before DownloadManager.init().
 */
export async function checkExistingDownloads(): Promise<ExistingDownload[]> {
    const downloader = getDownloader();
    if (!downloader) return [];

    try {
        const lostTasks: any[] = await downloader.checkForExistingDownloads();
        return lostTasks.map((t: any) => ({
            id: t.id as string,
            percent: t.percent ?? 0,
            bytesDownloaded: t.bytesDownloaded ?? 0,
            bytesTotal: t.bytesTotal ?? 0,
        }));
    } catch (e) {
        console.warn('[NativeDownloader] checkExisting failed:', e);
        return [];
    }
}

/**
 * Re-attach callbacks to a task that was ongoing when app was killed.
 * Must be called before the task auto-resolves (typically within ~2s of app start).
 */
export function reattachNativeTask(
    taskId: string,
    callbacks: NativeDownloadCallbacks
): NativeDownloadTask | null {
    const downloader = getDownloader();
    if (!downloader) return null;

    try {
        // checkForExistingDownloads returns task objects we can chain callbacks onto
        // The library keeps the task reference internally — we just re-chain.
        const task = downloader
            .checkForExistingDownloads()
            .then((tasks: any[]) => tasks.find((t: any) => t.id === taskId))
            .then((found: any) => {
                if (!found) return null;
                found
                    .progress(({ bytesDownloaded, bytesTotal }: any) =>
                        callbacks.onProgress?.(bytesDownloaded, bytesTotal)
                    )
                    .done(() => callbacks.onDone?.())
                    .error(({ error }: any) => callbacks.onError?.(error ?? 'Erro'));
            });
        void task;
        return null; // handle not available synchronously
    } catch {
        return null;
    }
}

import { AppState, type AppStateStatus } from 'react-native';
import { useDownloadStore } from '../stores/downloadStore';
import { isKnownDownloadFolder } from './downloadRouting';
import { getItemAPI, invalidateItemCache } from './apiService';
import type { MediaItem, Episode, DownloadItem, DownloadTask } from '../types';
import {
    getDownloadPath,
    getDownloadDir,
    ensureDir,
    getFreeSpace,
    isHlsUrl,
    primeiraFonteBaixavel,
    getFileSize,
    deleteFileAtPath,
    deleteDirAtPath,
} from './downloadUtils';
import * as FileSystemLegacy from 'expo-file-system/legacy';
import {
    initNotifications,
    showProgressNotification,
    showCompletedNotification,
    showFailedNotification,
    dismissProgressNotification,
    ensurePermission,
} from './downloadNotifications';
import { FastDownload, type FastSnapshot } from './fastDownload';
import {
    isNativeDownloaderAvailable,
    checkExistingDownloads,
} from './nativeDownloader';

const MAX_CONCURRENT = 3;
const MAX_RETRIES = 15;
const MIN_FREE_BYTES = 150 * 1024 * 1024;
const PROGRESS_THROTTLE_MS = 500;
const NUM_PARALLEL_CHUNKS = 16; // 16 ranges per file = saturates most CDN per-IP rate limits
const SNAPSHOT_SAVE_INTERVAL_MS = 10_000; // Persist snapshot to store every 10s

class DownloadManager {
    private static _instance: DownloadManager;

    // FastDownload handles — primary download strategy (multi-chunk parallel)
    private activeJsDownloads = new Map<string, FastDownload>();

    // Sync counter — incremented BEFORE async work so _processQueue never
    // double-counts slots during the async gap between enqueue and Map.set().
    private activeCount = 0;

    private queue: string[] = [];
    private initialized = false;
    private initPromise: Promise<void> | null = null;

    private lastProgressAt = new Map<string, number>();
    private lastProgressBytes = new Map<string, number>();
    private lastSnapshotSaveAt = new Map<string, number>();

    // IDs of downloads that were auto-paused by background transition.
    // Distinguished from user-initiated pauses so we only auto-resume these.
    private pausedByBackground = new Set<string>();
    private startingDownloads = new Set<string>();
    private appStateSubscription: { remove(): void } | null = null;
    private appStateTimeout: ReturnType<typeof setTimeout> | null = null;

    static getInstance(): DownloadManager {
        if (!DownloadManager._instance) {
            DownloadManager._instance = new DownloadManager();
        }
        return DownloadManager._instance;
    }

    async init(): Promise<void> {
        if (this.initPromise) return this.initPromise;
        this.initPromise = this._doInit();
        return this.initPromise;
    }

    private async _doInit(): Promise<void> {
        if (this.initialized) return;
        this.initialized = true;

        // Never reconcile or delete files before persisted downloads are loaded.
        if (!useDownloadStore.persist.hasHydrated()) {
            await new Promise<void>(resolve => {
                const unsubscribe = useDownloadStore.persist.onFinishHydration(() => {
                    unsubscribe();
                    resolve();
                });
                if (useDownloadStore.persist.hasHydrated()) {
                    unsubscribe();
                    resolve();
                }
            });
        }

        // Notifications must be ready before any download starts
        await initNotifications();

        // Reconcile tasks that ran in background while app was closed
        await this._reconcileBackgroundDownloads();

        const { tasks, items } = useDownloadStore.getState();
        
        // FIX: Absolute paths (file://...) change when the app sandbox UUID changes 
        // (common on iOS updates or restarts). We MUST regenerate destPath and localPath
        // dynamically based on the current documentDirectory.
        for (const [id, item] of Object.entries(items)) {
            const currentPath = getDownloadPath(
                item.itemType,
                item.itemType === 'movie' ? item.mediaId : item.seriesId ?? item.mediaId,
                item.itemType === 'episode' ? item.id : undefined,
                item.localPath // use old path just to extract extension
            );
            if (currentPath !== item.localPath) {
                useDownloadStore.getState().updateItem(id, { localPath: currentPath });
            }
        }

        for (const task of Object.values(tasks)) {
            const currentDestPath = getDownloadPath(
                task.itemType,
                task.itemType === 'movie' ? task.mediaId : task.seriesId ?? task.mediaId,
                task.itemType === 'episode' ? task.id : undefined,
                task.remoteUrl
            );

            // partialize converts downloading→paused before AsyncStorage write, but if the app
            // was killed before that flush completed the task comes back as 'downloading'.
            // Normalize first, then use the effective status for the queue decision.
            const effectiveStatus =
                task.status === 'downloading' ? 'paused' : task.status;

            const patch: Partial<DownloadTask> = { destPath: currentDestPath };
            if (task.status === 'downloading') {
                // IMPORTANT: preserve any existing resumableSnapshot so we can resume
                // from where we left off instead of starting over.
                patch.status = 'paused';
            }
            useDownloadStore.getState().updateTask(task.id, patch);

            // Re-queue paused/queued — NOT failed (user must tap retry explicitly).
            if (
                (effectiveStatus === 'queued' || effectiveStatus === 'paused') &&
                !this.queue.includes(task.id)
            ) {
                this.queue.push(task.id);
            }
        }

        // Listen for app state changes to auto-pause/resume downloads
        this._setupAppStateListener();

        // Clean up orphan files from cancelled/failed downloads (fire-and-forget)
        this._cleanupOrphans().catch(() => {});

        this._processQueue();
    }

    /**
     * Check native downloader for tasks that finished/progressed while app was killed.
     * Marks completed tasks in the store and shows notifications.
     */
    private async _reconcileBackgroundDownloads(): Promise<void> {
        if (!isNativeDownloaderAvailable()) return;

        try {
            const existing = await checkExistingDownloads();
            if (existing.length === 0) return;

            const store = useDownloadStore.getState();
            let completedCount = 0;

            for (const ext of existing) {
                const task = store.getTask(ext.id);
                if (!task) continue;

                if (ext.percent >= 1 || ext.bytesDownloaded >= ext.bytesTotal && ext.bytesTotal > 0) {
                    // Completed in background
                    await this._onComplete(ext.id, task.destPath);
                    completedCount++;
                } else if (ext.bytesDownloaded > 0) {
                    // Partially done — update progress and re-queue
                    store.updateTask(ext.id, {
                        bytesDownloaded: ext.bytesDownloaded,
                        bytesTotal: ext.bytesTotal,
                        progress: ext.bytesTotal > 0 ? ext.bytesDownloaded / ext.bytesTotal : 0,
                        status: 'queued',
                    });
                    if (!this.queue.includes(ext.id)) this.queue.push(ext.id);
                }
            }

            if (completedCount > 0) {
                console.log(`[DownloadManager] ${completedCount} download(s) concluído(s) em background`);
            }
        } catch (e) {
            console.warn('[DownloadManager] reconcile failed:', e);
        }
    }

    /**
     * Enfileira um filme, opcionalmente por uma fonte escolhida.
     *
     * A primeira fonte de quase cinco mil filmes é uma playlist do
     * EmbedPlayer (`master.txt`), que este downloader não sabe montar — e o
     * botão recusava o filme inteiro por causa dela, dizendo que era conteúdo
     * ao vivo. Não é: quatro mil desses filmes têm um arquivo direto logo
     * atrás, e agora é a tela quem oferece a escolha.
     */
    async enqueueMovie(media: MediaItem, sourceUrl?: string): Promise<void> {
        // Fire-and-forget init/permission — don't block user-facing enqueue.
        // _layout.tsx already kicked these off on app mount; this is just a safety net.
        this.init().catch(() => {});
        ensurePermission().catch(() => {});

        const store = useDownloadStore.getState();

        if (store.getItem(media.id)) throw new Error('ALREADY_DOWNLOADED');

        const existing = store.getTask(media.id);
        if (existing && ['queued', 'downloading', 'paused'].includes(existing.status)) {
            throw new Error('ALREADY_QUEUED');
        }

        const url = sourceUrl || media.url;
        if (isHlsUrl(url)) throw new Error('HLS_NOT_SUPPORTED');

        const destPath = getDownloadPath('movie', media.id, undefined, url);
        const task: DownloadTask = {
            id: media.id,
            mediaId: media.id,
            itemType: 'movie',
            title: media.tmdb?.title || media.name,
            posterUrl: media.tmdb?.poster,
            mediaSnapshot: {
                id: media.id,
                name: media.name,
                type: media.type,
                tmdb: media.tmdb
                    ? {
                          title: media.tmdb.title,
                          poster: media.tmdb.poster,
                          year: media.tmdb.year,
                          rating: media.tmdb.rating,
                      }
                    : undefined,
            },
            status: 'queued',
            progress: 0,
            bytesDownloaded: 0,
            bytesTotal: 0,
            remoteUrl: url,
            destPath,
            retries: 0,
            createdAt: Date.now(),
        };

        store.addTask(task);
        // Init already awaited — permission already available
        showProgressNotification(task, true).catch(() => {});
        this.queue.push(media.id);
        this._processQueue();
    }

    async enqueueEpisode(
        series: MediaItem,
        episode: Episode,
        season: number,
        sourceUrl?: string,
    ): Promise<void> {
        this.init().catch(() => {});
        ensurePermission().catch(() => {});

        const store = useDownloadStore.getState();
        const id = episode.id;

        if (store.getItem(id)) throw new Error('ALREADY_DOWNLOADED');

        const existing = store.getTask(id);
        if (existing && ['queued', 'downloading', 'paused'].includes(existing.status)) {
            throw new Error('ALREADY_QUEUED');
        }

        const url = sourceUrl || episode.url;
        if (isHlsUrl(url)) throw new Error('HLS_NOT_SUPPORTED');

        const destPath = getDownloadPath('episode', series.id, episode.id, url);
        const task: DownloadTask = {
            id,
            mediaId: series.id,
            itemType: 'episode',
            title: series.tmdb?.title || series.name,
            subtitle: `T${season} E${episode.episode}${episode.name ? ` · ${episode.name}` : ''}`,
            posterUrl: episode.logo || series.tmdb?.poster,
            seriesId: series.id,
            seasonNumber: season,
            episodeNumber: episode.episode,
            mediaSnapshot: {
                id: series.id,
                name: series.name,
                type: series.type,
                tmdb: series.tmdb
                    ? {
                          title: series.tmdb.title,
                          poster: series.tmdb.poster,
                          year: series.tmdb.year,
                          rating: series.tmdb.rating,
                      }
                    : undefined,
            },
            status: 'queued',
            progress: 0,
            bytesDownloaded: 0,
            bytesTotal: 0,
            remoteUrl: url,
            destPath,
            retries: 0,
            createdAt: Date.now(),
        };

        store.addTask(task);
        showProgressNotification(task, true).catch(() => {});
        this.queue.push(id);
        this._processQueue();
    }

    async enqueueSeasonAll(series: MediaItem, season: number): Promise<void> {
        const episodes = series.episodes?.[season.toString()] ?? [];
        const errors: string[] = [];
        for (const ep of episodes) {
            try {
                // Baixar a temporada inteira não pode parar para perguntar a
                // fonte de cada episódio: pega a primeira que dá para baixar.
                const fonte = primeiraFonteBaixavel(ep.sources, ep.url);
                await this.enqueueEpisode(series, ep, season, fonte ?? undefined);
            } catch (e: any) {
                if (e.message !== 'ALREADY_DOWNLOADED' && e.message !== 'ALREADY_QUEUED') {
                    errors.push(ep.name || `E${ep.episode}`);
                }
            }
        }
        if (errors.length > 0) throw new Error(`Falhou: ${errors.join(', ')}`);
    }

    async pause(id: string): Promise<void> {
        const dl = this.activeJsDownloads.get(id);
        if (!dl) {
            // Not active — just mark paused and remove from queue
            useDownloadStore.getState().updateTask(id, { status: 'paused' });
            this.queue = this.queue.filter((q) => q !== id);
            return;
        }

        try {
            const snap = await dl.pause();
            useDownloadStore.getState().updateTask(id, {
                status: 'paused',
                resumableSnapshot: snap ? JSON.stringify(snap) : undefined,
            });
        } catch {
            useDownloadStore.getState().updateTask(id, { status: 'paused' });
        }

        this.activeJsDownloads.delete(id);
        this.queue = this.queue.filter((q) => q !== id);

        const pausedTask = useDownloadStore.getState().getTask(id);
        if (pausedTask) showProgressNotification(pausedTask, true).catch(() => {});

        // JS task was active — release its slot so queue advances
        this._releaseSlot();
    }

    async retry(id: string): Promise<void> {
        const store = useDownloadStore.getState();
        const task = store.getTask(id);
        if (!task) return;
        if (task.status === 'downloading' || task.status === 'queued') return;

        // Reset retries and get fresh URL
        store.updateTask(id, { status: 'queued', retries: 0, error: undefined, bytesDownloaded: 0 });
        await deleteFileAtPath(task.destPath);

        // Try to get fresh URL first
        try {
            const media = await getItemAPI(task.mediaId);
            let freshUrl = task.remoteUrl;
            if (task.itemType === 'movie') {
                freshUrl = media.url;
            } else {
                for (const season of Object.values(media.episodes ?? {})) {
                    const ep = season.find((e) => e.id === task.id);
                    if (ep) { freshUrl = ep.url; break; }
                }
            }
            store.updateTask(id, { remoteUrl: freshUrl, resumableSnapshot: undefined });
        } catch {
            // Use existing URL if API fails
        }

        if (!this.queue.includes(id)) this.queue.push(id);
        this._processQueue();
    }

    async resume(id: string): Promise<void> {
        const task = useDownloadStore.getState().getTask(id);
        if (!task) return;
        if (task.status === 'downloading') return;

        useDownloadStore.getState().updateTask(id, { status: 'queued', error: undefined });
        if (!this.queue.includes(id)) this.queue.push(id);
        this._processQueue();
    }

    /**
     * Move a download to the front of the queue so it starts next.
     * If the download is paused/failed, it's also re-queued automatically.
     */
    prioritize(id: string): void {
        // Remove from current position in queue
        this.queue = this.queue.filter((q) => q !== id);

        const task = useDownloadStore.getState().getTask(id);
        if (!task) return;

        // If paused or failed, re-activate it
        if (task.status === 'paused' || task.status === 'failed') {
            useDownloadStore.getState().updateTask(id, { status: 'queued', error: undefined });
        }

        // Insert at front of queue
        if (task.status === 'queued' || task.status === 'paused' || task.status === 'failed') {
            this.queue.unshift(id);
            this._processQueue();
        }
    }

    async cancel(id: string): Promise<void> {
        const wasActive = this.activeJsDownloads.has(id);

        // Stop JS task
        const dl = this.activeJsDownloads.get(id);
        if (dl) {
            try { dl.abort(); } catch {}
            this.activeJsDownloads.delete(id);
        }

        // Remove from queue if it hadn't started yet
        this.queue = this.queue.filter((q) => q !== id);

        const task = useDownloadStore.getState().getTask(id);
        if (task) {
            await deleteFileAtPath(task.destPath);
        }

        useDownloadStore.getState().updateTask(id, { status: 'cancelled' });
        useDownloadStore.getState().removeTask(id);

        dismissProgressNotification(id).catch(() => {});

        // Only release slot if download was actually running
        if (wasActive) {
            this._releaseSlot();
        } else {
            this._processQueue();
        }
    }

    async removeDownload(id: string): Promise<void> {
        await this.cancel(id);

        const item = useDownloadStore.getState().getItem(id);
        if (item) {
            const dir = item.itemType === 'movie'
                ? getDownloadDir('movie', item.mediaId)
                : getDownloadDir('episode', item.mediaId);
            await deleteFileAtPath(item.localPath);
            try { await deleteDirAtPath(dir); } catch {}
        }

        useDownloadStore.getState().removeItem(id);
    }

    // ----------------------------------------------------------------
    // Private
    // ----------------------------------------------------------------

    // --- AppState management ---

    private _setupAppStateListener(): void {
        if (this.appStateSubscription) return;
        this.appStateSubscription = AppState.addEventListener('change', (nextState) => {
            this._onAppStateChange(nextState);
        });
    }

    private _onAppStateChange(nextState: AppStateStatus): void {
        if (this.appStateTimeout) {
            clearTimeout(this.appStateTimeout);
            this.appStateTimeout = null;
        }

        if (nextState === 'background' || nextState === 'inactive') {
            // Debounce to prevent micro-backgrounds (like pulling down notification shade 
            // or tapping a notification) from immediately killing the download.
            // Wait 2 seconds before officially considering the app suspended.
            this.appStateTimeout = setTimeout(() => {
                this.appStateTimeout = null;
                this._pauseAllForBackground();
            }, 2000);
        } else if (nextState === 'active') {
            // App coming back — resume downloads that were auto-paused
            this._resumeFromBackground();
        }
    }

    /**
     * Pause every active JS download, save their snapshots, and mark them
     * in `pausedByBackground` so we can auto-resume when the app returns.
     *
     * IMPORTANT: abort() and getSnapshot() are both SYNCHRONOUS.
     * We call them directly (not via async pause()) to ensure the
     * store update happens BEFORE the OS can kill the app.
     */
    private _pauseAllForBackground(): void {
        const ids = Array.from(this.activeJsDownloads.keys());
        for (const id of ids) {
            const dl = this.activeJsDownloads.get(id);
            if (!dl) continue;

            // Synchronous: abort + snapshot + store update — no async gap
            dl.abort();
            const snap = dl.getSnapshot();
            useDownloadStore.getState().updateTask(id, {
                status: 'paused',
                resumableSnapshot: snap ? JSON.stringify(snap) : undefined,
            });

            this.activeJsDownloads.delete(id);
            this.pausedByBackground.add(id);
        }

        // Also drain the queue to prevent new downloads from starting
        // while in background. They'll be re-queued on resume.
        for (const qId of this.queue) {
            this.pausedByBackground.add(qId);
        }

        // Reset active count since all downloads are paused
        this.activeCount = 0;
        this.queue = [];

        console.log(`[DownloadManager] App backgrounded — paused ${ids.length} active download(s)`);
    }

    /**
     * Resume all downloads that were auto-paused when app went to background.
     */
    private _resumeFromBackground(): void {
        if (this.pausedByBackground.size === 0) return;

        const ids = Array.from(this.pausedByBackground);
        this.pausedByBackground.clear();

        console.log(`[DownloadManager] App foregrounded — resuming ${ids.length} download(s)`);

        for (const id of ids) {
            const task = useDownloadStore.getState().getTask(id);
            if (!task) continue;
            // Only resume if still paused (user may have cancelled while in background)
            if (task.status !== 'paused') continue;

            useDownloadStore.getState().updateTask(id, { status: 'queued', error: undefined });
            if (!this.queue.includes(id)) this.queue.push(id);
        }

        this._processQueue();
    }

    // --- Queue processing ---

    private _processQueue(): void {
        while (this.activeCount < MAX_CONCURRENT && this.queue.length > 0) {
            const id = this.queue.shift()!;
            this.activeCount++;
            this._startDownload(id);
        }
    }

    // Decrement slot and start next queued item.
    // Call exactly once per _startDownload when download ends (any reason).
    private _releaseSlot(): void {
        this.activeCount = Math.max(0, this.activeCount - 1);
        this._processQueue();
    }

    private async _startDownload(id: string): Promise<void> {
        if (this.startingDownloads.has(id)) {
            this._releaseSlot();
            return;
        }
        this.startingDownloads.add(id);

        try {
            const store = useDownloadStore.getState();
            const task = store.getTask(id);
            if (!task) {
                this._releaseSlot();
                return;
            }

            const free = await getFreeSpace();
            if (free < MIN_FREE_BYTES) {
                store.updateTask(id, { status: 'failed', error: 'Sem espaço suficiente no dispositivo' });
                this._releaseSlot();
                return;
            }

            store.updateTask(id, { status: 'downloading', error: undefined });

            // Strategy: FastDownload (16-chunk multi-range) is FASTER than the native single-connection
            // background-downloader. Use FastDownload as primary; fall back to native if multi-chunk
            // fails (server doesn't support Range, or fetch dies in background).
            // Trade-off: FastDownload runs in JS thread → pauses when app suspended.
            // Native: slower but persists in background.
            // Most users keep app open during downloads → optimize for speed by default.

            await this._startJsDownload(id, task);
        } finally {
            this.startingDownloads.delete(id);
            this._releaseSlot();
        }
    }

    // ----------------------------------------------------------------
    // JS download strategy (FastDownload multi-chunk — primary)
    // ----------------------------------------------------------------

    private async _startJsDownload(id: string, task: DownloadTask): Promise<void> {
        try {
            await ensureDir(task.destPath);

            let snapshot: FastSnapshot | undefined;
            if (task.resumableSnapshot) {
                try { snapshot = JSON.parse(task.resumableSnapshot) as FastSnapshot; } catch {}
            }

            const remoteUrl = snapshot?.url ?? task.remoteUrl;

            const dl = new FastDownload(remoteUrl, task.destPath, {
                numChunks: NUM_PARALLEL_CHUNKS,
                snapshot,
                onProgress: (p) => this._onJsProgress(id, p),
            });

            this.activeJsDownloads.set(id, dl);

            const result = await dl.start();
            this.activeJsDownloads.delete(id);

            if (result.status === 200 || result.status === 206) {
                await this._onComplete(id, task.destPath);
            } else if (result.status === 403 || result.status === 404 || result.status === 410) {
                await this._retryWithFreshUrl(id);
            } else {
                await this._retryOrFail(id, `HTTP ${result.status}`);
            }
        } catch (err: any) {
            this.activeJsDownloads.delete(id);
            const msg = err?.message ?? 'Erro desconhecido';
            if (msg === 'aborted' || msg.includes('cancel')) return;
            await this._retryOrFail(id, msg);
        }
    }

    private _onJsProgress(id: string, p: { bytesDownloaded: number; bytesTotal: number }): void {
        const now = Date.now();
        const last = this.lastProgressAt.get(id) ?? 0;
        if (now - last < PROGRESS_THROTTLE_MS) return;

        const { bytesDownloaded, bytesTotal } = p;
        const progress = bytesTotal > 0 ? bytesDownloaded / bytesTotal : 0;

        const lastBytes = this.lastProgressBytes.get(id) ?? 0;
        const elapsed = (now - last) / 1000;
        const speedBps = elapsed > 0 ? Math.max(0, (bytesDownloaded - lastBytes) / elapsed) : 0;
        const remaining = bytesTotal - bytesDownloaded;
        const eta = speedBps > 0 ? remaining / speedBps : 0;

        this.lastProgressAt.set(id, now);
        this.lastProgressBytes.set(id, bytesDownloaded);

        // Periodically persist snapshot so progress survives app kill
        const lastSnapSave = this.lastSnapshotSaveAt.get(id) ?? 0;
        let snapshotJson: string | undefined;
        if (now - lastSnapSave >= SNAPSHOT_SAVE_INTERVAL_MS) {
            const dl = this.activeJsDownloads.get(id);
            if (dl) {
                const snap = dl.getSnapshot();
                if (snap) {
                    snapshotJson = JSON.stringify(snap);
                    this.lastSnapshotSaveAt.set(id, now);
                }
            }
        }

        useDownloadStore.getState().updateTask(id, {
            progress,
            bytesDownloaded,
            bytesTotal,
            speedBps,
            eta,
            ...(snapshotJson !== undefined ? { resumableSnapshot: snapshotJson } : {}),
        });

        const task = useDownloadStore.getState().getTask(id);
        if (task) {
            showProgressNotification(task).catch(() => {});
        }
    }

    // ----------------------------------------------------------------
    // Shared completion / error handlers
    // ----------------------------------------------------------------

    private static readonly MIN_VALID_FILE_BYTES = 500 * 1024; // 500 KB

    private async _onComplete(id: string, destPath: string): Promise<void> {
        const store = useDownloadStore.getState();
        const task = store.getTask(id);
        if (!task) return;

        const fileSize = await getFileSize(destPath);

        // File is suspiciously small — server likely returned an error page.
        if (fileSize < DownloadManager.MIN_VALID_FILE_BYTES) {
            await deleteFileAtPath(destPath);
            store.updateTask(id, { retries: (task.retries ?? 0) + 1 });
            if ((task.retries ?? 0) + 1 >= MAX_RETRIES) {
                await this._retryOrFail(id, `Servidor retornou arquivo inválido (${fileSize} B)`);
                return;
            }
            await this._retryWithFreshUrl(id);
            return;
        }

        // Verify file size matches expected total (catches truncated downloads)
        if (task.bytesTotal > 0 && fileSize < task.bytesTotal * 0.95) {
            console.warn(
                `[DownloadManager] File size mismatch: disk=${fileSize} expected=${task.bytesTotal}`
            );
            await this._retryOrFail(id, `Arquivo truncado (${fileSize} vs ${task.bytesTotal})`);
            return;
        }

        const item: DownloadItem = {
            id: task.id,
            mediaId: task.mediaId,
            itemType: task.itemType,
            title: task.title,
            subtitle: task.subtitle,
            posterUrl: task.posterUrl,
            localPath: destPath,
            fileSize,
            seriesId: task.seriesId,
            seasonNumber: task.seasonNumber,
            episodeNumber: task.episodeNumber,
            mediaSnapshot: task.mediaSnapshot,
            downloadedAt: Date.now(),
        };

        store.addItem(item);
        store.removeTask(id);

        this.lastProgressAt.delete(id);
        this.lastProgressBytes.delete(id);
        this.lastSnapshotSaveAt.delete(id);

        showCompletedNotification(task).catch(() => {});

        this._processQueue();
    }

    private async _retryOrFail(id: string, error: string): Promise<void> {
        const store = useDownloadStore.getState();
        const task = store.getTask(id);
        if (!task) return;

        if (task.retries < MAX_RETRIES) {
            store.updateTask(id, {
                retries: task.retries + 1,
                status: 'queued',
                // PRESERVE resumableSnapshot — chunks already written to disk
                // are still valid. Only _retryWithFreshUrl clears it (different file).
                error,
            });
            setTimeout(() => {
                if (!this.queue.includes(id)) this.queue.push(id);
                this._processQueue();
            }, Math.pow(2, task.retries) * 2000);
        } else {
            store.updateTask(id, { status: 'failed', error });
            const updated = store.getTask(id);
            if (updated) showFailedNotification(updated, error).catch(() => {});
            this._processQueue();
        }
    }

    private async _retryWithFreshUrl(id: string): Promise<void> {
        const store = useDownloadStore.getState();
        const task = store.getTask(id);
        if (!task) return;

        try {
            // Invalidate cache so getItemAPI hits the server, not the in-memory copy.
            invalidateItemCache(task.mediaId);
            const media = await getItemAPI(task.mediaId);
            let freshUrl = task.remoteUrl;

            if (task.itemType === 'movie') {
                freshUrl = media.url;
            } else {
                for (const season of Object.values(media.episodes ?? {})) {
                    const ep = season.find((e) => e.id === task.id);
                    if (ep) { freshUrl = ep.url; break; }
                }
            }

            // Update the URL in the resumable snapshot so it resumes with the new URL
            let newSnapshot = task.resumableSnapshot;
            if (newSnapshot) {
                try {
                    const snapObj = JSON.parse(newSnapshot);
                    snapObj.url = freshUrl;
                    snapObj.finalUrl = freshUrl; // fetch will follow redirects anyway
                    newSnapshot = JSON.stringify(snapObj);
                } catch {}
            }

            // DO NOT delete the file. We want to preserve progress when URL expires!
            store.updateTask(id, {
                remoteUrl: freshUrl,
                resumableSnapshot: newSnapshot,
                status: 'queued',
                // Keep bytesDownloaded
            });

            // Exponential backoff so retry doesn't hammer a server still serving stale 60B.
            const retries = task.retries ?? 0;
            const backoffMs = Math.min(Math.pow(2, retries) * 1500, 30000);

            setTimeout(() => {
                if (!this.queue.includes(id)) this.queue.push(id);
                this._processQueue();
            }, backoffMs);
        } catch {
            await this._retryOrFail(id, 'URL expirada — tente novamente');
        }
    }

    // ----------------------------------------------------------------
    // Orphan cleanup
    // ----------------------------------------------------------------

    /**
     * Scan download directories and remove files/folders that don't belong
     * to any known task or downloaded item. Runs once on init.
     */
    private async _cleanupOrphans(): Promise<void> {
        try {
            const base = (FileSystemLegacy.documentDirectory ?? '') + 'saimo_downloads/';
            if (!useDownloadStore.persist.hasHydrated()) return;
            const isKnownFolder = (folder: string) => {
                // Re-read before each deletion: a download may have been added
                // while directory enumeration was awaiting the native filesystem.
                const store = useDownloadStore.getState();
                const ids = [...Object.values(store.tasks), ...Object.values(store.items)]
                    .flatMap(item => [item.mediaId, item.seriesId ?? item.mediaId]);
                return isKnownDownloadFolder(folder, ids);
            };

            let cleaned = 0;

            // Scan movies directory
            try {
                const moviesDir = base + 'movies/';
                const movieFolders = await FileSystemLegacy.readDirectoryAsync(moviesDir);
                for (const folder of movieFolders) {
                    if (!isKnownFolder(folder)) {
                        await deleteDirAtPath(moviesDir + encodeURIComponent(folder) + '/');
                        cleaned++;
                    }
                }
            } catch {
                // Directory might not exist yet
            }

            // Scan series directory
            try {
                const seriesDir = base + 'series/';
                const seriesFolders = await FileSystemLegacy.readDirectoryAsync(seriesDir);
                for (const folder of seriesFolders) {
                    if (!isKnownFolder(folder)) {
                        await deleteDirAtPath(seriesDir + encodeURIComponent(folder) + '/');
                        cleaned++;
                    }
                }
            } catch {
                // Directory might not exist yet
            }

            if (cleaned > 0) {
                console.log(`[DownloadManager] Cleaned ${cleaned} orphan folder(s)`);
            }
        } catch (e) {
            console.warn('[DownloadManager] orphan cleanup failed:', e);
        }
    }
}

export const downloadManager = DownloadManager.getInstance();

import * as FileSystem from 'expo-file-system/legacy';

export function formatBytes(bytes: number, decimals = 1): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(decimals)) + ' ' + sizes[i];
}

export function formatEta(seconds: number): string {
    if (!isFinite(seconds) || seconds <= 0) return '';
    if (seconds < 60) return `${Math.round(seconds)}s`;
    if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
    return `${Math.floor(seconds / 3600)}h ${Math.round((seconds % 3600) / 60)}m`;
}

export function formatSpeed(bps: number): string {
    return formatBytes(bps) + '/s';
}

/**
 * Build the local file path for a download.
 * Extracts the real file extension from the remote URL (supports .mkv, .avi, .ts, etc.)
 * so the player can detect the format correctly. Falls back to .mp4 if unknown.
 */
export function getDownloadPath(
    type: 'movie' | 'episode',
    mediaId: string,
    episodeId?: string,
    remoteUrl?: string,
): string {
    const ext = extractExtension(remoteUrl);
    const base = (FileSystem.documentDirectory ?? '') + 'saimo_downloads/';
    if (type === 'movie') return `${base}movies/${mediaId}/video${ext}`;
    return `${base}series/${mediaId}/${episodeId ?? 'ep'}${ext}`;
}

/** Extract file extension from a URL, stripping query params. Defaults to .mp4. */
function extractExtension(url?: string): string {
    if (!url) return '.mp4';
    try {
        const path = url.split('?')[0].split('#')[0];
        const lastDot = path.lastIndexOf('.');
        if (lastDot === -1) return '.mp4';
        const ext = path.substring(lastDot).toLowerCase();
        // Only allow known video extensions
        const valid = ['.mp4', '.mkv', '.avi', '.ts', '.mov', '.wmv', '.webm', '.flv'];
        return valid.includes(ext) ? ext : '.mp4';
    } catch {
        return '.mp4';
    }
}

export function getDownloadDir(type: 'movie' | 'episode', mediaId: string): string {
    const base = (FileSystem.documentDirectory ?? '') + 'saimo_downloads/';
    if (type === 'movie') return `${base}movies/${mediaId}/`;
    return `${base}series/${mediaId}/`;
}

export async function ensureDir(filePath: string): Promise<void> {
    const dir = filePath.substring(0, filePath.lastIndexOf('/') + 1);
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
}

export async function estimateFileSize(url: string): Promise<number> {
    try {
        const res = await fetch(url, {
            method: 'HEAD',
            headers: { 'User-Agent': 'Saimo/2.0 (Android)' },
        });
        const len = res.headers.get('content-length');
        return len ? parseInt(len, 10) : 0;
    } catch {
        return 0;
    }
}

export async function getFreeSpace(): Promise<number> {
    try {
        return await FileSystem.getFreeDiskStorageAsync();
    } catch {
        return Number.MAX_SAFE_INTEGER;
    }
}

export function isHlsUrl(url: string): boolean {
    const lower = url.toLowerCase();
    return lower.includes('.m3u8') || lower.split('?')[0].endsWith('.txt');
}

/**
 * A primeira fonte que dá para baixar, ou nula quando nenhuma dá.
 *
 * O downloader baixa arquivo: uma playlist HLS (`.m3u8`, ou o `master.txt` do
 * EmbedPlayer) teria de ser remontada pedaço a pedaço, e não é o que ele faz.
 * Quase todo filme com fonte de playlist tem um arquivo direto logo atrás.
 */
export function primeiraFonteBaixavel(
    sources: { url: string }[] | undefined,
    fallback?: string,
): string | null {
    const direta = (sources ?? []).map(s => s.url).find(url => url && !isHlsUrl(url));
    if (direta) return direta;
    if (fallback && !isHlsUrl(fallback)) return fallback;
    return null;
}

export function isFileUrl(url: string): boolean {
    return url.startsWith('file://');
}

export async function fileExists(path: string): Promise<boolean> {
    try {
        const info = await FileSystem.getInfoAsync(path);
        return info.exists;
    } catch {
        return false;
    }
}

export async function getFileSize(path: string): Promise<number> {
    try {
        const info = await FileSystem.getInfoAsync(path);
        return info.exists ? (info as any).size ?? 0 : 0;
    } catch {
        return 0;
    }
}

export async function deleteFileAtPath(path: string): Promise<void> {
    try {
        await FileSystem.deleteAsync(path, { idempotent: true });
    } catch {}
}

export async function deleteDirAtPath(dir: string): Promise<void> {
    try {
        await FileSystem.deleteAsync(dir, { idempotent: true });
    } catch {}
}

export async function resolveRedirectUrl(originalUrl: string): Promise<string> {
    try {
        const res = await fetch(originalUrl, {
            method: 'HEAD',
            redirect: 'follow',
            headers: { 'User-Agent': 'Saimo/2.0 (Android)' },
        });
        return res.url || originalUrl;
    } catch {
        try {
            const res = await fetch(originalUrl, {
                method: 'GET',
                redirect: 'follow',
                headers: { 'Range': 'bytes=0-0', 'User-Agent': 'Saimo/2.0 (Android)' },
            });
            return res.url || originalUrl;
        } catch {
            return originalUrl;
        }
    }
}

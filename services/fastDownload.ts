// Multi-chunk parallel HTTP Range downloader.
// Falls back to legacy single-connection if server lacks Range support or file is small.

import { File } from 'expo-file-system';

import * as FileSystemLegacy from 'expo-file-system/legacy';

/**
 * O destino como endereço que a API nova de arquivos aceita.
 *
 * Os caminhos levam o id do título ("saimo|m|M|Matchbox%20-%20O%20Filme|"),
 * e o `File` recusa o "|" ("Illegal character in path"): todo download em
 * pedaços morria antes do primeiro byte, e só baixava o servidor que não
 * informa o tamanho (esse vai pela API antiga, por uma conexão só). A API
 * antiga lê o mesmo caminho como endereço, decodificando os "%XX"; por isso
 * aqui só os caracteres proibidos em endereço são codificados e os "%XX"
 * ficam como estão, apontando para o mesmo arquivo em disco.
 */
function enderecoDoArquivo(caminho: string): string {
    return caminho.replace(/[|\s"<>^`{}\\]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0'));
}

/** Read on-disk file size (0 if missing, -1 if error reading). */
async function getFileSizeOnDisk(path: string): Promise<number> {
    try {
        const info = await FileSystemLegacy.getInfoAsync(path);
        return info.exists ? (info as any).size ?? 0 : 0;
    } catch {
        return -1;
    }
}

export interface FastProgress {
    bytesDownloaded: number;
    bytesTotal: number;
}

export interface ChunkState {
    start: number;
    end: number;
    downloaded: number;
}

export interface FastSnapshot {
    url: string;
    finalUrl: string;
    destPath: string;
    totalSize: number;
    chunks: ChunkState[];
    headers?: Record<string, string>;
    multiChunk: boolean;
    legacyResumeData?: string;
}

export interface FastDownloadOptions {
    headers?: Record<string, string>;
    numChunks?: number;
    minChunkBytes?: number;
    onProgress?: (p: FastProgress) => void;
    snapshot?: FastSnapshot;
}

export interface FastResult {
    uri: string;
    size: number;
    status: number;
    snapshot: FastSnapshot;
}

const DEFAULT_NUM_CHUNKS = 24;
const DEFAULT_MIN_CHUNK_BYTES = 512 * 1024; // 512KB — try multi-chunk for anything video-sized
const CHUNK_MAX_RETRIES = 3;
const CHUNK_RETRY_DELAY_MS = 1000;
const DEFAULT_HEADERS: Record<string, string> = {
    // Firefox UA — more CDNs allow it than VLC
    'User-Agent': 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
    'Accept': '*/*',
    'Accept-Encoding': 'identity', // no gzip — Range needs raw bytes
    'Connection': 'keep-alive',
};

export class FastDownload {
    private aborted = false;
    private abortController = new AbortController();
    private chunks: ChunkState[] = [];
    private totalSize = 0;
    private finalUrl: string;
    private multiChunk = false;
    private lastReportedBytes = 0;
    private legacyResumable: FileSystemLegacy.DownloadResumable | null = null;
    private legacyResumeData?: string;

    constructor(
        private url: string,
        private destPath: string,
        private opts: FastDownloadOptions = {}
    ) {
        this.finalUrl = url;
    }

    async start(): Promise<FastResult> {
        // Resume from snapshot
        if (this.opts.snapshot) {
            return this.resumeFromSnapshot(this.opts.snapshot);
        }

        const probeStart = Date.now();
        const probe = await this.probe();
        const probeTimeMs = Date.now() - probeStart;

        // Trust probe ONLY if the size looks like a real video.
        const probeIsTrustworthy = probe.size >= FastDownload.MIN_VALID_BYTES;

        if (probeIsTrustworthy) {
            this.totalSize = probe.size;
            this.finalUrl = probe.finalUrl;
        } else {
            this.totalSize = 0;
        }

        const minChunk = this.opts.minChunkBytes ?? DEFAULT_MIN_CHUNK_BYTES;

        if (!probeIsTrustworthy || probe.size < minChunk) {
            return this.singleConnectionDownload();
        }

        // Adaptive: reduce parallelism for slow connections to avoid saturation
        const numChunks = this.getAdaptiveChunkCount(probeTimeMs);
        return this.multiChunkDownload(numChunks);
    }

    /**
     * Reduce chunk parallelism when the connection is slow.
     * Probe latency is a reliable proxy for connection quality.
     */
    private getAdaptiveChunkCount(probeTimeMs: number): number {
        const requested = this.opts.numChunks ?? DEFAULT_NUM_CHUNKS;
        if (probeTimeMs > 5000) return Math.min(requested, 4);   // Very slow
        if (probeTimeMs > 3000) return Math.min(requested, 8);   // Slow
        if (probeTimeMs > 1500) return Math.min(requested, 12);  // Medium
        return requested;                                         // Fast
    }

    /**
     * Build a recovery snapshot by probing the server for total size.
     * Used when the app was killed without persisting a snapshot —
     * we can't know which byte ranges are valid in a multi-chunk file,
     * so this forces a fresh start but at least preserves the URL/path info.
     *
     * For single-connection downloads where bytes are sequential,
     * the on-disk file size IS the resume offset.
     */
    static async createRecoverySnapshot(
        url: string,
        destPath: string,
    ): Promise<FastSnapshot | null> {
        const diskSize = await getFileSizeOnDisk(destPath);
        if (diskSize <= 0) return null;

        // We don't know if the partial file was written multi-chunk (random access)
        // or single-connection (sequential). Multi-chunk partial files have "holes"
        // so they can't be resumed without the original chunk map.
        // Conservative approach: only create a recovery snapshot if the file looks
        // like a sequential write (single-connection). Multi-chunk files will be
        // restarted — still better than silently serving a corrupt file.
        //
        // Heuristic: if we have NO information, return null and let the manager
        // decide. The manager will check the on-disk size and can create a
        // single-chunk snapshot that resumes from diskSize offset.
        return null;
    }

    abort(): void {
        this.aborted = true;
        try { this.abortController.abort(); } catch {}
        if (this.legacyResumable) {
            try { this.legacyResumable.cancelAsync(); } catch {}
        }
    }

    async pause(): Promise<FastSnapshot | null> {
        if (this.legacyResumable) {
            try {
                const state = await this.legacyResumable.pauseAsync();
                this.legacyResumeData = JSON.stringify(state);
            } catch {}
        } else {
            this.abort();
        }
        return this.getSnapshot();
    }

    getSnapshot(): FastSnapshot | null {
        if (this.totalSize === 0 && !this.legacyResumeData) return null;
        return {
            url: this.url,
            finalUrl: this.finalUrl,
            destPath: this.destPath,
            totalSize: this.totalSize,
            chunks: this.chunks.map((c) => ({ ...c })),
            headers: this.opts.headers,
            multiChunk: this.multiChunk,
            legacyResumeData: this.legacyResumeData,
        };
    }

    // ---------------------------------------------------------------------
    // Probe
    // ---------------------------------------------------------------------

    // Minimum valid video size — anything smaller is treated as an error page / redirect body.
    private static readonly MIN_VALID_BYTES = 500 * 1024; // 500 KB

    private async probe(): Promise<{ size: number; finalUrl: string }> {
        // Separate controller — aborting probe must NOT kill subsequent chunk fetches.
        const probeCtrl = new AbortController();
        const timeoutId = setTimeout(() => {
            try { probeCtrl.abort(); } catch {}
        }, 8000);

        // Forward outer abort to probe controller
        const onOuterAbort = () => { try { probeCtrl.abort(); } catch {} };
        this.abortController.signal.addEventListener('abort', onOuterAbort);

        const cleanup = () => {
            clearTimeout(timeoutId);
            this.abortController.signal.removeEventListener('abort', onOuterAbort);
        };

        try {
            // Use HEAD — no body returned, immune to "tiny redirect body" servers.
            // Some CDNs reject HEAD (return 405). Fall back to bytes=0-0 GET probe in that case.
            let res = await fetch(this.url, {
                method: 'HEAD',
                redirect: 'follow',
                headers: { ...DEFAULT_HEADERS, ...(this.opts.headers ?? {}) },
                signal: probeCtrl.signal,
            });

            // If HEAD rejected, try a tiny Range probe
            if (res.status === 405 || res.status === 501 || !res.headers.get('content-length')) {
                res = await fetch(this.url, {
                    method: 'GET',
                    redirect: 'follow',
                    headers: {
                        ...DEFAULT_HEADERS,
                        ...(this.opts.headers ?? {}),
                        Range: 'bytes=0-0',
                    },
                    signal: probeCtrl.signal,
                });
                try { res.body?.cancel(); } catch {}
            }

            cleanup();

            // Try content-range first (Range probe), then content-length (HEAD/full GET).
            const cr = res.headers.get('content-range');
            let total = cr ? parseInt(cr.split('/')[1] ?? '0', 10) : 0;

            if (!total || isNaN(total)) {
                const cl = res.headers.get('content-length');
                total = cl ? parseInt(cl, 10) : 0;
            }

            if (isNaN(total)) total = 0;

            return {
                size: total,
                finalUrl: res.url || this.url,
            };
        } catch {
            cleanup();
            return { size: 0, finalUrl: this.url };
        }
    }

    // ---------------------------------------------------------------------
    // Multi-chunk
    // ---------------------------------------------------------------------

    private async multiChunkDownload(numChunks: number): Promise<FastResult> {
        this.multiChunk = true;

        // Build chunk plan
        const chunkSize = Math.ceil(this.totalSize / numChunks);
        this.chunks = [];
        for (let i = 0; i < numChunks; i++) {
            const start = i * chunkSize;
            const end = Math.min(start + chunkSize - 1, this.totalSize - 1);
            if (start <= end) {
                this.chunks.push({ start, end, downloaded: 0 });
            }
        }

        // Prepare file — fresh start, so always create new empty file
        await this.prepareFile(this.totalSize, true);

        // First-chunk probe — verify server actually returns 206
        try {
            await this.fetchFirstChunkProbe();
        } catch (err) {
            // Server lied about Accept-Ranges. Fall back.
            console.warn('[FastDownload] Range probe failed, using single connection:', err);
            this.multiChunk = false;
            return this.singleConnectionDownload();
        }

        // Run remaining chunks in parallel
        try {
            await Promise.all(
                this.chunks.map((c, idx) => idx === 0 ? Promise.resolve() : this.fetchChunk(c))
            );
        } catch (err: any) {
            if (this.aborted) throw new Error('aborted');
            this.abort(); // Cancel remaining chunks!
            throw err;
        }

        if (this.aborted) throw new Error('aborted');

        // Verify all chunks are fully downloaded before declaring success
        const integrity = this.verifyIntegrity();
        if (!integrity.valid) {
            console.warn('[FastDownload] Integrity check failed:', integrity.reason);
            throw new Error(`Integrity: ${integrity.reason}`);
        }

        return {
            uri: this.destPath,
            size: this.totalSize,
            status: 200,
            snapshot: this.getSnapshot()!,
        };
    }

    /**
     * Verify that every chunk was fully downloaded and the total matches.
     */
    verifyIntegrity(): { valid: boolean; reason?: string } {
        if (!this.multiChunk || this.chunks.length === 0) return { valid: true };

        let totalDownloaded = 0;
        for (let i = 0; i < this.chunks.length; i++) {
            const c = this.chunks[i];
            const expected = c.end - c.start + 1;
            if (c.downloaded !== expected) {
                return {
                    valid: false,
                    reason: `Chunk ${i} incomplete: ${c.downloaded}/${expected} bytes`,
                };
            }
            totalDownloaded += c.downloaded;
        }

        if (totalDownloaded !== this.totalSize) {
            return {
                valid: false,
                reason: `Total mismatch: ${totalDownloaded} vs ${this.totalSize}`,
            };
        }

        return { valid: true };
    }

    private async fetchFirstChunkProbe(): Promise<void> {
        const c = this.chunks[0];
        const res = await fetch(this.finalUrl, {
            headers: {
                ...DEFAULT_HEADERS,
                ...(this.opts.headers ?? {}),
                Range: `bytes=${c.start}-${c.end}`,
            },
            signal: this.abortController.signal,
        });

        if (res.status !== 206) {
            // Server ignored Range. Abort multi-chunk.
            try { res.body?.cancel(); } catch {}
            throw new Error(`No Range support (status ${res.status})`);
        }

        await this.streamToFile(res, c);
    }

    private async fetchChunk(chunk: ChunkState): Promise<void> {
        if (this.aborted) return;

        const remaining = chunk.end - (chunk.start + chunk.downloaded) + 1;
        if (remaining <= 0) return;

        let lastError: Error | null = null;

        for (let attempt = 0; attempt <= CHUNK_MAX_RETRIES; attempt++) {
            if (this.aborted) return;

            try {
                const rangeStart = chunk.start + chunk.downloaded;

                const res = await fetch(this.finalUrl, {
                    headers: {
                        ...DEFAULT_HEADERS,
                        ...(this.opts.headers ?? {}),
                        Range: `bytes=${rangeStart}-${chunk.end}`,
                    },
                    signal: this.abortController.signal,
                });

                if (res.status !== 206 && res.status !== 200) {
                    throw new Error(`Chunk fetch failed: HTTP ${res.status}`);
                }

                await this.streamToFile(res, chunk);
                return; // Success — exit retry loop
            } catch (err: any) {
                if (this.aborted) return;
                lastError = err;
                if (attempt < CHUNK_MAX_RETRIES) {
                    const delay = CHUNK_RETRY_DELAY_MS * Math.pow(2, attempt);
                    console.warn(
                        `[FastDownload] Chunk retry ${attempt + 1}/${CHUNK_MAX_RETRIES} in ${delay}ms`
                    );
                    await new Promise((r) => setTimeout(r, delay));
                }
            }
        }

        throw lastError ?? new Error('Chunk download failed after retries');
    }

    private async streamToFile(res: Response, chunk: ChunkState): Promise<void> {
        if (!res.body) {
            // No streaming support — fall back to arrayBuffer
            const buf = new Uint8Array(await res.arrayBuffer());
            this.writeAt(chunk.start + chunk.downloaded, buf);
            chunk.downloaded += buf.byteLength;
            this.reportProgress();
            return;
        }

        // Open file handle ONCE per chunk and keep it open across all reader.read() calls.
        // Previous code opened/closed handle per ~16KB chunk = massive syscall overhead.
        const file = new File(enderecoDoArquivo(this.destPath));
        const handle = file.open();
        const reader = res.body.getReader();

        // Buffer small reads into 256KB batches before writing — reduces JS↔native bridge crossings.
        const FLUSH_BYTES = 256 * 1024;
        let pending: Uint8Array[] = [];
        let pendingBytes = 0;

        const flush = () => {
            if (pendingBytes === 0) return;
            const merged = pending.length === 1
                ? pending[0]
                : (() => {
                    const out = new Uint8Array(pendingBytes);
                    let off = 0;
                    for (const p of pending) { out.set(p, off); off += p.byteLength; }
                    return out;
                })();
            handle.offset = chunk.start + chunk.downloaded;
            handle.writeBytes(merged);
            chunk.downloaded += merged.byteLength;
            pending = [];
            pendingBytes = 0;
        };

        try {
            while (true) {
                if (this.aborted) {
                    try { await reader.cancel(); } catch {}
                    flush();
                    return;
                }
                const { done, value } = await reader.read();
                if (done) {
                    flush();
                    break;
                }
                if (!value || value.byteLength === 0) continue;

                pending.push(value);
                pendingBytes += value.byteLength;

                if (pendingBytes >= FLUSH_BYTES) {
                    flush();
                    this.reportProgress();
                }
            }
            this.reportProgress();
        } finally {
            try { reader.releaseLock(); } catch {}
            try { handle.close(); } catch {}
        }
    }

    // ---------------------------------------------------------------------
    // File ops (random-access write)
    // ---------------------------------------------------------------------

    /**
     * Prepare the destination file for writing.
     * @param size     Expected total file size.
     * @param fresh    If true, delete any existing file and create a new empty file.
     *                 If false (resume), keep the existing file on disk intact.
     */
    private async prepareFile(size: number, fresh: boolean): Promise<void> {
        // Ensure parent dir
        const dir = this.destPath.substring(0, this.destPath.lastIndexOf('/') + 1);
        await FileSystemLegacy.makeDirectoryAsync(dir, { intermediates: true });

        if (fresh) {
            // Delete existing partial — this is a brand-new download
            try { await FileSystemLegacy.deleteAsync(this.destPath, { idempotent: true }); } catch {}
        }

        // Create file if it doesn't exist (no-op if it already does)
        const info = await FileSystemLegacy.getInfoAsync(this.destPath);
        const file = new File(enderecoDoArquivo(this.destPath));
        if (!info.exists) {
            try {
                file.create();
            } catch {
                // Ignore errors if it was created concurrently
            }
        }

        // Pre-allocate by writing last byte (creates sparse file) — only for fresh starts
        // or if the file is smaller than expected (ensures file is big enough for random writes)
        if (size > 0) {
            const diskSize = await getFileSizeOnDisk(this.destPath);
            if (diskSize < size) {
                const handle = file.open();
                try {
                    handle.offset = size - 1;
                    handle.writeBytes(new Uint8Array([0]));
                } finally {
                    handle.close();
                }
            }
        }
    }

    private writeAt(offset: number, bytes: Uint8Array): void {
        const file = new File(enderecoDoArquivo(this.destPath));
        const handle = file.open();
        try {
            handle.offset = offset;
            handle.writeBytes(bytes);
        } finally {
            handle.close();
        }
    }

    // ---------------------------------------------------------------------
    // Progress
    // ---------------------------------------------------------------------

    private reportProgress(): void {
        const total = this.chunks.reduce((a, c) => a + c.downloaded, 0);
        if (total === this.lastReportedBytes) return;
        this.lastReportedBytes = total;
        this.opts.onProgress?.({
            bytesDownloaded: total,
            bytesTotal: this.totalSize,
        });
    }

    // ---------------------------------------------------------------------
    // Single-connection fallback (expo-file-system legacy — battle-tested on Android)
    // ---------------------------------------------------------------------

    private async singleConnectionDownload(): Promise<FastResult> {
        this.multiChunk = false;
        this.chunks = [];

        const resumeData = this.opts.snapshot?.legacyResumeData;

        if (!resumeData) {
            const dir = this.destPath.substring(0, this.destPath.lastIndexOf('/') + 1);
            await FileSystemLegacy.makeDirectoryAsync(dir, { intermediates: true });
        }

        this.legacyResumable = FileSystemLegacy.createDownloadResumable(
            this.finalUrl,
            this.destPath,
            { headers: { ...DEFAULT_HEADERS, ...(this.opts.headers ?? {}) } },
            (p) => {
                this.totalSize = p.totalBytesExpectedToWrite;
                this.opts.onProgress?.({
                    bytesDownloaded: p.totalBytesWritten,
                    bytesTotal: p.totalBytesExpectedToWrite,
                });
            },
            resumeData
        );

        const result = await this.legacyResumable.downloadAsync();
        this.legacyResumable = null;

        if (!result) throw new Error('aborted');

        return {
            uri: result.uri,
            size: this.totalSize,
            status: result.status,
            snapshot: this.getSnapshot() ?? {
                url: this.url,
                finalUrl: this.finalUrl,
                destPath: this.destPath,
                totalSize: this.totalSize,
                chunks: [],
                multiChunk: false,
                legacyResumeData: undefined,
            },
        };
    }

    // ---------------------------------------------------------------------
    // Resume
    // ---------------------------------------------------------------------

    private async resumeFromSnapshot(snap: FastSnapshot): Promise<FastResult> {
        this.totalSize = snap.totalSize;
        this.finalUrl = snap.finalUrl;
        this.chunks = snap.chunks.map((c) => ({ ...c }));
        this.multiChunk = snap.multiChunk;
        this.legacyResumeData = snap.legacyResumeData;
        this.lastReportedBytes = this.chunks.reduce((a, c) => a + c.downloaded, 0);

        // Verify the partial file still exists on disk
        const diskSize = await getFileSizeOnDisk(this.destPath);

        if (diskSize === 0 && this.lastReportedBytes > 0) {
            // File was deleted (e.g. OS cleared cache) — reset all chunk progress
            console.warn('[FastDownload] Partial file missing on disk, restarting chunks from 0');
            for (const c of this.chunks) c.downloaded = 0;
            this.lastReportedBytes = 0;
        }

        // Ensure file is prepared for writing (don't delete existing — resume mode)
        await this.prepareFile(this.totalSize, false);

        // Initial progress emit (we already have some bytes)
        this.opts.onProgress?.({
            bytesDownloaded: this.lastReportedBytes,
            bytesTotal: this.totalSize,
        });

        if (!this.multiChunk) {
            // Legacy mode uses native resumable state
            return this.singleConnectionDownload();
        }

        // Re-fetch only missing parts of each chunk
        try {
            await Promise.all(this.chunks.map((c) => this.fetchChunk(c)));
        } catch (err: any) {
            if (this.aborted) throw new Error('aborted');
            this.abort(); // Cancel remaining chunks!
            throw err;
        }

        if (this.aborted) throw new Error('aborted');

        return {
            uri: this.destPath,
            size: this.totalSize,
            status: 200,
            snapshot: this.getSnapshot()!,
        };
    }
}

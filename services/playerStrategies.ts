const VLC_UA = 'VLC/3.0.20 LibVLC/3.0.20';
const MOB_UA =
    'Mozilla/5.0 (Linux; Android 13; SM-A536B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';

export interface VideoStrategy {
    headers: Record<string, string>;
    label: string;
}

/*
 * Todo navegador e todo player manda `Accept`; o ExoPlayer, que é quem toca
 * aqui embaixo, não manda nenhum — e há servidor que trata a ausência como
 * cliente suspeito. O EmbedPlayer, que serve os doramas e animes novos,
 * responde 200 com o corpo "security error" no lugar da playlist: o player
 * reclama que a resposta não começa com #EXTM3U e a fonte cai.
 *
 * Medido cabeçalho a cabeçalho: com o `Accept` a playlist vem, sem ele não
 * vem, e Referer e Origin não fazem diferença nenhuma. Como nenhuma das
 * estratégias abaixo o mandava, todas as quatro falhavam nessas fontes.
 */
const ACEITA = { Accept: '*/*' };

export const STRATEGIES: VideoStrategy[] = [
    { label: 'VLC UA',      headers: { ...ACEITA, 'User-Agent': VLC_UA } },
    { label: 'No headers',  headers: { ...ACEITA } },
    { label: 'Mobile UA',   headers: { ...ACEITA, 'User-Agent': MOB_UA } },
    { label: 'VLC + Range', headers: { ...ACEITA, 'User-Agent': VLC_UA, 'Icy-MetaData': '0' } },
];

/** `/api/stream` só escolhe o destino quando chamado e pode cair em HLS. */
export function ehEnderecoDinamico(url: string): boolean {
    return /^https?:\/\/[^/]+\/api\/stream\?/i.test(url);
}

/**
 * Pergunta ao `/api/stream` (com `json=1`) o destino final. Sem isso o ExoPlayer
 * tratava a playlist HLS como vídeo comum e acusava formato inválido. Destino
 * embrulhado no proxy do site sai direto (o app abre http). Devolve `null`
 * quando o servidor afirma (404) que não há vídeo em lugar nenhum, e a própria
 * URL quando não deu para saber.
 */
export async function resolverDinamica(url: string, timeoutMs = 12000): Promise<string | null> {
    if (!ehEnderecoDinamico(url)) return url;
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetch(url + '&json=1', { signal: controller.signal });
        if (res.status === 404) return null;
        if (!res.ok) return url;
        const destino = String((await res.json())?.url ?? '');
        if (!destino) return url;
        const proxy = destino.match(/\/api\/proxy\?(?:.*&)?url=([^&]+)/);
        if (proxy) {
            const dentro = decodeURIComponent(proxy[1]);
            if (/^https?:\/\//.test(dentro)) return dentro;
        }
        return destino;
    } catch {
        return url;
    } finally {
        clearTimeout(t);
    }
}

export async function resolveUrlViaGet(url: string, timeoutMs = 8000): Promise<string> {
    try {
        const controller = new AbortController();
        const t = setTimeout(() => controller.abort(), timeoutMs);
        const res = await fetch(url, {
            method: 'GET',
            headers: { Range: 'bytes=0-0', 'User-Agent': VLC_UA },
            redirect: 'follow',
            signal: controller.signal,
        });
        clearTimeout(t);
        return res.url || url;
    } catch {
        return url;
    }
}

export function detectSourceType(url: string): string | undefined {
    const lower = url.toLowerCase().split('?')[0];
    if (lower.endsWith('.m3u8') || lower.includes('m3u8') || lower.split('?')[0].endsWith('.txt')) return 'm3u8';
    if (lower.endsWith('.mpd')) return 'mpd';
    if (lower.endsWith('.mp4')) return 'mp4';
    if (lower.endsWith('.mkv')) return 'mkv';
    if (lower.endsWith('.avi')) return 'avi';
    if (lower.endsWith('.mov')) return 'mov';
    if (lower.endsWith('.webm')) return 'webm';
    if (lower.endsWith('.ts')) return 'mp2t';
    // IPTV streams — numeric channel ID as last path segment (e.g. /user/pass/3)
    const lastSegment = lower.split('?')[0].split('/').pop() ?? '';
    if (/^\d+$/.test(lastSegment)) return 'mp2t';
    // Local files (file://) without a recognized extension — treat as generic video
    if (lower.startsWith('file://')) return 'mp4';
    return undefined;
}

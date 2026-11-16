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
 * Extrai parâmetro de busca de uma URL via regex simples (compatível com qualquer engine JS).
 */
function extrairParam(url: string, param: string): string | null {
    const match = url.match(new RegExp(`[?&]${param}=([^&#]+)`, 'i'));
    return match ? decodeURIComponent(match[1]) : null;
}

/**
 * Pergunta ao `/api/stream` (com `json=1`) o destino final. Sem isso o ExoPlayer
 * tratava a playlist HLS como vídeo comum e acusava formato inválido. Destino
 * embrulhado no proxy do site sai direto (o app abre http).
 * Devolve `null` apenas quando nenhuma fonte estiver disponível.
 */
export async function resolverDinamica(url: string, timeoutMs = 12000): Promise<string | null> {
    if (!ehEnderecoDinamico(url)) return url;
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetch(url + '&json=1', { signal: controller.signal });
        if (res.status === 200) {
            const destino = String((await res.json())?.url ?? '');
            if (destino) {
                const proxy = destino.match(/\/api\/proxy\?(?:.*&)?url=([^&]+)/);
                if (proxy) {
                    const dentro = decodeURIComponent(proxy[1]);
                    if (/^https?:\/\//.test(dentro)) return dentro;
                }
                return destino;
            }
        }
    } catch {
        // Sem resposta: sem fonte.
    } finally {
        clearTimeout(t);
    }

    // Fallback: se o relay falhou ou retornou 404/520, resolve diretamente na RedeFlix
    return await resolverRedeFlixDireto(url, timeoutMs);
}

/**
 * Resolve diretamente da RedeFlix pelo IP do aparelho celular.
 */
export async function resolverRedeFlixDireto(url: string, timeoutMs = 8000): Promise<string | null> {
    try {
        const u = new URL(url);
        const idRaw = (u.searchParams.get('id') || '').replace(/^tmdb:/, '');
        const cleanId = idRaw.split(':')[0];
        if (!cleanId || !/^\d+$/.test(cleanId)) return null;

        const tipo = (u.searchParams.get('tipo') || u.searchParams.get('type') || 'movie').toLowerCase();
        const isSerie = tipo === 'series' || tipo === 'tv';
        const s = u.searchParams.get('s') || u.searchParams.get('temporada') || '1';
        const e = u.searchParams.get('e') || u.searchParams.get('episodio') || '1';
        const versao = (u.searchParams.get('versao') || u.searchParams.get('v') || 'dub').toLowerCase();

        const pageUrl = isSerie
            ? `https://redeflixapi.click/serie/${cleanId}/${s}/${e}`
            : `https://redeflixapi.click/filme/${cleanId}`;

        const c1 = new AbortController();
        const t1 = setTimeout(() => c1.abort(), timeoutMs);
        const pageRes = await fetch(pageUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko)',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            },
            signal: c1.signal,
        });
        clearTimeout(t1);
        if (!pageRes.ok) return null;
        const html = await pageRes.text();

        let launchTicket = '';
        const fastMatch = /fastLaunchTickets\s*=\s*(\{.*?\});/.exec(html);
        if (fastMatch?.[1]) {
            try {
                const tickets = JSON.parse(fastMatch[1]);
                launchTicket = versao === 'leg' ? (tickets.legendado || tickets.default) : (tickets.default || tickets.legendado);
            } catch (_) {}
        }
        if (!launchTicket) {
            const mTicket = /playbackResolveTicket\s*=\s*"([^"]+)"/.exec(html);
            if (mTicket?.[1]) launchTicket = mTicket[1];
        }
        if (!launchTicket) return null;

        const c2 = new AbortController();
        const t2 = setTimeout(() => c2.abort(), timeoutMs);
        const sourceRes = await fetch('https://redeflixapi.click/playerkys/source.php', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Requested-With': 'RedeFlixPlayer',
                'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
                'Referer': 'https://redeflixapi.click/playerkys/index.html',
                'Origin': 'https://redeflixapi.click',
            },
            body: JSON.stringify({ ticket: launchTicket }),
            signal: c2.signal,
        });
        clearTimeout(t2);
        if (!sourceRes.ok) return null;
        const j = await sourceRes.json();
        return j?.url || null;
    } catch {
        return null;
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

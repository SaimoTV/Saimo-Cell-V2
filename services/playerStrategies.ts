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
 * Resolve a fonte diretamente na RedeFlix a partir da conexão residencial/móvel do celular
 * quando o endpoint remoto do Cloudflare Pages falhar (404, 520) ou for bloqueado por anti-bot.
 */
export async function resolverRedeFlixDireto(url: string, timeoutMs = 8000): Promise<string | null> {
    try {
        const id = extrairParam(url, 'id');
        if (!id) return null;

        const tipo = (extrairParam(url, 'tipo') || extrairParam(url, 'type') || 'movie').toLowerCase();
        const season = extrairParam(url, 's') || extrairParam(url, 't') || extrairParam(url, 'temporada') || '1';
        const episode = extrairParam(url, 'e') || extrairParam(url, 'ep') || extrairParam(url, 'episodio') || '1';
        const versao = (extrairParam(url, 'versao') || extrairParam(url, 'v') || 'dub').toLowerCase();

        const isSerie = tipo === 'series' || tipo === 'tv' || tipo === 'serie';
        const pagina = isSerie
            ? `https://redeflixapi.click/serie/${id}/${season}/${episode}`
            : `https://redeflixapi.click/filme/${id}`;

        const chromeUA =
            'Mozilla/5.0 (Linux; Android 13; SM-A536B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';

        const ctrl1 = new AbortController();
        const t1 = setTimeout(() => ctrl1.abort(), timeoutMs);

        const r1 = await fetch(pagina, {
            headers: {
                'User-Agent': chromeUA,
                'Referer': 'https://redeflixapi.click/',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
            },
            signal: ctrl1.signal,
        });
        clearTimeout(t1);

        if (!r1.ok) return null;
        const html = await r1.text();

        let ticket: string | null = null;
        const mFast = html.match(/fastLaunchTickets\s*=\s*(\{[^}]+\})/);
        if (mFast) {
            try {
                const tickets = JSON.parse(mFast[1]);
                const preferidos = versao === 'leg' ? ['legendado', 'default'] : ['default', 'legendado'];
                for (const srv of preferidos) {
                    if (tickets[srv] && typeof tickets[srv] === 'string' && tickets[srv].trim()) {
                        ticket = tickets[srv].trim();
                        break;
                    }
                }
            } catch {}
        }

        if (!ticket) {
            const mResolve = html.match(/playbackResolveTicket\s*=\s*['"]([^'"]+)['"]/);
            if (mResolve) {
                const resolveTicket = mResolve[1];
                const srv = versao === 'leg' ? 'legendado' : 'default';
                const ctrlResolve = new AbortController();
                const tRes = setTimeout(() => ctrlResolve.abort(), timeoutMs);
                try {
                    const rRes = await fetch('https://redeflixapi.click/playback-resolve.php', {
                        method: 'POST',
                        headers: {
                            'User-Agent': chromeUA,
                            'Referer': pagina,
                            'Origin': 'https://redeflixapi.click',
                            'X-Requested-With': 'RedeFlixPlayer',
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({ ticket: resolveTicket, server: srv }),
                        signal: ctrlResolve.signal,
                    });
                    if (rRes.ok) {
                        const jsonRes = await rRes.json();
                        ticket = jsonRes.launchTicket || null;
                    }
                } catch {} finally {
                    clearTimeout(tRes);
                }
            }
        }

        if (!ticket) return null;

        const ctrl2 = new AbortController();
        const t2 = setTimeout(() => ctrl2.abort(), timeoutMs);
        const r2 = await fetch('https://redeflixapi.click/playerkys/source.php', {
            method: 'POST',
            headers: {
                'User-Agent': chromeUA,
                'Referer': pagina,
                'Origin': 'https://redeflixapi.click',
                'X-Requested-With': 'RedeFlixPlayer',
                'Content-Type': 'application/json',
                'Accept': 'application/json, text/plain, */*',
            },
            body: JSON.stringify({ ticket }),
            signal: ctrl2.signal,
        });
        clearTimeout(t2);

        if (!r2.ok) return null;
        const resJson = await r2.json();
        const videoUrl = resJson.url || resJson.data?.video_url;
        if (typeof videoUrl === 'string' && videoUrl.startsWith('http')) {
            return videoUrl;
        }

        return null;
    } catch {
        return null;
    }
}

/**
 * Pergunta ao `/api/stream` (com `json=1`) o destino final. Sem isso o ExoPlayer
 * tratava a playlist HLS como vídeo comum e acusava formato inválido. Destino
 * embrulhado no proxy do site sai direto (o app abre http).
 * Se a API remota do Cloudflare Pages falhar (404, 520, somenteApp) devido a bloqueios
 * de datacenter, resolve a fonte diretamente no RedeFlix a partir da conexão do aparelho.
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
        // Se a chamada remota falhar, prossegue para resolução nativa direta
    } finally {
        clearTimeout(t);
    }

    // Fallback nativo: quando a borda remota da Cloudflare sofrer 520/404 ou somenteApp
    try {
        const direto = await resolverRedeFlixDireto(url);
        if (direto) return direto;
    } catch {}

    return null;
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

// Aplicar e testar os endereços das listas (primeira abertura e Ajustes > Listas).
import { useLinksStore } from '../stores/linksStore';
import { useChannelStore } from '../stores/channelStore';
import { setRemoteChannels } from '../data/channels';
import { getCanaisMinhasListas } from './minhasListas';
import { clearSaimoSourceCache } from './saimoSources';
import { clearAllCaches } from './apiService';
import { clearTrendingCache } from './trendingService';
import { clearEPGCache, esquecerCanaisDoGuia } from './epgService';

export type TipoDeLista = 'canais' | 'filmes';

/** Arquivo que prova que o endereço serve a lista: canais → catalogo.txt, filmes → indice.txt. */
export const ARQUIVO_DE_TESTE: Record<TipoDeLista, string> = {
    canais: 'catalogo.txt',
    filmes: 'indice.txt',
};

/** `GET <base>arquivo` deve dar 200. */
export async function testarLink(tipo: TipoDeLista, base: string, prazoMs = 10_000): Promise<boolean> {
    const controle = new AbortController();
    const prazo = setTimeout(() => controle.abort(), prazoMs);
    try {
        const r = await fetch(`${base}${ARQUIVO_DE_TESTE[tipo]}`, {
            cache: 'no-store',
            headers: { 'Cache-Control': 'no-cache' },
            signal: controle.signal,
        });
        return r.status === 200;
    } catch {
        return false;
    } finally {
        clearTimeout(prazo);
    }
}

/**
 * Grava os dois endereços (já normalizados; '' = apagar) e recarrega os dados.
 * Endereço que mudou perde o que tinha em cache; apagado volta ao estado vazio.
 */
export async function aplicarLinks(canais: string, filmes: string): Promise<void> {
    const antes = useLinksStore.getState();
    const mudouCanais = canais !== antes.linkCanais;
    const mudouFilmes = filmes !== antes.linkFilmes;
    if (!mudouCanais && !mudouFilmes) return;

    if (mudouCanais) {
        await clearSaimoSourceCache('canais');
        esquecerCanaisDoGuia();
        await clearEPGCache();
    }
    if (mudouFilmes) {
        clearAllCaches();
        clearTrendingCache();
    }

    useLinksStore.getState().setLinks(canais, filmes);

    if (mudouCanais) {
        if (!canais) {
            const minhas = getCanaisMinhasListas();
            setRemoteChannels(minhas);
            useChannelStore.setState({ channels: minhas, isLoading: false, carregou: true });
        } else {
            const minhas = getCanaisMinhasListas();
            useChannelStore.setState({ channels: minhas, carregou: false });
            setRemoteChannels(minhas);
            void useChannelStore.getState().fetchChannels(true);
        }
    }
    // A aba de filmes reage sozinha à mudança de `linkFilmes`.
}

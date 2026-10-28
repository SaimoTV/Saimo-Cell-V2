import { create } from 'zustand';
import { AppState } from 'react-native';
import type { Channel, CategoryId } from '../types';
import { setRemoteChannels } from '../data/channels';
import { plutoIdDe, registerChannel } from '../services/epgService';
import { loadCachedChannels, loadRemoteChannels } from '../services/saimoSources';
import { baseCanais } from '../services/enderecos';
import { useLinksStore } from './linksStore';
import { aoMudar as aoMudarMinhasListas, atualizarVencidas as atualizarMinhasVencidas, carregarMinhasListas, getCanaisMinhasListas } from '../services/minhasListas';
import { atualizar as atualizarFontesDesativadas, VERIFICAR_MS as FONTES_MS } from '../services/fontesDesativadas';

/** Catálogo + canais das "Minhas listas" ativas (o que o usuário colou fica só neste aparelho). */
function comMinhas(data: Channel[]): Channel[] {
    const minhas = getCanaisMinhasListas();
    const base = data.some(c => c.id.startsWith('minha-')) ? data.filter(c => !c.id.startsWith('minha-')) : data;
    return minhas.length ? [...base, ...minhas] : base;
}

function sortKey(s: string): string {
    return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

interface ChannelStore {
    // Estado
    selectedCategory: CategoryId | 'Todos' | 'Favoritos' | string;
    currentChannelId: string | null;
    searchQuery: string;
    isLoading: boolean;
    channels: Channel[];
    /** A primeira busca da lista já terminou (com ou sem sucesso). */
    carregou: boolean;

    // Ações
    setCategory: (category: CategoryId | 'Todos' | 'Favoritos' | string) => void;
    setCurrentChannel: (channelId: string | null) => void;
    setSearchQuery: (query: string) => void;
    setLoading: (loading: boolean) => void;
    fetchChannels: (force?: boolean) => Promise<void>;
    /** Passa a vigiar os servidores desligados no painel. Devolve como parar. */
    vigiarFontesDesativadas: () => () => void;

    // Seletores
    getFilteredChannels: (includeAdult: boolean, favorites: string[]) => Channel[];
    getCategories: (includeAdult: boolean) => string[];
}

/** Se o canal é da resolução da pílula (pelo nome, como a lista escreve). */
function daResolucao(ch: Channel, resolucao: string): boolean {
    const name = ch.name.toLowerCase();
    const res = resolucao.toLowerCase();
    if (res === '4k') return name.includes('4k');
    if (res === 'fhd') return name.includes('fhd') && !name.includes('4k');
    if (res === 'hd') return (name.includes(' hd') || name.endsWith('hd')) && !name.includes('fhd');
    if (res === 'sd') return name.includes('sd');
    return true;
}

export const useChannelStore = create<ChannelStore>((set, get) => ({
    selectedCategory: 'Todos',
    currentChannelId: null,
    searchQuery: '',
    isLoading: false,
    channels: [],
    carregou: false,

    setCategory: (category) => {
        set({ selectedCategory: category });
    },

    setCurrentChannel: (channelId) => {
        set({ currentChannelId: channelId });
    },

    setSearchQuery: (query) => {
        set({ searchQuery: query });
    },

    setLoading: (loading) => {
        set({ isLoading: loading });
    },

    fetchChannels: async (force = true) => {
        try {
            // Sem o endereço da lista de canais não há o que buscar: a tela
            // mostra o estado vazio e nenhum pedido sai.
            await carregarMinhasListas();
            void atualizarMinhasVencidas();
            if (!(await baseCanais())) {
                const so = comMinhas([]);
                setRemoteChannels(so);
                set({ channels: so, isLoading: false, carregou: true });
                return;
            }
            set({ isLoading: true });
            // Abre a tela na hora com o que já está salvo em disco enquanto a
            // lista nova é baixada por trás, igual ao site e ao Mac.
            const semCatalogo = () => get().channels.every(c => c.id.startsWith('minha-'));
            if (semCatalogo()) {
                const emDisco = await loadCachedChannels().catch(() => null);
                if (emDisco && emDisco.length > 0 && semCatalogo()) {
                    emDisco.forEach(ch => registerChannel(ch.id, ch.name, plutoIdDe(ch)));
                    const junto = comMinhas(emDisco);
                    setRemoteChannels(junto);
                    set({ channels: junto, carregou: true });
                }
            }
            // A lista de servidores desligados e o catálogo vêm juntos. A
            // lista de desligados ainda chega antes de a tela mostrar os
            // canais (para não aparecer canal que não abre), mas espera no
            // máximo 2,5 s: em rede ruim ela segurava a tela vazia por até 10 s.
            // Chegando depois disso, a lista é refiltrada quando ela vier.
            const desligados = atualizarFontesDesativadas();
            const aTempo = await Promise.race([
                desligados.then(() => true),
                new Promise<boolean>(resolve => setTimeout(() => resolve(false), 2_500)),
            ]);
            if (!aTempo) {
                void desligados.then(async (mudou) => {
                    if (!mudou) return;
                    const filtrados = await loadCachedChannels();
                    if (!filtrados) return;
                    const junto = comMinhas(filtrados);
                    setRemoteChannels(junto);
                    set({ channels: junto });
                }).catch(() => {});
            }
            // Há uma única lista: catálogo e reservas publicados no Git, sempre
            // rebuscados da rede para que canais e fontes novas apareçam na hora.
            const data = await loadRemoteChannels(force);
            data.forEach(ch => registerChannel(ch.id, ch.name, plutoIdDe(ch)));
            const junto = comMinhas(data);
            setRemoteChannels(junto);
            set({ channels: junto, isLoading: false, carregou: true });
        } catch (error) {
            console.error('Failed to fetch channels:', error);
            set({ isLoading: false, carregou: true });
        }
    },

    /*
     * Um servidor desligado no painel tem que sumir da tela sem fechar o
     * aplicativo: confere a cada dois minutos, mas a lista guardada vale uma
     * hora — só então o pedido ao monitor sai.
     * Também atualiza o catálogo quando o app volta ao primeiro plano.
     */
    vigiarFontesDesativadas: () => {
        const relogio = setInterval(() => {
            // Em segundo plano ninguém vê a lista: sem ir à rede à toa.
            if (AppState.currentState !== 'active') return;
            if (!useLinksStore.getState().linkCanais) return;
            void atualizarFontesDesativadas().then(async (mudou) => {
                if (!mudou) return;
                try {
                    const data = await loadCachedChannels();
                    if (!data) return;
                    const junto = comMinhas(data);
                    setRemoteChannels(junto);
                    set({ channels: junto });
                } catch (error) {
                    console.error('Failed to refilter channels:', error);
                }
            });
        }, FONTES_MS);
        const sub = AppState.addEventListener('change', (nextState) => {
            if (nextState === 'active') {
                void get().fetchChannels(true);
            }
        });
        return () => {
            clearInterval(relogio);
            sub.remove();
        };
    },

    getFilteredChannels: (includeAdult: boolean, favorites: string[]) => {
        const { selectedCategory, searchQuery, channels } = get();

        const base = includeAdult
            ? channels
            : channels.filter(ch => ch.category !== 'ADULTOS' && ch.category !== 'Adulto');
        const categoryOrder = Array.from(new Set(base.map(ch => ch.category)));
        let allChs = [...base].sort((a, b) => {
            const ai = categoryOrder.indexOf(a.category);
            const bi = categoryOrder.indexOf(b.category);
            if (ai !== bi) return ai - bi;
            const an = a.channelNumber ?? 99999;
            const bn = b.channelNumber ?? 99999;
            if (an !== bn) return an - bn;
            const ka = sortKey(a.name), kb = sortKey(b.name);
            return ka.localeCompare(kb);
        });

        // Filtro por categoria ou resolução
        if (selectedCategory === 'Favoritos') {
            allChs = allChs.filter(ch => favorites.includes(ch.id));
        } else if (['4K', 'FHD', 'HD', 'SD'].includes(selectedCategory as string)) {
            const res = selectedCategory as string;
            allChs = allChs.filter(ch => daResolucao(ch, res));
        } else if (selectedCategory !== 'Todos') {
            allChs = allChs.filter(ch => ch.category === selectedCategory);
        }

        // Filtro por busca
        if (searchQuery.trim()) {
            const query = searchQuery.toLowerCase().trim();
            allChs = allChs.filter(ch =>
                ch.name.toLowerCase().includes(query) ||
                ch.category.toLowerCase().includes(query)
            );
        }

        return allChs;
    },

    getCategories: (includeAdult: boolean) => {
        const { channels } = get();
        // Só as resoluções que têm algum canal: "4K" levando a uma lista vazia
        // era uma pílula para nada.
        const resolutions = ['4K', 'FHD', 'HD', 'SD'].filter(res => channels.some(ch => daResolucao(ch, res)));
        const categories = Array.from(new Set(channels.map(ch => ch.category)));
        const filtered = includeAdult
            ? categories
            : categories.filter(c => c !== 'ADULTOS' && c !== 'Adulto');
        return ['Todos', 'Favoritos', ...resolutions, ...filtered];
    },
}));

// Lista adicionada, atualizada, ativada ou removida: refaz os canais na hora.
aoMudarMinhasListas(() => {
    const { channels } = useChannelStore.getState();
    const junto = comMinhas(channels);
    setRemoteChannels(junto);
    useChannelStore.setState({ channels: junto });
});

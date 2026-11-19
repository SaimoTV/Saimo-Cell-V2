import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { armazenamentoDoPerfil } from '../services/perfis';

/**
 * Dados de cada perfil que vão além do histórico: o que já foi concluído (filmes
 * e episódios, inclusive marcados à mão), o tempo assistido, as buscas recentes
 * e os avisos de episódios novos das séries favoritas.
 */

export interface Concluido {
    /** Nome da obra (o da série, no caso de episódio). */
    t: string;
    s: boolean;
    T?: number;
    E?: number;
    /** Duração em segundos (0 quando marcado à mão). */
    d: number;
    q: number;
    m?: boolean;
}

export interface AvisoDeEpisodios { id: string; nome: string; novos: number; total: number; quando: number }

export interface Estatisticas {
    tempoTotal: number;
    filmes: number;
    episodios: number;
    series: number;
    ultimos30: number;
    maisVista: { titulo: string; episodios: number } | null;
}

export const chaveFilme = (id: string) => `f|${id}`;
export const chaveEpisodio = (serieId: string, temporada: number, episodio: number) => `s|${serieId}|${temporada}|${episodio}`;

interface ExtrasState {
    concluidos: Record<string, Concluido>;
    tempo: number;
    recentes: string[];
    vistos: Record<string, number>;
    avisos: AvisoDeEpisodios[];

    marcar: (chave: string, dados: Omit<Concluido, 'q'>) => void;
    desmarcar: (chave: string) => void;
    somarTempo: (segundos: number) => void;
    zerarEstatisticas: () => void;
    adicionarBusca: (texto: string) => void;
    limparBuscas: () => void;
    definirVistos: (vistos: Record<string, number>, avisos: AvisoDeEpisodios[]) => void;
    dispensarAviso: (id: string) => void;
}

export const useExtrasStore = create<ExtrasState>()(
    persist(
        (set, get) => ({
            concluidos: {},
            tempo: 0,
            recentes: [],
            vistos: {},
            avisos: [],

            marcar: (chave, dados) => {
                const atual = get().concluidos[chave];
                // O player marca sozinho ao passar de 90%: não sobrescreve o que já está marcado.
                if (atual && !dados.m) return;
                set({ concluidos: { ...get().concluidos, [chave]: { ...dados, q: Date.now() } } });
            },
            desmarcar: (chave) => {
                const { [chave]: _fora, ...resto } = get().concluidos;
                set({ concluidos: resto });
            },
            somarTempo: (segundos) => {
                if (!(segundos > 0) || segundos > 120) return;
                set({ tempo: get().tempo + segundos });
            },
            zerarEstatisticas: () => set({ concluidos: {}, tempo: 0 }),
            adicionarBusca: (texto) => {
                const t = texto.trim();
                if (t.length < 2) return;
                // "bla" -> "blac" -> "black": o começo de uma busca nova não fica no histórico.
                set({ recentes: [t, ...get().recentes.filter((x) => x !== t && !t.toLowerCase().startsWith(x.toLowerCase()))].slice(0, 8) });
            },
            limparBuscas: () => set({ recentes: [] }),
            definirVistos: (vistos, avisos) => set({ vistos, avisos: avisos.slice(0, 30) }),
            dispensarAviso: (id) => {
                const a = get().avisos.find((x) => x.id === id);
                set({
                    avisos: get().avisos.filter((x) => x.id !== id),
                    vistos: a ? { ...get().vistos, [id]: a.total } : get().vistos,
                });
            },
        }),
        {
            name: 'saimo-extras',
            storage: createJSONStorage(() => armazenamentoDoPerfil),
            partialize: (s) => ({ concluidos: s.concluidos, tempo: s.tempo, recentes: s.recentes, vistos: s.vistos, avisos: s.avisos }),
        },
    ),
);

export function calcularEstatisticas(concluidos: Record<string, Concluido>, tempo: number): Estatisticas {
    const lista = Object.values(concluidos);
    const eps = lista.filter((i) => i.s);
    const porSerie = new Map<string, number>();
    for (const e of eps) porSerie.set(e.t, (porSerie.get(e.t) || 0) + 1);
    const top = [...porSerie.entries()].sort((a, b) => b[1] - a[1])[0];
    const corte = Date.now() - 30 * 86400000;
    return {
        tempoTotal: tempo,
        filmes: lista.filter((i) => !i.s).length,
        episodios: eps.length,
        series: porSerie.size,
        ultimos30: lista.filter((i) => i.q >= corte).length,
        maisVista: top ? { titulo: top[0], episodios: top[1] } : null,
    };
}

export function duracaoLegivel(segundos: number): string {
    const min = Math.round(segundos / 60);
    if (min < 60) return `${min} min`;
    const h = Math.floor(min / 60);
    if (h < 24) return `${h} h ${String(min % 60).padStart(2, '0')} min`;
    return `${Math.floor(h / 24)} d ${h % 24} h`;
}

// ───── Aparência e legendas: do aparelho, não do perfil ─────

export type DestaqueId = 'padrao' | 'pordosol' | 'floresta' | 'rosa' | 'safira' | 'ouro';
export type FundoId = 'escuro' | 'amoled' | 'grafite';

export interface EstiloDeLegenda {
    tamanho: 'pequena' | 'media' | 'grande' | 'enorme';
    posicao: 'baixo' | 'alto' | 'topo';
    fundo: 'nenhum' | 'translucido';
}

interface AparenciaState {
    destaque: DestaqueId;
    fundo: FundoId;
    reduzirAnimacoes: boolean;
    /** Avisar (notificação do sistema) quando uma série favorita ganhar episódios. */
    notificarEpisodios: boolean;
    legenda: EstiloDeLegenda;
    setNotificarEpisodios: (v: boolean) => void;
    setDestaque: (d: DestaqueId) => void;
    setFundo: (f: FundoId) => void;
    setReduzirAnimacoes: (v: boolean) => void;
    setLegenda: (p: Partial<EstiloDeLegenda>) => void;
}

export const useAparenciaStore = create<AparenciaState>()(
    persist(
        (set, get) => ({
            destaque: 'padrao',
            fundo: 'escuro',
            reduzirAnimacoes: false,
            notificarEpisodios: false,
            legenda: { tamanho: 'media', posicao: 'baixo', fundo: 'translucido' },
            setDestaque: (destaque) => set({ destaque }),
            setFundo: (fundo) => set({ fundo }),
            setReduzirAnimacoes: (reduzirAnimacoes) => set({ reduzirAnimacoes }),
            setNotificarEpisodios: (notificarEpisodios) => set({ notificarEpisodios }),
            setLegenda: (p) => set({ legenda: { ...get().legenda, ...p } }),
        }),
        { name: 'saimo-aparencia', storage: createJSONStorage(() => AsyncStorage) },
    ),
);

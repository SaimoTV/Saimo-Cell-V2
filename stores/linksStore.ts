// Os dois endereços de lista (contrato "app sem listas"). Valem os de fábrica
// (utils/links.ts) até a pessoa trocar ou desligar em Ajustes > Listas. Desde a
// 2.8.0 o endereço de fábrica também é GRAVADO (na primeira leitura): o app
// segue com a mesma lista mesmo quando o padrão sair de uma versão futura.
// '' = lista desligada. Gravar o padrão não muda `linksEm` (não é uma escolha).
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Paths, Directory } from 'expo-file-system';
import { LINK_CANAIS_PADRAO, LINK_FILMES_PADRAO } from '../utils/links';

interface LinksState {
    /** Endereço-base da lista de canais, já normalizado ('' = sem endereço). */
    linkCanais: string;
    /** Endereço-base da lista de filmes e séries ('' = sem endereço). */
    linkFilmes: string;
    /** Quando os endereços foram escolhidos (ms; 0 = nunca mexeu). Na sincronia
     *  com a TV pelo Saimo Connect vale o mais recente. */
    linksEm: number;
    /** Os caches de listas das versões anteriores já foram apagados. */
    migrado: boolean;
    /** Lido do armazenamento (e migrado). Não é gravado. */
    pronto: boolean;
    setLinks: (canais: string, filmes: string, em?: number) => void;
}

/** Caches de listas gravados pelas versões que tinham catálogo embutido. */
async function apagarCachesAntigos(): Promise<void> {
    try {
        const chaves = await AsyncStorage.getAllKeys();
        const velhas = chaves.filter(k => k.startsWith('saimo-source-v'));
        if (velhas.length) await AsyncStorage.multiRemove(velhas);
    } catch { /* sem armazenamento: nada a apagar */ }
    for (const [base, nome] of [
        [Paths.cache, 'saimo-listas'],     // catálogo, filmes, rádios, fichas, destaques, guia.txt
        [Paths.document, 'epg_xmltv'],     // guia de programação baixado
        [Paths.document, 'sc'],            // catálogo de filmes por página (versões antigas)
    ] as const) {
        try {
            const pasta = new Directory(base, nome);
            if (pasta.exists) pasta.delete();
        } catch { /* ignora */ }
    }
}

let liberar: () => void = () => {};
const aguardar = new Promise<void>(resolve => { liberar = resolve; });

export const useLinksStore = create<LinksState>()(
    persist(
        (set) => ({
            linkCanais: LINK_CANAIS_PADRAO,
            linkFilmes: LINK_FILMES_PADRAO,
            linksEm: 0,
            migrado: false,
            pronto: false,
            setLinks: (canais, filmes, em) => set({ linkCanais: canais, linkFilmes: filmes, linksEm: em ?? Date.now() }),
        }),
        {
            name: 'saimo-links',
            storage: createJSONStorage(() => AsyncStorage),
            partialize: (s) => ({
                linkCanais: s.linkCanais,
                linkFilmes: s.linkFilmes,
                linksEm: s.linksEm,
                migrado: s.migrado,
            }),
            onRehydrateStorage: () => (state) => {
                void (async () => {
                    try {
                        if (!state?.migrado) {
                            await apagarCachesAntigos();
                            useLinksStore.setState({ migrado: true });
                        }
                    } finally {
                        useLinksStore.setState({ pronto: true });
                        liberar();
                    }
                })();
            },
        },
    ),
);

/** Resolve quando os endereços já foram lidos do armazenamento e a migração rodou. */
export function linksProntos(): Promise<void> {
    return useLinksStore.getState().pronto ? Promise.resolve() : aguardar;
}

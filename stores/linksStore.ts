// Os dois endereços de lista (contrato "app sem listas"). Valem os de fábrica
// (utils/links.ts) até a pessoa trocar ou desligar em Ajustes > Listas. Só o que
// difere do padrão é gravado: valor ausente = padrão; '' = lista desligada.
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
    /** Os caches de listas das versões anteriores já foram apagados. */
    migrado: boolean;
    /** Lido do armazenamento (e migrado). Não é gravado. */
    pronto: boolean;
    setLinks: (canais: string, filmes: string) => void;
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
            migrado: false,
            pronto: false,
            setLinks: (canais, filmes) => set({ linkCanais: canais, linkFilmes: filmes }),
        }),
        {
            name: 'saimo-links',
            storage: createJSONStorage(() => AsyncStorage),
            partialize: (s) => ({
                linkCanais: s.linkCanais === LINK_CANAIS_PADRAO ? undefined : s.linkCanais,
                linkFilmes: s.linkFilmes === LINK_FILMES_PADRAO ? undefined : s.linkFilmes,
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

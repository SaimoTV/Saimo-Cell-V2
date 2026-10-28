// Os endereços das listas NÃO estão no código: a pessoa os informa (primeira
// abertura ou Ajustes > Listas) e ficam em stores/linksStore.ts. Quem precisa
// de um endereço pergunta aqui, a cada uso.
import { linksProntos, useLinksStore } from '../stores/linksStore';

/** Falta o endereço da lista pedida: nenhum pedido de rede é feito. */
export class SemEnderecoError extends Error {
    constructor(public readonly lista: 'canais' | 'filmes') {
        super(lista === 'canais' ? 'Sem endereço da lista de canais' : 'Sem endereço da lista de filmes e séries');
        this.name = 'SemEnderecoError';
    }
}

/** Base da lista de canais ('' = sem endereço). Espera os endereços serem lidos. */
export async function baseCanais(): Promise<string> {
    await linksProntos();
    return useLinksStore.getState().linkCanais;
}

/** Base da lista de filmes e séries ('' = sem endereço). */
export async function baseFilmes(): Promise<string> {
    await linksProntos();
    return useLinksStore.getState().linkFilmes;
}

/** Versão que lança quando não há endereço. */
export async function exigirBaseCanais(): Promise<string> {
    const base = await baseCanais();
    if (!base) throw new SemEnderecoError('canais');
    return base;
}

export async function exigirBaseFilmes(): Promise<string> {
    const base = await baseFilmes();
    if (!base) throw new SemEnderecoError('filmes');
    return base;
}

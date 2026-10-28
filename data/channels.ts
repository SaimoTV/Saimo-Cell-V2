import type { Channel } from '../types';

// Nenhum canal vem embutido no app: a lista é a que o endereço informado em
// Ajustes > Listas serve (stores/channelStore.ts a entrega para cá).
let remoteChannels: Channel[] = [];

/** Mantém consumidores legados (guia, favoritos e player) na lista remota atual. */
export const setRemoteChannels = (next: Channel[]): void => {
    remoteChannels = next;
};

export const getAllChannels = (includeAdult: boolean): Channel[] => {
    return includeAdult
        ? remoteChannels
        : remoteChannels.filter(ch => ch.category.toLowerCase() !== 'adulto' && ch.category.toLowerCase() !== 'adultos');
};

export const getChannelsByCategory = (category: string, includeAdult: boolean): Channel[] => {
    const allChs = getAllChannels(includeAdult);
    if (category === 'Todos') return allChs;
    return allChs.filter(ch => ch.category === category);
};

export const getChannelById = (id: string): Channel | undefined => {
    return remoteChannels.find(ch => ch.id === id);
};

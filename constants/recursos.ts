import { Platform } from 'react-native';

/**
 * Endereços de catálogo do Saimo ("Informar endereços do Saimo" e as linhas Lista de canais /
 * Lista de filmes e séries em Ajustes). Na App Store o app só aceita as listas do próprio usuário
 * (M3U ou Xtream, em "Minhas listas"): nada de catálogo próprio embutido, que a revisão leria como
 * conteúdo fornecido pelo app. No Android continua como sempre foi.
 */
export const ENDERECOS_SAIMO = Platform.OS !== 'ios';

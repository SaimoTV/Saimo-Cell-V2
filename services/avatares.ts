/** Avatares dos perfis (SaimoPlayer/docs/avatares, gerados por scripts/avatares/gerar.py). */
// Ordem da grade de escolha; ids nunca são renomeados.
export const AVATARES = [
  'gato', 'cachorro', 'raposa', 'urso', 'panda', 'coelho', 'coruja', 'pinguim', 'sapo', 'leao', 'coala', 'robo', 'alien', 'monstro', 'dino', 'polvo', 'pintinho', 'tigre', 'astronauta', 'abelha', 'fantasma'
] as const;

export const IMAGEM_DO_AVATAR: Record<string, number> = {
  gato: require('../assets/avatares/gato.png'),
  cachorro: require('../assets/avatares/cachorro.png'),
  raposa: require('../assets/avatares/raposa.png'),
  urso: require('../assets/avatares/urso.png'),
  panda: require('../assets/avatares/panda.png'),
  coelho: require('../assets/avatares/coelho.png'),
  coruja: require('../assets/avatares/coruja.png'),
  pinguim: require('../assets/avatares/pinguim.png'),
  sapo: require('../assets/avatares/sapo.png'),
  leao: require('../assets/avatares/leao.png'),
  coala: require('../assets/avatares/coala.png'),
  robo: require('../assets/avatares/robo.png'),
  alien: require('../assets/avatares/alien.png'),
  monstro: require('../assets/avatares/monstro.png'),
  dino: require('../assets/avatares/dino.png'),
  polvo: require('../assets/avatares/polvo.png'),
  pintinho: require('../assets/avatares/pintinho.png'),
  tigre: require('../assets/avatares/tigre.png'),
  astronauta: require('../assets/avatares/astronauta.png'),
  abelha: require('../assets/avatares/abelha.png'),
  fantasma: require('../assets/avatares/fantasma.png'),
};

// Ajuste no react-native-video (roda no postinstall): o ExoPlayer dele não pede
// trava de CPU/Wi-Fi, e com a tela apagada o Android suspende o download dos
// segmentos — o som do Saimo Connect no celular parava em segundo plano.
// WAKE_MODE_NETWORK só segura as travas enquanto o player está tocando.
const fs = require('fs');
const path = require('path');

const arquivo = path.join(__dirname, '..', 'node_modules', 'react-native-video', 'android', 'src', 'main',
  'java', 'com', 'brentvatne', 'exoplayer', 'ReactExoplayerView.java');
if (!fs.existsSync(arquivo)) process.exit(0);
let fonte = fs.readFileSync(arquivo, 'utf8');
if (fonte.includes('setWakeMode(C.WAKE_MODE_NETWORK)')) process.exit(0);
const alvo = '                .setMediaSourceFactory(mediaSourceFactory)\n                .build();';
if (!fonte.includes(alvo)) {
  console.warn('[ajustar-rn-video] trecho do ExoPlayer.Builder não encontrado; ajuste não aplicado');
  process.exit(0);
}
fonte = fonte.replace(alvo,
  '                .setMediaSourceFactory(mediaSourceFactory)\n                .setWakeMode(C.WAKE_MODE_NETWORK)\n                .build();');
fs.writeFileSync(arquivo, fonte);
console.log('[ajustar-rn-video] WAKE_MODE_NETWORK aplicado');

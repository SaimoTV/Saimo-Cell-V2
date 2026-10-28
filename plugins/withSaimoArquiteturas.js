/**
 * Compila o código nativo só para ARM (arm64-v8a e armeabi-v7a).
 *
 * Celular de verdade é ARM; x86 e x86_64 só servem para emulador de PC.
 * Tirar os dois corta perto da metade do tempo do build de release e deixa
 * o APK menor. Os emuladores do Mac com Apple Silicon também são arm64.
 *
 * Fica em plugin porque android/ é gerada pelo Expo e o `expo prebuild
 * --clean` apagaria a mudança feita à mão em gradle.properties.
 */
const { withGradleProperties } = require('@expo/config-plugins');

const ARQUITETURAS = 'armeabi-v7a,arm64-v8a';

module.exports = function withSaimoArquiteturas(config) {
  return withGradleProperties(config, (mod) => {
    const props = mod.modResults.filter(
      (item) => !(item.type === 'property' && item.key === 'reactNativeArchitectures'),
    );
    props.push({ type: 'property', key: 'reactNativeArchitectures', value: ARQUITETURAS });
    mod.modResults = props;
    return mod;
  });
};

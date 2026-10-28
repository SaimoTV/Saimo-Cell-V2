/**
 * Assina o APK de release com a chave de sempre.
 *
 * A pasta android é gerada pelo Expo e não vai para o Git; antes esta
 * assinatura era escrita à mão lá dentro, e qualquer `expo prebuild --clean`
 * a apagava — e o APK sairia com outra chave, que o Android recusa instalar
 * por cima da versão que as pessoas já têm.
 *
 * A chave fica fora do repositório, em ../chaves/saimo-cell.jks. Sem ela
 * (outra máquina), o release cai na chave de depuração: compila, mas não serve
 * para publicar.
 */
const { withAppBuildGradle } = require('@expo/config-plugins');

const BLOCO = `
        // Chave do app publicado (ver plugins/withSaimoSigning.js).
        saimo {
            def guardada = file("$rootDir/../../chaves/saimo-cell.jks")
            storeFile guardada.exists() ? guardada : file('debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }`;

module.exports = function withSaimoSigning(config) {
  return withAppBuildGradle(config, (mod) => {
    let gradle = mod.modResults.contents;
    if (!gradle.includes('saimo-cell.jks')) {
      // Logo depois do bloco "debug" de signingConfigs.
      gradle = gradle.replace(
        /(signingConfigs\s*\{\s*debug\s*\{[^}]*\})/,
        `$1${BLOCO}`,
      );
    }
    // No release, a chave de sempre no lugar da de depuração.
    gradle = gradle.replace(
      /(release\s*\{[^}]*?)signingConfig signingConfigs\.debug/,
      '$1signingConfig signingConfigs.saimo',
    );
    mod.modResults.contents = gradle;
    return mod;
  });
};

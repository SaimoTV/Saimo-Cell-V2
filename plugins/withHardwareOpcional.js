const { withAndroidManifest } = require('@expo/config-plugins');
/**
 * Recursos de hardware que o app usa, mas não exige. A permissão
 * ACCESS_WIFI_STATE (do expo-network e do Google Play Services) faz a Play
 * supor `android.hardware.wifi` obrigatório e esconder o app de celulares,
 * tablets e computadores sem Wi-Fi. O app funciona por dados móveis ou cabo;
 * o Saimo Connect é que pede rede local.
 */
const OPCIONAIS = ['android.hardware.wifi', 'android.hardware.wifi.direct', 'android.hardware.touchscreen'];
module.exports = function withHardwareOpcional(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;
    const atuais = manifest['uses-feature'] ?? [];
    for (const nome of OPCIONAIS) {
      const existente = atuais.find((f) => f.$?.['android:name'] === nome);
      if (existente) existente.$['android:required'] = 'false';
      else atuais.push({ $: { 'android:name': nome, 'android:required': 'false' } });
    }
    manifest['uses-feature'] = atuais;
    return config;
  });
};

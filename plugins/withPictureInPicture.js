const { withAndroidManifest } = require('@expo/config-plugins');
/** Habilita PiP em todos os caminhos de reprodução Android (ao vivo, rádio e VOD). */
module.exports = function withPictureInPicture(config) {
  return withAndroidManifest(config, (config) => {
    const activities = config.modResults.manifest.application?.[0]?.activity ?? [];
    for (const activity of activities) {
      const name = activity.$?.['android:name'] ?? '';
      if (name.endsWith('.MainActivity') || name.endsWith('.PlayerActivity')) {
        activity.$['android:supportsPictureInPicture'] = 'true';
        activity.$['android:resizeableActivity'] = 'true';
        activity.$['android:configChanges'] =
          'keyboard|keyboardHidden|orientation|screenSize|screenLayout|uiMode|smallestScreenSize|layoutDirection|density';
      }
    }
    return config;
  });
};

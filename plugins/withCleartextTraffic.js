const { withAndroidManifest, AndroidConfig } = require('@expo/config-plugins');
const { mkdirSync, writeFileSync } = require('fs');
const { resolve } = require('path');

/**
 * Expo config plugin that ensures HTTP cleartext traffic is allowed on Android.
 * - Sets android:usesCleartextTraffic="true" on <application>
 * - Creates network_security_config.xml allowing cleartext for all domains
 * - References it in AndroidManifest.xml
 */
module.exports = function withCleartextTraffic(config) {
  return withAndroidManifest(config, async (config) => {
    const manifest = config.modResults.manifest;
    const mainApplication = manifest.application[0];

    // 1. Set usesCleartextTraffic
    mainApplication.$['android:usesCleartextTraffic'] = 'true';

    // 2. Set networkSecurityConfig reference
    mainApplication.$['android:networkSecurityConfig'] = '@xml/network_security_config';

    // 3. Create the network_security_config.xml file
    const resDir = resolve(
      config.modRequest.platformProjectRoot,
      'app/src/main/res/xml'
    );
    mkdirSync(resDir, { recursive: true });

    const networkSecurityConfig = `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
    <base-config cleartextTrafficPermitted="true">
        <trust-anchors>
            <certificates src="system" />
        </trust-anchors>
    </base-config>
</network-security-config>
`;
    writeFileSync(
      resolve(resDir, 'network_security_config.xml'),
      networkSecurityConfig,
      'utf-8'
    );

    return config;
  });
};

const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * This plugin removes react-native-cloudkit-storage from Android builds
 * since CloudKit is an iOS-only service.
 */
const withExcludeCloudKitAndroid = (config) => {
  return withDangerousMod(config, [
    'android',
    async (config) => {
      const settingsGradlePath = path.join(
        config.modRequest.platformProjectRoot,
        'settings.gradle'
      );

      if (fs.existsSync(settingsGradlePath)) {
        let settingsGradle = fs.readFileSync(settingsGradlePath, 'utf8');
        
        // Remove the cloudkit-storage include if it exists
        settingsGradle = settingsGradle.replace(
          /include\s*':react-native-cloudkit-storage'[\s\S]*?project\s*\(':react-native-cloudkit-storage'\)\.projectDir[\s\S]*?\n/g,
          ''
        );
        
        fs.writeFileSync(settingsGradlePath, settingsGradle);
      }

      return config;
    },
  ]);
};

module.exports = withExcludeCloudKitAndroid;

const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * This plugin removes react-native-pdf-thumbnail from Android builds
 * since PDF thumbnail generation is an iOS-only feature.
 * It modifies settings.gradle and app/build.gradle to exclude the library.
 */
const withExcludePdfThumbnailAndroid = (config) => {
  return withDangerousMod(config, [
    'android',
    async (config) => {
      const projectRoot = config.modRequest.platformProjectRoot;

      // 1. Remove from settings.gradle
      const settingsGradlePath = path.join(projectRoot, 'settings.gradle');
      if (fs.existsSync(settingsGradlePath)) {
        let settingsGradle = fs.readFileSync(settingsGradlePath, 'utf8');
        
        // Remove the pdf-thumbnail include and project dir entries
        settingsGradle = settingsGradle.replace(
          /include\s*':react-native-pdf-thumbnail'[\s\S]*?project\s*\(':react-native-pdf-thumbnail'\)\.projectDir[\s\S]*?\n/g,
          ''
        );
        // Also handle newer format
        settingsGradle = settingsGradle.replace(
          /.*react-native-pdf-thumbnail.*\n/g,
          ''
        );
        
        fs.writeFileSync(settingsGradlePath, settingsGradle);
        console.log('[withExcludePdfThumbnailAndroid] Removed pdf-thumbnail from settings.gradle');
      }

      // 2. Remove from app/build.gradle dependencies
      const buildGradlePath = path.join(projectRoot, 'app', 'build.gradle');
      if (fs.existsSync(buildGradlePath)) {
        let buildGradle = fs.readFileSync(buildGradlePath, 'utf8');
        
        buildGradle = buildGradle.replace(
          /.*react-native-pdf-thumbnail.*\n/g,
          ''
        );
        
        fs.writeFileSync(buildGradlePath, buildGradle);
        console.log('[withExcludePdfThumbnailAndroid] Removed pdf-thumbnail from build.gradle');
      }

      return config;
    },
  ]);
};

module.exports = withExcludePdfThumbnailAndroid;

const { withAndroidManifest } = require('@expo/config-plugins');

/**
 * Plugin to configure Android for full-screen tablet support
 */
const withAndroidFullScreen = (config) => {
  return withAndroidManifest(config, async (config) => {
    const mainActivity = config.modResults.manifest.application?.[0]?.activity?.find(
      (activity) => activity.$['android:name'] === '.MainActivity'
    );

    if (mainActivity) {
      // Remove resizeableActivity restriction if set to false
      if (mainActivity.$['android:resizeableActivity'] === 'false') {
        delete mainActivity.$['android:resizeableActivity'];
      }
      
      // Ensure the activity can resize properly
      mainActivity.$['android:resizeableActivity'] = 'true';
      
      // Allow multi-window support
      mainActivity.$['android:supportsPictureInPicture'] = 'false';
    }

    return config;
  });
};

module.exports = withAndroidFullScreen;

const { withEntitlementsPlist, withInfoPlist } = require('@expo/config-plugins');

const withICloudConfig = (config) => {
  // Add iCloud entitlements
  config = withEntitlementsPlist(config, (mod) => {
    mod.modResults['com.apple.developer.icloud-container-identifiers'] = [
      'iCloud.com.aufmassprofi.dach'
    ];
    mod.modResults['com.apple.developer.icloud-services'] = ['CloudKit'];
    mod.modResults['com.apple.developer.ubiquity-kvstore-identifier'] = 
      '$(TeamIdentifierPrefix)com.aufmassprofi.dach';
    return mod;
  });

  // Add background modes for CloudKit push notifications
  config = withInfoPlist(config, (mod) => {
    // Enable background fetch and remote notifications
    mod.modResults.UIBackgroundModes = mod.modResults.UIBackgroundModes || [];
    if (!mod.modResults.UIBackgroundModes.includes('remote-notification')) {
      mod.modResults.UIBackgroundModes.push('remote-notification');
    }
    if (!mod.modResults.UIBackgroundModes.includes('fetch')) {
      mod.modResults.UIBackgroundModes.push('fetch');
    }
    return mod;
  });

  return config;
};

module.exports = withICloudConfig;

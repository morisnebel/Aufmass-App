const { withGradleProperties } = require('@expo/config-plugins');

// Erhöht das SQLite-Limit von AsyncStorage auf Android.
// Standard sind nur 6 MB - beim Import von Projekten mit Fotos (base64)
// kommt es sonst zu "database or disk is full (code 13 SQLITE_FULL)".
const DB_SIZE_MB = '512';

module.exports = function withAsyncStorageDbSize(config) {
  return withGradleProperties(config, (cfg) => {
    cfg.modResults = cfg.modResults.filter(
      (item) => !(item.type === 'property' && item.key === 'AsyncStorage_db_size_in_MB')
    );
    cfg.modResults.push({
      type: 'property',
      key: 'AsyncStorage_db_size_in_MB',
      value: DB_SIZE_MB,
    });
    return cfg;
  });
};

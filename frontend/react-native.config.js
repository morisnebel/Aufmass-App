module.exports = {
  dependencies: {
    'react-native-cloudkit-storage': {
      platforms: {
        android: null, // Disable on Android - CloudKit is iOS only
      },
    },
  },
};

// Shim for Android - CloudKit is iOS only
export default {
  getItem: async () => null,
  setItem: async () => {},
  removeItem: async () => {},
  addListener: () => {},
  removeListener: () => {},
};

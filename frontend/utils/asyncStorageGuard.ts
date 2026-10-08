// Globaler Schutz gegen native iOS-Crashes in AsyncStorage:
// "-[NSNull length]: unrecognized selector" (SIGABRT) entsteht, wenn
// null/undefined als Wert an setItem/multiSet übergeben wird (z.B. durch
// CloudKit-Sync-Events oder Import-Daten mit null-Feldern).
// Dieser Guard fängt das zentral ab, bevor es die native Brücke erreicht.
import AsyncStorage from '@react-native-async-storage/async-storage';

const origSetItem = AsyncStorage.setItem.bind(AsyncStorage);
AsyncStorage.setItem = ((key: string, value: unknown, callback?: never) => {
  if (typeof value !== 'string') {
    if (value === null || value === undefined) {
      console.warn(`[AsyncStorageGuard] setItem('${key}') mit null/undefined ignoriert`);
      return Promise.resolve();
    }
    value = typeof value === 'object' ? JSON.stringify(value) : String(value);
  }
  return origSetItem(key, value as string, callback);
}) as typeof AsyncStorage.setItem;

const origMultiSet = AsyncStorage.multiSet.bind(AsyncStorage);
AsyncStorage.multiSet = ((pairs: [string, unknown][], callback?: never) => {
  const safe: [string, string][] = [];
  for (const [k, v] of pairs) {
    if (v === null || v === undefined) {
      console.warn(`[AsyncStorageGuard] multiSet('${k}') mit null/undefined ignoriert`);
      continue;
    }
    safe.push([k, typeof v === 'string' ? v : typeof v === 'object' ? JSON.stringify(v) : String(v)]);
  }
  return origMultiSet(safe, callback);
}) as typeof AsyncStorage.multiSet;

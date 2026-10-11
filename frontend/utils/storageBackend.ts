// ============================================================================
// Storage-Backend (WEB-Variante)
// ============================================================================
// Auf Web bleibt AsyncStorage (localStorage) aktiv – es werden nur die
// Schreib-Guards angewendet (null/undefined + ungültiges UTF-16).
// Die native Variante (iOS/Android) mit SQLite-Backend liegt in
// storageBackend.native.ts und wird von Metro automatisch bevorzugt.
// ============================================================================
import AsyncStorage from '@react-native-async-storage/async-storage';
import { toSafeValue, toWellFormedString } from './wellFormed';

const origSetItem = AsyncStorage.setItem.bind(AsyncStorage);
AsyncStorage.setItem = ((key: string, value: unknown, callback?: never) => {
  const safeValue = toSafeValue(value);
  if (safeValue === null) {
    console.warn(`[StorageBackend] setItem('${key}') mit null/undefined ignoriert`);
    return Promise.resolve();
  }
  return origSetItem(toWellFormedString(String(key)), safeValue, callback);
}) as typeof AsyncStorage.setItem;

const origMultiSet = AsyncStorage.multiSet.bind(AsyncStorage);
AsyncStorage.multiSet = ((pairs: [string, unknown][], callback?: never) => {
  const safe: [string, string][] = [];
  for (const pair of pairs || []) {
    if (!pair) continue;
    const [k, v] = pair;
    const safeValue = toSafeValue(v);
    if (safeValue === null) {
      console.warn(`[StorageBackend] multiSet('${k}') mit null/undefined ignoriert`);
      continue;
    }
    safe.push([toWellFormedString(String(k)), safeValue]);
  }
  if (safe.length === 0) return Promise.resolve();
  return origMultiSet(safe, callback);
}) as typeof AsyncStorage.multiSet;

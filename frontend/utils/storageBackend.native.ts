// ============================================================================
// SQLite-Storage-Backend (NATIVE Variante: iOS/Android)
// ============================================================================
// Dieses Modul MUSS als ERSTER Import in _layout.tsx laufen.
//
// Was es tut:
// 1) ALLE AsyncStorage-Aufrufe werden transparent auf eine echte
//    SQLite-Datenbank (expo-sqlite, WAL-Modus) umgeleitet:
//    - Keine 2MB/6MB-Limits wie bei Android-AsyncStorage
//    - Batch-Lesen (multiGet) per SQL "IN (...)" statt vieler Einzeldateien
//    - Transaktionen für multiSet → atomar und deutlich schneller
// 2) Einmalige, unterbrechungssichere Migration: Beim ersten Start werden
//    alle vorhandenen AsyncStorage-Daten Schlüssel für Schlüssel (speicher-
//    schonend!) nach SQLite kopiert und danach aus AsyncStorage entfernt.
//    Schlägt ein Schlüssel fehl, bleibt er in AsyncStorage erhalten und die
//    Migration wird beim nächsten Start erneut versucht.
// 3) Schutz gegen native iOS-Crashes (ehem. asyncStorageGuard):
//    - null/undefined-Werte werden ignoriert (NSNull-Crash)
//    - Strings mit ungültigem UTF-16 (einsame Surrogate) werden VOR der
//      nativen Brücke repariert (-> U+FFFD).
// ============================================================================
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SQLite from 'expo-sqlite';
import { toSafeValue, toWellFormedString } from './wellFormed';

const MIGRATION_FLAG = '__aufmass_sqlite_migrated__';
const SQL_CHUNK = 400; // SQLite-Parameterlimit sicher unterschreiten

// Original-Methoden sichern (werden für die Migration benötigt)
const orig = {
  getItem: AsyncStorage.getItem.bind(AsyncStorage),
  removeItem: AsyncStorage.removeItem.bind(AsyncStorage),
  getAllKeys: AsyncStorage.getAllKeys.bind(AsyncStorage),
};

let readyPromise: Promise<SQLite.SQLiteDatabase> | null = null;

const init = async (): Promise<SQLite.SQLiteDatabase> => {
  const db = await SQLite.openDatabaseAsync('aufmassprofi_kv.db');
  await db.execAsync(
    `PRAGMA journal_mode = WAL;
     CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);`
  );

  // ---------------- Einmalige Migration AsyncStorage -> SQLite -------------
  const flag = await db.getFirstAsync<{ value: string }>(
    'SELECT value FROM kv WHERE key = ?',
    MIGRATION_FLAG
  );
  if (!flag) {
    try {
      const keys = await orig.getAllKeys();
      if (keys.length > 0) {
        console.log(`[SQLiteStorage] Migration gestartet: ${keys.length} Schlüssel`);
      }
      let migrated = 0;
      let failed = 0;
      for (const key of keys) {
        try {
          // Schlüssel für Schlüssel: speicherschonend auch bei GB an Daten
          const value = await orig.getItem(key);
          if (typeof value === 'string') {
            await db.runAsync(
              'INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)',
              key,
              toWellFormedString(value)
            );
          }
          // Erst NACH erfolgreichem Kopieren aus AsyncStorage entfernen
          await orig.removeItem(key);
          migrated++;
          if (migrated % 100 === 0) {
            console.log(`[SQLiteStorage] Migration: ${migrated}/${keys.length}`);
          }
        } catch (e) {
          failed++;
          console.warn(`[SQLiteStorage] Schlüssel '${key}' nicht migriert:`, e);
        }
      }
      if (failed === 0) {
        await db.runAsync(
          'INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)',
          MIGRATION_FLAG,
          new Date().toISOString()
        );
        console.log(`[SQLiteStorage] Migration abgeschlossen: ${migrated} Schlüssel`);
      } else {
        // Flag NICHT setzen -> fehlgeschlagene Schlüssel werden beim
        // nächsten Start erneut versucht (bereits migrierte sind weg)
        console.warn(`[SQLiteStorage] Migration unvollständig: ${failed} Fehler, erneuter Versuch beim nächsten Start`);
      }
    } catch (e) {
      console.error('[SQLiteStorage] Migration fehlgeschlagen:', e);
    }
  }
  return db;
};

const ready = (): Promise<SQLite.SQLiteDatabase> => {
  if (!readyPromise) readyPromise = init();
  return readyPromise;
};

// --------------------------- Gepatchte API ----------------------------------
AsyncStorage.getItem = (async (key: string) => {
  const db = await ready();
  const row = await db.getFirstAsync<{ value: string }>(
    'SELECT value FROM kv WHERE key = ?',
    String(key)
  );
  return row ? row.value : null;
}) as typeof AsyncStorage.getItem;

AsyncStorage.setItem = (async (key: string, value: unknown) => {
  const safeValue = toSafeValue(value);
  if (safeValue === null) {
    console.warn(`[StorageBackend] setItem('${key}') mit null/undefined ignoriert`);
    return;
  }
  const db = await ready();
  await db.runAsync(
    'INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)',
    toWellFormedString(String(key)),
    safeValue
  );
}) as typeof AsyncStorage.setItem;

AsyncStorage.removeItem = (async (key: string) => {
  const db = await ready();
  await db.runAsync('DELETE FROM kv WHERE key = ?', String(key));
}) as typeof AsyncStorage.removeItem;

AsyncStorage.multiGet = (async (keys: readonly string[]) => {
  const db = await ready();
  const map = new Map<string, string>();
  for (let i = 0; i < keys.length; i += SQL_CHUNK) {
    const chunk = keys.slice(i, i + SQL_CHUNK).map(String);
    if (chunk.length === 0) continue;
    const placeholders = chunk.map(() => '?').join(',');
    const rows = await db.getAllAsync<{ key: string; value: string }>(
      `SELECT key, value FROM kv WHERE key IN (${placeholders})`,
      ...chunk
    );
    for (const r of rows) map.set(r.key, r.value);
  }
  return keys.map((k) => [k, map.has(String(k)) ? map.get(String(k))! : null]) as [
    string,
    string | null,
  ][];
}) as typeof AsyncStorage.multiGet;

AsyncStorage.multiSet = (async (pairs: [string, unknown][]) => {
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
  if (safe.length === 0) return;
  const db = await ready();
  // Atomar in einer Transaktion -> schnell und konsistent
  await db.withTransactionAsync(async () => {
    for (const [k, v] of safe) {
      await db.runAsync('INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)', k, v);
    }
  });
}) as typeof AsyncStorage.multiSet;

AsyncStorage.multiRemove = (async (keys: readonly string[]) => {
  const db = await ready();
  for (let i = 0; i < keys.length; i += SQL_CHUNK) {
    const chunk = keys.slice(i, i + SQL_CHUNK).map(String);
    if (chunk.length === 0) continue;
    const placeholders = chunk.map(() => '?').join(',');
    await db.runAsync(`DELETE FROM kv WHERE key IN (${placeholders})`, ...chunk);
  }
}) as typeof AsyncStorage.multiRemove;

AsyncStorage.getAllKeys = (async () => {
  const db = await ready();
  const rows = await db.getAllAsync<{ key: string }>('SELECT key FROM kv');
  return rows.map((r) => r.key).filter((k) => k !== MIGRATION_FLAG);
}) as typeof AsyncStorage.getAllKeys;

AsyncStorage.clear = (async () => {
  const db = await ready();
  // Migrations-Flag behalten, sonst würde eine leere Migration erneut laufen
  await db.runAsync('DELETE FROM kv WHERE key != ?', MIGRATION_FLAG);
}) as typeof AsyncStorage.clear;

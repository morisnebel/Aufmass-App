/**
 * BackupService
 * Vollständige Datensicherung + Wiederherstellung aller App-Daten.
 * 
 * Option A: Manuelles Export/Import als JSON-Datei (Google Drive, iCloud, etc.)
 * Option B: Automatische Snapshots in AsyncStorage (letzte 5 App-Starts)
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import { File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';

// Alle Storage-Keys der App (siehe LocalStorage.ts)
const STORAGE_KEYS = [
  'aufmassprofi_customers',
  'aufmassprofi_projects',
  'aufmassprofi_sketches',
  'aufmassprofi_photos',
  'aufmassprofi_roofs',
  'aufmassprofi_checklists',
  'aufmassprofi_checklist_templates',
  'aufmassprofi_settings',
  'aufmassprofi_documents',
  'aufmassprofi_area_calculations',
  'aufmassprofi_line_categories',
  'aufmassprofi_text_shortcuts',
  'aufmassprofi_reports',
  'aufmassprofi_employees_master',
  'aufmassprofi_materials_master',
  'aufmassprofi_machines_master',
  'aufmassprofi_machine_categories',
  'aufmassprofi_material_categories',
  'aufmassprofi_material_locations',
  'aufmassprofi_material_suppliers',
];

const AUTO_BACKUP_KEY = 'aufmassprofi_auto_backups'; // ALT: monolithischer Blob (OOM-Quelle, wird nur noch gelöscht)
const AUTO_BACKUP_INDEX_KEY = 'aufmassprofi_auto_backups_index';
const MAX_AUTO_BACKUPS = 3;
const snapDataKey = (id: string, storageKey: string) => `aufmassprofi_snap_${id}_${storageKey}`;

export interface BackupPayload {
  type: 'aufmassprofi-full-backup';
  version: 1;
  created_at: string;
  app_version?: string;
  data: Record<string, any>;
}

export interface AutoBackupSnapshot {
  id: string;
  created_at: string;
  size_bytes: number;
  counts: {
    projects: number;
    customers: number;
    sketches: number;
    photos: number;
    reports: number;
  };
  // Welche Storage-Keys dieser Snapshot enthält (für Restore/Löschen)
  keys?: string[];
  // Veraltet (alte Snapshots): kompletter Daten-Blob – wird nicht mehr verwendet
  data_json?: string;
}

// ============ Helpers ============
const genId = () => `bak_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

// Zählt Vorkommen eines Substrings ohne JSON.parse (speicherschonend bei großen Strings)
const countOccurrences = (raw: string, needle: string): number => {
  let c = 0;
  let i = 0;
  while ((i = raw.indexOf(needle, i)) !== -1) { c++; i += needle.length; }
  return c;
};

const restoreFromPayload = async (payload: BackupPayload, mode: 'replace' | 'merge' = 'replace'): Promise<void> => {
  if (payload.type !== 'aufmassprofi-full-backup') {
    throw new Error('Ungültige Backup-Datei (falscher Typ).');
  }
  if (!payload.data || typeof payload.data !== 'object') {
    throw new Error('Ungültige Backup-Datei (keine Daten).');
  }
  const keys = Object.keys(payload.data);
  for (const key of keys) {
    if (!STORAGE_KEYS.includes(key)) continue; // Nur bekannte Keys zulassen
    try {
      const value = payload.data[key];
      if (mode === 'replace') {
        await AsyncStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
      } else {
        // Merge: bestehende Array-Daten zusammenführen
        const existingRaw = await AsyncStorage.getItem(key);
        let existing: any = null;
        if (existingRaw) {
          try { existing = JSON.parse(existingRaw); } catch { existing = null; }
        }
        if (Array.isArray(existing) && Array.isArray(value)) {
          const existingIds = new Set(existing.map((e: any) => e.id));
          const merged = [...existing, ...value.filter((v: any) => !existingIds.has(v.id))];
          await AsyncStorage.setItem(key, JSON.stringify(merged));
        } else {
          await AsyncStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
        }
      }
    } catch (e) {
      console.warn('[Restore] Failed for key', key, e);
    }
  }
};

const countItems = (data: Record<string, any>) => {
  const cnt = (key: string) => Array.isArray(data[key]) ? data[key].length : 0;
  let photoCount = 0;
  const photoMap = data['aufmassprofi_photos'];
  if (photoMap && typeof photoMap === 'object') {
    Object.values(photoMap).forEach((arr: any) => { if (Array.isArray(arr)) photoCount += arr.length; });
  }
  return {
    projects: cnt('aufmassprofi_projects'),
    customers: cnt('aufmassprofi_customers'),
    sketches: cnt('aufmassprofi_sketches'),
    photos: photoCount,
    reports: cnt('aufmassprofi_reports'),
  };
};

// ============ OPTION A: Manuelles Export/Import ============
export const BackupService = {
  /**
   * Erstellt eine Backup-Datei und öffnet den iOS Share-Dialog.
   * Nutzer kann dann z.B. in Google Drive, iCloud Drive, WhatsApp etc. speichern.
   */
  exportFullBackup: async (): Promise<{ uri: string; sizeBytes: number }> => {
    // Speicherschonend: Backup wird in Chunks direkt in die Datei gestreamt.
    // Es wird NIE ein einziger riesiger JSON-String gebaut oder an das native
    // Modul übergeben (verhindert Hermes-/Native-OOM-Crashes bei großen Daten).
    const date = new Date().toISOString().slice(0, 10);
    const filename = `Aufmassprofi_Backup_${date}.json`;
    const header = `{"type":"aufmassprofi-full-backup","version":1,"created_at":${JSON.stringify(new Date().toISOString())},"data":{`;

    const rawValueFor = async (key: string): Promise<string | null> => {
      const raw = await AsyncStorage.getItem(key);
      if (raw == null) return null;
      const first = raw.trimStart().charAt(0);
      return (first === '{' || first === '[' || first === '"') ? raw : JSON.stringify(raw);
    };

    let fileUri: string;
    let sizeBytes = 0;

    if (Platform.OS === 'web') {
      // Web-Preview: einfacher Pfad (Datenmengen dort klein)
      const parts: string[] = [];
      for (const key of STORAGE_KEYS) {
        try {
          const valueJson = await rawValueFor(key);
          if (valueJson != null) parts.push(`${JSON.stringify(key)}:${valueJson}`);
        } catch (e) { console.warn('[Backup] Skipping key', key, e); }
      }
      const json = `${header}${parts.join(',')}}}`;
      sizeBytes = json.length;
      const dir = (FileSystem as any).cacheDirectory || (FileSystem as any).documentDirectory;
      fileUri = `${dir}${filename}`;
      await FileSystem.writeAsStringAsync(fileUri, json, { encoding: 'utf8' as any });
    } else {
      // Nativ: gestreamtes Schreiben in max. 512-KB-Chunks
      const file = new File(Paths.cache, filename);
      try { if (file.exists) file.delete(); } catch {}
      file.create();
      const handle = file.open();
      const encoder = new TextEncoder();
      const CHUNK = 512 * 1024;
      const writeStr = (s: string) => {
        for (let i = 0; i < s.length; i += CHUNK) {
          const bytes = encoder.encode(s.slice(i, i + CHUNK));
          handle.writeBytes(bytes);
          sizeBytes += bytes.length;
        }
      };
      try {
        writeStr(header);
        let firstEntry = true;
        for (const key of STORAGE_KEYS) {
          try {
            const valueJson = await rawValueFor(key);
            if (valueJson == null) continue;
            writeStr(`${firstEntry ? '' : ','}${JSON.stringify(key)}:`);
            writeStr(valueJson);
            firstEntry = false;
          } catch (e) { console.warn('[Backup] Skipping key', key, e); }
        }
        writeStr('}}');
      } finally {
        handle.close();
      }
      fileUri = file.uri;
    }

    const canShare = await Sharing.isAvailableAsync();
    if (canShare) {
      await Sharing.shareAsync(fileUri, {
        mimeType: 'application/json',
        dialogTitle: 'Aufmaßprofi-Backup speichern',
        UTI: 'public.json',
      });
    }
    // Zeitstempel des letzten Datei-Backups merken (für Erinnerungsbanner)
    try {
      await AsyncStorage.setItem('aufmassprofi_last_file_backup', new Date().toISOString());
    } catch {}
    return { uri: fileUri, sizeBytes };
  },

  /**
   * Zeitstempel des letzten manuellen Datei-Backups holen.
   */
  getLastFileBackup: async (): Promise<string | null> => {
    try {
      return await AsyncStorage.getItem('aufmassprofi_last_file_backup');
    } catch {
      return null;
    }
  },

  /**
   * Prüft, ob laut Intervall ein Backup fällig ist.
   * @param intervalDays 0 = deaktiviert
   */
  isBackupDue: async (intervalDays: number): Promise<{ due: boolean; daysSince: number | null }> => {
    if (!intervalDays || intervalDays <= 0) return { due: false, daysSince: null };
    const last = await BackupService.getLastFileBackup();
    if (!last) return { due: true, daysSince: null };
    const days = Math.floor((Date.now() - new Date(last).getTime()) / (1000 * 60 * 60 * 24));
    return { due: days >= intervalDays, daysSince: days };
  },

  /**
   * Öffnet den iOS Datei-Picker (Google Drive, iCloud, lokal etc.),
   * lädt die JSON-Datei und stellt die Daten wieder her.
   */
  importFullBackup: async (mode: 'replace' | 'merge' = 'replace'): Promise<{ counts: any; created_at: string }> => {
    const res = await DocumentPicker.getDocumentAsync({
      type: '*/*',
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (res.canceled || !res.assets || res.assets.length === 0) {
      throw new Error('Kein Backup ausgewählt.');
    }
    const fileUri = res.assets[0].uri;
    const content = await FileSystem.readAsStringAsync(fileUri, { encoding: 'utf8' as any });
    let payload: BackupPayload;
    try {
      payload = JSON.parse(content);
    } catch {
      throw new Error('Backup-Datei ist kein gültiges JSON.');
    }
    if (payload.type !== 'aufmassprofi-full-backup') {
      throw new Error('Diese Datei ist kein Aufmaßprofi-Backup.');
    }
    await restoreFromPayload(payload, mode);
    return { counts: countItems(payload.data), created_at: payload.created_at };
  },

  // ============ OPTION B: Auto-Snapshots in AsyncStorage ============
  /**
   * Erstellt automatisch einen Snapshot (rollierend, max. 3).
   * Speicherschonend: Roh-Strings werden pro Storage-Key 1:1 kopiert –
   * KEIN JSON.stringify großer Datenmengen (verhindert Hermes-OOM-Crash).
   */
  createAutoSnapshot: async (): Promise<void> => {
    try {
      // Alte monolithische Snapshots (OOM-Quelle) ohne Parse entsorgen
      await AsyncStorage.removeItem(AUTO_BACKUP_KEY).catch(() => {});

      const id = genId();
      const savedKeys: string[] = [];
      let sizeBytes = 0;
      const counts = { projects: 0, customers: 0, sketches: 0, photos: 0, reports: 0 };

      for (const key of STORAGE_KEYS) {
        try {
          const raw = await AsyncStorage.getItem(key);
          if (raw == null) continue;
          await AsyncStorage.setItem(snapDataKey(id, key), raw);
          savedKeys.push(key);
          sizeBytes += raw.length;
          // Leichte Zählung ohne teures Parsen großer Strings
          if (key === 'aufmassprofi_projects' || key === 'aufmassprofi_customers') {
            try {
              const v = JSON.parse(raw);
              if (key === 'aufmassprofi_projects') counts.projects = Array.isArray(v) ? v.length : 0;
              else counts.customers = Array.isArray(v) ? v.length : 0;
            } catch {}
          } else if (key === 'aufmassprofi_sketches') {
            counts.sketches = countOccurrences(raw, '"project_id"');
          } else if (key === 'aufmassprofi_photos') {
            counts.photos = countOccurrences(raw, '"project_id"');
          } else if (key === 'aufmassprofi_reports') {
            counts.reports = countOccurrences(raw, '"report_number"');
          }
        } catch (e) {
          console.warn('[AutoBackup] Skipping key', key, e);
        }
      }

      const rawIdx = await AsyncStorage.getItem(AUTO_BACKUP_INDEX_KEY);
      const index: AutoBackupSnapshot[] = rawIdx ? JSON.parse(rawIdx) : [];
      const entry: AutoBackupSnapshot = {
        id,
        created_at: new Date().toISOString(),
        size_bytes: sizeBytes,
        counts,
        keys: savedKeys,
      };
      const updated = [entry, ...index];
      const keep = updated.slice(0, MAX_AUTO_BACKUPS);
      const drop = updated.slice(MAX_AUTO_BACKUPS);
      // Überzählige Snapshots samt Datenkopien löschen
      for (const d of drop) {
        for (const k of (d.keys || STORAGE_KEYS)) {
          AsyncStorage.removeItem(snapDataKey(d.id, k)).catch(() => {});
        }
      }
      await AsyncStorage.setItem(AUTO_BACKUP_INDEX_KEY, JSON.stringify(keep));
    } catch (e) {
      console.warn('[AutoBackup] Failed to create snapshot:', e);
    }
  },

  /**
   * Bedingter Auto-Snapshot: Nur wenn seit letztem >= minHoursSince Stunden.
   * Verhindert zu viele Snapshots bei häufigem App-Start.
   */
  createAutoSnapshotIfNeeded: async (minHoursSince = 24): Promise<boolean> => {
    try {
      const rawIdx = await AsyncStorage.getItem(AUTO_BACKUP_INDEX_KEY);
      const index: AutoBackupSnapshot[] = rawIdx ? JSON.parse(rawIdx) : [];
      if (index.length > 0) {
        const last = new Date(index[0].created_at).getTime();
        const hours = (Date.now() - last) / (1000 * 60 * 60);
        if (hours < minHoursSince) return false;
      }
      await BackupService.createAutoSnapshot();
      return true;
    } catch {
      return false;
    }
  },

  /**
   * Listet alle vorhandenen Auto-Snapshots (nur Metadaten).
   */
  listAutoSnapshots: async (): Promise<Omit<AutoBackupSnapshot, 'data_json'>[]> => {
    try {
      const rawIdx = await AsyncStorage.getItem(AUTO_BACKUP_INDEX_KEY);
      const index: AutoBackupSnapshot[] = rawIdx ? JSON.parse(rawIdx) : [];
      return index.map(s => ({
        id: s.id,
        created_at: s.created_at,
        size_bytes: s.size_bytes,
        counts: s.counts,
        keys: s.keys,
      }));
    } catch {
      return [];
    }
  },

  /**
   * Stellt einen Auto-Snapshot wieder her (überschreibt bestehende Daten!).
   * Kopiert Roh-Strings 1:1 zurück – kein Parse/Stringify großer Daten.
   */
  restoreAutoSnapshot: async (snapshotId: string): Promise<{ counts: any }> => {
    const rawIdx = await AsyncStorage.getItem(AUTO_BACKUP_INDEX_KEY);
    const index: AutoBackupSnapshot[] = rawIdx ? JSON.parse(rawIdx) : [];
    const snap = index.find(s => s.id === snapshotId);
    if (!snap) throw new Error('Snapshot nicht gefunden.');
    for (const key of (snap.keys || [])) {
      if (!STORAGE_KEYS.includes(key)) continue;
      try {
        const raw = await AsyncStorage.getItem(snapDataKey(snap.id, key));
        if (raw != null) await AsyncStorage.setItem(key, raw);
      } catch (e) {
        console.warn('[AutoBackup] Restore failed for key', key, e);
      }
    }
    return { counts: snap.counts };
  },

  /**
   * Löscht einen einzelnen Auto-Snapshot.
   */
  deleteAutoSnapshot: async (snapshotId: string): Promise<void> => {
    const rawIdx = await AsyncStorage.getItem(AUTO_BACKUP_INDEX_KEY);
    const index: AutoBackupSnapshot[] = rawIdx ? JSON.parse(rawIdx) : [];
    const snap = index.find(s => s.id === snapshotId);
    if (snap) {
      for (const k of (snap.keys || STORAGE_KEYS)) {
        AsyncStorage.removeItem(snapDataKey(snap.id, k)).catch(() => {});
      }
    }
    const filtered = index.filter(s => s.id !== snapshotId);
    await AsyncStorage.setItem(AUTO_BACKUP_INDEX_KEY, JSON.stringify(filtered));
  },

  /**
   * Löscht alle Auto-Snapshots (inkl. Alt-Format).
   */
  clearAllAutoSnapshots: async (): Promise<void> => {
    try {
      const rawIdx = await AsyncStorage.getItem(AUTO_BACKUP_INDEX_KEY);
      const index: AutoBackupSnapshot[] = rawIdx ? JSON.parse(rawIdx) : [];
      for (const s of index) {
        for (const k of (s.keys || STORAGE_KEYS)) {
          AsyncStorage.removeItem(snapDataKey(s.id, k)).catch(() => {});
        }
      }
    } catch {}
    await AsyncStorage.removeItem(AUTO_BACKUP_INDEX_KEY);
    await AsyncStorage.removeItem(AUTO_BACKUP_KEY);
  },
};

export default BackupService;

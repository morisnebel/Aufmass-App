/**
 * BackupService
 * Vollständige Datensicherung + Wiederherstellung aller App-Daten.
 * 
 * Option A: Manuelles Export/Import als JSON-Datei (Google Drive, iCloud, etc.)
 * Option B: Automatische Snapshots in AsyncStorage (letzte 5 App-Starts)
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
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

const AUTO_BACKUP_KEY = 'aufmassprofi_auto_backups';
const MAX_AUTO_BACKUPS = 5;

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
  // Kompakte Daten in einem JSON-String zur Speicheroptimierung
  data_json: string;
}

// ============ Helpers ============
const genId = () => `bak_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

const buildBackupPayload = async (): Promise<BackupPayload> => {
  const data: Record<string, any> = {};
  for (const key of STORAGE_KEYS) {
    try {
      const raw = await AsyncStorage.getItem(key);
      if (raw != null) {
        try { data[key] = JSON.parse(raw); }
        catch { data[key] = raw; }
      }
    } catch (e) {
      console.warn('[Backup] Skipping key', key, e);
    }
  }
  return {
    type: 'aufmassprofi-full-backup',
    version: 1,
    created_at: new Date().toISOString(),
    data,
  };
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
    const payload = await buildBackupPayload();
    const json = JSON.stringify(payload);
    const sizeBytes = new Blob([json]).size;
    const date = new Date().toISOString().slice(0, 10);
    const filename = `Aufmassprofi_Backup_${date}.json`;
    const dir = (FileSystem as any).cacheDirectory || (FileSystem as any).documentDirectory;
    const fileUri = `${dir}${filename}`;
    await FileSystem.writeAsStringAsync(fileUri, json, { encoding: 'utf8' as any });
    const canShare = await Sharing.isAvailableAsync();
    if (canShare) {
      await Sharing.shareAsync(fileUri, {
        mimeType: 'application/json',
        dialogTitle: 'Aufmaßprofi-Backup speichern',
        UTI: 'public.json',
      });
    }
    return { uri: fileUri, sizeBytes };
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
   * Erstellt automatisch einen Snapshot. Rollende max. 5 Snapshots.
   * Wird beim App-Start aufgerufen (z.B. einmal alle 24h).
   */
  createAutoSnapshot: async (): Promise<void> => {
    try {
      const payload = await buildBackupPayload();
      const dataJson = JSON.stringify(payload.data);
      const sizeBytes = new Blob([dataJson]).size;
      const snapshot: AutoBackupSnapshot = {
        id: genId(),
        created_at: new Date().toISOString(),
        size_bytes: sizeBytes,
        counts: countItems(payload.data),
        data_json: dataJson,
      };
      const raw = await AsyncStorage.getItem(AUTO_BACKUP_KEY);
      const existing: AutoBackupSnapshot[] = raw ? JSON.parse(raw) : [];
      // Neueste zuerst, älteste rausschmeißen
      const updated = [snapshot, ...existing].slice(0, MAX_AUTO_BACKUPS);
      await AsyncStorage.setItem(AUTO_BACKUP_KEY, JSON.stringify(updated));
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
      const raw = await AsyncStorage.getItem(AUTO_BACKUP_KEY);
      const existing: AutoBackupSnapshot[] = raw ? JSON.parse(raw) : [];
      if (existing.length > 0) {
        const last = new Date(existing[0].created_at).getTime();
        const now = Date.now();
        const hours = (now - last) / (1000 * 60 * 60);
        if (hours < minHoursSince) return false;
      }
      await BackupService.createAutoSnapshot();
      return true;
    } catch {
      return false;
    }
  },

  /**
   * Listet alle vorhandenen Auto-Snapshots (ohne data_json für Performance).
   */
  listAutoSnapshots: async (): Promise<Omit<AutoBackupSnapshot, 'data_json'>[]> => {
    try {
      const raw = await AsyncStorage.getItem(AUTO_BACKUP_KEY);
      const existing: AutoBackupSnapshot[] = raw ? JSON.parse(raw) : [];
      return existing.map(s => ({
        id: s.id,
        created_at: s.created_at,
        size_bytes: s.size_bytes,
        counts: s.counts,
      }));
    } catch {
      return [];
    }
  },

  /**
   * Stellt einen Auto-Snapshot wieder her (Datenverlust bei bestehenden Werten!).
   */
  restoreAutoSnapshot: async (snapshotId: string): Promise<{ counts: any }> => {
    const raw = await AsyncStorage.getItem(AUTO_BACKUP_KEY);
    const existing: AutoBackupSnapshot[] = raw ? JSON.parse(raw) : [];
    const snap = existing.find(s => s.id === snapshotId);
    if (!snap) throw new Error('Snapshot nicht gefunden.');
    const data = JSON.parse(snap.data_json);
    const payload: BackupPayload = {
      type: 'aufmassprofi-full-backup',
      version: 1,
      created_at: snap.created_at,
      data,
    };
    await restoreFromPayload(payload, 'replace');
    return { counts: snap.counts };
  },

  /**
   * Löscht einen einzelnen Auto-Snapshot.
   */
  deleteAutoSnapshot: async (snapshotId: string): Promise<void> => {
    const raw = await AsyncStorage.getItem(AUTO_BACKUP_KEY);
    const existing: AutoBackupSnapshot[] = raw ? JSON.parse(raw) : [];
    const filtered = existing.filter(s => s.id !== snapshotId);
    await AsyncStorage.setItem(AUTO_BACKUP_KEY, JSON.stringify(filtered));
  },

  /**
   * Löscht alle Auto-Snapshots.
   */
  clearAllAutoSnapshots: async (): Promise<void> => {
    await AsyncStorage.removeItem(AUTO_BACKUP_KEY);
  },
};

export default BackupService;

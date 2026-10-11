/**
 * ArchiveLog – leichte Liste archivierter Projekte (nur Metadaten, keine Daten).
 * Wird beim Archivieren gepflegt, damit der Überblick erhalten bleibt.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'aufmassprofi_archive_log';

export interface ArchiveEntry {
  key: string;            // eindeutige Log-ID
  name: string;           // Projektname
  project_number?: string;
  archived_at: string;    // ISO-Datum
  fileName: string;       // Name der Archiv-Datei
}

export const getArchiveLog = async (): Promise<ArchiveEntry[]> => {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
};

export const addArchiveEntries = async (
  entries: { name: string; project_number?: string; fileName: string }[]
): Promise<void> => {
  try {
    const list = await getArchiveLog();
    const now = new Date().toISOString();
    const newEntries: ArchiveEntry[] = entries.map((e, i) => ({
      key: `${Date.now()}_${i}_${Math.random().toString(36).slice(2, 7)}`,
      name: e.name,
      project_number: e.project_number,
      archived_at: now,
      fileName: e.fileName,
    }));
    await AsyncStorage.setItem(KEY, JSON.stringify([...newEntries, ...list]));
  } catch (e) {
    console.warn('[ArchiveLog] Eintrag konnte nicht gespeichert werden:', e);
  }
};

export const removeArchiveEntry = async (key: string): Promise<void> => {
  try {
    const list = await getArchiveLog();
    await AsyncStorage.setItem(KEY, JSON.stringify(list.filter(e => e.key !== key)));
  } catch {}
};

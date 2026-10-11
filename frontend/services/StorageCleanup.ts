/**
 * StorageCleanup
 * Analysiert die Speicherbelegung der App und entfernt SICHER nur Daten,
 * die nachweislich nicht mehr benötigt werden:
 *  - Verwaiste Daten-Keys (Bild-Blobs ohne zugehörigen Datensatz)
 *  - Verwaiste Snapshot-Kopien (Snapshot-Erstellung wurde unterbrochen)
 *  - Temporäre Dateien im Cache (Export-/Import-/PDF-Reste)
 * Aktive Projekte, Kunden, Fotos, Skizzen etc. werden NIE angetastet.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { Directory, File, Paths } from 'expo-file-system';
import { ProjectService, extractImageRefKeys } from './LocalStorage';

const SNAP_PREFIX = 'aufmassprofi_snap_';
const SNAP_INDEX_KEY = 'aufmassprofi_auto_backups_index';
const OLD_MONOLITH_KEY = 'aufmassprofi_auto_backups'; // Alt-Format, nur noch Ballast

export interface StorageAnalysis {
  totalBytes: number;      // Gesamtbelegung AsyncStorage + Cache
  liveBytes: number;       // Aktive App-Daten (bleiben unangetastet)
  snapshotBytes: number;   // Gültige automatische Backups
  snapshotCount: number;
  trashBytes: number;      // Daten von Projekten im Papierkorb (Foto-/Skizzen-Blobs)
  trashCount: number;
  orphanBytes: number;     // Verwaiste Daten (sicher löschbar)
  orphanCount: number;
  orphanKeys: string[];
  cacheBytes: number;      // Temporäre Dateien (sicher löschbar)
  cacheCount: number;
  // Speicherbelegung pro Projekt (Foto-/Skizzen-Blobs), absteigend sortiert
  projectStats: { id: string; name: string; bytes: number; deleted: boolean }[];
}

const safeParse = (raw: string | null): any[] => {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
};

// Rekursive Cache-Vermessung (nur nativ)
const measureCache = (): { bytes: number; count: number } => {
  let bytes = 0;
  let count = 0;
  if (Platform.OS === 'web') return { bytes, count };
  try {
    const stack: Directory[] = [new Directory(Paths.cache)];
    while (stack.length > 0) {
      const dir = stack.pop()!;
      let entries: (File | Directory)[] = [];
      try { entries = dir.list(); } catch { continue; }
      for (const e of entries) {
        if (e instanceof Directory) {
          stack.push(e);
        } else {
          count++;
          try { bytes += (e as File).size ?? 0; } catch {}
        }
      }
    }
  } catch {}
  return { bytes, count };
};

interface OrphanCtx {
  validPhotoIds: Set<string>;
  validSketchIds: Set<string>;
  refImgKeys: Set<string>;
  validSnapPrefixes: string[];
}

// Lädt die leichten Referenz-Arrays und baut den Kontext für die Orphan-Erkennung
const loadOrphanCtx = async (): Promise<{ ctx: OrphanCtx; projects: any[]; photos: any[]; sketches: any[]; snapIndex: any[] }> => {
  const [projectsRaw, photosRaw, sketchesRaw, checklistsRaw, templatesRaw, documentsRaw, idxRaw] = await Promise.all([
    AsyncStorage.getItem('aufmassprofi_projects'),
    AsyncStorage.getItem('aufmassprofi_photos'),
    AsyncStorage.getItem('aufmassprofi_sketches'),
    AsyncStorage.getItem('aufmassprofi_checklists'),
    AsyncStorage.getItem('aufmassprofi_checklist_templates'),
    AsyncStorage.getItem('aufmassprofi_documents'),
    AsyncStorage.getItem(SNAP_INDEX_KEY),
  ]);
  const projects = safeParse(projectsRaw);
  const photos = safeParse(photosRaw);
  const sketches = safeParse(sketchesRaw);
  const snapIndex = safeParse(idxRaw);
  const ctx: OrphanCtx = {
    validPhotoIds: new Set(photos.map((p: any) => p.id)),
    validSketchIds: new Set(sketches.map((s: any) => s.id)),
    // Referenzierte chk_img_/doc_img_-Keys (auch aus Checklisten-Vorlagen!)
    refImgKeys: new Set<string>([
      ...extractImageRefKeys(checklistsRaw),
      ...extractImageRefKeys(templatesRaw),
      ...extractImageRefKeys(documentsRaw),
    ]),
    validSnapPrefixes: snapIndex.map((s: any) => `${SNAP_PREFIX}${s.id}_`),
  };
  return { ctx, projects, photos, sketches, snapIndex };
};

type KeyClass = 'orphan' | 'snapshot' | 'index' | 'dyn' | 'other';

const classifyKey = (key: string, ctx: OrphanCtx): KeyClass => {
  if (key === OLD_MONOLITH_KEY) return 'orphan';
  if (key === SNAP_INDEX_KEY) return 'index';
  if (key.startsWith(SNAP_PREFIX)) {
    // Verwaiste Snapshot-Kopie (Erstellung wurde unterbrochen) → orphan
    return ctx.validSnapPrefixes.some(p => key.startsWith(p)) ? 'snapshot' : 'orphan';
  }
  if (key.startsWith('photo_img_')) return ctx.validPhotoIds.has(key.slice(10)) ? 'dyn' : 'orphan';
  if (key.startsWith('sketch_meta_')) return ctx.validSketchIds.has(key.slice(12)) ? 'dyn' : 'orphan';
  if (key.startsWith('sketch_bg_')) return ctx.validSketchIds.has(key.slice(10)) ? 'dyn' : 'orphan';
  if (key.startsWith('sketch_prev_')) return ctx.validSketchIds.has(key.slice(12)) ? 'dyn' : 'orphan';
  if (key.startsWith('sketch_img_')) {
    const sid = key.slice(11).split('_')[0];
    return (sid === 'new' || ctx.validSketchIds.has(sid)) ? 'dyn' : 'orphan';
  }
  if (key.startsWith('chk_img_')) return ctx.refImgKeys.has(key) ? 'dyn' : 'orphan';
  if (key.startsWith('doc_img_')) return ctx.refImgKeys.has(key) ? 'dyn' : 'orphan';
  return 'other';
};

export const analyzeStorage = async (): Promise<StorageAnalysis> => {
  const allKeys = (await AsyncStorage.getAllKeys()) || [];
  const { ctx, projects, photos, sketches, snapIndex } = await loadOrphanCtx();

  let liveBytes = 0;
  let snapshotBytes = 0;
  let orphanBytes = 0;
  const orphanKeys: string[] = [];
  // Größen dynamischer Keys merken (für Papierkorb-Berechnung)
  const dynSizes = new Map<string, number>();

  // Jeden Key EINZELN vermessen – nie mehrere große Strings gleichzeitig im Speicher
  for (const key of allKeys) {
    let len = 0;
    try {
      const v = await AsyncStorage.getItem(key);
      len = v ? v.length : 0;
    } catch { continue; }

    switch (classifyKey(key, ctx)) {
      case 'orphan':
        orphanBytes += len;
        orphanKeys.push(key);
        break;
      case 'snapshot':
      case 'index':
        snapshotBytes += len;
        break;
      case 'dyn':
        liveBytes += len;
        dynSizes.set(key, len);
        break;
      default:
        liveBytes += len;
    }
  }

  // Speicherbelegung pro Projekt: jeden dynamischen Key seinem Projekt zuordnen
  const photoProject = new Map(photos.map((p: any) => [p.id, p.project_id]));
  const sketchProject = new Map(sketches.map((s: any) => [s.id, s.project_id]));
  const projectBytes = new Map<string, number>();
  for (const [k, v] of dynSizes) {
    let pid: string | undefined;
    if (k.startsWith('photo_img_')) pid = photoProject.get(k.slice(10));
    else if (k.startsWith('sketch_meta_')) pid = sketchProject.get(k.slice(12));
    else if (k.startsWith('sketch_bg_')) pid = sketchProject.get(k.slice(10));
    else if (k.startsWith('sketch_prev_')) pid = sketchProject.get(k.slice(12));
    else if (k.startsWith('sketch_img_')) pid = sketchProject.get(k.slice(11).split('_')[0]);
    if (pid) projectBytes.set(pid, (projectBytes.get(pid) || 0) + v);
  }
  const projectStats = projects
    .map((p: any) => ({ id: p.id, name: p.name || 'Unbenannt', bytes: projectBytes.get(p.id) || 0, deleted: !!p.deleted_at }))
    .sort((a, b) => b.bytes - a.bytes);

  // Papierkorb: Daten der gelöschten Projekte
  const trashedIds = new Set(projects.filter((p: any) => !!p.deleted_at).map((p: any) => p.id));
  let trashBytes = 0;
  for (const tid of trashedIds) trashBytes += projectBytes.get(tid as string) || 0;

  const cache = measureCache();

  return {
    totalBytes: liveBytes + snapshotBytes + orphanBytes + cache.bytes,
    liveBytes,
    snapshotBytes,
    snapshotCount: snapIndex.length,
    trashBytes,
    trashCount: trashedIds.size,
    orphanBytes,
    orphanCount: orphanKeys.length,
    orphanKeys,
    cacheBytes: cache.bytes,
    cacheCount: cache.count,
    projectStats,
  };
};

/**
 * Schneller Scan: Wie viele Bytes könnten durch eine Bereinigung freigegeben
 * werden? Liest NUR die Werte verwaister Keys (nicht die aktiven Daten) –
 * günstig genug für den App-Start (Speicher-Warnung auf der Startseite).
 */
export const quickFreeableScan = async (): Promise<number> => {
  try {
    const allKeys = (await AsyncStorage.getAllKeys()) || [];
    const { ctx } = await loadOrphanCtx();
    let bytes = 0;
    for (const key of allKeys) {
      if (classifyKey(key, ctx) === 'orphan') {
        try {
          const v = await AsyncStorage.getItem(key);
          bytes += v ? v.length : 0;
        } catch {}
      }
    }
    bytes += measureCache().bytes;
    return bytes;
  } catch {
    return 0;
  }
};

/**
 * Sichere Bereinigung: entfernt NUR verwaiste Keys + temporäre Cache-Dateien.
 * Gibt die Anzahl freigegebener Bytes zurück.
 */
export const cleanupSafe = async (analysis: StorageAnalysis): Promise<{ freedBytes: number; removedKeys: number; removedFiles: number }> => {
  // Verwaiste Keys in kleinen Batches löschen
  for (let i = 0; i < analysis.orphanKeys.length; i += 50) {
    await AsyncStorage.multiRemove(analysis.orphanKeys.slice(i, i + 50)).catch(() => {});
  }

  // Temporäre Cache-Dateien löschen (nur nativ; Cache enthält ausschließlich
  // App-eigene Export-/Import-/PDF-Reste – OS darf ihn ohnehin jederzeit leeren)
  let removedFiles = 0;
  if (Platform.OS !== 'web') {
    try {
      const entries = new Directory(Paths.cache).list();
      for (const e of entries) {
        try {
          e.delete();
          removedFiles++;
        } catch {}
      }
    } catch {}
  }

  return {
    freedBytes: analysis.orphanBytes + analysis.cacheBytes,
    removedKeys: analysis.orphanKeys.length,
    removedFiles,
  };
};

/**
 * Leert den Papierkorb SOFORT endgültig (alle soft-gelöschten Projekte
 * inkl. aller zugehörigen Daten – nutzt die kaskadierende Löschung).
 */
export const emptyTrashNow = async (): Promise<number> => {
  const trashed = await ProjectService.getTrashed();
  for (const p of trashed) {
    try { await ProjectService.delete(p.id); } catch (e) {
      console.warn('[StorageCleanup] Papierkorb-Löschung fehlgeschlagen:', p.id, e);
    }
  }
  return trashed.length;
};

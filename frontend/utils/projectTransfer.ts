// Speicherschonender Projekt-Export/-Import (verhindert Hermes-OOM-Crashes).
//
// Problem: Das alte Format war EINE riesige JSON-Datei. Beim Export musste
// JSON.stringify einen einzigen Riesen-String bauen, beim Import lagen die
// komplette Datei UND der geparste Objektbaum gleichzeitig im Speicher.
// Bei großen Projekten (viele Base64-Fotos/Skizzen) crashte Hermes mit
// std::bad_alloc (SIGABRT), z.B. beim Import vom iPhone auf das iPad.
//
// Lösung: NDJSON-Streaming-Format "aufmass-stream" (Version 2.0):
//   Zeile 1: Header
//   danach:  je EINE Zeile pro Projekt / Foto / Skizze / Skizzenbild / ...
// Export und Import verarbeiten immer nur EINE Zeile (= max. ein Bild)
// gleichzeitig. Der Speicherbedarf ist damit unabhängig von der Dateigröße.
//
// Alte v1-Dateien (eine große JSON) werden beim Import weiterhin unterstützt.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { File, Paths, FileMode } from 'expo-file-system';
import * as LegacyFS from 'expo-file-system/legacy';
import { Alert, Platform } from 'react-native';
import {
  ProjectService,
  CustomerService,
  RoofService,
  PhotoService,
  SketchService,
  ChecklistService,
  ReportService,
  DocumentService,
} from '../services/LocalStorage';
import { readTextFile } from './readTextFile';

const CHUNK = 256 * 1024; // 256 KB Lese-/Schreib-Chunks
const FORMAT_TAG = 'aufmass-stream';

// ---------------------------------------------------------------------------
// UTF-8 Streaming-Decoder (TextDecoder-Fallback für Hermes)
// ---------------------------------------------------------------------------
const utf8BytesToString = (buf: Uint8Array, end: number): string => {
  let out = '';
  let i = 0;
  while (i < end) {
    // Schneller ASCII-Pfad (Base64-Daten sind reines ASCII)
    let j = i;
    while (j < end && buf[j] < 0x80) j++;
    if (j > i) {
      for (let k = i; k < j; k += 8192) {
        out += String.fromCharCode.apply(
          null,
          buf.subarray(k, Math.min(k + 8192, j)) as unknown as number[]
        );
      }
      i = j;
      continue;
    }
    const b = buf[i];
    let cp = 0;
    let extra = 0;
    if ((b & 0xe0) === 0xc0) { cp = b & 0x1f; extra = 1; }
    else if ((b & 0xf0) === 0xe0) { cp = b & 0x0f; extra = 2; }
    else if ((b & 0xf8) === 0xf0) { cp = b & 0x07; extra = 3; }
    else { out += '\ufffd'; i++; continue; }
    let valid = i + extra < end;
    if (valid) {
      for (let k = 1; k <= extra; k++) {
        const nb = buf[i + k];
        if ((nb & 0xc0) !== 0x80) { valid = false; break; }
        cp = (cp << 6) | (nb & 0x3f);
      }
    }
    if (!valid) { out += '\ufffd'; i++; continue; }
    i += extra + 1;
    if (cp > 0xffff) {
      cp -= 0x10000;
      out += String.fromCharCode(0xd800 + (cp >> 10), 0xdc00 + (cp & 0x3ff));
    } else {
      out += String.fromCharCode(cp);
    }
  }
  return out;
};

class Utf8StreamDecoder {
  private native: TextDecoder | null =
    typeof TextDecoder !== 'undefined' ? new TextDecoder('utf-8') : null;
  private carry: Uint8Array | null = null;

  decode(bytes: Uint8Array, final: boolean): string {
    if (this.native) return this.native.decode(bytes, { stream: !final });
    let buf = bytes;
    if (this.carry && this.carry.length) {
      const merged = new Uint8Array(this.carry.length + bytes.length);
      merged.set(this.carry);
      merged.set(bytes, this.carry.length);
      buf = merged;
      this.carry = null;
    }
    let end = buf.length;
    if (!final && end > 0) {
      // Unvollständige Mehrbyte-Sequenz am Ende zurückhalten (max. 3 Folgebytes)
      let i = end - 1;
      let held = 0;
      while (i >= 0 && held < 3 && (buf[i] & 0xc0) === 0x80) { i--; held++; }
      if (i >= 0) {
        const lead = buf[i];
        let need = 0;
        if ((lead & 0xe0) === 0xc0) need = 2;
        else if ((lead & 0xf0) === 0xe0) need = 3;
        else if ((lead & 0xf8) === 0xf0) need = 4;
        if (need > 0 && held + 1 < need) {
          this.carry = buf.slice(i);
          end = i;
        }
      }
    }
    return utf8BytesToString(buf, end);
  }
}

// ---------------------------------------------------------------------------
// EXPORT
// ---------------------------------------------------------------------------
interface LineWriter {
  write(line: string): void;
}

const bigImageThreshold = 2000; // Strings darüber gelten als eingebettete Bilder

// Schreibt alle Daten eines Projekts als einzelne NDJSON-Zeilen.
const writeProjectLines = async (projectId: string, w: LineWriter, includePhotos: boolean): Promise<void> => {
  const project = await ProjectService.getById(projectId);
  if (!project) return;
  const customer = project.customer_id
    ? await CustomerService.getById(project.customer_id)
    : null;
  const roofs = await RoofService.getByProjectId(projectId);

  // Mengen vorab ermitteln (für die Fortschrittsanzeige beim Import)
  const allChecklists = await ChecklistService.getAll();
  const checklistMetas = allChecklists.filter((c: any) => c.project_id === projectId);
  const reports = await ReportService.getByProjectId(projectId);
  const allDocs = await DocumentService.getAll();
  const docMetas = allDocs.filter((d: any) => d.project_id === projectId);
  const allPhotos = await PhotoService.getAll();
  const photoMetas = includePhotos
    ? allPhotos.filter((p: any) => p.project_id === projectId)
    : [];
  const sketches = await SketchService.getByProjectId(projectId);

  w.write(JSON.stringify({
    type: 'project',
    project,
    customer: customer || {},
    roofs: roofs || [],
    counts: {
      photos: photoMetas.length,
      sketches: sketches.length,
      checklists: checklistMetas.length,
      reports: (reports || []).length,
      documents: docMetas.length,
    },
  }));

  // Checklisten: einzeln laden (getById stellt ausgelagerte Bilder wieder her)
  for (const c of checklistMetas) {
    try {
      const full = await ChecklistService.getById(c.id);
      if (full) w.write(JSON.stringify({ type: 'checklist', data: full }));
    } catch (e) {
      console.warn('[Export] Checkliste übersprungen:', c.id, e);
    }
  }

  // Berichte
  for (const r of reports || []) {
    w.write(JSON.stringify({ type: 'report', data: r }));
  }

  // Dokumente (PDFs mit Anmerkungen): EINZELN laden – getById stellt die
  // ausgelagerten doc_img_-Daten wieder her (Datei bleibt in sich vollständig)
  for (const dm of docMetas) {
    try {
      const full = await DocumentService.getById(dm.id);
      if (full) w.write(JSON.stringify({ type: 'document', data: full }));
    } catch (e) {
      console.warn('[Export] Dokument übersprungen:', dm.id, e);
    }
  }

  // Fotos: Metadaten aus dem (leichten) Array, Bilddaten EINZELN nachladen
  for (const p of photoMetas) {
    try {
      let image = await AsyncStorage.getItem(`photo_img_${p.id}`);
      if (!image) image = (p as any).image_data || (p as any).uri || '';
      const meta: any = { ...p, image_data: '', uri: '' };
      w.write(JSON.stringify({ type: 'photo', data: meta, image: image || '' }));
    } catch (e) {
      console.warn('[Export] Foto übersprungen:', p.id, e);
    }
  }

  // Skizzen: Metadaten + Hintergrund + Elementbilder als getrennte Zeilen
  for (const s of sketches) {
    try {
      let meta: any = null;
      let bg: string | null = null;
      const pendingImgs: { elementId: string; uri: string }[] = [];

      const metaStr = await AsyncStorage.getItem(`sketch_meta_${s.id}`);
      if (metaStr) {
        meta = JSON.parse(metaStr);
      } else if ((s as any).metadata) {
        // Legacy: Metadaten (inkl. Bilder) stecken noch im Hauptobjekt
        try { meta = JSON.parse((s as any).metadata); } catch { meta = null; }
      }

      if (meta) {
        if (meta.backgroundImage) {
          bg = meta.backgroundImage;
          delete meta.backgroundImage;
        }
        if (Array.isArray(meta.elements)) {
          meta.elements = meta.elements.map((el: any) => {
            const uri = el?.data?.uri;
            if (
              el?.type === 'image' &&
              typeof uri === 'string' &&
              uri.length > bigImageThreshold
            ) {
              // Inline-Bild in eigene Zeile auslagern
              pendingImgs.push({ elementId: el.id, uri });
              return {
                ...el,
                data: { ...el.data, uri: '__stored__', imageStorageKey: `sketch_img_${s.id}_${el.id}` },
              };
            }
            return el;
          });
        }
      }

      const light: any = { ...s };
      delete light.metadata;
      // Ausgelagerte Vorschau für den Export wieder einbetten (Datei bleibt in sich vollständig)
      if (light.sketch_data === '__stored__') {
        light.sketch_data = (await AsyncStorage.getItem(`sketch_prev_${s.id}`)) || undefined;
      }
      w.write(JSON.stringify({ type: 'sketch', data: light, metadata: meta }));

      // Hintergrundbild (aus Legacy-Metadaten oder separatem Key)
      if (!bg) bg = await AsyncStorage.getItem(`sketch_bg_${s.id}`);
      if (bg) {
        w.write(JSON.stringify({ type: 'sketch_bg', sketch_id: s.id, uri: bg }));
        bg = null;
      }

      // Elementbilder aus separaten Keys einzeln nachladen
      if (meta && Array.isArray(meta.elements)) {
        for (const el of meta.elements) {
          const key = el?.data?.imageStorageKey;
          if (el?.type === 'image' && key && !pendingImgs.find(pi => pi.elementId === el.id)) {
            const uri = await AsyncStorage.getItem(key);
            if (uri) {
              w.write(JSON.stringify({ type: 'sketch_img', sketch_id: s.id, element_id: el.id, uri }));
            }
          }
        }
      }
      // Inline-Bilder aus Legacy-Metadaten
      for (const pi of pendingImgs) {
        w.write(JSON.stringify({ type: 'sketch_img', sketch_id: s.id, element_id: pi.elementId, uri: pi.uri }));
      }
    } catch (e) {
      console.warn('[Export] Skizze übersprungen:', s.id, e);
    }
  }
};

export const exportProjectsToFile = async (
  projectIds: string[],
  options?: { includePhotos?: boolean }
): Promise<{ uri: string; sizeBytes: number; fileName: string }> => {
  const includePhotos = options?.includePhotos !== false;
  // Dateiname bestimmen ("_ohne_Fotos" zur Unterscheidung im Downloads-Ordner)
  const suffix = includePhotos ? '' : '_ohne_Fotos';
  let fileName: string;
  if (projectIds.length === 1) {
    const project = await ProjectService.getById(projectIds[0]);
    const safeName = (project?.name || 'projekt').replace(/[^a-zA-Z0-9äöüÄÖÜß]/g, '_');
    fileName = `${safeName}${suffix}.aufmass`;
  } else {
    const timestamp = new Date().toISOString().slice(0, 10);
    fileName = `Projekte_${timestamp}_${projectIds.length}${suffix}.aufmass`;
  }

  const header = JSON.stringify({
    format: FORMAT_TAG,
    version: '2.0',
    exportDate: new Date().toISOString(),
    projectCount: projectIds.length,
  });

  if (Platform.OS === 'web') {
    const lines: string[] = [header];
    const w: LineWriter = { write: (line) => lines.push(line) };
    for (const id of projectIds) await writeProjectLines(id, w, includePhotos);
    const content = lines.join('\n');
    const blob = new Blob([content], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    // Export-Zeitpunkt am Projekt vermerken (Export-Verlauf)
    await ProjectService.setLastExported(projectIds, new Date().toISOString()).catch(() => {});
    return { uri: fileName, sizeBytes: content.length, fileName };
  }

  // Nativ: gestreamtes Schreiben, nie ein Riesen-String im Speicher
  const file = new File(Paths.cache, fileName);
  try { if (file.exists) file.delete(); } catch {}
  file.create();
  const handle = file.open(FileMode.WriteOnly);
  const encoder = new TextEncoder();
  let sizeBytes = 0;
  const w: LineWriter = {
    write: (line: string) => {
      const withNl = line + '\n';
      for (let i = 0; i < withNl.length; i += CHUNK) {
        const bytes = encoder.encode(withNl.slice(i, i + CHUNK));
        handle.writeBytes(bytes);
        sizeBytes += bytes.length;
      }
    },
  };
  try {
    w.write(header);
    for (const id of projectIds) {
      await writeProjectLines(id, w, includePhotos);
    }
  } finally {
    handle.close();
  }
  // Export-Zeitpunkt am Projekt vermerken (Export-Verlauf)
  await ProjectService.setLastExported(projectIds, new Date().toISOString()).catch(() => {});
  return { uri: file.uri, sizeBytes, fileName };
};

// ---------------------------------------------------------------------------
// IMPORT
// ---------------------------------------------------------------------------
export interface ImportSummary {
  importedProjects: { id: string; name: string }[]; // neu angelegte Kopien
  updatedProjects: { id: string; name: string }[];  // per Sync ersetzte Projekte
  skippedProjects: string[];                        // vom Nutzer übersprungen
  failedItems: number;
  totalItems: number;
}

export interface ImportProgress {
  projectIndex: number;          // 1-basiert
  projectCount: number | null;
  projectName: string;
  label: string;                 // z.B. "Foto 5 von 23"
  fraction: number | null;       // 0..1 innerhalb des Projekts, null = unbestimmt
}

export interface DuplicateInfo {
  projectName: string;
  fileExportedAt: string | null;  // Wann die Import-Datei exportiert wurde
  deviceChangedAt: string | null; // Letzte Datenänderung auf diesem Gerät
}

export interface ImportOptions {
  onProgress?: (p: ImportProgress) => void;
  // Wird gerufen, wenn das Projekt bereits auf dem Gerät existiert
  onDuplicate?: (info: DuplicateInfo) => Promise<'update' | 'copy' | 'skip'>;
}

interface ImportState {
  currentProjectId: string | null;
  skipChildren: boolean;
  sketchIdMap: Record<string, string>;
  importedProjects: { id: string; name: string }[];
  updatedProjects: { id: string; name: string }[];
  skippedProjects: string[];
  createdProjectIds: string[]; // für Rollback bei fatalem Fehler
  failedItems: number;
  totalItems: number;
  // Fortschritt
  projectIndex: number;
  projectCount: number | null;
  currentProjectName: string;
  itemsDone: number;
  itemsTotal: number | null;
  counters: { photo: number; sketch: number; checklist: number; report: number; document: number };
  itemTotals: { photo: number | null; sketch: number | null; checklist: number | null; report: number | null; document: number | null };
  exportDate: string | null; // aus der Header-Zeile (für Duplikat-Zeitvergleich)
  importedPhotoCount: number;  // über alle Projekte (für End-Verifikation)
  importedSketchCount: number;
  options: ImportOptions;
}

// Letzte Datenänderung eines Projekts auf DIESEM Gerät ermitteln
// (Projekt-updated_at allein reicht nicht: neue Fotos/Skizzen ändern es nicht)
const getDeviceLastChange = async (
  projectId: string,
  projectUpdatedAt?: string
): Promise<string | null> => {
  let latest: string | null = projectUpdatedAt || null;
  const consider = (ts?: string) => {
    if (ts && (!latest || ts > latest)) latest = ts;
  };
  try {
    const [photos, sketches, checklists, reports] = await Promise.all([
      PhotoService.getAll(),
      SketchService.getAll(),
      ChecklistService.getAll(),
      ReportService.getByProjectId(projectId),
    ]);
    for (const p of photos) if ((p as any).project_id === projectId) consider((p as any).updated_at);
    for (const s of sketches) if ((s as any).project_id === projectId) consider((s as any).updated_at);
    for (const c of checklists) if ((c as any).project_id === projectId) consider((c as any).updated_at);
    for (const r of reports || []) consider((r as any).updated_at);
  } catch { /* Bestmöglicher Wert reicht */ }
  return latest;
};

const emitProgress = (state: ImportState, label: string) => {
  state.options.onProgress?.({
    projectIndex: state.projectIndex,
    projectCount: state.projectCount,
    projectName: state.currentProjectName,
    label,
    fraction: state.itemsTotal ? Math.min(1, state.itemsDone / state.itemsTotal) : null,
  });
};

const stripSystemFields = (obj: any): any => {
  const d = { ...obj };
  delete d.id;
  delete d.created_at;
  delete d.updated_at;
  // Geräte-spezifische Felder nicht mit importieren
  delete d.last_exported_at;
  delete d.deleted_at;
  return d;
};

// Verarbeitet EINEN Datensatz (eine NDJSON-Zeile). Speicherbedarf bleibt
// dadurch pro Schritt auf max. ein Bild begrenzt.
const processRecord = async (rec: any, state: ImportState): Promise<void> => {
  if (!rec || typeof rec !== 'object') return;

  if (rec.format === FORMAT_TAG) {
    // Header-Zeile: Projektanzahl + Export-Zeitpunkt übernehmen
    if (typeof rec.projectCount === 'number') state.projectCount = rec.projectCount;
    if (typeof rec.exportDate === 'string') state.exportDate = rec.exportDate;
    return;
  }

  if (rec.type === 'project') {
    state.sketchIdMap = {};
    state.skipChildren = false;
    state.currentProjectId = null;
    state.projectIndex++;
    state.currentProjectName = rec.project?.name || '';
    // Fortschritts-Zähler für dieses Projekt zurücksetzen
    const counts = rec.counts || null;
    state.counters = { photo: 0, sketch: 0, checklist: 0, report: 0, document: 0 };
    state.itemTotals = {
      photo: counts ? (counts.photos ?? null) : null,
      sketch: counts ? (counts.sketches ?? null) : null,
      checklist: counts ? (counts.checklists ?? null) : null,
      report: counts ? (counts.reports ?? null) : null,
      document: counts ? (counts.documents ?? null) : null,
    };
    state.itemsDone = 0;
    state.itemsTotal = counts
      ? (counts.photos || 0) + (counts.sketches || 0) + (counts.checklists || 0) + (counts.reports || 0) + (counts.documents || 0)
      : null;
    emitProgress(state, 'Projekt wird angelegt…');
    try {
      // Duplikat-Erkennung über die Ursprungs-ID (bleibt über Export/Import-Ketten erhalten)
      const fileOrigin: string | null = rec.project?.origin_id || rec.project?.id || null;
      let action: 'copy' | 'update' = 'copy';
      let existing: any = null;
      if (fileOrigin && state.options.onDuplicate) {
        const allProjects = await ProjectService.getAll();
        existing = allProjects.find(
          (p: any) => p.origin_id === fileOrigin || p.id === fileOrigin
        ) || null;
        if (existing) {
          const choice = await state.options.onDuplicate({
            projectName: rec.project?.name || '',
            fileExportedAt: state.exportDate || rec.exportDate || rec.project?.updated_at || null,
            deviceChangedAt: await getDeviceLastChange(existing.id, existing.updated_at),
          });
          if (choice === 'skip') {
            state.skipChildren = true;
            state.skippedProjects.push(rec.project?.name || '');
            return;
          }
          action = choice;
        }
      }

      let newCustomerId = rec.project?.customer_id;
      if (action === 'update' && existing?.customer_id) {
        // Sync: bestehende Kundenzuordnung behalten (keine Kunden-Dubletten)
        newCustomerId = existing.customer_id;
      } else if (rec.customer && rec.customer.name) {
        // Kunde: beim Import immer neu anlegen (Konflikte vermeiden)
        const newCustomer = await CustomerService.create(stripSystemFields(rec.customer));
        newCustomerId = newCustomer.id;
      }

      if (action === 'update' && existing) {
        // Komplett ersetzen: alter Stand wandert in den Papierkorb
        // (30 Tage wiederherstellbar als Sicherheitsnetz)
        await ProjectService.moveToTrash(existing.id);
      }

      const projectData = stripSystemFields({
        ...rec.project,
        name: action === 'update' ? rec.project.name : `${rec.project.name} (Import)`,
        customer_id: newCustomerId,
        origin_id: fileOrigin || undefined,
      });
      const newProject = await ProjectService.create(projectData);
      state.currentProjectId = newProject.id;
      state.createdProjectIds.push(newProject.id);
      if (action === 'update') {
        state.updatedProjects.push({ id: newProject.id, name: rec.project.name });
      } else {
        state.importedProjects.push({ id: newProject.id, name: rec.project.name });
      }

      for (const roof of rec.roofs || []) {
        state.totalItems++;
        try {
          await RoofService.create({ ...stripSystemFields(roof), project_id: newProject.id });
        } catch (e) {
          state.failedItems++;
          console.error('[Import] Dachfläche fehlgeschlagen:', e);
        }
      }
    } catch (e) {
      // Projekt selbst fehlgeschlagen → alle Kind-Datensätze überspringen
      state.skipChildren = true;
      state.failedItems++;
      console.error('[Import] Projekt fehlgeschlagen:', e);
    }
    return;
  }

  if (state.skipChildren || !state.currentProjectId) return;
  const projectId = state.currentProjectId;

  try {
    switch (rec.type) {
      case 'checklist': {
        state.totalItems++;
        state.counters.checklist++;
        state.itemsDone++;
        emitProgress(state, `Checkliste ${state.counters.checklist}${state.itemTotals.checklist ? ` von ${state.itemTotals.checklist}` : ''}`);
        await ChecklistService.create({ ...stripSystemFields(rec.data), project_id: projectId });
        break;
      }
      case 'report': {
        state.totalItems++;
        state.counters.report++;
        state.itemsDone++;
        emitProgress(state, `Bericht ${state.counters.report}${state.itemTotals.report ? ` von ${state.itemTotals.report}` : ''}`);
        await ReportService.create({ ...stripSystemFields(rec.data), project_id: projectId });
        break;
      }
      case 'document': {
        state.totalItems++;
        state.counters.document++;
        state.itemsDone++;
        emitProgress(state, `Dokument ${state.counters.document}${state.itemTotals.document ? ` von ${state.itemTotals.document}` : ''}`);
        // DocumentService.create lagert große PDF-/Seitendaten automatisch in doc_img_-Keys aus
        await DocumentService.create({ ...stripSystemFields(rec.data), project_id: projectId });
        break;
      }
      case 'photo': {
        state.totalItems++;
        state.counters.photo++;
        state.itemsDone++;
        emitProgress(state, `Foto ${state.counters.photo}${state.itemTotals.photo ? ` von ${state.itemTotals.photo}` : ''}`);
        state.importedPhotoCount++;
        const img = rec.image || '';
        await PhotoService.create({
          ...stripSystemFields(rec.data),
          project_id: projectId,
          image_data: img,
          uri: img,
        });
        break;
      }
      case 'sketch': {
        state.totalItems++;
        state.counters.sketch++;
        state.itemsDone++;
        emitProgress(state, `Skizze ${state.counters.sketch}${state.itemTotals.sketch ? ` von ${state.itemTotals.sketch}` : ''}`);
        state.importedSketchCount++;
        const origId = rec.data?.id;
        const light = stripSystemFields({ ...rec.data, project_id: projectId });
        delete light.metadata;
        const created = await SketchService.create(light);
        if (origId) state.sketchIdMap[origId] = created.id;
        const meta = rec.metadata;
        if (meta) {
          // Bild-Verweise auf die NEUEN Storage-Keys umschreiben
          if (Array.isArray(meta.elements)) {
            meta.elements = meta.elements.map((el: any) =>
              el?.data?.imageStorageKey
                ? { ...el, data: { ...el.data, imageStorageKey: `sketch_img_${created.id}_${el.id}` } }
                : el
            );
          }
          await AsyncStorage.setItem(`sketch_meta_${created.id}`, JSON.stringify(meta));
        }
        break;
      }
      case 'sketch_bg': {
        const newId = state.sketchIdMap[rec.sketch_id];
        if (newId && rec.uri) await AsyncStorage.setItem(`sketch_bg_${newId}`, rec.uri);
        break;
      }
      case 'sketch_img': {
        const newId = state.sketchIdMap[rec.sketch_id];
        if (newId && rec.uri) {
          await AsyncStorage.setItem(`sketch_img_${newId}_${rec.element_id}`, rec.uri);
        }
        break;
      }
      // 'legacy_sketch': Skizze aus v1-Datei – metadata enthält alles inline,
      // SketchService.create() splittet Hintergrund/Bilder automatisch auf.
      case 'legacy_sketch': {
        state.totalItems++;
        state.counters.sketch++;
        state.itemsDone++;
        emitProgress(state, `Skizze ${state.counters.sketch}${state.itemTotals.sketch ? ` von ${state.itemTotals.sketch}` : ''}`);
        state.importedSketchCount++;
        await SketchService.create({ ...stripSystemFields(rec.data), project_id: projectId });
        break;
      }
      default:
        break;
    }
  } catch (e) {
    state.failedItems++;
    console.error('[Import] Element fehlgeschlagen:', rec.type, e);
  }
};

// Legacy-v1-Import: eine große JSON-Datei (einzelnes Projekt oder Sammlung).
const importLegacyPayload = async (importData: any, state: ImportState): Promise<void> => {
  const bundles = Array.isArray(importData.projects)
    ? importData.projects
    : [importData];
  state.projectCount = bundles.filter((b: any) => b?.project).length;

  for (const bundle of bundles) {
    if (!bundle?.project) continue;
    await processRecord(
      {
        type: 'project',
        project: bundle.project,
        customer: bundle.customer,
        roofs: bundle.roofs,
        exportDate: bundle.exportDate || importData.exportDate || null,
        counts: {
          photos: bundle.photos?.length || 0,
          sketches: bundle.sketches?.length || 0,
          checklists: bundle.checklists?.length || 0,
          reports: bundle.reports?.length || 0,
        },
      },
      state
    );
    const lists: [string, any[] | undefined][] = [
      ['photo', bundle.photos],
      ['legacy_sketch', bundle.sketches],
      ['checklist', bundle.checklists],
      ['report', bundle.reports],
    ];
    for (const [type, items] of lists) {
      if (!items) continue;
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        items[i] = null; // Referenz sofort freigeben (GC-Entlastung)
        if (!item) continue;
        if (type === 'photo') {
          await processRecord({ type, data: item, image: item.image_data || item.uri || '' }, state);
        } else {
          await processRecord({ type, data: item }, state);
        }
      }
    }
  }
};

// Liest die Datei zeilenweise (NDJSON) und verarbeitet jeden Datensatz sofort.
const streamImportNative = async (filePath: string, state: ImportState): Promise<void> => {
  const file = new File(filePath);
  const handle = file.open(FileMode.ReadOnly);
  const decoder = new Utf8StreamDecoder();
  let parts: string[] = [];

  const handleLine = async (line: string) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    let rec: any;
    try {
      rec = JSON.parse(trimmed);
    } catch {
      state.failedItems++;
      console.error('[Import] Zeile nicht lesbar (übersprungen)');
      return;
    }
    await processRecord(rec, state);
  };

  try {
    for (;;) {
      const bytes = handle.readBytes(CHUNK);
      const done = bytes.length === 0;
      const text = decoder.decode(bytes, done);
      if (text.length > 0) {
        if (text.indexOf('\n') !== -1) {
          const combined = parts.length ? parts.join('') + text : text;
          parts = [];
          const segs = combined.split('\n');
          const tail = segs.pop() as string;
          for (const seg of segs) await handleLine(seg);
          if (tail) parts.push(tail);
        } else {
          parts.push(text);
        }
      }
      if (done) break;
    }
    const rest = parts.join('');
    parts = [];
    if (rest.trim()) await handleLine(rest);
  } finally {
    handle.close();
  }
};

export const importProjectsFromFile = async (
  uri: string,
  options: ImportOptions = {}
): Promise<ImportSummary> => {
  const state: ImportState = {
    currentProjectId: null,
    skipChildren: false,
    sketchIdMap: {},
    importedProjects: [],
    updatedProjects: [],
    skippedProjects: [],
    createdProjectIds: [],
    failedItems: 0,
    totalItems: 0,
    projectIndex: 0,
    projectCount: null,
    currentProjectName: '',
    itemsDone: 0,
    itemsTotal: null,
    counters: { photo: 0, sketch: 0, checklist: 0, report: 0, document: 0 },
    itemTotals: { photo: null, sketch: null, checklist: null, report: null, document: null },
    exportDate: null,
    importedPhotoCount: 0,
    importedSketchCount: 0,
    options,
  };

  try {
    if (Platform.OS === 'web') {
      // Web: ganze Datei lesen (Browser-Speicher reicht aus)
      const content = await readTextFile(uri);
      if (content.includes('... (gekürzt)')) throw new Error('IMPORT_INCOMPLETE');
      const firstLineEnd = content.indexOf('\n');
      const firstLine = firstLineEnd === -1 ? content : content.slice(0, firstLineEnd);
      if (firstLine.includes(`"format":"${FORMAT_TAG}"`)) {
        for (const line of content.split('\n')) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          try {
            await processRecord(JSON.parse(trimmed), state);
          } catch {
            state.failedItems++;
          }
        }
      } else {
        const importData = JSON.parse(content);
        if (!importData.version || (!importData.project && !Array.isArray(importData.projects))) {
          throw new Error('IMPORT_INVALID');
        }
        await importLegacyPayload(importData, state);
      }
    } else {
      // Nativ: content://-URIs (Android SAF) erst in den Cache kopieren,
      // damit die Datei per FileHandle gestreamt gelesen werden kann.
      let filePath = uri;
      let tempCopy: string | null = null;
      if (!uri.startsWith('file://')) {
        tempCopy = `${LegacyFS.cacheDirectory}import_${Date.now()}.aufmass`;
        await LegacyFS.copyAsync({ from: uri, to: tempCopy });
        filePath = tempCopy;
      }

      try {
        // Format erkennen: nur die ersten ~300 Bytes lesen
        let probe = '';
        try {
          const probeFile = new File(filePath);
          const probeHandle = probeFile.open(FileMode.ReadOnly);
          try {
            const probeBytes = probeHandle.readBytes(300);
            probe = utf8BytesToString(probeBytes, probeBytes.length);
          } finally {
            probeHandle.close();
          }
        } catch (probeErr) {
          console.warn('[Import] Format-Probe fehlgeschlagen, nutze Legacy-Pfad:', probeErr);
        }

        if (probe.includes(`"format":"${FORMAT_TAG}"`)) {
          await streamImportNative(filePath, state);
        } else {
          // Legacy v1: ganze Datei lesen + parsen (alte, kleinere Dateien)
          let content = await readTextFile(filePath);
          if (content.includes('... (gekürzt)')) throw new Error('IMPORT_INCOMPLETE');
          const importData = JSON.parse(content);
          content = ''; // Riesen-String sofort freigeben
          if (!importData.version || (!importData.project && !Array.isArray(importData.projects))) {
            throw new Error('IMPORT_INVALID');
          }
          await importLegacyPayload(importData, state);
        }
      } finally {
        if (tempCopy) LegacyFS.deleteAsync(tempCopy, { idempotent: true }).catch(() => {});
      }
    }

    if (
      state.importedProjects.length === 0 &&
      state.updatedProjects.length === 0 &&
      state.skippedProjects.length === 0
    ) {
      throw new Error('IMPORT_INVALID');
    }

    // End-Verifikation: Wurden alle Skizzen/Fotos wirklich gespeichert?
    // Schützt vor stillschweigend fehlgeschlagenen Schreibvorgängen.
    try {
      const createdIds = new Set(state.createdProjectIds);
      const [allSketches, allPhotos] = await Promise.all([
        SketchService.getAll(),
        PhotoService.getAll(),
      ]);
      const actualSketches = allSketches.filter((s: any) => createdIds.has(s.project_id)).length;
      const actualPhotos = allPhotos.filter((p: any) => createdIds.has(p.project_id)).length;
      const missing =
        Math.max(0, state.importedSketchCount - actualSketches) +
        Math.max(0, state.importedPhotoCount - actualPhotos);
      if (missing > 0) {
        console.error(`[Import] Verifikation: ${missing} Elemente wurden nicht gespeichert!`);
        state.failedItems = Math.max(state.failedItems, missing);
      }
    } catch { /* Verifikation ist best-effort */ }

    return {
      importedProjects: state.importedProjects,
      updatedProjects: state.updatedProjects,
      skippedProjects: state.skippedProjects,
      failedItems: state.failedItems,
      totalItems: state.totalItems,
    };
  } catch (fatalError) {
    // Rollback: halb importierte Projekte entfernen (keine "Geister-Projekte")
    for (const id of state.createdProjectIds) {
      try { await ProjectService.delete(id); } catch { /* ignorieren */ }
    }
    throw fatalError;
  }
};

// ---------------------------------------------------------------------------
// DIALOG-HELFER (von Home- und Projektdetail-Screen gemeinsam genutzt)
// ---------------------------------------------------------------------------

// Fragt vor dem Export, ob Fotos enthalten sein sollen.
// true = mit Fotos, false = ohne Fotos, null = abgebrochen
export const askExportPhotoChoice = (): Promise<boolean | null> =>
  new Promise((resolve) => {
    if (Platform.OS === 'web') {
      // Web-Fallback (Alert.alert rendert auf Web nicht)
      resolve(window.confirm('Fotos mit exportieren?\n\nOK = Mit Fotos\nAbbrechen = Ohne Fotos (kleinere Datei)'));
      return;
    }
    Alert.alert(
      'Projekt exportieren',
      'Sollen die Fotos mit exportiert werden?',
      [
        { text: 'Mit Fotos', onPress: () => resolve(true) },
        { text: 'Ohne Fotos (kleinere Datei)', onPress: () => resolve(false) },
        { text: 'Abbrechen', style: 'cancel', onPress: () => resolve(null) },
      ],
      { cancelable: true, onDismiss: () => resolve(null) }
    );
  });

// Fragt beim Import, wie mit einem bereits vorhandenen Projekt umgegangen werden soll.
// Zeigt an, welcher Stand neuer ist (Datei-Export vs. letzte Änderung auf dem Gerät).
export const askDuplicateAction = (info: DuplicateInfo): Promise<'update' | 'copy' | 'skip'> => {
  const fmt = (iso: string) => {
    const d = new Date(iso);
    return `${d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })}, ${d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr`;
  };
  let compare = '';
  if (info.fileExportedAt && info.deviceChangedAt) {
    const fileT = new Date(info.fileExportedAt).getTime();
    const devT = new Date(info.deviceChangedAt).getTime();
    const sameish = Math.abs(fileT - devT) < 60 * 1000; // < 1 Minute = praktisch gleich
    compare =
      `\n\n📄 Datei exportiert: ${fmt(info.fileExportedAt)}` +
      `\n📱 Gerät zuletzt geändert: ${fmt(info.deviceChangedAt)}`;
    if (sameish) {
      compare += '\n→ Beide Stände sind praktisch gleich aktuell.';
    } else if (fileT > devT) {
      compare += '\n→ Die Datei ist NEUER als der Stand auf diesem Gerät.';
    } else {
      compare += '\n\n⚠️ Achtung: Der Stand auf DIESEM GERÄT ist neuer als die Datei! Beim Aktualisieren gehen die neueren Änderungen in den Papierkorb.';
    }
  }
  const message =
    `„${info.projectName}" existiert bereits auf diesem Gerät.${compare}` +
    `\n\nBeim Aktualisieren wandert der alte Stand für 30 Tage in den Papierkorb.` +
    `\n\nWie möchten Sie fortfahren?`;

  return new Promise((resolve) => {
    if (Platform.OS === 'web') {
      resolve(
        window.confirm(
          `Projekt "${info.projectName}" existiert bereits auf diesem Gerät.${compare}\n\nOK = Aktualisieren (vorhandenes Projekt ersetzen)\nAbbrechen = Als Kopie importieren`
        )
          ? 'update'
          : 'copy'
      );
      return;
    }
    Alert.alert(
      'Projekt bereits vorhanden',
      message,
      [
        { text: 'Aktualisieren (ersetzen)', onPress: () => resolve('update') },
        { text: 'Als Kopie importieren', onPress: () => resolve('copy') },
        { text: 'Überspringen', style: 'cancel', onPress: () => resolve('skip') },
      ],
      { cancelable: false }
    );
  });
};

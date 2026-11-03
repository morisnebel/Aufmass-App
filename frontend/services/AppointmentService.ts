// Termine (von der Startseite angelegt): Notiz, Adresse fürs Navi, Erinnerung zur Abfahrt
import AsyncStorage from '@react-native-async-storage/async-storage';

export const APPOINTMENTS_KEY = 'aufmassprofi_appointments';
export const PACKING_RECENT_KEY = 'aufmassprofi_packing_recent';
export const PACKING_TEMPLATES_KEY = 'aufmassprofi_packing_templates';

export interface PackItem { id: string; text: string; done: boolean }
export interface PackTemplate { id: string; name: string; items: string[] }

// Mitnehmen-Vorlagen (beim ersten Mal mit Beispielen gefüllt)
const DEFAULT_TEMPLATES: PackTemplate[] = [
  { id: 'tpl_dach', name: 'Dach-Aufmaß', items: ['Leiter', 'Zollstock', 'Laser-Entfernungsmesser', 'Kamera', 'Musterziegel', 'Schutzausrüstung'] },
  { id: 'tpl_abnahme', name: 'Abnahme', items: ['Abnahmeprotokoll', 'Tablet/Handy geladen', 'Kamera', 'Zollstock', 'Taschenlampe'] },
];
export const PackTemplates = {
  getAll: async (): Promise<PackTemplate[]> => {
    try {
      const raw = await AsyncStorage.getItem(PACKING_TEMPLATES_KEY);
      return raw ? JSON.parse(raw) : DEFAULT_TEMPLATES;
    } catch { return DEFAULT_TEMPLATES; }
  },
  saveAll: (list: PackTemplate[]) => AsyncStorage.setItem(PACKING_TEMPLATES_KEY, JSON.stringify(list)),
};

export interface Appointment {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD (lokal)
  time?: string | null; // HH:MM
  project_id?: string | null;
  address?: string;
  note?: string;
  travel_minutes?: number | null; // Fahrzeit → Erinnerung zur Abfahrt
  reminder_id?: string | null; // geplante lokale Benachrichtigung
  remind_before?: number | null; // normale Terminerinnerung (Minuten vor Beginn, -1 = eigene Zeit)
  remind_at?: string | null; // eigene Erinnerungszeit (ISO)
  depart_at?: string | null; // eigene Abfahrtszeit (ISO), travel_minutes = -1
  packing?: PackItem[]; // Checkliste: was mitnehmen
  remind_id?: string | null;
  customer_id?: string | null;
  created_at: string;
  updated_at: string;
}

const readAll = async (): Promise<Appointment[]> => {
  try {
    const raw = await AsyncStorage.getItem(APPOINTMENTS_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
};
const writeAll = (list: Appointment[]) => AsyncStorage.setItem(APPOINTMENTS_KEY, JSON.stringify(list));
let packQueue: Promise<void> = Promise.resolve();

export const AppointmentService = {
  getAll: readAll,

  save: async (data: Omit<Appointment, 'id' | 'created_at' | 'updated_at'> & { id?: string }): Promise<Appointment> => {
    const list = await readAll();
    const now = new Date().toISOString();
    const existing = data.id ? list.find(a => a.id === data.id) : undefined;
    const item: Appointment = existing
      ? { ...existing, ...data, id: existing.id, updated_at: now }
      : { ...data, id: `apt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, created_at: now, updated_at: now };
    await writeAll(existing ? list.map(a => (a.id === item.id ? item : a)) : [...list, item]);
    await syncProjects([item.project_id, existing?.project_id]);
    return item;
  },

  // Mitnehmen-Punkt direkt abhaken (ohne Projekt-Sync); Schreibvorgänge nacheinander, Zielwert statt Umschalten
  setPackDone: (aptId: string, itemId: string, done: boolean): Promise<void> => {
    packQueue = packQueue.then(async () => {
      const list = await readAll();
      await writeAll(list.map(a => (a.id !== aptId ? a : { ...a, packing: (a.packing || []).map(p => (p.id === itemId ? { ...p, done } : p)) })));
    }).catch(() => {});
    return packQueue;
  },

  remove: async (id: string): Promise<void> => {
    const list = await readAll();
    const gone = list.find(a => a.id === id);
    await writeAll(list.filter(a => a.id !== id));
    await syncProjects([gone?.project_id]);
  },
};

// Projekt-Termin (appointment_date/-time) = nächster verknüpfter Termin – damit Projektliste & Übersichten aktuell bleiben
const syncProjects = async (ids: (string | null | undefined)[]) => {
  const unique = Array.from(new Set(ids.filter(Boolean))) as string[];
  if (!unique.length) return;
  const { ProjectService } = await import('./LocalStorage');
  const list = await readAll();
  const d = new Date();
  const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  for (const pid of unique) {
    const next = list.filter(a => a.project_id === pid && a.date >= today)
      .sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')))[0];
    try { await ProjectService.update(pid, { appointment_date: next?.date || null, appointment_time: next?.time || null } as any); } catch {}
  }
};

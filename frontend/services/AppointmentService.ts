// Termine (von der Startseite angelegt): Notiz, Adresse fürs Navi, Erinnerung zur Abfahrt
import AsyncStorage from '@react-native-async-storage/async-storage';

export const APPOINTMENTS_KEY = 'aufmassprofi_appointments';

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
    return item;
  },

  remove: async (id: string): Promise<void> => {
    await writeAll((await readAll()).filter(a => a.id !== id));
  },
};

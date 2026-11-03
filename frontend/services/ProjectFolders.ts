// Projektordner: eigene Ordner (z. B. nach Kunde oder Jahr), Projekte verweisen über folder_id
import AsyncStorage from '@react-native-async-storage/async-storage';

export const PROJECT_FOLDERS_KEY = 'aufmassprofi_project_folders';

export interface ProjectFolder {
  id: string;
  name: string;
  color: string;
  created_at: string;
}

export const FOLDER_COLORS = ['#1976d2', '#7c3aed', '#ea580c', '#16a34a', '#0891b2', '#db2777', '#ca8a04', '#475569'];

const readAll = async (): Promise<ProjectFolder[]> => {
  try {
    const raw = await AsyncStorage.getItem(PROJECT_FOLDERS_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
};

const writeAll = (list: ProjectFolder[]) => AsyncStorage.setItem(PROJECT_FOLDERS_KEY, JSON.stringify(list));

export const ProjectFolderService = {
  getAll: async (): Promise<ProjectFolder[]> =>
    (await readAll()).sort((a, b) => a.name.localeCompare(b.name, 'de')),

  create: async (name: string): Promise<ProjectFolder> => {
    const list = await readAll();
    const folder: ProjectFolder = {
      id: `fld_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      name: name.trim(),
      color: FOLDER_COLORS[list.length % FOLDER_COLORS.length],
      created_at: new Date().toISOString(),
    };
    await writeAll([...list, folder]);
    return folder;
  },

  rename: async (id: string, name: string): Promise<void> => {
    const list = await readAll();
    await writeAll(list.map(f => (f.id === id ? { ...f, name: name.trim() } : f)));
  },

  remove: async (id: string): Promise<void> => {
    const list = await readAll();
    await writeAll(list.filter(f => f.id !== id));
  },
};

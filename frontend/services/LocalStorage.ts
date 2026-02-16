import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

// CloudKit storage is disabled until iCloud configuration is complete
// This ensures the app works reliably with AsyncStorage only
let CloudKitStorage: any = null;
let cloudKitInitialized = false;
let cloudKitFailed = false;

// Initialize CloudKit on iOS - DISABLED for now due to configuration issues
const initCloudKit = async () => {
  // CloudKit is disabled - using AsyncStorage only for stability
  // To re-enable iCloud sync, uncomment the code below after proper configuration
  cloudKitFailed = true;
  cloudKitInitialized = true;
  console.log('CloudKit disabled - using AsyncStorage for local storage');
  
  /*
  if (Platform.OS === 'ios' && !cloudKitInitialized) {
    cloudKitInitialized = true;
    try {
      const CloudKitModule = require('react-native-cloudkit-storage');
      CloudKitStorage = CloudKitModule.default || CloudKitModule;
      
      if (CloudKitStorage && typeof CloudKitStorage.registerForPushUpdates === 'function') {
        await CloudKitStorage.registerForPushUpdates();
        console.log('CloudKit initialized successfully');
      } else {
        throw new Error('CloudKit module not properly loaded');
      }
    } catch (error) {
      console.log('CloudKit not available, using AsyncStorage:', error);
      CloudKitStorage = null;
      cloudKitFailed = true;
    }
  }
  */
};

// Initialize on module load
initCloudKit();

// Storage Keys
const KEYS = {
  CUSTOMERS: 'aufmassprofi_customers',
  PROJECTS: 'aufmassprofi_projects',
  SKETCHES: 'aufmassprofi_sketches',
  PHOTOS: 'aufmassprofi_photos',
  ROOFS: 'aufmassprofi_roofs',
  CHECKLISTS: 'aufmassprofi_checklists',
  CHECKLIST_TEMPLATES: 'aufmassprofi_checklist_templates',
  SETTINGS: 'aufmassprofi_settings',
  SYNC_TIMESTAMP: 'aufmassprofi_sync_timestamp',
};

// Helper to generate unique IDs
const generateId = (): string => {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
};

// ============ UNIFIED STORAGE LAYER ============
// Uses CloudKit on iOS, AsyncStorage as fallback

const storage = {
  getItem: async (key: string): Promise<string | null> => {
    try {
      if (Platform.OS === 'ios' && CloudKitStorage) {
        const value = await CloudKitStorage.getItem(key);
        // Also sync to local AsyncStorage for offline access
        if (value) {
          await AsyncStorage.setItem(key, value);
        }
        return value;
      }
      return await AsyncStorage.getItem(key);
    } catch (error) {
      console.log(`Error getting ${key} from CloudKit, falling back to AsyncStorage:`, error);
      return await AsyncStorage.getItem(key);
    }
  },

  setItem: async (key: string, value: string): Promise<void> => {
    try {
      // Always save to local AsyncStorage first (for offline access)
      await AsyncStorage.setItem(key, value);
      
      // Then sync to CloudKit on iOS
      if (Platform.OS === 'ios' && CloudKitStorage) {
        await CloudKitStorage.setItem(key, value);
      }
    } catch (error) {
      console.log(`Error saving ${key} to CloudKit:`, error);
      // Data is already in AsyncStorage, so we're safe
    }
  },

  removeItem: async (key: string): Promise<void> => {
    try {
      await AsyncStorage.removeItem(key);
      if (Platform.OS === 'ios' && CloudKitStorage) {
        await CloudKitStorage.removeItem(key);
      }
    } catch (error) {
      console.log(`Error removing ${key}:`, error);
    }
  },
};

// ============ SYNC EVENT LISTENERS ============
// These will be called when data changes on another device

type SyncCallback = (key: string, value: any) => void;
const syncListeners: SyncCallback[] = [];

export const addSyncListener = (callback: SyncCallback) => {
  syncListeners.push(callback);
  
  // Set up CloudKit listeners on iOS
  if (Platform.OS === 'ios' && CloudKitStorage) {
    CloudKitStorage.addListener('change', ({ key, value }: { key: string; value: string }) => {
      console.log('CloudKit change received for:', key);
      // Update local AsyncStorage
      AsyncStorage.setItem(key, value);
      // Notify listeners
      try {
        const parsed = JSON.parse(value);
        syncListeners.forEach(cb => cb(key, parsed));
      } catch (e) {
        syncListeners.forEach(cb => cb(key, value));
      }
    });

    CloudKitStorage.addListener('delete', ({ key }: { key: string }) => {
      console.log('CloudKit delete received for:', key);
      AsyncStorage.removeItem(key);
      syncListeners.forEach(cb => cb(key, null));
    });
  }
};

export const removeSyncListener = (callback: SyncCallback) => {
  const index = syncListeners.indexOf(callback);
  if (index > -1) {
    syncListeners.splice(index, 1);
  }
};

// ============ SYNC STATUS ============
export const SyncService = {
  isCloudKitAvailable: (): boolean => {
    // CloudKit is currently disabled - always return false
    return false;
    // Original: return Platform.OS === 'ios' && CloudKitStorage !== null && !cloudKitFailed;
  },

  getLastSyncTime: async (): Promise<string | null> => {
    return await AsyncStorage.getItem(KEYS.SYNC_TIMESTAMP);
  },

  updateSyncTime: async (): Promise<void> => {
    await AsyncStorage.setItem(KEYS.SYNC_TIMESTAMP, new Date().toISOString());
  },

  // Force sync all data to CloudKit
  forceSyncAll: async (): Promise<void> => {
    if (!SyncService.isCloudKitAvailable()) return;

    const allKeys = Object.values(KEYS);
    for (const key of allKeys) {
      try {
        const localData = await AsyncStorage.getItem(key);
        if (localData && CloudKitStorage) {
          await CloudKitStorage.setItem(key, localData);
        }
      } catch (error) {
        console.log(`Error syncing ${key}:`, error);
      }
    }
    await SyncService.updateSyncTime();
  },

  // Pull all data from CloudKit
  pullFromCloud: async (): Promise<void> => {
    if (!SyncService.isCloudKitAvailable()) return;

    const allKeys = Object.values(KEYS);
    for (const key of allKeys) {
      try {
        if (CloudKitStorage) {
          const cloudData = await CloudKitStorage.getItem(key);
          if (cloudData) {
            await AsyncStorage.setItem(key, cloudData);
          }
        }
      } catch (error) {
        console.log(`Error pulling ${key} from cloud:`, error);
      }
    }
    await SyncService.updateSyncTime();
  },
};

// Generic CRUD operations using unified storage
const getItems = async <T>(key: string): Promise<T[]> => {
  try {
    const data = await storage.getItem(key);
    return data ? JSON.parse(data) : [];
  } catch (error) {
    console.error(`Error getting ${key}:`, error);
    return [];
  }
};

const setItems = async <T>(key: string, items: T[]): Promise<void> => {
  try {
    await storage.setItem(key, JSON.stringify(items));
  } catch (error) {
    console.error(`Error setting ${key}:`, error);
  }
};

// ============ CUSTOMERS ============
export interface Customer {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export const CustomerService = {
  getAll: async (): Promise<Customer[]> => {
    return getItems<Customer>(KEYS.CUSTOMERS);
  },

  getById: async (id: string): Promise<Customer | null> => {
    const customers = await getItems<Customer>(KEYS.CUSTOMERS);
    return customers.find(c => c.id === id) || null;
  },

  create: async (data: Omit<Customer, 'id' | 'created_at' | 'updated_at'>): Promise<Customer> => {
    const customers = await getItems<Customer>(KEYS.CUSTOMERS);
    const newCustomer: Customer = {
      ...data,
      id: generateId(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    customers.push(newCustomer);
    await setItems(KEYS.CUSTOMERS, customers);
    return newCustomer;
  },

  update: async (id: string, data: Partial<Customer>): Promise<Customer | null> => {
    const customers = await getItems<Customer>(KEYS.CUSTOMERS);
    const index = customers.findIndex(c => c.id === id);
    if (index === -1) return null;
    customers[index] = { ...customers[index], ...data, updated_at: new Date().toISOString() };
    await setItems(KEYS.CUSTOMERS, customers);
    return customers[index];
  },

  delete: async (id: string): Promise<boolean> => {
    const customers = await getItems<Customer>(KEYS.CUSTOMERS);
    const filtered = customers.filter(c => c.id !== id);
    await setItems(KEYS.CUSTOMERS, filtered);
    return true;
  },
};

// ============ PROJECTS ============
export interface Project {
  id: string;
  customer_id: string;
  name: string;
  description?: string;
  address?: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export const ProjectService = {
  getAll: async (): Promise<Project[]> => {
    return getItems<Project>(KEYS.PROJECTS);
  },

  getById: async (id: string): Promise<Project | null> => {
    const projects = await getItems<Project>(KEYS.PROJECTS);
    return projects.find(p => p.id === id) || null;
  },

  getByCustomerId: async (customerId: string): Promise<Project[]> => {
    const projects = await getItems<Project>(KEYS.PROJECTS);
    return projects.filter(p => p.customer_id === customerId);
  },

  create: async (data: Omit<Project, 'id' | 'created_at' | 'updated_at'>): Promise<Project> => {
    const projects = await getItems<Project>(KEYS.PROJECTS);
    const newProject: Project = {
      ...data,
      id: generateId(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    projects.push(newProject);
    await setItems(KEYS.PROJECTS, projects);
    return newProject;
  },

  update: async (id: string, data: Partial<Project>): Promise<Project | null> => {
    const projects = await getItems<Project>(KEYS.PROJECTS);
    const index = projects.findIndex(p => p.id === id);
    if (index === -1) return null;
    projects[index] = { ...projects[index], ...data, updated_at: new Date().toISOString() };
    await setItems(KEYS.PROJECTS, projects);
    return projects[index];
  },

  delete: async (id: string): Promise<boolean> => {
    const projects = await getItems<Project>(KEYS.PROJECTS);
    const filtered = projects.filter(p => p.id !== id);
    await setItems(KEYS.PROJECTS, filtered);
    // Also delete related data
    const sketches = await getItems<Sketch>(KEYS.SKETCHES);
    await setItems(KEYS.SKETCHES, sketches.filter(s => s.project_id !== id));
    const photos = await getItems<Photo>(KEYS.PHOTOS);
    await setItems(KEYS.PHOTOS, photos.filter(p => p.project_id !== id));
    const roofs = await getItems<Roof>(KEYS.ROOFS);
    await setItems(KEYS.ROOFS, roofs.filter(r => r.project_id !== id));
    const checklists = await getItems<Checklist>(KEYS.CHECKLISTS);
    await setItems(KEYS.CHECKLISTS, checklists.filter(c => c.project_id !== id));
    return true;
  },
};

// ============ SKETCHES ============
export interface Sketch {
  id: string;
  project_id: string;
  name: string;
  data?: any;
  thumbnail?: string;
  created_at: string;
  updated_at: string;
}

export const SketchService = {
  getAll: async (): Promise<Sketch[]> => {
    return getItems<Sketch>(KEYS.SKETCHES);
  },

  getById: async (id: string): Promise<Sketch | null> => {
    const sketches = await getItems<Sketch>(KEYS.SKETCHES);
    return sketches.find(s => s.id === id) || null;
  },

  getByProjectId: async (projectId: string): Promise<Sketch[]> => {
    const sketches = await getItems<Sketch>(KEYS.SKETCHES);
    return sketches.filter(s => s.project_id === projectId);
  },

  create: async (data: Omit<Sketch, 'id' | 'created_at' | 'updated_at'>): Promise<Sketch> => {
    const sketches = await getItems<Sketch>(KEYS.SKETCHES);
    const newSketch: Sketch = {
      ...data,
      id: generateId(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    sketches.push(newSketch);
    await setItems(KEYS.SKETCHES, sketches);
    return newSketch;
  },

  update: async (id: string, data: Partial<Sketch>): Promise<Sketch | null> => {
    const sketches = await getItems<Sketch>(KEYS.SKETCHES);
    const index = sketches.findIndex(s => s.id === id);
    if (index === -1) return null;
    sketches[index] = { ...sketches[index], ...data, updated_at: new Date().toISOString() };
    await setItems(KEYS.SKETCHES, sketches);
    return sketches[index];
  },

  delete: async (id: string): Promise<boolean> => {
    const sketches = await getItems<Sketch>(KEYS.SKETCHES);
    const filtered = sketches.filter(s => s.id !== id);
    await setItems(KEYS.SKETCHES, filtered);
    return true;
  },
};

// ============ PHOTOS ============
export interface Photo {
  id: string;
  project_id: string;
  uri: string;
  thumbnail?: string;
  annotations?: any[];
  description?: string;
  created_at: string;
  updated_at: string;
}

export const PhotoService = {
  getAll: async (): Promise<Photo[]> => {
    return getItems<Photo>(KEYS.PHOTOS);
  },

  getById: async (id: string): Promise<Photo | null> => {
    const photos = await getItems<Photo>(KEYS.PHOTOS);
    return photos.find(p => p.id === id) || null;
  },

  getByProjectId: async (projectId: string): Promise<Photo[]> => {
    const photos = await getItems<Photo>(KEYS.PHOTOS);
    return photos.filter(p => p.project_id === projectId);
  },

  create: async (data: Omit<Photo, 'id' | 'created_at' | 'updated_at'>): Promise<Photo> => {
    const photos = await getItems<Photo>(KEYS.PHOTOS);
    const newPhoto: Photo = {
      ...data,
      id: generateId(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    photos.push(newPhoto);
    await setItems(KEYS.PHOTOS, photos);
    return newPhoto;
  },

  update: async (id: string, data: Partial<Photo>): Promise<Photo | null> => {
    const photos = await getItems<Photo>(KEYS.PHOTOS);
    const index = photos.findIndex(p => p.id === id);
    if (index === -1) return null;
    photos[index] = { ...photos[index], ...data, updated_at: new Date().toISOString() };
    await setItems(KEYS.PHOTOS, photos);
    return photos[index];
  },

  delete: async (id: string): Promise<boolean> => {
    const photos = await getItems<Photo>(KEYS.PHOTOS);
    const filtered = photos.filter(p => p.id !== id);
    await setItems(KEYS.PHOTOS, filtered);
    return true;
  },
};

// ============ ROOFS ============
export interface Roof {
  id: string;
  project_id: string;
  name: string;
  roof_type?: string;
  measurements?: any;
  area?: number;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export const RoofService = {
  getAll: async (): Promise<Roof[]> => {
    return getItems<Roof>(KEYS.ROOFS);
  },

  getById: async (id: string): Promise<Roof | null> => {
    const roofs = await getItems<Roof>(KEYS.ROOFS);
    return roofs.find(r => r.id === id) || null;
  },

  getByProjectId: async (projectId: string): Promise<Roof[]> => {
    const roofs = await getItems<Roof>(KEYS.ROOFS);
    return roofs.filter(r => r.project_id === projectId);
  },

  create: async (data: Omit<Roof, 'id' | 'created_at' | 'updated_at'>): Promise<Roof> => {
    const roofs = await getItems<Roof>(KEYS.ROOFS);
    const newRoof: Roof = {
      ...data,
      id: generateId(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    roofs.push(newRoof);
    await setItems(KEYS.ROOFS, roofs);
    return newRoof;
  },

  update: async (id: string, data: Partial<Roof>): Promise<Roof | null> => {
    const roofs = await getItems<Roof>(KEYS.ROOFS);
    const index = roofs.findIndex(r => r.id === id);
    if (index === -1) return null;
    roofs[index] = { ...roofs[index], ...data, updated_at: new Date().toISOString() };
    await setItems(KEYS.ROOFS, roofs);
    return roofs[index];
  },

  delete: async (id: string): Promise<boolean> => {
    const roofs = await getItems<Roof>(KEYS.ROOFS);
    const filtered = roofs.filter(r => r.id !== id);
    await setItems(KEYS.ROOFS, filtered);
    return true;
  },
};

// ============ CHECKLISTS ============
export interface ChecklistItem {
  text: string;
  checked: boolean;
  note?: string;
  subItems?: ChecklistItem[];
}

export interface Checklist {
  id: string;
  project_id: string;
  template_id: string;
  template_name: string;
  items: ChecklistItem[];
  created_at: string;
  updated_at: string;
}

export const ChecklistService = {
  getAll: async (): Promise<Checklist[]> => {
    return getItems<Checklist>(KEYS.CHECKLISTS);
  },

  getById: async (id: string): Promise<Checklist | null> => {
    const checklists = await getItems<Checklist>(KEYS.CHECKLISTS);
    return checklists.find(c => c.id === id) || null;
  },

  getByProjectId: async (projectId: string): Promise<Checklist[]> => {
    const checklists = await getItems<Checklist>(KEYS.CHECKLISTS);
    return checklists.filter(c => c.project_id === projectId);
  },

  create: async (data: Omit<Checklist, 'id' | 'created_at' | 'updated_at'>): Promise<Checklist> => {
    const checklists = await getItems<Checklist>(KEYS.CHECKLISTS);
    const newChecklist: Checklist = {
      ...data,
      id: generateId(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    checklists.push(newChecklist);
    await setItems(KEYS.CHECKLISTS, checklists);
    return newChecklist;
  },

  update: async (id: string, data: Partial<Checklist>): Promise<Checklist | null> => {
    const checklists = await getItems<Checklist>(KEYS.CHECKLISTS);
    const index = checklists.findIndex(c => c.id === id);
    if (index === -1) return null;
    checklists[index] = { ...checklists[index], ...data, updated_at: new Date().toISOString() };
    await setItems(KEYS.CHECKLISTS, checklists);
    return checklists[index];
  },

  delete: async (id: string): Promise<boolean> => {
    const checklists = await getItems<Checklist>(KEYS.CHECKLISTS);
    const filtered = checklists.filter(c => c.id !== id);
    await setItems(KEYS.CHECKLISTS, filtered);
    return true;
  },
};

// ============ CHECKLIST TEMPLATES ============
export interface ChecklistTemplate {
  id: string;
  name: string;
  items: any[];
  created_at: string;
  updated_at: string;
}

export const ChecklistTemplateService = {
  getAll: async (): Promise<ChecklistTemplate[]> => {
    const templates = await getItems<ChecklistTemplate>(KEYS.CHECKLIST_TEMPLATES);
    // Return default templates if none exist
    if (templates.length === 0) {
      const defaultTemplates: ChecklistTemplate[] = [
        {
          id: 'default-1',
          name: 'Dachinspektion',
          items: [
            { text: 'Dachziegel prüfen', subItems: [] },
            { text: 'Dachrinne prüfen', subItems: [] },
            { text: 'Schornstein prüfen', subItems: [] },
            { text: 'Dachfenster prüfen', subItems: [] },
          ],
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        {
          id: 'default-2',
          name: 'Aufmaß Standard',
          items: [
            { text: 'Dachfläche vermessen', subItems: [] },
            { text: 'Traufhöhe messen', subItems: [] },
            { text: 'Firsthöhe messen', subItems: [] },
            { text: 'Dachneigung bestimmen', subItems: [] },
          ],
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ];
      await setItems(KEYS.CHECKLIST_TEMPLATES, defaultTemplates);
      return defaultTemplates;
    }
    return templates;
  },

  getById: async (id: string): Promise<ChecklistTemplate | null> => {
    const templates = await ChecklistTemplateService.getAll();
    return templates.find(t => t.id === id) || null;
  },

  create: async (data: Omit<ChecklistTemplate, 'id' | 'created_at' | 'updated_at'>): Promise<ChecklistTemplate> => {
    const templates = await getItems<ChecklistTemplate>(KEYS.CHECKLIST_TEMPLATES);
    const newTemplate: ChecklistTemplate = {
      ...data,
      id: generateId(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    templates.push(newTemplate);
    await setItems(KEYS.CHECKLIST_TEMPLATES, templates);
    return newTemplate;
  },

  update: async (id: string, data: Partial<ChecklistTemplate>): Promise<ChecklistTemplate | null> => {
    const templates = await getItems<ChecklistTemplate>(KEYS.CHECKLIST_TEMPLATES);
    const index = templates.findIndex(t => t.id === id);
    if (index === -1) return null;
    templates[index] = { ...templates[index], ...data, updated_at: new Date().toISOString() };
    await setItems(KEYS.CHECKLIST_TEMPLATES, templates);
    return templates[index];
  },

  delete: async (id: string): Promise<boolean> => {
    const templates = await getItems<ChecklistTemplate>(KEYS.CHECKLIST_TEMPLATES);
    const filtered = templates.filter(t => t.id !== id);
    await setItems(KEYS.CHECKLIST_TEMPLATES, filtered);
    return true;
  },
};

// ============ SETTINGS ============
export interface Settings {
  company_name?: string;
  company_address?: string;
  company_phone?: string;
  company_email?: string;
  company_logo?: string;
  tax_rate?: number;
}

export const SettingsService = {
  get: async (): Promise<Settings> => {
    try {
      const data = await storage.getItem(KEYS.SETTINGS);
      return data ? JSON.parse(data) : {};
    } catch (error) {
      console.error('Error getting settings:', error);
      return {};
    }
  },

  update: async (data: Settings): Promise<Settings> => {
    try {
      const current = await SettingsService.get();
      const updated = { ...current, ...data };
      await storage.setItem(KEYS.SETTINGS, JSON.stringify(updated));
      return updated;
    } catch (error) {
      console.error('Error updating settings:', error);
      return data;
    }
  },
};

// Export all services
export const LocalStorage = {
  Customers: CustomerService,
  Projects: ProjectService,
  Sketches: SketchService,
  Photos: PhotoService,
  Roofs: RoofService,
  Checklists: ChecklistService,
  ChecklistTemplates: ChecklistTemplateService,
  Settings: SettingsService,
  Sync: SyncService,
};

export default LocalStorage;

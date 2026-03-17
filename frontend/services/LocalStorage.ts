import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

// CloudKit storage disabled for now - using AsyncStorage only
// The iCloud integration requires additional native configuration
let CloudKitStorage: any = null;

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
  DOCUMENTS: 'aufmassprofi_documents',
  AREA_CALCULATIONS: 'aufmassprofi_area_calculations',
  LINE_CATEGORIES: 'aufmassprofi_line_categories',
  TEXT_SHORTCUTS: 'aufmassprofi_text_shortcuts',
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
    return Platform.OS === 'ios' && CloudKitStorage !== null;
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
export interface ProjectAddress {
  id: string;
  object_number?: string; // OBJ-26001 format - auto-generated
  name: string; // Bezeichnung z.B. "Haupthaus", "Garage"
  description?: string; // Beschreibung
  objectName?: string; // Objektname
  street: string;
  zip: string;
  city: string;
  contactPerson?: string; // Ansprechpartner
  phone?: string; // Telefonnummer
  email?: string; // E-Mail
}

export interface Customer {
  id: string;
  // Neues erweitertes Format
  salutation?: string; // Anrede: Herr, Frau, Firma, etc.
  firstName?: string; // Vorname
  lastName?: string; // Nachname
  name: string; // Vollständiger Name (automatisch generiert für Abwärtskompatibilität)
  email?: string;
  phone?: string;
  mobile?: string;
  street?: string; // Straße
  zip?: string; // PLZ
  city?: string; // Ort
  address?: string; // Legacy: kombinierte Adresse (für Abwärtskompatibilität)
  notes?: string;
  customer_number?: string; // KD-25001 format - auto-generated
  importedContactId?: string; // ID des importierten Telefonkontakts für Synchronisation
  projectAddresses?: ProjectAddress[]; // Array von Projektadressen
  created_at: string;
  updated_at: string;
}

// Helper-Funktion zum Generieren des vollständigen Namens
export function generateFullName(salutation?: string, firstName?: string, lastName?: string): string {
  const parts = [salutation, firstName, lastName].filter(Boolean);
  return parts.join(' ');
}

// Helper-Funktion zum Generieren der kombinierten Adresse
export function generateFullAddress(street?: string, zip?: string, city?: string): string {
  const addressLine = street || '';
  const cityLine = [zip, city].filter(Boolean).join(' ');
  return [addressLine, cityLine].filter(Boolean).join(', ');
}

// Helper function to generate next customer number
const generateCustomerNumber = async (): Promise<string> => {
  const yearPrefix = new Date().getFullYear().toString().slice(-2); // e.g., "26" for 2026
  const prefix = `KD-${yearPrefix}`;
  
  const customers = await getItems<Customer>(KEYS.CUSTOMERS);
  
  // Collect all existing numbers
  const existingNumbers: number[] = [];
  for (const c of customers) {
    if (c.customer_number?.startsWith(prefix)) {
      const numPart = c.customer_number.substring(prefix.length);
      const num = parseInt(numPart, 10);
      if (!isNaN(num)) {
        existingNumbers.push(num);
      }
    }
  }
  
  // Find the next available number (not just max + 1, but first gap or max + 1)
  const maxNum = existingNumbers.length > 0 ? Math.max(...existingNumbers) : 0;
  const nextNum = maxNum + 1;
  
  console.log(`[generateCustomerNumber] Existing numbers: ${existingNumbers.join(', ')}, Next: ${nextNum}`);
  
  return `${prefix}${String(nextNum).padStart(3, '0')}`;
};

// Helper function to generate next project number
const generateProjectNumber = async (): Promise<string> => {
  const yearPrefix = new Date().getFullYear().toString().slice(-2); // e.g., "26" for 2026
  const prefix = `PR-${yearPrefix}`;
  
  const projects = await getItems<Project>(KEYS.PROJECTS);
  const existingNumbers = projects
    .filter(p => p.project_number?.startsWith(prefix))
    .map(p => {
      const numPart = p.project_number?.substring(prefix.length) || '0';
      return parseInt(numPart, 10) || 0;
    });
  
  const maxNum = existingNumbers.length > 0 ? Math.max(...existingNumbers) : 0;
  return `${prefix}${String(maxNum + 1).padStart(3, '0')}`;
};

// Helper function to generate next object number
export const generateObjectNumber = async (): Promise<string> => {
  const yearPrefix = new Date().getFullYear().toString().slice(-2); // e.g., "26" for 2026
  const prefix = `OBJ-${yearPrefix}`;
  
  const customers = await getItems<Customer>(KEYS.CUSTOMERS);
  const existingNumbers: number[] = [];
  
  // Collect all object numbers from all customers' project addresses
  for (const customer of customers) {
    const addresses = customer.projectAddresses || [];
    for (const addr of addresses) {
      if (addr.object_number?.startsWith(prefix)) {
        const numPart = addr.object_number.substring(prefix.length);
        const num = parseInt(numPart, 10);
        if (!isNaN(num)) {
          existingNumbers.push(num);
        }
      }
    }
  }
  
  const maxNum = existingNumbers.length > 0 ? Math.max(...existingNumbers) : 0;
  return `${prefix}${String(maxNum + 1).padStart(3, '0')}`;
};

// Generate object number for a specific customer (sequential per customer)
// Jeder Kunde startet bei OBJ-26001, OBJ-26002, etc.
export const generateObjectNumberForCustomer = async (customerId: string): Promise<string> => {
  const yearPrefix = new Date().getFullYear().toString().slice(-2);
  const prefix = `OBJ-${yearPrefix}`;
  
  const customer = await getItems<Customer>(KEYS.CUSTOMERS).then(
    customers => customers.find(c => c.id === customerId)
  );
  
  if (!customer) {
    // Neuer Kunde ohne Adressen - starte bei 001
    return `${prefix}001`;
  }
  
  const addresses = customer.projectAddresses || [];
  
  // Wenn Kunde keine Adressen hat, starte bei 001
  if (addresses.length === 0) {
    return `${prefix}001`;
  }
  
  const existingNumbers = addresses
    .filter(addr => addr.object_number?.startsWith(prefix))
    .map(addr => {
      const numPart = addr.object_number?.substring(prefix.length) || '0';
      return parseInt(numPart, 10) || 0;
    })
    .filter(num => num > 0);
  
  // Wenn keine gültigen Nummern gefunden, starte bei 001
  if (existingNumbers.length === 0) {
    return `${prefix}001`;
  }
  
  const maxNum = Math.max(...existingNumbers);
  console.log(`[generateObjectNumberForCustomer] Customer: ${customerId}, existing: ${existingNumbers.join(',')}, next: ${maxNum + 1}`);
  return `${prefix}${String(maxNum + 1).padStart(3, '0')}`;
};

// ============ NUMBER VALIDATION FUNCTIONS ============
// Check if customer number already exists
export const isCustomerNumberDuplicate = async (number: string, excludeId?: string): Promise<boolean> => {
  const customers = await getItems<Customer>(KEYS.CUSTOMERS);
  console.log('[DEBUG] isCustomerNumberDuplicate - checking:', number, 'exclude:', excludeId);
  console.log('[DEBUG] All customer numbers:', customers.map(c => ({ id: c.id, num: c.customer_number })));
  
  const result = customers.some(c => c.customer_number === number && c.id !== excludeId);
  console.log('[DEBUG] isCustomerNumberDuplicate - result:', result);
  return result;
};

// Check if project number already exists
export const isProjectNumberDuplicate = async (number: string, excludeId?: string): Promise<boolean> => {
  const projects = await getItems<Project>(KEYS.PROJECTS);
  return projects.some(p => p.project_number === number && p.id !== excludeId);
};

// Check if object number already exists WITHIN A CUSTOMER (not globally)
// Each customer can have their own sequence: OBJ-26001, OBJ-26002, etc.
export const isObjectNumberDuplicate = async (
  number: string, 
  customerId: string, 
  excludeAddressId?: string
): Promise<boolean> => {
  const customers = await getItems<Customer>(KEYS.CUSTOMERS);
  const customer = customers.find(c => c.id === customerId);
  
  if (!customer) return false;
  
  const addresses = customer.projectAddresses || [];
  for (const addr of addresses) {
    if (addr.object_number === number) {
      // If we're updating, exclude the current address
      if (excludeAddressId && addr.id === excludeAddressId) {
        continue;
      }
      return true;
    }
  }
  return false;
};

// Check if object number exists in ANY customer (for project objekt_number field)
export const isObjectNumberDuplicateInProject = async (
  number: string,
  customerId: string,
  currentProjectId?: string
): Promise<boolean> => {
  // First check if it exists in the customer's addresses
  const customers = await getItems<Customer>(KEYS.CUSTOMERS);
  const customer = customers.find(c => c.id === customerId);
  
  if (customer) {
    const addresses = customer.projectAddresses || [];
    const existsInAddresses = addresses.some(addr => addr.object_number === number);
    if (existsInAddresses) {
      // It's fine if it exists in customer's addresses - that's where it should come from
      return false;
    }
  }
  
  // Check if another project (not this customer) uses this number
  const projects = await getItems<Project>(KEYS.PROJECTS);
  for (const proj of projects) {
    if (proj.id === currentProjectId) continue;
    if (proj.customer_id === customerId) continue; // Same customer is OK
    if (proj.objekt_number === number) {
      return true; // Different customer uses this number
    }
  }
  
  return false;
};

// Get next available customer number (avoiding duplicates)
export const getNextAvailableCustomerNumber = async (): Promise<string> => {
  return generateCustomerNumber();
};

// Get next available project number (avoiding duplicates)
export const getNextAvailableProjectNumber = async (): Promise<string> => {
  return generateProjectNumber();
};

// Get next available object number for customer (avoiding duplicates)
export const getNextAvailableObjectNumber = async (customerId?: string): Promise<string> => {
  if (customerId) {
    return generateObjectNumberForCustomer(customerId);
  }
  return generateObjectNumber();
};

// ============ LAST USED PROJECT TYPE ============
const LAST_PROJECT_TYPE_KEY = 'aufmass_last_project_type';

export const setLastUsedProjectType = async (projectType: string): Promise<void> => {
  try {
    await AsyncStorage.setItem(LAST_PROJECT_TYPE_KEY, projectType);
  } catch (error) {
    console.error('Error saving last project type:', error);
  }
};

export const getLastUsedProjectType = async (): Promise<string | null> => {
  try {
    return await AsyncStorage.getItem(LAST_PROJECT_TYPE_KEY);
  } catch (error) {
    console.error('Error loading last project type:', error);
    return null;
  }
};

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
    // Auto-generate customer number if not provided
    const customerNumber = data.customer_number || await generateCustomerNumber();
    const newCustomer: Customer = {
      ...data,
      id: generateId(),
      customer_number: customerNumber,
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
  project_number?: string; // PR-25001 format - auto-generated
  customer_id: string;
  name: string;
  description?: string;
  address?: string;
  status: string;
  // Projektart (Überschrift für PDF)
  project_type?: string; // z.B. "Sturmschaden", "Wartung", "Neueindeckung"
  project_type_date?: string; // Optionales Datum für die Überschrift (ISO-String)
  // Bauherr-Daten
  bauherr_salutation?: string;
  bauherr_firstName?: string;
  bauherr_lastName?: string;
  bauherr_name?: string;
  bauherr_phone?: string;
  bauherr_mobile?: string;
  bauherr_email?: string;
  bauherr_street?: string;
  bauherr_zip?: string;
  bauherr_city?: string;
  bauherr_address?: string;
  // Objektadresse
  objekt_street?: string;
  objekt_plz?: string;
  objekt_city?: string;
  objekt_address_name?: string; // Name der gespeicherten Adresse (z.B. "Haupthaus")
  objekt_name?: string; // Objektname
  objekt_description?: string; // Beschreibung der Objektadresse
  objekt_contact_person?: string; // Ansprechpartner
  objekt_phone?: string; // Telefon
  objekt_email?: string; // E-Mail
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
    // Auto-generate project number if not provided
    const projectNumber = data.project_number || await generateProjectNumber();
    const newProject: Project = {
      ...data,
      id: generateId(),
      project_number: projectNumber,
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
  name?: string;
  title?: string;
  notes?: string;
  sketch_data?: string;
  metadata?: string;
  pdf_size?: string;
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
  image_data?: string;
  thumbnail?: string;
  annotations?: string;
  description?: string;
  pdf_size?: string;
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
  printImage?: string; // Bild für PDF-Druck (Base64)
  previewImages?: string[]; // Bilder für Vorschau-Galerie (nicht gedruckt)
  categoryLogo?: string; // Logo für Kategorien (Base64)
  referenceFolderId?: string; // ID des verknüpften Referenz-Ordners
  referenceFolderName?: string; // Name des verknüpften Referenz-Ordners (für Anzeige)
}

export interface Checklist {
  id: string;
  project_id: string;
  template_id: string;
  template_name: string;
  templateLogo?: string; // Logo der Vorlage (Base64)
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
  templateLogo?: string;
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

  // Alle Templates auf einmal speichern (für Sortierung)
  saveAll: async (templates: ChecklistTemplate[]): Promise<void> => {
    await setItems(KEYS.CHECKLIST_TEMPLATES, templates);
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
  // Projektart-Überschriften (für Auswahlfeld)
  project_type_options?: string[]; // z.B. ["Sturmschaden", "Wartung", "Neueindeckung", "Reparatur"]
  // PDF Layout Größen
  pdf_header_size?: 'small' | 'medium' | 'large';
  pdf_project_type_size?: 'small' | 'medium' | 'large';
  pdf_tools_size?: 'small' | 'medium' | 'large';
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

// ============ DOCUMENTS (PDF with annotations) ============
export interface DocumentPage {
  pageNumber: number;
  imageData: string; // Base64 image of the PDF page
  annotations?: string; // JSON string with drawing paths
  textAnnotations?: TextAnnotation[]; // Text notes on this page
}

export interface TextAnnotation {
  id: string;
  x: number;
  y: number;
  text: string;
  color: string;
  fontSize: number;
}

export interface Document {
  id: string;
  project_id: string;
  name: string;
  originalPdfData?: string; // Base64 of original PDF (optional, for re-rendering)
  pages: DocumentPage[];
  created_at: string;
  updated_at: string;
}

export const DocumentService = {
  getAll: async (): Promise<Document[]> => {
    return getItems<Document>(KEYS.DOCUMENTS);
  },

  getByProjectId: async (projectId: string): Promise<Document[]> => {
    const documents = await getItems<Document>(KEYS.DOCUMENTS);
    return documents.filter((doc) => doc.project_id === projectId);
  },

  getById: async (id: string): Promise<Document | null> => {
    const documents = await getItems<Document>(KEYS.DOCUMENTS);
    return documents.find((doc) => doc.id === id) || null;
  },

  create: async (data: Omit<Document, 'id' | 'created_at' | 'updated_at'>): Promise<Document> => {
    const documents = await getItems<Document>(KEYS.DOCUMENTS);
    const newDocument: Document = {
      ...data,
      id: generateId(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    documents.push(newDocument);
    await setItems(KEYS.DOCUMENTS, documents);
    return newDocument;
  },

  update: async (id: string, data: Partial<Document>): Promise<Document | null> => {
    const documents = await getItems<Document>(KEYS.DOCUMENTS);
    const index = documents.findIndex((doc) => doc.id === id);
    if (index !== -1) {
      documents[index] = {
        ...documents[index],
        ...data,
        updated_at: new Date().toISOString(),
      };
      await setItems(KEYS.DOCUMENTS, documents);
      return documents[index];
    }
    return null;
  },

  updatePage: async (documentId: string, pageNumber: number, pageData: Partial<DocumentPage>): Promise<Document | null> => {
    const documents = await getItems<Document>(KEYS.DOCUMENTS);
    const docIndex = documents.findIndex((doc) => doc.id === documentId);
    if (docIndex !== -1) {
      let pageIndex = documents[docIndex].pages.findIndex((p) => p.pageNumber === pageNumber);
      
      // If page doesn't exist, create it
      if (pageIndex === -1) {
        const newPage: DocumentPage = {
          pageNumber,
          annotations: '',
          ...pageData,
        };
        documents[docIndex].pages.push(newPage);
        pageIndex = documents[docIndex].pages.length - 1;
      } else {
        documents[docIndex].pages[pageIndex] = {
          ...documents[docIndex].pages[pageIndex],
          ...pageData,
        };
      }
      
      documents[docIndex].updated_at = new Date().toISOString();
      await setItems(KEYS.DOCUMENTS, documents);
      return documents[docIndex];
    }
    return null;
  },

  delete: async (id: string): Promise<void> => {
    const documents = await getItems<Document>(KEYS.DOCUMENTS);
    const filtered = documents.filter((doc) => doc.id !== id);
    await setItems(KEYS.DOCUMENTS, filtered);
  },
};

// ============ AREA CALCULATION (Flächen-Kalkulator) ============

export interface AreaPoint {
  x: number;
  y: number;
}

export interface AreaPolygon {
  id: string;
  points: AreaPoint[];
  type: 'main' | 'deduction'; // Hauptfläche oder Abzug (Fenster/Tür)
  name?: string; // z.B. "Giebel", "Fenster 1"
  color?: string;
}

export interface AreaLine {
  id: string;
  polygonId: string;
  pointIndex: number; // Index des Startpunkts der Linie im Polygon
  category: string; // z.B. "Traufe", "Ortgang", "Fensterumfang"
  length: number; // Berechnete Länge in Realmaßen
}

export interface AreaCalculation {
  id: string;
  project_id: string; // Zugehöriges Projekt
  name: string;
  // Maßstab
  scale: number; // Pixel pro Meter (z.B. 100 = 100px entspricht 1m)
  scaleReference?: {
    startPoint: AreaPoint;
    endPoint: AreaPoint;
    realLength: number; // Echte Länge in Metern
  };
  // Gezeichnete Elemente
  polygons: AreaPolygon[];
  lines: AreaLine[];
  // Hintergrundbild (optional)
  backgroundImage?: string;
  // Annotationen (Texte, Notizen, Formen)
  annotations?: {
    shapes?: Array<{
      id: string;
      type: 'rect' | 'circle' | 'arrow' | 'line';
      startPoint: AreaPoint;
      endPoint: AreaPoint;
      color: string;
      strokeWidth: number;
    }>;
    texts?: Array<{
      id: string;
      position: AreaPoint;
      text: string;
      color: string;
      fontSize: number;
    }>;
    memos?: Array<{
      id: string;
      anchorPoint: AreaPoint;
      labelOffset: AreaPoint;
      text: string;
      color: string;
    }>;
  };
  // Raster-Einstellungen
  gridEnabled: boolean;
  gridSize: number; // Größe eines Rasterfelds in Metern
  // Ergebnisse (berechnet)
  results?: {
    totalArea: number;
    deductionArea: number;
    netArea: number;
    linesByCategory: { [category: string]: number };
  };
  // Metadaten
  created_at: string;
  updated_at: string;
}

export interface LineCategory {
  id: string;
  name: string;
  color: string;
  order: number;
  shortcut?: string;  // Optionales Kürzel, z.B. "TR" für Traufe
}

// Default-Linien-Kategorien mit Kürzeln
const DEFAULT_LINE_CATEGORIES: Omit<LineCategory, 'id'>[] = [
  { name: 'Traufe', color: '#2196F3', order: 1, shortcut: 'TR' },
  { name: 'Ortgang', color: '#4CAF50', order: 2, shortcut: 'OG' },
  { name: 'First', color: '#FF9800', order: 3, shortcut: 'FI' },
  { name: 'Kehle', color: '#9C27B0', order: 4, shortcut: 'KE' },
  { name: 'Grat', color: '#E91E63', order: 5, shortcut: 'GR' },
  { name: 'Fensterumfang', color: '#00BCD4', order: 6, shortcut: 'FU' },
  { name: 'Türumfang', color: '#795548', order: 7, shortcut: 'TU' },
  { name: 'Rinne', color: '#607D8B', order: 8, shortcut: 'RI' },
  { name: 'Fallrohr', color: '#3F51B5', order: 9, shortcut: 'FR' },
];

export const LineCategoryService = {
  getAll: async (): Promise<LineCategory[]> => {
    let categories = await getItems<LineCategory>(KEYS.LINE_CATEGORIES);
    // Wenn leer, Default-Kategorien erstellen
    if (categories.length === 0) {
      categories = DEFAULT_LINE_CATEGORIES.map((cat, index) => ({
        ...cat,
        id: generateId(),
      }));
      await setItems(KEYS.LINE_CATEGORIES, categories);
    }
    return categories.sort((a, b) => a.order - b.order);
  },

  create: async (data: Omit<LineCategory, 'id'>): Promise<LineCategory> => {
    const categories = await getItems<LineCategory>(KEYS.LINE_CATEGORIES);
    const newCategory: LineCategory = {
      ...data,
      id: generateId(),
    };
    categories.push(newCategory);
    await setItems(KEYS.LINE_CATEGORIES, categories);
    return newCategory;
  },

  update: async (id: string, data: Partial<LineCategory>): Promise<LineCategory | null> => {
    const categories = await getItems<LineCategory>(KEYS.LINE_CATEGORIES);
    const index = categories.findIndex((c) => c.id === id);
    if (index !== -1) {
      categories[index] = { ...categories[index], ...data };
      await setItems(KEYS.LINE_CATEGORIES, categories);
      return categories[index];
    }
    return null;
  },

  delete: async (id: string): Promise<void> => {
    const categories = await getItems<LineCategory>(KEYS.LINE_CATEGORIES);
    const filtered = categories.filter((c) => c.id !== id);
    await setItems(KEYS.LINE_CATEGORIES, filtered);
  },

  saveAll: async (categories: LineCategory[]): Promise<void> => {
    await setItems(KEYS.LINE_CATEGORIES, categories);
  },
};

// ============ TEXT SHORTCUTS (Kürzel) ============
export interface TextShortcut {
  id: string;
  shortcut: string;  // z.B. "DN"
  fullText: string;  // z.B. "Dachneigung"
  order: number;
}

// Default-Kürzel
const DEFAULT_TEXT_SHORTCUTS: Omit<TextShortcut, 'id'>[] = [
  { shortcut: 'DN', fullText: 'Dachneigung', order: 1 },
  { shortcut: 'SL', fullText: 'Sockelleiste', order: 2 },
  { shortcut: 'TH', fullText: 'Traufhöhe', order: 3 },
  { shortcut: 'FH', fullText: 'Firsthöhe', order: 4 },
  { shortcut: 'DL', fullText: 'Dachlänge', order: 5 },
  { shortcut: 'DB', fullText: 'Dachbreite', order: 6 },
];

export const TextShortcutService = {
  getAll: async (): Promise<TextShortcut[]> => {
    let shortcuts = await getItems<TextShortcut>(KEYS.TEXT_SHORTCUTS);
    // Wenn leer, Default-Kürzel erstellen
    if (shortcuts.length === 0) {
      shortcuts = DEFAULT_TEXT_SHORTCUTS.map((s) => ({
        ...s,
        id: generateId(),
      }));
      await setItems(KEYS.TEXT_SHORTCUTS, shortcuts);
    }
    return shortcuts.sort((a, b) => a.order - b.order);
  },

  create: async (data: Omit<TextShortcut, 'id'>): Promise<TextShortcut> => {
    const shortcuts = await getItems<TextShortcut>(KEYS.TEXT_SHORTCUTS);
    const newShortcut: TextShortcut = {
      ...data,
      id: generateId(),
    };
    shortcuts.push(newShortcut);
    await setItems(KEYS.TEXT_SHORTCUTS, shortcuts);
    return newShortcut;
  },

  update: async (id: string, data: Partial<TextShortcut>): Promise<TextShortcut | null> => {
    const shortcuts = await getItems<TextShortcut>(KEYS.TEXT_SHORTCUTS);
    const index = shortcuts.findIndex((s) => s.id === id);
    if (index !== -1) {
      shortcuts[index] = { ...shortcuts[index], ...data };
      await setItems(KEYS.TEXT_SHORTCUTS, shortcuts);
      return shortcuts[index];
    }
    return null;
  },

  delete: async (id: string): Promise<void> => {
    const shortcuts = await getItems<TextShortcut>(KEYS.TEXT_SHORTCUTS);
    const filtered = shortcuts.filter((s) => s.id !== id);
    await setItems(KEYS.TEXT_SHORTCUTS, filtered);
  },

  saveAll: async (shortcuts: TextShortcut[]): Promise<void> => {
    await setItems(KEYS.TEXT_SHORTCUTS, shortcuts);
  },

  // Hilfsfunktion: Kürzel im Text finden und ersetzen/markieren
  findShortcut: async (text: string): Promise<TextShortcut | null> => {
    const shortcuts = await getItems<TextShortcut>(KEYS.TEXT_SHORTCUTS);
    const upperText = text.toUpperCase();
    return shortcuts.find(s => s.shortcut.toUpperCase() === upperText) || null;
  },

  // Formatiere für Anzeige: "DN" -> "(DN) Dachneigung"
  formatForDisplay: (shortcut: TextShortcut): string => {
    return `(${shortcut.shortcut}) ${shortcut.fullText}`;
  },
};

export const AreaCalculationService = {
  getAll: async (): Promise<AreaCalculation[]> => {
    return getItems<AreaCalculation>(KEYS.AREA_CALCULATIONS);
  },

  getByProjectId: async (projectId: string): Promise<AreaCalculation[]> => {
    const calculations = await getItems<AreaCalculation>(KEYS.AREA_CALCULATIONS);
    return calculations.filter((c) => c.project_id === projectId);
  },

  getById: async (id: string): Promise<AreaCalculation | null> => {
    const calculations = await getItems<AreaCalculation>(KEYS.AREA_CALCULATIONS);
    return calculations.find((c) => c.id === id) || null;
  },

  create: async (data: Omit<AreaCalculation, 'id' | 'created_at' | 'updated_at'>): Promise<AreaCalculation> => {
    const calculations = await getItems<AreaCalculation>(KEYS.AREA_CALCULATIONS);
    const newCalculation: AreaCalculation = {
      ...data,
      id: generateId(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    calculations.push(newCalculation);
    await setItems(KEYS.AREA_CALCULATIONS, calculations);
    return newCalculation;
  },

  update: async (id: string, data: Partial<AreaCalculation>): Promise<AreaCalculation | null> => {
    const calculations = await getItems<AreaCalculation>(KEYS.AREA_CALCULATIONS);
    const index = calculations.findIndex((c) => c.id === id);
    if (index !== -1) {
      calculations[index] = {
        ...calculations[index],
        ...data,
        updated_at: new Date().toISOString(),
      };
      await setItems(KEYS.AREA_CALCULATIONS, calculations);
      return calculations[index];
    }
    return null;
  },

  delete: async (id: string): Promise<void> => {
    const calculations = await getItems<AreaCalculation>(KEYS.AREA_CALCULATIONS);
    const filtered = calculations.filter((c) => c.id !== id);
    await setItems(KEYS.AREA_CALCULATIONS, filtered);
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
  Documents: DocumentService,
  AreaCalculations: AreaCalculationService,
  LineCategories: LineCategoryService,
  TextShortcuts: TextShortcutService,
};

export default LocalStorage;

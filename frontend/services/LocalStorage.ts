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
  REPORTS: 'aufmassprofi_reports',
  EMPLOYEES: 'aufmassprofi_employees_master',
  MATERIALS: 'aufmassprofi_materials_master',
  MACHINES: 'aufmassprofi_machines_master',
  MACHINE_CATEGORIES: 'aufmassprofi_machine_categories',
  MATERIAL_CATEGORIES: 'aufmassprofi_material_categories',
  MATERIAL_LOCATIONS: 'aufmassprofi_material_locations',
  MATERIAL_SUPPLIERS: 'aufmassprofi_material_suppliers',
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

// Batch-read multiple keys in ONE native call (much faster than individual reads)
const getMultipleItems = async (keys: string[]): Promise<Map<string, any[]>> => {
  try {
    const startTime = Date.now();
    const pairs = await AsyncStorage.multiGet(keys);
    const result = new Map<string, any[]>();
    for (const [key, value] of pairs) {
      try {
        result.set(key, value ? JSON.parse(value) : []);
      } catch (e) {
        result.set(key, []);
      }
    }
    console.log('[multiGet] Read', keys.length, 'keys in', Date.now() - startTime, 'ms');
    return result;
  } catch (error) {
    console.error('Error in multiGet:', error);
    // Fallback to individual reads
    const result = new Map<string, any[]>();
    for (const key of keys) {
      result.set(key, await getItems(key));
    }
    return result;
  }
};

// Fast project data loader - reads ALL needed data in one native call
export const loadAllProjectDataFast = async (projectId: string): Promise<{
  project: any | null;
  customer: any | null;
  roofs: any[];
  photos: any[];
  sketches: any[];
  checklists: any[];
  documents: any[];
  areaCalculations: any[];
  settings: any | null;
  imagemeterPhotos: any[];
}> => {
  const startTime = Date.now();
  
  // Read ALL keys in ONE native call
  const allData = await getMultipleItems([
    KEYS.PROJECTS,
    KEYS.CUSTOMERS,
    KEYS.ROOFS,
    KEYS.PHOTOS,
    KEYS.SKETCHES,
    KEYS.CHECKLISTS,
    KEYS.DOCUMENTS,
    KEYS.AREA_CALCULATIONS,
    KEYS.SETTINGS,
    'aufmassprofi_imagemeter_photos',
  ]);
  
  const t1 = Date.now();
  
  // Filter data for this project
  const projects = allData.get(KEYS.PROJECTS) || [];
  const project = projects.find((p: any) => p.id === projectId) || null;
  
  let customer = null;
  if (project?.customer_id) {
    const customers = allData.get(KEYS.CUSTOMERS) || [];
    customer = customers.find((c: any) => c.id === project.customer_id) || null;
  }
  
  const roofs = (allData.get(KEYS.ROOFS) || []).filter((r: any) => r.project_id === projectId);
  const photos = (allData.get(KEYS.PHOTOS) || []).filter((p: any) => p.project_id === projectId);
  
  // Bilddaten separat laden (neue Speicherstruktur: photo_img_${id})
  if (photos.length > 0) {
    const photoImageKeys = photos.map((p: any) => `photo_img_${p.id}`);
    try {
      const photoImages = await AsyncStorage.multiGet(photoImageKeys);
      for (let i = 0; i < photos.length; i++) {
        const [, value] = photoImages[i];
        if (value) {
          photos[i].image_data = value;
          photos[i].uri = value;
        }
        // Fallback: Wenn kein separates Bild, aber Inline-Daten vorhanden → OK (alte Fotos)
      }
    } catch (e) {
      console.error('[loadAllProjectDataFast] Error loading photo images:', e);
    }
  }
  
  const sketches = (allData.get(KEYS.SKETCHES) || []).filter((s: any) => s.project_id === projectId);
  
  // Skizzen-Notizen und pdf_size aus separatem Storage laden (sketch_meta_${id})
  // Notizen werden dort gespeichert und sind möglicherweise nicht im Hauptobjekt vorhanden
  if (sketches.length > 0) {
    const sketchMetaKeys = sketches.map((s: any) => `sketch_meta_${s.id}`);
    try {
      const sketchMetas = await AsyncStorage.multiGet(sketchMetaKeys);
      for (let i = 0; i < sketches.length; i++) {
        const [, metaStr] = sketchMetas[i];
        if (metaStr) {
          try {
            const meta = JSON.parse(metaStr);
            // Notizen aus metadata.notes übernehmen
            if (meta.notes) {
              sketches[i].notes = meta.notes;
            }
            // Memo-Elemente UND Pointer-Elemente: Text extrahieren (visuelle Notizen auf der Zeichenfläche)
            if (!sketches[i].notes && meta.elements && Array.isArray(meta.elements)) {
              const noteTexts = meta.elements
                .filter((el: any) => (el.type === 'memo' || el.type === 'pointer') && el.data?.text)
                .map((el: any) => el.data.text.trim())
                .filter((t: string) => t.length > 0);
              if (noteTexts.length > 0) {
                sketches[i].notes = noteTexts.join(' | ');
              }
            }
            // pdf_size aus metadata übernehmen falls nicht bereits vorhanden
            if (!sketches[i].pdf_size && meta.pdf_size) {
              sketches[i].pdf_size = meta.pdf_size;
            }
          } catch (parseErr) {
            // JSON parse error - skip this sketch's metadata
          }
        }
      }
    } catch (e) {
      console.error('[loadAllProjectDataFast] Error loading sketch metadata:', e);
    }
  }
  
  const checklists = await Promise.all(
    ((allData.get(KEYS.CHECKLISTS) || []).filter((c: any) => c.project_id === projectId))
      .map((c: any) => chkRestoreImages(c))
  );
  const documents = (allData.get(KEYS.DOCUMENTS) || []).filter((d: any) => d.project_id === projectId);
  const areaCalculations = (allData.get(KEYS.AREA_CALCULATIONS) || []).filter((a: any) => a.project_id === projectId);
  
  // Settings is an object, not an array
  const settingsArr = allData.get(KEYS.SETTINGS);
  const settings = Array.isArray(settingsArr) && settingsArr.length > 0 ? settingsArr[0] : settingsArr;
  
  const allImPhotos = allData.get('aufmassprofi_imagemeter_photos') || [];
  const imagemeterPhotos = allImPhotos.filter((p: any) => p.projectId === projectId);
  
  console.log('[loadAllProjectDataFast] multiGet + filter in', Date.now() - startTime, 'ms');
  
  return { project, customer, roofs, photos, sketches, checklists, documents, areaCalculations, settings, imagemeterPhotos };
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
  customerType?: string; // Kundentyp: Privat, Firma, Hausverwaltung, etc.
  customerTypeName?: string; // Bezeichnung zum Kundentyp, z.B. "Elektro Mustermann GmbH"
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
    const sketchesToDelete = sketches.filter(s => s.project_id === id);
    await setItems(KEYS.SKETCHES, sketches.filter(s => s.project_id !== id));
    // Clean up separate sketch data keys
    const cleanupOps: Promise<void>[] = [];
    for (const sketch of sketchesToDelete) {
      cleanupOps.push(AsyncStorage.removeItem(`sketch_meta_${sketch.id}`));
      cleanupOps.push(AsyncStorage.removeItem(`sketch_bg_${sketch.id}`));
      // Clean up separately stored image elements
      try {
        const metaStr = await AsyncStorage.getItem(`sketch_meta_${sketch.id}`);
        if (metaStr) {
          const meta = JSON.parse(metaStr);
          if (meta?.elements) {
            for (const el of meta.elements) {
              if (el.data?.imageStorageKey) {
                cleanupOps.push(AsyncStorage.removeItem(el.data.imageStorageKey));
              }
            }
          }
        }
      } catch (e) {
        // Ignore parse errors during cleanup
      }
    }
    if (cleanupOps.length > 0) {
      await Promise.all(cleanupOps);
    }
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

  // Für Projekt-Export: Skizzen inkl. eingebetteter Bearbeitungsdaten
  // (metadata + backgroundImage aus den optimierten Keys). Beim Import
  // splittet create() die Daten automatisch wieder auf.
  getByProjectIdWithData: async (projectId: string): Promise<Sketch[]> => {
    const sketches = await SketchService.getByProjectId(projectId);
    return Promise.all(sketches.map(async (s) => {
      try {
        const { metadata, backgroundImage } = await SketchService.loadSketchData(s.id);
        if (metadata) {
          const full: any = { ...metadata };
          if (backgroundImage) full.backgroundImage = backgroundImage;
          return { ...s, metadata: JSON.stringify(full) };
        }
      } catch (e) {
        console.warn('[SketchService] Export: Skizzen-Daten fehlen für', s.id, e);
      }
      return s;
    }));
  },

  // ---- OPTIMIZED: Load heavy sketch data from separate storage keys ----
  // This avoids parsing all sketches just to load one sketch's elements/background
  loadSketchData: async (id: string): Promise<{ metadata: any | null; backgroundImage: string | null }> => {
    try {
      // Try loading from separate optimized keys first
      const [metaStr, bgImage] = await Promise.all([
        AsyncStorage.getItem(`sketch_meta_${id}`),
        AsyncStorage.getItem(`sketch_bg_${id}`),
      ]);

      if (metaStr) {
        // Found in optimized storage - parse with error handling
        let metadata: any;
        try {
          metadata = JSON.parse(metaStr);
        } catch (parseErr) {
          console.error(`[SketchService] Failed to parse metadata for sketch ${id}:`, parseErr);
          return { metadata: null, backgroundImage: bgImage };
        }
        
        // Restore image URIs from separate storage if they were extracted
        if (metadata.elements && Array.isArray(metadata.elements)) {
          const imageElements = metadata.elements.filter((el: any) => el.type === 'image' && el.data?.imageStorageKey);
          if (imageElements.length > 0) {
            const imageKeys = imageElements.map((el: any) => el.data.imageStorageKey);
            const imagePromises = imageKeys.map((key: string) => AsyncStorage.getItem(key).catch(() => null));
            const imageData = await Promise.all(imagePromises);
            
            metadata.elements = metadata.elements.map((el: any) => {
              if (el.type === 'image' && el.data?.imageStorageKey) {
                const idx = imageKeys.indexOf(el.data.imageStorageKey);
                if (idx !== -1 && imageData[idx]) {
                  return { ...el, data: { ...el.data, uri: imageData[idx] } };
                }
              }
              return el;
            });
          }
        }
        
        return { metadata, backgroundImage: bgImage };
      }

      // Fallback: migrate from old format (metadata embedded in main array)
      console.log(`[SketchService] Migrating sketch ${id} to optimized storage...`);
      const sketch = await SketchService.getById(id);
      if (sketch?.metadata) {
        let metadata: any;
        try {
          metadata = JSON.parse(sketch.metadata);
        } catch (parseErr) {
          console.error(`[SketchService] Failed to parse legacy metadata for sketch ${id}:`, parseErr);
          return { metadata: null, backgroundImage: null };
        }
        const bg = metadata.backgroundImage || null;

        // Save to optimized keys (migration)
        const metaWithoutBg = { ...metadata };
        delete metaWithoutBg.backgroundImage;
        await AsyncStorage.setItem(`sketch_meta_${id}`, JSON.stringify(metaWithoutBg));
        if (bg) {
          await AsyncStorage.setItem(`sketch_bg_${id}`, bg);
        }

        // Clean heavy data from main array to speed up future loads
        const sketches = await getItems<Sketch>(KEYS.SKETCHES);
        const index = sketches.findIndex(s => s.id === id);
        if (index !== -1) {
          // Keep only lightweight data + sketch_data (small preview) in the main array
          delete (sketches[index] as any).metadata;
          await setItems(KEYS.SKETCHES, sketches);
        }

        return { metadata: metaWithoutBg, backgroundImage: bg };
      }

      return { metadata: null, backgroundImage: null };
    } catch (error) {
      console.error(`[SketchService] Error loading sketch data for ${id}:`, error);
      return { metadata: null, backgroundImage: null };
    }
  },

  // ---- OPTIMIZED: Save heavy data to separate keys ----
  saveSketchData: async (id: string, metadata: any, backgroundImage: string | null): Promise<void> => {
    try {
      // Save metadata (without background image) to separate key
      const metaWithoutBg = { ...metadata };
      delete metaWithoutBg.backgroundImage;

      const saveOps: Promise<void>[] = [
        AsyncStorage.setItem(`sketch_meta_${id}`, JSON.stringify(metaWithoutBg)),
      ];

      // Save background image to its own key
      if (backgroundImage) {
        saveOps.push(AsyncStorage.setItem(`sketch_bg_${id}`, backgroundImage));
      } else {
        // Remove old background if cleared
        saveOps.push(AsyncStorage.removeItem(`sketch_bg_${id}`));
      }

      await Promise.all(saveOps);
    } catch (error) {
      console.error(`[SketchService] Error saving sketch data for ${id}:`, error);
    }
  },

  create: async (data: Omit<Sketch, 'id' | 'created_at' | 'updated_at'>): Promise<Sketch> => {
    const sketches = await getItems<Sketch>(KEYS.SKETCHES);
    const id = generateId();

    // Extract heavy data before storing in main array
    const heavyMetadata = data.metadata;
    const lightSketch: Sketch = {
      ...data,
      id,
      metadata: undefined, // Don't store metadata in main array
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    sketches.push(lightSketch);

    // Save lightweight array + heavy data in parallel
    const saveOps: Promise<any>[] = [setItems(KEYS.SKETCHES, sketches)];
    if (heavyMetadata) {
      try {
        const meta = JSON.parse(heavyMetadata);
        const bg = meta.backgroundImage || null;
        const metaWithoutBg = { ...meta };
        delete metaWithoutBg.backgroundImage;
        saveOps.push(AsyncStorage.setItem(`sketch_meta_${id}`, JSON.stringify(metaWithoutBg)));
        if (bg) {
          saveOps.push(AsyncStorage.setItem(`sketch_bg_${id}`, bg));
        }
      } catch (e) {
        // If metadata isn't valid JSON, store as-is in separate key
        saveOps.push(AsyncStorage.setItem(`sketch_meta_${id}`, heavyMetadata));
      }
    }
    await Promise.all(saveOps);

    return { ...lightSketch, metadata: heavyMetadata };
  },

  update: async (id: string, data: Partial<Sketch>): Promise<Sketch | null> => {
    const sketches = await getItems<Sketch>(KEYS.SKETCHES);
    const index = sketches.findIndex(s => s.id === id);
    if (index === -1) return null;

    // Extract heavy data
    const heavyMetadata = data.metadata;
    const lightData = { ...data };
    delete lightData.metadata; // Don't store metadata in main array

    sketches[index] = { ...sketches[index], ...lightData, updated_at: new Date().toISOString() };

    // Save lightweight array + heavy data in parallel
    const saveOps: Promise<any>[] = [setItems(KEYS.SKETCHES, sketches)];
    if (heavyMetadata) {
      try {
        const meta = JSON.parse(heavyMetadata);
        const bg = meta.backgroundImage || null;
        const metaWithoutBg = { ...meta };
        delete metaWithoutBg.backgroundImage;
        saveOps.push(AsyncStorage.setItem(`sketch_meta_${id}`, JSON.stringify(metaWithoutBg)));
        if (bg) {
          saveOps.push(AsyncStorage.setItem(`sketch_bg_${id}`, bg));
        } else {
          saveOps.push(AsyncStorage.removeItem(`sketch_bg_${id}`));
        }
      } catch (e) {
        saveOps.push(AsyncStorage.setItem(`sketch_meta_${id}`, heavyMetadata));
      }
    }
    await Promise.all(saveOps);

    return sketches[index];
  },

  delete: async (id: string): Promise<boolean> => {
    const sketches = await getItems<Sketch>(KEYS.SKETCHES);
    const filtered = sketches.filter(s => s.id !== id);

    // Delete main array entry + separate heavy data keys in parallel
    await Promise.all([
      setItems(KEYS.SKETCHES, filtered),
      AsyncStorage.removeItem(`sketch_meta_${id}`),
      AsyncStorage.removeItem(`sketch_bg_${id}`),
    ]);
    return true;
  },

  // ---- BATCH MIGRATION: Move all embedded metadata to separate keys ----
  // This should be called once on app startup to ensure the main sketches array is lightweight.
  // After migration, loading the sketch list is fast because the heavy data is stored separately.
  migrateAllSketches: async (): Promise<void> => {
    const MIGRATION_KEY = 'aufmassprofi_sketch_migration_done';
    try {
      // Check if migration already completed
      const migrationDone = await AsyncStorage.getItem(MIGRATION_KEY);
      if (migrationDone === 'true') {
        console.log('[SketchService] Migration already completed, skipping.');
        return;
      }

      console.log('[SketchService] Starting batch migration of sketches...');
      const startTime = Date.now();
      const sketches = await getItems<Sketch>(KEYS.SKETCHES);
      let migratedCount = 0;
      let needsSave = false;

      for (const sketch of sketches) {
        if (sketch.metadata) {
          try {
            const meta = JSON.parse(sketch.metadata);
            const bg = meta.backgroundImage || null;
            const metaWithoutBg = { ...meta };
            delete metaWithoutBg.backgroundImage;

            // Save heavy data to separate keys
            await AsyncStorage.setItem(`sketch_meta_${sketch.id}`, JSON.stringify(metaWithoutBg));
            if (bg) {
              await AsyncStorage.setItem(`sketch_bg_${sketch.id}`, bg);
            }

            // Strip metadata from main array entry
            delete (sketch as any).metadata;
            needsSave = true;
            migratedCount++;
          } catch (e) {
            console.error(`[SketchService] Error migrating sketch ${sketch.id}:`, e);
          }
        }
      }

      if (needsSave) {
        await setItems(KEYS.SKETCHES, sketches);
      }

      // Mark migration as done
      await AsyncStorage.setItem(MIGRATION_KEY, 'true');
      console.log(`[SketchService] Batch migration completed in ${Date.now() - startTime}ms. Migrated ${migratedCount} sketches.`);
    } catch (error) {
      console.error('[SketchService] Batch migration error:', error);
    }
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

// Migration: Foto-Bilddaten aus dem Array in separate Schlüssel verschieben
// Verhindert Hermes OOM bei JSON.stringify des gesamten Foto-Arrays
export const migratePhotoStorage = async (): Promise<void> => {
  try {
    const migrationKey = 'aufmassprofi_photo_migration_done';
    const done = await AsyncStorage.getItem(migrationKey);
    if (done === 'true') return; // Bereits migriert
    
    const photos = await getItems<Photo>(KEYS.PHOTOS);
    let migrated = 0;
    let needsSave = false;
    
    for (const photo of photos) {
      const inlineData = photo.image_data || photo.uri || '';
      if (inlineData.length > 200) {
        // Bilddaten separat speichern
        try {
          await AsyncStorage.setItem(`photo_img_${photo.id}`, inlineData);
          photo.image_data = '';
          photo.uri = '';
          migrated++;
          needsSave = true;
        } catch (e) {
          console.error(`Migration error for photo ${photo.id}:`, e);
        }
      }
    }
    
    if (needsSave) {
      await setItems(KEYS.PHOTOS, photos);
      console.log(`[migratePhotoStorage] ${migrated} photos migrated to separate storage`);
    }
    
    await AsyncStorage.setItem(migrationKey, 'true');
  } catch (e) {
    console.error('[migratePhotoStorage] Error:', e);
  }
};

export const PhotoService = {
  getAll: async (): Promise<Photo[]> => {
    return getItems<Photo>(KEYS.PHOTOS);
  },

  getById: async (id: string): Promise<Photo | null> => {
    const photos = await getItems<Photo>(KEYS.PHOTOS);
    const photo = photos.find(p => p.id === id) || null;
    if (photo) {
      // Bilddaten separat laden (OOM-Schutz)
      const imageData = await storage.getItem(`photo_img_${id}`);
      if (imageData) {
        photo.image_data = imageData;
        photo.uri = imageData;
      } else if (!photo.image_data && !photo.uri) {
        // Kein separates Bild und kein Inline-Bild → kein Bild verfügbar
      }
      // Migration: Wenn Bild noch im Array steckt, separat speichern und Array bereinigen
      if ((photo.image_data || photo.uri) && !imageData) {
        const inlineImg = photo.image_data || photo.uri || '';
        if (inlineImg.length > 100) { // Nur echte base64-Daten migrieren
          await storage.setItem(`photo_img_${id}`, inlineImg);
        }
      }
    }
    return photo;
  },

  getByProjectId: async (projectId: string): Promise<Photo[]> => {
    const photos = await getItems<Photo>(KEYS.PHOTOS);
    const projectPhotos = photos.filter(p => p.project_id === projectId);
    // Bilddaten separat laden für jedes Foto (einzeln, nicht alle auf einmal!)
    for (const photo of projectPhotos) {
      try {
        const imageData = await storage.getItem(`photo_img_${photo.id}`);
        if (imageData) {
          photo.image_data = imageData;
          photo.uri = imageData;
        } else if (photo.image_data && photo.image_data.length > 100) {
          // Migration: Altes Foto hat Bilddaten noch im Array
          // Separat speichern für zukünftige Nutzung
          await storage.setItem(`photo_img_${photo.id}`, photo.image_data);
        } else if (photo.uri && photo.uri.length > 100) {
          photo.image_data = photo.uri;
          await storage.setItem(`photo_img_${photo.id}`, photo.uri);
        }
      } catch (e) {
        console.error(`Error loading image for photo ${photo.id}:`, e);
      }
    }
    return projectPhotos;
  },

  create: async (data: Omit<Photo, 'id' | 'created_at' | 'updated_at'>): Promise<Photo> => {
    const photos = await getItems<Photo>(KEYS.PHOTOS);
    const newId = generateId();
    
    // Bilddaten SEPARAT speichern (verhindert OOM bei JSON.stringify des Arrays)
    const imageData = data.image_data || data.uri || '';
    if (imageData) {
      await storage.setItem(`photo_img_${newId}`, imageData);
    }
    
    // MIGRATION: Alte Fotos mit Inline-Bilddaten ebenfalls migrieren
    // Damit das Array klein bleibt und JSON.stringify nicht crasht
    for (const existingPhoto of photos) {
      const inlineData = existingPhoto.image_data || existingPhoto.uri || '';
      if (inlineData.length > 200) {
        // Bilddaten separat speichern (falls noch nicht geschehen)
        try {
          const alreadyMigrated = await storage.getItem(`photo_img_${existingPhoto.id}`);
          if (!alreadyMigrated) {
            await storage.setItem(`photo_img_${existingPhoto.id}`, inlineData);
          }
        } catch (e) {
          console.error(`Migration error for photo ${existingPhoto.id}:`, e);
        }
        // Inline-Daten entfernen
        existingPhoto.image_data = '';
        existingPhoto.uri = '';
      }
    }
    
    // Nur Metadaten im Array speichern (OHNE base64-Bilddaten!)
    const newPhoto: Photo = {
      ...data,
      id: newId,
      image_data: '', // Nicht im Array speichern!
      uri: '',        // Nicht im Array speichern!
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    photos.push(newPhoto);
    await setItems(KEYS.PHOTOS, photos);
    
    // Für Rückgabe: Bilddaten wieder anhängen
    newPhoto.image_data = imageData;
    newPhoto.uri = imageData;
    return newPhoto;
  },

  update: async (id: string, data: Partial<Photo>): Promise<Photo | null> => {
    const photos = await getItems<Photo>(KEYS.PHOTOS);
    const index = photos.findIndex(p => p.id === id);
    if (index === -1) return null;
    
    // Falls Bilddaten aktualisiert werden, separat speichern
    if (data.image_data || data.uri) {
      const imageData = data.image_data || data.uri || '';
      if (imageData) {
        await storage.setItem(`photo_img_${id}`, imageData);
      }
      // Bilddaten aus dem Update entfernen
      data = { ...data, image_data: '', uri: '' };
    }
    
    photos[index] = { ...photos[index], ...data, updated_at: new Date().toISOString() };
    await setItems(KEYS.PHOTOS, photos);
    return photos[index];
  },

  delete: async (id: string): Promise<boolean> => {
    const photos = await getItems<Photo>(KEYS.PHOTOS);
    const filtered = photos.filter(p => p.id !== id);
    await setItems(KEYS.PHOTOS, filtered);
    // Auch die separat gespeicherten Bilddaten löschen
    try {
      await AsyncStorage.removeItem(`photo_img_${id}`);
    } catch (e) {
      console.log(`Error removing photo image ${id}:`, e);
    }
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

// ============ Checklisten-Bilder: separate Speicherung (OOM-Schutz) ============
// Base64-Bilder werden NICHT mehr inline im Haupt-Array gespeichert, sondern
// unter eigenen Keys (chk_img_<id>) mit Referenz-Markern im Array.
const CHK_IMG_PREFIX = '@chkimg:';

const chkStoreInline = (val: string | undefined, ops: Promise<any>[]): string | undefined => {
  if (val && typeof val === 'string' && val.startsWith('data:')) {
    const key = `chk_img_${generateId()}`;
    ops.push(AsyncStorage.setItem(key, val));
    return CHK_IMG_PREFIX + key;
  }
  return val;
};

const chkExtractItems = (items: any[], ops: Promise<any>[]): any[] =>
  items.map(it => {
    // String-Items (z.B. Vorlagen-Punkte) unverändert lassen – {...string} würde sie zerstören!
    if (!it || typeof it !== 'object') return it;
    return {
      ...it,
      printImage: chkStoreInline(it.printImage, ops),
      categoryLogo: chkStoreInline(it.categoryLogo, ops),
      previewImages: Array.isArray(it.previewImages) ? it.previewImages.map((v: string) => chkStoreInline(v, ops)) : it.previewImages,
      subItems: Array.isArray(it.subItems) ? chkExtractItems(it.subItems, ops) : it.subItems,
    };
  });

// Repariert durch {...string} zerstörte String-Items (Zeichen-Map {0:'T',1:'e',...} -> String)
const chkRepairItem = (it: any): any => {
  if (it && typeof it === 'object' && it.text === undefined && typeof it['0'] === 'string') {
    let s = '';
    let i = 0;
    while (typeof it[i] === 'string') { s += it[i]; i++; }
    if (s.length > 0) return s;
  }
  return it;
};

const chkRepairItems = (items: any[]): any[] =>
  items.map(raw => {
    const it = chkRepairItem(raw);
    if (!it || typeof it !== 'object') return it;
    return { ...it, subItems: Array.isArray(it.subItems) ? chkRepairItems(it.subItems) : it.subItems };
  });

const chkExtractImages = <T extends { items?: any[]; templateLogo?: string }>(obj: T, ops: Promise<any>[]): T => {
  const out: any = { ...obj };
  if ('templateLogo' in out) out.templateLogo = chkStoreInline(out.templateLogo, ops);
  if (Array.isArray(out.items)) out.items = chkExtractItems(out.items, ops);
  return out as T;
};

const chkCollectRefs = (obj: any, out: string[]) => {
  const check = (v: any) => { if (typeof v === 'string' && v.startsWith(CHK_IMG_PREFIX)) out.push(v.slice(CHK_IMG_PREFIX.length)); };
  check(obj?.templateLogo);
  const walk = (items?: any[]) => (items || []).forEach((it: any) => {
    check(it?.printImage); check(it?.categoryLogo);
    (Array.isArray(it?.previewImages) ? it.previewImages : []).forEach(check);
    if (Array.isArray(it?.subItems)) walk(it.subItems);
  });
  walk(obj?.items);
};

const chkRestoreImages = async <T extends { items?: any[]; templateLogo?: string }>(obj: T): Promise<T> => {
  // Zuerst evtl. zerstörte String-Items reparieren (Bug: {...string} in alten Versionen)
  let base: any = obj;
  if (Array.isArray(base?.items)) {
    base = { ...base, items: chkRepairItems(base.items) };
  }
  const refs: string[] = [];
  chkCollectRefs(base, refs);
  if (refs.length === 0) return base;
  const unique = Array.from(new Set(refs));
  const pairs = await AsyncStorage.multiGet(unique);
  const map = new Map(pairs as [string, string | null][]);
  const resolve = (v: any) => (typeof v === 'string' && v.startsWith(CHK_IMG_PREFIX))
    ? (map.get(v.slice(CHK_IMG_PREFIX.length)) || undefined)
    : v;
  const walk = (items: any[]): any[] => items.map(it => {
    if (!it || typeof it !== 'object') return it; // String-Items unverändert lassen
    return {
      ...it,
      printImage: resolve(it.printImage),
      categoryLogo: resolve(it.categoryLogo),
      previewImages: Array.isArray(it.previewImages) ? it.previewImages.map(resolve).filter(Boolean) : it.previewImages,
      subItems: Array.isArray(it.subItems) ? walk(it.subItems) : it.subItems,
    };
  });
  const out: any = { ...base };
  if ('templateLogo' in out) out.templateLogo = resolve(out.templateLogo);
  if (Array.isArray(out.items)) out.items = walk(out.items);
  return out as T;
};

const chkDeleteImages = (obj: any) => {
  const refs: string[] = [];
  chkCollectRefs(obj, refs);
  refs.forEach(k => AsyncStorage.removeItem(k).catch(() => {}));
};

// Einmalige Migration: Inline-Base64-Bilder aus Checklisten/Vorlagen auslagern
let chkMigrationRunning: Promise<void> | null = null;
export const migrateChecklistImages = async (): Promise<void> => {
  if (chkMigrationRunning) return chkMigrationRunning;
  chkMigrationRunning = (async () => {
    try {
      for (const storageKey of [KEYS.CHECKLISTS, KEYS.CHECKLIST_TEMPLATES]) {
        const raw = await AsyncStorage.getItem(storageKey);
        if (!raw || raw.indexOf('data:image') === -1) continue; // nichts zu migrieren
        const arr = JSON.parse(raw);
        if (!Array.isArray(arr)) continue;
        const ops: Promise<any>[] = [];
        const migrated = arr.map((entry: any) => chkExtractImages(entry, ops));
        await Promise.all(ops);
        await AsyncStorage.setItem(storageKey, JSON.stringify(migrated));
        console.log(`[migrateChecklistImages] ${ops.length} Bilder aus ${storageKey} ausgelagert`);
      }
    } catch (e) {
      console.error('[migrateChecklistImages] Error:', e);
    }
  })();
  return chkMigrationRunning;
};

export const ChecklistService = {
  getAll: async (): Promise<Checklist[]> => {
    return getItems<Checklist>(KEYS.CHECKLISTS);
  },

  getById: async (id: string): Promise<Checklist | null> => {
    const checklists = await getItems<Checklist>(KEYS.CHECKLISTS);
    const found = checklists.find(c => c.id === id);
    return found ? chkRestoreImages(found) : null;
  },

  getByProjectId: async (projectId: string): Promise<Checklist[]> => {
    const checklists = await getItems<Checklist>(KEYS.CHECKLISTS);
    return Promise.all(checklists.filter(c => c.project_id === projectId).map(c => chkRestoreImages(c)));
  },

  create: async (data: Omit<Checklist, 'id' | 'created_at' | 'updated_at'>): Promise<Checklist> => {
    const checklists = await getItems<Checklist>(KEYS.CHECKLISTS);
    const ops: Promise<any>[] = [];
    const newChecklist: Checklist = {
      ...chkExtractImages(data as any, ops),
      id: generateId(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    checklists.push(newChecklist);
    await Promise.all([setItems(KEYS.CHECKLISTS, checklists), ...ops]);
    return newChecklist;
  },

  update: async (id: string, data: Partial<Checklist>): Promise<Checklist | null> => {
    const checklists = await getItems<Checklist>(KEYS.CHECKLISTS);
    const index = checklists.findIndex(c => c.id === id);
    if (index === -1) return null;
    const ops: Promise<any>[] = [];
    const oldRefs: string[] = [];
    chkCollectRefs(checklists[index], oldRefs);
    const merged = { ...checklists[index], ...chkExtractImages(data as any, ops), updated_at: new Date().toISOString() };
    // Nicht mehr referenzierte Bild-Keys aufräumen
    const newRefs: string[] = [];
    chkCollectRefs(merged, newRefs);
    const still = new Set(newRefs);
    oldRefs.filter(k => !still.has(k)).forEach(k => AsyncStorage.removeItem(k).catch(() => {}));
    checklists[index] = merged;
    await Promise.all([setItems(KEYS.CHECKLISTS, checklists), ...ops]);
    return checklists[index];
  },

  delete: async (id: string): Promise<boolean> => {
    const checklists = await getItems<Checklist>(KEYS.CHECKLISTS);
    const toDelete = checklists.find(c => c.id === id);
    if (toDelete) chkDeleteImages(toDelete);
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
    const raw = await getItems<ChecklistTemplate>(KEYS.CHECKLIST_TEMPLATES);
    // Zerstörte String-Items reparieren (Bug: {...string} in alten Versionen)
    const templates = raw.map((t: any) => Array.isArray(t?.items) ? { ...t, items: chkRepairItems(t.items) } : t);
    // Nur die (kleinen) Vorlagen-Logos auflösen – Item-Bilder bleiben als Referenz (Performance)
    const logoRefs = templates
      .map(t => t.templateLogo)
      .filter((v): v is string => typeof v === 'string' && v.startsWith(CHK_IMG_PREFIX))
      .map(v => v.slice(CHK_IMG_PREFIX.length));
    if (logoRefs.length > 0) {
      const pairs = await AsyncStorage.multiGet(Array.from(new Set(logoRefs)));
      const map = new Map(pairs as [string, string | null][]);
      return templates.map(t => (typeof t.templateLogo === 'string' && t.templateLogo.startsWith(CHK_IMG_PREFIX))
        ? { ...t, templateLogo: map.get(t.templateLogo.slice(CHK_IMG_PREFIX.length)) || undefined }
        : t);
    }
    return templates;
  },
  
  // Einmalig Standard-Vorlagen erstellen (nur beim ersten App-Start)
  initializeDefaults: async (): Promise<void> => {
    const existingKey = await AsyncStorage.getItem(KEYS.CHECKLIST_TEMPLATES);
    // Nur wenn noch nie Vorlagen existiert haben (key ist null, nicht leeres Array)
    if (existingKey === null) {
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
    }
  },

  getById: async (id: string): Promise<ChecklistTemplate | null> => {
    const templates = await getItems<ChecklistTemplate>(KEYS.CHECKLIST_TEMPLATES);
    const found = templates.find(t => t.id === id);
    return found ? chkRestoreImages(found) : null;
  },

  create: async (data: Omit<ChecklistTemplate, 'id' | 'created_at' | 'updated_at'>): Promise<ChecklistTemplate> => {
    const templates = await getItems<ChecklistTemplate>(KEYS.CHECKLIST_TEMPLATES);
    const ops: Promise<any>[] = [];
    const newTemplate: ChecklistTemplate = {
      ...chkExtractImages(data as any, ops),
      id: generateId(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    templates.push(newTemplate);
    await Promise.all([setItems(KEYS.CHECKLIST_TEMPLATES, templates), ...ops]);
    return newTemplate;
  },

  update: async (id: string, data: Partial<ChecklistTemplate>): Promise<ChecklistTemplate | null> => {
    const templates = await getItems<ChecklistTemplate>(KEYS.CHECKLIST_TEMPLATES);
    const index = templates.findIndex(t => t.id === id);
    if (index === -1) return null;
    const ops: Promise<any>[] = [];
    const oldRefs: string[] = [];
    chkCollectRefs(templates[index], oldRefs);
    const merged = { ...templates[index], ...chkExtractImages(data as any, ops), updated_at: new Date().toISOString() };
    const newRefs: string[] = [];
    chkCollectRefs(merged, newRefs);
    const still = new Set(newRefs);
    oldRefs.filter(k => !still.has(k)).forEach(k => AsyncStorage.removeItem(k).catch(() => {}));
    templates[index] = merged;
    await Promise.all([setItems(KEYS.CHECKLIST_TEMPLATES, templates), ...ops]);
    return templates[index];
  },

  delete: async (id: string): Promise<boolean> => {
    const templates = await getItems<ChecklistTemplate>(KEYS.CHECKLIST_TEMPLATES);
    const toDelete = templates.find(t => t.id === id);
    if (toDelete) chkDeleteImages(toDelete);
    const filtered = templates.filter(t => t.id !== id);
    await setItems(KEYS.CHECKLIST_TEMPLATES, filtered);
    return true;
  },

  // Alle Templates auf einmal speichern (für Sortierung)
  saveAll: async (templates: ChecklistTemplate[]): Promise<void> => {
    const ops: Promise<any>[] = [];
    const extracted = templates.map(t => chkExtractImages(t as any, ops));
    await Promise.all([setItems(KEYS.CHECKLIST_TEMPLATES, extracted), ...ops]);
  },
};

// ============ SETTINGS ============
export interface Settings {
  company_name?: string;
  company_address?: string;
  company_phone?: string;
  company_mobile_phone?: string;
  company_fax?: string;
  company_email?: string;
  company_logo?: string;
  tax_rate?: number;
  // Projektart-Überschriften (für Auswahlfeld)
  project_type_options?: string[]; // z.B. ["Sturmschaden", "Wartung", "Neueindeckung", "Reparatur"]
  // PDF Layout Größen
  pdf_header_size?: 'small' | 'medium' | 'large';
  pdf_project_type_size?: 'small' | 'medium' | 'large';
  pdf_tools_size?: 'small' | 'medium' | 'large';
  // Rapport-Einstellungen
  report_title?: string; // z.B. "Tagesbericht", "Arbeitsrapport", default "Rapport"
  // Erinnerungen (Tage Vorlauf, default 30)
  reminder_days_inspection?: number; // Tage vor nächster Inspektion
  reminder_days_tuv?: number; // Tage vor nächstem TÜV
  // Rapport-Briefkopf: Welche Felder standardmäßig anzeigen
  report_header_fields_default?: string[];
  // Rapport-Fahrzeiten: Standardmäßig zur Gesamtarbeitszeit hinzuzählen?
  report_travel_in_total_hours?: boolean;
  // Haftungsausschluss akzeptiert (ISO-Datum, leer = noch nicht akzeptiert)
  disclaimer_accepted_at?: string;
  disclaimer_version?: string;
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

// ============ Dokument-Bilder: separate Speicherung (OOM-Schutz) ============
// PDF-Seiten (imageData) und Original-PDFs (originalPdfData) werden unter
// eigenen Keys (doc_img_<id>) gespeichert – nicht mehr inline im Haupt-Array.
const DOC_IMG_PREFIX = '@docimg:';

const docStoreVal = (val: string | undefined, ops: Promise<any>[]): string | undefined => {
  // Base64-Daten sind lang; Referenzen und kurze Strings unverändert lassen
  if (val && typeof val === 'string' && val.length > 500 && !val.startsWith(DOC_IMG_PREFIX)) {
    const key = `doc_img_${generateId()}`;
    ops.push(AsyncStorage.setItem(key, val));
    return DOC_IMG_PREFIX + key;
  }
  return val;
};

const docExtractImages = <T extends Partial<Document>>(doc: T, ops: Promise<any>[]): T => {
  const out: any = { ...doc };
  if ('originalPdfData' in out) out.originalPdfData = docStoreVal(out.originalPdfData, ops);
  if (Array.isArray(out.pages)) {
    out.pages = out.pages.map((p: DocumentPage) => ({ ...p, imageData: docStoreVal(p.imageData, ops) as string }));
  }
  return out as T;
};

const docCollectRefs = (doc: any, out: string[]) => {
  const check = (v: any) => { if (typeof v === 'string' && v.startsWith(DOC_IMG_PREFIX)) out.push(v.slice(DOC_IMG_PREFIX.length)); };
  check(doc?.originalPdfData);
  (Array.isArray(doc?.pages) ? doc.pages : []).forEach((p: any) => check(p?.imageData));
};

const docRestoreImages = async (doc: Document): Promise<Document> => {
  const refs: string[] = [];
  docCollectRefs(doc, refs);
  if (refs.length === 0) return doc;
  const pairs = await AsyncStorage.multiGet(Array.from(new Set(refs)));
  const map = new Map(pairs as [string, string | null][]);
  const resolve = (v: any) => (typeof v === 'string' && v.startsWith(DOC_IMG_PREFIX))
    ? (map.get(v.slice(DOC_IMG_PREFIX.length)) || '')
    : v;
  return {
    ...doc,
    originalPdfData: resolve(doc.originalPdfData),
    pages: (doc.pages || []).map(p => ({ ...p, imageData: resolve(p.imageData) })),
  };
};

// Einmalige Migration: Inline-Bilddaten aus Dokumenten auslagern
let docMigrationRunning: Promise<void> | null = null;
export const migrateDocumentImages = async (): Promise<void> => {
  if (docMigrationRunning) return docMigrationRunning;
  docMigrationRunning = (async () => {
    try {
      const raw = await AsyncStorage.getItem(KEYS.DOCUMENTS);
      if (!raw) return;
      const arr = JSON.parse(raw);
      if (!Array.isArray(arr) || arr.length === 0) return;
      // Nur migrieren, wenn noch lange Inline-Daten vorhanden sind
      const needsMigration = arr.some((d: any) =>
        (typeof d.originalPdfData === 'string' && d.originalPdfData.length > 500 && !d.originalPdfData.startsWith(DOC_IMG_PREFIX)) ||
        (Array.isArray(d.pages) && d.pages.some((p: any) => typeof p.imageData === 'string' && p.imageData.length > 500 && !p.imageData.startsWith(DOC_IMG_PREFIX)))
      );
      if (!needsMigration) return;
      const ops: Promise<any>[] = [];
      const migrated = arr.map((d: any) => docExtractImages(d, ops));
      await Promise.all(ops);
      await AsyncStorage.setItem(KEYS.DOCUMENTS, JSON.stringify(migrated));
      console.log(`[migrateDocumentImages] ${ops.length} Bilddaten ausgelagert`);
    } catch (e) {
      console.error('[migrateDocumentImages] Error:', e);
    }
  })();
  return docMigrationRunning;
};

export const DocumentService = {
  getAll: async (): Promise<Document[]> => {
    return getItems<Document>(KEYS.DOCUMENTS);
  },

  getByProjectId: async (projectId: string): Promise<Document[]> => {
    const documents = await getItems<Document>(KEYS.DOCUMENTS);
    return Promise.all(documents.filter((doc) => doc.project_id === projectId).map(d => docRestoreImages(d)));
  },

  getById: async (id: string): Promise<Document | null> => {
    const documents = await getItems<Document>(KEYS.DOCUMENTS);
    const found = documents.find((doc) => doc.id === id);
    return found ? docRestoreImages(found) : null;
  },

  create: async (data: Omit<Document, 'id' | 'created_at' | 'updated_at'>): Promise<Document> => {
    const documents = await getItems<Document>(KEYS.DOCUMENTS);
    const ops: Promise<any>[] = [];
    const newDocument: Document = {
      ...docExtractImages(data as Document, ops),
      id: generateId(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    documents.push(newDocument);
    await Promise.all([setItems(KEYS.DOCUMENTS, documents), ...ops]);
    return newDocument;
  },

  update: async (id: string, data: Partial<Document>): Promise<Document | null> => {
    const documents = await getItems<Document>(KEYS.DOCUMENTS);
    const index = documents.findIndex((doc) => doc.id === id);
    if (index !== -1) {
      const ops: Promise<any>[] = [];
      const oldRefs: string[] = [];
      docCollectRefs(documents[index], oldRefs);
      documents[index] = {
        ...documents[index],
        ...docExtractImages(data as Document, ops),
        updated_at: new Date().toISOString(),
      };
      const newRefs: string[] = [];
      docCollectRefs(documents[index], newRefs);
      const still = new Set(newRefs);
      oldRefs.filter(k => !still.has(k)).forEach(k => AsyncStorage.removeItem(k).catch(() => {}));
      await Promise.all([setItems(KEYS.DOCUMENTS, documents), ...ops]);
      return documents[index];
    }
    return null;
  },

  updatePage: async (documentId: string, pageNumber: number, pageData: Partial<DocumentPage>): Promise<Document | null> => {
    const documents = await getItems<Document>(KEYS.DOCUMENTS);
    const docIndex = documents.findIndex((doc) => doc.id === documentId);
    if (docIndex !== -1) {
      const ops: Promise<any>[] = [];
      const patch: Partial<DocumentPage> = { ...pageData };
      if (typeof patch.imageData === 'string') {
        const oldPage = documents[docIndex].pages.find((p) => p.pageNumber === pageNumber);
        const oldRef = oldPage && typeof oldPage.imageData === 'string' && oldPage.imageData.startsWith(DOC_IMG_PREFIX) ? oldPage.imageData.slice(DOC_IMG_PREFIX.length) : null;
        patch.imageData = docStoreVal(patch.imageData, ops) as string;
        if (oldRef) AsyncStorage.removeItem(oldRef).catch(() => {});
      }
      let pageIndex = documents[docIndex].pages.findIndex((p) => p.pageNumber === pageNumber);
      
      // If page doesn't exist, create it
      if (pageIndex === -1) {
        const newPage: DocumentPage = {
          pageNumber,
          annotations: '',
          ...patch,
        } as DocumentPage;
        documents[docIndex].pages.push(newPage);
        pageIndex = documents[docIndex].pages.length - 1;
      } else {
        documents[docIndex].pages[pageIndex] = {
          ...documents[docIndex].pages[pageIndex],
          ...patch,
        };
      }
      
      documents[docIndex].updated_at = new Date().toISOString();
      await Promise.all([setItems(KEYS.DOCUMENTS, documents), ...ops]);
      return documents[docIndex];
    }
    return null;
  },

  delete: async (id: string): Promise<void> => {
    const documents = await getItems<Document>(KEYS.DOCUMENTS);
    const toDelete = documents.find((doc) => doc.id === id);
    if (toDelete) {
      const refs: string[] = [];
      docCollectRefs(toDelete, refs);
      refs.forEach(k => AsyncStorage.removeItem(k).catch(() => {}));
    }
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

// ============ REPORTS (Rapport / Tagesbericht) - Pro Feature ============

// ============ REPORT HEADER FIELDS - Konfigurierbare Briefkopf-Felder ============
export interface ReportHeaderFieldDef {
  id: string;
  label: string;
  group: 'customer' | 'project';
}
export const REPORT_HEADER_FIELDS: ReportHeaderFieldDef[] = [
  // Kunde
  { id: 'customer_name', label: 'Kundenname', group: 'customer' },
  { id: 'customer_address', label: 'Kundenadresse', group: 'customer' },
  { id: 'customer_phone', label: 'Telefon Kunde', group: 'customer' },
  { id: 'customer_email', label: 'E-Mail Kunde', group: 'customer' },
  // Projekt
  { id: 'project_name', label: 'Projektname', group: 'project' },
  { id: 'project_address', label: 'Projektadresse / Baustelle', group: 'project' },
  { id: 'project_number', label: 'Projekt-/Objektnummer', group: 'project' },
  { id: 'project_type', label: 'Projektart', group: 'project' },
  { id: 'project_contact', label: 'Ansprechpartner vor Ort', group: 'project' },
  { id: 'project_contact_phone', label: 'Telefon Ansprechpartner', group: 'project' },
  { id: 'project_contact_email', label: 'E-Mail Ansprechpartner', group: 'project' },
];

export const DEFAULT_REPORT_HEADER_FIELDS: string[] = [
  'customer_name', 'customer_address', 'project_name', 'project_address', 'project_number', 'project_type',
  'project_contact', 'project_contact_phone', 'project_contact_email',
];

export interface ReportEmployee {
  id: string;
  name: string;
  role?: string; // Funktion / Rolle (z.B. "Dachdecker", "Geselle", "Azubi")
  entry_date?: string; // Datum dieses Eintrags (YYYY-MM-DD), default = report.date
  hours?: number; // Stunden für diesen Eintrag (auto-berechnet aus from/to/pause)
  time_from?: string; // HH:MM
  time_to?: string; // HH:MM
  pause_minutes?: number; // Pause in Minuten
  color?: string; // Avatar-Farbe
  // Fahrzeiten pro Mitarbeiter (optional, falls Pro-Mitarbeiter-Modus aktiv)
  travel_to_hours?: number; // Hinweg in Stunden (z.B. 0.75)
  travel_back_hours?: number; // Rückweg in Stunden
  travel_to_km?: number; // Kilometer Hinweg
  travel_back_km?: number; // Kilometer Rückweg
  travel_costs?: number; // Spesen / Fahrtkosten EUR
  // Preis-Override für diesen Rapport (sonst aus Stammdaten)
  hourly_rate?: number; // €/Std
  wage_rate_name?: string; // Name des gewählten Stundensatzes (nur intern, nicht im PDF)
}

export interface ReportMaterial {
  id: string;
  name: string;
  quantity: number;
  unit: string; // z.B. "Stk", "m", "m²", "kg", "L"
  note?: string;
  // Preis-Override für diesen Rapport (sonst aus Stammdaten)
  price_per_unit?: number; // €/Einheit
}

export interface ReportPhoto {
  id: string;
  uri: string; // base64 data URL
  caption?: string;
}

export interface ReportMachine {
  id: string;
  name: string;
  master_id?: string; // Verknüpfung zur Stammdaten-Maschine
  hours?: number; // Einsatzdauer in Stunden
  note?: string;
  // Preis-Override für diesen Rapport (sonst aus Stammdaten)
  hourly_rate?: number; // €/Std
}

export interface ReportWorkItem {
  id: string;
  text: string;
  checked: boolean;
  source?: 'checklist' | 'manual'; // Herkunft
}

export interface Report {
  id: string;
  project_id: string;
  report_number?: string;
  // Datum & Zeit
  date: string;
  time_from?: string;
  time_to?: string;
  total_hours?: number;
  // Kontaktperson auf der Baustelle (optional, sonst aus Projekt)
  contact_person?: string;
  // Mitarbeiter
  employees: ReportEmployee[];
  // Ausgeführte Arbeiten (Checkbox-Liste + Freitext)
  work_items?: ReportWorkItem[];
  work_description: string;
  // Material
  materials: ReportMaterial[];
  // Maschinen & Geräte
  machines?: ReportMachine[];
  // Anfahrt (Legacy einfache Felder)
  travel_km?: number;
  travel_time?: number;
  // Erweiterte Fahrzeiten (Team-Gesamt - alle teilen sich diese Fahrt)
  travel_to_hours?: number; // Hinweg in Stunden
  travel_back_hours?: number; // Rückweg in Stunden
  travel_to_km?: number;
  travel_back_km?: number;
  travel_costs?: number; // Spesen / Fahrtkosten EUR (Team)
  travel_days?: number; // Anzahl Fahrten/Tage (Team) – Fahrzeit & Spesen werden damit multipliziert
  travel_note?: string;
  travel_per_employee_enabled?: boolean; // Pro-Mitarbeiter-Modus aktiv?
  travel_in_total_hours?: boolean; // Fahrzeit zur Gesamtarbeitszeit hinzuzählen?
  // Preis-Anzeige im PDF (optional)
  show_employee_costs?: boolean;
  show_material_costs?: boolean;
  show_machine_costs?: boolean;
  show_travel_costs?: boolean; // Spesen/Fahrtkosten in Kosten-Übersicht einrechnen
  show_total_sum?: boolean;
  // Mehrwertsteuer
  show_vat?: boolean;
  vat_rate?: number; // %, z.B. 19
  // Briefkopf-Felder (Per-Report Override; sonst Settings-Default)
  header_fields?: string[];
  // Wetter
  weather?: 'sunny' | 'cloudy' | 'rain' | 'snow' | 'wind' | 'fog' | '';
  temperature?: number;
  // Besonderheiten / Behinderungen (eigenes Feld neben Bemerkungen)
  obstacles?: string;
  // Notizen / Bemerkungen
  remarks?: string;
  // Unterschriften
  signature_customer?: string;
  signature_customer_name?: string;
  signature_worker?: string;
  signature_worker_name?: string;
  signed_at?: string;
  // Fotos
  photos: ReportPhoto[];
  // Material-Lagerabzug Tracking - Map: master_id -> bereits abgezogene Menge.
  // So können wir bei Bearbeitung das Delta korrekt berechnen (kein Doppel-Abzug).
  deducted_quantities?: Record<string, number>;
  created_at: string;
  updated_at: string;
}

export const ReportService = {
  getAll: async (): Promise<Report[]> => {
    return getItems<Report>(KEYS.REPORTS);
  },

  getByProjectId: async (projectId: string): Promise<Report[]> => {
    const reports = await getItems<Report>(KEYS.REPORTS);
    return reports
      .filter((r) => r.project_id === projectId)
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  },

  getById: async (id: string): Promise<Report | null> => {
    const reports = await getItems<Report>(KEYS.REPORTS);
    return reports.find((r) => r.id === id) || null;
  },

  // Nächste Rapport-Nummer ermitteln (pro Projekt)
  getNextReportNumber: async (projectId: string): Promise<string> => {
    const reports = await getItems<Report>(KEYS.REPORTS);
    const projectReports = reports.filter((r) => r.project_id === projectId);
    const maxNum = projectReports.reduce((max, r) => {
      const m = (r.report_number || '').match(/RAP-(\d+)/);
      if (m) {
        const n = parseInt(m[1], 10);
        return n > max ? n : max;
      }
      return max;
    }, 0);
    return `RAP-${String(maxNum + 1).padStart(4, '0')}`;
  },

  create: async (data: Omit<Report, 'id' | 'created_at' | 'updated_at'>): Promise<Report> => {
    const reports = await getItems<Report>(KEYS.REPORTS);
    const newReport: Report = {
      ...data,
      id: generateId(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    reports.push(newReport);
    await setItems(KEYS.REPORTS, reports);
    return newReport;
  },

  update: async (id: string, data: Partial<Report>): Promise<Report | null> => {
    const reports = await getItems<Report>(KEYS.REPORTS);
    const idx = reports.findIndex((r) => r.id === id);
    if (idx === -1) return null;
    reports[idx] = {
      ...reports[idx],
      ...data,
      updated_at: new Date().toISOString(),
    };
    await setItems(KEYS.REPORTS, reports);
    return reports[idx];
  },

  delete: async (id: string): Promise<void> => {
    const reports = await getItems<Report>(KEYS.REPORTS);
    const filtered = reports.filter((r) => r.id !== id);
    await setItems(KEYS.REPORTS, filtered);
  },

  // Rapport duplizieren (gleiche Daten, neues Datum = heute, neue ID & Nummer)
  duplicate: async (id: string): Promise<Report | null> => {
    const original = await ReportService.getById(id);
    if (!original) return null;
    const nextNum = await ReportService.getNextReportNumber(original.project_id);
    const today = new Date().toISOString().split('T')[0];
    const { id: _omitId, created_at: _c, updated_at: _u, ...rest } = original;
    return ReportService.create({
      ...rest,
      report_number: nextNum,
      date: today,
      signature_customer: '',
      signature_worker: '',
      signed_at: undefined,
    } as any);
  },

  // Holt den zuletzt erstellten Rapport eines Projekts (für „Vortag übernehmen")
  getLatestForProject: async (projectId: string, excludeId?: string): Promise<Report | null> => {
    const list = await ReportService.getByProjectId(projectId);
    const filtered = excludeId ? list.filter((r) => r.id !== excludeId) : list;
    return filtered.length > 0 ? filtered[0] : null;
  },
};

// ============ MACHINES / GERÄTE (Stammdaten) - Pro Feature ============

export interface MachineMaster {
  id: string;
  machine_number?: string; // z.B. MG-001, automatisch vergeben, anpassbar
  name: string;
  // Erweiterte Betriebsmittel-Felder
  equipment_category?: 'fahrzeug' | 'maschine' | 'werkzeug' | 'geruest' | 'anhaenger' | 'container' | 'sicherheit' | 'sonstiges';
  manufacturer?: string;
  model?: string;
  year?: number;
  license_plate?: string;
  serial_number?: string; // FIN / Seriennummer
  storage_location?: string; // z.B. „Hauptlager München"
  responsible_employee?: string;
  // Zustand
  condition?: 'gut' | 'mittel' | 'schlecht';
  // Status: Verfügbar, Im Einsatz, In Wartung, Ausgeliehen, Nicht verfügbar
  status?: 'verfuegbar' | 'einsatz' | 'wartung' | 'ausgeliehen' | 'nicht_verfuegbar';
  // Ausleihe-Daten (wenn Status = ausgeliehen)
  loan_to?: string; // an wen verliehen (Name/Firma)
  loan_from_date?: string; // ISO YYYY-MM-DD
  loan_until_date?: string; // ISO geplante Rückgabe
  loan_note?: string;
  // Prüfungen
  last_inspection_date?: string; // ISO
  next_inspection_date?: string; // ISO
  // TÜV / Hauptuntersuchung (vor allem für Fahrzeuge, Anhänger)
  last_tuv_date?: string; // ISO
  next_tuv_date?: string; // ISO
  // Fotos
  photos?: string[]; // base64 Strings
  category?: string; // (legacy / freie Kategorie-Beschreibung)
  note?: string;
  // Preisangabe für Kostenberechnung im Rapport
  hourly_rate?: number; // €/Stunde Einsatz
  active: boolean;
  created_at: string;
  updated_at: string;
}

export const MachineMasterService = {
  getAll: async (): Promise<MachineMaster[]> => {
    const all = await getItems<MachineMaster>(KEYS.MACHINES);
    return all.sort((a, b) => a.name.localeCompare(b.name, 'de'));
  },

  getActive: async (): Promise<MachineMaster[]> => {
    const all = await MachineMasterService.getAll();
    return all.filter((m) => m.active !== false);
  },

  getById: async (id: string): Promise<MachineMaster | null> => {
    const all = await getItems<MachineMaster>(KEYS.MACHINES);
    return all.find((m) => m.id === id) || null;
  },

  create: async (data: Omit<MachineMaster, 'id' | 'created_at' | 'updated_at'>): Promise<MachineMaster> => {
    const all = await getItems<MachineMaster>(KEYS.MACHINES);
    const newM: MachineMaster = {
      ...data,
      id: generateId(),
      active: data.active !== false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    all.push(newM);
    await setItems(KEYS.MACHINES, all);
    return newM;
  },

  update: async (id: string, data: Partial<MachineMaster>): Promise<MachineMaster | null> => {
    const all = await getItems<MachineMaster>(KEYS.MACHINES);
    const idx = all.findIndex((m) => m.id === id);
    if (idx === -1) return null;
    all[idx] = { ...all[idx], ...data, updated_at: new Date().toISOString() };
    await setItems(KEYS.MACHINES, all);
    return all[idx];
  },

  delete: async (id: string): Promise<void> => {
    const all = await getItems<MachineMaster>(KEYS.MACHINES);
    const filtered = all.filter((m) => m.id !== id);
    await setItems(KEYS.MACHINES, filtered);
  },
};

// ============ EMPLOYEES (Stammdaten Mitarbeiter) - Pro Feature ============

// ===== Automatische Nummern für Stammdaten (anpassbar) =====
const nextMasterNumber = (numbers: (string | undefined)[], prefix: string): string => {
  const nums = numbers
    .filter((n): n is string => !!n && n.startsWith(prefix))
    .map(n => parseInt(n.substring(prefix.length), 10) || 0);
  const max = nums.length ? Math.max(...nums) : 0;
  return `${prefix}${String(max + 1).padStart(3, '0')}`;
};

export const generateEmployeeNumber = async (): Promise<string> => {
  const all = await getItems<EmployeeMaster>(KEYS.EMPLOYEES);
  return nextMasterNumber(all.map(e => e.employee_number), 'MA-');
};

export const generateArticleNumber = async (): Promise<string> => {
  const all = await getItems<MaterialMaster>(KEYS.MATERIALS);
  return nextMasterNumber(all.map(m => m.article_number), 'MAT-');
};

export const generateMachineNumber = async (): Promise<string> => {
  const all = await getItems<MachineMaster>(KEYS.MACHINES);
  return nextMasterNumber(all.map(m => m.machine_number), 'MG-');
};

export interface EmployeeWageRate {
  id: string;
  name: string; // z.B. "Satz 2", "Notdienst", "Verrechnungssatz"
  rate: number; // €/Stunde
}

export interface EmployeeMaster {
  id: string;
  employee_number?: string; // z.B. MA-001, automatisch vergeben, anpassbar
  sort_order?: number; // Reihenfolge: 1 = zuerst (z.B. 1. Meister, 2. Vorarbeiter)
  name: string;
  role?: string; // z.B. "Dachdecker", "Geselle", "Azubi"
  hourly_rate?: number; // €/Stunde (Standard-Satz)
  wage_rates?: EmployeeWageRate[]; // Weitere Stundensätze, im Rapport auswählbar
  phone?: string;
  mobile?: string; // Handynummer
  email?: string;
  color?: string; // Optionale Farbe für Schnellauswahl
  active: boolean;
  created_at: string;
  updated_at: string;
}

export const EmployeeMasterService = {
  getAll: async (): Promise<EmployeeMaster[]> => {
    const all = await getItems<EmployeeMaster>(KEYS.EMPLOYEES);
    return all.sort((a, b) => a.name.localeCompare(b.name, 'de'));
  },

  getActive: async (): Promise<EmployeeMaster[]> => {
    const all = await EmployeeMasterService.getAll();
    return all.filter((e) => e.active !== false);
  },

  getById: async (id: string): Promise<EmployeeMaster | null> => {
    const all = await getItems<EmployeeMaster>(KEYS.EMPLOYEES);
    return all.find((e) => e.id === id) || null;
  },

  create: async (data: Omit<EmployeeMaster, 'id' | 'created_at' | 'updated_at'>): Promise<EmployeeMaster> => {
    const all = await getItems<EmployeeMaster>(KEYS.EMPLOYEES);
    const newEmp: EmployeeMaster = {
      ...data,
      id: generateId(),
      active: data.active !== false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    all.push(newEmp);
    await setItems(KEYS.EMPLOYEES, all);
    return newEmp;
  },

  update: async (id: string, data: Partial<EmployeeMaster>): Promise<EmployeeMaster | null> => {
    const all = await getItems<EmployeeMaster>(KEYS.EMPLOYEES);
    const idx = all.findIndex((e) => e.id === id);
    if (idx === -1) return null;
    all[idx] = { ...all[idx], ...data, updated_at: new Date().toISOString() };
    await setItems(KEYS.EMPLOYEES, all);
    return all[idx];
  },

  delete: async (id: string): Promise<void> => {
    const all = await getItems<EmployeeMaster>(KEYS.EMPLOYEES);
    const filtered = all.filter((e) => e.id !== id);
    await setItems(KEYS.EMPLOYEES, filtered);
  },
};

// ============ MATERIALS (Stammdaten Material) - Pro Feature ============

export interface MaterialMaster {
  id: string;
  name: string;
  unit: string; // z.B. "Stk", "m", "m²", "kg", "L"
  default_quantity?: number;
  category?: string; // z.B. "Dachziegel", "Holz", "Verbindungsmittel"
  purchase_price?: number; // EK-Preis €
  markup_percent?: number; // Aufschlag in % (EK -> VK)
  price_per_unit?: number; // VK-Preis € (wird in Kostenberechnung verwendet)
  supplier?: string;
  article_number?: string;
  note?: string;
  // Erweiterte Material-Verwaltung
  photo?: string; // base64 Foto
  stock_quantity?: number; // aktueller Lagerbestand
  low_stock_threshold?: number; // Schwelle für „Niedriger Bestand"
  storage_location?: string; // z.B. „Regal 01-02", „Schrank 3", „Werkstatt"
  active: boolean;
  created_at: string;
  updated_at: string;
}

export const MaterialMasterService = {
  getAll: async (): Promise<MaterialMaster[]> => {
    const all = await getItems<MaterialMaster>(KEYS.MATERIALS);
    return all.sort((a, b) => a.name.localeCompare(b.name, 'de'));
  },

  getActive: async (): Promise<MaterialMaster[]> => {
    const all = await MaterialMasterService.getAll();
    return all.filter((m) => m.active !== false);
  },

  getById: async (id: string): Promise<MaterialMaster | null> => {
    const all = await getItems<MaterialMaster>(KEYS.MATERIALS);
    return all.find((m) => m.id === id) || null;
  },

  create: async (data: Omit<MaterialMaster, 'id' | 'created_at' | 'updated_at'>): Promise<MaterialMaster> => {
    const all = await getItems<MaterialMaster>(KEYS.MATERIALS);
    const newMat: MaterialMaster = {
      ...data,
      id: generateId(),
      active: data.active !== false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    all.push(newMat);
    await setItems(KEYS.MATERIALS, all);
    return newMat;
  },

  update: async (id: string, data: Partial<MaterialMaster>): Promise<MaterialMaster | null> => {
    const all = await getItems<MaterialMaster>(KEYS.MATERIALS);
    const idx = all.findIndex((m) => m.id === id);
    if (idx === -1) return null;
    all[idx] = { ...all[idx], ...data, updated_at: new Date().toISOString() };
    await setItems(KEYS.MATERIALS, all);
    return all[idx];
  },

  delete: async (id: string): Promise<void> => {
    const all = await getItems<MaterialMaster>(KEYS.MATERIALS);
    const filtered = all.filter((m) => m.id !== id);
    await setItems(KEYS.MATERIALS, filtered);
  },
};

// ============ MACHINE CATEGORY SERVICE ============
export interface MachineCategory {
  id: string;
  name: string;
  created_at: string;
}

export const MachineCategoryService = {
  getAll: async (): Promise<MachineCategory[]> => {
    const all = await getItems<MachineCategory>(KEYS.MACHINE_CATEGORIES);
    return all.sort((a, b) => a.name.localeCompare(b.name, 'de'));
  },

  add: async (name: string): Promise<MachineCategory | null> => {
    const trimmed = (name || '').trim();
    if (!trimmed) return null;
    const all = await getItems<MachineCategory>(KEYS.MACHINE_CATEGORIES);
    const existing = all.find(c => c.name.toLowerCase() === trimmed.toLowerCase());
    if (existing) return existing;
    const newCat: MachineCategory = {
      id: generateId(),
      name: trimmed,
      created_at: new Date().toISOString(),
    };
    all.push(newCat);
    await setItems(KEYS.MACHINE_CATEGORIES, all);
    return newCat;
  },

  deleteByName: async (name: string): Promise<void> => {
    const trimmed = (name || '').trim().toLowerCase();
    if (!trimmed) return;
    const all = await getItems<MachineCategory>(KEYS.MACHINE_CATEGORIES);
    const filtered = all.filter(c => c.name.toLowerCase() !== trimmed);
    await setItems(KEYS.MACHINE_CATEGORIES, filtered);
  },

  delete: async (id: string): Promise<void> => {
    const all = await getItems<MachineCategory>(KEYS.MACHINE_CATEGORIES);
    const filtered = all.filter(c => c.id !== id);
    await setItems(KEYS.MACHINE_CATEGORIES, filtered);
  },
};

// ============ MATERIAL CATEGORY SERVICE ============
export interface MaterialCategory {
  id: string;
  name: string;
  created_at: string;
}

export const MaterialCategoryService = {
  getAll: async (): Promise<MaterialCategory[]> => {
    const all = await getItems<MaterialCategory>(KEYS.MATERIAL_CATEGORIES);
    return all.sort((a, b) => a.name.localeCompare(b.name, 'de'));
  },

  add: async (name: string): Promise<MaterialCategory | null> => {
    const trimmed = (name || '').trim();
    if (!trimmed) return null;
    const all = await getItems<MaterialCategory>(KEYS.MATERIAL_CATEGORIES);
    const existing = all.find(c => c.name.toLowerCase() === trimmed.toLowerCase());
    if (existing) return existing;
    const newCat: MaterialCategory = {
      id: generateId(),
      name: trimmed,
      created_at: new Date().toISOString(),
    };
    all.push(newCat);
    await setItems(KEYS.MATERIAL_CATEGORIES, all);
    return newCat;
  },

  deleteByName: async (name: string): Promise<void> => {
    const trimmed = (name || '').trim().toLowerCase();
    if (!trimmed) return;
    const all = await getItems<MaterialCategory>(KEYS.MATERIAL_CATEGORIES);
    const filtered = all.filter(c => c.name.toLowerCase() !== trimmed);
    await setItems(KEYS.MATERIAL_CATEGORIES, filtered);
  },

  delete: async (id: string): Promise<void> => {
    const all = await getItems<MaterialCategory>(KEYS.MATERIAL_CATEGORIES);
    const filtered = all.filter(c => c.id !== id);
    await setItems(KEYS.MATERIAL_CATEGORIES, filtered);
  },
};

// ============ MATERIAL LOCATION SERVICE ============
export interface MaterialLocation {
  id: string;
  name: string;
  created_at: string;
}

export const MaterialLocationService = {
  getAll: async (): Promise<MaterialLocation[]> => {
    const all = await getItems<MaterialLocation>(KEYS.MATERIAL_LOCATIONS);
    return all.sort((a, b) => a.name.localeCompare(b.name, 'de'));
  },
  add: async (name: string): Promise<MaterialLocation | null> => {
    const trimmed = (name || '').trim();
    if (!trimmed) return null;
    const all = await getItems<MaterialLocation>(KEYS.MATERIAL_LOCATIONS);
    const existing = all.find(c => c.name.toLowerCase() === trimmed.toLowerCase());
    if (existing) return existing;
    const newItem: MaterialLocation = { id: generateId(), name: trimmed, created_at: new Date().toISOString() };
    all.push(newItem);
    await setItems(KEYS.MATERIAL_LOCATIONS, all);
    return newItem;
  },
  deleteByName: async (name: string): Promise<void> => {
    const trimmed = (name || '').trim().toLowerCase();
    if (!trimmed) return;
    const all = await getItems<MaterialLocation>(KEYS.MATERIAL_LOCATIONS);
    const filtered = all.filter(c => c.name.toLowerCase() !== trimmed);
    await setItems(KEYS.MATERIAL_LOCATIONS, filtered);
  },
};

// ============ MATERIAL SUPPLIER SERVICE ============
export interface MaterialSupplier {
  id: string;
  name: string;
  created_at: string;
}

export const MaterialSupplierService = {
  getAll: async (): Promise<MaterialSupplier[]> => {
    const all = await getItems<MaterialSupplier>(KEYS.MATERIAL_SUPPLIERS);
    return all.sort((a, b) => a.name.localeCompare(b.name, 'de'));
  },
  add: async (name: string): Promise<MaterialSupplier | null> => {
    const trimmed = (name || '').trim();
    if (!trimmed) return null;
    const all = await getItems<MaterialSupplier>(KEYS.MATERIAL_SUPPLIERS);
    const existing = all.find(c => c.name.toLowerCase() === trimmed.toLowerCase());
    if (existing) return existing;
    const newItem: MaterialSupplier = { id: generateId(), name: trimmed, created_at: new Date().toISOString() };
    all.push(newItem);
    await setItems(KEYS.MATERIAL_SUPPLIERS, all);
    return newItem;
  },
  deleteByName: async (name: string): Promise<void> => {
    const trimmed = (name || '').trim().toLowerCase();
    if (!trimmed) return;
    const all = await getItems<MaterialSupplier>(KEYS.MATERIAL_SUPPLIERS);
    const filtered = all.filter(c => c.name.toLowerCase() !== trimmed);
    await setItems(KEYS.MATERIAL_SUPPLIERS, filtered);
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
  Reports: ReportService,
  Employees: EmployeeMasterService,
  Materials: MaterialMasterService,
  Machines: MachineMasterService,
  MachineCategories: MachineCategoryService,
  MaterialCategories: MaterialCategoryService,
  MaterialLocations: MaterialLocationService,
  MaterialSuppliers: MaterialSupplierService,
};

export default LocalStorage;

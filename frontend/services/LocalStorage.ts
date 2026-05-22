import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
// FIX: Verwende legacy expo-file-system API um Deprecation-Fehler zu vermeiden
import * as FileSystem from 'expo-file-system/legacy';

// CloudKit storage disabled for now - using AsyncStorage only
// The iCloud integration requires additional native configuration
let CloudKitStorage: any = null;

// FIX: Dateibasierte Bildspeicherung für große Bilder (umgeht AsyncStorage-Limits)
// Verwende cacheDirectory als Fallback wenn documentDirectory nicht verfügbar
const getImageDir = () => {
  const baseDir = FileSystem.documentDirectory || FileSystem.cacheDirectory || '';
  return `${baseDir}images/`;
};
const IMAGE_DIR = getImageDir();

// Initialisiere Image-Verzeichnis
const initImageDir = async () => {
  try {
    const imageDir = getImageDir();
    if (!imageDir) {
      console.error('[ImageStorage] No valid directory available');
      return false;
    }
    // FIX: Versuche das Verzeichnis zu erstellen ohne vorher zu prüfen ob es existiert
    // makeDirectoryAsync mit intermediates: true erstellt das Verzeichnis nur wenn nötig
    try {
      await FileSystem.makeDirectoryAsync(imageDir, { intermediates: true });
      console.log('[ImageStorage] Created/verified image directory:', imageDir);
    } catch (mkdirErr: any) {
      // Ignoriere "already exists" Fehler
      if (!mkdirErr.message?.includes('already exists') && !mkdirErr.message?.includes('File exists')) {
        throw mkdirErr;
      }
    }
    return true;
  } catch (e) {
    console.error('[ImageStorage] Error creating image directory:', e);
    return false;
  }
};

// Rufe initImageDir beim Import auf
initImageDir();

// Bild als Datei speichern (robuster als AsyncStorage für große Daten)
const saveImageToFile = async (key: string, base64Data: string): Promise<boolean> => {
  try {
    const dirReady = await initImageDir();
    if (!dirReady) {
      throw new Error('Image directory not available');
    }
    const imageDir = getImageDir();
    const filePath = `${imageDir}${key}.txt`;
    await FileSystem.writeAsStringAsync(filePath, base64Data, { encoding: FileSystem.EncodingType.UTF8 });
    console.log(`[ImageStorage] Saved image to file: ${key} (${Math.round(base64Data.length / 1024)}KB)`);
    return true;
  } catch (e) {
    console.error(`[ImageStorage] Error saving image to file ${key}:`, e);
    // Fallback zu AsyncStorage
    try {
      await AsyncStorage.setItem(key, base64Data);
      console.log(`[ImageStorage] Fallback: Saved to AsyncStorage: ${key}`);
      return true;
    } catch (e2) {
      console.error(`[ImageStorage] Fallback also failed for ${key}:`, e2);
      return false;
    }
  }
};

// Bild aus Datei laden
const loadImageFromFile = async (key: string): Promise<string | null> => {
  try {
    const filePath = `${IMAGE_DIR}${key}.txt`;
    // FIX: Versuche die Datei direkt zu lesen statt vorher zu prüfen
    try {
      const data = await FileSystem.readAsStringAsync(filePath, { encoding: FileSystem.EncodingType.UTF8 });
      console.log(`[ImageStorage] Loaded image from file: ${key} (${Math.round(data.length / 1024)}KB)`);
      return data;
    } catch (readErr) {
      // Datei existiert nicht
    }
  } catch (e) {
    console.log(`[ImageStorage] File not found for ${key}, trying AsyncStorage`);
  }
  
  // Fallback zu AsyncStorage (für alte Daten)
  try {
    const data = await AsyncStorage.getItem(key);
    if (data) {
      console.log(`[ImageStorage] Loaded from AsyncStorage: ${key}`);
      // Migriere zu Datei für zukünftige Zugriffe
      saveImageToFile(key, data).catch(() => {});
    }
    return data;
  } catch (e) {
    console.error(`[ImageStorage] Error loading ${key}:`, e);
    return null;
  }
};

// Bild-Datei löschen
const deleteImageFile = async (key: string): Promise<void> => {
  try {
    const filePath = `${IMAGE_DIR}${key}.txt`;
    // FIX: Versuche direkt zu löschen ohne vorher zu prüfen
    try {
      await FileSystem.deleteAsync(filePath);
      console.log(`[ImageStorage] Deleted file: ${key}`);
    } catch (deleteErr) {
      // Datei existiert nicht - ignorieren
    }
  } catch (e) {
    console.log(`[ImageStorage] Error deleting file ${key}:`, e);
  }
  // Auch aus AsyncStorage löschen (falls dort noch vorhanden)
  try {
    await AsyncStorage.removeItem(key);
  } catch (e) {
    // Ignorieren
  }
};

// Cleanup-Funktion: Entfernt verwaiste Bild-Dateien die nicht mehr zu Skizzen gehören
// Diese Funktion sollte beim App-Start aufgerufen werden
const cleanupOrphanedImageFiles = async (): Promise<{ removed: number; errors: number }> => {
  try {
    const imageDir = getImageDir();
    if (!imageDir) return { removed: 0, errors: 0 };
    
    // Prüfe ob Verzeichnis existiert
    let files: string[] = [];
    try {
      files = await FileSystem.readDirectoryAsync(imageDir);
    } catch (e) {
      // Verzeichnis existiert nicht
      return { removed: 0, errors: 0 };
    }
    
    if (files.length === 0) return { removed: 0, errors: 0 };
    
    console.log(`[cleanupOrphanedImageFiles] Found ${files.length} files in image directory`);
    
    let removed = 0;
    let errors = 0;
    
    // Sammle alle gültigen Bild-Keys von existierenden Skizzen
    const validKeys = new Set<string>();
    
    try {
      const sketchesStr = await AsyncStorage.getItem(KEYS.SKETCHES);
      if (sketchesStr) {
        const sketches = JSON.parse(sketchesStr);
        for (const sketch of sketches) {
          // Hintergrundbild
          validKeys.add(`sketch_bg_${sketch.id}.txt`);
          
          // Lade Metadata für Bild-Elemente
          try {
            const metaStr = await AsyncStorage.getItem(`sketch_meta_${sketch.id}`);
            if (metaStr) {
              const meta = JSON.parse(metaStr);
              if (meta?.elements) {
                for (const el of meta.elements) {
                  if (el.data?.imageStorageKey) {
                    validKeys.add(`${el.data.imageStorageKey}.txt`);
                  }
                }
              }
            }
          } catch (e) {
            // Überspringe ungültige Metadata
          }
        }
      }
    } catch (e) {
      console.error('[cleanupOrphanedImageFiles] Error loading sketches:', e);
    }
    
    // Auch Photo-Service Bilder als gültig markieren
    try {
      const photosStr = await AsyncStorage.getItem(KEYS.PHOTOS);
      if (photosStr) {
        const photos = JSON.parse(photosStr);
        for (const photo of photos) {
          validKeys.add(`photo_img_${photo.id}.txt`);
        }
      }
    } catch (e) {
      // Ignorieren
    }
    
    console.log(`[cleanupOrphanedImageFiles] Found ${validKeys.size} valid image keys`);
    
    // Lösche verwaiste Dateien (die nicht in validKeys sind)
    for (const file of files) {
      if (!validKeys.has(file)) {
        try {
          await FileSystem.deleteAsync(`${imageDir}${file}`);
          removed++;
          console.log(`[cleanupOrphanedImageFiles] Removed orphaned file: ${file}`);
        } catch (e) {
          errors++;
        }
      }
    }
    
    console.log(`[cleanupOrphanedImageFiles] Cleanup complete: removed ${removed} files, ${errors} errors`);
    return { removed, errors };
  } catch (e) {
    console.error('[cleanupOrphanedImageFiles] Error:', e);
    return { removed: 0, errors: 1 };
  }
};

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
    } catch (error: any) {
      console.error(`[storage.setItem] CRITICAL ERROR saving ${key}:`, error);
      console.error(`[storage.setItem] Value size: ${Math.round(value.length / 1024)}KB`);
      // RE-THROW the error so callers know the save failed!
      throw error;
    }
  },

  removeItem: async (key: string): Promise<void> => {
    try {
      await AsyncStorage.removeItem(key);
      if (Platform.OS === 'ios' && CloudKitStorage) {
        await CloudKitStorage.removeItem(key);
      }
    } catch (error) {
      console.error(`[storage.removeItem] Error removing ${key}:`, error);
      throw error;
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
    if (!data) {
      // Key existiert nicht oder ist leer - das ist OK, leeres Array zurückgeben
      return [];
    }
    
    // Versuche JSON zu parsen
    try {
      const parsed = JSON.parse(data);
      // Validiere dass es ein Array ist
      if (!Array.isArray(parsed)) {
        console.error(`[getItems] WARNUNG: ${key} ist kein Array, sondern:`, typeof parsed);
        return [];
      }
      return parsed;
    } catch (parseError) {
      // KRITISCH: JSON Parse Fehler bedeutet korrupte Daten
      console.error(`[getItems] KRITISCHER FEHLER: JSON parse für ${key} fehlgeschlagen:`, parseError);
      console.error(`[getItems] Daten-Länge: ${data.length} Zeichen, Anfang: ${data.substring(0, 100)}...`);
      
      // NICHT leeres Array zurückgeben! Das würde alle Daten löschen!
      // Stattdessen Fehler werfen, damit der Aufrufer reagieren kann
      throw new Error(`Daten für ${key} sind beschädigt. Parse-Fehler: ${parseError}`);
    }
  } catch (error: any) {
    // Wenn es ein Parse-Fehler war, den wir selbst geworfen haben, weiterwerfen
    if (error.message?.includes('beschädigt') || error.message?.includes('Parse-Fehler')) {
      throw error;
    }
    // KRITISCH FIX: Auch bei Storage-Fehlern NICHT leeres Array zurückgeben!
    // Das würde ALLE DATEN LÖSCHEN wenn Migration oder andere Funktionen laufen!
    console.error(`[getItems] KRITISCHER STORAGE-FEHLER für ${key}:`, error);
    // Werfe Fehler statt leeres Array - der Aufrufer muss entscheiden was zu tun ist
    throw new Error(`Storage-Fehler für ${key}: ${error.message || 'Speicher möglicherweise voll oder nicht verfügbar'}`);
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
        if (!value) {
          result.set(key, []);
        } else {
          const parsed = JSON.parse(value);
          // Validiere dass es ein Array ist
          if (!Array.isArray(parsed)) {
            console.warn(`[multiGet] ${key} ist kein Array`);
            result.set(key, []);
          } else {
            result.set(key, parsed);
          }
        }
      } catch (parseError) {
        // KRITISCH: Bei Parse-Fehler nicht einfach leeres Array setzen!
        console.error(`[multiGet] KRITISCHER FEHLER: JSON parse für ${key} fehlgeschlagen:`, parseError);
        console.error(`[multiGet] Daten-Länge: ${value?.length || 0} Zeichen`);
        // Bei Batch-Read werfen wir einen Fehler damit der Aufrufer weiß dass Daten beschädigt sind
        throw new Error(`Daten für ${key} sind beschädigt beim Batch-Read`);
      }
    }
    console.log('[multiGet] Read', keys.length, 'keys in', Date.now() - startTime, 'ms');
    return result;
  } catch (error: any) {
    console.error('[multiGet] Fehler:', error);
    
    // Bei Parse-Fehlern nicht fallback zu einzelnen Reads - das würde das Problem nur verlagern
    if (error.message?.includes('beschädigt')) {
      throw error;
    }
    
    // Fallback to individual reads nur bei anderen Fehlern (z.B. Netzwerk)
    const result = new Map<string, any[]>();
    for (const key of keys) {
      try {
        result.set(key, await getItems(key));
      } catch (itemError) {
        console.error(`[multiGet] Fallback-Read für ${key} fehlgeschlagen:`, itemError);
        throw itemError; // Nicht verschlucken!
      }
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
  
  // Bilddaten separat laden (neue Speicherstruktur: Datei statt AsyncStorage)
  // FIX: Lade Fotos einzeln aus Datei (umgeht AsyncStorage-Limits auf Samsung/Android)
  if (photos.length > 0) {
    const migrationOps: Promise<any>[] = [];
    
    for (let i = 0; i < photos.length; i++) {
      const photoId = photos[i].id;
      try {
        // Primär: Aus Datei laden
        const imageData = await loadImageFromFile(`photo_img_${photoId}`);
        if (imageData && imageData.length > 100) {
          photos[i].image_data = imageData;
          photos[i].uri = imageData;
        } else {
          // Fallback: Prüfe ob Inline-Daten vorhanden sind (alte Fotos)
          const inlineData = photos[i].image_data || photos[i].uri;
          if (inlineData && inlineData.length > 100) {
            console.log(`[loadAllProjectDataFast] Using inline data for photo ${photoId}`);
            photos[i].image_data = inlineData;
            photos[i].uri = inlineData;
            // Queue migration to file storage
            migrationOps.push(
              saveImageToFile(`photo_img_${photoId}`, inlineData).catch(err => 
                console.error(`[loadAllProjectDataFast] Migration error for photo ${photoId}:`, err)
              )
            );
          } else {
            console.warn(`[loadAllProjectDataFast] No image data for photo ${photoId}`);
          }
        }
      } catch (e) {
        console.error(`[loadAllProjectDataFast] Error loading photo ${photoId}:`, e);
        // Try inline fallback even on error
        const inlineData = photos[i].image_data || photos[i].uri;
        if (inlineData && inlineData.length > 100) {
          photos[i].image_data = inlineData;
          photos[i].uri = inlineData;
        }
      }
    }
    
    // Run migrations in background
    if (migrationOps.length > 0) {
      Promise.all(migrationOps).then(() => {
        console.log(`[loadAllProjectDataFast] Migrated ${migrationOps.length} photos to file storage`);
      });
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
  
  const checklists = (allData.get(KEYS.CHECKLISTS) || []).filter((c: any) => c.project_id === projectId);
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
    const jsonStr = JSON.stringify(items);
    console.log(`[setItems] Saving ${key}, size: ${Math.round(jsonStr.length / 1024)}KB`);
    await storage.setItem(key, jsonStr);
  } catch (error: any) {
    console.error(`[setItems] CRITICAL ERROR setting ${key}:`, error);
    // RE-THROW so the caller knows the save failed!
    throw error;
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
        storage.setItem(`sketch_meta_${id}`, JSON.stringify(metaWithoutBg)),
      ];

      // Save background image to its own key
      if (backgroundImage) {
        saveOps.push(storage.setItem(`sketch_bg_${id}`, backgroundImage));
      } else {
        // Remove old background if cleared
        saveOps.push(storage.removeItem(`sketch_bg_${id}`));
      }

      await Promise.all(saveOps);
    } catch (error) {
      console.error(`[SketchService] Error saving sketch data for ${id}:`, error);
      throw error; // RE-THROW to propagate error to caller
    }
  },

  create: async (data: Omit<Sketch, 'id' | 'created_at' | 'updated_at'>): Promise<Sketch> => {
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

    // CRITICAL FIX: Save heavy data FIRST, then update list
    // This prevents data loss if heavy data save fails
    if (heavyMetadata) {
      try {
        const meta = JSON.parse(heavyMetadata);
        const bg = meta.backgroundImage || null;
        const metaWithoutBg = { ...meta };
        delete metaWithoutBg.backgroundImage;
        
        // Save metadata first
        await storage.setItem(`sketch_meta_${id}`, JSON.stringify(metaWithoutBg));
        
        // Then save background image if exists
        if (bg) {
          await storage.setItem(`sketch_bg_${id}`, bg);
        }
      } catch (e: any) {
        // If metadata save fails, throw error BEFORE updating the list
        console.error(`[SketchService.create] Failed to save metadata for ${id}:`, e);
        throw new Error(`Skizze konnte nicht gespeichert werden: ${e.message || 'Speicher voll'}`);
      }
    }

    // Only update the list AFTER heavy data is saved successfully
    // KRITISCH: Wenn getItems fehlschlägt (z.B. korrupte Daten), NICHT mit leerem Array weitermachen!
    let sketches: Sketch[];
    try {
      sketches = await getItems<Sketch>(KEYS.SKETCHES);
    } catch (getError: any) {
      console.error('[SketchService.create] KRITISCH: Fehler beim Lesen der Skizzen-Liste:', getError);
      // Fehler nach oben werfen - NICHT mit leerem Array weitermachen, das würde alle Daten löschen!
      throw new Error(`Skizzen-Liste konnte nicht gelesen werden: ${getError.message}`);
    }
    
    sketches.push(lightSketch);
    await setItems(KEYS.SKETCHES, sketches);

    return { ...lightSketch, metadata: heavyMetadata };
  },

  update: async (id: string, data: Partial<Sketch>): Promise<Sketch | null> => {
    // KRITISCH: Wenn getItems fehlschlägt, nicht weitermachen!
    let sketches: Sketch[];
    try {
      sketches = await getItems<Sketch>(KEYS.SKETCHES);
    } catch (getError: any) {
      console.error('[SketchService.update] KRITISCH: Fehler beim Lesen der Skizzen-Liste:', getError);
      throw new Error(`Skizzen-Liste konnte nicht gelesen werden: ${getError.message}`);
    }
    
    const index = sketches.findIndex(s => s.id === id);
    if (index === -1) return null;

    // Extract heavy data
    const heavyMetadata = data.metadata;
    const lightData = { ...data };
    delete lightData.metadata; // Don't store metadata in main array

    // CRITICAL FIX: Save heavy data FIRST, then update list
    if (heavyMetadata) {
      try {
        const meta = JSON.parse(heavyMetadata);
        const bg = meta.backgroundImage || null;
        const metaWithoutBg = { ...meta };
        delete metaWithoutBg.backgroundImage;
        
        // Save metadata first
        await storage.setItem(`sketch_meta_${id}`, JSON.stringify(metaWithoutBg));
        
        // Then handle background image
        if (bg) {
          await storage.setItem(`sketch_bg_${id}`, bg);
        } else {
          await storage.removeItem(`sketch_bg_${id}`);
        }
      } catch (e: any) {
        // If metadata save fails, throw error BEFORE updating the list
        console.error(`[SketchService.update] Failed to save metadata for ${id}:`, e);
        throw new Error(`Skizze konnte nicht aktualisiert werden: ${e.message || 'Speicher voll'}`);
      }
    }

    // Only update the list AFTER heavy data is saved successfully
    sketches[index] = { ...sketches[index], ...lightData, updated_at: new Date().toISOString() };
    await setItems(KEYS.SKETCHES, sketches);

    return sketches[index];
  },

  delete: async (id: string): Promise<boolean> => {
    // KRITISCH: Wenn getItems fehlschlägt, nicht löschen!
    let sketches: Sketch[];
    try {
      sketches = await getItems<Sketch>(KEYS.SKETCHES);
    } catch (getError: any) {
      console.error('[SketchService.delete] KRITISCH: Fehler beim Lesen der Skizzen-Liste:', getError);
      throw new Error(`Skizzen-Liste konnte nicht gelesen werden: ${getError.message}`);
    }
    
    const filtered = sketches.filter(s => s.id !== id);

    // CRITICAL FIX: Lade Metadata um alle Bild-Dateien zu finden BEVOR gelöscht wird
    const cleanupOps: Promise<void>[] = [];
    
    try {
      const metaStr = await AsyncStorage.getItem(`sketch_meta_${id}`);
      if (metaStr) {
        const meta = JSON.parse(metaStr);
        if (meta?.elements) {
          for (const el of meta.elements) {
            // Lösche Bild-Dateien aus dem Dateisystem
            if (el.data?.imageStorageKey) {
              console.log(`[SketchService.delete] Cleaning up image file: ${el.data.imageStorageKey}`);
              cleanupOps.push(deleteImageFile(el.data.imageStorageKey));
            }
          }
        }
      }
    } catch (e) {
      console.error(`[SketchService.delete] Error loading metadata for cleanup:`, e);
    }
    
    // Lösche Hintergrundbild-Datei
    console.log(`[SketchService.delete] Cleaning up background image: sketch_bg_${id}`);
    cleanupOps.push(deleteImageFile(`sketch_bg_${id}`));
    
    // Lösche Haupteintrag + separate Daten-Keys parallel
    cleanupOps.push(setItems(KEYS.SKETCHES, filtered));
    cleanupOps.push(AsyncStorage.removeItem(`sketch_meta_${id}`));
    cleanupOps.push(AsyncStorage.removeItem(`sketch_bg_${id}`));
    
    await Promise.all(cleanupOps);
    console.log(`[SketchService.delete] Successfully deleted sketch ${id} and all associated files`);
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
      
      // KRITISCHER SICHERHEITS-CHECK: Verifikation dass Daten wirklich gelesen werden können
      let sketches: Sketch[];
      try {
        sketches = await getItems<Sketch>(KEYS.SKETCHES);
      } catch (getError: any) {
        console.error('[SketchService] KRITISCH: Migration abgebrochen - Sketches konnten nicht gelesen werden:', getError);
        // NICHT weitermachen - das würde alle Daten löschen!
        return;
      }
      
      // ZUSÄTZLICHER SICHERHEITS-CHECK: Wenn 0 Sketches, prüfe ob wirklich leer oder Fehler
      if (sketches.length === 0) {
        try {
          const rawData = await AsyncStorage.getItem(KEYS.SKETCHES);
          if (rawData && rawData !== '[]' && rawData !== 'null' && rawData.length > 2) {
            console.error('[SketchService] WARNUNG: getItems gab leeres Array zurück, aber rawData existiert! Länge:', rawData.length);
            console.error('[SketchService] Migration abgebrochen um Datenverlust zu verhindern');
            return; // Nicht weitermachen!
          }
        } catch (e) {
          console.log('[SketchService] Keine existierenden Sketches gefunden, Migration nicht nötig');
        }
      }
      
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
      // FIX: Bilddaten aus Datei laden (primär) oder AsyncStorage (Fallback)
      const imageData = await loadImageFromFile(`photo_img_${id}`);
      if (imageData) {
        photo.image_data = imageData;
        photo.uri = imageData;
      } else if (!photo.image_data && !photo.uri) {
        // Kein separates Bild und kein Inline-Bild → kein Bild verfügbar
        console.warn(`[PhotoService.getById] No image data for photo ${id}`);
      }
    }
    return photo;
  },

  getByProjectId: async (projectId: string): Promise<Photo[]> => {
    const photos = await getItems<Photo>(KEYS.PHOTOS);
    const projectPhotos = photos.filter(p => p.project_id === projectId);
    // FIX: Bilddaten aus DATEI laden für jedes Foto (nicht AsyncStorage - umgeht Limits)
    for (const photo of projectPhotos) {
      try {
        const imageData = await loadImageFromFile(`photo_img_${photo.id}`);
        if (imageData) {
          photo.image_data = imageData;
          photo.uri = imageData;
        } else if (photo.image_data && photo.image_data.length > 100) {
          // Migration: Altes Foto hat Bilddaten noch im Array
          // Als Datei speichern für zukünftige Nutzung
          await saveImageToFile(`photo_img_${photo.id}`, photo.image_data);
        } else if (photo.uri && photo.uri.length > 100) {
          photo.image_data = photo.uri;
          await saveImageToFile(`photo_img_${photo.id}`, photo.uri);
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
    
    // FIX: Bilddaten als DATEI speichern (nicht AsyncStorage - umgeht Limits auf Samsung/Android)
    const imageData = data.image_data || data.uri || '';
    if (imageData && imageData.length > 100) {
      const success = await saveImageToFile(`photo_img_${newId}`, imageData);
      if (!success) {
        console.error(`[PhotoService.create] Failed to save image for photo ${newId}`);
        // Trotzdem fortfahren - Metadaten werden gespeichert
      }
    }
    
    // MIGRATION: Alte Fotos mit Inline-Bilddaten ebenfalls migrieren
    // Damit das Array klein bleibt und JSON.stringify nicht crasht
    for (const existingPhoto of photos) {
      const inlineData = existingPhoto.image_data || existingPhoto.uri || '';
      if (inlineData.length > 200) {
        // Bilddaten als Datei speichern (falls noch nicht geschehen)
        try {
          const alreadyMigrated = await loadImageFromFile(`photo_img_${existingPhoto.id}`);
          if (!alreadyMigrated) {
            await saveImageToFile(`photo_img_${existingPhoto.id}`, inlineData);
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
    // FIX: Bild aus Datei UND AsyncStorage löschen
    try {
      await deleteImageFile(`photo_img_${id}`);
    } catch (e) {
      console.log(`Error removing photo image ${id}:`, e);
    }
    return true;
  },
};

// Exportiere Image-Storage-Funktionen für externe Nutzung (z.B. Skizzen)
export { saveImageToFile, loadImageFromFile, deleteImageFile };

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
    // Keine Standard-Vorlagen mehr erstellen - leere Liste zurückgeben wenn keine vorhanden
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
  // Utility-Funktionen
  cleanupOrphanedImageFiles,
};

export default LocalStorage;

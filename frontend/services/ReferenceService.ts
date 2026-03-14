import AsyncStorage from '@react-native-async-storage/async-storage';
import { File, Directory, Paths } from 'expo-file-system';

// Storage Keys
const KEYS = {
  REFERENCE_FOLDERS: 'aufmassprofi_reference_folders',
  REFERENCE_PHOTOS: 'aufmassprofi_reference_photos',
  EXTERNAL_FOLDERS: 'aufmassprofi_external_folders',
};

// Types
export interface ReferenceFolder {
  id: string;
  name: string;
  parent_id?: string; // For subfolders
  thumbnail_uri?: string;
  thumbnail_photo_id?: string; // Selected thumbnail photo
  photo_count: number;
  subfolder_count?: number;
  created_at: string;
  updated_at: string;
}

export interface ReferencePhoto {
  id: string;
  folder_id: string;
  name?: string; // Optional photo name for search
  uri: string;
  original_uri: string;
  source: 'camera' | 'gallery' | 'files';
  created_at: string;
}

export interface ExternalFolder {
  id: string;
  name: string;
  uri: string; // Path to external folder
  linked_at: string;
  is_available?: boolean;
}

// Helper to generate unique IDs
const generateId = (): string => {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
};

// Get the reference photos directory
const getReferencesDirectory = (): Directory => {
  return new Directory(Paths.document, 'ReferenzFotos');
};

// Ensure the references directory exists
const ensureDirectoryExists = async (folderId?: string): Promise<Directory> => {
  const baseDir = getReferencesDirectory();
  
  // Create base directory if not exists (exists is a property, not a method)
  if (!baseDir.exists) {
    await baseDir.create();
  }
  
  if (folderId) {
    const folderDir = new Directory(baseDir, folderId);
    if (!folderDir.exists) {
      await folderDir.create();
    }
    return folderDir;
  }
  
  return baseDir;
};

// Reference Service
export const ReferenceService = {
  // ============ FOLDERS ============
  
  getAllFolders: async (): Promise<ReferenceFolder[]> => {
    try {
      const data = await AsyncStorage.getItem(KEYS.REFERENCE_FOLDERS);
      if (!data) return [];
      
      const folders: ReferenceFolder[] = JSON.parse(data);
      const photos = await ReferenceService.getAllPhotos();
      
      // Update photo counts and subfolders
      return folders.map(folder => {
        const folderPhotos = photos.filter(p => p.folder_id === folder.id);
        const subfolders = folders.filter(f => f.parent_id === folder.id);
        
        // Use selected thumbnail or first photo
        let thumbnailUri = folder.thumbnail_uri;
        if (folder.thumbnail_photo_id) {
          const thumbPhoto = folderPhotos.find(p => p.id === folder.thumbnail_photo_id);
          thumbnailUri = thumbPhoto?.uri;
        }
        if (!thumbnailUri && folderPhotos.length > 0) {
          thumbnailUri = folderPhotos[0].uri;
        }
        
        return {
          ...folder,
          photo_count: folderPhotos.length,
          subfolder_count: subfolders.length,
          thumbnail_uri: thumbnailUri,
        };
      }).sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
    } catch (error) {
      console.error('Error getting folders:', error);
      return [];
    }
  },

  // Get folders by parent (for subfolder navigation)
  getFoldersByParent: async (parentId?: string): Promise<ReferenceFolder[]> => {
    try {
      const allFolders = await ReferenceService.getAllFolders();
      return allFolders.filter(f => f.parent_id === parentId);
    } catch (error) {
      console.error('Error getting folders by parent:', error);
      return [];
    }
  },

  getFolder: async (id: string): Promise<ReferenceFolder | null> => {
    try {
      const folders = await ReferenceService.getAllFolders();
      return folders.find(f => f.id === id) || null;
    } catch (error) {
      console.error('Error getting folder:', error);
      return null;
    }
  },

  createFolder: async (name: string, parentId?: string): Promise<ReferenceFolder> => {
    try {
      const folders = await ReferenceService.getAllFolders();
      const now = new Date().toISOString();
      
      const newFolder: ReferenceFolder = {
        id: generateId(),
        name,
        parent_id: parentId,
        photo_count: 0,
        subfolder_count: 0,
        created_at: now,
        updated_at: now,
      };
      
      // Create physical directory
      await ensureDirectoryExists(newFolder.id);
      
      folders.push(newFolder);
      await AsyncStorage.setItem(KEYS.REFERENCE_FOLDERS, JSON.stringify(folders));
      
      return newFolder;
    } catch (error) {
      console.error('Error creating folder:', error);
      throw error;
    }
  },

  // Set thumbnail for folder (by photo ID)
  setFolderThumbnail: async (folderId: string, photoId: string): Promise<void> => {
    try {
      const data = await AsyncStorage.getItem(KEYS.REFERENCE_FOLDERS);
      if (!data) return;
      
      const folders: ReferenceFolder[] = JSON.parse(data);
      const index = folders.findIndex(f => f.id === folderId);
      
      if (index !== -1) {
        folders[index].thumbnail_photo_id = photoId;
        folders[index].updated_at = new Date().toISOString();
        await AsyncStorage.setItem(KEYS.REFERENCE_FOLDERS, JSON.stringify(folders));
      }
    } catch (error) {
      console.error('Error setting folder thumbnail:', error);
      throw error;
    }
  },

  // Set thumbnail URI directly (without saving photo to folder)
  setFolderThumbnailUri: async (folderId: string, uri: string): Promise<void> => {
    try {
      const data = await AsyncStorage.getItem(KEYS.REFERENCE_FOLDERS);
      if (!data) return;
      
      const folders: ReferenceFolder[] = JSON.parse(data);
      const index = folders.findIndex(f => f.id === folderId);
      
      if (index !== -1) {
        folders[index].thumbnail_uri = uri;
        folders[index].thumbnail_photo_id = undefined; // Clear photo ID reference
        folders[index].updated_at = new Date().toISOString();
        await AsyncStorage.setItem(KEYS.REFERENCE_FOLDERS, JSON.stringify(folders));
      }
    } catch (error) {
      console.error('Error setting folder thumbnail URI:', error);
      throw error;
    }
  },

  updateFolder: async (id: string, updates: Partial<ReferenceFolder>): Promise<ReferenceFolder | null> => {
    try {
      const folders = await ReferenceService.getAllFolders();
      const index = folders.findIndex(f => f.id === id);
      
      if (index === -1) return null;
      
      folders[index] = {
        ...folders[index],
        ...updates,
        updated_at: new Date().toISOString(),
      };
      
      await AsyncStorage.setItem(KEYS.REFERENCE_FOLDERS, JSON.stringify(folders));
      return folders[index];
    } catch (error) {
      console.error('Error updating folder:', error);
      throw error;
    }
  },

  deleteFolder: async (id: string): Promise<void> => {
    try {
      // Delete all photos in folder first
      const photos = await ReferenceService.getPhotosInFolder(id);
      for (const photo of photos) {
        await ReferenceService.deletePhoto(photo.id);
      }
      
      // Delete physical directory
      const baseDir = getReferencesDirectory();
      const folderDir = new Directory(baseDir, id);
      if (folderDir.exists) {
        await folderDir.delete();
      }
      
      // Remove from storage
      const folders = await ReferenceService.getAllFolders();
      const filtered = folders.filter(f => f.id !== id);
      await AsyncStorage.setItem(KEYS.REFERENCE_FOLDERS, JSON.stringify(filtered));
    } catch (error) {
      console.error('Error deleting folder:', error);
      throw error;
    }
  },

  // ============ PHOTOS ============

  getAllPhotos: async (): Promise<ReferencePhoto[]> => {
    try {
      const data = await AsyncStorage.getItem(KEYS.REFERENCE_PHOTOS);
      if (!data) return [];
      return JSON.parse(data);
    } catch (error) {
      console.error('Error getting all photos:', error);
      return [];
    }
  },

  getPhotosInFolder: async (folderId: string): Promise<ReferencePhoto[]> => {
    try {
      const photos = await ReferenceService.getAllPhotos();
      return photos
        .filter(p => p.folder_id === folderId)
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    } catch (error) {
      console.error('Error getting photos in folder:', error);
      return [];
    }
  },

  addPhoto: async (folderId: string, sourceUri: string, source: 'camera' | 'gallery' | 'files'): Promise<ReferencePhoto> => {
    try {
      // Ensure folder directory exists
      const folderDir = await ensureDirectoryExists(folderId);
      
      // Generate unique filename
      const photoId = generateId();
      const extension = sourceUri.split('.').pop()?.toLowerCase() || 'jpg';
      const filename = `${photoId}.${extension}`;
      
      // Create source file and copy to destination
      const sourceFile = new File(sourceUri);
      const destFile = new File(folderDir, filename);
      
      await sourceFile.copy(destFile);
      
      const newPhoto: ReferencePhoto = {
        id: photoId,
        folder_id: folderId,
        uri: destFile.uri,
        original_uri: sourceUri,
        source,
        created_at: new Date().toISOString(),
      };
      
      // Save to storage
      const photos = await ReferenceService.getAllPhotos();
      photos.push(newPhoto);
      await AsyncStorage.setItem(KEYS.REFERENCE_PHOTOS, JSON.stringify(photos));
      
      // Update folder timestamp
      await ReferenceService.updateFolder(folderId, {});
      
      return newPhoto;
    } catch (error) {
      console.error('Error adding photo:', error);
      throw error;
    }
  },

  deletePhoto: async (photoId: string): Promise<void> => {
    try {
      const photos = await ReferenceService.getAllPhotos();
      const photo = photos.find(p => p.id === photoId);
      
      if (photo) {
        // Delete physical file
        const file = new File(photo.uri);
        if (file.exists) {
          await file.delete();
        }
      }
      
      // Remove from storage
      const filtered = photos.filter(p => p.id !== photoId);
      await AsyncStorage.setItem(KEYS.REFERENCE_PHOTOS, JSON.stringify(filtered));
    } catch (error) {
      console.error('Error deleting photo:', error);
      throw error;
    }
  },

  movePhoto: async (photoId: string, targetFolderId: string): Promise<void> => {
    try {
      const photos = await ReferenceService.getAllPhotos();
      const photoIndex = photos.findIndex(p => p.id === photoId);
      
      if (photoIndex === -1) {
        throw new Error('Photo not found');
      }
      
      const photo = photos[photoIndex];
      const oldFolderId = photo.folder_id;
      
      // Ensure target directory exists
      const targetDir = await ensureDirectoryExists(targetFolderId);
      
      // Move physical file using expo-file-system
      const filename = photo.uri.split('/').pop() || `${photo.id}.jpg`;
      const newUri = `${targetDir}${filename}`;
      
      try {
        const sourceFile = new File(photo.uri);
        const destFile = new File(newUri);
        await sourceFile.move(destFile);
      } catch (fileError) {
        console.log('File move error, trying copy+delete:', fileError);
        // Fallback: copy then delete
        const sourceFile = new File(photo.uri);
        const destFile = new File(newUri);
        await sourceFile.copy(destFile);
        try {
          await sourceFile.delete();
        } catch (deleteError) {
          console.log('Could not delete original file:', deleteError);
        }
      }
      
      // Update photo record
      photos[photoIndex] = {
        ...photo,
        folder_id: targetFolderId,
        uri: newUri,
      };
      
      await AsyncStorage.setItem(KEYS.REFERENCE_PHOTOS, JSON.stringify(photos));
      
      // Update both folder timestamps
      await ReferenceService.updateFolder(oldFolderId, {});
      await ReferenceService.updateFolder(targetFolderId, {});
    } catch (error) {
      console.error('Error moving photo:', error);
      throw error;
    }
  },

  // Update photo (name)
  updatePhoto: async (photoId: string, updates: { name?: string }): Promise<void> => {
    try {
      const data = await AsyncStorage.getItem(KEYS.REFERENCE_PHOTOS);
      if (!data) return;
      
      const photos: ReferencePhoto[] = JSON.parse(data);
      const index = photos.findIndex(p => p.id === photoId);
      
      if (index !== -1) {
        photos[index] = { ...photos[index], ...updates };
        await AsyncStorage.setItem(KEYS.REFERENCE_PHOTOS, JSON.stringify(photos));
      }
    } catch (error) {
      console.error('Error updating photo:', error);
      throw error;
    }
  },

  // Search photos by name across all folders
  searchPhotos: async (query: string): Promise<ReferencePhoto[]> => {
    try {
      if (!query.trim()) return [];
      
      const photos = await ReferenceService.getAllPhotos();
      const lowerQuery = query.toLowerCase();
      
      return photos.filter(p => 
        p.name?.toLowerCase().includes(lowerQuery)
      );
    } catch (error) {
      console.error('Error searching photos:', error);
      return [];
    }
  },

  // ============ UTILITY ============

  // Get storage info
  getStorageInfo: async (): Promise<{ folderCount: number; photoCount: number }> => {
    try {
      const folders = await ReferenceService.getAllFolders();
      const photos = await ReferenceService.getAllPhotos();
      
      return {
        folderCount: folders.length,
        photoCount: photos.length,
      };
    } catch (error) {
      console.error('Error getting storage info:', error);
      return { folderCount: 0, photoCount: 0 };
    }
  },

  // Clear all reference data (for testing/reset)
  clearAll: async (): Promise<void> => {
    try {
      // Delete all files
      const baseDir = getReferencesDirectory();
      if (baseDir.exists) {
        await baseDir.delete();
      }
      
      // Clear storage
      await AsyncStorage.removeItem(KEYS.REFERENCE_FOLDERS);
      await AsyncStorage.removeItem(KEYS.REFERENCE_PHOTOS);
    } catch (error) {
      console.error('Error clearing reference data:', error);
      throw error;
    }
  },

  // ============ EXTERNAL FOLDERS ============

  // Get all external folders
  getExternalFolders: async (): Promise<ExternalFolder[]> => {
    try {
      const data = await AsyncStorage.getItem(KEYS.EXTERNAL_FOLDERS);
      if (!data) return [];
      return JSON.parse(data);
    } catch (error) {
      console.error('Error getting external folders:', error);
      return [];
    }
  },

  // Add external folder link
  addExternalFolder: async (name: string, uri: string): Promise<ExternalFolder> => {
    try {
      const folders = await ReferenceService.getExternalFolders();
      
      const newFolder: ExternalFolder = {
        id: generateId(),
        name,
        uri,
        linked_at: new Date().toISOString(),
      };
      
      folders.push(newFolder);
      await AsyncStorage.setItem(KEYS.EXTERNAL_FOLDERS, JSON.stringify(folders));
      
      return newFolder;
    } catch (error) {
      console.error('Error adding external folder:', error);
      throw error;
    }
  },

  // Remove external folder link
  removeExternalFolder: async (id: string): Promise<void> => {
    try {
      const folders = await ReferenceService.getExternalFolders();
      const filtered = folders.filter(f => f.id !== id);
      await AsyncStorage.setItem(KEYS.EXTERNAL_FOLDERS, JSON.stringify(filtered));
    } catch (error) {
      console.error('Error removing external folder:', error);
      throw error;
    }
  },

  // Export folder data for external storage
  exportFolderData: async (folderId: string): Promise<{ folder: ReferenceFolder; photos: ReferencePhoto[]; subfolders: ReferenceFolder[] }> => {
    try {
      const folder = await ReferenceService.getFolder(folderId);
      if (!folder) throw new Error('Folder not found');
      
      const photos = await ReferenceService.getPhotosInFolder(folderId);
      const allFolders = await ReferenceService.getAllFolders();
      const subfolders = allFolders.filter(f => f.parent_id === folderId);
      
      return { folder, photos, subfolders };
    } catch (error) {
      console.error('Error exporting folder data:', error);
      throw error;
    }
  },
};

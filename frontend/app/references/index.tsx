import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Modal,
  TextInput,
  Image,
  ActivityIndicator,
  Dimensions,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';
import { ReferenceService, ReferenceFolder, ReferencePhoto, ExternalFolder } from '../../services/ReferenceService';

const { width: screenWidth } = Dimensions.get('window');
const FOLDER_COLUMNS = screenWidth > 600 ? 5 : 4; // 5 columns on iPad, 4 on iPhone
const PHOTO_COLUMNS = screenWidth > 600 ? 4 : 3;
const MAX_FOLDER_SIZE = 120; // Maximum folder size
const CALCULATED_FOLDER_SIZE = (screenWidth - 32 - (FOLDER_COLUMNS - 1) * 8) / FOLDER_COLUMNS;
const FOLDER_SIZE = Math.min(CALCULATED_FOLDER_SIZE, MAX_FOLDER_SIZE);
const PHOTO_SIZE = (screenWidth - 32 - (PHOTO_COLUMNS - 1) * 8) / PHOTO_COLUMNS;

export default function ReferencesScreen() {
  const router = useRouter();
  
  // Navigation state
  const [folderStack, setFolderStack] = useState<ReferenceFolder[]>([]);
  const currentFolder = folderStack.length > 0 ? folderStack[folderStack.length - 1] : null;
  
  // Data state
  const [folders, setFolders] = useState<ReferenceFolder[]>([]);
  const [photos, setPhotos] = useState<ReferencePhoto[]>([]);
  const [externalFolders, setExternalFolders] = useState<ExternalFolder[]>([]);
  const [searchResults, setSearchResults] = useState<ReferencePhoto[]>([]);
  const [loading, setLoading] = useState(true);
  
  // UI state
  const [showNewFolderModal, setShowNewFolderModal] = useState(false);
  const [showPhotoModal, setShowPhotoModal] = useState(false);
  const [showMoveModal, setShowMoveModal] = useState(false);
  const [showEditPhotoModal, setShowEditPhotoModal] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Edit state
  const [selectedPhoto, setSelectedPhoto] = useState<ReferencePhoto | null>(null);
  const [newFolderName, setNewFolderName] = useState('');
  const [editingFolder, setEditingFolder] = useState<ReferenceFolder | null>(null);
  const [editPhotoName, setEditPhotoName] = useState('');
  const [allFoldersForMove, setAllFoldersForMove] = useState<ReferenceFolder[]>([]);
  const [moveModalParentId, setMoveModalParentId] = useState<string | undefined>(undefined);
  const [moveModalPath, setMoveModalPath] = useState<ReferenceFolder[]>([]);
  
  // External folder state
  const [currentExternalFolder, setCurrentExternalFolder] = useState<ExternalFolder | null>(null);
  const [externalPhotos, setExternalPhotos] = useState<string[]>([]);

  // Load data
  const loadData = async () => {
    try {
      setLoading(true);
      const parentId = currentFolder?.id;
      
      // Load subfolders
      const subfolders = await ReferenceService.getFoldersByParent(parentId);
      setFolders(subfolders);
      
      // Load photos if in a folder
      if (currentFolder) {
        const folderPhotos = await ReferenceService.getPhotosInFolder(currentFolder.id);
        setPhotos(folderPhotos);
      } else {
        setPhotos([]);
        // Load external folders only on root level
        const extFolders = await ReferenceService.getExternalFolders();
        setExternalFolders(extFolders);
      }
      
      // Load all folders for move modal
      const allFolders = await ReferenceService.getAllFolders();
      setAllFoldersForMove(allFolders);
    } catch (error) {
      console.error('Error loading reference data:', error);
      Alert.alert('Fehler', 'Daten konnten nicht geladen werden');
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [currentFolder?.id])
  );

  // Navigation functions
  const navigateToFolder = (folder: ReferenceFolder) => {
    setFolderStack([...folderStack, folder]);
  };

  const navigateBack = () => {
    // If viewing external folder, go back to main view
    if (currentExternalFolder) {
      setCurrentExternalFolder(null);
      setExternalPhotos([]);
      return;
    }
    
    if (folderStack.length > 0) {
      setFolderStack(folderStack.slice(0, -1));
    } else {
      router.back();
    }
  };

  // Search
  const performSearch = async (query: string) => {
    setSearchQuery(query);
    if (query.trim().length > 0) {
      const results = await ReferenceService.searchPhotos(query);
      setSearchResults(results);
    } else {
      setSearchResults([]);
    }
  };

  // Create/Edit folder
  const saveFolder = async () => {
    if (!newFolderName.trim()) {
      Alert.alert('Fehler', 'Bitte geben Sie einen Ordnernamen ein');
      return;
    }

    try {
      if (editingFolder) {
        await ReferenceService.updateFolder(editingFolder.id, { name: newFolderName.trim() });
      } else {
        await ReferenceService.createFolder(newFolderName.trim(), currentFolder?.id);
      }
      setNewFolderName('');
      setEditingFolder(null);
      setShowNewFolderModal(false);
      loadData();
    } catch (error) {
      console.error('Error saving folder:', error);
      Alert.alert('Fehler', 'Ordner konnte nicht gespeichert werden');
    }
  };

  // Delete folder
  const deleteFolder = (folder: ReferenceFolder) => {
    Alert.alert(
      'Ordner löschen',
      `Möchten Sie "${folder.name}" und alle Inhalte wirklich löschen?`,
      [
        { text: 'Abbrechen', style: 'cancel' },
        {
          text: 'Löschen',
          style: 'destructive',
          onPress: async () => {
            try {
              await ReferenceService.deleteFolder(folder.id);
              loadData();
            } catch (error) {
              Alert.alert('Fehler', 'Ordner konnte nicht gelöscht werden');
            }
          },
        },
      ]
    );
  };

  // Export folder
  const exportFolder = async (folder: ReferenceFolder) => {
    try {
      const data = await ReferenceService.exportFolderData(folder.id);
      
      // Create a temporary directory for export
      const exportDir = `${FileSystem.cacheDirectory}export_${folder.id}/`;
      await FileSystem.makeDirectoryAsync(exportDir, { intermediates: true });
      
      // Create metadata file
      const metadata = {
        folder: data.folder,
        photos: data.photos.map(p => ({ ...p, uri: p.uri.split('/').pop() })),
        exportedAt: new Date().toISOString(),
      };
      await FileSystem.writeAsStringAsync(
        `${exportDir}metadata.json`,
        JSON.stringify(metadata, null, 2)
      );
      
      // Copy photos
      for (const photo of data.photos) {
        const filename = photo.uri.split('/').pop();
        if (filename) {
          await FileSystem.copyAsync({
            from: photo.uri,
            to: `${exportDir}${filename}`,
          });
        }
      }
      
      // Share the folder
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        // Share the metadata file (user can then save to Files)
        await Sharing.shareAsync(`${exportDir}metadata.json`, {
          mimeType: 'application/json',
          dialogTitle: `Ordner "${folder.name}" exportieren`,
        });
        Alert.alert('Hinweis', `Die Fotos befinden sich unter:\n${exportDir}\n\nÖffnen Sie die Dateien-App und kopieren Sie den Ordner auf Ihren USB-Stick.`);
      } else {
        Alert.alert('Fehler', 'Teilen ist auf diesem Gerät nicht verfügbar');
      }
    } catch (error) {
      console.error('Error exporting folder:', error);
      Alert.alert('Fehler', 'Ordner konnte nicht exportiert werden');
    }
  };

  // Link external folder
  const linkExternalFolder = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['public.folder', 'public.directory', '*/*'],
        copyToCacheDirectory: false,
      });
      
      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        const folderName = asset.name || 'Externer Ordner';
        
        await ReferenceService.addExternalFolder(folderName, asset.uri);
        loadData();
        Alert.alert('Erfolg', `Ordner "${folderName}" wurde verknüpft`);
      }
    } catch (error) {
      console.error('Error linking external folder:', error);
      Alert.alert('Fehler', 'Ordner konnte nicht verknüpft werden');
    }
  };

  // Unlink external folder
  const unlinkExternalFolder = (folder: ExternalFolder) => {
    Alert.alert(
      'Verknüpfung entfernen',
      `Möchten Sie die Verknüpfung zu "${folder.name}" entfernen?`,
      [
        { text: 'Abbrechen', style: 'cancel' },
        {
          text: 'Entfernen',
          style: 'destructive',
          onPress: async () => {
            await ReferenceService.removeExternalFolder(folder.id);
            loadData();
          },
        },
      ]
    );
  };

  // Open external folder and load photos
  const openExternalFolder = async (folder: ExternalFolder) => {
    try {
      setCurrentExternalFolder(folder);
      setLoading(true);
      
      // Try to read directory contents
      const dirInfo = await FileSystem.getInfoAsync(folder.uri);
      if (dirInfo.exists && dirInfo.isDirectory) {
        const contents = await FileSystem.readDirectoryAsync(folder.uri);
        const imageFiles = contents.filter(file => 
          /\.(jpg|jpeg|png|gif|webp|heic)$/i.test(file)
        );
        setExternalPhotos(imageFiles.map(f => `${folder.uri}/${f}`));
      } else {
        Alert.alert('Fehler', 'Ordner nicht gefunden. Ist das Gerät verbunden?');
        setCurrentExternalFolder(null);
      }
    } catch (error) {
      console.error('Error opening external folder:', error);
      Alert.alert('Fehler', 'Ordner konnte nicht geöffnet werden. Möglicherweise ist das externe Gerät nicht verbunden.');
      setCurrentExternalFolder(null);
    } finally {
      setLoading(false);
    }
  };

  // Import folder from external storage
  const importFolder = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/json'],
        copyToCacheDirectory: true,
      });
      
      if (!result.canceled && result.assets[0]) {
        const metadataUri = result.assets[0].uri;
        const metadataContent = await FileSystem.readAsStringAsync(metadataUri);
        const metadata = JSON.parse(metadataContent);
        
        if (!metadata.folder || !metadata.photos) {
          Alert.alert('Fehler', 'Ungültiges Export-Format');
          return;
        }
        
        // Create the folder
        const newFolder = await ReferenceService.createFolder(
          metadata.folder.name + ' (importiert)',
          currentFolder?.id
        );
        
        // Ask user to select the photos directory
        Alert.alert(
          'Fotos importieren',
          `Ordner "${metadata.folder.name}" wurde erstellt.\n\nMöchten Sie jetzt die ${metadata.photos.length} Fotos importieren?\n\nWählen Sie den Ordner mit den exportierten Fotos.`,
          [
            { text: 'Später', style: 'cancel', onPress: () => loadData() },
            {
              text: 'Fotos wählen',
              onPress: async () => {
                const photosResult = await DocumentPicker.getDocumentAsync({
                  type: ['image/*'],
                  copyToCacheDirectory: true,
                  multiple: true,
                });
                
                if (!photosResult.canceled && photosResult.assets.length > 0) {
                  for (const asset of photosResult.assets) {
                    await ReferenceService.addPhoto(newFolder.id, asset.uri, 'files');
                  }
                  Alert.alert('Erfolg', `${photosResult.assets.length} Fotos importiert`);
                }
                loadData();
              },
            },
          ]
        );
      }
    } catch (error) {
      console.error('Error importing folder:', error);
      Alert.alert('Fehler', 'Import fehlgeschlagen');
    }
  };

  // Photo functions
  const addPhotoFromCamera = async () => {
    if (!currentFolder) return;
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Berechtigung erforderlich', 'Bitte erlauben Sie den Kamerazugriff');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (!result.canceled && result.assets[0]) {
      await ReferenceService.addPhoto(currentFolder.id, result.assets[0].uri, 'camera');
      loadData();
    }
  };

  const addPhotoFromGallery = async () => {
    if (!currentFolder) return;
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Berechtigung erforderlich', 'Bitte erlauben Sie den Zugriff auf Ihre Fotos');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      quality: 0.8,
    });
    if (!result.canceled && result.assets.length > 0) {
      for (const asset of result.assets) {
        await ReferenceService.addPhoto(currentFolder.id, asset.uri, 'gallery');
      }
      loadData();
    }
  };

  const addPhotoFromFiles = async () => {
    if (!currentFolder) return;
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['image/*'],
        copyToCacheDirectory: true,
        multiple: true,
      });
      if (!result.canceled && result.assets.length > 0) {
        for (const asset of result.assets) {
          await ReferenceService.addPhoto(currentFolder.id, asset.uri, 'files');
        }
        loadData();
      }
    } catch (error) {
      Alert.alert('Fehler', 'Fotos konnten nicht hinzugefügt werden');
    }
  };

  const deletePhoto = () => {
    if (!selectedPhoto) return;
    Alert.alert('Foto löschen', 'Möchten Sie dieses Foto wirklich löschen?', [
      { text: 'Abbrechen', style: 'cancel' },
      {
        text: 'Löschen',
        style: 'destructive',
        onPress: async () => {
          await ReferenceService.deletePhoto(selectedPhoto.id);
          setShowPhotoModal(false);
          setSelectedPhoto(null);
          loadData();
        },
      },
    ]);
  };

  // Set folder thumbnail from gallery (without saving to folder)
  const setFolderThumbnailFromGallery = async (folder: ReferenceFolder) => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Berechtigung erforderlich', 'Bitte erlauben Sie den Zugriff auf Ihre Fotos');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: false,
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      try {
        // Set thumbnail URI directly without adding as photo
        await ReferenceService.setFolderThumbnailUri(folder.id, result.assets[0].uri);
        loadData();
        Alert.alert('Erfolg', 'Vorschaubild wurde gesetzt');
      } catch (error) {
        Alert.alert('Fehler', 'Vorschaubild konnte nicht gesetzt werden');
      }
    }
  };

  const savePhotoName = async () => {
    if (!selectedPhoto) return;
    await ReferenceService.updatePhoto(selectedPhoto.id, { name: editPhotoName.trim() || undefined });
    setShowEditPhotoModal(false);
    loadData();
  };

  const movePhotoToFolder = async (targetFolderId: string) => {
    if (!selectedPhoto) return;
    await ReferenceService.movePhoto(selectedPhoto.id, targetFolderId);
    setShowMoveModal(false);
    setShowPhotoModal(false);
    setSelectedPhoto(null);
    loadData();
    Alert.alert('Erfolg', 'Foto wurde verschoben');
  };

  // Render folder item
  const renderFolderItem = (item: ReferenceFolder) => (
    <TouchableOpacity
      key={item.id}
      style={styles.folderCard}
      onPress={() => navigateToFolder(item)}
      onLongPress={() => {
        Alert.alert(item.name, 'Was möchten Sie tun?', [
          { text: 'Abbrechen', style: 'cancel' },
          {
            text: 'Vorschaubild',
            onPress: () => setFolderThumbnailFromGallery(item),
          },
          {
            text: 'Exportieren',
            onPress: () => exportFolder(item),
          },
          {
            text: 'Umbenennen',
            onPress: () => {
              setEditingFolder(item);
              setNewFolderName(item.name);
              setShowNewFolderModal(true);
            },
          },
          { text: 'Löschen', style: 'destructive', onPress: () => deleteFolder(item) },
        ]);
      }}
    >
      <View style={styles.folderIconContainer}>
        {item.thumbnail_uri ? (
          <Image 
            source={{ uri: item.thumbnail_uri }} 
            style={styles.folderThumbnail} 
            resizeMode="contain"
          />
        ) : (
          <Ionicons name="folder" size={32} color="#ffa726" />
        )}
      </View>
      <Text style={styles.folderName} numberOfLines={2}>{item.name}</Text>
      <Text style={styles.folderMeta}>
        {(item.subfolder_count || 0) > 0 && `${item.subfolder_count} · `}
        {item.photo_count || 0} Fotos
      </Text>
    </TouchableOpacity>
  );

  // Render external folder item
  const renderExternalFolderItem = (item: ExternalFolder) => (
    <TouchableOpacity
      key={item.id}
      style={[styles.folderCard, styles.externalFolderCard]}
      onPress={() => openExternalFolder(item)}
      onLongPress={() => {
        Alert.alert(item.name, 'Was möchten Sie tun?', [
          { text: 'Abbrechen', style: 'cancel' },
          { text: 'Verknüpfung entfernen', style: 'destructive', onPress: () => unlinkExternalFolder(item) },
        ]);
      }}
    >
      <View style={[styles.folderIconContainer, styles.externalIconContainer]}>
        <Ionicons name="folder-open" size={32} color="#2196f3" />
        <View style={styles.externalBadge}>
          <Ionicons name="link" size={10} color="#fff" />
        </View>
      </View>
      <Text style={styles.folderName} numberOfLines={2}>{item.name}</Text>
      <Text style={styles.folderMeta}>Extern</Text>
    </TouchableOpacity>
  );

  // Render external photo item
  const renderExternalPhotoItem = (uri: string, index: number) => (
    <TouchableOpacity
      key={index}
      style={styles.photoItem}
      onPress={() => {
        // Show external photo in full screen
        setSelectedPhoto({ id: `ext-${index}`, folder_id: '', uri, original_uri: uri, source: 'files', created_at: '' });
        setShowPhotoModal(true);
      }}
    >
      <Image 
        source={{ uri }} 
        style={styles.photoThumbnail} 
        resizeMode="cover"
      />
    </TouchableOpacity>
  );

  // Render photo item
  const renderPhotoItem = (item: ReferencePhoto) => (
    <TouchableOpacity
      key={item.id}
      style={styles.photoItem}
      onPress={() => {
        setSelectedPhoto(item);
        setShowPhotoModal(true);
      }}
    >
      <Image 
        source={{ uri: item.uri }} 
        style={styles.photoThumbnail} 
        resizeMode="cover"
      />
      {item.name && (
        <View style={styles.photoNameBadge}>
          <Text style={styles.photoNameText} numberOfLines={1}>{item.name}</Text>
        </View>
      )}
    </TouchableOpacity>
  );

  // Render search result
  const renderSearchResult = (item: ReferencePhoto) => (
    <TouchableOpacity
      key={item.id}
      style={styles.searchResultItem}
      onPress={() => {
        setSelectedPhoto(item);
        setShowPhotoModal(true);
      }}
    >
      <Image source={{ uri: item.uri }} style={styles.searchResultImage} />
      <View style={styles.searchResultInfo}>
        <Text style={styles.searchResultName}>{item.name || 'Unbenannt'}</Text>
      </View>
    </TouchableOpacity>
  );

  if (loading && folders.length === 0 && photos.length === 0) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Referenz Fotos</Text>
          <View style={styles.headerRight} />
        </View>
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#1976d2" />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container} key={currentFolder?.id || 'root'}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={navigateBack}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {currentExternalFolder?.name || currentFolder?.name || 'Referenz Fotos'}
        </Text>
        <TouchableOpacity style={styles.searchButton} onPress={() => setShowSearch(!showSearch)}>
          <Ionicons name="search" size={22} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Search Bar */}
      {showSearch && (
        <View style={styles.searchBar}>
          <Ionicons name="search" size={18} color="#999" />
          <TextInput
            style={styles.searchInput}
            placeholder="Foto suchen (nach Name)..."
            placeholderTextColor="#999"
            value={searchQuery}
            onChangeText={performSearch}
            autoFocus
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => { setSearchQuery(''); setSearchResults([]); }}>
              <Ionicons name="close-circle" size={18} color="#999" />
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Search Results */}
      {showSearch && searchQuery.length > 0 ? (
        <ScrollView style={styles.scrollContent} contentContainerStyle={styles.scrollContainer}>
          {searchResults.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="search-outline" size={48} color="#ccc" />
              <Text style={styles.emptyText}>Keine Fotos gefunden</Text>
            </View>
          ) : (
            searchResults.map(renderSearchResult)
          )}
        </ScrollView>
      ) : currentExternalFolder ? (
        // External folder view
        <ScrollView style={styles.scrollContent} contentContainerStyle={styles.scrollContainer}>
          <View style={styles.externalFolderHeader}>
            <Ionicons name="folder-open" size={24} color="#2196f3" />
            <Text style={styles.externalFolderHeaderText}>Externer Ordner</Text>
          </View>
          
          {externalPhotos.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="images-outline" size={48} color="#ccc" />
              <Text style={styles.emptyText}>Keine Fotos gefunden</Text>
              <Text style={styles.emptySubtext}>Der Ordner ist leer oder das Gerät ist nicht verbunden</Text>
            </View>
          ) : (
            <>
              <Text style={styles.sectionTitle}>Fotos ({externalPhotos.length})</Text>
              <View style={styles.photoGridContainer}>
                {externalPhotos.map((uri, index) => renderExternalPhotoItem(uri, index))}
              </View>
            </>
          )}
        </ScrollView>
      ) : (
        <ScrollView style={styles.scrollContent} contentContainerStyle={styles.scrollContainer}>
          {/* Breadcrumb */}
          {folderStack.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.breadcrumb}>
              <TouchableOpacity onPress={() => setFolderStack([])}>
                <Text style={styles.breadcrumbItem}>Start</Text>
              </TouchableOpacity>
              {folderStack.map((folder, index) => (
                <View key={folder.id} style={styles.breadcrumbRow}>
                  <Ionicons name="chevron-forward" size={14} color="#999" />
                  <TouchableOpacity onPress={() => setFolderStack(folderStack.slice(0, index + 1))}>
                    <Text style={[styles.breadcrumbItem, index === folderStack.length - 1 && styles.breadcrumbActive]}>
                      {folder.name}
                    </Text>
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>
          )}

          {/* New Folder Button */}
          <TouchableOpacity
            style={styles.newFolderButton}
            onPress={() => {
              setEditingFolder(null);
              setNewFolderName('');
              setShowNewFolderModal(true);
            }}
          >
            <Ionicons name="add" size={18} color="#1976d2" />
            <Text style={styles.newFolderButtonText}>
              {currentFolder ? 'Unterordner erstellen' : 'Neuer Ordner'}
            </Text>
          </TouchableOpacity>

          {/* Add Photo Buttons (only in folders) */}
          {currentFolder && (
            <View style={styles.addPhotoButtons}>
              <TouchableOpacity style={styles.addPhotoButton} onPress={addPhotoFromCamera}>
                <Ionicons name="camera" size={18} color="#1976d2" />
                <Text style={styles.addPhotoButtonText}>Kamera</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.addPhotoButton} onPress={addPhotoFromGallery}>
                <Ionicons name="images" size={18} color="#1976d2" />
                <Text style={styles.addPhotoButtonText}>Galerie</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.addPhotoButton} onPress={addPhotoFromFiles}>
                <Ionicons name="folder-open" size={18} color="#1976d2" />
                <Text style={styles.addPhotoButtonText}>Dateien</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Folders Grid */}
          {folders.length > 0 && (
            <>
              {currentFolder && <Text style={styles.sectionTitle}>Unterordner ({folders.length})</Text>}
              {!currentFolder && <Text style={styles.sectionTitle}>Lokale Ordner ({folders.length})</Text>}
              <View style={styles.gridContainer}>
                {folders.map(renderFolderItem)}
              </View>
            </>
          )}

          {/* External Folders Section (only on root) */}
          {!currentFolder && (
            <>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Externe Ordner (USB/Cloud)</Text>
              </View>
              <View style={styles.externalButtonsRow}>
                <TouchableOpacity style={styles.linkExternalButton} onPress={linkExternalFolder}>
                  <Ionicons name="link" size={16} color="#2196f3" />
                  <Text style={styles.linkExternalButtonText}>Verknüpfen</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.importButton} onPress={importFolder}>
                  <Ionicons name="download" size={16} color="#4caf50" />
                  <Text style={styles.importButtonText}>Importieren</Text>
                </TouchableOpacity>
              </View>
              {externalFolders.length > 0 && (
                <View style={styles.gridContainer}>
                  {externalFolders.map(renderExternalFolderItem)}
                </View>
              )}
            </>
          )}

          {/* Photos Grid */}
          {photos.length > 0 && (
            <>
              <Text style={styles.sectionTitle}>Fotos ({photos.length})</Text>
              <View style={styles.photoGridContainer}>
                {photos.map(renderPhotoItem)}
              </View>
            </>
          )}

          {/* Empty State */}
          {folders.length === 0 && photos.length === 0 && (
            <View style={styles.emptyState}>
              <Ionicons name="folder-open-outline" size={48} color="#ccc" />
              <Text style={styles.emptyText}>
                {currentFolder ? 'Ordner ist leer' : 'Keine Ordner vorhanden'}
              </Text>
              <Text style={styles.emptySubtext}>
                {currentFolder ? 'Fügen Sie Fotos oder Unterordner hinzu' : 'Erstellen Sie Ihren ersten Ordner'}
              </Text>
            </View>
          )}
        </ScrollView>
      )}

      {/* New/Edit Folder Modal */}
      <Modal visible={showNewFolderModal} transparent animationType="fade">
        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              {editingFolder ? 'Ordner umbenennen' : (currentFolder ? 'Neuer Unterordner' : 'Neuer Ordner')}
            </Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Ordnername"
              placeholderTextColor="#999"
              value={newFolderName}
              onChangeText={setNewFolderName}
              autoFocus
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonCancel]}
                onPress={() => { setShowNewFolderModal(false); setNewFolderName(''); setEditingFolder(null); }}
              >
                <Text style={styles.modalButtonCancelText}>Abbrechen</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalButton, styles.modalButtonConfirm]} onPress={saveFolder}>
                <Text style={styles.modalButtonConfirmText}>{editingFolder ? 'Speichern' : 'Erstellen'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Photo Detail Modal */}
      <Modal 
        visible={showPhotoModal} 
        transparent 
        animationType="fade" 
        onRequestClose={() => { 
          setShowPhotoModal(false); 
          setTimeout(() => setSelectedPhoto(null), 100);
        }}
      >
        <View style={styles.photoModalOverlay}>
          <TouchableOpacity 
            style={styles.photoModalClose} 
            onPress={() => { 
              setShowPhotoModal(false); 
              setTimeout(() => setSelectedPhoto(null), 100);
            }}
          >
            <Ionicons name="close" size={28} color="#fff" />
          </TouchableOpacity>
          {selectedPhoto && (
            <View style={styles.photoModalContent}>
              <Image 
                source={{ uri: selectedPhoto.uri }} 
                style={styles.photoModalImage} 
                resizeMode="contain"
              />
              <View style={styles.photoModalActions}>
                <TouchableOpacity style={styles.photoActionButton} onPress={() => { setEditPhotoName(selectedPhoto.name || ''); setShowEditPhotoModal(true); setShowPhotoModal(false); }}>
                  <Ionicons name="pencil" size={20} color="#1976d2" />
                  <Text style={styles.photoActionText}>Name</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.photoActionButton} onPress={() => { setShowMoveModal(true); setShowPhotoModal(false); }}>
                  <Ionicons name="folder-open" size={20} color="#4caf50" />
                  <Text style={styles.photoActionText}>Verschieben</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.photoActionButton, { backgroundColor: '#ffebee' }]} onPress={deletePhoto}>
                  <Ionicons name="trash" size={20} color="#f44336" />
                  <Text style={[styles.photoActionText, { color: '#f44336' }]}>Löschen</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      </Modal>

      {/* Edit Photo Name Modal */}
      <Modal visible={showEditPhotoModal} transparent animationType="fade">
        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Foto benennen</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Name (optional)"
              placeholderTextColor="#999"
              value={editPhotoName}
              onChangeText={setEditPhotoName}
              autoFocus
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity style={[styles.modalButton, styles.modalButtonCancel]} onPress={() => setShowEditPhotoModal(false)}>
                <Text style={styles.modalButtonCancelText}>Abbrechen</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalButton, styles.modalButtonConfirm]} onPress={savePhotoName}>
                <Text style={styles.modalButtonConfirmText}>Speichern</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Move Photo Modal */}
      <Modal visible={showMoveModal} transparent animationType="slide" onRequestClose={() => { setShowMoveModal(false); setMoveModalParentId(undefined); setMoveModalPath([]); }}>
        <View style={styles.modalOverlay}>
          <View style={styles.moveModalContent}>
            <Text style={styles.modalTitle}>Verschieben nach...</Text>
            
            {/* Breadcrumb for move modal */}
            {moveModalPath.length > 0 && (
              <View style={styles.moveBreadcrumb}>
                <TouchableOpacity onPress={() => { setMoveModalParentId(undefined); setMoveModalPath([]); }}>
                  <Text style={styles.moveBreadcrumbItem}>Start</Text>
                </TouchableOpacity>
                {moveModalPath.map((folder, index) => (
                  <View key={folder.id} style={styles.breadcrumbRow}>
                    <Ionicons name="chevron-forward" size={12} color="#999" />
                    <TouchableOpacity onPress={() => {
                      setMoveModalPath(moveModalPath.slice(0, index + 1));
                      setMoveModalParentId(folder.id);
                    }}>
                      <Text style={[styles.moveBreadcrumbItem, index === moveModalPath.length - 1 && styles.breadcrumbActive]}>
                        {folder.name}
                      </Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}
            
            {/* Move here button if in subfolder */}
            {moveModalParentId && moveModalParentId !== currentFolder?.id && (
              <TouchableOpacity 
                style={styles.moveHereButton} 
                onPress={() => movePhotoToFolder(moveModalParentId)}
              >
                <Ionicons name="checkmark-circle" size={20} color="#4caf50" />
                <Text style={styles.moveHereButtonText}>Hierher verschieben</Text>
              </TouchableOpacity>
            )}
            
            <ScrollView style={styles.moveFolderList}>
              {allFoldersForMove
                .filter(f => f.parent_id === moveModalParentId && f.id !== currentFolder?.id)
                .length === 0 ? (
                <Text style={styles.noFoldersText}>
                  {moveModalParentId ? 'Keine Unterordner' : 'Keine Ordner vorhanden'}
                </Text>
              ) : (
                allFoldersForMove
                  .filter(f => f.parent_id === moveModalParentId && f.id !== currentFolder?.id)
                  .map(item => {
                    const hasSubfolders = allFoldersForMove.some(f => f.parent_id === item.id);
                    return (
                      <TouchableOpacity 
                        key={item.id} 
                        style={styles.moveFolderItem} 
                        onPress={() => {
                          if (hasSubfolders) {
                            setMoveModalPath([...moveModalPath, item]);
                            setMoveModalParentId(item.id);
                          } else {
                            movePhotoToFolder(item.id);
                          }
                        }}
                        onLongPress={() => movePhotoToFolder(item.id)}
                      >
                        <Ionicons name="folder" size={20} color="#ffa726" />
                        <Text style={styles.moveFolderName}>{item.name}</Text>
                        {hasSubfolders && (
                          <Ionicons name="chevron-forward" size={18} color="#999" />
                        )}
                      </TouchableOpacity>
                    );
                  })
              )}
            </ScrollView>
            <TouchableOpacity style={styles.moveCancelButton} onPress={() => { setShowMoveModal(false); setMoveModalParentId(undefined); setMoveModalPath([]); }}>
              <Text style={styles.moveCancelButtonText}>Abbrechen</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  scrollContent: { flex: 1 },
  scrollContainer: { padding: 12, paddingBottom: 24 },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  
  // Header
  header: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#0a1628', paddingTop: 50, paddingBottom: 12, paddingHorizontal: 12 },
  backButton: { padding: 6 },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: 'bold', color: '#fff', textAlign: 'center', marginHorizontal: 8 },
  headerRight: { width: 36 },
  searchButton: { padding: 6 },
  
  // Search
  searchBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', marginHorizontal: 12, marginTop: 8, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, gap: 8 },
  searchInput: { flex: 1, fontSize: 14, color: '#333' },
  searchResultItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', padding: 8, marginBottom: 8, borderRadius: 8 },
  searchResultImage: { width: 50, height: 50, borderRadius: 6 },
  searchResultInfo: { flex: 1, marginLeft: 12 },
  searchResultName: { fontSize: 14, fontWeight: '500', color: '#333' },
  
  // Breadcrumb
  breadcrumb: { backgroundColor: '#fff', marginBottom: 12, paddingHorizontal: 8, paddingVertical: 8, borderRadius: 8, flexDirection: 'row' },
  breadcrumbRow: { flexDirection: 'row', alignItems: 'center' },
  breadcrumbItem: { fontSize: 13, color: '#1976d2', marginHorizontal: 4 },
  breadcrumbActive: { fontWeight: '600', color: '#333' },
  
  // New Folder Button
  newFolderButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#e3f2fd', paddingVertical: 10, borderRadius: 8, marginBottom: 12, gap: 6 },
  newFolderButtonText: { color: '#1976d2', fontSize: 13, fontWeight: '600' },
  
  // Folder Grid
  gridContainer: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4 },
  folderCard: { width: FOLDER_SIZE, backgroundColor: '#fff', borderRadius: 8, padding: 8, margin: 4, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 2, elevation: 2 },
  folderIconContainer: { width: FOLDER_SIZE - 24, height: FOLDER_SIZE - 24, justifyContent: 'center', alignItems: 'center', borderRadius: 6, overflow: 'hidden', backgroundColor: '#f5f5f5' },
  folderThumbnail: { width: '100%', height: '100%' },
  folderName: { fontSize: 11, fontWeight: '600', color: '#333', textAlign: 'center', marginTop: 4 },
  folderMeta: { fontSize: 9, color: '#999', marginTop: 2 },
  
  // External Folder
  externalFolderCard: { borderWidth: 1, borderColor: '#2196f3', borderStyle: 'dashed' },
  externalIconContainer: { backgroundColor: '#e3f2fd', position: 'relative' },
  externalBadge: { position: 'absolute', bottom: -2, right: -2, backgroundColor: '#2196f3', borderRadius: 8, padding: 2 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16 },
  externalButtonsRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  linkExternalButton: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#e3f2fd', borderWidth: 1, borderColor: '#2196f3', borderStyle: 'dashed', paddingVertical: 10, borderRadius: 8, gap: 6 },
  linkExternalButtonText: { color: '#2196f3', fontSize: 12, fontWeight: '600' },
  importButton: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#e8f5e9', borderWidth: 1, borderColor: '#4caf50', borderStyle: 'dashed', paddingVertical: 10, borderRadius: 8, gap: 6 },
  importButtonText: { color: '#4caf50', fontSize: 12, fontWeight: '600' },
  externalFolderHeader: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#e3f2fd', padding: 10, borderRadius: 8, marginBottom: 12, gap: 8 },
  externalFolderHeaderText: { fontSize: 14, fontWeight: '600', color: '#2196f3' },
  
  // Add Photo Buttons
  addPhotoButtons: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  addPhotoButton: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff', borderWidth: 1, borderColor: '#1976d2', borderRadius: 8, paddingVertical: 8, gap: 4 },
  addPhotoButtonText: { fontSize: 11, color: '#1976d2', fontWeight: '500' },
  
  // Photos Grid
  sectionTitle: { fontSize: 13, fontWeight: '600', color: '#666', marginBottom: 8, marginTop: 4 },
  photoGridContainer: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4 },
  photoItem: { width: PHOTO_SIZE, height: PHOTO_SIZE, margin: 4, borderRadius: 6, overflow: 'hidden' },
  photoThumbnail: { width: '100%', height: '100%' },
  photoNameBadge: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.6)', padding: 3 },
  photoNameText: { fontSize: 9, color: '#fff', textAlign: 'center' },
  
  // Empty State
  emptyState: { alignItems: 'center', paddingVertical: 40 },
  emptyText: { fontSize: 14, color: '#999', marginTop: 12 },
  emptySubtext: { fontSize: 12, color: '#bbb', marginTop: 4 },
  
  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalContent: { backgroundColor: '#fff', borderRadius: 12, padding: 20, width: '100%', maxWidth: 340 },
  modalTitle: { fontSize: 16, fontWeight: 'bold', color: '#333', marginBottom: 12, textAlign: 'center' },
  modalInput: { backgroundColor: '#f5f5f5', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: '#333', marginBottom: 12 },
  modalButtons: { flexDirection: 'row', gap: 8 },
  modalButton: { flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: 'center' },
  modalButtonCancel: { backgroundColor: '#f5f5f5' },
  modalButtonCancelText: { color: '#666', fontSize: 14, fontWeight: '600' },
  modalButtonConfirm: { backgroundColor: '#1976d2' },
  modalButtonConfirmText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  
  // Photo Modal
  photoModalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.95)' },
  photoModalContent: { flex: 1 },
  photoModalClose: { position: 'absolute', top: 50, right: 16, zIndex: 10, padding: 8 },
  photoModalImage: { flex: 1, width: '100%' },
  photoModalActions: { flexDirection: 'row', backgroundColor: '#fff', paddingVertical: 12, paddingHorizontal: 8, gap: 6 },
  photoActionButton: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 8, backgroundColor: '#f5f5f5', gap: 2 },
  photoActionText: { fontSize: 10, fontWeight: '500', color: '#333' },
  
  // Move Modal
  moveModalContent: { backgroundColor: '#fff', borderRadius: 12, padding: 16, width: '100%', maxWidth: 340, maxHeight: '70%' },
  moveFolderList: { maxHeight: 250 },
  moveFolderItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: '#eee', gap: 10 },
  moveFolderName: { flex: 1, fontSize: 14, color: '#333' },
  noFoldersText: { textAlign: 'center', color: '#999', paddingVertical: 16 },
  moveCancelButton: { marginTop: 12, paddingVertical: 10, backgroundColor: '#f5f5f5', borderRadius: 8, alignItems: 'center' },
  moveCancelButtonText: { color: '#666', fontSize: 14, fontWeight: '600' },
  moveBreadcrumb: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f5f5f5', padding: 8, borderRadius: 6, marginBottom: 10, flexWrap: 'wrap' },
  moveBreadcrumbItem: { fontSize: 12, color: '#1976d2', marginHorizontal: 2 },
  moveHereButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#e8f5e9', paddingVertical: 10, borderRadius: 8, marginBottom: 10, gap: 6 },
  moveHereButtonText: { color: '#4caf50', fontSize: 13, fontWeight: '600' },
});

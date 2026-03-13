import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Alert,
  Modal,
  TextInput,
  Image,
  ActivityIndicator,
  Dimensions,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { ReferenceService, ReferenceFolder, ReferencePhoto } from '../../services/ReferenceService';

const { width: screenWidth } = Dimensions.get('window');
const FOLDER_COLUMNS = 4;
const PHOTO_COLUMNS = 3;
const FOLDER_SIZE = (screenWidth - 32 - (FOLDER_COLUMNS - 1) * 8) / FOLDER_COLUMNS;
const PHOTO_SIZE = (screenWidth - 32 - (PHOTO_COLUMNS - 1) * 8) / PHOTO_COLUMNS;

export default function ReferencesScreen() {
  const router = useRouter();
  
  // Navigation state
  const [folderStack, setFolderStack] = useState<ReferenceFolder[]>([]);
  const currentFolder = folderStack.length > 0 ? folderStack[folderStack.length - 1] : null;
  
  // Data state
  const [folders, setFolders] = useState<ReferenceFolder[]>([]);
  const [photos, setPhotos] = useState<ReferencePhoto[]>([]);
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
      }
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

  const setAsThumbnail = async () => {
    if (!selectedPhoto || !currentFolder) return;
    await ReferenceService.setFolderThumbnail(currentFolder.id, selectedPhoto.id);
    Alert.alert('Erfolg', 'Vorschaubild wurde gesetzt');
    setShowPhotoModal(false);
    setSelectedPhoto(null);
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

  // Render functions
  const renderFolderItem = ({ item }: { item: ReferenceFolder }) => (
    <TouchableOpacity
      style={styles.folderCard}
      onPress={() => navigateToFolder(item)}
      onLongPress={() => {
        Alert.alert(item.name, 'Was möchten Sie tun?', [
          { text: 'Abbrechen', style: 'cancel' },
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
          <Image source={{ uri: item.thumbnail_uri }} style={styles.folderThumbnail} />
        ) : (
          <Ionicons name="folder" size={32} color="#ffa726" />
        )}
      </View>
      <Text style={styles.folderName} numberOfLines={2}>{item.name}</Text>
      <Text style={styles.folderMeta}>
        {(item.subfolder_count || 0) > 0 && `${item.subfolder_count} `}
        {item.photo_count || 0} Fotos
      </Text>
    </TouchableOpacity>
  );

  const renderPhotoItem = ({ item }: { item: ReferencePhoto }) => (
    <TouchableOpacity
      style={styles.photoItem}
      onPress={() => {
        setSelectedPhoto(item);
        setShowPhotoModal(true);
      }}
    >
      <Image source={{ uri: item.uri }} style={styles.photoThumbnail} />
      {item.name && (
        <View style={styles.photoNameBadge}>
          <Text style={styles.photoNameText} numberOfLines={1}>{item.name}</Text>
        </View>
      )}
    </TouchableOpacity>
  );

  const renderSearchResult = ({ item }: { item: ReferencePhoto }) => (
    <TouchableOpacity
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

  // Breadcrumb
  const renderBreadcrumb = () => {
    if (folderStack.length === 0) return null;
    return (
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
    );
  };

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
          {currentFolder?.name || 'Referenz Fotos'}
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
        <View style={styles.contentContainer}>
          {searchResults.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="search-outline" size={48} color="#ccc" />
              <Text style={styles.emptyText}>Keine Fotos gefunden</Text>
            </View>
          ) : (
            <FlatList
              data={searchResults}
              renderItem={renderSearchResult}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.searchResultsList}
            />
          )}
        </View>
      ) : (
        <>
          {/* Breadcrumb */}
          {renderBreadcrumb()}

          {/* Content */}
          <View style={styles.contentContainer}>
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
                {currentFolder ? 'Unterordner' : 'Neuer Ordner'}
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
              <FlatList
                key={`folders-${currentFolder?.id || 'root'}`}
                data={folders}
                renderItem={renderFolderItem}
                keyExtractor={(item) => item.id}
                numColumns={FOLDER_COLUMNS}
                contentContainerStyle={styles.folderGrid}
                scrollEnabled={false}
              />
            )}

            {/* Photos Grid */}
            {photos.length > 0 && (
              <>
                <Text style={styles.sectionTitle}>Fotos ({photos.length})</Text>
                <FlatList
                  key={`photos-${currentFolder?.id || 'none'}`}
                  data={photos}
                  renderItem={renderPhotoItem}
                  keyExtractor={(item) => item.id}
                  numColumns={PHOTO_COLUMNS}
                  contentContainerStyle={styles.photoGrid}
                  scrollEnabled={false}
                />
              </>
            )}

            {/* Empty State */}
            {folders.length === 0 && photos.length === 0 && (
              <View style={styles.emptyState}>
                <Ionicons name="folder-open-outline" size={48} color="#ccc" />
                <Text style={styles.emptyText}>
                  {currentFolder ? 'Ordner ist leer' : 'Keine Ordner vorhanden'}
                </Text>
              </View>
            )}
          </View>
        </>
      )}

      {/* New/Edit Folder Modal */}
      <Modal visible={showNewFolderModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
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
        </View>
      </Modal>

      {/* Photo Detail Modal */}
      <Modal visible={showPhotoModal} transparent animationType="fade">
        <View style={styles.photoModalOverlay}>
          <TouchableOpacity style={styles.photoModalClose} onPress={() => { setShowPhotoModal(false); setSelectedPhoto(null); }}>
            <Ionicons name="close" size={28} color="#fff" />
          </TouchableOpacity>
          {selectedPhoto && (
            <>
              <Image source={{ uri: selectedPhoto.uri }} style={styles.photoModalImage} resizeMode="contain" />
              <View style={styles.photoModalActions}>
                <TouchableOpacity style={styles.photoActionButton} onPress={() => { setEditPhotoName(selectedPhoto.name || ''); setShowEditPhotoModal(true); }}>
                  <Ionicons name="pencil" size={20} color="#1976d2" />
                  <Text style={styles.photoActionText}>Name</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.photoActionButton} onPress={setAsThumbnail}>
                  <Ionicons name="image" size={20} color="#ff9800" />
                  <Text style={styles.photoActionText}>Vorschau</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.photoActionButton} onPress={() => setShowMoveModal(true)}>
                  <Ionicons name="folder-open" size={20} color="#4caf50" />
                  <Text style={styles.photoActionText}>Verschieben</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.photoActionButton, { backgroundColor: '#ffebee' }]} onPress={deletePhoto}>
                  <Ionicons name="trash" size={20} color="#f44336" />
                  <Text style={[styles.photoActionText, { color: '#f44336' }]}>Löschen</Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      </Modal>

      {/* Edit Photo Name Modal */}
      <Modal visible={showEditPhotoModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
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
        </View>
      </Modal>

      {/* Move Photo Modal */}
      <Modal visible={showMoveModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.moveModalContent}>
            <Text style={styles.modalTitle}>Verschieben nach...</Text>
            <FlatList
              data={folders.filter(f => f.id !== currentFolder?.id)}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <TouchableOpacity style={styles.moveFolderItem} onPress={() => movePhotoToFolder(item.id)}>
                  <Ionicons name="folder" size={20} color="#ffa726" />
                  <Text style={styles.moveFolderName}>{item.name}</Text>
                </TouchableOpacity>
              )}
              ListEmptyComponent={<Text style={styles.noFoldersText}>Keine anderen Ordner</Text>}
            />
            <TouchableOpacity style={styles.moveCancelButton} onPress={() => setShowMoveModal(false)}>
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
  contentContainer: { flex: 1, padding: 12 },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  
  // Header
  header: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#0a1628', paddingTop: 50, paddingBottom: 12, paddingHorizontal: 12 },
  backButton: { padding: 6 },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: 'bold', color: '#fff', textAlign: 'center', marginHorizontal: 8 },
  headerRight: { width: 36 },
  searchButton: { padding: 6 },
  
  // Search
  searchBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', margin: 12, marginTop: 8, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, gap: 8 },
  searchInput: { flex: 1, fontSize: 14, color: '#333' },
  searchResultsList: { padding: 4 },
  searchResultItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', padding: 8, marginBottom: 8, borderRadius: 8 },
  searchResultImage: { width: 50, height: 50, borderRadius: 6 },
  searchResultInfo: { flex: 1, marginLeft: 12 },
  searchResultName: { fontSize: 14, fontWeight: '500', color: '#333' },
  
  // Breadcrumb
  breadcrumb: { backgroundColor: '#fff', paddingHorizontal: 12, paddingVertical: 8, flexDirection: 'row' },
  breadcrumbRow: { flexDirection: 'row', alignItems: 'center' },
  breadcrumbItem: { fontSize: 13, color: '#1976d2', marginHorizontal: 4 },
  breadcrumbActive: { fontWeight: '600', color: '#333' },
  
  // New Folder Button
  newFolderButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#e3f2fd', paddingVertical: 10, borderRadius: 8, marginBottom: 12, gap: 6 },
  newFolderButtonText: { color: '#1976d2', fontSize: 13, fontWeight: '600' },
  
  // Folder Grid
  folderGrid: { paddingBottom: 8 },
  folderCard: { width: FOLDER_SIZE, backgroundColor: '#fff', borderRadius: 8, padding: 8, margin: 4, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 2, elevation: 2 },
  folderIconContainer: { width: FOLDER_SIZE - 24, height: FOLDER_SIZE - 24, justifyContent: 'center', alignItems: 'center', borderRadius: 6, overflow: 'hidden', backgroundColor: '#f5f5f5' },
  folderThumbnail: { width: '100%', height: '100%' },
  folderName: { fontSize: 11, fontWeight: '600', color: '#333', textAlign: 'center', marginTop: 4 },
  folderMeta: { fontSize: 9, color: '#999', marginTop: 2 },
  
  // Add Photo Buttons
  addPhotoButtons: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  addPhotoButton: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff', borderWidth: 1, borderColor: '#1976d2', borderRadius: 8, paddingVertical: 8, gap: 4 },
  addPhotoButtonText: { fontSize: 11, color: '#1976d2', fontWeight: '500' },
  
  // Photos Grid
  sectionTitle: { fontSize: 13, fontWeight: '600', color: '#666', marginBottom: 8, marginTop: 4 },
  photoGrid: { paddingBottom: 8 },
  photoItem: { width: PHOTO_SIZE, height: PHOTO_SIZE, margin: 4, borderRadius: 6, overflow: 'hidden' },
  photoThumbnail: { width: '100%', height: '100%' },
  photoNameBadge: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.6)', padding: 3 },
  photoNameText: { fontSize: 9, color: '#fff', textAlign: 'center' },
  
  // Empty State
  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 40 },
  emptyText: { fontSize: 14, color: '#999', marginTop: 12 },
  
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
  photoModalClose: { position: 'absolute', top: 50, right: 16, zIndex: 10, padding: 8 },
  photoModalImage: { flex: 1, width: '100%' },
  photoModalActions: { flexDirection: 'row', backgroundColor: '#fff', paddingVertical: 12, paddingHorizontal: 8, gap: 6 },
  photoActionButton: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 8, backgroundColor: '#f5f5f5', gap: 2 },
  photoActionText: { fontSize: 10, fontWeight: '500', color: '#333' },
  
  // Move Modal
  moveModalContent: { backgroundColor: '#fff', borderRadius: 12, padding: 16, width: '100%', maxWidth: 340, maxHeight: '60%' },
  moveFolderItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: '#eee', gap: 10 },
  moveFolderName: { flex: 1, fontSize: 14, color: '#333' },
  noFoldersText: { textAlign: 'center', color: '#999', paddingVertical: 16 },
  moveCancelButton: { marginTop: 12, paddingVertical: 10, backgroundColor: '#f5f5f5', borderRadius: 8, alignItems: 'center' },
  moveCancelButtonText: { color: '#666', fontSize: 14, fontWeight: '600' },
});

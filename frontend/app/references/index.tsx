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
} from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { ReferenceService, ReferenceFolder, ReferencePhoto } from '../../services/ReferenceService';

const { width: screenWidth } = Dimensions.get('window');
const COLUMN_COUNT = 3;
const IMAGE_SIZE = (screenWidth - 48 - (COLUMN_COUNT - 1) * 8) / COLUMN_COUNT;

export default function ReferencesScreen() {
  const router = useRouter();
  const [folders, setFolders] = useState<ReferenceFolder[]>([]);
  const [currentFolder, setCurrentFolder] = useState<ReferenceFolder | null>(null);
  const [photos, setPhotos] = useState<ReferencePhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewFolderModal, setShowNewFolderModal] = useState(false);
  const [showPhotoModal, setShowPhotoModal] = useState(false);
  const [showMoveModal, setShowMoveModal] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState<ReferencePhoto | null>(null);
  const [newFolderName, setNewFolderName] = useState('');
  const [editingFolder, setEditingFolder] = useState<ReferenceFolder | null>(null);

  // Load data
  const loadData = async () => {
    try {
      setLoading(true);
      if (currentFolder) {
        const folderPhotos = await ReferenceService.getPhotosInFolder(currentFolder.id);
        setPhotos(folderPhotos);
      } else {
        const allFolders = await ReferenceService.getAllFolders();
        setFolders(allFolders);
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
    }, [currentFolder])
  );

  // Create new folder
  const createFolder = async () => {
    if (!newFolderName.trim()) {
      Alert.alert('Fehler', 'Bitte geben Sie einen Ordnernamen ein');
      return;
    }

    try {
      if (editingFolder) {
        await ReferenceService.updateFolder(editingFolder.id, { name: newFolderName.trim() });
      } else {
        await ReferenceService.createFolder(newFolderName.trim());
      }
      setNewFolderName('');
      setEditingFolder(null);
      setShowNewFolderModal(false);
      loadData();
    } catch (error) {
      console.error('Error creating/updating folder:', error);
      Alert.alert('Fehler', 'Ordner konnte nicht erstellt/geändert werden');
    }
  };

  // Delete folder
  const deleteFolder = (folder: ReferenceFolder) => {
    Alert.alert(
      'Ordner löschen',
      `Möchten Sie den Ordner "${folder.name}" und alle enthaltenen Fotos wirklich löschen?`,
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
              console.error('Error deleting folder:', error);
              Alert.alert('Fehler', 'Ordner konnte nicht gelöscht werden');
            }
          },
        },
      ]
    );
  };

  // Add photo from camera
  const addPhotoFromCamera = async () => {
    if (!currentFolder) return;

    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Berechtigung erforderlich', 'Bitte erlauben Sie den Kamerazugriff');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      try {
        await ReferenceService.addPhoto(currentFolder.id, result.assets[0].uri, 'camera');
        loadData();
      } catch (error) {
        console.error('Error adding photo from camera:', error);
        Alert.alert('Fehler', 'Foto konnte nicht hinzugefügt werden');
      }
    }
  };

  // Add photo from gallery
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
      try {
        for (const asset of result.assets) {
          await ReferenceService.addPhoto(currentFolder.id, asset.uri, 'gallery');
        }
        loadData();
      } catch (error) {
        console.error('Error adding photos from gallery:', error);
        Alert.alert('Fehler', 'Fotos konnten nicht hinzugefügt werden');
      }
    }
  };

  // Add photo from Files app (for USB, iCloud, etc.)
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
      console.error('Error adding photos from files:', error);
      Alert.alert('Fehler', 'Fotos konnten nicht hinzugefügt werden');
    }
  };

  // Delete photo
  const deletePhoto = (photo: ReferencePhoto) => {
    Alert.alert(
      'Foto löschen',
      'Möchten Sie dieses Foto wirklich löschen?',
      [
        { text: 'Abbrechen', style: 'cancel' },
        {
          text: 'Löschen',
          style: 'destructive',
          onPress: async () => {
            try {
              await ReferenceService.deletePhoto(photo.id);
              setShowPhotoModal(false);
              setSelectedPhoto(null);
              loadData();
            } catch (error) {
              console.error('Error deleting photo:', error);
              Alert.alert('Fehler', 'Foto konnte nicht gelöscht werden');
            }
          },
        },
      ]
    );
  };

  // Move photo to another folder
  const movePhotoToFolder = async (targetFolderId: string) => {
    if (!selectedPhoto) return;

    try {
      await ReferenceService.movePhoto(selectedPhoto.id, targetFolderId);
      setShowMoveModal(false);
      setShowPhotoModal(false);
      setSelectedPhoto(null);
      loadData();
      Alert.alert('Erfolg', 'Foto wurde verschoben');
    } catch (error) {
      console.error('Error moving photo:', error);
      Alert.alert('Fehler', 'Foto konnte nicht verschoben werden');
    }
  };

  // Render folder item
  const renderFolderItem = ({ item }: { item: ReferenceFolder }) => (
    <TouchableOpacity
      style={styles.folderCard}
      onPress={() => setCurrentFolder(item)}
      onLongPress={() => {
        Alert.alert(
          item.name,
          'Was möchten Sie tun?',
          [
            { text: 'Abbrechen', style: 'cancel' },
            {
              text: 'Umbenennen',
              onPress: () => {
                setEditingFolder(item);
                setNewFolderName(item.name);
                setShowNewFolderModal(true);
              },
            },
            {
              text: 'Löschen',
              style: 'destructive',
              onPress: () => deleteFolder(item),
            },
          ]
        );
      }}
    >
      <View style={styles.folderIconContainer}>
        {item.thumbnail_uri ? (
          <Image source={{ uri: item.thumbnail_uri }} style={styles.folderThumbnail} />
        ) : (
          <Ionicons name="folder" size={48} color="#ffa726" />
        )}
      </View>
      <Text style={styles.folderName} numberOfLines={2}>{item.name}</Text>
      <Text style={styles.folderCount}>{item.photo_count || 0} Fotos</Text>
    </TouchableOpacity>
  );

  // Render photo item
  const renderPhotoItem = ({ item }: { item: ReferencePhoto }) => (
    <TouchableOpacity
      style={styles.photoItem}
      onPress={() => {
        setSelectedPhoto(item);
        setShowPhotoModal(true);
      }}
    >
      <Image source={{ uri: item.uri }} style={styles.photoThumbnail} />
    </TouchableOpacity>
  );

  // Header with back button when in folder view
  const renderHeader = () => (
    <View style={styles.header}>
      {currentFolder ? (
        <>
          <TouchableOpacity 
            style={styles.backButton}
            onPress={() => {
              setCurrentFolder(null);
              setPhotos([]);
            }}
          >
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{currentFolder.name}</Text>
          <View style={styles.headerRight} />
        </>
      ) : (
        <>
          <TouchableOpacity 
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Referenz Fotos</Text>
          <View style={styles.headerRight} />
        </>
      )}
    </View>
  );

  if (loading) {
    return (
      <View style={styles.container}>
        {renderHeader()}
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#1976d2" />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container} key={currentFolder ? 'photo-view' : 'folder-view'}>
      {renderHeader()}

      {currentFolder ? (
        // Photo view inside folder
        <View style={styles.contentContainer}>
          {/* Add photo buttons */}
          <View style={styles.addPhotoButtons}>
            <TouchableOpacity style={styles.addPhotoButton} onPress={addPhotoFromCamera}>
              <Ionicons name="camera" size={24} color="#1976d2" />
              <Text style={styles.addPhotoButtonText}>Kamera</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.addPhotoButton} onPress={addPhotoFromGallery}>
              <Ionicons name="images" size={24} color="#1976d2" />
              <Text style={styles.addPhotoButtonText}>Galerie</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.addPhotoButton} onPress={addPhotoFromFiles}>
              <Ionicons name="folder-open" size={24} color="#1976d2" />
              <Text style={styles.addPhotoButtonText}>Dateien</Text>
            </TouchableOpacity>
          </View>

          {photos.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="images-outline" size={64} color="#ccc" />
              <Text style={styles.emptyText}>Keine Fotos vorhanden</Text>
              <Text style={styles.emptySubtext}>Fügen Sie Fotos über die Buttons oben hinzu</Text>
            </View>
          ) : (
            <FlatList
              key={`photos-${currentFolder.id}`}
              data={photos}
              renderItem={renderPhotoItem}
              keyExtractor={(item) => item.id}
              numColumns={COLUMN_COUNT}
              contentContainerStyle={styles.photoGrid}
            />
          )}
        </View>
      ) : (
        // Folder view
        <View style={styles.contentContainer}>
          <TouchableOpacity
            style={styles.newFolderButton}
            onPress={() => {
              setEditingFolder(null);
              setNewFolderName('');
              setShowNewFolderModal(true);
            }}
          >
            <Ionicons name="add-circle" size={24} color="#fff" />
            <Text style={styles.newFolderButtonText}>Neuen Ordner erstellen</Text>
          </TouchableOpacity>

          {folders.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="folder-open-outline" size={64} color="#ccc" />
              <Text style={styles.emptyText}>Keine Ordner vorhanden</Text>
              <Text style={styles.emptySubtext}>Erstellen Sie Ihren ersten Ordner</Text>
            </View>
          ) : (
            <FlatList
              key="folders-list"
              data={folders}
              renderItem={renderFolderItem}
              keyExtractor={(item) => item.id}
              numColumns={2}
              contentContainerStyle={styles.folderGrid}
            />
          )}
        </View>
      )}

      {/* New Folder Modal */}
      <Modal
        visible={showNewFolderModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowNewFolderModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              {editingFolder ? 'Ordner umbenennen' : 'Neuer Ordner'}
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
                onPress={() => {
                  setShowNewFolderModal(false);
                  setNewFolderName('');
                  setEditingFolder(null);
                }}
              >
                <Text style={styles.modalButtonCancelText}>Abbrechen</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonConfirm]}
                onPress={createFolder}
              >
                <Text style={styles.modalButtonConfirmText}>
                  {editingFolder ? 'Speichern' : 'Erstellen'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Photo Detail Modal */}
      <Modal
        visible={showPhotoModal}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setShowPhotoModal(false);
          setSelectedPhoto(null);
        }}
      >
        <View style={styles.photoModalOverlay}>
          <View style={styles.photoModalContent}>
            <TouchableOpacity
              style={styles.photoModalClose}
              onPress={() => {
                setShowPhotoModal(false);
                setSelectedPhoto(null);
              }}
            >
              <Ionicons name="close" size={28} color="#fff" />
            </TouchableOpacity>

            {selectedPhoto && (
              <>
                <Image
                  source={{ uri: selectedPhoto.uri }}
                  style={styles.photoModalImage}
                  resizeMode="contain"
                />

                <View style={styles.photoModalActions}>
                  <TouchableOpacity
                    style={styles.photoModalButton}
                    onPress={() => setShowMoveModal(true)}
                  >
                    <Ionicons name="move" size={24} color="#1976d2" />
                    <Text style={styles.photoModalButtonText}>Verschieben</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.photoModalButton, styles.photoModalButtonDanger]}
                    onPress={() => deletePhoto(selectedPhoto)}
                  >
                    <Ionicons name="trash" size={24} color="#f44336" />
                    <Text style={[styles.photoModalButtonText, { color: '#f44336' }]}>Löschen</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* Move Photo Modal */}
      <Modal
        visible={showMoveModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowMoveModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.moveModalContent}>
            <Text style={styles.modalTitle}>Verschieben nach...</Text>
            <FlatList
              data={folders.filter(f => f.id !== currentFolder?.id)}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.moveFolderItem}
                  onPress={() => movePhotoToFolder(item.id)}
                >
                  <Ionicons name="folder" size={24} color="#ffa726" />
                  <Text style={styles.moveFolderName}>{item.name}</Text>
                  <Ionicons name="chevron-forward" size={20} color="#999" />
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <Text style={styles.noFoldersText}>Keine anderen Ordner vorhanden</Text>
              }
            />
            <TouchableOpacity
              style={styles.moveCancelButton}
              onPress={() => setShowMoveModal(false)}
            >
              <Text style={styles.moveCancelButtonText}>Abbrechen</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  contentContainer: {
    flex: 1,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0a1628',
    paddingTop: 50,
    paddingBottom: 16,
    paddingHorizontal: 16,
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    flex: 1,
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
    textAlign: 'center',
  },
  headerRight: {
    width: 40,
  },
  newFolderButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1976d2',
    marginHorizontal: 16,
    marginTop: 16,
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
  },
  newFolderButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  folderGrid: {
    padding: 16,
  },
  folderCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    margin: 4,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    maxWidth: '48%',
  },
  folderIconContainer: {
    width: 80,
    height: 80,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
    borderRadius: 8,
    overflow: 'hidden',
  },
  folderThumbnail: {
    width: 80,
    height: 80,
    borderRadius: 8,
  },
  folderName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    textAlign: 'center',
    marginBottom: 4,
  },
  folderCount: {
    fontSize: 12,
    color: '#666',
  },
  addPhotoButtons: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  addPhotoButton: {
    flex: 1,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#1976d2',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    gap: 4,
  },
  addPhotoButtonText: {
    fontSize: 12,
    color: '#1976d2',
    fontWeight: '500',
  },
  photoGrid: {
    padding: 16,
  },
  photoItem: {
    width: IMAGE_SIZE,
    height: IMAGE_SIZE,
    margin: 4,
    borderRadius: 8,
    overflow: 'hidden',
  },
  photoThumbnail: {
    width: '100%',
    height: '100%',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#666',
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#999',
    marginTop: 8,
    textAlign: 'center',
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 16,
    textAlign: 'center',
  },
  modalInput: {
    backgroundColor: '#f5f5f5',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#333',
    marginBottom: 16,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  modalButtonCancel: {
    backgroundColor: '#f5f5f5',
  },
  modalButtonCancelText: {
    color: '#666',
    fontSize: 16,
    fontWeight: '600',
  },
  modalButtonConfirm: {
    backgroundColor: '#1976d2',
  },
  modalButtonConfirmText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  // Photo modal styles
  photoModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
  },
  photoModalContent: {
    flex: 1,
  },
  photoModalClose: {
    position: 'absolute',
    top: 50,
    right: 20,
    zIndex: 10,
    padding: 8,
  },
  photoModalImage: {
    flex: 1,
    width: '100%',
  },
  photoModalActions: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    paddingVertical: 16,
    paddingHorizontal: 24,
    gap: 16,
  },
  photoModalButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#e3f2fd',
    gap: 8,
  },
  photoModalButtonDanger: {
    backgroundColor: '#ffebee',
  },
  photoModalButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1976d2',
  },
  // Move modal styles
  moveModalContent: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    width: '100%',
    maxWidth: 400,
    maxHeight: '70%',
  },
  moveFolderItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    gap: 12,
  },
  moveFolderName: {
    flex: 1,
    fontSize: 16,
    color: '#333',
  },
  noFoldersText: {
    textAlign: 'center',
    color: '#999',
    paddingVertical: 20,
  },
  moveCancelButton: {
    marginTop: 16,
    paddingVertical: 14,
    backgroundColor: '#f5f5f5',
    borderRadius: 10,
    alignItems: 'center',
  },
  moveCancelButtonText: {
    color: '#666',
    fontSize: 16,
    fontWeight: '600',
  },
});

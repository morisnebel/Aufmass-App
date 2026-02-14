import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Alert,
  Platform,
  ActivityIndicator,
  Modal,
  ScrollView,
  Dimensions,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PhotoService, Photo } from '../../services/LocalStorage';

const { width: screenWidth } = Dimensions.get('window');
const PHOTO_SIZE = (screenWidth - 48) / 3; // 3 columns with padding

export default function NewSketchScreen() {
  const router = useRouter();
  const { projectId } = useLocalSearchParams();
  const [loading, setLoading] = useState(false);
  const [projectPhotos, setProjectPhotos] = useState<Photo[]>([]);
  const [showPhotoModal, setShowPhotoModal] = useState(false);
  const [loadingPhotos, setLoadingPhotos] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState<Photo | null>(null);
  const [preparingSketch, setPreparingSketch] = useState(false);

  // Projektfotos beim Öffnen des Modals laden
  const loadProjectPhotos = async () => {
    setLoadingPhotos(true);
    setSelectedPhoto(null);
    try {
      const projId = Array.isArray(projectId) ? projectId[0] : projectId;
      if (projId) {
        const photos = await PhotoService.getByProjectId(projId);
        setProjectPhotos(photos);
      }
    } catch (error) {
      console.error('Error loading project photos:', error);
    } finally {
      setLoadingPhotos(false);
    }
  };

  const handleOpenPhotoModal = () => {
    loadProjectPhotos();
    setShowPhotoModal(true);
  };

  const handleSelectPhoto = (photo: Photo) => {
    // Toggle Auswahl
    if (selectedPhoto?.id === photo.id) {
      setSelectedPhoto(null);
    } else {
      setSelectedPhoto(photo);
    }
  };

  const handleConfirmProjectPhoto = async () => {
    if (!selectedPhoto) return;
    
    setPreparingSketch(true);
    
    // Kurze Verzögerung für besseres UX-Feedback
    await new Promise(resolve => setTimeout(resolve, 300));
    
    const imageUri = (selectedPhoto as any).image_data || selectedPhoto.uri;
    setShowPhotoModal(false);
    setPreparingSketch(false);
    setSelectedPhoto(null);
    
    router.push(`/sketches/draw?projectId=${projectId}&backgroundImageUri=${encodeURIComponent(imageUri)}`);
  };

  const handleCloseModal = () => {
    setShowPhotoModal(false);
    setSelectedPhoto(null);
  };

  const requestPermissions = async (forCamera: boolean) => {
    if (Platform.OS !== 'web') {
      if (forCamera) {
        const { status: cameraStatus } = await ImagePicker.requestCameraPermissionsAsync();
        if (cameraStatus !== 'granted') {
          Alert.alert(
            'Berechtigung erforderlich',
            'Bitte erlauben Sie den Zugriff auf die Kamera'
          );
          return false;
        }
      }
      const { status: mediaStatus } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (mediaStatus !== 'granted') {
        Alert.alert(
          'Berechtigung erforderlich',
          'Bitte erlauben Sie den Zugriff auf die Galerie'
        );
        return false;
      }
    }
    return true;
  };

  const handleBlankSketch = () => {
    // Navigate to draw screen without background image
    router.push(`/sketches/draw?projectId=${projectId}`);
  };

  const handleTakePhoto = async () => {
    const hasPermission = await requestPermissions(true);
    if (!hasPermission) return;

    setLoading(true);
    try {
      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        quality: 0.8,
        base64: true,
      });

      if (!result.canceled && result.assets[0]) {
        const base64Image = `data:image/jpeg;base64,${result.assets[0].base64}`;
        // Navigate to draw screen with background image
        router.push(`/sketches/draw?projectId=${projectId}&backgroundImageUri=${encodeURIComponent(base64Image)}`);
      }
    } catch (error) {
      console.error('Error taking photo:', error);
      if (Platform.OS === 'web') {
        alert('Fehler beim Aufnehmen des Fotos');
      } else {
        Alert.alert('Fehler', 'Foto konnte nicht aufgenommen werden');
      }
    } finally {
      setLoading(false);
    }
  };

  const handlePickFromGallery = async () => {
    const hasPermission = await requestPermissions(false);
    if (!hasPermission) return;

    setLoading(true);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.8,
        base64: true,
      });

      if (!result.canceled && result.assets[0]) {
        const base64Image = `data:image/jpeg;base64,${result.assets[0].base64}`;
        // Navigate to draw screen with background image
        router.push(`/sketches/draw?projectId=${projectId}&backgroundImageUri=${encodeURIComponent(base64Image)}`);
      }
    } catch (error) {
      console.error('Error picking image:', error);
      if (Platform.OS === 'web') {
        alert('Fehler beim Auswählen des Bildes');
      } else {
        Alert.alert('Fehler', 'Bild konnte nicht ausgewählt werden');
      }
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#1976d2" />
        <Text style={styles.loadingText}>Bild wird vorbereitet...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Neue Skizze erstellen</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.content}>
        <Text style={styles.subtitle}>
          Wählen Sie, wie Sie Ihre Skizze erstellen möchten:
        </Text>

        <View style={styles.optionsContainer}>
          {/* Option 1: Blank Sketch */}
          <TouchableOpacity style={styles.optionButton} onPress={handleBlankSketch}>
            <View style={[styles.iconContainer, { backgroundColor: '#e3f2fd' }]}>
              <Ionicons name="document-outline" size={26} color="#1976d2" />
            </View>
            <View style={styles.optionTextContainer}>
              <Text style={styles.optionTitle}>Leere Skizze</Text>
              <Text style={styles.optionDescription}>
                Mit leerer Zeichenfläche beginnen
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#ccc" style={styles.optionArrow} />
          </TouchableOpacity>

          {/* Option 2: Take Photo */}
          <TouchableOpacity style={styles.optionButton} onPress={handleTakePhoto}>
            <View style={[styles.iconContainer, { backgroundColor: '#e8f5e9' }]}>
              <Ionicons name="camera" size={26} color="#4caf50" />
            </View>
            <View style={styles.optionTextContainer}>
              <Text style={styles.optionTitle}>Foto aufnehmen</Text>
              <Text style={styles.optionDescription}>
                Objekt fotografieren und darauf zeichnen
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#ccc" style={styles.optionArrow} />
          </TouchableOpacity>

          {/* Option 3: Pick from Gallery */}
          <TouchableOpacity style={styles.optionButton} onPress={handlePickFromGallery}>
            <View style={[styles.iconContainer, { backgroundColor: '#fff3e0' }]}>
              <Ionicons name="images" size={26} color="#ff9800" />
            </View>
            <View style={styles.optionTextContainer}>
              <Text style={styles.optionTitle}>Aus Galerie wählen</Text>
              <Text style={styles.optionDescription}>
                Vorhandenes Bild als Hintergrund
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#ccc" style={styles.optionArrow} />
          </TouchableOpacity>

          {/* Option 4: Pick from Project Photos */}
          <TouchableOpacity style={styles.optionButton} onPress={handleOpenPhotoModal}>
            <View style={[styles.iconContainer, { backgroundColor: '#e1f5fe' }]}>
              <Ionicons name="folder-open" size={26} color="#0288d1" />
            </View>
            <View style={styles.optionTextContainer}>
              <Text style={styles.optionTitle}>Aus Projektfotos wählen</Text>
              <Text style={styles.optionDescription}>
                Bereits zum Projekt hinzugefügte Fotos
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#ccc" style={styles.optionArrow} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Modal für Projektfotos */}
      <Modal
        visible={showPhotoModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={handleCloseModal}
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={handleCloseModal} style={styles.modalCloseButton}>
              <Ionicons name="close" size={28} color="#333" />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Projektfotos</Text>
            <View style={{ width: 44 }} />
          </View>

          {loadingPhotos ? (
            <View style={styles.modalLoadingContainer}>
              <ActivityIndicator size="large" color="#1976d2" />
              <Text style={styles.loadingText}>Fotos werden geladen...</Text>
            </View>
          ) : projectPhotos.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="images-outline" size={64} color="#ccc" />
              <Text style={styles.emptyText}>Keine Fotos vorhanden</Text>
              <Text style={styles.emptySubtext}>
                Fügen Sie zuerst Fotos zum Projekt hinzu
              </Text>
            </View>
          ) : (
            <>
              <Text style={styles.selectHintText}>
                Tippen Sie auf ein Foto um es auszuwählen
              </Text>
              <ScrollView style={styles.photosScrollView} contentContainerStyle={styles.photosGrid}>
                {projectPhotos.map((photo) => {
                  const isSelected = selectedPhoto?.id === photo.id;
                  return (
                    <TouchableOpacity
                      key={photo.id}
                      style={[
                        styles.photoGridItem,
                        isSelected && styles.photoGridItemSelected
                      ]}
                      onPress={() => handleSelectPhoto(photo)}
                      activeOpacity={0.7}
                    >
                      <Image
                        source={{ uri: (photo as any).image_data || photo.uri }}
                        style={styles.photoGridImage}
                      />
                      {isSelected && (
                        <View style={styles.selectedOverlay}>
                          <View style={styles.checkmarkCircle}>
                            <Ionicons name="checkmark" size={24} color="#fff" />
                          </View>
                        </View>
                      )}
                      {photo.description && !isSelected && (
                        <View style={styles.photoDescriptionOverlay}>
                          <Text style={styles.photoDescriptionText} numberOfLines={1}>
                            {photo.description}
                          </Text>
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
              
              {/* Bestätigen Button */}
              {selectedPhoto && (
                <View style={styles.confirmButtonContainer}>
                  <TouchableOpacity
                    style={[styles.confirmButton, preparingSketch && styles.confirmButtonDisabled]}
                    onPress={handleConfirmProjectPhoto}
                    disabled={preparingSketch}
                  >
                    {preparingSketch ? (
                      <View style={styles.confirmButtonContent}>
                        <ActivityIndicator size="small" color="#fff" />
                        <Text style={styles.confirmButtonText}>Wird vorbereitet...</Text>
                      </View>
                    ) : (
                      <View style={styles.confirmButtonContent}>
                        <Ionicons name="brush" size={20} color="#fff" />
                        <Text style={styles.confirmButtonText}>Skizze erstellen</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                </View>
              )}
            </>
          )}
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#333',
  },
  content: {
    flex: 1,
    padding: 12,
    justifyContent: 'center',
  },
  subtitle: {
    fontSize: 15,
    color: '#666',
    textAlign: 'center',
    marginBottom: 16,
  },
  optionsContainer: {
    gap: 10,
  },
  optionButton: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  iconContainer: {
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  optionTextContainer: {
    flex: 1,
  },
  optionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 2,
  },
  optionDescription: {
    fontSize: 13,
    color: '#666',
  },
  optionArrow: {
    marginLeft: 8,
  },
  // Modal Styles
  modalContainer: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  modalCloseButton: {
    padding: 8,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  modalLoadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
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
  photosScrollView: {
    flex: 1,
  },
  photosGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 8,
  },
  photoGridItem: {
    width: PHOTO_SIZE,
    height: PHOTO_SIZE,
    margin: 4,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#e0e0e0',
  },
  photoGridImage: {
    width: '100%',
    height: '100%',
  },
  photoDescriptionOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  photoDescriptionText: {
    color: '#fff',
    fontSize: 11,
  },
  // Neue Styles für Foto-Auswahl
  selectHintText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  photoGridItemSelected: {
    borderWidth: 3,
    borderColor: '#4caf50',
  },
  selectedOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(76, 175, 80, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkmarkCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#4caf50',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  confirmButtonContainer: {
    padding: 16,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  confirmButton: {
    backgroundColor: '#4caf50',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmButtonDisabled: {
    backgroundColor: '#a5d6a7',
  },
  confirmButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  confirmButtonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
  },
});

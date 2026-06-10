import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Alert,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Modal,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTranslation } from 'react-i18next';
import { PhotoService } from '../../services/LocalStorage';

const IMAGEMETER_STORAGE_KEY = 'aufmassprofi_imagemeter_photos';

export default function ImageMeterNewScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useLocalSearchParams();
  const projectId = params.projectId as string | undefined;
  
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [showProjectPhotosModal, setShowProjectPhotosModal] = useState(false);
  const [projectPhotos, setProjectPhotos] = useState<any[]>([]);

  // Projektfotos laden und Modal öffnen
  const openProjectPhotos = async () => {
    if (!projectId) {
      Alert.alert(t('common.note'), 'Dieses Foto ist keinem Projekt zugeordnet.');
      return;
    }
    const photos = await PhotoService.getByProjectId(projectId);
    setProjectPhotos(photos);
    setShowProjectPhotosModal(true);
  };

  const selectProjectPhoto = (photo: any) => {
    const uri = photo.image_data || photo.uri;
    if (!uri) {
      Alert.alert(t('common.error'), 'Bild konnte nicht geladen werden');
      return;
    }
    setImageUri(uri);
    setShowProjectPhotosModal(false);
  };

  // Kamera-Berechtigung anfordern
  useEffect(() => {
    (async () => {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          t('customers.permissionRequired'),
          t('imagemeter.cameraPermission')
        );
      }
    })();
  }, []);

  const takePhoto = async () => {
    try {
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        quality: 0.9,
        base64: true,
        exif: false,
      });

      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        // Speichere als base64 für Persistenz
        const base64Uri = asset.base64 
          ? `data:image/jpeg;base64,${asset.base64}`
          : asset.uri;
        setImageUri(base64Uri);
      }
    } catch (error) {
      console.error('Error taking photo:', error);
      Alert.alert(t('common.error'), 'Foto konnte nicht aufgenommen werden');
    }
  };

  const pickImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.9,
        base64: true,
        exif: false,
      });

      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        const base64Uri = asset.base64 
          ? `data:image/jpeg;base64,${asset.base64}`
          : asset.uri;
        setImageUri(base64Uri);
      }
    } catch (error) {
      console.error('Error picking image:', error);
      Alert.alert(t('common.error'), 'Bild konnte nicht geladen werden');
    }
  };

  const saveAndContinue = async () => {
    if (!imageUri) {
      Alert.alert(t('common.note'), 'Bitte nehmen Sie zuerst ein Foto auf oder wählen Sie ein Bild aus.');
      return;
    }

    setLoading(true);
    try {
      // Lade existierende Fotos
      const existingData = await AsyncStorage.getItem(IMAGEMETER_STORAGE_KEY);
      const photos = existingData ? JSON.parse(existingData) : [];

      // Neues Foto erstellen
      const newPhoto = {
        id: `imagemeter_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        imageUri: imageUri,
        name: name.trim() || `Messung ${photos.length + 1}`,
        projectId: projectId,
        measurements: [],
        referenceScale: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      // Speichern
      photos.push(newPhoto);
      await AsyncStorage.setItem(IMAGEMETER_STORAGE_KEY, JSON.stringify(photos));

      // Zur Messansicht navigieren
      router.replace(`/imagemeter/measure?id=${newPhoto.id}`);
    } catch (error) {
      console.error('Error saving photo:', error);
      Alert.alert(t('common.error'), 'Foto konnte nicht gespeichert werden');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <KeyboardAvoidingView 
        style={{ flex: 1 }} 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="close" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Neues Foto</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
          {/* Bildvorschau / Aufnahme-Buttons */}
          {imageUri ? (
            <View style={styles.imagePreviewContainer}>
              <Image source={{ uri: imageUri }} style={styles.imagePreview} />
              <TouchableOpacity
                style={styles.changeImageButton}
                onPress={() => setImageUri(null)}
              >
                <Ionicons name="refresh" size={20} color="#fff" />
                <Text style={styles.changeImageText}>Anderes Bild</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.captureContainer}>
              <TouchableOpacity style={styles.captureButton} onPress={takePhoto}>
                <View style={styles.captureIconContainer}>
                  <Ionicons name="camera" size={48} color="#1976d2" />
                </View>
                <Text style={styles.captureButtonText}>Foto aufnehmen</Text>
                <Text style={styles.captureButtonSubtext}>Kamera öffnen</Text>
              </TouchableOpacity>

              <View style={styles.orDivider}>
                <View style={styles.dividerLine} />
                <Text style={styles.orText}>ODER</Text>
                <View style={styles.dividerLine} />
              </View>

              <TouchableOpacity style={styles.galleryButton} onPress={pickImage}>
                <Ionicons name="images" size={24} color="#666" />
                <Text style={styles.galleryButtonText}>Aus Galerie wählen</Text>
              </TouchableOpacity>

              <TouchableOpacity testID="project-photos-btn" style={[styles.galleryButton, { marginTop: 12, backgroundColor: '#e3f2fd' }]} onPress={openProjectPhotos}>
                <Ionicons name="folder-open" size={24} color="#1976d2" />
                <Text style={[styles.galleryButtonText, { color: '#1976d2' }]}>Aus Projektfotos wählen</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Name Eingabe */}
          {imageUri && (
            <View style={styles.nameSection}>
              <Text style={styles.sectionLabel}>Name (optional)</Text>
              <TextInput
                style={styles.nameInput}
                value={name}
                onChangeText={setName}
                placeholder="z.B. Wohnzimmer, Fassade Nord..."
                placeholderTextColor="#999"
                returnKeyType="done"
              />
            </View>
          )}

          {/* Info */}
          {imageUri && (
            <View style={styles.infoBox}>
              <Ionicons name="information-circle" size={20} color="#1976d2" />
              <Text style={styles.infoText}>
                Nach dem Speichern können Sie Messlinien zeichnen und ein Referenzmaß für automatische Berechnungen setzen.
              </Text>
            </View>
          )}
        </ScrollView>

        {/* Speichern Button */}
        {imageUri && (
          <View style={styles.footer}>
            <TouchableOpacity
              style={[styles.saveButton, loading && styles.saveButtonDisabled]}
              onPress={saveAndContinue}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="arrow-forward" size={22} color="#fff" />
                  <Text style={styles.saveButtonText}>Weiter zum Messen</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}
      </KeyboardAvoidingView>

      {/* Projektfotos Modal */}
      <Modal visible={showProjectPhotosModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <Text style={styles.modalTitle}>Projektfoto wählen</Text>
              <TouchableOpacity onPress={() => setShowProjectPhotosModal(false)}>
                <Ionicons name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>
            {projectPhotos.length === 0 ? (
              <View style={{ padding: 40, alignItems: 'center' }}>
                <Ionicons name="images-outline" size={48} color="#ccc" />
                <Text style={{ marginTop: 16, color: '#666', textAlign: 'center' }}>Keine Projektfotos vorhanden</Text>
                <Text style={{ marginTop: 8, color: '#999', fontSize: 12, textAlign: 'center' }}>Fügen Sie zuerst Fotos im Projekt hinzu.</Text>
              </View>
            ) : (
              <ScrollView style={{ maxHeight: 400 }}>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {projectPhotos.map((photo, index) => (
                    <TouchableOpacity
                      key={photo.id || index}
                      style={styles.photoThumb}
                      onPress={() => selectProjectPhoto(photo)}
                    >
                      {(photo.image_data || photo.uri) ? (
                        <Image source={{ uri: photo.image_data || photo.uri }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                      ) : (
                        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                          <Ionicons name="image-outline" size={32} color="#ccc" />
                        </View>
                      )}
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
            )}
            <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setShowProjectPhotosModal(false)}>
              <Text style={{ color: '#666', fontWeight: '600' }}>Abbrechen</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1976d2',
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
  },
  captureContainer: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  captureButton: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  captureIconContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#e3f2fd',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  captureButtonText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1976d2',
  },
  captureButtonSubtext: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  orDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    marginVertical: 20,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#e0e0e0',
  },
  orText: {
    paddingHorizontal: 16,
    fontSize: 12,
    color: '#999',
    fontWeight: '600',
  },
  galleryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    backgroundColor: '#f5f5f5',
    gap: 8,
  },
  galleryButtonText: {
    fontSize: 16,
    color: '#666',
    fontWeight: '500',
  },
  imagePreviewContainer: {
    backgroundColor: '#fff',
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  imagePreview: {
    width: '100%',
    height: 300,
    backgroundColor: '#e0e0e0',
  },
  changeImageButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1976d2',
    paddingVertical: 12,
    gap: 8,
  },
  changeImageText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  nameSection: {
    marginTop: 16,
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginBottom: 8,
  },
  nameInput: {
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#333',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  infoBox: {
    flexDirection: 'row',
    backgroundColor: '#e3f2fd',
    borderRadius: 12,
    padding: 12,
    marginTop: 16,
    gap: 8,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    color: '#1565c0',
    lineHeight: 18,
  },
  footer: {
    padding: 16,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4CAF50',
    paddingVertical: 16,
    borderRadius: 12,
    gap: 8,
  },
  saveButtonDisabled: {
    backgroundColor: '#a5d6a7',
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    width: '92%',
    maxHeight: '80%',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  photoThumb: {
    width: '31%',
    aspectRatio: 1,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#f0f0f0',
    borderWidth: 2,
    borderColor: '#e0e0e0',
  },
  modalCancelBtn: {
    marginTop: 16,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#f5f5f5',
    alignItems: 'center',
  },
});

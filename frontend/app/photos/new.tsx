import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  TextInput,
  ScrollView,
  Alert,
  Platform,
  ActivityIndicator,
  KeyboardAvoidingView,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import PdfThumbnail from 'react-native-pdf-thumbnail';
import { PhotoService } from '../../services/LocalStorage';

interface SelectedPhoto {
  uri: string;
  description: string;
}

export default function NewPhotoScreen() {
  const router = useRouter();
  const { projectId } = useLocalSearchParams();
  const [selectedPhotos, setSelectedPhotos] = useState<SelectedPhoto[]>([]);
  const [loading, setLoading] = useState(false);
  const [savingProgress, setSavingProgress] = useState(0);

  const requestPermissions = async () => {
    if (Platform.OS !== 'web') {
      const { status: cameraStatus } = await ImagePicker.requestCameraPermissionsAsync();
      const { status: mediaStatus } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      
      if (cameraStatus !== 'granted' || mediaStatus !== 'granted') {
        Alert.alert(
          'Berechtigungen erforderlich',
          'Bitte erlauben Sie den Zugriff auf Kamera und Galerie'
        );
        return false;
      }
    }
    return true;
  };

  const pickImages = async () => {
    const hasPermission = await requestPermissions();
    if (!hasPermission) return;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      quality: 0.8,
      base64: true,
      selectionLimit: 20,
    });

    if (!result.canceled && result.assets.length > 0) {
      const newPhotos: SelectedPhoto[] = result.assets.map(asset => ({
        uri: `data:image/jpeg;base64,${asset.base64}`,
        description: '',
      }));
      setSelectedPhotos(prev => [...prev, ...newPhotos]);
    }
  };

  const takePhoto = async () => {
    const hasPermission = await requestPermissions();
    if (!hasPermission) return;

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: false,
      quality: 0.8,
      base64: true,
    });

    if (!result.canceled && result.assets[0]) {
      const base64Image = `data:image/jpeg;base64,${result.assets[0].base64}`;
      setSelectedPhotos(prev => [...prev, { uri: base64Image, description: '' }]);
    }
  };

  const removePhoto = (index: number) => {
    setSelectedPhotos(prev => prev.filter((_, i) => i !== index));
  };

  // Import from Files (including PDF conversion)
  const importFromFiles = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['image/*', 'application/pdf'],
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) {
        return;
      }

      const file = result.assets[0];
      const fileUri = file.uri;
      const mimeType = file.mimeType || '';
      
      console.log('[importFromFiles] Selected file:', file.name, mimeType);

      // Wenn es ein PDF ist, konvertiere es zu einem Bild
      if (mimeType === 'application/pdf' || file.name?.toLowerCase().endsWith('.pdf')) {
        try {
          console.log('[importFromFiles] Converting PDF to image...');
          const { uri } = await PdfThumbnail.generate(fileUri, 0);
          console.log('[importFromFiles] PDF converted successfully:', uri);
          
          // Konvertiere zu Base64
          const manipResult = await ImageManipulator.manipulateAsync(
            uri,
            [{ resize: { width: 1200 } }],
            { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG, base64: true }
          );
          
          if (manipResult.base64) {
            const base64Image = `data:image/jpeg;base64,${manipResult.base64}`;
            setSelectedPhotos(prev => [...prev, { uri: base64Image, description: file.name || 'PDF Import' }]);
          }
          return;
        } catch (pdfError) {
          console.error('[importFromFiles] PDF conversion error:', pdfError);
          Alert.alert(
            'PDF Import',
            'Das PDF konnte nicht automatisch konvertiert werden. Dies funktioniert nur in der TestFlight/App Store Version, nicht in Expo Go.\n\nAlternativ: Machen Sie einen Screenshot des PDFs.',
            [{ text: 'OK', style: 'default' }]
          );
          return;
        }
      }

      // Wenn es ein Bild ist, füge es direkt ein
      if (mimeType.startsWith('image/')) {
        const manipResult = await ImageManipulator.manipulateAsync(
          fileUri,
          [{ resize: { width: 1200 } }],
          { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG, base64: true }
        );
        
        if (manipResult.base64) {
          const base64Image = `data:image/jpeg;base64,${manipResult.base64}`;
          setSelectedPhotos(prev => [...prev, { uri: base64Image, description: '' }]);
        }
      } else {
        Alert.alert('Fehler', 'Dieser Dateityp wird nicht unterstützt. Bitte wählen Sie ein Bild (JPG, PNG, etc.) oder PDF.');
      }
    } catch (error) {
      console.error('Error importing from files:', error);
      Alert.alert('Fehler', 'Datei konnte nicht importiert werden');
    }
  };

  const updateDescription = (index: number, description: string) => {
    setSelectedPhotos(prev => prev.map((photo, i) => 
      i === index ? { ...photo, description } : photo
    ));
  };

  const handleSave = async () => {
    if (selectedPhotos.length === 0) {
      Alert.alert('Fehler', 'Bitte wählen Sie mindestens ein Foto aus');
      return;
    }

    setLoading(true);
    setSavingProgress(0);
    
    try {
      const projId = Array.isArray(projectId) ? projectId[0] : projectId;
      
      for (let i = 0; i < selectedPhotos.length; i++) {
        const photo = selectedPhotos[i];
        await PhotoService.create({
          project_id: projId || '',
          image_data: photo.uri,
          uri: photo.uri, // Für Kompatibilität
          description: photo.description || undefined,
        });
        setSavingProgress(i + 1);
      }

      router.back();
      
      setTimeout(() => {
        const message = selectedPhotos.length === 1 
          ? 'Foto wurde hinzugefügt' 
          : `${selectedPhotos.length} Fotos wurden hinzugefügt`;
        if (Platform.OS === 'web') {
          alert(message);
        } else {
          Alert.alert('Erfolg', message);
        }
      }, 300);
    } catch (error) {
      console.error('Error saving photos:', error);
      if (Platform.OS === 'web') {
        alert('Fehler: Fotos konnten nicht gespeichert werden');
      } else {
        Alert.alert('Fehler', 'Fotos konnten nicht gespeichert werden');
      }
    } finally {
      setLoading(false);
      setSavingProgress(0);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView style={styles.scrollView} keyboardShouldPersistTaps="handled">
        <View style={styles.content}>
          {/* Upload Buttons - immer sichtbar */}
          <View style={styles.uploadSection}>
            <TouchableOpacity style={styles.uploadButton} onPress={takePhoto}>
              <Ionicons name="camera" size={36} color="#1976d2" />
              <Text style={styles.uploadButtonText}>Foto aufnehmen</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.uploadButton} onPress={pickImages}>
              <Ionicons name="images" size={36} color="#1976d2" />
              <Text style={styles.uploadButtonText}>Aus Galerie wählen</Text>
              <Text style={styles.uploadButtonSubtext}>Mehrfachauswahl möglich</Text>
            </TouchableOpacity>
          </View>
          
          {/* Aus Dateien Button */}
          <TouchableOpacity style={styles.filesButton} onPress={importFromFiles}>
            <Ionicons name="document" size={24} color="#FF5722" />
            <View style={styles.filesButtonText}>
              <Text style={styles.filesButtonTitle}>Aus Dateien importieren</Text>
              <Text style={styles.filesButtonSubtitle}>Bilder oder PDF (wird als Bild gespeichert)</Text>
            </View>
          </TouchableOpacity>

          {/* Ausgewählte Fotos */}
          {selectedPhotos.length > 0 && (
            <View style={styles.selectedSection}>
              <Text style={styles.sectionTitle}>
                {selectedPhotos.length} {selectedPhotos.length === 1 ? 'Foto' : 'Fotos'} ausgewählt
              </Text>
              
              {selectedPhotos.map((photo, index) => (
                <View key={index} style={styles.photoCard}>
                  <View style={styles.photoHeader}>
                    <Image source={{ uri: photo.uri }} style={styles.thumbnail} />
                    <View style={styles.photoInfo}>
                      <Text style={styles.photoNumber}>Foto {index + 1}</Text>
                      <TextInput
                        style={styles.descriptionInput}
                        placeholder="Beschreibung (optional)"
                        value={photo.description}
                        onChangeText={(text) => updateDescription(index, text)}
                        multiline
                      />
                  </View>
                  <TouchableOpacity 
                    style={styles.removeButton}
                    onPress={() => removePhoto(index)}
                  >
                    <Ionicons name="close-circle" size={28} color="#f44336" />
                  </TouchableOpacity>
                </View>
              </View>
            ))}

            {/* Speichern Button */}
            <TouchableOpacity
              style={[styles.saveButton, loading && styles.buttonDisabled]}
              onPress={handleSave}
              disabled={loading}
            >
              {loading ? (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator size="small" color="#fff" />
                  <Text style={styles.saveButtonText}>
                    Speichern... ({savingProgress}/{selectedPhotos.length})
                  </Text>
                </View>
              ) : (
                <Text style={styles.saveButtonText}>
                  {selectedPhotos.length === 1 ? 'Foto speichern' : `${selectedPhotos.length} Fotos speichern`}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 100,
  },
  uploadSection: {
    flexDirection: 'row',
    gap: 12,
  },
  uploadButton: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#1976d2',
    borderStyle: 'dashed',
  },
  uploadButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1976d2',
    marginTop: 8,
    textAlign: 'center',
  },
  uploadButtonSubtext: {
    fontSize: 11,
    color: '#666',
    marginTop: 4,
  },
  selectedSection: {
    marginTop: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#333',
    marginBottom: 12,
  },
  photoCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  photoHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  thumbnail: {
    width: 80,
    height: 80,
    borderRadius: 8,
    backgroundColor: '#f0f0f0',
  },
  photoInfo: {
    flex: 1,
    marginLeft: 12,
  },
  photoNumber: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1976d2',
    marginBottom: 6,
  },
  descriptionInput: {
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    padding: 10,
    fontSize: 14,
    minHeight: 50,
    textAlignVertical: 'top',
  },
  removeButton: {
    padding: 4,
  },
  saveButton: {
    backgroundColor: '#4caf50',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: {
    backgroundColor: '#ccc',
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  // Dateien Button Styles
  filesButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    marginTop: 16,
    borderWidth: 1,
    borderColor: '#FF5722',
    borderStyle: 'dashed',
    gap: 12,
  },
  filesButtonText: {
    flex: 1,
  },
  filesButtonTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FF5722',
  },
  filesButtonSubtitle: {
    fontSize: 12,
    color: '#999',
    marginTop: 2,
  },
});

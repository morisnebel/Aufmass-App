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
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function NewSketchScreen() {
  const router = useRouter();
  const { projectId } = useLocalSearchParams();
  const [loading, setLoading] = useState(false);

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
              <Ionicons name="document-outline" size={48} color="#1976d2" />
            </View>
            <Text style={styles.optionTitle}>Leere Skizze</Text>
            <Text style={styles.optionDescription}>
              Beginnen Sie mit einer leeren Zeichenfläche
            </Text>
          </TouchableOpacity>

          {/* Option 2: Take Photo */}
          <TouchableOpacity style={styles.optionButton} onPress={handleTakePhoto}>
            <View style={[styles.iconContainer, { backgroundColor: '#e8f5e9' }]}>
              <Ionicons name="camera" size={48} color="#4caf50" />
            </View>
            <Text style={styles.optionTitle}>Foto aufnehmen</Text>
            <Text style={styles.optionDescription}>
              Fotografieren Sie ein Objekt und zeichnen Sie darauf
            </Text>
          </TouchableOpacity>

          {/* Option 3: Pick from Gallery */}
          <TouchableOpacity style={styles.optionButton} onPress={handlePickFromGallery}>
            <View style={[styles.iconContainer, { backgroundColor: '#fff3e0' }]}>
              <Ionicons name="images" size={48} color="#ff9800" />
            </View>
            <Text style={styles.optionTitle}>Aus Galerie wählen</Text>
            <Text style={styles.optionDescription}>
              Wählen Sie ein vorhandenes Bild als Hintergrund
            </Text>
          </TouchableOpacity>
        </View>
      </View>
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
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 24,
  },
  optionsContainer: {
    gap: 16,
  },
  optionButton: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  optionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  optionDescription: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
  },
});

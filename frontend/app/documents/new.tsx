import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { DocumentService } from '../../services/LocalStorage';

export default function NewDocumentScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const projectId = Array.isArray(params.projectId) ? params.projectId[0] : params.projectId;
  const [loading, setLoading] = useState(false);
  const [loadingText, setLoadingText] = useState('');

  const pickDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/pdf',
        copyToCacheDirectory: true,
      });

      if (result.canceled) {
        return;
      }

      const file = result.assets[0];
      if (!file) {
        Alert.alert('Fehler', 'Keine Datei ausgewählt');
        return;
      }

      setLoading(true);
      setLoadingText('PDF wird geladen...');

      // Read the PDF file as base64
      const pdfBase64 = await FileSystem.readAsStringAsync(file.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      setLoadingText('Dokument wird erstellt...');

      // Create document with the PDF data
      // Note: For now, we store the first page as a placeholder
      // The actual PDF rendering will happen in the viewer
      const document = await DocumentService.create({
        project_id: projectId || '',
        name: file.name || 'Dokument.pdf',
        originalPdfData: `data:application/pdf;base64,${pdfBase64}`,
        pages: [], // Pages will be rendered in the viewer
      });

      Alert.alert('Erfolg', 'Dokument wurde hinzugefügt', [
        {
          text: 'OK',
          onPress: () => router.replace({
            pathname: '/documents/view',
            params: { documentId: document.id, projectId },
          }),
        },
      ]);
    } catch (error) {
      console.error('Error picking document:', error);
      Alert.alert('Fehler', 'Dokument konnte nicht geladen werden');
    } finally {
      setLoading(false);
      setLoadingText('');
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#1976d2" />
        <Text style={styles.loadingText}>{loadingText}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#1976d2" />
        </TouchableOpacity>
        <Text style={styles.title}>Dokument hinzufügen</Text>
      </View>

      <View style={styles.content}>
        <TouchableOpacity style={styles.pickButton} onPress={pickDocument}>
          <Ionicons name="document-text" size={64} color="#1976d2" />
          <Text style={styles.pickButtonTitle}>PDF auswählen</Text>
          <Text style={styles.pickButtonSubtitle}>
            Wählen Sie ein PDF-Dokument aus der Dateien-App
          </Text>
        </TouchableOpacity>

        <View style={styles.infoBox}>
          <Ionicons name="information-circle" size={24} color="#1976d2" />
          <Text style={styles.infoText}>
            Hier können Sie Angebote, Verträge oder andere PDF-Dokumente hinzufügen 
            und mit dem Apple Pencil Anmerkungen machen.
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  backButton: {
    marginRight: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
  },
  content: {
    flex: 1,
    padding: 20,
    justifyContent: 'center',
  },
  pickButton: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 40,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#1976d2',
    borderStyle: 'dashed',
    marginBottom: 24,
  },
  pickButtonTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1976d2',
    marginTop: 16,
  },
  pickButtonSubtitle: {
    fontSize: 14,
    color: '#666',
    marginTop: 8,
    textAlign: 'center',
  },
  infoBox: {
    backgroundColor: '#e3f2fd',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    color: '#1565c0',
    lineHeight: 20,
  },
});

import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Alert,
  Dimensions,
  ScrollView,
  Platform,
  TextInput,
  KeyboardAvoidingView,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Path } from 'react-native-svg';
import { captureRef } from 'react-native-view-shot';
import axios from 'axios';
import Constants from 'expo-constants';
import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';
import { File, Paths } from 'expo-file-system/next';

const API_URL = Constants.expoConfig?.extra?.EXPO_PUBLIC_BACKEND_URL || process.env.EXPO_PUBLIC_BACKEND_URL;
const { width } = Dimensions.get('window');

interface DrawPath {
  path: string;
  color: string;
  strokeWidth: number;
}

// PDF-Größen Optionen
const PDF_SIZES = [
  { value: 'small', label: 'Klein', icon: 'grid-outline', description: '3 pro Zeile' },
  { value: 'medium', label: 'Mittel', icon: 'apps-outline', description: '2 pro Zeile' },
  { value: 'large', label: 'Groß', icon: 'square-outline', description: '1 pro Zeile' },
  { value: 'full', label: 'Voll', icon: 'expand-outline', description: 'Volle Breite' },
];

export default function AnnotatePhotoScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const photoId = Array.isArray(params.photoId) ? params.photoId[0] : params.photoId;
  const projectId = Array.isArray(params.projectId) ? params.projectId[0] : params.projectId;
  const canvasRef = useRef(null);
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [paths, setPaths] = useState<DrawPath[]>([]);
  const [currentPath, setCurrentPath] = useState<string>('');
  const [drawColor, setDrawColor] = useState('#FF0000');
  const [strokeWidth, setStrokeWidth] = useState(3);
  const [loading, setLoading] = useState(true);
  const [canvasDimensions, setCanvasDimensions] = useState({ width: 0, height: 0 });
  const [pdfSize, setPdfSize] = useState<string>('medium');
  const [description, setDescription] = useState<string>('');

  useEffect(() => {
    loadPhoto();
  }, [photoId]);

  const loadPhoto = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/photos/project/${projectId}`);
      const photo = response.data.find((p: any) => p.id === photoId);
      if (photo) {
        setImageUri(photo.image_data);
        setPdfSize(photo.pdf_size || 'medium');
        setDescription(photo.description || '');
        
        // Load existing annotations if available
        if (photo.annotations) {
          try {
            const annotationData = JSON.parse(photo.annotations);
            if (annotationData.paths && Array.isArray(annotationData.paths)) {
              setPaths(annotationData.paths);
            }
          } catch (e) {
            console.error('Error parsing annotations:', e);
          }
        }
      }
    } catch (error) {
      console.error('Error loading photo:', error);
      Alert.alert('Fehler', 'Foto konnte nicht geladen werden');
    } finally {
      setLoading(false);
    }
  };

  const onTouchStart = (event: any) => {
    const touch = event.nativeEvent.touches ? event.nativeEvent.touches[0] : event.nativeEvent;
    const locationX = touch.locationX || touch.pageX;
    const locationY = touch.locationY || touch.pageY;
    setCurrentPath(`M ${locationX} ${locationY}`);
  };

  const onTouchMove = (event: any) => {
    if (!currentPath) return;
    const touch = event.nativeEvent.touches ? event.nativeEvent.touches[0] : event.nativeEvent;
    const locationX = touch.locationX || touch.pageX;
    const locationY = touch.locationY || touch.pageY;
    setCurrentPath((prev) => `${prev} L ${locationX} ${locationY}`);
  };

  const onTouchEnd = () => {
    if (currentPath && currentPath.length > 0) {
      setPaths([...paths, { path: currentPath, color: drawColor, strokeWidth }]);
      setCurrentPath('');
    }
  };

  const undo = () => {
    if (paths.length > 0) {
      setPaths(paths.slice(0, -1));
    }
  };

  const clear = () => {
    Alert.alert(
      'Alle löschen',
      'Möchten Sie alle Zeichnungen löschen?',
      [
        { text: 'Abbrechen', style: 'cancel' },
        { text: 'Löschen', onPress: () => setPaths([]) },
      ]
    );
  };

  const save = async () => {
    try {
      setLoading(true);
      
      // Create annotation data with actual canvas dimensions for proper scaling in PDF
      const annotationData = {
        paths: paths,
        canvasWidth: canvasDimensions.width || width, // Use measured dimensions
        canvasHeight: canvasDimensions.height || 400, // Fallback to reasonable default
      };

      // Update photo with annotations and PDF size
      await axios.put(`${API_URL}/api/photos/${photoId}`, {
        project_id: projectId,
        image_data: imageUri, // Keep original image
        annotations: JSON.stringify(annotationData),
        description: description,
        pdf_size: pdfSize,
      });

      Alert.alert('Erfolg', 'Foto wurde gespeichert', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (error) {
      console.error('Error saving annotated photo:', error);
      Alert.alert('Fehler', 'Foto konnte nicht gespeichert werden');
    } finally {
      setLoading(false);
    }
  };

  // Foto in der Galerie speichern über Share
  const saveToGallery = async () => {
    try {
      setLoading(true);

      // Wenn Annotationen vorhanden sind, Screenshot des Canvas machen
      let fileUri: string;
      
      if (paths.length > 0 && canvasRef.current) {
        try {
          fileUri = await captureRef(canvasRef, {
            format: 'png',
            quality: 1,
          });
        } catch (captureError) {
          console.error('Error capturing canvas:', captureError);
          // Fallback: Originalbild verwenden
          fileUri = await saveBase64ToFile();
        }
      } else {
        // Keine Annotationen, Originalbild verwenden
        fileUri = await saveBase64ToFile();
      }

      // Nutze die native Share-Funktion - dort kann man "Bild sichern" wählen
      const canShare = await Sharing.isAvailableAsync();
      if (canShare && fileUri) {
        await Sharing.shareAsync(fileUri, {
          mimeType: 'image/jpeg',
          dialogTitle: 'Foto speichern oder teilen',
          UTI: 'public.jpeg',
        });
      } else {
        Alert.alert('Fehler', 'Teilen ist auf diesem Gerät nicht verfügbar');
      }
    } catch (error) {
      console.error('Error saving to gallery:', error);
      Alert.alert('Fehler', 'Foto konnte nicht gespeichert werden: ' + (error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  // Hilfsfunktion: Base64 in temporäre Datei speichern
  const saveBase64ToFile = async (): Promise<string> => {
    if (!imageUri) throw new Error('Kein Bild vorhanden');
    
    const base64Data = imageUri.includes(',') 
      ? imageUri.split(',')[1] 
      : imageUri;
    
    const filename = `aufmass_foto_${Date.now()}.jpg`;
    const file = new File(Paths.cache, filename);
    
    // Konvertiere Base64 zu Uint8Array
    const binaryString = atob(base64Data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    
    // Schreibe die Datei mit der neuen API
    await file.write(bytes);
    
    return file.uri;
  };

  const colors = [
    { color: '#FF0000', name: 'Rot' },
    { color: '#00FF00', name: 'Grün' },
    { color: '#0000FF', name: 'Blau' },
    { color: '#FFFF00', name: 'Gelb' },
    { color: '#FFFFFF', name: 'Weiß' },
    { color: '#000000', name: 'Schwarz' },
  ];

  if (loading || !imageUri) {
    return (
      <View style={styles.centerContainer}>
        <Text>Lade Foto...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.toolbar}>
        <TouchableOpacity style={styles.toolButton} onPress={undo}>
          <Ionicons name="arrow-undo" size={24} color="#1976d2" />
          <Text style={styles.toolText}>Rückgängig</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.toolButton} onPress={clear}>
          <Ionicons name="trash-outline" size={24} color="#f44336" />
          <Text style={styles.toolText}>Löschen</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.toolButton} onPress={saveToGallery}>
          <Ionicons name="download-outline" size={24} color="#9c27b0" />
          <Text style={styles.toolText}>In Galerie</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.toolButton, styles.deletePhotoButton]} 
          onPress={() => {
            Alert.alert(
              'Foto löschen',
              'Möchten Sie dieses Foto komplett löschen?',
              [
                { text: 'Abbrechen', style: 'cancel' },
                {
                  text: 'Löschen',
                  style: 'destructive',
                  onPress: async () => {
                    try {
                      await axios.delete(`${API_URL}/api/photos/${photoId}`);
                      Alert.alert('Erfolg', 'Foto wurde gelöscht', [
                        { text: 'OK', onPress: () => router.back() },
                      ]);
                    } catch (error) {
                      console.error('Error deleting photo:', error);
                      Alert.alert('Fehler', 'Foto konnte nicht gelöscht werden');
                    }
                  },
                },
              ]
            );
          }}
        >
          <Ionicons name="trash" size={24} color="#fff" />
          <Text style={[styles.toolText, { color: '#fff' }]}>Foto löschen</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.toolButton} onPress={save}>
          <Ionicons name="checkmark-circle" size={24} color="#4caf50" />
          <Text style={styles.toolText}>Speichern</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.colorPicker}>
        {colors.map((c) => (
          <TouchableOpacity
            key={c.color}
            style={[
              styles.colorButton,
              { backgroundColor: c.color },
              drawColor === c.color && styles.colorButtonActive,
            ]}
            onPress={() => setDrawColor(c.color)}
          />
        ))}
      </View>

      {/* PDF-Größen Auswahl */}
      <View style={styles.pdfSizeContainer}>
        <Text style={styles.pdfSizeLabel}>PDF-Größe:</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pdfSizeScroll}>
          {PDF_SIZES.map((size) => (
            <TouchableOpacity
              key={size.value}
              style={[
                styles.pdfSizeButton,
                pdfSize === size.value && styles.pdfSizeButtonActive,
              ]}
              onPress={() => setPdfSize(size.value)}
            >
              <Ionicons 
                name={size.icon as any} 
                size={20} 
                color={pdfSize === size.value ? '#fff' : '#1976d2'} 
              />
              <Text style={[
                styles.pdfSizeText,
                pdfSize === size.value && styles.pdfSizeTextActive,
              ]}>
                {size.label}
              </Text>
              <Text style={[
                styles.pdfSizeDesc,
                pdfSize === size.value && styles.pdfSizeDescActive,
              ]}>
                {size.description}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <View 
        style={styles.canvasContainer} 
        ref={canvasRef}
        onLayout={(event) => {
          const { width, height } = event.nativeEvent.layout;
          setCanvasDimensions({ width, height });
        }}
      >
        <Image source={{ uri: imageUri }} style={styles.backgroundImage} resizeMode="contain" />
        <View
          style={styles.svgContainer}
          onStartShouldSetResponder={() => true}
          onMoveShouldSetResponder={() => true}
          onResponderGrant={onTouchStart}
          onResponderMove={onTouchMove}
          onResponderRelease={onTouchEnd}
        >
          <Svg height="100%" width="100%" style={{ position: 'absolute' }}>
            {paths.map((p, index) => (
              <Path
                key={index}
                d={p.path}
                stroke={p.color}
                strokeWidth={p.strokeWidth}
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ))}
            {currentPath && currentPath.length > 0 && (
              <Path
                d={currentPath}
                stroke={drawColor}
                strokeWidth={strokeWidth}
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}
          </Svg>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  toolbar: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    padding: 8,
    gap: 8,
  },
  toolButton: {
    flex: 1,
    alignItems: 'center',
    padding: 8,
    borderRadius: 8,
    backgroundColor: '#f5f5f5',
  },
  toolText: {
    fontSize: 12,
    color: '#333',
    marginTop: 4,
  },
  deletePhotoButton: {
    backgroundColor: '#f44336',
  },
  colorPicker: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    padding: 8,
    gap: 8,
    justifyContent: 'center',
  },
  colorButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: '#ddd',
  },
  colorButtonActive: {
    borderWidth: 4,
    borderColor: '#1976d2',
  },
  // PDF-Größen Auswahl Styles
  pdfSizeContainer: {
    backgroundColor: '#fff',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  pdfSizeLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
    marginBottom: 6,
  },
  pdfSizeScroll: {
    flexGrow: 0,
  },
  pdfSizeButton: {
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#f0f0f0',
    marginRight: 8,
    minWidth: 80,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  pdfSizeButtonActive: {
    backgroundColor: '#1976d2',
    borderColor: '#1565c0',
  },
  pdfSizeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1976d2',
    marginTop: 4,
  },
  pdfSizeTextActive: {
    color: '#fff',
  },
  pdfSizeDesc: {
    fontSize: 10,
    color: '#888',
    marginTop: 2,
  },
  pdfSizeDescActive: {
    color: '#e3f2fd',
  },
  canvasContainer: {
    flex: 1,
    position: 'relative',
  },
  backgroundImage: {
    width: '100%',
    height: '100%',
    position: 'absolute',
  },
  svgContainer: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  canvas: {
    flex: 1,
  },
});

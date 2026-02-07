import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Alert,
  Dimensions,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Path } from 'react-native-svg';
import { captureRef } from 'react-native-view-shot';
import axios from 'axios';
import Constants from 'expo-constants';

const API_URL = Constants.expoConfig?.extra?.EXPO_PUBLIC_BACKEND_URL || process.env.EXPO_PUBLIC_BACKEND_URL;
const { width } = Dimensions.get('window');

interface DrawPath {
  path: string;
  color: string;
  strokeWidth: number;
}

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

  useEffect(() => {
    loadPhoto();
  }, [photoId]);

  const loadPhoto = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/photos/project/${projectId}`);
      const photo = response.data.find((p: any) => p.id === photoId);
      if (photo) {
        setImageUri(photo.image_data);
        
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
      
      // Create annotation data with canvas dimensions for proper scaling in PDF
      const annotationData = {
        paths: paths,
        canvasWidth: width - 32, // Account for container padding
        canvasHeight: 400, // Fixed canvas height from styles
      };

      // Update photo with annotations (using PUT to keep the same ID)
      await axios.put(`${API_URL}/api/photos/${photoId}`, {
        project_id: projectId,
        image_data: imageUri, // Keep original image
        annotations: JSON.stringify(annotationData),
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

      <View style={styles.canvasContainer} ref={canvasRef}>
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

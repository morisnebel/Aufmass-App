import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  TextInput,
  Dimensions,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Canvas, Path, Skia } from '@shopify/react-native-skia';
import { captureRef } from 'react-native-view-shot';
import axios from 'axios';
import Constants from 'expo-constants';

const API_URL = Constants.expoConfig?.extra?.EXPO_PUBLIC_BACKEND_URL || process.env.EXPO_PUBLIC_BACKEND_URL;
const { width, height } = Dimensions.get('window');

interface DrawPath {
  path: string;
  color: string;
  strokeWidth: number;
}

export default function DrawSketchScreen() {
  const router = useRouter();
  const { projectId } = useLocalSearchParams();
  const canvasRef = useRef(null);
  const [title, setTitle] = useState('');
  const [paths, setPaths] = useState<DrawPath[]>([]);
  const [currentPath, setCurrentPath] = useState<string | null>(null);
  const [drawColor, setDrawColor] = useState('#000000');
  const [strokeWidth, setStrokeWidth] = useState(3);
  const [loading, setLoading] = useState(false);
  const [showTitleInput, setShowTitleInput] = useState(false);

  const onTouchStart = (event: any) => {
    const { locationX, locationY } = event.nativeEvent;
    const path = Skia.Path.Make();
    path.moveTo(locationX, locationY);
    setCurrentPath(path.toSVGString());
  };

  const onTouchMove = (event: any) => {
    if (!currentPath) return;
    const { locationX, locationY } = event.nativeEvent;
    const path = Skia.Path.MakeFromSVGString(currentPath);
    if (path) {
      path.lineTo(locationX, locationY);
      setCurrentPath(path.toSVGString());
    }
  };

  const onTouchEnd = () => {
    if (currentPath) {
      setPaths([...paths, { path: currentPath, color: drawColor, strokeWidth }]);
      setCurrentPath(null);
    }
  };

  const undo = () => {
    if (paths.length > 0) {
      setPaths(paths.slice(0, -1));
    }
  };

  const clear = () => {
    Alert.alert(
      'Alles löschen',
      'Möchten Sie die gesamte Zeichnung löschen?',
      [
        { text: 'Abbrechen', style: 'cancel' },
        { text: 'Löschen', onPress: () => setPaths([]) },
      ]
    );
  };

  const save = async () => {
    if (paths.length === 0) {
      Alert.alert('Fehler', 'Bitte zeichnen Sie etwas');
      return;
    }

    setLoading(true);
    try {
      // Capture the sketch
      const uri = await captureRef(canvasRef, {
        format: 'png',
        quality: 0.8,
        result: 'base64',
      });

      const base64Image = `data:image/png;base64,${uri}`;

      await axios.post(`${API_URL}/api/sketches`, {
        project_id: projectId,
        sketch_data: base64Image,
        title: title || undefined,
      });

      Alert.alert('Erfolg', 'Skizze wurde gespeichert', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (error) {
      console.error('Error saving sketch:', error);
      Alert.alert('Fehler', 'Skizze konnte nicht gespeichert werden');
    } finally {
      setLoading(false);
    }
  };

  const toggleStrokeWidth = () => {
    setStrokeWidth(strokeWidth === 3 ? 6 : strokeWidth === 6 ? 10 : 3);
  };

  const colors = [
    { color: '#000000', name: 'Schwarz' },
    { color: '#FF0000', name: 'Rot' },
    { color: '#00FF00', name: 'Grün' },
    { color: '#0000FF', name: 'Blau' },
    { color: '#FFFF00', name: 'Gelb' },
    { color: '#FF8800', name: 'Orange' },
  ];

  return (
    <View style={styles.container}>
      <View style={styles.toolbar}>
        <TouchableOpacity style={styles.toolButton} onPress={undo}>
          <Ionicons name="arrow-undo" size={24} color="#1976d2" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.toolButton} onPress={toggleStrokeWidth}>
          <View style={[styles.strokePreview, { width: strokeWidth * 3, height: strokeWidth * 3 }]} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.toolButton} onPress={clear}>
          <Ionicons name="trash-outline" size={24} color="#f44336" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.toolButton} onPress={() => setShowTitleInput(!showTitleInput)}>
          <Ionicons name="text" size={24} color="#1976d2" />
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.toolButton, styles.saveButton]} 
          onPress={save}
          disabled={loading}
        >
          <Ionicons name="checkmark-circle" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      {showTitleInput && (
        <View style={styles.titleInput}>
          <TextInput
            style={styles.input}
            placeholder="Titel der Skizze..."
            value={title}
            onChangeText={setTitle}
          />
        </View>
      )}

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
        <Canvas
          style={styles.canvas}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        >
          {paths.map((p, index) => {
            const path = Skia.Path.MakeFromSVGString(p.path);
            return path ? (
              <Path
                key={index}
                path={path}
                color={p.color}
                style="stroke"
                strokeWidth={p.strokeWidth}
              />
            ) : null;
          })}
          {currentPath && (() => {
            const path = Skia.Path.MakeFromSVGString(currentPath);
            return path ? (
              <Path
                path={path}
                color={drawColor}
                style="stroke"
                strokeWidth={strokeWidth}
              />
            ) : null;
          })()}
        </Canvas>
      </View>

      <View style={styles.hint}>
        <Text style={styles.hintText}>
          Zeichnen Sie hier Ihren Grundriss oder Skizze
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  toolbar: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    padding: 8,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  toolButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    borderRadius: 8,
    backgroundColor: '#f5f5f5',
  },
  saveButton: {
    backgroundColor: '#4caf50',
  },
  strokePreview: {
    backgroundColor: '#333',
    borderRadius: 10,
  },
  titleInput: {
    backgroundColor: '#fff',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  input: {
    fontSize: 16,
    padding: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
  },
  colorPicker: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    padding: 8,
    gap: 8,
    justifyContent: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
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
    backgroundColor: '#fff',
  },
  canvas: {
    flex: 1,
  },
  hint: {
    padding: 12,
    backgroundColor: '#e3f2fd',
    alignItems: 'center',
  },
  hintText: {
    fontSize: 14,
    color: '#1976d2',
  },
});

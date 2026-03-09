import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Alert,
  Dimensions,
  ScrollView,
  PanResponder,
} from 'react-native';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Path, G, Circle } from 'react-native-svg';
import { captureRef } from 'react-native-view-shot';
import { PhotoService } from '../../services/LocalStorage';
import * as Sharing from 'expo-sharing';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Types
interface DrawPath {
  path: string;
  color: string;
  strokeWidth: number;
  bounds?: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  };
}

// PDF Size Options
const PDF_SIZES = [
  { value: 'small', label: 'Klein', icon: 'apps-outline' },
  { value: 'medium', label: 'Mittel', icon: 'grid-outline' },
  { value: 'large', label: 'Groß', icon: 'square-outline' },
];

// Colors
const COLORS = [
  { color: '#FF0000', name: 'Rot' },
  { color: '#00FF00', name: 'Grün' },
  { color: '#0000FF', name: 'Blau' },
  { color: '#FFFF00', name: 'Gelb' },
  { color: '#FFFFFF', name: 'Weiß' },
  { color: '#000000', name: 'Schwarz' },
];

// Stroke widths
const STROKE_WIDTHS = [2, 4, 6, 8];

export default function AnnotatePhotoScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const photoId = Array.isArray(params.photoId) ? params.photoId[0] : params.photoId;
  const projectId = Array.isArray(params.projectId) ? params.projectId[0] : params.projectId;
  
  const canvasRef = useRef<View>(null);
  
  // State
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [paths, setPaths] = useState<DrawPath[]>([]);
  const [currentPath, setCurrentPath] = useState<string>('');
  const [drawColor, setDrawColor] = useState('#FF0000');
  const [strokeWidth, setStrokeWidth] = useState(4);
  const [pdfSize, setPdfSize] = useState<string>('medium');
  const [description, setDescription] = useState<string>('');
  const [canvasDimensions, setCanvasDimensions] = useState({ width: 0, height: 0 });
  
  // Mode
  const [drawingEnabled, setDrawingEnabled] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [selectedPathIndex, setSelectedPathIndex] = useState<number | null>(null);
  
  // Track changes
  const [hasChanges, setHasChanges] = useState(false);
  const initialPathsRef = useRef<string>('');

  // Load photo on mount
  useEffect(() => {
    loadPhoto();
  }, [photoId]);

  // Track changes
  useEffect(() => {
    const currentPathsStr = JSON.stringify(paths);
    if (initialPathsRef.current && currentPathsStr !== initialPathsRef.current) {
      setHasChanges(true);
    }
  }, [paths, pdfSize, description]);

  // Auto-save on exit
  useFocusEffect(
    useCallback(() => {
      return () => {
        if (hasChanges && imageUri) {
          autoSave();
        }
      };
    }, [hasChanges, imageUri, paths, pdfSize, description, canvasDimensions])
  );

  const autoSave = async () => {
    try {
      const annotationData = {
        paths: paths,
        canvasWidth: canvasDimensions.width || SCREEN_WIDTH,
        canvasHeight: canvasDimensions.height || 400,
      };
      await PhotoService.update(photoId || '', {
        project_id: projectId,
        image_data: imageUri,
        annotations: JSON.stringify(annotationData),
        description: description,
        pdf_size: pdfSize,
      });
      console.log('Auto-saved annotations');
    } catch (error) {
      console.error('Auto-save error:', error);
    }
  };

  const loadPhoto = async () => {
    try {
      const photos = await PhotoService.getByProjectId(projectId || '');
      const photo = photos.find((p: any) => p.id === photoId);
      if (photo) {
        setImageUri(photo.image_data);
        setPdfSize(photo.pdf_size || 'medium');
        setDescription(photo.description || '');
        
        if (photo.annotations) {
          try {
            const annotationData = JSON.parse(photo.annotations);
            if (annotationData.paths && Array.isArray(annotationData.paths)) {
              setPaths(annotationData.paths);
              initialPathsRef.current = JSON.stringify(annotationData.paths);
            }
          } catch (e) {
            console.error('Error parsing annotations:', e);
          }
        } else {
          initialPathsRef.current = '[]';
        }
      }
    } catch (error) {
      console.error('Error loading photo:', error);
      Alert.alert('Fehler', 'Foto konnte nicht geladen werden');
    } finally {
      setLoading(false);
    }
  };

  // Calculate bounds for a path
  const calculateBounds = (pathString: string) => {
    const coords: { x: number; y: number }[] = [];
    const parts = pathString.split(/[ML]\s*/);
    parts.forEach(part => {
      const trimmed = part.trim();
      if (trimmed) {
        const [x, y] = trimmed.split(/\s+/).map(Number);
        if (!isNaN(x) && !isNaN(y)) {
          coords.push({ x, y });
        }
      }
    });
    if (coords.length === 0) return undefined;
    const xs = coords.map(c => c.x);
    const ys = coords.map(c => c.y);
    return {
      minX: Math.min(...xs),
      minY: Math.min(...ys),
      maxX: Math.max(...xs),
      maxY: Math.max(...ys),
    };
  };

  // Find path at touch point
  const findPathAtPoint = (x: number, y: number): number | null => {
    const threshold = 30;
    for (let i = paths.length - 1; i >= 0; i--) {
      const path = paths[i];
      if (path.bounds) {
        const { minX, minY, maxX, maxY } = path.bounds;
        if (x >= minX - threshold && x <= maxX + threshold &&
            y >= minY - threshold && y <= maxY + threshold) {
          return i;
        }
      }
    }
    return null;
  };

  // PanResponder for drawing
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => drawingEnabled || editMode,
      onMoveShouldSetPanResponder: () => drawingEnabled || editMode,
      onPanResponderGrant: (evt) => {
        const { locationX, locationY } = evt.nativeEvent;
        
        if (editMode) {
          const pathIndex = findPathAtPoint(locationX, locationY);
          setSelectedPathIndex(pathIndex);
        } else if (drawingEnabled) {
          setCurrentPath(`M ${locationX} ${locationY}`);
        }
      },
      onPanResponderMove: (evt) => {
        const { locationX, locationY } = evt.nativeEvent;
        
        if (drawingEnabled && currentPath) {
          setCurrentPath(prev => `${prev} L ${locationX} ${locationY}`);
        }
      },
      onPanResponderRelease: () => {
        if (drawingEnabled && currentPath) {
          const bounds = calculateBounds(currentPath);
          const newPath: DrawPath = {
            path: currentPath,
            color: drawColor,
            strokeWidth: strokeWidth,
            bounds,
          };
          setPaths(prev => [...prev, newPath]);
          setCurrentPath('');
          setHasChanges(true);
        }
      },
    })
  ).current;

  // Update panResponder when mode changes
  useEffect(() => {
    panResponder.panHandlers.onStartShouldSetPanResponder = () => drawingEnabled || editMode;
    panResponder.panHandlers.onMoveShouldSetPanResponder = () => drawingEnabled || editMode;
  }, [drawingEnabled, editMode]);

  const undo = () => {
    if (paths.length > 0) {
      setPaths(paths.slice(0, -1));
      setHasChanges(true);
    }
  };

  const deleteSelected = () => {
    if (selectedPathIndex !== null) {
      setPaths(paths.filter((_, i) => i !== selectedPathIndex));
      setSelectedPathIndex(null);
      setHasChanges(true);
    }
  };

  const clearAll = () => {
    Alert.alert('Alle löschen', 'Alle Zeichnungen löschen?', [
      { text: 'Abbrechen', style: 'cancel' },
      { text: 'Löschen', onPress: () => { setPaths([]); setHasChanges(true); } },
    ]);
  };

  const save = async () => {
    try {
      setLoading(true);
      const annotationData = {
        paths: paths,
        canvasWidth: canvasDimensions.width || SCREEN_WIDTH,
        canvasHeight: canvasDimensions.height || 400,
      };
      await PhotoService.update(photoId || '', {
        project_id: projectId,
        image_data: imageUri,
        annotations: JSON.stringify(annotationData),
        description: description,
        pdf_size: pdfSize,
      });
      Alert.alert('Erfolg', 'Foto wurde gespeichert', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (error) {
      console.error('Save error:', error);
      Alert.alert('Fehler', 'Speichern fehlgeschlagen');
    } finally {
      setLoading(false);
    }
  };

  const saveToGallery = async () => {
    try {
      setLoading(true);
      let fileUri: string | null = null;
      
      if (paths.length > 0 && canvasRef.current) {
        fileUri = await captureRef(canvasRef, { format: 'png', quality: 1 });
      }
      
      const canShare = await Sharing.isAvailableAsync();
      if (canShare && (fileUri || imageUri)) {
        await Sharing.shareAsync(fileUri || imageUri!, {
          mimeType: 'image/png',
          dialogTitle: 'Foto speichern',
        });
      } else {
        Alert.alert('Fehler', 'Teilen nicht verfügbar');
      }
    } catch (error) {
      console.error('Gallery save error:', error);
      Alert.alert('Fehler', 'Speichern fehlgeschlagen');
    } finally {
      setLoading(false);
    }
  };

  const toggleDrawingMode = () => {
    setDrawingEnabled(!drawingEnabled);
    setEditMode(false);
    setSelectedPathIndex(null);
  };

  const toggleEditMode = () => {
    setEditMode(!editMode);
    setDrawingEnabled(false);
    setSelectedPathIndex(null);
  };

  if (loading || !imageUri) {
    return (
      <View style={styles.centerContainer}>
        <Text>Lade Foto...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Toolbar */}
      <View style={styles.toolbar}>
        {/* PDF Size */}
        <View style={styles.toolGroup}>
          {PDF_SIZES.map((size) => (
            <TouchableOpacity
              key={size.value}
              style={[styles.toolBtn, pdfSize === size.value && styles.toolBtnActive]}
              onPress={() => { setPdfSize(size.value); setHasChanges(true); }}
            >
              <Ionicons name={size.icon as any} size={18} color={pdfSize === size.value ? '#fff' : '#1976d2'} />
            </TouchableOpacity>
          ))}
        </View>

        {/* Colors (when drawing) */}
        {drawingEnabled && (
          <View style={styles.toolGroup}>
            {COLORS.slice(0, 4).map((c) => (
              <TouchableOpacity
                key={c.color}
                style={[styles.colorBtn, { backgroundColor: c.color }, drawColor === c.color && styles.colorBtnActive]}
                onPress={() => setDrawColor(c.color)}
              />
            ))}
          </View>
        )}

        {/* Stroke Width (when drawing) */}
        {drawingEnabled && (
          <View style={styles.toolGroup}>
            {STROKE_WIDTHS.slice(0, 3).map((sw) => (
              <TouchableOpacity
                key={sw}
                style={[styles.strokeBtn, strokeWidth === sw && styles.strokeBtnActive]}
                onPress={() => setStrokeWidth(sw)}
              >
                <View style={[styles.strokePreview, { height: sw, backgroundColor: strokeWidth === sw ? '#fff' : '#1976d2' }]} />
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Mode Buttons */}
        <View style={styles.toolGroup}>
          <TouchableOpacity
            style={[styles.modeBtn, drawingEnabled && styles.modeBtnActive]}
            onPress={toggleDrawingMode}
          >
            <Ionicons name="pencil" size={20} color={drawingEnabled ? '#fff' : '#1976d2'} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modeBtn, editMode && styles.modeBtnActive]}
            onPress={toggleEditMode}
          >
            <Ionicons name="move" size={20} color={editMode ? '#fff' : '#FF9800'} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Edit Mode Actions */}
      {editMode && selectedPathIndex !== null && (
        <View style={styles.editActions}>
          <TouchableOpacity style={styles.deleteBtn} onPress={deleteSelected}>
            <Ionicons name="trash" size={20} color="#fff" />
            <Text style={styles.deleteBtnText}>Löschen</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Canvas */}
      <ScrollView style={styles.scrollContainer} contentContainerStyle={styles.scrollContent}>
        <View 
          ref={canvasRef}
          style={styles.canvasContainer}
          onLayout={(e) => {
            const { width, height } = e.nativeEvent.layout;
            setCanvasDimensions({ width, height });
          }}
          {...panResponder.panHandlers}
        >
          <Image source={{ uri: imageUri }} style={styles.image} resizeMode="contain" />
          <Svg style={StyleSheet.absoluteFill}>
            {/* Saved Paths */}
            {paths.map((p, index) => {
              const isSelected = editMode && selectedPathIndex === index;
              return (
                <G key={index}>
                  {isSelected && p.bounds && (
                    <Path
                      d={`M ${p.bounds.minX - 8} ${p.bounds.minY - 8} 
                          L ${p.bounds.maxX + 8} ${p.bounds.minY - 8} 
                          L ${p.bounds.maxX + 8} ${p.bounds.maxY + 8} 
                          L ${p.bounds.minX - 8} ${p.bounds.maxY + 8} Z`}
                      stroke="#FF9800"
                      strokeWidth={2}
                      strokeDasharray="6,4"
                      fill="rgba(255, 152, 0, 0.15)"
                    />
                  )}
                  <Path
                    d={p.path}
                    stroke={p.color}
                    strokeWidth={p.strokeWidth}
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    opacity={editMode && selectedPathIndex !== null && !isSelected ? 0.3 : 1}
                  />
                </G>
              );
            })}
            {/* Current Drawing Path */}
            {currentPath ? (
              <Path
                d={currentPath}
                stroke={drawColor}
                strokeWidth={strokeWidth}
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={0.8}
              />
            ) : null}
          </Svg>
          
          {/* Mode indicator overlay */}
          {(drawingEnabled || editMode) && (
            <View style={styles.modeIndicator}>
              <Text style={styles.modeIndicatorText}>
                {drawingEnabled ? 'Zeichnen aktiv' : 'Bearbeiten aktiv'}
              </Text>
            </View>
          )}
        </View>
      </ScrollView>

      {/* Bottom Actions */}
      <View style={styles.bottomBar}>
        <TouchableOpacity style={styles.actionBtn} onPress={undo} disabled={paths.length === 0}>
          <Ionicons name="arrow-undo" size={22} color={paths.length > 0 ? '#1976d2' : '#ccc'} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionBtn} onPress={clearAll} disabled={paths.length === 0}>
          <Ionicons name="trash-outline" size={22} color={paths.length > 0 ? '#f44336' : '#ccc'} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionBtn} onPress={saveToGallery}>
          <Ionicons name="download-outline" size={22} color="#4CAF50" />
        </TouchableOpacity>
        <TouchableOpacity style={[styles.actionBtn, styles.saveBtn]} onPress={save}>
          <Ionicons name="checkmark" size={24} color="#fff" />
          <Text style={styles.saveBtnText}>Speichern</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  toolbar: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    paddingVertical: 8,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    flexWrap: 'wrap',
    gap: 8,
  },
  toolGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  toolBtn: {
    padding: 8,
    borderRadius: 6,
    backgroundColor: '#f0f0f0',
  },
  toolBtnActive: {
    backgroundColor: '#1976d2',
  },
  colorBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: '#ddd',
  },
  colorBtnActive: {
    borderColor: '#1976d2',
    borderWidth: 3,
  },
  strokeBtn: {
    width: 36,
    height: 28,
    borderRadius: 4,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  strokeBtnActive: {
    backgroundColor: '#1976d2',
  },
  strokePreview: {
    width: 20,
    borderRadius: 2,
  },
  modeBtn: {
    padding: 8,
    borderRadius: 6,
    backgroundColor: '#f0f0f0',
  },
  modeBtnActive: {
    backgroundColor: '#1976d2',
  },
  editActions: {
    backgroundColor: '#FF9800',
    padding: 8,
    alignItems: 'center',
  },
  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f44336',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
    gap: 8,
  },
  deleteBtnText: {
    color: '#fff',
    fontWeight: '600',
  },
  scrollContainer: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  canvasContainer: {
    flex: 1,
    minHeight: 400,
    backgroundColor: '#000',
    position: 'relative',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  modeIndicator: {
    position: 'absolute',
    top: 10,
    left: 10,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 4,
  },
  modeIndicatorText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  bottomBar: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'space-around',
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  actionBtn: {
    padding: 10,
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#4CAF50',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    gap: 8,
  },
  saveBtnText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 16,
  },
});

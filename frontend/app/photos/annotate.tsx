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
  Platform,
  TextInput,
  KeyboardAvoidingView,
} from 'react-native';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Path, G } from 'react-native-svg';
import { captureRef } from 'react-native-view-shot';
import { PhotoService } from '../../services/LocalStorage';
import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';
// File system import removed - using simpler export method

// API_URL removed - using local storage now
const { width } = Dimensions.get('window');

interface DrawPath {
  path: string;
  color: string;
  strokeWidth: number;
  // Bounding box for selection
  bounds?: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  };
}

// PDF-Größen Optionen
const PDF_SIZES = [
  { value: 'small', label: 'Klein', icon: 'apps-outline', description: '9 pro Seite (3x3)' },
  { value: 'medium', label: 'Mittel', icon: 'grid-outline', description: '4 pro Seite (2x2)' },
  { value: 'large', label: 'Groß', icon: 'square-outline', description: '2 pro Seite (1x2)' },
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
  
  // Zoom & Pan
  const [scale, setScale] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [lastScale, setLastScale] = useState(1);
  const [lastPanOffset, setLastPanOffset] = useState({ x: 0, y: 0 });
  const [isZooming, setIsZooming] = useState(false);
  
  // Drawing mode toggle
  const [drawingEnabled, setDrawingEnabled] = useState(false);
  
  // Edit/Select mode
  const [editMode, setEditMode] = useState(false);
  const [selectedPathIndex, setSelectedPathIndex] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragPreviewOffset, setDragPreviewOffset] = useState({ x: 0, y: 0 }); // Live preview offset
  const dragStartRef = useRef({ x: 0, y: 0 });
  const originalPathRef = useRef<string>('');
  const lastDrawPointRef = useRef({ x: 0, y: 0 }); // For smoother drawing
  
  // Track if changes were made (for auto-save)
  const [hasChanges, setHasChanges] = useState(false);
  const initialPathsRef = useRef<string>('');
  
  // Refs für aktuelle Werte (für Auto-Save Closure-Problem)
  const pathsRef = useRef(paths);
  const descriptionRef = useRef(description);
  const pdfSizeRef = useRef(pdfSize);
  const imageUriRef = useRef(imageUri);
  
  // Refs aktuell halten
  useEffect(() => {
    pathsRef.current = paths;
  }, [paths]);
  
  useEffect(() => {
    descriptionRef.current = description;
  }, [description]);
  
  useEffect(() => {
    pdfSizeRef.current = pdfSize;
  }, [pdfSize]);
  
  useEffect(() => {
    imageUriRef.current = imageUri;
  }, [imageUri]);

  useEffect(() => {
    loadPhoto();
  }, [photoId]);

  // Track changes for auto-save
  useEffect(() => {
    if (!loading && paths.length > 0) {
      const currentPathsStr = JSON.stringify(paths);
      if (initialPathsRef.current && currentPathsStr !== initialPathsRef.current) {
        setHasChanges(true);
      }
    }
  }, [paths, loading]);

  // Auto-save when leaving the screen
  useFocusEffect(
    useCallback(() => {
      // Called when screen comes into focus - do nothing
      return () => {
        // Called when screen loses focus - auto-save if changes
        if (hasChanges && imageUriRef.current && !loading) {
          autoSave();
        }
      };
    }, [hasChanges, loading])
  );

  // Silent auto-save function (no alerts) - verwendet Refs für aktuelle Werte
  const autoSave = async () => {
    try {
      const currentPaths = pathsRef.current;
      const currentDescription = descriptionRef.current;
      const currentPdfSize = pdfSizeRef.current;
      const currentImageUri = imageUriRef.current;
      
      const annotationData = {
        paths: currentPaths,
        canvasWidth: canvasDimensions.width || width,
        canvasHeight: canvasDimensions.height || 400,
      };

      await PhotoService.update(photoId || '', {
        project_id: projectId,
        image_data: currentImageUri,
        uri: currentImageUri,
        annotations: JSON.stringify(annotationData),
        description: currentDescription,
        pdf_size: currentPdfSize,
      });
      
      console.log('Auto-saved photo annotations, paths count:', currentPaths.length);
    } catch (error) {
      console.error('Error auto-saving:', error);
    }
  };

  const loadPhoto = async () => {
    try {
      const photos = await PhotoService.getByProjectId(projectId || '');
      const photo = photos.find((p: any) => p.id === photoId);
      if (photo) {
        // Prüfe ob image_data oder uri vorhanden ist
        const imageSource = photo.image_data || photo.uri;
        if (imageSource) {
          setImageUri(imageSource);
        } else {
          console.error('No image data found for photo:', photoId);
          Alert.alert('Fehler', 'Keine Bilddaten gefunden');
        }
        setPdfSize(photo.pdf_size || 'medium');
        setDescription(photo.description || '');
        
        // Load existing annotations if available
        if (photo.annotations) {
          try {
            const annotationData = JSON.parse(photo.annotations);
            if (annotationData.paths && Array.isArray(annotationData.paths)) {
              setPaths(annotationData.paths);
              // Store initial state for change detection
              initialPathsRef.current = JSON.stringify(annotationData.paths);
            }
          } catch (e) {
            console.error('Error parsing annotations:', e);
          }
        } else {
          initialPathsRef.current = '[]';
        }
      } else {
        console.error('Photo not found:', photoId);
        Alert.alert('Fehler', 'Foto nicht gefunden');
      }
    } catch (error) {
      console.error('Error loading photo:', error);
      Alert.alert('Fehler', 'Foto konnte nicht geladen werden');
    } finally {
      setLoading(false);
    }
  };

  // Multi-touch tracking for pinch zoom
  const [touchCount, setTouchCount] = useState(0);
  const [initialPinchDistance, setInitialPinchDistance] = useState<number | null>(null);
  const [canvasOffset, setCanvasOffset] = useState({ x: 0, y: 0 });
  const canvasContainerRef = useRef<View>(null);

  const getDistance = (touches: any[]) => {
    if (touches.length < 2) return 0;
    const dx = touches[0].pageX - touches[1].pageX;
    const dy = touches[0].pageY - touches[1].pageY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const getMidpoint = (touches: any[]) => {
    if (touches.length < 2) return { x: 0, y: 0 };
    return {
      x: (touches[0].pageX + touches[1].pageX) / 2,
      y: (touches[0].pageY + touches[1].pageY) / 2,
    };
  };

  const onTouchStart = (event: any) => {
    const touches = event.nativeEvent.touches;
    setTouchCount(touches.length);
    
    if (touches.length === 2) {
      // Start pinch zoom
      setIsZooming(true);
      setInitialPinchDistance(getDistance(touches));
      setLastScale(scale);
      setLastPanOffset({ ...panOffset });
      return;
    }
    
    if (touches.length === 1 && !isZooming && drawingEnabled) {
      // Start drawing only if drawing is enabled
      const touch = touches[0];
      // Koordinaten direkt verwenden - locationX/Y ist relativ zum SVG-Container
      const locationX = touch.locationX / scale;
      const locationY = touch.locationY / scale;
      setCurrentPath(`M ${locationX} ${locationY}`);
    }
  };

  const onTouchMove = (event: any) => {
    const touches = event.nativeEvent.touches;
    
    if (touches.length === 2 && initialPinchDistance) {
      // Handle pinch zoom
      const currentDistance = getDistance(touches);
      const newScale = Math.min(Math.max(lastScale * (currentDistance / initialPinchDistance), 0.5), 4);
      setScale(newScale);
      return;
    }
    
    if (touches.length === 1 && !isZooming && currentPath && drawingEnabled) {
      // Continue drawing only if drawing is enabled
      const touch = touches[0];
      const locationX = touch.locationX / scale;
      const locationY = touch.locationY / scale;
      setCurrentPath((prev) => `${prev} L ${locationX} ${locationY}`);
    }
  };

  const onTouchEnd = (event: any) => {
    const touches = event.nativeEvent.touches;
    
    if (touches.length < 2) {
      setIsZooming(false);
      setInitialPinchDistance(null);
    }
    
    if (touches.length === 0 && currentPath && currentPath.length > 0 && !isZooming && drawingEnabled) {
      // Calculate bounding box for the new path
      const bounds = calculateBounds(currentPath);
      setPaths([...paths, { path: currentPath, color: drawColor, strokeWidth, bounds }]);
      setCurrentPath('');
    }
    
    setTouchCount(touches.length);
  };

  // Calculate bounding box from SVG path string
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

  // Translate/move a path by offset
  const translatePath = (pathString: string, offsetX: number, offsetY: number): string => {
    return pathString.replace(/([ML])\s*([\d.]+)\s+([\d.]+)/g, (match, cmd, x, y) => {
      const newX = parseFloat(x) + offsetX;
      const newY = parseFloat(y) + offsetY;
      return `${cmd} ${newX} ${newY}`;
    });
  };

  // Check if a point is near a path (for selection)
  const findPathAtPoint = (x: number, y: number): number | null => {
    const threshold = 30; // Pixel tolerance for selection
    
    for (let i = paths.length - 1; i >= 0; i--) {
      const path = paths[i];
      if (path.bounds) {
        const { minX, minY, maxX, maxY } = path.bounds;
        // Expand bounds by threshold for easier selection
        if (x >= minX - threshold && x <= maxX + threshold &&
            y >= minY - threshold && y <= maxY + threshold) {
          return i;
        }
      }
    }
    return null;
  };

  // Delete selected path
  const deleteSelectedPath = () => {
    if (selectedPathIndex !== null) {
      const newPaths = paths.filter((_, index) => index !== selectedPathIndex);
      setPaths(newPaths);
      setSelectedPathIndex(null);
      setHasChanges(true);
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
      // Speichere sowohl image_data als auch uri, falls eines fehlt
      await PhotoService.update(photoId || '', {
        project_id: projectId,
        image_data: imageUri, // Keep original image
        uri: imageUri, // Für Kompatibilität
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
    
    // Für React Native nutzen wir das Original-URI direkt
    // da die Sharing-Funktion auch mit data: URIs funktioniert
    return imageUri;
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
      {/* Kompakte Toolbar - eine Zeile: PDF-Größe links, Farben/Stärke/Zeichnen rechts */}
      <View style={styles.compactToolbar}>
        {/* Linke Seite: PDF-Größe */}
        <View style={styles.pdfSizeRow}>
          {PDF_SIZES.map((size) => (
            <TouchableOpacity
              key={size.value}
              style={[
                styles.pdfSizeButtonSmall,
                pdfSize === size.value && styles.pdfSizeButtonSmallActive,
              ]}
              onPress={() => { 
                try {
                  setPdfSize(size.value); 
                  setHasChanges(true); 
                } catch (e) {
                  console.error('Error setting PDF size:', e);
                }
              }}
            >
              <Ionicons 
                name={size.icon as any} 
                size={16} 
                color={pdfSize === size.value ? '#fff' : '#1976d2'} 
              />
              <Text style={[
                styles.pdfSizeTextSmall,
                pdfSize === size.value && styles.pdfSizeTextSmallActive,
              ]}>
                {size.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        
        {/* Rechte Seite: Farben, Strichstärke, Modus-Buttons */}
        <View style={styles.rightToolsRow}>
          {/* Farben - nur wenn im Zeichenmodus */}
          {drawingEnabled && (
            <View style={styles.colorsRow}>
              {colors.map((c) => (
                <TouchableOpacity
                  key={c.color}
                  style={[
                    styles.colorButtonSmall,
                    { backgroundColor: c.color },
                    drawColor === c.color && styles.colorButtonSmallActive,
                  ]}
                  onPress={() => setDrawColor(c.color)}
                />
              ))}
            </View>
          )}
          
          {/* Strichstärke - nur wenn im Zeichenmodus */}
          {drawingEnabled && (
            <View style={styles.strokeRow}>
              {[2, 4, 6, 8].map((sw) => (
                <TouchableOpacity
                  key={sw}
                  style={[
                    styles.strokeButton,
                    strokeWidth === sw && styles.strokeButtonActive,
                  ]}
                  onPress={() => setStrokeWidth(sw)}
                >
                  <View style={[styles.strokePreview, { height: sw, backgroundColor: strokeWidth === sw ? '#fff' : '#1976d2' }]} />
                </TouchableOpacity>
              ))}
            </View>
          )}
          
          {/* Zeichnen Toggle */}
          <TouchableOpacity 
            style={[styles.drawToggleButton, drawingEnabled && styles.drawToggleButtonActive]} 
            onPress={() => {
              setDrawingEnabled(!drawingEnabled);
              if (!drawingEnabled) {
                setEditMode(false);
                setSelectedPathIndex(null);
              }
            }}
          >
            <Ionicons name={drawingEnabled ? "brush" : "brush-outline"} size={18} color={drawingEnabled ? '#fff' : '#4CAF50'} />
            <Text style={[styles.drawToggleText, drawingEnabled && styles.drawToggleTextActive]}>
              Zeichnen
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Zweite Toolbar-Zeile: Aktionen */}
      <View style={styles.actionsToolbar}>
        <TouchableOpacity style={styles.actionButton} onPress={undo} disabled={!drawingEnabled || paths.length === 0}>
          <Ionicons name="arrow-undo" size={20} color={drawingEnabled && paths.length > 0 ? '#1976d2' : '#ccc'} />
          <Text style={[styles.actionText, (!drawingEnabled || paths.length === 0) && { color: '#ccc' }]}>Rückgängig</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionButton} onPress={clear} disabled={!drawingEnabled || paths.length === 0}>
          <Ionicons name="trash-outline" size={20} color={drawingEnabled && paths.length > 0 ? '#f44336' : '#ccc'} />
          <Text style={[styles.actionText, (!drawingEnabled || paths.length === 0) && { color: '#ccc' }]}>Löschen</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.actionButton, styles.deletePhotoButton]} 
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
                      await PhotoService.delete(photoId || '');
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
          <Ionicons name="trash" size={20} color="#fff" />
          <Text style={[styles.actionText, { color: '#fff' }]}>Foto löschen</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.actionButton, styles.saveButton]} onPress={save}>
          <Ionicons name="checkmark-circle" size={20} color="#fff" />
          <Text style={[styles.actionText, { color: '#fff' }]}>Speichern</Text>
        </TouchableOpacity>
      </View>

      {/* Beschreibung Eingabefeld */}
      <View style={styles.descriptionContainer}>
        <Text style={styles.descriptionLabel}>Beschreibung:</Text>
        <TextInput
          style={styles.descriptionInput}
          value={description}
          onChangeText={(text) => { setDescription(text); setHasChanges(true); }}
          placeholder="Beschreibung zum Foto eingeben..."
          placeholderTextColor="#999"
          multiline={false}
          returnKeyType="done"
        />
      </View>

      <ScrollView 
        style={styles.canvasContainer}
        contentContainerStyle={{ flexGrow: 1 }}
        ref={canvasRef as any}
        minimumZoomScale={0.5}
        maximumZoomScale={4}
        bouncesZoom={!drawingEnabled}
        scrollEnabled={!drawingEnabled}
        pinchGestureEnabled={!drawingEnabled}
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        onLayout={(event) => {
          const { width, height } = event.nativeEvent.layout;
          setCanvasDimensions({ width, height });
        }}
      >
        <View style={{ flex: 1 }}>
          <Image source={{ uri: imageUri }} style={styles.backgroundImage} resizeMode="contain" />
          <View
            style={styles.svgContainer}
            onStartShouldSetResponder={() => drawingEnabled}
            onMoveShouldSetResponder={() => drawingEnabled}
            onResponderGrant={(event) => {
              const touch = event.nativeEvent;
              const locationX = touch.locationX;
              const locationY = touch.locationY;
              
              if (drawingEnabled) {
                lastDrawPointRef.current = { x: locationX, y: locationY };
                setCurrentPath(`M ${locationX.toFixed(1)} ${locationY.toFixed(1)}`);
              }
            }}
            onResponderMove={(event) => {
              const touch = event.nativeEvent;
              const locationX = touch.locationX;
              const locationY = touch.locationY;
              
              if (drawingEnabled && currentPath) {
                // Nur Punkte hinzufügen wenn Abstand groß genug (glattere Linien)
                const lastPoint = lastDrawPointRef.current;
                const distance = Math.sqrt(
                  Math.pow(locationX - lastPoint.x, 2) + 
                  Math.pow(locationY - lastPoint.y, 2)
                );
                
                if (distance > 3) { // Mindestabstand für neue Punkte
                  lastDrawPointRef.current = { x: locationX, y: locationY };
                  setCurrentPath((prev) => `${prev} L ${locationX.toFixed(1)} ${locationY.toFixed(1)}`);
                }
              }
            }}
            onResponderRelease={() => {
              if (drawingEnabled && currentPath && currentPath.length > 0) {
                const bounds = calculateBounds(currentPath);
                setPaths([...paths, { path: currentPath, color: drawColor, strokeWidth, bounds }]);
                setCurrentPath('');
                setHasChanges(true);
              }
            }}
          >
            <Svg height="100%" width="100%" style={{ position: 'absolute' }}>
              {paths.map((p, index) => {
                return (
                  <G key={index}>
                    <Path
                      d={p.path}
                      stroke={p.color}
                      strokeWidth={p.strokeWidth}
                      fill="none"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </G>
                );
              })}
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
      </ScrollView>
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
  // Kompakte erste Toolbar-Zeile
  compactToolbar: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    paddingVertical: 8,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  // PDF-Größe links
  pdfSizeRow: {
    flexDirection: 'row',
    gap: 4,
  },
  pdfSizeButtonSmall: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
    backgroundColor: '#f0f0f0',
    gap: 4,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  pdfSizeButtonSmallActive: {
    backgroundColor: '#1976d2',
    borderColor: '#1565c0',
  },
  pdfSizeTextSmall: {
    fontSize: 11,
    fontWeight: '600',
    color: '#1976d2',
  },
  pdfSizeTextSmallActive: {
    color: '#fff',
  },
  // Rechte Seite: Farben, Stärke, Zeichnen
  rightToolsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  colorsRow: {
    flexDirection: 'row',
    gap: 4,
  },
  colorButtonSmall: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#ddd',
  },
  colorButtonSmallActive: {
    borderWidth: 3,
    borderColor: '#1976d2',
  },
  strokeRow: {
    flexDirection: 'row',
    gap: 3,
  },
  strokeButton: {
    width: 28,
    height: 24,
    borderRadius: 4,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ddd',
  },
  strokeButtonActive: {
    backgroundColor: '#1976d2',
    borderColor: '#1565c0',
  },
  strokePreview: {
    width: 14,
    borderRadius: 2,
  },
  drawToggleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 16,
    backgroundColor: '#f5f5f5',
    borderWidth: 2,
    borderColor: '#4CAF50',
    gap: 3,
  },
  drawToggleButtonActive: {
    backgroundColor: '#4CAF50',
    borderColor: '#388E3C',
  },
  drawToggleText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#4CAF50',
  },
  drawToggleTextActive: {
    color: '#fff',
  },
  // Bearbeiten-Modus Button
  editToggleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 16,
    backgroundColor: '#f5f5f5',
    borderWidth: 2,
    borderColor: '#FF9800',
    gap: 3,
  },
  editToggleButtonActive: {
    backgroundColor: '#FF9800',
    borderColor: '#F57C00',
  },
  editToggleText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FF9800',
  },
  editToggleTextActive: {
    color: '#fff',
  },
  // Bearbeitungsmodus Info-Zeile
  editModeInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF3E0',
    paddingVertical: 6,
    paddingHorizontal: 10,
    gap: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#FFE0B2',
  },
  editModeInfoText: {
    flex: 1,
    fontSize: 11,
    color: '#E65100',
  },
  deleteSelectedButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f44336',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 12,
    gap: 4,
  },
  deleteSelectedText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#fff',
  },
  // Zweite Toolbar-Zeile: Aktionen
  actionsToolbar: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    paddingVertical: 6,
    paddingHorizontal: 10,
    gap: 6,
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderRadius: 6,
    backgroundColor: '#f5f5f5',
    gap: 4,
  },
  actionText: {
    fontSize: 11,
    color: '#333',
  },
  deletePhotoButton: {
    backgroundColor: '#f44336',
  },
  saveButton: {
    backgroundColor: '#4caf50',
    marginLeft: 'auto',
  },
  // Alte Styles für Kompatibilität
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
  // Reset Zoom Button
  resetZoomButton: {
    position: 'absolute',
    bottom: 250,
    right: 10,
    padding: 8,
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderRadius: 8,
    zIndex: 100,
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
  // Beschreibung Styles
  descriptionContainer: {
    backgroundColor: '#fff',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderTopWidth: 1,
    borderTopColor: '#eee',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  descriptionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
  },
  descriptionInput: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    color: '#333',
    borderWidth: 1,
    borderColor: '#e0e0e0',
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

import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  TextInput,
  Dimensions,
  Platform,
  ScrollView,
  Modal,
  KeyboardAvoidingView,
  BackHandler,
  Keyboard,
  Animated,
  PanResponder,
  Image as RNImage,
  useWindowDimensions,
} from 'react-native';
import Slider from '@react-native-community/slider';
import { useRouter, useLocalSearchParams, useFocusEffect, useNavigation } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as DocumentPicker from 'expo-document-picker';
import PdfThumbnail from 'react-native-pdf-thumbnail';
import { SketchService, PhotoService } from '../../services/LocalStorage';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { captureRef } from 'react-native-view-shot';

// Key für Tool-Größen-Einstellungen
const TOOL_SIZES_KEY = 'aufmassprofi_tool_sizes';
import Svg, { 
  Path, 
  Line, 
  Circle, 
  Rect, 
  Image as SvgImage, 
  Text as SvgText, 
  G, 
  Defs, 
  Marker,
  Polygon,
  Pattern
} from 'react-native-svg';

// API_URL removed - using local storage now
const { width, height } = Dimensions.get('window');

// Douglas-Peucker algorithm for line simplification
const simplifyPath = (pathString: string, tolerance: number = 8): string => {
  // Parse path string to points
  const points: { x: number; y: number }[] = [];
  const parts = pathString.replace(/M/g, ' M ').replace(/L/g, ' L ').split(/\s+/).filter(p => p);
  
  let i = 0;
  while (i < parts.length) {
    if (parts[i] === 'M' || parts[i] === 'L') {
      if (i + 2 < parts.length) {
        const x = parseFloat(parts[i + 1]);
        const y = parseFloat(parts[i + 2]);
        if (!isNaN(x) && !isNaN(y)) {
          points.push({ x, y });
        }
        i += 3;
      } else {
        i++;
      }
    } else {
      i++;
    }
  }
  
  if (points.length < 3) {
    return pathString;
  }
  
  // Douglas-Peucker simplification
  const simplifiedPoints = douglasPeucker(points, tolerance);
  
  // Convert back to path string
  if (simplifiedPoints.length === 0) return pathString;
  
  let result = `M ${simplifiedPoints[0].x.toFixed(1)} ${simplifiedPoints[0].y.toFixed(1)}`;
  for (let j = 1; j < simplifiedPoints.length; j++) {
    result += ` L ${simplifiedPoints[j].x.toFixed(1)} ${simplifiedPoints[j].y.toFixed(1)}`;
  }
  
  return result;
};

// Douglas-Peucker recursive algorithm
const douglasPeucker = (points: { x: number; y: number }[], tolerance: number): { x: number; y: number }[] => {
  if (points.length <= 2) return points;
  
  // Find the point with maximum distance from the line between first and last
  let maxDistance = 0;
  let maxIndex = 0;
  
  const start = points[0];
  const end = points[points.length - 1];
  
  for (let i = 1; i < points.length - 1; i++) {
    const distance = perpendicularDistance(points[i], start, end);
    if (distance > maxDistance) {
      maxDistance = distance;
      maxIndex = i;
    }
  }
  
  // If max distance is greater than tolerance, recursively simplify
  if (maxDistance > tolerance) {
    const left = douglasPeucker(points.slice(0, maxIndex + 1), tolerance);
    const right = douglasPeucker(points.slice(maxIndex), tolerance);
    return [...left.slice(0, -1), ...right];
  } else {
    // Return just the endpoints
    return [start, end];
  }
};

// Calculate perpendicular distance from point to line
const perpendicularDistance = (
  point: { x: number; y: number },
  lineStart: { x: number; y: number },
  lineEnd: { x: number; y: number }
): number => {
  const dx = lineEnd.x - lineStart.x;
  const dy = lineEnd.y - lineStart.y;
  
  if (dx === 0 && dy === 0) {
    // Line is a point
    return Math.sqrt(Math.pow(point.x - lineStart.x, 2) + Math.pow(point.y - lineStart.y, 2));
  }
  
  const t = ((point.x - lineStart.x) * dx + (point.y - lineStart.y) * dy) / (dx * dx + dy * dy);
  
  let nearestX, nearestY;
  if (t < 0) {
    nearestX = lineStart.x;
    nearestY = lineStart.y;
  } else if (t > 1) {
    nearestX = lineEnd.x;
    nearestY = lineEnd.y;
  } else {
    nearestX = lineStart.x + t * dx;
    nearestY = lineStart.y + t * dy;
  }
  
  return Math.sqrt(Math.pow(point.x - nearestX, 2) + Math.pow(point.y - nearestY, 2));
};

interface DrawElement {
  id: string;
  type: 'path' | 'line' | 'circle' | 'rect' | 'text' | 'image' | 'arrow' | 'pointer' | 'polygon' | 'polyline' | 'memo';
  data: any;
  color: string;
  strokeWidth: number;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  rotation?: number;
  fontSize?: number;
  fontWeight?: 'normal' | 'bold';
  fontStyle?: 'normal' | 'italic';
  fontFamily?: string;
}

// Verfügbare Schriftarten - Platform-spezifisch für React Native SVG
// Android verwendet die generischen Namen die von react-native-svg unterstützt werden
// iOS verwendet die nativen Systemschriftarten
type FontFamily = 'System' | 'Handschrift' | 'Monospace' | 'Serif';
const FONT_FAMILIES: { id: FontFamily; label: string; style: string; svgFont: string }[] = Platform.select({
  ios: [
    { id: 'System', label: 'Standard', style: 'System', svgFont: 'Helvetica' },
    { id: 'Handschrift', label: 'Handschrift', style: 'cursive', svgFont: 'Snell Roundhand' },
    { id: 'Monospace', label: 'Monospace', style: 'Courier', svgFont: 'Courier' },
    { id: 'Serif', label: 'Serif', style: 'Georgia', svgFont: 'Times New Roman' },
  ],
  android: [
    { id: 'System', label: 'Standard', style: 'normal', svgFont: 'Roboto' },
    { id: 'Handschrift', label: 'Handschrift', style: 'normal', svgFont: 'sans-serif-light' },
    { id: 'Monospace', label: 'Monospace', style: 'monospace', svgFont: 'monospace' },
    { id: 'Serif', label: 'Serif', style: 'normal', svgFont: 'serif' },
  ],
  default: [
    // Web/Browser - CSS Schriftarten funktionieren hier
    { id: 'System', label: 'Standard', style: 'system-ui, sans-serif', svgFont: 'system-ui, -apple-system, sans-serif' },
    { id: 'Handschrift', label: 'Handschrift', style: 'cursive', svgFont: 'Comic Sans MS, cursive, sans-serif' },
    { id: 'Monospace', label: 'Monospace', style: 'monospace', svgFont: 'Courier New, monospace' },
    { id: 'Serif', label: 'Serif', style: 'serif', svgFont: 'Times New Roman, Georgia, serif' },
  ],
}) as { id: FontFamily; label: string; style: string; svgFont: string }[];

type DrawMode = 'select' | 'pen' | 'line' | 'circle' | 'rect' | 'arrow' | 'pointer' | 'text' | 'image' | 'polygon' | 'polyline' | 'memo' | 'crop' | 'addPoint' | 'removePoint';

// Verschiebbare Summenbox-Komponente für jedes Polyline-Element
interface DraggableTotalBoxProps {
  elementId: string;
  totalValue: number;
  initialPosition: { x: number; y: number };
  baseTop: number;
  isCompact: boolean;
  onPositionChange: (x: number, y: number) => void;
}

const DraggableTotalBox: React.FC<DraggableTotalBoxProps> = ({ 
  elementId, 
  totalValue, 
  initialPosition, 
  baseTop, 
  isCompact, 
  onPositionChange 
}) => {
  const pan = useRef(new Animated.ValueXY({ x: initialPosition.x, y: initialPosition.y })).current;
  
  // Aktualisiere Position wenn sich initialPosition ändert
  useEffect(() => {
    pan.setValue({ x: initialPosition.x, y: initialPosition.y });
  }, [initialPosition.x, initialPosition.y]);
  
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        pan.setOffset({
          x: (pan.x as any)._value,
          y: (pan.y as any)._value,
        });
        pan.setValue({ x: 0, y: 0 });
      },
      onPanResponderMove: Animated.event(
        [null, { dx: pan.x, dy: pan.y }],
        { useNativeDriver: false }
      ),
      onPanResponderRelease: () => {
        pan.flattenOffset();
        // Speichere die finale Position
        const finalX = (pan.x as any)._value;
        const finalY = (pan.y as any)._value;
        onPositionChange(finalX, finalY);
      },
    })
  ).current;
  
  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          top: baseTop,
          right: 12,
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: '#fff',
          paddingVertical: isCompact ? 6 : 10,
          paddingHorizontal: isCompact ? 10 : 14,
          paddingLeft: isCompact ? 6 : 8,
          borderRadius: isCompact ? 8 : 10,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.2,
          shadowRadius: 4,
          elevation: 5,
          gap: isCompact ? 5 : 8,
          zIndex: 50,
          borderWidth: 1,
          borderColor: '#e3f2fd',
          transform: pan.getTranslateTransform(),
        },
      ]}
      {...panResponder.panHandlers}
    >
      <View style={{ marginRight: 4, opacity: 0.6 }}>
        <Ionicons name="move" size={isCompact ? 10 : 12} color="#999" />
      </View>
      <Ionicons name="calculator-outline" size={isCompact ? 14 : 18} color="#1976d2" />
      <Text style={{ 
        fontSize: isCompact ? 13 : 16, 
        fontWeight: '700', 
        color: '#1976d2' 
      }}>
        Gesamt: {totalValue.toString().replace('.', ',')} lfm
      </Text>
    </Animated.View>
  );
};

export default function DrawSketchScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const projectId = Array.isArray(params.projectId) ? params.projectId[0] : params.projectId;
  const sketchId = Array.isArray(params.sketchId) ? params.sketchId[0] : params.sketchId;
  // Get background image URI from route params (passed from new.tsx)
  const backgroundImageUri = Array.isArray(params.backgroundImageUri) 
    ? params.backgroundImageUri[0] 
    : params.backgroundImageUri;
  // Get photo ID for loading from LocalStorage (faster than passing base64 via URL)
  const photoId = Array.isArray(params.photoId) ? params.photoId[0] : params.photoId;
  
  // iPhone-Erkennung für responsive Layout
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const isPhone = screenWidth < 500;
  
  const canvasRef = useRef(null);
  const svgRef = useRef(null);
  const initialImageAdded = useRef(false);
  
  // State
  const [title, setTitle] = useState('Neue Skizze');
  const [notes, setNotes] = useState('');
  const [elements, setElements] = useState<DrawElement[]>([]);
  const [history, setHistory] = useState<DrawElement[][]>([[]]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const [drawMode, setDrawMode] = useState<DrawMode>('select');
  const [drawColor, setDrawColor] = useState('#FF0000');
  const [strokeWidth, setStrokeWidth] = useState(3);
  const [loading, setLoading] = useState(false);
  
  // Drawing state
  const [currentPath, setCurrentPath] = useState('');
  // Ref für flüssigeres Zeichnen - speichert Pfaddaten ohne Re-Render
  const currentPathRef = useRef<string>('');
  // Counter für Throttling - nur alle N Punkte den State aktualisieren
  const drawPointCountRef = useRef<number>(0);
  const [startPoint, setStartPoint] = useState<{ x: number; y: number } | null>(null);
  const [tempElement, setTempElement] = useState<DrawElement | null>(null);
  
  // Polyline state - für zusammenhängende Linien (Grundrisse)
  const [polylinePoints, setPolylinePoints] = useState<{ x: number; y: number }[]>([]);
  
  // Transform state
  const [dragMode, setDragMode] = useState<'move' | 'resize' | 'rotate' | null>(null);
  const [resizeHandle, setResizeHandle] = useState<string | null>(null);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [originalElement, setOriginalElement] = useState<DrawElement | null>(null);
  
  // Zoom & Pan - use dynamic dimensions
  const [scale, setScale] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  // ScrollView Content-Offset für korrekte Koordinatenberechnung beim Zeichnen
  const [scrollOffset, setScrollOffset] = useState({ x: 0, y: 0 });
  // Zoom-Modus: manuell gesteuert über Lupe-Button
  const [zoomMode, setZoomMode] = useState(true); // Standard: Zoom erlaubt
  // Referenz für ScrollView um Zoom zurückzusetzen
  const scrollViewRef = useRef<ScrollView>(null);
  // Canvas-Dimensionen für zoomToRect - dynamisch basierend auf Bildschirmgröße
  const canvasWidth = screenWidth;
  const canvasHeight = screenHeight - (isPhone ? 100 : 120);
  
  // Foto-Bearbeitungsmodus - wenn true, kann nur das Hintergrundfoto bearbeitet werden
  const [photoEditMode, setPhotoEditMode] = useState(false);
  
  // Zuschneiden-Modus
  const [showCropModal, setShowCropModal] = useState(false);
  const [cropImageUri, setCropImageUri] = useState<string | null>(null);
  const [cropImageId, setCropImageId] = useState<string | null>(null);
  const [cropBox, setCropBox] = useState({ x: 50, y: 50, width: 200, height: 200 });
  const [cropImageDimensions, setCropImageDimensions] = useState({ width: 300, height: 300 });
  
  // Refs für Crop-Interaktion (verwende Refs statt State für bessere Performance)
  const cropContainerRef = useRef<View>(null);
  const cropBoxRef = useRef({ x: 50, y: 50, width: 200, height: 200 }); // Sync mit cropBox
  const activeCropHandle = useRef<string | null>(null);
  const cropStartPos = useRef({ x: 0, y: 0 });
  const cropStartBox = useRef({ x: 50, y: 50, width: 200, height: 200 });
  
  // Halte cropBoxRef synchron mit cropBox State
  useEffect(() => {
    cropBoxRef.current = cropBox;
  }, [cropBox]);
  
  // Helper-Funktion: Wechselt den Zeichenmodus
  // Zoom bleibt erhalten, aber scrollEnabled wird deaktiviert damit Zeichnen funktioniert
  // PhotoEditMode wird automatisch deaktiviert wenn ein anderes Werkzeug gewählt wird
  const selectDrawMode = (mode: DrawMode) => {
    setDrawMode(mode);
    // PhotoEditMode deaktivieren wenn anderes Werkzeug gewählt wird
    if (photoEditMode) {
      setPhotoEditMode(false);
      // Auch die Auswahl aufheben, damit die grünen Handles verschwinden
      setSelectedElementId(null);
    }
    // Zoom-Modus ausschalten damit Zeichnen/Bearbeiten funktioniert
    // aber den aktuellen Zoom-Level beibehalten!
    setZoomMode(false);
  };
  
  // State für Projektfotos-Modal
  const [showProjectPhotosModal, setShowProjectPhotosModal] = useState(false);
  const [projectPhotos, setProjectPhotos] = useState<any[]>([]);
  
  // Projektfotos laden wenn Modal geöffnet wird
  const loadProjectPhotos = async () => {
    if (projectId) {
      const photos = await PhotoService.getByProjectId(projectId);
      setProjectPhotos(photos);
      setShowProjectPhotosModal(true);
    } else {
      Alert.alert('Hinweis', 'Kein Projekt ausgewählt. Bitte öffnen Sie die Skizze aus einem Projekt.');
    }
  };

  // Funktion um ein Projektfoto als Bild-Element einzufügen
  const insertProjectPhoto = (photo: any) => {
    const imageUri = photo.image_data || photo.uri;
    if (!imageUri) {
      Alert.alert('Fehler', 'Dieses Foto hat keine gültige Bilddaten');
      return;
    }
    
    // Berechne korrektes Seitenverhältnis des Bildes
    RNImage.getSize(
      imageUri,
      (imgWidth, imgHeight) => {
        // Maximale Größe im Canvas
        const maxWidth = 400;
        const maxHeight = 300;
        const aspectRatio = imgWidth / imgHeight;
        
        let finalWidth, finalHeight;
        if (aspectRatio > maxWidth / maxHeight) {
          // Bild ist breiter - begrenzen durch Breite
          finalWidth = maxWidth;
          finalHeight = maxWidth / aspectRatio;
        } else {
          // Bild ist höher - begrenzen durch Höhe
          finalHeight = maxHeight;
          finalWidth = maxHeight * aspectRatio;
        }
        
        const imageElement: DrawElement = {
          id: generateId(),
          type: 'image',
          data: { uri: imageUri },
          color: '#000000',
          strokeWidth: 0,
          x: 50,
          y: 50,
          width: finalWidth,
          height: finalHeight,
          rotation: 0,
        };
        
        const newElements = [...elements, imageElement];
        addToHistory(newElements);
        setElements(newElements);
        setSelectedElementId(imageElement.id);
        setShowProjectPhotosModal(false);
        // Automatisch Foto-Bearbeiten Modus aktivieren
        setPhotoEditMode(true);
        selectDrawMode('select');
      },
      (error) => {
        console.error('Error getting image size:', error);
        // Fallback: Füge mit Standardgrößen ein
        const imageElement: DrawElement = {
          id: generateId(),
          type: 'image',
          data: { uri: imageUri },
          color: '#000000',
          strokeWidth: 0,
          x: 50,
          y: 50,
          width: 300,
          height: 200,
          rotation: 0,
        };
        
        const newElements = [...elements, imageElement];
        addToHistory(newElements);
        setElements(newElements);
        setSelectedElementId(imageElement.id);
        setShowProjectPhotosModal(false);
        setPhotoEditMode(true);
        selectDrawMode('select');
      }
    );
  };
  
  // Kästchenpapier Hintergrund
  const [showGrid, setShowGrid] = useState(true);
  const [gridSize, setGridSize] = useState(30); // Größe der Kästchen in Pixel
  const [gridOpacity, setGridOpacity] = useState(0.4); // Sichtbarkeit der Linien
  const [showGridSettings, setShowGridSettings] = useState(false);
  
  // Polyline Punkt-Bearbeitung
  const [editingPolylinePoint, setEditingPolylinePoint] = useState<number | null>(null);
  
  // Polyline Linien-Maße (für Grundriss-Bemaßung)
  const [selectedLineSegment, setSelectedLineSegment] = useState<{ elementId: string; segmentIndex: number } | null>(null);
  const [lineSegmentMeasurements, setLineSegmentMeasurements] = useState<{ [key: string]: { [segmentIndex: number]: string } }>({});
  const [showLineMeasurementNumpad, setShowLineMeasurementNumpad] = useState(false);
  const [lineMeasurementExpression, setLineMeasurementExpression] = useState('');
  const lineMeasurementInputRef = useRef<TextInput>(null);
  
  // Tracking für Skizzen-Wechsel (Reset-Erkennung)
  const lastLoadedSketchId = useRef<string | null | undefined>(undefined);
  const isResettingRef = useRef(false);
  const currentSketchIdRef = useRef<string | undefined>(sketchId);
  
  // Update ref whenever sketchId changes
  useEffect(() => {
    currentSketchIdRef.current = sketchId;
  }, [sketchId]);
  
  // PDF-Größe für Export
  const [pdfSize, setPdfSize] = useState<string>('large');
  
  // Polyline Label Offsets - Position relativ zum Zentrum (für Verschiebbarkeit)
  const [labelOffsets, setLabelOffsets] = useState<{ [elementId: string]: { x: number; y: number } }>({});
  // State für aktives Label-Ziehen
  const [draggingLabelId, setDraggingLabelId] = useState<string | null>(null);
  const labelDragStartRef = useRef<{ x: number; y: number; offsetX: number; offsetY: number }>({ x: 0, y: 0, offsetX: 0, offsetY: 0 });
  
  // Aufmaß-Tool state
  const [showMeasurementTool, setShowMeasurementTool] = useState(false);
  const [measurementExpression, setMeasurementExpression] = useState('');
  const [measurementUnit, setMeasurementUnit] = useState('m²');
  const [showMeasurementNumpad, setShowMeasurementNumpad] = useState(true);
  const [showMeasurementKeyboard, setShowMeasurementKeyboard] = useState(false);
  const measurementInputRef = useRef<TextInput>(null);
  const availableUnits = ['m', 'm²', 'm³', 'lfm', 'Stück', 'Paar', 'kg', 'l'];
  
  // Numpad in Modals (für Arrow/Text/Pointer)
  const [showModalNumpad, setShowModalNumpad] = useState(false);
  const [modalNumpadMode, setModalNumpadMode] = useState<'numbers' | 'letters'>('numbers');
  const arrowInputRef = useRef<TextInput>(null);
  const textInputRef = useRef<TextInput>(null);
  const pointerInputRef = useRef<TextInput>(null);
  const notesInputRef = useRef<TextInput>(null);
  
  // Aktiver Input für Numpad-Verbindung
  const [activeNumpadSetter, setActiveNumpadSetter] = useState<React.Dispatch<React.SetStateAction<string>> | null>(null);
  const [activeNumpadRef, setActiveNumpadRef] = useState<React.RefObject<TextInput | null> | null>(null);
  
  // Verschiebbare Numpad-Position (für alle Modals)
  const modalNumpadPosition = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const modalNumpadPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderMove: Animated.event(
        [null, { dx: modalNumpadPosition.x, dy: modalNumpadPosition.y }],
        { useNativeDriver: false }
      ),
      onPanResponderRelease: () => {
        modalNumpadPosition.extractOffset();
      },
    })
  ).current;

  // Verschiebbare Position für Grundriss-Steuerung
  const polylineControlPosition = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const polylineControlPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderMove: Animated.event(
        [null, { dx: polylineControlPosition.x, dy: polylineControlPosition.y }],
        { useNativeDriver: false }
      ),
      onPanResponderRelease: () => {
        polylineControlPosition.extractOffset();
      },
    })
  ).current;

  // Verschiebbare Positionen für Summenboxen (lfm) - eine Position pro Polyline-Element
  const [totalLfmBoxPositions, setTotalLfmBoxPositions] = useState<{ [elementId: string]: { x: number, y: number } }>({});
  
  // Funktion um die Position eines Gesamt-Feldes zu aktualisieren
  const updateTotalLfmBoxPosition = (elementId: string, x: number, y: number) => {
    setTotalLfmBoxPositions(prev => ({
      ...prev,
      [elementId]: { x, y }
    }));
  };
  
  // Verschiebbare Position für Übersicht-Legend
  const [legendPosition, setLegendPosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const legendPan = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const legendPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        legendPan.setOffset({
          x: (legendPan.x as any)._value,
          y: (legendPan.y as any)._value,
        });
        legendPan.setValue({ x: 0, y: 0 });
      },
      onPanResponderMove: Animated.event(
        [null, { dx: legendPan.x, dy: legendPan.y }],
        { useNativeDriver: false }
      ),
      onPanResponderRelease: () => {
        legendPan.flattenOffset();
        // Speichere finale Position
        const finalX = (legendPan.x as any)._value;
        const finalY = (legendPan.y as any)._value;
        setLegendPosition({ x: finalX, y: finalY });
      },
    })
  ).current;
  
  // Aufmaß-Tool Funktionen
  const calculateMeasurementExpression = (expr: string): number | null => {
    try {
      let cleanExpr = expr.replace(/\s/g, '').replace(/,/g, '.');
      if (!/^[\d.+\-*/()]+$/.test(cleanExpr)) return null;
      const result = Function('"use strict"; return (' + cleanExpr + ')')();
      if (typeof result !== 'number' || isNaN(result) || !isFinite(result)) return null;
      return Math.round(result * 100) / 100;
    } catch { return null; }
  };
  
  // Berechne Gesamtlänge für ein einzelnes Element (Grundriss)
  const calculateTotalLfmForElement = (elementId: string): number => {
    let total = 0;
    const segmentMeasures = lineSegmentMeasurements[elementId];
    if (segmentMeasures) {
      Object.values(segmentMeasures).forEach(measurement => {
        // Extrahiere Zahl aus dem Maß-String (z.B. "2,50m" -> 2.50)
        const match = measurement.match(/^([\d.,]+)/);
        if (match) {
          const value = parseFloat(match[1].replace(',', '.'));
          if (!isNaN(value)) {
            total += value;
          }
        }
      });
    }
    return Math.round(total * 100) / 100;
  };
  
  // Berechne Gesamtlänge aller Maße in lfm (für Preview/PDF)
  const calculateTotalLfm = (): number => {
    let total = 0;
    Object.values(lineSegmentMeasurements).forEach(segmentMeasures => {
      Object.values(segmentMeasures).forEach(measurement => {
        // Extrahiere Zahl aus dem Maß-String (z.B. "2,50m" -> 2.50)
        const match = measurement.match(/^([\d.,]+)/);
        if (match) {
          const value = parseFloat(match[1].replace(',', '.'));
          if (!isNaN(value)) {
            total += value;
          }
        }
      });
    });
    return Math.round(total * 100) / 100;
  };
  
  // Finde alle Polyline-Elemente die Maße haben
  const getPolylineElementsWithMeasurements = (): DrawElement[] => {
    return elements.filter(el => 
      el.type === 'polyline' && 
      lineSegmentMeasurements[el.id] && 
      Object.keys(lineSegmentMeasurements[el.id]).length > 0
    );
  };
  
  // Handler für Linien-Maß Numpad
  const handleLineMeasurementNumpadPress = (key: string) => {
    if (key === '⌫') {
      setLineMeasurementExpression(prev => prev.slice(0, -1));
    } else if (key === 'C') {
      setLineMeasurementExpression('');
    } else {
      setLineMeasurementExpression(prev => prev + key);
    }
    setTimeout(() => lineMeasurementInputRef.current?.focus(), 10);
  };
  
  // Maß zur ausgewählten Linie hinzufügen
  const addMeasurementToSelectedLine = () => {
    if (!selectedLineSegment || !lineMeasurementExpression.trim()) return;
    
    // Formatiere das Maß (füge 'm' hinzu wenn nur Zahl)
    let formattedMeasurement = lineMeasurementExpression.trim();
    if (/^[\d.,]+$/.test(formattedMeasurement)) {
      formattedMeasurement = formattedMeasurement.replace('.', ',') + 'm';
    }
    
    setLineSegmentMeasurements(prev => ({
      ...prev,
      [selectedLineSegment.elementId]: {
        ...prev[selectedLineSegment.elementId],
        [selectedLineSegment.segmentIndex]: formattedMeasurement,
      },
    }));
    
    // Reset
    setLineMeasurementExpression('');
    setShowLineMeasurementNumpad(false);
    setSelectedLineSegment(null);
  };
  
  // Maß von Linie entfernen
  const removeMeasurementFromSelectedLine = () => {
    if (!selectedLineSegment) return;
    
    setLineSegmentMeasurements(prev => {
      const newMeasurements = { ...prev };
      if (newMeasurements[selectedLineSegment.elementId]) {
        const segmentMeasures = { ...newMeasurements[selectedLineSegment.elementId] };
        delete segmentMeasures[selectedLineSegment.segmentIndex];
        if (Object.keys(segmentMeasures).length === 0) {
          delete newMeasurements[selectedLineSegment.elementId];
        } else {
          newMeasurements[selectedLineSegment.elementId] = segmentMeasures;
        }
      }
      return newMeasurements;
    });
    
    setSelectedLineSegment(null);
  };
  
  const handleMeasurementNumpadPress = (key: string) => {
    if (key === '⌫') {
      setMeasurementExpression(prev => prev.slice(0, -1));
    } else if (key === 'C') {
      setMeasurementExpression('');
    } else {
      setMeasurementExpression(prev => prev + key);
    }
    setTimeout(() => measurementInputRef.current?.focus(), 10);
  };
  
  // Kompaktes Numpad-Component für Modals mit Zahlen/Buchstaben-Umschaltung
  const [modalNumpadCaps, setModalNumpadCaps] = useState(false); // Groß/Klein
  
  // Öffne Numpad mit bestimmtem Setter und Ref
  const openModalNumpad = (setter: React.Dispatch<React.SetStateAction<string>>, inputRef: React.RefObject<TextInput | null>) => {
    setActiveNumpadSetter(() => setter);
    setActiveNumpadRef(inputRef);
    setShowModalNumpad(true);
    modalNumpadPosition.setValue({ x: 0, y: 0 });
    modalNumpadPosition.setOffset({ x: 0, y: 0 });
  };
  
  // Schließe Numpad und setze State zurück
  const closeModalNumpad = () => {
    setShowModalNumpad(false);
    setActiveNumpadSetter(null);
    setActiveNumpadRef(null);
    setModalNumpadMode('numbers');
    modalNumpadPosition.setValue({ x: 0, y: 0 });
    modalNumpadPosition.setOffset({ x: 0, y: 0 });
  };
  
  // Numpad-Taste drücken (mit aktiven Setter und Ref)
  const handleActiveNumpadPress = (key: string) => {
    if (!activeNumpadSetter) return;
    
    if (key === '⌫') {
      activeNumpadSetter(prev => prev.slice(0, -1));
    } else if (key === 'C') {
      activeNumpadSetter('');
    } else {
      activeNumpadSetter(prev => prev + key);
    }
    // Fokus zurücksetzen für Bluetooth-Eingabe
    setTimeout(() => activeNumpadRef?.current?.focus(), 10);
  };
  
  // Rendert das Numpad-Overlay innerhalb eines Modals
  const renderInModalNumpad = () => {
    if (!showModalNumpad) return null;
    
    return (
      <Animated.View 
        style={[
          styles.inModalNumpad,
          { transform: modalNumpadPosition.getTranslateTransform() }
        ]}
      >
        {/* Schließen-Button außerhalb des Drag-Bereichs */}
        <TouchableOpacity 
          style={styles.numpadCloseBtn}
          onPress={closeModalNumpad}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="close-circle" size={22} color="#999" />
        </TouchableOpacity>
        
        {/* Drag-Handle zum Verschieben */}
        <View {...modalNumpadPanResponder.panHandlers} style={styles.numpadDragHandle}>
          <Ionicons name="move" size={14} color="#999" />
          <Text style={styles.numpadDragText}>Verschieben</Text>
        </View>
        
        {modalNumpadMode === 'numbers' ? (
          <>
            {/* Zahlen-Modus */}
            <View style={styles.modalNumpadRow}>
              {['7','8','9','+'].map(k => (
                <TouchableOpacity key={`num-${k}`} style={[styles.modalNumpadKey, k==='+' && styles.modalNumpadOp]} onPress={() => handleActiveNumpadPress(k)}>
                  <Text style={k==='+' ? styles.modalNumpadOpText : styles.modalNumpadKeyText}>{k}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.modalNumpadRow}>
              {['4','5','6','-'].map(k => (
                <TouchableOpacity key={`num-${k}`} style={[styles.modalNumpadKey, k==='-' && styles.modalNumpadOp]} onPress={() => handleActiveNumpadPress(k)}>
                  <Text style={k==='-' ? styles.modalNumpadOpText : styles.modalNumpadKeyText}>{k === '-' ? '−' : k}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.modalNumpadRow}>
              {['1','2','3','×'].map(k => (
                <TouchableOpacity key={`num-${k}`} style={[styles.modalNumpadKey, k==='×' && styles.modalNumpadOp]} onPress={() => handleActiveNumpadPress(k === '×' ? '*' : k)}>
                  <Text style={k==='×' ? styles.modalNumpadOpText : styles.modalNumpadKeyText}>{k}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.modalNumpadRow}>
              {[',','0','.','÷'].map(k => (
                <TouchableOpacity key={`num-${k}`} style={[styles.modalNumpadKey, k==='÷' && styles.modalNumpadOp]} onPress={() => handleActiveNumpadPress(k === '÷' ? '/' : k)}>
                  <Text style={k==='÷' ? styles.modalNumpadOpText : styles.modalNumpadKeyText}>{k}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.modalNumpadRow}>
              <TouchableOpacity style={[styles.modalNumpadKey, styles.modalNumpadMode]} onPress={() => setModalNumpadMode('letters')}>
                <Text style={styles.modalNumpadModeText}>ABC</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalNumpadKey, styles.modalNumpadClear]} onPress={() => handleActiveNumpadPress('C')}>
                <Text style={styles.modalNumpadClearText}>C</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalNumpadKey} onPress={() => handleActiveNumpadPress(' ')}>
                <Text style={styles.modalNumpadKeyText}>{"␣"}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalNumpadKey, styles.modalNumpadDel]} onPress={() => handleActiveNumpadPress('⌫')}>
                <Ionicons name="backspace-outline" size={18} color="#f44336" />
              </TouchableOpacity>
            </View>
          </>
        ) : (
          <>
            {/* Buchstaben-Modus */}
            <View style={styles.modalNumpadRow}>
              {['m','m²','m³','lfm'].map((k, i) => (
                <TouchableOpacity key={`unit-${i}`} style={[styles.modalNumpadKey, styles.modalNumpadUnit]} onPress={() => handleActiveNumpadPress(k)}>
                  <Text style={styles.modalNumpadUnitText}>{k}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.modalNumpadRow}>
              {['Stk','Paar','kg','l'].map((k, i) => (
                <TouchableOpacity key={`unit2-${i}`} style={[styles.modalNumpadKey, styles.modalNumpadUnit]} onPress={() => handleActiveNumpadPress(k)}>
                  <Text style={styles.modalNumpadUnitText}>{k}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.modalNumpadRow}>
              {['a','b','c','d','e','f'].map(k => (
                <TouchableOpacity key={`let-${k}`} style={styles.modalNumpadKey} onPress={() => handleActiveNumpadPress(modalNumpadCaps ? k.toUpperCase() : k)}>
                  <Text style={styles.modalNumpadKeyText}>{modalNumpadCaps ? k.toUpperCase() : k}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.modalNumpadRow}>
              {['g','h','i','j','k','l','m'].map(k => (
                <TouchableOpacity key={`let-${k}`} style={styles.modalNumpadKey} onPress={() => handleActiveNumpadPress(modalNumpadCaps ? k.toUpperCase() : k)}>
                  <Text style={styles.modalNumpadKeyText}>{modalNumpadCaps ? k.toUpperCase() : k}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.modalNumpadRow}>
              {['n','o','p','q','r','s'].map(k => (
                <TouchableOpacity key={`let-${k}`} style={styles.modalNumpadKey} onPress={() => handleActiveNumpadPress(modalNumpadCaps ? k.toUpperCase() : k)}>
                  <Text style={styles.modalNumpadKeyText}>{modalNumpadCaps ? k.toUpperCase() : k}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.modalNumpadRow}>
              {['t','u','v','w','x','y'].map(k => (
                <TouchableOpacity key={`let-${k}`} style={styles.modalNumpadKey} onPress={() => handleActiveNumpadPress(modalNumpadCaps ? k.toUpperCase() : k)}>
                  <Text style={styles.modalNumpadKeyText}>{modalNumpadCaps ? k.toUpperCase() : k}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.modalNumpadRow}>
              {['z','ä','ö','ü','ß','-'].map(k => (
                <TouchableOpacity key={`let-${k}`} style={styles.modalNumpadKey} onPress={() => handleActiveNumpadPress(modalNumpadCaps ? (k === 'ß' ? 'ẞ' : k.toUpperCase()) : k)}>
                  <Text style={styles.modalNumpadKeyText}>{modalNumpadCaps ? (k === 'ß' ? 'ẞ' : k.toUpperCase()) : k}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.modalNumpadRow}>
              <TouchableOpacity style={[styles.modalNumpadKey, styles.modalNumpadMode]} onPress={() => setModalNumpadMode('numbers')}>
                <Text style={styles.modalNumpadModeText}>123</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalNumpadKey, modalNumpadCaps && styles.modalNumpadCapsActive]} onPress={() => setModalNumpadCaps(!modalNumpadCaps)}>
                <Ionicons name="arrow-up" size={18} color={modalNumpadCaps ? '#fff' : '#666'} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalNumpadKey} onPress={() => handleActiveNumpadPress(' ')}>
                <Text style={styles.modalNumpadKeyText}>{"␣"}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalNumpadKey, styles.modalNumpadDel]} onPress={() => handleActiveNumpadPress('⌫')}>
                <Ionicons name="backspace-outline" size={18} color="#f44336" />
              </TouchableOpacity>
            </View>
          </>
        )}
      </Animated.View>
    );
  };
  
  const insertMeasurementAsText = () => {
    const result = calculateMeasurementExpression(measurementExpression);
    if (result === null) {
      Alert.alert('Fehler', 'Ungültiger Rechenausdruck');
      return;
    }
    // Formatiere den Text
    const formattedExpr = measurementExpression.replace(/\./g, ',').replace(/\*/g, '×');
    const displayText = `${formattedExpr} = ${result.toString().replace('.', ',')} ${measurementUnit}`;
    
    // Füge als Text-Element in die Skizze ein
    const newElement: DrawElement = {
      id: Date.now().toString(),
      type: 'text',
      x: 100,
      y: 100,
      data: { text: displayText },
      color: '#1976d2',
      strokeWidth: 1,
      fontSize: 16,
      fontWeight: 'bold',
      fontStyle: 'normal',
      fontFamily: 'sans-serif',
    };
    
    const newElements = [...elements, newElement];
    addToHistory(newElements);
    setSelectedElementId(newElement.id);
    setDrawMode('select');
    
    // Aufmaß-Tool schließen
    setShowMeasurementTool(false);
    setMeasurementExpression('');
  };
  
  // Modals
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showTextModal, setShowTextModal] = useState(false);
  const [showArrowModal, setShowArrowModal] = useState(false);
  const [showPointerModal, setShowPointerModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showEditArrowModal, setShowEditArrowModal] = useState(false);
  const [showEditTextModal, setShowEditTextModal] = useState(false);
  const [showEditPointerModal, setShowEditPointerModal] = useState(false);
  const [showNotesModal, setShowNotesModal] = useState(false);
  const [textInput, setTextInput] = useState('');
  const [arrowText, setArrowText] = useState('');
  const [arrowHeads, setArrowHeads] = useState<'single' | 'double'>('double');
  const [pointerText, setPointerText] = useState('');
  
  // Edit state for text and arrow
  const [editFontSize, setEditFontSize] = useState(20);
  const [editStrokeWidth, setEditStrokeWidth] = useState(3);
  const [editFontWeight, setEditFontWeight] = useState<'normal' | 'bold'>('bold');
  const [editFontStyle, setEditFontStyle] = useState<'normal' | 'italic'>('normal');
  const [editFontFamily, setEditFontFamily] = useState<FontFamily>('System');
  const [editArrowFontSize, setEditArrowFontSize] = useState(12);
  const [editArrowStrokeWidth, setEditArrowStrokeWidth] = useState(3);
  const [editPointerFontSize, setEditPointerFontSize] = useState(12);
  const [editPointerStrokeWidth, setEditPointerStrokeWidth] = useState(3);
  
  // Zuletzt verwendete Text-Einstellungen (werden gespeichert)
  const [lastTextFontSize, setLastTextFontSize] = useState(20);
  const [lastTextColor, setLastTextColor] = useState('#000000');
  const [lastTextFontFamily, setLastTextFontFamily] = useState<FontFamily>('System');

  // Tool-Größen aus AsyncStorage laden beim Start
  useEffect(() => {
    const loadToolSizes = async () => {
      try {
        const savedSizes = await AsyncStorage.getItem(TOOL_SIZES_KEY);
        if (savedSizes) {
          const sizes = JSON.parse(savedSizes);
          if (sizes.editPointerFontSize) setEditPointerFontSize(sizes.editPointerFontSize);
          if (sizes.editPointerStrokeWidth) setEditPointerStrokeWidth(sizes.editPointerStrokeWidth);
          if (sizes.editMemoFontSize) setEditMemoFontSize(sizes.editMemoFontSize);
          if (sizes.editArrowStrokeWidth) setEditArrowStrokeWidth(sizes.editArrowStrokeWidth);
          if (sizes.editArrowFontSize) setEditArrowFontSize(sizes.editArrowFontSize);
          if (sizes.strokeWidth) setStrokeWidth(sizes.strokeWidth);
          // Text-Einstellungen laden
          if (sizes.lastTextFontSize) setLastTextFontSize(sizes.lastTextFontSize);
          if (sizes.lastTextColor) setLastTextColor(sizes.lastTextColor);
          if (sizes.lastTextFontFamily) setLastTextFontFamily(sizes.lastTextFontFamily);
        }
      } catch (error) {
        console.log('Error loading tool sizes:', error);
      }
    };
    loadToolSizes();
  }, []);

  // Tool-Größen in AsyncStorage speichern bei Änderung
  const saveToolSizes = useCallback(async (key: string, value: number) => {
    try {
      const savedSizes = await AsyncStorage.getItem(TOOL_SIZES_KEY);
      const sizes = savedSizes ? JSON.parse(savedSizes) : {};
      sizes[key] = value;
      await AsyncStorage.setItem(TOOL_SIZES_KEY, JSON.stringify(sizes));
    } catch (error) {
      console.log('Error saving tool sizes:', error);
    }
  }, []);

  // Wrapper-Funktionen für die Setter mit Speicherung
  const updateEditPointerFontSize = useCallback((value: number) => {
    setEditPointerFontSize(value);
    saveToolSizes('editPointerFontSize', value);
  }, [saveToolSizes]);

  const updateEditPointerStrokeWidth = useCallback((value: number) => {
    setEditPointerStrokeWidth(value);
    saveToolSizes('editPointerStrokeWidth', value);
  }, [saveToolSizes]);

  const updateEditMemoFontSize = useCallback((value: number) => {
    setEditMemoFontSize(value);
    saveToolSizes('editMemoFontSize', value);
  }, [saveToolSizes]);

  const updateStrokeWidth = useCallback((value: number) => {
    setStrokeWidth(value);
    saveToolSizes('strokeWidth', value);
  }, [saveToolSizes]);

  const updateEditArrowStrokeWidth = useCallback((value: number) => {
    setEditArrowStrokeWidth(value);
    saveToolSizes('editArrowStrokeWidth', value);
  }, [saveToolSizes]);

  const updateEditArrowFontSize = useCallback((value: number) => {
    setEditArrowFontSize(value);
    saveToolSizes('editArrowFontSize', value);
  }, [saveToolSizes]);

  // Update-Funktionen für Text-Einstellungen
  const updateLastTextFontSize = useCallback((value: number) => {
    setLastTextFontSize(value);
    saveToolSizes('lastTextFontSize', value);
  }, [saveToolSizes]);

  const updateLastTextColor = useCallback((value: string) => {
    setLastTextColor(value);
    const saveColor = async () => {
      try {
        const savedSizes = await AsyncStorage.getItem(TOOL_SIZES_KEY);
        const sizes = savedSizes ? JSON.parse(savedSizes) : {};
        sizes.lastTextColor = value;
        await AsyncStorage.setItem(TOOL_SIZES_KEY, JSON.stringify(sizes));
      } catch (error) {
        console.log('Error saving text color:', error);
      }
    };
    saveColor();
  }, []);

  const updateLastTextFontFamily = useCallback((value: FontFamily) => {
    setLastTextFontFamily(value);
    const saveFont = async () => {
      try {
        const savedSizes = await AsyncStorage.getItem(TOOL_SIZES_KEY);
        const sizes = savedSizes ? JSON.parse(savedSizes) : {};
        sizes.lastTextFontFamily = value;
        await AsyncStorage.setItem(TOOL_SIZES_KEY, JSON.stringify(sizes));
      } catch (error) {
        console.log('Error saving font family:', error);
      }
    };
    saveFont();
  }, []);
  
  // Double tap detection
  const lastTapRef = useRef<{ time: number; elementId: string | null }>({ time: 0, elementId: null });
  
  // No longer using background image - images are now elements
  const [backgroundImage, setBackgroundImage] = useState<string | null>(null);

  // Generate unique ID
  const generateId = () => `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  // Add initial image from route params as an element
  useEffect(() => {
    const addImageElement = (imageUri: string) => {
      if (initialImageAdded.current) return;
      initialImageAdded.current = true;
      
      // Berechne korrektes Seitenverhältnis des Bildes
      RNImage.getSize(
        imageUri,
        (imgWidth, imgHeight) => {
          // Maximale Größe im Canvas (mit etwas Padding)
          const maxWidth = width - 40;
          const maxHeight = (height - 160) * 0.8;
          const aspectRatio = imgWidth / imgHeight;
          
          let finalWidth, finalHeight;
          if (aspectRatio > maxWidth / maxHeight) {
            // Bild ist breiter - begrenzen durch Breite
            finalWidth = maxWidth;
            finalHeight = maxWidth / aspectRatio;
          } else {
            // Bild ist höher - begrenzen durch Höhe
            finalHeight = maxHeight;
            finalWidth = maxHeight * aspectRatio;
          }
          
          const imageElement: DrawElement = {
            id: generateId(),
            type: 'image',
            data: { uri: imageUri },
            color: '#000000',
            strokeWidth: 0,
            x: 20,
            y: 20,
            width: finalWidth,
            height: finalHeight,
            rotation: 0,
          };
          
          setElements([imageElement]);
          setHistory([[imageElement]]);
          setHistoryIndex(0);
          setSelectedElementId(imageElement.id);
          // Automatisch Foto-Bearbeiten Modus aktivieren
          setPhotoEditMode(true);
          setDrawMode('select');
        },
        (error) => {
          console.error('Error getting image size:', error);
          // Fallback: Verwende Standardgrößen
          const imageElement: DrawElement = {
            id: generateId(),
            type: 'image',
            data: { uri: imageUri },
            color: '#000000',
            strokeWidth: 0,
            x: 20,
            y: 20,
            width: width - 40,
            height: (height - 160) * 0.8,
            rotation: 0,
          };
          
          setElements([imageElement]);
          setHistory([[imageElement]]);
          setHistoryIndex(0);
          setSelectedElementId(imageElement.id);
          setPhotoEditMode(true);
          setDrawMode('select');
        }
      );
    };

    // Option 1: Load from photoId (fast - loads from LocalStorage)
    if (photoId && !initialImageAdded.current && !sketchId) {
      PhotoService.getById(photoId).then(photo => {
        if (photo) {
          const imageUri = (photo as any).image_data || photo.uri;
          addImageElement(imageUri);
        }
      });
    }
    // Option 2: Load from backgroundImageUri (legacy - passed via URL)
    else if (backgroundImageUri && !initialImageAdded.current && !sketchId) {
      const decodedUri = decodeURIComponent(backgroundImageUri);
      addImageElement(decodedUri);
    }
  }, [backgroundImageUri, photoId, sketchId]);

  // Load existing sketch when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      console.log('useFocusEffect triggered, sketchId:', sketchId, 'lastLoaded:', lastLoadedSketchId.current);
      
      // IMMER den State für die aktuelle Skizze initialisieren
      // Dies verhindert, dass alte Daten aus vorherigen Skizzen angezeigt werden
      const resetToCleanState = () => {
        console.log('Resetting to clean state for new/different sketch');
        setLineSegmentMeasurements({});
        setSelectedLineSegment(null);
        setElements([]);
        setHistory([[]]);
        setHistoryIndex(0);
        setTitle('Neue Skizze');
        setBackgroundImage(null);
        setTotalLfmBoxPositions({}); // Reset alle Summenbox-Positionen
        setLegendPosition({ x: 0, y: 0 }); // Reset Legend-Position
        legendPan.setValue({ x: 0, y: 0 }); // Reset Pan-Animation
        initialImageAdded.current = false;
      };
      
      // Prüfen, ob sich die Skizze geändert hat
      if (lastLoadedSketchId.current !== sketchId) {
        console.log('Sketch ID changed from', lastLoadedSketchId.current, 'to', sketchId);
        
        // Immer zuerst reset, dann laden falls nötig
        resetToCleanState();
        lastLoadedSketchId.current = sketchId;
        
        // Existierende Skizze laden, wenn vorhanden
        if (sketchId) {
          console.log('useFocusEffect: Loading sketch', sketchId);
          loadSketch();
        }
      } else if (sketchId && lastLoadedSketchId.current === sketchId) {
        // Gleiche Skizze, nur neu fokussiert - neu laden falls nötig
        console.log('useFocusEffect: Re-focused on same sketch', sketchId);
      }
    }, [sketchId])
  );

  const loadSketch = async () => {
    try {
      setLoading(true);
      console.log('Loading sketch with ID:', sketchId, 'for project:', projectId);
      const sketches = await SketchService.getByProjectId(projectId);
      console.log('All sketches:', sketches);
      const sketch = sketches.find((s: any) => s.id === sketchId);
      console.log('Found sketch:', sketch);
      
      if (sketch) {
        setTitle(sketch.title || 'Skizze');
        
        // Load notes if available
        if (sketch.notes) {
          setNotes(sketch.notes);
        }
        
        // Load PDF size if available
        if ((sketch as any).pdf_size) {
          setPdfSize((sketch as any).pdf_size);
        }
        
        // Parse saved elements if available
        if (sketch.metadata) {
          try {
            console.log('Parsing metadata:', sketch.metadata);
            const metadata = JSON.parse(sketch.metadata);
            console.log('Parsed metadata:', metadata);
            if (metadata.elements && Array.isArray(metadata.elements)) {
              console.log('Setting elements:', metadata.elements.length, 'elements');
              setElements(metadata.elements);
              setHistory([metadata.elements]);
              setHistoryIndex(0);
            } else {
              console.log('No elements in metadata');
            }
            if (metadata.backgroundImage) {
              setBackgroundImage(metadata.backgroundImage);
            }
            // Lade die Linien-Maße wenn vorhanden, sonst zurücksetzen
            if (metadata.lineSegmentMeasurements) {
              console.log('Loading lineSegmentMeasurements:', metadata.lineSegmentMeasurements);
              setLineSegmentMeasurements(metadata.lineSegmentMeasurements);
            } else {
              setLineSegmentMeasurements({});
            }
            // Summenbox-Positionen laden wenn vorhanden (pro Element)
            if (metadata.totalLfmBoxPositions) {
              console.log('Loading totalLfmBoxPositions:', metadata.totalLfmBoxPositions);
              setTotalLfmBoxPositions(metadata.totalLfmBoxPositions);
            } else {
              // Keine gespeicherte Positionen - auf Standard zurücksetzen
              setTotalLfmBoxPositions({});
            }
            // Legend-Position laden wenn vorhanden
            if (metadata.legendPosition) {
              console.log('Loading legendPosition:', metadata.legendPosition);
              setLegendPosition(metadata.legendPosition);
              legendPan.setValue(metadata.legendPosition);
            } else {
              // Keine gespeicherte Position - auf Standard zurücksetzen
              setLegendPosition({ x: 0, y: 0 });
              legendPan.setValue({ x: 0, y: 0 });
            }
            // Label-Offsets laden wenn vorhanden
            if (metadata.labelOffsets) {
              console.log('Loading labelOffsets:', metadata.labelOffsets);
              setLabelOffsets(metadata.labelOffsets);
            } else {
              setLabelOffsets({});
            }
          } catch (e) {
            console.error('Error parsing metadata:', e);
          }
        } else {
          console.log('No metadata in sketch');
        }
      } else {
        console.log('Sketch not found in response');
      }
    } catch (error) {
      console.error('Error loading sketch:', error);
      showAlert('Fehler', 'Skizze konnte nicht geladen werden');
    } finally {
      setLoading(false);
    }
  };

  const showAlert = (title: string, message: string) => {
    if (Platform.OS === 'web') {
      alert(`${title}: ${message}`);
    } else {
      Alert.alert(title, message);
    }
  };

  // History management (Undo/Redo)
  const addToHistory = (newElements: DrawElement[]) => {
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(newElements);
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
    setElements(newElements);
  };

  const undo = () => {
    if (historyIndex > 0) {
      setHistoryIndex(historyIndex - 1);
      setElements(history[historyIndex - 1]);
      setSelectedElementId(null);
    }
  };

  const redo = () => {
    if (historyIndex < history.length - 1) {
      setHistoryIndex(historyIndex + 1);
      setElements(history[historyIndex + 1]);
      setSelectedElementId(null);
    }
  };

  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < history.length - 1;

  // Handle back button - auto save before navigating back
  const handleBackPress = async () => {
    // Nur auto-speichern wenn wir die aktuelle Skizze bearbeiten (nicht beim Reset)
    const currentSketchId = lastLoadedSketchId.current;
    
    // Only auto-save if there are elements to save AND we're still on the same sketch
    if (elements.length > 0 && currentSketchId === sketchId) {
      try {
        setLoading(true);
        
        // Create metadata with elements and canvas dimensions for proper scaling
        const metadata = {
          elements,
          backgroundImage,
          canvasWidth: width,
          canvasHeight: height - 120,
          lineSegmentMeasurements,
          totalLfmBoxPositions, // Speichere alle Summenbox-Positionen pro Element
          legendPosition, // Speichere Position der Übersicht-Legend
          notes, // Speichere die Notizen auch in metadata
        };

        console.log('Auto-saving sketch with', elements.length, 'elements');
        console.log('Saving legendPosition:', legendPosition);
        console.log('Saving notes:', notes);

        // Generate preview image
        let sketchData = '';
        
        if (elements.length > 0) {
          try {
            sketchData = generatePreviewSvg();
          } catch (previewError) {
            console.error('Error generating preview:', previewError);
          }
        }
        
        if (!sketchData && backgroundImage) {
          sketchData = backgroundImage;
        }
        
        if (!sketchData) {
          const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DFE6E9'];
          const colorIndex = elements.length % colors.length;
          const previewColor = colors[colorIndex];
          
          const previewSvg = `
            <svg width="200" height="200" xmlns="http://www.w3.org/2000/svg">
              <rect width="200" height="200" fill="${previewColor}" opacity="0.3"/>
              <text x="100" y="100" text-anchor="middle" font-size="24" fill="#333">
                ${elements.length} Element${elements.length !== 1 ? 'e' : ''}
              </text>
              <text x="100" y="130" text-anchor="middle" font-size="14" fill="#666">
                ${title || 'Skizze'}
              </text>
            </svg>
          `;
          
          sketchData = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(previewSvg)))}`;
        }

        if (sketchId) {
          // Update existing sketch
          await SketchService.update(sketchId, {
            project_id: projectId,
            title,
            notes, // Speichere die Notizen direkt in der Skizze
            sketch_data: sketchData,
            metadata: JSON.stringify(metadata),
            pdf_size: pdfSize,
          });
          console.log('Auto-saved existing sketch');
        } else if (title.trim()) {
          // Create new sketch only if title is provided
          await SketchService.create({
            project_id: projectId,
            title,
            notes, // Speichere die Notizen direkt in der Skizze
            sketch_data: sketchData,
            metadata: JSON.stringify(metadata),
            pdf_size: pdfSize,
          });
          console.log('Auto-saved new sketch');
        }
      } catch (error) {
        console.error('Error auto-saving sketch:', error);
      } finally {
        setLoading(false);
      }
    }
    
    // Navigate back to project details with sketches tab
    if (projectId) {
      router.replace(`/projects/${projectId}?tab=sketches`);
    } else {
      router.replace('/');
    }
  };

  // Delete selected element
  const deleteSelectedElement = () => {
    if (selectedElementId) {
      const newElements = elements.filter(el => el.id !== selectedElementId);
      addToHistory(newElements);
      
      // Auch die Maße für dieses Element löschen
      if (lineSegmentMeasurements[selectedElementId]) {
        setLineSegmentMeasurements(prev => {
          const newMeasurements = { ...prev };
          delete newMeasurements[selectedElementId];
          return newMeasurements;
        });
      }
      
      setSelectedElementId(null);
      setShowDeleteConfirm(false);
    }
  };

  // Move selected element to front (top of the stack)
  const bringToFront = () => {
    if (selectedElementId) {
      const element = elements.find(el => el.id === selectedElementId);
      if (element) {
        const newElements = elements.filter(el => el.id !== selectedElementId);
        newElements.push(element);
        addToHistory(newElements);
      }
    }
  };

  // Move selected element to back (bottom of the stack)
  const sendToBack = () => {
    if (selectedElementId) {
      const element = elements.find(el => el.id === selectedElementId);
      if (element) {
        const newElements = elements.filter(el => el.id !== selectedElementId);
        newElements.unshift(element);
        addToHistory(newElements);
      }
    }
  };

  // Zuschneiden-Modus starten
  const startCropMode = () => {
    const selectedEl = elements.find(el => el.id === selectedElementId);
    if (selectedEl && selectedEl.type === 'image' && selectedEl.data?.uri) {
      setCropImageUri(selectedEl.data.uri);
      setCropImageId(selectedEl.id);
      // Lade die Original-Bildgröße
      RNImage.getSize(
        selectedEl.data.uri,
        (imgWidth, imgHeight) => {
          setCropImageDimensions({ width: imgWidth, height: imgHeight });
          // Initiale Crop-Box = 80% des Bildes, zentriert
          const boxWidth = Math.min(imgWidth * 0.8, 280);
          const boxHeight = Math.min(imgHeight * 0.8, 280);
          setCropBox({
            x: (300 - boxWidth) / 2,
            y: (300 - boxHeight) / 2,
            width: boxWidth,
            height: boxHeight,
          });
          setShowCropModal(true);
        },
        (error) => {
          console.error('Error getting image size:', error);
          // Fallback
          setCropImageDimensions({ width: 300, height: 300 });
          setCropBox({ x: 30, y: 30, width: 240, height: 240 });
          setShowCropModal(true);
        }
      );
    } else {
      Alert.alert('Hinweis', 'Bitte wählen Sie zuerst ein Bild aus.');
    }
  };

  // Handler für Crop-Modus Touch - sucht Bild an Position und öffnet Modal
  const handleCropModeTouch = (locationX: number, locationY: number) => {
    // Suche nach einem Bild an dieser Position (onlyImages = true)
    const clickedImage = findElementAtPoint(locationX, locationY, true);
    
    if (clickedImage && clickedImage.type === 'image' && clickedImage.data?.uri) {
      // Bild gefunden - Crop-Modal öffnen
      setCropImageUri(clickedImage.data.uri);
      setCropImageId(clickedImage.id);
      
      // Lade die Original-Bildgröße
      RNImage.getSize(
        clickedImage.data.uri,
        (imgWidth, imgHeight) => {
          setCropImageDimensions({ width: imgWidth, height: imgHeight });
          // Initiale Crop-Box = 80% des Bildes, zentriert
          const boxWidth = Math.min(imgWidth * 0.8, 280);
          const boxHeight = Math.min(imgHeight * 0.8, 280);
          setCropBox({
            x: (300 - boxWidth) / 2,
            y: (300 - boxHeight) / 2,
            width: boxWidth,
            height: boxHeight,
          });
          setShowCropModal(true);
        },
        (error) => {
          console.error('Error getting image size:', error);
          // Fallback
          setCropImageDimensions({ width: 300, height: 300 });
          setCropBox({ x: 30, y: 30, width: 240, height: 240 });
          setShowCropModal(true);
        }
      );
    } else {
      // Kein Bild an dieser Position - Hinweis zeigen
      Alert.alert('Hinweis', 'Tippen Sie auf ein Foto, um es zuzuschneiden.');
    }
  };

  // Zuschnitt anwenden
  const applyCrop = async () => {
    if (!cropImageUri || !cropImageId) return;
    
    try {
      // Berechne die tatsächliche Bildgröße im Container mit resizeMode="contain"
      const containerSize = 300;
      const imgWidth = cropImageDimensions.width;
      const imgHeight = cropImageDimensions.height;
      const imgAspect = imgWidth / imgHeight;
      const containerAspect = 1; // Container ist quadratisch (300x300)
      
      let displayedWidth: number, displayedHeight: number, offsetX: number, offsetY: number;
      
      if (imgAspect > containerAspect) {
        // Bild ist breiter als Container (Querformat) - volle Breite, zentriert vertikal
        displayedWidth = containerSize;
        displayedHeight = containerSize / imgAspect;
        offsetX = 0;
        offsetY = (containerSize - displayedHeight) / 2;
      } else {
        // Bild ist höher als Container (Hochformat) - volle Höhe, zentriert horizontal
        displayedHeight = containerSize;
        displayedWidth = containerSize * imgAspect;
        offsetX = (containerSize - displayedWidth) / 2;
        offsetY = 0;
      }
      
      // Skalierungsfaktor vom angezeigten Bild zum Originalbild (sollte für beide Achsen gleich sein bei contain)
      const scale = imgWidth / displayedWidth;
      
      // Crop-Box Koordinaten relativ zum angezeigten Bild (nicht zum Container!)
      // Begrenze auf den tatsächlichen Bildbereich
      const cropBoxRelativeX = Math.max(0, cropBox.x - offsetX);
      const cropBoxRelativeY = Math.max(0, cropBox.y - offsetY);
      const cropBoxRelativeWidth = Math.min(cropBox.width, displayedWidth - cropBoxRelativeX);
      const cropBoxRelativeHeight = Math.min(cropBox.height, displayedHeight - cropBoxRelativeY);
      
      // Umrechnung auf Original-Bildkoordinaten
      const cropOriginX = Math.max(0, Math.round(cropBoxRelativeX * scale));
      const cropOriginY = Math.max(0, Math.round(cropBoxRelativeY * scale));
      const cropWidth = Math.round(cropBoxRelativeWidth * scale);
      const cropHeight = Math.round(cropBoxRelativeHeight * scale);
      
      // Verwende ImageManipulator zum Zuschneiden
      const result = await ImageManipulator.manipulateAsync(
        cropImageUri,
        [
          {
            crop: {
              originX: cropOriginX,
              originY: cropOriginY,
              width: Math.min(cropWidth, cropImageDimensions.width - cropOriginX),
              height: Math.min(cropHeight, cropImageDimensions.height - cropOriginY),
            },
          },
        ],
        { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG, base64: true }
      );
      
      // Aktualisiere das Element mit dem zugeschnittenen Bild
      const croppedUri = `data:image/jpeg;base64,${result.base64}`;
      const newElements = elements.map(el => {
        if (el.id === cropImageId) {
          return {
            ...el,
            data: { uri: croppedUri },
            // Behalte Position und Größe bei
          };
        }
        return el;
      });
      
      addToHistory(newElements);
      setShowCropModal(false);
      setCropImageUri(null);
      setCropImageId(null);
      // Modus zurücksetzen nach erfolgreichem Zuschneiden
      setDrawMode('select');
    } catch (error) {
      console.error('Error cropping image:', error);
      Alert.alert('Fehler', 'Bild konnte nicht zugeschnitten werden');
    }
  };

  // Zuschneiden abbrechen
  const cancelCrop = () => {
    setShowCropModal(false);
    setCropImageUri(null);
    setCropImageId(null);
    // Modus zurücksetzen beim Abbrechen
    setDrawMode('select');
  };

  // PanResponder für Crop-Interaktion
  const getCropHandleAtPosition = (x: number, y: number): string | null => {
    const handleSize = 35; // Größerer Touch-Bereich für bessere Bedienbarkeit
    const box = cropBoxRef.current; // Verwende Ref für aktuellen Wert
    
    // Prüfe Ecken
    if (Math.abs(x - box.x) < handleSize && Math.abs(y - box.y) < handleSize) {
      return 'top-left';
    }
    if (Math.abs(x - (box.x + box.width)) < handleSize && Math.abs(y - box.y) < handleSize) {
      return 'top-right';
    }
    if (Math.abs(x - box.x) < handleSize && Math.abs(y - (box.y + box.height)) < handleSize) {
      return 'bottom-left';
    }
    if (Math.abs(x - (box.x + box.width)) < handleSize && Math.abs(y - (box.y + box.height)) < handleSize) {
      return 'bottom-right';
    }
    // Prüfe ob innerhalb der Box (zum Verschieben)
    if (x > box.x && x < box.x + box.width && y > box.y && y < box.y + box.height) {
      return 'move';
    }
    return null;
  };

  const cropPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => {
        const { pageX, pageY } = evt.nativeEvent;
        
        // Berechne Position relativ zum Container
        cropContainerRef.current?.measure((fx, fy, width, height, px, py) => {
          const localX = pageX - px;
          const localY = pageY - py;
          
          const handle = getCropHandleAtPosition(localX, localY);
          activeCropHandle.current = handle;
          cropStartPos.current = { x: pageX, y: pageY };
          cropStartBox.current = { ...cropBoxRef.current }; // Verwende Ref
        });
      },
      onPanResponderMove: (evt) => {
        if (!activeCropHandle.current) return;
        
        const { pageX, pageY } = evt.nativeEvent;
        const dx = pageX - cropStartPos.current.x;
        const dy = pageY - cropStartPos.current.y;
        const minSize = 50;
        const maxSize = 300;
        
        let newBox = { ...cropStartBox.current };
        
        switch (activeCropHandle.current) {
          case 'move':
            newBox.x = Math.max(0, Math.min(maxSize - cropStartBox.current.width, cropStartBox.current.x + dx));
            newBox.y = Math.max(0, Math.min(maxSize - cropStartBox.current.height, cropStartBox.current.y + dy));
            break;
          case 'top-left':
            newBox.x = Math.max(0, Math.min(cropStartBox.current.x + cropStartBox.current.width - minSize, cropStartBox.current.x + dx));
            newBox.y = Math.max(0, Math.min(cropStartBox.current.y + cropStartBox.current.height - minSize, cropStartBox.current.y + dy));
            newBox.width = cropStartBox.current.x + cropStartBox.current.width - newBox.x;
            newBox.height = cropStartBox.current.y + cropStartBox.current.height - newBox.y;
            break;
          case 'top-right':
            newBox.y = Math.max(0, Math.min(cropStartBox.current.y + cropStartBox.current.height - minSize, cropStartBox.current.y + dy));
            newBox.width = Math.max(minSize, Math.min(maxSize - cropStartBox.current.x, cropStartBox.current.width + dx));
            newBox.height = cropStartBox.current.y + cropStartBox.current.height - newBox.y;
            break;
          case 'bottom-left':
            newBox.x = Math.max(0, Math.min(cropStartBox.current.x + cropStartBox.current.width - minSize, cropStartBox.current.x + dx));
            newBox.width = cropStartBox.current.x + cropStartBox.current.width - newBox.x;
            newBox.height = Math.max(minSize, Math.min(maxSize - cropStartBox.current.y, cropStartBox.current.height + dy));
            break;
          case 'bottom-right':
            newBox.width = Math.max(minSize, Math.min(maxSize - cropStartBox.current.x, cropStartBox.current.width + dx));
            newBox.height = Math.max(minSize, Math.min(maxSize - cropStartBox.current.y, cropStartBox.current.height + dy));
            break;
        }
        
        setCropBox(newBox);
      },
      onPanResponderRelease: () => {
        activeCropHandle.current = null;
      },
    })
  ).current;

  // Clear all - auch Maße und Summenbox-Positionen zurücksetzen
  const clearAll = () => {
    addToHistory([]);
    setSelectedElementId(null);
    setLineSegmentMeasurements({});
    setSelectedLineSegment(null);
    // Alle Summenbox-Positionen zurücksetzen
    setTotalLfmBoxPositions({});
  };

  // Background image
  const pickBackgroundImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 0.8,
        base64: true,
      });

      if (!result.canceled && result.assets[0].base64) {
        const base64Image = `data:image/jpeg;base64,${result.assets[0].base64}`;
        setBackgroundImage(base64Image);
      }
    } catch (error) {
      console.error('Error picking image:', error);
      showAlert('Fehler', 'Bild konnte nicht ausgewählt werden');
    }
  };

  const takeBackgroundPhoto = async () => {
    try {
      if (Platform.OS !== 'web') {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') {
          showAlert('Berechtigung erforderlich', 'Kamera-Zugriff wird benötigt');
          return;
        }
      }

      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: false,
        quality: 0.8,
        base64: true,
      });

      if (!result.canceled && result.assets[0].base64) {
        const base64Image = `data:image/jpeg;base64,${result.assets[0].base64}`;
        setBackgroundImage(base64Image);
      }
    } catch (error) {
      console.error('Error taking photo:', error);
      showAlert('Fehler', 'Foto konnte nicht aufgenommen werden');
    }
  };

  // Insert image on canvas
  const insertImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 0.7,
        base64: true,
      });

      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        const base64Image = asset.base64 ? `data:image/jpeg;base64,${asset.base64}` : asset.uri;
        
        // Berechne korrektes Seitenverhältnis des Bildes
        const imgWidth = asset.width || 200;
        const imgHeight = asset.height || 200;
        const maxWidth = 400;
        const maxHeight = 300;
        const aspectRatio = imgWidth / imgHeight;
        
        let finalWidth, finalHeight;
        if (aspectRatio > maxWidth / maxHeight) {
          // Bild ist breiter - begrenzen durch Breite
          finalWidth = maxWidth;
          finalHeight = maxWidth / aspectRatio;
        } else {
          // Bild ist höher - begrenzen durch Höhe
          finalHeight = maxHeight;
          finalWidth = maxHeight * aspectRatio;
        }
        
        const newElement: DrawElement = {
          id: generateId(),
          type: 'image',
          data: { uri: base64Image },
          color: '#000000',
          strokeWidth: 0,
          x: 100,
          y: 100,
          width: finalWidth,
          height: finalHeight,
          rotation: 0,
        };
        const newElements = [...elements, newElement];
        addToHistory(newElements);
        // Automatisch Foto-Bearbeiten Modus aktivieren
        setSelectedElementId(newElement.id);
        setPhotoEditMode(true);
        selectDrawMode('select');
      }
    } catch (error) {
      console.error('Error inserting image:', error);
      showAlert('Fehler', 'Bild konnte nicht eingefügt werden');
    }
  };

  // Import document/image from Files app
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
          // Generiere Thumbnail der ersten Seite
          const { uri, width, height } = await PdfThumbnail.generate(fileUri, 0);
          console.log('[importFromFiles] PDF converted successfully:', uri, width, height);
          
          await insertImageFromUri(uri);
          return;
        } catch (pdfError) {
          console.error('[importFromFiles] PDF conversion error:', pdfError);
          // Fallback: Zeige Info-Meldung wenn Konvertierung fehlschlägt
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
        await insertImageFromUri(fileUri);
      } else {
        showAlert('Fehler', 'Dieser Dateityp wird nicht unterstützt. Bitte wählen Sie ein Bild (JPG, PNG, etc.) oder PDF.');
      }
    } catch (error) {
      console.error('Error importing from files:', error);
      showAlert('Fehler', 'Datei konnte nicht importiert werden');
    }
  };

  // Import only images from Files
  const importImageFromFiles = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['image/*'],
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) {
        return;
      }

      const file = result.assets[0];
      await insertImageFromUri(file.uri);
    } catch (error) {
      console.error('Error importing image from files:', error);
      showAlert('Fehler', 'Bild konnte nicht importiert werden');
    }
  };

  // Helper function to insert image from URI
  const insertImageFromUri = async (uri: string) => {
    try {
      // Manipulate image to get base64
      const manipResult = await ImageManipulator.manipulateAsync(
        uri,
        [{ resize: { width: 1200 } }],
        { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG, base64: true }
      );

      if (!manipResult.base64) {
        throw new Error('Konnte kein Base64 generieren');
      }

      const base64Image = `data:image/jpeg;base64,${manipResult.base64}`;
      
      // Berechne Seitenverhältnis
      const imgWidth = manipResult.width || 200;
      const imgHeight = manipResult.height || 200;
      const maxWidth = 400;
      const maxHeight = 300;
      const aspectRatio = imgWidth / imgHeight;
      
      let finalWidth, finalHeight;
      if (aspectRatio > maxWidth / maxHeight) {
        finalWidth = maxWidth;
        finalHeight = maxWidth / aspectRatio;
      } else {
        finalHeight = maxHeight;
        finalWidth = maxHeight * aspectRatio;
      }
      
      const newElement: DrawElement = {
        id: generateId(),
        type: 'image',
        data: { uri: base64Image },
        color: '#000000',
        strokeWidth: 0,
        x: 100,
        y: 100,
        width: finalWidth,
        height: finalHeight,
        rotation: 0,
      };
      const newElements = [...elements, newElement];
      addToHistory(newElements);
      setSelectedElementId(newElement.id);
      setPhotoEditMode(true);
      selectDrawMode('select');
      
      showAlert('Erfolg', 'Bild wurde eingefügt');
    } catch (error) {
      console.error('Error inserting image from URI:', error);
      showAlert('Fehler', 'Bild konnte nicht eingefügt werden');
    }
  };

  // Take photo and insert on canvas
  const takePhotoAndInsert = async () => {
    try {
      if (Platform.OS !== 'web') {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') {
          showAlert('Berechtigung erforderlich', 'Kamera-Zugriff wird benötigt');
          return;
        }
      }

      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: false,
        quality: 0.7,
        base64: true,
      });

      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        const base64Image = asset.base64 ? `data:image/jpeg;base64,${asset.base64}` : asset.uri;
        
        // Berechne korrektes Seitenverhältnis des Bildes
        const imgWidth = asset.width || 250;
        const imgHeight = asset.height || 250;
        const maxWidth = 400;
        const maxHeight = 300;
        const aspectRatio = imgWidth / imgHeight;
        
        let finalWidth, finalHeight;
        if (aspectRatio > maxWidth / maxHeight) {
          // Bild ist breiter - begrenzen durch Breite
          finalWidth = maxWidth;
          finalHeight = maxWidth / aspectRatio;
        } else {
          // Bild ist höher - begrenzen durch Höhe
          finalHeight = maxHeight;
          finalWidth = maxHeight * aspectRatio;
        }
        
        const newElement: DrawElement = {
          id: generateId(),
          type: 'image',
          data: { uri: base64Image },
          color: '#000000',
          strokeWidth: 0,
          x: 100,
          y: 100,
          width: finalWidth,
          height: finalHeight,
          rotation: 0,
        };
        const newElements = [...elements, newElement];
        addToHistory(newElements);
        // Automatisch Foto-Bearbeiten Modus aktivieren
        setSelectedElementId(newElement.id);
        setPhotoEditMode(true);
        selectDrawMode('select');
      }
    } catch (error) {
      console.error('Error taking photo:', error);
      showAlert('Fehler', 'Foto konnte nicht aufgenommen werden');
    }
  };

  // Touch handlers
  // Hilfsfunktion: Berechnet die Canvas-Koordinaten aus Touch-Event
  // locationX/Y sind relativ zum inneren View (dem Canvas-Container)
  // Bei einem gezoomten ScrollView sind diese Koordinaten bereits in Canvas-Koordinaten!
  // Der scrollOffset wird benötigt, um die Position des sichtbaren Ausschnitts zu berücksichtigen
  const onTouchStart = (event: any) => {
    // Im Zoom-Modus keine Zeichnung
    if (zoomMode) return;
    
    const touch = event.nativeEvent.touches ? event.nativeEvent.touches[0] : event.nativeEvent;
    // Die locationX/Y sind relativ zum inneren View (Canvas-Container)
    // Bei gezoomter ScrollView: Der innere View wird NICHT skaliert, nur die ScrollView zoomt
    // Das bedeutet: locationX ist bereits in Canvas-Koordinaten!
    // Wir müssen nur den scrollOffset berücksichtigen (in Content/Canvas-Koordinaten)
    const locationX = touch.locationX || touch.pageX;
    const locationY = touch.locationY || touch.pageY;

    if (drawMode === 'select') {
      handleSelectTouchStart(locationX, locationY);
    } else if (drawMode === 'crop') {
      // Im Crop-Modus: Suche nach einem Bild an dieser Position
      handleCropModeTouch(locationX, locationY);
    } else if (drawMode === 'text') {
      // Show text input modal
      setPendingPosition({ x: locationX, y: locationY });
      setShowTextModal(true);
    } else if (drawMode === 'pen') {
      // Initialisiere sowohl Ref (für Performance) als auch State (für Rendering)
      const pathStart = `M ${locationX} ${locationY}`;
      currentPathRef.current = pathStart;
      drawPointCountRef.current = 0;
      setCurrentPath(pathStart);
    } else if (drawMode === 'polygon') {
      // Start polygon drawing
      setCurrentPath(`M ${locationX} ${locationY}`);
    } else if (drawMode === 'polyline') {
      // Polyline: Füge Punkt hinzu
      const newPoint = { x: locationX, y: locationY };
      
      // Prüfe ob wir nahe am ersten Punkt sind (schließen)
      if (polylinePoints.length >= 3) {
        const firstPoint = polylinePoints[0];
        const distance = Math.sqrt(
          Math.pow(locationX - firstPoint.x, 2) + 
          Math.pow(locationY - firstPoint.y, 2)
        );
        
        if (distance < 30) {
          // Schließe die Polyline als geschlossenen Grundriss
          finishPolyline(true);
          return;
        }
      }
      
      setPolylinePoints([...polylinePoints, newPoint]);
    } else if (drawMode === 'addPoint') {
      // addPoint Modus: Punkt zu bestehender Polyline hinzufügen
      handleAddPointTouch(locationX, locationY);
    } else if (drawMode === 'removePoint') {
      // removePoint Modus: Punkt aus bestehender Polyline entfernen
      handleRemovePointTouch(locationX, locationY);
    } else {
      // Other drawing modes
      setStartPoint({ x: locationX, y: locationY });
    }
  };

  // Handler für addPoint Modus - fügt Punkt zu bestehender Polyline hinzu
  const handleAddPointTouch = (x: number, y: number) => {
    // Zuerst: Prüfe ob eine Polyline ausgewählt ist
    if (!selectedElementId) {
      showAlert('Hinweis', 'Bitte wähle zuerst eine Polyline aus');
      return;
    }
    
    const selectedEl = elements.find(el => el.id === selectedElementId);
    if (!selectedEl || selectedEl.type !== 'polyline') {
      showAlert('Hinweis', 'Bitte wähle eine Polyline aus');
      return;
    }
    
    const points = selectedEl.data?.points;
    if (!points || points.length < 2) {
      showAlert('Hinweis', 'Ungültige Polyline');
      return;
    }
    
    // Prüfe ob Klick nahe einem Endpunkt ist (zum Anhängen)
    const endpointRadius = 40;
    const firstPoint = points[0];
    const lastPoint = points[points.length - 1];
    
    const distToFirst = Math.sqrt(Math.pow(x - firstPoint.x, 2) + Math.pow(y - firstPoint.y, 2));
    const distToLast = Math.sqrt(Math.pow(x - lastPoint.x, 2) + Math.pow(y - lastPoint.y, 2));
    
    // Wenn nahe am ersten Punkt - Punkt am Anfang einfügen
    if (distToFirst < endpointRadius && !selectedEl.data.closed) {
      const newPoints = [{ x, y }, ...points];
      const newElements = elements.map(el => {
        if (el.id === selectedElementId) {
          return { ...el, data: { ...el.data, points: newPoints } };
        }
        return el;
      });
      addToHistory(newElements);
      return;
    }
    
    // Wenn nahe am letzten Punkt - Punkt am Ende anhängen
    if (distToLast < endpointRadius && !selectedEl.data.closed) {
      const newPoints = [...points, { x, y }];
      const newElements = elements.map(el => {
        if (el.id === selectedElementId) {
          return { ...el, data: { ...el.data, points: newPoints } };
        }
        return el;
      });
      addToHistory(newElements);
      return;
    }
    
    // Sonst: Prüfe ob Klick auf einer Kante ist (zum Einfügen)
    let closestSegment = -1;
    let minDist = Infinity;
    let insertPoint = { x, y };
    
    for (let i = 0; i < points.length - 1; i++) {
      const p1 = points[i];
      const p2 = points[i + 1];
      const dist = distanceToLineSegment(x, y, p1.x, p1.y, p2.x, p2.y);
      
      if (dist < minDist && dist < 30) {
        minDist = dist;
        closestSegment = i;
        // Berechne den nächsten Punkt auf dem Segment
        insertPoint = getClosestPointOnSegment(x, y, p1.x, p1.y, p2.x, p2.y);
      }
    }
    
    // Prüfe auch die schließende Kante bei geschlossenen Polylines
    if (selectedEl.data.closed && points.length >= 3) {
      const p1 = points[points.length - 1];
      const p2 = points[0];
      const dist = distanceToLineSegment(x, y, p1.x, p1.y, p2.x, p2.y);
      
      if (dist < minDist && dist < 30) {
        minDist = dist;
        closestSegment = points.length - 1; // Spezialindex für schließende Kante
        insertPoint = getClosestPointOnSegment(x, y, p1.x, p1.y, p2.x, p2.y);
      }
    }
    
    if (closestSegment >= 0) {
      // Punkt auf der Kante einfügen
      let newPoints: { x: number; y: number }[];
      
      if (closestSegment === points.length - 1 && selectedEl.data.closed) {
        // Schließende Kante - füge am Ende ein
        newPoints = [...points, insertPoint];
      } else {
        // Normale Kante - füge nach dem Segment ein
        newPoints = [
          ...points.slice(0, closestSegment + 1),
          insertPoint,
          ...points.slice(closestSegment + 1)
        ];
      }
      
      const newElements = elements.map(el => {
        if (el.id === selectedElementId) {
          return { ...el, data: { ...el.data, points: newPoints } };
        }
        return el;
      });
      addToHistory(newElements);
    }
  };

  // Hilfsfunktion: Berechnet den nächsten Punkt auf einem Liniensegment
  const getClosestPointOnSegment = (px: number, py: number, x1: number, y1: number, x2: number, y2: number) => {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;
    
    if (lenSq === 0) return { x: x1, y: y1 };
    
    let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    
    return {
      x: x1 + t * dx,
      y: y1 + t * dy
    };
  };

  // Handler für removePoint Modus - entfernt Punkt aus bestehender Polyline
  const handleRemovePointTouch = (x: number, y: number) => {
    // Zuerst: Prüfe ob eine Polyline ausgewählt ist
    if (!selectedElementId) {
      showAlert('Hinweis', 'Bitte wähle zuerst eine Polyline aus');
      return;
    }
    
    const selectedEl = elements.find(el => el.id === selectedElementId);
    if (!selectedEl || selectedEl.type !== 'polyline') {
      showAlert('Hinweis', 'Bitte wähle eine Polyline aus');
      return;
    }
    
    const points = selectedEl.data?.points;
    if (!points || points.length < 3) {
      showAlert('Hinweis', 'Polyline muss mindestens 3 Punkte haben');
      return;
    }
    
    // Finde den nächsten Punkt zum Klick
    const pointRadius = 30;
    let closestIndex = -1;
    let minDist = Infinity;
    
    for (let i = 0; i < points.length; i++) {
      const pt = points[i];
      const dist = Math.sqrt(Math.pow(x - pt.x, 2) + Math.pow(y - pt.y, 2));
      if (dist < minDist && dist < pointRadius) {
        minDist = dist;
        closestIndex = i;
      }
    }
    
    if (closestIndex >= 0) {
      // Punkt entfernen
      const newPoints = points.filter((_: { x: number; y: number }, idx: number) => idx !== closestIndex);
      
      const newElements = elements.map(el => {
        if (el.id === selectedElementId) {
          return { ...el, data: { ...el.data, points: newPoints } };
        }
        return el;
      });
      addToHistory(newElements);
    }
  };

  const onTouchMove = (event: any) => {
    // Im Zoom-Modus keine Zeichnung
    if (zoomMode) return;
    
    const touch = event.nativeEvent.touches ? event.nativeEvent.touches[0] : event.nativeEvent;
    // Gleiche Formel wie onTouchStart - locationX/Y sind bereits Canvas-Koordinaten
    const locationX = touch.locationX || touch.pageX;
    const locationY = touch.locationY || touch.pageY;

    if (drawMode === 'select' && dragMode && originalElement && dragStart) {
      handleSelectTouchMove(locationX, locationY);
    } else if (drawMode === 'pen' && currentPathRef.current) {
      // Füge Punkt zum Ref hinzu (keine Re-Renders)
      currentPathRef.current = `${currentPathRef.current} L ${locationX} ${locationY}`;
      drawPointCountRef.current++;
      
      // Aktualisiere State nur alle 3 Punkte für visuelles Feedback
      // Dies reduziert Re-Renders um ~66% bei gleichbleibender visueller Qualität
      if (drawPointCountRef.current % 3 === 0) {
        setCurrentPath(currentPathRef.current);
      }
    } else if (drawMode === 'select' && draggingLabelId) {
      // Label-Verschiebung während des Ziehens
      const dx = locationX - labelDragStartRef.current.x;
      const dy = locationY - labelDragStartRef.current.y;
      setLabelOffsets(prev => ({
        ...prev,
        [draggingLabelId]: {
          x: labelDragStartRef.current.offsetX + dx,
          y: labelDragStartRef.current.offsetY + dy,
        },
      }));
    } else if (drawMode === 'polygon' && currentPath) {
      setCurrentPath(prev => `${prev} L ${locationX} ${locationY}`);
    } else if (startPoint && drawMode !== 'text') {
      // Preview for other shapes
      createTempElement(startPoint, locationX, locationY);
    }
  };

  const onTouchEnd = (event: any) => {
    // Im Zoom-Modus keine Zeichnung
    if (zoomMode) return;
    
    if (drawMode === 'pen' && currentPathRef.current && currentPathRef.current.length > 0) {
      // Verwende den kompletten Pfad aus dem Ref für maximale Genauigkeit
      const finalPath = currentPathRef.current;
      const newElement: DrawElement = {
        id: generateId(),
        type: 'path',
        data: finalPath,
        color: drawColor,
        strokeWidth,
        rotation: 0,
      };
      addToHistory([...elements, newElement]);
      // Refs und State zurücksetzen
      currentPathRef.current = '';
      setCurrentPath('');
    } else if (drawMode === 'polygon' && currentPath && currentPath.length > 0) {
      // Close the polygon path by adding 'Z' and simplify lines
      const simplifiedPath = simplifyPath(currentPath, 10);
      const newElement: DrawElement = {
        id: generateId(),
        type: 'polygon',
        data: simplifiedPath + ' Z',
        color: drawColor,
        strokeWidth,
        rotation: 0,
      };
      addToHistory([...elements, newElement]);
      setCurrentPath('');
    } else if (drawMode === 'select' && dragMode) {
      // Finish transform - add to history if elements changed
      if (editingPolylinePoint !== null) {
        // Save polyline point edit to history
        addToHistory(elements);
      }
      setEditingPolylinePoint(null);
      setDragMode(null);
      setResizeHandle(null);
      setDragStart(null);
      setOriginalElement(null);
    } else if (drawMode === 'select' && draggingLabelId) {
      // Label-Verschiebung beenden
      setDraggingLabelId(null);
    } else if (startPoint && drawMode === 'arrow') {
      const touch = event.nativeEvent.changedTouches ? event.nativeEvent.changedTouches[0] : event.nativeEvent;
      // locationX/Y sind bereits Canvas-Koordinaten
      const locationX = touch.locationX || touch.pageX;
      const locationY = touch.locationY || touch.pageY;
      
      // Show arrow text input
      setPendingArrow({ x1: startPoint.x, y1: startPoint.y, x2: locationX, y2: locationY });
      setShowArrowModal(true);
      setStartPoint(null);
      setTempElement(null);
    } else if (startPoint && drawMode === 'pointer') {
      // Memo-Pfeil: Modal öffnen für optionale Notiz
      const touch = event.nativeEvent.changedTouches ? event.nativeEvent.changedTouches[0] : event.nativeEvent;
      // locationX/Y sind bereits Canvas-Koordinaten
      const locationX = touch.locationX || touch.pageX;
      const locationY = touch.locationY || touch.pageY;
      
      // Speichere die Pointer-Koordinaten und öffne Modal
      setPendingPointer({ x1: startPoint.x, y1: startPoint.y, x2: locationX, y2: locationY });
      setPointerText(''); // Text zurücksetzen
      setShowPointerModal(true);
      setStartPoint(null);
      setTempElement(null);
    } else if (startPoint && drawMode === 'memo') {
      // Memo/Notiz: Annotation mit gestrichelter Linie und Textlabel
      const touch = event.nativeEvent.changedTouches ? event.nativeEvent.changedTouches[0] : event.nativeEvent;
      // locationX/Y sind bereits Canvas-Koordinaten
      const locationX = touch.locationX || touch.pageX;
      const locationY = touch.locationY || touch.pageY;
      
      // Speichere die Memo-Koordinaten und öffne Modal
      setPendingMemo({ x1: startPoint.x, y1: startPoint.y, x2: locationX, y2: locationY });
      setMemoText(''); // Leerer Anfangstext
      setShowMemoModal(true);
      setStartPoint(null);
      setTempElement(null);
    } else if (startPoint && tempElement) {
      // Wichtig: Neue eindeutige ID vergeben beim Hinzufügen
      const finalElement = { ...tempElement, id: Date.now().toString() };
      addToHistory([...elements, finalElement]);
      setStartPoint(null);
      setTempElement(null);
    }
  };

  // Helper: Create temporary preview element
  const createTempElement = (start: { x: number; y: number }, endX: number, endY: number) => {
    let element: DrawElement | null = null;

    switch (drawMode) {
      case 'line':
        element = {
          id: 'temp',
          type: 'line',
          data: { x1: start.x, y1: start.y, x2: endX, y2: endY },
          color: drawColor,
          strokeWidth,
          rotation: 0,
        };
        break;
      case 'circle':
        const radius = Math.sqrt(Math.pow(endX - start.x, 2) + Math.pow(endY - start.y, 2));
        element = {
          id: 'temp',
          type: 'circle',
          data: { cx: start.x, cy: start.y, r: radius },
          color: drawColor,
          strokeWidth,
          rotation: 0,
        };
        break;
      case 'rect':
        element = {
          id: 'temp',
          type: 'rect',
          data: {
            x: Math.min(start.x, endX),
            y: Math.min(start.y, endY),
            width: Math.abs(endX - start.x),
            height: Math.abs(endY - start.y),
          },
          color: drawColor,
          strokeWidth,
          rotation: 0,
        };
        break;
      case 'arrow':
        element = {
          id: 'temp',
          type: 'arrow',
          data: { x1: start.x, y1: start.y, x2: endX, y2: endY, text: '', heads: arrowHeads },
          color: drawColor,
          strokeWidth: editArrowStrokeWidth, // Gespeicherte Arrow-Strichstärke verwenden
          rotation: 0,
        };
        break;
      case 'pointer':
        // Pointer-Pfeil: verwendet die gespeicherte Pointer-Strichstärke
        element = {
          id: 'temp',
          type: 'pointer',
          data: { x1: start.x, y1: start.y, x2: endX, y2: endY },
          color: drawColor,
          strokeWidth: editPointerStrokeWidth, // Gespeicherte Pointer-Strichstärke verwenden
          rotation: 0,
        };
        break;
      case 'memo':
        // Memo/Notiz: Ankerpunkt mit gestrichelter Linie zum Textlabel
        element = {
          id: 'temp',
          type: 'memo',
          data: { x1: start.x, y1: start.y, x2: endX, y2: endY, text: '' },
          color: '#E74C3C',
          strokeWidth: 2,
          rotation: 0,
        };
        break;
    }

    setTempElement(element);
  };

  // Polyline beenden (offen oder geschlossen)
  const finishPolyline = (closed: boolean = false) => {
    if (polylinePoints.length >= 2) {
      const newElement: DrawElement = {
        id: generateId(),
        type: 'polyline',
        data: { 
          points: [...polylinePoints],
          closed: closed 
        },
        color: drawColor,
        strokeWidth,
        rotation: 0,
      };
      addToHistory([...elements, newElement]);
    }
    setPolylinePoints([]);
    // Position zurücksetzen
    polylineControlPosition.setValue({ x: 0, y: 0 });
    polylineControlPosition.setOffset({ x: 0, y: 0 });
  };

  // Polyline abbrechen
  const cancelPolyline = () => {
    setPolylinePoints([]);
    // Position zurücksetzen
    polylineControlPosition.setValue({ x: 0, y: 0 });
    polylineControlPosition.setOffset({ x: 0, y: 0 });
  };

  // Letzten Punkt der Polyline entfernen (Undo)
  const undoLastPolylinePoint = () => {
    if (polylinePoints.length > 0) {
      setPolylinePoints(polylinePoints.slice(0, -1));
    }
  };

  const [pendingPosition, setPendingPosition] = useState<{ x: number; y: number } | null>(null);
  const [pendingArrow, setPendingArrow] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const [pendingPointer, setPendingPointer] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const [pendingMemo, setPendingMemo] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const [showMemoModal, setShowMemoModal] = useState(false);
  const [memoText, setMemoText] = useState('');
  const [editMemoFontSize, setEditMemoFontSize] = useState(10);
  const [showEditMemoModal, setShowEditMemoModal] = useState(false);

  // Polygon Edit Modal State
  const [showEditPolygonModal, setShowEditPolygonModal] = useState(false);
  const [editPolygonStrokeWidth, setEditPolygonStrokeWidth] = useState(3);
  const [editPolygonColor, setEditPolygonColor] = useState('#FF0000');

  // Add text element
  const addTextElement = () => {
    if (textInput.trim() && pendingPosition) {
      const newElement: DrawElement = {
        id: generateId(),
        type: 'text',
        data: { text: textInput },
        color: lastTextColor,
        strokeWidth: 0,
        x: pendingPosition.x,
        y: pendingPosition.y,
        rotation: 0,
        fontSize: lastTextFontSize,
        fontWeight: 'bold',
        fontStyle: 'normal',
        fontFamily: FONT_FAMILIES.find(f => f.id === lastTextFontFamily)?.svgFont || 'sans-serif',
      };
      addToHistory([...elements, newElement]);
      setTextInput('');
      setPendingPosition(null);
      setShowTextModal(false);
    }
  };

  // Add arrow element
  const addArrowElement = () => {
    if (pendingArrow) {
      const newElement: DrawElement = {
        id: generateId(),
        type: 'arrow',
        data: {
          x1: pendingArrow.x1,
          y1: pendingArrow.y1,
          x2: pendingArrow.x2,
          y2: pendingArrow.y2,
          text: arrowText,
          heads: arrowHeads,
          fontSize: editArrowFontSize, // Gespeicherte Schriftgröße verwenden
        },
        color: drawColor,
        strokeWidth: editArrowStrokeWidth, // Gespeicherte Arrow-Strichstärke verwenden
        rotation: 0,
      };
      addToHistory([...elements, newElement]);
      setArrowText('');
      setPendingArrow(null);
      setShowArrowModal(false);
    }
  };

  // Add pointer (memo arrow) element
  const addPointerElement = () => {
    if (pendingPointer) {
      const newElement: DrawElement = {
        id: generateId(),
        type: 'pointer',
        data: {
          x1: pendingPointer.x1,
          y1: pendingPointer.y1,
          x2: pendingPointer.x2,
          y2: pendingPointer.y2,
          text: pointerText, // Optional: Notiz-Text
          fontSize: editPointerFontSize,
        },
        color: drawColor,
        strokeWidth: editPointerStrokeWidth, // Gespeicherte Pointer-Strichstärke verwenden
        rotation: 0,
      };
      addToHistory([...elements, newElement]);
      setPointerText('');
      setPendingPointer(null);
      setShowPointerModal(false);
    }
  };

  // Update existing pointer element (edit mode)
  const updatePointerElement = () => {
    if (selectedElementId) {
      const newElements = elements.map(el => {
        if (el.id === selectedElementId && el.type === 'pointer') {
          return {
            ...el,
            data: {
              ...el.data,
              text: pointerText,
              fontSize: editPointerFontSize,
            },
            color: drawColor,
            strokeWidth: editPointerStrokeWidth,
          };
        }
        return el;
      });
      addToHistory(newElements);
      setPointerText('');
      setShowEditPointerModal(false);
    }
  };

  // Add memo (annotation with dashed line) element - wie in Flächenberechnung
  const addMemoElement = () => {
    if (pendingMemo) {
      const newElement: DrawElement = {
        id: generateId(),
        type: 'memo',
        data: {
          x1: pendingMemo.x1, // Ankerpunkt (roter Kreis)
          y1: pendingMemo.y1,
          x2: pendingMemo.x2, // Position des Textlabels
          y2: pendingMemo.y2,
          text: memoText,
          fontSize: editMemoFontSize,
        },
        color: '#E74C3C', // Rot wie im Bild
        strokeWidth: 2,
        rotation: 0,
      };
      addToHistory([...elements, newElement]);
      setSelectedElementId(newElement.id); // Neue Memo auswählen
      setDrawMode('select'); // Zurück zum Auswahl-Modus
      setMemoText('');
      setPendingMemo(null);
      setShowMemoModal(false);
    }
  };

  // Update existing memo element (edit mode)
  const updateMemoElement = () => {
    if (selectedElementId) {
      const newElements = elements.map(el => {
        if (el.id === selectedElementId && el.type === 'memo') {
          return {
            ...el,
            data: {
              ...el.data,
              text: memoText,
              fontSize: editMemoFontSize,
            },
            color: drawColor,
          };
        }
        return el;
      });
      addToHistory(newElements);
      setMemoText('');
      setShowEditMemoModal(false);
    }
  };

  // Update polygon/polyline/path element properties (color & strokeWidth)
  const updatePolygonElement = () => {
    if (selectedElementId) {
      const newElements = elements.map(el => {
        if (el.id === selectedElementId && (el.type === 'polygon' || el.type === 'polyline' || el.type === 'rect' || el.type === 'circle' || el.type === 'path')) {
          return {
            ...el,
            color: editPolygonColor,
            strokeWidth: editPolygonStrokeWidth,
          };
        }
        return el;
      });
      addToHistory(newElements);
      setShowEditPolygonModal(false);
    }
  };

  // Selection & Transform handlers
  const handleSelectTouchStart = (locationX: number, locationY: number) => {
    // Zuerst prüfen: Klick auf ein Polyline-Label zum Verschieben?
    const labelHit = findPolylineLabelAtPoint(locationX, locationY);
    if (labelHit) {
      // Label gefunden - Verschiebung starten
      const currentOffset = labelOffsets[labelHit.elementId] || { x: 0, y: 0 };
      setDraggingLabelId(labelHit.elementId);
      labelDragStartRef.current = {
        x: locationX,
        y: locationY,
        offsetX: currentOffset.x,
        offsetY: currentOffset.y,
      };
      return;
    }
    
    // Check if clicking on transformation handles first
    if (selectedElementId) {
      const selectedEl = elements.find(el => el.id === selectedElementId);
      if (selectedEl) {
        // Check for polyline center handle (for moving entire polygon)
        if (selectedEl.type === 'polyline' && selectedEl.data?.points && selectedEl.data.points.length >= 2) {
          const points = selectedEl.data.points;
          const centerX = points.reduce((sum: number, pt: { x: number }) => sum + pt.x, 0) / points.length;
          const centerY = points.reduce((sum: number, pt: { y: number }) => sum + pt.y, 0) / points.length;
          const centerRadius = 8; // Klick-Toleranz für Mittelpunkt - kleiner gemacht für iPhone
          const distanceToCenter = Math.sqrt(
            Math.pow(locationX - centerX, 2) + Math.pow(locationY - centerY, 2)
          );
          if (distanceToCenter <= centerRadius) {
            // Mittelpunkt getroffen - Verschiebung des gesamten Polygons starten
            setEditingPolylinePoint(null); // Kein einzelner Punkt, sondern ganzes Polygon
            setDragMode('move');
            setDragStart({ x: locationX, y: locationY });
            setOriginalElement(JSON.parse(JSON.stringify(selectedEl)));
            return;
          }
        }
        
        // Check for polyline point editing
        if (selectedEl.type === 'polyline' && selectedEl.data?.points) {
          const pointRadius = 8; // Klick-Toleranz für Eckpunkte - kleiner gemacht für iPhone
          for (let i = 0; i < selectedEl.data.points.length; i++) {
            const pt = selectedEl.data.points[i];
            const distance = Math.sqrt(
              Math.pow(locationX - pt.x, 2) + Math.pow(locationY - pt.y, 2)
            );
            if (distance <= pointRadius) {
              // Eckpunkt gefunden - Bearbeitungsmodus starten
              setEditingPolylinePoint(i);
              setDragMode('move');
              setDragStart({ x: locationX, y: locationY });
              setOriginalElement(JSON.parse(JSON.stringify(selectedEl)));
              return;
            }
          }
        }
        
        const handle = checkTransformHandles(selectedEl, locationX, locationY);
        if (handle) {
          setDragMode(handle.type === 'rotate' ? 'rotate' : 'resize');
          setResizeHandle(handle.handle);
          setDragStart({ x: locationX, y: locationY });
          setOriginalElement(JSON.parse(JSON.stringify(selectedEl)));
          return;
        }
      }
    }

    // Reset polyline point editing when clicking elsewhere
    setEditingPolylinePoint(null);
    
    // Prüfe ob auf ein Polyline-Segment geklickt wurde (für Maß-Funktion)
    const segmentHit = findPolylineSegmentAtPoint(locationX, locationY);
    if (segmentHit) {
      // Segment gefunden - nur auswählen für Maß-Eingabe, KEIN Verschieben über Linien
      setSelectedLineSegment({ 
        elementId: segmentHit.element.id, 
        segmentIndex: segmentHit.segmentIndex 
      });
      setSelectedElementId(segmentHit.element.id);
      // KEIN dragMode setzen - Polylinie nur über Mittelpunkt oder Eckpunkte verschiebbar
      return;
    } else {
      // Kein Segment getroffen - Auswahl zurücksetzen
      setSelectedLineSegment(null);
    }

    // Check if clicking on an element - im Foto-Modus nur Bilder, sonst nur andere Elemente
    const clickedElement = findElementAtPoint(locationX, locationY, photoEditMode);
    if (clickedElement) {
      // Check for double tap
      const now = Date.now();
      const lastTap = lastTapRef.current;
      
      if (lastTap.elementId === clickedElement.id && now - lastTap.time < 300) {
        // Double tap detected - open edit modal
        if (clickedElement.type === 'text') {
          setTextInput(clickedElement.data.text || '');
          setEditFontSize(clickedElement.fontSize || 20);
          setEditFontWeight(clickedElement.fontWeight || 'bold');
          setEditFontStyle(clickedElement.fontStyle || 'normal');
          // FontFamily aus dem Element laden (svgFont zurück zu FontFamily ID konvertieren)
          const currentFontFamily = clickedElement.fontFamily || 'sans-serif';
          const fontFamilyId = FONT_FAMILIES.find(f => f.svgFont === currentFontFamily)?.id || 'System';
          setEditFontFamily(fontFamilyId);
          setDrawColor(clickedElement.color);
          setShowEditTextModal(true);
        } else if (clickedElement.type === 'arrow') {
          setArrowText(clickedElement.data.text || '');
          setArrowHeads(clickedElement.data.heads || 'double');
          setEditArrowFontSize(clickedElement.data.fontSize || 14);
          setEditArrowStrokeWidth(clickedElement.strokeWidth || 3);
          setDrawColor(clickedElement.color);
          setShowEditArrowModal(true);
        } else if (clickedElement.type === 'pointer') {
          // Memo-Pfeil bearbeiten
          setPointerText(clickedElement.data.text || '');
          setEditPointerFontSize(clickedElement.data.fontSize || 16);
          setEditPointerStrokeWidth(clickedElement.strokeWidth || 6);
          setDrawColor(clickedElement.color);
          setShowEditPointerModal(true);
        } else if (clickedElement.type === 'memo') {
          // Memo/Notiz bearbeiten bei Doppeltipp
          setMemoText(clickedElement.data.text || '');
          setEditMemoFontSize(clickedElement.data.fontSize || 14);
          setDrawColor(clickedElement.color);
          setShowEditMemoModal(true);
        } else if (clickedElement.type === 'polygon' || clickedElement.type === 'rect' || clickedElement.type === 'circle' || clickedElement.type === 'polyline' || clickedElement.type === 'path') {
          // Polygon/Rechteck/Kreis/Polyline/Pfad bearbeiten bei Doppeltipp
          setEditPolygonStrokeWidth(clickedElement.strokeWidth || 3);
          setEditPolygonColor(clickedElement.color || '#FF0000');
          setShowEditPolygonModal(true);
        }
        lastTapRef.current = { time: 0, elementId: null };
        return;
      }
      
      lastTapRef.current = { time: now, elementId: clickedElement.id };
      
      setSelectedElementId(clickedElement.id);
      
      // Polylines nur über Mittelpunkt oder Eckpunkte verschiebbar, nicht über die Fläche
      if (clickedElement.type !== 'polyline') {
        setDragMode('move');
        setDragStart({ x: locationX, y: locationY });
        setOriginalElement(JSON.parse(JSON.stringify(clickedElement)));
      }
    } else {
      setSelectedElementId(null);
      lastTapRef.current = { time: 0, elementId: null };
    }
  };

  const handleSelectTouchMove = (locationX: number, locationY: number) => {
    // Label-Verschiebung wenn aktiv
    if (draggingLabelId) {
      const dx = locationX - labelDragStartRef.current.x;
      const dy = locationY - labelDragStartRef.current.y;
      setLabelOffsets(prev => ({
        ...prev,
        [draggingLabelId]: {
          x: labelDragStartRef.current.offsetX + dx,
          y: labelDragStartRef.current.offsetY + dy,
        },
      }));
      return;
    }
    
    if (!originalElement || !dragStart) return;

    const dx = locationX - dragStart.x;
    const dy = locationY - dragStart.y;

    const newElements = elements.map(el => {
      if (el.id !== selectedElementId) return el;

      const newEl = { ...el };

      if (dragMode === 'move') {
        // Check if we're editing a specific polyline point
        if (el.type === 'polyline' && editingPolylinePoint !== null) {
          // Move only the specific point
          const newPoints = originalElement.data.points.map((pt: { x: number; y: number }, idx: number) => {
            if (idx === editingPolylinePoint) {
              return { x: pt.x + dx, y: pt.y + dy };
            }
            return pt;
          });
          newEl.data = { ...el.data, points: newPoints };
        } else if (el.type === 'path') {
          // Move path by shifting all coordinates
          const pathRegex = /([ML])\s*(-?\d+\.?\d*)\s+(-?\d+\.?\d*)/g;
          newEl.data = originalElement.data.replace(pathRegex, (match: string, cmd: string, x: string, y: string) => {
            return `${cmd} ${parseFloat(x) + dx} ${parseFloat(y) + dy}`;
          });
        } else if (el.type === 'line' || el.type === 'arrow' || el.type === 'pointer' || el.type === 'memo') {
          newEl.data = {
            ...el.data,
            x1: originalElement.data.x1 + dx,
            y1: originalElement.data.y1 + dy,
            x2: originalElement.data.x2 + dx,
            y2: originalElement.data.y2 + dy,
          };
        } else if (el.type === 'circle') {
          newEl.data = {
            ...el.data,
            cx: originalElement.data.cx + dx,
            cy: originalElement.data.cy + dy,
          };
        } else if (el.type === 'rect') {
          newEl.data = {
            ...el.data,
            x: originalElement.data.x + dx,
            y: originalElement.data.y + dy,
          };
        } else if (el.type === 'text' || el.type === 'image') {
          newEl.x = (originalElement.x || 0) + dx;
          newEl.y = (originalElement.y || 0) + dy;
        } else if (el.type === 'polyline') {
          // Move polyline by shifting all points
          const newPoints = originalElement.data.points.map((pt: { x: number; y: number }) => ({
            x: pt.x + dx,
            y: pt.y + dy,
          }));
          newEl.data = { ...el.data, points: newPoints };
        } else if (el.type === 'path') {
          // Move path by shifting all coordinates in the SVG path string
          const pathRegex = /([MLQ])\s*(-?\d+\.?\d*)\s+(-?\d+\.?\d*)/g;
          newEl.data = originalElement.data.replace(pathRegex, (match: string, cmd: string, x: string, y: string) => {
            return `${cmd} ${parseFloat(x) + dx} ${parseFloat(y) + dy}`;
          });
        } else if (el.type === 'polygon') {
          // Move polygon by shifting all coordinates in the SVG path string
          // Format: "M x y L x y L x y ... Z"
          const pathRegex = /([ML])\s*(-?\d+\.?\d*)\s+(-?\d+\.?\d*)/g;
          let newPath = originalElement.data.replace(pathRegex, (match: string, cmd: string, x: string, y: string) => {
            return `${cmd} ${parseFloat(x) + dx} ${parseFloat(y) + dy}`;
          });
          // Keep the Z at the end if present
          if (originalElement.data.includes('Z') && !newPath.includes('Z')) {
            newPath += ' Z';
          }
          newEl.data = newPath;
        }
      } else if (dragMode === 'rotate' && resizeHandle === 'rotate') {
        // Rotate element
        let centerX = 0, centerY = 0;
        
        if (el.type === 'circle') {
          centerX = originalElement.data.cx;
          centerY = originalElement.data.cy;
        } else if (el.type === 'line' || el.type === 'arrow' || el.type === 'pointer' || el.type === 'memo') {
          centerX = (originalElement.data.x1 + originalElement.data.x2) / 2;
          centerY = (originalElement.data.y1 + originalElement.data.y2) / 2;
        } else if (el.type === 'rect') {
          centerX = originalElement.data.x + originalElement.data.width / 2;
          centerY = originalElement.data.y + originalElement.data.height / 2;
        } else if (el.type === 'image' || el.type === 'text') {
          centerX = (originalElement.x || 0) + ((originalElement.width || 50) / 2);
          centerY = (originalElement.y || 0) + ((originalElement.height || 50) / 2);
        }
        
        const startAngle = Math.atan2(dragStart.y - centerY, dragStart.x - centerX);
        const currentAngle = Math.atan2(locationY - centerY, locationX - centerX);
        const rotationDelta = ((currentAngle - startAngle) * 180 / Math.PI);
        const originalRotation = originalElement.rotation || 0;
        
        newEl.rotation = originalRotation + rotationDelta;
      } else if (dragMode === 'resize' && resizeHandle) {
        // Resize element
        if (el.type === 'circle' && resizeHandle === 'radius') {
          const newRadius = Math.sqrt(
            Math.pow(locationX - originalElement.data.cx, 2) + 
            Math.pow(locationY - originalElement.data.cy, 2)
          );
          newEl.data = { ...el.data, r: Math.max(10, newRadius) };
        } else if (el.type === 'line' || el.type === 'arrow' || el.type === 'pointer' || el.type === 'memo') {
          if (resizeHandle === 'start') {
            newEl.data = { ...el.data, x1: locationX, y1: locationY };
          } else if (resizeHandle === 'end') {
            newEl.data = { ...el.data, x2: locationX, y2: locationY };
          }
        } else if (el.type === 'rect') {
          let newData = { ...el.data };
          const origData = originalElement.data;
          
          if (resizeHandle.includes('right')) {
            newData.width = origData.width + dx;
          }
          if (resizeHandle.includes('left')) {
            newData.x = origData.x + dx;
            newData.width = origData.width - dx;
          }
          if (resizeHandle.includes('bottom')) {
            newData.height = origData.height + dy;
          }
          if (resizeHandle.includes('top')) {
            newData.y = origData.y + dy;
            newData.height = origData.height - dy;
          }
          
          newEl.data = newData;
        } else if (el.type === 'image') {
          // Proportionales Resize - Seitenverhältnis beibehalten
          const origX = originalElement.x || 0;
          const origY = originalElement.y || 0;
          const origW = originalElement.width || 100;
          const origH = originalElement.height || 100;
          const aspectRatio = origW / origH;
          
          let newX = origX;
          let newY = origY;
          let newW = origW;
          let newH = origH;
          
          if (resizeHandle === 'bottom-right') {
            // Diagonal resize von rechts unten - proportional
            const delta = Math.max(dx, dy * aspectRatio);
            newW = origW + delta;
            newH = newW / aspectRatio;
          } else if (resizeHandle === 'top-left') {
            // Diagonal resize von links oben - proportional
            const delta = Math.max(-dx, -dy * aspectRatio);
            newW = origW + delta;
            newH = newW / aspectRatio;
            newX = origX - delta;
            newY = origY - (newH - origH);
          } else if (resizeHandle === 'top-right') {
            // Diagonal resize von rechts oben - proportional
            const delta = Math.max(dx, -dy * aspectRatio);
            newW = origW + delta;
            newH = newW / aspectRatio;
            newY = origY - (newH - origH);
          } else if (resizeHandle === 'bottom-left') {
            // Diagonal resize von links unten - proportional
            const delta = Math.max(-dx, dy * aspectRatio);
            newW = origW + delta;
            newH = newW / aspectRatio;
            newX = origX - delta;
          }
          
          // Mindestgröße einhalten
          if (newW >= 40 && newH >= 40) {
            newEl.x = newX;
            newEl.y = newY;
            newEl.width = newW;
            newEl.height = newH;
          }
        }
      }

      return newEl;
    });

    setElements(newElements);
  };

  // Find polyline label at point (für Label-Verschiebung)
  const findPolylineLabelAtPoint = (x: number, y: number): { elementId: string; centerX: number; centerY: number } | null => {
    // Durchsuche alle Polylines mit Maßen
    const polylinesWithMeasurements = getPolylineElementsWithMeasurements();
    
    for (const element of polylinesWithMeasurements) {
      const points = element.data?.points;
      if (!points || points.length < 2) continue;
      
      // Berechne Zentrum des Grundrisses
      const sumX = points.reduce((acc: number, pt: { x: number; y: number }) => acc + pt.x, 0);
      const sumY = points.reduce((acc: number, pt: { x: number; y: number }) => acc + pt.y, 0);
      const centerX = sumX / points.length;
      const centerY = sumY / points.length;
      
      // Label-Offset aus State holen
      const offset = labelOffsets[element.id] || { x: 0, y: 0 };
      const labelX = centerX + offset.x;
      const labelY = centerY + offset.y;
      
      // Prüfe ob der Punkt im Label-Bereich liegt (Radius 12 + 10 Toleranz)
      const labelRadius = 22;
      const distance = Math.sqrt(Math.pow(x - labelX, 2) + Math.pow(y - labelY, 2));
      
      if (distance <= labelRadius) {
        return { elementId: element.id, centerX, centerY };
      }
    }
    
    return null;
  };

  // Find element at point
  const findElementAtPoint = (x: number, y: number, onlyImages: boolean = false): DrawElement | null => {
    // Check in reverse order (top elements first)
    for (let i = elements.length - 1; i >= 0; i--) {
      const el = elements[i];
      
      // Im Foto-Modus nur Bilder auswählen, im normalen Modus Bilder ignorieren
      if (onlyImages && el.type !== 'image') continue;
      if (!onlyImages && el.type === 'image') continue;
      
      if (el.type === 'circle') {
        const dist = Math.sqrt(Math.pow(x - el.data.cx, 2) + Math.pow(y - el.data.cy, 2));
        if (dist <= el.data.r + 10) return el;
      } else if (el.type === 'rect') {
        if (x >= el.data.x - 10 && x <= el.data.x + el.data.width + 10 &&
            y >= el.data.y - 10 && y <= el.data.y + el.data.height + 10) {
          return el;
        }
      } else if (el.type === 'line' || el.type === 'arrow' || el.type === 'pointer') {
        const dist = distanceToLineSegment(x, y, el.data.x1, el.data.y1, el.data.x2, el.data.y2);
        if (dist < 15) return el;
      } else if (el.type === 'text') {
        const elX = el.x || 0;
        const elY = el.y || 0;
        // Berechne Textbreite basierend auf Textlänge und Schriftgröße
        const fontSize = el.fontSize || 20;
        const textLength = el.data?.text?.length || 10;
        const elW = el.width || Math.max(textLength * fontSize * 0.7, 100); // Mindestens 100px breit
        const elH = el.height || Math.max(fontSize * 1.5, 60); // Mindestens 60px hoch
        // Sehr große Hitbox für einfache Auswahl (40px Padding)
        const padding = 40;
        if (x >= elX - padding && x <= elX + elW + padding &&
            y >= elY - fontSize - padding && y <= elY + elH + padding) {
          return el;
        }
      } else if (el.type === 'image') {
        const elX = el.x || 0;
        const elY = el.y || 0;
        const elW = el.width || 100;
        const elH = el.height || 100;
        if (x >= elX - 10 && x <= elX + elW + 10 &&
            y >= elY - 10 && y <= elY + elH + 10) {
          return el;
        }
      } else if (el.type === 'polyline') {
        // Prüfe ob Punkt nahe einer Polyline-Linie ist
        // Dynamische Toleranz basierend auf Zoom-Level für bessere Auswahl kleiner Polygone
        // Bei scale > 1 (reingezoomt): kleinere Toleranz nötig (Objekte erscheinen größer)
        // Bei scale < 1 (rausgezoomt): größere Toleranz nötig (Objekte erscheinen kleiner)
        const baseTolerance = 30;
        const dynamicTolerance = Math.max(15, baseTolerance / Math.max(scale, 0.5));
        const points = el.data.points;
        if (points && points.length >= 2) {
          for (let j = 0; j < points.length - 1; j++) {
            const dist = distanceToLineSegment(x, y, points[j].x, points[j].y, points[j+1].x, points[j+1].y);
            if (dist < dynamicTolerance) return el;
          }
          // Prüfe auch die schließende Linie wenn geschlossen
          if (el.data.closed && points.length >= 3) {
            const dist = distanceToLineSegment(x, y, points[points.length-1].x, points[points.length-1].y, points[0].x, points[0].y);
            if (dist < dynamicTolerance) return el;
          }
        }
      } else if (el.type === 'path') {
        // Extrahiere Punkte aus dem SVG-Path und prüfe Nähe
        const pathPoints: { x: number; y: number }[] = [];
        const pathRegex = /([ML])\s*(-?\d+\.?\d*)\s+(-?\d+\.?\d*)/g;
        let match;
        while ((match = pathRegex.exec(el.data)) !== null) {
          pathPoints.push({ x: parseFloat(match[2]), y: parseFloat(match[3]) });
        }
        
        // Prüfe ob Punkt nahe einer der Linien ist
        if (pathPoints.length >= 2) {
          for (let j = 0; j < pathPoints.length - 1; j++) {
            const dist = distanceToLineSegment(x, y, pathPoints[j].x, pathPoints[j].y, pathPoints[j+1].x, pathPoints[j+1].y);
            if (dist < 20) return el;
          }
        }
      } else if (el.type === 'polygon') {
        // Extrahiere Punkte aus dem SVG-Path (Polygon ist wie path aber geschlossen)
        const polygonPoints: { x: number; y: number }[] = [];
        const pathRegex = /([ML])\s*(-?\d+\.?\d*)\s+(-?\d+\.?\d*)/g;
        let match;
        while ((match = pathRegex.exec(el.data)) !== null) {
          polygonPoints.push({ x: parseFloat(match[2]), y: parseFloat(match[3]) });
        }
        
        if (polygonPoints.length >= 3) {
          // Zuerst prüfen ob Punkt INNERHALB des Polygons liegt (Ray-Casting Algorithmus)
          let inside = false;
          for (let i = 0, j = polygonPoints.length - 1; i < polygonPoints.length; j = i++) {
            const xi = polygonPoints[i].x, yi = polygonPoints[i].y;
            const xj = polygonPoints[j].x, yj = polygonPoints[j].y;
            
            const intersect = ((yi > y) !== (yj > y)) &&
              (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
            if (intersect) inside = !inside;
          }
          if (inside) return el;
          
          // Dann prüfen ob Punkt nahe einer der Linien ist (für Kanten-Auswahl)
          for (let j = 0; j < polygonPoints.length - 1; j++) {
            const dist = distanceToLineSegment(x, y, polygonPoints[j].x, polygonPoints[j].y, polygonPoints[j+1].x, polygonPoints[j+1].y);
            if (dist < 20) {
              return el;
            }
          }
          // Prüfe auch die schließende Linie (vom letzten zum ersten Punkt)
          const dist = distanceToLineSegment(x, y, polygonPoints[polygonPoints.length-1].x, polygonPoints[polygonPoints.length-1].y, polygonPoints[0].x, polygonPoints[0].y);
          if (dist < 20) {
            return el;
          }
        } else if (polygonPoints.length >= 2) {
          // Weniger als 3 Punkte - nur Linien prüfen
          for (let j = 0; j < polygonPoints.length - 1; j++) {
            const dist = distanceToLineSegment(x, y, polygonPoints[j].x, polygonPoints[j].y, polygonPoints[j+1].x, polygonPoints[j+1].y);
            if (dist < 20) return el;
          }
        }
      } else if (el.type === 'memo') {
        // Memo: Prüfe Ankerpunkt, Linie und Textbox
        const x1 = el.data.x1; // Ankerpunkt
        const y1 = el.data.y1;
        const x2 = el.data.x2; // Textbox Position
        const y2 = el.data.y2;
        const fontSize = el.data.fontSize || 14;
        const text = el.data.text || '';
        const labelWidth = Math.max(60, text.length * fontSize * 0.6 + 20);
        const labelHeight = fontSize + 14;
        
        // Prüfe ob nahe am Ankerpunkt (roter Kreis)
        const distToAnchor = Math.sqrt(Math.pow(x - x1, 2) + Math.pow(y - y1, 2));
        if (distToAnchor <= 15) return el;
        
        // Prüfe ob nahe an der Linie
        const distToLine = distanceToLineSegment(x, y, x1, y1, x2, y2);
        if (distToLine < 15) return el;
        
        // Prüfe ob in der Textbox
        if (x >= x2 - labelWidth/2 - 10 && x <= x2 + labelWidth/2 + 10 &&
            y >= y2 - labelHeight/2 - 10 && y <= y2 + labelHeight/2 + 10) {
          return el;
        }
      }
    }
    return null;
  };

  // Distance to line segment helper
  const distanceToLineSegment = (px: number, py: number, x1: number, y1: number, x2: number, y2: number) => {
    const A = px - x1;
    const B = py - y1;
    const C = x2 - x1;
    const D = y2 - y1;
    const dot = A * C + B * D;
    const lenSq = C * C + D * D;
    let param = -1;
    if (lenSq !== 0) param = dot / lenSq;
    
    let xx, yy;
    if (param < 0) {
      xx = x1;
      yy = y1;
    } else if (param > 1) {
      xx = x2;
      yy = y2;
    } else {
      xx = x1 + param * C;
      yy = y1 + param * D;
    }
    
    const dx = px - xx;
    const dy = py - yy;
    return Math.sqrt(dx * dx + dy * dy);
  };

  // Funktion um das spezifische Polyline-Segment zu finden
  const findPolylineSegmentAtPoint = (x: number, y: number): { element: DrawElement; segmentIndex: number } | null => {
    // Dynamische Toleranz basierend auf Zoom-Level für bessere Auswahl kleiner Polygone
    // Bei scale > 1 (reingezoomt): kleinere Toleranz nötig (Objekte erscheinen größer)
    // Bei scale < 1 (rausgezoomt): größere Toleranz nötig (Objekte erscheinen kleiner)
    const baseTolerance = 30;
    const dynamicTolerance = Math.max(15, baseTolerance / Math.max(scale, 0.5));
    
    // Finde das NÄCHSTGELEGENE Segment (nicht das erste innerhalb der Toleranz)
    let closestResult: { element: DrawElement; segmentIndex: number; distance: number } | null = null;
    
    for (let i = elements.length - 1; i >= 0; i--) {
      const el = elements[i];
      if (el.type === 'polyline') {
        const points = el.data.points;
        if (points && points.length >= 2) {
          // Prüfe jedes Segment
          for (let j = 0; j < points.length - 1; j++) {
            const dist = distanceToLineSegment(x, y, points[j].x, points[j].y, points[j+1].x, points[j+1].y);
            if (dist < dynamicTolerance && (!closestResult || dist < closestResult.distance)) {
              closestResult = { element: el, segmentIndex: j, distance: dist };
            }
          }
          // WICHTIG: Prüfe auch die schließende Linie wenn geschlossen - mit GLEICHER Priorität!
          if (el.data.closed && points.length >= 3) {
            const dist = distanceToLineSegment(x, y, points[points.length-1].x, points[points.length-1].y, points[0].x, points[0].y);
            if (dist < dynamicTolerance && (!closestResult || dist < closestResult.distance)) {
              closestResult = { element: el, segmentIndex: points.length - 1, distance: dist }; // Index für Schlusslinie
            }
          }
        }
      }
    }
    
    if (closestResult) {
      return { element: closestResult.element, segmentIndex: closestResult.segmentIndex };
    }
    return null;
  };

  // Check transform handles
  const checkTransformHandles = (element: DrawElement, x: number, y: number): { type: 'rotate' | 'resize', handle: string } | null => {
    const handleRadius = 15;
    
    if (element.type === 'rect') {
      const { x: rx, y: ry, width: w, height: h } = element.data;
      const handles = [
        { x: rx, y: ry, handle: 'top-left' },
        { x: rx + w / 2, y: ry, handle: 'top' },
        { x: rx + w, y: ry, handle: 'top-right' },
        { x: rx, y: ry + h / 2, handle: 'left' },
        { x: rx + w, y: ry + h / 2, handle: 'right' },
        { x: rx, y: ry + h, handle: 'bottom-left' },
        { x: rx + w / 2, y: ry + h, handle: 'bottom' },
        { x: rx + w, y: ry + h, handle: 'bottom-right' },
        { x: rx + w / 2, y: ry - 30, handle: 'rotate' },
      ];
      
      for (const h of handles) {
        if (Math.sqrt(Math.pow(x - h.x, 2) + Math.pow(y - h.y, 2)) < handleRadius) {
          return { type: h.handle === 'rotate' ? 'rotate' : 'resize', handle: h.handle };
        }
      }
    } else if (element.type === 'circle') {
      const { cx, cy, r } = element.data;
      if (Math.sqrt(Math.pow(x - (cx + r), 2) + Math.pow(y - cy, 2)) < handleRadius) {
        return { type: 'resize', handle: 'radius' };
      }
      if (Math.sqrt(Math.pow(x - cx, 2) + Math.pow(y - (cy - r - 30), 2)) < handleRadius) {
        return { type: 'rotate', handle: 'rotate' };
      }
    } else if (element.type === 'line' || element.type === 'arrow' || element.type === 'pointer' || element.type === 'memo') {
      const { x1, y1, x2, y2 } = element.data;
      if (Math.sqrt(Math.pow(x - x1, 2) + Math.pow(y - y1, 2)) < handleRadius) {
        return { type: 'resize', handle: 'start' };
      }
      if (Math.sqrt(Math.pow(x - x2, 2) + Math.pow(y - y2, 2)) < handleRadius) {
        return { type: 'resize', handle: 'end' };
      }
      const midX = (x1 + x2) / 2;
      const midY = (y1 + y2) / 2;
      if (Math.sqrt(Math.pow(x - midX, 2) + Math.pow(y - (midY - 30), 2)) < handleRadius) {
        return { type: 'rotate', handle: 'rotate' };
      }
    } else if (element.type === 'image') {
      const elX = element.x || 0;
      const elY = element.y || 0;
      const elW = element.width || 100;
      const elH = element.height || 100;
      
      const handles = [
        { x: elX, y: elY, handle: 'top-left' },
        { x: elX + elW, y: elY, handle: 'top-right' },
        { x: elX, y: elY + elH, handle: 'bottom-left' },
        { x: elX + elW, y: elY + elH, handle: 'bottom-right' },
        { x: elX + elW / 2, y: elY - 30, handle: 'rotate' },
      ];
      
      for (const h of handles) {
        if (Math.sqrt(Math.pow(x - h.x, 2) + Math.pow(y - h.y, 2)) < handleRadius) {
          return { type: h.handle === 'rotate' ? 'rotate' : 'resize', handle: h.handle };
        }
      }
    }
    
    return null;
  };

  // Render element
  const renderElement = (element: DrawElement) => {
    const isSelected = element.id === selectedElementId;
    
    switch (element.type) {
      case 'path':
        return (
          <G key={element.id}>
            <Path
              d={element.data}
              stroke={element.color}
              strokeWidth={element.strokeWidth}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {isSelected && (
              <Path
                d={element.data}
                stroke="#2196f3"
                strokeWidth={element.strokeWidth + 4}
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={0.4}
              />
            )}
          </G>
        );
      
      case 'polygon':
        // Closed freeform shape - filled with semi-transparent color
        return (
          <G key={element.id}>
            <Path
              d={element.data}
              stroke={element.color}
              strokeWidth={element.strokeWidth}
              fill={element.color}
              fillOpacity={0.3}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {isSelected && (
              <Path
                d={element.data}
                stroke="#2196f3"
                strokeWidth={2}
                fill="none"
                strokeDasharray="5,5"
              />
            )}
          </G>
        );
      
      case 'line':
        const lineCenterX = (element.data.x1 + element.data.x2) / 2;
        const lineCenterY = (element.data.y1 + element.data.y2) / 2;
        return (
          <G key={element.id}>
            <Line
              x1={element.data.x1}
              y1={element.data.y1}
              x2={element.data.x2}
              y2={element.data.y2}
              stroke={element.color}
              strokeWidth={element.strokeWidth}
              transform={element.rotation ? `rotate(${element.rotation} ${lineCenterX} ${lineCenterY})` : undefined}
            />
            {isSelected && renderTransformHandles(element)}
          </G>
        );
      
      case 'circle':
        return (
          <G key={element.id}>
            <Circle
              cx={element.data.cx}
              cy={element.data.cy}
              r={element.data.r}
              stroke={element.color}
              strokeWidth={element.strokeWidth}
              fill="none"
              transform={element.rotation ? `rotate(${element.rotation} ${element.data.cx} ${element.data.cy})` : undefined}
            />
            {isSelected && renderTransformHandles(element)}
          </G>
        );
      
      case 'rect':
        const rectCenterX = element.data.x + element.data.width / 2;
        const rectCenterY = element.data.y + element.data.height / 2;
        return (
          <G key={element.id}>
            <Rect
              x={element.data.x}
              y={element.data.y}
              width={element.data.width}
              height={element.data.height}
              stroke={element.color}
              strokeWidth={element.strokeWidth}
              fill="none"
              transform={element.rotation ? `rotate(${element.rotation} ${rectCenterX} ${rectCenterY})` : undefined}
            />
            {isSelected && renderTransformHandles(element)}
          </G>
        );
      
      case 'text':
        return (
          <G key={element.id}>
            <SvgText
              x={element.x}
              y={element.y}
              fill={element.color}
              fontSize={element.fontSize || 20}
              fontWeight={element.fontWeight || 'bold'}
              fontStyle={element.fontStyle || 'normal'}
              fontFamily={element.fontFamily || 'sans-serif'}
              transform={element.rotation ? `rotate(${element.rotation} ${element.x} ${element.y})` : undefined}
            >
              {element.data.text}
            </SvgText>
            {isSelected && renderTransformHandles(element)}
          </G>
        );
      
      case 'image':
        const imgX = element.x || 0;
        const imgY = element.y || 0;
        const imgW = element.width || 100;
        const imgH = element.height || 100;
        const imgCenterX = imgX + imgW / 2;
        const imgCenterY = imgY + imgH / 2;
        return (
          <G key={element.id}>
            <SvgImage
              href={element.data.uri}
              x={imgX}
              y={imgY}
              width={imgW}
              height={imgH}
              transform={element.rotation ? `rotate(${element.rotation} ${imgCenterX} ${imgCenterY})` : undefined}
            />
            {isSelected && renderTransformHandles(element)}
          </G>
        );
      
      case 'arrow':
        const { x1, y1, x2, y2, text, heads } = element.data;
        const midX = (x1 + x2) / 2;
        const midY = (y1 + y2) / 2;
        const angle = Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI;
        
        return (
          <G key={element.id}>
            <Defs>
              <Marker
                id={`arrowhead-end-${element.id}`}
                markerWidth="10"
                markerHeight="10"
                refX="9"
                refY="3"
                orient="auto"
                markerUnits="strokeWidth"
              >
                <Polygon points="0,0 0,6 9,3" fill={element.color} />
              </Marker>
              <Marker
                id={`arrowhead-start-${element.id}`}
                markerWidth="10"
                markerHeight="10"
                refX="0"
                refY="3"
                orient="auto"
                markerUnits="strokeWidth"
              >
                <Polygon points="9,0 9,6 0,3" fill={element.color} />
              </Marker>
            </Defs>
            <Line
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke={element.color}
              strokeWidth={element.strokeWidth}
              markerEnd={`url(#arrowhead-end-${element.id})`}
              markerStart={heads === 'double' ? `url(#arrowhead-start-${element.id})` : undefined}
              transform={element.rotation ? `rotate(${element.rotation} ${midX} ${midY})` : undefined}
            />
            {text && (
              <SvgText
                x={midX}
                y={midY - 10}
                fill={element.color}
                fontSize={element.data.fontSize || 14}
                fontWeight="bold"
                textAnchor="middle"
                transform={`rotate(${angle} ${midX} ${midY})`}
              >
                {text}
              </SvgText>
            )}
            {isSelected && renderTransformHandles(element)}
          </G>
        );
      
      case 'pointer':
        // Großer Zeigepfeil mit nur einer prominenten Pfeilspitze am Ende (Memo-Pfeil)
        const ptrX1 = element.data.x1;
        const ptrY1 = element.data.y1;
        const ptrX2 = element.data.x2;
        const ptrY2 = element.data.y2;
        const ptrText = element.data.text || '';
        const ptrFontSize = element.data.fontSize || 16;
        const ptrMidX = (ptrX1 + ptrX2) / 2;
        const ptrMidY = (ptrY1 + ptrY2) / 2;
        const ptrAngle = Math.atan2(ptrY2 - ptrY1, ptrX2 - ptrX1);
        const ptrAngleDeg = ptrAngle * 180 / Math.PI;
        
        // Pfeilspitze proportional zur Strichdicke (skaliert für alle Größen)
        // Bei strokeWidth 1 → 12, bei 3 → 18, bei 8 → 32
        const arrowHeadSize = Math.max(12, element.strokeWidth * 4);
        const arrowHeadAngle = Math.PI / 6; // 30 Grad
        
        // Pfeilspitzen-Koordinaten
        const tipX = ptrX2;
        const tipY = ptrY2;
        const leftX = ptrX2 - arrowHeadSize * Math.cos(ptrAngle - arrowHeadAngle);
        const leftY = ptrY2 - arrowHeadSize * Math.sin(ptrAngle - arrowHeadAngle);
        const rightX = ptrX2 - arrowHeadSize * Math.cos(ptrAngle + arrowHeadAngle);
        const rightY = ptrY2 - arrowHeadSize * Math.sin(ptrAngle + arrowHeadAngle);
        
        // Linie bis kurz vor der Pfeilspitze
        const lineEndX = ptrX2 - arrowHeadSize * 0.6 * Math.cos(ptrAngle);
        const lineEndY = ptrY2 - arrowHeadSize * 0.6 * Math.sin(ptrAngle);
        
        // Position für den Text (etwas oberhalb der Linie, am Startpunkt)
        const textOffsetX = ptrX1 + 15 * Math.cos(ptrAngle - Math.PI / 2);
        const textOffsetY = ptrY1 + 15 * Math.sin(ptrAngle - Math.PI / 2);
        
        return (
          <G key={element.id}>
            {/* Dicke Linie */}
            <Line
              x1={ptrX1}
              y1={ptrY1}
              x2={lineEndX}
              y2={lineEndY}
              stroke={element.color}
              strokeWidth={element.strokeWidth}
              strokeLinecap="round"
              transform={element.rotation ? `rotate(${element.rotation} ${ptrMidX} ${ptrMidY})` : undefined}
            />
            {/* Große gefüllte Pfeilspitze */}
            <Polygon
              points={`${tipX},${tipY} ${leftX},${leftY} ${rightX},${rightY}`}
              fill={element.color}
              stroke={element.color}
              strokeWidth={2}
              transform={element.rotation ? `rotate(${element.rotation} ${ptrMidX} ${ptrMidY})` : undefined}
            />
            {/* Notiz-Text am Startpunkt (wenn vorhanden) */}
            {ptrText && (
              <G>
                {/* Hintergrund für bessere Lesbarkeit - Rahmen skaliert proportional zur Schriftgröße */}
                {(() => {
                  // Skalierungsfaktor basierend auf Schriftgröße (Basis: 16px)
                  const ptrScaleFactor = ptrFontSize / 16;
                  const ptrFrameStroke = Math.max(1, 2 * ptrScaleFactor);
                  const ptrFrameRadius = Math.max(2, 4 * ptrScaleFactor);
                  const ptrPaddingX = 5 * ptrScaleFactor;
                  const ptrPaddingY = 8 * ptrScaleFactor;
                  return (
                    <>
                      <Rect
                        x={textOffsetX - ptrPaddingX}
                        y={textOffsetY - ptrFontSize}
                        width={ptrText.length * ptrFontSize * 0.6 + 2 * ptrPaddingX}
                        height={ptrFontSize + ptrPaddingY}
                        fill="rgba(255, 255, 255, 0.9)"
                        rx={ptrFrameRadius}
                        ry={ptrFrameRadius}
                        stroke={element.color}
                        strokeWidth={ptrFrameStroke}
                      />
                      <SvgText
                        x={textOffsetX}
                        y={textOffsetY}
                        fill={element.color}
                        fontSize={ptrFontSize}
                        fontWeight="bold"
                      >
                        {ptrText}
                      </SvgText>
                    </>
                  );
                })()}
              </G>
            )}
            {isSelected && renderTransformHandles(element)}
          </G>
        );
      
      case 'memo':
        // Memo/Notiz: Roter Ankerpunkt mit gestrichelter Linie zu Textlabel (wie in Flächenberechnung)
        const memoX1 = element.data.x1; // Ankerpunkt
        const memoY1 = element.data.y1;
        const memoX2 = element.data.x2; // Textlabel Position
        const memoY2 = element.data.y2;
        const memoTextContent = element.data.text || '';
        const memoFontSize = element.data.fontSize || 14;
        const memoMidX = (memoX1 + memoX2) / 2;
        const memoMidY = (memoY1 + memoY2) / 2;
        
        // Skalierungsfaktor basierend auf Schriftgröße (Basis: 14px)
        const memoScaleFactor = memoFontSize / 14;
        
        // Berechne Textbreite für das Label - proportional skaliert
        const memoLabelWidth = Math.max(60 * memoScaleFactor, memoTextContent.length * memoFontSize * 0.6 + 20 * memoScaleFactor);
        const memoLabelHeight = memoFontSize + 14 * memoScaleFactor;
        
        // Rahmen-Attribute proportional zur Schriftgröße
        const memoLineStroke = Math.max(1, 2 * memoScaleFactor);
        const memoAnchorRadius = Math.max(3, 6 * memoScaleFactor);
        const memoFrameStroke = Math.max(1, 2 * memoScaleFactor);
        const memoFrameRadius = Math.max(2, 4 * memoScaleFactor);
        const memoDashArray = `${6 * memoScaleFactor},${4 * memoScaleFactor}`;
        
        return (
          <G key={element.id}>
            {/* Gestrichelte Verbindungslinie - skaliert */}
            <Line
              x1={memoX1}
              y1={memoY1}
              x2={memoX2}
              y2={memoY2}
              stroke={element.color}
              strokeWidth={memoLineStroke}
              strokeDasharray={memoDashArray}
              transform={element.rotation ? `rotate(${element.rotation} ${memoMidX} ${memoMidY})` : undefined}
            />
            {/* Roter Ankerpunkt (gefüllter Kreis) - skaliert */}
            <Circle
              cx={memoX1}
              cy={memoY1}
              r={memoAnchorRadius}
              fill={element.color}
              stroke={element.color}
              strokeWidth={memoLineStroke}
              transform={element.rotation ? `rotate(${element.rotation} ${memoMidX} ${memoMidY})` : undefined}
            />
            {/* Textlabel mit Rahmen - skaliert */}
            <G transform={element.rotation ? `rotate(${element.rotation} ${memoMidX} ${memoMidY})` : undefined}>
              {/* Weißer Hintergrund mit farbigem Rahmen - skaliert */}
              <Rect
                x={memoX2 - memoLabelWidth / 2}
                y={memoY2 - memoLabelHeight / 2}
                width={memoLabelWidth}
                height={memoLabelHeight}
                fill="white"
                rx={memoFrameRadius}
                ry={memoFrameRadius}
                stroke={element.color}
                strokeWidth={memoFrameStroke}
              />
              {/* Text im Label */}
              <SvgText
                x={memoX2}
                y={memoY2 + memoFontSize / 3}
                fill={element.color}
                fontSize={memoFontSize}
                fontWeight="bold"
                textAnchor="middle"
              >
                {memoTextContent}
              </SvgText>
            </G>
            {isSelected && renderTransformHandles(element)}
          </G>
        );
      
      case 'polyline':
        const { points, closed } = element.data;
        if (!points || points.length < 2) return null;
        
        // Erstelle Path-String aus Punkten
        let polylinePath = `M ${points[0].x} ${points[0].y}`;
        for (let i = 1; i < points.length; i++) {
          polylinePath += ` L ${points[i].x} ${points[i].y}`;
        }
        if (closed) {
          polylinePath += ' Z';
        }
        
        // Prüfe ob dieses Element ein ausgewähltes Segment hat
        const hasSelectedSegment = selectedLineSegment?.elementId === element.id;
        const selectedSegIdx = hasSelectedSegment ? selectedLineSegment.segmentIndex : -1;
        
        // Maße für dieses Element
        const elementMeasurements = lineSegmentMeasurements[element.id] || {};
        
        return (
          <G key={element.id}>
            <Path
              d={polylinePath}
              stroke={element.color}
              strokeWidth={element.strokeWidth}
              fill={closed ? 'rgba(33, 150, 243, 0.1)' : 'none'}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            
            {/* Ausgewähltes Segment hervorheben */}
            {hasSelectedSegment && selectedSegIdx >= 0 && selectedSegIdx < points.length && (() => {
              const p1 = points[selectedSegIdx];
              const p2 = selectedSegIdx === points.length - 1 && closed 
                ? points[0] 
                : points[selectedSegIdx + 1];
              if (!p1 || !p2) return null;
              return (
                <Line
                  x1={p1.x}
                  y1={p1.y}
                  x2={p2.x}
                  y2={p2.y}
                  stroke="#FF9800"
                  strokeWidth={element.strokeWidth + 4}
                  strokeLinecap="round"
                  opacity={0.7}
                />
              );
            })()}
            
            {/* Maßlinien für alle Segmente mit Maßen anzeigen */}
            {Object.keys(elementMeasurements).map((segIdxStr) => {
              const segIdx = parseInt(segIdxStr, 10);
              const measurementText = elementMeasurements[segIdx];
              if (!measurementText) return null;
              
              const p1 = points[segIdx];
              const p2 = segIdx === points.length - 1 && closed 
                ? points[0] 
                : points[segIdx + 1];
              if (!p1 || !p2) return null;
              
              // Mittelpunkt der Linie
              const midX = (p1.x + p2.x) / 2;
              const midY = (p1.y + p2.y) / 2;
              
              // Winkel der Linie
              const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
              
              // Berechne den Schwerpunkt (Centroid) des Polygons
              const centroidX = points.reduce((acc: number, pt: { x: number; y: number }) => acc + pt.x, 0) / points.length;
              const centroidY = points.reduce((acc: number, pt: { x: number; y: number }) => acc + pt.y, 0) / points.length;
              
              // Normalenvektor der Kante (senkrecht zur Kante)
              // Standard-Normale zeigt nach "links" der Zeichenrichtung
              const normalX = -Math.sin(angle);
              const normalY = Math.cos(angle);
              
              // Vektor vom Mittelpunkt zum Schwerpunkt
              const towardsCenterX = centroidX - midX;
              const towardsCenterY = centroidY - midY;
              
              // Skalarprodukt: Wenn positiv, zeigt Normale Richtung Schwerpunkt (= innen)
              // Dann müssen wir die Normale umkehren, damit sie nach außen zeigt
              const dotProduct = normalX * towardsCenterX + normalY * towardsCenterY;
              
              // Skalierte Größen basierend auf Zoom-Level
              const baseOffsetMagnitude = 16;
              const baseTickLength = 6;
              const baseStrokeWidth = 1.2;
              const baseFontSize = 11;
              
              const scaledOffsetMagnitude = Math.max(8, baseOffsetMagnitude / Math.max(scale, 0.5));
              const scaledTickLength = Math.max(3, baseTickLength / Math.max(scale, 0.5));
              const scaledStrokeWidth = Math.max(0.5, baseStrokeWidth / Math.max(scale, 0.5));
              const scaledFontSize = Math.max(6, baseFontSize / Math.max(scale, 0.5));
              
              // Wenn dotProduct > 0, zeigt Normale nach innen -> umkehren
              // Wenn dotProduct < 0, zeigt Normale nach außen -> beibehalten
              const sign = dotProduct > 0 ? -1 : 1;
              const offsetX = normalX * scaledOffsetMagnitude * sign;
              const offsetY = normalY * scaledOffsetMagnitude * sign;
              
              // Text-Box Dimensionen - skaliert
              const charWidth = scaledFontSize * 0.6;
              const boxWidth = measurementText.length * charWidth + scaledFontSize * 0.6;
              const boxHeight = scaledFontSize * 1.3;
              
              return (
                <G key={`measure-${element.id}-${segIdx}`}>
                  {/* Maßlinie parallel zur Original-Linie */}
                  <Line
                    x1={p1.x + offsetX}
                    y1={p1.y + offsetY}
                    x2={p2.x + offsetX}
                    y2={p2.y + offsetY}
                    stroke="#1976d2"
                    strokeWidth={scaledStrokeWidth}
                  />
                  {/* End-Strich links */}
                  <Line
                    x1={p1.x + offsetX - Math.sin(angle) * scaledTickLength}
                    y1={p1.y + offsetY + Math.cos(angle) * scaledTickLength}
                    x2={p1.x + offsetX + Math.sin(angle) * scaledTickLength}
                    y2={p1.y + offsetY - Math.cos(angle) * scaledTickLength}
                    stroke="#1976d2"
                    strokeWidth={scaledStrokeWidth}
                  />
                  {/* End-Strich rechts */}
                  <Line
                    x1={p2.x + offsetX - Math.sin(angle) * scaledTickLength}
                    y1={p2.y + offsetY + Math.cos(angle) * scaledTickLength}
                    x2={p2.x + offsetX + Math.sin(angle) * scaledTickLength}
                    y2={p2.y + offsetY - Math.cos(angle) * scaledTickLength}
                    stroke="#1976d2"
                    strokeWidth={scaledStrokeWidth}
                  />
                  {/* Hintergrund für Text - skaliert */}
                  <Rect
                    x={midX + offsetX - boxWidth / 2}
                    y={midY + offsetY - boxHeight / 2}
                    width={boxWidth}
                    height={boxHeight}
                    fill="white"
                    rx={2}
                    ry={2}
                  />
                  {/* Maß-Text - skaliert */}
                  <SvgText
                    x={midX + offsetX}
                    y={midY + offsetY + scaledFontSize * 0.35}
                    fill="#1976d2"
                    fontSize={scaledFontSize}
                    fontWeight="bold"
                    textAnchor="middle"
                  >
                    {measurementText}
                  </SvgText>
                </G>
              );
            })}
            
            {/* Label (S1, S2, S3...) im Zentrum des Grundrisses - kleiner und verschiebbar */}
            {(() => {
              // Berechne Zentrum des Grundrisses
              const sumX = points.reduce((acc: number, pt: { x: number; y: number }) => acc + pt.x, 0);
              const sumY = points.reduce((acc: number, pt: { x: number; y: number }) => acc + pt.y, 0);
              const centerX = sumX / points.length;
              const centerY = sumY / points.length;
              
              // Finde Index dieses Elements unter allen Polylines mit Maßen
              const polylinesWithMeasurements = getPolylineElementsWithMeasurements();
              const labelIndex = polylinesWithMeasurements.findIndex(el => el.id === element.id);
              
              // Nur Label anzeigen wenn dieses Element Maße hat
              if (labelIndex === -1) return null;
              
              const labelText = `S${labelIndex + 1}`;
              
              // Label-Offset aus State holen (falls vorhanden)
              const offset = labelOffsets[element.id] || { x: 0, y: 0 };
              const labelX = centerX + offset.x;
              const labelY = centerY + offset.y;
              
              // Skalierte Größen basierend auf Zoom-Level
              const baseLabelRadius = 10;
              const baseLabelFontSize = 9;
              const baseLabelStroke = 1.2;
              const baseLineStroke = 1.2;
              
              const scaledLabelRadius = Math.max(5, baseLabelRadius / Math.max(scale, 0.5));
              const scaledLabelFontSize = Math.max(5, baseLabelFontSize / Math.max(scale, 0.5));
              const scaledLabelStroke = Math.max(0.5, baseLabelStroke / Math.max(scale, 0.5));
              const scaledLineStroke = Math.max(0.5, baseLineStroke / Math.max(scale, 0.5));
              
              // Verbindungslinie nur anzeigen wenn das Label verschoben wurde
              const hasOffset = offset.x !== 0 || offset.y !== 0;
              
              return (
                <G key={`label-${element.id}`}>
                  {/* Verbindungslinie zum Zentrum wenn Label verschoben */}
                  {hasOffset && (
                    <Line
                      x1={centerX}
                      y1={centerY}
                      x2={labelX}
                      y2={labelY}
                      stroke="#1976d2"
                      strokeWidth={scaledLineStroke}
                      strokeDasharray="3,2"
                      opacity={0.7}
                    />
                  )}
                  {/* Hintergrund-Kreis für Label - skaliert */}
                  <Circle
                    cx={labelX}
                    cy={labelY}
                    r={scaledLabelRadius}
                    fill="#1976d2"
                    stroke="#fff"
                    strokeWidth={scaledLabelStroke}
                  />
                  {/* Label-Text - skaliert */}
                  <SvgText
                    x={labelX}
                    y={labelY + scaledLabelFontSize * 0.35}
                    fill="#fff"
                    fontSize={scaledLabelFontSize}
                    fontWeight="bold"
                    textAnchor="middle"
                  >
                    {labelText}
                  </SvgText>
                  {/* Transparenter Kreis als Touch-Target für Verschieben (größer als sichtbarer Kreis) */}
                  <Circle
                    cx={labelX}
                    cy={labelY}
                    r={scaledLabelRadius + 10}
                    fill="transparent"
                  />
                </G>
              );
            })()}
            
            {/* Punkte anzeigen wenn ausgewählt - skaliert mit Zoom */}
            {isSelected && points.map((pt: { x: number; y: number }, idx: number) => {
              // Größe wird durch Zoom-Level skaliert: größerer Zoom = kleinere Punkte
              const baseRadius = editingPolylinePoint === idx ? 10 : 6;
              const scaledRadius = Math.max(3, baseRadius / Math.max(scale, 0.5)); // Minimum 3px
              const baseStroke = editingPolylinePoint === idx ? 2.5 : 1.5;
              const scaledStroke = Math.max(1, baseStroke / Math.max(scale, 0.5));
              
              return (
                <Circle 
                  key={`polyline-pt-${idx}`}
                  cx={pt.x} 
                  cy={pt.y} 
                  r={scaledRadius} 
                  fill={editingPolylinePoint === idx ? '#ff5722' : (idx === 0 ? '#4caf50' : '#2196f3')} 
                  stroke="#fff" 
                  strokeWidth={scaledStroke} 
                />
              );
            })}
            {/* Mittelpunkt zum Verschieben des gesamten Polygons - winzig klein um Linien nicht zu überdecken */}
            {isSelected && points.length >= 2 && (() => {
              const centerX = points.reduce((sum: number, pt: { x: number }) => sum + pt.x, 0) / points.length;
              const centerY = points.reduce((sum: number, pt: { y: number }) => sum + pt.y, 0) / points.length;
              // Radius winzig klein gemacht (2 statt 12) damit Linien besser sichtbar sind auf iPhone
              const scaledMoveRadius = Math.max(2, 2 / Math.max(scale, 0.5));
              const scaledMoveStroke = Math.max(0.3, 0.5 / Math.max(scale, 0.5));
              
              return (
                <G key="move-handle">
                  <Circle 
                    cx={centerX} 
                    cy={centerY} 
                    r={scaledMoveRadius} 
                    fill="#FF9800" 
                    stroke="#fff" 
                    strokeWidth={scaledMoveStroke} 
                  />
                </G>
              );
            })()}
            {isSelected && renderTransformHandles(element)}
          </G>
        );
      
      default:
        return null;
    }
  };

  // Render transformation handles
  const renderTransformHandles = (element: DrawElement) => {
    const handles: JSX.Element[] = [];
    
    if (element.type === 'rect') {
      const { x, y, width: w, height: h } = element.data;
      const handlePositions = [
        { x, y, label: '↖' },
        { x: x + w / 2, y, label: '↑' },
        { x: x + w, y, label: '↗' },
        { x, y: y + h / 2, label: '←' },
        { x: x + w, y: y + h / 2, label: '→' },
        { x, y: y + h, label: '↙' },
        { x: x + w / 2, y: y + h, label: '↓' },
        { x: x + w, y: y + h, label: '↘' },
      ];
      
      handlePositions.forEach((pos, idx) => {
        handles.push(
          <G key={`handle-${idx}`}>
            <Circle cx={pos.x} cy={pos.y} r={8} fill="#4caf50" stroke="#fff" strokeWidth={2} />
            <SvgText x={pos.x - 4} y={pos.y + 5} fill="#fff" fontSize={10}>{pos.label}</SvgText>
          </G>
        );
      });
      
      // Rotation handle
      handles.push(
        <G key="rotate">
          <Circle cx={x + w / 2} cy={y - 30} r={10} fill="#FF9800" stroke="#fff" strokeWidth={2} />
          <SvgText x={x + w / 2 - 5} y={y - 30 + 5} fill="#fff" fontSize={12}>↻</SvgText>
        </G>
      );
    } else if (element.type === 'circle') {
      const { cx, cy, r } = element.data;
      handles.push(
        <G key="radius">
          <Circle cx={cx + r} cy={cy} r={8} fill="#4caf50" stroke="#fff" strokeWidth={2} />
          <SvgText x={cx + r - 4} y={cy + 5} fill="#fff" fontSize={10}>↔</SvgText>
        </G>
      );
      handles.push(
        <G key="rotate">
          <Circle cx={cx} cy={cy - r - 30} r={10} fill="#FF9800" stroke="#fff" strokeWidth={2} />
          <SvgText x={cx - 5} y={cy - r - 30 + 5} fill="#fff" fontSize={12}>↻</SvgText>
        </G>
      );
    } else if (element.type === 'line' || element.type === 'arrow' || element.type === 'pointer' || element.type === 'memo') {
      const { x1, y1, x2, y2 } = element.data;
      handles.push(
        <Circle key="start" cx={x1} cy={y1} r={8} fill="#2196f3" stroke="#fff" strokeWidth={2} />
      );
      handles.push(
        <Circle key="end" cx={x2} cy={y2} r={8} fill="#2196f3" stroke="#fff" strokeWidth={2} />
      );
      const midX = (x1 + x2) / 2;
      const midY = (y1 + y2) / 2;
      handles.push(
        <G key="rotate">
          <Circle cx={midX} cy={midY - 30} r={10} fill="#FF9800" stroke="#fff" strokeWidth={2} />
          <SvgText x={midX - 5} y={midY - 30 + 5} fill="#fff" fontSize={12}>↻</SvgText>
        </G>
      );
    } else if (element.type === 'image') {
      const imgX = element.x || 0;
      const imgY = element.y || 0;
      const imgW = element.width || 100;
      const imgH = element.height || 100;
      
      const corners = [
        { x: imgX, y: imgY },
        { x: imgX + imgW, y: imgY },
        { x: imgX, y: imgY + imgH },
        { x: imgX + imgW, y: imgY + imgH },
      ];
      
      corners.forEach((pos, idx) => {
        handles.push(
          <Circle key={`corner-${idx}`} cx={pos.x} cy={pos.y} r={8} fill="#4caf50" stroke="#fff" strokeWidth={2} />
        );
      });
      
      handles.push(
        <G key="rotate">
          <Circle cx={imgX + imgW / 2} cy={imgY - 30} r={10} fill="#FF9800" stroke="#fff" strokeWidth={2} />
          <SvgText x={imgX + imgW / 2 - 5} y={imgY - 30 + 5} fill="#fff" fontSize={12}>↻</SvgText>
        </G>
      );
    }
    
    return <G>{handles}</G>;
  };

  // Save sketch
  const generatePreviewSvg = () => {
    // NEW ARCHITECTURE: Use viewBox for scaling instead of transforming coordinates
    // This preserves original element sizes (especially text) and lets the browser handle scaling
    
    // Calculate bounds of all elements
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    let hasValidBounds = false;
    
    elements.forEach(el => {
      if (el.type === 'path') {
        const matches = el.data.match(/(-?\d+\.?\d*)/g);
        if (matches) {
          for (let i = 0; i < matches.length; i += 2) {
            const x = parseFloat(matches[i]);
            const y = parseFloat(matches[i + 1]);
            if (!isNaN(x) && !isNaN(y)) {
              minX = Math.min(minX, x);
              maxX = Math.max(maxX, x);
              minY = Math.min(minY, y);
              maxY = Math.max(maxY, y);
              hasValidBounds = true;
            }
          }
        }
      } else if (el.type === 'line' || el.type === 'arrow' || el.type === 'pointer') {
        minX = Math.min(minX, el.data.x1, el.data.x2);
        maxX = Math.max(maxX, el.data.x1, el.data.x2);
        minY = Math.min(minY, el.data.y1, el.data.y2);
        maxY = Math.max(maxY, el.data.y1, el.data.y2);
        // For text on arrows, account for text offset
        if (el.type === 'arrow' && el.data.text) {
          const textOffset = 20;
          minY = Math.min(minY, el.data.y1 - textOffset, el.data.y2 - textOffset);
        }
        if (el.type === 'pointer' && el.data.text) {
          const fontSize = el.data.fontSize || 16;
          const textOffset = 30 + fontSize;
          minX = Math.min(minX, el.data.x1 - textOffset);
          minY = Math.min(minY, el.data.y1 - textOffset);
          maxX = Math.max(maxX, el.data.x1 + (el.data.text.length * fontSize * 0.6));
        }
        hasValidBounds = true;
      } else if (el.type === 'circle') {
        minX = Math.min(minX, el.data.cx - el.data.r);
        maxX = Math.max(maxX, el.data.cx + el.data.r);
        minY = Math.min(minY, el.data.cy - el.data.r);
        maxY = Math.max(maxY, el.data.cy + el.data.r);
        hasValidBounds = true;
      } else if (el.type === 'rect') {
        minX = Math.min(minX, el.data.x);
        maxX = Math.max(maxX, el.data.x + el.data.width);
        minY = Math.min(minY, el.data.y);
        maxY = Math.max(maxY, el.data.y + el.data.height);
        hasValidBounds = true;
      } else if (el.type === 'image' || el.type === 'text') {
        const x = el.x || 0;
        const y = el.y || 0;
        const w = el.width || (el.type === 'text' ? (el.data?.text?.length || 10) * ((el.fontSize || 20) * 0.6) : 50);
        const h = el.height || (el.type === 'text' ? (el.fontSize || 20) + 10 : 50);
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x + w);
        // For text, y is the baseline, so we need to account for the height above baseline
        minY = Math.min(minY, y - (el.type === 'text' ? (el.fontSize || 20) : 0));
        maxY = Math.max(maxY, y + h);
        hasValidBounds = true;
      } else if (el.type === 'polyline' && el.data?.points) {
        el.data.points.forEach((pt: { x: number; y: number }) => {
          minX = Math.min(minX, pt.x);
          maxX = Math.max(maxX, pt.x);
          minY = Math.min(minY, pt.y);
          maxY = Math.max(maxY, pt.y);
        });
        // Account for dimension lines offset (15px) and text
        const elementMeasurements = lineSegmentMeasurements[el.id];
        if (elementMeasurements && Object.keys(elementMeasurements).length > 0) {
          // Add extra space for dimension lines (offset + tick + text)
          minX -= 30;
          maxX += 30;
          minY -= 30;
          maxY += 30;
        }
        hasValidBounds = true;
      } else if (el.type === 'polygon') {
        const matches = el.data.match(/(-?\d+\.?\d*)/g);
        if (matches) {
          for (let i = 0; i < matches.length; i += 2) {
            const x = parseFloat(matches[i]);
            const y = parseFloat(matches[i + 1]);
            if (!isNaN(x) && !isNaN(y)) {
              minX = Math.min(minX, x);
              maxX = Math.max(maxX, x);
              minY = Math.min(minY, y);
              maxY = Math.max(maxY, y);
              hasValidBounds = true;
            }
          }
        }
      }
    });
    
    // If no valid bounds found, use default canvas size
    if (!hasValidBounds) {
      minX = 0;
      minY = 0;
      maxX = 400;
      maxY = 400;
    }
    
    // Add padding
    const padding = 30;
    
    // Speichere die originalen Bounds (vor Padding und Legend-Erweiterung)
    const origMinX = minX - padding;
    const origMinY = minY - padding;
    
    minX -= padding;
    minY -= padding;
    maxX += padding;
    maxY += padding;
    
    // Berechne Legend-Position für die viewBox-Erweiterung
    // VERGRÖSSERTE Legend für PDF/Vorschau
    const polylinesForLegend = getPolylineElementsWithMeasurements();
    const svgLegendWidth = 220; // Noch breiter für bessere Lesbarkeit
    const svgLegendLineHeight = 36; // Deutlich höhere Zeilen
    const svgLegendHeight = polylinesForLegend.length > 0 ? (55 + polylinesForLegend.length * svgLegendLineHeight + 25) : 0;
    
    // Legend-Position berechnen (wird auch später für das Rendering verwendet)
    const canvasWidthForLegend = width;
    const canvasHeightForLegend = height - 120;
    const uiStartXLegend = canvasWidthForLegend - 12 - svgLegendWidth;
    const uiStartYLegend = canvasHeightForLegend - 150;
    const uiFinalXLegend = uiStartXLegend + legendPosition.x;
    const uiFinalYLegend = uiStartYLegend + legendPosition.y;
    
    // SVG-Koordinaten für Legend (relativ zur ursprünglichen minX/minY)
    const svgLegendXPos = origMinX + uiFinalXLegend;
    const svgLegendYPos = origMinY + uiFinalYLegend;
    
    // Erweitere die Bounds um die Legend-Position zu berücksichtigen
    if (polylinesForLegend.length > 0) {
      // Stelle sicher, dass die Legend komplett sichtbar ist
      if (svgLegendXPos < minX) minX = svgLegendXPos - 10;
      if (svgLegendXPos + svgLegendWidth > maxX) maxX = svgLegendXPos + svgLegendWidth + 10;
      if (svgLegendYPos - svgLegendHeight < minY) minY = svgLegendYPos - svgLegendHeight - 10;
      if (svgLegendYPos > maxY) maxY = svgLegendYPos + 10;
    }
    
    // Calculate actual drawing dimensions
    const drawWidth = Math.max(maxX - minX, 100);
    const drawHeight = Math.max(maxY - minY, 100);
    
    // Generate SVG with ORIGINAL coordinates - viewBox handles scaling
    let svgElements = '';
    
    elements.forEach(el => {
      const strokeWidth = el.strokeWidth || 2;
      
      if (el.type === 'path') {
        svgElements += `<path d="${el.data}" stroke="${el.color}" stroke-width="${strokeWidth}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
      } else if (el.type === 'line') {
        svgElements += `<line x1="${el.data.x1}" y1="${el.data.y1}" x2="${el.data.x2}" y2="${el.data.y2}" stroke="${el.color}" stroke-width="${strokeWidth}"/>`;
      } else if (el.type === 'circle') {
        svgElements += `<circle cx="${el.data.cx}" cy="${el.data.cy}" r="${el.data.r}" stroke="${el.color}" stroke-width="${strokeWidth}" fill="none"/>`;
      } else if (el.type === 'rect') {
        svgElements += `<rect x="${el.data.x}" y="${el.data.y}" width="${el.data.width}" height="${el.data.height}" stroke="${el.color}" stroke-width="${strokeWidth}" fill="none"/>`;
      } else if (el.type === 'arrow') {
        const { x1, y1, x2, y2, text, heads } = el.data;
        const angle = Math.atan2(y2 - y1, x2 - x1);
        const angleDeg = angle * 180 / Math.PI;
        const arrowSize = Math.max(10, strokeWidth * 3);
        
        // End arrowhead
        const endX1 = x2 - arrowSize * Math.cos(angle - Math.PI / 6);
        const endY1 = y2 - arrowSize * Math.sin(angle - Math.PI / 6);
        const endX2 = x2 - arrowSize * Math.cos(angle + Math.PI / 6);
        const endY2 = y2 - arrowSize * Math.sin(angle + Math.PI / 6);
        
        svgElements += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${el.color}" stroke-width="${strokeWidth}"/>`;
        svgElements += `<polygon points="${x2},${y2} ${endX1},${endY1} ${endX2},${endY2}" fill="${el.color}"/>`;
        
        // Start arrowhead if double
        if (heads === 'double') {
          const startX1 = x1 + arrowSize * Math.cos(angle - Math.PI / 6);
          const startY1 = y1 + arrowSize * Math.sin(angle - Math.PI / 6);
          const startX2 = x1 + arrowSize * Math.cos(angle + Math.PI / 6);
          const startY2 = y1 + arrowSize * Math.sin(angle + Math.PI / 6);
          svgElements += `<polygon points="${x1},${y1} ${startX1},${startY1} ${startX2},${startY2}" fill="${el.color}"/>`;
        }
        
        // Text on arrow - use original fontSize
        if (text) {
          const midX = (x1 + x2) / 2;
          const midY = (y1 + y2) / 2;
          const fontSize = el.data.fontSize || 14;
          svgElements += `<text x="${midX}" y="${midY - 10}" text-anchor="middle" font-size="${fontSize}" font-weight="bold" fill="${el.color}" transform="rotate(${angleDeg} ${midX} ${midY})">${text}</text>`;
        }
      } else if (el.type === 'pointer') {
        const { x1, y1, x2, y2, text } = el.data;
        const angle = Math.atan2(y2 - y1, x2 - x1);
        const pointerStrokeWidth = el.strokeWidth || 3;
        // Pfeilspitze proportional zur Strichdicke (skaliert für alle Größen)
        const arrowHeadSize = Math.max(12, pointerStrokeWidth * 4);
        const arrowHeadAngle = Math.PI / 6;
        
        // Arrowhead coordinates
        const leftX = x2 - arrowHeadSize * Math.cos(angle - arrowHeadAngle);
        const leftY = y2 - arrowHeadSize * Math.sin(angle - arrowHeadAngle);
        const rightX = x2 - arrowHeadSize * Math.cos(angle + arrowHeadAngle);
        const rightY = y2 - arrowHeadSize * Math.sin(angle + arrowHeadAngle);
        
        // Line ends before arrowhead
        const lineEndX = x2 - arrowHeadSize * 0.6 * Math.cos(angle);
        const lineEndY = y2 - arrowHeadSize * 0.6 * Math.sin(angle);
        
        svgElements += `<line x1="${x1}" y1="${y1}" x2="${lineEndX}" y2="${lineEndY}" stroke="${el.color}" stroke-width="${pointerStrokeWidth}" stroke-linecap="round"/>`;
        svgElements += `<polygon points="${x2},${y2} ${leftX},${leftY} ${rightX},${rightY}" fill="${el.color}"/>`;
        
        // Memo text at start point
        if (text) {
          const fontSize = el.data.fontSize || 16;
          const textOffset = 15;
          const textX = x1 + textOffset * Math.cos(angle - Math.PI / 2);
          const textY = y1 + textOffset * Math.sin(angle - Math.PI / 2);
          const textWidth = text.length * fontSize * 0.6 + 10;
          const textHeight = fontSize + 8;
          // Rahmen-Strichdicke proportional zur Pfeil-Strichdicke
          const textStrokeWidth = Math.max(1, pointerStrokeWidth / 3);
          
          svgElements += `<rect x="${textX - 5}" y="${textY - fontSize}" width="${textWidth}" height="${textHeight}" fill="white" fill-opacity="0.9" rx="4" stroke="${el.color}" stroke-width="${textStrokeWidth}"/>`;
          svgElements += `<text x="${textX}" y="${textY}" font-size="${fontSize}" fill="${el.color}" font-weight="bold">${text}</text>`;
        }
      } else if (el.type === 'text') {
        const x = el.x || 0;
        const y = el.y || 0;
        const fontSize = el.fontSize || 20;
        svgElements += `<text x="${x}" y="${y}" font-size="${fontSize}" fill="${el.color}" font-weight="${el.fontWeight || 'bold'}" font-style="${el.fontStyle || 'normal'}">${el.data.text}</text>`;
      } else if (el.type === 'image' && el.data?.uri) {
        const x = el.x || 0;
        const y = el.y || 0;
        const w = el.width || 100;
        const h = el.height || 100;
        svgElements += `<image href="${el.data.uri}" x="${x}" y="${y}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid meet"/>`;
      } else if (el.type === 'polyline' && el.data?.points && el.data.points.length >= 2) {
        const points = el.data.points as { x: number; y: number }[];
        const isClosed = el.data.closed || false;
        
        let pathData = points.map((pt, idx) => {
          return `${idx === 0 ? 'M' : 'L'} ${pt.x} ${pt.y}`;
        }).join(' ');
        
        if (isClosed) pathData += ' Z';
        
        svgElements += `<path d="${pathData}" stroke="${el.color}" stroke-width="${strokeWidth}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
        
        // Render dimension lines for this polyline if measurements exist
        const elementMeasurements = lineSegmentMeasurements[el.id] || {};
        
        // Berechne den Schwerpunkt (Centroid) des Polygons für die Außen-Berechnung
        const centroidX = points.reduce((acc: number, pt: { x: number; y: number }) => acc + pt.x, 0) / points.length;
        const centroidY = points.reduce((acc: number, pt: { x: number; y: number }) => acc + pt.y, 0) / points.length;
        
        Object.keys(elementMeasurements).forEach((segIdxStr) => {
          const segIdx = parseInt(segIdxStr, 10);
          const measurementText = elementMeasurements[segIdx];
          if (!measurementText) return;
          
          const p1 = points[segIdx];
          const p2 = segIdx === points.length - 1 && isClosed 
            ? points[0] 
            : points[segIdx + 1];
          if (!p1 || !p2) return;
          
          // Midpoint of the line
          const midX = (p1.x + p2.x) / 2;
          const midY = (p1.y + p2.y) / 2;
          
          // Angle of the line
          const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
          
          // Normalenvektor der Kante (senkrecht zur Kante)
          const normalX = -Math.sin(angle);
          const normalY = Math.cos(angle);
          
          // Vektor vom Mittelpunkt zum Schwerpunkt
          const towardsCenterX = centroidX - midX;
          const towardsCenterY = centroidY - midY;
          
          // Skalarprodukt: Wenn positiv, zeigt Normale Richtung Schwerpunkt (= innen)
          const dotProduct = normalX * towardsCenterX + normalY * towardsCenterY;
          
          // Offset-Betrag
          const offsetMagnitude = 20;
          
          // Wenn dotProduct > 0, zeigt Normale nach innen -> umkehren für außen
          const sign = dotProduct > 0 ? -1 : 1;
          const offsetX = normalX * offsetMagnitude * sign;
          const offsetY = normalY * offsetMagnitude * sign;
          
          // Tick length for end marks
          const tickLength = 8;
          
          // Dimension line parallel to original line
          svgElements += `<line x1="${p1.x + offsetX}" y1="${p1.y + offsetY}" x2="${p2.x + offsetX}" y2="${p2.y + offsetY}" stroke="#1976d2" stroke-width="1.5"/>`;
          
          // Left end tick
          svgElements += `<line x1="${p1.x + offsetX - Math.sin(angle) * tickLength}" y1="${p1.y + offsetY + Math.cos(angle) * tickLength}" x2="${p1.x + offsetX + Math.sin(angle) * tickLength}" y2="${p1.y + offsetY - Math.cos(angle) * tickLength}" stroke="#1976d2" stroke-width="1.5"/>`;
          
          // Right end tick
          svgElements += `<line x1="${p2.x + offsetX - Math.sin(angle) * tickLength}" y1="${p2.y + offsetY + Math.cos(angle) * tickLength}" x2="${p2.x + offsetX + Math.sin(angle) * tickLength}" y2="${p2.y + offsetY - Math.cos(angle) * tickLength}" stroke="#1976d2" stroke-width="1.5"/>`;
          
          // Background for text
          const textWidth = measurementText.length * 8 + 8;
          const textHeight = 16;
          svgElements += `<rect x="${midX + offsetX - textWidth/2}" y="${midY + offsetY - 10}" width="${textWidth}" height="${textHeight}" fill="white" rx="2" ry="2"/>`;
          
          // Measurement text
          svgElements += `<text x="${midX + offsetX}" y="${midY + offsetY + 3}" fill="#1976d2" font-size="12" font-weight="bold" text-anchor="middle">${measurementText}</text>`;
        });
        
        // Render label (S1, S2, S3...) at center if this polyline has measurements
        const polylinesWithMeasurements = getPolylineElementsWithMeasurements();
        const labelIndex = polylinesWithMeasurements.findIndex(p => p.id === el.id);
        if (labelIndex !== -1) {
          const sumX = points.reduce((acc: number, pt: { x: number; y: number }) => acc + pt.x, 0);
          const sumY = points.reduce((acc: number, pt: { x: number; y: number }) => acc + pt.y, 0);
          const centerX = sumX / points.length;
          const centerY = sumY / points.length;
          const labelText = `S${labelIndex + 1}`;
          
          // Label circle background
          svgElements += `<circle cx="${centerX}" cy="${centerY}" r="18" fill="#1976d2" stroke="#fff" stroke-width="2"/>`;
          // Label text
          svgElements += `<text x="${centerX}" y="${centerY + 5}" fill="#fff" font-size="14" font-weight="bold" text-anchor="middle">${labelText}</text>`;
        }
      } else if (el.type === 'polygon' && typeof el.data === 'string') {
        svgElements += `<path d="${el.data}" stroke="${el.color}" stroke-width="${strokeWidth}" fill="${el.color}" fill-opacity="0.3" stroke-linecap="round" stroke-linejoin="round"/>`;
      }
    });
    
    // Render Summary Legend (Übersicht) in the SVG for PDF/Preview
    // Verwende die bereits berechneten Koordinaten: svgLegendXPos, svgLegendYPos
    if (polylinesForLegend.length > 0) {
      const lineHeight = svgLegendLineHeight; // Verwende konsistente Zeilenhöhe
      
      // Legend background
      svgElements += `<rect x="${svgLegendXPos}" y="${svgLegendYPos - svgLegendHeight}" width="${svgLegendWidth}" height="${svgLegendHeight}" fill="white" stroke="#e3f2fd" stroke-width="2" rx="8" ry="8"/>`;
      
      // Legend title - größere Schrift
      svgElements += `<text x="${svgLegendXPos + 15}" y="${svgLegendYPos - svgLegendHeight + 30}" fill="#333" font-size="18" font-weight="bold">Übersicht</text>`;
      
      // Legend items
      polylinesForLegend.forEach((element, index) => {
        const totalForElement = calculateTotalLfmForElement(element.id);
        if (totalForElement <= 0) return;
        
        const itemY = svgLegendYPos - svgLegendHeight + 55 + (index * lineHeight);
        const labelText = `S${index + 1}`;
        
        // Label badge - größer
        svgElements += `<rect x="${svgLegendXPos + 15}" y="${itemY - 16}" width="38" height="24" fill="#1976d2" rx="4" ry="4"/>`;
        svgElements += `<text x="${svgLegendXPos + 34}" y="${itemY + 2}" fill="#fff" font-size="14" font-weight="bold" text-anchor="middle">${labelText}</text>`;
        
        // Value text - größere Schrift
        svgElements += `<text x="${svgLegendXPos + 62}" y="${itemY + 2}" fill="#333" font-size="16">= ${totalForElement.toString().replace('.', ',')} lfm</text>`;
      });
    }
    
    // Create SVG with viewBox that matches the drawing bounds
    // This allows the SVG to scale correctly when embedded in PDF without distorting proportions
    const previewSvg = `<svg width="100%" height="100%" viewBox="${minX} ${minY} ${drawWidth} ${drawHeight}" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg"><rect x="${minX}" y="${minY}" width="${drawWidth}" height="${drawHeight}" fill="#ffffff"/>${svgElements}</svg>`;
    
    console.log('Generated SVG preview with viewBox:', `${minX} ${minY} ${drawWidth} ${drawHeight}`);
    
    return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(previewSvg)))}`;
  };

  const saveSketch = async () => {
    if (!title.trim()) {
      showAlert('Fehler', 'Bitte geben Sie einen Titel ein');
      return;
    }

    try {
      setLoading(true);
      
      // Create metadata with elements and canvas dimensions for proper scaling
      const metadata = {
        elements,
        backgroundImage,
        canvasWidth: width,
        canvasHeight: height - 120, // Subtract header/toolbar height
        lineSegmentMeasurements, // Speichere die Linien-Maße
        totalLfmBoxPositions, // Speichere alle Summenbox-Positionen pro Element
        legendPosition, // Speichere Position der Übersicht-Legend
        notes, // Speichere die Notizen
        labelOffsets, // Speichere Polyline-Label-Positionen
      };

      console.log('Saving sketch with', elements.length, 'elements');
      console.log('Canvas dimensions:', width, 'x', (height - 120));
      console.log('Saving legendPosition:', legendPosition);
      console.log('Metadata:', metadata);

      // Generate preview image
      let sketchData = '';
      
      // Priority 1: Generate mini-sketch from elements if we have any
      if (elements.length > 0) {
        console.log('Generating mini-sketch preview from', elements.length, 'elements...');
        try {
          sketchData = generatePreviewSvg();
          console.log('Mini-sketch preview generated, length:', sketchData.length);
        } catch (previewError) {
          console.error('Error generating preview:', previewError);
        }
      }
      
      // Priority 2: Use background image if no elements preview available
      if (!sketchData && backgroundImage) {
        console.log('Using background image as preview');
        sketchData = backgroundImage;
      }
      
      // Priority 3: Fallback colored badge
      if (!sketchData) {
        console.log('Using fallback badge preview');
        const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DFE6E9'];
        const colorIndex = elements.length % colors.length;
        const previewColor = colors[colorIndex];
        
        const previewSvg = `
          <svg width="200" height="200" xmlns="http://www.w3.org/2000/svg">
            <rect width="200" height="200" fill="${previewColor}" opacity="0.3"/>
            <text x="100" y="100" text-anchor="middle" font-size="24" fill="#333">
              ${elements.length} Element${elements.length !== 1 ? 'e' : ''}
            </text>
            <text x="100" y="130" text-anchor="middle" font-size="14" fill="#666">
              ${title || 'Skizze'}
            </text>
          </svg>
        `;
        
        sketchData = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(previewSvg)))}`;
      }

      if (sketchId) {
        // Update existing sketch
        console.log('Updating sketch ID:', sketchId);
        await SketchService.update(sketchId, {
          project_id: projectId,
          title,
          notes, // Speichere die Notizen direkt in der Skizze
          sketch_data: sketchData,
          metadata: JSON.stringify(metadata),
          pdf_size: pdfSize,
        });
        console.log('Sketch updated');
        showAlert('Erfolg', 'Skizze wurde aktualisiert');
      } else {
        // Create new sketch
        console.log('Creating new sketch');
        await SketchService.create({
          project_id: projectId,
          title,
          notes, // Speichere die Notizen direkt in der Skizze
          sketch_data: sketchData,
          metadata: JSON.stringify(metadata),
          pdf_size: pdfSize,
        });
        console.log('Sketch created');
        showAlert('Erfolg', 'Skizze wurde gespeichert');
      }

      router.back();
    } catch (error) {
      console.error('Error saving sketch:', error);
      showAlert('Fehler', 'Skizze konnte nicht gespeichert werden');
    } finally {
      setLoading(false);
    }
  };

  // Color palette
  const colors = [
    '#000000', '#FFFFFF', '#FF0000', '#00FF00', '#0000FF',
    '#FFFF00', '#FF00FF', '#00FFFF', '#FFA500', '#800080',
  ];

  // Stroke widths
  const strokeWidths = [1, 2, 3, 5, 8];

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handleBackPress} style={styles.headerButton}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <TextInput
          style={styles.titleInput}
          value={title}
          onChangeText={setTitle}
          placeholder="Skizzen-Titel"
          placeholderTextColor="#ccc"
        />
        {/* PDF-Größe Button mit Label */}
        <TouchableOpacity 
          onPress={() => {
            const sizes = ['small', 'medium', 'large'];
            const labels = ['Klein (3/Zeile)', 'Mittel (2/Zeile)', 'Groß (1/Zeile)'];
            const currentIndex = sizes.indexOf(pdfSize);
            const nextIndex = (currentIndex + 1) % sizes.length;
            setPdfSize(sizes[nextIndex]);
            showAlert('PDF-Größe', labels[nextIndex]);
          }} 
          style={styles.pdfSizeHeaderButton}
        >
          <Ionicons 
            name={pdfSize === 'small' ? 'apps-outline' : pdfSize === 'medium' ? 'grid-outline' : 'square-outline'} 
            size={20} 
            color="#fff" 
          />
          <Text style={styles.pdfSizeHeaderLabel}>PDF</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={saveSketch} style={styles.headerButton} disabled={loading}>
          <Ionicons name="checkmark" size={24} color={loading ? '#888' : '#fff'} />
        </TouchableOpacity>
      </View>

      {/* Toolbar mit Labels - scrollbar für iPhone */}
      <View style={styles.toolbarContainer}>
        <ScrollView 
          horizontal={isPhone} 
          showsHorizontalScrollIndicator={isPhone}
          style={[styles.toolbar, isPhone && styles.toolbarPhone]}
          contentContainerStyle={isPhone ? styles.toolbarContentPhone : styles.toolbarContent}
        >
        {/* ========== FOTO-TOOLS (VORNE) ========== */}
        
        {/* 1. neues Foto */}
        <View style={styles.toolButtonWithLabel}>
          <TouchableOpacity style={[styles.toolButtonPhotoWide, isPhone && styles.toolButtonPhotoWidePhone]} onPress={() => { setPhotoEditMode(false); takePhotoAndInsert(); }}>
            <Ionicons name="camera" size={isPhone ? 18 : 20} color="#4caf50" />
          </TouchableOpacity>
          <Text style={[styles.toolButtonLabelWide, isPhone && styles.toolButtonLabelWidePhone]}>Foto</Text>
        </View>

        {/* 2. Projektfotos */}
        <View style={styles.toolButtonWithLabel}>
          <TouchableOpacity 
            style={styles.toolButtonPhotoWide} 
            onPress={() => { setPhotoEditMode(false); loadProjectPhotos(); }}
          >
            <Ionicons name="images" size={20} color="#1976d2" />
          </TouchableOpacity>
          <Text style={styles.toolButtonLabelWide}>Foto aus{'\n'}Projekt</Text>
        </View>

        {/* 3. Galeriefotos */}
        <View style={styles.toolButtonWithLabel}>
          <TouchableOpacity style={styles.toolButtonPhotoWide} onPress={() => { setPhotoEditMode(false); insertImage(); }}>
            <Ionicons name="image" size={20} color="#9C27B0" />
          </TouchableOpacity>
          <Text style={styles.toolButtonLabelWide}>Foto aus{'\n'}Galerie</Text>
        </View>

        {/* 3.5 Bild aus Dateien */}
        <View style={styles.toolButtonWithLabel}>
          <TouchableOpacity style={styles.toolButtonPhotoWide} onPress={() => { setPhotoEditMode(false); importFromFiles(); }}>
            <Ionicons name="document" size={20} color="#FF5722" />
          </TouchableOpacity>
          <Text style={styles.toolButtonLabelWide}>Aus{'\n'}Dateien</Text>
        </View>

        {/* 4. Foto Position */}
        <View style={styles.toolButtonWithLabel}>
          <TouchableOpacity 
            style={[styles.toolButtonInner, photoEditMode && styles.photoEditButtonActive]} 
            onPress={() => {
              const newPhotoEditMode = !photoEditMode;
              setPhotoEditMode(newPhotoEditMode);
              setSelectedElementId(null);
              if (newPhotoEditMode) {
                // Nur drawMode setzen, ohne photoEditMode zu deaktivieren
                setDrawMode('select');
                setZoomMode(false);
              }
            }}
          >
            <Ionicons name="move" size={18} color={photoEditMode ? '#fff' : '#FF9800'} />
          </TouchableOpacity>
          <Text style={styles.toolButtonLabel}>Position</Text>
        </View>

        {/* 5. Foto zuschneiden */}
        <View style={styles.toolButtonWithLabel}>
          <TouchableOpacity 
            style={[styles.toolButtonInner, drawMode === 'crop' && styles.toolButtonActive]} 
            onPress={() => selectDrawMode(drawMode === 'crop' ? 'select' : 'crop')}
          >
            <Ionicons name="crop-outline" size={18} color={drawMode === 'crop' ? '#fff' : '#9C27B0'} />
          </TouchableOpacity>
          <Text style={[styles.toolButtonLabel, { color: drawMode === 'crop' ? '#9C27B0' : '#333' }]}>Zuschneiden</Text>
        </View>

        <View style={styles.separator} />

        {/* ========== ZEICHEN-TOOLS ========== */}
        
        {/* Zoom an/aus Toggle - vor Bearbeiten */}
        <View style={styles.toolButtonWithLabel}>
          <TouchableOpacity
            style={[
              styles.toolButtonInner, 
              { 
                backgroundColor: zoomMode ? '#e8f5e9' : '#ffebee',
                borderWidth: 2,
                borderColor: zoomMode ? '#4caf50' : '#f44336',
              }
            ]}
            onPress={() => setZoomMode(!zoomMode)}
          >
            <Ionicons 
              name="search" 
              size={18} 
              color={zoomMode ? '#4caf50' : '#f44336'} 
            />
          </TouchableOpacity>
          <Text style={[styles.toolButtonLabel, { color: zoomMode ? '#4caf50' : '#f44336' }]}>
            {zoomMode ? 'Zoom' : 'Zoom'}
          </Text>
        </View>
        
        {/* 6. Hand - Bearbeiten */}
        <View style={styles.toolButtonWithLabel}>
          <TouchableOpacity
            style={[styles.toolButtonInner, drawMode === 'select' && styles.toolButtonActive]}
            onPress={() => selectDrawMode('select')}
          >
            <Ionicons name="hand-left" size={18} color={drawMode === 'select' ? '#fff' : '#333'} />
          </TouchableOpacity>
          <Text style={styles.toolButtonLabel}>Bearbeiten</Text>
        </View>

        {/* 7. Stift */}
        <View style={styles.toolButtonWithLabel}>
          <TouchableOpacity
            style={[styles.toolButtonInner, drawMode === 'pen' && styles.toolButtonActive]}
            onPress={() => selectDrawMode('pen')}
          >
            <Ionicons name="create" size={18} color={drawMode === 'pen' ? '#fff' : '#333'} />
          </TouchableOpacity>
          <Text style={styles.toolButtonLabel}>Stift</Text>
        </View>

        {/* 8. Formen (Linie, Kreis, Rechteck) + Element löschen */}
        <View style={styles.toolGroupWithLabel}>
          <View style={styles.toolGroupRow}>
            <TouchableOpacity
              style={[styles.toolButtonInner, drawMode === 'line' && styles.toolButtonActive]}
              onPress={() => selectDrawMode('line')}
            >
              <Ionicons name="remove" size={18} color={drawMode === 'line' ? '#fff' : '#333'} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.toolButtonInner, drawMode === 'circle' && styles.toolButtonActive]}
              onPress={() => selectDrawMode('circle')}
            >
              <Ionicons name="ellipse-outline" size={18} color={drawMode === 'circle' ? '#fff' : '#333'} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.toolButtonInner, drawMode === 'rect' && styles.toolButtonActive]}
              onPress={() => selectDrawMode('rect')}
            >
              <Ionicons name="square-outline" size={18} color={drawMode === 'rect' ? '#fff' : '#333'} />
            </TouchableOpacity>
            {/* Element löschen Button */}
            <TouchableOpacity
              style={[styles.toolButtonInnerWide, !selectedElementId && styles.toolButtonDisabled]}
              onPress={() => {
                if (selectedElementId) {
                  setShowDeleteConfirm(true);
                }
              }}
              disabled={!selectedElementId}
            >
              <Ionicons name="trash" size={18} color={selectedElementId ? '#f44336' : '#ccc'} />
            </TouchableOpacity>
          </View>
          <View style={styles.toolGroupLabelRow}>
            <Text style={[styles.toolButtonLabelSmall, { flex: 1, textAlign: 'center' }]}>Linie</Text>
            <Text style={[styles.toolButtonLabelSmall, { flex: 1, textAlign: 'center' }]}>Kreis</Text>
            <Text style={[styles.toolButtonLabelSmall, { flex: 1, textAlign: 'center' }]}>Rechteck</Text>
            <Text style={[styles.toolButtonLabelSmall, { flex: 1.4, textAlign: 'center' }]}>Element{'\n'}löschen</Text>
          </View>
        </View>

        <View style={styles.separator} />

        {/* ========== MAßLINIEN ========== */}
        <View style={styles.toolGroupWithLabel}>
          <View style={styles.toolGroupRow}>
            {/* Maßlinie Button */}
            <TouchableOpacity
              style={[styles.toolButtonInnerWide, drawMode === 'arrow' && styles.toolButtonActive]}
              onPress={() => selectDrawMode('arrow')}
            >
              <Svg width={46} height={22} viewBox="0 0 56 28">
                <Polygon 
                  points="2,14 12,6 12,22" 
                  fill={drawMode === 'arrow' ? '#fff' : '#333'} 
                />
                <Polygon 
                  points="54,14 44,6 44,22" 
                  fill={drawMode === 'arrow' ? '#fff' : '#333'} 
                />
                <Line 
                  x1="12" y1="14" x2="44" y2="14" 
                  stroke={drawMode === 'arrow' ? '#fff' : '#333'} 
                  strokeWidth={3} 
                />
                <Rect 
                  x="18" y="4" width="20" height="20" 
                  fill={drawMode === 'arrow' ? '#2196f3' : '#f5f5f5'} 
                  stroke={drawMode === 'arrow' ? '#fff' : '#333'} 
                  strokeWidth={2}
                  rx={3}
                />
                <SvgText 
                  x="28" y="19" 
                  fill={drawMode === 'arrow' ? '#fff' : '#333'} 
                  fontSize={16} 
                  fontWeight="bold" 
                  textAnchor="middle"
                >
                  M
                </SvgText>
              </Svg>
            </TouchableOpacity>
            {/* Polygon Maße Button */}
            <TouchableOpacity
              style={[styles.toolButtonInner, drawMode === 'polyline' && styles.toolButtonActive]}
              onPress={() => {
                selectDrawMode('polyline');
                setPolylinePoints([]);
              }}
            >
              <Ionicons name="git-network-outline" size={22} color={drawMode === 'polyline' ? '#fff' : '#333'} />
            </TouchableOpacity>
            {/* Punkt hinzufügen Button */}
            <TouchableOpacity
              style={[styles.toolButtonInner, drawMode === 'addPoint' && styles.toolButtonActive]}
              onPress={() => selectDrawMode('addPoint')}
            >
              <Ionicons name="add-circle-outline" size={22} color={drawMode === 'addPoint' ? '#fff' : '#4caf50'} />
            </TouchableOpacity>
            {/* Punkt entfernen Button */}
            <TouchableOpacity
              style={[styles.toolButtonInner, drawMode === 'removePoint' && styles.toolButtonActive]}
              onPress={() => selectDrawMode('removePoint')}
            >
              <Ionicons name="remove-circle-outline" size={22} color={drawMode === 'removePoint' ? '#fff' : '#f44336'} />
            </TouchableOpacity>
          </View>
          <View style={styles.toolGroupLabelRow}>
            <Text style={[styles.toolButtonLabelSmall, { flex: 1, textAlign: 'center' }]}>Maßlinie</Text>
            <Text style={[styles.toolButtonLabelSmall, { flex: 1, textAlign: 'center' }]}>Polygon</Text>
            <Text style={[styles.toolButtonLabelSmall, { flex: 1, textAlign: 'center' }]}>+Pkt</Text>
            <Text style={[styles.toolButtonLabelSmall, { flex: 1, textAlign: 'center' }]}>-Pkt</Text>
          </View>
        </View>

        <View style={styles.separator} />

        {/* ========== TEXT & MEMO (ohne Editieren-Button) ========== */}
        <View style={styles.toolGroupWithLabel}>
          <View style={styles.toolGroupRow}>
            {/* Memo-Pfeil */}
            <TouchableOpacity
              style={[styles.toolButtonInner, drawMode === 'pointer' && styles.toolButtonActive]}
              onPress={() => selectDrawMode('pointer')}
            >
              <Ionicons name="arrow-forward" size={20} color={drawMode === 'pointer' ? '#fff' : '#e91e63'} />
            </TouchableOpacity>
            {/* Text Button */}
            <TouchableOpacity
              style={[styles.toolButtonInner, drawMode === 'text' && styles.toolButtonActive]}
              onPress={() => selectDrawMode('text')}
            >
              <Ionicons name="text" size={18} color={drawMode === 'text' ? '#fff' : '#333'} />
            </TouchableOpacity>
            {/* Notiz Button (Annotation Memo) */}
            <TouchableOpacity
              style={[styles.toolButtonInner, drawMode === 'memo' && styles.toolButtonActive]}
              onPress={() => selectDrawMode('memo')}
            >
              <Ionicons name="chatbox-outline" size={18} color={drawMode === 'memo' ? '#fff' : '#E74C3C'} />
            </TouchableOpacity>
            {/* Notizen zur Skizze Button */}
            <TouchableOpacity
              style={[styles.toolButtonInner, notes.trim() && styles.toolButtonWithBadge]}
              onPress={() => setShowNotesModal(true)}
            >
              <View style={styles.notesButtonContainer}>
                <Ionicons name="document-text-outline" size={18} color={notes.trim() ? '#4caf50' : '#333'} />
                {notes.trim() && (
                  <View style={styles.notesBadge}>
                    <Ionicons name="checkmark" size={8} color="#fff" />
                  </View>
                )}
              </View>
            </TouchableOpacity>
          </View>
          <View style={styles.toolGroupLabelRow}>
            <Text style={[styles.toolButtonLabelSmall, { flex: 1, textAlign: 'center' }]}>Memo</Text>
            <Text style={[styles.toolButtonLabelSmall, { flex: 1, textAlign: 'center' }]}>Text</Text>
            <Text style={[styles.toolButtonLabelSmall, { flex: 1, textAlign: 'center' }]}>Notiz</Text>
            <Text style={[styles.toolButtonLabelSmall, { flex: 1, textAlign: 'center' }]}>Notizen</Text>
          </View>
        </View>

        <View style={styles.separator} />

        {/* ========== FARBEN & STRICHSTÄRKEN (ZEICHENLEISTE) ========== */}
        <View style={styles.toolGroupWithLabel}>
          <View style={styles.toolGroupRow}>
            {/* Color picker */}
            <TouchableOpacity style={styles.toolButtonInner} onPress={() => setShowColorPicker(!showColorPicker)}>
              <View style={[styles.colorPreviewSmall, { backgroundColor: drawColor }]} />
            </TouchableOpacity>

            {/* Stroke width - inline */}
            {strokeWidths.map(w => (
              <TouchableOpacity
                key={w}
                style={[styles.strokeWidthButtonSmall, strokeWidth === w && styles.strokeWidthButtonActive]}
                onPress={() => setStrokeWidth(w)}
              >
                <View style={[styles.strokeWidthDot, { width: w * 1.5, height: w * 1.5 }]} />
              </TouchableOpacity>
            ))}
          </View>
          <Text style={styles.toolButtonLabel}>Zeichenleiste</Text>
        </View>

        <View style={styles.separator} />

        {/* ========== GITTER & ZOOM ========== */}
        <View style={styles.toolGroupWithLabel}>
          <View style={styles.toolGroupRow}>
            {/* Gitter Toggle - größerer Button mit "Raster" Text */}
            <TouchableOpacity 
              style={[
                styles.toolButtonZoomSize, 
                showGrid && !backgroundImage && styles.gridButtonActive
              ]} 
              onPress={() => {
                if (!backgroundImage) {
                  setShowGrid(!showGrid);
                }
              }}
              onLongPress={() => {
                if (!backgroundImage) {
                  setShowGridSettings(!showGridSettings);
                }
              }}
              disabled={!!backgroundImage}
            >
              <Ionicons 
                name="grid" 
                size={16} 
                color={backgroundImage ? '#ccc' : (showGrid ? '#fff' : '#333')} 
              />
              <Text style={{ 
                fontSize: 8, 
                fontWeight: 'bold', 
                color: backgroundImage ? '#ccc' : (showGrid ? '#fff' : '#333'),
                marginTop: 1,
              }}>
                Raster
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.separator} />

        {/* ========== UNDO/REDO ========== */}
        <View style={styles.toolGroupWithLabel}>
          <View style={styles.toolGroupRow}>
            <TouchableOpacity
              style={[styles.toolButtonInner, !canUndo && styles.toolButtonDisabled]}
              onPress={undo}
              disabled={!canUndo}
            >
              <Ionicons name="arrow-undo" size={18} color={canUndo ? '#1976d2' : '#ccc'} />
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[styles.toolButtonInner, !canRedo && styles.toolButtonDisabled]}
              onPress={redo}
              disabled={!canRedo}
            >
              <Ionicons name="arrow-redo" size={18} color={canRedo ? '#1976d2' : '#ccc'} />
            </TouchableOpacity>
          </View>
          <Text style={styles.toolButtonLabel}>Vor-Zurück</Text>
        </View>

        <View style={styles.separator} />

        {/* ========== SEITE LÖSCHEN ========== */}
        <View style={styles.toolButtonWithLabel}>
          <TouchableOpacity style={styles.toolButtonInner} onPress={() => {
            if (Platform.OS === 'web') {
              if (confirm('Möchten Sie alle Elemente löschen?')) {
                clearAll();
              }
            } else {
              Alert.alert('Alles löschen', 'Möchten Sie alle Elemente löschen?', [
                { text: 'Abbrechen', style: 'cancel' },
                { text: 'Löschen', style: 'destructive', onPress: clearAll },
              ]);
            }
          }}>
            <Ionicons name="trash-bin" size={18} color="#f44336" />
          </TouchableOpacity>
          <Text style={[styles.toolButtonLabel, { color: '#f44336' }]}>Seite{'\n'}löschen</Text>
        </View>
      </ScrollView>
      </View>

      {/* Color picker expandable */}
      {showColorPicker && (
        <View style={styles.colorPickerPanel}>
          <Text style={styles.colorPickerTitle}>Farbe wählen:</Text>
          <View style={styles.colorGrid}>
            {colors.map(color => (
              <TouchableOpacity
                key={color}
                style={[
                  styles.colorOption,
                  { backgroundColor: color },
                  drawColor === color && styles.colorOptionSelected,
                ]}
                onPress={() => {
                  setDrawColor(color);
                  setShowColorPicker(false);
                }}
              />
            ))}
          </View>
        </View>
      )}

      {/* Gitter-Einstellungen Panel */}
      {showGridSettings && !backgroundImage && (
        <View style={styles.gridSettingsPanel}>
          <View style={styles.gridSettingsHeader}>
            <Text style={styles.gridSettingsTitle}>Raster-Einstellungen</Text>
            <TouchableOpacity onPress={() => setShowGridSettings(false)}>
              <Ionicons name="close" size={20} color="#666" />
            </TouchableOpacity>
          </View>
          
          {/* Größen-Slider */}
          <View style={styles.gridSliderSection}>
            <Text style={styles.gridSliderSectionLabel}>Kästchengröße: {gridSize}px</Text>
            <View style={styles.gridSliderRow}>
              <Text style={styles.gridSliderLabel}>Klein</Text>
              <Slider
                style={styles.gridSlider}
                minimumValue={10}
                maximumValue={100}
                step={5}
                value={gridSize}
                onValueChange={(value) => setGridSize(value)}
                minimumTrackTintColor="#1976d2"
                maximumTrackTintColor="#ddd"
                thumbTintColor="#1976d2"
              />
              <Text style={styles.gridSliderLabel}>Groß</Text>
            </View>
          </View>
          
          {/* Transparenz-Slider */}
          <View style={styles.gridSliderSection}>
            <Text style={styles.gridSliderSectionLabel}>Sichtbarkeit: {Math.round(gridOpacity * 100)}%</Text>
            <View style={styles.gridSliderRow}>
              <Text style={styles.gridSliderLabel}>Schwach</Text>
              <Slider
                style={styles.gridSlider}
                minimumValue={0.1}
                maximumValue={1}
                step={0.1}
                value={gridOpacity}
                onValueChange={(value) => setGridOpacity(value)}
                minimumTrackTintColor="#1976d2"
                maximumTrackTintColor="#ddd"
                thumbTintColor="#1976d2"
              />
              <Text style={styles.gridSliderLabel}>Stark</Text>
            </View>
          </View>
        </View>
      )}

      {/* Canvas mit ScrollView für Zoom */}
      <ScrollView
        ref={scrollViewRef}
        style={styles.canvasScrollView}
        contentContainerStyle={{ flexGrow: 1 }}
        minimumZoomScale={zoomMode ? 0.5 : scale}
        maximumZoomScale={zoomMode ? 4 : scale}
        bouncesZoom={zoomMode}
        scrollEnabled={zoomMode}
        pinchGestureEnabled={zoomMode}
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        onScroll={(event) => {
          const currentScale = event.nativeEvent.zoomScale || 1;
          if (currentScale !== scale) {
            setScale(currentScale);
          }
          // Speichere die Scroll-Position für korrekte Koordinatenberechnung
          const { contentOffset } = event.nativeEvent;
          if (contentOffset) {
            setScrollOffset({ x: contentOffset.x, y: contentOffset.y });
          }
        }}
        scrollEventThrottle={16}
      >
        <View
          ref={canvasRef}
          style={styles.canvasContainer}
          onStartShouldSetResponder={() => true}
          onMoveShouldSetResponder={() => true}
          onResponderGrant={onTouchStart}
          onResponderMove={onTouchMove}
          onResponderRelease={onTouchEnd}
        >
        <Svg
          ref={svgRef}
          width={width}
          height={height - 120}
          style={styles.svg}
        >
          {/* Kästchenpapier Gitter - nur wenn kein Hintergrundbild und Gitter aktiviert */}
          {showGrid && !backgroundImage && (
            <>
              <Defs>
                <Pattern
                  id="gridPattern"
                  width={gridSize}
                  height={gridSize}
                  patternUnits="userSpaceOnUse"
                >
                  <Path
                    d={`M ${gridSize} 0 L 0 0 0 ${gridSize}`}
                    fill="none"
                    stroke={`rgba(100, 100, 100, ${gridOpacity})`}
                    strokeWidth={0.8}
                  />
                </Pattern>
              </Defs>
              <Rect
                x={0}
                y={0}
                width={width}
                height={height - 120}
                fill="url(#gridPattern)"
              />
            </>
          )}

          {/* Background image */}
          {backgroundImage && (
            <SvgImage
              href={backgroundImage}
              x={0}
              y={0}
              width={width}
              height={height - 120}
              preserveAspectRatio="xMidYMid meet"
              opacity={1}
            />
          )}

          {/* Render all elements */}
          {elements.map(el => renderElement(el))}

          {/* Render temporary element */}
          {tempElement && renderElement(tempElement)}

          {/* Render current path */}
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

          {/* Render current polyline während des Zeichnens */}
          {drawMode === 'polyline' && polylinePoints.length > 0 && (
            <>
              <Path
                d={polylinePoints.map((pt, i) => 
                  i === 0 ? `M ${pt.x} ${pt.y}` : `L ${pt.x} ${pt.y}`
                ).join(' ')}
                stroke={drawColor}
                strokeWidth={strokeWidth}
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray="5,5"
              />
              {/* Punkte anzeigen - skaliert mit Zoom */}
              {polylinePoints.map((pt, idx) => {
                const baseRadius = 6;
                const scaledRadius = Math.max(3, baseRadius / Math.max(scale, 0.5));
                const scaledStroke = Math.max(1, 1.5 / Math.max(scale, 0.5));
                return (
                  <Circle 
                    key={`current-polyline-pt-${idx}`}
                    cx={pt.x} 
                    cy={pt.y} 
                    r={scaledRadius} 
                    fill={idx === 0 ? '#4caf50' : '#2196f3'} 
                    stroke="#fff" 
                    strokeWidth={scaledStroke} 
                  />
                );
              })}
              {/* Schließen-Indikator beim ersten Punkt - skaliert */}
              {polylinePoints.length >= 3 && (() => {
                const baseCloseRadius = 16;
                const scaledCloseRadius = Math.max(8, baseCloseRadius / Math.max(scale, 0.5));
                const scaledCloseStroke = Math.max(1, 1.5 / Math.max(scale, 0.5));
                return (
                  <Circle 
                    cx={polylinePoints[0].x} 
                    cy={polylinePoints[0].y} 
                    r={scaledCloseRadius} 
                    fill="rgba(76, 175, 80, 0.3)" 
                    stroke="#4caf50" 
                    strokeWidth={scaledCloseStroke}
                    strokeDasharray="3,3"
                  />
                );
              })()}
            </>
          )}
        </Svg>

        {/* Info overlay */}
        <View style={styles.infoOverlay}>
          <Text style={styles.infoText}>Elemente: {elements.length}</Text>
          {selectedElementId && <Text style={styles.infoText}>Ausgewählt</Text>}
          {photoEditMode && (
            <View style={styles.photoEditBadge}>
              <Ionicons name="image-outline" size={14} color="#fff" />
              <Text style={styles.photoEditBadgeText}>Foto-Modus</Text>
            </View>
          )}
          {zoomMode && (
            <View style={[styles.photoEditBadge, { backgroundColor: '#FF9800' }]}>
              <Ionicons name="search-outline" size={14} color="#fff" />
              <Text style={styles.photoEditBadgeText}>Zoom-Modus {Math.round(scale * 100)}%</Text>
            </View>
          )}
        </View>

      </View>
      </ScrollView>

      {/* Polyline Steuerung - kompakt und verschiebbar */}
      {drawMode === 'polyline' && polylinePoints.length > 0 && (
        <Animated.View 
          style={[
            styles.polylineControlsCompact,
            { transform: polylineControlPosition.getTranslateTransform() }
          ]}
        >
          {/* Drag Handle */}
          <View {...polylineControlPanResponder.panHandlers} style={styles.polylineDragHandle}>
            <View style={styles.polylineDragIndicator} />
            <Text style={styles.polylineInfoCompact}>
              Grundriss: {polylinePoints.length}
            </Text>
          </View>
          
          {/* Buttons */}
          <View style={styles.polylineButtonsCompact}>
            <TouchableOpacity 
              style={[styles.polylineButtonCompact, styles.polylineButtonUndo]} 
              onPress={undoLastPolylinePoint}
              activeOpacity={0.7}
            >
              <Ionicons name="arrow-undo" size={16} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.polylineButtonCompact, styles.polylineButtonFinish]} 
              onPress={() => finishPolyline(false)}
              activeOpacity={0.7}
            >
              <Ionicons name="checkmark" size={16} color="#fff" />
            </TouchableOpacity>
            {polylinePoints.length >= 3 && (
              <TouchableOpacity 
                style={[styles.polylineButtonCompact, styles.polylineButtonClose]} 
                onPress={() => finishPolyline(true)}
                activeOpacity={0.7}
              >
                <Ionicons name="link" size={16} color="#fff" />
              </TouchableOpacity>
            )}
            <TouchableOpacity 
              style={[styles.polylineButtonCompact, styles.polylineButtonCancel]} 
              onPress={cancelPolyline}
              activeOpacity={0.7}
            >
              <Ionicons name="trash" size={16} color="#fff" />
            </TouchableOpacity>
          </View>
        </Animated.View>
      )}

      {/* Maß hinzufügen Button - erscheint wenn ein Liniensegment ausgewählt ist */}
      {selectedLineSegment && drawMode === 'select' && (
        <View style={styles.measurementActionBar}>
          <View style={styles.measurementActionContent}>
            <TouchableOpacity 
              style={styles.measurementActionButton}
              onPress={() => {
                setLineMeasurementExpression('');
                setShowLineMeasurementNumpad(true);
              }}
            >
              <Ionicons name="resize" size={18} color="#fff" />
              <Text style={styles.measurementActionText}>Maß hinzufügen</Text>
            </TouchableOpacity>
            
            {/* Zeige existierendes Maß wenn vorhanden */}
            {lineSegmentMeasurements[selectedLineSegment.elementId]?.[selectedLineSegment.segmentIndex] && (
              <TouchableOpacity 
                style={styles.measurementDeleteButton}
                onPress={removeMeasurementFromSelectedLine}
              >
                <Ionicons name="trash-outline" size={16} color="#f44336" />
              </TouchableOpacity>
            )}
            
            <TouchableOpacity 
              style={styles.measurementCancelButton}
              onPress={() => setSelectedLineSegment(null)}
            >
              <Ionicons name="close" size={18} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Legende mit Skizzen-Summen (S1, S2, S3...) - verschiebbar */}
      {getPolylineElementsWithMeasurements().length > 0 && (
        <Animated.View 
          style={[
            styles.sketchLegend,
            { transform: legendPan.getTranslateTransform() }
          ]}
          {...legendPanResponder.panHandlers}
        >
          <View style={styles.sketchLegendDragHandle}>
            <Ionicons name="move" size={12} color="#999" />
          </View>
          <Text style={styles.sketchLegendTitle}>Übersicht</Text>
          {getPolylineElementsWithMeasurements().map((element, index) => {
            const totalForElement = calculateTotalLfmForElement(element.id);
            if (totalForElement <= 0) return null;
            return (
              <View key={`legend-${element.id}`} style={styles.sketchLegendRow}>
                <View style={styles.sketchLegendLabel}>
                  <Text style={styles.sketchLegendLabelText}>S{index + 1}</Text>
                </View>
                <Text style={styles.sketchLegendValue}>= {totalForElement.toString().replace('.', ',')} lfm</Text>
              </View>
            );
          })}
        </Animated.View>
      )}

      {/* Linien-Maß Eingabe Modal */}
      <Modal visible={showLineMeasurementNumpad} transparent animationType="slide">
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Maß eingeben</Text>
            <TextInput
              ref={lineMeasurementInputRef}
              style={styles.modalInput}
              value={lineMeasurementExpression}
              onChangeText={setLineMeasurementExpression}
              placeholder="z.B. 2,50 oder 2.50m"
              keyboardType="decimal-pad"
              autoFocus
            />
            
            {/* Kompaktes Numpad für Maß-Eingabe */}
            <View style={styles.lineMeasureNumpad}>
              <View style={styles.lineMeasureNumpadRow}>
                {['7','8','9'].map(k => (
                  <TouchableOpacity key={k} style={styles.lineMeasureNumpadKey} onPress={() => handleLineMeasurementNumpadPress(k)}>
                    <Text style={styles.lineMeasureNumpadKeyText}>{k}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={styles.lineMeasureNumpadRow}>
                {['4','5','6'].map(k => (
                  <TouchableOpacity key={k} style={styles.lineMeasureNumpadKey} onPress={() => handleLineMeasurementNumpadPress(k)}>
                    <Text style={styles.lineMeasureNumpadKeyText}>{k}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={styles.lineMeasureNumpadRow}>
                {['1','2','3'].map(k => (
                  <TouchableOpacity key={k} style={styles.lineMeasureNumpadKey} onPress={() => handleLineMeasurementNumpadPress(k)}>
                    <Text style={styles.lineMeasureNumpadKeyText}>{k}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={styles.lineMeasureNumpadRow}>
                <TouchableOpacity style={styles.lineMeasureNumpadKey} onPress={() => handleLineMeasurementNumpadPress(',')}>
                  <Text style={styles.lineMeasureNumpadKeyText}>,</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.lineMeasureNumpadKey} onPress={() => handleLineMeasurementNumpadPress('0')}>
                  <Text style={styles.lineMeasureNumpadKeyText}>0</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.lineMeasureNumpadKey, styles.lineMeasureNumpadDel]} onPress={() => handleLineMeasurementNumpadPress('⌫')}>
                  <Ionicons name="backspace-outline" size={20} color="#f44336" />
                </TouchableOpacity>
              </View>
              <View style={styles.lineMeasureNumpadRow}>
                <TouchableOpacity style={[styles.lineMeasureNumpadKey, styles.lineMeasureNumpadUnit]} onPress={() => handleLineMeasurementNumpadPress('m')}>
                  <Text style={styles.lineMeasureNumpadUnitText}>m</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.lineMeasureNumpadKey, styles.lineMeasureNumpadUnit]} onPress={() => handleLineMeasurementNumpadPress('cm')}>
                  <Text style={styles.lineMeasureNumpadUnitText}>cm</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.lineMeasureNumpadKey, styles.lineMeasureNumpadClear]} onPress={() => handleLineMeasurementNumpadPress('C')}>
                  <Text style={styles.lineMeasureNumpadClearText}>C</Text>
                </TouchableOpacity>
              </View>
            </View>
            
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => {
                  setShowLineMeasurementNumpad(false);
                  setLineMeasurementExpression('');
                }}
              >
                <Text style={styles.cancelButtonText}>Abbrechen</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.confirmButton, !lineMeasurementExpression.trim() && styles.buttonDisabled]}
                onPress={addMeasurementToSelectedLine}
                disabled={!lineMeasurementExpression.trim()}
              >
                <Text style={styles.confirmButtonText}>Hinzufügen</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Text Input Modal */}
      <Modal visible={showTextModal} transparent animationType="slide">
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <ScrollView contentContainerStyle={styles.modalScrollContent}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Text eingeben</Text>
              <TextInput
                ref={textInputRef}
                style={styles.modalInput}
                value={textInput}
                onChangeText={setTextInput}
                placeholder="Text hier eingeben..."
                multiline
                autoFocus
                showSoftInputOnFocus={!showModalNumpad}
              />
              
              {/* Numpad Toggle */}
              <TouchableOpacity 
                style={[styles.numpadToggleBtn, showModalNumpad && styles.numpadToggleBtnActive]}
                onPress={() => {
                  if (showModalNumpad) {
                    closeModalNumpad();
                  } else {
                    openModalNumpad(setTextInput, textInputRef);
                  }
                }}
              >
                <Ionicons name="calculator" size={18} color={showModalNumpad ? '#fff' : '#2196f3'} />
                <Text style={[styles.numpadToggleBtnText, showModalNumpad && styles.numpadToggleBtnTextActive]}>
                  {showModalNumpad ? 'Numpad ausblenden' : 'Numpad einblenden'}
                </Text>
                <View style={styles.bluetoothBadgeSmall}>
                  <Ionicons name="bluetooth" size={12} color="#4caf50" />
                </View>
              </TouchableOpacity>
              
              {/* Font Size Slider */}
              <View style={styles.sliderContainer}>
                <Text style={styles.modalLabel}>Schriftgröße: {lastTextFontSize}px</Text>
                <View style={styles.sliderRow}>
                  <TouchableOpacity 
                    style={styles.sliderButton} 
                    onPress={() => updateLastTextFontSize(Math.max(10, lastTextFontSize - 2))}
                  >
                    <Text style={styles.sliderButtonText}>-</Text>
                  </TouchableOpacity>
                  <View style={styles.sliderTrack}>
                    <View style={[styles.sliderFill, { width: `${((lastTextFontSize - 10) / 50) * 100}%` }]} />
                  </View>
                  <TouchableOpacity 
                    style={styles.sliderButton} 
                    onPress={() => updateLastTextFontSize(Math.min(60, lastTextFontSize + 2))}
                  >
                    <Text style={styles.sliderButtonText}>+</Text>
                  </TouchableOpacity>
                </View>
              </View>
              
              {/* Font Family Selection */}
              <View style={styles.fontFamilyContainer}>
                <Text style={styles.modalLabel}>Schriftart:</Text>
                <View style={styles.fontFamilyButtons}>
                  {FONT_FAMILIES.map(font => (
                    <TouchableOpacity
                      key={font.id}
                      style={[
                        styles.fontFamilyButton,
                        lastTextFontFamily === font.id && styles.fontFamilyButtonActive
                      ]}
                      onPress={() => updateLastTextFontFamily(font.id)}
                    >
                      <Text style={[
                        styles.fontFamilyButtonText,
                        { fontFamily: font.style },
                        lastTextFontFamily === font.id && styles.fontFamilyButtonTextActive
                      ]}>
                        {font.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
              
              {/* Color Picker */}
              <View style={styles.colorPickerContainer}>
                <Text style={styles.modalLabel}>Farbe:</Text>
                <View style={styles.colorGrid}>
                  {colors.map(color => (
                    <TouchableOpacity
                      key={color}
                      style={[
                        styles.colorOption,
                        { backgroundColor: color },
                        lastTextColor === color && styles.colorOptionSelected,
                      ]}
                      onPress={() => updateLastTextColor(color)}
                    />
                  ))}
                </View>
              </View>
              
              <View style={styles.modalButtons}>
                <TouchableOpacity
                  style={[styles.modalButton, styles.cancelButton]}
                  onPress={() => {
                    setShowTextModal(false);
                    setTextInput('');
                    setPendingPosition(null);
                    closeModalNumpad();
                  }}
                >
                  <Text style={styles.cancelButtonText}>Abbrechen</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalButton, styles.confirmButton]}
                  onPress={() => {
                    addTextElement();
                    closeModalNumpad();
                  }}
                >
                  <Text style={styles.confirmButtonText}>Hinzufügen</Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
          {/* Numpad als floating Element INNERHALB des Modals */}
          {renderInModalNumpad()}
        </KeyboardAvoidingView>
      </Modal>

      {/* Arrow Modal */}
      <Modal visible={showArrowModal} transparent animationType="slide">
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <ScrollView contentContainerStyle={styles.modalScrollContent}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Bemaßungspfeil</Text>
              <TextInput
                ref={arrowInputRef}
                style={styles.modalInput}
                value={arrowText}
                onChangeText={setArrowText}
                placeholder="Maß eingeben (z.B. 5,5m)"
                autoFocus
                showSoftInputOnFocus={!showModalNumpad}
              />
              
              {/* Numpad Toggle */}
              <TouchableOpacity 
                style={[styles.numpadToggleBtn, showModalNumpad && styles.numpadToggleBtnActive]}
                onPress={() => {
                  if (showModalNumpad) {
                    closeModalNumpad();
                  } else {
                    openModalNumpad(setArrowText, arrowInputRef);
                  }
                }}
              >
                <Ionicons name="calculator" size={18} color={showModalNumpad ? '#fff' : '#2196f3'} />
                <Text style={[styles.numpadToggleBtnText, showModalNumpad && styles.numpadToggleBtnTextActive]}>
                  {showModalNumpad ? 'Numpad ausblenden' : 'Numpad einblenden'}
                </Text>
                <View style={styles.bluetoothBadgeSmall}>
                  <Ionicons name="bluetooth" size={12} color="#4caf50" />
                </View>
              </TouchableOpacity>
              
              <View style={styles.arrowHeadsContainer}>
                <Text style={styles.modalLabel}>Pfeilspitzen:</Text>
                <View style={styles.arrowHeadsButtons}>
                  <TouchableOpacity
                    style={[styles.arrowHeadButton, arrowHeads === 'single' && styles.arrowHeadButtonActive]}
                    onPress={() => setArrowHeads('single')}
                  >
                    <Text style={styles.arrowHeadButtonText}>Einfach →</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.arrowHeadButton, arrowHeads === 'double' && styles.arrowHeadButtonActive]}
                    onPress={() => setArrowHeads('double')}
                  >
                    <Text style={styles.arrowHeadButtonText}>Doppelt ↔</Text>
                  </TouchableOpacity>
                </View>
              </View>
              
              {/* Stroke Width Slider */}
              <View style={styles.sliderContainer}>
                <Text style={styles.modalLabel}>Linienstärke: {editArrowStrokeWidth}px</Text>
                <View style={styles.sliderRow}>
                  <TouchableOpacity 
                    style={styles.sliderButton} 
                    onPress={() => updateEditArrowStrokeWidth(Math.max(1, editArrowStrokeWidth - 1))}
                  >
                    <Text style={styles.sliderButtonText}>-</Text>
                  </TouchableOpacity>
                  <View style={styles.sliderTrack}>
                    <View style={[styles.sliderFill, { width: `${(editArrowStrokeWidth / 10) * 100}%` }]} />
                  </View>
                  <TouchableOpacity 
                    style={styles.sliderButton} 
                    onPress={() => updateEditArrowStrokeWidth(Math.min(10, editArrowStrokeWidth + 1))}
                  >
                    <Text style={styles.sliderButtonText}>+</Text>
                  </TouchableOpacity>
                </View>
              </View>
              
              {/* Font Size Slider */}
              <View style={styles.sliderContainer}>
                <Text style={styles.modalLabel}>Schriftgröße: {editArrowFontSize}px</Text>
                <View style={styles.sliderRow}>
                  <TouchableOpacity 
                    style={styles.sliderButton} 
                    onPress={() => updateEditArrowFontSize(Math.max(8, editArrowFontSize - 2))}
                  >
                    <Text style={styles.sliderButtonText}>-</Text>
                  </TouchableOpacity>
                  <View style={styles.sliderTrack}>
                    <View style={[styles.sliderFill, { width: `${((editArrowFontSize - 8) / 32) * 100}%` }]} />
                  </View>
                  <TouchableOpacity 
                    style={styles.sliderButton} 
                    onPress={() => updateEditArrowFontSize(Math.min(40, editArrowFontSize + 2))}
                  >
                    <Text style={styles.sliderButtonText}>+</Text>
                  </TouchableOpacity>
                </View>
              </View>
              
              <View style={styles.modalButtons}>
                <TouchableOpacity
                  style={[styles.modalButton, styles.cancelButton]}
                  onPress={() => {
                    setShowArrowModal(false);
                    setArrowText('');
                    setPendingArrow(null);
                    closeModalNumpad();
                  }}
                >
                  <Text style={styles.cancelButtonText}>Abbrechen</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalButton, styles.confirmButton]}
                  onPress={() => {
                    addArrowElement();
                    closeModalNumpad();
                  }}
                >
                  <Text style={styles.confirmButtonText}>Hinzufügen</Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
          {/* Numpad als floating Element INNERHALB des Modals */}
          {renderInModalNumpad()}
        </KeyboardAvoidingView>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal visible={showDeleteConfirm} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Element löschen</Text>
            <Text style={styles.modalMessage}>Möchten Sie das ausgewählte Element wirklich löschen?</Text>
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => setShowDeleteConfirm(false)}
              >
                <Text style={styles.cancelButtonText}>Abbrechen</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.deleteButton]}
                onPress={deleteSelectedElement}
              >
                <Text style={styles.deleteButtonText}>Löschen</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Edit Arrow Modal */}
      <Modal visible={showEditArrowModal} transparent animationType="slide">
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <ScrollView contentContainerStyle={styles.modalScrollContent}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Pfeil bearbeiten</Text>
              <TextInput
                ref={arrowInputRef}
                style={styles.modalInput}
                value={arrowText}
                onChangeText={setArrowText}
                placeholder="Maß eingeben (z.B. 5,5m)"
                showSoftInputOnFocus={!showModalNumpad}
              />
              
              {/* Numpad Toggle */}
              <TouchableOpacity 
                style={[styles.numpadToggleBtn, showModalNumpad && styles.numpadToggleBtnActive]}
                onPress={() => {
                  if (showModalNumpad) {
                    closeModalNumpad();
                  } else {
                    openModalNumpad(setArrowText, arrowInputRef);
                  }
                }}
              >
                <Ionicons name="calculator" size={18} color={showModalNumpad ? '#fff' : '#2196f3'} />
                <Text style={[styles.numpadToggleBtnText, showModalNumpad && styles.numpadToggleBtnTextActive]}>
                  {showModalNumpad ? 'Numpad ausblenden' : 'Numpad einblenden'}
                </Text>
                <View style={styles.bluetoothBadgeSmall}>
                  <Ionicons name="bluetooth" size={12} color="#4caf50" />
                </View>
              </TouchableOpacity>
              
              <View style={styles.arrowHeadsContainer}>
                <Text style={styles.modalLabel}>Pfeilspitzen:</Text>
                <View style={styles.arrowHeadsButtons}>
                  <TouchableOpacity
                    style={[styles.arrowHeadButton, arrowHeads === 'single' && styles.arrowHeadButtonActive]}
                    onPress={() => setArrowHeads('single')}
                  >
                    <Text style={styles.arrowHeadButtonText}>Einfach →</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.arrowHeadButton, arrowHeads === 'double' && styles.arrowHeadButtonActive]}
                    onPress={() => setArrowHeads('double')}
                  >
                    <Text style={styles.arrowHeadButtonText}>Doppelt ↔</Text>
                  </TouchableOpacity>
                </View>
              </View>
              
              {/* Stroke Width Slider */}
              <View style={styles.sliderContainer}>
                <Text style={styles.modalLabel}>Linienstärke: {editArrowStrokeWidth}px</Text>
                <View style={styles.sliderRow}>
                  <TouchableOpacity 
                    style={styles.sliderButton} 
                    onPress={() => updateEditArrowStrokeWidth(Math.max(1, editArrowStrokeWidth - 1))}
                  >
                    <Text style={styles.sliderButtonText}>-</Text>
                  </TouchableOpacity>
                  <View style={styles.sliderTrack}>
                    <View style={[styles.sliderFill, { width: `${(editArrowStrokeWidth / 10) * 100}%` }]} />
                  </View>
                  <TouchableOpacity 
                    style={styles.sliderButton} 
                    onPress={() => updateEditArrowStrokeWidth(Math.min(10, editArrowStrokeWidth + 1))}
                  >
                    <Text style={styles.sliderButtonText}>+</Text>
                  </TouchableOpacity>
                </View>
              </View>
              
              {/* Font Size Slider */}
              <View style={styles.sliderContainer}>
                <Text style={styles.modalLabel}>Schriftgröße: {editArrowFontSize}px</Text>
                <View style={styles.sliderRow}>
                  <TouchableOpacity 
                    style={styles.sliderButton} 
                    onPress={() => updateEditArrowFontSize(Math.max(8, editArrowFontSize - 2))}
                  >
                    <Text style={styles.sliderButtonText}>-</Text>
                  </TouchableOpacity>
                  <View style={styles.sliderTrack}>
                    <View style={[styles.sliderFill, { width: `${((editArrowFontSize - 8) / 32) * 100}%` }]} />
                  </View>
                  <TouchableOpacity 
                    style={styles.sliderButton} 
                    onPress={() => updateEditArrowFontSize(Math.min(40, editArrowFontSize + 2))}
                  >
                    <Text style={styles.sliderButtonText}>+</Text>
                  </TouchableOpacity>
                </View>
              </View>
              
              <View style={styles.colorPickerContainer}>
                <Text style={styles.modalLabel}>Farbe:</Text>
                <View style={styles.colorGrid}>
                  {colors.map(color => (
                    <TouchableOpacity
                      key={color}
                      style={[
                        styles.colorOption,
                        { backgroundColor: color },
                        drawColor === color && styles.colorOptionSelected,
                      ]}
                      onPress={() => setDrawColor(color)}
                    />
                  ))}
                </View>
              </View>
              <View style={styles.modalButtons}>
                <TouchableOpacity
                  style={[styles.modalButton, styles.cancelButton]}
                  onPress={() => {
                    setShowEditArrowModal(false);
                    setArrowText('');
                  }}
                >
                  <Text style={styles.cancelButtonText}>Abbrechen</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalButton, styles.confirmButton]}
                  onPress={() => {
                    if (selectedElementId) {
                      const newElements = elements.map(el => {
                        if (el.id === selectedElementId && el.type === 'arrow') {
                          return {
                            ...el,
                            data: {
                              ...el.data,
                              text: arrowText,
                              heads: arrowHeads,
                              fontSize: editArrowFontSize,
                            },
                            color: drawColor,
                            strokeWidth: editArrowStrokeWidth,
                          };
                        }
                        return el;
                      });
                      addToHistory(newElements);
                      setShowEditArrowModal(false);
                      setArrowText('');
                    }
                  }}
                >
                  <Text style={styles.confirmButtonText}>Aktualisieren</Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
          {/* Numpad als floating Element INNERHALB des Modals */}
          {renderInModalNumpad()}
        </KeyboardAvoidingView>
      </Modal>

      {/* Pointer (Memo Arrow) Modal - New */}
      <Modal visible={showPointerModal} transparent animationType="slide">
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Memo-Pfeil</Text>
            <Text style={styles.modalSubtitle}>Optional: Notiz hinzufügen</Text>
            <TextInput
              ref={pointerInputRef}
              style={styles.modalInput}
              value={pointerText}
              onChangeText={setPointerText}
              placeholder="Notiz eingeben (optional)"
              autoFocus
              multiline
              showSoftInputOnFocus={!showModalNumpad}
            />
            
            {/* Numpad Toggle */}
            <TouchableOpacity 
              style={[styles.numpadToggleBtn, showModalNumpad && styles.numpadToggleBtnActive]}
              onPress={() => {
                if (showModalNumpad) {
                  closeModalNumpad();
                } else {
                  openModalNumpad(setPointerText, pointerInputRef);
                }
              }}
            >
              <Ionicons name="calculator" size={18} color={showModalNumpad ? '#fff' : '#2196f3'} />
              <Text style={[styles.numpadToggleBtnText, showModalNumpad && styles.numpadToggleBtnTextActive]}>
                {showModalNumpad ? 'Numpad ausblenden' : 'Numpad einblenden'}
              </Text>
              <View style={styles.bluetoothBadgeSmall}>
                <Ionicons name="bluetooth" size={12} color="#4caf50" />
              </View>
            </TouchableOpacity>
            
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => {
                  setShowPointerModal(false);
                  setPointerText('');
                  setPendingPointer(null);
                  closeModalNumpad();
                }}
              >
                <Text style={styles.cancelButtonText}>Abbrechen</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.confirmButton]}
                onPress={() => {
                  addPointerElement();
                  closeModalNumpad();
                }}
              >
                <Text style={styles.confirmButtonText}>Hinzufügen</Text>
              </TouchableOpacity>
            </View>
          </View>
          {/* Numpad als floating Element INNERHALB des Modals */}
          {renderInModalNumpad()}
        </KeyboardAvoidingView>
      </Modal>

      {/* Edit Pointer Modal */}
      <Modal visible={showEditPointerModal} transparent animationType="slide">
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <ScrollView contentContainerStyle={styles.modalScrollContent}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Memo-Pfeil bearbeiten</Text>
              <TextInput
                ref={pointerInputRef}
                style={styles.modalInput}
                value={pointerText}
                onChangeText={setPointerText}
                placeholder="Notiz eingeben (optional)"
                multiline
                showSoftInputOnFocus={!showModalNumpad}
              />
              
              {/* Numpad Toggle */}
              <TouchableOpacity 
                style={[styles.numpadToggleBtn, showModalNumpad && styles.numpadToggleBtnActive]}
                onPress={() => {
                  if (showModalNumpad) {
                    closeModalNumpad();
                  } else {
                    openModalNumpad(setPointerText, pointerInputRef);
                  }
                }}
              >
                <Ionicons name="calculator" size={18} color={showModalNumpad ? '#fff' : '#2196f3'} />
                <Text style={[styles.numpadToggleBtnText, showModalNumpad && styles.numpadToggleBtnTextActive]}>
                  {showModalNumpad ? 'Numpad ausblenden' : 'Numpad einblenden'}
                </Text>
                <View style={styles.bluetoothBadgeSmall}>
                  <Ionicons name="bluetooth" size={12} color="#4caf50" />
                </View>
              </TouchableOpacity>
              
              {/* Stroke Width Slider */}
              <View style={styles.sliderContainer}>
                <Text style={styles.modalLabel}>Linienstärke: {editPointerStrokeWidth}px</Text>
                <View style={styles.sliderRow}>
                  <TouchableOpacity 
                    style={styles.sliderButton} 
                    onPress={() => updateEditPointerStrokeWidth(Math.max(1, editPointerStrokeWidth - 1))}
                  >
                    <Text style={styles.sliderButtonText}>-</Text>
                  </TouchableOpacity>
                  <View style={styles.sliderTrack}>
                    <View style={[styles.sliderFill, { width: `${((editPointerStrokeWidth - 1) / 19) * 100}%` }]} />
                  </View>
                  <TouchableOpacity 
                    style={styles.sliderButton} 
                    onPress={() => updateEditPointerStrokeWidth(Math.min(20, editPointerStrokeWidth + 2))}
                  >
                    <Text style={styles.sliderButtonText}>+</Text>
                  </TouchableOpacity>
                </View>
              </View>
              
              {/* Font Size Slider */}
              <View style={styles.sliderContainer}>
                <Text style={styles.modalLabel}>Schriftgröße: {editPointerFontSize}px</Text>
                <View style={styles.sliderRow}>
                  <TouchableOpacity 
                    style={styles.sliderButton} 
                    onPress={() => updateEditPointerFontSize(Math.max(6, editPointerFontSize - 2))}
                  >
                    <Text style={styles.sliderButtonText}>-</Text>
                  </TouchableOpacity>
                  <View style={styles.sliderTrack}>
                    <View style={[styles.sliderFill, { width: `${((editPointerFontSize - 6) / 34) * 100}%` }]} />
                  </View>
                  <TouchableOpacity 
                    style={styles.sliderButton} 
                    onPress={() => updateEditPointerFontSize(Math.min(40, editPointerFontSize + 2))}
                  >
                    <Text style={styles.sliderButtonText}>+</Text>
                  </TouchableOpacity>
                </View>
              </View>
              
              <View style={styles.colorPickerContainer}>
                <Text style={styles.modalLabel}>Farbe:</Text>
                <View style={styles.colorGrid}>
                  {colors.map(color => (
                    <TouchableOpacity
                      key={color}
                      style={[
                        styles.colorOption,
                        { backgroundColor: color },
                        drawColor === color && styles.colorOptionSelected,
                      ]}
                      onPress={() => setDrawColor(color)}
                    />
                  ))}
                </View>
              </View>
              <View style={styles.modalButtons}>
                <TouchableOpacity
                  style={[styles.modalButton, styles.cancelButton]}
                  onPress={() => {
                    setShowEditPointerModal(false);
                    setPointerText('');
                  }}
                >
                  <Text style={styles.cancelButtonText}>Abbrechen</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalButton, styles.confirmButton]}
                  onPress={updatePointerElement}
                >
                  <Text style={styles.confirmButtonText}>Aktualisieren</Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
          {/* Numpad als floating Element INNERHALB des Modals */}
          {renderInModalNumpad()}
        </KeyboardAvoidingView>
      </Modal>

      {/* Memo/Notiz Modal - Neue Notiz erstellen */}
      <Modal visible={showMemoModal} transparent animationType="slide">
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Notiz hinzufügen</Text>
            <Text style={styles.modalSubtitle}>Text für die Notiz eingeben</Text>
            <TextInput
              style={styles.modalInput}
              value={memoText}
              onChangeText={setMemoText}
              placeholder="Notiz eingeben"
              autoFocus
              selectTextOnFocus
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => {
                  setShowMemoModal(false);
                  setMemoText('');
                  setPendingMemo(null);
                }}
              >
                <Text style={styles.cancelButtonText}>Abbrechen</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.confirmButton]}
                onPress={addMemoElement}
              >
                <Text style={styles.confirmButtonText}>Hinzufügen</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Edit Memo Modal - Bestehende Notiz bearbeiten */}
      <Modal visible={showEditMemoModal} transparent animationType="slide">
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Notiz bearbeiten</Text>
            <TextInput
              style={styles.modalInput}
              value={memoText}
              onChangeText={setMemoText}
              placeholder="Notiz eingeben"
              multiline
            />
            {/* Font Size Slider */}
            <View style={styles.sliderContainer}>
              <Text style={styles.modalLabel}>Schriftgröße: {editMemoFontSize}px</Text>
              <View style={styles.sliderRow}>
                <TouchableOpacity 
                  style={styles.sliderButton} 
                  onPress={() => updateEditMemoFontSize(Math.max(6, editMemoFontSize - 2))}
                >
                  <Text style={styles.sliderButtonText}>-</Text>
                </TouchableOpacity>
                <View style={styles.sliderTrack}>
                  <View style={[styles.sliderFill, { width: `${((editMemoFontSize - 6) / 34) * 100}%` }]} />
                </View>
                <TouchableOpacity 
                  style={styles.sliderButton} 
                  onPress={() => updateEditMemoFontSize(Math.min(40, editMemoFontSize + 2))}
                >
                  <Text style={styles.sliderButtonText}>+</Text>
                </TouchableOpacity>
              </View>
            </View>
            {/* Color Selection */}
            <View style={styles.colorSelectionContainer}>
              <Text style={styles.modalLabel}>Farbe:</Text>
              <View style={styles.colorOptions}>
                {['#E74C3C', '#333333', '#2196f3', '#4caf50', '#FF9800', '#9C27B0'].map((color) => (
                  <TouchableOpacity
                    key={color}
                    style={[
                      styles.colorOption,
                      { backgroundColor: color },
                      drawColor === color && styles.colorOptionSelected,
                    ]}
                    onPress={() => setDrawColor(color)}
                  />
                ))}
              </View>
            </View>
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => {
                  setShowEditMemoModal(false);
                  setMemoText('');
                }}
              >
                <Text style={styles.cancelButtonText}>Abbrechen</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.confirmButton]}
                onPress={updateMemoElement}
              >
                <Text style={styles.confirmButtonText}>Aktualisieren</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Edit Polygon Modal - Polygon/Polyline Eigenschaften bearbeiten */}
      <Modal visible={showEditPolygonModal} transparent animationType="slide">
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Form bearbeiten</Text>
            
            {/* Stroke Width Slider */}
            <View style={styles.sliderContainer}>
              <Text style={styles.modalLabel}>Strichstärke: {editPolygonStrokeWidth}px</Text>
              <View style={styles.sliderRow}>
                <TouchableOpacity 
                  style={styles.sliderButton} 
                  onPress={() => setEditPolygonStrokeWidth(Math.max(1, editPolygonStrokeWidth - 1))}
                >
                  <Text style={styles.sliderButtonText}>-</Text>
                </TouchableOpacity>
                <View style={styles.sliderTrack}>
                  <View style={[styles.sliderFill, { width: `${((editPolygonStrokeWidth - 1) / 19) * 100}%` }]} />
                </View>
                <TouchableOpacity 
                  style={styles.sliderButton} 
                  onPress={() => setEditPolygonStrokeWidth(Math.min(20, editPolygonStrokeWidth + 1))}
                >
                  <Text style={styles.sliderButtonText}>+</Text>
                </TouchableOpacity>
              </View>
            </View>
            
            {/* Color Selection */}
            <View style={styles.colorSelectionContainer}>
              <Text style={styles.modalLabel}>Farbe:</Text>
              <View style={styles.colorOptions}>
                {['#E74C3C', '#333333', '#2196f3', '#4caf50', '#FF9800', '#9C27B0', '#795548', '#607D8B'].map((color) => (
                  <TouchableOpacity
                    key={color}
                    style={[
                      styles.colorOption,
                      { backgroundColor: color },
                      editPolygonColor === color && styles.colorOptionSelected,
                    ]}
                    onPress={() => setEditPolygonColor(color)}
                  />
                ))}
              </View>
            </View>
            
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => setShowEditPolygonModal(false)}
              >
                <Text style={styles.cancelButtonText}>Abbrechen</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.confirmButton]}
                onPress={updatePolygonElement}
              >
                <Text style={styles.confirmButtonText}>Aktualisieren</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Edit Text Modal */}
      <Modal visible={showEditTextModal} transparent animationType="slide">
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <ScrollView contentContainerStyle={styles.modalScrollContent}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Text bearbeiten</Text>
              <TextInput
                ref={textInputRef}
                style={styles.modalInput}
                value={textInput}
                onChangeText={setTextInput}
                placeholder="Text eingeben"
                multiline
                showSoftInputOnFocus={!showModalNumpad}
              />
              
              {/* Numpad Toggle */}
              <TouchableOpacity 
                style={[styles.numpadToggleBtn, showModalNumpad && styles.numpadToggleBtnActive]}
                onPress={() => {
                  if (showModalNumpad) {
                    closeModalNumpad();
                  } else {
                    openModalNumpad(setTextInput, textInputRef);
                  }
                }}
              >
                <Ionicons name="calculator" size={18} color={showModalNumpad ? '#fff' : '#2196f3'} />
                <Text style={[styles.numpadToggleBtnText, showModalNumpad && styles.numpadToggleBtnTextActive]}>
                  {showModalNumpad ? 'Numpad ausblenden' : 'Numpad einblenden'}
                </Text>
                <View style={styles.bluetoothBadgeSmall}>
                  <Ionicons name="bluetooth" size={12} color="#4caf50" />
                </View>
              </TouchableOpacity>
              
              {/* Font Size Slider */}
              <View style={styles.sliderContainer}>
                <Text style={styles.modalLabel}>Schriftgröße: {editFontSize}px</Text>
                <View style={styles.sliderRow}>
                  <TouchableOpacity 
                    style={styles.sliderButton} 
                    onPress={() => setEditFontSize(Math.max(10, editFontSize - 2))}
                  >
                    <Text style={styles.sliderButtonText}>-</Text>
                  </TouchableOpacity>
                  <View style={styles.sliderTrack}>
                    <View style={[styles.sliderFill, { width: `${((editFontSize - 10) / 50) * 100}%` }]} />
                  </View>
                  <TouchableOpacity 
                    style={styles.sliderButton} 
                    onPress={() => setEditFontSize(Math.min(60, editFontSize + 2))}
                  >
                    <Text style={styles.sliderButtonText}>+</Text>
                  </TouchableOpacity>
                </View>
              </View>
              
              {/* Font Style Buttons */}
              <View style={styles.fontStyleContainer}>
                <Text style={styles.modalLabel}>Stil:</Text>
                <View style={styles.fontStyleButtons}>
                  <TouchableOpacity
                    style={[styles.fontStyleButton, editFontWeight === 'bold' && styles.fontStyleButtonActive]}
                    onPress={() => setEditFontWeight(editFontWeight === 'bold' ? 'normal' : 'bold')}
                  >
                    <Text style={[styles.fontStyleButtonText, { fontWeight: 'bold' }]}>F</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.fontStyleButton, editFontStyle === 'italic' && styles.fontStyleButtonActive]}
                    onPress={() => setEditFontStyle(editFontStyle === 'italic' ? 'normal' : 'italic')}
                  >
                    <Text style={[styles.fontStyleButtonText, { fontStyle: 'italic' }]}>K</Text>
                  </TouchableOpacity>
                </View>
              </View>
              
              {/* Font Family Selection */}
              <View style={styles.fontFamilyContainer}>
                <Text style={styles.modalLabel}>Schriftart:</Text>
                <View style={styles.fontFamilyButtons}>
                  {FONT_FAMILIES.map(font => (
                    <TouchableOpacity
                      key={font.id}
                      style={[
                        styles.fontFamilyButton,
                        editFontFamily === font.id && styles.fontFamilyButtonActive
                      ]}
                      onPress={() => setEditFontFamily(font.id)}
                    >
                      <Text style={[
                        styles.fontFamilyButtonText,
                        { fontFamily: font.style },
                        editFontFamily === font.id && styles.fontFamilyButtonTextActive
                      ]}>
                        {font.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
              
              <View style={styles.colorPickerContainer}>
                <Text style={styles.modalLabel}>Farbe:</Text>
                <View style={styles.colorGrid}>
                  {colors.map(color => (
                    <TouchableOpacity
                      key={color}
                      style={[
                        styles.colorOption,
                        { backgroundColor: color },
                        drawColor === color && styles.colorOptionSelected,
                      ]}
                      onPress={() => setDrawColor(color)}
                    />
                  ))}
                </View>
              </View>
              
              <View style={styles.modalButtons}>
                <TouchableOpacity
                  style={[styles.modalButton, styles.cancelButton]}
                  onPress={() => {
                    setShowEditTextModal(false);
                    setTextInput('');
                  }}
                >
                  <Text style={styles.cancelButtonText}>Abbrechen</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalButton, styles.confirmButton]}
                  onPress={() => {
                    if (selectedElementId && textInput.trim()) {
                      const newElements = elements.map(el => {
                        if (el.id === selectedElementId && el.type === 'text') {
                          return {
                            ...el,
                            data: { ...el.data, text: textInput },
                            color: drawColor,
                            fontSize: editFontSize,
                            fontWeight: editFontWeight,
                            fontStyle: editFontStyle,
                            fontFamily: FONT_FAMILIES.find(f => f.id === editFontFamily)?.svgFont || 'sans-serif',
                          };
                        }
                        return el;
                      });
                      addToHistory(newElements);
                      setShowEditTextModal(false);
                      setTextInput('');
                    }
                  }}
                >
                  <Text style={styles.confirmButtonText}>Aktualisieren</Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
          {/* Numpad als floating Element INNERHALB des Modals */}
          {renderInModalNumpad()}
        </KeyboardAvoidingView>
      </Modal>

      {/* Notes Modal */}
      <Modal visible={showNotesModal} transparent animationType="slide">
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Notizen zur Skizze</Text>
            <Text style={styles.modalSubtitle}>Diese Notizen werden im PDF unter der Skizze angezeigt</Text>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
              <TextInput
                ref={notesInputRef}
                style={[styles.modalInput, styles.notesInput, { flex: 1 }]}
                value={notes}
                onChangeText={setNotes}
                placeholder="Notizen hier eingeben..."
                placeholderTextColor="#999"
                multiline
                autoFocus
                textAlignVertical="top"
              />
              <TouchableOpacity
                style={{
                  marginLeft: 8,
                  padding: 10,
                  backgroundColor: showModalNumpad && activeNumpadRef === notesInputRef ? '#1976d2' : '#f0f0f0',
                  borderRadius: 8,
                }}
                onPress={() => {
                  if (showModalNumpad && activeNumpadRef === notesInputRef) {
                    closeModalNumpad();
                  } else {
                    openModalNumpad(setNotes, notesInputRef);
                  }
                }}
              >
                <Ionicons
                  name="keypad"
                  size={24}
                  color={showModalNumpad && activeNumpadRef === notesInputRef ? '#fff' : '#666'}
                />
              </TouchableOpacity>
            </View>
            <View style={styles.notesModalButtons}>
              <TouchableOpacity
                style={styles.notesModalButton}
                onPress={() => {
                  closeModalNumpad();
                  setShowNotesModal(false);
                }}
              >
                <Text style={styles.notesModalButtonText}>Schließen</Text>
              </TouchableOpacity>
              {notes.trim() && (
                <TouchableOpacity
                  style={[styles.notesModalButton, styles.notesModalButtonDelete]}
                  onPress={() => {
                    setNotes('');
                    closeModalNumpad();
                    setShowNotesModal(false);
                  }}
                >
                  <Text style={styles.notesModalButtonTextWhite}>Löschen</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[styles.notesModalButton, styles.notesModalButtonSave]}
                onPress={() => {
                  closeModalNumpad();
                  setShowNotesModal(false);
                }}
              >
                <Text style={styles.notesModalButtonTextWhite}>Speichern</Text>
              </TouchableOpacity>
            </View>
            {/* In-Modal Numpad für Notizen */}
            {renderInModalNumpad()}
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Projektfotos Modal */}
      <Modal visible={showProjectPhotosModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxHeight: '80%', width: '95%' }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <Text style={styles.modalTitle}>Projektfotos auswählen</Text>
              <TouchableOpacity onPress={() => setShowProjectPhotosModal(false)}>
                <Ionicons name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>
            
            {projectPhotos.length === 0 ? (
              <View style={{ padding: 40, alignItems: 'center' }}>
                <Ionicons name="images-outline" size={48} color="#ccc" />
                <Text style={{ marginTop: 16, color: '#666', textAlign: 'center' }}>
                  Keine Fotos in diesem Projekt vorhanden.
                </Text>
                <Text style={{ marginTop: 8, color: '#999', fontSize: 12, textAlign: 'center' }}>
                  Fügen Sie Fotos über die Projekt-Detailseite hinzu.
                </Text>
              </View>
            ) : (
              <ScrollView style={{ maxHeight: 400 }}>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {projectPhotos.map((photo, index) => (
                    <TouchableOpacity
                      key={photo.id || index}
                      style={{
                        width: '31%',
                        aspectRatio: 1,
                        borderRadius: 8,
                        overflow: 'hidden',
                        backgroundColor: '#f0f0f0',
                        borderWidth: 2,
                        borderColor: '#e0e0e0',
                      }}
                      onPress={() => insertProjectPhoto(photo)}
                    >
                      {(photo.image_data || photo.uri) ? (
                        <RNImage
                          source={{ uri: photo.image_data || photo.uri }}
                          style={{ width: '100%', height: '100%' }}
                          resizeMode="cover"
                        />
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
            
            <View style={[styles.modalButtons, { marginTop: 16 }]}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => setShowProjectPhotosModal(false)}
              >
                <Text style={styles.cancelButtonText}>Abbrechen</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Crop Modal */}
      <Modal visible={showCropModal} transparent animationType="fade">
        <View style={styles.cropModalOverlay}>
          <View style={styles.cropModalContent}>
            <Text style={styles.cropModalTitle}>Foto zuschneiden</Text>
            <Text style={styles.cropModalSubtitle}>Ziehen Sie die Ecken um den Bereich anzupassen</Text>
            
            <View 
              ref={cropContainerRef}
              style={styles.cropImageContainer}
              {...cropPanResponder.panHandlers}
            >
              {cropImageUri && (
                <RNImage
                  source={{ uri: cropImageUri }}
                  style={styles.cropImage}
                  resizeMode="contain"
                  pointerEvents="none"
                />
              )}
              
              {/* Dunkle Overlay außerhalb der Crop-Box */}
              <View style={[styles.cropOverlay, styles.cropOverlayTop, { height: cropBox.y }]} pointerEvents="none" />
              <View style={[styles.cropOverlay, styles.cropOverlayBottom, { top: cropBox.y + cropBox.height, height: 300 - cropBox.y - cropBox.height }]} pointerEvents="none" />
              <View style={[styles.cropOverlay, styles.cropOverlayLeft, { top: cropBox.y, height: cropBox.height, width: cropBox.x }]} pointerEvents="none" />
              <View style={[styles.cropOverlay, styles.cropOverlayRight, { top: cropBox.y, height: cropBox.height, left: cropBox.x + cropBox.width, width: 300 - cropBox.x - cropBox.width }]} pointerEvents="none" />
              
              {/* Crop Box Rahmen */}
              <View 
                style={[
                  styles.cropBox,
                  {
                    left: cropBox.x,
                    top: cropBox.y,
                    width: cropBox.width,
                    height: cropBox.height,
                  }
                ]}
                pointerEvents="none"
              >
                {/* Ecken-Handles */}
                <View style={[styles.cropHandle, styles.cropHandleTopLeft]} />
                <View style={[styles.cropHandle, styles.cropHandleTopRight]} />
                <View style={[styles.cropHandle, styles.cropHandleBottomLeft]} />
                <View style={[styles.cropHandle, styles.cropHandleBottomRight]} />
              </View>
            </View>
            
            <View style={styles.cropButtonRow}>
              <TouchableOpacity style={styles.cropCancelButton} onPress={cancelCrop}>
                <Ionicons name="close" size={20} color="#fff" />
                <Text style={styles.cropButtonText}>Abbrechen</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.cropApplyButton} onPress={applyCrop}>
                <Ionicons name="checkmark" size={20} color="#fff" />
                <Text style={styles.cropButtonText}>Anwenden</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
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
    backgroundColor: '#1976d2',
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingTop: Platform.OS === 'ios' ? 50 : 12,
  },
  headerButton: {
    padding: 8,
  },
  pdfSizeHeaderButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  pdfSizeHeaderLabel: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '600',
    marginTop: 2,
  },
  titleInput: {
    flex: 1,
    marginHorizontal: 16,
    padding: 8,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 8,
    color: '#fff',
    fontSize: 16,
  },
  toolbarContainer: {
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
  },
  toolbar: {
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  toolbarPhone: {
    maxHeight: 70,
  },
  toolbarContentPhone: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingRight: 20,
  },
  toolbarContent: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
  },
  toolButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    paddingVertical: 6,
    minWidth: 32,
    borderRadius: 4,
    marginHorizontal: 1,
  },
  // Neue Styles für Toolbar mit Labels
  toolButtonWithLabel: {
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 2,
  },
  // Breiterer Button für Foto-Tools (gleiche Größe)
  toolButtonPhotoWide: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    paddingVertical: 8,
    minWidth: 50,
    minHeight: 38,
    borderRadius: 6,
    backgroundColor: '#f5f5f5',
  },
  toolButtonPhotoWidePhone: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    minWidth: 40,
    minHeight: 32,
  },
  // Breiteres Label für Foto-Buttons (mehrzeilig)
  toolButtonLabelWide: {
    fontSize: 7,
    color: '#666',
    marginTop: 2,
    textAlign: 'center',
    lineHeight: 9,
    maxWidth: 55,
  },
  toolButtonLabelWidePhone: {
    fontSize: 6,
    maxWidth: 40,
  },
  toolButtonInner: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    paddingVertical: 8,
    minWidth: 36,
    minHeight: 36,
    borderRadius: 6,
    backgroundColor: '#f5f5f5',
  },
  toolButtonInnerWide: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    paddingVertical: 6,
    minWidth: 52,
    minHeight: 36,
    borderRadius: 6,
    backgroundColor: '#f5f5f5',
  },
  // Style für Zoom-Buttons (gleichgroß wie Zoom-Toggle)
  toolButtonZoomSize: {
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'column',
    paddingHorizontal: 6,
    paddingVertical: 4,
    minWidth: 48,
    minHeight: 40,
    borderRadius: 6,
    backgroundColor: '#f5f5f5',
  },
  // Kleinere Color Preview für gruppierte Toolbar
  colorPreviewSmall: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: '#ddd',
  },
  // Kleinere Stroke Width Buttons für gruppierte Toolbar
  strokeWidthButtonSmall: {
    width: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 3,
    backgroundColor: '#f0f0f0',
    marginHorizontal: 1,
  },
  toolButtonLabel: {
    fontSize: 8,
    color: '#666',
    marginTop: 2,
    textAlign: 'center',
    maxWidth: 60,
  },
  toolButtonLabelSmall: {
    fontSize: 7,
    color: '#666',
    marginTop: 2,
    textAlign: 'center',
    lineHeight: 9,
  },
  toolGroupWithLabel: {
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 2,
  },
  toolGroupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  toolGroupLabelRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'center',
    marginTop: 2,
  },
  toolButtonActive: {
    backgroundColor: '#1976d2',
  },
  toolButtonWide: {
    paddingHorizontal: 6,
    minWidth: 68,
  },
  toolButtonDisabled: {
    opacity: 0.4,
  },
  separator: {
    width: 1,
    backgroundColor: '#ddd',
    height: 24,
    marginHorizontal: 2,
  },
  colorPreview: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#ddd',
  },
  strokeWidthButton: {
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 3,
    backgroundColor: '#f0f0f0',
    marginHorizontal: 1,
  },
  strokeWidthButtonActive: {
    backgroundColor: '#1976d2',
  },
  strokeWidthDot: {
    backgroundColor: '#333',
    borderRadius: 10,
  },
  colorPickerPanel: {
    backgroundColor: '#fff',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
  },
  colorPickerTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 12,
  },
  colorPickerContainer: {
    marginBottom: 16,
  },
  colorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  colorSelectionContainer: {
    marginTop: 8,
  },
  colorOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  colorOption: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: '#ddd',
  },
  colorOptionSelected: {
    borderColor: '#1976d2',
    borderWidth: 4,
  },
  canvasScrollView: {
    flex: 1,
  },
  canvasContainer: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  svg: {
    backgroundColor: '#fff',
  },
  infoOverlay: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(0,0,0,0.7)',
    padding: 8,
    borderRadius: 8,
  },
  infoText: {
    color: '#fff',
    fontSize: 12,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 24,
    width: '90%',
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 16,
    color: '#333',
  },
  modalSubtitle: {
    fontSize: 14,
    color: '#666',
    marginBottom: 12,
    fontStyle: 'italic',
  },
  modalMessage: {
    fontSize: 16,
    color: '#666',
    marginBottom: 24,
  },
  modalLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
    color: '#333',
  },
  modalInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    marginBottom: 16,
    minHeight: 50,
  },
  notesInput: {
    minHeight: 150,
    maxHeight: 250,
  },
  notesButtonContainer: {
    position: 'relative',
  },
  notesBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: '#4caf50',
    borderRadius: 6,
    width: 12,
    height: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolButtonWithBadge: {
    backgroundColor: '#e8f5e9',
    borderRadius: 4,
  },
  arrowHeadsContainer: {
    marginBottom: 16,
  },
  arrowHeadsButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  arrowHeadButton: {
    flex: 1,
    padding: 12,
    borderWidth: 2,
    borderColor: '#ddd',
    borderRadius: 8,
    alignItems: 'center',
  },
  arrowHeadButtonActive: {
    borderColor: '#1976d2',
    backgroundColor: '#e3f2fd',
  },
  arrowHeadButtonText: {
    fontSize: 14,
    color: '#333',
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  modalButton: {
    flex: 1,
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: '#e0e0e0',
  },
  cancelButtonText: {
    color: '#333',
    fontSize: 16,
    fontWeight: '600',
  },
  confirmButton: {
    backgroundColor: '#1976d2',
  },
  confirmButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  deleteButton: {
    backgroundColor: '#f44336',
  },
  deleteButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  modalScrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 20,
  },
  sliderContainer: {
    marginBottom: 16,
  },
  sliderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 8,
  },
  sliderButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#1976d2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sliderButtonText: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
  },
  sliderTrack: {
    flex: 1,
    height: 8,
    backgroundColor: '#e0e0e0',
    borderRadius: 4,
    overflow: 'hidden',
  },
  sliderFill: {
    height: '100%',
    backgroundColor: '#1976d2',
    borderRadius: 4,
  },
  fontStyleContainer: {
    marginBottom: 16,
  },
  fontStyleButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  fontStyleButton: {
    width: 50,
    height: 50,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#ddd',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  fontStyleButtonActive: {
    borderColor: '#1976d2',
    backgroundColor: '#e3f2fd',
  },
  fontStyleButtonText: {
    fontSize: 20,
    color: '#333',
  },
  // Font Family Selection
  fontFamilyContainer: {
    marginBottom: 16,
  },
  fontFamilyButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  fontFamilyButton: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#ddd',
    backgroundColor: '#fff',
  },
  fontFamilyButtonActive: {
    borderColor: '#1976d2',
    backgroundColor: '#e3f2fd',
  },
  fontFamilyButtonText: {
    fontSize: 14,
    color: '#333',
  },
  fontFamilyButtonTextActive: {
    color: '#1976d2',
    fontWeight: '600',
  },
  // Polyline Steuerung
  // Kompakte, verschiebbare Polyline-Steuerung
  polylineControlsCompact: {
    position: 'absolute',
    bottom: 100,
    right: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.98)',
    borderRadius: 10,
    padding: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 10,
    zIndex: 1000,
    minWidth: 140,
  },
  polylineDragHandle: {
    alignItems: 'center',
    marginBottom: 6,
    paddingVertical: 4,
  },
  polylineDragIndicator: {
    width: 30,
    height: 4,
    backgroundColor: '#ccc',
    borderRadius: 2,
    marginBottom: 4,
  },
  polylineInfoCompact: {
    fontSize: 12,
    fontWeight: '600',
    color: '#333',
  },
  polylineButtonsCompact: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  polylineButtonCompact: {
    width: 32,
    height: 32,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  polylineControls: {
    position: 'absolute',
    bottom: 80,
    left: 16,
    right: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.98)',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 10,
    zIndex: 1000,
  },
  polylineInfo: {
    fontSize: 16,
    fontWeight: '700',
    color: '#333',
    marginBottom: 12,
    textAlign: 'center',
  },
  polylineButtons: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    gap: 10,
    flexWrap: 'wrap',
  },
  polylineButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    gap: 6,
    minWidth: 70,
    justifyContent: 'center',
  },
  polylineButtonUndo: {
    backgroundColor: '#FF9800',
  },
  polylineButtonFinish: {
    backgroundColor: '#4caf50',
  },
  polylineButtonClose: {
    backgroundColor: '#2196f3',
  },
  polylineButtonCancel: {
    backgroundColor: '#f44336',
  },
  polylineButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  // Foto-Bearbeitungsmodus Button
  photoEditButtonActive: {
    backgroundColor: '#FF9800',
  },
  photoEditBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FF9800',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
    marginTop: 4,
  },
  photoEditBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  // Gitter Button und Einstellungen
  gridButtonActive: {
    backgroundColor: '#9c27b0',
  },
  gridSettingsPanel: {
    position: 'absolute',
    top: 70,
    left: 16,
    right: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.98)',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 5,
    zIndex: 100,
  },
  gridSettingsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  gridSettingsTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  gridSliderSection: {
    marginBottom: 16,
  },
  gridSliderSectionLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
    marginBottom: 8,
  },
  gridSliderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  gridSliderLabel: {
    fontSize: 11,
    color: '#666',
    width: 45,
  },
  gridSlider: {
    flex: 1,
    height: 40,
  },
  gridSliderContainer: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-around',
    gap: 4,
  },
  gridSizeButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#f0f0f0',
    borderWidth: 1,
    borderColor: '#ddd',
  },
  gridSizeButtonActive: {
    backgroundColor: '#9c27b0',
    borderColor: '#9c27b0',
  },
  gridSizeButtonText: {
    fontSize: 12,
    color: '#666',
  },
  gridSizeButtonTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  gridSizeInfo: {
    marginTop: 10,
    fontSize: 12,
    color: '#999',
    textAlign: 'center',
  },
  // Numpad Toggle für Modals
  numpadToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#f0f0f0',
    marginBottom: 12,
  },
  numpadToggleBtnActive: {
    backgroundColor: '#2196f3',
  },
  numpadToggleBtnText: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  numpadToggleBtnTextActive: {
    color: '#fff',
  },
  bluetoothBadgeSmall: {
    backgroundColor: '#e8f5e9',
    borderRadius: 10,
    padding: 4,
  },
  // Modal Numpad Styles - Kompakt wie bei Checklisten
  modalNumpad: {
    marginBottom: 6,
  },
  modalNumpadRow: {
    flexDirection: 'row',
    gap: 4,
    marginBottom: 4,
  },
  modalNumpadKey: {
    flex: 1,
    aspectRatio: 1.5,
    backgroundColor: '#f5f5f5',
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    minHeight: 44,
  },
  modalNumpadKeyText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  modalNumpadOp: {
    backgroundColor: '#e3f2fd',
    borderColor: '#2196f3',
  },
  modalNumpadOpText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1976d2',
  },
  modalNumpadDel: {
    backgroundColor: '#ffebee',
    borderColor: '#f44336',
  },
  modalNumpadClear: {
    backgroundColor: '#fff3e0',
    borderColor: '#ff9800',
  },
  modalNumpadClearText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#f57c00',
  },
  modalNumpadUnit: {
    backgroundColor: '#e8f5e9',
    borderColor: '#4caf50',
  },
  modalNumpadUnitText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#388e3c',
  },
  modalNumpadMode: {
    backgroundColor: '#e8eaf6',
    borderColor: '#5c6bc0',
  },
  modalNumpadModeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#3949ab',
  },
  modalNumpadCapsActive: {
    backgroundColor: '#3949ab',
  },
  floatingModalNumpad: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 10,
    marginTop: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 5,
  },
  globalFloatingNumpad: {
    position: 'absolute',
    left: 20,
    bottom: 100,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 15,
    zIndex: 9999,
    width: 280,
  },
  inModalNumpad: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 10,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 15,
    zIndex: 9999,
    maxWidth: 360,
    alignSelf: 'center',
  },
  numpadCloseBtn: {
    position: 'absolute',
    right: 4,
    top: 4,
    padding: 2,
    zIndex: 10,
    backgroundColor: '#fff',
    borderRadius: 12,
  },
  numpadDragHandle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 4,
    paddingHorizontal: 8,
    marginBottom: 6,
    backgroundColor: '#f5f5f5',
    borderRadius: 6,
  },
  numpadDragText: {
    fontSize: 10,
    color: '#999',
    fontWeight: '500',
  },
  // Styles für Maß-Eingabe bei Liniensegmenten
  measurementActionBar: {
    position: 'absolute',
    bottom: 100,
    left: 16,
    zIndex: 100,
  },
  measurementActionContent: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#1976d2',
    borderRadius: 10,
    padding: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 8,
    gap: 4,
  },
  measurementActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1976d2',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    gap: 6,
  },
  measurementActionText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  measurementDeleteButton: {
    padding: 8,
    backgroundColor: '#ffebee',
    borderRadius: 6,
  },
  measurementCancelButton: {
    padding: 8,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 6,
  },
  // Summenbox für Gesamtlänge - größer und verschiebbar
  totalLfmBox: {
    position: 'absolute',
    top: 130,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingVertical: 10,
    paddingHorizontal: 14,
    paddingLeft: 8,
    borderRadius: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 5,
    gap: 8,
    zIndex: 50,
    borderWidth: 1,
    borderColor: '#e3f2fd',
  },
  // Kompakte Version für iPhone
  totalLfmBoxCompact: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    paddingLeft: 6,
    borderRadius: 8,
    gap: 5,
  },
  totalLfmBoxDragHandle: {
    marginRight: 4,
    opacity: 0.6,
  },
  totalLfmText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1976d2',
  },
  // Kompakte Textgröße für iPhone
  totalLfmTextCompact: {
    fontSize: 12,
  },
  // Skizzen-Legende (S1, S2, S3...)
  sketchLegend: {
    position: 'absolute',
    bottom: 150,
    right: 12,
    backgroundColor: '#fff',
    padding: 12,
    paddingTop: 8,
    borderRadius: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 5,
    borderWidth: 1,
    borderColor: '#e3f2fd',
    zIndex: 50,
    minWidth: 120,
  },
  sketchLegendDragHandle: {
    position: 'absolute',
    top: 4,
    right: 8,
    opacity: 0.5,
  },
  sketchLegendTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#333',
    marginBottom: 8,
  },
  sketchLegendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 3,
  },
  sketchLegendLabel: {
    backgroundColor: '#1976d2',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginRight: 8,
  },
  sketchLegendLabelText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 12,
  },
  sketchLegendValue: {
    fontSize: 13,
    color: '#333',
  },
  // Linien-Maß Numpad
  lineMeasureNumpad: {
    marginVertical: 16,
  },
  lineMeasureNumpadRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 8,
  },
  lineMeasureNumpadKey: {
    width: 60,
    height: 50,
    backgroundColor: '#f5f5f5',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  lineMeasureNumpadKeyText: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
  },
  lineMeasureNumpadDel: {
    backgroundColor: '#ffebee',
    borderColor: '#ffcdd2',
  },
  lineMeasureNumpadUnit: {
    backgroundColor: '#e3f2fd',
    borderColor: '#bbdefb',
  },
  lineMeasureNumpadUnitText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1976d2',
  },
  lineMeasureNumpadClear: {
    backgroundColor: '#fff3e0',
    borderColor: '#ffe0b2',
  },
  lineMeasureNumpadClearText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#f57c00',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  // Notes Modal Styles
  notesModalButtons: {
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'center',
    flexWrap: 'nowrap',
  },
  notesModalButton: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    backgroundColor: '#f5f5f5',
    borderWidth: 1,
    borderColor: '#ddd',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  notesModalButtonSave: {
    backgroundColor: '#4caf50',
    borderColor: '#4caf50',
  },
  notesModalButtonDelete: {
    backgroundColor: '#f44336',
    borderColor: '#f44336',
  },
  notesModalButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#333',
  },
  notesModalButtonTextWhite: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
  // Crop Modal Styles
  cropModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cropModalContent: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    width: '90%',
    maxWidth: 360,
    alignItems: 'center',
  },
  cropModalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  cropModalSubtitle: {
    fontSize: 14,
    color: '#666',
    marginBottom: 16,
    textAlign: 'center',
  },
  cropImageContainer: {
    width: 300,
    height: 300,
    backgroundColor: '#000',
    borderRadius: 8,
    overflow: 'hidden',
    position: 'relative',
  },
  cropImage: {
    width: 300,
    height: 300,
  },
  cropOverlay: {
    position: 'absolute',
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  cropOverlayTop: {
    top: 0,
    left: 0,
    right: 0,
  },
  cropOverlayBottom: {
    left: 0,
    right: 0,
  },
  cropOverlayLeft: {
    left: 0,
  },
  cropOverlayRight: {},
  cropBox: {
    position: 'absolute',
    borderWidth: 2,
    borderColor: '#fff',
    borderStyle: 'dashed',
  },
  cropHandle: {
    position: 'absolute',
    width: 30,
    height: 30,
    backgroundColor: '#9C27B0',
    borderRadius: 15,
    borderWidth: 3,
    borderColor: '#fff',
  },
  cropHandleTopLeft: {
    top: -15,
    left: -15,
  },
  cropHandleTopRight: {
    top: -15,
    right: -15,
  },
  cropHandleBottomLeft: {
    bottom: -15,
    left: -15,
  },
  cropHandleBottomRight: {
    bottom: -15,
    right: -15,
  },
  cropButtonRow: {
    flexDirection: 'row',
    marginTop: 20,
    gap: 16,
  },
  cropCancelButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f44336',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 25,
    gap: 8,
  },
  cropApplyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#4caf50',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 25,
    gap: 8,
  },
  cropButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});

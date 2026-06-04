import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
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
  ActivityIndicator,
  Pressable,
  PixelRatio,
} from 'react-native';
import Slider from '@react-native-community/slider';
import { useRouter, useLocalSearchParams, useFocusEffect, useNavigation } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as DocumentPicker from 'expo-document-picker';
import { WebView } from 'react-native-webview';
import { File } from 'expo-file-system/next';
import { SketchService, PhotoService, saveImageToFile, loadImageFromFile, deleteImageFile, storage } from '../../services/LocalStorage';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { captureRef } from 'react-native-view-shot';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Speichereffiziente Deep-Clone-Funktion (verhindert OOM bei großen base64-Strings)
// Strings sind in JS immutable → werden nur referenziert statt über JSON serialisiert
function deepCloneElement(obj: any): any {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== 'object') return obj; // Strings, Numbers, Booleans werden direkt zurückgegeben
  if (Array.isArray(obj)) return obj.map(deepCloneElement);
  const clone: any = {};
  for (const key of Object.keys(obj)) {
    clone[key] = deepCloneElement(obj[key]);
  }
  return clone;
}

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
  type: 'path' | 'line' | 'circle' | 'rect' | 'text' | 'image' | 'arrow' | 'pointer' | 'polygon' | 'polyline' | 'memo' | 'angle';
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
  // Für Winkel-Element
  vertex?: { x: number; y: number };
  point1?: { x: number; y: number };
  point2?: { x: number; y: number };
  angle?: number;
}

// Verfügbare Schriftarten - Platform-spezifisch für React Native SVG
// Android verwendet die generischen Namen die von react-native-svg unterstützt werden
// iOS verwendet die nativen Systemschriftarten
type FontFamily = 'System' | 'Handschrift' | 'Monospace' | 'Serif';
const FONT_FAMILIES: { id: FontFamily; label: string; style: string; svgFont: string }[] = Platform.select({
  ios: [
    { id: 'System', label: 'Standard', style: 'System', svgFont: 'Helvetica' },
    { id: 'Handschrift', label: 'Handschrift', style: 'cursive', svgFont: 'Snell Roundhand, cursive' },
    { id: 'Monospace', label: 'Monospace', style: 'Courier', svgFont: 'Courier' },
    { id: 'Serif', label: 'Serif', style: 'Georgia', svgFont: 'Times New Roman' },
  ],
  android: [
    { id: 'System', label: 'Standard', style: 'normal', svgFont: 'Roboto, sans-serif' },
    { id: 'Handschrift', label: 'Handschrift', style: 'normal', svgFont: 'cursive' },
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
  const { t } = useTranslation();
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
  // FIX TABLET BUG: Eindeutiger Key für jede neue Skizze - ermöglicht Reset-Erkennung
  const newSketchKey = Array.isArray(params.newSketchKey) ? params.newSketchKey[0] : params.newSketchKey;
  
  // iPhone-Erkennung für responsive Layout
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  // Geräte-Erkennung: Nutze die kürzere Seite damit isPhone auch im Querformat korrekt ist
  const isPhoneDevice = Math.min(screenWidth, screenHeight) < 500;
  const isLandscape = screenWidth > screenHeight;
  const isPhoneLandscape = isPhoneDevice && isLandscape;
  
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
  const [strokeWidth, setStrokeWidth] = useState(1);
  const [loading, setLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false); // Schutz vor Doppelklicks beim Speichern
  
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
  const [angleSnapEnabled, setAngleSnapEnabled] = useState(false);
  const [angleSnapValue, setAngleSnapValue] = useState(90); // Standard: 90°
  const [gridSnapEnabled, setGridSnapEnabled] = useState(false); // Raster-Einrastung
  
  // Transform state
  const [dragMode, setDragMode] = useState<'move' | 'resize' | 'rotate' | null>(null);
  const [resizeHandle, setResizeHandle] = useState<string | null>(null);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [originalElement, setOriginalElement] = useState<DrawElement | null>(null);
  // Für Winkel-Gruppen-Verschiebung: Speichert alle Original-Elemente der Gruppe
  const [originalGroupElements, setOriginalGroupElements] = useState<DrawElement[]>([]);
  const [movingGroupBaseId, setMovingGroupBaseId] = useState<string | null>(null);
  
  // Für Winkel-Gruppen-Bearbeitung: Drehen & Verlängern
  const [angleEditMode, setAngleEditMode] = useState<'rotate' | 'adjust' | null>(null);
  const [angleEditBaseId, setAngleEditBaseId] = useState<string | null>(null);
  const [angleEditOriginals, setAngleEditOriginals] = useState<DrawElement[]>([]);
  
  // Zoom & Pan - use dynamic dimensions
  const [scale, setScale] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [lastScale, setLastScale] = useState(1);
  const [lastPanOffset, setLastPanOffset] = useState({ x: 0, y: 0 });
  // Trackt ob gerade gepannt wird (1-Finger-Drag im Zoom-Modus)
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  // ScrollView Content-Offset für korrekte Koordinatenberechnung beim Zeichnen
  const [scrollOffset, setScrollOffset] = useState({ x: 0, y: 0 });
  // Zeichnen-Modus: wenn true, kann gezeichnet werden; wenn false, ist Zoom aktiv
  // (umgekehrte Logik zu vorherigem zoomMode für Konsistenz mit annotate.tsx)
  const [drawingEnabled, setDrawingEnabled] = useState(false); // Standard: Zoom erlaubt (Zeichnen aus)
  // Trackt ob gerade Pinch-Zoom aktiv ist (verhindert versehentliches Zeichnen)
  const [isZooming, setIsZooming] = useState(false);
  const [initialPinchDistance, setInitialPinchDistance] = useState<number | null>(null);
  // Referenz für ScrollView um Zoom zurückzusetzen
  const scrollViewRef = useRef<ScrollView>(null);

  // === Android Pinch-to-Zoom ===
  // iOS nutzt native ScrollView-Zoom. Android braucht eigene Gesten-Logik.
  // Hybrid-Ansatz: Animated.View für flüssige Animation WÄHREND der Geste,
  // SVG viewBox für präzise Darstellung und korrekte Koordinaten NACH der Geste.
  const androidZoomScale = useRef(new Animated.Value(1)).current;
  const androidTranslateX = useRef(new Animated.Value(0)).current;
  const androidTranslateY = useRef(new Animated.Value(0)).current;
  // viewBox-Zustand: Definiert den sichtbaren Bereich des SVG-Canvas
  const [androidViewBox, setAndroidViewBox] = useState({ x: 0, y: 0, w: 0, h: 0 });
  const androidPinchRef = useRef({
    initialDistance: 0,
    initialScale: 1,
    lastPanX: 0,
    lastPanY: 0,
    isPinching: false,
    numTouches: 0,
    currentScale: 1,
    currentTranslateX: 0,
    currentTranslateY: 0,
  });

  // Canvas-Dimensionen für zoomToRect - dynamisch basierend auf Bildschirmgröße
  // WICHTIG: Muss VOR den useEffects definiert werden die canvasHeight verwenden
  const canvasWidth = screenWidth;
  // Im Querformat auf dem iPhone: Kompaktere Header + Toolbar → weniger Overhead abziehen
  const canvasOverhead = isPhoneLandscape ? 80 : (isPhoneDevice ? 100 : 120);
  const canvasHeight = Math.max(100, screenHeight - canvasOverhead);

  // Initialisiere viewBox wenn Bildschirm-Dimensionen sich ändern
  useEffect(() => {
    if (Platform.OS === 'android') {
      setAndroidViewBox(prev => {
        // Nur initialisieren wenn noch nicht gesetzt (w === 0) oder bei erstem Render
        if (prev.w === 0) {
          return { x: 0, y: 0, w: screenWidth, h: canvasHeight };
        }
        return prev;
      });
    }
  }, [screenWidth, canvasHeight]);

  // Android Zoom zurücksetzen
  const resetAndroidZoom = useCallback(() => {
    androidPinchRef.current.currentScale = 1;
    androidPinchRef.current.currentTranslateX = 0;
    androidPinchRef.current.currentTranslateY = 0;
    androidPinchRef.current.initialDistance = 0;
    androidPinchRef.current.isPinching = false;
    androidZoomScale.setValue(1);
    androidTranslateX.setValue(0);
    androidTranslateY.setValue(0);
    setAndroidViewBox({ x: 0, y: 0, w: screenWidth, h: canvasHeight });
    setScale(1);
    // Auch Pan zurücksetzen
    setPanOffset({ x: 0, y: 0 });
    setLastPanOffset({ x: 0, y: 0 });
    setIsPanning(false);
  }, [androidZoomScale, androidTranslateX, androidTranslateY, screenWidth, canvasHeight]);

  // Canvas Layout für präzise Koordinaten-Berechnung (Protractor)
  const [canvasLayout, setCanvasLayout] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const canvasLayoutRef = useRef<{ x: number; y: number; width: number; height: number } | null>(null);
  // Halte Ref immer aktuell
  useEffect(() => {
    canvasLayoutRef.current = canvasLayout;
  }, [canvasLayout]);
  
  // Refs für Zoom/Scroll - verhindert stale closures in Protractor-Callbacks
  const scaleRef = useRef(1);
  const scrollOffsetRef = useRef({ x: 0, y: 0 });
  useEffect(() => { scaleRef.current = scale; }, [scale]);
  useEffect(() => { scrollOffsetRef.current = scrollOffset; }, [scrollOffset]);
  
  // Foto-Bearbeitungsmodus - wenn true, kann nur das Hintergrundfoto bearbeitet werden
  const [photoEditMode, setPhotoEditMode] = useState(false);
  
  // Zuschneiden-Modus
  const [showCropModal, setShowCropModal] = useState(false);
  const [cropImageUri, setCropImageUri] = useState<string | null>(null);
  const [cropImageId, setCropImageId] = useState<string | null>(null);
  const [cropBox, setCropBox] = useState({ x: 50, y: 50, width: 200, height: 200 });
  const [cropImageDimensions, setCropImageDimensions] = useState({ width: 300, height: 300 });
  // FIX: Dynamische Container-Größe für Tablets und verschiedene Bildschirmgrößen
  const [cropContainerSize, setCropContainerSize] = useState(300);
  
  // Refs für Crop-Interaktion (verwende Refs statt State für bessere Performance)
  const cropContainerRef = useRef<View>(null);
  const cropBoxRef = useRef({ x: 50, y: 50, width: 200, height: 200 }); // Sync mit cropBox
  const activeCropHandle = useRef<string | null>(null);
  const cropStartPos = useRef({ x: 0, y: 0 });
  const cropStartBox = useRef({ x: 50, y: 50, width: 200, height: 200 });
  // Ref für dynamische Container-Größe (damit PanResponder aktuelle Größe lesen kann)
  const cropContainerSizeRef = useRef(300);
  
  // Halte cropBoxRef synchron mit cropBox State
  useEffect(() => {
    cropBoxRef.current = cropBox;
  }, [cropBox]);

  // Halte cropContainerSizeRef synchron mit cropContainerSize State
  useEffect(() => {
    cropContainerSizeRef.current = cropContainerSize;
  }, [cropContainerSize]);
  
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
    // Zeichnen-Modus aktivieren wenn ein Werkzeug gewählt wird
    // aber den aktuellen Zoom-Level beibehalten!
    setDrawingEnabled(true);
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
      Alert.alert(t('common.note'), t('sketches.noProjectSelected'));
    }
  };

  // Funktion um ein Projektfoto als Bild-Element einzufügen
  const insertProjectPhoto = async (photo: any) => {
    const imageUri = photo.image_data || photo.uri;
    if (!imageUri) {
      Alert.alert(t('common.error'), t('sketches.invalidImageData'));
      return;
    }
    
    try {
      // Komprimiere das Bild für bessere Performance (wie bei anderen Bild-Einfüge-Funktionen)
      const manipResult = await ImageManipulator.manipulateAsync(
        imageUri,
        [{ resize: { width: Math.min(1200, 1200) } }], // Max 1200px Breite
        { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG, base64: true }
      );
      
      const compressedUri = `data:image/jpeg;base64,${manipResult.base64}`;
      const imgWidth = manipResult.width;
      const imgHeight = manipResult.height;
      
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
        data: { uri: compressedUri },
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
      setSelectedElementId(imageElement.id);
      setShowProjectPhotosModal(false);
      // Automatisch Foto-Bearbeiten Modus aktivieren
      setPhotoEditMode(true);
      selectDrawMode('select');
      
      console.log(`[insertProjectPhoto] Compressed image: ${Math.round((compressedUri.length / 1024))}KB`);
    } catch (error) {
      console.error('Error compressing project photo:', error);
      
      // Fallback: Originalbild verwenden ohne Komprimierung
      RNImage.getSize(
        imageUri,
        (imgWidth, imgHeight) => {
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
          setSelectedElementId(imageElement.id);
          setShowProjectPhotosModal(false);
          setPhotoEditMode(true);
          selectDrawMode('select');
        },
        () => {
          // Fallback mit Standardgrößen
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
          setSelectedElementId(imageElement.id);
          setShowProjectPhotosModal(false);
          setPhotoEditMode(true);
          selectDrawMode('select');
        }
      );
    }
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
  const [showMeasureStyleSettings, setShowMeasureStyleSettings] = useState(false);
  const [measureKeyboardMode, setMeasureKeyboardMode] = useState<'numbers' | 'letters'>('numbers');
  const [measureKeyboardCaps, setMeasureKeyboardCaps] = useState(false);
  
  // Floating-Panel Position für Maß-Numpad
  const measurePanelPan = useRef(new Animated.ValueXY({ x: 0, y: 100 })).current;
  const measurePanelPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        measurePanelPan.setOffset({
          x: (measurePanelPan.x as any)._value,
          y: (measurePanelPan.y as any)._value,
        });
        measurePanelPan.setValue({ x: 0, y: 0 });
      },
      onPanResponderMove: Animated.event(
        [null, { dx: measurePanelPan.x, dy: measurePanelPan.y }],
        { useNativeDriver: false }
      ),
      onPanResponderRelease: () => {
        measurePanelPan.flattenOffset();
      },
    })
  ).current;
  
  // Maßlinien-Darstellung Einstellungen (PRO ELEMENT - jedes Polygon hat eigene Einstellungen)
  const [measureLineStyles, setMeasureLineStyles] = useState<{ [elementId: string]: { color: string; strokeWidth: number; fontSize: number } }>({});
  // Temporäre Einstellungen für das aktuell bearbeitete Element im Numpad
  const [tempMeasureLineColor, setTempMeasureLineColor] = useState('#1976d2');
  const [tempMeasureLineStrokeWidth, setTempMeasureLineStrokeWidth] = useState(1.2);
  const [tempMeasureLineFontSize, setTempMeasureLineFontSize] = useState(11);
  
  // Tracking für Skizzen-Wechsel (Reset-Erkennung)
  const lastLoadedSketchId = useRef<string | null | undefined>(undefined);
  // FIX: Auch photoId tracken - bei neuen Skizzen ist sketchId immer undefined,
  // aber photoId unterscheidet zwischen verschiedenen neuen Skizzen
  const lastLoadedPhotoId = useRef<string | null | undefined>(undefined);
  // FIX TABLET BUG: newSketchKey tracken - eindeutiger Key für jede neue Skizze
  const lastNewSketchKey = useRef<string | null | undefined>(undefined);
  // FIX TABLET BUG: Visit-Counter für neue Skizzen ohne photoId
  // Bei jedem Seitenbesuch wird dieser Counter erhöht, um einen Reset zu erzwingen
  const visitCountRef = useRef(0);
  const isMountedRef = useRef(true);
  
  // Cleanup beim Unmount - verhindert Crashes durch State-Updates nach Navigation
  // FIX TABLET BUG: Reset tracking refs beim Verlassen, damit nächster Besuch sauber startet
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      // Reset tracking refs beim Unmount - nächste Skizze beginnt mit sauberem State
      lastLoadedSketchId.current = undefined;
      lastLoadedPhotoId.current = undefined;
      lastNewSketchKey.current = undefined;
      visitCountRef.current = 0;
    };
  }, []);

  // Android Hardware-Zurück-Button: Speichern vor dem Verlassen
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      handleBackPress();
      return true; // Event konsumieren, nicht default Back-Navigation
    });
    return () => backHandler.remove();
  }, []);

  const isResettingRef = useRef(false);
  const currentSketchIdRef = useRef<string | undefined>(sketchId);
  
  // Update ref whenever sketchId changes
  useEffect(() => {
    currentSketchIdRef.current = sketchId;
  }, [sketchId]);
  
  // FIX TABLET BUG V3: Track ob wir bereits eine Skizze bearbeitet haben
  // Wenn die Parameter sich ändern (neue Navigation), müssen wir den "dirty" state prüfen
  const hasEditedCurrentSketchRef = useRef(false);
  
  // Markiere als "dirty" wenn Elemente hinzugefügt werden
  useEffect(() => {
    if (elements.length > 0 && !sketchId) {
      hasEditedCurrentSketchRef.current = true;
    }
  }, [elements.length, sketchId]);
  
  // PDF-Größe für Export
  const [pdfSize, setPdfSize] = useState<string>('large');
  
  // Polyline Label Offsets - Position relativ zum Zentrum (für Verschiebbarkeit)
  const [labelOffsets, setLabelOffsets] = useState<{ [elementId: string]: { x: number; y: number } }>({});
  // State für aktives Label-Ziehen
  const [draggingLabelId, setDraggingLabelId] = useState<string | null>(null);
  const labelDragStartRef = useRef<{ x: number; y: number; offsetX: number; offsetY: number }>({ x: 0, y: 0, offsetX: 0, offsetY: 0 });
  
  // Lupen-Feature für präzises Positionieren von Handles
  const [showMagnifier, setShowMagnifier] = useState(false);
  const [magnifierPosition, setMagnifierPosition] = useState<{ x: number; y: number } | null>(null);
  const [magnifierTargetPosition, setMagnifierTargetPosition] = useState<{ x: number; y: number } | null>(null);
  const [magnifierSnapshot, setMagnifierSnapshot] = useState<string | null>(null);
  
  // Aufmaß-Tool state
  const [showMeasurementTool, setShowMeasurementTool] = useState(false);
  const [measurementExpression, setMeasurementExpression] = useState('');
  const [measurementUnit, setMeasurementUnit] = useState('m²');
  const [showMeasurementNumpad, setShowMeasurementNumpad] = useState(true);
  const [showMeasurementKeyboard, setShowMeasurementKeyboard] = useState(false);
  const measurementInputRef = useRef<TextInput>(null);
  const availableUnits = ['m', 'm²', 'm³', 'lfm', 'Stück', 'Paar', 'kg', 'l'];
  
  // Winkelmesser-Tool state - NEU: Bildschirmkoordinaten-basiert
  const [showProtractor, setShowProtractor] = useState(false);
  const [showProtractorHint, setShowProtractorHint] = useState(false);
  const [showProtractorAngleInput, setShowProtractorAngleInput] = useState(false);
  const [protractorAngleInput, setProtractorAngleInput] = useState('0');
  const [protractorUseComplementary, setProtractorUseComplementary] = useState(false);
  const [protractorDrawSize, setProtractorDrawSize] = useState(60);
  const protractorCanvasSnapshot = useRef<string | null>(null); // Canvas-Snapshot VOR Protractor-Overlay
  
  // ========== NEUER EINFACHER WINKELMESSER (ohne Lupe) ==========
  const [simpleAngleMode, setSimpleAngleMode] = useState(false);
  const [simpleAnglePoints, setSimpleAnglePoints] = useState<{x: number, y: number}[]>([]);
  const [simpleAngleResult, setSimpleAngleResult] = useState<number | null>(null);
  
  // Berechne den Winkel aus 3 Punkten (Punkt 1 = erster Schenkel, Punkt 2 = Scheitelpunkt, Punkt 3 = zweiter Schenkel)
  const calculateSimpleAngle = useCallback((points: {x: number, y: number}[]) => {
    if (points.length !== 3) return null;
    const [p1, vertex, p3] = points;
    
    // Vektoren von Scheitelpunkt zu den Schenkelpunkten
    const v1x = p1.x - vertex.x;
    const v1y = p1.y - vertex.y;
    const v2x = p3.x - vertex.x;
    const v2y = p3.y - vertex.y;
    
    // Längen der Vektoren
    const len1 = Math.sqrt(v1x * v1x + v1y * v1y);
    const len2 = Math.sqrt(v2x * v2x + v2y * v2y);
    
    if (len1 < 1 || len2 < 1) return null;
    
    // Winkel berechnen mit atan2 für korrektes Vorzeichen
    const angle1 = Math.atan2(v1y, v1x);
    const angle2 = Math.atan2(v2y, v2x);
    
    let angleDiff = (angle2 - angle1) * (180 / Math.PI);
    
    // Normalisieren auf 0-360
    while (angleDiff < 0) angleDiff += 360;
    while (angleDiff > 360) angleDiff -= 360;
    
    // Kleineren Winkel zurückgeben (0-180)
    if (angleDiff > 180) angleDiff = 360 - angleDiff;
    
    return Math.round(angleDiff * 10) / 10; // Eine Dezimalstelle
  }, []);
  
  // PDF-Konverter State (pdf.js via WebView - funktioniert ohne native Module)
  const [showPdfConverter, setShowPdfConverter] = useState(false);
  const [pdfBase64Data, setPdfBase64Data] = useState<string | null>(null);
  const [pdfConversionLoading, setPdfConversionLoading] = useState(false);
  const [pdfTotalPages, setPdfTotalPages] = useState(1);
  const [selectedPdfPage, setSelectedPdfPage] = useState(1);
  const pdfWebViewRef = useRef<WebView>(null);
  
  // Bildschirmkoordinaten der drei Punkte
  // Protractor arbeitet in SCREEN-Koordinaten (einfacher, funktioniert zuverlässig)
  // === NEUER WINKELMESSER (ImageMeter-Stil) ===
  // 3 Punkte: Scheitelpunkt + 2 Endpunkte
  const [angleVertex, setAngleVertex] = useState({ x: 0, y: 0 }); // Scheitelpunkt (Mitte)
  const [anglePoint1, setAnglePoint1] = useState({ x: 0, y: 0 }); // Endpunkt Schenkel 1
  const [anglePoint2, setAnglePoint2] = useState({ x: 0, y: 0 }); // Endpunkt Schenkel 2
  const [activeDragPoint, setActiveDragPoint] = useState<'vertex' | 'point1' | 'point2' | null>(null);
  
  // Berechne den Winkel aus den 3 Punkten
  const calculatedAngle = useMemo(() => {
    if (angleVertex.x === 0 && angleVertex.y === 0) return 0;
    
    // Vektoren von Scheitelpunkt zu den Endpunkten
    const v1x = anglePoint1.x - angleVertex.x;
    const v1y = anglePoint1.y - angleVertex.y;
    const v2x = anglePoint2.x - angleVertex.x;
    const v2y = anglePoint2.y - angleVertex.y;
    
    // Winkel der beiden Vektoren
    const angle1 = Math.atan2(v1y, v1x);
    const angle2 = Math.atan2(v2y, v2x);
    
    // Differenz in Grad
    let angleDiff = (angle2 - angle1) * (180 / Math.PI);
    
    // Normalisieren auf 0-360
    while (angleDiff < 0) angleDiff += 360;
    while (angleDiff > 360) angleDiff -= 360;
    
    // Kleineren Winkel nehmen (max 180°)
    if (angleDiff > 180) angleDiff = 360 - angleDiff;
    
    return Math.round(angleDiff * 10) / 10; // Eine Dezimalstelle
  }, [angleVertex, anglePoint1, anglePoint2]);

  // Legacy-Variablen für Kompatibilität (werden schrittweise ersetzt)
  const [protractorCenter, setProtractorCenter] = useState({ x: 0, y: 0 });
  const [protractorRefEnd, setProtractorRefEnd] = useState({ x: 0, y: 0 });
  const [protractorAngleEnd, setProtractorAngleEnd] = useState({ x: 0, y: 0 });
  
  // Helper: Konvertiert Screen-Koordinaten zu Canvas-Koordinaten (NUR für Lupe)
  // WICHTIG: Muss auch Android-ViewBox berücksichtigen!
  const screenToCanvasForMagnifier = useCallback((screenX: number, screenY: number) => {
    const layout = canvasLayoutRef.current || { x: 0, y: canvasOverhead };
    const currentScale = scaleRef.current || 1;
    
    // Android mit ViewBox-Transformation
    if (Platform.OS === 'android' && androidViewBox.w > 0 && androidViewBox.w !== screenWidth) {
      const lx = layout.x;
      const ly = layout.y;
      return {
        x: androidViewBox.x + ((screenX - lx) / screenWidth) * androidViewBox.w,
        y: androidViewBox.y + ((screenY - ly) / canvasHeight) * androidViewBox.h,
      };
    }
    
    // Standard: nur Offset abziehen und durch Scale teilen
    const canvasX = (screenX - layout.x) / currentScale;
    const canvasY = (screenY - layout.y) / currentScale;
    return { x: canvasX, y: canvasY };
  }, [canvasOverhead, androidViewBox, screenWidth, canvasHeight]);
  
  // Helper: Konvertiert Canvas-Koordinaten zu Screen-Koordinaten (für Protractor-SVG-Overlay)
  // Dies ist die inverse Funktion von screenToCanvasForMagnifier
  // WICHTIG: Muss auch Android-ViewBox berücksichtigen!
  const canvasToScreenCoords = useCallback((canvasX: number, canvasY: number) => {
    const layout = canvasLayoutRef.current || { x: 0, y: canvasOverhead };
    const currentScale = scaleRef.current || 1;
    
    // Android mit ViewBox-Transformation: inverse Berechnung
    if (Platform.OS === 'android' && androidViewBox.w > 0 && androidViewBox.w !== screenWidth) {
      const lx = layout.x;
      const ly = layout.y;
      // Inverse Formel: canvasX = androidViewBox.x + ((screenX - lx) / screenWidth) * androidViewBox.w
      // => screenX = ((canvasX - androidViewBox.x) / androidViewBox.w) * screenWidth + lx
      const screenX = ((canvasX - androidViewBox.x) / androidViewBox.w) * screenWidth + lx;
      const screenY = ((canvasY - androidViewBox.y) / androidViewBox.h) * canvasHeight + ly;
      return { x: screenX, y: screenY };
    }
    
    // Standard: mit Scale multiplizieren und Offset addieren
    const screenX = canvasX * currentScale + layout.x;
    const screenY = canvasY * currentScale + layout.y;
    return { x: screenX, y: screenY };
  }, [canvasOverhead, androidViewBox, screenWidth, canvasHeight]);
  
  // Screen-Koordinaten zu Canvas-Koordinaten (inverse von canvasToScreenCoords)
  const screenToCanvasCoords = useCallback((screenX: number, screenY: number) => {
    const layout = canvasLayoutRef.current || { x: 0, y: canvasOverhead };
    const currentScale = scaleRef.current || 1;
    
    // Android mit ViewBox-Transformation
    if (Platform.OS === 'android' && androidViewBox.w > 0 && androidViewBox.w !== screenWidth) {
      const lx = layout.x;
      const ly = layout.y;
      const canvasX = androidViewBox.x + ((screenX - lx) / screenWidth) * androidViewBox.w;
      const canvasY = androidViewBox.y + ((screenY - ly) / canvasHeight) * androidViewBox.h;
      return { x: canvasX, y: canvasY };
    }
    
    // Standard: Layout abziehen und durch Scale teilen
    const canvasX = (screenX - layout.x) / currentScale;
    const canvasY = (screenY - layout.y) / currentScale;
    return { x: canvasX, y: canvasY };
  }, [canvasOverhead, androidViewBox, screenWidth, canvasHeight]);
  
  // Verschiebbare Position des Protractor-Panels
  const protractorPanelPan = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const protractorPanelPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        protractorPanelPan.setOffset({
          x: (protractorPanelPan.x as any)._value,
          y: (protractorPanelPan.y as any)._value,
        });
        protractorPanelPan.setValue({ x: 0, y: 0 });
      },
      onPanResponderMove: Animated.event(
        [null, { dx: protractorPanelPan.x, dy: protractorPanelPan.y }],
        { useNativeDriver: false }
      ),
      onPanResponderRelease: () => {
        protractorPanelPan.flattenOffset();
      },
    })
  ).current;
  
  // Initialisierung wenn Winkelmesser neu geöffnet wird (nicht beim Bearbeiten)
  const protractorInitializedRef = useRef(false);
  useEffect(() => {
    if (showProtractor && !protractorInitializedRef.current) {
      // Berechne die Mitte des Canvas in echten CANVAS-Koordinaten
      const canvasCenterX = screenWidth / 2;
      const canvasCenterY = canvasHeight / 2;
      const defaultLen = Math.min(screenWidth * 0.2, 120);
      
      // Nur initialisieren wenn Vertex bei (0,0) ist (= komplett neuer Winkelmesser)
      if (angleVertex.x === 0 && angleVertex.y === 0) {
        // NEUES 3-Punkte-System: Scheitelpunkt + 2 Endpunkte
        setAngleVertex({ x: canvasCenterX, y: canvasCenterY });
        setAnglePoint1({ x: canvasCenterX + defaultLen, y: canvasCenterY }); // Rechts
        setAnglePoint2({ x: canvasCenterX + defaultLen * Math.cos(-Math.PI/4), y: canvasCenterY + defaultLen * Math.sin(-Math.PI/4) }); // 45° nach oben-rechts
        
        // Legacy-Variablen synchronisieren (für Kompatibilität)
        setProtractorCenter({ x: canvasCenterX, y: canvasCenterY });
        setProtractorRefEnd({ x: canvasCenterX + defaultLen, y: canvasCenterY });
        setProtractorAngleEnd({ x: canvasCenterX + defaultLen * Math.cos(-Math.PI/4), y: canvasCenterY + defaultLen * Math.sin(-Math.PI/4) });
        
        setShowProtractorHint(true);
      }
      protractorInitializedRef.current = true;
      // Panel-Position zurücksetzen
      protractorPanelPan.setValue({ x: 0, y: 0 });
      
      // Sicherheits-Snapshot: Falls der Button-Handler den Snapshot nicht erfasst hat,
      // nochmals versuchen (mit kleiner Verzögerung damit Render abgeschlossen ist)
      if (!protractorCanvasSnapshot.current && canvasRef.current) {
        setTimeout(() => {
          if (canvasRef.current && !protractorCanvasSnapshot.current) {
            captureRef(canvasRef.current, {
              format: 'png',
              quality: 0.8,
              result: 'data-uri',
            }).then((uri: string) => {
              protractorCanvasSnapshot.current = uri;
              console.log('Protractor canvas snapshot captured (delayed)');
            }).catch((err: Error) => {
              console.log('Delayed canvas snapshot error:', err);
            });
          }
        }, 300);
      }
    }
    if (!showProtractor) {
      protractorInitializedRef.current = false;
      protractorCanvasSnapshot.current = null; // Snapshot freigeben
    }
  }, [showProtractor]);
  
  // NEUES 3-Punkte-System: Screen-Koordinaten für Rendering
  const angleScreenCoords = useMemo(() => {
    const vertex = canvasToScreenCoords(angleVertex.x, angleVertex.y);
    const point1 = canvasToScreenCoords(anglePoint1.x, anglePoint1.y);
    const point2 = canvasToScreenCoords(anglePoint2.x, anglePoint2.y);
    return { vertex, point1, point2 };
  }, [angleVertex, anglePoint1, anglePoint2, canvasToScreenCoords]);

  // Berechnete Screen-Koordinaten für das Protractor-Rendering (Legacy)
  // (Protractor-Koordinaten sind in Canvas-Koordinaten, müssen für SVG-Overlay in Screen umgerechnet werden)
  const protractorScreenCoords = useMemo(() => {
    const center = canvasToScreenCoords(protractorCenter.x, protractorCenter.y);
    const refEnd = canvasToScreenCoords(protractorRefEnd.x, protractorRefEnd.y);
    const angleEnd = canvasToScreenCoords(protractorAngleEnd.x, protractorAngleEnd.y);
    return { center, refEnd, angleEnd };
  }, [protractorCenter, protractorRefEnd, protractorAngleEnd, canvasToScreenCoords]);
  
  // Debug-Info für Winkelmesser (wird auf dem Bildschirm angezeigt)
  const protractorDebugInfo = useMemo(() => {
    if (!showProtractor) return null;
    const layout = canvasLayoutRef.current;
    return {
      canvasCenter: `${protractorCenter.x.toFixed(0)}, ${protractorCenter.y.toFixed(0)}`,
      screenCenter: `${protractorScreenCoords.center.x.toFixed(0)}, ${protractorScreenCoords.center.y.toFixed(0)}`,
      layoutXY: layout ? `${layout.x.toFixed(0)}, ${layout.y.toFixed(0)}` : 'null',
      scale: scaleRef.current?.toFixed(2) || '1',
      pan: `${panOffset.x.toFixed(0)}, ${panOffset.y.toFixed(0)}`,
    };
  }, [showProtractor, protractorCenter, protractorScreenCoords, panOffset]);
  
  // Berechneter Winkel aus den Positionen
  const protractorAngle = useMemo(() => {
    const dx1 = protractorRefEnd.x - protractorCenter.x;
    const dy1 = protractorRefEnd.y - protractorCenter.y;
    const dx2 = protractorAngleEnd.x - protractorCenter.x;
    const dy2 = protractorAngleEnd.y - protractorCenter.y;
    if (Math.sqrt(dx1*dx1+dy1*dy1) < 1 || Math.sqrt(dx2*dx2+dy2*dy2) < 1) return 0;
    const a1 = Math.atan2(dy1, dx1);
    const a2 = Math.atan2(dy2, dx2);
    let deg = Math.round((a2 - a1) * 180 / Math.PI);
    while (deg < -180) deg += 360;
    while (deg > 180) deg -= 360;
    return deg;
  }, [protractorCenter, protractorRefEnd, protractorAngleEnd]);
  
  // Berechnete Rotation (Richtung der Referenzlinie)
  const protractorRotation = useMemo(() => {
    return Math.round(Math.atan2(
      protractorRefEnd.y - protractorCenter.y,
      protractorRefEnd.x - protractorCenter.x
    ) * 180 / Math.PI);
  }, [protractorCenter, protractorRefEnd]);
  
  // Hilfsfunktion: Winkel um Delta ändern
  const adjustProtractorAngle = useCallback((deltaDeg: number) => {
    const dx = protractorAngleEnd.x - protractorCenter.x;
    const dy = protractorAngleEnd.y - protractorCenter.y;
    const currentAngle = Math.atan2(dy, dx);
    const len = Math.sqrt(dx * dx + dy * dy);
    const newAngle = currentAngle + deltaDeg * Math.PI / 180;
    setProtractorAngleEnd({
      x: protractorCenter.x + len * Math.cos(newAngle),
      y: protractorCenter.y + len * Math.sin(newAngle),
    });
  }, [protractorAngleEnd, protractorCenter]);
  
  // Hilfsfunktion: Winkel auf bestimmten Wert setzen
  const setProtractorAngleTo = useCallback((deg: number) => {
    const refDx = protractorRefEnd.x - protractorCenter.x;
    const refDy = protractorRefEnd.y - protractorCenter.y;
    const refAngle = Math.atan2(refDy, refDx);
    const dx = protractorAngleEnd.x - protractorCenter.x;
    const dy = protractorAngleEnd.y - protractorCenter.y;
    const len = Math.max(50, Math.sqrt(dx * dx + dy * dy));
    const newAngle = refAngle + deg * Math.PI / 180;
    setProtractorAngleEnd({
      x: protractorCenter.x + len * Math.cos(newAngle),
      y: protractorCenter.y + len * Math.sin(newAngle),
    });
  }, [protractorRefEnd, protractorAngleEnd, protractorCenter]);
  

  // === NEUER EINFACHER DRAG-HANDLER (ImageMeter-Stil) ===
  // Referenz für aktiven Drag-Zustand
  const angleDragRef = useRef({ 
    isDragging: false,
    activePoint: null as 'vertex' | 'point1' | 'point2' | null,
    startCanvasPos: { x: 0, y: 0 }, // Start-Position in CANVAS-Koordinaten
    initialVertex: { x: 0, y: 0 },
    initialPoint1: { x: 0, y: 0 },
    initialPoint2: { x: 0, y: 0 },
  });

  // Neuer Drag Start für 3-Punkte-System
  const handleAngleDragStart = useCallback((e: any, point: 'vertex' | 'point1' | 'point2') => {
    const pageX = e.nativeEvent?.pageX || e.pageX || 0;
    const pageY = e.nativeEvent?.pageY || e.pageY || 0;
    
    // Bestimme den aktuellen Punkt, der gezogen wird
    let currentPoint = angleVertex;
    if (point === 'point1') currentPoint = anglePoint1;
    if (point === 'point2') currentPoint = anglePoint2;
    
    // WICHTIG: Verwende die Position des Punkts als Startposition, NICHT die Touch-Position!
    // Das verhindert Offset-Sprünge wenn der Benutzer nicht genau auf die Mitte des Handles tippt
    angleDragRef.current = {
      isDragging: true,
      activePoint: point,
      startCanvasPos: { x: currentPoint.x, y: currentPoint.y }, // Punkt-Position, nicht Touch-Position!
      initialVertex: { ...angleVertex },
      initialPoint1: { ...anglePoint1 },
      initialPoint2: { ...anglePoint2 },
    };
    setActiveDragPoint(point);
    
    // Lupe aktivieren
    setMagnifierTargetPosition({ x: currentPoint.x, y: currentPoint.y });
    setMagnifierPosition({ x: pageX, y: pageY });
    
    // Canvas-Snapshot für Lupe
    if (canvasRef.current) {
      captureRef(canvasRef.current, {
        format: 'png',
        quality: 0.8,
        result: 'data-uri',
      }).then((uri: string) => {
        setMagnifierSnapshot(uri);
        setShowMagnifier(true);
      }).catch(() => {
        setShowMagnifier(true);
      });
    } else {
      setShowMagnifier(true);
    }
    
    console.log('[Angle Drag Start]', point, 'pointPos:', currentPoint);
  }, [angleVertex, anglePoint1, anglePoint2]);

  // Neuer Drag Move für 3-Punkte-System - verwendet screenToCanvasForMagnifier
  const handleAngleDragMove = useCallback((e: any) => {
    if (!angleDragRef.current.isDragging || !angleDragRef.current.activePoint) return;
    
    const pageX = e.nativeEvent?.pageX || e.pageX || 0;
    const pageY = e.nativeEvent?.pageY || e.pageY || 0;
    
    // Konvertiere Touch-Position zu Canvas-Koordinaten
    const currentCanvasPos = screenToCanvasForMagnifier(pageX, pageY);
    
    // Berechne Delta von der Start-Position
    const deltaX = currentCanvasPos.x - angleDragRef.current.startCanvasPos.x;
    const deltaY = currentCanvasPos.y - angleDragRef.current.startCanvasPos.y;
    
    const point = angleDragRef.current.activePoint;
    
    if (point === 'vertex') {
      // Bei Vertex: Alle Punkte um das gleiche Delta verschieben
      const newVertex = {
        x: angleDragRef.current.initialVertex.x + deltaX,
        y: angleDragRef.current.initialVertex.y + deltaY,
      };
      const newPoint1 = {
        x: angleDragRef.current.initialPoint1.x + deltaX,
        y: angleDragRef.current.initialPoint1.y + deltaY,
      };
      const newPoint2 = {
        x: angleDragRef.current.initialPoint2.x + deltaX,
        y: angleDragRef.current.initialPoint2.y + deltaY,
      };
      setAngleVertex(newVertex);
      setAnglePoint1(newPoint1);
      setAnglePoint2(newPoint2);
      
      // Lupe auf neuer Vertex-Position
      setMagnifierTargetPosition({ x: newVertex.x, y: newVertex.y });
    } else if (point === 'point1') {
      // Während der Erstellung: Freie Bewegung (Winkel UND Länge änderbar)
      const newPoint1 = {
        x: angleDragRef.current.initialPoint1.x + deltaX,
        y: angleDragRef.current.initialPoint1.y + deltaY,
      };
      setAnglePoint1(newPoint1);
      setMagnifierTargetPosition({ x: newPoint1.x, y: newPoint1.y });
    } else if (point === 'point2') {
      // Während der Erstellung: Freie Bewegung (Winkel UND Länge änderbar)
      const newPoint2 = {
        x: angleDragRef.current.initialPoint2.x + deltaX,
        y: angleDragRef.current.initialPoint2.y + deltaY,
      };
      setAnglePoint2(newPoint2);
      setMagnifierTargetPosition({ x: newPoint2.x, y: newPoint2.y });
    }
    
    // Lupe-Position aktualisieren (Screen-Koordinaten)
    setMagnifierPosition({ x: pageX, y: pageY });
  }, [screenToCanvasForMagnifier]);

  // Neuer Drag End für 3-Punkte-System
  const handleAngleDragEnd = useCallback(() => {
    console.log('[Angle Drag End] Final positions:', {
      vertex: angleVertex,
      point1: anglePoint1,
      point2: anglePoint2,
    });
    angleDragRef.current.isDragging = false;
    angleDragRef.current.activePoint = null;
    setActiveDragPoint(null);
    setShowMagnifier(false);
    setMagnifierPosition(null);
    setMagnifierSnapshot(null);
  }, [angleVertex, anglePoint1, anglePoint2]);

  // Protractor Drag Ref
  const protractorDragRef = useRef({ 
    isDragging: false,
    startX: 0, startY: 0,
    dragHandle: 'body' as 'body' | 'ref' | 'angle',
    initialCenter: { x: 0, y: 0 },
    initialRefEnd: { x: 0, y: 0 },
    initialAngleEnd: { x: 0, y: 0 },
  });
  
  // Drag Start - welcher Griff wurde angefasst?
  const handleProtractorDragStart = useCallback((e: any) => {
    const pageX = e.nativeEvent?.pageX || e.pageX || 0;
    const pageY = e.nativeEvent?.pageY || e.pageY || 0;
    
    // Konvertiere die Protractor-Punkte (Canvas-Koordinaten) zu Screen-Koordinaten für Distanz-Berechnung
    const refScreen = canvasToScreenCoords(protractorRefEnd.x, protractorRefEnd.y);
    const angleScreen = canvasToScreenCoords(protractorAngleEnd.x, protractorAngleEnd.y);
    const centerScreen = canvasToScreenCoords(protractorCenter.x, protractorCenter.y);
    
    // DEBUG: Koordinaten-Info
    console.log('[Protractor Drag] Touch:', pageX.toFixed(0), pageY.toFixed(0));
    console.log('[Protractor Drag] Ref Screen:', refScreen.x.toFixed(0), refScreen.y.toFixed(0));
    console.log('[Protractor Drag] Angle Screen:', angleScreen.x.toFixed(0), angleScreen.y.toFixed(0));
    console.log('[Protractor Drag] Center Screen:', centerScreen.x.toFixed(0), centerScreen.y.toFixed(0));
    
    // Abstand zu jedem Handle berechnen (in Screen-Koordinaten)
    const distRef = Math.sqrt(Math.pow(pageX - refScreen.x, 2) + Math.pow(pageY - refScreen.y, 2));
    const distAngle = Math.sqrt(Math.pow(pageX - angleScreen.x, 2) + Math.pow(pageY - angleScreen.y, 2));
    const distCenter = Math.sqrt(Math.pow(pageX - centerScreen.x, 2) + Math.pow(pageY - centerScreen.y, 2));
    
    console.log('[Protractor Drag] Distances - Ref:', distRef.toFixed(0), 'Angle:', distAngle.toFixed(0), 'Center:', distCenter.toFixed(0));
    
    const handleRadius = 60; // Größerer Touch-Bereich für bessere Erkennung
    let dragHandle: 'body' | 'ref' | 'angle' = 'body';
    
    // Finde den nächsten Handle
    const minDist = Math.min(distRef, distAngle, distCenter);
    
    if (minDist < handleRadius) {
      if (distRef === minDist) {
        dragHandle = 'ref';
      } else if (distAngle === minDist) {
        dragHandle = 'angle';
      } else {
        dragHandle = 'body';
      }
    } else if (distCenter < handleRadius * 2) {
      // Auch weiter entfernte Touches am Center akzeptieren für Body-Drag
      dragHandle = 'body';
    }
    
    console.log('[Protractor Drag] Selected handle:', dragHandle);
    
    // Lupe für Drag aktivieren
    if (dragHandle === 'ref' || dragHandle === 'angle' || dragHandle === 'body') {
      // targetPt ist jetzt in Canvas-Koordinaten
      const targetPt = dragHandle === 'ref' ? protractorRefEnd 
        : dragHandle === 'angle' ? protractorAngleEnd 
        : protractorCenter;
      const targetScreen = canvasToScreenCoords(targetPt.x, targetPt.y);
      
      // Canvas-Position direkt messen für präzise Lupe
      const activateMagnifier = (layout: { x: number; y: number; width: number; height: number }) => {
        canvasLayoutRef.current = layout;
        setCanvasLayout(layout);
        
        // targetPt ist bereits in Canvas-Koordinaten - direkt für Lupe verwenden!
        console.log('[Magnifier] Canvas:', targetPt.x.toFixed(0), targetPt.y.toFixed(0), 
          'Screen:', targetScreen.x.toFixed(0), targetScreen.y.toFixed(0));
        
        setMagnifierTargetPosition({ x: targetPt.x, y: targetPt.y });
        setMagnifierPosition({ x: targetScreen.x, y: targetScreen.y });
        
        // WICHTIG: Frischen Canvas-Snapshot erstellen wie bei Maßlinien!
        // Der alte protractorCanvasSnapshot kann veraltet sein (Zoom/Pan geändert)
        if (canvasRef.current) {
          captureRef(canvasRef.current, {
            format: 'png',
            quality: 1.0,
            result: 'data-uri',
          }).then((uri: string) => {
            setMagnifierSnapshot(uri);
            setShowMagnifier(true);
          }).catch((err: Error) => {
            console.log('[Protractor Magnifier] Snapshot error:', err);
            // Fallback: backgroundImage oder alte Snapshot verwenden
            const snapshot = protractorCanvasSnapshot.current;
            if (snapshot) {
              setMagnifierSnapshot(snapshot);
            } else if (backgroundImage) {
              setMagnifierSnapshot(backgroundImage);
            }
            setShowMagnifier(true);
          });
        } else {
          // Kein canvasRef - Fallback verwenden
          const snapshot = protractorCanvasSnapshot.current;
          if (snapshot) {
            setMagnifierSnapshot(snapshot);
          } else if (backgroundImage) {
            setMagnifierSnapshot(backgroundImage);
          }
          setShowMagnifier(true);
        }
      };
      
      // Frisch messen - canvasRef direkt
      if (canvasRef.current && Platform.OS !== 'web' && typeof (canvasRef.current as any).measureInWindow === 'function') {
        (canvasRef.current as any).measureInWindow((x: number, y: number, w: number, h: number) => {
          const freshLayout = { x, y, width: w, height: h };
          setCanvasLayout(freshLayout);
          activateMagnifier(freshLayout);
        });
      } else if (canvasLayout) {
        activateMagnifier(canvasLayout);
      } else {
        activateMagnifier({ x: 0, y: canvasOverhead, width: screenWidth, height: canvasHeight });
      }
    }
    
    protractorDragRef.current = {
      isDragging: true,
      startX: pageX, startY: pageY,
      dragHandle,
      initialCenter: { ...protractorCenter },
      initialRefEnd: { ...protractorRefEnd },
      initialAngleEnd: { ...protractorAngleEnd },
    };
  }, [protractorCenter, protractorRefEnd, protractorAngleEnd, canvasLayout, canvasToScreenCoords]);
  
  // Drag Move - Position direkt aktualisieren
  const handleProtractorDragMove = useCallback((e: any) => {
    if (!protractorDragRef.current.isDragging) return;
    const pageX = e.nativeEvent?.pageX || e.pageX || 0;
    const pageY = e.nativeEvent?.pageY || e.pageY || 0;
    const handle = protractorDragRef.current.dragHandle;
    
    // Endpunkte: reduzierte Empfindlichkeit für Präzision
    const sensitivity = handle === 'body' ? 1.0 : 0.5;
    
    // Berechne die Screen-Bewegung
    const screenDx = (pageX - protractorDragRef.current.startX) * sensitivity;
    const screenDy = (pageY - protractorDragRef.current.startY) * sensitivity;
    
    // Konvertiere Start- und End-Positionen zu Canvas-Koordinaten
    const startCanvas = screenToCanvasCoords(protractorDragRef.current.startX, protractorDragRef.current.startY);
    const endCanvas = screenToCanvasCoords(protractorDragRef.current.startX + screenDx, protractorDragRef.current.startY + screenDy);
    
    // Canvas-Bewegung berechnen
    const dx = endCanvas.x - startCanvas.x;
    const dy = endCanvas.y - startCanvas.y;
    
    if (handle === 'body') {
      // Alles verschieben (in Canvas-Koordinaten)
      const newCenter = { 
        x: protractorDragRef.current.initialCenter.x + dx,
        y: protractorDragRef.current.initialCenter.y + dy,
      };
      setProtractorCenter(newCenter);
      setProtractorRefEnd({
        x: protractorDragRef.current.initialRefEnd.x + dx,
        y: protractorDragRef.current.initialRefEnd.y + dy,
      });
      setProtractorAngleEnd({
        x: protractorDragRef.current.initialAngleEnd.x + dx,
        y: protractorDragRef.current.initialAngleEnd.y + dy,
      });
      // Lupe am Mittelpunkt aktualisieren (Koordinaten sind bereits in Canvas)
      setMagnifierTargetPosition({ x: newCenter.x, y: newCenter.y });
      const screenPos = canvasToScreenCoords(newCenter.x, newCenter.y);
      setMagnifierPosition({ x: screenPos.x, y: screenPos.y });
    } else if (handle === 'ref') {
      const newPos = {
        x: protractorDragRef.current.initialRefEnd.x + dx,
        y: protractorDragRef.current.initialRefEnd.y + dy,
      };
      setProtractorRefEnd(newPos);
      // Lupe aktualisieren
      setMagnifierTargetPosition({ x: newPos.x, y: newPos.y });
      const screenPos = canvasToScreenCoords(newPos.x, newPos.y);
      setMagnifierPosition({ x: screenPos.x, y: screenPos.y });
    } else if (handle === 'angle') {
      const newPos = {
        x: protractorDragRef.current.initialAngleEnd.x + dx,
        y: protractorDragRef.current.initialAngleEnd.y + dy,
      };
      setProtractorAngleEnd(newPos);
      // Lupe aktualisieren
      setMagnifierTargetPosition({ x: newPos.x, y: newPos.y });
      const screenPos = canvasToScreenCoords(newPos.x, newPos.y);
      setMagnifierPosition({ x: screenPos.x, y: screenPos.y });
    }
  }, [canvasToScreenCoords, screenToCanvasCoords]);
  
  // Drag End
  const handleProtractorDragEnd = useCallback(() => {
    // Lupe bei allen Drag-Typen ausblenden
    setShowMagnifier(false);
    setMagnifierPosition(null);
    setMagnifierSnapshot(null);
    protractorDragRef.current.isDragging = false;
    protractorDragRef.current.dragHandle = 'body';
  }, []);
  
  // Refs für PanResponder (verhindert stale closures)
  const dragStartRef = useRef(handleProtractorDragStart);
  const dragMoveRef = useRef(handleProtractorDragMove);
  const dragEndRef = useRef(handleProtractorDragEnd);
  useEffect(() => {
    dragStartRef.current = handleProtractorDragStart;
    dragMoveRef.current = handleProtractorDragMove;
    dragEndRef.current = handleProtractorDragEnd;
  }, [handleProtractorDragStart, handleProtractorDragMove, handleProtractorDragEnd]);
  
  // PanResponder für native Touch
  const protractorPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e: any) => dragStartRef.current(e),
      onPanResponderMove: (e: any) => dragMoveRef.current(e),
      onPanResponderRelease: () => dragEndRef.current(),
      onPanResponderTerminate: () => dragEndRef.current(),
    })
  );
  
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
  
  // Numpad Größe (S/M/L) - global gespeichert
  const [numpadSize, setNumpadSize] = useState<'S' | 'M' | 'L'>('M');
  const numpadScales = { S: 0.7, M: 1.0, L: 1.5 };
  
  // Lade gespeicherte Numpad-Größe beim Start
  useEffect(() => {
    AsyncStorage.getItem('aufmassprofi_numpad_size').then(saved => {
      if (saved === 'S' || saved === 'M' || saved === 'L') {
        setNumpadSize(saved);
      }
    });
  }, []);
  
  const changeNumpadSize = (newSize: 'S' | 'M' | 'L') => {
    setNumpadSize(newSize);
    AsyncStorage.setItem('aufmassprofi_numpad_size', newSize);
  };
  
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
        // Sofort in AsyncStorage speichern (Crash-Schutz)
        if (lastLoadedSketchId.current) {
          AsyncStorage.setItem(
            `sketch_legend_pos_${lastLoadedSketchId.current}`,
            JSON.stringify({ x: finalX, y: finalY })
          ).catch(() => {});
        }
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
  
  // Hilfsfunktion: Extrahiert den numerischen Wert aus einem Maß-String und konvertiert alles auf Meter
  const parseMeasurementToMeters = (measurement: string): number => {
    // Extrahiere Zahl und Einheit aus dem Maß-String (z.B. "2,50m" -> 2.50m, "25cm" -> 0.25m, "1500mm" -> 1.5m)
    const match = measurement.match(/^([\d.,]+)\s*(cm|mm|m)?/i);
    if (match) {
      const value = parseFloat(match[1].replace(',', '.'));
      if (isNaN(value)) return 0;
      const unit = (match[2] || 'm').toLowerCase();
      if (unit === 'cm') return value / 100;
      if (unit === 'mm') return value / 1000;
      return value; // Default: Meter
    }
    return 0;
  };

  // Berechne Gesamtlänge für ein einzelnes Element (Grundriss)
  const calculateTotalLfmForElement = (elementId: string): number => {
    let total = 0;
    const segmentMeasures = lineSegmentMeasurements[elementId];
    if (segmentMeasures) {
      Object.values(segmentMeasures).forEach(measurement => {
        total += parseMeasurementToMeters(measurement);
      });
    }
    return Math.round(total * 100) / 100;
  };
  
  // Berechne Gesamtlänge aller Maße in lfm (für Preview/PDF)
  const calculateTotalLfm = (): number => {
    let total = 0;
    Object.values(lineSegmentMeasurements).forEach(segmentMeasures => {
      Object.values(segmentMeasures).forEach(measurement => {
        total += parseMeasurementToMeters(measurement);
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
  
  // Rendert das Numpad-Overlay innerhalb eines Modals - gleiches Design wie floating Maß-Panel
  const renderInModalNumpad = () => {
    if (!showModalNumpad) return null;
    
    const scale = numpadScales[numpadSize];
    const kH = Math.round(36 * scale);
    const fS = Math.round(14 * scale);
    // iPhone: größere Panels damit Tasten tippbar sind und der Titel passt
    // Im Buchstaben-Modus auf iPhone: fast volle Breite damit alle QWERTZ-Tasten passen (10 pro Reihe)
    const numericPanelWidth = isPhoneDevice 
      ? (numpadSize === 'L' ? Math.max(Math.round(screenWidth * 0.55), 200) : numpadSize === 'M' ? Math.max(Math.round(screenWidth * 0.45), 170) : Math.max(Math.round(screenWidth * 0.35), 140))
      : (numpadSize === 'L' ? Math.round(screenWidth * 0.33) : numpadSize === 'M' ? Math.round(screenWidth * 0.27) : Math.round(screenWidth * 0.22));
    const panelWidth = (isPhoneDevice && modalNumpadMode === 'letters') 
      ? Math.round(screenWidth * 0.92)
      : numericPanelWidth;
    
    return (
      <Animated.View 
        style={[
          styles.floatingMeasurePanel,
          { 
            transform: modalNumpadPosition.getTranslateTransform(),
            width: panelWidth,
            top: 80,
          }
        ]}
      >
        {/* Header: Drag-Handle + Close-Button getrennt für Apple Pencil Kompatibilität */}
        <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#f8f8f8', borderBottomWidth: 1, borderBottomColor: '#e0e0e0' }}>
          <View {...modalNumpadPanResponder.panHandlers} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: isPhoneDevice ? 6 : 12, paddingVertical: isPhoneDevice ? 4 : 8 }}>
            <View style={styles.floatingMeasureDragHandle} />
            <Text style={[styles.floatingMeasureTitle, isPhoneDevice && { fontSize: 11 }]} numberOfLines={1}>{t('sketches.keyboard')}</Text>
          </View>
          <Pressable
            onPress={closeModalNumpad}
            style={{ width: isPhoneDevice ? 32 : 44, height: isPhoneDevice ? 32 : 44, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f0f0f0', borderRadius: isPhoneDevice ? 16 : 22, marginRight: isPhoneDevice ? 4 : 6 }}
          >
            <Ionicons name="close" size={isPhoneDevice ? 18 : 22} color="#666" />
          </Pressable>
        </View>
        
        {/* Tastatur-Bereich */}
        <View style={{ paddingHorizontal: 8, paddingTop: 6, paddingBottom: 8 }}>
          {/* Umschalt-Leiste: S/M/L + Zahlen/ABC */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
            <View style={{ flexDirection: 'row', gap: 4 }}>
              {(['S', 'M', 'L'] as const).map(s => (
                <TouchableOpacity
                  key={s}
                  style={{
                    paddingHorizontal: 10, paddingVertical: 3, borderRadius: 5,
                    backgroundColor: numpadSize === s ? '#1976d2' : '#e8e8e8',
                  }}
                  onPress={() => changeNumpadSize(s)}
                >
                  <Text style={{ fontSize: 11, fontWeight: '700', color: numpadSize === s ? '#fff' : '#666' }}>{s}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity
              style={{
                paddingHorizontal: 14, paddingVertical: 4, borderRadius: 6,
                backgroundColor: modalNumpadMode === 'letters' ? '#1976d2' : '#e8e8e8',
                borderWidth: 1, borderColor: modalNumpadMode === 'letters' ? '#1565c0' : '#ccc',
              }}
              onPress={() => setModalNumpadMode(modalNumpadMode === 'numbers' ? 'letters' : 'numbers')}
            >
              <Text style={{ fontSize: 12, fontWeight: '700', color: modalNumpadMode === 'letters' ? '#fff' : '#555' }}>
                {modalNumpadMode === 'numbers' ? 'ABC' : '123'}
              </Text>
            </TouchableOpacity>
          </View>
          
          {modalNumpadMode === 'numbers' ? (
            <>
              <View style={styles.floatingKeyRow}>
                {['7','8','9'].map(k => (
                  <TouchableOpacity key={k} style={[styles.floatingKey, { height: kH }]} onPress={() => handleActiveNumpadPress(k)}>
                    <Text style={[styles.floatingKeyText, { fontSize: fS }]}>{k}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={styles.floatingKeyRow}>
                {['4','5','6'].map(k => (
                  <TouchableOpacity key={k} style={[styles.floatingKey, { height: kH }]} onPress={() => handleActiveNumpadPress(k)}>
                    <Text style={[styles.floatingKeyText, { fontSize: fS }]}>{k}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={styles.floatingKeyRow}>
                {['1','2','3'].map(k => (
                  <TouchableOpacity key={k} style={[styles.floatingKey, { height: kH }]} onPress={() => handleActiveNumpadPress(k)}>
                    <Text style={[styles.floatingKeyText, { fontSize: fS }]}>{k}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={styles.floatingKeyRow}>
                {[',','0','-'].map(k => (
                  <TouchableOpacity key={k} style={[styles.floatingKey, { height: kH }]} onPress={() => handleActiveNumpadPress(k)}>
                    <Text style={[styles.floatingKeyText, { fontSize: fS }]}>{k}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={styles.floatingKeyRow}>
                {['+','×','÷'].map(k => (
                  <TouchableOpacity key={k} style={[styles.floatingKey, { height: kH, backgroundColor: '#e3f2fd' }]} onPress={() => handleActiveNumpadPress(k === '×' ? '*' : k === '÷' ? '/' : k)}>
                    <Text style={[styles.floatingKeyText, { fontSize: fS, color: '#1976d2', fontWeight: '700' }]}>{k}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={styles.floatingKeyRow}>
                <TouchableOpacity style={[styles.floatingKey, { height: kH, backgroundColor: '#e3f2fd' }]} onPress={() => handleActiveNumpadPress('m')}>
                  <Text style={[styles.floatingKeyText, { fontSize: fS, color: '#1976d2', fontWeight: '700' }]}>m</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.floatingKey, { height: kH, backgroundColor: '#e3f2fd' }]} onPress={() => handleActiveNumpadPress('cm')}>
                  <Text style={[styles.floatingKeyText, { fontSize: fS, color: '#1976d2', fontWeight: '700' }]}>cm</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.floatingKey, { height: kH, backgroundColor: '#ffebee' }]} onPress={() => handleActiveNumpadPress('⌫')}>
                  <Ionicons name="backspace-outline" size={Math.round(18 * scale)} color="#f44336" />
                </TouchableOpacity>
              </View>
            </>
          ) : (
            <>
              {/* Einheiten-Zeile */}
              <View style={[styles.floatingKeyRow, { gap: 3 }]}>
                {['m','m²','m³','lfm'].map(k => (
                  <TouchableOpacity key={`u-${k}`} style={[styles.floatingLetterKey, { height: kH, backgroundColor: '#e3f2fd' }]} onPress={() => handleActiveNumpadPress(k)}>
                    <Text style={[styles.floatingKeyText, { fontSize: Math.round(11 * scale), color: '#1976d2', fontWeight: '700' }]}>{k}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={[styles.floatingKeyRow, { gap: 3 }]}>
                {['Stk','kg','l','Paar'].map(k => (
                  <TouchableOpacity key={`u2-${k}`} style={[styles.floatingLetterKey, { height: kH, backgroundColor: '#e3f2fd' }]} onPress={() => handleActiveNumpadPress(k)}>
                    <Text style={[styles.floatingKeyText, { fontSize: Math.round(11 * scale), color: '#1976d2', fontWeight: '700' }]}>{k}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {/* QWERTZ Buchstaben */}
              {[
                ['Q','W','E','R','T','Z','U','I','O','P'],
                ['A','S','D','F','G','H','J','K','L'],
                ['Y','X','C','V','B','N','M'],
              ].map((row, ri) => (
                <View key={`lr-${ri}`} style={[styles.floatingKeyRow, { gap: 3 }]}>
                  {row.map(letter => (
                    <TouchableOpacity 
                      key={letter}
                      style={[styles.floatingLetterKey, { height: Math.round(34 * scale), minWidth: Math.round(26 * scale) }]}
                      onPress={() => {
                        handleActiveNumpadPress(modalNumpadCaps ? letter : letter.toLowerCase());
                        if (modalNumpadCaps) setModalNumpadCaps(false);
                      }}
                    >
                      <Text style={[styles.floatingKeyText, { fontSize: Math.round(12 * scale) }]}>
                        {modalNumpadCaps ? letter : letter.toLowerCase()}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              ))}
              {/* Umlaute + Sonderzeichen */}
              <View style={[styles.floatingKeyRow, { gap: 3 }]}>
                {['ä','ö','ü','ß'].map(k => (
                  <TouchableOpacity key={k} style={[styles.floatingLetterKey, { height: Math.round(34 * scale) }]} onPress={() => {
                    handleActiveNumpadPress(modalNumpadCaps ? k.toUpperCase() : k);
                    if (modalNumpadCaps) setModalNumpadCaps(false);
                  }}>
                    <Text style={[styles.floatingKeyText, { fontSize: Math.round(12 * scale) }]}>{modalNumpadCaps ? k.toUpperCase() : k}</Text>
                  </TouchableOpacity>
                ))}
                <TouchableOpacity style={[styles.floatingLetterKey, { height: Math.round(34 * scale), backgroundColor: modalNumpadCaps ? '#1976d2' : '#f0f0f0' }]} onPress={() => setModalNumpadCaps(!modalNumpadCaps)}>
                  <Ionicons name="arrow-up" size={Math.round(16 * scale)} color={modalNumpadCaps ? '#fff' : '#666'} />
                </TouchableOpacity>
              </View>
              {/* Leer + Sonderzeichen + Backspace */}
              <View style={[styles.floatingKeyRow, { gap: 3 }]}>
                <TouchableOpacity style={[styles.floatingLetterKey, { height: Math.round(34 * scale), minWidth: Math.round(24 * scale) }]} onPress={() => handleActiveNumpadPress('.')}>
                  <Text style={[styles.floatingKeyText, { fontSize: Math.round(12 * scale) }]}>.</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.floatingLetterKey, { height: Math.round(34 * scale), flex: 3, backgroundColor: '#e3f2fd' }]} onPress={() => handleActiveNumpadPress(' ')}>
                  <Text style={[styles.floatingKeyText, { fontSize: Math.round(12 * scale), color: '#1976d2' }]}>{t('sketches.space')}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.floatingLetterKey, { height: Math.round(34 * scale), minWidth: Math.round(24 * scale) }]} onPress={() => handleActiveNumpadPress('/')}>
                  <Text style={[styles.floatingKeyText, { fontSize: Math.round(12 * scale) }]}>/</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.floatingLetterKey, { height: Math.round(34 * scale), flex: 1, backgroundColor: '#ffebee' }]} onPress={() => handleActiveNumpadPress('⌫')}>
                  <Ionicons name="backspace-outline" size={Math.round(16 * scale)} color="#f44336" />
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      </Animated.View>
    );
  };
  
  const insertMeasurementAsText = () => {
    const result = calculateMeasurementExpression(measurementExpression);
    if (result === null) {
      Alert.alert(t('common.error'), t('sketches.invalidExpression'));
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
  const [showElementStyleEditor, setShowElementStyleEditor] = useState(false);
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
  const backgroundImageChangedRef = useRef(false); // Track if bg image changed since load

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
  }, [backgroundImageUri, photoId, sketchId, newSketchKey]); // FIX: newSketchKey hinzugefügt für Tablet-Kompatibilität

  // Load existing sketch when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      // FIX TABLET BUG: Erhöhe Visit-Counter bei jedem Focus
      // Dies ermöglicht Erkennung von mehreren neuen Skizzen ohne sketchId/photoId
      visitCountRef.current += 1;
      const currentVisit = visitCountRef.current;
      
      console.log('useFocusEffect triggered, visit:', currentVisit, 'sketchId:', sketchId, 'photoId:', photoId, 'newSketchKey:', newSketchKey, 'lastLoaded:', lastLoadedSketchId.current, 'lastPhotoId:', lastLoadedPhotoId.current, 'lastNewSketchKey:', lastNewSketchKey.current);
      
      // IMMER den State für die aktuelle Skizze initialisieren
      // Dies verhindert, dass alte Daten aus vorherigen Skizzen angezeigt werden
      const resetToCleanState = () => {
        console.log('Resetting to clean state for new/different sketch (visit:', currentVisit, ')');
        setLineSegmentMeasurements({});
        setSelectedLineSegment(null);
        setElements([]);
        setHistory([[]]);
        setHistoryIndex(0);
        setTitle('Neue Skizze');
        setBackgroundImage(null);
        backgroundImageChangedRef.current = true; // Mark as changed (cleared)
        setTotalLfmBoxPositions({}); // Reset alle Summenbox-Positionen
        setLegendPosition({ x: 0, y: 0 }); // Reset Legend-Position
        legendPan.setValue({ x: 0, y: 0 }); // Reset Pan-Animation
        initialImageAdded.current = false;
        hasEditedCurrentSketchRef.current = false;
      };
      
      // FIX TABLET BUG V5: Einfachere und robustere Reset-Logik
      // Der newSketchKey ist ein Timestamp, der bei jeder neuen Skizze anders ist
      const sketchChanged = lastLoadedSketchId.current !== sketchId;
      const photoChanged = lastLoadedPhotoId.current !== photoId;
      const newSketchKeyChanged = lastNewSketchKey.current !== newSketchKey && newSketchKey !== undefined;
      
      // KRITISCH: Bei newSketchKey-Änderung nur resetten, wenn es die ERSTE Fokussierung ist
      // (lastNewSketchKey ist noch undefined) ODER wenn explizit eine andere Skizze geladen wird
      const isFirstFocusForNewSketch = newSketchKeyChanged && lastNewSketchKey.current === undefined;
      const isNavigatingToNewSketch = newSketchKeyChanged && lastNewSketchKey.current !== undefined;
      
      // Reset wenn:
      // 1. sketchId hat sich geändert (andere existierende Skizze)
      // 2. photoId hat sich geändert (andere Foto-basierte Skizze)
      // 3. Wir navigieren zu einer NEUEN Skizze (newSketchKey ändert sich UND es gab bereits eine vorherige)
      const needsReset = sketchChanged || photoChanged || isNavigatingToNewSketch;
      
      console.log('Reset check - sketchChanged:', sketchChanged, 'photoChanged:', photoChanged, 
                  'newSketchKeyChanged:', newSketchKeyChanged, 'isFirstFocusForNewSketch:', isFirstFocusForNewSketch,
                  'isNavigatingToNewSketch:', isNavigatingToNewSketch, 'needsReset:', needsReset);
      
      if (needsReset) {
        console.log('>>> RESETTING STATE for new/different sketch');
        
        // Immer zuerst reset, dann laden falls nötig
        resetToCleanState();
        lastLoadedSketchId.current = sketchId;
        lastLoadedPhotoId.current = photoId;
        lastNewSketchKey.current = newSketchKey;
        
        // Existierende Skizze laden, wenn vorhanden
        if (sketchId) {
          console.log('useFocusEffect: Loading sketch', sketchId);
          loadSketch();
        }
      } else {
        // Auch wenn kein Reset nötig ist, müssen wir die Refs aktualisieren
        if (isFirstFocusForNewSketch) {
          lastNewSketchKey.current = newSketchKey;
        }
        if (sketchId && lastLoadedSketchId.current === sketchId) {
          // Gleiche Skizze, nur neu fokussiert - nichts tun
          console.log('useFocusEffect: Re-focused on same sketch', sketchId);
        }
      }
    }, [sketchId, photoId, newSketchKey])
  );

  const loadSketch = async () => {
    try {
      setLoading(true);
      const startTime = Date.now();
      console.log('Loading sketch with ID:', sketchId, 'for project:', projectId);
      
      // Load lightweight sketch info + heavy data in parallel for speed
      const [sketch, heavyData] = await Promise.all([
        SketchService.getById(sketchId),
        SketchService.loadSketchData(sketchId),
      ]);
      console.log('Sketch loaded in', Date.now() - startTime, 'ms');
      
      if (sketch) {
        setTitle(sketch.title || 'Skizze');
        
        // Load notes if available (from main sketch or metadata fallback)
        if (sketch.notes) {
          setNotes(sketch.notes);
        }
        
        // Load PDF size if available
        if ((sketch as any).pdf_size) {
          setPdfSize((sketch as any).pdf_size);
        }
        
        // Use heavy data from optimized storage
        const metadata = heavyData.metadata;
        const bgImage = heavyData.backgroundImage;
        
        if (metadata) {
          console.log('Loaded metadata from optimized storage');
          // Fallback: Notes aus metadata laden falls nicht im Hauptobjekt
          if (!sketch.notes && metadata.notes) {
            setNotes(metadata.notes);
          }
          if (metadata.elements && Array.isArray(metadata.elements)) {
            console.log('Setting elements:', metadata.elements.length, 'elements');
            console.log('Element IDs:', metadata.elements.map((e: any) => e.id + ' (' + e.type + ')').join(', '));
            
            // FIX: Restore image URIs from FILE storage (primär) oder AsyncStorage (Fallback)
            const restoredElements = await Promise.all(
              metadata.elements.map(async (el: any) => {
                if (el.type === 'image' && el.data?.uri === '__stored__' && el.data?.imageStorageKey) {
                  console.log(`[loadSketch] Restoring image from storage: ${el.data.imageStorageKey}`);
                  try {
                    // Primär: Aus Datei laden (umgeht AsyncStorage-Limits)
                    const uri = await loadImageFromFile(el.data.imageStorageKey);
                    if (uri && uri.length > 100) {
                      console.log(`[loadSketch] Image restored successfully, length: ${uri.length}`);
                      return { ...el, data: { ...el.data, uri } };
                    } else {
                      console.warn(`[loadSketch] Image not found for key: ${el.data.imageStorageKey}`);
                    }
                  } catch (err) {
                    console.error(`[loadSketch] Error loading image ${el.data.imageStorageKey}:`, err);
                  }
                }
                return el;
              })
            );
            
            setElements(restoredElements);
            setHistory([restoredElements]);
            setHistoryIndex(0);
          } else {
            console.log('No elements in metadata');
          }
          // Background image from separate storage
          if (bgImage) {
            setBackgroundImage(bgImage);
          }
          // Lade die Linien-Maße wenn vorhanden, sonst zurücksetzen
          if (metadata.lineSegmentMeasurements) {
            setLineSegmentMeasurements(metadata.lineSegmentMeasurements);
          } else {
            setLineSegmentMeasurements({});
          }
          // Maßlinien-Darstellung pro Element laden
          if (metadata.measureLineStyles) {
            setMeasureLineStyles(metadata.measureLineStyles);
          } else {
            setMeasureLineStyles({});
          }
          // Summenbox-Positionen laden wenn vorhanden (pro Element)
          if (metadata.totalLfmBoxPositions) {
            setTotalLfmBoxPositions(metadata.totalLfmBoxPositions);
          } else {
            setTotalLfmBoxPositions({});
          }
          // Legend-Position laden wenn vorhanden
          if (metadata.legendPosition) {
            setLegendPosition(metadata.legendPosition);
            legendPan.setValue(metadata.legendPosition);
          } else {
            // Fallback: Versuche gespeicherte Position aus AsyncStorage zu laden (Crash-Schutz)
            try {
              const savedPos = await AsyncStorage.getItem(`sketch_legend_pos_${sketchId}`);
              if (savedPos) {
                const pos = JSON.parse(savedPos);
                setLegendPosition(pos);
                legendPan.setValue(pos);
              } else {
                setLegendPosition({ x: 0, y: 0 });
                legendPan.setValue({ x: 0, y: 0 });
              }
            } catch {
              setLegendPosition({ x: 0, y: 0 });
              legendPan.setValue({ x: 0, y: 0 });
            }
          }
          // Label-Offsets laden wenn vorhanden
          if (metadata.labelOffsets) {
            setLabelOffsets(metadata.labelOffsets);
          } else {
            setLabelOffsets({});
          }
        } else if (sketch.metadata) {
          // Fallback: metadata still in main array (shouldn't happen after migration)
          try {
            console.log('Fallback: parsing metadata from main array');
            const parsedMeta = JSON.parse(sketch.metadata);
            if (parsedMeta.elements && Array.isArray(parsedMeta.elements)) {
              setElements(parsedMeta.elements);
              setHistory([parsedMeta.elements]);
              setHistoryIndex(0);
            }
            if (parsedMeta.backgroundImage) {
              setBackgroundImage(parsedMeta.backgroundImage);
            }
            if (parsedMeta.lineSegmentMeasurements) {
              setLineSegmentMeasurements(parsedMeta.lineSegmentMeasurements);
            }
            if (parsedMeta.measureLineStyles) {
              setMeasureLineStyles(parsedMeta.measureLineStyles);
            }
            if (parsedMeta.totalLfmBoxPositions) {
              setTotalLfmBoxPositions(parsedMeta.totalLfmBoxPositions);
            }
            if (parsedMeta.legendPosition) {
              setLegendPosition(parsedMeta.legendPosition);
              legendPan.setValue(parsedMeta.legendPosition);
            }
            if (parsedMeta.labelOffsets) {
              setLabelOffsets(parsedMeta.labelOffsets);
            }
          } catch (e) {
            console.error('Error parsing fallback metadata:', e);
          }
        } else {
          console.log('No metadata found for sketch');
        }
      } else {
        console.log('Sketch not found');
      }
      console.log('Total load time:', Date.now() - startTime, 'ms');
    } catch (error) {
      console.error('Error loading sketch:', error);
      showAlert(t('common.error'), t('sketches.sketchLoadError'));
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

  // History management (Undo/Redo) - ref-basiert um stale closures zu vermeiden
  const historyRef = useRef(history);
  const historyIndexRef = useRef(historyIndex);
  useEffect(() => { historyRef.current = history; }, [history]);
  useEffect(() => { historyIndexRef.current = historyIndex; }, [historyIndex]);
  
  const addToHistory = useCallback((newElements: DrawElement[]) => {
    const currentHistory = historyRef.current;
    const currentIndex = historyIndexRef.current;
    const newHistory = currentHistory.slice(0, currentIndex + 1);
    newHistory.push(newElements);
    console.log('[addToHistory] Adding to history. New length:', newHistory.length, 'elements:', newElements.length);
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
    setElements(newElements);
  }, []);

  // Funktion um Winkelmesser-Messung zum Sketch hinzuzufügen
  const addProtractorToSketch = useCallback(() => {
    // NEUES 3-PUNKTE-SYSTEM: Winkel als einzelnes Element speichern
    const currentScale = scaleRef.current || 1;
    const layout = canvasLayoutRef.current || { x: 0, y: canvasOverhead };
    
    // WICHTIG: Die Touch-Handler und SVG-Handles im canvasRef sind bei angleVertex.y
    // Aber das SVG-Rendering scheint einen Offset zu haben.
    // Versuche: Subtrahiere layout.y um den Sprung auszugleichen
    const offsetY = layout.y || canvasOverhead;
    
    const vertex = { x: angleVertex.x, y: angleVertex.y - offsetY };
    const point1 = { x: anglePoint1.x, y: anglePoint1.y - offsetY };
    const point2 = { x: anglePoint2.x, y: anglePoint2.y - offsetY };
    
    // DEBUG
    console.log('=== addProtractorToSketch DEBUG ===');
    console.log('angleVertex (original):', angleVertex);
    console.log('layout.y:', layout.y);
    console.log('offsetY applied:', offsetY);
    console.log('Saved vertex:', vertex);
    console.log('===================================');
    
    // Generiere eindeutige ID
    const angleId = `angle-${Date.now().toString(36)}`;
    const newElements: DrawElement[] = [...elements];
    
    // Winkel als EINZELNES Element speichern (mit allen 3 Punkten)
    newElements.push({
      id: angleId,
      type: 'angle',
      data: { angleValue: calculatedAngle },
      color: '#FF5722',
      strokeWidth: Math.max(1, 3 / currentScale),
      vertex: vertex,
      point1: point1,
      point2: point2,
      angle: calculatedAngle,
    });
    
    addToHistory(newElements);
    
    // Winkelmesser-State komplett aufräumen
    setShowMagnifier(false);
    setMagnifierSnapshot(null);
    setShowProtractor(false);
    protractorInitializedRef.current = false;
    
    // 3-Punkte-System zurücksetzen
    setAngleVertex({ x: 0, y: 0 });
    setAnglePoint1({ x: 0, y: 0 });
    setAnglePoint2({ x: 0, y: 0 });
    setActiveDragPoint(null);
    
    showAlert(t('sketches.angleSnap'), t('sketches.angleAdded', { angle: calculatedAngle }));
  }, [elements, angleScreenCoords, calculatedAngle, addToHistory, screenToCanvasForMagnifier]);

  // ============= WINKEL-GRUPPEN-FUNKTIONEN =============
  // Winkel-Elemente haben IDs im Format: {baseId}-ref-line, {baseId}-angle-line, {baseId}-arc, {baseId}-text
  
  // Prüft ob ein Element Teil einer Winkel-Gruppe ist
  const isAngleGroupElement = useCallback((elementId: string): boolean => {
    return elementId.includes('-ref-line') || 
           elementId.includes('-angle-line') || 
           elementId.includes('-arc') || 
           elementId.includes('-text');
  }, []);
  
  // Extrahiert die Basis-ID aus einem Winkel-Element
  const getAngleGroupBaseId = useCallback((elementId: string): string | null => {
    const suffixes = ['-ref-line', '-angle-line', '-arc', '-text'];
    for (const suffix of suffixes) {
      if (elementId.endsWith(suffix)) {
        return elementId.slice(0, -suffix.length);
      }
    }
    return null;
  }, []);
  
  // Findet alle Element-IDs einer Winkel-Gruppe
  const getAngleGroupElementIds = useCallback((baseId: string): string[] => {
    const suffixes = ['-ref-line', '-angle-line', '-arc', '-text'];
    return suffixes.map(suffix => `${baseId}${suffix}`);
  }, []);
  
  // Verschiebt eine komplette Winkel-Gruppe
  const moveAngleGroup = useCallback((baseId: string, dx: number, dy: number, originalElements: DrawElement[]): DrawElement[] => {
    const groupIds = getAngleGroupElementIds(baseId);
    
    return elements.map(el => {
      if (!groupIds.includes(el.id)) return el;
      
      // Finde das Original-Element
      const origEl = originalElements.find(oe => oe.id === el.id);
      if (!origEl) return el;
      
      const newEl = { ...el };
      
      if (el.type === 'line') {
        // Linien (ref-line, angle-line)
        newEl.data = {
          ...el.data,
          x1: origEl.data.x1 + dx,
          y1: origEl.data.y1 + dy,
          x2: origEl.data.x2 + dx,
          y2: origEl.data.y2 + dy,
        };
      } else if (el.type === 'path') {
        // Bogen (arc) - SVG Pfad verschieben
        const pathRegex = /([MA])\s*(-?\d+\.?\d*)\s+(-?\d+\.?\d*)/g;
        newEl.data = origEl.data.replace(pathRegex, (match: string, cmd: string, x: string, y: string) => {
          return `${cmd} ${parseFloat(x) + dx} ${parseFloat(y) + dy}`;
        });
      } else if (el.type === 'text') {
        // Text
        newEl.x = (origEl.x || 0) + dx;
        newEl.y = (origEl.y || 0) + dy;
      }
      
      return newEl;
    });
  }, [elements, getAngleGroupElementIds]);

  // Berechnet eine Winkelgruppe basierend auf neuen Parametern (Drehen & Verlängern)
  const recalculateAngleGroup = useCallback((
    baseId: string,
    centerX: number, centerY: number,
    refAngleRad: number,  // Winkel der Referenzlinie (blau) in Radians
    refLength: number,    // Länge der Referenzlinie
    angleOffsetRad: number, // Winkelversatz (Winkel zwischen den Linien) in Radians
    anglLineLength: number, // Länge der Winkellinie (rot)
    isMirrored: boolean,  // Ob gespiegelt
  ): DrawElement[] => {
    const groupIds = getAngleGroupElementIds(baseId);
    
    // Berechne Endpunkte
    const refEndX = centerX + refLength * Math.cos(refAngleRad);
    const refEndY = centerY + refLength * Math.sin(refAngleRad);
    
    const angleLineRad = refAngleRad + angleOffsetRad;
    const angleEndX = centerX + anglLineLength * Math.cos(angleLineRad);
    const angleEndY = centerY + anglLineLength * Math.sin(angleLineRad);
    
    // Bogenradius = kleinere der beiden Linienlängen * 0.4
    const arcRadius = Math.min(refLength, anglLineLength) * 0.4;
    
    // Bogenpunkte
    const arcStartX = centerX + arcRadius * Math.cos(refAngleRad);
    const arcStartY = centerY + arcRadius * Math.sin(refAngleRad);
    const arcEndX = centerX + arcRadius * Math.cos(angleLineRad);
    const arcEndY = centerY + arcRadius * Math.sin(angleLineRad);
    
    // Arc sweep Berechnung
    const absAngle = Math.abs(angleOffsetRad * 180 / Math.PI);
    const largeArc = absAngle > 180 ? 1 : 0;
    const sweep = angleOffsetRad > 0 ? 1 : 0;
    
    const arcPath = `M ${arcStartX} ${arcStartY} A ${arcRadius} ${arcRadius} 0 ${largeArc} ${sweep} ${arcEndX} ${arcEndY}`;
    
    // Textposition (Mitte des Bogens)
    const textAngleRad = refAngleRad + angleOffsetRad / 2;
    const textDist = arcRadius + 15;
    const textX = centerX + textDist * Math.cos(textAngleRad);
    const textY = centerY + textDist * Math.sin(textAngleRad);
    
    // Winkeltext
    const displayAngle = Math.round(Math.abs(angleOffsetRad * 180 / Math.PI));
    
    return elements.map(el => {
      if (!groupIds.includes(el.id)) return el;
      
      if (el.id === `${baseId}-ref-line`) {
        return { ...el, data: { x1: centerX, y1: centerY, x2: refEndX, y2: refEndY } };
      } else if (el.id === `${baseId}-angle-line`) {
        return { ...el, data: { x1: centerX, y1: centerY, x2: angleEndX, y2: angleEndY } };
      } else if (el.id === `${baseId}-arc`) {
        return { ...el, data: arcPath };
      } else if (el.id === `${baseId}-text`) {
        return { ...el, x: textX, y: textY, data: { text: `${displayAngle}°` } };
      }
      return el;
    });
  }, [elements, getAngleGroupElementIds]);

  // Extrahiert die geometrischen Parameter einer Winkelgruppe aus den Elementen
  const getAngleGroupGeometry = useCallback((baseId: string, els?: DrawElement[]) => {
    const sourceElements = els || elements;
    const refLine = sourceElements.find(el => el.id === `${baseId}-ref-line`);
    const angleLine = sourceElements.find(el => el.id === `${baseId}-angle-line`);
    
    if (!refLine || !angleLine) return null;
    
    const cx = refLine.data.x1;
    const cy = refLine.data.y1;
    
    // Referenzlinie Winkel und Länge
    const refDx = refLine.data.x2 - cx;
    const refDy = refLine.data.y2 - cy;
    const refAngleRad = Math.atan2(refDy, refDx);
    const refLength = Math.sqrt(refDx * refDx + refDy * refDy);
    
    // Winkellinie Winkel und Länge
    const anglDx = angleLine.data.x2 - cx;
    const anglDy = angleLine.data.y2 - cy;
    const angleLineRad = Math.atan2(anglDy, anglDx);
    const anglLineLength = Math.sqrt(anglDx * anglDx + anglDy * anglDy);
    
    // Winkelversatz (Differenz zwischen den beiden Linien)
    let angleOffsetRad = angleLineRad - refAngleRad;
    
    return {
      cx, cy,
      refAngleRad, refLength,
      angleLineRad, anglLineLength,
      angleOffsetRad,
    };
  }, [elements]);

  const undo = () => {
    console.log('[Undo] historyIndex:', historyIndex, 'history.length:', history.length, 'canUndo:', canUndo);
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      console.log('[Undo] Setting index to:', newIndex, 'elements:', history[newIndex]?.length);
      setHistoryIndex(newIndex);
      setElements(history[newIndex]);
      setSelectedElementId(null);
    }
  };

  const redo = () => {
    console.log('[Redo] historyIndex:', historyIndex, 'history.length:', history.length, 'canRedo:', canRedo);
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1;
      console.log('[Redo] Setting index to:', newIndex, 'elements:', history[newIndex]?.length);
      setHistoryIndex(newIndex);
      setElements(history[newIndex]);
      setSelectedElementId(null);
    }
  };

  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < history.length - 1;

  // Handle back button - auto save before navigating back
  const handleBackPress = async () => {
    // Schutz vor Doppelklicks - wenn bereits gespeichert wird, ignorieren
    if (isSaving) {
      console.log('Already saving, ignoring back press');
      return;
    }
    
    // Nur auto-speichern wenn wir die aktuelle Skizze bearbeiten (nicht beim Reset)
    const currentSketchId = lastLoadedSketchId.current;
    
    // Only auto-save if there are elements to save AND we're still on the same sketch
    if (elements.length > 0 && currentSketchId === sketchId) {
      try {
        setIsSaving(true); // Blockiere weitere Klicks
        const startTime = Date.now();
        
        // Create metadata WITHOUT backgroundImage (stored separately)
        const metadata = {
          elements,
          canvasWidth: width,
          canvasHeight: height - 120,
          lineSegmentMeasurements,
          measureLineStyles,
          totalLfmBoxPositions,
          legendPosition,
          notes,
        };

        console.log('Auto-saving sketch with', elements.length, 'elements');

        // Generate preview image - wrapped in try/catch
        let sketchData = '';
        
        if (elements.length > 0) {
          try {
            sketchData = generatePreviewSvg();
          } catch (previewError) {
            console.error('Error generating preview:', previewError);
          }
        }
        
        // Use placeholder for background-image sketches (not the full base64!)
        if (!sketchData && backgroundImage) {
          try {
            const previewSvg = `
              <svg width="200" height="200" xmlns="http://www.w3.org/2000/svg">
                <rect width="200" height="200" fill="#f0f0f0"/>
                <text x="100" y="90" text-anchor="middle" font-size="16" fill="#333">Foto-Skizze</text>
                <text x="100" y="115" text-anchor="middle" font-size="14" fill="#666">${(title || 'Skizze').replace(/[<>&"']/g, '')}</text>
              </svg>
            `;
            sketchData = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(previewSvg)))}`;
          } catch (e) {
            console.error('Error creating placeholder preview:', e);
          }
        }
        
        if (!sketchData) {
          try {
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
                  ${(title || 'Skizze').replace(/[<>&"']/g, '')}
                </text>
              </svg>
            `;
            
            sketchData = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(previewSvg)))}`;
          } catch (e) {
            console.error('Error creating fallback preview:', e);
          }
        }

        // Lokale Kopien für den Hintergrund-Speichervorgang erstellen
        const saveSketchId = sketchId;
        const saveProjectId = projectId;
        const saveTitle = title;
        const saveNotes = notes;
        const savePdfSize = pdfSize;
        const saveBgChanged = backgroundImageChangedRef.current;
        const saveBgImage = backgroundImage;

        // FIX: Bild-URIs aus Elementen extrahieren und als DATEI speichern (umgeht AsyncStorage-Limits)
        const extractedImageOps: Promise<any>[] = [];
        // FIX TABLET BUG: Verwende eindeutigen temporären Prefix für neue Skizzen
        // Dies verhindert Kollisionen wenn mehrere neue Skizzen nacheinander erstellt werden
        const tempSketchPrefix = saveSketchId || `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const lightElements = metadata.elements.map((el: any) => {
          if (el.type === 'image' && el.data?.uri && el.data.uri.length > 1000) {
            // Speichere das Bild als DATEI (nicht AsyncStorage!)
            const imageKey = `sketch_img_${tempSketchPrefix}_${el.id}`;
            extractedImageOps.push(
              saveImageToFile(imageKey, el.data.uri).then(success => {
                if (!success) console.error(`[autoSave] Failed to save image ${imageKey}`);
              })
            );
            // Ersetze die URI durch einen Verweis auf den Speicherkey
            return { ...el, data: { ...el.data, uri: '__stored__', imageStorageKey: imageKey } };
          }
          return el;
        });
        const lightMetadata = { ...metadata, elements: lightElements };

        // SPEICHERN: Leichtgewichtige Daten (Sketch-Liste inkl. pdf_size) SOFORT speichern
        // Schwere Daten (Metadata, Bilder, Background) im Hintergrund
        if (saveSketchId) {
          // SOFORT: Sketch-Listeneintrag aktualisieren (pdf_size, title, notes)
          // Das stellt sicher, dass die Projektdetails die neuesten Daten haben
          try {
            await SketchService.update(saveSketchId, {
              project_id: saveProjectId,
              title: saveTitle,
              notes: saveNotes,
              sketch_data: sketchData,
              pdf_size: savePdfSize,
            });
            console.log('Sketch list entry updated (sync) in', Date.now() - startTime, 'ms');
          } catch (err) {
            console.error('Error saving sketch list entry:', err);
          }
          
          // IM HINTERGRUND: Schwere Metadata und Bilder speichern
          const saveHeavyDataInBackground = async () => {
            try {
              const criticalOps: Promise<any>[] = [
                AsyncStorage.setItem(`sketch_meta_${saveSketchId}`, JSON.stringify(lightMetadata)),
                ...extractedImageOps,
              ];
              
              if (saveBgChanged) {
                if (saveBgImage) {
                  criticalOps.push(AsyncStorage.setItem(`sketch_bg_${saveSketchId}`, saveBgImage));
                } else {
                  criticalOps.push(AsyncStorage.removeItem(`sketch_bg_${saveSketchId}`));
                }
              }
              
              await Promise.all(criticalOps);
              backgroundImageChangedRef.current = false;
              console.log('Background-saved heavy data in', Date.now() - startTime, 'ms');
            } catch (error) {
              console.error('Error background-saving heavy data:', error);
            }
          };
          saveHeavyDataInBackground();
        } else if (saveTitle.trim() || elements.length > 0) {
          // NEUE Skizze: Alles synchron speichern, damit sie in der Vorschau erscheint
          // FIX: Auch ohne Titel speichern wenn Elemente vorhanden sind
          const finalTitle = saveTitle.trim() || `Skizze ${new Date().toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}`;
          try {
            // Metadata OHNE backgroundImage stringifyen (verhindert OOM bei großen Bildern)
            const lightMetadataForCreate = { ...lightMetadata }; // Verwende lightMetadata (mit extrahierten Bildern)
            delete lightMetadataForCreate.backgroundImage;
            
            // Zuerst die Bilder separat speichern (mit temporärem Key 'undefined')
            // FIX: WARTEN bis alle Bilder geschrieben sind BEVOR wir weitermachen
            if (extractedImageOps.length > 0) {
              console.log('[autoSave] Saving', extractedImageOps.length, 'images with temporary keys...');
              await Promise.all(extractedImageOps);
              // FIX: Warte kurz, damit das Dateisystem synchronisiert (wichtig für Tablets)
              await new Promise(resolve => setTimeout(resolve, 100));
              console.log('[autoSave] Saved', extractedImageOps.length, 'images successfully');
            }
            
            const newSketch = await SketchService.create({
              project_id: saveProjectId,
              title: finalTitle,
              notes: saveNotes,
              sketch_data: sketchData,
              metadata: JSON.stringify(lightMetadataForCreate),
              pdf_size: savePdfSize,
            });
            
            // FIX TABLET BUG: Image-Keys vom temporären Prefix auf die echte Sketch-ID ummappen
            if (newSketch?.id && lightElements.some((el: any) => el.type === 'image' && el.data?.imageStorageKey)) {
              console.log('[autoSave] Migrating image keys to new sketch ID:', newSketch.id);
              
              // FIX: Retry-Funktion für das Laden von Bildern (Tablets haben langsame Dateisysteme)
              const loadWithRetry = async (key: string, maxRetries = 5): Promise<string | null> => {
                for (let i = 0; i < maxRetries; i++) {
                  const data = await loadImageFromFile(key);
                  if (data) {
                    console.log(`[autoSave] Loaded image ${key} on attempt ${i + 1}`);
                    return data;
                  }
                  // Exponentielles Backoff
                  const delay = 100 * Math.pow(2, i);
                  console.log(`[autoSave] Retry ${i + 1}/${maxRetries} for ${key}, waiting ${delay}ms`);
                  await new Promise(resolve => setTimeout(resolve, delay));
                }
                return null;
              };
              
              try {
                const remapOps: Promise<any>[] = [];
                const updatedElements = await Promise.all(lightElements.map(async (el: any) => {
                  // FIX TABLET BUG: Suche nach dem temporären Prefix (temp_timestamp_random)
                  if (el.type === 'image' && el.data?.imageStorageKey && el.data.imageStorageKey.includes('_temp_')) {
                    const oldKey = el.data.imageStorageKey;
                    // Ersetze das temporäre Prefix durch die echte Sketch-ID
                    const newKey = oldKey.replace(/_temp_[^_]+_[^_]+_/, `_${newSketch.id}_`);
                    console.log('[autoSave] Remapping:', oldKey, '->', newKey);
                    // FIX: Verwende Retry-Logik für Tablets
                    const imgData = await loadWithRetry(oldKey);
                    if (imgData) {
                      remapOps.push(saveImageToFile(newKey, imgData));
                      remapOps.push(deleteImageFile(oldKey));
                      return { ...el, data: { ...el.data, imageStorageKey: newKey } };
                    } else {
                      console.error('[autoSave] CRITICAL: Image not found after retries for key:', oldKey);
                      // Behalte den alten Key - lösche ihn NICHT
                      return el;
                    }
                  }
                  return el;
                }));
                await Promise.all(remapOps);
                // Metadata mit korrekten Keys speichern
                const finalMetadata = { ...lightMetadataForCreate, elements: updatedElements };
                await AsyncStorage.setItem(`sketch_meta_${newSketch.id}`, JSON.stringify(finalMetadata));
                console.log('[autoSave] Image keys migrated successfully');
              } catch (remapErr) {
                console.error('[autoSave] Error remapping image keys:', remapErr);
              }
            }
            
            // Hintergrundbild separat speichern (ohne JSON.stringify)
            if (saveBgImage && newSketch?.id) {
              await AsyncStorage.setItem(`sketch_bg_${newSketch.id}`, saveBgImage);
            }
            backgroundImageChangedRef.current = false;
            console.log('Saved new sketch in', Date.now() - startTime, 'ms');
          } catch (error) {
            console.error('Error saving new sketch:', error);
          }
        }
        
      } catch (error) {
        console.error('Error preparing sketch save:', error);
      }
    }
    
    // SOFORT zurück navigieren - Speichern läuft im Hintergrund
    console.log('=== NAVIGATION DEBUG v2 === handleBackPress calling router.back(), projectId:', projectId, 'sketchId:', sketchId);
    if (isMountedRef.current) {
      router.back();
    }
  };

  // Delete selected element (or entire angle group if part of one)
  const deleteSelectedElement = () => {
    if (selectedElementId) {
      // Prüfe ob das Element Teil einer Winkel-Gruppe ist
      const baseId = getAngleGroupBaseId(selectedElementId);
      
      let newElements: DrawElement[];
      let idsToDelete: string[];
      
      if (baseId) {
        // Es ist ein Winkel-Element - lösche die ganze Gruppe
        idsToDelete = getAngleGroupElementIds(baseId);
        newElements = elements.filter(el => !idsToDelete.includes(el.id));
      } else {
        // Normales Element - nur dieses löschen
        idsToDelete = [selectedElementId];
        newElements = elements.filter(el => el.id !== selectedElementId);
      }
      
      addToHistory(newElements);
      
      // Auch die Maße für diese Elemente löschen
      idsToDelete.forEach(id => {
        if (lineSegmentMeasurements[id]) {
          setLineSegmentMeasurements(prev => {
            const newMeasurements = { ...prev };
            delete newMeasurements[id];
            return newMeasurements;
          });
        }
      });
      
      setSelectedElementId(null);
      setMovingGroupBaseId(null);
      setOriginalGroupElements([]);
      setShowDeleteConfirm(false);
    }
  };

  // Farbe des ausgewählten Elements ändern
  const changeSelectedElementColor = (newColor: string) => {
    if (!selectedElementId) return;
    const newElements = elements.map(el => {
      if (el.id === selectedElementId) {
        return { ...el, color: newColor };
      }
      return el;
    });
    addToHistory(newElements);
  };

  // Linienstärke des ausgewählten Elements ändern
  const changeSelectedElementStrokeWidth = (newWidth: number) => {
    if (!selectedElementId) return;
    const newElements = elements.map(el => {
      if (el.id === selectedElementId) {
        return { ...el, strokeWidth: newWidth };
      }
      return el;
    });
    addToHistory(newElements);
  };

  // Stil-Editor schließen wenn Element deselektiert wird
  const selectedElementForStyle = selectedElementId ? elements.find(el => el.id === selectedElementId) : null;

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

  // Linie zu Pfeil umwandeln (und umgekehrt)
  const convertLineToArrow = () => {
    if (!selectedElementId) return;
    const element = elements.find(el => el.id === selectedElementId);
    if (!element) return;
    
    // Nur Linien und Pfeile können umgewandelt werden
    if (element.type !== 'line' && element.type !== 'arrow') {
      Alert.alert('Hinweis', 'Nur Linien und Pfeile können umgewandelt werden.');
      return;
    }
    
    const newType = element.type === 'line' ? 'arrow' : 'line';
    const newElements = elements.map(el => {
      if (el.id === selectedElementId) {
        return { ...el, type: newType as DrawElement['type'] };
      }
      return el;
    });
    
    addToHistory(newElements);
    console.log(`[convertLineToArrow] Converted ${element.type} to ${newType}`);
  };

  // Zuschneiden-Modus starten
  const startCropMode = async () => {
    const selectedEl = elements.find(el => el.id === selectedElementId);
    if (selectedEl && selectedEl.type === 'image') {
      // FIX: Lade Bild aus Datei-Storage wenn URI '__stored__' ist
      let imageUri = selectedEl.data?.uri;
      if (imageUri === '__stored__' && selectedEl.data?.imageStorageKey) {
        console.log('[startCropMode] Loading image from file storage:', selectedEl.data.imageStorageKey);
        try {
          const loadedUri = await loadImageFromFile(selectedEl.data.imageStorageKey);
          if (loadedUri && loadedUri.length > 100) {
            imageUri = loadedUri;
          } else {
            Alert.alert(t('common.error'), 'Das Bild konnte nicht geladen werden.');
            return;
          }
        } catch (err) {
          console.error('[startCropMode] Error loading image:', err);
          Alert.alert(t('common.error'), 'Fehler beim Laden des Bildes.');
          return;
        }
      }
      
      if (!imageUri || imageUri === '__stored__') {
        Alert.alert(t('common.error'), 'Kein Bild verfügbar.');
        return;
      }
      
      setCropImageUri(imageUri);
      setCropImageId(selectedEl.id);
      // Lade die Original-Bildgröße
      RNImage.getSize(
        imageUri,
        (imgWidth, imgHeight) => {
          setCropImageDimensions({ width: imgWidth, height: imgHeight });
          // FIX: Verwende dynamische Container-Größe für die Crop-Box-Initialisierung
          const containerSize = cropContainerSizeRef.current;
          const imgAspect = imgWidth / imgHeight;
          let dispW: number, dispH: number, offX: number, offY: number;
          if (imgAspect >= 1) {
            dispW = containerSize;
            dispH = containerSize / imgAspect;
            offX = 0;
            offY = (containerSize - dispH) / 2;
          } else {
            dispH = containerSize;
            dispW = containerSize * imgAspect;
            offX = (containerSize - dispW) / 2;
            offY = 0;
          }
          // Crop-Box = 80% des angezeigten Bildes, zentriert auf dem Bild
          const boxWidth = dispW * 0.8;
          const boxHeight = dispH * 0.8;
          const boxX = offX + (dispW - boxWidth) / 2;
          const boxY = offY + (dispH - boxHeight) / 2;
          setCropBox({ x: boxX, y: boxY, width: boxWidth, height: boxHeight });
          setShowCropModal(true);
        },
        (error) => {
          console.error('Error getting image size:', error);
          // Fallback mit dynamischer Container-Größe
          const size = cropContainerSizeRef.current;
          setCropImageDimensions({ width: size, height: size });
          setCropBox({ x: size * 0.1, y: size * 0.1, width: size * 0.8, height: size * 0.8 });
          setShowCropModal(true);
        }
      );
    } else {
      Alert.alert(t('common.note'), t('sketches.selectImageFirst'));
    }
  };

  // Handler für Crop-Modus Touch - sucht Bild an Position und öffnet Modal
  const handleCropModeTouch = async (locationX: number, locationY: number) => {
    // Suche nach einem Bild an dieser Position (onlyImages = true)
    const clickedImage = findElementAtPoint(locationX, locationY, true);
    
    if (clickedImage && clickedImage.type === 'image') {
      // FIX: Lade Bild aus Datei-Storage wenn URI '__stored__' ist
      let imageUri = clickedImage.data?.uri;
      if (imageUri === '__stored__' && clickedImage.data?.imageStorageKey) {
        console.log('[handleCropModeTouch] Loading image from file storage:', clickedImage.data.imageStorageKey);
        try {
          const loadedUri = await loadImageFromFile(clickedImage.data.imageStorageKey);
          if (loadedUri && loadedUri.length > 100) {
            imageUri = loadedUri;
          } else {
            Alert.alert(t('common.error'), 'Das Bild konnte nicht geladen werden.');
            return;
          }
        } catch (err) {
          console.error('[handleCropModeTouch] Error loading image:', err);
          Alert.alert(t('common.error'), 'Fehler beim Laden des Bildes.');
          return;
        }
      }
      
      if (!imageUri || imageUri === '__stored__') {
        Alert.alert(t('common.error'), 'Kein Bild verfügbar.');
        return;
      }
      
      // Bild gefunden - Crop-Modal öffnen
      setCropImageUri(imageUri);
      setCropImageId(clickedImage.id);
      
      // Lade die Original-Bildgröße
      RNImage.getSize(
        imageUri,
        (imgWidth, imgHeight) => {
          setCropImageDimensions({ width: imgWidth, height: imgHeight });
          // FIX: Verwende dynamische Container-Größe für die Crop-Box-Initialisierung
          const containerSize = cropContainerSizeRef.current;
          const imgAspect = imgWidth / imgHeight;
          let dispW: number, dispH: number, offX: number, offY: number;
          if (imgAspect >= 1) {
            dispW = containerSize;
            dispH = containerSize / imgAspect;
            offX = 0;
            offY = (containerSize - dispH) / 2;
          } else {
            dispH = containerSize;
            dispW = containerSize * imgAspect;
            offX = (containerSize - dispW) / 2;
            offY = 0;
          }
          // Crop-Box = 80% des angezeigten Bildes, zentriert auf dem Bild
          const boxWidth = dispW * 0.8;
          const boxHeight = dispH * 0.8;
          const boxX = offX + (dispW - boxWidth) / 2;
          const boxY = offY + (dispH - boxHeight) / 2;
          setCropBox({ x: boxX, y: boxY, width: boxWidth, height: boxHeight });
          setShowCropModal(true);
        },
        (error) => {
          console.error('Error getting image size:', error);
          // Fallback mit dynamischer Container-Größe
          const size = cropContainerSizeRef.current;
          setCropImageDimensions({ width: size, height: size });
          setCropBox({ x: size * 0.1, y: size * 0.1, width: size * 0.8, height: size * 0.8 });
          setShowCropModal(true);
        }
      );
    } else {
      // Kein Bild an dieser Position - Hinweis zeigen
      Alert.alert(t('common.note'), t('sketches.tapPhotoToCrop'));
    }
  };

  // Zuschnitt anwenden
  const applyCrop = async () => {
    if (!cropImageUri || !cropImageId) return;
    
    try {
      // FIX: Verwende die dynamische Container-Größe statt hardcoded 300
      const containerSize = cropContainerSizeRef.current;
      const imgWidth = cropImageDimensions.width;
      const imgHeight = cropImageDimensions.height;
      const imgAspect = imgWidth / imgHeight;
      const containerAspect = 1; // Container ist quadratisch
      
      console.log('[applyCrop] Container size:', containerSize, 'Image dimensions:', imgWidth, 'x', imgHeight);
      console.log('[applyCrop] CropBox:', cropBox);
      
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
      
      console.log('[applyCrop] Displayed size:', displayedWidth, 'x', displayedHeight, 'Offset:', offsetX, offsetY);
      
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
      
      console.log('[applyCrop] Crop coordinates:', { cropOriginX, cropOriginY, cropWidth, cropHeight });
      
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
        { compress: 0.6, format: ImageManipulator.SaveFormat.JPEG, base64: true }
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
      Alert.alert(t('common.error'), t('sketches.cropError'));
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
      });

      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        // Bild auf max. 1600px Breite reduzieren (verhindert OOM auf iPad)
        const manipResult = await ImageManipulator.manipulateAsync(
          asset.uri,
          [{ resize: { width: Math.min(asset.width || 1600, 1600) } }],
          { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG, base64: true }
        );
        if (manipResult.base64) {
          const base64Image = `data:image/jpeg;base64,${manipResult.base64}`;
          setBackgroundImage(base64Image);
          backgroundImageChangedRef.current = true;
        }
      }
    } catch (error) {
      console.error('Error picking image:', error);
      showAlert(t('common.error'), t('sketches.imageSelectError'));
    }
  };

  const takeBackgroundPhoto = async () => {
    try {
      if (Platform.OS !== 'web') {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') {
          showAlert(t('sketches.cameraPermission'), t('sketches.cameraPermissionMessage'));
          return;
        }
      }

      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: false,
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        // Bild auf max. 1600px Breite reduzieren (verhindert OOM auf iPad)
        const manipResult = await ImageManipulator.manipulateAsync(
          asset.uri,
          [{ resize: { width: Math.min(asset.width || 1600, 1600) } }],
          { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG, base64: true }
        );
        if (manipResult.base64) {
          const base64Image = `data:image/jpeg;base64,${manipResult.base64}`;
          setBackgroundImage(base64Image);
          backgroundImageChangedRef.current = true;
        }
      }
    } catch (error) {
      console.error('Error taking photo:', error);
      showAlert(t('common.error'), t('sketches.photoTakeError'));
    }
  };

  // Insert image on canvas
  const insertImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 0.7,
      });

      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        
        // Bild auf max. 1200px Breite reduzieren (verhindert OOM auf iPad)
        const manipResult = await ImageManipulator.manipulateAsync(
          asset.uri,
          [{ resize: { width: Math.min(asset.width || 1200, 1200) } }],
          { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG, base64: true }
        );
        
        if (!manipResult.base64) {
          throw new Error('Could not generate base64');
        }
        
        const base64Image = `data:image/jpeg;base64,${manipResult.base64}`;
        
        // Berechne korrektes Seitenverhältnis des Bildes
        const imgWidth = manipResult.width || 200;
        const imgHeight = manipResult.height || 200;
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
      showAlert(t('common.error'), t('sketches.imageInsertError'));
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

      // Wenn es ein PDF ist, öffne den PDF-Konverter (pdf.js via WebView)
      if (mimeType === 'application/pdf' || file.name?.toLowerCase().endsWith('.pdf')) {
        try {
          console.log('[importFromFiles] Loading PDF for conversion via pdf.js...');
          setPdfConversionLoading(true);
          
          // Lese PDF als Base64 mit dem neuen expo-file-system/next API
          const pdfFile = new File(fileUri);
          const base64 = await pdfFile.base64();
          const pdfDataUri = `data:application/pdf;base64,${base64}`;
          
          console.log('[importFromFiles] PDF loaded, base64 length:', base64.length);
          
          // Setze State und zeige Konverter-Modal
          setPdfBase64Data(pdfDataUri);
          setSelectedPdfPage(1);
          setPdfTotalPages(1); // Wird vom WebView aktualisiert
          setShowPdfConverter(true);
          setPdfConversionLoading(false);
          return;
        } catch (pdfError) {
          console.error('[importFromFiles] PDF loading error:', pdfError);
          setPdfConversionLoading(false);
          Alert.alert(
            'PDF Import',
            'Die PDF-Datei konnte nicht geladen werden. Bitte versuchen Sie es mit einer anderen Datei.',
            [{ text: 'OK', style: 'default' }]
          );
          return;
        }
      }

      // Wenn es ein Bild ist, füge es direkt ein
      if (mimeType.startsWith('image/')) {
        await insertImageFromUri(fileUri);
      } else {
        showAlert(t('common.error'), t('sketches.fileTypeNotSupported'));
      }
    } catch (error) {
      console.error('Error importing from files:', error);
      showAlert(t('common.error'), t('sketches.fileImportError'));
    }
  };
  
  // PDF WebView Message Handler - verarbeitet Nachrichten vom pdf.js WebView
  const handlePdfWebViewMessage = async (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      console.log('[PDF WebView] Message received:', data.type);
      
      if (data.type === 'pageCount') {
        setPdfTotalPages(data.count);
        console.log('[PDF WebView] Total pages:', data.count);
      } else if (data.type === 'pageRendered') {
        // PDF-Seite wurde als Bild gerendert - füge in Skizze ein
        console.log('[PDF WebView] Page rendered, inserting image...');
        setShowPdfConverter(false);
        setPdfBase64Data(null);
        
        // Das Bild direkt einfügen (data.imageData ist ein data:image/png;base64,... URI)
        await insertImageFromUri(data.imageData);
      } else if (data.type === 'error') {
        console.error('[PDF WebView] Error:', data.message);
        Alert.alert('PDF Fehler', data.message || 'Ein Fehler ist aufgetreten');
      }
    } catch (e) {
      console.error('[PDF WebView] Message parse error:', e);
    }
  };
  
  // Rendert die ausgewählte PDF-Seite und fügt sie als Bild ein
  const convertPdfPageToImage = () => {
    if (pdfWebViewRef.current) {
      console.log('[PDF] Converting page', selectedPdfPage, 'to image...');
      pdfWebViewRef.current.injectJavaScript(`renderPageAsImage(${selectedPdfPage}); true;`);
    }
  };
  
  // Generiert den HTML-Code für den PDF-Konverter WebView
  const getPdfConverterHtml = () => {
    if (!pdfBase64Data) return '<html><body></body></html>';
    
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
        <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { 
            background: #525659; 
            display: flex; 
            flex-direction: column; 
            align-items: center; 
            justify-content: center;
            min-height: 100vh;
            padding: 10px;
          }
          #preview-container {
            background: white;
            box-shadow: 0 4px 20px rgba(0,0,0,0.3);
            max-width: 100%;
            max-height: 80vh;
            overflow: hidden;
          }
          #preview-canvas {
            display: block;
            max-width: 100%;
            height: auto;
          }
          .loading {
            color: white;
            font-family: -apple-system, BlinkMacSystemFont, sans-serif;
            font-size: 16px;
            text-align: center;
          }
        </style>
      </head>
      <body>
        <div id="preview-container">
          <canvas id="preview-canvas"></canvas>
        </div>
        <p class="loading" id="status">Lade PDF...</p>
        <canvas id="export-canvas" style="display:none;"></canvas>
        
        <script>
          pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
          
          let pdf = null;
          let currentPage = 1;
          
          const pdfData = '${pdfBase64Data}';
          const base64 = pdfData.includes(',') ? pdfData.split(',')[1] : pdfData;
          
          // Konvertiere Base64 zu Uint8Array
          const binaryString = atob(base64);
          const bytes = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }
          
          // Lade PDF
          pdfjsLib.getDocument({ data: bytes }).promise.then(async loadedPdf => {
            pdf = loadedPdf;
            const numPages = pdf.numPages;
            window.ReactNativeWebView.postMessage(JSON.stringify({ 
              type: 'pageCount', 
              count: numPages 
            }));
            
            document.getElementById('status').textContent = 'Seite ' + currentPage + ' von ' + numPages;
            
            // Zeige erste Seite als Vorschau
            await showPagePreview(1);
          }).catch(err => {
            console.error('PDF load error:', err);
            document.getElementById('status').textContent = 'Fehler beim Laden';
            window.ReactNativeWebView.postMessage(JSON.stringify({ 
              type: 'error', 
              message: 'PDF konnte nicht geladen werden: ' + err.message 
            }));
          });
          
          // Zeigt Vorschau einer Seite
          async function showPagePreview(pageNum) {
            if (!pdf) return;
            try {
              currentPage = pageNum;
              const page = await pdf.getPage(pageNum);
              const viewport = page.getViewport({ scale: 1.5 });
              
              const canvas = document.getElementById('preview-canvas');
              const container = document.getElementById('preview-container');
              
              canvas.width = viewport.width;
              canvas.height = viewport.height;
              
              const ctx = canvas.getContext('2d');
              ctx.fillStyle = 'white';
              ctx.fillRect(0, 0, viewport.width, viewport.height);
              
              await page.render({ canvasContext: ctx, viewport: viewport }).promise;
              
              document.getElementById('status').textContent = 'Seite ' + pageNum + ' von ' + pdf.numPages + ' - Bereit zum Import';
            } catch (err) {
              console.error('Page preview error:', err);
            }
          }
          
          // Rendert Seite in hoher Qualität und sendet als Bild
          async function renderPageAsImage(pageNum) {
            if (!pdf) {
              window.ReactNativeWebView.postMessage(JSON.stringify({ 
                type: 'error', 
                message: 'PDF nicht geladen' 
              }));
              return;
            }
            
            try {
              document.getElementById('status').textContent = 'Konvertiere Seite ' + pageNum + '...';
              
              const page = await pdf.getPage(pageNum);
              // Hohe Auflösung für gute Bildqualität
              const scale = 2.5;
              const viewport = page.getViewport({ scale: scale });
              
              const canvas = document.getElementById('export-canvas');
              canvas.width = viewport.width;
              canvas.height = viewport.height;
              
              const ctx = canvas.getContext('2d');
              ctx.fillStyle = 'white';
              ctx.fillRect(0, 0, viewport.width, viewport.height);
              
              await page.render({ canvasContext: ctx, viewport: viewport }).promise;
              
              // Konvertiere zu JPEG für kleinere Dateigröße
              const imageData = canvas.toDataURL('image/jpeg', 0.9);
              
              window.ReactNativeWebView.postMessage(JSON.stringify({ 
                type: 'pageRendered', 
                imageData: imageData,
                width: viewport.width,
                height: viewport.height,
                pageNum: pageNum
              }));
            } catch (err) {
              console.error('Render error:', err);
              window.ReactNativeWebView.postMessage(JSON.stringify({ 
                type: 'error', 
                message: 'Seite konnte nicht gerendert werden: ' + err.message 
              }));
            }
          }
          
          // Navigation zwischen Seiten (wird von React Native aufgerufen)
          window.showPage = function(pageNum) {
            if (pageNum >= 1 && pageNum <= pdf.numPages) {
              showPagePreview(pageNum);
            }
          };
        </script>
      </body>
      </html>
    `;
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
      showAlert(t('common.error'), t('sketches.imageImportError'));
    }
  };

  // Helper function to insert image from URI
  const insertImageFromUri = async (uri: string) => {
    try {
      let base64Image: string;
      let imgWidth: number;
      let imgHeight: number;
      
      // Prüfe, ob das Bild bereits ein base64 data-URI ist
      if (uri.startsWith('data:image/')) {
        console.log('[insertImageFromUri] Image is already base64, using directly');
        base64Image = uri;
        
        // Versuche, die Bildgröße zu ermitteln (kann fehlschlagen bei base64)
        try {
          // Für base64-Bilder: verwende einen Schätzwert oder lade das Bild
          imgWidth = 800;
          imgHeight = 600;
          
          // Alternativ: Resize das base64-Bild für konsistente Größe
          const manipResult = await ImageManipulator.manipulateAsync(
            uri,
            [{ resize: { width: 800 } }],
            { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG, base64: true }
          );
          if (manipResult.base64) {
            base64Image = `data:image/jpeg;base64,${manipResult.base64}`;
            imgWidth = manipResult.width || 800;
            imgHeight = manipResult.height || 600;
          }
        } catch (resizeError) {
          console.log('[insertImageFromUri] Could not resize base64 image, using as-is:', resizeError);
          // Verwende das Original-base64 wenn Resize fehlschlägt
        }
      } else {
        // Normales Bild von URI - manipulieren
        const manipResult = await ImageManipulator.manipulateAsync(
          uri,
          [{ resize: { width: 800 } }],
          { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG, base64: true }
        );

        if (!manipResult.base64) {
          throw new Error('Konnte kein Base64 generieren');
        }

        base64Image = `data:image/jpeg;base64,${manipResult.base64}`;
        imgWidth = manipResult.width || 200;
        imgHeight = manipResult.height || 200;
      }
      
      // Berechne Seitenverhältnis
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
      
      showAlert(t('common.success'), t('sketches.imageInserted'));
    } catch (error) {
      console.error('Error inserting image from URI:', error);
      showAlert(t('common.error'), t('sketches.imageInsertError'));
    }
  };

  // Take photo and insert on canvas
  const takePhotoAndInsert = async () => {
    try {
      if (Platform.OS !== 'web') {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') {
          showAlert(t('sketches.cameraPermission'), t('sketches.cameraPermissionMessage'));
          return;
        }
      }

      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: false,
        quality: 0.7,
      });

      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        
        // Bild auf max. 1200px Breite reduzieren (verhindert OOM auf iPad)
        const manipResult = await ImageManipulator.manipulateAsync(
          asset.uri,
          [{ resize: { width: Math.min(asset.width || 1200, 1200) } }],
          { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG, base64: true }
        );
        
        if (!manipResult.base64) {
          throw new Error('Could not generate base64');
        }
        
        const base64Image = `data:image/jpeg;base64,${manipResult.base64}`;
        
        // Berechne korrektes Seitenverhältnis des Bildes
        const imgWidth = manipResult.width || 250;
        const imgHeight = manipResult.height || 250;
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
      showAlert(t('common.error'), t('sketches.photoTakeError'));
    }
  };

  // Touch handlers
  // Hilfsfunktion: Berechnet Distanz zwischen zwei Touch-Punkten (für Pinch-Zoom)
  const getDistance = (touches: any[]) => {
    if (touches.length < 2) return 0;
    const dx = touches[0].pageX - touches[1].pageX;
    const dy = touches[0].pageY - touches[1].pageY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  // Hilfsfunktion: Konvertiert Touch-Koordinaten zu Canvas-Koordinaten
  // WICHTIG: Plattformspezifische Logik!
  // - iOS mit ScrollView Zoom: Koordinaten müssen durch scale geteilt werden
  // - Android mit Animated.View Transform: Koordinaten sind bereits korrekt (nicht teilen!)
  const getCanvasCoordinates = (touch: any): { x: number; y: number } => {
    if (Platform.OS === 'ios') {
      // iOS: ScrollView Zoom erfordert Division durch scale
      return {
        x: touch.locationX / scale,
        y: touch.locationY / scale,
      };
    } else {
      // Android/Web: Animated.View Transform - Koordinaten sind bereits korrekt
      return {
        x: touch.locationX,
        y: touch.locationY,
      };
    }
  };

  const onTouchStart = (event: any) => {
    const touches = event.nativeEvent.touches;
    if (!touches || touches.length === 0) return;
    
    // Debug-Log
    console.log('[TouchStart] touches:', touches.length, 'drawingEnabled:', drawingEnabled, 'isZooming:', isZooming, 'scale:', scale);
    
    // === 2+ Finger = Pinch-to-Zoom (beide Finger gleichzeitig aufgesetzt) ===
    if (touches.length >= 2) {
      setIsZooming(true);
      setIsPanning(false);
      setInitialPinchDistance(getDistance(touches));
      setLastScale(scale);
      setLastPanOffset({ ...panOffset });
      // Falls Zeichnung bereits begonnen: verwerfen
      if (currentPath) setCurrentPath('');
      currentPathRef.current = '';
      return;
    }
    
    // === 1 Finger + Zoom-Modus (nicht Zeichnen) + gezoomt = Pan ===
    if (touches.length === 1 && !drawingEnabled && scale > 1.05) {
      const touch = touches[0];
      setIsPanning(true);
      setPanStart({ x: touch.pageX, y: touch.pageY });
      setLastPanOffset({ ...panOffset });
      console.log('[TouchStart] Pan-Modus gestartet');
      return;
    }
    
    // === 1 Finger + NICHT zoomen + Zeichnen aktiviert = Zeichnen ===
    if (touches.length === 1 && !isZooming && drawingEnabled) {
      const touch = touches[0];
      // Plattformspezifische Koordinaten-Berechnung
      const { x: locationX, y: locationY } = getCanvasCoordinates(touch);

      if (drawMode === 'select') {
        handleSelectTouchStart(locationX, locationY);
      } else if (drawMode === 'crop') {
        handleCropModeTouch(locationX, locationY);
      } else if (drawMode === 'text') {
        setPendingPosition({ x: locationX, y: locationY });
        setShowTextModal(true);
      } else if (drawMode === 'pen') {
        const pathStart = `M ${locationX} ${locationY}`;
        currentPathRef.current = pathStart;
        drawPointCountRef.current = 0;
        setCurrentPath(pathStart);
      } else if (drawMode === 'polygon') {
        setCurrentPath(`M ${locationX} ${locationY}`);
      } else if (drawMode === 'polyline') {
        const snappedPoint = snapPointToAngle(locationX, locationY);
        const newPoint = { x: snappedPoint.x, y: snappedPoint.y };
        
        if (polylinePoints.length >= 3) {
          const firstPoint = polylinePoints[0];
          const distance = Math.sqrt(
            Math.pow(snappedPoint.x - firstPoint.x, 2) + 
            Math.pow(snappedPoint.y - firstPoint.y, 2)
          );
          
          if (distance < 30) {
            finishPolyline(true);
            return;
          }
        }
        
        setPolylinePoints([...polylinePoints, newPoint]);
      } else if (drawMode === 'addPoint') {
        handleAddPointTouch(locationX, locationY);
      } else if (drawMode === 'removePoint') {
        handleRemovePointTouch(locationX, locationY);
      } else {
        setStartPoint({ x: locationX, y: locationY });
      }
    }
  };

  // Handler für addPoint Modus - fügt Punkt zu bestehender Polyline hinzu
  const handleAddPointTouch = (x: number, y: number) => {
    // Zuerst: Prüfe ob eine Polyline ausgewählt ist
    if (!selectedElementId) {
      showAlert(t('common.note'), t('sketches.selectPolylineFirst'));
      return;
    }
    
    const selectedEl = elements.find(el => el.id === selectedElementId);
    if (!selectedEl || selectedEl.type !== 'polyline') {
      showAlert(t('common.note'), t('sketches.selectPolyline'));
      return;
    }
    
    const points = selectedEl.data?.points;
    if (!points || points.length < 2) {
      showAlert(t('common.note'), t('sketches.invalidPolyline'));
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
      
      // Bemaßungs-Indizes aktualisieren: Segment wird geteilt → Indizes nach dem Split verschieben
      setLineSegmentMeasurements(prev => {
        const elementMeasurements = prev[selectedElementId];
        if (!elementMeasurements) return prev;
        
        const isClosingSegment = closestSegment === points.length - 1 && selectedEl.data.closed;
        const newMeasurements: { [segmentIndex: number]: string } = {};
        
        for (const [key, value] of Object.entries(elementMeasurements)) {
          const oldIdx = parseInt(key);
          
          if (isClosingSegment) {
            // Schließende Kante geteilt: altes Schließsegment-Maß löschen, Rest bleibt gleich
            if (oldIdx === closestSegment) continue; // Altes Schließsegment-Maß entfernen
            newMeasurements[oldIdx] = value;
          } else if (oldIdx === closestSegment) {
            // Geteiltes Segment: altes Maß löschen (Benutzer muss neue Maße für die 2 neuen Segmente eingeben)
            continue;
          } else if (oldIdx > closestSegment) {
            // Segmente nach dem Split: Index um 1 erhöhen
            newMeasurements[oldIdx + 1] = value;
          } else {
            // Segmente vor dem Split: Index bleibt gleich
            newMeasurements[oldIdx] = value;
          }
        }
        
        if (Object.keys(newMeasurements).length === 0) {
          const newAll = { ...prev };
          delete newAll[selectedElementId];
          return newAll;
        }
        
        return { ...prev, [selectedElementId]: newMeasurements };
      });
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
      showAlert(t('common.note'), t('sketches.selectPolylineFirst'));
      return;
    }
    
    const selectedEl = elements.find(el => el.id === selectedElementId);
    if (!selectedEl || selectedEl.type !== 'polyline') {
      showAlert(t('common.note'), t('sketches.selectPolyline'));
      return;
    }
    
    const points = selectedEl.data?.points;
    if (!points || points.length < 3) {
      showAlert(t('common.note'), t('sketches.polylineMinPoints'));
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
      
      // Bemaßungen aktualisieren: Gelöschte Segmente entfernen und Indizes neu zuordnen
      setLineSegmentMeasurements(prev => {
        const elementMeasurements = prev[selectedElementId];
        if (!elementMeasurements) return prev;
        
        const isClosed = selectedEl.data?.closed;
        const numPoints = points.length;
        const numSegments = isClosed ? numPoints : numPoints - 1;
        
        // Bestimme betroffene (gelöschte) Segment-Indizes
        const affectedSegments = new Set<number>();
        if (closestIndex > 0) {
          affectedSegments.add(closestIndex - 1); // Segment das am gelöschten Punkt endet
        }
        if (closestIndex < numPoints - 1) {
          affectedSegments.add(closestIndex); // Segment das am gelöschten Punkt startet
        }
        if (isClosed) {
          if (closestIndex === 0) {
            affectedSegments.add(numSegments - 1); // Schließendes Segment endet bei Punkt 0
            affectedSegments.add(0); // Segment startet bei Punkt 0
          }
          if (closestIndex === numPoints - 1) {
            affectedSegments.add(numSegments - 1); // Letztes Segment (schließend)
            affectedSegments.add(closestIndex - 1); // Segment davor
          }
        }
        
        // Neue Bemaßungen mit verschobenen Indizes erstellen
        const newMeasurements: { [segmentIndex: number]: string } = {};
        
        for (const [key, value] of Object.entries(elementMeasurements)) {
          const oldIdx = parseInt(key);
          
          // Betroffene Segmente überspringen (gelöschte Bemaßungen)
          if (affectedSegments.has(oldIdx)) continue;
          
          // Neuen Index berechnen: Segmente nach dem gelöschten Punkt verschieben sich um 1
          let newIdx = oldIdx;
          if (isClosed && closestIndex === 0) {
            // Erster Punkt bei geschlossenem Polygon: alle Indizes um 1 nach unten
            newIdx = oldIdx - 1;
          } else if (oldIdx > closestIndex) {
            // Segmente nach dem gelöschten Punkt: Index um 1 reduzieren
            newIdx = oldIdx - 1;
          }
          
          if (newIdx >= 0) {
            newMeasurements[newIdx] = value;
          }
        }
        
        // Wenn keine Bemaßungen mehr übrig → Element-Eintrag komplett löschen
        if (Object.keys(newMeasurements).length === 0) {
          const newAll = { ...prev };
          delete newAll[selectedElementId];
          return newAll;
        }
        
        return { ...prev, [selectedElementId]: newMeasurements };
      });
    }
  };

  const onTouchMove = (event: any) => {
    const touches = event.nativeEvent.touches;
    if (!touches || touches.length === 0) return;
    
    // === 2+ Finger = Pinch-to-Zoom ===
    if (touches.length >= 2) {
      // FIX: Falls Nutzer Finger sequenziell aufsetzt (häufiger Fall!),
      // onTouchStart feuert nur bei 1 Finger → initialPinchDistance ist null.
      // Wir initialisieren Pinch hier beim ersten 2-Finger-Frame.
      if (!initialPinchDistance) {
        setIsZooming(true);
        setIsPanning(false);
        setInitialPinchDistance(getDistance(touches));
        setLastScale(scale);
        setLastPanOffset({ ...panOffset });
        // Falls Zeichnung begonnen: verwerfen (User wollte zoomen, nicht zeichnen)
        if (currentPath) setCurrentPath('');
        currentPathRef.current = '';
        return;
      }
      // Handle pinch zoom
      const currentDistance = getDistance(touches);
      const newScale = Math.min(Math.max(lastScale * (currentDistance / initialPinchDistance), 0.5), 4);
      setScale(newScale);
      return;
    }
    
    // === 1 Finger + Panning aktiv = Canvas verschieben ===
    if (touches.length === 1 && isPanning && !drawingEnabled) {
      const touch = touches[0];
      const dx = touch.pageX - panStart.x;
      const dy = touch.pageY - panStart.y;
      
      // Neue Pan-Position berechnen (mit Begrenzung)
      const maxPanX = (scale - 1) * screenWidth / 2;
      const maxPanY = (scale - 1) * canvasHeight / 2;
      
      const newPanX = Math.min(maxPanX, Math.max(-maxPanX, lastPanOffset.x + dx));
      const newPanY = Math.min(maxPanY, Math.max(-maxPanY, lastPanOffset.y + dy));
      
      setPanOffset({ x: newPanX, y: newPanY });
      return;
    }
    
    // === 1 Finger + NICHT zoomen + Zeichnen aktiviert = Zeichnen ===
    if (touches.length === 1 && !isZooming && drawingEnabled) {
      const touch = touches[0];
      // Plattformspezifische Koordinaten-Berechnung
      const { x: locationX, y: locationY } = getCanvasCoordinates(touch);

      if (drawMode === 'select' && dragMode && originalElement && dragStart) {
        handleSelectTouchMove(locationX, locationY);
      } else if (drawMode === 'pen' && currentPathRef.current) {
        // Füge Punkt zum Ref hinzu (keine Re-Renders)
        currentPathRef.current = `${currentPathRef.current} L ${locationX} ${locationY}`;
        drawPointCountRef.current++;
        
        // Aktualisiere State nur alle 3 Punkte für visuelles Feedback
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
    }
  };

  const onTouchEnd = (event: any) => {
    const touches = event.nativeEvent.touches;
    
    // === Zoom-Status zurücksetzen ===
    if (touches.length < 2) {
      setIsZooming(false);
      setInitialPinchDistance(null);
    }
    
    // === Pan-Status zurücksetzen ===
    if (touches.length === 0) {
      setIsPanning(false);
    }
    
    // === Zeichnung abschließen wenn alle Finger gehoben und Zeichnen aktiv ===
    if (touches.length === 0 && drawingEnabled && !isZooming) {
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
      } else if (drawMode === 'select' && angleEditMode) {
        // Winkelgruppen-Bearbeitung (Drehen/Verlängern) abgeschlossen
        addToHistory(elements);
        setAngleEditMode(null);
        setAngleEditBaseId(null);
        setAngleEditOriginals([]);
        setDragStart(null);
      } else if (drawMode === 'select' && dragMode) {
        // Finish transform - add to history if elements changed
        if (editingPolylinePoint !== null) {
          // Save polyline point edit to history
          addToHistory(elements);
          
          // Automatisch Maß-Eingabe öffnen für das bearbeitete Segment
          const editedPointIdx = editingPolylinePoint;
          const polyEl = elements.find(el => el.id === selectedElementId);
          if (polyEl && polyEl.type === 'polyline' && polyEl.data?.points) {
            const points = polyEl.data.points;
            const segmentIdx = editedPointIdx > 0 ? editedPointIdx - 1 : 0;
            if (segmentIdx < points.length - 1) {
              setSelectedLineSegment({ elementId: polyEl.id, segmentIndex: segmentIdx });
              const existingStyle = measureLineStyles[polyEl.id];
              setTempMeasureLineColor(existingStyle?.color || '#1976d2');
              setTempMeasureLineStrokeWidth(existingStyle?.strokeWidth || 1.2);
              setTempMeasureLineFontSize(existingStyle?.fontSize || 11);
              setLineMeasurementExpression('');
              setShowLineMeasurementNumpad(true);
              setTimeout(() => lineMeasurementInputRef.current?.focus(), 100);
            }
          }
        } else if (movingGroupBaseId && originalGroupElements.length > 0) {
          addToHistory(elements);
        }
        setEditingPolylinePoint(null);
        setDragMode(null);
        setResizeHandle(null);
        setDragStart(null);
        setOriginalElement(null);
        setOriginalGroupElements([]);
        setMovingGroupBaseId(null);
        setShowMagnifier(false);
        setMagnifierPosition(null);
        setMagnifierTargetPosition(null);
        setMagnifierSnapshot(null);
      } else if (drawMode === 'select' && draggingLabelId) {
        setDraggingLabelId(null);
      } else if (startPoint && drawMode === 'arrow') {
        const touch = event.nativeEvent.changedTouches ? event.nativeEvent.changedTouches[0] : event.nativeEvent;
        // Plattformspezifische Koordinaten-Berechnung
        const { x: locationX, y: locationY } = getCanvasCoordinates(touch);
        
        setPendingArrow({ x1: startPoint.x, y1: startPoint.y, x2: locationX, y2: locationY });
        setShowArrowModal(true);
        setStartPoint(null);
        setTempElement(null);
      } else if (startPoint && drawMode === 'pointer') {
        const touch = event.nativeEvent.changedTouches ? event.nativeEvent.changedTouches[0] : event.nativeEvent;
        // Plattformspezifische Koordinaten-Berechnung
        const { x: locationX, y: locationY } = getCanvasCoordinates(touch);
        
        setPendingPointer({ x1: startPoint.x, y1: startPoint.y, x2: locationX, y2: locationY });
        setPointerText('');
        setShowPointerModal(true);
        setStartPoint(null);
        setTempElement(null);
      } else if (startPoint && drawMode === 'memo') {
        const touch = event.nativeEvent.changedTouches ? event.nativeEvent.changedTouches[0] : event.nativeEvent;
        // Plattformspezifische Koordinaten-Berechnung
        const { x: locationX, y: locationY } = getCanvasCoordinates(touch);
        
        setPendingMemo({ x1: startPoint.x, y1: startPoint.y, x2: locationX, y2: locationY });
        setMemoText('');
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

  // Winkeleinrastung: Punkt auf den nächsten Vielfachen des Snap-Winkels einrasten
  const snapPointToAngle = (newX: number, newY: number): { x: number; y: number } => {
    // Erst Raster-Einrastung anwenden
    let snappedX = newX;
    let snappedY = newY;
    
    if (gridSnapEnabled && showGrid && gridSize > 0) {
      snappedX = Math.round(newX / gridSize) * gridSize;
      snappedY = Math.round(newY / gridSize) * gridSize;
    }
    
    if (!angleSnapEnabled || polylinePoints.length === 0) {
      return { x: snappedX, y: snappedY };
    }
    
    const lastPoint = polylinePoints[polylinePoints.length - 1];
    const dx = snappedX - lastPoint.x;
    const dy = snappedY - lastPoint.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    if (distance < 5) return { x: snappedX, y: snappedY }; // Zu kurz, kein Snap
    
    // Aktuellen Winkel berechnen (in Grad, 0° = rechts, gegen Uhrzeigersinn)
    let currentAngle = Math.atan2(-dy, dx) * (180 / Math.PI); // -dy weil Y nach unten zeigt
    
    // Basiswinkel bestimmen
    let baseAngle = 0;
    if (polylinePoints.length >= 2) {
      // Winkel des vorherigen Segments als Basis
      const prevPoint = polylinePoints[polylinePoints.length - 2];
      const prevDx = lastPoint.x - prevPoint.x;
      const prevDy = lastPoint.y - prevPoint.y;
      baseAngle = Math.atan2(-prevDy, prevDx) * (180 / Math.PI);
    }
    
    // Relativen Winkel berechnen und auf Snap-Wert runden
    const relativeAngle = currentAngle - baseAngle;
    const snapAngleRad = angleSnapValue;
    const snappedRelative = Math.round(relativeAngle / snapAngleRad) * snapAngleRad;
    const snappedAbsolute = (baseAngle + snappedRelative) * (Math.PI / 180);
    
    // Neuen Punkt berechnen
    let resultX = lastPoint.x + distance * Math.cos(snappedAbsolute);
    let resultY = lastPoint.y - distance * Math.sin(snappedAbsolute); // -sin weil Y nach unten
    
    // Bei Raster+Winkel: Entfernung auf nächstes Raster-Vielfaches in der Winkelrichtung einrasten
    if (gridSnapEnabled && showGrid && gridSize > 0) {
      const gridDistance = Math.round(distance / gridSize) * gridSize;
      if (gridDistance > 0) {
        resultX = lastPoint.x + gridDistance * Math.cos(snappedAbsolute);
        resultY = lastPoint.y - gridDistance * Math.sin(snappedAbsolute);
      }
    }
    
    return { x: resultX, y: resultY };
  };

  const [pendingPosition, setPendingPosition] = useState<{ x: number; y: number } | null>(null);
  const [pendingArrow, setPendingArrow] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const [pendingPointer, setPendingPointer] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const [pendingMemo, setPendingMemo] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const [showMemoModal, setShowMemoModal] = useState(false);
  const [memoText, setMemoText] = useState('');
  const memoInputRef = useRef<TextInput>(null);
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
            setOriginalElement(deepCloneElement(selectedEl));
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
              setOriginalElement(deepCloneElement(selectedEl));
              
              // Lupe aktivieren für Polygon-Eckpunkte
              setMagnifierTargetPosition({ x: pt.x, y: pt.y });
              setMagnifierPosition({ x: locationX + (canvasLayout?.x || 0), y: locationY + (canvasLayout?.y || 0) });
              
              // Canvas-Snapshot für Lupe erstellen
              if (canvasRef.current) {
                captureRef(canvasRef.current, {
                  format: 'png',
                  quality: 1.0,
                  result: 'data-uri',
                }).then((uri: string) => {
                  setMagnifierSnapshot(uri);
                  setShowMagnifier(true);
                }).catch((err: Error) => {
                  console.log('Snapshot error:', err);
                  // Fallback: Lupe ohne Snapshot zeigen
                  setShowMagnifier(true);
                });
              } else {
                setShowMagnifier(true);
              }
              
              return;
            }
          }
        }
        
        const handle = checkTransformHandles(selectedEl, locationX, locationY);
        if (handle) {
          // Winkelgruppen-Bearbeitungsmodus (Drehen/Verlängern)
          if (handle.type === 'angle-rotate' || handle.type === 'angle-adjust') {
            const baseId = getAngleGroupBaseId(selectedEl.id);
            const groupIds = getAngleGroupElementIds(baseId);
            const originals = elements.filter(el => groupIds.includes(el.id)).map(el => deepCloneElement(el));
            setAngleEditMode(handle.type === 'angle-rotate' ? 'rotate' : 'adjust');
            setAngleEditBaseId(baseId);
            setAngleEditOriginals(originals);
            setDragStart({ x: locationX, y: locationY });
            return;
          }
          
          setDragMode(handle.type === 'rotate' ? 'rotate' : 'resize');
          setResizeHandle(handle.handle);
          setDragStart({ x: locationX, y: locationY });
          setOriginalElement(deepCloneElement(selectedEl));
          
          // Lupe aktivieren für Maßlinien-Endpunkte (start/end handles)
          if ((selectedEl.type === 'line' || selectedEl.type === 'arrow' || selectedEl.type === 'pointer' || selectedEl.type === 'memo') &&
              (handle.handle === 'start' || handle.handle === 'end')) {
            // Position des Zielpunktes setzen
            const targetX = handle.handle === 'start' ? selectedEl.data.x1 : selectedEl.data.x2;
            const targetY = handle.handle === 'start' ? selectedEl.data.y1 : selectedEl.data.y2;
            setMagnifierTargetPosition({ x: targetX, y: targetY });
            setMagnifierPosition({ x: locationX + (canvasLayout?.x || 0), y: locationY + (canvasLayout?.y || 0) });
            
            // Canvas-Snapshot für Lupe erstellen
            if (canvasRef.current) {
              captureRef(canvasRef.current, {
                format: 'png',
                quality: 1.0,
                result: 'data-uri',
              }).then((uri: string) => {
                setMagnifierSnapshot(uri);
                setShowMagnifier(true);
              }).catch((err: Error) => {
                console.log('Snapshot error:', err);
                // Fallback: Lupe ohne Snapshot zeigen
                setShowMagnifier(true);
              });
            } else {
              setShowMagnifier(true);
            }
          }
          
          return;
        }
      }
    }

    // Reset polyline point editing when clicking elsewhere
    setEditingPolylinePoint(null);
    
    // Prüfe ob auf ein Polyline-Segment geklickt wurde (für Maß-Funktion)
    const segmentHit = findPolylineSegmentAtPoint(locationX, locationY);
    if (segmentHit) {
      // Segment gefunden - Maß-Eingabe DIREKT öffnen (ohne "Maß hinzufügen" Button)
      setSelectedLineSegment({ 
        elementId: segmentHit.element.id, 
        segmentIndex: segmentHit.segmentIndex 
      });
      setSelectedElementId(segmentHit.element.id);
      // Bestehende Stil-Einstellungen für dieses Element laden
      const existingStyle = measureLineStyles[segmentHit.element.id];
      setTempMeasureLineColor(existingStyle?.color || '#1976d2');
      setTempMeasureLineStrokeWidth(existingStyle?.strokeWidth || 1.2);
      setTempMeasureLineFontSize(existingStyle?.fontSize || 11);
      // Numpad direkt öffnen
      setLineMeasurementExpression('');
      setShowLineMeasurementNumpad(true);
      setTimeout(() => lineMeasurementInputRef.current?.focus(), 100);
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
      console.log('[DEBUG] Selected element:', clickedElement.type, clickedElement.id);
      
      // Polylines nur über Mittelpunkt oder Eckpunkte verschiebbar, nicht über die Fläche
      if (clickedElement.type !== 'polyline') {
        // WINKEL-GRUPPEN-LOGIK: Prüfe ob das Element Teil einer Winkel-Gruppe ist
        const baseId = getAngleGroupBaseId(clickedElement.id);
        if (baseId) {
          console.log('[DEBUG] Angle group element tapped:', clickedElement.id, 'baseId:', baseId);
          // Winkelgruppe: NICHT sofort den Verschiebungsmodus starten
          // Stattdessen nur auswählen, damit die Griff-Punkte sichtbar werden
          // Der Benutzer kann dann entweder einen Griff ziehen oder das Element verschieben
          // Verschiebung wird erst beim NÄCHSTEN Drag gestartet
          if (selectedElementId === clickedElement.id) {
            // Element war schon ausgewählt → Verschiebung starten
            console.log('[DEBUG] Angle group: starting move (already selected)');
            setDragMode('move');
            setDragStart({ x: locationX, y: locationY });
            setOriginalElement(deepCloneElement(clickedElement));
            const groupIds = getAngleGroupElementIds(baseId);
            const groupElements = elements.filter(el => groupIds.includes(el.id));
            setOriginalGroupElements(groupElements.map(el => deepCloneElement(el)));
            setMovingGroupBaseId(baseId);
          }
          // Erstes Tap → nur auswählen (Handles werden sichtbar)
        } else {
          // Kein Winkel-Element → normales Verschieben
          console.log('[DEBUG] Setting drag mode to move for:', clickedElement.type);
          setDragMode('move');
          setDragStart({ x: locationX, y: locationY });
          setOriginalElement(deepCloneElement(clickedElement));
          // Gruppen-State zurücksetzen
          setOriginalGroupElements([]);
          setMovingGroupBaseId(null);
        }
      }
    } else {
      setSelectedElementId(null);
      setOriginalGroupElements([]);
      setMovingGroupBaseId(null);
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
    
    if (!originalElement || !dragStart) {
      // Winkelgruppen-Bearbeitung (Drehen/Verlängern) - braucht kein originalElement
      if (angleEditMode && angleEditBaseId && dragStart) {
        const geo = getAngleGroupGeometry(angleEditBaseId, angleEditOriginals);
        if (!geo) return;
        
        if (angleEditMode === 'rotate') {
          // Blauen Linie-Endpunkt ziehen → Gesamte Rotation + Länge
          const newAngleRad = Math.atan2(locationY - geo.cy, locationX - geo.cx);
          const newLength = Math.max(30, Math.sqrt(
            Math.pow(locationX - geo.cx, 2) + Math.pow(locationY - geo.cy, 2)
          ));
          
          // Winkelversatz bleibt gleich (Winkel zwischen den Linien ändert sich nicht)
          const updatedElements = recalculateAngleGroup(
            angleEditBaseId,
            geo.cx, geo.cy,
            newAngleRad,
            newLength,
            geo.angleOffsetRad,
            geo.anglLineLength,
            false,
          );
          setElements(updatedElements);
        } else if (angleEditMode === 'adjust') {
          // Rote Linie-Endpunkt ziehen → Winkel anpassen + Länge
          const newAngleLineRad = Math.atan2(locationY - geo.cy, locationX - geo.cx);
          const newLength = Math.max(30, Math.sqrt(
            Math.pow(locationX - geo.cx, 2) + Math.pow(locationY - geo.cy, 2)
          ));
          
          // Neuer Winkelversatz = neue Richtung - Referenzlinie Richtung
          const newAngleOffset = newAngleLineRad - geo.refAngleRad;
          
          const updatedElements = recalculateAngleGroup(
            angleEditBaseId,
            geo.cx, geo.cy,
            geo.refAngleRad,
            geo.refLength,
            newAngleOffset,
            newLength,
            false,
          );
          setElements(updatedElements);
        }
        return;
      }
      return;
    }

    const dx = locationX - dragStart.x;
    const dy = locationY - dragStart.y;

    // WINKEL-GRUPPEN-BEWEGUNG: Wenn wir eine Gruppe verschieben
    if (movingGroupBaseId && originalGroupElements.length > 0 && dragMode === 'move') {
      const groupIds = getAngleGroupElementIds(movingGroupBaseId);
      
      const newElements = elements.map(el => {
        if (!groupIds.includes(el.id)) return el;
        
        // Finde das Original-Element
        const origEl = originalGroupElements.find(oe => oe.id === el.id);
        if (!origEl) return el;
        
        const newEl = { ...el };
        
        if (el.type === 'line') {
          // Linien (ref-line, angle-line)
          newEl.data = {
            ...el.data,
            x1: origEl.data.x1 + dx,
            y1: origEl.data.y1 + dy,
            x2: origEl.data.x2 + dx,
            y2: origEl.data.y2 + dy,
          };
        } else if (el.type === 'path') {
          // Bogen (arc) - SVG Pfad verschieben
          // Arc-Pfad hat Format: M x1 y1 A rx ry x-axis-rotation large-arc-flag sweep-flag x2 y2
          // Wir müssen M x1 y1 und die letzten x2 y2 vom A-Befehl verschieben
          const arcRegex = /M\s*(-?\d+\.?\d*)\s+(-?\d+\.?\d*)\s+A\s+(-?\d+\.?\d*)\s+(-?\d+\.?\d*)\s+(-?\d+\.?\d*)\s+(\d)\s+(\d)\s+(-?\d+\.?\d*)\s+(-?\d+\.?\d*)/;
          const arcMatch = origEl.data.match(arcRegex);
          if (arcMatch) {
            const [_, mx, my, rx, ry, xAxisRot, largeArc, sweep, ax, ay] = arcMatch;
            newEl.data = `M ${parseFloat(mx) + dx} ${parseFloat(my) + dy} A ${rx} ${ry} ${xAxisRot} ${largeArc} ${sweep} ${parseFloat(ax) + dx} ${parseFloat(ay) + dy}`;
          }
        } else if (el.type === 'text') {
          // Text
          newEl.x = (origEl.x || 0) + dx;
          newEl.y = (origEl.y || 0) + dy;
        }
        
        return newEl;
      });
      
      setElements(newElements);
      return;
    }

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
          
          // Lupe-Position aktualisieren für Polygon-Eckpunkte
          if (showMagnifier) {
            const currentPoint = originalElement.data.points[editingPolylinePoint];
            const newX = currentPoint.x + dx;
            const newY = currentPoint.y + dy;
            setMagnifierTargetPosition({ x: newX, y: newY });
            setMagnifierPosition({ x: locationX + (canvasLayout?.x || 0), y: locationY + (canvasLayout?.y || 0) });
          }
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
        } else if (el.type === 'angle') {
          // Move angle by shifting all 3 points
          if (originalElement.vertex && originalElement.point1 && originalElement.point2) {
            newEl.vertex = {
              x: originalElement.vertex.x + dx,
              y: originalElement.vertex.y + dy,
            };
            newEl.point1 = {
              x: originalElement.point1.x + dx,
              y: originalElement.point1.y + dy,
            };
            newEl.point2 = {
              x: originalElement.point2.x + dx,
              y: originalElement.point2.y + dy,
            };
          }
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
            // Lupe-Position aktualisieren
            if (showMagnifier) {
              setMagnifierTargetPosition({ x: locationX, y: locationY });
              setMagnifierPosition({ x: locationX + (canvasLayout?.x || 0), y: locationY + (canvasLayout?.y || 0) });
            }
          } else if (resizeHandle === 'end') {
            newEl.data = { ...el.data, x2: locationX, y2: locationY };
            // Lupe-Position aktualisieren
            if (showMagnifier) {
              setMagnifierTargetPosition({ x: locationX, y: locationY });
              setMagnifierPosition({ x: locationX + (canvasLayout?.x || 0), y: locationY + (canvasLayout?.y || 0) });
            }
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
        } else if (el.type === 'text') {
          // Text-Resize: Schriftgröße basierend auf Drag-Distanz ändern
          const origFontSize = originalElement.fontSize || 20;
          const origX = originalElement.x || 0;
          const origY = originalElement.y || 0;
          
          // Berechne neue Schriftgröße basierend auf der Ziehrichtung
          // Diagonale Handles: Größer = beide Richtungen positiv
          let scaleFactor = 1;
          
          if (resizeHandle === 'bottom-right') {
            // Ziehen nach rechts-unten vergrößert
            scaleFactor = 1 + (dx + dy) / 200;
          } else if (resizeHandle === 'top-left') {
            // Ziehen nach links-oben vergrößert (umgekehrt)
            scaleFactor = 1 + (-dx - dy) / 200;
            // Position anpassen damit Text an gleicher Stelle bleibt
            const newFontSize = Math.max(8, Math.min(200, origFontSize * scaleFactor));
            const fontSizeDiff = newFontSize - origFontSize;
            newEl.y = origY + fontSizeDiff;
          } else if (resizeHandle === 'top-right') {
            // Ziehen nach rechts-oben vergrößert
            scaleFactor = 1 + (dx - dy) / 200;
            const newFontSize = Math.max(8, Math.min(200, origFontSize * scaleFactor));
            const fontSizeDiff = newFontSize - origFontSize;
            newEl.y = origY + fontSizeDiff;
          } else if (resizeHandle === 'bottom-left') {
            // Ziehen nach links-unten vergrößert
            scaleFactor = 1 + (-dx + dy) / 200;
          }
          
          // Neue Schriftgröße berechnen mit Mindest- und Maximalgröße
          const newFontSize = Math.max(8, Math.min(200, origFontSize * scaleFactor));
          newEl.fontSize = Math.round(newFontSize);
        } else if (el.type === 'angle') {
          // Winkel-Resize: Einzelne Punkte verschieben
          if (originalElement.vertex && originalElement.point1 && originalElement.point2) {
            if (resizeHandle === 'vertex') {
              // Scheitelpunkt verschieben - alle Punkte mitbewegen
              newEl.vertex = { x: locationX, y: locationY };
              newEl.point1 = {
                x: originalElement.point1.x + (locationX - originalElement.vertex.x),
                y: originalElement.point1.y + (locationY - originalElement.vertex.y),
              };
              newEl.point2 = {
                x: originalElement.point2.x + (locationX - originalElement.vertex.x),
                y: originalElement.point2.y + (locationY - originalElement.vertex.y),
              };
            } else if (resizeHandle === 'point1') {
              // Punkt 1 verschieben - NUR Länge ändern, Winkel bleibt fest!
              const v = originalElement.vertex;
              const p1 = originalElement.point1;
              
              // Aktuelle Richtung der Linie berechnen
              const dirX = p1.x - v.x;
              const dirY = p1.y - v.y;
              const currentLength = Math.sqrt(dirX * dirX + dirY * dirY);
              
              if (currentLength > 0) {
                // Einheitsvektor in Richtung der Linie
                const unitX = dirX / currentLength;
                const unitY = dirY / currentLength;
                
                // Neue Länge basierend auf Projektion des Mauszeigers auf die Linie
                const mouseVecX = locationX - v.x;
                const mouseVecY = locationY - v.y;
                const newLength = Math.max(30, mouseVecX * unitX + mouseVecY * unitY); // Mindestlänge 30
                
                // Neuer Punkt auf der gleichen Linie, nur andere Länge
                newEl.point1 = {
                  x: v.x + unitX * newLength,
                  y: v.y + unitY * newLength,
                };
              }
              // Winkel bleibt unverändert!
            } else if (resizeHandle === 'point2') {
              // Punkt 2 verschieben - NUR Länge ändern, Winkel bleibt fest!
              const v = originalElement.vertex;
              const p2 = originalElement.point2;
              
              // Aktuelle Richtung der Linie berechnen
              const dirX = p2.x - v.x;
              const dirY = p2.y - v.y;
              const currentLength = Math.sqrt(dirX * dirX + dirY * dirY);
              
              if (currentLength > 0) {
                // Einheitsvektor in Richtung der Linie
                const unitX = dirX / currentLength;
                const unitY = dirY / currentLength;
                
                // Neue Länge basierend auf Projektion des Mauszeigers auf die Linie
                const mouseVecX = locationX - v.x;
                const mouseVecY = locationY - v.y;
                const newLength = Math.max(30, mouseVecX * unitX + mouseVecY * unitY); // Mindestlänge 30
                
                // Neuer Punkt auf der gleichen Linie, nur andere Länge
                newEl.point2 = {
                  x: v.x + unitX * newLength,
                  y: v.y + unitY * newLength,
                };
              }
              // Winkel bleibt unverändert!
            }
            // Lupe aktualisieren
            if (showMagnifier) {
              setMagnifierTargetPosition({ x: locationX, y: locationY });
              setMagnifierPosition({ x: locationX + (canvasLayout?.x || 0), y: locationY + (canvasLayout?.y || 0) });
            }
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
        const elW = el.width || Math.max(textLength * fontSize * 0.6, 50); // Realistischere Breite
        const elH = fontSize * 1.2; // Höhe basierend auf Schriftgröße
        // Kleineres Padding für präzisere Auswahl (10px)
        const padding = 10;
        // Text sitzt auf der Baseline, also Box nach oben verschieben
        if (x >= elX - padding && x <= elX + elW + padding &&
            y >= elY - elH - padding && y <= elY + padding) {
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
      } else if (el.type === 'angle') {
        // Winkel-Element: Prüfe Nähe zu den Linien und dem Vertex
        if (el.vertex && el.point1 && el.point2) {
          const v = el.vertex;
          const p1 = el.point1;
          const p2 = el.point2;
          
          // Prüfe Nähe zum Vertex (Scheitelpunkt)
          const distToVertex = Math.sqrt(Math.pow(x - v.x, 2) + Math.pow(y - v.y, 2));
          if (distToVertex <= 20) return el;
          
          // Prüfe Nähe zu Linie 1 (Vertex -> Point1)
          const distToLine1 = distanceToLineSegment(x, y, v.x, v.y, p1.x, p1.y);
          if (distToLine1 < 15) return el;
          
          // Prüfe Nähe zu Linie 2 (Vertex -> Point2)
          const distToLine2 = distanceToLineSegment(x, y, v.x, v.y, p2.x, p2.y);
          if (distToLine2 < 15) return el;
          
          // Prüfe Nähe zu Point1 und Point2 Handles
          const distToP1 = Math.sqrt(Math.pow(x - p1.x, 2) + Math.pow(y - p1.y, 2));
          if (distToP1 <= 15) return el;
          
          const distToP2 = Math.sqrt(Math.pow(x - p2.x, 2) + Math.pow(y - p2.y, 2));
          if (distToP2 <= 15) return el;
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
  const checkTransformHandles = (element: DrawElement, x: number, y: number): { type: 'rotate' | 'resize' | 'angle-rotate' | 'angle-adjust', handle: string } | null => {
    const handleRadius = 15;
    
    // Winkelgruppen: Keine Endpunkt-Griffe - nur als Ganzes verschieben
    // Bearbeitung über "Winkel anpassen" Button
    if (isAngleGroupElement(element.id)) {
      return null; // Kein spezieller Handle, Standard-Verschiebung wird verwendet
    }
    
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
    } else if (element.type === 'text') {
      // Text-Element: Handles für Resize und Rotate
      const textX = element.x || 0;
      const textY = element.y || 0;
      const fontSize = element.fontSize || 20;
      const text = element.data?.text || '';
      
      // Berechne Textabmessungen (gleich wie in renderTransformHandles)
      const estimatedWidth = Math.max(text.length * fontSize * 0.6, 40);
      const estimatedHeight = fontSize * 1.2;
      
      const boxX = textX - 5;
      const boxY = textY - estimatedHeight;
      const boxWidth = estimatedWidth + 10;
      const boxHeight = estimatedHeight + 10;
      
      const handles = [
        { x: boxX, y: boxY, handle: 'top-left' },
        { x: boxX + boxWidth, y: boxY, handle: 'top-right' },
        { x: boxX, y: boxY + boxHeight, handle: 'bottom-left' },
        { x: boxX + boxWidth, y: boxY + boxHeight, handle: 'bottom-right' },
        { x: boxX + boxWidth / 2, y: boxY - 30, handle: 'rotate' },
      ];
      
      for (const h of handles) {
        if (Math.sqrt(Math.pow(x - h.x, 2) + Math.pow(y - h.y, 2)) < handleRadius) {
          return { type: h.handle === 'rotate' ? 'rotate' : 'resize', handle: h.handle };
        }
      }
    } else if (element.type === 'angle') {
      // Winkel-Element: Handles für Vertex, Point1, Point2
      if (element.vertex && element.point1 && element.point2) {
        const v = element.vertex;
        const p1 = element.point1;
        const p2 = element.point2;
        
        // Vertex-Handle (größer)
        if (Math.sqrt(Math.pow(x - v.x, 2) + Math.pow(y - v.y, 2)) < handleRadius + 5) {
          return { type: 'resize', handle: 'vertex' };
        }
        // Point1-Handle
        if (Math.sqrt(Math.pow(x - p1.x, 2) + Math.pow(y - p1.y, 2)) < handleRadius) {
          return { type: 'resize', handle: 'point1' };
        }
        // Point2-Handle
        if (Math.sqrt(Math.pow(x - p2.x, 2) + Math.pow(y - p2.y, 2)) < handleRadius) {
          return { type: 'resize', handle: 'point2' };
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
            {isSelected && renderTransformHandles(element)}
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
            {isSelected && renderTransformHandles(element)}
          </G>
        );
      
      case 'angle':
        // Winkel-Element mit 3 Punkten (Vertex, Point1, Point2)
        if (!element.vertex || !element.point1 || !element.point2) return null;
        
        const v = element.vertex;
        const p1 = element.point1;
        const p2 = element.point2;
        const angleValue = element.angle || 0;
        
        // Berechne Linien-Längen und Bogen
        const len1 = Math.sqrt(Math.pow(p1.x - v.x, 2) + Math.pow(p1.y - v.y, 2));
        const len2 = Math.sqrt(Math.pow(p2.x - v.x, 2) + Math.pow(p2.y - v.y, 2));
        const arcR = Math.min(len1, len2) * 0.3;
        
        // Winkel-Richtungen
        const ang1 = Math.atan2(p1.y - v.y, p1.x - v.x);
        const ang2 = Math.atan2(p2.y - v.y, p2.x - v.x);
        
        // Bogen-Punkte
        const arcX1 = v.x + arcR * Math.cos(ang1);
        const arcY1 = v.y + arcR * Math.sin(ang1);
        const arcX2 = v.x + arcR * Math.cos(ang2);
        const arcY2 = v.y + arcR * Math.sin(ang2);
        
        // Sweep-Richtung
        let angDiff = ang2 - ang1;
        while (angDiff < -Math.PI) angDiff += 2 * Math.PI;
        while (angDiff > Math.PI) angDiff -= 2 * Math.PI;
        const sweepFlag = angDiff > 0 ? 1 : 0;
        const largeArcFlag = angleValue > 180 ? 1 : 0;
        
        // Text-Position (Mitte des Bogens)
        const midAng = (ang1 + ang2) / 2;
        const textX = v.x + (arcR + 20) * Math.cos(midAng);
        const textY = v.y + (arcR + 20) * Math.sin(midAng);
        
        return (
          <G key={element.id}>
            {/* Referenzlinie */}
            <Line
              x1={v.x} y1={v.y}
              x2={p1.x} y2={p1.y}
              stroke={element.color}
              strokeWidth={element.strokeWidth}
            />
            {/* Winkellinie */}
            <Line
              x1={v.x} y1={v.y}
              x2={p2.x} y2={p2.y}
              stroke={element.color}
              strokeWidth={element.strokeWidth}
            />
            {/* Winkelbogen */}
            {angleValue > 0 && (
              <Path
                d={`M ${arcX1} ${arcY1} A ${arcR} ${arcR} 0 ${largeArcFlag} ${sweepFlag} ${arcX2} ${arcY2}`}
                stroke={element.color}
                strokeWidth={element.strokeWidth}
                fill="none"
              />
            )}
            {/* Winkeltext */}
            <SvgText
              x={textX}
              y={textY}
              fill={element.color}
              fontSize={16}
              fontWeight="bold"
              textAnchor="middle"
            >
              {angleValue}°
            </SvgText>
            {/* Auswahlrahmen */}
            {isSelected && (
              <>
                {/* Vertex-Handle */}
                <Circle cx={v.x} cy={v.y} r={10} fill={element.color} stroke="#fff" strokeWidth={2} />
                {/* Point1-Handle */}
                <Circle cx={p1.x} cy={p1.y} r={8} fill={element.color} stroke="#fff" strokeWidth={2} />
                {/* Point2-Handle */}
                <Circle cx={p2.x} cy={p2.y} r={8} fill={element.color} stroke="#fff" strokeWidth={2} />
              </>
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
        
        // Maßlinien-Stil für dieses Element (auf Element-Ebene definiert für Labels UND Maße)
        const elMeasureStyle = measureLineStyles[element.id] || { color: '#1976d2', strokeWidth: 1.2, fontSize: 11 };
        const elColor = elMeasureStyle.color;
        
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
              const baseStrokeWidth = elMeasureStyle.strokeWidth;
              const baseFontSize = elMeasureStyle.fontSize;
              
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
                    stroke={elColor}
                    strokeWidth={scaledStrokeWidth}
                  />
                  {/* End-Strich links */}
                  <Line
                    x1={p1.x + offsetX - Math.sin(angle) * scaledTickLength}
                    y1={p1.y + offsetY + Math.cos(angle) * scaledTickLength}
                    x2={p1.x + offsetX + Math.sin(angle) * scaledTickLength}
                    y2={p1.y + offsetY - Math.cos(angle) * scaledTickLength}
                    stroke={elColor}
                    strokeWidth={scaledStrokeWidth}
                  />
                  {/* End-Strich rechts */}
                  <Line
                    x1={p2.x + offsetX - Math.sin(angle) * scaledTickLength}
                    y1={p2.y + offsetY + Math.cos(angle) * scaledTickLength}
                    x2={p2.x + offsetX + Math.sin(angle) * scaledTickLength}
                    y2={p2.y + offsetY - Math.cos(angle) * scaledTickLength}
                    stroke={elColor}
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
                    fill={elColor}
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
              // Maßlinien-Farbe für dieses Element
              const labelColor = (measureLineStyles[element.id] || { color: '#1976d2' }).color;
              
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
                      stroke={labelColor}
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
                    fill={labelColor}
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
            {/* Mittelpunkt zum Verschieben des gesamten Polygons - größenangepasst */}
            {isSelected && points.length >= 2 && (() => {
              const centerX = points.reduce((sum: number, pt: { x: number }) => sum + pt.x, 0) / points.length;
              const centerY = points.reduce((sum: number, pt: { y: number }) => sum + pt.y, 0) / points.length;
              
              // Berechne Bounding Box für größenangepassten Handle
              let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
              points.forEach((pt: { x: number; y: number }) => {
                minX = Math.min(minX, pt.x);
                minY = Math.min(minY, pt.y);
                maxX = Math.max(maxX, pt.x);
                maxY = Math.max(maxY, pt.y);
              });
              const boxWidth = maxX - minX;
              const boxHeight = maxY - minY;
              const polygonSize = Math.min(boxWidth, boxHeight);
              
              // Handle-Größe: 15-25% der kleinsten Polygon-Dimension, mit Min/Max Grenzen
              const baseSize = polygonSize * 0.18;
              const scaledSize = baseSize / Math.max(scale, 0.5);
              const moveHandleSize = Math.max(12, Math.min(30, scaledSize)); // Min 12, Max 30
              
              return (
                <G key="move-handle">
                  {/* Äußerer Ring */}
                  <Circle 
                    cx={centerX} 
                    cy={centerY} 
                    r={moveHandleSize} 
                    fill="rgba(255, 152, 0, 0.25)" 
                    stroke="#FF9800" 
                    strokeWidth={Math.max(1, 2 / Math.max(scale, 0.5))} 
                  />
                  {/* Innerer Kreis */}
                  <Circle 
                    cx={centerX} 
                    cy={centerY} 
                    r={moveHandleSize * 0.55} 
                    fill="#FF9800" 
                    stroke="#fff" 
                    strokeWidth={Math.max(0.8, 1.5 / Math.max(scale, 0.5))} 
                  />
                  {/* Verschiebe-Symbol */}
                  <SvgText 
                    x={centerX} 
                    y={centerY + (moveHandleSize * 0.2)} 
                    fill="#fff" 
                    fontSize={moveHandleSize * 0.55}
                    textAnchor="middle"
                    fontWeight="bold"
                  >✥</SvgText>
                </G>
              );
            })()}
          </G>
        );
      
      default:
        return null;
    }
  };

  // Render transformation handles - mit dynamischer Skalierung basierend auf Zoom-Level
  const renderTransformHandles = (element: DrawElement) => {
    const handles: JSX.Element[] = [];
    
    // Skalierte Handle-Größen basierend auf Zoom-Level
    // Kleinere Basis-Werte für kompaktere Handles
    const baseHandleRadius = 5; // Kleiner als vorher (war 8)
    const baseRotateRadius = 6; // Kleiner als vorher (war 10)
    const baseStrokeWidth = 1.5;
    const baseFontSize = 8;
    const baseRotateFontSize = 10;
    
    // Skalierung: Bei Zoom > 1 werden Handles kleiner, bei Zoom < 1 werden sie größer
    const scaledHandleRadius = Math.max(3, baseHandleRadius / Math.max(scale, 0.5));
    const scaledRotateRadius = Math.max(4, baseRotateRadius / Math.max(scale, 0.5));
    const scaledStrokeWidth = Math.max(0.5, baseStrokeWidth / Math.max(scale, 0.5));
    const scaledFontSize = Math.max(5, baseFontSize / Math.max(scale, 0.5));
    const scaledRotateFontSize = Math.max(6, baseRotateFontSize / Math.max(scale, 0.5));
    const scaledRotateOffset = Math.max(15, 30 / Math.max(scale, 0.5));
    
    // Winkelgruppen: Nur einfache Auswahl-Markierung (verschieben als Ganzes)
    if (isAngleGroupElement(element.id)) {
      const baseId = getAngleGroupBaseId(element.id);
      const geo = baseId ? getAngleGroupGeometry(baseId) : null;
      
      if (geo) {
        const refEndX = geo.cx + geo.refLength * Math.cos(geo.refAngleRad);
        const refEndY = geo.cy + geo.refLength * Math.sin(geo.refAngleRad);
        const angleEndX = geo.cx + geo.anglLineLength * Math.cos(geo.angleLineRad);
        const angleEndY = geo.cy + geo.anglLineLength * Math.sin(geo.angleLineRad);
        const strokeW = Math.max(2, 3 / Math.max(scale, 0.5));
        const centerSize = Math.max(8, 12 / Math.max(scale, 0.5));
        
        // Auswahl-Rahmen: Gestrichelte Linien
        handles.push(
          <Line key="angle-ref-dash" x1={geo.cx} y1={geo.cy} x2={refEndX} y2={refEndY} 
            stroke="rgba(33,150,243,0.5)" strokeWidth={strokeW * 2} strokeDasharray={`${8/Math.max(scale,0.5)},${4/Math.max(scale,0.5)}`} />
        );
        handles.push(
          <Line key="angle-adj-dash" x1={geo.cx} y1={geo.cy} x2={angleEndX} y2={angleEndY} 
            stroke="rgba(244,67,54,0.5)" strokeWidth={strokeW * 2} strokeDasharray={`${8/Math.max(scale,0.5)},${4/Math.max(scale,0.5)}`} />
        );
        
        // Verschiebe-Griff am Mittelpunkt
        handles.push(
          <G key="angle-center">
            <Circle cx={geo.cx} cy={geo.cy} r={centerSize} fill="rgba(255,255,255,0.9)" stroke="#FF5722" strokeWidth={strokeW} />
            <SvgText x={geo.cx} y={geo.cy + centerSize * 0.35} fill="#FF5722" fontSize={centerSize * 0.8} textAnchor="middle" fontWeight="bold">✥</SvgText>
          </G>
        );
      }
      return <G>{handles}</G>;
    }
    
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
            <Circle cx={pos.x} cy={pos.y} r={scaledHandleRadius} fill="#4caf50" stroke="#fff" strokeWidth={scaledStrokeWidth} />
            <SvgText x={pos.x - scaledFontSize * 0.4} y={pos.y + scaledFontSize * 0.5} fill="#fff" fontSize={scaledFontSize}>{pos.label}</SvgText>
          </G>
        );
      });
      
      // Rotation handle
      handles.push(
        <G key="rotate">
          <Circle cx={x + w / 2} cy={y - scaledRotateOffset} r={scaledRotateRadius} fill="#FF9800" stroke="#fff" strokeWidth={scaledStrokeWidth} />
          <SvgText x={x + w / 2 - scaledRotateFontSize * 0.4} y={y - scaledRotateOffset + scaledRotateFontSize * 0.4} fill="#fff" fontSize={scaledRotateFontSize}>↻</SvgText>
        </G>
      );
    } else if (element.type === 'circle') {
      const { cx, cy, r } = element.data;
      handles.push(
        <G key="radius">
          <Circle cx={cx + r} cy={cy} r={scaledHandleRadius} fill="#4caf50" stroke="#fff" strokeWidth={scaledStrokeWidth} />
          <SvgText x={cx + r - scaledFontSize * 0.4} y={cy + scaledFontSize * 0.5} fill="#fff" fontSize={scaledFontSize}>↔</SvgText>
        </G>
      );
      handles.push(
        <G key="rotate">
          <Circle cx={cx} cy={cy - r - scaledRotateOffset} r={scaledRotateRadius} fill="#FF9800" stroke="#fff" strokeWidth={scaledStrokeWidth} />
          <SvgText x={cx - scaledRotateFontSize * 0.4} y={cy - r - scaledRotateOffset + scaledRotateFontSize * 0.4} fill="#fff" fontSize={scaledRotateFontSize}>↻</SvgText>
        </G>
      );
    } else if (element.type === 'line' || element.type === 'arrow' || element.type === 'pointer' || element.type === 'memo') {
      const { x1, y1, x2, y2 } = element.data;
      handles.push(
        <Circle key="start" cx={x1} cy={y1} r={scaledHandleRadius} fill="#2196f3" stroke="#fff" strokeWidth={scaledStrokeWidth} />
      );
      handles.push(
        <Circle key="end" cx={x2} cy={y2} r={scaledHandleRadius} fill="#2196f3" stroke="#fff" strokeWidth={scaledStrokeWidth} />
      );
      const midX = (x1 + x2) / 2;
      const midY = (y1 + y2) / 2;
      handles.push(
        <G key="rotate">
          <Circle cx={midX} cy={midY - scaledRotateOffset} r={scaledRotateRadius} fill="#FF9800" stroke="#fff" strokeWidth={scaledStrokeWidth} />
          <SvgText x={midX - scaledRotateFontSize * 0.4} y={midY - scaledRotateOffset + scaledRotateFontSize * 0.4} fill="#fff" fontSize={scaledRotateFontSize}>↻</SvgText>
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
          <Circle key={`corner-${idx}`} cx={pos.x} cy={pos.y} r={scaledHandleRadius} fill="#4caf50" stroke="#fff" strokeWidth={scaledStrokeWidth} />
        );
      });
      
      handles.push(
        <G key="rotate">
          <Circle cx={imgX + imgW / 2} cy={imgY - scaledRotateOffset} r={scaledRotateRadius} fill="#FF9800" stroke="#fff" strokeWidth={scaledStrokeWidth} />
          <SvgText x={imgX + imgW / 2 - scaledRotateFontSize * 0.4} y={imgY - scaledRotateOffset + scaledRotateFontSize * 0.4} fill="#fff" fontSize={scaledRotateFontSize}>↻</SvgText>
        </G>
      );
    } else if (element.type === 'text') {
      // Text-Elemente: Bounding Box und Griffe anzeigen
      const textX = element.x || 0;
      const textY = element.y || 0;
      const fontSize = element.fontSize || 20;
      const text = element.data?.text || '';
      
      // Berechne ungefähre Textabmessungen
      // Breite: ca. 0.6 * fontSize pro Zeichen (Schätzung)
      // Höhe: fontSize
      const estimatedWidth = Math.max(text.length * fontSize * 0.6, 40);
      const estimatedHeight = fontSize * 1.2;
      
      // Bounding Box um den Text (Text sitzt auf der Baseline, also nach oben verschieben)
      const boxX = textX - 5;
      const boxY = textY - estimatedHeight;
      const boxWidth = estimatedWidth + 10;
      const boxHeight = estimatedHeight + 10;
      
      // Gestrichelte Bounding Box
      handles.push(
        <Rect
          key="text-bounds"
          x={boxX}
          y={boxY}
          width={boxWidth}
          height={boxHeight}
          fill="none"
          stroke="#2196f3"
          strokeWidth={scaledStrokeWidth * 1.5}
          strokeDasharray={`${4 / Math.max(scale, 0.5)},${4 / Math.max(scale, 0.5)}`}
        />
      );
      
      // Eck-Griffe
      const corners = [
        { x: boxX, y: boxY, label: '↖' },
        { x: boxX + boxWidth, y: boxY, label: '↗' },
        { x: boxX, y: boxY + boxHeight, label: '↙' },
        { x: boxX + boxWidth, y: boxY + boxHeight, label: '↘' },
      ];
      
      corners.forEach((pos, idx) => {
        handles.push(
          <G key={`text-corner-${idx}`}>
            <Circle cx={pos.x} cy={pos.y} r={scaledHandleRadius} fill="#2196f3" stroke="#fff" strokeWidth={scaledStrokeWidth} />
          </G>
        );
      });
      
      // Rotations-Griff
      handles.push(
        <G key="text-rotate">
          <Circle cx={boxX + boxWidth / 2} cy={boxY - scaledRotateOffset} r={scaledRotateRadius} fill="#FF9800" stroke="#fff" strokeWidth={scaledStrokeWidth} />
          <SvgText x={boxX + boxWidth / 2 - scaledRotateFontSize * 0.4} y={boxY - scaledRotateOffset + scaledRotateFontSize * 0.4} fill="#fff" fontSize={scaledRotateFontSize}>↻</SvgText>
        </G>
      );
    } else if (element.type === 'polygon' || element.type === 'path') {
      // Polygon/Path: Nur für diese Typen (NICHT polyline - das hat seinen eigenen Handle)
      let polygonPoints: { x: number; y: number }[] = [];
      
      if (typeof element.data === 'string') {
        // Polygon/Path haben SVG path string
        const pathRegex = /([MLQ])\s*(-?\d+\.?\d*)\s+(-?\d+\.?\d*)/g;
        let match;
        while ((match = pathRegex.exec(element.data)) !== null) {
          polygonPoints.push({ x: parseFloat(match[2]), y: parseFloat(match[3]) });
        }
      }
      
      if (polygonPoints.length >= 2) {
        // Berechne Bounding Box
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        polygonPoints.forEach(pt => {
          minX = Math.min(minX, pt.x);
          minY = Math.min(minY, pt.y);
          maxX = Math.max(maxX, pt.x);
          maxY = Math.max(maxY, pt.y);
        });
        
        const centerX = (minX + maxX) / 2;
        const centerY = (minY + maxY) / 2;
        const boxWidth = maxX - minX;
        const boxHeight = maxY - minY;
        
        const padding = 10 / Math.max(scale, 0.5);
        
        // Gestrichelte Bounding Box
        handles.push(
          <Rect
            key="polygon-bounds"
            x={minX - padding}
            y={minY - padding}
            width={boxWidth + padding * 2}
            height={boxHeight + padding * 2}
            fill="none"
            stroke="#4caf50"
            strokeWidth={2 / Math.max(scale, 0.5)}
            strokeDasharray={`${6 / Math.max(scale, 0.5)},${4 / Math.max(scale, 0.5)}`}
            rx={4 / Math.max(scale, 0.5)}
          />
        );
        
        // Mittelpunkt-Handle zum Verschieben
        const moveHandleSize = Math.max(20, 28 / Math.max(scale, 0.5));
        handles.push(
          <G key="center-move">
            <Circle 
              cx={centerX} 
              cy={centerY} 
              r={moveHandleSize} 
              fill="rgba(76, 175, 80, 0.3)" 
              stroke="#4caf50" 
              strokeWidth={2 / Math.max(scale, 0.5)} 
            />
            <Circle 
              cx={centerX} 
              cy={centerY} 
              r={moveHandleSize * 0.5} 
              fill="#4caf50" 
              stroke="#fff" 
              strokeWidth={1.5 / Math.max(scale, 0.5)} 
            />
            <SvgText 
              x={centerX} 
              y={centerY + (moveHandleSize * 0.2)} 
              fill="#fff" 
              fontSize={moveHandleSize * 0.6}
              textAnchor="middle"
              fontWeight="bold"
            >✥</SvgText>
          </G>
        );
      }
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
      } else if (el.type === 'line' || el.type === 'arrow' || el.type === 'pointer' || el.type === 'memo') {
        minX = Math.min(minX, el.data.x1, el.data.x2);
        maxX = Math.max(maxX, el.data.x1, el.data.x2);
        minY = Math.min(minY, el.data.y1, el.data.y2);
        maxY = Math.max(maxY, el.data.y1, el.data.y2);
        // For text on arrows, account for text offset
        if (el.type === 'arrow' && el.data.text) {
          const textOffset = 20;
          minY = Math.min(minY, el.data.y1 - textOffset, el.data.y2 - textOffset);
        }
        if ((el.type === 'pointer' || el.type === 'memo') && el.data.text) {
          const fontSize = el.data.fontSize || 16;
          const textOffset = 30 + fontSize;
          minX = Math.min(minX, el.data.x1 - textOffset);
          minY = Math.min(minY, el.data.y1 - textOffset);
          maxX = Math.max(maxX, el.data.x1 + (el.data.text.length * fontSize * 0.6));
        }
        hasValidBounds = true;
      } else if (el.type === 'angle') {
        // Winkel-Element: Bounds aus allen 3 Punkten
        if (el.vertex && el.point1 && el.point2) {
          minX = Math.min(minX, el.vertex.x, el.point1.x, el.point2.x);
          maxX = Math.max(maxX, el.vertex.x, el.point1.x, el.point2.x);
          minY = Math.min(minY, el.vertex.y, el.point1.y, el.point2.y);
          maxY = Math.max(maxY, el.vertex.y, el.point1.y, el.point2.y);
          hasValidBounds = true;
        }
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
        
        // Bei Rotation die gedrehten Ecken berechnen
        if (el.rotation && el.type === 'image') {
          const cx = x + w / 2;
          const cy = y + h / 2;
          const rad = (el.rotation * Math.PI) / 180;
          const cos = Math.cos(rad);
          const sin = Math.sin(rad);
          // Alle 4 Ecken rotieren
          const corners = [
            { x: x, y: y },
            { x: x + w, y: y },
            { x: x + w, y: y + h },
            { x: x, y: y + h },
          ];
          corners.forEach(corner => {
            const dx = corner.x - cx;
            const dy = corner.y - cy;
            const rx = cx + dx * cos - dy * sin;
            const ry = cy + dx * sin + dy * cos;
            minX = Math.min(minX, rx);
            maxX = Math.max(maxX, rx);
            minY = Math.min(minY, ry);
            maxY = Math.max(maxY, ry);
          });
        } else {
          minX = Math.min(minX, x);
          maxX = Math.max(maxX, x + w);
          // For text, y is the baseline, so we need to account for the height above baseline
          minY = Math.min(minY, y - (el.type === 'text' ? (el.fontSize || 20) : 0));
          maxY = Math.max(maxY, y + h);
        }
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
    // Die Legend-Position kommt vom PanResponder Overlay:
    // Default: position absolute, bottom: 150, right: 12 + legendPosition (Drag-Offset)
    // Konvertierung in Canvas-Koordinaten:
    const canvasWidthForLegend = screenWidth;
    const canvasHeightForLegend = canvasHeight;
    // X: right: 12 bedeutet der rechte Rand ist 12px vom Container-Rand → linke Kante = containerWidth - 12 - legendWidth
    const uiStartXLegend = canvasWidthForLegend - 12 - svgLegendWidth;
    // Y: bottom: 150 bedeutet der untere Rand ist 150px vom Container-Bottom
    // In Canvas-Koordinaten: canvasHeight - 150 (Boden der Legend)
    const uiStartYLegend = canvasHeightForLegend - 150;
    const uiFinalXLegend = uiStartXLegend + legendPosition.x;
    const uiFinalYLegend = uiStartYLegend + legendPosition.y;
    
    // SVG-Koordinaten: Direkt Canvas-Koordinaten verwenden (KEIN Offset mit origMinX/Y!)
    // Canvas-Koordinaten = SVG-Koordinaten, die viewBox wird entsprechend erweitert
    const svgLegendXPos = uiFinalXLegend;
    const svgLegendYPos = uiFinalYLegend;
    
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
        const lineCX = (el.data.x1 + el.data.x2) / 2;
        const lineCY = (el.data.y1 + el.data.y2) / 2;
        const lineRot = el.rotation ? ` transform="rotate(${el.rotation} ${lineCX} ${lineCY})"` : '';
        svgElements += `<line x1="${el.data.x1}" y1="${el.data.y1}" x2="${el.data.x2}" y2="${el.data.y2}" stroke="${el.color}" stroke-width="${strokeWidth}"${lineRot}/>`;
      } else if (el.type === 'circle') {
        const circRot = el.rotation ? ` transform="rotate(${el.rotation} ${el.data.cx} ${el.data.cy})"` : '';
        svgElements += `<circle cx="${el.data.cx}" cy="${el.data.cy}" r="${el.data.r}" stroke="${el.color}" stroke-width="${strokeWidth}" fill="none"${circRot}/>`;
      } else if (el.type === 'rect') {
        const rectCX = el.data.x + el.data.width / 2;
        const rectCY = el.data.y + el.data.height / 2;
        const rectRot = el.rotation ? ` transform="rotate(${el.rotation} ${rectCX} ${rectCY})"` : '';
        svgElements += `<rect x="${el.data.x}" y="${el.data.y}" width="${el.data.width}" height="${el.data.height}" stroke="${el.color}" stroke-width="${strokeWidth}" fill="none"${rectRot}/>`;
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
      } else if (el.type === 'memo') {
        // Memo/Notiz: Roter Ankerpunkt mit gestrichelter Linie zu Textlabel
        const { x1, y1, x2, y2, text } = el.data;
        const memoFontSize = el.data.fontSize || 14;
        const memoScaleFactor = memoFontSize / 14;
        const memoLineStroke = Math.max(1, 2 * memoScaleFactor);
        const memoAnchorRadius = Math.max(3, 6 * memoScaleFactor);
        const memoFrameStroke = Math.max(1, 2 * memoScaleFactor);
        const memoFrameRadius = Math.max(2, 4 * memoScaleFactor);
        const memoDashArray = `${6 * memoScaleFactor},${4 * memoScaleFactor}`;
        
        // Gestrichelte Verbindungslinie
        svgElements += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${el.color}" stroke-width="${memoLineStroke}" stroke-dasharray="${memoDashArray}"/>`;
        
        // Roter Ankerpunkt (gefüllter Kreis)
        svgElements += `<circle cx="${x1}" cy="${y1}" r="${memoAnchorRadius}" fill="${el.color}" stroke="${el.color}" stroke-width="${memoLineStroke}"/>`;
        
        // Textlabel mit Rahmen
        if (text) {
          const memoLabelWidth = Math.max(60 * memoScaleFactor, text.length * memoFontSize * 0.6 + 20 * memoScaleFactor);
          const memoLabelHeight = memoFontSize + 14 * memoScaleFactor;
          
          // Weißer Hintergrund mit farbigem Rahmen
          svgElements += `<rect x="${x2 - memoLabelWidth / 2}" y="${y2 - memoLabelHeight / 2}" width="${memoLabelWidth}" height="${memoLabelHeight}" fill="white" rx="${memoFrameRadius}" ry="${memoFrameRadius}" stroke="${el.color}" stroke-width="${memoFrameStroke}"/>`;
          // Text
          svgElements += `<text x="${x2}" y="${y2 + memoFontSize / 3}" font-size="${memoFontSize}" fill="${el.color}" font-weight="bold" text-anchor="middle">${text}</text>`;
        }
      } else if (el.type === 'text') {
        const x = el.x || 0;
        const y = el.y || 0;
        const fontSize = el.fontSize || 20;
        const textRot = el.rotation ? ` transform="rotate(${el.rotation} ${x} ${y})"` : '';
        svgElements += `<text x="${x}" y="${y}" font-size="${fontSize}" fill="${el.color}" font-weight="${el.fontWeight || 'bold'}" font-style="${el.fontStyle || 'normal'}"${textRot}>${el.data.text}</text>`;
      } else if (el.type === 'image' && el.data?.uri) {
        const x = el.x || 0;
        const y = el.y || 0;
        const w = el.width || 100;
        const h = el.height || 100;
        const imgCenterX = x + w / 2;
        const imgCenterY = y + h / 2;
        const imgRotation = el.rotation ? ` transform="rotate(${el.rotation} ${imgCenterX} ${imgCenterY})"` : '';
        svgElements += `<image href="${el.data.uri}" x="${x}" y="${y}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid meet"${imgRotation}/>`;
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
        
        // Per-Element Maßlinien-Stil
        const expStyle = measureLineStyles[el.id] || { color: '#1976d2', strokeWidth: 1.2, fontSize: 11 };
        
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
          svgElements += `<line x1="${p1.x + offsetX}" y1="${p1.y + offsetY}" x2="${p2.x + offsetX}" y2="${p2.y + offsetY}" stroke="${expStyle.color}" stroke-width="${expStyle.strokeWidth * 1.25}"/>`;
          
          // Left end tick
          svgElements += `<line x1="${p1.x + offsetX - Math.sin(angle) * tickLength}" y1="${p1.y + offsetY + Math.cos(angle) * tickLength}" x2="${p1.x + offsetX + Math.sin(angle) * tickLength}" y2="${p1.y + offsetY - Math.cos(angle) * tickLength}" stroke="${expStyle.color}" stroke-width="${expStyle.strokeWidth * 1.25}"/>`;
          
          // Right end tick
          svgElements += `<line x1="${p2.x + offsetX - Math.sin(angle) * tickLength}" y1="${p2.y + offsetY + Math.cos(angle) * tickLength}" x2="${p2.x + offsetX + Math.sin(angle) * tickLength}" y2="${p2.y + offsetY - Math.cos(angle) * tickLength}" stroke="${expStyle.color}" stroke-width="${expStyle.strokeWidth * 1.25}"/>`;
          
          // Background for text
          const textWidth = measurementText.length * 8 + 8;
          const textHeight = 16;
          svgElements += `<rect x="${midX + offsetX - textWidth/2}" y="${midY + offsetY - 10}" width="${textWidth}" height="${textHeight}" fill="white" rx="2" ry="2"/>`;
          
          // Measurement text
          svgElements += `<text x="${midX + offsetX}" y="${midY + offsetY + 3}" fill="${expStyle.color}" font-size="${expStyle.fontSize}" font-weight="bold" text-anchor="middle">${measurementText}</text>`;
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
          svgElements += `<circle cx="${centerX}" cy="${centerY}" r="18" fill="${expStyle.color}" stroke="#fff" stroke-width="2"/>`;
          // Label text
          svgElements += `<text x="${centerX}" y="${centerY + 5}" fill="#fff" font-size="14" font-weight="bold" text-anchor="middle">${labelText}</text>`;
        }
      } else if (el.type === 'angle') {
        // Winkel-Element mit 3 Punkten
        if (el.vertex && el.point1 && el.point2) {
          const v = el.vertex;
          const p1 = el.point1;
          const p2 = el.point2;
          const angleValue = el.angle || 0;
          const angleColor = el.color || '#FF5722';
          
          // Linien
          svgElements += `<line x1="${v.x}" y1="${v.y}" x2="${p1.x}" y2="${p1.y}" stroke="${angleColor}" stroke-width="${strokeWidth}"/>`;
          svgElements += `<line x1="${v.x}" y1="${v.y}" x2="${p2.x}" y2="${p2.y}" stroke="${angleColor}" stroke-width="${strokeWidth}"/>`;
          
          // Bogen
          if (angleValue > 0) {
            const len1 = Math.sqrt(Math.pow(p1.x - v.x, 2) + Math.pow(p1.y - v.y, 2));
            const len2 = Math.sqrt(Math.pow(p2.x - v.x, 2) + Math.pow(p2.y - v.y, 2));
            const arcR = Math.min(len1, len2) * 0.3;
            
            const ang1 = Math.atan2(p1.y - v.y, p1.x - v.x);
            const ang2 = Math.atan2(p2.y - v.y, p2.x - v.x);
            
            const arcX1 = v.x + arcR * Math.cos(ang1);
            const arcY1 = v.y + arcR * Math.sin(ang1);
            const arcX2 = v.x + arcR * Math.cos(ang2);
            const arcY2 = v.y + arcR * Math.sin(ang2);
            
            let angDiff = ang2 - ang1;
            while (angDiff < -Math.PI) angDiff += 2 * Math.PI;
            while (angDiff > Math.PI) angDiff -= 2 * Math.PI;
            const sweepFlag = angDiff > 0 ? 1 : 0;
            const largeArcFlag = angleValue > 180 ? 1 : 0;
            
            svgElements += `<path d="M ${arcX1} ${arcY1} A ${arcR} ${arcR} 0 ${largeArcFlag} ${sweepFlag} ${arcX2} ${arcY2}" stroke="${angleColor}" stroke-width="${strokeWidth}" fill="none"/>`;
            
            // Text-Position
            const midAng = (ang1 + ang2) / 2;
            const textX = v.x + (arcR + 20) * Math.cos(midAng);
            const textY = v.y + (arcR + 20) * Math.sin(midAng);
            
            svgElements += `<text x="${textX}" y="${textY}" fill="${angleColor}" font-size="16" font-weight="bold" text-anchor="middle">${angleValue}°</text>`;
          }
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
        
        // Label badge - größer (Farbe pro Element)
        const elBadgeStyle = measureLineStyles[element.id] || { color: '#1976d2' };
        svgElements += `<rect x="${svgLegendXPos + 15}" y="${itemY - 16}" width="38" height="24" fill="${elBadgeStyle.color}" rx="4" ry="4"/>`;
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
      showAlert(t('common.error'), t('sketches.enterTitle'));
      return;
    }

    try {
      setLoading(true);
      const startTime = Date.now();
      
      // Create metadata WITHOUT backgroundImage (stored separately for performance)
      const metadata = {
        elements,
        canvasWidth: width,
        canvasHeight: height - 120, // Subtract header/toolbar height
        lineSegmentMeasurements, // Speichere die Linien-Maße
        measureLineStyles, // Speichere die Maßlinien-Darstellung pro Element
        totalLfmBoxPositions, // Speichere alle Summenbox-Positionen pro Element
        legendPosition, // Speichere Position der Übersicht-Legend
        notes, // Speichere die Notizen
        labelOffsets, // Speichere Polyline-Label-Positionen
      };

      console.log('Saving sketch with', elements.length, 'elements, bgChanged:', backgroundImageChangedRef.current);

      // Generate preview image
      let sketchData = '';
      
      // Priority 1: Generate mini-sketch from elements if we have any drawn elements
      // (Bilder werden in generatePreviewSvg nicht gerendert, also nur wenn andere Elemente vorhanden sind)
      const hasDrawnElements = elements.some(el => el.type !== 'image');
      if (hasDrawnElements) {
        try {
          sketchData = generatePreviewSvg();
        } catch (previewError) {
          console.error('Error generating preview:', previewError);
          sketchData = ''; // Fallback
        }
      }
      
      // Priority 2: Use background image placeholder if no drawable elements preview
      if (!sketchData && backgroundImage) {
        const previewSvg = `
          <svg width="200" height="200" xmlns="http://www.w3.org/2000/svg">
            <rect width="200" height="200" fill="#f0f0f0"/>
            <text x="100" y="90" text-anchor="middle" font-size="16" fill="#333">Foto-Skizze</text>
            <text x="100" y="115" text-anchor="middle" font-size="14" fill="#666">${title || 'Skizze'}</text>
          </svg>
        `;
        sketchData = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(previewSvg)))}`;
      }
      
      // Priority 3: Placeholder for image-only sketches (no background, but has image elements)
      const hasImages = elements.some(el => el.type === 'image');
      if (!sketchData && hasImages) {
        const imageCount = elements.filter(el => el.type === 'image').length;
        const previewSvg = `
          <svg width="200" height="200" xmlns="http://www.w3.org/2000/svg">
            <rect width="200" height="200" fill="#e3f2fd"/>
            <rect x="30" y="40" width="140" height="90" fill="#fff" stroke="#1976d2" stroke-width="2" rx="8"/>
            <text x="100" y="90" text-anchor="middle" font-size="14" fill="#1976d2">${imageCount} Bild${imageCount > 1 ? 'er' : ''}</text>
            <text x="100" y="160" text-anchor="middle" font-size="12" fill="#666">${title || 'Skizze'}</text>
          </svg>
        `;
        sketchData = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(previewSvg)))}`;
      }
      
      // Priority 3: Fallback colored badge
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

      const t1 = Date.now();
      console.log('Preview generated in', t1 - startTime, 'ms');

      // FIX: Bild-URIs aus Elementen extrahieren und als DATEI speichern (umgeht AsyncStorage-Limits)
      const imageOps: Promise<any>[] = [];
      // FIX TABLET BUG: Verwende eindeutigen temporären Prefix für neue Skizzen
      const tempSketchPrefixForSave = sketchId || `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const lightElementsForSave = metadata.elements.map((el: any) => {
        if (el.type === 'image' && el.data?.uri && el.data.uri.length > 1000) {
          const imageKey = `sketch_img_${tempSketchPrefixForSave}_${el.id}`;
          imageOps.push(
            saveImageToFile(imageKey, el.data.uri).then(success => {
              if (!success) console.error(`[saveSketch] Failed to save image ${imageKey}`);
            })
          );
          return { ...el, data: { ...el.data, uri: '__stored__', imageStorageKey: imageKey } };
        }
        return el;
      });
      const lightMetadataForSave = { ...metadata, elements: lightElementsForSave };

      if (sketchId) {
        // Update existing sketch - FAST PATH: save critical data first, update list later
        console.log('Updating sketch ID:', sketchId);
        
        // STEP 1: Save metadata (elements etc.) to separate key - this is the critical data
        const metaStr = JSON.stringify(lightMetadataForSave);
        
        // LOG SIZE FOR DEBUGGING PHONE VS TABLET ISSUES
        console.log(`[saveSketch] Metadata size: ${Math.round(metaStr.length / 1024)}KB`);
        if (backgroundImage) {
          console.log(`[saveSketch] Background image size: ${Math.round(backgroundImage.length / 1024)}KB`);
        }
        console.log(`[saveSketch] Total elements: ${lightElementsForSave.length}, images to save: ${imageOps.length}`);
        
        // CRITICAL FIX: Use storage wrapper instead of direct AsyncStorage to catch errors!
        console.log(`[saveSketch] Saving sketch_meta_${sketchId} (${Math.round(metaStr.length / 1024)}KB)...`);
        const criticalOps: Promise<any>[] = [
          storage.setItem(`sketch_meta_${sketchId}`, metaStr).then(() => {
            console.log(`[saveSketch] ✓ sketch_meta_${sketchId} saved successfully`);
          }).catch(err => {
            console.error(`[saveSketch] ✗ Failed to save sketch_meta_${sketchId}:`, err);
            throw err;
          }),
          ...imageOps,
        ];
        
        // Only save background image if it actually changed
        if (backgroundImageChangedRef.current) {
          console.log('Background image changed, saving...');
          if (backgroundImage) {
            criticalOps.push(storage.setItem(`sketch_bg_${sketchId}`, backgroundImage));
          } else {
            criticalOps.push(storage.removeItem(`sketch_bg_${sketchId}`));
          }
        }
        
        // Wait only for critical data to be saved
        await Promise.all(criticalOps);
        backgroundImageChangedRef.current = false;
        
        const t2 = Date.now();
        console.log('Critical data saved in', t2 - startTime, 'ms');
        
        // STEP 2: Update lightweight sketch entry in main array
        // CHANGED: Now awaiting instead of fire-and-forget to catch errors
        await SketchService.update(sketchId, {
          project_id: projectId,
          title,
          notes,
          sketch_data: sketchData,
          pdf_size: pdfSize,
        });
        console.log('Main array updated:', Date.now() - startTime, 'ms');
        
        console.log('Sketch saved in', Date.now() - startTime, 'ms');
        showAlert(t('common.success'), t('sketches.sketchUpdated'));
      } else {
        // Create new sketch - include metadata for SketchService.create to handle
        console.log('Creating new sketch');
        // Metadata OHNE backgroundImage stringifyen (verhindert OOM bei großen base64-Bildern)
        const lightMetadataForCreate = { ...lightMetadataForSave };
        delete lightMetadataForCreate.backgroundImage;
        await Promise.all(imageOps);
        const newSketch = await SketchService.create({
          project_id: projectId,
          title,
          notes,
          sketch_data: sketchData,
          metadata: JSON.stringify(lightMetadataForCreate),
          pdf_size: pdfSize,
        });
        
        // FIX TABLET BUG: Image-Keys vom temporären Prefix auf die echte Sketch-ID ummappen
        if (newSketch?.id && lightElementsForSave.some((el: any) => el.type === 'image' && el.data?.imageStorageKey)) {
          console.log('[saveSketch] Migrating image keys to new sketch ID:', newSketch.id);
          try {
            const remapOps: Promise<any>[] = [];
            const updatedElements = await Promise.all(lightElementsForSave.map(async (el: any) => {
              if (el.type === 'image' && el.data?.imageStorageKey && el.data.imageStorageKey.includes('_temp_')) {
                const oldKey = el.data.imageStorageKey;
                const newKey = oldKey.replace(/_temp_[^_]+_[^_]+_/, `_${newSketch.id}_`);
                console.log('[saveSketch] Remapping:', oldKey, '->', newKey);
                // FIX: Verwende loadImageFromFile/saveImageToFile statt AsyncStorage
                const imgData = await loadImageFromFile(oldKey);
                if (imgData) {
                  remapOps.push(saveImageToFile(newKey, imgData));
                  remapOps.push(deleteImageFile(oldKey));
                  return { ...el, data: { ...el.data, imageStorageKey: newKey } };
                } else {
                  console.warn('[saveSketch] Image not found for key:', oldKey);
                }
              }
              return el;
            }));
            await Promise.all(remapOps);
            // Metadata mit korrekten Keys speichern - CRITICAL FIX: Use storage wrapper!
            const finalMetadata = { ...lightMetadataForCreate, elements: updatedElements };
            await storage.setItem(`sketch_meta_${newSketch.id}`, JSON.stringify(finalMetadata));
            console.log('[saveSketch] Image keys migrated successfully');
          } catch (remapErr) {
            console.error('[saveSketch] Error remapping image keys:', remapErr);
            throw remapErr; // Re-throw to trigger error handling
          }
        }
        
        // Hintergrundbild separat speichern - CRITICAL FIX: Use storage wrapper!
        if (backgroundImage && newSketch?.id) {
          await storage.setItem(`sketch_bg_${newSketch.id}`, backgroundImage);
        }
        backgroundImageChangedRef.current = false;
        console.log('Sketch created in', Date.now() - startTime, 'ms');
        showAlert(t('common.success'), t('sketches.sketchSaved'));
      }

      router.back();
    } catch (error: any) {
      console.error('Error saving sketch:', error);
      if (isMountedRef.current) {
        // Prüfe auf Speicher-Quota-Fehler
        const errorMsg = error?.message || String(error) || '';
        const isQuotaError = errorMsg.toLowerCase().includes('quota') || 
                            errorMsg.toLowerCase().includes('storage') ||
                            errorMsg.toLowerCase().includes('full') ||
                            errorMsg.toLowerCase().includes('exceeded');
        
        if (isQuotaError) {
          showAlert(
            'Speicher voll',
            'Der Gerätespeicher ist voll. Bitte löschen Sie alte Skizzen, Fotos oder Projekte und versuchen Sie es erneut.'
          );
        } else {
          showAlert(t('common.error'), t('sketches.sketchSaveError') + '\n\nFehler: ' + errorMsg.substring(0, 100));
        }
      }
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
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
      {/* Speicher-Overlay - blockiert Interaktion während des Speicherns */}
      {isSaving && (
        <View style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 9999,
        }}>
          <View style={{
            backgroundColor: '#fff',
            padding: 30,
            borderRadius: 16,
            alignItems: 'center',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.3,
            shadowRadius: 8,
          }}>
            <ActivityIndicator size="large" color="#1976d2" />
            <Text style={{ marginTop: 16, fontSize: 18, fontWeight: '600', color: '#333' }}>
              Skizze wird gespeichert...
            </Text>
            <Text style={{ marginTop: 8, fontSize: 14, color: '#666' }}>
              Bitte warten
            </Text>
          </View>
        </View>
      )}
      
      {/* Header - dynamisches Padding via SafeArea, kompakt im Querformat */}
      <View style={[styles.header, { 
        paddingTop: isPhoneLandscape ? Math.max(insets.top, 4) : (Platform.OS === 'ios' ? Math.max(insets.top, 20) : 12),
        paddingVertical: isPhoneLandscape ? 4 : 12,
        paddingLeft: isPhoneLandscape ? Math.max(insets.left, 8) : 16,
        paddingRight: isPhoneLandscape ? Math.max(insets.right, 8) : 16,
      }]}>
        <TouchableOpacity onPress={handleBackPress} style={styles.headerButton} disabled={isSaving}>
          <Ionicons name="arrow-back" size={isPhoneLandscape ? 20 : 24} color={isSaving ? "#999" : "#fff"} />
        </TouchableOpacity>
        <TextInput
          style={[styles.titleInput, isPhoneLandscape && { paddingVertical: 4, fontSize: 14 }]}
          value={title}
          onChangeText={setTitle}
          placeholder={t('sketches.sketchTitle')}
          placeholderTextColor="#ccc"
        />
        {/* PDF-Größe Button mit Label - nur 2 Optionen: 66% (2 nebeneinander) und 100% (volle Breite) */}
        <TouchableOpacity 
          onPress={() => {
            const sizes = ['medium', 'large'];
            const labels = ['66% (2 nebeneinander)', '100% (volle Breite)'];
            const currentIndex = sizes.indexOf(pdfSize);
            const nextIndex = (currentIndex + 1) % sizes.length;
            setPdfSize(sizes[nextIndex]);
            showAlert('PDF', labels[nextIndex]);
            // pdf_size sofort speichern, damit die Änderung beim Zurückkehren verfügbar ist
            if (sketchId) {
              SketchService.update(sketchId, { pdf_size: sizes[nextIndex] }).catch(err => 
                console.error('Error saving pdf_size:', err)
              );
            }
          }} 
          style={styles.pdfSizeHeaderButton}
        >
          <Ionicons 
            name={pdfSize === 'medium' ? 'copy-outline' : 'square-outline'} 
            size={20} 
            color="#fff" 
          />
          <Text style={styles.pdfSizeHeaderLabel}>PDF</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={saveSketch} style={styles.headerButton} disabled={loading}>
          <Ionicons name="checkmark" size={24} color={loading ? '#888' : '#fff'} />
        </TouchableOpacity>
      </View>

      {/* Toolbar mit Labels - scrollbar für iPhone und im Querformat */}
      <View style={[styles.toolbarContainer, isPhoneLandscape && { borderBottomWidth: 0.5 }]}>
        <ScrollView 
          horizontal={isPhoneDevice || isPhoneLandscape} 
          showsHorizontalScrollIndicator={isPhoneDevice}
          style={[styles.toolbar, (isPhoneDevice || isPhoneLandscape) && styles.toolbarPhone, isPhoneLandscape && { maxHeight: 50, paddingVertical: 2 }]}
          contentContainerStyle={(isPhoneDevice || isPhoneLandscape) ? styles.toolbarContentPhone : styles.toolbarContent}
        >
        {/* ========== FOTO-TOOLS (VORNE) ========== */}
        
        {/* 1. neues Foto */}
        <View style={styles.toolButtonWithLabel}>
          <TouchableOpacity style={[styles.toolButtonPhotoWide, isPhoneDevice && styles.toolButtonPhotoWidePhone]} onPress={() => { setPhotoEditMode(false); takePhotoAndInsert(); }}>
            <Ionicons name="camera" size={isPhoneDevice ? 18 : 20} color="#4caf50" />
          </TouchableOpacity>
          <Text style={[styles.toolButtonLabelWide, isPhoneDevice && styles.toolButtonLabelWidePhone]}>{t('sketches.photo')}</Text>
        </View>

        {/* 2. Projektfotos */}
        <View style={styles.toolButtonWithLabel}>
          <TouchableOpacity 
            style={styles.toolButtonPhotoWide} 
            onPress={() => { setPhotoEditMode(false); loadProjectPhotos(); }}
          >
            <Ionicons name="images" size={20} color="#1976d2" />
          </TouchableOpacity>
          <Text style={styles.toolButtonLabelWide}>{t('sketches.photoFromProject')}</Text>
        </View>

        {/* 3. Galeriefotos */}
        <View style={styles.toolButtonWithLabel}>
          <TouchableOpacity style={styles.toolButtonPhotoWide} onPress={() => { setPhotoEditMode(false); insertImage(); }}>
            <Ionicons name="image" size={20} color="#9C27B0" />
          </TouchableOpacity>
          <Text style={styles.toolButtonLabelWide}>{t('sketches.photoFromGallery')}</Text>
        </View>

        {/* 3.5 Bild aus Dateien */}
        <View style={styles.toolButtonWithLabel}>
          <TouchableOpacity style={styles.toolButtonPhotoWide} onPress={() => { setPhotoEditMode(false); importFromFiles(); }}>
            <Ionicons name="document" size={20} color="#FF5722" />
          </TouchableOpacity>
          <Text style={styles.toolButtonLabelWide}>{t('sketches.fromFiles')}</Text>
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
                setDrawingEnabled(true);
              }
            }}
          >
            <Ionicons name="move" size={18} color={photoEditMode ? '#fff' : '#FF9800'} />
          </TouchableOpacity>
          <Text style={styles.toolButtonLabel}>{t('sketches.position')}</Text>
        </View>

        {/* 5. Foto zuschneiden */}
        <View style={styles.toolButtonWithLabel}>
          <TouchableOpacity 
            style={[styles.toolButtonInner, drawMode === 'crop' && styles.toolButtonActive]} 
            onPress={() => selectDrawMode(drawMode === 'crop' ? 'select' : 'crop')}
          >
            <Ionicons name="crop-outline" size={18} color={drawMode === 'crop' ? '#fff' : '#9C27B0'} />
          </TouchableOpacity>
          <Text style={[styles.toolButtonLabel, { color: drawMode === 'crop' ? '#9C27B0' : '#333' }]}>{t('sketches.crop')}</Text>
        </View>

        <View style={styles.separator} />

        {/* ========== ZEICHEN-TOOLS ========== */}
        
        {/* Zeichnen-Toggle-Button: Ein/Aus für Zeichenmodus (wenn AUS, ist Zoom erlaubt) */}
        <View style={styles.toolButtonWithLabel}>
          <TouchableOpacity
            style={[
              styles.toolButtonInner, 
              { 
                backgroundColor: drawingEnabled ? '#e8f5e9' : '#ffebee',
                borderWidth: 2,
                borderColor: drawingEnabled ? '#4caf50' : '#f44336',
              }
            ]}
            onPress={() => {
              const newDrawingEnabled = !drawingEnabled;
              setDrawingEnabled(newDrawingEnabled);
              // Bei Zeichnen AN → Zoom zurücksetzen (optional, für sauberen Start)
              if (newDrawingEnabled) {
                setScale(1);
                setIsZooming(false);
                setInitialPinchDistance(null);
              }
            }}
          >
            <Ionicons 
              name={drawingEnabled ? "brush" : "search"} 
              size={18} 
              color={drawingEnabled ? '#4caf50' : '#f44336'} 
            />
          </TouchableOpacity>
          <Text style={[styles.toolButtonLabel, { color: drawingEnabled ? '#4caf50' : '#f44336', fontSize: 9 }]}>
            {drawingEnabled ? 'Zeichnen' : 'Zoom'}
          </Text>
        </View>

        {/* Zoom-Reset: Nur sichtbar wenn gezoomt (scale > 1) */}
        {!drawingEnabled && scale > 1.05 && (
          <View style={styles.toolButtonWithLabel}>
            <TouchableOpacity
              style={[
                styles.toolButtonInner, 
                { 
                  backgroundColor: '#fff3e0',
                  borderWidth: 1,
                  borderColor: '#ff9800',
                }
              ]}
              onPress={() => {
                // Zoom zurücksetzen
                setScale(1);
                setIsZooming(false);
                setInitialPinchDistance(null);
              }}
            >
              <Text style={{ color: '#ff9800', fontWeight: '700', fontSize: 10 }}>
                {Math.round(scale * 100)}%
              </Text>
            </TouchableOpacity>
            <Text style={[styles.toolButtonLabel, { color: '#ff9800', fontSize: 9 }]}>
              Reset
            </Text>
          </View>
        )}
        
        {/* 6. Hand - Bearbeiten */}
        <View style={styles.toolButtonWithLabel}>
          <TouchableOpacity
            style={[styles.toolButtonInner, drawMode === 'select' && styles.toolButtonActive]}
            onPress={() => selectDrawMode('select')}
          >
            <Ionicons name="hand-left" size={18} color={drawMode === 'select' ? '#fff' : '#333'} />
          </TouchableOpacity>
          <Text style={styles.toolButtonLabel}>{t('common.edit')}</Text>
        </View>

        {/* ========== MAßLINIEN (nach Zoom & Bearbeiten) ========== */}
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
            {/* Winkel-Snap Toggle - sichtbar wenn Polyline aktiv */}
            {drawMode === 'polyline' && polylinePoints.length === 0 && (
              <>
                <TouchableOpacity
                  style={[
                    styles.toolButtonInner, 
                    { 
                      backgroundColor: angleSnapEnabled ? '#1976d2' : '#f5f5f5',
                      borderWidth: 1,
                      borderColor: angleSnapEnabled ? '#1565c0' : '#ddd',
                    }
                  ]}
                  onPress={() => setAngleSnapEnabled(!angleSnapEnabled)}
                >
                  <Text style={{ fontSize: 10, fontWeight: '700', color: angleSnapEnabled ? '#fff' : '#666' }}>
                    {angleSnapEnabled ? `${angleSnapValue}°` : '∠'}
                  </Text>
                </TouchableOpacity>
                {showGrid && !backgroundImage && (
                  <TouchableOpacity
                    style={[
                      styles.toolButtonInner, 
                      { 
                        backgroundColor: gridSnapEnabled ? '#4caf50' : '#f5f5f5',
                        borderWidth: 1,
                        borderColor: gridSnapEnabled ? '#388e3c' : '#ddd',
                      }
                    ]}
                    onPress={() => setGridSnapEnabled(!gridSnapEnabled)}
                  >
                    <Ionicons name="grid-outline" size={16} color={gridSnapEnabled ? '#fff' : '#666'} />
                  </TouchableOpacity>
                )}
              </>
            )}
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
            <Text style={[styles.toolButtonLabelSmall, { flex: 1, textAlign: 'center' }]}>{t('sketches.measurementLine')}</Text>
            <Text style={[styles.toolButtonLabelSmall, { flex: 1, textAlign: 'center' }]}>{t('sketches.polygon')}</Text>
            <Text style={[styles.toolButtonLabelSmall, { flex: 1, textAlign: 'center' }]}>{t('sketches.addPoint')}</Text>
            <Text style={[styles.toolButtonLabelSmall, { flex: 1, textAlign: 'center' }]}>{t('sketches.removePoint')}</Text>
          </View>
        </View>

        {/* Element löschen Button - zwischen Maßlinien und Stift */}
        <View style={styles.toolButtonWithLabel}>
          <TouchableOpacity
            style={[styles.toolButtonInner, !selectedElementId && styles.toolButtonDisabled]}
            onPress={() => {
              if (selectedElementId) {
                setShowDeleteConfirm(true);
              }
            }}
            disabled={!selectedElementId}
          >
            <Ionicons name="trash" size={18} color={selectedElementId ? '#f44336' : '#ccc'} />
          </TouchableOpacity>
          <Text style={[styles.toolButtonLabel, { color: selectedElementId ? '#f44336' : '#ccc' }]}>{t('sketches.deleteElement')}</Text>
        </View>

        {/* Stil bearbeiten Button */}
        <View style={styles.toolButtonWithLabel}>
          <TouchableOpacity
            style={[
              styles.toolButtonInner, 
              !selectedElementId && styles.toolButtonDisabled,
              showElementStyleEditor && selectedElementId && styles.toolButtonActive,
            ]}
            onPress={() => {
              if (selectedElementId) {
                setShowElementStyleEditor(!showElementStyleEditor);
              }
            }}
            disabled={!selectedElementId}
          >
            <Ionicons name="color-palette" size={18} color={selectedElementId ? (showElementStyleEditor ? '#fff' : '#1976d2') : '#ccc'} />
          </TouchableOpacity>
          <Text style={[styles.toolButtonLabel, { color: selectedElementId ? '#1976d2' : '#ccc' }]}>{t('sketches.editStyle')}</Text>
        </View>

        {/* Linie ↔ Pfeil umwandeln Button - nur bei Linien/Pfeilen sichtbar */}
        {selectedElementId && (elements.find(el => el.id === selectedElementId)?.type === 'line' || elements.find(el => el.id === selectedElementId)?.type === 'arrow') && (
          <View style={styles.toolButtonWithLabel}>
            <TouchableOpacity
              style={[styles.toolButtonInner, { borderColor: '#ff9800', borderWidth: 1 }]}
              onPress={convertLineToArrow}
            >
              <Ionicons 
                name={elements.find(el => el.id === selectedElementId)?.type === 'line' ? 'arrow-forward' : 'remove'} 
                size={18} 
                color="#ff9800" 
              />
            </TouchableOpacity>
            <Text style={[styles.toolButtonLabel, { color: '#ff9800', fontSize: 8 }]}>
              {elements.find(el => el.id === selectedElementId)?.type === 'line' ? '→ Pfeil' : '→ Linie'}
            </Text>
          </View>
        )}

        <View style={styles.separator} />

        {/* 7. Stift */}
        <View style={styles.toolButtonWithLabel}>
          <TouchableOpacity
            style={[styles.toolButtonInner, drawMode === 'pen' && styles.toolButtonActive]}
            onPress={() => selectDrawMode('pen')}
          >
            <Ionicons name="create" size={18} color={drawMode === 'pen' ? '#fff' : '#333'} />
          </TouchableOpacity>
          <Text style={styles.toolButtonLabel}>{t('sketches.pen')}</Text>
        </View>

        {/* 8. Formen (Linie, Kreis, Rechteck) */}
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
          </View>
          <View style={styles.toolGroupLabelRow}>
            <Text style={[styles.toolButtonLabelSmall, { flex: 1, textAlign: 'center' }]}>{t('sketches.line')}</Text>
            <Text style={[styles.toolButtonLabelSmall, { flex: 1, textAlign: 'center' }]}>{t('sketches.circle')}</Text>
            <Text style={[styles.toolButtonLabelSmall, { flex: 1, textAlign: 'center' }]}>{t('sketches.rect')}</Text>
          </View>
        </View>

        {/* Winkelmesser (alter bewährter Ansatz) */}
        <View style={styles.toolButtonWithLabel}>
          <TouchableOpacity
            style={[styles.toolButtonInner, showProtractor && styles.toolButtonActive]}
            onPress={() => {
              if (!showProtractor) {
                // Canvas-Snapshot erstellen BEVOR das Protractor-Overlay angezeigt wird
                if (canvasRef.current) {
                  captureRef(canvasRef.current, {
                    format: 'png',
                    quality: 0.8,
                    result: 'data-uri',
                  }).then((uri: string) => {
                    protractorCanvasSnapshot.current = uri;
                    console.log('Protractor canvas snapshot captured');
                  }).catch((err: Error) => {
                    console.log('Canvas snapshot error:', err);
                    protractorCanvasSnapshot.current = null;
                  });
                }
                // Neuen Winkelmesser öffnen → Position zurücksetzen
                setProtractorCenter({ x: 0, y: 0 });
                setProtractorRefEnd({ x: 0, y: 0 });
                setProtractorAngleEnd({ x: 0, y: 0 });
              }
              setShowProtractor(!showProtractor);
            }}
          >
            <Svg width={22} height={22} viewBox="0 0 24 24">
              <Path 
                d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z" 
                fill="none"
                stroke={showProtractor ? '#fff' : '#FF5722'}
                strokeWidth={1.5}
              />
              <Line x1="12" y1="12" x2="12" y2="4" stroke={showProtractor ? '#fff' : '#FF5722'} strokeWidth={2} />
              <Line x1="12" y1="12" x2="20" y2="12" stroke={showProtractor ? '#fff' : '#FF5722'} strokeWidth={2} />
              <Path 
                d="M12 8 A4 4 0 0 1 16 12" 
                fill="none"
                stroke={showProtractor ? '#fff' : '#FF5722'}
                strokeWidth={1.5}
              />
            </Svg>
          </TouchableOpacity>
          <Text style={[styles.toolButtonLabel, { color: showProtractor ? '#FF5722' : '#333' }]}>{t('sketches.angleSnap')}</Text>
        </View>

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
              style={[styles.toolButtonInner, showNotesModal && styles.toolButtonActive, notes.trim() && !showNotesModal && styles.toolButtonWithBadge]}
              onPress={() => setShowNotesModal(true)}
            >
              <View style={styles.notesButtonContainer}>
                <Ionicons name="document-text-outline" size={18} color={showNotesModal ? '#fff' : notes.trim() ? '#4caf50' : '#333'} />
                {notes.trim() && (
                  <View style={styles.notesBadge}>
                    <Ionicons name="checkmark" size={8} color="#fff" />
                  </View>
                )}
              </View>
            </TouchableOpacity>
          </View>
          <View style={styles.toolGroupLabelRow}>
            <Text style={[styles.toolButtonLabelSmall, { flex: 1, textAlign: 'center' }]}>{t('sketches.memo')}</Text>
            <Text style={[styles.toolButtonLabelSmall, { flex: 1, textAlign: 'center' }]}>{t('sketches.text')}</Text>
            <Text style={[styles.toolButtonLabelSmall, { flex: 1, textAlign: 'center' }]}>{t('sketches.note')}</Text>
            <Text style={[styles.toolButtonLabelSmall, { flex: 1, textAlign: 'center' }]}>{t('sketches.notes')}</Text>
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
                onPress={() => updateStrokeWidth(w)}
              >
                <View style={[styles.strokeWidthDot, { width: w * 1.5, height: w * 1.5 }]} />
              </TouchableOpacity>
            ))}
          </View>
          <Text style={styles.toolButtonLabel}>{t('sketches.drawBar')}</Text>
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
                {t('sketches.grid')}
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
              onPress={() => {
                console.log('[Button Undo] Pressed! canUndo:', canUndo, 'historyIndex:', historyIndex, 'history.length:', history.length);
                undo();
              }}
              disabled={!canUndo}
            >
              <Ionicons name="arrow-undo" size={18} color={canUndo ? '#1976d2' : '#ccc'} />
              {/* Fallback Text falls Icon nicht lädt */}
              <Text style={{ fontSize: 8, color: canUndo ? '#1976d2' : '#ccc', marginTop: 2 }}>↩</Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[styles.toolButtonInner, !canRedo && styles.toolButtonDisabled]}
              onPress={() => {
                console.log('[Button Redo] Pressed! canRedo:', canRedo, 'historyIndex:', historyIndex, 'history.length:', history.length);
                redo();
              }}
              disabled={!canRedo}
            >
              <Ionicons name="arrow-redo" size={18} color={canRedo ? '#1976d2' : '#ccc'} />
              {/* Fallback Text falls Icon nicht lädt */}
              <Text style={{ fontSize: 8, color: canRedo ? '#1976d2' : '#ccc', marginTop: 2 }}>↪</Text>
            </TouchableOpacity>
          </View>
          {/* Debug: Zeige History Status */}
          <Text style={[styles.toolButtonLabel, { fontSize: 8 }]}>
            {history.length > 1 ? `${historyIndex + 1}/${history.length}` : t('sketches.undoRedo')}
          </Text>
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
              Alert.alert(t('sketches.clear'), t('sketches.clearConfirm'), [
                { text: t('common.cancel'), style: 'cancel' },
                { text: t('common.delete'), style: 'destructive', onPress: clearAll },
              ]);
            }
          }}>
            <Ionicons name="trash-bin" size={18} color="#f44336" />
          </TouchableOpacity>
          <Text style={[styles.toolButtonLabel, { color: '#f44336' }]}>{t('sketches.deletePage')}</Text>
        </View>
      </ScrollView>
      </View>

      {/* Color picker expandable */}
      {showColorPicker && (
        <View style={styles.colorPickerPanel}>
          <Text style={styles.colorPickerTitle}>{t('sketches.chooseColor')}</Text>
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

      {/* Stil-Editor Panel für ausgewähltes Element */}
      {showElementStyleEditor && selectedElementForStyle && (
        <View style={styles.elementStylePanel}>
          <View style={styles.elementStyleHeader}>
            <Text style={styles.elementStyleTitle}>{t('sketches.style')}</Text>
            <TouchableOpacity onPress={() => setShowElementStyleEditor(false)} style={{ padding: 4 }}>
              <Ionicons name="close-circle" size={22} color="#999" />
            </TouchableOpacity>
          </View>
          
          {/* Farbe + Linienstärke in einer kompakten Zeile */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            {/* Farbauswahl */}
            {selectedElementForStyle.type !== 'image' && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'wrap', flex: 1 }}>
                {colors.map(color => (
                  <TouchableOpacity
                    key={`style-${color}`}
                    style={[
                      styles.elementStyleColorOption,
                      { backgroundColor: color },
                      selectedElementForStyle.color === color && styles.elementStyleColorSelected,
                    ]}
                    onPress={() => changeSelectedElementColor(color)}
                  />
                ))}
              </View>
            )}
            
            {/* Linienstärke - kompakt */}
            {selectedElementForStyle.type !== 'image' && selectedElementForStyle.type !== 'text' && (
              <View style={{ flexDirection: 'row', gap: 4 }}>
                {[1, 2, 3, 5, 8].map(w => (
                  <TouchableOpacity
                    key={`style-sw-${w}`}
                    style={[
                      styles.elementStyleStrokeButton,
                      selectedElementForStyle.strokeWidth === w && styles.elementStyleStrokeButtonActive,
                    ]}
                    onPress={() => changeSelectedElementStrokeWidth(w)}
                  >
                    <View style={[
                      styles.elementStyleStrokeDot, 
                      { 
                        width: Math.max(w * 2, 5), 
                        height: Math.max(w * 2, 5),
                        backgroundColor: selectedElementForStyle.strokeWidth === w ? '#fff' : '#333',
                      }
                    ]} />
                    <Text style={[
                      styles.elementStyleStrokeLabel,
                      selectedElementForStyle.strokeWidth === w && { color: '#fff' }
                    ]}>{w}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        </View>
      )}

      {/* Gitter-Einstellungen Panel */}
      {showGridSettings && !backgroundImage && (
        <View style={styles.gridSettingsPanel}>
          <View style={styles.gridSettingsHeader}>
            <Text style={styles.gridSettingsTitle}>{t('sketches.gridSettings')}</Text>
            <TouchableOpacity onPress={() => setShowGridSettings(false)}>
              <Ionicons name="close" size={20} color="#666" />
            </TouchableOpacity>
          </View>
          
          {/* Größen-Slider */}
          <View style={styles.gridSliderSection}>
            <Text style={styles.gridSliderSectionLabel}>{t('sketches.gridSize')}: {gridSize}px</Text>
            <View style={styles.gridSliderRow}>
              <Text style={styles.gridSliderLabel}>{t('sketches.gridSmall')}</Text>
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
              <Text style={styles.gridSliderLabel}>{t('sketches.gridLarge')}</Text>
            </View>
          </View>
          
          {/* Transparenz-Slider */}
          <View style={styles.gridSliderSection}>
            <Text style={styles.gridSliderSectionLabel}>{t('sketches.gridVisibility')}: {Math.round(gridOpacity * 100)}%</Text>
            <View style={styles.gridSliderRow}>
              <Text style={styles.gridSliderLabel}>{t('sketches.gridWeak')}</Text>
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
              <Text style={styles.gridSliderLabel}>{t('sketches.gridStrong')}</Text>
            </View>
          </View>
        </View>
      )}

      {/* Canvas mit ScrollView für Zoom */}
      <ScrollView
        ref={scrollViewRef}
        style={[styles.canvasScrollView, isPhoneLandscape && { paddingLeft: insets.left, paddingRight: insets.right }]}
        contentContainerStyle={{ flexGrow: 1 }}
        minimumZoomScale={Platform.OS === 'ios' ? (!drawingEnabled ? 0.5 : scale) : 1}
        maximumZoomScale={Platform.OS === 'ios' ? (!drawingEnabled ? 4 : scale) : 1}
        bouncesZoom={Platform.OS === 'ios' && !drawingEnabled}
        scrollEnabled={Platform.OS === 'ios' ? !drawingEnabled : false}
        pinchGestureEnabled={Platform.OS === 'ios' && !drawingEnabled}
        directionalLockEnabled={false}
        centerContent={Platform.OS === 'ios'}
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        onScroll={Platform.OS === 'ios' ? (event) => {
          const currentScale = event.nativeEvent.zoomScale || 1;
          if (currentScale !== scale) {
            setScale(currentScale);
          }
          // Speichere die Scroll-Position für korrekte Koordinatenberechnung
          const { contentOffset } = event.nativeEvent;
          if (contentOffset) {
            setScrollOffset({ x: contentOffset.x, y: contentOffset.y });
          }
        } : undefined}
        scrollEventThrottle={16}
      >
        {/* Android: Animated.View Wrapper für visuellen Zoom + Pan Effekt */}
        <Animated.View style={Platform.OS === 'android' ? {
          transform: [
            { translateX: panOffset.x }, // Pan X
            { translateY: panOffset.y }, // Pan Y
            { scale: scale }, // Visueller Zoom basierend auf scale state
          ],
        } : undefined}>
        <View
          ref={canvasRef}
          style={[styles.canvasContainer, { width: screenWidth, height: canvasHeight, minHeight: canvasHeight }]}
          onStartShouldSetResponder={() => Platform.OS === 'android' ? true : drawingEnabled}
          onMoveShouldSetResponder={() => Platform.OS === 'android' ? true : drawingEnabled}
          onResponderGrant={onTouchStart}
          onResponderMove={onTouchMove}
          onResponderRelease={onTouchEnd}
          onLayout={(event) => {
            // Speichere die Canvas-Position auf dem Bildschirm für präzise Koordinaten-Berechnung
            if (Platform.OS === 'web') {
              // Web: Verwende layout-Daten aus dem Event
              const { x, y, width, height } = event.nativeEvent.layout;
              setCanvasLayout({ x, y, width, height });
            } else if (event.target && typeof event.target.measureInWindow === 'function') {
              event.target.measureInWindow((x: number, y: number, width: number, height: number) => {
                setCanvasLayout({ x, y, width, height });
              });
            }
          }}
        >
        <Svg
          ref={svgRef}
          width={screenWidth}
          height={canvasHeight}
          style={styles.svg}
          viewBox={`0 0 ${screenWidth} ${canvasHeight}`}
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
                width={screenWidth}
                height={canvasHeight}
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
              width={screenWidth}
              height={canvasHeight}
              preserveAspectRatio="xMinYMin meet"
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
          
          {/* AKTIVER WINKEL - direkt im Haupt-SVG mit Canvas-Koordinaten */}
          {showProtractor && (
            <G>
              {/* Referenzlinie (blau): Scheitelpunkt -> Punkt 1 */}
              <Line 
                x1={angleVertex.x} y1={angleVertex.y}
                x2={anglePoint1.x} y2={anglePoint1.y}
                stroke="#2196f3" strokeWidth={3}
              />
              {/* Winkellinie (orange): Scheitelpunkt -> Punkt 2 */}
              <Line 
                x1={angleVertex.x} y1={angleVertex.y}
                x2={anglePoint2.x} y2={anglePoint2.y}
                stroke="#FF5722" strokeWidth={3}
              />
              {/* Winkelbogen (grün) */}
              {calculatedAngle > 0 && (() => {
                const refAng = Math.atan2(anglePoint1.y - angleVertex.y, anglePoint1.x - angleVertex.x);
                const angAng = Math.atan2(anglePoint2.y - angleVertex.y, anglePoint2.x - angleVertex.x);
                const arcR = 40;
                const arcX1 = angleVertex.x + arcR * Math.cos(refAng);
                const arcY1 = angleVertex.y + arcR * Math.sin(refAng);
                const arcX2 = angleVertex.x + arcR * Math.cos(angAng);
                const arcY2 = angleVertex.y + arcR * Math.sin(angAng);
                let angleDiff = angAng - refAng;
                while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;
                while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
                const sweep = angleDiff > 0 ? 1 : 0;
                const largeArc = calculatedAngle > 180 ? 1 : 0;
                return (
                  <Path 
                    d={`M ${arcX1} ${arcY1} A ${arcR} ${arcR} 0 ${largeArc} ${sweep} ${arcX2} ${arcY2}`}
                    fill="none" stroke="#4caf50" strokeWidth={3}
                  />
                );
              })()}
              {/* Winkelwert */}
              <SvgText
                x={angleVertex.x}
                y={angleVertex.y - 35}
                fill="#FF5722"
                fontSize={18}
                fontWeight="bold"
                textAnchor="middle"
              >
                {calculatedAngle.toFixed(1)}°
              </SvgText>
              {/* Vertex-Handle */}
              <Circle cx={angleVertex.x} cy={angleVertex.y} r={18} fill="#FF5722" stroke="#fff" strokeWidth={3} />
              {/* Point1-Handle */}
              <Circle cx={anglePoint1.x} cy={anglePoint1.y} r={15} fill="#2196f3" stroke="#fff" strokeWidth={3} />
              {/* Point2-Handle */}
              <Circle cx={anglePoint2.x} cy={anglePoint2.y} r={15} fill="#FF5722" stroke="#fff" strokeWidth={3} />
            </G>
          )}
        </Svg>

        {/* Touch-Handler für aktiven Winkel - DIREKT IM CANVAS-CONTAINER */}
        {showProtractor && (
          <>
            <View
              style={{
                position: 'absolute',
                left: angleVertex.x - 25,
                top: angleVertex.y - 25,
                width: 50,
                height: 50,
                borderRadius: 25,
                backgroundColor: activeDragPoint === 'vertex' ? '#FF5722' : 'rgba(255, 87, 34, 0.8)',
                borderWidth: 3,
                borderColor: '#fff',
                justifyContent: 'center',
                alignItems: 'center',
                zIndex: 100,
              }}
              onTouchStart={(e) => handleAngleDragStart(e, 'vertex')}
              onTouchMove={handleAngleDragMove}
              onTouchEnd={handleAngleDragEnd}
              onStartShouldSetResponder={() => true}
              onMoveShouldSetResponder={() => true}
            >
              <Text style={{ color: '#fff', fontSize: 10, fontWeight: 'bold' }}>⊙</Text>
            </View>
            
            <View
              style={{
                position: 'absolute',
                left: anglePoint1.x - 20,
                top: anglePoint1.y - 20,
                width: 40,
                height: 40,
                borderRadius: 20,
                backgroundColor: activeDragPoint === 'point1' ? '#2196f3' : 'rgba(33, 150, 243, 0.8)',
                borderWidth: 3,
                borderColor: '#fff',
                justifyContent: 'center',
                alignItems: 'center',
                zIndex: 100,
              }}
              onTouchStart={(e) => handleAngleDragStart(e, 'point1')}
              onTouchMove={handleAngleDragMove}
              onTouchEnd={handleAngleDragEnd}
              onStartShouldSetResponder={() => true}
              onMoveShouldSetResponder={() => true}
            >
              <Text style={{ color: '#fff', fontSize: 10, fontWeight: 'bold' }}>1</Text>
            </View>
            
            <View
              style={{
                position: 'absolute',
                left: anglePoint2.x - 20,
                top: anglePoint2.y - 20,
                width: 40,
                height: 40,
                borderRadius: 20,
                backgroundColor: activeDragPoint === 'point2' ? '#FF5722' : 'rgba(255, 87, 34, 0.8)',
                borderWidth: 3,
                borderColor: '#fff',
                justifyContent: 'center',
                alignItems: 'center',
                zIndex: 100,
              }}
              onTouchStart={(e) => handleAngleDragStart(e, 'point2')}
              onTouchMove={handleAngleDragMove}
              onTouchEnd={handleAngleDragEnd}
              onStartShouldSetResponder={() => true}
              onMoveShouldSetResponder={() => true}
            >
              <Text style={{ color: '#fff', fontSize: 10, fontWeight: 'bold' }}>2</Text>
            </View>
          </>
        )}

        {/* Info overlay - mit eigenem Responder damit Buttons funktionieren */}
        <View 
          style={styles.infoOverlay}
          onStartShouldSetResponder={() => true}
          onMoveShouldSetResponder={() => true}
          onResponderTerminationRequest={() => false}
        >
          <Text style={styles.infoText}>Elemente: {elements.length}</Text>
          {selectedElementId && <Text style={styles.infoText}>Ausgewählt</Text>}
          {/* "Winkel anpassen" Button wenn ein Winkel-Element ausgewählt ist */}
          {selectedElementId && isAngleGroupElement(selectedElementId) && (
            <TouchableOpacity 
              style={{
                backgroundColor: '#FF5722',
                borderRadius: 20,
                paddingHorizontal: 14,
                paddingVertical: 8,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                marginTop: 4,
              }}
              onPress={() => {
                const baseId = getAngleGroupBaseId(selectedElementId);
                const geo = getAngleGroupGeometry(baseId);
                if (geo && canvasLayout) {
                  // Canvas → Screen-Koordinaten (berücksichtigt Zoom)
                  const currentScale = scaleRef.current || 1;
                  
                  // Frische Canvas-Position messen für genaue Umrechnung
                  const doConvert = (freshLayout: { x: number; y: number; width: number; height: number }) => {
                    // Canvas → Screen: screenX = canvasX * scale + layout.x
                    // (layout.x enthält bereits Scroll-Position via measureInWindow)
                    const cx = geo.cx * currentScale + freshLayout.x;
                    const cy = geo.cy * currentScale + freshLayout.y;
                    // Linienlängen in Bildschirm-Koordinaten skalieren
                    const screenRefLength = geo.refLength * currentScale;
                    const screenAngleLength = geo.anglLineLength * currentScale;
                    const refEndX = cx + screenRefLength * Math.cos(geo.refAngleRad);
                    const refEndY = cy + screenRefLength * Math.sin(geo.refAngleRad);
                    const angleEndX = cx + screenAngleLength * Math.cos(geo.angleLineRad);
                    const angleEndY = cy + screenAngleLength * Math.sin(geo.angleLineRad);
                    
                    // Alte Elemente entfernen
                    const groupIds = getAngleGroupElementIds(baseId);
                    const newElements = elements.filter(el => !groupIds.includes(el.id));
                    addToHistory(newElements);
                    setSelectedElementId(null);
                    
                    // Canvas-Snapshot erstellen bevor Protractor-Overlay geöffnet wird
                    if (canvasRef.current) {
                      captureRef(canvasRef.current, {
                        format: 'png',
                        quality: 0.8,
                        result: 'data-uri',
                      }).then((uri: string) => {
                        protractorCanvasSnapshot.current = uri;
                      }).catch(() => {
                        protractorCanvasSnapshot.current = null;
                      });
                    }
                    
                    // Winkelmesser mit den Positionen öffnen
                    setProtractorCenter({ x: cx, y: cy });
                    setProtractorRefEnd({ x: refEndX, y: refEndY });
                    setProtractorAngleEnd({ x: angleEndX, y: angleEndY });
                    setShowProtractorHint(false); // Kein Hinweis beim Bearbeiten
                    setShowProtractor(true);
                  };
                  
                  // Frische Messung wenn möglich, sonst canvasLayout verwenden
                  if (canvasRef.current && Platform.OS !== 'web' && typeof (canvasRef.current as any).measureInWindow === 'function') {
                    (canvasRef.current as any).measureInWindow((x: number, y: number, w: number, h: number) => {
                      doConvert({ x, y, width: w, height: h });
                    });
                  } else {
                    doConvert(canvasLayout);
                  }
                }
              }}
            >
              <Ionicons name="pencil" size={16} color="#fff" />
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>{t('sketches.adjustAngle')}</Text>
            </TouchableOpacity>
          )}
          {/* "Zu Projektfotos hinzufügen" Button wenn ein Bild-Element ausgewählt ist */}
          {selectedElementId && elements.find(el => el.id === selectedElementId)?.type === 'image' && elements.find(el => el.id === selectedElementId)?.data?.uri && (
            <TouchableOpacity 
              style={{
                backgroundColor: '#1976d2',
                borderRadius: 20,
                paddingHorizontal: 14,
                paddingVertical: 8,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                marginTop: 4,
              }}
              onPress={async () => {
                try {
                  const selEl = elements.find(el => el.id === selectedElementId);
                  console.log('[FOTO-KOPIE] Start - projectId:', projectId, 'selectedId:', selectedElementId, 'type:', selEl?.type);
                  
                  if (!projectId) {
                    Alert.alert(t('common.error'), t('sketches.noProjectAssigned'));
                    return;
                  }
                  if (!selEl?.data?.uri) {
                    Alert.alert(t('common.error'), t('sketches.noImageAvailable'));
                    return;
                  }
                  
                  const imageUri = selEl.data.uri;
                  console.log('[FOTO-KOPIE] URI Länge:', imageUri.length, 'Prefix:', imageUri.substring(0, 30));
                  
                  const newPhoto = await PhotoService.create({
                    project_id: projectId,
                    uri: imageUri,
                    image_data: imageUri,
                    description: `Aus Skizze übernommen (${new Date().toLocaleDateString('de-DE')})`,
                  });
                  console.log('[FOTO-KOPIE] Erfolgreich! Photo-ID:', newPhoto.id);
                  Alert.alert(t('common.saved'), t('sketches.photoSaved'));
                } catch (err: any) {
                  console.error('[FOTO-KOPIE] Fehler:', err?.message || err);
                  Alert.alert(t('common.error'), `${t('sketches.photoSaveError')}: ${err?.message || t('sketches.unknownError')}`);
                }
              }}
            >
              <Ionicons name="images-outline" size={16} color="#fff" />
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>{t('sketches.toProjectPhotos')}</Text>
            </TouchableOpacity>
          )}
          {photoEditMode && (
            <View style={styles.photoEditBadge}>
              <Ionicons name="image-outline" size={14} color="#fff" />
              <Text style={styles.photoEditBadgeText}>{t('sketches.photoMode')}</Text>
            </View>
          )}
          {/* Zoom-Badge zeigen wenn nicht 100% */}
          {Math.abs(scale - 1) > 0.05 && (
            <View style={[styles.photoEditBadge, { backgroundColor: '#FF9800', flexDirection: 'row', alignItems: 'center', gap: 6 }]}>
              <Ionicons name="search-outline" size={14} color="#fff" />
              <Text style={styles.photoEditBadgeText}>Zoom {Math.round(scale * 100)}%</Text>
              <TouchableOpacity onPress={resetAndroidZoom} style={{ marginLeft: 4, backgroundColor: 'rgba(255,255,255,0.3)', borderRadius: 10, paddingHorizontal: 6, paddingVertical: 2 }}>
                <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700' }}>100%</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

      </View>
      </Animated.View>
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
              {t('sketches.groundPlan')}: {polylinePoints.length}
            </Text>
          </View>
          
          {/* Winkel-Snap + Raster-Snap Toggles */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingBottom: 4, flexWrap: 'wrap' }}>
            {/* Winkel-Snap Toggle */}
            <TouchableOpacity 
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                backgroundColor: angleSnapEnabled ? '#1976d2' : '#e0e0e0',
                borderRadius: 6,
                paddingHorizontal: 8,
                paddingVertical: 4,
                gap: 4,
              }}
              onPress={() => setAngleSnapEnabled(!angleSnapEnabled)}
              activeOpacity={0.7}
            >
              <Ionicons name="git-branch-outline" size={14} color={angleSnapEnabled ? '#fff' : '#666'} />
              <Text style={{ fontSize: 11, fontWeight: '600', color: angleSnapEnabled ? '#fff' : '#666' }}>
                {angleSnapEnabled ? `${angleSnapValue}°` : 'Winkel'}
              </Text>
            </TouchableOpacity>
            
            {angleSnapEnabled && (
              <View style={{ flexDirection: 'row', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
                {[30, 45, 60, 90, 120].map(angle => (
                  <TouchableOpacity
                    key={`snap-${angle}`}
                    style={{
                      backgroundColor: angleSnapValue === angle ? '#1565c0' : '#f0f0f0',
                      borderRadius: 4,
                      paddingHorizontal: 6,
                      paddingVertical: 3,
                    }}
                    onPress={() => setAngleSnapValue(angle)}
                    activeOpacity={0.7}
                  >
                    <Text style={{ fontSize: 10, fontWeight: '600', color: angleSnapValue === angle ? '#fff' : '#666' }}>
                      {angle}°
                    </Text>
                  </TouchableOpacity>
                ))}
                {/* Benutzerdefinierter Winkel - + / - Buttons */}
                <TouchableOpacity
                  style={{
                    backgroundColor: '#f0f0f0',
                    borderRadius: 4,
                    paddingHorizontal: 5,
                    paddingVertical: 3,
                  }}
                  onPress={() => setAngleSnapValue(Math.max(5, angleSnapValue - 5))}
                  activeOpacity={0.7}
                >
                  <Text style={{ fontSize: 12, fontWeight: '700', color: '#666' }}>−</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={{
                    backgroundColor: '#f0f0f0',
                    borderRadius: 4,
                    paddingHorizontal: 5,
                    paddingVertical: 3,
                  }}
                  onPress={() => setAngleSnapValue(Math.min(180, angleSnapValue + 5))}
                  activeOpacity={0.7}
                >
                  <Text style={{ fontSize: 12, fontWeight: '700', color: '#666' }}>+</Text>
                </TouchableOpacity>
              </View>
            )}
            
            {/* Raster-Snap Toggle */}
            {showGrid && !backgroundImage && (
              <TouchableOpacity 
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  backgroundColor: gridSnapEnabled ? '#4caf50' : '#e0e0e0',
                  borderRadius: 6,
                  paddingHorizontal: 8,
                  paddingVertical: 4,
                  gap: 4,
                }}
                onPress={() => setGridSnapEnabled(!gridSnapEnabled)}
                activeOpacity={0.7}
              >
                <Ionicons name="grid-outline" size={14} color={gridSnapEnabled ? '#fff' : '#666'} />
                <Text style={{ fontSize: 11, fontWeight: '600', color: gridSnapEnabled ? '#fff' : '#666' }}>
                  Raster
                </Text>
              </TouchableOpacity>
            )}
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
          <Text style={styles.sketchLegendTitle}>{t('sketches.overview')}</Text>
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

      {/* Schwebendes Maß-Eingabe Panel */}
      {showLineMeasurementNumpad && (() => {
        // Dynamische Breite: Im Buchstaben-Modus auf iPhone breiter für QWERTZ-Layout
        const measureNumericWidth = isPhoneDevice
          ? (numpadSize === 'L' ? Math.max(Math.round(screenWidth * 0.55), 200) : numpadSize === 'M' ? Math.max(Math.round(screenWidth * 0.45), 170) : Math.max(Math.round(screenWidth * 0.35), 140))
          : (numpadSize === 'L' ? Math.round(screenWidth * 0.33) : numpadSize === 'M' ? Math.round(screenWidth * 0.27) : Math.round(screenWidth * 0.22));
        const measurePanelWidth = (isPhoneDevice && measureKeyboardMode === 'letters')
          ? Math.round(screenWidth * 0.92)
          : measureNumericWidth;
        return (
        <Animated.View 
          style={[
            styles.floatingMeasurePanel,
            { 
              transform: measurePanelPan.getTranslateTransform(),
              width: measurePanelWidth,
            }
          ]}
        >
          {/* Header: Drag-Handle + Close-Button getrennt für Apple Pencil Kompatibilität */}
          <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#f8f8f8', borderBottomWidth: 1, borderBottomColor: '#e0e0e0' }}>
            <View {...measurePanelPanResponder.panHandlers} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: isPhoneDevice ? 6 : 12, paddingVertical: isPhoneDevice ? 4 : 8 }}>
              <View style={styles.floatingMeasureDragHandle} />
              <Text style={[styles.floatingMeasureTitle, isPhoneDevice && { fontSize: 11 }]} numberOfLines={1}>{t('sketches.enterMeasurement')}</Text>
            </View>
            <Pressable
              onPress={() => {
                setShowLineMeasurementNumpad(false);
                setLineMeasurementExpression('');
                setSelectedLineSegment(null);
              }}
              style={{ 
                width: isPhoneDevice ? 32 : 44, height: isPhoneDevice ? 32 : 44, 
                alignItems: 'center', justifyContent: 'center',
                backgroundColor: '#f0f0f0', borderRadius: isPhoneDevice ? 16 : 22,
                marginRight: isPhoneDevice ? 4 : 6,
              }}
            >
              <Ionicons name="close" size={isPhoneDevice ? 18 : 22} color="#666" />
            </Pressable>
          </View>
          
          {/* Eingabe + Löschen */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, marginBottom: 6 }}>
            <TextInput
              ref={lineMeasurementInputRef}
              style={[styles.modalInput, { flex: 1, marginBottom: 0, fontSize: 15, paddingVertical: 8 }]}
              value={lineMeasurementExpression}
              onChangeText={setLineMeasurementExpression}
              placeholder={
                selectedLineSegment && lineSegmentMeasurements[selectedLineSegment.elementId]?.[selectedLineSegment.segmentIndex]
                  ? `Aktuell: ${lineSegmentMeasurements[selectedLineSegment.elementId][selectedLineSegment.segmentIndex]}`
                  : 'z.B. 2,50m oder Text'
              }
              showSoftInputOnFocus={false}
              caretHidden={false}
            />
            {selectedLineSegment && lineSegmentMeasurements[selectedLineSegment.elementId]?.[selectedLineSegment.segmentIndex] && (
              <TouchableOpacity
                style={{
                  width: 38, height: 38,
                  alignItems: 'center', justifyContent: 'center',
                  backgroundColor: '#ffebee', borderRadius: 8,
                  borderWidth: 1, borderColor: '#ef9a9a',
                }}
                onPress={() => {
                  removeMeasurementFromSelectedLine();
                  setShowLineMeasurementNumpad(false);
                  setLineMeasurementExpression('');
                }}
              >
                <Ionicons name="trash-outline" size={18} color="#f44336" />
              </TouchableOpacity>
            )}
          </View>
          
          {/* Tastatur-Bereich */}
          <View style={{ paddingHorizontal: 10 }}>
            {/* Umschalt-Leiste: S/M/L + Zahlen/ABC */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <View style={{ flexDirection: 'row', gap: 4 }}>
                {(['S', 'M', 'L'] as const).map(s => (
                  <TouchableOpacity
                    key={s}
                    style={{
                      paddingHorizontal: 10, paddingVertical: 3, borderRadius: 5,
                      backgroundColor: numpadSize === s ? '#1976d2' : '#e8e8e8',
                    }}
                    onPress={() => changeNumpadSize(s)}
                  >
                    <Text style={{ fontSize: 11, fontWeight: '700', color: numpadSize === s ? '#fff' : '#666' }}>{s}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TouchableOpacity
                style={{
                  paddingHorizontal: 14, paddingVertical: 4, borderRadius: 6,
                  backgroundColor: measureKeyboardMode === 'letters' ? '#1976d2' : '#e8e8e8',
                  borderWidth: 1, borderColor: measureKeyboardMode === 'letters' ? '#1565c0' : '#ccc',
                }}
                onPress={() => setMeasureKeyboardMode(measureKeyboardMode === 'numbers' ? 'letters' : 'numbers')}
              >
                <Text style={{ fontSize: 12, fontWeight: '700', color: measureKeyboardMode === 'letters' ? '#fff' : '#555' }}>
                  {measureKeyboardMode === 'numbers' ? 'ABC' : '123'}
                </Text>
              </TouchableOpacity>
            </View>
            
            {(() => {
              const sc = numpadScales[numpadSize];
              const kH = Math.round(36 * sc);
              const fS = Math.round(14 * sc);
              
              if (measureKeyboardMode === 'numbers') {
                const kStyle = [styles.floatingKey, { height: kH }] as any;
                const tStyle = [styles.floatingKeyText, { fontSize: fS }];
                return (
                  <>
                    <View style={styles.floatingKeyRow}>
                      {['7','8','9'].map(k => (
                        <TouchableOpacity key={k} style={kStyle} onPress={() => handleLineMeasurementNumpadPress(k)}>
                          <Text style={tStyle}>{k}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    <View style={styles.floatingKeyRow}>
                      {['4','5','6'].map(k => (
                        <TouchableOpacity key={k} style={kStyle} onPress={() => handleLineMeasurementNumpadPress(k)}>
                          <Text style={tStyle}>{k}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    <View style={styles.floatingKeyRow}>
                      {['1','2','3'].map(k => (
                        <TouchableOpacity key={k} style={kStyle} onPress={() => handleLineMeasurementNumpadPress(k)}>
                          <Text style={tStyle}>{k}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    <View style={styles.floatingKeyRow}>
                      {[',','0','-'].map(k => (
                        <TouchableOpacity key={k} style={kStyle} onPress={() => handleLineMeasurementNumpadPress(k)}>
                          <Text style={tStyle}>{k}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    <View style={styles.floatingKeyRow}>
                      <TouchableOpacity style={[...kStyle, { backgroundColor: '#e3f2fd' }]} onPress={() => handleLineMeasurementNumpadPress('m')}>
                        <Text style={[tStyle, { color: '#1976d2', fontWeight: '700' }]}>m</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[...kStyle, { backgroundColor: '#e3f2fd' }]} onPress={() => handleLineMeasurementNumpadPress('cm')}>
                        <Text style={[tStyle, { color: '#1976d2', fontWeight: '700' }]}>cm</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[...kStyle, { backgroundColor: '#ffebee' }]} onPress={() => handleLineMeasurementNumpadPress('\u232b')}>
                        <Ionicons name="backspace-outline" size={Math.round(18 * sc)} color="#f44336" />
                      </TouchableOpacity>
                    </View>
                  </>
                );
              } else {
                const letterRows = [
                  ['Q','W','E','R','T','Z','U','I','O','P'],
                  ['A','S','D','F','G','H','J','K','L'],
                  ['Y','X','C','V','B','N','M'],
                ];
                const letterKH = Math.round(34 * sc);
                const letterFS = Math.round(12 * sc);
                return (
                  <>
                    {letterRows.map((row, ri) => (
                      <View key={`lr-${ri}`} style={[styles.floatingKeyRow, { gap: 3 }]}>
                        {row.map(letter => (
                          <TouchableOpacity 
                            key={letter} 
                            style={[styles.floatingLetterKey, { height: letterKH, minWidth: Math.round(28 * sc) }]}
                            onPress={() => {
                              setLineMeasurementExpression(prev => prev + (measureKeyboardCaps ? letter : letter.toLowerCase()));
                              if (measureKeyboardCaps) setMeasureKeyboardCaps(false);
                            }}
                          >
                            <Text style={[styles.floatingKeyText, { fontSize: letterFS }]}>{measureKeyboardCaps ? letter : letter.toLowerCase()}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    ))}
                    {/* Umlaute + Shift */}
                    <View style={[styles.floatingKeyRow, { gap: 3 }]}>
                      {['ä','ö','ü','ß'].map(k => (
                        <TouchableOpacity key={k} style={[styles.floatingLetterKey, { height: letterKH }]} onPress={() => {
                          setLineMeasurementExpression(prev => prev + (measureKeyboardCaps ? k.toUpperCase() : k));
                          if (measureKeyboardCaps) setMeasureKeyboardCaps(false);
                        }}>
                          <Text style={[styles.floatingKeyText, { fontSize: letterFS }]}>{measureKeyboardCaps ? k.toUpperCase() : k}</Text>
                        </TouchableOpacity>
                      ))}
                      <TouchableOpacity style={[styles.floatingLetterKey, { height: letterKH, backgroundColor: measureKeyboardCaps ? '#1976d2' : '#f0f0f0' }]} onPress={() => setMeasureKeyboardCaps(!measureKeyboardCaps)}>
                        <Ionicons name="arrow-up" size={Math.round(16 * sc)} color={measureKeyboardCaps ? '#fff' : '#666'} />
                      </TouchableOpacity>
                    </View>
                    {/* . + Leer (breit) + / + - + Backspace */}
                    <View style={[styles.floatingKeyRow, { gap: 3 }]}>
                      <TouchableOpacity style={[styles.floatingLetterKey, { height: letterKH, minWidth: Math.round(24 * sc) }]} onPress={() => setLineMeasurementExpression(prev => prev + '.')}>
                        <Text style={[styles.floatingKeyText, { fontSize: letterFS }]}>.</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.floatingLetterKey, { height: letterKH, flex: 3, backgroundColor: '#e3f2fd' }]} onPress={() => setLineMeasurementExpression(prev => prev + ' ')}>
                        <Text style={[styles.floatingKeyText, { fontSize: letterFS, color: '#1976d2' }]}>{t('sketches.space')}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.floatingLetterKey, { height: letterKH, minWidth: Math.round(24 * sc) }]} onPress={() => setLineMeasurementExpression(prev => prev + '/')}>
                        <Text style={[styles.floatingKeyText, { fontSize: letterFS }]}>/</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.floatingLetterKey, { height: letterKH, minWidth: Math.round(24 * sc) }]} onPress={() => setLineMeasurementExpression(prev => prev + '-')}>
                        <Text style={[styles.floatingKeyText, { fontSize: letterFS }]}>-</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.floatingLetterKey, { height: letterKH, flex: 1, backgroundColor: '#ffebee' }]} onPress={() => handleLineMeasurementNumpadPress('\u232b')}>
                        <Ionicons name="backspace-outline" size={Math.round(16 * sc)} color="#f44336" />
                      </TouchableOpacity>
                    </View>
                  </>
                );
              }
            })()}
          </View>
          
          {/* Einklappbare Maßlinien-Darstellung */}
          <View style={{ paddingHorizontal: 10 }}>
            <TouchableOpacity 
              style={{ 
                flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                paddingVertical: 6, borderTopWidth: 1, borderTopColor: '#e0e0e0', marginTop: 4,
              }}
              onPress={() => setShowMeasureStyleSettings(!showMeasureStyleSettings)}
            >
              <Text style={{ fontSize: 12, fontWeight: '700', color: '#555' }}>Maßlinien-Darstellung</Text>
              <Ionicons name={showMeasureStyleSettings ? 'chevron-up' : 'chevron-down'} size={16} color="#888" />
            </TouchableOpacity>
            
            {showMeasureStyleSettings && (
              <View style={{ paddingBottom: 4 }}>
                <View style={{ marginBottom: 6 }}>
                  <Text style={{ fontSize: 10, color: '#666', marginBottom: 3 }}>{t('sketches.colorLabel')}</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5 }}>
                    {['#1976d2', '#f44336', '#4caf50', '#ff9800', '#9c27b0', '#000000', '#795548', '#607d8b'].map(c => (
                      <TouchableOpacity
                        key={`ml-${c}`}
                        style={{
                          width: 24, height: 24, borderRadius: 12, backgroundColor: c,
                          borderWidth: tempMeasureLineColor === c ? 3 : 1.5,
                          borderColor: tempMeasureLineColor === c ? '#fff' : '#ddd',
                        }}
                        onPress={() => {
                          setTempMeasureLineColor(c);
                          if (selectedLineSegment) {
                            setMeasureLineStyles(prev => ({
                              ...prev,
                              [selectedLineSegment.elementId]: {
                                ...(prev[selectedLineSegment.elementId] || { color: '#1976d2', strokeWidth: 1.2, fontSize: 11 }),
                                color: c,
                              }
                            }));
                          }
                        }}
                      />
                    ))}
                  </View>
                </View>
                <View style={{ marginBottom: 6 }}>
                  <Text style={{ fontSize: 10, color: '#666', marginBottom: 3 }}>Linienstärke:</Text>
                  <View style={{ flexDirection: 'row', gap: 5 }}>
                    {[0.8, 1.2, 2, 3, 4].map(w => (
                      <TouchableOpacity
                        key={`mlw-${w}`}
                        style={{
                          alignItems: 'center', justifyContent: 'center',
                          paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6,
                          backgroundColor: tempMeasureLineStrokeWidth === w ? tempMeasureLineColor : '#f0f0f0',
                          minWidth: 36,
                        }}
                        onPress={() => {
                          setTempMeasureLineStrokeWidth(w);
                          if (selectedLineSegment) {
                            setMeasureLineStyles(prev => ({
                              ...prev,
                              [selectedLineSegment.elementId]: {
                                ...(prev[selectedLineSegment.elementId] || { color: '#1976d2', strokeWidth: 1.2, fontSize: 11 }),
                                strokeWidth: w,
                              }
                            }));
                          }
                        }}
                      >
                        <View style={{
                          width: Math.max(w * 2.5, 4), height: Math.max(w * 2.5, 4),
                          borderRadius: 50, backgroundColor: tempMeasureLineStrokeWidth === w ? '#fff' : '#333',
                        }} />
                        <Text style={{ fontSize: 8, color: tempMeasureLineStrokeWidth === w ? '#fff' : '#666', fontWeight: '500' }}>{w}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
                <View>
                  <Text style={{ fontSize: 10, color: '#666', marginBottom: 3 }}>{t('sketches.fontSize')}:</Text>
                  <View style={{ flexDirection: 'row', gap: 5 }}>
                    {[8, 11, 14, 18, 22].map(fs => (
                      <TouchableOpacity
                        key={`mlfs-${fs}`}
                        style={{
                          alignItems: 'center', justifyContent: 'center',
                          paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6,
                          backgroundColor: tempMeasureLineFontSize === fs ? tempMeasureLineColor : '#f0f0f0',
                          minWidth: 36,
                        }}
                        onPress={() => {
                          setTempMeasureLineFontSize(fs);
                          if (selectedLineSegment) {
                            setMeasureLineStyles(prev => ({
                              ...prev,
                              [selectedLineSegment.elementId]: {
                                ...(prev[selectedLineSegment.elementId] || { color: '#1976d2', strokeWidth: 1.2, fontSize: 11 }),
                                fontSize: fs,
                              }
                            }));
                          }
                        }}
                      >
                        <Text style={{ fontSize: Math.min(fs, 14), color: tempMeasureLineFontSize === fs ? '#fff' : '#333', fontWeight: '700' }}>A</Text>
                        <Text style={{ fontSize: 8, color: tempMeasureLineFontSize === fs ? '#fff' : '#666', fontWeight: '500' }}>{fs}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              </View>
            )}
          </View>
          
          {/* Buttons */}
          <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 10, paddingBottom: 10, paddingTop: 6 }}>
            <TouchableOpacity
              style={{ flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: 'center', backgroundColor: '#f5f5f5', borderWidth: 1, borderColor: '#ddd' }}
              onPress={() => {
                setShowLineMeasurementNumpad(false);
                setLineMeasurementExpression('');
                setSelectedLineSegment(null);
              }}
            >
              <Text style={{ fontSize: 14, fontWeight: '600', color: '#666' }} numberOfLines={1}>{t('common.cancel')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={{ flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: 'center', backgroundColor: '#1976d2' }}
              onPress={() => {
                if (lineMeasurementExpression.trim()) {
                  addMeasurementToSelectedLine();
                } else {
                  setShowLineMeasurementNumpad(false);
                  setLineMeasurementExpression('');
                  setSelectedLineSegment(null);
                }
              }}
            >
              <Text style={{ fontSize: 14, fontWeight: '600', color: '#fff' }} numberOfLines={1}>
                {lineMeasurementExpression.trim() ? t('common.add') : t('common.done')}
              </Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
        );
      })()}

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
                <Text style={styles.modalLabel}>{t('sketches.fontSize')}: {lastTextFontSize}px</Text>
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
                <Text style={styles.modalLabel}>{t('sketches.fontFamily')}</Text>
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
                <Text style={styles.modalLabel}>{t('sketches.colorLabel')}</Text>
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
                  <Text style={styles.cancelButtonText}>{t('common.cancel')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalButton, styles.confirmButton]}
                  onPress={() => {
                    addTextElement();
                    closeModalNumpad();
                  }}
                >
                  <Text style={styles.confirmButtonText}>{t('common.add')}</Text>
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
                <Text style={styles.modalLabel}>{t('sketches.fontSize')}: {editArrowFontSize}px</Text>
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
                  <Text style={styles.cancelButtonText}>{t('common.cancel')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalButton, styles.confirmButton]}
                  onPress={() => {
                    addArrowElement();
                    closeModalNumpad();
                  }}
                >
                  <Text style={styles.confirmButtonText}>{t('common.add')}</Text>
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
                <Text style={styles.cancelButtonText}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.deleteButton]}
                onPress={deleteSelectedElement}
              >
                <Text style={styles.deleteButtonText}>{t('common.delete')}</Text>
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
                <Text style={styles.modalLabel}>{t('sketches.fontSize')}: {editArrowFontSize}px</Text>
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
                <Text style={styles.modalLabel}>{t('sketches.colorLabel')}</Text>
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
                  <Text style={styles.cancelButtonText}>{t('common.cancel')}</Text>
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
                  <Text style={styles.confirmButtonText}>{t('sketches.update')}</Text>
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
                <Text style={styles.cancelButtonText}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.confirmButton]}
                onPress={() => {
                  addPointerElement();
                  closeModalNumpad();
                }}
              >
                <Text style={styles.confirmButtonText}>{t('common.add')}</Text>
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
              <Text style={styles.modalLabel}>{t('sketches.fontSize')}: {editPointerFontSize}px</Text>
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
                <Text style={styles.modalLabel}>{t('sketches.colorLabel')}</Text>
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
                  <Text style={styles.cancelButtonText}>{t('common.cancel')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalButton, styles.confirmButton]}
                  onPress={updatePointerElement}
                >
                  <Text style={styles.confirmButtonText}>{t('sketches.update')}</Text>
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
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View>
                <Text style={styles.modalTitle}>Notiz hinzufügen</Text>
                <Text style={styles.modalSubtitle}>Text für die Notiz eingeben</Text>
              </View>
              <TouchableOpacity
                style={{
                  backgroundColor: showModalNumpad ? '#1976d2' : '#f0f0f0',
                  paddingHorizontal: 10,
                  paddingVertical: 6,
                  borderRadius: 8,
                }}
                onPress={() => {
                  if (showModalNumpad) {
                    closeModalNumpad();
                  } else {
                    openModalNumpad(setMemoText, memoInputRef);
                  }
                }}
              >
                <Ionicons name="keypad" size={22} color={showModalNumpad ? '#fff' : '#666'} />
              </TouchableOpacity>
            </View>
            <TextInput
              ref={memoInputRef}
              style={styles.modalInput}
              value={memoText}
              onChangeText={setMemoText}
              placeholder="Notiz eingeben"
              autoFocus
              selectTextOnFocus
              showSoftInputOnFocus={!showModalNumpad}
            />
            {renderInModalNumpad()}
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => {
                  setShowMemoModal(false);
                  setMemoText('');
                  setPendingMemo(null);
                }}
              >
                <Text style={styles.cancelButtonText}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.confirmButton]}
                onPress={addMemoElement}
              >
                <Text style={styles.confirmButtonText}>{t('common.add')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Edit Memo Modal - Bestehende Notiz bearbeiten */}
      <Modal visible={showEditMemoModal} transparent animationType="slide">
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.modalContent}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={styles.modalTitle}>Notiz bearbeiten</Text>
              <TouchableOpacity
                style={{
                  backgroundColor: showModalNumpad ? '#1976d2' : '#f0f0f0',
                  paddingHorizontal: 10,
                  paddingVertical: 6,
                  borderRadius: 8,
                }}
                onPress={() => {
                  if (showModalNumpad) {
                    closeModalNumpad();
                  } else {
                    openModalNumpad(setMemoText, memoInputRef);
                  }
                }}
              >
                <Ionicons name="keypad" size={22} color={showModalNumpad ? '#fff' : '#666'} />
              </TouchableOpacity>
            </View>
            <TextInput
              ref={memoInputRef}
              style={styles.modalInput}
              value={memoText}
              onChangeText={setMemoText}
              placeholder="Notiz eingeben"
              multiline
              showSoftInputOnFocus={!showModalNumpad}
            />
            {renderInModalNumpad()}
            {/* Font Size Slider */}
            <View style={styles.sliderContainer}>
              <Text style={styles.modalLabel}>{t('sketches.fontSize')}: {editMemoFontSize}px</Text>
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
              <Text style={styles.modalLabel}>{t('sketches.colorLabel')}</Text>
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
                <Text style={styles.cancelButtonText}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.confirmButton]}
                onPress={updateMemoElement}
              >
                <Text style={styles.confirmButtonText}>{t('sketches.update')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Edit Polygon Modal - Polygon/Polyline Eigenschaften bearbeiten */}
      <Modal visible={showEditPolygonModal} transparent animationType="slide">
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{t('sketches.editShape')}</Text>
            
            {/* Stroke Width Slider */}
            <View style={styles.sliderContainer}>
              <Text style={styles.modalLabel}>{t('sketches.strokeWidthLabel')}: {editPolygonStrokeWidth}px</Text>
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
              <Text style={styles.modalLabel}>{t('sketches.colorLabel')}</Text>
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
                <Text style={styles.cancelButtonText}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.confirmButton]}
                onPress={updatePolygonElement}
              >
                <Text style={styles.confirmButtonText}>{t('sketches.update')}</Text>
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
              <Text style={styles.modalTitle}>{t('sketches.editText')}</Text>
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
                <Text style={styles.modalLabel}>{t('sketches.fontSize')}: {editFontSize}px</Text>
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
                <Text style={styles.modalLabel}>{t('sketches.fontStyle')}</Text>
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
                <Text style={styles.modalLabel}>{t('sketches.fontFamily')}</Text>
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
                <Text style={styles.modalLabel}>{t('sketches.colorLabel')}</Text>
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
                  <Text style={styles.cancelButtonText}>{t('common.cancel')}</Text>
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
                  <Text style={styles.confirmButtonText}>{t('sketches.update')}</Text>
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
            <Text style={styles.modalTitle}>{t('sketches.sketchNotes')}</Text>
            <Text style={styles.modalSubtitle}>{t('sketches.sketchNotesSubtitle')}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
              <TextInput
                ref={notesInputRef}
                style={[styles.modalInput, styles.notesInput, { flex: 1 }]}
                value={notes}
                onChangeText={setNotes}
                placeholder={t('sketches.notes')}
                placeholderTextColor="#999"
                multiline
                autoFocus
                textAlignVertical="top"
                showSoftInputOnFocus={!showModalNumpad}
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
                <Text style={styles.notesModalButtonText}>{t('common.close')}</Text>
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
                  <Text style={styles.notesModalButtonTextWhite}>{t('common.delete')}</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[styles.notesModalButton, styles.notesModalButtonSave]}
                onPress={() => {
                  closeModalNumpad();
                  setShowNotesModal(false);
                }}
              >
                <Text style={styles.notesModalButtonTextWhite}>{t('common.save')}</Text>
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
              <Text style={styles.modalTitle}>{t('sketches.selectProjectPhotos')}</Text>
              <TouchableOpacity onPress={() => setShowProjectPhotosModal(false)}>
                <Ionicons name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>
            
            {projectPhotos.length === 0 ? (
              <View style={{ padding: 40, alignItems: 'center' }}>
                <Ionicons name="images-outline" size={48} color="#ccc" />
                <Text style={{ marginTop: 16, color: '#666', textAlign: 'center' }}>
                  {t('sketches.noProjectPhotos')}
                </Text>
                <Text style={{ marginTop: 8, color: '#999', fontSize: 12, textAlign: 'center' }}>
                  {t('sketches.addPhotosHint')}
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
                          resizeMode="stretch"
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
                <Text style={styles.cancelButtonText}>{t('common.cancel')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* PDF Konverter Modal (pdf.js via WebView - funktioniert ohne native Module) */}
      <Modal visible={showPdfConverter} transparent animationType="fade">
        <View style={styles.cropModalOverlay}>
          <View style={[styles.cropModalContent, { maxHeight: '90%' }]}>
            <Text style={styles.cropModalTitle}>PDF importieren</Text>
            <Text style={styles.cropModalSubtitle}>
              Seite {selectedPdfPage} von {pdfTotalPages} wird als Bild eingefügt
            </Text>
            
            {/* PDF Vorschau via WebView */}
            <View style={{ width: '100%', height: 400, backgroundColor: '#525659', borderRadius: 8, overflow: 'hidden' }}>
              {pdfBase64Data && (
                <WebView
                  ref={pdfWebViewRef}
                  originWhitelist={['*']}
                  source={{ html: getPdfConverterHtml() }}
                  onMessage={handlePdfWebViewMessage}
                  style={{ flex: 1 }}
                  javaScriptEnabled={true}
                  domStorageEnabled={true}
                  scrollEnabled={false}
                />
              )}
            </View>
            
            {/* Seitennavigation bei mehrseitigen PDFs */}
            {pdfTotalPages > 1 && (
              <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 12, gap: 16 }}>
                <TouchableOpacity
                  onPress={() => {
                    if (selectedPdfPage > 1) {
                      const newPage = selectedPdfPage - 1;
                      setSelectedPdfPage(newPage);
                      pdfWebViewRef.current?.injectJavaScript(`showPage(${newPage}); true;`);
                    }
                  }}
                  disabled={selectedPdfPage <= 1}
                  style={[styles.cropActionButton, { opacity: selectedPdfPage <= 1 ? 0.4 : 1, minWidth: 100 }]}
                >
                  <Ionicons name="chevron-back" size={20} color="#fff" />
                  <Text style={styles.cropActionText}>Zurück</Text>
                </TouchableOpacity>
                
                <Text style={{ fontSize: 16, fontWeight: '600', color: '#333' }}>
                  {selectedPdfPage} / {pdfTotalPages}
                </Text>
                
                <TouchableOpacity
                  onPress={() => {
                    if (selectedPdfPage < pdfTotalPages) {
                      const newPage = selectedPdfPage + 1;
                      setSelectedPdfPage(newPage);
                      pdfWebViewRef.current?.injectJavaScript(`showPage(${newPage}); true;`);
                    }
                  }}
                  disabled={selectedPdfPage >= pdfTotalPages}
                  style={[styles.cropActionButton, { opacity: selectedPdfPage >= pdfTotalPages ? 0.4 : 1, minWidth: 100 }]}
                >
                  <Text style={styles.cropActionText}>Weiter</Text>
                  <Ionicons name="chevron-forward" size={20} color="#fff" />
                </TouchableOpacity>
              </View>
            )}
            
            {/* Aktionsbuttons */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 16, gap: 12 }}>
              <TouchableOpacity
                onPress={() => {
                  setShowPdfConverter(false);
                  setPdfBase64Data(null);
                }}
                style={[styles.cropActionButton, { backgroundColor: '#757575', flex: 1 }]}
              >
                <Text style={styles.cropActionText}>Abbrechen</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                onPress={convertPdfPageToImage}
                style={[styles.cropActionButton, { backgroundColor: '#4CAF50', flex: 1 }]}
              >
                <Ionicons name="checkmark" size={20} color="#fff" />
                <Text style={styles.cropActionText}>Seite einfügen</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Crop Modal */}
      <Modal visible={showCropModal} transparent animationType="fade">
        <View style={styles.cropModalOverlay}>
          <View style={styles.cropModalContent}>
            <Text style={styles.cropModalTitle}>{t('sketches.cropPhoto')}</Text>
            <Text style={styles.cropModalSubtitle}>{t('sketches.cropSubtitle')}</Text>
            
            <View 
              ref={cropContainerRef}
              style={[styles.cropImageContainer, { width: cropContainerSize, height: cropContainerSize }]}
              onLayout={(event) => {
                const { width } = event.nativeEvent.layout;
                if (width > 0 && width !== cropContainerSize) {
                  console.log('[Crop] Container size measured:', width);
                  setCropContainerSize(width);
                  cropContainerSizeRef.current = width;
                  // Passe CropBox proportional an wenn Container-Größe sich ändert
                  const scale = width / cropContainerSize;
                  if (scale !== 1) {
                    setCropBox(prev => ({
                      x: prev.x * scale,
                      y: prev.y * scale,
                      width: prev.width * scale,
                      height: prev.height * scale,
                    }));
                  }
                }
              }}
              {...cropPanResponder.panHandlers}
            >
              {cropImageUri && (
                <RNImage
                  source={{ uri: cropImageUri }}
                  style={[styles.cropImage, { width: cropContainerSize, height: cropContainerSize }]}
                  resizeMode="contain"
                  pointerEvents="none"
                />
              )}
              
              {/* Dunkle Overlay außerhalb der Crop-Box */}
              <View style={[styles.cropOverlay, styles.cropOverlayTop, { height: cropBox.y }]} pointerEvents="none" />
              <View style={[styles.cropOverlay, styles.cropOverlayBottom, { top: cropBox.y + cropBox.height, height: Math.max(0, cropContainerSize - cropBox.y - cropBox.height) }]} pointerEvents="none" />
              <View style={[styles.cropOverlay, styles.cropOverlayLeft, { top: cropBox.y, height: cropBox.height, width: cropBox.x }]} pointerEvents="none" />
              <View style={[styles.cropOverlay, styles.cropOverlayRight, { top: cropBox.y, height: cropBox.height, left: cropBox.x + cropBox.width, width: Math.max(0, cropContainerSize - cropBox.x - cropBox.width) }]} pointerEvents="none" />
              
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
                <Text style={styles.cropButtonText}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.cropApplyButton} onPress={applyCrop}>
                <Ionicons name="checkmark" size={20} color="#fff" />
                <Text style={styles.cropButtonText}>{t('sketches.applyBtn')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Lupe (Magnifier) Overlay für präzises Positionieren von Maßlinien-Endpunkten */}
      {showMagnifier && magnifierPosition && magnifierTargetPosition && (() => {
        // Intelligente Positionierung: Nah am Punkt, aber ohne ihn zu verdecken
        const magnifierSize = isPhoneDevice ? 90 : 110;
        const coordsHeight = isPhoneDevice ? 20 : 25;
        const totalHeight = magnifierSize + coordsHeight;
        const offsetAbove = isPhoneDevice ? 25 : 40; // Abstand über dem Punkt
        const offsetBelow = isPhoneDevice ? 25 : 40; // Abstand unter dem Punkt
        const minTop = isPhoneDevice ? 10 : 10; // Minimum-Abstand zum oberen Rand
        
        // Berechne ideale Position über dem Punkt
        let magTop = magnifierPosition.y - totalHeight - offsetAbove;
        let showBelow = false;
        
        // Wenn die Lupe oben aus dem Bildschirm ragt → nach unten verschieben
        if (magTop < minTop) {
          magTop = magnifierPosition.y + offsetBelow;
          showBelow = true;
        }
        
        // Auf iPhone: Prüfen ob die Lupe hinter dem Protractor-Panel verschwindet
        // Panel ist ca. 200px hoch, ab bottom: 20 → oberkante bei screenHeight - 220
        if (isPhoneDevice && showProtractor && magTop + totalHeight > screenHeight - 220) {
          // Über dem Punkt platzieren, notfalls ganz oben
          magTop = Math.max(minTop, magnifierPosition.y - totalHeight - offsetAbove);
        }
        
        // Horizontal: zentriert über dem Punkt, aber im Bildschirm halten
        let magLeft = magnifierPosition.x - magnifierSize / 2;
        magLeft = Math.max(5, Math.min(magLeft, screenWidth - magnifierSize - 5));
        
        const halfSize = magnifierSize / 2;
        
        // Canvas-Koordinaten direkt verwenden
        const targetX = magnifierTargetPosition.x;
        const targetY = magnifierTargetPosition.y;
        
        return (
        <View
          style={[
            styles.magnifierOverlay,
            {
              left: magLeft,
              top: magTop,
              width: magnifierSize + 10,
              zIndex: 10001, // Über dem Protractor-Panel
            },
          ]}
          pointerEvents="none"
        >
          <View style={styles.magnifierContent}>
            {/* Runder Lupen-Container mit Bild */}
            <View style={[styles.magnifierCircle, isPhoneDevice && { width: magnifierSize, height: magnifierSize, borderRadius: magnifierSize / 2 }]}>
              {/* Canvas-Snapshot oder Hintergrundbild vergrößert */}
              {backgroundImage ? (
                <View style={[styles.magnifierImageContainer, isPhoneDevice && { width: magnifierSize, height: magnifierSize, borderRadius: magnifierSize / 2 }]}>
                  <RNImage
                    source={{ uri: backgroundImage }}
                    style={{
                      // Hintergrundbild direkt verwenden
                      width: screenWidth * 3,
                      height: canvasHeight * 3,
                      position: 'absolute',
                      // Android-Handy mit Hintergrundbild: Offset für Winkelmesser und andere Tools
                      left: -targetX * 3 + halfSize,
                      top: Platform.OS === 'android' && isPhoneDevice 
                        ? -(targetY - canvasOverhead * 0.4) * 3 + halfSize
                        : -(targetY - ((canvasLayout?.y || canvasOverhead) - canvasOverhead) * 0.4) * 3 + halfSize,
                    }}
                    resizeMode="contain"
                  />
                </View>
              ) : (showProtractor && protractorCanvasSnapshot.current) ? (
                /* WINKELMESSER: Eigener Canvas-Snapshot MIT Android-Offset */
                <View style={[styles.magnifierImageContainer, isPhoneDevice && { width: magnifierSize, height: magnifierSize, borderRadius: magnifierSize / 2 }]}>
                  <RNImage
                    source={{ uri: protractorCanvasSnapshot.current }}
                    style={{
                      width: screenWidth * 3,
                      height: canvasHeight * 3,
                      position: 'absolute',
                      left: -targetX * 3 + halfSize,
                      top: Platform.OS === 'android' && isPhoneDevice 
                        ? -(targetY - canvasOverhead * 0.4) * 3 + halfSize
                        : -(targetY - ((canvasLayout?.y || canvasOverhead) - canvasOverhead) * 0.4) * 3 + halfSize,
                    }}
                    resizeMode="stretch"
                  />
                </View>
              ) : magnifierSnapshot ? (
                <View style={[styles.magnifierImageContainer, isPhoneDevice && { width: magnifierSize, height: magnifierSize, borderRadius: magnifierSize / 2 }]}>
                  <RNImage
                    source={{ uri: magnifierSnapshot }}
                    style={{
                      // Canvas-Snapshot für Maßlinien/Polygone: Android braucht KEINEN Offset
                      width: screenWidth * 3,
                      height: canvasHeight * 3,
                      position: 'absolute',
                      left: -targetX * 3 + halfSize,
                      top: Platform.OS === 'android'
                        ? -targetY * 3 + halfSize
                        : -(targetY - ((canvasLayout?.y || canvasOverhead) - canvasOverhead) * 0.4) * 3 + halfSize,
                    }}
                    resizeMode="stretch"
                  />
                </View>
              ) : (
                /* Grid-basierte Lupe als Fallback (kein Bild verfügbar) */
                <Svg width={magnifierSize} height={magnifierSize} style={{ position: 'absolute', top: 0, left: 0 }}>
                  <Circle cx={halfSize} cy={halfSize} r={halfSize} fill="#f8f9fa" />
                  {Array.from({ length: Math.ceil(magnifierSize / 30) + 1 }, (_, i) => {
                    const pos = (i * 30) - ((Math.round(targetX) * 3) % 30);
                    return pos >= 0 && pos <= magnifierSize ? (
                      <Line key={`gv${i}`} x1={pos} y1={0} x2={pos} y2={magnifierSize} stroke="#e0e0e0" strokeWidth={0.5} />
                    ) : null;
                  })}
                  {Array.from({ length: Math.ceil(magnifierSize / 30) + 1 }, (_, i) => {
                    const pos = (i * 30) - ((Math.round(targetY) * 3) % 30);
                    return pos >= 0 && pos <= magnifierSize ? (
                      <Line key={`gh${i}`} x1={0} y1={pos} x2={magnifierSize} y2={pos} stroke="#e0e0e0" strokeWidth={0.5} />
                    ) : null;
                  })}
                </Svg>
              )}
              
              {/* Fadenkreuz-Overlay */}
              <Svg width={magnifierSize} height={magnifierSize} style={styles.magnifierCrosshair}>
                {/* Fadenkreuz */}
                <Line x1={halfSize} y1={8} x2={halfSize} y2={magnifierSize - 8} stroke="#f44336" strokeWidth={1.5} opacity={0.8} />
                <Line x1={8} y1={halfSize} x2={magnifierSize - 8} y2={halfSize} stroke="#f44336" strokeWidth={1.5} opacity={0.8} />
                {/* Zentraler Kreis */}
                <Circle cx={halfSize} cy={halfSize} r={3} fill="none" stroke="#f44336" strokeWidth={2} />
                {/* Rahmen */}
                <Circle cx={halfSize} cy={halfSize} r={halfSize - 2} fill="none" stroke="#1976d2" strokeWidth={3} />
              </Svg>
            </View>
            
            {/* Koordinaten-Anzeige */}
            <View style={styles.magnifierCoords}>
              <Text style={[styles.magnifierCoordsText, isPhoneDevice && { fontSize: 9 }]}>
                X: {Math.round(magnifierTargetPosition.x)}
              </Text>
              <Text style={[styles.magnifierCoordsText, isPhoneDevice && { fontSize: 9 }]}>
                Y: {Math.round(magnifierTargetPosition.y)}
              </Text>
            </View>
          </View>
          
          {/* Verbindungslinie zum Zielpunkt */}
          <View style={styles.magnifierLine} />
        </View>
        );
      })()}

      {/* ========== EINFACHER WINKELMESSER OVERLAY (ohne Lupe) ========== */}
      {simpleAngleMode && (
        <View style={styles.protractorOverlay} pointerEvents="box-none">
          <Svg 
            width={screenWidth} 
            height={screenHeight} 
            viewBox={`0 0 ${screenWidth} ${screenHeight}`}
            style={{ position: 'absolute', top: 0, left: 0 }}
            pointerEvents="none"
          >
            {/* Punkte zeichnen */}
            {simpleAnglePoints.map((pt, idx) => {
              const screenPt = canvasToScreenCoords(pt.x, pt.y);
              const color = idx === 0 ? '#2196f3' : idx === 1 ? '#4caf50' : '#FF5722';
              const label = idx === 0 ? '1' : idx === 1 ? 'S' : '2';
              return (
                <G key={idx}>
                  <Circle cx={screenPt.x} cy={screenPt.y} r={12} fill={color} />
                  <SvgText x={screenPt.x} y={screenPt.y + 5} fill="#fff" fontSize={14} fontWeight="bold" textAnchor="middle">{label}</SvgText>
                </G>
              );
            })}
            
            {/* Linien vom Scheitelpunkt zu den Schenkelpunkten */}
            {simpleAnglePoints.length >= 2 && (() => {
              const p1 = canvasToScreenCoords(simpleAnglePoints[0].x, simpleAnglePoints[0].y);
              const vertex = canvasToScreenCoords(simpleAnglePoints[1].x, simpleAnglePoints[1].y);
              return (
                <Line x1={vertex.x} y1={vertex.y} x2={p1.x} y2={p1.y} stroke="#2196f3" strokeWidth={3} />
              );
            })()}
            
            {simpleAnglePoints.length === 3 && (() => {
              const vertex = canvasToScreenCoords(simpleAnglePoints[1].x, simpleAnglePoints[1].y);
              const p3 = canvasToScreenCoords(simpleAnglePoints[2].x, simpleAnglePoints[2].y);
              return (
                <Line x1={vertex.x} y1={vertex.y} x2={p3.x} y2={p3.y} stroke="#FF5722" strokeWidth={3} />
              );
            })()}
            
            {/* Winkelbogen */}
            {simpleAnglePoints.length === 3 && simpleAngleResult !== null && (() => {
              const p1 = canvasToScreenCoords(simpleAnglePoints[0].x, simpleAnglePoints[0].y);
              const vertex = canvasToScreenCoords(simpleAnglePoints[1].x, simpleAnglePoints[1].y);
              const p3 = canvasToScreenCoords(simpleAnglePoints[2].x, simpleAnglePoints[2].y);
              
              const angle1 = Math.atan2(p1.y - vertex.y, p1.x - vertex.x);
              const angle3 = Math.atan2(p3.y - vertex.y, p3.x - vertex.x);
              const arcR = 35;
              
              const arcX1 = vertex.x + arcR * Math.cos(angle1);
              const arcY1 = vertex.y + arcR * Math.sin(angle1);
              const arcX2 = vertex.x + arcR * Math.cos(angle3);
              const arcY2 = vertex.y + arcR * Math.sin(angle3);
              
              const largeArc = simpleAngleResult > 180 ? 1 : 0;
              
              return (
                <Path 
                  d={`M ${arcX1} ${arcY1} A ${arcR} ${arcR} 0 ${largeArc} 1 ${arcX2} ${arcY2}`}
                  fill="none" stroke="#4caf50" strokeWidth={3}
                />
              );
            })()}
          </Svg>
          
          {/* Anleitung & Ergebnis-Box */}
          <View style={{
            position: 'absolute',
            top: 60,
            left: 10,
            right: 10,
            backgroundColor: 'rgba(0,0,0,0.85)',
            borderRadius: 10,
            padding: 12,
          }}>
            <Text style={{ color: '#fff', fontSize: 14, fontWeight: 'bold', marginBottom: 8 }}>
              📐 Einfacher Winkelmesser
            </Text>
            
            {simpleAnglePoints.length === 0 && (
              <Text style={{ color: '#2196f3', fontSize: 13 }}>
                ① Tippen Sie auf den ersten Schenkel-Punkt
              </Text>
            )}
            {simpleAnglePoints.length === 1 && (
              <Text style={{ color: '#4caf50', fontSize: 13 }}>
                ② Tippen Sie auf den Scheitelpunkt (Ecke)
              </Text>
            )}
            {simpleAnglePoints.length === 2 && (
              <Text style={{ color: '#FF5722', fontSize: 13 }}>
                ③ Tippen Sie auf den zweiten Schenkel-Punkt
              </Text>
            )}
            {simpleAnglePoints.length === 3 && simpleAngleResult !== null && (
              <View>
                <Text style={{ color: '#4caf50', fontSize: 18, fontWeight: 'bold', textAlign: 'center' }}>
                  Winkel: {simpleAngleResult}°
                </Text>
                <TouchableOpacity 
                  style={{ 
                    backgroundColor: '#2196f3', 
                    padding: 10, 
                    borderRadius: 8, 
                    marginTop: 10 
                  }}
                  onPress={() => {
                    setSimpleAnglePoints([]);
                    setSimpleAngleResult(null);
                  }}
                >
                  <Text style={{ color: '#fff', textAlign: 'center', fontWeight: 'bold' }}>
                    Neuen Winkel messen
                  </Text>
                </TouchableOpacity>
              </View>
            )}
            
            <TouchableOpacity 
              style={{ 
                backgroundColor: '#666', 
                padding: 8, 
                borderRadius: 8, 
                marginTop: 10 
              }}
              onPress={() => {
                setSimpleAngleMode(false);
                setSimpleAnglePoints([]);
                setSimpleAngleResult(null);
              }}
            >
              <Text style={{ color: '#fff', textAlign: 'center' }}>Schließen</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Winkelmesser Steuerelemente (Touch-Handler sind jetzt im Canvas-Container) */}
      {showProtractor && (
        <View 
          style={{ 
            position: 'absolute', 
            top: 0,
            left: 0, 
            right: 0,
            bottom: 0,
          }} 
          pointerEvents="box-none"
        >
          {/* Kompakte Steuerelemente - verschiebbar */}
          <Animated.View 
            style={[
              styles.protractorBottomControls, 
              { 
                zIndex: 10,
                transform: protractorPanelPan.getTranslateTransform(),
              },
              isPhoneDevice && {
                bottom: 70, // Erhöht von 20 auf 70 um Navigationsleiste zu vermeiden
                left: 10,
                right: 10,
                gap: 6,
              },
            ]}
          >
            {/* Drag-Handle */}
            <View {...protractorPanelPanResponder.panHandlers}>
              <View style={{
                width: 40, height: 5, borderRadius: 3,
                backgroundColor: '#ccc', alignSelf: 'center', marginBottom: isPhoneDevice ? 2 : 6,
              }} />
            </View>
            
            {/* DEBUG: Koordinaten-Anzeige */}
            {protractorDebugInfo && (
              <View style={{ backgroundColor: 'rgba(0,0,0,0.7)', padding: 4, marginBottom: 4, borderRadius: 4 }}>
                <Text style={{ color: '#fff', fontSize: 9 }}>
                  Canvas: {protractorDebugInfo.canvasCenter} | Screen: {protractorDebugInfo.screenCenter}
                </Text>
                <Text style={{ color: '#fff', fontSize: 9 }}>
                  Layout: {protractorDebugInfo.layoutXY} | Scale: {protractorDebugInfo.scale} | Pan: {protractorDebugInfo.pan}
                </Text>
              </View>
            )}
            
            {/* Winkel-Anzeige - kompaktes Badge */}
            <View style={{ alignItems: 'center', marginBottom: isPhoneDevice ? 6 : 10 }}>
              <View 
                style={{
                  backgroundColor: '#FF5722',
                  paddingHorizontal: isPhoneDevice ? 12 : 16,
                  paddingVertical: isPhoneDevice ? 4 : 6,
                  borderRadius: 12,
                  minWidth: isPhoneDevice ? 50 : 60,
                  alignItems: 'center',
                }}
              >
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: isPhoneDevice ? 14 : 16 }}>
                  {`${calculatedAngle}°`}
                </Text>
              </View>
            </View>
            
            {/* Aktions-Buttons - kompakt auf iPhone */}
            <View style={{ flexDirection: 'row', gap: isPhoneDevice ? 8 : 12, justifyContent: 'center' }}>
              <TouchableOpacity 
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  backgroundColor: '#f44336',
                  paddingHorizontal: isPhoneDevice ? 14 : 20,
                  paddingVertical: isPhoneDevice ? 8 : 12,
                  borderRadius: 20,
                  gap: isPhoneDevice ? 4 : 8,
                }}
                onPress={() => setShowProtractor(false)}
              >
                <Ionicons name="close-circle" size={isPhoneDevice ? 18 : 22} color="#fff" />
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: isPhoneDevice ? 12 : 15 }}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.protractorAddBtn, isPhoneDevice && { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 }]}
                onPress={addProtractorToSketch}
              >
                <Ionicons name="checkmark-circle" size={isPhoneDevice ? 18 : 24} color="#fff" />
                <Text style={[styles.protractorAddBtnText, isPhoneDevice && { fontSize: 12 }]}>{t('common.add')}</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
          
          {/* Hinweis-Overlay beim Öffnen */}
          {showProtractorHint && (
            <TouchableOpacity 
              style={{
                ...StyleSheet.absoluteFillObject,
                backgroundColor: 'rgba(0,0,0,0.6)',
                justifyContent: 'center',
                alignItems: 'center',
                zIndex: 100,
                padding: 24,
              }}
              activeOpacity={1}
              onPress={() => setShowProtractorHint(false)}
            >
              <View style={{
                backgroundColor: '#fff',
                borderRadius: 16,
                padding: 24,
                maxWidth: 360,
                width: '90%',
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.3,
                shadowRadius: 8,
                elevation: 8,
              }}>
                <Text style={{ fontSize: 20, fontWeight: '700', color: '#333', marginBottom: 16, textAlign: 'center' }}>
                  Winkelmesser
                </Text>
                
                <View style={{ marginBottom: 12 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                    <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: '#FF5722', marginRight: 10 }} />
                    <Text style={{ fontSize: 14, color: '#555', flex: 1 }}>
                      Mittelpunkt auf die Ecke ziehen
                    </Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                    <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: '#2196f3', marginRight: 10 }} />
                    <Text style={{ fontSize: 14, color: '#555', flex: 1 }}>
                      Referenzlinie auf die erste Kante ziehen
                    </Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                    <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: '#FF5722', marginRight: 10, borderWidth: 2, borderColor: '#fff' }} />
                    <Text style={{ fontSize: 14, color: '#555', flex: 1 }}>
                      Winkellinie auf die zweite Kante ziehen
                    </Text>
                  </View>
                </View>
                
                <View style={{ backgroundColor: '#FFF3E0', borderRadius: 8, padding: 10, marginBottom: 16 }}>
                  <Text style={{ fontSize: 12, color: '#E65100', textAlign: 'center' }}>
                    Tipp: Für genaue Ergebnisse das Foto möglichst frontal zur Oberfläche aufnehmen
                  </Text>
                </View>
                
                <TouchableOpacity 
                  style={{
                    backgroundColor: '#FF5722',
                    borderRadius: 25,
                    paddingVertical: 12,
                    alignItems: 'center',
                  }}
                  onPress={() => setShowProtractorHint(false)}
                >
                  <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>{t('sketches.understood')}</Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          )}
          
          {/* Schließen-Button */}
          <TouchableOpacity 
            style={[styles.protractorCloseButton, { zIndex: 20 }]}
            onPress={() => setShowProtractor(false)}
          >
            <Ionicons name="close-circle" size={44} color="#f44336" />
          </TouchableOpacity>
        </View>
      )}
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
    // paddingTop wird dynamisch über inline-style gesetzt (SafeArea + Landscape)
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
    paddingVertical: 14,
    paddingHorizontal: 8,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
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
    backgroundColor: '#f5f5f5',
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e0e0e0',
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
    bottom: 10,
    backgroundColor: '#fff',
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 15,
    zIndex: 9999,
    alignSelf: 'center',
    left: 0,
    right: 0,
  },
  numpadCloseBtn: {
    padding: 2,
    zIndex: 10,
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
  // Lupe (Magnifier) Styles
  magnifierOverlay: {
    position: 'absolute',
    width: 120,
    alignItems: 'center',
    zIndex: 9999,
  },
  magnifierContent: {
    backgroundColor: 'transparent',
    alignItems: 'center',
  },
  magnifierCircle: {
    width: 110,
    height: 110,
    borderRadius: 55,
    overflow: 'hidden',
    borderWidth: 3,
    borderColor: '#1976d2',
    backgroundColor: '#f5f5f5',
  },
  magnifierImageContainer: {
    width: 110,
    height: 110,
    overflow: 'hidden',
    position: 'relative',
  },
  magnifierGridFallback: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f0f0f0',
  },
  magnifierGridLine: {
    position: 'absolute',
    width: 1,
    height: '100%',
    backgroundColor: '#ddd',
  },
  magnifierGridLineH: {
    width: '100%',
    height: 1,
  },
  magnifierCrosshair: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  magnifierCoords: {
    flexDirection: 'row',
    backgroundColor: 'rgba(25, 118, 210, 0.9)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginTop: 4,
    gap: 8,
  },
  magnifierCoordsText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '600',
  },
  magnifierLine: {
    width: 2,
    height: 20,
    backgroundColor: '#1976d2',
    marginTop: 2,
  },
  // Winkelmesser Styles
  protractorOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  protractorDraggable: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center',
  },
  protractorSvgContainer: {
    width: 300,
    height: 300,
  },
  protractorCloseButton: {
    position: 'absolute',
    top: 40,
    right: 20,
  },
  protractorBottomControls: {
    position: 'absolute',
    bottom: 40,
    left: 20,
    right: 20,
    alignItems: 'center',
    gap: 12,
  },
  protractorControlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 16,
    paddingVertical: 8,
    paddingHorizontal: 12,
    gap: 8,
  },
  protractorControlBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  protractorControlBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  protractorAngleBadge: {
    backgroundColor: '#FF5722',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 16,
    minWidth: 80,
    alignItems: 'center',
  },
  protractorAngleBadgeText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  protractorZoomLabel: {
    fontSize: 14,
    color: '#666',
    marginHorizontal: 8,
  },
  protractorResetBtn: {
    backgroundColor: '#f44336',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 16,
    marginLeft: 8,
  },
  protractorResetBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  protractorAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4caf50',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 24,
    gap: 8,
  },
  protractorAddBtnText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  protractorToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0f0f0',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    gap: 4,
  },
  protractorToggleBtnActive: {
    backgroundColor: '#9c27b0',
  },
  protractorToggleBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#333',
  },
  protractorToggleBtnTextActive: {
    color: '#fff',
  },
  protractorSizeControl: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  protractorControlBtnSmall: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  protractorSizeLabel: {
    fontSize: 12,
    color: '#666',
    minWidth: 70,
    textAlign: 'center',
  },
  protractorInputModal: {
    position: 'absolute',
    top: '35%',
    left: 40,
    right: 40,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  protractorInputLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  protractorInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 18,
    marginBottom: 16,
  },
  protractorInputButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
  protractorInputCancelButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  protractorInputCancelText: {
    fontSize: 14,
    color: '#666',
  },
  protractorInputOkButton: {
    backgroundColor: '#4caf50',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  protractorInputOkText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  // ===== Stil-Editor Panel Styles =====
  // ===== Floating Measure Panel =====
  floatingMeasurePanel: {
    position: 'absolute',
    top: 60,
    right: 10,
    backgroundColor: '#fff',
    borderRadius: 12,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 8 },
      android: { elevation: 10 },
      default: {},
    }),
    zIndex: 999,
    overflow: 'hidden',
  },
  floatingMeasureDragBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#f8f8f8',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  floatingMeasureDragHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#ccc',
    position: 'absolute',
    top: 4,
    alignSelf: 'center',
  },
  floatingMeasureTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#333',
    flex: 1,
    textAlign: 'center',
  },
  floatingKeyRow: {
    flexDirection: 'row',
    gap: 4,
    marginBottom: 4,
  },
  floatingKey: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f0f0f0',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  floatingKeyText: {
    fontWeight: '600',
    color: '#333',
  },
  floatingLetterKey: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f0f0f0',
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  elementStylePanel: {
    backgroundColor: '#fff',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  elementStyleHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  elementStyleTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#333',
  },
  elementStyleSection: {
    marginBottom: 4,
  },
  elementStyleSectionLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#666',
    marginBottom: 3,
  },
  elementStyleColorRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
  },
  elementStyleColorOption: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#ddd',
  },
  elementStyleColorSelected: {
    borderColor: '#1976d2',
    borderWidth: 3,
    ...Platform.select({
      ios: {
        shadowColor: '#1976d2',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.4,
        shadowRadius: 4,
      },
      android: {
        elevation: 4,
      },
      default: {},
    }),
  },
  elementStyleStrokeRow: {
    flexDirection: 'row',
    gap: 4,
  },
  elementStyleStrokeButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: '#f0f0f0',
    minWidth: 32,
  },
  elementStyleStrokeButtonActive: {
    backgroundColor: '#1976d2',
  },
  elementStyleStrokeDot: {
    borderRadius: 50,
    marginBottom: 2,
  },
  elementStyleStrokeLabel: {
    fontSize: 10,
    color: '#666',
    fontWeight: '500',
  },
});

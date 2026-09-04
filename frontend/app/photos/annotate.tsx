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
  Modal,
  Animated,
} from 'react-native';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Path, G, Text as SvgText, Line, Circle, Polygon, Defs, Marker } from 'react-native-svg';

// Workaround RN-SVG Fabric-Bug (SDK 57): erzwingt Canvas-Neuzeichnen pro Render
let fabricTick = 0;
import { captureRef } from 'react-native-view-shot';
import { PhotoService } from '../../services/LocalStorage';
import * as Sharing from 'expo-sharing';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTranslation } from 'react-i18next';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const ANNOTATE_SETTINGS_KEY = 'aufmassprofi_annotate_settings';

// Font families
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
    { id: 'System', label: 'Standard', style: 'system-ui, sans-serif', svgFont: 'system-ui, -apple-system, sans-serif' },
    { id: 'Handschrift', label: 'Handschrift', style: 'cursive', svgFont: 'Comic Sans MS, cursive, sans-serif' },
    { id: 'Monospace', label: 'Monospace', style: 'monospace', svgFont: 'Courier New, monospace' },
    { id: 'Serif', label: 'Serif', style: 'serif', svgFont: 'Times New Roman, Georgia, serif' },
  ],
}) as { id: FontFamily; label: string; style: string; svgFont: string }[];

// ============ INTERFACES ============

interface DrawPath {
  path: string;
  color: string;
  strokeWidth: number;
  bounds?: { minX: number; minY: number; maxX: number; maxY: number };
}

interface TextElement {
  id: string;
  text: string;
  x: number;
  y: number;
  color: string;
  fontSize: number;
  fontFamily: string;
  fontWeight: 'normal' | 'bold';
}

interface Point {
  x: number;
  y: number;
}

interface MeasureLine {
  id: string;
  p1: Point;
  p2: Point;
  label: string;       // z.B. "3,50 m"
  realValue?: number;   // Wert in Metern
  color: string;
}

interface MeasureArea {
  id: string;
  points: Point[];
  label: string;        // z.B. "12,5 m²"
  areaValue?: number;   // Fläche in m²
  color: string;
}

interface MeasureAngle {
  id: string;
  p1: Point;            // Erster Schenkel-Endpunkt
  vertex: Point;        // Scheitelpunkt
  p2: Point;            // Zweiter Schenkel-Endpunkt
  angle: number;        // Winkel in Grad
  color: string;
}

interface ReferenceScale {
  pixelDistance: number;
  realDistance: number;
  unit: string;
}

interface BuildingComponent {
  id: string;
  type: 'window' | 'door' | 'heater' | 'socket' | 'light' | 'water';
  x: number;
  y: number;
  label?: string;
}

const COMPONENT_TYPES = [
  { type: 'window' as const, icon: 'apps-outline', label: 'Fenster', color: '#2196F3' },
  { type: 'door' as const, icon: 'enter-outline', label: 'Tür', color: '#795548' },
  { type: 'heater' as const, icon: 'flame-outline', label: 'Heizung', color: '#FF5722' },
  { type: 'socket' as const, icon: 'flash-outline', label: 'Steckdose', color: '#FFC107' },
  { type: 'light' as const, icon: 'bulb-outline', label: 'Licht', color: '#FFEB3B' },
  { type: 'water' as const, icon: 'water-outline', label: 'Wasser', color: '#00BCD4' },
];

const PDF_SIZES = [
  { value: 'small', label: 'Klein', icon: 'apps-outline', description: '9 pro Seite (3x3)' },
  { value: 'medium', label: 'Mittel', icon: 'grid-outline', description: '4 pro Seite (2x2)' },
  { value: 'large', label: 'Groß', icon: 'square-outline', description: '2 pro Seite (1x2)' },
];

// Messung-Farben
const MEASURE_COLORS = [
  '#FF0000', '#00C853', '#2979FF', '#FF6D00', '#AA00FF', '#000000',
];

// ============ HELPER FUNCTIONS ============

const distanceBetween = (p1: Point, p2: Point): number => {
  return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
};

const midpoint = (p1: Point, p2: Point): Point => ({
  x: (p1.x + p2.x) / 2,
  y: (p1.y + p2.y) / 2,
});

const angleBetweenPoints = (p1: Point, vertex: Point, p2: Point): number => {
  const v1 = { x: p1.x - vertex.x, y: p1.y - vertex.y };
  const v2 = { x: p2.x - vertex.x, y: p2.y - vertex.y };
  const dot = v1.x * v2.x + v1.y * v2.y;
  const cross = v1.x * v2.y - v1.y * v2.x;
  let angle = Math.atan2(Math.abs(cross), dot) * (180 / Math.PI);
  return Math.round(angle * 10) / 10;
};

const polygonArea = (points: Point[]): number => {
  let area = 0;
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += points[i].x * points[j].y;
    area -= points[j].x * points[i].y;
  }
  return Math.abs(area / 2);
};

const formatNumber = (num: number): string => {
  return num.toFixed(2).replace('.', ',');
};

// ============ MAIN COMPONENT ============

export default function AnnotatePhotoScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useLocalSearchParams();
  const photoId = Array.isArray(params.photoId) ? params.photoId[0] : params.photoId;
  const projectId = Array.isArray(params.projectId) ? params.projectId[0] : params.projectId;
  const canvasRef = useRef(null);
  
  // ---- Existing State ----
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [paths, setPaths] = useState<DrawPath[]>([]);
  const [textElements, setTextElements] = useState<TextElement[]>([]);
  const [currentPath, setCurrentPath] = useState<string>('');
  const [drawColor, setDrawColor] = useState('#FF0000');
  const [strokeWidth, setStrokeWidth] = useState(3);
  const [loading, setLoading] = useState(true);
  const [canvasDimensions, setCanvasDimensions] = useState({ width: 0, height: 0 });
  const [pdfSize, setPdfSize] = useState<string>('medium');
  const [description, setDescription] = useState<string>('');
  
  // Text settings
  const [lastTextFontSize, setLastTextFontSize] = useState(20);
  const [lastTextColor, setLastTextColor] = useState('#000000');
  const [lastTextFontFamily, setLastTextFontFamily] = useState<FontFamily>('System');
  const [showTextModal, setShowTextModal] = useState(false);
  const [textInput, setTextInput] = useState('');
  const [pendingTextPosition, setPendingTextPosition] = useState<{ x: number; y: number } | null>(null);
  
  // Draw mode: 'draw' | 'text' | 'measure' | 'area' | 'angle' | 'component'
  const [drawMode, setDrawMode] = useState<'draw' | 'text' | 'measure' | 'area' | 'angle' | 'component'>('draw');
  
  // Text selection
  const [selectedTextId, setSelectedTextId] = useState<string | null>(null);
  const [isDraggingText, setIsDraggingText] = useState(false);
  const [showEditTextModal, setShowEditTextModal] = useState(false);
  const [editTextInput, setEditTextInput] = useState('');
  const [editTextFontSize, setEditTextFontSize] = useState(20);
  const [editTextColor, setEditTextColor] = useState('#000000');
  const [editTextFontFamily, setEditTextFontFamily] = useState<FontFamily>('System');
  const textDragStartRef = useRef({ x: 0, y: 0 });
  const textOriginalPosRef = useRef({ x: 0, y: 0 });
  
  // Zoom & Pan (iOS)
  const [scale, setScale] = useState(1);
  const [lastScale, setLastScale] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [lastPanOffset, setLastPanOffset] = useState({ x: 0, y: 0 });
  const [isZooming, setIsZooming] = useState(false);
  const [initialPinchDistance, setInitialPinchDistance] = useState<number | null>(null);
  
  // Android zoom
  const androidZoomScale = useRef(new Animated.Value(1)).current;
  const androidTranslateX = useRef(new Animated.Value(0)).current;
  const androidTranslateY = useRef(new Animated.Value(0)).current;
  const androidPinchRef = useRef({
    initialDistance: 0, initialScale: 1, lastPanX: 0, lastPanY: 0,
    isPinching: false, currentScale: 1, currentTranslateX: 0, currentTranslateY: 0,
  });
  
  const [drawingEnabled, setDrawingEnabled] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [selectedPathIndex, setSelectedPathIndex] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragPreviewOffset, setDragPreviewOffset] = useState({ x: 0, y: 0 });
  const dragStartRef = useRef({ x: 0, y: 0 });
  const originalPathRef = useRef<string>('');
  const lastDrawPointRef = useRef({ x: 0, y: 0 });
  const [hasChanges, setHasChanges] = useState(false);
  const initialPathsRef = useRef<string>('');
  
  // Refs for auto-save
  const pathsRef = useRef(paths);
  const textElementsRef = useRef(textElements);
  const descriptionRef = useRef(description);
  const pdfSizeRef = useRef(pdfSize);
  const imageUriRef = useRef(imageUri);
  
  // ---- NEW: Measurement State ----
  const [measureLines, setMeasureLines] = useState<MeasureLine[]>([]);
  const [measureAreas, setMeasureAreas] = useState<MeasureArea[]>([]);
  const [measureAngles, setMeasureAngles] = useState<MeasureAngle[]>([]);
  const [referenceScale, setReferenceScale] = useState<ReferenceScale | null>(null);
  const [buildingComponents, setBuildingComponents] = useState<BuildingComponent[]>([]);
  const [currentMeasurePoints, setCurrentMeasurePoints] = useState<Point[]>([]);
  const [measureColor, setMeasureColor] = useState('#FF0000');
  
  // Modals
  const [showMeasureInputModal, setShowMeasureInputModal] = useState(false);
  const [measureInputValue, setMeasureInputValue] = useState('');
  const [measureInputUnit, setMeasureInputUnit] = useState('m');
  const [showReferenceModal, setShowReferenceModal] = useState(false);
  const [referenceInputValue, setReferenceInputValue] = useState('');
  const [referenceInputUnit, setReferenceInputUnit] = useState('m');
  const [showComponentPicker, setShowComponentPicker] = useState(false);
  const [pendingComponentPos, setPendingComponentPos] = useState<Point | null>(null);
  const [showToolPicker, setShowToolPicker] = useState(false);
  
  // Magnifier
  const [magnifierPos, setMagnifierPos] = useState<Point | null>(null);
  const [showMagnifier, setShowMagnifier] = useState(false);
  
  // Selected measurement for editing/deleting
  const [selectedMeasureId, setSelectedMeasureId] = useState<string | null>(null);
  const [selectedMeasureType, setSelectedMeasureType] = useState<'line' | 'area' | 'angle' | 'component' | null>(null);

  // ---- NEW: Measurement Refs ----
  const measureLinesRef = useRef(measureLines);
  const measureAreasRef = useRef(measureAreas);
  const measureAnglesRef = useRef(measureAngles);
  const buildingComponentsRef = useRef(buildingComponents);
  const referenceScaleRef = useRef(referenceScale);

  // Keep refs updated
  useEffect(() => { pathsRef.current = paths; }, [paths]);
  useEffect(() => { textElementsRef.current = textElements; }, [textElements]);
  useEffect(() => { descriptionRef.current = description; }, [description]);
  useEffect(() => { pdfSizeRef.current = pdfSize; }, [pdfSize]);
  useEffect(() => { imageUriRef.current = imageUri; }, [imageUri]);
  useEffect(() => { measureLinesRef.current = measureLines; }, [measureLines]);
  useEffect(() => { measureAreasRef.current = measureAreas; }, [measureAreas]);
  useEffect(() => { measureAnglesRef.current = measureAngles; }, [measureAngles]);
  useEffect(() => { buildingComponentsRef.current = buildingComponents; }, [buildingComponents]);
  useEffect(() => { referenceScaleRef.current = referenceScale; }, [referenceScale]);

  useEffect(() => {
    loadPhoto();
    loadSettings();
  }, [photoId]);

  // ---- Settings Load/Save ----
  const loadSettings = async () => {
    try {
      const savedSettings = await AsyncStorage.getItem(ANNOTATE_SETTINGS_KEY);
      if (savedSettings) {
        const settings = JSON.parse(savedSettings);
        if (settings.drawColor) setDrawColor(settings.drawColor);
        if (settings.strokeWidth) setStrokeWidth(settings.strokeWidth);
        if (settings.lastTextFontSize) setLastTextFontSize(settings.lastTextFontSize);
        if (settings.lastTextColor) setLastTextColor(settings.lastTextColor);
        if (settings.lastTextFontFamily) setLastTextFontFamily(settings.lastTextFontFamily);
        if (settings.measureColor) setMeasureColor(settings.measureColor);
      }
    } catch (error) {
      console.log('Error loading annotate settings:', error);
    }
  };

  const saveSettings = useCallback(async (key: string, value: any) => {
    try {
      const savedSettings = await AsyncStorage.getItem(ANNOTATE_SETTINGS_KEY);
      const settings = savedSettings ? JSON.parse(savedSettings) : {};
      settings[key] = value;
      await AsyncStorage.setItem(ANNOTATE_SETTINGS_KEY, JSON.stringify(settings));
    } catch (error) {
      console.log('Error saving annotate settings:', error);
    }
  }, []);

  const updateDrawColor = useCallback((color: string) => { setDrawColor(color); saveSettings('drawColor', color); }, [saveSettings]);
  const updateStrokeWidth = useCallback((sw: number) => { setStrokeWidth(sw); saveSettings('strokeWidth', sw); }, [saveSettings]);
  const updateLastTextFontSize = useCallback((value: number) => { setLastTextFontSize(value); saveSettings('lastTextFontSize', value); }, [saveSettings]);
  const updateLastTextColor = useCallback((value: string) => { setLastTextColor(value); saveSettings('lastTextColor', value); }, [saveSettings]);
  const updateLastTextFontFamily = useCallback((value: FontFamily) => { setLastTextFontFamily(value); saveSettings('lastTextFontFamily', value); }, [saveSettings]);
  const updateMeasureColor = useCallback((color: string) => { setMeasureColor(color); saveSettings('measureColor', color); }, [saveSettings]);

  // ---- Change Tracking ----
  useEffect(() => {
    if (!loading && paths.length > 0) {
      const currentPathsStr = JSON.stringify(paths);
      if (initialPathsRef.current && currentPathsStr !== initialPathsRef.current) {
        setHasChanges(true);
      }
    }
  }, [paths, loading]);

  useFocusEffect(
    useCallback(() => {
      return () => {
        if (hasChanges && imageUriRef.current && !loading) {
          autoSave();
        }
      };
    }, [hasChanges, loading])
  );

  // ---- Auto-Save ----
  const autoSave = async () => {
    try {
      const annotationData = {
        paths: pathsRef.current,
        textElements: textElementsRef.current,
        measureLines: measureLinesRef.current,
        measureAreas: measureAreasRef.current,
        measureAngles: measureAnglesRef.current,
        buildingComponents: buildingComponentsRef.current,
        referenceScale: referenceScaleRef.current,
        canvasWidth: canvasDimensions.width || SCREEN_WIDTH,
        canvasHeight: canvasDimensions.height || 400,
      };
      await PhotoService.update(photoId || '', {
        project_id: projectId,
        annotations: JSON.stringify(annotationData),
        description: descriptionRef.current,
        pdf_size: pdfSizeRef.current,
      });
      console.log('Auto-saved annotations');
    } catch (error) {
      console.error('Error auto-saving:', error);
    }
  };

  // ---- Load Photo ----
  const loadPhoto = async () => {
    try {
      console.log('[annotate] Loading photo with id:', photoId, 'projectId:', projectId);
      const photos = await PhotoService.getByProjectId(projectId || '');
      const photo = photos.find((p: any) => p.id === photoId);
      console.log('[annotate] Photo found:', !!photo, 'image_data length:', photo?.image_data?.length || 0);
      if (photo) {
        let imageSource = photo.image_data || photo.uri;
        if (!imageSource || imageSource.length < 100) {
          console.log('[annotate] Trying direct AsyncStorage fallback');
          const directImage = await AsyncStorage.getItem(`photo_img_${photoId}`);
          if (directImage) imageSource = directImage;
        }
        console.log('[annotate] Final imageSource length:', imageSource?.length || 0);
        if (imageSource && imageSource.length > 100) {
          if (!imageSource.startsWith('data:')) {
            imageSource = `data:image/jpeg;base64,${imageSource}`;
          }
          setImageUri(imageSource);
        } else {
          Alert.alert(t('common.error'), 'Keine Bilddaten gefunden');
        }
        setPdfSize(photo.pdf_size || 'medium');
        setDescription(photo.description || '');
        
        if (photo.annotations) {
          try {
            const data = JSON.parse(photo.annotations);
            if (data.paths && Array.isArray(data.paths)) {
              setPaths(data.paths);
              initialPathsRef.current = JSON.stringify(data.paths);
            }
            if (data.textElements && Array.isArray(data.textElements)) setTextElements(data.textElements);
            if (data.measureLines && Array.isArray(data.measureLines)) setMeasureLines(data.measureLines);
            if (data.measureAreas && Array.isArray(data.measureAreas)) setMeasureAreas(data.measureAreas);
            if (data.measureAngles && Array.isArray(data.measureAngles)) setMeasureAngles(data.measureAngles);
            if (data.buildingComponents && Array.isArray(data.buildingComponents)) setBuildingComponents(data.buildingComponents);
            if (data.referenceScale) setReferenceScale(data.referenceScale);
          } catch (e) {
            console.error('Error parsing annotations:', e);
          }
        } else {
          initialPathsRef.current = '[]';
        }
      } else {
        Alert.alert(t('common.error'), 'Foto nicht gefunden');
      }
    } catch (error) {
      console.error('Error loading photo:', error);
      Alert.alert(t('common.error'), 'Foto konnte nicht geladen werden');
    } finally {
      setLoading(false);
    }
  };

  // ---- Date/Time Text ----
  const addDateTimeText = () => {
    const now = new Date();
    const dateStr = now.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const timeStr = now.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
    const newId = Date.now().toString(36) + Math.random().toString(36).substr(2);
    const newTextElement = {
      id: newId, x: 20, y: 30, text: `${dateStr} ${timeStr}`,
      fontSize: lastTextFontSize || 20, color: '#FFFFFF',
      fontFamily: lastTextFontFamily || 'System', fontWeight: 'bold' as const,
    };
    setTextElements(prev => [...prev, newTextElement]);
    setHasChanges(true);
    setDrawingEnabled(true);
    setDrawMode('text');
    setSelectedTextId(newId);
  };

  // ---- Text Functions ----
  const findTextAtPosition = (x: number, y: number): TextElement | null => {
    for (let i = textElements.length - 1; i >= 0; i--) {
      const te = textElements[i];
      const tw = te.text.length * (te.fontSize * 0.6);
      const th = te.fontSize * 1.2;
      const pad = 20;
      if (x >= te.x - pad && x <= te.x + tw + pad && y >= te.y - th - pad && y <= te.y + pad) return te;
    }
    return null;
  };

  const selectTextElement = (te: TextElement) => {
    setSelectedTextId(te.id);
    const fontFamilyId = FONT_FAMILIES.find(f => f.svgFont === te.fontFamily)?.id || 'System';
    setEditTextInput(te.text);
    setEditTextFontSize(te.fontSize);
    setEditTextColor(te.color);
    setEditTextFontFamily(fontFamilyId);
  };

  const deselectText = () => { setSelectedTextId(null); setIsDraggingText(false); };
  const deleteSelectedText = () => {
    if (selectedTextId) { setTextElements(textElements.filter(t => t.id !== selectedTextId)); setSelectedTextId(null); setHasChanges(true); }
  };

  const addTextElement = () => {
    if (!textInput.trim() || !pendingTextPosition) { setShowTextModal(false); setTextInput(''); setPendingTextPosition(null); return; }
    const newText: TextElement = {
      id: `text_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      text: textInput.trim(), x: pendingTextPosition.x, y: pendingTextPosition.y,
      color: lastTextColor, fontSize: lastTextFontSize,
      fontFamily: FONT_FAMILIES.find(f => f.id === lastTextFontFamily)?.svgFont || 'sans-serif',
      fontWeight: 'bold',
    };
    setTextElements([...textElements, newText]);
    setHasChanges(true); setShowTextModal(false); setTextInput(''); setPendingTextPosition(null);
  };

  const deleteLastText = () => { if (textElements.length > 0) { setTextElements(textElements.slice(0, -1)); setHasChanges(true); } };

  const startDraggingText = (x: number, y: number) => {
    const sel = textElements.find(t => t.id === selectedTextId);
    if (sel) { setIsDraggingText(true); textDragStartRef.current = { x, y }; textOriginalPosRef.current = { x: sel.x, y: sel.y }; }
  };

  const moveText = (x: number, y: number) => {
    if (isDraggingText && selectedTextId) {
      const dx = x - textDragStartRef.current.x;
      const dy = y - textDragStartRef.current.y;
      setTextElements(textElements.map(t => t.id === selectedTextId ? { ...t, x: textOriginalPosRef.current.x + dx, y: textOriginalPosRef.current.y + dy } : t));
    }
  };

  const stopDraggingText = () => { if (isDraggingText) { setIsDraggingText(false); setHasChanges(true); } };

  const saveEditedText = () => {
    if (!selectedTextId || !editTextInput.trim()) { setShowEditTextModal(false); return; }
    setTextElements(textElements.map(t => t.id === selectedTextId ? {
      ...t, text: editTextInput.trim(), fontSize: editTextFontSize, color: editTextColor,
      fontFamily: FONT_FAMILIES.find(f => f.id === editTextFontFamily)?.svgFont || 'sans-serif',
    } : t));
    setHasChanges(true); setShowEditTextModal(false);
  };

  // ---- Path Functions ----
  const calculateBounds = (pathString: string) => {
    const coords: { x: number; y: number }[] = [];
    const parts = pathString.split(/[ML]\s*/);
    parts.forEach(part => {
      const trimmed = part.trim();
      if (trimmed) { const [x, y] = trimmed.split(/\s+/).map(Number); if (!isNaN(x) && !isNaN(y)) coords.push({ x, y }); }
    });
    if (coords.length === 0) return undefined;
    const xs = coords.map(c => c.x);
    const ys = coords.map(c => c.y);
    return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
  };

  const undo = () => { if (paths.length > 0) setPaths(paths.slice(0, -1)); };

  const clear = () => {
    Alert.alert('Alle löschen', 'Alle Zeichnungen, Texte und Messungen löschen?', [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.delete'), onPress: () => {
        setPaths([]); setTextElements([]); setMeasureLines([]); setMeasureAreas([]);
        setMeasureAngles([]); setBuildingComponents([]); setReferenceScale(null);
        setCurrentMeasurePoints([]); setHasChanges(true);
      }},
    ]);
  };

  // ============ MEASUREMENT LOGIC ============

  const pixelsToReal = (pixelDist: number): number | null => {
    if (!referenceScale || referenceScale.pixelDistance === 0) return null;
    const ratio = referenceScale.realDistance / referenceScale.pixelDistance;
    return pixelDist * ratio;
  };

  const handleMeasureTap = (x: number, y: number) => {
    setShowMagnifier(true);
    setMagnifierPos({ x, y });

    if (drawMode === 'measure') {
      const pts = [...currentMeasurePoints, { x, y }];
      setCurrentMeasurePoints(pts);
      if (pts.length === 2) {
        // Maßlinie fertig
        const pixDist = distanceBetween(pts[0], pts[1]);
        const realDist = pixelsToReal(pixDist);
        if (realDist !== null) {
          // Auto-Berechnung mit Referenz
          const label = `${formatNumber(realDist)} ${referenceScale?.unit || 'm'}`;
          const newLine: MeasureLine = {
            id: `ml_${Date.now()}`, p1: pts[0], p2: pts[1],
            label, realValue: realDist, color: measureColor,
          };
          setMeasureLines(prev => [...prev, newLine]);
          setCurrentMeasurePoints([]);
          setHasChanges(true);
        } else {
          // Manuell eingeben
          setShowMeasureInputModal(true);
        }
        setShowMagnifier(false);
      }
    } else if (drawMode === 'area') {
      const pts = [...currentMeasurePoints, { x, y }];
      setCurrentMeasurePoints(pts);
    } else if (drawMode === 'angle') {
      const pts = [...currentMeasurePoints, { x, y }];
      setCurrentMeasurePoints(pts);
      if (pts.length === 3) {
        const angle = angleBetweenPoints(pts[0], pts[1], pts[2]);
        const newAngle: MeasureAngle = {
          id: `ma_${Date.now()}`, p1: pts[0], vertex: pts[1], p2: pts[2],
          angle, color: measureColor,
        };
        setMeasureAngles(prev => [...prev, newAngle]);
        setCurrentMeasurePoints([]);
        setHasChanges(true);
        setShowMagnifier(false);
      }
    } else if (drawMode === 'component') {
      setPendingComponentPos({ x, y });
      setShowComponentPicker(true);
      setShowMagnifier(false);
    }
  };

  // Fläche abschließen
  const closeArea = () => {
    if (currentMeasurePoints.length < 3) {
      Alert.alert('Hinweis', 'Mindestens 3 Punkte für eine Fläche erforderlich.');
      return;
    }
    const pixArea = polygonArea(currentMeasurePoints);
    const realArea = referenceScale ? pixArea * Math.pow(referenceScale.realDistance / referenceScale.pixelDistance, 2) : null;
    
    const label = realArea !== null
      ? `${formatNumber(realArea)} ${referenceScale?.unit || 'm'}²`
      : `${Math.round(pixArea)} px²`;

    const newArea: MeasureArea = {
      id: `maa_${Date.now()}`, points: [...currentMeasurePoints],
      label, areaValue: realArea || undefined, color: measureColor,
    };
    setMeasureAreas(prev => [...prev, newArea]);
    setCurrentMeasurePoints([]);
    setHasChanges(true);
    setShowMagnifier(false);
  };

  // Maßlinie manuell beschriften
  const confirmMeasureLine = () => {
    if (currentMeasurePoints.length === 2 && measureInputValue.trim()) {
      const val = parseFloat(measureInputValue.replace(',', '.'));
      const label = `${measureInputValue.replace('.', ',')} ${measureInputUnit}`;
      const newLine: MeasureLine = {
        id: `ml_${Date.now()}`, p1: currentMeasurePoints[0], p2: currentMeasurePoints[1],
        label, realValue: isNaN(val) ? undefined : val, color: measureColor,
      };
      setMeasureLines(prev => [...prev, newLine]);
      setCurrentMeasurePoints([]);
      setHasChanges(true);
    }
    setShowMeasureInputModal(false);
    setMeasureInputValue('');
  };

  // Referenzmaß setzen
  const startReference = () => {
    setDrawMode('measure');
    setDrawingEnabled(true);
    setCurrentMeasurePoints([]);
    Alert.alert('Referenzmaß setzen', 'Tippe auf die zwei Endpunkte einer bekannten Strecke im Bild (z.B. eine Tür, ein Fenster).', [
      { text: 'OK', onPress: () => setShowReferenceModal(false) },
    ]);
    // We'll intercept the measurement completion for reference
    setReferenceScale(null); // Reset
  };

  const confirmReference = () => {
    if (currentMeasurePoints.length === 2 && referenceInputValue.trim()) {
      const val = parseFloat(referenceInputValue.replace(',', '.'));
      if (!isNaN(val) && val > 0) {
        const pixDist = distanceBetween(currentMeasurePoints[0], currentMeasurePoints[1]);
        setReferenceScale({ pixelDistance: pixDist, realDistance: val, unit: referenceInputUnit });
        // Auch als Maßlinie anzeigen
        const label = `${referenceInputValue.replace('.', ',')} ${referenceInputUnit} (Ref.)`;
        const newLine: MeasureLine = {
          id: `ml_ref_${Date.now()}`, p1: currentMeasurePoints[0], p2: currentMeasurePoints[1],
          label, realValue: val, color: '#FF6D00',
        };
        setMeasureLines(prev => [...prev, newLine]);
        setHasChanges(true);
        Alert.alert('Referenz gesetzt!', `1 Pixel = ${formatNumber(val / pixDist)} ${referenceInputUnit}\nAlle weiteren Messungen werden automatisch berechnet.`);
      }
      setCurrentMeasurePoints([]);
    }
    setShowReferenceModal(false);
    setReferenceInputValue('');
  };

  // Bauteil hinzufügen
  const addComponent = (type: typeof COMPONENT_TYPES[0]['type']) => {
    if (!pendingComponentPos) return;
    const comp: BuildingComponent = {
      id: `bc_${Date.now()}`, type, x: pendingComponentPos.x, y: pendingComponentPos.y,
    };
    setBuildingComponents(prev => [...prev, comp]);
    setHasChanges(true);
    setShowComponentPicker(false);
    setPendingComponentPos(null);
  };

  // Messung löschen
  const deleteSelectedMeasure = () => {
    if (!selectedMeasureId || !selectedMeasureType) return;
    if (selectedMeasureType === 'line') setMeasureLines(prev => prev.filter(m => m.id !== selectedMeasureId));
    else if (selectedMeasureType === 'area') setMeasureAreas(prev => prev.filter(m => m.id !== selectedMeasureId));
    else if (selectedMeasureType === 'angle') setMeasureAngles(prev => prev.filter(m => m.id !== selectedMeasureId));
    else if (selectedMeasureType === 'component') setBuildingComponents(prev => prev.filter(m => m.id !== selectedMeasureId));
    setSelectedMeasureId(null);
    setSelectedMeasureType(null);
    setHasChanges(true);
  };

  // Undo letzte Messung (je nach Modus)
  const undoMeasure = () => {
    if (currentMeasurePoints.length > 0) {
      setCurrentMeasurePoints(prev => prev.slice(0, -1));
      return;
    }
    if (drawMode === 'measure' && measureLines.length > 0) {
      setMeasureLines(prev => prev.slice(0, -1));
      setHasChanges(true);
    } else if (drawMode === 'area' && measureAreas.length > 0) {
      setMeasureAreas(prev => prev.slice(0, -1));
      setHasChanges(true);
    } else if (drawMode === 'angle' && measureAngles.length > 0) {
      setMeasureAngles(prev => prev.slice(0, -1));
      setHasChanges(true);
    } else if (drawMode === 'component' && buildingComponents.length > 0) {
      setBuildingComponents(prev => prev.slice(0, -1));
      setHasChanges(true);
    }
  };

  // ============ TOUCH HANDLING ============
  const [touchCount, setTouchCount] = useState(0);
  const canvasContainerRef = useRef<View>(null);

  const getDistance = (touches: any[]) => {
    if (touches.length < 2) return 0;
    const dx = touches[0].pageX - touches[1].pageX;
    const dy = touches[0].pageY - touches[1].pageY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  // ---- Save ----
  const save = async () => {
    try {
      setLoading(true);
      const annotationData = {
        paths, textElements, measureLines, measureAreas, measureAngles,
        buildingComponents, referenceScale,
        canvasWidth: canvasDimensions.width || SCREEN_WIDTH,
        canvasHeight: canvasDimensions.height || 400,
      };
      await PhotoService.update(photoId || '', {
        project_id: projectId,
        annotations: JSON.stringify(annotationData),
        description, pdf_size: pdfSize,
      });
      Alert.alert(t('common.success'), 'Foto wurde gespeichert', [
        { text: t('common.ok'), onPress: () => router.back() },
      ]);
    } catch (error) {
      console.error('Error saving:', error);
      Alert.alert(t('common.error'), 'Foto konnte nicht gespeichert werden');
    } finally {
      setLoading(false);
    }
  };

  const saveToGallery = async () => {
    try {
      setLoading(true);
      let fileUri: string;
      if ((paths.length > 0 || textElements.length > 0 || measureLines.length > 0) && canvasRef.current) {
        try { fileUri = await captureRef(canvasRef, { format: 'png', quality: 1 }); }
        catch { fileUri = imageUri || ''; }
      } else {
        fileUri = imageUri || '';
      }
      const canShare = await Sharing.isAvailableAsync();
      if (canShare && fileUri) {
        await Sharing.shareAsync(fileUri, { mimeType: 'image/jpeg', dialogTitle: 'Foto speichern oder teilen', UTI: 'public.jpeg' });
      } else {
        Alert.alert(t('common.error'), 'Teilen ist auf diesem Gerät nicht verfügbar');
      }
    } catch (error) {
      console.error('Error saving to gallery:', error);
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

  const isMeasureMode = drawMode === 'measure' || drawMode === 'area' || drawMode === 'angle' || drawMode === 'component';

  if (loading || !imageUri) {
    return (
      <View style={styles.centerContainer}>
        <Text>Lade Foto...</Text>
      </View>
    );
  }

  // ============ RENDER ============
  return (
    <View style={styles.container}>
      {/* ===== TOOLBAR ROW 1: PDF Size + Tool Buttons ===== */}
      <View style={styles.compactToolbar}>
        <View style={styles.pdfSizeRow}>
          {PDF_SIZES.map((size) => (
            <TouchableOpacity
              key={size.value}
              style={[styles.pdfSizeButtonSmall, pdfSize === size.value && styles.pdfSizeButtonSmallActive]}
              onPress={() => {
                setPdfSize(size.value); setHasChanges(true);
                if (photoId) PhotoService.update(photoId, { pdf_size: size.value }).catch(console.error);
              }}
            >
              <Ionicons name={size.icon as any} size={16} color={pdfSize === size.value ? '#fff' : '#1976d2'} />
              <Text style={[styles.pdfSizeTextSmall, pdfSize === size.value && styles.pdfSizeTextSmallActive]}>{size.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
        
        <View style={styles.rightToolsRow}>
          {/* Colors for draw mode */}
          {drawingEnabled && drawMode === 'draw' && (
            <View style={styles.colorsRow}>
              {colors.map((c) => (
                <TouchableOpacity key={c.color} style={[styles.colorButtonSmall, { backgroundColor: c.color }, drawColor === c.color && styles.colorButtonSmallActive]} onPress={() => updateDrawColor(c.color)} />
              ))}
            </View>
          )}
          
          {/* Colors for measure modes */}
          {drawingEnabled && isMeasureMode && (
            <View style={styles.colorsRow}>
              {MEASURE_COLORS.map((c) => (
                <TouchableOpacity key={c} style={[styles.colorButtonSmall, { backgroundColor: c }, measureColor === c && styles.colorButtonSmallActive]} onPress={() => updateMeasureColor(c)} />
              ))}
            </View>
          )}
          
          {/* Stroke width for draw */}
          {drawingEnabled && drawMode === 'draw' && (
            <View style={styles.strokeRow}>
              {[2, 4, 6, 8].map((sw) => (
                <TouchableOpacity key={sw} style={[styles.strokeButton, strokeWidth === sw && styles.strokeButtonActive]} onPress={() => updateStrokeWidth(sw)}>
                  <View style={[styles.strokePreview, { height: sw, backgroundColor: strokeWidth === sw ? '#fff' : '#1976d2' }]} />
                </TouchableOpacity>
              ))}
            </View>
          )}
          
          {/* Draw toggle */}
          <TouchableOpacity style={[styles.drawToggleButton, drawingEnabled && drawMode === 'draw' && styles.drawToggleButtonActive]} 
            onPress={() => {
              if (drawingEnabled && drawMode === 'draw') { setDrawingEnabled(false); }
              else { setDrawingEnabled(true); setDrawMode('draw'); setCurrentMeasurePoints([]); setShowMagnifier(false); }
            }}>
            <Ionicons name={drawingEnabled && drawMode === 'draw' ? "brush" : "brush-outline"} size={18} color={drawingEnabled && drawMode === 'draw' ? '#fff' : '#4CAF50'} />
            <Text style={[styles.drawToggleText, drawingEnabled && drawMode === 'draw' && styles.drawToggleTextActive]}>Zeichnen</Text>
          </TouchableOpacity>
          
          {/* Text toggle */}
          <TouchableOpacity style={[styles.textToggleButton, drawingEnabled && drawMode === 'text' && styles.textToggleButtonActive]}
            onPress={() => {
              if (drawingEnabled && drawMode === 'text') { setDrawingEnabled(false); }
              else { setDrawingEnabled(true); setDrawMode('text'); setCurrentMeasurePoints([]); setShowMagnifier(false); }
            }}>
            <Ionicons name={drawingEnabled && drawMode === 'text' ? "text" : "text-outline"} size={18} color={drawingEnabled && drawMode === 'text' ? '#fff' : '#9C27B0'} />
            <Text style={[styles.textToggleText, drawingEnabled && drawMode === 'text' && styles.textToggleTextActive]}>Text</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ===== TOOLBAR ROW 2: Context Actions ===== */}
      <View style={styles.actionsToolbar}>
        {/* Measure mode info bar */}
        {drawingEnabled && isMeasureMode ? (
          <>
            <View style={styles.measureInfoBadge}>
              <Ionicons name={drawMode === 'measure' ? 'resize' : drawMode === 'area' ? 'shapes' : drawMode === 'angle' ? 'analytics' : 'location'} size={14} color="#FF6D00" />
              <Text style={styles.measureInfoText}>
                {drawMode === 'measure' ? `Maßlinie (${currentMeasurePoints.length}/2)` :
                 drawMode === 'area' ? `Fläche (${currentMeasurePoints.length} Pkt.)` :
                 drawMode === 'angle' ? `Winkel (${currentMeasurePoints.length}/3)` : 'Bauteil'}
              </Text>
            </View>
            {referenceScale && (
              <View style={[styles.measureInfoBadge, { backgroundColor: '#e8f5e9' }]}>
                <Ionicons name="checkmark-circle" size={14} color="#4CAF50" />
                <Text style={[styles.measureInfoText, { color: '#388E3C' }]}>Ref. aktiv</Text>
              </View>
            )}
            {drawMode === 'area' && currentMeasurePoints.length >= 3 && (
              <TouchableOpacity style={[styles.actionButton, { backgroundColor: '#e8f5e9', borderWidth: 1, borderColor: '#4CAF50' }]} onPress={closeArea}>
                <Ionicons name="checkmark-done" size={18} color="#388E3C" />
                <Text style={[styles.actionText, { color: '#388E3C', fontWeight: '700' }]}>Fläche schließen</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.actionButton} onPress={undoMeasure}>
              <Ionicons name="arrow-undo" size={18} color="#FF6D00" />
              <Text style={styles.actionText}>Rückgängig</Text>
            </TouchableOpacity>
            {selectedMeasureId && (
              <TouchableOpacity style={[styles.actionButton, { backgroundColor: '#ffebee' }]} onPress={deleteSelectedMeasure}>
                <Ionicons name="trash-outline" size={18} color="#f44336" />
                <Text style={[styles.actionText, { color: '#f44336' }]}>Löschen</Text>
              </TouchableOpacity>
            )}
            <View style={{ flex: 1 }} />
            <TouchableOpacity style={[styles.actionButton, styles.saveButton]} onPress={save}>
              <Ionicons name="checkmark-circle" size={20} color="#fff" />
              <Text style={[styles.actionText, { color: '#fff' }]}>Speichern</Text>
            </TouchableOpacity>
          </>
        ) : selectedTextId && drawMode === 'text' ? (
          <>
            <TouchableOpacity style={[styles.actionButton, { backgroundColor: '#e3f2fd' }]} onPress={() => setShowEditTextModal(true)}>
              <Ionicons name="create-outline" size={20} color="#1976d2" />
              <Text style={[styles.actionText, { color: '#1976d2' }]}>Bearbeiten</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.actionButton, { backgroundColor: '#ffebee' }]} onPress={deleteSelectedText}>
              <Ionicons name="trash-outline" size={20} color="#f44336" />
              <Text style={[styles.actionText, { color: '#f44336' }]}>Löschen</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.actionButton, { backgroundColor: '#f5f5f5' }]} onPress={deselectText}>
              <Ionicons name="close-circle-outline" size={20} color="#666" />
              <Text style={[styles.actionText, { color: '#666' }]}>Abbrechen</Text>
            </TouchableOpacity>
            <View style={{ flex: 1 }} />
            <View style={styles.selectedTextHint}>
              <Ionicons name="move" size={14} color="#1976d2" />
              <Text style={styles.selectedTextHintText}>Ziehen zum Verschieben</Text>
            </View>
          </>
        ) : (
          <>
            <TouchableOpacity style={styles.actionButton} onPress={undo} disabled={!drawingEnabled || drawMode !== 'draw' || paths.length === 0}>
              <Ionicons name="arrow-undo" size={20} color={drawingEnabled && drawMode === 'draw' && paths.length > 0 ? '#1976d2' : '#ccc'} />
              <Text style={[styles.actionText, (!drawingEnabled || drawMode !== 'draw' || paths.length === 0) && { color: '#ccc' }]}>Zeichnung</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionButton} onPress={deleteLastText} disabled={!drawingEnabled || drawMode !== 'text' || textElements.length === 0}>
              <Ionicons name="arrow-undo" size={20} color={drawingEnabled && drawMode === 'text' && textElements.length > 0 ? '#9C27B0' : '#ccc'} />
              <Text style={[styles.actionText, (!drawingEnabled || drawMode !== 'text' || textElements.length === 0) && { color: '#ccc' }]}>Text</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionButton} onPress={clear} disabled={!drawingEnabled || (paths.length === 0 && textElements.length === 0 && measureLines.length === 0)}>
              <Ionicons name="trash-outline" size={20} color={drawingEnabled && (paths.length > 0 || textElements.length > 0 || measureLines.length > 0) ? '#f44336' : '#ccc'} />
              <Text style={[styles.actionText, (!drawingEnabled || (paths.length === 0 && textElements.length === 0 && measureLines.length === 0)) && { color: '#ccc' }]}>Alle</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.actionButton, styles.deletePhotoButton]} onPress={() => {
              Alert.alert('Foto löschen', 'Möchten Sie dieses Foto komplett löschen?', [
                { text: t('common.cancel'), style: 'cancel' },
                { text: 'Löschen', style: 'destructive', onPress: async () => {
                  try { await PhotoService.delete(photoId || ''); Alert.alert(t('common.success'), 'Foto wurde gelöscht', [{ text: t('common.ok'), onPress: () => router.back() }]); }
                  catch (error) { Alert.alert(t('common.error'), 'Foto konnte nicht gelöscht werden'); }
                }},
              ]);
            }}>
              <Ionicons name="trash" size={20} color="#fff" />
              <Text style={[styles.actionText, { color: '#fff' }]}>Foto</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.actionButton, styles.saveButton]} onPress={save}>
              <Ionicons name="checkmark-circle" size={20} color="#fff" />
              <Text style={[styles.actionText, { color: '#fff' }]}>Speichern</Text>
            </TouchableOpacity>
          </>
        )}
      </View>

      {/* Description */}
      <View style={styles.descriptionContainer}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={styles.descriptionLabel}>Beschreibung:</Text>
          <TouchableOpacity style={{ backgroundColor: '#e8f5e9', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6, flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderColor: '#4caf50' }} onPress={addDateTimeText}>
            <Ionicons name="calendar-outline" size={16} color="#388e3c" />
            <Text style={{ fontSize: 12, color: '#388e3c', fontWeight: '600' }}>Datum</Text>
          </TouchableOpacity>
        </View>
        <TextInput style={styles.descriptionInput} value={description} onChangeText={(text) => { setDescription(text); setHasChanges(true); }} placeholder="Beschreibung zum Foto eingeben..." placeholderTextColor="#999" multiline={false} returnKeyType="done" />
      </View>

      {/* ===== CANVAS ===== */}
      <ScrollView 
        style={styles.canvasContainer}
        contentContainerStyle={{ flexGrow: 1 }}
        ref={canvasRef as any}
        minimumZoomScale={Platform.OS === 'ios' ? 0.5 : 1}
        maximumZoomScale={Platform.OS === 'ios' ? 4 : 1}
        bouncesZoom={Platform.OS === 'ios' && !drawingEnabled}
        scrollEnabled={Platform.OS === 'ios' ? !drawingEnabled : false}
        pinchGestureEnabled={Platform.OS === 'ios' && !drawingEnabled}
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        onLayout={(event) => {
          const { width, height } = event.nativeEvent.layout;
          setCanvasDimensions({ width, height });
        }}
      >
        <Animated.View style={Platform.OS === 'android' ? {
          transform: [{ translateX: androidTranslateX }, { translateY: androidTranslateY }, { scale: androidZoomScale }],
        } : undefined}>
        <View style={{ width: canvasDimensions.width || SCREEN_WIDTH, height: canvasDimensions.height || 400 }}>
          <Image source={{ uri: imageUri }} style={{ position: 'absolute', top: 0, left: 0, width: canvasDimensions.width || SCREEN_WIDTH, height: canvasDimensions.height || 400, zIndex: 0 }} resizeMode="contain" 
            onError={(e) => console.log('[annotate] Image load error:', e.nativeEvent.error)}
            onLoad={() => console.log('[annotate] Image loaded successfully, dims:', canvasDimensions)} />
          
          <View
            style={[styles.svgContainer, { zIndex: 1 }]}
            onStartShouldSetResponder={() => Platform.OS === 'android' ? true : drawingEnabled}
            onMoveShouldSetResponder={() => Platform.OS === 'android' ? true : (drawingEnabled && (drawMode === 'draw' || isDraggingText))}
            onResponderGrant={(event) => {
              if (Platform.OS === 'android' && !drawingEnabled) {
                const touches = event.nativeEvent.touches;
                if (touches && touches.length >= 2) {
                  const dx = touches[0].pageX - touches[1].pageX;
                  const dy = touches[0].pageY - touches[1].pageY;
                  androidPinchRef.current.initialDistance = Math.sqrt(dx * dx + dy * dy);
                  androidPinchRef.current.initialScale = androidPinchRef.current.currentScale;
                  androidPinchRef.current.isPinching = true;
                } else if (touches && touches.length === 1) {
                  androidPinchRef.current.lastPanX = touches[0].pageX;
                  androidPinchRef.current.lastPanY = touches[0].pageY;
                  androidPinchRef.current.isPinching = false;
                }
                return;
              }
              const touch = event.nativeEvent;
              const locationX = touch.locationX;
              const locationY = touch.locationY;
              
              if (drawingEnabled && drawMode === 'draw') {
                lastDrawPointRef.current = { x: locationX, y: locationY };
                setCurrentPath(`M ${locationX.toFixed(1)} ${locationY.toFixed(1)}`);
              } else if (drawingEnabled && drawMode === 'text') {
                const tappedText = findTextAtPosition(locationX, locationY);
                if (tappedText) {
                  if (selectedTextId === tappedText.id) startDraggingText(locationX, locationY);
                  else selectTextElement(tappedText);
                } else if (selectedTextId) {
                  deselectText();
                  setPendingTextPosition({ x: locationX, y: locationY });
                  setShowTextModal(true);
                } else {
                  setPendingTextPosition({ x: locationX, y: locationY });
                  setShowTextModal(true);
                }
              } else if (drawingEnabled && isMeasureMode) {
                handleMeasureTap(locationX, locationY);
              }
            }}
            onResponderMove={(event) => {
              if (Platform.OS === 'android' && !drawingEnabled) {
                const touches = event.nativeEvent.touches;
                if (touches && touches.length >= 2) {
                  const dx = touches[0].pageX - touches[1].pageX;
                  const dy = touches[0].pageY - touches[1].pageY;
                  const distance = Math.sqrt(dx * dx + dy * dy);
                  if (androidPinchRef.current.initialDistance > 0) {
                    const ratio = distance / androidPinchRef.current.initialDistance;
                    const newScale = Math.max(0.5, Math.min(4, androidPinchRef.current.initialScale * ratio));
                    androidPinchRef.current.currentScale = newScale;
                    androidZoomScale.setValue(newScale);
                  }
                  androidPinchRef.current.isPinching = true;
                } else if (touches && touches.length === 1 && !androidPinchRef.current.isPinching && androidPinchRef.current.currentScale > 1.05) {
                  const panDx = touches[0].pageX - androidPinchRef.current.lastPanX;
                  const panDy = touches[0].pageY - androidPinchRef.current.lastPanY;
                  androidPinchRef.current.currentTranslateX += panDx;
                  androidPinchRef.current.currentTranslateY += panDy;
                  androidTranslateX.setValue(androidPinchRef.current.currentTranslateX);
                  androidTranslateY.setValue(androidPinchRef.current.currentTranslateY);
                  androidPinchRef.current.lastPanX = touches[0].pageX;
                  androidPinchRef.current.lastPanY = touches[0].pageY;
                }
                return;
              }
              const touch = event.nativeEvent;
              const locationX = touch.locationX;
              const locationY = touch.locationY;
              
              if (drawingEnabled && drawMode === 'text' && isDraggingText) { moveText(locationX, locationY); return; }
              if (drawingEnabled && drawMode === 'draw' && currentPath) {
                const lastPoint = lastDrawPointRef.current;
                const distance = Math.sqrt(Math.pow(locationX - lastPoint.x, 2) + Math.pow(locationY - lastPoint.y, 2));
                if (distance > 3) { lastDrawPointRef.current = { x: locationX, y: locationY }; setCurrentPath((prev) => `${prev} L ${locationX.toFixed(1)} ${locationY.toFixed(1)}`); }
              }
              // Update magnifier position during measure
              if (drawingEnabled && isMeasureMode) {
                setMagnifierPos({ x: locationX, y: locationY });
              }
            }}
            onResponderRelease={() => {
              if (Platform.OS === 'android' && !drawingEnabled) {
                androidPinchRef.current.isPinching = false;
                androidPinchRef.current.initialDistance = 0;
                return;
              }
              if (isDraggingText) stopDraggingText();
              if (drawingEnabled && drawMode === 'draw' && currentPath && currentPath.length > 0) {
                const bounds = calculateBounds(currentPath);
                setPaths([...paths, { path: currentPath, color: drawColor, strokeWidth, bounds }]);
                setCurrentPath(''); setHasChanges(true);
              }
            }}
          >
            <Svg key={`anno-${fabricTick++}`} height={canvasDimensions.height || 400} width={canvasDimensions.width || SCREEN_WIDTH} style={{ position: 'absolute', top: 0, left: 0 }}>
              {/* Draw paths */}
              {paths.map((p, index) => (
                <G key={`path-${index}`}>
                  <Path d={p.path} stroke={p.color} strokeWidth={p.strokeWidth} fill="none" strokeLinecap="round" strokeLinejoin="round" />
                </G>
              ))}
              {currentPath && currentPath.length > 0 && (
                <Path d={currentPath} stroke={drawColor} strokeWidth={strokeWidth} fill="none" strokeLinecap="round" strokeLinejoin="round" />
              )}

              {/* ===== MEASUREMENT LINES ===== */}
              {measureLines.map((ml) => {
                const mid = midpoint(ml.p1, ml.p2);
                const angle = Math.atan2(ml.p2.y - ml.p1.y, ml.p2.x - ml.p1.x);
                const perpX = Math.sin(angle) * 8;
                const perpY = -Math.cos(angle) * 8;
                // Arrowhead size
                const arrLen = 10;
                const arrAngle = Math.PI / 6;
                // Arrow at p2
                const a2x1 = ml.p2.x - arrLen * Math.cos(angle - arrAngle);
                const a2y1 = ml.p2.y - arrLen * Math.sin(angle - arrAngle);
                const a2x2 = ml.p2.x - arrLen * Math.cos(angle + arrAngle);
                const a2y2 = ml.p2.y - arrLen * Math.sin(angle + arrAngle);
                // Arrow at p1
                const a1x1 = ml.p1.x + arrLen * Math.cos(angle - arrAngle);
                const a1y1 = ml.p1.y + arrLen * Math.sin(angle - arrAngle);
                const a1x2 = ml.p1.x + arrLen * Math.cos(angle + arrAngle);
                const a1y2 = ml.p1.y + arrLen * Math.sin(angle + arrAngle);
                // Extension lines
                const extLen = 12;
                return (
                  <G key={ml.id}>
                    {/* Extension lines at endpoints */}
                    <Line x1={ml.p1.x + perpX * 1.5} y1={ml.p1.y + perpY * 1.5} x2={ml.p1.x - perpX * 1.5} y2={ml.p1.y - perpY * 1.5} stroke={ml.color} strokeWidth={1.5} />
                    <Line x1={ml.p2.x + perpX * 1.5} y1={ml.p2.y + perpY * 1.5} x2={ml.p2.x - perpX * 1.5} y2={ml.p2.y - perpY * 1.5} stroke={ml.color} strokeWidth={1.5} />
                    {/* Main line */}
                    <Line x1={ml.p1.x} y1={ml.p1.y} x2={ml.p2.x} y2={ml.p2.y} stroke={ml.color} strokeWidth={2} />
                    {/* Arrowheads */}
                    <Polygon points={`${ml.p2.x},${ml.p2.y} ${a2x1},${a2y1} ${a2x2},${a2y2}`} fill={ml.color} />
                    <Polygon points={`${ml.p1.x},${ml.p1.y} ${a1x1},${a1y1} ${a1x2},${a1y2}`} fill={ml.color} />
                    {/* Label background */}
                    <Path d={`M ${mid.x - ml.label.length * 4.5 - 4} ${mid.y - 18} 
                      h ${ml.label.length * 9 + 8} 
                      v 22 
                      h ${-(ml.label.length * 9 + 8)} Z`}
                      fill="rgba(255,255,255,0.9)" stroke={ml.color} strokeWidth={1} rx={4} />
                    {/* Label text */}
                    <SvgText x={mid.x} y={mid.y - 3} fill={ml.color} fontSize={14} fontWeight="bold" textAnchor="middle" fontFamily="Helvetica">
                      {ml.label}
                    </SvgText>
                  </G>
                );
              })}

              {/* ===== MEASURE AREAS ===== */}
              {measureAreas.map((ma) => {
                if (ma.points.length < 3) return null;
                const pts = ma.points.map(p => `${p.x},${p.y}`).join(' ');
                const cx = ma.points.reduce((s, p) => s + p.x, 0) / ma.points.length;
                const cy = ma.points.reduce((s, p) => s + p.y, 0) / ma.points.length;
                return (
                  <G key={ma.id}>
                    <Polygon points={pts} fill={`${ma.color}30`} stroke={ma.color} strokeWidth={2} strokeDasharray="6,3" />
                    {ma.points.map((p, i) => (
                      <Circle key={i} cx={p.x} cy={p.y} r={4} fill={ma.color} />
                    ))}
                    {/* Area label */}
                    <Path d={`M ${cx - ma.label.length * 4.5 - 6} ${cy - 12} h ${ma.label.length * 9 + 12} v 24 h ${-(ma.label.length * 9 + 12)} Z`}
                      fill="rgba(255,255,255,0.9)" stroke={ma.color} strokeWidth={1} rx={4} />
                    <SvgText x={cx} y={cy + 5} fill={ma.color} fontSize={14} fontWeight="bold" textAnchor="middle" fontFamily="Helvetica">
                      {ma.label}
                    </SvgText>
                  </G>
                );
              })}

              {/* ===== MEASURE ANGLES ===== */}
              {measureAngles.map((mang) => {
                const r = 30;
                const a1 = Math.atan2(mang.p1.y - mang.vertex.y, mang.p1.x - mang.vertex.x);
                const a2 = Math.atan2(mang.p2.y - mang.vertex.y, mang.p2.x - mang.vertex.x);
                const startAngle = Math.min(a1, a2);
                const endAngle = Math.max(a1, a2);
                const sweep = endAngle - startAngle > Math.PI ? 0 : 1;
                const arcStart = { x: mang.vertex.x + r * Math.cos(a1), y: mang.vertex.y + r * Math.sin(a1) };
                const arcEnd = { x: mang.vertex.x + r * Math.cos(a2), y: mang.vertex.y + r * Math.sin(a2) };
                const midAngle = (a1 + a2) / 2;
                const labelR = r + 18;
                const labelPos = { x: mang.vertex.x + labelR * Math.cos(midAngle), y: mang.vertex.y + labelR * Math.sin(midAngle) };
                const label = `${mang.angle}°`;
                return (
                  <G key={mang.id}>
                    <Line x1={mang.vertex.x} y1={mang.vertex.y} x2={mang.p1.x} y2={mang.p1.y} stroke={mang.color} strokeWidth={2} />
                    <Line x1={mang.vertex.x} y1={mang.vertex.y} x2={mang.p2.x} y2={mang.p2.y} stroke={mang.color} strokeWidth={2} />
                    <Path d={`M ${arcStart.x} ${arcStart.y} A ${r} ${r} 0 ${sweep} 1 ${arcEnd.x} ${arcEnd.y}`} stroke={mang.color} strokeWidth={2} fill="none" />
                    <Circle cx={mang.p1.x} cy={mang.p1.y} r={4} fill={mang.color} />
                    <Circle cx={mang.vertex.x} cy={mang.vertex.y} r={5} fill={mang.color} />
                    <Circle cx={mang.p2.x} cy={mang.p2.y} r={4} fill={mang.color} />
                    <Path d={`M ${labelPos.x - label.length * 4.5 - 4} ${labelPos.y - 10} h ${label.length * 9 + 8} v 20 h ${-(label.length * 9 + 8)} Z`}
                      fill="rgba(255,255,255,0.9)" stroke={mang.color} strokeWidth={1} rx={4} />
                    <SvgText x={labelPos.x} y={labelPos.y + 4} fill={mang.color} fontSize={13} fontWeight="bold" textAnchor="middle" fontFamily="Helvetica">
                      {label}
                    </SvgText>
                  </G>
                );
              })}

              {/* ===== BUILDING COMPONENTS ===== */}
              {buildingComponents.map((comp) => {
                const ct = COMPONENT_TYPES.find(c => c.type === comp.type);
                const label = ct?.label || comp.type;
                return (
                  <G key={comp.id}>
                    <Circle cx={comp.x} cy={comp.y} r={18} fill="rgba(255,255,255,0.9)" stroke={ct?.color || '#666'} strokeWidth={2} />
                    <SvgText x={comp.x} y={comp.y + 5} fill={ct?.color || '#666'} fontSize={18} textAnchor="middle" fontFamily="Helvetica">
                      {comp.type === 'window' ? '⬜' : comp.type === 'door' ? '🚪' : comp.type === 'heater' ? '🔥' : comp.type === 'socket' ? '⚡' : comp.type === 'light' ? '💡' : '💧'}
                    </SvgText>
                    <SvgText x={comp.x} y={comp.y + 30} fill={ct?.color || '#666'} fontSize={10} textAnchor="middle" fontWeight="bold" fontFamily="Helvetica">
                      {label}
                    </SvgText>
                  </G>
                );
              })}

              {/* ===== CURRENT MEASURE POINTS (in progress) ===== */}
              {currentMeasurePoints.map((p, i) => (
                <G key={`cmp-${i}`}>
                  <Circle cx={p.x} cy={p.y} r={6} fill={measureColor} stroke="#fff" strokeWidth={2} />
                  {i > 0 && (
                    <Line x1={currentMeasurePoints[i-1].x} y1={currentMeasurePoints[i-1].y} x2={p.x} y2={p.y} stroke={measureColor} strokeWidth={2} strokeDasharray="5,3" />
                  )}
                </G>
              ))}

              {/* ===== MAGNIFIER ===== */}
              {showMagnifier && magnifierPos && isMeasureMode && drawingEnabled && (
                <G>
                  <Circle cx={magnifierPos.x} cy={magnifierPos.y - 50} r={25} fill="rgba(255,255,255,0.9)" stroke={measureColor} strokeWidth={2} />
                  <Line x1={magnifierPos.x - 8} y1={magnifierPos.y - 50} x2={magnifierPos.x + 8} y2={magnifierPos.y - 50} stroke={measureColor} strokeWidth={1} />
                  <Line x1={magnifierPos.x} y1={magnifierPos.y - 58} x2={magnifierPos.x} y2={magnifierPos.y - 42} stroke={measureColor} strokeWidth={1} />
                  <Line x1={magnifierPos.x} y1={magnifierPos.y - 25} x2={magnifierPos.x} y2={magnifierPos.y} stroke={measureColor} strokeWidth={1} strokeDasharray="3,2" />
                </G>
              )}

              {/* Text elements */}
              {textElements.map((textEl) => {
                const isSelected = selectedTextId === textEl.id;
                const textWidth = textEl.text.length * (textEl.fontSize * 0.6);
                const textHeight = textEl.fontSize * 1.2;
                return (
                  <G key={textEl.id}>
                    {isSelected && (
                      <Path d={`M ${textEl.x - 5} ${textEl.y - textHeight - 5} L ${textEl.x + textWidth + 5} ${textEl.y - textHeight - 5} L ${textEl.x + textWidth + 5} ${textEl.y + 5} L ${textEl.x - 5} ${textEl.y + 5} Z`}
                        stroke="#1976d2" strokeWidth={2} strokeDasharray="5,3" fill="rgba(25, 118, 210, 0.1)" />
                    )}
                    <SvgText x={textEl.x} y={textEl.y} fill={textEl.color} fontSize={textEl.fontSize} fontWeight={textEl.fontWeight} fontFamily={textEl.fontFamily}>
                      {textEl.text}
                    </SvgText>
                  </G>
                );
              })}
              <Circle key={`inv-${fabricTick++}`} cx={-9999} cy={-9999} r={0.1} fill="none" stroke="none" opacity={0} />
            </Svg>
          </View>
        </View>
        </Animated.View>
      </ScrollView>

      {/* ===== MEASURE INPUT MODAL ===== */}
      <Modal visible={showMeasureInputModal} transparent animationType="slide">
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>📏 Maß eingeben</Text>
            <Text style={{ fontSize: 13, color: '#666', marginBottom: 12, textAlign: 'center' }}>
              Geben Sie die tatsächliche Länge ein
            </Text>
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
              <TextInput style={[styles.modalInput, { flex: 1, marginBottom: 0 }]} value={measureInputValue} onChangeText={setMeasureInputValue} placeholder="z.B. 3,50" keyboardType="decimal-pad" autoFocus />
              <View style={{ flexDirection: 'row', gap: 4 }}>
                {['m', 'cm', 'mm'].map(u => (
                  <TouchableOpacity key={u} style={[styles.unitButton, measureInputUnit === u && styles.unitButtonActive]} onPress={() => setMeasureInputUnit(u)}>
                    <Text style={[styles.unitButtonText, measureInputUnit === u && styles.unitButtonTextActive]}>{u}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            <View style={styles.modalButtons}>
              <TouchableOpacity style={[styles.modalButton, styles.cancelButton]} onPress={() => { setShowMeasureInputModal(false); setMeasureInputValue(''); setCurrentMeasurePoints([]); }}>
                <Text style={styles.cancelButtonText}>Abbrechen</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalButton, { backgroundColor: '#FF6D00' }]} onPress={confirmMeasureLine}>
                <Text style={styles.confirmButtonText}>Hinzufügen</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ===== REFERENCE INPUT MODAL ===== */}
      <Modal visible={showReferenceModal && currentMeasurePoints.length === 2} transparent animationType="slide">
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>📐 Referenzmaß eingeben</Text>
            <Text style={{ fontSize: 13, color: '#666', marginBottom: 12, textAlign: 'center' }}>
              Wie lang ist die markierte Strecke in der Realität?
            </Text>
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
              <TextInput style={[styles.modalInput, { flex: 1, marginBottom: 0 }]} value={referenceInputValue} onChangeText={setReferenceInputValue} placeholder="z.B. 2,10" keyboardType="decimal-pad" autoFocus />
              <View style={{ flexDirection: 'row', gap: 4 }}>
                {['m', 'cm', 'mm'].map(u => (
                  <TouchableOpacity key={u} style={[styles.unitButton, referenceInputUnit === u && styles.unitButtonActive]} onPress={() => setReferenceInputUnit(u)}>
                    <Text style={[styles.unitButtonText, referenceInputUnit === u && styles.unitButtonTextActive]}>{u}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            <View style={styles.modalButtons}>
              <TouchableOpacity style={[styles.modalButton, styles.cancelButton]} onPress={() => { setShowReferenceModal(false); setReferenceInputValue(''); setCurrentMeasurePoints([]); }}>
                <Text style={styles.cancelButtonText}>Abbrechen</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalButton, { backgroundColor: '#4CAF50' }]} onPress={confirmReference}>
                <Text style={styles.confirmButtonText}>Referenz setzen</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ===== COMPONENT PICKER MODAL ===== */}
      <Modal visible={showComponentPicker} transparent animationType="fade">
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => { setShowComponentPicker(false); setPendingComponentPos(null); }}>
          <View style={styles.toolPickerContent}>
            <Text style={styles.toolPickerTitle}>Bauteil wählen</Text>
            {COMPONENT_TYPES.map(ct => (
              <TouchableOpacity key={ct.type} style={styles.toolPickerItem} onPress={() => addComponent(ct.type)}>
                <View style={[styles.toolPickerIcon, { backgroundColor: ct.color + '20' }]}>
                  <Ionicons name={ct.icon as any} size={24} color={ct.color} />
                </View>
                <Text style={styles.toolPickerItemTitle}>{ct.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ===== TEXT INPUT MODAL ===== */}
      <Modal visible={showTextModal} transparent animationType="slide">
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Text eingeben</Text>
            <TextInput style={styles.modalInput} value={textInput} onChangeText={setTextInput} placeholder="Text hier eingeben..." multiline autoFocus />
            <View style={styles.sliderContainer}>
              <Text style={styles.modalLabel}>Schriftgröße: {lastTextFontSize}px</Text>
              <View style={styles.sliderRow}>
                <TouchableOpacity style={styles.sliderButton} onPress={() => updateLastTextFontSize(Math.max(10, lastTextFontSize - 2))}>
                  <Text style={styles.sliderButtonText}>-</Text>
                </TouchableOpacity>
                <View style={styles.sliderTrack}><View style={[styles.sliderFill, { width: `${((lastTextFontSize - 10) / 50) * 100}%` }]} /></View>
                <TouchableOpacity style={styles.sliderButton} onPress={() => updateLastTextFontSize(Math.min(60, lastTextFontSize + 2))}>
                  <Text style={styles.sliderButtonText}>+</Text>
                </TouchableOpacity>
              </View>
            </View>
            <View style={styles.fontFamilyContainer}>
              <Text style={styles.modalLabel}>Schriftart:</Text>
              <View style={styles.fontFamilyButtons}>
                {FONT_FAMILIES.map(font => (
                  <TouchableOpacity key={font.id} style={[styles.fontFamilyButton, lastTextFontFamily === font.id && styles.fontFamilyButtonActive]} onPress={() => updateLastTextFontFamily(font.id)}>
                    <Text style={[styles.fontFamilyButtonText, { fontFamily: font.style }, lastTextFontFamily === font.id && styles.fontFamilyButtonTextActive]}>{font.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            <View style={styles.colorPickerContainer}>
              <Text style={styles.modalLabel}>Farbe:</Text>
              <View style={styles.colorGrid}>
                {colors.map(c => (
                  <TouchableOpacity key={c.color} style={[styles.colorOption, { backgroundColor: c.color }, lastTextColor === c.color && styles.colorOptionSelected]} onPress={() => updateLastTextColor(c.color)} />
                ))}
              </View>
            </View>
            <View style={styles.modalButtons}>
              <TouchableOpacity style={[styles.modalButton, styles.cancelButton]} onPress={() => { setShowTextModal(false); setTextInput(''); setPendingTextPosition(null); }}>
                <Text style={styles.cancelButtonText}>Abbrechen</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalButton, styles.confirmButton]} onPress={addTextElement}>
                <Text style={styles.confirmButtonText}>Hinzufügen</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ===== TEXT EDIT MODAL ===== */}
      <Modal visible={showEditTextModal} transparent animationType="slide">
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Text bearbeiten</Text>
            <TextInput style={styles.modalInput} value={editTextInput} onChangeText={setEditTextInput} placeholder="Text hier eingeben..." multiline autoFocus />
            <View style={styles.sliderContainer}>
              <Text style={styles.modalLabel}>Schriftgröße: {editTextFontSize}px</Text>
              <View style={styles.sliderRow}>
                <TouchableOpacity style={styles.sliderButton} onPress={() => setEditTextFontSize(Math.max(10, editTextFontSize - 2))}><Text style={styles.sliderButtonText}>-</Text></TouchableOpacity>
                <View style={styles.sliderTrack}><View style={[styles.sliderFill, { width: `${((editTextFontSize - 10) / 50) * 100}%` }]} /></View>
                <TouchableOpacity style={styles.sliderButton} onPress={() => setEditTextFontSize(Math.min(60, editTextFontSize + 2))}><Text style={styles.sliderButtonText}>+</Text></TouchableOpacity>
              </View>
            </View>
            <View style={styles.fontFamilyContainer}>
              <Text style={styles.modalLabel}>Schriftart:</Text>
              <View style={styles.fontFamilyButtons}>
                {FONT_FAMILIES.map(font => (
                  <TouchableOpacity key={font.id} style={[styles.fontFamilyButton, editTextFontFamily === font.id && styles.fontFamilyButtonActive]} onPress={() => setEditTextFontFamily(font.id)}>
                    <Text style={[styles.fontFamilyButtonText, { fontFamily: font.style }, editTextFontFamily === font.id && styles.fontFamilyButtonTextActive]}>{font.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            <View style={styles.colorPickerContainer}>
              <Text style={styles.modalLabel}>Farbe:</Text>
              <View style={styles.colorGrid}>
                {colors.map(c => (
                  <TouchableOpacity key={c.color} style={[styles.colorOption, { backgroundColor: c.color }, editTextColor === c.color && styles.colorOptionSelected]} onPress={() => setEditTextColor(c.color)} />
                ))}
              </View>
            </View>
            <View style={styles.modalButtons}>
              <TouchableOpacity style={[styles.modalButton, styles.cancelButton]} onPress={() => setShowEditTextModal(false)}>
                <Text style={styles.cancelButtonText}>Abbrechen</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalButton, styles.confirmButton]} onPress={saveEditedText}>
                <Text style={styles.confirmButtonText}>Speichern</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

// ============ STYLES ============

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  
  // Toolbar Row 1
  compactToolbar: {
    flexDirection: 'row', backgroundColor: '#fff', paddingVertical: 8, paddingHorizontal: 10,
    alignItems: 'center', justifyContent: 'space-between',
  },
  pdfSizeRow: { flexDirection: 'row', gap: 4 },
  pdfSizeButtonSmall: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 4, paddingHorizontal: 8,
    borderRadius: 6, backgroundColor: '#f0f0f0', gap: 4, borderWidth: 1, borderColor: '#ddd',
  },
  pdfSizeButtonSmallActive: { backgroundColor: '#1976d2', borderColor: '#1565c0' },
  pdfSizeTextSmall: { fontSize: 11, fontWeight: '600', color: '#1976d2' },
  pdfSizeTextSmallActive: { color: '#fff' },
  rightToolsRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end', flex: 1, marginLeft: 8 },
  colorsRow: { flexDirection: 'row', gap: 3 },
  colorButtonSmall: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: '#ddd' },
  colorButtonSmallActive: { borderWidth: 3, borderColor: '#1976d2' },
  strokeRow: { flexDirection: 'row', gap: 3 },
  strokeButton: { width: 28, height: 24, borderRadius: 4, backgroundColor: '#f0f0f0', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#ddd' },
  strokeButtonActive: { backgroundColor: '#1976d2', borderColor: '#1565c0' },
  strokePreview: { width: 14, borderRadius: 2 },
  drawToggleButton: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4, paddingHorizontal: 8, borderRadius: 16, backgroundColor: '#f5f5f5', borderWidth: 2, borderColor: '#4CAF50', gap: 3 },
  drawToggleButtonActive: { backgroundColor: '#4CAF50', borderColor: '#388E3C' },
  drawToggleText: { fontSize: 10, fontWeight: '700', color: '#4CAF50' },
  drawToggleTextActive: { color: '#fff' },
  textToggleButton: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4, paddingHorizontal: 8, borderRadius: 16, backgroundColor: '#f5f5f5', borderWidth: 2, borderColor: '#9C27B0', gap: 3 },
  textToggleButtonActive: { backgroundColor: '#9C27B0', borderColor: '#7B1FA2' },
  textToggleText: { fontSize: 10, fontWeight: '700', color: '#9C27B0' },
  textToggleTextActive: { color: '#fff' },
  measureToggleButton: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4, paddingHorizontal: 8, borderRadius: 16, backgroundColor: '#f5f5f5', borderWidth: 2, borderColor: '#FF6D00', gap: 3 },
  measureToggleButtonActive: { backgroundColor: '#FF6D00', borderColor: '#E65100' },
  measureToggleText: { fontSize: 10, fontWeight: '700', color: '#FF6D00' },
  measureToggleTextActive: { color: '#fff' },
  
  // Toolbar Row 2
  actionsToolbar: { flexDirection: 'row', backgroundColor: '#fff', paddingVertical: 6, paddingHorizontal: 10, gap: 6, borderTopWidth: 1, borderTopColor: '#eee', alignItems: 'center', flexWrap: 'wrap' },
  actionButton: { flexDirection: 'row', alignItems: 'center', paddingVertical: 5, paddingHorizontal: 8, borderRadius: 6, backgroundColor: '#f5f5f5', gap: 4 },
  actionText: { fontSize: 11, color: '#333' },
  deletePhotoButton: { backgroundColor: '#f44336' },
  saveButton: { backgroundColor: '#4caf50', marginLeft: 'auto' },
  selectedTextHint: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#e3f2fd', paddingVertical: 4, paddingHorizontal: 8, borderRadius: 12, gap: 4 },
  selectedTextHintText: { fontSize: 10, color: '#1976d2' },
  measureInfoBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF3E0', paddingVertical: 4, paddingHorizontal: 8, borderRadius: 12, gap: 4 },
  measureInfoText: { fontSize: 11, fontWeight: '600', color: '#FF6D00' },
  
  // Description
  descriptionContainer: { backgroundColor: '#fff', paddingVertical: 8, paddingHorizontal: 12, borderTopWidth: 1, borderTopColor: '#eee', flexDirection: 'row', alignItems: 'center', gap: 8 },
  descriptionLabel: { fontSize: 12, fontWeight: '600', color: '#666' },
  descriptionInput: { flex: 1, backgroundColor: '#f5f5f5', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, fontSize: 14, color: '#333', borderWidth: 1, borderColor: '#e0e0e0' },
  
  // Canvas
  canvasContainer: { flex: 1, position: 'relative' },
  svgContainer: { flex: 1, width: '100%', height: '100%' },
  
  // Tool Picker Modal
  toolPickerContent: { backgroundColor: '#fff', borderRadius: 16, padding: 20, width: '90%', maxWidth: 380 },
  toolPickerTitle: { fontSize: 18, fontWeight: '700', color: '#333', marginBottom: 16, textAlign: 'center' },
  toolPickerItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 8, borderRadius: 12, backgroundColor: '#f9f9f9', marginBottom: 8, gap: 12 },
  toolPickerIcon: { width: 44, height: 44, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  toolPickerInfo: { flex: 1 },
  toolPickerItemTitle: { fontSize: 15, fontWeight: '700', color: '#333' },
  toolPickerItemDesc: { fontSize: 12, color: '#888', marginTop: 2 },
  
  // Unit Buttons
  unitButton: { paddingVertical: 10, paddingHorizontal: 12, borderRadius: 8, backgroundColor: '#f0f0f0', borderWidth: 1, borderColor: '#ddd', justifyContent: 'center' },
  unitButtonActive: { backgroundColor: '#FF6D00', borderColor: '#E65100' },
  unitButtonText: { fontSize: 14, fontWeight: '700', color: '#666' },
  unitButtonTextActive: { color: '#fff' },
  
  // Modals
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalContent: { backgroundColor: '#fff', borderRadius: 16, padding: 20, width: '100%', maxWidth: 400, maxHeight: '90%' },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#333', marginBottom: 16, textAlign: 'center' },
  modalInput: { backgroundColor: '#f5f5f5', borderRadius: 8, padding: 12, fontSize: 16, minHeight: 50, borderWidth: 1, borderColor: '#e0e0e0', marginBottom: 16 },
  modalLabel: { fontSize: 14, fontWeight: '600', color: '#666', marginBottom: 8 },
  sliderContainer: { marginBottom: 16 },
  sliderRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sliderButton: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#e0e0e0', justifyContent: 'center', alignItems: 'center' },
  sliderButtonText: { fontSize: 20, fontWeight: '700', color: '#333' },
  sliderTrack: { flex: 1, height: 8, backgroundColor: '#e0e0e0', borderRadius: 4, overflow: 'hidden' },
  sliderFill: { height: '100%', backgroundColor: '#9C27B0', borderRadius: 4 },
  fontFamilyContainer: { marginBottom: 16 },
  fontFamilyButtons: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  fontFamilyButton: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, backgroundColor: '#f0f0f0', borderWidth: 2, borderColor: '#ddd' },
  fontFamilyButtonActive: { backgroundColor: '#9C27B0', borderColor: '#7B1FA2' },
  fontFamilyButtonText: { fontSize: 14, color: '#333' },
  fontFamilyButtonTextActive: { color: '#fff' },
  colorPickerContainer: { marginBottom: 16 },
  colorGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  colorOption: { width: 40, height: 40, borderRadius: 20, borderWidth: 2, borderColor: '#ddd' },
  colorOptionSelected: { borderWidth: 3, borderColor: '#9C27B0' },
  modalButtons: { flexDirection: 'row', gap: 12, marginTop: 8 },
  modalButton: { flex: 1, paddingVertical: 12, borderRadius: 8, alignItems: 'center' },
  cancelButton: { backgroundColor: '#f0f0f0' },
  cancelButtonText: { fontSize: 16, fontWeight: '600', color: '#666' },
  confirmButton: { backgroundColor: '#9C27B0' },
  confirmButtonText: { fontSize: 16, fontWeight: '600', color: '#fff' },
});

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
import Svg, { Path, G, Text as SvgText } from 'react-native-svg';
import { captureRef } from 'react-native-view-shot';
import { PhotoService } from '../../services/LocalStorage';
import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTranslation } from 'react-i18next';
// File system import removed - using simpler export method

// API_URL removed - using local storage now
const { width } = Dimensions.get('window');

// Key für Tool-Einstellungen
const ANNOTATE_SETTINGS_KEY = 'aufmassprofi_annotate_settings';

// Verfügbare Schriftarten - Platform-spezifisch für React Native SVG
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

// PDF-Größen Optionen
const PDF_SIZES = [
  { value: 'small', label: 'Klein', icon: 'apps-outline', description: '9 pro Seite (3x3)' },
  { value: 'medium', label: 'Mittel', icon: 'grid-outline', description: '4 pro Seite (2x2)' },
  { value: 'large', label: 'Groß', icon: 'square-outline', description: '2 pro Seite (1x2)' },
];

export default function AnnotatePhotoScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useLocalSearchParams();
  const photoId = Array.isArray(params.photoId) ? params.photoId[0] : params.photoId;
  const projectId = Array.isArray(params.projectId) ? params.projectId[0] : params.projectId;
  const canvasRef = useRef(null);
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
  
  // Text-Einstellungen (werden gespeichert)
  const [lastTextFontSize, setLastTextFontSize] = useState(20);
  const [lastTextColor, setLastTextColor] = useState('#000000');
  const [lastTextFontFamily, setLastTextFontFamily] = useState<FontFamily>('System');
  
  // Text-Modal State
  const [showTextModal, setShowTextModal] = useState(false);
  const [textInput, setTextInput] = useState('');
  const [pendingTextPosition, setPendingTextPosition] = useState<{ x: number; y: number } | null>(null);
  const [drawMode, setDrawMode] = useState<'draw' | 'text'>('draw');
  
  // Text-Auswahl und Bearbeitung
  const [selectedTextId, setSelectedTextId] = useState<string | null>(null);
  const [isDraggingText, setIsDraggingText] = useState(false);
  const [showEditTextModal, setShowEditTextModal] = useState(false);
  const [editTextInput, setEditTextInput] = useState('');
  const [editTextFontSize, setEditTextFontSize] = useState(20);
  const [editTextColor, setEditTextColor] = useState('#000000');
  const [editTextFontFamily, setEditTextFontFamily] = useState<FontFamily>('System');
  const textDragStartRef = useRef({ x: 0, y: 0 });
  const textOriginalPosRef = useRef({ x: 0, y: 0 });
  
  // Zoom & Pan
  const [scale, setScale] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [lastScale, setLastScale] = useState(1);
  const [lastPanOffset, setLastPanOffset] = useState({ x: 0, y: 0 });
  const [isZooming, setIsZooming] = useState(false);
  
  // === Android Pinch-to-Zoom ===
  const androidZoomScale = useRef(new Animated.Value(1)).current;
  const androidTranslateX = useRef(new Animated.Value(0)).current;
  const androidTranslateY = useRef(new Animated.Value(0)).current;
  const androidPinchRef = useRef({
    initialDistance: 0,
    initialScale: 1,
    lastPanX: 0,
    lastPanY: 0,
    isPinching: false,
    currentScale: 1,
    currentTranslateX: 0,
    currentTranslateY: 0,
  });
  
  // Drawing mode toggle
  const [drawingEnabled, setDrawingEnabled] = useState(false);
  
  // Datum/Uhrzeit als Text auf Foto einfügen
  const addDateTimeText = () => {
    const now = new Date();
    const dateStr = now.toLocaleDateString('de-DE', { 
      day: '2-digit', month: '2-digit', year: 'numeric' 
    });
    const timeStr = now.toLocaleTimeString('de-DE', { 
      hour: '2-digit', minute: '2-digit' 
    });
    const dateTimeText = `${dateStr} ${timeStr}`;
    
    console.log('Adding date/time text:', dateTimeText, 'canvas:', canvasDimensions);
    
    // Position: oben links, mit etwas Abstand vom Rand
    const x = 20;
    const y = 30;
    
    const newId = Date.now().toString(36) + Math.random().toString(36).substr(2);
    
    const newTextElement = {
      id: newId,
      x,
      y,
      text: dateTimeText,
      fontSize: lastTextFontSize || 20,
      color: '#FFFFFF', // Weiß für bessere Sichtbarkeit auf Fotos
      fontFamily: lastTextFontFamily || 'System',
    };
    
    setTextElements(prev => [...prev, newTextElement]);
    setHasChanges(true);
    
    // Automatisch in Text-Modus wechseln und das Datum auswählen
    setDrawingEnabled(true);
    setDrawMode('text');
    setSelectedTextId(newId);
    
    Alert.alert('Datum hinzugefügt', 'Das Datum kann jetzt auf dem Bild verschoben werden. Tippen und ziehen Sie den Text.');
  };
  
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
  const textElementsRef = useRef(textElements);
  const descriptionRef = useRef(description);
  const pdfSizeRef = useRef(pdfSize);
  const imageUriRef = useRef(imageUri);
  
  // Refs aktuell halten
  useEffect(() => {
    pathsRef.current = paths;
  }, [paths]);
  
  useEffect(() => {
    textElementsRef.current = textElements;
  }, [textElements]);
  
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
    loadSettings();
  }, [photoId]);

  // Einstellungen aus AsyncStorage laden
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
      }
    } catch (error) {
      console.log('Error loading annotate settings:', error);
    }
  };

  // Einstellungen speichern
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

  // Update-Funktionen mit Speicherung
  const updateDrawColor = useCallback((color: string) => {
    setDrawColor(color);
    saveSettings('drawColor', color);
  }, [saveSettings]);

  const updateStrokeWidth = useCallback((sw: number) => {
    setStrokeWidth(sw);
    saveSettings('strokeWidth', sw);
  }, [saveSettings]);

  const updateLastTextFontSize = useCallback((value: number) => {
    setLastTextFontSize(value);
    saveSettings('lastTextFontSize', value);
  }, [saveSettings]);

  const updateLastTextColor = useCallback((value: string) => {
    setLastTextColor(value);
    saveSettings('lastTextColor', value);
  }, [saveSettings]);

  const updateLastTextFontFamily = useCallback((value: FontFamily) => {
    setLastTextFontFamily(value);
    saveSettings('lastTextFontFamily', value);
  }, [saveSettings]);

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
      const currentTextElements = textElementsRef.current;
      const currentDescription = descriptionRef.current;
      const currentPdfSize = pdfSizeRef.current;
      const currentImageUri = imageUriRef.current;
      
      const annotationData = {
        paths: currentPaths,
        textElements: currentTextElements,
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
      
      console.log('Auto-saved photo annotations, paths count:', currentPaths.length, 'texts count:', currentTextElements.length);
    } catch (error) {
      console.error('Error auto-saving:', error);
    }
  };

  const loadPhoto = async () => {
    try {
      // Direkt das einzelne Foto laden (statt alle Projekt-Fotos)
      const photo = await PhotoService.getById(photoId || '');
      if (photo) {
        // Prüfe ob image_data oder uri vorhanden ist
        const imageSource = photo.image_data || photo.uri;
        if (imageSource) {
          setImageUri(imageSource);
        } else {
          // Fallback: Versuche Bilddaten direkt aus AsyncStorage zu laden
          try {
            const directImage = await AsyncStorage.getItem(`photo_img_${photoId}`);
            if (directImage) {
              setImageUri(directImage);
            } else {
              console.error('No image data found for photo:', photoId);
              Alert.alert(t('common.error'), 'Keine Bilddaten gefunden');
            }
          } catch (e) {
            console.error('Error loading direct image:', e);
            Alert.alert(t('common.error'), 'Keine Bilddaten gefunden');
          }
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
            // Load text elements if available
            if (annotationData.textElements && Array.isArray(annotationData.textElements)) {
              setTextElements(annotationData.textElements);
            }
          } catch (e) {
            console.error('Error parsing annotations:', e);
          }
        } else {
          initialPathsRef.current = '[]';
        }
      } else {
        console.error('Photo not found:', photoId);
        Alert.alert(t('common.error'), 'Foto nicht gefunden');
      }
    } catch (error) {
      console.error('Error loading photo:', error);
      Alert.alert(t('common.error'), 'Foto konnte nicht geladen werden');
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
      const touch = touches[0];
      const locationX = touch.locationX / scale;
      const locationY = touch.locationY / scale;
      
      // Im Text-Modus: Prüfe ob ein Text-Element getippt wurde
      if (drawMode === 'text') {
        const tappedText = findTextAtPosition(locationX, locationY);
        if (tappedText) {
          // Text gefunden - auswählen oder verschieben starten
          if (selectedTextId === tappedText.id) {
            // Bereits ausgewählt - Verschieben starten
            startDraggingText(locationX, locationY);
          } else {
            // Neuen Text auswählen
            selectTextElement(tappedText);
          }
          return;
        } else if (selectedTextId) {
          // Außerhalb eines Textes getippt - Auswahl aufheben
          deselectText();
        }
        // Kein Text getippt - neuer Text wird bei handleTextModeTouch erstellt
        return;
      }
      
      // Im Zeichen-Modus: Normal zeichnen
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
    
    if (touches.length === 1 && !isZooming && drawingEnabled) {
      const touch = touches[0];
      const locationX = touch.locationX / scale;
      const locationY = touch.locationY / scale;
      
      // Im Text-Modus: Text verschieben wenn aktiv
      if (drawMode === 'text' && isDraggingText) {
        moveText(locationX, locationY);
        return;
      }
      
      // Im Zeichen-Modus: Normal zeichnen
      if (currentPath) {
        setCurrentPath((prev) => `${prev} L ${locationX} ${locationY}`);
      }
    }
  };

  const onTouchEnd = (event: any) => {
    const touches = event.nativeEvent.touches;
    
    if (touches.length < 2) {
      setIsZooming(false);
      setInitialPinchDistance(null);
    }
    
    // Text-Verschiebung beenden
    if (isDraggingText) {
      stopDraggingText();
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
      'Möchten Sie alle Zeichnungen und Texte löschen?',
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('common.delete'), onPress: () => {
          setPaths([]);
          setTextElements([]);
        }},
      ]
    );
  };

  // Text-Element hinzufügen
  const addTextElement = () => {
    if (!textInput.trim() || !pendingTextPosition) {
      setShowTextModal(false);
      setTextInput('');
      setPendingTextPosition(null);
      return;
    }

    const newText: TextElement = {
      id: `text_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      text: textInput.trim(),
      x: pendingTextPosition.x,
      y: pendingTextPosition.y,
      color: lastTextColor,
      fontSize: lastTextFontSize,
      fontFamily: FONT_FAMILIES.find(f => f.id === lastTextFontFamily)?.svgFont || 'sans-serif',
      fontWeight: 'bold',
    };

    setTextElements([...textElements, newText]);
    setHasChanges(true);
    setShowTextModal(false);
    setTextInput('');
    setPendingTextPosition(null);
  };

  // Text löschen
  const deleteLastText = () => {
    if (textElements.length > 0) {
      setTextElements(textElements.slice(0, -1));
      setHasChanges(true);
    }
  };

  // Text-Element finden bei Touch-Position
  const findTextAtPosition = (x: number, y: number): TextElement | null => {
    // Suche von oben (letztes Element) nach unten
    for (let i = textElements.length - 1; i >= 0; i--) {
      const textEl = textElements[i];
      const textWidth = textEl.text.length * (textEl.fontSize * 0.6); // Ungefähre Textbreite
      const textHeight = textEl.fontSize * 1.2;
      const padding = 20; // Extra Padding für einfacheres Tippen
      
      if (
        x >= textEl.x - padding &&
        x <= textEl.x + textWidth + padding &&
        y >= textEl.y - textHeight - padding &&
        y <= textEl.y + padding
      ) {
        return textEl;
      }
    }
    return null;
  };

  // Text-Element auswählen
  const selectTextElement = (textEl: TextElement) => {
    setSelectedTextId(textEl.id);
    // Lade aktuelle Werte in den Bearbeitungsmodus
    const fontFamilyId = FONT_FAMILIES.find(f => f.svgFont === textEl.fontFamily)?.id || 'System';
    setEditTextInput(textEl.text);
    setEditTextFontSize(textEl.fontSize);
    setEditTextColor(textEl.color);
    setEditTextFontFamily(fontFamilyId);
  };

  // Text-Auswahl aufheben
  const deselectText = () => {
    setSelectedTextId(null);
    setIsDraggingText(false);
  };

  // Ausgewählten Text löschen
  const deleteSelectedText = () => {
    if (selectedTextId) {
      setTextElements(textElements.filter(t => t.id !== selectedTextId));
      setSelectedTextId(null);
      setHasChanges(true);
    }
  };

  // Text-Bearbeitung öffnen
  const openEditTextModal = () => {
    if (selectedTextId) {
      setShowEditTextModal(true);
    }
  };

  // Text-Bearbeitung speichern
  const saveEditedText = () => {
    if (!selectedTextId || !editTextInput.trim()) {
      setShowEditTextModal(false);
      return;
    }

    setTextElements(textElements.map(t => 
      t.id === selectedTextId
        ? {
            ...t,
            text: editTextInput.trim(),
            fontSize: editTextFontSize,
            color: editTextColor,
            fontFamily: FONT_FAMILIES.find(f => f.id === editTextFontFamily)?.svgFont || 'sans-serif',
          }
        : t
    ));
    setHasChanges(true);
    setShowEditTextModal(false);
  };

  // Text verschieben starten
  const startDraggingText = (x: number, y: number) => {
    const selectedText = textElements.find(t => t.id === selectedTextId);
    if (selectedText) {
      setIsDraggingText(true);
      textDragStartRef.current = { x, y };
      textOriginalPosRef.current = { x: selectedText.x, y: selectedText.y };
    }
  };

  // Text verschieben
  const moveText = (x: number, y: number) => {
    if (isDraggingText && selectedTextId) {
      const dx = x - textDragStartRef.current.x;
      const dy = y - textDragStartRef.current.y;
      
      setTextElements(textElements.map(t =>
        t.id === selectedTextId
          ? {
              ...t,
              x: textOriginalPosRef.current.x + dx,
              y: textOriginalPosRef.current.y + dy,
            }
          : t
      ));
    }
  };

  // Text verschieben beenden
  const stopDraggingText = () => {
    if (isDraggingText) {
      setIsDraggingText(false);
      setHasChanges(true);
    }
  };

  const save = async () => {
    try {
      setLoading(true);
      
      // Create annotation data with actual canvas dimensions for proper scaling in PDF
      const annotationData = {
        paths: paths,
        textElements: textElements,
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

      Alert.alert(t('common.success'), 'Foto wurde gespeichert', [
        { text: t('common.ok'), onPress: () => router.back() },
      ]);
    } catch (error) {
      console.error('Error saving annotated photo:', error);
      Alert.alert(t('common.error'), 'Foto konnte nicht gespeichert werden');
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
      
      if ((paths.length > 0 || textElements.length > 0) && canvasRef.current) {
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
        Alert.alert(t('common.error'), 'Teilen ist auf diesem Gerät nicht verfügbar');
      }
    } catch (error) {
      console.error('Error saving to gallery:', error);
      Alert.alert(t('common.error'), 'Foto konnte nicht gespeichert werden: ' + (error as Error).message);
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
                  // pdf_size sofort speichern, damit die Änderung beim Zurückkehren verfügbar ist
                  if (photoId) {
                    PhotoService.update(photoId, { pdf_size: size.value }).catch(err => 
                      console.error('Error saving pdf_size:', err)
                    );
                  }
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
          {drawingEnabled && drawMode === 'draw' && (
            <View style={styles.colorsRow}>
              {colors.map((c) => (
                <TouchableOpacity
                  key={c.color}
                  style={[
                    styles.colorButtonSmall,
                    { backgroundColor: c.color },
                    drawColor === c.color && styles.colorButtonSmallActive,
                  ]}
                  onPress={() => updateDrawColor(c.color)}
                />
              ))}
            </View>
          )}
          
          {/* Strichstärke - nur wenn im Zeichenmodus */}
          {drawingEnabled && drawMode === 'draw' && (
            <View style={styles.strokeRow}>
              {[2, 4, 6, 8].map((sw) => (
                <TouchableOpacity
                  key={sw}
                  style={[
                    styles.strokeButton,
                    strokeWidth === sw && styles.strokeButtonActive,
                  ]}
                  onPress={() => updateStrokeWidth(sw)}
                >
                  <View style={[styles.strokePreview, { height: sw, backgroundColor: strokeWidth === sw ? '#fff' : '#1976d2' }]} />
                </TouchableOpacity>
              ))}
            </View>
          )}
          
          {/* Zeichnen Toggle */}
          <TouchableOpacity 
            style={[styles.drawToggleButton, drawingEnabled && drawMode === 'draw' && styles.drawToggleButtonActive]} 
            onPress={() => {
              if (drawingEnabled && drawMode === 'draw') {
                setDrawingEnabled(false);
              } else {
                setDrawingEnabled(true);
                setDrawMode('draw');
                setEditMode(false);
                setSelectedPathIndex(null);
              }
            }}
          >
            <Ionicons name={drawingEnabled && drawMode === 'draw' ? "brush" : "brush-outline"} size={18} color={drawingEnabled && drawMode === 'draw' ? '#fff' : '#4CAF50'} />
            <Text style={[styles.drawToggleText, drawingEnabled && drawMode === 'draw' && styles.drawToggleTextActive]}>
              Zeichnen
            </Text>
          </TouchableOpacity>
          
          {/* Text Toggle */}
          <TouchableOpacity 
            style={[styles.textToggleButton, drawingEnabled && drawMode === 'text' && styles.textToggleButtonActive]} 
            onPress={() => {
              if (drawingEnabled && drawMode === 'text') {
                setDrawingEnabled(false);
              } else {
                setDrawingEnabled(true);
                setDrawMode('text');
                setEditMode(false);
                setSelectedPathIndex(null);
              }
            }}
          >
            <Ionicons name={drawingEnabled && drawMode === 'text' ? "text" : "text-outline"} size={18} color={drawingEnabled && drawMode === 'text' ? '#fff' : '#9C27B0'} />
            <Text style={[styles.textToggleText, drawingEnabled && drawMode === 'text' && styles.textToggleTextActive]}>
              Text
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Zweite Toolbar-Zeile: Aktionen */}
      <View style={styles.actionsToolbar}>
        {/* Text ausgewählt - Bearbeitungs-Buttons anzeigen */}
        {selectedTextId && drawMode === 'text' ? (
          <>
            <TouchableOpacity style={[styles.actionButton, { backgroundColor: '#e3f2fd' }]} onPress={openEditTextModal}>
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
            <TouchableOpacity style={styles.actionButton} onPress={clear} disabled={!drawingEnabled || (paths.length === 0 && textElements.length === 0)}>
              <Ionicons name="trash-outline" size={20} color={drawingEnabled && (paths.length > 0 || textElements.length > 0) ? '#f44336' : '#ccc'} />
              <Text style={[styles.actionText, (!drawingEnabled || (paths.length === 0 && textElements.length === 0)) && { color: '#ccc' }]}>Alle</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.actionButton, styles.deletePhotoButton]} 
              onPress={() => {
                Alert.alert(
                  'Foto löschen',
                  'Möchten Sie dieses Foto komplett löschen?',
                  [
                    { text: t('common.cancel'), style: 'cancel' },
                    {
                      text: 'Löschen',
                      style: 'destructive',
                      onPress: async () => {
                        try {
                          await PhotoService.delete(photoId || '');
                          Alert.alert(t('common.success'), 'Foto wurde gelöscht', [
                            { text: t('common.ok'), onPress: () => router.back() },
                          ]);
                        } catch (error) {
                          console.error('Error deleting photo:', error);
                          Alert.alert(t('common.error'), 'Foto konnte nicht gelöscht werden');
                        }
                      },
                    },
                  ]
                );
              }}
            >
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

      {/* Beschreibung Eingabefeld */}
      <View style={styles.descriptionContainer}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={styles.descriptionLabel}>Beschreibung:</Text>
          {/* Datum/Uhrzeit Button */}
          <TouchableOpacity
            style={{
              backgroundColor: '#e8f5e9',
              paddingHorizontal: 10,
              paddingVertical: 5,
              borderRadius: 6,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 4,
              borderWidth: 1,
              borderColor: '#4caf50',
            }}
            onPress={addDateTimeText}
          >
            <Ionicons name="calendar-outline" size={16} color="#388e3c" />
            <Text style={{ fontSize: 12, color: '#388e3c', fontWeight: '600' }}>Datum</Text>
          </TouchableOpacity>
        </View>
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
        {/* Android: Animated.View Wrapper für Pinch-to-Zoom */}
        <Animated.View style={Platform.OS === 'android' ? {
          transform: [
            { translateX: androidTranslateX },
            { translateY: androidTranslateY },
            { scale: androidZoomScale },
          ],
        } : undefined}>
        <View style={{ flex: 1 }}>
          <Image source={{ uri: imageUri }} style={styles.backgroundImage} resizeMode="contain" />
          <View
            style={styles.svgContainer}
            onStartShouldSetResponder={() => Platform.OS === 'android' ? true : drawingEnabled}
            onMoveShouldSetResponder={() => Platform.OS === 'android' ? true : (drawingEnabled && (drawMode === 'draw' || isDraggingText))}
            onResponderGrant={(event) => {
              // Android Zoom: Multi-Touch abfangen wenn Zeichnen deaktiviert
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
                // Im Text-Modus: Prüfe ob ein Text getippt wurde
                const tappedText = findTextAtPosition(locationX, locationY);
                if (tappedText) {
                  if (selectedTextId === tappedText.id) {
                    // Bereits ausgewählt - Verschieben starten
                    startDraggingText(locationX, locationY);
                  } else {
                    // Neuen Text auswählen
                    selectTextElement(tappedText);
                  }
                } else if (selectedTextId) {
                  // Außerhalb getippt - Auswahl aufheben und neuen Text erstellen
                  deselectText();
                  setPendingTextPosition({ x: locationX, y: locationY });
                  setShowTextModal(true);
                } else {
                  // Kein Text ausgewählt - neuen Text erstellen
                  setPendingTextPosition({ x: locationX, y: locationY });
                  setShowTextModal(true);
                }
              }
            }}
            onResponderMove={(event) => {
              // Android Zoom: Multi-Touch abfangen wenn Zeichnen deaktiviert
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
              
              // Text verschieben
              if (drawingEnabled && drawMode === 'text' && isDraggingText) {
                moveText(locationX, locationY);
                return;
              }
              
              if (drawingEnabled && drawMode === 'draw' && currentPath) {
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
              // Android Zoom Ende
              if (Platform.OS === 'android' && !drawingEnabled) {
                androidPinchRef.current.isPinching = false;
                androidPinchRef.current.initialDistance = 0;
                return;
              }
              // Text-Verschiebung beenden
              if (isDraggingText) {
                stopDraggingText();
              }
              
              if (drawingEnabled && drawMode === 'draw' && currentPath && currentPath.length > 0) {
                const bounds = calculateBounds(currentPath);
                setPaths([...paths, { path: currentPath, color: drawColor, strokeWidth, bounds }]);
                setCurrentPath('');
                setHasChanges(true);
              }
            }}
          >
            <Svg height="100%" width="100%" style={{ position: 'absolute' }}>
              {/* Draw paths */}
              {paths.map((p, index) => {
                return (
                  <G key={`path-${index}`}>
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
              {/* Text elements */}
              {textElements.map((textEl) => {
                const isSelected = selectedTextId === textEl.id;
                const textWidth = textEl.text.length * (textEl.fontSize * 0.6);
                const textHeight = textEl.fontSize * 1.2;
                return (
                  <G key={textEl.id}>
                    {/* Auswahlrahmen wenn ausgewählt */}
                    {isSelected && (
                      <Path
                        d={`M ${textEl.x - 5} ${textEl.y - textHeight - 5} 
                            L ${textEl.x + textWidth + 5} ${textEl.y - textHeight - 5} 
                            L ${textEl.x + textWidth + 5} ${textEl.y + 5} 
                            L ${textEl.x - 5} ${textEl.y + 5} Z`}
                        stroke="#1976d2"
                        strokeWidth={2}
                        strokeDasharray="5,3"
                        fill="rgba(25, 118, 210, 0.1)"
                      />
                    )}
                    <SvgText
                      x={textEl.x}
                      y={textEl.y}
                      fill={textEl.color}
                      fontSize={textEl.fontSize}
                      fontWeight={textEl.fontWeight}
                      fontFamily={textEl.fontFamily}
                    >
                      {textEl.text}
                    </SvgText>
                  </G>
                );
              })}
            </Svg>
          </View>
        </View>
        </Animated.View>
      </ScrollView>

      {/* Text Input Modal */}
      <Modal visible={showTextModal} transparent animationType="slide">
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Text eingeben</Text>
            <TextInput
              style={styles.modalInput}
              value={textInput}
              onChangeText={setTextInput}
              placeholder="Text hier eingeben..."
              multiline
              autoFocus
            />
            
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
                {colors.map(c => (
                  <TouchableOpacity
                    key={c.color}
                    style={[
                      styles.colorOption,
                      { backgroundColor: c.color },
                      lastTextColor === c.color && styles.colorOptionSelected,
                    ]}
                    onPress={() => updateLastTextColor(c.color)}
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
                  setPendingTextPosition(null);
                }}
              >
                <Text style={styles.cancelButtonText}>Abbrechen</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.confirmButton]}
                onPress={addTextElement}
              >
                <Text style={styles.confirmButtonText}>Hinzufügen</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Text Edit Modal */}
      <Modal visible={showEditTextModal} transparent animationType="slide">
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Text bearbeiten</Text>
            <TextInput
              style={styles.modalInput}
              value={editTextInput}
              onChangeText={setEditTextInput}
              placeholder="Text hier eingeben..."
              multiline
              autoFocus
            />
            
            {/* Font Size Slider */}
            <View style={styles.sliderContainer}>
              <Text style={styles.modalLabel}>Schriftgröße: {editTextFontSize}px</Text>
              <View style={styles.sliderRow}>
                <TouchableOpacity 
                  style={styles.sliderButton} 
                  onPress={() => setEditTextFontSize(Math.max(10, editTextFontSize - 2))}
                >
                  <Text style={styles.sliderButtonText}>-</Text>
                </TouchableOpacity>
                <View style={styles.sliderTrack}>
                  <View style={[styles.sliderFill, { width: `${((editTextFontSize - 10) / 50) * 100}%` }]} />
                </View>
                <TouchableOpacity 
                  style={styles.sliderButton} 
                  onPress={() => setEditTextFontSize(Math.min(60, editTextFontSize + 2))}
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
                      editTextFontFamily === font.id && styles.fontFamilyButtonActive
                    ]}
                    onPress={() => setEditTextFontFamily(font.id)}
                  >
                    <Text style={[
                      styles.fontFamilyButtonText,
                      { fontFamily: font.style },
                      editTextFontFamily === font.id && styles.fontFamilyButtonTextActive
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
                {colors.map(c => (
                  <TouchableOpacity
                    key={c.color}
                    style={[
                      styles.colorOption,
                      { backgroundColor: c.color },
                      editTextColor === c.color && styles.colorOptionSelected,
                    ]}
                    onPress={() => setEditTextColor(c.color)}
                  />
                ))}
              </View>
            </View>
            
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => {
                  setShowEditTextModal(false);
                }}
              >
                <Text style={styles.cancelButtonText}>Abbrechen</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.confirmButton]}
                onPress={saveEditedText}
              >
                <Text style={styles.confirmButtonText}>Speichern</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
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
  // Text-Auswahl Hinweis
  selectedTextHint: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e3f2fd',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 12,
    gap: 4,
  },
  selectedTextHintText: {
    fontSize: 10,
    color: '#1976d2',
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
  // Text Toggle Button
  textToggleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 16,
    backgroundColor: '#f5f5f5',
    borderWidth: 2,
    borderColor: '#9C27B0',
    gap: 3,
  },
  textToggleButtonActive: {
    backgroundColor: '#9C27B0',
    borderColor: '#7B1FA2',
  },
  textToggleText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#9C27B0',
  },
  textToggleTextActive: {
    color: '#fff',
  },
  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    width: '100%',
    maxWidth: 400,
    maxHeight: '90%',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#333',
    marginBottom: 16,
    textAlign: 'center',
  },
  modalInput: {
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    minHeight: 50,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    marginBottom: 16,
  },
  modalLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginBottom: 8,
  },
  sliderContainer: {
    marginBottom: 16,
  },
  sliderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sliderButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#e0e0e0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sliderButtonText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#333',
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
    backgroundColor: '#9C27B0',
    borderRadius: 4,
  },
  fontFamilyContainer: {
    marginBottom: 16,
  },
  fontFamilyButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  fontFamilyButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#f0f0f0',
    borderWidth: 2,
    borderColor: '#ddd',
  },
  fontFamilyButtonActive: {
    backgroundColor: '#9C27B0',
    borderColor: '#7B1FA2',
  },
  fontFamilyButtonText: {
    fontSize: 14,
    color: '#333',
  },
  fontFamilyButtonTextActive: {
    color: '#fff',
  },
  colorPickerContainer: {
    marginBottom: 16,
  },
  colorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  colorOption: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: '#ddd',
  },
  colorOptionSelected: {
    borderWidth: 3,
    borderColor: '#9C27B0',
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: '#f0f0f0',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
  },
  confirmButton: {
    backgroundColor: '#9C27B0',
  },
  confirmButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
});

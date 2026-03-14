import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Platform,
  Dimensions,
  Modal,
  TextInput,
  ScrollView,
  PanResponder,
  Animated,
  Image,
  Keyboard,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import Svg, { 
  Path, 
  Circle, 
  Line, 
  Rect, 
  G, 
  Text as SvgText,
  Polygon as SvgPolygon,
  Defs,
  Pattern,
  Image as SvgImage,
  Polyline,
} from 'react-native-svg';

// Custom SVG Icons for Toolbar
const AreaIcon = ({ size = 24, color = '#4CAF50' }: { size?: number; color?: string }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Rect x="3" y="3" width="18" height="18" stroke={color} strokeWidth="1.5" fill="none" />
    <Path d="M12 3 L12 7 M12 17 L12 21" stroke={color} strokeWidth="1.5" />
    <Path d="M3 12 L7 12 M17 12 L21 12" stroke={color} strokeWidth="1.5" />
    <Polyline points="10,5 12,3 14,5" fill="none" stroke={color} strokeWidth="1.5" />
    <Polyline points="10,19 12,21 14,19" fill="none" stroke={color} strokeWidth="1.5" />
    <Polyline points="5,10 3,12 5,14" fill="none" stroke={color} strokeWidth="1.5" />
    <Polyline points="19,10 21,12 19,14" fill="none" stroke={color} strokeWidth="1.5" />
    <SvgText x="12" y="13" fontSize="6" fontWeight="bold" fill={color} textAnchor="middle">m²</SvgText>
  </Svg>
);

const AngleIcon = ({ size = 24, color = '#4CAF50' }: { size?: number; color?: string }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Path d="M4 20 L4 6" stroke={color} strokeWidth="1.5" fill="none" />
    <Path d="M4 20 L20 20" stroke={color} strokeWidth="1.5" fill="none" />
    <Path d="M4 14 Q8 14 10 20" stroke={color} strokeWidth="1.5" fill="none" />
    <Polyline points="2,8 4,6 6,8" fill="none" stroke={color} strokeWidth="1.5" />
    <Polyline points="18,18 20,20 18,22" fill="none" stroke={color} strokeWidth="1.5" />
    <SvgText x="15" y="12" fontSize="7" fontWeight="bold" fill={color}>90°</SvgText>
  </Svg>
);

const ScaleIcon = ({ size = 24, color = '#666' }: { size?: number; color?: string }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Line x1="4" y1="8" x2="4" y2="12" stroke={color} strokeWidth="2" />
    <Line x1="20" y1="8" x2="20" y2="12" stroke={color} strokeWidth="2" />
    <Line x1="4" y1="10" x2="20" y2="10" stroke={color} strokeWidth="1.5" />
    <Polyline points="6,8 4,10 6,12" fill="none" stroke={color} strokeWidth="1.5" />
    <Polyline points="18,8 20,10 18,12" fill="none" stroke={color} strokeWidth="1.5" />
    <Rect x="2" y="15" width="20" height="5" rx="1" fill={color} />
    <Line x1="4" y1="15" x2="4" y2="18" stroke="#fff" strokeWidth="0.5" />
    <Line x1="6" y1="15" x2="6" y2="17" stroke="#fff" strokeWidth="0.5" />
    <Line x1="8" y1="15" x2="8" y2="18" stroke="#fff" strokeWidth="0.5" />
    <Line x1="10" y1="15" x2="10" y2="17" stroke="#fff" strokeWidth="0.5" />
    <Line x1="12" y1="15" x2="12" y2="18" stroke="#fff" strokeWidth="0.5" />
    <Line x1="14" y1="15" x2="14" y2="17" stroke="#fff" strokeWidth="0.5" />
    <Line x1="16" y1="15" x2="16" y2="18" stroke="#fff" strokeWidth="0.5" />
    <Line x1="18" y1="15" x2="18" y2="17" stroke="#fff" strokeWidth="0.5" />
    <Line x1="20" y1="15" x2="20" y2="18" stroke="#fff" strokeWidth="0.5" />
  </Svg>
);

const DeductionAreaIcon = ({ size = 24, color = '#f44336' }: { size?: number; color?: string }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Rect x="3" y="3" width="18" height="18" stroke={color} strokeWidth="1.5" strokeDasharray="3,2" fill="none" />
    <Path d="M5 19 L5 15" stroke={color} strokeWidth="1.5" />
    <Path d="M5 19 L9 19" stroke={color} strokeWidth="1.5" />
    <Polyline points="3.5,16.5 5,15 6.5,16.5" fill="none" stroke={color} strokeWidth="1" />
    <Polyline points="7.5,17.5 9,19 7.5,20.5" fill="none" stroke={color} strokeWidth="1" />
    <SvgText x="14" y="14" fontSize="7" fontWeight="bold" fill={color}>m²</SvgText>
  </Svg>
);

const DeductionRectIcon = ({ size = 24, color = '#f44336' }: { size?: number; color?: string }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Rect x="4" y="4" width="16" height="16" stroke={color} strokeWidth="2" fill="none" rx="1" />
    <Line x1="8" y1="12" x2="16" y2="12" stroke={color} strokeWidth="2.5" />
  </Svg>
);
import { 
  AreaCalculationService, 
  AreaCalculation, 
  AreaPolygon, 
  AreaPoint,
  AreaLine,
  LineCategoryService,
  LineCategory,
  TextShortcutService,
  TextShortcut,
} from '../../services/LocalStorage';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

export default function AreaCalculatorEditor() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const calculationId = params.id as string | undefined;
  const projectIdParam = params.projectId as string | undefined;
  
  // State
  const [projectId, setProjectId] = useState<string | undefined>(projectIdParam);
  const [name, setName] = useState('Neue Berechnung');
  const [scale, setScale] = useState(100); // 100 Pixel = 1 Meter
  const [polygons, setPolygons] = useState<AreaPolygon[]>([]);
  const [lines, setLines] = useState<AreaLine[]>([]);
  const [lineCategories, setLineCategories] = useState<LineCategory[]>([]);
  const [textShortcuts, setTextShortcuts] = useState<TextShortcut[]>([]);
  const [gridEnabled, setGridEnabled] = useState(true);
  const [gridSize, setGridSize] = useState(0.25); // 0.25 Meter (25cm) pro Rasterfeld
  
  // === ZOOM & PAN ===
  const [zoomLevel, setZoomLevel] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const lastPanPosition = useRef({ x: 0, y: 0 });
  const lastPinchDistance = useRef<number | null>(null);
  const lastPinchCenter = useRef({ x: 0, y: 0 });
  const isPinching = useRef(false);
  
  // === BACKGROUND IMAGE ===
  const [backgroundImage, setBackgroundImage] = useState<string | null>(null);
  const [bgImageSize, setBgImageSize] = useState({ width: 500, height: 400 });
  const [bgImagePosition, setBgImagePosition] = useState({ x: 0, y: 0 });
  const [bgImageScale, setBgImageScale] = useState(1);
  const [bgLockAspectRatio, setBgLockAspectRatio] = useState(true);
  const [bgImageEditMode, setBgImageEditMode] = useState(false);
  const [showBgImageModal, setShowBgImageModal] = useState(false);
  const [showImagePreview, setShowImagePreview] = useState(false);
  const [draggingBgImage, setDraggingBgImage] = useState(false);
  const [resizingBgImage, setResizingBgImage] = useState<'none' | 'nw' | 'ne' | 'sw' | 'se'>('none');
  const bgImageDragStart = useRef({ x: 0, y: 0 });
  const bgImageOriginalSize = useRef({ width: 500, height: 400 });
  const [projectPhotos, setProjectPhotos] = useState<{ id: string; uri: string }[]>([]);
  
  // Custom edge lengths (user can override calculated values)
  const [customEdgeLengths, setCustomEdgeLengths] = useState<{ [key: string]: number }>({});
  
  // Manual area calculation mode
  const [useManualAreaCalc, setUseManualAreaCalc] = useState(false);
  
  // Numpad state
  const [showNumpad, setShowNumpad] = useState(false);
  const [numpadInput, setNumpadInput] = useState('');
  const [editingEdge, setEditingEdge] = useState<{ polygonId: string; edgeIndex: number } | null>(null);
  const numpadPosition = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const numpadPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        numpadPosition.setOffset({
          x: (numpadPosition.x as any)._value || 0,
          y: (numpadPosition.y as any)._value || 0,
        });
      },
      onPanResponderMove: Animated.event(
        [null, { dx: numpadPosition.x, dy: numpadPosition.y }],
        { useNativeDriver: false }
      ),
      onPanResponderRelease: () => {
        numpadPosition.flattenOffset();
      },
    })
  ).current;

  // Angle Modal Drag Position
  const angleModalPosition = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const angleModalPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        angleModalPosition.setOffset({
          x: (angleModalPosition.x as any)._value || 0,
          y: (angleModalPosition.y as any)._value || 0,
        });
      },
      onPanResponderMove: Animated.event(
        [null, { dx: angleModalPosition.x, dy: angleModalPosition.y }],
        { useNativeDriver: false }
      ),
      onPanResponderRelease: () => {
        angleModalPosition.flattenOffset();
      },
    })
  ).current;

  // Text-Numpad für Texteingaben (mit Zahlen/Buchstaben-Umschaltung)
  const [showTextNumpad, setShowTextNumpad] = useState(false);
  const [textNumpadMode, setTextNumpadMode] = useState<'numbers' | 'letters'>('letters');
  const [textNumpadCaps, setTextNumpadCaps] = useState(false);
  const [textNumpadTarget, setTextNumpadTarget] = useState<'newText' | 'editText' | 'memo' | 'scale'>('newText');
  const textNumpadPosition = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const textNumpadPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        textNumpadPosition.setOffset({
          x: (textNumpadPosition.x as any)._value || 0,
          y: (textNumpadPosition.y as any)._value || 0,
        });
      },
      onPanResponderMove: Animated.event(
        [null, { dx: textNumpadPosition.x, dy: textNumpadPosition.y }],
        { useNativeDriver: false }
      ),
      onPanResponderRelease: () => {
        textNumpadPosition.flattenOffset();
      },
    })
  ).current;

  // Handler für Text-Numpad
  const handleTextNumpadInput = (key: string) => {
    const setter = textNumpadTarget === 'newText' ? setNewTextInput 
                 : textNumpadTarget === 'editText' ? setEditTextInput 
                 : setMemoText;
    
    if (key === 'C') {
      setter('');
    } else if (key === '⌫') {
      setter((prev: string) => prev.slice(0, -1));
    } else {
      setter((prev: string) => prev + key);
    }
  };

  // PanResponder für verschiebbare Text-Modals
  const textModalPosition = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const textModalPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        textModalPosition.setOffset({
          x: (textModalPosition.x as any)._value || 0,
          y: (textModalPosition.y as any)._value || 0,
        });
      },
      onPanResponderMove: Animated.event(
        [null, { dx: textModalPosition.x, dy: textModalPosition.y }],
        { useNativeDriver: false }
      ),
      onPanResponderRelease: () => {
        textModalPosition.flattenOffset();
      },
    })
  ).current;

  // Reset Modal Position when opening
  const resetTextModalPosition = () => {
    textModalPosition.setValue({ x: 0, y: 0 });
    textModalPosition.setOffset({ x: 0, y: 0 });
  };

  // Parallel Modal - Draggable Position & Numpad
  const [showParallelNumpad, setShowParallelNumpad] = useState(false);
  const parallelModalPosition = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const parallelModalPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        parallelModalPosition.setOffset({
          x: (parallelModalPosition.x as any)._value || 0,
          y: (parallelModalPosition.y as any)._value || 0,
        });
      },
      onPanResponderMove: Animated.event(
        [null, { dx: parallelModalPosition.x, dy: parallelModalPosition.y }],
        { useNativeDriver: false }
      ),
      onPanResponderRelease: () => {
        parallelModalPosition.flattenOffset();
      },
    })
  ).current;

  const resetParallelModalPosition = () => {
    parallelModalPosition.setValue({ x: 0, y: 0 });
    parallelModalPosition.setOffset({ x: 0, y: 0 });
  };

  // Handler für Parallel-Modal Numpad
  const handleParallelNumpadPress = (key: string) => {
    if (key === 'C') {
      setParallelDistance('');
    } else if (key === '⌫') {
      setParallelDistance(prev => prev.slice(0, -1));
    } else {
      setParallelDistance(prev => prev + key);
    }
  };
  
  // Öffne Text-Numpad für bestimmtes Ziel

  // Handler für Winkel-Modal Numpad
  const handleAngleNumpadPress = (key: string) => {
    if (angleNumpadTarget === 'angle') {
      if (key === 'C') {
        setFixedAngle(null);
        setAngleInputText('');
      } else if (key === '⌫') {
        if (angleInputText.length > 0) {
          const newText = angleInputText.slice(0, -1);
          setAngleInputText(newText);
          if (newText === '' || newText === '-') {
            setFixedAngle(null);
          } else {
            let num = parseInt(newText);
            if (!isNaN(num)) {
              while (num < 0) num += 360;
              num = num % 360;
              setFixedAngle(num);
            }
          }
        } else if (fixedAngle !== null) {
          const str = fixedAngle.toString().slice(0, -1);
          setFixedAngle(str === '' ? null : parseInt(str));
          setAngleInputText(str);
        }
      } else if (key === '±') {
        // Vorzeichen umkehren: 90 → 270, 270 → 90
        if (fixedAngle !== null && fixedAngle !== 0) {
          const newAngle = (360 - fixedAngle) % 360;
          setFixedAngle(newAngle);
          setAngleInputText(newAngle.toString());
        }
      } else if (key === '-') {
        // Minus am Anfang hinzufügen
        if (!angleInputText.startsWith('-')) {
          setAngleInputText('-' + angleInputText);
        }
      } else if (/^[0-9]$/.test(key)) {
        const newText = angleInputText + key;
        setAngleInputText(newText);
        let num = parseInt(newText);
        if (!isNaN(num)) {
          while (num < 0) num += 360;
          num = num % 360;
          if (num <= 360) {
            setFixedAngle(num);
          }
        }
      }
      setTimeout(() => angleInputRef?.current?.focus(), 10);
    } else {
      // Length
      if (key === 'C') {
        setFixedLength('');
      } else if (key === '⌫') {
        setFixedLength(prev => prev.slice(0, -1));
      } else {
        setFixedLength(prev => prev + key);
      }
      setTimeout(() => lengthInputRef?.current?.focus(), 10);
    }
  };
  
  // Undo/Redo History
  interface HistoryState {
    polygons: AreaPolygon[];
    guideLines: GuideLine[];
    lines: AreaLine[];
    annotationShapes: AnnotationShape[];
    textAnnotations: TextAnnotation[];
    memoPointers: MemoPointer[];
    customEdgeLengths: { [key: string]: number };
  }
  const [undoStack, setUndoStack] = useState<HistoryState[]>([]);
  const [redoStack, setRedoStack] = useState<HistoryState[]>([]);
  
  // Hilfslinien
  interface GuideLine {
    id: string;
    start: AreaPoint;
    end: AreaPoint;
    isParallel?: boolean;
    parentId?: string;
  }
  const [guideLines, setGuideLines] = useState<GuideLine[]>([]);
  const [guideLinesVisible, setGuideLinesVisible] = useState(true);
  const [selectedGuideLineId, setSelectedGuideLineId] = useState<string | null>(null);
  const [draggingGuidePoint, setDraggingGuidePoint] = useState<{ guideId: string; point: 'start' | 'end' | 'middle' } | null>(null);
  const [snapToAngles, setSnapToAngles] = useState(true); // Winkel-Einrasten (0°, 45°, 90°)
  const [showAngleModal, setShowAngleModal] = useState(false); // Modal für Winkel-Einstellung
  const [fixedAngle, setFixedAngle] = useState<number | null>(null); // Fester Winkel für nächste Linie
  const [angleInputText, setAngleInputText] = useState(''); // Texteingabe für Winkel (erlaubt Minus)
  const [fixedLength, setFixedLength] = useState<string>(''); // Feste Länge für nächste Linie
  const [showPolygonAngles, setShowPolygonAngles] = useState(false); // Winkel zwischen Linien anzeigen
  const [showEdgeLengths, setShowEdgeLengths] = useState(true); // Kantenlängen anzeigen
  const [currentTouchPosition, setCurrentTouchPosition] = useState<AreaPoint | null>(null); // Für Live-Längenanzeige
  const [currentSnapPoint, setCurrentSnapPoint] = useState<{ point: AreaPoint; isSnapped: boolean } | null>(null); // Visuelles Feedback für Einrasten
  
  // Dimensioning (Vermaßung)
  interface DimensionLine {
    id: string;
    start: AreaPoint;
    end: AreaPoint;
    customLength?: number; // Manuell eingegebene Länge
  }
  const [dimensionLines, setDimensionLines] = useState<DimensionLine[]>([]);
  const [selectedDimensionId, setSelectedDimensionId] = useState<string | null>(null);
  const [draggingDimensionPoint, setDraggingDimensionPoint] = useState<{ dimId: string; point: 'start' | 'end' | 'middle' } | null>(null);
  
  // Editable measurement modal
  const [showMeasurementModal, setShowMeasurementModal] = useState(false);
  const [editingMeasurement, setEditingMeasurement] = useState<{ type: 'dimension' | 'edge'; id: string; currentValue: number } | null>(null);
  const [measurementInputValue, setMeasurementInputValue] = useState('');
  
  // Label-Positionen (Offset vom Polygon-Zentrum)
  const [labelOffsets, setLabelOffsets] = useState<{ [polygonId: string]: AreaPoint }>({});
  const [draggingLabel, setDraggingLabel] = useState<string | null>(null);
  
  // Polygon editing
  const [draggingPolygonPoint, setDraggingPolygonPoint] = useState<{ polygonId: string; pointIndex: number } | null>(null);
  const [draggingWholePolygon, setDraggingWholePolygon] = useState<{ polygonId: string; startPos: AreaPoint } | null>(null);
  const [addPointMode, setAddPointMode] = useState(false); // "Punkt auf Linie" Modus
  const [deletePointMode, setDeletePointMode] = useState(false); // "Punkt löschen" Modus
  
  // === ANNOTATION FEATURES (from PDF Editor) ===
  // Shape annotations
  interface AnnotationShape {
    id: string;
    type: 'rectangle' | 'circle' | 'arrow' | 'line';
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    color: string;
    strokeWidth: number;
  }
  const [annotationShapes, setAnnotationShapes] = useState<AnnotationShape[]>([]);
  const [currentAnnotationShape, setCurrentAnnotationShape] = useState<AnnotationShape | null>(null);
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null);
  const [draggingAnnotationShape, setDraggingAnnotationShape] = useState<{ id: string; startX: number; startY: number; origX1: number; origY1: number; origX2: number; origY2: number } | null>(null);
  const [resizingShape, setResizingShape] = useState<{ id: string; handle: 'x1y1' | 'x2y1' | 'x1y2' | 'x2y2' | 'start' | 'end' } | null>(null);
  
  // Text annotations
  interface TextAnnotation {
    id: string;
    text: string;
    x: number;
    y: number;
    color: string;
    fontSize: number;
  }
  const [textAnnotations, setTextAnnotations] = useState<TextAnnotation[]>([]);
  const [showTextModal, setShowTextModal] = useState(false);
  const [newTextInput, setNewTextInput] = useState('');
  const [textPosition, setTextPosition] = useState<AreaPoint>({ x: 0, y: 0 });
  const [selectedTextId, setSelectedTextId] = useState<string | null>(null);
  const [draggingText, setDraggingText] = useState<{ id: string; offset: AreaPoint; startPos: AreaPoint } | null>(null);
  
  // Memo pointer annotations
  interface MemoPointer {
    id: string;
    x1: number; // Note box position
    y1: number;
    x2: number; // Target point
    y2: number;
    text: string;
    color: string;
  }
  const [memoPointers, setMemoPointers] = useState<MemoPointer[]>([]);
  const [pendingMemoPointer, setPendingMemoPointer] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const [showMemoModal, setShowMemoModal] = useState(false);
  const [memoText, setMemoText] = useState('');
  const [selectedMemoId, setSelectedMemoId] = useState<string | null>(null);
  const [draggingMemo, setDraggingMemo] = useState<{ id: string; part: 'note' | 'target'; offset: AreaPoint; startPos: AreaPoint } | null>(null);
  const [showEditMemoModal, setShowEditMemoModal] = useState(false);
  const [editingMemoId, setEditingMemoId] = useState<string | null>(null);
  const [editMemoText, setEditMemoText] = useState('');
  
  // Annotation drawing color
  const [annotationColor, setAnnotationColor] = useState('#FF0000');
  const [annotationStrokeWidth, setAnnotationStrokeWidth] = useState(3);
  const [showShapesModal, setShowShapesModal] = useState(false);
  const [textFontSize, setTextFontSize] = useState(16); // For text annotation size
  const [showEditTextModal, setShowEditTextModal] = useState(false); // For editing existing text
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const [editTextInput, setEditTextInput] = useState('');
  const newTextInputRef = useRef<TextInput | null>(null);
  const editTextInputRef = useRef<TextInput | null>(null);
  const memoTextInputRef = useRef<TextInput | null>(null);
  const angleInputRef = useRef<TextInput | null>(null);
  const lengthInputRef = useRef<TextInput | null>(null);
  
  // State für Winkel-Modal Numpad
  const [showAngleNumpad, setShowAngleNumpad] = useState(false);
  const [angleNumpadTarget, setAngleNumpadTarget] = useState<'angle' | 'length'>('length');
  
  // Deduction rectangle drawing state
  const [deductionRectStart, setDeductionRectStart] = useState<AreaPoint | null>(null);
  const [deductionRectEnd, setDeductionRectEnd] = useState<AreaPoint | null>(null);
  
  // PDF Export state
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  
  // Drawing state
  const [mode, setMode] = useState<'select' | 'polygon' | 'deduction' | 'deduction_rect' | 'scale' | 'guideline' | 'parallel' | 'dimension' | 'annotation_rect' | 'annotation_circle' | 'annotation_arrow' | 'annotation_line' | 'annotation_text' | 'annotation_memo'>('select');
  const [currentPoints, setCurrentPoints] = useState<AreaPoint[]>([]);
  const [selectedPolygonId, setSelectedPolygonId] = useState<string | null>(null);
  const [selectedLineIndex, setSelectedLineIndex] = useState<{ polygonId: string; pointIndex: number } | null>(null);
  
  // Helper-Funktion: Wechselt den Modus und deaktiviert automatisch +Punkt/-Punkt Modi
  const selectMode = (newMode: typeof mode) => {
    setMode(newMode);
    // +Punkt und -Punkt Modi deaktivieren wenn anderes Werkzeug gewählt wird
    setAddPointMode(false);
    setDeletePointMode(false);
  };
  
  // Resizing deduction rectangles (keeping 90° corners)
  const [resizingDeductionRect, setResizingDeductionRect] = useState<{ polygonId: string; handle: 'nw' | 'ne' | 'sw' | 'se' } | null>(null);
  const deductionRectOriginal = useRef<{ minX: number; minY: number; maxX: number; maxY: number }>({ minX: 0, minY: 0, maxX: 0, maxY: 0 });
  
  // Scale reference
  const [scaleReference, setScaleReference] = useState<{
    startPoint: AreaPoint | null;
    endPoint: AreaPoint | null;
    realLength: number;
  }>({ startPoint: null, endPoint: null, realLength: 1 });
  
  // Modals
  const [showScaleModal, setShowScaleModal] = useState(false);
  const [showNameModal, setShowNameModal] = useState(false);
  const [showLineCategoryModal, setShowLineCategoryModal] = useState(false);
  const [showResultsModal, setShowResultsModal] = useState(false);
  const [showPolygonNameModal, setShowPolygonNameModal] = useState(false);
  const [showGridSizeModal, setShowGridSizeModal] = useState(false);
  const [showParallelModal, setShowParallelModal] = useState(false);
  const [parallelDistance, setParallelDistance] = useState('');
  const [scaleInputValue, setScaleInputValue] = useState('');
  const [polygonNameInput, setPolygonNameInput] = useState('');
  
  // Voreinstellungen Modals
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);
  const [showLineCategoryManager, setShowLineCategoryManager] = useState(false);
  const [showShortcutManager, setShowShortcutManager] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showCalculatorModal, setShowCalculatorModal] = useState(false);
  const [calculatorDisplay, setCalculatorDisplay] = useState('0');
  const [calculatorExpression, setCalculatorExpression] = useState('');
  const [calculatorPrevValue, setCalculatorPrevValue] = useState<number | null>(null);
  const [calculatorOperator, setCalculatorOperator] = useState<string | null>(null);
  const [calculatorWaitingForOperand, setCalculatorWaitingForOperand] = useState(false);
  const [editingCategory, setEditingCategory] = useState<LineCategory | null>(null);
  const [editingShortcut, setEditingShortcut] = useState<TextShortcut | null>(null);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryColor, setNewCategoryColor] = useState('#2196F3');
  const [newCategoryShortcut, setNewCategoryShortcut] = useState('');
  const [newShortcutCode, setNewShortcutCode] = useState('');
  const [newShortcutText, setNewShortcutText] = useState('');
  
  // Loading
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Canvas dimensions
  const canvasWidth = SCREEN_WIDTH;
  const canvasHeight = SCREEN_HEIGHT - 200;

  // Save state for undo
  const saveStateForUndo = () => {
    const currentState: HistoryState = {
      polygons: JSON.parse(JSON.stringify(polygons)),
      guideLines: JSON.parse(JSON.stringify(guideLines)),
      lines: JSON.parse(JSON.stringify(lines)),
      annotationShapes: JSON.parse(JSON.stringify(annotationShapes)),
      textAnnotations: JSON.parse(JSON.stringify(textAnnotations)),
      memoPointers: JSON.parse(JSON.stringify(memoPointers)),
      customEdgeLengths: JSON.parse(JSON.stringify(customEdgeLengths)),
    };
    setUndoStack(prev => [...prev.slice(-19), currentState]); // Keep last 20 states
    setRedoStack([]); // Clear redo stack when new action is performed
  };

  // Undo
  const undo = () => {
    if (undoStack.length === 0) return;
    
    // Save current state to redo stack
    const currentState: HistoryState = {
      polygons: JSON.parse(JSON.stringify(polygons)),
      guideLines: JSON.parse(JSON.stringify(guideLines)),
      lines: JSON.parse(JSON.stringify(lines)),
      annotationShapes: JSON.parse(JSON.stringify(annotationShapes)),
      textAnnotations: JSON.parse(JSON.stringify(textAnnotations)),
      memoPointers: JSON.parse(JSON.stringify(memoPointers)),
      customEdgeLengths: JSON.parse(JSON.stringify(customEdgeLengths)),
    };
    setRedoStack(prev => [...prev, currentState]);
    
    // Restore previous state
    const previousState = undoStack[undoStack.length - 1];
    setPolygons(previousState.polygons);
    setGuideLines(previousState.guideLines);
    setLines(previousState.lines);
    setAnnotationShapes(previousState.annotationShapes || []);
    setTextAnnotations(previousState.textAnnotations || []);
    setMemoPointers(previousState.memoPointers || []);
    setCustomEdgeLengths(previousState.customEdgeLengths || {});
    setUndoStack(prev => prev.slice(0, -1));
    
    // Clear selections
    setSelectedPolygonId(null);
    setSelectedGuideLineId(null);
    setSelectedAnnotationId(null);
    setSelectedTextId(null);
    setSelectedMemoId(null);
  };

  // Redo
  const redo = () => {
    if (redoStack.length === 0) return;
    
    // Save current state to undo stack
    const currentState: HistoryState = {
      polygons: JSON.parse(JSON.stringify(polygons)),
      guideLines: JSON.parse(JSON.stringify(guideLines)),
      lines: JSON.parse(JSON.stringify(lines)),
      annotationShapes: JSON.parse(JSON.stringify(annotationShapes)),
      textAnnotations: JSON.parse(JSON.stringify(textAnnotations)),
      memoPointers: JSON.parse(JSON.stringify(memoPointers)),
      customEdgeLengths: JSON.parse(JSON.stringify(customEdgeLengths)),
    };
    setUndoStack(prev => [...prev, currentState]);
    
    // Restore next state
    const nextState = redoStack[redoStack.length - 1];
    setPolygons(nextState.polygons);
    setGuideLines(nextState.guideLines);
    setLines(nextState.lines);
    setAnnotationShapes(nextState.annotationShapes || []);
    setTextAnnotations(nextState.textAnnotations || []);
    setMemoPointers(nextState.memoPointers || []);
    setCustomEdgeLengths(nextState.customEdgeLengths || {});
    setRedoStack(prev => prev.slice(0, -1));
    
    // Clear selections
    setSelectedPolygonId(null);
    setSelectedGuideLineId(null);
    setSelectedAnnotationId(null);
    setSelectedTextId(null);
    setSelectedMemoId(null);
  };

  // Load data
  useEffect(() => {
    loadLineCategories();
    loadTextShortcuts();
    if (calculationId) {
      loadCalculation();
    }
  }, [calculationId]);

  const loadLineCategories = async () => {
    const categories = await LineCategoryService.getAll();
    setLineCategories(categories);
  };

  const loadTextShortcuts = async () => {
    const shortcuts = await TextShortcutService.getAll();
    setTextShortcuts(shortcuts);
  };

  // Hilfsfunktion: Prüfen ob Text ein Kürzel ist und formatierte Version zurückgeben
  const resolveShortcut = (text: string): { isShortcut: boolean; display: string; shortcut?: TextShortcut } => {
    const upperText = text.toUpperCase().trim();
    const found = textShortcuts.find(s => s.shortcut.toUpperCase() === upperText);
    if (found) {
      return { isShortcut: true, display: `(${found.shortcut}) ${found.fullText}`, shortcut: found };
    }
    return { isShortcut: false, display: text };
  };

  // Hilfsfunktion: Kategorie-Name mit Kürzel formatieren -> "(TR) Traufe"
  const formatCategoryWithShortcut = (categoryName: string): string => {
    const category = lineCategories.find(c => c.name === categoryName);
    if (category?.shortcut) {
      return `(${category.shortcut}) ${categoryName}`;
    }
    return categoryName;
  };

  const loadCalculation = async () => {
    if (!calculationId) return;
    setLoading(true);
    try {
      const calc = await AreaCalculationService.getById(calculationId);
      if (calc) {
        setName(calc.name);
        setScale(calc.scale);
        setPolygons(calc.polygons || []);
        setLines(calc.lines || []);
        setGridEnabled(calc.gridEnabled);
        setGridSize(calc.gridSize);
        // Set projectId from calculation if not from params
        if (calc.project_id) {
          setProjectId(calc.project_id);
        }
        if (calc.scaleReference) {
          setScaleReference({
            startPoint: calc.scaleReference.startPoint,
            endPoint: calc.scaleReference.endPoint,
            realLength: calc.scaleReference.realLength,
          });
        }
        // Load background/reference image if saved
        if (calc.backgroundImage && typeof calc.backgroundImage === 'string' && calc.backgroundImage.length > 0) {
          // Defer setting the background image to avoid render issues
          setTimeout(() => {
            setBackgroundImage(calc.backgroundImage);
          }, 100);
        }
        // Load annotations (shapes, texts, memos) with safety checks
        if (calc.annotations) {
          try {
            if (calc.annotations.shapes && Array.isArray(calc.annotations.shapes) && calc.annotations.shapes.length > 0) {
              const loadedShapes = calc.annotations.shapes
                .filter((s: any) => s && s.startPoint && s.endPoint)
                .map((s: any) => ({
                  id: s.id || `shape_${Date.now()}_${Math.random()}`,
                  type: s.type || 'rectangle',
                  x1: s.startPoint?.x ?? 0,
                  y1: s.startPoint?.y ?? 0,
                  x2: s.endPoint?.x ?? 0,
                  y2: s.endPoint?.y ?? 0,
                  color: s.color || '#FF0000',
                  strokeWidth: s.strokeWidth || 2,
                }));
              if (loadedShapes.length > 0) {
                setAnnotationShapes(loadedShapes);
              }
            }
            if (calc.annotations.texts && Array.isArray(calc.annotations.texts) && calc.annotations.texts.length > 0) {
              const validTexts = calc.annotations.texts
                .filter((t: any) => t && typeof t.x === 'number' && typeof t.y === 'number' && t.text)
                .map((t: any) => ({
                  id: t.id || `text_${Date.now()}_${Math.random()}`,
                  x: t.x,
                  y: t.y,
                  text: t.text,
                  color: t.color || '#333333',
                  fontSize: t.fontSize || 16,
                }));
              if (validTexts.length > 0) {
                setTextAnnotations(validTexts);
              }
            }
            if (calc.annotations.memos && Array.isArray(calc.annotations.memos) && calc.annotations.memos.length > 0) {
              const validMemos = calc.annotations.memos
                .filter((m: any) => m && typeof m.x1 === 'number' && typeof m.x2 === 'number')
                .map((m: any) => ({
                  id: m.id || `memo_${Date.now()}_${Math.random()}`,
                  x1: m.x1,
                  y1: m.y1,
                  x2: m.x2,
                  y2: m.y2,
                  text: m.text || '',
                  color: m.color || '#FF9800',
                }));
              if (validMemos.length > 0) {
                setMemoPointers(validMemos);
              }
            }
          } catch (annotationError) {
            console.error('Error loading annotations:', annotationError);
            // Continue without annotations if there's an error
          }
        }
      }
    } catch (error) {
      console.error('Error loading calculation:', error);
    } finally {
      setLoading(false);
    }
  };

  // Calculate polygon area using Shoelace formula
  const calculatePolygonArea = (points: AreaPoint[]): number => {
    if (points.length < 3) return 0;
    
    let area = 0;
    const n = points.length;
    
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      area += points[i].x * points[j].y;
      area -= points[j].x * points[i].y;
    }
    
    area = Math.abs(area) / 2;
    
    // Convert from pixels² to m²
    const metersPerPixel = 1 / scale;
    return area * metersPerPixel * metersPerPixel;
  };

  // Calculate line length
  const calculateLineLength = (p1: AreaPoint, p2: AreaPoint): number => {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const pixelLength = Math.sqrt(dx * dx + dy * dy);
    return pixelLength / scale; // Convert to meters
  };

  // Calculate interior angle between three points (in degrees)
  const calculateAngle = (p1: AreaPoint, vertex: AreaPoint, p2: AreaPoint): number => {
    const v1 = { x: p1.x - vertex.x, y: p1.y - vertex.y };
    const v2 = { x: p2.x - vertex.x, y: p2.y - vertex.y };
    
    const dot = v1.x * v2.x + v1.y * v2.y;
    const cross = v1.x * v2.y - v1.y * v2.x;
    
    let angle = Math.atan2(Math.abs(cross), dot) * (180 / Math.PI);
    
    // Convert to interior angle: if angle > 180, use 360 - angle
    // This ensures we always show the interior angle of the polygon
    if (angle > 180) {
      angle = 360 - angle;
    }
    
    return angle;
  };

  // Calculate results
  const calculateResults = () => {
    const mainPolygons = polygons.filter(p => p.type === 'main');
    const deductionPolygons = polygons.filter(p => p.type === 'deduction');
    
    // Calculate areas using manual calculation if enabled
    let totalArea = 0;
    let totalDeductions = 0;
    
    for (const mainPoly of mainPolygons) {
      const result = calculateNetAreaForPolygon(mainPoly);
      totalArea += result.grossArea;
      totalDeductions += result.deductions;
    }
    
    const netArea = totalArea - totalDeductions;
    
    // Calculate lines by category (with deduction interruptions)
    const linesByCategory: { [category: string]: number } = {};
    lines.forEach(line => {
      const polygon = polygons.find(p => p.id === line.polygonId);
      if (polygon && polygon.type === 'main') {
        // Get line segments after deduction interruptions
        const segments = calculateLineSegmentsWithDeductions(polygon, line.pointIndex);
        
        // Sum up lengths of non-interrupted segments
        // Use custom lengths if available
        let totalLength = 0;
        const edgeKey = `${polygon.id}-${line.pointIndex}`;
        if (customEdgeLengths[edgeKey] !== undefined) {
          // Use custom length
          totalLength = customEdgeLengths[edgeKey];
        } else {
          totalLength = segments
            .filter(s => !s.isInterrupted)
            .reduce((sum, s) => sum + calculateLineLength(s.start, s.end), 0);
        }
        
        if (!linesByCategory[line.category]) {
          linesByCategory[line.category] = 0;
        }
        linesByCategory[line.category] += totalLength;
      } else if (polygon) {
        // For deduction polygons, calculate full line length
        const p1 = polygon.points[line.pointIndex];
        const p2 = polygon.points[(line.pointIndex + 1) % polygon.points.length];
        const length = calculateLineLength(p1, p2);
        
        if (!linesByCategory[line.category]) {
          linesByCategory[line.category] = 0;
        }
        linesByCategory[line.category] += length;
      }
    });
    
    return { totalArea, deductionArea: totalDeductions, netArea, linesByCategory };
  };

  // Check if a polygon (deduction) is inside another polygon (main area)
  const isPolygonInsidePolygon = (innerPolygon: AreaPolygon, outerPolygon: AreaPolygon): boolean => {
    // Check if the center of the inner polygon is inside the outer polygon
    const centerX = innerPolygon.points.reduce((sum, p) => sum + p.x, 0) / innerPolygon.points.length;
    const centerY = innerPolygon.points.reduce((sum, p) => sum + p.y, 0) / innerPolygon.points.length;
    return isPointInPolygon({ x: centerX, y: centerY }, outerPolygon.points);
  };

  // Sutherland-Hodgman polygon clipping algorithm
  // Clips 'subjectPolygon' to 'clipPolygon' and returns the intersection
  // Ensure polygon points are in counter-clockwise order
  const ensureCounterClockwise = (points: AreaPoint[]): AreaPoint[] => {
    // Calculate signed area (positive = counter-clockwise, negative = clockwise)
    let signedArea = 0;
    for (let i = 0; i < points.length; i++) {
      const j = (i + 1) % points.length;
      signedArea += points[i].x * points[j].y;
      signedArea -= points[j].x * points[i].y;
    }
    // If clockwise (negative), reverse the order
    if (signedArea < 0) {
      return [...points].reverse();
    }
    return points;
  };

  // Check if a polygon is a rectangle (4 points forming 90° angles)
  const isPolygonRectangle = (polygon: AreaPolygon): boolean => {
    if (polygon.points.length !== 4) return false;
    // A rectangle has all right angles - check by verifying dot products are ~0
    // Also check if sides are axis-aligned or at least perpendicular
    const pts = polygon.points;
    for (let i = 0; i < 4; i++) {
      const p1 = pts[i];
      const p2 = pts[(i + 1) % 4];
      const p3 = pts[(i + 2) % 4];
      // Vectors from p2 to p1 and p2 to p3
      const v1 = { x: p1.x - p2.x, y: p1.y - p2.y };
      const v2 = { x: p3.x - p2.x, y: p3.y - p2.y };
      // Dot product should be ~0 for 90° angle
      const dot = v1.x * v2.x + v1.y * v2.y;
      if (Math.abs(dot) > 10) return false; // Allow small tolerance
    }
    return true;
  };

  // Get bounding box of a rectangle polygon
  const getRectangleBounds = (polygon: AreaPolygon): { minX: number; minY: number; maxX: number; maxY: number } => {
    const xs = polygon.points.map(p => p.x);
    const ys = polygon.points.map(p => p.y);
    return {
      minX: Math.min(...xs),
      minY: Math.min(...ys),
      maxX: Math.max(...xs),
      maxY: Math.max(...ys),
    };
  };

  // Update rectangle polygon points from bounds (keeping 90° corners)
  const updateRectangleFromBounds = (polygonId: string, bounds: { minX: number; minY: number; maxX: number; maxY: number }) => {
    setPolygons(prev => prev.map(p => {
      if (p.id !== polygonId) return p;
      return {
        ...p,
        points: [
          { x: bounds.minX, y: bounds.minY }, // Top-left
          { x: bounds.maxX, y: bounds.minY }, // Top-right
          { x: bounds.maxX, y: bounds.maxY }, // Bottom-right
          { x: bounds.minX, y: bounds.maxY }, // Bottom-left
        ],
      };
    }));
  };

  // Sutherland-Hodgman polygon clipping algorithm
  const clipPolygonToPolygon = (subjectPoints: AreaPoint[], clipPoints: AreaPoint[]): AreaPoint[] => {
    // Ensure both polygons are counter-clockwise
    const subject = ensureCounterClockwise(subjectPoints);
    const clip = ensureCounterClockwise(clipPoints);
    
    let outputList = [...subject];
    
    for (let i = 0; i < clip.length; i++) {
      if (outputList.length === 0) return [];
      
      const clipEdgeStart = clip[i];
      const clipEdgeEnd = clip[(i + 1) % clip.length];
      
      const inputList = [...outputList];
      outputList = [];
      
      for (let j = 0; j < inputList.length; j++) {
        const current = inputList[j];
        const previous = inputList[(j + inputList.length - 1) % inputList.length];
        
        const currentInside = isPointOnLeftSide(current, clipEdgeStart, clipEdgeEnd);
        const previousInside = isPointOnLeftSide(previous, clipEdgeStart, clipEdgeEnd);
        
        if (currentInside) {
          if (!previousInside) {
            const intersection = lineIntersection(previous, current, clipEdgeStart, clipEdgeEnd);
            if (intersection) outputList.push(intersection);
          }
          outputList.push(current);
        } else if (previousInside) {
          const intersection = lineIntersection(previous, current, clipEdgeStart, clipEdgeEnd);
          if (intersection) outputList.push(intersection);
        }
      }
    }
    
    return outputList;
  };

  // Check if point is on the left side of a directed edge (inside for counter-clockwise polygon)
  const isPointOnLeftSide = (point: AreaPoint, edgeStart: AreaPoint, edgeEnd: AreaPoint): boolean => {
    return ((edgeEnd.x - edgeStart.x) * (point.y - edgeStart.y) - 
            (edgeEnd.y - edgeStart.y) * (point.x - edgeStart.x)) >= 0;
  };

  // Find intersection point of two lines
  const lineIntersection = (p1: AreaPoint, p2: AreaPoint, p3: AreaPoint, p4: AreaPoint): AreaPoint | null => {
    const x1 = p1.x, y1 = p1.y, x2 = p2.x, y2 = p2.y;
    const x3 = p3.x, y3 = p3.y, x4 = p4.x, y4 = p4.y;
    
    const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
    if (Math.abs(denom) < 0.0001) return null;
    
    const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
    
    return {
      x: x1 + t * (x2 - x1),
      y: y1 + t * (y2 - y1)
    };
  };

  // Calculate the intersection area between a deduction and a main polygon
  const calculateIntersectionArea = (deductionPolygon: AreaPolygon, mainPolygon: AreaPolygon): number => {
    const clippedPoints = clipPolygonToPolygon(deductionPolygon.points, mainPolygon.points);
    if (clippedPoints.length < 3) return 0;
    return calculatePolygonArea(clippedPoints);
  };

  // Calculate net area for a main polygon (gross area minus ACTUAL overlap with deductions)
  const calculateNetAreaForPolygon = (mainPolygon: AreaPolygon): { grossArea: number; deductions: number; netArea: number; isManual: boolean } => {
    let grossArea: number;
    let isManual = false;
    
    // Check if we should use manual calculation
    if (useManualAreaCalc) {
      const manualResult = calculateManualAreaForPolygon(mainPolygon);
      if (manualResult.hasManualValues) {
        grossArea = manualResult.area;
        isManual = true;
      } else {
        grossArea = calculatePolygonArea(mainPolygon.points);
      }
    } else {
      grossArea = calculatePolygonArea(mainPolygon.points);
    }
    
    // Find all deduction polygons and calculate their actual intersection with this main polygon
    const deductionPolygons = polygons.filter(p => p.type === 'deduction');
    
    let totalDeductions = 0;
    for (const deduction of deductionPolygons) {
      // Check if this deduction has manual values
      if (useManualAreaCalc) {
        const deductionManualResult = calculateManualAreaForPolygon(deduction);
        if (deductionManualResult.hasManualValues) {
          // Use the manual area for this deduction (scaled by intersection ratio)
          const autoDeductionArea = calculatePolygonArea(deduction.points);
          const intersectionArea = calculateIntersectionArea(deduction, mainPolygon);
          // Calculate what percentage of the deduction intersects with main polygon
          const intersectionRatio = autoDeductionArea > 0 ? intersectionArea / autoDeductionArea : 0;
          // Apply that ratio to the manual deduction area
          totalDeductions += deductionManualResult.area * intersectionRatio;
          isManual = true;
        } else if (isManual) {
          // Main polygon is manual, but deduction is not - scale deduction proportionally
          const mainAutoArea = calculatePolygonArea(mainPolygon.points);
          const scaleFactor = mainAutoArea > 0 ? grossArea / mainAutoArea : 1;
          const intersectionArea = calculateIntersectionArea(deduction, mainPolygon);
          totalDeductions += intersectionArea * scaleFactor;
        } else {
          const intersectionArea = calculateIntersectionArea(deduction, mainPolygon);
          totalDeductions += intersectionArea;
        }
      } else {
        const intersectionArea = calculateIntersectionArea(deduction, mainPolygon);
        totalDeductions += intersectionArea;
      }
    }
    
    const netArea = grossArea - totalDeductions;
    
    return { grossArea, deductions: totalDeductions, netArea, isManual };
  };

  // Calculate area for polygon using manual edge lengths
  // Uses proportional scaling: if manual lengths are X% different from actual, scale area by X²
  const calculateManualAreaForPolygon = (polygon: AreaPolygon): { area: number; hasManualValues: boolean; scaleFactor: number } => {
    const points = polygon.points;
    if (points.length < 3) return { area: 0, hasManualValues: false, scaleFactor: 1 };
    
    // Check if any edges have custom lengths
    let hasManualValues = false;
    let totalActualLength = 0;
    let totalManualLength = 0;
    let edgesWithManualLength = 0;
    
    for (let i = 0; i < points.length; i++) {
      const p1 = points[i];
      const p2 = points[(i + 1) % points.length];
      const actualLength = calculateLineLength(p1, p2);
      const edgeKey = `${polygon.id}-${i}`;
      
      totalActualLength += actualLength;
      
      if (customEdgeLengths[edgeKey] !== undefined) {
        hasManualValues = true;
        totalManualLength += customEdgeLengths[edgeKey];
        edgesWithManualLength++;
      } else {
        totalManualLength += actualLength;
      }
    }
    
    if (!hasManualValues) {
      return { area: calculatePolygonArea(points), hasManualValues: false, scaleFactor: 1 };
    }
    
    // Calculate scale factor based on perimeter ratio
    // Area scales with the square of linear dimensions
    const perimeterRatio = totalManualLength / totalActualLength;
    const areaScaleFactor = perimeterRatio * perimeterRatio;
    
    // Apply scale factor to the automatically calculated area
    const autoArea = calculatePolygonArea(points);
    const manualArea = autoArea * areaScaleFactor;
    
    return { area: manualArea, hasManualValues: true, scaleFactor: areaScaleFactor };
  };

  // Check if a polygon has any manual edge lengths
  const polygonHasManualLengths = (polygonId: string, pointsLength: number): boolean => {
    for (let i = 0; i < pointsLength; i++) {
      const edgeKey = `${polygonId}-${i}`;
      if (customEdgeLengths[edgeKey] !== undefined) {
        return true;
      }
    }
    return false;
  };

  // Save calculation
  const saveCalculation = async (showAlert: boolean = true) => {
    if (!projectId) {
      if (showAlert) {
        Alert.alert('Fehler', 'Kein Projekt zugeordnet');
      }
      return false;
    }
    
    setSaving(true);
    try {
      const results = calculateResults();
      
      // Prepare annotations for saving - with validation
      const annotations = {
        shapes: annotationShapes
          .filter(s => s && typeof s.x1 === 'number' && typeof s.y1 === 'number' && typeof s.x2 === 'number' && typeof s.y2 === 'number')
          .map(s => ({
            id: s.id,
            type: s.type,
            startPoint: { x: s.x1, y: s.y1 },
            endPoint: { x: s.x2, y: s.y2 },
            color: s.color || '#FF0000',
            strokeWidth: s.strokeWidth || 2,
          })),
        texts: textAnnotations
          .filter(t => t && typeof t.x === 'number' && typeof t.y === 'number' && t.text)
          .map(t => ({
            id: t.id,
            x: t.x,
            y: t.y,
            text: t.text,
            color: t.color || '#333333',
            fontSize: t.fontSize || 16,
          })),
        memos: memoPointers
          .filter(m => m && typeof m.x1 === 'number' && typeof m.x2 === 'number')
          .map(m => ({
            id: m.id,
            x1: m.x1,
            y1: m.y1,
            x2: m.x2,
            y2: m.y2,
            text: m.text || '',
            color: m.color || '#FF9800',
          })),
      };
      
      const data = {
        project_id: projectId,
        name,
        scale,
        scaleReference: scaleReference.startPoint && scaleReference.endPoint ? {
          startPoint: scaleReference.startPoint,
          endPoint: scaleReference.endPoint,
          realLength: scaleReference.realLength,
        } : undefined,
        polygons,
        lines,
        gridEnabled,
        gridSize,
        results,
        backgroundImage: backgroundImage || undefined,
        annotations: (annotations.shapes.length > 0 || annotations.texts.length > 0 || annotations.memos.length > 0) ? annotations : undefined,
      };
      
      if (calculationId) {
        await AreaCalculationService.update(calculationId, data);
      } else {
        await AreaCalculationService.create(data);
      }
      
      if (showAlert) {
        if (Platform.OS === 'web') {
          alert('Berechnung gespeichert');
        } else {
          Alert.alert('Erfolg', 'Berechnung wurde gespeichert');
        }
      }
      
      return true;
    } catch (error) {
      console.error('Error saving calculation:', error);
      if (showAlert) {
        if (Platform.OS === 'web') {
          alert('Fehler beim Speichern');
        } else {
          Alert.alert('Fehler', 'Berechnung konnte nicht gespeichert werden');
        }
      }
      return false;
    } finally {
      setSaving(false);
    }
  };

  // Auto-save and go back
  const handleBackWithSave = async () => {
    // Only auto-save if there's something to save (polygons exist or it's an existing calculation)
    if (polygons.length > 0 || calculationId) {
      await saveCalculation(false); // Save silently without alert
    }
    router.back();
  };

  // Calculate intersections of guide lines
  const calculateGuideLineIntersections = (): AreaPoint[] => {
    const intersections: AreaPoint[] = [];
    
    for (let i = 0; i < guideLines.length; i++) {
      for (let j = i + 1; j < guideLines.length; j++) {
        const intersection = getLineIntersection(
          guideLines[i].start, guideLines[i].end,
          guideLines[j].start, guideLines[j].end
        );
        if (intersection) {
          // Check if intersection is within canvas bounds
          if (intersection.x >= 0 && intersection.x <= canvasWidth &&
              intersection.y >= 0 && intersection.y <= canvasHeight) {
            intersections.push(intersection);
          }
        }
      }
    }
    
    return intersections;
  };

  // Get line intersection point
  const getLineIntersection = (
    p1: AreaPoint, p2: AreaPoint,
    p3: AreaPoint, p4: AreaPoint
  ): AreaPoint | null => {
    const x1 = p1.x, y1 = p1.y, x2 = p2.x, y2 = p2.y;
    const x3 = p3.x, y3 = p3.y, x4 = p4.x, y4 = p4.y;
    
    const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
    if (Math.abs(denom) < 0.0001) return null; // Lines are parallel
    
    const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
    
    return {
      x: x1 + t * (x2 - x1),
      y: y1 + t * (y2 - y1)
    };
  };

  // Snap to nearest point (grid, guide line intersections, guide line points)
  const snapToNearestPoint = (x: number, y: number, excludePolygonId?: string): { point: AreaPoint; snapped: boolean } => {
    const snapTolerance = 30; // Increased for better touch experience
    let bestPoint = { x, y };
    let bestDistance = Infinity;
    
    // 1. HIGHEST PRIORITY: Snap to existing polygon points (corners)
    for (const polygon of polygons) {
      // Skip the polygon being moved
      if (excludePolygonId && polygon.id === excludePolygonId) continue;
      
      for (const point of polygon.points) {
        const dist = Math.sqrt(Math.pow(x - point.x, 2) + Math.pow(y - point.y, 2));
        if (dist < snapTolerance && dist < bestDistance) {
          bestDistance = dist;
          bestPoint = { x: point.x, y: point.y };
        }
      }
    }
    
    // 2. Check guide line intersections
    if (guideLinesVisible && guideLines.length > 0) {
      const intersections = calculateGuideLineIntersections();
      for (const intersection of intersections) {
        const dist = Math.sqrt(Math.pow(x - intersection.x, 2) + Math.pow(y - intersection.y, 2));
        if (dist < snapTolerance && dist < bestDistance) {
          bestDistance = dist;
          bestPoint = intersection;
        }
      }
      
      // 3. Check guide line endpoints
      for (const guide of guideLines) {
        for (const point of [guide.start, guide.end]) {
          const dist = Math.sqrt(Math.pow(x - point.x, 2) + Math.pow(y - point.y, 2));
          if (dist < snapTolerance && dist < bestDistance) {
            bestDistance = dist;
            bestPoint = point;
          }
        }
      }
    }
    
    // 4. Snap to polygon edges (line segments) - useful for aligning
    // Only if no corner point was found
    if (bestDistance > snapTolerance / 2) {
      for (const polygon of polygons) {
        // Skip the polygon being moved
        if (excludePolygonId && polygon.id === excludePolygonId) continue;
        
        for (let i = 0; i < polygon.points.length; i++) {
          const p1 = polygon.points[i];
          const p2 = polygon.points[(i + 1) % polygon.points.length];
          
          // Find closest point on this edge
          const dx = p2.x - p1.x;
          const dy = p2.y - p1.y;
          const lengthSq = dx * dx + dy * dy;
          
          if (lengthSq > 0) {
            let t = ((x - p1.x) * dx + (y - p1.y) * dy) / lengthSq;
            t = Math.max(0, Math.min(1, t));
            
            const closestX = p1.x + t * dx;
            const closestY = p1.y + t * dy;
            const dist = Math.sqrt(Math.pow(x - closestX, 2) + Math.pow(y - closestY, 2));
            
            if (dist < snapTolerance && dist < bestDistance) {
              bestDistance = dist;
              bestPoint = { x: closestX, y: closestY };
            }
          }
        }
      }
    }
    
    // Check if we found a snap point
    const snapped = bestDistance < snapTolerance;
    
    // 5. Snap to grid if enabled and no better snap point found
    if (gridEnabled && !snapped) {
      bestPoint = {
        x: Math.round(x / (gridSize * scale)) * (gridSize * scale),
        y: Math.round(y / (gridSize * scale)) * (gridSize * scale)
      };
    }
    
    return { point: bestPoint, snapped };
  };

  // Create parallel guide line
  const createParallelGuideLine = (sourceId: string, distance: number) => {
    const source = guideLines.find(g => g.id === sourceId);
    if (!source) return;
    
    saveStateForUndo();
    
    // Calculate perpendicular direction
    const dx = source.end.x - source.start.x;
    const dy = source.end.y - source.start.y;
    const length = Math.sqrt(dx * dx + dy * dy);
    
    // Normalize and get perpendicular
    const perpX = -dy / length;
    const perpY = dx / length;
    
    // Convert distance from meters to pixels
    const pixelDistance = distance * scale;
    
    // Create offset points
    const newStart = {
      x: source.start.x + perpX * pixelDistance,
      y: source.start.y + perpY * pixelDistance
    };
    const newEnd = {
      x: source.end.x + perpX * pixelDistance,
      y: source.end.y + perpY * pixelDistance
    };
    
    const newGuideLine = {
      id: Date.now().toString(),
      start: newStart,
      end: newEnd,
      isParallel: true,
      parentId: sourceId
    };
    
    setGuideLines([...guideLines, newGuideLine]);
  };

  // Delete guide line
  const deleteGuideLine = (id: string) => {
    saveStateForUndo();
    setGuideLines(guideLines.filter(g => g.id !== id && g.parentId !== id));
    setSelectedGuideLineId(null);
  };

  // Delete all guide lines
  const deleteAllGuideLines = () => {
    saveStateForUndo();
    setGuideLines([]);
    setSelectedGuideLineId(null);
  };

  // Delete dimension line
  const deleteDimensionLine = (id: string) => {
    saveStateForUndo();
    setDimensionLines(dimensionLines.filter(d => d.id !== id));
    setSelectedDimensionId(null);
  };

  // Find dimension line point at position
  const findDimensionLinePointAtPosition = (x: number, y: number): { dimId: string; point: 'start' | 'end' | 'middle' } | null => {
    // Adjust tolerance based on zoom level - larger tolerance when zoomed out
    const baseTolerance = 20;
    const tolerance = baseTolerance / zoomLevel;
    
    for (const dim of dimensionLines) {
      // Check start point
      const startDist = Math.sqrt(Math.pow(x - dim.start.x, 2) + Math.pow(y - dim.start.y, 2));
      if (startDist < tolerance) {
        return { dimId: dim.id, point: 'start' };
      }
      
      // Check end point
      const endDist = Math.sqrt(Math.pow(x - dim.end.x, 2) + Math.pow(y - dim.end.y, 2));
      if (endDist < tolerance) {
        return { dimId: dim.id, point: 'end' };
      }
      
      // Check middle point
      const midX = (dim.start.x + dim.end.x) / 2;
      const midY = (dim.start.y + dim.end.y) / 2;
      const midDist = Math.sqrt(Math.pow(x - midX, 2) + Math.pow(y - midY, 2));
      if (midDist < tolerance) {
        return { dimId: dim.id, point: 'middle' };
      }
    }
    return null;
  };

  // Find dimension line at point (for selection)
  const findDimensionLineAtPoint = (x: number, y: number): { id: string } | null => {
    // Adjust tolerance based on zoom level
    const baseTolerance = 15;
    const tolerance = baseTolerance / zoomLevel;
    
    for (const dim of dimensionLines) {
      const dist = pointToLineDistance({ x, y }, dim.start, dim.end);
      if (dist < tolerance) {
        return { id: dim.id };
      }
    }
    return null;
  };

  // Update dimension line point position
  const updateDimensionLinePoint = (dimId: string, point: 'start' | 'end' | 'middle', newPos: AreaPoint) => {
    setDimensionLines(dimensionLines.map(d => {
      if (d.id !== dimId) return d;
      
      if (point === 'start') {
        return { ...d, start: newPos };
      } else if (point === 'end') {
        return { ...d, end: newPos };
      } else {
        // Move middle - move entire line
        const dx = newPos.x - (d.start.x + d.end.x) / 2;
        const dy = newPos.y - (d.start.y + d.end.y) / 2;
        return {
          ...d,
          start: { x: d.start.x + dx, y: d.start.y + dy },
          end: { x: d.end.x + dx, y: d.end.y + dy }
        };
      }
    }));
  };

  // Update dimension line custom length
  const updateDimensionLineLength = (dimId: string, newLength: number) => {
    setDimensionLines(dimensionLines.map(d => 
      d.id === dimId ? { ...d, customLength: newLength } : d
    ));
  };

  // Duplicate guide line
  const duplicateGuideLine = (id: string) => {
    const source = guideLines.find(g => g.id === id);
    if (!source) return;
    
    saveStateForUndo();
    // Offset by 20 pixels
    const newGuideLine: GuideLine = {
      id: Date.now().toString(),
      start: { x: source.start.x + 20, y: source.start.y + 20 },
      end: { x: source.end.x + 20, y: source.end.y + 20 },
    };
    setGuideLines([...guideLines, newGuideLine]);
  };

  // Extend guide line to canvas edges
  const extendGuideLineToEdges = (id: string) => {
    const guide = guideLines.find(g => g.id === id);
    if (!guide) return;
    
    const dx = guide.end.x - guide.start.x;
    const dy = guide.end.y - guide.start.y;
    
    if (dx === 0 && dy === 0) return;
    
    saveStateForUndo();
    
    // Calculate line equation: y = mx + b or x = constant for vertical
    let newStart: AreaPoint;
    let newEnd: AreaPoint;
    
    if (Math.abs(dx) < 0.001) {
      // Vertical line
      newStart = { x: guide.start.x, y: 0 };
      newEnd = { x: guide.start.x, y: canvasHeight };
    } else if (Math.abs(dy) < 0.001) {
      // Horizontal line
      newStart = { x: 0, y: guide.start.y };
      newEnd = { x: canvasWidth, y: guide.start.y };
    } else {
      // Diagonal line
      const m = dy / dx;
      const b = guide.start.y - m * guide.start.x;
      
      // Find intersections with canvas edges
      const intersections: AreaPoint[] = [];
      
      // Left edge (x = 0)
      const yLeft = b;
      if (yLeft >= 0 && yLeft <= canvasHeight) {
        intersections.push({ x: 0, y: yLeft });
      }
      
      // Right edge (x = canvasWidth)
      const yRight = m * canvasWidth + b;
      if (yRight >= 0 && yRight <= canvasHeight) {
        intersections.push({ x: canvasWidth, y: yRight });
      }
      
      // Top edge (y = 0)
      const xTop = -b / m;
      if (xTop >= 0 && xTop <= canvasWidth) {
        intersections.push({ x: xTop, y: 0 });
      }
      
      // Bottom edge (y = canvasHeight)
      const xBottom = (canvasHeight - b) / m;
      if (xBottom >= 0 && xBottom <= canvasWidth) {
        intersections.push({ x: xBottom, y: canvasHeight });
      }
      
      if (intersections.length >= 2) {
        newStart = intersections[0];
        newEnd = intersections[1];
      } else {
        return;
      }
    }
    
    setGuideLines(guideLines.map(g => 
      g.id === id ? { ...g, start: newStart, end: newEnd } : g
    ));
  };

  // Snap angle to 0°, 45°, 90° etc.
  const snapAngle = (start: AreaPoint, end: AreaPoint): AreaPoint => {
    if (!snapToAngles) return end;
    
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length = Math.sqrt(dx * dx + dy * dy);
    
    if (length < 10) return end;
    
    // Calculate current angle
    let angle = Math.atan2(dy, dx) * (180 / Math.PI);
    
    // Snap to nearest 45°
    const snapAngles = [0, 45, 90, 135, 180, -45, -90, -135, -180];
    let nearestAngle = snapAngles[0];
    let minDiff = Math.abs(angle - snapAngles[0]);
    
    for (const sa of snapAngles) {
      const diff = Math.abs(angle - sa);
      if (diff < minDiff) {
        minDiff = diff;
        nearestAngle = sa;
      }
    }
    
    // Only snap if within 15 degrees (increased from 5)
    if (minDiff > 15) return end;
    
    const radians = nearestAngle * (Math.PI / 180);
    return {
      x: start.x + length * Math.cos(radians),
      y: start.y + length * Math.sin(radians)
    };
  };

  // Update guide line point (for dragging)
  const updateGuideLinePoint = (guideId: string, point: 'start' | 'end' | 'middle', newPos: AreaPoint) => {
    setGuideLines(guideLines.map(g => {
      if (g.id !== guideId) return g;
      
      if (point === 'start') {
        const snappedPos = snapToAngles ? snapAngle(g.end, newPos) : newPos;
        return { ...g, start: snappedPos };
      } else if (point === 'end') {
        const snappedPos = snapToAngles ? snapAngle(g.start, newPos) : newPos;
        return { ...g, end: snappedPos };
      } else {
        // Move entire line (middle)
        const dx = newPos.x - (g.start.x + g.end.x) / 2;
        const dy = newPos.y - (g.start.y + g.end.y) / 2;
        return {
          ...g,
          start: { x: g.start.x + dx, y: g.start.y + dy },
          end: { x: g.end.x + dx, y: g.end.y + dy }
        };
      }
    }));
  };

  // Check if point is near guide line endpoint
  const findGuideLinePointAtPosition = (x: number, y: number): { guideId: string; point: 'start' | 'end' | 'middle' } | null => {
    // Adjust tolerance based on zoom level
    const baseTolerance = 20;
    const tolerance = baseTolerance / zoomLevel;
    
    for (const guide of guideLines) {
      // Check start point
      const distStart = Math.sqrt(Math.pow(x - guide.start.x, 2) + Math.pow(y - guide.start.y, 2));
      if (distStart < tolerance) {
        return { guideId: guide.id, point: 'start' };
      }
      
      // Check end point
      const distEnd = Math.sqrt(Math.pow(x - guide.end.x, 2) + Math.pow(y - guide.end.y, 2));
      if (distEnd < tolerance) {
        return { guideId: guide.id, point: 'end' };
      }
      
      // Check middle (for moving entire line)
      const midX = (guide.start.x + guide.end.x) / 2;
      const midY = (guide.start.y + guide.end.y) / 2;
      const distMid = Math.sqrt(Math.pow(x - midX, 2) + Math.pow(y - midY, 2));
      if (distMid < tolerance) {
        return { guideId: guide.id, point: 'middle' };
      }
    }
    return null;
  };

  // Check if point is near a polygon vertex
  const findPolygonPointAtPosition = (x: number, y: number, onlySelected: boolean = false): { polygonId: string; pointIndex: number } | null => {
    // Adjust tolerance based on zoom level - larger tolerance when zoomed out
    const baseTolerance = 20;
    const tolerance = baseTolerance / zoomLevel;
    
    // If onlySelected is true, only check the selected polygon
    const polygonsToCheck = onlySelected && selectedPolygonId 
      ? polygons.filter(p => p.id === selectedPolygonId)
      : polygons;
    
    for (const polygon of polygonsToCheck) {
      for (let i = 0; i < polygon.points.length; i++) {
        const point = polygon.points[i];
        const dist = Math.sqrt(Math.pow(x - point.x, 2) + Math.pow(y - point.y, 2));
        if (dist < tolerance) {
          return { polygonId: polygon.id, pointIndex: i };
        }
      }
    }
    return null;
  };

  // Find closest point on a polygon line (for "Punkt auf Linie" feature)
  const findClosestPointOnPolygonLine = (x: number, y: number): { polygonId: string; lineIndex: number; point: AreaPoint } | null => {
    // Only work on selected polygon
    if (!selectedPolygonId) return null;
    
    const polygon = polygons.find(p => p.id === selectedPolygonId);
    if (!polygon) return null;
    
    // Adjust tolerance based on zoom level
    const baseTolerance = 15;
    const tolerance = baseTolerance / zoomLevel;
    let closest: { lineIndex: number; point: AreaPoint; distance: number } | null = null;
    
    for (let i = 0; i < polygon.points.length; i++) {
      const p1 = polygon.points[i];
      const p2 = polygon.points[(i + 1) % polygon.points.length];
      
      // Calculate closest point on line segment
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const lengthSq = dx * dx + dy * dy;
      
      if (lengthSq === 0) continue;
      
      let t = ((x - p1.x) * dx + (y - p1.y) * dy) / lengthSq;
      t = Math.max(0, Math.min(1, t));
      
      const closestX = p1.x + t * dx;
      const closestY = p1.y + t * dy;
      const distance = Math.sqrt(Math.pow(x - closestX, 2) + Math.pow(y - closestY, 2));
      
      // Don't add point too close to existing vertices
      const distToP1 = Math.sqrt(Math.pow(closestX - p1.x, 2) + Math.pow(closestY - p1.y, 2));
      const distToP2 = Math.sqrt(Math.pow(closestX - p2.x, 2) + Math.pow(closestY - p2.y, 2));
      
      if (distance < tolerance && distToP1 > 20 && distToP2 > 20) {
        if (!closest || distance < closest.distance) {
          closest = {
            lineIndex: i,
            point: { x: closestX, y: closestY },
            distance
          };
        }
      }
    }
    
    return closest ? { polygonId: selectedPolygonId, lineIndex: closest.lineIndex, point: closest.point } : null;
  };

  // Add point to polygon line
  const addPointToPolygonLine = (polygonId: string, lineIndex: number, newPoint: AreaPoint) => {
    saveStateForUndo();
    setPolygons(polygons.map(polygon => {
      if (polygon.id !== polygonId) return polygon;
      
      const newPoints = [...polygon.points];
      newPoints.splice(lineIndex + 1, 0, newPoint);
      return { ...polygon, points: newPoints };
    }));
  };

  // Update polygon point position
  const updatePolygonPoint = (polygonId: string, pointIndex: number, newPos: AreaPoint) => {
    setPolygons(polygons.map(polygon => {
      if (polygon.id !== polygonId) return polygon;
      
      const newPoints = [...polygon.points];
      newPoints[pointIndex] = newPos;
      return { ...polygon, points: newPoints };
    }));
  };

  // Move entire polygon
  const moveWholePolygon = (polygonId: string, dx: number, dy: number) => {
    setPolygons(polygons.map(polygon => {
      if (polygon.id !== polygonId) return polygon;
      
      const newPoints = polygon.points.map(p => ({
        x: p.x + dx,
        y: p.y + dy
      }));
      return { ...polygon, points: newPoints };
    }));
  };

  // Calculate line segments after deduction intersections
  const calculateLineSegmentsWithDeductions = (mainPolygon: AreaPolygon, lineIndex: number): { start: AreaPoint; end: AreaPoint; isInterrupted: boolean }[] => {
    const p1 = mainPolygon.points[lineIndex];
    const p2 = mainPolygon.points[(lineIndex + 1) % mainPolygon.points.length];
    
    // Find all deduction polygons that might intersect this line
    const deductionPolygons = polygons.filter(p => p.type === 'deduction');
    
    if (deductionPolygons.length === 0) {
      return [{ start: p1, end: p2, isInterrupted: false }];
    }
    
    // Collect all intersection points
    const intersections: { point: AreaPoint; t: number; deductionId: string }[] = [];
    
    for (const deduction of deductionPolygons) {
      for (let i = 0; i < deduction.points.length; i++) {
        const d1 = deduction.points[i];
        const d2 = deduction.points[(i + 1) % deduction.points.length];
        
        const intersection = getLineSegmentIntersection(p1, p2, d1, d2);
        if (intersection) {
          intersections.push({ ...intersection, deductionId: deduction.id });
        }
      }
    }
    
    // Sort by position along the line
    intersections.sort((a, b) => a.t - b.t);
    
    // No intersections - check if entire line is inside a deduction
    if (intersections.length === 0) {
      const midPoint = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
      for (const deduction of deductionPolygons) {
        if (isPointInPolygon(midPoint, deduction.points)) {
          return [{ start: p1, end: p2, isInterrupted: true }];
        }
      }
      return [{ start: p1, end: p2, isInterrupted: false }];
    }
    
    // Build segments
    const segments: { start: AreaPoint; end: AreaPoint; isInterrupted: boolean }[] = [];
    let currentPoint = p1;
    
    // Check if start point is inside any deduction
    let insideDeduction = false;
    for (const deduction of deductionPolygons) {
      if (isPointInPolygon(p1, deduction.points)) {
        insideDeduction = true;
        break;
      }
    }
    
    // Process each intersection
    for (let i = 0; i < intersections.length; i++) {
      const intersection = intersections[i];
      
      if (currentPoint.x !== intersection.point.x || currentPoint.y !== intersection.point.y) {
        segments.push({ 
          start: currentPoint, 
          end: intersection.point, 
          isInterrupted: insideDeduction 
        });
      }
      
      insideDeduction = !insideDeduction;
      currentPoint = intersection.point;
    }
    
    // Add final segment
    if (currentPoint.x !== p2.x || currentPoint.y !== p2.y) {
      segments.push({ 
        start: currentPoint, 
        end: p2, 
        isInterrupted: insideDeduction 
      });
    }
    
    return segments;
  };

  // Get intersection of two line segments
  const getLineSegmentIntersection = (p1: AreaPoint, p2: AreaPoint, p3: AreaPoint, p4: AreaPoint): { point: AreaPoint; t: number } | null => {
    const x1 = p1.x, y1 = p1.y, x2 = p2.x, y2 = p2.y;
    const x3 = p3.x, y3 = p3.y, x4 = p4.x, y4 = p4.y;
    
    const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
    if (Math.abs(denom) < 0.0001) return null;
    
    const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
    const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / denom;
    
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
      return {
        point: { x: x1 + t * (x2 - x1), y: y1 + t * (y2 - y1) },
        t
      };
    }
    
    return null;
  };

  // Calculate angle from horizontal (for live angle display)
  const calculateAngleFromHorizontal = (p1: AreaPoint, p2: AreaPoint): number => {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    let angle = Math.atan2(-dy, dx) * (180 / Math.PI); // Negative dy because Y is inverted
    if (angle < 0) angle += 360;
    return angle;
  };

  // Numpad functions
  const handleNumpadPress = (key: string) => {
    if (key === 'C') {
      setNumpadInput('');
    } else if (key === '⌫') {
      setNumpadInput(prev => prev.slice(0, -1));
    } else if (key === 'OK') {
      applyNumpadInput();
    } else {
      setNumpadInput(prev => prev + key);
    }
  };

  // Evaluate mathematical expression (supports +, -, *, /)
  const evaluateExpression = (expr: string): number | null => {
    try {
      // First: remove any unit letters/symbols (m, cm, mm, etc.) that laser devices might send
      let cleanExpr = expr.replace(/[a-zA-Z°'"²³µ\s]/g, '');
      // Replace , with . for decimals
      cleanExpr = cleanExpr.replace(/,/g, '.');
      // Remove any trailing dots
      cleanExpr = cleanExpr.replace(/\.+$/, '');
      // Only allow numbers and basic operators
      if (!/^[\d\.\+\-\*\/\(\)]+$/.test(cleanExpr)) return null;
      if (cleanExpr === '') return null;
      // Evaluate
      const result = Function('"use strict"; return (' + cleanExpr + ')')();
      return isNaN(result) ? null : result;
    } catch {
      return null;
    }
  };

  const applyNumpadInput = () => {
    if (!editingEdge) return;
    
    const value = evaluateExpression(numpadInput);
    if (value === null || value <= 0) {
      Alert.alert('Ungültige Eingabe', 'Bitte geben Sie eine gültige Zahl oder Formel ein.');
      return;
    }
    
    // Get the polygon and the edge
    const polygon = polygons.find(p => p.id === editingEdge.polygonId);
    if (!polygon) return;
    
    const edgeIndex = editingEdge.edgeIndex;
    const p1 = polygon.points[edgeIndex];
    const p2 = polygon.points[(edgeIndex + 1) % polygon.points.length];
    
    // Calculate current length and the scale factor
    const currentLength = calculateLineLength(p1, p2);
    const targetLengthInPixels = value * scale;
    const currentLengthInPixels = Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
    
    // Calculate the direction vector
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const length = Math.sqrt(dx * dx + dy * dy);
    
    if (length === 0) return;
    
    // Normalize and scale to new length
    const unitX = dx / length;
    const unitY = dy / length;
    
    // Move p2 to the new position (keeping p1 fixed)
    const newP2 = {
      x: p1.x + unitX * targetLengthInPixels,
      y: p1.y + unitY * targetLengthInPixels
    };
    
    // Update polygon
    saveStateForUndo();
    const newPoints = [...polygon.points];
    newPoints[(edgeIndex + 1) % polygon.points.length] = newP2;
    
    setPolygons(polygons.map(p => 
      p.id === editingEdge.polygonId ? { ...p, points: newPoints } : p
    ));
    
    // Close numpad
    setShowNumpad(false);
    setEditingEdge(null);
    setNumpadInput('');
  };

  // Apply numpad input as label only (don't change line geometry)
  const applyNumpadInputAsLabel = () => {
    if (!editingEdge) return;
    
    const value = evaluateExpression(numpadInput);
    if (value === null || value <= 0) {
      Alert.alert('Ungültige Eingabe', 'Bitte geben Sie eine gültige Zahl oder Formel ein.');
      return;
    }
    
    // Save custom length label (doesn't change polygon)
    const edgeKey = `${editingEdge.polygonId}-${editingEdge.edgeIndex}`;
    setCustomEdgeLengths(prev => ({ ...prev, [edgeKey]: value }));
    
    // Close numpad
    setShowNumpad(false);
    setEditingEdge(null);
    setNumpadInput('');
  };

  const openNumpadForEdge = (polygonId: string, edgeIndex: number, currentLength: number) => {
    setEditingEdge({ polygonId, edgeIndex });
    setNumpadInput(''); // Always start with empty input
    setShowNumpad(true);
  };

  const getEdgeLength = (polygonId: string, edgeIndex: number, calculatedLength: number): number => {
    // In Auto mode (Manuell AUS), always show original calculated length
    if (!useManualAreaCalc) {
      return calculatedLength;
    }
    // In Manual mode (Manuell AN), show custom length if available
    const edgeKey = `${polygonId}-${edgeIndex}`;
    return customEdgeLengths[edgeKey] ?? calculatedLength;
  };

  const hasCustomLength = (polygonId: string, edgeIndex: number): boolean => {
    // Only show as custom (with visual indicator) if Manuell is ON and there's a custom value
    if (!useManualAreaCalc) {
      return false;
    }
    const edgeKey = `${polygonId}-${edgeIndex}`;
    return customEdgeLengths[edgeKey] !== undefined;
  };

  // Draw line with fixed angle and length from the modal
  const drawLineFromModal = () => {
    if (currentPoints.length === 0) {
      Alert.alert('Kein Startpunkt', 'Bitte setzen Sie zuerst einen Startpunkt auf der Zeichenfläche.');
      return;
    }
    
    const lastPoint = currentPoints[currentPoints.length - 1];
    
    // Parse length
    let targetLength: number | null = null;
    if (fixedLength !== '') {
      try {
        let cleanExpr = fixedLength.replace(/,/g, '.');
        if (/^[\d\.\+\-\*\/\(\)\s]+$/.test(cleanExpr)) {
          targetLength = Function('"use strict"; return (' + cleanExpr + ')')();
          if (isNaN(targetLength) || targetLength <= 0) {
            Alert.alert('Ungültige Länge', 'Bitte geben Sie eine gültige Länge ein.');
            return;
          }
        }
      } catch {
        Alert.alert('Ungültige Länge', 'Bitte geben Sie eine gültige Länge ein.');
        return;
      }
    }
    
    if (targetLength === null) {
      Alert.alert('Keine Länge', 'Bitte geben Sie eine Länge ein.');
      return;
    }
    
    // Calculate new point
    const angle = fixedAngle ?? 0;
    const radians = angle * (Math.PI / 180);
    const pixelLength = targetLength * scale;
    
    const newPoint = {
      x: lastPoint.x + pixelLength * Math.cos(radians),
      y: lastPoint.y - pixelLength * Math.sin(radians) // Negative because screen Y is inverted
    };
    
    setCurrentPoints([...currentPoints, newPoint]);
    
    // Längenfeld zurücksetzen und Fokus setzen für nächste Eingabe
    setFixedLength('');
    setTimeout(() => lengthInputRef?.current?.focus(), 100);
  };

  // Undo last point
  const undoLastPoint = () => {
    if (currentPoints.length > 0) {
      setCurrentPoints(currentPoints.slice(0, -1));
    }
  };

  // Check if a touch point is on any edge label
  const findEdgeLabelAtPosition = (x: number, y: number): { polygonId: string; edgeIndex: number; length: number } | null => {
    // Adjust tolerance based on zoom level - labels need larger touch target
    const baseTolerance = 30;
    const tolerance = baseTolerance / zoomLevel;
    
    for (const polygon of polygons) {
      for (let i = 0; i < polygon.points.length; i++) {
        const point = polygon.points[i];
        const nextPoint = polygon.points[(i + 1) % polygon.points.length];
        
        // Calculate label position (same logic as in rendering)
        const midX = (point.x + nextPoint.x) / 2;
        const midY = (point.y + nextPoint.y) / 2;
        
        const dx = nextPoint.x - point.x;
        const dy = nextPoint.y - point.y;
        const lineLen = Math.sqrt(dx * dx + dy * dy);
        
        if (lineLen < 1) continue;
        
        const perpX = -dy / lineLen;
        const perpY = dx / lineLen;
        
        const centerX = polygon.points.reduce((s, p) => s + p.x, 0) / polygon.points.length;
        const centerY = polygon.points.reduce((s, p) => s + p.y, 0) / polygon.points.length;
        const toCenter = { x: centerX - midX, y: centerY - midY };
        const perpDot = perpX * toCenter.x + perpY * toCenter.y;
        
        const offset = 25;
        const labelX = midX + (perpDot > 0 ? -perpX : perpX) * offset;
        const labelY = midY + (perpDot > 0 ? -perpY : perpY) * offset;
        
        // Check if touch is near this label
        const dist = Math.sqrt(Math.pow(x - labelX, 2) + Math.pow(y - labelY, 2));
        if (dist < tolerance) {
          const calculatedLength = calculateLineLength(point, nextPoint);
          return { 
            polygonId: polygon.id, 
            edgeIndex: i, 
            length: getEdgeLength(polygon.id, i, calculatedLength)
          };
        }
      }
    }
    return null;
  };

  // Touch handlers
  const handleCanvasTouch = (event: any) => {
    const touch = event.nativeEvent;
    const rawX = touch.locationX;
    const rawY = touch.locationY;
    
    // Transform coordinates based on zoom and pan
    const transformed = transformCoordinates(rawX, rawY);
    const x = transformed.x;
    const y = transformed.y;
    
    // Check if clicking on an edge measurement label to edit it
    if (mode === 'select' && showEdgeLengths) {
      const edgeLabel = findEdgeLabelAtPosition(x, y);
      if (edgeLabel) {
        openNumpadForEdge(edgeLabel.polygonId, edgeLabel.edgeIndex, edgeLabel.length);
        return;
      }
    }
    
    // Use smart snapping
    const snapResult = snapToNearestPoint(x, y);
    const snappedX = snapResult.point.x;
    const snappedY = snapResult.point.y;
    
    // Update visual snap indicator
    setCurrentSnapPoint({ point: snapResult.point, isSnapped: snapResult.snapped });
    
    if (mode === 'scale') {
      if (!scaleReference.startPoint) {
        setScaleReference({ ...scaleReference, startPoint: { x: snappedX, y: snappedY } });
      } else if (!scaleReference.endPoint) {
        setScaleReference({ ...scaleReference, endPoint: { x: snappedX, y: snappedY } });
        setShowScaleModal(true);
      }
    } else if (mode === 'guideline') {
      // Drawing guide line
      if (currentPoints.length === 0) {
        setCurrentPoints([{ x: snappedX, y: snappedY }]);
      } else {
        // Complete guide line
        saveStateForUndo();
        const newGuideLine = {
          id: Date.now().toString(),
          start: currentPoints[0],
          end: snapToAngles ? snapAngle(currentPoints[0], { x: snappedX, y: snappedY }) : { x: snappedX, y: snappedY }
        };
        setGuideLines([...guideLines, newGuideLine]);
        setCurrentPoints([]);
      }
    } else if (mode === 'parallel') {
      // Select guide line for parallel
      const clickedGuide = findGuideLineAtPoint(x, y);
      if (clickedGuide) {
        setSelectedGuideLineId(clickedGuide.id);
        resetParallelModalPosition();
        setShowParallelModal(true);
      }
    } else if (mode === 'dimension') {
      // Drawing dimension line
      if (currentPoints.length === 0) {
        setCurrentPoints([{ x: snappedX, y: snappedY }]);
      } else {
        // Complete dimension line
        saveStateForUndo();
        const newDimensionLine: DimensionLine = {
          id: Date.now().toString(),
          start: currentPoints[0],
          end: { x: snappedX, y: snappedY }
        };
        setDimensionLines([...dimensionLines, newDimensionLine]);
        setCurrentPoints([]);
      }
    } else if (mode === 'polygon' || mode === 'deduction') {
      // Check if close to first point (to close polygon)
      if (currentPoints.length >= 3) {
        const firstPoint = currentPoints[0];
        const distance = Math.sqrt(Math.pow(snappedX - firstPoint.x, 2) + Math.pow(snappedY - firstPoint.y, 2));
        
        if (distance < 20) {
          // Close polygon
          finishPolygon();
          return;
        }
      }
      
      // Apply angle snapping when adding points
      let finalPoint = { x: snappedX, y: snappedY };
      if (currentPoints.length > 0) {
        const lastPoint = currentPoints[currentPoints.length - 1];
        
        // Calculate direction and apply fixed angle/length
        let dx = snappedX - lastPoint.x;
        let dy = snappedY - lastPoint.y;
        let length = Math.sqrt(dx * dx + dy * dy);
        
        // If fixed length is set, parse and use it
        let targetLength: number | null = null;
        if (fixedLength !== '') {
          try {
            let cleanExpr = fixedLength.replace(/,/g, '.');
            if (/^[\d\.\+\-\*\/\(\)\s]+$/.test(cleanExpr)) {
              targetLength = Function('"use strict"; return (' + cleanExpr + ')')();
              if (isNaN(targetLength) || targetLength <= 0) targetLength = null;
            }
          } catch {
            targetLength = null;
          }
        }
        
        // If fixed angle is set, use that exact angle (mathematical coordinates: 0°=right, 90°=up)
        if (fixedAngle !== null) {
          const radians = fixedAngle * (Math.PI / 180);
          const useLength = targetLength !== null ? targetLength * scale : length;
          finalPoint = {
            x: lastPoint.x + useLength * Math.cos(radians),
            y: lastPoint.y - useLength * Math.sin(radians)  // Negative because screen Y is inverted
          };
        } else if (targetLength !== null) {
          // Only fixed length, use the direction from touch
          if (length > 10) {
            const unitX = dx / length;
            const unitY = dy / length;
            finalPoint = {
              x: lastPoint.x + unitX * targetLength * scale,
              y: lastPoint.y + unitY * targetLength * scale
            };
          }
        } else if (snapToAngles) {
          // Use auto snap to nearest angle
          finalPoint = snapAngle(lastPoint, finalPoint);
        }
      }
      
      setCurrentPoints([...currentPoints, finalPoint]);
    } else if (mode === 'annotation_rect' || mode === 'annotation_circle' || mode === 'annotation_arrow' || mode === 'annotation_line') {
      // Start drawing annotation shape
      if (!currentAnnotationShape) {
        const shapeTypeMap: { [key: string]: 'rectangle' | 'circle' | 'arrow' | 'line' } = {
          'annotation_rect': 'rectangle',
          'annotation_circle': 'circle',
          'annotation_arrow': 'arrow',
          'annotation_line': 'line',
        };
        const shapeType = shapeTypeMap[mode];
        setCurrentAnnotationShape({
          id: Date.now().toString(),
          type: shapeType,
          x1: x,
          y1: y,
          x2: x,
          y2: y,
          color: annotationColor,
          strokeWidth: annotationStrokeWidth,
        });
      }
    } else if (mode === 'annotation_text') {
      // Place text annotation
      setTextPosition({ x, y });
      setShowTextModal(true);
    } else if (mode === 'annotation_memo') {
      // Tap to place memo - open modal immediately
      setPendingMemoPointer({ x1: x, y1: y - 50, x2: x, y2: y });
      setShowMemoModal(true);
    } else if (mode === 'select') {
      // First check if clicking on an annotation
      const clickedAnnotation = findAnnotationAtPosition(x, y);
      if (clickedAnnotation) {
        // Clear other selections
        setSelectedPolygonId(null);
        setSelectedGuideLineId(null);
        
        if (clickedAnnotation.type === 'shape') {
          setSelectedAnnotationId(clickedAnnotation.id);
          setSelectedTextId(null);
          setSelectedMemoId(null);
        } else if (clickedAnnotation.type === 'text') {
          setSelectedTextId(clickedAnnotation.id);
          setSelectedAnnotationId(null);
          setSelectedMemoId(null);
        } else if (clickedAnnotation.type === 'memo') {
          setSelectedMemoId(clickedAnnotation.id);
          setSelectedAnnotationId(null);
          setSelectedTextId(null);
        }
        return;
      }
      
      // Clear annotation selections
      setSelectedAnnotationId(null);
      setSelectedTextId(null);
      setSelectedMemoId(null);
      
      // Check if clicking on a guide line
      const clickedGuide = findGuideLineAtPoint(x, y);
      if (clickedGuide) {
        setSelectedGuideLineId(clickedGuide.id);
        setSelectedPolygonId(null);
        return;
      }
      
      // Check if clicking on a line
      const clickedLine = findLineAtPoint(x, y);
      if (clickedLine) {
        setSelectedLineIndex(clickedLine);
        setShowLineCategoryModal(true);
        return;
      }
      
      // Check if clicking on a polygon
      const clickedPolygon = findPolygonAtPoint(x, y);
      if (clickedPolygon) {
        setSelectedPolygonId(clickedPolygon.id);
        setSelectedGuideLineId(null);
      } else {
        setSelectedPolygonId(null);
        setSelectedGuideLineId(null);
      }
    }
  };

  // Find guide line at point
  const findGuideLineAtPoint = (x: number, y: number): { id: string } | null => {
    // Adjust tolerance based on zoom level
    const baseTolerance = 10;
    const tolerance = baseTolerance / zoomLevel;
    
    for (const guide of guideLines) {
      const dist = pointToLineDistance({ x, y }, guide.start, guide.end);
      if (dist < tolerance) {
        return { id: guide.id };
      }
    }
    return null;
  };

  // Find polygon at point
  const findPolygonAtPoint = (x: number, y: number): AreaPolygon | null => {
    // Check in reverse order (top-most first)
    for (let i = polygons.length - 1; i >= 0; i--) {
      const polygon = polygons[i];
      if (isPointInPolygon({ x, y }, polygon.points)) {
        return polygon;
      }
    }
    return null;
  };

  // Point in polygon test
  const isPointInPolygon = (point: AreaPoint, polygon: AreaPoint[]): boolean => {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i].x, yi = polygon[i].y;
      const xj = polygon[j].x, yj = polygon[j].y;
      
      if (((yi > point.y) !== (yj > point.y)) &&
          (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi)) {
        inside = !inside;
      }
    }
    return inside;
  };

  // Find line at point
  const findLineAtPoint = (x: number, y: number): { polygonId: string; pointIndex: number } | null => {
    // Adjust tolerance based on zoom level
    const baseTolerance = 15;
    const tolerance = baseTolerance / zoomLevel;
    
    for (const polygon of polygons) {
      for (let i = 0; i < polygon.points.length; i++) {
        const p1 = polygon.points[i];
        const p2 = polygon.points[(i + 1) % polygon.points.length];
        
        // Calculate distance from point to line segment
        const distance = pointToLineDistance({ x, y }, p1, p2);
        
        if (distance < tolerance) {
          return { polygonId: polygon.id, pointIndex: i };
        }
      }
    }
    return null;
  };

  // Point to line distance
  const pointToLineDistance = (point: AreaPoint, lineStart: AreaPoint, lineEnd: AreaPoint): number => {
    const A = point.x - lineStart.x;
    const B = point.y - lineStart.y;
    const C = lineEnd.x - lineStart.x;
    const D = lineEnd.y - lineStart.y;
    
    const dot = A * C + B * D;
    const lenSq = C * C + D * D;
    let param = -1;
    
    if (lenSq !== 0) param = dot / lenSq;
    
    let xx, yy;
    
    if (param < 0) {
      xx = lineStart.x;
      yy = lineStart.y;
    } else if (param > 1) {
      xx = lineEnd.x;
      yy = lineEnd.y;
    } else {
      xx = lineStart.x + param * C;
      yy = lineStart.y + param * D;
    }
    
    const dx = point.x - xx;
    const dy = point.y - yy;
    
    return Math.sqrt(dx * dx + dy * dy);
  };

  // Finish polygon
  const finishPolygon = () => {
    if (currentPoints.length < 3) return;
    
    saveStateForUndo();
    
    const newPolygon: AreaPolygon = {
      id: Date.now().toString(),
      points: [...currentPoints],
      type: mode === 'deduction' ? 'deduction' : 'main',
      name: mode === 'deduction' ? 'Abzug' : 'Fläche',
      color: mode === 'deduction' ? '#f44336' : '#4CAF50',
    };
    
    // If this is a deduction polygon, insert intersection points into main polygons
    if (mode === 'deduction') {
      const updatedMainPolygons = insertDeductionIntersections(newPolygon, polygons);
      setPolygons([...updatedMainPolygons, newPolygon]);
    } else {
      setPolygons([...polygons, newPolygon]);
    }
    
    setCurrentPoints([]);
    setPolygonNameInput(newPolygon.name);
    setSelectedPolygonId(newPolygon.id);
    setShowPolygonNameModal(true);
  };

  // Insert intersection points from deduction into main polygons (snipping tool effect)
  const insertDeductionIntersections = (deduction: AreaPolygon, existingPolygons: AreaPolygon[]): AreaPolygon[] => {
    return existingPolygons.map(polygon => {
      if (polygon.type !== 'main') return polygon;
      
      // Collect all intersection points for this main polygon
      const intersections: { edgeIndex: number; t: number; point: AreaPoint }[] = [];
      
      // Check each edge of the main polygon against each edge of the deduction
      for (let mainIdx = 0; mainIdx < polygon.points.length; mainIdx++) {
        const mainP1 = polygon.points[mainIdx];
        const mainP2 = polygon.points[(mainIdx + 1) % polygon.points.length];
        
        for (let dedIdx = 0; dedIdx < deduction.points.length; dedIdx++) {
          const dedP1 = deduction.points[dedIdx];
          const dedP2 = deduction.points[(dedIdx + 1) % deduction.points.length];
          
          const intersection = getLineSegmentIntersection(mainP1, mainP2, dedP1, dedP2);
          if (intersection) {
            // Check if this intersection point is not too close to existing points
            const minDist = 10;
            const tooClose = polygon.points.some(p => 
              Math.sqrt(Math.pow(p.x - intersection.point.x, 2) + Math.pow(p.y - intersection.point.y, 2)) < minDist
            ) || intersections.some(i => 
              i.edgeIndex === mainIdx && Math.abs(i.t - intersection.t) < 0.05
            );
            
            if (!tooClose) {
              intersections.push({
                edgeIndex: mainIdx,
                t: intersection.t,
                point: intersection.point
              });
            }
          }
        }
      }
      
      if (intersections.length === 0) return polygon;
      
      // Sort intersections by edge index, then by t value (position along edge)
      intersections.sort((a, b) => {
        if (a.edgeIndex !== b.edgeIndex) return a.edgeIndex - b.edgeIndex;
        return a.t - b.t;
      });
      
      // Build new points array with intersection points inserted
      const newPoints: AreaPoint[] = [];
      let intersectionIdx = 0;
      
      for (let i = 0; i < polygon.points.length; i++) {
        newPoints.push(polygon.points[i]);
        
        // Insert any intersection points for this edge
        while (intersectionIdx < intersections.length && intersections[intersectionIdx].edgeIndex === i) {
          newPoints.push(intersections[intersectionIdx].point);
          intersectionIdx++;
        }
      }
      
      // Update line categories to reflect new indices
      const updatedLines = lines.map(line => {
        if (line.polygonId !== polygon.id) return line;
        
        // Count how many intersection points were added before this line's index
        let offset = 0;
        for (const inter of intersections) {
          if (inter.edgeIndex < line.pointIndex) {
            offset++;
          }
        }
        
        return { ...line, pointIndex: line.pointIndex + offset };
      });
      
      // Update the lines state
      setTimeout(() => setLines(updatedLines), 0);
      
      return { ...polygon, points: newPoints };
    });
  };

  // Apply scale from reference line
  const applyScale = () => {
    if (!scaleReference.startPoint || !scaleReference.endPoint) return;
    
    const realLength = parseFloat(scaleInputValue.replace(',', '.'));
    if (isNaN(realLength) || realLength <= 0) {
      Alert.alert('Fehler', 'Bitte geben Sie eine gültige Länge ein');
      return;
    }
    
    const pixelLength = Math.sqrt(
      Math.pow(scaleReference.endPoint.x - scaleReference.startPoint.x, 2) +
      Math.pow(scaleReference.endPoint.y - scaleReference.startPoint.y, 2)
    );
    
    const newScale = pixelLength / realLength;
    setScale(newScale);
    setScaleReference({ ...scaleReference, realLength });
    setShowScaleModal(false);
    setMode('select');
    
    Alert.alert('Maßstab gesetzt', `1 Meter = ${newScale.toFixed(1)} Pixel`);
  };

  // Assign category to line
  const assignLineCategory = (category: string) => {
    if (!selectedLineIndex) return;
    
    // Check if line already has a category
    const existingIndex = lines.findIndex(
      l => l.polygonId === selectedLineIndex.polygonId && l.pointIndex === selectedLineIndex.pointIndex
    );
    
    if (existingIndex >= 0) {
      // Update existing
      const newLines = [...lines];
      newLines[existingIndex].category = category;
      setLines(newLines);
    } else {
      // Add new
      const polygon = polygons.find(p => p.id === selectedLineIndex.polygonId);
      if (polygon) {
        const p1 = polygon.points[selectedLineIndex.pointIndex];
        const p2 = polygon.points[(selectedLineIndex.pointIndex + 1) % polygon.points.length];
        
        const newLine: AreaLine = {
          id: Date.now().toString(),
          polygonId: selectedLineIndex.polygonId,
          pointIndex: selectedLineIndex.pointIndex,
          category,
          length: calculateLineLength(p1, p2),
        };
        
        setLines([...lines, newLine]);
      }
    }
    
    setShowLineCategoryModal(false);
    setSelectedLineIndex(null);
  };

  // Remove line category
  const removeLineCategory = () => {
    if (!selectedLineIndex) return;
    
    setLines(lines.filter(
      l => !(l.polygonId === selectedLineIndex.polygonId && l.pointIndex === selectedLineIndex.pointIndex)
    ));
    
    setShowLineCategoryModal(false);
    setSelectedLineIndex(null);
  };

  // Delete selected polygon
  const deleteSelectedPolygon = () => {
    if (!selectedPolygonId) return;
    
    saveStateForUndo();
    setPolygons(polygons.filter(p => p.id !== selectedPolygonId));
    setLines(lines.filter(l => l.polygonId !== selectedPolygonId));
    setSelectedPolygonId(null);
  };

  // Delete a single polygon point
  const deletePolygonPoint = (polygonId: string, pointIndex: number) => {
    const polygon = polygons.find(p => p.id === polygonId);
    if (!polygon) return;
    
    // Can't delete if polygon would have less than 3 points
    if (polygon.points.length <= 3) {
      Alert.alert('Hinweis', 'Ein Polygon muss mindestens 3 Punkte haben. Löschen Sie stattdessen das ganze Polygon.');
      return;
    }
    
    saveStateForUndo();
    
    // Remove the point
    const newPoints = polygon.points.filter((_, idx) => idx !== pointIndex);
    setPolygons(polygons.map(p => 
      p.id === polygonId ? { ...p, points: newPoints } : p
    ));
    
    // Update line categories (shift indices after deleted point)
    setLines(lines.map(line => {
      if (line.polygonId !== polygonId) return line;
      if (line.pointIndex === pointIndex) return null; // Remove this line category
      if (line.pointIndex > pointIndex) return { ...line, pointIndex: line.pointIndex - 1 };
      return line;
    }).filter(Boolean) as AreaLine[]);
  };

  // Cancel current polygon
  const cancelCurrentPolygon = () => {
    setCurrentPoints([]);
    setMode('select');
  };

  // Get line category for a line
  const getLineCategory = (polygonId: string, pointIndex: number): string | null => {
    const line = lines.find(l => l.polygonId === polygonId && l.pointIndex === pointIndex);
    return line?.category || null;
  };

  // Get category color
  const getCategoryColor = (category: string): string => {
    const cat = lineCategories.find(c => c.name === category);
    return cat?.color || '#666';
  };

  // === ANNOTATION RENDER FUNCTIONS ===
  
  // Render annotation shape (rectangle, circle, arrow, line)
  const renderAnnotationShape = (shape: AnnotationShape, isPreview = false) => {
    const { id, type, x1, y1, x2, y2, color, strokeWidth: sw } = shape;
    const key = isPreview ? 'preview-shape' : id;
    const isSelected = selectedAnnotationId === id;

    switch (type) {
      case 'rectangle':
        return (
          <G key={key}>
            <Rect
              x={Math.min(x1, x2)}
              y={Math.min(y1, y2)}
              width={Math.abs(x2 - x1)}
              height={Math.abs(y2 - y1)}
              stroke={color}
              strokeWidth={sw}
              fill="none"
            />
            {isSelected && (
              <>
                <Circle cx={Math.min(x1, x2)} cy={Math.min(y1, y2)} r={6} fill="#2196F3" />
                <Circle cx={Math.max(x1, x2)} cy={Math.min(y1, y2)} r={6} fill="#2196F3" />
                <Circle cx={Math.min(x1, x2)} cy={Math.max(y1, y2)} r={6} fill="#2196F3" />
                <Circle cx={Math.max(x1, x2)} cy={Math.max(y1, y2)} r={6} fill="#2196F3" />
              </>
            )}
          </G>
        );
      case 'circle':
        const cx = (x1 + x2) / 2;
        const cy = (y1 + y2) / 2;
        const r = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1)) / 2;
        const minCX = Math.min(x1, x2);
        const maxCX = Math.max(x1, x2);
        const minCY = Math.min(y1, y2);
        const maxCY = Math.max(y1, y2);
        return (
          <G key={key}>
            <Circle cx={cx} cy={cy} r={r} stroke={color} strokeWidth={sw} fill="none" />
            {isSelected && (
              <>
                {/* Corner handles for resizing */}
                <Circle cx={minCX} cy={minCY} r={8} fill="#2196F3" />
                <Circle cx={maxCX} cy={minCY} r={8} fill="#2196F3" />
                <Circle cx={minCX} cy={maxCY} r={8} fill="#2196F3" />
                <Circle cx={maxCX} cy={maxCY} r={8} fill="#2196F3" />
              </>
            )}
          </G>
        );
      case 'line':
        return (
          <G key={key}>
            <Line x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth={sw} />
            {isSelected && (
              <>
                <Circle cx={x1} cy={y1} r={6} fill="#2196F3" />
                <Circle cx={x2} cy={y2} r={6} fill="#2196F3" />
              </>
            )}
          </G>
        );
      case 'arrow':
        const angle = Math.atan2(y2 - y1, x2 - x1);
        const headLength = 15;
        return (
          <G key={key}>
            <Line x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth={sw} />
            <Line
              x1={x2}
              y1={y2}
              x2={x2 - headLength * Math.cos(angle - Math.PI / 6)}
              y2={y2 - headLength * Math.sin(angle - Math.PI / 6)}
              stroke={color}
              strokeWidth={sw}
            />
            <Line
              x1={x2}
              y1={y2}
              x2={x2 - headLength * Math.cos(angle + Math.PI / 6)}
              y2={y2 - headLength * Math.sin(angle + Math.PI / 6)}
              stroke={color}
              strokeWidth={sw}
            />
            {isSelected && (
              <>
                <Circle cx={x1} cy={y1} r={6} fill="#2196F3" />
                <Circle cx={x2} cy={y2} r={6} fill="#2196F3" />
              </>
            )}
          </G>
        );
      default:
        return null;
    }
  };

  // Render text annotation
  const renderTextAnnotation = (annotation: TextAnnotation) => {
    const { id, text, x, y, color, fontSize } = annotation;
    const isSelected = selectedTextId === id;
    
    // Prüfen ob Text ein Kürzel ist
    const resolved = resolveShortcut(text);
    const displayText = resolved.isShortcut ? resolved.display : text;
    
    return (
      <G key={id}>
        {isSelected && (
          <Rect
            x={x - 5}
            y={y - fontSize}
            width={displayText.length * fontSize * 0.55 + 10}
            height={fontSize + 10}
            fill="rgba(33, 150, 243, 0.2)"
            stroke="#2196F3"
            strokeWidth={1}
            strokeDasharray="4,2"
          />
        )}
        {resolved.isShortcut && (
          <Rect
            x={x - 3}
            y={y - fontSize + 2}
            width={displayText.length * fontSize * 0.55 + 6}
            height={fontSize + 4}
            fill="rgba(255, 152, 0, 0.15)"
            rx={4}
          />
        )}
        <SvgText
          x={x}
          y={y}
          fill={resolved.isShortcut ? '#e65100' : color}
          fontSize={fontSize}
          fontWeight="600"
        >
          {displayText}
        </SvgText>
      </G>
    );
  };

  // Render memo pointer
  const renderMemoPointer = (memo: MemoPointer, isPreview = false) => {
    const { id, x1, y1, x2, y2, text, color } = memo;
    const key = isPreview ? 'preview-memo' : id;
    const isSelected = selectedMemoId === id;
    
    const noteText = text || '';
    // Prüfen ob Text ein Kürzel ist
    const resolved = resolveShortcut(noteText);
    const displayText = resolved.isShortcut ? resolved.display : noteText;
    
    const textLength = displayText.length;
    const noteWidth = Math.max(textLength * 8 + 20, 80);
    const noteHeight = 32;
    const noteX = x1 - noteWidth / 2;
    const noteY = y1 - noteHeight - 5;
    const cornerRadius = 6;
    const targetRadius = 6;
    
    return (
      <G key={key}>
        {/* Connecting line from note to target */}
        <Line 
          x1={x1} 
          y1={y1} 
          x2={x2} 
          y2={y2} 
          stroke={color} 
          strokeWidth={2}
          strokeDasharray="5,3"
        />
        
        {/* Target indicator - filled circle */}
        <Circle 
          cx={x2} 
          cy={y2} 
          r={targetRadius} 
          fill={color}
          stroke="white"
          strokeWidth={2}
        />
        
        {/* Note box shadow */}
        <Rect 
          x={noteX + 2} 
          y={noteY + 2} 
          width={noteWidth} 
          height={noteHeight} 
          fill="rgba(0,0,0,0.15)" 
          rx={cornerRadius}
        />
        
        {/* Note box background */}
        <Rect 
          x={noteX} 
          y={noteY} 
          width={noteWidth} 
          height={noteHeight} 
          fill="#FFFDE7"
          stroke={color} 
          strokeWidth={isSelected ? 3 : 2} 
          rx={cornerRadius}
        />
        
        {/* Small triangle/pointer from box to line */}
        <Path 
          d={`M ${x1 - 6} ${noteY + noteHeight} L ${x1} ${noteY + noteHeight + 8} L ${x1 + 6} ${noteY + noteHeight} Z`}
          fill="#FFFDE7"
          stroke={color}
          strokeWidth={2}
        />
        {/* Cover the bottom stroke where triangle meets box */}
        <Line 
          x1={x1 - 5} 
          y1={noteY + noteHeight} 
          x2={x1 + 5} 
          y2={noteY + noteHeight} 
          stroke="#FFFDE7" 
          strokeWidth={3}
        />
        
        {/* Note text */}
        {displayText && (
          <SvgText 
            x={x1} 
            y={noteY + noteHeight / 2 + 5} 
            fill={resolved.isShortcut ? '#e65100' : '#333'}
            fontSize={13} 
            fontWeight="600" 
            textAnchor="middle"
          >
            {displayText}
          </SvgText>
        )}
        
        {/* Selection indicators */}
        {isSelected && (
          <>
            <Circle cx={x1} cy={y1 - noteHeight / 2} r={6} fill="#2196F3" />
            <Circle cx={x2} cy={y2} r={10} fill="none" stroke="#2196F3" strokeWidth={2} />
          </>
        )}
      </G>
    );
  };

  // Find annotation at position
  const findAnnotationAtPosition = (x: number, y: number): { type: 'shape' | 'text' | 'memo'; id: string } | null => {
    // Adjust tolerance based on zoom level
    const baseTolerance = 15;
    const tolerance = baseTolerance / zoomLevel;
    const memoTargetTolerance = 20 / zoomLevel;
    
    // Check memo pointers first (they have larger hit areas)
    for (const memo of memoPointers) {
      const noteWidth = Math.max((memo.text?.length || 0) * 9 + 20, 80);
      const noteHeight = 32;
      const noteX = memo.x1 - noteWidth / 2;
      const noteY = memo.y1 - noteHeight - 5;
      
      // Check if in note box
      if (x >= noteX && x <= noteX + noteWidth && y >= noteY && y <= noteY + noteHeight + 8) {
        return { type: 'memo', id: memo.id };
      }
      
      // Check if near target point
      const targetDist = Math.sqrt(Math.pow(x - memo.x2, 2) + Math.pow(y - memo.y2, 2));
      if (targetDist < memoTargetTolerance) {
        return { type: 'memo', id: memo.id };
      }
    }
    
    // Check text annotations
    for (const text of textAnnotations) {
      const textWidth = text.text.length * text.fontSize * 0.6;
      if (x >= text.x - 5 && x <= text.x + textWidth + 5 && 
          y >= text.y - text.fontSize && y <= text.y + 5) {
        return { type: 'text', id: text.id };
      }
    }
    
    // Check shapes
    for (const shape of annotationShapes) {
      const { type, x1, y1, x2, y2 } = shape;
      
      if (type === 'rectangle') {
        const minX = Math.min(x1, x2);
        const maxX = Math.max(x1, x2);
        const minY = Math.min(y1, y2);
        const maxY = Math.max(y1, y2);
        
        // Check if near any edge
        const nearTop = Math.abs(y - minY) < tolerance && x >= minX - tolerance && x <= maxX + tolerance;
        const nearBottom = Math.abs(y - maxY) < tolerance && x >= minX - tolerance && x <= maxX + tolerance;
        const nearLeft = Math.abs(x - minX) < tolerance && y >= minY - tolerance && y <= maxY + tolerance;
        const nearRight = Math.abs(x - maxX) < tolerance && y >= minY - tolerance && y <= maxY + tolerance;
        
        if (nearTop || nearBottom || nearLeft || nearRight) {
          return { type: 'shape', id: shape.id };
        }
      } else if (type === 'circle') {
        const cx = (x1 + x2) / 2;
        const cy = (y1 + y2) / 2;
        const r = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1)) / 2;
        const dist = Math.sqrt(Math.pow(x - cx, 2) + Math.pow(y - cy, 2));
        if (Math.abs(dist - r) < tolerance) {
          return { type: 'shape', id: shape.id };
        }
      } else if (type === 'line' || type === 'arrow') {
        const dist = pointToLineDistance({ x, y }, { x: x1, y: y1 }, { x: x2, y: y2 });
        if (dist < tolerance) {
          return { type: 'shape', id: shape.id };
        }
      }
    }
    
    return null;
  };

  // Delete selected annotation
  const deleteSelectedAnnotation = () => {
    if (selectedAnnotationId) {
      saveStateForUndo();
      setAnnotationShapes(prev => prev.filter(s => s.id !== selectedAnnotationId));
      setSelectedAnnotationId(null);
    } else if (selectedTextId) {
      saveStateForUndo();
      setTextAnnotations(prev => prev.filter(t => t.id !== selectedTextId));
      setSelectedTextId(null);
    } else if (selectedMemoId) {
      saveStateForUndo();
      setMemoPointers(prev => prev.filter(m => m.id !== selectedMemoId));
      setSelectedMemoId(null);
    }
  };

  // Add text annotation
  const addTextAnnotation = () => {
    if (!newTextInput.trim()) return;
    
    saveStateForUndo();
    const newAnnotation: TextAnnotation = {
      id: Date.now().toString(),
      text: newTextInput.trim(),
      x: textPosition.x,
      y: textPosition.y,
      color: annotationColor,
      fontSize: textFontSize,
    };
    setTextAnnotations(prev => [...prev, newAnnotation]);
    setNewTextInput('');
    setShowTextModal(false);
    setMode('select');
  };

  // Update existing text annotation
  const updateTextAnnotation = () => {
    if (!editingTextId || !editTextInput.trim()) return;
    
    saveStateForUndo();
    setTextAnnotations(prev => prev.map(t => 
      t.id === editingTextId 
        ? { ...t, text: editTextInput.trim(), fontSize: textFontSize, color: annotationColor }
        : t
    ));
    setEditingTextId(null);
    setEditTextInput('');
    setShowEditTextModal(false);
  };

  // Add memo pointer
  const addMemoPointer = () => {
    if (!pendingMemoPointer) return;
    
    saveStateForUndo();
    const newMemo: MemoPointer = {
      id: Date.now().toString(),
      x1: pendingMemoPointer.x1,
      y1: pendingMemoPointer.y1,
      x2: pendingMemoPointer.x2,
      y2: pendingMemoPointer.y2,
      text: memoText,
      color: annotationColor,
    };
    setMemoPointers(prev => [...prev, newMemo]);
    setMemoText('');
    setPendingMemoPointer(null);
    setShowMemoModal(false);
  };

  // Update existing memo annotation
  const updateMemoAnnotation = () => {
    if (!editingMemoId || !editMemoText.trim()) return;
    
    saveStateForUndo();
    setMemoPointers(prev => prev.map(m => 
      m.id === editingMemoId 
        ? { ...m, text: editMemoText.trim(), color: annotationColor }
        : m
    ));
    setEditingMemoId(null);
    setEditMemoText('');
    setShowEditMemoModal(false);
  };

  // === BACKGROUND IMAGE FUNCTIONS ===
  
  // Pick background image from library
  const pickBackgroundImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 0.8,
        base64: true,
      });

      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        const base64Image = asset.base64 
          ? `data:image/jpeg;base64,${asset.base64}`
          : asset.uri;
        
        setBackgroundImage(base64Image);
        
        // Set initial size based on image dimensions
        if (asset.width && asset.height) {
          const maxDim = Math.min(canvasWidth * 0.8, canvasHeight * 0.8);
          const imgRatio = asset.width / asset.height;
          let newWidth, newHeight;
          
          if (imgRatio > 1) {
            newWidth = maxDim;
            newHeight = maxDim / imgRatio;
          } else {
            newHeight = maxDim;
            newWidth = maxDim * imgRatio;
          }
          
          setBgImageSize({ width: newWidth, height: newHeight });
          bgImageOriginalSize.current = { width: newWidth, height: newHeight };
          setBgImagePosition({ x: (canvasWidth - newWidth) / 2, y: (canvasHeight - newHeight) / 2 });
        }
        
        setShowBgImageModal(false);
        setBgImageEditMode(true);
      }
    } catch (error) {
      console.error('Error picking image:', error);
      Alert.alert('Fehler', 'Bild konnte nicht geladen werden');
    }
  };

  // Take photo for background
  const takeBackgroundPhoto = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Berechtigung erforderlich', 'Kamera-Zugriff wird benötigt');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: false,
        quality: 0.8,
        base64: true,
      });

      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        const base64Image = asset.base64 
          ? `data:image/jpeg;base64,${asset.base64}`
          : asset.uri;
        
        setBackgroundImage(base64Image);
        
        if (asset.width && asset.height) {
          const maxDim = Math.min(canvasWidth * 0.8, canvasHeight * 0.8);
          const imgRatio = asset.width / asset.height;
          let newWidth, newHeight;
          
          if (imgRatio > 1) {
            newWidth = maxDim;
            newHeight = maxDim / imgRatio;
          } else {
            newHeight = maxDim;
            newWidth = maxDim * imgRatio;
          }
          
          setBgImageSize({ width: newWidth, height: newHeight });
          bgImageOriginalSize.current = { width: newWidth, height: newHeight };
          setBgImagePosition({ x: (canvasWidth - newWidth) / 2, y: (canvasHeight - newHeight) / 2 });
        }
        
        setShowBgImageModal(false);
        setBgImageEditMode(true);
      }
    } catch (error) {
      console.error('Error taking photo:', error);
      Alert.alert('Fehler', 'Foto konnte nicht aufgenommen werden');
    }
  };

  // Remove background image
  const removeBackgroundImage = () => {
    setBackgroundImage(null);
  };

  // Load project photos
  const loadProjectPhotos = async () => {
    try {
      // Use the projectId state variable (from params.projectId)
      if (projectId) {
        const { PhotoService } = await import('@/services/LocalStorage');
        const photos = await PhotoService.getByProjectId(projectId);
        
        console.log('Raw photos loaded:', photos.length);
        if (photos.length > 0) {
          console.log('First photo keys:', Object.keys(photos[0]));
        }
        
        // Map photos - photos might have uri in different properties depending on how they were saved
        // Check: image_data (from camera), uri, photoUri, or base64 data
        const mappedPhotos = photos.map((p: any) => {
          const photoUri = p.image_data || p.uri || p.photoUri || p.base64;
          console.log('Photo', p.id, 'has URI:', photoUri ? 'YES (' + photoUri.substring(0, 30) + '...)' : 'NO');
          return { 
            id: p.id, 
            uri: photoUri
          };
        });
        
        setProjectPhotos(mappedPhotos);
      }
    } catch (error) {
      console.error('Error loading project photos:', error);
    }
  };

  // Use project photo as background (now as reference image)
  const useProjectPhotoAsBackground = (photoUri: string) => {
    setBackgroundImage(photoUri);
    setShowBgImageModal(false);
  };

  // Load project photos when modal opens
  useEffect(() => {
    if (showBgImageModal) {
      loadProjectPhotos();
    }
  }, [showBgImageModal]);

  // Handle zoom
  const handleZoom = (delta: number) => {
    setZoomLevel(prev => {
      const newZoom = Math.max(0.25, Math.min(4, prev + delta));
      return newZoom;
    });
  };

  // Reset zoom and pan
  const resetView = () => {
    setZoomLevel(1);
    setPanOffset({ x: 0, y: 0 });
  };

  // Generate PDF and share
  const exportToPdf = async () => {
    if (isExportingPdf) return;
    setIsExportingPdf(true);
    
    try {
      // Calculate totals
      const mainAreas = polygons.filter(p => p.type === 'main');
      const deductionAreas = polygons.filter(p => p.type === 'deduction');
      const grossArea = mainAreas.reduce((sum, p) => sum + calculatePolygonArea(p.points), 0);
      const deductionsTotal = deductionAreas.reduce((sum, p) => sum + calculatePolygonArea(p.points), 0);
      const netArea = grossArea - deductionsTotal;
      
      // Get current date
      const today = new Date();
      const dateStr = today.toLocaleDateString('de-DE', { 
        day: '2-digit', 
        month: '2-digit', 
        year: 'numeric' 
      });
      
      // Generate HTML for PDF
      const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { 
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              padding: 40px;
              color: #333;
            }
            .header { 
              display: flex; 
              justify-content: space-between; 
              align-items: flex-start;
              margin-bottom: 30px;
              padding-bottom: 15px;
              border-bottom: 2px solid #4CAF50;
            }
            .title { font-size: 24px; font-weight: bold; color: #333; }
            .subtitle { font-size: 14px; color: #666; margin-top: 5px; }
            .date { font-size: 12px; color: #888; }
            
            .result-box {
              background: linear-gradient(135deg, #e8f5e9 0%, #c8e6c9 100%);
              border-radius: 12px;
              padding: 20px;
              margin-bottom: 25px;
              text-align: center;
            }
            .result-label { font-size: 14px; color: #666; text-transform: uppercase; letter-spacing: 1px; }
            .result-value { font-size: 42px; font-weight: bold; color: #2e7d32; margin: 10px 0; }
            .result-unit { font-size: 18px; color: #4CAF50; }
            
            .calculation {
              background: #f5f5f5;
              border-radius: 8px;
              padding: 15px;
              margin-bottom: 25px;
              font-family: monospace;
              font-size: 14px;
            }
            .calc-row { margin: 5px 0; }
            .calc-line { border-top: 1px solid #333; margin: 10px 0; }
            .calc-result { font-weight: bold; color: #1976d2; }
            
            .section { margin-bottom: 25px; }
            .section-title { 
              font-size: 16px; 
              font-weight: bold; 
              color: #333; 
              margin-bottom: 12px;
              padding-bottom: 5px;
              border-bottom: 1px solid #ddd;
            }
            
            .area-card {
              background: #fff;
              border: 1px solid #e0e0e0;
              border-radius: 8px;
              padding: 12px;
              margin-bottom: 10px;
              border-left: 4px solid #4CAF50;
            }
            .area-card.deduction { border-left-color: #f44336; }
            .area-header { display: flex; justify-content: space-between; }
            .area-name { font-weight: 600; }
            .area-value { font-weight: bold; }
            .area-value.green { color: #4CAF50; }
            .area-value.red { color: #f44336; }
            
            .line-item { 
              display: flex; 
              justify-content: space-between; 
              padding: 5px 0;
              font-size: 13px;
            }
            .line-category { 
              display: flex; 
              align-items: center; 
            }
            .color-dot {
              width: 10px;
              height: 10px;
              border-radius: 50%;
              margin-right: 8px;
            }
            .line-breakdown {
              font-size: 11px;
              color: #888;
              margin-left: 18px;
              padding-top: 2px;
            }
            
            .footer {
              margin-top: 40px;
              padding-top: 15px;
              border-top: 1px solid #ddd;
              font-size: 10px;
              color: #888;
              text-align: center;
            }
          </style>
        </head>
        <body>
          <div class="header">
            <div>
              <div class="title">${name || 'Flächenberechnung'}</div>
              <div class="subtitle">Aufmaß-Dokumentation</div>
            </div>
            <div class="date">${dateStr}</div>
          </div>
          
          <div class="result-box">
            <div class="result-label">Netto-Fläche</div>
            <div class="result-value">${netArea.toFixed(2)}</div>
            <div class="result-unit">m²</div>
          </div>
          
          <div class="calculation">
            <div class="calc-row">Brutto-Fläche: ${grossArea.toFixed(2)} m²</div>
            ${deductionsTotal > 0 ? `<div class="calc-row">− Abzüge: ${deductionsTotal.toFixed(2)} m²</div>` : ''}
            <div class="calc-line"></div>
            <div class="calc-row calc-result">= Netto: ${netArea.toFixed(2)} m²</div>
          </div>
          
          ${mainAreas.length > 0 ? `
          <div class="section">
            <div class="section-title">Grundflächen</div>
            ${mainAreas.map(polygon => {
              const area = calculatePolygonArea(polygon.points);
              const polygonLines = lines.filter(l => l.polygonId === polygon.id);
              const categoryGroups: { [key: string]: number[] } = {};
              polygonLines.forEach(line => {
                if (polygon.points.length > line.pointIndex) {
                  const point = polygon.points[line.pointIndex];
                  const nextPoint = polygon.points[(line.pointIndex + 1) % polygon.points.length];
                  const length = calculateLineLength(point, nextPoint);
                  if (length > 0.01) {
                    if (!categoryGroups[line.category]) categoryGroups[line.category] = [];
                    categoryGroups[line.category].push(length);
                  }
                }
              });
              return `
              <div class="area-card">
                <div class="area-header">
                  <span class="area-name">${polygon.name}</span>
                  <span class="area-value green">+${area.toFixed(2)} m²</span>
                </div>
                ${Object.entries(categoryGroups).map(([cat, lengths]) => {
                  const total = lengths.reduce((s, l) => s + l, 0);
                  return `
                  <div class="line-item">
                    <span class="line-category">
                      <span class="color-dot" style="background: ${getCategoryColor(cat)};"></span>
                      ${cat}
                    </span>
                    <span>${total.toFixed(2)} m</span>
                  </div>
                  ${lengths.length > 1 ? `<div class="line-breakdown">${lengths.map(l => l.toFixed(2)).join(' + ')} = ${total.toFixed(2)} m</div>` : ''}
                  `;
                }).join('')}
              </div>
              `;
            }).join('')}
          </div>
          ` : ''}
          
          ${deductionAreas.length > 0 ? `
          <div class="section">
            <div class="section-title">Abzugsflächen</div>
            ${deductionAreas.map(polygon => {
              const area = calculatePolygonArea(polygon.points);
              const polygonLines = lines.filter(l => l.polygonId === polygon.id);
              const categoryGroups: { [key: string]: number[] } = {};
              polygonLines.forEach(line => {
                if (polygon.points.length > line.pointIndex) {
                  const point = polygon.points[line.pointIndex];
                  const nextPoint = polygon.points[(line.pointIndex + 1) % polygon.points.length];
                  const length = calculateLineLength(point, nextPoint);
                  if (length > 0.01) {
                    if (!categoryGroups[line.category]) categoryGroups[line.category] = [];
                    categoryGroups[line.category].push(length);
                  }
                }
              });
              return `
              <div class="area-card deduction">
                <div class="area-header">
                  <span class="area-name">${polygon.name}</span>
                  <span class="area-value red">-${area.toFixed(2)} m²</span>
                </div>
                ${Object.entries(categoryGroups).map(([cat, lengths]) => {
                  const total = lengths.reduce((s, l) => s + l, 0);
                  return `
                  <div class="line-item">
                    <span class="line-category">
                      <span class="color-dot" style="background: ${getCategoryColor(cat)};"></span>
                      ${cat}
                    </span>
                    <span>${total.toFixed(2)} m</span>
                  </div>
                  ${lengths.length > 1 ? `<div class="line-breakdown">${lengths.map(l => l.toFixed(2)).join(' + ')} = ${total.toFixed(2)} m</div>` : ''}
                  `;
                }).join('')}
              </div>
              `;
            }).join('')}
          </div>
          ` : ''}
          
          ${Object.keys(results.linesByCategory).length > 0 ? `
          <div class="section">
            <div class="section-title">Linien Gesamt</div>
            ${Object.entries(results.linesByCategory).map(([category, totalLength]) => {
              const categoryLines = lines.filter(l => l.category === category);
              const individualLengths: number[] = [];
              categoryLines.forEach(line => {
                const polygon = polygons.find(p => p.id === line.polygonId);
                if (polygon && polygon.points.length > line.pointIndex) {
                  const point = polygon.points[line.pointIndex];
                  const nextPoint = polygon.points[(line.pointIndex + 1) % polygon.points.length];
                  const length = calculateLineLength(point, nextPoint);
                  if (length > 0.01) individualLengths.push(length);
                }
              });
              const displayName = formatCategoryWithShortcut(category);
              return `
              <div class="line-item">
                <span class="line-category">
                  <span class="color-dot" style="background: ${getCategoryColor(category)};"></span>
                  ${displayName}
                </span>
                <span>${(totalLength as number).toFixed(2)} m</span>
              </div>
              ${individualLengths.length > 1 ? `<div class="line-breakdown">${individualLengths.map(l => l.toFixed(2)).join(' + ')} = ${(totalLength as number).toFixed(2)} m</div>` : ''}
              `;
            }).join('')}
          </div>
          ` : ''}
          
          <div class="footer">
            Erstellt mit AufmassProfi • ${dateStr}
          </div>
        </body>
        </html>
      `;
      
      // Create PDF
      const { uri } = await Print.printToFileAsync({
        html: htmlContent,
        width: 595,
        height: 842,
      });
      
      // Share PDF
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: 'application/pdf',
          UTI: 'com.adobe.pdf',
        });
      } else {
        Alert.alert('Fehler', 'Teilen nicht verfügbar');
      }
      
    } catch (error) {
      console.error('PDF Export error:', error);
      Alert.alert('Fehler', 'PDF konnte nicht erstellt werden');
    } finally {
      setIsExportingPdf(false);
    }
  };

  // Transform touch coordinates based on zoom and pan
  const transformCoordinates = (x: number, y: number): { x: number; y: number } => {
    return {
      x: (x - panOffset.x) / zoomLevel,
      y: (y - panOffset.y) / zoomLevel,
    };
  };

  // Render grid
  const renderGrid = () => {
    if (!gridEnabled) return null;
    
    const gridPixelSize = gridSize * scale;
    const lines = [];
    
    // Vertical lines
    for (let x = 0; x < canvasWidth; x += gridPixelSize) {
      lines.push(
        <Line
          key={`v-${x}`}
          x1={x}
          y1={0}
          x2={x}
          y2={canvasHeight}
          stroke="#e0e0e0"
          strokeWidth={0.5}
        />
      );
    }
    
    // Horizontal lines
    for (let y = 0; y < canvasHeight; y += gridPixelSize) {
      lines.push(
        <Line
          key={`h-${y}`}
          x1={0}
          y1={y}
          x2={canvasWidth}
          y2={y}
          stroke="#e0e0e0"
          strokeWidth={0.5}
        />
      );
    }
    
    return lines;
  };

  // Results calculation
  const results = calculateResults();

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handleBackWithSave} style={styles.headerButton}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setShowNameModal(true)} style={styles.titleContainer}>
          <Text style={styles.headerTitle} numberOfLines={1}>{name}</Text>
          <Ionicons name="pencil" size={14} color="#fff" style={{ marginLeft: 6 }} />
        </TouchableOpacity>
        
        {/* Undo/Redo Buttons */}
        <TouchableOpacity 
          onPress={undo} 
          style={styles.headerButton} 
          disabled={undoStack.length === 0}
        >
          <Ionicons name="arrow-undo" size={22} color={undoStack.length > 0 ? '#fff' : '#888'} />
        </TouchableOpacity>
        <TouchableOpacity 
          onPress={redo} 
          style={styles.headerButton}
          disabled={redoStack.length === 0}
        >
          <Ionicons name="arrow-redo" size={22} color={redoStack.length > 0 ? '#fff' : '#888'} />
        </TouchableOpacity>
        
        {/* Voreinstellungen Button */}
        <TouchableOpacity onPress={() => setShowSettingsMenu(true)} style={styles.headerButton}>
          <Ionicons name="settings-outline" size={22} color="#fff" />
        </TouchableOpacity>
        
        <TouchableOpacity onPress={() => setShowCalculatorModal(true)} style={styles.headerButton}>
          <Ionicons name="calculator" size={22} color="#fff" />
        </TouchableOpacity>
        <TouchableOpacity onPress={saveCalculation} style={styles.headerButton} disabled={saving}>
          <Ionicons name="checkmark" size={24} color={saving ? '#888' : '#fff'} />
        </TouchableOpacity>
      </View>

      {/* Toolbar - Neu organisiert mit Spalten */}
      <View style={styles.toolbar}>
        {/* Spalte 1: Konstruktion */}
        <View style={styles.toolbarSection}>
          <Text style={styles.toolbarSectionTitle}>Konstruktion</Text>
          <View style={styles.toolbarSectionButtons}>
            <TouchableOpacity
              style={[styles.toolButton, mode === 'select' && styles.toolButtonActive, { backgroundColor: mode === 'select' ? '#2196F3' : '#f5f5f5' }]}
              onPress={() => { selectMode('select'); setCurrentPoints([]); }}
            >
              <Ionicons name="hand-left" size={18} color={mode === 'select' ? '#fff' : '#2196F3'} />
              <Text style={[styles.toolLabel, mode === 'select' && styles.toolLabelActive]}>Auswahl</Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[styles.toolButton, mode === 'scale' && styles.toolButtonActive]}
              onPress={() => { 
                selectMode('scale'); 
                setCurrentPoints([]); 
                setScaleReference({ startPoint: null, endPoint: null, realLength: 1 });
              }}
            >
              <ScaleIcon size={18} color={mode === 'scale' ? '#fff' : '#666'} />
              <Text style={[styles.toolLabel, mode === 'scale' && styles.toolLabelActive]}>Maßstab</Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[styles.toolButtonLarge, mode === 'polygon' && styles.toolButtonActive, { backgroundColor: mode === 'polygon' ? '#4CAF50' : '#f5f5f5' }]}
              onPress={() => { selectMode('polygon'); setCurrentPoints([]); }}
            >
              <AreaIcon size={20} color={mode === 'polygon' ? '#fff' : '#4CAF50'} />
              <Text style={[styles.toolLabel, mode === 'polygon' && styles.toolLabelActive, { fontSize: 7 }]}>Fläche/Poly</Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[styles.toolButtonLarge, (snapToAngles || fixedAngle !== null || fixedLength !== '') && styles.toolButtonActive, { backgroundColor: (fixedAngle !== null || fixedLength !== '') ? '#4CAF50' : (snapToAngles ? '#4CAF50' : '#f5f5f5') }]}
              onPress={() => {
                // Automatisch Polygon-Modus aktivieren
                if (mode !== 'polygon') {
                  setMode('polygon');
                  setCurrentPoints([]);
                }
                setShowAngleModal(true);
              }}
            >
              <AngleIcon size={20} color={(snapToAngles || fixedAngle !== null || fixedLength !== '') ? '#fff' : '#4CAF50'} />
              <Text style={[styles.toolLabel, (snapToAngles || fixedAngle !== null || fixedLength !== '') && styles.toolLabelActive, { fontSize: 7 }]}>Fläche/Winkel</Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[styles.toolButton, addPointMode && styles.toolButtonActive, { backgroundColor: addPointMode ? '#E91E63' : '#f5f5f5' }]}
              onPress={() => {
                setAddPointMode(!addPointMode);
                setDeletePointMode(false);
              }}
            >
              <Ionicons name="add-outline" size={18} color={addPointMode ? '#fff' : '#E91E63'} />
              <Text style={[styles.toolLabel, addPointMode && styles.toolLabelActive]}>+Punkt</Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[styles.toolButton, deletePointMode && styles.toolButtonActive, { backgroundColor: deletePointMode ? '#f44336' : '#f5f5f5' }]}
              onPress={() => {
                setDeletePointMode(!deletePointMode);
                setAddPointMode(false);
              }}
            >
              <Ionicons name="remove-outline" size={18} color={deletePointMode ? '#fff' : '#f44336'} />
              <Text style={[styles.toolLabel, deletePointMode && styles.toolLabelActive]}>-Punkt</Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[styles.toolButtonLarge, mode === 'deduction' && styles.toolButtonActive, { backgroundColor: mode === 'deduction' ? '#f44336' : '#f5f5f5' }]}
              onPress={() => { selectMode('deduction'); setCurrentPoints([]); }}
            >
              <DeductionAreaIcon size={20} color={mode === 'deduction' ? '#fff' : '#f44336'} />
              <Text style={[styles.toolLabel, mode === 'deduction' && styles.toolLabelActive, { fontSize: 7 }]}>Abzug Fläche</Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[styles.toolButton, mode === 'deduction_rect' && styles.toolButtonActive, { backgroundColor: mode === 'deduction_rect' ? '#f44336' : '#f5f5f5' }]}
              onPress={() => { selectMode('deduction_rect'); setCurrentPoints([]); setDeductionRectStart(null); setDeductionRectEnd(null); }}
            >
              <DeductionRectIcon size={18} color={mode === 'deduction_rect' ? '#fff' : '#f44336'} />
              <Text style={[styles.toolLabel, mode === 'deduction_rect' && styles.toolLabelActive, { fontSize: 6 }]}>Abzug Rechteck</Text>
            </TouchableOpacity>
          </View>
        </View>
        
        <View style={styles.toolSeparator} />
        
        {/* Spalte 2: Hilfslinien */}
        <View style={styles.toolbarSection}>
          <Text style={styles.toolbarSectionTitle}>Hilfslinien</Text>
          <View style={styles.toolbarSectionButtons}>
            <TouchableOpacity
              style={[styles.toolButton, mode === 'guideline' && styles.toolButtonActive, { backgroundColor: mode === 'guideline' ? '#FF9800' : '#f5f5f5' }]}
              onPress={() => { selectMode('guideline'); setCurrentPoints([]); }}
            >
              <Ionicons name="analytics-outline" size={18} color={mode === 'guideline' ? '#fff' : '#FF9800'} />
              <Text style={[styles.toolLabel, mode === 'guideline' && styles.toolLabelActive]}>Hilfslinie</Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[styles.toolButton, mode === 'parallel' && styles.toolButtonActive, { backgroundColor: mode === 'parallel' ? '#9C27B0' : '#f5f5f5' }]}
              onPress={() => { selectMode('parallel'); setCurrentPoints([]); }}
            >
              <Ionicons name="reorder-two-outline" size={18} color={mode === 'parallel' ? '#fff' : '#9C27B0'} />
              <Text style={[styles.toolLabel, mode === 'parallel' && styles.toolLabelActive]}>Parallel</Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[styles.toolButtonLarge, guideLinesVisible && guideLines.length > 0 && styles.toolButtonActive]}
              onPress={() => setGuideLinesVisible(!guideLinesVisible)}
            >
              <Ionicons name={guideLinesVisible ? "eye-outline" : "eye-off-outline"} size={18} color={guideLinesVisible ? (guideLines.length > 0 ? '#fff' : '#666') : '#999'} />
              <Text style={[styles.toolLabel, guideLinesVisible && guideLines.length > 0 && styles.toolLabelActive, { fontSize: 7 }]}>
                Hilfslinien {guideLines.length > 0 ? `(${guideLines.length})` : ''}
              </Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[styles.toolButton, gridEnabled && styles.toolButtonActive]}
              onPress={() => setGridEnabled(!gridEnabled)}
              onLongPress={() => setShowGridSizeModal(true)}
            >
              <Ionicons name="grid-outline" size={18} color={gridEnabled ? '#fff' : '#666'} />
              <Text style={[styles.toolLabel, gridEnabled && styles.toolLabelActive]}>
                {gridSize < 1 ? `${(gridSize * 100).toFixed(0)}cm` : `${gridSize}m`}
              </Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={styles.toolButton}
              onPress={() => setShowGridSizeModal(true)}
            >
              <Ionicons name="options-outline" size={18} color="#666" />
              <Text style={styles.toolLabel}>Größe</Text>
            </TouchableOpacity>
          </View>
        </View>
        
        <View style={styles.toolSeparator} />
        
        {/* Spalte 3: Ein/Ausblenden */}
        <View style={styles.toolbarSection}>
          <Text style={styles.toolbarSectionTitle}>Ein/Ausblenden</Text>
          <View style={styles.toolbarSectionButtons}>
            <TouchableOpacity
              style={[styles.toolButton, useManualAreaCalc && styles.toolButtonActive, { backgroundColor: useManualAreaCalc ? '#FF9800' : '#f5f5f5' }]}
              onPress={() => setUseManualAreaCalc(!useManualAreaCalc)}
            >
              <View style={{ alignItems: 'center' }}>
                <Ionicons name={useManualAreaCalc ? "eye-outline" : "eye-off-outline"} size={10} color={useManualAreaCalc ? '#fff' : '#FF9800'} />
                <Ionicons name="calculator-outline" size={14} color={useManualAreaCalc ? '#fff' : '#FF9800'} />
              </View>
              <Text style={[styles.toolLabel, useManualAreaCalc && styles.toolLabelActive]}>Manuell</Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[styles.toolButton, showEdgeLengths && styles.toolButtonActive]}
              onPress={() => setShowEdgeLengths(!showEdgeLengths)}
            >
              <Ionicons name="code-working-outline" size={18} color={showEdgeLengths ? '#fff' : '#666'} />
              <Text style={[styles.toolLabel, showEdgeLengths && styles.toolLabelActive]}>Maße</Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[styles.toolButton, showPolygonAngles && styles.toolButtonActive]}
              onPress={() => setShowPolygonAngles(!showPolygonAngles)}
            >
              <Ionicons name="triangle-outline" size={18} color={showPolygonAngles ? '#fff' : '#666'} />
              <Text style={[styles.toolLabel, showPolygonAngles && styles.toolLabelActive]}>Winkel</Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={styles.toolButton}
              onPress={resetView}
            >
              <Ionicons name="scan-outline" size={18} color="#666" />
              <Text style={styles.toolLabel}>{Math.round(zoomLevel * 100)}%</Text>
            </TouchableOpacity>
          </View>
        </View>
        
        <View style={styles.toolSeparator} />
        
        {/* Spalte 4: Elemente */}
        <View style={styles.toolbarSection}>
          <Text style={styles.toolbarSectionTitle}>Elemente</Text>
          <View style={styles.toolbarSectionButtons}>
            <TouchableOpacity
              style={[styles.toolButton, mode === 'annotation_text' && styles.toolButtonActive, { backgroundColor: mode === 'annotation_text' ? '#E91E63' : '#f5f5f5' }]}
              onPress={() => { selectMode('annotation_text'); setCurrentPoints([]); }}
            >
              <Ionicons name="text-outline" size={18} color={mode === 'annotation_text' ? '#fff' : '#E91E63'} />
              <Text style={[styles.toolLabel, mode === 'annotation_text' && styles.toolLabelActive]}>Text</Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[styles.toolButton, mode === 'annotation_memo' && styles.toolButtonActive, { backgroundColor: mode === 'annotation_memo' ? '#FF5722' : '#f5f5f5' }]}
              onPress={() => { selectMode('annotation_memo'); setCurrentPoints([]); setPendingMemoPointer(null); }}
            >
              <Ionicons name="chatbox-outline" size={18} color={mode === 'annotation_memo' ? '#fff' : '#FF5722'} />
              <Text style={[styles.toolLabel, mode === 'annotation_memo' && styles.toolLabelActive]}>Notiz</Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[styles.toolButton, (mode === 'annotation_rect' || mode === 'annotation_circle' || mode === 'annotation_arrow' || mode === 'annotation_line') && styles.toolButtonActive, { backgroundColor: (mode === 'annotation_rect' || mode === 'annotation_circle' || mode === 'annotation_arrow' || mode === 'annotation_line') ? '#673AB7' : '#f5f5f5' }]}
              onPress={() => setShowShapesModal(true)}
            >
              <Ionicons name="ellipse-outline" size={18} color={(mode === 'annotation_rect' || mode === 'annotation_circle' || mode === 'annotation_arrow' || mode === 'annotation_line') ? '#fff' : '#673AB7'} />
              <Text style={[styles.toolLabel, (mode === 'annotation_rect' || mode === 'annotation_circle' || mode === 'annotation_arrow' || mode === 'annotation_line') && styles.toolLabelActive]}>Formen</Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[styles.toolButton, backgroundImage && { backgroundColor: '#8BC34A' }]}
              onPress={() => setShowBgImageModal(true)}
            >
              <Ionicons name="image-outline" size={18} color={backgroundImage ? '#fff' : '#8BC34A'} />
              <Text style={[styles.toolLabel, backgroundImage && { color: '#fff' }]}>Bild</Text>
            </TouchableOpacity>
          </View>
        </View>
        
        {/* Kontextuelle Buttons (erscheinen nur wenn benötigt) */}
        {/* Delete selected annotation */}
        {(selectedAnnotationId || selectedTextId || selectedMemoId) && (
          <>
            <View style={styles.toolSeparator} />
            {/* Edit button for shapes */}
            {selectedAnnotationId && (
              <TouchableOpacity 
                style={[styles.toolButton, { backgroundColor: '#2196F3' }]} 
                onPress={() => {
                  const shape = annotationShapes.find(s => s.id === selectedAnnotationId);
                  if (shape) {
                    setAnnotationColor(shape.color);
                    setAnnotationStrokeWidth(shape.strokeWidth);
                    setShowShapesModal(true);
                  }
                }}
              >
                <Ionicons name="color-palette-outline" size={18} color="#fff" />
                <Text style={[styles.toolLabel, { color: '#fff' }]}>Stil</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity 
              style={[styles.toolButton, { backgroundColor: '#f44336' }]} 
              onPress={deleteSelectedAnnotation}
            >
              <Ionicons name="trash-outline" size={18} color="#fff" />
              <Text style={[styles.toolLabel, { color: '#fff' }]}>Löschen</Text>
            </TouchableOpacity>
          </>
        )}
        
        {currentPoints.length > 0 && (
          <>
            <TouchableOpacity style={styles.toolButton} onPress={undoLastPoint}>
              <Ionicons name="arrow-undo" size={20} color="#666" />
              <Text style={styles.toolLabel}>Zurück</Text>
            </TouchableOpacity>
            
            <TouchableOpacity style={[styles.toolButton, { backgroundColor: '#f44336' }]} onPress={cancelCurrentPolygon}>
              <Ionicons name="close" size={20} color="#fff" />
              <Text style={[styles.toolLabel, { color: '#fff' }]}>Abbruch</Text>
            </TouchableOpacity>
          </>
        )}
        
        {selectedPolygonId && mode === 'select' && (
          <>
            {/* Show "Einpassen" button if this is a deduction polygon */}
            {polygons.find(p => p.id === selectedPolygonId)?.type === 'deduction' && (
              <TouchableOpacity 
                style={[styles.toolButton, { backgroundColor: '#ff9800' }]} 
                onPress={() => {
                  const deduction = polygons.find(p => p.id === selectedPolygonId);
                  if (!deduction) return;
                  
                  // Find all main polygons that this deduction intersects with
                  const mainPolygons = polygons.filter(p => {
                    if (p.type !== 'main') return false;
                    // Check if any edge of the deduction intersects with any edge of the main polygon
                    for (let i = 0; i < deduction.points.length; i++) {
                      const d1 = deduction.points[i];
                      const d2 = deduction.points[(i + 1) % deduction.points.length];
                      for (let j = 0; j < p.points.length; j++) {
                        const m1 = p.points[j];
                        const m2 = p.points[(j + 1) % p.points.length];
                        if (getLineSegmentIntersection(d1, d2, m1, m2)) {
                          return true;
                        }
                      }
                    }
                    return false;
                  });
                  
                  if (mainPolygons.length === 0) {
                    Alert.alert('Hinweis', 'Die Abzugsfläche schneidet keine Hauptfläche.');
                    return;
                  }
                  
                  saveStateForUndo();
                  
                  // Insert intersection points into all affected main polygons
                  // WITHOUT modifying the deduction polygon
                  const updatedMainPolygons = insertDeductionIntersections(deduction, mainPolygons);
                  
                  // Build new polygon list - keep deduction unchanged
                  const otherPolygons = polygons.filter(p => !mainPolygons.some(mp => mp.id === p.id));
                  setPolygons([...updatedMainPolygons, ...otherPolygons]);
                  
                  Alert.alert('Fertig', 'Schnittpunkte wurden in die Hauptfläche(n) eingefügt.');
                }}
              >
                <Ionicons name="git-branch" size={20} color="#fff" />
                <Text style={[styles.toolLabel, { color: '#fff' }]}>Schnitt</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={[styles.toolButton, { backgroundColor: '#f44336' }]} onPress={deleteSelectedPolygon}>
              <Ionicons name="trash" size={20} color="#fff" />
              <Text style={[styles.toolLabel, { color: '#fff' }]}>Löschen</Text>
            </TouchableOpacity>
          </>
        )}
        
        {selectedGuideLineId && mode === 'select' && (
          <>
            <TouchableOpacity 
              style={[styles.toolButton, { backgroundColor: '#2196F3' }]} 
              onPress={() => duplicateGuideLine(selectedGuideLineId)}
            >
              <Ionicons name="copy" size={20} color="#fff" />
              <Text style={[styles.toolLabel, { color: '#fff' }]}>Kopie</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={[styles.toolButton, { backgroundColor: '#4CAF50' }]} 
              onPress={() => extendGuideLineToEdges(selectedGuideLineId)}
            >
              <Ionicons name="expand" size={20} color="#fff" />
              <Text style={[styles.toolLabel, { color: '#fff' }]}>Rand</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={[styles.toolButton, { backgroundColor: '#f44336' }]} 
              onPress={() => deleteGuideLine(selectedGuideLineId)}
            >
              <Ionicons name="trash" size={20} color="#fff" />
              <Text style={[styles.toolLabel, { color: '#fff' }]}>Löschen</Text>
            </TouchableOpacity>
          </>
        )}
        
        {guideLines.length > 0 && mode === 'select' && !selectedGuideLineId && (
          <TouchableOpacity 
            style={[styles.toolButton, { backgroundColor: '#ff5722' }]} 
            onPress={deleteAllGuideLines}
          >
            <Ionicons name="trash-bin" size={20} color="#fff" />
            <Text style={[styles.toolLabel, { color: '#fff' }]}>Alle HL</Text>
          </TouchableOpacity>
        )}
        
        {/* Dimension line selected */}
        {selectedDimensionId && mode === 'select' && (
          <>
            <TouchableOpacity 
              style={[styles.toolButton, { backgroundColor: '#9C27B0' }]} 
              onPress={() => {
                const dim = dimensionLines.find(d => d.id === selectedDimensionId);
                if (dim) {
                  const currentLength = dim.customLength ?? calculateLineLength(dim.start, dim.end);
                  setEditingMeasurement({ type: 'dimension', id: dim.id, currentValue: currentLength });
                  setMeasurementInputValue(currentLength.toFixed(2));
                  setShowMeasurementModal(true);
                }
              }}
            >
              <Ionicons name="create" size={20} color="#fff" />
              <Text style={[styles.toolLabel, { color: '#fff' }]}>Bearbeiten</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={[styles.toolButton, { backgroundColor: '#f44336' }]} 
              onPress={() => deleteDimensionLine(selectedDimensionId)}
            >
              <Ionicons name="trash" size={20} color="#fff" />
              <Text style={[styles.toolLabel, { color: '#fff' }]}>Löschen</Text>
            </TouchableOpacity>
          </>
        )}
      </View>

      {/* Canvas */}
      <View 
        style={styles.canvas}
        onTouchStart={(event) => {
          const touch = event.nativeEvent;
          // Transform coordinates based on zoom/pan
          const rawX = touch.locationX;
          const rawY = touch.locationY;
          const transformed = transformCoordinates(rawX, rawY);
          const x = transformed.x;
          const y = transformed.y;
          
          // Check for resizing selected rectangle deduction polygons
          if (mode === 'select' && selectedPolygonId) {
            const selectedPoly = polygons.find(p => p.id === selectedPolygonId);
            if (selectedPoly && selectedPoly.type === 'deduction' && isPolygonRectangle(selectedPoly)) {
              const bounds = getRectangleBounds(selectedPoly);
              const handleRadius = 15;
              
              const corners = {
                nw: { x: bounds.minX, y: bounds.minY },
                ne: { x: bounds.maxX, y: bounds.minY },
                sw: { x: bounds.minX, y: bounds.maxY },
                se: { x: bounds.maxX, y: bounds.maxY },
              };
              
              for (const [corner, pos] of Object.entries(corners)) {
                if (Math.sqrt(Math.pow(x - pos.x, 2) + Math.pow(y - pos.y, 2)) < handleRadius) {
                  saveStateForUndo();
                  setResizingDeductionRect({ polygonId: selectedPolygonId, handle: corner as 'nw' | 'ne' | 'sw' | 'se' });
                  deductionRectOriginal.current = bounds;
                  return;
                }
              }
            }
          }
          
          // "Punkt auf Linie" mode - only on selected polygon
          if (addPointMode && mode === 'select') {
            if (!selectedPolygonId) {
              Alert.alert('Hinweis', 'Bitte wählen Sie zuerst ein Polygon aus.');
              return;
            }
            const linePoint = findClosestPointOnPolygonLine(x, y);
            if (linePoint) {
              addPointToPolygonLine(linePoint.polygonId, linePoint.lineIndex, linePoint.point);
            }
            return;
          }
          
          // "Punkt löschen" mode - only on selected polygon
          if (deletePointMode && mode === 'select') {
            if (!selectedPolygonId) {
              Alert.alert('Hinweis', 'Bitte wählen Sie zuerst ein Polygon aus.');
              return;
            }
            const polygonPoint = findPolygonPointAtPosition(x, y, true);
            if (polygonPoint) {
              deletePolygonPoint(polygonPoint.polygonId, polygonPoint.pointIndex);
            }
            return;
          }
          
          // Check if touching a polygon point for dragging
          if (mode === 'select' && !addPointMode) {
            const polygonPoint = findPolygonPointAtPosition(x, y);
            if (polygonPoint) {
              saveStateForUndo();
              setDraggingPolygonPoint(polygonPoint);
              setSelectedPolygonId(polygonPoint.polygonId);
              setCurrentTouchPosition({ x, y }); // For live length display
              return;
            }
          }
          
          // Check if touching polygon center for moving whole polygon
          if (mode === 'select' && !addPointMode && selectedPolygonId) {
            const polygon = polygons.find(p => p.id === selectedPolygonId);
            if (polygon) {
              const centerX = polygon.points.reduce((sum, p) => sum + p.x, 0) / polygon.points.length;
              const centerY = polygon.points.reduce((sum, p) => sum + p.y, 0) / polygon.points.length;
              const distToCenter = Math.sqrt(Math.pow(x - centerX, 2) + Math.pow(y - centerY, 2));
              
              // If touch is near center (move handle), start dragging whole polygon
              if (distToCenter < 25) {
                saveStateForUndo();
                setDraggingWholePolygon({ polygonId: polygon.id, startPos: { x, y } });
                return;
              }
            }
          }
          
          // Check if touching a label for dragging
          if (mode === 'select') {
            for (const polygon of polygons) {
              const centerX = polygon.points.reduce((sum, p) => sum + p.x, 0) / polygon.points.length;
              const centerY = polygon.points.reduce((sum, p) => sum + p.y, 0) / polygon.points.length;
              const offset = labelOffsets[polygon.id] || { x: 0, y: 0 };
              const labelX = centerX + offset.x;
              const labelY = centerY + offset.y;
              
              // Check if touch is on label (approximate box)
              if (Math.abs(x - labelX) < 55 && Math.abs(y - labelY) < 35) {
                setDraggingLabel(polygon.id);
                return;
              }
            }
          }
          
          // Check if touching a guide line point for dragging
          if (mode === 'select' && guideLinesVisible) {
            const guidePoint = findGuideLinePointAtPosition(x, y);
            if (guidePoint) {
              saveStateForUndo(); // Save state before dragging
              setDraggingGuidePoint(guidePoint);
              setSelectedGuideLineId(guidePoint.guideId);
            }
          }
          
          // Check if touching a dimension line point for dragging
          if (mode === 'select') {
            const dimPoint = findDimensionLinePointAtPosition(x, y);
            if (dimPoint) {
              saveStateForUndo();
              setDraggingDimensionPoint(dimPoint);
              setSelectedDimensionId(dimPoint.dimId);
              setSelectedPolygonId(null);
              setSelectedGuideLineId(null);
              return;
            }
            
            // Check if clicking on a dimension line (for selection)
            const clickedDim = findDimensionLineAtPoint(x, y);
            if (clickedDim) {
              setSelectedDimensionId(clickedDim.id);
              setSelectedPolygonId(null);
              setSelectedGuideLineId(null);
              return;
            }
          }
          
          // Check if touching an annotation for dragging/selecting
          if (mode === 'select') {
            // First check if touching a resize handle on selected shape
            if (selectedAnnotationId) {
              const shape = annotationShapes.find(s => s.id === selectedAnnotationId);
              if (shape) {
                const handleRadius = 15; // Touch tolerance for handles
                
                if (shape.type === 'line' || shape.type === 'arrow') {
                  // Check start and end points
                  if (Math.sqrt(Math.pow(x - shape.x1, 2) + Math.pow(y - shape.y1, 2)) < handleRadius) {
                    setResizingShape({ id: shape.id, handle: 'start' });
                    return;
                  }
                  if (Math.sqrt(Math.pow(x - shape.x2, 2) + Math.pow(y - shape.y2, 2)) < handleRadius) {
                    setResizingShape({ id: shape.id, handle: 'end' });
                    return;
                  }
                } else if (shape.type === 'rectangle' || shape.type === 'circle') {
                  // Check corner handles
                  const minX = Math.min(shape.x1, shape.x2);
                  const maxX = Math.max(shape.x1, shape.x2);
                  const minY = Math.min(shape.y1, shape.y2);
                  const maxY = Math.max(shape.y1, shape.y2);
                  
                  if (Math.sqrt(Math.pow(x - minX, 2) + Math.pow(y - minY, 2)) < handleRadius) {
                    setResizingShape({ id: shape.id, handle: 'x1y1' });
                    return;
                  }
                  if (Math.sqrt(Math.pow(x - maxX, 2) + Math.pow(y - minY, 2)) < handleRadius) {
                    setResizingShape({ id: shape.id, handle: 'x2y1' });
                    return;
                  }
                  if (Math.sqrt(Math.pow(x - minX, 2) + Math.pow(y - maxY, 2)) < handleRadius) {
                    setResizingShape({ id: shape.id, handle: 'x1y2' });
                    return;
                  }
                  if (Math.sqrt(Math.pow(x - maxX, 2) + Math.pow(y - maxY, 2)) < handleRadius) {
                    setResizingShape({ id: shape.id, handle: 'x2y2' });
                    return;
                  }
                }
              }
            }
            
            const annotation = findAnnotationAtPosition(x, y);
            if (annotation) {
              saveStateForUndo();
              if (annotation.type === 'shape') {
                const shape = annotationShapes.find(s => s.id === annotation.id);
                if (shape && selectedAnnotationId === annotation.id) {
                  // Already selected - start dragging the whole shape
                  setDraggingAnnotationShape({ id: annotation.id, startX: x, startY: y, origX1: shape.x1, origY1: shape.y1, origX2: shape.x2, origY2: shape.y2 });
                } else {
                  // Just select
                  setSelectedAnnotationId(annotation.id);
                  setSelectedTextId(null);
                  setSelectedMemoId(null);
                }
              } else if (annotation.type === 'text') {
                const text = textAnnotations.find(t => t.id === annotation.id);
                if (text && selectedTextId === annotation.id) {
                  // Already selected - start dragging (edit on release if not moved)
                  setDraggingText({ id: annotation.id, offset: { x: x - text.x, y: y - text.y }, startPos: { x: text.x, y: text.y } });
                } else {
                  // Just select
                  setSelectedTextId(annotation.id);
                  setSelectedAnnotationId(null);
                  setSelectedMemoId(null);
                }
              } else if (annotation.type === 'memo') {
                const memo = memoPointers.find(m => m.id === annotation.id);
                if (memo && selectedMemoId === annotation.id) {
                  // Already selected - start dragging
                  const distToNote = Math.sqrt(Math.pow(x - memo.x1, 2) + Math.pow(y - (memo.y1 - 20), 2));
                  const distToTarget = Math.sqrt(Math.pow(x - memo.x2, 2) + Math.pow(y - memo.y2, 2));
                  const part = distToTarget < distToNote ? 'target' : 'note';
                  const startPos = part === 'note' ? { x: memo.x1, y: memo.y1 } : { x: memo.x2, y: memo.y2 };
                  setDraggingMemo({ id: annotation.id, part, offset: { x: part === 'note' ? x - memo.x1 : x - memo.x2, y: part === 'note' ? y - memo.y1 : y - memo.y2 }, startPos });
                } else {
                  // Just select
                  setSelectedMemoId(annotation.id);
                  setSelectedAnnotationId(null);
                  setSelectedTextId(null);
                }
              }
              return;
            }
          }
          
          // Start drawing deduction rectangle
          if (mode === 'deduction_rect') {
            const snapResult = snapToNearestPoint(x, y);
            setDeductionRectStart(snapResult.point);
            setDeductionRectEnd(snapResult.point);
            setCurrentSnapPoint({ point: snapResult.point, isSnapped: snapResult.snapped });
            return;
          }
          
          // Start drawing annotation shapes
          if (mode === 'annotation_rect' || mode === 'annotation_circle' || mode === 'annotation_arrow' || mode === 'annotation_line') {
            if (!currentAnnotationShape) {
              // Map mode to shape type
              const shapeTypeMap: { [key: string]: 'rectangle' | 'circle' | 'arrow' | 'line' } = {
                'annotation_rect': 'rectangle',
                'annotation_circle': 'circle',
                'annotation_arrow': 'arrow',
                'annotation_line': 'line',
              };
              const shapeType = shapeTypeMap[mode];
              setCurrentAnnotationShape({
                id: Date.now().toString(),
                type: shapeType,
                x1: x,
                y1: y,
                x2: x,
                y2: y,
                color: annotationColor,
                strokeWidth: annotationStrokeWidth,
              });
            }
            return;
          }
        }}
        onTouchMove={(event) => {
          const touches = event.nativeEvent.touches;
          
          // Handle pinch-to-zoom and two-finger pan simultaneously
          if (touches && touches.length === 2) {
            const touch1 = touches[0];
            const touch2 = touches[1];
            
            // Calculate distance between two fingers
            const dx = touch2.pageX - touch1.pageX;
            const dy = touch2.pageY - touch1.pageY;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            // Calculate center point between fingers
            const centerX = (touch1.pageX + touch2.pageX) / 2;
            const centerY = (touch1.pageY + touch2.pageY) / 2;
            
            if (lastPinchDistance.current !== null && lastPinchCenter.current) {
              // 1. Apply panning (how much the center point moved)
              const panDeltaX = centerX - lastPinchCenter.current.x;
              const panDeltaY = centerY - lastPinchCenter.current.y;
              
              // 2. Calculate zoom
              const rawScale = distance / lastPinchDistance.current;
              const newZoom = Math.max(0.25, Math.min(4, zoomLevel * rawScale));
              const zoomChanged = Math.abs(newZoom - zoomLevel) > 0.002;
              
              // Apply pan offset
              let newPanX = panOffset.x + panDeltaX;
              let newPanY = panOffset.y + panDeltaY;
              
              // If zooming, also adjust pan to zoom towards center
              if (zoomChanged) {
                const zoomRatio = newZoom / zoomLevel;
                newPanX = centerX - (centerX - newPanX) * zoomRatio;
                newPanY = centerY - (centerY - newPanY) * zoomRatio;
                setZoomLevel(newZoom);
              }
              
              setPanOffset({ x: newPanX, y: newPanY });
            }
            
            lastPinchDistance.current = distance;
            lastPinchCenter.current = { x: centerX, y: centerY };
            isPinching.current = true;
            return;
          }
          
          // Reset pinch tracking when not using two fingers
          if (isPinching.current && (!touches || touches.length < 2)) {
            lastPinchDistance.current = null;
            lastPinchCenter.current = null;
            isPinching.current = false;
          }
          
          const touch = event.nativeEvent;
          const rawX = touch.locationX;
          const rawY = touch.locationY;
          const transformed = transformCoordinates(rawX, rawY);
          const x = transformed.x;
          const y = transformed.y;
          
          // Resizing deduction rectangle (keeping 90° corners)
          if (resizingDeductionRect) {
            const orig = deductionRectOriginal.current;
            let newBounds = { ...orig };
            
            switch (resizingDeductionRect.handle) {
              case 'se':
                newBounds.maxX = Math.max(orig.minX + 20, x);
                newBounds.maxY = Math.max(orig.minY + 20, y);
                break;
              case 'sw':
                newBounds.minX = Math.min(orig.maxX - 20, x);
                newBounds.maxY = Math.max(orig.minY + 20, y);
                break;
              case 'ne':
                newBounds.maxX = Math.max(orig.minX + 20, x);
                newBounds.minY = Math.min(orig.maxY - 20, y);
                break;
              case 'nw':
                newBounds.minX = Math.min(orig.maxX - 20, x);
                newBounds.minY = Math.min(orig.maxY - 20, y);
                break;
            }
            
            updateRectangleFromBounds(resizingDeductionRect.polygonId, newBounds);
            return;
          }
          
          // Update snap indicator for all polygon/deduction/guideline modes
          if (mode === 'polygon' || mode === 'deduction' || mode === 'guideline') {
            const snapResult = snapToNearestPoint(x, y);
            setCurrentSnapPoint({ point: snapResult.point, isSnapped: snapResult.snapped });
            
            // Update current touch position for live length display
            if (currentPoints.length > 0) {
              setCurrentTouchPosition({ x, y });
            }
          }
          
          // Dragging polygon point
          if (draggingPolygonPoint) {
            const snapResult = snapToNearestPoint(x, y);
            updatePolygonPoint(draggingPolygonPoint.polygonId, draggingPolygonPoint.pointIndex, snapResult.point);
            setCurrentTouchPosition({ x, y }); // For live length display
            setCurrentSnapPoint({ point: snapResult.point, isSnapped: snapResult.snapped });
            return;
          }
          
          // Dragging whole polygon - with snapping
          if (draggingWholePolygon) {
            const polygon = polygons.find(p => p.id === draggingWholePolygon.polygonId);
            if (!polygon) return;
            
            const dx = x - draggingWholePolygon.startPos.x;
            const dy = y - draggingWholePolygon.startPos.y;
            
            // Check if any corner of the polygon can snap to an existing point
            let snapOffset = { x: 0, y: 0 };
            let foundSnap = false;
            
            for (const point of polygon.points) {
              const movedPoint = { x: point.x + dx, y: point.y + dy };
              // Exclude the polygon being moved from snap targets
              const snapResult = snapToNearestPoint(movedPoint.x, movedPoint.y, draggingWholePolygon.polygonId);
              
              if (snapResult.snapped) {
                // Calculate the offset needed to snap this corner
                snapOffset = {
                  x: snapResult.point.x - movedPoint.x,
                  y: snapResult.point.y - movedPoint.y
                };
                setCurrentSnapPoint({ point: snapResult.point, isSnapped: true });
                foundSnap = true;
                break;
              }
            }
            
            if (!foundSnap) {
              setCurrentSnapPoint(null);
            }
            
            // Apply movement with snap offset
            moveWholePolygon(draggingWholePolygon.polygonId, dx + snapOffset.x, dy + snapOffset.y);
            setDraggingWholePolygon({ 
              ...draggingWholePolygon, 
              startPos: { x: x + snapOffset.x, y: y + snapOffset.y } 
            });
            return;
          }
          
          // Dragging label
          if (draggingLabel) {
            const polygon = polygons.find(p => p.id === draggingLabel);
            if (polygon) {
              const centerX = polygon.points.reduce((sum, p) => sum + p.x, 0) / polygon.points.length;
              const centerY = polygon.points.reduce((sum, p) => sum + p.y, 0) / polygon.points.length;
              setLabelOffsets({
                ...labelOffsets,
                [draggingLabel]: { x: x - centerX, y: y - centerY }
              });
            }
            return;
          }
          
          if (draggingGuidePoint) {
            // Snap to grid if enabled
            const snapResult = snapToNearestPoint(x, y);
            updateGuideLinePoint(draggingGuidePoint.guideId, draggingGuidePoint.point, snapResult.point);
            setCurrentSnapPoint({ point: snapResult.point, isSnapped: snapResult.snapped });
          }
          
          // Dragging dimension line point
          if (draggingDimensionPoint) {
            const snapResult = snapToNearestPoint(x, y);
            updateDimensionLinePoint(draggingDimensionPoint.dimId, draggingDimensionPoint.point, snapResult.point);
            setCurrentSnapPoint({ point: snapResult.point, isSnapped: snapResult.snapped });
          }
          
          // Drawing deduction rectangle
          if (mode === 'deduction_rect' && deductionRectStart) {
            const snapResult = snapToNearestPoint(x, y);
            setDeductionRectEnd(snapResult.point);
            setCurrentSnapPoint({ point: snapResult.point, isSnapped: snapResult.snapped });
          }
          
          // Drawing annotation shape
          if (currentAnnotationShape) {
            setCurrentAnnotationShape({
              ...currentAnnotationShape,
              x2: x,
              y2: y,
            });
          }
          
          // Dragging memo pointer note position
          if (pendingMemoPointer) {
            setPendingMemoPointer({ ...pendingMemoPointer, x1: x, y1: y });
          }
          
          // Dragging text annotation
          if (draggingText) {
            setTextAnnotations(prev => prev.map(t => 
              t.id === draggingText.id 
                ? { ...t, x: x - draggingText.offset.x, y: y - draggingText.offset.y }
                : t
            ));
          }
          
          // Dragging memo pointer
          if (draggingMemo) {
            setMemoPointers(prev => prev.map(m => {
              if (m.id !== draggingMemo.id) return m;
              if (draggingMemo.part === 'note') {
                return { ...m, x1: x - draggingMemo.offset.x, y1: y - draggingMemo.offset.y };
              } else {
                return { ...m, x2: x - draggingMemo.offset.x, y2: y - draggingMemo.offset.y };
              }
            }));
          }
          
          // Dragging annotation shape
          if (draggingAnnotationShape) {
            const dx = x - draggingAnnotationShape.startX;
            const dy = y - draggingAnnotationShape.startY;
            setAnnotationShapes(prev => prev.map(s => 
              s.id === draggingAnnotationShape.id
                ? { ...s, x1: draggingAnnotationShape.origX1 + dx, y1: draggingAnnotationShape.origY1 + dy, x2: draggingAnnotationShape.origX2 + dx, y2: draggingAnnotationShape.origY2 + dy }
                : s
            ));
          }
          
          // Resizing annotation shape
          if (resizingShape) {
            setAnnotationShapes(prev => prev.map(s => {
              if (s.id !== resizingShape.id) return s;
              
              switch (resizingShape.handle) {
                case 'start':
                  return { ...s, x1: x, y1: y };
                case 'end':
                  return { ...s, x2: x, y2: y };
                case 'x1y1':
                  return { ...s, x1: x, y1: y };
                case 'x2y1':
                  return { ...s, x2: x, y1: y };
                case 'x1y2':
                  return { ...s, x1: x, y2: y };
                case 'x2y2':
                  return { ...s, x2: x, y2: y };
                default:
                  return s;
              }
            }));
          }
        }}
        onTouchEnd={(event) => {
          setCurrentTouchPosition(null);
          setCurrentSnapPoint(null); // Clear snap indicator
          
          // Stop resizing deduction rectangle
          if (resizingDeductionRect) {
            setResizingDeductionRect(null);
            return;
          }
          
          if (draggingPolygonPoint) {
            setDraggingPolygonPoint(null);
            return;
          }
          
          if (draggingWholePolygon) {
            setDraggingWholePolygon(null);
            return;
          }
          
          if (draggingLabel) {
            setDraggingLabel(null);
            return;
          }
          
          if (draggingGuidePoint) {
            setDraggingGuidePoint(null);
            return;
          }
          
          if (draggingDimensionPoint) {
            setDraggingDimensionPoint(null);
            return;
          }
          
          // Finish drawing deduction rectangle - convert to polygon
          if (mode === 'deduction_rect' && deductionRectStart && deductionRectEnd) {
            const minX = Math.min(deductionRectStart.x, deductionRectEnd.x);
            const maxX = Math.max(deductionRectStart.x, deductionRectEnd.x);
            const minY = Math.min(deductionRectStart.y, deductionRectEnd.y);
            const maxY = Math.max(deductionRectStart.y, deductionRectEnd.y);
            
            const width = maxX - minX;
            const height = maxY - minY;
            
            // Only create if rectangle has some size
            if (width > 10 || height > 10) {
              saveStateForUndo();
              
              // Create polygon with 4 corners (clockwise)
              const newPolygon: AreaPolygon = {
                id: Date.now().toString(),
                points: [
                  { x: minX, y: minY },  // Top-left
                  { x: maxX, y: minY },  // Top-right
                  { x: maxX, y: maxY },  // Bottom-right
                  { x: minX, y: maxY },  // Bottom-left
                ],
                type: 'deduction',
                name: 'Abzug',
                color: '#f44336',
              };
              
              setPolygons([...polygons, newPolygon]);
            }
            
            setDeductionRectStart(null);
            setDeductionRectEnd(null);
            return;
          }
          
          // Finish drawing annotation shape
          if (currentAnnotationShape) {
            // Only add if shape has some size
            const minSize = 10;
            const width = Math.abs(currentAnnotationShape.x2 - currentAnnotationShape.x1);
            const height = Math.abs(currentAnnotationShape.y2 - currentAnnotationShape.y1);
            if (width > minSize || height > minSize) {
              saveStateForUndo();
              setAnnotationShapes(prev => [...prev, currentAnnotationShape]);
            }
            setCurrentAnnotationShape(null);
            return;
          }
          
          // Stop resizing shape
          if (resizingShape) {
            setResizingShape(null);
            return;
          }
          
          // Stop dragging text
          if (draggingText) {
            const text = textAnnotations.find(t => t.id === draggingText.id);
            if (text) {
              // Check if position changed (moved more than 5px)
              const moved = Math.abs(text.x - draggingText.startPos.x) > 5 || Math.abs(text.y - draggingText.startPos.y) > 5;
              if (!moved) {
                // Didn't move - open edit modal
                setEditingTextId(draggingText.id);
                setEditTextInput(text.text);
                setTextFontSize(text.fontSize);
                setAnnotationColor(text.color);
                setShowEditTextModal(true);
              }
            }
            setDraggingText(null);
            return;
          }
          
          // Stop dragging memo
          if (draggingMemo) {
            const memo = memoPointers.find(m => m.id === draggingMemo.id);
            if (memo) {
              const currentPos = draggingMemo.part === 'note' ? { x: memo.x1, y: memo.y1 } : { x: memo.x2, y: memo.y2 };
              const moved = Math.abs(currentPos.x - draggingMemo.startPos.x) > 5 || Math.abs(currentPos.y - draggingMemo.startPos.y) > 5;
              if (!moved) {
                // Didn't move - open edit modal
                setEditingMemoId(draggingMemo.id);
                setEditMemoText(memo.text);
                setAnnotationColor(memo.color);
                setShowEditMemoModal(true);
              }
            }
            setDraggingMemo(null);
            return;
          }
          
          // Stop dragging annotation shape
          if (draggingAnnotationShape) {
            setDraggingAnnotationShape(null);
            return;
          }
          
          if (addPointMode) {
            return; // Already handled in onTouchStart
          }
          
          handleCanvasTouch(event);
        }}
      >
        <Svg width={canvasWidth} height={canvasHeight}>
          {/* Zoom/Pan transformation group */}
          <G transform={`translate(${panOffset.x}, ${panOffset.y}) scale(${zoomLevel})`}>
            
            {/* Background Image - REMOVED from canvas, now using reference container above */}
            
            {/* Grid */}
            {renderGrid()}
          
          {/* Snap indicator - shows where the point will snap to */}
          {currentSnapPoint && currentSnapPoint.isSnapped && (mode === 'polygon' || mode === 'deduction' || mode === 'guideline') && (
            <G>
              <Circle
                cx={currentSnapPoint.point.x}
                cy={currentSnapPoint.point.y}
                r={20}
                fill="rgba(33, 150, 243, 0.2)"
                stroke="#2196F3"
                strokeWidth={2}
              />
              <Circle
                cx={currentSnapPoint.point.x}
                cy={currentSnapPoint.point.y}
                r={6}
                fill="#2196F3"
              />
            </G>
          )}
          
          {/* Guide Lines */}
          {guideLinesVisible && guideLines.map((guide) => {
            const isSelected = selectedGuideLineId === guide.id;
            const midX = (guide.start.x + guide.end.x) / 2;
            const midY = (guide.start.y + guide.end.y) / 2;
            const baseColor = guide.isParallel ? '#9C27B0' : '#FF9800';
            
            return (
              <G key={guide.id}>
                {/* Line */}
                <Line
                  x1={guide.start.x}
                  y1={guide.start.y}
                  x2={guide.end.x}
                  y2={guide.end.y}
                  stroke={isSelected ? '#1976d2' : baseColor}
                  strokeWidth={isSelected ? 3 : 1.5}
                  strokeDasharray="8,4"
                />
                
                {/* Start point (draggable) */}
                <Circle 
                  cx={guide.start.x} 
                  cy={guide.start.y} 
                  r={isSelected ? 12 : 4} 
                  fill={isSelected ? '#1976d2' : baseColor} 
                />
                {isSelected && (
                  <Circle 
                    cx={guide.start.x} 
                    cy={guide.start.y} 
                    r={6} 
                    fill="#fff" 
                  />
                )}
                
                {/* End point (draggable) */}
                <Circle 
                  cx={guide.end.x} 
                  cy={guide.end.y} 
                  r={isSelected ? 12 : 4} 
                  fill={isSelected ? '#1976d2' : baseColor} 
                />
                {isSelected && (
                  <Circle 
                    cx={guide.end.x} 
                    cy={guide.end.y} 
                    r={6} 
                    fill="#fff" 
                  />
                )}
                
                {/* Middle point (for moving entire line) */}
                {isSelected && (
                  <>
                    <Circle 
                      cx={midX} 
                      cy={midY} 
                      r={10} 
                      fill="#4CAF50" 
                    />
                    <Circle 
                      cx={midX} 
                      cy={midY} 
                      r={5} 
                      fill="#fff" 
                    />
                  </>
                )}
              </G>
            );
          })}
          
          {/* Guide Line Intersections */}
          {guideLinesVisible && guideLines.length > 1 && calculateGuideLineIntersections().map((intersection, idx) => (
            <G key={`intersection-${idx}`}>
              <Circle
                cx={intersection.x}
                cy={intersection.y}
                r={6}
                fill="rgba(255,152,0,0.3)"
                stroke="#FF9800"
                strokeWidth={2}
              />
              <Circle
                cx={intersection.x}
                cy={intersection.y}
                r={2}
                fill="#FF9800"
              />
            </G>
          ))}
          
          {/* Scale reference line */}
          {scaleReference.startPoint && (
            <>
              <Circle
                cx={scaleReference.startPoint.x}
                cy={scaleReference.startPoint.y}
                r={6}
                fill="#FF9800"
              />
              {scaleReference.endPoint && (
                <>
                  <Line
                    x1={scaleReference.startPoint.x}
                    y1={scaleReference.startPoint.y}
                    x2={scaleReference.endPoint.x}
                    y2={scaleReference.endPoint.y}
                    stroke="#FF9800"
                    strokeWidth={3}
                    strokeDasharray="5,5"
                  />
                  <Circle
                    cx={scaleReference.endPoint.x}
                    cy={scaleReference.endPoint.y}
                    r={6}
                    fill="#FF9800"
                  />
                </>
              )}
            </>
          )}
          
          {/* Dimension lines (Vermaßung) */}
          {dimensionLines.map((dim) => {
            const calculatedLength = calculateLineLength(dim.start, dim.end);
            const displayLength = dim.customLength ?? calculatedLength;
            const midX = (dim.start.x + dim.end.x) / 2;
            const midY = (dim.start.y + dim.end.y) / 2;
            const isSelected = selectedDimensionId === dim.id;
            
            // Calculate perpendicular direction for extension lines
            const dx = dim.end.x - dim.start.x;
            const dy = dim.end.y - dim.start.y;
            const lineLength = Math.sqrt(dx * dx + dy * dy);
            const perpX = lineLength > 0 ? -dy / lineLength * 15 : 0;
            const perpY = lineLength > 0 ? dx / lineLength * 15 : 0;
            
            const strokeColor = isSelected ? '#1976d2' : '#9C27B0';
            const fillColor = isSelected ? 'rgba(25,118,210,0.95)' : 'rgba(156,39,176,0.95)';
            
            return (
              <G key={dim.id}>
                {/* Extension lines at start */}
                <Line
                  x1={dim.start.x - perpX}
                  y1={dim.start.y - perpY}
                  x2={dim.start.x + perpX}
                  y2={dim.start.y + perpY}
                  stroke={strokeColor}
                  strokeWidth={isSelected ? 2 : 1.5}
                />
                {/* Extension lines at end */}
                <Line
                  x1={dim.end.x - perpX}
                  y1={dim.end.y - perpY}
                  x2={dim.end.x + perpX}
                  y2={dim.end.y + perpY}
                  stroke={strokeColor}
                  strokeWidth={isSelected ? 2 : 1.5}
                />
                {/* Main dimension line */}
                <Line
                  x1={dim.start.x}
                  y1={dim.start.y}
                  x2={dim.end.x}
                  y2={dim.end.y}
                  stroke={strokeColor}
                  strokeWidth={isSelected ? 2 : 1.5}
                />
                {/* Start point (draggable when selected) */}
                <Circle 
                  cx={dim.start.x} 
                  cy={dim.start.y} 
                  r={isSelected ? 10 : 3} 
                  fill={strokeColor} 
                />
                {isSelected && (
                  <Circle cx={dim.start.x} cy={dim.start.y} r={5} fill="#fff" />
                )}
                {/* End point (draggable when selected) */}
                <Circle 
                  cx={dim.end.x} 
                  cy={dim.end.y} 
                  r={isSelected ? 10 : 3} 
                  fill={strokeColor} 
                />
                {isSelected && (
                  <Circle cx={dim.end.x} cy={dim.end.y} r={5} fill="#fff" />
                )}
                {/* Middle point (for moving entire line when selected) */}
                {isSelected && (
                  <>
                    <Circle cx={midX} cy={midY} r={10} fill="#4CAF50" />
                    <Circle cx={midX} cy={midY} r={5} fill="#fff" />
                  </>
                )}
                {/* Length label */}
                <Rect 
                  x={midX - 30} 
                  y={midY - 12} 
                  width={60} 
                  height={24} 
                  rx={4} 
                  fill={fillColor} 
                />
                <SvgText x={midX} y={midY + 5} textAnchor="middle" fontSize={12} fontWeight="bold" fill="#fff">
                  {displayLength.toFixed(2)}m
                </SvgText>
                {/* Custom length indicator */}
                {dim.customLength !== undefined && (
                  <SvgText x={midX + 35} y={midY} textAnchor="start" fontSize={8} fill={strokeColor}>*</SvgText>
                )}
              </G>
            );
          })}
          
          {/* Current dimension line being drawn */}
          {mode === 'dimension' && currentPoints.length === 1 && currentTouchPosition && (
            (() => {
              const length = calculateLineLength(currentPoints[0], currentTouchPosition);
              const midX = (currentPoints[0].x + currentTouchPosition.x) / 2;
              const midY = (currentPoints[0].y + currentTouchPosition.y) / 2;
              
              return (
                <G>
                  <Line
                    x1={currentPoints[0].x}
                    y1={currentPoints[0].y}
                    x2={currentTouchPosition.x}
                    y2={currentTouchPosition.y}
                    stroke="#9C27B0"
                    strokeWidth={2}
                    strokeDasharray="5,5"
                  />
                  <Circle cx={currentPoints[0].x} cy={currentPoints[0].y} r={5} fill="#9C27B0" />
                  <Circle cx={currentTouchPosition.x} cy={currentTouchPosition.y} r={5} fill="#9C27B0" />
                  <Rect x={midX - 30} y={midY - 12} width={60} height={24} rx={4} fill="rgba(156,39,176,0.9)" />
                  <SvgText x={midX} y={midY + 5} textAnchor="middle" fontSize={12} fontWeight="bold" fill="#fff">
                    {length.toFixed(2)}m
                  </SvgText>
                </G>
              );
            })()
          )}
          
          {/* Existing polygons */}
          {polygons.map((polygon) => {
            const pointsString = polygon.points.map(p => `${p.x},${p.y}`).join(' ');
            const isSelected = selectedPolygonId === polygon.id;
            // Abzugsflächen weiß (nicht transparent), Grundflächen halbtransparent grün
            const fillColor = polygon.type === 'deduction' ? '#ffffff' : 'rgba(76,175,80,0.3)';
            const strokeColor = polygon.type === 'deduction' ? '#f44336' : '#4CAF50';
            
            return (
              <G key={polygon.id}>
                <SvgPolygon
                  points={pointsString}
                  fill={fillColor}
                  stroke={isSelected ? '#1976d2' : strokeColor}
                  strokeWidth={isSelected ? 3 : 2}
                />
                
                {/* Resize handles for selected rectangle deductions */}
                {isSelected && polygon.type === 'deduction' && isPolygonRectangle(polygon) && (() => {
                  const bounds = getRectangleBounds(polygon);
                  return (
                    <>
                      <Circle cx={bounds.minX} cy={bounds.minY} r={10} fill="#1976d2" />
                      <Circle cx={bounds.maxX} cy={bounds.minY} r={10} fill="#1976d2" />
                      <Circle cx={bounds.minX} cy={bounds.maxY} r={10} fill="#1976d2" />
                      <Circle cx={bounds.maxX} cy={bounds.maxY} r={10} fill="#1976d2" />
                    </>
                  );
                })()}
                
                {/* Line categories - with interruption by deductions */}
                {polygon.type === 'main' && polygon.points.map((point, index) => {
                  const nextPoint = polygon.points[(index + 1) % polygon.points.length];
                  const category = getLineCategory(polygon.id, index);
                  
                  if (category) {
                    // Get segments after deduction interruptions
                    const segments = calculateLineSegmentsWithDeductions(polygon, index);
                    const color = getCategoryColor(category);
                    
                    // Check if there's a custom length for this edge
                    const calculatedTotalLength = calculateLineLength(point, nextPoint);
                    const displayTotalLength = getEdgeLength(polygon.id, index, calculatedTotalLength);
                    const isCustom = hasCustomLength(polygon.id, index);
                    
                    // Calculate total visible length (auto-calculated)
                    const totalAutoLength = segments
                      .filter(s => !s.isInterrupted)
                      .reduce((sum, s) => sum + calculateLineLength(s.start, s.end), 0);
                    
                    return (
                      <G key={`line-${polygon.id}-${index}`}>
                        {/* Draw each visible segment */}
                        {segments.filter(s => !s.isInterrupted).map((segment, segIdx) => {
                          return (
                            <G key={`seg-${segIdx}`}>
                              <Line
                                x1={segment.start.x}
                                y1={segment.start.y}
                                x2={segment.end.x}
                                y2={segment.end.y}
                                stroke={color}
                                strokeWidth={4}
                              />
                            </G>
                          );
                        })}
                        {/* Show single total measurement (use manual value if available) */}
                        {(() => {
                          const midX = (point.x + nextPoint.x) / 2;
                          const midY = (point.y + nextPoint.y) / 2;
                          const bgColor = isCustom ? '#2196F3' : color;
                          
                          // Get shortcut for this category
                          const categoryInfo = lineCategories.find(c => c.name === category);
                          const shortcut = categoryInfo?.shortcut;
                          
                          // Show manual value if custom, otherwise show auto-calculated visible length
                          const displayValue = isCustom ? displayTotalLength : totalAutoLength;
                          const lengthText = `${displayValue.toFixed(2)}m`;
                          const displayText = shortcut ? `${shortcut} ${lengthText}` : lengthText;
                          const labelWidth = Math.max(65, displayText.length * 7.5 + 20);
                          const labelHeight = 28;
                          const cornerRadius = labelHeight / 2;
                          
                          return (
                            <G>
                              <Rect
                                x={midX - labelWidth / 2}
                                y={midY - labelHeight / 2}
                                width={labelWidth}
                                height={labelHeight}
                                rx={cornerRadius}
                                ry={cornerRadius}
                                fill={bgColor}
                              />
                              {shortcut && (
                                <SvgText 
                                  x={midX - labelWidth / 2 + 8} 
                                  y={midY + 5} 
                                  textAnchor="start" 
                                  fontSize={11} 
                                  fontWeight="800" 
                                  fill="#fff"
                                >
                                  {shortcut}
                                </SvgText>
                              )}
                              <SvgText 
                                x={shortcut ? midX + labelWidth / 2 - 8 : midX} 
                                y={midY + 5} 
                                textAnchor={shortcut ? "end" : "middle"} 
                                fontSize={12} 
                                fontWeight="bold" 
                                fill="#fff"
                              >
                                {lengthText}
                              </SvgText>
                            </G>
                          );
                        })()}
                      </G>
                    );
                  }
                  return null;
                })}
                
                {/* Line categories for deduction polygons (no interruption) */}
                {polygon.type === 'deduction' && polygon.points.map((point, index) => {
                  const nextPoint = polygon.points[(index + 1) % polygon.points.length];
                  const category = getLineCategory(polygon.id, index);
                  
                  if (category) {
                    const midX = (point.x + nextPoint.x) / 2;
                    const midY = (point.y + nextPoint.y) / 2;
                    const calculatedLength = calculateLineLength(point, nextPoint);
                    const displayLength = getEdgeLength(polygon.id, index, calculatedLength);
                    const isCustom = hasCustomLength(polygon.id, index);
                    const categoryColor = getCategoryColor(category);
                    
                    // Get shortcut for this category
                    const categoryInfo = lineCategories.find(c => c.name === category);
                    const shortcut = categoryInfo?.shortcut;
                    
                    // Calculate oval/pill label dimensions
                    const lengthText = `${displayLength.toFixed(2)}m`;
                    const displayText = shortcut ? `${shortcut} ${lengthText}` : lengthText;
                    const labelWidth = Math.max(60, displayText.length * 7.5 + 18);
                    const labelHeight = 26;
                    const cornerRadius = labelHeight / 2; // Full pill shape
                    
                    return (
                      <G key={`line-${polygon.id}-${index}`}>
                        <Line
                          x1={point.x}
                          y1={point.y}
                          x2={nextPoint.x}
                          y2={nextPoint.y}
                          stroke={categoryColor}
                          strokeWidth={4}
                        />
                        {/* Oval/Pill shaped background */}
                        <Rect
                          x={midX - labelWidth / 2}
                          y={midY - labelHeight / 2}
                          width={labelWidth}
                          height={labelHeight}
                          rx={cornerRadius}
                          ry={cornerRadius}
                          fill={isCustom ? '#2196F3' : categoryColor}
                        />
                        {shortcut && (
                          <SvgText 
                            x={midX - labelWidth / 2 + 8} 
                            y={midY + 5} 
                            textAnchor="start" 
                            fontSize={11} 
                            fontWeight="800" 
                            fill="#fff"
                          >
                            {shortcut}
                          </SvgText>
                        )}
                        <SvgText 
                          x={shortcut ? midX + labelWidth / 2 - 8 : midX} 
                          y={midY + 5} 
                          textAnchor={shortcut ? "end" : "middle"} 
                          fontSize={12} 
                          fontWeight="bold" 
                          fill="#fff"
                        >
                          {lengthText}
                        </SvgText>
                      </G>
                    );
                  }
                  return null;
                })}
                
                {/* Edge lengths display (all edges without category) */}
                {showEdgeLengths && polygon.points.map((point, index) => {
                  const nextPoint = polygon.points[(index + 1) % polygon.points.length];
                  const category = getLineCategory(polygon.id, index);
                  
                  // Skip if this edge has a category (already shown with category styling)
                  if (category) return null;
                  
                  const calculatedLength = calculateLineLength(point, nextPoint);
                  if (calculatedLength < 0.1) return null; // Skip very short edges
                  
                  const displayLength = getEdgeLength(polygon.id, index, calculatedLength);
                  const isCustom = hasCustomLength(polygon.id, index);
                  
                  // Position label at the midpoint of the line
                  const midX = (point.x + nextPoint.x) / 2;
                  const midY = (point.y + nextPoint.y) / 2;
                  
                  // Offset the label perpendicular to the line (outside the polygon)
                  const dx = nextPoint.x - point.x;
                  const dy = nextPoint.y - point.y;
                  const lineLen = Math.sqrt(dx * dx + dy * dy);
                  
                  // Perpendicular direction
                  const perpX = -dy / lineLen;
                  const perpY = dx / lineLen;
                  
                  // Determine which side is "outside" the polygon
                  const centerX = polygon.points.reduce((s, p) => s + p.x, 0) / polygon.points.length;
                  const centerY = polygon.points.reduce((s, p) => s + p.y, 0) / polygon.points.length;
                  const toCenter = { x: centerX - midX, y: centerY - midY };
                  const perpDot = perpX * toCenter.x + perpY * toCenter.y;
                  
                  // Position on the outside of the polygon, with larger offset
                  const offset = 25;
                  const labelX = midX + (perpDot > 0 ? -perpX : perpX) * offset;
                  const labelY = midY + (perpDot > 0 ? -perpY : perpY) * offset;
                  
                  // Dynamic width based on text length
                  const displayText = `${displayLength.toFixed(2)}m`;
                  const labelWidth = Math.max(50, displayText.length * 7 + 10);
                  const labelHeight = 20;
                  // Custom values shown in blue, normal in green/red
                  const bgColor = isCustom ? '#2196F3' : (polygon.type === 'deduction' ? '#f44336' : '#4CAF50');
                  
                  return (
                    <G key={`edge-length-${polygon.id}-${index}`}>
                      <Rect 
                        x={labelX - labelWidth / 2} 
                        y={labelY - labelHeight / 2} 
                        width={labelWidth} 
                        height={labelHeight} 
                        rx={4} 
                        fill={bgColor}
                        stroke={isCustom ? '#1565C0' : undefined}
                        strokeWidth={isCustom ? 2 : 0}
                      />
                      <SvgText 
                        x={labelX - labelWidth / 2 + 5} 
                        y={labelY + 4} 
                        textAnchor="start" 
                        fontSize={11} 
                        fontWeight="bold" 
                        fill="#fff"
                      >
                        {displayText}
                      </SvgText>
                      {isCustom && (
                        <SvgText 
                          x={labelX + labelWidth / 2 - 6} 
                          y={labelY + 4} 
                          textAnchor="end" 
                          fontSize={8} 
                          fill="#fff"
                        >
                          ✎
                        </SvgText>
                      )}
                    </G>
                  );
                })}
                
                {/* Polygon points - draggable when selected */}
                {polygon.points.map((point, index) => {
                  const prevIndex = (index - 1 + polygon.points.length) % polygon.points.length;
                  const nextIndex = (index + 1) % polygon.points.length;
                  const prevPoint = polygon.points[prevIndex];
                  const nextPoint = polygon.points[nextIndex];
                  const isDragging = draggingPolygonPoint?.polygonId === polygon.id && draggingPolygonPoint?.pointIndex === index;
                  
                  return (
                    <G key={`point-${polygon.id}-${index}`}>
                      {/* Live length display when dragging this point */}
                      {isDragging && currentTouchPosition && (
                        <>
                          {/* Length to previous point */}
                          {(() => {
                            const length = calculateLineLength(prevPoint, point);
                            const midX = (prevPoint.x + point.x) / 2;
                            const midY = (prevPoint.y + point.y) / 2;
                            return (
                              <G>
                                <Rect x={midX - 28} y={midY - 11} width={56} height={22} rx={4} fill="#1976d2" />
                                <SvgText x={midX} y={midY + 5} textAnchor="middle" fontSize={12} fontWeight="bold" fill="#fff">
                                  {length.toFixed(2)}m
                                </SvgText>
                              </G>
                            );
                          })()}
                          {/* Length to next point */}
                          {(() => {
                            const length = calculateLineLength(point, nextPoint);
                            const midX = (point.x + nextPoint.x) / 2;
                            const midY = (point.y + nextPoint.y) / 2;
                            return (
                              <G>
                                <Rect x={midX - 28} y={midY - 11} width={56} height={22} rx={4} fill="#1976d2" />
                                <SvgText x={midX} y={midY + 5} textAnchor="middle" fontSize={12} fontWeight="bold" fill="#fff">
                                  {length.toFixed(2)}m
                                </SvgText>
                              </G>
                            );
                          })()}
                        </>
                      )}
                      
                      {/* Outer circle (grab indicator) */}
                      {isSelected && (
                        <Circle
                          cx={point.x}
                          cy={point.y}
                          r={14}
                          fill="rgba(25,118,210,0.2)"
                          stroke="#1976d2"
                          strokeWidth={1}
                        />
                      )}
                      {/* Inner circle */}
                      <Circle
                        cx={point.x}
                        cy={point.y}
                        r={isSelected ? 8 : 5}
                        fill={isSelected ? '#1976d2' : strokeColor}
                      />
                      {/* White dot center for better visibility */}
                      {isSelected && (
                        <Circle
                          cx={point.x}
                          cy={point.y}
                          r={3}
                          fill="#fff"
                        />
                      )}
                    </G>
                  );
                })}
                
                {/* Move handle in center of polygon - for moving whole polygon */}
                {isSelected && (() => {
                  const centerX = polygon.points.reduce((sum, p) => sum + p.x, 0) / polygon.points.length;
                  const centerY = polygon.points.reduce((sum, p) => sum + p.y, 0) / polygon.points.length;
                  return (
                    <G>
                      <Circle cx={centerX} cy={centerY} r={20} fill="rgba(76,175,80,0.3)" stroke="#4CAF50" strokeWidth={2} />
                      <Circle cx={centerX} cy={centerY} r={10} fill="#4CAF50" />
                      <SvgText x={centerX} y={centerY + 3} textAnchor="middle" fontSize={10} fontWeight="bold" fill="#fff">⇄</SvgText>
                    </G>
                  );
                })()}
                
                {/* Angle display at vertices */}
                {showPolygonAngles && polygon.points.length >= 3 && polygon.points.map((vertex, index) => {
                  const prevIndex = (index - 1 + polygon.points.length) % polygon.points.length;
                  const nextIndex = (index + 1) % polygon.points.length;
                  const prevPoint = polygon.points[prevIndex];
                  const nextPoint = polygon.points[nextIndex];
                  const angle = calculateAngle(prevPoint, vertex, nextPoint);
                  
                  return (
                    <G key={`angle-${polygon.id}-${index}`}>
                      <Circle
                        cx={vertex.x}
                        cy={vertex.y}
                        r={16}
                        fill="rgba(33,150,243,0.9)"
                      />
                      <SvgText
                        x={vertex.x}
                        y={vertex.y + 4}
                        textAnchor="middle"
                        fontSize={9}
                        fontWeight="bold"
                        fill="#fff"
                      >
                        {angle.toFixed(0)}°
                      </SvgText>
                    </G>
                  );
                })}
                
                {/* Area label - draggable */}
                {polygon.points.length > 0 && (() => {
                  const centerX = polygon.points.reduce((sum, p) => sum + p.x, 0) / polygon.points.length;
                  const centerY = polygon.points.reduce((sum, p) => sum + p.y, 0) / polygon.points.length;
                  const offset = labelOffsets[polygon.id] || { x: 0, y: 0 };
                  const labelX = centerX + offset.x;
                  const labelY = centerY + offset.y;
                  const hasOffset = offset.x !== 0 || offset.y !== 0;
                  
                  // For main polygons, show net area (after deductions)
                  // For deduction polygons, show their area
                  if (polygon.type === 'main') {
                    const { grossArea, deductions, netArea, isManual } = calculateNetAreaForPolygon(polygon);
                    const hasDeductions = deductions > 0;
                    const hasManualLabel = isManual && useManualAreaCalc;
                    const boxHeight = hasDeductions ? (hasManualLabel ? 66 : 52) : (hasManualLabel ? 50 : 36);
                    const boxWidth = hasManualLabel ? 100 : 90;
                    
                    return (
                      <G>
                        {/* Leader line from center to label */}
                        {hasOffset && (
                          <Line
                            x1={centerX}
                            y1={centerY}
                            x2={labelX}
                            y2={labelY}
                            stroke={strokeColor}
                            strokeWidth={1}
                            strokeDasharray="4,4"
                          />
                        )}
                        <Rect
                          x={labelX - boxWidth / 2}
                          y={labelY - boxHeight / 2}
                          width={boxWidth}
                          height={boxHeight}
                          rx={4}
                          fill={hasManualLabel ? "rgba(255,248,225,0.98)" : "rgba(255,255,255,0.95)"}
                          stroke={hasManualLabel ? "#FF9800" : strokeColor}
                          strokeWidth={hasManualLabel ? 2 : 1.5}
                        />
                        {/* Manual indicator */}
                        {hasManualLabel && (
                          <SvgText
                            x={labelX - boxWidth / 2 + 5}
                            y={labelY - boxHeight / 2 + 12}
                            textAnchor="start"
                            fontSize={8}
                            fill="#FF9800"
                            fontWeight="bold"
                          >
                            📐 (manuell)
                          </SvgText>
                        )}
                        <SvgText
                          x={labelX - boxWidth / 2 + 5}
                          y={labelY - boxHeight / 2 + (hasManualLabel ? 26 : 14)}
                          textAnchor="start"
                          fontSize={9}
                          fill="#666"
                        >
                          {polygon.name}
                        </SvgText>
                        {hasDeductions && (
                          <SvgText
                            x={labelX - boxWidth / 2 + 5}
                            y={labelY - boxHeight / 2 + (hasManualLabel ? 38 : 26)}
                            textAnchor="start"
                            fontSize={8}
                            fill="#999"
                          >
                            {grossArea.toFixed(2)}-{deductions.toFixed(2)}
                          </SvgText>
                        )}
                        <SvgText
                          x={labelX - boxWidth / 2 + 5}
                          y={labelY + boxHeight / 2 - 6}
                          textAnchor="start"
                          fontSize={13}
                          fontWeight="bold"
                          fill={hasManualLabel ? "#FF9800" : strokeColor}
                        >
                          {netArea.toFixed(2)}m²
                        </SvgText>
                      </G>
                    );
                  } else {
                    // Deduction polygon - show negative area
                    const area = calculatePolygonArea(polygon.points);
                    const boxWidth = 80;
                    const boxHeight = 36;
                    
                    return (
                      <G>
                        {/* Leader line from center to label */}
                        {hasOffset && (
                          <Line
                            x1={centerX}
                            y1={centerY}
                            x2={labelX}
                            y2={labelY}
                            stroke={strokeColor}
                            strokeWidth={1}
                            strokeDasharray="4,4"
                          />
                        )}
                        <Rect
                          x={labelX - boxWidth / 2}
                          y={labelY - boxHeight / 2}
                          width={boxWidth}
                          height={boxHeight}
                          rx={4}
                          fill="rgba(255,255,255,0.95)"
                          stroke={strokeColor}
                          strokeWidth={1.5}
                        />
                        <SvgText
                          x={labelX - boxWidth / 2 + 5}
                          y={labelY - boxHeight / 2 + 13}
                          textAnchor="start"
                          fontSize={9}
                          fill="#666"
                        >
                          {polygon.name}
                        </SvgText>
                        <SvgText
                          x={labelX - boxWidth / 2 + 5}
                          y={labelY + boxHeight / 2 - 6}
                          textAnchor="start"
                          fontSize={13}
                          fontWeight="bold"
                          fill={strokeColor}
                        >
                          -{area.toFixed(2)}m²
                        </SvgText>
                      </G>
                    );
                  }
                })()}
              </G>
            );
          })}
          
          {/* Current drawing polygon */}
          {currentPoints.length > 0 && (mode === 'polygon' || mode === 'deduction') && (
            <G>
              {currentPoints.length > 1 && (
                <SvgPolygon
                  points={currentPoints.map(p => `${p.x},${p.y}`).join(' ')}
                  fill={mode === 'deduction' ? 'rgba(244,67,54,0.2)' : 'rgba(76,175,80,0.2)'}
                  stroke={mode === 'deduction' ? '#f44336' : '#4CAF50'}
                  strokeWidth={2}
                  strokeDasharray="5,5"
                />
              )}
              
              {/* Line lengths for drawn segments */}
              {currentPoints.map((point, index) => {
                if (index === 0) return null;
                const prevPoint = currentPoints[index - 1];
                const length = calculateLineLength(prevPoint, point);
                const midX = (prevPoint.x + point.x) / 2;
                const midY = (prevPoint.y + point.y) / 2;
                
                return (
                  <G key={`length-${index}`}>
                    <Rect
                      x={midX - 25}
                      y={midY - 10}
                      width={50}
                      height={20}
                      rx={4}
                      fill="rgba(0,0,0,0.7)"
                    />
                    <SvgText
                      x={midX}
                      y={midY + 5}
                      textAnchor="middle"
                      fontSize={12}
                      fontWeight="bold"
                      fill="#fff"
                    >
                      {length.toFixed(2)}m
                    </SvgText>
                  </G>
                );
              })}
              
              {/* Live preview line to current touch position */}
              {currentTouchPosition && currentPoints.length > 0 && (
                <G>
                  <Line
                    x1={currentPoints[currentPoints.length - 1].x}
                    y1={currentPoints[currentPoints.length - 1].y}
                    x2={currentTouchPosition.x}
                    y2={currentTouchPosition.y}
                    stroke={mode === 'deduction' ? '#f44336' : '#4CAF50'}
                    strokeWidth={2}
                    strokeDasharray="5,5"
                  />
                  {/* Live length and angle display */}
                  {(() => {
                    const lastPoint = currentPoints[currentPoints.length - 1];
                    const length = calculateLineLength(lastPoint, currentTouchPosition);
                    const angle = calculateAngleFromHorizontal(lastPoint, currentTouchPosition);
                    const midX = (lastPoint.x + currentTouchPosition.x) / 2;
                    const midY = (lastPoint.y + currentTouchPosition.y) / 2;
                    return (
                      <G>
                        {/* Length label */}
                        <Rect
                          x={midX - 30}
                          y={midY - 12}
                          width={60}
                          height={24}
                          rx={4}
                          fill="#1976d2"
                        />
                        <SvgText
                          x={midX}
                          y={midY + 6}
                          textAnchor="middle"
                          fontSize={14}
                          fontWeight="bold"
                          fill="#fff"
                        >
                          {length.toFixed(2)}m
                        </SvgText>
                        {/* Angle label at end point */}
                        <Rect
                          x={currentTouchPosition.x + 10}
                          y={currentTouchPosition.y - 12}
                          width={45}
                          height={24}
                          rx={4}
                          fill="#E91E63"
                        />
                        <SvgText
                          x={currentTouchPosition.x + 32}
                          y={currentTouchPosition.y + 6}
                          textAnchor="middle"
                          fontSize={12}
                          fontWeight="bold"
                          fill="#fff"
                        >
                          {angle.toFixed(0)}°
                        </SvgText>
                      </G>
                    );
                  })()}
                </G>
              )}
              
              {currentPoints.map((point, index) => (
                <G key={`current-${index}`}>
                  <Circle
                    cx={point.x}
                    cy={point.y}
                    r={index === 0 ? 12 : 6}
                    fill={mode === 'deduction' ? '#f44336' : '#4CAF50'}
                  />
                  {index === 0 && currentPoints.length >= 3 && (
                    <SvgText
                      x={point.x}
                      y={point.y - 18}
                      textAnchor="middle"
                      fontSize={10}
                      fill="#666"
                    >
                      Schließen
                    </SvgText>
                  )}
                </G>
              ))}
            </G>
          )}
          
          {/* Current guide line being drawn - with live length */}
          {mode === 'guideline' && currentPoints.length === 1 && (
            <G>
              <Circle
                cx={currentPoints[0].x}
                cy={currentPoints[0].y}
                r={8}
                fill="#FF9800"
              />
              {currentTouchPosition && (
                <G>
                  <Line
                    x1={currentPoints[0].x}
                    y1={currentPoints[0].y}
                    x2={currentTouchPosition.x}
                    y2={currentTouchPosition.y}
                    stroke="#FF9800"
                    strokeWidth={2}
                    strokeDasharray="5,5"
                  />
                  {/* Live length display */}
                  {(() => {
                    const length = calculateLineLength(currentPoints[0], currentTouchPosition);
                    const midX = (currentPoints[0].x + currentTouchPosition.x) / 2;
                    const midY = (currentPoints[0].y + currentTouchPosition.y) / 2;
                    return (
                      <G>
                        <Rect
                          x={midX - 30}
                          y={midY - 12}
                          width={60}
                          height={24}
                          rx={4}
                          fill="#FF9800"
                        />
                        <SvgText
                          x={midX}
                          y={midY + 6}
                          textAnchor="middle"
                          fontSize={14}
                          fontWeight="bold"
                          fill="#fff"
                        >
                          {length.toFixed(2)}m
                        </SvgText>
                      </G>
                    );
                  })()}
                </G>
              )}
            </G>
          )}
          
          {/* Deduction Rectangle Preview */}
          {mode === 'deduction_rect' && deductionRectStart && deductionRectEnd && (
            <Rect
              x={Math.min(deductionRectStart.x, deductionRectEnd.x)}
              y={Math.min(deductionRectStart.y, deductionRectEnd.y)}
              width={Math.abs(deductionRectEnd.x - deductionRectStart.x)}
              height={Math.abs(deductionRectEnd.y - deductionRectStart.y)}
              fill="rgba(244, 67, 54, 0.3)"
              stroke="#f44336"
              strokeWidth={2}
              strokeDasharray="8,4"
            />
          )}
          
          {/* === ANNOTATION LAYERS === */}
          {/* Annotation Shapes */}
          {annotationShapes.map(shape => renderAnnotationShape(shape))}
          
          {/* Current shape being drawn */}
          {currentAnnotationShape && renderAnnotationShape(currentAnnotationShape, true)}
          
          {/* Text Annotations */}
          {textAnnotations.map(annotation => renderTextAnnotation(annotation))}
          
          {/* Memo Pointers */}
          {memoPointers.map(memo => renderMemoPointer(memo))}
          
          {/* Preview memo pointer while drawing */}
          {pendingMemoPointer && renderMemoPointer({ ...pendingMemoPointer, id: 'preview', text: '', color: annotationColor }, true)}
          
          </G>{/* End of zoom/pan transformation group */}
        </Svg>
        
        {/* Reference Image Overlay - Top Right Corner */}
        {backgroundImage && (
          <View style={styles.referenceImageOverlay}>
            <View style={styles.referenceImageHeader}>
              <Text style={styles.referenceImageTitle}>Referenz</Text>
              <TouchableOpacity 
                style={styles.referenceImageRemove}
                onPress={() => setBackgroundImage(null)}
              >
                <Ionicons name="close-circle" size={18} color="#f44336" />
              </TouchableOpacity>
            </View>
            <TouchableOpacity onPress={() => setShowImagePreview(true)}>
              <Image 
                source={{ uri: backgroundImage }} 
                style={styles.referenceImageSmall}
                resizeMode="contain"
              />
            </TouchableOpacity>
          </View>
        )}
        
        {/* Calculations Overlay - Below Reference Image */}
        <View style={[styles.calculationsOverlay, backgroundImage && { top: 175 }]}>
          <View style={styles.calculationsHeader}>
            <Ionicons name="calculator" size={14} color="#2196F3" />
            <Text style={styles.calculationsTitle}>Berechnung</Text>
          </View>
          
          {/* Net Area - Main Result */}
          <View style={styles.calculationsMainResult}>
            <Text style={styles.calculationsMainLabel}>Netto</Text>
            <Text style={[styles.calculationsMainValue, useManualAreaCalc && { color: '#FF9800' }]}>
              {results.netArea.toFixed(2)} m²
            </Text>
          </View>
          
          {/* Details */}
          {polygons.filter(p => p.type === 'main').length > 0 && (
            <View style={styles.calculationsDetails}>
              {/* Gross Area */}
              <View style={styles.calculationsRow}>
                <Text style={styles.calculationsLabel}>Brutto</Text>
                <Text style={styles.calculationsValueGreen}>
                  {polygons.filter(p => p.type === 'main').reduce((sum, p) => sum + calculatePolygonArea(p.points), 0).toFixed(2)} m²
                </Text>
              </View>
              
              {/* Deductions */}
              {polygons.filter(p => p.type === 'deduction').length > 0 && (
                <View style={styles.calculationsRow}>
                  <Text style={styles.calculationsLabel}>Abzüge</Text>
                  <Text style={styles.calculationsValueRed}>
                    -{polygons.filter(p => p.type === 'deduction').reduce((sum, p) => sum + calculatePolygonArea(p.points), 0).toFixed(2)} m²
                  </Text>
                </View>
              )}
            </View>
          )}
          
          {/* Line Categories - grows with each category */}
          {Object.keys(results.linesByCategory).length > 0 && (
            <View style={styles.calculationsLines}>
              {Object.entries(results.linesByCategory).map(([category, length]) => (
                <View key={category} style={styles.calculationsRow}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                    <View style={[styles.categoryDotSmall, { backgroundColor: getCategoryColor(category) }]} />
                    <Text style={styles.calculationsLabel} numberOfLines={1}>{formatCategoryWithShortcut(category)}</Text>
                  </View>
                  <Text style={styles.calculationsValue}>{(length as number).toFixed(2)} m</Text>
                </View>
              ))}
            </View>
          )}
          
          {/* More Details Button */}
          <TouchableOpacity 
            style={styles.calculationsMoreButton}
            onPress={() => setShowResultsModal(true)}
          >
            <Text style={styles.calculationsMoreText}>Details</Text>
            <Ionicons name="chevron-forward" size={14} color="#2196F3" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Status Bar */}
      <View style={styles.statusBar}>
        <View style={styles.statusItem}>
          <Text style={styles.statusLabel}>
            Netto {useManualAreaCalc ? '📐' : ''}
          </Text>
          <Text style={[styles.statusValue, useManualAreaCalc && { color: '#FF9800' }]}>
            {results.netArea.toFixed(2)} m²
          </Text>
        </View>
        <View style={styles.statusItem}>
          <Text style={styles.statusLabel}>Maßstab</Text>
          <Text style={styles.statusValue}>1m = {scale.toFixed(0)}px</Text>
        </View>
        <View style={styles.statusItem}>
          <Text style={styles.statusLabel}>Modus</Text>
          <Text style={styles.statusValue}>
            {mode === 'select' ? 'Auswahl' : 
             mode === 'scale' ? 'Maßstab' : 
             mode === 'polygon' ? 'Fläche' : 
             mode === 'deduction' ? 'Abzug' :
             mode === 'deduction_rect' ? 'Rechteck-Abzug' :
             mode === 'guideline' ? 'Hilfslinie' :
             mode === 'parallel' ? 'Parallel' : 
             mode === 'dimension' ? 'Vermaßung' :
             mode === 'annotation_text' ? 'Text' :
             mode === 'annotation_memo' ? 'Notiz' :
             mode === 'annotation_rect' ? 'Rahmen' :
             mode === 'annotation_arrow' ? 'Pfeil' :
             mode === 'annotation_circle' ? 'Kreis' :
             mode === 'annotation_line' ? 'Linie' : 'Auswahl'}
          </Text>
        </View>
      </View>

      {/* Scale Modal */}
      <Modal visible={showScaleModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <ScrollView style={{ maxHeight: '90%' }} contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Maßstab festlegen</Text>
            <Text style={styles.modalText}>
              Wie lang ist die gezeichnete Linie in der Realität?
            </Text>
            <View style={styles.inputRow}>
              <TextInput
                style={[styles.modalInput, { flex: 1 }]}
                value={scaleInputValue}
                onChangeText={(text) => {
                  const filtered = text.replace(/[^0-9.,+\-*/()]/g, '');
                  setScaleInputValue(filtered);
                }}
                placeholder="z.B. 5"
                keyboardType="decimal-pad"
                autoFocus
              />
              <Text style={styles.inputUnit}>Meter</Text>
              <TouchableOpacity
                style={{ marginLeft: 8, padding: 10, backgroundColor: showTextNumpad && textNumpadTarget === 'scale' ? '#3949ab' : '#e8eaf6', borderRadius: 8 }}
                onPress={() => { 
                  setTextNumpadTarget('scale'); 
                  setShowTextNumpad(!(showTextNumpad && textNumpadTarget === 'scale')); 
                }}
              >
                <Ionicons name="keypad" size={24} color={showTextNumpad && textNumpadTarget === 'scale' ? '#fff' : '#3949ab'} />
              </TouchableOpacity>
            </View>
            
            {/* Eingebettetes Numpad für Maßstab */}
            {showTextNumpad && textNumpadTarget === 'scale' && (
              <View style={{ backgroundColor: '#f5f5f5', borderRadius: 8, padding: 8, marginTop: 8, marginBottom: 8 }}>
                <View style={{ flexDirection: 'row', gap: 3, marginBottom: 3 }}>
                  {['7','8','9','+'].map(k => (
                    <TouchableOpacity key={k} style={[styles.largeNumpadKey, k==='+' && { backgroundColor: '#e3f2fd' }]} 
                      onPress={() => setScaleInputValue(prev => prev + k)}>
                      <Text style={[styles.largeNumpadKeyText, k==='+' && { color: '#1976d2' }]}>{k}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <View style={{ flexDirection: 'row', gap: 3, marginBottom: 3 }}>
                  {['4','5','6','-'].map(k => (
                    <TouchableOpacity key={k} style={[styles.largeNumpadKey, k==='-' && { backgroundColor: '#e3f2fd' }]} 
                      onPress={() => setScaleInputValue(prev => prev + k)}>
                      <Text style={[styles.largeNumpadKeyText, k==='-' && { color: '#1976d2' }]}>{k}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <View style={{ flexDirection: 'row', gap: 3, marginBottom: 3 }}>
                  {['1','2','3','*'].map(k => (
                    <TouchableOpacity key={k} style={[styles.largeNumpadKey, k==='*' && { backgroundColor: '#e3f2fd' }]} 
                      onPress={() => setScaleInputValue(prev => prev + k)}>
                      <Text style={[styles.largeNumpadKeyText, k==='*' && { color: '#1976d2' }]}>{k === '*' ? '×' : k}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <View style={{ flexDirection: 'row', gap: 3 }}>
                  {[',','0','.','/'].map(k => (
                    <TouchableOpacity key={k} style={[styles.largeNumpadKey, k==='/' && { backgroundColor: '#e3f2fd' }]} 
                      onPress={() => setScaleInputValue(prev => prev + k)}>
                      <Text style={[styles.largeNumpadKeyText, k==='/' && { color: '#1976d2' }]}>{k === '/' ? '÷' : k}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <View style={{ flexDirection: 'row', gap: 3, marginTop: 3 }}>
                  <TouchableOpacity style={[styles.largeNumpadKey, { backgroundColor: '#fff3e0' }]} 
                    onPress={() => setScaleInputValue('')}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: '#f57c00' }}>C</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.largeNumpadKey, { backgroundColor: '#ffebee' }]} 
                    onPress={() => setScaleInputValue(prev => prev.slice(0, -1))}>
                    <Ionicons name="backspace-outline" size={16} color="#f44336" />
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.largeNumpadKey, { flex: 2, backgroundColor: '#4CAF50' }]} 
                    onPress={() => setShowTextNumpad(false)}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: '#fff' }}>OK</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
            
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => {
                  setShowScaleModal(false);
                  setScaleReference({ startPoint: null, endPoint: null, realLength: 1 });
                  setMode('select');
                }}
              >
                <Text style={styles.cancelButtonText}>Abbrechen</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.confirmButton]}
                onPress={applyScale}
              >
                <Text style={styles.confirmButtonText}>Anwenden</Text>
              </TouchableOpacity>
            </View>
          </View>
          </ScrollView>
        </View>
      </Modal>

      {/* Name Modal */}
      <Modal visible={showNameModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Berechnung benennen</Text>
            <TextInput
              style={styles.modalInput}
              value={name}
              onChangeText={setName}
              placeholder="Name der Berechnung"
              autoFocus
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.confirmButton]}
                onPress={() => setShowNameModal(false)}
              >
                <Text style={styles.confirmButtonText}>OK</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Polygon Name Modal */}
      <Modal visible={showPolygonNameModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Fläche benennen</Text>
            <TextInput
              style={styles.modalInput}
              value={polygonNameInput}
              onChangeText={setPolygonNameInput}
              placeholder="z.B. Giebel, Fenster 1"
              autoFocus
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.confirmButton]}
                onPress={() => {
                  if (selectedPolygonId) {
                    setPolygons(polygons.map(p => 
                      p.id === selectedPolygonId ? { ...p, name: polygonNameInput || p.name } : p
                    ));
                  }
                  setShowPolygonNameModal(false);
                  setMode('select');
                }}
              >
                <Text style={styles.confirmButtonText}>OK</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Line Category Modal */}
      <Modal visible={showLineCategoryModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxHeight: '70%' }]}>
            <Text style={styles.modalTitle}>Linie benennen</Text>
            <Text style={styles.modalText}>Wählen Sie eine Kategorie für diese Linie:</Text>
            
            <ScrollView style={styles.categoryList}>
              {lineCategories.map((cat) => (
                <TouchableOpacity
                  key={cat.id}
                  style={[styles.categoryItem, { borderLeftColor: cat.color }]}
                  onPress={() => assignLineCategory(cat.name)}
                >
                  <View style={[styles.categoryColor, { backgroundColor: cat.color }]} />
                  <Text style={styles.categoryName}>{cat.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            
            <View style={styles.modalButtons}>
              {selectedLineIndex && getLineCategory(selectedLineIndex.polygonId, selectedLineIndex.pointIndex) && (
                <TouchableOpacity
                  style={[styles.modalButton, { backgroundColor: '#f44336' }]}
                  onPress={removeLineCategory}
                >
                  <Text style={styles.confirmButtonText}>Entfernen</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => {
                  setShowLineCategoryModal(false);
                  setSelectedLineIndex(null);
                }}
              >
                <Text style={styles.cancelButtonText}>Abbrechen</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Measurement Edit Modal */}
      <Modal visible={showMeasurementModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Maß bearbeiten</Text>
            <Text style={styles.modalText}>
              Geben Sie den gewünschten Wert ein:
            </Text>
            <View style={styles.inputRow}>
              <TextInput
                style={styles.modalInput}
                value={measurementInputValue}
                onChangeText={setMeasurementInputValue}
                keyboardType="decimal-pad"
                placeholder="0.00"
                autoFocus
              />
              <Text style={styles.inputUnit}>m</Text>
            </View>
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => {
                  setShowMeasurementModal(false);
                  setEditingMeasurement(null);
                }}
              >
                <Text style={styles.cancelButtonText}>Abbrechen</Text>
              </TouchableOpacity>
              {editingMeasurement?.type === 'dimension' && (
                <TouchableOpacity
                  style={[styles.modalButton, { backgroundColor: '#ff9800' }]}
                  onPress={() => {
                    if (editingMeasurement) {
                      // Reset to calculated value
                      setDimensionLines(dimensionLines.map(d => 
                        d.id === editingMeasurement.id ? { ...d, customLength: undefined } : d
                      ));
                    }
                    setShowMeasurementModal(false);
                    setEditingMeasurement(null);
                  }}
                >
                  <Text style={styles.confirmButtonText}>Zurücksetzen</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[styles.modalButton, styles.confirmButton]}
                onPress={() => {
                  const newValue = parseFloat(measurementInputValue.replace(',', '.'));
                  if (!isNaN(newValue) && newValue > 0 && editingMeasurement) {
                    if (editingMeasurement.type === 'dimension') {
                      updateDimensionLineLength(editingMeasurement.id, newValue);
                    }
                  }
                  setShowMeasurementModal(false);
                  setEditingMeasurement(null);
                }}
              >
                <Text style={styles.confirmButtonText}>OK</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Numpad for edge length input - COMPACT */}
      {showNumpad && (
        <Animated.View 
          style={[
            styles.numpadContainer,
            { transform: numpadPosition.getTranslateTransform(), padding: 8, minWidth: 180 }
          ]}
        >
          {/* Header with close and drag */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <View {...numpadPanResponder.panHandlers} style={{ flexDirection: 'row', alignItems: 'center', padding: 4 }}>
              <Ionicons name="move" size={12} color="#999" />
              <Text style={{ fontSize: 9, color: '#999', marginLeft: 4 }}>Ziehen</Text>
            </View>
            <TouchableOpacity 
              onPress={() => { setShowNumpad(false); setEditingEdge(null); setNumpadInput(''); }}
            >
              <Ionicons name="close-circle" size={20} color="#999" />
            </TouchableOpacity>
          </View>
          
          {/* Display - TextInput for laser device compatibility */}
          <View style={{ backgroundColor: '#f5f5f5', borderRadius: 6, padding: 4, marginBottom: 6, flexDirection: 'row', alignItems: 'center' }}>
            <TextInput
              style={{ flex: 1, fontSize: 18, fontWeight: 'bold', color: '#333', padding: 4, backgroundColor: '#fff', borderRadius: 4, borderWidth: 1, borderColor: '#ddd' }}
              value={numpadInput}
              onChangeText={(text) => {
                // Filter: NUR Zahlen, Komma, Punkt und Rechenoperatoren behalten - alles andere (inkl. Einheiten) entfernen
                const filtered = text.replace(/[^0-9.,+\-*/()]/g, '');
                setNumpadInput(filtered);
              }}
              keyboardType="decimal-pad"
              placeholder="0"
              placeholderTextColor="#999"
              autoFocus={true}
              blurOnSubmit={false}
              selectTextOnFocus={true}
              caretHidden={false}
            />
            <Text style={{ fontSize: 14, color: '#666', marginLeft: 6 }}>m</Text>
          </View>
          
          {/* Compact Number grid */}
          <View style={{ flexDirection: 'row', marginBottom: 3 }}>
            {['7','8','9','+'].map(k => (
              <TouchableOpacity 
                key={k} 
                style={{ flex: 1, backgroundColor: k==='+' ? '#e3f2fd' : '#fff', padding: 10, margin: 1, borderRadius: 4, alignItems: 'center' }}
                onPress={() => handleNumpadPress(k)}
              >
                <Text style={{ fontSize: 14, fontWeight: '600', color: k==='+' ? '#1976d2' : '#333' }}>{k}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={{ flexDirection: 'row', marginBottom: 3 }}>
            {['4','5','6','-'].map(k => (
              <TouchableOpacity 
                key={k} 
                style={{ flex: 1, backgroundColor: k==='-' ? '#e3f2fd' : '#fff', padding: 10, margin: 1, borderRadius: 4, alignItems: 'center' }}
                onPress={() => handleNumpadPress(k)}
              >
                <Text style={{ fontSize: 14, fontWeight: '600', color: k==='-' ? '#1976d2' : '#333' }}>{k === '-' ? '−' : k}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={{ flexDirection: 'row', marginBottom: 3 }}>
            {['1','2','3','×'].map(k => (
              <TouchableOpacity 
                key={k} 
                style={{ flex: 1, backgroundColor: k==='×' ? '#e3f2fd' : '#fff', padding: 10, margin: 1, borderRadius: 4, alignItems: 'center' }}
                onPress={() => handleNumpadPress(k === '×' ? '*' : k)}
              >
                <Text style={{ fontSize: 14, fontWeight: '600', color: k==='×' ? '#1976d2' : '#333' }}>{k}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={{ flexDirection: 'row', marginBottom: 3 }}>
            {[',','0','.','÷'].map(k => (
              <TouchableOpacity 
                key={k} 
                style={{ flex: 1, backgroundColor: k==='÷' ? '#e3f2fd' : '#fff', padding: 10, margin: 1, borderRadius: 4, alignItems: 'center' }}
                onPress={() => handleNumpadPress(k === '÷' ? '/' : k)}
              >
                <Text style={{ fontSize: 14, fontWeight: '600', color: k==='÷' ? '#1976d2' : '#333' }}>{k}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={{ flexDirection: 'row', marginBottom: 3 }}>
            <TouchableOpacity 
              style={{ flex: 1, backgroundColor: '#ffebee', padding: 10, margin: 1, borderRadius: 4, alignItems: 'center' }}
              onPress={() => handleNumpadPress('C')}
            >
              <Text style={{ fontSize: 12, fontWeight: '600', color: '#f44336' }}>C</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={{ flex: 1, backgroundColor: '#fff3e0', padding: 10, margin: 1, borderRadius: 4, alignItems: 'center' }}
              onPress={() => handleNumpadPress('⌫')}
            >
              <Ionicons name="backspace-outline" size={16} color="#ff9800" />
            </TouchableOpacity>
            <TouchableOpacity 
              style={{ flex: 2, backgroundColor: '#2196F3', padding: 10, margin: 1, borderRadius: 4, alignItems: 'center' }}
              onPress={() => applyNumpadInputAsLabel()}
            >
              <Text style={{ fontSize: 10, fontWeight: '600', color: '#fff' }}>Nur Maß</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity 
            style={{ backgroundColor: '#4CAF50', padding: 10, margin: 1, borderRadius: 4, alignItems: 'center' }}
            onPress={() => handleNumpadPress('OK')}
          >
            <Text style={{ fontSize: 12, fontWeight: '600', color: '#fff' }}>Linie ändern</Text>
          </TouchableOpacity>
        </Animated.View>
      )}

      {/* Text Annotation Modal */}
      <Modal visible={showTextModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <Animated.View style={[styles.draggableModalContent, { transform: textModalPosition.getTranslateTransform() }]}>
            {/* Drag Handle */}
            <View {...textModalPanResponder.panHandlers} style={styles.modalDragHandle}>
              <Ionicons name="move" size={18} color="#666" />
              <Text style={{ marginLeft: 6, fontSize: 11, color: '#666' }}>Verschieben</Text>
            </View>
            
            <Text style={styles.modalTitle}>Text hinzufügen</Text>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
              <TextInput
                ref={newTextInputRef}
                style={[styles.modalInput, { flex: 1 }]}
                value={newTextInput}
                onChangeText={setNewTextInput}
                placeholder="Text eingeben..."
                placeholderTextColor="#999"
                multiline
              />
              <TouchableOpacity
                style={{ marginLeft: 8, padding: 10, backgroundColor: showTextNumpad && textNumpadTarget === 'newText' ? '#3949ab' : '#e8eaf6', borderRadius: 8 }}
                onPress={() => { 
                  setTextNumpadTarget('newText'); 
                  setShowTextNumpad(!(showTextNumpad && textNumpadTarget === 'newText')); 
                }}
              >
                <Ionicons name="keypad" size={24} color={showTextNumpad && textNumpadTarget === 'newText' ? '#fff' : '#3949ab'} />
              </TouchableOpacity>
            </View>
            
            {/* Eingebettetes Numpad für Text - GRÖSSERE TASTEN */}
            {showTextNumpad && textNumpadTarget === 'newText' && (
              <View style={{ backgroundColor: '#f5f5f5', borderRadius: 8, padding: 10, marginTop: 10 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <TouchableOpacity 
                    style={{ backgroundColor: textNumpadMode === 'numbers' ? '#3949ab' : '#e0e0e0', paddingHorizontal: 14, paddingVertical: 6, borderRadius: 6 }}
                    onPress={() => setTextNumpadMode(textNumpadMode === 'numbers' ? 'letters' : 'numbers')}
                  >
                    <Text style={{ fontSize: 13, fontWeight: '600', color: textNumpadMode === 'numbers' ? '#fff' : '#333' }}>
                      {textNumpadMode === 'numbers' ? 'ABC' : '123'}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setShowTextNumpad(false)}>
                    <Ionicons name="close-circle" size={24} color="#999" />
                  </TouchableOpacity>
                </View>
                {textNumpadMode === 'numbers' ? (
                  <>
                    <View style={{ flexDirection: 'row', gap: 4, marginBottom: 4 }}>
                      {['7','8','9','+'].map(k => (
                        <TouchableOpacity key={k} style={[styles.largeNumpadKey, k==='+' && { backgroundColor: '#e3f2fd' }]} 
                          onPress={() => setNewTextInput(prev => prev + k)}>
                          <Text style={[styles.largeNumpadKeyText, k==='+' && { color: '#1976d2' }]}>{k}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    <View style={{ flexDirection: 'row', gap: 4, marginBottom: 4 }}>
                      {['4','5','6','-'].map(k => (
                        <TouchableOpacity key={k} style={[styles.largeNumpadKey, k==='-' && { backgroundColor: '#e3f2fd' }]} 
                          onPress={() => setNewTextInput(prev => prev + k)}>
                          <Text style={[styles.largeNumpadKeyText, k==='-' && { color: '#1976d2' }]}>{k}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    <View style={{ flexDirection: 'row', gap: 4, marginBottom: 4 }}>
                      {['1','2','3','*'].map(k => (
                        <TouchableOpacity key={k} style={[styles.largeNumpadKey, k==='*' && { backgroundColor: '#e3f2fd' }]} 
                          onPress={() => setNewTextInput(prev => prev + k)}>
                          <Text style={[styles.largeNumpadKeyText, k==='*' && { color: '#1976d2' }]}>{k === '*' ? '×' : k}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    <View style={{ flexDirection: 'row', gap: 4 }}>
                      {[',','0','.','/'].map(k => (
                        <TouchableOpacity key={k} style={[styles.largeNumpadKey, k==='/' && { backgroundColor: '#e3f2fd' }]} 
                          onPress={() => setNewTextInput(prev => prev + k)}>
                          <Text style={[styles.largeNumpadKeyText, k==='/' && { color: '#1976d2' }]}>{k === '/' ? '÷' : k}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </>
                ) : (
                  <>
                    <View style={{ flexDirection: 'row', gap: 3, marginBottom: 3 }}>
                      {['m','m²','m³','lfm','Stk'].map(k => (
                        <TouchableOpacity key={k} style={[styles.largeNumpadKey, { backgroundColor: '#e8f5e9' }]} 
                          onPress={() => setNewTextInput(prev => prev + k)}>
                          <Text style={{ fontSize: 12, fontWeight: '600', color: '#388e3c' }}>{k}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    <View style={{ flexDirection: 'row', gap: 3, marginBottom: 3 }}>
                      {['a','b','c','d','e','f','g','h'].map(k => (
                        <TouchableOpacity key={k} style={styles.largeNumpadKey} 
                          onPress={() => setNewTextInput(prev => prev + (textNumpadCaps ? k.toUpperCase() : k))}>
                          <Text style={styles.largeNumpadKeyText}>{textNumpadCaps ? k.toUpperCase() : k}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    <View style={{ flexDirection: 'row', gap: 3, marginBottom: 3 }}>
                      {['i','j','k','l','m','n','o','p'].map(k => (
                        <TouchableOpacity key={k} style={styles.largeNumpadKey} 
                          onPress={() => setNewTextInput(prev => prev + (textNumpadCaps ? k.toUpperCase() : k))}>
                          <Text style={styles.largeNumpadKeyText}>{textNumpadCaps ? k.toUpperCase() : k}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    <View style={{ flexDirection: 'row', gap: 3, marginBottom: 3 }}>
                      {['q','r','s','t','u','v','w','x'].map(k => (
                        <TouchableOpacity key={k} style={styles.largeNumpadKey} 
                          onPress={() => setNewTextInput(prev => prev + (textNumpadCaps ? k.toUpperCase() : k))}>
                          <Text style={styles.largeNumpadKeyText}>{textNumpadCaps ? k.toUpperCase() : k}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    <View style={{ flexDirection: 'row', gap: 3 }}>
                      <TouchableOpacity style={[styles.largeNumpadKey, textNumpadCaps && { backgroundColor: '#3949ab' }]} 
                        onPress={() => setTextNumpadCaps(!textNumpadCaps)}>
                        <Ionicons name="arrow-up" size={18} color={textNumpadCaps ? '#fff' : '#666'} />
                      </TouchableOpacity>
                      {['y','z','ä','ö','ü','ß',' '].map(k => (
                        <TouchableOpacity key={k} style={styles.largeNumpadKey} 
                          onPress={() => setNewTextInput(prev => prev + (k === ' ' ? ' ' : (textNumpadCaps ? k.toUpperCase() : k)))}>
                          <Text style={styles.largeNumpadKeyText}>{k === ' ' ? '␣' : (textNumpadCaps ? k.toUpperCase() : k)}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </>
                )}
                <View style={{ flexDirection: 'row', gap: 4, marginTop: 6 }}>
                  <TouchableOpacity style={[styles.largeNumpadKey, { backgroundColor: '#fff3e0' }]} 
                    onPress={() => setNewTextInput('')}>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: '#f57c00' }}>C</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.largeNumpadKey, { backgroundColor: '#ffebee' }]} 
                    onPress={() => setNewTextInput(prev => prev.slice(0, -1))}>
                    <Ionicons name="backspace-outline" size={20} color="#f44336" />
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.largeNumpadKey, { flex: 2, backgroundColor: '#4CAF50' }]} 
                    onPress={() => setShowTextNumpad(false)}>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: '#fff' }}>OK</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
            
            {/* Font size selector */}
            <Text style={{ fontSize: 12, color: '#666', marginTop: 10, marginBottom: 5 }}>Textgröße:</Text>
            <View style={{ flexDirection: 'row', justifyContent: 'center', marginBottom: 10 }}>
              {[12, 16, 20, 24, 32].map(size => (
                <TouchableOpacity
                  key={size}
                  onPress={() => setTextFontSize(size)}
                  style={{
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                    marginHorizontal: 4,
                    borderRadius: 8,
                    backgroundColor: textFontSize === size ? '#2196F3' : '#f0f0f0',
                  }}
                >
                  <Text style={{ fontSize: 14, fontWeight: textFontSize === size ? 'bold' : 'normal', color: textFontSize === size ? '#fff' : '#333' }}>{size}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {/* Color picker */}
            <Text style={{ fontSize: 12, color: '#666', marginBottom: 5 }}>Farbe:</Text>
            <View style={{ flexDirection: 'row', justifyContent: 'center', marginVertical: 10 }}>
              {['#FF0000', '#2196F3', '#4CAF50', '#FF9800', '#9C27B0', '#000000'].map(color => (
                <TouchableOpacity
                  key={color}
                  onPress={() => setAnnotationColor(color)}
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 16,
                    backgroundColor: color,
                    marginHorizontal: 5,
                    borderWidth: annotationColor === color ? 3 : 1,
                    borderColor: annotationColor === color ? '#fff' : '#ccc',
                  }}
                />
              ))}
            </View>
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalButton}
                onPress={() => { setShowTextModal(false); setNewTextInput(''); setMode('select'); }}
              >
                <Text style={styles.modalButtonText}>Abbrechen</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.confirmButton]}
                onPress={addTextAnnotation}
              >
                <Text style={styles.confirmButtonText}>Hinzufügen</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        </View>
      </Modal>

      {/* Edit Text Annotation Modal */}
      <Modal visible={showEditTextModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <Animated.View style={[styles.draggableModalContent, { transform: textModalPosition.getTranslateTransform() }]}>
            {/* Drag Handle */}
            <View {...textModalPanResponder.panHandlers} style={styles.modalDragHandle}>
              <Ionicons name="move" size={18} color="#666" />
              <Text style={{ marginLeft: 6, fontSize: 11, color: '#666' }}>Verschieben</Text>
            </View>
            
            <Text style={styles.modalTitle}>Text bearbeiten</Text>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
              <TextInput
                ref={editTextInputRef}
                style={[styles.modalInput, { flex: 1 }]}
                value={editTextInput}
                onChangeText={setEditTextInput}
                placeholder="Text eingeben..."
                placeholderTextColor="#999"
                autoFocus
                multiline
              />
              <TouchableOpacity
                style={{ marginLeft: 8, padding: 10, backgroundColor: showTextNumpad && textNumpadTarget === 'editText' ? '#3949ab' : '#e8eaf6', borderRadius: 8 }}
                onPress={() => { 
                  setTextNumpadTarget('editText'); 
                  setShowTextNumpad(!(showTextNumpad && textNumpadTarget === 'editText')); 
                }}
              >
                <Ionicons name="keypad" size={24} color={showTextNumpad && textNumpadTarget === 'editText' ? '#fff' : '#3949ab'} />
              </TouchableOpacity>
            </View>
            
            {/* Eingebettetes Numpad für Edit Text */}
            {showTextNumpad && textNumpadTarget === 'editText' && (
              <View style={{ backgroundColor: '#f5f5f5', borderRadius: 8, padding: 8, marginTop: 8 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <TouchableOpacity 
                    style={{ backgroundColor: textNumpadMode === 'numbers' ? '#3949ab' : '#e0e0e0', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 4 }}
                    onPress={() => setTextNumpadMode(textNumpadMode === 'numbers' ? 'letters' : 'numbers')}
                  >
                    <Text style={{ fontSize: 11, fontWeight: '600', color: textNumpadMode === 'numbers' ? '#fff' : '#333' }}>
                      {textNumpadMode === 'numbers' ? 'ABC' : '123'}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setShowTextNumpad(false)}>
                    <Ionicons name="close-circle" size={20} color="#999" />
                  </TouchableOpacity>
                </View>
                {textNumpadMode === 'numbers' ? (
                  <>
                    <View style={{ flexDirection: 'row', gap: 3, marginBottom: 3 }}>
                      {['7','8','9','+'].map(k => (
                        <TouchableOpacity key={k} style={[styles.largeNumpadKey, k==='+' && { backgroundColor: '#e3f2fd' }]} 
                          onPress={() => setEditTextInput(prev => prev + k)}>
                          <Text style={[styles.largeNumpadKeyText, k==='+' && { color: '#1976d2' }]}>{k}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    <View style={{ flexDirection: 'row', gap: 3, marginBottom: 3 }}>
                      {['4','5','6','-'].map(k => (
                        <TouchableOpacity key={k} style={[styles.largeNumpadKey, k==='-' && { backgroundColor: '#e3f2fd' }]} 
                          onPress={() => setEditTextInput(prev => prev + k)}>
                          <Text style={[styles.largeNumpadKeyText, k==='-' && { color: '#1976d2' }]}>{k}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    <View style={{ flexDirection: 'row', gap: 3, marginBottom: 3 }}>
                      {['1','2','3','*'].map(k => (
                        <TouchableOpacity key={k} style={[styles.largeNumpadKey, k==='*' && { backgroundColor: '#e3f2fd' }]} 
                          onPress={() => setEditTextInput(prev => prev + k)}>
                          <Text style={[styles.largeNumpadKeyText, k==='*' && { color: '#1976d2' }]}>{k === '*' ? '×' : k}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    <View style={{ flexDirection: 'row', gap: 3 }}>
                      {[',','0','.','/'].map(k => (
                        <TouchableOpacity key={k} style={[styles.largeNumpadKey, k==='/' && { backgroundColor: '#e3f2fd' }]} 
                          onPress={() => setEditTextInput(prev => prev + k)}>
                          <Text style={[styles.largeNumpadKeyText, k==='/' && { color: '#1976d2' }]}>{k === '/' ? '÷' : k}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </>
                ) : (
                  <>
                    <View style={{ flexDirection: 'row', gap: 2, marginBottom: 2 }}>
                      {['m','m²','m³','lfm'].map(k => (
                        <TouchableOpacity key={k} style={[styles.largeNumpadKey, { backgroundColor: '#e8f5e9' }]} 
                          onPress={() => setEditTextInput(prev => prev + k)}>
                          <Text style={{ fontSize: 9, fontWeight: '600', color: '#388e3c' }}>{k}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    <View style={{ flexDirection: 'row', gap: 2, marginBottom: 2 }}>
                      {['a','b','c','d','e','f','g','h','i'].map(k => (
                        <TouchableOpacity key={k} style={[styles.largeNumpadKey, { minHeight: 32 }]} 
                          onPress={() => setEditTextInput(prev => prev + (textNumpadCaps ? k.toUpperCase() : k))}>
                          <Text style={{ fontSize: 12, fontWeight: '600' }}>{textNumpadCaps ? k.toUpperCase() : k}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    <View style={{ flexDirection: 'row', gap: 2, marginBottom: 2 }}>
                      {['j','k','l','m','n','o','p','q','r'].map(k => (
                        <TouchableOpacity key={k} style={[styles.largeNumpadKey, { minHeight: 32 }]} 
                          onPress={() => setEditTextInput(prev => prev + (textNumpadCaps ? k.toUpperCase() : k))}>
                          <Text style={{ fontSize: 12, fontWeight: '600' }}>{textNumpadCaps ? k.toUpperCase() : k}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    <View style={{ flexDirection: 'row', gap: 2, marginBottom: 2 }}>
                      {['s','t','u','v','w','x','y','z','ä'].map(k => (
                        <TouchableOpacity key={k} style={[styles.largeNumpadKey, { minHeight: 32 }]} 
                          onPress={() => setEditTextInput(prev => prev + (textNumpadCaps ? k.toUpperCase() : k))}>
                          <Text style={{ fontSize: 12, fontWeight: '600' }}>{textNumpadCaps ? k.toUpperCase() : k}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    <View style={{ flexDirection: 'row', gap: 2 }}>
                      <TouchableOpacity style={[styles.largeNumpadKey, { minHeight: 32 }, textNumpadCaps && { backgroundColor: '#3949ab' }]} 
                        onPress={() => setTextNumpadCaps(!textNumpadCaps)}>
                        <Ionicons name="arrow-up" size={14} color={textNumpadCaps ? '#fff' : '#666'} />
                      </TouchableOpacity>
                      {['ö','ü','ß','-',' '].map(k => (
                        <TouchableOpacity key={k} style={[styles.largeNumpadKey, { minHeight: 32 }]} 
                          onPress={() => setEditTextInput(prev => prev + k)}>
                          <Text style={{ fontSize: 12, fontWeight: '600' }}>{k === ' ' ? '␣' : k}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </>
                )}
                <View style={{ flexDirection: 'row', gap: 3, marginTop: 3 }}>
                  <TouchableOpacity style={[styles.largeNumpadKey, { backgroundColor: '#fff3e0' }]} 
                    onPress={() => setEditTextInput('')}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: '#f57c00' }}>C</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.largeNumpadKey, { backgroundColor: '#ffebee' }]} 
                    onPress={() => setEditTextInput(prev => prev.slice(0, -1))}>
                    <Ionicons name="backspace-outline" size={16} color="#f44336" />
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.largeNumpadKey, { flex: 2, backgroundColor: '#4CAF50' }]} 
                    onPress={() => setShowTextNumpad(false)}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: '#fff' }}>OK</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
            
            {/* Font size selector */}
            <Text style={{ fontSize: 12, color: '#666', marginTop: 10, marginBottom: 5 }}>Textgröße:</Text>
            <View style={{ flexDirection: 'row', justifyContent: 'center', marginBottom: 10 }}>
              {[12, 16, 20, 24, 32].map(size => (
                <TouchableOpacity
                  key={size}
                  onPress={() => setTextFontSize(size)}
                  style={{
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                    marginHorizontal: 4,
                    borderRadius: 8,
                    backgroundColor: textFontSize === size ? '#2196F3' : '#f0f0f0',
                  }}
                >
                  <Text style={{ fontSize: 14, fontWeight: textFontSize === size ? 'bold' : 'normal', color: textFontSize === size ? '#fff' : '#333' }}>{size}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {/* Color picker */}
            <Text style={{ fontSize: 12, color: '#666', marginBottom: 5 }}>Farbe:</Text>
            <View style={{ flexDirection: 'row', justifyContent: 'center', marginVertical: 10 }}>
              {['#FF0000', '#2196F3', '#4CAF50', '#FF9800', '#9C27B0', '#000000'].map(color => (
                <TouchableOpacity
                  key={color}
                  onPress={() => setAnnotationColor(color)}
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 16,
                    backgroundColor: color,
                    marginHorizontal: 5,
                    borderWidth: annotationColor === color ? 3 : 1,
                    borderColor: annotationColor === color ? '#fff' : '#ccc',
                  }}
                />
              ))}
            </View>
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalButton}
                onPress={() => { setShowEditTextModal(false); setEditTextInput(''); setEditingTextId(null); }}
              >
                <Text style={styles.modalButtonText}>Abbrechen</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.confirmButton]}
                onPress={updateTextAnnotation}
              >
                <Text style={styles.confirmButtonText}>Speichern</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        </View>
      </Modal>

      {/* Background Image Modal */}
      <Modal visible={showBgImageModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxHeight: '80%' }]}>
            <Text style={styles.modalTitle}>Bild zur Berechnung</Text>
            
            <ScrollView style={{ maxHeight: 400 }}>
              <Text style={{ fontSize: 13, color: '#666', marginBottom: 15, textAlign: 'center' }}>
                Das Bild wird als Referenz oberhalb der Zeichenfläche angezeigt
              </Text>
              
              <View style={{ marginVertical: 10 }}>
                <TouchableOpacity
                  style={{ flexDirection: 'row', alignItems: 'center', padding: 15, backgroundColor: '#f5f5f5', borderRadius: 12, marginBottom: 10 }}
                  onPress={pickBackgroundImage}
                >
                  <Ionicons name="images" size={24} color="#8BC34A" />
                  <Text style={{ marginLeft: 15, fontSize: 16 }}>Aus Galerie wählen</Text>
                </TouchableOpacity>
                
                <TouchableOpacity
                  style={{ flexDirection: 'row', alignItems: 'center', padding: 15, backgroundColor: '#f5f5f5', borderRadius: 12, marginBottom: 10 }}
                  onPress={takeBackgroundPhoto}
                >
                  <Ionicons name="camera" size={24} color="#2196F3" />
                  <Text style={{ marginLeft: 15, fontSize: 16 }}>Foto aufnehmen</Text>
                </TouchableOpacity>
                
                {backgroundImage && (
                  <TouchableOpacity
                    style={{ flexDirection: 'row', alignItems: 'center', padding: 15, backgroundColor: '#ffebee', borderRadius: 12, marginBottom: 10 }}
                    onPress={removeBackgroundImage}
                  >
                    <Ionicons name="trash" size={24} color="#f44336" />
                    <Text style={{ marginLeft: 15, fontSize: 16, color: '#f44336' }}>Bild entfernen</Text>
                  </TouchableOpacity>
                )}
              </View>
              
              {/* Project Photos */}
              {projectPhotos.length > 0 && (
                <View style={{ marginTop: 10 }}>
                  <Text style={{ fontSize: 14, fontWeight: 'bold', marginBottom: 10, color: '#333' }}>
                    Projektfotos ({projectPhotos.length})
                  </Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                    {projectPhotos.map((photo) => (
                      <TouchableOpacity
                        key={photo.id}
                        style={{ 
                          width: 80, 
                          height: 80, 
                          borderRadius: 8, 
                          overflow: 'hidden',
                          borderWidth: 2,
                          borderColor: photo.uri ? '#4CAF50' : '#f44336',
                          backgroundColor: '#f0f0f0',
                        }}
                        onPress={() => {
                          console.log('Photo selected:', photo.id, 'URI length:', photo.uri?.length);
                          if (photo.uri) {
                            useProjectPhotoAsBackground(photo.uri);
                          } else {
                            Alert.alert('Fehler', 'Dieses Foto hat keine gültige URI');
                          }
                        }}
                      >
                        {photo.uri ? (
                          <Image
                            source={{ uri: photo.uri }}
                            style={{ width: '100%', height: '100%' }}
                            resizeMode="cover"
                            onError={(e) => console.log('Image load error:', e.nativeEvent.error)}
                          />
                        ) : (
                          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                            <Ionicons name="image-outline" size={30} color="#999" />
                          </View>
                        )}
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}
            </ScrollView>
            
            <TouchableOpacity
              style={[styles.modalButton, { alignSelf: 'center', paddingHorizontal: 30, marginTop: 15 }]}
              onPress={() => setShowBgImageModal(false)}
            >
              <Text style={styles.modalButtonText}>Schließen</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Image Preview Modal */}
      <Modal visible={showImagePreview} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
            <View style={{ backgroundColor: '#fff', borderRadius: 12, overflow: 'hidden', maxWidth: '95%', maxHeight: '85%' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 15, borderBottomWidth: 1, borderBottomColor: '#eee' }}>
                <Text style={{ fontSize: 16, fontWeight: '600', color: '#333' }}>Referenzbild</Text>
                <TouchableOpacity onPress={() => setShowImagePreview(false)}>
                  <Ionicons name="close" size={28} color="#333" />
                </TouchableOpacity>
              </View>
              {backgroundImage && (
                <Image
                  source={{ uri: backgroundImage }}
                  style={{ width: 350, height: 450 }}
                  resizeMode="contain"
                />
              )}
            </View>
          </View>
        </View>
      </Modal>

      {/* Shapes Selection Modal */}
      <Modal visible={showShapesModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { padding: 20 }]}>
            <Text style={styles.modalTitle}>Form auswählen</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 15, marginVertical: 15 }}>
              <TouchableOpacity
                style={{ alignItems: 'center', padding: 15, backgroundColor: '#f5f5f5', borderRadius: 12, width: 80 }}
                onPress={() => { setMode('annotation_rect'); setShowShapesModal(false); setCurrentPoints([]); }}
              >
                <Ionicons name="square-outline" size={32} color="#673AB7" />
                <Text style={{ marginTop: 5, fontSize: 12 }}>Rechteck</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={{ alignItems: 'center', padding: 15, backgroundColor: '#f5f5f5', borderRadius: 12, width: 80 }}
                onPress={() => { setMode('annotation_circle'); setShowShapesModal(false); setCurrentPoints([]); }}
              >
                <Ionicons name="ellipse-outline" size={32} color="#673AB7" />
                <Text style={{ marginTop: 5, fontSize: 12 }}>Kreis</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={{ alignItems: 'center', padding: 15, backgroundColor: '#f5f5f5', borderRadius: 12, width: 80 }}
                onPress={() => { setMode('annotation_arrow'); setShowShapesModal(false); setCurrentPoints([]); }}
              >
                <Ionicons name="arrow-forward" size={32} color="#673AB7" />
                <Text style={{ marginTop: 5, fontSize: 12 }}>Pfeil</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={{ alignItems: 'center', padding: 15, backgroundColor: '#f5f5f5', borderRadius: 12, width: 80 }}
                onPress={() => { setMode('annotation_line'); setShowShapesModal(false); setCurrentPoints([]); }}
              >
                <Ionicons name="remove-outline" size={32} color="#673AB7" />
                <Text style={{ marginTop: 5, fontSize: 12 }}>Linie</Text>
              </TouchableOpacity>
            </View>
            
            {/* Color picker */}
            <Text style={{ fontSize: 12, color: '#666', marginBottom: 8 }}>Farbe:</Text>
            <View style={{ flexDirection: 'row', justifyContent: 'center', marginBottom: 15 }}>
              {['#FF0000', '#2196F3', '#4CAF50', '#FF9800', '#9C27B0', '#000000'].map(color => (
                <TouchableOpacity
                  key={color}
                  onPress={() => setAnnotationColor(color)}
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 16,
                    backgroundColor: color,
                    marginHorizontal: 5,
                    borderWidth: annotationColor === color ? 3 : 1,
                    borderColor: annotationColor === color ? '#fff' : '#ccc',
                  }}
                />
              ))}
            </View>
            
            {/* Stroke width picker */}
            <Text style={{ fontSize: 12, color: '#666', marginBottom: 8 }}>Linienstärke:</Text>
            <View style={{ flexDirection: 'row', justifyContent: 'center', marginBottom: 15 }}>
              {[1, 2, 3, 5, 8].map(width => (
                <TouchableOpacity
                  key={width}
                  onPress={() => setAnnotationStrokeWidth(width)}
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 8,
                    backgroundColor: annotationStrokeWidth === width ? '#673AB7' : '#f0f0f0',
                    marginHorizontal: 5,
                    justifyContent: 'center',
                    alignItems: 'center',
                  }}
                >
                  <View style={{ width: 24, height: width, backgroundColor: annotationStrokeWidth === width ? '#fff' : '#333', borderRadius: width / 2 }} />
                </TouchableOpacity>
              ))}
            </View>
            
            {/* Apply style to selected shape */}
            {selectedAnnotationId && (
              <TouchableOpacity
                style={[styles.modalButton, styles.confirmButton, { alignSelf: 'center', paddingHorizontal: 30, marginBottom: 10 }]}
                onPress={() => {
                  saveStateForUndo();
                  setAnnotationShapes(prev => prev.map(s => 
                    s.id === selectedAnnotationId 
                      ? { ...s, color: annotationColor, strokeWidth: annotationStrokeWidth }
                      : s
                  ));
                  setShowShapesModal(false);
                }}
              >
                <Text style={styles.confirmButtonText}>Stil übernehmen</Text>
              </TouchableOpacity>
            )}
            
            <TouchableOpacity
              style={[styles.modalButton, { alignSelf: 'center', paddingHorizontal: 30 }]}
              onPress={() => setShowShapesModal(false)}
            >
              <Text style={styles.modalButtonText}>Schließen</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Memo Pointer Modal */}
      <Modal visible={showMemoModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <Animated.View style={[styles.draggableModalContent, { transform: textModalPosition.getTranslateTransform() }]}>
            {/* Drag Handle */}
            <View {...textModalPanResponder.panHandlers} style={styles.modalDragHandle}>
              <Ionicons name="move" size={18} color="#666" />
              <Text style={{ marginLeft: 6, fontSize: 11, color: '#666' }}>Verschieben</Text>
            </View>
            
            <Text style={styles.modalTitle}>Notiz hinzufügen</Text>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
              <TextInput
                ref={memoTextInputRef}
                style={[styles.modalInput, { flex: 1 }]}
                value={memoText}
                onChangeText={setMemoText}
                placeholder="Notiztext eingeben..."
                placeholderTextColor="#999"
                autoFocus
              />
              <TouchableOpacity
                style={{ marginLeft: 8, padding: 10, backgroundColor: showTextNumpad && textNumpadTarget === 'memo' ? '#3949ab' : '#e8eaf6', borderRadius: 8 }}
                onPress={() => { 
                  setTextNumpadTarget('memo'); 
                  setShowTextNumpad(!(showTextNumpad && textNumpadTarget === 'memo')); 
                }}
              >
                <Ionicons name="keypad" size={24} color={showTextNumpad && textNumpadTarget === 'memo' ? '#fff' : '#3949ab'} />
              </TouchableOpacity>
            </View>
            
            {/* Eingebettetes Numpad für Memo */}
            {showTextNumpad && textNumpadTarget === 'memo' && (
              <View style={{ backgroundColor: '#f5f5f5', borderRadius: 8, padding: 8, marginTop: 8 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <TouchableOpacity 
                    style={{ backgroundColor: textNumpadMode === 'numbers' ? '#3949ab' : '#e0e0e0', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 4 }}
                    onPress={() => setTextNumpadMode(textNumpadMode === 'numbers' ? 'letters' : 'numbers')}
                  >
                    <Text style={{ fontSize: 11, fontWeight: '600', color: textNumpadMode === 'numbers' ? '#fff' : '#333' }}>
                      {textNumpadMode === 'numbers' ? 'ABC' : '123'}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setShowTextNumpad(false)}>
                    <Ionicons name="close-circle" size={20} color="#999" />
                  </TouchableOpacity>
                </View>
                {textNumpadMode === 'numbers' ? (
                  <>
                    <View style={{ flexDirection: 'row', gap: 3, marginBottom: 3 }}>
                      {['7','8','9','+'].map(k => (
                        <TouchableOpacity key={k} style={[styles.largeNumpadKey, k==='+' && { backgroundColor: '#e3f2fd' }]} 
                          onPress={() => setMemoText(prev => prev + k)}>
                          <Text style={[styles.largeNumpadKeyText, k==='+' && { color: '#1976d2' }]}>{k}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    <View style={{ flexDirection: 'row', gap: 3, marginBottom: 3 }}>
                      {['4','5','6','-'].map(k => (
                        <TouchableOpacity key={k} style={[styles.largeNumpadKey, k==='-' && { backgroundColor: '#e3f2fd' }]} 
                          onPress={() => setMemoText(prev => prev + k)}>
                          <Text style={[styles.largeNumpadKeyText, k==='-' && { color: '#1976d2' }]}>{k}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    <View style={{ flexDirection: 'row', gap: 3, marginBottom: 3 }}>
                      {['1','2','3','*'].map(k => (
                        <TouchableOpacity key={k} style={[styles.largeNumpadKey, k==='*' && { backgroundColor: '#e3f2fd' }]} 
                          onPress={() => setMemoText(prev => prev + k)}>
                          <Text style={[styles.largeNumpadKeyText, k==='*' && { color: '#1976d2' }]}>{k === '*' ? '×' : k}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    <View style={{ flexDirection: 'row', gap: 3 }}>
                      {[',','0','.','/'].map(k => (
                        <TouchableOpacity key={k} style={[styles.largeNumpadKey, k==='/' && { backgroundColor: '#e3f2fd' }]} 
                          onPress={() => setMemoText(prev => prev + k)}>
                          <Text style={[styles.largeNumpadKeyText, k==='/' && { color: '#1976d2' }]}>{k === '/' ? '÷' : k}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </>
                ) : (
                  <>
                    <View style={{ flexDirection: 'row', gap: 2, marginBottom: 2 }}>
                      {['m','m²','m³','lfm'].map(k => (
                        <TouchableOpacity key={k} style={[styles.largeNumpadKey, { backgroundColor: '#e8f5e9' }]} 
                          onPress={() => setMemoText(prev => prev + k)}>
                          <Text style={{ fontSize: 9, fontWeight: '600', color: '#388e3c' }}>{k}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    <View style={{ flexDirection: 'row', gap: 2, marginBottom: 2 }}>
                      {['a','b','c','d','e','f','g','h','i'].map(k => (
                        <TouchableOpacity key={k} style={[styles.largeNumpadKey, { minHeight: 32 }]} 
                          onPress={() => setMemoText(prev => prev + (textNumpadCaps ? k.toUpperCase() : k))}>
                          <Text style={{ fontSize: 12, fontWeight: '600' }}>{textNumpadCaps ? k.toUpperCase() : k}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    <View style={{ flexDirection: 'row', gap: 2, marginBottom: 2 }}>
                      {['j','k','l','m','n','o','p','q','r'].map(k => (
                        <TouchableOpacity key={k} style={[styles.largeNumpadKey, { minHeight: 32 }]} 
                          onPress={() => setMemoText(prev => prev + (textNumpadCaps ? k.toUpperCase() : k))}>
                          <Text style={{ fontSize: 12, fontWeight: '600' }}>{textNumpadCaps ? k.toUpperCase() : k}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    <View style={{ flexDirection: 'row', gap: 2, marginBottom: 2 }}>
                      {['s','t','u','v','w','x','y','z','ä'].map(k => (
                        <TouchableOpacity key={k} style={[styles.largeNumpadKey, { minHeight: 32 }]} 
                          onPress={() => setMemoText(prev => prev + (textNumpadCaps ? k.toUpperCase() : k))}>
                          <Text style={{ fontSize: 12, fontWeight: '600' }}>{textNumpadCaps ? k.toUpperCase() : k}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    <View style={{ flexDirection: 'row', gap: 2 }}>
                      <TouchableOpacity style={[styles.largeNumpadKey, { minHeight: 32 }, textNumpadCaps && { backgroundColor: '#3949ab' }]} 
                        onPress={() => setTextNumpadCaps(!textNumpadCaps)}>
                        <Ionicons name="arrow-up" size={14} color={textNumpadCaps ? '#fff' : '#666'} />
                      </TouchableOpacity>
                      {['ö','ü','ß','-',' '].map(k => (
                        <TouchableOpacity key={k} style={[styles.largeNumpadKey, { minHeight: 32 }]} 
                          onPress={() => setMemoText(prev => prev + k)}>
                          <Text style={{ fontSize: 12, fontWeight: '600' }}>{k === ' ' ? '␣' : k}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </>
                )}
                <View style={{ flexDirection: 'row', gap: 3, marginTop: 3 }}>
                  <TouchableOpacity style={[styles.largeNumpadKey, { backgroundColor: '#fff3e0' }]} 
                    onPress={() => setMemoText('')}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: '#f57c00' }}>C</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.largeNumpadKey, { backgroundColor: '#ffebee' }]} 
                    onPress={() => setMemoText(prev => prev.slice(0, -1))}>
                    <Ionicons name="backspace-outline" size={16} color="#f44336" />
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.largeNumpadKey, { flex: 2, backgroundColor: '#4CAF50' }]} 
                    onPress={() => setShowTextNumpad(false)}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: '#fff' }}>OK</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
            
            {/* Color picker */}
            <View style={{ flexDirection: 'row', justifyContent: 'center', marginVertical: 10 }}>
              {['#FF0000', '#2196F3', '#4CAF50', '#FF9800', '#9C27B0', '#000000'].map(color => (
                <TouchableOpacity
                  key={color}
                  onPress={() => setAnnotationColor(color)}
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 16,
                    backgroundColor: color,
                    marginHorizontal: 5,
                    borderWidth: annotationColor === color ? 3 : 1,
                    borderColor: annotationColor === color ? '#fff' : '#ccc',
                  }}
                />
              ))}
            </View>
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalButton}
                onPress={() => { setShowMemoModal(false); setMemoText(''); setPendingMemoPointer(null); setMode('select'); }}
              >
                <Text style={styles.modalButtonText}>Abbrechen</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.confirmButton]}
                onPress={addMemoPointer}
              >
                <Text style={styles.confirmButtonText}>Hinzufügen</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        </View>
      </Modal>

      {/* Edit Memo Annotation Modal */}
      <Modal visible={showEditMemoModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <Animated.View style={[styles.draggableModalContent, { transform: textModalPosition.getTranslateTransform() }]}>
            {/* Drag Handle */}
            <View {...textModalPanResponder.panHandlers} style={styles.modalDragHandle}>
              <Ionicons name="move" size={18} color="#666" />
              <Text style={{ marginLeft: 6, fontSize: 11, color: '#666' }}>Verschieben</Text>
            </View>
            
            <Text style={styles.modalTitle}>Notiz bearbeiten</Text>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
              <TextInput
                style={[styles.modalInput, { flex: 1 }]}
                value={editMemoText}
                onChangeText={setEditMemoText}
                placeholder="Notiztext eingeben..."
                placeholderTextColor="#999"
                multiline
              />
              <TouchableOpacity
                style={{ marginLeft: 8, padding: 10, backgroundColor: showTextNumpad && textNumpadTarget === 'memo' ? '#3949ab' : '#e8eaf6', borderRadius: 8 }}
                onPress={() => { 
                  setTextNumpadTarget('memo'); 
                  setShowTextNumpad(!(showTextNumpad && textNumpadTarget === 'memo')); 
                }}
              >
                <Ionicons name="keypad" size={24} color={showTextNumpad && textNumpadTarget === 'memo' ? '#fff' : '#3949ab'} />
              </TouchableOpacity>
            </View>
            
            {/* Eingebettetes Numpad für Edit Memo */}
            {showTextNumpad && textNumpadTarget === 'memo' && (
              <View style={{ backgroundColor: '#f5f5f5', borderRadius: 8, padding: 10, marginTop: 10 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <TouchableOpacity 
                    style={{ backgroundColor: textNumpadMode === 'numbers' ? '#3949ab' : '#e0e0e0', paddingHorizontal: 14, paddingVertical: 6, borderRadius: 6 }}
                    onPress={() => setTextNumpadMode(textNumpadMode === 'numbers' ? 'letters' : 'numbers')}
                  >
                    <Text style={{ fontSize: 13, fontWeight: '600', color: textNumpadMode === 'numbers' ? '#fff' : '#333' }}>
                      {textNumpadMode === 'numbers' ? 'ABC' : '123'}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setShowTextNumpad(false)}>
                    <Ionicons name="close-circle" size={24} color="#999" />
                  </TouchableOpacity>
                </View>
                {textNumpadMode === 'numbers' ? (
                  <>
                    <View style={{ flexDirection: 'row', gap: 4, marginBottom: 4 }}>
                      {['7','8','9','+'].map(k => (
                        <TouchableOpacity key={k} style={[styles.largeNumpadKey, k==='+' && { backgroundColor: '#e3f2fd' }]} 
                          onPress={() => setEditMemoText(prev => prev + k)}>
                          <Text style={[styles.largeNumpadKeyText, k==='+' && { color: '#1976d2' }]}>{k}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    <View style={{ flexDirection: 'row', gap: 4, marginBottom: 4 }}>
                      {['4','5','6','-'].map(k => (
                        <TouchableOpacity key={k} style={[styles.largeNumpadKey, k==='-' && { backgroundColor: '#e3f2fd' }]} 
                          onPress={() => setEditMemoText(prev => prev + k)}>
                          <Text style={[styles.largeNumpadKeyText, k==='-' && { color: '#1976d2' }]}>{k}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    <View style={{ flexDirection: 'row', gap: 4, marginBottom: 4 }}>
                      {['1','2','3','*'].map(k => (
                        <TouchableOpacity key={k} style={[styles.largeNumpadKey, k==='*' && { backgroundColor: '#e3f2fd' }]} 
                          onPress={() => setEditMemoText(prev => prev + k)}>
                          <Text style={[styles.largeNumpadKeyText, k==='*' && { color: '#1976d2' }]}>{k === '*' ? '×' : k}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    <View style={{ flexDirection: 'row', gap: 4 }}>
                      {[',','0','.','/'].map(k => (
                        <TouchableOpacity key={k} style={[styles.largeNumpadKey, k==='/' && { backgroundColor: '#e3f2fd' }]} 
                          onPress={() => setEditMemoText(prev => prev + k)}>
                          <Text style={[styles.largeNumpadKeyText, k==='/' && { color: '#1976d2' }]}>{k === '/' ? '÷' : k}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </>
                ) : (
                  <>
                    <View style={{ flexDirection: 'row', gap: 3, marginBottom: 3 }}>
                      {['m','m²','m³','lfm','Stk'].map(k => (
                        <TouchableOpacity key={k} style={[styles.largeNumpadKey, { backgroundColor: '#e8f5e9' }]} 
                          onPress={() => setEditMemoText(prev => prev + k)}>
                          <Text style={{ fontSize: 12, fontWeight: '600', color: '#388e3c' }}>{k}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    <View style={{ flexDirection: 'row', gap: 3, marginBottom: 3 }}>
                      {['a','b','c','d','e','f','g','h'].map(k => (
                        <TouchableOpacity key={k} style={styles.largeNumpadKey} 
                          onPress={() => setEditMemoText(prev => prev + (textNumpadCaps ? k.toUpperCase() : k))}>
                          <Text style={styles.largeNumpadKeyText}>{textNumpadCaps ? k.toUpperCase() : k}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    <View style={{ flexDirection: 'row', gap: 3, marginBottom: 3 }}>
                      {['i','j','k','l','m','n','o','p'].map(k => (
                        <TouchableOpacity key={k} style={styles.largeNumpadKey} 
                          onPress={() => setEditMemoText(prev => prev + (textNumpadCaps ? k.toUpperCase() : k))}>
                          <Text style={styles.largeNumpadKeyText}>{textNumpadCaps ? k.toUpperCase() : k}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    <View style={{ flexDirection: 'row', gap: 3, marginBottom: 3 }}>
                      {['q','r','s','t','u','v','w','x'].map(k => (
                        <TouchableOpacity key={k} style={styles.largeNumpadKey} 
                          onPress={() => setEditMemoText(prev => prev + (textNumpadCaps ? k.toUpperCase() : k))}>
                          <Text style={styles.largeNumpadKeyText}>{textNumpadCaps ? k.toUpperCase() : k}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    <View style={{ flexDirection: 'row', gap: 3 }}>
                      <TouchableOpacity style={[styles.largeNumpadKey, textNumpadCaps && { backgroundColor: '#3949ab' }]} 
                        onPress={() => setTextNumpadCaps(!textNumpadCaps)}>
                        <Ionicons name="arrow-up" size={18} color={textNumpadCaps ? '#fff' : '#666'} />
                      </TouchableOpacity>
                      {['y','z','ä','ö','ü','ß',' '].map(k => (
                        <TouchableOpacity key={k} style={styles.largeNumpadKey} 
                          onPress={() => setEditMemoText(prev => prev + (k === ' ' ? ' ' : (textNumpadCaps ? k.toUpperCase() : k)))}>
                          <Text style={styles.largeNumpadKeyText}>{k === ' ' ? '␣' : (textNumpadCaps ? k.toUpperCase() : k)}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </>
                )}
                <View style={{ flexDirection: 'row', gap: 4, marginTop: 6 }}>
                  <TouchableOpacity style={[styles.largeNumpadKey, { backgroundColor: '#fff3e0' }]} 
                    onPress={() => setEditMemoText('')}>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: '#f57c00' }}>C</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.largeNumpadKey, { backgroundColor: '#ffebee' }]} 
                    onPress={() => setEditMemoText(prev => prev.slice(0, -1))}>
                    <Ionicons name="backspace-outline" size={20} color="#f44336" />
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.largeNumpadKey, { flex: 2, backgroundColor: '#4CAF50' }]} 
                    onPress={() => setShowTextNumpad(false)}>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: '#fff' }}>OK</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
            
            {/* Color picker */}
            <View style={{ flexDirection: 'row', justifyContent: 'center', marginVertical: 10 }}>
              {['#FF0000', '#2196F3', '#4CAF50', '#FF9800', '#9C27B0', '#000000'].map(color => (
                <TouchableOpacity
                  key={color}
                  onPress={() => setAnnotationColor(color)}
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 16,
                    backgroundColor: color,
                    marginHorizontal: 5,
                    borderWidth: annotationColor === color ? 3 : 1,
                    borderColor: annotationColor === color ? '#fff' : '#ccc',
                  }}
                />
              ))}
            </View>
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalButton}
                onPress={() => { setShowEditMemoModal(false); setEditMemoText(''); setEditingMemoId(null); }}
              >
                <Text style={styles.modalButtonText}>Abbrechen</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.confirmButton]}
                onPress={updateMemoAnnotation}
              >
                <Text style={styles.confirmButtonText}>Speichern</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        </View>
      </Modal>

      {/* Results Modal */}
      <Modal visible={showResultsModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxHeight: '85%', width: '92%' }]}>
            <Text style={styles.modalTitle}>Berechnungsdetails</Text>
            
            <ScrollView style={styles.resultsScroll}>
              {/* Main Areas - simplified without edge lengths */}
              {polygons.filter(p => p.type === 'main').length > 0 && (
                <View style={styles.resultsSection}>
                  <Text style={styles.resultsSectionTitle}>Hauptflächen</Text>
                  
                  {polygons.filter(p => p.type === 'main').map((polygon) => {
                    const area = calculatePolygonArea(polygon.points);
                    
                    return (
                      <View key={polygon.id} style={styles.resultCard}>
                        <View style={styles.resultCardHeader}>
                          <Text style={styles.resultCardTitle}>{polygon.name}</Text>
                          <Text style={styles.resultCardValue}>+{area.toFixed(2)} m²</Text>
                        </View>
                      </View>
                    );
                  })}
                  
                  {/* Subtotal for main areas */}
                  <View style={styles.resultSubtotal}>
                    <Text style={styles.resultSubtotalLabel}>Brutto-Fläche:</Text>
                    <Text style={styles.resultSubtotalValue}>
                      {polygons.filter(p => p.type === 'main').reduce((sum, p) => sum + calculatePolygonArea(p.points), 0).toFixed(2)} m²
                    </Text>
                  </View>
                </View>
              )}
              
              {/* Deduction Areas - simplified */}
              {polygons.filter(p => p.type === 'deduction').length > 0 && (
                <View style={styles.resultsSection}>
                  <Text style={[styles.resultsSectionTitle, { color: '#f44336' }]}>Abzüge</Text>
                  
                  {polygons.filter(p => p.type === 'deduction').map((polygon) => {
                    const area = calculatePolygonArea(polygon.points);
                    
                    return (
                      <View key={polygon.id} style={[styles.resultCard, { borderLeftColor: '#f44336' }]}>
                        <View style={styles.resultCardHeader}>
                          <Text style={styles.resultCardTitle}>{polygon.name}</Text>
                          <Text style={[styles.resultCardValue, { color: '#f44336' }]}>-{area.toFixed(2)} m²</Text>
                        </View>
                      </View>
                    );
                  })}
                  
                  {/* Subtotal for deductions */}
                  <View style={[styles.resultSubtotal, { backgroundColor: '#ffebee' }]}>
                    <Text style={styles.resultSubtotalLabel}>Gesamt Abzüge:</Text>
                    <Text style={[styles.resultSubtotalValue, { color: '#f44336' }]}>
                      -{polygons.filter(p => p.type === 'deduction').reduce((sum, p) => sum + calculatePolygonArea(p.points), 0).toFixed(2)} m²
                    </Text>
                  </View>
                </View>
              )}
              
              {/* Final Calculation */}
              <View style={styles.resultsSection}>
                <Text style={styles.resultsSectionTitle}>Flächenberechnung</Text>
                <View style={styles.calculationSteps}>
                  <Text style={styles.calculationStep}>
                    Brutto: {polygons.filter(p => p.type === 'main').reduce((sum, p) => sum + calculatePolygonArea(p.points), 0).toFixed(2)} m²
                  </Text>
                  {polygons.filter(p => p.type === 'deduction').length > 0 && (
                    <Text style={styles.calculationStep}>
                      − Abzüge: {polygons.filter(p => p.type === 'deduction').reduce((sum, p) => sum + calculatePolygonArea(p.points), 0).toFixed(2)} m²
                    </Text>
                  )}
                  <View style={styles.calculationLine} />
                  <Text style={styles.calculationResult}>
                    = Netto: {results.netArea.toFixed(2)} m²
                  </Text>
                </View>
              </View>
              
              {/* Lines per Main Area */}
              {polygons.filter(p => p.type === 'main').length > 0 && (
                <View style={styles.resultsSection}>
                  <Text style={styles.resultsSectionTitle}>Linien pro Grundfläche</Text>
                  
                  {polygons.filter(p => p.type === 'main').map((polygon) => {
                    // Get all lines for this main polygon
                    const polygonLines = lines.filter(l => l.polygonId === polygon.id);
                    
                    // Group lines by category
                    const categoryGroups: { [key: string]: number[] } = {};
                    polygonLines.forEach(line => {
                      if (polygon.points.length > line.pointIndex) {
                        const point = polygon.points[line.pointIndex];
                        const nextPoint = polygon.points[(line.pointIndex + 1) % polygon.points.length];
                        const length = calculateLineLength(point, nextPoint);
                        if (length > 0.01) {
                          if (!categoryGroups[line.category]) {
                            categoryGroups[line.category] = [];
                          }
                          categoryGroups[line.category].push(length);
                        }
                      }
                    });
                    
                    // If no categories assigned, show message
                    if (Object.keys(categoryGroups).length === 0) {
                      return (
                        <View key={polygon.id} style={[styles.resultCard, { borderLeftColor: '#4CAF50' }]}>
                          <TouchableOpacity 
                            onPress={() => {
                              Alert.prompt(
                                'Name ändern',
                                'Neuer Name für diese Grundfläche:',
                                (newName) => {
                                  if (newName && newName.trim()) {
                                    setPolygons(polygons.map(p => 
                                      p.id === polygon.id ? { ...p, name: newName.trim() } : p
                                    ));
                                  }
                                },
                                'plain-text',
                                polygon.name
                              );
                            }}
                          >
                            <Text style={[styles.resultCardTitle, { marginBottom: 4, textDecorationLine: 'underline' }]}>{polygon.name}</Text>
                          </TouchableOpacity>
                          <Text style={{ fontSize: 11, color: '#999', fontStyle: 'italic' }}>
                            Keine Linien-Kategorien zugewiesen
                          </Text>
                        </View>
                      );
                    }
                    
                    return (
                      <View key={polygon.id} style={[styles.resultCard, { borderLeftColor: '#4CAF50' }]}>
                        <TouchableOpacity 
                          onPress={() => {
                            Alert.prompt(
                              'Name ändern',
                              'Neuer Name für diese Grundfläche:',
                              (newName) => {
                                if (newName && newName.trim()) {
                                  setPolygons(polygons.map(p => 
                                    p.id === polygon.id ? { ...p, name: newName.trim() } : p
                                  ));
                                }
                              },
                              'plain-text',
                              polygon.name
                            );
                          }}
                        >
                          <Text style={[styles.resultCardTitle, { marginBottom: 8, textDecorationLine: 'underline' }]}>{polygon.name}</Text>
                        </TouchableOpacity>
                        
                        {Object.entries(categoryGroups).map(([category, lengths]) => {
                          const total = lengths.reduce((sum, l) => sum + l, 0);
                          const showBreakdown = lengths.length >= 2;
                          const displayName = formatCategoryWithShortcut(category);
                          
                          return (
                            <View key={category} style={{ marginBottom: 4 }}>
                              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                                  <View style={[styles.categoryDot, { backgroundColor: getCategoryColor(category), width: 8, height: 8, marginRight: 6 }]} />
                                  <Text style={{ fontSize: 12, color: getCategoryColor(category), fontWeight: '600' }}>{displayName}</Text>
                                </View>
                                <Text style={{ fontSize: 12, fontWeight: '700', color: getCategoryColor(category) }}>
                                  {total.toFixed(2)} m
                                </Text>
                              </View>
                              {showBreakdown && (
                                <Text style={{ fontSize: 11, color: getCategoryColor(category), marginLeft: 14, marginTop: 2, opacity: 0.7 }}>
                                  {lengths.map(l => l.toFixed(2)).join(' + ')} = {total.toFixed(2)} m
                                </Text>
                              )}
                            </View>
                          );
                        })}
                      </View>
                    );
                  })}
                </View>
              )}
              
              {/* Lines per Deduction Area */}
              {polygons.filter(p => p.type === 'deduction').length > 0 && (
                <View style={styles.resultsSection}>
                  <Text style={styles.resultsSectionTitle}>Linien pro Abzugsfläche</Text>
                  
                  {polygons.filter(p => p.type === 'deduction').map((polygon) => {
                    // Get all lines for this deduction polygon
                    const polygonLines = lines.filter(l => l.polygonId === polygon.id);
                    
                    // Group lines by category
                    const categoryGroups: { [key: string]: number[] } = {};
                    polygonLines.forEach(line => {
                      if (polygon.points.length > line.pointIndex) {
                        const point = polygon.points[line.pointIndex];
                        const nextPoint = polygon.points[(line.pointIndex + 1) % polygon.points.length];
                        const length = calculateLineLength(point, nextPoint);
                        if (length > 0.01) {
                          if (!categoryGroups[line.category]) {
                            categoryGroups[line.category] = [];
                          }
                          categoryGroups[line.category].push(length);
                        }
                      }
                    });
                    
                    // If no categories assigned, show message
                    if (Object.keys(categoryGroups).length === 0) {
                      return (
                        <View key={polygon.id} style={[styles.resultCard, { borderLeftColor: '#f44336' }]}>
                          <TouchableOpacity 
                            onPress={() => {
                              Alert.prompt(
                                'Name ändern',
                                'Neuer Name für diese Abzugsfläche:',
                                (newName) => {
                                  if (newName && newName.trim()) {
                                    setPolygons(polygons.map(p => 
                                      p.id === polygon.id ? { ...p, name: newName.trim() } : p
                                    ));
                                  }
                                },
                                'plain-text',
                                polygon.name
                              );
                            }}
                          >
                            <Text style={[styles.resultCardTitle, { marginBottom: 4, textDecorationLine: 'underline' }]}>{polygon.name}</Text>
                          </TouchableOpacity>
                          <Text style={{ fontSize: 11, color: '#999', fontStyle: 'italic' }}>
                            Keine Linien-Kategorien zugewiesen
                          </Text>
                        </View>
                      );
                    }
                    
                    return (
                      <View key={polygon.id} style={[styles.resultCard, { borderLeftColor: '#f44336' }]}>
                        <TouchableOpacity 
                          onPress={() => {
                            Alert.prompt(
                              'Name ändern',
                              'Neuer Name für diese Abzugsfläche:',
                              (newName) => {
                                if (newName && newName.trim()) {
                                  setPolygons(polygons.map(p => 
                                    p.id === polygon.id ? { ...p, name: newName.trim() } : p
                                  ));
                                }
                              },
                              'plain-text',
                              polygon.name
                            );
                          }}
                        >
                          <Text style={[styles.resultCardTitle, { marginBottom: 8, textDecorationLine: 'underline' }]}>{polygon.name}</Text>
                        </TouchableOpacity>
                        
                        {Object.entries(categoryGroups).map(([category, lengths]) => {
                          const total = lengths.reduce((sum, l) => sum + l, 0);
                          const showBreakdown = lengths.length >= 2;
                          const displayName = formatCategoryWithShortcut(category);
                          
                          return (
                            <View key={category} style={{ marginBottom: 4 }}>
                              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                                  <View style={[styles.categoryDot, { backgroundColor: getCategoryColor(category), width: 8, height: 8, marginRight: 6 }]} />
                                  <Text style={{ fontSize: 12, color: getCategoryColor(category), fontWeight: '600' }}>{displayName}</Text>
                                </View>
                                <Text style={{ fontSize: 12, fontWeight: '700', color: getCategoryColor(category) }}>
                                  {total.toFixed(2)} m
                                </Text>
                              </View>
                              {showBreakdown && (
                                <Text style={{ fontSize: 11, color: getCategoryColor(category), marginLeft: 14, marginTop: 2, opacity: 0.7 }}>
                                  {lengths.map(l => l.toFixed(2)).join(' + ')} = {total.toFixed(2)} m
                                </Text>
                              )}
                            </View>
                          );
                        })}
                      </View>
                    );
                  })}
                </View>
              )}
              
              {/* Line Results with calculation breakdown */}
              {Object.keys(results.linesByCategory).length > 0 && (
                <View style={styles.resultsSection}>
                  <Text style={styles.resultsSectionTitle}>Linien nach Kategorie</Text>
                  
                  {Object.entries(results.linesByCategory).map(([category, totalLength]) => {
                    // Find all individual line segments for this category from the lines array
                    const categoryLines = lines.filter(l => l.category === category);
                    const individualLengths: number[] = [];
                    const displayName = formatCategoryWithShortcut(category);
                    
                    categoryLines.forEach(line => {
                      const polygon = polygons.find(p => p.id === line.polygonId);
                      if (polygon && polygon.points.length > line.pointIndex) {
                        const point = polygon.points[line.pointIndex];
                        const nextPoint = polygon.points[(line.pointIndex + 1) % polygon.points.length];
                        const length = calculateLineLength(point, nextPoint);
                        if (length > 0.01) {
                          individualLengths.push(length);
                        }
                      }
                    });
                    
                    // Show calculation breakdown when there are 2 or more lines of same category
                    const showBreakdown = individualLengths.length >= 2;
                    
                    return (
                      <View key={category} style={[styles.resultCard, { borderLeftColor: getCategoryColor(category) }]}>
                        <View style={styles.resultCardHeader}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                            <View style={[styles.categoryDot, { backgroundColor: getCategoryColor(category) }]} />
                            <Text style={[styles.resultCardTitle, { color: getCategoryColor(category) }]}>{displayName}</Text>
                          </View>
                          <Text style={[styles.resultCardValue, { color: getCategoryColor(category) }]}>
                            {(totalLength as number).toFixed(2)} m
                          </Text>
                        </View>
                        {showBreakdown && (
                          <View style={{ paddingTop: 6, borderTopWidth: 1, borderTopColor: '#eee', marginTop: 6 }}>
                            <Text style={[styles.resultCardDetail, { color: getCategoryColor(category), opacity: 0.8 }]}>
                              {individualLengths.map(l => l.toFixed(2)).join(' + ')} = {(totalLength as number).toFixed(2)} m
                            </Text>
                          </View>
                        )}
                      </View>
                    );
                  })}
                </View>
              )}
            </ScrollView>
            
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.confirmButton]}
                onPress={() => setShowResultsModal(false)}
              >
                <Text style={styles.confirmButtonText}>Schließen</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Grid Size Modal */}
      <Modal visible={showGridSizeModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Rastergröße</Text>
            <Text style={styles.modalText}>Wählen Sie die Größe eines Rasterfelds:</Text>
            
            <View style={styles.gridSizeOptions}>
              {[
                { value: 0.1, label: '10 cm' },
                { value: 0.25, label: '25 cm' },
                { value: 0.5, label: '50 cm' },
                { value: 1, label: '1 m' },
                { value: 2, label: '2 m' },
              ].map((option) => (
                <TouchableOpacity
                  key={option.value}
                  style={[
                    styles.gridSizeOption,
                    gridSize === option.value && styles.gridSizeOptionActive
                  ]}
                  onPress={() => {
                    setGridSize(option.value);
                    setShowGridSizeModal(false);
                  }}
                >
                  <Text style={[
                    styles.gridSizeOptionText,
                    gridSize === option.value && styles.gridSizeOptionTextActive
                  ]}>
                    {option.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => setShowGridSizeModal(false)}
              >
                <Text style={styles.cancelButtonText}>Abbrechen</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Parallel Guide Line Modal - Draggable with Numpad */}
      <Modal visible={showParallelModal} transparent animationType="fade">
        <View style={[styles.modalOverlay, { justifyContent: 'flex-start', paddingTop: 80 }]}>
          <Animated.View 
            style={[
              styles.modalContent, 
              { maxWidth: 360, transform: parallelModalPosition.getTranslateTransform() }
            ]}
          >
            {/* Drag Handle */}
            <View {...parallelModalPanResponder.panHandlers} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: '#eee' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Ionicons name="move" size={16} color="#999" />
                <Text style={{ fontSize: 10, color: '#999', marginLeft: 4 }}>Ziehen</Text>
              </View>
              <Text style={[styles.modalTitle, { marginBottom: 0 }]}>Parallele Hilfslinie</Text>
              <TouchableOpacity onPress={() => {
                setShowParallelModal(false);
                setSelectedGuideLineId(null);
                setParallelDistance('');
                setShowParallelNumpad(false);
              }}>
                <Ionicons name="close-circle" size={24} color="#999" />
              </TouchableOpacity>
            </View>
            
            <ScrollView style={{ maxHeight: 400 }} showsVerticalScrollIndicator={false}>
              <Text style={styles.modalText}>
                Abstand zur ausgewählten Hilfslinie:
              </Text>
              <View style={[styles.inputRow, { marginBottom: 10 }]}>
                <TextInput
                  style={[styles.modalInput, { 
                    flex: 1, 
                    borderColor: showParallelNumpad ? '#9C27B0' : '#ddd',
                    borderWidth: 2,
                    backgroundColor: showParallelNumpad ? '#f3e5f5' : '#fff'
                  }]}
                  value={parallelDistance}
                  onChangeText={setParallelDistance}
                  placeholder="z.B. 0.5"
                  keyboardType="decimal-pad"
                  onFocus={() => setShowParallelNumpad(true)}
                />
                <Text style={styles.inputUnit}>Meter</Text>
                <TouchableOpacity
                  style={{ 
                    marginLeft: 8, 
                    padding: 8, 
                    backgroundColor: showParallelNumpad ? '#9C27B0' : '#e8eaf6', 
                    borderRadius: 8 
                  }}
                  onPress={() => setShowParallelNumpad(!showParallelNumpad)}
                >
                  <Ionicons name="keypad" size={22} color={showParallelNumpad ? '#fff' : '#3949ab'} />
                </TouchableOpacity>
              </View>
              
              {/* Embedded Numpad */}
              {showParallelNumpad && (
                <View style={{ backgroundColor: '#f5f5f5', borderRadius: 8, padding: 8, marginBottom: 12 }}>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 6 }}>
                    {['7', '8', '9', '4', '5', '6', '1', '2', '3', '.', '0', '⌫'].map((key) => (
                      <TouchableOpacity
                        key={key}
                        style={{
                          width: 52,
                          height: 44,
                          backgroundColor: key === '⌫' ? '#ff5722' : '#fff',
                          borderRadius: 8,
                          justifyContent: 'center',
                          alignItems: 'center',
                          borderWidth: 1,
                          borderColor: '#ddd',
                        }}
                        onPress={() => handleParallelNumpadPress(key)}
                      >
                        <Text style={{ 
                          fontSize: 20, 
                          fontWeight: '600', 
                          color: key === '⌫' ? '#fff' : '#333' 
                        }}>
                          {key}
                        </Text>
                      </TouchableOpacity>
                    ))}
                    <TouchableOpacity
                      style={{
                        width: 110,
                        height: 44,
                        backgroundColor: '#ef5350',
                        borderRadius: 8,
                        justifyContent: 'center',
                        alignItems: 'center',
                      }}
                      onPress={() => handleParallelNumpadPress('C')}
                    >
                      <Text style={{ fontSize: 16, fontWeight: '700', color: '#fff' }}>Löschen</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
              
              <Text style={[styles.modalText, { marginBottom: 8 }]}>Richtung wählen:</Text>
              <View style={[styles.directionButtons, { gap: 8 }]}>
                <TouchableOpacity
                  style={[styles.directionButton, { backgroundColor: '#4CAF50', flex: 1 }]}
                  onPress={() => {
                    const distance = parseFloat(parallelDistance.replace(',', '.'));
                    if (!isNaN(distance) && distance > 0 && selectedGuideLineId) {
                      createParallelGuideLine(selectedGuideLineId, -distance);
                    }
                    setShowParallelModal(false);
                    setSelectedGuideLineId(null);
                    setParallelDistance('');
                    setShowParallelNumpad(false);
                    setMode('select');
                  }}
                >
                  <Ionicons name="arrow-forward" size={20} color="#fff" />
                  <Text style={styles.directionButtonText}>Rechts / Oben</Text>
                </TouchableOpacity>
                
                <TouchableOpacity
                  style={[styles.directionButton, { backgroundColor: '#2196F3', flex: 1 }]}
                  onPress={() => {
                    const distance = parseFloat(parallelDistance.replace(',', '.'));
                    if (!isNaN(distance) && distance > 0 && selectedGuideLineId) {
                      createParallelGuideLine(selectedGuideLineId, distance);
                    }
                    setShowParallelModal(false);
                    setSelectedGuideLineId(null);
                    setParallelDistance('');
                    setShowParallelNumpad(false);
                    setMode('select');
                  }}
                >
                  <Ionicons name="arrow-back" size={20} color="#fff" />
                  <Text style={styles.directionButtonText}>Links / Unten</Text>
                </TouchableOpacity>
                
                <TouchableOpacity
                  style={[styles.directionButton, { backgroundColor: '#9C27B0', flex: 1 }]}
                  onPress={() => {
                    const distance = parseFloat(parallelDistance.replace(',', '.'));
                    if (!isNaN(distance) && distance > 0 && selectedGuideLineId) {
                      createParallelGuideLine(selectedGuideLineId, distance);
                      createParallelGuideLine(selectedGuideLineId, -distance);
                    }
                    setShowParallelModal(false);
                    setSelectedGuideLineId(null);
                    setParallelDistance('');
                    setShowParallelNumpad(false);
                    setMode('select');
                  }}
                >
                  <Ionicons name="swap-horizontal" size={20} color="#fff" />
                  <Text style={styles.directionButtonText}>Beidseitig</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
            
            <View style={[styles.modalButtons, { marginTop: 12 }]}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => {
                  setShowParallelModal(false);
                  setSelectedGuideLineId(null);
                  setParallelDistance('');
                  setShowParallelNumpad(false);
                }}
              >
                <Text style={styles.cancelButtonText}>Abbrechen</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        </View>
      </Modal>

      {/* Angle Settings Modal - Draggable */}
      <Modal visible={showAngleModal} transparent animationType="fade">
        <View style={[styles.modalOverlay, { justifyContent: 'flex-start', paddingTop: 80 }]}>
          <Animated.View 
            style={[
              styles.modalContent, 
              { maxWidth: 340, transform: angleModalPosition.getTranslateTransform() }
            ]}
          >
            {/* Drag Handle */}
            <View {...angleModalPanResponder.panHandlers} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: '#eee' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Ionicons name="move" size={16} color="#999" />
                <Text style={{ fontSize: 10, color: '#999', marginLeft: 4 }}>Ziehen</Text>
              </View>
              <Text style={[styles.modalTitle, { marginBottom: 0 }]}>Winkel & Maß</Text>
              <TouchableOpacity onPress={() => setShowAngleModal(false)}>
                <Ionicons name="close-circle" size={24} color="#999" />
              </TouchableOpacity>
            </View>
            
            {/* Auto-Snap Toggle - Compact */}
            <TouchableOpacity
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                backgroundColor: snapToAngles ? '#e3f2fd' : '#f5f5f5',
                padding: 8,
                borderRadius: 6,
                marginBottom: 8,
                borderWidth: 1,
                borderColor: snapToAngles ? '#2196F3' : '#ddd',
              }}
              onPress={() => setSnapToAngles(!snapToAngles)}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Ionicons name="magnet" size={16} color={snapToAngles ? '#2196F3' : '#666'} />
                <Text style={{ marginLeft: 6, fontSize: 11, color: snapToAngles ? '#2196F3' : '#666' }}>
                  Auto-Einrasten (0°, 45°, 90°...)
                </Text>
              </View>
              <Ionicons 
                name={snapToAngles ? "checkbox" : "square-outline"} 
                size={20} 
                color={snapToAngles ? '#2196F3' : '#999'} 
              />
            </TouchableOpacity>
            
            {/* Fixed Angle Section */}
            <Text style={{ fontSize: 11, color: '#666', marginBottom: 4 }}>
              Fester Winkel:
            </Text>
            
            {/* Angle Direction Preview - Compact */}
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
              <Svg width={70} height={70} viewBox="0 0 120 120">
                <Circle cx="60" cy="60" r="50" fill="#f5f5f5" stroke="#ddd" strokeWidth="2" />
                <SvgText x="60" y="20" textAnchor="middle" fontSize="12" fill="#999">90°</SvgText>
                <SvgText x="110" y="64" textAnchor="middle" fontSize="12" fill="#999">0°</SvgText>
                <SvgText x="60" y="108" textAnchor="middle" fontSize="12" fill="#999">270°</SvgText>
                <SvgText x="12" y="64" textAnchor="middle" fontSize="12" fill="#999">180°</SvgText>
                <Circle cx="60" cy="60" r="4" fill="#1976d2" />
                {fixedAngle !== null && (
                  <G rotation={-fixedAngle + 90} origin="60, 60">
                    <Line x1="60" y1="60" x2="60" y2="20" stroke="#E91E63" strokeWidth="3" />
                    <SvgPolygon points="60,14 54,26 66,26" fill="#E91E63" />
                  </G>
                )}
              </Svg>
              {fixedAngle !== null && (
                <Text style={{ fontSize: 18, fontWeight: '700', color: '#E91E63', marginLeft: 8 }}>{fixedAngle}°</Text>
              )}
              {fixedAngle === null && (
                <Text style={{ fontSize: 12, color: '#999', marginLeft: 8 }}>Kein Winkel gewählt</Text>
              )}
            </View>
            
            {/* Preset Angles - Compact */}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
              {[0, 30, 45, 60, 90, 120, 135, 180, 225, 270, 315].map((angle) => (
                <TouchableOpacity
                  key={angle}
                  style={{
                    paddingHorizontal: 8,
                    paddingVertical: 4,
                    backgroundColor: fixedAngle === angle ? '#E91E63' : '#f0f0f0',
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: fixedAngle === angle ? '#E91E63' : '#ddd',
                  }}
                  onPress={() => {
                    setFixedAngle(fixedAngle === angle ? null : angle);
                    // Nach Winkelauswahl zum Längenfeld springen
                    if (fixedAngle !== angle) {
                      setTimeout(() => lengthInputRef?.current?.focus(), 100);
                    }
                  }}
                >
                  <Text style={{ 
                    fontSize: 10, 
                    fontWeight: '600',
                    color: fixedAngle === angle ? '#fff' : '#333' 
                  }}>
                    {angle}°
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            
            {/* Custom Angle Input - Compact */}
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
              <TextInput
                ref={angleInputRef}
                style={{
                  flex: 1,
                  borderWidth: 2,
                  borderColor: angleNumpadTarget === 'angle' && showAngleNumpad ? '#E91E63' : '#ddd',
                  borderRadius: 6,
                  padding: 8,
                  fontSize: 14,
                  backgroundColor: angleNumpadTarget === 'angle' && showAngleNumpad ? '#fce4ec' : '#fff',
                }}
                placeholder="z.B. -90 für 270°"
                keyboardType="default"
                value={angleInputText}
                onChangeText={(text) => {
                  // Erlaube Zahlen und Minus
                  const filtered = text.replace(/[^0-9\-]/g, '');
                  setAngleInputText(filtered);
                }}
                onEndEditing={() => {
                  // Beim Verlassen des Felds: Winkel umwandeln
                  if (angleInputText === '' || angleInputText === '-') {
                    setFixedAngle(null);
                    setAngleInputText('');
                    return;
                  }
                  
                  let num = parseInt(angleInputText);
                  if (!isNaN(num)) {
                    // Negative Winkel in positive umwandeln: -90 → 270
                    while (num < 0) {
                      num = 360 + num;
                    }
                    num = num % 360;
                    setFixedAngle(num);
                    setAngleInputText(num.toString());
                  }
                }}
                onFocus={() => { 
                  setAngleNumpadTarget('angle'); 
                  setShowAngleNumpad(true);
                  Keyboard.dismiss(); // iPad-Tastatur ausblenden
                  // Aktuellen Winkel in Textfeld übernehmen
                  if (fixedAngle !== null && ![0, 15, 30, 45, 60, 90, 120, 135].includes(fixedAngle)) {
                    setAngleInputText(fixedAngle.toString());
                  } else {
                    setAngleInputText('');
                  }
                }}
                onSubmitEditing={() => {
                  // Winkel umwandeln und zum Längenfeld springen
                  if (angleInputText !== '' && angleInputText !== '-') {
                    let num = parseInt(angleInputText);
                    if (!isNaN(num)) {
                      while (num < 0) {
                        num = 360 + num;
                      }
                      num = num % 360;
                      setFixedAngle(num);
                      setAngleInputText(num.toString());
                    }
                  }
                  setTimeout(() => lengthInputRef?.current?.focus(), 50);
                }}
                returnKeyType="next"
              />
              <Text style={{ marginLeft: 6, fontSize: 14, color: '#666' }}>°</Text>
              <TouchableOpacity
                style={{ 
                  marginLeft: 8, 
                  padding: 8, 
                  backgroundColor: angleNumpadTarget === 'angle' && showAngleNumpad ? '#E91E63' : '#e8eaf6', 
                  borderRadius: 8 
                }}
                onPress={() => { setAngleNumpadTarget('angle'); setShowAngleNumpad(!showAngleNumpad || angleNumpadTarget !== 'angle'); Keyboard.dismiss(); }}
              >
                <Ionicons name="keypad" size={22} color={angleNumpadTarget === 'angle' && showAngleNumpad ? '#fff' : '#3949ab'} />
              </TouchableOpacity>
            </View>
            
            {/* Length Input Section - Compact */}
            <View style={{ marginBottom: 8 }}>
              <Text style={{ fontSize: 11, color: '#666', marginBottom: 4 }}>Feste Länge:</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <TextInput
                  ref={lengthInputRef}
                  style={{
                    flex: 1,
                    borderWidth: 2,
                    borderColor: angleNumpadTarget === 'length' && showAngleNumpad ? '#4CAF50' : (fixedLength ? '#4CAF50' : '#ddd'),
                    borderRadius: 6,
                    padding: 8,
                    fontSize: 14,
                    backgroundColor: angleNumpadTarget === 'length' && showAngleNumpad ? '#e8f5e9' : (fixedLength ? '#e8f5e9' : '#fff'),
                  }}
                  placeholder="z.B. 2.5 oder 1+0.5"
                  keyboardType="decimal-pad"
                  value={fixedLength}
                  onChangeText={(text) => {
                    const filtered = text.replace(/[^0-9.,+\-*/()]/g, '');
                    setFixedLength(filtered);
                  }}
                  onFocus={() => { setAngleNumpadTarget('length'); setShowAngleNumpad(true); Keyboard.dismiss(); }}
                />
                <Text style={{ marginLeft: 6, fontSize: 14, color: '#666' }}>m</Text>
                <TouchableOpacity
                  style={{ 
                    marginLeft: 6, 
                    padding: 6, 
                    backgroundColor: angleNumpadTarget === 'length' && showAngleNumpad ? '#4CAF50' : '#e8eaf6', 
                    borderRadius: 6 
                  }}
                  onPress={() => { setAngleNumpadTarget('length'); setShowAngleNumpad(!showAngleNumpad || angleNumpadTarget !== 'length'); Keyboard.dismiss(); }}
                >
                  <Ionicons name="keypad" size={20} color={angleNumpadTarget === 'length' && showAngleNumpad ? '#fff' : '#3949ab'} />
                </TouchableOpacity>
                {fixedLength !== '' && (
                  <TouchableOpacity style={{ marginLeft: 2, padding: 2 }} onPress={() => setFixedLength('')}>
                    <Ionicons name="close-circle" size={22} color="#999" />
                  </TouchableOpacity>
                )}
              </View>
            </View>
            
            {/* Compact Status Summary */}
            {(fixedAngle !== null || fixedLength !== '') && (
              <View style={{ 
                backgroundColor: '#e3f2fd', 
                padding: 6, 
                borderRadius: 6, 
                marginBottom: 8,
                flexDirection: 'row',
                alignItems: 'center',
              }}>
                <Ionicons name="information-circle" size={16} color="#1976d2" />
                <Text style={{ fontSize: 10, color: '#1976d2', marginLeft: 4 }}>
                  {fixedAngle !== null ? `${fixedAngle}°` : 'frei'}
                  {' • '}
                  {fixedLength !== '' ? `${fixedLength}m` : 'frei'}
                </Text>
              </View>
            )}
            
            {/* Action Buttons - Compact */}
            <View style={{ flexDirection: 'row', gap: 6, marginBottom: 8 }}>
              <TouchableOpacity
                style={{
                  flex: 1,
                  backgroundColor: '#4CAF50',
                  padding: 10,
                  borderRadius: 6,
                  alignItems: 'center',
                  flexDirection: 'row',
                  justifyContent: 'center',
                }}
                onPress={drawLineFromModal}
              >
                <Ionicons name="add-circle" size={18} color="#fff" />
                <Text style={{ color: '#fff', fontWeight: '600', marginLeft: 4, fontSize: 12 }}>Linie zeichnen</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{
                  backgroundColor: '#FF9800',
                  padding: 10,
                  borderRadius: 6,
                  alignItems: 'center',
                  flexDirection: 'row',
                  justifyContent: 'center',
                  paddingHorizontal: 12,
                }}
                onPress={undoLastPoint}
              >
                <Ionicons name="arrow-undo" size={18} color="#fff" />
                <Text style={{ color: '#fff', fontWeight: '600', marginLeft: 4, fontSize: 12 }}>Zurück</Text>
              </TouchableOpacity>
            </View>
            
            {/* Current Points Info - Compact */}
            {currentPoints.length > 0 && (
              <View style={{ 
                backgroundColor: '#fff3e0', 
                padding: 6, 
                borderRadius: 4, 
                marginBottom: 8,
                flexDirection: 'row',
                alignItems: 'center',
              }}>
                <Ionicons name="location" size={14} color="#FF9800" />
                <Text style={{ marginLeft: 4, fontSize: 10, color: '#e65100' }}>
                  {currentPoints.length} Punkt{currentPoints.length !== 1 ? 'e' : ''}
                </Text>
              </View>
            )}
            
            {/* Eingebautes Numpad - Kompakt */}
            {showAngleNumpad && (
              <View style={{ 
                backgroundColor: '#f9f9f9', 
                borderRadius: 8, 
                padding: 8, 
                marginBottom: 8,
                borderWidth: 1,
                borderColor: angleNumpadTarget === 'angle' ? '#E91E63' : '#4CAF50',
              }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <Text style={{ fontSize: 10, fontWeight: '600', color: angleNumpadTarget === 'angle' ? '#E91E63' : '#4CAF50' }}>
                    {angleNumpadTarget === 'angle' ? 'Winkel' : 'Länge'}
                  </Text>
                  <TouchableOpacity onPress={() => setShowAngleNumpad(false)}>
                    <Ionicons name="close-circle" size={18} color="#999" />
                  </TouchableOpacity>
                </View>
                {/* Zahlen-Reihen - Kompakt */}
                <View style={{ flexDirection: 'row', gap: 3, marginBottom: 3 }}>
                  {['7','8','9'].map(k => (
                    <TouchableOpacity key={k} style={styles.largeNumpadKey} onPress={() => handleAngleNumpadPress(k)}>
                      <Text style={styles.largeNumpadKeyText}>{k}</Text>
                    </TouchableOpacity>
                  ))}
                  {angleNumpadTarget === 'length' && (
                    <TouchableOpacity style={[styles.largeNumpadKey, { backgroundColor: '#e3f2fd' }]} onPress={() => handleAngleNumpadPress('+')}>
                      <Text style={{ fontSize: 14, fontWeight: '700', color: '#1976d2' }}>+</Text>
                    </TouchableOpacity>
                  )}
                </View>
                <View style={{ flexDirection: 'row', gap: 3, marginBottom: 3 }}>
                  {['4','5','6'].map(k => (
                    <TouchableOpacity key={k} style={styles.largeNumpadKey} onPress={() => handleAngleNumpadPress(k)}>
                      <Text style={styles.largeNumpadKeyText}>{k}</Text>
                    </TouchableOpacity>
                  ))}
                  {angleNumpadTarget === 'length' && (
                    <TouchableOpacity style={[styles.largeNumpadKey, { backgroundColor: '#e3f2fd' }]} onPress={() => handleAngleNumpadPress('-')}>
                      <Text style={{ fontSize: 14, fontWeight: '700', color: '#1976d2' }}>−</Text>
                    </TouchableOpacity>
                  )}
                </View>
                <View style={{ flexDirection: 'row', gap: 3, marginBottom: 3 }}>
                  {['1','2','3'].map(k => (
                    <TouchableOpacity key={k} style={styles.largeNumpadKey} onPress={() => handleAngleNumpadPress(k)}>
                      <Text style={styles.largeNumpadKeyText}>{k}</Text>
                    </TouchableOpacity>
                  ))}
                  {angleNumpadTarget === 'length' && (
                    <TouchableOpacity style={[styles.largeNumpadKey, { backgroundColor: '#e3f2fd' }]} onPress={() => handleAngleNumpadPress('*')}>
                      <Text style={{ fontSize: 14, fontWeight: '700', color: '#1976d2' }}>×</Text>
                    </TouchableOpacity>
                  )}
                </View>
                <View style={{ flexDirection: 'row', gap: 3 }}>
                  {angleNumpadTarget === 'length' ? (
                    <>
                      <TouchableOpacity style={styles.largeNumpadKey} onPress={() => handleAngleNumpadPress(',')}>
                        <Text style={styles.largeNumpadKeyText}>,</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.largeNumpadKey} onPress={() => handleAngleNumpadPress('0')}>
                        <Text style={styles.largeNumpadKeyText}>0</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.largeNumpadKey} onPress={() => handleAngleNumpadPress('.')}>
                        <Text style={styles.largeNumpadKeyText}>.</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.largeNumpadKey, { backgroundColor: '#e3f2fd' }]} onPress={() => handleAngleNumpadPress('/')}>
                        <Text style={{ fontSize: 14, fontWeight: '700', color: '#1976d2' }}>÷</Text>
                      </TouchableOpacity>
                    </>
                  ) : (
                    <>
                      <TouchableOpacity style={[styles.largeNumpadKey, { backgroundColor: '#e3f2fd' }]} onPress={() => handleAngleNumpadPress('-')}>
                        <Text style={{ fontSize: 18, fontWeight: '700', color: '#1976d2' }}>−</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.largeNumpadKey]} onPress={() => handleAngleNumpadPress('0')}>
                        <Text style={styles.largeNumpadKeyText}>0</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.largeNumpadKey, { backgroundColor: '#e3f2fd' }]} onPress={() => handleAngleNumpadPress('±')}>
                        <Text style={{ fontSize: 14, fontWeight: '700', color: '#1976d2' }}>±</Text>
                      </TouchableOpacity>
                    </>
                  )}
                </View>
                <View style={{ flexDirection: 'row', gap: 3, marginTop: 3 }}>
                  <TouchableOpacity style={[styles.largeNumpadKey, { backgroundColor: '#fff3e0' }]} onPress={() => handleAngleNumpadPress('C')}>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: '#f57c00' }}>C</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.largeNumpadKey, { backgroundColor: '#ffebee' }]} onPress={() => handleAngleNumpadPress('⌫')}>
                    <Ionicons name="backspace-outline" size={16} color="#f44336" />
                  </TouchableOpacity>
                  <TouchableOpacity 
                    style={[styles.largeNumpadKey, { flex: 2, backgroundColor: '#4CAF50' }]} 
                    onPress={() => {
                      setShowAngleNumpad(false);
                      // Wenn Winkel eingegeben wurde, zum Längenfeld springen
                      if (angleNumpadTarget === 'angle') {
                        setTimeout(() => lengthInputRef?.current?.focus(), 100);
                      }
                    }}
                  >
                    <Text style={{ fontSize: 12, fontWeight: '700', color: '#fff' }}>OK</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* Close Buttons - Compact with Move Handle */}
            <View style={{ flexDirection: 'row', gap: 6 }}>
              <View {...angleModalPanResponder.panHandlers} style={{
                backgroundColor: '#e0e0e0',
                padding: 10,
                borderRadius: 6,
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                <Ionicons name="move" size={18} color="#666" />
              </View>
              <TouchableOpacity
                style={{
                  flex: 1,
                  backgroundColor: '#f44336',
                  padding: 10,
                  borderRadius: 6,
                  alignItems: 'center',
                }}
                onPress={() => {
                  setFixedAngle(null);
                  setFixedLength('');
                  setSnapToAngles(false);
                }}
              >
                <Text style={{ color: '#fff', fontWeight: '600', fontSize: 12 }}>Alles aus</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{
                  flex: 1,
                  backgroundColor: '#666',
                  padding: 10,
                  borderRadius: 6,
                  alignItems: 'center',
                }}
                onPress={() => setShowAngleModal(false)}
              >
                <Text style={{ color: '#fff', fontWeight: '600', fontSize: 12 }}>Schließen</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        </View>
      </Modal>

      {/* Taschenrechner Modal */}
      <Modal visible={showCalculatorModal} transparent animationType="fade">
        <TouchableOpacity 
          style={styles.modalOverlay} 
          activeOpacity={1} 
          onPress={() => setShowCalculatorModal(false)}
        >
          <View 
            style={[styles.modalContent, { width: 300, padding: 0 }]}
            onStartShouldSetResponder={() => true}
          >
            {/* Calculator Display */}
            <View style={{ backgroundColor: '#1976d2', padding: 20, borderTopLeftRadius: 16, borderTopRightRadius: 16 }}>
              <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 16, textAlign: 'right', minHeight: 24 }}>
                {calculatorExpression || ' '}
              </Text>
              <Text style={{ color: '#fff', fontSize: 40, fontWeight: '300', textAlign: 'right' }}>
                {calculatorDisplay}
              </Text>
            </View>
            
            {/* Calculator Buttons */}
            <View style={{ padding: 10, backgroundColor: '#fff' }}>
              {/* Row 1: C, ⌫, %, ÷ */}
              <View style={{ flexDirection: 'row', marginBottom: 8 }}>
                <TouchableOpacity 
                  style={{ flex: 1, height: 56, backgroundColor: '#ffebee', borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginHorizontal: 4 }}
                  onPress={() => {
                    setCalculatorDisplay('0');
                    setCalculatorExpression('');
                    setCalculatorPrevValue(null);
                    setCalculatorOperator(null);
                    setCalculatorWaitingForOperand(false);
                  }}
                >
                  <Text style={{ fontSize: 22, fontWeight: '600', color: '#f44336' }}>C</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={{ flex: 1, height: 56, backgroundColor: '#f5f5f5', borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginHorizontal: 4 }}
                  onPress={() => {
                    if (calculatorDisplay.length > 1) {
                      setCalculatorDisplay(calculatorDisplay.slice(0, -1));
                    } else {
                      setCalculatorDisplay('0');
                    }
                  }}
                >
                  <Ionicons name="backspace-outline" size={24} color="#666" />
                </TouchableOpacity>
                <TouchableOpacity 
                  style={{ flex: 1, height: 56, backgroundColor: '#f5f5f5', borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginHorizontal: 4 }}
                  onPress={() => {
                    const currentVal = parseFloat(calculatorDisplay);
                    if (calculatorPrevValue !== null && calculatorOperator) {
                      // Prozent vom vorherigen Wert berechnen: 100 + 10% → 10% von 100 = 10
                      const percentValue = (calculatorPrevValue * currentVal) / 100;
                      setCalculatorExpression(calculatorExpression + calculatorDisplay + '%');
                      setCalculatorDisplay(percentValue.toString());
                    } else {
                      // Ohne Operator: einfach durch 100 teilen
                      setCalculatorExpression(calculatorDisplay + '%');
                      setCalculatorDisplay((currentVal / 100).toString());
                    }
                  }}
                >
                  <Text style={{ fontSize: 22, fontWeight: '500', color: '#666' }}>%</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={{ flex: 1, height: 56, backgroundColor: '#FF9800', borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginHorizontal: 4 }}
                  onPress={() => {
                    setCalculatorExpression(calculatorDisplay + ' ÷ ');
                    setCalculatorPrevValue(parseFloat(calculatorDisplay));
                    setCalculatorOperator('÷');
                    setCalculatorWaitingForOperand(true);
                  }}
                >
                  <Text style={{ fontSize: 26, fontWeight: '500', color: '#fff' }}>÷</Text>
                </TouchableOpacity>
              </View>
              
              {/* Row 2: 7, 8, 9, × */}
              <View style={{ flexDirection: 'row', marginBottom: 8 }}>
                {['7', '8', '9'].map(num => (
                  <TouchableOpacity 
                    key={num}
                    style={{ flex: 1, height: 56, backgroundColor: '#fff', borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginHorizontal: 4, borderWidth: 1, borderColor: '#e0e0e0' }}
                    onPress={() => {
                      if (calculatorWaitingForOperand) {
                        setCalculatorDisplay(num);
                        setCalculatorWaitingForOperand(false);
                      } else {
                        setCalculatorDisplay(calculatorDisplay === '0' ? num : calculatorDisplay + num);
                      }
                    }}
                  >
                    <Text style={{ fontSize: 24, fontWeight: '500', color: '#333' }}>{num}</Text>
                  </TouchableOpacity>
                ))}
                <TouchableOpacity 
                  style={{ flex: 1, height: 56, backgroundColor: '#FF9800', borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginHorizontal: 4 }}
                  onPress={() => {
                    setCalculatorExpression(calculatorDisplay + ' × ');
                    setCalculatorPrevValue(parseFloat(calculatorDisplay));
                    setCalculatorOperator('×');
                    setCalculatorWaitingForOperand(true);
                  }}
                >
                  <Text style={{ fontSize: 26, fontWeight: '500', color: '#fff' }}>×</Text>
                </TouchableOpacity>
              </View>
              
              {/* Row 3: 4, 5, 6, − */}
              <View style={{ flexDirection: 'row', marginBottom: 8 }}>
                {['4', '5', '6'].map(num => (
                  <TouchableOpacity 
                    key={num}
                    style={{ flex: 1, height: 56, backgroundColor: '#fff', borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginHorizontal: 4, borderWidth: 1, borderColor: '#e0e0e0' }}
                    onPress={() => {
                      if (calculatorWaitingForOperand) {
                        setCalculatorDisplay(num);
                        setCalculatorWaitingForOperand(false);
                      } else {
                        setCalculatorDisplay(calculatorDisplay === '0' ? num : calculatorDisplay + num);
                      }
                    }}
                  >
                    <Text style={{ fontSize: 24, fontWeight: '500', color: '#333' }}>{num}</Text>
                  </TouchableOpacity>
                ))}
                <TouchableOpacity 
                  style={{ flex: 1, height: 56, backgroundColor: '#FF9800', borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginHorizontal: 4 }}
                  onPress={() => {
                    setCalculatorExpression(calculatorDisplay + ' − ');
                    setCalculatorPrevValue(parseFloat(calculatorDisplay));
                    setCalculatorOperator('−');
                    setCalculatorWaitingForOperand(true);
                  }}
                >
                  <Text style={{ fontSize: 26, fontWeight: '500', color: '#fff' }}>−</Text>
                </TouchableOpacity>
              </View>
              
              {/* Row 4: 1, 2, 3, + */}
              <View style={{ flexDirection: 'row', marginBottom: 8 }}>
                {['1', '2', '3'].map(num => (
                  <TouchableOpacity 
                    key={num}
                    style={{ flex: 1, height: 56, backgroundColor: '#fff', borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginHorizontal: 4, borderWidth: 1, borderColor: '#e0e0e0' }}
                    onPress={() => {
                      if (calculatorWaitingForOperand) {
                        setCalculatorDisplay(num);
                        setCalculatorWaitingForOperand(false);
                      } else {
                        setCalculatorDisplay(calculatorDisplay === '0' ? num : calculatorDisplay + num);
                      }
                    }}
                  >
                    <Text style={{ fontSize: 24, fontWeight: '500', color: '#333' }}>{num}</Text>
                  </TouchableOpacity>
                ))}
                <TouchableOpacity 
                  style={{ flex: 1, height: 56, backgroundColor: '#FF9800', borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginHorizontal: 4 }}
                  onPress={() => {
                    setCalculatorExpression(calculatorDisplay + ' + ');
                    setCalculatorPrevValue(parseFloat(calculatorDisplay));
                    setCalculatorOperator('+');
                    setCalculatorWaitingForOperand(true);
                  }}
                >
                  <Text style={{ fontSize: 26, fontWeight: '500', color: '#fff' }}>+</Text>
                </TouchableOpacity>
              </View>
              
              {/* Row 5: 0, ,, = */}
              <View style={{ flexDirection: 'row' }}>
                <TouchableOpacity 
                  style={{ flex: 2, height: 56, backgroundColor: '#fff', borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginHorizontal: 4, borderWidth: 1, borderColor: '#e0e0e0' }}
                  onPress={() => {
                    if (calculatorWaitingForOperand) {
                      setCalculatorDisplay('0');
                      setCalculatorWaitingForOperand(false);
                    } else {
                      setCalculatorDisplay(calculatorDisplay === '0' ? '0' : calculatorDisplay + '0');
                    }
                  }}
                >
                  <Text style={{ fontSize: 24, fontWeight: '500', color: '#333' }}>0</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={{ flex: 1, height: 56, backgroundColor: '#fff', borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginHorizontal: 4, borderWidth: 1, borderColor: '#e0e0e0' }}
                  onPress={() => {
                    if (!calculatorDisplay.includes('.')) {
                      setCalculatorDisplay(calculatorDisplay + '.');
                    }
                  }}
                >
                  <Text style={{ fontSize: 24, fontWeight: '500', color: '#333' }}>,</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={{ flex: 1, height: 56, backgroundColor: '#4CAF50', borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginHorizontal: 4 }}
                  onPress={() => {
                    if (calculatorPrevValue !== null && calculatorOperator) {
                      const current = parseFloat(calculatorDisplay);
                      let result = 0;
                      switch (calculatorOperator) {
                        case '+': result = calculatorPrevValue + current; break;
                        case '−': result = calculatorPrevValue - current; break;
                        case '×': result = calculatorPrevValue * current; break;
                        case '÷': result = calculatorPrevValue / current; break;
                      }
                      // Round to avoid floating point issues
                      result = Math.round(result * 1000000) / 1000000;
                      // Zeige die komplette Berechnung
                      const fullExpression = calculatorExpression + calculatorDisplay + ' =';
                      setCalculatorExpression(fullExpression);
                      setCalculatorDisplay(result.toString());
                      setCalculatorPrevValue(null);
                      setCalculatorOperator(null);
                    }
                  }}
                >
                  <Text style={{ fontSize: 28, fontWeight: '600', color: '#fff' }}>=</Text>
                </TouchableOpacity>
              </View>
            </View>
            
            {/* Close Button */}
            <TouchableOpacity
              style={{ backgroundColor: '#f5f5f5', padding: 14, borderBottomLeftRadius: 16, borderBottomRightRadius: 16 }}
              onPress={() => setShowCalculatorModal(false)}
            >
              <Text style={{ textAlign: 'center', color: '#666', fontWeight: '600', fontSize: 16 }}>Schließen</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Voreinstellungen Menü */}
      <Modal visible={showSettingsMenu} transparent animationType="fade">
        <TouchableOpacity 
          style={styles.modalOverlay} 
          activeOpacity={1} 
          onPress={() => setShowSettingsMenu(false)}
        >
          <View style={[styles.modalContent, { maxWidth: 320 }]}>
            <Text style={styles.modalTitle}>Voreinstellungen</Text>
            
            <TouchableOpacity
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                backgroundColor: '#e3f2fd',
                padding: 16,
                borderRadius: 12,
                marginBottom: 12,
              }}
              onPress={() => {
                setShowSettingsMenu(false);
                setShowLineCategoryManager(true);
              }}
            >
              <View style={{ backgroundColor: '#2196F3', padding: 10, borderRadius: 10, marginRight: 12 }}>
                <Ionicons name="pricetag" size={24} color="#fff" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 16, fontWeight: '600', color: '#1976d2' }}>Linien benennen</Text>
                <Text style={{ fontSize: 12, color: '#666', marginTop: 2 }}>Kategorien für Linien verwalten</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#999" />
            </TouchableOpacity>
            
            <TouchableOpacity
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                backgroundColor: '#fff3e0',
                padding: 16,
                borderRadius: 12,
                marginBottom: 12,
              }}
              onPress={() => {
                setShowSettingsMenu(false);
                setShowShortcutManager(true);
              }}
            >
              <View style={{ backgroundColor: '#FF9800', padding: 10, borderRadius: 10, marginRight: 12 }}>
                <Ionicons name="text" size={24} color="#fff" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 16, fontWeight: '600', color: '#e65100' }}>Kürzel</Text>
                <Text style={{ fontSize: 12, color: '#666', marginTop: 2 }}>Text-Abkürzungen verwalten</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#999" />
            </TouchableOpacity>
            
            {/* Platzhalter für zukünftige Einstellungen */}
            <View style={{ borderTopWidth: 1, borderTopColor: '#eee', paddingTop: 12, marginTop: 4 }}>
              <Text style={{ fontSize: 11, color: '#999', textAlign: 'center' }}>
                Weitere Einstellungen folgen...
              </Text>
            </View>
            
            <TouchableOpacity
              style={[styles.modalButton, styles.cancelButton, { marginTop: 16 }]}
              onPress={() => setShowSettingsMenu(false)}
            >
              <Text style={styles.cancelButtonText}>Schließen</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Linien-Kategorien Manager Modal */}
      <Modal visible={showLineCategoryManager} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxWidth: 420, maxHeight: '85%' }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <Text style={styles.modalTitle}>Linien benennen</Text>
              <TouchableOpacity onPress={() => {
                setShowLineCategoryManager(false);
                setEditingCategory(null);
                setNewCategoryName('');
                setNewCategoryColor('#2196F3');
                setNewCategoryShortcut('');
                setShowColorPicker(false);
              }}>
                <Ionicons name="close-circle" size={28} color="#999" />
              </TouchableOpacity>
            </View>
            
            <ScrollView style={{ maxHeight: 280 }} showsVerticalScrollIndicator={false}>
              {lineCategories.map((cat) => (
                <View 
                  key={cat.id} 
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    backgroundColor: '#f9f9f9',
                    padding: 12,
                    borderRadius: 10,
                    marginBottom: 8,
                    borderLeftWidth: 5,
                    borderLeftColor: cat.color,
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 15, fontWeight: '600', color: '#333' }}>{cat.name}</Text>
                    {cat.shortcut && (
                      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                        <View style={{ backgroundColor: '#FF9800', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                          <Text style={{ fontSize: 11, fontWeight: '700', color: '#fff' }}>{cat.shortcut}</Text>
                        </View>
                        <Text style={{ fontSize: 11, color: '#666', marginLeft: 6 }}>→ Kürzel</Text>
                      </View>
                    )}
                  </View>
                  <TouchableOpacity 
                    style={{ padding: 8 }}
                    onPress={() => {
                      setEditingCategory(cat);
                      setNewCategoryName(cat.name);
                      setNewCategoryColor(cat.color);
                      setNewCategoryShortcut(cat.shortcut || '');
                      setShowColorPicker(false);
                    }}
                  >
                    <Ionicons name="pencil" size={18} color="#2196F3" />
                  </TouchableOpacity>
                  <TouchableOpacity 
                    style={{ padding: 8 }}
                    onPress={async () => {
                      // Auch das verknüpfte Kürzel löschen
                      if (cat.shortcut) {
                        const shortcut = textShortcuts.find(s => s.shortcut.toUpperCase() === cat.shortcut?.toUpperCase());
                        if (shortcut) {
                          await TextShortcutService.delete(shortcut.id);
                        }
                      }
                      await LineCategoryService.delete(cat.id);
                      loadLineCategories();
                      loadTextShortcuts();
                    }}
                  >
                    <Ionicons name="trash" size={18} color="#f44336" />
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>
            
            {/* Neue Kategorie / Bearbeiten */}
            <View style={{ borderTopWidth: 1, borderTopColor: '#eee', paddingTop: 16, marginTop: 8 }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: '#333', marginBottom: 10 }}>
                {editingCategory ? 'Kategorie bearbeiten' : 'Neue Kategorie'}
              </Text>
              
              {/* Name */}
              <View style={{ marginBottom: 10 }}>
                <Text style={{ fontSize: 11, color: '#666', marginBottom: 4 }}>Name</Text>
                <TextInput
                  style={{
                    borderWidth: 1,
                    borderColor: '#ddd',
                    borderRadius: 8,
                    padding: 12,
                    fontSize: 15,
                    backgroundColor: '#fafafa',
                  }}
                  placeholder="z.B. Traufe"
                  value={newCategoryName}
                  onChangeText={setNewCategoryName}
                />
              </View>
              
              {/* Kürzel */}
              <View style={{ marginBottom: 10 }}>
                <Text style={{ fontSize: 11, color: '#666', marginBottom: 4 }}>Kürzel (optional)</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <TextInput
                    style={{
                      width: 80,
                      borderWidth: 2,
                      borderColor: '#FF9800',
                      borderRadius: 8,
                      padding: 10,
                      fontSize: 15,
                      fontWeight: '700',
                      textAlign: 'center',
                      backgroundColor: '#fff3e0',
                    }}
                    placeholder="TR"
                    value={newCategoryShortcut}
                    onChangeText={(text) => setNewCategoryShortcut(text.toUpperCase())}
                    maxLength={4}
                    autoCapitalize="characters"
                  />
                  <Text style={{ flex: 1, fontSize: 12, color: '#666' }}>
                    Wird automatisch mit Kürzel-Liste synchronisiert
                  </Text>
                </View>
              </View>
              
              {/* Farbe */}
              <View style={{ marginBottom: 12 }}>
                <Text style={{ fontSize: 11, color: '#666', marginBottom: 4 }}>Farbe</Text>
                <TouchableOpacity
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    backgroundColor: '#f5f5f5',
                    padding: 10,
                    borderRadius: 8,
                    borderWidth: 1,
                    borderColor: '#ddd',
                  }}
                  onPress={() => setShowColorPicker(!showColorPicker)}
                >
                  <View style={{
                    width: 32,
                    height: 32,
                    backgroundColor: newCategoryColor,
                    borderRadius: 6,
                    marginRight: 12,
                    borderWidth: 2,
                    borderColor: '#fff',
                    shadowColor: '#000',
                    shadowOffset: { width: 0, height: 1 },
                    shadowOpacity: 0.2,
                    shadowRadius: 2,
                  }} />
                  <Text style={{ flex: 1, fontSize: 14, color: '#333' }}>
                    {showColorPicker ? 'Farbauswahl schließen' : 'Farbe wählen'}
                  </Text>
                  <Ionicons name={showColorPicker ? 'chevron-up' : 'chevron-down'} size={20} color="#666" />
                </TouchableOpacity>
                
                {/* Große Farbpalette */}
                {showColorPicker && (
                  <View style={{ marginTop: 10, backgroundColor: '#fff', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#eee' }}>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
                      {[
                        // Rot-Töne
                        '#FFEBEE', '#FFCDD2', '#EF9A9A', '#E57373', '#EF5350', '#F44336', '#E53935', '#D32F2F', '#C62828', '#B71C1C',
                        // Pink-Töne
                        '#FCE4EC', '#F8BBD9', '#F48FB1', '#F06292', '#EC407A', '#E91E63', '#D81B60', '#C2185B', '#AD1457', '#880E4F',
                        // Lila-Töne
                        '#F3E5F5', '#E1BEE7', '#CE93D8', '#BA68C8', '#AB47BC', '#9C27B0', '#8E24AA', '#7B1FA2', '#6A1B9A', '#4A148C',
                        // Blau-Töne
                        '#E3F2FD', '#BBDEFB', '#90CAF9', '#64B5F6', '#42A5F5', '#2196F3', '#1E88E5', '#1976D2', '#1565C0', '#0D47A1',
                        // Cyan-Töne
                        '#E0F7FA', '#B2EBF2', '#80DEEA', '#4DD0E1', '#26C6DA', '#00BCD4', '#00ACC1', '#0097A7', '#00838F', '#006064',
                        // Grün-Töne
                        '#E8F5E9', '#C8E6C9', '#A5D6A7', '#81C784', '#66BB6A', '#4CAF50', '#43A047', '#388E3C', '#2E7D32', '#1B5E20',
                        // Gelb-Töne
                        '#FFFDE7', '#FFF9C4', '#FFF59D', '#FFF176', '#FFEE58', '#FFEB3B', '#FDD835', '#FBC02D', '#F9A825', '#F57F17',
                        // Orange-Töne
                        '#FFF3E0', '#FFE0B2', '#FFCC80', '#FFB74D', '#FFA726', '#FF9800', '#FB8C00', '#F57C00', '#EF6C00', '#E65100',
                        // Braun-Töne
                        '#EFEBE9', '#D7CCC8', '#BCAAA4', '#A1887F', '#8D6E63', '#795548', '#6D4C41', '#5D4037', '#4E342E', '#3E2723',
                        // Grau-Töne
                        '#FAFAFA', '#F5F5F5', '#EEEEEE', '#E0E0E0', '#BDBDBD', '#9E9E9E', '#757575', '#616161', '#424242', '#212121',
                      ].map((color) => (
                        <TouchableOpacity
                          key={color}
                          style={{
                            width: 28,
                            height: 28,
                            backgroundColor: color,
                            borderRadius: 6,
                            borderWidth: newCategoryColor === color ? 3 : 1,
                            borderColor: newCategoryColor === color ? '#000' : '#ddd',
                          }}
                          onPress={() => setNewCategoryColor(color)}
                        />
                      ))}
                    </View>
                  </View>
                )}
              </View>
              
              {/* Buttons */}
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {editingCategory && (
                  <TouchableOpacity
                    style={{
                      flex: 1,
                      backgroundColor: '#f5f5f5',
                      padding: 14,
                      borderRadius: 8,
                      alignItems: 'center',
                    }}
                    onPress={() => {
                      setEditingCategory(null);
                      setNewCategoryName('');
                      setNewCategoryColor('#2196F3');
                      setNewCategoryShortcut('');
                      setShowColorPicker(false);
                    }}
                  >
                    <Text style={{ color: '#666', fontWeight: '600' }}>Abbrechen</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={{
                    flex: 1,
                    backgroundColor: '#4CAF50',
                    padding: 14,
                    borderRadius: 8,
                    alignItems: 'center',
                  }}
                  onPress={async () => {
                    if (newCategoryName.trim()) {
                      const categoryData = {
                        name: newCategoryName.trim(),
                        color: newCategoryColor,
                        shortcut: newCategoryShortcut.trim().toUpperCase() || undefined,
                        order: editingCategory ? editingCategory.order : lineCategories.length + 1,
                      };
                      
                      if (editingCategory) {
                        // Update Kategorie
                        await LineCategoryService.update(editingCategory.id, categoryData);
                        
                        // Kürzel synchronisieren
                        if (newCategoryShortcut.trim()) {
                          // Prüfen ob das Kürzel schon existiert
                          const existingShortcut = textShortcuts.find(
                            s => s.shortcut.toUpperCase() === newCategoryShortcut.trim().toUpperCase()
                          );
                          if (existingShortcut) {
                            // Update existierendes Kürzel
                            await TextShortcutService.update(existingShortcut.id, {
                              fullText: newCategoryName.trim(),
                            });
                          } else {
                            // Neues Kürzel erstellen
                            await TextShortcutService.create({
                              shortcut: newCategoryShortcut.trim().toUpperCase(),
                              fullText: newCategoryName.trim(),
                              order: textShortcuts.length + 1,
                            });
                          }
                        }
                      } else {
                        // Neue Kategorie
                        await LineCategoryService.create(categoryData);
                        
                        // Kürzel erstellen wenn angegeben
                        if (newCategoryShortcut.trim()) {
                          const existingShortcut = textShortcuts.find(
                            s => s.shortcut.toUpperCase() === newCategoryShortcut.trim().toUpperCase()
                          );
                          if (!existingShortcut) {
                            await TextShortcutService.create({
                              shortcut: newCategoryShortcut.trim().toUpperCase(),
                              fullText: newCategoryName.trim(),
                              order: textShortcuts.length + 1,
                            });
                          }
                        }
                      }
                      
                      loadLineCategories();
                      loadTextShortcuts();
                      setEditingCategory(null);
                      setNewCategoryName('');
                      setNewCategoryColor('#2196F3');
                      setNewCategoryShortcut('');
                      setShowColorPicker(false);
                    }
                  }}
                >
                  <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>
                    {editingCategory ? 'Speichern' : 'Hinzufügen'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </Modal>

      {/* Kürzel Manager Modal */}
      <Modal visible={showShortcutManager} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxWidth: 400, maxHeight: '80%' }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <Text style={styles.modalTitle}>Kürzel verwalten</Text>
              <TouchableOpacity onPress={() => setShowShortcutManager(false)}>
                <Ionicons name="close-circle" size={28} color="#999" />
              </TouchableOpacity>
            </View>
            
            <Text style={{ fontSize: 12, color: '#666', marginBottom: 12 }}>
              Kürzel werden automatisch erkannt und als "(Kürzel) Volltext" angezeigt.
            </Text>
            
            <ScrollView style={{ maxHeight: 250 }} showsVerticalScrollIndicator={false}>
              {textShortcuts.map((shortcut) => {
                // Prüfen ob mit Linienkategorie verknüpft
                const linkedCategory = lineCategories.find(
                  cat => cat.shortcut?.toUpperCase() === shortcut.shortcut.toUpperCase()
                );
                
                return (
                <View 
                  key={shortcut.id} 
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    backgroundColor: linkedCategory ? '#e3f2fd' : '#fff3e0',
                    padding: 12,
                    borderRadius: 8,
                    marginBottom: 8,
                    borderLeftWidth: linkedCategory ? 4 : 0,
                    borderLeftColor: linkedCategory?.color || 'transparent',
                  }}
                >
                  <View style={{ 
                    backgroundColor: '#FF9800', 
                    paddingHorizontal: 10, 
                    paddingVertical: 4, 
                    borderRadius: 6,
                    marginRight: 10,
                  }}>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: '#fff' }}>{shortcut.shortcut}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, color: '#333' }}>{shortcut.fullText}</Text>
                    {linkedCategory && (
                      <Text style={{ fontSize: 10, color: '#1976d2', marginTop: 2 }}>
                        ↔ Verknüpft mit Linie "{linkedCategory.name}"
                      </Text>
                    )}
                  </View>
                  <TouchableOpacity 
                    style={{ padding: 8 }}
                    onPress={() => {
                      setEditingShortcut(shortcut);
                      setNewShortcutCode(shortcut.shortcut);
                      setNewShortcutText(shortcut.fullText);
                    }}
                  >
                    <Ionicons name="pencil" size={18} color="#FF9800" />
                  </TouchableOpacity>
                  <TouchableOpacity 
                    style={{ padding: 8 }}
                    onPress={async () => {
                      // Bidirektionale Sync: Kürzel bei verknüpfter Linienkategorie entfernen
                      const linkedCategory = lineCategories.find(
                        cat => cat.shortcut?.toUpperCase() === shortcut.shortcut.toUpperCase()
                      );
                      if (linkedCategory) {
                        await LineCategoryService.update(linkedCategory.id, {
                          shortcut: undefined,
                        });
                        loadLineCategories();
                      }
                      await TextShortcutService.delete(shortcut.id);
                      loadTextShortcuts();
                    }}
                  >
                    <Ionicons name="trash" size={18} color="#f44336" />
                  </TouchableOpacity>
                </View>
              );
              })}
            </ScrollView>
            
            {/* Neues Kürzel / Bearbeiten */}
            <View style={{ borderTopWidth: 1, borderTopColor: '#eee', paddingTop: 16, marginTop: 8 }}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: '#666', marginBottom: 8 }}>
                {editingShortcut ? 'Kürzel bearbeiten' : 'Neues Kürzel'}
              </Text>
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
                <TextInput
                  style={{
                    width: 80,
                    borderWidth: 1,
                    borderColor: '#FF9800',
                    borderRadius: 8,
                    padding: 10,
                    fontSize: 14,
                    fontWeight: '700',
                    textAlign: 'center',
                    backgroundColor: '#fff3e0',
                  }}
                  placeholder="DN"
                  value={newShortcutCode}
                  onChangeText={(text) => setNewShortcutCode(text.toUpperCase())}
                  maxLength={5}
                  autoCapitalize="characters"
                />
                <TextInput
                  style={{
                    flex: 1,
                    borderWidth: 1,
                    borderColor: '#ddd',
                    borderRadius: 8,
                    padding: 10,
                    fontSize: 14,
                  }}
                  placeholder="Dachneigung"
                  value={newShortcutText}
                  onChangeText={setNewShortcutText}
                />
              </View>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {editingShortcut && (
                  <TouchableOpacity
                    style={{
                      flex: 1,
                      backgroundColor: '#f5f5f5',
                      padding: 12,
                      borderRadius: 8,
                      alignItems: 'center',
                    }}
                    onPress={() => {
                      setEditingShortcut(null);
                      setNewShortcutCode('');
                      setNewShortcutText('');
                    }}
                  >
                    <Text style={{ color: '#666', fontWeight: '600' }}>Abbrechen</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={{
                    flex: 1,
                    backgroundColor: '#FF9800',
                    padding: 12,
                    borderRadius: 8,
                    alignItems: 'center',
                  }}
                  onPress={async () => {
                    if (newShortcutCode.trim() && newShortcutText.trim()) {
                      const shortcutCode = newShortcutCode.trim().toUpperCase();
                      const fullText = newShortcutText.trim();
                      
                      if (editingShortcut) {
                        // Update Kürzel
                        await TextShortcutService.update(editingShortcut.id, {
                          shortcut: shortcutCode,
                          fullText: fullText,
                        });
                        
                        // Bidirektionale Sync: Verknüpfte Linienkategorie aktualisieren
                        const linkedCategory = lineCategories.find(
                          cat => cat.shortcut?.toUpperCase() === editingShortcut.shortcut.toUpperCase()
                        );
                        if (linkedCategory) {
                          await LineCategoryService.update(linkedCategory.id, {
                            name: fullText,
                            shortcut: shortcutCode,
                          });
                          loadLineCategories();
                        }
                      } else {
                        // Neues Kürzel erstellen
                        await TextShortcutService.create({
                          shortcut: shortcutCode,
                          fullText: fullText,
                          order: textShortcuts.length + 1,
                        });
                      }
                      loadTextShortcuts();
                      setEditingShortcut(null);
                      setNewShortcutCode('');
                      setNewShortcutText('');
                    }
                  }}
                >
                  <Text style={{ color: '#fff', fontWeight: '600' }}>
                    {editingShortcut ? 'Speichern' : 'Hinzufügen'}
                  </Text>
                </TouchableOpacity>
              </View>
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
    paddingHorizontal: 6,
    paddingVertical: 4,
    paddingTop: Platform.OS === 'ios' ? 44 : 4,
  },
  headerButton: {
    padding: 6,
  },
  titleContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 6,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  toolbar: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    paddingVertical: 4,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    flexWrap: 'nowrap',
    alignItems: 'flex-start',
  },
  toolbarSection: {
    alignItems: 'center',
  },
  toolbarSectionTitle: {
    fontSize: 8,
    fontWeight: '600',
    color: '#999',
    marginBottom: 2,
    textTransform: 'uppercase',
  },
  toolbarSectionButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  toolButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderRadius: 6,
    marginHorizontal: 1,
    marginVertical: 1,
    backgroundColor: '#f5f5f5',
    minWidth: 40,
  },
  toolButtonLarge: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginHorizontal: 1,
    marginVertical: 1,
    backgroundColor: '#f5f5f5',
    minWidth: 52,
  },
  toolButtonActive: {
    backgroundColor: '#1976d2',
  },
  toolLabel: {
    fontSize: 8,
    color: '#666',
    marginTop: 1,
  },
  toolLabelActive: {
    color: '#fff',
  },
  toolSeparator: {
    width: 1,
    height: 30,
    backgroundColor: '#e0e0e0',
    marginHorizontal: 8,
  },
  calcButton: {
    flex: 1,
    aspectRatio: 1,
    backgroundColor: '#fff',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  calcButtonText: {
    fontSize: 24,
    fontWeight: '500',
    color: '#333',
  },
  referenceImageOverlay: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 8,
    padding: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
    maxWidth: 200,
  },
  referenceImageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  referenceImageTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#8BC34A',
  },
  referenceImageRemove: {
    padding: 2,
  },
  referenceImageSmall: {
    width: 180,
    height: 135,
    borderRadius: 6,
    backgroundColor: '#f0f0f0',
  },
  calculationsOverlay: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 10,
    padding: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 5,
    minWidth: 140,
  },
  calculationsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#e8e8e8',
  },
  calculationsTitle: {
    fontSize: 11,
    fontWeight: '600',
    color: '#2196F3',
    marginLeft: 5,
  },
  calculationsMainResult: {
    alignItems: 'center',
    marginBottom: 6,
  },
  calculationsMainLabel: {
    fontSize: 9,
    color: '#666',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  calculationsMainValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#4CAF50',
    marginTop: 2,
  },
  calculationsDetails: {
    borderTopWidth: 1,
    borderTopColor: '#e8e8e8',
    paddingTop: 6,
    marginBottom: 2,
  },
  calculationsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 2,
  },
  calculationsLabel: {
    fontSize: 10,
    color: '#666',
  },
  calculationsValue: {
    fontSize: 10,
    fontWeight: '600',
    color: '#333',
    marginLeft: 8,
  },
  calculationsValueGreen: {
    fontSize: 10,
    fontWeight: '600',
    color: '#4CAF50',
    marginLeft: 8,
  },
  calculationsValueRed: {
    fontSize: 10,
    fontWeight: '600',
    color: '#f44336',
    marginLeft: 8,
  },
  calculationsLines: {
    borderTopWidth: 1,
    borderTopColor: '#e8e8e8',
    paddingTop: 4,
    marginTop: 4,
  },
  categoryDotSmall: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 4,
  },
  calculationsMoreButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#e8e8e8',
  },
  calculationsMoreText: {
    fontSize: 10,
    color: '#2196F3',
    fontWeight: '500',
  },
  canvas: {
    flex: 1,
    backgroundColor: '#fff',
  },
  statusBar: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  statusItem: {
    flex: 1,
    alignItems: 'center',
  },
  statusLabel: {
    fontSize: 10,
    color: '#999',
    textTransform: 'uppercase',
  },
  statusValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    width: '85%',
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
    textAlign: 'center',
  },
  modalText: {
    fontSize: 14,
    color: '#666',
    marginBottom: 16,
    textAlign: 'center',
  },
  modalInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    marginBottom: 16,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  inputUnit: {
    fontSize: 16,
    color: '#666',
    marginLeft: 12,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
  },
  modalButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    minWidth: 100,
    alignItems: 'center',
  },
  modalButtonText: {
    color: '#666',
    fontWeight: '600',
    fontSize: 15,
  },
  cancelButton: {
    backgroundColor: '#f5f5f5',
  },
  cancelButtonText: {
    color: '#666',
    fontWeight: '600',
  },
  confirmButton: {
    backgroundColor: '#1976d2',
  },
  confirmButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  categoryList: {
    maxHeight: 300,
    marginBottom: 16,
  },
  categoryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderLeftWidth: 4,
    backgroundColor: '#f9f9f9',
    marginBottom: 4,
    borderRadius: 4,
  },
  categoryColor: {
    width: 20,
    height: 20,
    borderRadius: 10,
    marginRight: 12,
  },
  categoryName: {
    fontSize: 16,
    color: '#333',
  },
  resultsScroll: {
    maxHeight: 400,
  },
  resultsSection: {
    marginBottom: 20,
  },
  resultsSectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    textTransform: 'uppercase',
    marginBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    paddingBottom: 4,
  },
  resultRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  resultRowTotal: {
    borderTopWidth: 1,
    borderTopColor: '#ddd',
    marginTop: 8,
    paddingTop: 12,
  },
  resultCard: {
    backgroundColor: '#f9f9f9',
    borderRadius: 8,
    padding: 12,
    marginBottom: 10,
    borderLeftWidth: 4,
    borderLeftColor: '#4CAF50',
  },
  resultCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  resultCardTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  resultCardValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#4CAF50',
  },
  resultCardDetails: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 6,
  },
  resultCardDetail: {
    fontSize: 12,
    color: '#666',
  },
  resultCardEdges: {
    borderTopWidth: 1,
    borderTopColor: '#eee',
    paddingTop: 8,
    marginTop: 4,
  },
  resultCardSubtitle: {
    fontSize: 11,
    fontWeight: '600',
    color: '#666',
    marginBottom: 4,
  },
  resultCardEdge: {
    fontSize: 11,
    color: '#888',
    marginLeft: 8,
  },
  resultSubtotal: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#e8f5e9',
    padding: 10,
    borderRadius: 6,
    marginTop: 6,
  },
  resultSubtotalLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#333',
  },
  resultSubtotalValue: {
    fontSize: 15,
    fontWeight: '700',
    color: '#4CAF50',
  },
  calculationSteps: {
    backgroundColor: '#f5f5f5',
    padding: 12,
    borderRadius: 8,
  },
  calculationStep: {
    fontSize: 14,
    color: '#333',
    marginBottom: 4,
  },
  calculationLine: {
    height: 1,
    backgroundColor: '#333',
    marginVertical: 8,
  },
  calculationResult: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1976d2',
  },
  resultName: {
    fontSize: 14,
    color: '#333',
  },
  resultNameBold: {
    fontSize: 16,
    fontWeight: '700',
    color: '#333',
  },
  resultNameWithColor: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  categoryDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 8,
  },
  resultValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  resultValueGreen: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4CAF50',
  },
  resultValueRed: {
    fontSize: 14,
    fontWeight: '600',
    color: '#f44336',
  },
  resultValueBold: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1976d2',
  },
  gridSizeOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 10,
    marginBottom: 16,
  },
  gridSizeOption: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#f5f5f5',
    borderWidth: 2,
    borderColor: '#e0e0e0',
    minWidth: 70,
    alignItems: 'center',
  },
  gridSizeOptionActive: {
    backgroundColor: '#e3f2fd',
    borderColor: '#1976d2',
  },
  gridSizeOptionText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  gridSizeOptionTextActive: {
    color: '#1976d2',
  },
  directionButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 16,
  },
  directionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    gap: 6,
  },
  directionButtonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  // Numpad styles (like sketches)
  numpadContainer: {
    position: 'absolute',
    bottom: 120,
    right: 10,
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 10,
    width: 200,
  },
  numpadCloseBtn: {
    position: 'absolute',
    top: -8,
    right: -8,
    zIndex: 10,
  },
  numpadDragHandle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
    marginBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  numpadDragText: {
    fontSize: 10,
    color: '#999',
    marginLeft: 4,
  },
  numpadDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    backgroundColor: '#f5f5f5',
    padding: 8,
    borderRadius: 6,
    marginBottom: 8,
  },
  numpadDisplayInput: {
    flex: 1,
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    textAlign: 'right',
    padding: 0,
  },
  numpadUnit: {
    fontSize: 14,
    color: '#666',
    marginLeft: 4,
  },
  modalNumpadRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
    gap: 4,
  },
  modalNumpadKey: {
    flex: 1,
    aspectRatio: 1.3,
    backgroundColor: '#f5f5f5',
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalNumpadKeyText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  modalNumpadOp: {
    backgroundColor: '#e3f2fd',
  },
  modalNumpadOpText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1976d2',
  },
  modalNumpadClear: {
    backgroundColor: '#fff3e0',
  },
  modalNumpadClearText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#ff9800',
  },
  modalNumpadDel: {
    backgroundColor: '#ffebee',
  },
  // Text-Numpad Styles (für Texteingaben mit Buchstaben)
  textNumpadOverlay: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 80,
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
  textNumpadCloseBtn: {
    position: 'absolute',
    right: 4,
    top: 4,
    padding: 2,
    zIndex: 10,
    backgroundColor: '#fff',
    borderRadius: 12,
  },
  textNumpadDragHandle: {
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
  textNumpadDragText: {
    fontSize: 10,
    color: '#999',
    fontWeight: '500',
  },
  textNumpadRow: {
    flexDirection: 'row',
    gap: 4,
    marginBottom: 4,
  },
  textNumpadKey: {
    flex: 1,
    aspectRatio: 1.5,
    backgroundColor: '#f5f5f5',
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    minHeight: 40,
  },
  textNumpadKeyText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  textNumpadOp: {
    backgroundColor: '#e3f2fd',
    borderColor: '#2196f3',
  },
  textNumpadOpText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1976d2',
  },
  textNumpadDel: {
    backgroundColor: '#ffebee',
    borderColor: '#f44336',
  },
  textNumpadClear: {
    backgroundColor: '#fff3e0',
    borderColor: '#ff9800',
  },
  textNumpadClearText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#f57c00',
  },
  textNumpadUnit: {
    backgroundColor: '#e8f5e9',
    borderColor: '#4caf50',
  },
  textNumpadUnitText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#388e3c',
  },
  textNumpadMode: {
    backgroundColor: '#e8eaf6',
    borderColor: '#5c6bc0',
  },
  textNumpadModeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#3949ab',
  },
  textNumpadCapsActive: {
    backgroundColor: '#3949ab',
  },
  // Winkel-Modal Numpad Styles
  angleNumpadKey: {
    flex: 1,
    aspectRatio: 1.5,
    backgroundColor: '#fff',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    minHeight: 44,
  },
  angleNumpadKeyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  // Kompakte Variante für Winkel-Numpad
  angleNumpadKeySmall: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    minHeight: 36,
    paddingVertical: 8,
  },
  angleNumpadKeyTextSmall: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  // Verschiebbare Modal Styles
  draggableModalContent: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    width: '90%',
    maxWidth: 400,
    alignSelf: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 20,
  },
  modalDragHandle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f0f0f0',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginBottom: 12,
  },
  // Größere Numpad-Tasten
  largeNumpadKey: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ddd',
    minHeight: 44,
    paddingVertical: 10,
  },
  largeNumpadKeyText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
});

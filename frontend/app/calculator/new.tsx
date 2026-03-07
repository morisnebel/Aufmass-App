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
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
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
} from 'react-native-svg';
import { 
  AreaCalculationService, 
  AreaCalculation, 
  AreaPolygon, 
  AreaPoint,
  AreaLine,
  LineCategoryService,
  LineCategory,
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
  const [gridEnabled, setGridEnabled] = useState(true);
  const [gridSize, setGridSize] = useState(1); // 1 Meter pro Rasterfeld
  
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
  const [draggingText, setDraggingText] = useState<{ id: string; offset: AreaPoint } | null>(null);
  
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
  const [draggingMemo, setDraggingMemo] = useState<{ id: string; part: 'note' | 'target'; offset: AreaPoint } | null>(null);
  
  // Annotation drawing color
  const [annotationColor, setAnnotationColor] = useState('#FF0000');
  const [annotationStrokeWidth, setAnnotationStrokeWidth] = useState(3);
  const [showShapesModal, setShowShapesModal] = useState(false);
  const [textFontSize, setTextFontSize] = useState(16); // For text annotation size
  const [showEditTextModal, setShowEditTextModal] = useState(false); // For editing existing text
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const [editTextInput, setEditTextInput] = useState('');
  
  // Deduction rectangle drawing state
  const [deductionRectStart, setDeductionRectStart] = useState<AreaPoint | null>(null);
  const [deductionRectEnd, setDeductionRectEnd] = useState<AreaPoint | null>(null);
  
  // Drawing state
  const [mode, setMode] = useState<'select' | 'polygon' | 'deduction' | 'deduction_rect' | 'scale' | 'guideline' | 'parallel' | 'dimension' | 'annotation_rect' | 'annotation_circle' | 'annotation_arrow' | 'annotation_line' | 'annotation_text' | 'annotation_memo'>('select');
  const [currentPoints, setCurrentPoints] = useState<AreaPoint[]>([]);
  const [selectedPolygonId, setSelectedPolygonId] = useState<string | null>(null);
  const [selectedLineIndex, setSelectedLineIndex] = useState<{ polygonId: string; pointIndex: number } | null>(null);
  
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
    if (calculationId) {
      loadCalculation();
    }
  }, [calculationId]);

  const loadLineCategories = async () => {
    const categories = await LineCategoryService.getAll();
    setLineCategories(categories);
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

  // Calculate angle between three points (in degrees)
  const calculateAngle = (p1: AreaPoint, vertex: AreaPoint, p2: AreaPoint): number => {
    const v1 = { x: p1.x - vertex.x, y: p1.y - vertex.y };
    const v2 = { x: p2.x - vertex.x, y: p2.y - vertex.y };
    
    const dot = v1.x * v2.x + v1.y * v2.y;
    const cross = v1.x * v2.y - v1.y * v2.x;
    
    let angle = Math.atan2(Math.abs(cross), dot) * (180 / Math.PI);
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
  const saveCalculation = async () => {
    if (!projectId) {
      Alert.alert('Fehler', 'Kein Projekt zugeordnet');
      return;
    }
    
    setSaving(true);
    try {
      const results = calculateResults();
      
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
      };
      
      if (calculationId) {
        await AreaCalculationService.update(calculationId, data);
      } else {
        await AreaCalculationService.create(data);
      }
      
      if (Platform.OS === 'web') {
        alert('Berechnung gespeichert');
      } else {
        Alert.alert('Erfolg', 'Berechnung wurde gespeichert');
      }
      
      router.back();
    } catch (error) {
      console.error('Error saving calculation:', error);
      if (Platform.OS === 'web') {
        alert('Fehler beim Speichern');
      } else {
        Alert.alert('Fehler', 'Berechnung konnte nicht gespeichert werden');
      }
    } finally {
      setSaving(false);
    }
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
    const tolerance = 20;
    
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
    const tolerance = 15;
    
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
    
    for (const snapAngle of snapAngles) {
      const diff = Math.abs(angle - snapAngle);
      if (diff < minDiff) {
        minDiff = diff;
        nearestAngle = snapAngle;
      }
    }
    
    // Only snap if within 5 degrees
    if (minDiff > 5) return end;
    
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
    const tolerance = 20;
    
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
    const tolerance = 20;
    
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
    
    const tolerance = 15;
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
      // Replace , with . for decimals
      let cleanExpr = expr.replace(/,/g, '.');
      // Only allow numbers and basic operators
      if (!/^[\d\.\+\-\*\/\(\)\s]+$/.test(cleanExpr)) return null;
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
    setNumpadInput(currentLength.toFixed(2));
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

  // Check if a touch point is on any edge label
  const findEdgeLabelAtPosition = (x: number, y: number): { polygonId: string; edgeIndex: number; length: number } | null => {
    const tolerance = 30;
    
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
    const x = touch.locationX;
    const y = touch.locationY;
    
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
      
      setCurrentPoints([...currentPoints, { x: snappedX, y: snappedY }]);
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
    const tolerance = 10;
    
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
    const tolerance = 15;
    
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

  // Undo last point
  const undoLastPoint = () => {
    if (currentPoints.length > 0) {
      setCurrentPoints(currentPoints.slice(0, -1));
    }
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
    
    return (
      <G key={id}>
        {isSelected && (
          <Rect
            x={x - 5}
            y={y - fontSize}
            width={text.length * fontSize * 0.6 + 10}
            height={fontSize + 10}
            fill="rgba(33, 150, 243, 0.2)"
            stroke="#2196F3"
            strokeWidth={1}
            strokeDasharray="4,2"
          />
        )}
        <SvgText
          x={x}
          y={y}
          fill={color}
          fontSize={fontSize}
          fontWeight="600"
        >
          {text}
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
    const textLength = noteText.length;
    const noteWidth = Math.max(textLength * 9 + 20, 80);
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
        {noteText && (
          <SvgText 
            x={x1} 
            y={noteY + noteHeight / 2 + 5} 
            fill="#333" 
            fontSize={14} 
            fontWeight="600" 
            textAnchor="middle"
          >
            {noteText}
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
    const tolerance = 15;
    
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
      if (targetDist < 20) {
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
    setBgImageEditMode(false);
  };

  // Load project photos
  const loadProjectPhotos = async () => {
    try {
      const projectId = params.project_id;
      if (projectId) {
        const { PhotoAnnotationService } = await import('@/services/LocalStorage');
        const photos = await PhotoAnnotationService.getAll();
        const projectPhotosFiltered = photos.filter((p: any) => p.project_id === projectId);
        setProjectPhotos(projectPhotosFiltered.map((p: any) => ({ id: p.id, uri: p.photoUri })));
      }
    } catch (error) {
      console.error('Error loading project photos:', error);
    }
  };

  // Use project photo as background
  const useProjectPhotoAsBackground = (photoUri: string) => {
    setBackgroundImage(photoUri);
    // Use default size for project photos
    const maxDim = Math.min(canvasWidth * 0.8, canvasHeight * 0.8);
    setBgImageSize({ width: maxDim, height: maxDim * 0.75 });
    bgImageOriginalSize.current = { width: maxDim, height: maxDim * 0.75 };
    setBgImagePosition({ x: (canvasWidth - maxDim) / 2, y: (canvasHeight - maxDim * 0.75) / 2 });
    setShowBgImageModal(false);
    setBgImageEditMode(true);
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
        <TouchableOpacity onPress={() => router.back()} style={styles.headerButton}>
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
        
        <TouchableOpacity onPress={() => setShowResultsModal(true)} style={styles.headerButton}>
          <Ionicons name="calculator" size={22} color="#fff" />
        </TouchableOpacity>
        <TouchableOpacity onPress={saveCalculation} style={styles.headerButton} disabled={saving}>
          <Ionicons name="checkmark" size={24} color={saving ? '#888' : '#fff'} />
        </TouchableOpacity>
      </View>

      {/* Toolbar */}
      <View style={styles.toolbar}>
        <TouchableOpacity
          style={[styles.toolButton, mode === 'select' && styles.toolButtonActive]}
          onPress={() => { setMode('select'); setCurrentPoints([]); }}
        >
          <Ionicons name="hand-left" size={20} color={mode === 'select' ? '#fff' : '#666'} />
          <Text style={[styles.toolLabel, mode === 'select' && styles.toolLabelActive]}>Auswahl</Text>
        </TouchableOpacity>
        
        <TouchableOpacity
          style={[styles.toolButton, mode === 'scale' && styles.toolButtonActive]}
          onPress={() => { 
            setMode('scale'); 
            setCurrentPoints([]); 
            setScaleReference({ startPoint: null, endPoint: null, realLength: 1 });
          }}
        >
          <Ionicons name="resize" size={20} color={mode === 'scale' ? '#fff' : '#666'} />
          <Text style={[styles.toolLabel, mode === 'scale' && styles.toolLabelActive]}>Maßstab</Text>
        </TouchableOpacity>
        
        <TouchableOpacity
          style={[styles.toolButton, mode === 'polygon' && styles.toolButtonActive, { backgroundColor: mode === 'polygon' ? '#4CAF50' : '#f5f5f5' }]}
          onPress={() => { setMode('polygon'); setCurrentPoints([]); }}
        >
          <Ionicons name="shapes" size={20} color={mode === 'polygon' ? '#fff' : '#4CAF50'} />
          <Text style={[styles.toolLabel, mode === 'polygon' && styles.toolLabelActive]}>Fläche</Text>
        </TouchableOpacity>
        
        <TouchableOpacity
          style={[styles.toolButton, mode === 'deduction' && styles.toolButtonActive, { backgroundColor: mode === 'deduction' ? '#f44336' : '#f5f5f5' }]}
          onPress={() => { setMode('deduction'); setCurrentPoints([]); }}
        >
          <Ionicons name="remove-circle" size={20} color={mode === 'deduction' ? '#fff' : '#f44336'} />
          <Text style={[styles.toolLabel, mode === 'deduction' && styles.toolLabelActive]}>Abzug</Text>
        </TouchableOpacity>
        
        <TouchableOpacity
          style={[styles.toolButton, mode === 'deduction_rect' && styles.toolButtonActive, { backgroundColor: mode === 'deduction_rect' ? '#E91E63' : '#f5f5f5' }]}
          onPress={() => { setMode('deduction_rect'); setCurrentPoints([]); setDeductionRectStart(null); setDeductionRectEnd(null); }}
        >
          <Ionicons name="square" size={20} color={mode === 'deduction_rect' ? '#fff' : '#E91E63'} />
          <Text style={[styles.toolLabel, mode === 'deduction_rect' && styles.toolLabelActive]}>Rechteck</Text>
        </TouchableOpacity>
        
        <View style={styles.toolSeparator} />
        
        <TouchableOpacity
          style={[styles.toolButton, mode === 'guideline' && styles.toolButtonActive, { backgroundColor: mode === 'guideline' ? '#FF9800' : '#f5f5f5' }]}
          onPress={() => { setMode('guideline'); setCurrentPoints([]); }}
        >
          <Ionicons name="remove-outline" size={20} color={mode === 'guideline' ? '#fff' : '#FF9800'} />
          <Text style={[styles.toolLabel, mode === 'guideline' && styles.toolLabelActive]}>Hilfslinie</Text>
        </TouchableOpacity>
        
        <TouchableOpacity
          style={[styles.toolButton, mode === 'parallel' && styles.toolButtonActive, { backgroundColor: mode === 'parallel' ? '#9C27B0' : '#f5f5f5' }]}
          onPress={() => { setMode('parallel'); setCurrentPoints([]); }}
        >
          <Ionicons name="git-compare-outline" size={20} color={mode === 'parallel' ? '#fff' : '#9C27B0'} />
          <Text style={[styles.toolLabel, mode === 'parallel' && styles.toolLabelActive]}>Parallel</Text>
        </TouchableOpacity>
        
        <TouchableOpacity
          style={[styles.toolButton, guideLinesVisible && guideLines.length > 0 && styles.toolButtonActive]}
          onPress={() => setGuideLinesVisible(!guideLinesVisible)}
        >
          <Ionicons name="eye-outline" size={20} color={guideLinesVisible ? (guideLines.length > 0 ? '#fff' : '#666') : '#999'} />
          <Text style={[styles.toolLabel, guideLinesVisible && guideLines.length > 0 && styles.toolLabelActive]}>
            {guideLines.length > 0 ? guideLines.length : '-'}
          </Text>
        </TouchableOpacity>
        
        <View style={styles.toolSeparator} />
        
        <TouchableOpacity
          style={[styles.toolButton, gridEnabled && styles.toolButtonActive]}
          onPress={() => setGridEnabled(!gridEnabled)}
          onLongPress={() => setShowGridSizeModal(true)}
        >
          <Ionicons name="grid" size={20} color={gridEnabled ? '#fff' : '#666'} />
          <Text style={[styles.toolLabel, gridEnabled && styles.toolLabelActive]}>
            {gridSize < 1 ? `${(gridSize * 100).toFixed(0)}cm` : `${gridSize}m`}
          </Text>
        </TouchableOpacity>
        
        <TouchableOpacity
          style={styles.toolButton}
          onPress={() => setShowGridSizeModal(true)}
        >
          <Ionicons name="options" size={20} color="#666" />
          <Text style={styles.toolLabel}>Größe</Text>
        </TouchableOpacity>
        
        <View style={styles.toolSeparator} />
        
        {/* Manual Area Calculation Toggle */}
        <TouchableOpacity
          style={[styles.toolButton, useManualAreaCalc && styles.toolButtonActive, { backgroundColor: useManualAreaCalc ? '#FF9800' : '#f5f5f5' }]}
          onPress={() => setUseManualAreaCalc(!useManualAreaCalc)}
        >
          <Ionicons name="calculator" size={20} color={useManualAreaCalc ? '#fff' : '#FF9800'} />
          <Text style={[styles.toolLabel, useManualAreaCalc && styles.toolLabelActive]}>
            {useManualAreaCalc ? 'Manuell' : 'Auto'}
          </Text>
        </TouchableOpacity>
        
        <View style={styles.toolSeparator} />
        
        {/* === ANNOTATION TOOLS === */}
        <TouchableOpacity
          style={[styles.toolButton, mode === 'annotation_text' && styles.toolButtonActive, { backgroundColor: mode === 'annotation_text' ? '#E91E63' : '#f5f5f5' }]}
          onPress={() => { setMode('annotation_text'); setCurrentPoints([]); }}
        >
          <Ionicons name="text" size={20} color={mode === 'annotation_text' ? '#fff' : '#E91E63'} />
          <Text style={[styles.toolLabel, mode === 'annotation_text' && styles.toolLabelActive]}>Text</Text>
        </TouchableOpacity>
        
        <TouchableOpacity
          style={[styles.toolButton, mode === 'annotation_memo' && styles.toolButtonActive, { backgroundColor: mode === 'annotation_memo' ? '#FF5722' : '#f5f5f5' }]}
          onPress={() => { setMode('annotation_memo'); setCurrentPoints([]); setPendingMemoPointer(null); }}
        >
          <Ionicons name="chatbubble-ellipses" size={20} color={mode === 'annotation_memo' ? '#fff' : '#FF5722'} />
          <Text style={[styles.toolLabel, mode === 'annotation_memo' && styles.toolLabelActive]}>Notiz</Text>
        </TouchableOpacity>
        
        <TouchableOpacity
          style={[styles.toolButton, (mode === 'annotation_rect' || mode === 'annotation_circle' || mode === 'annotation_arrow' || mode === 'annotation_line') && styles.toolButtonActive, { backgroundColor: (mode === 'annotation_rect' || mode === 'annotation_circle' || mode === 'annotation_arrow' || mode === 'annotation_line') ? '#673AB7' : '#f5f5f5' }]}
          onPress={() => setShowShapesModal(true)}
        >
          <Ionicons name="shapes" size={20} color={(mode === 'annotation_rect' || mode === 'annotation_circle' || mode === 'annotation_arrow' || mode === 'annotation_line') ? '#fff' : '#673AB7'} />
          <Text style={[styles.toolLabel, (mode === 'annotation_rect' || mode === 'annotation_circle' || mode === 'annotation_arrow' || mode === 'annotation_line') && styles.toolLabelActive]}>Formen</Text>
        </TouchableOpacity>
        
        <View style={styles.toolSeparator} />
        
        {/* Background Image Button */}
        <TouchableOpacity
          style={[styles.toolButton, backgroundImage && { backgroundColor: '#8BC34A' }]}
          onPress={() => setShowBgImageModal(true)}
        >
          <Ionicons name="image" size={20} color={backgroundImage ? '#fff' : '#8BC34A'} />
          <Text style={[styles.toolLabel, backgroundImage && { color: '#fff' }]}>Bild</Text>
        </TouchableOpacity>
        
        {/* Background Image Edit Mode Toggle */}
        {backgroundImage && (
          <TouchableOpacity
            style={[styles.toolButton, bgImageEditMode && styles.toolButtonActive, { backgroundColor: bgImageEditMode ? '#FF9800' : '#f5f5f5' }]}
            onPress={() => setBgImageEditMode(!bgImageEditMode)}
          >
            <Ionicons name="move" size={20} color={bgImageEditMode ? '#fff' : '#FF9800'} />
            <Text style={[styles.toolLabel, bgImageEditMode && styles.toolLabelActive]}>Anpassen</Text>
          </TouchableOpacity>
        )}
        
        <View style={styles.toolSeparator} />
        
        {/* Zoom Controls */}
        <TouchableOpacity
          style={styles.toolButton}
          onPress={() => handleZoom(0.25)}
        >
          <Ionicons name="add-circle-outline" size={20} color="#666" />
          <Text style={styles.toolLabel}>Zoom+</Text>
        </TouchableOpacity>
        
        <TouchableOpacity
          style={styles.toolButton}
          onPress={() => handleZoom(-0.25)}
        >
          <Ionicons name="remove-circle-outline" size={20} color="#666" />
          <Text style={styles.toolLabel}>Zoom-</Text>
        </TouchableOpacity>
        
        <TouchableOpacity
          style={styles.toolButton}
          onPress={resetView}
        >
          <Ionicons name="contract-outline" size={20} color="#666" />
          <Text style={styles.toolLabel}>{Math.round(zoomLevel * 100)}%</Text>
        </TouchableOpacity>
        
        {/* Delete selected annotation */}
        {(selectedAnnotationId || selectedTextId || selectedMemoId) && (
          <>
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
                <Ionicons name="color-palette-outline" size={20} color="#fff" />
                <Text style={[styles.toolLabel, { color: '#fff' }]}>Stil</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity 
              style={[styles.toolButton, { backgroundColor: '#f44336' }]} 
              onPress={deleteSelectedAnnotation}
            >
              <Ionicons name="trash-outline" size={20} color="#fff" />
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
        
        <View style={styles.toolSeparator} />
        
        <TouchableOpacity
          style={[styles.toolButton, snapToAngles && styles.toolButtonActive]}
          onPress={() => setSnapToAngles(!snapToAngles)}
        >
          <Ionicons name="compass" size={20} color={snapToAngles ? '#fff' : '#666'} />
          <Text style={[styles.toolLabel, snapToAngles && styles.toolLabelActive]}>45°</Text>
        </TouchableOpacity>
        
        <TouchableOpacity
          style={[styles.toolButton, showPolygonAngles && styles.toolButtonActive]}
          onPress={() => setShowPolygonAngles(!showPolygonAngles)}
        >
          <Ionicons name="analytics" size={20} color={showPolygonAngles ? '#fff' : '#666'} />
          <Text style={[styles.toolLabel, showPolygonAngles && styles.toolLabelActive]}>Winkel</Text>
        </TouchableOpacity>
        
        <TouchableOpacity
          style={[styles.toolButton, addPointMode && styles.toolButtonActive, { backgroundColor: addPointMode ? '#E91E63' : '#f5f5f5' }]}
          onPress={() => {
            setAddPointMode(!addPointMode);
            setDeletePointMode(false);
          }}
        >
          <Ionicons name="add-circle" size={20} color={addPointMode ? '#fff' : '#E91E63'} />
          <Text style={[styles.toolLabel, addPointMode && styles.toolLabelActive]}>+Punkt</Text>
        </TouchableOpacity>
        
        <TouchableOpacity
          style={[styles.toolButton, deletePointMode && styles.toolButtonActive, { backgroundColor: deletePointMode ? '#f44336' : '#f5f5f5' }]}
          onPress={() => {
            setDeletePointMode(!deletePointMode);
            setAddPointMode(false);
          }}
        >
          <Ionicons name="remove-circle" size={20} color={deletePointMode ? '#fff' : '#f44336'} />
          <Text style={[styles.toolLabel, deletePointMode && styles.toolLabelActive]}>-Punkt</Text>
        </TouchableOpacity>
        
        <TouchableOpacity
          style={[styles.toolButton, showEdgeLengths && styles.toolButtonActive]}
          onPress={() => setShowEdgeLengths(!showEdgeLengths)}
        >
          <Ionicons name="resize" size={20} color={showEdgeLengths ? '#fff' : '#666'} />
          <Text style={[styles.toolLabel, showEdgeLengths && styles.toolLabelActive]}>Maße</Text>
        </TouchableOpacity>
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
          
          // Background image edit mode - only block if touching handles or dragging image
          if (bgImageEditMode && backgroundImage) {
            const handleRadius = 20;
            
            // Check corner handles for resizing
            const corners = {
              nw: { x: bgImagePosition.x, y: bgImagePosition.y },
              ne: { x: bgImagePosition.x + bgImageSize.width, y: bgImagePosition.y },
              sw: { x: bgImagePosition.x, y: bgImagePosition.y + bgImageSize.height },
              se: { x: bgImagePosition.x + bgImageSize.width, y: bgImagePosition.y + bgImageSize.height },
            };
            
            for (const [corner, pos] of Object.entries(corners)) {
              if (Math.sqrt(Math.pow(x - pos.x, 2) + Math.pow(y - pos.y, 2)) < handleRadius) {
                setResizingBgImage(corner as 'nw' | 'ne' | 'sw' | 'se');
                bgImageDragStart.current = { x, y };
                bgImageOriginalSize.current = { ...bgImageSize };
                return;
              }
            }
            
            // Check center move handle only (not the whole image)
            const centerX = bgImagePosition.x + bgImageSize.width / 2;
            const centerY = bgImagePosition.y + bgImageSize.height / 2;
            if (Math.sqrt(Math.pow(x - centerX, 2) + Math.pow(y - centerY, 2)) < 25) {
              setDraggingBgImage(true);
              bgImageDragStart.current = { x: x - bgImagePosition.x, y: y - bgImagePosition.y };
              return;
            }
            // Don't block other touch events - allow drawing on top of image
          }
          
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
                  // Already selected - open edit modal
                  setEditingTextId(annotation.id);
                  setEditTextInput(text.text);
                  setTextFontSize(text.fontSize);
                  setAnnotationColor(text.color);
                  setShowEditTextModal(true);
                } else {
                  // Just select
                  setSelectedTextId(annotation.id);
                  setSelectedAnnotationId(null);
                  setSelectedMemoId(null);
                }
              } else if (annotation.type === 'memo') {
                const memo = memoPointers.find(m => m.id === annotation.id);
                if (memo && selectedMemoId === annotation.id) {
                  // Already selected - determine which part to drag
                  const distToNote = Math.sqrt(Math.pow(x - memo.x1, 2) + Math.pow(y - (memo.y1 - 20), 2));
                  const distToTarget = Math.sqrt(Math.pow(x - memo.x2, 2) + Math.pow(y - memo.y2, 2));
                  const part = distToTarget < distToNote ? 'target' : 'note';
                  setDraggingMemo({ id: annotation.id, part, offset: { x: part === 'note' ? x - memo.x1 : x - memo.x2, y: part === 'note' ? y - memo.y1 : y - memo.y2 } });
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
          
          // Handle pinch-to-zoom with two fingers
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
            
            if (lastPinchDistance.current !== null) {
              // Calculate zoom change
              const scale = distance / lastPinchDistance.current;
              const newZoom = Math.max(0.25, Math.min(4, zoomLevel * scale));
              
              // Adjust pan offset to zoom towards the pinch center
              if (newZoom !== zoomLevel) {
                const zoomRatio = newZoom / zoomLevel;
                setPanOffset(prev => ({
                  x: centerX - (centerX - prev.x) * zoomRatio,
                  y: centerY - (centerY - prev.y) * zoomRatio,
                }));
                setZoomLevel(newZoom);
              }
            }
            
            lastPinchDistance.current = distance;
            lastPinchCenter.current = { x: centerX, y: centerY };
            isPinching.current = true;
            return;
          }
          
          // Reset pinch tracking when not using two fingers
          if (isPinching.current && (!touches || touches.length < 2)) {
            lastPinchDistance.current = null;
            isPinching.current = false;
          }
          
          const touch = event.nativeEvent;
          const rawX = touch.locationX;
          const rawY = touch.locationY;
          const transformed = transformCoordinates(rawX, rawY);
          const x = transformed.x;
          const y = transformed.y;
          
          // Background image dragging/resizing
          if (draggingBgImage) {
            setBgImagePosition({
              x: x - bgImageDragStart.current.x,
              y: y - bgImageDragStart.current.y,
            });
            return;
          }
          
          if (resizingBgImage !== 'none') {
            const dx = x - bgImageDragStart.current.x;
            const dy = y - bgImageDragStart.current.y;
            let newWidth = bgImageOriginalSize.current.width;
            let newHeight = bgImageOriginalSize.current.height;
            let newX = bgImagePosition.x;
            let newY = bgImagePosition.y;
            
            const aspectRatio = bgImageOriginalSize.current.width / bgImageOriginalSize.current.height;
            
            switch (resizingBgImage) {
              case 'se':
                newWidth = Math.max(50, bgImageOriginalSize.current.width + dx);
                if (bgLockAspectRatio) {
                  newHeight = newWidth / aspectRatio;
                } else {
                  newHeight = Math.max(50, bgImageOriginalSize.current.height + dy);
                }
                break;
              case 'sw':
                newWidth = Math.max(50, bgImageOriginalSize.current.width - dx);
                newX = bgImagePosition.x + (bgImageSize.width - newWidth);
                if (bgLockAspectRatio) {
                  newHeight = newWidth / aspectRatio;
                } else {
                  newHeight = Math.max(50, bgImageOriginalSize.current.height + dy);
                }
                break;
              case 'ne':
                newWidth = Math.max(50, bgImageOriginalSize.current.width + dx);
                if (bgLockAspectRatio) {
                  newHeight = newWidth / aspectRatio;
                  newY = bgImagePosition.y - (newHeight - bgImageSize.height);
                } else {
                  newHeight = Math.max(50, bgImageOriginalSize.current.height - dy);
                  newY = bgImagePosition.y + (bgImageSize.height - newHeight);
                }
                break;
              case 'nw':
                newWidth = Math.max(50, bgImageOriginalSize.current.width - dx);
                newX = bgImagePosition.x + (bgImageSize.width - newWidth);
                if (bgLockAspectRatio) {
                  newHeight = newWidth / aspectRatio;
                  newY = bgImagePosition.y - (newHeight - bgImageSize.height);
                } else {
                  newHeight = Math.max(50, bgImageOriginalSize.current.height - dy);
                  newY = bgImagePosition.y + (bgImageSize.height - newHeight);
                }
                break;
            }
            
            setBgImageSize({ width: newWidth, height: newHeight });
            setBgImagePosition({ x: newX, y: newY });
            return;
          }
          
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
          
          // Stop background image manipulation
          if (draggingBgImage) {
            setDraggingBgImage(false);
            return;
          }
          if (resizingBgImage !== 'none') {
            setResizingBgImage('none');
            return;
          }
          
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
            setDraggingText(null);
            return;
          }
          
          // Stop dragging memo
          if (draggingMemo) {
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
            
            {/* Background Image */}
            {backgroundImage && (
              <G>
                <SvgImage
                  x={bgImagePosition.x}
                  y={bgImagePosition.y}
                  width={bgImageSize.width}
                  height={bgImageSize.height}
                  href={backgroundImage}
                  opacity={0.7}
                  preserveAspectRatio="none"
                />
                {/* Edit handles when in edit mode */}
                {bgImageEditMode && (
                  <>
                    {/* Border */}
                    <Rect
                      x={bgImagePosition.x}
                      y={bgImagePosition.y}
                      width={bgImageSize.width}
                      height={bgImageSize.height}
                      fill="none"
                      stroke="#FF9800"
                      strokeWidth={2}
                      strokeDasharray="8,4"
                    />
                    {/* Corner handles */}
                    <Circle cx={bgImagePosition.x} cy={bgImagePosition.y} r={10} fill="#FF9800" />
                    <Circle cx={bgImagePosition.x + bgImageSize.width} cy={bgImagePosition.y} r={10} fill="#FF9800" />
                    <Circle cx={bgImagePosition.x} cy={bgImagePosition.y + bgImageSize.height} r={10} fill="#FF9800" />
                    <Circle cx={bgImagePosition.x + bgImageSize.width} cy={bgImagePosition.y + bgImageSize.height} r={10} fill="#FF9800" />
                    {/* Center move handle */}
                    <Circle 
                      cx={bgImagePosition.x + bgImageSize.width / 2} 
                      cy={bgImagePosition.y + bgImageSize.height / 2} 
                      r={15} 
                      fill="rgba(255, 152, 0, 0.5)"
                      stroke="#FF9800"
                      strokeWidth={2}
                    />
                    <Ionicons name="move" size={16} color="#FF9800" />
                  </>
                )}
              </G>
            )}
            
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
                          
                          // Show manual value if custom, otherwise show auto-calculated visible length
                          const displayValue = isCustom ? displayTotalLength : totalAutoLength;
                          
                          return (
                            <G>
                              <Circle cx={midX} cy={midY} r={20} fill={bgColor} />
                              <SvgText x={midX} y={midY + 4} textAnchor="middle" fontSize={10} fontWeight="bold" fill="#fff">
                                {displayValue.toFixed(2)}m
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
                    
                    return (
                      <G key={`line-${polygon.id}-${index}`}>
                        <Line
                          x1={point.x}
                          y1={point.y}
                          x2={nextPoint.x}
                          y2={nextPoint.y}
                          stroke={getCategoryColor(category)}
                          strokeWidth={4}
                        />
                        <Circle cx={midX} cy={midY} r={18} fill={isCustom ? '#2196F3' : getCategoryColor(category)} />
                        <SvgText x={midX} y={midY + 4} textAnchor="middle" fontSize={10} fontWeight="bold" fill="#fff">
                          {displayLength.toFixed(2)}m
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
                  
                  const labelWidth = 55;
                  const labelHeight = 20;
                  // Custom values shown in blue, normal in green/red
                  const bgColor = isCustom ? '#2196F3' : (polygon.type === 'deduction' ? '#f44336' : '#4CAF50');
                  const displayText = `${displayLength.toFixed(2)}m`;
                  
                  return (
                    <G key={`edge-length-${polygon.id}-${index}`}>
                      <Rect 
                        x={labelX - labelWidth / 2} 
                        y={labelY - labelHeight / 2} 
                        width={labelWidth} 
                        height={labelHeight} 
                        rx={3} 
                        fill={bgColor}
                        stroke={isCustom ? '#1565C0' : undefined}
                        strokeWidth={isCustom ? 2 : 0}
                      />
                      <SvgText 
                        x={labelX - labelWidth / 2 + 4} 
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
                          x={labelX + labelWidth / 2 - 4} 
                          y={labelY - 2} 
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
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Maßstab festlegen</Text>
            <Text style={styles.modalText}>
              Wie lang ist die gezeichnete Linie in der Realität?
            </Text>
            <View style={styles.inputRow}>
              <TextInput
                style={styles.modalInput}
                value={scaleInputValue}
                onChangeText={setScaleInputValue}
                placeholder="z.B. 5"
                keyboardType="decimal-pad"
                autoFocus
              />
              <Text style={styles.inputUnit}>Meter</Text>
            </View>
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

      {/* Numpad for edge length input */}
      {showNumpad && (
        <Animated.View 
          style={[
            styles.numpadContainer,
            { transform: numpadPosition.getTranslateTransform() }
          ]}
        >
          {/* Close button */}
          <TouchableOpacity 
            style={styles.numpadCloseBtn}
            onPress={() => { setShowNumpad(false); setEditingEdge(null); setNumpadInput(''); }}
          >
            <Ionicons name="close-circle" size={22} color="#999" />
          </TouchableOpacity>
          
          {/* Drag handle */}
          <View {...numpadPanResponder.panHandlers} style={styles.numpadDragHandle}>
            <Ionicons name="move" size={14} color="#999" />
            <Text style={styles.numpadDragText}>Verschieben</Text>
          </View>
          
          {/* Display */}
          <View style={styles.numpadDisplay}>
            <TextInput
              style={styles.numpadDisplayInput}
              value={numpadInput}
              onChangeText={setNumpadInput}
              keyboardType="decimal-pad"
              placeholder="0"
              placeholderTextColor="#999"
            />
            <Text style={styles.numpadUnit}>m</Text>
          </View>
          
          {/* Number grid with operators */}
          <View style={styles.modalNumpadRow}>
            {['7','8','9','+'].map(k => (
              <TouchableOpacity 
                key={k} 
                style={[styles.modalNumpadKey, k==='+' && styles.modalNumpadOp]} 
                onPress={() => handleNumpadPress(k)}
              >
                <Text style={k==='+' ? styles.modalNumpadOpText : styles.modalNumpadKeyText}>{k}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={styles.modalNumpadRow}>
            {['4','5','6','-'].map(k => (
              <TouchableOpacity 
                key={k} 
                style={[styles.modalNumpadKey, k==='-' && styles.modalNumpadOp]} 
                onPress={() => handleNumpadPress(k)}
              >
                <Text style={k==='-' ? styles.modalNumpadOpText : styles.modalNumpadKeyText}>{k === '-' ? '−' : k}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={styles.modalNumpadRow}>
            {['1','2','3','*'].map(k => (
              <TouchableOpacity 
                key={k} 
                style={[styles.modalNumpadKey, k==='*' && styles.modalNumpadOp]} 
                onPress={() => handleNumpadPress(k)}
              >
                <Text style={k==='*' ? styles.modalNumpadOpText : styles.modalNumpadKeyText}>{k === '*' ? '×' : k}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={styles.modalNumpadRow}>
            {[',','0','.','/'].map(k => (
              <TouchableOpacity 
                key={k} 
                style={[styles.modalNumpadKey, k==='/' && styles.modalNumpadOp]} 
                onPress={() => handleNumpadPress(k)}
              >
                <Text style={k==='/' ? styles.modalNumpadOpText : styles.modalNumpadKeyText}>{k === '/' ? '÷' : k}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={styles.modalNumpadRow}>
            <TouchableOpacity 
              style={[styles.modalNumpadKey, styles.modalNumpadClear]} 
              onPress={() => handleNumpadPress('C')}
            >
              <Text style={styles.modalNumpadClearText}>C</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.modalNumpadKey, styles.modalNumpadDel]} 
              onPress={() => handleNumpadPress('⌫')}
            >
              <Ionicons name="backspace-outline" size={18} color="#f44336" />
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.modalNumpadKey, { flex: 2, backgroundColor: '#2196F3' }]} 
              onPress={() => applyNumpadInputAsLabel()}
            >
              <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 11 }}>Nur Maß</Text>
            </TouchableOpacity>
          </View>
          <View style={[styles.modalNumpadRow, { marginTop: 4 }]}>
            <TouchableOpacity 
              style={[styles.modalNumpadKey, { flex: 1, backgroundColor: '#4CAF50', aspectRatio: undefined, paddingVertical: 12 }]} 
              onPress={() => handleNumpadPress('OK')}
            >
              <Ionicons name="resize" size={16} color="#fff" style={{ marginBottom: 2 }} />
              <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 11 }}>Linie ändern</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      )}

      {/* Text Annotation Modal */}
      <Modal visible={showTextModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Text hinzufügen</Text>
            <TextInput
              style={styles.modalInput}
              value={newTextInput}
              onChangeText={setNewTextInput}
              placeholder="Text eingeben..."
              placeholderTextColor="#999"
              autoFocus
              multiline
            />
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
          </View>
        </View>
      </Modal>

      {/* Edit Text Annotation Modal */}
      <Modal visible={showEditTextModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Text bearbeiten</Text>
            <TextInput
              style={styles.modalInput}
              value={editTextInput}
              onChangeText={setEditTextInput}
              placeholder="Text eingeben..."
              placeholderTextColor="#999"
              autoFocus
              multiline
            />
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
          </View>
        </View>
      </Modal>

      {/* Background Image Modal */}
      <Modal visible={showBgImageModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxHeight: '80%' }]}>
            <Text style={styles.modalTitle}>Hintergrundbild</Text>
            
            <ScrollView style={{ maxHeight: 400 }}>
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
                          borderColor: '#ddd',
                        }}
                        onPress={() => useProjectPhotoAsBackground(photo.uri)}
                      >
                        <Image
                          source={{ uri: photo.uri }}
                          style={{ width: '100%', height: '100%' }}
                          resizeMode="cover"
                        />
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}
            </ScrollView>
            
            {backgroundImage && (
              <View style={{ marginTop: 15 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 10 }}>
                  <TouchableOpacity
                    style={{ padding: 10, backgroundColor: bgLockAspectRatio ? '#4CAF50' : '#f5f5f5', borderRadius: 8, marginRight: 10 }}
                    onPress={() => setBgLockAspectRatio(!bgLockAspectRatio)}
                  >
                    <Ionicons name={bgLockAspectRatio ? "lock-closed" : "lock-open"} size={20} color={bgLockAspectRatio ? '#fff' : '#666'} />
                  </TouchableOpacity>
                  <Text style={{ fontSize: 14, color: '#666' }}>
                    Seitenverhältnis {bgLockAspectRatio ? 'gesperrt' : 'entsperrt'}
                  </Text>
                </View>
                
                <Text style={{ fontSize: 12, color: '#999', textAlign: 'center' }}>
                  Tipp: Aktiviere "Anpassen" um das Bild zu verschieben und zu skalieren
                </Text>
              </View>
            )}
            
            <TouchableOpacity
              style={[styles.modalButton, { alignSelf: 'center', paddingHorizontal: 30, marginTop: 15 }]}
              onPress={() => setShowBgImageModal(false)}
            >
              <Text style={styles.modalButtonText}>Schließen</Text>
            </TouchableOpacity>
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
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Notiz hinzufügen</Text>
            <TextInput
              style={styles.modalInput}
              value={memoText}
              onChangeText={setMemoText}
              placeholder="Notiztext eingeben..."
              placeholderTextColor="#999"
              autoFocus
            />
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
          </View>
        </View>
      </Modal>

      {/* Results Modal */}
      <Modal visible={showResultsModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxHeight: '80%', width: '90%' }]}>
            <Text style={styles.modalTitle}>Berechnungsergebnis</Text>
            
            <ScrollView style={styles.resultsScroll}>
              {/* Area Results */}
              <View style={styles.resultsSection}>
                <Text style={styles.resultsSectionTitle}>Flächen</Text>
                
                {polygons.filter(p => p.type === 'main').map((polygon) => (
                  <View key={polygon.id} style={styles.resultRow}>
                    <Text style={styles.resultName}>{polygon.name}</Text>
                    <Text style={styles.resultValueGreen}>
                      +{calculatePolygonArea(polygon.points).toFixed(2)} m²
                    </Text>
                  </View>
                ))}
                
                {polygons.filter(p => p.type === 'deduction').map((polygon) => (
                  <View key={polygon.id} style={styles.resultRow}>
                    <Text style={styles.resultName}>{polygon.name}</Text>
                    <Text style={styles.resultValueRed}>
                      -{calculatePolygonArea(polygon.points).toFixed(2)} m²
                    </Text>
                  </View>
                ))}
                
                <View style={[styles.resultRow, styles.resultRowTotal]}>
                  <Text style={styles.resultNameBold}>Netto-Fläche</Text>
                  <Text style={styles.resultValueBold}>{results.netArea.toFixed(2)} m²</Text>
                </View>
              </View>
              
              {/* Line Results */}
              {Object.keys(results.linesByCategory).length > 0 && (
                <View style={styles.resultsSection}>
                  <Text style={styles.resultsSectionTitle}>Linien</Text>
                  
                  {Object.entries(results.linesByCategory).map(([category, length]) => (
                    <View key={category} style={styles.resultRow}>
                      <View style={styles.resultNameWithColor}>
                        <View style={[styles.categoryDot, { backgroundColor: getCategoryColor(category) }]} />
                        <Text style={styles.resultName}>{category}</Text>
                      </View>
                      <Text style={styles.resultValue}>{(length as number).toFixed(2)} m</Text>
                    </View>
                  ))}
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

      {/* Parallel Guide Line Modal */}
      <Modal visible={showParallelModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Parallele Hilfslinie</Text>
            <Text style={styles.modalText}>
              Geben Sie den Abstand zur ausgewählten Hilfslinie ein:
            </Text>
            <View style={styles.inputRow}>
              <TextInput
                style={styles.modalInput}
                value={parallelDistance}
                onChangeText={setParallelDistance}
                placeholder="z.B. 0.5"
                keyboardType="decimal-pad"
                autoFocus
              />
              <Text style={styles.inputUnit}>Meter</Text>
            </View>
            <Text style={styles.modalText}>Richtung wählen:</Text>
            <View style={styles.directionButtons}>
              <TouchableOpacity
                style={[styles.directionButton, { backgroundColor: '#4CAF50' }]}
                onPress={() => {
                  const distance = parseFloat(parallelDistance.replace(',', '.'));
                  if (!isNaN(distance) && distance > 0 && selectedGuideLineId) {
                    createParallelGuideLine(selectedGuideLineId, -distance);
                  }
                  setShowParallelModal(false);
                  setSelectedGuideLineId(null);
                  setParallelDistance('');
                  setMode('select');
                }}
              >
                <Ionicons name="arrow-forward" size={20} color="#fff" />
                <Text style={styles.directionButtonText}>Rechts / Oben</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[styles.directionButton, { backgroundColor: '#2196F3' }]}
                onPress={() => {
                  const distance = parseFloat(parallelDistance.replace(',', '.'));
                  if (!isNaN(distance) && distance > 0 && selectedGuideLineId) {
                    createParallelGuideLine(selectedGuideLineId, distance);
                  }
                  setShowParallelModal(false);
                  setSelectedGuideLineId(null);
                  setParallelDistance('');
                  setMode('select');
                }}
              >
                <Ionicons name="arrow-back" size={20} color="#fff" />
                <Text style={styles.directionButtonText}>Links / Unten</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[styles.directionButton, { backgroundColor: '#9C27B0' }]}
                onPress={() => {
                  const distance = parseFloat(parallelDistance.replace(',', '.'));
                  if (!isNaN(distance) && distance > 0 && selectedGuideLineId) {
                    createParallelGuideLine(selectedGuideLineId, distance);
                    createParallelGuideLine(selectedGuideLineId, -distance);
                  }
                  setShowParallelModal(false);
                  setSelectedGuideLineId(null);
                  setParallelDistance('');
                  setMode('select');
                }}
              >
                <Ionicons name="swap-horizontal" size={20} color="#fff" />
                <Text style={styles.directionButtonText}>Beidseitig</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => {
                  setShowParallelModal(false);
                  setSelectedGuideLineId(null);
                  setParallelDistance('');
                }}
              >
                <Text style={styles.cancelButtonText}>Abbrechen</Text>
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
    paddingHorizontal: 8,
    paddingVertical: 8,
    paddingTop: Platform.OS === 'ios' ? 50 : 8,
  },
  headerButton: {
    padding: 8,
  },
  titleContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
  toolbar: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  toolButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    marginHorizontal: 2,
    backgroundColor: '#f5f5f5',
  },
  toolButtonActive: {
    backgroundColor: '#1976d2',
  },
  toolLabel: {
    fontSize: 9,
    color: '#666',
    marginTop: 2,
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
});

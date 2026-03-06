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
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
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
  
  // Undo/Redo History
  interface HistoryState {
    polygons: AreaPolygon[];
    guideLines: GuideLine[];
    lines: AreaLine[];
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
  
  // Drawing state
  const [mode, setMode] = useState<'select' | 'polygon' | 'deduction' | 'scale' | 'guideline' | 'parallel' | 'dimension'>('select');
  const [currentPoints, setCurrentPoints] = useState<AreaPoint[]>([]);
  const [selectedPolygonId, setSelectedPolygonId] = useState<string | null>(null);
  const [selectedLineIndex, setSelectedLineIndex] = useState<{ polygonId: string; pointIndex: number } | null>(null);
  
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
    };
    setRedoStack(prev => [...prev, currentState]);
    
    // Restore previous state
    const previousState = undoStack[undoStack.length - 1];
    setPolygons(previousState.polygons);
    setGuideLines(previousState.guideLines);
    setLines(previousState.lines);
    setUndoStack(prev => prev.slice(0, -1));
    
    // Clear selections
    setSelectedPolygonId(null);
    setSelectedGuideLineId(null);
  };

  // Redo
  const redo = () => {
    if (redoStack.length === 0) return;
    
    // Save current state to undo stack
    const currentState: HistoryState = {
      polygons: JSON.parse(JSON.stringify(polygons)),
      guideLines: JSON.parse(JSON.stringify(guideLines)),
      lines: JSON.parse(JSON.stringify(lines)),
    };
    setUndoStack(prev => [...prev, currentState]);
    
    // Restore next state
    const nextState = redoStack[redoStack.length - 1];
    setPolygons(nextState.polygons);
    setGuideLines(nextState.guideLines);
    setLines(nextState.lines);
    setRedoStack(prev => prev.slice(0, -1));
    
    // Clear selections
    setSelectedPolygonId(null);
    setSelectedGuideLineId(null);
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
    
    const totalArea = mainPolygons.reduce((sum, p) => sum + calculatePolygonArea(p.points), 0);
    const deductionArea = deductionPolygons.reduce((sum, p) => sum + calculatePolygonArea(p.points), 0);
    const netArea = totalArea - deductionArea;
    
    // Calculate lines by category (with deduction interruptions)
    const linesByCategory: { [category: string]: number } = {};
    lines.forEach(line => {
      const polygon = polygons.find(p => p.id === line.polygonId);
      if (polygon && polygon.type === 'main') {
        // Get line segments after deduction interruptions
        const segments = calculateLineSegmentsWithDeductions(polygon, line.pointIndex);
        
        // Sum up lengths of non-interrupted segments
        const totalLength = segments
          .filter(s => !s.isInterrupted)
          .reduce((sum, s) => sum + calculateLineLength(s.start, s.end), 0);
        
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
    
    return { totalArea, deductionArea, netArea, linesByCategory };
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
    
    console.log('[CLIP] Subject:', subject.length, 'Clip:', clip.length, 'Result:', outputList.length);
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
  const calculateNetAreaForPolygon = (mainPolygon: AreaPolygon): { grossArea: number; deductions: number; netArea: number } => {
    const grossArea = calculatePolygonArea(mainPolygon.points);
    
    // Find all deduction polygons and calculate their actual intersection with this main polygon
    const deductionPolygons = polygons.filter(p => p.type === 'deduction');
    
    let totalDeductions = 0;
    for (const deduction of deductionPolygons) {
      // Calculate the actual overlapping area (not the full deduction)
      const intersectionArea = calculateIntersectionArea(deduction, mainPolygon);
      totalDeductions += intersectionArea;
    }
    
    const netArea = grossArea - totalDeductions;
    
    return { grossArea, deductions: totalDeductions, netArea };
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
  const snapToNearestPoint = (x: number, y: number): AreaPoint => {
    const snapTolerance = 15;
    let bestPoint = { x, y };
    let bestDistance = Infinity;
    
    // 1. Check guide line intersections
    if (guideLinesVisible && guideLines.length > 0) {
      const intersections = calculateGuideLineIntersections();
      for (const intersection of intersections) {
        const dist = Math.sqrt(Math.pow(x - intersection.x, 2) + Math.pow(y - intersection.y, 2));
        if (dist < snapTolerance && dist < bestDistance) {
          bestDistance = dist;
          bestPoint = intersection;
        }
      }
      
      // 2. Check guide line endpoints
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
    
    // 3. Snap to grid if enabled and no better snap point found
    if (gridEnabled && bestDistance === Infinity) {
      bestPoint = {
        x: Math.round(x / (gridSize * scale)) * (gridSize * scale),
        y: Math.round(y / (gridSize * scale)) * (gridSize * scale)
      };
    }
    
    return bestPoint;
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

  // Touch handlers
  const handleCanvasTouch = (event: any) => {
    const touch = event.nativeEvent;
    const x = touch.locationX;
    const y = touch.locationY;
    
    // Use smart snapping
    const snapped = snapToNearestPoint(x, y);
    const snappedX = snapped.x;
    const snappedY = snapped.y;
    
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
    } else if (mode === 'select') {
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
                  
                  // Find the main polygon that this deduction intersects with
                  const mainPolygon = polygons.find(p => {
                    if (p.type !== 'main') return false;
                    // Check if any point of the deduction is inside the main polygon
                    // or if there's any intersection
                    return deduction.points.some(dp => isPointInPolygon(dp, p.points)) ||
                           p.points.some(mp => isPointInPolygon(mp, deduction.points));
                  });
                  
                  if (!mainPolygon) {
                    Alert.alert('Hinweis', 'Die Abzugsfläche überlappt keine Hauptfläche.');
                    return;
                  }
                  
                  saveStateForUndo();
                  
                  // Clip the deduction to the main polygon
                  const clippedPoints = clipPolygonToPolygon(deduction.points, mainPolygon.points);
                  
                  if (clippedPoints.length < 3) {
                    Alert.alert('Hinweis', 'Die Abzugsfläche liegt außerhalb der Hauptfläche.');
                    return;
                  }
                  
                  // Update the deduction polygon with the clipped points
                  const updatedDeduction = { ...deduction, points: clippedPoints };
                  
                  // Also insert intersection points into the main polygon
                  const updatedMainPolygons = insertDeductionIntersections(updatedDeduction, [mainPolygon]);
                  
                  // Build new polygon list
                  const otherPolygons = polygons.filter(p => p.id !== deduction.id && p.id !== mainPolygon.id);
                  setPolygons([...updatedMainPolygons, ...otherPolygons, updatedDeduction]);
                  
                  Alert.alert('Fertig', 'Abzugsfläche wurde eingepasst und Schnittpunkte eingefügt.');
                }}
              >
                <Ionicons name="cut" size={20} color="#fff" />
                <Text style={[styles.toolLabel, { color: '#fff' }]}>Einpassen</Text>
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
        
        <TouchableOpacity
          style={[styles.toolButton, mode === 'dimension' && styles.toolButtonActive, { backgroundColor: mode === 'dimension' ? '#9C27B0' : '#f5f5f5' }]}
          onPress={() => {
            setMode(mode === 'dimension' ? 'select' : 'dimension');
            setCurrentPoints([]);
          }}
        >
          <Ionicons name="code-working" size={20} color={mode === 'dimension' ? '#fff' : '#9C27B0'} />
          <Text style={[styles.toolLabel, mode === 'dimension' && styles.toolLabelActive]}>Vermaß</Text>
        </TouchableOpacity>
      </View>

      {/* Canvas */}
      <View 
        style={styles.canvas}
        onTouchStart={(event) => {
          const touch = event.nativeEvent;
          const x = touch.locationX;
          const y = touch.locationY;
          
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
        }}
        onTouchMove={(event) => {
          const touch = event.nativeEvent;
          const x = touch.locationX;
          const y = touch.locationY;
          
          // Update current touch position for live length display
          if ((mode === 'polygon' || mode === 'deduction' || mode === 'guideline' || mode === 'dimension') && currentPoints.length > 0) {
            setCurrentTouchPosition({ x, y });
          }
          
          // Dragging polygon point
          if (draggingPolygonPoint) {
            const snapped = snapToNearestPoint(x, y);
            updatePolygonPoint(draggingPolygonPoint.polygonId, draggingPolygonPoint.pointIndex, snapped);
            setCurrentTouchPosition({ x, y }); // For live length display
            return;
          }
          
          // Dragging whole polygon
          if (draggingWholePolygon) {
            const dx = x - draggingWholePolygon.startPos.x;
            const dy = y - draggingWholePolygon.startPos.y;
            moveWholePolygon(draggingWholePolygon.polygonId, dx, dy);
            setDraggingWholePolygon({ ...draggingWholePolygon, startPos: { x, y } });
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
            const snapped = snapToNearestPoint(x, y);
            updateGuideLinePoint(draggingGuidePoint.guideId, draggingGuidePoint.point, snapped);
          }
          
          // Dragging dimension line point
          if (draggingDimensionPoint) {
            const snapped = snapToNearestPoint(x, y);
            updateDimensionLinePoint(draggingDimensionPoint.dimId, draggingDimensionPoint.point, snapped);
          }
        }}
        onTouchEnd={(event) => {
          setCurrentTouchPosition(null);
          
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
          
          if (addPointMode) {
            return; // Already handled in onTouchStart
          }
          
          handleCanvasTouch(event);
        }}
      >
        <Svg width={canvasWidth} height={canvasHeight}>
          {/* Grid */}
          {renderGrid()}
          
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
            // Abzugsflächen halbtransparent rot, Grundflächen halbtransparent grün
            const fillColor = polygon.type === 'deduction' ? 'rgba(244,67,54,0.4)' : 'rgba(76,175,80,0.3)';
            const strokeColor = polygon.type === 'deduction' ? '#f44336' : '#4CAF50';
            
            return (
              <G key={polygon.id}>
                <SvgPolygon
                  points={pointsString}
                  fill={fillColor}
                  stroke={isSelected ? '#1976d2' : strokeColor}
                  strokeWidth={isSelected ? 3 : 2}
                />
                
                {/* Line categories - with interruption by deductions */}
                {polygon.type === 'main' && polygon.points.map((point, index) => {
                  const nextPoint = polygon.points[(index + 1) % polygon.points.length];
                  const category = getLineCategory(polygon.id, index);
                  
                  if (category) {
                    // Get segments after deduction interruptions
                    const segments = calculateLineSegmentsWithDeductions(polygon, index);
                    const color = getCategoryColor(category);
                    
                    // Calculate total visible length
                    const totalLength = segments
                      .filter(s => !s.isInterrupted)
                      .reduce((sum, s) => sum + calculateLineLength(s.start, s.end), 0);
                    
                    return (
                      <G key={`line-${polygon.id}-${index}`}>
                        {/* Draw each visible segment with its own measurement */}
                        {segments.filter(s => !s.isInterrupted).map((segment, segIdx) => {
                          const segMidX = (segment.start.x + segment.end.x) / 2;
                          const segMidY = (segment.start.y + segment.end.y) / 2;
                          const segLength = calculateLineLength(segment.start, segment.end);
                          
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
                              {/* Segment measurement */}
                              <Rect 
                                x={segMidX - 25} 
                                y={segMidY - 10} 
                                width={50} 
                                height={20} 
                                rx={4} 
                                fill={color} 
                              />
                              <SvgText x={segMidX} y={segMidY + 4} textAnchor="middle" fontSize={10} fontWeight="bold" fill="#fff">
                                {segLength.toFixed(2)}m
                              </SvgText>
                            </G>
                          );
                        })}
                        {/* Show total summary if there are interruptions */}
                        {(() => {
                          const visibleSegments = segments.filter(s => !s.isInterrupted);
                          const fullLength = calculateLineLength(point, nextPoint);
                          const hasInterruption = segments.length > 1 || totalLength < fullLength - 0.01;
                          
                          // Only show summary if there are multiple segments
                          if (hasInterruption && visibleSegments.length > 1) {
                            // Position summary above/below the line
                            const midX = (point.x + nextPoint.x) / 2;
                            const midY = (point.y + nextPoint.y) / 2 - 30;
                            
                            return (
                              <G>
                                <Rect x={midX - 35} y={midY - 12} width={70} height={24} rx={4} fill="rgba(0,0,0,0.7)" />
                                <SvgText x={midX} y={midY - 1} textAnchor="middle" fontSize={8} fill="rgba(255,255,255,0.7)">
                                  Summe:
                                </SvgText>
                                <SvgText x={midX} y={midY + 9} textAnchor="middle" fontSize={10} fontWeight="bold" fill="#fff">
                                  {totalLength.toFixed(2)}m
                                </SvgText>
                              </G>
                            );
                          }
                          return null;
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
                    const length = calculateLineLength(point, nextPoint);
                    
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
                        <Circle cx={midX} cy={midY} r={18} fill={getCategoryColor(category)} />
                        <SvgText x={midX} y={midY + 4} textAnchor="middle" fontSize={10} fontWeight="bold" fill="#fff">
                          {length.toFixed(2)}m
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
                  
                  const length = calculateLineLength(point, nextPoint);
                  if (length < 0.1) return null; // Skip very short edges
                  
                  // Position label at the midpoint of the line
                  const midX = (point.x + nextPoint.x) / 2;
                  const midY = (point.y + nextPoint.y) / 2;
                  
                  // Calculate rotation angle for the label to align with the line
                  const dx = nextPoint.x - point.x;
                  const dy = nextPoint.y - point.y;
                  let angle = Math.atan2(dy, dx) * (180 / Math.PI);
                  
                  // Keep text readable (not upside down)
                  if (angle > 90 || angle < -90) {
                    angle += 180;
                  }
                  
                  const labelWidth = 50;
                  const labelHeight = 16;
                  
                  return (
                    <G key={`edge-length-${polygon.id}-${index}`} transform={`rotate(${angle}, ${midX}, ${midY})`}>
                      <Rect 
                        x={midX - labelWidth / 2} 
                        y={midY - labelHeight / 2} 
                        width={labelWidth} 
                        height={labelHeight} 
                        rx={3} 
                        fill={polygon.type === 'deduction' ? '#f44336' : '#4CAF50'} 
                      />
                      <SvgText x={midX} y={midY + 4} textAnchor="middle" fontSize={9} fontWeight="bold" fill="#fff">
                        {length.toFixed(2)} m
                      </SvgText>
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
                    const { grossArea, deductions, netArea } = calculateNetAreaForPolygon(polygon);
                    const hasDeductions = deductions > 0;
                    
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
                          x={labelX - 50}
                          y={labelY - (hasDeductions ? 32 : 22)}
                          width={100}
                          height={hasDeductions ? 64 : 44}
                          rx={6}
                          fill="rgba(255,255,255,0.95)"
                          stroke={strokeColor}
                          strokeWidth={1}
                        />
                        <SvgText
                          x={labelX}
                          y={labelY - (hasDeductions ? 18 : 6)}
                          textAnchor="middle"
                          fontSize={10}
                          fill="#666"
                        >
                          {polygon.name}
                        </SvgText>
                        {hasDeductions && (
                          <>
                            <SvgText
                              x={labelX}
                              y={labelY}
                              textAnchor="middle"
                              fontSize={10}
                              fill="#999"
                            >
                              {grossArea.toFixed(2)} - {deductions.toFixed(2)}
                            </SvgText>
                          </>
                        )}
                        <SvgText
                          x={labelX}
                          y={labelY + (hasDeductions ? 18 : 12)}
                          textAnchor="middle"
                          fontSize={14}
                          fontWeight="bold"
                          fill={strokeColor}
                        >
                          {netArea.toFixed(2)} m²
                        </SvgText>
                      </G>
                    );
                  } else {
                    // Deduction polygon - show negative area
                    const area = calculatePolygonArea(polygon.points);
                    
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
                          x={labelX - 45}
                          y={labelY - 22}
                          width={90}
                          height={44}
                          rx={6}
                          fill="rgba(255,255,255,0.95)"
                          stroke={strokeColor}
                          strokeWidth={1}
                        />
                        <SvgText
                          x={labelX}
                          y={labelY - 6}
                          textAnchor="middle"
                          fontSize={10}
                          fill="#666"
                        >
                          {polygon.name}
                        </SvgText>
                        <SvgText
                          x={labelX}
                          y={labelY + 12}
                          textAnchor="middle"
                          fontSize={14}
                          fontWeight="bold"
                          fill={strokeColor}
                        >
                          -{area.toFixed(2)} m²
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
        </Svg>
      </View>

      {/* Status Bar */}
      <View style={styles.statusBar}>
        <View style={styles.statusItem}>
          <Text style={styles.statusLabel}>Netto</Text>
          <Text style={styles.statusValue}>{results.netArea.toFixed(2)} m²</Text>
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
             mode === 'guideline' ? 'Hilfslinie' :
             mode === 'parallel' ? 'Parallel' : 
             mode === 'dimension' ? 'Vermaßung' : 'Auswahl'}
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
});

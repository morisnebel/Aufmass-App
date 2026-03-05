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
  
  // Drawing state
  const [mode, setMode] = useState<'select' | 'polygon' | 'deduction' | 'scale' | 'guideline' | 'parallel'>('select');
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

  // Calculate results
  const calculateResults = () => {
    const mainPolygons = polygons.filter(p => p.type === 'main');
    const deductionPolygons = polygons.filter(p => p.type === 'deduction');
    
    const totalArea = mainPolygons.reduce((sum, p) => sum + calculatePolygonArea(p.points), 0);
    const deductionArea = deductionPolygons.reduce((sum, p) => sum + calculatePolygonArea(p.points), 0);
    const netArea = totalArea - deductionArea;
    
    // Calculate lines by category
    const linesByCategory: { [category: string]: number } = {};
    lines.forEach(line => {
      const polygon = polygons.find(p => p.id === line.polygonId);
      if (polygon) {
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
    setGuideLines(guideLines.filter(g => g.id !== id && g.parentId !== id));
    setSelectedGuideLineId(null);
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
        const newGuideLine = {
          id: Date.now().toString(),
          start: currentPoints[0],
          end: { x: snappedX, y: snappedY }
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
    
    const newPolygon: AreaPolygon = {
      id: Date.now().toString(),
      points: [...currentPoints],
      type: mode === 'deduction' ? 'deduction' : 'main',
      name: mode === 'deduction' ? 'Abzug' : 'Fläche',
      color: mode === 'deduction' ? '#f44336' : '#4CAF50',
    };
    
    setPolygons([...polygons, newPolygon]);
    setCurrentPoints([]);
    setPolygonNameInput(newPolygon.name);
    setSelectedPolygonId(newPolygon.id);
    setShowPolygonNameModal(true);
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
    
    setPolygons(polygons.filter(p => p.id !== selectedPolygonId));
    setLines(lines.filter(l => l.polygonId !== selectedPolygonId));
    setSelectedPolygonId(null);
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
          <TouchableOpacity style={[styles.toolButton, { backgroundColor: '#f44336' }]} onPress={deleteSelectedPolygon}>
            <Ionicons name="trash" size={20} color="#fff" />
            <Text style={[styles.toolLabel, { color: '#fff' }]}>Löschen</Text>
          </TouchableOpacity>
        )}
        
        {selectedGuideLineId && mode === 'select' && (
          <TouchableOpacity 
            style={[styles.toolButton, { backgroundColor: '#f44336' }]} 
            onPress={() => deleteGuideLine(selectedGuideLineId)}
          >
            <Ionicons name="trash" size={20} color="#fff" />
            <Text style={[styles.toolLabel, { color: '#fff' }]}>Löschen</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Canvas */}
      <View 
        style={styles.canvas}
        onTouchEnd={handleCanvasTouch}
      >
        <Svg width={canvasWidth} height={canvasHeight}>
          {/* Grid */}
          {renderGrid()}
          
          {/* Guide Lines */}
          {guideLinesVisible && guideLines.map((guide) => {
            const isSelected = selectedGuideLineId === guide.id;
            return (
              <G key={guide.id}>
                <Line
                  x1={guide.start.x}
                  y1={guide.start.y}
                  x2={guide.end.x}
                  y2={guide.end.y}
                  stroke={isSelected ? '#1976d2' : (guide.isParallel ? '#9C27B0' : '#FF9800')}
                  strokeWidth={isSelected ? 3 : 1.5}
                  strokeDasharray="8,4"
                />
                <Circle cx={guide.start.x} cy={guide.start.y} r={4} fill={guide.isParallel ? '#9C27B0' : '#FF9800'} />
                <Circle cx={guide.end.x} cy={guide.end.y} r={4} fill={guide.isParallel ? '#9C27B0' : '#FF9800'} />
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
          
          {/* Current guide line being drawn */}
          {mode === 'guideline' && currentPoints.length === 1 && (
            <Circle
              cx={currentPoints[0].x}
              cy={currentPoints[0].y}
              r={8}
              fill="#FF9800"
            />
          )}
          
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
          
          {/* Existing polygons */}
          {polygons.map((polygon) => {
            const pointsString = polygon.points.map(p => `${p.x},${p.y}`).join(' ');
            const isSelected = selectedPolygonId === polygon.id;
            const fillColor = polygon.type === 'deduction' ? 'rgba(244,67,54,0.3)' : 'rgba(76,175,80,0.3)';
            const strokeColor = polygon.type === 'deduction' ? '#f44336' : '#4CAF50';
            
            return (
              <G key={polygon.id}>
                <SvgPolygon
                  points={pointsString}
                  fill={fillColor}
                  stroke={isSelected ? '#1976d2' : strokeColor}
                  strokeWidth={isSelected ? 3 : 2}
                />
                
                {/* Line categories */}
                {polygon.points.map((point, index) => {
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
                        <Circle
                          cx={midX}
                          cy={midY}
                          r={18}
                          fill={getCategoryColor(category)}
                        />
                        <SvgText
                          x={midX}
                          y={midY + 4}
                          textAnchor="middle"
                          fontSize={10}
                          fontWeight="bold"
                          fill="#fff"
                        >
                          {length.toFixed(2)}m
                        </SvgText>
                      </G>
                    );
                  }
                  return null;
                })}
                
                {/* Polygon points */}
                {polygon.points.map((point, index) => (
                  <Circle
                    key={`point-${polygon.id}-${index}`}
                    cx={point.x}
                    cy={point.y}
                    r={isSelected ? 8 : 5}
                    fill={isSelected ? '#1976d2' : strokeColor}
                  />
                ))}
                
                {/* Area label */}
                {polygon.points.length > 0 && (() => {
                  const centerX = polygon.points.reduce((sum, p) => sum + p.x, 0) / polygon.points.length;
                  const centerY = polygon.points.reduce((sum, p) => sum + p.y, 0) / polygon.points.length;
                  const area = calculatePolygonArea(polygon.points);
                  
                  return (
                    <G>
                      <Rect
                        x={centerX - 45}
                        y={centerY - 22}
                        width={90}
                        height={44}
                        rx={6}
                        fill="rgba(255,255,255,0.95)"
                        stroke={strokeColor}
                        strokeWidth={1}
                      />
                      <SvgText
                        x={centerX}
                        y={centerY - 6}
                        textAnchor="middle"
                        fontSize={10}
                        fill="#666"
                      >
                        {polygon.name}
                      </SvgText>
                      <SvgText
                        x={centerX}
                        y={centerY + 12}
                        textAnchor="middle"
                        fontSize={14}
                        fontWeight="bold"
                        fill={strokeColor}
                      >
                        {area.toFixed(2)} m²
                      </SvgText>
                    </G>
                  );
                })()}
              </G>
            );
          })}
          
          {/* Current drawing polygon */}
          {currentPoints.length > 0 && (
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
             mode === 'parallel' ? 'Parallel' : 'Auswahl'}
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
                    createParallelGuideLine(selectedGuideLineId, distance);
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
                    createParallelGuideLine(selectedGuideLineId, -distance);
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

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
} from 'react-native';
import Slider from '@react-native-community/slider';
import { useRouter, useLocalSearchParams, useFocusEffect, useNavigation } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { SketchService, PhotoService } from '../../services/LocalStorage';
import { captureRef } from 'react-native-view-shot';
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
  type: 'path' | 'line' | 'circle' | 'rect' | 'text' | 'image' | 'arrow' | 'pointer' | 'polygon' | 'polyline';
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
}

type DrawMode = 'select' | 'pen' | 'line' | 'circle' | 'rect' | 'arrow' | 'pointer' | 'text' | 'image' | 'polygon' | 'polyline';

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
  
  const canvasRef = useRef(null);
  const svgRef = useRef(null);
  const initialImageAdded = useRef(false);
  
  // State
  const [title, setTitle] = useState('Neue Skizze');
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
  const [startPoint, setStartPoint] = useState<{ x: number; y: number } | null>(null);
  const [tempElement, setTempElement] = useState<DrawElement | null>(null);
  
  // Polyline state - für zusammenhängende Linien (Grundrisse)
  const [polylinePoints, setPolylinePoints] = useState<{ x: number; y: number }[]>([]);
  
  // Transform state
  const [dragMode, setDragMode] = useState<'move' | 'resize' | 'rotate' | null>(null);
  const [resizeHandle, setResizeHandle] = useState<string | null>(null);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [originalElement, setOriginalElement] = useState<DrawElement | null>(null);
  
  // Zoom & Pan
  const [scale, setScale] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  
  // Foto-Bearbeitungsmodus - wenn true, kann nur das Hintergrundfoto bearbeitet werden
  const [photoEditMode, setPhotoEditMode] = useState(false);
  
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
              {['g','h','i','j','k','l'].map(k => (
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
                <TouchableOpacity key={`let-${k}`} style={styles.modalNumpadKey} onPress={() => handleActiveNumpadPress(modalNumpadCaps ? k.toUpperCase() : k)}>
                  <Text style={styles.modalNumpadKeyText}>{modalNumpadCaps ? k.toUpperCase() : k}</Text>
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
  const [textInput, setTextInput] = useState('');
  const [arrowText, setArrowText] = useState('');
  const [arrowHeads, setArrowHeads] = useState<'single' | 'double'>('double');
  const [pointerText, setPointerText] = useState('');
  
  // Edit state for text and arrow
  const [editFontSize, setEditFontSize] = useState(20);
  const [editStrokeWidth, setEditStrokeWidth] = useState(3);
  const [editFontWeight, setEditFontWeight] = useState<'normal' | 'bold'>('bold');
  const [editFontStyle, setEditFontStyle] = useState<'normal' | 'italic'>('normal');
  const [editArrowFontSize, setEditArrowFontSize] = useState(14);
  const [editPointerFontSize, setEditPointerFontSize] = useState(16);
  const [editPointerStrokeWidth, setEditPointerStrokeWidth] = useState(6);
  
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
        };

        console.log('Auto-saving sketch with', elements.length, 'elements');
        console.log('Saving totalLfmBoxPositions:', totalLfmBoxPositions);

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
        allowsEditing: true,
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
        allowsEditing: true,
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
        allowsEditing: true,
        quality: 0.7,
        base64: true,
      });

      if (!result.canceled && result.assets[0].base64) {
        const base64Image = `data:image/jpeg;base64,${result.assets[0].base64}`;
        const newElement: DrawElement = {
          id: generateId(),
          type: 'image',
          data: { uri: base64Image },
          color: '#000000',
          strokeWidth: 0,
          x: 100,
          y: 100,
          width: 200,
          height: 200,
          rotation: 0,
        };
        addToHistory([...elements, newElement]);
      }
    } catch (error) {
      console.error('Error inserting image:', error);
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
        allowsEditing: true,
        quality: 0.7,
        base64: true,
      });

      if (!result.canceled && result.assets[0].base64) {
        const base64Image = `data:image/jpeg;base64,${result.assets[0].base64}`;
        const newElement: DrawElement = {
          id: generateId(),
          type: 'image',
          data: { uri: base64Image },
          color: '#000000',
          strokeWidth: 0,
          x: 100,
          y: 100,
          width: 250,
          height: 250,
          rotation: 0,
        };
        addToHistory([...elements, newElement]);
      }
    } catch (error) {
      console.error('Error taking photo:', error);
      showAlert('Fehler', 'Foto konnte nicht aufgenommen werden');
    }
  };

  // Touch handlers
  const onTouchStart = (event: any) => {
    const touch = event.nativeEvent.touches ? event.nativeEvent.touches[0] : event.nativeEvent;
    const locationX = (touch.locationX || touch.pageX) / scale - panOffset.x / scale;
    const locationY = (touch.locationY || touch.pageY) / scale - panOffset.y / scale;

    if (drawMode === 'select') {
      handleSelectTouchStart(locationX, locationY);
    } else if (drawMode === 'text') {
      // Show text input modal
      setPendingPosition({ x: locationX, y: locationY });
      setShowTextModal(true);
    } else if (drawMode === 'pen') {
      setCurrentPath(`M ${locationX} ${locationY}`);
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
    } else {
      // Other drawing modes
      setStartPoint({ x: locationX, y: locationY });
    }
  };

  const onTouchMove = (event: any) => {
    const touch = event.nativeEvent.touches ? event.nativeEvent.touches[0] : event.nativeEvent;
    const locationX = (touch.locationX || touch.pageX) / scale - panOffset.x / scale;
    const locationY = (touch.locationY || touch.pageY) / scale - panOffset.y / scale;

    if (drawMode === 'select' && dragMode && originalElement && dragStart) {
      handleSelectTouchMove(locationX, locationY);
    } else if (drawMode === 'pen' && currentPath) {
      setCurrentPath(prev => `${prev} L ${locationX} ${locationY}`);
    } else if (drawMode === 'polygon' && currentPath) {
      setCurrentPath(prev => `${prev} L ${locationX} ${locationY}`);
    } else if (startPoint && drawMode !== 'text') {
      // Preview for other shapes
      createTempElement(startPoint, locationX, locationY);
    }
  };

  const onTouchEnd = (event: any) => {
    if (drawMode === 'pen' && currentPath && currentPath.length > 0) {
      const newElement: DrawElement = {
        id: generateId(),
        type: 'path',
        data: currentPath,
        color: drawColor,
        strokeWidth,
        rotation: 0,
      };
      addToHistory([...elements, newElement]);
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
    } else if (startPoint && drawMode === 'arrow') {
      const touch = event.nativeEvent.changedTouches ? event.nativeEvent.changedTouches[0] : event.nativeEvent;
      const locationX = (touch.locationX || touch.pageX) / scale - panOffset.x / scale;
      const locationY = (touch.locationY || touch.pageY) / scale - panOffset.y / scale;
      
      // Show arrow text input
      setPendingArrow({ x1: startPoint.x, y1: startPoint.y, x2: locationX, y2: locationY });
      setShowArrowModal(true);
      setStartPoint(null);
      setTempElement(null);
    } else if (startPoint && drawMode === 'pointer') {
      // Memo-Pfeil: Modal öffnen für optionale Notiz
      const touch = event.nativeEvent.changedTouches ? event.nativeEvent.changedTouches[0] : event.nativeEvent;
      const locationX = (touch.locationX || touch.pageX) / scale - panOffset.x / scale;
      const locationY = (touch.locationY || touch.pageY) / scale - panOffset.y / scale;
      
      // Speichere die Pointer-Koordinaten und öffne Modal
      setPendingPointer({ x1: startPoint.x, y1: startPoint.y, x2: locationX, y2: locationY });
      setPointerText(''); // Text zurücksetzen
      setShowPointerModal(true);
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
          strokeWidth: strokeWidth,
          rotation: 0,
        };
        break;
      case 'pointer':
        // Pointer-Pfeil: Dicke Linie mit großer Pfeilspitze (nur eine Spitze am Ende)
        element = {
          id: 'temp',
          type: 'pointer',
          data: { x1: start.x, y1: start.y, x2: endX, y2: endY },
          color: drawColor,
          strokeWidth: Math.max(strokeWidth * 2, 6), // Mindestens doppelt so dick
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

  // Add text element
  const addTextElement = () => {
    if (textInput.trim() && pendingPosition) {
      const newElement: DrawElement = {
        id: generateId(),
        type: 'text',
        data: { text: textInput },
        color: drawColor,
        strokeWidth: 0,
        x: pendingPosition.x,
        y: pendingPosition.y,
        rotation: 0,
        fontSize: 20,
        fontWeight: 'bold',
        fontStyle: 'normal',
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
          fontSize: 14,
        },
        color: drawColor,
        strokeWidth: strokeWidth,
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
        strokeWidth: Math.max(strokeWidth * 2, 6),
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

  // Selection & Transform handlers
  const handleSelectTouchStart = (locationX: number, locationY: number) => {
    // Check if clicking on transformation handles first
    if (selectedElementId) {
      const selectedEl = elements.find(el => el.id === selectedElementId);
      if (selectedEl) {
        // Check for polyline point editing first
        if (selectedEl.type === 'polyline' && selectedEl.data?.points) {
          const pointRadius = 20; // Klick-Toleranz für Eckpunkte
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
      // Segment gefunden - auswählen für Maß-Eingabe
      setSelectedLineSegment({ 
        elementId: segmentHit.element.id, 
        segmentIndex: segmentHit.segmentIndex 
      });
      setSelectedElementId(segmentHit.element.id);
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
          setDrawColor(clickedElement.color);
          setShowEditTextModal(true);
        } else if (clickedElement.type === 'arrow') {
          setArrowText(clickedElement.data.text || '');
          setArrowHeads(clickedElement.data.heads || 'double');
          setEditArrowFontSize(clickedElement.data.fontSize || 14);
          setEditStrokeWidth(clickedElement.strokeWidth || 3);
          setDrawColor(clickedElement.color);
          setShowEditArrowModal(true);
        } else if (clickedElement.type === 'pointer') {
          // Memo-Pfeil bearbeiten
          setPointerText(clickedElement.data.text || '');
          setEditPointerFontSize(clickedElement.data.fontSize || 16);
          setEditPointerStrokeWidth(clickedElement.strokeWidth || 6);
          setDrawColor(clickedElement.color);
          setShowEditPointerModal(true);
        }
        lastTapRef.current = { time: 0, elementId: null };
        return;
      }
      
      lastTapRef.current = { time: now, elementId: clickedElement.id };
      
      setSelectedElementId(clickedElement.id);
      setDragMode('move');
      setDragStart({ x: locationX, y: locationY });
      setOriginalElement(JSON.parse(JSON.stringify(clickedElement)));
    } else {
      setSelectedElementId(null);
      lastTapRef.current = { time: 0, elementId: null };
    }
  };

  const handleSelectTouchMove = (locationX: number, locationY: number) => {
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
        } else if (el.type === 'line' || el.type === 'arrow' || el.type === 'pointer') {
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
        }
      } else if (dragMode === 'rotate' && resizeHandle === 'rotate') {
        // Rotate element
        let centerX = 0, centerY = 0;
        
        if (el.type === 'circle') {
          centerX = originalElement.data.cx;
          centerY = originalElement.data.cy;
        } else if (el.type === 'line' || el.type === 'arrow' || el.type === 'pointer') {
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
        } else if (el.type === 'line' || el.type === 'arrow' || el.type === 'pointer') {
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
          let newX = originalElement.x || 0;
          let newY = originalElement.y || 0;
          let newW = originalElement.width || 100;
          let newH = originalElement.height || 100;
          
          if (resizeHandle.includes('right')) {
            newW = (originalElement.width || 100) + dx;
          }
          if (resizeHandle.includes('left')) {
            newX = (originalElement.x || 0) + dx;
            newW = (originalElement.width || 100) - dx;
          }
          if (resizeHandle.includes('bottom')) {
            newH = (originalElement.height || 100) + dy;
          }
          if (resizeHandle.includes('top')) {
            newY = (originalElement.y || 0) + dy;
            newH = (originalElement.height || 100) - dy;
          }
          
          newEl.x = newX;
          newEl.y = newY;
          newEl.width = Math.max(20, newW);
          newEl.height = Math.max(20, newH);
        }
      }

      return newEl;
    });

    setElements(newElements);
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
        const elW = el.width || 100;
        const elH = el.height || 30;
        if (x >= elX - 10 && x <= elX + elW + 10 &&
            y >= elY - 10 && y <= elY + elH + 10) {
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
        const points = el.data.points;
        if (points && points.length >= 2) {
          for (let j = 0; j < points.length - 1; j++) {
            const dist = distanceToLineSegment(x, y, points[j].x, points[j].y, points[j+1].x, points[j+1].y);
            if (dist < 15) return el;
          }
          // Prüfe auch die schließende Linie wenn geschlossen
          if (el.data.closed && points.length >= 3) {
            const dist = distanceToLineSegment(x, y, points[points.length-1].x, points[points.length-1].y, points[0].x, points[0].y);
            if (dist < 15) return el;
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
    for (let i = elements.length - 1; i >= 0; i--) {
      const el = elements[i];
      if (el.type === 'polyline') {
        const points = el.data.points;
        if (points && points.length >= 2) {
          // Prüfe jedes Segment
          for (let j = 0; j < points.length - 1; j++) {
            const dist = distanceToLineSegment(x, y, points[j].x, points[j].y, points[j+1].x, points[j+1].y);
            if (dist < 20) {
              return { element: el, segmentIndex: j };
            }
          }
          // Prüfe auch die schließende Linie wenn geschlossen
          if (el.data.closed && points.length >= 3) {
            const dist = distanceToLineSegment(x, y, points[points.length-1].x, points[points.length-1].y, points[0].x, points[0].y);
            if (dist < 20) {
              return { element: el, segmentIndex: points.length - 1 }; // Index für Schlusslinie
            }
          }
        }
      }
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
    } else if (element.type === 'line' || element.type === 'arrow' || element.type === 'pointer') {
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
        
        // Große Pfeilspitze berechnen (proportional zur Strichdicke)
        const arrowHeadSize = Math.max(20, element.strokeWidth * 4);
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
                {/* Hintergrund für bessere Lesbarkeit */}
                <Rect
                  x={textOffsetX - 5}
                  y={textOffsetY - ptrFontSize}
                  width={ptrText.length * ptrFontSize * 0.6 + 10}
                  height={ptrFontSize + 8}
                  fill="rgba(255, 255, 255, 0.85)"
                  rx={4}
                  ry={4}
                  stroke={element.color}
                  strokeWidth={1}
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
              </G>
            )}
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
              const angleDeg = angle * 180 / Math.PI;
              
              // Offset für die Maßlinie (oberhalb der Linie)
              const offset = 15;
              const offsetX = -Math.sin(angle) * offset;
              const offsetY = Math.cos(angle) * offset;
              
              // Linienlänge für End-Striche
              const lineLength = Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
              const tickLength = 8;
              
              return (
                <G key={`measure-${element.id}-${segIdx}`}>
                  {/* Maßlinie parallel zur Original-Linie */}
                  <Line
                    x1={p1.x + offsetX}
                    y1={p1.y + offsetY}
                    x2={p2.x + offsetX}
                    y2={p2.y + offsetY}
                    stroke="#1976d2"
                    strokeWidth={1.5}
                  />
                  {/* End-Strich links */}
                  <Line
                    x1={p1.x + offsetX - Math.sin(angle) * tickLength}
                    y1={p1.y + offsetY + Math.cos(angle) * tickLength}
                    x2={p1.x + offsetX + Math.sin(angle) * tickLength}
                    y2={p1.y + offsetY - Math.cos(angle) * tickLength}
                    stroke="#1976d2"
                    strokeWidth={1.5}
                  />
                  {/* End-Strich rechts */}
                  <Line
                    x1={p2.x + offsetX - Math.sin(angle) * tickLength}
                    y1={p2.y + offsetY + Math.cos(angle) * tickLength}
                    x2={p2.x + offsetX + Math.sin(angle) * tickLength}
                    y2={p2.y + offsetY - Math.cos(angle) * tickLength}
                    stroke="#1976d2"
                    strokeWidth={1.5}
                  />
                  {/* Hintergrund für Text */}
                  <Rect
                    x={midX + offsetX - measurementText.length * 4 - 4}
                    y={midY + offsetY - 10}
                    width={measurementText.length * 8 + 8}
                    height={16}
                    fill="white"
                    rx={2}
                    ry={2}
                  />
                  {/* Maß-Text */}
                  <SvgText
                    x={midX + offsetX}
                    y={midY + offsetY + 3}
                    fill="#1976d2"
                    fontSize={12}
                    fontWeight="bold"
                    textAnchor="middle"
                  >
                    {measurementText}
                  </SvgText>
                </G>
              );
            })}
            
            {/* Punkte anzeigen wenn ausgewählt - größer und interaktiv */}
            {isSelected && points.map((pt: { x: number; y: number }, idx: number) => (
              <Circle 
                key={`polyline-pt-${idx}`}
                cx={pt.x} 
                cy={pt.y} 
                r={editingPolylinePoint === idx ? 12 : 8} 
                fill={editingPolylinePoint === idx ? '#ff5722' : (idx === 0 ? '#4caf50' : '#2196f3')} 
                stroke="#fff" 
                strokeWidth={editingPolylinePoint === idx ? 3 : 2} 
              />
            ))}
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
    } else if (element.type === 'line' || element.type === 'arrow' || element.type === 'pointer') {
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
    minX -= padding;
    minY -= padding;
    maxX += padding;
    maxY += padding;
    
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
        const pointerStrokeWidth = el.strokeWidth || 6;
        const arrowHeadSize = Math.max(20, pointerStrokeWidth * 4);
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
          
          svgElements += `<rect x="${textX - 5}" y="${textY - fontSize}" width="${textWidth}" height="${textHeight}" fill="white" fill-opacity="0.85" rx="4" stroke="${el.color}" stroke-width="1"/>`;
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
          
          // Offset for dimension line (above the line)
          const offset = 15;
          const offsetX = -Math.sin(angle) * offset;
          const offsetY = Math.cos(angle) * offset;
          
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
      } else if (el.type === 'polygon' && typeof el.data === 'string') {
        svgElements += `<path d="${el.data}" stroke="${el.color}" stroke-width="${strokeWidth}" fill="${el.color}" fill-opacity="0.3" stroke-linecap="round" stroke-linejoin="round"/>`;
      }
    });
    
    // Add total length (lfm) for each polyline element that has measurements
    // Positioniere jedes Gesamt-Feld direkt unter seinem Grundriss
    elements.forEach((el) => {
      if (el.type === 'polyline' && lineSegmentMeasurements[el.id]) {
        const totalForElement = calculateTotalLfmForElement(el.id);
        if (totalForElement > 0) {
          const totalText = `Gesamt: ${totalForElement.toString().replace('.', ',')} lfm`;
          const textWidth = totalText.length * 7 + 16;
          const textHeight = 20;
          
          // Berechne die Bounds des Polyline-Elements
          const points = el.data?.points || [];
          if (points.length === 0) return;
          
          let polyMinX = Infinity, polyMinY = Infinity, polyMaxX = -Infinity, polyMaxY = -Infinity;
          points.forEach((pt: { x: number; y: number }) => {
            if (pt.x < polyMinX) polyMinX = pt.x;
            if (pt.y < polyMinY) polyMinY = pt.y;
            if (pt.x > polyMaxX) polyMaxX = pt.x;
            if (pt.y > polyMaxY) polyMaxY = pt.y;
          });
          
          // Positioniere das Gesamt-Feld links unter dem Grundriss (mit mehr Abstand für Maßlinien)
          const textX = polyMinX;
          const textY = polyMaxY + 40; // 40px unter dem Grundriss (Platz für Maßlinien)
          
          svgElements += `<rect x="${textX}" y="${textY}" width="${textWidth}" height="${textHeight}" fill="#e3f2fd" stroke="#1976d2" stroke-width="1" rx="4" ry="4"/>`;
          svgElements += `<text x="${textX + 8}" y="${textY + 14}" fill="#1976d2" font-size="11" font-weight="bold">${totalText}</text>`;
        }
      }
    });
    
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
      };

      console.log('Saving sketch with', elements.length, 'elements');
      console.log('Canvas dimensions:', width, 'x', (height - 120));
      console.log('Saving totalLfmBoxPositions:', totalLfmBoxPositions);
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
        {/* PDF-Größe Button */}
        <TouchableOpacity 
          onPress={() => {
            const sizes = ['small', 'medium', 'large', 'full'];
            const labels = ['Klein (3/Zeile)', 'Mittel (2/Zeile)', 'Groß (1/Zeile)', 'Voll'];
            const currentIndex = sizes.indexOf(pdfSize);
            const nextIndex = (currentIndex + 1) % sizes.length;
            setPdfSize(sizes[nextIndex]);
            showAlert('PDF-Größe', labels[nextIndex]);
          }} 
          style={styles.headerButton}
        >
          <Ionicons 
            name={pdfSize === 'small' ? 'grid-outline' : pdfSize === 'medium' ? 'apps-outline' : pdfSize === 'large' ? 'square-outline' : 'expand-outline'} 
            size={22} 
            color="#fff" 
          />
        </TouchableOpacity>
        <TouchableOpacity onPress={saveSketch} style={styles.headerButton} disabled={loading}>
          <Ionicons name="checkmark" size={24} color={loading ? '#888' : '#fff'} />
        </TouchableOpacity>
      </View>

      {/* Compact toolbar - Single row with icons only */}
      <View style={styles.toolbar}>
        {/* Undo/Redo */}
        <TouchableOpacity
          style={[styles.toolButton, !canUndo && styles.toolButtonDisabled]}
          onPress={undo}
          disabled={!canUndo}
        >
          <Ionicons name="arrow-undo" size={18} color={canUndo ? '#1976d2' : '#ccc'} />
        </TouchableOpacity>
        
        <TouchableOpacity
          style={[styles.toolButton, !canRedo && styles.toolButtonDisabled]}
          onPress={redo}
          disabled={!canRedo}
        >
          <Ionicons name="arrow-redo" size={18} color={canRedo ? '#1976d2' : '#ccc'} />
        </TouchableOpacity>

        <View style={styles.separator} />

        {/* Drawing tools */}
        <TouchableOpacity
          style={[styles.toolButton, drawMode === 'select' && styles.toolButtonActive]}
          onPress={() => setDrawMode('select')}
        >
          <Ionicons name="hand-left" size={18} color={drawMode === 'select' ? '#fff' : '#333'} />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.toolButton, drawMode === 'pen' && styles.toolButtonActive]}
          onPress={() => setDrawMode('pen')}
        >
          <Ionicons name="create" size={18} color={drawMode === 'pen' ? '#fff' : '#333'} />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.toolButton, drawMode === 'line' && styles.toolButtonActive]}
          onPress={() => setDrawMode('line')}
        >
          <Ionicons name="remove" size={18} color={drawMode === 'line' ? '#fff' : '#333'} />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.toolButton, drawMode === 'circle' && styles.toolButtonActive]}
          onPress={() => setDrawMode('circle')}
        >
          <Ionicons name="ellipse-outline" size={18} color={drawMode === 'circle' ? '#fff' : '#333'} />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.toolButton, drawMode === 'rect' && styles.toolButtonActive]}
          onPress={() => setDrawMode('rect')}
        >
          <Ionicons name="square-outline" size={18} color={drawMode === 'rect' ? '#fff' : '#333'} />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.toolButton, styles.toolButtonWide, drawMode === 'arrow' && styles.toolButtonActive]}
          onPress={() => setDrawMode('arrow')}
        >
          {/* Benutzerdefiniertes Maßlinie-Icon: Linie mit zwei Pfeilen und M in der Mitte */}
          <Svg width={56} height={28} viewBox="0 0 56 28">
            {/* Linker Pfeil - größer */}
            <Polygon 
              points="2,14 12,6 12,22" 
              fill={drawMode === 'arrow' ? '#fff' : '#333'} 
            />
            {/* Rechter Pfeil - größer */}
            <Polygon 
              points="54,14 44,6 44,22" 
              fill={drawMode === 'arrow' ? '#fff' : '#333'} 
            />
            {/* Linie - dicker */}
            <Line 
              x1="12" y1="14" x2="44" y2="14" 
              stroke={drawMode === 'arrow' ? '#fff' : '#333'} 
              strokeWidth={3} 
            />
            {/* Box mit M - größer */}
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

        <TouchableOpacity
          style={[styles.toolButton, drawMode === 'pointer' && styles.toolButtonActive]}
          onPress={() => setDrawMode('pointer')}
        >
          <Ionicons name="arrow-forward" size={22} color={drawMode === 'pointer' ? '#fff' : '#e91e63'} />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.toolButton, drawMode === 'text' && styles.toolButtonActive]}
          onPress={() => setDrawMode('text')}
        >
          <Ionicons name="text" size={18} color={drawMode === 'text' ? '#fff' : '#333'} />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.toolButton, drawMode === 'polyline' && styles.toolButtonActive]}
          onPress={() => {
            setDrawMode('polyline');
            setPolylinePoints([]);
          }}
        >
          <Ionicons name="git-network-outline" size={18} color={drawMode === 'polyline' ? '#fff' : '#333'} />
        </TouchableOpacity>

        <TouchableOpacity style={styles.toolButton} onPress={insertImage}>
          <Ionicons name="image" size={18} color="#333" />
        </TouchableOpacity>

        <TouchableOpacity style={styles.toolButton} onPress={takePhotoAndInsert}>
          <Ionicons name="camera" size={18} color="#4caf50" />
        </TouchableOpacity>

        {/* Foto-Bearbeitungsmodus Toggle */}
        <TouchableOpacity 
          style={[styles.toolButton, photoEditMode && styles.photoEditButtonActive]} 
          onPress={() => {
            setPhotoEditMode(!photoEditMode);
            setSelectedElementId(null);
            if (!photoEditMode) {
              setDrawMode('select');
            }
          }}
        >
          <Ionicons name="image-outline" size={18} color={photoEditMode ? '#fff' : '#FF9800'} />
        </TouchableOpacity>

        <View style={styles.separator} />

        {/* Color picker */}
        <TouchableOpacity style={styles.toolButton} onPress={() => setShowColorPicker(!showColorPicker)}>
          <View style={[styles.colorPreview, { backgroundColor: drawColor }]} />
        </TouchableOpacity>

        {/* Stroke width - inline */}
        {strokeWidths.map(w => (
          <TouchableOpacity
            key={w}
            style={[styles.strokeWidthButton, strokeWidth === w && styles.strokeWidthButtonActive]}
            onPress={() => setStrokeWidth(w)}
          >
            <View style={[styles.strokeWidthDot, { width: w * 1.5, height: w * 1.5 }]} />
          </TouchableOpacity>
        ))}

        <View style={styles.separator} />

        {/* Edit Button - for text, arrows and pointers */}
        <TouchableOpacity
          style={[styles.toolButton, !selectedElementId && styles.toolButtonDisabled]}
          onPress={() => {
            if (selectedElementId) {
              const selectedEl = elements.find(el => el.id === selectedElementId);
              if (selectedEl?.type === 'text') {
                setTextInput(selectedEl.data.text || '');
                setEditFontSize(selectedEl.fontSize || 20);
                setEditFontWeight(selectedEl.fontWeight || 'bold');
                setEditFontStyle(selectedEl.fontStyle || 'normal');
                setDrawColor(selectedEl.color);
                setShowEditTextModal(true);
              } else if (selectedEl?.type === 'arrow') {
                setArrowText(selectedEl.data.text || '');
                setArrowHeads(selectedEl.data.heads || 'double');
                setEditArrowFontSize(selectedEl.data.fontSize || 14);
                setEditStrokeWidth(selectedEl.strokeWidth || 3);
                setDrawColor(selectedEl.color);
                setShowEditArrowModal(true);
              } else if (selectedEl?.type === 'pointer') {
                // Memo-Pfeil bearbeiten
                setPointerText(selectedEl.data.text || '');
                setEditPointerFontSize(selectedEl.data.fontSize || 16);
                setEditPointerStrokeWidth(selectedEl.strokeWidth || 6);
                setDrawColor(selectedEl.color);
                setShowEditPointerModal(true);
              }
            }
          }}
          disabled={!selectedElementId || !['text', 'arrow', 'pointer'].includes(elements.find(el => el.id === selectedElementId)?.type || '')}
        >
          <Ionicons 
            name="create" 
            size={18} 
            color={selectedElementId && ['text', 'arrow', 'pointer'].includes(elements.find(el => el.id === selectedElementId)?.type || '') ? '#1976d2' : '#ccc'} 
          />
        </TouchableOpacity>

        {/* Delete */}
        <TouchableOpacity
          style={[styles.toolButton, !selectedElementId && styles.toolButtonDisabled]}
          onPress={() => {
            if (selectedElementId) {
              setShowDeleteConfirm(true);
            }
          }}
          disabled={!selectedElementId}
        >
          <Ionicons 
            name="trash" 
            size={18} 
            color={selectedElementId ? '#f44336' : '#ccc'} 
          />
        </TouchableOpacity>

        {/* Bring to front */}
        <TouchableOpacity
          style={[styles.toolButton, !selectedElementId && styles.toolButtonDisabled]}
          onPress={bringToFront}
          disabled={!selectedElementId}
        >
          <Ionicons name="arrow-up" size={18} color={selectedElementId ? '#4caf50' : '#ccc'} />
        </TouchableOpacity>

        {/* Send to back */}
        <TouchableOpacity
          style={[styles.toolButton, !selectedElementId && styles.toolButtonDisabled]}
          onPress={sendToBack}
          disabled={!selectedElementId}
        >
          <Ionicons name="arrow-down" size={18} color={selectedElementId ? '#ff9800' : '#ccc'} />
        </TouchableOpacity>

        <View style={styles.separator} />

        {/* Gitter Toggle und Einstellungen */}
        <TouchableOpacity 
          style={[styles.toolButton, showGrid && !backgroundImage && styles.gridButtonActive]} 
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
            size={18} 
            color={backgroundImage ? '#ccc' : (showGrid ? '#fff' : '#333')} 
          />
        </TouchableOpacity>

        <TouchableOpacity style={styles.toolButton} onPress={() => {
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

      {/* Canvas */}
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
              {/* Punkte anzeigen */}
              {polylinePoints.map((pt, idx) => (
                <Circle 
                  key={`current-polyline-pt-${idx}`}
                  cx={pt.x} 
                  cy={pt.y} 
                  r={8} 
                  fill={idx === 0 ? '#4caf50' : '#2196f3'} 
                  stroke="#fff" 
                  strokeWidth={2} 
                />
              ))}
              {/* Schließen-Indikator beim ersten Punkt */}
              {polylinePoints.length >= 3 && (
                <Circle 
                  cx={polylinePoints[0].x} 
                  cy={polylinePoints[0].y} 
                  r={20} 
                  fill="rgba(76, 175, 80, 0.3)" 
                  stroke="#4caf50" 
                  strokeWidth={2}
                  strokeDasharray="3,3"
                />
              )}
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
        </View>

      </View>

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
              <Ionicons name="close" size={18} color="#666" />
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Summenboxen für jedes Polyline-Element mit Maßen - jeder Grundriss hat sein eigenes Gesamt-Feld */}
      {getPolylineElementsWithMeasurements().map((element, index) => {
        const totalForElement = calculateTotalLfmForElement(element.id);
        if (totalForElement <= 0) return null;
        
        // Hole gespeicherte Position oder verwende Standard
        const savedPos = totalLfmBoxPositions[element.id] || { x: 0, y: 0 };
        
        return (
          <DraggableTotalBox
            key={`total-box-${element.id}`}
            elementId={element.id}
            totalValue={totalForElement}
            initialPosition={savedPos}
            baseTop={130 + (index * 50)}
            isCompact={width < 500}
            onPositionChange={(x, y) => updateTotalLfmBoxPosition(element.id, x, y)}
          />
        );
      })}

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
                <Text style={styles.modalLabel}>Linienstärke: {editStrokeWidth}px</Text>
                <View style={styles.sliderRow}>
                  <TouchableOpacity 
                    style={styles.sliderButton} 
                    onPress={() => setEditStrokeWidth(Math.max(1, editStrokeWidth - 1))}
                  >
                    <Text style={styles.sliderButtonText}>-</Text>
                  </TouchableOpacity>
                  <View style={styles.sliderTrack}>
                    <View style={[styles.sliderFill, { width: `${(editStrokeWidth / 10) * 100}%` }]} />
                  </View>
                  <TouchableOpacity 
                    style={styles.sliderButton} 
                    onPress={() => setEditStrokeWidth(Math.min(10, editStrokeWidth + 1))}
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
                    onPress={() => setEditArrowFontSize(Math.max(8, editArrowFontSize - 2))}
                  >
                    <Text style={styles.sliderButtonText}>-</Text>
                  </TouchableOpacity>
                  <View style={styles.sliderTrack}>
                    <View style={[styles.sliderFill, { width: `${((editArrowFontSize - 8) / 32) * 100}%` }]} />
                  </View>
                  <TouchableOpacity 
                    style={styles.sliderButton} 
                    onPress={() => setEditArrowFontSize(Math.min(40, editArrowFontSize + 2))}
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
                            strokeWidth: editStrokeWidth,
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
                    onPress={() => setEditPointerStrokeWidth(Math.max(2, editPointerStrokeWidth - 2))}
                  >
                    <Text style={styles.sliderButtonText}>-</Text>
                  </TouchableOpacity>
                  <View style={styles.sliderTrack}>
                    <View style={[styles.sliderFill, { width: `${((editPointerStrokeWidth - 2) / 18) * 100}%` }]} />
                  </View>
                  <TouchableOpacity 
                    style={styles.sliderButton} 
                    onPress={() => setEditPointerStrokeWidth(Math.min(20, editPointerStrokeWidth + 2))}
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
                    onPress={() => setEditPointerFontSize(Math.max(10, editPointerFontSize - 2))}
                  >
                    <Text style={styles.sliderButtonText}>-</Text>
                  </TouchableOpacity>
                  <View style={styles.sliderTrack}>
                    <View style={[styles.sliderFill, { width: `${((editPointerFontSize - 10) / 30) * 100}%` }]} />
                  </View>
                  <TouchableOpacity 
                    style={styles.sliderButton} 
                    onPress={() => setEditPointerFontSize(Math.min(40, editPointerFontSize + 2))}
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
  titleInput: {
    flex: 1,
    marginHorizontal: 16,
    padding: 8,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 8,
    color: '#fff',
    fontSize: 16,
  },
  toolbar: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
    paddingVertical: 2,
    paddingHorizontal: 2,
    flexWrap: 'wrap',
    alignItems: 'center',
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
    right: 16,
    zIndex: 100,
  },
  measurementActionContent: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 8,
    gap: 6,
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
    backgroundColor: '#f5f5f5',
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
});

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Alert,
  TextInput,
  Modal,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
  ScrollView,
} from 'react-native';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Line, Circle, G, Text as SvgText, Rect, Path, Polygon } from 'react-native-svg';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTranslation } from 'react-i18next';

const IMAGEMETER_STORAGE_KEY = 'aufmassprofi_imagemeter_photos';
const { width: SCREEN_WIDTH } = Dimensions.get('window');

type MeasurementType = 'line' | 'reference';
type DrawModeType = 'none' | 'line' | 'reference' | 'area' | 'angle' | 'component';

interface Point {
  x: number;
  y: number;
}

interface Measurement {
  id: string;
  type: MeasurementType;
  startPoint: Point;
  endPoint: Point;
  pixelLength: number;
  realLength?: number;
  unit: 'cm' | 'm';
  label?: string;
}

interface AreaMeasurement {
  id: string;
  points: Point[];
  pixelArea: number;
  realArea?: number;
  label?: string;
  color: string;
}

interface AngleMeasurement {
  id: string;
  p1: Point;
  vertex: Point;
  p2: Point;
  angle: number;
  color: string;
}

interface BuildingComponent {
  id: string;
  type: 'window' | 'door' | 'heater' | 'socket' | 'light' | 'water';
  position: Point;
  label?: string;
}

const COMPONENT_TYPES = [
  { type: 'window' as const, icon: 'apps-outline' as const, label: 'Fenster', color: '#2196F3', emoji: '⬜' },
  { type: 'door' as const, icon: 'enter-outline' as const, label: 'Tür', color: '#795548', emoji: '🚪' },
  { type: 'heater' as const, icon: 'flame-outline' as const, label: 'Heizung', color: '#FF5722', emoji: '🔥' },
  { type: 'socket' as const, icon: 'flash-outline' as const, label: 'Steckdose', color: '#FFC107', emoji: '⚡' },
  { type: 'light' as const, icon: 'bulb-outline' as const, label: 'Licht', color: '#FFEB3B', emoji: '💡' },
  { type: 'water' as const, icon: 'water-outline' as const, label: 'Wasser', color: '#00BCD4', emoji: '💧' },
];

interface ImageMeterPhoto {
  id: string;
  imageUri: string;
  name: string;
  projectId?: string;
  measurements: Measurement[];
  areaMeasurements?: AreaMeasurement[];
  angleMeasurements?: AngleMeasurement[];
  buildingComponents?: BuildingComponent[];
  referenceScale?: number;
  createdAt: string;
  updatedAt: string;
}

// ============ HELPERS ============
const calcPixelDistance = (a: Point, b: Point) => Math.sqrt(Math.pow(b.x - a.x, 2) + Math.pow(b.y - a.y, 2));

const calcPolygonArea = (pts: Point[]): number => {
  let area = 0;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    area += pts[i].x * pts[j].y - pts[j].x * pts[i].y;
  }
  return Math.abs(area / 2);
};

const calcAngle = (p1: Point, vertex: Point, p2: Point): number => {
  const v1 = { x: p1.x - vertex.x, y: p1.y - vertex.y };
  const v2 = { x: p2.x - vertex.x, y: p2.y - vertex.y };
  const dot = v1.x * v2.x + v1.y * v2.y;
  const cross = v1.x * v2.y - v1.y * v2.x;
  return Math.round(Math.atan2(Math.abs(cross), dot) * (180 / Math.PI) * 10) / 10;
};

const formatNum = (n: number) => n.toFixed(2).replace('.', ',');

export default function ImageMeterMeasureScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useLocalSearchParams();
  const photoId = params.id as string;

  const [photo, setPhoto] = useState<ImageMeterPhoto | null>(null);
  const [loading, setLoading] = useState(true);
  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const [referenceScale, setReferenceScale] = useState<number | null>(null);
  
  // NEW: Area, Angle, Component state
  const [areaMeasurements, setAreaMeasurements] = useState<AreaMeasurement[]>([]);
  const [angleMeasurements, setAngleMeasurements] = useState<AngleMeasurement[]>([]);
  const [buildingComponents, setBuildingComponents] = useState<BuildingComponent[]>([]);

  // Drawing state
  const [drawMode, setDrawMode] = useState<DrawModeType>('none');
  const [currentLine, setCurrentLine] = useState<{ start: Point; end: Point } | null>(null);
  const [selectedMeasurement, setSelectedMeasurement] = useState<string | null>(null);
  
  // NEW: Points for multi-point tools (area, angle)
  const [tapPoints, setTapPoints] = useState<Point[]>([]);
  const [magnifierPos, setMagnifierPos] = useState<Point | null>(null);
  
  // Image dimensions
  const [imageDimensions, setImageDimensions] = useState({ width: 0, height: 0 });
  const [containerDimensions, setContainerDimensions] = useState({ width: SCREEN_WIDTH, height: 400 });
  
  // Modal state
  const [showLengthModal, setShowLengthModal] = useState(false);
  const [pendingMeasurement, setPendingMeasurement] = useState<{ start: Point; end: Point; type: MeasurementType } | null>(null);
  const [lengthInput, setLengthInput] = useState('');
  const [unitInput, setUnitInput] = useState<'cm' | 'm'>('cm');
  const [labelInput, setLabelInput] = useState('');
  const [hasChanges, setHasChanges] = useState(false);
  
  // NEW: Tool picker & component picker
  const [showToolPicker, setShowToolPicker] = useState(false);
  const [showComponentPicker, setShowComponentPicker] = useState(false);
  const [pendingComponentPos, setPendingComponentPos] = useState<Point | null>(null);

  // Load photo data
  useEffect(() => { loadPhoto(); }, [photoId]);

  useFocusEffect(
    useCallback(() => {
      return () => { if (hasChanges) autoSave(); };
    }, [hasChanges, measurements, areaMeasurements, angleMeasurements, buildingComponents, referenceScale])
  );

  const loadPhoto = async () => {
    try {
      const data = await AsyncStorage.getItem(IMAGEMETER_STORAGE_KEY);
      if (data) {
        const photos: ImageMeterPhoto[] = JSON.parse(data);
        const found = photos.find(p => p.id === photoId);
        if (found) {
          setPhoto(found);
          setMeasurements(found.measurements || []);
          setReferenceScale(found.referenceScale || null);
          setAreaMeasurements(found.areaMeasurements || []);
          setAngleMeasurements(found.angleMeasurements || []);
          setBuildingComponents(found.buildingComponents || []);
          Image.getSize(found.imageUri,
            (width, height) => setImageDimensions({ width, height }),
            (error) => console.error('Error getting image size:', error)
          );
        }
      }
    } catch (error) {
      console.error('Error loading photo:', error);
      Alert.alert(t('common.error'), 'Foto konnte nicht geladen werden');
    } finally {
      setLoading(false);
    }
  };

  const buildSavePayload = () => ({
    measurements,
    referenceScale,
    areaMeasurements,
    angleMeasurements,
    buildingComponents,
    updatedAt: new Date().toISOString(),
  });

  const autoSave = async () => {
    if (!photo) return;
    try {
      const data = await AsyncStorage.getItem(IMAGEMETER_STORAGE_KEY);
      if (data) {
        const photos: ImageMeterPhoto[] = JSON.parse(data);
        const index = photos.findIndex(p => p.id === photoId);
        if (index !== -1) {
          photos[index] = { ...photos[index], ...buildSavePayload() };
          await AsyncStorage.setItem(IMAGEMETER_STORAGE_KEY, JSON.stringify(photos));
        }
      }
    } catch (error) { console.error('Error auto-saving:', error); }
  };

  const saveChanges = async () => {
    if (!photo) return;
    try {
      const data = await AsyncStorage.getItem(IMAGEMETER_STORAGE_KEY);
      if (data) {
        const photos: ImageMeterPhoto[] = JSON.parse(data);
        const index = photos.findIndex(p => p.id === photoId);
        if (index !== -1) {
          photos[index] = { ...photos[index], ...buildSavePayload() };
          await AsyncStorage.setItem(IMAGEMETER_STORAGE_KEY, JSON.stringify(photos));
          setHasChanges(false);
          Alert.alert(t('common.success'), 'Messungen wurden gespeichert');
        }
      }
    } catch (error) {
      console.error('Error saving:', error);
      Alert.alert(t('common.error'), 'Speichern fehlgeschlagen');
    }
  };

  // ---- Coordinate Helpers ----
  const getDisplayScale = () => {
    if (imageDimensions.width === 0 || containerDimensions.width === 0) return 1;
    return Math.min(containerDimensions.width / imageDimensions.width, containerDimensions.height / imageDimensions.height);
  };

  const touchToImageCoords = (touchX: number, touchY: number): Point => {
    const scale = getDisplayScale();
    const displayWidth = imageDimensions.width * scale;
    const displayHeight = imageDimensions.height * scale;
    const offsetX = (containerDimensions.width - displayWidth) / 2;
    const offsetY = (containerDimensions.height - displayHeight) / 2;
    return { x: (touchX - offsetX) / scale, y: (touchY - offsetY) / scale };
  };

  const imageToDisplayCoords = (point: Point): Point => {
    const scale = getDisplayScale();
    const displayWidth = imageDimensions.width * scale;
    const displayHeight = imageDimensions.height * scale;
    const offsetX = (containerDimensions.width - displayWidth) / 2;
    const offsetY = (containerDimensions.height - displayHeight) / 2;
    return { x: point.x * scale + offsetX, y: point.y * scale + offsetY };
  };

  // ---- Touch Handling (existing line/reference) ----
  const handleTouchStart = (event: any) => {
    if (drawMode === 'none') return;
    // For area/angle/component: use tap
    if (drawMode === 'area' || drawMode === 'angle' || drawMode === 'component') return;
    const touch = event.nativeEvent;
    const point = touchToImageCoords(touch.locationX, touch.locationY);
    setCurrentLine({ start: point, end: point });
    setMagnifierPos(point);
  };

  const handleTouchMove = (event: any) => {
    if (drawMode === 'none' || !currentLine) return;
    if (drawMode === 'area' || drawMode === 'angle' || drawMode === 'component') return;
    const touch = event.nativeEvent;
    const point = touchToImageCoords(touch.locationX, touch.locationY);
    setCurrentLine(prev => prev ? { ...prev, end: point } : null);
    setMagnifierPos(point);
  };

  const handleTouchEnd = () => {
    setMagnifierPos(null);
    if (drawMode === 'none' || !currentLine) return;
    if (drawMode === 'area' || drawMode === 'angle' || drawMode === 'component') return;

    const pixelLength = calcPixelDistance(currentLine.start, currentLine.end);
    if (pixelLength < 20) { setCurrentLine(null); return; }
    
    if (drawMode === 'line' && referenceScale) {
      const calculatedLength = pixelLength / referenceScale;
      const newMeasurement: Measurement = {
        id: `m_${Date.now()}`, type: 'line',
        startPoint: currentLine.start, endPoint: currentLine.end, pixelLength,
        realLength: calculatedLength, unit: calculatedLength >= 100 ? 'm' : 'cm',
      };
      setMeasurements(prev => [...prev, newMeasurement]);
      setHasChanges(true); setCurrentLine(null); setDrawMode('none');
      return;
    }
    
    setPendingMeasurement({ start: currentLine.start, end: currentLine.end, type: drawMode as MeasurementType });
    setShowLengthModal(true);
    setCurrentLine(null);
  };

  // ---- NEW: Tap handler for area/angle/component ----
  const handleCanvasTap = (event: any) => {
    const touch = event.nativeEvent;
    const imgPoint = touchToImageCoords(touch.locationX, touch.locationY);
    
    if (drawMode === 'none') {
      // Check selection on existing measurements
      for (const m of measurements) {
        const midX = (m.startPoint.x + m.endPoint.x) / 2;
        const midY = (m.startPoint.y + m.endPoint.y) / 2;
        if (calcPixelDistance(imgPoint, { x: midX, y: midY }) < 50) {
          setSelectedMeasurement(m.id === selectedMeasurement ? null : m.id);
          return;
        }
      }
      for (const a of areaMeasurements) {
        const cx = a.points.reduce((s, p) => s + p.x, 0) / a.points.length;
        const cy = a.points.reduce((s, p) => s + p.y, 0) / a.points.length;
        if (calcPixelDistance(imgPoint, { x: cx, y: cy }) < 60) {
          setSelectedMeasurement(a.id === selectedMeasurement ? null : a.id);
          return;
        }
      }
      for (const ang of angleMeasurements) {
        if (calcPixelDistance(imgPoint, ang.vertex) < 50) {
          setSelectedMeasurement(ang.id === selectedMeasurement ? null : ang.id);
          return;
        }
      }
      for (const comp of buildingComponents) {
        if (calcPixelDistance(imgPoint, comp.position) < 50) {
          setSelectedMeasurement(comp.id === selectedMeasurement ? null : comp.id);
          return;
        }
      }
      setSelectedMeasurement(null);
      return;
    }

    if (drawMode === 'area') {
      setTapPoints(prev => [...prev, imgPoint]);
    } else if (drawMode === 'angle') {
      const pts = [...tapPoints, imgPoint];
      setTapPoints(pts);
      if (pts.length === 3) {
        const angle = calcAngle(pts[0], pts[1], pts[2]);
        const newAngle: AngleMeasurement = {
          id: `ang_${Date.now()}`, p1: pts[0], vertex: pts[1], p2: pts[2], angle, color: '#E91E63',
        };
        setAngleMeasurements(prev => [...prev, newAngle]);
        setTapPoints([]); setHasChanges(true);
      }
    } else if (drawMode === 'component') {
      setPendingComponentPos(imgPoint);
      setShowComponentPicker(true);
    }
  };

  // ---- Close area polygon ----
  const closeAreaPolygon = () => {
    if (tapPoints.length < 3) { Alert.alert('Hinweis', 'Mindestens 3 Punkte erforderlich.'); return; }
    const pixArea = calcPolygonArea(tapPoints);
    let realArea: number | undefined;
    let label: string;
    if (referenceScale) {
      const pixPerCm = referenceScale;
      realArea = pixArea / (pixPerCm * pixPerCm);
      if (realArea >= 10000) {
        label = `${formatNum(realArea / 10000)} m²`;
      } else {
        label = `${formatNum(realArea)} cm²`;
      }
    } else {
      label = `${Math.round(pixArea)} px²`;
    }
    const newArea: AreaMeasurement = {
      id: `area_${Date.now()}`, points: [...tapPoints], pixelArea: pixArea,
      realArea, label, color: '#2196F3',
    };
    setAreaMeasurements(prev => [...prev, newArea]);
    setTapPoints([]); setHasChanges(true);
  };

  // ---- Add measurement (modal confirm) ----
  const addMeasurement = () => {
    if (!pendingMeasurement) return;
    const length = parseFloat(lengthInput.replace(',', '.'));
    if (isNaN(length) || length <= 0) { Alert.alert(t('common.error'), 'Bitte geben Sie eine gültige Länge ein'); return; }
    
    const pixelLength = calcPixelDistance(pendingMeasurement.start, pendingMeasurement.end);
    const realLengthInCm = unitInput === 'm' ? length * 100 : length;
    
    if (pendingMeasurement.type === 'reference') {
      const newScale = pixelLength / realLengthInCm;
      setReferenceScale(newScale);
      setMeasurements(prev => prev.map(m => ({ ...m, realLength: m.pixelLength / newScale })));
      // Recalculate area measurements
      setAreaMeasurements(prev => prev.map(a => {
        const realA = a.pixelArea / (newScale * newScale);
        return { ...a, realArea: realA, label: realA >= 10000 ? `${formatNum(realA / 10000)} m²` : `${formatNum(realA)} cm²` };
      }));
    }
    
    const newMeasurement: Measurement = {
      id: `m_${Date.now()}`, type: pendingMeasurement.type,
      startPoint: pendingMeasurement.start, endPoint: pendingMeasurement.end,
      pixelLength, realLength: realLengthInCm, unit: unitInput, label: labelInput.trim() || undefined,
    };
    setMeasurements(prev => [...prev, newMeasurement]);
    setHasChanges(true);
    setShowLengthModal(false); setPendingMeasurement(null); setLengthInput(''); setLabelInput(''); setDrawMode('none');
  };

  // ---- Add component ----
  const addComponent = (type: typeof COMPONENT_TYPES[0]['type']) => {
    if (!pendingComponentPos) return;
    const comp: BuildingComponent = { id: `comp_${Date.now()}`, type, position: pendingComponentPos };
    setBuildingComponents(prev => [...prev, comp]);
    setHasChanges(true); setShowComponentPicker(false); setPendingComponentPos(null);
  };

  // ---- Delete any measurement ----
  const deleteSelected = () => {
    if (!selectedMeasurement) return;
    const isRef = measurements.find(m => m.id === selectedMeasurement && m.type === 'reference');
    const title = isRef ? 'Referenz löschen?' : 'Messung löschen?';
    const msg = isRef ? 'Die Referenz wird gelöscht. Automatische Berechnungen sind dann nicht mehr möglich.' : 'Diese Messung wird gelöscht.';
    Alert.alert(title, msg, [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.delete'), style: 'destructive', onPress: () => {
        setMeasurements(prev => prev.filter(m => m.id !== selectedMeasurement));
        setAreaMeasurements(prev => prev.filter(a => a.id !== selectedMeasurement));
        setAngleMeasurements(prev => prev.filter(a => a.id !== selectedMeasurement));
        setBuildingComponents(prev => prev.filter(c => c.id !== selectedMeasurement));
        if (isRef) setReferenceScale(null);
        setSelectedMeasurement(null); setHasChanges(true);
      }},
    ]);
  };

  // ---- Undo last point / measurement ----
  const undoLast = () => {
    if (tapPoints.length > 0) { setTapPoints(prev => prev.slice(0, -1)); return; }
    if (drawMode === 'area' && areaMeasurements.length > 0) { setAreaMeasurements(prev => prev.slice(0, -1)); setHasChanges(true); return; }
    if (drawMode === 'angle' && angleMeasurements.length > 0) { setAngleMeasurements(prev => prev.slice(0, -1)); setHasChanges(true); return; }
    if (drawMode === 'component' && buildingComponents.length > 0) { setBuildingComponents(prev => prev.slice(0, -1)); setHasChanges(true); return; }
    if (measurements.length > 0) { setMeasurements(prev => prev.slice(0, -1)); setHasChanges(true); }
  };

  // ---- Format length ----
  const formatLength = (m: Measurement): string => {
    if (m.type === 'reference') return `${m.realLength?.toFixed(1)} ${m.unit} (Referenz)`;
    if (referenceScale && m.pixelLength) {
      const calc = m.pixelLength / referenceScale;
      return calc >= 100 ? `${(calc / 100).toFixed(2)} m` : `${calc.toFixed(1)} cm`;
    }
    if (m.realLength) return m.unit === 'm' ? `${(m.realLength / 100).toFixed(2)} m` : `${m.realLength.toFixed(1)} cm`;
    return '?';
  };

  // ---- Switch tool ----
  const activateTool = (mode: DrawModeType) => {
    setDrawMode(mode); setTapPoints([]); setCurrentLine(null); setSelectedMeasurement(null); setShowToolPicker(false);
  };

  // ============ RENDER HELPERS ============
  const renderMeasurementLine = (m: Measurement) => {
    const start = imageToDisplayCoords(m.startPoint);
    const end = imageToDisplayCoords(m.endPoint);
    const isSelected = selectedMeasurement === m.id;
    const isRef = m.type === 'reference';
    const midX = (start.x + end.x) / 2;
    const midY = (start.y + end.y) / 2;
    const color = isRef ? '#4CAF50' : (isSelected ? '#FF9800' : '#f44336');
    const sw = isSelected ? 4 : 3;
    const label = m.label || formatLength(m);
    const labelW = Math.max(70, label.length * 7 + 16);
    return (
      <G key={m.id}>
        <Line x1={start.x} y1={start.y} x2={end.x} y2={end.y} stroke={color} strokeWidth={sw} strokeLinecap="round" />
        <Circle cx={start.x} cy={start.y} r={6} fill={color} />
        <Circle cx={end.x} cy={end.y} r={6} fill={color} />
        <Rect x={midX - labelW / 2} y={midY - 12} width={labelW} height={24} rx={4} fill="rgba(255,255,255,0.95)" stroke={color} strokeWidth={1} />
        <SvgText x={midX} y={midY + 5} fill={color} fontSize={12} fontWeight="bold" textAnchor="middle">{label}</SvgText>
        {isRef && <Circle cx={midX + labelW / 2 - 8} cy={midY - 6} r={6} fill="#4CAF50" />}
      </G>
    );
  };

  const renderAreaMeasurement = (a: AreaMeasurement) => {
    const dispPts = a.points.map(p => imageToDisplayCoords(p));
    const ptsStr = dispPts.map(p => `${p.x},${p.y}`).join(' ');
    const cx = dispPts.reduce((s, p) => s + p.x, 0) / dispPts.length;
    const cy = dispPts.reduce((s, p) => s + p.y, 0) / dispPts.length;
    const isSelected = selectedMeasurement === a.id;
    const color = isSelected ? '#FF9800' : a.color;
    const labelW = Math.max(70, a.label.length * 7 + 16);
    return (
      <G key={a.id}>
        <Polygon points={ptsStr} fill={`${color}30`} stroke={color} strokeWidth={isSelected ? 3 : 2} strokeDasharray="6,3" />
        {dispPts.map((p, i) => <Circle key={i} cx={p.x} cy={p.y} r={5} fill={color} />)}
        <Rect x={cx - labelW / 2} y={cy - 12} width={labelW} height={24} rx={4} fill="rgba(255,255,255,0.95)" stroke={color} strokeWidth={1} />
        <SvgText x={cx} y={cy + 5} fill={color} fontSize={12} fontWeight="bold" textAnchor="middle">{a.label}</SvgText>
      </G>
    );
  };

  const renderAngleMeasurement = (ang: AngleMeasurement) => {
    const dp1 = imageToDisplayCoords(ang.p1);
    const dv = imageToDisplayCoords(ang.vertex);
    const dp2 = imageToDisplayCoords(ang.p2);
    const isSelected = selectedMeasurement === ang.id;
    const color = isSelected ? '#FF9800' : ang.color;
    const r = 25;
    const a1 = Math.atan2(dp1.y - dv.y, dp1.x - dv.x);
    const a2 = Math.atan2(dp2.y - dv.y, dp2.x - dv.x);
    const arcStart = { x: dv.x + r * Math.cos(a1), y: dv.y + r * Math.sin(a1) };
    const arcEnd = { x: dv.x + r * Math.cos(a2), y: dv.y + r * Math.sin(a2) };
    const sweep = ((a2 - a1 + 2 * Math.PI) % (2 * Math.PI)) > Math.PI ? 0 : 1;
    const midA = (a1 + a2) / 2;
    const labelR = r + 18;
    const lp = { x: dv.x + labelR * Math.cos(midA), y: dv.y + labelR * Math.sin(midA) };
    const label = `${ang.angle}°`;
    return (
      <G key={ang.id}>
        <Line x1={dv.x} y1={dv.y} x2={dp1.x} y2={dp1.y} stroke={color} strokeWidth={2} />
        <Line x1={dv.x} y1={dv.y} x2={dp2.x} y2={dp2.y} stroke={color} strokeWidth={2} />
        <Path d={`M ${arcStart.x} ${arcStart.y} A ${r} ${r} 0 ${sweep} 1 ${arcEnd.x} ${arcEnd.y}`} stroke={color} strokeWidth={2} fill="none" />
        <Circle cx={dp1.x} cy={dp1.y} r={5} fill={color} />
        <Circle cx={dv.x} cy={dv.y} r={6} fill={color} />
        <Circle cx={dp2.x} cy={dp2.y} r={5} fill={color} />
        <Rect x={lp.x - 20} y={lp.y - 10} width={40} height={20} rx={4} fill="rgba(255,255,255,0.95)" stroke={color} strokeWidth={1} />
        <SvgText x={lp.x} y={lp.y + 4} fill={color} fontSize={12} fontWeight="bold" textAnchor="middle">{label}</SvgText>
      </G>
    );
  };

  const renderComponent = (comp: BuildingComponent) => {
    const dp = imageToDisplayCoords(comp.position);
    const ct = COMPONENT_TYPES.find(c => c.type === comp.type);
    const isSelected = selectedMeasurement === comp.id;
    const color = isSelected ? '#FF9800' : (ct?.color || '#666');
    return (
      <G key={comp.id}>
        <Circle cx={dp.x} cy={dp.y} r={20} fill="rgba(255,255,255,0.9)" stroke={color} strokeWidth={isSelected ? 3 : 2} />
        <SvgText x={dp.x} y={dp.y + 5} fill={color} fontSize={18} textAnchor="middle">{ct?.emoji || '?'}</SvgText>
        <SvgText x={dp.x} y={dp.y + 32} fill={color} fontSize={10} fontWeight="bold" textAnchor="middle">{ct?.label || ''}</SvgText>
      </G>
    );
  };

  // Count all items
  const totalItems = measurements.length + areaMeasurements.length + angleMeasurements.length + buildingComponents.length;

  if (loading || !photo) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContainer}><Text>Lade...</Text></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{photo.name}</Text>
        <TouchableOpacity onPress={saveChanges} style={styles.saveHeaderButton}>
          <Ionicons name="checkmark" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Toolbar */}
      <View style={styles.toolbar}>
        <TouchableOpacity
          style={[styles.toolButton, drawMode === 'reference' && styles.toolButtonActive, !referenceScale && styles.toolButtonHighlight]}
          onPress={() => activateTool(drawMode === 'reference' ? 'none' : 'reference')}
        >
          <Ionicons name="resize" size={20} color={drawMode === 'reference' ? '#fff' : '#4CAF50'} />
          <Text style={[styles.toolButtonText, drawMode === 'reference' && styles.toolButtonTextActive, { color: drawMode === 'reference' ? '#fff' : '#4CAF50' }]}>Referenz</Text>
          {referenceScale && <View style={styles.checkBadge}><Ionicons name="checkmark" size={10} color="#fff" /></View>}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.toolButton, drawMode === 'line' && styles.toolButtonActive]}
          onPress={() => activateTool(drawMode === 'line' ? 'none' : 'line')}
        >
          <Ionicons name="analytics" size={20} color={drawMode === 'line' ? '#fff' : '#1976d2'} />
          <Text style={[styles.toolButtonText, drawMode === 'line' && styles.toolButtonTextActive]}>Messen</Text>
        </TouchableOpacity>

        {/* NEW: More Tools button */}
        <TouchableOpacity
          style={[styles.toolButton, (drawMode === 'area' || drawMode === 'angle' || drawMode === 'component') && styles.toolButtonActiveOrange]}
          onPress={() => setShowToolPicker(true)}
        >
          <Ionicons name="construct" size={20} color={(drawMode === 'area' || drawMode === 'angle' || drawMode === 'component') ? '#fff' : '#FF6D00'} />
          <Text style={[styles.toolButtonText, (drawMode === 'area' || drawMode === 'angle' || drawMode === 'component') && styles.toolButtonTextActive, { color: (drawMode === 'area' || drawMode === 'angle' || drawMode === 'component') ? '#fff' : '#FF6D00' }]}>Mehr</Text>
        </TouchableOpacity>

        {selectedMeasurement && (
          <TouchableOpacity style={[styles.toolButton, styles.deleteToolButton]} onPress={deleteSelected}>
            <Ionicons name="trash-outline" size={20} color="#f44336" />
            <Text style={[styles.toolButtonText, { color: '#f44336' }]}>Löschen</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Status Bar */}
      {drawMode !== 'none' && (
        <View style={[styles.statusBar, 
          drawMode === 'reference' ? styles.statusBarReference : 
          drawMode === 'area' ? styles.statusBarArea :
          drawMode === 'angle' ? styles.statusBarAngle :
          drawMode === 'component' ? styles.statusBarComponent :
          styles.statusBarLine
        ]}>
          <Ionicons name="finger-print" size={18} color={
            drawMode === 'reference' ? '#4CAF50' : 
            drawMode === 'area' ? '#2196F3' :
            drawMode === 'angle' ? '#E91E63' :
            drawMode === 'component' ? '#9C27B0' : '#1976d2'
          } />
          <Text style={[styles.statusText, { color: 
            drawMode === 'reference' ? '#4CAF50' : 
            drawMode === 'area' ? '#1565C0' :
            drawMode === 'angle' ? '#C2185B' :
            drawMode === 'component' ? '#7B1FA2' : '#1976d2'
          }]}>
            {drawMode === 'reference' ? t('imagemeter.dragLineReference') :
             drawMode === 'line' ? t('imagemeter.dragLineMeasure') :
             drawMode === 'area' ? `Fläche: Punkte tippen (${tapPoints.length} gesetzt)` :
             drawMode === 'angle' ? `Winkel: 3 Punkte tippen (${tapPoints.length}/3)` :
             'Bauteil: Tippe auf die Position'}
          </Text>
          {drawMode === 'area' && tapPoints.length >= 3 && (
            <TouchableOpacity style={styles.closeAreaButton} onPress={closeAreaPolygon}>
              <Ionicons name="checkmark-done" size={16} color="#fff" />
              <Text style={styles.closeAreaText}>Schließen</Text>
            </TouchableOpacity>
          )}
          {(drawMode === 'area' || drawMode === 'angle') && tapPoints.length > 0 && (
            <TouchableOpacity style={styles.undoPointButton} onPress={undoLast}>
              <Ionicons name="arrow-undo" size={16} color="#666" />
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Image Canvas */}
      <View style={styles.canvasContainer}
        onLayout={(e) => setContainerDimensions({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}
      >
        <Image source={{ uri: photo.imageUri }} style={styles.image} resizeMode="contain" />
        
        <View
          style={StyleSheet.absoluteFill}
          onStartShouldSetResponder={() => true}
          onMoveShouldSetResponder={() => drawMode === 'line' || drawMode === 'reference'}
          onResponderGrant={handleTouchStart}
          onResponderMove={handleTouchMove}
          onResponderRelease={handleTouchEnd}
          onTouchEnd={(e) => {
            // Only handle taps (not drags) for area/angle/component/selection
            if (drawMode === 'area' || drawMode === 'angle' || drawMode === 'component' || drawMode === 'none') {
              handleCanvasTap(e);
            }
          }}
        >
          <Svg style={StyleSheet.absoluteFill}>
            {/* Existing measurement lines */}
            {measurements.map(renderMeasurementLine)}
            
            {/* Area measurements */}
            {areaMeasurements.map(renderAreaMeasurement)}
            
            {/* Angle measurements */}
            {angleMeasurements.map(renderAngleMeasurement)}
            
            {/* Building components */}
            {buildingComponents.map(renderComponent)}
            
            {/* Current drawing line (for line/reference) */}
            {currentLine && (
              <G>
                <Line
                  x1={imageToDisplayCoords(currentLine.start).x} y1={imageToDisplayCoords(currentLine.start).y}
                  x2={imageToDisplayCoords(currentLine.end).x} y2={imageToDisplayCoords(currentLine.end).y}
                  stroke={drawMode === 'reference' ? '#4CAF50' : '#1976d2'} strokeWidth={3} strokeDasharray="5,5" />
                <Circle cx={imageToDisplayCoords(currentLine.start).x} cy={imageToDisplayCoords(currentLine.start).y} r={8} fill={drawMode === 'reference' ? '#4CAF50' : '#1976d2'} />
                <Circle cx={imageToDisplayCoords(currentLine.end).x} cy={imageToDisplayCoords(currentLine.end).y} r={8} fill={drawMode === 'reference' ? '#4CAF50' : '#1976d2'} />
              </G>
            )}
            
            {/* Current tap points (area/angle in progress) */}
            {tapPoints.map((p, i) => {
              const dp = imageToDisplayCoords(p);
              const color = drawMode === 'area' ? '#2196F3' : '#E91E63';
              return (
                <G key={`tp-${i}`}>
                  <Circle cx={dp.x} cy={dp.y} r={7} fill={color} stroke="#fff" strokeWidth={2} />
                  {i > 0 && (() => {
                    const prev = imageToDisplayCoords(tapPoints[i - 1]);
                    return <Line x1={prev.x} y1={prev.y} x2={dp.x} y2={dp.y} stroke={color} strokeWidth={2} strokeDasharray="5,3" />;
                  })()}
                </G>
              );
            })}
            {/* Close preview line for area */}
            {drawMode === 'area' && tapPoints.length >= 3 && (() => {
              const first = imageToDisplayCoords(tapPoints[0]);
              const last = imageToDisplayCoords(tapPoints[tapPoints.length - 1]);
              return <Line x1={last.x} y1={last.y} x2={first.x} y2={first.y} stroke="#2196F3" strokeWidth={1.5} strokeDasharray="3,3" opacity={0.5} />;
            })()}

            {/* Magnifier crosshair */}
            {magnifierPos && (drawMode === 'line' || drawMode === 'reference') && (() => {
              const dp = imageToDisplayCoords(magnifierPos);
              return (
                <G>
                  <Circle cx={dp.x} cy={dp.y - 45} r={22} fill="rgba(255,255,255,0.85)" stroke={drawMode === 'reference' ? '#4CAF50' : '#1976d2'} strokeWidth={2} />
                  <Line x1={dp.x - 8} y1={dp.y - 45} x2={dp.x + 8} y2={dp.y - 45} stroke={drawMode === 'reference' ? '#4CAF50' : '#1976d2'} strokeWidth={1} />
                  <Line x1={dp.x} y1={dp.y - 53} x2={dp.x} y2={dp.y - 37} stroke={drawMode === 'reference' ? '#4CAF50' : '#1976d2'} strokeWidth={1} />
                  <Line x1={dp.x} y1={dp.y - 23} x2={dp.x} y2={dp.y} stroke={drawMode === 'reference' ? '#4CAF50' : '#1976d2'} strokeWidth={1} strokeDasharray="3,2" />
                </G>
              );
            })()}
          </Svg>
        </View>
      </View>

      {/* Measurements List */}
      {totalItems > 0 && (
        <View style={styles.measurementsList}>
          <Text style={styles.measurementsTitle}>{totalItems} Messung{totalItems !== 1 ? 'en' : ''}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {measurements.map(m => (
              <TouchableOpacity key={m.id} style={[styles.measurementChip, m.type === 'reference' && styles.measurementChipReference, selectedMeasurement === m.id && styles.measurementChipSelected]}
                onPress={() => setSelectedMeasurement(m.id === selectedMeasurement ? null : m.id)}>
                <Ionicons name={m.type === 'reference' ? 'resize' : 'analytics'} size={14} color={m.type === 'reference' ? '#4CAF50' : '#1976d2'} />
                <Text style={styles.measurementChipText}>{m.label || formatLength(m)}</Text>
              </TouchableOpacity>
            ))}
            {areaMeasurements.map(a => (
              <TouchableOpacity key={a.id} style={[styles.measurementChip, { borderColor: '#2196F3' }, selectedMeasurement === a.id && styles.measurementChipSelected]}
                onPress={() => setSelectedMeasurement(a.id === selectedMeasurement ? null : a.id)}>
                <Ionicons name="shapes" size={14} color="#2196F3" />
                <Text style={styles.measurementChipText}>{a.label}</Text>
              </TouchableOpacity>
            ))}
            {angleMeasurements.map(ang => (
              <TouchableOpacity key={ang.id} style={[styles.measurementChip, { borderColor: '#E91E63' }, selectedMeasurement === ang.id && styles.measurementChipSelected]}
                onPress={() => setSelectedMeasurement(ang.id === selectedMeasurement ? null : ang.id)}>
                <Ionicons name="analytics" size={14} color="#E91E63" />
                <Text style={styles.measurementChipText}>{ang.angle}°</Text>
              </TouchableOpacity>
            ))}
            {buildingComponents.map(comp => {
              const ct = COMPONENT_TYPES.find(c => c.type === comp.type);
              return (
                <TouchableOpacity key={comp.id} style={[styles.measurementChip, { borderColor: ct?.color || '#666' }, selectedMeasurement === comp.id && styles.measurementChipSelected]}
                  onPress={() => setSelectedMeasurement(comp.id === selectedMeasurement ? null : comp.id)}>
                  <Ionicons name={ct?.icon || 'location'} size={14} color={ct?.color || '#666'} />
                  <Text style={styles.measurementChipText}>{ct?.label || comp.type}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* ===== TOOL PICKER MODAL ===== */}
      <Modal visible={showToolPicker} transparent animationType="fade">
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowToolPicker(false)}>
          <View style={styles.toolPickerContent}>
            <Text style={styles.toolPickerTitle}>Messwerkzeug wählen</Text>
            
            <TouchableOpacity style={styles.toolPickerItem} onPress={() => activateTool('area')}>
              <View style={[styles.toolPickerIcon, { backgroundColor: '#E3F2FD' }]}>
                <Ionicons name="shapes" size={24} color="#1976D2" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.toolPickerItemTitle}>📊 Flächenmessung</Text>
                <Text style={styles.toolPickerItemDesc}>Mehrere Punkte tippen → m² berechnen</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity style={styles.toolPickerItem} onPress={() => activateTool('angle')}>
              <View style={[styles.toolPickerIcon, { backgroundColor: '#FCE4EC' }]}>
                <Ionicons name="git-network" size={24} color="#E91E63" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.toolPickerItemTitle}>📐 Winkelmessung</Text>
                <Text style={styles.toolPickerItemDesc}>3 Punkte tippen → Winkel in Grad</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity style={styles.toolPickerItem} onPress={() => activateTool('component')}>
              <View style={[styles.toolPickerIcon, { backgroundColor: '#F3E5F5' }]}>
                <Ionicons name="location" size={24} color="#9C27B0" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.toolPickerItemTitle}>🏷️ Bauteil-Markierung</Text>
                <Text style={styles.toolPickerItemDesc}>Fenster, Türen, Heizung etc.</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.toolPickerItem, { backgroundColor: '#f5f5f5' }]} onPress={() => setShowToolPicker(false)}>
              <View style={[styles.toolPickerIcon, { backgroundColor: '#eee' }]}>
                <Ionicons name="close" size={24} color="#666" />
              </View>
              <Text style={[styles.toolPickerItemTitle, { color: '#666' }]}>Abbrechen</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ===== COMPONENT PICKER MODAL ===== */}
      <Modal visible={showComponentPicker} transparent animationType="fade">
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => { setShowComponentPicker(false); setPendingComponentPos(null); }}>
          <View style={styles.toolPickerContent}>
            <Text style={styles.toolPickerTitle}>Bauteil wählen</Text>
            {COMPONENT_TYPES.map(ct => (
              <TouchableOpacity key={ct.type} style={styles.toolPickerItem} onPress={() => addComponent(ct.type)}>
                <View style={[styles.toolPickerIcon, { backgroundColor: ct.color + '20' }]}>
                  <Ionicons name={ct.icon} size={24} color={ct.color} />
                </View>
                <Text style={styles.toolPickerItemTitle}>{ct.emoji} {ct.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ===== LENGTH INPUT MODAL (existing) ===== */}
      <Modal visible={showLengthModal} transparent animationType="slide">
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{pendingMeasurement?.type === 'reference' ? 'Referenzmaß eingeben' : 'Maß eingeben'}</Text>
            {pendingMeasurement?.type === 'reference' && (
              <View style={styles.modalInfo}>
                <Ionicons name="information-circle" size={18} color="#4CAF50" />
                <Text style={styles.modalInfoText}>Geben Sie die tatsächliche Länge der gezeichneten Linie ein. Alle weiteren Messungen werden automatisch berechnet.</Text>
              </View>
            )}
            <Text style={styles.inputLabel}>Länge</Text>
            <View style={styles.lengthInputRow}>
              <TextInput style={styles.lengthInput} value={lengthInput} onChangeText={setLengthInput} placeholder="0" keyboardType="decimal-pad" autoFocus />
              <View style={styles.unitToggle}>
                <TouchableOpacity style={[styles.unitButton, unitInput === 'cm' && styles.unitButtonActive]} onPress={() => setUnitInput('cm')}>
                  <Text style={[styles.unitButtonText, unitInput === 'cm' && styles.unitButtonTextActive]}>cm</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.unitButton, unitInput === 'm' && styles.unitButtonActive]} onPress={() => setUnitInput('m')}>
                  <Text style={[styles.unitButtonText, unitInput === 'm' && styles.unitButtonTextActive]}>m</Text>
                </TouchableOpacity>
              </View>
            </View>
            <Text style={styles.inputLabel}>Beschriftung (optional)</Text>
            <TextInput style={styles.labelInput} value={labelInput} onChangeText={setLabelInput} placeholder="z.B. Fensterbreite, Türhöhe..." placeholderTextColor="#999" />
            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.cancelButton} onPress={() => { setShowLengthModal(false); setPendingMeasurement(null); setLengthInput(''); setLabelInput(''); }}>
                <Text style={styles.cancelButtonText}>Abbrechen</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.confirmButton} onPress={addMeasurement}>
                <Text style={styles.confirmButtonText}>Hinzufügen</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1a1a1a' },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#1976d2', paddingVertical: 12, paddingHorizontal: 16 },
  backButton: { padding: 4 },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: 'bold', color: '#fff', textAlign: 'center', marginHorizontal: 8 },
  saveHeaderButton: { padding: 4 },
  toolbar: { flexDirection: 'row', backgroundColor: '#fff', paddingVertical: 8, paddingHorizontal: 12, gap: 8, borderBottomWidth: 1, borderBottomColor: '#e0e0e0', flexWrap: 'wrap' },
  toolButton: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 20, backgroundColor: '#f5f5f5', gap: 6, borderWidth: 1, borderColor: '#e0e0e0' },
  toolButtonActive: { backgroundColor: '#1976d2', borderColor: '#1565c0' },
  toolButtonActiveOrange: { backgroundColor: '#FF6D00', borderColor: '#E65100' },
  toolButtonHighlight: { borderColor: '#4CAF50', borderWidth: 2 },
  deleteToolButton: { marginLeft: 'auto', backgroundColor: '#ffebee', borderColor: '#f44336' },
  toolButtonText: { fontSize: 13, fontWeight: '600', color: '#1976d2' },
  toolButtonTextActive: { color: '#fff' },
  checkBadge: { backgroundColor: '#4CAF50', borderRadius: 8, width: 16, height: 16, justifyContent: 'center', alignItems: 'center' },
  statusBar: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 16, gap: 8 },
  statusBarReference: { backgroundColor: '#e8f5e9' },
  statusBarLine: { backgroundColor: '#e3f2fd' },
  statusBarArea: { backgroundColor: '#e3f2fd' },
  statusBarAngle: { backgroundColor: '#fce4ec' },
  statusBarComponent: { backgroundColor: '#f3e5f5' },
  statusText: { fontSize: 13, fontWeight: '500', flex: 1 },
  closeAreaButton: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#4CAF50', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 16, gap: 4 },
  closeAreaText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  undoPointButton: { padding: 6, backgroundColor: '#f0f0f0', borderRadius: 16 },
  canvasContainer: { flex: 1, backgroundColor: '#000' },
  image: { width: '100%', height: '100%' },
  measurementsList: { backgroundColor: '#fff', paddingVertical: 8, paddingHorizontal: 12, borderTopWidth: 1, borderTopColor: '#e0e0e0' },
  measurementsTitle: { fontSize: 12, fontWeight: '600', color: '#666', marginBottom: 6 },
  measurementChip: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f5f5f5', paddingVertical: 6, paddingHorizontal: 10, borderRadius: 16, marginRight: 8, gap: 4, borderWidth: 1, borderColor: '#e0e0e0' },
  measurementChipReference: { backgroundColor: '#e8f5e9', borderColor: '#4CAF50' },
  measurementChipSelected: { backgroundColor: '#fff3e0', borderColor: '#FF9800' },
  measurementChipText: { fontSize: 12, fontWeight: '500', color: '#333' },
  // Tool Picker
  toolPickerContent: { backgroundColor: '#fff', borderRadius: 16, padding: 20, width: '90%', maxWidth: 380 },
  toolPickerTitle: { fontSize: 18, fontWeight: '700', color: '#333', marginBottom: 16, textAlign: 'center' },
  toolPickerItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 8, borderRadius: 12, backgroundColor: '#f9f9f9', marginBottom: 8, gap: 12 },
  toolPickerIcon: { width: 44, height: 44, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  toolPickerItemTitle: { fontSize: 15, fontWeight: '700', color: '#333' },
  toolPickerItemDesc: { fontSize: 12, color: '#888', marginTop: 2 },
  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalContent: { backgroundColor: '#fff', borderRadius: 16, padding: 20 },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color: '#333', marginBottom: 16, textAlign: 'center' },
  modalInfo: { flexDirection: 'row', backgroundColor: '#e8f5e9', padding: 12, borderRadius: 8, marginBottom: 16, gap: 8 },
  modalInfoText: { flex: 1, fontSize: 13, color: '#2e7d32', lineHeight: 18 },
  inputLabel: { fontSize: 14, fontWeight: '600', color: '#666', marginBottom: 8 },
  lengthInputRow: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  lengthInput: { flex: 1, backgroundColor: '#f5f5f5', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, fontSize: 24, fontWeight: 'bold', color: '#333', textAlign: 'center', borderWidth: 1, borderColor: '#e0e0e0' },
  unitToggle: { flexDirection: 'column', gap: 4 },
  unitButton: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 8, backgroundColor: '#f5f5f5', borderWidth: 1, borderColor: '#e0e0e0' },
  unitButtonActive: { backgroundColor: '#1976d2', borderColor: '#1565c0' },
  unitButtonText: { fontSize: 14, fontWeight: '600', color: '#666' },
  unitButtonTextActive: { color: '#fff' },
  labelInput: { backgroundColor: '#f5f5f5', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, color: '#333', borderWidth: 1, borderColor: '#e0e0e0', marginBottom: 20 },
  modalButtons: { flexDirection: 'row', gap: 12 },
  cancelButton: { flex: 1, paddingVertical: 14, borderRadius: 12, backgroundColor: '#f5f5f5', alignItems: 'center' },
  cancelButtonText: { fontSize: 16, fontWeight: '600', color: '#666' },
  confirmButton: { flex: 1, paddingVertical: 14, borderRadius: 12, backgroundColor: '#4CAF50', alignItems: 'center' },
  confirmButtonText: { fontSize: 16, fontWeight: '600', color: '#fff' },
});

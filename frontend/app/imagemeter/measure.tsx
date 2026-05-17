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
const CUSTOM_COMPONENTS_KEY = 'aufmassprofi_custom_components';
const { width: SCREEN_WIDTH } = Dimensions.get('window');

type MeasurementType = 'line' | 'reference';
type DrawModeType = 'none' | 'line' | 'reference' | 'area' | 'angle' | 'component';

interface Point { x: number; y: number; }

interface Measurement {
  id: string; type: MeasurementType; startPoint: Point; endPoint: Point;
  pixelLength: number; realLength?: number; unit: 'cm' | 'm'; label?: string;
}

interface AreaMeasurement {
  id: string; points: Point[]; pixelArea: number; realArea?: number;
  label?: string; color: string;
}

interface AngleMeasurement {
  id: string; p1: Point; vertex: Point; p2: Point; angle: number; color: string;
}

interface BuildingComponent {
  id: string; type: string; position: Point; label?: string;
}

interface CustomComponentDef {
  type: string; label: string; emoji: string; color: string;
}

const DEFAULT_COMPONENTS: CustomComponentDef[] = [
  { type: 'window', label: 'Fenster', color: '#2196F3', emoji: '⬜' },
  { type: 'door', label: 'Tür', color: '#795548', emoji: '🚪' },
  { type: 'heater', label: 'Heizung', color: '#FF5722', emoji: '🔥' },
  { type: 'socket', label: 'Steckdose', color: '#FFC107', emoji: '⚡' },
  { type: 'light', label: 'Licht', color: '#FFEB3B', emoji: '💡' },
  { type: 'water', label: 'Wasser', color: '#00BCD4', emoji: '💧' },
];

const EMOJI_OPTIONS = ['📌', '🔧', '🔩', '📐', '🧱', '🪟', '🛗', '🚿', '🔌', '💨', '🌡️', '📡', '🔔', '🧯', '♨️', '🏗️'];
const COLOR_OPTIONS = ['#2196F3', '#795548', '#FF5722', '#FFC107', '#4CAF50', '#9C27B0', '#FF9800', '#607D8B', '#E91E63', '#00BCD4'];

interface ImageMeterPhoto {
  id: string; imageUri: string; name: string; projectId?: string;
  measurements: Measurement[]; areaMeasurements?: AreaMeasurement[];
  angleMeasurements?: AngleMeasurement[]; buildingComponents?: BuildingComponent[];
  referenceScale?: number; createdAt: string; updatedAt: string;
}

interface DragHandle {
  measureId: string;
  measureType: 'line' | 'area' | 'angle' | 'component';
  pointIndex: number; // 0=start/p1, 1=end/vertex/p2, 2=p2(angle)
}

// ============ HELPERS ============
const calcDist = (a: Point, b: Point) => Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2);
const calcPolyArea = (pts: Point[]) => {
  let a = 0;
  for (let i = 0; i < pts.length; i++) { const j = (i + 1) % pts.length; a += pts[i].x * pts[j].y - pts[j].x * pts[i].y; }
  return Math.abs(a / 2);
};
const calcAngle = (p1: Point, v: Point, p2: Point) => {
  const v1 = { x: p1.x - v.x, y: p1.y - v.y }, v2 = { x: p2.x - v.x, y: p2.y - v.y };
  return Math.round(Math.atan2(Math.abs(v1.x * v2.y - v1.y * v2.x), v1.x * v2.x + v1.y * v2.y) * (180 / Math.PI) * 10) / 10;
};
const fmtNum = (n: number) => n.toFixed(2).replace('.', ',');

export default function ImageMeterMeasureScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useLocalSearchParams();
  const photoId = params.id as string;

  const [photo, setPhoto] = useState<ImageMeterPhoto | null>(null);
  const [loading, setLoading] = useState(true);
  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const [referenceScale, setReferenceScale] = useState<number | null>(null);
  const [areaMeasurements, setAreaMeasurements] = useState<AreaMeasurement[]>([]);
  const [angleMeasurements, setAngleMeasurements] = useState<AngleMeasurement[]>([]);
  const [buildingComponents, setBuildingComponents] = useState<BuildingComponent[]>([]);
  const [customComponents, setCustomComponents] = useState<CustomComponentDef[]>([]);

  const [drawMode, setDrawMode] = useState<DrawModeType>('none');
  const [currentLine, setCurrentLine] = useState<{ start: Point; end: Point } | null>(null);
  const [selectedMeasurement, setSelectedMeasurement] = useState<string | null>(null);
  const [tapPoints, setTapPoints] = useState<Point[]>([]);
  const [showEdgeLengths, setShowEdgeLengths] = useState(true);

  const [imageDimensions, setImageDimensions] = useState({ width: 0, height: 0 });
  const [containerDimensions, setContainerDimensions] = useState({ width: SCREEN_WIDTH, height: 400 });

  // Modals
  const [showLengthModal, setShowLengthModal] = useState(false);
  const [pendingMeasurement, setPendingMeasurement] = useState<{ start: Point; end: Point; type: MeasurementType } | null>(null);
  const [lengthInput, setLengthInput] = useState('');
  const [unitInput, setUnitInput] = useState<'cm' | 'm'>('cm');
  const [labelInput, setLabelInput] = useState('');
  const [hasChanges, setHasChanges] = useState(false);
  const [showToolPicker, setShowToolPicker] = useState(false);
  const [showComponentPicker, setShowComponentPicker] = useState(false);
  const [pendingComponentPos, setPendingComponentPos] = useState<Point | null>(null);
  
  // Custom component modal
  const [showNewComponentModal, setShowNewComponentModal] = useState(false);
  const [newCompLabel, setNewCompLabel] = useState('');
  const [newCompEmoji, setNewCompEmoji] = useState('📌');
  const [newCompColor, setNewCompColor] = useState('#607D8B');

  // Drag editing - USE REFS for synchronous access during touch events
  const dragHandleRef = useRef<DragHandle | null>(null);
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef<Point>({ x: 0, y: 0 });
  const justDraggedRef = useRef(false); // prevent tap after drag
  
  // Smooth drag: store current drag position in ref, only commit on release
  const [dragPos, setDragPos] = useState<Point | null>(null);
  const dragPosRef = useRef<Point | null>(null);
  const dragAnimFrame = useRef<number | null>(null);

  // Load
  useEffect(() => { loadPhoto(); loadCustomComponents(); }, [photoId]);
  useFocusEffect(useCallback(() => { return () => { if (hasChanges) autoSave(); }; }, [hasChanges, measurements, areaMeasurements, angleMeasurements, buildingComponents, referenceScale]));

  const loadCustomComponents = async () => {
    try {
      const data = await AsyncStorage.getItem(CUSTOM_COMPONENTS_KEY);
      if (data) setCustomComponents(JSON.parse(data));
    } catch (e) { console.error('Error loading custom components:', e); }
  };

  const saveCustomComponents = async (comps: CustomComponentDef[]) => {
    try { await AsyncStorage.setItem(CUSTOM_COMPONENTS_KEY, JSON.stringify(comps)); } catch (e) { console.error(e); }
  };

  const allComponentTypes = [...DEFAULT_COMPONENTS, ...customComponents];

  const loadPhoto = async () => {
    try {
      const data = await AsyncStorage.getItem(IMAGEMETER_STORAGE_KEY);
      if (data) {
        const photos: ImageMeterPhoto[] = JSON.parse(data);
        const found = photos.find(p => p.id === photoId);
        if (found) {
          setPhoto(found); setMeasurements(found.measurements || []);
          setReferenceScale(found.referenceScale || null);
          setAreaMeasurements(found.areaMeasurements || []);
          setAngleMeasurements(found.angleMeasurements || []);
          setBuildingComponents(found.buildingComponents || []);
          Image.getSize(found.imageUri, (w, h) => setImageDimensions({ width: w, height: h }), (e) => console.error(e));
        }
      }
    } catch (error) { console.error(error); Alert.alert(t('common.error'), 'Foto konnte nicht geladen werden'); }
    finally { setLoading(false); }
  };

  const buildSave = () => ({ measurements, referenceScale, areaMeasurements, angleMeasurements, buildingComponents, updatedAt: new Date().toISOString() });

  const autoSave = async () => {
    if (!photo) return;
    try {
      const data = await AsyncStorage.getItem(IMAGEMETER_STORAGE_KEY);
      if (data) { const ps: ImageMeterPhoto[] = JSON.parse(data); const i = ps.findIndex(p => p.id === photoId); if (i !== -1) { ps[i] = { ...ps[i], ...buildSave() }; await AsyncStorage.setItem(IMAGEMETER_STORAGE_KEY, JSON.stringify(ps)); } }
    } catch (e) { console.error(e); }
  };

  const saveChanges = async () => {
    if (!photo) return;
    try {
      const data = await AsyncStorage.getItem(IMAGEMETER_STORAGE_KEY);
      if (data) { const ps: ImageMeterPhoto[] = JSON.parse(data); const i = ps.findIndex(p => p.id === photoId); if (i !== -1) { ps[i] = { ...ps[i], ...buildSave() }; await AsyncStorage.setItem(IMAGEMETER_STORAGE_KEY, JSON.stringify(ps)); setHasChanges(false); Alert.alert(t('common.success'), 'Messungen wurden gespeichert'); } }
    } catch (e) { console.error(e); Alert.alert(t('common.error'), 'Speichern fehlgeschlagen'); }
  };

  // ---- Coordinates ----
  const getScale = () => {
    if (imageDimensions.width === 0 || containerDimensions.width === 0) return 1;
    return Math.min(containerDimensions.width / imageDimensions.width, containerDimensions.height / imageDimensions.height);
  };
  const toImg = (tx: number, ty: number): Point => {
    const s = getScale(), dw = imageDimensions.width * s, dh = imageDimensions.height * s;
    const ox = (containerDimensions.width - dw) / 2, oy = (containerDimensions.height - dh) / 2;
    return { x: (tx - ox) / s, y: (ty - oy) / s };
  };
  const toDisp = (p: Point): Point => {
    const s = getScale(), dw = imageDimensions.width * s, dh = imageDimensions.height * s;
    const ox = (containerDimensions.width - dw) / 2, oy = (containerDimensions.height - dh) / 2;
    return { x: p.x * s + ox, y: p.y * s + oy };
  };

  // ---- Format edge length ----
  const formatPixelLen = (pixLen: number): string => {
    if (!referenceScale) return `${Math.round(pixLen)} px`;
    const cm = pixLen / referenceScale;
    return cm >= 100 ? `${(cm / 100).toFixed(2)} m` : `${cm.toFixed(1)} cm`;
  };

  // ---- Find handle near point ----
  const findHandle = (imgPt: Point, radius: number = 40): DragHandle | null => {
    if (!selectedMeasurement) return null;
    // Line
    const ml = measurements.find(m => m.id === selectedMeasurement);
    if (ml) {
      if (calcDist(imgPt, ml.startPoint) < radius) return { measureId: ml.id, measureType: 'line', pointIndex: 0 };
      if (calcDist(imgPt, ml.endPoint) < radius) return { measureId: ml.id, measureType: 'line', pointIndex: 1 };
    }
    // Area
    const area = areaMeasurements.find(a => a.id === selectedMeasurement);
    if (area) {
      for (let i = 0; i < area.points.length; i++) {
        if (calcDist(imgPt, area.points[i]) < radius) return { measureId: area.id, measureType: 'area', pointIndex: i };
      }
    }
    // Angle
    const ang = angleMeasurements.find(a => a.id === selectedMeasurement);
    if (ang) {
      if (calcDist(imgPt, ang.p1) < radius) return { measureId: ang.id, measureType: 'angle', pointIndex: 0 };
      if (calcDist(imgPt, ang.vertex) < radius) return { measureId: ang.id, measureType: 'angle', pointIndex: 1 };
      if (calcDist(imgPt, ang.p2) < radius) return { measureId: ang.id, measureType: 'angle', pointIndex: 2 };
    }
    // Component
    const comp = buildingComponents.find(c => c.id === selectedMeasurement);
    if (comp) {
      if (calcDist(imgPt, comp.position) < radius) return { measureId: comp.id, measureType: 'component', pointIndex: 0 };
    }
    return null;
  };

  // ---- Move handle: only called on RELEASE for final commit ----
  const commitHandle = (handle: DragHandle, newImgPt: Point) => {
    if (handle.measureType === 'line') {
      setMeasurements(prev => prev.map(m => {
        if (m.id !== handle.measureId) return m;
        const updated = handle.pointIndex === 0 ? { ...m, startPoint: newImgPt } : { ...m, endPoint: newImgPt };
        updated.pixelLength = calcDist(updated.startPoint, updated.endPoint);
        if (referenceScale) updated.realLength = updated.pixelLength / referenceScale;
        return updated;
      }));
    } else if (handle.measureType === 'area') {
      setAreaMeasurements(prev => prev.map(a => {
        if (a.id !== handle.measureId) return a;
        const pts = [...a.points]; pts[handle.pointIndex] = newImgPt;
        const pixArea = calcPolyArea(pts);
        let realArea: number | undefined, label: string;
        if (referenceScale) { realArea = pixArea / (referenceScale * referenceScale); label = realArea >= 10000 ? `${fmtNum(realArea / 10000)} m²` : `${fmtNum(realArea)} cm²`; }
        else { label = `${Math.round(pixArea)} px²`; }
        return { ...a, points: pts, pixelArea: pixArea, realArea, label };
      }));
    } else if (handle.measureType === 'angle') {
      setAngleMeasurements(prev => prev.map(a => {
        if (a.id !== handle.measureId) return a;
        const updated = { ...a };
        if (handle.pointIndex === 0) updated.p1 = newImgPt;
        else if (handle.pointIndex === 1) updated.vertex = newImgPt;
        else updated.p2 = newImgPt;
        updated.angle = calcAngle(updated.p1, updated.vertex, updated.p2);
        return updated;
      }));
    } else if (handle.measureType === 'component') {
      setBuildingComponents(prev => prev.map(c => c.id !== handle.measureId ? c : { ...c, position: newImgPt }));
    }
    setHasChanges(true);
  };

  // ============ TOUCH HANDLERS ============
  const handleTouchStart = (event: any) => {
    const touch = event.nativeEvent;
    const imgPt = toImg(touch.locationX, touch.locationY);
    justDraggedRef.current = false;

    // Check for handle dragging first (when something selected, in ANY mode)
    if (selectedMeasurement) {
      const handle = findHandle(imgPt);
      if (handle) {
        dragHandleRef.current = handle;
        isDraggingRef.current = true;
        dragStartRef.current = imgPt;
        dragPosRef.current = imgPt;
        setDragPos(imgPt);
        return;
      }
    }

    // Direct component dragging (no prior selection needed)
    if (drawMode === 'none') {
      for (const comp of buildingComponents) {
        if (calcDist(imgPt, comp.position) < 50) {
          setSelectedMeasurement(comp.id);
          dragHandleRef.current = { measureId: comp.id, measureType: 'component', pointIndex: 0 };
          isDraggingRef.current = true;
          dragStartRef.current = imgPt;
          dragPosRef.current = imgPt;
          setDragPos(imgPt);
          return;
        }
      }
    }

    if (drawMode === 'none' || drawMode === 'area' || drawMode === 'angle' || drawMode === 'component') return;
    setCurrentLine({ start: imgPt, end: imgPt }); setDragPos(imgPt);
  };

  const handleTouchMove = (event: any) => {
    const touch = event.nativeEvent;
    const imgPt = toImg(touch.locationX, touch.locationY);

    // Smooth drag: only update lightweight preview position
    if (isDraggingRef.current && dragHandleRef.current) {
      dragPosRef.current = imgPt;
      justDraggedRef.current = true;
      // Throttled state update for visual feedback
      if (dragAnimFrame.current) cancelAnimationFrame(dragAnimFrame.current);
      dragAnimFrame.current = requestAnimationFrame(() => {
        setDragPos({ ...imgPt });
      });
      return;
    }

    if (drawMode === 'none' || !currentLine) return;
    if (drawMode === 'area' || drawMode === 'angle' || drawMode === 'component') return;
    setCurrentLine(prev => prev ? { ...prev, end: imgPt } : null);
    setDragPos(imgPt);
  };

  const handleTouchEnd = () => {
    // Commit drag to actual measurement data
    if (isDraggingRef.current && dragHandleRef.current && dragPosRef.current) {
      commitHandle(dragHandleRef.current, dragPosRef.current);
      isDraggingRef.current = false;
      dragHandleRef.current = null;
      dragPosRef.current = null;
      setDragPos(null);
      if (dragAnimFrame.current) { cancelAnimationFrame(dragAnimFrame.current); dragAnimFrame.current = null; }
      return;
    }

    setDragPos(null);
    if (drawMode === 'none' || !currentLine) return;
    if (drawMode === 'area' || drawMode === 'angle' || drawMode === 'component') return;

    const pixLen = calcDist(currentLine.start, currentLine.end);
    if (pixLen < 20) { setCurrentLine(null); return; }

    if (drawMode === 'line' && referenceScale) {
      const calc = pixLen / referenceScale;
      setMeasurements(prev => [...prev, { id: `m_${Date.now()}`, type: 'line', startPoint: currentLine.start, endPoint: currentLine.end, pixelLength: pixLen, realLength: calc, unit: calc >= 100 ? 'm' : 'cm' }]);
      setHasChanges(true); setCurrentLine(null); setDrawMode('none'); return;
    }
    setPendingMeasurement({ start: currentLine.start, end: currentLine.end, type: drawMode as MeasurementType });
    setShowLengthModal(true); setCurrentLine(null);
  };

  // ---- Tap (for area/angle/component/selection) ----
  const handleCanvasTap = (event: any) => {
    if (justDraggedRef.current) { justDraggedRef.current = false; return; }
    if (isDraggingRef.current) return;
    
    const touch = event.nativeEvent;
    const imgPt = toImg(touch.locationX, touch.locationY);

    if (drawMode === 'none') {
      for (const m of measurements) { const mid = { x: (m.startPoint.x + m.endPoint.x) / 2, y: (m.startPoint.y + m.endPoint.y) / 2 }; if (calcDist(imgPt, mid) < 50) { setSelectedMeasurement(m.id === selectedMeasurement ? null : m.id); return; } }
      for (const a of areaMeasurements) { const cx = a.points.reduce((s, p) => s + p.x, 0) / a.points.length; const cy = a.points.reduce((s, p) => s + p.y, 0) / a.points.length; if (calcDist(imgPt, { x: cx, y: cy }) < 60) { setSelectedMeasurement(a.id === selectedMeasurement ? null : a.id); return; } }
      for (const ang of angleMeasurements) { if (calcDist(imgPt, ang.vertex) < 50) { setSelectedMeasurement(ang.id === selectedMeasurement ? null : ang.id); return; } }
      for (const comp of buildingComponents) { if (calcDist(imgPt, comp.position) < 50) { setSelectedMeasurement(comp.id === selectedMeasurement ? null : comp.id); return; } }
      setSelectedMeasurement(null); return;
    }
    if (drawMode === 'area') { setTapPoints(prev => [...prev, imgPt]); }
    else if (drawMode === 'angle') {
      const pts = [...tapPoints, imgPt]; setTapPoints(pts);
      if (pts.length === 3) {
        setAngleMeasurements(prev => [...prev, { id: `ang_${Date.now()}`, p1: pts[0], vertex: pts[1], p2: pts[2], angle: calcAngle(pts[0], pts[1], pts[2]), color: '#E91E63' }]);
        setTapPoints([]); setHasChanges(true);
      }
    }
    else if (drawMode === 'component') { setPendingComponentPos(imgPt); setShowComponentPicker(true); }
  };

  // ---- Area close ----
  const closeAreaPolygon = () => {
    if (tapPoints.length < 3) { Alert.alert('Hinweis', 'Mindestens 3 Punkte.'); return; }
    const pixA = calcPolyArea(tapPoints);
    let realA: number | undefined, label: string;
    if (referenceScale) { realA = pixA / (referenceScale * referenceScale); label = realA >= 10000 ? `${fmtNum(realA / 10000)} m²` : `${fmtNum(realA)} cm²`; }
    else { label = `${Math.round(pixA)} px²`; }
    setAreaMeasurements(prev => [...prev, { id: `area_${Date.now()}`, points: [...tapPoints], pixelArea: pixA, realArea: realA, label, color: '#2196F3' }]);
    setTapPoints([]); setHasChanges(true);
  };

  // ---- Add measurement ----
  const addMeasurement = () => {
    if (!pendingMeasurement) return;
    const length = parseFloat(lengthInput.replace(',', '.'));
    if (isNaN(length) || length <= 0) { Alert.alert(t('common.error'), 'Ungültige Länge'); return; }
    const pixLen = calcDist(pendingMeasurement.start, pendingMeasurement.end);
    const realCm = unitInput === 'm' ? length * 100 : length;
    if (pendingMeasurement.type === 'reference') {
      const ns = pixLen / realCm; setReferenceScale(ns);
      setMeasurements(prev => prev.map(m => ({ ...m, realLength: m.pixelLength / ns })));
      setAreaMeasurements(prev => prev.map(a => { const ra = a.pixelArea / (ns * ns); return { ...a, realArea: ra, label: ra >= 10000 ? `${fmtNum(ra / 10000)} m²` : `${fmtNum(ra)} cm²` }; }));
    }
    setMeasurements(prev => [...prev, { id: `m_${Date.now()}`, type: pendingMeasurement.type, startPoint: pendingMeasurement.start, endPoint: pendingMeasurement.end, pixelLength: pixLen, realLength: realCm, unit: unitInput, label: labelInput.trim() || undefined }]);
    setHasChanges(true); setShowLengthModal(false); setPendingMeasurement(null); setLengthInput(''); setLabelInput(''); setDrawMode('none');
  };

  // ---- Add/create component ----
  const addComponent = (compDef: CustomComponentDef) => {
    if (!pendingComponentPos) return;
    setBuildingComponents(prev => [...prev, { id: `comp_${Date.now()}`, type: compDef.type, position: pendingComponentPos, label: compDef.label }]);
    setHasChanges(true); setShowComponentPicker(false); setPendingComponentPos(null);
  };

  const createCustomComponent = () => {
    if (!newCompLabel.trim()) { Alert.alert('Hinweis', 'Bitte einen Namen eingeben.'); return; }
    const newDef: CustomComponentDef = { type: `custom_${Date.now()}`, label: newCompLabel.trim(), emoji: newCompEmoji, color: newCompColor };
    const updated = [...customComponents, newDef];
    setCustomComponents(updated); saveCustomComponents(updated);
    setShowNewComponentModal(false); setNewCompLabel(''); setNewCompEmoji('📌'); setNewCompColor('#607D8B');
    // Directly add it
    if (pendingComponentPos) {
      setBuildingComponents(prev => [...prev, { id: `comp_${Date.now()}`, type: newDef.type, position: pendingComponentPos, label: newDef.label }]);
      setHasChanges(true); setShowComponentPicker(false); setPendingComponentPos(null);
    }
  };

  const deleteCustomComponent = (type: string) => {
    Alert.alert('Bauteil löschen?', 'Dieses eigene Bauteil wird aus der Liste entfernt.', [
      { text: 'Abbrechen', style: 'cancel' },
      { text: 'Löschen', style: 'destructive', onPress: () => {
        const updated = customComponents.filter(c => c.type !== type);
        setCustomComponents(updated); saveCustomComponents(updated);
      }},
    ]);
  };

  // ---- Delete selected ----
  const deleteSelected = () => {
    if (!selectedMeasurement) return;
    const isRef = measurements.find(m => m.id === selectedMeasurement && m.type === 'reference');
    Alert.alert(isRef ? 'Referenz löschen?' : 'Messung löschen?', isRef ? 'Automatische Berechnungen gehen verloren.' : 'Diese Messung wird gelöscht.', [
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

  const undoLast = () => {
    if (tapPoints.length > 0) { setTapPoints(prev => prev.slice(0, -1)); return; }
    if (drawMode === 'area' && areaMeasurements.length > 0) { setAreaMeasurements(prev => prev.slice(0, -1)); setHasChanges(true); return; }
    if (drawMode === 'angle' && angleMeasurements.length > 0) { setAngleMeasurements(prev => prev.slice(0, -1)); setHasChanges(true); return; }
    if (drawMode === 'component' && buildingComponents.length > 0) { setBuildingComponents(prev => prev.slice(0, -1)); setHasChanges(true); return; }
    if (measurements.length > 0) { setMeasurements(prev => prev.slice(0, -1)); setHasChanges(true); }
  };

  const formatLength = (m: Measurement): string => {
    if (m.type === 'reference') {
      // realLength is stored in cm internally
      if (m.realLength !== undefined) {
        if (m.unit === 'm') return `${(m.realLength / 100).toFixed(2).replace('.', ',')} m (Referenz)`;
        return `${m.realLength.toFixed(1).replace('.', ',')} cm (Referenz)`;
      }
      return '? (Referenz)';
    }
    if (referenceScale && m.pixelLength) { const c = m.pixelLength / referenceScale; return c >= 100 ? `${(c / 100).toFixed(2).replace('.', ',')} m` : `${c.toFixed(1).replace('.', ',')} cm`; }
    if (m.realLength) return m.unit === 'm' ? `${(m.realLength / 100).toFixed(2).replace('.', ',')} m` : `${m.realLength.toFixed(1).replace('.', ',')} cm`;
    return '?';
  };

  const activateTool = (mode: DrawModeType) => { setDrawMode(mode); setTapPoints([]); setCurrentLine(null); setSelectedMeasurement(null); dragHandleRef.current = null; isDraggingRef.current = false; setShowToolPicker(false); };

  // ============ RENDER ============
  const renderLine = (m: Measurement) => {
    const s = toDisp(m.startPoint), e = toDisp(m.endPoint);
    const isSel = selectedMeasurement === m.id, isRef = m.type === 'reference';
    const mid = { x: (s.x + e.x) / 2, y: (s.y + e.y) / 2 };
    const color = isRef ? '#4CAF50' : (isSel ? '#FF9800' : '#f44336');
    const label = m.label || formatLength(m);
    const lw = Math.max(70, label.length * 7 + 16);
    return (
      <G key={m.id}>
        <Line x1={s.x} y1={s.y} x2={e.x} y2={e.y} stroke={color} strokeWidth={isSel ? 4 : 3} strokeLinecap="round" />
        <Circle cx={s.x} cy={s.y} r={isSel ? 10 : 6} fill={color} stroke={isSel ? '#fff' : 'none'} strokeWidth={isSel ? 2 : 0} />
        <Circle cx={e.x} cy={e.y} r={isSel ? 10 : 6} fill={color} stroke={isSel ? '#fff' : 'none'} strokeWidth={isSel ? 2 : 0} />
        <Rect x={mid.x - lw / 2} y={mid.y - 12} width={lw} height={24} rx={4} fill="rgba(255,255,255,0.95)" stroke={color} strokeWidth={1} />
        <SvgText x={mid.x} y={mid.y + 5} fill={color} fontSize={12} fontWeight="bold" textAnchor="middle">{label}</SvgText>
        {isRef && <Circle cx={mid.x + lw / 2 - 8} cy={mid.y - 6} r={6} fill="#4CAF50" />}
      </G>
    );
  };

  const renderArea = (a: AreaMeasurement) => {
    const dp = a.points.map(p => toDisp(p));
    const ptsStr = dp.map(p => `${p.x},${p.y}`).join(' ');
    const cx = dp.reduce((s, p) => s + p.x, 0) / dp.length;
    const cy = dp.reduce((s, p) => s + p.y, 0) / dp.length;
    const isSel = selectedMeasurement === a.id;
    const color = isSel ? '#FF9800' : a.color;
    const lw = Math.max(70, (a.label || '').length * 7 + 16);
    return (
      <G key={a.id}>
        <Polygon points={ptsStr} fill={`${color}25`} stroke={color} strokeWidth={isSel ? 3 : 2} />
        {/* Vertex points (bigger when selected for dragging) */}
        {dp.map((p, i) => <Circle key={i} cx={p.x} cy={p.y} r={isSel ? 10 : 5} fill={color} stroke={isSel ? '#fff' : 'none'} strokeWidth={isSel ? 2 : 0} />)}
        {/* Edge lengths */}
        {showEdgeLengths && a.points.map((pt, i) => {
          const j = (i + 1) % a.points.length;
          const pixLen = calcDist(a.points[i], a.points[j]);
          const edgeLabel = formatPixelLen(pixLen);
          const dpi = dp[i], dpj = dp[j];
          const emx = (dpi.x + dpj.x) / 2, emy = (dpi.y + dpj.y) / 2;
          const elw = Math.max(50, edgeLabel.length * 6.5 + 10);
          return (
            <G key={`edge-${a.id}-${i}`}>
              <Rect x={emx - elw / 2} y={emy - 9} width={elw} height={18} rx={3} fill="rgba(255,255,255,0.9)" stroke={color} strokeWidth={0.8} />
              <SvgText x={emx} y={emy + 4} fill={color} fontSize={10} fontWeight="bold" textAnchor="middle">{edgeLabel}</SvgText>
            </G>
          );
        })}
        {/* Area label */}
        <Rect x={cx - lw / 2} y={cy - 12} width={lw} height={24} rx={4} fill="rgba(255,255,255,0.95)" stroke={color} strokeWidth={1} />
        <SvgText x={cx} y={cy + 5} fill={color} fontSize={12} fontWeight="bold" textAnchor="middle">{a.label}</SvgText>
      </G>
    );
  };

  const renderAngle = (ang: AngleMeasurement) => {
    const dp1 = toDisp(ang.p1), dv = toDisp(ang.vertex), dp2 = toDisp(ang.p2);
    const isSel = selectedMeasurement === ang.id;
    const color = isSel ? '#FF9800' : ang.color;
    const r = 25;
    const a1 = Math.atan2(dp1.y - dv.y, dp1.x - dv.x), a2 = Math.atan2(dp2.y - dv.y, dp2.x - dv.x);
    const as1 = { x: dv.x + r * Math.cos(a1), y: dv.y + r * Math.sin(a1) };
    const ae = { x: dv.x + r * Math.cos(a2), y: dv.y + r * Math.sin(a2) };
    const sweep = ((a2 - a1 + 2 * Math.PI) % (2 * Math.PI)) > Math.PI ? 0 : 1;
    const midA = (a1 + a2) / 2, lR = r + 18;
    const lp = { x: dv.x + lR * Math.cos(midA), y: dv.y + lR * Math.sin(midA) };
    const label = `${ang.angle}°`;
    return (
      <G key={ang.id}>
        <Line x1={dv.x} y1={dv.y} x2={dp1.x} y2={dp1.y} stroke={color} strokeWidth={2} />
        <Line x1={dv.x} y1={dv.y} x2={dp2.x} y2={dp2.y} stroke={color} strokeWidth={2} />
        <Path d={`M ${as1.x} ${as1.y} A ${r} ${r} 0 ${sweep} 1 ${ae.x} ${ae.y}`} stroke={color} strokeWidth={2} fill="none" />
        <Circle cx={dp1.x} cy={dp1.y} r={isSel ? 10 : 5} fill={color} stroke={isSel ? '#fff' : 'none'} strokeWidth={isSel ? 2 : 0} />
        <Circle cx={dv.x} cy={dv.y} r={isSel ? 10 : 6} fill={color} stroke={isSel ? '#fff' : 'none'} strokeWidth={isSel ? 2 : 0} />
        <Circle cx={dp2.x} cy={dp2.y} r={isSel ? 10 : 5} fill={color} stroke={isSel ? '#fff' : 'none'} strokeWidth={isSel ? 2 : 0} />
        <Rect x={lp.x - 22} y={lp.y - 10} width={44} height={20} rx={4} fill="rgba(255,255,255,0.95)" stroke={color} strokeWidth={1} />
        <SvgText x={lp.x} y={lp.y + 4} fill={color} fontSize={12} fontWeight="bold" textAnchor="middle">{label}</SvgText>
      </G>
    );
  };

  const renderComp = (comp: BuildingComponent) => {
    const dp = toDisp(comp.position);
    const ct = allComponentTypes.find(c => c.type === comp.type);
    const isSel = selectedMeasurement === comp.id;
    const color = isSel ? '#FF9800' : (ct?.color || '#666');
    return (
      <G key={comp.id}>
        <Circle cx={dp.x} cy={dp.y} r={isSel ? 24 : 20} fill="rgba(255,255,255,0.9)" stroke={color} strokeWidth={isSel ? 3 : 2} />
        <SvgText x={dp.x} y={dp.y + 6} fill={color} fontSize={18} textAnchor="middle">{ct?.emoji || '📌'}</SvgText>
        <SvgText x={dp.x} y={dp.y + 34} fill={color} fontSize={10} fontWeight="bold" textAnchor="middle">{ct?.label || comp.type}</SvgText>
      </G>
    );
  };

  const totalItems = measurements.length + areaMeasurements.length + angleMeasurements.length + buildingComponents.length;

  if (loading || !photo) {
    return <SafeAreaView style={styles.container}><View style={styles.centerContainer}><Text style={{ color: '#fff' }}>Lade...</Text></View></SafeAreaView>;
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}><Ionicons name="arrow-back" size={24} color="#fff" /></TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{photo.name}</Text>
        <TouchableOpacity onPress={saveChanges} style={styles.saveBtn}><Ionicons name="checkmark" size={24} color="#fff" /></TouchableOpacity>
      </View>

      {/* Toolbar */}
      <View style={styles.toolbar}>
        <TouchableOpacity style={[styles.toolBtn, drawMode === 'reference' && styles.toolBtnActive, !referenceScale && styles.toolBtnHighlight]}
          onPress={() => activateTool(drawMode === 'reference' ? 'none' : 'reference')}>
          <Ionicons name="resize" size={20} color={drawMode === 'reference' ? '#fff' : '#4CAF50'} />
          <Text style={[styles.toolBtnText, drawMode === 'reference' && { color: '#fff' }, { color: drawMode === 'reference' ? '#fff' : '#4CAF50' }]}>Referenz</Text>
          {referenceScale && <View style={styles.checkBadge}><Ionicons name="checkmark" size={10} color="#fff" /></View>}
        </TouchableOpacity>

        <TouchableOpacity style={[styles.toolBtn, drawMode === 'line' && styles.toolBtnActive]}
          onPress={() => activateTool(drawMode === 'line' ? 'none' : 'line')}>
          <Ionicons name="analytics" size={20} color={drawMode === 'line' ? '#fff' : '#1976d2'} />
          <Text style={[styles.toolBtnText, drawMode === 'line' && { color: '#fff' }]}>Messen</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.toolBtn, (drawMode === 'area' || drawMode === 'angle' || drawMode === 'component') && styles.toolBtnActiveOrange]}
          onPress={() => setShowToolPicker(true)}>
          <Ionicons name="construct" size={20} color={(drawMode === 'area' || drawMode === 'angle' || drawMode === 'component') ? '#fff' : '#FF6D00'} />
          <Text style={[styles.toolBtnText, (drawMode === 'area' || drawMode === 'angle' || drawMode === 'component') && { color: '#fff' }, { color: (drawMode === 'area' || drawMode === 'angle' || drawMode === 'component') ? '#fff' : '#FF6D00' }]}>Mehr</Text>
        </TouchableOpacity>

        {/* Edge length toggle */}
        {areaMeasurements.length > 0 && (
          <TouchableOpacity style={[styles.toolBtn, showEdgeLengths && { backgroundColor: '#e3f2fd', borderColor: '#2196F3' }]}
            onPress={() => setShowEdgeLengths(!showEdgeLengths)}>
            <Ionicons name={showEdgeLengths ? 'eye' : 'eye-off'} size={18} color="#2196F3" />
            <Text style={[styles.toolBtnText, { color: '#2196F3', fontSize: 11 }]}>Kanten</Text>
          </TouchableOpacity>
        )}

        {selectedMeasurement && (
          <TouchableOpacity style={[styles.toolBtn, styles.deleteTool]} onPress={deleteSelected}>
            <Ionicons name="trash-outline" size={20} color="#f44336" />
            <Text style={[styles.toolBtnText, { color: '#f44336' }]}>Löschen</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Status Bar */}
      {drawMode !== 'none' && (
        <View style={[styles.statusBar, { backgroundColor: drawMode === 'reference' ? '#e8f5e9' : drawMode === 'area' ? '#e3f2fd' : drawMode === 'angle' ? '#fce4ec' : drawMode === 'component' ? '#f3e5f5' : '#e3f2fd' }]}>
          <Ionicons name="finger-print" size={18} color={drawMode === 'reference' ? '#4CAF50' : drawMode === 'area' ? '#2196F3' : drawMode === 'angle' ? '#E91E63' : drawMode === 'component' ? '#9C27B0' : '#1976d2'} />
          <Text style={[styles.statusText, { color: drawMode === 'reference' ? '#4CAF50' : drawMode === 'area' ? '#1565C0' : drawMode === 'angle' ? '#C2185B' : drawMode === 'component' ? '#7B1FA2' : '#1976d2' }]}>
            {drawMode === 'reference' ? 'Linie ziehen für Referenzmaß' : drawMode === 'line' ? 'Linie ziehen zum Messen' : drawMode === 'area' ? `Fläche: Punkte tippen (${tapPoints.length})` : drawMode === 'angle' ? `Winkel: 3 Punkte (${tapPoints.length}/3)` : 'Bauteil: Tippe auf Position'}
          </Text>
          {drawMode === 'area' && tapPoints.length >= 3 && (
            <TouchableOpacity style={styles.closeAreaBtn} onPress={closeAreaPolygon}><Ionicons name="checkmark-done" size={16} color="#fff" /><Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>Schließen</Text></TouchableOpacity>
          )}
          {(drawMode === 'area' || drawMode === 'angle') && tapPoints.length > 0 && (
            <TouchableOpacity style={styles.undoBtn} onPress={undoLast}><Ionicons name="arrow-undo" size={16} color="#666" /></TouchableOpacity>
          )}
        </View>
      )}

      {/* Selected edit hint */}
      {selectedMeasurement && drawMode === 'none' && (
        <View style={styles.editHint}>
          <Ionicons name="move" size={16} color="#FF9800" />
          <Text style={styles.editHintText}>Punkte ziehen zum Verschieben</Text>
        </View>
      )}

      {/* Canvas */}
      <View style={styles.canvasContainer} onLayout={(e) => setContainerDimensions({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}>
        <Image source={{ uri: photo.imageUri }} style={styles.image} resizeMode="contain" />
        <View style={StyleSheet.absoluteFill}
          onStartShouldSetResponder={() => true}
          onMoveShouldSetResponder={() => true}
          onResponderGrant={handleTouchStart}
          onResponderMove={handleTouchMove}
          onResponderRelease={handleTouchEnd}
          onTouchEnd={(e) => { if (!isDraggingRef.current && !justDraggedRef.current && (drawMode === 'area' || drawMode === 'angle' || drawMode === 'component' || drawMode === 'none')) handleCanvasTap(e); }}
        >
          <Svg style={StyleSheet.absoluteFill}>
            {measurements.map(renderLine)}
            {areaMeasurements.map(renderArea)}
            {angleMeasurements.map(renderAngle)}
            {buildingComponents.map(renderComp)}

            {/* Current drawing line */}
            {currentLine && (
              <G>
                <Line x1={toDisp(currentLine.start).x} y1={toDisp(currentLine.start).y} x2={toDisp(currentLine.end).x} y2={toDisp(currentLine.end).y}
                  stroke={drawMode === 'reference' ? '#4CAF50' : '#1976d2'} strokeWidth={3} strokeDasharray="5,5" />
                <Circle cx={toDisp(currentLine.start).x} cy={toDisp(currentLine.start).y} r={8} fill={drawMode === 'reference' ? '#4CAF50' : '#1976d2'} />
                <Circle cx={toDisp(currentLine.end).x} cy={toDisp(currentLine.end).y} r={8} fill={drawMode === 'reference' ? '#4CAF50' : '#1976d2'} />
              </G>
            )}

            {/* Tap points in progress */}
            {tapPoints.map((p, i) => {
              const dp = toDisp(p); const c = drawMode === 'area' ? '#2196F3' : '#E91E63';
              return (
                <G key={`tp-${i}`}>
                  <Circle cx={dp.x} cy={dp.y} r={7} fill={c} stroke="#fff" strokeWidth={2} />
                  {i > 0 && (() => { const prev = toDisp(tapPoints[i - 1]); return <Line x1={prev.x} y1={prev.y} x2={dp.x} y2={dp.y} stroke={c} strokeWidth={2} strokeDasharray="5,3" />; })()}
                </G>
              );
            })}
            {drawMode === 'area' && tapPoints.length >= 3 && (() => { const f = toDisp(tapPoints[0]); const l = toDisp(tapPoints[tapPoints.length - 1]); return <Line x1={l.x} y1={l.y} x2={f.x} y2={f.y} stroke="#2196F3" strokeWidth={1.5} strokeDasharray="3,3" opacity={0.5} />; })()}

            {/* Crosshair at touch point */}
            {dragPos && drawMode !== 'none' && (() => {
              const dp = toDisp(dragPos);
              const mc = drawMode === 'reference' ? '#4CAF50' : drawMode === 'area' ? '#2196F3' : drawMode === 'angle' ? '#E91E63' : drawMode === 'component' ? '#9C27B0' : '#1976d2';
              return (
                <G>
                  <Line x1={dp.x - 20} y1={dp.y} x2={dp.x + 20} y2={dp.y} stroke={mc} strokeWidth={1.5} opacity={0.7} />
                  <Line x1={dp.x} y1={dp.y - 20} x2={dp.x} y2={dp.y + 20} stroke={mc} strokeWidth={1.5} opacity={0.7} />
                  <Circle cx={dp.x} cy={dp.y} r={3} fill={mc} />
                </G>
              );
            })()}
            {/* Drag preview crosshair */}
            {isDraggingRef.current && dragPos && (() => {
              const dp = toDisp(dragPos);
              return (
                <G>
                  <Line x1={dp.x - 30} y1={dp.y} x2={dp.x + 30} y2={dp.y} stroke="#FF9800" strokeWidth={1} opacity={0.5} />
                  <Line x1={dp.x} y1={dp.y - 30} x2={dp.x} y2={dp.y + 30} stroke="#FF9800" strokeWidth={1} opacity={0.5} />
                  <Circle cx={dp.x} cy={dp.y} r={4} fill="#FF9800" />
                </G>
              );
            })()}
          </Svg>
        </View>

        {/* ===== REAL MAGNIFIER LENS — zoomed image view ===== */}
        {dragPos && (drawMode !== 'none' || isDraggingRef.current) && (() => {
          const LENS_SIZE = 120;
          const ZOOM = 3;
          const dp = toDisp(dragPos);
          const imgScale = getScale();
          const dispW = imageDimensions.width * imgScale;
          const dispH = imageDimensions.height * imgScale;
          const imgOffX = (containerDimensions.width - dispW) / 2;
          const imgOffY = (containerDimensions.height - dispH) / 2;
          // Position of touch within the displayed image
          const imgTouchX = dp.x - imgOffX;
          const imgTouchY = dp.y - imgOffY;
          // Lens position: top-left corner of screen, or top-right if touch is on left
          const lensLeft = dp.x < containerDimensions.width / 2 ? containerDimensions.width - LENS_SIZE - 12 : 12;
          const lensTop = 12;
          const mc = isDraggingRef.current ? '#FF9800' : (drawMode === 'reference' ? '#4CAF50' : drawMode === 'area' ? '#2196F3' : drawMode === 'angle' ? '#E91E63' : '#1976d2');
          return (
            <View style={{
              position: 'absolute', left: lensLeft, top: lensTop,
              width: LENS_SIZE, height: LENS_SIZE, borderRadius: LENS_SIZE / 2,
              overflow: 'hidden', borderWidth: 3, borderColor: mc,
              backgroundColor: '#000',
            }} pointerEvents="none">
              <Image source={{ uri: photo.imageUri }}
                style={{
                  width: dispW * ZOOM,
                  height: dispH * ZOOM,
                  position: 'absolute',
                  left: -(imgTouchX * ZOOM) + LENS_SIZE / 2,
                  top: -(imgTouchY * ZOOM) + LENS_SIZE / 2,
                }}
                resizeMode="contain"
              />
              {/* Crosshair in center of lens */}
              <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center' }}>
                <View style={{ position: 'absolute', width: 1.5, height: LENS_SIZE, backgroundColor: mc, opacity: 0.5 }} />
                <View style={{ position: 'absolute', height: 1.5, width: LENS_SIZE, backgroundColor: mc, opacity: 0.5 }} />
                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: mc }} />
              </View>
            </View>
          );
        })()}
      </View>

      {/* Measurements List */}
      {totalItems > 0 && (
        <View style={styles.chipList}>
          <Text style={styles.chipListTitle}>{totalItems} Messung{totalItems !== 1 ? 'en' : ''}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {measurements.map(m => (
              <TouchableOpacity key={m.id} style={[styles.chip, m.type === 'reference' && styles.chipRef, selectedMeasurement === m.id && styles.chipSel]}
                onPress={() => setSelectedMeasurement(m.id === selectedMeasurement ? null : m.id)}>
                <Ionicons name={m.type === 'reference' ? 'resize' : 'analytics'} size={14} color={m.type === 'reference' ? '#4CAF50' : '#1976d2'} />
                <Text style={styles.chipText}>{m.label || formatLength(m)}</Text>
              </TouchableOpacity>
            ))}
            {areaMeasurements.map(a => (
              <TouchableOpacity key={a.id} style={[styles.chip, { borderColor: '#2196F3' }, selectedMeasurement === a.id && styles.chipSel]}
                onPress={() => setSelectedMeasurement(a.id === selectedMeasurement ? null : a.id)}>
                <Ionicons name="shapes" size={14} color="#2196F3" />
                <Text style={styles.chipText}>{a.label}</Text>
              </TouchableOpacity>
            ))}
            {angleMeasurements.map(ang => (
              <TouchableOpacity key={ang.id} style={[styles.chip, { borderColor: '#E91E63' }, selectedMeasurement === ang.id && styles.chipSel]}
                onPress={() => setSelectedMeasurement(ang.id === selectedMeasurement ? null : ang.id)}>
                <Ionicons name="analytics" size={14} color="#E91E63" />
                <Text style={styles.chipText}>{ang.angle}°</Text>
              </TouchableOpacity>
            ))}
            {buildingComponents.map(comp => {
              const ct = allComponentTypes.find(c => c.type === comp.type);
              return (
                <TouchableOpacity key={comp.id} style={[styles.chip, { borderColor: ct?.color || '#666' }, selectedMeasurement === comp.id && styles.chipSel]}
                  onPress={() => setSelectedMeasurement(comp.id === selectedMeasurement ? null : comp.id)}>
                  <Text style={{ fontSize: 14 }}>{ct?.emoji || '📌'}</Text>
                  <Text style={styles.chipText}>{ct?.label || comp.type}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* ===== TOOL PICKER ===== */}
      <Modal visible={showToolPicker} transparent animationType="fade">
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => setShowToolPicker(false)}>
          <View style={styles.pickerContent}>
            <Text style={styles.pickerTitle}>Messwerkzeug wählen</Text>
            {[
              { mode: 'area' as DrawModeType, icon: 'shapes', color: '#1976D2', bg: '#E3F2FD', title: '📊 Flächenmessung', desc: 'Punkte tippen → m² berechnen' },
              { mode: 'angle' as DrawModeType, icon: 'git-network', color: '#E91E63', bg: '#FCE4EC', title: '📐 Winkelmessung', desc: '3 Punkte → Winkel in Grad' },
              { mode: 'component' as DrawModeType, icon: 'location', color: '#9C27B0', bg: '#F3E5F5', title: '🏷️ Bauteil-Markierung', desc: 'Fenster, Türen, Heizung etc.' },
            ].map(t => (
              <TouchableOpacity key={t.mode} style={styles.pickerItem} onPress={() => activateTool(t.mode)}>
                <View style={[styles.pickerIcon, { backgroundColor: t.bg }]}><Ionicons name={t.icon as any} size={24} color={t.color} /></View>
                <View style={{ flex: 1 }}><Text style={styles.pickerItemTitle}>{t.title}</Text><Text style={styles.pickerItemDesc}>{t.desc}</Text></View>
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={[styles.pickerItem, { backgroundColor: '#f5f5f5' }]} onPress={() => setShowToolPicker(false)}>
              <View style={[styles.pickerIcon, { backgroundColor: '#eee' }]}><Ionicons name="close" size={24} color="#666" /></View>
              <Text style={[styles.pickerItemTitle, { color: '#666' }]}>Abbrechen</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ===== COMPONENT PICKER ===== */}
      <Modal visible={showComponentPicker} transparent animationType="fade">
        <View style={styles.overlay}>
          <TouchableOpacity style={StyleSheet.absoluteFill} onPress={() => { setShowComponentPicker(false); setPendingComponentPos(null); }} />
          <View style={styles.pickerContent}>
            <Text style={styles.pickerTitle}>Bauteil wählen</Text>
            <ScrollView style={{ maxHeight: 400 }}>
              {allComponentTypes.map(ct => (
                <TouchableOpacity key={ct.type} style={styles.pickerItem} onPress={() => addComponent(ct)}>
                  <View style={[styles.pickerIcon, { backgroundColor: ct.color + '20' }]}>
                    <Text style={{ fontSize: 22 }}>{ct.emoji}</Text>
                  </View>
                  <Text style={[styles.pickerItemTitle, { flex: 1 }]}>{ct.label}</Text>
                  {customComponents.find(c => c.type === ct.type) && (
                    <TouchableOpacity onPress={() => deleteCustomComponent(ct.type)} style={{ padding: 8 }}>
                      <Ionicons name="close-circle" size={20} color="#ccc" />
                    </TouchableOpacity>
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
            {/* Add custom component */}
            <TouchableOpacity style={[styles.pickerItem, { backgroundColor: '#e8f5e9', borderWidth: 1, borderColor: '#4CAF50', marginTop: 4 }]}
              onPress={() => { setShowComponentPicker(false); setTimeout(() => setShowNewComponentModal(true), 300); }}>
              <View style={[styles.pickerIcon, { backgroundColor: '#c8e6c9' }]}><Ionicons name="add" size={28} color="#4CAF50" /></View>
              <Text style={[styles.pickerItemTitle, { color: '#388E3C' }]}>Eigenes Bauteil erstellen</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ===== NEW COMPONENT MODAL ===== */}
      <Modal visible={showNewComponentModal} transparent animationType="slide">
        <KeyboardAvoidingView style={styles.overlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Eigenes Bauteil erstellen</Text>
            <Text style={styles.inputLabel}>Name</Text>
            <TextInput style={styles.modalInput} value={newCompLabel} onChangeText={setNewCompLabel} placeholder="z.B. Schornstein, Dachfenster..." autoFocus />
            <Text style={styles.inputLabel}>Symbol</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
              {EMOJI_OPTIONS.map(em => (
                <TouchableOpacity key={em} onPress={() => setNewCompEmoji(em)}
                  style={[styles.emojiBtn, newCompEmoji === em && styles.emojiBtnActive]}>
                  <Text style={{ fontSize: 24 }}>{em}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <Text style={styles.inputLabel}>Farbe</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
              {COLOR_OPTIONS.map(c => (
                <TouchableOpacity key={c} onPress={() => setNewCompColor(c)}
                  style={[styles.colorBtn, { backgroundColor: c }, newCompColor === c && styles.colorBtnActive]} />
              ))}
            </View>
            {/* Preview */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 16, gap: 8 }}>
              <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.9)', borderWidth: 2, borderColor: newCompColor, justifyContent: 'center', alignItems: 'center' }}>
                <Text style={{ fontSize: 20 }}>{newCompEmoji}</Text>
              </View>
              <Text style={{ fontSize: 14, fontWeight: '700', color: newCompColor }}>{newCompLabel || '(Name)'}</Text>
            </View>
            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => { setShowNewComponentModal(false); setNewCompLabel(''); }}>
                <Text style={styles.cancelBtnText}>Abbrechen</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.confirmBtn, { backgroundColor: '#4CAF50' }]} onPress={createCustomComponent}>
                <Text style={styles.confirmBtnText}>Erstellen</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ===== LENGTH INPUT MODAL ===== */}
      <Modal visible={showLengthModal} transparent animationType="slide">
        <KeyboardAvoidingView style={styles.overlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{pendingMeasurement?.type === 'reference' ? 'Referenzmaß eingeben' : 'Maß eingeben'}</Text>
            {pendingMeasurement?.type === 'reference' && (
              <View style={styles.infoBox}><Ionicons name="information-circle" size={18} color="#4CAF50" /><Text style={styles.infoText}>Die tatsächliche Länge eingeben. Alle weiteren Maße werden automatisch berechnet.</Text></View>
            )}
            <Text style={styles.inputLabel}>Länge</Text>
            <View style={{ flexDirection: 'row', gap: 12, marginBottom: 16 }}>
              <TextInput style={styles.bigInput} value={lengthInput} onChangeText={setLengthInput} placeholder="0" keyboardType="decimal-pad" autoFocus />
              <View style={{ gap: 4 }}>
                {(['cm', 'm'] as const).map(u => (
                  <TouchableOpacity key={u} style={[styles.unitBtn, unitInput === u && styles.unitBtnActive]} onPress={() => setUnitInput(u)}>
                    <Text style={[styles.unitBtnText, unitInput === u && { color: '#fff' }]}>{u}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            <Text style={styles.inputLabel}>Beschriftung (optional)</Text>
            <TextInput style={styles.modalInput} value={labelInput} onChangeText={setLabelInput} placeholder="z.B. Fensterbreite..." placeholderTextColor="#999" />
            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => { setShowLengthModal(false); setPendingMeasurement(null); setLengthInput(''); setLabelInput(''); }}>
                <Text style={styles.cancelBtnText}>Abbrechen</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.confirmBtn} onPress={addMeasurement}>
                <Text style={styles.confirmBtnText}>Hinzufügen</Text>
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
  backBtn: { padding: 4, minWidth: 44, minHeight: 44, justifyContent: 'center' },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: 'bold', color: '#fff', textAlign: 'center', marginHorizontal: 8 },
  saveBtn: { padding: 4, minWidth: 44, minHeight: 44, justifyContent: 'center', alignItems: 'flex-end' },
  toolbar: { flexDirection: 'row', backgroundColor: '#fff', paddingVertical: 8, paddingHorizontal: 10, gap: 6, borderBottomWidth: 1, borderBottomColor: '#e0e0e0', flexWrap: 'wrap' },
  toolBtn: { flexDirection: 'row', alignItems: 'center', paddingVertical: 7, paddingHorizontal: 10, borderRadius: 20, backgroundColor: '#f5f5f5', gap: 5, borderWidth: 1, borderColor: '#e0e0e0' },
  toolBtnActive: { backgroundColor: '#1976d2', borderColor: '#1565c0' },
  toolBtnActiveOrange: { backgroundColor: '#FF6D00', borderColor: '#E65100' },
  toolBtnHighlight: { borderColor: '#4CAF50', borderWidth: 2 },
  deleteTool: { marginLeft: 'auto', backgroundColor: '#ffebee', borderColor: '#f44336' },
  toolBtnText: { fontSize: 12, fontWeight: '600', color: '#1976d2' },
  checkBadge: { backgroundColor: '#4CAF50', borderRadius: 8, width: 16, height: 16, justifyContent: 'center', alignItems: 'center' },
  statusBar: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 14, gap: 8 },
  statusText: { fontSize: 13, fontWeight: '500', flex: 1 },
  closeAreaBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#4CAF50', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 16, gap: 4 },
  undoBtn: { padding: 6, backgroundColor: '#f0f0f0', borderRadius: 16 },
  editHint: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff3e0', paddingVertical: 6, paddingHorizontal: 14, gap: 6 },
  editHintText: { fontSize: 12, fontWeight: '600', color: '#FF9800' },
  canvasContainer: { flex: 1, backgroundColor: '#000' },
  image: { width: '100%', height: '100%' },
  chipList: { backgroundColor: '#fff', paddingVertical: 8, paddingHorizontal: 12, borderTopWidth: 1, borderTopColor: '#e0e0e0' },
  chipListTitle: { fontSize: 12, fontWeight: '600', color: '#666', marginBottom: 6 },
  chip: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f5f5f5', paddingVertical: 6, paddingHorizontal: 10, borderRadius: 16, marginRight: 8, gap: 4, borderWidth: 1, borderColor: '#e0e0e0' },
  chipRef: { backgroundColor: '#e8f5e9', borderColor: '#4CAF50' },
  chipSel: { backgroundColor: '#fff3e0', borderColor: '#FF9800' },
  chipText: { fontSize: 12, fontWeight: '500', color: '#333' },
  // Modals
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  pickerContent: { backgroundColor: '#fff', borderRadius: 16, padding: 20, width: '90%', maxWidth: 380 },
  pickerTitle: { fontSize: 18, fontWeight: '700', color: '#333', marginBottom: 16, textAlign: 'center' },
  pickerItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 8, borderRadius: 12, backgroundColor: '#f9f9f9', marginBottom: 8, gap: 12 },
  pickerIcon: { width: 44, height: 44, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  pickerItemTitle: { fontSize: 15, fontWeight: '700', color: '#333' },
  pickerItemDesc: { fontSize: 12, color: '#888', marginTop: 2 },
  modalContent: { backgroundColor: '#fff', borderRadius: 16, padding: 20, width: '100%', maxWidth: 400 },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color: '#333', marginBottom: 16, textAlign: 'center' },
  inputLabel: { fontSize: 14, fontWeight: '600', color: '#666', marginBottom: 8 },
  modalInput: { backgroundColor: '#f5f5f5', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, color: '#333', borderWidth: 1, borderColor: '#e0e0e0', marginBottom: 16 },
  bigInput: { flex: 1, backgroundColor: '#f5f5f5', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, fontSize: 24, fontWeight: 'bold', color: '#333', textAlign: 'center', borderWidth: 1, borderColor: '#e0e0e0' },
  unitBtn: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 8, backgroundColor: '#f5f5f5', borderWidth: 1, borderColor: '#e0e0e0' },
  unitBtnActive: { backgroundColor: '#1976d2', borderColor: '#1565c0' },
  unitBtnText: { fontSize: 14, fontWeight: '600', color: '#666' },
  infoBox: { flexDirection: 'row', backgroundColor: '#e8f5e9', padding: 12, borderRadius: 8, marginBottom: 16, gap: 8 },
  infoText: { flex: 1, fontSize: 13, color: '#2e7d32', lineHeight: 18 },
  modalBtns: { flexDirection: 'row', gap: 12 },
  cancelBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, backgroundColor: '#f5f5f5', alignItems: 'center' },
  cancelBtnText: { fontSize: 16, fontWeight: '600', color: '#666' },
  confirmBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, backgroundColor: '#4CAF50', alignItems: 'center' },
  confirmBtnText: { fontSize: 16, fontWeight: '600', color: '#fff' },
  emojiBtn: { width: 48, height: 48, borderRadius: 12, backgroundColor: '#f5f5f5', justifyContent: 'center', alignItems: 'center', marginRight: 8, borderWidth: 2, borderColor: '#eee' },
  emojiBtnActive: { borderColor: '#4CAF50', backgroundColor: '#e8f5e9' },
  colorBtn: { width: 36, height: 36, borderRadius: 18, borderWidth: 2, borderColor: '#ddd' },
  colorBtnActive: { borderWidth: 3, borderColor: '#333', transform: [{ scale: 1.15 }] },
});

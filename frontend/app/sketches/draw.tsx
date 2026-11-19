import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { View, Text, Alert, TextInput, Dimensions, Platform, ScrollView, BackHandler, Animated, PanResponder, Image as RNImage, useWindowDimensions, Vibration } from 'react-native';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { styles } from '../../src/styles/sketchDrawStyles';
import { usePreventRemove } from 'expo-router/react-navigation';
import Ionicons from '@react-native-vector-icons/ionicons';
import * as ImageManipulator from 'expo-image-manipulator';
import { PhotoService } from '../../services/LocalStorage';
import { getSketchLabels, DEFAULT_SKETCH_LABELS, SketchLabelSettings } from '../../services/SketchLabels';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { captureRef } from 'react-native-view-shot';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Speichereffiziente Deep-Clone-Funktion (verhindert OOM bei großen base64-Strings)
import { DrawElement, FontFamily, DrawMode, TOOL_SIZES_KEY } from '../../src/sketch/sketchShared';
import { buildPreviewSvg } from '../../src/sketch/sketchSvg';
import { parseMeasurementToMeters as parseMeasurementToMetersShared, calculatePolygonAreaM2 as calculatePolygonAreaM2Shared, computePolygon, straightenedPolygonPoints, shiftIntoBounds, PolygonAreaShapes, PolygonAreaOptions, areaShapeKey, listDiagonals } from '../../src/sketch/polygonArea';
import { AREA_FIELD_PREFIX, withPairs } from '../../src/components/sketch/AreaOptionsSection';
import { playLaserFeedback } from '../../src/utils/laserFeedback';
import { NumpadTarget } from '../../src/components/sketch/WallHeightSection';
import { PolygonWalls, WallOpening, OpeningKind, OPENING_PRESETS, openingMarkers, openingPlacement } from '../../src/sketch/wallArea';
import { OpeningInsertMenu } from '../../src/components/sketch/OpeningInsertMenu';
import { RenamePromptModal } from '../../src/components/RenamePromptModal';
import { SketchTour } from '../../src/components/SketchTour';
import { SketchDemoModal } from '../../src/components/SketchDemo';
import { renderInModalNumpadView } from '../../src/components/sketch/draw/InModalNumpad';
import { renderSketchElement } from '../../src/components/sketch/draw/renderSketchElement';
import { renderSketchTransformHandles } from '../../src/components/sketch/draw/renderTransformHandles';
import { SketchToolbar } from '../../src/components/sketch/draw/SketchToolbar';
import { ColorPickerPanel } from '../../src/components/sketch/draw/ColorPickerPanel';
import { ElementStylePanel } from '../../src/components/sketch/draw/ElementStylePanel';
import { GridSettingsPanel } from '../../src/components/sketch/draw/GridSettingsPanel';
import { CanvasInfoOverlay } from '../../src/components/sketch/draw/CanvasInfoOverlay';
import { PolylineControls } from '../../src/components/sketch/draw/PolylineControls';
import { SketchLegend } from '../../src/components/sketch/draw/SketchLegend';
import { TextModal } from '../../src/components/sketch/draw/TextModal';
import { ArrowModal } from '../../src/components/sketch/draw/ArrowModal';
import { DeleteConfirmModal } from '../../src/components/sketch/draw/DeleteConfirmModal';
import { EditArrowModal } from '../../src/components/sketch/draw/EditArrowModal';
import { PointerModal } from '../../src/components/sketch/draw/PointerModal';
import { EditPointerModal } from '../../src/components/sketch/draw/EditPointerModal';
import { MemoModal } from '../../src/components/sketch/draw/MemoModal';
import { EditMemoModal } from '../../src/components/sketch/draw/EditMemoModal';
import { LineTypePickerModal } from '../../src/components/sketch/draw/LineTypePickerModal';
import { EditPolygonModal } from '../../src/components/sketch/draw/EditPolygonModal';
import { EditTextModal } from '../../src/components/sketch/draw/EditTextModal';
import { NotesModal } from '../../src/components/sketch/draw/NotesModal';
import { ProjectPhotosModal } from '../../src/components/sketch/draw/ProjectPhotosModal';
import { CropModal } from '../../src/components/sketch/draw/CropModal';
import { MagnifierOverlay } from '../../src/components/sketch/draw/MagnifierOverlay';
import { ProtractorOverlay } from '../../src/components/sketch/draw/ProtractorOverlay';
import { undoLastLineMeasurementImpl, addMeasurementToSelectedLineImpl, removeMeasurementFromSelectedLineImpl } from '../../src/sketch/editor/lineMeasurements';
import { fitImageToCanvasImpl, insertProjectPhotoImpl, applyCropImpl, insertImageImpl, importFromFilesImpl, insertImageFromUriImpl, takePhotoAndInsertImpl } from '../../src/sketch/editor/images';
import { handleCropModeTouchImpl, onTouchStartImpl, handleAddPointTouchImpl, handleRemovePointTouchImpl, onTouchMoveImpl, onTouchEndImpl, createTempElementImpl, snapPointToAngleImpl, handleSelectTouchStartImpl, handleSelectTouchMoveImpl } from '../../src/sketch/editor/touchHandlers';
import { buildSmoothPathImpl, findNearestPolylinePointImpl, findLineNumberAtPointImpl, getCropHandleAtPositionImpl, getClosestPointOnSegmentImpl, findPolylineLabelAtPointImpl, findElementAtPointImpl, distanceToLineSegmentImpl, findPolylineSegmentAtPointImpl, checkTransformHandlesImpl } from '../../src/sketch/editor/hitTest';
import { performAutoSaveImpl, loadSketchImpl, handleBackPressImpl, saveSketchImpl } from '../../src/sketch/editor/persistence';
import { LineMeasurePanel } from '../../src/components/sketch/draw/LineMeasurePanel';
import { handleProtractorDragStartImpl, handleProtractorDragMoveImpl, addProtractorToSketchImpl, recalculateAngleGroupImpl, getAngleGroupGeometryImpl } from '../../src/sketch/editor/protractor';
import { deleteSelectedElementImpl, finishPolylineImpl, addTextElementImpl, addPointerElementImpl, updatePointerElementImpl, addMemoElementImpl, updateMemoElementImpl } from '../../src/sketch/editor/elementActions';
import { SavingOverlay } from '../../src/components/sketch/draw/SavingOverlay';
import { SketchHeader } from '../../src/components/sketch/draw/SketchHeader';
import Svg, { Path, Line, Circle, Rect, Image as SvgImage, Text as SvgText, G, Defs, Pattern } from 'react-native-svg';
// API_URL removed - using local storage now
const { width, height } = Dimensions.get('window');


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
  // Workaround RN-SVG Fabric-Bug (SDK 57/RN 0.86): SVG-Canvas invalidiert auf iOS/Android
  // nicht zuverlässig bei Prop-Updates. Ein pro Render neu gemountetes unsichtbares
  // Element erzwingt eine native Mount-Mutation → Canvas zeichnet neu.
  const fabricInvalidateTick = useRef(0);
  // Linien-Pfeiltyp: none = normale Linie, end = Pfeil →, both = Doppelpfeil ↔
  const [lineArrowType, setLineArrowType] = useState<'none' | 'end' | 'both'>('none');
  const [showLineTypePicker, setShowLineTypePicker] = useState(false);
  const [drawColor, setDrawColor] = useState('#FF0000');
  const [strokeWidth, setStrokeWidth] = useState(1);
  const [loading, setLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false); // Schutz vor Doppelklicks beim Speichern
  
  // Drawing state
  const [currentPath, setCurrentPath] = useState('');
  // Ref für flüssigeres Zeichnen - speichert Pfaddaten ohne Re-Render
  const currentPathRef = useRef<string>('');
  // Rohpunkte des aktuellen Stift-Strichs - Basis für geglättete Kurven (Eingabestift)
  const currentPenPointsRef = useRef<{ x: number; y: number }[]>([]);
  const [startPoint, setStartPoint] = useState<{ x: number; y: number } | null>(null);
  const [tempElement, setTempElement] = useState<DrawElement | null>(null);
  // Flüssiges Zeichnen: Während ein Strich/eine Form entsteht, bleibt die Haupt-Zeichenfläche
  // stehen (kein Neuaufbau pro Bewegung). Nur die kleine Live-Ebene wird aktualisiert.
  const isLiveDrawing = !!tempElement || (currentPath.length > 0 && (drawMode === 'pen' || drawMode === 'polygon'));
  const mainCanvasKeyRef = useRef(0);
  const mainSvgCacheRef = useRef<React.ReactElement | null>(null);
  const mainSvgCacheElementsRef = useRef<DrawElement[] | null>(null);
  // Grundriss benennen (z. B. „Wohnzimmer“) – Name erscheint in Übersicht und Projekt-PDF
  const [renamePolyline, setRenamePolyline] = useState<{ id: string; name: string } | null>(null);
  if (!isLiveDrawing) mainCanvasKeyRef.current++;
  const mainCanvasKey = mainCanvasKeyRef.current;
  
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
  // ScrollView Content-Offset für korrekte Koordinatenberechnung beim Zeichnen
  const [scrollOffset, setScrollOffset] = useState({ x: 0, y: 0 });
  // Zoom-Modus: manuell gesteuert über Lupe-Button
  const [zoomMode, setZoomMode] = useState(true); // Standard: Zoom erlaubt
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
  
  // Refs für Crop-Interaktion (verwende Refs statt State für bessere Performance)
  const cropContainerRef = useRef<View>(null);
  const cropBoxRef = useRef({ x: 50, y: 50, width: 200, height: 200 }); // Sync mit cropBox
  const activeCropHandle = useRef<string | null>(null);
  const cropStartPos = useRef({ x: 0, y: 0 });
  const cropStartBox = useRef({ x: 50, y: 50, width: 200, height: 200 });
  
  // Halte cropBoxRef synchron mit cropBox State
  useEffect(() => {
    cropBoxRef.current = cropBox;
  }, [cropBox]);
  
  // Helper-Funktion: Wechselt den Zeichenmodus
  // Zoom bleibt erhalten, aber scrollEnabled wird deaktiviert damit Zeichnen funktioniert
  // PhotoEditMode wird automatisch deaktiviert wenn ein anderes Werkzeug gewählt wird
  const selectDrawMode = (mode: DrawMode) => {
    setDrawMode(mode);
    // Linien-Typ-Picker schließen wenn nicht Linie gewählt
    if (mode !== 'line') {
      setShowLineTypePicker(false);
    }
    // PhotoEditMode deaktivieren wenn anderes Werkzeug gewählt wird
    if (photoEditMode) {
      setPhotoEditMode(false);
      // Auch die Auswahl aufheben, damit die grünen Handles verschwinden
      setSelectedElementId(null);
    }
    // Zoom-Modus ausschalten damit Zeichnen/Bearbeiten funktioniert
    // aber den aktuellen Zoom-Level beibehalten!
    setZoomMode(false);
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

  // Geglätteter Pfad für Stift-Striche: Quadratische Bézier-Kurven durch die
  // Mittelpunkte der Rohpunkte -> deutlich flüssigeres Schriftbild mit dem Eingabestift
  const buildSmoothPath = (pts: { x: number; y: number }[]): string => buildSmoothPathImpl(pts);

  // Bildgröße ermitteln: Android kann RNImage.getSize nicht auf data:-URIs anwenden
  // ("Unsupported uri scheme for encoded image fetch") -> Fallback über ImageManipulator,
  // der base64-Bilder auf allen Plattformen laden kann und die echten Maße liefert.
  const getImageSize = (uri: string): Promise<{ width: number; height: number }> =>
    new Promise((resolve, reject) => {
      RNImage.getSize(
        uri,
        (w, h) => resolve({ width: w, height: h }),
        async () => {
          try {
            const info = await ImageManipulator.manipulateAsync(uri, [], { compress: 1 });
            resolve({ width: info.width, height: info.height });
          } catch (e) {
            reject(e);
          }
        }
      );
    });

  // Eingefügte Bilder an die sichtbare Skizzenfläche anpassen, damit nichts über den Rand ragt
  const fitImageToCanvas = (imgW: number, imgH: number, maxW = 400, maxH = 300) => fitImageToCanvasImpl({
    screenWidth, canvasHeight,
  }, imgW, imgH, maxW, maxH);

  // Funktion um ein Projektfoto als Bild-Element einzufügen
  const insertProjectPhoto = (photo: any) => insertProjectPhotoImpl({
    t, getImageSize, fitImageToCanvas, generateId, elements, addToHistory,
    setElements, setSelectedElementId, setShowProjectPhotosModal, setPhotoEditMode, selectDrawMode,
  }, photo);
  
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
  // Polygon-Flächenanzeige (m²) pro Element ein-/ausschaltbar
  const [polygonAreaVisible, setPolygonAreaVisible] = useState<{ [elementId: string]: boolean }>({});
  const [showDemo, setShowDemo] = useState(false);
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
  const isMountedRef = useRef(true);
  
  // Cleanup beim Unmount - verhindert Crashes durch State-Updates nach Navigation
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
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

  const currentSketchIdRef = useRef<string | undefined>(sketchId);
  
  // Update ref whenever sketchId changes
  useEffect(() => {
    currentSketchIdRef.current = sketchId;
  }, [sketchId]);
  
  // PDF-Größe für Export
  const [pdfSize, setPdfSize] = useState<string>('large');
  
  // Polyline Label Offsets - Position relativ zum Zentrum (für Verschiebbarkeit)
  const [labelOffsets, setLabelOffsets] = useState<{ [elementId: string]: { x: number; y: number } }>({});
  // Eingefrorene Polygon-Form für die Flächenberechnung: wird nur neu übernommen, wenn sich
  // ein Linien-Maß oder die Punktanzahl ändert – Punkte verschieben ändert die Fläche nicht
  const [polygonAreaShapes, setPolygonAreaShapes] = useState<PolygonAreaShapes>({});
  // Zusatzangaben je Polygon: alle Ecken rechtwinklig / Diagonale
  const [polygonAreaOptions, setPolygonAreaOptions] = useState<PolygonAreaOptions>({});
  useEffect(() => {
    setPolygonAreaShapes(prev => {
      let changed = false;
      const next: PolygonAreaShapes = {};
      elements.forEach(el => {
        if (el.type !== 'polyline' || !el.data?.closed || !el.data.points) return;
        const key = areaShapeKey(el.data.points.length, lineSegmentMeasurements[el.id]);
        if (prev[el.id]?.key === key) {
          next[el.id] = prev[el.id];
        } else {
          next[el.id] = { points: el.data.points.map((p: { x: number; y: number }) => ({ x: p.x, y: p.y })), key };
          changed = true;
        }
      });
      return changed || Object.keys(prev).length !== Object.keys(next).length ? next : prev;
    });
  }, [elements, lineSegmentMeasurements]);
  // Wandhöhen/Abzüge pro Polygon (für Wandflächen)
  const [polygonWalls, setPolygonWalls] = useState<PolygonWalls>({});
  // Nach dem Teilen/Löschen von Punkten passen die Linien-Nummern nicht mehr: Angaben pro Linie verwerfen
  const clearWallSegments = (elementId: string) => {
    setPolygonWalls(prev => (prev[elementId]?.segments ? { ...prev, [elementId]: { height: prev[elementId].height } } : prev));
    // Diagonalen gehören zu bestimmten Ecken und passen danach ebenfalls nicht mehr
    setPolygonAreaOptions(prev => (prev[elementId] ? { ...prev, [elementId]: { rightAngles: prev[elementId].rightAngles } } : prev));
  };
  // State für aktives Label-Ziehen
  const [draggingLabelId, setDraggingLabelId] = useState<string | null>(null);
  const labelDragStartRef = useRef<{ x: number; y: number; offsetX: number; offsetY: number }>({ x: 0, y: 0, offsetX: 0, offsetY: 0 });
  
  // Lupen-Feature für präzises Positionieren von Handles
  const [showMagnifier, setShowMagnifier] = useState(false);
  const [magnifierPosition, setMagnifierPosition] = useState<{ x: number; y: number } | null>(null);
  const [magnifierTargetPosition, setMagnifierTargetPosition] = useState<{ x: number; y: number } | null>(null);
  const [magnifierSnapshot, setMagnifierSnapshot] = useState<string | null>(null);
  
  
  // Winkelmesser-Tool state - NEU: Bildschirmkoordinaten-basiert
  const [showProtractor, setShowProtractor] = useState(false);
  const [showProtractorHint, setShowProtractorHint] = useState(false);
  const [showProtractorAngleInput, setShowProtractorAngleInput] = useState(false);
  const [protractorAngleInput, setProtractorAngleInput] = useState('0');
  const [protractorUseComplementary, setProtractorUseComplementary] = useState(false);
  const [protractorDrawSize, setProtractorDrawSize] = useState(60);
  const protractorCanvasSnapshot = useRef<string | null>(null); // Canvas-Snapshot VOR Protractor-Overlay
  
  // Bildschirmkoordinaten der drei Punkte
  const [protractorCenter, setProtractorCenter] = useState({ x: 0, y: 0 });
  const [protractorRefEnd, setProtractorRefEnd] = useState({ x: 0, y: 0 });
  const [protractorAngleEnd, setProtractorAngleEnd] = useState({ x: 0, y: 0 });
  
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
      const cx = screenWidth / 2;
      const cy = Math.max(200, canvasHeight / 2 + 60); // unterhalb der Toolbar
      const defaultLen = Math.min(screenWidth * 0.3, 150);
      // Nur initialisieren wenn Center bei (0,0) ist (= komplett neuer Winkelmesser)
      if (protractorCenter.x === 0 && protractorCenter.y === 0) {
        setProtractorCenter({ x: cx, y: cy });
        setProtractorRefEnd({ x: cx + defaultLen, y: cy });
        setProtractorAngleEnd({ x: cx + defaultLen * Math.cos(-Math.PI/4), y: cy + defaultLen * Math.sin(-Math.PI/4) }); // 45° nach oben
        setShowProtractorHint(true); // Hinweis nur bei neuem Winkelmesser
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
  const handleProtractorDragStart = useCallback((e: any) => handleProtractorDragStartImpl({
    protractorRefEnd, protractorAngleEnd, protractorCenter, canvasLayoutRef, setCanvasLayout,
    scaleRef, setMagnifierTargetPosition, setMagnifierPosition, protractorCanvasSnapshot,
    backgroundImage, elements, setMagnifierSnapshot, setShowMagnifier, canvasRef, canvasLayout,
    canvasOverhead, screenWidth, canvasHeight, protractorDragRef,
  }, e), [protractorCenter, protractorRefEnd, protractorAngleEnd, canvasLayout]);
  
  // Drag Move - Position direkt aktualisieren
  const handleProtractorDragMove = useCallback((e: any) => handleProtractorDragMoveImpl({
    protractorDragRef, setProtractorCenter, setProtractorRefEnd, setProtractorAngleEnd,
    canvasLayoutRef, scaleRef, setMagnifierTargetPosition, setMagnifierPosition,
  }, e), [canvasLayout]);
  
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
  
  // Bemaßungspfeil-Dialog: Zusatz-Einstellungen einklappbar
  const [arrowOptionsOpen, setArrowOptionsOpen] = useState(false);
  useEffect(() => {
    AsyncStorage.getItem('aufmassprofi_arrow_options_open').then(saved => setArrowOptionsOpen(saved === '1'));
  }, []);
  const changeArrowOptionsOpen = (open: boolean) => {
    setArrowOptionsOpen(open);
    AsyncStorage.setItem('aufmassprofi_arrow_options_open', open ? '1' : '0');
  };
  // Bemaßungspfeil nach einer Laser-Übertragung sofort übernehmen (auf Wunsch)
  const [arrowAutoAdd, setArrowAutoAdd] = useState(false);
  useEffect(() => {
    AsyncStorage.getItem('aufmassprofi_arrow_auto_add').then(saved => setArrowAutoAdd(saved === '1'));
  }, []);
  const changeArrowAutoAdd = (enabled: boolean) => {
    setArrowAutoAdd(enabled);
    AsyncStorage.setItem('aufmassprofi_arrow_auto_add', enabled ? '1' : '0');
  };

  // Linien-Maß (Polygon): Laser-Messwert sofort übernehmen / danach nächste Linie auswählen
  const [lineAutoAdd, setLineAutoAdd] = useState(false);
  const [lineAutoNext, setLineAutoNext] = useState(false);
  useEffect(() => {
    AsyncStorage.getItem('aufmassprofi_line_auto_add').then(saved => setLineAutoAdd(saved === '1'));
    AsyncStorage.getItem('aufmassprofi_line_auto_next').then(saved => setLineAutoNext(saved === '1'));
  }, []);
  const changeLineAutoAdd = (enabled: boolean) => {
    setLineAutoAdd(enabled);
    AsyncStorage.setItem('aufmassprofi_line_auto_add', enabled ? '1' : '0');
  };
  // Ton/Vibration bei empfangenem Laser-Messwert (ein-/ausschaltbar)
  const [laserSound, setLaserSound] = useState(false);
  useEffect(() => {
    AsyncStorage.getItem('aufmassprofi_laser_sound').then(saved => setLaserSound(saved === '1'));
  }, []);
  const changeLaserSound = (enabled: boolean) => {
    setLaserSound(enabled);
    AsyncStorage.setItem('aufmassprofi_laser_sound', enabled ? '1' : '0');
    if (enabled) playLaserFeedback();
  };
  // Zuletzt übernommene Linien-Maße (für „Zurück“), mit dem vorherigen Wert
  const [lineMeasureHistory, setLineMeasureHistory] = useState<{ elementId: string; segmentIndex: number; previous?: string }[]>([]);
  const undoLastLineMeasurement = () => undoLastLineMeasurementImpl({
    lineMeasureHistory, elements, setLineMeasureHistory, setLineSegmentMeasurements,
    setLineMeasurementExpression, setSelectedLineSegment, setShowLineMeasurementNumpad,
    lineMeasurementInputRef,
  });

  // Maß-Fenster: Optionen und Tastatur einklappbar (nur Eingabefeld + Knöpfe bleiben)
  const [panelOptionsOpen, setPanelOptionsOpen] = useState(false);
  const [panelKeyboardOpen, setPanelKeyboardOpen] = useState(true);
  const [wallSectionOpen, setWallSectionOpen] = useState(false);
  useEffect(() => {
    AsyncStorage.getItem('aufmassprofi_panel_options_open').then(saved => setPanelOptionsOpen(saved === '1'));
    AsyncStorage.getItem('aufmassprofi_panel_keyboard_open').then(saved => setPanelKeyboardOpen(saved !== '0'));
  }, []);
  const changePanelOptionsOpen = (open: boolean) => {
    setPanelOptionsOpen(open);
    AsyncStorage.setItem('aufmassprofi_panel_options_open', open ? '1' : '0');
  };
  const changePanelKeyboardOpen = (open: boolean) => {
    setPanelKeyboardOpen(open);
    AsyncStorage.setItem('aufmassprofi_panel_keyboard_open', open ? '1' : '0');
  };
  // Ziel des Numpads: Wand-/Öffnungsfeld, sonst das Maß-Feld
  const numpadTargetRef = useRef<NumpadTarget | null>(null);
  const [numpadTargetId, setNumpadTargetId] = useState<string | null>(null);
  const clearNumpadTarget = () => {
    numpadTargetRef.current = null;
    setNumpadTargetId(null);
  };
  const [measureKeyboardHeight, setMeasureKeyboardHeight] = useState(0);
  const numpadTargetLabel = (id: string) => {
    if (id.startsWith(AREA_FIELD_PREFIX)) return numpadTargetRef.current?.label || 'Eingabe';
    const opening = id.match(/^wall-opening-(width|height|offset)-(\d+)$/);
    if (opening) return `Öffnung ${parseInt(opening[2], 10) + 1} ${{ width: 'Breite', height: 'Höhe', offset: 'Abstand' }[opening[1] as 'width' | 'height' | 'offset']}`;
    return ({ 'wall-height-all': 'Höhe alle Linien', 'wall-height-line': 'Höhe diese Linie', 'wall-deduction-line': 'Weiterer Abzug' } as { [key: string]: string })[id] || 'Eingabe';
  };
  const numpadTargetValue = (id: string): string => {
    if (!selectedLineSegment) return '';
    if (id.startsWith('area-angle-')) return polygonAreaOptions[selectedLineSegment.elementId]?.angles?.[parseInt(id.slice(11), 10)] || '';
    if (id.startsWith('area-diag-')) {
      const [i, j] = id.slice(10).split('-').map(Number);
      const polygon = elements.find(e => e.id === selectedLineSegment.elementId);
      return listDiagonals(polygonAreaOptions[selectedLineSegment.elementId], polygon?.data?.points?.length || 0).find(d => d.i === i && d.j === j)?.value || '';
    }
    const wall = polygonWalls[selectedLineSegment.elementId];
    const segment = wall?.segments?.[selectedLineSegment.segmentIndex];
    const opening = id.match(/^wall-opening-(width|height|offset)-(\d+)$/);
    if (opening) return segment?.openings?.[parseInt(opening[2], 10)]?.[opening[1] as 'width' | 'height' | 'offset'] || '';
    if (id === 'wall-height-all') return wall?.height || '';
    if (id === 'wall-height-line') return segment?.height || '';
    return segment?.deduction || '';
  };
  const typeIntoPanelField = (update: (prev: string) => string) => {
    const target = numpadTargetRef.current;
    if (target) target.set(update(target.get()));
    else setLineMeasurementExpression(update);
  };
  // Feld im Flächen-Bereich, das nach dem Öffnen des Maß-Fensters ausgewählt werden soll
  const [pendingAreaField, setPendingAreaField] = useState<string | null>(null);
  useEffect(() => {
    if (!pendingAreaField) clearNumpadTarget();
  }, [selectedLineSegment?.elementId, selectedLineSegment?.segmentIndex, showLineMeasurementNumpad]);
  // „Skizze geraderücken“: Eckpunkte des Polygons auf die berechnete Form setzen (rückgängig machbar)
  const straightenPolygon = (elementId: string, points: { x: number; y: number }[]) => {
    // Ragt der Raum danach über den Rand, rutscht er zurück in die Zeichenfläche
    const inside = shiftIntoBounds(points, screenWidth, canvasHeight);
    const newElements = elements.map(el => el.id === elementId && el.data?.points?.length === points.length
      ? { ...el, data: { ...el.data, points: inside } }
      : el);
    setElements(newElements);
    addToHistory(newElements);
  };
  // Alle eindeutig bestimmten Räume in einem Schritt geraderücken (ein Rückgängig-Schritt)
  const straightenAllPolygons = () => {
    let count = 0;
    const newElements = elements.map(el => {
      if (el.type !== 'polyline' || !el.data?.closed) return el;
      const points = straightenedPolygonPoints(el, lineSegmentMeasurements, polygonAreaShapes[el.id]?.points, polygonAreaOptions[el.id],
        selectedLineSegment?.elementId === el.id ? selectedLineSegment.segmentIndex : undefined);
      if (!points) return el;
      count++;
      return { ...el, data: { ...el.data, points: shiftIntoBounds(points, screenWidth, canvasHeight) } };
    });
    if (count === 0) {
      showAlert('Geraderücken', 'Kein Raum zu ändern: Räume müssen eindeutig bestimmt sein (alle Seiten und genug Winkel oder Diagonalen) und von der Zeichnung abweichen.');
      return;
    }
    setElements(newElements);
    addToHistory(newElements);
    showAlert('Geraderücken', count === 1 ? '1 Raum wurde geradegerückt.' : `${count} Räume wurden geradegerückt.`);
  };
  // Nach dem Verschieben einer Ecke: Ist der Raum noch nicht durch Winkel/Diagonalen bestimmt,
  // wird die Diagonale ab der verschobenen Ecke angelegt und ihr Eingabefeld ausgewählt
  const autoDiagonalAfterPointMove = (element: DrawElement, pointIndex: number): boolean => {
    const n = element.data?.points?.length || 0;
    const option = polygonAreaOptions[element.id];
    if (!element.data?.closed || n < 4 || option?.rightAngles) return false;
    const result = computePolygon(element, lineSegmentMeasurements, undefined, option);
    if (!result || result.extras >= n - 3) return false;
    const existing = listDiagonals(option, n);
    let pick = existing.find(d => !d.value.trim());
    for (let step = 2; !pick && step <= n - 2; step++) {
      const other = (pointIndex + step) % n;
      const i = Math.min(pointIndex, other);
      const j = Math.max(pointIndex, other);
      if (!existing.some(d => d.i === i && d.j === j)) pick = { i, j, value: '' };
    }
    if (!pick) return false;
    const { i, j } = pick;
    setPolygonAreaOptions(prev => ({
      ...prev,
      [element.id]: withPairs(prev[element.id], n, pairs => { if (pairs[`${i}-${j}`] === undefined) pairs[`${i}-${j}`] = ''; }),
    }));
    changePanelOptionsOpen(true);
    setPendingAreaField(`${AREA_FIELD_PREFIX}diag-${i}-${j}`);
    return true;
  };

  // Bearbeiten-Unterpunkt „Punkte verschieben“: nur Eckpunkte greifen (großzügige Trefferfläche),
  // das Maß-Fenster öffnet sich dabei nicht
  const [pointMoveOnly, setPointMoveOnly] = useState(false);
  const findNearestPolylinePoint = (x: number, y: number): { element: DrawElement; pointIndex: number } | null => findNearestPolylinePointImpl({
    scale, elements,
  }, x, y);

  // Linien-Nummern der Polygone ein-/ausblenden (Skizze und gespeichertes Skizzenbild)
  const [lineNumbersVisible, setLineNumbersVisible] = useState(true);
  useEffect(() => {
    AsyncStorage.getItem('aufmassprofi_line_numbers_visible').then(saved => setLineNumbersVisible(saved !== '0'));
  }, []);
  const changeLineNumbersVisible = (visible: boolean) => {
    setLineNumbersVisible(visible);
    AsyncStorage.setItem('aufmassprofi_line_numbers_visible', visible ? '1' : '0');
  };

  // Diagonale durch Antippen zweier Ecken wählen
  const [diagonalPick, setDiagonalPick] = useState<{ elementId: string; first: number | null } | null>(null);
  // Tür/Fenster-Markierung in der Skizze angetippt: Linie wählen, Wand-Bereich aufklappen, Breite-Feld auswählen
  const replaceOnNextKeyRef = useRef<string | null>(null);
  // Abstand-Feld gewählt: Der (meist berechnete) Wert wird mit der ersten Ziffer ersetzt statt verlängert
  useEffect(() => {
    if (numpadTargetId?.startsWith('wall-opening-offset-')) replaceOnNextKeyRef.current = numpadTargetId;
  }, [numpadTargetId]);
  const findOpeningAt = (x: number, y: number) => {
    const tolerance = Math.max(12, 16 / Math.max(scale, 0.5));
    for (const el of elements) {
      if (el.type !== 'polyline' || !el.data?.points || !polygonWalls[el.id]?.segments) continue;
      for (const marker of openingMarkers(el.data.points, !!el.data.closed, lineSegmentMeasurements[el.id], polygonWalls[el.id])) {
        const dx = marker.x2 - marker.x1;
        const dy = marker.y2 - marker.y1;
        const t = Math.max(0, Math.min(1, ((x - marker.x1) * dx + (y - marker.y1) * dy) / (dx * dx + dy * dy || 1)));
        const onLine = Math.hypot(x - (marker.x1 + dx * t), y - (marker.y1 + dy * t)) <= tolerance;
        const onLabel = Math.abs(x - marker.labelX) <= 32 && Math.abs(y - marker.labelY) <= 10;
        if (onLine || onLabel) return { element: el, marker };
      }
    }
    return null;
  };
  // Linie wählen, Maß-Fenster + Wand-Bereich öffnen und das Breite-Feld der Öffnung auswählen
  const openOpeningEditor = (elementId: string, segmentIndex: number, openingIndex: number) => {
    setSelectedElementId(elementId);
    setSelectedLineSegment({ elementId, segmentIndex });
    const existingStyle = measureLineStyles[elementId];
    setTempMeasureLineColor(existingStyle?.color || '#1976d2');
    setTempMeasureLineStrokeWidth(existingStyle?.strokeWidth || 1.2);
    setTempMeasureLineFontSize(existingStyle?.fontSize || 11);
    setLineMeasurementExpression('');
    setShowLineMeasurementNumpad(true);
    changePanelOptionsOpen(true);
    setWallSectionOpen(true);
    setPendingAreaField(`wall-opening-width-${openingIndex}`);
    replaceOnNextKeyRef.current = `wall-opening-width-${openingIndex}`;
  };
  // Anteil (0..1) einer Stelle entlang einer Linie des Polygons
  const fractionOnSegment = (element: DrawElement, segmentIndex: number, x: number, y: number) => {
    const points = element.data.points;
    const p1 = points[segmentIndex];
    const p2 = points[(segmentIndex + 1) % points.length];
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    return Math.max(0, Math.min(1, ((x - p1.x) * dx + (y - p1.y) * dy) / (dx * dx + dy * dy || 1)));
  };
  const updateOpenings = (elementId: string, segmentIndex: number, update: (openings: WallOpening[]) => WallOpening[]) =>
    setPolygonWalls(prev => {
      const wall = prev[elementId] || {};
      const segment = wall.segments?.[segmentIndex] || {};
      return { ...prev, [elementId]: { ...wall, segments: { ...wall.segments, [segmentIndex]: { ...segment, openings: update(segment.openings || []) } } } };
    });
  // Öffnung auf der Linie ziehen: Berührung beginnt auf der Markierung; ohne Bewegung zählt es als Antippen
  const openingDragRef = useRef<{ elementId: string; segmentIndex: number; openingIndex: number; startX: number; startY: number; moved: boolean } | null>(null);
  // Langer Druck auf eine Linie: Tür/Fenster an dieser Stelle einfügen
  const openingLongPressRef = useRef<{ timer: ReturnType<typeof setTimeout>; x: number; y: number } | null>(null);
  const [openingInsert, setOpeningInsert] = useState<{ elementId: string; segmentIndex: number; fraction: number } | null>(null);
  // Öffnung, die gerade gezogen wird (für die Maßkette in der Skizze)
  const [openingDrag, setOpeningDrag] = useState<{ elementId: string; segmentIndex: number; openingIndex: number } | null>(null);
  const cancelOpeningLongPress = () => {
    if (openingLongPressRef.current) clearTimeout(openingLongPressRef.current.timer);
    openingLongPressRef.current = null;
  };
  const startOpeningLongPress = (element: DrawElement, segmentIndex: number, x: number, y: number) => {
    cancelOpeningLongPress();
    const fraction = fractionOnSegment(element, segmentIndex, x, y);
    const timer = setTimeout(() => {
      openingLongPressRef.current = null;
      if (Platform.OS !== 'web') Vibration.vibrate(30);
      setOpeningInsert({ elementId: element.id, segmentIndex, fraction });
    }, 600);
    openingLongPressRef.current = { timer, x, y };
  };
  const insertOpening = (kind: OpeningKind) => {
    if (!openingInsert) return;
    const { elementId, segmentIndex, fraction } = openingInsert;
    const preset: WallOpening = OPENING_PRESETS.find(p => p.id === kind)?.opening || { width: '', height: '', kind };
    const existing = polygonWalls[elementId]?.segments?.[segmentIndex]?.openings || [];
    const opening = { ...preset, ...openingPlacement(fraction, lineSegmentMeasurements[elementId]?.[segmentIndex], preset, existing) };
    const index = existing.length;
    updateOpenings(elementId, segmentIndex, openings => [...openings, opening]);
    setOpeningInsert(null);
    openOpeningEditor(elementId, segmentIndex, index);
    // Nach dem Schließen der Auswahl erneut wählen (das Schließen kann den Fokus zurück ins Maß-Feld legen)
    setTimeout(() => setPendingAreaField(`wall-opening-width-${index}`), 350);
  };
  // Öffnung kopieren: nach „Auf andere Linie kopieren“ wählt der nächste Tipp auf eine Raumlinie das Ziel
  const [openingCopy, setOpeningCopy] = useState<{ elementId: string; segmentIndex: number; openingIndex: number; opening: WallOpening } | null>(null);
  useEffect(() => {
    if (!showLineMeasurementNumpad) setOpeningCopy(null);
  }, [showLineMeasurementNumpad]);
  const handleOpeningCopyTap = (x: number, y: number): boolean => {
    if (!openingCopy) return false;
    const hit = findPolylineSegmentAtPoint(x, y);
    if (!hit) return true; // daneben getippt: Auswahl bleibt aktiv
    const existing = polygonWalls[hit.element.id]?.segments?.[hit.segmentIndex]?.openings || [];
    const { offset: _offset, position: _position, ...size } = openingCopy.opening;
    const fraction = fractionOnSegment(hit.element, hit.segmentIndex, x, y);
    const copy = { ...size, ...openingPlacement(fraction, lineSegmentMeasurements[hit.element.id]?.[hit.segmentIndex], size, existing) };
    updateOpenings(hit.element.id, hit.segmentIndex, openings => [...openings, copy]);
    setOpeningCopy(null);
    openOpeningEditor(hit.element.id, hit.segmentIndex, existing.length);
    return true;
  };
  const handleOpeningTap = (x: number, y: number): boolean => {
    if (handleOpeningCopyTap(x, y)) return true;
    if (pointMoveOnly) return false;
    const hit = findOpeningAt(x, y);
    if (!hit) return false;
    openingDragRef.current = { elementId: hit.element.id, segmentIndex: hit.marker.segmentIndex, openingIndex: hit.marker.openingIndex, startX: x, startY: y, moved: false };
    return true;
  };
  const handleOpeningDragMove = (x: number, y: number): boolean => {
    const press = openingLongPressRef.current;
    if (press && Math.hypot(x - press.x, y - press.y) > 8) cancelOpeningLongPress();
    const drag = openingDragRef.current;
    if (!drag) return false;
    if (!drag.moved && Math.hypot(x - drag.startX, y - drag.startY) < 6) return true;
    if (!drag.moved) setOpeningDrag({ elementId: drag.elementId, segmentIndex: drag.segmentIndex, openingIndex: drag.openingIndex });
    drag.moved = true;
    const element = elements.find(el => el.id === drag.elementId);
    if (!element) return true;
    const fraction = fractionOnSegment(element, drag.segmentIndex, x, y);
    const measure = lineSegmentMeasurements[drag.elementId]?.[drag.segmentIndex];
    updateOpenings(drag.elementId, drag.segmentIndex, openings => openings.map((o, i) => (i === drag.openingIndex
      ? { ...o, ...openingPlacement(fraction, measure, o, openings.filter((_, other) => other !== drag.openingIndex)) }
      : o)));
    return true;
  };
  const handleOpeningDragEnd = (): boolean => {
    cancelOpeningLongPress();
    const drag = openingDragRef.current;
    if (!drag) return false;
    openingDragRef.current = null;
    setOpeningDrag(null);
    if (!drag.moved) openOpeningEditor(drag.elementId, drag.segmentIndex, drag.openingIndex);
    return true;
  };
  // Maß-Fenster offen und „Winkel angeben“ an: Ecke des Raums antippen wählt das passende Winkel-Feld
  // (nicht im „Punkte“-Modus – dort werden Ecken verschoben)
  const handleAngleCornerTap = (x: number, y: number): boolean => {
    if (!showLineMeasurementNumpad || !selectedLineSegment || pointMoveOnly) return false;
    if (!polygonAreaOptions[selectedLineSegment.elementId]?.useAngles) return false;
    const hit = findNearestPolylinePoint(x, y);
    if (!hit || hit.element.id !== selectedLineSegment.elementId || !hit.element.data?.closed) return false;
    if (!panelOptionsOpen) changePanelOptionsOpen(true);
    setPendingAreaField(`${AREA_FIELD_PREFIX}angle-${hit.pointIndex}`);
    return true;
  };
  const handleDiagonalPick = (x: number, y: number) => {
    if (!diagonalPick) return;
    const hit = findNearestPolylinePoint(x, y);
    if (!hit || hit.element.id !== diagonalPick.elementId) return;
    const n = hit.element.data.points.length;
    if (diagonalPick.first === null) {
      setDiagonalPick({ ...diagonalPick, first: hit.pointIndex });
      return;
    }
    const i = Math.min(diagonalPick.first, hit.pointIndex);
    const j = Math.max(diagonalPick.first, hit.pointIndex);
    // Gleiche oder benachbarte Ecke ist keine Diagonale
    if (j - i < 2 || (i === 0 && j === n - 1)) return;
    setPolygonAreaOptions(prev => ({
      ...prev,
      [diagonalPick.elementId]: withPairs(prev[diagonalPick.elementId], n, pairs => { if (pairs[`${i}-${j}`] === undefined) pairs[`${i}-${j}`] = ''; }),
    }));
    setDiagonalPick(null);
  };
  useEffect(() => {
    if (!showLineMeasurementNumpad) setDiagonalPick(null);
  }, [showLineMeasurementNumpad]);

  // Angetippte Linien-Nummer in der Skizze finden
  const findLineNumberAtPoint = (x: number, y: number): { element: DrawElement; segmentIndex: number } | null => findLineNumberAtPointImpl({
    lineNumbersVisible, scale, elements, selectedLineSegment, polygonWalls,
  }, x, y);

  const changeLineAutoNext = (enabled: boolean) => {
    setLineAutoNext(enabled);
    AsyncStorage.setItem('aufmassprofi_line_auto_next', enabled ? '1' : '0');
  };

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
  
  
  // Verschiebbare Position für Übersicht-Legend
  const [legendPosition, setLegendPosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const legendPan = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const legendPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) + Math.abs(g.dy) > 8, // Zeile ziehen verschiebt Legende; laufende Striche verweigern die Übernahme
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
  
  
  // Hilfsfunktion: Extrahiert den numerischen Wert aus einem Maß-String und konvertiert alles auf Meter
  const parseMeasurementToMeters = parseMeasurementToMetersShared;

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

  // Berechne die Fläche (m²) für ein geschlossenes Polygon (Polyline mit closed=true)
  // Methode: NUR mit den vom Benutzer eingegebenen Maßen – ALLE Seiten müssen bemaßt sein.
  // Das Polygon wird aus den eingegebenen Seitenlängen + den gezeichneten Winkeln
  // rekonstruiert (Bowditch-Ausgleich für den Schließfehler), dann Shoelace-Formel.
  // So ergibt z.B. ein Rechteck mit 5m × 4m exakt 20,00 m².
  const calculatePolygonAreaM2 = (element: DrawElement): number | null =>
    calculatePolygonAreaM2Shared(element, lineSegmentMeasurements, polygonAreaOptions[element.id]?.useAngles ? undefined : polygonAreaShapes[element.id]?.points, polygonAreaOptions[element.id]);

  // Formatiert eine Fläche für die Anzeige (deutsches Format)
  const formatAreaM2 = (area: number): string => `${area.toFixed(2).replace('.', ',')} m²`;

  
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
    // Feld wurde über die Skizze ausgewählt (Tür/Fenster angetippt): erste Ziffer ersetzt den alten Wert
    const replace = !!replaceOnNextKeyRef.current && replaceOnNextKeyRef.current === numpadTargetId && !!numpadTargetRef.current;
    replaceOnNextKeyRef.current = null;
    if (key === '⌫') {
      typeIntoPanelField(prev => prev.slice(0, -1));
    } else if (key === 'C') {
      typeIntoPanelField(() => '');
    } else {
      typeIntoPanelField(prev => (replace ? key : prev + key));
    }
    if (!numpadTargetRef.current) setTimeout(() => lineMeasurementInputRef.current?.focus(), 10);
  };
  
  // Maß zur ausgewählten Linie hinzufügen
  const addMeasurementToSelectedLine = (expression: string = lineMeasurementExpression) => addMeasurementToSelectedLineImpl({
    selectedLineSegment, setLineSegmentMeasurements,
    setLineMeasureHistory, lineSegmentMeasurements, setLineMeasurementExpression, lineAutoNext,
    elements, setSelectedLineSegment, lineMeasurementInputRef, setShowLineMeasurementNumpad,
  }, expression);
  
  // Maß von Linie entfernen
  const removeMeasurementFromSelectedLine = () => removeMeasurementFromSelectedLineImpl({
    selectedLineSegment, setLineSegmentMeasurements, setSelectedLineSegment,
  });
  
  
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
  
  const isArrowNumpadOnPhone = () => isPhoneDevice && showModalNumpad && (showArrowModal || showEditArrowModal);

  // Rendert das Numpad-Overlay innerhalb eines Modals - gleiches Design wie floating Maß-Panel
  const renderInModalNumpad = () => renderInModalNumpadView({
    showModalNumpad, numpadScales, numpadSize, isPhoneDevice, screenWidth, modalNumpadMode,
    modalNumpadPosition, isArrowNumpadOnPhone, insets, modalNumpadPanResponder, t, closeModalNumpad,
    showTextModal, showEditTextModal, showMemoModal, showEditMemoModal, showNotesModal,
    textNumpadAuto, changeTextNumpadAuto, changeNumpadSize, setModalNumpadMode,
    handleActiveNumpadPress, modalNumpadCaps, setModalNumpadCaps,
  });
  
  
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
  // Individuelle Werkzeug-Beschriftungen (aus App-Einstellungen)
  const [toolLabels, setToolLabels] = useState<SketchLabelSettings>({ ...DEFAULT_SKETCH_LABELS });
  useEffect(() => { getSketchLabels().then(setToolLabels); }, []);
  const [textInput, setTextInput] = useState('');
  const [arrowText, setArrowText] = useState('');
  const [arrowHeads, setArrowHeads] = useState<'single' | 'double'>('double');
  const [pointerText, setPointerText] = useState('');
  
  // Edit state for text and arrow
  const [editFontSize, setEditFontSize] = useState(20);
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

  // Schutz vor versehentlichem Verlassen (Wisch-Geste/Zurück): Nachfrage mit Speichern-Option
  const allowLeaveRef = useRef(false);
  const handleBackPressRef = useRef<() => void>(() => {});
  // Expo Router 58: `repeat()` deaktiviert die Sperre und löst die Navigation erneut aus
  // (direktes navigation.dispatch würde wieder abgefangen -> Endlosschleife)
  usePreventRemove(elements.length > 0 || !!backgroundImage, ({ repeat }) => {
    if (allowLeaveRef.current) {
      // Programmatische Navigation nach dem Speichern - durchlassen
      repeat();
      return;
    }
    if (Platform.OS === 'web') {
      // Alert.alert funktioniert nicht im Web - window.confirm nutzen
      if (window.confirm('Skizze verlassen? Ihre Änderungen werden gespeichert.')) {
        handleBackPressRef.current();
      }
      return;
    }
    Alert.alert(
      'Skizze verlassen?',
      'Möchten Sie Ihre Änderungen speichern, bevor Sie die Skizze verlassen?',
      [
        { text: 'Abbrechen', style: 'cancel' },
        {
          text: 'Verwerfen',
          style: 'destructive',
          onPress: () => {
            allowLeaveRef.current = true;
            repeat();
          },
        },
        { text: 'Speichern', onPress: () => handleBackPressRef.current() },
      ]
    );
  });

  // ===== AUTO-SPEICHERN: alle 2 Minuten im Hintergrund (nur bestehende Skizzen) =====
  const [autoSaveNotice, setAutoSaveNotice] = useState<string | null>(null);
  const autoSavingRef = useRef(false);
  const lastAutoSavedElementsRef = useRef<any>(null);
  const autoSaveNoticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const performAutoSaveRef = useRef<() => void>(() => {});

  const performAutoSave = async () => performAutoSaveImpl({
    autoSavingRef, isSaving, loading, sketchId, lastLoadedSketchId, elements,
    lastAutoSavedElementsRef, backgroundImageChangedRef, lineSegmentMeasurements, measureLineStyles,
    totalLfmBoxPositions, legendPosition, notes, labelOffsets, polygonAreaVisible, polygonWalls,
    polygonAreaShapes, polygonAreaOptions, projectId, title, pdfSize, backgroundImage, isMountedRef,
    setAutoSaveNotice, autoSaveNoticeTimerRef,
  });
  performAutoSaveRef.current = performAutoSave;

  useEffect(() => {
    const intervalId = setInterval(() => performAutoSaveRef.current(), 120000); // alle 2 Minuten
    return () => {
      clearInterval(intervalId);
      if (autoSaveNoticeTimerRef.current) clearTimeout(autoSaveNoticeTimerRef.current);
    };
  }, []);

  // Generate unique ID
  const generateId = () => `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  // Add initial image from route params as an element
  useEffect(() => {
    const addImageElement = (imageUri: string) => {
      if (initialImageAdded.current) return;
      initialImageAdded.current = true;
      
      // Berechne korrektes Seitenverhältnis des Bildes
      getImageSize(imageUri).then(
        ({ width: imgWidth, height: imgHeight }) => {
          // Maximale Größe im Canvas (mit etwas Padding)
          const maxWidth = screenWidth - 40;
          const maxHeight = Math.min((height - 160) * 0.8, canvasHeight - 40);
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
            width: screenWidth - 40,
            height: Math.min((height - 160) * 0.8, canvasHeight - 40),
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
        setPolygonWalls({});
    setPolygonAreaOptions({});
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

  const loadSketch = async () => loadSketchImpl({
    setLoading, sketchId, projectId, setTitle, setNotes, setPdfSize, setElements, setHistory,
    setHistoryIndex, setBackgroundImage, setLineSegmentMeasurements, setMeasureLineStyles,
    setTotalLfmBoxPositions, setLegendPosition, legendPan, setLabelOffsets, setPolygonAreaVisible,
    setPolygonWalls, setPolygonAreaShapes, setPolygonAreaOptions, showAlert, t,
  });

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
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
    setElements(newElements);
  }, []);

  // Funktion um Winkelmesser-Messung zum Sketch hinzuzufügen
  const addProtractorToSketch = useCallback(() => addProtractorToSketchImpl({
    scaleRef, canvasLayoutRef, canvasLayout, androidViewBox, screenWidth, canvasHeight,
    protractorCenter, protractorAngle, protractorUseComplementary, protractorRefEnd,
    protractorAngleEnd, protractorDrawSize, elements, addToHistory, setShowMagnifier,
    setMagnifierSnapshot, setShowProtractor, protractorInitializedRef, showAlert, t,
  }), [elements, protractorAngle, protractorCenter, protractorRefEnd, protractorAngleEnd, protractorUseComplementary, protractorDrawSize, canvasLayout, addToHistory, androidViewBox, screenWidth, canvasHeight]);

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
  

  // Berechnet eine Winkelgruppe basierend auf neuen Parametern (Drehen & Verlängern)
  const recalculateAngleGroup = useCallback((baseId: string, centerX: number, centerY: number, refAngleRad: number, refLength: number, angleOffsetRad: number, anglLineLength: number, isMirrored: boolean): DrawElement[] => recalculateAngleGroupImpl({
    getAngleGroupElementIds, elements,
  }, baseId, centerX, centerY, refAngleRad, refLength, angleOffsetRad, anglLineLength, isMirrored), [elements, getAngleGroupElementIds]);

  // Extrahiert die geometrischen Parameter einer Winkelgruppe aus den Elementen
  const getAngleGroupGeometry = useCallback((baseId: string, els?: DrawElement[]) => getAngleGroupGeometryImpl({
    elements,
  }, baseId, els), [elements]);

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
  const handleBackPress = async () => handleBackPressImpl({
    isSaving, lastLoadedSketchId, elements, sketchId, setIsSaving, lineSegmentMeasurements,
    measureLineStyles, totalLfmBoxPositions, legendPosition, notes, labelOffsets, polygonAreaVisible,
    polygonWalls, polygonAreaShapes, polygonAreaOptions, generatePreviewSvg, backgroundImage, title,
    projectId, pdfSize, backgroundImageChangedRef, isMountedRef, allowLeaveRef, router,
  });
  handleBackPressRef.current = handleBackPress;

  // Delete selected element (or entire angle group if part of one)
  const deleteSelectedElement = () => deleteSelectedElementImpl({
    selectedElementId, getAngleGroupBaseId, getAngleGroupElementIds, elements, addToHistory,
    lineSegmentMeasurements, setLineSegmentMeasurements, setSelectedElementId, setMovingGroupBaseId,
    setOriginalGroupElements, setShowDeleteConfirm,
  });

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




  // Handler für Crop-Modus Touch - sucht Bild an Position und öffnet Modal
  const handleCropModeTouch = (locationX: number, locationY: number) => handleCropModeTouchImpl({
    findElementAtPoint, setCropImageUri, setCropImageId, getImageSize,     setCropImageDimensions, setCropBox, setShowCropModal, t,
  }, locationX, locationY);

  // Zuschnitt anwenden
  const applyCrop = async () => applyCropImpl({
    cropImageUri, cropImageId, cropImageDimensions, cropBox, elements, addToHistory,
    setShowCropModal, setCropImageUri, setCropImageId, setDrawMode, t,
  });

  // Zuschneiden abbrechen
  const cancelCrop = () => {
    setShowCropModal(false);
    setCropImageUri(null);
    setCropImageId(null);
    // Modus zurücksetzen beim Abbrechen
    setDrawMode('select');
  };

  // PanResponder für Crop-Interaktion
  const getCropHandleAtPosition = (x: number, y: number): string | null => getCropHandleAtPositionImpl({
    cropBoxRef,
  }, x, y);

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
    setPolygonWalls({});
    setPolygonAreaOptions({});
    setSelectedLineSegment(null);
    // Alle Summenbox-Positionen zurücksetzen
    setTotalLfmBoxPositions({});
  };



  // Insert image on canvas
  const insertImage = async () => insertImageImpl({
    fitImageToCanvas, generateId, elements, addToHistory, setSelectedElementId, setPhotoEditMode,
    selectDrawMode, showAlert, t,
  });

  // Import document/image from Files app
  const importFromFiles = async () => importFromFilesImpl({
    insertImageFromUri, t, showAlert,
  });


  // Helper function to insert image from URI
  const insertImageFromUri = async (uri: string) => insertImageFromUriImpl({
    fitImageToCanvas, generateId, elements, addToHistory, setSelectedElementId, setPhotoEditMode,
    selectDrawMode, showAlert, t,
  }, uri);

  // Take photo and insert on canvas
  const takePhotoAndInsert = async () => takePhotoAndInsertImpl({
    showAlert, t, fitImageToCanvas, generateId, elements, addToHistory, setSelectedElementId,
    setPhotoEditMode, selectDrawMode,
  });

  // Touch handlers
  // Hilfsfunktion: Berechnet die Canvas-Koordinaten aus Touch-Event
  // locationX/Y sind relativ zum inneren View (dem Canvas-Container)
  // Bei einem gezoomten ScrollView sind diese Koordinaten bereits in Canvas-Koordinaten!
  // Der scrollOffset wird benötigt, um die Position des sichtbaren Ausschnitts zu berücksichtigen
  const onTouchStart = (event: any) => onTouchStartImpl({
    showProtractor, handleProtractorDragStart, zoomMode, androidPinchRef, androidViewBox,
    screenWidth, canvasHeight, drawMode, handleSelectTouchStart, handleCropModeTouch,
    setPendingPosition, setShowTextModal, currentPathRef, currentPenPointsRef, setCurrentPath,
    snapPointToAngle, polylinePoints, finishPolyline, setPolylinePoints, handleAddPointTouch,
    handleRemovePointTouch, setStartPoint,
  }, event);

  // Handler für addPoint Modus - fügt Punkt zu bestehender Polyline hinzu
  const handleAddPointTouch = (x: number, y: number) => handleAddPointTouchImpl({
    selectedElementId, showAlert, t, elements, addToHistory, distanceToLineSegment,
    getClosestPointOnSegment, clearWallSegments, setLineSegmentMeasurements,
  }, x, y);

  // Hilfsfunktion: Berechnet den nächsten Punkt auf einem Liniensegment
  const getClosestPointOnSegment = (px: number, py: number, x1: number, y1: number, x2: number, y2: number) => getClosestPointOnSegmentImpl(px, py, x1, y1, x2, y2);

  // Handler für removePoint Modus - entfernt Punkt aus bestehender Polyline
  const handleRemovePointTouch = (x: number, y: number) => handleRemovePointTouchImpl({
    selectedElementId, showAlert, t, elements, addToHistory, clearWallSegments,
    setLineSegmentMeasurements,
  }, x, y);

  const onTouchMove = (event: any) => onTouchMoveImpl({
    handleOpeningDragMove, showProtractor, handleProtractorDragMove, zoomMode, androidPinchRef, androidZoomScale,
    androidTranslateX, androidTranslateY, androidViewBox, screenWidth, canvasHeight, drawMode,
    dragMode, originalElement, dragStart, handleSelectTouchMove, currentPathRef, currentPenPointsRef,
    buildSmoothPath, setCurrentPath, draggingLabelId, labelDragStartRef, setLabelOffsets,
    currentPath, startPoint, createTempElement,
  }, event);

  const onTouchEnd = (event: any) => onTouchEndImpl({
    handleOpeningDragEnd, showProtractor, handleProtractorDragEnd, zoomMode, androidPinchRef, androidViewBox, screenWidth,
    canvasHeight, setAndroidViewBox, setScale, androidZoomScale, androidTranslateX,
    androidTranslateY, drawMode, currentPathRef, generateId, drawColor, strokeWidth, addToHistory,
    elements, currentPenPointsRef, setCurrentPath, currentPath, angleEditMode, setAngleEditMode,
    setAngleEditBaseId, setAngleEditOriginals, setDragStart, dragMode, editingPolylinePoint,
    selectedElementId, pointMoveOnly, autoDiagonalAfterPointMove, setSelectedLineSegment, measureLineStyles,
    setTempMeasureLineColor, setTempMeasureLineStrokeWidth, setTempMeasureLineFontSize,
    setLineMeasurementExpression, setShowLineMeasurementNumpad, lineMeasurementInputRef,
    movingGroupBaseId, originalGroupElements, setEditingPolylinePoint, setDragMode, setResizeHandle,
    setOriginalElement, setOriginalGroupElements, setMovingGroupBaseId, setShowMagnifier,
    setMagnifierPosition, setMagnifierTargetPosition, setMagnifierSnapshot, draggingLabelId,
    setDraggingLabelId, startPoint, setPendingArrow, setShowArrowModal, openModalNumpad,
    setArrowText, arrowInputRef, setStartPoint, setTempElement, setPendingPointer, setPointerText,
    setShowPointerModal, setPendingMemo, setMemoText, setShowMemoModal, tempElement,
  }, event);

  // Helper: Create temporary preview element
  const createTempElement = (start: { x: number; y: number }, endX: number, endY: number) => createTempElementImpl({
    drawMode, lineArrowType, drawColor, strokeWidth, arrowHeads, editArrowStrokeWidth,
    editPointerStrokeWidth, setTempElement,
  }, start, endX, endY);

  // Polyline beenden (offen oder geschlossen)
  const finishPolyline = (closed: boolean = false) => finishPolylineImpl({
    polylinePoints, generateId, drawColor, strokeWidth, addToHistory, elements, setPolylinePoints,
    polylineControlPosition,
  }, closed);

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
  const snapPointToAngle = (newX: number, newY: number): { x: number; y: number } => snapPointToAngleImpl({
    gridSnapEnabled, showGrid, gridSize, angleSnapEnabled, polylinePoints, angleSnapValue,
  }, newX, newY);

  const [pendingPosition, setPendingPosition] = useState<{ x: number; y: number } | null>(null);
  const [pendingArrow, setPendingArrow] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const [pendingPointer, setPendingPointer] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const [pendingMemo, setPendingMemo] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const [showMemoModal, setShowMemoModal] = useState(false);
  const [memoText, setMemoText] = useState('');
  const memoInputRef = useRef<TextInput>(null);
  const [editMemoFontSize, setEditMemoFontSize] = useState(10);
  const [showEditMemoModal, setShowEditMemoModal] = useState(false);

  // Auf Wunsch: bei Text, Memo und Notizen direkt das eingebaute Numpad öffnen
  const [textNumpadAuto, setTextNumpadAuto] = useState(false);
  useEffect(() => {
    AsyncStorage.getItem('aufmassprofi_text_numpad_auto').then(saved => setTextNumpadAuto(saved === '1'));
  }, []);
  const changeTextNumpadAuto = (enabled: boolean) => {
    setTextNumpadAuto(enabled);
    AsyncStorage.setItem('aufmassprofi_text_numpad_auto', enabled ? '1' : '0');
  };
  useEffect(() => {
    if (!textNumpadAuto) return;
    if (showTextModal || showEditTextModal) openModalNumpad(setTextInput, textInputRef);
    else if (showMemoModal || showEditMemoModal) openModalNumpad(setMemoText, memoInputRef);
    else if (showNotesModal) openModalNumpad(setNotes, notesInputRef);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showTextModal, showEditTextModal, showMemoModal, showEditMemoModal, showNotesModal]);

  // Polygon Edit Modal State
  const [showEditPolygonModal, setShowEditPolygonModal] = useState(false);
  const [editPolygonStrokeWidth, setEditPolygonStrokeWidth] = useState(3);
  const [editPolygonColor, setEditPolygonColor] = useState('#FF0000');

  // Add text element
  const addTextElement = () => addTextElementImpl({
    textInput, pendingPosition, generateId, lastTextColor, lastTextFontSize, lastTextFontFamily,
    addToHistory, elements, setTextInput, setPendingPosition, setShowTextModal,
  });

  // Add arrow element
  const addArrowElement = (text: string = arrowText) => {
    if (pendingArrow) {
      const newElement: DrawElement = {
        id: generateId(),
        type: 'arrow',
        data: {
          x1: pendingArrow.x1,
          y1: pendingArrow.y1,
          x2: pendingArrow.x2,
          y2: pendingArrow.y2,
          text,
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
  const addPointerElement = () => addPointerElementImpl({
    pendingPointer, generateId, pointerText, editPointerFontSize, drawColor, editPointerStrokeWidth,
    addToHistory, elements, setPointerText, setPendingPointer, setShowPointerModal,
  });

  // Update existing pointer element (edit mode)
  const updatePointerElement = () => updatePointerElementImpl({
    selectedElementId, elements, pointerText, editPointerFontSize, drawColor, editPointerStrokeWidth,
    addToHistory, setPointerText, setShowEditPointerModal,
  });

  // Add memo (annotation with dashed line) element - wie in Flächenberechnung
  const addMemoElement = () => addMemoElementImpl({
    pendingMemo, generateId, memoText, editMemoFontSize, addToHistory, elements,
    setSelectedElementId, setDrawMode, setMemoText, setPendingMemo, setShowMemoModal,
  });

  // Update existing memo element (edit mode)
  const updateMemoElement = () => updateMemoElementImpl({
    selectedElementId, elements, memoText, editMemoFontSize, drawColor, addToHistory, setMemoText,
    setShowEditMemoModal,
  });

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
  const handleSelectTouchStart = (locationX: number, locationY: number) => handleSelectTouchStartImpl({
    diagonalPick, handleDiagonalPick, handleAngleCornerTap, handleOpeningTap, startOpeningLongPress, findPolylineLabelAtPoint, labelOffsets, setDraggingLabelId,
    labelDragStartRef, pointMoveOnly, findNearestPolylinePoint, selectedElementId,
    setSelectedElementId, setSelectedLineSegment, elements, setEditingPolylinePoint, setDragMode,
    setDragStart, setOriginalElement, setMagnifierTargetPosition, setMagnifierPosition, canvasLayout,
    canvasRef, setMagnifierSnapshot, setShowMagnifier, checkTransformHandles, getAngleGroupBaseId,
    getAngleGroupElementIds, setAngleEditMode, setAngleEditBaseId, setAngleEditOriginals,
    setResizeHandle, findLineNumberAtPoint, setPanelOptionsOpen, setWallSectionOpen,
    findPolylineSegmentAtPoint, measureLineStyles, setTempMeasureLineColor,
    setTempMeasureLineStrokeWidth, setTempMeasureLineFontSize, setLineMeasurementExpression,
    setShowLineMeasurementNumpad, lineMeasurementInputRef, findElementAtPoint, photoEditMode,
    lastTapRef, setTextInput, setEditFontSize, setEditFontWeight, setEditFontStyle,
    setEditFontFamily, setDrawColor, setShowEditTextModal, setArrowText, setArrowHeads,
    setEditArrowFontSize, setEditArrowStrokeWidth, setShowEditArrowModal, openModalNumpad,
    arrowInputRef, setPointerText, setEditPointerFontSize, setEditPointerStrokeWidth,
    setShowEditPointerModal, setMemoText, setEditMemoFontSize, setShowEditMemoModal,
    setEditPolygonStrokeWidth, setEditPolygonColor, setShowEditPolygonModal,
    setOriginalGroupElements, setMovingGroupBaseId,
  }, locationX, locationY);

  const handleSelectTouchMove = (locationX: number, locationY: number) => handleSelectTouchMoveImpl({
    draggingLabelId, labelDragStartRef, setLabelOffsets, originalElement, dragStart, angleEditMode,
    angleEditBaseId, getAngleGroupGeometry, angleEditOriginals, recalculateAngleGroup, setElements,
    movingGroupBaseId, originalGroupElements, dragMode, getAngleGroupElementIds, elements,
    selectedElementId, editingPolylinePoint, showMagnifier, setMagnifierTargetPosition,
    setMagnifierPosition, canvasLayout, resizeHandle,
  }, locationX, locationY);

  // Find polyline label at point (für Label-Verschiebung)
  const findPolylineLabelAtPoint = (x: number, y: number): { elementId: string; centerX: number; centerY: number } | null => findPolylineLabelAtPointImpl({
    getPolylineElementsWithMeasurements, labelOffsets,
  }, x, y);

  // Find element at point
  const findElementAtPoint = (x: number, y: number, onlyImages: boolean = false): DrawElement | null => findElementAtPointImpl({
    elements, distanceToLineSegment, scale,
  }, x, y, onlyImages);

  // Distance to line segment helper
  const distanceToLineSegment = (px: number, py: number, x1: number, y1: number, x2: number, y2: number) => distanceToLineSegmentImpl(px, py, x1, y1, x2, y2);

  // Funktion um das spezifische Polyline-Segment zu finden
  const findPolylineSegmentAtPoint = (x: number, y: number): { element: DrawElement; segmentIndex: number } | null => findPolylineSegmentAtPointImpl({
    scale, elements, distanceToLineSegment,
  }, x, y);

  // Check transform handles
  const checkTransformHandles = (element: DrawElement, x: number, y: number): { type: 'rotate' | 'resize' | 'angle-rotate' | 'angle-adjust', handle: string } | null => checkTransformHandlesImpl({
    isAngleGroupElement,
  }, element, x, y);

  // Render element
  const renderElement = (element: DrawElement) => renderSketchElement({
    selectedElementId, renderTransformHandles, selectedLineSegment, lineSegmentMeasurements,
    measureLineStyles, polygonAreaOptions, diagonalPick, numpadTargetId, openingDrag, lineNumbersVisible, polygonWalls, scale,
    getPolylineElementsWithMeasurements, labelOffsets, polygonAreaVisible, calculatePolygonAreaM2,
    formatAreaM2, editingPolylinePoint,
  }, element);

  // Render transformation handles - mit dynamischer Skalierung basierend auf Zoom-Level
  const renderTransformHandles = (element: DrawElement) => renderSketchTransformHandles({
    scale, isAngleGroupElement, getAngleGroupBaseId, getAngleGroupGeometry,
  }, element);

  // Save sketch
  const generatePreviewSvg = () =>
    buildPreviewSvg({
      elements, canvasHeight, screenWidth, legendPosition,
      lineSegmentMeasurements, measureLineStyles, polygonAreaVisible,
      getPolylineElementsWithMeasurements, calculatePolygonAreaM2,
      formatAreaM2, calculateTotalLfmForElement, labelOffsets,
      polygonWalls, lineNumbersVisible, polygonAreaOptions,
    });

  const saveSketch = async () => saveSketchImpl({
    title, showAlert, t, setLoading, elements, lineSegmentMeasurements, measureLineStyles,
    totalLfmBoxPositions, legendPosition, notes, labelOffsets, polygonAreaVisible, polygonWalls,
    polygonAreaShapes, polygonAreaOptions, backgroundImageChangedRef, generatePreviewSvg,
    backgroundImage, sketchId, projectId, pdfSize, allowLeaveRef, router, isMountedRef,
  });

  // Color palette
  const colors = [
    '#000000', '#FFFFFF', '#FF0000', '#00FF00', '#0000FF',
    '#FFFF00', '#FF00FF', '#00FFFF', '#FFA500', '#800080',
  ];

  // Stroke widths
  const strokeWidths = [1, 2, 3, 5, 8];

  return (
    <View style={styles.container}>
      <SavingOverlay
        {...{
          isSaving,
        }}
      />
      
      <SketchHeader
        {...{
          isPhoneLandscape, insets, handleBackPress, isSaving, title, setTitle, t, pdfSize,
          setPdfSize, showAlert, sketchId, setShowDemo, saveSketch, loading,
        }}
      />
      <SketchTour />
      <SketchDemoModal visible={showDemo} onClose={() => setShowDemo(false)} />

      {/* Auto-Save Hinweis */}
      {autoSaveNotice && (
        <View pointerEvents="none" style={styles.autoSaveNotice}>
          <Ionicons name="checkmark-circle" size={14} color="#fff" />
          <Text style={styles.autoSaveNoticeText}>{autoSaveNotice}</Text>
        </View>
      )}

      <SketchToolbar
        {...{
          isPhoneLandscape, isPhoneDevice, setPhotoEditMode, takePhotoAndInsert, t,
          loadProjectPhotos, insertImage, importFromFiles, photoEditMode, setSelectedElementId,
          setDrawMode, setZoomMode, drawMode, selectDrawMode, zoomMode, androidPinchRef,
          androidTranslateX, androidTranslateY, pointMoveOnly, setPointMoveOnly,
          setShowLineMeasurementNumpad, setSelectedLineSegment, setPolylinePoints, polylinePoints,
          angleSnapEnabled, setAngleSnapEnabled, angleSnapValue, showGrid, backgroundImage,
          gridSnapEnabled, setGridSnapEnabled, selectedElementId, setShowDeleteConfirm,
          showElementStyleEditor, setShowElementStyleEditor, elements, setElements,
          setShowLineTypePicker, showLineTypePicker, lineArrowType, showProtractor, canvasRef,
          protractorCanvasSnapshot, setProtractorCenter, setProtractorRefEnd, setProtractorAngleEnd,
          setShowProtractor, showNotesModal, notes, setShowNotesModal, toolLabels,
          setShowColorPicker, showColorPicker, drawColor, strokeWidths, strokeWidth,
          updateStrokeWidth, setShowGrid, setShowGridSettings, showGridSettings, canUndo, undo,
          canRedo, redo, clearAll,
        }}
      />

      <ColorPickerPanel
        {...{
          showColorPicker, t, colors, drawColor, setDrawColor, setShowColorPicker,
        }}
      />

      <ElementStylePanel
        {...{
          showElementStyleEditor, selectedElementForStyle, t, setShowElementStyleEditor, colors,
          changeSelectedElementColor, changeSelectedElementStrokeWidth,
        }}
      />

      <GridSettingsPanel
        {...{
          showGridSettings, backgroundImage, t, setShowGridSettings, gridSize, setGridSize,
          gridOpacity, setGridOpacity,
        }}
      />

      {/* Canvas mit ScrollView für Zoom */}
      <ScrollView
        ref={scrollViewRef}
        removeClippedSubviews={false}
        style={[styles.canvasScrollView, isPhoneLandscape && { paddingLeft: insets.left, paddingRight: insets.right }]}
        contentContainerStyle={{ flexGrow: 1 }}
        minimumZoomScale={Platform.OS === 'ios' ? (zoomMode ? 0.5 : scale) : 1}
        maximumZoomScale={Platform.OS === 'ios' ? (zoomMode ? 4 : scale) : 1}
        bouncesZoom={Platform.OS === 'ios' && zoomMode}
        scrollEnabled={Platform.OS === 'ios' ? zoomMode : false}
        pinchGestureEnabled={Platform.OS === 'ios' && zoomMode}
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
        {/* Android: Animated.View Wrapper für Pinch-to-Zoom Transforms */}
        <Animated.View style={Platform.OS === 'android' ? {
          transform: [
            { translateX: androidTranslateX },
            { translateY: androidTranslateY },
            { scale: androidZoomScale },
          ],
        } : undefined}>
        <View
          ref={canvasRef}
          style={[styles.canvasContainer, { width: screenWidth, height: canvasHeight, minHeight: canvasHeight }]}
          onStartShouldSetResponder={() => Platform.OS === 'android' ? true : !zoomMode}
          onMoveShouldSetResponder={() => Platform.OS === 'android' ? true : !zoomMode}
          onResponderGrant={onTouchStart}
          onResponderMove={onTouchMove}
          onResponderRelease={onTouchEnd}
          // Laufender Strich darf nicht von Overlays (Legende, Zähler) übernommen werden
          onResponderTerminationRequest={() => !isLiveDrawing}
          onResponderTerminate={onTouchEnd}
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
        {/* Zeichen-Ebenen sind NICHT touch-fähig: Touch-Ziel ist immer der stabile
            Canvas-Container (Responder). Sonst wird auf iOS (SDK 58) die SVG-Ebene zum
            Touch-Ziel und der Remount pro Render (Fabric-Workaround) bricht die laufende
            Geste ab -> Bilder/Maßlinien lassen sich nicht ziehen. */}
        <View
          style={{ width: screenWidth, height: canvasHeight, pointerEvents: 'none' }}
          collapsable={false}
        >
        {/* Statische Bild-Ebene (Hintergrund + eingefügte Fotos): eigener Svg-Layer,
            der NUR remountet wenn sich die Bilder selbst ändern – verhindert das
            Flackern der Fotos beim Zeichnen (Haupt-Canvas remountet pro Änderung) */}
        {(() => {
          const imageEls = elements.filter(el => el.type === 'image');
          if (!backgroundImage && imageEls.length === 0) return null;
          const rev = imageEls
            .map(e => `${e.id}:${e.data?.x}:${e.data?.y}:${e.data?.width}:${e.data?.height}:${e.data?.rotation ?? 0}:${selectedElementId === e.id ? 'S' : ''}`)
            .join('|');
          return (
            <Svg
              key={`imglayer-${rev}-${backgroundImage ? backgroundImage.length : 0}`}
              width={screenWidth}
              height={canvasHeight}
              style={[styles.svg, { position: 'absolute', top: 0, left: 0, backgroundColor: 'transparent' }]}
              pointerEvents="none"
              viewBox={Platform.OS === 'android' && androidViewBox.w > 0
                ? `${androidViewBox.x} ${androidViewBox.y} ${androidViewBox.w} ${androidViewBox.h}`
                : `0 0 ${screenWidth} ${canvasHeight}`
              }
            >
              {backgroundImage && (
                <SvgImage
                  href={backgroundImage}
                  x={0}
                  y={0}
                  width={screenWidth}
                  height={canvasHeight}
                  preserveAspectRatio="xMidYMid meet"
                  opacity={1}
                />
              )}
              {imageEls.map(el => renderElement(el))}
            </Svg>
          );
        })()}
        {/* Große Skizzen: Während ein Strich entsteht, wird die fertige Haupt-Zeichenfläche
            aus dem Zwischenspeicher wiederverwendet (keine Neuberechnung aller Elemente pro Bewegung) */}
        {(isLiveDrawing && mainSvgCacheRef.current && mainSvgCacheElementsRef.current === elements) ? mainSvgCacheRef.current : (mainSvgCacheElementsRef.current = elements, mainSvgCacheRef.current = (
        <Svg
          ref={svgRef}
          key={Platform.OS === 'web' ? 'canvas' : `canvas-${mainCanvasKey}`}
          width={screenWidth}
          height={canvasHeight}
          style={[styles.svg, { backgroundColor: 'transparent', position: 'relative', zIndex: 1 }]}
          viewBox={Platform.OS === 'android' && androidViewBox.w > 0
            ? `${androidViewBox.x} ${androidViewBox.y} ${androidViewBox.w} ${androidViewBox.h}`
            : `0 0 ${screenWidth} ${canvasHeight}`
          }
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

          {/* Background image + Foto-Elemente werden in der statischen Bild-Ebene darüber gerendert */}

          {/* Render all elements (Bilder sind auf der statischen Ebene) */}
          {elements.filter(el => el.type !== 'image').map(el => renderElement(el))}

          {/* Live-Vorschau (Stift-Strich / Form) liegt in eigener Ebene darüber – siehe unten */}

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
          {/* Winkelmesser-Live-Grafik im Haupt-Canvas (nur nativ): das separate Overlay-Svg
              rendert auf Fabric/iPad nicht zuverlässig – das Haupt-Canvas nachweislich schon.
              Touch-Steuerung bleibt auf dem (unsichtbaren) Overlay, hier nur die Anzeige. */}
          {Platform.OS !== 'web' && showProtractor && (() => {
            const pScale = scaleRef.current || 1;
            const pLayout = canvasLayoutRef.current || canvasLayout;
            const s2c = (sx: number, sy: number) => {
              if (Platform.OS === 'android' && androidViewBox.w > 0 && androidViewBox.w !== screenWidth) {
                const lx = pLayout ? pLayout.x : 0;
                const ly = pLayout ? pLayout.y : 0;
                return {
                  x: androidViewBox.x + ((sx - lx) / screenWidth) * androidViewBox.w,
                  y: androidViewBox.y + ((sy - ly) / canvasHeight) * androidViewBox.h,
                };
              } else if (pLayout && pScale !== 1) {
                return { x: (sx - pLayout.x) / pScale, y: (sy - pLayout.y) / pScale };
              } else if (pLayout) {
                return { x: sx - pLayout.x, y: sy - pLayout.y };
              }
              const topOffset = (Platform.OS === 'ios' ? 62 : 24) + 70;
              return { x: sx, y: sy - topOffset };
            };
            const pc = s2c(protractorCenter.x, protractorCenter.y);
            const pr = s2c(protractorRefEnd.x, protractorRefEnd.y);
            const pa = s2c(protractorAngleEnd.x, protractorAngleEnd.y);
            const a1 = Math.atan2(protractorRefEnd.y - protractorCenter.y, protractorRefEnd.x - protractorCenter.x);
            const a2 = Math.atan2(protractorAngleEnd.y - protractorCenter.y, protractorAngleEnd.x - protractorCenter.x);
            let innerDeg = Math.abs((a2 - a1) * 180 / Math.PI);
            if (innerDeg > 180) innerDeg = 360 - innerDeg;
            const shownDeg = protractorUseComplementary ? Math.round(360 - innerDeg) : Math.round(innerDeg);
            const sw = 3 / pScale;
            const hr = 12 / pScale;
            const pfs = 16 / pScale;
            return (
              <G>
                <Line x1={pc.x} y1={pc.y} x2={pr.x} y2={pr.y} stroke="#2196f3" strokeWidth={sw} />
                <Line x1={pc.x} y1={pc.y} x2={pa.x} y2={pa.y} stroke="#ff5722" strokeWidth={sw} />
                <Circle cx={pr.x} cy={pr.y} r={hr} fill="#2196f3" stroke="#fff" strokeWidth={sw * 0.7} />
                <Circle cx={pa.x} cy={pa.y} r={hr} fill="#ff5722" stroke="#fff" strokeWidth={sw * 0.7} />
                <Circle cx={pc.x} cy={pc.y} r={hr * 0.8} fill="#ff5722" stroke="#fff" strokeWidth={sw * 0.7} />
                <SvgText x={pc.x - 22 / pScale} y={pc.y - 14 / pScale} fill="#ff5722" fontSize={pfs} fontWeight="bold" textAnchor="end">
                  {`${shownDeg}°`}
                </SvgText>
              </G>
            );
          })()}
          {/* Fabric-Invalidierungs-Workaround: unsichtbares Element mit neuem Key pro Render */}
          {Platform.OS !== 'web' && !isLiveDrawing && (
            <Circle key={`inv-${fabricInvalidateTick.current++}`} cx={-99999} cy={-99999} r={0.1} fill="none" stroke="none" opacity={0} />
          )}
        </Svg>
        ))}
        {/* Live-Ebene: nur der aktuell entstehende Strich / die Form-Vorschau.
            Diese kleine Ebene wird pro Bewegung neu aufgebaut, die Haupt-Zeichenfläche
            mit allen Elementen bleibt währenddessen unverändert -> flüssiges Zeichnen */}
        {isLiveDrawing && (
          <Svg
            key={Platform.OS === 'web' ? 'live' : `live-${fabricInvalidateTick.current++}`}
            width={screenWidth}
            height={canvasHeight}
            style={[styles.svg, { position: 'absolute', top: 0, left: 0, backgroundColor: 'transparent', zIndex: 2 }]}
            pointerEvents="none"
            viewBox={Platform.OS === 'android' && androidViewBox.w > 0
              ? `${androidViewBox.x} ${androidViewBox.y} ${androidViewBox.w} ${androidViewBox.h}`
              : `0 0 ${screenWidth} ${canvasHeight}`
            }
          >
            {tempElement && renderElement(tempElement)}
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
          </Svg>
        )}
        </View>

        <CanvasInfoOverlay
          {...{
            elements, selectedElementId, isAngleGroupElement, getAngleGroupBaseId,
            getAngleGroupGeometry, canvasLayout, scaleRef, getAngleGroupElementIds, addToHistory,
            setSelectedElementId, canvasRef, protractorCanvasSnapshot, setProtractorCenter,
            setProtractorRefEnd, setProtractorAngleEnd, setShowProtractorHint, setShowProtractor, t,
            projectId, photoEditMode, zoomMode, scale, resetAndroidZoom,
          }}
        />

      </View>
      </Animated.View>
      </ScrollView>

      <PolylineControls
        {...{
          drawMode, polylinePoints, polylineControlPosition, polylineControlPanResponder, t,
          angleSnapEnabled, setAngleSnapEnabled, angleSnapValue, setAngleSnapValue, showGrid,
          backgroundImage, gridSnapEnabled, setGridSnapEnabled, undoLastPolylinePoint,
          finishPolyline, cancelPolyline,
        }}
      />

      <SketchLegend
        {...{
          getPolylineElementsWithMeasurements, legendPan, legendPanResponder, t,
          calculateTotalLfmForElement, polygonAreaVisible, calculatePolygonAreaM2, setRenamePolyline,
          formatAreaM2,
        }}
      />

      <LineMeasurePanel
        {...{
          showLineMeasurementNumpad, isPhoneDevice, numpadSize, screenWidth, screenHeight, insets,
          panelKeyboardOpen, measureKeyboardHeight, measureKeyboardMode, panelOptionsOpen,
          wallSectionOpen, measurePanelPan, measurePanelPanResponder, t,
          setShowLineMeasurementNumpad, setLineMeasurementExpression, setSelectedLineSegment,
          selectedLineSegment, elements, lineSegmentMeasurements, lineMeasurementInputRef,
          lineMeasurementExpression, clearNumpadTarget, laserSound, changePanelKeyboardOpen,
          lineAutoAdd, addMeasurementToSelectedLine, removeMeasurementFromSelectedLine,
          changePanelOptionsOpen, changeLineAutoAdd, lineAutoNext, changeLineAutoNext,
          changeLaserSound, lineMeasureHistory, undoLastLineMeasurement, lineNumbersVisible,
          changeLineNumbersVisible, polygonWalls, setPolygonWalls, setWallSectionOpen,
          numpadTargetId, setPanelKeyboardOpen, numpadTargetRef, setNumpadTargetId, pendingAreaField, setPendingAreaField, straightenPolygon, straightenAllPolygons, openingCopy, setOpeningCopy,
          calculatePolygonAreaM2, polygonAreaVisible, setPolygonAreaVisible, formatAreaM2,
          polygonAreaOptions, polygonAreaShapes, diagonalPick, setDiagonalPick,
          setPolygonAreaOptions, setShowMeasureStyleSettings, showMeasureStyleSettings,
          tempMeasureLineColor, setTempMeasureLineColor, setMeasureLineStyles,
          tempMeasureLineStrokeWidth, setTempMeasureLineStrokeWidth, tempMeasureLineFontSize,
          setTempMeasureLineFontSize, setMeasureKeyboardHeight, numpadTargetLabel, numpadTargetValue,
          changeNumpadSize, setMeasureKeyboardMode, numpadScales, handleLineMeasurementNumpadPress,
          typeIntoPanelField, measureKeyboardCaps, setMeasureKeyboardCaps,
        }}
      />

      <TextModal
        {...{
          showTextModal, textInputRef, textInput, setTextInput, showModalNumpad, closeModalNumpad,
          openModalNumpad, t, lastTextFontSize, updateLastTextFontSize, lastTextFontFamily,
          updateLastTextFontFamily, colors, lastTextColor, updateLastTextColor, setShowTextModal,
          setPendingPosition, addTextElement, renderInModalNumpad,
        }}
      />

      <ArrowModal
        {...{
          showArrowModal, isArrowNumpadOnPhone, insets, arrowInputRef, arrowText, setArrowText,
          showModalNumpad, laserSound, arrowAutoAdd, addArrowElement, closeModalNumpad,
          openModalNumpad, arrowOptionsOpen, changeArrowOptionsOpen, changeArrowAutoAdd,
          changeLaserSound, arrowHeads, setArrowHeads, editArrowStrokeWidth,
          updateEditArrowStrokeWidth, t, editArrowFontSize, updateEditArrowFontSize,
          setShowArrowModal, setPendingArrow, renderInModalNumpad,
        }}
      />

      <DeleteConfirmModal
        {...{
          showDeleteConfirm, setShowDeleteConfirm, t, deleteSelectedElement,
        }}
      />

      <EditArrowModal
        {...{
          showEditArrowModal, isArrowNumpadOnPhone, insets, arrowInputRef, arrowText, setArrowText,
          showModalNumpad, closeModalNumpad, openModalNumpad, arrowOptionsOpen,
          changeArrowOptionsOpen, arrowHeads, setArrowHeads, editArrowStrokeWidth,
          updateEditArrowStrokeWidth, t, editArrowFontSize, updateEditArrowFontSize, colors,
          drawColor, setDrawColor, setShowEditArrowModal, selectedElementId, elements, addToHistory,
          renderInModalNumpad,
        }}
      />

      <PointerModal
        {...{
          showPointerModal, toolLabels, pointerInputRef, pointerText, setPointerText,
          showModalNumpad, closeModalNumpad, openModalNumpad, setShowPointerModal, setPendingPointer,
          t, addPointerElement, renderInModalNumpad,
        }}
      />

      <EditPointerModal
        {...{
          showEditPointerModal, toolLabels, pointerInputRef, pointerText, setPointerText,
          showModalNumpad, closeModalNumpad, openModalNumpad, editPointerStrokeWidth,
          updateEditPointerStrokeWidth, t, editPointerFontSize, updateEditPointerFontSize, colors,
          drawColor, setDrawColor, setShowEditPointerModal, updatePointerElement,
          renderInModalNumpad,
        }}
      />

      <MemoModal
        {...{
          showMemoModal, toolLabels, showModalNumpad, closeModalNumpad, openModalNumpad, setMemoText,
          memoInputRef, memoText, renderInModalNumpad, setShowMemoModal, setPendingMemo, t,
          addMemoElement,
        }}
      />

      <EditMemoModal
        {...{
          showEditMemoModal, toolLabels, showModalNumpad, closeModalNumpad, openModalNumpad,
          setMemoText, memoInputRef, memoText, renderInModalNumpad, t, editMemoFontSize,
          updateEditMemoFontSize, drawColor, setDrawColor, setShowEditMemoModal, updateMemoElement,
        }}
      />

      <LineTypePickerModal
        {...{
          showLineTypePicker, setShowLineTypePicker, lineArrowType, setLineArrowType,
        }}
      />


      <EditPolygonModal
        {...{
          showEditPolygonModal, t, editPolygonStrokeWidth, setEditPolygonStrokeWidth,
          editPolygonColor, setEditPolygonColor, setShowEditPolygonModal, updatePolygonElement,
        }}
      />

      <EditTextModal
        {...{
          showEditTextModal, t, textInputRef, textInput, setTextInput, showModalNumpad,
          closeModalNumpad, openModalNumpad, editFontSize, setEditFontSize, editFontWeight,
          setEditFontWeight, editFontStyle, setEditFontStyle, editFontFamily, setEditFontFamily,
          colors, drawColor, setDrawColor, setShowEditTextModal, selectedElementId, elements,
          addToHistory, renderInModalNumpad,
        }}
      />

      <NotesModal
        {...{
          showNotesModal, t, notesInputRef, notes, setNotes, showModalNumpad, activeNumpadRef,
          closeModalNumpad, openModalNumpad, setShowNotesModal, renderInModalNumpad,
        }}
      />

      <ProjectPhotosModal
        {...{
          showProjectPhotosModal, t, setShowProjectPhotosModal, projectPhotos, insertProjectPhoto,
        }}
      />

      <CropModal
        {...{
          showCropModal, t, cropContainerRef, cropPanResponder, cropImageUri, cropBox, cancelCrop,
          applyCrop,
        }}
      />

      <MagnifierOverlay
        {...{
          showMagnifier, magnifierPosition, magnifierTargetPosition, isPhoneDevice, showProtractor,
          screenHeight, screenWidth, magnifierSnapshot, backgroundImage, canvasLayout, canvasHeight,
          fabricInvalidateTick,
        }}
      />

      <ProtractorOverlay
        {...{
          showProtractor, handleProtractorDragStart, handleProtractorDragMove,
          handleProtractorDragEnd, fabricInvalidateTick, screenWidth, screenHeight, protractorCenter,
          protractorRefEnd, protractorAngleEnd, protractorAngle, protractorUseComplementary,
          protractorPanelPan, isPhoneDevice, protractorPanelPanResponder, adjustProtractorAngle,
          setProtractorAngleInput, setShowProtractorAngleInput, setProtractorUseComplementary,
          setProtractorDrawSize, protractorDrawSize, canvasHeight, setProtractorCenter,
          setProtractorRefEnd, setProtractorAngleEnd, setShowProtractor, t, addProtractorToSketch,
          showProtractorAngleInput, protractorAngleInput, setProtractorAngleTo, showProtractorHint,
          setShowProtractorHint,
        }}
      />
      <OpeningInsertMenu
        visible={!!openingInsert}
        line={(openingInsert?.segmentIndex ?? 0) + 1}
        onPick={insertOpening}
        onClose={() => setOpeningInsert(null)}
      />
      <RenamePromptModal
        visible={!!renamePolyline}
        title="Grundriss benennen"
        message="Raumname, z. B. „Wohnzimmer“ (leer = nur S-Nummer)"
        defaultValue={renamePolyline?.name}
        onCancel={() => setRenamePolyline(null)}
        onSubmit={(value) => {
          const target = renamePolyline;
          setRenamePolyline(null);
          if (!target) return;
          const trimmed = value.trim();
          addToHistory(elements.map(el => el.id === target.id ? { ...el, name: trimmed || undefined } : el));
        }}
      />
    </View>
  );
}

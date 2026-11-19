import type { TFunction } from 'i18next';
import React from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ButtonTip } from '../ButtonTip';
import { View, Text, TouchableOpacity, Alert, Platform, ScrollView, Animated } from 'react-native';
import { styles } from '../../../styles/sketchDrawStyles';
import Ionicons from '@react-native-vector-icons/ionicons';
import { SketchLabelSettings } from '../../../../services/SketchLabels';
import { captureRef } from 'react-native-view-shot';
import { DrawElement, DrawMode } from '../../../sketch/sketchShared';
import { tourRef } from '../../home/HomeTour';
import Svg, { Path, Line, Rect, Text as SvgText, Polygon } from 'react-native-svg';


export type SketchToolbarProps = {
  coachButtons: string[];
  isPhoneLandscape: boolean;
  isPhoneDevice: boolean;
  setPhotoEditMode: React.Dispatch<React.SetStateAction<boolean>>;
  takePhotoAndInsert: () => Promise<void>;
  t: TFunction<"translation", undefined>;
  loadProjectPhotos: () => Promise<void>;
  insertImage: () => Promise<void>;
  importFromFiles: () => Promise<void>;
  photoEditMode: boolean;
  setSelectedElementId: React.Dispatch<React.SetStateAction<string | null>>;
  setDrawMode: React.Dispatch<React.SetStateAction<DrawMode>>;
  setZoomMode: React.Dispatch<React.SetStateAction<boolean>>;
  drawMode: DrawMode;
  selectDrawMode: (mode: DrawMode) => void;
  zoomMode: boolean;
  androidPinchRef: React.RefObject<{ initialDistance: number; initialScale: number; lastPanX: number; lastPanY: number; isPinching: boolean; numTouches: number; currentScale: number; currentTranslateX: number; currentTranslateY: number; }>;
  androidTranslateX: Animated.Value;
  androidTranslateY: Animated.Value;
  pointMoveOnly: boolean;
  setPointMoveOnly: React.Dispatch<React.SetStateAction<boolean>>;
  setShowLineMeasurementNumpad: React.Dispatch<React.SetStateAction<boolean>>;
  setSelectedLineSegment: React.Dispatch<React.SetStateAction<{ elementId: string; segmentIndex: number; } | null>>;
  setPolylinePoints: React.Dispatch<React.SetStateAction<{ x: number; y: number; }[]>>;
  polylinePoints: { x: number; y: number; }[];
  angleSnapEnabled: boolean;
  setAngleSnapEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  angleSnapValue: number;
  showGrid: boolean;
  backgroundImage: string | null;
  gridSnapEnabled: boolean;
  setGridSnapEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  selectedElementId: string | null;
  setShowDeleteConfirm: React.Dispatch<React.SetStateAction<boolean>>;
  showElementStyleEditor: boolean;
  setShowElementStyleEditor: React.Dispatch<React.SetStateAction<boolean>>;
  elements: DrawElement[];
  setElements: React.Dispatch<React.SetStateAction<DrawElement[]>>;
  setShowLineTypePicker: React.Dispatch<React.SetStateAction<boolean>>;
  showLineTypePicker: boolean;
  lineArrowType: "none" | "end" | "both";
  showProtractor: boolean;
  canvasRef: React.RefObject<null>;
  protractorCanvasSnapshot: React.RefObject<string | null>;
  setProtractorCenter: React.Dispatch<React.SetStateAction<{ x: number; y: number; }>>;
  setProtractorRefEnd: React.Dispatch<React.SetStateAction<{ x: number; y: number; }>>;
  setProtractorAngleEnd: React.Dispatch<React.SetStateAction<{ x: number; y: number; }>>;
  setShowProtractor: React.Dispatch<React.SetStateAction<boolean>>;
  showNotesModal: boolean;
  notes: string;
  setShowNotesModal: React.Dispatch<React.SetStateAction<boolean>>;
  toolLabels: SketchLabelSettings;
  setShowColorPicker: React.Dispatch<React.SetStateAction<boolean>>;
  showColorPicker: boolean;
  drawColor: string;
  strokeWidths: number[];
  strokeWidth: number;
  updateStrokeWidth: (value: number) => void;
  setShowGrid: React.Dispatch<React.SetStateAction<boolean>>;
  setShowGridSettings: React.Dispatch<React.SetStateAction<boolean>>;
  showGridSettings: boolean;
  canUndo: boolean;
  undo: () => void;
  canRedo: boolean;
  redo: () => void;
  clearAll: () => void;
};

const COACH_GLOW = { borderWidth: 3, borderColor: '#ff6d00', backgroundColor: '#fff3e0', shadowColor: '#ff6d00', shadowOpacity: 0.9, shadowRadius: 8, elevation: 8 };

export function SketchToolbar(props: SketchToolbarProps) {
  const insets = useSafeAreaInsets();
  // Langer Druck auf einen Knopf zeigt seine Erklärung als Sprechblase
  const [tipLabel, setTipLabel] = React.useState<string | null>(null);
  const tip = (label: string) => ({ onLongPress: () => setTipLabel(label), delayLongPress: 450 });
  // Übung: Knopf, der als Nächstes dran ist, leuchtet auf (nicht mehr, sobald er aktiv ist) und wird in Sicht gescrollt
  const scrollRef = React.useRef<React.ComponentRef<typeof ScrollView>>(null);
  const scrollX = React.useRef(0);
  const coachRefs = { edit: React.useRef<React.ComponentRef<typeof View>>(null), points: React.useRef<React.ComponentRef<typeof View>>(null), polygon: React.useRef<React.ComponentRef<typeof View>>(null) };
  const coachTarget = (['polygon', 'edit', 'points'] as const).find(key => props.coachButtons.includes(key));
  const glow = (key: 'edit' | 'points' | 'polygon', active: boolean) => (coachTarget === key && !active ? COACH_GLOW : null);
  React.useEffect(() => {
    if (!coachTarget) return;
    const timer = setTimeout(() => {
      coachRefs[coachTarget].current?.measureInWindow((x: number) => {
        if (typeof x === 'number') scrollRef.current?.scrollTo({ x: Math.max(0, scrollX.current + x - 60), animated: true });
      });
    }, 400);
    return () => clearTimeout(timer);
  }, [coachTarget]);
  const {
    isPhoneLandscape, isPhoneDevice, setPhotoEditMode, takePhotoAndInsert, t, loadProjectPhotos,
    insertImage, importFromFiles, photoEditMode, setSelectedElementId, setDrawMode, setZoomMode,
    drawMode, selectDrawMode, zoomMode, androidPinchRef, androidTranslateX, androidTranslateY,
    pointMoveOnly, setPointMoveOnly, setShowLineMeasurementNumpad, setSelectedLineSegment,
    setPolylinePoints, polylinePoints, angleSnapEnabled, setAngleSnapEnabled, angleSnapValue,
    showGrid, backgroundImage, gridSnapEnabled, setGridSnapEnabled, selectedElementId,
    setShowDeleteConfirm, showElementStyleEditor, setShowElementStyleEditor, elements, setElements,
    setShowLineTypePicker, showLineTypePicker, lineArrowType, showProtractor, canvasRef,
    protractorCanvasSnapshot, setProtractorCenter, setProtractorRefEnd, setProtractorAngleEnd,
    setShowProtractor, showNotesModal, notes, setShowNotesModal, toolLabels, setShowColorPicker,
    showColorPicker, drawColor, strokeWidths, strokeWidth, updateStrokeWidth, setShowGrid,
    setShowGridSettings, showGridSettings, canUndo, undo, canRedo, redo, clearAll,
  } = props;
  return (
    <>
      {/* Toolbar mit Labels - scrollbar für iPhone und im Querformat */}
      <View ref={tourRef('sk-toolbar')} collapsable={false} style={[styles.toolbarContainer, isPhoneLandscape && { borderBottomWidth: 0.5 }]}>
        <ScrollView 
          ref={scrollRef}
          onScroll={(e) => { scrollX.current = e.nativeEvent.contentOffset.x; }}
          scrollEventThrottle={64}
          horizontal={isPhoneDevice || isPhoneLandscape} 
          showsHorizontalScrollIndicator={isPhoneDevice}
          style={[styles.toolbar, (isPhoneDevice || isPhoneLandscape) && styles.toolbarPhone, isPhoneLandscape && { maxHeight: 50, paddingVertical: 2 }]}
          contentContainerStyle={(isPhoneDevice || isPhoneLandscape) ? styles.toolbarContentPhone : styles.toolbarContent}
        >
        {/* ========== FOTO-TOOLS (VORNE) ========== */}
        
        {/* 1. neues Foto */}
        <View style={styles.toolButtonWithLabel}>
          <TouchableOpacity style={[styles.toolButtonPhotoWide, isPhoneDevice && styles.toolButtonPhotoWidePhone]} {...tip('Foto')} onPress={() => { setPhotoEditMode(false); takePhotoAndInsert(); }}>
            <Ionicons name="camera" size={isPhoneDevice ? 18 : 20} color="#4caf50" />
          </TouchableOpacity>
          <Text style={[styles.toolButtonLabelWide, isPhoneDevice && styles.toolButtonLabelWidePhone]}>{t('sketches.photo')}</Text>
        </View>

        {/* 2. Projektfotos */}
        <View style={styles.toolButtonWithLabel}>
          <TouchableOpacity 
            style={styles.toolButtonPhotoWide} 
            {...tip('Foto aus Projekt')}
            onPress={() => { setPhotoEditMode(false); loadProjectPhotos(); }}
          >
            <Ionicons name="images" size={20} color="#1976d2" />
          </TouchableOpacity>
          <Text style={styles.toolButtonLabelWide}>{t('sketches.photoFromProject')}</Text>
        </View>

        {/* 3. Galeriefotos */}
        <View style={styles.toolButtonWithLabel}>
          <TouchableOpacity style={styles.toolButtonPhotoWide} {...tip('Aus Galerie')} onPress={() => { setPhotoEditMode(false); insertImage(); }}>
            <Ionicons name="image" size={20} color="#9C27B0" />
          </TouchableOpacity>
          <Text style={styles.toolButtonLabelWide}>{t('sketches.photoFromGallery')}</Text>
        </View>

        {/* 3.5 Bild aus Dateien */}
        <View style={styles.toolButtonWithLabel}>
          <TouchableOpacity style={styles.toolButtonPhotoWide} {...tip('Aus Dateien')} onPress={() => { setPhotoEditMode(false); importFromFiles(); }}>
            <Ionicons name="document" size={20} color="#FF5722" />
          </TouchableOpacity>
          <Text style={styles.toolButtonLabelWide}>{t('sketches.fromFiles')}</Text>
        </View>

        {/* 4. Foto Position */}
        <View style={styles.toolButtonWithLabel}>
          <TouchableOpacity 
            style={[styles.toolButtonInner, photoEditMode && styles.photoEditButtonActive]} 
            {...tip('Position')}
            onPress={() => {
              const newPhotoEditMode = !photoEditMode;
              setPhotoEditMode(newPhotoEditMode);
              setSelectedElementId(null);
              if (newPhotoEditMode) {
                // Nur drawMode setzen, ohne photoEditMode zu deaktivieren
                setDrawMode('select');
                setZoomMode(false);
              }
            }}
          >
            <Ionicons name="move" size={18} color={photoEditMode ? '#fff' : '#FF9800'} />
          </TouchableOpacity>
          <Text style={styles.toolButtonLabel}>{t('sketches.position')}</Text>
        </View>

        {/* 5. Foto zuschneiden */}
        <View style={styles.toolButtonWithLabel}>
          <TouchableOpacity 
            style={[styles.toolButtonInner, drawMode === 'crop' && styles.toolButtonActive]} 
            {...tip('Zuschneiden')}
            onPress={() => selectDrawMode(drawMode === 'crop' ? 'select' : 'crop')}
          >
            <Ionicons name="crop-outline" size={18} color={drawMode === 'crop' ? '#fff' : '#9C27B0'} />
          </TouchableOpacity>
          <Text style={[styles.toolButtonLabel, { color: drawMode === 'crop' ? '#9C27B0' : '#333' }]}>{t('sketches.crop')}</Text>
        </View>

        <View style={styles.separator} />

        {/* ========== ZEICHEN-TOOLS ========== */}
        
        {/* Zoom an/aus Toggle - vor Bearbeiten */}
        <View ref={tourRef('sk-zoom')} collapsable={false} style={styles.toolButtonWithLabel}>
          <TouchableOpacity
            style={[
              styles.toolButtonInner, 
              { 
                backgroundColor: zoomMode ? '#e8f5e9' : '#ffebee',
                borderWidth: 2,
                borderColor: zoomMode ? '#4caf50' : '#f44336',
              }
            ]}
            {...tip('Zoom')}
            onPress={() => {
              const newZoomMode = !zoomMode;
              setZoomMode(newZoomMode);
              // Bei Zoom aus → Android-Zoom beibehalten aber Pan zurücksetzen
              // Bei Zoom an → nichts weiter nötig
              if (!newZoomMode && Platform.OS === 'android') {
                // Pan zurücksetzen, Skala beibehalten
                androidPinchRef.current.currentTranslateX = 0;
                androidPinchRef.current.currentTranslateY = 0;
                androidTranslateX.setValue(0);
                androidTranslateY.setValue(0);
              }
            }}
          >
            <Ionicons 
              name="search" 
              size={18} 
              color={zoomMode ? '#4caf50' : '#f44336'} 
            />
          </TouchableOpacity>
          <Text style={[styles.toolButtonLabel, { color: zoomMode ? '#4caf50' : '#f44336' }]}>
            {zoomMode ? 'Zoom' : 'Zoom'}
          </Text>
        </View>
        
        {/* 6. Hand - Bearbeiten */}
        <View style={styles.toolButtonWithLabel}>
          <TouchableOpacity
            style={[styles.toolButtonInner, drawMode === 'select' && styles.toolButtonActive, glow('edit', drawMode === 'select')]}
            {...tip('Bearbeiten (Hand)')}
            ref={coachRefs.edit}
            onPress={() => selectDrawMode('select')}
          >
            <Ionicons name="hand-left" size={18} color={drawMode === 'select' ? '#fff' : '#333'} />
          </TouchableOpacity>
          <Text style={styles.toolButtonLabel}>{t('common.edit')}</Text>
        </View>

        {/* Unterpunkt von Bearbeiten: nur Punkte verschieben (Maß-Fenster bleibt zu) */}
        {drawMode === 'select' && (
          <View style={styles.toolButtonWithLabel}>
            <TouchableOpacity
              testID="point-move-only-toggle"
              accessibilityRole="switch"
              accessibilityState={{ checked: pointMoveOnly }}
              accessibilityLabel="Punkte verschieben"
              style={[styles.toolButtonInner, pointMoveOnly && styles.toolButtonActive, glow('points', pointMoveOnly)]}
              {...tip('Punkte')}
              ref={coachRefs.points}
              onPress={() => {
                setPointMoveOnly(!pointMoveOnly);
                if (!pointMoveOnly) {
                  setShowLineMeasurementNumpad(false);
                  setSelectedLineSegment(null);
                }
              }}
            >
              <Ionicons name="locate" size={18} color={pointMoveOnly ? '#fff' : '#333'} />
            </TouchableOpacity>
            <Text style={styles.toolButtonLabel}>Punkte</Text>
          </View>
        )}

        {/* ========== MAßLINIEN (nach Zoom & Bearbeiten) ========== */}
        <View style={styles.toolGroupWithLabel}>
          <View style={styles.toolGroupRow}>
            {/* Maßlinie Button */}
            <TouchableOpacity
              style={[styles.toolButtonInnerWide, drawMode === 'arrow' && styles.toolButtonActive]}
              {...tip('M (Maßpfeil)')}
              onPress={() => selectDrawMode('arrow')}
            >
              <Svg width={46} height={22} viewBox="0 0 56 28">
                <Polygon 
                  points="2,14 12,6 12,22" 
                  fill={drawMode === 'arrow' ? '#fff' : '#333'} 
                />
                <Polygon 
                  points="54,14 44,6 44,22" 
                  fill={drawMode === 'arrow' ? '#fff' : '#333'} 
                />
                <Line 
                  x1="12" y1="14" x2="44" y2="14" 
                  stroke={drawMode === 'arrow' ? '#fff' : '#333'} 
                  strokeWidth={3} 
                />
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
            {/* Polygon Maße Button */}
            <TouchableOpacity
              style={[styles.toolButtonInner, drawMode === 'polyline' && styles.toolButtonActive, glow('polygon', drawMode === 'polyline')]}
              {...tip('Polygon')}
              ref={coachRefs.polygon}
              onPress={() => {
                selectDrawMode('polyline');
                setPolylinePoints([]);
              }}
            >
              <Ionicons name="git-network-outline" size={22} color={drawMode === 'polyline' ? '#fff' : '#333'} />
            </TouchableOpacity>
            {/* Winkel-Snap Toggle - sichtbar wenn Polyline aktiv */}
            {drawMode === 'polyline' && polylinePoints.length === 0 && (
              <>
                <TouchableOpacity
                  style={[
                    styles.toolButtonInner, 
                    { 
                      backgroundColor: angleSnapEnabled ? '#1976d2' : '#f5f5f5',
                      borderWidth: 1,
                      borderColor: angleSnapEnabled ? '#1565c0' : '#ddd',
                    }
                  ]}
                  onPress={() => setAngleSnapEnabled(!angleSnapEnabled)}
                >
                  <Text style={{ fontSize: 10, fontWeight: '700', color: angleSnapEnabled ? '#fff' : '#666' }}>
                    {angleSnapEnabled ? `${angleSnapValue}°` : '∠'}
                  </Text>
                </TouchableOpacity>
                {showGrid && !backgroundImage && (
                  <TouchableOpacity
                    style={[
                      styles.toolButtonInner, 
                      { 
                        backgroundColor: gridSnapEnabled ? '#4caf50' : '#f5f5f5',
                        borderWidth: 1,
                        borderColor: gridSnapEnabled ? '#388e3c' : '#ddd',
                      }
                    ]}
                    onPress={() => setGridSnapEnabled(!gridSnapEnabled)}
                  >
                    <Ionicons name="grid-outline" size={16} color={gridSnapEnabled ? '#fff' : '#666'} />
                  </TouchableOpacity>
                )}
              </>
            )}
            {/* Punkt hinzufügen Button */}
            <TouchableOpacity
              style={[styles.toolButtonInner, drawMode === 'addPoint' && styles.toolButtonActive]}
              {...tip('+Pt')}
              onPress={() => selectDrawMode('addPoint')}
            >
              <Ionicons name="add-circle-outline" size={22} color={drawMode === 'addPoint' ? '#fff' : '#4caf50'} />
            </TouchableOpacity>
            {/* Punkt entfernen Button */}
            <TouchableOpacity
              style={[styles.toolButtonInner, drawMode === 'removePoint' && styles.toolButtonActive]}
              {...tip('-Pt')}
              onPress={() => selectDrawMode('removePoint')}
            >
              <Ionicons name="remove-circle-outline" size={22} color={drawMode === 'removePoint' ? '#fff' : '#f44336'} />
            </TouchableOpacity>
          </View>
          <View style={styles.toolGroupLabelRow}>
            <Text style={[styles.toolButtonLabelSmall, { flex: 1, textAlign: 'center' }]}>{t('sketches.measurementLine')}</Text>
            <Text style={[styles.toolButtonLabelSmall, { flex: 1, textAlign: 'center' }]}>{t('sketches.polygon')}</Text>
            <Text style={[styles.toolButtonLabelSmall, { flex: 1, textAlign: 'center' }]}>{t('sketches.addPoint')}</Text>
            <Text style={[styles.toolButtonLabelSmall, { flex: 1, textAlign: 'center' }]}>{t('sketches.removePoint')}</Text>
          </View>
        </View>

        {/* Element löschen Button - zwischen Maßlinien und Stift */}
        <View style={styles.toolButtonWithLabel}>
          <TouchableOpacity
            style={[styles.toolButtonInner, !selectedElementId && styles.toolButtonDisabled]}
            {...tip('Element löschen')}
            onPress={() => {
              if (selectedElementId) {
                setShowDeleteConfirm(true);
              }
            }}
            disabled={!selectedElementId}
          >
            <Ionicons name="trash" size={18} color={selectedElementId ? '#f44336' : '#ccc'} />
          </TouchableOpacity>
          <Text style={[styles.toolButtonLabel, { color: selectedElementId ? '#f44336' : '#ccc' }]}>{t('sketches.deleteElement')}</Text>
        </View>

        {/* Stil bearbeiten Button */}
        <View style={styles.toolButtonWithLabel}>
          <TouchableOpacity
            style={[
              styles.toolButtonInner, 
              !selectedElementId && styles.toolButtonDisabled,
              showElementStyleEditor && selectedElementId && styles.toolButtonActive,
            ]}
            {...tip('Stil')}
            onPress={() => {
              if (selectedElementId) {
                setShowElementStyleEditor(!showElementStyleEditor);
              }
            }}
            disabled={!selectedElementId}
          >
            <Ionicons name="color-palette" size={18} color={selectedElementId ? (showElementStyleEditor ? '#fff' : '#1976d2') : '#ccc'} />
          </TouchableOpacity>
          <Text style={[styles.toolButtonLabel, { color: selectedElementId ? '#1976d2' : '#ccc' }]}>{t('sketches.editStyle')}</Text>
        </View>

        {/* Pfeil-Konvertierung Button - nur sichtbar wenn Linie ausgewählt */}
        {selectedElementId && elements.find(el => el.id === selectedElementId)?.type === 'line' && (
          <View style={styles.toolGroupWithLabel}>
            <View style={styles.toolGroupRow}>
              {/* Einfacher Pfeil → */}
              <TouchableOpacity
                style={[
                  styles.toolButtonInner,
                  elements.find(el => el.id === selectedElementId)?.data?.arrowHeads === 'end' && styles.toolButtonActive,
                ]}
                onPress={() => {
                  const el = elements.find(e => e.id === selectedElementId);
                  if (el && el.type === 'line') {
                    const currentHeads = el.data.arrowHeads || 'none';
                    const newHeads = currentHeads === 'end' ? 'none' : 'end';
                    setElements(prev => prev.map(e => 
                      e.id === selectedElementId 
                        ? { ...e, data: { ...e.data, arrowHeads: newHeads } }
                        : e
                    ));
                  }
                }}
              >
                <Svg width={24} height={18} viewBox="0 0 24 18">
                  <Line x1="2" y1="9" x2="18" y2="9" stroke={elements.find(el => el.id === selectedElementId)?.data?.arrowHeads === 'end' ? '#fff' : '#333'} strokeWidth={2.5} />
                  <Polygon points="22,9 16,4 16,14" fill={elements.find(el => el.id === selectedElementId)?.data?.arrowHeads === 'end' ? '#fff' : '#333'} />
                </Svg>
              </TouchableOpacity>
              {/* Doppelpfeil ↔ */}
              <TouchableOpacity
                style={[
                  styles.toolButtonInner,
                  elements.find(el => el.id === selectedElementId)?.data?.arrowHeads === 'both' && styles.toolButtonActive,
                ]}
                onPress={() => {
                  const el = elements.find(e => e.id === selectedElementId);
                  if (el && el.type === 'line') {
                    const currentHeads = el.data.arrowHeads || 'none';
                    const newHeads = currentHeads === 'both' ? 'none' : 'both';
                    setElements(prev => prev.map(e => 
                      e.id === selectedElementId 
                        ? { ...e, data: { ...e.data, arrowHeads: newHeads } }
                        : e
                    ));
                  }
                }}
              >
                <Svg width={24} height={18} viewBox="0 0 24 18">
                  <Polygon points="2,9 8,4 8,14" fill={elements.find(el => el.id === selectedElementId)?.data?.arrowHeads === 'both' ? '#fff' : '#333'} />
                  <Line x1="6" y1="9" x2="18" y2="9" stroke={elements.find(el => el.id === selectedElementId)?.data?.arrowHeads === 'both' ? '#fff' : '#333'} strokeWidth={2.5} />
                  <Polygon points="22,9 16,4 16,14" fill={elements.find(el => el.id === selectedElementId)?.data?.arrowHeads === 'both' ? '#fff' : '#333'} />
                </Svg>
              </TouchableOpacity>
            </View>
            <Text style={styles.toolGroupLabel}>Pfeil</Text>
          </View>
        )}

        <View style={styles.separator} />

        {/* 7. Stift */}
        <View style={styles.toolButtonWithLabel}>
          <TouchableOpacity
            style={[styles.toolButtonInner, drawMode === 'pen' && styles.toolButtonActive]}
            {...tip('Stift')}
            onPress={() => selectDrawMode('pen')}
          >
            <Ionicons name="create" size={18} color={drawMode === 'pen' ? '#fff' : '#333'} />
          </TouchableOpacity>
          <Text style={styles.toolButtonLabel}>{t('sketches.pen')}</Text>
        </View>

        {/* 8. Formen (Linie/Pfeil, Kreis, Rechteck) */}
        <View style={styles.toolGroupWithLabel}>
          <View style={styles.toolGroupRow}>
            {/* Linie/Pfeil Button mit Auswahl-Popup */}
            <View style={{ zIndex: 9999 }}>
              <TouchableOpacity
                style={[styles.toolButtonInner, drawMode === 'line' && styles.toolButtonActive]}
                {...tip('Linie')}
                onPress={() => {
                  if (drawMode === 'line') {
                    // Bereits aktiv → Modal toggle
                    setShowLineTypePicker(!showLineTypePicker);
                  } else {
                    selectDrawMode('line');
                    setShowLineTypePicker(true);
                  }
                }}
              >
                {lineArrowType === 'none' ? (
                  <Ionicons name="remove" size={18} color={drawMode === 'line' ? '#fff' : '#333'} />
                ) : lineArrowType === 'end' ? (
                  <Svg width={20} height={16} viewBox="0 0 24 18">
                    <Line x1="2" y1="9" x2="17" y2="9" stroke={drawMode === 'line' ? '#fff' : '#333'} strokeWidth={2.5} />
                    <Polygon points="22,9 16,4 16,14" fill={drawMode === 'line' ? '#fff' : '#333'} />
                  </Svg>
                ) : (
                  <Svg width={20} height={16} viewBox="0 0 24 18">
                    <Polygon points="2,9 8,4 8,14" fill={drawMode === 'line' ? '#fff' : '#333'} />
                    <Line x1="6" y1="9" x2="18" y2="9" stroke={drawMode === 'line' ? '#fff' : '#333'} strokeWidth={2.5} />
                    <Polygon points="22,9 16,4 16,14" fill={drawMode === 'line' ? '#fff' : '#333'} />
                  </Svg>
                )}
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              style={[styles.toolButtonInner, drawMode === 'circle' && styles.toolButtonActive]}
              {...tip('Kreis')}
              onPress={() => { selectDrawMode('circle'); setShowLineTypePicker(false); }}
            >
              <Ionicons name="ellipse-outline" size={18} color={drawMode === 'circle' ? '#fff' : '#333'} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.toolButtonInner, drawMode === 'rect' && styles.toolButtonActive]}
              {...tip('Rechteck')}
              onPress={() => { selectDrawMode('rect'); setShowLineTypePicker(false); }}
            >
              <Ionicons name="square-outline" size={18} color={drawMode === 'rect' ? '#fff' : '#333'} />
            </TouchableOpacity>
          </View>
          <View style={styles.toolGroupLabelRow}>
            <Text style={[styles.toolButtonLabelSmall, { flex: 1, textAlign: 'center' }]}>
              {lineArrowType === 'none' ? t('sketches.line') : lineArrowType === 'end' ? 'Pfeil' : 'Doppel'}
            </Text>
            <Text style={[styles.toolButtonLabelSmall, { flex: 1, textAlign: 'center' }]}>{t('sketches.circle')}</Text>
            <Text style={[styles.toolButtonLabelSmall, { flex: 1, textAlign: 'center' }]}>{t('sketches.rect')}</Text>
          </View>
        </View>

        {/* Winkelmesser */}
        <View style={styles.toolButtonWithLabel}>
          <TouchableOpacity
            style={[styles.toolButtonInner, showProtractor && styles.toolButtonActive]}
            {...tip('Winkel')}
            onPress={() => {
              if (!showProtractor) {
                // Canvas-Snapshot erstellen BEVOR das Protractor-Overlay angezeigt wird
                if (canvasRef.current) {
                  captureRef(canvasRef.current, {
                    format: 'png',
                    quality: 0.8,
                    result: 'data-uri',
                  }).then((uri: string) => {
                    protractorCanvasSnapshot.current = uri;
                    console.log('Protractor canvas snapshot captured');
                  }).catch((err: Error) => {
                    console.log('Canvas snapshot error:', err);
                    protractorCanvasSnapshot.current = null;
                  });
                }
                // Neuen Winkelmesser öffnen → Position zurücksetzen
                setProtractorCenter({ x: 0, y: 0 });
                setProtractorRefEnd({ x: 0, y: 0 });
                setProtractorAngleEnd({ x: 0, y: 0 });
              }
              setShowProtractor(!showProtractor);
            }}
          >
            <Svg width={22} height={22} viewBox="0 0 24 24">
              <Path 
                d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z" 
                fill="none"
                stroke={showProtractor ? '#fff' : '#FF5722'}
                strokeWidth={1.5}
              />
              <Line x1="12" y1="12" x2="12" y2="4" stroke={showProtractor ? '#fff' : '#FF5722'} strokeWidth={2} />
              <Line x1="12" y1="12" x2="20" y2="12" stroke={showProtractor ? '#fff' : '#FF5722'} strokeWidth={2} />
              <Path 
                d="M12 8 A4 4 0 0 1 16 12" 
                fill="none"
                stroke={showProtractor ? '#fff' : '#FF5722'}
                strokeWidth={1.5}
              />
            </Svg>
          </TouchableOpacity>
          <Text style={[styles.toolButtonLabel, { color: showProtractor ? '#FF5722' : '#333' }]}>{t('sketches.angleSnap')}</Text>
        </View>

        {/* ========== TEXT & MEMO (ohne Editieren-Button) ========== */}
        <View style={styles.toolGroupWithLabel}>
          <View style={styles.toolGroupRow}>
            {/* Memo-Pfeil */}
            <TouchableOpacity
              style={[styles.toolButtonInner, drawMode === 'pointer' && styles.toolButtonActive]}
              {...tip('Zeiger')}
              onPress={() => selectDrawMode('pointer')}
            >
              <Ionicons name="arrow-forward" size={20} color={drawMode === 'pointer' ? '#fff' : '#e91e63'} />
            </TouchableOpacity>
            {/* Text Button */}
            <TouchableOpacity
              style={[styles.toolButtonInner, drawMode === 'text' && styles.toolButtonActive]}
              {...tip('Text')}
              onPress={() => selectDrawMode('text')}
            >
              <Ionicons name="text" size={18} color={drawMode === 'text' ? '#fff' : '#333'} />
            </TouchableOpacity>
            {/* Notiz Button (Annotation Memo) */}
            <TouchableOpacity
              style={[styles.toolButtonInner, drawMode === 'memo' && styles.toolButtonActive]}
              {...tip('Memo')}
              onPress={() => selectDrawMode('memo')}
            >
              <Ionicons name="chatbox-outline" size={18} color={drawMode === 'memo' ? '#fff' : '#E74C3C'} />
            </TouchableOpacity>
            {/* Notizen zur Skizze Button */}
            <TouchableOpacity
              style={[styles.toolButtonInner, showNotesModal && styles.toolButtonActive, notes.trim() && !showNotesModal && styles.toolButtonWithBadge]}
              {...tip('Notizen')}
              onPress={() => setShowNotesModal(true)}
            >
              <View style={styles.notesButtonContainer}>
                <Ionicons name="document-text-outline" size={18} color={showNotesModal ? '#fff' : notes.trim() ? '#4caf50' : '#333'} />
                {notes.trim().length > 0 && (
                  <View style={styles.notesBadge}>
                    <Ionicons name="checkmark" size={8} color="#fff" />
                  </View>
                )}
              </View>
            </TouchableOpacity>
          </View>
          <View style={styles.toolGroupLabelRow}>
            <Text style={[styles.toolButtonLabelSmall, { flex: 1, textAlign: 'center' }]} numberOfLines={1}>{toolLabels.pointerCode}</Text>
            <Text style={[styles.toolButtonLabelSmall, { flex: 1, textAlign: 'center' }]}>{t('sketches.text')}</Text>
            <Text style={[styles.toolButtonLabelSmall, { flex: 1, textAlign: 'center' }]} numberOfLines={1}>{toolLabels.memoCode}</Text>
            <Text style={[styles.toolButtonLabelSmall, { flex: 1, textAlign: 'center' }]}>{t('sketches.notes')}</Text>
          </View>
        </View>

        <View style={styles.separator} />

        {/* ========== FARBEN & STRICHSTÄRKEN (ZEICHENLEISTE) ========== */}
        <View style={styles.toolGroupWithLabel}>
          <View style={styles.toolGroupRow}>
            {/* Color picker */}
            <TouchableOpacity style={styles.toolButtonInner} {...tip('Farbe und Strichstärke')} onPress={() => setShowColorPicker(!showColorPicker)}>
              <View style={[styles.colorPreviewSmall, { backgroundColor: drawColor }]} />
            </TouchableOpacity>

            {/* Stroke width - inline */}
            {strokeWidths.map(w => (
              <TouchableOpacity
                key={w}
                style={[styles.strokeWidthButtonSmall, strokeWidth === w && styles.strokeWidthButtonActive]}
                onPress={() => updateStrokeWidth(w)}
              >
                <View style={[styles.strokeWidthDot, { width: w * 1.5, height: w * 1.5 }]} />
              </TouchableOpacity>
            ))}
          </View>
          <Text style={styles.toolButtonLabel}>{t('sketches.drawBar')}</Text>
        </View>

        <View style={styles.separator} />

        {/* ========== GITTER & ZOOM ========== */}
        <View style={styles.toolGroupWithLabel}>
          <View style={styles.toolGroupRow}>
            {/* Gitter Toggle - größerer Button mit "Raster" Text */}
            <TouchableOpacity 
              style={[
                styles.toolButtonZoomSize, 
                showGrid && !backgroundImage && styles.gridButtonActive
              ]} 
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
                size={16} 
                color={backgroundImage ? '#ccc' : (showGrid ? '#fff' : '#333')} 
              />
              <Text style={{ 
                fontSize: 8, 
                fontWeight: 'bold', 
                color: backgroundImage ? '#ccc' : (showGrid ? '#fff' : '#333'),
                marginTop: 1,
              }}>
                {t('sketches.grid')}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.separator} />

        {/* ========== UNDO/REDO ========== */}
        <View ref={tourRef('sk-undo')} collapsable={false} style={styles.toolGroupWithLabel}>
          <View style={styles.toolGroupRow}>
            <TouchableOpacity
              style={[styles.toolButtonInner, !canUndo && styles.toolButtonDisabled]}
              testID="sketch-undo-button"
              {...tip('Rückgängig')}
              onPress={undo}
              disabled={!canUndo}
            >
              <Ionicons name="arrow-undo" size={18} color={canUndo ? '#1976d2' : '#ccc'} />
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[styles.toolButtonInner, !canRedo && styles.toolButtonDisabled]}
              testID="sketch-redo-button"
              {...tip('Wiederholen')}
              onPress={redo}
              disabled={!canRedo}
            >
              <Ionicons name="arrow-redo" size={18} color={canRedo ? '#1976d2' : '#ccc'} />
            </TouchableOpacity>
          </View>
          <Text style={styles.toolButtonLabel}>{t('sketches.undoRedo')}</Text>
        </View>

        <View style={styles.separator} />

        {/* ========== SEITE LÖSCHEN ========== */}
        <View style={styles.toolButtonWithLabel}>
          <TouchableOpacity style={styles.toolButtonInner} {...tip('Alles löschen')} onPress={() => {
            if (Platform.OS === 'web') {
              if (confirm('Möchten Sie alle Elemente löschen?')) {
                clearAll();
              }
            } else {
              Alert.alert(t('sketches.clear'), t('sketches.clearConfirm'), [
                { text: t('common.cancel'), style: 'cancel' },
                { text: t('common.delete'), style: 'destructive', onPress: clearAll },
              ]);
            }
          }}>
            <Ionicons name="trash-bin" size={18} color="#f44336" />
          </TouchableOpacity>
          <Text style={[styles.toolButtonLabel, { color: '#f44336' }]}>{t('sketches.deletePage')}</Text>
        </View>
      </ScrollView>
      </View>
      <ButtonTip label={tipLabel} top={insets.top + 150} onClose={() => setTipLabel(null)} />
    </>
  );
}

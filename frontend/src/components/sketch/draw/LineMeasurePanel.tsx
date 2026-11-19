import type { WallOpening } from '../../../sketch/wallArea';
import type { PanResponderInstance, TextInput } from 'react-native';
import type { TFunction } from 'i18next';
import type { EdgeInsets } from 'react-native-safe-area-context';
import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, Animated, Pressable } from 'react-native';
import { styles } from '../../../styles/sketchDrawStyles';
import Ionicons from '@react-native-vector-icons/ionicons';
import { DrawElement } from '../../../sketch/sketchShared';
import { PolygonAreaShapes, PolygonAreaOptions } from '../../../sketch/polygonArea';
import BufferedTextInput from '../../BufferedTextInput';
import { playLaserFeedback } from '../../../utils/laserFeedback';
import { NumpadTarget } from '../WallHeightSection';
import { PolygonWalls, segmentCountOf } from '../../../sketch/wallArea';
import { MeasurePanelOptions } from './MeasurePanelOptions';
import { MeasureLineStyleSection } from './MeasureLineStyleSection';
import { MeasurePanelKeyboard } from './MeasurePanelKeyboard';


export type LineMeasurePanelProps = {
  showLineMeasurementNumpad: boolean;
  isPhoneDevice: boolean;
  numpadSize: "S" | "M" | "L";
  screenWidth: number;
  screenHeight: number;
  insets: EdgeInsets;
  panelKeyboardOpen: boolean;
  measureKeyboardHeight: number;
  measureKeyboardMode: "numbers" | "letters";
  panelOptionsOpen: boolean;
  wallSectionOpen: boolean;
  measurePanelPan: Animated.ValueXY;
  measurePanelPanResponder: PanResponderInstance;
  t: TFunction<"translation", undefined>;
  setShowLineMeasurementNumpad: React.Dispatch<React.SetStateAction<boolean>>;
  setLineMeasurementExpression: React.Dispatch<React.SetStateAction<string>>;
  setSelectedLineSegment: React.Dispatch<React.SetStateAction<{ elementId: string; segmentIndex: number; } | null>>;
  selectedLineSegment: { elementId: string; segmentIndex: number; } | null;
  elements: DrawElement[];
  lineSegmentMeasurements: { [key: string]: { [segmentIndex: number]: string; }; };
  lineMeasurementInputRef: React.RefObject<TextInput | null>;
  lineMeasurementExpression: string;
  clearNumpadTarget: () => void;
  laserSound: boolean;
  changePanelKeyboardOpen: (open: boolean) => void;
  lineAutoAdd: boolean;
  addMeasurementToSelectedLine: (expression?: string) => void;
  removeMeasurementFromSelectedLine: () => void;
  changePanelOptionsOpen: (open: boolean) => void;
  changeLineAutoAdd: (enabled: boolean) => void;
  lineAutoNext: boolean;
  changeLineAutoNext: (enabled: boolean) => void;
  changeLaserSound: (enabled: boolean) => void;
  lineMeasureHistory: { elementId: string; segmentIndex: number; previous?: string; }[];
  undoLastLineMeasurement: () => void;
  lineNumbersVisible: boolean;
  changeLineNumbersVisible: (visible: boolean) => void;
  polygonWalls: PolygonWalls;
  setPolygonWalls: React.Dispatch<React.SetStateAction<PolygonWalls>>;
  setWallSectionOpen: React.Dispatch<React.SetStateAction<boolean>>;
  numpadTargetId: string | null;
  setPanelKeyboardOpen: React.Dispatch<React.SetStateAction<boolean>>;
  numpadTargetRef: React.RefObject<NumpadTarget | null>;
  setNumpadTargetId: React.Dispatch<React.SetStateAction<string | null>>;
  pendingAreaField: string | null;
  setPendingAreaField: React.Dispatch<React.SetStateAction<string | null>>;
  straightenPolygon: (elementId: string, points: { x: number; y: number }[]) => void;
  straightenAllPolygons: () => void;
  startPractice: () => void;
  practice: boolean;
  openingCopy: { elementId: string; segmentIndex: number; openingIndex: number; opening: WallOpening; } | null;
  setOpeningCopy: React.Dispatch<React.SetStateAction<{ elementId: string; segmentIndex: number; openingIndex: number; opening: WallOpening; } | null>>;
  calculatePolygonAreaM2: (element: DrawElement) => number | null;
  polygonAreaVisible: { [elementId: string]: boolean; };
  setPolygonAreaVisible: React.Dispatch<React.SetStateAction<{ [elementId: string]: boolean; }>>;
  formatAreaM2: (area: number) => string;
  polygonAreaOptions: PolygonAreaOptions;
  polygonAreaShapes: PolygonAreaShapes;
  diagonalPick: { elementId: string; first: number | null; } | null;
  setDiagonalPick: React.Dispatch<React.SetStateAction<{ elementId: string; first: number | null; } | null>>;
  setPolygonAreaOptions: React.Dispatch<React.SetStateAction<PolygonAreaOptions>>;
  setShowMeasureStyleSettings: React.Dispatch<React.SetStateAction<boolean>>;
  showMeasureStyleSettings: boolean;
  tempMeasureLineColor: string;
  setTempMeasureLineColor: React.Dispatch<React.SetStateAction<string>>;
  setMeasureLineStyles: React.Dispatch<React.SetStateAction<{ [elementId: string]: { color: string; strokeWidth: number; fontSize: number; }; }>>;
  tempMeasureLineStrokeWidth: number;
  setTempMeasureLineStrokeWidth: React.Dispatch<React.SetStateAction<number>>;
  tempMeasureLineFontSize: number;
  setTempMeasureLineFontSize: React.Dispatch<React.SetStateAction<number>>;
  setMeasureKeyboardHeight: React.Dispatch<React.SetStateAction<number>>;
  numpadTargetLabel: (id: string) => string;
  numpadTargetValue: (id: string) => string;
  changeNumpadSize: (newSize: "S" | "M" | "L") => void;
  setMeasureKeyboardMode: React.Dispatch<React.SetStateAction<"numbers" | "letters">>;
  numpadScales: { S: number; M: number; L: number; };
  handleLineMeasurementNumpadPress: (key: string) => void;
  typeIntoPanelField: (update: (prev: string) => string) => void;
  measureKeyboardCaps: boolean;
  setMeasureKeyboardCaps: React.Dispatch<React.SetStateAction<boolean>>;
};

export function LineMeasurePanel(props: LineMeasurePanelProps) {
  const scrollRef = React.useRef<React.ComponentRef<typeof ScrollView>>(null);
  const {
    showLineMeasurementNumpad, isPhoneDevice, numpadSize, screenWidth, screenHeight, insets,
    panelKeyboardOpen, measureKeyboardHeight, measureKeyboardMode, panelOptionsOpen, wallSectionOpen,
    measurePanelPan, measurePanelPanResponder, t, setShowLineMeasurementNumpad,
    setLineMeasurementExpression, setSelectedLineSegment, selectedLineSegment, elements,
    lineSegmentMeasurements, lineMeasurementInputRef, lineMeasurementExpression, clearNumpadTarget,
    laserSound, changePanelKeyboardOpen, lineAutoAdd, addMeasurementToSelectedLine,
    removeMeasurementFromSelectedLine, changePanelOptionsOpen, changeLineAutoAdd, lineAutoNext,
    changeLineAutoNext, changeLaserSound, lineMeasureHistory, undoLastLineMeasurement,
    lineNumbersVisible, changeLineNumbersVisible, polygonWalls, setPolygonWalls, setWallSectionOpen,
    numpadTargetId, setPanelKeyboardOpen, numpadTargetRef, setNumpadTargetId, pendingAreaField, setPendingAreaField, straightenPolygon, straightenAllPolygons, openingCopy, setOpeningCopy, startPractice, practice, calculatePolygonAreaM2,
    polygonAreaVisible, setPolygonAreaVisible, formatAreaM2, polygonAreaOptions, polygonAreaShapes,
    diagonalPick, setDiagonalPick, setPolygonAreaOptions, setShowMeasureStyleSettings,
    showMeasureStyleSettings, tempMeasureLineColor, setTempMeasureLineColor, setMeasureLineStyles,
    tempMeasureLineStrokeWidth, setTempMeasureLineStrokeWidth, tempMeasureLineFontSize,
    setTempMeasureLineFontSize, setMeasureKeyboardHeight, numpadTargetLabel, numpadTargetValue,
    changeNumpadSize, setMeasureKeyboardMode, numpadScales, handleLineMeasurementNumpadPress,
    typeIntoPanelField, measureKeyboardCaps, setMeasureKeyboardCaps,
  } = props;
  return (
    <>
      {/* Schwebendes Maß-Eingabe Panel */}
      {showLineMeasurementNumpad && (() => {
        // Dynamische Breite: Im Buchstaben-Modus auf iPhone breiter für QWERTZ-Layout
        const measureNumericWidth = isPhoneDevice
          ? (numpadSize === 'L' ? Math.max(Math.round(screenWidth * 0.55), 200) : numpadSize === 'M' ? Math.max(Math.round(screenWidth * 0.45), 170) : Math.max(Math.round(screenWidth * 0.35), 140))
          : (numpadSize === 'L' ? Math.round(screenWidth * 0.33) : numpadSize === 'M' ? Math.round(screenWidth * 0.27) : Math.round(screenWidth * 0.22));
        // Inhalt scrollbar, damit die Knöpfe unten immer erreichbar bleiben
        const MeasurePanelBody = ScrollView;
        const measurePanelBodyProps = {
          style: { maxHeight: Math.max(120, screenHeight - insets.top - insets.bottom - (isPhoneDevice ? 250 : 300) - (panelKeyboardOpen ? measureKeyboardHeight : 0)) },
          keyboardShouldPersistTaps: 'always' as const, testID: 'line-measure-scroll',
        };
        const measurePanelWidth = (isPhoneDevice && measureKeyboardMode === 'letters')
          ? Math.round(screenWidth * 0.92)
          // iPhone: mit aufgeklapptem Wand-Bereich breiter, damit Öffnungsmaße lesbar sind
          : (isPhoneDevice && panelOptionsOpen && wallSectionOpen)
            ? Math.max(measureNumericWidth, Math.round(screenWidth * 0.78))
            : measureNumericWidth;
        return (
        <Animated.View 
          style={[
            styles.floatingMeasurePanel,
            { 
              transform: measurePanelPan.getTranslateTransform(),
              width: measurePanelWidth,
            }
          ]}
        >
          {/* Header: Drag-Handle + Close-Button getrennt für Apple Pencil Kompatibilität */}
          <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#f8f8f8', borderBottomWidth: 1, borderBottomColor: '#e0e0e0' }}>
            <View {...measurePanelPanResponder.panHandlers} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: isPhoneDevice ? 6 : 12, paddingVertical: isPhoneDevice ? 4 : 8 }}>
              <View style={styles.floatingMeasureDragHandle} />
              <Text style={[styles.floatingMeasureTitle, isPhoneDevice && { fontSize: 11 }]} numberOfLines={1}>{t('sketches.enterMeasurement')}</Text>
            </View>
            <Pressable
              onPress={() => {
                setShowLineMeasurementNumpad(false);
                setLineMeasurementExpression('');
                setSelectedLineSegment(null);
              }}
              style={{ 
                width: isPhoneDevice ? 32 : 44, height: isPhoneDevice ? 32 : 44, 
                alignItems: 'center', justifyContent: 'center',
                backgroundColor: '#f0f0f0', borderRadius: isPhoneDevice ? 16 : 22,
                marginRight: isPhoneDevice ? 4 : 6,
              }}
            >
              <Ionicons name="close" size={isPhoneDevice ? 18 : 22} color="#666" />
            </Pressable>
          </View>
          
          {/* Inhalt: auf dem iPhone scrollbar, damit die Knöpfe unten erreichbar bleiben */}
          <MeasurePanelBody ref={scrollRef} {...measurePanelBodyProps}>
          {/* Fortschritt: Linie x von n */}
          {selectedLineSegment && (() => {
            const segmentCount = segmentCountOf(elements.find(e => e.id === selectedLineSegment.elementId));
            if (segmentCount < 2) return null;
            const measured = lineSegmentMeasurements[selectedLineSegment.elementId] || {};
            const open = Array.from({ length: segmentCount }, (_, i) => i).filter(i => !measured[i]).length;
            return (
              <Text testID="line-measure-progress" style={{ fontSize: 12, fontWeight: '700', color: '#1976d2', paddingHorizontal: 10, marginBottom: 6 }}>
                Linie {selectedLineSegment.segmentIndex + 1} von {segmentCount} · {open === 0 ? 'alle bemaßt' : `${open} offen`}
              </Text>
            );
          })()}

          {/* Eingabe + Löschen */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, marginBottom: 6 }}>
            <BufferedTextInput replaceOnBurst
              ref={lineMeasurementInputRef}
              containerStyle={{ flex: 1 }}
              style={[styles.modalInput, { marginBottom: 0, fontSize: 15, paddingVertical: 8 }]}
              value={lineMeasurementExpression}
              onChangeText={setLineMeasurementExpression}
              placeholder={
                selectedLineSegment && lineSegmentMeasurements[selectedLineSegment.elementId]?.[selectedLineSegment.segmentIndex]
                  ? `Aktuell: ${lineSegmentMeasurements[selectedLineSegment.elementId][selectedLineSegment.segmentIndex]}`
                  : 'z.B. 2,50m oder Text'
              }
              showSoftInputOnFocus={false}
              caretHidden={false}
              onFocus={clearNumpadTarget}
              onDeviceInput={(value) => {
                if (laserSound) playLaserFeedback();
                // Laser erkannt: Bildschirm-Tastatur wird nicht gebraucht
                if (panelKeyboardOpen) changePanelKeyboardOpen(false);
                if (lineAutoAdd) addMeasurementToSelectedLine(value);
              }}
            />
            {selectedLineSegment && lineSegmentMeasurements[selectedLineSegment.elementId]?.[selectedLineSegment.segmentIndex] && (
              <TouchableOpacity
                style={{
                  width: 38, height: 38,
                  alignItems: 'center', justifyContent: 'center',
                  backgroundColor: '#ffebee', borderRadius: 8,
                  borderWidth: 1, borderColor: '#ef9a9a',
                }}
                onPress={() => {
                  removeMeasurementFromSelectedLine();
                  setShowLineMeasurementNumpad(false);
                  setLineMeasurementExpression('');
                }}
              >
                <Ionicons name="trash-outline" size={18} color="#f44336" />
              </TouchableOpacity>
            )}
          </View>
          
          {/* Einklappen: Optionen / Tastatur */}
          <View style={{ flexDirection: 'row', gap: 6, marginHorizontal: 10, marginBottom: 6 }}>
            {([
              { id: 'panel-options-toggle', label: 'Mehr', icon: 'options', open: panelOptionsOpen, set: changePanelOptionsOpen },
              { id: 'panel-keyboard-toggle', label: 'Tastatur', icon: 'keypad', open: panelKeyboardOpen, set: changePanelKeyboardOpen },
            ] as const).map(sec => (
              <TouchableOpacity
                key={sec.id}
                testID={sec.id}
                accessibilityState={{ expanded: sec.open }}
                style={{
                  flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, minHeight: 36,
                  paddingHorizontal: 4, borderRadius: 8, borderWidth: 1,
                  backgroundColor: sec.open ? '#e3f2fd' : '#f5f5f5', borderColor: sec.open ? '#90caf9' : '#ddd',
                }}
                onPress={() => sec.set(!sec.open)}
              >
                <Ionicons name={sec.icon} size={14} color={sec.open ? '#1976d2' : '#666'} />
                {!isPhoneDevice && <Text style={{ fontSize: 11, fontWeight: '600', color: sec.open ? '#1976d2' : '#666' }} numberOfLines={1}>{sec.label}</Text>}
                <Ionicons name={sec.open ? 'chevron-up' : 'chevron-down'} size={14} color={sec.open ? '#1976d2' : '#666'} />
              </TouchableOpacity>
            ))}
          </View>

          <MeasurePanelOptions
            scrollMeasurePanelTo={(y) => scrollRef.current?.scrollTo({ y: Math.max(0, y - 30), animated: true })}
            {...{
              panelOptionsOpen, isPhoneDevice, lineAutoAdd, changeLineAutoAdd, lineAutoNext,
              changeLineAutoNext, laserSound, changeLaserSound, lineMeasureHistory,
              undoLastLineMeasurement, lineNumbersVisible, changeLineNumbersVisible,
              selectedLineSegment, elements, lineSegmentMeasurements, polygonWalls, setPolygonWalls,
              wallSectionOpen, setWallSectionOpen, numpadTargetId, panelKeyboardOpen,
              setPanelKeyboardOpen, numpadTargetRef, setNumpadTargetId, pendingAreaField, setPendingAreaField, straightenPolygon, straightenAllPolygons, openingCopy, setOpeningCopy, startPractice, practice, calculatePolygonAreaM2,
              polygonAreaVisible, setPolygonAreaVisible, formatAreaM2, polygonAreaOptions,
              polygonAreaShapes, diagonalPick, setDiagonalPick, setPolygonAreaOptions,
            }}
          />

          <MeasureLineStyleSection
            {...{
              panelOptionsOpen, setShowMeasureStyleSettings, showMeasureStyleSettings, t,
              tempMeasureLineColor, setTempMeasureLineColor, selectedLineSegment,
              setMeasureLineStyles, tempMeasureLineStrokeWidth, setTempMeasureLineStrokeWidth,
              tempMeasureLineFontSize, setTempMeasureLineFontSize,
            }}
          />
          
          </MeasurePanelBody>
          <MeasurePanelKeyboard
            {...{
              panelKeyboardOpen, setMeasureKeyboardHeight, numpadTargetId, numpadTargetLabel,
              numpadTargetValue, lineMeasurementExpression, numpadSize, changeNumpadSize,
              measureKeyboardMode, setMeasureKeyboardMode, numpadScales,
              handleLineMeasurementNumpadPress, typeIntoPanelField, measureKeyboardCaps,
              setMeasureKeyboardCaps, t,
            }}
          />
          
          {/* Buttons */}
          <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 10, paddingBottom: 10, paddingTop: 6 }}>
            <TouchableOpacity
              style={{ flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: 'center', backgroundColor: '#f5f5f5', borderWidth: 1, borderColor: '#ddd' }}
              onPress={() => {
                setShowLineMeasurementNumpad(false);
                setLineMeasurementExpression('');
                setSelectedLineSegment(null);
              }}
            >
              <Text style={{ fontSize: 14, fontWeight: '600', color: '#666' }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{t('common.cancel')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={{ flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: 'center', backgroundColor: '#1976d2' }}
              onPress={() => {
                if (lineMeasurementExpression.trim()) {
                  addMeasurementToSelectedLine();
                } else {
                  setShowLineMeasurementNumpad(false);
                  setLineMeasurementExpression('');
                  setSelectedLineSegment(null);
                }
              }}
            >
              <Text style={{ fontSize: 14, fontWeight: '600', color: '#fff' }} numberOfLines={1}>
                {lineMeasurementExpression.trim() ? t('common.add') : t('common.done')}
              </Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
        );
      })()}
    </>
  );
}

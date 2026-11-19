import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import Ionicons from '@react-native-vector-icons/ionicons';
import { DrawElement } from '../../../sketch/sketchShared';
import { PolygonAreaShapes, PolygonAreaOptions } from '../../../sketch/polygonArea';
import { AreaOptionsSection } from '../AreaOptionsSection';
import { LaserLog } from '../LaserLog';
import { LaserSoundOptions } from '../LaserSoundOptions';
import { WallHeightSection, NumpadTarget } from '../WallHeightSection';
import { PolygonWalls } from '../../../sketch/wallArea';


export type MeasurePanelOptionsProps = {
  panelOptionsOpen: boolean;
  isPhoneDevice: boolean;
  lineAutoAdd: boolean;
  changeLineAutoAdd: (enabled: boolean) => void;
  lineAutoNext: boolean;
  changeLineAutoNext: (enabled: boolean) => void;
  laserSound: boolean;
  changeLaserSound: (enabled: boolean) => void;
  lineMeasureHistory: { elementId: string; segmentIndex: number; previous?: string; }[];
  undoLastLineMeasurement: () => void;
  lineNumbersVisible: boolean;
  changeLineNumbersVisible: (visible: boolean) => void;
  selectedLineSegment: { elementId: string; segmentIndex: number; } | null;
  elements: DrawElement[];
  lineSegmentMeasurements: { [key: string]: { [segmentIndex: number]: string; }; };
  polygonWalls: PolygonWalls;
  setPolygonWalls: React.Dispatch<React.SetStateAction<PolygonWalls>>;
  wallSectionOpen: boolean;
  setWallSectionOpen: React.Dispatch<React.SetStateAction<boolean>>;
  numpadTargetId: string | null;
  panelKeyboardOpen: boolean;
  setPanelKeyboardOpen: React.Dispatch<React.SetStateAction<boolean>>;
  numpadTargetRef: React.RefObject<NumpadTarget | null>;
  setNumpadTargetId: React.Dispatch<React.SetStateAction<string | null>>;
  pendingAreaField: string | null;
  setPendingAreaField: React.Dispatch<React.SetStateAction<string | null>>;
  straightenPolygon: (elementId: string, points: { x: number; y: number }[]) => void;
  straightenAllPolygons: () => void;
  scrollMeasurePanelTo: (y: number) => void;
  calculatePolygonAreaM2: (element: DrawElement) => number | null;
  polygonAreaVisible: { [elementId: string]: boolean; };
  setPolygonAreaVisible: React.Dispatch<React.SetStateAction<{ [elementId: string]: boolean; }>>;
  formatAreaM2: (area: number) => string;
  polygonAreaOptions: PolygonAreaOptions;
  polygonAreaShapes: PolygonAreaShapes;
  diagonalPick: { elementId: string; first: number | null; } | null;
  setDiagonalPick: React.Dispatch<React.SetStateAction<{ elementId: string; first: number | null; } | null>>;
  setPolygonAreaOptions: React.Dispatch<React.SetStateAction<PolygonAreaOptions>>;
};

export function MeasurePanelOptions(props: MeasurePanelOptionsProps) {
  const {
    panelOptionsOpen, isPhoneDevice, lineAutoAdd, changeLineAutoAdd, lineAutoNext,
    changeLineAutoNext, laserSound, changeLaserSound, lineMeasureHistory, undoLastLineMeasurement,
    lineNumbersVisible, changeLineNumbersVisible, selectedLineSegment, elements,
    lineSegmentMeasurements, polygonWalls, setPolygonWalls, wallSectionOpen, setWallSectionOpen,
    numpadTargetId, panelKeyboardOpen, setPanelKeyboardOpen, numpadTargetRef, setNumpadTargetId, pendingAreaField, setPendingAreaField, straightenPolygon, straightenAllPolygons, scrollMeasurePanelTo,
    calculatePolygonAreaM2, polygonAreaVisible, setPolygonAreaVisible, formatAreaM2,
    polygonAreaOptions, polygonAreaShapes, diagonalPick, setDiagonalPick, setPolygonAreaOptions,
  } = props;
  return (
    <>
      {panelOptionsOpen && (
      <>
      {/* Laser sofort übernehmen / nächste Linie auswählen */}
      <View style={{ flexDirection: isPhoneDevice ? 'column' : 'row', gap: 6, marginHorizontal: 10, marginBottom: 6 }}>
        {([
          { id: 'line-auto-add-toggle', label: 'Laser sofort übernehmen', icon: 'bluetooth', on: lineAutoAdd, set: changeLineAutoAdd },
          { id: 'line-auto-next-toggle', label: 'Nächste Linie', icon: 'arrow-forward', on: lineAutoNext, set: changeLineAutoNext },
        ] as const).map(opt => (
          <TouchableOpacity
            key={opt.id}
            testID={opt.id}
            accessibilityRole="switch"
            accessibilityState={{ checked: opt.on }}
            style={{
              flex: 1, flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 44,
              paddingHorizontal: 8, paddingVertical: 6,
              backgroundColor: opt.on ? '#e3f2fd' : '#f5f5f5',
              borderRadius: 8, borderWidth: 1, borderColor: opt.on ? '#90caf9' : '#ddd',
            }}
            onPress={() => opt.set(!opt.on)}
          >
            <Ionicons name={opt.icon} size={14} color={opt.on ? '#1976d2' : '#888'} />
            <Text style={{ flex: 1, fontSize: 11, fontWeight: '600', color: opt.on ? '#1976d2' : '#666' }} numberOfLines={2}>{opt.label}</Text>
            <Text style={{ fontSize: 10, fontWeight: '700', color: opt.on ? '#1976d2' : '#999' }}>{opt.on ? 'AN' : 'AUS'}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Ton bei Laser-Messwert / letztes Maß zurücknehmen */}
      <View style={{ flexDirection: isPhoneDevice ? 'column' : 'row', gap: 6, marginHorizontal: 10, marginBottom: 6 }}>
        <TouchableOpacity
          testID="line-laser-sound-toggle"
          accessibilityRole="switch"
          accessibilityState={{ checked: laserSound }}
          style={{
            flex: 1, flexDirection: 'row', alignItems: 'center', gap: 3, minHeight: 44,
            paddingHorizontal: 5, paddingVertical: 6,
            backgroundColor: laserSound ? '#e3f2fd' : '#f5f5f5',
            borderRadius: 8, borderWidth: 1, borderColor: laserSound ? '#90caf9' : '#ddd',
          }}
          onPress={() => changeLaserSound(!laserSound)}
        >
          <Ionicons name={laserSound ? 'volume-high' : 'volume-mute'} size={14} color={laserSound ? '#1976d2' : '#888'} />
          <Text style={{ flex: 1, fontSize: 11, fontWeight: '600', color: laserSound ? '#1976d2' : '#666' }} numberOfLines={1}>Ton</Text>
          <Text style={{ fontSize: 10, fontWeight: '700', color: laserSound ? '#1976d2' : '#999' }}>{laserSound ? 'AN' : 'AUS'}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          testID="line-measure-undo"
          disabled={lineMeasureHistory.length === 0}
          style={{
            flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, minHeight: 44,
            paddingHorizontal: 8, paddingVertical: 6,
            backgroundColor: '#f5f5f5', borderRadius: 8, borderWidth: 1, borderColor: '#ddd',
            opacity: lineMeasureHistory.length === 0 ? 0.4 : 1,
          }}
          onPress={undoLastLineMeasurement}
        >
          <Ionicons name="arrow-undo" size={14} color="#f44336" />
          <Text style={{ fontSize: 11, fontWeight: '600', color: '#f44336' }} numberOfLines={1}>Zurück</Text>
        </TouchableOpacity>
      </View>

      {/* Linien-Nummern ein-/ausblenden */}
      <TouchableOpacity
        testID="line-numbers-toggle"
        accessibilityRole="switch"
        accessibilityState={{ checked: lineNumbersVisible }}
        style={{
          flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44,
          marginHorizontal: 10, marginBottom: 6, paddingHorizontal: 8, paddingVertical: 6,
          backgroundColor: lineNumbersVisible ? '#e3f2fd' : '#f5f5f5',
          borderRadius: 8, borderWidth: 1, borderColor: lineNumbersVisible ? '#90caf9' : '#ddd',
        }}
        onPress={() => changeLineNumbersVisible(!lineNumbersVisible)}
      >
        <Ionicons name={lineNumbersVisible ? 'eye' : 'eye-off'} size={14} color={lineNumbersVisible ? '#1976d2' : '#888'} />
        <Text style={{ flex: 1, fontSize: 11, fontWeight: '600', color: lineNumbersVisible ? '#1976d2' : '#666' }} numberOfLines={1}>Linien-Nummern</Text>
        <Text style={{ fontSize: 10, fontWeight: '700', color: lineNumbersVisible ? '#1976d2' : '#999' }}>{lineNumbersVisible ? 'AN' : 'AUS'}</Text>
      </TouchableOpacity>

      {/* Ton-Auswahl und Lautstärke */}
      {laserSound && (
        <View style={{ marginHorizontal: 10, marginBottom: 6 }}>
          <LaserSoundOptions />
        </View>
      )}

      {/* Wandhöhe / Wandfläche (bei Bedarf aufklappen) */}
      {selectedLineSegment && elements.find(e => e.id === selectedLineSegment.elementId)?.type === 'polyline' && (
        <WallHeightSection
          element={elements.find(e => e.id === selectedLineSegment.elementId)}
          segmentIndex={selectedLineSegment.segmentIndex}
          measures={lineSegmentMeasurements[selectedLineSegment.elementId]}
          wall={polygonWalls[selectedLineSegment.elementId]}
          onChange={(wall) => setPolygonWalls(prev => ({ ...prev, [selectedLineSegment.elementId]: wall }))}
          scrollable={false}
          open={wallSectionOpen}
          onToggle={setWallSectionOpen}
          useNumpad
          activeFieldId={numpadTargetId}
          onFieldFocus={(id, target) => {
            // Wandfelder nutzen immer das Numpad des Fensters: bei Bedarf aufklappen
            if (!panelKeyboardOpen) setPanelKeyboardOpen(true);
            numpadTargetRef.current = target;
            setNumpadTargetId(id);
          }}
        />
      )}

      {/* Flächen-Toggle für geschlossene Polygone */}
      {selectedLineSegment && (() => {
        const polyEl = elements.find(e => e.id === selectedLineSegment.elementId);
        if (!polyEl || polyEl.type !== 'polyline' || !polyEl.data?.closed || !polyEl.data.points || polyEl.data.points.length < 3) return null;
        const areaM2 = calculatePolygonAreaM2(polyEl);
        const isAreaVisible = polygonAreaVisible[polyEl.id] !== false;
        return (
          <TouchableOpacity
            style={{
              flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
              marginHorizontal: 10, marginBottom: 6, paddingHorizontal: 10, paddingVertical: 7,
              backgroundColor: isAreaVisible ? '#e8f5e9' : '#f5f5f5',
              borderRadius: 8, borderWidth: 1, borderColor: isAreaVisible ? '#a5d6a7' : '#ddd',
            }}
            onPress={() => setPolygonAreaVisible(prev => ({ ...prev, [polyEl.id]: prev[polyEl.id] === false }))}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
              <Ionicons name={isAreaVisible ? 'eye' : 'eye-off'} size={16} color={isAreaVisible ? '#2e7d32' : '#888'} />
              <Text style={{ fontSize: 12, fontWeight: '600', color: isAreaVisible ? '#2e7d32' : '#666', flexShrink: 1 }} numberOfLines={2}>
                {areaM2 !== null ? `Fläche: ${formatAreaM2(areaM2)}` : 'Fläche (m²) – alle Seiten bemaßen'}
              </Text>
            </View>
            <Text style={{ fontSize: 10, fontWeight: '700', color: isAreaVisible ? '#2e7d32' : '#999' }}>
              {isAreaVisible ? 'AN' : 'AUS'}
            </Text>
          </TouchableOpacity>
        );
      })()}

      {/* Genauere Fläche: rechtwinklig / Diagonale */}
      {selectedLineSegment && (
        <AreaOptionsSection
          element={elements.find(e => e.id === selectedLineSegment.elementId)}
          measures={lineSegmentMeasurements[selectedLineSegment.elementId]}
          option={polygonAreaOptions[selectedLineSegment.elementId]}
          shapePoints={polygonAreaShapes[selectedLineSegment.elementId]?.points}
          pickState={diagonalPick?.elementId !== selectedLineSegment.elementId ? 'off' : diagonalPick.first === null ? 'first' : 'second'}
          onPickDiagonal={(active) => setDiagonalPick(active ? { elementId: selectedLineSegment.elementId, first: null } : null)}
          onChange={(option) => setPolygonAreaOptions(prev => ({ ...prev, [selectedLineSegment.elementId]: option }))}
          activeFieldId={numpadTargetId}
          focusFieldId={pendingAreaField}
          onFocusHandled={() => setPendingAreaField(null)}
          onStraighten={(points) => straightenPolygon(selectedLineSegment.elementId, points)}
          anchorSegment={selectedLineSegment.segmentIndex}
          onStraightenAll={straightenAllPolygons}
          onScrollTo={scrollMeasurePanelTo}
          onFieldFocus={(id, target) => {
            if (!panelKeyboardOpen) setPanelKeyboardOpen(true);
            numpadTargetRef.current = target;
            setNumpadTargetId(id);
          }}
        />
      )}

      <LaserLog />
      
      </>
      )}
    </>
  );
}

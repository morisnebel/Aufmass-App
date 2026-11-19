import { parseMeasurementToMeters } from '../../sketch/polygonArea';
import React, { useEffect, useRef } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Ionicons from '@react-native-vector-icons/ionicons';
import BufferedTextInput from '../BufferedTextInput';
import { formatAreaM2 } from '../../sketch/polygonArea';
import { OPENING_PRESETS, PolygonWall, WallSegment, calculateWallAreaM2, openingAreaM2, segmentDeductionM2, wallSegmentAreaM2, OPENING_KINDS, openingKindOf, WallOpening, openingConflict } from '../../sketch/wallArea';

// Aufklappbarer Bereich im Maß-Fenster: Wandhöhe (für alle Linien / diese Linie),
// Abzug für Öffnungen und die daraus berechnete Wandfläche.

type Props = {
  element: any;
  segmentIndex: number;
  measures: { [segmentIndex: number]: string } | undefined;
  wall: PolygonWall | undefined;
  onChange: (wall: PolygonWall) => void;
  // false: kein eigener Scrollbereich (das Maß-Fenster scrollt selbst, z.B. iPhone)
  scrollable?: boolean;
  open: boolean;
  onToggle: (open: boolean) => void;
  // Eingabe über das Numpad des Maß-Fensters (auch wenn ein Laser als Tastatur verbunden ist):
  // das angetippte Feld meldet sich als Ziel an
  useNumpad: boolean;
  activeFieldId: string | null;
  onFieldFocus: (id: string, target: NumpadTarget) => void;
  // Feld, das von außen ausgewählt werden soll (z. B. Tür/Fenster in der Skizze angetippt)
  focusFieldId?: string | null;
  onFocusHandled?: () => void;
  onScrollTo?: (y: number) => void;
  // Öffnung auf eine andere Linie kopieren: Index der Öffnung, für die gerade die Ziel-Linie gewählt wird
  copyIndex?: number | null;
  onCopy?: (index: number | null) => void;
};

export type NumpadTarget = { get: () => string; set: (value: string) => void; label?: string };

export const WallHeightSection = ({ element, segmentIndex, measures, wall, onChange, scrollable = true, open, onToggle, useNumpad, activeFieldId, onFieldFocus, focusFieldId, onFocusHandled, onScrollTo, copyIndex, onCopy }: Props) => {
  // Aktuelle Werte/Handler je Feld, damit das Numpad immer auf dem neuesten Stand schreibt
  const fields = useRef<{ [id: string]: { value: string; onChangeText: (t: string) => void } }>({});
  const boxY = useRef(0);
  const rowY = useRef<{ [index: number]: number }>({});
  useEffect(() => {
    if (!focusFieldId || !open || !fields.current[focusFieldId]) return;
    const id = focusFieldId;
    onFieldFocus(id, {
      get: () => fields.current[id]?.value ?? '',
      set: (next) => fields.current[id]?.onChangeText(next),
    });
    onFocusHandled?.();
    // Zeile der Öffnung sichtbar machen (Layout steht nach dem Aufklappen kurz später fest)
    const index = parseInt(id.split('-').pop() || '0', 10);
    setTimeout(() => onScrollTo?.(boxY.current + 44 + (rowY.current[index] || 0)), 150);
  });
  const segment: WallSegment = wall?.segments?.[segmentIndex] || {};
  const openings = segment.openings || [];
  const deduction = segmentDeductionM2(segment);
  const lineArea = wallSegmentAreaM2(measures?.[segmentIndex], wall, segmentIndex);
  const sum = calculateWallAreaM2(element, measures, wall);

  const setSegment = (patch: WallSegment) =>
    onChange({ ...wall, segments: { ...wall?.segments, [segmentIndex]: { ...segment, ...patch } } });

  const setOpening = (index: number, patch: Partial<WallOpening>) =>
    setSegment({ openings: openings.map((o, i) => (i === index ? { ...o, ...patch } : o)) });

  const lineMeters = parseMeasurementToMeters(measures?.[segmentIndex] || '');
  const input = (testID: string, value: string, placeholder: string, onChangeText: (t: string) => void, flex = false, invalid = false) => {
    fields.current[testID] = { value, onChangeText };
    return (
      <BufferedTextInput
        testID={testID}
        replaceOnBurst
        containerStyle={flex ? styles.flex : undefined}
        style={[styles.input, invalid && styles.inputInvalid, useNumpad && activeFieldId === testID && styles.inputActive]}
        showSoftInputOnFocus={!useNumpad}
        onFocus={() => onFieldFocus(testID, {
          get: () => fields.current[testID]?.value ?? '',
          set: (next) => fields.current[testID]?.onChangeText(next),
        })}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#aaa"
        keyboardType="numbers-and-punctuation"
        returnKeyType="done"
      />
    );
  };

  const field = (testID: string, label: string, value: string, placeholder: string, onChangeText: (t: string) => void) => (
    <View style={styles.field}>
      <Text style={styles.label} numberOfLines={1}>{label}</Text>
      {input(testID, value, placeholder, onChangeText)}
    </View>
  );

  return (
    <View style={styles.box} onLayout={(e) => { boxY.current = e.nativeEvent.layout.y; }}>
      <TouchableOpacity testID="wall-section-toggle" style={styles.header} onPress={() => onToggle(!open)}>
        <Ionicons name="resize" size={14} color="#5d4037" />
        <Text style={styles.headerText} numberOfLines={2}>
          {sum ? `Wandfläche: ${formatAreaM2(sum.total)}` : 'Wandhöhe'}
        </Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color="#5d4037" />
      </TouchableOpacity>
      {open && (
        <ScrollView style={scrollable ? styles.scroll : undefined} scrollEnabled={scrollable} contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled" nestedScrollEnabled>
          {field('wall-height-all', 'Höhe alle Linien', wall?.height || '', 'z.B. 2,50m', (t) => onChange({ ...wall, height: t }))}
          {field('wall-height-line', 'Höhe diese Linie', segment.height || '', wall?.height || 'wie oben', (t) => setSegment({ height: t }))}

          {/* Öffnungen (Türen/Fenster) dieser Linie: Breite × Höhe */}
          <Text style={styles.label}>Türen / Fenster diese Linie (Breite × Höhe)</Text>
          {openings.map((opening, i) => (
            <View key={i} style={styles.openingBox} onLayout={(e) => { rowY.current[i] = e.nativeEvent.layout.y; }}>
            <View style={styles.kindRow}>
              {OPENING_KINDS.map(kind => {
                const selected = openingKindOf(opening) === kind.id;
                return (
                  <TouchableOpacity
                    key={kind.id}
                    testID={`wall-opening-kind-${kind.id}-${i}`}
                    style={[styles.kindChip, selected && styles.kindChipActive]}
                    onPress={() => setOpening(i, { kind: kind.id })}
                  >
                    <Text style={[styles.kindText, selected && styles.kindTextActive]} numberOfLines={1}>{kind.id === 'other' ? 'Sonst.' : kind.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <View style={styles.openingRow}>
              {input(`wall-opening-width-${i}`, opening.width, 'Breite', (t) => setOpening(i, { width: t }), true)}
              <Text style={styles.times}>×</Text>
              {input(`wall-opening-height-${i}`, opening.height, 'Höhe', (t) => setOpening(i, { height: t }), true)}
              <TouchableOpacity
                testID={`wall-opening-remove-${i}`}
                accessibilityLabel="Öffnung entfernen"
                style={styles.removeButton}
                onPress={() => setSegment({ openings: openings.filter((_, idx) => idx !== i) })}
              >
                <Ionicons name="close" size={18} color="#f44336" />
              </TouchableOpacity>
              <Text testID={`wall-opening-area-${i}`} style={styles.openingArea}>= {formatAreaM2(openingAreaM2(opening))}</Text>
            </View>
            <View style={styles.offsetRow}>
              <Text style={styles.offsetLabel} numberOfLines={2}>Abstand ab Linienanfang</Text>
              {input(`wall-opening-offset-${i}`, opening.offset || '', 'z.B. 0,80m', (t) => setOpening(i, { offset: t, position: undefined }), true, !!openingConflict(openings, i, lineMeters))}
            </View>
            {!!openingConflict(openings, i, lineMeters) && (
              <Text testID={`wall-opening-conflict-${i}`} style={styles.conflict}>
                {openingConflict(openings, i, lineMeters) === 'outside'
                  ? `Ragt über die Linie hinaus (Linie ${lineMeters.toFixed(2).replace('.', ',')} m)`
                  : 'Überlappt eine andere Öffnung dieser Linie'}
              </Text>
            )}
            {!!onCopy && (
              <TouchableOpacity
                testID={`wall-opening-copy-${i}`}
                style={[styles.copyButton, copyIndex === i && styles.copyButtonActive]}
                onPress={() => onCopy(copyIndex === i ? null : i)}
              >
                <Ionicons name={copyIndex === i ? 'close' : 'copy-outline'} size={14} color={copyIndex === i ? '#fff' : '#5d4037'} />
                <Text style={[styles.addButtonText, copyIndex === i && styles.copyTextActive]} numberOfLines={2}>
                  {copyIndex === i ? 'Ziel-Linie in der Skizze antippen (Abbrechen)' : 'Auf andere Linie kopieren'}
                </Text>
              </TouchableOpacity>
            )}
            </View>
          ))}
          <View style={styles.presetRow}>
            {OPENING_PRESETS.map(preset => (
              <TouchableOpacity
                key={preset.id}
                testID={`wall-opening-preset-${preset.id}`}
                style={[styles.addButton, styles.presetButton]}
                onPress={() => setSegment({ openings: [...openings, { ...preset.opening }] })}
              >
                <Ionicons name="add" size={14} color="#5d4037" />
                <View>
                  <Text style={styles.addButtonText}>{preset.label}</Text>
                  <Text style={styles.presetSize}>{preset.opening.width.replace('m', '')} × {preset.opening.height.replace('m', '')}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity
            testID="wall-opening-add"
            style={styles.addButton}
            onPress={() => setSegment({ openings: [...openings, { width: '', height: '', kind: 'other' }] })}
          >
            <Ionicons name="add" size={16} color="#5d4037" />
            <Text style={styles.addButtonText}>Eigenes Maß</Text>
          </TouchableOpacity>
          {field('wall-deduction-line', 'Weiterer Abzug diese Linie (m²)', segment.deduction || '', 'z.B. 1,8', (t) => setSegment({ deduction: t }))}
          {deduction > 0 && (
            <Text testID="wall-deduction-total" style={styles.result}>Abzug gesamt: {formatAreaM2(deduction)}</Text>
          )}
          <Text testID="wall-line-area" style={styles.result}>
            Diese Linie: {lineArea !== null ? formatAreaM2(lineArea) : '– (Maß und Höhe nötig)'}
          </Text>
          {sum && (
            <Text testID="wall-sum-area" style={styles.result}>
              Alle Wände: {formatAreaM2(sum.total)} ({sum.walls} von {sum.segments})
            </Text>
          )}
        </ScrollView>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  box: { marginHorizontal: 10, marginBottom: 6, borderRadius: 8, borderWidth: 1, borderColor: '#d7ccc8', backgroundColor: '#efebe9' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, paddingHorizontal: 10, paddingVertical: 6 },
  headerText: { flex: 1, fontSize: 12, fontWeight: '600', color: '#5d4037' },
  body: { paddingHorizontal: 10, paddingBottom: 8, gap: 6 },
  scroll: { maxHeight: 300 },
  flex: { flex: 1 },
  field: { gap: 2 },
  openingBox: { gap: 4, padding: 6, borderRadius: 6, borderWidth: 1, borderColor: '#d7ccc8', backgroundColor: '#f5f1ef' },
  kindRow: { flexDirection: 'row', gap: 4 },
  kindChip: { flex: 1, minHeight: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 6, borderWidth: 1, borderColor: '#bcaaa4', backgroundColor: '#fff', paddingHorizontal: 2 },
  kindChipActive: { backgroundColor: '#5d4037', borderColor: '#5d4037' },
  kindText: { fontSize: 11, fontWeight: '600', color: '#5d4037' },
  kindTextActive: { color: '#fff' },
  offsetRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  offsetLabel: { flex: 1, fontSize: 10, fontWeight: '600', color: '#6d4c41' },
  openingRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 4 },
  times: { fontSize: 14, fontWeight: '700', color: '#6d4c41' },
  removeButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  openingArea: { width: '100%', fontSize: 11, fontWeight: '600', color: '#6d4c41' },
  addButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, minHeight: 40, borderRadius: 6, borderWidth: 1, borderColor: '#bcaaa4', backgroundColor: '#fff' },
  presetRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  presetButton: { flexGrow: 1, minWidth: 110, paddingHorizontal: 6 },
  presetSize: { fontSize: 10, color: '#6d4c41' },
  addButtonText: { fontSize: 12, fontWeight: '600', color: '#5d4037' },
  label: { fontSize: 10, fontWeight: '600', color: '#6d4c41' },
  input: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#d7ccc8', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 8, fontSize: 14, color: '#333', minHeight: 40 },
  inputInvalid: { borderColor: '#d32f2f', backgroundColor: '#ffebee' },
  conflict: { fontSize: 11, fontWeight: '700', color: '#d32f2f' },
  copyButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, minHeight: 40, paddingHorizontal: 6, borderRadius: 6, borderWidth: 1, borderColor: '#bcaaa4', backgroundColor: '#fff' },
  copyButtonActive: { backgroundColor: '#e65100', borderColor: '#e65100' },
  copyTextActive: { color: '#fff' },
  inputActive: { borderColor: '#1976d2', borderWidth: 2 },
  result: { fontSize: 12, fontWeight: '700', color: '#4e342e' },
});

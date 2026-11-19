import React, { useRef } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Ionicons from '@react-native-vector-icons/ionicons';
import BufferedTextInput from '../BufferedTextInput';
import { PolygonAreaOption, diagonalTargets, formatAreaM2, getDiagonal, polygonDiagonalAreaM2 } from '../../sketch/polygonArea';
import { NumpadTarget } from './WallHeightSection';

// Genauere Flächenberechnung für ein Polygon: alle Ecken rechtwinklig oder gemessene Diagonalen

type Props = {
  element: any;
  measures: { [segmentIndex: number]: string } | undefined;
  option: PolygonAreaOption | undefined;
  onChange: (option: PolygonAreaOption) => void;
  activeFieldId: string | null;
  onFieldFocus: (id: string, target: NumpadTarget) => void;
};

export const AREA_DIAGONAL_FIELD = 'area-diagonal';

export const AreaOptionsSection = ({ element, measures, option, onChange, activeFieldId, onFieldFocus }: Props) => {
  const latest = useRef({ option, onChange });
  latest.current = { option, onChange };
  const pointCount = element?.data?.points?.length || 0;
  if (!element?.data?.closed || pointCount < 4) return null;

  const rightAngles = !!option?.rightAngles;
  const targets = diagonalTargets(pointCount);
  const entered = targets.filter(k => getDiagonal(option, k).trim() !== '').length;
  const diagonalArea = polygonDiagonalAreaM2(measures, option, pointCount, element.data.points);
  const allMeasured = Array.from({ length: pointCount }, (_, i) => measures?.[i]).every(Boolean);
  const setDiagonal = (current: PolygonAreaOption | undefined, k: number, text: string): PolygonAreaOption => ({
    ...current,
    diagonal: k === 2 ? undefined : current?.diagonal,
    diagonals: { ...current?.diagonals, [k]: text },
  });

  return (
    <View style={styles.box}>
      <TouchableOpacity
        testID="area-right-angles-toggle"
        accessibilityRole="switch"
        accessibilityState={{ checked: rightAngles }}
        style={[styles.toggle, rightAngles && styles.toggleOn]}
        onPress={() => onChange({ ...option, rightAngles: !rightAngles })}
      >
        <Ionicons name="square-outline" size={14} color={rightAngles ? '#2e7d32' : '#888'} />
        <Text style={[styles.toggleText, rightAngles && styles.textOn]} numberOfLines={2}>Alle Ecken rechtwinklig</Text>
        <Text style={[styles.state, rightAngles && styles.textOn]}>{rightAngles ? 'AN' : 'AUS'}</Text>
      </TouchableOpacity>

      {/* Diagonalen von der Ecke zwischen letzter Linie und Linie 1 zu jeder nicht benachbarten Ecke */}
      {targets.map(k => {
        const id = `${AREA_DIAGONAL_FIELD}-${k}`;
        return (
          <View key={k} style={styles.field}>
            <Text style={styles.label}>Diagonale {targets.length > 1 ? `${k - 1} ` : ''}(Ecke Linie {pointCount}/1 ↔ Ecke Linie {k}/{k + 1})</Text>
            <BufferedTextInput
              testID={id}
              replaceOnBurst
              style={[styles.input, activeFieldId === id && styles.inputActive]}
              value={getDiagonal(option, k)}
              onChangeText={(text) => onChange(setDiagonal(option, k, text))}
              placeholder="z.B. 4,65m"
              placeholderTextColor="#aaa"
              showSoftInputOnFocus={false}
              onFocus={() => onFieldFocus(id, {
                get: () => getDiagonal(latest.current.option, k),
                set: (next) => latest.current.onChange(setDiagonal(latest.current.option, k, next)),
              })}
            />
          </View>
        );
      })}
      {entered > 0 && (
        <Text testID="area-diagonal-result" style={[styles.hint, diagonalArea === null && styles.warn]}>
          {diagonalArea !== null
            ? `Fläche über ${targets.length > 1 ? 'Diagonalen' : 'Diagonale'}: ${formatAreaM2(diagonalArea)}${rightAngles ? ' (hat Vorrang vor „rechtwinklig“)' : ''}`
            : !allMeasured
              ? 'Erst alle Seiten bemaßen'
              : entered < targets.length
                ? `Noch ${targets.length - entered} von ${targets.length} Diagonalen fehlen – bis dahin wird ohne Diagonalen gerechnet`
                : 'Diagonalen passen nicht zu den Seitenmaßen – werden nicht verwendet'}
        </Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  box: { marginHorizontal: 10, marginBottom: 6, gap: 6 },
  toggle: {
    flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, paddingHorizontal: 8, paddingVertical: 6,
    backgroundColor: '#f5f5f5', borderRadius: 8, borderWidth: 1, borderColor: '#ddd',
  },
  toggleOn: { backgroundColor: '#e8f5e9', borderColor: '#a5d6a7' },
  toggleText: { flex: 1, fontSize: 11, fontWeight: '600', color: '#666' },
  textOn: { color: '#2e7d32' },
  state: { fontSize: 10, fontWeight: '700', color: '#999' },
  field: { gap: 2 },
  label: { fontSize: 10, fontWeight: '600', color: '#555' },
  input: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#ccc', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 8, fontSize: 14, color: '#333', minHeight: 40 },
  inputActive: { borderColor: '#1976d2', borderWidth: 2 },
  hint: { fontSize: 11, fontWeight: '600', color: '#2e7d32' },
  warn: { color: '#d84315' },
});

import React, { useRef } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Ionicons from '@react-native-vector-icons/ionicons';
import BufferedTextInput from '../BufferedTextInput';
import { PolygonAreaOption, formatAreaM2, quadDiagonalAreaM2 } from '../../sketch/polygonArea';
import { NumpadTarget } from './WallHeightSection';

// Genauere Flächenberechnung für ein Polygon: alle Ecken rechtwinklig oder (beim Viereck) Diagonale

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
  const diagonal = option?.diagonal || '';
  const diagonalArea = pointCount === 4 ? quadDiagonalAreaM2(measures, diagonal) : null;
  const allMeasured = Array.from({ length: pointCount }, (_, i) => measures?.[i]).every(Boolean);

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

      {pointCount === 4 && (
        <View style={styles.field}>
          <Text style={styles.label}>Diagonale (Ecke Linie 4/1 ↔ Ecke Linie 2/3)</Text>
          <BufferedTextInput
            testID={AREA_DIAGONAL_FIELD}
            replaceOnBurst
            style={[styles.input, activeFieldId === AREA_DIAGONAL_FIELD && styles.inputActive]}
            value={diagonal}
            onChangeText={(text) => onChange({ ...option, diagonal: text })}
            placeholder="z.B. 4,65m"
            placeholderTextColor="#aaa"
            showSoftInputOnFocus={false}
            onFocus={() => onFieldFocus(AREA_DIAGONAL_FIELD, {
              get: () => latest.current.option?.diagonal || '',
              set: (next) => latest.current.onChange({ ...latest.current.option, diagonal: next }),
            })}
          />
          {diagonal.trim() !== '' && (
            <Text testID="area-diagonal-result" style={[styles.hint, diagonalArea === null && styles.warn]}>
              {diagonalArea !== null
                ? `Fläche über Diagonale: ${formatAreaM2(diagonalArea)}${rightAngles ? ' (hat Vorrang vor „rechtwinklig“)' : ''}`
                : allMeasured
                  ? 'Diagonale passt nicht zu den Seitenmaßen – wird nicht verwendet'
                  : 'Erst alle vier Seiten bemaßen'}
            </Text>
          )}
        </View>
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

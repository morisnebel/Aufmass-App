import React, { useRef } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Ionicons from '@react-native-vector-icons/ionicons';
import BufferedTextInput from '../BufferedTextInput';
import { PolygonAreaOption, computePolygon, drawnInteriorAngles, formatAreaM2, listDiagonals } from '../../sketch/polygonArea';
import { NumpadTarget } from './WallHeightSection';

// Genauere Flächenberechnung für ein Polygon (alles optional):
// alle Ecken rechtwinklig, Winkel je Ecke oder Diagonalen zwischen zwei frei gewählten Ecken

type Props = {
  element: any;
  measures: { [segmentIndex: number]: string } | undefined;
  shapePoints?: { x: number; y: number }[];
  option: PolygonAreaOption | undefined;
  onChange: (option: PolygonAreaOption) => void;
  activeFieldId: string | null;
  onFieldFocus: (id: string, target: NumpadTarget) => void;
  // Auswahl einer Diagonale durch Antippen zweier Ecken in der Skizze
  pickState: 'off' | 'first' | 'second';
  onPickDiagonal: (active: boolean) => void;
};

export const AREA_FIELD_PREFIX = 'area-';

// Alle Diagonalen im neuen Format (Eckenpaare) speichern
export const withPairs = (option: PolygonAreaOption | undefined, pointCount: number, change: (pairs: { [key: string]: string }) => void): PolygonAreaOption => {
  const pairs: { [key: string]: string } = {};
  listDiagonals(option, pointCount).forEach(d => { pairs[`${d.i}-${d.j}`] = d.value; });
  change(pairs);
  return { ...option, diagonal: undefined, diagonals: undefined, useDiagonals: true, pairs };
};

// Ecke k liegt zwischen Linie k und Linie k+1 (Ecke 0: zwischen letzter Linie und Linie 1)
const cornerName = (k: number, n: number) => `Linie ${k === 0 ? n : k}/${k + 1}`;

export const AreaOptionsSection = ({ element, measures, shapePoints, option, onChange, activeFieldId, onFieldFocus, pickState, onPickDiagonal }: Props) => {
  const latest = useRef({ option, onChange });
  latest.current = { option, onChange };
  const values = useRef<{ [id: string]: string }>({});
  const points: { x: number; y: number }[] = element?.data?.points || [];
  const n = points.length;
  if (!element?.data?.closed || n < 4) return null;

  const rightAngles = !!option?.rightAngles;
  const useAngles = !!option?.useAngles;
  const diagonals = listDiagonals(option, n);
  const useDiagonals = !!option?.useDiagonals || diagonals.length > 0;
  const drawn = drawnInteriorAngles(points);
  const result = computePolygon(element, { [element.id]: measures || {} }, useAngles ? undefined : shapePoints, option);
  const needed = n - 3;

  const field = (id: string, label: string, value: string, placeholder: string, set: (current: PolygonAreaOption | undefined, text: string) => PolygonAreaOption) => {
    values.current[id] = value;
    return (
    <View key={id} style={styles.field}>
      <Text style={styles.label} numberOfLines={2}>{label}</Text>
      <BufferedTextInput
        testID={id}
        replaceOnBurst
        containerStyle={styles.flex}
        style={[styles.input, activeFieldId === id && styles.inputActive]}
        value={value}
        onChangeText={(text) => onChange(set(option, text))}
        placeholder={placeholder}
        placeholderTextColor="#aaa"
        showSoftInputOnFocus={false}
        onFocus={() => onFieldFocus(id, {
          get: () => values.current[id] ?? '',
          set: (next) => latest.current.onChange(set(latest.current.option, next)),
          label,
        })}
      />
    </View>
    );
  };

  const toggle = (testID: string, label: string, on: boolean, onPress: () => void, icon: any) => (
    <TouchableOpacity
      testID={testID}
      accessibilityRole="switch"
      accessibilityState={{ checked: on }}
      style={[styles.toggle, on && styles.toggleOn]}
      onPress={onPress}
    >
      <Ionicons name={icon} size={14} color={on ? '#2e7d32' : '#888'} />
      <Text style={[styles.toggleText, on && styles.textOn]} numberOfLines={2}>{label}</Text>
      <Text style={[styles.state, on && styles.textOn]}>{on ? 'AN' : 'AUS'}</Text>
    </TouchableOpacity>
  );

  let status = 'Fläche aus den gezeichneten Winkeln – Abweichung vom genauen Maß möglich. Für genaue Werte Winkel oder Diagonalen angeben.';
  let warn = true;
  if (result && result.maxError > 0.01) {
    status = `Maße passen nicht zusammen (Abweichung bis ${(result.maxError * 100).toFixed(0)} cm) – bitte prüfen`;
  } else if (result && result.extras >= needed) {
    status = `Fläche über Winkel/Diagonalen bestimmt: ${formatAreaM2(result.area)}`;
    warn = false;
  } else if (result && result.extras > 0) {
    status = `Noch ${needed - result.extras} Winkel oder Diagonale(n) für eine genaue Fläche – bis dahin Näherung.`;
  } else if (rightAngles) {
    status = 'Alle Ecken werden als rechtwinklig gerechnet.';
    warn = false;
  }

  return (
    <View style={styles.box}>
      <Text testID="area-status" style={[styles.hint, warn && styles.warn]}>{status}</Text>
      {toggle('area-right-angles-toggle', 'Alle Ecken rechtwinklig', rightAngles, () => onChange({ ...option, rightAngles: !rightAngles }), 'square-outline')}

      {toggle('area-angles-toggle', 'Winkel angeben', useAngles, () => onChange({ ...option, useAngles: !useAngles }), 'analytics')}
      {useAngles && points.map((_, k) =>
        field(`area-angle-${k}`, `Winkel Ecke ${cornerName(k, n)} (°)`, option?.angles?.[k] || '', `gezeichnet ${Math.round(drawn[k])}°`,
          (current, text) => ({ ...current, angles: { ...current?.angles, [k]: text } })))}

      {toggle('area-diagonals-toggle', 'Diagonalen angeben', useDiagonals, () => onChange({ ...withPairs(option, n, () => {}), useDiagonals: !useDiagonals }), 'git-compare')}
      {useDiagonals && (
        <>
          {diagonals.map(d => (
            <View key={`${d.i}-${d.j}`} style={styles.row}>
              {field(`area-diag-${d.i}-${d.j}`, `Ecke ${cornerName(d.i, n)} ↔ Ecke ${cornerName(d.j, n)}`, d.value, 'z.B. 4,65m',
                (current, text) => withPairs(current, n, pairs => { pairs[`${d.i}-${d.j}`] = text; }))}
              <TouchableOpacity
                testID={`area-diag-remove-${d.i}-${d.j}`}
                accessibilityLabel="Diagonale entfernen"
                style={styles.remove}
                onPress={() => onChange(withPairs(option, n, pairs => { delete pairs[`${d.i}-${d.j}`]; }))}
              >
                <Ionicons name="close" size={18} color="#f44336" />
              </TouchableOpacity>
            </View>
          ))}
          <TouchableOpacity testID="area-diag-pick" style={[styles.pick, pickState !== 'off' && styles.pickActive]} onPress={() => onPickDiagonal(pickState === 'off')}>
            <Ionicons name="add" size={16} color={pickState !== 'off' ? '#fff' : '#2e7d32'} />
            <Text style={[styles.pickText, pickState !== 'off' && styles.pickTextActive]} numberOfLines={2}>
              {pickState === 'off' ? 'Diagonale: zwei Ecken antippen' : pickState === 'first' ? 'Erste Ecke in der Skizze antippen …' : 'Zweite Ecke antippen …'}
            </Text>
          </TouchableOpacity>
        </>
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
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: 4 },
  flex: { flex: 1 },
  field: { flex: 1, gap: 2 },
  label: { fontSize: 10, fontWeight: '600', color: '#555' },
  input: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#ccc', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 8, fontSize: 14, color: '#333', minHeight: 40 },
  inputActive: { borderColor: '#1976d2', borderWidth: 2 },
  remove: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  pick: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, minHeight: 44, paddingHorizontal: 8, borderRadius: 8, borderWidth: 1, borderColor: '#a5d6a7', backgroundColor: '#fff' },
  pickActive: { backgroundColor: '#2e7d32', borderColor: '#2e7d32' },
  pickText: { flexShrink: 1, fontSize: 12, fontWeight: '600', color: '#2e7d32' },
  pickTextActive: { color: '#fff' },
  hint: { fontSize: 11, fontWeight: '600', color: '#2e7d32' },
  warn: { color: '#d84315' },
});

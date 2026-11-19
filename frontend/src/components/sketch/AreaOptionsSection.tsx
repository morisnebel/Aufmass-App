import React, { useEffect, useRef } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Ionicons from '@react-native-vector-icons/ionicons';
import BufferedTextInput from '../BufferedTextInput';
import { PolygonAreaOption, computePolygon, fitVerticesToDrawing, normalizeAreaOption, formatAreaM2, listDiagonals, angleExtraId, pairExtraId, vertexDistance } from '../../sketch/polygonArea';
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
  // Feld, das von außen ausgewählt werden soll (z. B. automatisch angelegte Diagonale)
  focusFieldId?: string | null;
  onFocusHandled?: () => void;
  // Zeichnung auf die berechnete Form ziehen (neue Eckpunkte in Skizzen-Koordinaten)
  onStraighten?: (points: { x: number; y: number }[]) => void;
  // Ausgewählte Linie bleibt beim Geraderücken an ihrem Platz
  anchorSegment?: number;
  // Alle eindeutig bestimmten Räume der Skizze geraderücken
  onStraightenAll?: () => void;
  // Maß-Fenster zu einer Stelle scrollen (y relativ zum scrollbaren Inhalt)
  onScrollTo?: (y: number) => void;
};

// Reihenfolge der Eingaben merken: frühere Angaben haben bei Widersprüchen Vorrang
const withOrder = (option: PolygonAreaOption, extraId: string, text: string): PolygonAreaOption => {
  const order = (option.order || []).filter(id => id !== extraId || text.trim());
  return { ...option, order: text.trim() && !order.includes(extraId) ? [...order, extraId] : order };
};

const formatDegrees = (value: number) => `${(Math.round(value * 10) / 10).toString().replace('.', ',')}°`;
const formatMeters = (value: number) => `${value.toFixed(2).replace('.', ',')} m`;

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

export const AreaOptionsSection = ({ element, measures, shapePoints, option, onChange, activeFieldId, onFieldFocus, pickState, onPickDiagonal, focusFieldId, onFocusHandled, onStraighten, anchorSegment, onStraightenAll, onScrollTo }: Props) => {
  const latest = useRef({ option, onChange });
  latest.current = { option, onChange };
  const values = useRef<{ [id: string]: string }>({});
  const targets = useRef<{ [id: string]: NumpadTarget }>({});
  // Automatisch gewähltes Feld sichtbar machen: Lage des Bereichs + Lage der Feld-Zeile im Bereich
  const boxY = useRef<number | null>(null);
  const rowY = useRef<{ [id: string]: number }>({});
  const scrollWanted = useRef<string | null>(null);
  const tryScroll = () => {
    const id = scrollWanted.current;
    if (!id || boxY.current === null || rowY.current[id] === undefined) return;
    scrollWanted.current = null;
    onScrollTo?.(boxY.current + rowY.current[id]);
  };
  useEffect(() => {
    if (!focusFieldId || !targets.current[focusFieldId]) return;
    onFieldFocus(focusFieldId, targets.current[focusFieldId]);
    scrollWanted.current = focusFieldId;
    tryScroll();
    onFocusHandled?.();
  });
  const points: { x: number; y: number }[] = element?.data?.points || [];
  const n = points.length;
  if (!element?.data?.closed || n < 4) return null;

  const rightAngles = !!option?.rightAngles;
  const useAngles = !!option?.useAngles;
  const diagonals = listDiagonals(option, n);
  const useDiagonals = !!option?.useDiagonals || diagonals.length > 0;
  // Alte Diagonalen-Form für die Anzeige wie die neue rechnen (liefert berechnete Werte)
  const calcOption = normalizeAreaOption(option, n);
  const result = computePolygon(element, { [element.id]: measures || {} }, useAngles ? undefined : shapePoints, calcOption);
  const needed = n - 3;
  const hasShape = !!result && result.vertices.length === n;
  const sign = result?.determined ? '=' : '≈';
  const isRejected = (extraId: string) => !!result?.rejected.includes(extraId);

  const field = (id: string, label: string, value: string, placeholder: string, set: (current: PolygonAreaOption | undefined, text: string) => PolygonAreaOption, computed?: string, rejected?: boolean) => {
    values.current[id] = value;
    targets.current[id] = {
      get: () => values.current[id] ?? '',
      set: (next) => latest.current.onChange(set(latest.current.option, next)),
      label,
    };
    return (
    <View key={id} style={styles.field}>
      <Text style={styles.label} numberOfLines={2}>{label}</Text>
      <BufferedTextInput
        testID={id}
        replaceOnBurst
        containerStyle={styles.flex}
        style={[styles.input, rejected && styles.inputRejected, activeFieldId === id && styles.inputActive]}
        value={value}
        onChangeText={(text) => onChange(set(option, text))}
        placeholder={placeholder}
        placeholderTextColor="#aaa"
        showSoftInputOnFocus={false}
        onFocus={() => onFieldFocus(id, targets.current[id])}
      />
      {!!computed && (
        <Text testID={`${id}-computed`} style={[styles.computed, rejected && styles.computedRejected]} numberOfLines={2}>
          {rejected ? `passt nicht – nicht verwendet · rechnerisch ${computed}` : `${sign} ${computed}`}
        </Text>
      )}
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

  // Geraderücken: nur anbieten, wenn die Zeichnung sichtbar von der berechneten Form abweicht
  const straightened = hasShape ? fitVerticesToDrawing(result!.vertices, points, anchorSegment) : null;
  const canStraighten = !!straightened && straightened.some((p, k) => Math.hypot(p.x - points[k].x, p.y - points[k].y) > 1);

  let status = 'Fläche aus den gezeichneten Winkeln – Abweichung vom genauen Maß möglich. Für genaue Werte Winkel oder Diagonalen angeben.';
  let warn = true;
  if (!result) {
    status = 'Erst alle Seiten bemaßen – dann werden Winkel und Diagonalen berechnet.';
  } else if (result.rejected.length > 0) {
    status = `${result.rejected.length === 1 ? 'Eine Angabe passt' : `${result.rejected.length} Angaben passen`} nicht zu den übrigen Maßen und ${result.rejected.length === 1 ? 'wird' : 'werden'} nicht verwendet (rot markiert). Fläche: ${formatAreaM2(result.area)}`;
  } else if (rightAngles && result.rightAnglesRejected !== undefined) {
    status = `„Rechtwinklig“ passt nicht zu den Seitenmaßen${isFinite(result.rightAnglesRejected) ? ` (Abweichung ${(result.rightAnglesRejected * 100).toFixed(0)} cm)` : ''} und wird nicht verwendet. Bitte Maße prüfen oder Winkel/Diagonale angeben.`;
  } else if (result.extras >= needed) {
    status = `Form eindeutig bestimmt – Fläche ${formatAreaM2(result.area)}. Alle übrigen Winkel und Diagonalen sind berechnet.`;
    warn = false;
  } else if (rightAngles) {
    status = 'Alle Ecken werden als rechtwinklig gerechnet.';
    warn = false;
  } else if (result.extras > 0) {
    status = `Noch ${needed - result.extras} Winkel oder Diagonale(n) für eine genaue Fläche – Werte mit ≈ sind bis dahin Näherung aus der Zeichnung.`;
  }

  return (
    <View style={styles.box} onLayout={(e) => { boxY.current = e.nativeEvent.layout.y; tryScroll(); }}>
      <Text testID="area-status" style={[styles.hint, warn && styles.warn]}>{status}</Text>
      {!!onStraighten && hasShape && (
        <TouchableOpacity
          testID="area-straighten"
          disabled={!canStraighten}
          style={[styles.pick, !canStraighten && styles.pickDisabled]}
          onPress={() => straightened && onStraighten(straightened)}
        >
          <Ionicons name="git-merge-outline" size={16} color={canStraighten ? '#2e7d32' : '#999'} />
          <Text style={[styles.pickText, !canStraighten && styles.pickTextDisabled]} numberOfLines={2}>
            {canStraighten ? `Skizze geraderücken${result!.determined ? '' : ' (Näherung)'}${anchorSegment !== undefined ? ` · Linie ${anchorSegment + 1} bleibt` : ''}` : 'Skizze passt zu den Maßen'}
          </Text>
        </TouchableOpacity>
      )}
      {!!onStraightenAll && (
        <TouchableOpacity testID="area-straighten-all" style={styles.pick} onPress={onStraightenAll}>
          <Ionicons name="albums-outline" size={16} color="#2e7d32" />
          <Text style={styles.pickText} numberOfLines={2}>Alle Räume geraderücken</Text>
        </TouchableOpacity>
      )}
      {toggle('area-right-angles-toggle', 'Alle Ecken rechtwinklig', rightAngles, () => onChange({ ...option, rightAngles: !rightAngles }), 'square-outline')}

      {toggle('area-angles-toggle', 'Winkel angeben', useAngles, () => onChange({ ...option, useAngles: !useAngles }), 'analytics')}
      {useAngles && points.map((_, k) =>
        field(`area-angle-${k}`, `Winkel Ecke ${cornerName(k, n)} (°)`, option?.angles?.[k] || '', 'Winkel in °',
          (current, text) => withOrder({ ...current, angles: { ...current?.angles, [k]: text } }, angleExtraId(k), text),
          hasShape ? formatDegrees(result!.angles[k]) : undefined, isRejected(angleExtraId(k))))}

      {toggle('area-diagonals-toggle', 'Diagonalen angeben', useDiagonals, () => onChange({ ...withPairs(option, n, () => {}), useDiagonals: !useDiagonals }), 'git-compare')}
      {useDiagonals && (
        <>
          {diagonals.map(d => (
            <View
              key={`${d.i}-${d.j}`}
              style={styles.row}
              onLayout={(e) => { rowY.current[`area-diag-${d.i}-${d.j}`] = e.nativeEvent.layout.y; tryScroll(); }}
            >
              {field(`area-diag-${d.i}-${d.j}`, `Ecke ${cornerName(d.i, n)} ↔ Ecke ${cornerName(d.j, n)}`, d.value, 'z.B. 4,65m',
                (current, text) => withOrder(withPairs(current, n, pairs => { pairs[`${d.i}-${d.j}`] = text; }), pairExtraId(d.i, d.j), text),
                hasShape ? formatMeters(vertexDistance(result!.vertices, d.i, d.j)) : undefined, isRejected(pairExtraId(d.i, d.j)))}
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
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 4 },
  flex: { flex: 1 },
  field: { flex: 1, gap: 2 },
  label: { fontSize: 10, fontWeight: '600', color: '#555' },
  input: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#ccc', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 8, fontSize: 14, color: '#333', minHeight: 40 },
  inputActive: { borderColor: '#1976d2', borderWidth: 2 },
  inputRejected: { borderColor: '#d32f2f', backgroundColor: '#ffebee' },
  computed: { fontSize: 11, fontWeight: '700', color: '#2e7d32' },
  computedRejected: { color: '#d32f2f' },
  remove: { width: 40, height: 40, marginTop: 14, alignItems: 'center', justifyContent: 'center' },
  pick: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, minHeight: 44, paddingHorizontal: 8, borderRadius: 8, borderWidth: 1, borderColor: '#a5d6a7', backgroundColor: '#fff' },
  pickActive: { backgroundColor: '#2e7d32', borderColor: '#2e7d32' },
  pickText: { flexShrink: 1, fontSize: 12, fontWeight: '600', color: '#2e7d32' },
  pickTextActive: { color: '#fff' },
  pickDisabled: { borderColor: '#ddd', backgroundColor: '#f5f5f5' },
  pickTextDisabled: { color: '#999' },
  hint: { fontSize: 11, fontWeight: '600', color: '#2e7d32' },
  warn: { color: '#d84315' },
});

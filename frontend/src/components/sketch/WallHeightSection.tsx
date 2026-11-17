import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Ionicons from '@react-native-vector-icons/ionicons';
import BufferedTextInput from '../BufferedTextInput';
import { formatAreaM2 } from '../../sketch/polygonArea';
import { PolygonWall, calculateWallAreaM2, wallSegmentAreaM2 } from '../../sketch/wallArea';

// Aufklappbarer Bereich im Maß-Fenster: Wandhöhe (für alle Linien / diese Linie),
// Abzug für Öffnungen und die daraus berechnete Wandfläche.

type Props = {
  element: any;
  segmentIndex: number;
  measures: { [segmentIndex: number]: string } | undefined;
  wall: PolygonWall | undefined;
  onChange: (wall: PolygonWall) => void;
};

export const WallHeightSection = ({ element, segmentIndex, measures, wall, onChange }: Props) => {
  const [open, setOpen] = useState(false);
  const segment = wall?.segments?.[segmentIndex] || {};
  const lineArea = wallSegmentAreaM2(measures?.[segmentIndex], wall, segmentIndex);
  const sum = calculateWallAreaM2(element, measures, wall);

  const setSegment = (patch: { height?: string; deduction?: string }) =>
    onChange({ ...wall, segments: { ...wall?.segments, [segmentIndex]: { ...segment, ...patch } } });

  const field = (testID: string, label: string, value: string, placeholder: string, onChangeText: (t: string) => void) => (
    <View style={styles.field}>
      <Text style={styles.label} numberOfLines={1}>{label}</Text>
      <BufferedTextInput
        testID={testID}
        replaceOnBurst
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#aaa"
        keyboardType="numbers-and-punctuation"
        returnKeyType="done"
      />
    </View>
  );

  return (
    <View style={styles.box}>
      <TouchableOpacity testID="wall-section-toggle" style={styles.header} onPress={() => setOpen(!open)}>
        <Ionicons name="resize" size={14} color="#5d4037" />
        <Text style={styles.headerText} numberOfLines={2}>
          {sum ? `Wandfläche: ${formatAreaM2(sum.total)}` : 'Wandhöhe'}
        </Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color="#5d4037" />
      </TouchableOpacity>
      {open && (
        <View style={styles.body}>
          {field('wall-height-all', 'Höhe alle Linien', wall?.height || '', 'z.B. 2,50m', (t) => onChange({ ...wall, height: t }))}
          {field('wall-height-line', 'Höhe diese Linie', segment.height || '', wall?.height || 'wie oben', (t) => setSegment({ height: t }))}
          {field('wall-deduction-line', 'Abzug diese Linie (m²)', segment.deduction || '', 'z.B. 1,8', (t) => setSegment({ deduction: t }))}
          <Text testID="wall-line-area" style={styles.result}>
            Diese Linie: {lineArea !== null ? formatAreaM2(lineArea) : '– (Maß und Höhe nötig)'}
          </Text>
          {sum && (
            <Text testID="wall-sum-area" style={styles.result}>
              Alle Wände: {formatAreaM2(sum.total)} ({sum.walls} von {sum.segments})
            </Text>
          )}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  box: { marginHorizontal: 10, marginBottom: 6, borderRadius: 8, borderWidth: 1, borderColor: '#d7ccc8', backgroundColor: '#efebe9' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, paddingHorizontal: 10, paddingVertical: 6 },
  headerText: { flex: 1, fontSize: 12, fontWeight: '600', color: '#5d4037' },
  body: { paddingHorizontal: 10, paddingBottom: 8, gap: 6 },
  field: { gap: 2 },
  label: { fontSize: 10, fontWeight: '600', color: '#6d4c41' },
  input: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#d7ccc8', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 8, fontSize: 14, color: '#333', minHeight: 40 },
  result: { fontSize: 12, fontWeight: '700', color: '#4e342e' },
});

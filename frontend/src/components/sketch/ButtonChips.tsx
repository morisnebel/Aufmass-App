import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Ionicons from '@react-native-vector-icons/ionicons';

// Knöpfe der Skizze mit Symbol, Farbe und Fundort – für Tutorial, Übung und Bedienungsanleitung,
// damit überall dasselbe Symbol gezeigt wird wie in der App.
export const SKETCH_BUTTONS = {
  polygon: { icon: 'git-network-outline', label: 'Polygon', where: 'Werkzeugleiste', color: '#333' },
  edit: { icon: 'hand-left', label: 'Bearbeiten', where: 'Werkzeugleiste', color: '#1976d2' },
  points: { icon: 'locate', label: 'Punkte', where: 'Werkzeugleiste', color: '#1976d2' },
  finishLine: { icon: 'checkmark', label: 'Linie', where: 'Polygon-Fenster', color: '#4caf50' },
  finishRoom: { icon: 'link', label: 'Raum', where: 'Polygon-Fenster', color: '#2196f3' },
  add: { icon: 'add-circle', label: 'Hinzufügen', where: 'Maß-Fenster', color: '#1976d2' },
  more: { icon: 'options', label: 'Mehr', where: 'Maß-Fenster', color: '#1976d2' },
  keyboard: { icon: 'keypad', label: 'Tastatur', where: 'Maß-Fenster', color: '#1976d2' },
  closePanel: { icon: 'close', label: 'Schließen', where: 'Maß-Fenster', color: '#666' },
  rightAngles: { icon: 'square-outline', label: 'Alle Ecken rechtwinklig', where: 'Mehr', color: '#2e7d32' },
  angles: { icon: 'analytics', label: 'Winkel angeben', where: 'Mehr', color: '#2e7d32' },
  diagonals: { icon: 'git-compare', label: 'Diagonalen angeben', where: 'Mehr', color: '#2e7d32' },
  straighten: { icon: 'git-merge-outline', label: 'Skizze geraderücken', where: 'Mehr', color: '#2e7d32' },
  straightenAll: { icon: 'albums-outline', label: 'Alle Räume geraderücken', where: 'Mehr', color: '#2e7d32' },
  wall: { icon: 'resize', label: 'Wandhöhe', where: 'Mehr', color: '#5d4037' },
  addOpening: { icon: 'add', label: '+ Tür / + Fenster', where: 'Wandhöhe', color: '#5d4037' },
  copyOpening: { icon: 'copy-outline', label: 'Auf andere Linie kopieren', where: 'Wandhöhe', color: '#5d4037' },
  longPress: { icon: 'finger-print', label: 'Linie gedrückt halten', where: 'in der Skizze', color: '#b45309' },
  drag: { icon: 'move', label: 'Ziehen', where: 'in der Skizze', color: '#b45309' },
  tap: { icon: 'radio-button-on', label: 'Antippen', where: 'in der Skizze', color: '#b45309' },
  save: { icon: 'checkmark', label: 'Speichern', where: 'oben rechts', color: '#1565c0' },
} as const;
export type SketchButtonKey = keyof typeof SKETCH_BUTTONS;

// Ein Knopf als kleines Bild: Symbol im Kästchen wie in der App, daneben Name und Fundort
export function ButtonChip({ icon, label, where, color, small }: { icon: string; label: string; where?: string; color: string; small?: boolean }) {
  return (
    <View style={[s.chip, small && s.chipSmall]}>
      <View style={[s.iconBox, small && s.iconBoxSmall, { borderColor: color }]}>
        <Ionicons name={icon as any} size={small ? 14 : 18} color={color} />
      </View>
      <View style={s.texts}>
        <Text style={[s.label, small && s.labelSmall]}>{label}</Text>
        {!!where && !small && <Text style={s.where}>{where}</Text>}
      </View>
    </View>
  );
}

// Zeile „Dazu tippst du“ mit den Knöpfen eines Schritts (in der Reihenfolge, in der sie gebraucht werden)
export function ButtonChips({ keys, small }: { keys: SketchButtonKey[]; small?: boolean }) {
  if (keys.length === 0) return null;
  return (
    <View testID="button-chips" style={s.row}>
      <Text style={[s.lead, small && s.leadSmall]}>Dazu tippst du:</Text>
      <View style={s.chips}>
        {keys.map((key, index) => (
          <View key={key} style={s.item}>
            {index > 0 && <Ionicons name="chevron-forward" size={12} color="#94a3b8" />}
            <ButtonChip {...SKETCH_BUTTONS[key]} small={small} />
          </View>
        ))}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  row: { gap: 4, marginTop: 4 },
  lead: { fontSize: 12, fontWeight: '700', color: '#64748b' },
  leadSmall: { fontSize: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 4 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4, paddingLeft: 4, paddingRight: 8, borderRadius: 8, backgroundColor: '#f1f5f9', borderWidth: 1, borderColor: '#e2e8f0' },
  chipSmall: { gap: 4, paddingVertical: 2, paddingLeft: 2, paddingRight: 6 },
  iconBox: { width: 30, height: 30, borderRadius: 6, borderWidth: 1.5, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  iconBoxSmall: { width: 22, height: 22, borderRadius: 5 },
  texts: { flexShrink: 1 },
  label: { fontSize: 13, fontWeight: '700', color: '#0f172a' },
  labelSmall: { fontSize: 11 },
  where: { fontSize: 10, color: '#64748b' },
});

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Ionicons from '@react-native-vector-icons/ionicons';
import { Project } from '../../../services/LocalStorage';
import { cardShadow } from './HomeTiles';

// Lokales Datum als YYYY-MM-DD (für Termin-Vergleich)
export const todayKey = (d: Date = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

type Props = {
  appointments: Project[];
  editedToday: Project[];
  customerName: (p: Project) => string | undefined;
  onOpen: (id: string) => void;
};

// Heute-Übersicht: Projekte mit Termin heute + heute bearbeitete Projekte
export function TodayOverview({ appointments, editedToday, customerName, onOpen }: Props) {
  const row = (p: Project, kind: 'termin' | 'edit') => (
    <TouchableOpacity key={`${kind}-${p.id}`} testID={`home-today-${kind}-${p.id}`} style={s.row} onPress={() => onOpen(p.id)}>
      <View style={[s.dot, { backgroundColor: kind === 'termin' ? '#dc2626' : '#1976d2' }]} />
      <View style={{ flex: 1 }}>
        <Text style={s.name} numberOfLines={1}>{p.name}</Text>
        {!!customerName(p) && <Text style={s.sub} numberOfLines={1}>{customerName(p)}</Text>}
      </View>
      {kind === 'termin' && !!p.appointment_time && <Text style={s.time}>{p.appointment_time} Uhr</Text>}
      <Ionicons name="chevron-forward" size={18} color="#94a3b8" />
    </TouchableOpacity>
  );
  const date = new Date().toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });
  return (
    <View style={s.card} testID="home-today">
      <View style={s.header}>
        <Ionicons name="today-outline" size={22} color="#dc2626" />
        <Text style={s.title}>Heute</Text>
        <Text style={s.date}>{date}</Text>
      </View>
      <Text style={s.group}>Termine</Text>
      {appointments.length === 0
        ? <Text style={s.empty}>Heute keine Termine. Termin im Projekt eintragen.</Text>
        : appointments.map(p => row(p, 'termin'))}
      {editedToday.length > 0 && (
        <>
          <Text style={[s.group, { marginTop: 10 }]}>Heute bearbeitet</Text>
          {editedToday.map(p => row(p, 'edit'))}
        </>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: '#fff', borderRadius: 20, padding: 16, ...cardShadow },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  title: { fontSize: 18, fontWeight: '800', color: '#0f172a' },
  date: { flex: 1, textAlign: 'right', fontSize: 13, color: '#64748b' },
  group: { fontSize: 12, fontWeight: '800', color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 4 },
  empty: { fontSize: 14, color: '#94a3b8', paddingVertical: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  dot: { width: 10, height: 10, borderRadius: 5 },
  name: { fontSize: 15, fontWeight: '700', color: '#0f172a' },
  sub: { fontSize: 12, color: '#64748b' },
  time: { fontSize: 13, fontWeight: '700', color: '#dc2626' },
});

import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Ionicons from '@react-native-vector-icons/ionicons';
import { Project } from '../../../services/LocalStorage';
import { PackItem } from '../../../services/AppointmentService';
import { cardShadow } from './HomeTiles';
import { tourRef } from './HomeTour';

// Lokales Datum als YYYY-MM-DD (für Termin-Vergleich)
export const todayKey = (d: Date = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// Ein Eintrag im Kalender der Startseite (Projekt-Termin oder eigener Termin)
export type AgendaItem = {
  key: string;
  title: string;
  subtitle?: string;
  date: string;
  time?: string | null;
  address?: string;
  note?: string;
  hasReminder?: boolean;
  packing?: { done: number; total: number };
  packItems?: PackItem[];
  onTogglePack?: (itemId: string) => void;
  onPress: () => void;
};

export function AgendaRow({ item, onNavigate, testID }: { item: AgendaItem; onNavigate: (a: string) => void; testID: string }) {
  const [packOpen, setPackOpen] = useState(false);
  const allDone = !!item.packing && item.packing.done === item.packing.total;
  return (
    <View>
    <View style={s.row}>
      <TouchableOpacity testID={testID} style={s.rowMain} onPress={item.onPress}>
        <View style={s.timeBox}>
          <Text style={s.timeText}>{item.time || 'ganztägig'}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.name} numberOfLines={1}>{item.title}</Text>
          {!!(item.subtitle || item.note) && <Text style={s.sub} numberOfLines={1}>{[item.subtitle, item.note].filter(Boolean).join(' · ')}</Text>}
        </View>
        {item.hasReminder && <Ionicons name="notifications-outline" size={16} color="#0369a1" />}
      </TouchableOpacity>
      {!!item.packing?.total && (
        <TouchableOpacity
          testID={`${testID}-packing`}
          accessibilityLabel={`${item.packing.done} von ${item.packing.total} Sachen eingepackt – Liste ${packOpen ? 'schließen' : 'öffnen'}`}
          disabled={!item.onTogglePack}
          onPress={() => setPackOpen(!packOpen)}
          style={[s.pack, allDone && { backgroundColor: '#dcfce7' }, packOpen && s.packOpen]}
        >
          <Ionicons name="bag-check-outline" size={14} color={allDone ? '#16a34a' : '#b45309'} />
          <Text style={[s.packText, allDone && { color: '#16a34a' }]}>{item.packing.done}/{item.packing.total}</Text>
          {!!item.onTogglePack && <Ionicons name={packOpen ? 'chevron-up' : 'chevron-down'} size={12} color={allDone ? '#16a34a' : '#b45309'} />}
        </TouchableOpacity>
      )}
      {!!item.address && (
        <TouchableOpacity testID={`${testID}-navi`} style={s.navi} onPress={() => onNavigate(item.address!)} accessibilityLabel="Navigation starten">
          <Ionicons name="navigate" size={20} color="#fff" />
        </TouchableOpacity>
      )}
    </View>
    {packOpen && item.packItems && item.onTogglePack && (
      <View testID={`${testID}-packlist`} style={s.packList}>
        {item.packItems.map(p => (
          <TouchableOpacity key={p.id} testID={`${testID}-pack-${p.text}`} style={s.packItem} onPress={() => item.onTogglePack!(p.id)}>
            <Ionicons name={p.done ? 'checkbox' : 'square-outline'} size={22} color={p.done ? '#16a34a' : '#64748b'} />
            <Text style={[s.packItemText, p.done && s.packItemDone]}>{p.text}</Text>
          </TouchableOpacity>
        ))}
      </View>
    )}
    </View>
  );
}

type Props = {
  items: AgendaItem[];
  editedToday: Project[];
  onOpenProject: (id: string) => void;
  onAdd: () => void;
  onNavigate: (address: string) => void;
};

// Heute-Übersicht: Termine heute + heute bearbeitete Projekte
export function TodayOverview({ items, editedToday, onOpenProject, onAdd, onNavigate, style }: Props & { style?: any }) {
  const date = new Date().toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });
  return (
    <View style={[s.card, style]} testID="home-today">
      <View style={s.header}>
        <Ionicons name="today-outline" size={22} color="#dc2626" />
        <View style={{ flex: 1 }}>
          <Text style={s.title}>Heute</Text>
          <Text style={s.date}>{date}</Text>
        </View>
        <View ref={tourRef('termin')} collapsable={false}>
          <TouchableOpacity testID="home-add-appointment" style={s.addBtn} onPress={onAdd}>
            <Ionicons name="add" size={18} color="#fff" />
            <Text style={s.addText}>Termin</Text>
          </TouchableOpacity>
        </View>
      </View>
      {items.length === 0
        ? <Text style={s.empty}>Heute keine Termine.</Text>
        : items.map(i => <AgendaRow key={i.key} item={i} onNavigate={onNavigate} testID={`home-today-${i.key}`} />)}
      {editedToday.length > 0 && (
        <>
          <Text style={s.group}>Heute bearbeitet</Text>
          {editedToday.map(p => (
            <TouchableOpacity key={p.id} testID={`home-today-edit-${p.id}`} style={s.editRow} onPress={() => onOpenProject(p.id)}>
              <Ionicons name="create-outline" size={16} color="#1976d2" />
              <Text style={s.editName} numberOfLines={1}>{p.name}</Text>
              <Ionicons name="chevron-forward" size={16} color="#94a3b8" />
            </TouchableOpacity>
          ))}
        </>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  pack: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#fef3c7', borderRadius: 12, paddingHorizontal: 8, minHeight: 44, minWidth: 56, justifyContent: 'center', marginLeft: 6 },
  packOpen: { borderWidth: 1.5, borderColor: '#f59e0b' },
  packText: { fontSize: 12, fontWeight: '800', color: '#b45309' },
  packList: { marginTop: -2, marginBottom: 8, marginLeft: 8, paddingLeft: 10, borderLeftWidth: 3, borderLeftColor: '#fde68a' },
  packItem: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 },
  packItemText: { fontSize: 15, color: '#0f172a', flex: 1 },
  packItemDone: { color: '#94a3b8', textDecorationLine: 'line-through' },

  card: { backgroundColor: '#fff', borderRadius: 20, padding: 16, ...cardShadow },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  title: { fontSize: 18, fontWeight: '800', color: '#0f172a' },
  date: { fontSize: 12, color: '#64748b' },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#dc2626', borderRadius: 12, paddingHorizontal: 12, minHeight: 40 },
  addText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  group: { fontSize: 12, fontWeight: '800', color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 12, marginBottom: 2 },
  empty: { fontSize: 14, color: '#94a3b8', paddingVertical: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 56, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 56 },
  timeBox: { minWidth: 62, paddingVertical: 4, paddingHorizontal: 6, borderRadius: 8, backgroundColor: '#fef2f2', alignItems: 'center' },
  timeText: { fontSize: 12, fontWeight: '800', color: '#dc2626' },
  name: { fontSize: 15, fontWeight: '700', color: '#0f172a' },
  sub: { fontSize: 12, color: '#64748b' },
  navi: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#16a34a', alignItems: 'center', justifyContent: 'center' },
  editRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 },
  editName: { flex: 1, fontSize: 14, fontWeight: '600', color: '#1e293b' },
});

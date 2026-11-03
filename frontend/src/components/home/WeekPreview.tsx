import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Ionicons from '@react-native-vector-icons/ionicons';
import { AgendaItem, AgendaRow } from './TodayOverview';
import { cardShadow } from './HomeTiles';

// Kleine Vorschau: Termine der nächsten 7 Tage (ab morgen), nach Tag gruppiert
export function WeekPreview({ items, onNavigate, style }: { items: AgendaItem[]; onNavigate: (a: string) => void; style?: any }) {
  const byDay: Record<string, AgendaItem[]> = {};
  items.forEach(i => { (byDay[i.date] = byDay[i.date] || []).push(i); });
  const days = Object.keys(byDay).sort();
  const label = (k: string) => {
    const [y, m, d] = k.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
    if (date.toDateString() === tomorrow.toDateString()) return 'Morgen';
    return date.toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: '2-digit' });
  };
  return (
    <View style={[s.card, style]} testID="home-week">
      <View style={s.header}>
        <Ionicons name="calendar-outline" size={22} color="#7c3aed" />
        <Text style={s.title}>Nächste 7 Tage</Text>
        <Text style={s.count}>{items.length} {items.length === 1 ? 'Termin' : 'Termine'}</Text>
      </View>
      {days.length === 0 ? (
        <Text style={s.empty}>Keine Termine in den nächsten 7 Tagen.</Text>
      ) : days.map(day => (
        <View key={day} testID={`home-week-day-${day}`}>
          <Text style={s.day}>{label(day)}</Text>
          {byDay[day].map(i => <AgendaRow key={i.key} item={i} onNavigate={onNavigate} testID={`home-week-${i.key}`} />)}
        </View>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: '#fff', borderRadius: 20, padding: 16, ...cardShadow },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  title: { flex: 1, fontSize: 18, fontWeight: '800', color: '#0f172a' },
  count: { fontSize: 13, color: '#64748b', fontWeight: '600' },
  empty: { fontSize: 14, color: '#94a3b8', paddingVertical: 8 },
  day: { fontSize: 12, fontWeight: '800', color: '#7c3aed', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 10 },
});

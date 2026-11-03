import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Ionicons from '@react-native-vector-icons/ionicons';
import { Project } from '../../../services/LocalStorage';
import { getStatusMeta } from '../../constants/projectStatus';
import { cardShadow } from './HomeTiles';

type Props = {
  projects: Project[];
  customerName: (p: Project) => string | undefined;
  onOpen: (id: string) => void;
  onShowAll: () => void;
};

// Letzte Projekte (max. 3) – alle weiteren liegen auf der Projektseite mit Ordnern
export function RecentProjects({ projects, customerName, onOpen, onShowAll }: Props) {
  return (
    <View style={s.card}>
      <View style={s.header}>
        <Ionicons name="folder-open-outline" size={22} color="#1976d2" />
        <Text style={s.title}>Letzte Projekte</Text>
        <TouchableOpacity testID="home-recent-all" onPress={onShowAll} style={s.all} hitSlop={8}>
          <Text style={s.allText}>Alle anzeigen</Text>
          <Ionicons name="chevron-forward" size={16} color="#1976d2" />
        </TouchableOpacity>
      </View>
      {projects.length === 0 ? (
        <Text style={s.empty}>Noch keine Projekte – lege dein erstes Projekt an.</Text>
      ) : projects.map((p, i) => {
        const meta = getStatusMeta(p.status);
        return (
          <TouchableOpacity key={p.id} testID={`home-recent-${p.id}`} style={[s.row, i > 0 && s.rowBorder]} onPress={() => onOpen(p.id)}>
            <View style={[s.thumb, { backgroundColor: meta.color + '1f' }]}>
              <Ionicons name="home" size={22} color={meta.color} />
            </View>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                {!!p.project_number && <Text style={s.number}>{p.project_number}</Text>}
                <Text style={s.name} numberOfLines={1}>{p.name}</Text>
              </View>
              <Text style={s.customer} numberOfLines={1}>{customerName(p) || meta.label}</Text>
            </View>
            <Text style={s.date}>{new Date(p.updated_at || p.created_at).toLocaleDateString('de-DE')}</Text>
            <Ionicons name="chevron-forward" size={18} color="#94a3b8" />
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  card: { flex: 1, backgroundColor: '#fff', borderRadius: 20, padding: 16, ...cardShadow },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  title: { flex: 1, fontSize: 18, fontWeight: '800', color: '#0f172a' },
  all: { flexDirection: 'row', alignItems: 'center', minHeight: 44 },
  allText: { color: '#1976d2', fontWeight: '700', fontSize: 14 },
  empty: { color: '#64748b', fontSize: 14, paddingVertical: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64, paddingVertical: 8 },
  rowBorder: { borderTopWidth: 1, borderTopColor: '#eef2f7' },
  thumb: { width: 52, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  number: { fontSize: 11, fontWeight: '800', color: '#15803d', backgroundColor: '#dcfce7', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, overflow: 'hidden' },
  name: { flexShrink: 1, fontSize: 15, fontWeight: '800', color: '#0f172a' },
  customer: { fontSize: 13, color: '#64748b', marginTop: 2 },
  date: { fontSize: 12, color: '#64748b' },
});

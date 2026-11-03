import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import Ionicons from '@react-native-vector-icons/ionicons';
import { ProjectFolder } from '../../../services/ProjectFolders';
import { cardShadow } from './HomeTiles';

type Props = {
  folders: ProjectFolder[];
  counts: Record<string, number>;
  onOpen: (folderId: string) => void;
  onManage: () => void;
};

// Projektordner als Kacheln – ein Tipp öffnet die Projektseite mit diesem Ordner
export function FolderTiles({ folders, counts, onOpen, onManage }: Props) {
  return (
    <View style={s.card}>
      <View style={s.header}>
        <Ionicons name="folder" size={22} color="#f59e0b" />
        <Text style={s.title}>Projektordner</Text>
        <TouchableOpacity testID="home-folders-manage" onPress={onManage} style={s.link} hitSlop={8}>
          <Text style={s.linkText}>{folders.length > 0 ? 'Verwalten' : 'Ordner anlegen'}</Text>
          <Ionicons name="chevron-forward" size={16} color="#1976d2" />
        </TouchableOpacity>
      </View>
      {folders.length === 0 ? (
        <Text style={s.empty}>Sortiere Projekte in Ordner, z. B. nach Kunde oder Jahr.</Text>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12 }}>
          {folders.map(f => (
            <TouchableOpacity key={f.id} testID={`home-folder-${f.id}`} style={[s.tile, { backgroundColor: f.color + '14', borderColor: f.color + '40' }]} onPress={() => onOpen(f.id)}>
              <Ionicons name="folder" size={30} color={f.color} />
              <Text style={s.tileName} numberOfLines={2}>{f.name}</Text>
              <Text style={[s.tileCount, { color: f.color }]}>{counts[f.id] || 0} {counts[f.id] === 1 ? 'Projekt' : 'Projekte'}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: '#fff', borderRadius: 20, padding: 16, ...cardShadow },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  title: { flex: 1, fontSize: 18, fontWeight: '800', color: '#0f172a' },
  link: { flexDirection: 'row', alignItems: 'center', minHeight: 44 },
  linkText: { color: '#1976d2', fontWeight: '700', fontSize: 14 },
  empty: { color: '#64748b', fontSize: 14 },
  tile: { width: 140, minHeight: 104, borderRadius: 16, borderWidth: 1, padding: 12, gap: 4 },
  tileName: { fontSize: 15, fontWeight: '800', color: '#0f172a' },
  tileCount: { fontSize: 12, fontWeight: '700' },
});

import React from 'react';
import { ScrollView, TouchableOpacity, Text, View, StyleSheet } from 'react-native';
import Ionicons from '@react-native-vector-icons/ionicons';
import { ProjectFolder } from '../../../services/ProjectFolders';

// Ordner-Leiste über der Projektliste: Alle · Ohne Ordner · eigene Ordner · + Ordner
export const FOLDER_ALL = 'all';
export const FOLDER_NONE = 'none';

type Props = {
  folders: ProjectFolder[];
  counts: Record<string, number>;
  active: string;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onManage: (folder: ProjectFolder) => void;
};

export function FolderBar({ folders, counts, active, onSelect, onAdd, onManage }: Props) {
  const chip = (id: string, label: string, color: string, icon: any, folder?: ProjectFolder) => {
    const isActive = active === id;
    return (
      <TouchableOpacity
        key={id}
        testID={`folder-chip-${id}`}
        style={[s.chip, isActive && { backgroundColor: color, borderColor: color }]}
        onPress={() => onSelect(id)}
        onLongPress={folder ? () => onManage(folder) : undefined}
      >
        <Ionicons name={icon} size={16} color={isActive ? '#fff' : color} />
        <Text style={[s.chipText, isActive && { color: '#fff' }]} numberOfLines={1}>{label}</Text>
        <Text style={[s.count, isActive && { color: '#fff' }]}>{counts[id] ?? 0}</Text>
        {folder && isActive && (
          <TouchableOpacity testID={`folder-manage-${folder.id}`} onPress={() => onManage(folder)} hitSlop={8} style={{ marginLeft: 2 }}>
            <Ionicons name="ellipsis-horizontal" size={16} color="#fff" />
          </TouchableOpacity>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <View style={s.wrap}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.row}>
        {chip(FOLDER_ALL, 'Alle Ordner', '#1976d2', 'albums-outline')}
        {folders.map(f => chip(f.id, f.name, f.color, 'folder', f))}
        {folders.length > 0 && chip(FOLDER_NONE, 'Ohne Ordner', '#64748b', 'folder-open-outline')}
        <TouchableOpacity testID="folder-add" style={[s.chip, s.addChip]} onPress={onAdd}>
          <Ionicons name="add" size={16} color="#1976d2" />
          <Text style={[s.chipText, { color: '#1976d2' }]}>Ordner</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { marginTop: 8 },
  row: { paddingHorizontal: 16, gap: 8, alignItems: 'center' },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 40, paddingHorizontal: 12,
    borderRadius: 20, borderWidth: 1, borderColor: '#dbe3ee', backgroundColor: '#fff', maxWidth: 220,
  },
  addChip: { borderStyle: 'dashed', borderColor: '#1976d2' },
  chipText: { fontSize: 14, fontWeight: '600', color: '#334155', flexShrink: 1 },
  count: { fontSize: 12, fontWeight: '700', color: '#94a3b8' },
});

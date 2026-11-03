import React from 'react';
import { Modal, View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import Ionicons from '@react-native-vector-icons/ionicons';
import { ProjectFolder } from '../../../services/ProjectFolders';

// Auswahl, in welchen Ordner ein oder mehrere Projekte verschoben werden
type Props = {
  visible: boolean;
  folders: ProjectFolder[];
  currentFolderId?: string | null;
  subtitle?: string;
  onPick: (folderId: string | null) => void;
  onNewFolder: () => void;
  onClose: () => void;
};

export function FolderPickerModal({ visible, folders, currentFolderId, subtitle, onPick, onNewFolder, onClose }: Props) {
  const row = (id: string | null, name: string, color: string, icon: any) => {
    const isCurrent = (currentFolderId || null) === id;
    return (
      <TouchableOpacity key={id || 'none'} testID={`folder-pick-${id || 'none'}`} style={s.row} onPress={() => onPick(id)}>
        <Ionicons name={icon} size={22} color={color} />
        <Text style={s.rowText} numberOfLines={1}>{name}</Text>
        {isCurrent && <Ionicons name="checkmark" size={20} color="#16a34a" />}
      </TouchableOpacity>
    );
  };
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={s.backdrop} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} style={s.box}>
          <Text style={s.title}>In Ordner verschieben</Text>
          {!!subtitle && <Text style={s.subtitle}>{subtitle}</Text>}
          <ScrollView style={{ maxHeight: 360 }}>
            {folders.map(f => row(f.id, f.name, f.color, 'folder'))}
            {row(null, 'Ohne Ordner', '#64748b', 'folder-open-outline')}
          </ScrollView>
          <TouchableOpacity testID="folder-pick-new" style={[s.row, { borderBottomWidth: 0 }]} onPress={onNewFolder}>
            <Ionicons name="add-circle-outline" size={22} color="#1976d2" />
            <Text style={[s.rowText, { color: '#1976d2' }]}>Neuer Ordner…</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.cancel} onPress={onClose}>
            <Text style={s.cancelText}>Abbrechen</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  box: { width: '100%', maxWidth: 400, backgroundColor: '#fff', borderRadius: 16, padding: 16 },
  title: { fontSize: 17, fontWeight: '700', color: '#0f172a' },
  subtitle: { fontSize: 13, color: '#64748b', marginTop: 2, marginBottom: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  rowText: { flex: 1, fontSize: 16, color: '#1e293b', fontWeight: '500' },
  cancel: { alignSelf: 'flex-end', minHeight: 44, justifyContent: 'center', paddingHorizontal: 12 },
  cancelText: { fontSize: 16, color: '#1976d2', fontWeight: '600' },
});

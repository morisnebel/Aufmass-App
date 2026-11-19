import React from 'react';
import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Ionicons from '@react-native-vector-icons/ionicons';
import { OPENING_COLORS, OPENING_KINDS, OpeningKind } from '../../sketch/wallArea';

type Props = {
  visible: boolean;
  line: number; // Nummer der Linie (1-basiert)
  onPick: (kind: OpeningKind) => void;
  onClose: () => void;
};

// Auswahl nach langem Druck auf eine Linie: Tür, Fenster oder sonstige Öffnung an dieser Stelle einfügen
export const OpeningInsertMenu = ({ visible, line, onPick, onClose }: Props) => (
  <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
    <Pressable testID="opening-insert-backdrop" style={styles.backdrop} onPress={onClose}>
      <Pressable style={styles.card} onPress={() => {}}>
        <Text style={styles.title}>An Linie {line} einfügen</Text>
        {OPENING_KINDS.map(kind => (
          <TouchableOpacity key={kind.id} testID={`opening-insert-${kind.id}`} style={styles.button} onPress={() => onPick(kind.id)}>
            <View style={[styles.swatch, { backgroundColor: OPENING_COLORS[kind.id] }]} />
            <Text style={styles.buttonText}>{kind.label}</Text>
            <Ionicons name="add" size={20} color="#5d4037" />
          </TouchableOpacity>
        ))}
        <TouchableOpacity testID="opening-insert-cancel" style={styles.cancel} onPress={onClose}>
          <Text style={styles.cancelText}>Abbrechen</Text>
        </TouchableOpacity>
      </Pressable>
    </Pressable>
  </Modal>
);

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end', alignItems: 'center', padding: 16 },
  card: { width: '100%', maxWidth: 360, backgroundColor: '#fff', borderRadius: 12, padding: 12, gap: 8, marginBottom: 16 },
  title: { fontSize: 14, fontWeight: '700', color: '#4e342e', marginBottom: 2 },
  button: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: '#d7ccc8', backgroundColor: '#efebe9' },
  swatch: { width: 22, height: 6, borderRadius: 3 },
  buttonText: { flex: 1, fontSize: 15, fontWeight: '600', color: '#4e342e' },
  cancel: { minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  cancelText: { fontSize: 14, fontWeight: '600', color: '#757575' },
});

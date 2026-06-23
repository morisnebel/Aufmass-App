import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  Alert, Modal, KeyboardAvoidingView, Platform, Switch,
} from 'react-native';
import { useFocusEffect, useNavigation } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MachineMasterService, MachineMaster } from '../../services/LocalStorage';

const EMPTY: Partial<MachineMaster> = {
  name: '', category: '', serial_number: '', note: '', active: true,
};

const CATEGORY_PRESETS = ['Hebezeug', 'Werkzeug', 'Fahrzeug', 'Vermessung', 'Gerüst', 'Sicherung'];

export default function MachinesIndex() {
  const navigation = useNavigation();
  const [items, setItems] = useState<MachineMaster[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [editing, setEditing] = useState<MachineMaster | null>(null);
  const [form, setForm] = useState<Partial<MachineMaster>>(EMPTY);

  React.useEffect(() => {
    navigation.setOptions({
      title: 'Maschinen & Geräte',
      headerStyle: { backgroundColor: '#1976d2' },
      headerTintColor: '#fff',
    });
  }, [navigation]);

  const load = useCallback(async () => {
    const all = await MachineMasterService.getAll();
    setItems(all);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const openCreate = () => { setEditing(null); setForm({ ...EMPTY }); setModalVisible(true); };
  const openEdit = (m: MachineMaster) => { setEditing(m); setForm({ ...m }); setModalVisible(true); };

  const handleSave = async () => {
    if (!form.name || !form.name.trim()) {
      Alert.alert('Hinweis', 'Bitte Bezeichnung eingeben.');
      return;
    }
    try {
      if (editing) {
        await MachineMasterService.update(editing.id, form);
      } else {
        await MachineMasterService.create(form as any);
      }
      setModalVisible(false);
      await load();
    } catch (e) {
      console.error(e);
      Alert.alert('Fehler', 'Speichern fehlgeschlagen.');
    }
  };

  const handleDelete = (m: MachineMaster) => {
    Alert.alert('Löschen?', `${m.name} wirklich löschen?`, [
      { text: 'Abbrechen', style: 'cancel' },
      { text: 'Löschen', style: 'destructive', onPress: async () => { await MachineMasterService.delete(m.id); await load(); } },
    ]);
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView style={styles.scroll} contentContainerStyle={{ padding: 12, paddingBottom: 80 }}>
        <TouchableOpacity style={styles.addButton} onPress={openCreate}>
          <Ionicons name="add-circle" size={22} color="#fff" />
          <Text style={styles.addButtonText}>Neue Maschine / Gerät</Text>
        </TouchableOpacity>

        {items.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="construct-outline" size={48} color="#ccc" />
            <Text style={styles.emptyText}>Keine Maschinen/Geräte angelegt</Text>
            <Text style={styles.emptySub}>
              Häufig genutzte Maschinen einmalig anlegen – beim Rapport schnell auswählbar.
            </Text>
          </View>
        ) : (
          items.map((m) => (
            <TouchableOpacity key={m.id} style={styles.matCard} onPress={() => openEdit(m)}>
              <View style={styles.matIconBox}>
                <Ionicons name="construct" size={22} color="#7c3aed" />
              </View>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={[styles.matName, !m.active && { color: '#9ca3af' }]}>{m.name}</Text>
                  {!m.active && <View style={styles.inactiveBadge}><Text style={styles.inactiveText}>inaktiv</Text></View>}
                </View>
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 2, flexWrap: 'wrap' }}>
                  {m.category ? <Text style={styles.matMeta}>🏷️ {m.category}</Text> : null}
                  {m.serial_number ? <Text style={styles.matMeta}>📋 {m.serial_number}</Text> : null}
                </View>
                {m.note ? <Text style={styles.matSub}>{m.note}</Text> : null}
              </View>
              <TouchableOpacity onPress={() => handleDelete(m)} style={styles.delBtn}>
                <Ionicons name="trash-outline" size={20} color="#ef4444" />
              </TouchableOpacity>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>

      <Modal visible={modalVisible} animationType="slide" transparent onRequestClose={() => setModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ width: '100%' }}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>{editing ? 'Bearbeiten' : 'Neue Maschine / Gerät'}</Text>
                <TouchableOpacity onPress={() => setModalVisible(false)}>
                  <Ionicons name="close" size={26} color="#666" />
                </TouchableOpacity>
              </View>
              <ScrollView style={{ maxHeight: 500 }}>
                <Text style={styles.label}>Bezeichnung *</Text>
                <TextInput style={styles.input} value={form.name || ''} onChangeText={(v) => setForm({ ...form, name: v })} placeholder="z.B. Kran, Gerüst, Akku-Werkzeuge" />

                <Text style={styles.label}>Kategorie</Text>
                <View style={styles.chipRow}>
                  {CATEGORY_PRESETS.map((c) => (
                    <TouchableOpacity key={c} style={[styles.chip, form.category === c && styles.chipActive]} onPress={() => setForm({ ...form, category: c })}>
                      <Text style={[styles.chipText, form.category === c && styles.chipTextActive]}>{c}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <TextInput style={styles.input} value={form.category || ''} onChangeText={(v) => setForm({ ...form, category: v })} placeholder="oder eigene Kategorie" />

                <Text style={styles.label}>Seriennummer / Inventar-Nr.</Text>
                <TextInput style={styles.input} value={form.serial_number || ''} onChangeText={(v) => setForm({ ...form, serial_number: v })} placeholder="z.B. SN-12345" />

                <Text style={styles.label}>Bemerkung</Text>
                <TextInput style={[styles.input, { minHeight: 60, textAlignVertical: 'top' }]} value={form.note || ''} onChangeText={(v) => setForm({ ...form, note: v })} placeholder="z.B. Wartungshinweise" multiline />

                <View style={styles.switchRow}>
                  <Text style={styles.label}>Aktiv (in Auswahl anzeigen)</Text>
                  <Switch value={form.active !== false} onValueChange={(v) => setForm({ ...form, active: v })} trackColor={{ true: '#1976d2' }} />
                </View>
              </ScrollView>
              <View style={styles.modalActions}>
                <TouchableOpacity style={[styles.modalBtn, styles.cancelBtn]} onPress={() => setModalVisible(false)}>
                  <Text style={styles.cancelBtnText}>Abbrechen</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.modalBtn, styles.saveBtn]} onPress={handleSave}>
                  <Ionicons name="checkmark" size={18} color="#fff" />
                  <Text style={styles.saveBtnText}>Speichern</Text>
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f7fa' },
  scroll: { flex: 1 },
  addButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#1976d2', paddingVertical: 14, borderRadius: 10, marginBottom: 12 },
  addButtonText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  empty: { alignItems: 'center', padding: 40 },
  emptyText: { color: '#666', fontWeight: '600', marginTop: 10 },
  emptySub: { color: '#999', textAlign: 'center', marginTop: 6, fontSize: 13, lineHeight: 18 },
  matCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', padding: 12, borderRadius: 12, marginBottom: 8, borderWidth: 1, borderColor: '#e5e7eb', gap: 10 },
  matIconBox: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#ede9fe', alignItems: 'center', justifyContent: 'center' },
  matName: { fontWeight: '700', color: '#0f172a', fontSize: 15 },
  matMeta: { fontSize: 12, color: '#666' },
  matSub: { fontSize: 11, color: '#999', marginTop: 2 },
  inactiveBadge: { backgroundColor: '#f3f4f6', paddingHorizontal: 6, paddingVertical: 1, borderRadius: 8 },
  inactiveText: { color: '#9ca3af', fontSize: 10, fontWeight: '600' },
  delBtn: { padding: 8 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 16 },
  modalContent: { backgroundColor: '#fff', borderRadius: 14, padding: 16, width: '100%', maxWidth: 500 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  modalTitle: { fontSize: 17, fontWeight: '700', color: '#0f172a' },
  label: { fontSize: 13, color: '#374151', fontWeight: '600', marginTop: 10, marginBottom: 4 },
  input: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 10, fontSize: 14 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  chip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14, backgroundColor: '#f3f4f6' },
  chipActive: { backgroundColor: '#7c3aed' },
  chipText: { fontSize: 12, color: '#374151', fontWeight: '600' },
  chipTextActive: { color: '#fff' },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  modalBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, borderRadius: 8, gap: 6 },
  cancelBtn: { backgroundColor: '#eceff1' },
  cancelBtnText: { color: '#555', fontWeight: '600' },
  saveBtn: { backgroundColor: '#4caf50' },
  saveBtnText: { color: '#fff', fontWeight: '700' },
});

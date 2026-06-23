import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  Modal,
  KeyboardAvoidingView,
  Platform,
  Switch,
} from 'react-native';
import { useFocusEffect, useNavigation } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialMasterService, MaterialMaster } from '../../services/LocalStorage';

const UNIT_OPTIONS = ['Stk', 'm', 'm²', 'm³', 'kg', 'L', 'Pck', 'Pal', 'h', 't', 'cm', 'Rolle'];

const EMPTY: Partial<MaterialMaster> = {
  name: '',
  unit: 'Stk',
  default_quantity: 1,
  category: '',
  price_per_unit: undefined,
  supplier: '',
  article_number: '',
  note: '',
  active: true,
};

export default function MaterialsIndex() {
  const navigation = useNavigation();
  const [materials, setMaterials] = useState<MaterialMaster[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [editing, setEditing] = useState<MaterialMaster | null>(null);
  const [form, setForm] = useState<Partial<MaterialMaster>>(EMPTY);
  const [search, setSearch] = useState('');

  React.useEffect(() => {
    navigation.setOptions({
      title: 'Material',
      headerStyle: { backgroundColor: '#1976d2' },
      headerTintColor: '#fff',
    });
  }, [navigation]);

  const load = useCallback(async () => {
    const all = await MaterialMasterService.getAll();
    setMaterials(all);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const openCreate = () => {
    setEditing(null);
    setForm({ ...EMPTY });
    setModalVisible(true);
  };

  const openEdit = (m: MaterialMaster) => {
    setEditing(m);
    setForm({ ...m });
    setModalVisible(true);
  };

  const handleSave = async () => {
    if (!form.name || !form.name.trim()) {
      Alert.alert('Hinweis', 'Bitte Materialnamen eingeben.');
      return;
    }
    if (!form.unit || !form.unit.trim()) {
      Alert.alert('Hinweis', 'Bitte Einheit angeben.');
      return;
    }
    try {
      if (editing) {
        await MaterialMasterService.update(editing.id, form);
      } else {
        await MaterialMasterService.create(form as any);
      }
      setModalVisible(false);
      await load();
    } catch (e) {
      console.error(e);
      Alert.alert('Fehler', 'Speichern fehlgeschlagen.');
    }
  };

  const handleDelete = (m: MaterialMaster) => {
    Alert.alert(
      'Material löschen',
      `${m.name} wirklich löschen?`,
      [
        { text: 'Abbrechen', style: 'cancel' },
        {
          text: 'Löschen',
          style: 'destructive',
          onPress: async () => {
            await MaterialMasterService.delete(m.id);
            await load();
          },
        },
      ]
    );
  };

  const filtered = materials.filter((m) => {
    if (!search.trim()) return true;
    const s = search.toLowerCase();
    return (
      m.name.toLowerCase().includes(s) ||
      (m.category || '').toLowerCase().includes(s) ||
      (m.article_number || '').toLowerCase().includes(s)
    );
  });

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView style={styles.scroll} contentContainerStyle={{ padding: 12, paddingBottom: 80 }}>
        <TouchableOpacity style={styles.addButton} onPress={openCreate}>
          <Ionicons name="add-circle" size={22} color="#fff" />
          <Text style={styles.addButtonText}>Neues Material</Text>
        </TouchableOpacity>

        {materials.length > 0 && (
          <View style={styles.searchBox}>
            <Ionicons name="search" size={18} color="#999" />
            <TextInput
              style={styles.searchInput}
              value={search}
              onChangeText={setSearch}
              placeholder="Material suchen..."
            />
            {search ? (
              <TouchableOpacity onPress={() => setSearch('')}>
                <Ionicons name="close-circle" size={18} color="#999" />
              </TouchableOpacity>
            ) : null}
          </View>
        )}

        {materials.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="cube-outline" size={48} color="#ccc" />
            <Text style={styles.emptyText}>Kein Material angelegt</Text>
            <Text style={styles.emptySub}>
              Legen Sie häufig verwendete Materialien einmalig an – beim Rapport schnell auswählbar.
            </Text>
          </View>
        ) : (
          filtered.map((m) => (
            <TouchableOpacity key={m.id} style={styles.matCard} onPress={() => openEdit(m)}>
              <View style={styles.matIconBox}>
                <Ionicons name="cube" size={24} color="#f59e0b" />
              </View>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={[styles.matName, !m.active && { color: '#9ca3af' }]}>{m.name}</Text>
                  {!m.active && (
                    <View style={styles.inactiveBadge}><Text style={styles.inactiveText}>inaktiv</Text></View>
                  )}
                </View>
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 2, flexWrap: 'wrap' }}>
                  <Text style={styles.matMeta}>📦 {m.unit}</Text>
                  {m.category ? <Text style={styles.matMeta}>🏷️ {m.category}</Text> : null}
                  {m.price_per_unit ? (
                    <Text style={styles.matMeta}>💶 {m.price_per_unit.toFixed(2)} €/{m.unit}</Text>
                  ) : null}
                </View>
                {m.article_number ? <Text style={styles.matSub}>Art.-Nr.: {m.article_number}</Text> : null}
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
                <Text style={styles.modalTitle}>{editing ? 'Material bearbeiten' : 'Neues Material'}</Text>
                <TouchableOpacity onPress={() => setModalVisible(false)}>
                  <Ionicons name="close" size={26} color="#666" />
                </TouchableOpacity>
              </View>
              <ScrollView style={{ maxHeight: 500 }}>
                <Text style={styles.label}>Bezeichnung *</Text>
                <TextInput
                  style={styles.input}
                  value={form.name || ''}
                  onChangeText={(v) => setForm({ ...form, name: v })}
                  placeholder="z.B. Dachziegel rot"
                />

                <Text style={styles.label}>Einheit *</Text>
                <View style={styles.chipRow}>
                  {UNIT_OPTIONS.map((u) => (
                    <TouchableOpacity
                      key={u}
                      style={[styles.chip, form.unit === u && styles.chipActive]}
                      onPress={() => setForm({ ...form, unit: u })}
                    >
                      <Text style={[styles.chipText, form.unit === u && styles.chipTextActive]}>{u}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <TextInput
                  style={styles.input}
                  value={form.unit || ''}
                  onChangeText={(v) => setForm({ ...form, unit: v })}
                  placeholder="oder eigene Einheit"
                />

                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.label}>Standard-Menge</Text>
                    <TextInput
                      style={styles.input}
                      value={form.default_quantity != null ? String(form.default_quantity) : ''}
                      onChangeText={(v) => setForm({ ...form, default_quantity: v ? parseFloat(v) : undefined })}
                      placeholder="1"
                      keyboardType="decimal-pad"
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.label}>Preis (€/Einheit)</Text>
                    <TextInput
                      style={styles.input}
                      value={form.price_per_unit != null ? String(form.price_per_unit) : ''}
                      onChangeText={(v) => setForm({ ...form, price_per_unit: v ? parseFloat(v) : undefined })}
                      placeholder="0.00"
                      keyboardType="decimal-pad"
                    />
                  </View>
                </View>

                <Text style={styles.label}>Kategorie</Text>
                <TextInput
                  style={styles.input}
                  value={form.category || ''}
                  onChangeText={(v) => setForm({ ...form, category: v })}
                  placeholder="z.B. Dachziegel, Holz"
                />

                <Text style={styles.label}>Lieferant</Text>
                <TextInput
                  style={styles.input}
                  value={form.supplier || ''}
                  onChangeText={(v) => setForm({ ...form, supplier: v })}
                  placeholder="Lieferantenname"
                />

                <Text style={styles.label}>Artikel-Nr.</Text>
                <TextInput
                  style={styles.input}
                  value={form.article_number || ''}
                  onChangeText={(v) => setForm({ ...form, article_number: v })}
                  placeholder="Artikel-Nummer"
                />

                <Text style={styles.label}>Bemerkung</Text>
                <TextInput
                  style={[styles.input, { minHeight: 60, textAlignVertical: 'top' }]}
                  value={form.note || ''}
                  onChangeText={(v) => setForm({ ...form, note: v })}
                  placeholder="Zusätzliche Info"
                  multiline
                />

                <View style={styles.switchRow}>
                  <Text style={styles.label}>Aktiv (in Auswahl anzeigen)</Text>
                  <Switch
                    value={form.active !== false}
                    onValueChange={(v) => setForm({ ...form, active: v })}
                    trackColor={{ true: '#1976d2' }}
                  />
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
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#1976d2',
    paddingVertical: 14,
    borderRadius: 10,
    marginBottom: 12,
  },
  addButtonText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingHorizontal: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  searchInput: { flex: 1, paddingVertical: 10, fontSize: 14 },
  empty: { alignItems: 'center', padding: 40 },
  emptyText: { color: '#666', fontWeight: '600', marginTop: 10 },
  emptySub: { color: '#999', textAlign: 'center', marginTop: 6, fontSize: 13, lineHeight: 18 },
  matCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 12,
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    gap: 10,
  },
  matIconBox: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: '#fef3c7',
    alignItems: 'center', justifyContent: 'center',
  },
  matName: { fontWeight: '700', color: '#0f172a', fontSize: 15 },
  matMeta: { fontSize: 12, color: '#666' },
  matSub: { fontSize: 11, color: '#999', marginTop: 2 },
  inactiveBadge: { backgroundColor: '#f3f4f6', paddingHorizontal: 6, paddingVertical: 1, borderRadius: 8 },
  inactiveText: { color: '#9ca3af', fontSize: 10, fontWeight: '600' },
  delBtn: { padding: 8 },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    width: '100%',
    maxWidth: 500,
  },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  modalTitle: { fontSize: 17, fontWeight: '700', color: '#0f172a' },
  label: { fontSize: 13, color: '#374151', fontWeight: '600', marginTop: 10, marginBottom: 4 },
  input: {
    borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 10, fontSize: 14,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  chip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14, backgroundColor: '#f3f4f6' },
  chipActive: { backgroundColor: '#1976d2' },
  chipText: { fontSize: 12, color: '#374151', fontWeight: '600' },
  chipTextActive: { color: '#fff' },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  modalBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 12, borderRadius: 8, gap: 6,
  },
  cancelBtn: { backgroundColor: '#eceff1' },
  cancelBtnText: { color: '#555', fontWeight: '600' },
  saveBtn: { backgroundColor: '#4caf50' },
  saveBtnText: { color: '#fff', fontWeight: '700' },
});

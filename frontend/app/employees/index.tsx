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
import { EmployeeMasterService, EmployeeMaster } from '../../services/LocalStorage';

const EMPTY: Partial<EmployeeMaster> = {
  name: '',
  role: '',
  hourly_rate: undefined,
  phone: '',
  email: '',
  active: true,
};

export default function EmployeesIndex() {
  const navigation = useNavigation();
  const [employees, setEmployees] = useState<EmployeeMaster[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [editing, setEditing] = useState<EmployeeMaster | null>(null);
  const [form, setForm] = useState<Partial<EmployeeMaster>>(EMPTY);

  React.useEffect(() => {
    navigation.setOptions({
      title: 'Mitarbeiter',
      headerStyle: { backgroundColor: '#1976d2' },
      headerTintColor: '#fff',
    });
  }, [navigation]);

  const load = useCallback(async () => {
    const all = await EmployeeMasterService.getAll();
    setEmployees(all);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const openCreate = () => {
    setEditing(null);
    setForm({ ...EMPTY });
    setModalVisible(true);
  };

  const openEdit = (emp: EmployeeMaster) => {
    setEditing(emp);
    setForm({ ...emp });
    setModalVisible(true);
  };

  const handleSave = async () => {
    if (!form.name || !form.name.trim()) {
      Alert.alert('Hinweis', 'Bitte Namen eingeben.');
      return;
    }
    try {
      if (editing) {
        await EmployeeMasterService.update(editing.id, form);
      } else {
        await EmployeeMasterService.create(form as any);
      }
      setModalVisible(false);
      await load();
    } catch (e) {
      console.error(e);
      Alert.alert('Fehler', 'Speichern fehlgeschlagen.');
    }
  };

  const handleDelete = (emp: EmployeeMaster) => {
    Alert.alert(
      'Mitarbeiter löschen',
      `${emp.name} wirklich löschen?`,
      [
        { text: 'Abbrechen', style: 'cancel' },
        {
          text: 'Löschen',
          style: 'destructive',
          onPress: async () => {
            await EmployeeMasterService.delete(emp.id);
            await load();
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView style={styles.scroll} contentContainerStyle={{ padding: 12, paddingBottom: 80 }}>
        <TouchableOpacity style={styles.addButton} onPress={openCreate}>
          <Ionicons name="add-circle" size={22} color="#fff" />
          <Text style={styles.addButtonText}>Neuer Mitarbeiter</Text>
        </TouchableOpacity>

        {employees.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="people-outline" size={48} color="#ccc" />
            <Text style={styles.emptyText}>Keine Mitarbeiter angelegt</Text>
            <Text style={styles.emptySub}>
              Legen Sie Ihre Mitarbeiter einmalig an – beim Rapport können Sie sie dann bequem auswählen.
            </Text>
          </View>
        ) : (
          employees.map((emp) => (
            <TouchableOpacity key={emp.id} style={styles.empCard} onPress={() => openEdit(emp)}>
              <View style={[styles.avatar, !emp.active && { backgroundColor: '#e5e7eb' }]}>
                <Text style={styles.avatarText}>{emp.name.charAt(0).toUpperCase()}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={[styles.empName, !emp.active && { color: '#9ca3af' }]}>{emp.name}</Text>
                  {!emp.active && (
                    <View style={styles.inactiveBadge}><Text style={styles.inactiveText}>inaktiv</Text></View>
                  )}
                </View>
                {emp.role ? <Text style={styles.empRole}>{emp.role}</Text> : null}
                <View style={{ flexDirection: 'row', gap: 10, marginTop: 2 }}>
                  {emp.hourly_rate ? (
                    <Text style={styles.empMeta}>{emp.hourly_rate.toFixed(2)} €/Std</Text>
                  ) : null}
                  {emp.phone ? <Text style={styles.empMeta}>📞 {emp.phone}</Text> : null}
                </View>
              </View>
              <TouchableOpacity onPress={() => handleDelete(emp)} style={styles.delBtn}>
                <Ionicons name="trash-outline" size={20} color="#ef4444" />
              </TouchableOpacity>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>

      {/* Modal */}
      <Modal visible={modalVisible} animationType="slide" transparent onRequestClose={() => setModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ width: '100%' }}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>{editing ? 'Mitarbeiter bearbeiten' : 'Neuer Mitarbeiter'}</Text>
                <TouchableOpacity onPress={() => setModalVisible(false)}>
                  <Ionicons name="close" size={26} color="#666" />
                </TouchableOpacity>
              </View>
              <ScrollView style={{ maxHeight: 500 }}>
                <Text style={styles.label}>Name *</Text>
                <TextInput
                  style={styles.input}
                  value={form.name || ''}
                  onChangeText={(v) => setForm({ ...form, name: v })}
                  placeholder="Vor- und Nachname"
                />

                <Text style={styles.label}>Rolle / Funktion</Text>
                <TextInput
                  style={styles.input}
                  value={form.role || ''}
                  onChangeText={(v) => setForm({ ...form, role: v })}
                  placeholder="z.B. Dachdecker, Geselle, Azubi"
                />

                <Text style={styles.label}>Stundenlohn (€)</Text>
                <TextInput
                  style={styles.input}
                  value={form.hourly_rate != null ? String(form.hourly_rate) : ''}
                  onChangeText={(v) => setForm({ ...form, hourly_rate: v ? parseFloat(v) : undefined })}
                  placeholder="z.B. 45.00"
                  keyboardType="decimal-pad"
                />

                <Text style={styles.label}>Telefon</Text>
                <TextInput
                  style={styles.input}
                  value={form.phone || ''}
                  onChangeText={(v) => setForm({ ...form, phone: v })}
                  placeholder="Telefonnummer"
                  keyboardType="phone-pad"
                />

                <Text style={styles.label}>E-Mail</Text>
                <TextInput
                  style={styles.input}
                  value={form.email || ''}
                  onChangeText={(v) => setForm({ ...form, email: v })}
                  placeholder="E-Mail-Adresse"
                  keyboardType="email-address"
                  autoCapitalize="none"
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
  empty: { alignItems: 'center', padding: 40 },
  emptyText: { color: '#666', fontWeight: '600', marginTop: 10 },
  emptySub: { color: '#999', textAlign: 'center', marginTop: 6, fontSize: 13, lineHeight: 18 },
  empCard: {
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
  avatar: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: '#dbeafe',
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontWeight: '700', color: '#1976d2', fontSize: 16 },
  empName: { fontWeight: '700', color: '#0f172a', fontSize: 15 },
  empRole: { color: '#666', fontSize: 13, marginTop: 1 },
  empMeta: { fontSize: 12, color: '#666' },
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

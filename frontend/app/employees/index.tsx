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
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as FileSystem from 'expo-file-system/legacy';
import { readTextFile } from '../../utils/readTextFile';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import { EmployeeMasterService, EmployeeMaster, generateEmployeeNumber } from '../../services/LocalStorage';

const EMPTY: Partial<EmployeeMaster> = {
  employee_number: '',
  sort_order: undefined,
  name: '',
  role: '',
  hourly_rate: undefined,
  phone: '',
  mobile: '',
  email: '',
  active: true,
};

export default function EmployeesIndex() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const [employees, setEmployees] = useState<EmployeeMaster[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [editing, setEditing] = useState<EmployeeMaster | null>(null);
  const [form, setForm] = useState<Partial<EmployeeMaster>>(EMPTY);
  // Weitere Stundensätze (Roh-Strings für Komma-Eingabe)
  const [wageDrafts, setWageDrafts] = useState<{ id: string; name: string; rateStr: string }[]>([]);
  // ===== Export-Auswahl-Modus =====
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  React.useEffect(() => {
    navigation.setOptions({
      title: selectionMode ? `${selectedIds.size} ausgewählt` : 'Mitarbeiter',
      headerStyle: { backgroundColor: selectionMode ? '#0891b2' : '#1976d2' },
      headerTintColor: '#fff',
      headerRight: () => (
        <View style={{ flexDirection: 'row', gap: 8, paddingRight: 8 }}>
          {selectionMode ? (
            <>
              <TouchableOpacity
                onPress={() => {
                  if (selectedIds.size === employees.length) setSelectedIds(new Set());
                  else setSelectedIds(new Set(employees.map(e => e.id)));
                }}
                style={{ paddingHorizontal: 8, paddingVertical: 4 }}
              >
                <Text style={{ color: '#0f172a', fontSize: 13, fontWeight: '700' }}>
                  {selectedIds.size === employees.length ? 'Keine' : 'Alle'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => { setSelectionMode(false); setSelectedIds(new Set()); }}
                style={{ paddingHorizontal: 8, paddingVertical: 4 }}
              >
                <Ionicons name="close" size={22} color="#0f172a" />
              </TouchableOpacity>
            </>
          ) : (
            <TouchableOpacity onPress={openMenu} style={{ paddingHorizontal: 8, paddingVertical: 4 }}>
              <Ionicons name="ellipsis-vertical" size={22} color="#0f172a" />
            </TouchableOpacity>
          )}
        </View>
      ),
    });
  }, [navigation, selectionMode, selectedIds, employees]);
  const [menuVisible, setMenuVisible] = useState(false);
  const [pendingAction, setPendingAction] = useState<null | 'export-all' | 'select-mode' | 'import'>(null);
  const openMenu = () => setMenuVisible(true);

  const load = useCallback(async () => {
    const all = await EmployeeMasterService.getAll();
    // Nach Reihenfolge sortieren (1 = zuerst, ohne Reihenfolge ans Ende)
    all.sort((a, b) => {
      const ao = a.sort_order ?? 9999;
      const bo = b.sort_order ?? 9999;
      if (ao !== bo) return ao - bo;
      return (a.name || '').localeCompare(b.name || '');
    });
    setEmployees(all);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // ===== Export-Funktion =====
  const handleExport = async (idsToExport?: string[]) => {
    try {
      const toExport = idsToExport
        ? employees.filter(e => idsToExport.includes(e.id))
        : employees;
      if (toExport.length === 0) {
        Alert.alert('Keine Auswahl', 'Bitte mindestens einen Mitarbeiter auswählen.');
        return;
      }
      const payload = {
        type: 'aufmassprofi-employees',
        version: 1,
        exported_at: new Date().toISOString(),
        count: toExport.length,
        employees: toExport,
      };
      const json = JSON.stringify(payload, null, 2);
      const date = new Date().toISOString().slice(0, 10);
      const filename = toExport.length === 1
        ? `Mitarbeiter_${toExport[0].name.replace(/[^a-zA-Z0-9äöüÄÖÜß-]/g, '_')}_${date}.json`
        : `Mitarbeiter_${toExport.length}_${date}.json`;
      const fileUri = `${(FileSystem as any).cacheDirectory || (FileSystem as any).documentDirectory}${filename}`;
      await FileSystem.writeAsStringAsync(fileUri, json, { encoding: 'utf8' as any });

      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(fileUri, {
          mimeType: 'application/json',
          dialogTitle: `${toExport.length} Mitarbeiter exportieren`,
          UTI: 'public.json',
        });
        // Auswahl zurücksetzen
        setSelectionMode(false);
        setSelectedIds(new Set());
      } else {
        Alert.alert('Hinweis', `Export gespeichert unter:\n${fileUri}`);
      }
    } catch (e: any) {
      console.error('[Export] Failed', e);
      Alert.alert('Fehler', 'Export fehlgeschlagen: ' + (e?.message || 'Unbekannter Fehler'));
    }
  };

  // ===== Import-Funktion =====
  const importBusyRef = React.useRef(false);
  const handleImport = async () => {
    if (importBusyRef.current) return;
    importBusyRef.current = true;
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        // Android: content://-URI behalten (readTextFile kopiert selbst in den Cache);
        // das Picker-eigene Kopieren schlaegt in Expo Go an den Berechtigungen fehl
        copyToCacheDirectory: Platform.OS === "ios",
        multiple: false,
      });
      if (res.canceled || !res.assets || res.assets.length === 0) return;
      const fileUri = res.assets[0].uri;
      const content = await readTextFile(fileUri);
      let parsed: any;
      try { parsed = JSON.parse(content); } catch {
        Alert.alert('Fehler', 'Die Datei ist kein gültiges JSON.');
        return;
      }
      // Validierung
      const incoming: EmployeeMaster[] = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed?.employees)
        ? parsed.employees
        : [];
      if (incoming.length === 0) {
        Alert.alert('Fehler', 'Keine Mitarbeiter in der Datei gefunden.');
        return;
      }
      // Existierende Namen sammeln (für Duplikat-Check)
      const existing = await EmployeeMasterService.getAll();
      const existingNames = new Set(existing.map(e => e.name.toLowerCase().trim()));

      Alert.alert(
        'Mitarbeiter importieren',
        `${incoming.length} Mitarbeiter gefunden.\n\nMöchtest du sie hinzufügen? Duplikate (gleicher Name) werden übersprungen.`,
        [
          { text: 'Abbrechen', style: 'cancel' },
          {
            text: `${incoming.length} importieren`,
            onPress: async () => {
              let imported = 0;
              let skipped = 0;
              for (const emp of incoming) {
                if (!emp || !emp.name) { skipped++; continue; }
                if (existingNames.has(emp.name.toLowerCase().trim())) { skipped++; continue; }
                await EmployeeMasterService.create({
                  employee_number: emp.employee_number || '',
                  name: emp.name,
                  role: emp.role || '',
                  hourly_rate: emp.hourly_rate,
                  phone: emp.phone || '',
                  mobile: emp.mobile || '',
                  email: emp.email || '',
                  color: emp.color,
                  active: emp.active !== false,
                });
                imported++;
              }
              await load();
              Alert.alert(
                'Import abgeschlossen',
                `✓ ${imported} Mitarbeiter importiert\n${skipped > 0 ? `⚠ ${skipped} übersprungen (Duplikate)` : ''}`
              );
            },
          },
        ]
      );
    } catch (e: any) {
      console.error('[Import] Failed', e);
      Alert.alert('Fehler', 'Import fehlgeschlagen: ' + (e?.message || 'Unbekannter Fehler'));
    } finally {
      importBusyRef.current = false;
    }
  };

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelectedIds(next);
  };

  const openCreate = () => {
    setEditing(null);
    setForm({ ...EMPTY });
    setWageDrafts([]);
    setModalVisible(true);
    // Nummer automatisch vorschlagen (anpassbar)
    generateEmployeeNumber().then(num => {
      setForm(prev => ({ ...prev, employee_number: num }));
    }).catch(() => {});
  };

  const openEdit = (emp: EmployeeMaster) => {
    setEditing(emp);
    setForm({ ...emp });
    setWageDrafts((emp.wage_rates || []).map(w => ({ id: w.id, name: w.name, rateStr: String(w.rate).replace('.', ',') })));
    setModalVisible(true);
  };

  const handleSave = async () => {
    if (!form.name || !form.name.trim()) {
      Alert.alert('Hinweis', 'Bitte Namen eingeben.');
      return;
    }
    // Weitere Stundensätze aus den Drafts übernehmen (nur gültige Einträge)
    const wage_rates = wageDrafts
      .map(w => ({ id: w.id, name: w.name.trim(), rate: parseFloat(w.rateStr.replace(',', '.')) }))
      .filter(w => w.name && !isNaN(w.rate) && w.rate > 0);
    const payload = { ...form, wage_rates: wage_rates.length > 0 ? wage_rates : undefined };
    try {
      if (editing) {
        await EmployeeMasterService.update(editing.id, payload);
      } else {
        await EmployeeMasterService.create(payload as any);
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
          employees.map((emp) => {
            const isSelected = selectedIds.has(emp.id);
            return (
              <TouchableOpacity
                key={emp.id}
                style={[styles.empCard, selectionMode && isSelected && { borderColor: '#0891b2', borderWidth: 2, backgroundColor: '#ecfeff' }]}
                onPress={() => selectionMode ? toggleSelect(emp.id) : openEdit(emp)}
                onLongPress={() => {
                  if (!selectionMode) {
                    setSelectionMode(true);
                    setSelectedIds(new Set([emp.id]));
                  }
                }}
              >
                {selectionMode && (
                  <View style={[styles.checkboxSelect, isSelected && styles.checkboxSelected]}>
                    {isSelected && <Ionicons name="checkmark" size={16} color="#fff" />}
                  </View>
                )}
                <View style={[styles.avatar, !emp.active && { backgroundColor: '#e5e7eb' }]}>
                  <Text style={styles.avatarText}>{emp.name.charAt(0).toUpperCase()}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={[styles.empName, !emp.active && { color: '#9ca3af' }]}>
                      {emp.sort_order != null ? `${emp.sort_order}. ` : ''}{emp.name}
                    </Text>
                    {!emp.active && (
                      <View style={styles.inactiveBadge}><Text style={styles.inactiveText}>inaktiv</Text></View>
                    )}
                  </View>
                  {emp.role ? <Text style={styles.empRole}>{emp.role}</Text> : null}
                  <View style={{ flexDirection: 'row', gap: 10, marginTop: 2 }}>
                    {emp.employee_number ? (
                      <Text style={styles.empMeta}>#{emp.employee_number}</Text>
                    ) : null}
                    {emp.hourly_rate ? (
                      <Text style={styles.empMeta}>{emp.hourly_rate.toFixed(2)} €/Std</Text>
                    ) : null}
                    {emp.phone ? <Text style={styles.empMeta}>📞 {emp.phone}</Text> : null}
                    {emp.mobile ? <Text style={styles.empMeta}>📱 {emp.mobile}</Text> : null}
                  </View>
                </View>
                {!selectionMode && (
                  <>
                    <TouchableOpacity
                      onPress={() => handleExport([emp.id])}
                      style={[styles.delBtn, { marginRight: 4 }]}
                    >
                      <Ionicons name="share-outline" size={20} color="#0891b2" />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => handleDelete(emp)} style={styles.delBtn}>
                      <Ionicons name="trash-outline" size={20} color="#ef4444" />
                    </TouchableOpacity>
                  </>
                )}
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>

      {/* Floating Action Bar bei Selection-Mode */}
      {selectionMode && selectedIds.size > 0 && (
        <View style={[styles.fab, { bottom: Math.max(insets.bottom, 12) + 12 }]}>
          <TouchableOpacity
            style={styles.fabBtn}
            onPress={() => handleExport(Array.from(selectedIds))}
            activeOpacity={0.85}
          >
            <Ionicons name="share-outline" size={20} color="#fff" />
            <Text style={styles.fabBtnText}>
              {selectedIds.size} exportieren
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Aktions-Menü */}
      <Modal
        visible={menuVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuVisible(false)}
        onDismiss={() => {
          // Wird auf iOS aufgerufen, NACHDEM das Modal vollständig vom Bildschirm verschwunden ist.
          // Dies vermeidet Konflikte zwischen Modal & DocumentPicker bzw. anderen iOS-Sheets.
          const action = pendingAction;
          setPendingAction(null);
          if (action === 'export-all') {
            if (employees.length === 0) {
              Alert.alert('Hinweis', 'Keine Mitarbeiter zum Exportieren vorhanden.');
            } else {
              handleExport();
            }
          } else if (action === 'select-mode') {
            if (employees.length === 0) {
              Alert.alert('Hinweis', 'Keine Mitarbeiter zum Auswählen vorhanden.');
            } else {
              setSelectionMode(true);
              setSelectedIds(new Set());
            }
          } else if (action === 'import') {
            handleImport();
          }
        }}
      >
        <TouchableOpacity style={styles.menuOverlay} activeOpacity={1} onPress={() => setMenuVisible(false)}>
          <View style={[styles.menuCard, { marginTop: insets.top + 50 }]}>
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => {
                setPendingAction('export-all');
                setMenuVisible(false);
              }}
            >
              <Ionicons name="cloud-upload-outline" size={20} color="#0891b2" />
              <View style={{ flex: 1 }}>
                <Text style={styles.menuItemTitle}>Alle exportieren</Text>
                <Text style={styles.menuItemSub}>{employees.length} Mitarbeiter als JSON</Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => {
                setPendingAction('select-mode');
                setMenuVisible(false);
              }}
            >
              <Ionicons name="checkbox-outline" size={20} color="#0891b2" />
              <View style={{ flex: 1 }}>
                <Text style={styles.menuItemTitle}>Auswahl exportieren</Text>
                <Text style={styles.menuItemSub}>Einzelne Mitarbeiter auswählen</Text>
              </View>
            </TouchableOpacity>
            <View style={styles.menuDivider} />
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => {
                setPendingAction('import');
                setMenuVisible(false);
              }}
            >
              <Ionicons name="cloud-download-outline" size={20} color="#16a34a" />
              <View style={{ flex: 1 }}>
                <Text style={styles.menuItemTitle}>Importieren</Text>
                <Text style={styles.menuItemSub}>JSON-Datei auswählen</Text>
              </View>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Modal */}
      <Modal visible={modalVisible} animationType="slide" transparent onRequestClose={() => setModalVisible(false)}>
        <View style={[styles.modalOverlay, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 }]}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            keyboardVerticalOffset={insets.top + 8}
            style={{ width: '100%', maxWidth: 500, flexShrink: 1 }}
          >
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>{editing ? 'Mitarbeiter bearbeiten' : 'Neuer Mitarbeiter'}</Text>
                <TouchableOpacity onPress={() => setModalVisible(false)}>
                  <Ionicons name="close" size={26} color="#666" />
                </TouchableOpacity>
              </View>
              <ScrollView style={{ maxHeight: 500 }}>
                <Text style={styles.label}>Personal-Nr.</Text>
                <TextInput
                  style={styles.input}
                  value={form.employee_number || ''}
                  onChangeText={(v) => setForm({ ...form, employee_number: v })}
                  placeholder="z.B. MA-001"
                  autoCapitalize="characters"
                />

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

                <Text style={styles.label}>Reihenfolge (1 = zuerst)</Text>
                <TextInput
                  style={styles.input}
                  value={form.sort_order != null ? String(form.sort_order) : ''}
                  onChangeText={(v) => {
                    const num = parseInt(v.replace(/[^\d]/g, ''), 10);
                    setForm({ ...form, sort_order: isNaN(num) ? undefined : num });
                  }}
                  placeholder="z.B. 1 (Meister), 2 (Vorarbeiter), 3 ..."
                  keyboardType="number-pad"
                />

                <Text style={styles.label}>Stundenlohn Standard (€)</Text>
                <TextInput
                  style={styles.input}
                  value={form.hourly_rate != null ? String(form.hourly_rate) : ''}
                  onChangeText={(v) => setForm({ ...form, hourly_rate: v ? parseFloat(v) : undefined })}
                  placeholder="z.B. 45.00"
                  keyboardType="decimal-pad"
                />

                <Text style={styles.label}>Weitere Stundensätze (im Rapport auswählbar)</Text>
                {wageDrafts.map((w, wi) => (
                  <View key={w.id} style={{ flexDirection: 'row', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                    <TextInput
                      style={[styles.input, { flex: 1, marginBottom: 0 }]}
                      value={w.name}
                      onChangeText={(v) => setWageDrafts(prev => prev.map((x, i) => i === wi ? { ...x, name: v } : x))}
                      placeholder={`z.B. Satz ${wi + 2}`}
                    />
                    <TextInput
                      style={[styles.input, { width: 90, marginBottom: 0, textAlign: 'right' }]}
                      value={w.rateStr}
                      onChangeText={(v) => setWageDrafts(prev => prev.map((x, i) => i === wi ? { ...x, rateStr: v.replace(/[^0-9,.]/g, '') } : x))}
                      placeholder="€/h"
                      keyboardType="numbers-and-punctuation"
                    />
                    <TouchableOpacity
                      onPress={() => setWageDrafts(prev => prev.filter((_, i) => i !== wi))}
                      style={{ padding: 6 }}
                    >
                      <Ionicons name="trash-outline" size={18} color="#ef4444" />
                    </TouchableOpacity>
                  </View>
                ))}
                <TouchableOpacity
                  onPress={() => setWageDrafts(prev => [...prev, { id: `wr-${Date.now()}-${prev.length}`, name: '', rateStr: '' }])}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8 }}
                >
                  <Ionicons name="add-circle-outline" size={18} color="#1976d2" />
                  <Text style={{ color: '#1976d2', fontWeight: '700', fontSize: 13 }}>Stundensatz hinzufügen</Text>
                </TouchableOpacity>

                <Text style={styles.label}>Telefon</Text>
                <TextInput
                  style={styles.input}
                  value={form.phone || ''}
                  onChangeText={(v) => setForm({ ...form, phone: v })}
                  placeholder="Telefonnummer"
                  keyboardType="phone-pad"
                />

                <Text style={styles.label}>Handy</Text>
                <TextInput
                  style={styles.input}
                  value={form.mobile || ''}
                  onChangeText={(v) => setForm({ ...form, mobile: v })}
                  placeholder="Handynummer"
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
  checkboxSelect: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: '#94a3b8', alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff', marginRight: 6 },
  checkboxSelected: { backgroundColor: '#0891b2', borderColor: '#0891b2' },
  fab: { position: 'absolute', left: 16, right: 16, alignItems: 'center' },
  fabBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#0891b2', borderRadius: 28, paddingVertical: 14, paddingHorizontal: 22, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 6 },
  fabBtnText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  menuOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', alignItems: 'flex-end', paddingRight: 8 },
  menuCard: { backgroundColor: '#fff', borderRadius: 12, width: 260, paddingVertical: 6, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 8 },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12 },
  menuItemTitle: { fontSize: 14, fontWeight: '700', color: '#0f172a' },
  menuItemSub: { fontSize: 11, color: '#64748b', marginTop: 1 },
  menuDivider: { height: 1, backgroundColor: '#e2e8f0', marginVertical: 4 },
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

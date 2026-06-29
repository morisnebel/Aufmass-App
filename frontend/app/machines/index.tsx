import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  Alert, Modal, KeyboardAvoidingView, Platform, Switch, Image,
} from 'react-native';
import { useFocusEffect, useNavigation } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import { MachineMasterService, MachineMaster, SettingsService, MachineCategoryService, MachineCategory } from '../../services/LocalStorage';
import { DatePickerField } from '../../src/components/DatePickerField';

// =================== STATUS / CATEGORY OPTIONS ===================
const STATUS_OPTIONS: { value: NonNullable<MachineMaster['status']>; label: string; color: string; bg: string; icon: any }[] = [
  { value: 'verfuegbar', label: 'Verfügbar', color: '#16a34a', bg: '#dcfce7', icon: 'checkmark-circle' },
  { value: 'einsatz', label: 'Im Einsatz', color: '#2563eb', bg: '#dbeafe', icon: 'play-circle' },
  { value: 'wartung', label: 'In Wartung', color: '#d97706', bg: '#fef3c7', icon: 'construct' },
  { value: 'ausgeliehen', label: 'Ausgeliehen', color: '#7c3aed', bg: '#ede9fe', icon: 'swap-horizontal' },
  { value: 'nicht_verfuegbar', label: 'Nicht verfügbar', color: '#ef4444', bg: '#fee2e2', icon: 'close-circle' },
];

const CONDITION_OPTIONS: { value: NonNullable<MachineMaster['condition']>; label: string; color: string }[] = [
  { value: 'gut', label: 'Gut', color: '#16a34a' },
  { value: 'mittel', label: 'Mittel', color: '#d97706' },
  { value: 'schlecht', label: 'Schlecht', color: '#ef4444' },
];

const EQUIP_CATEGORIES: { value: NonNullable<MachineMaster['equipment_category']>; label: string; icon: any; color: string; bg: string }[] = [
  { value: 'fahrzeug', label: 'Fahrzeug', icon: 'car', color: '#2563eb', bg: '#dbeafe' },
  { value: 'maschine', label: 'Maschine', icon: 'cog', color: '#7c3aed', bg: '#ede9fe' },
  { value: 'werkzeug', label: 'Werkzeug', icon: 'hammer', color: '#d97706', bg: '#fef3c7' },
  { value: 'geruest', label: 'Gerüst', icon: 'grid', color: '#64748b', bg: '#e2e8f0' },
  { value: 'anhaenger', label: 'Anhänger', icon: 'cube', color: '#0891b2', bg: '#cffafe' },
  { value: 'container', label: 'Container', icon: 'archive', color: '#16a34a', bg: '#dcfce7' },
  { value: 'sicherheit', label: 'Sicherheit', icon: 'shield-checkmark', color: '#ea580c', bg: '#fed7aa' },
  { value: 'sonstiges', label: 'Sonstiges', icon: 'ellipsis-horizontal', color: '#475569', bg: '#f1f5f9' },
];

// Hilfsfunktionen für deutsche Zahlen-Eingabe (Komma statt Punkt)
const parseGermanNumber = (v: string): number => {
  if (!v) return 0;
  return parseFloat(v.replace(',', '.').replace(/[^\d.-]/g, '')) || 0;
};

const formatDate = (iso?: string): string => {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('de-DE');
  } catch { return iso; }
};

const isInspectionDue = (iso?: string, warnDays = 30): boolean => {
  if (!iso) return false;
  try {
    const due = new Date(iso).getTime();
    const now = Date.now();
    const diffDays = (due - now) / (1000 * 60 * 60 * 24);
    return diffDays <= warnDays;
  } catch { return false; }
};

const isInspectionOverdue = (iso?: string): boolean => {
  if (!iso) return false;
  try { return new Date(iso).getTime() < Date.now(); } catch { return false; }
};

// Wiederverwendete Logik für TÜV/Hauptuntersuchung
const isTuvDue = (iso?: string, warnDays: number = 30): boolean => {
  if (!iso) return false;
  try {
    const due = new Date(iso).getTime();
    const now = Date.now();
    const warnMs = warnDays * 24 * 60 * 60 * 1000;
    return !isNaN(due) && (due - now) <= warnMs;
  } catch { return false; }
};

const isTuvOverdue = (iso?: string): boolean => {
  if (!iso) return false;
  try { return new Date(iso).getTime() < Date.now(); } catch { return false; }
};

type TabKey = 'machines' | 'categories' | 'locations' | 'status';

const EMPTY: Partial<MachineMaster> = {
  name: '', equipment_category: 'maschine', manufacturer: '', model: '',
  serial_number: '', license_plate: '', storage_location: '',
  responsible_employee: '', condition: 'gut', status: 'verfuegbar',
  loan_to: '', loan_from_date: '', loan_until_date: '', loan_note: '',
  last_inspection_date: '', next_inspection_date: '',
  last_tuv_date: '', next_tuv_date: '',
  photos: [], category: '', note: '', active: true,
};

export default function MachinesIndex() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<MachineMaster[]>([]);
  const [tab, setTab] = useState<TabKey>('machines');
  const [modalVisible, setModalVisible] = useState(false);
  const [editing, setEditing] = useState<MachineMaster | null>(null);
  const [form, setForm] = useState<Partial<MachineMaster>>(EMPTY);
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [filterLocation, setFilterLocation] = useState<string>('');
  const [showFilterMenu, setShowFilterMenu] = useState<null | 'cat' | 'loc' | 'status'>(null);
  // Roh-Eingabe-Strings für Jahr (Komma-Bug-Prevention)
  const [yearStr, setYearStr] = useState<string>('');
  // Erinnerungs-Einstellungen (Tage Vorlauf für Warnungen)
  const [reminderDaysInspection, setReminderDaysInspection] = useState<number>(30);
  const [reminderDaysTuv, setReminderDaysTuv] = useState<number>(30);
  const [reminderModalVisible, setReminderModalVisible] = useState(false);
  const [reminderInspectionStr, setReminderInspectionStr] = useState<string>('30');
  const [reminderTuvStr, setReminderTuvStr] = useState<string>('30');
  // Gespeicherte Kategorien (eigene Bezeichnungen)
  const [savedCategories, setSavedCategories] = useState<MachineCategory[]>([]);
  // ===== Export-Auswahl-Modus =====
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [menuVisible, setMenuVisible] = useState(false);
  const [pendingAction, setPendingAction] = useState<null | 'export-all' | 'select-mode' | 'import'>(null);

  // Settings laden
  React.useEffect(() => {
    SettingsService.get().then(s => {
      if (s.reminder_days_inspection != null) setReminderDaysInspection(s.reminder_days_inspection);
      if (s.reminder_days_tuv != null) setReminderDaysTuv(s.reminder_days_tuv);
    }).catch(() => { /* silent */ });
  }, []);

  React.useEffect(() => {
    navigation.setOptions({
      title: selectionMode ? `${selectedIds.size} ausgewählt` : 'Maschinen & Geräte',
      headerStyle: { backgroundColor: selectionMode ? '#0891b2' : '#1976d2' },
      headerTintColor: '#fff',
      headerRight: () => (
        <View style={{ flexDirection: 'row', gap: 4, paddingRight: 8, alignItems: 'center' }}>
          {selectionMode ? (
            <>
              <TouchableOpacity
                onPress={() => {
                  if (selectedIds.size === items.length) setSelectedIds(new Set());
                  else setSelectedIds(new Set(items.map(i => i.id)));
                }}
                style={{ paddingHorizontal: 8, paddingVertical: 4 }}
              >
                <Text style={{ color: '#0f172a', fontSize: 13, fontWeight: '700' }}>
                  {selectedIds.size === items.length ? 'Keine' : 'Alle'}
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
            <>
              <TouchableOpacity
                onPress={() => {
                  setReminderInspectionStr(String(reminderDaysInspection));
                  setReminderTuvStr(String(reminderDaysTuv));
                  setReminderModalVisible(true);
                }}
                style={{ paddingHorizontal: 8, paddingVertical: 4 }}
              >
                <Ionicons name="notifications-outline" size={22} color="#0f172a" />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setMenuVisible(true)} style={{ paddingHorizontal: 8, paddingVertical: 4 }}>
                <Ionicons name="ellipsis-vertical" size={22} color="#0f172a" />
              </TouchableOpacity>
            </>
          )}
        </View>
      ),
    });
  }, [navigation, reminderDaysInspection, reminderDaysTuv, selectionMode, selectedIds, items]);

  const load = useCallback(async () => {
    const all = await MachineMasterService.getAll();
    setItems(all);
    const cats = await MachineCategoryService.getAll();
    setSavedCategories(cats);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // ===== Metrics =====
  const metrics = useMemo(() => {
    const cats = new Set<string>();
    const locs = new Set<string>();
    let loaned = 0;
    let inspectionDue = 0;
    let inspectionOverdue = 0;
    let tuvDue = 0;
    let tuvOverdue = 0;
    items.forEach(m => {
      if (m.category) cats.add(m.category);
      if (m.storage_location) locs.add(m.storage_location);
      if (m.status === 'ausgeliehen') loaned += 1;
      if (isInspectionOverdue(m.next_inspection_date)) inspectionOverdue += 1;
      else if (isInspectionDue(m.next_inspection_date, reminderDaysInspection)) inspectionDue += 1;
      if (isTuvOverdue(m.next_tuv_date)) tuvOverdue += 1;
      else if (isTuvDue(m.next_tuv_date, reminderDaysTuv)) tuvDue += 1;
    });
    return {
      totalCount: items.length,
      categoryCount: cats.size,
      locationCount: locs.size,
      loanedCount: loaned,
      inspectionDueCount: inspectionDue + inspectionOverdue,
      inspectionOverdueCount: inspectionOverdue,
      tuvDueCount: tuvDue + tuvOverdue,
      tuvOverdueCount: tuvOverdue,
      categories: Array.from(cats).sort(),
      locations: Array.from(locs).sort(),
    };
  }, [items, reminderDaysInspection, reminderDaysTuv]);

  // Aggregierte Listen für Tabs
  const categoriesAgg = useMemo(() => {
    const map: Record<string, number> = {};
    items.forEach(m => {
      const k = m.category || (m.equipment_category ? EQUIP_CATEGORIES.find(c => c.value === m.equipment_category)?.label || '— ohne —' : '— ohne —');
      map[k] = (map[k] || 0) + 1;
    });
    return Object.entries(map).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
  }, [items]);

  const locationsAgg = useMemo(() => {
    const map: Record<string, number> = {};
    items.forEach(m => {
      const k = m.storage_location || '— ohne —';
      map[k] = (map[k] || 0) + 1;
    });
    return Object.entries(map).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
  }, [items]);

  const statusAgg = useMemo(() => {
    const map: Record<string, number> = {};
    items.forEach(m => {
      const k = m.status || 'verfuegbar';
      map[k] = (map[k] || 0) + 1;
    });
    return STATUS_OPTIONS.map(s => ({ ...s, count: map[s.value] || 0 }));
  }, [items]);

  // Filtered list
  const filtered = useMemo(() => {
    return items.filter(m => {
      if (filterCategory && m.category !== filterCategory) return false;
      if (filterLocation && m.storage_location !== filterLocation) return false;
      if (filterStatus && m.status !== filterStatus) return false;
      if (!search.trim()) return true;
      const s = search.toLowerCase();
      return (
        m.name.toLowerCase().includes(s) ||
        (m.category || '').toLowerCase().includes(s) ||
        (m.manufacturer || '').toLowerCase().includes(s) ||
        (m.model || '').toLowerCase().includes(s) ||
        (m.serial_number || '').toLowerCase().includes(s) ||
        (m.license_plate || '').toLowerCase().includes(s)
      );
    });
  }, [items, search, filterCategory, filterLocation, filterStatus]);

  const openCreate = () => {
    setEditing(null);
    setForm({ ...EMPTY });
    setYearStr('');
    setModalVisible(true);
  };
  const openEdit = (m: MachineMaster) => {
    setEditing(m);
    setForm({ ...m });
    setYearStr(m.year ? String(m.year) : '');
    setModalVisible(true);
  };

  const handlePickPhoto = async (source: 'camera' | 'library') => {
    try {
      const perm = source === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Berechtigung', source === 'camera' ? 'Kamera-Zugriff erforderlich.' : 'Galerie-Zugriff erforderlich.');
        return;
      }
      const result = source === 'camera'
        ? await ImagePicker.launchCameraAsync({ quality: 0.5, base64: true, allowsEditing: true })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'] as any, quality: 0.5, base64: true, allowsEditing: true });
      if (result.canceled) return;
      const a = ((result as any).assets || [])[0];
      if (a?.base64) {
        const newUri = `data:image/jpeg;base64,${a.base64}`;
        const existing = form.photos || [];
        setForm({ ...form, photos: [...existing, newUri] });
      }
    } catch (e) { console.error(e); }
  };

  const removePhoto = (idx: number) => {
    const photos = (form.photos || []).filter((_, i) => i !== idx);
    setForm({ ...form, photos });
  };

  const handleSave = async () => {
    if (!form.name || !form.name.trim()) {
      Alert.alert('Hinweis', 'Bitte Bezeichnung eingeben.');
      return;
    }
    try {
      const dataToSave: any = { ...form };
      if (yearStr) {
        const yNum = parseInt(yearStr.replace(/[^\d]/g, ''), 10);
        dataToSave.year = isNaN(yNum) ? undefined : yNum;
      } else {
        dataToSave.year = undefined;
      }
      if (editing) {
        await MachineMasterService.update(editing.id, dataToSave);
      } else {
        await MachineMasterService.create(dataToSave);
      }
      // Wenn Kategorie eingegeben wurde, diese auch in der Kategorien-Liste sichern
      if (dataToSave.category && typeof dataToSave.category === 'string' && dataToSave.category.trim()) {
        await MachineCategoryService.add(dataToSave.category.trim());
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

  const handleDuplicate = async (m: MachineMaster) => {
    try {
      const { id, created_at, updated_at, ...rest } = m as any;
      const newName = `${m.name} (Kopie)`;
      // Bei Kopien: Status auf Verfügbar zurücksetzen, Inventar-/Seriennummer leeren
      const copy = {
        ...rest,
        name: newName,
        status: 'available',
        rented_to: '',
        rented_from_date: '',
        rented_until_date: '',
        rental_note: '',
        serial_number: '',
      };
      await MachineMasterService.create(copy);
      await load();
      Alert.alert('Kopiert', `"${newName}" wurde erstellt.\nStatus und Seriennummer wurden zurückgesetzt.`);
    } catch (e) {
      console.error(e);
      Alert.alert('Fehler', 'Kopieren fehlgeschlagen.');
    }
  };

  // ===== Export-Funktion =====
  const handleExport = async (idsToExport?: string[]) => {
    try {
      const toExport = idsToExport
        ? items.filter(m => idsToExport.includes(m.id))
        : items;
      if (toExport.length === 0) {
        Alert.alert('Keine Auswahl', 'Bitte mindestens eine Maschine auswählen.');
        return;
      }
      const payload = {
        type: 'aufmassprofi-machines',
        version: 1,
        exported_at: new Date().toISOString(),
        count: toExport.length,
        machines: toExport,
      };
      const json = JSON.stringify(payload, null, 2);
      const date = new Date().toISOString().slice(0, 10);
      const filename = toExport.length === 1
        ? `Maschine_${toExport[0].name.replace(/[^a-zA-Z0-9äöüÄÖÜß-]/g, '_')}_${date}.json`
        : `Maschinen_${toExport.length}_${date}.json`;
      const fileUri = `${(FileSystem as any).cacheDirectory || (FileSystem as any).documentDirectory}${filename}`;
      await FileSystem.writeAsStringAsync(fileUri, json, { encoding: 'utf8' as any });
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(fileUri, {
          mimeType: 'application/json',
          dialogTitle: `${toExport.length} Maschine(n) exportieren`,
          UTI: 'public.json',
        });
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
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (res.canceled || !res.assets || res.assets.length === 0) return;
      const fileUri = res.assets[0].uri;
      const content = await FileSystem.readAsStringAsync(fileUri, { encoding: 'utf8' as any });
      let parsed: any;
      try { parsed = JSON.parse(content); } catch {
        Alert.alert('Fehler', 'Die Datei ist kein gültiges JSON.');
        return;
      }
      const incoming: MachineMaster[] = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed?.machines)
        ? parsed.machines
        : [];
      if (incoming.length === 0) {
        Alert.alert('Fehler', 'Keine Maschinen in der Datei gefunden.');
        return;
      }
      const existing = await MachineMasterService.getAll();
      const existingNames = new Set(existing.map(m => m.name.toLowerCase().trim()));
      Alert.alert(
        'Maschinen importieren',
        `${incoming.length} Maschine(n) gefunden.\n\nMöchtest du sie hinzufügen? Duplikate (gleicher Name) werden übersprungen.`,
        [
          { text: 'Abbrechen', style: 'cancel' },
          {
            text: `${incoming.length} importieren`,
            onPress: async () => {
              let imported = 0;
              let skipped = 0;
              for (const mac of incoming) {
                if (!mac || !mac.name) { skipped++; continue; }
                if (existingNames.has(mac.name.toLowerCase().trim())) { skipped++; continue; }
                const { id, created_at, updated_at, ...rest } = mac as any;
                await MachineMasterService.create(rest);
                imported++;
              }
              await load();
              Alert.alert(
                'Import abgeschlossen',
                `✓ ${imported} Maschine(n) importiert\n${skipped > 0 ? `⚠ ${skipped} übersprungen (Duplikate)` : ''}`
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

  // ===== Kategorie-Verwaltung =====
  const deleteCategory = (name: string) => {
    const inUse = items.filter(m => (m.category || '').toLowerCase() === name.toLowerCase()).length;
    const msg = inUse > 0
      ? `Kategorie "${name}" wird derzeit von ${inUse} Maschine(n) verwendet. Trotzdem löschen?\n\n(Die Maschinen bleiben erhalten – nur der Vorschlag verschwindet.)`
      : `Kategorie "${name}" wirklich löschen?`;
    Alert.alert('Kategorie löschen?', msg, [
      { text: 'Abbrechen', style: 'cancel' },
      {
        text: 'Löschen',
        style: 'destructive',
        onPress: async () => {
          await MachineCategoryService.deleteByName(name);
          const cats = await MachineCategoryService.getAll();
          setSavedCategories(cats);
          // Wenn die Kategorie im Formular ausgewählt war, ebenfalls leeren
          if ((form.category || '').toLowerCase() === name.toLowerCase()) {
            setForm(f => ({ ...f, category: '' }));
          }
        },
      },
    ]);
  };

  // Quick-Status ändern (Card)
  const quickToggleStatus = async (m: MachineMaster) => {
    const cur = STATUS_OPTIONS.findIndex(s => s.value === (m.status || 'verfuegbar'));
    const next = STATUS_OPTIONS[(cur + 1) % STATUS_OPTIONS.length];
    await MachineMasterService.update(m.id, { status: next.value });
    await load();
  };

  // Suggest-Listen
  const manufacturers = useMemo(() => {
    const set = new Set<string>();
    items.forEach(m => { if (m.manufacturer) set.add(m.manufacturer); });
    return Array.from(set).sort();
  }, [items]);

  const responsibles = useMemo(() => {
    const set = new Set<string>();
    items.forEach(m => { if (m.responsible_employee) set.add(m.responsible_employee); });
    return Array.from(set).sort();
  }, [items]);

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView style={styles.scroll} contentContainerStyle={{ paddingBottom: 80 }}>
        {/* ===== Metrics ===== */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.metricsRow}>
          <MetricCard icon="construct" color="#1976d2" bg="#dbeafe" label="Gesamt" value={metrics.totalCount} sub="Geräte" />
          <MetricCard icon="swap-horizontal" color="#7c3aed" bg="#ede9fe" label="Ausgeliehen" value={metrics.loanedCount} sub="" highlight={metrics.loanedCount > 0} highlightColor="#7c3aed" />
          <MetricCard icon="alert-circle" color="#ea580c" bg="#fed7aa" label="Inspektion" value={metrics.inspectionDueCount} sub={metrics.inspectionOverdueCount > 0 ? `${metrics.inspectionOverdueCount} überfällig` : 'fällig'} highlight={metrics.inspectionOverdueCount > 0} highlightColor="#ef4444" />
          <MetricCard icon="car-sport" color="#dc2626" bg="#fee2e2" label="TÜV" value={metrics.tuvDueCount} sub={metrics.tuvOverdueCount > 0 ? `${metrics.tuvOverdueCount} überfällig` : 'fällig'} highlight={metrics.tuvOverdueCount > 0} highlightColor="#dc2626" />
          <MetricCard icon="location" color="#16a34a" bg="#dcfce7" label="Standorte" value={metrics.locationCount} sub="" />
        </ScrollView>

        {/* ===== Tabs ===== */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabsScroll} contentContainerStyle={styles.tabsRow}>
          {([
            { key: 'machines', label: 'Geräte', icon: 'construct-outline' },
            { key: 'status', label: 'Status', icon: 'pulse-outline' },
            { key: 'categories', label: 'Kategorien', icon: 'pricetag-outline' },
            { key: 'locations', label: 'Standorte', icon: 'location-outline' },
          ] as { key: TabKey; label: string; icon: any }[]).map(t => (
            <TouchableOpacity
              key={t.key}
              style={[styles.tab, tab === t.key && styles.tabActive]}
              onPress={() => setTab(t.key)}
            >
              <Ionicons name={t.icon} size={15} color={tab === t.key ? '#fff' : '#475569'} />
              <Text style={[styles.tabText, tab === t.key && styles.tabTextActive]}>{t.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* ===== Machines Tab ===== */}
        {tab === 'machines' && (
          <View style={{ paddingHorizontal: 12 }}>
            <TouchableOpacity style={styles.addButton} onPress={openCreate}>
              <Ionicons name="add-circle" size={20} color="#fff" />
              <Text style={styles.addButtonText}>Maschine / Gerät hinzufügen</Text>
            </TouchableOpacity>

            {/* Search */}
            <View style={styles.searchRow}>
              <View style={styles.searchBox}>
                <Ionicons name="search" size={16} color="#94a3b8" />
                <TextInput style={styles.searchInput} value={search} onChangeText={setSearch} placeholder="Maschine suchen..." />
                {search ? <TouchableOpacity onPress={() => setSearch('')}><Ionicons name="close-circle" size={16} color="#94a3b8" /></TouchableOpacity> : null}
              </View>
            </View>
            {/* Filter Chips */}
            <View style={styles.filterRow}>
              <TouchableOpacity style={[styles.filterChip, filterStatus && styles.filterChipActive]} onPress={() => setShowFilterMenu('status')}>
                <Text style={[styles.filterChipText, filterStatus && { color: '#fff' }]}>{filterStatus ? STATUS_OPTIONS.find(s => s.value === filterStatus)?.label : 'Status ▼'}</Text>
                {filterStatus ? <TouchableOpacity onPress={() => setFilterStatus('')}><Ionicons name="close" size={14} color="#fff" /></TouchableOpacity> : null}
              </TouchableOpacity>
              <TouchableOpacity style={[styles.filterChip, filterCategory && styles.filterChipActive]} onPress={() => setShowFilterMenu('cat')}>
                <Text style={[styles.filterChipText, filterCategory && { color: '#fff' }]}>{filterCategory || 'Kategorie ▼'}</Text>
                {filterCategory ? <TouchableOpacity onPress={() => setFilterCategory('')}><Ionicons name="close" size={14} color="#fff" /></TouchableOpacity> : null}
              </TouchableOpacity>
              <TouchableOpacity style={[styles.filterChip, filterLocation && styles.filterChipActive]} onPress={() => setShowFilterMenu('loc')}>
                <Text style={[styles.filterChipText, filterLocation && { color: '#fff' }]}>{filterLocation || 'Standort ▼'}</Text>
                {filterLocation ? <TouchableOpacity onPress={() => setFilterLocation('')}><Ionicons name="close" size={14} color="#fff" /></TouchableOpacity> : null}
              </TouchableOpacity>
            </View>

            {/* Machine List */}
            {filtered.length === 0 ? (
              <View style={styles.empty}>
                <Ionicons name="construct-outline" size={48} color="#cbd5e1" />
                <Text style={styles.emptyText}>{items.length === 0 ? 'Keine Maschinen angelegt' : 'Keine Treffer'}</Text>
                {items.length === 0 && (
                  <Text style={styles.emptySub}>Lege deine Maschinen, Werkzeuge und Fahrzeuge an – im Rapport schnell auswählbar.</Text>
                )}
              </View>
            ) : (
              filtered.map(m => {
                const st = STATUS_OPTIONS.find(s => s.value === (m.status || 'verfuegbar'))!;
                const overdue = isInspectionOverdue(m.next_inspection_date);
                const dueSoon = !overdue && isInspectionDue(m.next_inspection_date, reminderDaysInspection);
                const tuvOverdue = isTuvOverdue(m.next_tuv_date);
                const tuvDueSoon = !tuvOverdue && isTuvDue(m.next_tuv_date, reminderDaysTuv);
                const cat = EQUIP_CATEGORIES.find(c => c.value === m.equipment_category);
                const firstPhoto = m.photos && m.photos.length > 0 ? m.photos[0] : null;
                const isSelected = selectedIds.has(m.id);
                return (
                  <TouchableOpacity
                    key={m.id}
                    style={[styles.matCard, isSelected && { borderColor: '#0891b2', borderWidth: 2, backgroundColor: '#ecfeff' }]}
                    onPress={() => { if (selectionMode) toggleSelect(m.id); else openEdit(m); }}
                  >
                    {selectionMode && (
                      <View style={{ marginRight: 6 }}>
                        <Ionicons name={isSelected ? 'checkbox' : 'square-outline'} size={24} color={isSelected ? '#0891b2' : '#94a3b8'} />
                      </View>
                    )}
                    {firstPhoto ? (
                      <Image source={{ uri: firstPhoto }} style={styles.matPhoto} />
                    ) : (
                      <View style={[styles.matPhotoPlaceholder, { backgroundColor: cat?.bg || '#ede9fe' }]}>
                        <Ionicons name={cat?.icon || 'construct'} size={22} color={cat?.color || '#7c3aed'} />
                      </View>
                    )}
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={[styles.matName, !m.active && { color: '#9ca3af' }]} numberOfLines={1}>{m.name}</Text>
                        {!m.active && <View style={styles.inactiveBadge}><Text style={styles.inactiveText}>inaktiv</Text></View>}
                      </View>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 3 }}>
                        {m.manufacturer || m.model ? (
                          <Text style={styles.matMetaSub}>{[m.manufacturer, m.model].filter(Boolean).join(' ')}</Text>
                        ) : null}
                      </View>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 3 }}>
                        {m.license_plate ? <Text style={styles.matMetaTag}>🚘 {m.license_plate}</Text> : null}
                        {m.serial_number ? <Text style={styles.matMetaTag}>📋 {m.serial_number}</Text> : null}
                        {m.storage_location ? <Text style={styles.matMetaTag}>📍 {m.storage_location}</Text> : null}
                      </View>
                      {m.status === 'ausgeliehen' && m.loan_to ? (
                        <Text style={styles.loanInfo} numberOfLines={1}>
                          ↗ {m.loan_to}{m.loan_until_date ? ` · bis ${formatDate(m.loan_until_date)}` : ''}
                        </Text>
                      ) : null}
                      {m.next_inspection_date ? (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 }}>
                          <Ionicons name={overdue ? 'warning' : dueSoon ? 'time' : 'shield-checkmark'} size={11} color={overdue ? '#ef4444' : dueSoon ? '#ea580c' : '#16a34a'} />
                          <Text style={[styles.matMetaSub, { color: overdue ? '#ef4444' : dueSoon ? '#ea580c' : '#475569', fontWeight: overdue ? '700' : '500' }]}>
                            {overdue ? 'Insp. überfällig' : 'Insp.'} {formatDate(m.next_inspection_date)}
                          </Text>
                        </View>
                      ) : null}
                      {m.next_tuv_date ? (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 }}>
                          <Ionicons name={tuvOverdue ? 'warning' : tuvDueSoon ? 'time' : 'car-sport'} size={11} color={tuvOverdue ? '#dc2626' : tuvDueSoon ? '#ea580c' : '#16a34a'} />
                          <Text style={[styles.matMetaSub, { color: tuvOverdue ? '#dc2626' : tuvDueSoon ? '#ea580c' : '#475569', fontWeight: tuvOverdue ? '700' : '500' }]}>
                            {tuvOverdue ? 'TÜV überfällig' : 'TÜV'} {formatDate(m.next_tuv_date)}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                    <View style={{ alignItems: 'flex-end', gap: 4 }}>
                      <TouchableOpacity onPress={(e) => { e.stopPropagation?.(); quickToggleStatus(m); }} style={[styles.statusBadge, { backgroundColor: st.bg }]}>
                        <Ionicons name={st.icon} size={11} color={st.color} />
                        <Text style={[styles.statusBadgeText, { color: st.color }]}>{st.label}</Text>
                      </TouchableOpacity>
                      {!selectionMode && (
                        <View style={{ flexDirection: 'row', gap: 2 }}>
                          <TouchableOpacity onPress={(e) => { e.stopPropagation?.(); handleExport([m.id]); }} style={styles.delBtn}>
                            <Ionicons name="share-outline" size={18} color="#0891b2" />
                          </TouchableOpacity>
                          <TouchableOpacity onPress={(e) => { e.stopPropagation?.(); handleDuplicate(m); }} style={styles.delBtn}>
                            <Ionicons name="copy-outline" size={18} color="#1976d2" />
                          </TouchableOpacity>
                          <TouchableOpacity onPress={() => handleDelete(m)} style={styles.delBtn}>
                            <Ionicons name="trash-outline" size={18} color="#ef4444" />
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                  </TouchableOpacity>
                );
              })
            )}
          </View>
        )}

        {/* ===== Status Tab ===== */}
        {tab === 'status' && (
          <View style={{ paddingHorizontal: 12 }}>
            <Text style={styles.aggHint}>Tippe auf einen Status, um Maschinen zu filtern.</Text>
            {statusAgg.map(s => (
              <TouchableOpacity key={s.value} style={styles.aggCard} onPress={() => { setFilterStatus(s.value); setTab('machines'); }}>
                <View style={[styles.aggIcon, { backgroundColor: s.bg }]}><Ionicons name={s.icon} size={20} color={s.color} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.aggName}>{s.label}</Text>
                  <Text style={styles.aggCount}>{s.count} {s.count === 1 ? 'Maschine' : 'Maschinen'}</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color="#cbd5e1" />
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* ===== Kategorien Tab ===== */}
        {tab === 'categories' && (
          <View style={{ paddingHorizontal: 12 }}>
            <Text style={styles.aggHint}>Tippe auf eine Kategorie, um zu filtern.</Text>
            {categoriesAgg.length === 0 ? (
              <Text style={styles.empty}>Noch keine Kategorien vorhanden.</Text>
            ) : categoriesAgg.map(c => (
              <TouchableOpacity key={c.name} style={styles.aggCard} onPress={() => { setFilterCategory(c.name === '— ohne —' ? '' : c.name); setTab('machines'); }}>
                <View style={[styles.aggIcon, { backgroundColor: '#dcfce7' }]}><Ionicons name="pricetag" size={20} color="#16a34a" /></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.aggName}>{c.name}</Text>
                  <Text style={styles.aggCount}>{c.count} {c.count === 1 ? 'Maschine' : 'Maschinen'}</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color="#cbd5e1" />
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* ===== Standorte Tab ===== */}
        {tab === 'locations' && (
          <View style={{ paddingHorizontal: 12 }}>
            <Text style={styles.aggHint}>Tippe auf einen Standort, um zu filtern.</Text>
            {locationsAgg.length === 0 ? (
              <Text style={styles.empty}>Noch keine Standorte vorhanden.</Text>
            ) : locationsAgg.map(c => (
              <TouchableOpacity key={c.name} style={styles.aggCard} onPress={() => { setFilterLocation(c.name === '— ohne —' ? '' : c.name); setTab('machines'); }}>
                <View style={[styles.aggIcon, { backgroundColor: '#ede9fe' }]}><Ionicons name="location" size={20} color="#7c3aed" /></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.aggName}>{c.name}</Text>
                  <Text style={styles.aggCount}>{c.count} {c.count === 1 ? 'Maschine' : 'Maschinen'}</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color="#cbd5e1" />
              </TouchableOpacity>
            ))}
          </View>
        )}
      </ScrollView>

      {/* ===== Filter Menu Modal ===== */}
      <Modal visible={!!showFilterMenu} transparent animationType="fade" onRequestClose={() => setShowFilterMenu(null)}>
        <TouchableOpacity style={styles.filterOverlay} onPress={() => setShowFilterMenu(null)} activeOpacity={1}>
          <View style={styles.filterSheet}>
            <Text style={styles.modalTitle}>
              {showFilterMenu === 'cat' ? 'Kategorie wählen' : showFilterMenu === 'loc' ? 'Standort wählen' : 'Status wählen'}
            </Text>
            <ScrollView style={{ maxHeight: 360 }}>
              <TouchableOpacity style={styles.filterOpt} onPress={() => {
                if (showFilterMenu === 'cat') setFilterCategory('');
                else if (showFilterMenu === 'loc') setFilterLocation('');
                else setFilterStatus('');
                setShowFilterMenu(null);
              }}>
                <Text style={styles.filterOptText}>Alle anzeigen</Text>
              </TouchableOpacity>
              {showFilterMenu === 'status'
                ? STATUS_OPTIONS.map(s => (
                  <TouchableOpacity key={s.value} style={styles.filterOpt} onPress={() => { setFilterStatus(s.value); setShowFilterMenu(null); }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Ionicons name={s.icon} size={16} color={s.color} />
                      <Text style={styles.filterOptText}>{s.label}</Text>
                    </View>
                  </TouchableOpacity>
                ))
                : (showFilterMenu === 'cat' ? metrics.categories : metrics.locations).map(c => (
                  <TouchableOpacity key={c} style={styles.filterOpt} onPress={() => {
                    if (showFilterMenu === 'cat') setFilterCategory(c); else setFilterLocation(c);
                    setShowFilterMenu(null);
                  }}>
                    <Text style={styles.filterOptText}>{c}</Text>
                  </TouchableOpacity>
                ))}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ===== Edit Modal ===== */}
      <Modal visible={modalVisible} animationType="slide" transparent onRequestClose={() => setModalVisible(false)}>
        <View style={[styles.modalOverlay, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 }]}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            keyboardVerticalOffset={insets.top + 8}
            style={{ width: '100%', maxWidth: 500, flexShrink: 1 }}
          >
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>{editing ? 'Maschine bearbeiten' : 'Neue Maschine / Gerät'}</Text>
                <TouchableOpacity onPress={() => setModalVisible(false)}><Ionicons name="close" size={26} color="#666" /></TouchableOpacity>
              </View>
              <ScrollView style={{ maxHeight: 580 }} keyboardShouldPersistTaps="handled">

                {/* Photos */}
                <Text style={styles.label}>Fotos</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 6 }} contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>
                  {(form.photos || []).map((p, i) => (
                    <View key={i} style={styles.photoPreview}>
                      <Image source={{ uri: p }} style={styles.photoPreviewImg} />
                      <TouchableOpacity style={styles.photoRemove} onPress={() => removePhoto(i)}>
                        <Ionicons name="close-circle" size={22} color="#fff" />
                      </TouchableOpacity>
                    </View>
                  ))}
                  <TouchableOpacity style={styles.photoAddTile} onPress={() => handlePickPhoto('camera')}>
                    <Ionicons name="camera" size={22} color="#1976d2" />
                    <Text style={styles.photoAddText}>Foto</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.photoAddTile} onPress={() => handlePickPhoto('library')}>
                    <Ionicons name="images" size={22} color="#1976d2" />
                    <Text style={styles.photoAddText}>Galerie</Text>
                  </TouchableOpacity>
                </ScrollView>

                <Text style={styles.label}>Bezeichnung *</Text>
                <TextInput style={styles.input} value={form.name || ''} onChangeText={(v) => setForm({ ...form, name: v })} placeholder="z.B. Liebherr Kran 132 EC-H" />

                {/* Status */}
                <Text style={styles.label}>Status</Text>
                <View style={styles.chipRow}>
                  {STATUS_OPTIONS.map(s => (
                    <TouchableOpacity
                      key={s.value}
                      style={[
                        styles.statusChip,
                        { backgroundColor: form.status === s.value ? s.color : s.bg },
                      ]}
                      onPress={() => setForm({ ...form, status: s.value })}
                    >
                      <Ionicons name={s.icon} size={13} color={form.status === s.value ? '#fff' : s.color} />
                      <Text style={[styles.statusChipText, { color: form.status === s.value ? '#fff' : s.color }]}>{s.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* Ausleih-Felder nur bei Status = ausgeliehen */}
                {form.status === 'ausgeliehen' && (
                  <View style={styles.loanBox}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                      <Ionicons name="swap-horizontal" size={16} color="#7c3aed" />
                      <Text style={{ fontWeight: '700', color: '#7c3aed', fontSize: 13 }}>Ausleihe-Details</Text>
                    </View>
                    <Text style={styles.label}>Ausgeliehen an</Text>
                    <TextInput style={styles.input} value={form.loan_to || ''} onChangeText={(v) => setForm({ ...form, loan_to: v })} placeholder="Name / Firma" />
                    <View style={{ flexDirection: 'row', gap: 10 }}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.label}>Ausleihdatum</Text>
                        <DatePickerField
                          value={form.loan_from_date}
                          onChange={(v) => setForm({ ...form, loan_from_date: v })}
                          placeholder="Datum wählen"
                          accent="#7c3aed"
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.label}>Rückgabe geplant</Text>
                        <DatePickerField
                          value={form.loan_until_date}
                          onChange={(v) => setForm({ ...form, loan_until_date: v })}
                          placeholder="Datum wählen"
                          accent="#7c3aed"
                          minimumDate={form.loan_from_date ? new Date(form.loan_from_date) : undefined}
                        />
                      </View>
                    </View>
                    <Text style={styles.label}>Notiz zur Ausleihe</Text>
                    <TextInput style={styles.input} value={form.loan_note || ''} onChangeText={(v) => setForm({ ...form, loan_note: v })} placeholder="z.B. Kaution, Zustand bei Übergabe..." />
                  </View>
                )}

                {/* Kategorie (Equipment-Typ + eigene Kategorien zusammengeführt) */}
                <Text style={styles.label}>Kategorie</Text>
                <View style={styles.chipRow}>
                  {EQUIP_CATEGORIES.map(c => {
                    const isActive = form.equipment_category === c.value && (form.category || '').toLowerCase() === c.label.toLowerCase();
                    return (
                      <TouchableOpacity
                        key={c.value}
                        style={[styles.chip, isActive && { backgroundColor: c.color }]}
                        onPress={() => setForm({ ...form, equipment_category: c.value, category: c.label })}
                      >
                        <Ionicons name={c.icon} size={12} color={isActive ? '#fff' : '#475569'} />
                        <Text style={[styles.chipText, isActive && styles.chipTextActive, { marginLeft: 4 }]}>{c.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* Eigene gespeicherte Kategorien (löschbar) */}
                {(() => {
                  // Eigene Kategorien: gespeicherte + aus Maschinen abgeleitete, ohne die 8 Standard-Kategorien
                  const builtinNames = new Set(EQUIP_CATEGORIES.map(c => c.label.toLowerCase()));
                  const seen = new Map<string, string>();
                  savedCategories.forEach(c => { if (!builtinNames.has(c.name.toLowerCase())) seen.set(c.name.toLowerCase(), c.name); });
                  metrics.categories.forEach(c => { if (!builtinNames.has(c.toLowerCase()) && !seen.has(c.toLowerCase())) seen.set(c.toLowerCase(), c); });
                  const customCats = Array.from(seen.values()).sort((a, b) => a.localeCompare(b, 'de'));
                  if (customCats.length === 0) return null;
                  return (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.suggestRow} contentContainerStyle={styles.suggestRowContent}>
                      {customCats.map(c => {
                        const isActive = (form.category || '').toLowerCase() === c.toLowerCase();
                        return (
                          <View key={c} style={[styles.suggestChip, isActive && styles.suggestChipActive, { flexDirection: 'row', alignItems: 'center', paddingRight: 4 }]}>
                            <TouchableOpacity
                              onPress={() => setForm({ ...form, category: c, equipment_category: form.equipment_category || 'sonstiges' })}
                              style={{ paddingVertical: 2 }}
                            >
                              <Text style={[styles.suggestChipText, isActive && styles.suggestChipTextActive]}>{c}</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              onPress={() => deleteCategory(c)}
                              hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                              style={{ marginLeft: 6, paddingHorizontal: 4 }}
                            >
                              <Ionicons name="close-circle" size={16} color={isActive ? '#fff' : '#94a3b8'} />
                            </TouchableOpacity>
                          </View>
                        );
                      })}
                    </ScrollView>
                  );
                })()}

                {/* Eingabefeld für freie Kategorie + Speichern-Button */}
                <TextInput style={styles.input} value={form.category || ''} onChangeText={(v) => setForm({ ...form, category: v })} placeholder="Eigene Kategorie eingeben (optional)" />
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: -4, marginBottom: 8 }}>
                  <TouchableOpacity
                    onPress={async () => {
                      const v = (form.category || '').trim();
                      if (!v) {
                        Alert.alert('Hinweis', 'Bitte zuerst eine Bezeichnung eingeben.');
                        return;
                      }
                      // Nicht erlauben, eine der 8 Standard-Kategorien als „eigene" zu speichern
                      const builtin = EQUIP_CATEGORIES.find(c => c.label.toLowerCase() === v.toLowerCase());
                      if (builtin) {
                        Alert.alert('Hinweis', `"${v}" ist bereits eine Standard-Kategorie und muss nicht zusätzlich gespeichert werden.`);
                        return;
                      }
                      await MachineCategoryService.add(v);
                      const cats = await MachineCategoryService.getAll();
                      setSavedCategories(cats);
                      Alert.alert('Gespeichert', `Kategorie "${v}" wurde hinzugefügt.`);
                    }}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 6, paddingHorizontal: 10, backgroundColor: '#dbeafe', borderRadius: 8 }}
                  >
                    <Ionicons name="bookmark-outline" size={14} color="#1976d2" />
                    <Text style={{ color: '#1976d2', fontSize: 12, fontWeight: '600' }}>Als eigene Kategorie speichern</Text>
                  </TouchableOpacity>
                </View>

                {/* Hersteller / Modell */}
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.label}>Hersteller</Text>
                    <TextInput style={styles.input} value={form.manufacturer || ''} onChangeText={(v) => setForm({ ...form, manufacturer: v })} placeholder="z.B. Liebherr" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.label}>Modell</Text>
                    <TextInput style={styles.input} value={form.model || ''} onChangeText={(v) => setForm({ ...form, model: v })} placeholder="z.B. 132 EC-H" />
                  </View>
                </View>
                {manufacturers.length > 0 && (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.suggestRow} contentContainerStyle={styles.suggestRowContent}>
                    {manufacturers.map(m => (
                      <TouchableOpacity key={m} style={[styles.suggestChip, form.manufacturer === m && styles.suggestChipActive]} onPress={() => setForm({ ...form, manufacturer: form.manufacturer === m ? '' : m })}>
                        <Text style={[styles.suggestChipText, form.manufacturer === m && styles.suggestChipTextActive]}>{m}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                )}

                {/* Baujahr / Seriennummer / Kennzeichen */}
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.label}>Baujahr</Text>
                    <TextInput
                      style={styles.input}
                      value={yearStr}
                      onChangeText={(v) => setYearStr(v)}
                      placeholder="2020"
                      keyboardType="number-pad"
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.label}>Kennzeichen</Text>
                    <TextInput style={styles.input} value={form.license_plate || ''} onChangeText={(v) => setForm({ ...form, license_plate: v })} placeholder="M-AB 1234" autoCapitalize="characters" />
                  </View>
                </View>
                <Text style={styles.label}>Seriennummer / Inventar-Nr.</Text>
                <TextInput style={styles.input} value={form.serial_number || ''} onChangeText={(v) => setForm({ ...form, serial_number: v })} placeholder="z.B. SN-12345 / FIN" />

                {/* Lagerort (Storage Location) */}
                <Text style={styles.label}>Standort / Lagerort</Text>
                {metrics.locations.length > 0 && (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.suggestRow} contentContainerStyle={styles.suggestRowContent}>
                    {metrics.locations.map(c => (
                      <TouchableOpacity
                        key={c}
                        style={[styles.suggestChip, form.storage_location === c && styles.suggestChipActive]}
                        onPress={() => setForm({ ...form, storage_location: form.storage_location === c ? '' : c })}
                      >
                        <Text style={[styles.suggestChipText, form.storage_location === c && styles.suggestChipTextActive]}>{c}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                )}
                <TextInput style={styles.input} value={form.storage_location || ''} onChangeText={(v) => setForm({ ...form, storage_location: v })} placeholder="z.B. Hauptlager München" />

                {/* Verantwortlicher Mitarbeiter */}
                <Text style={styles.label}>Verantwortlich</Text>
                {responsibles.length > 0 && (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.suggestRow} contentContainerStyle={styles.suggestRowContent}>
                    {responsibles.map(r => (
                      <TouchableOpacity key={r} style={[styles.suggestChip, form.responsible_employee === r && styles.suggestChipActive]} onPress={() => setForm({ ...form, responsible_employee: form.responsible_employee === r ? '' : r })}>
                        <Text style={[styles.suggestChipText, form.responsible_employee === r && styles.suggestChipTextActive]}>{r}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                )}
                <TextInput style={styles.input} value={form.responsible_employee || ''} onChangeText={(v) => setForm({ ...form, responsible_employee: v })} placeholder="Mitarbeitername" />

                {/* Zustand */}
                <Text style={styles.label}>Zustand</Text>
                <View style={styles.chipRow}>
                  {CONDITION_OPTIONS.map(c => (
                    <TouchableOpacity
                      key={c.value}
                      style={[styles.chip, form.condition === c.value && { backgroundColor: c.color }]}
                      onPress={() => setForm({ ...form, condition: c.value })}
                    >
                      <Text style={[styles.chipText, form.condition === c.value && styles.chipTextActive]}>{c.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* Stundensatz für Kostenberechnung im Rapport */}
                <Text style={styles.label}>Stundensatz (€/h, optional)</Text>
                <TextInput
                  style={styles.input}
                  value={form.hourly_rate != null && form.hourly_rate > 0 ? String(form.hourly_rate).replace('.', ',') : ''}
                  onChangeText={(v) => {
                    const num = parseFloat(v.replace(',', '.'));
                    setForm({ ...form, hourly_rate: isNaN(num) ? undefined : num });
                  }}
                  placeholder="z.B. 45,00"
                  keyboardType="decimal-pad"
                />
                <Text style={{ fontSize: 11, color: '#64748b', marginTop: -4, marginBottom: 8 }}>
                  Wird nur im Rapport-PDF angezeigt, wenn „Maschinen-Kosten anzeigen" aktiv ist.
                </Text>

                {/* Inspektionen */}
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.label}>Letzte Inspektion</Text>
                    <DatePickerField
                      value={form.last_inspection_date}
                      onChange={(v) => setForm({ ...form, last_inspection_date: v })}
                      placeholder="Datum wählen"
                      accent="#16a34a"
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.label}>Nächste Inspektion</Text>
                    <DatePickerField
                      value={form.next_inspection_date}
                      onChange={(v) => setForm({ ...form, next_inspection_date: v })}
                      placeholder="Datum wählen"
                      accent="#ea580c"
                      minimumDate={form.last_inspection_date ? new Date(form.last_inspection_date) : undefined}
                    />
                  </View>
                </View>

                {/* TÜV / Hauptuntersuchung */}
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.label}>Letzter TÜV</Text>
                    <DatePickerField
                      value={form.last_tuv_date}
                      onChange={(v) => setForm({ ...form, last_tuv_date: v })}
                      placeholder="Datum wählen"
                      accent="#16a34a"
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.label}>Nächster TÜV</Text>
                    <DatePickerField
                      value={form.next_tuv_date}
                      onChange={(v) => setForm({ ...form, next_tuv_date: v })}
                      placeholder="Datum wählen"
                      accent="#dc2626"
                      minimumDate={form.last_tuv_date ? new Date(form.last_tuv_date) : undefined}
                    />
                  </View>
                </View>

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

      {/* ===== Reminder-Einstellungen Modal ===== */}
      <Modal visible={reminderModalVisible} animationType="slide" transparent onRequestClose={() => setReminderModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { paddingBottom: Math.max(insets.bottom, 16), maxHeight: '70%' }]}>
            <View style={styles.modalHeader}>
              <Ionicons name="notifications" size={20} color="#1976d2" />
              <Text style={styles.modalTitle}>Erinnerungen</Text>
              <TouchableOpacity onPress={() => setReminderModalVisible(false)}>
                <Ionicons name="close" size={24} color="#64748b" />
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
              <Text style={{ fontSize: 13, color: '#475569', lineHeight: 18 }}>
                Wie viele Tage <Text style={{ fontWeight: '700' }}>vor</Text> dem nächsten Termin sollst du gewarnt werden?
                Das Banner erscheint dann automatisch auf der Startseite.
              </Text>

              {/* Inspektion */}
              <View style={{ backgroundColor: '#fff7ed', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#fed7aa' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <Ionicons name="shield-checkmark" size={18} color="#ea580c" />
                  <Text style={{ fontWeight: '700', color: '#9a3412', fontSize: 14 }}>Inspektion / UVV</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <TextInput
                    style={[styles.input, { flex: 1, textAlign: 'center', fontSize: 18, fontWeight: '700', color: '#9a3412' }]}
                    value={reminderInspectionStr}
                    onChangeText={(v) => setReminderInspectionStr(v.replace(/[^\d]/g, ''))}
                    keyboardType="number-pad"
                    placeholder="30"
                    maxLength={3}
                  />
                  <Text style={{ fontSize: 14, color: '#475569', fontWeight: '600' }}>Tage vorher</Text>
                </View>
                <View style={{ flexDirection: 'row', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                  {[7, 14, 30, 60, 90].map(d => (
                    <TouchableOpacity key={d} onPress={() => setReminderInspectionStr(String(d))} style={[styles.chip, reminderInspectionStr === String(d) && { backgroundColor: '#ea580c' }]}>
                      <Text style={[styles.chipText, reminderInspectionStr === String(d) && styles.chipTextActive]}>{d} Tage</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* TÜV */}
              <View style={{ backgroundColor: '#fef2f2', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#fecaca' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <Ionicons name="car-sport" size={18} color="#dc2626" />
                  <Text style={{ fontWeight: '700', color: '#991b1b', fontSize: 14 }}>TÜV / Hauptuntersuchung</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <TextInput
                    style={[styles.input, { flex: 1, textAlign: 'center', fontSize: 18, fontWeight: '700', color: '#991b1b' }]}
                    value={reminderTuvStr}
                    onChangeText={(v) => setReminderTuvStr(v.replace(/[^\d]/g, ''))}
                    keyboardType="number-pad"
                    placeholder="30"
                    maxLength={3}
                  />
                  <Text style={{ fontSize: 14, color: '#475569', fontWeight: '600' }}>Tage vorher</Text>
                </View>
                <View style={{ flexDirection: 'row', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                  {[7, 14, 30, 60, 90].map(d => (
                    <TouchableOpacity key={d} onPress={() => setReminderTuvStr(String(d))} style={[styles.chip, reminderTuvStr === String(d) && { backgroundColor: '#dc2626' }]}>
                      <Text style={[styles.chipText, reminderTuvStr === String(d) && styles.chipTextActive]}>{d} Tage</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <Text style={{ fontSize: 11, color: '#94a3b8', textAlign: 'center', marginTop: 4 }}>
                Standard: 30 Tage. Maximal 365 Tage.
              </Text>
            </ScrollView>
            <View style={styles.modalActions}>
              <TouchableOpacity style={[styles.modalBtn, styles.cancelBtn]} onPress={() => setReminderModalVisible(false)}>
                <Text style={styles.cancelBtnText}>Abbrechen</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, styles.saveBtn]}
                onPress={async () => {
                  let insp = parseInt(reminderInspectionStr, 10);
                  let tuv = parseInt(reminderTuvStr, 10);
                  if (!Number.isFinite(insp) || insp < 1) insp = 30;
                  if (!Number.isFinite(tuv) || tuv < 1) tuv = 30;
                  if (insp > 365) insp = 365;
                  if (tuv > 365) tuv = 365;
                  await SettingsService.update({ reminder_days_inspection: insp, reminder_days_tuv: tuv });
                  setReminderDaysInspection(insp);
                  setReminderDaysTuv(tuv);
                  setReminderModalVisible(false);
                }}
              >
                <Ionicons name="checkmark" size={18} color="#fff" />
                <Text style={styles.saveBtnText}>Speichern</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Floating Action Bar bei Selection-Mode */}
      {selectionMode && selectedIds.size > 0 && (
        <View style={[macStyles.fab, { bottom: Math.max(insets.bottom, 12) + 12 }]}>
          <TouchableOpacity
            style={macStyles.fabBtn}
            onPress={() => handleExport(Array.from(selectedIds))}
            activeOpacity={0.85}
          >
            <Ionicons name="share-outline" size={20} color="#fff" />
            <Text style={macStyles.fabBtnText}>{selectedIds.size} exportieren</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Aktions-Menü (Export/Import) */}
      <Modal
        visible={menuVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuVisible(false)}
        onDismiss={() => {
          const action = pendingAction;
          setPendingAction(null);
          if (action === 'export-all') {
            if (items.length === 0) {
              Alert.alert('Hinweis', 'Keine Maschinen zum Exportieren vorhanden.');
            } else {
              handleExport();
            }
          } else if (action === 'select-mode') {
            if (items.length === 0) {
              Alert.alert('Hinweis', 'Keine Maschinen zum Auswählen vorhanden.');
            } else {
              setSelectionMode(true);
              setSelectedIds(new Set());
              setTab('machines');
            }
          } else if (action === 'import') {
            handleImport();
          }
        }}
      >
        <TouchableOpacity style={macStyles.menuOverlay} activeOpacity={1} onPress={() => setMenuVisible(false)}>
          <View style={[macStyles.menuCard, { marginTop: insets.top + 50 }]}>
            <TouchableOpacity style={macStyles.menuItem} onPress={() => { setPendingAction('export-all'); setMenuVisible(false); }}>
              <Ionicons name="cloud-upload-outline" size={20} color="#0891b2" />
              <View style={{ flex: 1 }}>
                <Text style={macStyles.menuItemTitle}>Alle exportieren</Text>
                <Text style={macStyles.menuItemSub}>{items.length} Maschine(n) als JSON</Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity style={macStyles.menuItem} onPress={() => { setPendingAction('select-mode'); setMenuVisible(false); }}>
              <Ionicons name="checkbox-outline" size={20} color="#0891b2" />
              <View style={{ flex: 1 }}>
                <Text style={macStyles.menuItemTitle}>Auswahl exportieren</Text>
                <Text style={macStyles.menuItemSub}>Einzelne Maschinen auswählen</Text>
              </View>
            </TouchableOpacity>
            <View style={macStyles.menuDivider} />
            <TouchableOpacity style={macStyles.menuItem} onPress={() => { setPendingAction('import'); setMenuVisible(false); }}>
              <Ionicons name="cloud-download-outline" size={20} color="#16a34a" />
              <View style={{ flex: 1 }}>
                <Text style={macStyles.menuItemTitle}>Importieren</Text>
                <Text style={macStyles.menuItemSub}>JSON-Datei auswählen</Text>
              </View>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

const MetricCard: React.FC<{ icon: any; color: string; bg: string; label: string; value: number; sub: string; highlight?: boolean; highlightColor?: string }> = ({ icon, color, bg, label, value, sub, highlight, highlightColor }) => (
  <View style={[styles.metricCard, highlight && { borderColor: highlightColor || '#ea580c', borderWidth: 1.5 }]}>
    <View style={[styles.metricIcon, { backgroundColor: bg }]}>
      <Ionicons name={icon} size={16} color={color} />
    </View>
    <Text style={styles.metricLabel}>{label}</Text>
    <Text style={[styles.metricValue, highlight && { color: highlightColor || '#ea580c' }]}>{value}</Text>
    {sub ? <Text style={styles.metricSub}>{sub}</Text> : null}
  </View>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9' },
  scroll: { flex: 1 },
  // Metrics
  metricsRow: { flexDirection: 'row', gap: 6, paddingHorizontal: 10, paddingTop: 10, paddingBottom: 4 },
  metricCard: { width: 90, backgroundColor: '#fff', borderRadius: 10, padding: 8, alignItems: 'flex-start', borderWidth: 1, borderColor: '#e2e8f0' },
  metricIcon: { width: 28, height: 28, borderRadius: 7, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  metricLabel: { fontSize: 10, color: '#64748b', fontWeight: '600' },
  metricValue: { fontSize: 20, fontWeight: '800', color: '#0f172a', marginTop: 2 },
  metricSub: { fontSize: 9, color: '#94a3b8' },
  // Tabs
  tabsScroll: { marginTop: 4 },
  tabsRow: { paddingHorizontal: 10, paddingVertical: 6, gap: 6 },
  tab: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0' },
  tabActive: { backgroundColor: '#1976d2', borderColor: '#1976d2' },
  tabText: { fontSize: 12, fontWeight: '600', color: '#475569' },
  tabTextActive: { color: '#fff' },
  // Add btn
  addButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#1976d2', paddingVertical: 12, borderRadius: 10, marginBottom: 10, marginTop: 6 },
  addButtonText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  // Search/Filter
  searchRow: { marginBottom: 6 },
  searchBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fff', borderRadius: 10, paddingHorizontal: 12, borderWidth: 1, borderColor: '#e2e8f0' },
  searchInput: { flex: 1, paddingVertical: 10, fontSize: 13 },
  filterRow: { flexDirection: 'row', gap: 6, marginBottom: 8, flexWrap: 'wrap' },
  filterChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0' },
  filterChipActive: { backgroundColor: '#1976d2', borderColor: '#1976d2' },
  filterChipText: { fontSize: 11, color: '#475569', fontWeight: '600' },
  // Machine Card
  matCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', padding: 10, borderRadius: 12, marginBottom: 6, borderWidth: 1, borderColor: '#e2e8f0', gap: 8 },
  matPhoto: { width: 56, height: 56, borderRadius: 8, backgroundColor: '#f1f5f9' },
  matPhotoPlaceholder: { width: 56, height: 56, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  matName: { fontWeight: '700', color: '#0f172a', fontSize: 14, flex: 1 },
  matMetaSub: { fontSize: 10, color: '#64748b' },
  matMetaTag: { fontSize: 10, color: '#475569', backgroundColor: '#f1f5f9', paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4 },
  inactiveBadge: { backgroundColor: '#f3f4f6', paddingHorizontal: 6, paddingVertical: 1, borderRadius: 8 },
  inactiveText: { color: '#9ca3af', fontSize: 10, fontWeight: '600' },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 6, paddingVertical: 3, borderRadius: 10 },
  statusBadgeText: { fontSize: 10, fontWeight: '700' },
  loanInfo: { fontSize: 11, color: '#7c3aed', fontWeight: '600', marginTop: 3 },
  delBtn: { padding: 6 },
  // Empty
  empty: { alignItems: 'center', padding: 30 },
  emptyText: { color: '#94a3b8', fontWeight: '600', marginTop: 8 },
  emptySub: { color: '#94a3b8', textAlign: 'center', marginTop: 6, fontSize: 12, lineHeight: 18, paddingHorizontal: 20 },
  // Agg Tabs
  aggHint: { fontSize: 12, color: '#64748b', fontStyle: 'italic', padding: 8 },
  aggCard: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#fff', borderRadius: 10, padding: 12, marginBottom: 6, borderWidth: 1, borderColor: '#e2e8f0' },
  aggIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  aggName: { fontWeight: '700', color: '#0f172a', fontSize: 14 },
  aggCount: { fontSize: 12, color: '#64748b', marginTop: 2 },
  // Filter Menu Modal
  filterOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  filterSheet: { backgroundColor: '#fff', borderRadius: 14, padding: 16, width: '100%', maxWidth: 360 },
  filterOpt: { padding: 12, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  filterOptText: { fontSize: 14, color: '#0f172a' },
  // Edit Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 16 },
  modalContent: { backgroundColor: '#fff', borderRadius: 14, padding: 16, width: '100%', maxWidth: 500 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  modalTitle: { fontSize: 17, fontWeight: '700', color: '#0f172a' },
  label: { fontSize: 13, color: '#374151', fontWeight: '600', marginTop: 10, marginBottom: 4 },
  input: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 10, fontSize: 14 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 6 },
  chip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14, backgroundColor: '#f3f4f6' },
  chipText: { fontSize: 12, color: '#374151', fontWeight: '600' },
  chipTextActive: { color: '#fff' },
  // Status Chips (larger w/ icon)
  statusChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14 },
  statusChipText: { fontSize: 12, fontWeight: '700' },
  loanBox: { backgroundColor: '#faf5ff', borderRadius: 10, padding: 10, marginTop: 6, borderWidth: 1, borderColor: '#e9d5ff' },
  // Suggest Chips
  suggestRow: { marginBottom: 6, maxHeight: 36 },
  suggestRowContent: { gap: 6, paddingVertical: 2 },
  suggestChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14, backgroundColor: '#eff6ff', borderWidth: 1, borderColor: '#bfdbfe' },
  suggestChipActive: { backgroundColor: '#1976d2', borderColor: '#1976d2' },
  suggestChipText: { fontSize: 12, color: '#1976d2', fontWeight: '600' },
  suggestChipTextActive: { color: '#fff' },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  modalBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, borderRadius: 8, gap: 6 },
  cancelBtn: { backgroundColor: '#eceff1' },
  cancelBtnText: { color: '#555', fontWeight: '600' },
  saveBtn: { backgroundColor: '#4caf50' },
  saveBtnText: { color: '#fff', fontWeight: '700' },
  // Photo
  photoPreview: { width: 88, height: 88, borderRadius: 8, overflow: 'hidden', position: 'relative' },
  photoPreviewImg: { width: 88, height: 88, backgroundColor: '#f1f5f9' },
  photoRemove: { position: 'absolute', top: 2, right: 2, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 11 },
  photoAddTile: { width: 88, height: 88, borderRadius: 8, backgroundColor: '#eff6ff', alignItems: 'center', justifyContent: 'center', gap: 4, borderWidth: 1, borderColor: '#bfdbfe', borderStyle: 'dashed' },
  photoAddText: { fontSize: 11, color: '#1976d2', fontWeight: '600' },
});

const macStyles = StyleSheet.create({
  fab: { position: 'absolute', left: 16, right: 16, alignItems: 'center' },
  fabBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#0891b2', borderRadius: 28, paddingVertical: 14, paddingHorizontal: 22, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 6 },
  fabBtnText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  menuOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', alignItems: 'flex-end', paddingRight: 8 },
  menuCard: { backgroundColor: '#fff', borderRadius: 12, width: 260, paddingVertical: 6, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 8 },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12 },
  menuItemTitle: { fontSize: 14, fontWeight: '700', color: '#0f172a' },
  menuItemSub: { fontSize: 11, color: '#64748b', marginTop: 1 },
  menuDivider: { height: 1, backgroundColor: '#e2e8f0', marginVertical: 4 },
});

// Keep helper accessible
export { parseGermanNumber };

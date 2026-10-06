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
import { readTextFile } from '../../utils/readTextFile';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import { MaterialMasterService, MaterialMaster, MaterialCategoryService, MaterialCategory, MaterialLocationService, MaterialLocation, MaterialSupplierService, MaterialSupplier, generateArticleNumber } from '../../services/LocalStorage';

const UNIT_OPTIONS = ['Stk', 'm', 'm²', 'm³', 'kg', 'L', 'Pck', 'Pal', 'h', 't', 'Rolle', 'Paar'];

// Hilfsfunktionen für deutsche Zahlen-Eingabe (Komma statt Punkt)
const parseGermanNumber = (v: string): number => {
  if (!v) return 0;
  return parseFloat(v.replace(',', '.').replace(/[^\d.-]/g, '')) || 0;
};
const formatGermanNumber = (n: number | undefined | null): string => {
  if (n == null || isNaN(n as any)) return '';
  return String(n).replace('.', ',');
};

type TabKey = 'materials' | 'categories' | 'locations' | 'suppliers';

const EMPTY: Partial<MaterialMaster> = {
  name: '', unit: 'Stk', default_quantity: 1, category: '', price_per_unit: undefined, purchase_price: undefined, markup_percent: undefined,
  supplier: '', article_number: '', note: '', photo: '',
  stock_quantity: 0, low_stock_threshold: 0, storage_location: '',
  active: true,
};

export default function MaterialsIndex() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const [materials, setMaterials] = useState<MaterialMaster[]>([]);
  const [tab, setTab] = useState<TabKey>('materials');
  const [modalVisible, setModalVisible] = useState(false);
  const [editing, setEditing] = useState<MaterialMaster | null>(null);
  const [form, setForm] = useState<Partial<MaterialMaster>>(EMPTY);
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('');
  const [filterLocation, setFilterLocation] = useState<string>('');
  const [showFilterMenu, setShowFilterMenu] = useState<null | 'cat' | 'loc'>(null);
  // Roh-Eingabe-Strings für Zahlenfelder (damit Komma beim Tippen erhalten bleibt)
  const [numStr, setNumStr] = useState<{ stock?: string; threshold?: string; defaultQty?: string; price?: string }>({});
  // Gespeicherte Kategorien (eigene Bezeichnungen)
  const [savedCategories, setSavedCategories] = useState<MaterialCategory[]>([]);
  const [savedLocations, setSavedLocations] = useState<MaterialLocation[]>([]);
  const [savedSuppliers, setSavedSuppliers] = useState<MaterialSupplier[]>([]);
  // ===== Export-Auswahl-Modus =====
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [menuVisible, setMenuVisible] = useState(false);
  const [pendingAction, setPendingAction] = useState<null | 'export-all' | 'select-mode' | 'import' | 'price-all' | 'price-select'>(null);
  // ===== Zentrale Preis-Anpassung (%) =====
  const [priceModalVisible, setPriceModalVisible] = useState(false);
  const [priceScopeIds, setPriceScopeIds] = useState<string[] | null>(null); // null = alle Materialien
  const [pricePercentStr, setPricePercentStr] = useState('');
  const [priceTarget, setPriceTarget] = useState<'both' | 'ek' | 'vk'>('both');
  const [priceSelectMode, setPriceSelectMode] = useState(false); // Auswahl-Modus für Preis-Anpassung statt Export

  React.useEffect(() => {
    navigation.setOptions({
      title: selectionMode ? `${selectedIds.size} ausgewählt` : 'Material-Verwaltung',
      headerStyle: { backgroundColor: selectionMode ? '#0891b2' : '#1976d2' },
      headerTintColor: '#fff',
      headerRight: () => (
        <View style={{ flexDirection: 'row', gap: 8, paddingRight: 8 }}>
          {selectionMode ? (
            <>
              <TouchableOpacity
                onPress={() => {
                  if (selectedIds.size === materials.length) setSelectedIds(new Set());
                  else setSelectedIds(new Set(materials.map(m => m.id)));
                }}
                style={{ paddingHorizontal: 8, paddingVertical: 4 }}
              >
                <Text style={{ color: '#0f172a', fontSize: 13, fontWeight: '700' }}>
                  {selectedIds.size === materials.length ? 'Keine' : 'Alle'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => { setSelectionMode(false); setPriceSelectMode(false); setSelectedIds(new Set()); }}
                style={{ paddingHorizontal: 8, paddingVertical: 4 }}
              >
                <Ionicons name="close" size={22} color="#0f172a" />
              </TouchableOpacity>
            </>
          ) : (
            <TouchableOpacity
              onPress={() => setMenuVisible(true)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 5,
                backgroundColor: 'rgba(255,255,255,0.9)',
                paddingHorizontal: 10,
                paddingVertical: 6,
                borderRadius: 16,
              }}
            >
              <Ionicons name="build-outline" size={16} color="#1976d2" />
              <Text style={{ color: '#1976d2', fontSize: 13, fontWeight: '700' }}>Aktionen</Text>
              <Ionicons name="chevron-down" size={14} color="#1976d2" />
            </TouchableOpacity>
          )}
        </View>
      ),
    });
  }, [navigation, selectionMode, selectedIds, materials]);

  const load = useCallback(async () => {
    const all = await MaterialMasterService.getAll();
    setMaterials(all);
    const cats = await MaterialCategoryService.getAll();
    setSavedCategories(cats);
    const locs = await MaterialLocationService.getAll();
    setSavedLocations(locs);
    const sups = await MaterialSupplierService.getAll();
    setSavedSuppliers(sups);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // ===== Metrics =====
  const metrics = useMemo(() => {
    const cats = new Set<string>();
    const locs = new Set<string>();
    let lowStock = 0;
    materials.forEach(m => {
      if (m.category) cats.add(m.category);
      if (m.storage_location) locs.add(m.storage_location);
      if (m.low_stock_threshold != null && m.low_stock_threshold > 0 && (m.stock_quantity ?? 0) <= m.low_stock_threshold) {
        lowStock += 1;
      }
    });
    return {
      totalCount: materials.length,
      categoryCount: cats.size,
      locationCount: locs.size,
      lowStockCount: lowStock,
      categories: Array.from(cats).sort(),
      locations: Array.from(locs).sort(),
    };
  }, [materials]);

  // Aggregierte Listen für Tabs
  const categoriesAgg = useMemo(() => {
    const map: Record<string, number> = {};
    materials.forEach(m => {
      const k = m.category || '— ohne —';
      map[k] = (map[k] || 0) + 1;
    });
    return Object.entries(map).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
  }, [materials]);

  const locationsAgg = useMemo(() => {
    const map: Record<string, number> = {};
    materials.forEach(m => {
      const k = m.storage_location || '— ohne —';
      map[k] = (map[k] || 0) + 1;
    });
    return Object.entries(map).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
  }, [materials]);

  const suppliersAgg = useMemo(() => {
    const map: Record<string, number> = {};
    materials.forEach(m => {
      const k = m.supplier || '— ohne —';
      map[k] = (map[k] || 0) + 1;
    });
    return Object.entries(map).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
  }, [materials]);

  // Filtered list
  const filtered = useMemo(() => {
    return materials.filter(m => {
      if (filterCategory && m.category !== filterCategory) return false;
      if (filterLocation && m.storage_location !== filterLocation) return false;
      if (!search.trim()) return true;
      const s = search.toLowerCase();
      return (
        m.name.toLowerCase().includes(s) ||
        (m.category || '').toLowerCase().includes(s) ||
        (m.article_number || '').toLowerCase().includes(s) ||
        (m.supplier || '').toLowerCase().includes(s)
      );
    });
  }, [materials, search, filterCategory, filterLocation]);

  const openCreate = () => {
    setEditing(null);
    setForm({ ...EMPTY });
    setNumStr({});
    setModalVisible(true);
    // Artikel-Nummer automatisch vorschlagen (anpassbar)
    generateArticleNumber().then(num => {
      setForm(prev => ({ ...prev, article_number: num }));
    }).catch(() => {});
  };
  const openEdit = (m: MaterialMaster) => {
    setEditing(m);
    setForm({ ...m });
    setNumStr({
      stock: m.stock_quantity != null ? formatGermanNumber(m.stock_quantity) : '',
      threshold: m.low_stock_threshold != null ? formatGermanNumber(m.low_stock_threshold) : '',
      defaultQty: m.default_quantity != null ? formatGermanNumber(m.default_quantity) : '',
      price: m.price_per_unit != null ? formatGermanNumber(m.price_per_unit) : '',
      ek: m.purchase_price != null ? formatGermanNumber(m.purchase_price) : '',
      markup: m.markup_percent != null ? formatGermanNumber(m.markup_percent) : '',
    });
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
        ? await ImagePicker.launchCameraAsync({ quality: 0.5, base64: true, allowsEditing: true, aspect: [1, 1] })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'] as any, quality: 0.5, base64: true, allowsEditing: true, aspect: [1, 1] });
      if (result.canceled) return;
      const a = ((result as any).assets || [])[0];
      if (a?.base64) setForm({ ...form, photo: `data:image/jpeg;base64,${a.base64}` });
    } catch (e) { console.error(e); }
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
      // Kategorie automatisch in Vorschlagsliste übernehmen
      if (form.category && typeof form.category === 'string' && form.category.trim()) {
        await MaterialCategoryService.add(form.category.trim());
      }
      if (form.storage_location && typeof form.storage_location === 'string' && form.storage_location.trim()) {
        await MaterialLocationService.add(form.storage_location.trim());
      }
      if (form.supplier && typeof form.supplier === 'string' && form.supplier.trim()) {
        await MaterialSupplierService.add(form.supplier.trim());
      }
      setModalVisible(false);
      await load();
    } catch (e) {
      console.error(e);
      Alert.alert('Fehler', 'Speichern fehlgeschlagen.');
    }
  };

  const deleteCategory = (name: string) => {
    const inUse = materials.filter(m => (m.category || '').toLowerCase() === name.toLowerCase()).length;
    const msg = inUse > 0
      ? `Kategorie "${name}" wird derzeit von ${inUse} Material(ien) verwendet. Trotzdem löschen?\n\n(Die Materialien bleiben erhalten – nur der Vorschlag verschwindet.)`
      : `Kategorie "${name}" wirklich löschen?`;
    Alert.alert('Kategorie löschen?', msg, [
      { text: 'Abbrechen', style: 'cancel' },
      {
        text: 'Löschen',
        style: 'destructive',
        onPress: async () => {
          await MaterialCategoryService.deleteByName(name);
          const cats = await MaterialCategoryService.getAll();
          setSavedCategories(cats);
          if ((form.category || '').toLowerCase() === name.toLowerCase()) {
            setForm(f => ({ ...f, category: '' }));
          }
        },
      },
    ]);
  };

  const deleteLocation = (name: string) => {
    const inUse = materials.filter(m => (m.storage_location || '').toLowerCase() === name.toLowerCase()).length;
    const msg = inUse > 0
      ? `Lagerort "${name}" wird derzeit von ${inUse} Material(ien) verwendet. Trotzdem löschen?\n\n(Die Materialien bleiben erhalten – nur der Vorschlag verschwindet.)`
      : `Lagerort "${name}" wirklich löschen?`;
    Alert.alert('Lagerort löschen?', msg, [
      { text: 'Abbrechen', style: 'cancel' },
      {
        text: 'Löschen',
        style: 'destructive',
        onPress: async () => {
          await MaterialLocationService.deleteByName(name);
          const locs = await MaterialLocationService.getAll();
          setSavedLocations(locs);
          if ((form.storage_location || '').toLowerCase() === name.toLowerCase()) {
            setForm(f => ({ ...f, storage_location: '' }));
          }
        },
      },
    ]);
  };

  const deleteSupplier = (name: string) => {
    const inUse = materials.filter(m => (m.supplier || '').toLowerCase() === name.toLowerCase()).length;
    const msg = inUse > 0
      ? `Lieferant "${name}" wird derzeit von ${inUse} Material(ien) verwendet. Trotzdem löschen?\n\n(Die Materialien bleiben erhalten – nur der Vorschlag verschwindet.)`
      : `Lieferant "${name}" wirklich löschen?`;
    Alert.alert('Lieferant löschen?', msg, [
      { text: 'Abbrechen', style: 'cancel' },
      {
        text: 'Löschen',
        style: 'destructive',
        onPress: async () => {
          await MaterialSupplierService.deleteByName(name);
          const sups = await MaterialSupplierService.getAll();
          setSavedSuppliers(sups);
          if ((form.supplier || '').toLowerCase() === name.toLowerCase()) {
            setForm(f => ({ ...f, supplier: '' }));
          }
        },
      },
    ]);
  };

  const handleDelete = (m: MaterialMaster) => {
    Alert.alert('Material löschen', `${m.name} wirklich löschen?`, [
      { text: 'Abbrechen', style: 'cancel' },
      { text: 'Löschen', style: 'destructive', onPress: async () => { await MaterialMasterService.delete(m.id); await load(); } },
    ]);
  };

  const handleDuplicate = async (m: MaterialMaster) => {
    try {
      const { id, created_at, updated_at, ...rest } = m as any;
      const newName = `${m.name} (Kopie)`;
      const copy = { ...rest, name: newName };
      await MaterialMasterService.create(copy);
      await load();
      Alert.alert('Kopiert', `"${newName}" wurde erstellt.`);
    } catch (e) {
      console.error(e);
      Alert.alert('Fehler', 'Kopieren fehlgeschlagen.');
    }
  };

  // ===== Export-Funktion =====
  const handleExport = async (idsToExport?: string[]) => {
    try {
      const toExport = idsToExport
        ? materials.filter(m => idsToExport.includes(m.id))
        : materials;
      if (toExport.length === 0) {
        Alert.alert('Keine Auswahl', 'Bitte mindestens ein Material auswählen.');
        return;
      }
      const payload = {
        type: 'aufmassprofi-materials',
        version: 1,
        exported_at: new Date().toISOString(),
        count: toExport.length,
        materials: toExport,
      };
      const json = JSON.stringify(payload, null, 2);
      const date = new Date().toISOString().slice(0, 10);
      const filename = toExport.length === 1
        ? `Material_${toExport[0].name.replace(/[^a-zA-Z0-9äöüÄÖÜß-]/g, '_')}_${date}.json`
        : `Material_${toExport.length}_${date}.json`;
      const fileUri = `${(FileSystem as any).cacheDirectory || (FileSystem as any).documentDirectory}${filename}`;
      await FileSystem.writeAsStringAsync(fileUri, json, { encoding: 'utf8' as any });
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(fileUri, {
          mimeType: 'application/json',
          dialogTitle: `${toExport.length} Material(ien) exportieren`,
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
      const content = await readTextFile(fileUri);
      let parsed: any;
      try { parsed = JSON.parse(content); } catch {
        Alert.alert('Fehler', 'Die Datei ist kein gültiges JSON.');
        return;
      }
      const incoming: MaterialMaster[] = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed?.materials)
        ? parsed.materials
        : [];
      if (incoming.length === 0) {
        Alert.alert('Fehler', 'Keine Materialien in der Datei gefunden.');
        return;
      }
      const existing = await MaterialMasterService.getAll();
      const existingNames = new Set(existing.map(m => m.name.toLowerCase().trim()));
      Alert.alert(
        'Materialien importieren',
        `${incoming.length} Material(ien) gefunden.\n\nMöchtest du sie hinzufügen? Duplikate (gleicher Name) werden übersprungen.`,
        [
          { text: 'Abbrechen', style: 'cancel' },
          {
            text: `${incoming.length} importieren`,
            onPress: async () => {
              let imported = 0;
              let skipped = 0;
              for (const mat of incoming) {
                if (!mat || !mat.name) { skipped++; continue; }
                if (existingNames.has(mat.name.toLowerCase().trim())) { skipped++; continue; }
                const { id, created_at, updated_at, ...rest } = mat as any;
                await MaterialMasterService.create(rest);
                imported++;
              }
              await load();
              Alert.alert(
                'Import abgeschlossen',
                `✓ ${imported} Material(ien) importiert\n${skipped > 0 ? `⚠ ${skipped} übersprungen (Duplikate)` : ''}`
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

  // Bestand anpassen (+/-)
  const adjustStock = async (m: MaterialMaster, delta: number) => {
    const newStock = Math.max(0, (m.stock_quantity ?? 0) + delta);
    await MaterialMasterService.update(m.id, { stock_quantity: newStock });
    await load();
  };

  // ===== Zentrale Preis-Anpassung anwenden =====
  const openPriceModal = (scopeIds: string[] | null) => {
    setPriceScopeIds(scopeIds);
    setPricePercentStr('');
    setPriceTarget('both');
    setPriceModalVisible(true);
  };

  const applyPriceAdjust = async () => {
    const pct = pricePercentStr ? parseGermanNumber(pricePercentStr) : NaN;
    if (pct == null || isNaN(pct) || pct === 0) {
      Alert.alert('Hinweis', 'Bitte einen Prozentsatz eingeben (z.B. 5 oder -3).');
      return;
    }
    const targets = priceScopeIds ? materials.filter(m => priceScopeIds.includes(m.id)) : materials;
    if (targets.length === 0) {
      Alert.alert('Hinweis', 'Keine Materialien ausgewählt.');
      return;
    }
    const factor = 1 + pct / 100;
    let updated = 0;
    for (const m of targets) {
      const patch: Partial<MaterialMaster> = {};
      if ((priceTarget === 'both' || priceTarget === 'ek') && m.purchase_price != null) {
        patch.purchase_price = Math.round(m.purchase_price * factor * 100) / 100;
      }
      if ((priceTarget === 'both' || priceTarget === 'vk') && m.price_per_unit != null) {
        patch.price_per_unit = Math.round(m.price_per_unit * factor * 100) / 100;
      }
      if (Object.keys(patch).length > 0) {
        await MaterialMasterService.update(m.id, patch);
        updated++;
      }
    }
    setPriceModalVisible(false);
    setSelectionMode(false);
    setPriceSelectMode(false);
    setSelectedIds(new Set());
    await load();
    const skipped = targets.length - updated;
    Alert.alert(
      'Preise angepasst',
      `✓ ${updated} Material(ien) um ${formatGermanNumber(Math.abs(pct))} % ${pct > 0 ? 'erhöht' : 'gesenkt'}.${skipped > 0 ? `\n⚠ ${skipped} ohne hinterlegten Preis übersprungen.` : ''}`
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView style={styles.scroll} contentContainerStyle={{ paddingBottom: 80 }}>
        {/* ===== Metrics ===== */}
        <View style={styles.metricsRow}>
          <MetricCard icon="cube" color="#1976d2" bg="#dbeafe" label="Gesamt" value={metrics.totalCount} sub="Materialien" />
          <MetricCard icon="pricetag" color="#16a34a" bg="#dcfce7" label="Kategorien" value={metrics.categoryCount} sub="" />
          <MetricCard icon="location" color="#7c3aed" bg="#ede9fe" label="Lagerorte" value={metrics.locationCount} sub="" />
          <MetricCard icon="warning" color="#ea580c" bg="#fed7aa" label="Niedrig" value={metrics.lowStockCount} sub="Bestand" highlight={metrics.lowStockCount > 0} />
        </View>

        {/* ===== Tabs ===== */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabsScroll} contentContainerStyle={styles.tabsRow}>
          {([
            { key: 'materials', label: 'Materialien', icon: 'cube-outline' },
            { key: 'categories', label: 'Kategorien', icon: 'pricetag-outline' },
            { key: 'locations', label: 'Lagerorte', icon: 'location-outline' },
            { key: 'suppliers', label: 'Lieferanten', icon: 'car-outline' },
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

        {/* ===== Materials Tab ===== */}
        {tab === 'materials' && (
          <View style={{ paddingHorizontal: 12 }}>
            <TouchableOpacity style={styles.addButton} onPress={openCreate}>
              <Ionicons name="add-circle" size={20} color="#fff" />
              <Text style={styles.addButtonText}>Material hinzufügen</Text>
            </TouchableOpacity>

            {/* Search + Filter */}
            <View style={styles.searchRow}>
              <View style={styles.searchBox}>
                <Ionicons name="search" size={16} color="#94a3b8" />
                <TextInput style={styles.searchInput} value={search} onChangeText={setSearch} placeholder="Material suchen..." />
                {search ? <TouchableOpacity onPress={() => setSearch('')}><Ionicons name="close-circle" size={16} color="#94a3b8" /></TouchableOpacity> : null}
              </View>
            </View>
            <View style={styles.filterRow}>
              <TouchableOpacity style={[styles.filterChip, filterCategory && styles.filterChipActive]} onPress={() => setShowFilterMenu('cat')}>
                <Text style={[styles.filterChipText, filterCategory && { color: '#fff' }]}>{filterCategory || 'Kategorie ▼'}</Text>
                {filterCategory ? <TouchableOpacity onPress={() => setFilterCategory('')}><Ionicons name="close" size={14} color="#fff" /></TouchableOpacity> : null}
              </TouchableOpacity>
              <TouchableOpacity style={[styles.filterChip, filterLocation && styles.filterChipActive]} onPress={() => setShowFilterMenu('loc')}>
                <Text style={[styles.filterChipText, filterLocation && { color: '#fff' }]}>{filterLocation || 'Lagerort ▼'}</Text>
                {filterLocation ? <TouchableOpacity onPress={() => setFilterLocation('')}><Ionicons name="close" size={14} color="#fff" /></TouchableOpacity> : null}
              </TouchableOpacity>
            </View>

            {/* Material List */}
            {filtered.length === 0 ? (
              <View style={styles.empty}>
                <Ionicons name="cube-outline" size={48} color="#cbd5e1" />
                <Text style={styles.emptyText}>{materials.length === 0 ? 'Kein Material angelegt' : 'Keine Treffer'}</Text>
              </View>
            ) : (
              filtered.map(m => {
                const isLow = m.low_stock_threshold != null && m.low_stock_threshold > 0 && (m.stock_quantity ?? 0) <= m.low_stock_threshold;
                const isSelected = selectedIds.has(m.id);
                return (
                  <TouchableOpacity
                    key={m.id}
                    style={[styles.matCard, isSelected && { borderColor: '#0891b2', borderWidth: 2, backgroundColor: '#ecfeff' }]}
                    onPress={() => { if (selectionMode) toggleSelect(m.id); else openEdit(m); }}
                  >
                    {selectionMode && (
                      <View style={{ marginRight: 6 }}>
                        <Ionicons
                          name={isSelected ? 'checkbox' : 'square-outline'}
                          size={24}
                          color={isSelected ? '#0891b2' : '#94a3b8'}
                        />
                      </View>
                    )}
                    {m.photo ? (
                      <Image source={{ uri: m.photo }} style={styles.matPhoto} />
                    ) : (
                      <View style={styles.matPhotoPlaceholder}>
                        <Ionicons name="cube" size={22} color="#f59e0b" />
                      </View>
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.matName, !m.active && { color: '#9ca3af' }]} numberOfLines={2}>{m.name}</Text>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 2, alignItems: 'center' }}>
                        {isLow && (
                          <View style={styles.lowBadge}>
                            <Ionicons name="warning" size={10} color="#fff" />
                            <Text style={styles.lowBadgeText}>NIEDRIG</Text>
                          </View>
                        )}
                        {m.article_number ? <Text style={styles.matMetaSub}>Art.-Nr. {m.article_number}</Text> : null}
                        {m.category ? <Text style={styles.matMetaTag}>{m.category}</Text> : null}
                        {m.storage_location ? <Text style={styles.matMetaTag}>📍 {m.storage_location}</Text> : null}
                        {m.purchase_price != null ? <Text style={styles.matMetaSub}>EK {formatGermanNumber(m.purchase_price)} €</Text> : null}
                        {m.price_per_unit != null ? <Text style={styles.matMetaSub}>VK {formatGermanNumber(m.price_per_unit)} €</Text> : null}
                      </View>
                    </View>
                    <View style={styles.stockBlock}>
                      <Text style={[styles.stockNumber, isLow && { color: '#ea580c' }]}>{m.stock_quantity ?? 0}</Text>
                      <Text style={styles.stockUnit}>{m.unit}</Text>
                      <View style={styles.stockControls}>
                        <TouchableOpacity onPress={(e) => { e.stopPropagation?.(); adjustStock(m, -1); }} style={styles.stockBtn}>
                          <Ionicons name="remove" size={14} color="#1976d2" />
                        </TouchableOpacity>
                        <TouchableOpacity onPress={(e) => { e.stopPropagation?.(); adjustStock(m, 1); }} style={styles.stockBtn}>
                          <Ionicons name="add" size={14} color="#1976d2" />
                        </TouchableOpacity>
                      </View>
                    </View>
                    {!selectionMode && (
                      <View style={{ flexDirection: 'row', gap: 4 }}>
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
                  </TouchableOpacity>
                );
              })
            )}
          </View>
        )}

        {/* ===== Kategorien Tab ===== */}
        {tab === 'categories' && (
          <View style={{ paddingHorizontal: 12 }}>
            <Text style={styles.aggHint}>Tippe auf eine Kategorie, um in den Materialien danach zu filtern.</Text>
            {categoriesAgg.length === 0 ? (
              <Text style={styles.empty}>Noch keine Kategorien vorhanden.</Text>
            ) : categoriesAgg.map(c => (
              <TouchableOpacity key={c.name} style={styles.aggCard} onPress={() => { setFilterCategory(c.name === '— ohne —' ? '' : c.name); setTab('materials'); }}>
                <View style={[styles.aggIcon, { backgroundColor: '#dcfce7' }]}><Ionicons name="pricetag" size={20} color="#16a34a" /></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.aggName}>{c.name}</Text>
                  <Text style={styles.aggCount}>{c.count} {c.count === 1 ? 'Material' : 'Materialien'}</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color="#cbd5e1" />
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* ===== Lagerorte Tab ===== */}
        {tab === 'locations' && (
          <View style={{ paddingHorizontal: 12 }}>
            <Text style={styles.aggHint}>Tippe auf einen Lagerort, um in den Materialien zu filtern.</Text>
            {locationsAgg.length === 0 ? (
              <Text style={styles.empty}>Noch keine Lagerorte vorhanden.</Text>
            ) : locationsAgg.map(c => (
              <TouchableOpacity key={c.name} style={styles.aggCard} onPress={() => { setFilterLocation(c.name === '— ohne —' ? '' : c.name); setTab('materials'); }}>
                <View style={[styles.aggIcon, { backgroundColor: '#ede9fe' }]}><Ionicons name="location" size={20} color="#7c3aed" /></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.aggName}>{c.name}</Text>
                  <Text style={styles.aggCount}>{c.count} {c.count === 1 ? 'Material' : 'Materialien'}</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color="#cbd5e1" />
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* ===== Lieferanten Tab ===== */}
        {tab === 'suppliers' && (
          <View style={{ paddingHorizontal: 12 }}>
            <Text style={styles.aggHint}>Übersicht aller Lieferanten und ihrer Materialien.</Text>
            {suppliersAgg.length === 0 ? (
              <Text style={styles.empty}>Noch keine Lieferanten vorhanden.</Text>
            ) : suppliersAgg.map(c => (
              <View key={c.name} style={styles.aggCard}>
                <View style={[styles.aggIcon, { backgroundColor: '#fef3c7' }]}><Ionicons name="car" size={20} color="#d97706" /></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.aggName}>{c.name}</Text>
                  <Text style={styles.aggCount}>{c.count} {c.count === 1 ? 'Material' : 'Materialien'}</Text>
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      {/* Floating Action Bar bei Selection-Mode */}
      {selectionMode && selectedIds.size > 0 && (
        <View style={[matStyles.fab, { bottom: Math.max(insets.bottom, 12) + 12, flexDirection: 'row', justifyContent: 'center', gap: 10 }]}>
          {priceSelectMode ? (
            <TouchableOpacity
              style={[matStyles.fabBtn, { backgroundColor: '#7c3aed' }]}
              onPress={() => openPriceModal(Array.from(selectedIds))}
              activeOpacity={0.85}
            >
              <Ionicons name="trending-up-outline" size={20} color="#fff" />
              <Text style={matStyles.fabBtnText}>{selectedIds.size} Preise anpassen</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={matStyles.fabBtn}
              onPress={() => handleExport(Array.from(selectedIds))}
              activeOpacity={0.85}
            >
              <Ionicons name="share-outline" size={20} color="#fff" />
              <Text style={matStyles.fabBtnText}>{selectedIds.size} exportieren</Text>
            </TouchableOpacity>
          )}
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
            if (materials.length === 0) {
              Alert.alert('Hinweis', 'Keine Materialien zum Exportieren vorhanden.');
            } else {
              handleExport();
            }
          } else if (action === 'select-mode') {
            if (materials.length === 0) {
              Alert.alert('Hinweis', 'Keine Materialien zum Auswählen vorhanden.');
            } else {
              setSelectionMode(true);
              setSelectedIds(new Set());
              setTab('materials');
            }
          } else if (action === 'import') {
            handleImport();
          } else if (action === 'price-all') {
            if (materials.length === 0) {
              Alert.alert('Hinweis', 'Keine Materialien vorhanden.');
            } else {
              openPriceModal(null);
            }
          } else if (action === 'price-select') {
            if (materials.length === 0) {
              Alert.alert('Hinweis', 'Keine Materialien vorhanden.');
            } else {
              setSelectionMode(true);
              setPriceSelectMode(true);
              setSelectedIds(new Set());
              setTab('materials');
            }
          }
        }}
      >
        <TouchableOpacity style={matStyles.menuOverlay} activeOpacity={1} onPress={() => setMenuVisible(false)}>
          <View style={[matStyles.menuCard, { marginTop: insets.top + 50 }]}>
            <TouchableOpacity style={matStyles.menuItem} onPress={() => { setPendingAction('export-all'); setMenuVisible(false); }}>
              <Ionicons name="cloud-upload-outline" size={20} color="#0891b2" />
              <View style={{ flex: 1 }}>
                <Text style={matStyles.menuItemTitle}>Alle exportieren</Text>
                <Text style={matStyles.menuItemSub}>{materials.length} Material(ien) als JSON</Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity style={matStyles.menuItem} onPress={() => { setPendingAction('select-mode'); setMenuVisible(false); }}>
              <Ionicons name="checkbox-outline" size={20} color="#0891b2" />
              <View style={{ flex: 1 }}>
                <Text style={matStyles.menuItemTitle}>Auswahl exportieren</Text>
                <Text style={matStyles.menuItemSub}>Einzelne Materialien auswählen</Text>
              </View>
            </TouchableOpacity>
            <View style={matStyles.menuDivider} />
            <TouchableOpacity style={matStyles.menuItem} onPress={() => { setPendingAction('price-all'); setMenuVisible(false); }}>
              <Ionicons name="trending-up-outline" size={20} color="#7c3aed" />
              <View style={{ flex: 1 }}>
                <Text style={matStyles.menuItemTitle}>Preise anpassen (alle)</Text>
                <Text style={matStyles.menuItemSub}>Alle {materials.length} Material(ien) um X % ändern</Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity style={matStyles.menuItem} onPress={() => { setPendingAction('price-select'); setMenuVisible(false); }}>
              <Ionicons name="options-outline" size={20} color="#7c3aed" />
              <View style={{ flex: 1 }}>
                <Text style={matStyles.menuItemTitle}>Preise anpassen (Auswahl)</Text>
                <Text style={matStyles.menuItemSub}>Bestimmte Materialien auswählen</Text>
              </View>
            </TouchableOpacity>
            <View style={matStyles.menuDivider} />
            <TouchableOpacity style={matStyles.menuItem} onPress={() => { setPendingAction('import'); setMenuVisible(false); }}>
              <Ionicons name="cloud-download-outline" size={20} color="#16a34a" />
              <View style={{ flex: 1 }}>
                <Text style={matStyles.menuItemTitle}>Importieren</Text>
                <Text style={matStyles.menuItemSub}>JSON-Datei auswählen</Text>
              </View>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ===== Zentrale Preis-Anpassung Modal ===== */}
      <Modal visible={priceModalVisible} transparent animationType="fade" onRequestClose={() => setPriceModalVisible(false)}>
        <View style={styles.filterOverlay}>
          <View style={styles.filterSheet}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text style={styles.modalTitle}>💰 Preise anpassen</Text>
              <TouchableOpacity onPress={() => setPriceModalVisible(false)}>
                <Ionicons name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>
            <Text style={{ fontSize: 13, color: '#64748b', marginBottom: 12 }}>
              {priceScopeIds
                ? `${priceScopeIds.length} ausgewählte(s) Material(ien)`
                : `Alle ${materials.length} Material(ien)`} werden angepasst.
            </Text>

            <Text style={styles.label}>Prozentsatz (%)</Text>
            <TextInput
              style={styles.input}
              value={pricePercentStr}
              onChangeText={setPricePercentStr}
              placeholder="z.B. 5 (Erhöhung) oder -3 (Senkung)"
              keyboardType="numbers-and-punctuation"
              autoFocus
            />
            <View style={{ flexDirection: 'row', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
              {['3', '5', '10', '15', '-5'].map(p => (
                <TouchableOpacity
                  key={p}
                  style={[styles.suggestChip, pricePercentStr === p && styles.suggestChipActive]}
                  onPress={() => setPricePercentStr(p)}
                >
                  <Text style={[styles.suggestChipText, pricePercentStr === p && styles.suggestChipTextActive]}>
                    {p.startsWith('-') ? '' : '+'}{p} %
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.label}>Welche Preise?</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {([
                { key: 'both', label: 'EK + VK' },
                { key: 'ek', label: 'Nur EK' },
                { key: 'vk', label: 'Nur VK' },
              ] as const).map(o => (
                <TouchableOpacity
                  key={o.key}
                  style={[styles.suggestChip, priceTarget === o.key && styles.suggestChipActive, { paddingHorizontal: 14, paddingVertical: 8 }]}
                  onPress={() => setPriceTarget(o.key)}
                >
                  <Text style={[styles.suggestChipText, priceTarget === o.key && styles.suggestChipTextActive]}>{o.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {(() => {
              const pct = pricePercentStr ? parseGermanNumber(pricePercentStr) : NaN;
              if (pct == null || isNaN(pct) || pct === 0) return null;
              const targetLabel = priceTarget === 'both' ? 'EK- und VK-Preise' : priceTarget === 'ek' ? 'EK-Preise' : 'VK-Preise';
              return (
                <Text style={{ fontSize: 12, color: pct > 0 ? '#16a34a' : '#ea580c', marginTop: 10, fontWeight: '600' }}>
                  → {targetLabel} werden um {formatGermanNumber(Math.abs(pct))} % {pct > 0 ? 'erhöht' : 'gesenkt'}. Materialien ohne Preis werden übersprungen.
                </Text>
              );
            })()}

            <View style={styles.modalActions}>
              <TouchableOpacity style={[styles.modalBtn, styles.cancelBtn]} onPress={() => setPriceModalVisible(false)}>
                <Text style={styles.cancelBtnText}>Abbrechen</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalBtn, { backgroundColor: '#7c3aed' }]} onPress={applyPriceAdjust}>
                <Ionicons name="checkmark" size={18} color="#fff" />
                <Text style={styles.saveBtnText}>Anwenden</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ===== Filter Menu Modal ===== */}
      <Modal visible={!!showFilterMenu} transparent animationType="fade" onRequestClose={() => setShowFilterMenu(null)}>
        <TouchableOpacity style={styles.filterOverlay} onPress={() => setShowFilterMenu(null)} activeOpacity={1}>
          <View style={styles.filterSheet}>
            <Text style={styles.modalTitle}>{showFilterMenu === 'cat' ? 'Kategorie wählen' : 'Lagerort wählen'}</Text>
            <ScrollView style={{ maxHeight: 360 }}>
              <TouchableOpacity style={styles.filterOpt} onPress={() => { if (showFilterMenu === 'cat') setFilterCategory(''); else setFilterLocation(''); setShowFilterMenu(null); }}>
                <Text style={styles.filterOptText}>Alle anzeigen</Text>
              </TouchableOpacity>
              {(showFilterMenu === 'cat' ? metrics.categories : metrics.locations).map(c => (
                <TouchableOpacity key={c} style={styles.filterOpt} onPress={() => { if (showFilterMenu === 'cat') setFilterCategory(c); else setFilterLocation(c); setShowFilterMenu(null); }}>
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
                <Text style={styles.modalTitle}>{editing ? 'Material bearbeiten' : 'Neues Material'}</Text>
                <TouchableOpacity onPress={() => setModalVisible(false)}><Ionicons name="close" size={26} color="#666" /></TouchableOpacity>
              </View>
              <ScrollView style={{ maxHeight: 560 }} keyboardShouldPersistTaps="handled">
                {/* Photo */}
                <View style={styles.photoRow}>
                  {form.photo ? (
                    <View style={styles.photoPreview}>
                      <Image source={{ uri: form.photo }} style={styles.photoPreviewImg} />
                      <TouchableOpacity style={styles.photoRemove} onPress={() => setForm({ ...form, photo: '' })}>
                        <Ionicons name="close-circle" size={24} color="#fff" />
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <View style={styles.photoPlaceholderBig}>
                      <Ionicons name="image-outline" size={32} color="#94a3b8" />
                    </View>
                  )}
                  <View style={{ flex: 1, gap: 6 }}>
                    <TouchableOpacity style={styles.photoBtn} onPress={() => handlePickPhoto('camera')}>
                      <Ionicons name="camera" size={16} color="#1976d2" />
                      <Text style={styles.photoBtnText}>Foto aufnehmen</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.photoBtn} onPress={() => handlePickPhoto('library')}>
                      <Ionicons name="images" size={16} color="#1976d2" />
                      <Text style={styles.photoBtnText}>Aus Galerie</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                <Text style={styles.label}>Bezeichnung *</Text>
                <TextInput style={styles.input} value={form.name || ''} onChangeText={(v) => setForm({ ...form, name: v })} placeholder="z.B. Dachziegel rot" />

                <Text style={styles.label}>Einheit *</Text>
                <View style={styles.chipRow}>
                  {UNIT_OPTIONS.map(u => (
                    <TouchableOpacity key={u} style={[styles.chip, form.unit === u && styles.chipActive]} onPress={() => setForm({ ...form, unit: u })}>
                      <Text style={[styles.chipText, form.unit === u && styles.chipTextActive]}>{u}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <TextInput style={styles.input} value={form.unit || ''} onChangeText={(v) => setForm({ ...form, unit: v })} placeholder="oder eigene Einheit" />

                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.label}>Bestand</Text>
                    <TextInput
                      style={styles.input}
                      value={numStr.stock ?? ''}
                      onChangeText={(v) => {
                        setNumStr(prev => ({ ...prev, stock: v }));
                        setForm({ ...form, stock_quantity: parseGermanNumber(v) });
                      }}
                      placeholder="0"
                      keyboardType="numbers-and-punctuation"
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.label}>Mindest-Bestand</Text>
                    <TextInput
                      style={styles.input}
                      value={numStr.threshold ?? ''}
                      onChangeText={(v) => {
                        setNumStr(prev => ({ ...prev, threshold: v }));
                        setForm({ ...form, low_stock_threshold: parseGermanNumber(v) });
                      }}
                      placeholder="0 = aus"
                      keyboardType="numbers-and-punctuation"
                    />
                  </View>
                </View>

                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.label}>Standard-Menge</Text>
                    <TextInput
                      style={styles.input}
                      value={numStr.defaultQty ?? ''}
                      onChangeText={(v) => {
                        setNumStr(prev => ({ ...prev, defaultQty: v }));
                        setForm({ ...form, default_quantity: v ? parseGermanNumber(v) : undefined });
                      }}
                      placeholder="1"
                      keyboardType="numbers-and-punctuation"
                    />
                  </View>
                  <View style={{ flex: 1 }} />
                </View>

                {/* ===== Preise: EK / Aufschlag / VK ===== */}
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.label}>EK-Preis (€/Einh.)</Text>
                    <TextInput
                      style={styles.input}
                      value={numStr.ek ?? ''}
                      onChangeText={(v) => {
                        const ek = v ? parseGermanNumber(v) : undefined;
                        const markup = numStr.markup ? parseGermanNumber(numStr.markup) : undefined;
                        if (ek != null && !isNaN(ek) && markup != null && !isNaN(markup)) {
                          const vk = Math.round(ek * (1 + markup / 100) * 100) / 100;
                          setNumStr(prev => ({ ...prev, ek: v, price: formatGermanNumber(vk) }));
                          setForm({ ...form, purchase_price: ek, price_per_unit: vk });
                        } else {
                          setNumStr(prev => ({ ...prev, ek: v }));
                          setForm({ ...form, purchase_price: ek });
                        }
                      }}
                      placeholder="0,00"
                      keyboardType="numbers-and-punctuation"
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.label}>Aufschlag (%)</Text>
                    <TextInput
                      style={styles.input}
                      value={numStr.markup ?? ''}
                      onChangeText={(v) => {
                        const markup = v ? parseGermanNumber(v) : undefined;
                        const ek = numStr.ek ? parseGermanNumber(numStr.ek) : undefined;
                        if (ek != null && !isNaN(ek) && markup != null && !isNaN(markup)) {
                          const vk = Math.round(ek * (1 + markup / 100) * 100) / 100;
                          setNumStr(prev => ({ ...prev, markup: v, price: formatGermanNumber(vk) }));
                          setForm({ ...form, markup_percent: markup, price_per_unit: vk });
                        } else {
                          setNumStr(prev => ({ ...prev, markup: v }));
                          setForm({ ...form, markup_percent: markup });
                        }
                      }}
                      placeholder="z.B. 15"
                      keyboardType="numbers-and-punctuation"
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.label}>VK-Preis (€/Einh.)</Text>
                    <TextInput
                      style={styles.input}
                      value={numStr.price ?? ''}
                      onChangeText={(v) => {
                        setNumStr(prev => ({ ...prev, price: v }));
                        setForm({ ...form, price_per_unit: v ? parseGermanNumber(v) : undefined });
                      }}
                      placeholder="0,00"
                      keyboardType="numbers-and-punctuation"
                    />
                  </View>
                </View>
                <Text style={styles.priceHint}>
                  💡 VK wird automatisch aus EK + Aufschlag berechnet, kann aber manuell überschrieben werden. Der VK-Preis wird in der Kostenberechnung verwendet.
                </Text>

                <Text style={styles.label}>Kategorie</Text>
                {(() => {
                  // Gespeicherte + aus Materialien abgeleitete Kategorien zusammenführen
                  const seen = new Map<string, string>();
                  savedCategories.forEach(c => { seen.set(c.name.toLowerCase(), c.name); });
                  metrics.categories.forEach(c => { if (!seen.has(c.toLowerCase())) seen.set(c.toLowerCase(), c); });
                  const allCats = Array.from(seen.values()).sort((a, b) => a.localeCompare(b, 'de'));
                  if (allCats.length === 0) return null;
                  return (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.suggestRow} contentContainerStyle={styles.suggestRowContent}>
                      {allCats.map(c => {
                        const isActive = (form.category || '').toLowerCase() === c.toLowerCase();
                        return (
                          <View key={c} style={[styles.suggestChip, isActive && styles.suggestChipActive, { flexDirection: 'row', alignItems: 'center', paddingRight: 4 }]}>
                            <TouchableOpacity
                              onPress={() => setForm({ ...form, category: c })}
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
                <TextInput style={styles.input} value={form.category || ''} onChangeText={(v) => setForm({ ...form, category: v })} placeholder="Eigene Kategorie eingeben (z.B. Dachziegel, Holz)" />
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: -4, marginBottom: 8 }}>
                  <TouchableOpacity
                    onPress={async () => {
                      const v = (form.category || '').trim();
                      if (!v) {
                        Alert.alert('Hinweis', 'Bitte zuerst eine Bezeichnung eingeben.');
                        return;
                      }
                      await MaterialCategoryService.add(v);
                      const cats = await MaterialCategoryService.getAll();
                      setSavedCategories(cats);
                      Alert.alert('Gespeichert', `Kategorie "${v}" wurde hinzugefügt.`);
                    }}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 6, paddingHorizontal: 10, backgroundColor: '#dbeafe', borderRadius: 8 }}
                  >
                    <Ionicons name="bookmark-outline" size={14} color="#1976d2" />
                    <Text style={{ color: '#1976d2', fontSize: 12, fontWeight: '600' }}>Als Kategorie speichern</Text>
                  </TouchableOpacity>
                </View>

                <Text style={styles.label}>Lagerort</Text>
                {(() => {
                  const seen = new Map<string, string>();
                  savedLocations.forEach(c => { seen.set(c.name.toLowerCase(), c.name); });
                  metrics.locations.forEach(c => { if (!seen.has(c.toLowerCase())) seen.set(c.toLowerCase(), c); });
                  const allLocs = Array.from(seen.values()).sort((a, b) => a.localeCompare(b, 'de'));
                  if (allLocs.length === 0) return null;
                  return (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.suggestRow} contentContainerStyle={styles.suggestRowContent}>
                      {allLocs.map(c => {
                        const isActive = (form.storage_location || '').toLowerCase() === c.toLowerCase();
                        return (
                          <View key={c} style={[styles.suggestChip, isActive && styles.suggestChipActive, { flexDirection: 'row', alignItems: 'center', paddingRight: 4 }]}>
                            <TouchableOpacity onPress={() => setForm({ ...form, storage_location: c })} style={{ paddingVertical: 2 }}>
                              <Text style={[styles.suggestChipText, isActive && styles.suggestChipTextActive]}>{c}</Text>
                            </TouchableOpacity>
                            <TouchableOpacity onPress={() => deleteLocation(c)} hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }} style={{ marginLeft: 6, paddingHorizontal: 4 }}>
                              <Ionicons name="close-circle" size={16} color={isActive ? '#fff' : '#94a3b8'} />
                            </TouchableOpacity>
                          </View>
                        );
                      })}
                    </ScrollView>
                  );
                })()}
                <TextInput style={styles.input} value={form.storage_location || ''} onChangeText={(v) => setForm({ ...form, storage_location: v })} placeholder="Eigenen Lagerort eingeben (z.B. Regal 01-02, Werkstatt)" />
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: -4, marginBottom: 8 }}>
                  <TouchableOpacity
                    onPress={async () => {
                      const v = (form.storage_location || '').trim();
                      if (!v) { Alert.alert('Hinweis', 'Bitte zuerst einen Lagerort eingeben.'); return; }
                      await MaterialLocationService.add(v);
                      const locs = await MaterialLocationService.getAll();
                      setSavedLocations(locs);
                      Alert.alert('Gespeichert', `Lagerort "${v}" wurde hinzugefügt.`);
                    }}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 6, paddingHorizontal: 10, backgroundColor: '#dbeafe', borderRadius: 8 }}
                  >
                    <Ionicons name="bookmark-outline" size={14} color="#1976d2" />
                    <Text style={{ color: '#1976d2', fontSize: 12, fontWeight: '600' }}>Als Lagerort speichern</Text>
                  </TouchableOpacity>
                </View>

                <Text style={styles.label}>Lieferant</Text>
                {(() => {
                  const seen = new Map<string, string>();
                  savedSuppliers.forEach(c => { seen.set(c.name.toLowerCase(), c.name); });
                  materials.forEach(mm => { if (mm.supplier && !seen.has(mm.supplier.toLowerCase())) seen.set(mm.supplier.toLowerCase(), mm.supplier); });
                  const allSups = Array.from(seen.values()).sort((a, b) => a.localeCompare(b, 'de'));
                  if (allSups.length === 0) return null;
                  return (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.suggestRow} contentContainerStyle={styles.suggestRowContent}>
                      {allSups.map(c => {
                        const isActive = (form.supplier || '').toLowerCase() === c.toLowerCase();
                        return (
                          <View key={c} style={[styles.suggestChip, isActive && styles.suggestChipActive, { flexDirection: 'row', alignItems: 'center', paddingRight: 4 }]}>
                            <TouchableOpacity onPress={() => setForm({ ...form, supplier: c })} style={{ paddingVertical: 2 }}>
                              <Text style={[styles.suggestChipText, isActive && styles.suggestChipTextActive]}>{c}</Text>
                            </TouchableOpacity>
                            <TouchableOpacity onPress={() => deleteSupplier(c)} hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }} style={{ marginLeft: 6, paddingHorizontal: 4 }}>
                              <Ionicons name="close-circle" size={16} color={isActive ? '#fff' : '#94a3b8'} />
                            </TouchableOpacity>
                          </View>
                        );
                      })}
                    </ScrollView>
                  );
                })()}
                <TextInput style={styles.input} value={form.supplier || ''} onChangeText={(v) => setForm({ ...form, supplier: v })} placeholder="Lieferantenname" />
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: -4, marginBottom: 8 }}>
                  <TouchableOpacity
                    onPress={async () => {
                      const v = (form.supplier || '').trim();
                      if (!v) { Alert.alert('Hinweis', 'Bitte zuerst einen Lieferanten eingeben.'); return; }
                      await MaterialSupplierService.add(v);
                      const sups = await MaterialSupplierService.getAll();
                      setSavedSuppliers(sups);
                      Alert.alert('Gespeichert', `Lieferant "${v}" wurde hinzugefügt.`);
                    }}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 6, paddingHorizontal: 10, backgroundColor: '#dbeafe', borderRadius: 8 }}
                  >
                    <Ionicons name="bookmark-outline" size={14} color="#1976d2" />
                    <Text style={{ color: '#1976d2', fontSize: 12, fontWeight: '600' }}>Als Lieferant speichern</Text>
                  </TouchableOpacity>
                </View>

                <Text style={styles.label}>Artikel-Nr.</Text>
                <TextInput style={styles.input} value={form.article_number || ''} onChangeText={(v) => setForm({ ...form, article_number: v })} placeholder="Artikel-Nummer" />

                <Text style={styles.label}>Bemerkung</Text>
                <TextInput style={[styles.input, { minHeight: 60, textAlignVertical: 'top' }]} value={form.note || ''} onChangeText={(v) => setForm({ ...form, note: v })} placeholder="Zusatzinfo" multiline />

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

const MetricCard: React.FC<{ icon: any; color: string; bg: string; label: string; value: number; sub: string; highlight?: boolean }> = ({ icon, color, bg, label, value, sub, highlight }) => (
  <View style={[styles.metricCard, highlight && { borderColor: '#ea580c', borderWidth: 1.5 }]}>
    <View style={[styles.metricIcon, { backgroundColor: bg }]}>
      <Ionicons name={icon} size={16} color={color} />
    </View>
    <Text style={styles.metricLabel}>{label}</Text>
    <Text style={[styles.metricValue, highlight && { color: '#ea580c' }]}>{value}</Text>
    {sub ? <Text style={styles.metricSub}>{sub}</Text> : null}
  </View>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9' },
  scroll: { flex: 1 },
  // Metrics
  metricsRow: { flexDirection: 'row', gap: 6, paddingHorizontal: 10, paddingTop: 10, paddingBottom: 4 },
  metricCard: {
    flex: 1, backgroundColor: '#fff', borderRadius: 10,
    padding: 8, alignItems: 'flex-start',
    borderWidth: 1, borderColor: '#e2e8f0',
  },
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
  filterRow: { flexDirection: 'row', gap: 6, marginBottom: 8 },
  filterChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0' },
  filterChipActive: { backgroundColor: '#1976d2', borderColor: '#1976d2' },
  filterChipText: { fontSize: 11, color: '#475569', fontWeight: '600' },
  // Material Card
  matCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', padding: 10, borderRadius: 12, marginBottom: 6, borderWidth: 1, borderColor: '#e2e8f0', gap: 8 },
  matPhoto: { width: 48, height: 48, borderRadius: 8, backgroundColor: '#f1f5f9' },
  matPhotoPlaceholder: { width: 48, height: 48, borderRadius: 8, backgroundColor: '#fef3c7', alignItems: 'center', justifyContent: 'center' },
  matName: { fontWeight: '700', color: '#0f172a', fontSize: 14, flex: 1 },
  matMetaSub: { fontSize: 10, color: '#94a3b8' },
  matMetaTag: { fontSize: 10, color: '#475569', backgroundColor: '#f1f5f9', paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4 },
  lowBadge: { flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: '#ea580c', paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4 },
  lowBadgeText: { fontSize: 8, color: '#fff', fontWeight: '700' },
  stockBlock: { alignItems: 'center', minWidth: 60 },
  stockNumber: { fontSize: 18, fontWeight: '800', color: '#0f172a' },
  stockUnit: { fontSize: 9, color: '#94a3b8' },
  stockControls: { flexDirection: 'row', gap: 2, marginTop: 2 },
  stockBtn: { width: 22, height: 22, borderRadius: 4, backgroundColor: '#eff6ff', alignItems: 'center', justifyContent: 'center' },
  delBtn: { padding: 6 },
  // Empty
  empty: { alignItems: 'center', padding: 30, color: '#94a3b8' },
  emptyText: { color: '#94a3b8', fontWeight: '600', marginTop: 8 },
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
  priceHint: { fontSize: 11, color: '#64748b', marginTop: 6, marginBottom: 4, lineHeight: 15 },
  input: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 10, fontSize: 14 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  chip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14, backgroundColor: '#f3f4f6' },
  chipActive: { backgroundColor: '#1976d2' },
  chipText: { fontSize: 12, color: '#374151', fontWeight: '600' },
  chipTextActive: { color: '#fff' },
  // Suggest Chips (Auto-Vorschlag aus bestehenden Werten)
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
  // Photo row in modal
  photoRow: { flexDirection: 'row', gap: 10, alignItems: 'center', paddingVertical: 6 },
  photoPreview: { width: 80, height: 80, borderRadius: 8, overflow: 'hidden', position: 'relative' },
  photoPreviewImg: { width: 80, height: 80, backgroundColor: '#f1f5f9' },
  photoRemove: { position: 'absolute', top: 2, right: 2, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 12 },
  photoPlaceholderBig: { width: 80, height: 80, borderRadius: 8, backgroundColor: '#f1f5f9', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#e2e8f0', borderStyle: 'dashed' },
  photoBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#eff6ff', paddingHorizontal: 10, paddingVertical: 8, borderRadius: 8 },
  photoBtnText: { fontSize: 12, color: '#1976d2', fontWeight: '600' },
});

const matStyles = StyleSheet.create({
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

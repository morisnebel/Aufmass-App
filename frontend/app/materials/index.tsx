import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  Alert, Modal, KeyboardAvoidingView, Platform, Switch, Image,
} from 'react-native';
import { useFocusEffect, useNavigation } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { MaterialMasterService, MaterialMaster } from '../../services/LocalStorage';

const UNIT_OPTIONS = ['Stk', 'm', 'm²', 'm³', 'kg', 'L', 'Pck', 'Pal', 'h', 't', 'Rolle', 'Paar'];

type TabKey = 'materials' | 'categories' | 'locations' | 'suppliers';

const EMPTY: Partial<MaterialMaster> = {
  name: '', unit: 'Stk', default_quantity: 1, category: '', price_per_unit: undefined,
  supplier: '', article_number: '', note: '', photo: '',
  stock_quantity: 0, low_stock_threshold: 0, storage_location: '',
  active: true,
};

export default function MaterialsIndex() {
  const navigation = useNavigation();
  const [materials, setMaterials] = useState<MaterialMaster[]>([]);
  const [tab, setTab] = useState<TabKey>('materials');
  const [modalVisible, setModalVisible] = useState(false);
  const [editing, setEditing] = useState<MaterialMaster | null>(null);
  const [form, setForm] = useState<Partial<MaterialMaster>>(EMPTY);
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('');
  const [filterLocation, setFilterLocation] = useState<string>('');
  const [showFilterMenu, setShowFilterMenu] = useState<null | 'cat' | 'loc'>(null);

  React.useEffect(() => {
    navigation.setOptions({
      title: 'Material-Verwaltung',
      headerStyle: { backgroundColor: '#1976d2' },
      headerTintColor: '#fff',
    });
  }, [navigation]);

  const load = useCallback(async () => {
    const all = await MaterialMasterService.getAll();
    setMaterials(all);
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

  const openCreate = () => { setEditing(null); setForm({ ...EMPTY }); setModalVisible(true); };
  const openEdit = (m: MaterialMaster) => { setEditing(m); setForm({ ...m }); setModalVisible(true); };

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
      setModalVisible(false);
      await load();
    } catch (e) {
      console.error(e);
      Alert.alert('Fehler', 'Speichern fehlgeschlagen.');
    }
  };

  const handleDelete = (m: MaterialMaster) => {
    Alert.alert('Material löschen', `${m.name} wirklich löschen?`, [
      { text: 'Abbrechen', style: 'cancel' },
      { text: 'Löschen', style: 'destructive', onPress: async () => { await MaterialMasterService.delete(m.id); await load(); } },
    ]);
  };

  // Bestand anpassen (+/-)
  const adjustStock = async (m: MaterialMaster, delta: number) => {
    const newStock = Math.max(0, (m.stock_quantity ?? 0) + delta);
    await MaterialMasterService.update(m.id, { stock_quantity: newStock });
    await load();
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
                return (
                  <TouchableOpacity key={m.id} style={styles.matCard} onPress={() => openEdit(m)}>
                    {m.photo ? (
                      <Image source={{ uri: m.photo }} style={styles.matPhoto} />
                    ) : (
                      <View style={styles.matPhotoPlaceholder}>
                        <Ionicons name="cube" size={22} color="#f59e0b" />
                      </View>
                    )}
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={[styles.matName, !m.active && { color: '#9ca3af' }]} numberOfLines={1}>{m.name}</Text>
                        {isLow && (
                          <View style={styles.lowBadge}>
                            <Ionicons name="warning" size={10} color="#fff" />
                            <Text style={styles.lowBadgeText}>NIEDRIG</Text>
                          </View>
                        )}
                      </View>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 2 }}>
                        {m.article_number ? <Text style={styles.matMetaSub}>Art.-Nr. {m.article_number}</Text> : null}
                        {m.category ? <Text style={styles.matMetaTag}>{m.category}</Text> : null}
                        {m.storage_location ? <Text style={styles.matMetaTag}>📍 {m.storage_location}</Text> : null}
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
                    <TouchableOpacity onPress={() => handleDelete(m)} style={styles.delBtn}>
                      <Ionicons name="trash-outline" size={18} color="#ef4444" />
                    </TouchableOpacity>
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
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ width: '100%' }}>
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
                    <TextInput style={styles.input} value={form.stock_quantity != null ? String(form.stock_quantity) : ''} onChangeText={(v) => setForm({ ...form, stock_quantity: v ? parseFloat(v) : 0 })} placeholder="0" keyboardType="decimal-pad" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.label}>Mindest-Bestand</Text>
                    <TextInput style={styles.input} value={form.low_stock_threshold != null ? String(form.low_stock_threshold) : ''} onChangeText={(v) => setForm({ ...form, low_stock_threshold: v ? parseFloat(v) : 0 })} placeholder="0 = aus" keyboardType="decimal-pad" />
                  </View>
                </View>

                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.label}>Standard-Menge</Text>
                    <TextInput style={styles.input} value={form.default_quantity != null ? String(form.default_quantity) : ''} onChangeText={(v) => setForm({ ...form, default_quantity: v ? parseFloat(v) : undefined })} placeholder="1" keyboardType="decimal-pad" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.label}>Preis (€/Einh.)</Text>
                    <TextInput style={styles.input} value={form.price_per_unit != null ? String(form.price_per_unit) : ''} onChangeText={(v) => setForm({ ...form, price_per_unit: v ? parseFloat(v) : undefined })} placeholder="0.00" keyboardType="decimal-pad" />
                  </View>
                </View>

                <Text style={styles.label}>Kategorie</Text>
                <TextInput style={styles.input} value={form.category || ''} onChangeText={(v) => setForm({ ...form, category: v })} placeholder="z.B. Dachziegel, Holz" />

                <Text style={styles.label}>Lagerort</Text>
                <TextInput style={styles.input} value={form.storage_location || ''} onChangeText={(v) => setForm({ ...form, storage_location: v })} placeholder="z.B. Regal 01-02, Werkstatt" />

                <Text style={styles.label}>Lieferant</Text>
                <TextInput style={styles.input} value={form.supplier || ''} onChangeText={(v) => setForm({ ...form, supplier: v })} placeholder="Lieferantenname" />

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
  input: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 10, fontSize: 14 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  chip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14, backgroundColor: '#f3f4f6' },
  chipActive: { backgroundColor: '#1976d2' },
  chipText: { fontSize: 12, color: '#374151', fontWeight: '600' },
  chipTextActive: { color: '#fff' },
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

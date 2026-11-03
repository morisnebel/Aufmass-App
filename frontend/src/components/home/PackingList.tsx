import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Ionicons from '@react-native-vector-icons/ionicons';
import { PackItem, PACKING_RECENT_KEY, PackTemplate, PackTemplates } from '../../../services/AppointmentService';
import { RenamePromptModal } from '../RenamePromptModal';

// Checkliste „Mitnehmen“ für einen Termin – mit Vorschlägen und zuletzt genutzten Einträgen
const DEFAULTS = ['Leiter', 'Zollstock', 'Laser-Entfernungsmesser', 'Tablet/Handy geladen', 'Werkzeugkoffer', 'Musterziegel', 'Kamera', 'Angebotsunterlagen', 'Schutzausrüstung'];
const newId = () => `pk_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

type Props = { items: PackItem[]; onChange: (items: PackItem[]) => void; onFocusInput?: () => void };

export function PackingList({ items, onChange, onFocusInput }: Props) {
  const [text, setText] = useState('');
  const [recent, setRecent] = useState<string[]>([]);
  const [templates, setTemplates] = useState<PackTemplate[]>([]);
  const [naming, setNaming] = useState(false);
  useEffect(() => {
    AsyncStorage.getItem(PACKING_RECENT_KEY).then(r => setRecent(r ? JSON.parse(r) : [])).catch(() => {});
    PackTemplates.getAll().then(setTemplates);
  }, []);

  // Vorlage übernehmen: fehlende Punkte ergänzen
  const applyTemplate = (tpl: PackTemplate) => {
    const have = new Set(items.map(i => i.text.toLowerCase()));
    const add = tpl.items.filter(t => !have.has(t.toLowerCase())).map(t => ({ id: newId(), text: t, done: false }));
    onChange([...items, ...add]);
  };
  const saveTemplate = (name: string) => {
    const n = name.trim();
    if (!n) { Alert.alert('Name fehlt', 'Bitte einen Namen für die Vorlage eingeben.'); return; }
    setNaming(false);
    if (!items.length) return;
    const existing = templates.find(t => t.name.toLowerCase() === n.toLowerCase());
    const tpl: PackTemplate = { id: existing?.id || `tpl_${Date.now()}`, name: existing?.name || n, items: items.map(i => i.text) };
    const next = existing ? templates.map(t => (t.id === tpl.id ? tpl : t)) : [...templates, tpl];
    setTemplates(next);
    PackTemplates.saveAll(next).catch(() => {});
    Alert.alert('Vorlage gespeichert', `„${n}“ mit ${tpl.items.length} Punkten.`);
  };
  const deleteTemplate = (tpl: PackTemplate) => Alert.alert('Vorlage löschen?', `„${tpl.name}“ wird entfernt.`, [
    { text: 'Abbrechen', style: 'cancel' },
    { text: 'Löschen', style: 'destructive', onPress: () => { const next = templates.filter(t => t.id !== tpl.id); setTemplates(next); PackTemplates.saveAll(next).catch(() => {}); } },
  ]);

  const add = (raw: string) => {
    const t = raw.trim();
    if (!t || items.some(i => i.text.toLowerCase() === t.toLowerCase())) { setText(''); return; }
    onChange([...items, { id: newId(), text: t, done: false }]);
    setText('');
    // Eigene Einträge als Vorschlag merken
    if (!DEFAULTS.some(d => d.toLowerCase() === t.toLowerCase())) {
      const next = [t, ...recent.filter(r => r.toLowerCase() !== t.toLowerCase())].slice(0, 12);
      setRecent(next);
      AsyncStorage.setItem(PACKING_RECENT_KEY, JSON.stringify(next)).catch(() => {});
    }
  };
  const toggle = (id: string) => onChange(items.map(i => (i.id === id ? { ...i, done: !i.done } : i)));
  const remove = (id: string) => onChange(items.filter(i => i.id !== id));

  const have = new Set(items.map(i => i.text.toLowerCase()));
  const suggestions = [...recent, ...DEFAULTS].filter((v, idx, arr) => !have.has(v.toLowerCase()) && arr.findIndex(x => x.toLowerCase() === v.toLowerCase()) === idx);
  const done = items.filter(i => i.done).length;

  return (
    <View testID="apt-packing">
      <View style={s.head}>
        <Ionicons name="bag-check-outline" size={16} color="#475569" />
        <Text style={s.label}>Mitnehmen</Text>
        {items.length > 0 && <Text testID="apt-packing-count" style={s.count}>{done}/{items.length} eingepackt</Text>}
      </View>
      {templates.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 6, paddingBottom: 6 }}>
          {templates.map(t => (
            <TouchableOpacity key={t.id} testID={`apt-pack-tpl-${t.name}`} style={s.tpl} onPress={() => applyTemplate(t)} onLongPress={() => deleteTemplate(t)} delayLongPress={500}>
              <Ionicons name="list-outline" size={15} color="#7c3aed" />
              <Text style={s.tplText}>{t.name}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
      {items.map(i => (
        <View key={i.id} style={s.item}>
          <TouchableOpacity testID={`apt-pack-toggle-${i.text}`} style={s.check} onPress={() => toggle(i.id)} hitSlop={6}>
            <Ionicons name={i.done ? 'checkbox' : 'square-outline'} size={24} color={i.done ? '#16a34a' : '#64748b'} />
            <Text style={[s.itemText, i.done && s.itemDone]}>{i.text}</Text>
          </TouchableOpacity>
          <TouchableOpacity testID={`apt-pack-remove-${i.text}`} onPress={() => remove(i.id)} style={s.del} hitSlop={6}>
            <Ionicons name="close" size={20} color="#94a3b8" />
          </TouchableOpacity>
        </View>
      ))}
      <View style={s.addRow}>
        <TextInput
          testID="apt-pack-input"
          style={s.input}
          value={text}
          onChangeText={setText}
          onFocus={onFocusInput}
          onSubmitEditing={() => add(text)}
          returnKeyType="done"
          blurOnSubmit={false}
          placeholder="z. B. Leiter, Zollstock…"
          placeholderTextColor="#94a3b8"
        />
        <TouchableOpacity testID="apt-pack-add" style={s.addBtn} onPress={() => add(text)}>
          <Ionicons name="add" size={22} color="#fff" />
        </TouchableOpacity>
      </View>
      {suggestions.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 6, paddingTop: 8 }}>
          {suggestions.slice(0, 14).map(sg => (
            <TouchableOpacity key={sg} testID={`apt-pack-suggest-${sg}`} style={s.chip} onPress={() => add(sg)}>
              <Ionicons name="add" size={14} color="#1976d2" />
              <Text style={s.chipText}>{sg}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
      {items.length > 0 && (
        <TouchableOpacity testID="apt-pack-save-tpl" style={s.saveTpl} onPress={() => setNaming(true)}>
          <Ionicons name="bookmark-outline" size={16} color="#7c3aed" />
          <Text style={s.saveTplText}>Liste als Vorlage speichern</Text>
        </TouchableOpacity>
      )}
      <RenamePromptModal
        visible={naming}
        title="Vorlage speichern"
        message="Name der Mitnehmen-Vorlage, z. B. „Dach-Aufmaß“. Gleicher Name überschreibt die Vorlage."
        defaultValue=""
        onCancel={() => setNaming(false)}
        onSubmit={saveTemplate}
      />
    </View>
  );
}

const s = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 14, marginBottom: 6 },
  label: { fontSize: 13, fontWeight: '700', color: '#475569', flex: 1 },
  count: { fontSize: 12, fontWeight: '700', color: '#16a34a' },
  item: { flexDirection: 'row', alignItems: 'center', minHeight: 44, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  check: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 },
  itemText: { fontSize: 15, color: '#0f172a', flex: 1 },
  itemDone: { color: '#94a3b8', textDecorationLine: 'line-through' },
  del: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  addRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  input: { flex: 1, minWidth: 0, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 10, minHeight: 44, paddingHorizontal: 12, fontSize: 15, color: '#0f172a' },
  addBtn: { width: 44, height: 44, borderRadius: 10, backgroundColor: '#1976d2', alignItems: 'center', justifyContent: 'center' },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 2, minHeight: 44, paddingHorizontal: 12, borderRadius: 22, backgroundColor: '#eff6ff' },
  chipText: { fontSize: 13, color: '#1976d2', fontWeight: '600' },
  tpl: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 44, paddingHorizontal: 12, borderRadius: 22, backgroundColor: '#f3e8ff' },
  tplText: { fontSize: 13, color: '#6d28d9', fontWeight: '700' },
  saveTpl: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', minHeight: 44, marginTop: 4 },
  saveTplText: { fontSize: 13, color: '#7c3aed', fontWeight: '700' },
});

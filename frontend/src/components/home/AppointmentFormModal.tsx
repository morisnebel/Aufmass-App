import React, { useEffect, useMemo, useState } from 'react';
import { Modal, View, Text, TextInput, TouchableOpacity, ScrollView, KeyboardAvoidingView, Platform, Alert, StyleSheet } from 'react-native';
import Ionicons from '@react-native-vector-icons/ionicons';
import { Project, Customer, generateFullAddress } from '../../../services/LocalStorage';
import { Appointment, AppointmentService } from '../../../services/AppointmentService';
import { scheduleDepartureReminder, cancelReminder, departureTime } from '../../utils/appointmentTools';
import { todayKey } from './TodayOverview';

const TRAVEL_OPTIONS = [0, 15, 30, 45, 60, 90];
const toDisplay = (k: string) => { const [y, m, d] = k.split('-'); return `${d}.${m}.${y}`; };
const parseDate = (t: string): string | null => {
  const m = t.trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{2}|\d{4})$/);
  if (!m) return null;
  const y = Number(m[3].length === 2 ? '20' + m[3] : m[3]);
  const d = new Date(y, Number(m[2]) - 1, Number(m[1]));
  if (d.getDate() !== Number(m[1]) || d.getMonth() !== Number(m[2]) - 1) return null;
  return todayKey(d);
};
export const projectAddress = (p?: Project, c?: Customer) =>
  (p?.address || '').trim() || (c ? generateFullAddress(c.street, c.zip, c.city) || c.address || '' : '');

type Props = {
  visible: boolean;
  initial: Appointment | null;
  projects: Project[];
  customers: Record<string, Customer>;
  onClose: () => void;
  onSaved: () => void;
};

// Termin direkt von der Startseite anlegen/bearbeiten – mit Notiz, Navi-Adresse und Abfahrts-Erinnerung
export function AppointmentFormModal({ visible, initial, projects, customers, onClose, onSaved }: Props) {
  const [projectId, setProjectId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [dateText, setDateText] = useState('');
  const [time, setTime] = useState('');
  const [address, setAddress] = useState('');
  const [note, setNote] = useState('');
  const [travel, setTravel] = useState(0);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setProjectId(initial?.project_id || null);
    setTitle(initial?.title || '');
    setDateText(toDisplay(initial?.date || todayKey()));
    setTime(initial?.time || '');
    setAddress(initial?.address || '');
    setNote(initial?.note || '');
    setTravel(initial?.travel_minutes || 0);
  }, [visible, initial]);

  const projectChoices = useMemo(
    () => [...projects].sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || '')).slice(0, 30),
    [projects]
  );

  const pickProject = (p: Project | null) => {
    setProjectId(p?.id || null);
    if (p) {
      if (!title.trim() || projects.some(x => x.name === title)) setTitle(p.name);
      const addr = projectAddress(p, customers[p.customer_id]);
      if (addr) setAddress(addr);
    }
  };

  const quickDate = (days: number) => { const d = new Date(); d.setDate(d.getDate() + days); setDateText(toDisplay(todayKey(d))); };

  const tm = time.trim().match(/^(\d{1,2}):(\d{2})$/);
  const validTime = !time.trim() || (!!tm && Number(tm[1]) < 24 && Number(tm[2]) < 60);
  const normTime = tm ? `${tm[1].padStart(2, '0')}:${tm[2]}` : null;
  const date = parseDate(dateText);
  const departure = date && normTime && travel > 0 ? departureTime(date, normTime, travel) : null;

  const save = async () => {
    if (!title.trim()) { Alert.alert('Titel fehlt', 'Bitte einen Titel eingeben oder ein Projekt wählen.'); return; }
    if (!date) { Alert.alert('Ungültiges Datum', 'Bitte im Format TT.MM.JJJJ eingeben, z. B. 05.11.2026.'); return; }
    if (!validTime) { Alert.alert('Ungültige Uhrzeit', 'Bitte als HH:MM eingeben, z. B. 08:30.'); return; }
    if (travel > 0 && !normTime) { Alert.alert('Uhrzeit fehlt', 'Für die Abfahrts-Erinnerung brauche ich die Uhrzeit des Termins.'); return; }
    setSaving(true);
    try {
      await cancelReminder(initial?.reminder_id);
      const reminderId = travel > 0 && normTime
        ? await scheduleDepartureReminder({ title: title.trim(), date, time: normTime, travelMinutes: travel, address: address.trim() })
        : null;
      await AppointmentService.save({
        id: initial?.id, title: title.trim(), date, time: normTime, project_id: projectId,
        address: address.trim(), note: note.trim(), travel_minutes: travel || null, reminder_id: reminderId,
      });
      if (travel > 0 && !reminderId && Platform.OS !== 'web' && departure && departure.getTime() <= Date.now()) {
        Alert.alert('Termin gespeichert', 'Die Abfahrtszeit liegt schon in der Vergangenheit – es wurde keine Erinnerung geplant.');
      }
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  const remove = () => {
    if (!initial) return;
    Alert.alert('Termin löschen?', initial.title, [
      { text: 'Abbrechen', style: 'cancel' },
      { text: 'Löschen', style: 'destructive', onPress: async () => { await cancelReminder(initial.reminder_id); await AppointmentService.remove(initial.id); onSaved(); } },
    ]);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView style={s.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={s.sheet}>
          <View style={s.head}>
            <Text style={s.title}>{initial ? 'Termin bearbeiten' : 'Neuer Termin'}</Text>
            <TouchableOpacity testID="apt-close" onPress={onClose} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="close" size={26} color="#334155" /></TouchableOpacity>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 16 }}>
            <Text style={s.label}>Projekt (optional)</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} keyboardShouldPersistTaps="handled">
              <TouchableOpacity testID="apt-project-none" style={[s.chip, !projectId && s.chipOn]} onPress={() => pickProject(null)}>
                <Text style={[s.chipText, !projectId && s.chipTextOn]}>Ohne Projekt</Text>
              </TouchableOpacity>
              {projectChoices.map(p => (
                <TouchableOpacity key={p.id} testID={`apt-project-${p.id}`} style={[s.chip, projectId === p.id && s.chipOn]} onPress={() => pickProject(p)}>
                  <Text style={[s.chipText, projectId === p.id && s.chipTextOn]} numberOfLines={1}>{p.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Text style={s.label}>Titel</Text>
            <TextInput testID="apt-title" style={s.input} value={title} onChangeText={setTitle} placeholder="z. B. Aufmaß Dach Müller" />

            <Text style={s.label}>Datum</Text>
            <View style={s.row}>
              {[['Heute', 0], ['Morgen', 1], ['Übermorgen', 2]].map(([l, n]) => (
                <TouchableOpacity key={l as string} testID={`apt-quick-${n}`} style={s.quick} onPress={() => quickDate(n as number)}>
                  <Text style={s.quickText}>{l as string}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={[s.row, { marginTop: 8 }]}>
              <TextInput testID="apt-date" style={[s.input, { flex: 1.4, minWidth: 0 }]} value={dateText} onChangeText={setDateText} placeholder="TT.MM.JJJJ" keyboardType="numbers-and-punctuation" />
              <TextInput testID="apt-time" style={[s.input, { flex: 1, minWidth: 0 }]} value={time} onChangeText={setTime} placeholder="08:30" keyboardType="numbers-and-punctuation" maxLength={5} />
            </View>

            <Text style={s.label}>Adresse fürs Navi</Text>
            <TextInput testID="apt-address" style={s.input} value={address} onChangeText={setAddress} placeholder="Straße, PLZ Ort" />

            <Text style={s.label}>Fahrzeit → Erinnerung zum Losfahren</Text>
            <View style={[s.row, { flexWrap: 'wrap' }]}>
              {TRAVEL_OPTIONS.map(m => (
                <TouchableOpacity key={m} testID={`apt-travel-${m}`} style={[s.chip, travel === m && s.chipOn]} onPress={() => setTravel(m)}>
                  <Text style={[s.chipText, travel === m && s.chipTextOn]}>{m === 0 ? 'Keine' : `${m} Min`}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {departure && (
              <Text testID="apt-departure-info" style={s.hint}>
                🔔 Erinnerung um {departure.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr (Fahrzeit + 10 Min Puffer)
                {Platform.OS === 'web' ? ' – Erinnerungen funktionieren nur in der App auf dem Handy.' : ''}
              </Text>
            )}

            <Text style={s.label}>Notiz</Text>
            <TextInput testID="apt-note" style={[s.input, { minHeight: 80, textAlignVertical: 'top', paddingTop: 10 }]} value={note} onChangeText={setNote} placeholder="z. B. Leiter mitnehmen, Kunde vorher anrufen" multiline />
          </ScrollView>
          <View style={s.btnRow}>
            {initial && (
              <TouchableOpacity testID="apt-delete" style={[s.btn, { backgroundColor: '#fdecec', flex: 0.6 }]} onPress={remove}>
                <Ionicons name="trash-outline" size={20} color="#dc2626" />
              </TouchableOpacity>
            )}
            <TouchableOpacity testID="apt-save" style={[s.btn, { backgroundColor: '#1976d2' }]} onPress={save} disabled={saving}>
              <Text style={s.btnText}>{saving ? 'Speichern…' : 'Termin speichern'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end', alignItems: 'center' },
  sheet: { width: '100%', maxWidth: 560, maxHeight: '92%', backgroundColor: '#fff', borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 18, paddingBottom: 28 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  title: { fontSize: 19, fontWeight: '800', color: '#0f172a' },
  label: { fontSize: 13, fontWeight: '700', color: '#475569', marginTop: 14, marginBottom: 6 },
  input: { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 10, minHeight: 48, paddingHorizontal: 12, fontSize: 16, color: '#0f172a' },
  row: { flexDirection: 'row', gap: 8 },
  chip: { minHeight: 40, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1, borderColor: '#cbd5e1', justifyContent: 'center', maxWidth: 200 },
  chipOn: { backgroundColor: '#1976d2', borderColor: '#1976d2' },
  chipText: { fontSize: 14, fontWeight: '600', color: '#334155' },
  chipTextOn: { color: '#fff' },
  quick: { flex: 1, minHeight: 44, borderRadius: 10, backgroundColor: '#f1f5f9', alignItems: 'center', justifyContent: 'center' },
  quickText: { fontSize: 14, fontWeight: '700', color: '#1e293b' },
  hint: { marginTop: 8, fontSize: 13, color: '#0369a1' },
  btnRow: { flexDirection: 'row', gap: 10, marginTop: 10 },
  btn: { flex: 1, minHeight: 50, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
});

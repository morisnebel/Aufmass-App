import React, { useState } from 'react';
import { Modal, View, Text, TouchableOpacity, TextInput, Platform, StyleSheet, Alert } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import Ionicons from '@react-native-vector-icons/ionicons';

// Termin eines Projekts (Datum YYYY-MM-DD + optionale Uhrzeit HH:MM) – für die Heute-Übersicht
const toKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const fromKey = (k?: string | null) => {
  if (!k) return new Date();
  const [y, m, d] = k.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
};
const pretty = (k: string) => fromKey(k).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', year: '2-digit' });

type Props = {
  date?: string | null;
  time?: string | null;
  onSave: (date: string | null, time: string | null) => void;
};

export function AppointmentPicker({ date, time, onSave }: Props) {
  const [open, setOpen] = useState(false);
  const [temp, setTemp] = useState<Date>(fromKey(date));
  const [tempTime, setTempTime] = useState(time || '');
  const [webText, setWebText] = useState('');
  const [showAndroid, setShowAndroid] = useState(false);

  const openModal = () => {
    setTemp(fromKey(date)); setTempTime(time || '');
    setWebText(date ? fromKey(date).toLocaleDateString('de-DE') : ''); setOpen(true);
  };
  const quick = (days: number) => { const d = new Date(); d.setDate(d.getDate() + days); setTemp(d); setWebText(d.toLocaleDateString('de-DE')); };
  const save = () => {
    let d = temp;
    if (Platform.OS === 'web' && webText.trim()) {
      const m = webText.trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{2}|\d{4})$/);
      const parsed = m ? new Date(Number(m[3].length === 2 ? '20' + m[3] : m[3]), Number(m[2]) - 1, Number(m[1])) : null;
      // Ungültige Daten (z. B. 31.02.) nicht stillschweigend umrechnen
      if (!parsed || parsed.getDate() !== Number(m![1]) || parsed.getMonth() !== Number(m![2]) - 1) {
        Alert.alert('Ungültiges Datum', 'Bitte im Format TT.MM.JJJJ eingeben, z. B. 05.11.2026.');
        return;
      }
      d = parsed;
    }
    const tm = tempTime.trim().match(/^(\d{1,2}):(\d{2})$/);
    if (tempTime.trim() && (!tm || Number(tm[1]) > 23 || Number(tm[2]) > 59)) {
      Alert.alert('Ungültige Uhrzeit', 'Bitte als HH:MM eingeben, z. B. 08:30.');
      return;
    }
    const t = tm ? `${tm[1].padStart(2, '0')}:${tm[2]}` : null;
    onSave(toKey(d), t);
    setOpen(false);
  };

  return (
    <>
      <TouchableOpacity testID="project-appointment" style={[s.chip, date && s.chipSet]} onPress={openModal}>
        <Ionicons name="alarm-outline" size={20} color={date ? '#dc2626' : '#999'} style={{ marginRight: 10 }} />
        <View style={{ flex: 1 }}>
          <Text style={s.chipLabel}>Termin</Text>
          <Text style={[s.chipValue, { color: date ? '#dc2626' : '#999' }]}>
            {date ? `${pretty(date)}${time ? `, ${time} Uhr` : ''}` : 'Kein Termin'}
          </Text>
        </View>
        <Ionicons name="calendar" size={18} color={date ? '#dc2626' : '#999'} />
      </TouchableOpacity>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={s.backdrop}>
          <View style={s.box}>
            <Text style={s.title}>Termin festlegen</Text>
            <View style={s.quickRow}>
              {[['Heute', 0], ['Morgen', 1], ['Übermorgen', 2]].map(([l, n]) => (
                <TouchableOpacity key={l as string} testID={`appointment-quick-${n}`} style={[s.quick, toKey(temp) === (() => { const d = new Date(); d.setDate(d.getDate() + (n as number)); return toKey(d); })() && s.quickActive]} onPress={() => quick(n as number)}>
                  <Text style={s.quickText}>{l as string}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {Platform.OS === 'web' ? (
              <TextInput testID="appointment-date-input" style={s.input} value={webText} onChangeText={setWebText} placeholder="TT.MM.JJJJ" />
            ) : Platform.OS === 'ios' ? (
              <DateTimePicker value={temp} mode="date" display="inline" locale="de-DE" themeVariant="light" accentColor="#1976d2"
                onChange={(_, d) => d && setTemp(d)} />
            ) : (
              <>
                <TouchableOpacity style={s.input} onPress={() => setShowAndroid(true)}>
                  <Text style={{ fontSize: 16, color: '#0f172a' }}>{temp.toLocaleDateString('de-DE')}</Text>
                </TouchableOpacity>
                {showAndroid && (
                  <DateTimePicker value={temp} mode="date" display="default"
                    onChange={(_, d) => { setShowAndroid(false); if (d) setTemp(d); }} />
                )}
              </>
            )}
            <Text style={s.label}>Uhrzeit (optional)</Text>
            <TextInput testID="appointment-time-input" style={s.input} value={tempTime} onChangeText={setTempTime} placeholder="z. B. 08:30" keyboardType="numbers-and-punctuation" maxLength={5} />
            <View style={s.btnRow}>
              {!!date && (
                <TouchableOpacity testID="appointment-clear" style={[s.btn, { backgroundColor: '#fdecec' }]} onPress={() => { onSave(null, null); setOpen(false); }}>
                  <Text style={[s.btnText, { color: '#dc2626' }]}>Entfernen</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={[s.btn, { backgroundColor: '#f1f5f9' }]} onPress={() => setOpen(false)}>
                <Text style={[s.btnText, { color: '#334155' }]}>Abbrechen</Text>
              </TouchableOpacity>
              <TouchableOpacity testID="appointment-save" style={[s.btn, { backgroundColor: '#1976d2' }]} onPress={save}>
                <Text style={[s.btnText, { color: '#fff' }]}>Speichern</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const s = StyleSheet.create({
  chip: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f5f5f5', borderWidth: 1.5, borderColor: '#ddd', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, marginTop: 10 },
  chipSet: { backgroundColor: '#fef2f2', borderColor: '#fca5a5' },
  chipLabel: { fontSize: 10, color: '#666', marginBottom: 2 },
  chipValue: { fontSize: 14, fontWeight: '600' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  box: { width: '100%', maxWidth: 400, backgroundColor: '#fff', borderRadius: 16, padding: 18 },
  title: { fontSize: 17, fontWeight: '800', color: '#0f172a', marginBottom: 12 },
  quickRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  quick: { flex: 1, minHeight: 44, borderRadius: 10, backgroundColor: '#f1f5f9', alignItems: 'center', justifyContent: 'center' },
  quickActive: { backgroundColor: '#dbeafe', borderWidth: 1.5, borderColor: '#1976d2' },
  quickText: { fontSize: 14, fontWeight: '700', color: '#1e293b' },
  label: { fontSize: 13, fontWeight: '600', color: '#475569', marginTop: 12, marginBottom: 6 },
  input: { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 10, minHeight: 48, paddingHorizontal: 12, fontSize: 16, justifyContent: 'center', color: '#0f172a' },
  btnRow: { flexDirection: 'row', gap: 8, marginTop: 16 },
  btn: { flex: 1, minHeight: 46, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  btnText: { fontSize: 15, fontWeight: '700' },
});

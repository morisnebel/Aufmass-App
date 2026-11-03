import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, Platform, StyleSheet, Alert } from 'react-native';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';

// Kalender + Uhrzeit in einem Fenster (für eigene Erinnerungs- und Abfahrtszeiten)
const pad = (n: number) => String(n).padStart(2, '0');
export const fmtDateTime = (d: Date) => `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
export const parseDateTime = (t: string): Date | null => {
  const m = t.trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})\s+(\d{1,2}):(\d{2})$/);
  if (!m || Number(m[4]) > 23 || Number(m[5]) > 59) return null;
  const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]), Number(m[4]), Number(m[5]));
  return d.getDate() === Number(m[1]) && d.getMonth() === Number(m[2]) - 1 ? d : null;
};

// Android: System-Dialoge nacheinander (Datum → Uhrzeit)
export const pickDateTimeAndroid = (value: Date, onPicked: (d: Date) => void) => {
  DateTimePickerAndroid.open({
    value, mode: 'date',
    onChange: (e, d) => {
      if (e.type !== 'set' || !d) return;
      DateTimePickerAndroid.open({
        value: d, mode: 'time', is24Hour: true,
        onChange: (e2, t) => {
          if (e2.type !== 'set' || !t) return;
          const r = new Date(d); r.setHours(t.getHours(), t.getMinutes(), 0, 0);
          onPicked(r);
        },
      });
    },
  });
};

type Props = { visible: boolean; title: string; value: Date; onCancel: () => void; onConfirm: (d: Date) => void };

// iOS + Web: Overlay innerhalb des Termin-Fensters
export function DateTimeSheet({ visible, title, value, onCancel, onConfirm }: Props) {
  const [temp, setTemp] = useState(value);
  const [text, setText] = useState(fmtDateTime(value));
  useEffect(() => { if (visible) { setTemp(value); setText(fmtDateTime(value)); } }, [visible, value]);
  if (!visible) return null;

  const quick = (days: number) => { const d = new Date((Platform.OS === 'web' && parseDateTime(text)) || temp); const n = new Date(); d.setFullYear(n.getFullYear(), n.getMonth(), n.getDate() + days); setTemp(d); setText(fmtDateTime(d)); };
  const confirm = () => {
    const d = Platform.OS === 'web' ? parseDateTime(text) : temp;
    if (!d) { Alert.alert('Ungültige Zeit', 'Bitte als TT.MM.JJJJ HH:MM eingeben.'); return; }
    if (d.getTime() <= Date.now()) { Alert.alert('Zeit liegt in der Vergangenheit', 'Bitte eine Zeit in der Zukunft wählen.'); return; }
    onConfirm(d);
  };

  return (
    <View style={s.overlay} testID="dt-sheet">
      <View style={s.box}>
        <Text style={s.title}>{title}</Text>
        <View style={s.row}>
          {[['Heute', 0], ['Morgen', 1], ['Übermorgen', 2]].map(([l, n]) => (
            <TouchableOpacity key={l as string} testID={`dt-quick-${n}`} style={s.quick} onPress={() => quick(n as number)}>
              <Text style={s.quickText}>{l as string}</Text>
            </TouchableOpacity>
          ))}
        </View>
        {Platform.OS === 'web' ? (
          <TextInput testID="dt-input" style={s.input} value={text} onChangeText={setText} placeholderTextColor="#94a3b8" placeholder="TT.MM.JJJJ HH:MM" />
        ) : (
          <>
            <DateTimePicker value={temp} mode="date" display="inline" locale="de-DE" themeVariant="light" accentColor="#1976d2"
              onChange={(_, d) => { if (d) { const r = new Date(temp); r.setFullYear(d.getFullYear(), d.getMonth(), d.getDate()); setTemp(r); } }} />
            <View style={s.timeRow}>
              <Text style={s.timeLabel}>Uhrzeit</Text>
              <DateTimePicker value={temp} mode="time" display="compact" locale="de-DE" minuteInterval={5} themeVariant="light" accentColor="#1976d2"
                onChange={(_, d) => { if (d) { const r = new Date(temp); r.setHours(d.getHours(), d.getMinutes(), 0, 0); setTemp(r); } }} />
            </View>
          </>
        )}
        <View style={[s.row, { marginTop: 14, marginBottom: 0 }]}>
          <TouchableOpacity testID="dt-cancel" style={[s.btn, { backgroundColor: '#f1f5f9' }]} onPress={onCancel}>
            <Text style={[s.btnText, { color: '#334155' }]}>Abbrechen</Text>
          </TouchableOpacity>
          <TouchableOpacity testID="dt-confirm" style={[s.btn, { backgroundColor: '#1976d2' }]} onPress={confirm}>
            <Text style={[s.btnText, { color: '#fff' }]}>Übernehmen</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center', padding: 16, zIndex: 20 },
  box: { width: '100%', maxWidth: 400, backgroundColor: '#fff', borderRadius: 16, padding: 16 },
  title: { fontSize: 17, fontWeight: '800', color: '#0f172a', marginBottom: 12 },
  row: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  quick: { flex: 1, minHeight: 44, borderRadius: 10, backgroundColor: '#f1f5f9', alignItems: 'center', justifyContent: 'center' },
  quickText: { fontSize: 14, fontWeight: '700', color: '#1e293b' },
  input: { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 10, minHeight: 48, paddingHorizontal: 12, fontSize: 16, color: '#0f172a' },
  timeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 48, borderTopWidth: 1, borderTopColor: '#e2e8f0', paddingTop: 8 },
  timeLabel: { fontSize: 16, fontWeight: '700', color: '#0f172a' },
  btn: { flex: 1, minHeight: 46, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  btnText: { fontSize: 15, fontWeight: '700' },
});

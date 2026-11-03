import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Modal, View, Text, TextInput, TouchableOpacity, ScrollView, Keyboard, Platform, Alert, StyleSheet, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@react-native-vector-icons/ionicons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Project, Customer, generateFullAddress } from '../../../services/LocalStorage';
import { Appointment, AppointmentService } from '../../../services/AppointmentService';
import { scheduleDepartureReminder, scheduleAppointmentReminder, cancelReminder, departureTime } from '../../utils/appointmentTools';
import { todayKey } from './TodayOverview';
import { DateTimeSheet, pickDateTimeAndroid, fmtDateTime } from './DateTimeSheet';

const TRAVEL_OPTIONS = [0, 15, 30, 45, 60, 90];
const REMIND_OPTIONS: [number, string][] = [[0, 'Keine'], [15, '15 Min'], [30, '30 Min'], [60, '1 Std'], [120, '2 Std'], [1440, '1 Tag'], [-1, 'Eigene Zeit']];
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
  (p ? generateFullAddress(p.objekt_street, p.objekt_plz, p.objekt_city) : '') ||
  (p?.address || '').trim() ||
  (c ? generateFullAddress(c.street, c.zip, c.city) || c.address || '' : '');

type Props = {
  visible: boolean;
  initial: Appointment | null;
  projects: Project[];
  customers: Record<string, Customer>;
  onClose: () => void;
  onSaved: () => void;
  onCreateProject?: (a: Appointment) => void;
  initialDate?: string; // Vorbelegung für neuen Termin (z. B. aus dem Kalender)
  initialTime?: string | null;
  initialProjectId?: string | null; // Termin direkt aus einem Projekt anlegen
};

// Termin direkt von der Startseite anlegen/bearbeiten – mit Notiz, Navi-Adresse und Abfahrts-Erinnerung
export function AppointmentFormModal({ visible, initial, projects, customers, onClose, onSaved, onCreateProject, initialDate, initialTime, initialProjectId }: Props) {
  const [picker, setPicker] = useState<'date' | 'time' | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [dateText, setDateText] = useState('');
  const [time, setTime] = useState('');
  const [address, setAddress] = useState('');
  const [note, setNote] = useState('');
  const [travel, setTravel] = useState(0);
  const [remindBefore, setRemindBefore] = useState(0);
  const [remindAt, setRemindAt] = useState<Date | null>(null);
  const [departAt, setDepartAt] = useState<Date | null>(null);
  const [sheet, setSheet] = useState<'remind' | 'depart' | null>(null);
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [custOpen, setCustOpen] = useState(false);
  const [custQuery, setCustQuery] = useState('');
  const [saving, setSaving] = useState(false);
  const [kb, setKb] = useState(0);
  const scrollRef = useRef<any>(null);
  const fieldY = useRef<Record<string, number>>({});
  const { height: winH } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  // Tastatur selbst verwalten: Sheet über die Tastatur schieben und Feld sichtbar scrollen
  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', e => setKb(e.endCoordinates.height));
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setKb(0));
    return () => { show.remove(); hide.remove(); };
  }, []);
  const focusField = (key: string) => {
    setTimeout(() => scrollRef.current?.scrollTo({ y: Math.max(0, (fieldY.current[key] || 0) - 40), animated: true }), 300);
  };
  const trackY = (key: string) => (e: any) => { fieldY.current[key] = e.nativeEvent.layout.y; };

  useEffect(() => {
    if (!visible) return;
    setPicker(null);
    setSheet(null);
    const proj = !initial && initialProjectId ? projects.find(p => p.id === initialProjectId) : undefined;
    setProjectId(initial?.project_id || initialProjectId || null);
    setTitle(initial?.title || proj?.name || '');
    setDateText(toDisplay(initial?.date || initialDate || todayKey()));
    setTime(initial?.time || initialTime || '');
    setAddress(initial?.address || (proj ? projectAddress(proj, customers[proj.customer_id]) : ''));
    setNote(initial?.note || '');
    setTravel(initial?.travel_minutes || 0);
    setRemindBefore(initial?.remind_before || 0);
    setRemindAt(initial?.remind_at ? new Date(initial.remind_at) : null);
    setDepartAt(initial?.depart_at ? new Date(initial.depart_at) : null);
    setCustomerId(initial?.customer_id || proj?.customer_id || null);
    setCustOpen(false);
    setCustQuery('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, initial, initialDate, initialTime, initialProjectId]);

  const customerList = useMemo(() => {
    const q = custQuery.trim().toLowerCase();
    return Object.values(customers)
      .filter(c => !q || [c.name, c.city, c.street, c.address].some(v => (v || '').toLowerCase().includes(q)))
      .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'de'))
      .slice(0, 20);
  }, [customers, custQuery]);

  const pickCustomer = (c: Customer) => {
    setCustomerId(c.id);
    const addr = projectAddress(undefined, c);
    if (addr) setAddress(addr);
    if (!title.trim()) setTitle(c.name);
    setCustOpen(false);
    setCustQuery('');
    Keyboard.dismiss();
  };

  const projectChoices = useMemo(
    () => [...projects].sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || '')).slice(0, 30),
    [projects]
  );

  const pickProject = (p: Project | null) => {
    setProjectId(p?.id || null);
    if (!p || !p.customer_id) setCustomerId(null);
    if (p) {
      if (p.customer_id) setCustomerId(p.customer_id);
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
  // Startwert für Kalender/Uhrzeit-Rad
  const pickerValue = (() => {
    const [y, m, d] = (date || todayKey()).split('-').map(Number);
    const [hh, mm] = (normTime || '08:00').split(':').map(Number);
    return new Date(y, m - 1, d, hh, mm);
  })();

  // Eigene Zeit: Kalender + Uhrzeit öffnen (Android: System-Dialoge, iOS/Web: Fenster)
  const defaultCustom = () => {
    const base = new Date(pickerValue.getTime() - 60 * 60000);
    return base.getTime() > Date.now() ? base : new Date(Math.ceil((Date.now() + 60 * 60000) / 300000) * 300000);
  };
  const applyCustom = (kind: 'remind' | 'depart', d: Date) => {
    if (kind === 'remind') { setRemindAt(d); setRemindBefore(-1); } else { setDepartAt(d); setTravel(-1); }
    setSheet(null);
  };
  const openCustom = (kind: 'remind' | 'depart') => {
    Keyboard.dismiss();
    const current = (kind === 'remind' ? remindAt : departAt) || defaultCustom();
    if (Platform.OS === 'android') pickDateTimeAndroid(current, d => applyCustom(kind, d));
    else setSheet(kind);
  };
  // Fehlt die Termin-Uhrzeit, direkt die Uhrzeit-Auswahl öffnen
  const needTime = () => {
    if (normTime) return false;
    if (Platform.OS !== 'web') { setPicker('time'); setTimeout(() => scrollRef.current?.scrollTo({ y: fieldY.current.date || 0, animated: true }), 50); }
    else Alert.alert('Uhrzeit fehlt', 'Bitte zuerst die Uhrzeit des Termins eintragen.');
    return true;
  };
  const chooseRemind = (m: number) => { setRemindBefore(m); if (m > 0) needTime(); };
  const chooseTravel = (m: number) => { setTravel(m); if (m > 0) needTime(); };

  const save = async () => {
    if (!title.trim()) { Alert.alert('Titel fehlt', 'Bitte einen Titel eingeben oder ein Projekt wählen.'); return; }
    if (!date) { Alert.alert('Ungültiges Datum', 'Bitte im Format TT.MM.JJJJ eingeben, z. B. 05.11.2026.'); return; }
    if (!validTime) { Alert.alert('Ungültige Uhrzeit', 'Bitte als HH:MM eingeben, z. B. 08:30.'); return; }
    if ((travel > 0 || remindBefore > 0) && !normTime) { Alert.alert('Uhrzeit fehlt', 'Für Erinnerungen brauche ich die Uhrzeit des Termins.'); return; }
    const customAt = remindBefore === -1 ? remindAt : null;
    const customDepart = travel === -1 ? departAt : null;
    if ((remindBefore === -1 && !customAt) || (travel === -1 && !customDepart)) { Alert.alert('Zeit fehlt', 'Bitte Datum und Uhrzeit für die Erinnerung wählen.'); return; }
    if ((customAt && customAt.getTime() <= Date.now()) || (customDepart && customDepart.getTime() <= Date.now())) { Alert.alert('Erinnerung liegt in der Vergangenheit', 'Bitte eine Zeit in der Zukunft wählen.'); return; }
    if (normTime) {
      const [ay, am, ad] = date.split('-').map(Number);
      const [ah, amin] = normTime.split(':').map(Number);
      const start = new Date(ay, am - 1, ad, ah, amin).getTime();
      if ((customAt && customAt.getTime() > start) || (customDepart && customDepart.getTime() > start)) { Alert.alert('Erinnerung nach dem Termin', 'Die gewählte Erinnerungs- oder Abfahrtszeit liegt nach Terminbeginn.'); return; }
    }
    const [ry, rm, rd] = date.split('-').map(Number);
    const [rh, rmin] = (normTime || '08:00').split(':').map(Number);
    const remindTime = customAt || (remindBefore > 0 ? new Date(new Date(ry, rm - 1, rd, rh, rmin).getTime() - remindBefore * 60000) : null);
    setSaving(true);
    try {
      await cancelReminder(initial?.reminder_id);
      await cancelReminder(initial?.remind_id);
      const reminderId = customDepart
        ? await scheduleAppointmentReminder({ heading: `Zeit loszufahren: ${title.trim()}`, title: title.trim(), date, time: normTime || '', at: customDepart, address: address.trim() })
        : travel > 0 && normTime
        ? await scheduleDepartureReminder({ title: title.trim(), date, time: normTime, travelMinutes: travel, address: address.trim() })
        : null;
      const remindId = remindTime
        ? await scheduleAppointmentReminder({ title: title.trim(), date, time: normTime || '', at: remindTime, address: address.trim() })
        : null;
      await AppointmentService.save({
        id: initial?.id, title: title.trim(), date, time: normTime, project_id: projectId, customer_id: customerId,
        address: address.trim(), note: note.trim(), travel_minutes: travel || null, reminder_id: reminderId, depart_at: customDepart ? customDepart.toISOString() : null,
        remind_before: remindBefore || null, remind_id: remindId, remind_at: customAt ? customAt.toISOString() : null,
      });
      if (Platform.OS !== 'web' && ((travel !== 0 && !reminderId) || (remindTime && !remindId))) {
        Alert.alert('Termin gespeichert', 'Mindestens eine Erinnerungszeit liegt schon in der Vergangenheit oder Mitteilungen sind aus – dafür wurde keine Erinnerung geplant.');
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
      { text: 'Löschen', style: 'destructive', onPress: async () => { await cancelReminder(initial.reminder_id); await cancelReminder(initial.remind_id); await AppointmentService.remove(initial.id); onSaved(); } },
    ]);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={s.backdrop}>
        <View style={[s.sheet, kb > 0 && { marginBottom: kb, paddingBottom: 10, maxHeight: winH - kb - insets.top - 8 }]}>
          <View style={s.head}>
            <Text style={s.title}>{initial ? 'Termin bearbeiten' : 'Neuer Termin'}</Text>
            <TouchableOpacity testID="apt-close" onPress={onClose} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="close" size={26} color="#334155" /></TouchableOpacity>
          </View>
          <ScrollView ref={scrollRef} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 16 }}>
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
            <TextInput testID="apt-title" style={s.input} value={title} onChangeText={setTitle} placeholderTextColor="#94a3b8" placeholder="z. B. Aufmaß Dach Müller" />

            <Text style={s.label} onLayout={trackY('date')}>Datum</Text>
            <View style={s.row}>
              {[['Heute', 0], ['Morgen', 1], ['Übermorgen', 2]].map(([l, n]) => (
                <TouchableOpacity key={l as string} testID={`apt-quick-${n}`} style={s.quick} onPress={() => quickDate(n as number)}>
                  <Text style={s.quickText}>{l as string}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={[s.row, { marginTop: 8 }]}>
              {Platform.OS === 'web' ? (
                <>
                  <TextInput testID="apt-date" style={[s.input, { flex: 1.4, minWidth: 0 }]} value={dateText} onChangeText={setDateText} placeholderTextColor="#94a3b8" placeholder="TT.MM.JJJJ" keyboardType="numbers-and-punctuation" />
                  <TextInput testID="apt-time" style={[s.input, { flex: 1, minWidth: 0 }]} value={time} onChangeText={setTime} placeholderTextColor="#94a3b8" placeholder="08:30" keyboardType="numbers-and-punctuation" maxLength={5} />
                </>
              ) : (
                <>
                  {/* Handy: Kalender und Uhrzeit-Rad öffnen sich per Tipp */}
                  <TouchableOpacity testID="apt-date" style={[s.input, s.pickBtn, { flex: 1.4 }, picker === 'date' && s.pickOn]} onPress={() => setPicker(picker === 'date' ? null : 'date')}>
                    <Ionicons name="calendar-outline" size={18} color="#1976d2" />
                    <Text style={s.pickText}>{dateText || 'Datum'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity testID="apt-time" style={[s.input, s.pickBtn, { flex: 1 }, picker === 'time' && s.pickOn]} onPress={() => setPicker(picker === 'time' ? null : 'time')}>
                    <Ionicons name="time-outline" size={18} color="#1976d2" />
                    <Text style={s.pickText}>{time || 'Uhrzeit'}</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
            {picker && Platform.OS !== 'web' && (
              <View style={Platform.OS === 'ios' ? s.pickerBox : undefined}>
                <DateTimePicker
                  value={pickerValue}
                  mode={picker}
                  display={Platform.OS === 'ios' ? (picker === 'date' ? 'inline' : 'spinner') : 'default'}
                  locale="de-DE"
                  is24Hour
                  minuteInterval={5}
                  themeVariant="light"
                  accentColor="#1976d2"
                  onChange={(e, d) => {
                    if (Platform.OS === 'android') setPicker(null);
                    if (!d || e.type === 'dismissed') return;
                    if (picker === 'date') {
                      setDateText(toDisplay(todayKey(d)));
                      if (Platform.OS === 'ios') setPicker(null);
                    } else {
                      setTime(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`);
                    }
                  }}
                />
                {Platform.OS === 'ios' && picker === 'time' && (
                  <TouchableOpacity style={s.pickDone} onPress={() => setPicker(null)}>
                    <Text style={s.pickDoneText}>Fertig</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}

            <Text style={s.label} onLayout={trackY('note')}>Notiz</Text>
            <TextInput testID="apt-note" style={[s.input, { minHeight: 70, textAlignVertical: 'top', paddingTop: 10 }]} value={note} onChangeText={setNote} onFocus={() => focusField('note')} placeholderTextColor="#94a3b8" placeholder="z. B. Leiter mitnehmen, Kunde vorher anrufen" multiline />

            <View style={s.labelRow} onLayout={trackY('address')}>
              <Text style={[s.label, { marginTop: 0, marginBottom: 0 }]}>Adresse fürs Navi</Text>
              <TouchableOpacity testID="apt-customer-toggle" style={s.custBtn} onPress={() => { setCustOpen(!custOpen); if (!custOpen) focusField('address'); }}>
                <Ionicons name="people-outline" size={16} color="#1976d2" />
                <Text style={s.custBtnText}>Aus Kunden</Text>
              </TouchableOpacity>
            </View>
            {customerId && customers[customerId] && (
              <View style={s.custTag}>
                <Ionicons name="person" size={14} color="#1976d2" />
                <Text style={s.custTagText} numberOfLines={1}>{customers[customerId].name}</Text>
                <TouchableOpacity testID="apt-customer-clear" hitSlop={10} onPress={() => setCustomerId(null)}><Ionicons name="close-circle" size={18} color="#64748b" /></TouchableOpacity>
              </View>
            )}
            {custOpen && (
              <View testID="apt-customer-list" style={s.custBox}>
                <TextInput testID="apt-customer-search" style={[s.input, { minHeight: 42 }]} value={custQuery} onChangeText={setCustQuery} onFocus={() => focusField('address')} placeholderTextColor="#94a3b8" placeholder="Kunde suchen…" />
                {customerList.length === 0 ? (
                  <Text style={s.custEmpty}>Keine Kunden gefunden.</Text>
                ) : customerList.map(c => (
                  <TouchableOpacity key={c.id} testID={`apt-customer-${c.id}`} style={s.custItem} onPress={() => pickCustomer(c)}>
                    <Text style={s.custName} numberOfLines={1}>{c.name}</Text>
                    <Text style={s.custAddr} numberOfLines={1}>{projectAddress(undefined, c) || 'Keine Adresse hinterlegt'}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
            <TextInput testID="apt-address" style={[s.input, { marginTop: 6 }]} value={address} onChangeText={setAddress} onFocus={() => focusField('address')} placeholderTextColor="#94a3b8" placeholder="Straße, PLZ Ort" />

            <Text style={s.label}>Erinnerung vor dem Termin</Text>
            <View style={[s.row, { flexWrap: 'wrap' }]}>
              {REMIND_OPTIONS.map(([m, l]) => (
                <TouchableOpacity key={m} testID={`apt-remind-${m}`} style={[s.chip, remindBefore === m && s.chipOn]} onPress={() => (m === -1 ? openCustom('remind') : chooseRemind(m))}>
                  {m === -1 && <Ionicons name="calendar-outline" size={14} color={remindBefore === m ? '#fff' : '#334155'} style={{ marginRight: 4 }} />}
                  <Text style={[s.chipText, remindBefore === m && s.chipTextOn]}>{m === -1 && remindBefore === -1 && remindAt ? fmtDateTime(remindAt).slice(0, 16) : l}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={s.label}>Fahrzeit → Erinnerung zum Losfahren</Text>
            <View style={[s.row, { flexWrap: 'wrap' }]}>
              {TRAVEL_OPTIONS.map(m => (
                <TouchableOpacity key={m} testID={`apt-travel-${m}`} style={[s.chip, travel === m && s.chipOn]} onPress={() => chooseTravel(m)}>
                  <Text style={[s.chipText, travel === m && s.chipTextOn]}>{m === 0 ? 'Keine' : `${m} Min`}</Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity testID="apt-travel--1" style={[s.chip, travel === -1 && s.chipOn]} onPress={() => openCustom('depart')}>
                <Ionicons name="calendar-outline" size={14} color={travel === -1 ? '#fff' : '#334155'} style={{ marginRight: 4 }} />
                <Text style={[s.chipText, travel === -1 && s.chipTextOn]}>{travel === -1 && departAt ? `Los: ${fmtDateTime(departAt)}` : 'Abfahrt wählen'}</Text>
              </TouchableOpacity>
            </View>
            {departure && (
              <Text testID="apt-departure-info" style={s.hint}>
                🔔 Erinnerung um {departure.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr (Fahrzeit + 10 Min Puffer)
                {Platform.OS === 'web' ? ' – Erinnerungen funktionieren nur in der App auf dem Handy.' : ''}
              </Text>
            )}
          </ScrollView>
          <View style={s.btnRow}>
            {initial && (
              <TouchableOpacity testID="apt-delete" style={[s.btn, { backgroundColor: '#fdecec', flex: 0.6 }]} onPress={remove}>
                <Ionicons name="trash-outline" size={20} color="#dc2626" />
              </TouchableOpacity>
            )}
            {initial && !initial.project_id && onCreateProject && (
              <TouchableOpacity testID="apt-create-project" style={[s.btn, { backgroundColor: '#e8f5e9' }]} onPress={() => onCreateProject(initial)}>
                <Text style={[s.btnText, { color: '#2e7d32', fontSize: 14 }]}>Projekt erstellen</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity testID="apt-save" style={[s.btn, { backgroundColor: '#1976d2' }]} onPress={save} disabled={saving}>
              <Text style={s.btnText} numberOfLines={1}>{saving ? 'Speichern…' : 'Speichern'}</Text>
            </TouchableOpacity>
          </View>
        </View>
        <DateTimeSheet
          visible={!!sheet}
          title={sheet === 'depart' ? 'Wann willst du losfahren?' : 'Wann soll ich dich erinnern?'}
          value={(sheet === 'depart' ? departAt : remindAt) || defaultCustom()}
          onCancel={() => setSheet(null)}
          onConfirm={d => applyCustom(sheet === 'depart' ? 'depart' : 'remind', d)}
        />
      </View>
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
  labelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 },
  custBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, paddingHorizontal: 12, borderRadius: 22, backgroundColor: '#eff6ff' },
  custBtnText: { color: '#1976d2', fontWeight: '700', fontSize: 13 },
  custTag: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', marginTop: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14, backgroundColor: '#eff6ff', maxWidth: '100%' },
  custTagText: { color: '#1e3a8a', fontWeight: '700', fontSize: 13, flexShrink: 1 },
  custBox: { marginTop: 8, borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 12, padding: 8, gap: 4, backgroundColor: '#f8fafc' },
  custItem: { minHeight: 48, justifyContent: 'center', paddingHorizontal: 8, borderRadius: 8, backgroundColor: '#fff' },
  custName: { fontSize: 15, fontWeight: '700', color: '#0f172a' },
  custAddr: { fontSize: 12, color: '#64748b', marginTop: 1 },
  custEmpty: { fontSize: 13, color: '#64748b', padding: 8 },
  chip: { minHeight: 44, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, borderRadius: 20, borderWidth: 1, borderColor: '#cbd5e1', justifyContent: 'center', maxWidth: 200 },
  chipOn: { backgroundColor: '#1976d2', borderColor: '#1976d2' },
  chipText: { fontSize: 14, fontWeight: '600', color: '#334155' },
  chipTextOn: { color: '#fff' },
  quick: { flex: 1, minHeight: 44, borderRadius: 10, backgroundColor: '#f1f5f9', alignItems: 'center', justifyContent: 'center' },
  quickText: { fontSize: 14, fontWeight: '700', color: '#1e293b' },
  hint: { marginTop: 8, fontSize: 13, color: '#0369a1' },
  pickBtn: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pickOn: { borderColor: '#1976d2', backgroundColor: '#eff6ff' },
  pickText: { fontSize: 16, color: '#0f172a', fontWeight: '600' },
  pickerBox: { marginTop: 8, borderRadius: 12, backgroundColor: '#f8fafc', overflow: 'hidden' },
  pickDone: { alignSelf: 'flex-end', minHeight: 44, justifyContent: 'center', paddingHorizontal: 16 },
  pickDoneText: { color: '#1976d2', fontWeight: '800', fontSize: 16 },
  btnRow: { flexDirection: 'row', gap: 10, marginTop: 10 },
  btn: { flex: 1, minHeight: 50, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
});

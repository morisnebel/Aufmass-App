// Termin-Übersicht: Monatskalender + Termine des gewählten Tages + alle kommenden Termine
import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { Stack, useRouter, useFocusEffect } from 'expo-router';
import Ionicons from '@react-native-vector-icons/ionicons';
import { ProjectService, CustomerService, Project, Customer } from '../services/LocalStorage';
import { AppointmentService, Appointment } from '../services/AppointmentService';
import { normalizeStatus } from '../src/constants/projectStatus';
import { buildAgenda } from '../src/utils/agenda';
import { AgendaRow, todayKey } from '../src/components/home/TodayOverview';
import { AppointmentFormModal } from '../src/components/home/AppointmentFormModal';
import { openNavigation } from '../src/utils/appointmentTools';

const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
const GAP = 2;

export default function AppointmentsScreen() {
  const router = useRouter();
  const [gridW, setGridW] = useState(0);
  const [projects, setProjects] = useState<Project[]>([]);
  const [customers, setCustomers] = useState<Record<string, Customer>>({});
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [selected, setSelected] = useState(todayKey());
  const [modal, setModal] = useState(false);
  const [edit, setEdit] = useState<Appointment | null>(null);

  const load = useCallback(async () => {
    const [p, c, a] = await Promise.all([ProjectService.getAll(), CustomerService.getAll(), AppointmentService.getAll()]);
    setProjects(p.filter((x: Project) => normalizeStatus(x.status) !== 'archiviert'));
    const map: Record<string, Customer> = {};
    c.forEach((x: Customer) => { map[x.id] = x; });
    setCustomers(map);
    setAppointments(a);
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const agenda = useMemo(() => buildAgenda({
    projects, appointments, customers,
    onOpenProject: id => router.push(`/projects/${id}`),
    onEditAppointment: a => { setEdit(a); setModal(true); },
    setAppointments,
  }), [projects, appointments, customers, router]);

  const countByDay = useMemo(() => {
    const m: Record<string, number> = {};
    agenda.forEach(i => { m[i.date] = (m[i.date] || 0) + 1; });
    return m;
  }, [agenda]);

  // Kalendertage des Monats (Woche beginnt Montag)
  const cells = useMemo(() => {
    const first = month.getDay() === 0 ? 6 : month.getDay() - 1;
    const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    const list: (string | null)[] = Array(first).fill(null);
    for (let d = 1; d <= days; d++) list.push(todayKey(new Date(month.getFullYear(), month.getMonth(), d)));
    while (list.length % 7) list.push(null);
    return list;
  }, [month]);

  const today = todayKey();
  const dayItems = agenda.filter(i => i.date === selected);
  const upcoming = agenda.filter(i => i.date >= today).slice(0, 30);
  const cellSize = gridW > 0 ? Math.floor((gridW - 6 * GAP) / 7) : 40;
  const shiftMonth = (n: number) => setMonth(new Date(month.getFullYear(), month.getMonth() + n, 1));
  const selLabel = (() => { const [y, m, d] = selected.split('-').map(Number); return new Date(y, m - 1, d).toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' }); })();

  return (
    <>
      <Stack.Screen options={{ title: 'Termine' }} />
      <ScrollView style={s.screen} contentContainerStyle={s.content}>
        <View style={s.card}>
          <View style={s.monthRow}>
            <TouchableOpacity testID="cal-prev" style={s.navBtn} onPress={() => shiftMonth(-1)}><Ionicons name="chevron-back" size={22} color="#1976d2" /></TouchableOpacity>
            <Text testID="cal-month" style={s.monthText}>{month.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' })}</Text>
            <TouchableOpacity testID="cal-next" style={s.navBtn} onPress={() => shiftMonth(1)}><Ionicons name="chevron-forward" size={22} color="#1976d2" /></TouchableOpacity>
          </View>
          {/* Breite messen → genau 7 Spalten pro Zeile */}
          <View onLayout={e => setGridW(e.nativeEvent.layout.width)}>
          <View style={[s.grid, { width: cellSize * 7 + GAP * 6, alignSelf: 'center' }]}>
            {WEEKDAYS.map(w => <Text key={w} style={[s.weekday, { width: cellSize }]}>{w}</Text>)}
            {cells.map((k, i) => {
              if (!k) return <View key={`e${i}`} style={{ width: cellSize, height: cellSize }} />;
              const isSel = k === selected;
              const isToday = k === today;
              const count = countByDay[k] || 0;
              return (
                <TouchableOpacity key={k} testID={`cal-day-${k}`} onPress={() => setSelected(k)}
                  style={[s.day, { width: cellSize, height: cellSize }, isToday && s.dayToday, isSel && s.daySel]}>
                  <Text style={[s.dayText, isSel && { color: '#fff' }]}>{Number(k.slice(8))}</Text>
                  {count > 0 && <View style={[s.dot, isSel && { backgroundColor: '#fff' }]}><Text style={[s.dotText, isSel && { color: '#1976d2' }]}>{count}</Text></View>}
                </TouchableOpacity>
              );
            })}
          </View>
          </View>
          <TouchableOpacity testID="cal-today" style={s.todayBtn} onPress={() => { const d = new Date(); setMonth(new Date(d.getFullYear(), d.getMonth(), 1)); setSelected(today); }}>
            <Text style={s.todayBtnText}>Heute</Text>
          </TouchableOpacity>
        </View>

        <View style={s.card}>
          <View style={s.headRow}>
            <Text style={s.title}>{selLabel}</Text>
            <TouchableOpacity testID="cal-add" style={s.addBtn} onPress={() => { setEdit({ id: '', title: '', date: selected, created_at: '', updated_at: '' } as any); setModal(true); }}>
              <Ionicons name="add" size={18} color="#fff" />
              <Text style={s.addText}>Termin</Text>
            </TouchableOpacity>
          </View>
          {dayItems.length === 0
            ? <Text style={s.empty}>Keine Termine an diesem Tag.</Text>
            : dayItems.map(i => <AgendaRow key={i.key} item={i} onNavigate={openNavigation} testID={`cal-item-${i.key}`} />)}
        </View>

        <View style={s.card}>
          <Text style={s.title}>Alle kommenden Termine</Text>
          {upcoming.length === 0 ? <Text style={s.empty}>Keine kommenden Termine.</Text> : upcoming.map(i => (
            <View key={i.key}>
              <Text style={s.upDate}>{(() => { const [y, m, d] = i.date.split('-').map(Number); return new Date(y, m - 1, d).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' }); })()}</Text>
              <AgendaRow item={i} onNavigate={openNavigation} testID={`cal-up-${i.key}`} />
            </View>
          ))}
        </View>
      </ScrollView>
      <AppointmentFormModal
        visible={modal}
        initial={edit && edit.id ? edit : null}
        initialDate={edit && !edit.id ? edit.date : undefined}
        projects={projects}
        customers={customers}
        onClose={() => setModal(false)}
        onSaved={() => { setModal(false); load(); }}
        onCreateProject={a => { setModal(false); router.push({ pathname: '/projects/new', params: { from_appointment: a.id, name: a.title, ...(a.customer_id ? { customer_id: a.customer_id } : {}), description: a.note || '', ...(a.address ? { address: a.address } : {}) } }); }}
      />
    </>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f5f7fb' },
  content: { padding: 16, gap: 16, paddingBottom: 40, width: '100%', maxWidth: 700, alignSelf: 'center' },
  card: { backgroundColor: '#fff', borderRadius: 18, padding: 14, shadowColor: '#0f2a5c', shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 3 },
  monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  navBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  monthText: { fontSize: 18, fontWeight: '800', color: '#0f172a', textTransform: 'capitalize' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP },
  weekday: { textAlign: 'center', fontSize: 12, fontWeight: '700', color: '#94a3b8', paddingVertical: 4 },
  day: { alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
  dayToday: { borderWidth: 2, borderColor: '#dc2626' },
  daySel: { backgroundColor: '#1976d2', borderColor: '#1976d2' },
  dayText: { fontSize: 15, fontWeight: '700', color: '#1e293b' },
  dot: { marginTop: 2, minWidth: 16, height: 16, borderRadius: 8, backgroundColor: '#dc2626', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  dotText: { fontSize: 10, fontWeight: '800', color: '#fff' },
  todayBtn: { alignSelf: 'center', minHeight: 40, justifyContent: 'center', paddingHorizontal: 16, marginTop: 6 },
  todayBtnText: { color: '#1976d2', fontWeight: '800', fontSize: 14 },
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  title: { fontSize: 17, fontWeight: '800', color: '#0f172a', flexShrink: 1 },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#dc2626', borderRadius: 12, paddingHorizontal: 12, minHeight: 40 },
  addText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  empty: { fontSize: 14, color: '#94a3b8', paddingVertical: 8 },
  upDate: { fontSize: 12, fontWeight: '800', color: '#7c3aed', marginTop: 10 },
});

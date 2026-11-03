import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Ionicons from '@react-native-vector-icons/ionicons';
import { Project, Customer, CustomerService } from '../../../services/LocalStorage';
import { Appointment, AppointmentService } from '../../../services/AppointmentService';
import { AppointmentFormModal } from '../home/AppointmentFormModal';
import { todayKey } from '../home/TodayOverview';

// Termin im Projekt: nutzt den vollen Terminplaner (Erinnerungen, Navi-Adresse, Notiz)
const pretty = (k: string) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', year: '2-digit' }); };

type Props = { project: Project; onChanged: () => void };

export function ProjectAppointment({ project, onChanged }: Props) {
  const [items, setItems] = useState<Appointment[]>([]);
  const [customers, setCustomers] = useState<Record<string, Customer>>({});
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<Appointment | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    const [all, cs] = await Promise.all([AppointmentService.getAll(), CustomerService.getAll()]);
    setItems(all.filter(a => a.project_id === project.id).sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || ''))));
    setCustomers(Object.fromEntries(cs.map(c => [c.id, c])));
    setLoaded(true);
  }, [project.id]);
  useEffect(() => { load(); }, [load]);

  const today = todayKey();
  const upcoming = items.filter(a => a.date >= today);
  const legacyDate = (project as any).appointment_date as string | undefined;
  const legacyTime = (project as any).appointment_time as string | undefined;
  // Alter Projekt-Termin ohne verknüpften Termin weiterhin anzeigen
  const showLegacy = !!legacyDate && items.length === 0;

  const afterSave = async () => {
    setOpen(false);
    await load();
    onChanged();
  };

  return (
    <View style={{ marginTop: 10 }}>
      {showLegacy && (
        <TouchableOpacity testID="project-appointment-legacy" style={[s.chip, s.chipSet]} onPress={() => { setEdit(null); setOpen(true); }}>
          <Ionicons name="alarm-outline" size={20} color="#dc2626" style={{ marginRight: 10 }} />
          <View style={{ flex: 1 }}>
            <Text style={s.chipLabel}>Termin</Text>
            <Text style={[s.chipValue, { color: '#dc2626' }]}>{pretty(legacyDate!)}{legacyTime ? `, ${legacyTime} Uhr` : ''}</Text>
          </View>
          <Ionicons name="create-outline" size={18} color="#dc2626" />
        </TouchableOpacity>
      )}
      {upcoming.map(a => (
        <TouchableOpacity key={a.id} testID={`project-appointment-${a.id}`} style={[s.chip, s.chipSet]} onPress={() => { setEdit(a); setOpen(true); }}>
          <Ionicons name="alarm-outline" size={20} color="#dc2626" style={{ marginRight: 10 }} />
          <View style={{ flex: 1 }}>
            <Text style={s.chipLabel}>{a.title}</Text>
            <Text style={[s.chipValue, { color: '#dc2626' }]}>{pretty(a.date)}{a.time ? `, ${a.time} Uhr` : ''}</Text>
          </View>
          {(a.reminder_id || a.remind_id || a.remind_before || a.travel_minutes) ? <Ionicons name="notifications" size={16} color="#dc2626" style={{ marginRight: 8 }} /> : null}
          {!!a.packing?.length && (
            <Text testID={`project-appointment-${a.id}-packing`} accessibilityLabel={`${a.packing.filter(p => p.done).length} von ${a.packing.length} eingepackt`} style={s.pack}>
              🎒 {a.packing.filter(p => p.done).length}/{a.packing.length}
            </Text>
          )}
          <Ionicons name="create-outline" size={18} color="#dc2626" />
        </TouchableOpacity>
      ))}
      <TouchableOpacity testID="project-appointment" style={s.chip} onPress={() => { setEdit(null); setOpen(true); }}>
        <Ionicons name="calendar-outline" size={20} color="#1976d2" style={{ marginRight: 10 }} />
        <Text style={[s.chipValue, { color: '#1976d2', flex: 1 }]}>{upcoming.length || showLegacy ? 'Weiteren Termin planen' : 'Termin planen'}</Text>
        <Ionicons name="add" size={20} color="#1976d2" />
      </TouchableOpacity>
      <AppointmentFormModal
        visible={open && loaded}
        initial={edit}
        projects={[project]}
        customers={customers}
        initialProjectId={project.id}
        initialDate={!edit && showLegacy ? legacyDate : undefined}
        initialTime={!edit && showLegacy ? legacyTime : undefined}
        onClose={() => setOpen(false)}
        onSaved={afterSave}
      />
    </View>
  );
}

const s = StyleSheet.create({
  chip: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f5f5f5', borderWidth: 1.5, borderColor: '#ddd', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, minHeight: 52, marginBottom: 8 },
  chipSet: { backgroundColor: '#fef2f2', borderColor: '#fca5a5' },
  chipLabel: { fontSize: 11, color: '#666', marginBottom: 2 },
  chipValue: { fontSize: 14, fontWeight: '600' },
  pack: { fontSize: 12, fontWeight: '800', color: '#b45309', marginRight: 8 },
});

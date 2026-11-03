// Gemeinsame Termin-Liste (Projekt-Termine + eigene Termine) für Startseite und Termin-Übersicht
import { Project, Customer } from '../../services/LocalStorage';
import { Appointment } from '../../services/AppointmentService';
import { AgendaItem } from '../components/home/TodayOverview';
import { projectAddress } from '../components/home/AppointmentFormModal';

export function buildAgenda(opts: {
  projects: Project[]; // aktive Projekte
  appointments: Appointment[];
  customers: Record<string, Customer>;
  onOpenProject: (id: string) => void;
  onEditAppointment: (a: Appointment) => void;
}): AgendaItem[] {
  const { projects, appointments, customers, onOpenProject, onEditAppointment } = opts;
  // Projekt-Termin nicht doppelt zeigen, wenn es verknüpfte eigene Termine gibt
  const linked = new Set(appointments.filter(a => a.project_id).map(a => a.project_id));
  const fromProjects: AgendaItem[] = projects.filter(p => !!p.appointment_date && !linked.has(p.id)).map(p => ({
    key: `p-${p.id}`,
    title: p.name,
    subtitle: customers[p.customer_id]?.name,
    date: p.appointment_date as string,
    time: p.appointment_time,
    address: projectAddress(p, customers[p.customer_id]),
    onPress: () => onOpenProject(p.id),
  }));
  const fromAppointments: AgendaItem[] = appointments.map(a => ({
    key: `a-${a.id}`,
    title: a.title,
    subtitle: a.project_id ? projects.find(p => p.id === a.project_id && p.name !== a.title)?.name : undefined,
    date: a.date,
    time: a.time,
    address: a.address,
    note: a.note,
    hasReminder: !!(a.reminder_id || a.remind_id),
    packing: a.packing?.length ? { done: a.packing.filter(p => p.done).length, total: a.packing.length } : undefined,
    onPress: () => onEditAppointment(a),
  }));
  return [...fromProjects, ...fromAppointments]
    .sort((a, b) => (a.date + (a.time || '99')).localeCompare(b.date + (b.time || '99')));
}

import React, { useState, useEffect, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, ActivityIndicator,
} from 'react-native';
import { useRouter, useNavigation } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ProjectService, CustomerService, ReportService,
  EmployeeMasterService, MaterialMasterService, MachineMasterService,
  Project, Customer, Report, EmployeeMaster, MaterialMaster, MachineMaster,
} from '../services/LocalStorage';

type AnyResult =
  | { type: 'project'; data: Project; title: string; subtitle: string }
  | { type: 'customer'; data: Customer; title: string; subtitle: string }
  | { type: 'report'; data: Report; title: string; subtitle: string }
  | { type: 'employee'; data: EmployeeMaster; title: string; subtitle: string }
  | { type: 'material'; data: MaterialMaster; title: string; subtitle: string }
  | { type: 'machine'; data: MachineMaster; title: string; subtitle: string };

const TYPE_META: Record<AnyResult['type'], { label: string; icon: any; color: string; bg: string }> = {
  project:  { label: 'Projekt',     icon: 'folder',          color: '#1976d2', bg: '#dbeafe' },
  customer: { label: 'Kunde',       icon: 'person',          color: '#16a34a', bg: '#dcfce7' },
  report:   { label: 'Rapport',     icon: 'document-text',   color: '#7c3aed', bg: '#ede9fe' },
  employee: { label: 'Mitarbeiter', icon: 'people',          color: '#ea580c', bg: '#fed7aa' },
  material: { label: 'Material',    icon: 'cube',            color: '#0891b2', bg: '#cffafe' },
  machine:  { label: 'Maschine',    icon: 'construct',       color: '#dc2626', bg: '#fee2e2' },
};

export default function GlobalSearchScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<AnyResult['type'] | 'all'>('all');
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState<Project[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [employees, setEmployees] = useState<EmployeeMaster[]>([]);
  const [materials, setMaterials] = useState<MaterialMaster[]>([]);
  const [machines, setMachines] = useState<MachineMaster[]>([]);

  useEffect(() => {
    navigation.setOptions({
      title: 'Globale Suche',
      headerStyle: { backgroundColor: '#1976d2' },
      headerTintColor: '#fff',
    });
  }, [navigation]);

  useEffect(() => {
    (async () => {
      try {
        const [p, c, r, e, m, mc] = await Promise.all([
          ProjectService.getAll(),
          CustomerService.getAll(),
          ReportService.getAll(),
          EmployeeMasterService.getAll(),
          MaterialMasterService.getAll(),
          MachineMasterService.getAll(),
        ]);
        setProjects(p);
        setCustomers(c);
        setReports(r);
        setEmployees(e);
        setMaterials(m);
        setMachines(mc);
      } catch (err) {
        console.error('[GlobalSearch] load failed:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const customerById = useMemo(() => {
    const m: Record<string, Customer> = {};
    customers.forEach(c => { m[c.id] = c; });
    return m;
  }, [customers]);

  const projectById = useMemo(() => {
    const m: Record<string, Project> = {};
    projects.forEach(p => { m[p.id] = p; });
    return m;
  }, [projects]);

  // Suche normalisieren
  const norm = (s: any) => (s == null ? '' : String(s).toLowerCase());
  const q = query.trim().toLowerCase();

  const results = useMemo<AnyResult[]>(() => {
    if (!q) return [];
    const out: AnyResult[] = [];

    // Projekte: Name, Nr., Bauherr, Objekt-Adresse
    projects.forEach(p => {
      const fields = [p.name, p.project_number, p.bauherr_name, p.objekt_street, p.objekt_city, p.project_type].map(norm);
      if (fields.some(f => f.includes(q))) {
        const cust = p.customer_id ? customerById[p.customer_id] : undefined;
        out.push({ type: 'project', data: p, title: p.name, subtitle: [p.project_number, cust?.name, p.objekt_city].filter(Boolean).join(' · ') });
      }
    });
    // Kunden: Name, Adresse, E-Mail, Telefon
    customers.forEach(c => {
      const fields = [c.name, (c as any).email, (c as any).phone, c.address].map(norm);
      if (fields.some(f => f.includes(q))) {
        out.push({ type: 'customer', data: c, title: c.name, subtitle: [(c as any).email, (c as any).phone].filter(Boolean).join(' · ') });
      }
    });
    // Rapporte: Nummer, Datum, Beschreibung
    reports.forEach(r => {
      const fields = [r.report_number, r.date, r.work_description, r.contact_person, r.remarks].map(norm);
      if (fields.some(f => f.includes(q))) {
        const proj = projectById[r.project_id];
        out.push({
          type: 'report',
          data: r,
          title: r.report_number || `Rapport vom ${r.date}`,
          subtitle: [proj?.name, r.date].filter(Boolean).join(' · '),
        });
      }
    });
    // Mitarbeiter
    employees.forEach(e => {
      const fields = [e.name, (e as any).role, (e as any).email, (e as any).phone].map(norm);
      if (fields.some(f => f.includes(q))) {
        out.push({ type: 'employee', data: e, title: e.name, subtitle: (e as any).role || '' });
      }
    });
    // Materialien
    materials.forEach(m => {
      const fields = [m.name, m.category, (m as any).supplier, (m as any).article_number].map(norm);
      if (fields.some(f => f.includes(q))) {
        out.push({
          type: 'material',
          data: m,
          title: m.name,
          subtitle: [m.category, m.stock_quantity != null ? `${m.stock_quantity} ${m.unit || 'Stk'}` : ''].filter(Boolean).join(' · '),
        });
      }
    });
    // Maschinen
    machines.forEach(m => {
      const fields = [m.name, m.manufacturer, m.model, m.license_plate, m.serial_number, m.category, m.storage_location].map(norm);
      if (fields.some(f => f.includes(q))) {
        out.push({
          type: 'machine',
          data: m,
          title: m.name,
          subtitle: [m.manufacturer, m.model, m.license_plate].filter(Boolean).join(' · '),
        });
      }
    });
    return out;
  }, [q, projects, customers, reports, employees, materials, machines, customerById, projectById]);

  const filtered = activeFilter === 'all' ? results : results.filter(r => r.type === activeFilter);

  // Counts pro Typ für Filter-Pills
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: results.length };
    results.forEach(r => { c[r.type] = (c[r.type] || 0) + 1; });
    return c;
  }, [results]);

  const handleResultPress = (r: AnyResult) => {
    switch (r.type) {
      case 'project': router.push(`/projects/${r.data.id}`); break;
      case 'customer': router.push(`/customers`); break;
      case 'report': router.push(`/reports/edit?projectId=${r.data.project_id}&reportId=${r.data.id}`); break;
      case 'employee': router.push('/employees'); break;
      case 'material': router.push('/materials'); break;
      case 'machine': router.push('/machines'); break;
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <View style={styles.searchBox}>
        <Ionicons name="search" size={18} color="#94a3b8" />
        <TextInput
          style={styles.input}
          value={query}
          onChangeText={setQuery}
          placeholder="Projekt, Kunde, Rapport, Material, Maschine…"
          autoFocus
          returnKeyType="search"
        />
        {query ? (
          <TouchableOpacity onPress={() => setQuery('')}>
            <Ionicons name="close-circle" size={18} color="#94a3b8" />
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Filter Pills */}
      {q ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filtersRow}>
          {(['all', 'project', 'customer', 'report', 'employee', 'material', 'machine'] as const).map(f => {
            const cnt = counts[f] || 0;
            const meta = f === 'all' ? null : TYPE_META[f as AnyResult['type']];
            const isActive = activeFilter === f;
            return (
              <TouchableOpacity
                key={f}
                style={[styles.filterPill, isActive && { backgroundColor: meta?.color || '#1976d2', borderColor: meta?.color || '#1976d2' }]}
                onPress={() => setActiveFilter(f)}
              >
                {meta && <Ionicons name={meta.icon} size={12} color={isActive ? '#fff' : meta.color} />}
                <Text style={[styles.filterPillText, isActive && { color: '#fff' }]}>
                  {f === 'all' ? 'Alle' : meta!.label} ({cnt})
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      ) : null}

      {loading ? (
        <View style={styles.empty}><ActivityIndicator size="large" color="#1976d2" /></View>
      ) : !q ? (
        <View style={styles.empty}>
          <Ionicons name="search-outline" size={48} color="#cbd5e1" />
          <Text style={styles.emptyText}>Beginne zu tippen…</Text>
          <Text style={styles.emptySub}>Durchsucht Projekte, Kunden, Rapporte, Mitarbeiter, Materialien & Maschinen</Text>
        </View>
      ) : filtered.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="alert-circle-outline" size={48} color="#cbd5e1" />
          <Text style={styles.emptyText}>Keine Treffer für {`„${query}"`}</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}>
          {filtered.map((r, idx) => {
            const meta = TYPE_META[r.type];
            return (
              <TouchableOpacity
                key={`${r.type}-${(r.data as any).id || idx}`}
                style={styles.resultRow}
                onPress={() => handleResultPress(r)}
              >
                <View style={[styles.resultIcon, { backgroundColor: meta.bg }]}>
                  <Ionicons name={meta.icon} size={20} color={meta.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={[styles.typeBadge, { color: meta.color }]}>{meta.label}</Text>
                  </View>
                  <Text style={styles.resultTitle} numberOfLines={1}>{r.title}</Text>
                  {r.subtitle ? <Text style={styles.resultSub} numberOfLines={1}>{r.subtitle}</Text> : null}
                </View>
                <Ionicons name="chevron-forward" size={20} color="#cbd5e1" />
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9' },
  searchBox: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#fff', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
    marginHorizontal: 12, marginTop: 12, marginBottom: 8,
    borderWidth: 1, borderColor: '#e2e8f0',
  },
  input: { flex: 1, fontSize: 15, color: '#0f172a' },
  filtersRow: { paddingHorizontal: 12, gap: 6, paddingVertical: 6, alignItems: 'center' },
  filterPill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14,
    backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0',
  },
  filterPillText: { fontSize: 11, color: '#475569', fontWeight: '600' },
  empty: { alignItems: 'center', justifyContent: 'center', flex: 1, padding: 30 },
  emptyText: { color: '#64748b', fontWeight: '700', marginTop: 12, fontSize: 15 },
  emptySub: { color: '#94a3b8', textAlign: 'center', marginTop: 6, fontSize: 13, lineHeight: 18 },
  resultRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#fff', marginHorizontal: 12, marginBottom: 6,
    padding: 12, borderRadius: 10,
    borderWidth: 1, borderColor: '#e2e8f0',
  },
  resultIcon: { width: 40, height: 40, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  typeBadge: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
  resultTitle: { fontSize: 14, fontWeight: '700', color: '#0f172a', marginTop: 2 },
  resultSub: { fontSize: 12, color: '#64748b', marginTop: 2 },
});

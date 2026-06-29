import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Modal,
} from 'react-native';
import { useFocusEffect, useNavigation } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { ReportService, Report, ProjectService, Project, EmployeeMasterService, EmployeeMaster } from '../../services/LocalStorage';
import { DatePickerField } from '../../src/components/DatePickerField';

type ViewMode = 'employee' | 'project';
type PresetRange = 'week' | 'month' | 'year' | 'all' | 'custom';

const fmt = (n: number): string => n.toFixed(2).replace('.', ',');
const fmtEUR = (n: number): string => `${n.toFixed(2).replace('.', ',')} €`;
const fmtH = (n: number): string => `${fmt(n)} h`;

// ====== Date helpers ======
const isoDate = (d: Date): string => d.toISOString().slice(0, 10);
const startOfWeek = (d: Date): Date => {
  const x = new Date(d);
  const day = x.getDay(); // 0=So
  const diff = (day === 0 ? -6 : 1 - day);
  x.setDate(x.getDate() + diff);
  x.setHours(0, 0, 0, 0);
  return x;
};
const startOfMonth = (d: Date): Date => { const x = new Date(d); x.setDate(1); x.setHours(0, 0, 0, 0); return x; };
const startOfYear = (d: Date): Date => { const x = new Date(d); x.setMonth(0, 1); x.setHours(0, 0, 0, 0); return x; };
const endOfToday = (): Date => { const x = new Date(); x.setHours(23, 59, 59, 999); return x; };

export default function HoursDashboard() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const [reports, setReports] = useState<Report[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [employees, setEmployees] = useState<EmployeeMaster[]>([]);

  const [viewMode, setViewMode] = useState<ViewMode>('employee');
  const [preset, setPreset] = useState<PresetRange>('month');
  const [fromDate, setFromDate] = useState<string>(isoDate(startOfMonth(new Date())));
  const [toDate, setToDate] = useState<string>(isoDate(endOfToday()));
  const [detailFor, setDetailFor] = useState<{ type: ViewMode; id: string; name: string } | null>(null);

  React.useEffect(() => {
    navigation.setOptions({
      title: 'Stunden-Auswertung',
      headerStyle: { backgroundColor: '#16a34a' },
      headerTintColor: '#fff',
    });
  }, [navigation]);

  const load = useCallback(async () => {
    const [r, p, e] = await Promise.all([
      ReportService.getAll(),
      ProjectService.getAll(),
      EmployeeMasterService.getAll(),
    ]);
    setReports(r);
    setProjects(p);
    setEmployees(e);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // ====== Preset → Date Range ======
  const applyPreset = (p: PresetRange) => {
    setPreset(p);
    const now = new Date();
    if (p === 'week') {
      setFromDate(isoDate(startOfWeek(now)));
      setToDate(isoDate(endOfToday()));
    } else if (p === 'month') {
      setFromDate(isoDate(startOfMonth(now)));
      setToDate(isoDate(endOfToday()));
    } else if (p === 'year') {
      setFromDate(isoDate(startOfYear(now)));
      setToDate(isoDate(endOfToday()));
    } else if (p === 'all') {
      setFromDate('');
      setToDate('');
    }
  };

  // ====== Filtered Reports by Date Range ======
  const filteredReports = useMemo(() => {
    return reports.filter(r => {
      if (!r.date) return false;
      if (fromDate && r.date < fromDate) return false;
      if (toDate && r.date > toDate) return false;
      return true;
    });
  }, [reports, fromDate, toDate]);

  // ====== Stats per Employee ======
  type EmpStat = { id: string; name: string; hours: number; travelHours: number; projects: Set<string>; cost: number; rate: number };
  const employeeStats = useMemo(() => {
    const map = new Map<string, EmpStat>();
    filteredReports.forEach(r => {
      (r.employees || []).forEach(e => {
        const key = e.id || e.name;
        if (!key) return;
        const empMaster = employees.find(em => em.id === e.id || em.name.toLowerCase() === (e.name || '').toLowerCase());
        const rate = empMaster?.hourly_rate || 0;
        if (!map.has(key)) {
          map.set(key, { id: key, name: e.name || 'Unbekannt', hours: 0, travelHours: 0, projects: new Set(), cost: 0, rate });
        }
        const stat = map.get(key)!;
        const h = e.hours || 0;
        const tr = (e.travel_to_hours || 0) + (e.travel_back_hours || 0);
        stat.hours += h;
        stat.travelHours += tr;
        stat.projects.add(r.project_id);
        stat.cost += (h + (r.travel_in_total_hours ? tr : 0)) * rate;
      });
    });
    return Array.from(map.values()).sort((a, b) => b.hours - a.hours);
  }, [filteredReports, employees]);

  // ====== Stats per Project ======
  type ProjStat = { id: string; name: string; objectName: string; hours: number; travelHours: number; employees: Set<string>; cost: number; reportCount: number };
  const projectStats = useMemo(() => {
    const map = new Map<string, ProjStat>();
    filteredReports.forEach(r => {
      const proj = projects.find(p => p.id === r.project_id);
      const projName = proj?.name || 'Unbekanntes Projekt';
      const objName = proj?.objekt_number ? `${proj.objekt_number}` : '';
      if (!map.has(r.project_id)) {
        map.set(r.project_id, { id: r.project_id, name: projName, objectName: objName, hours: 0, travelHours: 0, employees: new Set(), cost: 0, reportCount: 0 });
      }
      const stat = map.get(r.project_id)!;
      stat.reportCount += 1;
      (r.employees || []).forEach(e => {
        const empMaster = employees.find(em => em.id === e.id || em.name.toLowerCase() === (e.name || '').toLowerCase());
        const rate = empMaster?.hourly_rate || 0;
        const h = e.hours || 0;
        const tr = (e.travel_to_hours || 0) + (e.travel_back_hours || 0);
        stat.hours += h;
        stat.travelHours += tr;
        stat.employees.add(e.id || e.name);
        stat.cost += (h + (r.travel_in_total_hours ? tr : 0)) * rate;
      });
    });
    return Array.from(map.values()).sort((a, b) => b.hours - a.hours);
  }, [filteredReports, projects, employees]);

  // ====== Totals ======
  const totals = useMemo(() => {
    let hours = 0, travel = 0, cost = 0;
    employeeStats.forEach(s => { hours += s.hours; travel += s.travelHours; cost += s.cost; });
    return { hours, travel, cost, reportCount: filteredReports.length };
  }, [employeeStats, filteredReports]);

  // ====== Detail Drill-Down ======
  const detailRows = useMemo(() => {
    if (!detailFor) return [];
    if (detailFor.type === 'employee') {
      const rows: { date: string; project: string; hours: number; travel: number; cost: number }[] = [];
      filteredReports.forEach(r => {
        const proj = projects.find(p => p.id === r.project_id);
        (r.employees || []).forEach(e => {
          const key = e.id || e.name;
          if (key !== detailFor.id) return;
          const empMaster = employees.find(em => em.id === e.id || em.name.toLowerCase() === (e.name || '').toLowerCase());
          const rate = empMaster?.hourly_rate || 0;
          const h = e.hours || 0;
          const tr = (e.travel_to_hours || 0) + (e.travel_back_hours || 0);
          rows.push({
            date: r.date,
            project: proj?.name || 'Unbekannt',
            hours: h,
            travel: tr,
            cost: (h + (r.travel_in_total_hours ? tr : 0)) * rate,
          });
        });
      });
      return rows.sort((a, b) => b.date.localeCompare(a.date));
    }
    // Per Project
    const rows: { date: string; employee: string; hours: number; travel: number; cost: number }[] = [];
    filteredReports.filter(r => r.project_id === detailFor.id).forEach(r => {
      (r.employees || []).forEach(e => {
        const empMaster = employees.find(em => em.id === e.id || em.name.toLowerCase() === (e.name || '').toLowerCase());
        const rate = empMaster?.hourly_rate || 0;
        const h = e.hours || 0;
        const tr = (e.travel_to_hours || 0) + (e.travel_back_hours || 0);
        rows.push({
          date: r.date,
          employee: e.name || 'Unbekannt',
          hours: h,
          travel: tr,
          cost: (h + (r.travel_in_total_hours ? tr : 0)) * rate,
        });
      });
    });
    return rows.sort((a, b) => b.date.localeCompare(a.date));
  }, [detailFor, filteredReports, projects, employees]);

  // ====== PDF Export ======
  const handleExportPdf = async () => {
    try {
      const rangeLabel = (!fromDate && !toDate) ? 'Gesamter Zeitraum' : `${fromDate || '—'} bis ${toDate || '—'}`;
      const isEmp = viewMode === 'employee';
      const rows = isEmp
        ? employeeStats.map(s => `<tr><td>${escapeHtml(s.name)}</td><td>${s.projects.size}</td><td style="text-align:right">${fmtH(s.hours)}</td><td style="text-align:right">${fmtH(s.travelHours)}</td><td style="text-align:right">${fmtEUR(s.cost)}</td></tr>`).join('')
        : projectStats.map(s => `<tr><td>${escapeHtml(s.name)}${s.objectName ? ` <span style="color:#64748b">(${escapeHtml(s.objectName)})</span>` : ''}</td><td>${s.employees.size}</td><td style="text-align:right">${fmtH(s.hours)}</td><td style="text-align:right">${fmtH(s.travelHours)}</td><td style="text-align:right">${fmtEUR(s.cost)}</td></tr>`).join('');

      const html = `
<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
body { font-family: -apple-system, sans-serif; padding: 24px; color: #0f172a; }
h1 { font-size: 22px; margin: 0 0 4px; color: #16a34a; }
.sub { color: #64748b; font-size: 12px; margin-bottom: 16px; }
.totals { display: flex; gap: 16px; margin: 16px 0; }
.totalCard { flex: 1; background: #f8fafc; border-radius: 8px; padding: 12px; }
.totalLabel { font-size: 11px; color: #64748b; text-transform: uppercase; }
.totalValue { font-size: 18px; font-weight: 800; color: #0f172a; margin-top: 2px; }
table { width: 100%; border-collapse: collapse; margin-top: 8px; }
th, td { padding: 8px 10px; border-bottom: 1px solid #e2e8f0; font-size: 12px; }
th { background: #f1f5f9; text-align: left; }
tfoot td { font-weight: 700; background: #f1f5f9; border-top: 2px solid #16a34a; }
</style></head><body>
<h1>Stunden-Auswertung</h1>
<div class="sub">${isEmp ? 'Pro Mitarbeiter' : 'Pro Projekt'} · Zeitraum: ${escapeHtml(rangeLabel)}</div>
<div class="totals">
  <div class="totalCard"><div class="totalLabel">Gesamtstunden</div><div class="totalValue">${fmtH(totals.hours)}</div></div>
  <div class="totalCard"><div class="totalLabel">Fahrzeiten</div><div class="totalValue">${fmtH(totals.travel)}</div></div>
  <div class="totalCard"><div class="totalLabel">Lohnkosten</div><div class="totalValue">${fmtEUR(totals.cost)}</div></div>
  <div class="totalCard"><div class="totalLabel">Rapporte</div><div class="totalValue">${totals.reportCount}</div></div>
</div>
<table>
  <thead><tr>
    <th>${isEmp ? 'Mitarbeiter' : 'Projekt'}</th>
    <th>${isEmp ? 'Projekte' : 'Mitarbeiter'}</th>
    <th style="text-align:right">Std.</th>
    <th style="text-align:right">Fahrt</th>
    <th style="text-align:right">Lohnkosten</th>
  </tr></thead>
  <tbody>${rows || '<tr><td colspan="5" style="text-align:center;color:#94a3b8;padding:24px">Keine Daten im gewählten Zeitraum.</td></tr>'}</tbody>
  <tfoot><tr>
    <td colspan="2">Gesamt</td>
    <td style="text-align:right">${fmtH(totals.hours)}</td>
    <td style="text-align:right">${fmtH(totals.travel)}</td>
    <td style="text-align:right">${fmtEUR(totals.cost)}</td>
  </tr></tfoot>
</table>
<div class="sub" style="margin-top:24px">Erstellt am ${new Date().toLocaleString('de-DE')}</div>
</body></html>`;

      const { uri } = await Print.printToFileAsync({ html, base64: false });
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Stunden-Auswertung teilen', UTI: 'com.adobe.pdf' });
      } else {
        Alert.alert('Hinweis', `PDF erstellt unter:\n${uri}`);
      }
    } catch (e: any) {
      console.error('[PDF] Failed', e);
      Alert.alert('Fehler', 'PDF-Export fehlgeschlagen: ' + (e?.message || ''));
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 40 }}>
        {/* Mode Toggle */}
        <View style={styles.modeRow}>
          <TouchableOpacity
            style={[styles.modeBtn, viewMode === 'employee' && styles.modeBtnActive]}
            onPress={() => setViewMode('employee')}
          >
            <Ionicons name="person" size={16} color={viewMode === 'employee' ? '#fff' : '#475569'} />
            <Text style={[styles.modeBtnText, viewMode === 'employee' && styles.modeBtnTextActive]}>Pro Mitarbeiter</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modeBtn, viewMode === 'project' && styles.modeBtnActive]}
            onPress={() => setViewMode('project')}
          >
            <Ionicons name="briefcase" size={16} color={viewMode === 'project' ? '#fff' : '#475569'} />
            <Text style={[styles.modeBtnText, viewMode === 'project' && styles.modeBtnTextActive]}>Pro Projekt</Text>
          </TouchableOpacity>
        </View>

        {/* Date Range Presets */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.presetRow} contentContainerStyle={{ gap: 8, paddingHorizontal: 12 }}>
          {([
            { v: 'week', label: 'Diese Woche' },
            { v: 'month', label: 'Dieser Monat' },
            { v: 'year', label: 'Dieses Jahr' },
            { v: 'all', label: 'Gesamt' },
            { v: 'custom', label: 'Eigener Zeitraum' },
          ] as { v: PresetRange; label: string }[]).map(p => (
            <TouchableOpacity
              key={p.v}
              style={[styles.presetChip, preset === p.v && styles.presetChipActive]}
              onPress={() => applyPreset(p.v)}
            >
              <Text style={[styles.presetChipText, preset === p.v && styles.presetChipTextActive]}>{p.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Custom Date Range */}
        {preset === 'custom' && (
          <View style={{ paddingHorizontal: 12, flexDirection: 'row', gap: 8, marginTop: 8 }}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Von</Text>
              <DatePickerField value={fromDate} onChange={setFromDate} placeholder="Von" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Bis</Text>
              <DatePickerField value={toDate} onChange={setToDate} placeholder="Bis" />
            </View>
          </View>
        )}

        {/* Totals */}
        <View style={styles.totalsRow}>
          <View style={[styles.totalCard, { backgroundColor: '#dcfce7' }]}>
            <Text style={styles.totalLabel}>Gesamtstunden</Text>
            <Text style={[styles.totalValue, { color: '#16a34a' }]}>{fmtH(totals.hours)}</Text>
          </View>
          <View style={[styles.totalCard, { backgroundColor: '#dbeafe' }]}>
            <Text style={styles.totalLabel}>Fahrzeiten</Text>
            <Text style={[styles.totalValue, { color: '#2563eb' }]}>{fmtH(totals.travel)}</Text>
          </View>
          <View style={[styles.totalCard, { backgroundColor: '#fef3c7' }]}>
            <Text style={styles.totalLabel}>Lohnkosten</Text>
            <Text style={[styles.totalValue, { color: '#d97706' }]}>{fmtEUR(totals.cost)}</Text>
          </View>
          <View style={[styles.totalCard, { backgroundColor: '#ede9fe' }]}>
            <Text style={styles.totalLabel}>Rapporte</Text>
            <Text style={[styles.totalValue, { color: '#7c3aed' }]}>{totals.reportCount}</Text>
          </View>
        </View>

        {/* PDF Export Button */}
        <TouchableOpacity style={styles.exportBtn} onPress={handleExportPdf}>
          <Ionicons name="document-text-outline" size={18} color="#fff" />
          <Text style={styles.exportBtnText}>Als PDF exportieren</Text>
        </TouchableOpacity>

        {/* List */}
        <View style={{ paddingHorizontal: 12, marginTop: 8 }}>
          <Text style={styles.sectionTitle}>{viewMode === 'employee' ? 'Mitarbeiter-Übersicht' : 'Projekt-Übersicht'}</Text>
          {viewMode === 'employee' ? (
            employeeStats.length === 0 ? (
              <Text style={styles.empty}>Keine Stunden im gewählten Zeitraum.</Text>
            ) : employeeStats.map(s => (
              <TouchableOpacity
                key={s.id}
                style={styles.rowCard}
                onPress={() => setDetailFor({ type: 'employee', id: s.id, name: s.name })}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowName}>{s.name}</Text>
                  <Text style={styles.rowSub}>{s.projects.size} {s.projects.size === 1 ? 'Projekt' : 'Projekte'} · {s.rate > 0 ? `${fmtEUR(s.rate)}/Std` : 'kein Stundensatz'}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={styles.rowValue}>{fmtH(s.hours)}</Text>
                  {s.travelHours > 0 && <Text style={styles.rowTravel}>+ {fmtH(s.travelHours)} Fahrt</Text>}
                  <Text style={styles.rowCost}>{fmtEUR(s.cost)}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#cbd5e1" />
              </TouchableOpacity>
            ))
          ) : (
            projectStats.length === 0 ? (
              <Text style={styles.empty}>Keine Stunden im gewählten Zeitraum.</Text>
            ) : projectStats.map(s => (
              <TouchableOpacity
                key={s.id}
                style={styles.rowCard}
                onPress={() => setDetailFor({ type: 'project', id: s.id, name: s.name })}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowName}>{s.name}</Text>
                  <Text style={styles.rowSub}>{s.employees.size} {s.employees.size === 1 ? 'Mitarbeiter' : 'Mitarbeiter'} · {s.reportCount} {s.reportCount === 1 ? 'Rapport' : 'Rapporte'}{s.objectName ? ` · ${s.objectName}` : ''}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={styles.rowValue}>{fmtH(s.hours)}</Text>
                  {s.travelHours > 0 && <Text style={styles.rowTravel}>+ {fmtH(s.travelHours)} Fahrt</Text>}
                  <Text style={styles.rowCost}>{fmtEUR(s.cost)}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#cbd5e1" />
              </TouchableOpacity>
            ))
          )}
        </View>
      </ScrollView>

      {/* Detail Modal */}
      <Modal visible={!!detailFor} transparent animationType="slide" onRequestClose={() => setDetailFor(null)}>
        <View style={[styles.modalOverlay, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 }]}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitle}>{detailFor?.name}</Text>
                <Text style={styles.modalSub}>{detailFor?.type === 'employee' ? 'Mitarbeiter-Details' : 'Projekt-Details'}</Text>
              </View>
              <TouchableOpacity onPress={() => setDetailFor(null)}>
                <Ionicons name="close" size={26} color="#666" />
              </TouchableOpacity>
            </View>
            <ScrollView>
              {detailRows.length === 0 ? (
                <Text style={styles.empty}>Keine Einträge.</Text>
              ) : detailRows.map((r, idx) => (
                <View key={idx} style={styles.detailRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.detailDate}>{r.date}</Text>
                    <Text style={styles.detailLabel}>{('project' in r) ? r.project : ('employee' in r ? r.employee : '')}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={styles.detailValue}>{fmtH(r.hours)}</Text>
                    {r.travel > 0 && <Text style={styles.rowTravel}>+ {fmtH(r.travel)}</Text>}
                    {r.cost > 0 && <Text style={styles.rowCost}>{fmtEUR(r.cost)}</Text>}
                  </View>
                </View>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const escapeHtml = (s: string): string => (s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  modeRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingTop: 12 },
  modeBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: 10, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0' },
  modeBtnActive: { backgroundColor: '#16a34a', borderColor: '#16a34a' },
  modeBtnText: { fontSize: 13, fontWeight: '700', color: '#475569' },
  modeBtnTextActive: { color: '#fff' },
  presetRow: { marginTop: 12 },
  presetChip: { paddingHorizontal: 14, paddingVertical: 8, backgroundColor: '#fff', borderRadius: 20, borderWidth: 1, borderColor: '#e2e8f0' },
  presetChipActive: { backgroundColor: '#16a34a', borderColor: '#16a34a' },
  presetChipText: { fontSize: 12, fontWeight: '600', color: '#475569' },
  presetChipTextActive: { color: '#fff' },
  label: { fontSize: 11, color: '#64748b', marginBottom: 4 },
  totalsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 12, marginTop: 12 },
  totalCard: { flex: 1, minWidth: '47%', borderRadius: 10, padding: 12 },
  totalLabel: { fontSize: 10, fontWeight: '700', color: '#64748b', textTransform: 'uppercase' },
  totalValue: { fontSize: 18, fontWeight: '800', marginTop: 2 },
  exportBtn: { marginHorizontal: 12, marginTop: 12, backgroundColor: '#16a34a', borderRadius: 10, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  exportBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: '#0f172a', marginTop: 12, marginBottom: 8 },
  empty: { textAlign: 'center', color: '#94a3b8', paddingVertical: 24 },
  rowCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 10, padding: 12, marginBottom: 8, gap: 8 },
  rowName: { fontSize: 14, fontWeight: '700', color: '#0f172a' },
  rowSub: { fontSize: 11, color: '#64748b', marginTop: 2 },
  rowValue: { fontSize: 15, fontWeight: '800', color: '#16a34a' },
  rowTravel: { fontSize: 10, color: '#2563eb', marginTop: 1 },
  rowCost: { fontSize: 12, color: '#d97706', fontWeight: '700', marginTop: 1 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 16 },
  modalContent: { backgroundColor: '#fff', borderRadius: 14, padding: 16, width: '100%', maxWidth: 500, maxHeight: '85%' },
  modalHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12 },
  modalTitle: { fontSize: 18, fontWeight: '800', color: '#0f172a' },
  modalSub: { fontSize: 12, color: '#64748b', marginTop: 2 },
  detailRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f1f5f9', gap: 12 },
  detailDate: { fontSize: 12, fontWeight: '700', color: '#0f172a' },
  detailLabel: { fontSize: 11, color: '#64748b', marginTop: 2 },
  detailValue: { fontSize: 14, fontWeight: '700', color: '#16a34a' },
});

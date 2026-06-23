import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert,
  ActivityIndicator, Modal, Platform, KeyboardAvoidingView, Image,
} from 'react-native';
import { useRouter, useLocalSearchParams, useNavigation } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import {
  ReportService, ProjectService, CustomerService,
  EmployeeMasterService, MaterialMasterService, MachineMasterService, ChecklistService,
  Report, ReportEmployee, ReportMaterial, ReportPhoto, ReportMachine, ReportWorkItem,
  Project, Customer, EmployeeMaster, MaterialMaster, MachineMaster, Checklist,
} from '../../services/LocalStorage';
import { SignaturePad } from '../../src/components/SignaturePad';
import { exportReportAsPdf } from '../../services/ReportPdfService';

const WEATHER_OPTIONS: { value: Report['weather']; label: string; icon: string }[] = [
  { value: 'sunny', label: 'Sonnig', icon: '☀️' },
  { value: 'cloudy', label: 'Bewölkt', icon: '☁️' },
  { value: 'rain', label: 'Regen', icon: '🌧️' },
  { value: 'snow', label: 'Schnee', icon: '🌨️' },
  { value: 'wind', label: 'Wind', icon: '💨' },
  { value: 'fog', label: 'Nebel', icon: '🌫️' },
];

// Farbpalette für Mitarbeiter-Avatars
const AVATAR_COLORS = ['#1976d2', '#16a34a', '#ea580c', '#7c3aed', '#db2777', '#0891b2', '#ca8a04', '#dc2626'];

const localId = () => Date.now().toString(36) + Math.random().toString(36).substr(2, 5);

// Berechnet Stunden aus Beginn, Ende und Pause (Minuten)
const calcEmpHours = (from?: string, to?: string, pauseMin?: number): number => {
  if (!from || !to) return 0;
  const [fh, fm] = from.split(':').map(Number);
  const [th, tm] = to.split(':').map(Number);
  if (isNaN(fh) || isNaN(fm) || isNaN(th) || isNaN(tm)) return 0;
  let mins = (th * 60 + tm) - (fh * 60 + fm);
  if (mins < 0) mins += 24 * 60;
  mins -= pauseMin || 0;
  if (mins < 0) mins = 0;
  return Math.round((mins / 60) * 100) / 100;
};

export default function ReportEditScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const params = useLocalSearchParams<{ projectId?: string; reportId?: string }>();
  const projectId = Array.isArray(params.projectId) ? params.projectId[0] : params.projectId;
  const reportId = Array.isArray(params.reportId) ? params.reportId[0] : params.reportId;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [project, setProject] = useState<Project | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [scrollEnabled, setScrollEnabled] = useState(true);

  // Stammdaten
  const [empMaster, setEmpMaster] = useState<EmployeeMaster[]>([]);
  const [matMaster, setMatMaster] = useState<MaterialMaster[]>([]);
  const [machMaster, setMachMaster] = useState<MachineMaster[]>([]);
  const [projChecklists, setProjChecklists] = useState<Checklist[]>([]);

  const [showEmpPicker, setShowEmpPicker] = useState(false);
  const [showMatPicker, setShowMatPicker] = useState(false);
  const [showMachPicker, setShowMachPicker] = useState(false);
  const [showChecklistPicker, setShowChecklistPicker] = useState(false);

  // Form
  const [reportNumber, setReportNumber] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [contactPerson, setContactPerson] = useState('');
  const [employees, setEmployees] = useState<ReportEmployee[]>([]);
  const [workItems, setWorkItems] = useState<ReportWorkItem[]>([]);
  const [workDescription, setWorkDescription] = useState('');
  const [materials, setMaterials] = useState<ReportMaterial[]>([]);
  const [machines, setMachines] = useState<ReportMachine[]>([]);
  const [travelKm, setTravelKm] = useState<string>('');
  const [weather, setWeather] = useState<Report['weather']>('');
  const [temperature, setTemperature] = useState<string>('');
  const [obstacles, setObstacles] = useState('');
  const [remarks, setRemarks] = useState('');
  const [signatureCustomer, setSignatureCustomer] = useState('');
  const [signatureCustomerName, setSignatureCustomerName] = useState('');
  const [signatureWorker, setSignatureWorker] = useState('');
  const [signatureWorkerName, setSignatureWorkerName] = useState('');
  const [photos, setPhotos] = useState<ReportPhoto[]>([]);

  // Time-Picker State (für Mitarbeiter-Tabelle)
  const [timePickerFor, setTimePickerFor] = useState<{ empId: string; field: 'time_from' | 'time_to' } | null>(null);
  const [pauseModal, setPauseModal] = useState<{ empId: string } | null>(null);
  const [pauseInput, setPauseInput] = useState('');

  useEffect(() => {
    navigation.setOptions({
      title: reportId ? 'Rapport bearbeiten' : 'Neuer Rapport',
      headerStyle: { backgroundColor: '#0f172a' },
      headerTintColor: '#fff',
    });
  }, [navigation, reportId]);

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, reportId]);

  const loadData = async () => {
    if (!projectId) {
      Alert.alert('Fehler', 'Projekt-ID fehlt.');
      router.back();
      return;
    }
    try {
      setLoading(true);
      const [proj, emps, mats, machs, checklists] = await Promise.all([
        ProjectService.getById(projectId),
        EmployeeMasterService.getActive(),
        MaterialMasterService.getActive(),
        MachineMasterService.getActive(),
        ChecklistService.getByProjectId(projectId),
      ]);
      setProject(proj);
      setEmpMaster(emps);
      setMatMaster(mats);
      setMachMaster(machs);
      setProjChecklists(checklists);
      if (proj?.customer_id) {
        const cust = await CustomerService.getById(proj.customer_id);
        setCustomer(cust);
      }

      if (reportId) {
        const r = await ReportService.getById(reportId);
        if (r) {
          setReportNumber(r.report_number || '');
          setDate(r.date || new Date().toISOString().split('T')[0]);
          setContactPerson(r.contact_person || '');
          setEmployees(r.employees || []);
          setWorkItems(r.work_items || []);
          setWorkDescription(r.work_description || '');
          setMaterials(r.materials || []);
          setMachines(r.machines || []);
          setTravelKm(r.travel_km != null ? String(r.travel_km) : '');
          setWeather(r.weather || '');
          setTemperature(r.temperature != null ? String(r.temperature) : '');
          setObstacles(r.obstacles || '');
          setRemarks(r.remarks || '');
          setSignatureCustomer(r.signature_customer || '');
          setSignatureCustomerName(r.signature_customer_name || '');
          setSignatureWorker(r.signature_worker || '');
          setSignatureWorkerName(r.signature_worker_name || '');
          setPhotos(r.photos || []);
        }
      } else {
        const nextNum = await ReportService.getNextReportNumber(projectId);
        setReportNumber(nextNum);
      }
    } catch (e) {
      console.error('Error loading report:', e);
      Alert.alert('Fehler', 'Daten konnten nicht geladen werden.');
    } finally {
      setLoading(false);
    }
  };

  // Gesamtstunden aller Mitarbeiter
  const totalAllHours = employees.reduce((sum, e) => {
    const h = e.hours ?? calcEmpHours(e.time_from, e.time_to, e.pause_minutes);
    return sum + (h || 0);
  }, 0);

  // ---- Vortag übernehmen ----
  const handleApplyPrevious = async () => {
    if (!projectId) return;
    const prev = await ReportService.getLatestForProject(projectId, reportId);
    if (!prev) {
      Alert.alert('Hinweis', 'Es ist kein vorheriger Rapport in diesem Projekt vorhanden.');
      return;
    }
    Alert.alert(
      'Vortag übernehmen?',
      `Felder aus Rapport ${prev.report_number || ''} (${new Date(prev.date).toLocaleDateString('de-DE')}) übernehmen?\n\nDie Unterschriften und Fotos werden NICHT übernommen.`,
      [
        { text: 'Abbrechen', style: 'cancel' },
        {
          text: 'Übernehmen',
          onPress: () => {
            setContactPerson(prev.contact_person || '');
            // Mitarbeiter mit gleicher Zeit aber leere Pause kopieren
            setEmployees((prev.employees || []).map(e => ({ ...e, id: localId() })));
            setWorkItems((prev.work_items || []).map(w => ({ ...w, id: localId(), checked: false })));
            setWorkDescription(prev.work_description || '');
            setMaterials((prev.materials || []).map(m => ({ ...m, id: localId() })));
            setMachines((prev.machines || []).map(m => ({ ...m, id: localId() })));
            setTravelKm(prev.travel_km != null ? String(prev.travel_km) : '');
            setWeather(prev.weather || '');
            setTemperature(prev.temperature != null ? String(prev.temperature) : '');
            setObstacles('');
            setRemarks('');
          },
        },
      ]
    );
  };

  // ---- Save ----
  const handleSave = async (alsoExport = false): Promise<Report | null> => {
    if (!projectId) return null;
    setSaving(true);
    try {
      // Stunden für jeden Mitarbeiter neu berechnen
      const empsWithHours = employees.map(e => ({
        ...e,
        hours: e.hours != null ? e.hours : calcEmpHours(e.time_from, e.time_to, e.pause_minutes),
      }));

      const dataToSave: Omit<Report, 'id' | 'created_at' | 'updated_at'> = {
        project_id: projectId,
        report_number: reportNumber || undefined,
        date,
        total_hours: totalAllHours || undefined,
        contact_person: contactPerson || undefined,
        employees: empsWithHours,
        work_items: workItems,
        work_description: workDescription,
        materials,
        machines,
        travel_km: travelKm ? parseFloat(travelKm) : undefined,
        weather: weather || undefined,
        temperature: temperature ? parseFloat(temperature) : undefined,
        obstacles: obstacles || undefined,
        remarks: remarks || undefined,
        signature_customer: signatureCustomer || undefined,
        signature_customer_name: signatureCustomerName || undefined,
        signature_worker: signatureWorker || undefined,
        signature_worker_name: signatureWorkerName || undefined,
        signed_at: (signatureCustomer || signatureWorker) ? new Date().toISOString() : undefined,
        photos,
      };
      let saved: Report | null;
      if (reportId) {
        saved = await ReportService.update(reportId, dataToSave);
      } else {
        saved = await ReportService.create(dataToSave);
      }
      if (alsoExport && saved) {
        await exportReportAsPdf(saved, project, customer);
      } else {
        Alert.alert('Gespeichert', 'Rapport wurde gespeichert.');
        router.back();
      }
      return saved;
    } catch (e) {
      console.error('Save error:', e);
      Alert.alert('Fehler', 'Rapport konnte nicht gespeichert werden.');
      return null;
    } finally {
      setSaving(false);
    }
  };

  const handleExportPdf = async () => { await handleSave(true); };

  // ---- Mitarbeiter Zeile ----
  const addEmployeeManual = () => {
    setEmployees(prev => [...prev, {
      id: localId(), name: '', time_from: '07:00', time_to: '16:00', pause_minutes: 30,
      color: AVATAR_COLORS[prev.length % AVATAR_COLORS.length],
    }]);
  };
  const addEmployeeFromMaster = (emp: EmployeeMaster) => {
    setEmployees(prev => [...prev, {
      id: localId(), name: emp.name, time_from: '07:00', time_to: '16:00', pause_minutes: 30,
      color: AVATAR_COLORS[prev.length % AVATAR_COLORS.length],
    }]);
    setShowEmpPicker(false);
  };
  const updateEmployee = (id: string, patch: Partial<ReportEmployee>) => {
    setEmployees(prev => prev.map(e => e.id === id ? { ...e, ...patch } : e));
  };
  const removeEmployee = (id: string) => setEmployees(prev => prev.filter(e => e.id !== id));

  // ---- Material ----
  const addMaterialManual = () => {
    setMaterials(prev => [...prev, { id: localId(), name: '', quantity: 1, unit: 'Stk' }]);
  };
  const addMaterialFromMaster = (mat: MaterialMaster) => {
    setMaterials(prev => [...prev, { id: localId(), name: mat.name, quantity: mat.default_quantity ?? 1, unit: mat.unit }]);
    setShowMatPicker(false);
  };
  const updateMaterial = (id: string, field: keyof ReportMaterial, value: string) => {
    setMaterials(prev => prev.map(m => m.id === id
      ? { ...m, [field]: field === 'quantity' ? (parseFloat(value) || 0) : value }
      : m));
  };
  const removeMaterial = (id: string) => setMaterials(prev => prev.filter(m => m.id !== id));

  // ---- Maschinen ----
  const addMachineManual = () => setMachines(prev => [...prev, { id: localId(), name: '' }]);
  const addMachineFromMaster = (m: MachineMaster) => {
    setMachines(prev => [...prev, { id: localId(), name: m.name }]);
    setShowMachPicker(false);
  };
  const updateMachine = (id: string, field: keyof ReportMachine, value: string) => {
    setMachines(prev => prev.map(m => m.id === id ? { ...m, [field]: value } : m));
  };
  const removeMachine = (id: string) => setMachines(prev => prev.filter(m => m.id !== id));

  // ---- Work Items / Checklisten ----
  const toggleWorkItem = (id: string) => {
    setWorkItems(prev => prev.map(w => w.id === id ? { ...w, checked: !w.checked } : w));
  };
  const removeWorkItem = (id: string) => setWorkItems(prev => prev.filter(w => w.id !== id));
  const addWorkItemManual = () => {
    setWorkItems(prev => [...prev, { id: localId(), text: '', checked: true, source: 'manual' }]);
  };
  const updateWorkItemText = (id: string, text: string) => {
    setWorkItems(prev => prev.map(w => w.id === id ? { ...w, text } : w));
  };
  const importChecklistItems = (cl: Checklist) => {
    // Flatten alle Items (inkl. subItems)
    const flatten = (items: any[], prefix = ''): { text: string; checked: boolean }[] => {
      const out: { text: string; checked: boolean }[] = [];
      for (const it of items) {
        if (it.text) out.push({ text: prefix + it.text, checked: !!it.checked });
        if (it.subItems && it.subItems.length > 0) {
          out.push(...flatten(it.subItems, prefix + '  ↳ '));
        }
      }
      return out;
    };
    const newItems = flatten(cl.items || []).map(i => ({
      id: localId(),
      text: i.text,
      checked: i.checked,
      source: 'checklist' as const,
    }));
    setWorkItems(prev => [...prev, ...newItems]);
    setShowChecklistPicker(false);
  };

  // ---- Fotos ----
  const handleAddPhoto = async (source: 'camera' | 'library') => {
    try {
      const perm = source === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Berechtigung', source === 'camera' ? 'Kamera-Zugriff erforderlich.' : 'Galerie-Zugriff erforderlich.');
        return;
      }
      const result = source === 'camera'
        ? await ImagePicker.launchCameraAsync({ quality: 0.6, base64: true })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'] as any, allowsMultipleSelection: true, quality: 0.6, base64: true });
      if (result.canceled) return;
      const assets = (result as any).assets || [];
      const newPhotos: ReportPhoto[] = assets
        .filter((a: any) => a.base64)
        .map((a: any) => ({ id: localId(), uri: `data:image/jpeg;base64,${a.base64}`, caption: '' }));
      setPhotos(prev => [...prev, ...newPhotos]);
    } catch (e) {
      console.error('Photo add error:', e);
    }
  };
  const removePhoto = (id: string) => setPhotos(prev => prev.filter(p => p.id !== id));
  const updatePhotoCaption = (id: string, caption: string) =>
    setPhotos(prev => prev.map(p => (p.id === id ? { ...p, caption } : p)));

  if (loading) {
    return <View style={styles.loadingContainer}><ActivityIndicator size="large" color="#1976d2" /></View>;
  }

  // Bauherr-Name aus Projektdaten (verschiedene Formate möglich)
  const p = project as any;
  const bauherrFull = project
    ? [project.bauherr_salutation, p?.bauherr_first_name || p?.bauherr_firstName, p?.bauherr_last_name || p?.bauherr_lastName].filter(Boolean).join(' ') || project.bauherr_name || ''
    : '';
  const objektStr = project?.objekt_street
    ? `${project.objekt_street}, ${project.objekt_plz || ''} ${project.objekt_city || ''}`.trim()
    : '';

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={{ paddingBottom: 100 }}
          keyboardShouldPersistTaps="handled"
          scrollEnabled={scrollEnabled}
        >
          {/* ===== 1. Projekt-Block (oben) ===== */}
          <View style={styles.topCard}>
            <View style={styles.topGrid}>
              <View style={[styles.topField, { flex: 2 }]}>
                <View style={styles.topFieldHeader}>
                  <Ionicons name="briefcase-outline" size={14} color="#475569" />
                  <Text style={styles.topFieldLabel}>Projekt</Text>
                </View>
                <Text style={styles.topFieldValue} numberOfLines={1}>
                  {project?.name || '—'}{project?.project_number ? ` · ${project.project_number}` : ''}
                </Text>
              </View>
              <View style={[styles.topField, { flex: 1 }]}>
                <View style={styles.topFieldHeader}>
                  <Ionicons name="calendar-outline" size={14} color="#475569" />
                  <Text style={styles.topFieldLabel}>Datum</Text>
                </View>
                <TouchableOpacity onPress={() => setShowDatePicker(true)}>
                  <Text style={styles.topFieldValue}>{new Date(date).toLocaleDateString('de-DE')}</Text>
                </TouchableOpacity>
              </View>
            </View>

            {objektStr ? (
              <View style={styles.topField}>
                <View style={styles.topFieldHeader}>
                  <Ionicons name="location-outline" size={14} color="#475569" />
                  <Text style={styles.topFieldLabel}>Baustelle</Text>
                </View>
                <Text style={styles.topFieldValue} numberOfLines={1}>{objektStr}</Text>
              </View>
            ) : null}

            <View style={styles.topGrid}>
              <View style={[styles.topField, { flex: 1 }]}>
                <View style={styles.topFieldHeader}>
                  <Ionicons name="person-outline" size={14} color="#475569" />
                  <Text style={styles.topFieldLabel}>Kunde</Text>
                </View>
                <Text style={styles.topFieldValue} numberOfLines={1}>{bauherrFull || '—'}</Text>
              </View>
              <View style={[styles.topField, { flex: 1 }]}>
                <View style={styles.topFieldHeader}>
                  <Ionicons name="call-outline" size={14} color="#475569" />
                  <Text style={styles.topFieldLabel}>Ansprechpartner</Text>
                </View>
                <TextInput
                  style={styles.topFieldInput}
                  value={contactPerson}
                  onChangeText={setContactPerson}
                  placeholder="z.B. Herr Müller"
                />
              </View>
            </View>

            {/* Rapport-Nr. + Wetter */}
            <View style={styles.topGrid}>
              <View style={[styles.topField, { flex: 1 }]}>
                <View style={styles.topFieldHeader}>
                  <Ionicons name="document-text-outline" size={14} color="#475569" />
                  <Text style={styles.topFieldLabel}>Rapport-Nr.</Text>
                </View>
                <TextInput
                  style={styles.topFieldInput}
                  value={reportNumber}
                  onChangeText={setReportNumber}
                  placeholder="RAP-0001"
                />
              </View>
              <View style={[styles.topField, { flex: 1 }]}>
                <View style={styles.topFieldHeader}>
                  <Ionicons name="partly-sunny-outline" size={14} color="#475569" />
                  <Text style={styles.topFieldLabel}>Wetter</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={{ fontSize: 13, color: '#0f172a', flex: 1 }} numberOfLines={1}>
                    {weather ? (WEATHER_OPTIONS.find(w => w.value === weather)?.icon + ' ' + WEATHER_OPTIONS.find(w => w.value === weather)?.label) : '—'}
                    {temperature ? ` · ${temperature}°C` : ''}
                  </Text>
                </View>
              </View>
            </View>
            <View style={styles.weatherRow}>
              {WEATHER_OPTIONS.map(opt => (
                <TouchableOpacity
                  key={opt.value}
                  style={[styles.weatherChip, weather === opt.value && styles.weatherChipActive]}
                  onPress={() => setWeather(weather === opt.value ? '' : opt.value)}
                >
                  <Text style={styles.weatherIconText}>{opt.icon}</Text>
                </TouchableOpacity>
              ))}
              <TextInput
                style={styles.tempInput}
                value={temperature}
                onChangeText={setTemperature}
                placeholder="°C"
                keyboardType="numbers-and-punctuation"
              />
            </View>
          </View>

          {showDatePicker && (
            <>
              <DateTimePicker
                value={date ? new Date(date) : new Date()}
                mode="date"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                onChange={(_, selected) => {
                  if (Platform.OS !== 'ios') setShowDatePicker(false);
                  if (selected) setDate(selected.toISOString().split('T')[0]);
                }}
              />
              {Platform.OS === 'ios' && (
                <TouchableOpacity onPress={() => setShowDatePicker(false)} style={styles.iosPickerDone}>
                  <Text style={styles.iosPickerDoneText}>Fertig</Text>
                </TouchableOpacity>
              )}
            </>
          )}

          {/* ===== 2. Mitarbeiter & Arbeitszeiten (Tabelle) ===== */}
          <Section
            icon="time-outline"
            title="Mitarbeiter & Arbeitszeiten"
            subtitle="Mehrere Einträge pro Tag möglich."
            color="#1976d2"
            right={
              <View style={{ flexDirection: 'row', gap: 6 }}>
                {empMaster.length > 0 && (
                  <TouchableOpacity onPress={() => setShowEmpPicker(true)} style={styles.sectionBtnPrimary}>
                    <Ionicons name="people" size={14} color="#fff" />
                    <Text style={styles.sectionBtnPrimaryText}>Auswählen</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity onPress={addEmployeeManual} style={styles.sectionBtnPrimary}>
                  <Ionicons name="add" size={14} color="#fff" />
                  <Text style={styles.sectionBtnPrimaryText}>Neu</Text>
                </TouchableOpacity>
              </View>
            }
          >
            {employees.length === 0 ? (
              <TouchableOpacity onPress={empMaster.length > 0 ? () => setShowEmpPicker(true) : addEmployeeManual} style={styles.emptyAddRow}>
                <Ionicons name="person-add-outline" size={18} color="#1976d2" />
                <Text style={styles.emptyAddText}>Mitarbeiter hinzufügen</Text>
              </TouchableOpacity>
            ) : (
              <>
                {/* Tabellenkopf */}
                <View style={styles.empTableHeader}>
                  <Text style={[styles.empCol, { flex: 2 }]}>Mitarbeiter</Text>
                  <Text style={[styles.empCol, { width: 56, textAlign: 'center' }]}>Beginn</Text>
                  <Text style={[styles.empCol, { width: 56, textAlign: 'center' }]}>Ende</Text>
                  <Text style={[styles.empCol, { width: 50, textAlign: 'center' }]}>Pause</Text>
                  <Text style={[styles.empCol, { width: 50, textAlign: 'right' }]}>Std.</Text>
                  <View style={{ width: 24 }} />
                </View>
                {employees.map((emp) => {
                  const hours = emp.hours ?? calcEmpHours(emp.time_from, emp.time_to, emp.pause_minutes);
                  return (
                    <View key={emp.id} style={styles.empRow}>
                      <View style={{ flex: 2, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <View style={[styles.empAvatar, { backgroundColor: emp.color || '#1976d2' }]}>
                          <Text style={styles.empAvatarText}>{(emp.name || '?').charAt(0).toUpperCase()}</Text>
                        </View>
                        <TextInput
                          style={styles.empNameInput}
                          value={emp.name}
                          onChangeText={(v) => updateEmployee(emp.id, { name: v })}
                          placeholder="Name"
                        />
                      </View>
                      <TouchableOpacity
                        style={styles.timeCell}
                        onPress={() => setTimePickerFor({ empId: emp.id, field: 'time_from' })}
                      >
                        <Text style={styles.timeCellText}>{emp.time_from || '--:--'}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.timeCell}
                        onPress={() => setTimePickerFor({ empId: emp.id, field: 'time_to' })}
                      >
                        <Text style={styles.timeCellText}>{emp.time_to || '--:--'}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.timeCellSmall}
                        onPress={() => {
                          setPauseInput(emp.pause_minutes ? String(emp.pause_minutes) : '');
                          setPauseModal({ empId: emp.id });
                        }}
                      >
                        <Text style={styles.timeCellText}>{emp.pause_minutes != null ? `${emp.pause_minutes}` : '0'}</Text>
                      </TouchableOpacity>
                      <Text style={styles.hoursCell}>{hours.toFixed(2)}</Text>
                      <TouchableOpacity onPress={() => removeEmployee(emp.id)} style={styles.itemRemoveBtn}>
                        <Ionicons name="trash-outline" size={16} color="#ef4444" />
                      </TouchableOpacity>
                    </View>
                  );
                })}
                {/* Gesamtsumme */}
                <View style={styles.empSumRow}>
                  <Text style={styles.empSumLabel}>Gesamtstunden aller Mitarbeiter</Text>
                  <Text style={styles.empSumValue}>{totalAllHours.toFixed(2)} h</Text>
                </View>
              </>
            )}
          </Section>

          {/* ===== 3. Ausgeführte Arbeiten (Checkbox-Liste + Beschreibung) ===== */}
          <Section
            icon="hammer-outline"
            title="Ausgeführte Arbeiten"
            color="#0d9488"
            right={
              <View style={{ flexDirection: 'row', gap: 6 }}>
                {projChecklists.length > 0 && (
                  <TouchableOpacity onPress={() => setShowChecklistPicker(true)} style={styles.sectionBtnPrimary}>
                    <Ionicons name="checkbox-outline" size={14} color="#fff" />
                    <Text style={styles.sectionBtnPrimaryText}>Aus Checkliste</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity onPress={addWorkItemManual} style={styles.sectionBtnPrimary}>
                  <Ionicons name="add" size={14} color="#fff" />
                  <Text style={styles.sectionBtnPrimaryText}>Neu</Text>
                </TouchableOpacity>
              </View>
            }
          >
            {workItems.length === 0 && (
              <Text style={styles.hintText}>
                Tippe auf Aus Checkliste um Punkte aus den Projekt-Checklisten zu importieren, oder ergänze freie Punkte.
              </Text>
            )}
            {workItems.map(item => (
              <View key={item.id} style={styles.workItemRow}>
                <TouchableOpacity onPress={() => toggleWorkItem(item.id)} style={[styles.checkbox, item.checked && styles.checkboxActive]}>
                  {item.checked && <Ionicons name="checkmark" size={14} color="#fff" />}
                </TouchableOpacity>
                <TextInput
                  style={[styles.workItemText, !item.checked && { color: '#94a3b8', textDecorationLine: 'line-through' }]}
                  value={item.text}
                  onChangeText={(v) => updateWorkItemText(item.id, v)}
                  placeholder="Arbeit beschreiben..."
                  multiline
                />
                <TouchableOpacity onPress={() => removeWorkItem(item.id)} style={styles.itemRemoveBtn}>
                  <Ionicons name="close" size={18} color="#94a3b8" />
                </TouchableOpacity>
              </View>
            ))}
            <Text style={[styles.miniLabel, { marginTop: 10 }]}>Beschreibung</Text>
            <TextInput
              style={[styles.input, styles.multiline]}
              value={workDescription}
              onChangeText={setWorkDescription}
              placeholder="Zusätzliche Beschreibung der ausgeführten Arbeiten..."
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />
          </Section>

          {/* ===== 4. Material ===== */}
          <Section
            icon="cube-outline"
            title="Materialverbrauch"
            color="#d97706"
            right={
              <View style={{ flexDirection: 'row', gap: 6 }}>
                {matMaster.length > 0 && (
                  <TouchableOpacity onPress={() => setShowMatPicker(true)} style={styles.sectionBtnPrimary}>
                    <Ionicons name="list" size={14} color="#fff" />
                    <Text style={styles.sectionBtnPrimaryText}>Auswählen</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity onPress={addMaterialManual} style={styles.sectionBtnPrimary}>
                  <Ionicons name="add" size={14} color="#fff" />
                  <Text style={styles.sectionBtnPrimaryText}>Neu</Text>
                </TouchableOpacity>
              </View>
            }
          >
            {materials.length === 0 ? (
              <TouchableOpacity onPress={matMaster.length > 0 ? () => setShowMatPicker(true) : addMaterialManual} style={styles.emptyAddRow}>
                <Ionicons name="cube-outline" size={18} color="#1976d2" />
                <Text style={styles.emptyAddText}>Material hinzufügen</Text>
              </TouchableOpacity>
            ) : (
              <>
                <View style={styles.matTableHeader}>
                  <Text style={[styles.empCol, { flex: 2 }]}>Material</Text>
                  <Text style={[styles.empCol, { width: 60, textAlign: 'right' }]}>Menge</Text>
                  <Text style={[styles.empCol, { width: 50, textAlign: 'center' }]}>Einh.</Text>
                  <View style={{ width: 24 }} />
                </View>
                {materials.map(m => (
                  <View key={m.id} style={styles.matRow}>
                    <TextInput
                      style={[styles.itemInput, { flex: 2 }]}
                      value={m.name}
                      onChangeText={(v) => updateMaterial(m.id, 'name', v)}
                      placeholder="Material"
                    />
                    <TextInput
                      style={[styles.itemInput, { width: 60, textAlign: 'right' }]}
                      value={m.quantity ? String(m.quantity) : ''}
                      onChangeText={(v) => updateMaterial(m.id, 'quantity', v)}
                      placeholder="0"
                      keyboardType="decimal-pad"
                    />
                    <TextInput
                      style={[styles.itemInput, { width: 50, textAlign: 'center' }]}
                      value={m.unit}
                      onChangeText={(v) => updateMaterial(m.id, 'unit', v)}
                      placeholder="Stk"
                    />
                    <TouchableOpacity onPress={() => removeMaterial(m.id)} style={styles.itemRemoveBtn}>
                      <Ionicons name="trash-outline" size={16} color="#ef4444" />
                    </TouchableOpacity>
                  </View>
                ))}
              </>
            )}
          </Section>

          {/* ===== 5. Maschinen & Geräte ===== */}
          <Section
            icon="construct-outline"
            title="Maschinen / Geräte"
            color="#7c3aed"
            right={
              <View style={{ flexDirection: 'row', gap: 6 }}>
                {machMaster.length > 0 && (
                  <TouchableOpacity onPress={() => setShowMachPicker(true)} style={styles.sectionBtnPrimary}>
                    <Ionicons name="list" size={14} color="#fff" />
                    <Text style={styles.sectionBtnPrimaryText}>Auswählen</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity onPress={addMachineManual} style={styles.sectionBtnPrimary}>
                  <Ionicons name="add" size={14} color="#fff" />
                  <Text style={styles.sectionBtnPrimaryText}>Neu</Text>
                </TouchableOpacity>
              </View>
            }
          >
            {machines.length === 0 ? (
              <TouchableOpacity onPress={machMaster.length > 0 ? () => setShowMachPicker(true) : addMachineManual} style={styles.emptyAddRow}>
                <Ionicons name="construct-outline" size={18} color="#1976d2" />
                <Text style={styles.emptyAddText}>Maschine / Gerät hinzufügen</Text>
              </TouchableOpacity>
            ) : (
              <View style={styles.chipGrid}>
                {machines.map(m => (
                  <View key={m.id} style={styles.machineChip}>
                    <Ionicons name="construct" size={14} color="#7c3aed" />
                    <TextInput
                      style={styles.machineChipInput}
                      value={m.name}
                      onChangeText={(v) => updateMachine(m.id, 'name', v)}
                      placeholder="Bezeichnung"
                    />
                    <TouchableOpacity onPress={() => removeMachine(m.id)}>
                      <Ionicons name="close-circle" size={18} color="#94a3b8" />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}
          </Section>

          {/* ===== 6. Besonderheiten / Behinderungen ===== */}
          <Section icon="information-circle-outline" title="Besonderheiten / Behinderungen" color="#dc2626">
            <TextInput
              style={[styles.input, styles.multiline]}
              value={obstacles}
              onChangeText={setObstacles}
              placeholder="z.B. Wetterumschwung, fehlendes Material, Verzögerungen..."
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />
          </Section>

          {/* ===== 7. Fotos ===== */}
          <Section
            icon="camera-outline"
            title="Fotos"
            color="#0891b2"
            right={
              <View style={{ flexDirection: 'row', gap: 6 }}>
                <TouchableOpacity onPress={() => handleAddPhoto('camera')} style={styles.sectionBtnPrimary}>
                  <Ionicons name="camera" size={14} color="#fff" />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => handleAddPhoto('library')} style={styles.sectionBtnPrimary}>
                  <Ionicons name="images" size={14} color="#fff" />
                </TouchableOpacity>
              </View>
            }
          >
            {photos.length === 0 ? (
              <TouchableOpacity onPress={() => handleAddPhoto('library')} style={styles.emptyAddRow}>
                <Ionicons name="image-outline" size={18} color="#1976d2" />
                <Text style={styles.emptyAddText}>Foto hinzufügen</Text>
              </TouchableOpacity>
            ) : (
              <View style={styles.photoGrid}>
                {photos.map(p => (
                  <View key={p.id} style={styles.photoCard}>
                    <Image source={{ uri: p.uri }} style={styles.photoImg} resizeMode="cover" />
                    <TouchableOpacity style={styles.photoDelete} onPress={() => removePhoto(p.id)}>
                      <Ionicons name="close-circle" size={22} color="#fff" />
                    </TouchableOpacity>
                    <TextInput
                      style={styles.photoCaption}
                      value={p.caption || ''}
                      onChangeText={(v) => updatePhotoCaption(p.id, v)}
                      placeholder="Beschriftung"
                    />
                  </View>
                ))}
              </View>
            )}
          </Section>

          {/* ===== 8. Sonstige Notizen + Anfahrt ===== */}
          <Section icon="document-text-outline" title="Notizen & Anfahrt" color="#ec4899">
            <Text style={styles.miniLabel}>Anfahrt (km)</Text>
            <TextInput
              style={styles.input}
              value={travelKm}
              onChangeText={setTravelKm}
              placeholder="z.B. 25"
              keyboardType="decimal-pad"
            />
            <Text style={[styles.miniLabel, { marginTop: 10 }]}>Notizen</Text>
            <TextInput
              style={[styles.input, styles.multiline]}
              value={remarks}
              onChangeText={setRemarks}
              placeholder="Eigene Notizen..."
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />
          </Section>

          {/* ===== 9. Unterschriften ===== */}
          <Section icon="create-outline" title="Unterschriften" color="#0f172a">
            <View style={styles.sigBlock}>
              <SignaturePad
                label="Kunde / Auftraggeber"
                value={signatureCustomer}
                onChange={setSignatureCustomer}
                onDrawingChange={setScrollEnabled}
                placeholder="Hier unterschreiben (Kunde)"
                height={140}
              />
              <TextInput
                style={[styles.input, { marginTop: 6 }]}
                value={signatureCustomerName}
                onChangeText={setSignatureCustomerName}
                placeholder="Name in Druckbuchstaben (optional)"
              />
            </View>
            <View style={styles.sigBlock}>
              <SignaturePad
                label="Handwerker / Auftragnehmer"
                value={signatureWorker}
                onChange={setSignatureWorker}
                onDrawingChange={setScrollEnabled}
                placeholder="Hier unterschreiben (Handwerker)"
                height={140}
              />
              <TextInput
                style={[styles.input, { marginTop: 6 }]}
                value={signatureWorkerName}
                onChangeText={setSignatureWorkerName}
                placeholder="Name in Druckbuchstaben (optional)"
              />
            </View>
          </Section>
        </ScrollView>

        {/* ===== Footer mit "Vortag übernehmen" + Save/PDF ===== */}
        <View style={styles.actionBar}>
          <TouchableOpacity style={styles.barIconBtn} onPress={() => router.back()}>
            <Ionicons name="close" size={22} color="#64748b" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.barTextBtn} onPress={handleApplyPrevious}>
            <Ionicons name="copy-outline" size={16} color="#1976d2" />
            <Text style={styles.barTextBtnText}>Vortag</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.barFlexBtn, { backgroundColor: '#ff9800' }]} onPress={handleExportPdf} disabled={saving}>
            <Ionicons name="document-text" size={16} color="#fff" />
            <Text style={styles.barFlexBtnText}>PDF</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.barFlexBtn, { backgroundColor: '#16a34a', flex: 1.4 }]} onPress={() => handleSave(false)} disabled={saving}>
            {saving ? <ActivityIndicator color="#fff" /> : (
              <>
                <Ionicons name="checkmark" size={18} color="#fff" />
                <Text style={styles.barFlexBtnText}>Speichern</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* ====== Modals ====== */}

        {/* Time Picker für Mitarbeiter */}
        {timePickerFor && (
          <>
            <DateTimePicker
              value={(() => {
                const emp = employees.find(e => e.id === timePickerFor.empId);
                const val = emp?.[timePickerFor.field] as string | undefined;
                if (val) {
                  const [h, m] = val.split(':').map(Number);
                  const d = new Date(); d.setHours(h, m, 0, 0); return d;
                }
                return new Date();
              })()}
              mode="time"
              is24Hour
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              onChange={(_, selected) => {
                const isIos = Platform.OS === 'ios';
                if (!selected) {
                  if (!isIos) setTimePickerFor(null);
                  return;
                }
                const hh = String(selected.getHours()).padStart(2, '0');
                const mm = String(selected.getMinutes()).padStart(2, '0');
                updateEmployee(timePickerFor.empId, { [timePickerFor.field]: `${hh}:${mm}` } as any);
                if (!isIos) {
                  // Android auto-advance: bei 'from' direkt zu 'to'
                  if (timePickerFor.field === 'time_from') {
                    setTimeout(() => setTimePickerFor({ empId: timePickerFor.empId, field: 'time_to' }), 80);
                  } else {
                    setTimePickerFor(null);
                  }
                }
              }}
            />
            {Platform.OS === 'ios' && (
              <View style={styles.iosTimeActions}>
                <TouchableOpacity onPress={() => setTimePickerFor(null)} style={styles.iosTimeCancel}>
                  <Text style={styles.iosTimeCancelText}>Abbrechen</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => {
                    if (timePickerFor.field === 'time_from') {
                      setTimePickerFor({ empId: timePickerFor.empId, field: 'time_to' });
                    } else {
                      setTimePickerFor(null);
                    }
                  }}
                  style={styles.iosTimeDone}
                >
                  <Text style={styles.iosTimeDoneText}>
                    {timePickerFor.field === 'time_from' ? 'Weiter zu Ende →' : 'Fertig'}
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </>
        )}

        {/* Pause Modal */}
        <Modal visible={!!pauseModal} transparent animationType="fade" onRequestClose={() => setPauseModal(null)}>
          <View style={styles.modalOverlayCenter}>
            <View style={styles.modalSmall}>
              <Text style={styles.modalTitle}>Pause in Minuten</Text>
              <TextInput
                style={[styles.input, { fontSize: 18, textAlign: 'center', marginTop: 10 }]}
                value={pauseInput}
                onChangeText={setPauseInput}
                placeholder="0"
                keyboardType="number-pad"
                autoFocus
              />
              <View style={styles.modalActions}>
                <TouchableOpacity style={[styles.modalBtn, styles.cancelBtn]} onPress={() => setPauseModal(null)}>
                  <Text style={styles.cancelBtnText}>Abbrechen</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalBtn, styles.saveBtn]}
                  onPress={() => {
                    if (pauseModal) {
                      updateEmployee(pauseModal.empId, { pause_minutes: pauseInput ? parseInt(pauseInput, 10) : 0 });
                    }
                    setPauseModal(null);
                  }}
                >
                  <Ionicons name="checkmark" size={18} color="#fff" />
                  <Text style={styles.saveBtnText}>OK</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* Mitarbeiter-Picker */}
        <Modal visible={showEmpPicker} transparent animationType="slide" onRequestClose={() => setShowEmpPicker(false)}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalSheet}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Mitarbeiter wählen</Text>
                <TouchableOpacity onPress={() => setShowEmpPicker(false)}><Ionicons name="close" size={26} color="#666" /></TouchableOpacity>
              </View>
              <ScrollView style={{ maxHeight: 400 }}>
                {empMaster.length === 0 ? (
                  <Text style={styles.modalEmpty}>Keine Mitarbeiter angelegt.</Text>
                ) : empMaster.map(emp => (
                  <TouchableOpacity key={emp.id} style={styles.pickerRow} onPress={() => addEmployeeFromMaster(emp)}>
                    <View style={[styles.empAvatar, { backgroundColor: AVATAR_COLORS[Math.abs(emp.id.charCodeAt(0)) % AVATAR_COLORS.length] }]}>
                      <Text style={styles.empAvatarText}>{emp.name.charAt(0).toUpperCase()}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.pickerName}>{emp.name}</Text>
                      {emp.role ? <Text style={styles.pickerSub}>{emp.role}</Text> : null}
                    </View>
                    <Ionicons name="add-circle" size={24} color="#1976d2" />
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <TouchableOpacity style={styles.modalCloseBtn} onPress={() => setShowEmpPicker(false)}>
                <Text style={styles.modalCloseText}>Fertig</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* Material-Picker */}
        <Modal visible={showMatPicker} transparent animationType="slide" onRequestClose={() => setShowMatPicker(false)}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalSheet}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Material wählen</Text>
                <TouchableOpacity onPress={() => setShowMatPicker(false)}><Ionicons name="close" size={26} color="#666" /></TouchableOpacity>
              </View>
              <ScrollView style={{ maxHeight: 400 }}>
                {matMaster.length === 0 ? (
                  <Text style={styles.modalEmpty}>Kein Material angelegt.</Text>
                ) : matMaster.map(m => (
                  <TouchableOpacity key={m.id} style={styles.pickerRow} onPress={() => addMaterialFromMaster(m)}>
                    <View style={[styles.empAvatar, { backgroundColor: '#fef3c7' }]}>
                      <Ionicons name="cube" size={18} color="#f59e0b" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.pickerName}>{m.name}</Text>
                      <Text style={styles.pickerSub}>{m.unit}{m.category ? ` · ${m.category}` : ''}</Text>
                    </View>
                    <Ionicons name="add-circle" size={24} color="#1976d2" />
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <TouchableOpacity style={styles.modalCloseBtn} onPress={() => setShowMatPicker(false)}>
                <Text style={styles.modalCloseText}>Fertig</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* Maschinen-Picker */}
        <Modal visible={showMachPicker} transparent animationType="slide" onRequestClose={() => setShowMachPicker(false)}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalSheet}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Maschine / Gerät wählen</Text>
                <TouchableOpacity onPress={() => setShowMachPicker(false)}><Ionicons name="close" size={26} color="#666" /></TouchableOpacity>
              </View>
              <ScrollView style={{ maxHeight: 400 }}>
                {machMaster.length === 0 ? (
                  <Text style={styles.modalEmpty}>Keine Maschinen angelegt.</Text>
                ) : machMaster.map(m => (
                  <TouchableOpacity key={m.id} style={styles.pickerRow} onPress={() => addMachineFromMaster(m)}>
                    <View style={[styles.empAvatar, { backgroundColor: '#ede9fe' }]}>
                      <Ionicons name="construct" size={18} color="#7c3aed" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.pickerName}>{m.name}</Text>
                      {m.category ? <Text style={styles.pickerSub}>{m.category}</Text> : null}
                    </View>
                    <Ionicons name="add-circle" size={24} color="#1976d2" />
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <TouchableOpacity style={styles.modalCloseBtn} onPress={() => setShowMachPicker(false)}>
                <Text style={styles.modalCloseText}>Fertig</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* Checklist-Picker */}
        <Modal visible={showChecklistPicker} transparent animationType="slide" onRequestClose={() => setShowChecklistPicker(false)}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalSheet}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Aus Checkliste importieren</Text>
                <TouchableOpacity onPress={() => setShowChecklistPicker(false)}><Ionicons name="close" size={26} color="#666" /></TouchableOpacity>
              </View>
              <Text style={[styles.hintText, { marginBottom: 10 }]}>
                Wähle eine Checkliste – alle Punkte werden mit aktuellem Status übernommen.
              </Text>
              <ScrollView style={{ maxHeight: 400 }}>
                {projChecklists.length === 0 ? (
                  <Text style={styles.modalEmpty}>Keine Checklisten in diesem Projekt.</Text>
                ) : projChecklists.map(cl => {
                  const total = (cl.items || []).length;
                  const checked = (cl.items || []).filter((i: any) => i.checked).length;
                  return (
                    <TouchableOpacity key={cl.id} style={styles.pickerRow} onPress={() => importChecklistItems(cl)}>
                      <View style={[styles.empAvatar, { backgroundColor: '#dcfce7' }]}>
                        <Ionicons name="checkbox" size={18} color="#16a34a" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.pickerName}>{cl.template_name}</Text>
                        <Text style={styles.pickerSub}>{checked} / {total} erledigt</Text>
                      </View>
                      <Ionicons name="download" size={22} color="#1976d2" />
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
              <TouchableOpacity style={styles.modalCloseBtn} onPress={() => setShowChecklistPicker(false)}>
                <Text style={styles.modalCloseText}>Schließen</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const Section: React.FC<{
  icon: any; title: string; subtitle?: string; color: string;
  right?: React.ReactNode; children: React.ReactNode;
}> = ({ icon, title, subtitle, color, right, children }) => (
  <View style={styles.section}>
    <View style={styles.sectionHeader}>
      <View style={[styles.sectionTitleRow, { flex: 1 }]}>
        <View style={[styles.sectionIcon, { backgroundColor: color + '20' }]}>
          <Ionicons name={icon} size={16} color={color} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.sectionTitle, { color: '#0f172a' }]}>{title}</Text>
          {subtitle ? <Text style={styles.sectionSubtitle}>{subtitle}</Text> : null}
        </View>
      </View>
      {right}
    </View>
    {children}
  </View>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scrollView: { flex: 1 },

  // --- Top Card ---
  topCard: {
    backgroundColor: '#fff',
    margin: 10,
    padding: 12,
    borderRadius: 12,
    borderTopWidth: 3,
    borderTopColor: '#0f172a',
  },
  topGrid: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  topField: {},
  topFieldHeader: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 3 },
  topFieldLabel: { fontSize: 10, fontWeight: '700', color: '#64748b', letterSpacing: 0.5, textTransform: 'uppercase' },
  topFieldValue: { fontSize: 13, color: '#0f172a', fontWeight: '600', minHeight: 20 },
  topFieldInput: {
    fontSize: 13, color: '#0f172a', fontWeight: '600',
    borderBottomWidth: 1, borderBottomColor: '#e2e8f0',
    paddingVertical: 2, minHeight: 20,
  },

  // --- Sections ---
  section: {
    backgroundColor: '#fff', marginHorizontal: 10, marginBottom: 8,
    borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#e2e8f0',
  },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10, gap: 8 },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionIcon: { width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  sectionTitle: { fontSize: 14, fontWeight: '700' },
  sectionSubtitle: { fontSize: 11, color: '#94a3b8', marginTop: 1 },
  sectionBtnPrimary: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 6,
    backgroundColor: '#1976d2', borderRadius: 8,
  },
  sectionBtnPrimaryText: { color: '#fff', fontSize: 11, fontWeight: '700' },

  // --- Hint ---
  hintText: { fontSize: 12, color: '#64748b', fontStyle: 'italic', lineHeight: 17, paddingHorizontal: 4 },
  miniLabel: { fontSize: 11, color: '#64748b', fontWeight: '600', marginBottom: 4 },

  // --- Empty add row ---
  emptyAddRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 12, paddingHorizontal: 10,
    backgroundColor: '#f8fafc', borderRadius: 8,
    borderWidth: 1, borderColor: '#e2e8f0', borderStyle: 'dashed',
  },
  emptyAddText: { color: '#1976d2', fontWeight: '600', fontSize: 13 },

  // --- Employee table ---
  empTableHeader: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#f1f5f9', paddingVertical: 6, paddingHorizontal: 4,
    borderRadius: 6, marginBottom: 4, gap: 4,
  },
  empCol: { fontSize: 10, fontWeight: '700', color: '#64748b', textTransform: 'uppercase' },
  empRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 4, paddingHorizontal: 4,
    borderBottomWidth: 1, borderBottomColor: '#f1f5f9',
    gap: 4,
  },
  empAvatar: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  empAvatarText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  empNameInput: {
    flex: 1, fontSize: 13, color: '#0f172a', fontWeight: '600',
    paddingVertical: 4, paddingHorizontal: 4,
  },
  timeCell: {
    width: 56, height: 32,
    backgroundColor: '#e0f2fe', borderRadius: 6,
    alignItems: 'center', justifyContent: 'center',
  },
  timeCellSmall: {
    width: 50, height: 32,
    backgroundColor: '#fef3c7', borderRadius: 6,
    alignItems: 'center', justifyContent: 'center',
  },
  timeCellText: { fontSize: 12, fontWeight: '700', color: '#0f172a' },
  hoursCell: {
    width: 50, textAlign: 'right',
    fontSize: 13, fontWeight: '800', color: '#1976d2',
  },
  empSumRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginTop: 8, padding: 10,
    backgroundColor: '#e0f2fe', borderRadius: 8,
  },
  empSumLabel: { fontSize: 12, fontWeight: '600', color: '#475569' },
  empSumValue: { fontSize: 16, fontWeight: '800', color: '#1976d2' },

  // --- Work Items / Checklist ---
  workItemRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#f1f5f9',
  },
  checkbox: {
    width: 22, height: 22, borderRadius: 5,
    borderWidth: 2, borderColor: '#cbd5e1', backgroundColor: '#fff',
    alignItems: 'center', justifyContent: 'center', marginTop: 6,
  },
  checkboxActive: { backgroundColor: '#16a34a', borderColor: '#16a34a' },
  workItemText: { flex: 1, fontSize: 13, color: '#0f172a', paddingVertical: 4, minHeight: 32 },

  // --- Material table ---
  matTableHeader: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fef3c7', paddingVertical: 6, paddingHorizontal: 4,
    borderRadius: 6, marginBottom: 4, gap: 4,
  },
  matRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 3, gap: 4,
    borderBottomWidth: 1, borderBottomColor: '#fffbeb',
  },

  // --- Machines chips ---
  chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  machineChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 10, paddingVertical: 6,
    backgroundColor: '#ede9fe', borderRadius: 16,
    borderWidth: 1, borderColor: '#ddd6fe',
  },
  machineChipInput: { minWidth: 60, maxWidth: 140, fontSize: 13, color: '#0f172a', fontWeight: '600' },

  // --- Inputs ---
  input: {
    backgroundColor: '#fff', borderWidth: 1, borderColor: '#cbd5e1',
    borderRadius: 8, paddingHorizontal: 10, paddingVertical: 9,
    fontSize: 13, color: '#0f172a',
  },
  itemInput: {
    backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0',
    borderRadius: 6, paddingHorizontal: 6, paddingVertical: 6,
    fontSize: 12, color: '#0f172a', minHeight: 32,
  },
  itemRemoveBtn: { padding: 4 },
  multiline: { minHeight: 70, textAlignVertical: 'top', paddingTop: 8 },

  // --- Weather ---
  weatherRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6, alignItems: 'center' },
  weatherChip: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0',
    alignItems: 'center', justifyContent: 'center',
  },
  weatherChipActive: { backgroundColor: '#1976d2', borderColor: '#1976d2' },
  weatherIconText: { fontSize: 16 },
  tempInput: {
    width: 70, paddingHorizontal: 8, paddingVertical: 6,
    backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0',
    borderRadius: 8, fontSize: 12, textAlign: 'center',
  },

  // --- Photos ---
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  photoCard: {
    width: '48%', backgroundColor: '#fff', borderRadius: 10,
    borderWidth: 1, borderColor: '#e2e8f0', overflow: 'hidden',
    position: 'relative',
  },
  photoImg: { width: '100%', height: 180 },
  photoDelete: { position: 'absolute', top: 4, right: 4, backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 12 },
  photoCaption: { fontSize: 12, padding: 6, borderTopWidth: 1, borderTopColor: '#eee' },

  // --- Signatures ---
  sigBlock: { marginBottom: 12 },

  // --- iOS time pickers ---
  iosPickerDone: { alignSelf: 'flex-end', padding: 8, marginRight: 10 },
  iosPickerDoneText: { color: '#1976d2', fontWeight: '700' },
  iosTimeActions: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingBottom: 6,
  },
  iosTimeCancel: { padding: 8 },
  iosTimeCancelText: { color: '#94a3b8', fontWeight: '600' },
  iosTimeDone: { backgroundColor: '#1976d2', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  iosTimeDoneText: { color: '#fff', fontWeight: '700' },

  // --- Action bar ---
  actionBar: {
    flexDirection: 'row', gap: 6, padding: 8,
    borderTopWidth: 1, borderTopColor: '#e2e8f0', backgroundColor: '#fff',
    alignItems: 'center',
  },
  barIconBtn: {
    width: 44, height: 44, borderRadius: 10,
    backgroundColor: '#f1f5f9',
    alignItems: 'center', justifyContent: 'center',
  },
  barTextBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 10,
    borderRadius: 10, backgroundColor: '#e0f2fe',
  },
  barTextBtnText: { color: '#1976d2', fontWeight: '700', fontSize: 12 },
  barFlexBtn: {
    flex: 0.8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 4, paddingVertical: 12, borderRadius: 10,
  },
  barFlexBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },

  // --- Modals ---
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalOverlayCenter: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalSheet: {
    backgroundColor: '#fff', borderTopLeftRadius: 18, borderTopRightRadius: 18,
    padding: 14, maxHeight: '80%',
  },
  modalSmall: { backgroundColor: '#fff', borderRadius: 14, padding: 16, width: '100%', maxWidth: 320 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  modalTitle: { fontSize: 16, fontWeight: '700', color: '#0f172a' },
  modalEmpty: { color: '#94a3b8', fontStyle: 'italic', padding: 20, textAlign: 'center' },
  pickerRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    padding: 10, borderBottomWidth: 1, borderBottomColor: '#f1f5f9',
  },
  pickerName: { fontWeight: '600', color: '#0f172a', fontSize: 14 },
  pickerSub: { fontSize: 12, color: '#64748b', marginTop: 1 },
  modalCloseBtn: { backgroundColor: '#1976d2', paddingVertical: 12, borderRadius: 10, alignItems: 'center', marginTop: 10 },
  modalCloseText: { color: '#fff', fontWeight: '700' },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  modalBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, borderRadius: 8, gap: 6 },
  cancelBtn: { backgroundColor: '#eceff1' },
  cancelBtnText: { color: '#555', fontWeight: '600' },
  saveBtn: { backgroundColor: '#16a34a' },
  saveBtnText: { color: '#fff', fontWeight: '700' },
});

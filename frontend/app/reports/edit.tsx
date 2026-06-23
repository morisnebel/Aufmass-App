import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  Modal,
  Platform,
  KeyboardAvoidingView,
  Image,
} from 'react-native';
import { useRouter, useLocalSearchParams, useNavigation } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import {
  ReportService,
  ProjectService,
  CustomerService,
  EmployeeMasterService,
  MaterialMasterService,
  Report,
  ReportEmployee,
  ReportMaterial,
  ReportPhoto,
  Project,
  Customer,
  EmployeeMaster,
  MaterialMaster,
} from '../../services/LocalStorage';
import { SignaturePad } from '../../src/components/SignaturePad';
import { exportReportAsPdf, calcHoursFromTimes } from '../../services/ReportPdfService';

const WEATHER_OPTIONS: { value: Report['weather']; label: string; icon: string }[] = [
  { value: 'sunny', label: 'Sonnig', icon: '☀️' },
  { value: 'cloudy', label: 'Bewölkt', icon: '☁️' },
  { value: 'rain', label: 'Regen', icon: '🌧️' },
  { value: 'snow', label: 'Schnee', icon: '🌨️' },
  { value: 'wind', label: 'Wind', icon: '💨' },
  { value: 'fog', label: 'Nebel', icon: '🌫️' },
];

const localId = () => Date.now().toString(36) + Math.random().toString(36).substr(2, 5);

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
  const [showEmpPicker, setShowEmpPicker] = useState(false);
  const [showMatPicker, setShowMatPicker] = useState(false);

  // Form Felder
  const [reportNumber, setReportNumber] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [timeFrom, setTimeFrom] = useState('');
  const [timeTo, setTimeTo] = useState('');
  const [totalHours, setTotalHours] = useState<string>('');
  const [employees, setEmployees] = useState<ReportEmployee[]>([]);
  const [workDescription, setWorkDescription] = useState('');
  const [materials, setMaterials] = useState<ReportMaterial[]>([]);
  const [travelKm, setTravelKm] = useState<string>('');
  const [travelTime, setTravelTime] = useState<string>('');
  const [weather, setWeather] = useState<Report['weather']>('');
  const [temperature, setTemperature] = useState<string>('');
  const [remarks, setRemarks] = useState('');
  const [signatureCustomer, setSignatureCustomer] = useState('');
  const [signatureCustomerName, setSignatureCustomerName] = useState('');
  const [signatureWorker, setSignatureWorker] = useState('');
  const [signatureWorkerName, setSignatureWorkerName] = useState('');
  const [photos, setPhotos] = useState<ReportPhoto[]>([]);

  // Time picker
  const [showTimePicker, setShowTimePicker] = useState<null | 'from' | 'to'>(null);

  useEffect(() => {
    navigation.setOptions({
      title: reportId ? 'Rapport bearbeiten' : 'Neuer Rapport',
      headerStyle: { backgroundColor: '#1976d2' },
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
      const [proj, emps, mats] = await Promise.all([
        ProjectService.getById(projectId),
        EmployeeMasterService.getActive(),
        MaterialMasterService.getActive(),
      ]);
      setProject(proj);
      setEmpMaster(emps);
      setMatMaster(mats);
      if (proj?.customer_id) {
        const cust = await CustomerService.getById(proj.customer_id);
        setCustomer(cust);
      }

      if (reportId) {
        const r = await ReportService.getById(reportId);
        if (r) {
          setReportNumber(r.report_number || '');
          setDate(r.date || new Date().toISOString().split('T')[0]);
          setTimeFrom(r.time_from || '');
          setTimeTo(r.time_to || '');
          setTotalHours(r.total_hours != null ? String(r.total_hours) : '');
          setEmployees(r.employees || []);
          setWorkDescription(r.work_description || '');
          setMaterials(r.materials || []);
          setTravelKm(r.travel_km != null ? String(r.travel_km) : '');
          setTravelTime(r.travel_time != null ? String(r.travel_time) : '');
          setWeather(r.weather || '');
          setTemperature(r.temperature != null ? String(r.temperature) : '');
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

  const computedHours = calcHoursFromTimes(timeFrom, timeTo);

  // ---- Save ----
  const handleSave = async (alsoExport = false): Promise<Report | null> => {
    if (!projectId) return null;
    setSaving(true);
    try {
      const dataToSave: Omit<Report, 'id' | 'created_at' | 'updated_at'> = {
        project_id: projectId,
        report_number: reportNumber || undefined,
        date,
        time_from: timeFrom || undefined,
        time_to: timeTo || undefined,
        total_hours: totalHours ? parseFloat(totalHours) : (computedHours || undefined),
        employees,
        work_description: workDescription,
        materials,
        travel_km: travelKm ? parseFloat(travelKm) : undefined,
        travel_time: travelTime ? parseFloat(travelTime) : undefined,
        weather: weather || undefined,
        temperature: temperature ? parseFloat(temperature) : undefined,
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

  // ---- Time Picker with auto-advance ----
  const handleTimeChange = (_: any, selected?: Date) => {
    const isIos = Platform.OS === 'ios';
    if (!selected) {
      if (!isIos) setShowTimePicker(null);
      return;
    }
    const hh = String(selected.getHours()).padStart(2, '0');
    const mm = String(selected.getMinutes()).padStart(2, '0');
    const val = `${hh}:${mm}`;
    if (showTimePicker === 'from') {
      setTimeFrom(val);
      if (!isIos) {
        // Android: schließe diesen Picker und öffne sofort den Bis-Picker
        setShowTimePicker(null);
        setTimeout(() => setShowTimePicker('to'), 50);
      }
    } else if (showTimePicker === 'to') {
      setTimeTo(val);
      if (!isIos) setShowTimePicker(null);
    }
  };

  // iOS: "Weiter zu Bis" Button bei 'from'
  const handleIosTimeNextOrDone = () => {
    if (showTimePicker === 'from') {
      // Falls noch keine Zeit gesetzt, jetzige Stunde nehmen
      if (!timeFrom) {
        const now = new Date();
        const hh = String(now.getHours()).padStart(2, '0');
        const mm = String(now.getMinutes()).padStart(2, '0');
        setTimeFrom(`${hh}:${mm}`);
      }
      setShowTimePicker('to');
    } else {
      if (!timeTo) {
        const now = new Date();
        const hh = String(now.getHours()).padStart(2, '0');
        const mm = String(now.getMinutes()).padStart(2, '0');
        setTimeTo(`${hh}:${mm}`);
      }
      setShowTimePicker(null);
    }
  };

  const getTimePickerValue = (): Date => {
    const v = showTimePicker === 'from' ? timeFrom : timeTo;
    if (v) {
      const [h, m] = v.split(':').map(Number);
      const d = new Date();
      d.setHours(h, m, 0, 0);
      return d;
    }
    return new Date();
  };

  // ---- Mitarbeiter ----
  const addEmployeeManual = () => {
    setEmployees((prev) => [...prev, { id: localId(), name: '', hours: undefined }]);
  };
  const addEmployeeFromMaster = (emp: EmployeeMaster) => {
    setEmployees((prev) => [...prev, { id: localId(), name: emp.name, hours: undefined }]);
    setShowEmpPicker(false);
  };
  const updateEmployee = (id: string, field: 'name' | 'hours', value: string) => {
    setEmployees((prev) =>
      prev.map((e) =>
        e.id === id
          ? { ...e, [field]: field === 'hours' ? (value ? parseFloat(value) : undefined) : value }
          : e
      )
    );
  };
  const removeEmployee = (id: string) => {
    setEmployees((prev) => prev.filter((e) => e.id !== id));
  };

  // ---- Material ----
  const addMaterialManual = () => {
    setMaterials((prev) => [...prev, { id: localId(), name: '', quantity: 1, unit: 'Stk' }]);
  };
  const addMaterialFromMaster = (mat: MaterialMaster) => {
    setMaterials((prev) => [...prev, {
      id: localId(),
      name: mat.name,
      quantity: mat.default_quantity ?? 1,
      unit: mat.unit,
    }]);
    setShowMatPicker(false);
  };
  const updateMaterial = (id: string, field: keyof ReportMaterial, value: string) => {
    setMaterials((prev) =>
      prev.map((m) =>
        m.id === id
          ? { ...m, [field]: field === 'quantity' ? (parseFloat(value) || 0) : value }
          : m
      )
    );
  };
  const removeMaterial = (id: string) => {
    setMaterials((prev) => prev.filter((m) => m.id !== id));
  };

  // ---- Fotos ----
  const handleAddPhoto = async (source: 'camera' | 'library') => {
    try {
      let permResult;
      if (source === 'camera') {
        permResult = await ImagePicker.requestCameraPermissionsAsync();
      } else {
        permResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      }
      if (!permResult.granted) {
        Alert.alert('Berechtigung', source === 'camera' ? 'Kamera-Zugriff erforderlich.' : 'Galerie-Zugriff erforderlich.');
        return;
      }
      const result = source === 'camera'
        ? await ImagePicker.launchCameraAsync({ allowsEditing: false, quality: 0.6, base64: true })
        : await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'] as any,
            allowsMultipleSelection: true,
            quality: 0.6,
            base64: true,
          });
      if (result.canceled) return;
      const assets = (result as any).assets || [];
      const newPhotos: ReportPhoto[] = assets
        .filter((a: any) => a.base64)
        .map((a: any) => ({ id: localId(), uri: `data:image/jpeg;base64,${a.base64}`, caption: '' }));
      setPhotos((prev) => [...prev, ...newPhotos]);
    } catch (e) {
      console.error('Photo add error:', e);
      Alert.alert('Fehler', 'Foto konnte nicht hinzugefügt werden.');
    }
  };
  const removePhoto = (id: string) => setPhotos((prev) => prev.filter((p) => p.id !== id));
  const updatePhotoCaption = (id: string, caption: string) =>
    setPhotos((prev) => prev.map((p) => (p.id === id ? { ...p, caption } : p)));

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#1976d2" />
      </View>
    );
  }

  const bauherrFull = project
    ? [project.bauherr_salutation, (project as any).bauherr_first_name || (project as any).bauherr_firstName, (project as any).bauherr_last_name || (project as any).bauherr_lastName].filter(Boolean).join(' ') || project.bauherr_name || ''
    : '';

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={{ paddingBottom: 120 }}
          keyboardShouldPersistTaps="handled"
          scrollEnabled={scrollEnabled}
        >
          {/* ===== Großer Header mit Datum + Projekt ===== */}
          <View style={styles.headerCard}>
            <View style={styles.headerTop}>
              <View style={styles.dateBadge}>
                <Text style={styles.dateBadgeDay}>
                  {new Date(date).toLocaleDateString('de-DE', { day: '2-digit' })}
                </Text>
                <Text style={styles.dateBadgeMonth}>
                  {new Date(date).toLocaleDateString('de-DE', { month: 'short' })}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.headerLabel}>RAPPORT</Text>
                <Text style={styles.headerNumber}>{reportNumber || '—'}</Text>
                <Text style={styles.headerProject} numberOfLines={1}>
                  {project?.name || 'Projekt'}{project?.project_number ? ` · ${project.project_number}` : ''}
                </Text>
              </View>
              <TouchableOpacity style={styles.editDateBtn} onPress={() => setShowDatePicker(true)}>
                <Ionicons name="calendar" size={20} color="#1976d2" />
              </TouchableOpacity>
            </View>
            {bauherrFull ? (
              <View style={styles.headerInfoRow}>
                <Ionicons name="person" size={13} color="#64748b" />
                <Text style={styles.headerInfoText}>{bauherrFull}</Text>
              </View>
            ) : null}
            {project?.objekt_street ? (
              <View style={styles.headerInfoRow}>
                <Ionicons name="location" size={13} color="#64748b" />
                <Text style={styles.headerInfoText}>
                  {project.objekt_street}, {project.objekt_plz} {project.objekt_city}
                </Text>
              </View>
            ) : null}
          </View>

          {showDatePicker && (
            <DateTimePicker
              value={date ? new Date(date) : new Date()}
              mode="date"
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              onChange={(_, selected) => {
                if (Platform.OS !== 'ios') setShowDatePicker(false);
                if (selected) setDate(selected.toISOString().split('T')[0]);
              }}
            />
          )}
          {Platform.OS === 'ios' && showDatePicker && (
            <TouchableOpacity onPress={() => setShowDatePicker(false)} style={styles.iosPickerDone}>
              <Text style={styles.iosPickerDoneText}>Fertig</Text>
            </TouchableOpacity>
          )}

          {/* ===== Arbeitszeit ===== */}
          <Section icon="time" title="Arbeitszeit" color="#0ea5e9">
            <View style={styles.timeRow}>
              <TouchableOpacity
                style={[styles.timeBox, timeFrom && styles.timeBoxFilled]}
                onPress={() => setShowTimePicker('from')}
              >
                <Text style={styles.timeBoxLabel}>VON</Text>
                <Text style={[styles.timeBoxValue, !timeFrom && { color: '#94a3b8' }]}>
                  {timeFrom || '--:--'}
                </Text>
              </TouchableOpacity>
              <Ionicons name="arrow-forward" size={20} color="#94a3b8" />
              <TouchableOpacity
                style={[styles.timeBox, timeTo && styles.timeBoxFilled]}
                onPress={() => setShowTimePicker('to')}
              >
                <Text style={styles.timeBoxLabel}>BIS</Text>
                <Text style={[styles.timeBoxValue, !timeTo && { color: '#94a3b8' }]}>
                  {timeTo || '--:--'}
                </Text>
              </TouchableOpacity>
              <View style={styles.hoursBox}>
                <Text style={styles.timeBoxLabel}>STD</Text>
                <TextInput
                  style={styles.hoursInput}
                  value={totalHours || (computedHours > 0 ? String(computedHours) : '')}
                  onChangeText={setTotalHours}
                  placeholder={computedHours > 0 ? String(computedHours) : '0'}
                  keyboardType="decimal-pad"
                />
              </View>
            </View>
          </Section>

          {showTimePicker && (
            <DateTimePicker
              value={getTimePickerValue()}
              mode="time"
              is24Hour
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              onChange={handleTimeChange}
            />
          )}
          {Platform.OS === 'ios' && showTimePicker && (
            <View style={styles.iosTimeActions}>
              <TouchableOpacity onPress={() => setShowTimePicker(null)} style={styles.iosTimeCancel}>
                <Text style={styles.iosTimeCancelText}>Abbrechen</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleIosTimeNextOrDone} style={styles.iosTimeDone}>
                <Text style={styles.iosTimeDoneText}>
                  {showTimePicker === 'from' ? 'Weiter zu Bis →' : 'Fertig'}
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {/* ===== Mitarbeiter ===== */}
          <Section
            icon="people"
            title="Mitarbeiter"
            color="#1d4ed8"
            right={
              <View style={{ flexDirection: 'row', gap: 6 }}>
                {empMaster.length > 0 && (
                  <TouchableOpacity onPress={() => setShowEmpPicker(true)} style={styles.sectionBtn}>
                    <Ionicons name="list" size={16} color="#1976d2" />
                  </TouchableOpacity>
                )}
                <TouchableOpacity onPress={addEmployeeManual} style={styles.sectionBtn}>
                  <Ionicons name="add" size={18} color="#1976d2" />
                </TouchableOpacity>
              </View>
            }
          >
            {employees.length === 0 ? (
              <TouchableOpacity
                onPress={empMaster.length > 0 ? () => setShowEmpPicker(true) : addEmployeeManual}
                style={styles.emptyAddRow}
              >
                <Ionicons name="person-add-outline" size={18} color="#1976d2" />
                <Text style={styles.emptyAddText}>
                  {empMaster.length > 0 ? 'Mitarbeiter auswählen oder neu eingeben' : 'Mitarbeiter hinzufügen'}
                </Text>
              </TouchableOpacity>
            ) : (
              employees.map((emp) => (
                <View key={emp.id} style={styles.itemRow}>
                  <View style={styles.empBubble}>
                    <Text style={styles.empBubbleText}>{(emp.name || '?').charAt(0).toUpperCase()}</Text>
                  </View>
                  <TextInput
                    style={[styles.itemInput, { flex: 2 }]}
                    value={emp.name}
                    onChangeText={(v) => updateEmployee(emp.id, 'name', v)}
                    placeholder="Name"
                  />
                  <TextInput
                    style={[styles.itemInput, { width: 72 }]}
                    value={emp.hours != null ? String(emp.hours) : ''}
                    onChangeText={(v) => updateEmployee(emp.id, 'hours', v)}
                    placeholder="Std."
                    keyboardType="decimal-pad"
                  />
                  <TouchableOpacity onPress={() => removeEmployee(emp.id)} style={styles.itemRemoveBtn}>
                    <Ionicons name="close" size={20} color="#94a3b8" />
                  </TouchableOpacity>
                </View>
              ))
            )}
          </Section>

          {/* ===== Ausgeführte Arbeiten ===== */}
          <Section icon="hammer" title="Ausgeführte Arbeiten" color="#0d9488">
            <TextInput
              style={[styles.input, styles.multiline]}
              value={workDescription}
              onChangeText={setWorkDescription}
              placeholder="Was wurde heute gemacht? z.B. Dachsteine verlegt, Dachrinne montiert..."
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
          </Section>

          {/* ===== Material ===== */}
          <Section
            icon="cube"
            title="Material"
            color="#d97706"
            right={
              <View style={{ flexDirection: 'row', gap: 6 }}>
                {matMaster.length > 0 && (
                  <TouchableOpacity onPress={() => setShowMatPicker(true)} style={styles.sectionBtn}>
                    <Ionicons name="list" size={16} color="#1976d2" />
                  </TouchableOpacity>
                )}
                <TouchableOpacity onPress={addMaterialManual} style={styles.sectionBtn}>
                  <Ionicons name="add" size={18} color="#1976d2" />
                </TouchableOpacity>
              </View>
            }
          >
            {materials.length === 0 ? (
              <TouchableOpacity
                onPress={matMaster.length > 0 ? () => setShowMatPicker(true) : addMaterialManual}
                style={styles.emptyAddRow}
              >
                <Ionicons name="cube-outline" size={18} color="#1976d2" />
                <Text style={styles.emptyAddText}>
                  {matMaster.length > 0 ? 'Material auswählen oder neu eingeben' : 'Material hinzufügen'}
                </Text>
              </TouchableOpacity>
            ) : (
              materials.map((m) => (
                <View key={m.id} style={styles.materialCard}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <TextInput
                      style={[styles.itemInput, { flex: 2 }]}
                      value={m.name}
                      onChangeText={(v) => updateMaterial(m.id, 'name', v)}
                      placeholder="Material"
                    />
                    <TextInput
                      style={[styles.itemInput, { width: 64 }]}
                      value={m.quantity ? String(m.quantity) : ''}
                      onChangeText={(v) => updateMaterial(m.id, 'quantity', v)}
                      placeholder="Menge"
                      keyboardType="decimal-pad"
                    />
                    <TextInput
                      style={[styles.itemInput, { width: 60 }]}
                      value={m.unit}
                      onChangeText={(v) => updateMaterial(m.id, 'unit', v)}
                      placeholder="Einh."
                    />
                    <TouchableOpacity onPress={() => removeMaterial(m.id)} style={styles.itemRemoveBtn}>
                      <Ionicons name="close" size={20} color="#94a3b8" />
                    </TouchableOpacity>
                  </View>
                  {(m.note || m.note === '') && (
                    <TextInput
                      style={[styles.itemInput, { marginTop: 4 }]}
                      value={m.note || ''}
                      onChangeText={(v) => updateMaterial(m.id, 'note', v)}
                      placeholder="Bemerkung (optional)"
                    />
                  )}
                </View>
              ))
            )}
          </Section>

          {/* ===== Anfahrt & Wetter ===== */}
          <Section icon="car" title="Anfahrt & Wetter" color="#6b21a8">
            <View style={styles.threeColRow}>
              <View style={styles.threeCol}>
                <Text style={styles.miniLabel}>Kilometer</Text>
                <TextInput
                  style={styles.input}
                  value={travelKm}
                  onChangeText={setTravelKm}
                  placeholder="km"
                  keyboardType="decimal-pad"
                />
              </View>
              <View style={styles.threeCol}>
                <Text style={styles.miniLabel}>Fahrzeit (Min.)</Text>
                <TextInput
                  style={styles.input}
                  value={travelTime}
                  onChangeText={setTravelTime}
                  placeholder="Min."
                  keyboardType="decimal-pad"
                />
              </View>
              <View style={styles.threeCol}>
                <Text style={styles.miniLabel}>Temperatur</Text>
                <TextInput
                  style={styles.input}
                  value={temperature}
                  onChangeText={setTemperature}
                  placeholder="°C"
                  keyboardType="numbers-and-punctuation"
                />
              </View>
            </View>
            <Text style={[styles.miniLabel, { marginTop: 10 }]}>Wetter</Text>
            <View style={styles.weatherRow}>
              {WEATHER_OPTIONS.map((opt) => (
                <TouchableOpacity
                  key={opt.value}
                  style={[styles.weatherChip, weather === opt.value && styles.weatherChipActive]}
                  onPress={() => setWeather(weather === opt.value ? '' : opt.value)}
                >
                  <Text style={styles.weatherIcon}>{opt.icon}</Text>
                  <Text style={[styles.weatherLabel, weather === opt.value && styles.weatherLabelActive]}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </Section>

          {/* ===== Bemerkungen ===== */}
          <Section icon="document-text" title="Bemerkungen" color="#ec4899">
            <TextInput
              style={[styles.input, styles.multiline]}
              value={remarks}
              onChangeText={setRemarks}
              placeholder="Besondere Vorkommnisse, Hindernisse..."
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />
          </Section>

          {/* ===== Fotos ===== */}
          <Section
            icon="camera"
            title="Fotos"
            color="#0891b2"
            right={
              <View style={{ flexDirection: 'row', gap: 6 }}>
                <TouchableOpacity onPress={() => handleAddPhoto('camera')} style={styles.sectionBtnPrimary}>
                  <Ionicons name="camera" size={16} color="#fff" />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => handleAddPhoto('library')} style={styles.sectionBtnPrimary}>
                  <Ionicons name="images" size={16} color="#fff" />
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
              <View style={styles.photoList}>
                {photos.map((p) => (
                  <View key={p.id} style={styles.photoCard}>
                    <Image source={{ uri: p.uri }} style={styles.photoImg} resizeMode="cover" />
                    <TouchableOpacity style={styles.photoDelete} onPress={() => removePhoto(p.id)}>
                      <Ionicons name="close-circle" size={26} color="#fff" />
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

          {/* ===== Unterschriften ===== */}
          <Section icon="create" title="Unterschriften" color="#1a237e">
            <View style={styles.sigBlock}>
              <SignaturePad
                label="Kunde / Auftraggeber"
                value={signatureCustomer}
                onChange={setSignatureCustomer}
                onDrawingChange={setScrollEnabled}
                placeholder="Hier unterschreiben (Kunde)"
                height={160}
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
                height={160}
              />
              <TextInput
                style={[styles.input, { marginTop: 6 }]}
                value={signatureWorkerName}
                onChangeText={setSignatureWorkerName}
                placeholder="Name in Druckbuchstaben (optional)"
              />
            </View>
            <Text style={styles.scrollHint}>
              💡 Tipp: Beim Unterschreiben ist das Scrollen pausiert, das Blatt bleibt stabil.
            </Text>
          </Section>
        </ScrollView>

        {/* ===== Action Bar ===== */}
        <View style={[styles.actionBar, !scrollEnabled && { opacity: 0.4 }]} pointerEvents={scrollEnabled ? 'auto' : 'none'}>
          <TouchableOpacity style={[styles.actionBtn, styles.cancelBtn]} onPress={() => router.back()} disabled={saving}>
            <Text style={styles.cancelBtnText}>Abbrechen</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionBtn, styles.pdfBtn]} onPress={handleExportPdf} disabled={saving}>
            <Ionicons name="document-text" size={18} color="#fff" />
            <Text style={styles.pdfBtnText}>PDF</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionBtn, styles.saveBtn]} onPress={() => handleSave(false)} disabled={saving}>
            {saving ? <ActivityIndicator color="#fff" /> : (
              <>
                <Ionicons name="checkmark" size={18} color="#fff" />
                <Text style={styles.saveBtnText}>Speichern</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* ===== Mitarbeiter-Auswahl Modal ===== */}
        <Modal visible={showEmpPicker} transparent animationType="slide" onRequestClose={() => setShowEmpPicker(false)}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalSheet}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Mitarbeiter wählen</Text>
                <TouchableOpacity onPress={() => setShowEmpPicker(false)}>
                  <Ionicons name="close" size={26} color="#666" />
                </TouchableOpacity>
              </View>
              <ScrollView style={{ maxHeight: 400 }}>
                {empMaster.length === 0 ? (
                  <Text style={styles.modalEmpty}>Keine Mitarbeiter angelegt. Legen Sie welche unter Mitarbeiter auf der Startseite an.</Text>
                ) : (
                  empMaster.map((emp) => (
                    <TouchableOpacity key={emp.id} style={styles.pickerRow} onPress={() => addEmployeeFromMaster(emp)}>
                      <View style={styles.empBubble}>
                        <Text style={styles.empBubbleText}>{emp.name.charAt(0).toUpperCase()}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.pickerName}>{emp.name}</Text>
                        {emp.role ? <Text style={styles.pickerSub}>{emp.role}</Text> : null}
                      </View>
                      <Ionicons name="add-circle" size={24} color="#1976d2" />
                    </TouchableOpacity>
                  ))
                )}
              </ScrollView>
              <TouchableOpacity style={styles.modalCloseBtn} onPress={() => setShowEmpPicker(false)}>
                <Text style={styles.modalCloseText}>Fertig</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* ===== Material-Auswahl Modal ===== */}
        <Modal visible={showMatPicker} transparent animationType="slide" onRequestClose={() => setShowMatPicker(false)}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalSheet}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Material wählen</Text>
                <TouchableOpacity onPress={() => setShowMatPicker(false)}>
                  <Ionicons name="close" size={26} color="#666" />
                </TouchableOpacity>
              </View>
              <ScrollView style={{ maxHeight: 400 }}>
                {matMaster.length === 0 ? (
                  <Text style={styles.modalEmpty}>Kein Material angelegt. Legen Sie welches unter Material auf der Startseite an.</Text>
                ) : (
                  matMaster.map((m) => (
                    <TouchableOpacity key={m.id} style={styles.pickerRow} onPress={() => addMaterialFromMaster(m)}>
                      <View style={[styles.empBubble, { backgroundColor: '#fef3c7' }]}>
                        <Ionicons name="cube" size={18} color="#f59e0b" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.pickerName}>{m.name}</Text>
                        <Text style={styles.pickerSub}>
                          {m.unit}{m.category ? ` · ${m.category}` : ''}{m.price_per_unit ? ` · ${m.price_per_unit.toFixed(2)} €` : ''}
                        </Text>
                      </View>
                      <Ionicons name="add-circle" size={24} color="#1976d2" />
                    </TouchableOpacity>
                  ))
                )}
              </ScrollView>
              <TouchableOpacity style={styles.modalCloseBtn} onPress={() => setShowMatPicker(false)}>
                <Text style={styles.modalCloseText}>Fertig</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// Section-Komponente für saubere Trennung
const Section: React.FC<{
  icon: any;
  title: string;
  color: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}> = ({ icon, title, color, right, children }) => (
  <View style={styles.section}>
    <View style={styles.sectionHeader}>
      <View style={styles.sectionTitleRow}>
        <View style={[styles.sectionIcon, { backgroundColor: color + '20' }]}>
          <Ionicons name={icon} size={16} color={color} />
        </View>
        <Text style={[styles.sectionTitle, { color }]}>{title}</Text>
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

  // ----- Header -----
  headerCard: {
    backgroundColor: '#fff',
    margin: 10,
    padding: 14,
    borderRadius: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#0d9488',
  },
  headerTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  dateBadge: {
    backgroundColor: '#0d9488',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    alignItems: 'center',
    minWidth: 56,
  },
  dateBadgeDay: { fontSize: 22, fontWeight: '800', color: '#fff', lineHeight: 24 },
  dateBadgeMonth: { fontSize: 10, fontWeight: '700', color: '#ccfbf1', textTransform: 'uppercase' },
  headerLabel: { fontSize: 10, fontWeight: '700', color: '#64748b', letterSpacing: 1 },
  headerNumber: { fontSize: 18, fontWeight: '800', color: '#0f172a' },
  headerProject: { fontSize: 12, color: '#475569', marginTop: 2 },
  editDateBtn: { padding: 6, borderRadius: 6, backgroundColor: '#e0f2fe' },
  headerInfoRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 6 },
  headerInfoText: { color: '#475569', fontSize: 12, flex: 1 },

  // ----- Sections -----
  section: {
    backgroundColor: '#fff',
    marginHorizontal: 10,
    marginBottom: 8,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionIcon: {
    width: 26, height: 26, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center',
  },
  sectionTitle: { fontSize: 14, fontWeight: '700' },
  sectionBtn: {
    width: 32, height: 32, borderRadius: 8,
    backgroundColor: '#e0f2fe',
    alignItems: 'center', justifyContent: 'center',
  },
  sectionBtnPrimary: {
    width: 32, height: 32, borderRadius: 8,
    backgroundColor: '#1976d2',
    alignItems: 'center', justifyContent: 'center',
  },

  // ----- Time picker -----
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  timeBox: {
    flex: 1,
    backgroundColor: '#f1f5f9',
    borderRadius: 10,
    padding: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  timeBoxFilled: { backgroundColor: '#e0f2fe', borderColor: '#0ea5e9' },
  timeBoxLabel: { fontSize: 9, fontWeight: '700', color: '#64748b', letterSpacing: 1 },
  timeBoxValue: { fontSize: 18, fontWeight: '800', color: '#0f172a', marginTop: 2 },
  hoursBox: {
    width: 70,
    backgroundColor: '#fef3c7',
    borderRadius: 10,
    padding: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#fcd34d',
  },
  hoursInput: {
    fontSize: 17, fontWeight: '800', color: '#92400e',
    minWidth: 50, textAlign: 'center', padding: 0,
  },

  iosPickerDone: { alignSelf: 'flex-end', padding: 8, marginRight: 10 },
  iosPickerDoneText: { color: '#1976d2', fontWeight: '700' },
  iosTimeActions: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingBottom: 6,
  },
  iosTimeCancel: { padding: 8 },
  iosTimeCancelText: { color: '#94a3b8', fontWeight: '600' },
  iosTimeDone: {
    backgroundColor: '#1976d2',
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8,
  },
  iosTimeDoneText: { color: '#fff', fontWeight: '700' },

  // ----- Item rows -----
  emptyAddRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 12, paddingHorizontal: 10,
    backgroundColor: '#f8fafc', borderRadius: 8,
    borderWidth: 1, borderColor: '#e2e8f0', borderStyle: 'dashed',
  },
  emptyAddText: { color: '#1976d2', fontWeight: '600', fontSize: 13 },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginVertical: 3 },
  itemInput: {
    flex: 1,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 8,
    fontSize: 13,
    color: '#0f172a',
    minHeight: 38,
  },
  itemRemoveBtn: { padding: 4 },
  empBubble: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: '#dbeafe',
    alignItems: 'center', justifyContent: 'center',
  },
  empBubbleText: { color: '#1d4ed8', fontWeight: '700' },

  materialCard: {
    backgroundColor: '#fffbf0',
    borderRadius: 8,
    padding: 8,
    borderWidth: 1,
    borderColor: '#fef3c7',
    marginVertical: 3,
  },

  // ----- Inputs -----
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 10,
    fontSize: 14,
    color: '#0f172a',
  },
  multiline: { minHeight: 80, textAlignVertical: 'top', paddingTop: 10 },
  miniLabel: { fontSize: 11, color: '#64748b', fontWeight: '600', marginBottom: 4 },
  threeColRow: { flexDirection: 'row', gap: 6 },
  threeCol: { flex: 1 },

  // ----- Weather -----
  weatherRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  weatherChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: 18, borderWidth: 1, borderColor: '#cbd5e1',
    backgroundColor: '#fff',
  },
  weatherChipActive: { backgroundColor: '#1976d2', borderColor: '#1976d2' },
  weatherIcon: { fontSize: 14 },
  weatherLabel: { fontSize: 12, color: '#333', fontWeight: '500' },
  weatherLabelActive: { color: '#fff' },

  // ----- Photos -----
  photoList: { gap: 10 },
  photoCard: {
    backgroundColor: '#fff', borderRadius: 10,
    borderWidth: 1, borderColor: '#e0e0e0', overflow: 'hidden',
    position: 'relative',
  },
  photoImg: { width: '100%', height: 220 },
  photoDelete: {
    position: 'absolute', top: 6, right: 6,
    backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 14,
  },
  photoCaption: {
    fontSize: 13, padding: 8,
    borderTopWidth: 1, borderTopColor: '#eee',
  },

  // ----- Signature -----
  sigBlock: { marginBottom: 14 },
  scrollHint: {
    fontSize: 11, color: '#64748b', fontStyle: 'italic',
    backgroundColor: '#f1f5f9', padding: 8, borderRadius: 6, marginTop: 6,
  },

  // ----- Action Bar -----
  actionBar: {
    flexDirection: 'row', gap: 8, padding: 10,
    borderTopWidth: 1, borderTopColor: '#e2e8f0',
    backgroundColor: '#fff',
  },
  actionBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 12, borderRadius: 8,
  },
  cancelBtn: { backgroundColor: '#eceff1' },
  cancelBtnText: { color: '#555', fontWeight: '600' },
  pdfBtn: { backgroundColor: '#ff9800', flex: 0.7 },
  pdfBtnText: { color: '#fff', fontWeight: '700' },
  saveBtn: { backgroundColor: '#4caf50', flex: 1.3 },
  saveBtnText: { color: '#fff', fontWeight: '700' },

  // ----- Modal -----
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 18, borderTopRightRadius: 18,
    padding: 16,
    maxHeight: '80%',
  },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  modalTitle: { fontSize: 17, fontWeight: '700', color: '#0f172a' },
  modalEmpty: { color: '#94a3b8', fontStyle: 'italic', padding: 20, textAlign: 'center' },
  pickerRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    padding: 12, borderBottomWidth: 1, borderBottomColor: '#f1f5f9',
  },
  pickerName: { fontWeight: '600', color: '#0f172a', fontSize: 14 },
  pickerSub: { fontSize: 12, color: '#64748b', marginTop: 1 },
  modalCloseBtn: {
    backgroundColor: '#1976d2', paddingVertical: 12,
    borderRadius: 10, alignItems: 'center', marginTop: 10,
  },
  modalCloseText: { color: '#fff', fontWeight: '700' },
});

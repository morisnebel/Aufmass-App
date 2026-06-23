import React, { useState, useEffect, useCallback } from 'react';
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
  Report,
  ReportEmployee,
  ReportMaterial,
  ReportPhoto,
  Project,
  Customer,
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

const generateLocalId = () => Date.now().toString(36) + Math.random().toString(36).substr(2, 5);

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

  // Time picker state
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
  }, [projectId, reportId]);

  const loadData = async () => {
    if (!projectId) {
      Alert.alert('Fehler', 'Projekt-ID fehlt.');
      router.back();
      return;
    }
    try {
      setLoading(true);
      const proj = await ProjectService.getById(projectId);
      setProject(proj);
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
        // Neue Nummer für neuen Rapport
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

  // Auto-Berechnung der Stunden
  const computedHours = calcHoursFromTimes(timeFrom, timeTo);

  // Save / Speichern
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

  const handleExportPdf = async () => {
    const saved = await handleSave(true);
    if (saved) {
      // Erfolgreiches PDF wurde geteilt
    }
  };

  // ---- Mitarbeiter ----
  const addEmployee = () => {
    setEmployees((prev) => [...prev, { id: generateLocalId(), name: '', hours: undefined }]);
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
  const addMaterial = () => {
    setMaterials((prev) => [...prev, { id: generateLocalId(), name: '', quantity: 1, unit: 'Stk' }]);
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
        if (!permResult.canAskAgain) {
          Alert.alert(
            'Berechtigung erforderlich',
            source === 'camera' ? 'Bitte Kamera-Zugriff in den Einstellungen erlauben.' : 'Bitte Galerie-Zugriff in den Einstellungen erlauben.'
          );
        }
        return;
      }
      const result = source === 'camera'
        ? await ImagePicker.launchCameraAsync({
            allowsEditing: false,
            quality: 0.6,
            base64: true,
          })
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
        .map((a: any) => ({
          id: generateLocalId(),
          uri: `data:image/jpeg;base64,${a.base64}`,
          caption: '',
        }));
      setPhotos((prev) => [...prev, ...newPhotos]);
    } catch (e) {
      console.error('Photo add error:', e);
      Alert.alert('Fehler', 'Foto konnte nicht hinzugefügt werden.');
    }
  };
  const removePhoto = (id: string) => {
    setPhotos((prev) => prev.filter((p) => p.id !== id));
  };
  const updatePhotoCaption = (id: string, caption: string) => {
    setPhotos((prev) => prev.map((p) => (p.id === id ? { ...p, caption } : p)));
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#1976d2" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView style={styles.scrollView} contentContainerStyle={{ paddingBottom: 100 }} keyboardShouldPersistTaps="handled">
          {/* Projektinformationen */}
          {project && (
            <View style={styles.projectInfoCard}>
              <View style={styles.projectInfoHeader}>
                <Ionicons name="folder-open" size={18} color="#1976d2" />
                <Text style={styles.projectInfoTitle}>Projekt</Text>
              </View>
              <Text style={styles.projectInfoLine}>
                {project.name}{project.project_number ? ` · ${project.project_number}` : ''}
              </Text>
              {(project.bauherr_first_name || project.bauherr_last_name || project.bauherr_name) && (
                <Text style={styles.projectInfoSubLine}>
                  Bauherr: {[project.bauherr_salutation, project.bauherr_first_name, project.bauherr_last_name].filter(Boolean).join(' ') || project.bauherr_name}
                </Text>
              )}
              {project.objekt_street && (
                <Text style={styles.projectInfoSubLine}>
                  Objekt: {project.objekt_street}, {project.objekt_plz} {project.objekt_city}
                </Text>
              )}
            </View>
          )}

          {/* Rapport-Nr. + Datum */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>📋 Rapport-Daten</Text>
            <View style={styles.row}>
              <View style={[styles.field, { flex: 1, marginRight: 8 }]}>
                <Text style={styles.label}>Rapport-Nr.</Text>
                <TextInput
                  style={styles.input}
                  value={reportNumber}
                  onChangeText={setReportNumber}
                  placeholder="RAP-0001"
                />
              </View>
              <View style={[styles.field, { flex: 1 }]}>
                <Text style={styles.label}>Datum *</Text>
                <TouchableOpacity style={styles.input} onPress={() => setShowDatePicker(true)}>
                  <Text style={{ color: '#333' }}>{date ? new Date(date).toLocaleDateString('de-DE') : 'Datum wählen'}</Text>
                </TouchableOpacity>
              </View>
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
              <TouchableOpacity onPress={() => setShowDatePicker(false)} style={styles.iosDateClose}>
                <Text style={styles.iosDateCloseText}>Fertig</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Zeit von/bis */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>⏱️ Arbeitszeit</Text>
            <View style={styles.row}>
              <View style={[styles.field, { flex: 1, marginRight: 8 }]}>
                <Text style={styles.label}>Von</Text>
                <TouchableOpacity style={styles.input} onPress={() => setShowTimePicker('from')}>
                  <Text style={{ color: timeFrom ? '#333' : '#999' }}>{timeFrom || '–:– Uhr'}</Text>
                </TouchableOpacity>
              </View>
              <View style={[styles.field, { flex: 1, marginRight: 8 }]}>
                <Text style={styles.label}>Bis</Text>
                <TouchableOpacity style={styles.input} onPress={() => setShowTimePicker('to')}>
                  <Text style={{ color: timeTo ? '#333' : '#999' }}>{timeTo || '–:– Uhr'}</Text>
                </TouchableOpacity>
              </View>
              <View style={[styles.field, { flex: 1 }]}>
                <Text style={styles.label}>Stunden</Text>
                <TextInput
                  style={styles.input}
                  value={totalHours || (computedHours > 0 ? String(computedHours) : '')}
                  onChangeText={setTotalHours}
                  placeholder={computedHours > 0 ? String(computedHours) : '0'}
                  keyboardType="decimal-pad"
                />
              </View>
            </View>
            {showTimePicker && (
              <DateTimePicker
                value={(() => {
                  const v = showTimePicker === 'from' ? timeFrom : timeTo;
                  if (v) {
                    const [h, m] = v.split(':').map(Number);
                    const d = new Date();
                    d.setHours(h, m, 0, 0);
                    return d;
                  }
                  return new Date();
                })()}
                mode="time"
                is24Hour
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                onChange={(_, selected) => {
                  const isIos = Platform.OS === 'ios';
                  if (!isIos) setShowTimePicker(null);
                  if (selected) {
                    const hh = String(selected.getHours()).padStart(2, '0');
                    const mm = String(selected.getMinutes()).padStart(2, '0');
                    const val = `${hh}:${mm}`;
                    if (showTimePicker === 'from') setTimeFrom(val);
                    else setTimeTo(val);
                  }
                }}
              />
            )}
            {Platform.OS === 'ios' && showTimePicker && (
              <TouchableOpacity onPress={() => setShowTimePicker(null)} style={styles.iosDateClose}>
                <Text style={styles.iosDateCloseText}>Fertig</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Mitarbeiter */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>👷 Mitarbeiter</Text>
              <TouchableOpacity onPress={addEmployee} style={styles.smallAddBtn}>
                <Ionicons name="add-circle" size={22} color="#1976d2" />
              </TouchableOpacity>
            </View>
            {employees.length === 0 && (
              <Text style={styles.emptyHint}>Noch keine Mitarbeiter hinzugefügt.</Text>
            )}
            {employees.map((emp) => (
              <View key={emp.id} style={styles.empRow}>
                <TextInput
                  style={[styles.input, { flex: 2, marginRight: 8 }]}
                  value={emp.name}
                  onChangeText={(v) => updateEmployee(emp.id, 'name', v)}
                  placeholder="Name"
                />
                <TextInput
                  style={[styles.input, { flex: 1, marginRight: 8 }]}
                  value={emp.hours != null ? String(emp.hours) : ''}
                  onChangeText={(v) => updateEmployee(emp.id, 'hours', v)}
                  placeholder="Std."
                  keyboardType="decimal-pad"
                />
                <TouchableOpacity onPress={() => removeEmployee(emp.id)} style={styles.removeBtn}>
                  <Ionicons name="close-circle" size={24} color="#d32f2f" />
                </TouchableOpacity>
              </View>
            ))}
          </View>

          {/* Ausgeführte Arbeiten */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>🛠️ Ausgeführte Arbeiten</Text>
            <TextInput
              style={[styles.input, styles.multiline]}
              value={workDescription}
              onChangeText={setWorkDescription}
              placeholder="Beschreibung der ausgeführten Arbeiten..."
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
          </View>

          {/* Material */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>🧱 Verwendetes Material</Text>
              <TouchableOpacity onPress={addMaterial} style={styles.smallAddBtn}>
                <Ionicons name="add-circle" size={22} color="#1976d2" />
              </TouchableOpacity>
            </View>
            {materials.length === 0 && (
              <Text style={styles.emptyHint}>Noch kein Material erfasst.</Text>
            )}
            {materials.map((m) => (
              <View key={m.id} style={styles.materialCard}>
                <View style={styles.row}>
                  <TextInput
                    style={[styles.input, { flex: 2, marginRight: 6 }]}
                    value={m.name}
                    onChangeText={(v) => updateMaterial(m.id, 'name', v)}
                    placeholder="Material"
                  />
                  <TextInput
                    style={[styles.input, { flex: 1, marginRight: 6 }]}
                    value={m.quantity ? String(m.quantity) : ''}
                    onChangeText={(v) => updateMaterial(m.id, 'quantity', v)}
                    placeholder="Menge"
                    keyboardType="decimal-pad"
                  />
                  <TextInput
                    style={[styles.input, { flex: 1, marginRight: 6 }]}
                    value={m.unit}
                    onChangeText={(v) => updateMaterial(m.id, 'unit', v)}
                    placeholder="Einheit"
                  />
                  <TouchableOpacity onPress={() => removeMaterial(m.id)} style={styles.removeBtn}>
                    <Ionicons name="close-circle" size={24} color="#d32f2f" />
                  </TouchableOpacity>
                </View>
                <TextInput
                  style={[styles.input, { marginTop: 4 }]}
                  value={m.note || ''}
                  onChangeText={(v) => updateMaterial(m.id, 'note', v)}
                  placeholder="Bemerkung (optional)"
                />
              </View>
            ))}
          </View>

          {/* Anfahrt + Wetter */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>🚗 Anfahrt & 🌦️ Wetter</Text>
            <View style={styles.row}>
              <View style={[styles.field, { flex: 1, marginRight: 8 }]}>
                <Text style={styles.label}>Kilometer</Text>
                <TextInput
                  style={styles.input}
                  value={travelKm}
                  onChangeText={setTravelKm}
                  placeholder="km"
                  keyboardType="decimal-pad"
                />
              </View>
              <View style={[styles.field, { flex: 1, marginRight: 8 }]}>
                <Text style={styles.label}>Fahrzeit (Min.)</Text>
                <TextInput
                  style={styles.input}
                  value={travelTime}
                  onChangeText={setTravelTime}
                  placeholder="Min."
                  keyboardType="decimal-pad"
                />
              </View>
              <View style={[styles.field, { flex: 1 }]}>
                <Text style={styles.label}>Temperatur (°C)</Text>
                <TextInput
                  style={styles.input}
                  value={temperature}
                  onChangeText={setTemperature}
                  placeholder="°C"
                  keyboardType="numbers-and-punctuation"
                />
              </View>
            </View>
            <Text style={[styles.label, { marginTop: 8 }]}>Wetter</Text>
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
          </View>

          {/* Bemerkungen */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>📝 Bemerkungen / Besonderheiten</Text>
            <TextInput
              style={[styles.input, styles.multiline]}
              value={remarks}
              onChangeText={setRemarks}
              placeholder="Besondere Vorkommnisse, Hindernisse, weitere Bemerkungen..."
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />
          </View>

          {/* Fotos */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>📷 Fotos</Text>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                <TouchableOpacity onPress={() => handleAddPhoto('camera')} style={styles.iconBtn}>
                  <Ionicons name="camera" size={20} color="#fff" />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => handleAddPhoto('library')} style={styles.iconBtn}>
                  <Ionicons name="images" size={20} color="#fff" />
                </TouchableOpacity>
              </View>
            </View>
            {photos.length === 0 && (
              <Text style={styles.emptyHint}>Noch keine Fotos angehängt.</Text>
            )}
            <View style={styles.photoGrid}>
              {photos.map((p) => (
                <View key={p.id} style={styles.photoCard}>
                  <Image source={{ uri: p.uri }} style={styles.photoImg} />
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
          </View>

          {/* Unterschriften */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>✍️ Unterschriften</Text>

            <View style={{ marginBottom: 14 }}>
              <SignaturePad
                label="Kunde / Auftraggeber"
                value={signatureCustomer}
                onChange={setSignatureCustomer}
                placeholder="Hier unterschreiben (Kunde)"
              />
              <TextInput
                style={[styles.input, { marginTop: 4 }]}
                value={signatureCustomerName}
                onChangeText={setSignatureCustomerName}
                placeholder="Name in Druckbuchstaben (optional)"
              />
            </View>

            <View>
              <SignaturePad
                label="Handwerker / Auftragnehmer"
                value={signatureWorker}
                onChange={setSignatureWorker}
                placeholder="Hier unterschreiben (Handwerker)"
              />
              <TextInput
                style={[styles.input, { marginTop: 4 }]}
                value={signatureWorkerName}
                onChangeText={setSignatureWorkerName}
                placeholder="Name in Druckbuchstaben (optional)"
              />
            </View>
          </View>
        </ScrollView>

        {/* Action Bar */}
        <View style={styles.actionBar}>
          <TouchableOpacity
            style={[styles.actionBtn, styles.cancelBtn]}
            onPress={() => router.back()}
            disabled={saving}
          >
            <Text style={styles.cancelBtnText}>Abbrechen</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, styles.pdfBtn]}
            onPress={handleExportPdf}
            disabled={saving}
          >
            <Ionicons name="document-text" size={18} color="#fff" />
            <Text style={styles.pdfBtnText}>PDF teilen</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, styles.saveBtn]}
            onPress={() => handleSave(false)}
            disabled={saving}
          >
            {saving ? <ActivityIndicator color="#fff" /> : (
              <>
                <Ionicons name="checkmark" size={18} color="#fff" />
                <Text style={styles.saveBtnText}>Speichern</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f7fa' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scrollView: { flex: 1 },
  projectInfoCard: {
    backgroundColor: '#e3f2fd',
    padding: 12,
    margin: 12,
    borderRadius: 10,
    borderLeftWidth: 4,
    borderLeftColor: '#1976d2',
  },
  projectInfoHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  projectInfoTitle: { fontWeight: '700', color: '#1976d2', fontSize: 14 },
  projectInfoLine: { color: '#333', fontSize: 14, fontWeight: '600' },
  projectInfoSubLine: { color: '#555', fontSize: 12, marginTop: 2 },
  section: {
    backgroundColor: '#fff',
    margin: 12,
    marginBottom: 0,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e0e6ed',
  },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#1976d2', marginBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'flex-end' },
  field: {},
  label: { fontSize: 12, color: '#555', marginBottom: 4, fontWeight: '500' },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#cfd8dc',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 10,
    fontSize: 14,
    color: '#333',
    minHeight: 42,
    justifyContent: 'center',
  },
  multiline: {
    minHeight: 80,
    textAlignVertical: 'top',
    paddingTop: 10,
  },
  smallAddBtn: { padding: 4 },
  emptyHint: { color: '#888', fontStyle: 'italic', fontSize: 12, marginTop: 4 },
  empRow: { flexDirection: 'row', alignItems: 'center', marginTop: 6 },
  materialCard: {
    marginTop: 6,
    padding: 8,
    backgroundColor: '#fafbfc',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#eceff1',
  },
  removeBtn: { padding: 4 },
  weatherRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  weatherChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#cfd8dc',
    backgroundColor: '#fff',
  },
  weatherChipActive: {
    backgroundColor: '#1976d2',
    borderColor: '#1976d2',
  },
  weatherIcon: { fontSize: 14 },
  weatherLabel: { fontSize: 12, color: '#333', fontWeight: '500' },
  weatherLabelActive: { color: '#fff' },
  iconBtn: {
    backgroundColor: '#1976d2',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 },
  photoCard: {
    width: '48%',
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    overflow: 'hidden',
  },
  photoImg: { width: '100%', height: 120 },
  photoDelete: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 12,
  },
  photoCaption: {
    fontSize: 12,
    padding: 6,
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  iosDateClose: { alignSelf: 'flex-end', padding: 8 },
  iosDateCloseText: { color: '#1976d2', fontWeight: '600' },
  actionBar: {
    flexDirection: 'row',
    gap: 8,
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: '#e0e6ed',
    backgroundColor: '#fff',
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 8,
  },
  cancelBtn: { backgroundColor: '#eceff1' },
  cancelBtnText: { color: '#555', fontWeight: '600' },
  pdfBtn: { backgroundColor: '#ff9800' },
  pdfBtnText: { color: '#fff', fontWeight: '700' },
  saveBtn: { backgroundColor: '#4caf50' },
  saveBtnText: { color: '#fff', fontWeight: '700' },
});

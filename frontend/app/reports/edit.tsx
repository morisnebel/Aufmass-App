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
  MaterialCategoryService,
  SettingsService, PhotoService,
  Report, ReportEmployee, ReportMaterial, ReportPhoto, ReportMachine, ReportWorkItem,
  Project, Customer, EmployeeMaster, MaterialMaster, MachineMaster, Checklist,
  REPORT_HEADER_FIELDS, DEFAULT_REPORT_HEADER_FIELDS,
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

// === Fahrzeit-Eingabe-Helfer: HH:MM ↔ Dezimalstunden ===
/** Parst "1:30", "1,5", "1.5", "0:45", "" → Dezimalstunden (z.B. 1.5). Leerstring → undefined */
const parseTimeHM = (s: string): number | undefined => {
  if (!s) return undefined;
  const trimmed = s.trim();
  if (!trimmed) return undefined;
  // Format HH:MM
  if (trimmed.includes(':')) {
    const [hStr, mStr] = trimmed.split(':');
    const h = parseInt(hStr, 10) || 0;
    const m = parseInt(mStr || '0', 10) || 0;
    return Math.max(0, h + Math.min(59, Math.max(0, m)) / 60);
  }
  // Dezimal (Komma oder Punkt)
  const v = parseFloat(trimmed.replace(',', '.'));
  return Number.isFinite(v) && v >= 0 ? v : undefined;
};
/** Formatiert Dezimalstunden zu "1:30". undefined/0 → "" */
const formatHM = (hours?: number): string => {
  if (hours == null || !Number.isFinite(hours) || hours <= 0) return '';
  const totalMinutes = Math.round(hours * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h}:${m.toString().padStart(2, '0')}`;
};

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

  // Company logo + report title (aus globalen Einstellungen)
  const [companyLogo, setCompanyLogo] = useState<string>('');
  const [companyName, setCompanyName] = useState<string>('');
  const [reportTitle, setReportTitle] = useState<string>('Rapport');
  const [existingReport, setExistingReport] = useState<Report | null>(null);
  const [showTitleEdit, setShowTitleEdit] = useState(false);
  const [titleEditInput, setTitleEditInput] = useState('');

  // Stammdaten
  const [empMaster, setEmpMaster] = useState<EmployeeMaster[]>([]);
  const [matMaster, setMatMaster] = useState<MaterialMaster[]>([]);
  const [machMaster, setMachMaster] = useState<MachineMaster[]>([]);
  const [projChecklists, setProjChecklists] = useState<Checklist[]>([]);

  const [showEmpPicker, setShowEmpPicker] = useState(false);
  const [showMatPicker, setShowMatPicker] = useState(false);
  // Menge-Eingabe (Roh-String, damit Komma-Eingabe nicht springt)
  const [matQtyDraft, setMatQtyDraft] = useState<Record<string, string>>({});
  // Vollständiges Formular: Material in Stammdaten übernehmen
  const [matMasterModal, setMatMasterModal] = useState<{ reportMatId: string } | null>(null);
  const [matMasterForm, setMatMasterForm] = useState<any>({});
  const [matMasterNum, setMatMasterNum] = useState<{ ek?: string; markup?: string; vk?: string }>({});
  const [showMachPicker, setShowMachPicker] = useState(false);
  const [showChecklistPicker, setShowChecklistPicker] = useState(false);
  // Auswahl-Modus für Checklisten-Items
  const [activeChecklist, setActiveChecklist] = useState<Checklist | null>(null);
  const [selectedClItems, setSelectedClItems] = useState<Set<string>>(new Set());

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
  // Erweiterte Fahrzeiten (Team) - Roh-Strings damit Eingabe nicht springt
  const [travelToHoursStr, setTravelToHoursStr] = useState<string>('');
  const [travelBackHoursStr, setTravelBackHoursStr] = useState<string>('');
  const [travelToKm, setTravelToKm] = useState<string>('');
  const [travelBackKm, setTravelBackKm] = useState<string>('');
  const [travelCosts, setTravelCosts] = useState<string>('');
  const [travelNote, setTravelNote] = useState<string>('');
  const [travelPerEmployee, setTravelPerEmployee] = useState<boolean>(false);
  // Dialog für Fahrzeiten pro Mitarbeiter
  const [empTravelModal, setEmpTravelModal] = useState<string | null>(null);
  const [empTravelPickerField, setEmpTravelPickerField] = useState<'to' | 'back' | null>(null);
  const [travelInTotalHours, setTravelInTotalHours] = useState<boolean>(false);
  // Preis-Anzeige im PDF
  const [showEmployeeCosts, setShowEmployeeCosts] = useState<boolean>(false);
  const [showMaterialCosts, setShowMaterialCosts] = useState<boolean>(false);
  const [showMachineCosts, setShowMachineCosts] = useState<boolean>(false);
  const [showTravelCosts, setShowTravelCosts] = useState<boolean>(false);
  const [showTotalSum, setShowTotalSum] = useState<boolean>(false);
  // Mehrwertsteuer
  const [showVat, setShowVat] = useState<boolean>(false);
  const [vatRateStr, setVatRateStr] = useState<string>('19');
  // Roh-Strings für km-Eingaben pro Mitarbeiter (Komma-Erhaltung)
  const [travelKmDraft, setTravelKmDraft] = useState<Record<string, string>>({});
  // Briefkopf-Felder (welche aus Projekt/Kunde im PDF gezeigt werden)
  const [headerFields, setHeaderFields] = useState<Set<string>>(new Set(DEFAULT_REPORT_HEADER_FIELDS));
  const [weather, setWeather] = useState<Report['weather']>('');
  const [temperature, setTemperature] = useState<string>('');
  const [obstacles, setObstacles] = useState('');
  const [remarks, setRemarks] = useState('');
  const [signatureCustomer, setSignatureCustomer] = useState('');
  const [signatureCustomerName, setSignatureCustomerName] = useState('');
  const [signatureWorker, setSignatureWorker] = useState('');
  const [signatureWorkerName, setSignatureWorkerName] = useState('');
  const [photos, setPhotos] = useState<ReportPhoto[]>([]);
  // Projektfoto-Picker
  const [showProjectPhotoPicker, setShowProjectPhotoPicker] = useState(false);
  const [projectPhotos, setProjectPhotos] = useState<any[]>([]);
  const [selectedProjPhotos, setSelectedProjPhotos] = useState<Set<string>>(new Set());

  // Time-Picker State (für Mitarbeiter-Tabelle)
  const [timePickerFor, setTimePickerFor] = useState<{ empId: string; field: 'time_from' | 'time_to' } | null>(null);
  // Travel-Time-Picker: für Team-Hin/Rück oder pro-Mitarbeiter
  const [travelTimePicker, setTravelTimePicker] = useState<
    | { kind: 'team-to' | 'team-back' }
    | { kind: 'emp-to' | 'emp-back'; empId: string }
    | null
  >(null);
  const [pauseModal, setPauseModal] = useState<{ empId: string } | null>(null);
  const [pauseInput, setPauseInput] = useState('');
  // Datum-Picker pro Mitarbeiter-Eintrag
  const [empDatePicker, setEmpDatePicker] = useState<{ empId: string } | null>(null);
  // Material → "Als Stammdaten speichern"
  const [savedMatIds, setSavedMatIds] = useState<Set<string>>(new Set());

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
      const [proj, emps, mats, machs, checklists, settingsData] = await Promise.all([
        ProjectService.getById(projectId),
        EmployeeMasterService.getActive(),
        MaterialMasterService.getActive(),
        MachineMasterService.getActive(),
        ChecklistService.getByProjectId(projectId),
        SettingsService.get(),
      ]);
      setProject(proj);
      setEmpMaster(emps);
      setMatMaster(mats);
      setMachMaster(machs);
      setProjChecklists(checklists);
      // Logo + Firmenname + Rapport-Titel aus Settings
      const sAny = settingsData as any;
      setCompanyLogo(sAny.logo_data || sAny.company_logo || '');
      setCompanyName(settingsData.company_name || '');
      setReportTitle(settingsData.report_title || 'Rapport');
      // Default-Briefkopf-Felder + Fahrzeit-In-Stunden-Flag aus Settings
      const defaultHeaderFields = (settingsData as any).report_header_fields_default;
      const defaultTravelInTotal = !!(settingsData as any).report_travel_in_total_hours;
      if (proj?.customer_id) {
        const cust = await CustomerService.getById(proj.customer_id);
        setCustomer(cust);
      }

      if (reportId) {
        const r = await ReportService.getById(reportId);
        if (r) {
          setExistingReport(r);
          setReportNumber(r.report_number || '');
          setDate(r.date || new Date().toISOString().split('T')[0]);
          setContactPerson(r.contact_person || proj?.objekt_contact_person || '');
          setEmployees(r.employees || []);
          setWorkItems(r.work_items || []);
          setWorkDescription(r.work_description || '');
          setMaterials(r.materials || []);
          setMachines(r.machines || []);
          setTravelKm(r.travel_km != null ? String(r.travel_km) : '');
          setTravelToHoursStr(formatHM(r.travel_to_hours));
          setTravelBackHoursStr(formatHM(r.travel_back_hours));
          setTravelToKm(r.travel_to_km != null ? String(r.travel_to_km) : '');
          setTravelBackKm(r.travel_back_km != null ? String(r.travel_back_km) : '');
          setTravelCosts(r.travel_costs != null ? String(r.travel_costs) : '');
          setTravelNote(r.travel_note || '');
          setTravelPerEmployee(!!r.travel_per_employee_enabled);
          setTravelInTotalHours(r.travel_in_total_hours != null ? !!r.travel_in_total_hours : defaultTravelInTotal);
          setShowEmployeeCosts(!!r.show_employee_costs);
          setShowMaterialCosts(!!r.show_material_costs);
          setShowMachineCosts(!!r.show_machine_costs);
          setShowTravelCosts(!!r.show_travel_costs);
          setShowTotalSum(!!r.show_total_sum);
          setShowVat(!!r.show_vat);
          setVatRateStr(r.vat_rate != null ? String(r.vat_rate).replace('.', ',') : '19');
          // Briefkopf-Felder: per-report wenn vorhanden, sonst Default aus Settings, sonst eingebauter Default
          if (r.header_fields && r.header_fields.length > 0) {
            setHeaderFields(new Set(r.header_fields));
          } else if (defaultHeaderFields && defaultHeaderFields.length > 0) {
            setHeaderFields(new Set(defaultHeaderFields));
          }
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
        // Bei neuem Rapport: Defaults aus Settings übernehmen
        if (defaultHeaderFields && defaultHeaderFields.length > 0) {
          setHeaderFields(new Set(defaultHeaderFields));
        }
        setTravelInTotalHours(defaultTravelInTotal);
        // Ansprechpartner aus Projekt vorbelegen
        if (proj?.objekt_contact_person) {
          setContactPerson(proj.objekt_contact_person);
        }
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
    const h = (e.time_from && e.time_to) ? calcEmpHours(e.time_from, e.time_to, e.pause_minutes) : (e.hours || 0);
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
            setTravelToHoursStr(formatHM(prev.travel_to_hours));
            setTravelBackHoursStr(formatHM(prev.travel_back_hours));
            setTravelToKm(prev.travel_to_km != null ? String(prev.travel_to_km) : '');
            setTravelBackKm(prev.travel_back_km != null ? String(prev.travel_back_km) : '');
            setTravelCosts(prev.travel_costs != null ? String(prev.travel_costs) : '');
            setTravelNote(prev.travel_note || '');
            setTravelPerEmployee(!!prev.travel_per_employee_enabled);
            if (prev.travel_in_total_hours != null) setTravelInTotalHours(!!prev.travel_in_total_hours);
            if (prev.header_fields && prev.header_fields.length > 0) setHeaderFields(new Set(prev.header_fields));
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
    if (saving) return null; // Schutz gegen Doppelklick
    setSaving(true);
    try {
      // Stunden für jeden Mitarbeiter neu berechnen (Zeiten haben Vorrang vor gespeichertem Wert)
      const empsWithHours = employees.map(e => ({
        ...e,
        hours: (e.time_from && e.time_to) ? calcEmpHours(e.time_from, e.time_to, e.pause_minutes) : e.hours,
      }));

      // Material-Lager: Delta-Berechnung gegen vorherigen Abzug
      // Alte deducted_quantities (falls vorhanden, sonst leer)
      const oldDeducted: Record<string, number> = (existingReport?.deducted_quantities) || {};
      const newDeducted: Record<string, number> = {};
      // Sammle alle aktuellen Material-Mengen pro master_id
      materials.forEach(m => {
        const mAny = m as any;
        if (mAny.master_id) {
          newDeducted[mAny.master_id] = (newDeducted[mAny.master_id] || 0) + (m.quantity || 0);
        }
      });
      // Berechne Delta pro Material und passe Master-Bestand an
      const allMasterIds = new Set([...Object.keys(oldDeducted), ...Object.keys(newDeducted)]);
      const stockUpdates: { id: string; delta: number; name: string; newStock: number }[] = [];
      for (const mid of allMasterIds) {
        const oldQ = oldDeducted[mid] || 0;
        const newQ = newDeducted[mid] || 0;
        const delta = newQ - oldQ; // wenn positiv: mehr verbraucht als zuvor
        if (delta === 0) continue;
        try {
          const master = await MaterialMasterService.getById(mid);
          if (master && master.stock_quantity != null) {
            const newStock = (master.stock_quantity || 0) - delta;
            await MaterialMasterService.update(mid, { stock_quantity: Math.max(0, newStock) });
            stockUpdates.push({ id: mid, delta, name: master.name, newStock: Math.max(0, newStock) });
          }
        } catch (err) { console.warn('[stock-update] failed for', mid, err); }
      }

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
        travel_km: travelKm ? parseFloat(travelKm.replace(',', '.')) : undefined,
        travel_to_hours: parseTimeHM(travelToHoursStr),
        travel_back_hours: parseTimeHM(travelBackHoursStr),
        travel_to_km: travelToKm ? parseFloat(travelToKm.replace(',', '.')) : undefined,
        travel_back_km: travelBackKm ? parseFloat(travelBackKm.replace(',', '.')) : undefined,
        travel_costs: travelCosts ? parseFloat(travelCosts.replace(',', '.')) : undefined,
        travel_note: travelNote || undefined,
        travel_per_employee_enabled: travelPerEmployee || undefined,
        travel_in_total_hours: travelInTotalHours || undefined,
        show_employee_costs: showEmployeeCosts || undefined,
        show_material_costs: showMaterialCosts || undefined,
        show_machine_costs: showMachineCosts || undefined,
        show_travel_costs: showTravelCosts || undefined,
        show_total_sum: showTotalSum || undefined,
        show_vat: showVat || undefined,
        vat_rate: showVat ? (parseFloat(vatRateStr.replace(',', '.')) || 19) : undefined,
        header_fields: Array.from(headerFields),
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
        deducted_quantities: newDeducted,
      };
      let saved: Report | null;
      if (reportId) {
        saved = await ReportService.update(reportId, dataToSave);
      } else {
        saved = await ReportService.create(dataToSave);
      }
      // Spinner sofort zurücksetzen
      setSaving(false);
      // Kurzes Feedback bei Lager-Updates (nur wenn relevant)
      if (stockUpdates.length > 0 && !alsoExport) {
        const lowStock = stockUpdates.filter(u => u.newStock <= 5);
        if (lowStock.length > 0) {
          // Asynchron, nicht-blockierend
          setTimeout(() => {
            Alert.alert(
              'Lagerbestand niedrig',
              lowStock.map(u => `• ${u.name}: nur noch ${u.newStock}`).join('\n'),
            );
          }, 300);
        }
      }
      if (alsoExport && saved) {
        try {
          await exportReportAsPdf(saved, project, customer);
        } catch (pdfErr) {
          console.error('PDF export error:', pdfErr);
          Alert.alert('PDF-Fehler', 'PDF konnte nicht erstellt werden, der Rapport wurde aber gespeichert.');
        }
      } else {
        router.back();
      }
      return saved;
    } catch (e) {
      console.error('Save error:', e);
      setSaving(false);
      Alert.alert('Fehler', 'Rapport konnte nicht gespeichert werden.');
      return null;
    }
  };

  const handleExportPdf = async () => { await handleSave(true); };

  // ---- Rapport-Titel speichern ----
  const handleSaveTitle = async () => {
    const newTitle = (titleEditInput || '').trim() || 'Rapport';
    try {
      await SettingsService.update({ report_title: newTitle } as any);
      setReportTitle(newTitle);
      setShowTitleEdit(false);
    } catch (e) {
      Alert.alert('Fehler', 'Titel konnte nicht gespeichert werden.');
    }
  };

  // ---- Material als Stammdaten speichern ----
  const handleSaveMaterialToMaster = async (m: ReportMaterial) => {
    if (!m.name || !m.name.trim()) {
      Alert.alert('Hinweis', 'Bitte zuerst eine Bezeichnung eingeben.');
      return;
    }
    // Prüfe ob schon vorhanden
    const existing = matMaster.find(mm => mm.name.toLowerCase() === m.name.toLowerCase() && mm.unit === m.unit);
    if (existing) {
      Alert.alert('Hinweis', `${m.name} ist bereits in den Stammdaten vorhanden.`);
      setSavedMatIds(s => new Set([...s, m.id]));
      return;
    }
    // Vollständiges Formular öffnen, damit alle Daten direkt erfasst werden können
    setMatMasterForm({
      name: m.name,
      unit: m.unit || 'Stk',
      default_quantity: m.quantity || 1,
      category: '',
      supplier: '',
      article_number: '',
    });
    setMatMasterNum({});
    setMatMasterModal({ reportMatId: m.id });
  };

  const saveMatMasterFromModal = async () => {
    if (!matMasterModal) return;
    if (!matMasterForm.name || !matMasterForm.name.trim()) {
      Alert.alert('Hinweis', 'Bitte eine Bezeichnung eingeben.');
      return;
    }
    try {
      await MaterialMasterService.create({
        name: matMasterForm.name.trim(),
        unit: matMasterForm.unit || 'Stk',
        default_quantity: matMasterForm.default_quantity || 1,
        category: matMasterForm.category?.trim() || undefined,
        supplier: matMasterForm.supplier?.trim() || undefined,
        article_number: matMasterForm.article_number?.trim() || undefined,
        purchase_price: matMasterNum.ek ? (parseFloat(matMasterNum.ek.replace(',', '.')) || undefined) : undefined,
        markup_percent: matMasterNum.markup ? (parseFloat(matMasterNum.markup.replace(',', '.')) || undefined) : undefined,
        price_per_unit: matMasterNum.vk ? (parseFloat(matMasterNum.vk.replace(',', '.')) || undefined) : undefined,
        active: true,
      } as any);
      if (matMasterForm.category && matMasterForm.category.trim()) {
        try { await MaterialCategoryService.add(matMasterForm.category.trim()); } catch { /* silent */ }
      }
      // Aktualisiere Stammdaten-Liste
      const newList = await MaterialMasterService.getActive();
      setMatMaster(newList);
      setSavedMatIds(s => new Set([...s, matMasterModal.reportMatId]));
      setMatMasterModal(null);
      Alert.alert('Gespeichert', `${matMasterForm.name} wurde in den Material-Stammdaten gespeichert.`);
    } catch (e) {
      console.error(e);
      Alert.alert('Fehler', 'Speichern fehlgeschlagen.');
    }
  };

  // ---- Stunden pro Funktion gruppieren ----
  const hoursByRole: { role: string; hours: number; count: number }[] = (() => {
    const map: Record<string, { hours: number; count: number }> = {};
    employees.forEach(e => {
      const h = (e.time_from && e.time_to) ? calcEmpHours(e.time_from, e.time_to, e.pause_minutes) : (e.hours || 0);
      const role = (e.role || '').trim();
      if (!role) return;
      if (!map[role]) map[role] = { hours: 0, count: 0 };
      map[role].hours += h;
      map[role].count += 1;
    });
    return Object.keys(map).map(role => ({ role, hours: map[role].hours, count: map[role].count }));
  })();

  // ---- Mitarbeiter Zeile ----
  const addEmployeeManual = () => {
    setEmployees(prev => [...prev, {
      id: localId(), name: '',
      entry_date: date,
      time_from: '07:00', time_to: '16:00', pause_minutes: 30,
      color: AVATAR_COLORS[prev.length % AVATAR_COLORS.length],
    }]);
  };
  const addEmployeeFromMaster = (emp: EmployeeMaster) => {
    setEmployees(prev => [...prev, {
      id: localId(), name: emp.name,
      role: emp.role || undefined,
      entry_date: date,
      time_from: '07:00', time_to: '16:00', pause_minutes: 30,
      color: AVATAR_COLORS[prev.length % AVATAR_COLORS.length],
    }]);
    setShowEmpPicker(false);
  };
  const updateEmployee = (id: string, patch: Partial<ReportEmployee>) => {
    setEmployees(prev => prev.map(e => {
      if (e.id !== id) return e;
      const merged = { ...e, ...patch };
      // Bei Änderung von Zeiten/Pause die Stunden immer neu berechnen
      if ('time_from' in patch || 'time_to' in patch || 'pause_minutes' in patch) {
        merged.hours = calcEmpHours(merged.time_from, merged.time_to, merged.pause_minutes);
      }
      return merged;
    }));
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
      ? { ...m, [field]: field === 'quantity' ? (parseFloat(value.replace(',', '.')) || 0) : value }
      : m));
  };
  const removeMaterial = (id: string) => setMaterials(prev => prev.filter(m => m.id !== id));

  // ---- Maschinen ----
  const addMachineManual = () => setMachines(prev => [...prev, { id: localId(), name: '' }]);
  const addMachineFromMaster = (m: MachineMaster) => {
    setMachines(prev => [...prev, { id: localId(), name: m.name, master_id: m.id }]);
    setShowMachPicker(false);
  };
  const updateMachine = (id: string, field: keyof ReportMachine, value: string | number) => {
    setMachines(prev => prev.map(m => m.id === id ? { ...m, [field]: value } : m));
  };
  const removeMachine = (id: string) => setMachines(prev => prev.filter(m => m.id !== id));
  // Lookup-Map zur Stammdaten-Maschine (Status & Foto in der Anzeige)
  const machMasterById = React.useMemo(() => {
    const m: Record<string, MachineMaster> = {};
    machMaster.forEach(x => { m[x.id] = x; });
    return m;
  }, [machMaster]);

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
    // Flatten alle Items (inkl. subItems) – Vollimport (Legacy, nicht mehr verwendet)
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

  // Hilfs-Liste: alle Punkte einer Checkliste flach mit Pfaden / Tiefe
  // Wichtig: ChecklistItem hat keine eigene id - wir generieren Pfad-basierten Schlüssel (z.B. "0.1.2")
  const flattenChecklistItems = (cl: Checklist): { id: string; text: string; checked: boolean; depth: number; hasChildren: boolean }[] => {
    const out: { id: string; text: string; checked: boolean; depth: number; hasChildren: boolean }[] = [];
    const walk = (items: any[], depth: number, pathPrefix: string) => {
      items.forEach((it, idx) => {
        if (!it.text) return;
        const path = pathPrefix ? `${pathPrefix}.${idx}` : `${idx}`;
        const hasChildren = !!(it.subItems && it.subItems.length > 0);
        out.push({ id: path, text: it.text, checked: !!it.checked, depth, hasChildren });
        if (hasChildren) walk(it.subItems, depth + 1, path);
      });
    };
    walk(cl.items || [], 0, '');
    return out;
  };

  // Item-Auswahl umschalten
  const toggleClItemSelection = (_cl: Checklist, itemId: string) => {
    setSelectedClItems(prev => {
      const next = new Set(prev);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }
      return next;
    });
  };

  const toggleSelectAllCl = (cl: Checklist) => {
    const flat = flattenChecklistItems(cl);
    setSelectedClItems(prev => {
      const allSelected = flat.every(i => prev.has(i.id));
      if (allSelected) return new Set();
      return new Set(flat.map(i => i.id));
    });
  };

  // Übernahme: nur ausgewählte Items in Workitems umwandeln (mit Einrückung)
  const importSelectedClItems = () => {
    if (!activeChecklist) return;
    const flat = flattenChecklistItems(activeChecklist);
    const newItems = flat
      .filter(i => selectedClItems.has(i.id))
      .map(i => ({
        id: localId(),
        text: '  '.repeat(i.depth) + (i.depth > 0 ? '↳ ' : '') + i.text,
        checked: i.checked,
        source: 'checklist' as const,
      }));
    if (newItems.length === 0) {
      Alert.alert('Hinweis', 'Bitte mindestens einen Punkt auswählen.');
      return;
    }
    setWorkItems(prev => [...prev, ...newItems]);
    setActiveChecklist(null);
    setSelectedClItems(new Set());
    setShowChecklistPicker(false);
  };

  const openChecklistDetail = (cl: Checklist) => {
    setActiveChecklist(cl);
    // Initial: alle Items vorausgewählt
    const flat = flattenChecklistItems(cl);
    setSelectedClItems(new Set(flat.map(i => i.id)));
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

  // ---- Projektfoto-Picker ----
  const openProjectPhotoPicker = async () => {
    if (!projectId) return;
    try {
      const all = await PhotoService.getByProjectId(projectId);
      setProjectPhotos(all);
      setSelectedProjPhotos(new Set());
      setShowProjectPhotoPicker(true);
    } catch (e) {
      console.error('[ProjectPhotos] load failed:', e);
      Alert.alert('Fehler', 'Projekt-Fotos konnten nicht geladen werden.');
    }
  };

  const toggleProjPhoto = (id: string) => {
    setSelectedProjPhotos(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const importSelectedProjPhotos = () => {
    const newPhotos: ReportPhoto[] = [];
    projectPhotos.forEach(pp => {
      if (selectedProjPhotos.has(pp.id)) {
        // image_data ist meistens base64, uri ist Original-URI; bevorzuge image_data falls vorhanden
        const uri = pp.image_data
          ? (pp.image_data.startsWith('data:') ? pp.image_data : `data:image/jpeg;base64,${pp.image_data}`)
          : pp.uri;
        if (uri) {
          newPhotos.push({
            id: localId(),
            uri,
            caption: pp.description || '',
          });
        }
      }
    });
    if (newPhotos.length === 0) {
      Alert.alert('Hinweis', 'Bitte mindestens ein Foto auswählen.');
      return;
    }
    setPhotos(prev => [...prev, ...newPhotos]);
    setShowProjectPhotoPicker(false);
    setSelectedProjPhotos(new Set());
  };

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
  // Erweiterte Briefkopf-Daten: Kunden- und Ansprechpartner-Kontakte aus Projekt
  const bauherrAddrStr = project?.bauherr_street
    ? `${project.bauherr_street}, ${(p?.bauherr_plz || p?.bauherr_zip) || ''} ${project.bauherr_city || ''}`.trim()
    : '';
  const bauherrPhone = (p?.bauherr_phone || p?.bauherr_mobile || '');
  const bauherrEmail = (p?.bauherr_email || '');
  const projectContactPhone = (p?.objekt_phone || '');
  const projectContactEmail = (p?.objekt_email || '');
  const projectType = project?.project_type || '';

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={{ paddingBottom: 100 }}
          keyboardShouldPersistTaps="handled"
          scrollEnabled={scrollEnabled}
        >
          {/* ===== 0. Logo + Titel Header ===== */}
          <View style={styles.brandHeader}>
            {companyLogo ? (
              <Image source={{ uri: companyLogo }} style={styles.brandLogo} resizeMode="contain" />
            ) : (
              <View style={styles.brandLogoPlaceholder}>
                <Ionicons name="business-outline" size={22} color="#94a3b8" />
              </View>
            )}
            <View style={{ flex: 1, marginLeft: 10 }}>
              {companyName ? <Text style={styles.brandCompany} numberOfLines={1}>{companyName}</Text> : null}
              <TouchableOpacity
                onPress={() => { setTitleEditInput(reportTitle); setShowTitleEdit(true); }}
                style={styles.brandTitleRow}
              >
                <Text style={styles.brandTitle}>{reportTitle}</Text>
                <Ionicons name="pencil" size={13} color="#94a3b8" />
              </TouchableOpacity>
            </View>
            <View style={styles.brandRapNo}>
              <Text style={styles.brandRapNoLabel}>Nr.</Text>
              <Text style={styles.brandRapNoValue}>{reportNumber || '—'}</Text>
            </View>
          </View>

          {/* ===== 1. Projekt-Block (oben) - dynamisch gemäß Briefkopf-Auswahl ===== */}
          <View style={styles.topCard}>
            <View style={styles.topGrid}>
              {headerFields.has('project_name') && (
                <View style={[styles.topField, { flex: 2 }]}>
                  <View style={styles.topFieldHeader}>
                    <Ionicons name="briefcase-outline" size={14} color="#475569" />
                    <Text style={styles.topFieldLabel}>Projekt</Text>
                  </View>
                  <Text style={styles.topFieldValue} numberOfLines={1}>
                    {project?.name || '—'}{headerFields.has('project_number') && project?.project_number ? ` · ${project.project_number}` : ''}
                  </Text>
                </View>
              )}
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

            {/* Projektart */}
            {headerFields.has('project_type') && projectType ? (
              <View style={styles.topField}>
                <View style={styles.topFieldHeader}>
                  <Ionicons name="construct-outline" size={14} color="#475569" />
                  <Text style={styles.topFieldLabel}>Projektart</Text>
                </View>
                <Text style={styles.topFieldValue} numberOfLines={1}>{projectType}</Text>
              </View>
            ) : null}

            {/* Baustelle */}
            {headerFields.has('project_address') && objektStr ? (
              <View style={styles.topField}>
                <View style={styles.topFieldHeader}>
                  <Ionicons name="location-outline" size={14} color="#475569" />
                  <Text style={styles.topFieldLabel}>Baustelle</Text>
                </View>
                <Text style={styles.topFieldValue} numberOfLines={2}>{objektStr}</Text>
              </View>
            ) : null}

            {/* Kunde */}
            {(headerFields.has('customer_name') && bauherrFull) || (headerFields.has('customer_address') && bauherrAddrStr) ? (
              <View style={styles.topField}>
                <View style={styles.topFieldHeader}>
                  <Ionicons name="person-outline" size={14} color="#475569" />
                  <Text style={styles.topFieldLabel}>Kunde</Text>
                </View>
                {headerFields.has('customer_name') && bauherrFull ? (
                  <Text style={styles.topFieldValue} numberOfLines={1}>{bauherrFull}</Text>
                ) : null}
                {headerFields.has('customer_address') && bauherrAddrStr ? (
                  <Text style={[styles.topFieldValue, { fontWeight: '500', color: '#475569', fontSize: 12 }]} numberOfLines={2}>{bauherrAddrStr}</Text>
                ) : null}
              </View>
            ) : null}

            {/* Kunde Telefon/Email */}
            {(headerFields.has('customer_phone') && bauherrPhone) || (headerFields.has('customer_email') && bauherrEmail) ? (
              <View style={styles.topGrid}>
                {headerFields.has('customer_phone') && bauherrPhone ? (
                  <View style={[styles.topField, { flex: 1 }]}>
                    <View style={styles.topFieldHeader}>
                      <Ionicons name="call-outline" size={14} color="#475569" />
                      <Text style={styles.topFieldLabel}>Tel. Kunde</Text>
                    </View>
                    <Text style={styles.topFieldValue} numberOfLines={1}>{bauherrPhone}</Text>
                  </View>
                ) : null}
                {headerFields.has('customer_email') && bauherrEmail ? (
                  <View style={[styles.topField, { flex: 1 }]}>
                    <View style={styles.topFieldHeader}>
                      <Ionicons name="mail-outline" size={14} color="#475569" />
                      <Text style={styles.topFieldLabel}>E-Mail Kunde</Text>
                    </View>
                    <Text style={styles.topFieldValue} numberOfLines={1}>{bauherrEmail}</Text>
                  </View>
                ) : null}
              </View>
            ) : null}

            {/* Ansprechpartner (Name als Input, da häufig vor Ort wechselt) */}
            {headerFields.has('project_contact') ? (
              <View style={styles.topField}>
                <View style={styles.topFieldHeader}>
                  <Ionicons name="person-circle-outline" size={14} color="#475569" />
                  <Text style={styles.topFieldLabel}>Ansprechpartner</Text>
                </View>
                <TextInput
                  style={styles.topFieldInput}
                  value={contactPerson}
                  onChangeText={setContactPerson}
                  placeholder="z.B. Herr Müller"
                />
              </View>
            ) : null}

            {/* Ansprechpartner Telefon/Email */}
            {(headerFields.has('project_contact_phone') && projectContactPhone) || (headerFields.has('project_contact_email') && projectContactEmail) ? (
              <View style={styles.topGrid}>
                {headerFields.has('project_contact_phone') && projectContactPhone ? (
                  <View style={[styles.topField, { flex: 1 }]}>
                    <View style={styles.topFieldHeader}>
                      <Ionicons name="call-outline" size={14} color="#475569" />
                      <Text style={styles.topFieldLabel}>Tel. Ansprechp.</Text>
                    </View>
                    <Text style={styles.topFieldValue} numberOfLines={1}>{projectContactPhone}</Text>
                  </View>
                ) : null}
                {headerFields.has('project_contact_email') && projectContactEmail ? (
                  <View style={[styles.topField, { flex: 1 }]}>
                    <View style={styles.topFieldHeader}>
                      <Ionicons name="mail-outline" size={14} color="#475569" />
                      <Text style={styles.topFieldLabel}>E-Mail Ansprechp.</Text>
                    </View>
                    <Text style={styles.topFieldValue} numberOfLines={1}>{projectContactEmail}</Text>
                  </View>
                ) : null}
              </View>
            ) : null}

            {/* Rapport-Nr. + Wetter (immer sichtbar) */}
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
                {employees.map((emp) => {
                  const hours = (emp.time_from && emp.time_to) ? calcEmpHours(emp.time_from, emp.time_to, emp.pause_minutes) : (emp.hours || 0);
                  const empDate = emp.entry_date || date;
                  const isOtherDay = empDate !== date;
                  return (
                    <View key={emp.id} style={styles.empRowCard}>
                      {/* Top: Avatar + Name + Funktion + Delete */}
                      <View style={styles.empCardTop}>
                        <View style={[styles.empAvatar, { backgroundColor: emp.color || '#1976d2' }]}>
                          <Text style={styles.empAvatarText}>{(emp.name || '?').charAt(0).toUpperCase()}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <TextInput
                            style={styles.empNameInputLg}
                            value={emp.name}
                            onChangeText={(v) => updateEmployee(emp.id, { name: v })}
                            placeholder="Name"
                          />
                          <TextInput
                            style={styles.empRoleInput}
                            value={emp.role || ''}
                            onChangeText={(v) => updateEmployee(emp.id, { role: v })}
                            placeholder="Funktion (z.B. Dachdecker)"
                          />
                        </View>
                        <TouchableOpacity onPress={() => removeEmployee(emp.id)} style={styles.itemRemoveBtn}>
                          <Ionicons name="trash-outline" size={18} color="#ef4444" />
                        </TouchableOpacity>
                      </View>

                      {/* Zeile 2: Datum + Beginn + Ende + Pause + Stunden */}
                      <View style={styles.empCardBottom}>
                        <TouchableOpacity
                          style={[styles.dateCell, isOtherDay && styles.dateCellAlt]}
                          onPress={() => setEmpDatePicker({ empId: emp.id })}
                        >
                          <Ionicons name="calendar-outline" size={11} color={isOtherDay ? '#dc2626' : '#64748b'} />
                          <Text style={[styles.dateCellText, isOtherDay && { color: '#dc2626' }]}>
                            {new Date(empDate).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.timeCell}
                          onPress={() => setTimePickerFor({ empId: emp.id, field: 'time_from' })}
                        >
                          <Text style={styles.timeCellMini}>VON</Text>
                          <Text style={styles.timeCellText}>{emp.time_from || '--:--'}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.timeCell}
                          onPress={() => setTimePickerFor({ empId: emp.id, field: 'time_to' })}
                        >
                          <Text style={styles.timeCellMini}>BIS</Text>
                          <Text style={styles.timeCellText}>{emp.time_to || '--:--'}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.timeCellSmall}
                          onPress={() => {
                            setPauseInput(emp.pause_minutes ? String(emp.pause_minutes) : '');
                            setPauseModal({ empId: emp.id });
                          }}
                        >
                          <Text style={styles.timeCellMini}>PAUSE</Text>
                          <Text style={styles.timeCellText}>{emp.pause_minutes != null ? `${emp.pause_minutes}` : '0'}</Text>
                        </TouchableOpacity>
                        <View style={styles.hoursCellBox}>
                          <Text style={styles.timeCellMini}>STD.</Text>
                          <Text style={styles.hoursCellLg}>{hours.toFixed(2)}</Text>
                        </View>
                      </View>
                    </View>
                  );
                })}
                {/* Gesamtsumme */}
                <View style={styles.empSumRow}>
                  <Text style={styles.empSumLabel}>Gesamtstunden aller Mitarbeiter</Text>
                  <Text style={styles.empSumValue}>{totalAllHours.toFixed(2)} h</Text>
                </View>
                {/* Stunden pro Funktion */}
                {hoursByRole.length > 0 && (
                  <View style={styles.roleGroup}>
                    <Text style={styles.roleGroupTitle}>Stunden pro Funktion:</Text>
                    {hoursByRole.map(r => (
                      <View key={r.role} style={styles.roleGroupRow}>
                        <View style={styles.roleBadge}>
                          <Text style={styles.roleBadgeText}>{r.role}</Text>
                          <Text style={styles.roleBadgeCount}>{r.count}×</Text>
                        </View>
                        <Text style={styles.roleHoursText}>{r.hours.toFixed(2)} h</Text>
                      </View>
                    ))}
                  </View>
                )}
              </>
            )}
          </Section>

          {/* ===== Hilfs-Header für Mitarbeiter wurde durch Karten ersetzt ===== */}

          {/* ===== 2b. Fahrzeiten / Anfahrt (direkt nach Stunden) ===== */}
          <Section
            icon="car-sport-outline"
            title="Fahrzeiten / Anfahrt"
            subtitle={travelPerEmployee ? 'Pro Mitarbeiter erfasst' : `Für ganzes Team${employees.length > 1 ? ` (× ${employees.length} Mitarbeiter)` : ''}`}
            color="#0891b2"
            right={
              <TouchableOpacity
                onPress={() => setTravelPerEmployee(!travelPerEmployee)}
                style={[styles.travelToggle, travelPerEmployee && { backgroundColor: '#0891b2' }]}
              >
                <Ionicons name={travelPerEmployee ? 'people' : 'people-outline'} size={14} color={travelPerEmployee ? '#fff' : '#0891b2'} />
                <Text style={[styles.travelToggleText, travelPerEmployee && { color: '#fff' }]}>
                  {travelPerEmployee ? 'Pro MA' : 'Team'}
                </Text>
              </TouchableOpacity>
            }
          >
            {!travelPerEmployee ? (
              <View>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.miniLabel}>🛣️ Fahrzeit Hin</Text>
                    <TouchableOpacity
                      style={styles.travelTimeBtn}
                      onPress={() => setTravelTimePicker({ kind: 'team-to' })}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="time-outline" size={16} color="#0891b2" />
                      <Text style={styles.travelTimeBtnText}>
                        {travelToHoursStr || '0:00'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.miniLabel}>↩️ Fahrzeit Rück</Text>
                    <TouchableOpacity
                      style={styles.travelTimeBtn}
                      onPress={() => setTravelTimePicker({ kind: 'team-back' })}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="time-outline" size={16} color="#0891b2" />
                      <Text style={styles.travelTimeBtnText}>
                        {travelBackHoursStr || '0:00'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.miniLabel}>📏 km Hin</Text>
                    <TextInput style={styles.input} value={travelToKm} onChangeText={(v) => setTravelToKm(v.replace(/[^0-9,.]/g, ''))} placeholder="z.B. 12,5" keyboardType="numbers-and-punctuation" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.miniLabel}>📏 km Rück</Text>
                    <TextInput style={styles.input} value={travelBackKm} onChangeText={(v) => setTravelBackKm(v.replace(/[^0-9,.]/g, ''))} placeholder="z.B. 12,5" keyboardType="numbers-and-punctuation" />
                  </View>
                </View>
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.miniLabel}>💶 Spesen / Fahrtkosten (€)</Text>
                    <TextInput style={styles.input} value={travelCosts} onChangeText={(v) => setTravelCosts(v.replace(/[^0-9,.]/g, ''))} placeholder="z.B. 12,50" keyboardType="numbers-and-punctuation" />
                  </View>
                </View>
                <Text style={[styles.miniLabel, { marginTop: 8 }]}>Bemerkung zur Fahrt</Text>
                <TextInput style={styles.input} value={travelNote} onChangeText={setTravelNote} placeholder="z.B. Stau auf A8" />
              </View>
            ) : (
              <View>
                {employees.length === 0 ? (
                  <Text style={{ color: '#94a3b8', fontStyle: 'italic', textAlign: 'center', paddingVertical: 10 }}>
                    Bitte zuerst Mitarbeiter hinzufügen.
                  </Text>
                ) : (
                  employees.map((emp) => {
                    const ea: any = emp;
                    const parts: string[] = [];
                    if (ea.travel_to_hours) parts.push(`🛣️ Hin ${formatHM(ea.travel_to_hours)}`);
                    if (ea.travel_back_hours) parts.push(`↩️ Rück ${formatHM(ea.travel_back_hours)}`);
                    const kmSum = (ea.travel_to_km || 0) + (ea.travel_back_km || 0);
                    if (kmSum > 0) parts.push(`📏 ${String(kmSum).replace('.', ',')} km`);
                    if (ea.travel_costs) parts.push(`💶 ${String(ea.travel_costs).replace('.', ',')} €`);
                    return (
                      <TouchableOpacity
                        key={emp.id}
                        style={styles.travelEmpRow}
                        onPress={() => { setEmpTravelModal(emp.id); setEmpTravelPickerField(null); }}
                        activeOpacity={0.7}
                      >
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <View style={[styles.empAvatar, { backgroundColor: emp.color || '#1976d2', width: 22, height: 22, borderRadius: 11 }]}>
                            <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700' }}>
                              {(emp.name || '?').slice(0, 1).toUpperCase()}
                            </Text>
                          </View>
                          <Text style={{ flex: 1, fontSize: 13, fontWeight: '700', color: '#0f172a' }}>{emp.name}</Text>
                          <Ionicons name="create-outline" size={16} color="#0891b2" />
                          <Ionicons name="chevron-forward" size={16} color="#94a3b8" />
                        </View>
                        <Text style={{
                          fontSize: 12,
                          color: parts.length ? '#0e7490' : '#94a3b8',
                          marginTop: 4,
                          fontWeight: parts.length ? '600' : '400',
                          fontStyle: parts.length ? 'normal' : 'italic',
                        }}>
                          {parts.length ? parts.join('  ·  ') : 'Keine Fahrzeiten – tippen zum Erfassen'}
                        </Text>
                      </TouchableOpacity>
                    );
                  })
                )}
              </View>
            )}
            {!travelPerEmployee ? (
              <>
                <TouchableOpacity
                  style={[styles.travelTotalToggle, travelInTotalHours && styles.travelTotalToggleActive]}
                  onPress={() => setTravelInTotalHours(!travelInTotalHours)}
                  activeOpacity={0.7}
                >
                  <Ionicons name={travelInTotalHours ? 'checkbox' : 'square-outline'} size={18} color={travelInTotalHours ? '#16a34a' : '#94a3b8'} />
                  <Text style={{ fontSize: 13, fontWeight: '600', color: travelInTotalHours ? '#15803d' : '#475569', flex: 1 }}>
                    Fahrzeit zur Gesamtarbeitszeit hinzurechnen
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.saveDefaultBtn}
                  onPress={async () => {
                    try {
                      await SettingsService.update({ report_travel_in_total_hours: travelInTotalHours } as any);
                      Alert.alert('Gespeichert', 'Diese Einstellung ist jetzt der Standard.');
                    } catch { Alert.alert('Fehler', 'Konnte nicht gespeichert werden.'); }
                  }}
                >
                  <Ionicons name="bookmark-outline" size={14} color="#0ea5e9" />
                  <Text style={styles.saveDefaultBtnText}>Als Standard speichern</Text>
                </TouchableOpacity>
              </>
            ) : (
              <View style={[styles.travelTotalToggle, { backgroundColor: '#dcfce7', borderColor: '#16a34a' }]}>
                <Ionicons name="checkmark-circle" size={18} color="#16a34a" />
                <Text style={{ fontSize: 13, fontWeight: '600', color: '#15803d', flex: 1 }}>
                  Pro-Mitarbeiter-Fahrzeiten werden automatisch zu den Stunden addiert
                </Text>
              </View>
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
                {materials.map(m => {
                  const isSaved = savedMatIds.has(m.id) || matMaster.some(mm => mm.name.toLowerCase() === (m.name || '').toLowerCase() && mm.unit === m.unit);
                  return (
                    <View key={m.id} style={styles.matRow}>
                      <TextInput
                        style={[styles.itemInput, { flex: 2 }]}
                        value={m.name}
                        onChangeText={(v) => updateMaterial(m.id, 'name', v)}
                        placeholder="Material"
                      />
                      <TextInput
                        style={[styles.itemInput, { width: 60, textAlign: 'right' }]}
                        value={matQtyDraft[m.id] ?? (m.quantity ? String(m.quantity).replace('.', ',') : '')}
                        onChangeText={(v) => {
                          const clean = v.replace(/[^0-9,.]/g, '');
                          setMatQtyDraft(prev => ({ ...prev, [m.id]: clean }));
                          updateMaterial(m.id, 'quantity', clean);
                        }}
                        onBlur={() => setMatQtyDraft(prev => { const d = { ...prev }; delete d[m.id]; return d; })}
                        placeholder="0"
                        keyboardType="numbers-and-punctuation"
                      />
                      <TextInput
                        style={[styles.itemInput, { width: 50, textAlign: 'center' }]}
                        value={m.unit}
                        onChangeText={(v) => updateMaterial(m.id, 'unit', v)}
                        placeholder="Stk"
                      />
                      <TouchableOpacity
                        onPress={() => handleSaveMaterialToMaster(m)}
                        style={styles.saveToMasterBtn}
                        disabled={isSaved}
                      >
                        <Ionicons
                          name={isSaved ? "bookmark" : "bookmark-outline"}
                          size={16}
                          color={isSaved ? "#16a34a" : "#1976d2"}
                        />
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => removeMaterial(m.id)} style={styles.itemRemoveBtn}>
                        <Ionicons name="trash-outline" size={16} color="#ef4444" />
                      </TouchableOpacity>
                    </View>
                  );
                })}
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
              <View style={{ gap: 6 }}>
                {machines.map(m => {
                  const master = m.master_id ? machMasterById[m.master_id] : undefined;
                  const statusColor = master?.status === 'ausgeliehen' ? '#7c3aed'
                    : master?.status === 'einsatz' ? '#2563eb'
                    : master?.status === 'wartung' ? '#d97706'
                    : master?.status === 'nicht_verfuegbar' ? '#ef4444'
                    : '#16a34a';
                  const statusLabel = master?.status === 'ausgeliehen' ? 'Ausgeliehen'
                    : master?.status === 'einsatz' ? 'Im Einsatz'
                    : master?.status === 'wartung' ? 'Wartung'
                    : master?.status === 'nicht_verfuegbar' ? 'Nicht verfügbar'
                    : master ? 'Verfügbar' : '';
                  const firstPhoto = master?.photos && master.photos.length > 0 ? master.photos[0] : null;
                  return (
                    <View key={m.id} style={styles.machineRow}>
                      {firstPhoto ? (
                        <Image source={{ uri: firstPhoto }} style={styles.machineRowPhoto} />
                      ) : (
                        <View style={styles.machineRowIcon}>
                          <Ionicons name="construct" size={18} color="#7c3aed" />
                        </View>
                      )}
                      <View style={{ flex: 1 }}>
                        <TextInput
                          style={styles.machineRowName}
                          value={m.name}
                          onChangeText={(v) => updateMachine(m.id, 'name', v)}
                          placeholder="Bezeichnung"
                        />
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                          {statusLabel ? (
                            <View style={[styles.machineStatusBadge, { backgroundColor: `${statusColor}20` }]}>
                              <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
                              <Text style={[styles.machineStatusText, { color: statusColor }]}>{statusLabel}</Text>
                            </View>
                          ) : null}
                          <View style={styles.hoursInputWrap}>
                            <Ionicons name="time-outline" size={12} color="#64748b" />
                            <TextInput
                              style={styles.hoursInput}
                              value={m.hours != null ? String(m.hours).replace('.', ',') : ''}
                              onChangeText={(v) => {
                                const num = v ? parseFloat(v.replace(',', '.').replace(/[^\d.-]/g, '')) || 0 : undefined;
                                updateMachine(m.id, 'hours', num as any);
                              }}
                              placeholder="0"
                              keyboardType="numbers-and-punctuation"
                            />
                            <Text style={styles.hoursUnit}>h</Text>
                          </View>
                        </View>
                      </View>
                      <TouchableOpacity onPress={() => removeMachine(m.id)} style={{ padding: 4 }}>
                        <Ionicons name="close-circle" size={20} color="#94a3b8" />
                      </TouchableOpacity>
                    </View>
                  );
                })}
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
                <TouchableOpacity onPress={openProjectPhotoPicker} style={[styles.sectionBtnPrimary, { backgroundColor: '#16a34a' }]}>
                  <Ionicons name="folder" size={14} color="#fff" />
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
                      <Ionicons name="close-circle" size={22} color="#475569" />
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

          {/* === Sections moved: Fahrzeiten after Mitarbeiter, Briefkopf nach Unterschriften === */}

          {/* ===== 8. Sonstige Notizen ===== */}
          <Section icon="document-text-outline" title="Notizen" color="#ec4899">
            <Text style={styles.miniLabel}>Notizen</Text>
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
                onDrawingChange={(isDrawing) => setScrollEnabled(!isDrawing)}
                placeholder="Hier unterschreiben (Kunde)"
                height={140}
              />
              <TextInput
                style={[styles.input, { marginTop: 6 }]}
                value={signatureCustomerName}
                onChangeText={setSignatureCustomerName}
                onFocus={() => setScrollEnabled(true)}
                placeholder="Name in Druckbuchstaben (optional)"
              />
            </View>
            <View style={styles.sigBlock}>
              <SignaturePad
                label="Handwerker / Auftragnehmer"
                value={signatureWorker}
                onChange={setSignatureWorker}
                onDrawingChange={(isDrawing) => setScrollEnabled(!isDrawing)}
                placeholder="Hier unterschreiben (Handwerker)"
                height={140}
              />
              <TextInput
                style={[styles.input, { marginTop: 6 }]}
                value={signatureWorkerName}
                onChangeText={setSignatureWorkerName}
                onFocus={() => setScrollEnabled(true)}
                placeholder="Name in Druckbuchstaben (optional)"
              />
            </View>
          </Section>

          {/* ===== Briefkopf-Felder (am Ende, vor PDF-Export wählen) ===== */}
          <Section icon="document-attach-outline" title="Briefkopf für PDF" subtitle="Welche Projektdaten erscheinen im Briefkopf?" color="#0ea5e9">
            <Text style={[styles.miniLabel, { marginTop: 0 }]}>👤 Kunde</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 4 }}>
              {REPORT_HEADER_FIELDS.filter(f => f.group === 'customer').map(f => {
                const active = headerFields.has(f.id);
                return (
                  <TouchableOpacity
                    key={f.id}
                    onPress={() => {
                      const next = new Set(headerFields);
                      if (active) next.delete(f.id); else next.add(f.id);
                      setHeaderFields(next);
                    }}
                    style={[styles.hfChip, active && styles.hfChipActive]}
                    activeOpacity={0.7}
                  >
                    <Ionicons name={active ? 'checkbox' : 'square-outline'} size={16} color={active ? '#0ea5e9' : '#94a3b8'} />
                    <Text style={[styles.hfChipText, active && styles.hfChipTextActive]}>{f.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <Text style={[styles.miniLabel, { marginTop: 8 }]}>🏗️ Projekt</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {REPORT_HEADER_FIELDS.filter(f => f.group === 'project').map(f => {
                const active = headerFields.has(f.id);
                return (
                  <TouchableOpacity
                    key={f.id}
                    onPress={() => {
                      const next = new Set(headerFields);
                      if (active) next.delete(f.id); else next.add(f.id);
                      setHeaderFields(next);
                    }}
                    style={[styles.hfChip, active && styles.hfChipActive]}
                    activeOpacity={0.7}
                  >
                    <Ionicons name={active ? 'checkbox' : 'square-outline'} size={16} color={active ? '#0ea5e9' : '#94a3b8'} />
                    <Text style={[styles.hfChipText, active && styles.hfChipTextActive]}>{f.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <TouchableOpacity
              style={styles.saveDefaultBtn}
              onPress={async () => {
                try {
                  await SettingsService.update({ report_header_fields_default: Array.from(headerFields) } as any);
                  Alert.alert('Gespeichert', 'Diese Auswahl ist jetzt der Standard für neue Rapporte.');
                } catch { Alert.alert('Fehler', 'Konnte nicht gespeichert werden.'); }
              }}
            >
              <Ionicons name="bookmark-outline" size={14} color="#0ea5e9" />
              <Text style={styles.saveDefaultBtnText}>Als Standard speichern</Text>
            </TouchableOpacity>
          </Section>

          {/* ===== Preise anzeigen (optional) ===== */}
          <Section icon="cash-outline" title="Preise im PDF" subtitle="Welche Kostenangaben sollen im PDF erscheinen?" color="#16a34a">
            {(() => {
              const toggle = (label: string, sub: string, val: boolean, set: (v: boolean) => void, icon: any) => (
                <TouchableOpacity
                  key={label}
                  onPress={() => set(!val)}
                  style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' }}
                  activeOpacity={0.7}
                >
                  <Ionicons name={icon} size={20} color={val ? '#16a34a' : '#94a3b8'} />
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={{ fontSize: 14, fontWeight: '600', color: '#0f172a' }}>{label}</Text>
                    <Text style={{ fontSize: 11, color: '#64748b', marginTop: 1 }}>{sub}</Text>
                  </View>
                  <Ionicons name={val ? 'toggle' : 'toggle-outline'} size={32} color={val ? '#16a34a' : '#cbd5e1'} />
                </TouchableOpacity>
              );
              return (
                <>
                  {toggle('Mitarbeiter-Lohnkosten', 'Stunden × Stundensatz pro Mitarbeiter', showEmployeeCosts, setShowEmployeeCosts, 'people-outline')}
                  {toggle('Material-Kosten', 'Menge × Einzelpreis pro Material', showMaterialCosts, setShowMaterialCosts, 'cube-outline')}
                  {toggle('Maschinen-Kosten', 'Einsatzstunden × Stundensatz', showMachineCosts, setShowMachineCosts, 'construct-outline')}
                  {toggle('Spesen / Fahrtkosten', 'Erfasste Spesen zur Summe addieren', showTravelCosts, setShowTravelCosts, 'car-outline')}
                  {toggle('Gesamtsumme', 'Summe aller aktivierten Posten am Ende', showTotalSum, setShowTotalSum, 'calculator-outline')}
                  {toggle('Mehrwertsteuer anzeigen', 'Netto / MwSt / Brutto auf dem PDF', showVat, setShowVat, 'receipt-outline')}
                </>
              );
            })()}

            {showVat && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#f1f5f9' }}>
                <Text style={{ fontSize: 13, fontWeight: '600', color: '#0f172a', flex: 1 }}>MwSt-Satz</Text>
                <TextInput
                  style={{ borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, width: 90, textAlign: 'right', fontSize: 14 }}
                  value={vatRateStr}
                  onChangeText={setVatRateStr}
                  keyboardType="decimal-pad"
                  placeholder="19"
                />
                <Text style={{ fontSize: 14, color: '#475569' }}>%</Text>
              </View>
            )}

            {/* ===== Live Kosten-Übersicht (editierbar) ===== */}
            {(showEmployeeCosts || showMaterialCosts || showMachineCosts || showTotalSum) && (() => {
              const eur = (n: number) => `${n.toFixed(2).replace('.', ',')} €`;

              // Mitarbeiter
              let empTotal = 0;
              const empRows = employees.map((e, idx) => {
                const ea: any = e;
                const calcH = (() => {
                  if (!ea.time_from || !ea.time_to) return e.hours != null ? e.hours : 0;
                  const [fh, fm] = ea.time_from.split(':').map(Number);
                  const [th, tm] = ea.time_to.split(':').map(Number);
                  let mins = (th * 60 + tm) - (fh * 60 + fm);
                  if (mins < 0) mins += 24 * 60;
                  mins -= ea.pause_minutes || 0;
                  return Math.max(0, Math.round((mins / 60) * 100) / 100);
                })();
                const travelExtra = ((ea.travel_to_hours || 0) + (ea.travel_back_hours || 0));
                const teamTravel = (travelPerEmployee ? 0 : ((parseFloat((travelToHoursStr || '0').replace(',', '.')) || 0) + (parseFloat((travelBackHoursStr || '0').replace(',', '.')) || 0)));
                const totalHrs = calcH + (travelPerEmployee ? travelExtra : (travelInTotalHours ? teamTravel : 0));
                const master = empMaster.find((m: any) => (e.id && m.id === e.id) || m.name?.toLowerCase() === (e.name || '').toLowerCase());
                const rate = ea.hourly_rate != null ? ea.hourly_rate : (master?.hourly_rate || 0);
                const cost = totalHrs * rate;
                empTotal += cost;
                return { idx, name: e.name, hours: totalHrs, rate, cost };
              });

              // Material
              let matTotal = 0;
              const matRows = materials.map((m, idx) => {
                const ma: any = m;
                const master = matMaster.find((mm: any) => mm.name?.toLowerCase() === (m.name || '').toLowerCase());
                const price = ma.price_per_unit != null ? ma.price_per_unit : (master?.price_per_unit || 0);
                const cost = (m.quantity || 0) * price;
                matTotal += cost;
                return { idx, name: m.name, quantity: m.quantity || 0, unit: m.unit, price, cost };
              });

              // Maschinen
              let macTotal = 0;
              const macRows = machines.map((m, idx) => {
                const ma: any = m;
                const master = machMaster.find((mm: any) => (m.master_id && mm.id === m.master_id) || mm.name?.toLowerCase() === (m.name || '').toLowerCase());
                const rate = ma.hourly_rate != null ? ma.hourly_rate : (master?.hourly_rate || 0);
                const hours = m.hours || 0;
                const cost = hours * rate;
                macTotal += cost;
                return { idx, name: m.name, hours, rate, cost };
              });

              // Spesen / Fahrtkosten
              const travelCostsTotal = travelPerEmployee
                ? employees.reduce((s, e: any) => s + (e.travel_costs || 0), 0)
                : (parseFloat((travelCosts || '0').replace(',', '.')) || 0);

              const netto = empTotal + matTotal + macTotal + (showTravelCosts ? travelCostsTotal : 0);
              const vatRateNum = parseFloat(vatRateStr.replace(',', '.')) || 0;
              const vatAmount = showVat ? netto * (vatRateNum / 100) : 0;
              const brutto = netto + vatAmount;

              const updateEmpRate = (i: number, v: string) => {
                const num = parseFloat(v.replace(',', '.'));
                setEmployees(prev => prev.map((emp, idx) => idx === i ? ({ ...emp, hourly_rate: isNaN(num) ? undefined : num } as any) : emp));
              };
              const updateMatPrice = (i: number, v: string) => {
                const num = parseFloat(v.replace(',', '.'));
                setMaterials(prev => prev.map((m, idx) => idx === i ? ({ ...m, price_per_unit: isNaN(num) ? undefined : num } as any) : m));
              };
              const updateMacRate = (i: number, v: string) => {
                const num = parseFloat(v.replace(',', '.'));
                setMachines(prev => prev.map((m, idx) => idx === i ? ({ ...m, hourly_rate: isNaN(num) ? undefined : num } as any) : m));
              };

              const rowStyle = { flexDirection: 'row' as const, alignItems: 'center' as const, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#f1f5f9', gap: 6 };
              const priceInput = (val: number, on: (v: string) => void) => (
                <TextInput
                  style={{ borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 4, width: 70, textAlign: 'right', fontSize: 12 }}
                  value={val > 0 ? String(val).replace('.', ',') : ''}
                  onChangeText={on}
                  keyboardType="decimal-pad"
                  placeholder="0,00"
                />
              );

              return (
                <View style={{ marginTop: 14, paddingTop: 12, borderTopWidth: 2, borderTopColor: '#dcfce7' }}>
                  <Text style={{ fontSize: 14, fontWeight: '800', color: '#166534', marginBottom: 8 }}>💰 Live Kosten-Übersicht</Text>

                  {showEmployeeCosts && empRows.length > 0 && (
                    <View style={{ marginBottom: 10 }}>
                      <Text style={{ fontSize: 12, fontWeight: '700', color: '#0f172a', marginBottom: 4 }}>Mitarbeiter</Text>
                      {empRows.map(r => (
                        <View key={r.idx} style={rowStyle}>
                          <Text style={{ flex: 1, fontSize: 12, color: '#0f172a' }} numberOfLines={1}>{r.name}</Text>
                          <Text style={{ fontSize: 11, color: '#64748b', width: 55, textAlign: 'right' }}>{r.hours.toFixed(2)} h ×</Text>
                          {priceInput(r.rate, (v) => updateEmpRate(r.idx, v))}
                          <Text style={{ fontSize: 11, color: '#64748b' }}>€/h</Text>
                          <Text style={{ fontSize: 12, fontWeight: '700', color: '#0f172a', width: 75, textAlign: 'right' }}>{eur(r.cost)}</Text>
                        </View>
                      ))}
                      <Text style={{ fontSize: 12, fontWeight: '700', color: '#0f172a', textAlign: 'right', marginTop: 4 }}>Σ {eur(empTotal)}</Text>
                    </View>
                  )}

                  {showMaterialCosts && matRows.length > 0 && (
                    <View style={{ marginBottom: 10 }}>
                      <Text style={{ fontSize: 12, fontWeight: '700', color: '#0f172a', marginBottom: 4 }}>Material</Text>
                      {matRows.map(r => (
                        <View key={r.idx} style={rowStyle}>
                          <Text style={{ flex: 1, fontSize: 12, color: '#0f172a' }} numberOfLines={1}>{r.name}</Text>
                          <Text style={{ fontSize: 11, color: '#64748b', width: 55, textAlign: 'right' }}>{r.quantity} {r.unit} ×</Text>
                          {priceInput(r.price, (v) => updateMatPrice(r.idx, v))}
                          <Text style={{ fontSize: 11, color: '#64748b' }}>€</Text>
                          <Text style={{ fontSize: 12, fontWeight: '700', color: '#0f172a', width: 75, textAlign: 'right' }}>{eur(r.cost)}</Text>
                        </View>
                      ))}
                      <Text style={{ fontSize: 12, fontWeight: '700', color: '#0f172a', textAlign: 'right', marginTop: 4 }}>Σ {eur(matTotal)}</Text>
                    </View>
                  )}

                  {showMachineCosts && macRows.length > 0 && (
                    <View style={{ marginBottom: 10 }}>
                      <Text style={{ fontSize: 12, fontWeight: '700', color: '#0f172a', marginBottom: 4 }}>Maschinen / Geräte</Text>
                      {macRows.map(r => (
                        <View key={r.idx} style={rowStyle}>
                          <Text style={{ flex: 1, fontSize: 12, color: '#0f172a' }} numberOfLines={1}>{r.name}</Text>
                          <Text style={{ fontSize: 11, color: '#64748b', width: 55, textAlign: 'right' }}>{r.hours.toFixed(2)} h ×</Text>
                          {priceInput(r.rate, (v) => updateMacRate(r.idx, v))}
                          <Text style={{ fontSize: 11, color: '#64748b' }}>€/h</Text>
                          <Text style={{ fontSize: 12, fontWeight: '700', color: '#0f172a', width: 75, textAlign: 'right' }}>{eur(r.cost)}</Text>
                        </View>
                      ))}
                      <Text style={{ fontSize: 12, fontWeight: '700', color: '#0f172a', textAlign: 'right', marginTop: 4 }}>Σ {eur(macTotal)}</Text>
                    </View>
                  )}

                  {showTravelCosts && travelCostsTotal > 0 && (
                    <View style={{ marginBottom: 10 }}>
                      <Text style={{ fontSize: 12, fontWeight: '700', color: '#0f172a', marginBottom: 4 }}>Spesen / Fahrtkosten</Text>
                      <View style={rowStyle}>
                        <Text style={{ flex: 1, fontSize: 12, color: '#0f172a' }}>
                          {travelPerEmployee ? '🚗 Summe aus Mitarbeiter-Fahrten' : '🚗 Team-Fahrt'}
                        </Text>
                        <Text style={{ fontSize: 12, fontWeight: '700', color: '#0f172a', width: 75, textAlign: 'right' }}>{eur(travelCostsTotal)}</Text>
                      </View>
                    </View>
                  )}

                  {/* Totals */}
                  <View style={{ marginTop: 10, padding: 12, backgroundColor: '#dcfce7', borderRadius: 8 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 }}>
                      <Text style={{ fontSize: 13, color: '#166534', fontWeight: '600' }}>Netto:</Text>
                      <Text style={{ fontSize: 13, color: '#166534', fontWeight: '700' }}>{eur(netto)}</Text>
                    </View>
                    {showVat && (
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 }}>
                        <Text style={{ fontSize: 13, color: '#166534' }}>+ MwSt {vatRateNum.toString().replace('.', ',')}%:</Text>
                        <Text style={{ fontSize: 13, color: '#166534', fontWeight: '700' }}>{eur(vatAmount)}</Text>
                      </View>
                    )}
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingTop: 6, marginTop: 6, borderTopWidth: 1, borderTopColor: '#16a34a' }}>
                      <Text style={{ fontSize: 15, color: '#166534', fontWeight: '800' }}>{showVat ? 'Brutto' : 'Gesamt'}:</Text>
                      <Text style={{ fontSize: 18, color: '#16a34a', fontWeight: '900' }}>{eur(brutto)}</Text>
                    </View>
                  </View>
                </View>
              );
            })()}

            <Text style={{ fontSize: 11, color: '#64748b', marginTop: 10, fontStyle: 'italic' }}>
              Tipp: Preise werden aus den Stammdaten geladen. Du kannst sie hier pro Rapport überschreiben – die Stammdaten bleiben unverändert.
            </Text>
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
        {timePickerFor && (() => {
          const emp = employees.find(e => e.id === timePickerFor.empId);
          const val = emp?.[timePickerFor.field] as string | undefined;
          const initDate = (() => {
            if (val) {
              const [h, m] = val.split(':').map(Number);
              const d = new Date(); d.setHours(h, m, 0, 0); return d;
            }
            const d = new Date();
            d.setHours(timePickerFor.field === 'time_from' ? 7 : 16, 0, 0, 0);
            return d;
          })();
          const picker = (
            <DateTimePicker
              value={initDate}
              mode="time"
              is24Hour
              display={Platform.OS === 'android' ? 'default' : 'spinner'}
              onChange={(_, selected) => {
                const isDialog = Platform.OS === 'android';
                if (!selected) {
                  if (isDialog) setTimePickerFor(null);
                  return;
                }
                const hh = String(selected.getHours()).padStart(2, '0');
                const mm = String(selected.getMinutes()).padStart(2, '0');
                updateEmployee(timePickerFor.empId, { [timePickerFor.field]: `${hh}:${mm}` } as any);
                if (isDialog) {
                  // Android auto-advance: bei 'from' direkt zu 'to'
                  if (timePickerFor.field === 'time_from') {
                    setTimeout(() => setTimePickerFor({ empId: timePickerFor.empId, field: 'time_to' }), 80);
                  } else {
                    setTimePickerFor(null);
                  }
                }
              }}
            />
          );
          // Android zeigt den nativen Dialog selbst an
          if (Platform.OS === 'android') return picker;
          // iOS/Web: Zentriertes Modal, damit die Speichern-Leiste nicht versehentlich getroffen wird
          return (
            <Modal visible transparent animationType="fade" onRequestClose={() => setTimePickerFor(null)}>
              <View style={styles.modalOverlayCenter}>
                <View style={[styles.modalSmall, { paddingBottom: 8 }]}>
                  <Text style={[styles.modalTitle, { color: '#1976d2' }]}>
                    {timePickerFor.field === 'time_from' ? '🕐 Beginn wählen' : '🕔 Ende wählen'}
                  </Text>
                  {emp?.name ? (
                    <Text style={{ fontSize: 12, color: '#64748b', textAlign: 'center', marginBottom: 4 }}>
                      {emp.name}
                    </Text>
                  ) : null}
                  {picker}
                  <View style={styles.modalActions}>
                    <TouchableOpacity style={[styles.modalBtn, styles.cancelBtn]} onPress={() => setTimePickerFor(null)}>
                      <Text style={styles.cancelBtnText}>Abbrechen</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.modalBtn, styles.saveBtn, { backgroundColor: '#1976d2' }]}
                      onPress={() => {
                        if (timePickerFor.field === 'time_from') {
                          setTimePickerFor({ empId: timePickerFor.empId, field: 'time_to' });
                        } else {
                          setTimePickerFor(null);
                        }
                      }}
                    >
                      <Ionicons name={timePickerFor.field === 'time_from' ? 'arrow-forward' : 'checkmark'} size={18} color="#fff" />
                      <Text style={styles.saveBtnText}>
                        {timePickerFor.field === 'time_from' ? 'Weiter zu Ende' : 'Fertig'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            </Modal>
          );
        })()}

        {/* Travel-Time-Picker (Drehrad) für Fahrzeiten */}
        {travelTimePicker && (() => {
          // Aktuellen Wert holen
          let currentHours = 0;
          if (travelTimePicker.kind === 'team-to') currentHours = parseTimeHM(travelToHoursStr) ?? 0;
          else if (travelTimePicker.kind === 'team-back') currentHours = parseTimeHM(travelBackHoursStr) ?? 0;
          else if (travelTimePicker.kind === 'emp-to') {
            const emp = employees.find(e => e.id === travelTimePicker.empId);
            currentHours = emp?.travel_to_hours ?? 0;
          } else if (travelTimePicker.kind === 'emp-back') {
            const emp = employees.find(e => e.id === travelTimePicker.empId);
            currentHours = emp?.travel_back_hours ?? 0;
          }
          // In Date umwandeln (HH:MM)
          const totalMin = Math.round(currentHours * 60);
          const initDate = new Date();
          initDate.setHours(Math.floor(totalMin / 60), totalMin % 60, 0, 0);

          const applyValue = (hours: number) => {
            if (travelTimePicker.kind === 'team-to') {
              setTravelToHoursStr(formatHM(hours));
            } else if (travelTimePicker.kind === 'team-back') {
              setTravelBackHoursStr(formatHM(hours));
            } else if (travelTimePicker.kind === 'emp-to') {
              setEmployees(prev => prev.map(e => e.id === travelTimePicker.empId ? { ...e, travel_to_hours: hours } : e));
            } else if (travelTimePicker.kind === 'emp-back') {
              setEmployees(prev => prev.map(e => e.id === travelTimePicker.empId ? { ...e, travel_back_hours: hours } : e));
            }
          };

          const title = travelTimePicker.kind === 'team-to' || travelTimePicker.kind === 'emp-to'
            ? '🛣️ Fahrzeit Hinweg'
            : '↩️ Fahrzeit Rückweg';

          return (
            <Modal visible transparent animationType="fade" onRequestClose={() => setTravelTimePicker(null)}>
              <View style={styles.modalOverlayCenter}>
                <View style={[styles.modalSmall, { paddingBottom: 8 }]}>
                  <Text style={[styles.modalTitle, { color: '#0891b2' }]}>{title}</Text>
                  <Text style={{ fontSize: 11, color: '#64748b', textAlign: 'center', marginBottom: 4 }}>
                    Stunden und Minuten wählen
                  </Text>
                  <DateTimePicker
                    value={initDate}
                    mode="time"
                    is24Hour
                    display="spinner"
                    minuteInterval={5}
                    onChange={(_, selected) => {
                      if (!selected) return;
                      const h = selected.getHours();
                      const m = selected.getMinutes();
                      const decimal = h + m / 60;
                      // iOS Live-Update, Android nur bei Bestätigung (handled in onPress unten)
                      if (Platform.OS === 'ios') {
                        applyValue(decimal);
                      } else {
                        applyValue(decimal);
                        setTravelTimePicker(null);
                      }
                    }}
                  />
                  <View style={styles.modalActions}>
                    <TouchableOpacity
                      style={[styles.modalBtn, styles.cancelBtn]}
                      onPress={() => {
                        // Reset auf 0 wenn Abbrechen
                        setTravelTimePicker(null);
                      }}
                    >
                      <Text style={styles.cancelBtnText}>Abbrechen</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.modalBtn, styles.saveBtn, { backgroundColor: '#0891b2' }]}
                      onPress={() => setTravelTimePicker(null)}
                    >
                      <Ionicons name="checkmark" size={18} color="#fff" />
                      <Text style={styles.saveBtnText}>Übernehmen</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            </Modal>
          );
        })()}

        {/* ===== Fahrzeiten-Dialog pro Mitarbeiter ===== */}
        {empTravelModal && (() => {
          const emp = employees.find(e => e.id === empTravelModal);
          if (!emp) return null;
          const ea: any = emp;
          const updateEmp = (patch: Partial<ReportEmployee>) => {
            setEmployees(prev => prev.map(e => e.id === emp.id ? { ...e, ...patch } : e));
          };
          // Unter-Ansicht: Drehrad für Fahrzeit Hin/Rück
          if (empTravelPickerField) {
            const cur = empTravelPickerField === 'to' ? (ea.travel_to_hours || 0) : (ea.travel_back_hours || 0);
            const totalMin = Math.round(cur * 60);
            const initDate = new Date();
            initDate.setHours(Math.floor(totalMin / 60), totalMin % 60, 0, 0);
            return (
              <Modal visible transparent animationType="fade" onRequestClose={() => setEmpTravelPickerField(null)}>
                <View style={styles.modalOverlayCenter}>
                  <View style={[styles.modalSmall, { paddingBottom: 8 }]}>
                    <Text style={[styles.modalTitle, { color: '#0891b2' }]}>
                      {empTravelPickerField === 'to' ? '🛣️ Fahrzeit Hinweg' : '↩️ Fahrzeit Rückweg'}
                    </Text>
                    <Text style={{ fontSize: 11, color: '#64748b', textAlign: 'center', marginBottom: 4 }}>
                      {emp.name} · Stunden und Minuten wählen
                    </Text>
                    <DateTimePicker
                      value={initDate}
                      mode="time"
                      is24Hour
                      display="spinner"
                      minuteInterval={5}
                      onChange={(_, selected) => {
                        if (!selected) return;
                        const decimal = selected.getHours() + selected.getMinutes() / 60;
                        if (empTravelPickerField === 'to') updateEmp({ travel_to_hours: decimal });
                        else updateEmp({ travel_back_hours: decimal });
                        if (Platform.OS === 'android') setEmpTravelPickerField(null);
                      }}
                    />
                    <View style={styles.modalActions}>
                      <TouchableOpacity style={[styles.modalBtn, styles.cancelBtn]} onPress={() => setEmpTravelPickerField(null)}>
                        <Text style={styles.cancelBtnText}>Zurück</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.modalBtn, styles.saveBtn, { backgroundColor: '#0891b2' }]}
                        onPress={() => setEmpTravelPickerField(null)}
                      >
                        <Ionicons name="checkmark" size={18} color="#fff" />
                        <Text style={styles.saveBtnText}>Übernehmen</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              </Modal>
            );
          }
          // Haupt-Dialog mit beschrifteten Feldern (wie Team-Fahrzeiten)
          return (
            <Modal visible transparent animationType="fade" onRequestClose={() => setEmpTravelModal(null)}>
              <View style={styles.modalOverlayCenter}>
                <View style={[styles.modalSmall, { maxWidth: 400 }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                    <View style={[styles.empAvatar, { backgroundColor: emp.color || '#1976d2', width: 28, height: 28, borderRadius: 14 }]}>
                      <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>
                        {(emp.name || '?').slice(0, 1).toUpperCase()}
                      </Text>
                    </View>
                    <Text style={[styles.modalTitle, { color: '#0891b2', flex: 1 }]} numberOfLines={1}>
                      🚗 Fahrzeiten – {emp.name}
                    </Text>
                    <TouchableOpacity onPress={() => setEmpTravelModal(null)}>
                      <Ionicons name="close" size={24} color="#666" />
                    </TouchableOpacity>
                  </View>

                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.miniLabel}>🛣️ Fahrzeit Hin</Text>
                      <TouchableOpacity
                        style={styles.travelTimeBtn}
                        onPress={() => setEmpTravelPickerField('to')}
                        activeOpacity={0.7}
                      >
                        <Ionicons name="time-outline" size={16} color="#0891b2" />
                        <Text style={styles.travelTimeBtnText}>{formatHM(ea.travel_to_hours) || '0:00'}</Text>
                      </TouchableOpacity>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.miniLabel}>↩️ Fahrzeit Rück</Text>
                      <TouchableOpacity
                        style={styles.travelTimeBtn}
                        onPress={() => setEmpTravelPickerField('back')}
                        activeOpacity={0.7}
                      >
                        <Ionicons name="time-outline" size={16} color="#0891b2" />
                        <Text style={styles.travelTimeBtnText}>{formatHM(ea.travel_back_hours) || '0:00'}</Text>
                      </TouchableOpacity>
                    </View>
                  </View>

                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.miniLabel}>📏 km Hin</Text>
                      <TextInput
                        style={styles.input}
                        value={travelKmDraft[`${emp.id}-km-to`] ?? (emp.travel_to_km != null ? String(emp.travel_to_km).replace('.', ',') : '')}
                        onChangeText={(v) => {
                          const clean = v.replace(/[^0-9,.]/g, '');
                          setTravelKmDraft({ ...travelKmDraft, [`${emp.id}-km-to`]: clean });
                          const num = clean ? parseFloat(clean.replace(',', '.')) : undefined;
                          updateEmp({ travel_to_km: Number.isFinite(num as number) ? num : undefined });
                        }}
                        onBlur={() => {
                          const d = { ...travelKmDraft };
                          delete d[`${emp.id}-km-to`];
                          setTravelKmDraft(d);
                        }}
                        placeholder="z.B. 12,5"
                        keyboardType="numbers-and-punctuation"
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.miniLabel}>📏 km Rück</Text>
                      <TextInput
                        style={styles.input}
                        value={travelKmDraft[`${emp.id}-km-back`] ?? (emp.travel_back_km != null ? String(emp.travel_back_km).replace('.', ',') : '')}
                        onChangeText={(v) => {
                          const clean = v.replace(/[^0-9,.]/g, '');
                          setTravelKmDraft({ ...travelKmDraft, [`${emp.id}-km-back`]: clean });
                          const num = clean ? parseFloat(clean.replace(',', '.')) : undefined;
                          updateEmp({ travel_back_km: Number.isFinite(num as number) ? num : undefined });
                        }}
                        onBlur={() => {
                          const d = { ...travelKmDraft };
                          delete d[`${emp.id}-km-back`];
                          setTravelKmDraft(d);
                        }}
                        placeholder="z.B. 12,5"
                        keyboardType="numbers-and-punctuation"
                      />
                    </View>
                  </View>

                  <View style={{ marginTop: 8 }}>
                    <Text style={styles.miniLabel}>💶 Spesen / Fahrtkosten (€)</Text>
                    <TextInput
                      style={styles.input}
                      value={travelKmDraft[`${emp.id}-cost`] ?? (emp.travel_costs != null ? String(emp.travel_costs).replace('.', ',') : '')}
                      onChangeText={(v) => {
                        const clean = v.replace(/[^0-9,.]/g, '');
                        setTravelKmDraft({ ...travelKmDraft, [`${emp.id}-cost`]: clean });
                        const num = clean ? parseFloat(clean.replace(',', '.')) : undefined;
                        updateEmp({ travel_costs: Number.isFinite(num as number) ? num : undefined });
                      }}
                      onBlur={() => {
                        const d = { ...travelKmDraft };
                        delete d[`${emp.id}-cost`];
                        setTravelKmDraft(d);
                      }}
                      placeholder="z.B. 12,50"
                      keyboardType="numbers-and-punctuation"
                    />
                  </View>

                  <View style={styles.modalActions}>
                    <TouchableOpacity
                      style={[styles.modalBtn, styles.saveBtn, { backgroundColor: '#0891b2' }]}
                      onPress={() => setEmpTravelModal(null)}
                    >
                      <Ionicons name="checkmark" size={18} color="#fff" />
                      <Text style={styles.saveBtnText}>Fertig</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            </Modal>
          );
        })()}

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

        {/* ===== Material in Stammdaten übernehmen (vollständiges Formular) ===== */}
        <Modal visible={!!matMasterModal} transparent animationType="fade" onRequestClose={() => setMatMasterModal(null)}>
          <View style={styles.modalOverlayCenter}>
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ width: '100%', maxWidth: 420 }}>
              <View style={[styles.modalSmall, { maxWidth: 420, width: '100%' }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <Text style={[styles.modalTitle, { color: '#d97706' }]}>📦 In Materialstamm übernehmen</Text>
                  <TouchableOpacity onPress={() => setMatMasterModal(null)}>
                    <Ionicons name="close" size={24} color="#666" />
                  </TouchableOpacity>
                </View>
                <ScrollView style={{ maxHeight: 440 }} keyboardShouldPersistTaps="handled">
                  <Text style={styles.miniLabel}>Bezeichnung *</Text>
                  <TextInput
                    style={styles.input}
                    value={matMasterForm.name || ''}
                    onChangeText={(v) => setMatMasterForm({ ...matMasterForm, name: v })}
                    placeholder="z.B. Dachziegel rot"
                  />

                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.miniLabel}>Einheit *</Text>
                      <TextInput
                        style={styles.input}
                        value={matMasterForm.unit || ''}
                        onChangeText={(v) => setMatMasterForm({ ...matMasterForm, unit: v })}
                        placeholder="Stk"
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.miniLabel}>Kategorie</Text>
                      <TextInput
                        style={styles.input}
                        value={matMasterForm.category || ''}
                        onChangeText={(v) => setMatMasterForm({ ...matMasterForm, category: v })}
                        placeholder="z.B. Dachziegel"
                      />
                    </View>
                  </View>

                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.miniLabel}>EK-Preis (€)</Text>
                      <TextInput
                        style={styles.input}
                        value={matMasterNum.ek ?? ''}
                        onChangeText={(v) => {
                          const clean = v.replace(/[^0-9,.]/g, '');
                          const ek = clean ? parseFloat(clean.replace(',', '.')) : NaN;
                          const markup = matMasterNum.markup ? parseFloat(matMasterNum.markup.replace(',', '.')) : NaN;
                          if (!isNaN(ek) && !isNaN(markup)) {
                            const vk = Math.round(ek * (1 + markup / 100) * 100) / 100;
                            setMatMasterNum({ ...matMasterNum, ek: clean, vk: String(vk).replace('.', ',') });
                          } else {
                            setMatMasterNum({ ...matMasterNum, ek: clean });
                          }
                        }}
                        placeholder="0,00"
                        keyboardType="numbers-and-punctuation"
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.miniLabel}>Aufschlag (%)</Text>
                      <TextInput
                        style={styles.input}
                        value={matMasterNum.markup ?? ''}
                        onChangeText={(v) => {
                          const clean = v.replace(/[^0-9,.]/g, '');
                          const markup = clean ? parseFloat(clean.replace(',', '.')) : NaN;
                          const ek = matMasterNum.ek ? parseFloat(matMasterNum.ek.replace(',', '.')) : NaN;
                          if (!isNaN(ek) && !isNaN(markup)) {
                            const vk = Math.round(ek * (1 + markup / 100) * 100) / 100;
                            setMatMasterNum({ ...matMasterNum, markup: clean, vk: String(vk).replace('.', ',') });
                          } else {
                            setMatMasterNum({ ...matMasterNum, markup: clean });
                          }
                        }}
                        placeholder="z.B. 15"
                        keyboardType="numbers-and-punctuation"
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.miniLabel}>VK-Preis (€)</Text>
                      <TextInput
                        style={styles.input}
                        value={matMasterNum.vk ?? ''}
                        onChangeText={(v) => setMatMasterNum({ ...matMasterNum, vk: v.replace(/[^0-9,.]/g, '') })}
                        placeholder="0,00"
                        keyboardType="numbers-and-punctuation"
                      />
                    </View>
                  </View>
                  <Text style={{ fontSize: 10, color: '#94a3b8', marginTop: 4 }}>
                    💡 VK wird automatisch aus EK + Aufschlag berechnet. Der VK-Preis wird für die Kostenberechnung verwendet.
                  </Text>

                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.miniLabel}>Lieferant</Text>
                      <TextInput
                        style={styles.input}
                        value={matMasterForm.supplier || ''}
                        onChangeText={(v) => setMatMasterForm({ ...matMasterForm, supplier: v })}
                        placeholder="z.B. Dachbaustoffe GmbH"
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.miniLabel}>Artikel-Nr.</Text>
                      <TextInput
                        style={styles.input}
                        value={matMasterForm.article_number || ''}
                        onChangeText={(v) => setMatMasterForm({ ...matMasterForm, article_number: v })}
                        placeholder="z.B. DZ-1001"
                      />
                    </View>
                  </View>
                </ScrollView>

                <View style={styles.modalActions}>
                  <TouchableOpacity style={[styles.modalBtn, styles.cancelBtn]} onPress={() => setMatMasterModal(null)}>
                    <Text style={styles.cancelBtnText}>Abbrechen</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.modalBtn, styles.saveBtn, { backgroundColor: '#d97706' }]} onPress={saveMatMasterFromModal}>
                    <Ionicons name="bookmark" size={16} color="#fff" />
                    <Text style={styles.saveBtnText}>Speichern</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </KeyboardAvoidingView>
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
                ) : machMaster.map(m => {
                  const statusColor = m.status === 'ausgeliehen' ? '#7c3aed'
                    : m.status === 'einsatz' ? '#2563eb'
                    : m.status === 'wartung' ? '#d97706'
                    : m.status === 'nicht_verfuegbar' ? '#ef4444'
                    : '#16a34a';
                  const statusLabel = m.status === 'ausgeliehen' ? 'Ausgeliehen'
                    : m.status === 'einsatz' ? 'Im Einsatz'
                    : m.status === 'wartung' ? 'Wartung'
                    : m.status === 'nicht_verfuegbar' ? 'Nicht verfügbar'
                    : 'Verfügbar';
                  const firstPhoto = m.photos && m.photos.length > 0 ? m.photos[0] : null;
                  return (
                    <TouchableOpacity key={m.id} style={styles.pickerRow} onPress={() => addMachineFromMaster(m)}>
                      {firstPhoto ? (
                        <Image source={{ uri: firstPhoto }} style={{ width: 40, height: 40, borderRadius: 8, backgroundColor: '#f1f5f9' }} />
                      ) : (
                        <View style={[styles.empAvatar, { backgroundColor: '#ede9fe' }]}>
                          <Ionicons name="construct" size={18} color="#7c3aed" />
                        </View>
                      )}
                      <View style={{ flex: 1 }}>
                        <Text style={styles.pickerName}>{m.name}</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2, flexWrap: 'wrap' }}>
                          <View style={[styles.machineStatusBadge, { backgroundColor: `${statusColor}20` }]}>
                            <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
                            <Text style={[styles.machineStatusText, { color: statusColor }]}>{statusLabel}</Text>
                          </View>
                          {m.category ? <Text style={styles.pickerSub}>{m.category}</Text> : null}
                          {m.manufacturer ? <Text style={styles.pickerSub}>{m.manufacturer}</Text> : null}
                        </View>
                      </View>
                      <Ionicons name="add-circle" size={24} color="#1976d2" />
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
              <TouchableOpacity style={styles.modalCloseBtn} onPress={() => setShowMachPicker(false)}>
                <Text style={styles.modalCloseText}>Fertig</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* Checklist-Picker - 2-Stufen-Auswahl */}
        <Modal visible={showChecklistPicker} transparent animationType="slide" onRequestClose={() => { setShowChecklistPicker(false); setActiveChecklist(null); setSelectedClItems(new Set()); }}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalSheet}>
              {/* Stufe 1: Liste der Checklisten wählen */}
              {!activeChecklist ? (
                <>
                  <View style={styles.modalHeader}>
                    <Text style={styles.modalTitle}>Aus Checkliste importieren</Text>
                    <TouchableOpacity onPress={() => setShowChecklistPicker(false)}>
                      <Ionicons name="close" size={26} color="#666" />
                    </TouchableOpacity>
                  </View>
                  <Text style={[styles.hintText, { marginBottom: 10 }]}>
                    Wähle eine Checkliste – im nächsten Schritt kannst du einzelne Punkte auswählen.
                  </Text>
                  <ScrollView style={{ maxHeight: 400 }}>
                    {projChecklists.length === 0 ? (
                      <Text style={styles.modalEmpty}>Keine Checklisten in diesem Projekt.</Text>
                    ) : projChecklists.map(cl => {
                      const total = (cl.items || []).length;
                      const checked = (cl.items || []).filter((i: any) => i.checked).length;
                      return (
                        <TouchableOpacity key={cl.id} style={styles.pickerRow} onPress={() => openChecklistDetail(cl)}>
                          <View style={[styles.empAvatar, { backgroundColor: '#dcfce7' }]}>
                            <Ionicons name="checkbox" size={18} color="#16a34a" />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.pickerName}>{cl.template_name}</Text>
                            <Text style={styles.pickerSub}>{checked} / {total} erledigt</Text>
                          </View>
                          <Ionicons name="chevron-forward" size={22} color="#1976d2" />
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                  <TouchableOpacity style={styles.modalCloseBtn} onPress={() => setShowChecklistPicker(false)}>
                    <Text style={styles.modalCloseText}>Schließen</Text>
                  </TouchableOpacity>
                </>
              ) : (
                /* Stufe 2: Item-Auswahl */
                <>
                  <View style={styles.modalHeader}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, gap: 6 }}>
                      <TouchableOpacity onPress={() => { setActiveChecklist(null); setSelectedClItems(new Set()); }} style={{ padding: 4 }}>
                        <Ionicons name="chevron-back" size={22} color="#1976d2" />
                      </TouchableOpacity>
                      <Text style={styles.modalTitle} numberOfLines={1}>{activeChecklist.template_name}</Text>
                    </View>
                    <TouchableOpacity onPress={() => { setShowChecklistPicker(false); setActiveChecklist(null); setSelectedClItems(new Set()); }}>
                      <Ionicons name="close" size={26} color="#666" />
                    </TouchableOpacity>
                  </View>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <Text style={[styles.hintText, { flex: 1 }]}>
                      {selectedClItems.size} / {flattenChecklistItems(activeChecklist).length} Punkte ausgewählt
                    </Text>
                    <TouchableOpacity onPress={() => toggleSelectAllCl(activeChecklist)} style={styles.smallChip}>
                      <Ionicons
                        name={flattenChecklistItems(activeChecklist).every(i => selectedClItems.has(i.id)) ? 'checkbox' : 'square-outline'}
                        size={14}
                        color="#1976d2"
                      />
                      <Text style={styles.smallChipText}>Alle</Text>
                    </TouchableOpacity>
                  </View>
                  <ScrollView style={{ maxHeight: 400 }}>
                    {flattenChecklistItems(activeChecklist).map(item => {
                      const isSelected = selectedClItems.has(item.id);
                      return (
                        <TouchableOpacity
                          key={item.id}
                          style={[
                            styles.clItemRow,
                            { paddingLeft: 12 + item.depth * 20 },
                            isSelected && styles.clItemRowSelected,
                          ]}
                          onPress={() => toggleClItemSelection(activeChecklist, item.id)}
                        >
                          <Ionicons
                            name={isSelected ? 'checkbox' : 'square-outline'}
                            size={22}
                            color={isSelected ? '#16a34a' : '#94a3b8'}
                          />
                          {item.depth > 0 && <Text style={{ color: '#94a3b8', fontSize: 14 }}>↳</Text>}
                          <Text
                            style={[
                              styles.clItemText,
                              !item.checked && { textDecorationLine: 'line-through', color: '#94a3b8' },
                            ]}
                            numberOfLines={2}
                          >
                            {item.text}
                          </Text>
                          {item.checked && (
                            <View style={styles.clItemDoneBadge}>
                              <Ionicons name="checkmark" size={11} color="#16a34a" />
                            </View>
                          )}
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                    <TouchableOpacity
                      style={[styles.modalCloseBtn, { flex: 1, backgroundColor: '#eceff1' }]}
                      onPress={() => { setActiveChecklist(null); setSelectedClItems(new Set()); }}
                    >
                      <Text style={[styles.modalCloseText, { color: '#475569' }]}>Zurück</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.modalCloseBtn, { flex: 1.4, backgroundColor: '#16a34a' }]}
                      onPress={importSelectedClItems}
                    >
                      <Text style={[styles.modalCloseText, { color: '#fff' }]}>
                        Übernehmen ({selectedClItems.size})
                      </Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}
            </View>
          </View>
        </Modal>
        {/* Title-Edit Modal */}
        <Modal visible={showTitleEdit} transparent animationType="fade" onRequestClose={() => setShowTitleEdit(false)}>
          <View style={styles.modalOverlayCenter}>
            <View style={styles.modalSmall}>
              <Text style={styles.modalTitle}>Rapport-Überschrift anpassen</Text>
              <Text style={[styles.hintText, { marginTop: 4 }]}>
                Wird in allen Rapporten und PDFs als Titel verwendet (z.B. Tagesbericht, Arbeitsrapport).
              </Text>
              <TextInput
                style={[styles.input, { fontSize: 16, marginTop: 10 }]}
                value={titleEditInput}
                onChangeText={setTitleEditInput}
                placeholder="z.B. Tagesbericht"
                autoFocus
              />
              <View style={styles.modalActions}>
                <TouchableOpacity style={[styles.modalBtn, styles.cancelBtn]} onPress={() => setShowTitleEdit(false)}>
                  <Text style={styles.cancelBtnText}>Abbrechen</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.modalBtn, styles.saveBtn]} onPress={handleSaveTitle}>
                  <Ionicons name="checkmark" size={18} color="#fff" />
                  <Text style={styles.saveBtnText}>Speichern</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* Date Picker pro Mitarbeiter-Eintrag */}
        {empDatePicker && (
          <>
            <DateTimePicker
              value={(() => {
                const emp = employees.find(e => e.id === empDatePicker.empId);
                const v = emp?.entry_date || date;
                return v ? new Date(v) : new Date();
              })()}
              mode="date"
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              onChange={(_, selected) => {
                if (Platform.OS !== 'ios') setEmpDatePicker(null);
                if (selected && empDatePicker) {
                  updateEmployee(empDatePicker.empId, { entry_date: selected.toISOString().split('T')[0] });
                }
              }}
            />
            {Platform.OS === 'ios' && (
              <TouchableOpacity onPress={() => setEmpDatePicker(null)} style={styles.iosPickerDone}>
                <Text style={styles.iosPickerDoneText}>Fertig</Text>
              </TouchableOpacity>
            )}
          </>
        )}

        {/* Projektfoto-Picker */}
        <Modal visible={showProjectPhotoPicker} transparent animationType="slide" onRequestClose={() => { setShowProjectPhotoPicker(false); setSelectedProjPhotos(new Set()); }}>
          <View style={styles.modalOverlay}>
            <View style={[styles.modalSheet, { maxHeight: '85%' }]}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Aus Projektfotos</Text>
                <TouchableOpacity onPress={() => { setShowProjectPhotoPicker(false); setSelectedProjPhotos(new Set()); }}>
                  <Ionicons name="close" size={26} color="#666" />
                </TouchableOpacity>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <Text style={[styles.hintText, { flex: 1 }]}>
                  {selectedProjPhotos.size} / {projectPhotos.length} Foto{projectPhotos.length === 1 ? '' : 's'} ausgewählt
                </Text>
                {projectPhotos.length > 0 && (
                  <TouchableOpacity
                    onPress={() => {
                      const all = projectPhotos.every(p => selectedProjPhotos.has(p.id));
                      setSelectedProjPhotos(all ? new Set() : new Set(projectPhotos.map(p => p.id)));
                    }}
                    style={styles.smallChip}
                  >
                    <Ionicons
                      name={projectPhotos.every(p => selectedProjPhotos.has(p.id)) ? 'checkbox' : 'square-outline'}
                      size={14}
                      color="#1976d2"
                    />
                    <Text style={styles.smallChipText}>Alle</Text>
                  </TouchableOpacity>
                )}
              </View>
              <ScrollView style={{ maxHeight: 460 }}>
                {projectPhotos.length === 0 ? (
                  <Text style={styles.modalEmpty}>Keine Projekt-Fotos vorhanden.</Text>
                ) : (
                  <View style={styles.projPhotoGrid}>
                    {projectPhotos.map(p => {
                      const sel = selectedProjPhotos.has(p.id);
                      const uri = p.image_data
                        ? (p.image_data.startsWith('data:') ? p.image_data : `data:image/jpeg;base64,${p.image_data}`)
                        : (p.thumbnail || p.uri);
                      return (
                        <TouchableOpacity
                          key={p.id}
                          style={[styles.projPhotoCard, sel && styles.projPhotoCardSelected]}
                          onPress={() => toggleProjPhoto(p.id)}
                          activeOpacity={0.85}
                        >
                          <Image source={{ uri }} style={styles.projPhotoImg} resizeMode="cover" />
                          <View style={[styles.projPhotoCheck, sel && { backgroundColor: '#16a34a' }]}>
                            <Ionicons name={sel ? 'checkmark' : 'add'} size={14} color="#fff" />
                          </View>
                          {p.description ? (
                            <Text style={styles.projPhotoCaption} numberOfLines={1}>{p.description}</Text>
                          ) : null}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}
              </ScrollView>
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                <TouchableOpacity
                  style={[styles.modalCloseBtn, { flex: 1, backgroundColor: '#eceff1' }]}
                  onPress={() => { setShowProjectPhotoPicker(false); setSelectedProjPhotos(new Set()); }}
                >
                  <Text style={[styles.modalCloseText, { color: '#475569' }]}>Abbrechen</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalCloseBtn, { flex: 1.4, backgroundColor: '#16a34a' }]}
                  onPress={importSelectedProjPhotos}
                >
                  <Text style={[styles.modalCloseText, { color: '#fff' }]}>
                    Übernehmen ({selectedProjPhotos.size})
                  </Text>
                </TouchableOpacity>
              </View>
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
    marginTop: 0,
    padding: 12,
    borderRadius: 12,
    borderTopWidth: 3,
    borderTopColor: '#0f172a',
  },

  // --- Brand Header (Logo + Titel) ---
  brandHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    margin: 10,
    marginBottom: 6,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  brandLogo: {
    width: 56, height: 56, borderRadius: 8,
    backgroundColor: '#f8fafc',
  },
  brandLogoPlaceholder: {
    width: 56, height: 56, borderRadius: 8,
    backgroundColor: '#f1f5f9',
    alignItems: 'center', justifyContent: 'center',
  },
  brandCompany: { fontSize: 12, fontWeight: '600', color: '#475569' },
  brandTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  brandTitle: { fontSize: 19, fontWeight: '800', color: '#0f172a', letterSpacing: 0.3 },
  brandRapNo: {
    alignItems: 'center', backgroundColor: '#f1f5f9',
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8,
  },
  brandRapNoLabel: { fontSize: 9, fontWeight: '700', color: '#94a3b8', letterSpacing: 0.5 },
  brandRapNoValue: { fontSize: 13, fontWeight: '800', color: '#0f172a' },

  // --- Employee Card Row ---
  empRowCard: {
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    padding: 8,
    marginVertical: 4,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  empCardTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  empCardBottom: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    marginTop: 8,
  },
  empNameInputLg: {
    fontSize: 14, fontWeight: '700', color: '#0f172a',
    paddingVertical: 2, paddingHorizontal: 0,
    borderBottomWidth: 1, borderBottomColor: '#e2e8f0',
  },
  empRoleInput: {
    fontSize: 12, color: '#64748b',
    paddingVertical: 2, paddingHorizontal: 0, marginTop: 2,
    fontStyle: 'italic',
  },
  dateCell: {
    flexDirection: 'row', alignItems: 'center', gap: 2,
    paddingHorizontal: 6, paddingVertical: 4,
    backgroundColor: '#fff', borderRadius: 6,
    borderWidth: 1, borderColor: '#e2e8f0',
  },
  dateCellAlt: {
    backgroundColor: '#fef2f2', borderColor: '#fecaca',
  },
  dateCellText: { fontSize: 11, fontWeight: '700', color: '#475569' },
  timeCellMini: { fontSize: 8, fontWeight: '700', color: '#94a3b8', letterSpacing: 0.5 },
  hoursCellBox: {
    backgroundColor: '#dbeafe', borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 3,
    alignItems: 'center',
    minWidth: 50,
  },
  hoursCellLg: { fontSize: 14, fontWeight: '800', color: '#1d4ed8' },

  // --- Role group ---
  roleGroup: {
    marginTop: 8, padding: 10,
    backgroundColor: '#f8fafc', borderRadius: 8,
    borderWidth: 1, borderColor: '#e2e8f0',
  },
  roleGroupTitle: { fontSize: 11, fontWeight: '700', color: '#475569', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  roleGroupRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 },
  roleBadge: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  roleBadgeText: { fontSize: 12, fontWeight: '600', color: '#1976d2', backgroundColor: '#dbeafe', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  roleBadgeCount: { fontSize: 11, color: '#94a3b8' },
  roleHoursText: { fontSize: 13, fontWeight: '800', color: '#0f172a' },

  // --- Save to Master Btn ---
  saveToMasterBtn: {
    padding: 6, borderRadius: 6, backgroundColor: '#eff6ff',
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
  // --- Machine rows (with status & hours) ---
  machineRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#faf5ff', borderRadius: 12, padding: 8,
    borderWidth: 1, borderColor: '#e9d5ff',
  },
  machineRowPhoto: { width: 40, height: 40, borderRadius: 8, backgroundColor: '#f1f5f9' },
  machineRowIcon: { width: 40, height: 40, borderRadius: 8, backgroundColor: '#ede9fe', alignItems: 'center', justifyContent: 'center' },
  machineRowName: { fontSize: 14, color: '#0f172a', fontWeight: '700', paddingVertical: 2 },
  machineStatusBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 },
  machineStatusText: { fontSize: 10, fontWeight: '700' },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  hoursInputWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: '#fff', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2,
    borderWidth: 1, borderColor: '#e2e8f0',
  },
  hoursInput: { minWidth: 28, maxWidth: 50, fontSize: 12, color: '#0f172a', fontWeight: '600', paddingVertical: 2 },
  hoursUnit: { fontSize: 10, color: '#64748b' },

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
  // Briefkopf-Felder Chips
  hfChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: '#f1f5f9', borderWidth: 1, borderColor: '#e2e8f0',
    paddingHorizontal: 8, paddingVertical: 6, borderRadius: 7,
  },
  hfChipActive: { backgroundColor: '#e0f2fe', borderColor: '#0ea5e9' },
  hfChipText: { fontSize: 12, fontWeight: '600', color: '#64748b' },
  hfChipTextActive: { color: '#0369a1' },
  saveDefaultBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start',
    marginTop: 8, paddingHorizontal: 10, paddingVertical: 6,
    backgroundColor: '#f0f9ff', borderRadius: 7, borderWidth: 1, borderColor: '#bae6fd',
  },
  saveDefaultBtnText: { fontSize: 11, color: '#0369a1', fontWeight: '700' },
  // Fahrzeiten
  travelToggle: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 16,
    backgroundColor: '#ecfeff', borderWidth: 1, borderColor: '#0891b2',
  },
  travelToggleText: { fontSize: 11, fontWeight: '700', color: '#0891b2' },
  travelEmpRow: {
    backgroundColor: '#f8fafc', borderRadius: 8, padding: 8, marginBottom: 6,
    borderWidth: 1, borderColor: '#e2e8f0',
  },
  travelTotalToggle: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginTop: 10, paddingHorizontal: 10, paddingVertical: 8,
    backgroundColor: '#f8fafc', borderRadius: 8, borderWidth: 1, borderColor: '#e2e8f0',
  },
  travelTotalToggleActive: { backgroundColor: '#dcfce7', borderColor: '#16a34a' },
  travelTimeBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: '#ecfeff', borderWidth: 1.5, borderColor: '#67e8f9',
    borderRadius: 8, paddingVertical: 10, paddingHorizontal: 8, minHeight: 42,
  },
  travelTimeBtnText: { fontSize: 14, color: '#0e7490', fontWeight: '700' },

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
    width: '48%', backgroundColor: '#f8fafc', borderRadius: 10,
    borderWidth: 1, borderColor: '#e2e8f0', overflow: 'hidden',
    position: 'relative',
  },
  photoImg: { width: '100%', height: 180, backgroundColor: '#f1f5f9', resizeMode: 'cover' },
  photoDelete: {
    position: 'absolute', top: 4, right: 4,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: 12, padding: 1,
  },
  photoCaption: {
    fontSize: 12, paddingHorizontal: 8, paddingVertical: 6,
    borderTopWidth: 1, borderTopColor: '#e2e8f0',
    backgroundColor: '#ffffff', color: '#0f172a',
  },

  // --- Signatures ---
  sigBlock: { marginBottom: 12 },

  // --- iOS time pickers ---
  iosPickerDone: { alignSelf: 'flex-end', padding: 8, marginRight: 10 },
  iosPickerDoneText: { color: '#1976d2', fontWeight: '700' },

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
  // Checklist Item-Auswahl
  clItemRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingRight: 12, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: '#f1f5f9',
  },
  clItemRowSelected: { backgroundColor: '#f0fdf4' },
  clItemText: { flex: 1, fontSize: 14, color: '#0f172a' },
  clItemDoneBadge: {
    width: 18, height: 18, borderRadius: 9, backgroundColor: '#dcfce7',
    alignItems: 'center', justifyContent: 'center',
  },
  smallChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 4,
    borderRadius: 12, backgroundColor: '#eff6ff',
    borderWidth: 1, borderColor: '#bfdbfe',
  },
  smallChipText: { fontSize: 11, color: '#1976d2', fontWeight: '700' },
  // Projektfoto-Picker Grid
  projPhotoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  projPhotoCard: {
    width: '31%', aspectRatio: 1, borderRadius: 10, overflow: 'hidden',
    backgroundColor: '#f1f5f9', borderWidth: 2, borderColor: 'transparent',
    position: 'relative',
  },
  projPhotoCardSelected: { borderColor: '#16a34a' },
  projPhotoImg: { width: '100%', height: '100%' },
  projPhotoCheck: {
    position: 'absolute', top: 4, right: 4,
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center', justifyContent: 'center',
  },
  projPhotoCaption: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: 'rgba(0,0,0,0.6)', color: '#fff',
    fontSize: 9, paddingHorizontal: 4, paddingVertical: 2,
  },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  modalBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, borderRadius: 8, gap: 6 },
  cancelBtn: { backgroundColor: '#eceff1' },
  cancelBtnText: { color: '#555', fontWeight: '600' },
  saveBtn: { backgroundColor: '#16a34a' },
  saveBtnText: { color: '#fff', fontWeight: '700' },
});

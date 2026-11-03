// Startseite 2.0 – gleiches Design für BASIC und PRO, Kacheln nach vorhandenen Berechtigungen (FeatureFlags)
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, RefreshControl, Alert, useWindowDimensions, TouchableOpacity, DeviceEventEmitter } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import Ionicons from '@react-native-vector-icons/ionicons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ProjectService, CustomerService, SettingsService, PhotoService, Project, Customer, cleanupOrphanedStorage, migrateSketchPreviews } from '../services/LocalStorage';
import { ProjectFolderService, ProjectFolder } from '../services/ProjectFolders';
import { FolderTiles } from '../src/components/home/FolderTiles';
import { TodayOverview, todayKey, AgendaItem } from '../src/components/home/TodayOverview';
import { WeekPreview } from '../src/components/home/WeekPreview';
import { AppointmentFormModal } from '../src/components/home/AppointmentFormModal';
import { buildAgenda } from '../src/utils/agenda';
import { AppointmentService, Appointment } from '../services/AppointmentService';
import { openNavigation } from '../src/utils/appointmentTools';
import { Features, loadProStatus, updateFeatures, getProStatus } from '../services/FeatureFlags';
import { BackupService } from '../services/BackupService';
import { quickFreeableScan } from '../services/StorageCleanup';
import { PROJECT_STATUSES, normalizeStatus } from '../src/constants/projectStatus';
import { useDayPeriod } from '../src/hooks/useDayPeriod';
import { HomeHero } from '../src/components/home/HomeHero';
import { StatCards, StatItem } from '../src/components/home/StatCards';
import { HomeBanner } from '../src/components/home/HomeBanner';
import { HomeTour, tourRef, TOUR_DONE_KEY } from '../src/components/home/HomeTour';
import { RecentProjects } from '../src/components/home/RecentProjects';
import { TileGrid, HomeTile, cardShadow } from '../src/components/home/HomeTiles';

// Vorname: eigenes Feld, sonst erstes Wort aus „Inhaber“
const resolveFirstName = (settings: any): string => {
  const explicit = (settings?.owner_first_name || '').trim();
  if (explicit) return explicit;
  return ((settings?.owner_name || '').trim().split(/\s+/)[0]) || '';
};

export default function HomeScreen() {
  const router = useRouter();
  const period = useDayPeriod();
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;
  const isWide = width >= 1000;

  const [projects, setProjects] = useState<Project[]>([]);
  const [customers, setCustomers] = useState<Record<string, Customer>>({});
  const [firstName, setFirstName] = useState('');
  const [isPro, setIsPro] = useState(getProStatus());
  const [refreshing, setRefreshing] = useState(false);
  const [backupDueDays, setBackupDueDays] = useState<number | null>(null);
  const [backupRunning, setBackupRunning] = useState(false);
  const [storageFreeable, setStorageFreeable] = useState<number | null>(null);
  const [companyLogo, setCompanyLogo] = useState<string | null>(null);
  const [covers, setCovers] = useState<Record<string, string>>({});
  const [folders, setFolders] = useState<ProjectFolder[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [appointmentModal, setAppointmentModal] = useState(false);
  const [editAppointment, setEditAppointment] = useState<Appointment | null>(null);

  // Einmalig beim App-Start: Papierkorb (>30 Tage), Vorschauen auslagern, verwaiste Daten aufräumen, Speicher messen
  useEffect(() => {
    ProjectService.purgeExpiredTrash()
      .catch(() => {})
      .then(() => migrateSketchPreviews().catch(() => {}))
      .then(() => cleanupOrphanedStorage().catch(() => {}))
      .then(() => quickFreeableScan().catch(() => 0))
      .then(bytes => { if (bytes && bytes > 20 * 1024 * 1024) setStorageFreeable(bytes); });
  }, []);

  const load = useCallback(async () => {
    try {
      const [proStatus, projectList, customerList, settings, folderList] = await Promise.all([
        loadProStatus(),
        ProjectService.getAll(),
        CustomerService.getAll(),
        SettingsService.get().catch(() => ({} as any)),
        ProjectFolderService.getAll(),
      ]);
      updateFeatures();
      setIsPro(proStatus);
      setProjects(projectList);
      setFolders(folderList);
      AppointmentService.getAll().then(setAppointments).catch(() => {});
      setCompanyLogo((settings as any)?.logo_data || (settings as any)?.company_logo || null);
      // Vorschaufotos der 3 letzten Projekte
      const recentIds = projectList
        .filter((p: Project) => normalizeStatus(p.status) !== 'archiviert')
        .sort((a: Project, b: Project) => (b.updated_at || b.created_at || '').localeCompare(a.updated_at || a.created_at || ''))
        .slice(0, 3)
        .map((p: Project) => p.id);
      PhotoService.getCoverImages(recentIds).then(setCovers).catch(() => {});
      const map: Record<string, Customer> = {};
      customerList.forEach((c: Customer) => { map[c.id] = c; });
      setCustomers(map);
      setFirstName(resolveFirstName(settings));
      // Backup-Erinnerung
      const raw = await AsyncStorage.getItem('aufmassprofi_backup_reminder_days');
      const days = raw != null ? parseInt(raw, 10) : 7;
      const snoozedUntil = parseInt((await AsyncStorage.getItem('aufmassprofi_backup_banner_snooze')) || '0', 10);
      if (!days || days <= 0 || Date.now() < snoozedUntil) setBackupDueDays(null);
      else {
        const status = await BackupService.isBackupDue(days);
        setBackupDueDays(status.due ? (status.daysSince || 0) : null);
      }
    } catch (e) {
      console.error('[Home] load error:', e);
    } finally {
      setRefreshing(false);
    }
  }, []);

  // Bei jedem Fokus neu laden → Tarifwechsel und geänderter Vorname wirken sofort
  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Erste-Schritte-Tour: nach Bestätigung der Hinweise einmalig (oder erneut aus der Anleitung gestartet)
  const [tour, setTour] = useState(false);
  const checkTour = useCallback(async () => {
    const [done, settings] = await Promise.all([AsyncStorage.getItem(TOUR_DONE_KEY), SettingsService.get().catch(() => ({}))]);
    if (!done && (settings as any)?.disclaimer_accepted_at) setTimeout(() => setTour(true), 900);
  }, []);
  useFocusEffect(useCallback(() => { checkTour(); }, [checkTour]));
  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('disclaimer-accepted', checkTour);
    return () => sub.remove();
  }, [checkTour]);

  const handleBackupNow = async () => {
    if (backupRunning) return;
    setBackupRunning(true);
    try {
      const res = await BackupService.exportFullBackup();
      setBackupDueDays(null);
      const mb = res.sizeBytes / (1024 * 1024);
      Alert.alert('Backup erstellt ✓', `Die Sicherung (${mb >= 1 ? mb.toFixed(1) + ' MB' : Math.max(1, Math.round(res.sizeBytes / 1024)) + ' KB'}) wurde erstellt.`);
    } catch (e: any) {
      Alert.alert('Backup fehlgeschlagen', 'Bitte versuchen Sie es erneut.' + (e?.message ? `\n(${e.message})` : ''));
    } finally {
      setBackupRunning(false);
    }
  };

  const active = useMemo(() => projects.filter(p => normalizeStatus(p.status) !== 'archiviert'), [projects]);

  const folderCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    active.forEach(p => { if (p.folder_id) counts[p.folder_id] = (counts[p.folder_id] || 0) + 1; });
    return counts;
  }, [active]);

  const stats: StatItem[] = useMemo(() => {
    const pick = ['anfrage', 'angebot', 'ausfuehrung', 'fertig'];
    return [
      { key: 'all', label: active.length === 1 ? 'Projekt' : 'Projekte', count: active.length, icon: 'folder-outline', color: '#1976d2', onPress: () => router.push('/projects?status=all') },
      ...PROJECT_STATUSES.filter(s => pick.includes(s.key)).map(s => ({
        key: s.key,
        label: s.label,
        count: projects.filter(p => normalizeStatus(p.status) === s.key).length,
        icon: s.icon,
        color: s.color,
        onPress: () => router.push(`/projects?status=${s.key}`),
      })),
    ];
  }, [projects, active, router]);

  const recent = useMemo(
    () => [...active].sort((a, b) => (b.updated_at || b.created_at || '').localeCompare(a.updated_at || a.created_at || '')).slice(0, 3),
    [active]
  );

  // Heute-Übersicht + Wochenvorschau: Projekt-Termine (Feld „Termin“) + eigene Termine
  const today = todayKey();
  const agenda: AgendaItem[] = useMemo(() => buildAgenda({
    projects: active,
    appointments,
    customers,
    onOpenProject: id => router.push(`/projects/${id}`),
    onEditAppointment: a => { setEditAppointment(a); setAppointmentModal(true); },
  }), [active, appointments, customers, router]);
  const todayItems = useMemo(() => agenda.filter(i => i.date === today), [agenda, today]);
  const weekItems = useMemo(() => {
    const end = new Date(); end.setDate(end.getDate() + 7);
    const endKey = todayKey(end);
    return agenda.filter(i => i.date > today && i.date <= endKey);
  }, [agenda, today]);
  const editedToday = useMemo(
    () => active.filter(p => p.appointment_date !== today && p.updated_at && todayKey(new Date(p.updated_at)) === today)
      .sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || '')).slice(0, 5),
    [active, today]
  );

  // Schnellaktionen – nur vorhandene Funktionen; Import nur wenn im Tarif freigeschaltet
  const actions: HomeTile[] = [
    { key: 'new-customer', title: 'Kunde anlegen', icon: 'person-add-outline', color: '#1976d2', bg: '#e3f2fd', onPress: () => router.push('/customers/new') },
    { key: 'checklists', title: 'Checklisten', icon: 'checkbox-outline', color: '#7b1fa2', bg: '#f3e5f5', onPress: () => router.push('/checklists/templates') },
    ...(Features.showImportButton ? [{ key: 'import', title: 'Projekt importieren', icon: 'download-outline', color: '#2e7d32', bg: '#e8f5e9', onPress: () => router.push('/projects?action=import') }] : []),
  ];

  const navTiles: HomeTile[] = [
    { key: 'customers', title: 'Kunden', subtitle: 'Adressen und Kontaktdaten', icon: 'people-outline', color: '#0284c7', bg: '#e0f2fe', onPress: () => router.push('/customers/') },
    ...(Features.showReportTab ? [
      { key: 'employees', title: 'Mitarbeiter', subtitle: 'Team und Zuordnungen', icon: 'people-circle-outline', color: '#1d4ed8', bg: '#dbeafe', onPress: () => router.push('/employees/') },
      { key: 'materials', title: 'Material', subtitle: 'Materiallisten und Bestand', icon: 'cube-outline', color: '#d97706', bg: '#fef3c7', onPress: () => router.push('/materials/') },
      { key: 'machines', title: 'Maschinen', subtitle: 'Geräte und Ausstattung', icon: 'construct-outline', color: '#7c3aed', bg: '#ede9fe', onPress: () => router.push('/machines/') },
    ] : []),
    ...(Features.showReferenzButton ? [
      { key: 'references', title: 'Referenzen', subtitle: 'Projekte und Beispielfotos', icon: 'images-outline', color: '#f57c00', bg: '#fff3e0', onPress: () => router.push('/references/') },
    ] : []),
    { key: 'backup', title: 'Backup', subtitle: 'Sichern und wiederherstellen', icon: 'cloud-upload-outline', color: '#0891b2', bg: '#cffafe', onPress: () => router.push('/backup') },
    { key: 'help', title: 'Anleitung', subtitle: 'So funktioniert die App', icon: 'book-outline', color: '#1565c0', bg: '#dbeafe', onPress: () => router.push('/help') },
    { key: 'settings', title: 'Einstellungen', subtitle: 'App, PDF, Logo und Vorlagen', icon: 'settings-outline', color: '#546e7a', bg: '#eceff1', onPress: () => router.push('/settings') },
  ];

  const navColumns = isWide ? 4 : isTablet ? 2 : 1;
  const actionColumns = actions.length; // eine Zeile, auf dem Handy kompakt

  const banners = (
    <>
      {backupDueDays !== null && (
        <HomeBanner
          testID="home-backup-banner"
          icon="server-outline"
          title={backupRunning ? 'Backup wird erstellt…' : 'Backup empfohlen'}
          text={backupDueDays === 0 ? 'Noch kein Backup erstellt.' : `Letzte Sicherung vor ${backupDueDays} ${backupDueDays === 1 ? 'Tag' : 'Tagen'}.`}
          button="Sichern"
          color="#d97706"
          bg="#fff7e6"
          busy={backupRunning}
          onPress={handleBackupNow}
          onDismiss={() => {
            // Hinweis für 24 Stunden ausblenden
            setBackupDueDays(null);
            AsyncStorage.setItem('aufmassprofi_backup_banner_snooze', String(Date.now() + 24 * 60 * 60 * 1000)).catch(() => {});
          }}
        />
      )}
      {storageFreeable !== null && (
        <HomeBanner
          testID="storage-warning-banner"
          icon="sparkles-outline"
          title="Speicher-Bereinigung"
          text={`${storageFreeable >= 1024 ** 3 ? (storageFreeable / 1024 ** 3).toFixed(2) + ' GB' : Math.round(storageFreeable / 1024 ** 2) + ' MB'} nicht mehr benötigte Daten gefunden.`}
          button="Bereinigen"
          color="#dc2626"
          bg="#fdecec"
          onPress={() => router.push('/storage')}
          onDismiss={() => setStorageFreeable(null)}
        />
      )}
    </>
  );

  const quickActions = (
    <View style={[s.panel, !isTablet && { padding: 12 }]}>
      <View ref={tourRef('cta')} collapsable={false}>
      <TouchableOpacity
        testID="home-new-project-cta"
        activeOpacity={0.85}
        style={s.cta}
        onPress={() => router.push('/projects/new')}
      >
        <View style={s.ctaIcon}><Ionicons name="add" size={30} color="#1565c0" /></View>
        <View style={{ flex: 1 }}>
          <Text style={s.ctaTitle}>Neues Projekt starten</Text>
          <Text style={s.ctaText}>Hier beginnst du dein Aufmaß</Text>
        </View>
        <Ionicons name="arrow-forward" size={24} color="#fff" />
      </TouchableOpacity>
      </View>
      <View style={{ flexGrow: 1, justifyContent: 'center', marginTop: 12 }}>
        <TileGrid tiles={actions} columns={actionColumns} variant="action" compact={!isTablet} />
      </View>
    </View>
  );

  const recentCard = (
    <RecentProjects
      projects={recent}
      covers={covers}
      customerName={p => customers[p.customer_id]?.name || (p as any).bauherr_name}
      onOpen={id => router.push(`/projects/${id}`)}
      onShowAll={() => router.push('/projects')}
    />
  );

  return (
    <ScrollView
      testID="home-screen"
      style={s.screen}
      contentContainerStyle={{ paddingBottom: 40 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
    >
      <HomeHero
        period={period}
        firstName={firstName}
        isPro={isPro}
        companyLogo={companyLogo}
        compact={!isTablet}
        onSearch={() => router.push('/search')}
        onBackup={() => router.push('/backup')}
        onSettings={() => router.push('/settings')}
      />
      <View style={[s.body, isWide && { maxWidth: 1400, alignSelf: 'center', width: '100%' }]}>
        {/* 1. Schnellaktionen ganz oben */}
        <View style={{ marginTop: -40 }}>{quickActions}</View>
        {(backupDueDays !== null || storageFreeable !== null) && (
          <View style={[s.section, isTablet && { flexDirection: 'row' }, { gap: 12 }]}>{banners}</View>
        )}
        {/* 2. Termine */}
        <View style={[s.section, isTablet && { flexDirection: 'row', alignItems: 'stretch' }, { gap: 16 }]}>
          <TodayOverview
            items={todayItems}
            editedToday={editedToday}
            onOpenProject={id => router.push(`/projects/${id}`)}
            onAdd={() => { setEditAppointment(null); setAppointmentModal(true); }}
            onNavigate={openNavigation}
            style={isTablet ? { flex: 1 } : undefined}
          />
          <WeekPreview items={weekItems} onNavigate={openNavigation} onShowAll={() => router.push('/appointments')} style={isTablet ? { flex: 1 } : undefined} />
        </View>
        <AppointmentFormModal
          visible={appointmentModal}
          initial={editAppointment}
          projects={active}
          customers={customers}
          onClose={() => setAppointmentModal(false)}
          onSaved={() => { setAppointmentModal(false); load(); }}
          onCreateProject={a => { setAppointmentModal(false); router.push({ pathname: '/projects/new', params: { from_appointment: a.id, name: a.title, ...(a.customer_id ? { customer_id: a.customer_id } : {}), description: a.note || '', ...(a.address ? { address: a.address } : {}) } }); }}
        />
        {/* 3. Projekt-Zahlen (Smartphone: kompakt in einer Zeile) */}
        <View style={s.section}>
          <StatCards items={stats} columns={5} compact={!isWide} />
        </View>
        <View style={s.section}>{recentCard}</View>
        <View style={s.section}>
          <FolderTiles
            folders={folders}
            counts={folderCounts}
            onOpen={id => router.push(`/projects?folder=${id}`)}
            onManage={() => router.push('/projects')}
          />
        </View>
        <View style={s.section}>
          <TileGrid tiles={navTiles} columns={navColumns} variant="nav" />
        </View>
      </View>
      <HomeTour visible={tour} onClose={() => setTour(false)} />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f5f7fb' },
  body: { paddingHorizontal: 16 },
  section: { marginTop: 16 },
  panel: { backgroundColor: '#fff', borderRadius: 20, padding: 16, ...cardShadow },
  panelHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  panelTitle: { fontSize: 18, fontWeight: '800', color: '#0f172a' },
  cta: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: '#1565c0', borderRadius: 16, paddingVertical: 16, paddingHorizontal: 16, minHeight: 76, shadowColor: '#1565c0', shadowOpacity: 0.35, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 6 },
  ctaIcon: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  ctaTitle: { color: '#fff', fontSize: 19, fontWeight: '900' },
  ctaText: { color: '#dbeafe', fontSize: 13, marginTop: 2 },
});

// Startseite 2.0 – gleiches Design für BASIC und PRO, Kacheln nach vorhandenen Berechtigungen (FeatureFlags)
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, RefreshControl, Alert, useWindowDimensions } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import Ionicons from '@react-native-vector-icons/ionicons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ProjectService, CustomerService, SettingsService, PhotoService, Project, Customer, cleanupOrphanedStorage, migrateSketchPreviews } from '../services/LocalStorage';
import { ProjectFolderService, ProjectFolder } from '../services/ProjectFolders';
import { FolderTiles } from '../src/components/home/FolderTiles';
import { Features, loadProStatus, updateFeatures, getProStatus } from '../services/FeatureFlags';
import { BackupService } from '../services/BackupService';
import { quickFreeableScan } from '../services/StorageCleanup';
import { PROJECT_STATUSES, normalizeStatus } from '../src/constants/projectStatus';
import { useDayPeriod } from '../src/hooks/useDayPeriod';
import { HomeHero } from '../src/components/home/HomeHero';
import { StatCards, StatItem } from '../src/components/home/StatCards';
import { HomeBanner } from '../src/components/home/HomeBanner';
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

  // Schnellaktionen – nur vorhandene Funktionen; Import nur wenn im Tarif freigeschaltet
  const actions: HomeTile[] = [
    { key: 'new-project', title: 'Neues Projekt', icon: 'add', color: '#fff', bg: '#1565c0', onPress: () => router.push('/projects/new') },
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
    { key: 'settings', title: 'Einstellungen', subtitle: 'App, PDF, Logo und Vorlagen', icon: 'settings-outline', color: '#546e7a', bg: '#eceff1', onPress: () => router.push('/settings') },
  ];

  const statColumns = isWide ? 5 : 4;
  const navColumns = isWide ? 4 : isTablet ? 2 : 1;
  const actionColumns = isTablet || actions.length <= 3 ? actions.length : 2;

  const banners = (
    <>
      {backupDueDays !== null && (
        <HomeBanner
          testID="home-backup-banner"
          icon="server-outline"
          title={backupRunning ? 'Backup wird erstellt…' : 'Backup empfohlen'}
          text={backupDueDays === 0 ? 'Du hast noch nie ein Datei-Backup erstellt.' : `Letzte Sicherung vor ${backupDueDays} ${backupDueDays === 1 ? 'Tag' : 'Tagen'}.`}
          button="Jetzt sichern"
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
    <View style={[s.panel, isWide && { flex: 1.4 }]}>
      <View style={s.panelHeader}>
        <Ionicons name="flash" size={22} color="#f59e0b" />
        <Text style={s.panelTitle}>Schnellaktionen</Text>
      </View>
      <View style={{ flexGrow: 1, justifyContent: 'center' }}>
        <TileGrid tiles={actions} columns={actionColumns} variant="action" />
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
        <View style={{ marginTop: -40, gap: 12 }}>
          {isWide ? (
            <StatCards items={stats} columns={statColumns} />
          ) : (
            <>
              {/* Smartphone/kleines Tablet: Gesamtzahl über volle Breite, Status darunter */}
              <StatCards items={stats.slice(0, 1)} columns={1} />
              <StatCards items={stats.slice(1)} columns={isTablet ? 4 : 2} />
            </>
          )}
        </View>
        {(backupDueDays !== null || storageFreeable !== null) && (
          <View style={[s.section, isTablet && { flexDirection: 'row' }, { gap: 12 }]}>{banners}</View>
        )}
        <View style={[s.section, isWide && { flexDirection: 'row', alignItems: 'stretch' }, { gap: 16 }]}>
          {quickActions}
          {recentCard}
        </View>
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
});

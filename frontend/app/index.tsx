import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Alert,
  RefreshControl,
  Image,
  TextInput,
  ScrollView,
  Platform,
  useWindowDimensions,
} from 'react-native';

import { useRouter } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ProjectService, CustomerService, ChecklistService, PhotoService, SketchService, ReportService, MachineMasterService, MachineMaster, MaterialMasterService, MaterialMaster, Project, Customer, SettingsService, getNextAvailableProjectNumber, cleanupOrphanedStorage, migrateSketchPreviews } from '../services/LocalStorage';
import * as DocumentPicker from 'expo-document-picker';
import { exportProjectsToFile, importProjectsFromFile, askExportPhotoChoice, askDuplicateAction } from '../utils/projectTransfer';
import * as Sharing from 'expo-sharing';
import { Features, AppName, getProStatus, loadProStatus, updateFeatures } from '../services/FeatureFlags';
import { BackupService } from '../services/BackupService';
import { quickFreeableScan } from '../services/StorageCleanup';
import { addArchiveEntries } from '../services/ArchiveLog';
import { useTranslation } from 'react-i18next';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { PROJECT_STATUSES, getStatusMeta, getStatusOrder, normalizeStatus } from '../src/constants/projectStatus';

// Status-Optionen (Pipeline: Anfrage → Angebot → Ausführung → Fertig, + Abgebrochen/Archiv)
const STATUS_OPTIONS = [
  { key: 'all', labelKey: 'home.allProjects', icon: 'folder-outline' } as any,
  ...PROJECT_STATUSES.map(s => ({ key: s.key, label: s.label, icon: s.icon, color: s.color })),
];

export default function HomeScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  // iPhone hat typisch < 500px Breite (kürzere Seite), iPad >= 768px
  const isPhoneDevice = Math.min(screenWidth, screenHeight) < 500;
  const isLandscape = screenWidth > screenHeight;
  const isPhoneLandscape = isPhoneDevice && isLandscape;
  
  const [projects, setProjects] = useState<Project[]>([]);
  const [customers, setCustomers] = useState<{ [key: string]: Customer }>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [activeFilter, setActiveFilter] = useState('all');
  const [sortBy, setSortBy] = useState<'edited_desc' | 'date_desc' | 'date_asc' | 'name_asc' | 'name_desc' | 'status'>('date_desc');
  // Letzte Bearbeitung je Projekt (inkl. Fotos/Skizzen/Checklisten/Berichte)
  const [lastActivity, setLastActivity] = useState<Record<string, string>>({});
  const [customerSearchQuery, setCustomerSearchQuery] = useState('');
  
  // Letzten Filter aus AsyncStorage laden
  useEffect(() => {
    AsyncStorage.getItem('lastActiveFilter').then(saved => {
      if (saved && ['all', ...PROJECT_STATUSES.map(s => s.key)].includes(saved)) {
        setActiveFilter(saved);
      }
    }).catch(() => {});
    // Gespeicherte Sortierung wiederherstellen
    AsyncStorage.getItem('aufmassprofi_sort_by').then(saved => {
      if (saved && ['edited_desc', 'date_desc', 'date_asc', 'name_asc', 'name_desc', 'status'].includes(saved)) {
        setSortBy(saved as typeof sortBy);
      }
    }).catch(() => {});
    // Verwaiste Bild-Blobs gelöschter Projekte entfernen (gibt Speicher frei,
    // sonst SQLITE_FULL obwohl alle Projekte gelöscht wurden)
    // Papierkorb leeren (>30 Tage), dann große Skizzen-Vorschauen auslagern,
    // danach verwaiste Speicher-Blobs aufräumen
    ProjectService.purgeExpiredTrash()
      .catch(() => {})
      .then(() => migrateSketchPreviews().catch(() => {}))
      .then(() => cleanupOrphanedStorage().catch(() => {}))
      // Speicher-Warnung: verbleibende verwaiste Daten (z.B. Snapshot-Reste,
      // Checklisten-/Dokument-Bilder) + temporäre Dateien messen
      .then(() => quickFreeableScan().catch(() => 0))
      .then((bytes) => {
        if (bytes && bytes > 20 * 1024 * 1024) setStorageFreeable(bytes);
      });
  }, []);

  // Filter-Änderung speichern
  const handleFilterChange = useCallback((key: string) => {
    setActiveFilter(key);
    AsyncStorage.setItem('lastActiveFilter', key).catch(() => {});
  }, []);
  // Multi-Select Mode
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedProjects, setSelectedProjects] = useState<Set<string>>(new Set());
  const [isProcessing, setIsProcessing] = useState(false);
  // Fortschrittsanzeige für Projekt-Import (Balken + Zähler statt Ladekreis)
  const [importProgress, setImportProgress] = useState<{ title: string; label: string; fraction: number | null } | null>(null);
  // Pro-Banner: Ausgeliehene Maschinen, Inspektionen, TÜV & niedriger Lagerbestand
  const [loanedMachines, setLoanedMachines] = useState<MachineMaster[]>([]);
  const [inspectionMachines, setInspectionMachines] = useState<MachineMaster[]>([]);
  const [tuvMachines, setTuvMachines] = useState<MachineMaster[]>([]);
  const [lowStockMaterials, setLowStockMaterials] = useState<MaterialMaster[]>([]);
  const [expandedBanner, setExpandedBanner] = useState<'loaned' | 'inspection' | 'tuv' | 'lowstock' | null>(null);
  // Backup-Erinnerungs-Banner
  const [backupDueDays, setBackupDueDays] = useState<number | null>(null);
  // Speicher-Warnung: freigebbare Bytes (verwaiste Daten + temporäre Dateien)
  const [storageFreeable, setStorageFreeable] = useState<number | null>(null);
  // Archiv-Erinnerung: alte abgeschlossene Projekte zum Archivieren vorschlagen
  const [archiveSuggest, setArchiveSuggest] = useState<{ count: number; ids: string[] } | null>(null);
  const [isProUser, setIsProUser] = useState<boolean>(getProStatus());

  const loadData = async () => {
    try {
      const [projectsData, customersData] = await Promise.all([
        ProjectService.getAll(),
        CustomerService.getAll(),
      ]);

      setProjects(projectsData);
      computeArchiveSuggestion(projectsData);

      // Letzte Bearbeitung je Projekt ermitteln (für Sortierung "Zuletzt bearbeitet"):
      // Projekt-updated_at allein reicht nicht, da neue Fotos/Skizzen es nicht ändern
      try {
        const [allChecklists, allPhotos, allSketches, allReports] = await Promise.all([
          ChecklistService.getAll(),
          PhotoService.getAll(),
          SketchService.getAll(),
          ReportService.getAll(),
        ]);
        const activity: Record<string, string> = {};
        const touch = (pid?: string, ts?: string) => {
          if (pid && ts && (!activity[pid] || ts > activity[pid])) activity[pid] = ts;
        };
        projectsData.forEach((p: Project) => touch(p.id, p.updated_at));
        allChecklists.forEach((c: any) => touch(c.project_id, c.updated_at));
        allPhotos.forEach((p: any) => touch(p.project_id, p.updated_at));
        allSketches.forEach((s: any) => touch(s.project_id, s.updated_at));
        allReports.forEach((r: any) => touch(r.project_id, r.updated_at));
        setLastActivity(activity);
      } catch (e) {
        console.error('Error computing last activity:', e);
      }
      
      const customerMap: { [key: string]: Customer } = {};
      customersData.forEach((customer: Customer) => {
        customerMap[customer.id] = customer;
      });
      setCustomers(customerMap);

      // Ausgeliehene & Inspektion-fällige Maschinen laden (nur Pro)
      const proStatus = await loadProStatus();
      updateFeatures();
      setIsProUser(proStatus);
      if (proStatus) {
        try {
          const [allMachines, settings] = await Promise.all([
            MachineMasterService.getAll(),
            SettingsService.get().catch(() => ({} as any)),
          ]);
          const warnDaysInspection = (settings as any).reminder_days_inspection ?? 30;
          const warnDaysTuv = (settings as any).reminder_days_tuv ?? 30;
          setLoanedMachines(allMachines.filter(m => m.status === 'ausgeliehen'));
          // Inspektion fällig: nächste_inspektion innerhalb der konfigurierten Tage oder überfällig
          const now = Date.now();
          const warnMsInsp = warnDaysInspection * 24 * 60 * 60 * 1000;
          const warnMsTuv = warnDaysTuv * 24 * 60 * 60 * 1000;
          const inspect = allMachines.filter(m => {
            if (!m.next_inspection_date) return false;
            const due = new Date(m.next_inspection_date).getTime();
            return !isNaN(due) && (due - now) <= warnMsInsp;
          }).sort((a, b) => {
            const da = new Date(a.next_inspection_date!).getTime();
            const db = new Date(b.next_inspection_date!).getTime();
            return da - db;
          });
          setInspectionMachines(inspect);
          // TÜV fällig: nächster TÜV innerhalb der konfigurierten Tage oder überfällig
          const tuv = allMachines.filter(m => {
            if (!m.next_tuv_date) return false;
            const due = new Date(m.next_tuv_date).getTime();
            return !isNaN(due) && (due - now) <= warnMsTuv;
          }).sort((a, b) => {
            const da = new Date(a.next_tuv_date!).getTime();
            const db = new Date(b.next_tuv_date!).getTime();
            return da - db;
          });
          setTuvMachines(tuv);
          // Lager-Warnung: Materialien deren Bestand <= low_stock_threshold ist
          try {
            const allMaterials = await MaterialMasterService.getAll();
            const lowStock = allMaterials.filter(m => {
              if (m.stock_quantity == null) return false;
              const threshold = m.low_stock_threshold ?? 5;
              return m.stock_quantity <= threshold;
            }).sort((a, b) => (a.stock_quantity || 0) - (b.stock_quantity || 0));
            setLowStockMaterials(lowStock);
          } catch { /* silent */ }
        } catch { /* silent */ }
      }
    } catch (error) {
      console.error('Error loading data:', error);
      Alert.alert(t('common.error'), t('home.dataLoadError'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadData();
      // Backup-Erinnerung prüfen
      (async () => {
        try {
          const raw = await AsyncStorage.getItem('aufmassprofi_backup_reminder_days');
          const days = raw != null ? parseInt(raw, 10) : 7;
          if (!days || days <= 0) { setBackupDueDays(null); return; }
          const status = await BackupService.isBackupDue(days);
          if (status.due) {
            setBackupDueDays(status.daysSince || 0);
          } else {
            setBackupDueDays(null);
          }
        } catch {
          setBackupDueDays(null);
        }
      })();
    }, [])
  );

  const [backupRunning, setBackupRunning] = useState(false);
  const handleBackupNow = async () => {
    if (backupRunning) return;
    setBackupRunning(true);
    try {
      const res = await BackupService.exportFullBackup();
      setBackupDueDays(null);
      const mb = res.sizeBytes / (1024 * 1024);
      Alert.alert('Backup erstellt ✓', `Die Sicherung (${mb >= 1 ? mb.toFixed(1) + ' MB' : Math.max(1, Math.round(res.sizeBytes / 1024)) + ' KB'}) wurde erstellt.`);
    } catch (e: any) {
      console.warn('[Backup] Home banner backup failed:', e);
      Alert.alert('Backup fehlgeschlagen', 'Bitte versuchen Sie es erneut.' + (e?.message ? `\n(${e.message})` : ''));
    } finally {
      setBackupRunning(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  // === MULTI-SELECT FUNCTIONS ===
  
  // Toggle selection mode
  const toggleSelectionMode = () => {
    if (selectionMode) {
      // Exit selection mode
      setSelectionMode(false);
      setSelectedProjects(new Set());
    } else {
      // Enter selection mode
      setSelectionMode(true);
    }
  };
  
  // Toggle project selection
  const toggleProjectSelection = (projectId: string) => {
    setSelectedProjects(prev => {
      const newSet = new Set(prev);
      if (newSet.has(projectId)) {
        newSet.delete(projectId);
      } else {
        newSet.add(projectId);
      }
      return newSet;
    });
  };
  
  // Select all visible projects
  const selectAllProjects = () => {
    const allIds = new Set(filteredProjects.map(p => p.id));
    setSelectedProjects(allIds);
  };
  
  // Deselect all
  const deselectAllProjects = () => {
    setSelectedProjects(new Set());
  };
  
  // Schnell-Export direkt von der Projektkarte (ohne das Projekt zu öffnen)
  const quickExportProject = async (projectId: string) => {
    try {
      // Abfrage: Fotos mit exportieren oder weglassen (kleinere Datei)?
      const includePhotos = await askExportPhotoChoice();
      if (includePhotos === null) return;

      setIsProcessing(true);
      const { uri } = await exportProjectsToFile([projectId], { includePhotos });
      setIsProcessing(false);

      // Web: Datei wurde bereits als Browser-Download ausgeliefert
      if (Platform.OS !== 'web') {
        await Sharing.shareAsync(uri, {
          mimeType: 'application/json',
          dialogTitle: t('projects.saveProject2', 'Projekt exportieren'),
        });
      }
    } catch (error) {
      console.error('Quick export error:', error);
      setIsProcessing(false);
      Alert.alert(t('common.error'), t('home.exportFailed'));
    }
  };

  // Export selected projects
  // Speicherschonender Streaming-Export (verhindert OOM bei großen Projekten)
  const exportSelectedProjects = async () => {
    if (selectedProjects.size === 0) {
      Alert.alert(t('common.note'), t('home.selectAtLeastOne'));
      return;
    }
    
    // Abfrage: Fotos mit exportieren oder weglassen (kleinere Datei)?
    const includePhotos = await askExportPhotoChoice();
    if (includePhotos === null) return;

    setIsProcessing(true);
    try {
      const { uri } = await exportProjectsToFile([...selectedProjects], { includePhotos });
      
      setIsProcessing(false);
      
      // Web: Datei wurde bereits als Browser-Download ausgeliefert
      if (Platform.OS !== 'web') {
        await Sharing.shareAsync(uri, {
          mimeType: 'application/json',
          dialogTitle: `${selectedProjects.size} Projekte exportieren`,
        });
      }
      
      // Exit selection mode after successful export
      setSelectionMode(false);
      setSelectedProjects(new Set());
      
    } catch (error) {
      console.error('Export error:', error);
      setIsProcessing(false);
      Alert.alert(t('common.error'), t('home.exportFailed'));
    }
  };
  
  // Alte abgeschlossene Projekte (>60 Tage unverändert) zum Archivieren vorschlagen.
  // Hinweis ist 14 Tage stummschaltbar (X-Button).
  const computeArchiveSuggestion = async (list: any[]) => {
    try {
      const snooze = await AsyncStorage.getItem('aufmassprofi_archive_hint_snooze');
      if (snooze && Date.now() - new Date(snooze).getTime() < 14 * 24 * 60 * 60 * 1000) {
        setArchiveSuggest(null);
        return;
      }
      const AGE = 60 * 24 * 60 * 60 * 1000;
      const doneStatuses = ['fertig', 'archiviert', 'abgebrochen'];
      const old = list.filter((p: any) => !p.deleted_at
        && doneStatuses.includes(normalizeStatus(p.status))
        && Date.now() - new Date(p.updated_at || p.created_at).getTime() > AGE);
      setArchiveSuggest(old.length > 0 ? { count: old.length, ids: old.map((p: any) => p.id) } : null);
    } catch {
      setArchiveSuggest(null);
    }
  };

  const snoozeArchiveSuggestion = async () => {
    setArchiveSuggest(null);
    await AsyncStorage.setItem('aufmassprofi_archive_hint_snooze', new Date().toISOString()).catch(() => {});
  };

  // Mehrere Projekte in EINEM Schritt archivieren: eine gemeinsame Archiv-Datei
  // exportieren (immer mit Fotos), extern sichern, dann endgültig entfernen
  const archiveSelectedProjects = async () => {
    if (selectedProjects.size === 0) {
      Alert.alert(t('common.note'), t('home.selectAtLeastOne'));
      return;
    }
    const ids = [...selectedProjects];
    const selected = projects.filter(p => ids.includes(p.id));

    const doDelete = async (fileName: string) => {
      setIsProcessing(true);
      try {
        await addArchiveEntries(selected.map(p => ({ name: p.name, project_number: (p as any).project_number, fileName })));
        for (const pid of ids) {
          await ProjectService.delete(pid);
        }
        await loadData();
        setSelectionMode(false);
        setSelectedProjects(new Set());
        const msg = `${ids.length} Projekte archiviert und aus der App entfernt.\n\nÜbersicht: Einstellungen → Archiv-Übersicht. Wiederherstellen jederzeit über „Importieren".`;
        if (Platform.OS === 'web') alert(msg);
        else Alert.alert('✅ Archiviert', msg);
      } catch (error) {
        console.error('Archive delete error:', error);
        Alert.alert(t('common.error'), 'Entfernen fehlgeschlagen.');
      } finally {
        setIsProcessing(false);
      }
    };

    const confirmDelete = (fileName: string) => {
      const text = `Wenn die Archiv-Datei „${fileName}" in iCloud Drive / Google Drive gespeichert ist, werden die ${ids.length} Projekte jetzt ENDGÜLTIG aus der App entfernt (inkl. aller Fotos, Skizzen und Dokumente).`;
      if (Platform.OS === 'web') {
        // eslint-disable-next-line no-alert
        if (window.confirm(`Datei sicher gespeichert?\n\n${text}`)) doDelete(fileName);
      } else {
        Alert.alert('Datei sicher gespeichert?', text, [
          { text: 'Projekte behalten', style: 'cancel' },
          { text: 'Ja, jetzt entfernen', style: 'destructive', onPress: () => doDelete(fileName) },
        ]);
      }
    };

    const start = async () => {
      setIsProcessing(true);
      try {
        // Archiv IMMER komplett (mit Fotos) – nur so ist die Wiederherstellung vollständig
        const { uri, fileName } = await exportProjectsToFile(ids, { includePhotos: true });
        setIsProcessing(false);
        if (Platform.OS !== 'web') {
          await Sharing.shareAsync(uri, {
            mimeType: 'application/json',
            dialogTitle: `${ids.length} Projekte archivieren (iCloud Drive / Google Drive)`,
          });
        }
        confirmDelete(fileName);
      } catch (error) {
        console.error('Archive export error:', error);
        setIsProcessing(false);
        Alert.alert(t('common.error'), 'Archivieren fehlgeschlagen – es wurde NICHTS entfernt.');
      }
    };

    const intro = `1. Die ${ids.length} ausgewählten Projekte werden zusammen in EINE Datei exportiert (inkl. Fotos, Skizzen, Dokumente)\n2. Datei extern speichern (iCloud Drive / Google Drive)\n3. Danach werden die Projekte endgültig aus der App entfernt und geben Speicher frei`;
    if (Platform.OS === 'web') {
      // eslint-disable-next-line no-alert
      if (window.confirm(`${ids.length} Projekte archivieren?\n\n${intro}`)) start();
    } else {
      Alert.alert('Projekte archivieren', intro, [
        { text: t('common.cancel'), style: 'cancel' },
        { text: 'Archivieren starten', onPress: start },
      ]);
    }
  };

  // Delete selected projects
  const deleteSelectedProjects = async () => {
    if (selectedProjects.size === 0) {
      Alert.alert(t('common.note'), t('home.selectAtLeastOne'));
      return;
    }
    
    Alert.alert(
      t('home.deleteMultiple', { count: selectedProjects.size }),
      t('home.deleteMultipleConfirm', { count: selectedProjects.size }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: async () => {
            setIsProcessing(true);
            try {
              for (const projectId of selectedProjects) {
                await ProjectService.moveToTrash(projectId);
              }
              await loadData();
              setSelectionMode(false);
              setSelectedProjects(new Set());
              Alert.alert(
                t('common.success'),
                `${t('home.deletedCount', { count: selectedProjects.size })}\n\nTipp: 30 Tage wiederherstellbar unter Einstellungen → Papierkorb.`
              );
            } catch (error) {
              console.error('Delete error:', error);
              Alert.alert(t('common.error'), t('home.deleteFailed'));
            } finally {
              setIsProcessing(false);
            }
          },
        },
      ]
    );
  };
  
  // Move selected projects to status
  const moveSelectedToStatus = async (newStatus: string) => {
    if (selectedProjects.size === 0) {
      Alert.alert(t('common.note'), t('home.selectAtLeastOne'));
      return;
    }
    
    const statusLabel = getStatusMeta(newStatus).label;
    
    Alert.alert(
      t('home.statusChanged'),
      t('home.statusChangedMessage', { count: selectedProjects.size, status: statusLabel }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.ok'),
          onPress: async () => {
            setIsProcessing(true);
            try {
              for (const projectId of selectedProjects) {
                const project = projects.find(p => p.id === projectId);
                if (project) {
                  await ProjectService.update(projectId, { status: newStatus });
                }
              }
              await loadData();
              setSelectionMode(false);
              setSelectedProjects(new Set());
              Alert.alert(t('common.success'), t('home.movedCount', { count: selectedProjects.size }));
            } catch (error) {
              console.error('Status change error:', error);
              Alert.alert(t('common.error'), t('home.moveFailed'));
            } finally {
              setIsProcessing(false);
            }
          },
        },
      ]
    );
  };

  // Import project from .aufmass file
  // Streaming-Import: Datei wird zeilenweise verarbeitet (kein JSON.parse der
  // ganzen Datei mehr → verhindert Hermes-OOM-Crash bei großen Projekten).
  const importProjectFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/json', '*/*'],
        // Android: content://-URI behalten (projectTransfer kopiert selbst in den Cache);
        // das Picker-eigene Kopieren schlaegt in Expo Go an den Berechtigungen fehl
        copyToCacheDirectory: Platform.OS === "ios",
      });
      
      if (result.canceled || !result.assets || result.assets.length === 0) {
        return;
      }
      
      const file = result.assets[0];
      
      // Accept .aufmass, .json and .txt files
      const fileName = file.name?.toLowerCase() || '';
      if (!fileName.endsWith('.aufmass') && !fileName.endsWith('.json') && !fileName.endsWith('.txt')) {
        Alert.alert(t('common.error'), t('home.importFileError'));
        return;
      }
      
      setImportProgress({ title: file.name || '', label: 'Datei wird gelesen…', fraction: null });

      const summary = await importProjectsFromFile(file.uri, {
        onProgress: (p) => setImportProgress({
          title: p.projectCount && p.projectCount > 1
            ? `Projekt ${p.projectIndex} von ${p.projectCount}: ${p.projectName}`
            : p.projectName,
          label: p.label,
          fraction: p.fraction,
        }),
        onDuplicate: askDuplicateAction,
      });
      setImportProgress(null);

      await loadData();
      const created = summary.importedProjects;
      const updated = summary.updatedProjects;
      const allNew = [...created, ...updated];
      const firstName = allNew[0]?.name || '';
      if (summary.failedItems > 0) {
        Alert.alert(
          'Teilweise importiert',
          `${allNew.length > 1 ? `${allNew.length} Projekte wurden` : `Projekt "${firstName}" wurde`} importiert, aber ${summary.failedItems} von ${summary.totalItems} Elementen (z.B. Fotos/Skizzen) konnten nicht übernommen werden.\n\nMöglicher Grund: Speicher-Limit. Bitte die installierte App (ab Version 1.1.14) verwenden – in Expo Go ist der Speicher auf 6 MB begrenzt.`
        );
      } else if (allNew.length === 0 && summary.skippedProjects.length > 0) {
        Alert.alert(t('common.note'), 'Import übersprungen – das Projekt ist bereits auf diesem Gerät vorhanden.');
      } else {
        const parts: string[] = [];
        if (created.length > 0) {
          parts.push(created.length === 1
            ? t('home.importSuccess', { name: created[0].name })
            : `${created.length} Projekte wurden erfolgreich importiert.`);
        }
        if (updated.length > 0) {
          parts.push(updated.length === 1
            ? `Projekt "${updated[0].name}" wurde aktualisiert.`
            : `${updated.length} Projekte wurden aktualisiert.`);
        }
        if (summary.skippedProjects.length > 0) {
          parts.push(`${summary.skippedProjects.length} Projekt(e) übersprungen.`);
        }
        Alert.alert(t('common.success'), parts.join('\n'));
      }

      // Navigate to the imported project (nur bei genau einem Projekt)
      if (allNew.length === 1) {
        router.push(`/projects/${allNew[0].id}`);
      }

    } catch (error) {
      console.error('Error importing project:', error);
      const msg = String((error as Error)?.message || '');
      if (msg.includes('IMPORT_INCOMPLETE')) {
        Alert.alert(t('common.error'), t('home.importIncomplete'));
      } else if (msg.includes('IMPORT_INVALID')) {
        Alert.alert(t('common.error'), t('home.importInvalid'));
      } else if (msg.includes('SQLITE_FULL') || msg.includes('disk is full')) {
        Alert.alert(
          t('common.error'),
          'Import fehlgeschlagen: Der App-Speicher ist voll (Android-Limit von 6 MB in Expo Go / älteren Builds).\n\nBitte den neuesten installierten Build (ab Version 1.1.14) verwenden – dort ist das Limit auf 512 MB erhöht.'
        );
      } else {
        Alert.alert(t('common.error'), t('home.importFailed'));
      }
    } finally {
      setImportProgress(null);
    }
  };

  const deleteProject = async (projectId: string) => {
    Alert.alert(
      t('home.deleteProject'),
      t('home.deleteProjectConfirm', { name: '' }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              await ProjectService.moveToTrash(projectId);
              loadData();
            } catch (error) {
              console.error('Error deleting project:', error);
              Alert.alert(t('common.error'), t('home.deleteError'));
            }
          },
        },
      ]
    );
  };

  // Status ändern
  const changeProjectStatus = async (projectId: string, currentStatus: string) => {
    const buttons = PROJECT_STATUSES.map(statusMeta => ({
      text: `${statusMeta.label}${normalizeStatus(currentStatus) === statusMeta.key ? ' ✓' : ''}`,
      onPress: async () => {
        try {
          const project = projects.find(p => p.id === projectId);
          if (project) {
            await ProjectService.update(projectId, { ...project, status: statusMeta.key });
            loadData();
          }
        } catch (error) {
          console.error('Error updating status:', error);
          Alert.alert(t('common.error'), t('home.statusChangeError'));
        }
      },
      style: normalizeStatus(currentStatus) === statusMeta.key ? 'cancel' : 'default' as const,
    }));
    buttons.push({ text: t('common.cancel'), onPress: () => {}, style: 'cancel' as const });
    
    Alert.alert(
      t('home.statusChanged', 'Status ändern'), 
      t('home.statusChangedMessage', { count: selectedProjects.length, status: '' }) || 'Wählen Sie den neuen Status:', 
      buttons
    );
  };

  // Sortierung ändern (Auswahl wird dauerhaft gespeichert)
  const changeSortOrder = () => {
    const sortOptions = [
      { key: 'edited_desc', label: t('home.sortLastEdited', 'Zuletzt bearbeitet zuerst') },
      { key: 'date_desc', label: t('home.sortNewest') },
      { key: 'date_asc', label: t('home.sortOldest') },
      { key: 'name_asc', label: t('home.sortNameAZ') },
      { key: 'name_desc', label: t('home.sortNameZA') },
      { key: 'status', label: t('home.sortByStatus') },
    ];
    
    const buttons = sortOptions.map(option => ({
      text: option.label + (sortBy === option.key ? ' ✓' : ''),
      onPress: () => {
        setSortBy(option.key as typeof sortBy);
        AsyncStorage.setItem('aufmassprofi_sort_by', option.key).catch(() => {});
      },
      style: sortBy === option.key ? 'cancel' : 'default' as const,
    }));
    buttons.push({ text: t('common.cancel'), onPress: () => {}, style: 'cancel' as const });
    
    Alert.alert(t('common.sortBy'), t('common.selectSort'), buttons);
  };

  // Sortier-Label
  const getSortLabel = () => {
    switch (sortBy) {
      case 'edited_desc': return t('home.lastEditedLabel', 'Bearbeitet');
      case 'date_desc': return t('home.newestLabel');
      case 'date_asc': return t('home.oldestLabel');
      case 'name_asc': return 'A-Z';
      case 'name_desc': return 'Z-A';
      case 'status': return 'Status';
      default: return t('home.sortLabel');
    }
  };

  // Gefilterte und sortierte Projekte
  const filteredProjects = projects.filter(project => {
    // Status-Filter (Pipeline-Keys, alte Werte werden gemappt)
    const projectStatus = normalizeStatus(project.status);
    if (activeFilter === 'all') {
      // Archivierte Projekte in "Alle" ausblenden
      if (projectStatus === 'archiviert') return false;
    } else if (projectStatus !== activeFilter) {
      return false;
    }
    
    // Suchfilter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      const customer = customers[project.customer_id];
      const customerName = customer?.name?.toLowerCase() || '';
      const projectName = project.name?.toLowerCase() || '';
      const description = project.description?.toLowerCase() || '';
      
      return projectName.includes(query) || 
             customerName.includes(query) || 
             description.includes(query);
    }
    
    return true;
  }).sort((a, b) => {
    switch (sortBy) {
      case 'edited_desc': {
        // Zuletzt bearbeitet zuerst (inkl. Fotos/Skizzen/Checklisten/Berichte)
        const aTs = lastActivity[a.id] || a.updated_at || a.created_at || '';
        const bTs = lastActivity[b.id] || b.updated_at || b.created_at || '';
        return bTs.localeCompare(aTs);
      }
      case 'date_desc':
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      case 'date_asc':
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      case 'name_asc':
        return a.name.localeCompare(b.name, 'de');
      case 'name_desc':
        return b.name.localeCompare(a.name, 'de');
      case 'status':
        return getStatusOrder(a.status) - getStatusOrder(b.status);
      default:
        return 0;
    }
  });

  // Gefilterte Kundenliste für Schnellauswahl
  const filteredCustomerList = Object.values(customers).filter(customer => {
    if (!customerSearchQuery.trim()) return true;
    const query = customerSearchQuery.toLowerCase();
    return customer.name?.toLowerCase().includes(query) ||
           customer.phone?.includes(query) ||
           customer.email?.toLowerCase().includes(query);
  });

  // Projekt duplizieren (inkl. Checklisten - Häkchen/Notizen/Fotos zurückgesetzt)
  const duplicateProject = async (source: Project) => {
    try {
      const { id: _id, created_at: _c, updated_at: _u, ...rest } = source as any;
      const newNumber = await getNextAvailableProjectNumber();
      const newProject = await ProjectService.create({
        ...rest,
        project_number: newNumber,
        name: `${source.name} (Kopie)`,
        status: 'anfrage',
      });

      const checklists = await ChecklistService.getByProjectId(source.id);
      const resetItems = (items: any[]): any[] =>
        (items || []).map((it) => ({
          ...it,
          checked: false,
          note: '',
          printImage: undefined,
          previewImages: undefined,
          subItems: it.subItems ? resetItems(it.subItems) : undefined,
        }));
      for (const cl of checklists) {
        await ChecklistService.create({
          project_id: newProject.id,
          template_id: cl.template_id,
          template_name: cl.template_name,
          templateLogo: cl.templateLogo,
          items: resetItems(cl.items),
        } as any);
      }
      await loadData();
      const msg = `"${newProject.name}" wurde angelegt (Nr. ${newNumber}${checklists.length > 0 ? `, ${checklists.length} Checkliste${checklists.length > 1 ? 'n' : ''} kopiert` : ''}).`;
      if (Platform.OS === 'web') {
        window.alert(msg);
      } else {
        Alert.alert('Projekt dupliziert', msg);
      }
    } catch (e) {
      console.error('Error duplicating project:', e);
      Alert.alert(t('common.error'), 'Projekt konnte nicht dupliziert werden.');
    }
  };

  const confirmDuplicateProject = (project: Project) => {
    const message = `"${project.name}" wird samt Checklisten kopiert (Häkchen, Notizen und Fotos werden zurückgesetzt).`;
    if (Platform.OS === 'web') {
      if (window.confirm(`Projekt duplizieren?\n${message}`)) duplicateProject(project);
      return;
    }
    Alert.alert('Projekt duplizieren?', message, [
      { text: t('common.cancel'), style: 'cancel' },
      { text: 'Duplizieren', onPress: () => duplicateProject(project) },
    ]);
  };

  // Status-Farbe ermitteln
  const getStatusColor = (status: string) => getStatusMeta(status).color;

  const renderProject = ({ item }: { item: Project }) => {
    const customer = customers[item.customer_id];
    const statusColor = getStatusColor(item.status);
    // Kundenname: erst aus Customer, dann aus bauherr_name des Projekts
    const displayCustomerName = customer?.name || (item as any).bauherr_name;
    const customerNumber = customer?.customer_number;
    const isSelected = selectedProjects.has(item.id);
    
    return (
      <TouchableOpacity
        testID={`project-card-${item.id}`}
        style={[styles.projectCard, isSelected && styles.projectCardSelected]}
        onPress={() => {
          if (selectionMode) {
            toggleProjectSelection(item.id);
          } else {
            router.push(`/projects/${item.id}`);
          }
        }}
        onLongPress={() => {
          if (!selectionMode) {
            setSelectionMode(true);
            toggleProjectSelection(item.id);
          }
        }}
      >
        <View style={styles.projectHeader}>
          {selectionMode ? (
            <TouchableOpacity
              style={styles.checkboxContainer}
              onPress={() => toggleProjectSelection(item.id)}
            >
              <Ionicons 
                name={isSelected ? "checkbox" : "square-outline"} 
                size={26} 
                color={isSelected ? "#1976d2" : "#999"} 
              />
            </TouchableOpacity>
          ) : (
            <Ionicons name="folder" size={24} color={statusColor} />
          )}
          <View style={styles.projectInfo}>
            <View style={styles.projectNameRow}>
              {item.project_number && (
                <Text style={styles.projectNumber}>{item.project_number}</Text>
              )}
              <Text style={styles.projectName}>{item.name}</Text>
            </View>
            {displayCustomerName && (
              <View style={styles.customerNameRow}>
                {customerNumber && (
                  <Text style={styles.customerNumberSmall}>{customerNumber}</Text>
                )}
                <Text style={styles.customerName}>{displayCustomerName}</Text>
              </View>
            )}
          </View>
          {!selectionMode && (
            <TouchableOpacity
              onPress={() => deleteProject(item.id)}
              style={styles.deleteButton}
            >
              <Ionicons name="trash-outline" size={20} color="#f44336" />
            </TouchableOpacity>
          )}
        </View>
        {item.description && (
          <Text style={styles.projectDescription}>{item.description}</Text>
        )}
        <View style={styles.projectFooter}>
          <TouchableOpacity 
            style={[styles.statusBadge, { backgroundColor: statusColor + '20', borderColor: statusColor }]}
            onPress={() => !selectionMode && changeProjectStatus(item.id, item.status)}
            disabled={selectionMode}
          >
            <Text style={[styles.statusText, { color: statusColor }]}>{getStatusMeta(item.status).label}</Text>
            {!selectionMode && <Ionicons name="chevron-down" size={14} color={statusColor} />}
          </TouchableOpacity>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            {!selectionMode && Features.showProjektExport && (
              <TouchableOpacity
                onPress={() => quickExportProject(item.id)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                testID={`quick-export-${item.id}`}
              >
                <Ionicons name="cloud-upload-outline" size={18} color="#94a3b8" />
              </TouchableOpacity>
            )}
            {!selectionMode && (
              <TouchableOpacity
                onPress={() => confirmDuplicateProject(item)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                testID={`duplicate-project-${item.id}`}
              >
                <Ionicons name="copy-outline" size={18} color="#94a3b8" />
              </TouchableOpacity>
            )}
            <Text style={styles.projectDate}>
              {new Date(lastActivity[item.id] || item.updated_at || item.created_at).toLocaleDateString('de-DE')}
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#1976d2" />
      </View>
    );
  }

  // Header-Inhalte als ListHeaderComponent für scrollbare Gesamtseite
  // Suchleiste aktiv = Logo und Buttons ausblenden für mehr Platz
  const isSearchActive = isSearchFocused || searchQuery.length > 0;

  const renderListHeader = () => (
    <>
      {/* Company Logo - nur anzeigen wenn Suche nicht aktiv */}
      {!isSearchActive && (
      <View style={[styles.logoContainer, isLandscape && isPhoneDevice && styles.logoContainerLandscape]}>
        <Image
          source={require('../assets/images/icon.png')}
          style={[styles.logo, isLandscape && isPhoneDevice && styles.logoLandscape]}
          resizeMode="contain"
        />
      </View>
      )}

      {/* Backup-Erinnerungs-Banner */}
      {backupDueDays !== null && (
        <TouchableOpacity
          style={{
            marginHorizontal: 16,
            marginTop: 12,
            backgroundColor: '#fef3c7',
            borderRadius: 10,
            padding: 12,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            borderLeftWidth: 4,
            borderLeftColor: '#d97706',
          }}
          onPress={handleBackupNow}
          disabled={backupRunning}
          activeOpacity={0.85}
        >
          <Ionicons name="save-outline" size={22} color="#d97706" />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 14, fontWeight: '800', color: '#92400e' }}>{backupRunning ? 'Backup wird erstellt…' : 'Backup empfohlen'}</Text>
            <Text style={{ fontSize: 11, color: '#92400e', marginTop: 1 }}>
              {backupRunning
                ? 'Bitte warten – bei vielen Projekten kann das etwas dauern.'
                : `${backupDueDays === 0
                    ? 'Sie haben noch nie ein Datei-Backup erstellt.'
                    : `Letzte Sicherung vor ${backupDueDays} ${backupDueDays === 1 ? 'Tag' : 'Tagen'}.`} Jetzt sichern?`}
            </Text>
          </View>
          <View style={{ backgroundColor: '#d97706', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, minWidth: 60, alignItems: 'center' }}>
            {backupRunning
              ? <ActivityIndicator size="small" color="#fff" />
              : <Text style={{ color: '#fff', fontSize: 12, fontWeight: '800' }}>Sichern</Text>}
          </View>
          {!backupRunning && (
            <TouchableOpacity onPress={() => setBackupDueDays(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={{ marginLeft: 4 }}>
              <Ionicons name="close" size={18} color="#92400e" />
            </TouchableOpacity>
          )}
        </TouchableOpacity>
      )}

      {/* Speicher-Warnung: viele verwaiste Daten gefunden */}
      {storageFreeable !== null && (
        <TouchableOpacity
          testID="storage-warning-banner"
          style={{
            marginHorizontal: 16,
            marginTop: 12,
            backgroundColor: '#fee2e2',
            borderRadius: 10,
            padding: 12,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            borderLeftWidth: 4,
            borderLeftColor: '#dc2626',
          }}
          onPress={() => router.push('/storage')}
          activeOpacity={0.85}
        >
          <Ionicons name="sparkles-outline" size={22} color="#dc2626" />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 14, fontWeight: '800', color: '#991b1b' }}>Speicher-Bereinigung empfohlen</Text>
            <Text style={{ fontSize: 11, color: '#991b1b', marginTop: 1 }}>
              {storageFreeable >= 1024 * 1024 * 1024
                ? `${(storageFreeable / (1024 * 1024 * 1024)).toFixed(2)} GB`
                : `${Math.round(storageFreeable / (1024 * 1024))} MB`} nicht mehr benötigte Daten gefunden. Jetzt sicher entfernen?
            </Text>
          </View>
          <View style={{ backgroundColor: '#dc2626', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, minWidth: 60, alignItems: 'center' }}>
            <Text style={{ color: '#fff', fontSize: 12, fontWeight: '800' }}>Bereinigen</Text>
          </View>
          <TouchableOpacity onPress={() => setStorageFreeable(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={{ marginLeft: 4 }}>
            <Ionicons name="close" size={18} color="#991b1b" />
          </TouchableOpacity>
        </TouchableOpacity>
      )}

      {/* Archiv-Erinnerung: alte abgeschlossene Projekte */}
      {archiveSuggest !== null && Features.showProjektExport && !selectionMode && (
        <TouchableOpacity
          testID="archive-suggest-banner"
          style={{
            marginHorizontal: 16,
            marginTop: 12,
            backgroundColor: '#fef3c7',
            borderRadius: 10,
            padding: 12,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            borderLeftWidth: 4,
            borderLeftColor: '#d97706',
          }}
          onPress={() => {
            setSelectionMode(true);
            setSelectedProjects(new Set(archiveSuggest.ids));
          }}
          activeOpacity={0.85}
        >
          <Ionicons name="archive-outline" size={22} color="#d97706" />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 14, fontWeight: '800', color: '#92400e' }}>Archivieren empfohlen</Text>
            <Text style={{ fontSize: 11, color: '#92400e', marginTop: 1 }}>
              {archiveSuggest.count} {archiveSuggest.count === 1 ? 'abgeschlossenes Projekt ist' : 'abgeschlossene Projekte sind'} seit über 60 Tagen unverändert. Als Datei auslagern und Speicher freigeben?
            </Text>
          </View>
          <View style={{ backgroundColor: '#d97706', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, minWidth: 60, alignItems: 'center' }}>
            <Text style={{ color: '#fff', fontSize: 12, fontWeight: '800' }}>Auswählen</Text>
          </View>
          <TouchableOpacity testID="archive-suggest-dismiss" onPress={snoozeArchiveSuggestion} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={{ marginLeft: 4 }}>
            <Ionicons name="close" size={18} color="#92400e" />
          </TouchableOpacity>
        </TouchableOpacity>
      )}

      {/* Pro: Hinweise auf ausgeliehene Maschinen, Inspektionen, TÜV & niedrigen Lagerbestand */}
      {isProUser && (loanedMachines.length > 0 || inspectionMachines.length > 0 || tuvMachines.length > 0 || lowStockMaterials.length > 0) && (
        <View style={{ marginHorizontal: 16, marginTop: 12, marginBottom: 4 }}>
          <View style={[styles.bannerRow, { flexWrap: 'wrap' }]}>
            {loanedMachines.length > 0 && (
              <TouchableOpacity
                style={[styles.bannerCard, { backgroundColor: '#7c3aed' }]}
                onPress={() => setExpandedBanner(expandedBanner === 'loaned' ? null : 'loaned')}
                activeOpacity={0.85}
              >
                <View style={styles.bannerCardIcon}>
                  <Ionicons name="swap-horizontal" size={16} color="#fff" />
                </View>
                <View style={styles.bannerCardTextWrap}>
                  <Text style={styles.bannerCardTitle} numberOfLines={1} adjustsFontSizeToFit>
                    {loanedMachines.length} {loanedMachines.length === 1 ? 'Gerät' : 'Geräte'}
                  </Text>
                  <Text style={styles.bannerCardSub} numberOfLines={1} adjustsFontSizeToFit>Ausgeliehen</Text>
                </View>
                <Ionicons name={expandedBanner === 'loaned' ? 'chevron-up' : 'chevron-down'} size={14} color="#fff" />
              </TouchableOpacity>
            )}
            {inspectionMachines.length > 0 && (() => {
              const overdue = inspectionMachines.filter(m => {
                const due = new Date(m.next_inspection_date!).getTime();
                return !isNaN(due) && due < Date.now();
              }).length;
              return (
                <TouchableOpacity
                  style={[styles.bannerCard, { backgroundColor: overdue > 0 ? '#dc2626' : '#ea580c' }]}
                  onPress={() => setExpandedBanner(expandedBanner === 'inspection' ? null : 'inspection')}
                  activeOpacity={0.85}
                >
                  <View style={styles.bannerCardIcon}>
                    <Ionicons name={overdue > 0 ? 'warning' : 'shield-checkmark'} size={16} color="#fff" />
                  </View>
                  <View style={styles.bannerCardTextWrap}>
                    <Text style={styles.bannerCardTitle} numberOfLines={1} adjustsFontSizeToFit>
                      {inspectionMachines.length} {inspectionMachines.length === 1 ? 'Gerät' : 'Geräte'}
                    </Text>
                    <Text style={styles.bannerCardSub} numberOfLines={1} adjustsFontSizeToFit>
                      {overdue > 0 ? `Insp. überf. (${overdue})` : 'Inspektion fällig'}
                    </Text>
                  </View>
                  <Ionicons name={expandedBanner === 'inspection' ? 'chevron-up' : 'chevron-down'} size={14} color="#fff" />
                </TouchableOpacity>
              );
            })()}
            {tuvMachines.length > 0 && (() => {
              const overdue = tuvMachines.filter(m => {
                const due = new Date(m.next_tuv_date!).getTime();
                return !isNaN(due) && due < Date.now();
              }).length;
              return (
                <TouchableOpacity
                  style={[styles.bannerCard, { backgroundColor: overdue > 0 ? '#991b1b' : '#dc2626' }]}
                  onPress={() => setExpandedBanner(expandedBanner === 'tuv' ? null : 'tuv')}
                  activeOpacity={0.85}
                >
                  <View style={styles.bannerCardIcon}>
                    <Ionicons name={overdue > 0 ? 'warning' : 'car-sport'} size={16} color="#fff" />
                  </View>
                  <View style={styles.bannerCardTextWrap}>
                    <Text style={styles.bannerCardTitle} numberOfLines={1} adjustsFontSizeToFit>
                      {tuvMachines.length} {tuvMachines.length === 1 ? 'TÜV' : 'TÜV'}
                    </Text>
                    <Text style={styles.bannerCardSub} numberOfLines={1} adjustsFontSizeToFit>
                      {overdue > 0 ? `überfällig (${overdue})` : 'TÜV fällig'}
                    </Text>
                  </View>
                  <Ionicons name={expandedBanner === 'tuv' ? 'chevron-up' : 'chevron-down'} size={14} color="#fff" />
                </TouchableOpacity>
              );
            })()}
            {lowStockMaterials.length > 0 && (() => {
              const empty = lowStockMaterials.filter(m => (m.stock_quantity || 0) <= 0).length;
              return (
                <TouchableOpacity
                  style={[styles.bannerCard, { backgroundColor: empty > 0 ? '#dc2626' : '#0891b2' }]}
                  onPress={() => setExpandedBanner(expandedBanner === 'lowstock' ? null : 'lowstock')}
                  activeOpacity={0.85}
                >
                  <View style={styles.bannerCardIcon}>
                    <Ionicons name={empty > 0 ? 'alert-circle' : 'cube-outline'} size={16} color="#fff" />
                  </View>
                  <View style={styles.bannerCardTextWrap}>
                    <Text style={styles.bannerCardTitle} numberOfLines={1} adjustsFontSizeToFit>
                      {lowStockMaterials.length} {lowStockMaterials.length === 1 ? 'Material' : 'Materialien'}
                    </Text>
                    <Text style={styles.bannerCardSub} numberOfLines={1} adjustsFontSizeToFit>
                      {empty > 0 ? `Bestand leer (${empty})` : 'Bestand niedrig'}
                    </Text>
                  </View>
                  <Ionicons name={expandedBanner === 'lowstock' ? 'chevron-up' : 'chevron-down'} size={14} color="#fff" />
                </TouchableOpacity>
              );
            })()}
          </View>

          {/* Detail-Panel für die jeweils aufgeklappte Karte */}
          {expandedBanner === 'loaned' && loanedMachines.length > 0 && (
            <View style={[styles.bannerDetail, { backgroundColor: '#f5f3ff', borderColor: '#7c3aed' }]}>
              {loanedMachines.map(m => {
                const due = m.loan_until_date ? new Date(m.loan_until_date) : null;
                const overdue = due ? due.getTime() < Date.now() : false;
                const dueStr = due && !isNaN(due.getTime())
                  ? due.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
                  : null;
                return (
                  <View key={m.id} style={styles.bannerDetailItem}>
                    <Ionicons name="construct" size={14} color="#7c3aed" />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.bannerDetailName}>{m.name}</Text>
                      <Text style={[styles.bannerDetailMeta, overdue && { color: '#dc2626', fontWeight: '700' }]} numberOfLines={1}>
                        {m.loan_to ? `↗ ${m.loan_to}` : '↗ ausgeliehen'}
                        {dueStr ? `  ·  ${overdue ? '⚠ überfällig seit ' : 'bis '}${dueStr}` : ''}
                      </Text>
                    </View>
                  </View>
                );
              })}
              <TouchableOpacity style={[styles.bannerOpenBtn, { backgroundColor: '#7c3aed' }]} onPress={() => router.push('/machines')}>
                <Ionicons name="arrow-forward" size={14} color="#fff" />
                <Text style={styles.bannerOpenBtnText}>Maschinen öffnen</Text>
              </TouchableOpacity>
            </View>
          )}
          {expandedBanner === 'inspection' && inspectionMachines.length > 0 && (
            <View style={[styles.bannerDetail, { backgroundColor: '#fff7ed', borderColor: '#ea580c' }]}>
              {inspectionMachines.map(m => {
                const due = new Date(m.next_inspection_date!);
                const overdue = !isNaN(due.getTime()) && due.getTime() < Date.now();
                const days = !isNaN(due.getTime())
                  ? Math.round((due.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
                  : null;
                const dueStr = !isNaN(due.getTime())
                  ? due.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
                  : '';
                return (
                  <View key={m.id} style={styles.bannerDetailItem}>
                    <Ionicons
                      name={overdue ? 'warning' : 'time'}
                      size={14}
                      color={overdue ? '#dc2626' : '#ea580c'}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.bannerDetailName}>{m.name}</Text>
                      <Text style={[styles.bannerDetailMeta, { color: overdue ? '#dc2626' : '#ea580c', fontWeight: overdue ? '700' : '600' }]} numberOfLines={1}>
                        {overdue
                          ? `⚠ Überfällig seit ${dueStr}${days != null ? ` (${Math.abs(days)} Tage)` : ''}`
                          : `Fällig am ${dueStr}${days != null && days >= 0 ? ` (in ${days} Tagen)` : ''}`}
                      </Text>
                    </View>
                  </View>
                );
              })}
              <TouchableOpacity style={[styles.bannerOpenBtn, { backgroundColor: '#ea580c' }]} onPress={() => router.push('/machines')}>
                <Ionicons name="arrow-forward" size={14} color="#fff" />
                <Text style={styles.bannerOpenBtnText}>Maschinen öffnen</Text>
              </TouchableOpacity>
            </View>
          )}
          {expandedBanner === 'tuv' && tuvMachines.length > 0 && (
            <View style={[styles.bannerDetail, { backgroundColor: '#fef2f2', borderColor: '#dc2626' }]}>
              {tuvMachines.map(m => {
                const due = new Date(m.next_tuv_date!);
                const overdue = !isNaN(due.getTime()) && due.getTime() < Date.now();
                const days = !isNaN(due.getTime())
                  ? Math.round((due.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
                  : null;
                const dueStr = !isNaN(due.getTime())
                  ? due.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
                  : '';
                return (
                  <View key={m.id} style={styles.bannerDetailItem}>
                    <Ionicons
                      name={overdue ? 'warning' : 'car-sport'}
                      size={14}
                      color={overdue ? '#991b1b' : '#dc2626'}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.bannerDetailName}>
                        {m.name}{m.license_plate ? `  ·  ${m.license_plate}` : ''}
                      </Text>
                      <Text style={[styles.bannerDetailMeta, { color: overdue ? '#991b1b' : '#dc2626', fontWeight: overdue ? '700' : '600' }]} numberOfLines={1}>
                        {overdue
                          ? `⚠ TÜV überfällig seit ${dueStr}${days != null ? ` (${Math.abs(days)} Tage)` : ''}`
                          : `TÜV fällig am ${dueStr}${days != null && days >= 0 ? ` (in ${days} Tagen)` : ''}`}
                      </Text>
                    </View>
                  </View>
                );
              })}
              <TouchableOpacity style={[styles.bannerOpenBtn, { backgroundColor: '#dc2626' }]} onPress={() => router.push('/machines')}>
                <Ionicons name="arrow-forward" size={14} color="#fff" />
                <Text style={styles.bannerOpenBtnText}>Maschinen öffnen</Text>
              </TouchableOpacity>
            </View>
          )}
          {expandedBanner === 'lowstock' && lowStockMaterials.length > 0 && (
            <View style={[styles.bannerDetail, { backgroundColor: '#ecfeff', borderColor: '#0891b2' }]}>
              {lowStockMaterials.map(m => {
                const empty = (m.stock_quantity || 0) <= 0;
                const threshold = m.low_stock_threshold ?? 5;
                return (
                  <View key={m.id} style={styles.bannerDetailItem}>
                    <Ionicons name={empty ? 'alert-circle' : 'cube'} size={14} color={empty ? '#dc2626' : '#0891b2'} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.bannerDetailName}>{m.name}</Text>
                      <Text style={[styles.bannerDetailMeta, { color: empty ? '#dc2626' : '#0891b2', fontWeight: empty ? '700' : '600' }]}>
                        Bestand: {m.stock_quantity ?? 0} {m.unit || 'Stk'} {empty ? '(leer!)' : `(Schwelle: ${threshold})`}
                      </Text>
                    </View>
                  </View>
                );
              })}
              <TouchableOpacity style={[styles.bannerOpenBtn, { backgroundColor: '#0891b2' }]} onPress={() => router.push('/materials')}>
                <Ionicons name="arrow-forward" size={14} color="#fff" />
                <Text style={styles.bannerOpenBtnText}>Materialien öffnen</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}

      {/* Suchleiste */}
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color="#666" />
        <TextInput
          style={styles.searchInput}
          placeholder={t('home.searchPlaceholder')}
          placeholderTextColor="#999"
          value={searchQuery}
          onChangeText={setSearchQuery}
          onFocus={() => setIsSearchFocused(true)}
          onBlur={() => setIsSearchFocused(false)}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => { setSearchQuery(''); setIsSearchFocused(false); }}>
            <Ionicons name="close-circle" size={20} color="#999" />
          </TouchableOpacity>
        )}
        {/* Globale Suche Button */}
        <TouchableOpacity
          style={styles.globalSearchBtn}
          onPress={() => router.push('/search')}
          accessibilityLabel="Globale Suche"
        >
          <Ionicons name="search-circle" size={26} color="#1976d2" />
        </TouchableOpacity>
      </View>

      {/* Dashboard Übersicht: Projektzahlen je Status + offene Aufgaben */}
      {projects.length > 0 && (
        <View style={styles.dashboardCard}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dashboardChipsRow}>
            {PROJECT_STATUSES.map(s => {
              const count = projects.filter(p => normalizeStatus(p.status) === s.key).length;
              if (count === 0) return null;
              return (
                <TouchableOpacity
                  key={s.key}
                  style={[styles.dashboardChip, { borderColor: s.color, backgroundColor: s.color + '14' }]}
                  onPress={() => handleFilterChange(activeFilter === s.key ? 'all' : s.key)}
                  testID={`dashboard-chip-${s.key}`}
                >
                  <Text style={[styles.dashboardChipCount, { color: s.color }]}>{count}</Text>
                  <Text style={[styles.dashboardChipLabel, { color: s.color }]}>{s.label}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* Status-Filter Tabs (scrollbar für die Pipeline) */}
      <View style={styles.filterContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScrollContent}>
        {STATUS_OPTIONS.map(option => (
          <TouchableOpacity
            key={option.key}
            style={[
              styles.filterTab,
              activeFilter === option.key && styles.filterTabActive,
              activeFilter === option.key && option.color && { borderColor: option.color }
            ]}
            onPress={() => handleFilterChange(option.key)}
          >
            <Ionicons 
              name={option.icon as any} 
              size={16} 
              color={activeFilter === option.key ? (option.color || '#1976d2') : '#666'} 
            />
            <Text 
              style={[
                styles.filterTabText,
                activeFilter === option.key && styles.filterTabTextActive,
                activeFilter === option.key && option.color && { color: option.color }
              ]}
              numberOfLines={1}
            >
              {option.labelKey ? t(option.labelKey) : option.label}
            </Text>
          </TouchableOpacity>
        ))}
        </ScrollView>
      </View>

      {/* Buttons und Quick-Actions - nur anzeigen wenn Suche nicht aktiv */}
      {!isSearchActive && (
      <View style={styles.actionButtons}>
        {/* Primary action - Neues Projekt */}
        <TouchableOpacity
          testID="home-new-project"
          style={styles.primaryButton}
          onPress={() => router.push('/projects/new')}
        >
          <Ionicons name="add-circle" size={22} color="#fff" />
          <Text style={styles.primaryButtonText}>{t('home.newProject')}</Text>
        </TouchableOpacity>

        {/* Quick action grid */}
        <View style={[styles.quickGrid, isPhoneDevice && styles.quickGridPhone]}>
          <TouchableOpacity
            style={[styles.quickButton, isPhoneDevice && styles.quickButtonPhone]}
            onPress={() => router.push('/customers/')}
          >
            <View style={[styles.quickIconContainer, isPhoneDevice && styles.quickIconContainerPhone, { backgroundColor: '#e3f2fd' }]}>
              <Ionicons name="people" size={isPhoneDevice ? 18 : 20} color="#1976d2" />
            </View>
            <Text style={[styles.quickButtonText, isPhoneDevice && styles.quickButtonTextPhone]}>{t('home.customers')}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.quickButton, isPhoneDevice && styles.quickButtonPhone]}
            onPress={() => router.push('/checklists/templates')}
          >
            <View style={[styles.quickIconContainer, isPhoneDevice && styles.quickIconContainerPhone, { backgroundColor: '#f3e5f5' }]}>
              <Ionicons name="checkbox-outline" size={isPhoneDevice ? 18 : 20} color="#7b1fa2" />
            </View>
            <Text style={[styles.quickButtonText, isPhoneDevice && styles.quickButtonTextPhone]}>{t('home.checklists')}</Text>
          </TouchableOpacity>

          {/* Mitarbeiter - nur in Pro Version */}
          {Features.showReportTab && (
          <TouchableOpacity
            style={[styles.quickButton, isPhoneDevice && styles.quickButtonPhone]}
            onPress={() => router.push('/employees/')}
          >
            <View style={[styles.quickIconContainer, isPhoneDevice && styles.quickIconContainerPhone, { backgroundColor: '#dbeafe' }]}>
              <Ionicons name="people-circle-outline" size={isPhoneDevice ? 18 : 20} color="#1d4ed8" />
            </View>
            <Text style={[styles.quickButtonText, isPhoneDevice && styles.quickButtonTextPhone]}>Mitarbeiter</Text>
          </TouchableOpacity>
          )}

          {/* Material - nur in Pro Version */}
          {Features.showReportTab && (
          <TouchableOpacity
            style={[styles.quickButton, isPhoneDevice && styles.quickButtonPhone]}
            onPress={() => router.push('/materials/')}
          >
            <View style={[styles.quickIconContainer, isPhoneDevice && styles.quickIconContainerPhone, { backgroundColor: '#fef3c7' }]}>
              <Ionicons name="cube-outline" size={isPhoneDevice ? 18 : 20} color="#d97706" />
            </View>
            <Text style={[styles.quickButtonText, isPhoneDevice && styles.quickButtonTextPhone]}>Material</Text>
          </TouchableOpacity>
          )}

          {/* Maschinen / Geräte - nur in Pro Version */}
          {Features.showReportTab && (
          <TouchableOpacity
            style={[styles.quickButton, isPhoneDevice && styles.quickButtonPhone]}
            onPress={() => router.push('/machines/')}
          >
            <View style={[styles.quickIconContainer, isPhoneDevice && styles.quickIconContainerPhone, { backgroundColor: '#ede9fe' }]}>
              <Ionicons name="construct-outline" size={isPhoneDevice ? 18 : 20} color="#7c3aed" />
            </View>
            <Text style={[styles.quickButtonText, isPhoneDevice && styles.quickButtonTextPhone]}>Maschinen</Text>
          </TouchableOpacity>
          )}

          {/* Referenzen - nur in Pro Version */}
          {Features.showReferenzButton && (
          <TouchableOpacity
            style={[styles.quickButton, isPhoneDevice && styles.quickButtonPhone]}
            onPress={() => router.push('/references/')}
          >
            <View style={[styles.quickIconContainer, isPhoneDevice && styles.quickIconContainerPhone, { backgroundColor: '#fff3e0' }]}>
              <Ionicons name="images" size={isPhoneDevice ? 18 : 20} color="#f57c00" />
            </View>
            <Text style={[styles.quickButtonText, isPhoneDevice && styles.quickButtonTextPhone]}>{t('home.references')}</Text>
          </TouchableOpacity>
          )}

          <TouchableOpacity
            style={[styles.quickButton, isPhoneDevice && styles.quickButtonPhone]}
            onPress={() => router.push('/settings')}
          >
            <View style={[styles.quickIconContainer, isPhoneDevice && styles.quickIconContainerPhone, { backgroundColor: '#eceff1' }]}>
              <Ionicons name="settings-outline" size={isPhoneDevice ? 18 : 20} color="#546e7a" />
            </View>
            <Text style={[styles.quickButtonText, isPhoneDevice && styles.quickButtonTextPhone]}>{t('home.settings')}</Text>
          </TouchableOpacity>
        </View>

        {/* Sort and Import row */}
        <View style={styles.utilityRow}>
          <TouchableOpacity
            style={styles.utilityButton}
            onPress={changeSortOrder}
          >
            <Ionicons name="swap-vertical" size={16} color="#1976d2" />
            <Text style={styles.utilityButtonText}>{getSortLabel()}</Text>
          </TouchableOpacity>

          {/* Import Button - nur in Pro Version */}
          {Features.showImportButton && (
          <TouchableOpacity
            testID="home-import"
            style={[styles.utilityButton, styles.importUtilityButton]}
            onPress={importProjectFile}
          >
            <Ionicons name="download-outline" size={16} color="#2e7d32" />
            <Text style={[styles.utilityButtonText, { color: '#2e7d32' }]}>Import</Text>
          </TouchableOpacity>
          )}
          
          {/* Verschieben Button - nur in Pro Version */}
          {Features.showVerschiebenButton && (
          <TouchableOpacity
            testID="home-select-toggle"
            style={[styles.utilityButton, selectionMode && styles.utilityButtonActive]}
            onPress={toggleSelectionMode}
          >
            <Ionicons 
              name={selectionMode ? "close-circle" : "swap-horizontal"} 
              size={16} 
              color={selectionMode ? "#fff" : "#9c27b0"} 
            />
            <Text style={[styles.utilityButtonText, { color: selectionMode ? '#fff' : '#9c27b0' }]}>
              {selectionMode ? t('common.cancel') : t('home.select')}
            </Text>
          </TouchableOpacity>
          )}
        </View>
        
        {/* Multi-Select Action Row - nur wenn Selection Mode aktiv und Pro Version */}
        {Features.showVerschiebenButton && selectionMode && (
        <View style={styles.multiSelectRow}>
          <TouchableOpacity
            style={[styles.multiSelectButton, { backgroundColor: '#e3f2fd' }]}
            onPress={selectedProjects.size === filteredProjects.length ? deselectAllProjects : selectAllProjects}
          >
            <Ionicons 
              name={selectedProjects.size === filteredProjects.length ? "checkbox" : "checkbox-outline"} 
              size={16} 
              color="#1976d2" 
            />
            <Text style={[styles.multiSelectButtonText, { color: '#1976d2' }]}>
              {selectedProjects.size > 0 ? `(${selectedProjects.size})` : t('home.selectAll')}
            </Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={[styles.multiSelectButton, { backgroundColor: '#e8f5e9' }]}
            onPress={exportSelectedProjects}
            disabled={selectedProjects.size === 0}
          >
            <Ionicons name="share-outline" size={16} color="#2e7d32" />
            <Text style={[styles.multiSelectButtonText, { color: '#2e7d32' }]}>{t('common.export')}</Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={[styles.multiSelectButton, { backgroundColor: '#e8f5e9' }]}
            onPress={() => {
              const buttons: any[] = PROJECT_STATUSES.map(s => ({
                text: s.label,
                onPress: () => moveSelectedToStatus(s.key),
              }));
              buttons.push({ text: t('common.cancel'), style: 'cancel' });
              Alert.alert('Status ändern', 'Neuen Status für die ausgewählten Projekte wählen:', buttons);
            }}
            disabled={selectedProjects.size === 0}
          >
            <Ionicons name="swap-horizontal-outline" size={16} color="#4caf50" />
            <Text style={[styles.multiSelectButtonText, { color: '#4caf50' }]}>Status</Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={[styles.multiSelectButton, { backgroundColor: '#fef3c7' }]}
            testID="multi-archive"
            onPress={archiveSelectedProjects}
            disabled={selectedProjects.size === 0}
          >
            <Ionicons name="archive-outline" size={16} color="#d97706" />
            <Text style={[styles.multiSelectButtonText, { color: '#d97706' }]}>Archiv</Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={[styles.multiSelectButton, { backgroundColor: '#ffebee' }]}
            onPress={deleteSelectedProjects}
            disabled={selectedProjects.size === 0}
          >
            <Ionicons name="trash-outline" size={16} color="#f44336" />
            <Text style={[styles.multiSelectButtonText, { color: '#f44336' }]}>{t('common.delete')}</Text>
          </TouchableOpacity>
        </View>
        )}
      </View>
      )}
    </>
  );

  return (
    <View style={styles.container}>
      {/* Processing Overlay */}
      {isProcessing && (
        <View style={styles.processingOverlay}>
          <ActivityIndicator size="large" color="#fff" />
          <Text style={styles.processingText}>{t('common.loading')}</Text>
        </View>
      )}

      {/* Import-Fortschritt (Balken + Zähler) */}
      {importProgress && (
        <View style={styles.processingOverlay}>
          <View style={styles.importProgressCard}>
            <Text style={styles.importProgressTitle}>Projekt wird importiert</Text>
            {!!importProgress.title && (
              <Text style={styles.importProgressProject} numberOfLines={1}>
                {importProgress.title}
              </Text>
            )}
            {importProgress.fraction !== null ? (
              <View style={styles.importProgressBarTrack}>
                <View
                  style={[
                    styles.importProgressBarFill,
                    { width: `${Math.round(Math.min(1, importProgress.fraction) * 100)}%` },
                  ]}
                />
              </View>
            ) : (
              <ActivityIndicator size="small" color="#1976d2" style={styles.importProgressSpinner} />
            )}
            <Text style={styles.importProgressLabel}>{importProgress.label}</Text>
          </View>
        </View>
      )}

      {/* Gesamte Seite als eine scrollbare FlatList - Header scrollt mit */}
      <FlatList
        data={filteredProjects}
        renderItem={renderProject}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.projectList}
        ListHeaderComponent={renderListHeader()}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="folder-open-outline" size={64} color="#ccc" />
            <Text style={styles.emptyText}>
              {projects.length === 0 ? t('home.noProjects') : t('home.noProjects')}
            </Text>
            <Text style={styles.emptySubtext}>
              {projects.length === 0 
                ? t('home.createFirst') 
                : searchQuery 
                  ? t('home.searchPlaceholder')
                  : t('home.noProjects')}
            </Text>
          </View>
        }
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoContainer: {
    backgroundColor: '#0a1628',
    padding: 0,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  logoContainerLandscape: {
    flexDirection: 'row',
    padding: 0,
    paddingHorizontal: 16,
    gap: 10,
    justifyContent: 'center',
  },
  logo: {
    width: '100%',
    height: 180,
    borderRadius: 0,
  },
  logoLandscape: {
    width: 36,
    height: 36,
    borderRadius: 8,
  },
  versionCode: {
    color: '#ffffff',
    fontSize: 12,
    marginTop: 8,
    opacity: 0.8,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#333',
  },
  filterContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  dashboardCard: {
    marginHorizontal: 16,
    marginTop: 12,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e8e8e8',
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  dashboardChipsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  dashboardChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  dashboardChipCount: {
    fontSize: 14,
    fontWeight: '800',
  },
  dashboardChipLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  filterScrollContent: {
    flexDirection: 'row',
    gap: 8,
    flexGrow: 1,
  },
  filterTab: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    gap: 4,
  },
  filterTabActive: {
    backgroundColor: '#e3f2fd',
    borderColor: '#1976d2',
  },
  filterTabText: {
    fontSize: 12,
    color: '#666',
    fontWeight: '500',
  },
  filterTabTextActive: {
    color: '#1976d2',
    fontWeight: '600',
  },
  actionButtons: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 10,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1976d2',
    paddingVertical: 12,
    borderRadius: 10,
    gap: 8,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  quickGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  quickGridPhone: {
    gap: 6,
    justifyContent: 'space-between',
  },
  quickButton: {
    width: '23%',
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2,
  },
  quickButtonPhone: {
    width: '23%',
    paddingVertical: 8,
    paddingHorizontal: 2,
    borderRadius: 8,
  },
  quickIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
  },
  quickIconContainerPhone: {
    width: 32,
    height: 32,
    borderRadius: 8,
    marginBottom: 4,
  },
  quickButtonText: {
    fontSize: 11,
    color: '#333',
    fontWeight: '500',
    textAlign: 'center',
  },
  quickButtonTextPhone: {
    fontSize: 10,
  },
  utilityRow: {
    flexDirection: 'row',
    gap: 10,
  },
  utilityButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingVertical: 8,
    gap: 6,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  importUtilityButton: {
    borderColor: '#c8e6c9',
    backgroundColor: '#f1f8e9',
  },
  utilityButtonActive: {
    borderColor: '#9c27b0',
    backgroundColor: '#9c27b0',
  },
  utilityButtonText: {
    fontSize: 12,
    color: '#1976d2',
    fontWeight: '500',
  },
  // Multi-Select Styles
  multiSelectRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
  },
  multiSelectButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: '#f5f5f5',
    gap: 4,
  },
  multiSelectButtonActive: {
    backgroundColor: '#1976d2',
  },
  multiSelectButtonText: {
    fontSize: 11,
    color: '#666',
    fontWeight: '500',
  },
  checkboxContainer: {
    marginRight: 4,
  },
  projectCardSelected: {
    borderColor: '#1976d2',
    borderWidth: 2,
    backgroundColor: '#e3f2fd',
  },
  processingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  processingText: {
    color: '#fff',
    fontSize: 16,
    marginTop: 12,
    fontWeight: '500',
  },
  importProgressCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    paddingVertical: 24,
    paddingHorizontal: 20,
    width: '82%',
    maxWidth: 420,
    alignItems: 'center',
  },
  importProgressTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#333',
  },
  importProgressProject: {
    fontSize: 14,
    color: '#666',
    marginTop: 6,
    maxWidth: '100%',
  },
  importProgressBarTrack: {
    width: '100%',
    height: 8,
    borderRadius: 4,
    backgroundColor: '#e0e0e0',
    marginTop: 18,
    overflow: 'hidden',
  },
  importProgressBarFill: {
    height: '100%',
    borderRadius: 4,
    backgroundColor: '#1976d2',
  },
  importProgressSpinner: {
    marginTop: 18,
  },
  importProgressLabel: {
    fontSize: 14,
    color: '#1976d2',
    fontWeight: '600',
    marginTop: 10,
  },
  // Legacy styles kept for compatibility
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
  },
  button: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 12,
    borderRadius: 12,
    gap: 8,
  },
  secondaryButton: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#1976d2',
  },
  buttonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  secondaryButtonText: {
    color: '#1976d2',
    fontSize: 14,
    fontWeight: '600',
  },
  importSortRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 4,
  },
  sortButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#e3f2fd',
    borderWidth: 1,
    borderColor: '#1976d2',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 12,
    gap: 8,
  },
  sortButtonText: {
    color: '#1976d2',
    fontSize: 14,
    fontWeight: '600',
  },
  importButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#e8f5e9',
    borderWidth: 1,
    borderColor: '#4caf50',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 12,
    gap: 8,
  },
  importButtonText: {
    color: '#2e7d32',
    fontSize: 14,
    fontWeight: '600',
  },
  referenceButton: {
    backgroundColor: '#fff3e0',
    borderWidth: 1,
    borderColor: '#ff9800',
  },
  referenceButtonText: {
    color: '#e65100',
    fontSize: 14,
    fontWeight: '600',
  },
  quickCustomerSection: {
    marginTop: 8,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    padding: 12,
  },
  quickCustomerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  quickCustomerTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  customerSearchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 10,
    gap: 8,
  },
  customerSearchInput: {
    flex: 1,
    fontSize: 14,
    color: '#333',
  },
  customerListContainer: {
    gap: 6,
  },
  customerListItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f9f9f9',
    borderRadius: 8,
    padding: 10,
    gap: 10,
  },
  customerListAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1976d2',
    justifyContent: 'center',
    alignItems: 'center',
  },
  customerListInitial: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  customerListInfo: {
    flex: 1,
  },
  customerListName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  customerListPhone: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  customerListAction: {
    padding: 4,
  },
  customerListMore: {
    textAlign: 'center',
    fontSize: 12,
    color: '#666',
    marginTop: 6,
  },
  customerListEmpty: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  customerListEmptyText: {
    fontSize: 13,
    color: '#999',
    marginBottom: 10,
  },
  customerAddButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#e3f2fd',
    borderRadius: 8,
  },
  customerAddButtonText: {
    fontSize: 13,
    color: '#1976d2',
    fontWeight: '500',
  },
  projectList: {
    padding: 16,
    paddingTop: 0,
  },
  projectCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  projectHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  projectInfo: {
    flex: 1,
    marginLeft: 12,
  },
  projectNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  projectNumber: {
    fontSize: 11,
    fontWeight: '600',
    color: '#4caf50',
    backgroundColor: '#e8f5e9',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  projectName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    flexShrink: 1,
  },
  customerNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  customerNumberSmall: {
    fontSize: 10,
    fontWeight: '600',
    color: '#1976d2',
    backgroundColor: '#e3f2fd',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
  },
  customerName: {
    fontSize: 14,
    color: '#666',
  },
  deleteButton: {
    padding: 8,
  },
  projectDescription: {
    fontSize: 14,
    color: '#666',
    marginBottom: 12,
  },
  projectFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    gap: 4,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  projectDate: {
    fontSize: 12,
    color: '#999',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#666',
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#999',
    marginTop: 8,
  },
  // Banner row (Pro-Hinweise: ausgeliehen / Inspektion)
  bannerRow: {
    flexDirection: 'row',
    gap: 6,
  },
  bannerCard: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 10,
  },
  bannerCardIcon: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  bannerCardTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  bannerCardTitle: { color: '#fff', fontWeight: '800', fontSize: 13 },
  bannerCardSub: { color: 'rgba(255,255,255,0.9)', fontSize: 10, marginTop: 1 },
  // Detail panel (expanded)
  bannerDetail: {
    marginTop: 8,
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 8,
    paddingHorizontal: 10,
    gap: 6,
  },
  bannerDetailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
  },
  bannerDetailName: { color: '#0f172a', fontWeight: '700', fontSize: 13 },
  bannerDetailMeta: { color: '#475569', fontSize: 11, marginTop: 1 },
  bannerOpenBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    borderRadius: 8, paddingVertical: 8, marginTop: 4,
  },
  bannerOpenBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  globalSearchBtn: {
    marginLeft: 6,
    padding: 2,
  },
});

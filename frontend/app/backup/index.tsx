import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { useNavigation, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BackupService, AutoBackupSnapshot } from '../../services/BackupService';
import { Features } from '../../services/FeatureFlags';
import AsyncStorage from '@react-native-async-storage/async-storage';

const REMINDER_KEY = 'aufmassprofi_backup_reminder_days';
const REMINDER_OPTIONS: { days: number; label: string }[] = [
  { days: 0, label: 'Aus (keine Erinnerung)' },
  { days: 1, label: 'Täglich' },
  { days: 3, label: 'Alle 3 Tage' },
  { days: 7, label: 'Wöchentlich' },
  { days: 14, label: 'Alle 2 Wochen' },
  { days: 30, label: 'Monatlich' },
];

const fmtSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
};

const fmtDate = (iso: string): string => {
  const d = new Date(iso);
  return `${d.toLocaleDateString('de-DE')} ${d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}`;
};

export default function BackupScreen() {
  const navigation = useNavigation();
  const [snapshots, setSnapshots] = useState<Omit<AutoBackupSnapshot, 'data_json'>[]>([]);
  const [busy, setBusy] = useState(false);
  const [busyLabel, setBusyLabel] = useState('');
  const [reminderDays, setReminderDays] = useState<number>(7);
  const [lastBackup, setLastBackup] = useState<string | null>(null);

  useEffect(() => {
    navigation.setOptions({
      title: 'Datensicherung',
      headerStyle: { backgroundColor: '#0891b2' },
      headerTintColor: '#fff',
    });
  }, [navigation]);

  const loadSnapshots = useCallback(async () => {
    const list = await BackupService.listAutoSnapshots();
    setSnapshots(list);
    const last = await BackupService.getLastFileBackup();
    setLastBackup(last);
    try {
      const raw = await AsyncStorage.getItem(REMINDER_KEY);
      if (raw != null) setReminderDays(parseInt(raw, 10) || 0);
    } catch {}
  }, []);

  useFocusEffect(useCallback(() => { loadSnapshots(); }, [loadSnapshots]));

  // ============ Option A: Full Backup Export ============
  const handleFullBackup = async () => {
    setBusy(true);
    setBusyLabel('Backup wird erstellt…');
    try {
      const res = await BackupService.exportFullBackup();
      setLastBackup(new Date().toISOString());
      Alert.alert(
        '✅ Backup erstellt',
        `Dateigröße: ${fmtSize(res.sizeBytes)}\n\nSpeichere die Datei in Google Drive, iCloud Drive, per E-Mail oder AirDrop – so hast du sie auch bei Neuinstallation zur Hand.`
      );
    } catch (e: any) {
      console.error('[Backup] Failed:', e);
      Alert.alert('Fehler', 'Backup fehlgeschlagen: ' + (e?.message || 'Unbekannter Fehler'));
    } finally {
      setBusy(false);
      setBusyLabel('');
    }
  };

  // ============ Option A: Restore from File ============
  const handleRestoreFromFile = async () => {
    Alert.alert(
      '⚠️ Backup wiederherstellen',
      'ACHTUNG: Alle aktuellen Daten werden durch das Backup ersetzt.\n\nDas ist nicht rückgängig zu machen! Vor der Wiederherstellung empfehle ich, ein aktuelles Backup zu erstellen.\n\nFortfahren?',
      [
        { text: 'Abbrechen', style: 'cancel' },
        {
          text: 'Ja, wiederherstellen',
          style: 'destructive',
          onPress: async () => {
            setBusy(true);
            setBusyLabel('Backup wird geladen…');
            try {
              const res = await BackupService.importFullBackup('replace');
              const c = res.counts;
              Alert.alert(
                '✅ Wiederherstellung erfolgreich',
                `Backup vom ${fmtDate(res.created_at)} wurde eingelesen:\n\n` +
                `• ${c.projects} Projekte\n` +
                `• ${c.customers} Kunden\n` +
                `• ${c.sketches} Skizzen\n` +
                `• ${c.photos} Fotos\n` +
                `• ${c.reports} Rapporte\n\n` +
                `Bitte App neu starten, damit alle Änderungen sichtbar werden.`
              );
              await loadSnapshots();
            } catch (e: any) {
              if (e?.message !== 'Kein Backup ausgewählt.') {
                console.error('[Restore] Failed:', e);
                Alert.alert('Fehler', 'Wiederherstellung fehlgeschlagen: ' + (e?.message || 'Unbekannter Fehler'));
              }
            } finally {
              setBusy(false);
              setBusyLabel('');
            }
          },
        },
      ]
    );
  };

  // ============ Option B: Create Snapshot Now ============
  const handleCreateSnapshot = async () => {
    setBusy(true);
    setBusyLabel('Snapshot wird erstellt…');
    try {
      await BackupService.createAutoSnapshot();
      await loadSnapshots();
      Alert.alert('✅ Snapshot erstellt', 'Ein interner Snapshot wurde gespeichert. Verwende ihn nur zur Wiederherstellung bei App-Problemen – für Neuinstallationen brauchst du das Datei-Backup!');
    } catch (e: any) {
      console.error('[Snapshot] Failed:', e);
      Alert.alert('Fehler', 'Snapshot fehlgeschlagen: ' + (e?.message || 'Unbekannter Fehler'));
    } finally {
      setBusy(false);
      setBusyLabel('');
    }
  };

  // ============ Option B: Restore Snapshot ============
  const handleRestoreSnapshot = (snap: Omit<AutoBackupSnapshot, 'data_json'>) => {
    Alert.alert(
      '⚠️ Snapshot wiederherstellen',
      `Snapshot vom ${fmtDate(snap.created_at)} wiederherstellen?\n\n` +
      `• ${snap.counts.projects} Projekte\n` +
      `• ${snap.counts.photos} Fotos\n` +
      `• ${snap.counts.reports} Rapporte\n\n` +
      `ACHTUNG: Alle aktuellen Daten werden ersetzt!`,
      [
        { text: 'Abbrechen', style: 'cancel' },
        {
          text: 'Wiederherstellen',
          style: 'destructive',
          onPress: async () => {
            setBusy(true);
            setBusyLabel('Wird wiederhergestellt…');
            try {
              await BackupService.restoreAutoSnapshot(snap.id);
              Alert.alert('✅ Fertig', 'Daten wurden aus dem Snapshot wiederhergestellt.\n\nBitte App neu starten.');
            } catch (e: any) {
              console.error(e);
              Alert.alert('Fehler', 'Wiederherstellung fehlgeschlagen: ' + (e?.message || ''));
            } finally {
              setBusy(false);
              setBusyLabel('');
            }
          },
        },
      ]
    );
  };

  const handleDeleteSnapshot = (snap: Omit<AutoBackupSnapshot, 'data_json'>) => {
    Alert.alert('Snapshot löschen?', `Snapshot vom ${fmtDate(snap.created_at)} unwiderruflich löschen?`, [
      { text: 'Abbrechen', style: 'cancel' },
      {
        text: 'Löschen',
        style: 'destructive',
        onPress: async () => {
          await BackupService.deleteAutoSnapshot(snap.id);
          await loadSnapshots();
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
        {/* Info-Header */}
        <View style={styles.infoCard}>
          <Ionicons name="shield-checkmark-outline" size={24} color="#0891b2" />
          <View style={{ flex: 1 }}>
            <Text style={styles.infoTitle}>Deine Daten sichern</Text>
            <Text style={styles.infoText}>
              Sichere alle Projekte, Fotos, Skizzen, Rapporte und Stammdaten in einer einzigen Datei –
              damit du sie bei Bedarf wiederherstellen kannst.
            </Text>
          </View>
        </View>

        {/* ===== Option A: Datei-Backup ===== */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="cloud-upload-outline" size={20} color="#0f172a" />
            <Text style={styles.sectionTitle}>Backup als Datei</Text>
          </View>
          <Text style={styles.sectionSub}>
            Empfohlen: Sichere regelmäßig in Google Drive, iCloud Drive oder per E-Mail.
            Diese Backups überstehen auch eine Neuinstallation der App.
          </Text>

          <TouchableOpacity style={[styles.mainBtn, { backgroundColor: '#16a34a' }]} onPress={handleFullBackup} disabled={busy}>
            <Ionicons name="save-outline" size={22} color="#fff" />
            <Text style={styles.mainBtnText}>Backup erstellen &amp; teilen</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.mainBtn, { backgroundColor: '#0891b2', marginTop: 10 }]} onPress={handleRestoreFromFile} disabled={busy}>
            <Ionicons name="download-outline" size={22} color="#fff" />
            <Text style={styles.mainBtnText}>Aus Datei wiederherstellen</Text>
          </TouchableOpacity>

          {/* Letztes Backup */}
          <View style={styles.lastBackupInfo}>
            <Ionicons name="time-outline" size={14} color="#64748b" />
            <Text style={styles.lastBackupText}>
              {lastBackup
                ? `Letztes Backup: ${fmtDate(lastBackup)}`
                : 'Noch kein Datei-Backup erstellt.'}
            </Text>
          </View>

          {/* Erinnerungs-Intervall */}
          <View style={{ marginTop: 16, paddingTop: 14, borderTopWidth: 1, borderTopColor: '#e2e8f0' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <Ionicons name="notifications-outline" size={18} color="#0f172a" />
              <Text style={{ fontSize: 14, fontWeight: '700', color: '#0f172a' }}>Erinnerung an neues Backup</Text>
            </View>
            <Text style={{ fontSize: 12, color: '#64748b', marginBottom: 10 }}>
              Zeigt auf der Startseite einen Hinweis, wenn wieder ein Backup fällig ist.
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {REMINDER_OPTIONS.map(opt => {
                const active = reminderDays === opt.days;
                return (
                  <TouchableOpacity
                    key={opt.days}
                    onPress={async () => {
                      setReminderDays(opt.days);
                      try { await AsyncStorage.setItem(REMINDER_KEY, String(opt.days)); } catch {}
                    }}
                    style={{
                      paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20,
                      backgroundColor: active ? '#16a34a' : '#f1f5f9',
                      borderWidth: 1, borderColor: active ? '#16a34a' : '#e2e8f0',
                    }}
                  >
                    <Text style={{
                      fontSize: 12, fontWeight: '700',
                      color: active ? '#fff' : '#475569'
                    }}>{opt.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </View>

        {/* ===== Option B: Auto-Snapshots ===== */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="time-outline" size={20} color="#0f172a" />
            <Text style={styles.sectionTitle}>Automatische Snapshots</Text>
          </View>
          <Text style={styles.sectionSub}>
            Zusätzliche Sicherheitsnetze – rollende letzte 5 Snapshots im App-Speicher.
            Werden alle 24 Stunden beim App-Start erstellt.
            ⚠️ Gehen bei App-Deinstallation verloren – deshalb nicht als Hauptsicherung nutzen!
          </Text>

          <TouchableOpacity style={[styles.mainBtn, { backgroundColor: '#64748b' }]} onPress={handleCreateSnapshot} disabled={busy}>
            <Ionicons name="camera-outline" size={22} color="#fff" />
            <Text style={styles.mainBtnText}>Snapshot jetzt erstellen</Text>
          </TouchableOpacity>

          <View style={{ marginTop: 12 }}>
            {snapshots.length === 0 ? (
              <Text style={styles.emptyText}>Noch keine Snapshots vorhanden.</Text>
            ) : (
              snapshots.map(snap => (
                <View key={snap.id} style={styles.snapCard}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.snapDate}>{fmtDate(snap.created_at)}</Text>
                    <Text style={styles.snapMeta}>
                      {snap.counts.projects} Projekte · {snap.counts.photos} Fotos · {fmtSize(snap.size_bytes)}
                    </Text>
                  </View>
                  <TouchableOpacity style={styles.snapAction} onPress={() => handleRestoreSnapshot(snap)}>
                    <Ionicons name="refresh-outline" size={20} color="#0891b2" />
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.snapAction} onPress={() => handleDeleteSnapshot(snap)}>
                    <Ionicons name="trash-outline" size={20} color="#ef4444" />
                  </TouchableOpacity>
                </View>
              ))
            )}
          </View>
        </View>

        {/* Info am Ende */}
        <View style={styles.footNote}>
          <Ionicons name="information-circle-outline" size={16} color="#64748b" />
          <Text style={styles.footText}>
            {Features.showReportTab
              ? 'Ein Backup enthält alle Projekte, Kunden, Skizzen (inkl. Zeichnungen), Fotos (Base64), Aufmaße, Rapporte, Mitarbeiter, Materialien, Maschinen sowie deine Einstellungen und Firmendaten.'
              : 'Ein Backup enthält alle Projekte, Kunden, Skizzen (inkl. Zeichnungen), Fotos (Base64), Aufmaße, Checklisten sowie deine Einstellungen und Firmendaten.'}
          </Text>
        </View>
      </ScrollView>

      {/* Busy overlay */}
      {busy && (
        <View style={styles.busyOverlay}>
          <View style={styles.busyCard}>
            <ActivityIndicator size="large" color="#0891b2" />
            <Text style={styles.busyText}>{busyLabel}</Text>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  infoCard: { backgroundColor: '#ecfeff', borderRadius: 12, padding: 14, flexDirection: 'row', gap: 12, alignItems: 'flex-start', marginBottom: 20 },
  infoTitle: { fontSize: 15, fontWeight: '800', color: '#0f172a', marginBottom: 4 },
  infoText: { fontSize: 12, color: '#475569', lineHeight: 17 },
  section: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: '#e2e8f0' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: '#0f172a' },
  sectionSub: { fontSize: 12, color: '#64748b', lineHeight: 17, marginBottom: 14 },
  mainBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 14, borderRadius: 10 },
  mainBtnText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  lastBackupInfo: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12, paddingTop: 10 },
  lastBackupText: { fontSize: 12, color: '#64748b', fontStyle: 'italic' },
  emptyText: { textAlign: 'center', color: '#94a3b8', fontSize: 12, paddingVertical: 8, fontStyle: 'italic' },
  snapCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f8fafc', borderRadius: 8, padding: 10, marginBottom: 6, gap: 8 },
  snapDate: { fontSize: 13, fontWeight: '700', color: '#0f172a' },
  snapMeta: { fontSize: 11, color: '#64748b', marginTop: 2 },
  snapAction: { padding: 6 },
  footNote: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: 8, paddingHorizontal: 4 },
  footText: { flex: 1, fontSize: 11, color: '#64748b', lineHeight: 16, fontStyle: 'italic' },
  busyOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center' },
  busyCard: { backgroundColor: '#fff', borderRadius: 12, padding: 24, alignItems: 'center', gap: 12, minWidth: 200 },
  busyText: { fontSize: 13, color: '#0f172a', fontWeight: '600', textAlign: 'center' },
});

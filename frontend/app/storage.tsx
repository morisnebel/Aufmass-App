import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, ActivityIndicator, Platform } from 'react-native';
import { useNavigation, useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { analyzeStorage, cleanupSafe, emptyTrashNow, StorageAnalysis } from '../services/StorageCleanup';
import { BackupService } from '../services/BackupService';

const MAX_SNAPSHOTS_KEY = 'aufmassprofi_max_auto_snapshots';

const fmtSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
};

// Plattformübergreifende Bestätigung
const confirmAction = (title: string, message: string, confirmText: string, onConfirm: () => void) => {
  if (Platform.OS === 'web') {
    // eslint-disable-next-line no-alert
    if (window.confirm(`${title}\n\n${message}`)) onConfirm();
  } else {
    Alert.alert(title, message, [
      { text: 'Abbrechen', style: 'cancel' },
      { text: confirmText, style: 'destructive', onPress: onConfirm },
    ]);
  }
};

const showInfo = (title: string, message: string) => {
  if (Platform.OS === 'web') {
    // eslint-disable-next-line no-alert
    alert(`${title}\n\n${message}`);
  } else {
    Alert.alert(title, message);
  }
};

export default function StorageScreen() {
  const navigation = useNavigation();
  const router = useRouter();
  const [analysis, setAnalysis] = useState<StorageAnalysis | null>(null);
  const [busy, setBusy] = useState(false);
  const [busyLabel, setBusyLabel] = useState('');
  const [maxSnapshots, setMaxSnapshots] = useState(3);

  useEffect(() => {
    navigation.setOptions({
      title: 'Speicher bereinigen',
      headerStyle: { backgroundColor: '#0891b2' },
      headerTintColor: '#fff',
      headerLeft: () => (
        <TouchableOpacity
          onPress={() => {
            if (router.canGoBack()) router.back();
            else router.replace('/settings/');
          }}
          style={{ paddingHorizontal: 10, paddingVertical: 6, flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 16 }}
        >
          <Ionicons name="chevron-back" size={18} color="#0891b2" />
          <Text style={{ color: '#0891b2', fontWeight: '700', fontSize: 13 }}>Zurück</Text>
        </TouchableOpacity>
      ),
    });
  }, [navigation]);

  const runAnalysis = async (label = 'Speicher wird analysiert…') => {
    setBusy(true);
    setBusyLabel(label);
    try {
      const result = await analyzeStorage();
      setAnalysis(result);
    } catch (e) {
      console.error('[Storage] Analyse fehlgeschlagen:', e);
      showInfo('Fehler', 'Speicher-Analyse fehlgeschlagen.');
    } finally {
      setBusy(false);
      setBusyLabel('');
    }
  };

  useFocusEffect(
    useCallback(() => {
      runAnalysis();
      AsyncStorage.getItem(MAX_SNAPSHOTS_KEY).then(v => {
        const n = v ? parseInt(v, 10) : NaN;
        if (n >= 1 && n <= 3) setMaxSnapshots(n);
      }).catch(() => {});
    }, [])
  );

  // Backup-Datei erstellen (Sicherheit VOR der Bereinigung)
  const handleBackupFirst = async () => {
    setBusy(true);
    setBusyLabel('Backup-Datei wird erstellt…');
    try {
      const res = await BackupService.exportFullBackup();
      showInfo('✅ Backup erstellt', `Backup-Datei (${fmtSize(res.sizeBytes)}) wurde erstellt und kann in iCloud/Drive gespeichert werden.`);
    } catch (e: any) {
      showInfo('Fehler', 'Backup fehlgeschlagen: ' + (e?.message || ''));
    } finally {
      setBusy(false);
      setBusyLabel('');
    }
  };

  // Sichere Bereinigung: verwaiste Daten + temporäre Dateien
  const handleCleanup = () => {
    if (!analysis) return;
    const freeable = analysis.orphanBytes + analysis.cacheBytes;
    confirmAction(
      'Speicher bereinigen',
      `Es werden NUR nachweislich nicht mehr benötigte Daten entfernt:\n\n• ${analysis.orphanCount} verwaiste Einträge (${fmtSize(analysis.orphanBytes)})\n• ${analysis.cacheCount} temporäre Dateien (${fmtSize(analysis.cacheBytes)})\n\nProjekte, Kunden, Fotos und Skizzen bleiben vollständig erhalten.`,
      `${fmtSize(freeable)} freigeben`,
      async () => {
        setBusy(true);
        setBusyLabel('Speicher wird bereinigt…');
        try {
          const res = await cleanupSafe(analysis);
          await runAnalysis('Ergebnis wird geprüft…');
          showInfo('✅ Bereinigung abgeschlossen', `${fmtSize(res.freedBytes)} Speicher freigegeben.\n(${res.removedKeys} verwaiste Einträge, ${res.removedFiles} temporäre Dateien entfernt)`);
        } catch (e: any) {
          showInfo('Fehler', 'Bereinigung fehlgeschlagen: ' + (e?.message || ''));
          setBusy(false);
          setBusyLabel('');
        }
      }
    );
  };

  // Papierkorb sofort endgültig leeren
  const handleEmptyTrash = () => {
    if (!analysis) return;
    confirmAction(
      'Papierkorb endgültig leeren',
      `${analysis.trashCount} ${analysis.trashCount === 1 ? 'Projekt' : 'Projekte'} im Papierkorb werden ENDGÜLTIG gelöscht – inkl. aller Fotos, Skizzen und Dokumente (ca. ${fmtSize(analysis.trashBytes)}).\n\nDies kann nicht rückgängig gemacht werden!`,
      'Endgültig löschen',
      async () => {
        setBusy(true);
        setBusyLabel('Papierkorb wird geleert…');
        try {
          const before = analysis.totalBytes;
          const count = await emptyTrashNow();
          const after = await analyzeStorage();
          setAnalysis(after);
          showInfo('✅ Papierkorb geleert', `${count} ${count === 1 ? 'Projekt' : 'Projekte'} endgültig gelöscht – ${fmtSize(Math.max(0, before - after.totalBytes))} freigegeben.`);
        } catch (e: any) {
          showInfo('Fehler', 'Leeren fehlgeschlagen: ' + (e?.message || ''));
        } finally {
          setBusy(false);
          setBusyLabel('');
        }
      }
    );
  };

  // Alle automatischen Backups löschen
  const handleClearSnapshots = () => {
    if (!analysis) return;
    confirmAction(
      'Automatische Backups löschen',
      `Alle ${analysis.snapshotCount} automatischen Backups (${fmtSize(analysis.snapshotBytes)}) werden gelöscht.\n\nDeine aktiven Daten bleiben vollständig erhalten. Das nächste automatische Backup wird beim nächsten wöchentlichen Termin neu erstellt.\n\nTipp: Erstelle vorher eine Backup-Datei (Button oben).`,
      'Backups löschen',
      async () => {
        setBusy(true);
        setBusyLabel('Backups werden gelöscht…');
        try {
          const before = analysis.totalBytes;
          await BackupService.clearAllAutoSnapshots();
          const after = await analyzeStorage();
          setAnalysis(after);
          showInfo('✅ Backups gelöscht', `${fmtSize(Math.max(0, before - after.totalBytes))} Speicher freigegeben.`);
        } catch (e: any) {
          showInfo('Fehler', 'Löschen fehlgeschlagen: ' + (e?.message || ''));
        } finally {
          setBusy(false);
          setBusyLabel('');
        }
      }
    );
  };

  const setSnapshotLimit = async (n: number) => {
    setMaxSnapshots(n);
    await AsyncStorage.setItem(MAX_SNAPSHOTS_KEY, String(n)).catch(() => {});
  };

  const freeable = analysis ? analysis.orphanBytes + analysis.cacheBytes : 0;

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {busy && (
        <View style={styles.busyOverlay}>
          <ActivityIndicator size="large" color="#0891b2" />
          <Text style={styles.busyText}>{busyLabel}</Text>
        </View>
      )}
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        {/* Sicherheitshinweis + Backup zuerst */}
        <View style={[styles.section, { backgroundColor: '#fffbeb', borderColor: '#fde68a' }]}>
          <View style={styles.rowCenter}>
            <Ionicons name="shield-checkmark-outline" size={20} color="#d97706" />
            <Text style={[styles.sectionTitle, { color: '#92400e' }]}>Erst sichern, dann bereinigen</Text>
          </View>
          <Text style={[styles.sectionSub, { color: '#92400e' }]}>
            Erstelle vor jeder Bereinigung eine Backup-Datei und speichere sie in iCloud Drive oder Google Drive.
          </Text>
          <TouchableOpacity style={[styles.bigBtn, { backgroundColor: '#d97706' }]} onPress={handleBackupFirst} testID="storage-backup-first">
            <Ionicons name="save-outline" size={18} color="#fff" />
            <Text style={styles.bigBtnText}>Backup-Datei erstellen &amp; teilen</Text>
          </TouchableOpacity>
        </View>

        {/* Analyse-Übersicht */}
        <View style={styles.section}>
          <View style={styles.rowCenter}>
            <Ionicons name="pie-chart-outline" size={20} color="#0891b2" />
            <Text style={styles.sectionTitle}>Speicherbelegung</Text>
          </View>
          {!analysis ? (
            <Text style={styles.sectionSub}>Analyse läuft…</Text>
          ) : (
            <View style={{ marginTop: 6 }}>
              <View style={styles.statRow}>
                <Text style={styles.statLabel}>Aktive Daten (Projekte, Fotos, Skizzen …)</Text>
                <Text style={styles.statValue}>{fmtSize(analysis.liveBytes)}</Text>
              </View>
              <View style={styles.statRow}>
                <Text style={styles.statLabel}>Automatische Backups ({analysis.snapshotCount})</Text>
                <Text style={styles.statValue}>{fmtSize(analysis.snapshotBytes)}</Text>
              </View>
              <View style={styles.statRow}>
                <Text style={styles.statLabel}>Papierkorb ({analysis.trashCount} {analysis.trashCount === 1 ? 'Projekt' : 'Projekte'})</Text>
                <Text style={styles.statValue}>{fmtSize(analysis.trashBytes)}</Text>
              </View>
              <View style={styles.statRow}>
                <Text style={[styles.statLabel, { color: '#dc2626' }]}>Verwaiste Daten ({analysis.orphanCount})</Text>
                <Text style={[styles.statValue, { color: '#dc2626' }]}>{fmtSize(analysis.orphanBytes)}</Text>
              </View>
              <View style={styles.statRow}>
                <Text style={[styles.statLabel, { color: '#dc2626' }]}>Temporäre Dateien ({analysis.cacheCount})</Text>
                <Text style={[styles.statValue, { color: '#dc2626' }]}>{fmtSize(analysis.cacheBytes)}</Text>
              </View>
              <View style={[styles.statRow, { borderTopWidth: 1, borderTopColor: '#e2e8f0', paddingTop: 10, marginTop: 4 }]}>
                <Text style={[styles.statLabel, { fontWeight: '800', color: '#0f172a' }]}>Gesamt</Text>
                <Text style={[styles.statValue, { fontWeight: '800' }]}>{fmtSize(analysis.totalBytes)}</Text>
              </View>
            </View>
          )}
          <TouchableOpacity style={styles.smallBtn} onPress={() => runAnalysis()} testID="storage-reanalyze">
            <Ionicons name="refresh-outline" size={15} color="#475569" />
            <Text style={styles.smallBtnText}>Neu analysieren</Text>
          </TouchableOpacity>
        </View>

        {/* Sichere Bereinigung */}
        <View style={styles.section}>
          <View style={styles.rowCenter}>
            <Ionicons name="sparkles-outline" size={20} color="#16a34a" />
            <Text style={styles.sectionTitle}>Sichere Bereinigung</Text>
          </View>
          <Text style={styles.sectionSub}>
            Entfernt ausschließlich verwaiste Daten und temporäre Dateien. Projekte, Kunden, Fotos, Skizzen und Backups bleiben vollständig erhalten.
          </Text>
          <TouchableOpacity
            style={[styles.bigBtn, { backgroundColor: freeable > 0 ? '#16a34a' : '#cbd5e1' }]}
            disabled={!analysis || freeable === 0}
            onPress={handleCleanup}
            testID="storage-cleanup"
          >
            <Ionicons name="trash-bin-outline" size={18} color="#fff" />
            <Text style={styles.bigBtnText}>
              {freeable > 0 ? `Jetzt bereinigen (${fmtSize(freeable)})` : 'Nichts zu bereinigen'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Papierkorb */}
        {!!analysis && analysis.trashCount > 0 && (
          <View style={styles.section}>
            <View style={styles.rowCenter}>
              <Ionicons name="trash-outline" size={20} color="#dc2626" />
              <Text style={styles.sectionTitle}>Papierkorb jetzt leeren</Text>
            </View>
            <Text style={styles.sectionSub}>
              Gelöschte Projekte bleiben normalerweise 30 Tage im Papierkorb und belegen so lange weiter Speicher. Hier kannst du sie sofort endgültig entfernen.
            </Text>
            <TouchableOpacity style={[styles.bigBtn, { backgroundColor: '#dc2626' }]} onPress={handleEmptyTrash} testID="storage-empty-trash">
              <Ionicons name="trash" size={18} color="#fff" />
              <Text style={styles.bigBtnText}>
                {analysis.trashCount} {analysis.trashCount === 1 ? 'Projekt' : 'Projekte'} endgültig löschen ({fmtSize(analysis.trashBytes)})
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Automatische Backups */}
        <View style={styles.section}>
          <View style={styles.rowCenter}>
            <Ionicons name="layers-outline" size={20} color="#0891b2" />
            <Text style={styles.sectionTitle}>Automatische Backups</Text>
          </View>
          <Text style={styles.sectionSub}>
            ⚠️ Jedes automatische Backup ist eine VOLLSTÄNDIGE Kopie aller Daten inkl. Fotos. Bei 3 aufbewahrten Backups belegt die App bis zu 4× so viel Speicher wie die eigentlichen Daten!
          </Text>
          <Text style={[styles.sectionSub, { marginBottom: 8 }]}>Anzahl aufbewahrter Backups:</Text>
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
            {[1, 2, 3].map(n => (
              <TouchableOpacity
                key={n}
                testID={`snapshot-limit-${n}`}
                onPress={() => setSnapshotLimit(n)}
                style={[styles.limitChip, maxSnapshots === n && styles.limitChipActive]}
              >
                <Text style={[styles.limitChipText, maxSnapshots === n && { color: '#fff' }]}>{n}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {!!analysis && analysis.snapshotCount > 0 && (
            <TouchableOpacity style={[styles.bigBtn, { backgroundColor: '#64748b' }]} onPress={handleClearSnapshots} testID="storage-clear-snapshots">
              <Ionicons name="close-circle-outline" size={18} color="#fff" />
              <Text style={styles.bigBtnText}>
                Alle {analysis.snapshotCount} Backups löschen ({fmtSize(analysis.snapshotBytes)})
              </Text>
            </TouchableOpacity>
          )}
        </View>

        <Text style={styles.footer}>
          ℹ️ Die Bereinigung entfernt niemals aktive Projekte, Kunden, Fotos oder Skizzen. Nach dem Löschen kann das Betriebssystem einige Minuten brauchen, bis der freigegebene Speicher in den Einstellungen angezeigt wird.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  busyOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(248,250,252,0.85)', alignItems: 'center', justifyContent: 'center', zIndex: 100 },
  busyText: { marginTop: 12, fontSize: 14, fontWeight: '600', color: '#0f172a', textAlign: 'center', paddingHorizontal: 30 },
  section: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: '#e2e8f0' },
  rowCenter: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: '#0f172a' },
  sectionSub: { fontSize: 12, color: '#64748b', lineHeight: 17, marginBottom: 12 },
  statRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 7 },
  statLabel: { fontSize: 13, color: '#475569', flex: 1, paddingRight: 8 },
  statValue: { fontSize: 13, fontWeight: '700', color: '#0f172a' },
  bigBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 13, borderRadius: 12 },
  bigBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  smallBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: '#f1f5f9' },
  smallBtnText: { color: '#475569', fontWeight: '700', fontSize: 12 },
  limitChip: { flex: 1, paddingVertical: 10, borderRadius: 10, backgroundColor: '#f1f5f9', alignItems: 'center' },
  limitChipActive: { backgroundColor: '#0891b2' },
  limitChipText: { fontSize: 15, fontWeight: '800', color: '#475569' },
  footer: { fontSize: 11, color: '#94a3b8', lineHeight: 16, textAlign: 'center', paddingHorizontal: 10 },
});

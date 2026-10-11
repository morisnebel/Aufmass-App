import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Platform, Alert } from 'react-native';
import { useNavigation, useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getArchiveLog, removeArchiveEntry, ArchiveEntry } from '../services/ArchiveLog';

const fmtDate = (iso: string): string => {
  try {
    const d = new Date(iso);
    return `${d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })}, ${d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr`;
  } catch {
    return iso;
  }
};

export default function ArchiveScreen() {
  const navigation = useNavigation();
  const router = useRouter();
  const [entries, setEntries] = useState<ArchiveEntry[]>([]);

  useEffect(() => {
    navigation.setOptions({
      title: 'Archiv-Übersicht',
      headerStyle: { backgroundColor: '#d97706' },
      headerTintColor: '#fff',
      headerLeft: () => (
        <TouchableOpacity
          onPress={() => {
            if (router.canGoBack()) router.back();
            else router.replace('/settings/');
          }}
          style={{ paddingHorizontal: 10, paddingVertical: 6, flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 16 }}
        >
          <Ionicons name="chevron-back" size={18} color="#d97706" />
          <Text style={{ color: '#d97706', fontWeight: '700', fontSize: 13 }}>Zurück</Text>
        </TouchableOpacity>
      ),
    });
  }, [navigation]);

  const load = async () => setEntries(await getArchiveLog());

  useFocusEffect(useCallback(() => { load(); }, []));

  const handleRemove = (entry: ArchiveEntry) => {
    const doRemove = async () => {
      await removeArchiveEntry(entry.key);
      await load();
    };
    if (Platform.OS === 'web') {
      // eslint-disable-next-line no-alert
      if (window.confirm(`Eintrag „${entry.name}" aus der Übersicht entfernen?\n(Die Archiv-Datei selbst bleibt unberührt.)`)) doRemove();
    } else {
      Alert.alert('Eintrag entfernen', `„${entry.name}" aus der Übersicht entfernen?\n(Die Archiv-Datei selbst bleibt unberührt.)`, [
        { text: 'Abbrechen', style: 'cancel' },
        { text: 'Entfernen', style: 'destructive', onPress: doRemove },
      ]);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <View style={styles.infoBox}>
          <Ionicons name="information-circle-outline" size={20} color="#92400e" />
          <Text style={styles.infoText}>
            Archivierte Projekte wurden als Datei exportiert und aus der App entfernt.
            Zum Wiederherstellen die Archiv-Datei (z. B. aus iCloud Drive) über {'„Importieren"'} auf der Startseite einlesen.
          </Text>
        </View>

        {entries.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="archive-outline" size={48} color="#cbd5e1" />
            <Text style={styles.emptyText}>Noch keine Projekte archiviert</Text>
            <Text style={styles.emptySub}>
              Archivieren findest du in der Projektansicht oder über {'„Select"'} auf der Startseite.
            </Text>
          </View>
        ) : (
          entries.map(e => (
            <View key={e.key} style={styles.card} testID={`archive-entry-${e.key}`}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={styles.cardIcon}>
                  <Ionicons name="archive" size={20} color="#d97706" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle} numberOfLines={1}>{e.name}</Text>
                  {!!e.project_number && <Text style={styles.cardSub}>Nr. {e.project_number}</Text>}
                  <Text style={styles.cardDate}>Archiviert: {fmtDate(e.archived_at)}</Text>
                  <Text style={styles.cardFile} numberOfLines={1}>📄 {e.fileName}</Text>
                </View>
                <TouchableOpacity
                  testID={`archive-remove-${e.key}`}
                  onPress={() => handleRemove(e)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  style={{ padding: 6 }}
                >
                  <Ionicons name="close" size={18} color="#94a3b8" />
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  infoBox: { flexDirection: 'row', gap: 10, backgroundColor: '#fffbeb', borderWidth: 1, borderColor: '#fde68a', borderRadius: 12, padding: 12, marginBottom: 16 },
  infoText: { flex: 1, fontSize: 12, color: '#92400e', lineHeight: 17 },
  empty: { alignItems: 'center', paddingVertical: 50, gap: 8 },
  emptyText: { fontSize: 15, fontWeight: '700', color: '#64748b' },
  emptySub: { fontSize: 12, color: '#94a3b8', textAlign: 'center', paddingHorizontal: 30, lineHeight: 17 },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: '#e2e8f0' },
  cardIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#fef3c7', alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontSize: 15, fontWeight: '800', color: '#0f172a' },
  cardSub: { fontSize: 12, color: '#64748b', marginTop: 1 },
  cardDate: { fontSize: 12, color: '#475569', marginTop: 3 },
  cardFile: { fontSize: 11, color: '#94a3b8', marginTop: 2 },
});

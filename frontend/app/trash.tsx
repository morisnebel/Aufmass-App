// Papierkorb: Gelöschte oder beim Sync ersetzte Projekte bleiben 30 Tage
// wiederherstellbar und werden danach automatisch endgültig gelöscht.
import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useNavigation, useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ProjectService, Project } from '../services/LocalStorage';

const TRASH_DAYS = 30;

const fmtDate = (iso: string): string => {
  const d = new Date(iso);
  return `${d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })}, ${d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr`;
};

const daysLeft = (deletedAt: string): number => {
  const elapsed = Date.now() - new Date(deletedAt).getTime();
  return Math.max(0, TRASH_DAYS - Math.floor(elapsed / (24 * 60 * 60 * 1000)));
};

export default function TrashScreen() {
  const navigation = useNavigation();
  const router = useRouter();
  const [trashed, setTrashed] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    navigation.setOptions({
      title: 'Papierkorb',
      headerStyle: { backgroundColor: '#64748b' },
      headerTintColor: '#fff',
      headerLeft: () => (
        <TouchableOpacity
          onPress={() => {
            if (router.canGoBack()) router.back();
            else router.replace('/settings/');
          }}
          style={stylesHeader.backBtn}
        >
          <Ionicons name="chevron-back" size={20} color="#334155" />
          <Text style={stylesHeader.backText}>Zurück</Text>
        </TouchableOpacity>
      ),
    });
  }, [navigation, router]);

  const load = useCallback(async () => {
    try {
      // Abgelaufene Einträge direkt beim Öffnen endgültig entfernen
      await ProjectService.purgeExpiredTrash(TRASH_DAYS);
      const items = await ProjectService.getTrashed();
      setTrashed(items);
    } catch (e) {
      console.error('[Papierkorb] Laden fehlgeschlagen:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const handleRestore = async (project: Project) => {
    setBusyId(project.id);
    try {
      await ProjectService.restoreFromTrash(project.id);
      await load();
      Alert.alert('Wiederhergestellt', `„${project.name}" ist wieder in der Projektliste verfügbar.`);
    } catch (e) {
      console.error('[Papierkorb] Wiederherstellen fehlgeschlagen:', e);
      Alert.alert('Fehler', 'Das Projekt konnte nicht wiederhergestellt werden.');
    } finally {
      setBusyId(null);
    }
  };

  const handleDeleteForever = (project: Project) => {
    Alert.alert(
      'Endgültig löschen',
      `„${project.name}" wird unwiderruflich gelöscht – inklusive aller Fotos, Skizzen und Berichte.\n\nFortfahren?`,
      [
        { text: 'Abbrechen', style: 'cancel' },
        {
          text: 'Endgültig löschen',
          style: 'destructive',
          onPress: async () => {
            setBusyId(project.id);
            try {
              await ProjectService.delete(project.id);
              await load();
            } catch (e) {
              console.error('[Papierkorb] Löschen fehlgeschlagen:', e);
              Alert.alert('Fehler', 'Das Projekt konnte nicht gelöscht werden.');
            } finally {
              setBusyId(null);
            }
          },
        },
      ]
    );
  };

  const renderItem = ({ item }: { item: Project }) => {
    const remaining = item.deleted_at ? daysLeft(item.deleted_at) : 0;
    const busy = busyId === item.id;
    return (
      <View style={styles.card} testID={`trash-item-${item.id}`}>
        <View style={styles.cardHeader}>
          <Ionicons name="folder-outline" size={20} color="#64748b" />
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle} numberOfLines={1}>{item.name}</Text>
            {!!item.deleted_at && (
              <Text style={styles.cardSub}>Gelöscht: {fmtDate(item.deleted_at)}</Text>
            )}
          </View>
          <View style={[styles.daysBadge, remaining <= 5 && styles.daysBadgeWarn]}>
            <Text style={[styles.daysBadgeText, remaining <= 5 && styles.daysBadgeTextWarn]}>
              {remaining === 0 ? 'läuft heute ab' : `noch ${remaining} Tag${remaining === 1 ? '' : 'e'}`}
            </Text>
          </View>
        </View>
        <View style={styles.cardActions}>
          <TouchableOpacity
            testID={`trash-restore-${item.id}`}
            style={[styles.actionBtn, styles.restoreBtn]}
            onPress={() => handleRestore(item)}
            disabled={busy}
          >
            {busy ? (
              <ActivityIndicator size="small" color="#2e7d32" />
            ) : (
              <>
                <Ionicons name="refresh-outline" size={16} color="#2e7d32" />
                <Text style={styles.restoreBtnText}>Wiederherstellen</Text>
              </>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            testID={`trash-delete-${item.id}`}
            style={[styles.actionBtn, styles.deleteBtn]}
            onPress={() => handleDeleteForever(item)}
            disabled={busy}
          >
            <Ionicons name="trash-outline" size={16} color="#dc2626" />
            <Text style={styles.deleteBtnText}>Endgültig löschen</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <View style={styles.infoBanner}>
        <Ionicons name="information-circle-outline" size={16} color="#475569" />
        <Text style={styles.infoBannerText}>
          Gelöschte oder beim Import ersetzte Projekte bleiben {TRASH_DAYS} Tage wiederherstellbar und werden danach automatisch endgültig gelöscht.
        </Text>
      </View>
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#64748b" />
        </View>
      ) : (
        <FlatList
          data={trashed}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.center}>
              <Ionicons name="trash-outline" size={56} color="#cbd5e1" />
              <Text style={styles.emptyTitle}>Papierkorb ist leer</Text>
              <Text style={styles.emptySub}>Gelöschte Projekte erscheinen hier.</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const stylesHeader = StyleSheet.create({
  backBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 16,
    marginLeft: 4,
  },
  backText: {
    color: '#334155',
    fontSize: 14,
    fontWeight: '600',
  },
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#e2e8f0',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  infoBannerText: {
    flex: 1,
    fontSize: 12.5,
    color: '#475569',
    lineHeight: 17,
  },
  list: {
    padding: 12,
    gap: 10,
    flexGrow: 1,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 60,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#64748b',
    marginTop: 12,
  },
  emptySub: {
    fontSize: 13,
    color: '#94a3b8',
    marginTop: 4,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1e293b',
  },
  cardSub: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 2,
  },
  daysBadge: {
    backgroundColor: '#f1f5f9',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  daysBadgeWarn: {
    backgroundColor: '#fee2e2',
  },
  daysBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748b',
  },
  daysBadgeTextWarn: {
    color: '#dc2626',
  },
  cardActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 9,
    borderRadius: 8,
    minHeight: 40,
  },
  restoreBtn: {
    backgroundColor: '#e8f5e9',
  },
  restoreBtnText: {
    color: '#2e7d32',
    fontSize: 13,
    fontWeight: '600',
  },
  deleteBtn: {
    backgroundColor: '#fef2f2',
  },
  deleteBtnText: {
    color: '#dc2626',
    fontSize: 13,
    fontWeight: '600',
  },
});

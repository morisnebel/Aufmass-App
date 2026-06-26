import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Modal, ScrollView, TouchableOpacity, Linking } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { SettingsService } from '../../services/LocalStorage';

const DISCLAIMER_VERSION = '2026-06';
const CONTACT_EMAIL = 'aufmassprofi.app@gmail.com';

/**
 * Einmaliger Haftungsausschluss-Dialog beim ersten App-Start
 * (oder wenn sich die Version des Haftungsausschlusses ändert)
 *
 * Wird auch über `useDisclaimerGate` Hook abgefragt
 */
export const DisclaimerGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [needsConsent, setNeedsConsent] = useState<boolean | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [scrollEndReached, setScrollEndReached] = useState(false);
  const router = useRouter();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    let mounted = true;
    SettingsService.get()
      .then((s) => {
        if (!mounted) return;
        const acceptedAt = (s as any).disclaimer_accepted_at;
        const version = (s as any).disclaimer_version;
        // Anzeigen wenn noch nie akzeptiert ODER alte Version
        if (!acceptedAt || version !== DISCLAIMER_VERSION) {
          setNeedsConsent(true);
        } else {
          setNeedsConsent(false);
        }
      })
      .catch(() => mounted && setNeedsConsent(false));
    return () => { mounted = false; };
  }, []);

  const handleAccept = async () => {
    if (!accepted) return;
    try {
      await SettingsService.update({
        disclaimer_accepted_at: new Date().toISOString(),
        disclaimer_version: DISCLAIMER_VERSION,
      } as any);
      setNeedsConsent(false);
    } catch (e) {
      console.error('[Disclaimer] Could not save consent', e);
    }
  };

  // Solange wir noch laden, einfach die Kinder anzeigen
  if (needsConsent === null || needsConsent === false) {
    return <>{children}</>;
  }

  return (
    <>
      {children}
      <Modal visible animationType="slide" transparent={false} statusBarTranslucent>
        <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerIcon}>
              <Ionicons name="warning" size={28} color="#fff" />
            </View>
            <Text style={styles.headerTitle}>Willkommen bei Aufmassprofi</Text>
            <Text style={styles.headerSubtitle}>Bitte lies vor der Nutzung den Haftungsausschluss</Text>
          </View>

          {/* Scrollable Content */}
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={[styles.scrollContent, { paddingBottom: 20 }]}
            onScroll={({ nativeEvent }) => {
              const { layoutMeasurement, contentOffset, contentSize } = nativeEvent;
              const padding = 40;
              if (layoutMeasurement.height + contentOffset.y >= contentSize.height - padding) {
                setScrollEndReached(true);
              }
            }}
            scrollEventThrottle={32}
          >
            <View style={styles.alertCard}>
              <View style={styles.alertHeader}>
                <Ionicons name="alert-circle" size={22} color="#dc2626" />
                <Text style={styles.alertHeaderText}>Wichtiger Hinweis zu Maßen & Berechnungen</Text>
              </View>
              <Text style={styles.alertText}>
                Die in dieser App ermittelten <Text style={styles.bold}>Maße, Berechnungen und Ergebnisse</Text> dienen ausschließlich als Unterstützung bei der <Text style={styles.bold}>Planung und Dokumentation</Text>.
              </Text>
              <Text style={styles.alertText}>
                Trotz größter Sorgfalt kann <Text style={styles.bold}>keine Gewähr</Text> für die Richtigkeit, Vollständigkeit oder Aktualität der ermittelten Daten übernommen werden.
              </Text>
              <View style={styles.divider} />
              <Text style={styles.alertText}>
                Der Nutzer ist verpflichtet, sämtliche Maße, Berechnungen und Ergebnisse <Text style={styles.bold}>vor der Verwendung eigenständig zu prüfen und zu verifizieren</Text>.
              </Text>
              <Text style={styles.alertText}>
                Für Schäden, Fehler oder Folgeschäden, die aus der Nutzung oder dem Vertrauen auf die in der App bereitgestellten Daten entstehen, wird – soweit gesetzlich zulässig – <Text style={styles.bold}>keine Haftung</Text> übernommen.
              </Text>
            </View>

            {/* Kurzfassung was die App nicht ersetzt */}
            <View style={styles.infoCard}>
              <View style={styles.infoHeader}>
                <Ionicons name="construct-outline" size={18} color="#1976d2" />
                <Text style={styles.infoTitle}>Die App ersetzt NICHT:</Text>
              </View>
              <BulletRow text="Statische Berechnungen durch einen Tragwerksplaner" />
              <BulletRow text="Bauplanung durch Architekt oder Bauingenieur" />
              <BulletRow text="Vermessung durch öffentlich bestellten Vermessungsingenieur" />
              <BulletRow text="Aufmaße zur VOB-Abrechnung" />
            </View>

            {/* Datenschutz */}
            <View style={styles.greenCard}>
              <View style={styles.infoHeader}>
                <Ionicons name="shield-checkmark" size={18} color="#16a34a" />
                <Text style={[styles.infoTitle, { color: '#15803d' }]}>100% lokale Speicherung</Text>
              </View>
              <Text style={styles.greenText}>
                Alle Daten werden ausschließlich auf deinem Gerät gespeichert. Es werden keine personenbezogenen Daten an externe Server übertragen.
              </Text>
            </View>

            {/* Links */}
            <View style={styles.linkRow}>
              <TouchableOpacity
                style={styles.linkBtn}
                onPress={() => router.push('/legal/haftung')}
              >
                <Ionicons name="document-text" size={14} color="#1976d2" />
                <Text style={styles.linkBtnText}>Vollständigen Haftungsausschluss lesen</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.linkBtn}
                onPress={() => router.push('/legal/datenschutz')}
              >
                <Ionicons name="shield-outline" size={14} color="#1976d2" />
                <Text style={styles.linkBtnText}>Datenschutzerklärung</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.linkBtn}
                onPress={() => Linking.openURL(`mailto:${CONTACT_EMAIL}?subject=Frage zur App`)}
              >
                <Ionicons name="mail-outline" size={14} color="#1976d2" />
                <Text style={styles.linkBtnText}>Fragen? Kontakt aufnehmen</Text>
              </TouchableOpacity>
            </View>

            {!scrollEndReached && (
              <View style={styles.scrollHint}>
                <Ionicons name="arrow-down-circle" size={16} color="#94a3b8" />
                <Text style={styles.scrollHintText}>Bitte ganz nach unten scrollen</Text>
              </View>
            )}
          </ScrollView>

          {/* Footer with Checkbox + Button */}
          <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) + 8 }]}>
            <TouchableOpacity
              style={[styles.checkboxRow, !scrollEndReached && { opacity: 0.4 }]}
              onPress={() => { if (scrollEndReached) setAccepted(!accepted); }}
              activeOpacity={0.7}
              disabled={!scrollEndReached}
            >
              <View style={[styles.checkbox, accepted && styles.checkboxChecked]}>
                {accepted && <Ionicons name="checkmark" size={18} color="#fff" />}
              </View>
              <Text style={styles.checkboxLabel}>
                Ich habe den Haftungsausschluss gelesen und akzeptiere ihn.
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.acceptBtn, !accepted && styles.acceptBtnDisabled]}
              onPress={handleAccept}
              disabled={!accepted}
              activeOpacity={0.8}
            >
              <Ionicons name="checkmark-circle" size={20} color="#fff" />
              <Text style={styles.acceptBtnText}>App starten</Text>
            </TouchableOpacity>

            <Text style={styles.versionLabel}>Stand: Juni 2026 · v{DISCLAIMER_VERSION}</Text>
          </View>
        </SafeAreaView>
      </Modal>
    </>
  );
};

const BulletRow: React.FC<{ text: string }> = ({ text }) => (
  <View style={styles.bulletRow}>
    <Text style={styles.bulletDot}>•</Text>
    <Text style={styles.bulletText}>{text}</Text>
  </View>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  header: { backgroundColor: '#1976d2', padding: 20, alignItems: 'center' },
  headerIcon: { width: 56, height: 56, borderRadius: 28, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  headerTitle: { fontSize: 18, fontWeight: '800', color: '#fff' },
  headerSubtitle: { fontSize: 12, color: 'rgba(255,255,255,0.85)', marginTop: 4, textAlign: 'center', paddingHorizontal: 20 },
  scroll: { flex: 1 },
  scrollContent: { padding: 16 },
  alertCard: { backgroundColor: '#fef2f2', borderRadius: 12, padding: 14, marginBottom: 12, borderWidth: 2, borderColor: '#dc2626' },
  alertHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: '#fecaca' },
  alertHeaderText: { fontSize: 14, fontWeight: '800', color: '#991b1b', flex: 1 },
  alertText: { fontSize: 13, color: '#7f1d1d', lineHeight: 19, marginBottom: 6 },
  divider: { height: 1, backgroundColor: '#fecaca', marginVertical: 6 },
  bold: { fontWeight: '800', color: '#991b1b' },
  infoCard: { backgroundColor: '#fff', borderRadius: 10, padding: 12, marginBottom: 10, borderWidth: 1, borderColor: '#e2e8f0' },
  infoHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  infoTitle: { fontSize: 13, fontWeight: '700', color: '#1976d2' },
  greenCard: { backgroundColor: '#dcfce7', borderRadius: 10, padding: 12, marginBottom: 10, borderWidth: 1, borderColor: '#86efac' },
  greenText: { fontSize: 12.5, color: '#15803d', lineHeight: 18 },
  bulletRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: 2 },
  bulletDot: { fontSize: 13, color: '#ea580c', fontWeight: '800', lineHeight: 18 },
  bulletText: { fontSize: 12.5, color: '#334155', lineHeight: 18, flex: 1 },
  linkRow: { gap: 6, marginTop: 4 },
  linkBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 10, backgroundColor: '#f0f9ff', borderRadius: 8, borderWidth: 1, borderColor: '#bae6fd' },
  linkBtnText: { fontSize: 12, color: '#0369a1', fontWeight: '600' },
  scrollHint: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 12, marginBottom: 4 },
  scrollHintText: { fontSize: 11, color: '#94a3b8', fontStyle: 'italic' },
  footer: { padding: 12, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#e2e8f0', gap: 10 },
  checkboxRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 4 },
  checkbox: { width: 26, height: 26, borderRadius: 6, borderWidth: 2, borderColor: '#94a3b8', alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  checkboxChecked: { backgroundColor: '#16a34a', borderColor: '#16a34a' },
  checkboxLabel: { fontSize: 13, color: '#0f172a', flex: 1, lineHeight: 19, fontWeight: '600' },
  acceptBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#16a34a', borderRadius: 12, paddingVertical: 14 },
  acceptBtnDisabled: { backgroundColor: '#cbd5e1' },
  acceptBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  versionLabel: { textAlign: 'center', fontSize: 10, color: '#94a3b8' },
});

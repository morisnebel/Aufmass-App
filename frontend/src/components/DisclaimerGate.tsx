import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, Linking, DeviceEventEmitter } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@react-native-vector-icons/ionicons';
import { useRouter, usePathname } from 'expo-router';
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
  const router = useRouter();
  const insets = useSafeAreaInsets();
  // Während eine Rechtsseite geöffnet ist, Karte ausblenden (sonst nicht lesbar)
  const pathname = usePathname();
  const onLegalPage = (pathname || '').startsWith('/legal');

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
      DeviceEventEmitter.emit('disclaimer-accepted');
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
      {/* Dezenter Willkommens-Hinweis: kompakte Karte statt Vollbild */}
      <Modal visible={!onLegalPage} animationType="fade" transparent statusBarTranslucent>
        <View style={styles.backdrop}>
          <View style={[styles.sheet, { marginBottom: Math.max(insets.bottom, 16) }]}>
            <Text style={styles.headerTitle}>Willkommen bei Aufmassprofi 👋</Text>
            <View style={styles.noteRow}>
              <Ionicons name="information-circle-outline" size={16} color="#64748b" />
              <Text style={styles.noteText}>
                Maße und Berechnungen dienen als Unterstützung – bitte vor der Verwendung selbst prüfen.
                Die App ersetzt keine Statik, Bauplanung oder amtliche Vermessung.
              </Text>
            </View>
            <View style={styles.noteRow}>
              <Ionicons name="shield-checkmark-outline" size={16} color="#16a34a" />
              <Text style={styles.noteText}>Alle Daten bleiben ausschließlich auf deinem Gerät.</Text>
            </View>
            <View style={styles.linkRow}>
              <TouchableOpacity testID="disclaimer-link-haftung" style={styles.linkBtn} onPress={() => router.push('/legal/haftung')}>
                <Text style={styles.linkText}>Haftungsausschluss</Text>
              </TouchableOpacity>
              <Text style={styles.linkSep}>·</Text>
              <TouchableOpacity testID="disclaimer-link-datenschutz" style={styles.linkBtn} onPress={() => router.push('/legal/datenschutz')}>
                <Text style={styles.linkText}>Datenschutz</Text>
              </TouchableOpacity>
              <Text style={styles.linkSep}>·</Text>
              <TouchableOpacity testID="disclaimer-link-kontakt" style={styles.linkBtn} onPress={() => Linking.openURL(`mailto:${CONTACT_EMAIL}?subject=Frage zur App`)}>
                <Text style={styles.linkText}>Kontakt</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              testID="disclaimer-checkbox"
              style={styles.checkboxRow}
              onPress={() => setAccepted(!accepted)}
              activeOpacity={0.7}
            >
              <View style={[styles.checkbox, accepted && styles.checkboxChecked]}>
                {accepted && <Ionicons name="checkmark" size={16} color="#fff" />}
              </View>
              <Text style={styles.checkboxLabel}>Ich habe die Hinweise gelesen und akzeptiere sie.</Text>
            </TouchableOpacity>
            <TouchableOpacity
              testID="disclaimer-accept"
              style={[styles.acceptBtn, !accepted && styles.acceptBtnDisabled]}
              onPress={handleAccept}
              disabled={!accepted}
              activeOpacity={0.8}
            >
              <Text style={styles.acceptBtnText}>App starten</Text>
            </TouchableOpacity>
            <Text style={styles.versionLabel}>Stand: Juni 2026 · v{DISCLAIMER_VERSION}</Text>
          </View>
        </View>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.35)', justifyContent: 'flex-end', alignItems: 'center', paddingHorizontal: 16 },
  sheet: { width: '100%', maxWidth: 480, backgroundColor: '#fff', borderRadius: 20, padding: 18, gap: 10 },
  headerTitle: { fontSize: 17, fontWeight: '800', color: '#0f172a' },
  noteRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  noteText: { flex: 1, fontSize: 12.5, color: '#475569', lineHeight: 18 },
  linkRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
  linkBtn: { minHeight: 44, justifyContent: 'center' },
  linkText: { fontSize: 12, color: '#1976d2', fontWeight: '600', paddingVertical: 4 },
  linkSep: { fontSize: 12, color: '#94a3b8' },
  checkboxRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 },
  checkbox: { width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: '#94a3b8', alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  checkboxChecked: { backgroundColor: '#16a34a', borderColor: '#16a34a' },
  checkboxLabel: { fontSize: 13, color: '#0f172a', flex: 1 },
  acceptBtn: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#1976d2', borderRadius: 12, minHeight: 48 },
  acceptBtnDisabled: { backgroundColor: '#cbd5e1' },
  acceptBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  versionLabel: { textAlign: 'center', fontSize: 10, color: '#94a3b8' },
});

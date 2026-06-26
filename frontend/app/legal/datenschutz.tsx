import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Linking, Platform } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

const PRIVACY_URL = 'https://nebel-bedachung.de/Aufmassprofi-Datenschutz-Impressum';
const CONTACT_EMAIL = 'aufmassprofi.app@gmail.com';

export default function DatenschutzScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Stack.Screen
        options={{
          title: 'Datenschutz',
          headerStyle: { backgroundColor: '#1976d2' },
          headerTintColor: '#fff',
          headerLeft: () => (
            <TouchableOpacity onPress={() => router.back()} style={{ paddingHorizontal: 8 }}>
              <Ionicons name="chevron-back" size={26} color="#fff" />
            </TouchableOpacity>
          ),
        }}
      />
      <ScrollView contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 20 }]}>
        {/* Hero */}
        <View style={styles.hero}>
          <View style={styles.heroIcon}>
            <Ionicons name="shield-checkmark" size={32} color="#16a34a" />
          </View>
          <Text style={styles.title}>Datenschutzerklärung</Text>
          <Text style={styles.subtitle}>Aufmassprofi App</Text>
          <Text style={styles.dateInfo}>Stand: Juni 2026</Text>
        </View>

        {/* Highlight: Offline */}
        <View style={styles.highlightCard}>
          <Ionicons name="lock-closed" size={20} color="#16a34a" />
          <View style={{ flex: 1 }}>
            <Text style={styles.highlightTitle}>100% lokale Speicherung</Text>
            <Text style={styles.highlightText}>
              Alle Daten (Projekte, Skizzen, Fotos, Rapporte) werden ausschließlich auf deinem Gerät gespeichert. Es findet KEINE Übertragung an externe Server statt.
            </Text>
          </View>
        </View>

        {/* Verantwortlicher */}
        <Section icon="business-outline" title="1. Verantwortliche Stelle">
          <Text style={styles.text}>
            Verantwortlich für die Datenverarbeitung im Sinne der EU-Datenschutzgrundverordnung (DSGVO) ist:
          </Text>
          <View style={styles.addressBox}>
            <Text style={styles.addressBold}>Nebel-Bedachung</Text>
            <Text style={styles.address}>Einzelunternehmen – Inhaber: Moris Nebel</Text>
            <Text style={styles.address}>Einheit 22</Text>
            <Text style={styles.address}>37339 Leinefelde-Worbis OT Hundeshagen</Text>
            <Text style={styles.address}>Tel.: 036071 / 90272</Text>
            <Text style={styles.address}>E-Mail: {CONTACT_EMAIL}</Text>
          </View>
        </Section>

        {/* App-Berechtigungen */}
        <Section icon="key-outline" title="2. App-Berechtigungen">
          <Text style={styles.text}>
            Die App verwendet folgende Gerätefunktionen ausschließlich für die im Folgenden genannten Zwecke:
          </Text>

          <Permission
            icon="camera-outline"
            title="📷 Kamera"
            text="Aufnahme von Fotos für die Aufmaß-Dokumentation, Skizzen und Rapporte. Fotos werden ausschließlich lokal gespeichert."
          />
          <Permission
            icon="images-outline"
            title="🖼️ Fotobibliothek"
            text="Auswahl bestehender Bilder über den System-Fotopicker. Die App hat keinen Zugriff auf deine gesamte Fotobibliothek."
          />
          <Permission
            icon="folder-outline"
            title="📁 Dateien speichern"
            text="Speichern von PDF-Exporten (Aufmaß-Berichte, Rapporte) im gewählten Ordner auf deinem Gerät."
          />
        </Section>

        {/* Datenspeicherung */}
        <Section icon="server-outline" title="3. Datenspeicherung & -verarbeitung">
          <Bullet text="Alle Eingaben (Kundendaten, Projektdaten, Mitarbeiter, Material, Maschinen, Rapporte) werden in der lokalen App-Datenbank deines Geräts gespeichert (AsyncStorage / SecureStore)." />
          <Bullet text="Es findet KEINE automatische Synchronisation mit Cloud-Diensten oder Servern statt." />
          <Bullet text="Die App selbst überträgt keine personenbezogenen Daten an Dritte." />
          <Bullet text="Beim Versenden eines PDF-Berichts via E-Mail oder Cloud-Dienst ist der jeweilige Anbieter (z.B. Apple Mail, iCloud, Gmail) für die weitere Datenverarbeitung verantwortlich." />
        </Section>

        {/* Pro-Version */}
        <Section icon="diamond-outline" title="4. Pro-Version / In-App-Käufe">
          <Text style={styles.text}>
            Die Pro-Version wird – soweit verfügbar – über den Apple App Store (iOS) bzw. Google Play Store (Android) freigeschaltet. Die Kaufabwicklung erfolgt ausschließlich durch Apple bzw. Google.
            Lediglich der Freischalt-Status wird lokal in der App gespeichert.
          </Text>
        </Section>

        {/* DSGVO-Rechte */}
        <Section icon="document-text-outline" title="5. Deine Rechte nach DSGVO">
          <Text style={styles.text}>
            Da die App ausschließlich lokal arbeitet, kannst du deine Rechte direkt auf dem Gerät ausüben:
          </Text>
          <Bullet text="Recht auf Auskunft → Alle erfassten Daten siehst du jederzeit in der App." />
          <Bullet text="Recht auf Berichtigung → Du kannst jeden Datensatz direkt in der App bearbeiten." />
          <Bullet text="Recht auf Löschung → Einzelne Einträge löschen oder unter „Einstellungen → Alle Daten zurücksetzen“." />
          <Bullet text="Recht auf Datenübertragbarkeit → Alle Aufmaße & Rapporte können als PDF exportiert werden." />
          <Bullet text="Recht auf vollständige Löschung → App deinstallieren = alle Daten unwiderruflich gelöscht." />
        </Section>

        {/* Sicherheit */}
        <Section icon="shield-outline" title="6. Datensicherheit">
          <Text style={styles.text}>
            Die App nutzt die Sicherheitsmechanismen deines Betriebssystems (iOS / Android Sandbox).
            Wir empfehlen zusätzlich:
          </Text>
          <Bullet text="Aktivierung der Geräte-Sperre (Face ID / Touch ID / PIN)" />
          <Bullet text="Regelmäßige Geräte-Backups (über iCloud / Google) zur Sicherung der App-Daten" />
        </Section>

        {/* Aufsichtsbehörde */}
        <Section icon="business-outline" title="7. Beschwerderecht">
          <Text style={styles.text}>
            Du hast das Recht, dich bei einer Datenschutz-Aufsichtsbehörde über die Verarbeitung deiner personenbezogenen Daten zu beschweren.
          </Text>
          <TouchableOpacity
            onPress={() => Linking.openURL('https://www.bfdi.bund.de/DE/Infothek/Anschriften_Links/anschriften_links-node.html')}
            style={styles.linkRow}
          >
            <Ionicons name="link" size={14} color="#1976d2" />
            <Text style={styles.linkText}>Liste der Aufsichtsbehörden öffnen</Text>
          </TouchableOpacity>
        </Section>

        {/* Änderungen */}
        <Section icon="refresh-outline" title="8. Änderungen dieser Datenschutzerklärung">
          <Text style={styles.text}>
            Wir behalten uns vor, diese Datenschutzerklärung an geänderte rechtliche Anforderungen oder neue Funktionen der App anzupassen. Die jeweils aktuelle Version ist innerhalb der App unter „Einstellungen → Rechtliches" einsehbar.
          </Text>
        </Section>

        {/* Kontakt */}
        <Section icon="mail-outline" title="9. Kontakt zum Datenschutzbeauftragten">
          <Text style={styles.text}>
            Bei Fragen zum Datenschutz oder zur Ausübung deiner Rechte:
          </Text>
          <TouchableOpacity
            style={styles.contactBtn}
            onPress={() => Linking.openURL(`mailto:${CONTACT_EMAIL}?subject=Datenschutz-Anfrage Aufmassprofi`)}
          >
            <Ionicons name="mail" size={18} color="#fff" />
            <Text style={styles.contactBtnText}>{CONTACT_EMAIL}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.contactBtn, { backgroundColor: '#16a34a', marginTop: 8 }]}
            onPress={() => Linking.openURL('tel:03607190272')}
          >
            <Ionicons name="call" size={18} color="#fff" />
            <Text style={styles.contactBtnText}>036071 / 90272</Text>
          </TouchableOpacity>
        </Section>

        {/* Online-Version */}
        <TouchableOpacity
          style={styles.webLinkCard}
          onPress={() => Linking.openURL(PRIVACY_URL)}
        >
          <Ionicons name="globe-outline" size={20} color="#0369a1" />
          <View style={{ flex: 1 }}>
            <Text style={styles.webLinkTitle}>Online-Version</Text>
            <Text style={styles.webLinkSub} numberOfLines={1}>{PRIVACY_URL}</Text>
          </View>
          <Ionicons name="open-outline" size={18} color="#0369a1" />
        </TouchableOpacity>

        <Text style={styles.footerText}>© 2026 Nebel-Bedachung · Aufmassprofi</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const Section: React.FC<{ icon: any; title: string; children: React.ReactNode }> = ({ icon, title, children }) => (
  <View style={styles.section}>
    <View style={styles.sectionHeader}>
      <Ionicons name={icon} size={18} color="#1976d2" />
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
    <View style={styles.sectionBody}>{children}</View>
  </View>
);

const Bullet: React.FC<{ text: string }> = ({ text }) => (
  <View style={styles.bulletRow}>
    <Text style={styles.bulletDot}>•</Text>
    <Text style={styles.bulletText}>{text}</Text>
  </View>
);

const Permission: React.FC<{ icon: any; title: string; text: string }> = ({ icon, title, text }) => (
  <View style={styles.permRow}>
    <Text style={styles.permTitle}>{title}</Text>
    <Text style={styles.permText}>{text}</Text>
  </View>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  scrollContent: { padding: 16 },
  hero: { alignItems: 'center', paddingVertical: 16, marginBottom: 12 },
  heroIcon: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#dcfce7', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  title: { fontSize: 22, fontWeight: '800', color: '#0f172a' },
  subtitle: { fontSize: 14, color: '#475569', marginTop: 2 },
  dateInfo: { fontSize: 11, color: '#94a3b8', marginTop: 8, fontStyle: 'italic' },
  highlightCard: { flexDirection: 'row', gap: 12, backgroundColor: '#dcfce7', borderRadius: 12, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: '#16a34a' },
  highlightTitle: { fontSize: 14, fontWeight: '800', color: '#15803d' },
  highlightText: { fontSize: 13, color: '#15803d', marginTop: 2, lineHeight: 18 },
  section: { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: '#e2e8f0' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#0f172a', flex: 1 },
  sectionBody: { gap: 8 },
  text: { fontSize: 13, color: '#334155', lineHeight: 19 },
  addressBox: { backgroundColor: '#f8fafc', borderRadius: 8, padding: 12, marginTop: 6 },
  addressBold: { fontSize: 14, fontWeight: '700', color: '#0f172a', marginBottom: 4 },
  address: { fontSize: 13, color: '#475569', marginTop: 2 },
  bulletRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 4 },
  bulletDot: { fontSize: 14, color: '#1976d2', lineHeight: 19 },
  bulletText: { fontSize: 13, color: '#334155', lineHeight: 19, flex: 1 },
  permRow: { backgroundColor: '#f0f9ff', borderRadius: 8, padding: 10, marginTop: 6, borderLeftWidth: 3, borderLeftColor: '#0ea5e9' },
  permTitle: { fontSize: 13, fontWeight: '700', color: '#0c4a6e', marginBottom: 2 },
  permText: { fontSize: 12, color: '#475569', lineHeight: 17 },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  linkText: { fontSize: 13, color: '#1976d2', fontWeight: '600', textDecorationLine: 'underline' },
  contactBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#1976d2', borderRadius: 10, paddingVertical: 12, paddingHorizontal: 16, marginTop: 10 },
  contactBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  webLinkCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#e0f2fe', borderRadius: 12, padding: 14, marginTop: 4, marginBottom: 16, borderWidth: 1, borderColor: '#7dd3fc' },
  webLinkTitle: { fontSize: 13, fontWeight: '700', color: '#0369a1' },
  webLinkSub: { fontSize: 11, color: '#075985', marginTop: 2 },
  footerText: { textAlign: 'center', fontSize: 11, color: '#94a3b8', marginTop: 16 },
});

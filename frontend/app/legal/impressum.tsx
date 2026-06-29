import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Linking } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

const CONTACT_EMAIL_BUSINESS = 'info@nebel-bedachung.com';
const CONTACT_EMAIL_APP = 'aufmassprofi.app@gmail.com';

export default function ImpressumScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Stack.Screen
        options={{
          title: 'Impressum',
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
            <Ionicons name="business" size={32} color="#1976d2" />
          </View>
          <Text style={styles.title}>Impressum</Text>
          <Text style={styles.subtitle}>Angaben gem. § 5 TMG</Text>
        </View>

        {/* Betreiber */}
        <Section icon="storefront-outline" title="Betreiber und Kontakt">
          <View style={styles.addressBox}>
            <Text style={styles.addressBold}>Nebel-Bedachung</Text>
            <Text style={styles.address}>Einzelunternehmen</Text>
            <Text style={styles.address}>Inhaber: Moris Nebel</Text>
            <View style={{ height: 6 }} />
            <Text style={styles.address}>Einheit 22</Text>
            <Text style={styles.address}>37339 Leinefelde-Worbis OT Hundeshagen</Text>
          </View>

          <TouchableOpacity
            style={styles.contactBtn}
            onPress={() => Linking.openURL('tel:03607190272')}
          >
            <Ionicons name="call" size={18} color="#fff" />
            <Text style={styles.contactBtnText}>Tel.: 036071 / 90272</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.contactBtn, { backgroundColor: '#64748b' }]}
            onPress={() => Linking.openURL('tel:03607190273')}
          >
            <Ionicons name="print" size={18} color="#fff" />
            <Text style={styles.contactBtnText}>Fax: 036071 / 90273</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.contactBtn, { backgroundColor: '#16a34a' }]}
            onPress={() => Linking.openURL(`mailto:${CONTACT_EMAIL_BUSINESS}`)}
          >
            <Ionicons name="mail" size={18} color="#fff" />
            <Text style={styles.contactBtnText}>{CONTACT_EMAIL_BUSINESS}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.contactBtn, { backgroundColor: '#0ea5e9' }]}
            onPress={() => Linking.openURL(`mailto:${CONTACT_EMAIL_APP}`)}
          >
            <Ionicons name="phone-portrait-outline" size={18} color="#fff" />
            <Text style={styles.contactBtnText}>App-Support: {CONTACT_EMAIL_APP}</Text>
          </TouchableOpacity>
        </Section>

        {/* Haftung Inhalte */}
        <Section icon="document-text-outline" title="Haftung für Inhalte">
          <Text style={styles.text}>
            Die in dieser App bereitgestellten Inhalte und Funktionen dienen der Erstellung und Verwaltung von Aufmaß- und Baustellendokumentation durch den Nutzer. Wir sind gem. § 7 Abs. 1 TMG für eigene Inhalte verantwortlich.
          </Text>
          <Text style={styles.text}>
            Für die Korrektheit, Vollständigkeit oder Aktualität der vom Nutzer erfassten Daten übernehmen wir keine Gewähr. Eine Haftung gem. §§ 8 bis 10 TMG für übertragene oder gespeicherte Informationen besteht nicht.
          </Text>

          <View style={styles.warnBox}>
            <View style={styles.warnHeader}>
              <Ionicons name="information-circle-outline" size={18} color="#1e293b" />
              <Text style={styles.warnTitle}>Wichtig: Maße & Berechnungen</Text>
            </View>
            <Text style={styles.warnText}>
              Die in dieser App ermittelten <Text style={{ fontWeight: '800' }}>Maße, Berechnungen und Ergebnisse</Text> dienen ausschließlich als Unterstützung bei der Planung und Dokumentation. Trotz größter Sorgfalt kann keine Gewähr für die Richtigkeit, Vollständigkeit oder Aktualität der ermittelten Daten übernommen werden.
            </Text>
            <Text style={styles.warnText}>
              Der Nutzer ist verpflichtet, sämtliche Maße, Berechnungen und Ergebnisse vor der Verwendung <Text style={{ fontWeight: '800' }}>eigenständig zu prüfen und zu verifizieren</Text>. Für Schäden, Fehler oder Folgeschäden, die aus der Nutzung oder dem Vertrauen auf die in der App bereitgestellten Daten entstehen, wird – soweit gesetzlich zulässig – keine Haftung übernommen.
            </Text>
          </View>

          <Text style={styles.text}>
            Bei Bekanntwerden konkreter Rechtsverletzungen werden wir diese unverzüglich entfernen.
          </Text>
        </Section>

        {/* Haftung Links */}
        <Section icon="link-outline" title="Haftung für Links">
          <Text style={styles.text}>
            Diese App enthält ggf. Verweise auf externe Webseiten Dritter (z.B. Datenschutzerklärung online, Aufsichtsbehörden). Für deren Inhalte sind ausschließlich die jeweiligen Betreiber verantwortlich. Wir machen uns diese Inhalte nicht zu eigen und übernehmen keine Gewähr für deren Richtigkeit, Vollständigkeit oder Aktualität.
          </Text>
        </Section>

        {/* Urheberrecht */}
        <Section icon="ribbon-outline" title="Urheberrecht">
          <Text style={styles.text}>
            Sämtliche Inhalte, Grafiken und Software der App „Aufmassprofi" unterliegen dem deutschen Urheberrecht. Vervielfältigung, Bearbeitung, Verbreitung sowie jede Art der Verwertung außerhalb der Grenzen des Urheberrechts bedürfen der schriftlichen Zustimmung des Betreibers.
          </Text>
          <Text style={styles.text}>
            Die in der App erfassten Daten (Projekte, Kunden, Rapporte etc.) verbleiben im Eigentum des jeweiligen Nutzers.
          </Text>
        </Section>

        {/* App-Store */}
        <Section icon="logo-apple" title="App Store / Google Play">
          <Text style={styles.text}>
            Die App „Aufmassprofi" wird über den Apple App Store (iOS) bzw. Google Play Store (Android) vertrieben. Für die Bereitstellung und Abrechnung der App über diese Stores gelten zusätzlich die jeweiligen Nutzungsbedingungen und Datenschutzbestimmungen von Apple Inc. bzw. Google LLC.
          </Text>
        </Section>

        <Text style={styles.footerText}>Stand: Juni 2026 · © Nebel-Bedachung</Text>
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  scrollContent: { padding: 16 },
  hero: { alignItems: 'center', paddingVertical: 16, marginBottom: 12 },
  heroIcon: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#dbeafe', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  title: { fontSize: 22, fontWeight: '800', color: '#0f172a' },
  subtitle: { fontSize: 13, color: '#64748b', marginTop: 4 },
  section: { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: '#e2e8f0' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#0f172a', flex: 1 },
  sectionBody: { gap: 8 },
  text: { fontSize: 13, color: '#334155', lineHeight: 19 },
  addressBox: { backgroundColor: '#f8fafc', borderRadius: 8, padding: 12 },
  addressBold: { fontSize: 15, fontWeight: '700', color: '#0f172a', marginBottom: 4 },
  address: { fontSize: 13, color: '#475569', marginTop: 2 },
  contactBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#1976d2', borderRadius: 10, paddingVertical: 12, paddingHorizontal: 16, marginTop: 8 },
  contactBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  footerText: { textAlign: 'center', fontSize: 11, color: '#94a3b8', marginTop: 16 },
  warnBox: { backgroundColor: '#f8fafc', borderRadius: 10, padding: 12, marginVertical: 8, borderWidth: 1.5, borderColor: '#1e293b' },
  warnHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8, paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  warnTitle: { fontSize: 13, fontWeight: '800', color: '#0f172a' },
  warnText: { fontSize: 12.5, color: '#7f1d1d', lineHeight: 18, marginBottom: 6 },
});

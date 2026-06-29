import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Linking } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

const CONTACT_EMAIL = 'aufmassprofi.app@gmail.com';

export default function HaftungsausschlussScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Stack.Screen
        options={{
          title: 'Haftungsausschluss',
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
            <Ionicons name="warning" size={36} color="#ea580c" />
          </View>
          <Text style={styles.title}>Haftungsausschluss</Text>
          <Text style={styles.subtitle}>Maße · Berechnungen · Ergebnisse</Text>
          <Text style={styles.dateInfo}>Stand: Juni 2026</Text>
        </View>

        {/* PROMINENT WARNING - User-Original-Text */}
        <View style={styles.alertCard}>
          <View style={styles.alertHeader}>
            <Ionicons name="information-circle-outline" size={24} color="#1e293b" />
            <Text style={styles.alertHeaderText}>Wichtiger Hinweis</Text>
          </View>
          <Text style={styles.alertText}>
            Die in dieser App ermittelten <Text style={styles.bold}>Maße, Berechnungen und Ergebnisse</Text> dienen ausschließlich als Unterstützung bei der <Text style={styles.bold}>Planung und Dokumentation</Text>.
          </Text>
          <Text style={styles.alertText}>
            Trotz größter Sorgfalt kann keine Gewähr für die Richtigkeit, Vollständigkeit oder Aktualität der ermittelten Daten übernommen werden.
          </Text>
          <View style={styles.divider} />
          <Text style={styles.alertText}>
            Der Nutzer ist verpflichtet, sämtliche Maße, Berechnungen und Ergebnisse <Text style={styles.bold}>vor der Verwendung eigenständig zu prüfen und zu verifizieren</Text>.
          </Text>
          <Text style={styles.alertText}>
            Für Schäden, Fehler oder Folgeschäden, die aus der Nutzung oder dem Vertrauen auf die in der App bereitgestellten Daten entstehen, wird – soweit gesetzlich zulässig – <Text style={styles.bold}>keine Haftung</Text> übernommen.
          </Text>
        </View>

        {/* Bereiche */}
        <Section icon="calculator-outline" title="Welche Berechnungen umfasst das?">
          <Bullet text="Aufmaße & Flächenberechnungen (Skizzen, Dachflächen, Maße aus Fotos via ImageMeter)" />
          <Bullet text="Mengen- und Materialberechnungen (Stückzahlen, Längen, Quadratmeter)" />
          <Bullet text="Stundenberechnungen & Zeiterfassung in Rapporten" />
          <Bullet text="Fahrzeit- und Spesen-Berechnungen" />
          <Bullet text="Sämtliche aus eingegebenen Werten abgeleiteten Resultate" />
        </Section>

        {/* Pflichten Nutzer */}
        <Section icon="checkmark-done-outline" title="Pflichten des Nutzers">
          <Bullet text="Eigenständige Prüfung aller Ergebnisse vor der Übernahme in Angebote, Verträge oder Ausführungsplanungen" />
          <Bullet text="Verifizierung der ermittelten Maße durch Nachmessen am Objekt" />
          <Bullet text="Plausibilitätskontrolle aller Berechnungsergebnisse durch fachkundige Personen" />
          <Bullet text="Beachtung der einschlägigen technischen Regelwerke (z.B. DIN, ATV, Fachregeln des Handwerks)" />
        </Section>

        {/* Was die App nicht ersetzt */}
        <Section icon="construct-outline" title="Was die App NICHT ersetzt">
          <Text style={styles.text}>
            Die App ersetzt <Text style={styles.bold}>keine fachliche Beratung</Text> und ist <Text style={styles.bold}>kein Ersatz</Text> für:
          </Text>
          <Bullet text="Statische Berechnungen durch einen Tragwerksplaner" />
          <Bullet text="Bauplanung durch einen Architekten oder Bauingenieur" />
          <Bullet text="Vermessung durch einen öffentlich bestellten Vermessungsingenieur" />
          <Bullet text="Genaue Aufmaße zur Abrechnung nach VOB" />
        </Section>

        {/* Datenrichtigkeit */}
        <Section icon="hardware-chip-outline" title="Technische Genauigkeit">
          <Text style={styles.text}>
            Die Genauigkeit von Maßen, die <Text style={styles.bold}>aus Fotos abgeleitet</Text> werden (ImageMeter), hängt von folgenden Faktoren ab:
          </Text>
          <Bullet text="Qualität und Auflösung des Originalfotos" />
          <Bullet text="Korrekte Setzung der Referenzmaße / Maßstäbe" />
          <Bullet text="Aufnahmewinkel und Perspektive" />
          <Bullet text="Lichtverhältnisse und Bildschärfe" />
          <Text style={[styles.text, { marginTop: 6 }]}>
            Diese Werte sind systembedingt mit Toleranzen behaftet und können erheblich von den tatsächlichen Maßen abweichen.
          </Text>
        </Section>

        {/* Gesetzliche Grundlage */}
        <Section icon="library-outline" title="Gesetzliche Grundlage">
          <Text style={styles.text}>
            Dieser Haftungsausschluss gilt im Rahmen der gesetzlichen Möglichkeiten. Eine Haftung für <Text style={styles.bold}>Vorsatz und grobe Fahrlässigkeit</Text> sowie nach dem <Text style={styles.bold}>Produkthaftungsgesetz</Text> bleibt unberührt.
          </Text>
          <Text style={styles.text}>
            Bei Verletzung wesentlicher Vertragspflichten (Kardinalpflichten) wird die Haftung auf den vorhersehbaren, typischerweise eintretenden Schaden begrenzt.
          </Text>
        </Section>

        {/* Annahme */}
        <View style={styles.acceptCard}>
          <Ionicons name="information-circle" size={22} color="#0369a1" />
          <Text style={styles.acceptText}>
            Mit der Nutzung der App Aufmassprofi <Text style={styles.bold}>akzeptierst du</Text> diesen Haftungsausschluss.
          </Text>
        </View>

        {/* Kontakt */}
        <Section icon="help-circle-outline" title="Fragen?">
          <Text style={styles.text}>
            Bei Fragen zum Haftungsausschluss:
          </Text>
          <TouchableOpacity
            style={styles.contactBtn}
            onPress={() => Linking.openURL(`mailto:${CONTACT_EMAIL}?subject=Frage zum Haftungsausschluss`)}
          >
            <Ionicons name="mail" size={18} color="#fff" />
            <Text style={styles.contactBtnText}>{CONTACT_EMAIL}</Text>
          </TouchableOpacity>
        </Section>

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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  scrollContent: { padding: 16 },
  hero: { alignItems: 'center', paddingVertical: 16, marginBottom: 12 },
  heroIcon: { width: 72, height: 72, borderRadius: 36, backgroundColor: '#fed7aa', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  title: { fontSize: 22, fontWeight: '800', color: '#0f172a' },
  subtitle: { fontSize: 14, color: '#475569', marginTop: 4 },
  dateInfo: { fontSize: 11, color: '#94a3b8', marginTop: 8, fontStyle: 'italic' },
  alertCard: { backgroundColor: '#f8fafc', borderRadius: 14, padding: 16, marginBottom: 14, borderWidth: 2, borderColor: '#1e293b' },
  alertHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  alertHeaderText: { fontSize: 17, fontWeight: '800', color: '#0f172a' },
  alertText: { fontSize: 13.5, color: '#7f1d1d', lineHeight: 20, marginBottom: 8 },
  divider: { height: 1, backgroundColor: '#e2e8f0', marginVertical: 8 },
  bold: { fontWeight: '800', color: '#0f172a' },
  section: { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: '#e2e8f0' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#0f172a', flex: 1 },
  sectionBody: { gap: 6 },
  text: { fontSize: 13, color: '#334155', lineHeight: 19 },
  bulletRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 4 },
  bulletDot: { fontSize: 14, color: '#ea580c', lineHeight: 19, fontWeight: '800' },
  bulletText: { fontSize: 13, color: '#334155', lineHeight: 19, flex: 1 },
  acceptCard: { flexDirection: 'row', gap: 10, backgroundColor: '#e0f2fe', borderRadius: 10, padding: 12, marginBottom: 12, alignItems: 'flex-start', borderWidth: 1, borderColor: '#7dd3fc' },
  acceptText: { fontSize: 13, color: '#0c4a6e', flex: 1, lineHeight: 19 },
  contactBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#1976d2', borderRadius: 10, paddingVertical: 12, paddingHorizontal: 16, marginTop: 8 },
  contactBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  footerText: { textAlign: 'center', fontSize: 11, color: '#94a3b8', marginTop: 16 },
});

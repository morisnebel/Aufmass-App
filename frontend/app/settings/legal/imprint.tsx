import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Linking,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function ImprintScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const openPhone = () => {
    Linking.openURL('tel:03607190272');
  };

  const openFax = () => {
    Linking.openURL('tel:03607190273');
  };

  const openCompanyEmail = () => {
    Linking.openURL('mailto:info@nebel-bedachung.com');
  };

  const openSupportEmail = () => {
    Linking.openURL('mailto:aufmassprofi.app@gmail.com');
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={28} color="#007AFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Impressum</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Title Section */}
        <View style={styles.titleSection}>
          <View style={styles.iconCircle}>
            <Ionicons name="business" size={40} color="#fff" />
          </View>
          <Text style={styles.mainTitle}>Impressum</Text>
          <Text style={styles.subtitle}>Angaben gem. § 5 TMG</Text>
        </View>

        {/* Betreiber und Kontakt */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="home-outline" size={20} color="#007AFF" />
            <Text style={styles.sectionTitle}>Betreiber und Kontakt</Text>
          </View>
          <View style={styles.contactCard}>
            <Text style={styles.companyName}>Nebel-Bedachung</Text>
            <Text style={styles.contactText}>Einzelunternehmen</Text>
            <Text style={styles.contactText}>Inhaber: Moris Nebel</Text>
            <Text style={[styles.contactText, { marginTop: 8 }]}>Einheit 22</Text>
            <Text style={styles.contactText}>37339 Leinefelde-Worbis OT Hundeshagen</Text>
          </View>

          <TouchableOpacity style={styles.greenButton} onPress={openPhone}>
            <Ionicons name="call" size={20} color="#fff" />
            <Text style={styles.buttonText}>Tel.: 036071 / 90272</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.grayButton} onPress={openFax}>
            <Ionicons name="print" size={20} color="#fff" />
            <Text style={styles.buttonText}>Fax: 036071 / 90273</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.blueButton} onPress={openCompanyEmail}>
            <Ionicons name="mail" size={20} color="#fff" />
            <Text style={styles.buttonText}>info@nebel-bedachung.com</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.cyanButton} onPress={openSupportEmail}>
            <Ionicons name="phone-portrait" size={20} color="#fff" />
            <Text style={styles.buttonText}>App-Support: aufmassprofi.app@gmail.com</Text>
          </TouchableOpacity>
        </View>

        {/* Haftung für Inhalte */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="document-text-outline" size={20} color="#007AFF" />
            <Text style={styles.sectionTitle}>Haftung für Inhalte</Text>
          </View>
          <Text style={styles.sectionText}>
            Die in dieser App bereitgestellten Inhalte und Funktionen dienen der Erstellung und Verwaltung von Aufmaß- und Baustellendokumentation durch den Nutzer. Wir sind gem. § 7 Abs. 1 TMG für eigene Inhalte verantwortlich.
          </Text>
          <Text style={[styles.sectionText, { marginTop: 8 }]}>
            Für die Korrektheit, Vollständigkeit oder Aktualität der vom Nutzer erfassten Daten übernehmen wir keine Gewähr. Eine Haftung gem. §§ 8 bis 10 TMG für übertragene oder gespeicherte Informationen besteht nicht.
          </Text>
        </View>

        {/* Warning Box - Wichtig: Maße & Berechnungen */}
        <View style={styles.warningBox}>
          <View style={styles.warningHeader}>
            <Ionicons name="warning" size={20} color="#dc2626" />
            <Text style={styles.warningTitle}>Wichtig: Maße & Berechnungen</Text>
          </View>
          <Text style={styles.warningText}>
            Die in dieser App ermittelten <Text style={styles.bold}>Maße, Berechnungen und Ergebnisse</Text> dienen ausschließlich als Unterstützung bei der Planung und Dokumentation. Trotz größter Sorgfalt kann keine Gewähr für die Richtigkeit, Vollständigkeit oder Aktualität der ermittelten Daten übernommen werden.
          </Text>
          <Text style={[styles.warningText, { marginTop: 8 }]}>
            Der Nutzer ist verpflichtet, sämtliche Maße, Berechnungen und Ergebnisse vor der Verwendung <Text style={styles.bold}>eigenständig zu prüfen und zu verifizieren</Text>. Für Schäden, Fehler oder Folgeschäden, die aus der Nutzung oder dem Vertrauen auf die in der App bereitgestellten Daten entstehen, wird – soweit gesetzlich zulässig – keine Haftung übernommen.
          </Text>
        </View>

        {/* Weitere Hinweise */}
        <View style={styles.section}>
          <Text style={styles.sectionText}>
            Bei Bekanntwerden konkreter Rechtsverletzungen werden wir diese unverzüglich entfernen.
          </Text>
        </View>

        {/* Haftung für Links */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="link-outline" size={20} color="#007AFF" />
            <Text style={styles.sectionTitle}>Haftung für Links</Text>
          </View>
          <Text style={styles.sectionText}>
            Diese App enthält ggf. Verweise auf externe Webseiten Dritter (z.B. Datenschutzerklärung online, Aufsichtsbehörden). Für deren Inhalte sind ausschließlich die jeweiligen Betreiber verantwortlich. Wir machen uns diese Inhalte nicht zu eigen und übernehmen keine Gewähr für deren Richtigkeit, Vollständigkeit oder Aktualität.
          </Text>
        </View>

        {/* Urheberrecht */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="lock-closed-outline" size={20} color="#007AFF" />
            <Text style={styles.sectionTitle}>Urheberrecht</Text>
          </View>
          <Text style={styles.sectionText}>
            Sämtliche Inhalte, Grafiken und Software der App „Aufmassprofi" unterliegen dem deutschen Urheberrecht. Vervielfältigung, Bearbeitung, Verbreitung sowie jede Art der Verwertung außerhalb der Grenzen des Urheberrechts bedürfen der schriftlichen Zustimmung des Betreibers.
          </Text>
          <Text style={[styles.sectionText, { marginTop: 8 }]}>
            Die in der App erfassten Daten (Projekte, Kunden, Rapporte etc.) verbleiben im Eigentum des jeweiligen Nutzers.
          </Text>
        </View>

        {/* App Store / Google Play */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="logo-apple" size={20} color="#007AFF" />
            <Text style={styles.sectionTitle}>App Store / Google Play</Text>
          </View>
          <Text style={styles.sectionText}>
            Die App „Aufmassprofi" wird über den Apple App Store (iOS) bzw. Google Play Store (Android) vertrieben. Für die Bereitstellung und Abrechnung der App über diese Stores gelten zusätzlich die jeweiligen Nutzungsbedingungen und Datenschutzbestimmungen von Apple Inc. bzw. Google LLC.
          </Text>
        </View>

        {/* Footer */}
        <Text style={styles.footer}>Stand: Juni 2026 · © Nebel-Bedachung</Text>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e5e5',
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#000',
  },
  placeholder: {
    width: 44,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  titleSection: {
    alignItems: 'center',
    marginBottom: 20,
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#007AFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  mainTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#000',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
  },
  section: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#000',
    marginLeft: 8,
  },
  sectionText: {
    fontSize: 15,
    color: '#333',
    lineHeight: 22,
  },
  contactCard: {
    backgroundColor: '#f9fafb',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  companyName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#000',
    marginBottom: 4,
  },
  contactText: {
    fontSize: 15,
    color: '#666',
    lineHeight: 22,
  },
  greenButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#22c55e',
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
  },
  grayButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#6b7280',
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
  },
  blueButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#007AFF',
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
  },
  cyanButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#06b6d4',
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginLeft: 8,
  },
  warningBox: {
    backgroundColor: '#fef2f2',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  warningHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  warningTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#dc2626',
    marginLeft: 8,
  },
  warningText: {
    fontSize: 15,
    color: '#7f1d1d',
    lineHeight: 22,
  },
  bold: {
    fontWeight: '700',
  },
  footer: {
    textAlign: 'center',
    fontSize: 13,
    color: '#999',
    marginTop: 20,
    marginBottom: 20,
  },
});

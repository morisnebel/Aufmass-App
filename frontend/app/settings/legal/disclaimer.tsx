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

export default function DisclaimerScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const openEmail = () => {
    Linking.openURL('mailto:aufmassprofi.app@gmail.com');
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={28} color="#007AFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Haftungsausschluss</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Title Section */}
        <View style={styles.titleSection}>
          <View style={styles.iconCircle}>
            <Ionicons name="warning" size={40} color="#fff" />
          </View>
          <Text style={styles.mainTitle}>Haftungsausschluss</Text>
          <Text style={styles.subtitle}>Maße · Berechnungen · Ergebnisse</Text>
          <Text style={styles.date}>Stand: Juni 2026</Text>
        </View>

        {/* Wichtiger Hinweis - Red Warning Box */}
        <View style={styles.warningBox}>
          <View style={styles.warningHeader}>
            <Ionicons name="alert-circle" size={20} color="#dc2626" />
            <Text style={styles.warningTitle}>Wichtiger Hinweis</Text>
          </View>
          <Text style={styles.warningText}>
            Die in dieser App ermittelten <Text style={styles.bold}>Maße, Berechnungen und Ergebnisse</Text> dienen ausschließlich als Unterstützung bei der <Text style={styles.bold}>Planung und Dokumentation</Text>.
          </Text>
          <Text style={[styles.warningText, { marginTop: 8 }]}>
            Trotz größter Sorgfalt kann keine Gewähr für die Richtigkeit, Vollständigkeit oder Aktualität der ermittelten Daten übernommen werden.
          </Text>
          <Text style={[styles.warningText, { marginTop: 12 }]}>
            Der Nutzer ist verpflichtet, sämtliche Maße, Berechnungen und Ergebnisse <Text style={styles.bold}>vor der Verwendung eigenständig zu prüfen und zu verifizieren</Text>.
          </Text>
          <Text style={[styles.warningText, { marginTop: 8 }]}>
            Für Schäden, Fehler oder Folgeschäden, die aus der Nutzung oder dem Vertrauen auf die in der App bereitgestellten Daten entstehen, wird – soweit gesetzlich zulässig – <Text style={styles.bold}>keine Haftung</Text> übernommen.
          </Text>
        </View>

        {/* Welche Berechnungen umfasst das? */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="calculator-outline" size={20} color="#007AFF" />
            <Text style={styles.sectionTitle}>Welche Berechnungen umfasst das?</Text>
          </View>
          <View style={styles.bulletList}>
            <Text style={styles.bulletItem}>• Aufmaße & Flächenberechnungen (Skizzen, Dachflächen, Maße aus Fotos via ImageMeter)</Text>
            <Text style={styles.bulletItem}>• Mengen- und Materialberechnungen (Stückzahlen, Längen, Quadratmeter)</Text>
            <Text style={styles.bulletItem}>• Stundenberechnungen & Zeiterfassung in Rapporten</Text>
            <Text style={styles.bulletItem}>• Fahrzeit- und Spesen-Berechnungen</Text>
            <Text style={styles.bulletItem}>• Sämtliche aus eingegebenen Werten abgeleiteten Resultate</Text>
          </View>
        </View>

        {/* Pflichten des Nutzers */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="checkmark-circle-outline" size={20} color="#007AFF" />
            <Text style={styles.sectionTitle}>Pflichten des Nutzers</Text>
          </View>
          <View style={styles.bulletList}>
            <Text style={styles.bulletItem}>• Eigenständige Prüfung aller Ergebnisse vor der Übernahme in Angebote, Verträge oder Ausführungsplanungen</Text>
            <Text style={styles.bulletItem}>• Verifizierung der ermittelten Maße durch Nachmessen am Objekt</Text>
            <Text style={styles.bulletItem}>• Plausibilitätskontrolle aller Berechnungsergebnisse durch fachkundige Personen</Text>
            <Text style={styles.bulletItem}>• Beachtung der einschlägigen technischen Regelwerke (z.B. DIN, ATV, Fachregeln des Handwerks)</Text>
          </View>
        </View>

        {/* Was die App NICHT ersetzt */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="close-circle-outline" size={20} color="#007AFF" />
            <Text style={styles.sectionTitle}>Was die App NICHT ersetzt</Text>
          </View>
          <Text style={styles.sectionText}>
            Die App ersetzt <Text style={styles.bold}>keine fachliche Beratung</Text> und ist <Text style={styles.bold}>kein Ersatz</Text> für:
          </Text>
          <View style={styles.bulletList}>
            <Text style={styles.bulletItem}>• Statische Berechnungen durch einen Tragwerksplaner</Text>
            <Text style={styles.bulletItem}>• Bauplanung durch einen Architekten oder Bauingenieur</Text>
            <Text style={styles.bulletItem}>• Vermessung durch einen öffentlich bestellten Vermessungsingenieur</Text>
            <Text style={styles.bulletItem}>• Genaue Aufmaße zur Abrechnung nach VOB</Text>
          </View>
        </View>

        {/* Technische Genauigkeit */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="speedometer-outline" size={20} color="#007AFF" />
            <Text style={styles.sectionTitle}>Technische Genauigkeit</Text>
          </View>
          <Text style={styles.sectionText}>
            Die Genauigkeit von Maßen, die <Text style={styles.bold}>aus Fotos abgeleitet</Text> werden (ImageMeter), hängt von folgenden Faktoren ab:
          </Text>
          <View style={styles.bulletList}>
            <Text style={styles.bulletItem}>• Qualität und Auflösung des Originalfotos</Text>
            <Text style={styles.bulletItem}>• Korrekte Setzung der Referenzmaße / Maßstäbe</Text>
            <Text style={styles.bulletItem}>• Aufnahmewinkel und Perspektive</Text>
            <Text style={styles.bulletItem}>• Lichtverhältnisse und Bildschärfe</Text>
          </View>
          <Text style={[styles.sectionText, { marginTop: 12 }]}>
            Diese Werte sind systembedingt mit Toleranzen behaftet und können erheblich von den tatsächlichen Maßen abweichen.
          </Text>
        </View>

        {/* Gesetzliche Grundlage */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="book-outline" size={20} color="#007AFF" />
            <Text style={styles.sectionTitle}>Gesetzliche Grundlage</Text>
          </View>
          <Text style={styles.sectionText}>
            Dieser Haftungsausschluss gilt im Rahmen der gesetzlichen Möglichkeiten. Eine Haftung für <Text style={styles.bold}>Vorsatz und grobe Fahrlässigkeit</Text> sowie nach dem <Text style={styles.bold}>Produkthaftungsgesetz</Text> bleibt unberührt.
          </Text>
          <Text style={[styles.sectionText, { marginTop: 8 }]}>
            Bei Verletzung wesentlicher Vertragspflichten (Kardinalpflichten) wird die Haftung auf den vorhersehbaren, typischerweise eintretenden Schaden begrenzt.
          </Text>
        </View>

        {/* Acceptance Banner */}
        <View style={styles.acceptanceBanner}>
          <Ionicons name="information-circle" size={20} color="#007AFF" />
          <Text style={styles.acceptanceText}>
            Mit der Nutzung der App Aufmassprofi <Text style={styles.bold}>akzeptierst du</Text> diesen Haftungsausschluss.
          </Text>
        </View>

        {/* Fragen? */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="help-circle-outline" size={20} color="#007AFF" />
            <Text style={styles.sectionTitle}>Fragen?</Text>
          </View>
          <Text style={styles.sectionText}>Bei Fragen zum Haftungsausschluss:</Text>
          <TouchableOpacity style={styles.contactButton} onPress={openEmail}>
            <Ionicons name="mail" size={20} color="#fff" />
            <Text style={styles.contactButtonText}>aufmassprofi.app@gmail.com</Text>
          </TouchableOpacity>
        </View>

        {/* Footer */}
        <Text style={styles.footer}>© 2026 Nebel-Bedachung · Aufmassprofi</Text>

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
    backgroundColor: '#f59e0b',
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
    marginBottom: 4,
  },
  date: {
    fontSize: 14,
    color: '#999',
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
  bulletList: {
    marginTop: 8,
  },
  bulletItem: {
    fontSize: 15,
    color: '#333',
    lineHeight: 22,
    marginBottom: 8,
  },
  acceptanceBanner: {
    flexDirection: 'row',
    backgroundColor: '#dbeafe',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    alignItems: 'flex-start',
  },
  acceptanceText: {
    flex: 1,
    fontSize: 15,
    color: '#1e40af',
    lineHeight: 22,
    marginLeft: 10,
  },
  contactButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#007AFF',
    borderRadius: 10,
    padding: 14,
    marginTop: 12,
  },
  contactButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginLeft: 8,
  },
  footer: {
    textAlign: 'center',
    fontSize: 13,
    color: '#999',
    marginTop: 20,
    marginBottom: 20,
  },
});

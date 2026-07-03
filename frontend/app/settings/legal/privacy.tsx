import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Linking,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

export default function PrivacyPolicyScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();

  const openEmail = () => {
    Linking.openURL('mailto:aufmassprofi.app@gmail.com');
  };

  const openPhone = () => {
    Linking.openURL('tel:03607190272');
  };

  const openWebsite = () => {
    Linking.openURL('https://nebel-bedachung.de/Aufmassprofi-Datenschutz-Impressum');
  };

  const openDataProtectionAuthorities = () => {
    Linking.openURL('https://www.bfdi.bund.de/DE/Service/Anschriften/Laender/Laender-node.html');
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={28} color="#007AFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Datenschutz</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Title Section */}
        <View style={styles.titleSection}>
          <View style={styles.iconCircle}>
            <Ionicons name="checkmark" size={40} color="#fff" />
          </View>
          <Text style={styles.mainTitle}>Datenschutzerklärung</Text>
          <Text style={styles.subtitle}>Aufmassprofi App</Text>
          <Text style={styles.date}>Stand: Juni 2026</Text>
        </View>

        {/* Local Storage Banner */}
        <View style={styles.localStorageBanner}>
          <Ionicons name="lock-closed" size={20} color="#22c55e" />
          <View style={styles.bannerTextContainer}>
            <Text style={styles.bannerTitle}>100% lokale Speicherung</Text>
            <Text style={styles.bannerText}>
              Alle Daten (Projekte, Skizzen, Fotos, Rapporte) werden ausschließlich auf deinem Gerät gespeichert. Es findet KEINE Übertragung an externe Server statt.
            </Text>
          </View>
        </View>

        {/* 1. Verantwortliche Stelle */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="document-text-outline" size={20} color="#007AFF" />
            <Text style={styles.sectionTitle}>1. Verantwortliche Stelle</Text>
          </View>
          <Text style={styles.sectionText}>
            Verantwortlich für die Datenverarbeitung im Sinne der EU-Datenschutzgrundverordnung (DSGVO) ist:
          </Text>
          <View style={styles.contactCard}>
            <Text style={styles.contactName}>Nebel-Bedachung</Text>
            <Text style={styles.contactText}>Einzelunternehmen – Inhaber: Moris Nebel</Text>
            <Text style={styles.contactText}>Einheit 22</Text>
            <Text style={styles.contactText}>37339 Leinefelde-Worbis OT Hundeshagen</Text>
            <Text style={styles.contactText}>Tel.: 036071 / 90272</Text>
            <Text style={styles.contactText}>E-Mail: aufmassprofi.app@gmail.com</Text>
          </View>
        </View>

        {/* 2. App-Berechtigungen */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="key-outline" size={20} color="#007AFF" />
            <Text style={styles.sectionTitle}>2. App-Berechtigungen</Text>
          </View>
          <Text style={styles.sectionText}>
            Die App verwendet folgende Gerätefunktionen ausschließlich für die im Folgenden genannten Zwecke:
          </Text>
          
          <View style={styles.permissionCard}>
            <View style={styles.permissionHeader}>
              <Ionicons name="camera" size={18} color="#007AFF" />
              <Text style={styles.permissionTitle}>Kamera</Text>
            </View>
            <Text style={styles.permissionText}>
              Aufnahme von Fotos für die Aufmaß-Dokumentation, Skizzen und Rapporte. Fotos werden ausschließlich lokal gespeichert.
            </Text>
          </View>

          <View style={styles.permissionCard}>
            <View style={styles.permissionHeader}>
              <Ionicons name="images" size={18} color="#22c55e" />
              <Text style={styles.permissionTitle}>Fotobibliothek</Text>
            </View>
            <Text style={styles.permissionText}>
              Auswahl bestehender Bilder über den System-Fotopicker. Die App hat keinen Zugriff auf deine gesamte Fotobibliothek.
            </Text>
          </View>

          <View style={styles.permissionCard}>
            <View style={styles.permissionHeader}>
              <Ionicons name="document" size={18} color="#8b5cf6" />
              <Text style={styles.permissionTitle}>Dateien speichern</Text>
            </View>
            <Text style={styles.permissionText}>
              Speichern von PDF-Exporten (Aufmaß-Berichte, Rapporte) im gewählten Ordner auf deinem Gerät.
            </Text>
          </View>
        </View>

        {/* 3. Datenspeicherung & -verarbeitung */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="server-outline" size={20} color="#007AFF" />
            <Text style={styles.sectionTitle}>3. Datenspeicherung & -verarbeitung</Text>
          </View>
          <View style={styles.bulletList}>
            <Text style={styles.bulletItem}>
              • Alle Eingaben (Kundendaten, Projektdaten, Mitarbeiter, Material, Maschinen, Rapporte) werden in der lokalen App-Datenbank deines Geräts gespeichert (AsyncStorage / SecureStore).
            </Text>
            <Text style={styles.bulletItem}>
              • Es findet KEINE automatische Synchronisation mit Cloud-Diensten oder Servern statt.
            </Text>
            <Text style={styles.bulletItem}>
              • Die App selbst überträgt keine personenbezogenen Daten an Dritte.
            </Text>
            <Text style={styles.bulletItem}>
              • Beim Versenden eines PDF-Berichts via E-Mail oder Cloud-Dienst ist der jeweilige Anbieter (z.B. Apple Mail, iCloud, Gmail) für die weitere Datenverarbeitung verantwortlich.
            </Text>
          </View>
        </View>

        {/* 4. Pro-Version / In-App-Käufe */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="diamond-outline" size={20} color="#007AFF" />
            <Text style={styles.sectionTitle}>4. Pro-Version / In-App-Käufe</Text>
          </View>
          <Text style={styles.sectionText}>
            Die Pro-Version wird – soweit verfügbar – über den Apple App Store (iOS) bzw. Google Play Store (Android) freigeschaltet. Die Kaufabwicklung erfolgt ausschließlich durch Apple bzw. Google. Lediglich der Freischalt-Status wird lokal in der App gespeichert.
          </Text>
        </View>

        {/* 5. Deine Rechte nach DSGVO */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="shield-checkmark-outline" size={20} color="#007AFF" />
            <Text style={styles.sectionTitle}>5. Deine Rechte nach DSGVO</Text>
          </View>
          <Text style={styles.sectionText}>
            Da die App ausschließlich lokal arbeitet, kannst du deine Rechte direkt auf dem Gerät ausüben:
          </Text>
          <View style={styles.bulletList}>
            <Text style={styles.bulletItem}>
              • Recht auf Auskunft → Alle erfassten Daten siehst du jederzeit in der App.
            </Text>
            <Text style={styles.bulletItem}>
              • Recht auf Berichtigung → Du kannst jeden Datensatz direkt in der App bearbeiten.
            </Text>
            <Text style={styles.bulletItem}>
              • Recht auf Löschung → Einzelne Einträge löschen oder unter „Einstellungen → Alle Daten zurücksetzen".
            </Text>
            <Text style={styles.bulletItem}>
              • Recht auf Datenübertragbarkeit → Alle Aufmaße & Rapporte können als PDF exportiert werden.
            </Text>
            <Text style={styles.bulletItem}>
              • Recht auf vollständige Löschung → App deinstallieren = alle Daten unwiderruflich gelöscht.
            </Text>
          </View>
        </View>

        {/* 6. Datensicherheit */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="shield-outline" size={20} color="#007AFF" />
            <Text style={styles.sectionTitle}>6. Datensicherheit</Text>
          </View>
          <Text style={styles.sectionText}>
            Die App nutzt die Sicherheitsmechanismen deines Betriebssystems (iOS / Android Sandbox). Wir empfehlen zusätzlich:
          </Text>
          <View style={styles.bulletList}>
            <Text style={styles.bulletItem}>
              • Aktivierung der Geräte-Sperre (Face ID / Touch ID / PIN)
            </Text>
            <Text style={styles.bulletItem}>
              • Regelmäßige Geräte-Backups (über iCloud / Google) zur Sicherung der App-Daten
            </Text>
          </View>
        </View>

        {/* 7. Beschwerderecht */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="document-outline" size={20} color="#007AFF" />
            <Text style={styles.sectionTitle}>7. Beschwerderecht</Text>
          </View>
          <Text style={styles.sectionText}>
            Du hast das Recht, dich bei einer Datenschutz-Aufsichtsbehörde über die Verarbeitung deiner personenbezogenen Daten zu beschweren.
          </Text>
          <TouchableOpacity style={styles.linkButton} onPress={openDataProtectionAuthorities}>
            <Ionicons name="link" size={18} color="#007AFF" />
            <Text style={styles.linkText}>Liste der Aufsichtsbehörden öffnen</Text>
          </TouchableOpacity>
        </View>

        {/* 8. Änderungen dieser Datenschutzerklärung */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="refresh-outline" size={20} color="#007AFF" />
            <Text style={styles.sectionTitle}>8. Änderungen dieser Datenschutzerklärung</Text>
          </View>
          <Text style={styles.sectionText}>
            Wir behalten uns vor, diese Datenschutzerklärung an geänderte rechtliche Anforderungen oder neue Funktionen der App anzupassen. Die jeweils aktuelle Version ist innerhalb der App unter „Einstellungen → Rechtliches" einsehbar.
          </Text>
        </View>

        {/* 9. Kontakt zum Datenschutzbeauftragten */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="mail-outline" size={20} color="#007AFF" />
            <Text style={styles.sectionTitle}>9. Kontakt zum Datenschutzbeauftragten</Text>
          </View>
          <Text style={styles.sectionText}>
            Bei Fragen zum Datenschutz oder zur Ausübung deiner Rechte:
          </Text>
          
          <TouchableOpacity style={styles.contactButton} onPress={openEmail}>
            <Ionicons name="mail" size={20} color="#fff" />
            <Text style={styles.contactButtonText}>aufmassprofi.app@gmail.com</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.contactButton, styles.phoneButton]} onPress={openPhone}>
            <Ionicons name="call" size={20} color="#fff" />
            <Text style={styles.contactButtonText}>036071 / 90272</Text>
          </TouchableOpacity>
        </View>

        {/* Online Version */}
        <TouchableOpacity style={styles.onlineVersionCard} onPress={openWebsite}>
          <View style={styles.onlineVersionContent}>
            <Ionicons name="globe-outline" size={24} color="#007AFF" />
            <View style={styles.onlineVersionText}>
              <Text style={styles.onlineVersionTitle}>Online-Version</Text>
              <Text style={styles.onlineVersionUrl}>https://nebel-bedachung.de/Aufmassprofi-Datenschutz-Impressum</Text>
            </View>
          </View>
          <Ionicons name="open-outline" size={20} color="#007AFF" />
        </TouchableOpacity>

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
    backgroundColor: '#22c55e',
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
  localStorageBanner: {
    flexDirection: 'row',
    backgroundColor: '#dcfce7',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    borderLeftWidth: 4,
    borderLeftColor: '#22c55e',
  },
  bannerTextContainer: {
    flex: 1,
    marginLeft: 12,
  },
  bannerTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#22c55e',
    marginBottom: 4,
  },
  bannerText: {
    fontSize: 14,
    color: '#166534',
    lineHeight: 20,
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
    marginTop: 12,
  },
  contactName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
    marginBottom: 8,
  },
  contactText: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
  permissionCard: {
    backgroundColor: '#f0f9ff',
    borderRadius: 8,
    padding: 12,
    marginTop: 12,
    borderLeftWidth: 3,
    borderLeftColor: '#007AFF',
  },
  permissionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  permissionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#007AFF',
    marginLeft: 8,
  },
  permissionText: {
    fontSize: 14,
    color: '#333',
    lineHeight: 20,
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
  linkButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
  },
  linkText: {
    fontSize: 15,
    color: '#007AFF',
    marginLeft: 6,
    textDecorationLine: 'underline',
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
  phoneButton: {
    backgroundColor: '#22c55e',
  },
  contactButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginLeft: 8,
  },
  onlineVersionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  onlineVersionContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  onlineVersionText: {
    marginLeft: 12,
    flex: 1,
  },
  onlineVersionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#007AFF',
  },
  onlineVersionUrl: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  footer: {
    textAlign: 'center',
    fontSize: 13,
    color: '#999',
    marginBottom: 20,
  },
});

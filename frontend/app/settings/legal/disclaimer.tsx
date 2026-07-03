import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function DisclaimerScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

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
          <Text style={styles.subtitle}>Maße, Berechnungen & Ergebnisse</Text>
        </View>

        {/* Warning Banner */}
        <View style={styles.warningBanner}>
          <Ionicons name="alert-circle" size={24} color="#dc2626" />
          <View style={styles.bannerTextContainer}>
            <Text style={styles.bannerTitle}>Wichtiger Hinweis</Text>
            <Text style={styles.bannerText}>
              Bitte lesen Sie die folgenden Hinweise sorgfältig durch.
            </Text>
          </View>
        </View>

        {/* Section 1 */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="calculator-outline" size={20} color="#007AFF" />
            <Text style={styles.sectionTitle}>1. Berechnungen & Maße</Text>
          </View>
          <Text style={styles.sectionText}>
            Die in dieser App durchgeführten Berechnungen und Maßangaben dienen ausschließlich als Hilfs- und Orientierungsmittel. Sie ersetzen nicht die fachliche Expertise und Überprüfung durch qualifiziertes Personal.
          </Text>
        </View>

        {/* Section 2 */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="checkmark-circle-outline" size={20} color="#007AFF" />
            <Text style={styles.sectionTitle}>2. Eigenverantwortliche Prüfung</Text>
          </View>
          <Text style={styles.sectionText}>
            Der Benutzer ist verpflichtet, alle Berechnungen, Maße und Ergebnisse vor der praktischen Anwendung eigenständig zu überprüfen. Die Verantwortung für die Richtigkeit und Anwendbarkeit der Ergebnisse liegt allein beim Benutzer.
          </Text>
        </View>

        {/* Section 3 */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="shield-outline" size={20} color="#007AFF" />
            <Text style={styles.sectionTitle}>3. Haftungsausschluss</Text>
          </View>
          <Text style={styles.sectionText}>
            Der Entwickler dieser App übernimmt keine Haftung für:
          </Text>
          <View style={styles.bulletList}>
            <Text style={styles.bulletItem}>
              • Fehlerhafte Berechnungen oder Maßangaben
            </Text>
            <Text style={styles.bulletItem}>
              • Schäden, die aus der Verwendung der App-Ergebnisse entstehen
            </Text>
            <Text style={styles.bulletItem}>
              • Direkte oder indirekte Folgeschäden jeglicher Art
            </Text>
            <Text style={styles.bulletItem}>
              • Verluste oder Kosten durch fehlerhafte Materialbestellungen
            </Text>
          </View>
        </View>

        {/* Section 4 */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="construct-outline" size={20} color="#007AFF" />
            <Text style={styles.sectionTitle}>4. Professionelle Beratung</Text>
          </View>
          <Text style={styles.sectionText}>
            Bei wichtigen Entscheidungen, insbesondere bei größeren Bauprojekten oder Materialbestellungen, empfehlen wir dringend die Konsultation eines Fachmanns oder einer qualifizierten Fachkraft.
          </Text>
        </View>

        {/* Section 5 */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="document-text-outline" size={20} color="#007AFF" />
            <Text style={styles.sectionTitle}>5. Nutzungsbedingungen</Text>
          </View>
          <Text style={styles.sectionText}>
            Durch die Nutzung dieser App akzeptieren Sie diesen Haftungsausschluss in vollem Umfang. Wenn Sie mit diesen Bedingungen nicht einverstanden sind, sollten Sie diese App nicht verwenden.
          </Text>
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
  },
  warningBanner: {
    flexDirection: 'row',
    backgroundColor: '#fef2f2',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    borderLeftWidth: 4,
    borderLeftColor: '#dc2626',
  },
  bannerTextContainer: {
    flex: 1,
    marginLeft: 12,
  },
  bannerTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#dc2626',
    marginBottom: 4,
  },
  bannerText: {
    fontSize: 14,
    color: '#991b1b',
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
  bulletList: {
    marginTop: 8,
  },
  bulletItem: {
    fontSize: 15,
    color: '#333',
    lineHeight: 22,
    marginBottom: 8,
  },
  footer: {
    textAlign: 'center',
    fontSize: 13,
    color: '#999',
    marginTop: 20,
    marginBottom: 20,
  },
});

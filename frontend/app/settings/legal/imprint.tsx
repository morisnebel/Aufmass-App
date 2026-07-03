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

  const openEmail = () => {
    Linking.openURL('mailto:aufmassprofi.app@gmail.com');
  };

  const openPhone = () => {
    Linking.openURL('tel:03607190272');
  };

  const openWebsite = () => {
    Linking.openURL('https://nebel-bedachung.de');
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
          <Text style={styles.subtitle}>Angaben gemäß § 5 TMG</Text>
        </View>

        {/* Company Info */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="home-outline" size={20} color="#007AFF" />
            <Text style={styles.sectionTitle}>Anbieter</Text>
          </View>
          <View style={styles.contactCard}>
            <Text style={styles.companyName}>Nebel-Bedachung</Text>
            <Text style={styles.contactText}>Einzelunternehmen</Text>
            <Text style={styles.contactText}>Inhaber: Moris Nebel</Text>
          </View>
        </View>

        {/* Address */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="location-outline" size={20} color="#007AFF" />
            <Text style={styles.sectionTitle}>Anschrift</Text>
          </View>
          <View style={styles.contactCard}>
            <Text style={styles.contactText}>Einheit 22</Text>
            <Text style={styles.contactText}>37339 Leinefelde-Worbis</Text>
            <Text style={styles.contactText}>OT Hundeshagen</Text>
            <Text style={styles.contactText}>Deutschland</Text>
          </View>
        </View>

        {/* Contact */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="call-outline" size={20} color="#007AFF" />
            <Text style={styles.sectionTitle}>Kontakt</Text>
          </View>
          
          <TouchableOpacity style={styles.contactButton} onPress={openPhone}>
            <Ionicons name="call" size={20} color="#fff" />
            <Text style={styles.contactButtonText}>036071 / 90272</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.contactButton, styles.emailButton]} onPress={openEmail}>
            <Ionicons name="mail" size={20} color="#fff" />
            <Text style={styles.contactButtonText}>aufmassprofi.app@gmail.com</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.contactButton, styles.webButton]} onPress={openWebsite}>
            <Ionicons name="globe" size={20} color="#fff" />
            <Text style={styles.contactButtonText}>nebel-bedachung.de</Text>
          </TouchableOpacity>
        </View>

        {/* Legal Note */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="document-text-outline" size={20} color="#007AFF" />
            <Text style={styles.sectionTitle}>Rechtliche Hinweise</Text>
          </View>
          <Text style={styles.sectionText}>
            Verantwortlich für den Inhalt nach § 55 Abs. 2 RStV:{"\n"}
            Moris Nebel (Anschrift wie oben)
          </Text>
        </View>

        {/* Dispute Resolution */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="shield-outline" size={20} color="#007AFF" />
            <Text style={styles.sectionTitle}>Streitschlichtung</Text>
          </View>
          <Text style={styles.sectionText}>
            Die Europäische Kommission stellt eine Plattform zur Online-Streitbeilegung (OS) bereit. Wir sind nicht bereit oder verpflichtet, an Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle teilzunehmen.
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
    backgroundColor: '#6366f1',
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
  },
  companyName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#000',
    marginBottom: 8,
  },
  contactText: {
    fontSize: 15,
    color: '#666',
    lineHeight: 22,
  },
  contactButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#22c55e',
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
  },
  emailButton: {
    backgroundColor: '#007AFF',
  },
  webButton: {
    backgroundColor: '#8b5cf6',
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

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
import Constants from 'expo-constants';

export default function AboutScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const appVersion = Constants.expoConfig?.version || '1.0.0';
  const buildNumber = Constants.expoConfig?.android?.versionCode || Constants.expoConfig?.ios?.buildNumber || '9';
  const bundleId = Constants.expoConfig?.android?.package || Constants.expoConfig?.ios?.bundleIdentifier || 'com.aufmassprofi.app';

  const openExpoWebsite = () => {
    Linking.openURL('https://expo.dev');
  };

  const openReactNativeWebsite = () => {
    Linking.openURL('https://reactnative.dev');
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={28} color="#007AFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Über die App</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Title Section */}
        <View style={styles.titleSection}>
          <View style={styles.iconCircle}>
            <Ionicons name="information" size={40} color="#fff" />
          </View>
          <Text style={styles.mainTitle}>Aufmassprofi</Text>
          <Text style={styles.subtitle}>Professionelle Aufmaß-App für Dachdecker</Text>
        </View>

        {/* App Info Card */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="information-circle-outline" size={20} color="#007AFF" />
            <Text style={styles.sectionTitle}>Über die App</Text>
          </View>
          
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Name</Text>
            <Text style={styles.infoValue}>Aufmassprofi</Text>
          </View>
          
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Version</Text>
            <Text style={styles.infoValue}>{appVersion}</Text>
          </View>
          
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Build</Text>
            <Text style={styles.infoValue}>{buildNumber}</Text>
          </View>
          
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Plattform</Text>
            <Text style={styles.infoValue}>{Platform.OS === 'ios' ? 'iOS' : Platform.OS === 'android' ? 'Android' : 'iOS / Android'}</Text>
          </View>
          
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Entwickler</Text>
            <Text style={styles.infoValue}>Nebel-Bedachung</Text>
          </View>
          
          <View style={[styles.infoRow, { borderBottomWidth: 0 }]}>
            <Text style={styles.infoLabel}>Bundle ID</Text>
            <Text style={[styles.infoValue, styles.bundleId]}>{bundleId}</Text>
          </View>
        </View>

        {/* Open Source Components */}
        <View style={styles.openSourceBanner}>
          <Ionicons name="code-slash" size={20} color="#8b5cf6" />
          <View style={styles.openSourceTextContainer}>
            <Text style={styles.openSourceTitle}>Open-Source-Komponenten</Text>
            <Text style={styles.openSourceText}>
              Diese App verwendet Open-Source-Bibliotheken (React Native, Expo, u.a.) unter ihren jeweiligen Lizenzen. Alle Bibliotheken werden im App-Bundle ausgeliefert und benötigen keine Internetverbindung.
            </Text>
          </View>
        </View>

        {/* Features */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="star-outline" size={20} color="#007AFF" />
            <Text style={styles.sectionTitle}>Funktionen</Text>
          </View>
          <View style={styles.featureList}>
            <View style={styles.featureItem}>
              <Ionicons name="checkmark-circle" size={20} color="#22c55e" />
              <Text style={styles.featureText}>Professionelle Aufmaß-Erstellung</Text>
            </View>
            <View style={styles.featureItem}>
              <Ionicons name="checkmark-circle" size={20} color="#22c55e" />
              <Text style={styles.featureText}>PDF-Export mit Firmenlogo</Text>
            </View>
            <View style={styles.featureItem}>
              <Ionicons name="checkmark-circle" size={20} color="#22c55e" />
              <Text style={styles.featureText}>Skizzen-Erstellung mit Zeichenwerkzeugen</Text>
            </View>
            <View style={styles.featureItem}>
              <Ionicons name="checkmark-circle" size={20} color="#22c55e" />
              <Text style={styles.featureText}>Foto-Dokumentation</Text>
            </View>
            <View style={styles.featureItem}>
              <Ionicons name="checkmark-circle" size={20} color="#22c55e" />
              <Text style={styles.featureText}>Rapporte & Zeiterfassung</Text>
            </View>
            <View style={styles.featureItem}>
              <Ionicons name="checkmark-circle" size={20} color="#22c55e" />
              <Text style={styles.featureText}>100% Offline-fähig</Text>
            </View>
            <View style={styles.featureItem}>
              <Ionicons name="checkmark-circle" size={20} color="#22c55e" />
              <Text style={styles.featureText}>Lokale Datenspeicherung (DSGVO-konform)</Text>
            </View>
          </View>
        </View>

        {/* Technologies */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="code-outline" size={20} color="#007AFF" />
            <Text style={styles.sectionTitle}>Technologien</Text>
          </View>
          
          <TouchableOpacity style={styles.techCard} onPress={openReactNativeWebsite}>
            <View style={styles.techInfo}>
              <Ionicons name="logo-react" size={24} color="#61DAFB" />
              <View style={styles.techTextContainer}>
                <Text style={styles.techName}>React Native</Text>
                <Text style={styles.techDesc}>Framework für mobile Apps</Text>
              </View>
            </View>
            <Ionicons name="open-outline" size={18} color="#007AFF" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.techCard} onPress={openExpoWebsite}>
            <View style={styles.techInfo}>
              <View style={styles.expoIcon}>
                <Text style={styles.expoIconText}>E</Text>
              </View>
              <View style={styles.techTextContainer}>
                <Text style={styles.techName}>Expo</Text>
                <Text style={styles.techDesc}>Entwicklungsplattform</Text>
              </View>
            </View>
            <Ionicons name="open-outline" size={18} color="#007AFF" />
          </TouchableOpacity>
        </View>

        {/* Developer Info */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="person-outline" size={20} color="#007AFF" />
            <Text style={styles.sectionTitle}>Entwickler</Text>
          </View>
          <View style={styles.contactCard}>
            <Text style={styles.companyName}>Nebel-Bedachung</Text>
            <Text style={styles.contactText}>Moris Nebel</Text>
            <Text style={styles.contactText}>37339 Leinefelde-Worbis</Text>
            <Text style={styles.contactText}>OT Hundeshagen</Text>
          </View>
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
    textAlign: 'center',
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
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  infoLabel: {
    fontSize: 15,
    color: '#666',
  },
  infoValue: {
    fontSize: 15,
    fontWeight: '600',
    color: '#000',
  },
  bundleId: {
    fontSize: 13,
    color: '#8b5cf6',
  },
  openSourceBanner: {
    flexDirection: 'row',
    backgroundColor: '#f5f3ff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#8b5cf6',
  },
  openSourceTextContainer: {
    flex: 1,
    marginLeft: 12,
  },
  openSourceTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#8b5cf6',
    marginBottom: 4,
  },
  openSourceText: {
    fontSize: 14,
    color: '#6b21a8',
    lineHeight: 20,
  },
  featureList: {
    marginTop: 4,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  featureText: {
    fontSize: 15,
    color: '#333',
    marginLeft: 10,
  },
  techCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#f9fafb',
    borderRadius: 8,
    padding: 12,
    marginTop: 8,
  },
  techInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  techTextContainer: {
    marginLeft: 12,
  },
  techName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#000',
  },
  techDesc: {
    fontSize: 13,
    color: '#666',
  },
  expoIcon: {
    width: 24,
    height: 24,
    borderRadius: 4,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  expoIconText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
  contactCard: {
    backgroundColor: '#f9fafb',
    borderRadius: 8,
    padding: 12,
  },
  companyName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
    marginBottom: 4,
  },
  contactText: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
  footer: {
    textAlign: 'center',
    fontSize: 13,
    color: '#999',
    marginTop: 20,
    marginBottom: 20,
  },
});

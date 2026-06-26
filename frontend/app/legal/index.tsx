import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Linking } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';

const PRIVACY_URL = 'https://nebel-bedachung.de/Aufmassprofi-Datenschutz-Impressum';

export default function LegalHub() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const version = (Constants.expoConfig as any)?.version || '1.1.0';
  const buildNumber = (Constants.expoConfig as any)?.ios?.buildNumber || (Constants.expoConfig as any)?.android?.versionCode || '–';

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Stack.Screen
        options={{
          title: 'Rechtliches',
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
            <Ionicons name="document-lock-outline" size={36} color="#1976d2" />
          </View>
          <Text style={styles.title}>Rechtliches & Datenschutz</Text>
          <Text style={styles.subtitle}>Alle wichtigen Informationen rund um die App</Text>
        </View>

        {/* Cards */}
        <NavCard
          icon="shield-checkmark"
          iconColor="#16a34a"
          iconBg="#dcfce7"
          title="Datenschutzerklärung"
          subtitle="Welche Daten speichern wir? Was geschieht damit?"
          onPress={() => router.push('/legal/datenschutz')}
        />
        <NavCard
          icon="warning"
          iconColor="#ea580c"
          iconBg="#fed7aa"
          title="Haftungsausschluss"
          subtitle="Maße, Berechnungen & Ergebnisse — bitte unbedingt lesen"
          onPress={() => router.push('/legal/haftung')}
        />
        <NavCard
          icon="business"
          iconColor="#1976d2"
          iconBg="#dbeafe"
          title="Impressum"
          subtitle="Angaben gem. § 5 TMG"
          onPress={() => router.push('/legal/impressum')}
        />
        <NavCard
          icon="globe-outline"
          iconColor="#0369a1"
          iconBg="#e0f2fe"
          title="Online-Version"
          subtitle="Vollständige Datenschutzerklärung im Web"
          onPress={() => Linking.openURL(PRIVACY_URL)}
          external
        />

        {/* App-Info */}
        <View style={styles.infoCard}>
          <View style={styles.infoHeader}>
            <Ionicons name="information-circle" size={22} color="#1976d2" />
            <Text style={styles.infoTitle}>Über die App</Text>
          </View>
          <InfoRow label="Name" value="Aufmassprofi" />
          <InfoRow label="Version" value={version} />
          <InfoRow label="Build" value={String(buildNumber)} />
          <InfoRow label="Plattform" value="iOS / Android" />
          <InfoRow label="Entwickler" value="Nebel-Bedachung" />
          <InfoRow label="Bundle ID" value="com.aufmassprofi.dach" small />
        </View>

        {/* Lizenz-Hinweis */}
        <View style={styles.licenseCard}>
          <Ionicons name="ribbon-outline" size={18} color="#7c3aed" />
          <View style={{ flex: 1 }}>
            <Text style={styles.licenseTitle}>Open-Source-Komponenten</Text>
            <Text style={styles.licenseText}>
              Diese App verwendet Open-Source-Bibliotheken (React Native, Expo, u.a.) unter ihren jeweiligen Lizenzen. Alle Bibliotheken werden im App-Bundle ausgeliefert und benötigen keine Internetverbindung.
            </Text>
          </View>
        </View>

        <Text style={styles.footerText}>© 2026 Nebel-Bedachung · Aufmassprofi</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const NavCard: React.FC<{
  icon: any;
  iconColor: string;
  iconBg: string;
  title: string;
  subtitle: string;
  onPress: () => void;
  external?: boolean;
}> = ({ icon, iconColor, iconBg, title, subtitle, onPress, external }) => (
  <TouchableOpacity style={styles.navCard} onPress={onPress} activeOpacity={0.7}>
    <View style={[styles.navCardIcon, { backgroundColor: iconBg }]}>
      <Ionicons name={icon} size={22} color={iconColor} />
    </View>
    <View style={{ flex: 1 }}>
      <Text style={styles.navCardTitle}>{title}</Text>
      <Text style={styles.navCardSub} numberOfLines={2}>{subtitle}</Text>
    </View>
    <Ionicons name={external ? 'open-outline' : 'chevron-forward'} size={20} color="#94a3b8" />
  </TouchableOpacity>
);

const InfoRow: React.FC<{ label: string; value: string; small?: boolean }> = ({ label, value, small }) => (
  <View style={styles.infoRow}>
    <Text style={styles.infoLabel}>{label}</Text>
    <Text style={[styles.infoValue, small && { fontSize: 11, color: '#64748b' }]} numberOfLines={1}>{value}</Text>
  </View>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  scrollContent: { padding: 16 },
  hero: { alignItems: 'center', paddingVertical: 16, marginBottom: 8 },
  heroIcon: { width: 72, height: 72, borderRadius: 36, backgroundColor: '#dbeafe', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  title: { fontSize: 22, fontWeight: '800', color: '#0f172a' },
  subtitle: { fontSize: 13, color: '#64748b', marginTop: 6, textAlign: 'center', paddingHorizontal: 20 },
  navCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: '#e2e8f0' },
  navCardIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  navCardTitle: { fontSize: 15, fontWeight: '700', color: '#0f172a' },
  navCardSub: { fontSize: 12, color: '#64748b', marginTop: 2 },
  infoCard: { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginTop: 8, marginBottom: 12, borderWidth: 1, borderColor: '#e2e8f0' },
  infoHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  infoTitle: { fontSize: 15, fontWeight: '700', color: '#0f172a' },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6 },
  infoLabel: { fontSize: 13, color: '#64748b' },
  infoValue: { fontSize: 13, color: '#0f172a', fontWeight: '600', maxWidth: '60%' },
  licenseCard: { flexDirection: 'row', gap: 10, backgroundColor: '#f5f3ff', borderRadius: 10, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: '#ddd6fe' },
  licenseTitle: { fontSize: 13, fontWeight: '700', color: '#6d28d9', marginBottom: 2 },
  licenseText: { fontSize: 12, color: '#5b21b6', lineHeight: 17 },
  footerText: { textAlign: 'center', fontSize: 11, color: '#94a3b8', marginTop: 8 },
});

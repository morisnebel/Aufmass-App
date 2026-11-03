import React from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@react-native-vector-icons/ionicons';
import { DayPeriod, GREETINGS } from '../../hooks/useDayPeriod';
import { tourRef } from './HomeTour';

// Lokale Dach-Hintergründe (offline verfügbar), gleiches Motiv – nur Lichtstimmung wechselt
const BACKGROUNDS: Record<DayPeriod, any> = {
  morning: require('../../../assets/images/roof_morning.jpg'),
  day: require('../../../assets/images/roof_day.jpg'),
  evening: require('../../../assets/images/roof_evening.jpg'),
  night: require('../../../assets/images/roof_night.jpg'),
};

type Props = {
  period: DayPeriod;
  firstName: string;
  isPro: boolean;
  compact: boolean;
  companyLogo?: string | null;
  onSearch: () => void;
  onBackup: () => void;
  onSettings: () => void;
};

export function HomeHero({ period, firstName, isPro, compact, companyLogo, onSearch, onBackup, onSettings }: Props) {
  const insets = useSafeAreaInsets();
  const heroHeight = (compact ? 300 : 400) + insets.top;
  // Seitenverhältnis des Firmenlogos ermitteln, damit es die Karte komplett ausfüllt
  const [logoRatio, setLogoRatio] = React.useState(2);
  const logoH = compact ? 80 : 120;
  React.useEffect(() => {
    if (!companyLogo) return;
    Image.getSize(companyLogo, (w, h) => { if (w > 0 && h > 0) setLogoRatio(w / h); }, () => {});
  }, [companyLogo]);
  const greeting = `${GREETINGS[period]}${firstName ? `, ${firstName}` : ''}!`;
  const iconBtn = (name: any, onPress: () => void, testID: string, label: string, tourKey: string) => (
    <View ref={tourRef(tourKey)} collapsable={false}>
      <TouchableOpacity testID={testID} accessibilityLabel={label} style={s.iconBtn} onPress={onPress}>
        <Ionicons name={name} size={compact ? 20 : 22} color="#fff" />
      </TouchableOpacity>
    </View>
  );
  return (
    <View
      testID={`home-hero-${period}`}
      style={[s.hero, { paddingTop: insets.top + 12, minHeight: heroHeight }]}
    >
      {/* Smartphone: Bild rechtsbündig und breiter, damit das Dach (rechte Bildhälfte) sichtbar bleibt */}
      <Image
        source={BACKGROUNDS[period]}
        resizeMode="cover"
        style={compact
          ? { position: 'absolute', top: 0, bottom: 0, right: 0, width: heroHeight * 1.79 * 1.1 }
          : StyleSheet.absoluteFill}
      />
      <LinearGradient
        colors={['rgba(8,24,64,0.80)', 'rgba(10,35,90,0.40)', 'rgba(13,48,120,0.15)', 'rgba(245,247,251,0.9)', 'rgba(245,247,251,1)']}
        locations={[0, 0.4, 0.7, 0.93, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <LinearGradient
        colors={['rgba(8,24,64,0.75)', 'rgba(8,24,64,0)']}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 0.8, y: 0.5 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={s.topRow}>
        <View style={s.brand}>
          <Image source={require('../../../assets/images/logo_house.png')} style={compact ? s.logoSmall : s.logo} resizeMode="contain" />
          <View style={s.divider} />
          <View style={{ flexShrink: 1 }}>
            <Text style={[s.brandName, compact && { fontSize: 15 }]} numberOfLines={1} adjustsFontSizeToFit>
              AUFMASS<Text style={s.brandAccent}>PROFI</Text>
              {isPro ? <Text style={s.proBadge}> PRO</Text> : null}
            </Text>
            <Text style={[s.brandSub, compact && { fontSize: 11 }]} numberOfLines={1}>Die App für digitale Aufmaße</Text>
          </View>
        </View>
        <View style={s.icons}>
          {iconBtn('search', onSearch, 'home-search', 'Suche', 'search')}
          {iconBtn('cloud-upload-outline', onBackup, 'home-backup', 'Backup', 'backup')}
          {iconBtn('person-circle-outline', onSettings, 'home-settings', 'Einstellungen', 'settings')}
        </View>
      </View>
      <View style={{ flex: 1, minHeight: 20 }} />
      {/* Firmenlogo aus den Einstellungen (nur wenn vorhanden) */}
      {!!companyLogo && (
        <View testID="home-company-logo" style={[s.companyLogoBox, { height: logoH, width: Math.min(logoH * logoRatio, compact ? 300 : 420) }]}>
          {/* Logo füllt die Karte vollständig aus (Kartenform = Seitenverhältnis des Logos) */}
          <Image source={{ uri: companyLogo }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
        </View>
      )}
      <Text testID="home-greeting" style={[s.greeting, compact && { fontSize: 26 }]}>{greeting}</Text>
      <Text style={s.sub}>Hier ist der Überblick über deine Projekte und Aufgaben.</Text>
    </View>
  );
}

const s = StyleSheet.create({
  hero: { paddingHorizontal: 20, paddingBottom: 60, overflow: 'hidden' },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  brand: { flexDirection: 'row', alignItems: 'center', flexShrink: 1, gap: 10 },
  logo: { width: 96, height: 76 },
  logoSmall: { width: 56, height: 44 },
  divider: { width: 2, height: 44, backgroundColor: 'rgba(255,255,255,0.7)', borderRadius: 1 },
  brandName: { fontSize: 28, fontWeight: '900', color: '#fff', letterSpacing: 0.5 },
  brandAccent: { color: '#fbbf24' },
  proBadge: { color: '#fbbf24', fontSize: 14, fontWeight: '900' },
  brandSub: { fontSize: 14, color: 'rgba(255,255,255,0.9)', marginTop: 2 },
  icons: { flexDirection: 'row', gap: 4 },
  iconBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.14)' },
  greeting: { fontSize: 34, fontWeight: '800', color: '#fff', textShadowColor: 'rgba(0,0,0,0.45)', textShadowRadius: 8 },
  sub: { fontSize: 15, color: 'rgba(255,255,255,0.92)', marginTop: 6, textShadowColor: 'rgba(0,0,0,0.35)', textShadowRadius: 4 },
  companyLogoBox: { borderRadius: 14, backgroundColor: '#fff', marginBottom: 14, overflow: 'hidden' },
});

import React from 'react';
import { TouchableOpacity, Text, StyleSheet, Alert } from 'react-native';
import { useRouter } from 'expo-router';

// Kleines „?“ – öffnet direkt das passende Kapitel der Bedienungsanleitung
// confirmLeave: vorher nachfragen (z. B. wenn ungespeicherte Eingaben verloren gehen würden)
export function HelpButton({ section, onBeforeOpen, light, testID, confirmLeave }: { section: string; onBeforeOpen?: () => void; light?: boolean; testID?: string; confirmLeave?: string }) {
  const router = useRouter();
  const open = () => { onBeforeOpen?.(); router.push({ pathname: '/help', params: { section } }); };
  return (
    <TouchableOpacity
      testID={testID || `help-btn-${section}`}
      accessibilityLabel="Hilfe öffnen"
      hitSlop={8}
      style={[s.btn, light ? s.light : s.dark]}
      onPress={() => confirmLeave
        ? Alert.alert('Hilfe öffnen?', confirmLeave, [{ text: 'Abbrechen', style: 'cancel' }, { text: 'Hilfe öffnen', style: 'destructive', onPress: open }])
        : open()}
    >
      <Text style={[s.text, { color: light ? '#fff' : '#1976d2' }]}>?</Text>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  btn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', borderWidth: 2 },
  dark: { borderColor: '#1976d2', backgroundColor: '#eff6ff' },
  light: { borderColor: 'rgba(255,255,255,0.9)', backgroundColor: 'rgba(255,255,255,0.15)' },
  text: { fontSize: 18, fontWeight: '900', marginTop: -1 },
});

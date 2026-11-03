import React from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';

// Kleines „?“ – öffnet direkt das passende Kapitel der Bedienungsanleitung
export function HelpButton({ section, onBeforeOpen, light, testID }: { section: string; onBeforeOpen?: () => void; light?: boolean; testID?: string }) {
  const router = useRouter();
  return (
    <TouchableOpacity
      testID={testID || `help-btn-${section}`}
      accessibilityLabel="Hilfe öffnen"
      hitSlop={8}
      style={[s.btn, light ? s.light : s.dark]}
      onPress={() => { onBeforeOpen?.(); router.push({ pathname: '/help', params: { section } }); }}
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

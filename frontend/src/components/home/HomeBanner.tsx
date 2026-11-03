import React from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import Ionicons from '@react-native-vector-icons/ionicons';

// Hinweis-Karte (Backup empfohlen, Speicher-Bereinigung)
type Props = {
  testID: string;
  icon: any;
  title: string;
  text: string;
  button: string;
  color: string;
  bg: string;
  busy?: boolean;
  onPress: () => void;
  onDismiss: () => void;
};

export function HomeBanner({ testID, icon, title, text, button, color, bg, busy, onPress, onDismiss }: Props) {
  return (
    <View testID={testID} style={[s.card, { backgroundColor: bg }]}>
      <Ionicons name={icon} size={20} color={color} />
      <View style={{ flex: 1 }}>
        <Text style={[s.title, { color }]} numberOfLines={1}>{title}</Text>
        <Text style={s.text} numberOfLines={1}>{text}</Text>
      </View>
      <TouchableOpacity testID={`${testID}-action`} style={[s.btn, { backgroundColor: color }]} onPress={onPress} disabled={busy}>
        {busy ? <ActivityIndicator size="small" color="#fff" /> : <Text style={s.btnText}>{button}</Text>}
      </TouchableOpacity>
      {!busy && (
        <TouchableOpacity testID={`${testID}-dismiss`} onPress={onDismiss} hitSlop={10} style={s.close}>
          <Ionicons name="close" size={18} color="#64748b" />
        </TouchableOpacity>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  card: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 12, paddingVertical: 8, paddingHorizontal: 12, minHeight: 52 },
  title: { fontSize: 13, fontWeight: '800' },
  text: { fontSize: 11, color: '#475569', marginTop: 1 },
  btn: { borderRadius: 8, paddingHorizontal: 12, minHeight: 34, alignItems: 'center', justifyContent: 'center' },
  btnText: { color: '#fff', fontWeight: '800', fontSize: 12 },
  close: { padding: 2 },
});

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
      <View style={[s.icon, { backgroundColor: color + '22' }]}>
        <Ionicons name={icon} size={24} color={color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[s.title, { color }]}>{title}</Text>
        <Text style={s.text}>{text}</Text>
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
  card: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 16, padding: 14, minHeight: 72 },
  icon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 15, fontWeight: '800' },
  text: { fontSize: 12, color: '#475569', marginTop: 2 },
  btn: { borderRadius: 10, paddingHorizontal: 12, minHeight: 40, minWidth: 80, alignItems: 'center', justifyContent: 'center' },
  btnText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  close: { padding: 2 },
});

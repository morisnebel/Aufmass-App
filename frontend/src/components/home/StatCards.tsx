import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Ionicons from '@react-native-vector-icons/ionicons';
import { cardShadow } from './HomeTiles';

export type StatItem = { key: string; label: string; count: number; icon: any; color: string; onPress: () => void };

// Zahlen-Karten (Projekte gesamt + je Status), gleichmäßig in Spalten verteilt
export function StatCards({ items, columns }: { items: StatItem[]; columns: number }) {
  const rows: StatItem[][] = [];
  for (let i = 0; i < items.length; i += columns) rows.push(items.slice(i, i + columns));
  return (
    <View style={{ gap: 12 }}>
      {rows.map((row, ri) => (
        <View key={ri} style={{ flexDirection: 'row', gap: 12 }}>
          {row.map(item => (
            <TouchableOpacity key={item.key} testID={`home-stat-${item.key}`} style={s.card} onPress={item.onPress} activeOpacity={0.85}>
              <View style={[s.icon, { backgroundColor: item.color + '1f' }]}>
                <Ionicons name={item.icon} size={24} color={item.color} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.count}>{item.count}</Text>
                <Text style={s.label} numberOfLines={1}>{item.label}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#64748b" />
            </TouchableOpacity>
          ))}
          {/* Leere Plätze auffüllen, damit Karten gleich breit bleiben */}
          {Array.from({ length: columns - row.length }).map((_, i) => <View key={`f${i}`} style={{ flex: 1 }} />)}
        </View>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  card: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(255,255,255,0.96)', borderRadius: 16, padding: 10, minHeight: 72, ...cardShadow },
  icon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  count: { fontSize: 22, fontWeight: '900', color: '#0f172a' },
  label: { fontSize: 12, color: '#334155', fontWeight: '600' },
});

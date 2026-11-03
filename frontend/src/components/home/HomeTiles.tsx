import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Ionicons from '@react-native-vector-icons/ionicons';

// Gemeinsame Kachel-Bausteine der Startseite
export type HomeTile = {
  key: string;
  title: string;
  subtitle?: string;
  icon: any;
  color: string;
  bg: string;
  onPress: () => void;
};

// Teilt Kacheln gleichmäßig auf (Spalten nach Bildschirmbreite, letzte Zeile füllt auf)
export function TileGrid({ tiles, columns, variant }: { tiles: HomeTile[]; columns: number; variant: 'action' | 'nav' }) {
  const rows: HomeTile[][] = [];
  for (let i = 0; i < tiles.length; i += columns) rows.push(tiles.slice(i, i + columns));
  return (
    <View style={{ gap: 12 }}>
      {rows.map((row, ri) => (
        <View key={ri} style={{ flexDirection: 'row', gap: 12 }}>
          {row.map(tile => (variant === 'action' ? <ActionTile key={tile.key} tile={tile} /> : <NavTile key={tile.key} tile={tile} />))}
        </View>
      ))}
    </View>
  );
}

function ActionTile({ tile }: { tile: HomeTile }) {
  const primary = tile.key === 'new-project';
  return (
    <TouchableOpacity
      testID={`home-action-${tile.key}`}
      style={[s.action, { backgroundColor: primary ? '#1565c0' : tile.bg }]}
      onPress={tile.onPress}
      activeOpacity={0.85}
    >
      <Ionicons name={tile.icon} size={28} color={primary ? '#fff' : tile.color} />
      <Text style={[s.actionText, primary && { color: '#fff' }]} numberOfLines={2}>{tile.title}</Text>
    </TouchableOpacity>
  );
}

function NavTile({ tile }: { tile: HomeTile }) {
  return (
    <TouchableOpacity testID={`home-nav-${tile.key}`} style={s.nav} onPress={tile.onPress} activeOpacity={0.85}>
      <View style={[s.navIcon, { backgroundColor: tile.bg }]}>
        <Ionicons name={tile.icon} size={24} color={tile.color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.navTitle} numberOfLines={1}>{tile.title}</Text>
        {!!tile.subtitle && <Text style={s.navSub} numberOfLines={1}>{tile.subtitle}</Text>}
      </View>
      <Ionicons name="chevron-forward" size={18} color="#94a3b8" />
    </TouchableOpacity>
  );
}

export const cardShadow = {
  shadowColor: '#0f2a5c',
  shadowOpacity: 0.08,
  shadowRadius: 12,
  shadowOffset: { width: 0, height: 4 },
  elevation: 3,
};

const s = StyleSheet.create({
  action: { flex: 1, minHeight: 96, borderRadius: 16, alignItems: 'center', justifyContent: 'center', padding: 10, gap: 6 },
  actionText: { fontSize: 13, fontWeight: '700', color: '#1e293b', textAlign: 'center' },
  nav: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff', borderRadius: 16, padding: 14, minHeight: 72, ...cardShadow },
  navIcon: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  navTitle: { fontSize: 16, fontWeight: '800', color: '#0f172a' },
  navSub: { fontSize: 12, color: '#64748b', marginTop: 2 },
});

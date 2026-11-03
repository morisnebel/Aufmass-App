import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Ionicons from '@react-native-vector-icons/ionicons';
import { ProjectFolder } from '../../../services/ProjectFolders';

// Ablage-Ziele beim Ziehen eines Projekts (Gedrückthalten + Ziehen)
export const DROP_NONE = '__none__';
export const DROP_NEW = '__new__';

type Rect = { x: number; y: number; w: number; h: number };

type Props = {
  folders: ProjectFolder[];
  projectName: string;
  pos: { x: number; y: number }; // Fingerposition in Fenster-Koordinaten
  origin: { x: number; y: number }; // Fensterposition dieses Overlays (für Umrechnung)
  onHover: (targetId: string | null) => void;
};

export function FolderDropOverlay({ folders, projectName, pos, origin, onHover }: Props) {
  const rects = useRef<Record<string, Rect>>({});
  const refs = useRef<Record<string, any>>({});
  const [hover, setHover] = useState<string | null>(null);

  const measure = (id: string) => {
    refs.current[id]?.measureInWindow((x: number, y: number, w: number, h: number) => { rects.current[id] = { x, y, w, h }; });
  };

  useEffect(() => {
    const hit = Object.entries(rects.current).find(([, r]) =>
      pos.x >= r.x && pos.x <= r.x + r.w && pos.y >= r.y && pos.y <= r.y + r.h);
    const id = hit ? hit[0] : null;
    if (id !== hover) { setHover(id); onHover(id); }
  }, [pos.x, pos.y, hover, onHover]);

  const target = (id: string, label: string, color: string, icon: any) => (
    <View
      key={id}
      testID={`drop-target-${id}`}
      ref={r => { refs.current[id] = r; }}
      onLayout={() => measure(id)}
      style={[s.target, { borderColor: color }, hover === id && { backgroundColor: color, transform: [{ scale: 1.06 }] }]}
    >
      <Ionicons name={icon} size={22} color={hover === id ? '#fff' : color} />
      <Text style={[s.targetText, hover === id && { color: '#fff' }]} numberOfLines={2}>{label}</Text>
    </View>
  );

  return (
    <View style={[StyleSheet.absoluteFill, { zIndex: 1000, elevation: 1000 }]} pointerEvents="none">
      <View style={s.panel}>
        <Text style={s.title}>Auf einen Ordner ziehen und loslassen</Text>
        <View style={s.grid}>
          {folders.map(f => target(f.id, f.name, f.color, 'folder'))}
          {target(DROP_NONE, 'Ohne Ordner', '#64748b', 'folder-open-outline')}
          {target(DROP_NEW, 'Neuer Ordner', '#16a34a', 'add-circle-outline')}
        </View>
      </View>
      {/* Mitgezogene Projekt-Karte */}
      <View style={[s.ghost, { left: pos.x - origin.x - 90, top: pos.y - origin.y - 70 }]}>
        <Ionicons name="folder" size={18} color="#1976d2" />
        <Text style={s.ghostText} numberOfLines={1}>{projectName}</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  panel: {
    position: 'absolute', top: 8, left: 8, right: 8, backgroundColor: 'rgba(255,255,255,0.97)', borderRadius: 18, padding: 12,
    shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 10,
  },
  title: { fontSize: 14, fontWeight: '800', color: '#0f172a', marginBottom: 10, textAlign: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center' },
  target: {
    width: 104, minHeight: 72, borderRadius: 14, borderWidth: 2, borderStyle: 'dashed', alignItems: 'center',
    justifyContent: 'center', padding: 6, gap: 4, backgroundColor: '#fff',
  },
  targetText: { fontSize: 12, fontWeight: '700', color: '#1e293b', textAlign: 'center' },
  ghost: {
    position: 'absolute', width: 180, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fff', borderRadius: 14,
    paddingHorizontal: 12, paddingVertical: 12, borderWidth: 2, borderColor: '#1976d2', opacity: 0.95,
    shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 12,
  },
  ghostText: { flex: 1, fontSize: 14, fontWeight: '700', color: '#0f172a' },
});

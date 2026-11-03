import React from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Ionicons from '@react-native-vector-icons/ionicons';
import { useRouter } from 'expo-router';

// Pro-Funktionen für Basic-Nutzer: kurz erklären, was sie bringen – „demnächst verfügbar“
export type ProFeatureKey = 'messung' | 'flaechen' | 'dach' | 'doku' | 'rapport' | 'team';

export const PRO_FEATURES: Record<ProFeatureKey, { label: string; icon: string; color: string; title: string; benefits: string[]; help: string }> = {
  messung: { label: 'Messung', icon: 'analytics-outline', color: '#14b8a6', title: 'Fotomessung', help: 'fotos',
    benefits: ['Strecken direkt im Foto messen', 'Referenz setzen mit bekannter Länge (z. B. Ziegel)', 'Messfotos im Projekt-PDF'] },
  flaechen: { label: 'Flächen', icon: 'grid-outline', color: '#f59e0b', title: 'Flächen-Kalkulator', help: 'dach',
    benefits: ['Beliebige Flächen berechnen', 'Abzüge für Fenster, Gauben & Co.', 'Netto-Fläche sofort im Projekt'] },
  dach: { label: 'Dach', icon: 'home-outline', color: '#ef4444', title: 'Dach-Aufmaß', help: 'dach',
    benefits: ['Sattel-, Walm-, Pultdach u. v. m.', 'Dachfläche und Firsthöhe aus Maßen und Neigung', 'Dachüberstände berücksichtigen'] },
  doku: { label: 'Doku', icon: 'folder-outline', color: '#6366f1', title: 'Dokumente', help: 'projekte',
    benefits: ['Pläne, Angebote und PDFs im Projekt ablegen', 'Alles zur Baustelle an einem Ort', 'Offline verfügbar'] },
  rapport: { label: 'Rapport', icon: 'clipboard-outline', color: '#0d9488', title: 'Rapporte', help: 'rapporte',
    benefits: ['Arbeitszeiten und Fahrten erfassen', 'Material übernehmen', 'Rapport als PDF für den Kunden'] },
  team: { label: 'Team & Material', icon: 'people-circle-outline', color: '#1d4ed8', title: 'Mitarbeiter, Material & Maschinen', help: 'rapporte',
    benefits: ['Mitarbeiter und Stunden verwalten', 'Materiallisten und Bestand', 'Maschinen mit TÜV-Erinnerung'] },
};

export function ProTeaser({ feature, onClose }: { feature: ProFeatureKey | null; onClose: () => void }) {
  const router = useRouter();
  const f = feature ? PRO_FEATURES[feature] : null;
  return (
    <Modal visible={!!f} transparent animationType="fade" onRequestClose={onClose}>
      <View style={s.backdrop}>
        {f && (
          <View style={s.box} testID="pro-teaser">
            <View style={[s.icon, { backgroundColor: f.color + '22' }]}><Ionicons name={f.icon as any} size={30} color={f.color} /></View>
            <View style={s.badge}><Ionicons name="star" size={12} color="#fff" /><Text style={s.badgeText}>PRO</Text></View>
            <Text style={s.title}>{f.title}</Text>
            {f.benefits.map(b => (
              <View key={b} style={s.row}><Ionicons name="checkmark-circle" size={18} color="#16a34a" /><Text style={s.text}>{b}</Text></View>
            ))}
            <View style={s.soon}><Ionicons name="time-outline" size={18} color="#d97706" /><Text style={s.soonText}>Demnächst in Aufmaßprofi Pro verfügbar.</Text></View>
            <View style={s.btnRow}>
              <TouchableOpacity testID="pro-teaser-help" style={[s.btn, { backgroundColor: '#f1f5f9' }]} onPress={() => { onClose(); router.push({ pathname: '/help', params: { section: f.help } }); }}>
                <Text style={[s.btnText, { color: '#334155' }]}>Mehr erfahren</Text>
              </TouchableOpacity>
              <TouchableOpacity testID="pro-teaser-close" style={[s.btn, { backgroundColor: '#1565c0' }]} onPress={onClose}>
                <Text style={[s.btnText, { color: '#fff' }]}>Verstanden</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>
    </Modal>
  );
}

// Gesperrter Reiter/Knopf mit Schloss und PRO-Kennzeichnung
export function ProLockedPill({ feature, onPress, style }: { feature: ProFeatureKey; onPress: (f: ProFeatureKey) => void; style?: any }) {
  const f = PRO_FEATURES[feature];
  return (
    <TouchableOpacity testID={`pro-locked-${feature}`} style={[s.pill, style]} onPress={() => onPress(feature)} activeOpacity={0.7}>
      <Ionicons name={f.icon as any} size={20} color="#94a3b8" />
      <Text style={s.pillText}>{f.label}</Text>
      <View style={s.lock}><Ionicons name="lock-closed" size={10} color="#fff" /><Text style={s.lockText}>PRO</Text></View>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  box: { width: '100%', maxWidth: 400, backgroundColor: '#fff', borderRadius: 18, padding: 20, alignItems: 'stretch' },
  icon: { width: 60, height: 60, borderRadius: 18, alignItems: 'center', justifyContent: 'center', alignSelf: 'center' },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'center', backgroundColor: '#d97706', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 3, marginTop: 10 },
  badgeText: { color: '#fff', fontWeight: '900', fontSize: 12 },
  title: { fontSize: 20, fontWeight: '800', color: '#0f172a', textAlign: 'center', marginTop: 8, marginBottom: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  text: { flex: 1, fontSize: 15, color: '#334155' },
  soon: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fff7e6', borderRadius: 10, padding: 10, marginTop: 6 },
  soonText: { flex: 1, color: '#92400e', fontWeight: '700', fontSize: 14 },
  btnRow: { flexDirection: 'row', gap: 10, marginTop: 16 },
  btn: { flex: 1, minHeight: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  btnText: { fontSize: 15, fontWeight: '800' },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, minHeight: 40, borderRadius: 20, backgroundColor: '#f1f5f9', borderWidth: 1, borderColor: '#e2e8f0', borderStyle: 'dashed', marginRight: 8 },
  pillText: { fontSize: 14, fontWeight: '600', color: '#475569' },
  lock: { flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: '#d97706', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 },
  lockText: { color: '#fff', fontSize: 11, fontWeight: '900' },
});

import React, { useEffect, useState } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, useWindowDimensions } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Erste-Schritte-Tour: hebt nacheinander die wichtigsten Buttons der Startseite hervor
export const TOUR_DONE_KEY = 'aufmassprofi_tour_done';

const targets: Record<string, any> = {};
export const tourRef = (key: string) => (el: any) => { if (el) targets[key] = el; };

export type TourStep = { key: string | null; title: string; text: string };
const STEPS: TourStep[] = [
  { key: null, title: 'Willkommen bei Aufmaßprofi 👋', text: 'In 6 kurzen Schritten zeigen wir dir die wichtigsten Buttons. Du kannst die Tour jederzeit überspringen.' },
  { key: 'cta', title: 'Neues Projekt starten', text: 'Hier beginnt jedes Aufmaß: Projekt anlegen, Kunde wählen – danach Skizzen, Fotos und Flächen erfassen.' },
  { key: 'termin', title: 'Termine planen', text: 'Lege Baustellentermine mit Erinnerung, Abfahrtszeit und Navi-Adresse an.' },
  { key: 'search', title: 'Suche', text: 'Finde Projekte, Kunden und Notizen blitzschnell.' },
  { key: 'backup', title: 'Datensicherung', text: 'Alle Daten liegen nur auf deinem Gerät. Erstelle hier regelmäßig ein Backup.' },
  { key: 'settings', title: 'Einstellungen', text: 'Logo, Firmendaten und PDF-Layout einstellen. Dort findest du auch die Bedienungsanleitung und kannst diese Tour erneut starten.' },
];

type Rect = { x: number; y: number; w: number; h: number };

export function HomeTour({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  return <SpotlightTour visible={visible} onClose={onClose} steps={STEPS} storageKey={TOUR_DONE_KEY} />;
}

// Allgemeine Spotlight-Tour (Startseite, Skizze …)
export function SpotlightTour({ visible, onClose, steps: STEPS, storageKey }: { visible: boolean; onClose: () => void; steps: TourStep[]; storageKey: string }) {
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const { width: W, height: H } = useWindowDimensions();
  const step = STEPS[i];

  useEffect(() => { if (visible) setI(0); }, [visible]);
  useEffect(() => {
    setRect(null);
    if (!visible || !step.key) return;
    const el = targets[step.key];
    if (!el?.measureInWindow) return;
    const t = setTimeout(() => el.measureInWindow((x: number, y: number, w: number, h: number) => {
      // Nur hervorheben, wenn das Ziel sichtbar ist
      if (w > 0 && h > 0 && y >= 0 && y + h <= H && x >= 0 && x + w <= W) setRect({ x, y, w, h });
    }), 50);
    return () => clearTimeout(t);
  }, [visible, i, step.key, H, W]);

  const finish = () => { AsyncStorage.setItem(storageKey, '1').catch(() => {}); onClose(); };
  const next = () => (i < STEPS.length - 1 ? setI(i + 1) : finish());

  const pad = 6;
  const r = rect ? { x: rect.x - pad, y: rect.y - pad, w: rect.w + pad * 2, h: rect.h + pad * 2 } : null;
  const cardBelow = r ? r.y + r.h + 220 < H : true;
  const dim = 'rgba(15,23,42,0.72)';

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={finish}>
      <View style={StyleSheet.absoluteFill} testID="home-tour">
        {r ? (
          <>
            <View style={[s.dim, { backgroundColor: dim, top: 0, left: 0, right: 0, height: Math.max(0, r.y) }]} />
            <View style={[s.dim, { backgroundColor: dim, top: r.y + r.h, left: 0, right: 0, bottom: 0 }]} />
            <View style={[s.dim, { backgroundColor: dim, top: r.y, left: 0, width: Math.max(0, r.x), height: r.h }]} />
            <View style={[s.dim, { backgroundColor: dim, top: r.y, left: r.x + r.w, right: 0, height: r.h }]} />
            <View pointerEvents="none" style={[s.ring, { top: r.y, left: r.x, width: r.w, height: r.h }]} />
          </>
        ) : (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: dim }]} />
        )}
        <View
          style={[s.card, { left: 16, width: Math.min(W - 32, 420) },
            r ? (cardBelow ? { top: r.y + r.h + 14 } : { top: Math.max(16, r.y - 214) }) : { top: H / 2 - 110, alignSelf: 'center' }]}
        >
          <Text style={s.count}>Schritt {i + 1} von {STEPS.length}</Text>
          <Text style={s.title}>{step.title}</Text>
          <Text style={s.text}>{step.text}</Text>
          <View style={s.row}>
            <TouchableOpacity testID="tour-skip" style={s.skip} onPress={finish} disabled={i === STEPS.length - 1}>
              <Text style={s.skipText}>{i < STEPS.length - 1 ? 'Überspringen' : ''}</Text>
            </TouchableOpacity>
            <View style={s.dots}>
              {STEPS.map((_, k) => <View key={k} style={[s.dot, k === i && s.dotOn]} />)}
            </View>
            <TouchableOpacity testID="tour-next" style={s.next} onPress={next}>
              <Text style={s.nextText}>{i < STEPS.length - 1 ? 'Weiter' : 'Los geht’s'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  dim: { position: 'absolute' },
  ring: { position: 'absolute', borderRadius: 14, borderWidth: 3, borderColor: '#facc15' },
  card: { position: 'absolute', backgroundColor: '#fff', borderRadius: 16, padding: 16, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 12, elevation: 10 },
  count: { fontSize: 12, fontWeight: '700', color: '#1976d2', marginBottom: 4 },
  title: { fontSize: 18, fontWeight: '800', color: '#0f172a' },
  text: { fontSize: 15, color: '#334155', marginTop: 6, lineHeight: 21 },
  row: { flexDirection: 'row', alignItems: 'center', marginTop: 14 },
  skip: { minHeight: 44, justifyContent: 'center', paddingRight: 8, minWidth: 90 },
  skipText: { color: '#64748b', fontWeight: '700', fontSize: 14 },
  dots: { flex: 1, flexDirection: 'row', justifyContent: 'center', gap: 5 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#cbd5e1' },
  dotOn: { backgroundColor: '#1976d2', width: 16 },
  next: { minHeight: 44, paddingHorizontal: 18, borderRadius: 12, backgroundColor: '#1565c0', justifyContent: 'center' },
  nextText: { color: '#fff', fontWeight: '800', fontSize: 15 },
});

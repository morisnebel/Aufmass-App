import React, { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SpotlightTour, TourStep } from './home/HomeTour';
import { SketchDemoModal } from './SketchDemo';
import { useRouter } from 'expo-router';
import { TouchableOpacity, Text, StyleSheet, DeviceEventEmitter } from 'react-native';
import { SettingsService } from '../../services/LocalStorage';

// „?“ im Skizzen-Editor: öffnet die Video-Demo, von dort weiter zur Anleitung
export function SketchHelpButton() {
  const [demo, setDemo] = useState(false);
  const router = useRouter();
  return (
    <>
      <TouchableOpacity testID="sketch-help" accessibilityLabel="Hilfe und Video" hitSlop={8} style={hs.btn} onPress={() => setDemo(true)}>
        <Text style={hs.text}>?</Text>
      </TouchableOpacity>
      <SketchDemoModal visible={demo} onClose={() => setDemo(false)}
        onOpenManual={() => { setDemo(false); router.push({ pathname: '/help', params: { section: 'skizzen' } }); }} />
    </>
  );
}
const hs = StyleSheet.create({
  btn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'rgba(255,255,255,0.9)', backgroundColor: 'rgba(255,255,255,0.15)' },
  text: { fontSize: 18, fontWeight: '900', color: '#fff', marginTop: -1 },
});

// Skizzen-Tour: beim ersten Öffnen einer Skizze die wichtigsten Zeichenwerkzeuge zeigen
export const SKETCH_TOUR_KEY = 'aufmassprofi_sketch_tour_done';

const STEPS: TourStep[] = [
  { key: null, title: 'Deine erste Skizze ✏️', text: 'Kurz die wichtigsten Werkzeuge – danach kannst du direkt loszeichnen.' },
  { key: 'sk-toolbar', title: 'Werkzeugleiste', text: 'Hier findest du Fotos, Linien, Rechtecke, Flächen, Maßlinien, Text und Farben. Auf dem Handy seitlich wischen für weitere Werkzeuge.' },
  { key: 'sk-zoom', title: 'Zoom an/aus', text: 'Grün = Zoom aktiv: mit zwei Fingern zoomen und verschieben. Rot = Zoom aus, damit beim Zeichnen nichts verrutscht.' },
  { key: null, title: 'Maße eintragen', text: 'Linie antippen und die Länge eingeben – die Linie passt sich an. Geschlossene Flächen werden automatisch in m² berechnet.' },
  { key: 'sk-undo', title: 'Rückgängig & Wiederholen', text: 'Ein falscher Strich? Einfach den letzten Schritt rückgängig machen.' },
  { key: 'sk-save', title: 'Speichern', text: 'Mit dem Haken speicherst du die Skizze – sie erscheint im Projekt und im PDF.' },
  { key: 'sk-help', title: 'Hilfe & Video', text: 'Über das ? startest du jederzeit die kurze Video-Demo und die Anleitung zu Skizzen.' },
];

export function SketchTour() {
  const [visible, setVisible] = useState(false);
  const [demo, setDemo] = useState(false);
  useEffect(() => {
    let t: any;
    // Erst nach bestätigten Hinweisen starten (sonst liegt die Tour über dem Willkommens-Fenster)
    const check = async () => {
      const [done, settings] = await Promise.all([AsyncStorage.getItem(SKETCH_TOUR_KEY), SettingsService.get().catch(() => ({}))]);
      if (!done && (settings as any)?.disclaimer_accepted_at) { clearTimeout(t); t = setTimeout(() => setVisible(true), 1200); }
    };
    check().catch(() => {});
    const sub = DeviceEventEmitter.addListener('disclaimer-accepted', () => { check().catch(() => {}); });
    return () => { clearTimeout(t); sub.remove(); };
  }, []);
  return (
    <>
      <SpotlightTour visible={visible} onClose={() => setVisible(false)} steps={STEPS} storageKey={SKETCH_TOUR_KEY}
        finalAction={{ label: '▶ Video ansehen', onPress: () => setTimeout(() => setDemo(true), 350) }} />
      <SketchDemoModal visible={demo} onClose={() => setDemo(false)} />
    </>
  );
}

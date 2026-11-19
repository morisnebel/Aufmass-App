import React, { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SpotlightTour, TourStep } from './home/HomeTour';
import { DeviceEventEmitter } from 'react-native';
import { SettingsService } from '../../services/LocalStorage';



// Skizzen-Tour: beim ersten Öffnen einer Skizze die wichtigsten Zeichenwerkzeuge zeigen
export const SKETCH_TOUR_KEY = 'aufmassprofi_sketch_tour_done';

const STEPS: TourStep[] = [
  { key: null, title: 'Deine erste Skizze ✏️', text: 'Kurz die wichtigsten Werkzeuge – danach kannst du direkt loszeichnen.' },
  { key: 'sk-toolbar', title: 'Werkzeugleiste', text: 'Hier findest du Fotos, Linien, Rechtecke, Flächen, Maßlinien, Text und Farben. Auf dem Handy seitlich wischen für weitere Werkzeuge.' },
  { key: 'sk-zoom', title: 'Zoom an/aus', text: 'Grün = Zoom aktiv: mit zwei Fingern zoomen und verschieben. Rot = Zoom aus, damit beim Zeichnen nichts verrutscht.' },
  { key: null, title: 'Maße eintragen', text: 'Linie antippen und das Maß eingeben – es wird an der Linie angezeigt. Die Zeichnung selbst ändert sich dabei nicht.' },
  { key: 'sk-undo', title: 'Rückgängig & Wiederholen', text: 'Ein falscher Strich? Einfach den letzten Schritt rückgängig machen.' },
  { key: 'sk-save', title: 'Speichern', text: 'Mit dem Haken speicherst du die Skizze – sie erscheint im Projekt und im PDF.' },
  { key: 'sk-help', title: 'Hilfe', text: 'Über das ? öffnest du jederzeit die Anleitung zu Skizzen. Im Maß-Fenster unter „Mehr“ gibt es ein Tutorial zu Räumen, Türen und Fenstern.' },
];

export function SketchTour() {
  const [visible, setVisible] = useState(false);
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
  return <SpotlightTour visible={visible} onClose={() => setVisible(false)} steps={STEPS} storageKey={SKETCH_TOUR_KEY} />;
}

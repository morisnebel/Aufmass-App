import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Ionicons from '@react-native-vector-icons/ionicons';
import { ButtonChips, SketchButtonKey } from './ButtonChips';

// Tutorial zum Mitmachen: begleitet die Schritte in einer leeren Übungsskizze im echten Editor.
// Jeder Schritt wird automatisch abgehakt, sobald der Editor den passenden Zustand erreicht hat.
export type RoomCoachStatus = {
  roomClosed: boolean; // ein geschlossener Raum ist gezeichnet
  lineSelected: boolean; // Maß-Fenster offen, Linie des Raums gewählt
  allMeasured: boolean; // alle Seiten bemaßt
  pointsKey: string; // Eckpunkte des Raums (ändert sich beim Verschieben)
  determined: boolean; // Form durch Winkel/Diagonale/rechtwinklig eindeutig bestimmt
  straight: boolean; // Zeichnung passt zur berechneten Form
  hasHeight: boolean; // Wandhöhe eingetragen
  openingCount: number; // Türen/Fenster am Raum
  openingKey: string; // Lage der Öffnungen (ändert sich beim Ziehen)
};

type Step = { title: string; buttons: SketchButtonKey[]; text: string; done: (status: RoomCoachStatus, start: RoomCoachStatus) => boolean };
const STEPS: Step[] = [
  { title: 'Raum zeichnen', buttons: ['polygon', 'tap', 'finishRoom'], text: 'Wähle in der Werkzeugleiste „Polygon“ und tippe vier Ecken an. Zum Schließen tippst du wieder auf den ersten Punkt.', done: s => s.roomClosed },
  { title: 'Linie anwählen', buttons: ['edit', 'tap'], text: 'Wechsle auf „Bearbeiten“ (Hand) und tippe eine Linie des Raums an. Das Maß-Fenster öffnet sich.', done: s => s.lineSelected || s.allMeasured },
  { title: 'Alle Seiten bemaßen', buttons: ['tap', 'add'], text: 'Tippe für jede Linie ein Maß ein (z. B. 4 und 3) und bestätige mit „Hinzufügen“. Danach die nächste Linie antippen, bis die m² erscheinen.', done: s => s.allMeasured },
  { title: 'Eine Ecke verschieben', buttons: ['closePanel', 'points', 'drag'], text: 'Schließe das Maß-Fenster, schalte „Punkte“ ein und ziehe eine Ecke ein Stück zur Seite. Die m² bleiben gleich.', done: (s, start) => s.pointsKey !== start.pointsKey },
  { title: 'Diagonale eingeben', buttons: ['diagonals', 'rightAngles'], text: 'Die App hat die passende Diagonale angelegt und ihr Feld gewählt. Tippe eine Länge ein (bei 4 × 3 m z. B. 5). Alternativ „Alle Ecken rechtwinklig“ einschalten.', done: s => s.determined },
  { title: 'Skizze geraderücken', buttons: ['more', 'straighten'], text: 'Tippe im Maß-Fenster unter „Mehr“ auf „Skizze geraderücken“. Die Zeichnung springt auf die berechnete Form.', done: s => s.determined && s.straight },
  { title: 'Wandhöhe eintragen', buttons: ['more', 'wall'], text: 'Unter „Mehr“ den Bereich „Wandhöhe“ aufklappen, „Höhe alle Linien“ antippen und z. B. 2,5 eintippen.', done: s => s.hasHeight },
  { title: 'Tür oder Fenster einfügen', buttons: ['longPress'], text: 'Halte eine Linie des Raums etwa eine halbe Sekunde gedrückt und wähle Tür oder Fenster.', done: s => s.openingCount > 0 },
  { title: 'Öffnung verschieben', buttons: ['closePanel', 'drag'], text: 'Schließe das Maß-Fenster und ziehe die Markierung der Öffnung auf ihrer Linie an eine andere Stelle. Die Maßkette zeigt die Abstände.', done: (s, start) => s.openingCount > 0 && s.openingKey !== start.openingKey },
];

// compact: Maß-Fenster ist auf einem kleinen Bildschirm offen – Karte klappt zur schmalen Leiste ein
// (maxWidth = freier Platz neben dem Fenster), Antippen klappt sie wieder auf.
export function RoomCoach({ status, bottom, onExit, compact, maxWidth, onStep }: { status: RoomCoachStatus; bottom: number; onExit: () => void; compact?: boolean; maxWidth?: number; onStep?: (buttons: SketchButtonKey[]) => void }) {
  const [index, setIndex] = useState(0);
  const [toggled, setToggled] = useState<boolean | null>(null);
  useEffect(() => { setToggled(null); }, [compact, index]);
  // Knöpfe des aktuellen Schritts melden (leuchten in der Werkzeugleiste auf)
  useEffect(() => { onStep?.(index < STEPS.length ? STEPS[index].buttons : []); }, [index]);
  const small = toggled ?? !!compact;
  const setSmall = (value: boolean) => setToggled(value);
  const start = useRef(status);
  const finished = index >= STEPS.length;
  const step = STEPS[Math.min(index, STEPS.length - 1)];
  const done = !finished && step.done(status, start.current);
  // Erledigten Schritt kurz mit Haken zeigen, dann weiter (Startzustand für den nächsten Schritt merken)
  const latest = useRef(status);
  latest.current = status;
  useEffect(() => {
    if (!done) return;
    const timer = setTimeout(() => { start.current = latest.current; setIndex(i => i + 1); }, 900);
    return () => clearTimeout(timer);
  }, [done, index]);

  return (
    <View pointerEvents="box-none" style={[s.wrap, { bottom }]}>
      <View testID="room-coach" style={[s.card, small && !!maxWidth && { maxWidth }]}>
        <TouchableOpacity testID="room-coach-toggle" style={s.head} onPress={() => setSmall(!small)} activeOpacity={0.7}>
          <Ionicons name={small && done ? 'checkmark-circle' : 'school'} size={16} color="#fff" />
          <Text testID="room-coach-count" style={s.headText} numberOfLines={small ? 2 : 1}>
            {finished ? 'Übung geschafft' : small ? `${index + 1}/${STEPS.length} · ${step.title}` : `Übung · Schritt ${index + 1} von ${STEPS.length}`}
          </Text>
          <Ionicons name={small ? 'chevron-up' : 'chevron-down'} size={18} color="#fff" />
        </TouchableOpacity>
        {!small && (
          <View style={s.body}>
            {finished ? (
              <Text style={s.text}>Du hast alle Schritte geschafft. Beim Beenden kommt deine eigene Skizze unverändert zurück.</Text>
            ) : (
              <>
                <View style={s.titleRow}>
                  <Ionicons name={done ? 'checkmark-circle' : 'ellipse-outline'} size={20} color={done ? '#2e7d32' : '#94a3b8'} />
                  <Text testID="room-coach-title" style={[s.title, done && s.titleDone]}>{step.title}</Text>
                </View>
                <Text style={s.text}>{step.text}</Text>
                <ButtonChips keys={step.buttons} small />
              </>
            )}
            <View style={s.row}>
              <Text style={s.note} numberOfLines={2}>Übungsskizze – wird nicht gespeichert</Text>
              {!finished && (
                <TouchableOpacity testID="room-coach-skip" style={s.skip} onPress={() => { start.current = latest.current; setIndex(index + 1); }}>
                  <Text style={s.skipText}>Überspringen</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity testID="room-coach-exit" style={[s.exit, finished && s.exitDone]} onPress={onExit}>
                <Text style={[s.exitText, finished && s.exitTextDone]}>{finished ? 'Fertig' : 'Beenden'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { position: 'absolute', left: 8, right: 8, alignItems: 'flex-start', zIndex: 1001, elevation: 12 },
  card: { width: '100%', maxWidth: 340, borderRadius: 12, backgroundColor: '#fff', overflow: 'hidden', borderWidth: 2, borderColor: '#1565c0', shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 8, elevation: 8 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 40, paddingHorizontal: 10, backgroundColor: '#1565c0' },
  headText: { flex: 1, color: '#fff', fontSize: 13, fontWeight: '800' },
  body: { padding: 10, gap: 6 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  title: { flex: 1, fontSize: 15, fontWeight: '800', color: '#0f172a' },
  titleDone: { color: '#2e7d32' },
  text: { fontSize: 13, color: '#334155', lineHeight: 18 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  note: { flex: 1, fontSize: 10, fontWeight: '600', color: '#64748b' },
  skip: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 6 },
  skipText: { fontSize: 12, fontWeight: '700', color: '#64748b' },
  exit: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: '#cbd5e1' },
  exitDone: { backgroundColor: '#1565c0', borderColor: '#1565c0' },
  exitText: { fontSize: 13, fontWeight: '800', color: '#475569' },
  exitTextDone: { color: '#fff' },
});

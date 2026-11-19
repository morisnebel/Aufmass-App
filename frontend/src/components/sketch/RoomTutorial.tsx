import React, { useEffect, useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import Svg, { Circle, G, Line, Polygon, Rect, Text as SvgText } from 'react-native-svg';
import Ionicons from '@react-native-vector-icons/ionicons';
import { ButtonChips, SketchButtonKey } from './ButtonChips';

// Tutorial „Räume, Türen & Fenster“: Bilder mit kurzem Text zum Durchblättern.
// Zeigt Linien anwählen, Punkte verschieben, Winkel/Diagonalen, Geraderücken, Wandhöhe und Öffnungen. Läuft offline.
type Scene = 'draw' | 'select' | 'points' | 'angles' | 'straighten' | 'height' | 'insert' | 'move' | 'check' | 'pdf';
const STEPS: { scene: Scene; buttons: SketchButtonKey[]; title: string; text: string; hint?: string }[] = [
  { scene: 'draw', buttons: ['polygon', 'tap', 'finishRoom'], title: 'Raum zeichnen', text: 'Werkzeug „Polygon“ wählen und nacheinander jede Ecke antippen. Zum Schließen wieder auf den ersten Punkt tippen oder im kleinen Polygon-Fenster „Raum“ wählen („Linie“ beendet offen).', hint: 'Grob zeichnen reicht – gerechnet wird später mit deinen Maßen.' },
  { scene: 'select', buttons: ['edit', 'tap', 'add'], title: 'Linie anwählen und bemaßen', text: 'Auf „Bearbeiten“ (Hand) wechseln und eine Linie antippen. Das Maß-Fenster öffnet sich: Länge eintippen und „Hinzufügen“. Sind alle Seiten bemaßt, erscheinen die m².', hint: 'Die gewählte Linie ist orange. Mit „Nächste Linie“ springt die App automatisch weiter.' },
  { scene: 'points', buttons: ['points'], title: 'Einzelne Punkte verschieben', text: '„Punkte“ in der Werkzeugleiste einschalten, eine Ecke antippen, den Finger darauf halten und an die richtige Stelle schieben. In diesem Modus öffnet sich kein Maß-Fenster.', hint: 'Die Fläche ändert sich dabei nicht – sie hängt nur an deinen Maßen.' },
  { scene: 'angles', buttons: ['more', 'diagonals', 'angles'], title: 'Die fehlende Angabe: Diagonale oder Winkel', text: 'Die Seitenlängen allein legen einen Raum noch nicht fest – vier Seiten können ein Rechteck oder ein schiefes Viereck sein. Deshalb braucht die App noch eine Angabe. Im Maß-Fenster unter „Mehr“: „Diagonalen angeben“ (von Ecke zu Ecke messen) oder „Winkel angeben“ (rechte Ecke: Taste 90°). Der Hinweis oben im Bereich sagt, wie viele Angaben noch fehlen.', hint: 'Ein Viereck braucht 1 Angabe, ein Fünfeck 2, ein Achteck 5 (immer Ecken − 3). Rot heißt: Die Angabe passt nicht zu den übrigen Maßen und wird nicht verwendet.' },
  { scene: 'straighten', buttons: ['more', 'autoStraighten', 'straighten'], title: 'Skizze rückt sich von selbst gerade', text: 'Sobald der Raum eindeutig bestimmt ist, springt die Zeichnung automatisch auf die berechnete Form – auch bei jeder späteren Maßänderung. Die angetippte Linie bleibt an ihrem Platz. Vor der letzten Angabe passiert nichts, weil die Form noch nicht feststeht.', hint: 'Auf Fotos und Plänen bleibt die Zeichnung stehen. Unter „Mehr“ lässt sich die Automatik ausschalten; „Skizze geraderücken“ und „Alle Räume geraderücken“ gibt es weiter für den Handbetrieb. Rückgängig nimmt es zurück.' },
  { scene: 'height', buttons: ['more', 'wall'], title: 'Wandhöhe eintragen', text: 'Im Maß-Fenster „Mehr“ → „Wandhöhe“ aufklappen. „Höhe alle Linien“ gilt für den ganzen Raum, „Höhe diese Linie“ nur für die gewählte Wand.', hint: 'Mit Wandhöhe bekommen die Linien Nummern – sie passen zur Wandliste im PDF.' },
  { scene: 'insert', buttons: ['longPress', 'addOpening'], title: 'Tür oder Fenster einfügen', text: 'Eine Linie etwa eine halbe Sekunde gedrückt halten und Tür, Fenster oder Sonstiges wählen. Die Öffnung sitzt an der gedrückten Stelle. Alternativ im Wand-Bereich „+ Tür“ / „+ Fenster“.', hint: 'Breite × Höhe wird als Abzug von der Wandfläche gerechnet.' },
  { scene: 'move', buttons: [], title: 'Tür oder Fenster verschieben und ändern', text: 'Die Tür oder das Fenster auf der Linie antippen, den Finger darauf halten und verschieben – es stößt an Ecken und Nachbarn an, die Maßkette zeigt die Abstände zu beiden Ecken. Das Maß-Fenster darf dabei offen bleiben. Kurz antippen öffnet Breite, Höhe, Art und Abstand.', hint: '„Punkte“ muss zum Verschieben aus sein – beim Einfügen schaltet die App es selbst aus. T = Tür (braun), F = Fenster (blau), S = Sonstiges (grau).' },
  { scene: 'check', buttons: ['wall', 'copyOpening', 'tap'], title: 'Kopieren und Warnungen', text: '„Auf andere Linie kopieren“ und danach die Ziel-Linie antippen – gleiche Maße, neue Wand. Passt ein eingetippter Abstand nicht, wird er rot markiert.', hint: 'Rot mit ⚠: Die Öffnung ragt über die Linie hinaus oder überlappt eine andere.' },
  { scene: 'pdf', buttons: ['save'], title: 'Ergebnis im PDF', text: 'Mit dem Haken speichern. Im Projekt-PDF steht die Wandliste: je Wand Länge, Höhe, Abzüge mit Art und Abstand zur Ecke sowie die Netto-Fläche.' },
];

// Merker: Tutorial wurde nach dem ersten geschlossenen Raum schon einmal automatisch gezeigt
export const ROOM_TUTORIAL_KEY = 'aufmassprofi_room_tutorial_done';

const BLUE = '#1976d2';
const ORANGE = '#ff6d00';
const P = [[50, 50], [250, 50], [250, 160], [50, 160]];
const pointsOf = (pts: number[][]) => pts.map(p => p.join(',')).join(' ');
const finger = (x: number, y: number) => (
  <G>
    <Circle cx={x} cy={y} r={14} fill="rgba(245,158,11,0.25)" />
    <Circle cx={x} cy={y} r={6} fill="#f59e0b" />
  </G>
);
const label = (x: number, y: number, text: string, color = '#334155', size = 11) => (
  <SvgText x={x} y={y} fill={color} fontSize={size} fontWeight="bold" textAnchor="middle">{text}</SvgText>
);
const box = (x: number, y: number, w: number, h: number, lines: string[], color = '#334155') => (
  <G>
    <Rect x={x} y={y} width={w} height={h} rx={6} fill="#fff" stroke="#cbd5e1" strokeWidth={1.5} />
    {lines.map((t, i) => <SvgText key={i} x={x + 8} y={y + 16 + i * 15} fill={color} fontSize={10} fontWeight="bold">{t}</SvgText>)}
  </G>
);
const room = (pts = P, fill = '#e3f2fd', dashed = false) => (
  <Polygon points={pointsOf(pts)} fill={fill} stroke={dashed ? '#94a3b8' : BLUE} strokeWidth={2} strokeDasharray={dashed ? '6,4' : undefined} />
);
const corners = (pts = P) => pts.map(([x, y], i) => <Circle key={i} cx={x} cy={y} r={5} fill={BLUE} stroke="#fff" strokeWidth={1.5} />);
const opening = (x1: number, x2: number, y: number, color: string, door: boolean) => (
  <G>
    <Line x1={x1} y1={y} x2={x2} y2={y} stroke="#fff" strokeWidth={7} />
    <Line x1={x1} y1={y} x2={x2} y2={y} stroke={color} strokeWidth={door ? 2 : 4} strokeDasharray={door ? '4,3' : undefined} />
    <Line x1={x1} y1={y - 6} x2={x1} y2={y + 6} stroke={color} strokeWidth={2} />
    <Line x1={x2} y1={y - 6} x2={x2} y2={y + 6} stroke={color} strokeWidth={2} />
  </G>
);

function Illustration({ scene }: { scene: Scene }) {
  const skew = [[50, 50], [250, 50], [275, 160], [75, 160]];
  return (
    <Svg width="100%" height="100%" viewBox="0 0 300 200">
      <Rect x={0} y={0} width={300} height={200} fill="#f8fafc" />
      {scene === 'draw' && (
        <G>
          {room()}
          {corners()}
          {P.map(([x, y], i) => <G key={i}>{label(x + (i === 0 || i === 3 ? -14 : 14), y + 4, String(i + 1), BLUE, 12)}</G>)}
          {finger(50, 50)}
          {label(150, 110, 'Ecke für Ecke antippen')}
        </G>
      )}
      {scene === 'select' && (
        <G>
          {room()}
          <Line x1={50} y1={50} x2={250} y2={50} stroke={ORANGE} strokeWidth={5} />
          {corners()}
          {finger(150, 50)}
          {box(95, 80, 110, 52, ['Maß eingeben', '4,00 m   [Hinzufügen]', 'Linie 1 von 4'])}
          {label(150, 30, '4,00 m', BLUE)}
        </G>
      )}
      {scene === 'points' && (
        <G>
          {room(P, 'none', true)}
          {room([[50, 50], [250, 50], [270, 175], [50, 160]])}
          {corners([[50, 50], [250, 50], [270, 175], [50, 160]])}
          <Circle cx={270} cy={175} r={13} fill="rgba(255,109,0,0.18)" stroke={ORANGE} strokeWidth={3} />
          <Line x1={252} y1={162} x2={264} y2={171} stroke={ORANGE} strokeWidth={2} />
          {finger(270, 175)}
          {label(150, 110, '12,00 m² bleibt', '#2e7d32', 12)}
        </G>
      )}
      {scene === 'angles' && (
        <G>
          {room(skew)}
          <Line x1={50} y1={50} x2={275} y2={160} stroke="#2e7d32" strokeWidth={1.5} strokeDasharray="6,4" />
          {label(150, 98, '5,40', '#2e7d32')}
          {corners(skew)}
          {label(68, 68, '77,2°', '#777', 10)}
          {label(228, 68, '102,8°', '#777', 10)}
          {label(250, 148, '77,2°', '#777', 10)}
          {label(98, 148, '80°', '#d32f2f', 10)}
          {box(150, 4, 146, 38, ['Diagonale: 5,40m  = 5,40 m', 'Winkel 80°: passt nicht'], '#334155')}
        </G>
      )}
      {scene === 'straighten' && (
        <G>
          {room([[50, 50], [250, 62], [240, 165], [58, 150]], 'none', true)}
          {room()}
          <Line x1={50} y1={50} x2={250} y2={50} stroke={ORANGE} strokeWidth={4} />
          {corners()}
          {label(150, 42, 'bleibt an ihrem Platz', ORANGE, 10)}
          {box(85, 88, 130, 36, ['rückt automatisch gerade', '· Linie 1 bleibt'], '#2e7d32')}
        </G>
      )}
      {scene === 'height' && (
        <G>
          {room()}
          {corners()}
          {[[150, 66], [234, 105], [150, 144], [66, 105]].map(([x, y], i) => (
            <G key={i}>
              <Circle cx={x} cy={y} r={9} fill="#fff" stroke="#5d4037" strokeWidth={1.2} />
              {label(x, y + 4, String(i + 1), '#5d4037', 10)}
            </G>
          ))}
          {box(95, 84, 110, 40, ['Höhe alle Linien', '2,50 m'], '#5d4037')}
        </G>
      )}
      {scene === 'insert' && (
        <G>
          {room()}
          {corners()}
          <Circle cx={110} cy={160} r={24} fill="none" stroke="#f59e0b" strokeWidth={2} opacity={0.5} />
          <Circle cx={110} cy={160} r={18} fill="none" stroke="#f59e0b" strokeWidth={2} opacity={0.8} />
          {finger(110, 160)}
          {box(150, 70, 100, 66, ['An Linie 3 einfügen', '▬  Tür', '▬  Fenster', '▬  Sonstiges'])}
          {label(110, 192, 'gedrückt halten', '#b45309', 10)}
        </G>
      )}
      {scene === 'move' && (
        <G>
          {room()}
          {corners()}
          {opening(70, 114, 160, '#6d4c41', true)}
          {opening(150, 200, 160, '#0277bd', false)}
          {label(92, 146, 'T 0,885×2,01', '#6d4c41', 8)}
          {label(175, 146, 'F 1,00×1,20', '#0277bd', 8)}
          <Line x1={50} y1={182} x2={150} y2={182} stroke="#e65100" strokeWidth={1.5} />
          <Line x1={200} y1={182} x2={250} y2={182} stroke="#e65100" strokeWidth={1.5} />
          {[50, 150, 200, 250].map(x => <Line key={x} x1={x} y1={177} x2={x} y2={187} stroke="#e65100" strokeWidth={1.5} />)}
          {label(100, 196, '2,00', '#e65100', 10)}
          {label(225, 196, '1,00', '#e65100', 10)}
          {finger(175, 160)}
          {label(175, 128, '◀  verschieben  ▶', ORANGE, 10)}
        </G>
      )}
      {scene === 'check' && (
        <G>
          {room()}
          {corners()}
          {opening(150, 200, 160, '#0277bd', false)}
          {opening(100, 150, 50, '#0277bd', false)}
          {label(125, 68, 'F 1,00×1,20', '#0277bd', 8)}
          {label(175, 146, 'F 1,00×1,20', '#0277bd', 8)}
          <Line x1={170} y1={138} x2={132} y2={76} stroke={ORANGE} strokeWidth={1.5} strokeDasharray="4,3" />
          {label(178, 108, 'kopieren', ORANGE, 10)}
          {opening(232, 250, 105, '#0277bd', false)}
          {label(200, 100, '⚠ ↦3,50', '#d32f2f', 9)}
        </G>
      )}
      {scene === 'pdf' && (
        <G>
          <Rect x={40} y={20} width={220} height={160} rx={4} fill="#fff" stroke="#cbd5e1" strokeWidth={1.5} />
          {label(150, 40, 'Wandliste', '#0f172a', 12)}
          {[['Linie', 'Länge', 'Höhe', 'Abzug', 'Fläche'], ['1', '4,00', '2,50', '–', '10,00'], ['2', '3,00', '2,50', '–', '7,50'], ['3', '4,00', '2,50', '2,98', '7,02'], ['4', '3,00', '2,50', '–', '7,50']].map((row, r) => (
            <G key={r}>
              {row.map((cell, c) => <G key={c}>{label(66 + c * 42, 62 + r * 20, cell, r === 0 ? '#64748b' : '#334155', 9)}</G>)}
              <Line x1={48} y1={68 + r * 20} x2={252} y2={68 + r * 20} stroke="#e2e8f0" strokeWidth={1} />
            </G>
          ))}
          {label(150, 168, 'Tür 0,885 × 2,01 · ab Ecke 0,50 m', '#6d4c41', 9)}
        </G>
      )}
    </Svg>
  );
}

// onPractice: im Skizzen-Editor – startet die Übungsskizze zum Mitmachen
export function RoomTutorialModal({ visible, onClose, onPractice }: { visible: boolean; onClose: () => void; onPractice?: () => void }) {
  const [i, setI] = useState(0);
  const { width, height } = useWindowDimensions();
  useEffect(() => { if (visible) setI(0); }, [visible]);
  const step = STEPS[i];
  const last = i === STEPS.length - 1;
  const cardWidth = Math.min(width - 24, 460);
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={s.backdrop}>
        <View testID="room-tutorial" style={[s.card, { width: cardWidth, maxHeight: height - 48 }]}>
          <View style={s.head}>
            <Text style={s.headText} numberOfLines={1}>Räume, Türen & Fenster</Text>
            <TouchableOpacity testID="room-tutorial-close" style={s.close} onPress={onClose} accessibilityLabel="Tutorial schließen">
              <Ionicons name="close" size={22} color="#475569" />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={s.body}>
            <View style={[s.picture, { height: Math.min(cardWidth * 0.62, height * 0.34) }]}>
              <Illustration scene={step.scene} />
            </View>
            <Text style={s.count}>Schritt {i + 1} von {STEPS.length}</Text>
            <Text testID="room-tutorial-title" style={s.title}>{step.title}</Text>
            <Text style={s.text}>{step.text}</Text>
            <ButtonChips keys={step.buttons} />
            {!!step.hint && (
              <View style={s.hint}>
                <Ionicons name="bulb-outline" size={16} color="#b45309" />
                <Text style={s.hintText}>{step.hint}</Text>
              </View>
            )}
            {!!onPractice && (
              <TouchableOpacity testID="room-tutorial-practice" style={s.practice} onPress={() => { onClose(); onPractice(); }}>
                <Ionicons name="hand-left-outline" size={18} color="#fff" />
                <Text style={s.practiceText} numberOfLines={2}>Selbst ausprobieren (Übungsskizze)</Text>
              </TouchableOpacity>
            )}
          </ScrollView>
          <View style={s.row}>
            <TouchableOpacity testID="room-tutorial-back" style={s.back} disabled={i === 0} onPress={() => setI(i - 1)}>
              <Text style={[s.backText, i === 0 && s.disabled]}>Zurück</Text>
            </TouchableOpacity>
            <View style={s.dots}>
              {STEPS.map((_, k) => <View key={k} style={[s.dot, k === i && s.dotOn]} />)}
            </View>
            <TouchableOpacity testID="room-tutorial-next" style={s.next} onPress={() => (last ? onClose() : setI(i + 1))}>
              <Text style={s.nextText}>{last ? 'Fertig' : 'Weiter'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// Knopf, der das Tutorial öffnet (Hilfe-Seite und Maß-Fenster)
export function RoomTutorialButton({ compact, onPractice }: { compact?: boolean; onPractice?: () => void }) {
  const [visible, setVisible] = useState(false);
  return (
    <>
      <TouchableOpacity testID="room-tutorial-open" style={[s.open, compact && s.openCompact]} onPress={() => setVisible(true)}>
        <Ionicons name="school-outline" size={compact ? 16 : 20} color="#1565c0" />
        <Text style={[s.openText, compact && s.openTextCompact]} numberOfLines={2}>Tutorial: Räume, Türen & Fenster</Text>
      </TouchableOpacity>
      <RoomTutorialModal visible={visible} onClose={() => setVisible(false)} onPractice={onPractice} />
    </>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.72)', alignItems: 'center', justifyContent: 'center', padding: 12 },
  card: { backgroundColor: '#fff', borderRadius: 16, overflow: 'hidden' },
  head: { flexDirection: 'row', alignItems: 'center', paddingLeft: 16, paddingRight: 4, borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  headText: { flex: 1, fontSize: 15, fontWeight: '800', color: '#0f172a' },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  body: { padding: 16, gap: 6 },
  picture: { borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: '#e2e8f0', marginBottom: 6 },
  count: { fontSize: 12, fontWeight: '700', color: '#1976d2' },
  title: { fontSize: 18, fontWeight: '800', color: '#0f172a' },
  text: { fontSize: 15, color: '#334155', lineHeight: 21 },
  hint: { flexDirection: 'row', gap: 6, padding: 10, borderRadius: 10, backgroundColor: '#fffbeb', marginTop: 4 },
  hintText: { flex: 1, fontSize: 13, color: '#92400e', lineHeight: 18 },
  practice: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 48, paddingHorizontal: 12, borderRadius: 12, backgroundColor: '#2e7d32', marginTop: 8 },
  practiceText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#e2e8f0' },
  back: { minHeight: 44, minWidth: 72, justifyContent: 'center' },
  backText: { color: '#64748b', fontWeight: '700', fontSize: 14 },
  disabled: { color: '#cbd5e1' },
  dots: { flex: 1, flexDirection: 'row', justifyContent: 'center', gap: 4 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#cbd5e1' },
  dotOn: { backgroundColor: '#1976d2', width: 14 },
  next: { minHeight: 44, paddingHorizontal: 18, borderRadius: 12, backgroundColor: '#1565c0', justifyContent: 'center' },
  nextText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  open: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: '#bfdbfe', backgroundColor: '#eff6ff', marginBottom: 10 },
  openCompact: { marginHorizontal: 10, marginBottom: 6, borderRadius: 8 },
  openText: { flex: 1, fontSize: 14, fontWeight: '700', color: '#1565c0' },
  openTextCompact: { fontSize: 12 },
});

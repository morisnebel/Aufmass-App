import React, { useEffect, useRef, useState } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, useWindowDimensions } from 'react-native';
import Svg, { Line, Rect, Circle, G, Text as SvgText, Path } from 'react-native-svg';
import Ionicons from '@react-native-vector-icons/ionicons';

// Animierte Kurz-Demo zum Skizzen-Editor (läuft offline, ohne Videodatei)
const SCENE = 4; // Sekunden pro Szene
const SCENES = [
  { title: 'Linie zeichnen', text: 'Werkzeug „Linie“ wählen und mit dem Finger von Punkt zu Punkt ziehen.' },
  { title: 'Maß eintragen', text: 'Linie antippen und die echte Länge eingeben – die Linie passt sich an.' },
  { title: 'Fläche & Raumname', text: 'Rechteck oder Polygon aufziehen – die m² werden automatisch berechnet.' },
  { title: 'Zoomen', text: 'Zoom einschalten, dann mit zwei Fingern vergrößern und verschieben.' },
  { title: 'Rückgängig & Speichern', text: 'Falscher Strich? Rückgängig tippen. Mit dem Haken speichern.' },
];
const TOTAL = SCENE * SCENES.length;
const clamp = (v: number) => Math.max(0, Math.min(1, v));
const ease = (v: number) => { const x = clamp(v); return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2; };

function Scene({ t }: { t: number }) {
  const idx = Math.min(SCENES.length - 1, Math.floor(t / SCENE));
  const p = (t - idx * SCENE) / SCENE; // 0..1 innerhalb der Szene
  const blue = '#1976d2';
  const grid = [];
  for (let x = 20; x <= 280; x += 20) grid.push(<Line key={`x${x}`} x1={x} y1={10} x2={x} y2={190} stroke="#e2e8f0" strokeWidth={0.6} />);
  for (let y = 10; y <= 190; y += 20) grid.push(<Line key={`y${y}`} x1={20} y1={y} x2={280} y2={y} stroke="#e2e8f0" strokeWidth={0.6} />);

  const finger = (x: number, y: number, o = 1) => (
    <G opacity={o}>
      <Circle cx={x} cy={y} r={13} fill="rgba(245,158,11,0.25)" />
      <Circle cx={x} cy={y} r={6} fill="#f59e0b" />
    </G>
  );

  // Szene 1: Linie wird gezeichnet
  if (idx === 0) {
    const d = ease(p * 1.3);
    const x2 = 40 + 220 * d;
    return <G>{grid}<Line x1={40} y1={160} x2={x2} y2={160} stroke={blue} strokeWidth={4} strokeLinecap="round" />{finger(x2, 160, p < 0.85 ? 1 : 0)}</G>;
  }
  // Szene 2: Antippen + Maß
  if (idx === 1) {
    const tap = clamp(p * 3);
    const lbl = ease((p - 0.35) * 2.5);
    return (
      <G>{grid}
        <Line x1={40} y1={160} x2={260} y2={160} stroke={blue} strokeWidth={4} strokeLinecap="round" />
        {p < 0.4 && <Circle cx={150} cy={160} r={6 + 18 * tap} fill="none" stroke="#f59e0b" strokeWidth={2} opacity={1 - tap} />}
        {p < 0.4 && finger(150, 160)}
        <G opacity={lbl}>
          <Rect x={115} y={128} width={70} height={22} rx={6} fill="#fff" stroke={blue} strokeWidth={1.5} />
          <SvgText x={150} y={144} fontSize={13} fontWeight="bold" fill="#0f172a" textAnchor="middle">4,50 m</SvgText>
        </G>
      </G>
    );
  }
  // Szene 3: Rechteck aufziehen, Fläche + Raumname
  if (idx === 2) {
    const g = ease(p * 1.6);
    const w = 220 * g, h = 100 * g;
    const fill = ease((p - 0.6) * 3);
    return (
      <G>{grid}
        <Rect x={40} y={60} width={w} height={h} fill={`rgba(25,118,210,${0.15 * fill})`} stroke={blue} strokeWidth={3} />
        {g < 1 && finger(40 + w, 60 + h)}
        <G opacity={fill}>
          <SvgText x={150} y={104} fontSize={14} fontWeight="bold" fill="#0f172a" textAnchor="middle">Wohnzimmer</SvgText>
          <SvgText x={150} y={124} fontSize={13} fill={blue} textAnchor="middle">20,0 m²</SvgText>
        </G>
      </G>
    );
  }
  // Szene 4: Zoom mit zwei Fingern
  if (idx === 3) {
    const z = 1 + 0.35 * Math.sin(Math.PI * clamp(p * 1.1));
    const spread = 30 * (z - 1) / 0.35;
    return (
      <G>
        <G transform={`translate(150 110) scale(${z}) translate(-150 -110)`}>
          {grid}
          <Rect x={40} y={60} width={220} height={100} fill="rgba(25,118,210,0.15)" stroke={blue} strokeWidth={3} />
          <SvgText x={150} y={114} fontSize={13} fill={blue} textAnchor="middle">20,0 m²</SvgText>
        </G>
        {finger(120 - spread, 120 - spread * 0.4)}
        {finger(180 + spread, 100 + spread * 0.4)}
      </G>
    );
  }
  // Szene 5: falscher Strich → Rückgängig → Speichern
  const stray = p < 0.25 ? ease(p * 4) : p < 0.45 ? 1 : 0;
  const undoHi = p > 0.3 && p < 0.5;
  const saveHi = p > 0.6;
  return (
    <G>{grid}
      <Rect x={40} y={60} width={220} height={100} fill="rgba(25,118,210,0.15)" stroke={blue} strokeWidth={3} />
      <SvgText x={150} y={114} fontSize={13} fill={blue} textAnchor="middle">20,0 m²</SvgText>
      {stray > 0 && <Path d={`M70 40 Q 150 ${40 - 30 * stray} ${70 + 160 * stray} 40`} stroke="#dc2626" strokeWidth={3} fill="none" />}
      <G opacity={undoHi ? 1 : 0.35}>
        <Circle cx={40} cy={24} r={14} fill={undoHi ? '#f59e0b' : '#64748b'} />
        <Path d="M46 28 A7 7 0 1 0 39 18 L35 18 M35 18 L35 13 M35 18 L40 18" stroke="#fff" strokeWidth={2} fill="none" />
      </G>
      <G opacity={saveHi ? 1 : 0.35}>
        <Circle cx={260} cy={24} r={saveHi ? 14 + 2 * Math.sin(p * 30) : 14} fill={saveHi ? '#16a34a' : '#cbd5e1'} />
        <Path d="M253 24 L258 29 L267 19" stroke="#fff" strokeWidth={3} fill="none" />
      </G>
    </G>
  );
}

export function SketchDemoModal({ visible, onClose, onOpenManual }: { visible: boolean; onClose: () => void; onOpenManual?: () => void }) {
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(true);
  const last = useRef(0);
  const { width } = useWindowDimensions();
  const w = Math.min(width - 48, 420);

  useEffect(() => { if (visible) { setT(0); setPlaying(true); } }, [visible]);
  useEffect(() => {
    if (!visible || !playing) return;
    last.current = Date.now();
    const id = setInterval(() => {
      const now = Date.now();
      const dt = (now - last.current) / 1000;
      last.current = now;
      setT(prev => {
        const n = prev + dt;
        if (n >= TOTAL) { setPlaying(false); return TOTAL - 0.001; }
        return n;
      });
    }, 40);
    return () => clearInterval(id);
  }, [visible, playing]);

  const idx = Math.min(SCENES.length - 1, Math.floor(t / SCENE));
  const ended = !playing && t >= TOTAL - 0.01;
  const jump = (i: number) => { setT(i * SCENE); setPlaying(true); };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={s.backdrop}>
        <View style={[s.box, { width: w + 32 }]} testID="sketch-demo">
          <View style={s.head}>
            <Ionicons name="play-circle" size={22} color="#1565c0" />
            <Text style={s.headTitle}>Skizze in 20 Sekunden</Text>
            <TouchableOpacity testID="sketch-demo-close" onPress={onClose} style={s.close}><Ionicons name="close" size={24} color="#334155" /></TouchableOpacity>
          </View>
          <View style={s.stage}>
            <Svg width={w} height={w * 2 / 3} viewBox="0 0 300 200"><Scene t={t} /></Svg>
          </View>
          <Text style={s.step}>Schritt {idx + 1} von {SCENES.length}</Text>
          <Text testID="sketch-demo-title" style={s.title}>{SCENES[idx].title}</Text>
          <Text style={s.text}>{SCENES[idx].text}</Text>
          <View style={s.progress}><View style={[s.bar, { width: `${(t / TOTAL) * 100}%` }]} /></View>
          <View style={s.dots}>
            {SCENES.map((sc, i) => (
              <TouchableOpacity key={sc.title} testID={`sketch-demo-dot-${i}`} onPress={() => jump(i)} style={s.dotHit} hitSlop={4}>
                <View style={[s.dot, i === idx && s.dotOn]} />
              </TouchableOpacity>
            ))}
          </View>
          <View style={s.row}>
            <TouchableOpacity testID="sketch-demo-play" style={[s.btn, { backgroundColor: '#f1f5f9' }]} onPress={() => (ended ? jump(0) : setPlaying(!playing))}>
              <Ionicons name={ended ? 'refresh' : playing ? 'pause' : 'play'} size={20} color="#334155" />
              <Text style={[s.btnText, { color: '#334155' }]}>{ended ? 'Nochmal' : playing ? 'Pause' : 'Weiter'}</Text>
            </TouchableOpacity>
            {onOpenManual ? (
              <TouchableOpacity testID="sketch-demo-manual" style={[s.btn, { backgroundColor: '#1565c0' }]} onPress={onOpenManual}>
                <Ionicons name="book-outline" size={18} color="#fff" />
                <Text style={[s.btnText, { color: '#fff' }]}>Anleitung</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity testID="sketch-demo-start" style={[s.btn, { backgroundColor: '#1565c0' }]} onPress={onClose}>
                <Text style={[s.btnText, { color: '#fff' }]}>Los geht’s</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.6)', justifyContent: 'center', alignItems: 'center', padding: 8 },
  box: { backgroundColor: '#fff', borderRadius: 18, padding: 16, maxWidth: '100%' },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  headTitle: { flex: 1, fontSize: 17, fontWeight: '800', color: '#0f172a' },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  stage: { borderRadius: 12, overflow: 'hidden', backgroundColor: '#fafafa', borderWidth: 1, borderColor: '#e2e8f0' },
  step: { fontSize: 12, fontWeight: '700', color: '#1976d2', marginTop: 12 },
  title: { fontSize: 18, fontWeight: '800', color: '#0f172a', marginTop: 2 },
  text: { fontSize: 15, color: '#334155', marginTop: 4, lineHeight: 21, minHeight: 42 },
  progress: { height: 4, borderRadius: 2, backgroundColor: '#e2e8f0', marginTop: 12, overflow: 'hidden' },
  bar: { height: 4, backgroundColor: '#1976d2' },
  dots: { flexDirection: 'row', justifyContent: 'center', marginTop: 4 },
  dotHit: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#cbd5e1' },
  dotOn: { backgroundColor: '#1976d2', width: 18 },
  row: { flexDirection: 'row', gap: 10, marginTop: 8 },
  btn: { flex: 1, flexDirection: 'row', gap: 6, minHeight: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  btnText: { fontSize: 15, fontWeight: '800' },
});

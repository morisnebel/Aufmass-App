import React, { useEffect, useRef, useState } from 'react';
import { Modal, View, Text, TouchableOpacity, ScrollView, StyleSheet, useWindowDimensions } from 'react-native';
import Svg, { Line, Rect, Circle, G, Text as SvgText, Polygon } from 'react-native-svg';
import Ionicons from '@react-native-vector-icons/ionicons';

// Erklärvideo zum Skizzen-Editor – zeigt den echten Ablauf mit dem Werkzeug „Polygon-Maße“.
// Zwei Ansichten: animiertes Video oder Bilder mit Text zum Durchwischen. Läuft offline, ohne Videodatei.
const SCENE = 4; // Sekunden pro Szene
const SCENES = [
  { title: 'Werkzeug wählen', text: 'In der Werkzeugleiste das Symbol „Polygon-Maße“ (verbundene Punkte) antippen.' },
  { title: 'Ecken antippen', text: 'Tippe nacheinander auf jede Ecke des Raums. Mit dem Pfeil machst du den letzten Punkt rückgängig.' },
  { title: 'Raum schließen', text: 'Tippe wieder auf den ersten Punkt oder auf das Ketten-Symbol – der Raum wird geschlossen.' },
  { title: 'Seiten bemaßen', text: 'Eine Seite antippen und die echte Länge eintippen. Das Maß steht an der Seite, die Zeichnung bleibt gleich.' },
  { title: 'Fläche erscheint automatisch', text: 'Sind alle Seiten bemaßt, stehen die m² direkt im Raum und in der Übersicht.' },
  { title: 'Raum benennen', text: 'In der Übersicht auf die Zeile tippen und einen Namen wie „Wohnzimmer“ eingeben.' },
  { title: 'Speichern & PDF', text: 'Mit dem Haken oben rechts speichern. Im PDF steht eine Raumliste mit Umfang und Fläche.' },
];
const TOTAL = SCENE * SCENES.length;
const clamp = (v: number) => Math.max(0, Math.min(1, v));
const ease = (v: number) => { const x = clamp(v); return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2; };
const BLUE = '#1976d2';
const PTS = [[60, 70], [240, 70], [240, 170], [60, 170]];
const SIDES = [['4,50 m', 150, 62], ['2,50 m', 262, 124], ['4,50 m', 150, 186], ['2,50 m', 38, 124]] as const;

const finger = (x: number, y: number, o = 1) => (
  <G opacity={o}>
    <Circle cx={x} cy={y} r={13} fill="rgba(245,158,11,0.25)" />
    <Circle cx={x} cy={y} r={6} fill="#f59e0b" />
  </G>
);
const ripple = (x: number, y: number, p: number) => <Circle cx={x} cy={y} r={6 + 16 * p} fill="none" stroke="#f59e0b" strokeWidth={2} opacity={1 - p} />;

// Mini-Werkzeugleiste wie im Editor (Hand, M, Polygon-Maße, +Pkt, -Pkt)
function Toolbar({ active, tap }: { active: boolean; tap?: number }) {
  const items = ['✋', 'M', '', '+', '−'];
  return (
    <G>
      <Rect x={0} y={0} width={300} height={34} fill="#f1f5f9" />
      {items.map((l, i) => {
        const x = 70 + i * 34;
        const on = i === 2 && active;
        return (
          <G key={i}>
            <Rect x={x - 13} y={5} width={26} height={24} rx={5} fill={on ? '#2196f3' : '#fff'} stroke="#cbd5e1" strokeWidth={0.8} />
            {i === 2 ? (
              <G stroke={on ? '#fff' : '#333'} strokeWidth={1.6} fill="none">
                <Line x1={x - 6} y1={22} x2={x} y2={11} /><Line x1={x} y1={11} x2={x + 6} y2={22} />
                <Circle cx={x - 6} cy={22} r={2} fill={on ? '#fff' : '#333'} /><Circle cx={x} cy={11} r={2} fill={on ? '#fff' : '#333'} /><Circle cx={x + 6} cy={22} r={2} fill={on ? '#fff' : '#333'} />
              </G>
            ) : (
              <SvgText x={x} y={22} fontSize={13} fontWeight="bold" fill={i === 3 ? '#4caf50' : i === 4 ? '#f44336' : '#333'} textAnchor="middle">{l}</SvgText>
            )}
          </G>
        );
      })}
      {tap !== undefined && tap < 1 && <>{ripple(138, 17, tap)}{finger(138, 17)}</>}
    </G>
  );
}

function Room({ n, closed, measured = 0, area, name }: { n: number; closed?: boolean; measured?: number; area?: boolean; name?: string }) {
  const pts = PTS.slice(0, n);
  return (
    <G>
      {closed && <Polygon points={PTS.map(p => p.join(',')).join(' ')} fill="rgba(33,150,243,0.12)" />}
      {pts.slice(1).map((p, i) => <Line key={i} x1={pts[i][0]} y1={pts[i][1] + 0} x2={p[0]} y2={p[1]} stroke={BLUE} strokeWidth={3} />)}
      {closed && <Line x1={PTS[3][0]} y1={PTS[3][1]} x2={PTS[0][0]} y2={PTS[0][1]} stroke={BLUE} strokeWidth={3} />}
      {pts.map((p, i) => <Circle key={i} cx={p[0]} cy={p[1]} r={5} fill="#fff" stroke={BLUE} strokeWidth={2} />)}
      {SIDES.slice(0, measured).map(([t, x, y]) => (
        <G key={`${x}-${y}`}>
          <Rect x={x - 26} y={y - 9} width={52} height={17} rx={4} fill="#fff" stroke={BLUE} strokeWidth={1} />
          <SvgText x={x} y={y + 4} fontSize={11} fontWeight="bold" fill="#0f172a" textAnchor="middle">{t}</SvgText>
        </G>
      ))}
      {closed && (
        <G>
          <Circle cx={150} cy={110} r={11} fill={BLUE} />
          <SvgText x={150} y={114} fontSize={10} fontWeight="bold" fill="#fff" textAnchor="middle">S1</SvgText>
          {!!name && <SvgText x={166} y={114} fontSize={12} fontWeight="bold" fill={BLUE}>{name}</SvgText>}
          {area && (
            <G>
              <Rect x={118} y={126} width={64} height={18} rx={3} fill="#fff" stroke={BLUE} strokeWidth={1} />
              <SvgText x={150} y={139} fontSize={11} fontWeight="bold" fill={BLUE} textAnchor="middle">11,25 m²</SvgText>
            </G>
          )}
        </G>
      )}
    </G>
  );
}

function Legend({ name, hi }: { name?: string; hi?: boolean }) {
  return (
    <G>
      <Rect x={182} y={176} width={116} height={20} rx={5} fill={hi ? '#fff7ed' : '#fff'} stroke={hi ? '#f59e0b' : '#bbdefb'} strokeWidth={1.2} />
      <SvgText x={187} y={190} fontSize={8.5} fill="#333">{`S1 ${name ? name + ' ' : ''}• 11,25 m²`}</SvgText>
    </G>
  );
}

function Numpad({ value }: { value: string }) {
  return (
    <G>
      <Rect x={176} y={88} width={116} height={64} rx={8} fill="#fff" stroke="#94a3b8" strokeWidth={1} />
      <Rect x={184} y={95} width={100} height={20} rx={4} fill="#f1f5f9" />
      <SvgText x={234} y={109} fontSize={12} fontWeight="bold" fill="#0f172a" textAnchor="middle">{value || ' '}</SvgText>
      {['1', '2', '3', '4', '5', '✓'].map((k, i) => (
        <G key={k}>
          <Rect x={184 + i * 17} y={122} width={15} height={22} rx={3} fill={k === '✓' ? '#16a34a' : '#e2e8f0'} />
          <SvgText x={191.5 + i * 17} y={137} fontSize={10} fontWeight="bold" fill={k === '✓' ? '#fff' : '#334155'} textAnchor="middle">{k}</SvgText>
        </G>
      ))}
    </G>
  );
}

// Eine Szene zum Fortschritt p (0..1); p = 1 ergibt das Standbild für die Bilder-Ansicht
export function DemoScene({ idx, p }: { idx: number; p: number }) {
  const grid = [];
  for (let x = 20; x <= 280; x += 20) grid.push(<Line key={`x${x}`} x1={x} y1={40} x2={x} y2={200} stroke="#e2e8f0" strokeWidth={0.6} />);
  for (let y = 40; y <= 200; y += 20) grid.push(<Line key={`y${y}`} x1={0} y1={y} x2={300} y2={y} stroke="#e2e8f0" strokeWidth={0.6} />);
  let body: React.ReactNode = null;
  let toolbar = <Toolbar active={idx > 0} />;
  if (idx === 0) {
    toolbar = <Toolbar active={p > 0.5} tap={p < 0.5 ? clamp((p - 0.2) * 3.3) : 1} />;
    body = p > 0.5 ? null : finger(138 - 60 * (1 - clamp(p * 4)), 17 + 90 * (1 - clamp(p * 4)), 1);
  } else if (idx === 1) {
    const n = Math.min(4, 1 + Math.floor(clamp(p) * 4.2));
    const cur = PTS[n - 1];
    body = <G><Room n={n} />{p < 0.95 && <>{ripple(cur[0], cur[1], (p * 4.2) % 1)}{finger(cur[0], cur[1])}</>}</G>;
  } else if (idx === 2) {
    const closed = p > 0.45;
    body = <G><Room n={4} closed={closed} />{!closed && <>{ripple(60, 70, clamp(p * 2.2))}{finger(60, 70)}</>}</G>;
  } else if (idx === 3) {
    const typed = '4,50'.slice(0, Math.floor(clamp((p - 0.2) * 2.5) * 4));
    const done = p > 0.75;
    body = (
      <G>
        <Room n={4} closed measured={done ? 1 : 0} />
        {p < 0.2 && <>{ripple(150, 70, p * 5)}{finger(150, 70)}</>}
        {p >= 0.2 && !done && <Numpad value={typed} />}
      </G>
    );
  } else if (idx === 4) {
    const m = 1 + Math.floor(clamp(p * 1.6) * 3);
    const area = m >= 4;
    body = <G><Room n={4} closed measured={m} area={area} />{area && <Legend />}</G>;
  } else if (idx === 5) {
    const name = 'Wohnzimmer'.slice(0, Math.floor(clamp((p - 0.3) * 2) * 10));
    body = <G><Room n={4} closed measured={4} area name={name} /><Legend name={name} hi={p < 0.4} />{p < 0.3 && <>{ripple(238, 186, p * 3.3)}{finger(238, 186)}</>}</G>;
  } else {
    const saved = p > 0.4;
    body = (
      <G>
        <Room n={4} closed measured={4} area name="Wohnzimmer" />
        <Circle cx={282} cy={17} r={saved ? 13 : 12} fill={saved ? '#16a34a' : '#64748b'} />
        <SvgText x={282} y={22} fontSize={14} fontWeight="bold" fill="#fff" textAnchor="middle">✓</SvgText>
        {!saved && <>{ripple(282, 17, p * 2.5)}{finger(282, 17)}</>}
        {saved && (
          <G opacity={ease((p - 0.4) * 3)}>
            <Rect x={20} y={150} width={260} height={46} rx={6} fill="#fff" stroke="#94a3b8" strokeWidth={1} />
            <SvgText x={30} y={166} fontSize={10} fontWeight="bold" fill="#0f172a">Raumliste</SvgText>
            <SvgText x={30} y={185} fontSize={10} fill="#0f172a">S1 Wohnzimmer</SvgText>
            <SvgText x={200} y={185} fontSize={10} fill="#0f172a" textAnchor="end">14,00 m</SvgText>
            <SvgText x={270} y={185} fontSize={10} fontWeight="bold" fill="#0f172a" textAnchor="end">11,25 m²</SvgText>
          </G>
        )}
      </G>
    );
  }
  return <G>{grid}{toolbar}{body}</G>;
}

export function SketchDemoModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const [mode, setMode] = useState<'video' | 'pics'>('video');
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [page, setPage] = useState(0);
  const last = useRef(0);
  const pager = useRef<ScrollView>(null);
  const { width } = useWindowDimensions();
  const w = Math.min(width - 48, 420);

  useEffect(() => { if (visible) { setT(0); setPlaying(true); setPage(0); setMode('video'); } }, [visible]);
  useEffect(() => {
    if (!visible || !playing || mode !== 'video') return;
    last.current = Date.now();
    const id = setInterval(() => {
      const now = Date.now();
      const dt = (now - last.current) / 1000;
      last.current = now;
      setT(prev => { const n = prev + dt; if (n >= TOTAL) { setPlaying(false); return TOTAL - 0.001; } return n; });
    }, 40);
    return () => clearInterval(id);
  }, [visible, playing, mode]);

  const vIdx = Math.min(SCENES.length - 1, Math.floor(t / SCENE));
  const idx = mode === 'video' ? vIdx : page;
  const ended = !playing && t >= TOTAL - 0.01;
  const jump = (i: number) => {
    if (mode === 'video') { setT(i * SCENE); setPlaying(true); } else { setPage(i); pager.current?.scrollTo({ x: i * w, animated: true }); }
  };
  const switchMode = (m: 'video' | 'pics') => {
    setMode(m);
    if (m === 'pics') { setPage(vIdx); setTimeout(() => pager.current?.scrollTo({ x: vIdx * w, animated: false }), 0); } else { setT(idx * SCENE); setPlaying(true); }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={s.backdrop}>
        <View style={[s.box, { width: w + 32 }]} testID="sketch-demo">
          <View style={s.head}>
            <Ionicons name="play-circle" size={22} color="#1565c0" />
            <Text style={s.headTitle}>So geht die Skizze</Text>
            <TouchableOpacity testID="sketch-demo-close" onPress={onClose} style={s.close}><Ionicons name="close" size={24} color="#334155" /></TouchableOpacity>
          </View>
          <View style={s.tabs}>
            {([['video', 'play', 'Video'], ['pics', 'images-outline', 'Bilder']] as const).map(([m, icon, l]) => (
              <TouchableOpacity key={m} testID={`sketch-demo-mode-${m}`} style={[s.tab, mode === m && s.tabOn]} onPress={() => switchMode(m)}>
                <Ionicons name={icon} size={16} color={mode === m ? '#fff' : '#334155'} />
                <Text style={[s.tabText, mode === m && { color: '#fff' }]}>{l}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={s.stage}>
            {mode === 'video' ? (
              <Svg width={w} height={w * 2 / 3} viewBox="0 0 300 200"><DemoScene idx={vIdx} p={(t - vIdx * SCENE) / SCENE} /></Svg>
            ) : (
              <ScrollView
                ref={pager}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                onScroll={e => setPage(Math.round(e.nativeEvent.contentOffset.x / w))}
                scrollEventThrottle={100}
                onMomentumScrollEnd={e => setPage(Math.round(e.nativeEvent.contentOffset.x / w))}
                testID="sketch-demo-pager"
              >
                {SCENES.map((sc, i) => (
                  <Svg key={sc.title} width={w} height={w * 2 / 3} viewBox="0 0 300 200"><DemoScene idx={i} p={1} /></Svg>
                ))}
              </ScrollView>
            )}
          </View>
          <Text style={s.step}>Schritt {idx + 1} von {SCENES.length}</Text>
          <Text testID="sketch-demo-title" style={s.title}>{SCENES[idx].title}</Text>
          <Text style={s.text}>{SCENES[idx].text}</Text>
          {mode === 'video' && <View style={s.progress}><View style={[s.bar, { width: `${(t / TOTAL) * 100}%` }]} /></View>}
          <View style={s.dots}>
            {SCENES.map((sc, i) => (
              <TouchableOpacity key={sc.title} testID={`sketch-demo-dot-${i}`} onPress={() => jump(i)} style={s.dotHit} hitSlop={2}>
                <View style={[s.dot, i === idx && s.dotOn]} />
              </TouchableOpacity>
            ))}
          </View>
          <View style={s.row}>
            {mode === 'video' ? (
              <TouchableOpacity testID="sketch-demo-play" style={[s.btn, { backgroundColor: '#f1f5f9' }]} onPress={() => (ended ? jump(0) : setPlaying(!playing))}>
                <Ionicons name={ended ? 'refresh' : playing ? 'pause' : 'play'} size={20} color="#334155" />
                <Text style={[s.btnText, { color: '#334155' }]}>{ended ? 'Nochmal' : playing ? 'Pause' : 'Weiter'}</Text>
              </TouchableOpacity>
            ) : (
              <>
                <TouchableOpacity testID="sketch-demo-prev" style={[s.btn, { backgroundColor: '#f1f5f9', opacity: page === 0 ? 0.4 : 1 }]} disabled={page === 0} onPress={() => jump(page - 1)}>
                  <Ionicons name="chevron-back" size={20} color="#334155" />
                  <Text style={[s.btnText, { color: '#334155' }]}>Zurück</Text>
                </TouchableOpacity>
                {page < SCENES.length - 1 && (
                  <TouchableOpacity testID="sketch-demo-next" style={[s.btn, { backgroundColor: '#f1f5f9' }]} onPress={() => jump(page + 1)}>
                    <Text style={[s.btnText, { color: '#334155' }]}>Weiter</Text>
                    <Ionicons name="chevron-forward" size={20} color="#334155" />
                  </TouchableOpacity>
                )}
              </>
            )}
            <TouchableOpacity testID="sketch-demo-start" style={[s.btn, { backgroundColor: '#1565c0' }]} onPress={onClose}>
              <Text style={[s.btnText, { color: '#fff' }]}>Fertig</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.6)', justifyContent: 'center', alignItems: 'center', padding: 8 },
  box: { backgroundColor: '#fff', borderRadius: 18, padding: 16, maxWidth: '100%' },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  headTitle: { flex: 1, fontSize: 17, fontWeight: '800', color: '#0f172a' },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  tabs: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  tab: { flex: 1, flexDirection: 'row', gap: 6, minHeight: 44, borderRadius: 22, borderWidth: 1, borderColor: '#cbd5e1', alignItems: 'center', justifyContent: 'center' },
  tabOn: { backgroundColor: '#1565c0', borderColor: '#1565c0' },
  tabText: { fontSize: 14, fontWeight: '700', color: '#334155' },
  stage: { borderRadius: 12, overflow: 'hidden', backgroundColor: '#fafafa', borderWidth: 1, borderColor: '#e2e8f0' },
  step: { fontSize: 12, fontWeight: '700', color: '#1976d2', marginTop: 12 },
  title: { fontSize: 18, fontWeight: '800', color: '#0f172a', marginTop: 2 },
  text: { fontSize: 15, color: '#334155', marginTop: 4, lineHeight: 21, minHeight: 63 },
  progress: { height: 4, borderRadius: 2, backgroundColor: '#e2e8f0', marginTop: 10, overflow: 'hidden' },
  bar: { height: 4, backgroundColor: '#1976d2' },
  dots: { flexDirection: 'row', justifyContent: 'center', marginTop: 4 },
  dotHit: { width: 36, height: 44, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#cbd5e1' },
  dotOn: { backgroundColor: '#1976d2', width: 18 },
  row: { flexDirection: 'row', gap: 8, marginTop: 8 },
  btn: { flex: 1, flexDirection: 'row', gap: 4, minHeight: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  btnText: { fontSize: 15, fontWeight: '800' },
});

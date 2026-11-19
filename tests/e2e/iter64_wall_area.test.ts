// Ausführen: cd /app/frontend && npx tsx ../tests/e2e/iter64_wall_area.test.ts
import assert from 'node:assert';
import { calculateWallAreaM2, wallSegmentAreaM2, segmentCountOf } from '../../frontend/src/sketch/wallArea';

const pts = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 80 }, { x: 0, y: 80 }];
const closed = { id: 'a', type: 'polyline', data: { closed: true, points: pts } };
const open = { id: 'b', type: 'polyline', data: { closed: false, points: pts } };
const measures = { 0: '2,91m', 1: '3.62m', 2: '291cm', 3: '3,62' };

assert.strictEqual(segmentCountOf(closed), 4);
assert.strictEqual(segmentCountOf(open), 3);
assert.strictEqual(wallSegmentAreaM2('2,91m', { height: '2,50m' }, 0), 7.28); // 7,275 gerundet
assert.strictEqual(wallSegmentAreaM2('2,91m', undefined, 0), null);
assert.strictEqual(wallSegmentAreaM2(undefined, { height: '2,50' }, 0), null);
// Abweichende Höhe + Abzug pro Linie
const wall = { height: '2,50m', segments: { 1: { height: '3m', deduction: '1,8' }, 2: { deduction: '100' } } };
assert.strictEqual(wallSegmentAreaM2('3.62m', wall, 1), 9.06); // 10,86 − 1,8
assert.strictEqual(wallSegmentAreaM2('291cm', wall, 2), 0); // Abzug größer als Wand → 0
assert.deepStrictEqual(calculateWallAreaM2(closed, measures, { height: '2,50m' }), { total: 32.66, walls: 4, segments: 4 });
assert.deepStrictEqual(calculateWallAreaM2(open, measures, { height: '250cm' }), { total: 23.61, walls: 3, segments: 3 });
assert.strictEqual(calculateWallAreaM2(closed, measures, undefined), null);
assert.strictEqual(calculateWallAreaM2(closed, {}, { height: '2,5' }), null);
console.log('OK');

// iter65: Öffnungen (Breite × Höhe) und Wandliste
// eslint-disable-next-line @typescript-eslint/no-require-imports
const w = require('../../frontend/src/sketch/wallArea');
assert.strictEqual(w.openingAreaM2({ width: '0,90m', height: '2,10' }), 1.89);
assert.strictEqual(w.openingAreaM2({ width: '90cm', height: '' }), 0);
const seg = { openings: [{ width: '0,90', height: '2,10' }, { width: '1,2m', height: '1,4m' }], deduction: '0,5' };
assert.strictEqual(w.segmentDeductionM2(seg), 4.07); // 1,89 + 1,68 + 0,5
const wall2 = { height: '2,50m', segments: { 1: seg } };
assert.strictEqual(wallSegmentAreaM2('3.62m', wall2, 1), 4.98); // 9,05 − 4,07
const rows = w.wallRows(closed, measures, wall2);
assert.strictEqual(rows.length, 4);
assert.deepStrictEqual({ ...rows[1], openings: rows[1].openings.length }, { line: 2, length: 3.62, height: 2.5, deduction: 4.07, openings: 2, area: 4.98 });
assert.strictEqual(w.wallRows(closed, measures, undefined).length, 0);
console.log('OK iter65');

// iter65: Wandliste-HTML
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { buildWallListHtml } = require('../../frontend/src/sketch/wallListHtml');
assert.strictEqual(buildWallListHtml([]), '');
const html: string = buildWallListHtml([{ title: 'Skizze 1 – S1 – Bad <a>', rows }]).replace(/\s+/g, ' ');
for (const part of ['Wandliste (Skizzen)', 'Skizze 1 – S1 – Bad &lt;a&gt;', 'Linie 1', 'Linie 4', '2,91 m', '3,62 m', '2,50 m', '4,07 m²',
  '0,90 × 2,10 = 1,89', '1,2m × 1,4m = 1,68', '4,98 m²', '7,28 m²', '9,05 m²', 'Summe', '28,59 m²']) {
  assert.ok(html.includes(part), `fehlt im HTML: ${part}`);
}
console.log('OK html');

// iter76: eingefrorene Form – Punkte verschieben ändert die Fläche nicht
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pa = require('../../frontend/src/sketch/polygonArea');
const m4 = { a: { 0: '4m', 1: '3m', 2: '4m', 3: '3m' } };
const moved = { ...closed, data: { closed: true, points: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 160, y: 140 }, { x: 0, y: 80 }] } };
assert.strictEqual(pa.calculatePolygonAreaM2(closed, m4), 12);
assert.notStrictEqual(pa.calculatePolygonAreaM2(moved, m4), 12); // ohne Einfrieren ändert sich die Fläche
assert.strictEqual(pa.calculatePolygonAreaM2(moved, m4, pts), 12); // mit eingefrorener Form nicht
assert.strictEqual(pa.calculatePolygonAreaM2(moved, { a: { ...m4.a, 0: '5m', 2: '5m' } }, pts), 15);
assert.strictEqual(pa.areaShapeKey(4, m4.a), pa.areaShapeKey(4, { ...m4.a, 0: '5m' }));
assert.notStrictEqual(pa.areaShapeKey(4, m4.a), pa.areaShapeKey(4, { 0: '4m' }));
console.log('OK shape');

// iter77: rechtwinklig + Diagonale
const skew = { ...closed, data: { closed: true, points: [{ x: 0, y: 0 }, { x: 100, y: 10 }, { x: 130, y: 95 }, { x: 5, y: 80 }] } };
assert.notStrictEqual(pa.calculatePolygonAreaM2(skew, m4), 12);
assert.strictEqual(pa.calculatePolygonAreaM2(skew, m4, undefined, { rightAngles: true }), 12);
// L-Form rechtwinklig: 4x3 minus 2x1 = 10
const lPts = [{ x: 0, y: 0 }, { x: 105, y: 8 }, { x: 95, y: 50 }, { x: 55, y: 45 }, { x: 48, y: 82 }, { x: -6, y: 75 }];
const lEl = { id: 'l', type: 'polyline', data: { closed: true, points: lPts } };
const lM = { l: { 0: '4m', 1: '2m', 2: '2m', 3: '1m', 4: '2m', 5: '3m' } };
assert.strictEqual(pa.calculatePolygonAreaM2(lEl, lM, undefined, { rightAngles: true }), 10);
// Diagonale: Rechteck 4x3 → Diagonale 5 → 12; Raute/Parallelogramm mit Diagonale 4 → kleiner
assert.strictEqual(pa.quadDiagonalAreaM2(m4.a, '5m'), 12);
assert.strictEqual(pa.calculatePolygonAreaM2(skew, m4, undefined, { diagonal: '5' }), 12);
assert.strictEqual(pa.quadDiagonalAreaM2(m4.a, '4m'), 11.12); // 2 × Heron(4,3,4)
assert.strictEqual(pa.quadDiagonalAreaM2(m4.a, '9m'), null); // passt nicht → ignoriert
assert.strictEqual(pa.calculatePolygonAreaM2(closed, m4, undefined, { diagonal: '9m' }), 12);
console.log('OK options');

// iter78: Diagonalen bei mehr als vier Ecken
// Fünfeck (Meter-Koordinaten): (0,0) (4,0) (5,2) (3,4) (0,3) → Fläche 15,5
const P5 = [[0, 0], [4, 0], [5, 2], [3, 4], [0, 3]];
const dist = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1]).toFixed(4) + 'm';
const m5: any = {}; P5.forEach((p, i) => { m5[i] = dist(p, P5[(i + 1) % 5]); });
const o5 = { diagonals: { 2: dist(P5[0], P5[2]), 3: dist(P5[0], P5[3]) } };
assert.strictEqual(pa.polygonDiagonalAreaM2(m5, o5, 5), 15.5);
assert.strictEqual(pa.polygonDiagonalAreaM2(m5, { diagonals: { 2: o5.diagonals[2] } }, 5), null); // eine fehlt
// völlig verzogen gezeichnet, Ergebnis trotzdem exakt
const el5 = { id: 'p', type: 'polyline', data: { closed: true, points: [{ x: 0, y: 0 }, { x: 90, y: 20 }, { x: 140, y: 60 }, { x: 60, y: 130 }, { x: -20, y: 70 }] } };
assert.strictEqual(pa.calculatePolygonAreaM2(el5, { p: m5 }, undefined, o5), 15.5);
// L-Form (einspringende Ecke): (0,0) (4,0) (4,2) (2,2) (2,3) (0,3) → 10; von Ecke 0 aus
const L6 = [[0, 0], [4, 0], [4, 2], [2, 2], [2, 3], [0, 3]];
const m6: any = {}; L6.forEach((p, i) => { m6[i] = dist(p, L6[(i + 1) % 6]); });
const o6 = { diagonals: { 2: dist(L6[0], L6[2]), 3: dist(L6[0], L6[3]), 4: dist(L6[0], L6[4]) } };
const elL = { id: 'q', type: 'polyline', data: { closed: true, points: L6.map(p => ({ x: p[0] * 30, y: p[1] * 30 })) } };
assert.strictEqual(pa.calculatePolygonAreaM2(elL, { q: m6 }, undefined, o6), 10);
// einspringende Ecke, bei der ein Dreieck abgezogen wird: (0,0) (4,0) (1,1) (0,4) → 4
const D4 = [[0, 0], [4, 0], [1, 1], [0, 4]];
const m4d: any = {}; D4.forEach((p, i) => { m4d[i] = dist(p, D4[(i + 1) % 4]); });
const elD = { id: 'd', type: 'polyline', data: { closed: true, points: D4.map(p => ({ x: p[0] * 30, y: p[1] * 30 })) } };
assert.strictEqual(pa.calculatePolygonAreaM2(elD, { d: m4d }, undefined, { diagonal: dist(D4[0], D4[2]) }), 4);
console.log('OK diagonals');

// iter79: frei gewählte Diagonalen und Winkel (Ausgleich über Abstände)
const o5b = { useDiagonals: true, pairs: { '1-3': dist(P5[1], P5[3]), '1-4': dist(P5[1], P5[4]) } };
assert.strictEqual(pa.calculatePolygonAreaM2(el5, { p: m5 }, undefined, o5b), 15.5);
assert.strictEqual(pa.computePolygon(el5, { p: m5 }, undefined, o5b).extras, 2);
// Viereck 4x3 schief gezeichnet, ein Winkel 90° macht es zum Rechteck
assert.strictEqual(pa.calculatePolygonAreaM2(skew, m4, undefined, { useAngles: true, angles: { 0: '90' } }), 12);
assert.strictEqual(pa.calculatePolygonAreaM2(skew, m4, undefined, { useAngles: false, angles: { 0: '90' } }), pa.calculatePolygonAreaM2(skew, m4));
// Parallelogramm 60°: 4*3*sin60 = 10,39
assert.strictEqual(pa.calculatePolygonAreaM2(skew, m4, undefined, { useAngles: true, angles: { 1: '60' } }), 10.39);
// L-Form schief gezeichnet, drei Winkel (90, 90, 270)
const skewL = { id: 'q', type: 'polyline', data: { closed: true, points: [{ x: 0, y: 0 }, { x: 118, y: 10 }, { x: 125, y: 66 }, { x: 62, y: 55 }, { x: 55, y: 95 }, { x: -8, y: 88 }] } };
assert.strictEqual(pa.calculatePolygonAreaM2(skewL, { q: m6 }, undefined, { useAngles: true, angles: { 1: '90', 2: '90', 3: '270' } }), 10);
// widersprüchliche Diagonale → Abweichung wird gemeldet
assert.ok(pa.computePolygon(closed, m4, undefined, { useDiagonals: true, pairs: { '0-2': '8m' } }).maxError > 0.05);
const ang = pa.drawnInteriorAngles(L6.map(p => ({ x: p[0], y: p[1] }))).map(Math.round);
assert.deepStrictEqual(ang, [90, 90, 90, 270, 90, 90]);
console.log('OK solver');

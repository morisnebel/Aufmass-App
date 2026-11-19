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
assert.notStrictEqual(pa.areaShapeKey(4, m4.a), pa.areaShapeKey(4, { ...m4.a, 0: '5m' }));
console.log('OK shape');

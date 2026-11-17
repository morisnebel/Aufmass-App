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

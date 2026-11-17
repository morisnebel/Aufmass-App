// Ausführen: cd /app/frontend && npx tsx ../tests/e2e/iter60_buffered_input_sequence.test.ts
// Simuliert die Zeichenfolge des Lasers inkl. des auf dem iPad beobachteten Cursor-Sprungs
// (nach dem Dezimaltrenner landen die Folgezeichen VOR dem Trenner).
import assert from 'node:assert';

// react-native wird für die reinen Funktionen nicht benötigt
// eslint-disable-next-line @typescript-eslint/no-require-imports
require('node:module').prototype.require = new Proxy(require('node:module').prototype.require, {
  apply(target, thisArg, args) {
    if (args[0] === 'react-native') return { TextInput: () => null };
    return Reflect.apply(target, thisArg, args);
  },
});
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { advanceSequence, expectedText, EMPTY_SEQUENCE } = require('../../frontend/src/components/BufferedTextInput');

// jumpAfter: nach diesem Zeichen springt der Cursor um eine Stelle zurück
const transmit = (start: string, chars: string, gapMs: number, replace: boolean, jumpAfter?: string, cursorStart?: number) => {
  let text = start;
  let cursor = cursorStart ?? start.length;
  let seq = EMPTY_SEQUENCE;
  let now = 1000;
  for (const ch of chars) {
    const next = text.slice(0, cursor) + ch + text.slice(cursor);
    seq = advanceSequence(seq, text, next, now);
    text = next;
    cursor += 1;
    if (ch === jumpAfter) cursor -= 1;
    now += gapMs;
  }
  return { raw: text, fixed: expectedText(seq, text, replace) };
};

for (const v of ['2.91m', '3.62m', '12.45m', '2,90m', '2.91', '12,45']) {
  const sep = v.includes(',') ? ',' : '.';
  // Erste Übertragung ins leere Feld, mit Cursor-Sprung
  const first = transmit('', v, 5, true, sep);
  assert.notStrictEqual(first.raw, v, 'Simulation muss den Fehler erzeugen');
  assert.strictEqual(first.fixed, v);
  // Ohne Cursor-Sprung
  assert.strictEqual(transmit('', v, 5, true).fixed, v);
  // Zweite Übertragung ersetzt den alten Wert – auch wenn der Cursor mitten im Feld steht
  assert.strictEqual(transmit('2,90m', v, 5, true, sep).fixed, v);
  assert.strictEqual(transmit('2,90m', v, 5, true, sep, 4).fixed, v);
  // Freitextfeld: anhängen, Reihenfolge korrekt
  assert.strictEqual(transmit('Wand ', v, 5, false, sep).fixed, 'Wand ' + v);
  // Rechenzeichen: anhängen
  assert.strictEqual(transmit('2,50 + ', v, 5, true, sep).fixed, '2,50 + ' + v);
}

// Genau der Fall aus dem Screenshot: "290m," statt "2,90m"
assert.strictEqual(transmit('', '2,90m', 5, true, ',').raw, '290m,');

// Tippen von Hand (200 ms pro Zeichen) ersetzt nichts
assert.strictEqual(transmit('2,50m', '3,62', 200, true).fixed, '2,50m3,62');
// Einzelnes Zeichen bleibt unverändert
assert.strictEqual(transmit('2,5', '0', 5, true).fixed, '2,50');

console.log('OK');

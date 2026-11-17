import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { TextInput, TextInputProps } from 'react-native';

// Eingabefeld für schnelle Bluetooth-Tastatureingaben (z.B. Leica DISTO).
// 1) Der Text wird lokal gehalten und erst nach einer kurzen Eingabepause an den
//    (schweren) Eltern-Screen gemeldet.
// 2) Die Zeichen einer zusammenhängenden Eingabe werden in ihrer Ankunfts-
//    Reihenfolge mitgeschrieben. Springt der Cursor während der Übertragung
//    (auf dem iPad landete das Komma hinter den Folgeziffern: "290m," statt
//    "2,90m"), wird der Feldinhalt nach der Eingabe aus dieser Reihenfolge
//    wiederhergestellt.

const SEQUENCE_GAP_MS = 300; // Zeichen in kürzerem Abstand gehören zur selben Eingabe
const EMIT_MS = 80; // Eingabepause, nach der der Wert an den Screen gemeldet wird
const DEVICE_AVG_GAP_MS = 80; // so schnell tippt nur ein Gerät
const DEVICE_MIN_EVENTS = 3;

const MEASUREMENT_RE = /^\s*[+-]?\d+(?:[.,]\d+)?\s*(?:mm|cm|dm|km|m|ft|in)?\s*$/i;
const OPEN_EXPRESSION_RE = /[+\-*/×x÷(]\s*$/;

export type InputSequence = {
  base: string; // Feldinhalt vor der Eingabe
  pos: number; // Einfügeposition des ersten Zeichens
  typed: string; // eingegebene Zeichen in Ankunfts-Reihenfolge
  count: number;
  startAt: number;
  lastAt: number;
};

export const EMPTY_SEQUENCE: InputSequence = { base: '', pos: 0, typed: '', count: 0, startAt: 0, lastAt: 0 };

// Verarbeitet eine Textänderung (prev -> next) und führt die laufende Eingabe fort
export const advanceSequence = (seq: InputSequence, prev: string, next: string, now: number): InputSequence => {
  let p = 0;
  const max = Math.min(prev.length, next.length);
  while (p < max && prev[p] === next[p]) p++;
  let s = 0;
  while (s < max - p && prev[prev.length - 1 - s] === next[next.length - 1 - s]) s++;
  const inserted = next.slice(p, next.length - s);
  const removed = prev.slice(p, prev.length - s);
  if (removed !== '' || inserted === '') return EMPTY_SEQUENCE; // Löschen/Ersetzen beendet die Eingabe
  if (seq.count > 0 && now - seq.lastAt <= SEQUENCE_GAP_MS) {
    return { ...seq, typed: seq.typed + inserted, count: seq.count + 1, lastAt: now };
  }
  return { base: prev, pos: p, typed: inserted, count: 1, startAt: now, lastAt: now };
};

// Soll-Inhalt des Feldes für die laufende Eingabe
export const expectedText = (seq: InputSequence, current: string, replace: boolean): string => {
  if (seq.count < 2) return current;
  const before = seq.base.slice(0, seq.pos);
  const after = seq.base.slice(seq.pos);
  const isDevice =
    seq.count >= DEVICE_MIN_EVENTS && (seq.lastAt - seq.startAt) / (seq.count - 1) <= DEVICE_AVG_GAP_MS;
  // Ein vom Gerät übertragener Messwert ersetzt den alten Inhalt, außer davor
  // steht ein Rechenzeichen (z.B. "2,50 + ")
  if (replace && isDevice && seq.base.trim() && MEASUREMENT_RE.test(seq.typed) && !OPEN_EXPRESSION_RE.test(before)) {
    return seq.typed.trim();
  }
  return before + seq.typed + after;
};

type Props = Omit<TextInputProps, 'value' | 'onChangeText'> & {
  value: string;
  onChangeText: (text: string) => void;
  // Maßfeld: ein neu übertragener Messwert ersetzt den bestehenden Feldinhalt
  replaceOnBurst?: boolean;
};

type InputInstance = React.ComponentRef<typeof TextInput>;

const BufferedTextInput = forwardRef<any, Props>(
  ({ value, onChangeText, replaceOnBurst, onBlur, onSubmitEditing, ...rest }, ref) => {
    const [text, setText] = useState(value);
    const inputRef = useRef<InputInstance>(null);
    const textRef = useRef(value);
    const lastSent = useRef(value);
    const emitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const finalizeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const seq = useRef<InputSequence>(EMPTY_SEQUENCE);
    const emitRef = useRef(onChangeText);
    const replaceRef = useRef(!!replaceOnBurst);

    useImperativeHandle(ref, () => inputRef.current);

    useEffect(() => {
      emitRef.current = onChangeText;
      replaceRef.current = !!replaceOnBurst;
    });

    const clearTimers = () => {
      if (emitTimer.current) clearTimeout(emitTimer.current);
      if (finalizeTimer.current) clearTimeout(finalizeTimer.current);
      emitTimer.current = null;
      finalizeTimer.current = null;
    };

    const emit = (next: string) => {
      if (next !== lastSent.current) {
        lastSent.current = next;
        emitRef.current(next);
      }
    };

    // Eingabe abschließen: Feldinhalt ggf. korrigieren/ersetzen und melden
    const finalize = useCallback((mounted = true) => {
      clearTimers();
      const next = expectedText(seq.current, textRef.current, replaceRef.current);
      seq.current = EMPTY_SEQUENCE;
      if (next !== textRef.current) {
        textRef.current = next;
        if (mounted) {
          setText(next);
          // Cursor wieder ans Ende, damit die nächste Übertragung dort ansetzt
          setTimeout(() => {
            const input = inputRef.current;
            // setSelection gibt es nur nativ (nicht in der Web-Vorschau)
            if (input?.isFocused?.() && textRef.current === next) input.setSelection?.(next.length, next.length);
          }, 0);
        }
      }
      emit(next);
    }, []);

    const handleChange = useCallback(
      (next: string) => {
        seq.current = advanceSequence(seq.current, textRef.current, next, Date.now());
        textRef.current = next;
        setText(next);
        clearTimers();
        emitTimer.current = setTimeout(
          () => emit(expectedText(seq.current, textRef.current, replaceRef.current)),
          EMIT_MS
        );
        finalizeTimer.current = setTimeout(finalize, SEQUENCE_GAP_MS + 20);
      },
      [finalize]
    );

    // Änderungen von außen (Numpad, Zurücksetzen, Laden) übernehmen
    useEffect(() => {
      if (value !== lastSent.current) {
        clearTimers();
        seq.current = EMPTY_SEQUENCE;
        lastSent.current = value;
        textRef.current = value;
        setText(value);
      }
    }, [value]);

    useEffect(() => () => finalize(false), [finalize]);

    return (
      <TextInput
        // Maßfelder: keine Autokorrektur, die Zeichen oder Cursor verändert
        {...(replaceOnBurst ? { autoCorrect: false, spellCheck: false, autoCapitalize: 'none' as const } : null)}
        {...rest}
        ref={inputRef}
        value={text}
        onChangeText={handleChange}
        onBlur={(e) => {
          finalize();
          onBlur?.(e);
        }}
        onSubmitEditing={(e) => {
          finalize();
          onSubmitEditing?.(e);
        }}
      />
    );
  }
);

BufferedTextInput.displayName = 'BufferedTextInput';

export default BufferedTextInput;

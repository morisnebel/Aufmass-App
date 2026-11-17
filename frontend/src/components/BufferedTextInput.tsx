import React, { forwardRef, useCallback, useEffect, useRef, useState } from 'react';
import { TextInput, TextInputProps } from 'react-native';

// Eingabefeld für schnelle Bluetooth-Tastatureingaben (z.B. Leica DISTO).
// Der Text wird lokal gehalten und erst nach einer kurzen Eingabepause an den
// (schweren) Eltern-Screen gemeldet. So rendert pro Zeichen nur dieses Feld neu,
// und es wird kein veralteter Feldinhalt in das native Feld zurückgeschrieben.

const BURST_GAP_MS = 60; // Zeichen in kürzerem Abstand gelten als Geräte-Übertragung
const QUIET_MS = 80; // Eingabepause, nach der der Wert weitergemeldet wird
const BURST_MIN_CHARS = 3;

const MEASUREMENT_RE = /^\s*[+-]?\d+(?:[.,]\d+)?\s*(?:mm|cm|dm|km|m|ft|in)?\s*$/i;
const OPEN_EXPRESSION_RE = /[+\-*/×x÷(]\s*$/;

// Liefert den Feldinhalt nach einer Geräte-Übertragung: Ein vollständig neu
// übertragener Messwert ersetzt den vorherigen Inhalt, außer dieser endet mit
// einem Rechenzeichen (z.B. "2,50 + ").
export const resolveMeasurementBurst = (base: string, full: string): string => {
  if (!base.trim() || !full.startsWith(base)) return full;
  const tail = full.slice(base.length);
  if (!MEASUREMENT_RE.test(tail) || OPEN_EXPRESSION_RE.test(base)) return full;
  return tail.trim();
};

type Props = Omit<TextInputProps, 'value' | 'onChangeText'> & {
  value: string;
  onChangeText: (text: string) => void;
  // Neuer, am Stück übertragener Messwert ersetzt den bestehenden Feldinhalt
  replaceOnBurst?: boolean;
};

const BufferedTextInput = forwardRef<TextInput, Props>(
  ({ value, onChangeText, replaceOnBurst, onBlur, onSubmitEditing, ...rest }, ref) => {
    const [text, setText] = useState(value);
    const textRef = useRef(value);
    const lastSent = useRef(value);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const burst = useRef({ base: '', count: 0, lastAt: 0 });
    const emitRef = useRef(onChangeText);
    const replaceRef = useRef(replaceOnBurst);

    useEffect(() => {
      emitRef.current = onChangeText;
      replaceRef.current = replaceOnBurst;
    });

    // Eingabe abschließen: ggf. alten Wert ersetzen, dann an den Screen melden
    const flush = useCallback((mounted = true) => {
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
      }
      let next = textRef.current;
      const b = burst.current;
      if (replaceRef.current && b.count >= BURST_MIN_CHARS) {
        next = resolveMeasurementBurst(b.base, next);
      }
      burst.current = { base: '', count: 0, lastAt: 0 };
      if (next !== textRef.current) {
        textRef.current = next;
        if (mounted) setText(next);
      }
      if (next !== lastSent.current) {
        lastSent.current = next;
        emitRef.current(next);
      }
    }, []);

    const handleChange = useCallback(
      (next: string) => {
        const now = Date.now();
        const b = burst.current;
        const prev = textRef.current;
        const isAppend = next.length > prev.length && next.startsWith(prev);
        if (isAppend && b.count > 0 && now - b.lastAt <= BURST_GAP_MS) {
          b.count += 1;
        } else {
          b.base = prev;
          b.count = isAppend ? 1 : 0;
        }
        b.lastAt = now;
        textRef.current = next;
        setText(next);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(flush, QUIET_MS);
      },
      [flush]
    );

    // Änderungen von außen (Numpad, Zurücksetzen, Laden) übernehmen
    useEffect(() => {
      if (value !== lastSent.current) {
        if (timer.current) {
          clearTimeout(timer.current);
          timer.current = null;
        }
        burst.current = { base: '', count: 0, lastAt: 0 };
        lastSent.current = value;
        textRef.current = value;
        setText(value);
      }
    }, [value]);

    useEffect(() => () => flush(false), [flush]);

    return (
      <TextInput
        {...rest}
        ref={ref}
        value={text}
        onChangeText={handleChange}
        onBlur={(e) => {
          flush();
          onBlur?.(e);
        }}
        onSubmitEditing={(e) => {
          flush();
          onSubmitEditing?.(e);
        }}
      />
    );
  }
);

BufferedTextInput.displayName = 'BufferedTextInput';

export default BufferedTextInput;

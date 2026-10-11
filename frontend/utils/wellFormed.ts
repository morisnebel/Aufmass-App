// Reparatur von Strings mit ungültigem UTF-16 (einsame Surrogate, z.B. durch
// zerschnittene Emojis). Hermes kodiert einsame Surrogate als ungültiges UTF-8;
// auf der nativen Seite entsteht daraus NSNull -> Crash in AsyncStorage/SQLite.
const SURROGATE_RE = /[\uD800-\uDFFF]/;

export const toWellFormedString = (s: string): string => {
  if (!SURROGATE_RE.test(s)) return s;
  const twf = (String.prototype as any).toWellFormed;
  if (typeof twf === 'function') {
    return twf.call(s);
  }
  // Manueller Fallback: einsame Surrogate durch U+FFFD ersetzen,
  // gültige Paare (Emojis etc.) bleiben unangetastet.
  let out = '';
  let start = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff) {
      const n = i + 1 < s.length ? s.charCodeAt(i + 1) : 0;
      if (n >= 0xdc00 && n <= 0xdfff) {
        i++; // gültiges Paar
      } else {
        out += s.slice(start, i) + '\ufffd';
        start = i + 1;
      }
    } else if (c >= 0xdc00 && c <= 0xdfff) {
      out += s.slice(start, i) + '\ufffd';
      start = i + 1;
    }
  }
  if (start === 0) return s;
  return out + s.slice(start);
};

export const toSafeValue = (value: unknown): string | null => {
  if (value === null || value === undefined) return null;
  const str =
    typeof value === 'string'
      ? value
      : typeof value === 'object'
        ? JSON.stringify(value)
        : String(value);
  if (typeof str !== 'string') return null; // JSON.stringify kann undefined liefern
  return toWellFormedString(str);
};

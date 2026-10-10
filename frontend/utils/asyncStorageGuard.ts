// Globaler Schutz gegen native iOS-Crashes in AsyncStorage:
// "-[NSNull length]: unrecognized selector" (SIGABRT).
//
// URSACHEN (beide werden hier abgefangen):
// 1) null/undefined als Wert an setItem/multiSet.
// 2) WICHTIGSTE URSACHE (TestFlight-Crashlogs Build 124-126): JS-Strings mit
//    UNGÜLTIGEM UTF-16 (einsame Surrogate, z.B. durch zerschnittene Emojis).
//    Hermes kodiert einsame Surrogate als ungültiges UTF-8 (WTF-8); auf der
//    nativen Seite liefert [NSString stringWithUTF8String:] dann nil, und
//    React Natives Array-Konvertierung ersetzt nil durch NSNull
//    (convertJSIArrayToNSArray: "?: (id)kCFNull"). In RNCAsyncStorage
//    _writeEntry crasht anschließend value.length auf NSNull.
//    Die JS-Validierung der Bibliothek kann das NICHT verhindern, weil der
//    Wert in JS ein ganz normaler String ist.
//
// Dieser Guard repariert Strings deshalb VOR der nativen Brücke
// (einsame Surrogate -> U+FFFD) und muss als ERSTER Import in _layout.tsx laufen.
import AsyncStorage from '@react-native-async-storage/async-storage';

// Schneller Vorab-Test: Base64-/ASCII-Strings (der Großteil der Daten)
// enthalten keine Surrogate und werden ohne Kopie durchgereicht.
const SURROGATE_RE = /[\uD800-\uDFFF]/;

const toWellFormedString = (s: string): string => {
  if (!SURROGATE_RE.test(s)) return s;
  // ES2024 String.prototype.toWellFormed nutzen, falls vorhanden
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

const toSafeValue = (value: unknown): string | null => {
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

const origSetItem = AsyncStorage.setItem.bind(AsyncStorage);
AsyncStorage.setItem = ((key: string, value: unknown, callback?: never) => {
  const safeValue = toSafeValue(value);
  if (safeValue === null) {
    console.warn(`[AsyncStorageGuard] setItem('${key}') mit null/undefined ignoriert`);
    return Promise.resolve();
  }
  return origSetItem(toWellFormedString(String(key)), safeValue, callback);
}) as typeof AsyncStorage.setItem;

const origMultiSet = AsyncStorage.multiSet.bind(AsyncStorage);
AsyncStorage.multiSet = ((pairs: [string, unknown][], callback?: never) => {
  const safe: [string, string][] = [];
  for (const pair of pairs || []) {
    if (!pair) continue;
    const [k, v] = pair;
    const safeValue = toSafeValue(v);
    if (safeValue === null) {
      console.warn(`[AsyncStorageGuard] multiSet('${k}') mit null/undefined ignoriert`);
      continue;
    }
    safe.push([toWellFormedString(String(k)), safeValue]);
  }
  if (safe.length === 0) return Promise.resolve();
  return origMultiSet(safe, callback);
}) as typeof AsyncStorage.multiSet;

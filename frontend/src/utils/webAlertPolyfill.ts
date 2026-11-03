// Web-Vorschau: react-native-web implementiert Alert.alert nicht (No-op).
// Dieses Polyfill bildet Alert.alert auf window.alert / window.confirm ab,
// damit Bestätigungen (Speichern, Backup wiederherstellen, Löschen …) auch im Browser funktionieren.
import { Alert, Platform, AlertButton } from 'react-native';

if (Platform.OS === 'web' && typeof window !== 'undefined') {
  Alert.alert = (title: string, message?: string, buttons?: AlertButton[]) => {
    const text = [title, message].filter(Boolean).join('\n\n');
    const list = buttons && buttons.length > 0 ? buttons : [{ text: 'OK' }];
    const cancel = list.find(b => b.style === 'cancel');
    const actions = list.filter(b => b !== cancel);

    // Nur ein Button (oder nur Abbrechen) → Hinweis-Dialog
    if (actions.length === 0 || (actions.length === 1 && !cancel)) {
      window.alert(text);
      (actions[0] || cancel)?.onPress?.();
      return;
    }

    // Eine Aktion + Abbrechen → OK/Abbrechen (Beschriftungen als Hinweis anzeigen)
    if (actions.length === 1) {
      const hint = `\n\nOK = „${actions[0].text}" · Abbrechen = „${cancel?.text || 'Abbrechen'}"`;
      if (window.confirm(text + hint)) actions[0].onPress?.();
      else cancel?.onPress?.();
      return;
    }

    // Mehrere Aktionen → nacheinander abfragen, erste Bestätigung gewinnt
    for (let i = 0; i < actions.length; i++) {
      const isLast = i === actions.length - 1 && !cancel;
      if (isLast) {
        window.alert(`${text}\n\n→ ${actions[i].text}`);
        actions[i].onPress?.();
        return;
      }
      if (window.confirm(`${text}\n\n→ „${actions[i].text}" wählen?\n(Abbrechen = nächste Option)`)) {
        actions[i].onPress?.();
        return;
      }
    }
    cancel?.onPress?.();
  };

  // Alert.prompt gibt es nur auf iOS → im Web über window.prompt abbilden
  (Alert as any).prompt = (title: string, message?: string, callbackOrButtons?: any, _type?: string, defaultValue?: string) => {
    const value = window.prompt([title, message].filter(Boolean).join('\n\n'), defaultValue || '');
    if (typeof callbackOrButtons === 'function') {
      if (value !== null) callbackOrButtons(value);
      return;
    }
    const list: AlertButton[] = Array.isArray(callbackOrButtons) ? callbackOrButtons : [];
    const cancel = list.find(b => b.style === 'cancel');
    const action = list.find(b => b !== cancel);
    if (value === null) cancel?.onPress?.();
    else (action?.onPress as any)?.(value);
  };
}

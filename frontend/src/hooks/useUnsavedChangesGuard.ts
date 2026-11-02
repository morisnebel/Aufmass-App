import { useRef } from 'react';
import { Alert, Platform } from 'react-native';
import { usePreventRemove } from 'expo-router/react-navigation';

interface GuardOptions {
  /** Statt Nachfrage: still speichern & verlassen (onSaveAndLeave wird direkt aufgerufen) */
  autoSave?: boolean;
}

/**
 * Schutz vor Datenverlust beim Verlassen einer Seite (Wisch-Geste, Zurück-Taste).
 *
 * - `hasUnsavedChanges`: solange true, wird das Verlassen abgefangen.
 * - `onSaveAndLeave`: speichert UND navigiert selbst zurück. Die Funktion muss vor
 *   ihrem eigenen `router.back()` `allowLeave()` aufrufen (bzw. den Rückgabewert nutzen).
 * - `options.autoSave`: keine Nachfrage, beim Verlassen wird still gespeichert.
 *
 * Rückgabe: `allowLeave()` - vor jeder programmatischen Navigation (z.B. nach
 * erfolgreichem Speichern) aufrufen, damit die Nachfrage nicht erscheint.
 */
export function useUnsavedChangesGuard(
  hasUnsavedChanges: boolean,
  onSaveAndLeave?: () => void | Promise<void>,
  options?: GuardOptions,
) {
  const allowLeaveRef = useRef(false);
  const onSaveRef = useRef(onSaveAndLeave);
  onSaveRef.current = onSaveAndLeave;
  const autoSave = options?.autoSave === true;

  // Expo Router 58: Sperre muss vor dem erneuten Dispatch deaktiviert werden
  // (`repeat`/`disablePrevention`), sonst Endlosschleife ("Maximum update depth exceeded")
  const disablePrevention = usePreventRemove(hasUnsavedChanges, ({ repeat }) => {
    if (allowLeaveRef.current) {
      // Programmatische Navigation nach dem Speichern - durchlassen
      repeat();
      return;
    }
    if (autoSave && onSaveRef.current) {
      // Still speichern und verlassen (Funktion navigiert selbst)
      Promise.resolve(onSaveRef.current()).catch(err =>
        console.error('AutoSave on leave failed:', err)
      );
      return;
    }
    if (Platform.OS === 'web') {
      // Alert.alert mit mehreren Buttons funktioniert nicht im Web
      if (onSaveRef.current) {
        if (window.confirm('Seite verlassen? Ihre Änderungen werden gespeichert.')) {
          Promise.resolve(onSaveRef.current()).catch(err => console.error(err));
        }
      } else if (window.confirm('Seite verlassen? Nicht gespeicherte Änderungen gehen verloren.')) {
        allowLeaveRef.current = true;
        repeat();
      }
      return;
    }
    const buttons: any[] = [
      { text: 'Abbrechen', style: 'cancel' },
      {
        text: 'Verwerfen',
        style: 'destructive',
        onPress: () => {
          allowLeaveRef.current = true;
          repeat();
        },
      },
    ];
    if (onSaveRef.current) {
      buttons.push({
        text: 'Speichern',
        onPress: () =>
          Promise.resolve(onSaveRef.current!()).catch(err =>
            console.error('Save on leave failed:', err)
          ),
      });
    }
    Alert.alert(
      'Seite verlassen?',
      onSaveRef.current
        ? 'Möchten Sie Ihre Änderungen speichern, bevor Sie die Seite verlassen?'
        : 'Sie haben nicht gespeicherte Änderungen.',
      buttons
    );
  });

  return {
    /** Vor programmatischer Navigation (z.B. nach erfolgreichem Speichern) aufrufen */
    allowLeave: () => {
      allowLeaveRef.current = true;
      disablePrevention();
    },
  };
}

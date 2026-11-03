// Navi öffnen und Abfahrts-Erinnerung (lokale Benachrichtigung) für Termine
import { Alert, Linking, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

// Erinnerungen auch anzeigen, wenn die App gerade geöffnet ist
if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

export const REMINDER_BUFFER_MIN = 10; // Puffer zusätzlich zur Fahrzeit

// Öffnet die Navigation des Handys (Apple Karten / Google Maps) zur Adresse
export const openNavigation = async (address: string) => {
  const q = encodeURIComponent(address);
  const urls = Platform.select({
    ios: [`maps://?daddr=${q}&dirflg=d`, `https://maps.apple.com/?daddr=${q}&dirflg=d`],
    android: [`google.navigation:q=${q}`, `geo:0,0?q=${q}`],
    default: [`https://www.google.com/maps/dir/?api=1&destination=${q}`],
  }) as string[];
  for (const url of urls) {
    try {
      if (Platform.OS === 'web' || (await Linking.canOpenURL(url))) { await Linking.openURL(url); return; }
    } catch {}
  }
  await Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${q}`);
};

export const departureTime = (date: string, time: string, travelMinutes: number): Date => {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  return new Date(new Date(y, m - 1, d, hh, mm).getTime() - (travelMinutes + REMINDER_BUFFER_MIN) * 60000);
};

// Berechtigung prüfen/anfragen – mit Weg in die Einstellungen, wenn dauerhaft abgelehnt
const ensurePermission = async (): Promise<boolean> => {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (current.canAskAgain) {
    const req = await Notifications.requestPermissionsAsync();
    if (req.granted) return true;
  }
  Alert.alert(
    'Erinnerungen deaktiviert',
    'Damit dich die App rechtzeitig zum Losfahren erinnert, erlaube bitte Mitteilungen in den Einstellungen.',
    [{ text: 'Später', style: 'cancel' }, { text: 'Einstellungen öffnen', onPress: () => Linking.openSettings() }]
  );
  return false;
};

// Plant die Abfahrts-Erinnerung; gibt die ID zurück (oder null, wenn nicht möglich)
export const scheduleDepartureReminder = async (opts: {
  title: string; date: string; time: string; travelMinutes: number; address?: string;
}): Promise<string | null> => {
  if (Platform.OS === 'web') return null;
  const at = departureTime(opts.date, opts.time, opts.travelMinutes);
  if (at.getTime() <= Date.now() + 30000) return null;
  if (!(await ensurePermission())) return null;
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('termine', { name: 'Termine', importance: Notifications.AndroidImportance.HIGH });
  }
  return Notifications.scheduleNotificationAsync({
    content: {
      title: `Zeit loszufahren: ${opts.title}`,
      body: `Termin um ${opts.time} Uhr${opts.address ? ` · ${opts.address}` : ''} (ca. ${opts.travelMinutes} Min. Fahrt)`,
      data: { address: opts.address || '' },
    },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: at, channelId: 'termine' },
  });
};

export const cancelReminder = async (id?: string | null) => {
  if (!id || Platform.OS === 'web') return;
  try { await Notifications.cancelScheduledNotificationAsync(id); } catch {}
};

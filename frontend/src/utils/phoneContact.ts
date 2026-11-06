import { Alert, Linking, Platform } from 'react-native';
import * as Contacts from 'expo-contacts/legacy';

export type PhoneContact = {
  name: string; firstName: string; lastName: string;
  phone: string; mobile: string; email: string;
  street: string; zip: string; city: string;
};

const num = (p: any) => p?.number || p?.digits || p?.value || '';

const toPhoneContact = (c: Contacts.Contact): PhoneContact => {
  const firstName = c.firstName || '';
  const lastName = c.lastName || '';
  let phone = '';
  let mobile = '';
  for (const p of (c.phoneNumbers || []) as any[]) {
    const label = (p?.label || '').toLowerCase();
    if (/mobil|mobile|handy|cell|iphone/.test(label)) { if (!mobile) mobile = num(p); } else if (!phone) phone = num(p);
  }
  const addr = (c.addresses?.[0] || {}) as any;
  const email = ((c.emails?.[0] as any)?.email) || '';
  const name = (c.name || [firstName, lastName].filter(Boolean).join(' ') || c.company || '').trim();
  return { name, firstName, lastName, phone, mobile, email, street: addr.street || '', zip: addr.postalCode || '', city: addr.city || '' };
};

// Telefonbuch: Erlaubnis prüfen, dann die System-Kontaktauswahl öffnen
export async function pickPhoneContact(): Promise<PhoneContact | null> {
  if (Platform.OS === 'web') {
    Alert.alert('Nur in der App', 'Das Telefonbuch kann nur in der App auf dem Handy geöffnet werden.');
    return null;
  }
  if (Platform.OS === 'android') {
    let perm = await Contacts.getPermissionsAsync();
    if (perm.status !== 'granted' && perm.canAskAgain) perm = await Contacts.requestPermissionsAsync();
    if (perm.status !== 'granted') {
      Alert.alert('Kein Zugriff auf Kontakte', 'Erlaube den Zugriff in den Einstellungen, um Kunden aus dem Telefonbuch zu übernehmen.', [
        { text: 'Abbrechen', style: 'cancel' },
        { text: 'Einstellungen öffnen', onPress: () => Linking.openSettings() },
      ]);
      return null;
    }
  }
  try {
    const picked = await Contacts.presentContactPickerAsync();
    return picked ? toPhoneContact(picked) : null;
  } catch {
    Alert.alert('Telefonbuch nicht verfügbar', 'Die Kontaktauswahl konnte nicht geöffnet werden.');
    return null;
  }
}

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform, NativeModules } from 'react-native';
import de from './de.json';
import en from './en.json';

const LANGUAGE_KEY = 'app_language';

// Geräte-Sprache erkennen
const getDeviceLanguage = (): string => {
  try {
    let deviceLang = 'de';
    if (Platform.OS === 'ios') {
      deviceLang = NativeModules.SettingsManager?.settings?.AppleLocale ||
                   NativeModules.SettingsManager?.settings?.AppleLanguages?.[0] || 'de';
    } else if (Platform.OS === 'android') {
      deviceLang = NativeModules.I18nManager?.localeIdentifier || 'de';
    } else {
      // Web
      deviceLang = typeof navigator !== 'undefined' ? (navigator.language || 'de') : 'de';
    }
    // Nur 'de' oder 'en' unterstützt
    return deviceLang.startsWith('de') ? 'de' : deviceLang.startsWith('en') ? 'en' : 'de';
  } catch {
    return 'de';
  }
};

// Sprache aus AsyncStorage laden
export const loadSavedLanguage = async (): Promise<string> => {
  try {
    const saved = await AsyncStorage.getItem(LANGUAGE_KEY);
    if (saved) return saved;
    // Keine gespeicherte Sprache -> Geräte-Sprache verwenden
    return getDeviceLanguage();
  } catch {
    return 'de';
  }
};

// Sprache speichern
export const saveLanguage = async (lang: string) => {
  try {
    await AsyncStorage.setItem(LANGUAGE_KEY, lang);
    i18n.changeLanguage(lang);
  } catch (e) {
    console.error('Error saving language:', e);
  }
};

// Aktuelle Sprache abfragen
export const getCurrentLanguage = (): string => {
  return i18n.language || 'de';
};

i18n
  .use(initReactI18next)
  .init({
    resources: {
      de: { translation: de },
      en: { translation: en },
    },
    lng: 'de', // Standardsprache
    fallbackLng: 'de',
    interpolation: {
      escapeValue: false,
    },
    compatibilityJSON: 'v4',
  });

// Beim Start die gespeicherte Sprache laden
loadSavedLanguage().then(lang => {
  i18n.changeLanguage(lang);
});

export default i18n;

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import AsyncStorage from '@react-native-async-storage/async-storage';
import de from './de.json';
import en from './en.json';

const LANGUAGE_KEY = 'app_language';

// Sprache aus AsyncStorage laden
export const loadSavedLanguage = async (): Promise<string> => {
  try {
    const saved = await AsyncStorage.getItem(LANGUAGE_KEY);
    return saved || 'de'; // Standard: Deutsch
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

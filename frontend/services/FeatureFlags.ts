/**
 * Feature Flags für Aufmassprofi
 * 
 * isPro wird aus AsyncStorage geladen (für Entwickler-Freischaltung)
 * Standard: false (Basic Version)
 * 
 * Entwickler können Pro über versteckten Schalter in Einstellungen aktivieren.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const PRO_KEY = 'aufmassprofi_pro_unlocked';

// Globaler Pro-Status (wird beim App-Start geladen)
let _isPro = false;

// Pro-Status laden (beim App-Start aufrufen)
export const loadProStatus = async (): Promise<boolean> => {
  try {
    const value = await AsyncStorage.getItem(PRO_KEY);
    _isPro = value === 'true';
    return _isPro;
  } catch {
    return false;
  }
};

// Pro-Status setzen und speichern
export const setProStatus = async (value: boolean): Promise<void> => {
  try {
    _isPro = value;
    await AsyncStorage.setItem(PRO_KEY, value ? 'true' : 'false');
  } catch (e) {
    console.error('Error saving Pro status:', e);
  }
};

// Pro-Status abrufen (synchron, nach dem Laden)
export const getProStatus = (): boolean => _isPro;

// Für direkte Verwendung (wird nach App-Start korrekt sein)
export const isPro = _isPro;

// App-Name basierend auf Version (dynamisch)
export const getAppName = () => _isPro ? 'Aufmassprofi Pro' : 'Aufmassprofi';
export const getAppNameHeader = () => _isPro ? '- AUFMASSPROFI Pro -' : '- AUFMASSPROFI -';
export const getAppNameShort = () => _isPro ? 'Pro' : '';

// Legacy exports für Kompatibilität
export const AppName = 'Aufmassprofi'; // Wird dynamisch überschrieben
export const AppNameHeader = '- AUFMASSPROFI -';
export const AppNameShort = '';

// Feature-Funktion die aktuellen Pro-Status prüft
export const getFeatures = () => ({
  // Startseite
  showImportButton: _isPro,
  showVerschiebenButton: _isPro,
  
  // Projektdetails
  showProjektExport: _isPro,
  showFlaechenTab: _isPro,
  showDachTab: _isPro,
  showDokuTab: _isPro,
  showMessungTab: _isPro,
  showReportTab: _isPro,
  
  // Checklisten
  maxChecklistItems: _isPro ? 999 : 5,
  maxMainItems: _isPro ? 999 : 10,
  maxTemplates: _isPro ? 999 : 3,
  allowNestedSubItems: _isPro,
  showChecklistLogo: _isPro,
  showChecklistTemplateLogo: _isPro,
  showChecklistDruckbild: _isPro,
  showChecklistVerknuepfungen: _isPro,
  showChecklistVorschau: _isPro,
  showChecklistBerechnung: _isPro,
  showChecklistImportExport: _isPro,
  
  // Einstellungen
  showReferenzButton: _isPro,
});

// Statische Features für initiale Verwendung (vor dem Laden)
export const Features = {
  // Startseite
  showImportButton: false,
  showVerschiebenButton: false,
  
  // Projektdetails
  showProjektExport: false,
  showFlaechenTab: false,
  showDachTab: false,
  showDokuTab: false,
  showMessungTab: false,
  showReportTab: false,
  
  // Checklisten
  maxChecklistItems: 5,
  maxMainItems: 10,
  maxTemplates: 3,
  allowNestedSubItems: false,
  showChecklistLogo: false,
  showChecklistTemplateLogo: false,
  showChecklistDruckbild: false,
  showChecklistVerknuepfungen: false,
  showChecklistVorschau: false,
  showChecklistBerechnung: false,
  showChecklistImportExport: false,
  
  // Einstellungen
  showReferenzButton: false,
};

// Features aktualisieren basierend auf Pro-Status
export const updateFeatures = () => {
  const f = getFeatures();
  Object.assign(Features, f);
};

// Helper-Funktion um Pro-Status zu prüfen
export const checkProFeature = (featureName: keyof typeof Features): boolean => {
  return Features[featureName] as boolean;
};

// Info-Text für gesperrte Features
export const getProUpgradeText = () => {
  return 'Diese Funktion ist nur in der Pro-Version verfügbar.';
};

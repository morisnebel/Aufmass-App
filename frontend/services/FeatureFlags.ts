/**
 * Feature Flags für Aufmassprofi
 * 
 * isPro = false → Basis Version (eingeschränkt)
 * isPro = true  → Pro Version (alle Features)
 * 
 * Zum Entwickeln/Testen einfach isPro auf true setzen.
 * Später wird dies durch In-App-Kauf gesteuert.
 */

// HAUPTSCHALTER: Auf 'true' setzen um Pro-Features freizuschalten
export const isPro = false;

// App-Name basierend auf Version
export const AppName = isPro ? 'Aufmassprofi Pro' : 'Aufmassprofi Basis';
export const AppNameHeader = isPro ? '- AUFMASSPROFI Pro -' : '- AUFMASSPROFI Basis -';
export const AppNameShort = isPro ? 'Pro' : 'Basis';

// Einzelne Feature-Flags (werden von isPro gesteuert)
export const Features = {
  // Startseite
  showImportButton: isPro,           // Import Button auf Startseite
  showVerschiebenButton: isPro,      // Verschieben/Multi-Select Button
  
  // Projektdetails
  showProjektExport: isPro,          // "PDF-Export" / Projekt exportieren Button
  showFlaechenTab: isPro,            // Flächenberechnung Tab
  showDachTab: isPro,                // Dachberechnung Tab
  showDokuTab: isPro,                // Dokumentation Tab
  
  // Checklisten
  maxChecklistItems: isPro ? 999 : 5,  // Max Unterpunkte (5 für Basis)
  showChecklistLogo: isPro,            // Logo in Checklisten
  showChecklistDruckbild: isPro,       // Druckbild
  showChecklistVerknuepfungen: isPro,  // Verknüpfungen
  showChecklistVorschau: isPro,        // Vorschau
  showChecklistBerechnung: isPro,      // Berechnung
  showChecklistImportExport: isPro,    // Import/Export von Checklisten
  
  // Einstellungen
  showReferenzButton: isPro,          // Referenz Button
};

// Helper-Funktion um Pro-Status zu prüfen
export const checkProFeature = (featureName: keyof typeof Features): boolean => {
  return Features[featureName] as boolean;
};

// Info-Text für gesperrte Features
export const getProUpgradeText = () => {
  return 'Diese Funktion ist nur in der Pro-Version verfügbar.';
};

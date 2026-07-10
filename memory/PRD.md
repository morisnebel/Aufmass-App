# Aufmassprofi App - Product Requirements

## App
- React Native Expo Router App for German construction/roofing measurement
- Bundle ID: com.aufmassprofi.dach
- Version 1.1.0, Build 42 (next: 43)
- Sprache: Deutsch
- iOS + Android via TestFlight/App Store

## Letzte Änderungen (Session)
### Legal & Datenschutz (App Store-Ready)
- DisclaimerGate beim ersten App-Start (Vollbild-Modal, Scroll-Gate, Checkbox, persistente Zustimmung)
- /legal: Hub mit Datenschutz, Haftung, Impressum, Über
- /legal/datenschutz: app-spezifisch (kein Google Analytics/Maps/YouTube)
- /legal/impressum: Nebel-Bedachung Daten + Maß-Haftungsklausel
- /legal/haftung: prominenter Haftungsausschluss für Maße/Berechnungen
- Settings → Rechtliches mit 5 Einträgen + Reset-Option
- Privacy URL: https://nebel-bedachung.de/Aufmassprofi-Datenschutz-Impressum

### Rapport-Verbesserungen
- Briefkopf-Felder konfigurierbar (9 Optionen mit Checkboxen, am Ende des Editors)
- Top-Karte zeigt dynamisch nur die ausgewählten Felder
- Ansprechpartner Phone/Email aus Projekt
- Fahrzeiten direkt nach Mitarbeiter-Stunden (Team oder Pro Mitarbeiter)
- Toggle "Fahrzeit zur Gesamtarbeitszeit hinzurechnen"

### Maschinen & Geräte
- TÜV-Felder (last_tuv_date, next_tuv_date)
- Konfigurierbare Erinnerungs-Tage (Bell-Icon im Header)
- TÜV-Banner auf Startseite
- Horizontale Metric-Cards mit 5 Kacheln

## Key Tech
- Expo Router (file-based)
- AsyncStorage (offline-first, kein Backend)
- expo-print für PDFs
- @react-native-community/datetimepicker
- expo-camera, expo-image-picker (System Picker)

## Test Credentials
- Pro Code: PROFI2024

## Open Items
- Build 43 für TestFlight via Emergent Publish
- Apple App Store Review-Notes: Pro-Code PROFI2024 angeben

## Session Juni 2026 (Fork)
- Selektive Mitarbeiter-Synchronisation im Rapport: Sync-Button (🔄) öffnet Modal mit
  Checkboxen zur Auswahl der Ziel-Mitarbeiter + Option "Datum mit übernehmen" (DONE, getestet)
- ErrorBoundary im Root-Layout (/app/frontend/src/components/ErrorBoundary.tsx) für
  App-Store-Stabilität (Guideline 2.1) eingebaut (DONE)
- Fahrzeit Team: Neues Feld "Anzahl Fahrten (Tage)" – auto-vorgeschlagen aus den
  unterschiedlichen Einsatz-Tagen der Mitarbeiter, manuell überschreibbar.
  Fahrzeit, km & Spesen werden × Tage gerechnet (Live-Kosten + PDF) (DONE, getestet)
- Offen: Projekt-Status/Phasen-Pipeline, Refactoring der Monolith-Dateien,
  Privacy-URL-Verifizierung durch User

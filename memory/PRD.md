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
- Build 46 (v1.1.4) für TestFlight via Emergent Publish vorbereitet
  (Fixes: OOM-Crashes Auto-Backup/Export, extractedCompany, deviceName-Scope,
  Skizzen-Bearbeitungsdaten im Projekt-Export)
- Apple App Store Review-Notes: Pro-Code PROFI2024 angeben

## Session Juni 2026 (Fork)
- Checklisten-OOM-Crash (AufmassprofiBasic-Reports, "Absturz bei Checklisten"):
  Base64-Bilder (printImage/previewImages/categoryLogo/templateLogo) lagen inline in
  aufmassprofi_checklists/_checklist_templates → jede Aktion parste/stringifizierte alles.
  FIX: Bilder in separate Keys (chk_img_<id>) mit @chkimg:-Referenzen; Extraktion bei
  create/update/saveAll, Restore bei getById/getByProjectId/loadAllProjectDataFast;
  Template-getAll löst nur Logos auf. Migration migrateChecklistImages() beim App-Start
  (_layout, mit In-Flight-Guard) + beim Projekt-Öffnen. Bild-Kompression beim Auswählen
  (max 1280px, 60%). Backup/Restore inkludiert jetzt dynamische Keys
  (photo_img_, sketch_meta_, sketch_bg_, chk_img_) via getAllBackupKeys().
  HINWEIS: Crash-Binary war "AufmassprofiBasic 1.0.0" – falls Basic ein separates
  Emergent-Projekt ist, braucht es denselben Fix dort.
- Dokumente-OOM-Fix (gleiche Familie, Reports von Builds 111/118): originalPdfData
  (Base64-PDF) + pages[].imageData lagen inline in aufmassprofi_documents; jeder
  Annotations-Save schrieb alles neu. FIX: Auslagerung in doc_img_<id>-Keys
  (@docimg:-Referenzen), Extraktion in create/update/updatePage, Restore in
  getById/getByProjectId, Cleanup bei delete. Migration migrateDocumentImages()
  beim App-Start. doc_img_ in Backup-DYNAMIC_KEY_PREFIXES aufgenommen.
  Restrisiko (klein, bewusst offen): area_calculations.backgroundImage inline.
- Backup-UX-Fix (Startseiten-Banner): "Sichern"-Button hatte keinen Lade-Zustand →
  Mehrfach-Tipps/parallele Exporte. Neu: backupRunning-State (Spinner + "Backup wird
  erstellt…"), Erfolgs-/Fehler-Alert, Service-seitiger In-Flight-Guard (exportInFlight).
  Performance: Read-Pipeline (nächster Key lädt während des Schreibens).
  Web: Backup jetzt als Browser-Download (writeAsStringAsync existiert auf Web nicht);
  Sharing auf Web übersprungen.
- PDF-Lesbarkeit: "ohne Berechnung der Fahrtzeiten" (10px, #475569, fett-kursiv) und
  Fußzeile "Erstellt mit Aufmassprofi Pro · Datum" (doc-footer 10px, #555) dunkler;
  auch Calculator-PDF-Footer (#555).
- TestFlight-Crash-Analyse (iPad Pro, iOS 26): Root Cause = Hermes-OOM durch Auto-Backup.
  Alt: bis zu 5 Snapshots mit kompletten App-Daten als data_json in EINEM AsyncStorage-Blob,
  jeder App-Start parste/stringifizierte alles → bad_alloc/abort (JSON.stringify im Stack).
- FIX BackupService.ts: Snapshots jetzt als Roh-String-Kopien pro Storage-Key
  (aufmassprofi_snap_<id>_<key>) + leichter Index (aufmassprofi_auto_backups_index).
  Kein JSON.stringify/parse großer Daten mehr. MAX 3 Snapshots. Alter Blob wird ohne
  Parse gelöscht. exportFullBackup streamt das Backup nativ in 512-KB-Chunks in die
  Datei (expo-file-system new API: File/Paths + FileHandle.writeBytes + TextEncoder);
  Web-Preview nutzt weiter den Legacy-Pfad. Grund: 4. Crash zeigte OOM bei
  convertJSIStringToNSString (Riesen-String an natives Expo-Modul übergeben).
- FIX customers/new.tsx: Render Error "Property 'extractedCompany' doesn't exist" –
  Variable war in extractContactData nie deklariert (jetzt: contact.company). Trat beim
  Öffnen der Kontakte-Liste (Import aus Adressbuch) auf.
- FIX Projekt-Export: Skizzen-Bearbeitungsdaten (sketch_meta_<id>/sketch_bg_<id>) wurden
  nicht exportiert → Skizze nach Import im Editor leer. Neu: SketchService.
  getByProjectIdWithData() bettet metadata+backgroundImage in den Export ein;
  create() splittet beim Import automatisch zurück in die optimierten Keys.
- Selektive Mitarbeiter-Synchronisation im Rapport: Sync-Button (🔄) öffnet Modal mit
  Checkboxen zur Auswahl der Ziel-Mitarbeiter + Option "Datum mit übernehmen" (DONE, getestet)
- ErrorBoundary im Root-Layout (/app/frontend/src/components/ErrorBoundary.tsx) für
  App-Store-Stabilität (Guideline 2.1) eingebaut (DONE)
- Fahrzeit Team: Neues Feld "Anzahl Fahrten (Tage)" – auto-vorgeschlagen aus den
  unterschiedlichen Einsatz-Tagen der Mitarbeiter, manuell überschreibbar.
  Fahrzeit, km & Spesen werden × Tage gerechnet (Live-Kosten + PDF) (DONE, getestet)
- Fix: Fahrzeit-Berechnung zählt eindeutige Personen (gleicher Name) statt Einträge –
  3 MA mit je 3 Tages-Einträgen = 3 MA × 3 Tage, nicht 9 MA. Lohnberechnung verteilt
  die Team-Fahrzeit einer Person auf ihre Einträge (DONE, getestet)
- Live Kosten-Übersicht: Datum (📅 TT.MM.JJ) unter jedem Mitarbeiter-Eintrag (DONE, getestet)
- Mehrere Stundensätze pro Mitarbeiter: Stammdaten-Editor "Weitere Stundensätze"
  (Name + €/h, EmployeeMaster.wage_rates). Im Rapport pro Eintrag auswählbar über
  grünen Chip unter der Zeiten-Zeile → Modal (Standard + eigene Sätze). Gewählter Satz
  ersetzt hourly_rate für die Kostenberechnung; nur intern, nicht im PDF (DONE, getestet)
- PDF Kosten-Übersicht: neue Spalte "Datum" (TT.MM.JJ) in der Mitarbeiter-Lohnkosten-Tabelle (DONE)
- Projekt-Export/-Import (.aufmass): Rapporte (reports) werden jetzt mit exportiert
  (Einzel-Export in projects/[id].tsx + Mehrfach-Export in index.tsx) und beim Import
  mit neuer project_id wiederhergestellt (DONE)
- PDF Kosten-Übersicht: Vermerk "ohne Berechnung der Fahrtzeiten" unter der
  Mitarbeiter-Lohnkosten-Tabelle, wenn keine Fahrzeit in die Berechnung einfließt (DONE)
- Offen: Projekt-Status/Phasen-Pipeline, Refactoring der Monolith-Dateien,
  Privacy-URL-Verifizierung durch User

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
- Polygon-Flächenberechnung (m²) in Skizzen: Geschlossene Polygone (Polyline mit
  closed=true) berechnen ihre Fläche via Shoelace-Formel, skaliert über die vom User
  eingegebenen Segment-Maße (Verhältnis Meter/Pixel der gemessenen Kanten). Toggle
  "Fläche anzeigen" im Maß-Eingabe-Panel (AN/AUS, pro Polygon, persistiert in
  Metadaten als polygonAreaVisible). UPDATE: Berechnung nutzt NUR die eingegebenen Maße (alle Seiten müssen bemaßt sein) – Rekonstruktion aus Seitenlängen + gezeichneten Winkeln mit Bowditch-Ausgleich für exakte Ergebnisse (5m×4m = exakt 20,00 m²). Anzeige: Box unter dem S-Label auf dem Canvas,
  in der Übersicht-Legende ("S1 = 5 lfm • 20,83 m²") sowie im SVG/PDF-Export (DONE, getestet)
- Fix Polygon-Fläche Genauigkeit: (1) Winkel-Einrastung – gezeichnete Ecken-Drehwinkel
  werden aufs 45°-Raster gerundet (Toleranz ±12°), damit handgezeichnete rechte Winkel
  exakt zählen (4×5m Viereck = exakt 25,00 m² statt 24,73). (2) Dreiecke werden exakt
  per Heron-Formel nur aus den 3 Seitenmaßen berechnet (DONE, getestet)
- Fix Polygon-Fläche bei mehreren Punkten: Winkelschluss-Ausgleich ergänzt – die Summe
  aller Drehwinkel eines geschlossenen Polygons muss ±360° sein; der Restfehler wird auf
  die nicht eingerasteten (unsicher gezeichneten) Ecken verteilt. Dadurch exakte
  Ergebnisse auch bei 5+ Punkten (L-Form 6 Punkte schief gezeichnet = exakt 10,00 m²,
  U-Form 8 Punkte exakt, Haus-Pentagon exakt) (DONE, getestet)
- Fix macOS Dark Mode Datumsauswahl: Alle 6 nativen DateTimePicker in reports/edit.tsx
  (Datum, Uhrzeiten, Fahrzeiten, Maschinenstunden) haben jetzt themeVariant="light",
  da sie in hellen Modals liegen (weißer Hintergrund + weiße Picker-Schrift im
  macOS-Dunkelmodus = unsichtbar). DatePickerField.tsx und projects/[id].tsx hatten
  das Prop bereits. Keine Logik-/Formatänderungen; Android ignoriert das Prop (DONE)
- Rapport-PDF Überarbeitung: (1) Alle Schriftgrößen in REPORT_CSS + Inline-Styles ~1-3px
  reduziert (Titel 18→15, Tabellen 11→10, th 9, Sektionen 13→11, Brutto 18→15 usw.),
  Paddings gestrafft, Info-Box-Titel uppercase. Gilt für Direkt-PDF UND eingebettete
  Rapporte im Projekt-PDF (gemeinsames REPORT_CSS). (2) Direkt-Rapport-PDF: echte
  Seitenränder via printToFileAsync margins-Option 36pt (~12,7mm) – iOS/macOS ignoriert
  CSS @page! @page 14mm bleibt für Android. (3) Projekt-PDF: Print-Padding von
  .page/.new-page von 0mm 5mm auf 4mm 12mm erhöht (DONE, HTML-Vorschau geprüft;
  echte PDF-Ausgabe braucht neuen Build)
- Expo SDK 54 → 57 Upgrade (DONE): expo@57.0.19, react-native@0.86.3, react@19.2.3,
  expo-router@57.0.18, typescript 6.0.3. Vorgehen: yarn expo install expo@^57 +
  yarn expo install --fix + expo-doctor (21/21 checks pass). Breaking Changes behoben:
  (1) @react-navigation/native-Importe (useFocusEffect in 4 Dateien) → expo-router;
  @react-navigation/native + bottom-tabs deinstalliert (SDK 56+ verbietet Mischung).
  (2) expo-media-library Root-Import crashte auf Web ("Class extends value undefined")
  → auf expo-media-library/legacy umgestellt ([id].tsx, gleiche alte API).
  (3) expo-file-system/next → Root-Import (documents/new.tsx); /legacy bleibt gültig.
  (4) app.json: top-level "splash" → expo-splash-screen Plugin-Config (Schema-Pflicht).
  (5) package-lock.json entfernt (Yarn ist Package Manager). Zusätzlich Fix: React 19.2
  "Unexpected text node" auf Skizzen-Screen ({notes.trim() && ...} → .length > 0).
  Testing-Agent Regression: 8/8 Szenarien PASS (iteration_22.json).
- Druckqualität Bilder verbessert (DONE): Projektfotos (photos/new.tsx) von 1200px/q0.8
  auf 1800px/q0.85 (~270 dpi im A4-Druck), Picker-Qualität 0.9; Kamera-Pfad nutzt jetzt
  IMMER ImageManipulator-Resize (vorher Full-Res-Base64 direkt vom Picker = OOM-Risiko).
  Skizzen-Hintergrund-/eingefügte Bilder (draw.tsx): q0.7→0.85, Kamera-Pfade 1200→1600px.
  Rapport-Fotos (reports/edit.tsx): vorher unskaliertes q0.6-Base64 → jetzt 1600px/q0.85
  via ImageManipulator. Skizzen selbst sind SVG (Vektor) = verlustfrei scharf.
  Gilt nur für NEU aufgenommene/importierte Bilder.
- Fix Checklisten-Unterpunkte gehen verloren (SDK 57 Regression, DONE): Der
  useFocusEffect-Cleanup (Auto-Save beim Verlassen) feuert unter expo-router 57 nicht
  mehr zuverlässig. Fix in checklists/[id].tsx: entprelltes Auto-Save (600ms) bei JEDER
  Änderung via useEffect auf [checklist, hasChanges] + Unmount-Fallback über Ref.
  Verifiziert per Playwright: Checkbox/Unterpunkt werden nach 600ms in AsyncStorage
  persistiert und überleben Neuladen (iteration_23.json enthält RCA).
- Fix Skizzen zeichnen nicht sichtbar auf Gerät (SDK 57 Regression, WORKAROUND): User
  berichtet in Expo Go (iPad): Zeichnen erzeugt nichts Sichtbares, Elemente erscheinen
  erst nach Neuöffnen der Skizze, dann nicht editierbar. Diagnose: bekannter
  react-native-svg 15.15.x Fabric-Bug – SVG-Canvas invalidiert nicht bei Prop-Updates
  (nur bei Mount-Mutationen; GitHub issues #2937/#2671). Workaround: unsichtbares
  Element mit neuem Key pro Render ("fabricTick") am Ende jedes dynamischen SVG-Canvas
  → erzwingt native Mount-Mutation → Neuzeichnen. Eingebaut in: sketches/draw.tsx
  (Haupt-Canvas + Lupe + Winkelmesser), calculator/new.tsx, photos/annotate.tsx,
  imagemeter/measure.tsx, documents/view.tsx (Anmerkungs-Overlay), projects/[id].tsx
  (Preview-Svg), src/components/SignaturePad.tsx. Web weiterhin OK (Smoke-Test).
  WICHTIG: Fix konnte nur auf Web verifiziert werden – USER MUSS in Expo Go auf dem
  iPad nachtesten. Falls weiterhin kaputt: Fallback = key-Remount des ganzen <Svg>.
- Skizzen-Fix Eskalation Stufe 2 (User: Tick-Workaround half NICHT in Expo Go):
  Jetzt kompletter Svg-Remount pro Render via key (native: `canvas-${tick++}`, Web:
  statischer key) auf ALLEN dynamischen Canvases: draw.tsx Haupt-Canvas + Lupe +
  Winkelmesser, calculator/new.tsx, photos/annotate.tsx, imagemeter/measure.tsx,
  documents/view.tsx, SignaturePad.tsx. Zusätzlich removeClippedSubviews={false} auf
  der Canvas-ScrollView (RN 0.86 iOS View-Culling-Verdacht). Begründung: Initial-Mounts
  rendern nachweislich (Elemente erscheinen nach Neuöffnen) → voller Remount = wie
  Initial-Mount → muss rendern. Web-Smoke-Test OK (Pen+Rect, 0 Fehler).
  USER MUSS in Expo Go neu testen (App in Expo Go komplett schließen + QR neu scannen).
  FALLS IMMER NOCH KAPUTT: Nächste Eskalation = RN-Feature-Flag/newArchEnabled:false
  geht in Expo Go NICHT; dann prüfen ob expo-doctor-gepinnte react-native-svg wirklich
  zur Expo-Go-Native-Version passt, oder Canvas testweise ohne ScrollView rendern.
- STATUS nach Stufe-2-Fix (User-Feedback 04.09.): ZEICHNEN FUNKTIONIERT WIEDER in Expo Go.
  3 OFFENE FOLGEPROBLEME (nächste Priorität, User-Screenshots vorhanden):
  (1) FOTOS IN SKIZZE flackern/verschwinden kurz beim Zeichnen einer Linie, teils gar
      nicht angezeigt. URSACHE: mein Svg-key-Remount pro Render lädt die <SvgImage>
      (file:// Hintergrund-/eingefügte Fotos) bei jedem Strichpunkt neu. FIX-IDEE:
      Bilder aus dem remountenden Svg herauslösen (eigenes, NICHT remountendes Svg/
      RN-Image-Layer hinter dem Zeichen-Svg) ODER key nur ändern wenn elements sich
      ändern und Live-Preview (currentPath/temp) in separates kleines Overlay-Svg
      auslagern (Layer-Split: statische Ebene + Live-Ebene).
  (2) WINKELMESSER: Live-Vorschau (Linien ziehen) unsichtbar, Winkel erscheint erst
      nach 'Hinzufügen'; danach schlecht anpassbar. URSACHE: Protractor-Drag nutzt
      vermutlich Animated/Refs OHNE React-Re-Render → key-Remount feuert nicht.
      FIX-IDEE: bei Protractor-Drag-Move einen State-Tick setzen (throttled), damit
      Re-Render + Remount passiert; draw.tsx Zeilen ~10150ff (prot-Svg hat schon key).
  (3) CHECKLISTEN: Unterpositionen 'funktionieren nicht richtig' + SCREENSHOT zeigt:
      Checklisten-VORLAGEN-Punkte werden LEER angezeigt (Bullets ohne Text, sowohl in
      Vorlagen-Übersicht als auch in 'Neue Checkliste' aus Vorlage 'Test' mit Test1-3).
      VERDACHT: Datenform-Mismatch items: string[] vs {text,checked,subItems}[] in
      templates.tsx/new.tsx Render (Text-Feld liest item.text bei String-Items?) –
      NICHT der Autosave (der wurde gefixt+verifiziert). Prüfen: templates.tsx
      Erstellung (Punkte als Strings?) vs. Anzeige-Komponenten.
- FIX (verifiziert): Leere Checklisten-/Vorlagen-Punkte – ROOT CAUSE gefunden: die
  Bild-Auslagerungs-Walker in LocalStorage.ts (chkExtractItems + chkRestoreImages.walk)
  machten {...it} auch auf STRING-Items (Vorlagen-Punkte sind Strings!) → Zeichen-Map
  {0:'T',1:'e',...} ohne text → leere Bullets, und daraus erstellte Checklisten hatten
  text:undefined. Fix: Walker lassen Nicht-Objekte unverändert; zusätzlich chkRepairItem/
  chkRepairItems repariert bereits korrupte Zeichen-Map-Items beim Lesen (in
  chkRestoreImages + ChecklistTemplateService.getAll). Per Playwright mit absichtlich
  korruptem Template verifiziert (Test1/2/3 wieder sichtbar). HINWEIS: Checklisten, die
  der User aus dem korrupten Template erstellt hat, haben text:undefined dauerhaft
  verloren – User muss diese eine Checkliste neu aus der (reparierten) Vorlage anlegen.
- FIX (implementiert, Gerätetest ausstehend): Foto-Flackern beim Zeichnen – Layer-Split
  in draw.tsx: Hintergrundbild + type==='image'-Elemente in eigenem statischen Svg
  (absolute, pointerEvents none, VOR dem Haupt-Svg = darunter), key nur aus Bild-Daten
  (id/x/y/w/h/rotation/selektiert) → remountet nur bei Bild-Änderungen, nicht bei jedem
  Strich. Haupt-Svg rendert elements.filter(!=='image'). Z-Order-Änderung: Bilder liegen
  jetzt immer UNTER Zeichnungen (vorher gemischt in elements-Reihenfolge).
- OFFEN (nächste Priorität): WINKELMESSER auf iPad – Live-Overlay (Mittelpunkt/
  Referenzlinie/Winkellinie) unsichtbar bis 'Hinzufügen'; danach schwer anpassbar.
  Screenshot zeigt: Panel (45°, +/-Buttons) rendert, aber Vollbild-Svg-Grafik nicht.
  Overlay: draw.tsx ~10190 (showProtractor && View protractorOverlay > Svg key=prot-tick).
  Verdacht: zIndex/Layering des protractorOverlay auf Fabric oder Initialisierung via
  useEffect (protractorInitializedRef, Zeile ~742). Debug-Idee: zIndex/elevation am
  Overlay prüfen, Hintergrundfarbe testweise setzen, oder Protractor-Grafik ins
  Haupt-Canvas-Svg verlagern.
- FIX Runde 3 (04.09., Gerätetest ausstehend): (1) FOTOS UNSICHTBAR im Editor (aber in
  Vorschau sichtbar): ROOT CAUSE = styles.svg hat backgroundColor '#fff' → das Haupt-Svg
  übermalte die neue darunterliegende Bild-Ebene mit Weiß. Fix: Haupt-Svg + Bild-Ebene
  backgroundColor 'transparent' (Weiß kommt vom canvasContainer). (2) WINKELMESSER
  nativ unsichtbar (Web ok): Protraktor-Svg umgebaut wie Haupt-Canvas – pointerEvents
  von Svg-Prop auf Wrapper-View verlagert, viewBox entfernt, bg transparent (Verdacht:
  pointerEvents-Prop direkt auf Svg bricht Fabric-Rendering). Web-Regression getestet:
  Zeichnen, Protraktor-Anzeige + Drag funktionieren. Checklisten laut User WIEDER OK.
  FALLS Winkelmesser auf iPad weiterhin unsichtbar: Grafik testweise ins Haupt-Canvas-Svg
  verlagern (das rendert nachweislich auf Gerät).
- FIX Runde 4 (Winkelmesser, Gerätetest ausstehend): User bestätigt FOTOS OK,
  CHECKLISTEN OK. Winkelmesser-Live-Grafik weiterhin nativ unsichtbar → jetzt wird die
  Grafik (Ref-/Winkellinie, 3 Griffe, Gradzahl) auf NATIVE zusätzlich DIREKT im
  Haupt-Canvas-Svg gerendert (das nachweislich auf dem iPad zeichnet), mit derselben
  screenToCanvas-Umrechnung wie addProtractorToSketch (Zoom/Layout/androidViewBox).
  Touch-Steuerung bleibt auf dem Overlay (Handler unverändert). Web nutzt weiter nur
  das Overlay (getestet, ok). Falls Griffe-Positionen auf iPad versetzt wirken:
  screenToCanvas-Zweige prüfen (canvasLayout via measureInWindow enthält Scroll).
- FIX Runde 5 (Winkelmesser-Drag, Gerätetest ausstehend): User bestätigt Winkel WIRD
  jetzt angezeigt, aber Drag/Anpassen vor 'Hinzufügen' ging nativ nicht (PanResponder
  auf transparentem absoluteFill-View feuert auf Fabric nicht). Fix am Drag-View
  (draw.tsx ~10214): collapsable={false} + backgroundColor transparent (gegen View-
  Flattening) + onTouchStart/Move/End jetzt auch NATIV aktiv (zusätzlich zu
  panHandlers; Handler sind idempotent). Web-Drag regressionsgetestet OK.
  Falls immer noch kein Drag auf iPad: PanResponder entfernen und NUR onTouch* nutzen,
  oder Drag-Handling in den Haupt-Canvas-Responder integrieren (drawMode-Weiche).

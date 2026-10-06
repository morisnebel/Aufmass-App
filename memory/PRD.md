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
- FIX Runde 6 (Winkelmesser-Drag NATIV, Gerätetest ausstehend): Overlay-Touches kamen
  auf Fabric weiterhin nicht an (auch mit collapsable=false + onTouch*). Finale Lösung:
  Drag-Handling in den HAUPT-CANVAS-Responder integriert – onTouchStart/Move/End
  (draw.tsx ~3310/3678/3760) delegieren bei showProtractor && !web an
  handleProtractorDragStart/Move/End und returnen. Overlay-Drag-View auf native
  pointerEvents='none' (Touches fallen zum Canvas durch), Web behält Overlay-Handler
  (onMouse*/onTouch* web-only). protractorPanResponder ist jetzt unbenutzt (nur Warnung).
  Web regressionsgetestet: Anzeige + Mittelpunkt-Drag OK. Hinweis: solange Winkelmesser
  offen ist, ist Zeichnen auf dem Canvas nativ deaktiviert (Touches gehen an Protraktor).
- USER BESTÄTIGT (04.09.): WINKELMESSER FUNKTIONIERT KOMPLETT (Anzeige + Drag). Skizzen,
  Fotos, Checklisten OK. => Alle SDK-57-Zeichen-Regressionen gelöst.
- 4 NEUE OFFENE PUNKTE (User-Screenshots, nächste Session SOFORT angehen):
  (1) P0 Skizzen-Seite lässt sich nach RECHTS wegschieben (iOS Swipe-Back-Geste!) –
      Gefahr von Datenverlust wenn ungespeichert. FIX: in sketches/draw.tsx bzw.
      app/_layout.tsx für den Screen Stack.Screen options gestureEnabled:false
      (expo-router: <Stack.Screen options={{ gestureEnabled: false }} /> im Screen).
  (2) P1 Fehlermeldung 'Error loading/checking expert code: TypeError: Cannot read
      property reload of undefined' auf Home + Settings: kommt vom Expertenmodus-Code,
      der expo-updates (Updates.reload) nutzt – in Expo Go undefined. FIX: grep nach
      "expert" / "Updates.reload" (vermutl. src/ oder app/settings) – Updates-Import
      absichern (try/catch + optional chaining, reload nur wenn verfügbar, sonst
      Hinweis 'App neu starten'). Behebt auch Punkt (4).
  (3) P1 Kontakte laden nicht: 'Method getContactsAsync imported from expo-contacts is
      deprecated' – SDK 57 hat die alte API entfernt. FIX: alle expo-contacts Aufrufe
      (grep getContactsAsync, app/customers/*) via integration_expert/Doku auf die
      NEUE expo-contacts API migrieren (Contacts.getContactsAsync ersetzt durch neue
      Methode gem. SDK-57-Docs, ggf. import aus 'expo-contacts' neue Funktionsnamen).
  (4) P1 Expertenmodus-Freischaltung (Code PROFI2024) schlägt fehl – GLEICHE Ursache
      wie (2) (Updates.reload undefined in Expo Go). Nach Fix (2) erneut testen.
- DANACH: Version 1.1.5 (Build 47) für TestFlight vorbereiten + Voll-Regression.

## Session 05.09. - 4 offene Punkte behoben
- (1) FIXED Swipe-Back-Datenverlust in Skizzen: usePreventRemove (import aus
  'expo-router/react-navigation') in sketches/draw.tsx (~Z.1790). Geste bleibt ERLAUBT
  (User-Wunsch), aber bei Inhalt (elements>0 || backgroundImage) kommt Alert
  "Skizze verlassen?" mit Abbrechen/Verwerfen/Speichern. allowLeaveRef.current=true
  wird vor jedem programmatischen router.back() gesetzt (handleBackPress + saveSketch),
  Callback lässt diese Navigation via navigation.dispatch(data.action) durch.
  Web-Fallback: window.confirm (Alert.alert ist no-op im Web).
- (2)+(4) FIXED Expertenmodus + Fehlermeldung auf Screenshot: Ursache war der dynamische
  `await import('@react-native-async-storage/async-storage')` in settings/index.tsx
  (loadExpertCode/handleExpertCodeSubmit/handleResetCode) -> warf nativ
  "TypeError: Cannot read property 'reload' of undefined" (LogBox-Error auf dem
  User-Screenshot). Ersetzt durch statischen AsyncStorage-Import. Zusätzlich: Expert-
  und Reset-Modal in echte <Modal>-Komponenten mit KeyboardAvoidingView gewandelt,
  Inline-Fehlertext statt nur Alert, Code wird getrimmt, onSubmitEditing am Input.
  Web-verifiziert: falscher Code -> Inline-Fehler, PROFI2024 -> "Pro aktiv".
- (3) FIXED iPad-Kontakte: expo-contacts >=56.0.6 hat Legacy-API (getContactsAsync,
  requestPermissionsAsync, addContactAsync...) nach 'expo-contacts/legacy' verschoben;
  Root-Import WIRFT zur Laufzeit (Deprecation-Throw). Imports in app/customers/[id].tsx
  und app/customers/new.tsx auf 'expo-contacts/legacy' umgestellt. (Später optional:
  Migration auf neue OO-API Contact.getAll()).
- Hinweis: app/calculator/new.tsx nutzt noch einen dynamischen import() (Z.~3242) -
  falls dort nativ Fehler auftauchen, ebenfalls auf statischen Import umstellen.
- Nativ-Verifikation (iPad) durch User ausstehend: Swipe-Prompt, Kontakte, Expertenmodus.

## Session 05.09. Teil 2 - Auto-Save + Projekt-Status-Pipeline
- FEATURE Auto-Speichern (sketches/draw.tsx): setInterval alle 120s ruft performAutoSaveRef
  (latest-ref pattern). Speichert nur bestehende Skizzen (sketchId && lastLoadedSketchId match),
  nur bei Änderungen (elements-Referenzvergleich + backgroundImageChangedRef). Speichert
  sketch_meta_ + Bild-Extraktion + SketchService.update (ohne Preview/sketch_data = leichtgewichtig).
  Grüne Pill "Automatisch gespeichert · HH:MM" (styles.autoSaveNotice) 3s eingeblendet.
- FEATURE Status-Pipeline: NEU src/constants/projectStatus.ts (PROJECT_STATUSES: anfrage lila,
  angebot orange, ausfuehrung grün, fertig blau, abgebrochen rot, archiviert grau;
  normalizeStatus mappt legacy aktiv->ausfuehrung, abgeschlossen->fertig; getStatusMeta/-Order).
  - app/index.tsx: Filter-Tabs horizontal scrollbar (Alle + 6 Status), 'Alle' blendet
    archiviert aus; Karten-Pill mit Farbe+Label; Pill-Tap -> Alert-Chooser mit 6 Status;
    Bulk-Auswahl: EIN "Status"-Button öffnet Chooser (ersetzt 3 Einzelbuttons); Sortierung
    nach Pipeline-Reihenfolge; gespeicherter Filter validiert gegen neue Keys.
  - projects/new.tsx: Default-Status 'anfrage'.
  - projects/[id].tsx: Status-Badge via getStatusMeta; Edit-Modal mit 6 Wrap-Buttons
    (statusButtonsCompact flexWrap); setEditProjectStatus(normalizeStatus(...)); PDF-HTML-Label via Meta.
- GETESTET: testing_agent iteration_24.json: 10/12 PASS, retest_needed=false.
  Bekannte WEB-ONLY Einschränkung (nativ ok): Alert.alert Multi-Button-Chooser (Pill-Tap auf
  Home + Bulk-Status) ist auf react-native-web no-op (window.alert 1 Button). Nativ iOS/iPad
  funktioniert. Statuswechsel via Edit-Modal geht überall. Optionaler späterer Fix: Modal-Chooser für Web.
- Bekannte Console-Warnung (low): "Unexpected text node: ." irgendwo <View>-Kind auf allen Routen.
- User baut als nächstes TestFlight-Build; nativ zu verifizieren: Auto-Save-Pill, Swipe-Prompt, Kontakte.

## Session 05.09. Teil 3 - Verlassen-Schutz überall + PDF-Crash-Fix
- NEU src/hooks/useUnsavedChangesGuard.ts: wiederverwendbarer Hook (usePreventRemove aus
  'expo-router/react-navigation'). API: useUnsavedChangesGuard(hasUnsavedChanges, onSaveAndLeave?, {autoSave?})
  -> gibt { allowLeave() } zurück (vor programmatischem router.back() aufrufen!).
  Prompt: Abbrechen/Verwerfen/Speichern (Web: window.confirm). autoSave-Modus = still speichern.
- Guard eingebaut in:
  - projects/new.tsx (Felder-Dirty-Check; onSave=handleBackWithSave; allowLeave im else + vor Erfolgs-Alert)
  - reports/edit.tsx (JSON-Fingerprint aller Formularfelder + savedSnapshotRef nach Laden/Speichern;
    onSave=handleSave(false); allowLeave vor router.back)
  - customers/new.tsx (Felder-Dirty; allowLeave in handleNavigateBack)
  - customers/[id].tsx (Fingerprint; allowLeave in den 4 Erfolgs-Alert-OK-Buttons)
  - calculator/new.tsx (autoSave-Modus, onSave=handleBackWithSave - wie Zurück-Button, still)
  - checklists/edit-template.tsx (Fingerprint [templateName, items, templateLogo]; allowLeave vor Erfolgs-Alerts)
  - projects/[id].tsx (Notizen/remarks-Dirty; onSave speichert remarks + back). ZUSÄTZLICH:
    handleTabChange sichert ungespeicherte remarks still beim Tab-Wechsel (Header-"Projektdetails"-Pfeil
    ist nur Tab-Wechsel, kein Route-Pop!); handleTabChangeRef gegen stale closure im setOptions-Header.
- checklists/[id].tsx braucht KEINEN Guard (speichert bereits still bei Blur/Unfocus via useFocusEffect-Cleanup).
- projects/new.tsx: Kontakt-Import ebenfalls auf 'expo-contacts/legacy' umgestellt (war beim 1. Fix übersehen!).
- Project-Interface in LocalStorage.ts: remarks?: string ergänzt.
- PDF-CRASH-FIX (User-Screenshot "split of undefined"): In generatePdfHtml (projects/[id].tsx ~1619)
  gab der Checklisten-Map bei 0 abgehakten Positionen einen STRING statt {categoriesHtml,...} zurück
  -> item.categoriesHtml.split() crashte bei Auto-Regenerate/Preview. Jetzt Objekt-Struktur + typeof-Guard.
- GETESTET: iteration_25.json - PDF-Fix PASS, Guards customers/new + customers/[id] + Notizen PASS.
  Bekannt: Browser-Back im Web triggert Guard nicht zuverlässig (Web-Limitation, nativ = Ziel-Plattform).
- Nativ zu verifizieren (User/Build): Swipe-Back-Prompt auf allen Formular-Seiten.

## Session 05.09. Teil 4 - Flächenrechner Touch-Fix (SDK 57 Regression)
- BUG (User, iPad/Pencil): Flächen im Flächenrechner nicht mehr zeichenbar, Punkte nicht verschiebbar.
- URSACHE: calculator/new.tsx Canvas-View nutzte noch rohe onTouchStart/onTouchMove/onTouchEnd Props -
  dieselbe SDK-57-Regression, die schon den Skizzen-Canvas (draw.tsx) betraf. Der Svg-Remount-Hack
  (key=calc-${fabricTick++}) war schon da, aber die Touch-Handler wurden beim damaligen Fix übersehen.
- FIX: Canvas-View auf Responder-System umgestellt (onStartShouldSetResponder/onMoveShouldSetResponder
  => true, onResponderTerminationRequest => false, onResponderGrant/Move/Release = alte Handler-Bodies).
  Pinch-Zoom (2-Finger, touches.length===2 in Move) funktioniert im Responder-System weiter.
- VERIFIZIERT (Web-Screenshots): Punkte setzen, Polygon schließen (Fläche benennen Modal), Auswahl-Modus,
  Eckpunkt ziehen -> Fläche 0.63->1.06 m² neu berechnet. Nativ (Pencil) vom User zu bestätigen.
- MERKE: Falls weitere Screens rohe onTouch*-Props auf Views mit SVG-Kindern haben -> gleiches Muster anwenden.

## Session 05.09. Teil 5 - PDF-Branding im Rapport-PDF
- User-Wunsch: Firmenlogo + Farben aus den Einstellungen auch im Rapport-PDF (Projekt-PDF hatte beides schon).
- Logo + Firmendaten waren im Rapport-PDF bereits integriert (generateReportHtml lädt logo_data etc.).
- NEU: Akzentfarben. ReportPdfService.ts:
  - export PDF_ACCENT_COLORS (identisch zu PDF_COLOR_OPTIONS in settings/index.tsx: blue/light_blue/gray/
    light_gray/green/light_green/orange/red/black mit color+textColor)
  - export getReportAccentCss(settings) -> ":root { --report-accent; --report-accent-text; --report-accent-light }"
    (nutzt pdf_header_section_color || pdf_header_color || 'blue'; light = accent+"1f" 12% alpha)
  - REPORT_CSS: alle hardcodierten #1976d2/#e3f2fd/#e0f2fe durch var(--report-accent[-text|-light]) ersetzt
    (Header-Linie, Titel, Info-Boxen, Section-Titles, Tabellen-Header, Total-Row, Role-Summary) + Inline-Farbe Z.167.
  - generateReportHtml injiziert accentCss nach REPORT_CSS im <style>.
- projects/[id].tsx appendReportsToHtml: injiziert ebenfalls getReportAccentCss(s) (Rapporte im Projekt-PDF).
- tsc + eslint sauber, Bundle lädt. PDF-Farbwahl in Einstellungen -> PDF-Layout (Kopfbereich-Farbe) steuert jetzt beide PDFs.

## Session 05.09. Teil 6 - Foto-Fehler-Fix, Projekt duplizieren, Rapport-Farbvorschau
- FIX "Error loading project photos ... reload of undefined" (User-Screenshot, Flächenrechner-Fotoauswahl):
  dynamischer await import('@/services/LocalStorage') in calculator/new.tsx (Z.~3250) -> statischer
  PhotoService-Import (gleiche Ursache wie Expertenmodus-Fehler in Teil 1). Keine dyn. Imports mehr in app/.
- FEATURE Projekt duplizieren (app/index.tsx): copy-outline-Icon (testID duplicate-project-<id>) im
  Karten-Footer neben Datum (in selectionMode ausgeblendet). confirmDuplicateProject (web: window.confirm/alert,
  nativ: Alert). duplicateProject: ProjectService.create({...rest ohne id/created/updated, project_number:
  getNextAvailableProjectNumber(), name+" (Kopie)", status:'anfrage'}) + alle Checklisten kopiert via
  ChecklistService.getByProjectId (Bilder werden resolved) -> create mit resetItems (checked:false, note:'',
  printImage/previewImages entfernt, subItems rekursiv; categoryLogo/templateLogo bleiben).
- FEATURE Rapport-PDF Live-Vorschau (settings/index.tsx, PDF-Layout > Kopfbereich-Tab, unter Stil):
  Mini-Mock (Header-Linie, Titel, Info-Box, Tabellenkopf, Gesamt-Zeile) mit gewählter PDF_COLOR_OPTIONS-Farbe,
  aktualisiert live beim Farbwechsel (Screenshots blau/grün verifiziert). Styles rapportPreview* vor modalOverlay.
- GETESTET: iteration_26.json ALL PASS (Duplizieren e2e inkl. Checklisten-Reset, Original intakt, Regression ok).
- TESTER-TIPP: Disclaimer-Bypass via aufmassprofi_settings disclaimer_version '2026-06'.

## Session 05.09. Teil 7 - Dashboard Übersicht (Home)
- NEU app/index.tsx: Dashboard-Karte über den Filter-Tabs (nur wenn Projekte existieren):
  - Horizontale Chips je Status (PROJECT_STATUSES, nur count>0, Farbe+Anzahl+Label,
    testID dashboard-chip-<key>); Tap = handleFilterChange(key) bzw. Toggle zurück auf 'all'.
  - Zeile "X offene Aufgaben in Y Projekten": in loadData via ChecklistService.getAll()
    (leichtgewichtig, Bild-Marker werden NICHT aufgelöst) rekursiv unchecked Items gezählt
    (inkl. subItems), nur für Projekte deren Status nicht archiviert/fertig/abgebrochen ist.
  - State openTasks {items, projects}; Styles dashboard* vor filterTab.
- Hinweis User: Backup-Erinnerung, globale Suche (app/search.tsx) und Foto-Kommentare existieren bereits.
- VERIFIZIERT per Screenshot mit geseedeten Daten (4 Projekte, 2 Checklisten): Chips 1/1/1/1,
  "4 offene Aufgaben in 2 Projekten" korrekt (3 unchecked inkl. Sub-Item + 1).
- Seed-Trick für Tests: localStorage aufmassprofi_settings {disclaimer_version:'2026-06',
  disclaimer_accepted_at}, aufmassprofi_projects/_customers/_checklists direkt setzen + location.assign('/').

## Session 05.09. Teil 8 - Build-Vorbereitung App Store
- app.json: version 1.1.4 -> 1.1.11, ios.buildNumber "46" -> "121" (letzter Store-Build war 1.1.10 (120)),
  android.versionCode 121 ergänzt. Bundle-ID com.aufmassprofi.dach unverändert.
- Info: Build-Nummern werden bei Apple PRO App (Bundle-ID) gezählt - "Menutotal" ist eine andere App
  und beeinflusst die Aufmassprofi-Nummerierung nicht.

## Session 05.09. Teil 9 - iOS-Signing-Fehler (Zertifikat INVALID)
- User meldet Build-Fail beim Xcode-Signing: iPhone Distribution Certificate INVALID.
- Kein Code-/Config-Problem: app.json bleibt bei 1.1.11 / build 121 / com.aufmassprofi.dach.
- support_agent-Antwort an User weitergegeben: iOS-Credentials im Publish-to-App-Store-Flow
  zurücksetzen/neu authentifizieren; ggf. alte/revoked Zertifikate unter developer.apple.com
  > Certificates aufräumen (Apple-Limit ~2-3 aktive Distribution-Certs); danach neuen Build starten.
  Falls keine Reset-Option in der UI: support@emergent.sh mit Screenshot + Job-ID + Build-Log.

## Session 05.09. Teil 10 - Expo Go öffnet App nicht (Account-Mismatch)
- Fehler auf iPad: "signed in to Expo CLI as 'morisnebel' / Expo Go as 'emergent-em-user-org_...' - accounts need to match".
- URSACHE: app.json enthielt "owner": "morisnebel" + extra.eas.projectId (159413b4-...) vom persönlichen
  Expo-Konto des Users -> Manifest war auf morisnebel gescoped, Expo Go ist mit Emergent-Konto angemeldet.
- FIX: owner + extra.eas.projectId aus app.json entfernt (support_agent: Emergent verwaltet EAS-Builds selbst,
  Felder nicht nötig). Manifest jetzt @anonymous/frontend-... , kein morisnebel mehr -> Expo Go kann öffnen.
- FALLS der Store-Build dadurch je ein Problem meldet: Werte waren owner=morisnebel,
  eas.projectId=159413b4-c5be-4afa-9038-b6ba91a4ea1c (hier dokumentiert zum Wiederherstellen).
- User-Hinweis: Nach Fork sind alte QR-Codes/URLs ungültig -> immer aktuellen Preview-QR scannen,
  alten Eintrag in Expo Go "Recently opened" löschen.

## Session 05.09. Teil 11 - Skizzen: Wisch-Geste komplett deaktiviert
- User-Änderungswunsch (revidiert frühere Wahl "Geste mit Nachfrage"): Skizzen dürfen sich durch
  Wischen GAR NICHT mehr schließen lassen; zurück nur über den Zurückpfeil.
- FIX: app/_layout.tsx Stack.Screen "sketches/draw": gestureEnabled: false + fullScreenGestureEnabled: false.
- usePreventRemove-Guard in draw.tsx bleibt als Sicherheitsnetz bestehen (greift z.B. bei
  programmatischen Removals); Zurückpfeil speichert weiterhin automatisch (handleBackPress).

## Session 05.09. Teil 12 - PDF-Deckblatt (optional) für Projekt-PDF
- NEU projects/[id].tsx:
  - State includeCoverPage (persistiert in AsyncStorage 'aufmassprofi_pdf_cover') + coverPhotoId
    (null=erstes Foto, 'none'=ohne Bild), toggleCoverPage().
  - PDF-Vorschau-Modal: Toggle "Deckblatt mit Titelbild" (testID toggle-cover-page, gleiche Optik wie
    "Berechnungsdetails drucken") + horizontale Titelbild-Auswahl (Thumbnails + "Ohne"-Chip) wenn Fotos existieren.
  - Auto-Regenerate-Effect deps erweitert: [showCalcDetailsPage, includeCoverPage, coverPhotoId].
  - generatePdfHtml: coverPageHtml (vor "Build complete HTML", eingefügt direkt nach <body> vor .page):
    Logo + Firmenadresse oben, zentrierter Titel (AUFMASS-DOKUMENTATION, Projektname, Nr + Status,
    Akzentlinie in headerColor), optional Titelbild (max 155x100mm), unten Kunde/Objektadresse + Datum
    über Akzent-Trennlinie, page-break-after: always.
- Web-Einschränkung: PDF-Options-Alert (Vorschau/Teilen/Speichern) ist auf Web no-op (bekannt, pre-existing)
  -> Deckblatt-Toggle nur nativ testbar. Code nutzt identische Muster wie bestehende PDF-Teile
  (photo.image_data, companyLogo, headerColor). Lint + tsc sauber (nur pre-existing Fehler).
- User soll nativ verifizieren: Projekt-PDF > Vorschau > "Deckblatt mit Titelbild" + Bildauswahl.

## Session Juni 2026 - Deckblatt-Verifikation (Fork)
- Deckblatt-HTML 1:1 mit Beispieldaten gerendert und per Screenshot verifiziert: Layout korrekt
  (Logo oben links, Firmendaten rechts, zentrierter Titel mit Akzentlinie, Titelbild, Kunde/Datum-Fusszeile).
- Lint auf projects/[id].tsx: keine Fehler. App-Smoke-Test: lädt korrekt.
- Status: Deckblatt-Feature VERIFIZIERT (Layout). Native PDF-Erzeugung (expo-print) kann der User auf dem Gerät prüfen.

## Session Juni 2026 Teil 2 - Deckblatt A4-Fix, Untertitel, Vorlagen + Refactoring Schritt 1
- A4-Fix Deckblatt: Ursache gefunden - expo-print nutzte Standardgröße US Letter (612x792),
  dadurch passte das 255mm-Deckblatt nicht und die Fußzeile rutschte auf Seite 2.
  Fix: Alle Print.printToFileAsync/printAsync-Aufrufe in projects/[id].tsx haben jetzt explizit width:595, height:842 (A4).
- Neues Modul /app/frontend/services/CoverPageTemplates.ts:
  - 3 Deckblatt-Vorlagen: classic (zentriert), modern (Farbband), minimal (dezent)
  - Feste Seitenhöhe 255mm + overflow:hidden => garantiert 1 Seite; Logo hart begrenzt (17mm Wrapper),
    Titelbild in fixem Container (90-100mm); Fußzeile absolut am Seitenende; Tabellen statt Flexbox (druckrobust).
  - buildCoverPageHtml(opts) wird in projects/[id].tsx aufgerufen (ersetzt Inline-HTML).
- Untertitel-Freitext: TextInput im PDF-Modal (testID cover-subtitle-input), pro Projekt persistiert
  (aufmassprofi_pdf_cover_subtitle_<id>). Stil-Auswahl 3 Chips (testID cover-style-classic/modern/minimal),
  global persistiert (aufmassprofi_pdf_cover_style). PDF-Preview-Regenerierung jetzt debounced (500ms).
- Refactoring Schritt 1: StyleSheet-Blöcke ausgelagert (~4470 Zeilen):
  - app/projects/[id].tsx (10509->8571) -> src/styles/projectDetailStyles.ts
  - app/sketches/draw.tsx (12356->10723) -> src/styles/sketchDrawStyles.ts
  - app/calculator/new.tsx (10326->9422) -> src/styles/calculatorStyles.ts
  - Alle 3 Screens per Screenshot verifiziert (rendern korrekt).
- Alle 3 Deckblatt-Vorlagen statisch mit A4-Maßen gerendert und visuell geprüft: passen auf 1 Seite.
- Offen: User-Verifikation nativ (PDF mit Deckblatt auf iPad erzeugen).

## Session Juni 2026 Teil 3 - Refactoring PDF + Modal, Deckblatt-Kontakt, Vorlagen-Vorschau
- Refactoring Schritt 2:
  - generatePdfHtml (~3160 Zeilen) ausgelagert nach services/ProjectPdfService.ts
    (export generateProjectPdfHtml(ctx)). [id].tsx behaelt duennen Wrapper. 8571 -> 5219 Zeilen.
    WICHTIG: require-Pfad des App-Icons im Service angepasst (../assets statt ../../assets).
    settings als any gecastet (Settings-Typ kennt company-Felder nicht - vorbestehend).
  - PDF-Vorschau-Modal ausgelagert nach src/components/project/PdfPreviewModal.tsx
    (Props-basiert; Print/Sharing-Logik in der Komponente; nutzt styles aus projectDetailStyles).
  - WebView-Import aus [id].tsx entfernt (nur noch im Modal gebraucht).
- Deckblatt-Kontakt: companyPhone/companyEmail in CoverPageOptions; classic (Firmenblock oben rechts),
  modern (ERSTELLT-VON-Box), minimal (Fusszeile rechts). Statisch verifiziert.
- Vorlagen-Vorschau: StyleThumb-Minikomponente (schematische Mini-Seiten) in den 3 Auswahl-Chips.
  E2E auf Web verifiziert (Auswahlwechsel funktioniert).
- Runtime-Test: generateProjectPdfHtml im Web-Bundle mit Dummy-Daten ausgefuehrt ->
  OK len=53211, Cover+Body enthalten. Temporaere Dev-Routen (dev-thumbs, dev-pdftest) wieder geloescht.
- Web-Test-Tipp: Disclaimer laesst sich per localStorage aufmassprofi_settings
  (disclaimer_accepted_at + disclaimer_version='2026-06') ueberspringen.

## Session Juni 2026 Teil 4 - Seitenzahlen, Deckblatt-Akzentfarbe, draw.tsx-Refactoring
- PDF-Seitenzahlen: Neues Modul services/PdfExport.ts mit createPdfFile(html, opts):
  printToFileAsync (A4, base64) -> pdf-lib stempelt "Seite X von Y" (8pt, grau, zentriert, y=14)
  auf jede Seite -> neue Datei in cacheDirectory. Fallback auf Original-PDF bei Fehler.
  WICHTIG: pdf-lib MUSS ueber require('pdf-lib/cjs') geladen werden - der ES-Build bricht in
  Metro/Web mit "Cannot destructure __extends of tslib.default". pdf-lib ^1.17.1 installiert.
  Alle PDF-Pfade umgestellt: projects/[id].tsx (4x + 2 printAsync-Fallbacks nutzen jetzt { uri }),
  PdfPreviewModal (Print-Button), calculator/new.tsx, documents/view.tsx,
  ReportPdfService.ts (mit nativen margins 36pt). pdf-lib-Logik in Node verifiziert.
- Deckblatt-Akzentfarbe im PDF-Modal: PDF_COLOR_OPTIONS jetzt modulweit exportiert aus
  ProjectPdfService. Neuer ctx-Param coverAccent (null = Einstellungs-Farbe). UI: "Farbe:"-Zeile
  mit Auto-Chip + 6 Farbpunkten (blue/green/orange/red/gray/black, testID cover-accent-*),
  persistiert global in aufmassprofi_pdf_cover_accent ('auto' = null). E2E auf Web verifiziert.
- draw.tsx-Refactoring: 10722 -> 9718 Zeilen:
  - src/sketch/sketchShared.ts: deepCloneElement, simplifyPath (+Douglas-Peucker), DrawElement,
    DrawMode, FontFamily, FONT_FAMILIES, TOOL_SIZES_KEY.
  - src/sketch/sketchSvg.ts: buildPreviewSvg(ctx) (~475 Zeilen SVG-Serialisierung); draw.tsx hat
    duennen Wrapper generatePreviewSvg.
  - Toter Code geloescht (~280 Zeilen): DraggableTotalBox, Mess-Numpad-Funktionen, bringToFront/
    sendToBack, startCropMode, pickBackgroundImage/takeBackgroundPhoto/importImageFromFiles u.a.
  - STOLPERFALLE behoben: Skript loeschte versehentlich canvasOverhead mit (klammerlose Einzeiler);
    wiederhergestellt, draw-Route verifiziert OK.
- Vorbestehend/ungeloest (Web-only): calculator/new auf Web wirft "svg height -200" Konsolen-Fehler.

## Session Juni 2026 Teil 5 - Deckblatt-Ueberlauf im Druck endgueltig behoben
- ROOT CAUSE: Feste mm-Hoehen (height: 255mm) + absolute Fusszeile sind im iOS-Druck unzuverlaessig
  (mm/pt/px-Interpretation variiert) -> Fusszeile lief erneut minimal auf Seite 2 ueber.
- FIX: CoverPageTemplates auf fliessendes Layout umgestellt: KEINE feste Seitenhoehe mehr,
  Fusszeile im Fluss (margin-top 8-12mm, page-break-inside: avoid), Titelbild max 70-72mm,
  kompaktere Abstaende. Seite endet per page-break-after: always.
- Empirisch verifiziert (Worst-Case 1px=1pt, Inhaltsbreite 482px, Budget ~728px):
  classic 650px, modern 671px, minimal 621px -> alle sicher einseitig in JEDER Interpretation.
- MERKE fuer künftige PDF-Layouts: niemals feste mm-Seitenhoehen/absolute Bottom-Footer verwenden;
  Inhalte kompakt halten und Hoehe empirisch bei 482px Breite messen (< 700px Budget).

## Session Juni 2026 Teil 6 - Logo-Fix, Rechner-Cleanup, PDF-TOC, Skizzen-Ordner
- Deckblatt-Logo-Fix: mm-Masse + object-fit auf <img> werden vom iOS-Druck ignoriert (Logo wurde
  auf 60mm gestreckt und abgeschnitten). Fix: logoHtml nutzt NUR px max-width/max-height
  (max-height 64/45px, max-width 220px; modern-Chip 48/128px) - gleiches Muster wie bewaehrtes
  .company-logo im Hauptdokument. Statisch verifiziert: 1024er-Logo rendert 64x64.
- Rechner-Cleanup: calculator/new.tsx 9421 -> 9041 Zeilen. Toter Code geloescht (exportToPdf -292,
  textNumpad-Funktionen, bgImage-States, isPolygonInsidePolygon etc.) + ungenutzte Imports.
  HINWEIS: Der Rechner hatte KEINEN aktiven PDF-Export (exportToPdf war unreferenziert).
  Vorbestehende Errors belassen: rules-of-hooks (useProjectPhotoAsBackground im Callback, Z~6633),
  unescaped quotes (Z~8854/8891), svg height -200 Konsolen-Fehler auf Web.
- PDF-Inhaltsverzeichnis: Toggle "Inhaltsverzeichnis" im PDF-Modal (testID toggle-toc, teal,
  persistiert aufmassprofi_pdf_toc). Service ctx.includeToc -> tocHtml nach Deckblatt:
  Kapitelliste (Projektuebersicht, Dachflaechen, Fotos, Skizzen, Bemasste Fotos,
  Flaechenberechnungen, Checklisten, Bemerkungen) mit Anzahl rechts, Akzentfarbe folgt
  coverAccent/Einstellungen. KEINE Seitenzahlen (bei fliessendem HTML nicht vorab bestimmbar).
  Runtime-verifiziert (TOC OK im Web-Bundle).
- Skizzen-Ordner: Sketch.folder (optional) in LocalStorage. Skizzen-Tab gruppiert sortiert nach
  Ordner mit Ordner-Headern ("Ohne Ordner" zuerst). Zuweisung per LONG-PRESS (450ms) auf
  Skizzen-Karte -> Modal (TextInput + Chips vorhandener Ordner + Kein Ordner/Abbrechen/Speichern,
  testID sketch-folder-input/-save). Tipp-Hinweis unter "Neue Skizze"-Button.
  Speichern via SketchService.update(id, { folder }).

## Session Juni 2026 Teil 7 - Masslinien-Rotation gefixt
- BUG: Beim Rotieren einer Masslinie (type 'arrow') rotierte nur die Linie; Pfeilspitzen (SVG-Marker)
  und Masstext blieben falsch. Ursache: react-native-svg rotiert Marker nicht mit, wenn nur die
  <Line> ein transform-rotate bekommt; der Text nutzte nur den unrotierten Linienwinkel.
- FIX (draw.tsx, rotate-Zweig ~Z4360): Fuer 'line' und 'arrow' werden die ENDPUNKTE direkt um das
  Zentrum rotiert (rotation=0 gesetzt, Alt-Rotation wird eingebacken). Marker (orient=auto) und
  Textwinkel folgen dadurch automatisch. Andere Typen weiterhin ueber element.rotation.
- Zusaetzlich: arrow-Masstext-Transform beruecksichtigt jetzt element.rotation (Altbestaende).
- draw-Route Smoke OK. Geste nativ vom User zu verifizieren.

## Session Juni 2026 Teil 8 - Numpad-Doppeltipp-Fix, Foto-Ordner, Skizzen-Ordner im PDF
- BUG-FIX Numpad "zweimal Hinzufuegen druecken": Modal-ScrollViews in draw.tsx hatten kein
  keyboardShouldPersistTaps -> erster Tap blur-te nur das (vom Numpad staendig refokussierte)
  TextInput. Fix: keyboardShouldPersistTaps="handled" auf allen 5 Modal-ScrollViews
  (styles.modalScrollContent). Gilt fuer Masslinie/Text/Pointer/Edit-Modals.
- Foto-Ordner: Photo.folder in LocalStorage. Foto-Grid gruppiert nach Ordnern mit Headern
  (nur wenn Ordner existieren), Long-Press (450ms) auf Foto -> Ordner-Modal (nicht im
  Auswahl-/Loesch-Modus). Bestehendes sketchFolderModal generalisiert: kind 'sketch'|'photo',
  itemId; speichert via PhotoService.update bzw. SketchService.update; Chips je nach kind.
  Tipp-Hinweis ueber dem Foto-Grid.
- Skizzen-Ordner im PDF (ProjectPdfService): Skizzen werden nach folder sortiert; bei
  Ordnerwechsel full-width Ordner-Header (grauer Balken, blauer Links-Rand). Hauptueberschrift
  "Skizzen" wandert bei Ordnern VOR den ersten Header (sonst wie bisher im ersten Item).
  Nur aktiv, wenn mindestens eine Skizze einen Ordner hat (sonst Verhalten unveraendert).
  Runtime-verifiziert: Reihenfolge "Ohne Ordner" -> Ordner alphabetisch, 3 Header korrekt.

## Session Juni 2026 Teil 9 - PDF-Seitenraender auf Folgeseiten
- BUG: Fotos/Skizzen begannen im gedruckten PDF auf Folgeseiten direkt am Blattrand (0 Rand).
  Ursache: iOS ignoriert CSS @page-Margins; nur Seite 1 hatte Abstand via body/.page-Padding.
- FIX: services/PdfExport.ts createPdfFile setzt jetzt STANDARDMAESSIG native margins
  36pt (12,7mm) auf allen Seiten (wie bereits beim Rapport-Export bewaehrt). Gilt fuer alle
  Aufrufer (Projekt-PDF, Modal-Print, documents/view). Seitenzahl (y=14) liegt sauber im Rand.
- Android unveraendert (nutzt @page CSS 15mm; margins-Option ist iOS-only).

## Session Juni 2026 Teil 10 - Foto-Ordner im PDF + Ordner umbenennen
- Foto-Ordner im PDF (ProjectPdfService ~Z511): Fotos nach folder sortiert, full-width
  Ordner-Header (font-size: 14px explizit, da Container font-size:0) bei Ordnerwechsel.
  Nur aktiv wenn mind. ein Foto einen Ordner hat. Runtime-verifiziert (3 Header, Reihenfolge ok).
- Ordner umbenennen: Tap auf Ordner-Header im Skizzen- ODER Foto-Tab (Stift-Icon als Hinweis,
  nur bei benannten Ordnern) -> Umbenennen-Modal (testID rename-folder-input/-save).
  saveRenameFolder aktualisiert ALLE Skizzen UND Fotos mit dem alten Namen via
  SketchService.update/PhotoService.update (leerer Name = Ordner aufloesen).

## Session Juni 2026 Teil 11 - Ordner-Header nicht mehr vom Inhalt getrennt
- BUG: Ordner-Ueberschriften standen im gedruckten PDF teils allein am Seitenende
  (Skizze/Foto erst auf Folgeseite). Ursache: page-break-after: avoid wird von iOS ignoriert.
- FIX (bewaehrtes Codebase-Muster "Ueberschrift ins Item einbetten"):
  - Skizzen: folderHeading wird IN das sketch-item div eingebettet (hat page-break-inside: avoid);
    h2 "Skizzen" wieder im ersten Item wie urspruenglich.
  - Fotos: folderHeading + ERSTES Foto der Gruppe in gemeinsamen inline-block-Wrapper
    (width 100%, page-break-inside: avoid).
- Runtime-verifiziert: Header liegen innerhalb der unteilbaren Bloecke (sketch=OK, photo=OK).

## Session Juni 2026 – Build-Vorbereitung
- PDF-Seitenumbrüche (Ordner-Überschriften) vom User bestätigt: funktioniert.
- app.json Versionen für Store-Upload erhöht: version 1.1.12, iOS buildNumber 122, Android versionCode 122.
- Build-Erstellung erfolgt über den Emergent Publish-Button (Deployment-Panel).

## PDF-Druck-Fix (iOS)
- Problem: Gedrucktes PDF hatte riesige, überlappende Schriften (Header), obwohl Vorschau korrekt war.
- Ursache: iOS-Print-Formatter layoutet HTML mit Druckbereichs-Breite in Punkten (~523px), Design ist aber fuer 794px (210mm) ausgelegt.
- Fix in services/PdfExport.ts: prepareHtmlForPrint() injiziert beim Druck CSS-Zoom (523/770) nur auf iOS + deaktiviert -webkit-text-size-adjust (Font-Boosting). Design-Breite 770px -> .page-Inhalt 680px = exakt wie Vorschau.
- Alle Druckpfade laufen zentral ueber createPdfFile() -> Fix gilt ueberall (Projekt-PDF, Berichte, Dokumente).
- WICHTIG: Nur auf echtem iOS-Geraet (TestFlight/Build) verifizierbar, neuer Build noetig.

## Foto Auto-Speichern beim Zurueck-Button
- photos/new.tsx: beforeRemove-Listener speichert ausgewaehlte Fotos automatisch, wenn der Nutzer zurueck navigiert (Header-Back oder Wisch-Geste), statt sie zu verwerfen.
- Speicherlogik in savePhotosToStorage() extrahiert, von handleSave und Auto-Save gemeinsam genutzt. skipAutoSaveRef verhindert Doppel-Speichern nach explizitem "Foto speichern".
- Getestet per Playwright auf Web-Preview: Foto waehlen -> Zurueck -> Foto gespeichert + Erfolgsmeldung.
- Nachbesserung: native-stack unterstuetzt preventDefault in beforeRemove nicht (iOS-Warnung "removed natively but didnt get removed from JS state"). Neue Loesung: eigener headerLeft-Zurueck-Button in photos/new.tsx der erst speichert, dann router.back(); gestureEnabled false; beforeRemove nur noch als Fire-and-Forget-Sicherheitsnetz ohne preventDefault.
- Build-Vorbereitung: app.json auf Version 1.1.13, iOS buildNumber 123, Android versionCode 123 erhoeht (enthaelt PDF-Druck-Fix + Foto-Auto-Speichern).
- Android-Fixes: (1) RNImage.getSize scheitert auf Android an data:-URIs ("Unsupported uri scheme") -> neuer getImageSize()-Helper in draw.tsx mit ImageManipulator-Fallback; behebt falsches Zuschneiden + falsche Bildproportionen im Skizzen-Editor. (2) Deprecated ImagePicker.MediaTypeOptions.Images ueberall durch mediaTypes: ["images"] ersetzt (draw, photos/new, settings, edit-template, calculator). Expo-Go-Medienbibliothek-Warnung ist nur Expo-Go-Limitierung, erscheint nicht im Produktions-Build.
- Android PDF-Druck: Chromium erzwingt page-break-inside:avoid strikt -> grosse Sektions-Wrapper sprangen komplett auf Folgeseiten (halbleere Seiten). Fix: Android-only CSS-Override in ProjectPdfService.ts (Wrapper duerfen umbrechen, nur photo-item/sketch-item + h2/h3/h4-Bindung geschuetzt). iOS unveraendert.
- Eingabestift verbessert: draw.tsx Stift-Striche werden jetzt als quadratische Bezier-Kurven durch Mittelpunkte geglaettet (buildSmoothPath), Jitter-Filter 0.7px, Live-Update bei jedem Event statt jedem 3. Punkt. Per Playwright verifiziert (Q-Kurven im Pfad).
- DateTimePicker onChange-Deprecation-Banner: nur Dev/Expo-Go-Warnung, nicht in Produktion sichtbar, nicht geaendert.
- Einstellungen: "Vorschau Rapport-PDF" (Live-Vorschau im PDF-Layout/Kopfzeile-Bereich) wird in der Basis-Version ausgeblendet (nur bei isProUnlocked sichtbar), da Rapporte ein Pro-Feature sind. Per Playwright verifiziert.
- Android PDF-Druck Nachbesserung (Ursache per Chromium-Harness /tmp/pdf_paginate.py verifiziert): break-before:avoid auf .sketches-container erzeugte in Chromium eine Umbruch-Kaskade (Fotos+Skizzen als ein Block -> halbleere Seiten). Android-CSS-Block in ProjectPdfService.ts erweitert: break-before:auto fuer sketches-/photos-Container. Ergebnis im Test: 3 halbleere Seiten -> 2 dicht gefuellte Seiten. Temporaere Dev-Route dev-pdf.tsx wieder entfernt.
- Android Projekt-Import-Fix: readAsStringAsync lehnt content://-URIs auf Android ab ("has been rejected"). Neuer Helper /app/frontend/utils/readTextFile.ts (Standard-Read -> SAF-Fallback -> Cache-Kopie). Eingesetzt in: app/index.tsx (Projekt-Import), BackupService.importFullBackup, materials, machines, employees, checklists/templates, references (Metadaten). Ungenutzte FileSystem-Imports bereinigt.

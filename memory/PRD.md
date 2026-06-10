# Projekt-Management App - PRD

## Original Problem Statement
React Native/Expo App für Projektmanagement mit Checklisten, Sketch-Editor, Flächen-Kalkulator und PDF-Export. Fokus auf UI/UX-Verbesserungen und Benutzerfreundlichkeit auf iPhone und iPad.

## User Personas
- Handwerker/Projektmanager die vor Ort Aufmaße erfassen
- Benutzen primär iPad, aber auch iPhone für schnelle Zugriffe

## Core Requirements
1. Checklisten mit verschachtelten Unterpunkten
2. Sketch-Editor für Zeichnungen und Maße
3. Flächen-Kalkulator für Aufmaße
4. PDF-Export mit Fotos und Skizzen
5. Referenz-Foto Verwaltung
6. Kundenverwaltung mit Kontakt-Synchronisation

## Tech Stack
- React Native / Expo
- AsyncStorage für lokale Datenhaltung
- react-native-svg für Sketch-Editor
- expo-print, expo-sharing für PDF-Export

---

## What's Been Implemented

### Dezember 2024

**Checklisten-Layout Fix (Aktuell)**
- Labels (Firmenlogo, Druckbild, Vorschau, Referenz) werden jetzt OBERHALB der Unterpunkte gerendert
- Datei: `/app/frontend/app/checklists/edit-template.tsx`

**PDF Generation Overhaul**
- Fotos werden nicht mehr über Seitenumbrüche geteilt
- Flexible inline-block Layout mit page-break Protection
- Datei: `/app/frontend/components/ProjectPDF.tsx`

**iPhone Responsiveness**
- Home-Screen Layout angepasst für kleine Bildschirme
- Sketch-Editor Toolbar scrollbar gemacht
- Settings-Seite optimiert

**Navigation & UI**
- Header mit "Zurück"-Buttons in Kundenverwaltung
- Kontakt-Synchronisation (Update, nicht nur Create)
- Photo Import/Export Buttons redesigned

**Sketch Editor UX**
- Toolbar-Border Bug behoben
- "Position"-Tool deaktiviert sich automatisch
- Resize-Handles verschwinden bei Tool-Wechsel

**Area Calculator UX**
- "+Punkt"/"-Punkt" deaktivieren sich automatisch
- Modal zu Floating Panel geändert (nicht blockierend)
- Default-Tool: "Fläche Poly"

---

## Prioritized Backlog

### P0 (Kritisch)
- [x] Checklisten-Layout Fix

### P1 (Hoch)
- [ ] App friert ein beim Schließen des Foto-Viewers
- [ ] Polygon-Messlinie Fix verifizieren

### P2 (Mittel)
- [ ] Ordner-Thumbnail wird nicht korrekt angezeigt
- [ ] PDF-Layout Fix verifizieren

### P3 (Niedrig/Backlog)
- [ ] Flächen-Kalkulator erweiterte Funktionen
- [ ] Neuer TestFlight Build
- [ ] Pro/Base Version Split mit In-App Käufen
- [ ] Preis-Kalkulation Feature
- [ ] iCloud Sync neu implementieren
- [ ] PDF Preview Bug mit gestrichelten Linien

---

## Key Files

### Checklisten
- `/app/frontend/app/checklists/[id].tsx` - Checklisten-Editor (Runtime)
- `/app/frontend/app/checklists/edit-template.tsx` - Vorlagen-Editor
- `/app/frontend/app/checklists/new.tsx` - Neue Checkliste erstellen

### Sketch & Area
- `/app/frontend/app/sketches/draw.tsx` - Sketch-Editor
- `/app/frontend/app/area/index.tsx` - Flächen-Kalkulator

### PDF & Export
- `/app/frontend/components/ProjectPDF.tsx` - PDF-Generation

### Referenzen & Fotos
- `/app/frontend/app/references/index.tsx` - Foto-Verwaltung (Bug: Freeze beim Schließen)

### Services
- `/app/frontend/services/LocalStorage.ts` - AsyncStorage Operations

---

## Known Issues

1. **App Freeze bei Photo Viewer Close** - `onClose` Handler in `references/index.tsx`
2. **Folder Thumbnail Display** - Image resizeMode/style in `references/index.tsx`

## User Language
German (Deutsch)

---

## Changelog (Feb 2026 Fork)

### ImageMeter (Fotomessung) - /app/frontend/app/imagemeter/measure.tsx
- Flächeneinheit umschaltbar: Toolbar-Button (Auto / m² / cm²) cycelt die Einheit aller Flächen-Labels (Canvas, Chips, Export-Text, gespeicherte Labels für PDF). State `areaUnit` wird in AsyncStorage persistiert (buildSave/loadPhoto).
- Helper: `formatAreaWith(unit, realA, pixA)` (Modul-Level) + `formatArea` (Komponente). testID: `area-unit-toggle-btn`.
- WICHTIG (Physik, kein Bug): Flächenwert ist rechnerisch konsistent mit Kantenlängen (Shoelace). Abweichung zur Realität entsteht durch Perspektive – Referenzlinie muss in derselben Ebene wie die gemessene Fläche liegen. Mögliches Future-Feature: Perspektivkorrektur (Homographie über bekanntes Rechteck, 4 Punkte + reale Maße).

### Offene Punkte
- User-Verifikation: ImageMeter-Snapshot ("Als Projektfoto speichern" / "Im PDF") mit SVG-Linien.
- (P1) Pro-Version Features (Code PROFI2024, Logo, Template-Limits).
- (P2) Refactoring draw.tsx / [id].tsx Monolithen.

### Rechteck-Werkzeug (Feb 2026)
- Neues Werkzeug "⬜ Rechteck" im Tool-Picker (Mehr-Button) in measure.tsx: Tippen platziert ein Rechteck (22% der Bildgröße, teal #00897B, isRect: true auf AreaMeasurement).
- Interaktion: Ecken ziehen = Größe ändern (achsenparallel, gegenüberliegende Ecke fix), Mitte ziehen = ganzes Rechteck verschieben (pointIndex -1 im DragHandle). Live-Preview als gestricheltes Polygon während Drag.
- Fläche + Kantenlängen (Breite/Höhe) werden automatisch angezeigt, Einheiten-Toggle gilt auch hier. Ideal für Fenster/Türen.

### Dynamische Label-Skalierung (Feb 2026)
- renderLine: Label-Schrift/Box skaliert mit Linienlänge (Faktor 0.55–1.0, Bezug 140px Display). Bei Linien <60px wird das Label senkrecht neben die Linie versetzt.
- renderArea: Skalierung anhand Bounding-Box minDim (Faktor 0.5–1.0, Bezug 150px). Kantenlabels werden IMMER angezeigt; bei minDim <140px nach außen versetzt, mit Extra-Push bei minDim <80px (Formel: elh/2+8+max(0,(80-minDim)*0.25)). Eckpunkt-Radien skalieren mit.

### Abzugsflächen (Feb 2026)
- AreaMeasurement.isSubtract: Fläche auswählen → Toolbar-Button "Abzug" (rot, testID area-subtract-toggle-btn) toggelt.
- Abzugsflächen: rot, gestrichelt, Label mit "−"-Präfix. Logik: areaLabelFor() prüft per pointInPoly (Ray-Casting, Modul-Level), ob der Schwerpunkt der Abzugsfläche in einer anderen Fläche liegt → deren Netto = pixelArea − Summe Abzüge.
- buildSave speichert berechnete Netto-Labels, damit PDF ([id].tsx liest a.label) korrekt ist.

### PDF-Aufschlüsselung Abzugsflächen (Feb 2026)
- [id].tsx generatePdfHtml Fotomessungen-Tabelle: fmtArea respektiert jetzt imPhoto.areaUnit (auto/m2/cm2). Abzugsflächen erscheinen als eigene rote Zeile "Fläche N (Abzug): − X". Flächen mit enthaltenen Abzügen zeigen Breakdown "Brutto − Abzug1 − ... = Netto" (Zeile "Fläche N (netto)", pip-Helper Ray-Casting lokal in der Funktion).

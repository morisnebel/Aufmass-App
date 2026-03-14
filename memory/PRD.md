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

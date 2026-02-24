# AUFMASSPROFI DACH - Product Requirements Document

## Original Problem Statement
Mobile app for roof measurement professionals to document projects, take photos, create sketches, and generate professional PDF reports - all working completely offline with iCloud synchronization across Apple devices.

## Core Requirements
1. **Offline-First Architecture**: All data stored locally using AsyncStorage with file-based sync via Export/Import
2. **PDF Generation**: Professional reports with company branding, project details, photos, and sketches
3. **Sketch Tool**: Drawing canvas with text, arrows, measurement lines, polylines, and images
4. **Photo Documentation**: Capture and annotate photos with pencil annotations visible in PDF
5. **Checklist Management**: Customizable checklists for roof inspections with copy/paste, collapse, and default-collapsed state
6. **Export/Import**: Share projects between devices via `.aufmass` files

## Tech Stack
- **Frontend**: React Native / Expo
- **Storage**: @react-native-async-storage/async-storage
- **PDF**: expo-print with HTML generation
- **File System**: expo-file-system, expo-document-picker
- **Distribution**: TestFlight (iOS)

## What's Been Implemented

### December 2025 (Session 19.02.2026)
- **[NEW] Checklisten-Vorlagen Export/Import**
  - Export als `.checklistvorlage` Datei (JSON)
  - Import von anderen Geräten (iPhone/iPad)
  - Teilen über iCloud, AirDrop, Dateien-App
  - Besseres Button-Layout (größer, mehr Abstand)
  - Files modified: `frontend/app/checklists/templates.tsx`

- **[NEW] Kompaktes Checklisten-Grid Layout**
  - Hauptüberschrift (z.B. "Aufmaß Standard") prominent hervorgehoben mit blauer Unterstreichung
  - Kategorien (Vorarbeiten, Dacheindeckung, etc.) als separate Überschriften mit grüner Linie
  - Container für 1.1, 1.2, 2.1 etc. mit blauem Badge - nebeneinander im Grid (platzsparend)
  - Alle Unterpunkte hierarchisch mit Nummerierung (1.1.1, 1.1.1.1, etc.)
  - **Notizen** werden auf allen Ebenen in gelben Boxen angezeigt
  - Files modified: `frontend/app/projects/[id].tsx`

- **[NEW] PDF-Layout für Checklisten**
  - Identisches Layout wie in der App-Vorschau
  - Hauptüberschrift, Kategorien, Container mit Unterpunkten
  - Notizen werden im PDF angezeigt

- **[NEW] Checklist Copy/Paste Feature**
  - Copy and paste checklist items in both project checklists and templates
  - Preserves all sub-items when copying
  - Files modified: `frontend/app/checklists/[id].tsx`, `frontend/app/checklists/edit-template.tsx`

- **[NEW] Checklist Collapse/Expand Feature**
  - Items with sub-items can be collapsed/expanded
  - Default collapsed state when opening editor for cleaner overview
  - Visual indicator showing number of hidden sub-items
  - Files modified: `frontend/app/checklists/[id].tsx`, `frontend/app/checklists/edit-template.tsx`

- **[NEW] Project Details - Filtered Checklist View**
  - In project overview, only checked/completed checklist items are displayed
  - Shows "Noch keine Positionen abgehakt" when no items are checked
  - Files modified: `frontend/app/projects/[id].tsx`

- **[COMPLETED] Project Export/Import Feature**
  - Export projects as `.aufmass` files to iCloud Drive or Files app
  - Import projects from `.aufmass` files on other devices
  - Includes all project data: photos, sketches, roofs, checklists
  - Files modified: `frontend/app/projects/[id].tsx`, `frontend/app/index.tsx`

- **[COMPLETED] PDF Layout Improvements**
  - Firmenlogo vergrößert (180x130px statt 120x90px)
  - Bleistift-Annotationen auf Fotos werden jetzt im PDF angezeigt (SVG-Overlay)
  - "Skizzen"-Überschrift bleibt mit Skizzen zusammen (kein Orphan-Problem)
  - Fußzeile "Erstellt mit..." ist jetzt besser sichtbar

### Previous Implementation
- Full offline architecture with AsyncStorage
- Project management (CRUD operations)
- Customer management
- Roof measurements with detailed fields
- Photo capture and multi-photo upload
- Sketch editor with multiple tools (pen, shapes, text, arrows, pointers, polylines)
- PDF generation with size options (Small/Medium/Large/Full) for photos and sketches
- Checklist templates
- Company settings for PDF branding
- TestFlight deployment

## Known Issues
- **iCloud Sync** was attempted but disabled due to complexity. Export/Import via files is the current solution.

## Prioritized Backlog

### P0 (Critical)
- ✅ Complete checklist enhancements (copy/paste, collapse, filter)
- Guide user to create new TestFlight build (Version 21+)

### P1 (High Priority)
- Final App Store submission - all fixes verified, ready for submission

### P2 (Medium Priority)
- Performance optimizations for large projects
- Additional checklist templates

## File Structure
```
/frontend/
  /app/
    /projects/
      [id].tsx      - Project details, PDF, Export
    /checklists/
      [id].tsx      - Checklist editor (copy/paste, collapse)
      edit-template.tsx - Template editor (copy/paste, collapse)
    /sketches/
      draw.tsx      - Sketch editor with SVG generation
    /photos/
      annotate.tsx  - Photo annotation
    index.tsx       - Main screen, Import
  /services/
    LocalStorage.ts - AsyncStorage service layer
```

## Testing Credentials
- Expo Account: moris_nebel@hotmail.com
- Password: Miabalu1+

### Session 20.02.2026
- **[FIXED] Tastatur-Bug in Checklisten**
  - Tastatur öffnete sich nicht mehr bei Notizen/Positions-Eingabefeldern
  - Behoben durch Hinzufügen von `autoFocus={true}`
  - File: `frontend/app/checklists/[id].tsx`

- **[FIXED] Numpad Schließen-Button in Checklisten**
  - X-Button zum Schließen funktionierte nicht
  - Problem: Button war innerhalb des Drag-Bereichs (PanResponder fing Touch-Events ab)
  - Lösung: Button außerhalb des Drag-Bereichs verschoben, absolut positioniert
  - File: `frontend/app/checklists/[id].tsx`

- **[FIXED] Numpad-Größe in Skizzen-Ansicht**
  - Numpad war zu klein im Vergleich zur Checklisten-Ansicht
  - Tasten vergrößert (minHeight: 44, aspectRatio: 1.5)
  - Schriftgrößen erhöht (16px für Zahlen, 18px für Operatoren)
  - Container breiter (maxWidth: 360)
  - File: `frontend/app/sketches/draw.tsx`

- **[COMPLETED] Verschiebbare Grundriss-Steuerung**
  - Grundriss-Steuerungsleiste ist jetzt kompakter und verschiebbar
  - Drag-Handle zum Verschieben
  - Bessere Bedienbarkeit bei Grundrisszeichnungen
  - File: `frontend/app/sketches/draw.tsx`

- **[NEW] Maße zu Grundriss-Linien hinzufügen**
  - Einzelne Liniensegmente im Grundriss antippen zur Auswahl
  - Ausgewähltes Segment wird orange hervorgehoben
  - "Maß hinzufügen"-Button erscheint bei Auswahl
  - Eigenes Numpad-Modal für schnelle Maß-Eingabe (m, cm)
  - Maßlinie wird als Bemaßung parallel zur Linie dargestellt
  - Summenbox zeigt automatisch Gesamtlänge aller Maße in lfm
  - Maße können wieder gelöscht werden
  - File: `frontend/app/sketches/draw.tsx`

### Session 21.02.2026
- **[FIXED] Maße werden jetzt gespeichert und in PDF/Vorschau gerendert**
  - `lineSegmentMeasurements` werden im Sketch-Metadata gespeichert
  - `generatePreviewSvg()` rendert jetzt Maßlinien mit Text im SVG
  - Bounds-Berechnung erweitert für Maßlinien-Offset
  - File: `frontend/app/sketches/draw.tsx`

- **[FIXED] Summenbox ist jetzt verschiebbar (iPhone-Fix)**
  - Summenbox verwendet jetzt `Animated.View` mit `PanResponder`
  - Drag-Handle für einfaches Verschieben
  - Position wird beim Laden/Erstellen einer neuen Skizze zurückgesetzt
  - File: `frontend/app/sketches/draw.tsx`

- **[FIXED] Summenbox größer gemacht**
  - Padding und Schriftgröße erhöht (16px statt 13px)
  - Icon größer (18px statt 14px)
  - Bessere Sichtbarkeit auf allen Geräten
  - File: `frontend/app/sketches/draw.tsx`

- **[FIXED] "Maß hinzufügen"-Button kleiner gemacht**
  - Padding reduziert (8px statt 12px)
  - Schriftgröße reduziert (12px statt 14px)
  - `flex: 1` entfernt für kompaktere Darstellung
  - File: `frontend/app/sketches/draw.tsx`

- **[FIXED] Summenbox Reset bei neuem Grundriss**
  - `clearAll()` setzt jetzt auch `lineSegmentMeasurements` zurück
  - Position der Summenbox wird beim Laden/Erstellen zurückgesetzt
  - File: `frontend/app/sketches/draw.tsx`

- **[FIXED] lineSegmentMeasurements werden in saveSketch() gespeichert**
  - Das Speichern der Maße fehlte in der `saveSketch()` Funktion
  - Jetzt werden Maße korrekt in den Metadaten gespeichert
  - File: `frontend/app/sketches/draw.tsx`

- **[FIXED] Gesamtlänge erscheint jetzt in Vorschau und PDF**
  - Die Gesamtlänge (lfm) wird als Text-Element im SVG gerendert
  - Position: Oben rechts in der Zeichnung
  - Blaue Box mit "Gesamt: X,XX lfm"
  - File: `frontend/app/sketches/draw.tsx`

- **[FIXED] Summenbox auf iPhone kleiner**
  - Bildschirmbreite < 500px: kompaktere Darstellung
  - Kleinere Icons, Schriftgröße und Padding
  - File: `frontend/app/sketches/draw.tsx`

## Last Updated
February 2026

### Session 22.02.2026 (oder aktuell)
- **[FIXED] Summenbox-Position wird jetzt gespeichert**
  - Die Position der verschiebbaren Summenbox wird in den Sketch-Metadaten gespeichert
  - Beim Laden einer Skizze wird die Position wiederhergestellt
  - `totalLfmBoxPosition` und `totalLfmBoxSavedPosition` State hinzugefügt
  - Änderungen in: `handleBackPress`, `saveSketch`, `loadSketch`
  - File: `frontend/app/sketches/draw.tsx`

- **[FIXED] State-Reset bei neuen Skizzen verbessert**
  - `useFocusEffect` führt jetzt IMMER einen Reset durch bevor neue Daten geladen werden
  - Verhindert, dass alte Maße aus vorherigen Skizzen in neuen Skizzen angezeigt werden
  - Jeder Grundriss hat sein eigenes unabhängiges Zusammenfassungs-Fenster
  - `lineSegmentMeasurements` werden korrekt zurückgesetzt
  - File: `frontend/app/sketches/draw.tsx`

### Session (aktuell - Summary Legend Feature)
- **[NEW] Summary Legend mit Grundriss-Beschriftung**
  - Jeder Grundriss (Polyline) mit Maßen erhält automatisch ein Label (S1, S2, S3...)
  - Label wird als blauer Kreis im Zentrum des Grundrisses angezeigt
  - Summary Legend Box in der unteren rechten Ecke zeigt Übersicht aller Grundrisse mit Gesamtlängen
  - Labels und Legend werden im Canvas während der Bearbeitung angezeigt
  - Labels und Legend werden im SVG für PDF und Vorschauen gerendert
  - Ersetzt die alte komplizierte "verschiebbare Summenbox pro Grundriss" Lösung
  - File: `frontend/app/sketches/draw.tsx`

- **[REMOVED] Alte verschiebbare Summenboxen**
  - Die komplexe DraggableTotalBox-Funktion wurde zugunsten der einfacheren Summary Legend aufgegeben
  - State `totalLfmBoxPositions` wird weiterhin für Rückwärtskompatibilität gespeichert


# AUFMASSPROFI DACH - Product Requirements Document

## Original Problem Statement
Build a comprehensive application for managing roofing projects with:
- Checklist templates management
- A powerful "Flächen-Kalkulator" (Area Calculator) tool
- Photo annotation and management
- PDF export functionality

## User Language
German (Deutsch)

## Core Features

### 1. Area Calculator (Flächen-Kalkulator)
- Draw main polygons (total area) and subtraction polygons (openings)
- Set scale for drawing canvas
- Calculate and display net area
- Line/edge management with categories
- Angle snapping and direct length input
- Movable numpad for dimension input
- Annotation tools (shapes, text boxes, memo pointers)
- Pinch-to-zoom and pan
- Background image support
- Undo/Redo functionality

### 2. Photo Management
- Add photos to projects
- Photo annotation with drawing tools
- Save photos to device gallery (via Share in Expo Go, direct in production)
- Multi-select mode for batch operations

### 3. PDF Export
- Project documentation export
- Customizable layout
- Compact, ink-friendly headers and summary boxes
- Include drawings, annotations, and reference images

### 4. Checklist Management
- Create and manage checklist templates
- Template logos and category logos
- Sub-items with images

## Tech Stack
- **Frontend**: React Native / Expo
- **Storage**: AsyncStorage (local)
- **PDF**: expo-print
- **File System**: expo-file-system, expo-media-library
- **Navigation**: expo-router

## What's Been Implemented

### Session: December 2025 (Current)
- ✅ **NOTIZ-BUTTON IMPLEMENTIERT (wie in Flächenberechnung)**:
  - Neuer DrawMode 'memo' hinzugefügt
  - Zeichnet Annotation mit rotem Ankerpunkt, gestrichelter Linie und Textlabel
  - Modal zum Eingeben des Notiz-Textes
  - Bearbeitungsmodus für Memo-Elemente (Text, Schriftgröße, Farbe ändern)
  - Button in Toolbar mit korrektem Icon und Styling
- ✅ **PROJEKTFOTOS-FUNKTION IMPLEMENTIERT**: 
  - Modal für Projektfotos-Auswahl hinzugefügt
  - Fotos aus dem Projekt können ausgewählt und in die Skizze eingefügt werden
  - Button "Projektfotos" ist jetzt voll funktionsfähig
- ✅ **BEARBEITUNGSMODUS BUG BEHOBEN**: 
  - `selectDrawMode` schaltet jetzt auch bei 'select' den Zoom-Modus aus
  - Elemente können wieder ausgewählt und bearbeitet werden
- ✅ **ZOOM/ZEICHNEN KOORDINATEN FIX**:
  - Bei Auswahl eines Werkzeugs wird automatisch der Zoom deaktiviert
  - Zoom wird auf 100% zurückgesetzt bevor gezeichnet/bearbeitet wird

### Session: March 10, 2026
- ✅ **TOOLBAR REDESIGN MIT LABELS**: Toolbar komplett umgestaltet mit Beschriftungen unter den Buttons:
  - "Hand" → "Bearbeiten"
  - "Stift" → "Stift"
  - "Linie, Kreis, Rechteck" → "Formen" (gruppiert)
  - "Maßlinie" + "Maße über Polygone" (gruppiert)
  - "Memo" + "Text" + "Notiz zur Skizze" (gruppiert)
  - "Galeriefotos"
  - "Projektfotos" (jetzt implementiert)
  - "neues Foto"
  - "Fotobearbeitung"
- ✅ **MEMO-PFEIL TEXT-STYLING FIX**: Der Rahmen um den Memo-Text passt sich jetzt an die Strichdicke des Pfeils an (proportional 1/3 der Linienstärke)

### Session: March 9, 2026
- ✅ Implemented manual Zoom-Toggle Button ("Zoom an/aus") in der Toolbar
  - Grün = Zoom-Modus aktiv (pinch-to-zoom und pan funktionieren)
  - Rot = Zoom aus (Zeichnen/Bearbeiten aktiv)
- ✅ Automatische Umschaltung: Bei Auswahl eines Zeichenwerkzeugs wird Zoom automatisch deaktiviert
- ✅ 100%-Button repariert: Setzt Zoom-Level und Position korrekt zurück
- ✅ ScrollView korrekt an zoomMode gebunden (scrollEnabled und pinchGestureEnabled)

### Session: December 2025
- ✅ **KRITISCHER BUG BEHOBEN**: Koordinatenberechnung beim Zeichnen/Bearbeiten auf gezoomter Leinwand
  - `onTouchMove` und `onTouchEnd` verwendeten falsche Formel (panOffset statt scrollOffset)
  - Alle Touch-Handler verwenden jetzt konsistent: `((touch.locationX) + scrollOffset.x) / scale`
- ✅ **100%-Button verbessert** gemäß Benutzeranforderung:
  - Zeigt dynamischen Zoom-Prozentsatz (z.B. "150%")
  - "100%" statisch darunter angezeigt
  - Grüne Hintergrundfarbe bei genau 100% Zoom
  - Button ist jetzt immer sichtbar (nicht nur wenn gezoomt)
  - Reset setzt auch scrollOffset zurück

### Session: March 8, 2026
- ✅ Fixed Expo development environment (EXPO_TOKEN authentication)
- ✅ Implemented "Save to Gallery" feature with Share fallback for Expo Go
- ✅ Photo annotation zoom/pan overhaul with ScrollView
- ✅ Toolbar redesign with custom SVG icons
- ✅ Calculator modal implementation
- ✅ PDF export styling refinements
- ✅ UI reorganization (header buttons, navigation tabs)

## Known Limitations
- **Expo Go**: FileSystem directories (documentDirectory, cacheDirectory) are null
  - Workaround: Use Share sheet to save images
  - Resolution: Works properly in TestFlight/production builds

## Prioritized Backlog

### P0 (Critical)
- ✅ **PROJEKTADRESSEN-MODAL LABELS** (Dezember 2025):
  - Labels für alle Eingabefelder hinzugefügt (Bezeichnung, Beschreibung, Objektname, Straße, PLZ, Ort, Ansprechpartner, Telefon, E-Mail)
- ✅ **CODE CLEANUP** (Dezember 2025):
  - Ungenutzte `annotate.tsx` Datei entfernt
- ⏳ **BENUTZERTEST ERFORDERLICH**: 
  - **Notiz-Button** testen (roter Punkt mit gestrichelter Linie und Textlabel)
  - Projektfotos-Funktion testen
  - Bearbeitungsmodus testen (Elemente auswählen, verschieben, löschen)
  - Zeichnen testen (mit und ohne Zoom)

### P1 (High Priority)
- "Maße über Polygone" Button implementieren
- "Notizen zur Skizze" Button Funktionalität vervollständigen (Modal existiert bereits)

### P2 (Medium Priority)
- Create new TestFlight build
- Implement Pro/Base version split with in-app purchases

### P3 (Lower Priority)
- Price calculation feature based on areas/lengths

### P4 (Backlog)
- Re-implement iCloud Sync
- Fix dashed lines rendering in PDF preview

## Key Files
- `/app/frontend/app/sketches/draw.tsx` - Hauptdatei für Skizzen-Tool mit Zoom-Toggle, Zeichenwerkzeugen und Toolbar
- `/app/frontend/app/calculator/new.tsx` - Calculator with toolbar and modal
- `/app/frontend/app/projects/[id].tsx` - Project details with photo management
- `/app/frontend/app/photos/annotate.tsx` - Photo annotation with zoom/draw
- `/app/frontend/app/_layout.tsx` - Navigation layout configuration

## Environment Configuration
- **EXPO_TOKEN**: Required for Expo Go tunnel authentication
- **EXPO_TUNNEL_SUBDOMAIN**: polygon-area
- **Preview URL**: https://flachen-kalkulator-1.preview.emergentagent.com

## Testing Notes
- Use Expo Go with `exp://polygon-area.preview.emergentagent.com`
- Photo gallery save requires Share sheet in Expo Go
- Full functionality available in TestFlight builds
- **WICHTIG**: Nach jeder Änderung Expo Go komplett schließen und neu öffnen!

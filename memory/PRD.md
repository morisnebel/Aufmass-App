# AUFMASSPROFI DACH - Product Requirements Document

## Original Problem Statement
Bau-Vermessungs-App für Dachdecker zur Erfassung von Dachflächen, Fotos, Skizzen und Checklisten. Die App ermöglicht das Erstellen professioneller PDF-Dokumentationen für Kunden.

## Core Features Implemented

### 1. Projekt-Management
- Projekte mit Kunden und Objektadressen erstellen/bearbeiten
- Bauherr-Daten separat erfassbar
- Projekt-Status (aktiv, abgeschlossen, abgebrochen)

### 2. Dachflächen-Erfassung
- Verschiedene Dachtypen unterstützt
- Detaillierte Maßeingaben (Länge, Breite, Neigung, etc.)
- Automatische Flächenberechnung

### 3. Foto-Dokumentation
- Fotos mit Beschreibungen hinzufügen
- Foto-Annotationen (Zeichnen, Text, Pfeile)
- PDF-Größenanpassung pro Foto

### 4. Skizzen-Editor
- Freihand-Zeichnen
- Polylinien mit Maßangaben
- Formen und Beschriftungen
- SVG-basierte Speicherung

### 5. Checklisten-System
- Vorlagen mit beliebig tiefen Hierarchien
- Check/Uncheck mit Notizen
- Maßangaben pro Position
- **NEU (Feb 2026)**: Bilder in Checklisten
  - Template-Logo
  - Kategorie-Logos
  - Druckbilder (erscheinen im PDF)
  - Vorschau-Bilder (nur zur Beratung, nicht im PDF)

### 6. PDF-Export
- Professionelle Dokumentation mit Firmenlogo
- Alle Projektdaten übersichtlich dargestellt
- Fotos mit Annotationen
- Skizzen eingebettet
- Checklisten mit Hierarchie und Bildern
- Konfigurierbare Spaltenanzahl
- **NEU**: PDF-Farbeinstellung (8 Optionen zum Tinte sparen)
- **NEU**: iPhone-optimiertes Layout (6 Fotos/Seite, 2 Skizzen/Zeile)

### 7. Bemerkungen
- Freitext-Bemerkungen pro Projekt
- Erscheint am Ende des PDFs

### 8. PDF-Dokumente (NEU - März 2026)
- PDF-Dateien aus der Dateien-App importieren
- Beim Kunden Angebote und Dokumente besprechen
- Umfangreiche Anmerkungsfunktionen:
  - **Stift**: Freihandzeichnen
  - **Marker/Highlighter**: Halbtransparente Hervorhebung
  - **Radierer**: Zeichnungen entfernen
  - **Text**: Textanmerkungen über Tastatur mit Größenwahl (S/M/L)
  - **Formen**: Rechteck, Kreis, Pfeil, Linie
- Strichstärke wählbar (dünn/mittel/dick)
- Textgröße wählbar (klein/mittel/groß)
- 7 Farben zur Auswahl
- Seiten einzeln annotieren und teilen
- **NEU: Anmerkungen werden pro Seite in AsyncStorage gespeichert**
- **NEU: Undo-Funktion in korrekter Reihenfolge**
- **NEU: Speichern-Button im Header**
- **NEU: Bestätigung beim Verlassen mit ungespeicherten Änderungen**

## Technical Stack
- **Framework**: React Native / Expo
- **Storage**: AsyncStorage (lokal)
- **PDF**: expo-print
- **Images**: expo-image-picker
- **Navigation**: expo-router

## Known Issues & Workarounds
- **expo-print Last-Page Bug**: Ein "Final Page" Buffer wird am Ende des HTML hinzugefügt, um das Abschneiden der letzten Seite zu verhindern.

## Backlog (Prioritized)

### P0 - Critical
- [x] Checklisten-Bild-Feature implementieren
- [x] iPhone PDF-Optimierung
- [x] PDF-Farbeinstellung
- [x] PDF-Dokument-Feature mit Anmerkungen

### P1 - High Priority  
- [ ] Neuer TestFlight Build
- [ ] Pro/Base Version Split (In-App-Käufe)

### P2 - Medium Priority
- [ ] Preiskalkulation (Kosten basierend auf Maßen)
- [ ] iCloud Sync wiederherstellen

### P3 - Low Priority
- [ ] SVG-Duplikation aufräumen
- [ ] Code-Refactoring

## Recent Changes (Changelog)

### 3. März 2026 (Aktuell)
- **PDF-Annotationen verbessert**:
  - Alle Tools jetzt voll funktionsfähig: Stift, Highlighter, Radierer, Text, Formen
  - **Speichern-Funktion**: Annotationen werden in AsyncStorage persistiert
  - **Undo in korrekter Reihenfolge**: Entfernt die zuletzt gezeichnete Annotation
  - **Speichern-Button** im Header hinzugefügt
  - **Bestätigung beim Verlassen** wenn ungespeicherte Änderungen vorhanden
  - **Textgröße wählbar** (S/M/L) im Text-Modal
  - **Alles löschen** mit Bestätigungsdialog
  - Annotationen werden beim erneuten Bearbeiten geladen

### 2. März 2026
- **PDF-Dokument-Feature**: Komplette Neuentwicklung
  - PDFs aus der Dateien-App importieren
  - Dokumente im Projekt-Tab "Doku" verfügbar
  - PDF-Viewer mit Seitennavigation
  - Annotations-System mit vielen Werkzeugen
- **Annotation-Werkzeuge**:
  - Stift (Freihand)
  - Marker/Highlighter (halbtransparent)
  - Radierer
  - Text über Tastatur
  - Formen: Rechteck, Kreis, Pfeil, Linie
- **Anpassbare Einstellungen**:
  - 3 Strichstärken (dünn/mittel/dick)
  - 3 Textgrößen (klein/mittel/groß)
  - 7 Farben
- **PDF-Vorschau-Fix**: Gestrichelte Linien und visuellen Versatz behoben
- **LogBox-Warnung**: Canvas-Fehler von pdf.js werden jetzt ignoriert

### 27. Februar 2026
- **Checklisten-Bild-Feature**: Template-Logos, Kategorie-Logos, Druck- und Vorschau-Bilder implementiert
- **Bilder im Originalformat**: Kein Zuschnitt mehr beim Speichern (allowsEditing entfernt)
- **PDF-Farbeinstellung**: 8 Farboptionen (Blau, Hellblau, Grau, Hellgrau, Grün, Hellgrün, Schwarz, Weiß)
- **iPhone PDF-Optimierung**:
  - Fotos: 6 pro Seite in 2x3 Grid
  - Skizzen: 2 pro Zeile
  - Bilder behalten ihr Seitenverhältnis (Hoch-/Querformat)
  - Keine abgeschnittenen Bilder mehr
- **iPad PDF**: Unverändert (eigene Logik)

### Frühere Updates
- PDF-Generierung stabilisiert (Last-Page Bug Workaround)
- Hierarchische Checklisten-Anzeige
- Foto-Annotationen
- Skizzen-Editor mit Maßangaben

## Key Files
- `/app/frontend/app/projects/[id].tsx` - Projekt-Ansicht und PDF-Generierung
- `/app/frontend/app/checklists/edit-template.tsx` - Checklisten-Vorlagen Editor
- `/app/frontend/app/settings/index.tsx` - Einstellungen inkl. PDF-Farbe
- `/app/frontend/app/documents/new.tsx` - PDF-Dokument hinzufügen
- `/app/frontend/app/documents/view.tsx` - PDF-Dokument Viewer
- `/app/frontend/app/documents/annotate.tsx` - PDF-Annotationen mit vielen Werkzeugen
- `/app/frontend/services/LocalStorage.ts` - Datenpersistenz (inkl. DocumentService)

## Credentials
- Expo Account: `moris_nebel@hotmail.com` / `Miabalu1+`

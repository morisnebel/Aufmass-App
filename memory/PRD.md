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
- **NEU (Dez 2025)**: Bilder in Checklisten
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

### 7. Bemerkungen
- Freitext-Bemerkungen pro Projekt
- Erscheint am Ende des PDFs

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
- [ ] User-Testing auf TestFlight

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

### Dezember 2025
- **Checklisten-Bild-Feature**: Template-Logos, Kategorie-Logos, Druck- und Vorschau-Bilder implementiert
- **PDF-Generierung**: Bilder werden korrekt im PDF eingebettet
- **Bildvorschau-Modal**: Vollbild-Galerie mit Navigation in Projekt-Ansicht

### Frühere Updates
- PDF-Generierung stabilisiert (Last-Page Bug Workaround)
- Hierarchische Checklisten-Anzeige
- Foto-Annotationen
- Skizzen-Editor mit Maßangaben

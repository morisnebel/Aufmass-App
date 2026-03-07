# Dachhandwerker App - PRD

## Original Problem Statement
Eine umfassende Anwendung zur Verwaltung von Dachdeckerprojekten mit einem leistungsstarken "Flächen-Kalkulator" (Area Calculator) Tool.

## Core Features

### Flächen-Kalkulator
- Zeichnen von Hauptpolygonen (Gesamtfläche) und Abzugspolygonen (Fenster/Türen)
- Maßstab-Einstellung für die Zeichenfläche
- Automatische Berechnung der Nettofläche
- Winkel- und Längeneingabe-Modus
- Linien-/Kantenverwaltung mit Kategorien
- Zeichenhilfen: Winkeleinrasten, direkte Längeneingabe
- Verschiebbare Numpads für manuelle Eingabe
- Annotationswerkzeuge (Rechteck, Kreis, Pfeil, Linie, Text, Memo)
- Pinch-to-Zoom und Pan-Funktionalität
- Hintergrundbild-Unterstützung
- Undo/Redo
- PDF-Export

### Checklisten-Templates
- Vordefinierte Checklisten für Dacharbeiten
- Anpassbare Templates

### Projektverwaltung
- Kundendaten
- Dokumentenverwaltung
- Fotoverwaltung mit Annotationen

## Implemented Features (December 2024)

### Session 1 - Numpad & Modal Improvements
- ✅ Line Edit Numpad: Kompatibilität mit Laser-Messgerät
- ✅ "Winkel & Maß" Modal: Eingebettetes Numpad, verschiebbar, kompakt
- ✅ Text & Memo Numpad: Eingebettet in jeweiliges Modal
- ✅ Annotation Movability: Text und Memo verschiebbar
- ✅ Annotation Editability: Text und Memo bearbeitbar (Doppel-Tap)

### Session 2 - Current Session
- ✅ Parallele Hilfslinien Modal: Verschiebbar mit eingebettetem Numpad
- ✅ Winkel-Anzeige: Korrigiert auf Innenwinkel-Berechnung
- ✅ Richtungskreis: 180° und 270° Labels hinzugefügt
- ✅ Winkeleingabe: − und ± Buttons im Numpad für negative Winkel

## Technical Architecture

```
/app
├── frontend/
│   └── app/
│       ├── calculator/
│       │   └── new.tsx           # Hauptkomponente Flächen-Kalkulator
│       ├── projects/
│       │   └── [id].tsx          # Projektdetails, PDF-Export
│       └── services/
│           └── LocalStorage.ts   # Datenmodelle
└── backend/
    └── server.py                 # FastAPI Backend
```

## Key Technical Concepts
- **React Native SVG**: Zeichenfläche und Annotationen
- **PanResponder + Animated.View**: Verschiebbare Modals
- **AsyncStorage**: Lokale Datenspeicherung

## Prioritized Backlog

### P0 (Critical)
- Keine offenen kritischen Issues

### P1 (High)
- Keine offenen High-Priority Issues

### P2 (Medium)
- TestFlight Build erstellen
- Pro/Base Version mit In-App-Käufen implementieren

### P3 (Low)
- Preiskalkulation basierend auf Flächen/Längen

### P4 (Future)
- iCloud Sync wieder implementieren
- Visueller Bug bei gestrichelten Linien im PDF-Preview

## Refactoring Needed
- `/app/frontend/app/calculator/new.tsx`: ~9000 Zeilen, sollte in kleinere Komponenten aufgeteilt werden (AngleModal, TextEditModal, DraggableNumpad, Canvas, etc.)

## 3rd Party Integrations
- @react-native-async-storage/async-storage
- expo
- expo-print
- react-native-svg

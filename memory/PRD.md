# AufmassProfi Dach - Produktanforderungen

## Originales Problem
Entwicklung einer umfassenden iOS/iPad-Anwendung für das Management von Dachdeckerprojekten, mit Fokus auf Checklisten-Templates und PDF-Dokumenten-Annotation.

## Kernfunktionen

### PDF Annotations-Feature (ABGESCHLOSSEN)
- "Dokumente"-Tab in Projektdetails
- PDF-Import vom Gerät
- Seiten-Navigation
- Annotations-Tools: Stift, Radiergummi, Formen, Notiz-Annotation, Texteingabe
- Apple Pencil Zeichnung
- Zoom-Funktion
- Annotations verschieben/löschen
- Auto-Save beim Verlassen
- Multi-Page PDF Export mit Annotations

### Projektverwaltung
- Projekte erstellen/bearbeiten
- Kunden-/Bauherr-Daten mit Synchronisation
- Objektadressen
- Dachflächen mit Messungen
- Fotos mit Annotations
- Skizzen
- Checklisten

### Checklisten-System (ABGESCHLOSSEN)
- Vorlagen erstellen und bearbeiten
- Vorlagen aus Projekt-Checklisten kopieren
- Sortierung von Vorlagen (persistent)
- Sortierung von Items innerhalb Checklisten
- Import/Export von Vorlagen

### Kundenverwaltung (ABGESCHLOSSEN)
- Kundenliste mit Schnellauswahl
- Direktes Projekt erstellen aus Kundenliste
- Synchronisation: Projekt-Änderungen → Kundenstamm
- Felder: Name, E-Mail, Telefon, Handy, Adresse

## Architektur
```
/frontend/
  ├── app/
  │   ├── checklists/
  │   │   ├── [id].tsx          # Checkliste bearbeiten (mit Sortierung)
  │   │   ├── edit-template.tsx # Vorlage bearbeiten
  │   │   ├── templates.tsx     # Vorlagen-Liste (mit Sortierung)
  │   │   └── new.tsx
  │   ├── customers/
  │   │   ├── _layout.tsx
  │   │   ├── index.tsx         # Kundenliste mit Schnell-Projekt
  │   │   ├── [id].tsx          # Kunde bearbeiten (mit Handy-Feld)
  │   │   └── new.tsx
  │   ├── documents/
  │   │   └── view.tsx          # PDF Annotations Editor
  │   ├── projects/
  │   │   ├── [id].tsx          # Projektdetails (PDF-Export, Checkliste-Kopieren)
  │   │   └── new.tsx           # Neues Projekt
  │   └── index.tsx             # Startseite mit Sortierung
  └── services/
      └── LocalStorage.ts       # AsyncStorage Persistenz (mit saveAll)
```

## Was wurde implementiert (März 2026)

### Session 1-4: PDF Annotation Feature
- Multi-Page Annotation Save Bug behoben
- Multi-Page PDF Export implementiert
- "Notiz"-Annotation redesigned
- Annotations editierbar

### Session 5: Umfangreiche Verbesserungen
- **PDF-Lader Bug behoben**: Loader wird vor Share-Dialog deaktiviert
- **PDF-Layout kompakter**: Kleinere Schrift, weniger Abstände, anpassbare Ränder
- **Projekt-Sortierung**: Nach Datum, Name, Status sortierbar
- **Kundenverwaltung erweitert**:
  - Schnell-Projekt aus Kundenliste (grüner + Button)
  - Handy-Feld hinzugefügt
  - Projekt→Kunde Synchronisation
- **Tastatur-Bug behoben**: phone-pad → default für stabile Eingabe
- **Checkliste als Vorlage**: Blauer Kopier-Button bei Projekt-Checklisten
- **Sortierung für Checklisten-Vorlagen**: Persistent mit saveAll()
- **Sortierung für Checklist-Items**: ⬆️⬇️ Pfeile

## Offene Aufgaben

### P1 (Hoch)
- [ ] Text-Annotationen in der Größe veränderbar machen

### P2 (Mittel)
- [ ] Texteingabefeld im Editor verschiebbar machen
- [ ] Neuer TestFlight Build

### P3 (Niedrig)
- [ ] Pro/Base Version mit In-App-Käufen
- [ ] Preisberechnung basierend auf Messungen

### P4 (Backlog)
- [ ] iCloud Sync
- [ ] Gestrichelte Linien in PDF-Vorschau beheben

## Technische Details

### Key Patterns
- `useRef` für synchrones State-Management
- `captureRef` für PDF-Seiten-Rendering
- Share-Dialog VOR finally-Block beenden
- `saveAll()` für atomare Speicherung von Listen
- `order` Feld für persistente Sortierung

### Dependencies
- expo-print, expo-sharing, expo-file-system
- react-native-svg, react-native-view-shot
- @react-native-async-storage/async-storage

## Sprache
Alle Benutzerkommunikation auf **Deutsch**.

# AufmassProfi Dach - Produktanforderungen

## Originales Problem
Entwicklung einer umfassenden iOS/iPad-Anwendung für das Management von Dachdeckerprojekten, mit Fokus auf Checklisten-Templates und PDF-Dokumenten-Annotation.

## Kernfunktionen

### PDF Annotations-Feature (ABGESCHLOSSEN)
- "Dokumente"-Tab in Projektdetails
- PDF-Import vom Gerät
- Seiten-Navigation
- Annotations-Tools:
  - Stift (Farben, Strichstärken)
  - Radiergummi
  - Formen (Rechteck, Kreis, Linie)
  - "Notiz"-Annotation mit Zielzeiger
  - Texteingabe per Tastatur
- Apple Pencil Zeichnung
- Zoom-Funktion
- Annotations verschieben/ändern
- Auto-Save beim Verlassen
- Multi-Page PDF Export mit Annotations

### Projektverwaltung
- Projekte erstellen/bearbeiten
- Kunden-/Bauherr-Daten
- Objektadressen
- Dachflächen mit Messungen
- Fotos mit Annotations
- Skizzen
- Checklisten

## Architektur
```
/frontend/
  ├── app/
  │   ├── documents/
  │   │   └── view.tsx          # PDF Annotations Editor
  │   ├── projects/
  │   │   └── [id].tsx          # Projektdetails
  │   └── _layout.tsx
  └── services/
      └── DocumentService.ts    # AsyncStorage Persistenz
```

## Was wurde implementiert (Dezember 2025)

### Session 1-4: PDF Annotation Feature
- Multi-Page Annotation Save Bug behoben
- Multi-Page PDF Export implementiert (captureRef Methode)
- "Notiz"-Annotation redesigned (Post-it Style)
- Annotations editierbar (verschieben, löschen, Text bearbeiten)
- PDF-Sharing von Vorschau vereinfacht
- iPad Header UI-Glitch behoben (SafeAreaView)

### Session 5: Bug Fix
- **Festgehängter PDF-Lader**: Loader wird jetzt VOR dem Share-Dialog deaktiviert statt danach, um zu verhindern dass das UI blockiert wenn das Share-Promise nicht richtig resolved

## Offene Aufgaben

### P1 (Hoch)
- [ ] Text-Annotationen in der Größe veränderbar machen

### P2 (Mittel)
- [ ] Texteingabefeld verschiebbar machen (Tastatur-Überlappung)
- [ ] Neuer TestFlight Build

### P3 (Niedrig)
- [ ] Pro/Base Version mit In-App-Käufen
- [ ] Preisberechnung basierend auf Messungen

### P4 (Backlog)
- [ ] iCloud Sync
- [ ] Gestrichelte Linien in PDF-Vorschau beheben

## Technische Details

### Key Patterns
- `useRef` für synchrones State-Management (pageAnnotationsRef)
- `captureRef` für Seiten-Rendering zu Bildern
- Share-Dialog VOR finally-Block beenden um blockierte UI zu vermeiden

### Dependencies
- expo-print, expo-sharing, expo-file-system
- react-native-svg, react-native-view-shot
- @react-native-async-storage/async-storage

## Sprache
Alle Benutzerkommunikation auf **Deutsch**.

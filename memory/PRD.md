# AufmassProfi Dach - Produktanforderungen

## Originales Problem
Entwicklung einer umfassenden iOS/iPad-Anwendung für das Management von Dachdeckerprojekten, mit Fokus auf Checklisten-Templates und PDF-Dokumenten-Annotation.

## Kernfunktionen

### Flächen-Kalkulator (AKTIV IN ENTWICKLUNG)
- Haupt- und Abzugspolygone zeichnen
- Netto-Flächenberechnung mit Polygon-Clipping
- "Schnitt" (Snipping) Tool für Schnittpunkte
- Snapping zu Gittern, Ecken, Kanten
- Maßstab-Kalibrierung
- Hilfslinien mit Parallelfunktion
- Numpad für manuelle Maßeingabe (Geometrie ODER Label)
- **NEU (Dezember 2025)**: Annotations-Tools aus PDF-Editor übernommen:
  - Textanmerkungen (frei platzierbar, farbwählbar)
  - Notiz-Memo mit Zeiger auf Zielpunkt
  - Formen: Rechteck, Pfeil
- **NEU (Dezember 2025)**: Manuelle Flächenberechnung:
  - Umschalter "Auto/Manuell" in Toolbar
  - Bei "Manuell": Fläche wird anhand der manuell eingegebenen Maße skaliert
  - Visuelle Kennzeichnung: Orange Rahmen + 📐 Icon + "(manuell)" Text
  - StatusBar zeigt auch den Berechnungsmodus an

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
- Objektadressen (NEU: mit gespeicherten Adressen)
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
- **NEU**: Projekt-Adressen verwalten (hinzufügen, bearbeiten, löschen)

### Projekt-Adressverwaltung (ABGESCHLOSSEN - März 2026)
- Kunden können mehrere Projektadressen speichern
- Adressen in der Kundenliste verwalten (oranges Haus-Symbol mit Badge)
- Bei neuem Projekt: gespeicherte Adresse auswählen oder manuell eingeben
- **NEU**: Neue manuelle Adressen werden automatisch beim Kunden gespeichert (mit Dialog)
- **NEU**: Aufmaß-Button bei jeder Objektadresse (öffnet Projekt oder erstellt neues)
- Felder: Bezeichnung, Straße, PLZ, Ort
- Objektadresse wird auf Projektdetailseite angezeigt (mit Adressname)
- PDF-Export enthält Objektadresse mit Adressname

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
  │   │   ├── index.tsx         # Kundenliste mit Schnell-Projekt & Adressen
  │   │   ├── [id].tsx          # Kunde bearbeiten (mit Handy-Feld)
  │   │   └── new.tsx
  │   ├── documents/
  │   │   └── view.tsx          # PDF Annotations Editor
  │   ├── projects/
  │   │   ├── [id].tsx          # Projektdetails (PDF-Export, Checkliste-Kopieren)
  │   │   └── new.tsx           # Neues Projekt (mit Adressauswahl)
  │   └── index.tsx             # Startseite mit Sortierung
  └── services/
      └── LocalStorage.ts       # AsyncStorage Persistenz (mit saveAll, ProjectAddress)
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

### Session 6: Projekt-Adressverwaltung (NEU)
- **Adress-Modal in Kundenliste**: Oranges Haus-Symbol mit Badge zeigt Anzahl
- **Projektadressen pro Kunde**: Bezeichnung, Straße, PLZ, Ort
- **"Neues Projekt"-Formular erweitert**:
  - Objektadresse-Felder (Straße, PLZ, Ort) immer sichtbar
  - Bei Kunde mit gespeicherten Adressen: Dropdown zur Auswahl
  - Auswahl füllt Felder automatisch aus
  - Manuelle Eingabe überschreibt Auswahl
- **Datenmodell erweitert**: 
  - Customer.projectAddresses[]
  - Project.objekt_street, objekt_plz, objekt_city, objekt_address_name

## Offene Aufgaben

### P0 (Nächste Session - vom User angefragt) ✅ IMPLEMENTIERT
- [x] **Hintergrundbild im Flächen-Kalkulator**: 
  - Bild als Hintergrund einfügen können (aus Galerie oder Kamera)
  - Bearbeitbar wie in Skizzen (Größenanpassung mit Feststellbutton)
  - "Anpassen" Modus zum Verschieben und Skalieren
- [x] **ZOOM-Funktion für Bearbeitungsmodi**:
  - Flächen-Kalkulator: Zoom+/Zoom-/Reset Buttons mit % Anzeige
  - Foto-Annotation: Zoom+/Zoom-/Reset Buttons
  - Skizzen: Zoom+/Zoom-/Reset Buttons

### P1 (Hoch)
- [ ] Zoom auch für Documents/View (PDF Editor) implementieren

### P2 (Mittel)
- [ ] Texteingabefeld im Editor verschiebbar machen
- [ ] Neuer TestFlight Build
- [ ] Skizzen-Vorschau Ausrichtung untersuchen (rechts verschoben, PDF korrekt)

### P3 (Niedrig)
- [ ] Pro/Base Version mit In-App-Käufen
- [ ] Preisberechnung basierend auf Messungen

### P4 (Backlog)
- [ ] iCloud Sync
- [ ] Gestrichelte Linien in PDF-Vorschau beheben

## Was wurde implementiert (Dezember 2025)

### Session: Konditionelle Notizen für Skizzen (ABGESCHLOSSEN - Dezember 2025)
- **Notizen-Feature für Skizzen implementiert**:
  - Neuer "Notizen"-Button in der Toolbar (Dokument-Symbol)
  - Modal für Notizen-Eingabe mit mehrzeiligem Textfeld
  - Grünes Häkchen-Badge wenn Notizen vorhanden
  - Notizen werden beim Speichern und Auto-Save gespeichert
  - Notizen werden beim Laden der Skizze wiederhergestellt
- **PDF-Export angepasst**:
  - Notizen werden nur angezeigt, wenn vorhanden (keine leeren Linien mehr)
  - Notizen erscheinen unter der Skizze mit gelbem Hintergrund
  - Zeilenumbrüche werden korrekt dargestellt
- **Bug-Fixes (Session 2)**:
  - Notes-Feld im Sketch Interface hinzugefügt (projects/[id].tsx) - Fix für fehlende Notes in PDF
  - Fehlende Button-Styles für Notes-Modal hinzugefügt (draw.tsx) - Fix für Button-Text-Umbruch
- **Bug-Fixes (Session 3 - Dezember 2025)**:
  - Button-Text-Umbruch im Notes-Modal behoben: `flex: 1` entfernt, `flexShrink: 0` und `paddingHorizontal: 20` hinzugefügt
  - Buttons zentriert mit `justifyContent: 'center'` im Container
  - PDF-Notizen bereits kompakt inline formatiert (keine Änderung nötig)

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

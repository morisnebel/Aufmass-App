# AUFMASSPROFI DACH - Product Requirements Document

## Original Problem Statement
Eine vollständig offline-fähige iOS-App für Dachdecker zur Erfassung von Aufmaßen, Projekten, Fotos, Skizzen und Checklisten. Die App muss alle Daten lokal auf dem Gerät speichern und ohne Internetverbindung funktionieren.

## Core Requirements
1. Vollständig offline-fähig mit lokaler Datenspeicherung (AsyncStorage)
2. Projekt- und Kundenverwaltung
3. Dachflächen-Erfassung mit Messungen
4. Foto-Dokumentation mit Annotationen
5. Skizzen-Editor
6. Checklisten-Management mit Vorlagen
7. **PDF-Export aller Projektdaten mit Vorschau und Speicher-Optionen**

## Tech Stack
- **Framework**: React Native / Expo SDK 54
- **Navigation**: Expo Router
- **Storage**: AsyncStorage (@react-native-async-storage/async-storage)
- **PDF Generation**: expo-print
- **Build System**: EAS (Expo Application Services)

## Completed Features

### December 2024
- [x] App-Startup-Crash behoben (Splash Screen)
- [x] UI-Verbesserungen (2x2 Dashboard Grid, Keyboard Handling)
- [x] TestFlight Build 2 deployed und vom Benutzer bestätigt
- [x] **PDF-Export Funktion implementiert** (Build 3)
  - Offline PDF-Generierung mit expo-print
  - Alle Projektdaten enthalten (Projekt, Bauherr, Dachflächen, Checklisten, Fotos, Skizzen, Bemerkungen)
  - Professionelles Layout mit Firmenlogo-Unterstützung
  - Direktes Teilen über iOS Share Sheet
  - **NEU: PDF-Vorschau im WebView** - Dokument vor dem Teilen ansehen
  - **NEU: Speichern in Dateien-App** - PDF lokal sichern
  - **NEU: Vollständige Firmendaten im PDF-Header** (Logo, Name, Adresse, Telefon, E-Mail)
  - **NEU: Vollständige Bauherr-Daten** (Name, Straße, PLZ/Ort, Telefon, Mobil, E-Mail)
  - **NEU: Objektadresse** im Projekt-Bereich integriert (Name, Straße, PLZ/Ort)
  - **NEU: "Als Bild teilen"** - Screenshot der Vorschau für WhatsApp/Messenger
- [x] **UI-Verbesserungen für Handy** (Build 3)
  - Kompakteres Layout auf "Neue Skizze erstellen" Seite
  - Horizontales Karten-Design (alle 3 Optionen auf einem Bildschirm)
  - **Globaler Tastatur-Ausblend-Button** - erscheint automatisch wenn Tastatur sichtbar ist
- [x] **Einstellungen verbessert**
  - Felder sind anfangs leer (individuell anpassbar)
  - "Alle Felder leeren" Button zum Zurücksetzen
- [x] **Multi-Foto-Upload** (Build 4)
  - Mehrere Fotos gleichzeitig aus Galerie auswählen
  - Fortschrittsanzeige beim Speichern
- [x] **Projektfotos in Skizzen-Editor** (Build 4 - Dezember 2024)
  - Neue Option "Aus Projektfotos wählen" auf Skizzen-Seite
  - Modal zeigt alle bereits zum Projekt hinzugefügten Fotos
  - Foto auswählen und direkt als Skizzen-Hintergrund verwenden
  - Verbesserter Workflow ohne Suche in Galerie

## Build History
| Version | Build | Status | Änderungen |
|---------|-------|--------|------------|
| 1.0.0   | 1     | Initial | Erste Version |
| 1.0.0   | 2     | TestFlight | Splash Screen Fix, UI Updates |
| 1.0.0   | 3     | TestFlight | PDF-Export mit Vorschau & Speichern, verbessertes Layout |
| 1.0.0   | 4     | TestFlight | Multi-Foto-Upload, "Als Bild teilen" |
| 1.0.0   | 5     | Pending | Projektfotos in Skizzen-Editor |

## Pending Issues (P2)
- [ ] UI-Freeze Bug beim "Neues Projekt" Workflow (nach Kundenanlage)
  - Status: Nicht verifiziert im aktuellen Build
  - Sollte im nächsten Test überprüft werden

## Next Steps
1. **Testen in Expo Go** - Neue "Aus Projektfotos" Funktion testen
2. Wenn alles funktioniert: Neuen Build erstellen
   ```bash
   cd /app/frontend
   eas build --platform ios
   eas submit --platform ios
   ```
3. UI-Freeze Bug in "Neues Projekt" verifizieren

## Files of Reference
- `/app/frontend/app/projects/[id].tsx` - PDF Export mit Vorschau-Modal
- `/app/frontend/app/sketches/new.tsx` - Skizzen-Erstellung mit Projektfotos-Auswahl
- `/app/frontend/app/photos/new.tsx` - Multi-Foto-Upload
- `/app/frontend/services/LocalStorage.ts` - Datenpersistenz
- `/app/frontend/app.json` - App-Konfiguration (buildNumber: 4)
- `/app/frontend/package.json` - Dependencies

## Expo Credentials
- Account: moris_nebel@hotmail.com
- Project ID: 159413b4-c5be-4afa-9038-b6ba91a4ea1c

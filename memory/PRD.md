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
  - **NEU: Objektadresse** separat angezeigt (wenn vorhanden: Name, Straße, PLZ/Ort)
- [x] **UI-Verbesserungen für Handy** (Build 3)
  - Kompakteres Layout auf "Neue Skizze erstellen" Seite
  - Horizontales Karten-Design (alle 3 Optionen auf einem Bildschirm)
  - **Globaler Tastatur-Ausblend-Button** - erscheint automatisch wenn Tastatur sichtbar ist

## Build History
| Version | Build | Status | Änderungen |
|---------|-------|--------|------------|
| 1.0.0   | 1     | Initial | Erste Version |
| 1.0.0   | 2     | TestFlight | Splash Screen Fix, UI Updates |
| 1.0.0   | 3     | Pending | PDF-Export mit Vorschau & Speichern |

## Pending Issues (P2)
- [ ] UI-Freeze Bug beim "Neues Projekt" Workflow (nach Kundenanlage)
  - Status: Nicht verifiziert im aktuellen Build
  - Sollte im nächsten Test überprüft werden

## Next Steps
1. **Neuen Build erstellen und zu TestFlight submiten**
   ```bash
   cd /app/frontend
   eas build --platform ios
   eas submit --platform ios
   ```
   (Expo-Login: moris_nebel@hotmail.com / Miabalu1+)
2. PDF-Export auf echtem Gerät testen (Vorschau, Teilen, Speichern)
3. UI-Freeze Bug verifizieren

## Files of Reference
- `/app/frontend/app/projects/[id].tsx` - PDF Export mit Vorschau-Modal
- `/app/frontend/services/LocalStorage.ts` - Datenpersistenz
- `/app/frontend/app.json` - App-Konfiguration (buildNumber: 3)
- `/app/frontend/package.json` - Dependencies (expo-print hinzugefügt)

## Expo Credentials
- Account: moris_nebel@hotmail.com
- Project ID: 159413b4-c5be-4afa-9038-b6ba91a4ea1c

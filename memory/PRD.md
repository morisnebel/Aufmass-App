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
7. **PDF-Export aller Projektdaten (NEU)**

## Tech Stack
- **Framework**: React Native / Expo SDK 54
- **Navigation**: Expo Router
- **Storage**: AsyncStorage (@react-native-async-storage/async-storage)
- **PDF Generation**: expo-print (NEU hinzugefügt)
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

## Build History
| Version | Build | Status | Änderungen |
|---------|-------|--------|------------|
| 1.0.0   | 1     | Initial | Erste Version |
| 1.0.0   | 2     | TestFlight | Splash Screen Fix, UI Updates |
| 1.0.0   | 3     | Pending | PDF-Export Feature |

## Pending Issues (P2)
- [ ] UI-Freeze Bug beim "Neues Projekt" Workflow (nach Kundenanlage)
  - Status: Nicht verifiziert im aktuellen Build
  - Sollte im nächsten Test überprüft werden

## Next Steps
1. **Neuen Build erstellen und zu TestFlight submiten**
   - `eas build --platform ios`
   - `eas submit --platform ios`
2. PDF-Export auf echtem Gerät testen
3. UI-Freeze Bug verifizieren

## Files of Reference
- `/app/frontend/app/projects/[id].tsx` - PDF Export Implementierung
- `/app/frontend/services/LocalStorage.ts` - Datenpersistenz
- `/app/frontend/app.json` - App-Konfiguration (buildNumber: 3)
- `/app/frontend/package.json` - Dependencies (expo-print hinzugefügt)

## Expo Credentials
- Account: moris_nebel@hotmail.com
- Project ID: 159413b4-c5be-4afa-9038-b6ba91a4ea1c

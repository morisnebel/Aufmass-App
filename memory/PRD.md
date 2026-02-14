# AufmassProfi Dach - Product Requirements Document

## Original Problem Statement
iOS App für Dachdecker zur Projektverwaltung, ursprünglich mit Backend-Verbindung. Die App wurde auf vollständigen Offline-Betrieb umgestellt, da die TestFlight-Version keine Verbindung zum Entwicklungs-Backend aufbauen konnte.

## User Personas
- Dachdecker-Unternehmen
- Handwerker im Außendienst

## Core Requirements
1. Vollständige Offline-Funktionalität (alle Daten lokal auf dem Gerät)
2. Kunden-, Projekt- und Checklisten-Verwaltung
3. Foto- und Skizzen-Dokumentation
4. iPad-optimierte Benutzeroberfläche

## Architecture
- **Frontend**: React Native / Expo
- **Datenspeicherung**: AsyncStorage (lokal auf dem Gerät)
- **Navigation**: Expo Router

## Key Files
- `/app/frontend/services/LocalStorage.ts` - Zentrale Datenschicht
- `/app/frontend/app/index.tsx` - Dashboard
- `/app/frontend/app/projects/` - Projektverwaltung
- `/app/frontend/app/customers/` - Kundenverwaltung
- `/app/frontend/app/checklists/` - Checklisten

---

## Changelog

### 2025-02-14
- **UI-Verbesserungen:**
  - Dashboard-Buttons von 4-in-einer-Reihe zu 2x2 Grid geändert
  - Größere Buttons mit besserem Padding und größeren Icons
  - Text passt jetzt ohne Umbruch
  - Tastatur-Handling im Checklisten-Modal verbessert (KeyboardAvoidingView + ScrollView)
  - Keyboard-Dismiss durch Tippen außerhalb hinzugefügt

### Vorherige Session
- Vollständige Offline-Refaktorierung abgeschlossen
- Alle axios API-Calls durch LocalStorage ersetzt
- PDF-Export deaktiviert (Server-abhängig)
- Startup-Crash behoben

---

## Prioritized Backlog

### P0 - Kritisch
- (Keine aktuell)

### P1 - Hoch
- [ ] Vollständiger Regressionstest der App
- [ ] UI-Freeze Bug in "Neues Projekt" verifizieren

### P2 - Mittel
- [ ] Production Build erstellen
- [ ] App Store Einreichung

### P3 - Niedrig / Future
- [ ] PDF-Export für Offline-Nutzung neu implementieren

---

## Known Issues
- **UI Freeze bei "Neues Projekt"**: Wiederkehrendes Problem, Status unbekannt nach Offline-Refactor
- **PDF-Export**: Deaktiviert, funktioniert nur mit Server

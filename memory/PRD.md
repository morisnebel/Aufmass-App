# Aufmaß-Profi Dach - Product Requirements Document

## Original Problem Statement
Build a construction surveying app for roof measurements with the following core features:
- Auto-labeling floor plans (S1, S2, etc.)
- Draggable summary legend with position persistence in previews and PDFs
- Measurement tools for construction professionals
- Photo annotation capabilities
- Checklist management with hierarchical structure
- PDF export with comprehensive project documentation

## User Persona
- **Primary Users:** Construction professionals, roofers, surveyors
- **Language:** German (all UI and communications)
- **Platform:** iOS (via Expo/React Native)

## Core Requirements
1. **Floor Plan Drawing:** Polyline-based floor plan sketching with measurements
2. **Photo Management:** Take/upload photos with annotation support
3. **Measurements:** Line segment measurements with totals per floor plan
4. **Checklists:** Hierarchical checklists with categories, items, notes, and measurements
5. **PDF Export:** Comprehensive project documentation with all data

## What's Been Implemented

### Session - December 2025
- ✅ Draggable summary legend with position persistence
- ✅ Legend size increased for better readability
- ✅ Floor plan labels (S1, S2, S3...) at center of polylines
- ✅ **Checklist Grid Layout in PDF** (2-3 columns) - RESTORED
- ✅ **Configurable Checklist Columns** - Users can choose 1, 2, or 3 columns in Settings → PDF-Layout

## Prioritized Backlog

### P0 (Critical)
- None currently

### P1 (High Priority)
- [ ] SVG Generation Refactoring: Extract duplicated code from `draw.tsx` and `[id].tsx` into shared utility
- [ ] New TestFlight Build after verification

### P2 (Medium Priority)
- [ ] Pro/Base Version Split (In-App Purchases)
- [ ] Price Calculation based on measurements

### P3 (Low Priority)
- [ ] iCloud Sync reimplementation

## Technical Architecture

### Frontend Stack
- React Native with Expo
- expo-router for navigation
- react-native-svg for drawing
- @react-native-async-storage/async-storage for local data
- expo-print for PDF generation

### Key Files
- `/app/frontend/app/sketches/draw.tsx` - Main drawing screen with SVG generation
- `/app/frontend/app/projects/[id].tsx` - Project detail screen with PDF generation
- `/app/frontend/services/LocalStorage.ts` - Data persistence layer

### Data Storage
- Local storage via AsyncStorage (no backend database)
- Projects, sketches, photos, checklists stored as JSON

## Known Technical Debt
1. **SVG Generation Duplication:** `generatePreviewSvg` in `draw.tsx` and `generateSvgFromMetadata` in `[id].tsx` contain nearly identical logic. Should be refactored into a shared utility function.

## Testing Notes
- Test account: moris_nebel@hotmail.com / Miabalu1+
- Testing done via Expo Go app on iOS device
- PDF generation must be tested on actual device

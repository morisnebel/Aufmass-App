# AUFMASSPROFI DACH - Product Requirements Document

## Original Problem Statement
Mobile app for roof measurement professionals to document projects, take photos, create sketches, and generate professional PDF reports - all working completely offline with iCloud synchronization across Apple devices.

## Core Requirements
1. **Offline-First Architecture**: All data stored locally using AsyncStorage with iCloud sync
2. **PDF Generation**: Professional reports with company branding, project details, photos, and sketches
3. **Sketch Tool**: Drawing canvas with text, arrows, measurement lines, polylines, and images
4. **Photo Documentation**: Capture and annotate photos with pencil annotations visible in PDF
5. **Checklist Management**: Customizable checklists for roof inspections
6. **iCloud Sync**: Automatic synchronization between iPhone and iPad

## Tech Stack
- **Frontend**: React Native / Expo
- **Storage**: @react-native-async-storage/async-storage + @react-native-cloud-store/core (iCloud)
- **PDF**: expo-print with HTML generation
- **Distribution**: TestFlight (iOS)

## What's Been Implemented

### December 2025 (Latest Session)
- **[NEW] PDF Layout Improvements**
  - Firmenlogo vergrößert (180x130px statt 120x90px)
  - Bleistift-Annotationen auf Fotos werden jetzt im PDF angezeigt (SVG-Overlay)
  - "Skizzen"-Überschrift bleibt mit Skizzen zusammen (kein Orphan-Problem)
  - Fußzeile "Erstellt mit..." ist jetzt besser sichtbar (größer, dunklere Farbe, blaue Linie)
  - Files modified: `frontend/app/projects/[id].tsx`

- **[NEW] iCloud Synchronization** (Build blocked)
  - Core logic implemented using `@react-native-cloud-store/core`
  - New `LocalStorage.ts` service for iCloud-first storage
  - Expo config plugin `withICloud.js` for native entitlements
  - Files added: `frontend/services/LocalStorage.ts`, `frontend/withICloud.js`

### Previous Session (December 2025)
- **[FIXED] PDF Sketch Rendering** - Architectural refactor of SVG generation
  - Changed from manual coordinate/size scaling to viewBox-based approach
  - Text, arrows, and pointers now render with correct proportions in PDFs
  - Files modified: `frontend/app/sketches/draw.tsx`, `frontend/app/projects/[id].tsx`

- **[FIXED] UI Freeze in "New Project" Workflow**
  - Replaced all `setTimeout` calls with `InteractionManager.runAfterInteractions()`
  - State updates now happen immediately instead of delayed
  - Alerts use `requestAnimationFrame` to prevent UI blocking
  - Files modified: `frontend/app/projects/new.tsx`

### Previous Implementation
- Full offline architecture with AsyncStorage
- Project management (CRUD operations)
- Customer management
- Roof measurements with detailed fields
- Photo capture and multi-photo upload
- Sketch editor with multiple tools (pen, shapes, text, arrows, pointers, polylines)
- PDF generation with size options (Small/Medium/Large/Full) for photos and sketches
- Checklist templates
- Company settings for PDF branding
- TestFlight deployment

## Known Issues

### P0 (Critical) - BLOCKED
- **iOS Build fails due to provisioning profile issue**
  - EAS cannot create new provisioning profile in non-interactive mode
  - User must run `npx eas build --platform ios --profile production` locally on their Mac
  - Required for deploying iCloud sync feature

## Prioritized Backlog

### P0 (Critical)
- Guide user to resolve iOS build issue locally

### P1 (High Priority)
- Test iCloud sync feature once build is resolved

### P2 (Medium Priority)
- Final App Store submission - all fixes verified, ready for submission

### P3 (Future/Backlog)
- Performance optimizations for large projects
- Additional checklist templates
- Export to other formats

## File Structure
```
/frontend/
  /app/
    /projects/
      [id].tsx      - Project details, PDF generation
      new.tsx       - New project creation (has UI freeze bug)
    /sketches/
      draw.tsx      - Sketch editor with SVG generation
      new.tsx       - New sketch options
    /photos/
      annotate.tsx  - Photo annotation
      new.tsx       - Photo capture
    /checklists/
    /customers/
    /roofs/
    /settings/
  /services/
    LocalStorage.ts - AsyncStorage service layer
```

## Testing Credentials
- Expo Account: moris_nebel@hotmail.com
- Password: Miabalu1+

## Last Updated
December 2025

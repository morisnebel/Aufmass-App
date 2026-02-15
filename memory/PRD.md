# AUFMASSPROFI DACH - Product Requirements Document

## Original Problem Statement
Mobile app for roof measurement professionals to document projects, take photos, create sketches, and generate professional PDF reports - all working completely offline.

## Core Requirements
1. **Offline-First Architecture**: All data stored locally using AsyncStorage
2. **PDF Generation**: Professional reports with company branding, project details, photos, and sketches
3. **Sketch Tool**: Drawing canvas with text, arrows, measurement lines, polylines, and images
4. **Photo Documentation**: Capture and annotate photos for each project
5. **Checklist Management**: Customizable checklists for roof inspections

## Tech Stack
- **Frontend**: React Native / Expo
- **Storage**: @react-native-async-storage/async-storage
- **PDF**: expo-print with HTML generation
- **Distribution**: TestFlight (iOS)

## What's Been Implemented

### December 2025
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

*No critical issues currently*

## Prioritized Backlog

### P0 (Critical)
- None

### P1 (High Priority)
- None

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

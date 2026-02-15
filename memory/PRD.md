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

### P1: UI Freeze in "New Project" Workflow
- **Location**: `frontend/app/projects/new.tsx`
- **Symptom**: UI becomes unresponsive after saving a new customer during project creation
- **Status**: NOT STARTED
- **Recurrence**: 6+ reports

## Prioritized Backlog

### P0 (Critical)
- None currently

### P1 (High Priority)
- Fix UI freeze bug in `projects/new.tsx`

### P2 (Medium Priority)
- Final App Store submission after all fixes verified

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

# AUFMASSPROFI DACH - Product Requirements Document

## Original Problem Statement
Build a comprehensive roofing project management app with:
- Checklist template management
- A powerful "Flächen-Kalkulator" (Area Calculator) tool integrated within projects
- PDF export with customizable layout

**User's preferred language**: German

## Core Features

### 1. Flächen-Kalkulator (Area Calculator)
- Draw main polygons (total area) and subtraction polygons (openings)
- Scale setting for canvas
- Automatic net area calculation
- Edge length input via angle/length modal
- Line/edge naming with categories
- Total length calculation grouped by category
- Drawing aids: angle snapping, direct length input
- Full shape editability
- Movable Numpad for dimension input
- Annotation tools (shapes, text boxes, memo pointers)
- Pinch-to-zoom and pan
- Background image support
- Live feedback and Undo/Redo

### 2. Voreinstellungen (Presets)
- Line Categories (Linienkategorien) management
- Text Shortcuts (Textkürzel) management
- Bidirectional synchronization between linked categories/shortcuts

### 3. PDF Export
- Drawing with annotations and reference image
- Calculation summary with category colors
- Layout: [Drawing -> Details] per calculation
- **Ink-saving design**: No background colors, only border-left/border-bottom for headers

## Tech Stack
- React Native / Expo
- TypeScript
- Local Storage (@react-native-async-storage/async-storage)
- expo-print for PDF generation

## Key Files
- `/app/frontend/app/calculator/new.tsx` - Main calculator component
- `/app/frontend/app/projects/[id].tsx` - Project detail & PDF export
- `/app/frontend/app/services/LocalStorage.ts` - Data services

## Data Models

### LineCategory
```typescript
interface LineCategory {
  id: string;
  name: string;
  color: string;
  shortcut?: string;
}
```

### TextShortcut
```typescript
interface TextShortcut {
  id: string;
  shortcut: string;
  fullName: string;
  lineCategoryId?: string;
}
```

## Completed Features (December 2025)
- [x] Calculator drawing and polygon management
- [x] Parallel lines modal with embedded Numpad
- [x] Angle/direction input with negative angle support
- [x] Voreinstellungen (Presets) feature with bidirectional sync
- [x] Shortcut display on canvas next to line lengths
- [x] Category formatting as "(Kürzel) Name"
- [x] Category color synchronization in UI and PDF
- [x] PDF layout refactoring: Drawing -> Details flow
- [x] **PDF styling optimization**: Ink-saving design (no background colors)

## Backlog

### P2 - High Priority
- [ ] Create new TestFlight build
- [ ] Pro/Base version split with in-app purchases

### P3 - Medium Priority
- [ ] Price calculation based on areas/lengths

### P4 - Low Priority
- [ ] Re-implement iCloud Sync
- [ ] Fix dashed lines rendering bug in PDF preview

## Known Issues
- Caching issues: If changes not visible, restart Expo server and clear Metro cache
- Visual bug with dashed lines in PDF preview (low priority)

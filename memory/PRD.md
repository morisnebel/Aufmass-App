# AUFMASSPROFI DACH - Product Requirements Document

## Original Problem Statement
Build a comprehensive application for managing roofing projects with:
- Checklist templates management
- A powerful "Flächen-Kalkulator" (Area Calculator) tool
- Photo annotation and management
- PDF export functionality

## User Language
German (Deutsch)

## Core Features

### 1. Area Calculator (Flächen-Kalkulator)
- Draw main polygons (total area) and subtraction polygons (openings)
- Set scale for drawing canvas
- Calculate and display net area
- Line/edge management with categories
- Angle snapping and direct length input
- Movable numpad for dimension input
- Annotation tools (shapes, text boxes, memo pointers)
- Pinch-to-zoom and pan
- Background image support
- Undo/Redo functionality

### 2. Photo Management
- Add photos to projects
- Photo annotation with drawing tools
- Save photos to device gallery (via Share in Expo Go, direct in production)
- Multi-select mode for batch operations

### 3. PDF Export
- Project documentation export
- Customizable layout
- Compact, ink-friendly headers and summary boxes
- Include drawings, annotations, and reference images

### 4. Checklist Management
- Create and manage checklist templates
- Template logos and category logos
- Sub-items with images

## Tech Stack
- **Frontend**: React Native / Expo
- **Storage**: AsyncStorage (local)
- **PDF**: expo-print
- **File System**: expo-file-system, expo-media-library
- **Navigation**: expo-router

## What's Been Implemented

### Session: March 9, 2026
- ✅ Implemented manual Zoom-Toggle Button ("Zoom an/aus") in der Toolbar
  - Grün = Zoom-Modus aktiv (pinch-to-zoom und pan funktionieren)
  - Rot = Zoom aus (Zeichnen/Bearbeiten aktiv)
- ✅ Automatische Umschaltung: Bei Auswahl eines Zeichenwerkzeugs wird Zoom automatisch deaktiviert
- ✅ 100%-Button repariert: Setzt Zoom-Level und Position korrekt zurück
- ✅ ScrollView korrekt an zoomMode gebunden (scrollEnabled und pinchGestureEnabled)

### Session: March 8, 2026
- ✅ Fixed Expo development environment (EXPO_TOKEN authentication)
- ✅ Implemented "Save to Gallery" feature with Share fallback for Expo Go
- ✅ Photo annotation zoom/pan overhaul with ScrollView
- ✅ Toolbar redesign with custom SVG icons
- ✅ Calculator modal implementation
- ✅ PDF export styling refinements
- ✅ UI reorganization (header buttons, navigation tabs)

## Known Limitations
- **Expo Go**: FileSystem directories (documentDirectory, cacheDirectory) are null
  - Workaround: Use Share sheet to save images
  - Resolution: Works properly in TestFlight/production builds

## Prioritized Backlog

### P0 (Critical) - None currently

### P1 (High Priority) - None currently

### P2 (Medium Priority)
- Create new TestFlight build
- Implement Pro/Base version split with in-app purchases

### P3 (Lower Priority)
- Price calculation feature based on areas/lengths

### P4 (Backlog)
- Re-implement iCloud Sync
- Fix dashed lines rendering in PDF preview

## Key Files
- `/app/frontend/app/sketches/draw.tsx` - Hauptdatei für Skizzen-Tool mit Zoom-Toggle, Zeichenwerkzeugen und Toolbar
- `/app/frontend/app/calculator/new.tsx` - Calculator with toolbar and modal
- `/app/frontend/app/projects/[id].tsx` - Project details with photo management
- `/app/frontend/app/photos/annotate.tsx` - Photo annotation with zoom/draw
- `/app/frontend/app/_layout.tsx` - Navigation layout configuration

## Environment Configuration
- **EXPO_TOKEN**: Required for Expo Go tunnel authentication
- **EXPO_TUNNEL_SUBDOMAIN**: polygon-area
- **Preview URL**: https://draw-measure-preview.preview.emergentagent.com

## Testing Notes
- Use Expo Go with `exp://polygon-area.preview.emergentagent.com`
- Photo gallery save requires Share sheet in Expo Go
- Full functionality available in TestFlight builds

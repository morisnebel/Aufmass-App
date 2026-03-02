# AufmassProfi - Product Requirements Document

## Original Problem Statement
Build a comprehensive application for managing roofing projects. The application includes:
- Project and customer management
- Checklist templates for inspections
- PDF document import and annotation with Apple Pencil support
- Photo annotation capabilities
- Roof measurements and calculations

## Core Requirements

### PDF Annotation Feature (Primary Focus)
- Import PDF documents from device storage
- Display PDFs page by page with navigation
- Annotation tools:
  - Pen with selectable colors and stroke widths
  - Eraser
  - Basic shapes (rectangle, circle, line, arrow)
  - "Memo arrow" tool with text box
  - Text input via keyboard
- Drawing with Apple Pencil support
- Toggleable zoom/pan function
- Move and resize annotations (shapes, text, arrows)
- Page-specific annotation storage
- Auto-save on editor exit
- Export/print annotated PDF with all pages

## What's Been Implemented

### December 2025
- **PDF Annotation Editor**: Full-featured annotation screen using Modal + Flexbox + calculated height layout
- **Drawing Tools**: Pen, highlighter, eraser with color/stroke selection
- **Shape Tools**: Rectangle, circle, line, arrow, memo pointer
- **Text Annotations**: Text input with font size options
- **Select/Move Mode**: Drag and resize shapes
- **Page Navigation**: Side arrows for page switching
- **Zoom Toggle**: Pan and zoom functionality
- **Page-Specific Annotations**: Annotations stored per page, not globally
- **Auto-Save**: Annotations saved automatically on editor exit
- **Multi-Page PDF Export**: Print/share all pages with annotations as PDF (NEW)

### Key Technical Decisions
- **Layout Solution**: Modal + Flexbox with explicitly calculated canvas height (solved recurring half-screen bug)
- **State Management**: `useRef` for synchronous annotation storage (fixed race conditions during page changes)
- **Export Method**: WebView-based rendering with PDF.js + Canvas for annotation overlay

## Data Model

### Document Storage (AsyncStorage)
```typescript
interface Document {
  id: string;
  project_id: string;
  name: string;
  originalPdfData?: string; // Base64 PDF
  pages: DocumentPage[];
  created_at: string;
  updated_at: string;
}

interface DocumentPage {
  pageNumber: number;
  imageData: string;
  annotations?: string; // JSON: { paths: [], shapes: [], texts: [] }
}
```

## File Structure
```
/frontend/
├── app/
│   ├── documents/
│   │   └── view.tsx          # Main annotation editor (CRITICAL)
│   ├── projects/
│   │   └── [id].tsx
│   └── _layout.tsx
└── services/
    └── LocalStorage.ts       # Document storage service
```

## Pending Tasks

### P1 - High Priority
- [ ] Improve memo arrow design (currently unprofessional)
- [ ] Enable resize functionality for text annotations

### P2 - Medium Priority
- [ ] Make text input field movable (avoid keyboard obstruction)
- [ ] New TestFlight build for testing

### P3 - Future
- [ ] Pro/Base version split with in-app purchases
- [ ] Price calculation based on measurements
- [ ] iCloud sync reimplementation
- [ ] Fix dashed lines in PDF preview (visual bug)

## Known Issues
- Dashed lines appear in PDF preview (low priority visual bug)

## Technical Constraints
- DO NOT modify the layout structure in view.tsx (Modal + Flexbox + calculated height)
- Use `pageAnnotationsRef` for annotation state to avoid async race conditions
- User communication must be in German

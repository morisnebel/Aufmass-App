import React from 'react';
import { Animated } from 'react-native';
import { DrawElement, FontFamily, FONT_FAMILIES, DrawMode } from '../sketchShared';


export type DeleteSelectedElementImplCtx = {
  selectedElementId: string | null;
  getAngleGroupBaseId: (elementId: string) => string | null;
  getAngleGroupElementIds: (baseId: string) => string[];
  elements: DrawElement[];
  addToHistory: (newElements: DrawElement[]) => void;
  lineSegmentMeasurements: { [key: string]: { [segmentIndex: number]: string; }; };
  setLineSegmentMeasurements: React.Dispatch<React.SetStateAction<{ [key: string]: { [segmentIndex: number]: string; }; }>>;
  setSelectedElementId: React.Dispatch<React.SetStateAction<string | null>>;
  setMovingGroupBaseId: React.Dispatch<React.SetStateAction<string | null>>;
  setOriginalGroupElements: React.Dispatch<React.SetStateAction<DrawElement[]>>;
  setShowDeleteConfirm: React.Dispatch<React.SetStateAction<boolean>>;
};

export function deleteSelectedElementImpl(ctx: DeleteSelectedElementImplCtx) {
  const {
    selectedElementId, getAngleGroupBaseId, getAngleGroupElementIds, elements, addToHistory,
    lineSegmentMeasurements, setLineSegmentMeasurements, setSelectedElementId, setMovingGroupBaseId,
    setOriginalGroupElements, setShowDeleteConfirm,
  } = ctx;
  if (selectedElementId) {
    // Prüfe ob das Element Teil einer Winkel-Gruppe ist
    const baseId = getAngleGroupBaseId(selectedElementId);
    
    let newElements: DrawElement[];
    let idsToDelete: string[];
    
    if (baseId) {
      // Es ist ein Winkel-Element - lösche die ganze Gruppe
      idsToDelete = getAngleGroupElementIds(baseId);
      newElements = elements.filter(el => !idsToDelete.includes(el.id));
    } else {
      // Normales Element - nur dieses löschen
      idsToDelete = [selectedElementId];
      newElements = elements.filter(el => el.id !== selectedElementId);
    }
    
    addToHistory(newElements);
    
    // Auch die Maße für diese Elemente löschen
    idsToDelete.forEach(id => {
      if (lineSegmentMeasurements[id]) {
        setLineSegmentMeasurements(prev => {
          const newMeasurements = { ...prev };
          delete newMeasurements[id];
          return newMeasurements;
        });
      }
    });
    
    setSelectedElementId(null);
    setMovingGroupBaseId(null);
    setOriginalGroupElements([]);
    setShowDeleteConfirm(false);
  }
}



export type FinishPolylineImplCtx = {
  polylinePoints: { x: number; y: number; }[];
  generateId: () => string;
  drawColor: string;
  strokeWidth: number;
  addToHistory: (newElements: DrawElement[]) => void;
  elements: DrawElement[];
  setPolylinePoints: React.Dispatch<React.SetStateAction<{ x: number; y: number; }[]>>;
  polylineControlPosition: Animated.ValueXY;
};

export function finishPolylineImpl(ctx: FinishPolylineImplCtx, closed: boolean = false) {
  const {
    polylinePoints, generateId, drawColor, strokeWidth, addToHistory, elements, setPolylinePoints,
    polylineControlPosition,
  } = ctx;
  if (polylinePoints.length >= 2) {
    const newElement: DrawElement = {
      id: generateId(),
      type: 'polyline',
      data: { 
        points: [...polylinePoints],
        closed: closed 
      },
      color: drawColor,
      strokeWidth,
      rotation: 0,
    };
    addToHistory([...elements, newElement]);
  }
  setPolylinePoints([]);
  // Position zurücksetzen
  polylineControlPosition.setValue({ x: 0, y: 0 });
  polylineControlPosition.setOffset({ x: 0, y: 0 });
}



export type AddTextElementImplCtx = {
  textInput: string;
  pendingPosition: { x: number; y: number; } | null;
  generateId: () => string;
  lastTextColor: string;
  lastTextFontSize: number;
  lastTextFontFamily: FontFamily;
  addToHistory: (newElements: DrawElement[]) => void;
  elements: DrawElement[];
  setTextInput: React.Dispatch<React.SetStateAction<string>>;
  setPendingPosition: React.Dispatch<React.SetStateAction<{ x: number; y: number; } | null>>;
  setShowTextModal: React.Dispatch<React.SetStateAction<boolean>>;
};

export function addTextElementImpl(ctx: AddTextElementImplCtx) {
  const {
    textInput, pendingPosition, generateId, lastTextColor, lastTextFontSize, lastTextFontFamily,
    addToHistory, elements, setTextInput, setPendingPosition, setShowTextModal,
  } = ctx;
  if (textInput.trim() && pendingPosition) {
    const newElement: DrawElement = {
      id: generateId(),
      type: 'text',
      data: { text: textInput },
      color: lastTextColor,
      strokeWidth: 0,
      x: pendingPosition.x,
      y: pendingPosition.y,
      rotation: 0,
      fontSize: lastTextFontSize,
      fontWeight: 'bold',
      fontStyle: 'normal',
      fontFamily: FONT_FAMILIES.find(f => f.id === lastTextFontFamily)?.svgFont || 'sans-serif',
    };
    addToHistory([...elements, newElement]);
    setTextInput('');
    setPendingPosition(null);
    setShowTextModal(false);
  }
}



export type AddPointerElementImplCtx = {
  pendingPointer: { x1: number; y1: number; x2: number; y2: number; } | null;
  generateId: () => string;
  pointerText: string;
  editPointerFontSize: number;
  drawColor: string;
  editPointerStrokeWidth: number;
  addToHistory: (newElements: DrawElement[]) => void;
  elements: DrawElement[];
  setPointerText: React.Dispatch<React.SetStateAction<string>>;
  setPendingPointer: React.Dispatch<React.SetStateAction<{ x1: number; y1: number; x2: number; y2: number; } | null>>;
  setShowPointerModal: React.Dispatch<React.SetStateAction<boolean>>;
};

export function addPointerElementImpl(ctx: AddPointerElementImplCtx) {
  const {
    pendingPointer, generateId, pointerText, editPointerFontSize, drawColor, editPointerStrokeWidth,
    addToHistory, elements, setPointerText, setPendingPointer, setShowPointerModal,
  } = ctx;
  if (pendingPointer) {
    const newElement: DrawElement = {
      id: generateId(),
      type: 'pointer',
      data: {
        x1: pendingPointer.x1,
        y1: pendingPointer.y1,
        x2: pendingPointer.x2,
        y2: pendingPointer.y2,
        text: pointerText, // Optional: Notiz-Text
        fontSize: editPointerFontSize,
      },
      color: drawColor,
      strokeWidth: editPointerStrokeWidth, // Gespeicherte Pointer-Strichstärke verwenden
      rotation: 0,
    };
    addToHistory([...elements, newElement]);
    setPointerText('');
    setPendingPointer(null);
    setShowPointerModal(false);
  }
}



export type UpdatePointerElementImplCtx = {
  selectedElementId: string | null;
  elements: DrawElement[];
  pointerText: string;
  editPointerFontSize: number;
  drawColor: string;
  editPointerStrokeWidth: number;
  addToHistory: (newElements: DrawElement[]) => void;
  setPointerText: React.Dispatch<React.SetStateAction<string>>;
  setShowEditPointerModal: React.Dispatch<React.SetStateAction<boolean>>;
};

export function updatePointerElementImpl(ctx: UpdatePointerElementImplCtx) {
  const {
    selectedElementId, elements, pointerText, editPointerFontSize, drawColor, editPointerStrokeWidth,
    addToHistory, setPointerText, setShowEditPointerModal,
  } = ctx;
  if (selectedElementId) {
    const newElements = elements.map(el => {
      if (el.id === selectedElementId && el.type === 'pointer') {
        return {
          ...el,
          data: {
            ...el.data,
            text: pointerText,
            fontSize: editPointerFontSize,
          },
          color: drawColor,
          strokeWidth: editPointerStrokeWidth,
        };
      }
      return el;
    });
    addToHistory(newElements);
    setPointerText('');
    setShowEditPointerModal(false);
  }
}



export type AddMemoElementImplCtx = {
  pendingMemo: { x1: number; y1: number; x2: number; y2: number; } | null;
  generateId: () => string;
  memoText: string;
  editMemoFontSize: number;
  addToHistory: (newElements: DrawElement[]) => void;
  elements: DrawElement[];
  setSelectedElementId: React.Dispatch<React.SetStateAction<string | null>>;
  setDrawMode: React.Dispatch<React.SetStateAction<DrawMode>>;
  setMemoText: React.Dispatch<React.SetStateAction<string>>;
  setPendingMemo: React.Dispatch<React.SetStateAction<{ x1: number; y1: number; x2: number; y2: number; } | null>>;
  setShowMemoModal: React.Dispatch<React.SetStateAction<boolean>>;
};

export function addMemoElementImpl(ctx: AddMemoElementImplCtx) {
  const {
    pendingMemo, generateId, memoText, editMemoFontSize, addToHistory, elements,
    setSelectedElementId, setDrawMode, setMemoText, setPendingMemo, setShowMemoModal,
  } = ctx;
  if (pendingMemo) {
    const newElement: DrawElement = {
      id: generateId(),
      type: 'memo',
      data: {
        x1: pendingMemo.x1, // Ankerpunkt (roter Kreis)
        y1: pendingMemo.y1,
        x2: pendingMemo.x2, // Position des Textlabels
        y2: pendingMemo.y2,
        text: memoText,
        fontSize: editMemoFontSize,
      },
      color: '#E74C3C', // Rot wie im Bild
      strokeWidth: 2,
      rotation: 0,
    };
    addToHistory([...elements, newElement]);
    setSelectedElementId(newElement.id); // Neue Memo auswählen
    setDrawMode('select'); // Zurück zum Auswahl-Modus
    setMemoText('');
    setPendingMemo(null);
    setShowMemoModal(false);
  }
}



export type UpdateMemoElementImplCtx = {
  selectedElementId: string | null;
  elements: DrawElement[];
  memoText: string;
  editMemoFontSize: number;
  drawColor: string;
  addToHistory: (newElements: DrawElement[]) => void;
  setMemoText: React.Dispatch<React.SetStateAction<string>>;
  setShowEditMemoModal: React.Dispatch<React.SetStateAction<boolean>>;
};

export function updateMemoElementImpl(ctx: UpdateMemoElementImplCtx) {
  const {
    selectedElementId, elements, memoText, editMemoFontSize, drawColor, addToHistory, setMemoText,
    setShowEditMemoModal,
  } = ctx;
  if (selectedElementId) {
    const newElements = elements.map(el => {
      if (el.id === selectedElementId && el.type === 'memo') {
        return {
          ...el,
          data: {
            ...el.data,
            text: memoText,
            fontSize: editMemoFontSize,
          },
          color: drawColor,
        };
      }
      return el;
    });
    addToHistory(newElements);
    setMemoText('');
    setShowEditMemoModal(false);
  }
}

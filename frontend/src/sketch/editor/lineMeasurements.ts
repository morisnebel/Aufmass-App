import type { TextInput } from 'react-native';
import React from 'react';
import { DrawElement } from '../sketchShared';


export type UndoLastLineMeasurementImplCtx = {
  lineMeasureHistory: { elementId: string; segmentIndex: number; previous?: string; }[];
  elements: DrawElement[];
  setLineMeasureHistory: React.Dispatch<React.SetStateAction<{ elementId: string; segmentIndex: number; previous?: string; }[]>>;
  setLineSegmentMeasurements: React.Dispatch<React.SetStateAction<{ [key: string]: { [segmentIndex: number]: string; }; }>>;
  setLineMeasurementExpression: React.Dispatch<React.SetStateAction<string>>;
  setSelectedLineSegment: React.Dispatch<React.SetStateAction<{ elementId: string; segmentIndex: number; } | null>>;
  setShowLineMeasurementNumpad: React.Dispatch<React.SetStateAction<boolean>>;
  lineMeasurementInputRef: React.RefObject<TextInput | null>;
};

export function undoLastLineMeasurementImpl(ctx: UndoLastLineMeasurementImplCtx) {
  const {
    lineMeasureHistory, elements, setLineMeasureHistory, setLineSegmentMeasurements,
    setLineMeasurementExpression, setSelectedLineSegment, setShowLineMeasurementNumpad,
    lineMeasurementInputRef,
  } = ctx;
  const last = [...lineMeasureHistory].reverse().find(h => elements.some(e => e.id === h.elementId));
  if (!last) {
    setLineMeasureHistory([]);
    return;
  }
  setLineMeasureHistory(prev => prev.slice(0, prev.lastIndexOf(last)));
  setLineSegmentMeasurements(prev => {
    const segmentMeasures = { ...prev[last.elementId] };
    if (last.previous) segmentMeasures[last.segmentIndex] = last.previous;
    else delete segmentMeasures[last.segmentIndex];
    const next = { ...prev };
    if (Object.keys(segmentMeasures).length === 0) delete next[last.elementId];
    else next[last.elementId] = segmentMeasures;
    return next;
  });
  setLineMeasurementExpression('');
  setSelectedLineSegment({ elementId: last.elementId, segmentIndex: last.segmentIndex });
  setShowLineMeasurementNumpad(true);
  setTimeout(() => lineMeasurementInputRef.current?.focus(), 10);
}



export type AddMeasurementToSelectedLineImplCtx = {
  selectedLineSegment: { elementId: string; segmentIndex: number; } | null;
  setLineSegmentMeasurements: React.Dispatch<React.SetStateAction<{ [key: string]: { [segmentIndex: number]: string; }; }>>;
  setLineMeasureHistory: React.Dispatch<React.SetStateAction<{ elementId: string; segmentIndex: number; previous?: string; }[]>>;
  lineSegmentMeasurements: { [key: string]: { [segmentIndex: number]: string; }; };
  setLineMeasurementExpression: React.Dispatch<React.SetStateAction<string>>;
  lineAutoNext: boolean;
  elements: DrawElement[];
  setSelectedLineSegment: React.Dispatch<React.SetStateAction<{ elementId: string; segmentIndex: number; } | null>>;
  lineMeasurementInputRef: React.RefObject<TextInput | null>;
  setShowLineMeasurementNumpad: React.Dispatch<React.SetStateAction<boolean>>;
};

export function addMeasurementToSelectedLineImpl(ctx: AddMeasurementToSelectedLineImplCtx, expression: string) {
  const {
    selectedLineSegment, setLineSegmentMeasurements,
    setLineMeasureHistory, lineSegmentMeasurements, setLineMeasurementExpression, lineAutoNext,
    elements, setSelectedLineSegment, lineMeasurementInputRef, setShowLineMeasurementNumpad,
  } = ctx;
  if (!selectedLineSegment || !expression.trim()) return;
  
  // Formatiere das Maß (füge 'm' hinzu wenn nur Zahl)
  let formattedMeasurement = expression.trim();
  if (/^[\d.,]+$/.test(formattedMeasurement)) {
    formattedMeasurement = formattedMeasurement.replace('.', ',') + 'm';
  }
  
  setLineSegmentMeasurements(prev => ({
    ...prev,
    [selectedLineSegment.elementId]: {
      ...prev[selectedLineSegment.elementId],
      [selectedLineSegment.segmentIndex]: formattedMeasurement,
    },
  }));
  
  setLineMeasureHistory(prev => [
    ...prev.slice(-49),
    {
      elementId: selectedLineSegment.elementId,
      segmentIndex: selectedLineSegment.segmentIndex,
      previous: lineSegmentMeasurements[selectedLineSegment.elementId]?.[selectedLineSegment.segmentIndex],
    },
  ]);

  // Reset
  setLineMeasurementExpression('');

  // Auf Wunsch: nächste noch unbemaßte Linie desselben Polygons auswählen
  if (lineAutoNext) {
    const el = elements.find(e => e.id === selectedLineSegment.elementId);
    const pointCount = el?.type === 'polyline' ? (el.data?.points?.length || 0) : 0;
    const segmentCount = el?.data?.closed ? pointCount : pointCount - 1;
    const measured = lineSegmentMeasurements[selectedLineSegment.elementId] || {};
    for (let step = 1; step < segmentCount; step++) {
      const candidate = selectedLineSegment.segmentIndex + step;
      if (!el?.data?.closed && candidate >= segmentCount) break;
      const nextIndex = candidate % segmentCount;
      if (!measured[nextIndex]) {
        setSelectedLineSegment({ elementId: selectedLineSegment.elementId, segmentIndex: nextIndex });
        setTimeout(() => lineMeasurementInputRef.current?.focus(), 10);
        return;
      }
    }
  }

  setShowLineMeasurementNumpad(false);
  setSelectedLineSegment(null);
}



export type RemoveMeasurementFromSelectedLineImplCtx = {
  selectedLineSegment: { elementId: string; segmentIndex: number; } | null;
  setLineSegmentMeasurements: React.Dispatch<React.SetStateAction<{ [key: string]: { [segmentIndex: number]: string; }; }>>;
  setSelectedLineSegment: React.Dispatch<React.SetStateAction<{ elementId: string; segmentIndex: number; } | null>>;
};

export function removeMeasurementFromSelectedLineImpl(ctx: RemoveMeasurementFromSelectedLineImplCtx) {
  const {
    selectedLineSegment, setLineSegmentMeasurements, setSelectedLineSegment,
  } = ctx;
  if (!selectedLineSegment) return;
  
  setLineSegmentMeasurements(prev => {
    const newMeasurements = { ...prev };
    if (newMeasurements[selectedLineSegment.elementId]) {
      const segmentMeasures = { ...newMeasurements[selectedLineSegment.elementId] };
      delete segmentMeasures[selectedLineSegment.segmentIndex];
      if (Object.keys(segmentMeasures).length === 0) {
        delete newMeasurements[selectedLineSegment.elementId];
      } else {
        newMeasurements[selectedLineSegment.elementId] = segmentMeasures;
      }
    }
    return newMeasurements;
  });
  
  setSelectedLineSegment(null);
}

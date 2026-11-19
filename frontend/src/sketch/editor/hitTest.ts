import React from 'react';
import { DrawElement } from '../sketchShared';
import { PolygonWalls, hasWallHeights, segmentNumberPositions } from '../wallArea';


export function buildSmoothPathImpl(pts: { x: number; y: number }[]): string {
  const r = (v: number) => Math.round(v * 10) / 10;
  if (pts.length === 0) return '';
  if (pts.length < 3) {
    let d = `M ${r(pts[0].x)} ${r(pts[0].y)}`;
    if (pts.length === 2) d += ` L ${r(pts[1].x)} ${r(pts[1].y)}`;
    return d;
  }
  let d = `M ${r(pts[0].x)} ${r(pts[0].y)}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i].x + pts[i + 1].x) / 2;
    const my = (pts[i].y + pts[i + 1].y) / 2;
    d += ` Q ${r(pts[i].x)} ${r(pts[i].y)} ${r(mx)} ${r(my)}`;
  }
  const last = pts[pts.length - 1];
  d += ` L ${r(last.x)} ${r(last.y)}`;
  return d;
}



export type FindNearestPolylinePointImplCtx = {
  scale: number;
  elements: DrawElement[];
};

export function findNearestPolylinePointImpl(ctx: FindNearestPolylinePointImplCtx, x: number, y: number): { element: DrawElement; pointIndex: number } | null {
  const {
    scale, elements,
  } = ctx;
  const tolerance = Math.max(18, 28 / Math.max(scale, 0.5));
  let best: { element: DrawElement; pointIndex: number; distance: number } | null = null;
  for (const el of elements) {
    if (el.type !== 'polyline' || !el.data?.points) continue;
    el.data.points.forEach((pt: { x: number; y: number }, pointIndex: number) => {
      const distance = Math.hypot(pt.x - x, pt.y - y);
      if (distance <= tolerance && (!best || distance < best.distance)) best = { element: el, pointIndex, distance };
    });
  }
  return best;
}



export type FindLineNumberAtPointImplCtx = {
  lineNumbersVisible: boolean;
  scale: number;
  elements: DrawElement[];
  selectedLineSegment: { elementId: string; segmentIndex: number; } | null;
  polygonWalls: PolygonWalls;
};

export function findLineNumberAtPointImpl(ctx: FindLineNumberAtPointImplCtx, x: number, y: number): { element: DrawElement; segmentIndex: number } | null {
  const {
    lineNumbersVisible, scale, elements, selectedLineSegment, polygonWalls,
  } = ctx;
  if (!lineNumbersVisible) return null;
  const numberScale = Math.max(scale, 0.5);
  const hitRadius = Math.max(10, 14 / numberScale);
  for (let i = elements.length - 1; i >= 0; i--) {
    const el = elements[i];
    if (el.type !== 'polyline' || !el.data?.points || el.data.points.length < 2) continue;
    if (selectedLineSegment?.elementId !== el.id && !hasWallHeights(polygonWalls[el.id])) continue;
    const hit = segmentNumberPositions(el.data.points, !!el.data.closed, Math.max(8, 16 / numberScale))
      .find(n => Math.hypot(n.x - x, n.y - y) <= hitRadius);
    if (hit) return { element: el, segmentIndex: hit.line - 1 };
  }
  return null;
}



export type GetCropHandleAtPositionImplCtx = {
  cropBoxRef: React.RefObject<{ x: number; y: number; width: number; height: number; }>;
};

export function getCropHandleAtPositionImpl(ctx: GetCropHandleAtPositionImplCtx, x: number, y: number): string | null {
  const {
    cropBoxRef,
  } = ctx;
  const handleSize = 35; // Größerer Touch-Bereich für bessere Bedienbarkeit
  const box = cropBoxRef.current; // Verwende Ref für aktuellen Wert
  
  // Prüfe Ecken
  if (Math.abs(x - box.x) < handleSize && Math.abs(y - box.y) < handleSize) {
    return 'top-left';
  }
  if (Math.abs(x - (box.x + box.width)) < handleSize && Math.abs(y - box.y) < handleSize) {
    return 'top-right';
  }
  if (Math.abs(x - box.x) < handleSize && Math.abs(y - (box.y + box.height)) < handleSize) {
    return 'bottom-left';
  }
  if (Math.abs(x - (box.x + box.width)) < handleSize && Math.abs(y - (box.y + box.height)) < handleSize) {
    return 'bottom-right';
  }
  // Prüfe ob innerhalb der Box (zum Verschieben)
  if (x > box.x && x < box.x + box.width && y > box.y && y < box.y + box.height) {
    return 'move';
  }
  return null;
}



export function getClosestPointOnSegmentImpl(px: number, py: number, x1: number, y1: number, x2: number, y2: number) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  
  if (lenSq === 0) return { x: x1, y: y1 };
  
  let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  
  return {
    x: x1 + t * dx,
    y: y1 + t * dy
  };
}



export type FindPolylineLabelAtPointImplCtx = {
  getPolylineElementsWithMeasurements: () => DrawElement[];
  labelOffsets: { [elementId: string]: { x: number; y: number; }; };
};

export function findPolylineLabelAtPointImpl(ctx: FindPolylineLabelAtPointImplCtx, x: number, y: number): { elementId: string; centerX: number; centerY: number } | null {
  const {
    getPolylineElementsWithMeasurements, labelOffsets,
  } = ctx;
  // Durchsuche alle Polylines mit Maßen
  const polylinesWithMeasurements = getPolylineElementsWithMeasurements();
  
  for (const element of polylinesWithMeasurements) {
    const points = element.data?.points;
    if (!points || points.length < 2) continue;
    
    // Berechne Zentrum des Grundrisses
    const sumX = points.reduce((acc: number, pt: { x: number; y: number }) => acc + pt.x, 0);
    const sumY = points.reduce((acc: number, pt: { x: number; y: number }) => acc + pt.y, 0);
    const centerX = sumX / points.length;
    const centerY = sumY / points.length;
    
    // Label-Offset aus State holen
    const offset = labelOffsets[element.id] || { x: 0, y: 0 };
    const labelX = centerX + offset.x;
    const labelY = centerY + offset.y;
    
    // Prüfe ob der Punkt im Label-Bereich liegt (Radius 12 + 10 Toleranz)
    const labelRadius = 22;
    const distance = Math.sqrt(Math.pow(x - labelX, 2) + Math.pow(y - labelY, 2));
    
    if (distance <= labelRadius) {
      return { elementId: element.id, centerX, centerY };
    }
  }
  
  return null;
}



export type FindElementAtPointImplCtx = {
  elements: DrawElement[];
  distanceToLineSegment: (px: number, py: number, x1: number, y1: number, x2: number, y2: number) => number;
  scale: number;
};

export function findElementAtPointImpl(ctx: FindElementAtPointImplCtx, x: number, y: number, onlyImages: boolean = false): DrawElement | null {
  const {
    elements, distanceToLineSegment, scale,
  } = ctx;
  // Check in reverse order (top elements first)
  for (let i = elements.length - 1; i >= 0; i--) {
    const el = elements[i];
    
    // Im Foto-Modus nur Bilder auswählen, im normalen Modus Bilder ignorieren
    if (onlyImages && el.type !== 'image') continue;
    if (!onlyImages && el.type === 'image') continue;
    
    if (el.type === 'circle') {
      const dist = Math.sqrt(Math.pow(x - el.data.cx, 2) + Math.pow(y - el.data.cy, 2));
      if (dist <= el.data.r + 10) return el;
    } else if (el.type === 'rect') {
      if (x >= el.data.x - 10 && x <= el.data.x + el.data.width + 10 &&
          y >= el.data.y - 10 && y <= el.data.y + el.data.height + 10) {
        return el;
      }
    } else if (el.type === 'line' || el.type === 'arrow' || el.type === 'pointer') {
      const dist = distanceToLineSegment(x, y, el.data.x1, el.data.y1, el.data.x2, el.data.y2);
      if (dist < 15) return el;
      // Pointer (Notiz-Pfeil): Text-Label ebenfalls antippbar machen (wie bei Memo)
      if (el.type === 'pointer' && el.data.text) {
        const fs = el.data.fontSize || 16;
        const sf = fs / 16;
        const padX = 5 * sf;
        const padY = 8 * sf;
        const ang = Math.atan2(el.data.y2 - el.data.y1, el.data.x2 - el.data.x1);
        const tx = el.data.x1 + 15 * Math.cos(ang - Math.PI / 2);
        const ty = el.data.y1 + 15 * Math.sin(ang - Math.PI / 2);
        const w = el.data.text.length * fs * 0.6 + 2 * padX;
        const h = fs + padY;
        if (x >= tx - padX - 10 && x <= tx - padX + w + 10 &&
            y >= ty - fs - 10 && y <= ty - fs + h + 10) {
          return el;
        }
      }
    } else if (el.type === 'text') {
      const elX = el.x || 0;
      const elY = el.y || 0;
      // Berechne Textbreite basierend auf Textlänge und Schriftgröße
      const fontSize = el.fontSize || 20;
      const textLength = el.data?.text?.length || 10;
      const elW = el.width || Math.max(textLength * fontSize * 0.6, 50); // Realistischere Breite
      const elH = fontSize * 1.2; // Höhe basierend auf Schriftgröße
      // Kleineres Padding für präzisere Auswahl (10px)
      const padding = 10;
      // Text sitzt auf der Baseline, also Box nach oben verschieben
      if (x >= elX - padding && x <= elX + elW + padding &&
          y >= elY - elH - padding && y <= elY + padding) {
        return el;
      }
    } else if (el.type === 'image') {
      const elX = el.x || 0;
      const elY = el.y || 0;
      const elW = el.width || 100;
      const elH = el.height || 100;
      if (x >= elX - 10 && x <= elX + elW + 10 &&
          y >= elY - 10 && y <= elY + elH + 10) {
        return el;
      }
    } else if (el.type === 'polyline') {
      // Prüfe ob Punkt nahe einer Polyline-Linie ist
      // Dynamische Toleranz basierend auf Zoom-Level für bessere Auswahl kleiner Polygone
      // Bei scale > 1 (reingezoomt): kleinere Toleranz nötig (Objekte erscheinen größer)
      // Bei scale < 1 (rausgezoomt): größere Toleranz nötig (Objekte erscheinen kleiner)
      const baseTolerance = 30;
      const dynamicTolerance = Math.max(15, baseTolerance / Math.max(scale, 0.5));
      const points = el.data.points;
      if (points && points.length >= 2) {
        for (let j = 0; j < points.length - 1; j++) {
          const dist = distanceToLineSegment(x, y, points[j].x, points[j].y, points[j+1].x, points[j+1].y);
          if (dist < dynamicTolerance) return el;
        }
        // Prüfe auch die schließende Linie wenn geschlossen
        if (el.data.closed && points.length >= 3) {
          const dist = distanceToLineSegment(x, y, points[points.length-1].x, points[points.length-1].y, points[0].x, points[0].y);
          if (dist < dynamicTolerance) return el;
        }
      }
    } else if (el.type === 'path') {
      // Extrahiere Punkte aus dem SVG-Path und prüfe Nähe
      const pathPoints: { x: number; y: number }[] = [];
      const pathRegex = /([ML])\s*(-?\d+\.?\d*)\s+(-?\d+\.?\d*)/g;
      let match;
      while ((match = pathRegex.exec(el.data)) !== null) {
        pathPoints.push({ x: parseFloat(match[2]), y: parseFloat(match[3]) });
      }
      
      // Prüfe ob Punkt nahe einer der Linien ist
      if (pathPoints.length >= 2) {
        for (let j = 0; j < pathPoints.length - 1; j++) {
          const dist = distanceToLineSegment(x, y, pathPoints[j].x, pathPoints[j].y, pathPoints[j+1].x, pathPoints[j+1].y);
          if (dist < 20) return el;
        }
      }
    } else if (el.type === 'polygon') {
      // Extrahiere Punkte aus dem SVG-Path (Polygon ist wie path aber geschlossen)
      const polygonPoints: { x: number; y: number }[] = [];
      const pathRegex = /([ML])\s*(-?\d+\.?\d*)\s+(-?\d+\.?\d*)/g;
      let match;
      while ((match = pathRegex.exec(el.data)) !== null) {
        polygonPoints.push({ x: parseFloat(match[2]), y: parseFloat(match[3]) });
      }
      
      if (polygonPoints.length >= 3) {
        // Zuerst prüfen ob Punkt INNERHALB des Polygons liegt (Ray-Casting Algorithmus)
        let inside = false;
        for (let i = 0, j = polygonPoints.length - 1; i < polygonPoints.length; j = i++) {
          const xi = polygonPoints[i].x, yi = polygonPoints[i].y;
          const xj = polygonPoints[j].x, yj = polygonPoints[j].y;
          
          const intersect = ((yi > y) !== (yj > y)) &&
            (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
          if (intersect) inside = !inside;
        }
        if (inside) return el;
        
        // Dann prüfen ob Punkt nahe einer der Linien ist (für Kanten-Auswahl)
        for (let j = 0; j < polygonPoints.length - 1; j++) {
          const dist = distanceToLineSegment(x, y, polygonPoints[j].x, polygonPoints[j].y, polygonPoints[j+1].x, polygonPoints[j+1].y);
          if (dist < 20) {
            return el;
          }
        }
        // Prüfe auch die schließende Linie (vom letzten zum ersten Punkt)
        const dist = distanceToLineSegment(x, y, polygonPoints[polygonPoints.length-1].x, polygonPoints[polygonPoints.length-1].y, polygonPoints[0].x, polygonPoints[0].y);
        if (dist < 20) {
          return el;
        }
      } else if (polygonPoints.length >= 2) {
        // Weniger als 3 Punkte - nur Linien prüfen
        for (let j = 0; j < polygonPoints.length - 1; j++) {
          const dist = distanceToLineSegment(x, y, polygonPoints[j].x, polygonPoints[j].y, polygonPoints[j+1].x, polygonPoints[j+1].y);
          if (dist < 20) return el;
        }
      }
    } else if (el.type === 'memo') {
      // Memo: Prüfe Ankerpunkt, Linie und Textbox
      const x1 = el.data.x1; // Ankerpunkt
      const y1 = el.data.y1;
      const x2 = el.data.x2; // Textbox Position
      const y2 = el.data.y2;
      const fontSize = el.data.fontSize || 14;
      const text = el.data.text || '';
      const labelWidth = Math.max(60, text.length * fontSize * 0.6 + 20);
      const labelHeight = fontSize + 14;
      
      // Prüfe ob nahe am Ankerpunkt (roter Kreis)
      const distToAnchor = Math.sqrt(Math.pow(x - x1, 2) + Math.pow(y - y1, 2));
      if (distToAnchor <= 15) return el;
      
      // Prüfe ob nahe an der Linie
      const distToLine = distanceToLineSegment(x, y, x1, y1, x2, y2);
      if (distToLine < 15) return el;
      
      // Prüfe ob in der Textbox
      if (x >= x2 - labelWidth/2 - 10 && x <= x2 + labelWidth/2 + 10 &&
          y >= y2 - labelHeight/2 - 10 && y <= y2 + labelHeight/2 + 10) {
        return el;
      }
    }
  }
  return null;
}



export function distanceToLineSegmentImpl(px: number, py: number, x1: number, y1: number, x2: number, y2: number) {
  const A = px - x1;
  const B = py - y1;
  const C = x2 - x1;
  const D = y2 - y1;
  const dot = A * C + B * D;
  const lenSq = C * C + D * D;
  let param = -1;
  if (lenSq !== 0) param = dot / lenSq;
  
  let xx, yy;
  if (param < 0) {
    xx = x1;
    yy = y1;
  } else if (param > 1) {
    xx = x2;
    yy = y2;
  } else {
    xx = x1 + param * C;
    yy = y1 + param * D;
  }
  
  const dx = px - xx;
  const dy = py - yy;
  return Math.sqrt(dx * dx + dy * dy);
}



export type FindPolylineSegmentAtPointImplCtx = {
  scale: number;
  elements: DrawElement[];
  distanceToLineSegment: (px: number, py: number, x1: number, y1: number, x2: number, y2: number) => number;
};

export function findPolylineSegmentAtPointImpl(ctx: FindPolylineSegmentAtPointImplCtx, x: number, y: number): { element: DrawElement; segmentIndex: number } | null {
  const {
    scale, elements, distanceToLineSegment,
  } = ctx;
  // Dynamische Toleranz basierend auf Zoom-Level für bessere Auswahl kleiner Polygone
  // Bei scale > 1 (reingezoomt): kleinere Toleranz nötig (Objekte erscheinen größer)
  // Bei scale < 1 (rausgezoomt): größere Toleranz nötig (Objekte erscheinen kleiner)
  const baseTolerance = 30;
  const dynamicTolerance = Math.max(15, baseTolerance / Math.max(scale, 0.5));
  
  // Finde das NÄCHSTGELEGENE Segment (nicht das erste innerhalb der Toleranz)
  let closestResult: { element: DrawElement; segmentIndex: number; distance: number } | null = null;
  
  for (let i = elements.length - 1; i >= 0; i--) {
    const el = elements[i];
    if (el.type === 'polyline') {
      const points = el.data.points;
      if (points && points.length >= 2) {
        // Prüfe jedes Segment
        for (let j = 0; j < points.length - 1; j++) {
          const dist = distanceToLineSegment(x, y, points[j].x, points[j].y, points[j+1].x, points[j+1].y);
          if (dist < dynamicTolerance && (!closestResult || dist < closestResult.distance)) {
            closestResult = { element: el, segmentIndex: j, distance: dist };
          }
        }
        // WICHTIG: Prüfe auch die schließende Linie wenn geschlossen - mit GLEICHER Priorität!
        if (el.data.closed && points.length >= 3) {
          const dist = distanceToLineSegment(x, y, points[points.length-1].x, points[points.length-1].y, points[0].x, points[0].y);
          if (dist < dynamicTolerance && (!closestResult || dist < closestResult.distance)) {
            closestResult = { element: el, segmentIndex: points.length - 1, distance: dist }; // Index für Schlusslinie
          }
        }
      }
    }
  }
  
  if (closestResult) {
    return { element: closestResult.element, segmentIndex: closestResult.segmentIndex };
  }
  return null;
}



export type CheckTransformHandlesImplCtx = {
  isAngleGroupElement: (elementId: string) => boolean;
};

export function checkTransformHandlesImpl(ctx: CheckTransformHandlesImplCtx, element: DrawElement, x: number, y: number): { type: 'rotate' | 'resize' | 'angle-rotate' | 'angle-adjust', handle: string } | null {
  const {
    isAngleGroupElement,
  } = ctx;
  const handleRadius = 15;
  
  // Winkelgruppen: Keine Endpunkt-Griffe - nur als Ganzes verschieben
  // Bearbeitung über "Winkel anpassen" Button
  if (isAngleGroupElement(element.id)) {
    return null; // Kein spezieller Handle, Standard-Verschiebung wird verwendet
  }
  
  if (element.type === 'rect') {
    const { x: rx, y: ry, width: w, height: h } = element.data;
    const handles = [
      { x: rx, y: ry, handle: 'top-left' },
      { x: rx + w / 2, y: ry, handle: 'top' },
      { x: rx + w, y: ry, handle: 'top-right' },
      { x: rx, y: ry + h / 2, handle: 'left' },
      { x: rx + w, y: ry + h / 2, handle: 'right' },
      { x: rx, y: ry + h, handle: 'bottom-left' },
      { x: rx + w / 2, y: ry + h, handle: 'bottom' },
      { x: rx + w, y: ry + h, handle: 'bottom-right' },
      { x: rx + w / 2, y: ry - 30, handle: 'rotate' },
    ];
    
    for (const h of handles) {
      if (Math.sqrt(Math.pow(x - h.x, 2) + Math.pow(y - h.y, 2)) < handleRadius) {
        return { type: h.handle === 'rotate' ? 'rotate' : 'resize', handle: h.handle };
      }
    }
  } else if (element.type === 'circle') {
    const { cx, cy, r } = element.data;
    if (Math.sqrt(Math.pow(x - (cx + r), 2) + Math.pow(y - cy, 2)) < handleRadius) {
      return { type: 'resize', handle: 'radius' };
    }
    if (Math.sqrt(Math.pow(x - cx, 2) + Math.pow(y - (cy - r - 30), 2)) < handleRadius) {
      return { type: 'rotate', handle: 'rotate' };
    }
  } else if (element.type === 'line' || element.type === 'arrow' || element.type === 'pointer' || element.type === 'memo') {
    const { x1, y1, x2, y2 } = element.data;
    if (Math.sqrt(Math.pow(x - x1, 2) + Math.pow(y - y1, 2)) < handleRadius) {
      return { type: 'resize', handle: 'start' };
    }
    if (Math.sqrt(Math.pow(x - x2, 2) + Math.pow(y - y2, 2)) < handleRadius) {
      return { type: 'resize', handle: 'end' };
    }
    const midX = (x1 + x2) / 2;
    const midY = (y1 + y2) / 2;
    if (Math.sqrt(Math.pow(x - midX, 2) + Math.pow(y - (midY - 30), 2)) < handleRadius) {
      return { type: 'rotate', handle: 'rotate' };
    }
  } else if (element.type === 'image') {
    const elX = element.x || 0;
    const elY = element.y || 0;
    const elW = element.width || 100;
    const elH = element.height || 100;
    
    const handles = [
      { x: elX, y: elY, handle: 'top-left' },
      { x: elX + elW, y: elY, handle: 'top-right' },
      { x: elX, y: elY + elH, handle: 'bottom-left' },
      { x: elX + elW, y: elY + elH, handle: 'bottom-right' },
      { x: elX + elW / 2, y: elY - 30, handle: 'rotate' },
    ];
    
    for (const h of handles) {
      if (Math.sqrt(Math.pow(x - h.x, 2) + Math.pow(y - h.y, 2)) < handleRadius) {
        return { type: h.handle === 'rotate' ? 'rotate' : 'resize', handle: h.handle };
      }
    }
  } else if (element.type === 'text') {
    // Text-Element: Handles für Resize und Rotate
    const textX = element.x || 0;
    const textY = element.y || 0;
    const fontSize = element.fontSize || 20;
    const text = element.data?.text || '';
    
    // Berechne Textabmessungen (gleich wie in renderTransformHandles)
    const estimatedWidth = Math.max(text.length * fontSize * 0.6, 40);
    const estimatedHeight = fontSize * 1.2;
    
    const boxX = textX - 5;
    const boxY = textY - estimatedHeight;
    const boxWidth = estimatedWidth + 10;
    const boxHeight = estimatedHeight + 10;
    
    const handles = [
      { x: boxX, y: boxY, handle: 'top-left' },
      { x: boxX + boxWidth, y: boxY, handle: 'top-right' },
      { x: boxX, y: boxY + boxHeight, handle: 'bottom-left' },
      { x: boxX + boxWidth, y: boxY + boxHeight, handle: 'bottom-right' },
      { x: boxX + boxWidth / 2, y: boxY - 30, handle: 'rotate' },
    ];
    
    for (const h of handles) {
      if (Math.sqrt(Math.pow(x - h.x, 2) + Math.pow(y - h.y, 2)) < handleRadius) {
        return { type: h.handle === 'rotate' ? 'rotate' : 'resize', handle: h.handle };
      }
    }
  }
  
  return null;
}

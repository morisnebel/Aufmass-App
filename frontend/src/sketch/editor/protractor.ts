import type { TFunction } from 'i18next';
import React from 'react';
import { Platform } from 'react-native';
import { DrawElement } from '../sketchShared';


export type HandleProtractorDragStartImplCtx = {
  protractorRefEnd: { x: number; y: number; };
  protractorAngleEnd: { x: number; y: number; };
  protractorCenter: { x: number; y: number; };
  canvasLayoutRef: React.RefObject<{ x: number; y: number; width: number; height: number; } | null>;
  setCanvasLayout: React.Dispatch<React.SetStateAction<{ x: number; y: number; width: number; height: number; } | null>>;
  scaleRef: React.RefObject<number>;
  setMagnifierTargetPosition: React.Dispatch<React.SetStateAction<{ x: number; y: number; } | null>>;
  setMagnifierPosition: React.Dispatch<React.SetStateAction<{ x: number; y: number; } | null>>;
  protractorCanvasSnapshot: React.RefObject<string | null>;
  backgroundImage: string | null;
  elements: DrawElement[];
  setMagnifierSnapshot: React.Dispatch<React.SetStateAction<string | null>>;
  setShowMagnifier: React.Dispatch<React.SetStateAction<boolean>>;
  canvasRef: React.RefObject<null>;
  canvasLayout: { x: number; y: number; width: number; height: number; } | null;
  canvasOverhead: 80 | 100 | 120;
  screenWidth: number;
  canvasHeight: number;
  protractorDragRef: React.RefObject<{ isDragging: boolean; startX: number; startY: number; dragHandle: "body" | "ref" | "angle"; initialCenter: { x: number; y: number; }; initialRefEnd: { x: number; y: number; }; initialAngleEnd: { x: number; y: number; }; }>;
};

export function handleProtractorDragStartImpl(ctx: HandleProtractorDragStartImplCtx, e: any) {
  const {
    protractorRefEnd, protractorAngleEnd, protractorCenter, canvasLayoutRef, setCanvasLayout,
    scaleRef, setMagnifierTargetPosition, setMagnifierPosition, protractorCanvasSnapshot,
    backgroundImage, elements, setMagnifierSnapshot, setShowMagnifier, canvasRef, canvasLayout,
    canvasOverhead, screenWidth, canvasHeight, protractorDragRef,
  } = ctx;
  const pageX = e.nativeEvent?.pageX || e.pageX || 0;
  const pageY = e.nativeEvent?.pageY || e.pageY || 0;
  
  // Abstand zu jedem Handle berechnen
  const distRef = Math.sqrt(Math.pow(pageX - protractorRefEnd.x, 2) + Math.pow(pageY - protractorRefEnd.y, 2));
  const distAngle = Math.sqrt(Math.pow(pageX - protractorAngleEnd.x, 2) + Math.pow(pageY - protractorAngleEnd.y, 2));
  const distCenter = Math.sqrt(Math.pow(pageX - protractorCenter.x, 2) + Math.pow(pageY - protractorCenter.y, 2));
  
  const handleRadius = 50; // Touch-Zielgröße
  let dragHandle: 'body' | 'ref' | 'angle' = 'body';
  
  // Endpunkte haben Priorität
  if (distRef < handleRadius && distRef <= distAngle) {
    dragHandle = 'ref';
  } else if (distAngle < handleRadius) {
    dragHandle = 'angle';
  } else if (distCenter < handleRadius * 1.5) {
    dragHandle = 'body'; // Mittelpunkt = ganzer Körper bewegen
  }
  
  // Lupe für Drag aktivieren (auch am Mittelpunkt!)
  if (dragHandle === 'ref' || dragHandle === 'angle' || dragHandle === 'body') {
    const targetPt = dragHandle === 'ref' ? protractorRefEnd 
      : dragHandle === 'angle' ? protractorAngleEnd 
      : protractorCenter;
    
    // Canvas-Position direkt messen für präzise Lupe
    const activateMagnifier = (layout: { x: number; y: number; width: number; height: number }) => {
      canvasLayoutRef.current = layout; // Ref sofort aktualisieren
      setCanvasLayout(layout);
      // Bei Zoom: Lupe muss Canvas-Koordinaten verwenden (Snapshot ist in Canvas-Koordinaten)
      const currentScale = scaleRef.current || 1;
      const canvasTargetX = (targetPt.x - layout.x) / currentScale;
      const canvasTargetY = (targetPt.y - layout.y) / currentScale;
      setMagnifierTargetPosition({ x: canvasTargetX, y: canvasTargetY });
      setMagnifierPosition({ x: targetPt.x, y: targetPt.y });
      // Canvas-Snapshot verwenden (vor Protractor-Overlay aufgenommen)
      // Fallback-Kette: protractorCanvasSnapshot → backgroundImage → Bild-Element → Grid
      const snapshot = protractorCanvasSnapshot.current;
      console.log('Magnifier activation - snapshot:', !!snapshot, 'bgImage:', !!backgroundImage, 'elements with images:', elements.filter(el => el.type === 'image').length);
      if (snapshot) {
        setMagnifierSnapshot(snapshot);
      } else if (backgroundImage) {
        setMagnifierSnapshot(backgroundImage);
      } else {
        // Letzter Fallback: Bild aus Elementen suchen
        const imgEl = elements.find(el => el.type === 'image' && el.data?.uri);
        setMagnifierSnapshot(imgEl?.data?.uri || null);
      }
      setShowMagnifier(true);
    };
    
    // Frisch messen - canvasRef direkt
    if (canvasRef.current && Platform.OS !== 'web' && typeof (canvasRef.current as any).measureInWindow === 'function') {
      (canvasRef.current as any).measureInWindow((x: number, y: number, w: number, h: number) => {
        const freshLayout = { x, y, width: w, height: h };
        setCanvasLayout(freshLayout);
        activateMagnifier(freshLayout);
      });
    } else if (canvasLayout) {
      activateMagnifier(canvasLayout);
    } else {
      activateMagnifier({ x: 0, y: canvasOverhead, width: screenWidth, height: canvasHeight });
    }
  }
  
  protractorDragRef.current = {
    isDragging: true,
    startX: pageX, startY: pageY,
    dragHandle,
    initialCenter: { ...protractorCenter },
    initialRefEnd: { ...protractorRefEnd },
    initialAngleEnd: { ...protractorAngleEnd },
  };
}



export type HandleProtractorDragMoveImplCtx = {
  protractorDragRef: React.RefObject<{ isDragging: boolean; startX: number; startY: number; dragHandle: "body" | "ref" | "angle"; initialCenter: { x: number; y: number; }; initialRefEnd: { x: number; y: number; }; initialAngleEnd: { x: number; y: number; }; }>;
  setProtractorCenter: React.Dispatch<React.SetStateAction<{ x: number; y: number; }>>;
  setProtractorRefEnd: React.Dispatch<React.SetStateAction<{ x: number; y: number; }>>;
  setProtractorAngleEnd: React.Dispatch<React.SetStateAction<{ x: number; y: number; }>>;
  canvasLayoutRef: React.RefObject<{ x: number; y: number; width: number; height: number; } | null>;
  scaleRef: React.RefObject<number>;
  setMagnifierTargetPosition: React.Dispatch<React.SetStateAction<{ x: number; y: number; } | null>>;
  setMagnifierPosition: React.Dispatch<React.SetStateAction<{ x: number; y: number; } | null>>;
};

export function handleProtractorDragMoveImpl(ctx: HandleProtractorDragMoveImplCtx, e: any) {
  const {
    protractorDragRef, setProtractorCenter, setProtractorRefEnd, setProtractorAngleEnd,
    canvasLayoutRef, scaleRef, setMagnifierTargetPosition, setMagnifierPosition,
  } = ctx;
  if (!protractorDragRef.current.isDragging) return;
  const pageX = e.nativeEvent?.pageX || e.pageX || 0;
  const pageY = e.nativeEvent?.pageY || e.pageY || 0;
  const handle = protractorDragRef.current.dragHandle;
  
  // Endpunkte: reduzierte Empfindlichkeit für Präzision
  const sensitivity = handle === 'body' ? 1.0 : 0.5;
  const dx = (pageX - protractorDragRef.current.startX) * sensitivity;
  const dy = (pageY - protractorDragRef.current.startY) * sensitivity;
  
  if (handle === 'body') {
    // Alles verschieben
    const newCenter = { 
      x: protractorDragRef.current.initialCenter.x + dx,
      y: protractorDragRef.current.initialCenter.y + dy,
    };
    setProtractorCenter(newCenter);
    setProtractorRefEnd({
      x: protractorDragRef.current.initialRefEnd.x + dx,
      y: protractorDragRef.current.initialRefEnd.y + dy,
    });
    setProtractorAngleEnd({
      x: protractorDragRef.current.initialAngleEnd.x + dx,
      y: protractorDragRef.current.initialAngleEnd.y + dy,
    });
    // Lupe am Mittelpunkt aktualisieren
    if (canvasLayoutRef.current) {
      const cs = scaleRef.current || 1;
      setMagnifierTargetPosition({ x: (newCenter.x - canvasLayoutRef.current.x) / cs, y: (newCenter.y - canvasLayoutRef.current.y) / cs });
      setMagnifierPosition({ x: newCenter.x, y: newCenter.y });
    }
  } else if (handle === 'ref') {
    const newPos = {
      x: protractorDragRef.current.initialRefEnd.x + dx,
      y: protractorDragRef.current.initialRefEnd.y + dy,
    };
    setProtractorRefEnd(newPos);
    // Lupe aktualisieren
    if (canvasLayoutRef.current) {
      const cs = scaleRef.current || 1;
      setMagnifierTargetPosition({ x: (newPos.x - canvasLayoutRef.current.x) / cs, y: (newPos.y - canvasLayoutRef.current.y) / cs });
      setMagnifierPosition({ x: newPos.x, y: newPos.y });
    }
  } else if (handle === 'angle') {
    const newPos = {
      x: protractorDragRef.current.initialAngleEnd.x + dx,
      y: protractorDragRef.current.initialAngleEnd.y + dy,
    };
    setProtractorAngleEnd(newPos);
    // Lupe aktualisieren
    if (canvasLayoutRef.current) {
      const cs = scaleRef.current || 1;
      setMagnifierTargetPosition({ x: (newPos.x - canvasLayoutRef.current.x) / cs, y: (newPos.y - canvasLayoutRef.current.y) / cs });
      setMagnifierPosition({ x: newPos.x, y: newPos.y });
    }
  }
}



export type AddProtractorToSketchImplCtx = {
  scaleRef: React.RefObject<number>;
  canvasLayoutRef: React.RefObject<{ x: number; y: number; width: number; height: number; } | null>;
  canvasLayout: { x: number; y: number; width: number; height: number; } | null;
  androidViewBox: { x: number; y: number; w: number; h: number; };
  screenWidth: number;
  canvasHeight: number;
  protractorCenter: { x: number; y: number; };
  protractorAngle: number;
  protractorUseComplementary: boolean;
  protractorRefEnd: { x: number; y: number; };
  protractorAngleEnd: { x: number; y: number; };
  protractorDrawSize: number;
  elements: DrawElement[];
  addToHistory: (newElements: DrawElement[]) => void;
  setShowMagnifier: React.Dispatch<React.SetStateAction<boolean>>;
  setMagnifierSnapshot: React.Dispatch<React.SetStateAction<string | null>>;
  setShowProtractor: React.Dispatch<React.SetStateAction<boolean>>;
  protractorInitializedRef: React.RefObject<boolean>;
  showAlert: (title: string, message: string) => void;
  t: TFunction<"translation", undefined>;
};

export function addProtractorToSketchImpl(ctx: AddProtractorToSketchImplCtx) {
  const {
    scaleRef, canvasLayoutRef, canvasLayout, androidViewBox, screenWidth, canvasHeight,
    protractorCenter, protractorAngle, protractorUseComplementary, protractorRefEnd,
    protractorAngleEnd, protractorDrawSize, elements, addToHistory, setShowMagnifier,
    setMagnifierSnapshot, setShowProtractor, protractorInitializedRef, showAlert, t,
  } = ctx;
  // Umrechnung auf Canvas-Koordinaten (berücksichtigt Zoom und Scroll!)
  const currentScale = scaleRef.current || 1;
  const layout = canvasLayoutRef.current || canvasLayout;
  
  let centerX: number;
  let centerY: number;
  
  // Hilfsfunktion: Screen-Koordinaten → Canvas-Koordinaten
  const screenToCanvas = (screenX: number, screenY: number) => {
    if (Platform.OS === 'android' && androidViewBox.w > 0 && androidViewBox.w !== screenWidth) {
      // Android: viewBox-basierte Konvertierung
      const lx = layout ? layout.x : 0;
      const ly = layout ? layout.y : 0;
      return {
        x: androidViewBox.x + ((screenX - lx) / screenWidth) * androidViewBox.w,
        y: androidViewBox.y + ((screenY - ly) / canvasHeight) * androidViewBox.h,
      };
    } else if (layout && currentScale !== 1) {
      // iOS: Gezoomte Ansicht
      // canvasLayout (via measureInWindow) enthält bereits die Scroll-Position!
      // Daher KEIN scrollOffset addieren - nur durch Scale teilen
      return {
        x: (screenX - layout.x) / currentScale,
        y: (screenY - layout.y) / currentScale,
      };
    } else if (layout) {
      // Keine Zoom-Skalierung
      return {
        x: screenX - layout.x,
        y: screenY - layout.y,
      };
    } else {
      // Fallback ohne Layout-Info
      const headerHeight = Platform.OS === 'ios' ? 62 : 24;
      const toolbarHeight = 70;
      const topOffset = headerHeight + toolbarHeight;
      return { x: screenX, y: screenY - topOffset };
    }
  };
  
  const center = screenToCanvas(protractorCenter.x, protractorCenter.y);
  centerX = center.x;
  centerY = center.y;
  
  console.log('addProtractorToSketch - scale:', currentScale, 'layout:', layout ? { x: Math.round(layout.x), y: Math.round(layout.y) } : null, 'screenCenter:', { x: Math.round(protractorCenter.x), y: Math.round(protractorCenter.y) }, 'canvasCenter:', { x: Math.round(centerX), y: Math.round(centerY) });
  
  // Winkel-Anzeige (immer positiv)
  let displayAngle = Math.abs(protractorAngle);
  if (protractorUseComplementary && displayAngle !== 0 && displayAngle !== 180) {
    displayAngle = 180 - displayAngle;
  }
  
  // Berechne Referenzlinien-Richtung und Winkellinie aus den Endpunkten
  const refDx = protractorRefEnd.x - protractorCenter.x;
  const refDy = protractorRefEnd.y - protractorCenter.y;
  const refAngle = Math.atan2(refDy, refDx);
  
  const angleDx = protractorAngleEnd.x - protractorCenter.x;
  const angleDy = protractorAngleEnd.y - protractorCenter.y;
  const angleEndAngle = Math.atan2(angleDy, angleDx);
  
  // Zeichengröße: Bei Zoom skalieren, damit der Winkel proportional zum sichtbaren Bereich bleibt
  const lineLength = protractorDrawSize / currentScale;
  const arcRadius = (protractorDrawSize * 0.6) / currentScale;
  
  // Generiere eindeutige IDs
  const baseId = Date.now().toString(36);
  const newElements: DrawElement[] = [...elements];
  
  // 1. Referenzlinie
  const refEndX = centerX + lineLength * Math.cos(refAngle);
  const refEndY = centerY + lineLength * Math.sin(refAngle);
  newElements.push({
    id: `${baseId}-ref-line`,
    type: 'line',
    data: { x1: centerX, y1: centerY, x2: refEndX, y2: refEndY },
    color: '#2196f3',
    strokeWidth: Math.max(1, 3 / currentScale),
  });
  
  // 2. Winkellinie
  const angleEndX = centerX + lineLength * Math.cos(angleEndAngle);
  const angleEndY = centerY + lineLength * Math.sin(angleEndAngle);
  newElements.push({
    id: `${baseId}-angle-line`,
    type: 'line',
    data: { x1: centerX, y1: centerY, x2: angleEndX, y2: angleEndY },
    color: '#FF5722',
    strokeWidth: Math.max(1, 3 / currentScale),
  });
  
  // 3. Winkelbogen
  const drawAngle = protractorAngle;
  if (drawAngle !== 0) {
    const arcX1 = centerX + arcRadius * Math.cos(refAngle);
    const arcY1 = centerY + arcRadius * Math.sin(refAngle);
    const arcX2 = centerX + arcRadius * Math.cos(angleEndAngle);
    const arcY2 = centerY + arcRadius * Math.sin(angleEndAngle);
    const largeArc = Math.abs(drawAngle) > 180 ? 1 : 0;
    const sweep = drawAngle > 0 ? 1 : 0;
    const arcPath = `M ${arcX1} ${arcY1} A ${arcRadius} ${arcRadius} 0 ${largeArc} ${sweep} ${arcX2} ${arcY2}`;
    newElements.push({
      id: `${baseId}-arc`,
      type: 'path',
      data: arcPath,
      color: '#4caf50',
      strokeWidth: Math.max(1, 3 / currentScale),
    });
  }
  
  // 4. Winkeltext
  const midAngle = (refAngle + angleEndAngle) / 2;
  const textX = centerX + (arcRadius + 15 / currentScale) * Math.cos(midAngle);
  const textY = centerY + (arcRadius + 15 / currentScale) * Math.sin(midAngle);
  newElements.push({
    id: `${baseId}-text`,
    type: 'text',
    data: { text: `${displayAngle}°` },
    color: '#FF5722',
    strokeWidth: 1,
    x: textX,
    y: textY,
    fontSize: Math.max(10, (protractorDrawSize * 0.25) / currentScale),
    fontWeight: 'bold',
  });
  
  addToHistory(newElements);
  
  // Protractor-State komplett aufräumen (verhindert Freeze)
  setShowMagnifier(false);
  setMagnifierSnapshot(null);
  setShowProtractor(false);
  protractorInitializedRef.current = false;
  
  showAlert(t('sketches.angleSnap'), t('sketches.angleAdded', { angle: displayAngle }));
}



export type RecalculateAngleGroupImplCtx = {
  getAngleGroupElementIds: (baseId: string) => string[];
  elements: DrawElement[];
};

export function recalculateAngleGroupImpl(ctx: RecalculateAngleGroupImplCtx, baseId: string, centerX: number, centerY: number, refAngleRad: number, refLength: number, angleOffsetRad: number, anglLineLength: number, isMirrored: boolean): DrawElement[] {
  const {
    getAngleGroupElementIds, elements,
  } = ctx;
  const groupIds = getAngleGroupElementIds(baseId);
  
  // Berechne Endpunkte
  const refEndX = centerX + refLength * Math.cos(refAngleRad);
  const refEndY = centerY + refLength * Math.sin(refAngleRad);
  
  const angleLineRad = refAngleRad + angleOffsetRad;
  const angleEndX = centerX + anglLineLength * Math.cos(angleLineRad);
  const angleEndY = centerY + anglLineLength * Math.sin(angleLineRad);
  
  // Bogenradius = kleinere der beiden Linienlängen * 0.4
  const arcRadius = Math.min(refLength, anglLineLength) * 0.4;
  
  // Bogenpunkte
  const arcStartX = centerX + arcRadius * Math.cos(refAngleRad);
  const arcStartY = centerY + arcRadius * Math.sin(refAngleRad);
  const arcEndX = centerX + arcRadius * Math.cos(angleLineRad);
  const arcEndY = centerY + arcRadius * Math.sin(angleLineRad);
  
  // Arc sweep Berechnung
  const absAngle = Math.abs(angleOffsetRad * 180 / Math.PI);
  const largeArc = absAngle > 180 ? 1 : 0;
  const sweep = angleOffsetRad > 0 ? 1 : 0;
  
  const arcPath = `M ${arcStartX} ${arcStartY} A ${arcRadius} ${arcRadius} 0 ${largeArc} ${sweep} ${arcEndX} ${arcEndY}`;
  
  // Textposition (Mitte des Bogens)
  const textAngleRad = refAngleRad + angleOffsetRad / 2;
  const textDist = arcRadius + 15;
  const textX = centerX + textDist * Math.cos(textAngleRad);
  const textY = centerY + textDist * Math.sin(textAngleRad);
  
  // Winkeltext
  const displayAngle = Math.round(Math.abs(angleOffsetRad * 180 / Math.PI));
  
  return elements.map(el => {
    if (!groupIds.includes(el.id)) return el;
    
    if (el.id === `${baseId}-ref-line`) {
      return { ...el, data: { x1: centerX, y1: centerY, x2: refEndX, y2: refEndY } };
    } else if (el.id === `${baseId}-angle-line`) {
      return { ...el, data: { x1: centerX, y1: centerY, x2: angleEndX, y2: angleEndY } };
    } else if (el.id === `${baseId}-arc`) {
      return { ...el, data: arcPath };
    } else if (el.id === `${baseId}-text`) {
      return { ...el, x: textX, y: textY, data: { text: `${displayAngle}°` } };
    }
    return el;
  });
}



export type GetAngleGroupGeometryImplCtx = {
  elements: DrawElement[];
};

export function getAngleGroupGeometryImpl(ctx: GetAngleGroupGeometryImplCtx, baseId: string, els?: DrawElement[]) {
  const {
    elements,
  } = ctx;
  const sourceElements = els || elements;
  const refLine = sourceElements.find(el => el.id === `${baseId}-ref-line`);
  const angleLine = sourceElements.find(el => el.id === `${baseId}-angle-line`);
  
  if (!refLine || !angleLine) return null;
  
  const cx = refLine.data.x1;
  const cy = refLine.data.y1;
  
  // Referenzlinie Winkel und Länge
  const refDx = refLine.data.x2 - cx;
  const refDy = refLine.data.y2 - cy;
  const refAngleRad = Math.atan2(refDy, refDx);
  const refLength = Math.sqrt(refDx * refDx + refDy * refDy);
  
  // Winkellinie Winkel und Länge
  const anglDx = angleLine.data.x2 - cx;
  const anglDy = angleLine.data.y2 - cy;
  const angleLineRad = Math.atan2(anglDy, anglDx);
  const anglLineLength = Math.sqrt(anglDx * anglDx + anglDy * anglDy);
  
  // Winkelversatz (Differenz zwischen den beiden Linien)
  let angleOffsetRad = angleLineRad - refAngleRad;
  
  return {
    cx, cy,
    refAngleRad, refLength,
    angleLineRad, anglLineLength,
    angleOffsetRad,
  };
}

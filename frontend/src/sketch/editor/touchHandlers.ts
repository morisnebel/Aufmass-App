import type { TFunction } from 'i18next';
import React from 'react';
import { Alert, TextInput, Platform, Animated } from 'react-native';
import { captureRef } from 'react-native-view-shot';
import { deepCloneElement, simplifyPath, DrawElement, FontFamily, FONT_FAMILIES, DrawMode } from '../sketchShared';


export type HandleCropModeTouchImplCtx = {
  findElementAtPoint: (x: number, y: number, onlyImages?: boolean) => DrawElement | null;
  setCropImageUri: React.Dispatch<React.SetStateAction<string | null>>;
  setCropImageId: React.Dispatch<React.SetStateAction<string | null>>;
  getImageSize: (uri: string) => Promise<{ width: number; height: number; }>;
  setCropImageDimensions: React.Dispatch<React.SetStateAction<{ width: number; height: number; }>>;
  setCropBox: React.Dispatch<React.SetStateAction<{ x: number; y: number; width: number; height: number; }>>;
  setShowCropModal: React.Dispatch<React.SetStateAction<boolean>>;
  t: TFunction<"translation", undefined>;
};

export function handleCropModeTouchImpl(ctx: HandleCropModeTouchImplCtx, locationX: number, locationY: number) {
  const {
    findElementAtPoint, setCropImageUri, setCropImageId, getImageSize,     setCropImageDimensions, setCropBox, setShowCropModal, t,
  } = ctx;
  // Suche nach einem Bild an dieser Position (onlyImages = true)
  const clickedImage = findElementAtPoint(locationX, locationY, true);
  
  if (clickedImage && clickedImage.type === 'image' && clickedImage.data?.uri) {
    // Bild gefunden - Crop-Modal öffnen
    setCropImageUri(clickedImage.data.uri);
    setCropImageId(clickedImage.id);
    
    // Lade die Original-Bildgröße
    getImageSize(clickedImage.data.uri).then(
      ({ width: imgWidth, height: imgHeight }) => {
        setCropImageDimensions({ width: imgWidth, height: imgHeight });
        // Initiale Crop-Box = 80% des Bildes, zentriert
        const boxWidth = Math.min(imgWidth * 0.8, 280);
        const boxHeight = Math.min(imgHeight * 0.8, 280);
        setCropBox({
          x: (300 - boxWidth) / 2,
          y: (300 - boxHeight) / 2,
          width: boxWidth,
          height: boxHeight,
        });
        setShowCropModal(true);
      },
      (error) => {
        console.error('Error getting image size:', error);
        // Fallback
        setCropImageDimensions({ width: 300, height: 300 });
        setCropBox({ x: 30, y: 30, width: 240, height: 240 });
        setShowCropModal(true);
      }
    );
  } else {
    // Kein Bild an dieser Position - Hinweis zeigen
    Alert.alert(t('common.note'), t('sketches.tapPhotoToCrop'));
  }
}



export type OnTouchStartImplCtx = {
  showProtractor: boolean;
  handleProtractorDragStart: (e: any) => void;
  zoomMode: boolean;
  androidPinchRef: React.RefObject<{ initialDistance: number; initialScale: number; lastPanX: number; lastPanY: number; isPinching: boolean; numTouches: number; currentScale: number; currentTranslateX: number; currentTranslateY: number; }>;
  androidViewBox: { x: number; y: number; w: number; h: number; };
  screenWidth: number;
  canvasHeight: number;
  drawMode: DrawMode;
  handleSelectTouchStart: (locationX: number, locationY: number) => void;
  handleCropModeTouch: (locationX: number, locationY: number) => void;
  setPendingPosition: React.Dispatch<React.SetStateAction<{ x: number; y: number; } | null>>;
  setShowTextModal: React.Dispatch<React.SetStateAction<boolean>>;
  currentPathRef: React.RefObject<string>;
  currentPenPointsRef: React.RefObject<{ x: number; y: number; }[]>;
  setCurrentPath: React.Dispatch<React.SetStateAction<string>>;
  snapPointToAngle: (newX: number, newY: number) => { x: number; y: number; };
  polylinePoints: { x: number; y: number; }[];
  finishPolyline: (closed?: boolean) => void;
  setPolylinePoints: React.Dispatch<React.SetStateAction<{ x: number; y: number; }[]>>;
  handleAddPointTouch: (x: number, y: number) => void;
  handleRemovePointTouch: (x: number, y: number) => void;
  setStartPoint: React.Dispatch<React.SetStateAction<{ x: number; y: number; } | null>>;
};

export function onTouchStartImpl(ctx: OnTouchStartImplCtx, event: any) {
  const {
    showProtractor, handleProtractorDragStart, zoomMode, androidPinchRef, androidViewBox,
    screenWidth, canvasHeight, drawMode, handleSelectTouchStart, handleCropModeTouch,
    setPendingPosition, setShowTextModal, currentPathRef, currentPenPointsRef, setCurrentPath,
    snapPointToAngle, polylinePoints, finishPolyline, setPolylinePoints, handleAddPointTouch,
    handleRemovePointTouch, setStartPoint,
  } = ctx;
  // Winkelmesser aktiv: Drag-Steuerung übernimmt der Canvas (Overlay empfängt auf Fabric keine Touches)
  if (showProtractor && Platform.OS !== 'web') {
    handleProtractorDragStart(event);
    return;
  }
  // === Android Zoom-Modus ===
  if (Platform.OS === 'android' && zoomMode) {
    const touches = event.nativeEvent.touches;
    if (!touches) return;
    if (touches.length >= 2) {
      // Pinch-Start: Abstand zwischen zwei Fingern berechnen
      const dx = touches[0].pageX - touches[1].pageX;
      const dy = touches[0].pageY - touches[1].pageY;
      androidPinchRef.current.initialDistance = Math.sqrt(dx * dx + dy * dy);
      androidPinchRef.current.initialScale = androidPinchRef.current.currentScale;
      androidPinchRef.current.isPinching = true;
      androidPinchRef.current.numTouches = touches.length;
    } else if (touches.length === 1) {
      // Pan-Start: Startpunkt merken
      androidPinchRef.current.lastPanX = touches[0].pageX;
      androidPinchRef.current.lastPanY = touches[0].pageY;
      androidPinchRef.current.isPinching = false;
      androidPinchRef.current.numTouches = 1;
    }
    return;
  }
  // Im Zoom-Modus keine Zeichnung (iOS → ScrollView handelt)
  if (zoomMode) return;
  
  const touch = event.nativeEvent.touches ? event.nativeEvent.touches[0] : event.nativeEvent;
  // Die locationX/Y sind relativ zum inneren View (Canvas-Container)
  // Bei gezoomter ScrollView (iOS): locationX ist bereits in Canvas-Koordinaten!
  // Bei Android viewBox-Zoom: locationX ist in Screen-Koordinaten und muss konvertiert werden
  let locationX = touch.locationX || touch.pageX;
  let locationY = touch.locationY || touch.pageY;

  // Android: Konvertiere Screen-Koordinaten → Canvas-Koordinaten via viewBox
  if (Platform.OS === 'android' && androidViewBox.w > 0 && androidViewBox.w !== screenWidth) {
    locationX = androidViewBox.x + (locationX / screenWidth) * androidViewBox.w;
    locationY = androidViewBox.y + (locationY / canvasHeight) * androidViewBox.h;
  }

  if (drawMode === 'select') {
    handleSelectTouchStart(locationX, locationY);
  } else if (drawMode === 'crop') {
    // Im Crop-Modus: Suche nach einem Bild an dieser Position
    handleCropModeTouch(locationX, locationY);
  } else if (drawMode === 'text') {
    // Show text input modal
    setPendingPosition({ x: locationX, y: locationY });
    setShowTextModal(true);
  } else if (drawMode === 'pen') {
    // Initialisiere sowohl Ref (für Performance) als auch State (für Rendering)
    const pathStart = `M ${locationX} ${locationY}`;
    currentPathRef.current = pathStart;
    currentPenPointsRef.current = [{ x: locationX, y: locationY }];
    setCurrentPath(pathStart);
  } else if (drawMode === 'polygon') {
    // Start polygon drawing
    setCurrentPath(`M ${locationX} ${locationY}`);
  } else if (drawMode === 'polyline') {
    // Polyline: Füge Punkt hinzu
    const snappedPoint = snapPointToAngle(locationX, locationY);
    const newPoint = { x: snappedPoint.x, y: snappedPoint.y };
    
    // Prüfe ob wir nahe am ersten Punkt sind (schließen)
    if (polylinePoints.length >= 3) {
      const firstPoint = polylinePoints[0];
      const distance = Math.sqrt(
        Math.pow(snappedPoint.x - firstPoint.x, 2) + 
        Math.pow(snappedPoint.y - firstPoint.y, 2)
      );
      
      if (distance < 30) {
        // Schließe die Polyline als geschlossenen Grundriss
        finishPolyline(true);
        return;
      }
    }
    
    setPolylinePoints([...polylinePoints, newPoint]);
  } else if (drawMode === 'addPoint') {
    // addPoint Modus: Punkt zu bestehender Polyline hinzufügen
    handleAddPointTouch(locationX, locationY);
  } else if (drawMode === 'removePoint') {
    // removePoint Modus: Punkt aus bestehender Polyline entfernen
    handleRemovePointTouch(locationX, locationY);
  } else {
    // Other drawing modes
    setStartPoint({ x: locationX, y: locationY });
  }
}



export type HandleAddPointTouchImplCtx = {
  selectedElementId: string | null;
  showAlert: (title: string, message: string) => void;
  t: TFunction<"translation", undefined>;
  elements: DrawElement[];
  addToHistory: (newElements: DrawElement[]) => void;
  distanceToLineSegment: (px: number, py: number, x1: number, y1: number, x2: number, y2: number) => number;
  getClosestPointOnSegment: (px: number, py: number, x1: number, y1: number, x2: number, y2: number) => { x: number; y: number; };
  clearWallSegments: (elementId: string) => void;
  setLineSegmentMeasurements: React.Dispatch<React.SetStateAction<{ [key: string]: { [segmentIndex: number]: string; }; }>>;
};

export function handleAddPointTouchImpl(ctx: HandleAddPointTouchImplCtx, x: number, y: number) {
  const {
    selectedElementId, showAlert, t, elements, addToHistory, distanceToLineSegment,
    getClosestPointOnSegment, clearWallSegments, setLineSegmentMeasurements,
  } = ctx;
  // Zuerst: Prüfe ob eine Polyline ausgewählt ist
  if (!selectedElementId) {
    showAlert(t('common.note'), t('sketches.selectPolylineFirst'));
    return;
  }
  
  const selectedEl = elements.find(el => el.id === selectedElementId);
  if (!selectedEl || selectedEl.type !== 'polyline') {
    showAlert(t('common.note'), t('sketches.selectPolyline'));
    return;
  }
  
  const points = selectedEl.data?.points;
  if (!points || points.length < 2) {
    showAlert(t('common.note'), t('sketches.invalidPolyline'));
    return;
  }
  
  // Prüfe ob Klick nahe einem Endpunkt ist (zum Anhängen)
  const endpointRadius = 40;
  const firstPoint = points[0];
  const lastPoint = points[points.length - 1];
  
  const distToFirst = Math.sqrt(Math.pow(x - firstPoint.x, 2) + Math.pow(y - firstPoint.y, 2));
  const distToLast = Math.sqrt(Math.pow(x - lastPoint.x, 2) + Math.pow(y - lastPoint.y, 2));
  
  // Wenn nahe am ersten Punkt - Punkt am Anfang einfügen
  if (distToFirst < endpointRadius && !selectedEl.data.closed) {
    const newPoints = [{ x, y }, ...points];
    const newElements = elements.map(el => {
      if (el.id === selectedElementId) {
        return { ...el, data: { ...el.data, points: newPoints } };
      }
      return el;
    });
    addToHistory(newElements);
    return;
  }
  
  // Wenn nahe am letzten Punkt - Punkt am Ende anhängen
  if (distToLast < endpointRadius && !selectedEl.data.closed) {
    const newPoints = [...points, { x, y }];
    const newElements = elements.map(el => {
      if (el.id === selectedElementId) {
        return { ...el, data: { ...el.data, points: newPoints } };
      }
      return el;
    });
    addToHistory(newElements);
    return;
  }
  
  // Sonst: Prüfe ob Klick auf einer Kante ist (zum Einfügen)
  let closestSegment = -1;
  let minDist = Infinity;
  let insertPoint = { x, y };
  
  for (let i = 0; i < points.length - 1; i++) {
    const p1 = points[i];
    const p2 = points[i + 1];
    const dist = distanceToLineSegment(x, y, p1.x, p1.y, p2.x, p2.y);
    
    if (dist < minDist && dist < 30) {
      minDist = dist;
      closestSegment = i;
      // Berechne den nächsten Punkt auf dem Segment
      insertPoint = getClosestPointOnSegment(x, y, p1.x, p1.y, p2.x, p2.y);
    }
  }
  
  // Prüfe auch die schließende Kante bei geschlossenen Polylines
  if (selectedEl.data.closed && points.length >= 3) {
    const p1 = points[points.length - 1];
    const p2 = points[0];
    const dist = distanceToLineSegment(x, y, p1.x, p1.y, p2.x, p2.y);
    
    if (dist < minDist && dist < 30) {
      minDist = dist;
      closestSegment = points.length - 1; // Spezialindex für schließende Kante
      insertPoint = getClosestPointOnSegment(x, y, p1.x, p1.y, p2.x, p2.y);
    }
  }
  
  if (closestSegment >= 0) {
    // Punkt auf der Kante einfügen
    let newPoints: { x: number; y: number }[];
    
    if (closestSegment === points.length - 1 && selectedEl.data.closed) {
      // Schließende Kante - füge am Ende ein
      newPoints = [...points, insertPoint];
    } else {
      // Normale Kante - füge nach dem Segment ein
      newPoints = [
        ...points.slice(0, closestSegment + 1),
        insertPoint,
        ...points.slice(closestSegment + 1)
      ];
    }
    
    const newElements = elements.map(el => {
      if (el.id === selectedElementId) {
        return { ...el, data: { ...el.data, points: newPoints } };
      }
      return el;
    });
    addToHistory(newElements);
    
    clearWallSegments(selectedElementId);
    // Bemaßungs-Indizes aktualisieren: Segment wird geteilt → Indizes nach dem Split verschieben
    setLineSegmentMeasurements(prev => {
      const elementMeasurements = prev[selectedElementId];
      if (!elementMeasurements) return prev;
      
      const isClosingSegment = closestSegment === points.length - 1 && selectedEl.data.closed;
      const newMeasurements: { [segmentIndex: number]: string } = {};
      
      for (const [key, value] of Object.entries(elementMeasurements)) {
        const oldIdx = parseInt(key);
        
        if (isClosingSegment) {
          // Schließende Kante geteilt: altes Schließsegment-Maß löschen, Rest bleibt gleich
          if (oldIdx === closestSegment) continue; // Altes Schließsegment-Maß entfernen
          newMeasurements[oldIdx] = value;
        } else if (oldIdx === closestSegment) {
          // Geteiltes Segment: altes Maß löschen (Benutzer muss neue Maße für die 2 neuen Segmente eingeben)
          continue;
        } else if (oldIdx > closestSegment) {
          // Segmente nach dem Split: Index um 1 erhöhen
          newMeasurements[oldIdx + 1] = value;
        } else {
          // Segmente vor dem Split: Index bleibt gleich
          newMeasurements[oldIdx] = value;
        }
      }
      
      if (Object.keys(newMeasurements).length === 0) {
        const newAll = { ...prev };
        delete newAll[selectedElementId];
        return newAll;
      }
      
      return { ...prev, [selectedElementId]: newMeasurements };
    });
  }
}



export type HandleRemovePointTouchImplCtx = {
  selectedElementId: string | null;
  showAlert: (title: string, message: string) => void;
  t: TFunction<"translation", undefined>;
  elements: DrawElement[];
  addToHistory: (newElements: DrawElement[]) => void;
  clearWallSegments: (elementId: string) => void;
  setLineSegmentMeasurements: React.Dispatch<React.SetStateAction<{ [key: string]: { [segmentIndex: number]: string; }; }>>;
};

export function handleRemovePointTouchImpl(ctx: HandleRemovePointTouchImplCtx, x: number, y: number) {
  const {
    selectedElementId, showAlert, t, elements, addToHistory, clearWallSegments,
    setLineSegmentMeasurements,
  } = ctx;
  // Zuerst: Prüfe ob eine Polyline ausgewählt ist
  if (!selectedElementId) {
    showAlert(t('common.note'), t('sketches.selectPolylineFirst'));
    return;
  }
  
  const selectedEl = elements.find(el => el.id === selectedElementId);
  if (!selectedEl || selectedEl.type !== 'polyline') {
    showAlert(t('common.note'), t('sketches.selectPolyline'));
    return;
  }
  
  const points = selectedEl.data?.points;
  if (!points || points.length < 3) {
    showAlert(t('common.note'), t('sketches.polylineMinPoints'));
    return;
  }
  
  // Finde den nächsten Punkt zum Klick
  const pointRadius = 30;
  let closestIndex = -1;
  let minDist = Infinity;
  
  for (let i = 0; i < points.length; i++) {
    const pt = points[i];
    const dist = Math.sqrt(Math.pow(x - pt.x, 2) + Math.pow(y - pt.y, 2));
    if (dist < minDist && dist < pointRadius) {
      minDist = dist;
      closestIndex = i;
    }
  }
  
  if (closestIndex >= 0) {
    // Punkt entfernen
    const newPoints = points.filter((_: { x: number; y: number }, idx: number) => idx !== closestIndex);
    
    const newElements = elements.map(el => {
      if (el.id === selectedElementId) {
        return { ...el, data: { ...el.data, points: newPoints } };
      }
      return el;
    });
    addToHistory(newElements);
    
    clearWallSegments(selectedElementId);
    // Bemaßungen aktualisieren: Gelöschte Segmente entfernen und Indizes neu zuordnen
    setLineSegmentMeasurements(prev => {
      const elementMeasurements = prev[selectedElementId];
      if (!elementMeasurements) return prev;
      
      const isClosed = selectedEl.data?.closed;
      const numPoints = points.length;
      const numSegments = isClosed ? numPoints : numPoints - 1;
      
      // Bestimme betroffene (gelöschte) Segment-Indizes
      const affectedSegments = new Set<number>();
      if (closestIndex > 0) {
        affectedSegments.add(closestIndex - 1); // Segment das am gelöschten Punkt endet
      }
      if (closestIndex < numPoints - 1) {
        affectedSegments.add(closestIndex); // Segment das am gelöschten Punkt startet
      }
      if (isClosed) {
        if (closestIndex === 0) {
          affectedSegments.add(numSegments - 1); // Schließendes Segment endet bei Punkt 0
          affectedSegments.add(0); // Segment startet bei Punkt 0
        }
        if (closestIndex === numPoints - 1) {
          affectedSegments.add(numSegments - 1); // Letztes Segment (schließend)
          affectedSegments.add(closestIndex - 1); // Segment davor
        }
      }
      
      // Neue Bemaßungen mit verschobenen Indizes erstellen
      const newMeasurements: { [segmentIndex: number]: string } = {};
      
      for (const [key, value] of Object.entries(elementMeasurements)) {
        const oldIdx = parseInt(key);
        
        // Betroffene Segmente überspringen (gelöschte Bemaßungen)
        if (affectedSegments.has(oldIdx)) continue;
        
        // Neuen Index berechnen: Segmente nach dem gelöschten Punkt verschieben sich um 1
        let newIdx = oldIdx;
        if (isClosed && closestIndex === 0) {
          // Erster Punkt bei geschlossenem Polygon: alle Indizes um 1 nach unten
          newIdx = oldIdx - 1;
        } else if (oldIdx > closestIndex) {
          // Segmente nach dem gelöschten Punkt: Index um 1 reduzieren
          newIdx = oldIdx - 1;
        }
        
        if (newIdx >= 0) {
          newMeasurements[newIdx] = value;
        }
      }
      
      // Wenn keine Bemaßungen mehr übrig → Element-Eintrag komplett löschen
      if (Object.keys(newMeasurements).length === 0) {
        const newAll = { ...prev };
        delete newAll[selectedElementId];
        return newAll;
      }
      
      return { ...prev, [selectedElementId]: newMeasurements };
    });
  }
}



export type OnTouchMoveImplCtx = {
  showProtractor: boolean;
  handleProtractorDragMove: (e: any) => void;
  zoomMode: boolean;
  androidPinchRef: React.RefObject<{ initialDistance: number; initialScale: number; lastPanX: number; lastPanY: number; isPinching: boolean; numTouches: number; currentScale: number; currentTranslateX: number; currentTranslateY: number; }>;
  androidZoomScale: Animated.Value;
  androidTranslateX: Animated.Value;
  androidTranslateY: Animated.Value;
  androidViewBox: { x: number; y: number; w: number; h: number; };
  screenWidth: number;
  canvasHeight: number;
  drawMode: DrawMode;
  dragMode: "move" | "resize" | "rotate" | null;
  originalElement: DrawElement | null;
  dragStart: { x: number; y: number; } | null;
  handleSelectTouchMove: (locationX: number, locationY: number) => void;
  currentPathRef: React.RefObject<string>;
  currentPenPointsRef: React.RefObject<{ x: number; y: number; }[]>;
  buildSmoothPath: (pts: { x: number; y: number; }[]) => string;
  setCurrentPath: React.Dispatch<React.SetStateAction<string>>;
  draggingLabelId: string | null;
  labelDragStartRef: React.RefObject<{ x: number; y: number; offsetX: number; offsetY: number; }>;
  setLabelOffsets: React.Dispatch<React.SetStateAction<{ [elementId: string]: { x: number; y: number; }; }>>;
  currentPath: string;
  startPoint: { x: number; y: number; } | null;
  createTempElement: (start: { x: number; y: number; }, endX: number, endY: number) => void;
};

export function onTouchMoveImpl(ctx: OnTouchMoveImplCtx, event: any) {
  const {
    showProtractor, handleProtractorDragMove, zoomMode, androidPinchRef, androidZoomScale,
    androidTranslateX, androidTranslateY, androidViewBox, screenWidth, canvasHeight, drawMode,
    dragMode, originalElement, dragStart, handleSelectTouchMove, currentPathRef, currentPenPointsRef,
    buildSmoothPath, setCurrentPath, draggingLabelId, labelDragStartRef, setLabelOffsets,
    currentPath, startPoint, createTempElement,
  } = ctx;
  // Winkelmesser aktiv: Drag-Steuerung übernimmt der Canvas
  if (showProtractor && Platform.OS !== 'web') {
    handleProtractorDragMove(event);
    return;
  }
  // === Android Zoom-Modus ===
  if (Platform.OS === 'android' && zoomMode) {
    const touches = event.nativeEvent.touches;
    if (!touches) return;
    if (touches.length >= 2) {
      // Pinch-Zoom: Neuen Abstand berechnen und Skala anpassen
      const dx = touches[0].pageX - touches[1].pageX;
      const dy = touches[0].pageY - touches[1].pageY;
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (androidPinchRef.current.initialDistance > 0) {
        const ratio = distance / androidPinchRef.current.initialDistance;
        const newScale = Math.max(0.5, Math.min(4, androidPinchRef.current.initialScale * ratio));
        androidPinchRef.current.currentScale = newScale;
        androidZoomScale.setValue(newScale);
      }
      androidPinchRef.current.isPinching = true;
      androidPinchRef.current.numTouches = touches.length;
    } else if (touches.length === 1 && !androidPinchRef.current.isPinching && androidPinchRef.current.currentScale > 1.05) {
      // Pan: Nur bei gezoomtem Canvas und einem Finger (nicht direkt nach Pinch)
      const panDx = touches[0].pageX - androidPinchRef.current.lastPanX;
      const panDy = touches[0].pageY - androidPinchRef.current.lastPanY;
      androidPinchRef.current.currentTranslateX += panDx;
      androidPinchRef.current.currentTranslateY += panDy;
      androidTranslateX.setValue(androidPinchRef.current.currentTranslateX);
      androidTranslateY.setValue(androidPinchRef.current.currentTranslateY);
      androidPinchRef.current.lastPanX = touches[0].pageX;
      androidPinchRef.current.lastPanY = touches[0].pageY;
    }
    return;
  }
  // Im Zoom-Modus keine Zeichnung (iOS → ScrollView handelt)
  if (zoomMode) return;
  
  const touch = event.nativeEvent.touches ? event.nativeEvent.touches[0] : event.nativeEvent;
  // Gleiche Formel wie onTouchStart - locationX/Y sind bereits Canvas-Koordinaten
  let locationX = touch.locationX || touch.pageX;
  let locationY = touch.locationY || touch.pageY;

  // Android: Konvertiere Screen-Koordinaten → Canvas-Koordinaten via viewBox
  if (Platform.OS === 'android' && androidViewBox.w > 0 && androidViewBox.w !== screenWidth) {
    locationX = androidViewBox.x + (locationX / screenWidth) * androidViewBox.w;
    locationY = androidViewBox.y + (locationY / canvasHeight) * androidViewBox.h;
  }

  if (drawMode === 'select' && dragMode && originalElement && dragStart) {
    handleSelectTouchMove(locationX, locationY);
  } else if (drawMode === 'pen' && currentPathRef.current) {
    // Punkt aufnehmen (Mini-Jitter < 0.7px herausfiltern) und Pfad glätten
    const pts = currentPenPointsRef.current;
    const prev = pts[pts.length - 1];
    if (!prev || Math.hypot(locationX - prev.x, locationY - prev.y) > 0.7) {
      pts.push({ x: locationX, y: locationY });
      currentPathRef.current = buildSmoothPath(pts);
      // Live-Feedback bei jedem Event (Events kommen ohnehin max. 1x pro Frame)
      setCurrentPath(currentPathRef.current);
    }
  } else if (drawMode === 'select' && draggingLabelId) {
    // Label-Verschiebung während des Ziehens
    const dx = locationX - labelDragStartRef.current.x;
    const dy = locationY - labelDragStartRef.current.y;
    setLabelOffsets(prev => ({
      ...prev,
      [draggingLabelId]: {
        x: labelDragStartRef.current.offsetX + dx,
        y: labelDragStartRef.current.offsetY + dy,
      },
    }));
  } else if (drawMode === 'polygon' && currentPath) {
    setCurrentPath(prev => `${prev} L ${locationX} ${locationY}`);
  } else if (startPoint && drawMode !== 'text') {
    // Preview for other shapes
    createTempElement(startPoint, locationX, locationY);
  }
}



export type OnTouchEndImplCtx = {
  showProtractor: boolean;
  handleProtractorDragEnd: () => void;
  zoomMode: boolean;
  androidPinchRef: React.RefObject<{ initialDistance: number; initialScale: number; lastPanX: number; lastPanY: number; isPinching: boolean; numTouches: number; currentScale: number; currentTranslateX: number; currentTranslateY: number; }>;
  androidViewBox: { x: number; y: number; w: number; h: number; };
  screenWidth: number;
  canvasHeight: number;
  setAndroidViewBox: React.Dispatch<React.SetStateAction<{ x: number; y: number; w: number; h: number; }>>;
  setScale: React.Dispatch<React.SetStateAction<number>>;
  androidZoomScale: Animated.Value;
  androidTranslateX: Animated.Value;
  androidTranslateY: Animated.Value;
  drawMode: DrawMode;
  currentPathRef: React.RefObject<string>;
  generateId: () => string;
  drawColor: string;
  strokeWidth: number;
  addToHistory: (newElements: DrawElement[]) => void;
  elements: DrawElement[];
  currentPenPointsRef: React.RefObject<{ x: number; y: number; }[]>;
  setCurrentPath: React.Dispatch<React.SetStateAction<string>>;
  currentPath: string;
  angleEditMode: "rotate" | "adjust" | null;
  setAngleEditMode: React.Dispatch<React.SetStateAction<"rotate" | "adjust" | null>>;
  setAngleEditBaseId: React.Dispatch<React.SetStateAction<string | null>>;
  setAngleEditOriginals: React.Dispatch<React.SetStateAction<DrawElement[]>>;
  setDragStart: React.Dispatch<React.SetStateAction<{ x: number; y: number; } | null>>;
  dragMode: "move" | "resize" | "rotate" | null;
  editingPolylinePoint: number | null;
  selectedElementId: string | null;
  pointMoveOnly: boolean;
  autoDiagonalAfterPointMove: (element: DrawElement, pointIndex: number) => boolean;
  setSelectedLineSegment: React.Dispatch<React.SetStateAction<{ elementId: string; segmentIndex: number; } | null>>;
  measureLineStyles: { [elementId: string]: { color: string; strokeWidth: number; fontSize: number; }; };
  setTempMeasureLineColor: React.Dispatch<React.SetStateAction<string>>;
  setTempMeasureLineStrokeWidth: React.Dispatch<React.SetStateAction<number>>;
  setTempMeasureLineFontSize: React.Dispatch<React.SetStateAction<number>>;
  setLineMeasurementExpression: React.Dispatch<React.SetStateAction<string>>;
  setShowLineMeasurementNumpad: React.Dispatch<React.SetStateAction<boolean>>;
  lineMeasurementInputRef: React.RefObject<TextInput | null>;
  movingGroupBaseId: string | null;
  originalGroupElements: DrawElement[];
  setEditingPolylinePoint: React.Dispatch<React.SetStateAction<number | null>>;
  setDragMode: React.Dispatch<React.SetStateAction<"move" | "resize" | "rotate" | null>>;
  setResizeHandle: React.Dispatch<React.SetStateAction<string | null>>;
  setOriginalElement: React.Dispatch<React.SetStateAction<DrawElement | null>>;
  setOriginalGroupElements: React.Dispatch<React.SetStateAction<DrawElement[]>>;
  setMovingGroupBaseId: React.Dispatch<React.SetStateAction<string | null>>;
  setShowMagnifier: React.Dispatch<React.SetStateAction<boolean>>;
  setMagnifierPosition: React.Dispatch<React.SetStateAction<{ x: number; y: number; } | null>>;
  setMagnifierTargetPosition: React.Dispatch<React.SetStateAction<{ x: number; y: number; } | null>>;
  setMagnifierSnapshot: React.Dispatch<React.SetStateAction<string | null>>;
  draggingLabelId: string | null;
  setDraggingLabelId: React.Dispatch<React.SetStateAction<string | null>>;
  startPoint: { x: number; y: number; } | null;
  setPendingArrow: React.Dispatch<React.SetStateAction<{ x1: number; y1: number; x2: number; y2: number; } | null>>;
  setShowArrowModal: React.Dispatch<React.SetStateAction<boolean>>;
  openModalNumpad: (setter: React.Dispatch<React.SetStateAction<string>>, inputRef: React.RefObject<TextInput | null>) => void;
  setArrowText: React.Dispatch<React.SetStateAction<string>>;
  arrowInputRef: React.RefObject<TextInput | null>;
  setStartPoint: React.Dispatch<React.SetStateAction<{ x: number; y: number; } | null>>;
  setTempElement: React.Dispatch<React.SetStateAction<DrawElement | null>>;
  setPendingPointer: React.Dispatch<React.SetStateAction<{ x1: number; y1: number; x2: number; y2: number; } | null>>;
  setPointerText: React.Dispatch<React.SetStateAction<string>>;
  setShowPointerModal: React.Dispatch<React.SetStateAction<boolean>>;
  setPendingMemo: React.Dispatch<React.SetStateAction<{ x1: number; y1: number; x2: number; y2: number; } | null>>;
  setMemoText: React.Dispatch<React.SetStateAction<string>>;
  setShowMemoModal: React.Dispatch<React.SetStateAction<boolean>>;
  tempElement: DrawElement | null;
};

export function onTouchEndImpl(ctx: OnTouchEndImplCtx, event: any) {
  const {
    showProtractor, handleProtractorDragEnd, zoomMode, androidPinchRef, androidViewBox, screenWidth,
    canvasHeight, setAndroidViewBox, setScale, androidZoomScale, androidTranslateX,
    androidTranslateY, drawMode, currentPathRef, generateId, drawColor, strokeWidth, addToHistory,
    elements, currentPenPointsRef, setCurrentPath, currentPath, angleEditMode, setAngleEditMode,
    setAngleEditBaseId, setAngleEditOriginals, setDragStart, dragMode, editingPolylinePoint, autoDiagonalAfterPointMove,
    selectedElementId, pointMoveOnly, setSelectedLineSegment, measureLineStyles,
    setTempMeasureLineColor, setTempMeasureLineStrokeWidth, setTempMeasureLineFontSize,
    setLineMeasurementExpression, setShowLineMeasurementNumpad, lineMeasurementInputRef,
    movingGroupBaseId, originalGroupElements, setEditingPolylinePoint, setDragMode, setResizeHandle,
    setOriginalElement, setOriginalGroupElements, setMovingGroupBaseId, setShowMagnifier,
    setMagnifierPosition, setMagnifierTargetPosition, setMagnifierSnapshot, draggingLabelId,
    setDraggingLabelId, startPoint, setPendingArrow, setShowArrowModal, openModalNumpad,
    setArrowText, arrowInputRef, setStartPoint, setTempElement, setPendingPointer, setPointerText,
    setShowPointerModal, setPendingMemo, setMemoText, setShowMemoModal, tempElement,
  } = ctx;
  // Winkelmesser aktiv: Drag-Steuerung übernimmt der Canvas
  if (showProtractor && Platform.OS !== 'web') {
    handleProtractorDragEnd();
    return;
  }
  // === Android Zoom-Modus ===
  if (Platform.OS === 'android' && zoomMode) {
    // Wenn Pinch endet: Animated.View-Zoom in SVG viewBox überführen
    if (androidPinchRef.current.isPinching || androidPinchRef.current.currentScale !== 1 || androidPinchRef.current.currentTranslateX !== 0 || androidPinchRef.current.currentTranslateY !== 0) {
      const gestureScale = androidPinchRef.current.currentScale;
      const gestureTx = androidPinchRef.current.currentTranslateX;
      const gestureTy = androidPinchRef.current.currentTranslateY;
      
      // Berechne neue viewBox basierend auf aktueller viewBox + Geste
      const prevVB = androidViewBox.w > 0 ? androidViewBox : { x: 0, y: 0, w: screenWidth, h: canvasHeight };
      const newW = prevVB.w / gestureScale;
      const newH = prevVB.h / gestureScale;
      // Pan-Offset in viewBox-Koordinaten umrechnen
      const panInVBX = (gestureTx / screenWidth) * prevVB.w;
      const panInVBY = (gestureTy / canvasHeight) * prevVB.h;
      const newX = prevVB.x - panInVBX / gestureScale + (prevVB.w - newW) / 2;
      const newY = prevVB.y - panInVBY / gestureScale + (prevVB.h - newH) / 2;
      
      setAndroidViewBox({ x: newX, y: newY, w: newW, h: newH });
      
      // Gesamtzoom berechnen (Verhältnis original zu aktuellem viewBox)
      const totalScale = screenWidth / newW;
      setScale(totalScale);
      
      // Animated.View zurücksetzen (die Zoom-Info ist jetzt im viewBox)
      androidZoomScale.setValue(1);
      androidTranslateX.setValue(0);
      androidTranslateY.setValue(0);
      androidPinchRef.current.currentScale = 1;
      androidPinchRef.current.currentTranslateX = 0;
      androidPinchRef.current.currentTranslateY = 0;
    }
    androidPinchRef.current.isPinching = false;
    androidPinchRef.current.initialDistance = 0;
    androidPinchRef.current.numTouches = 0;
    return;
  }
  // Im Zoom-Modus keine Zeichnung (iOS → ScrollView handelt)
  if (zoomMode) return;
  
  if (drawMode === 'pen' && currentPathRef.current && currentPathRef.current.length > 0) {
    // Verwende den kompletten Pfad aus dem Ref für maximale Genauigkeit
    const finalPath = currentPathRef.current;
    const newElement: DrawElement = {
      id: generateId(),
      type: 'path',
      data: finalPath,
      color: drawColor,
      strokeWidth,
      rotation: 0,
    };
    addToHistory([...elements, newElement]);
    // Refs und State zurücksetzen
    currentPathRef.current = '';
    currentPenPointsRef.current = [];
    setCurrentPath('');
  } else if (drawMode === 'polygon' && currentPath && currentPath.length > 0) {
    // Close the polygon path by adding 'Z' and simplify lines
    const simplifiedPath = simplifyPath(currentPath, 10);
    const newElement: DrawElement = {
      id: generateId(),
      type: 'polygon',
      data: simplifiedPath + ' Z',
      color: drawColor,
      strokeWidth,
      rotation: 0,
    };
    addToHistory([...elements, newElement]);
    setCurrentPath('');
  } else if (drawMode === 'select' && angleEditMode) {
    // Winkelgruppen-Bearbeitung (Drehen/Verlängern) abgeschlossen
    addToHistory(elements);
    setAngleEditMode(null);
    setAngleEditBaseId(null);
    setAngleEditOriginals([]);
    setDragStart(null);
  } else if (drawMode === 'select' && dragMode) {
    // Finish transform - add to history if elements changed
    if (editingPolylinePoint !== null) {
      // Save polyline point edit to history
      addToHistory(elements);
      
      // Automatisch Maß-Eingabe öffnen für das bearbeitete Segment
      const editedPointIdx = editingPolylinePoint;
      const polyEl = elements.find(el => el.id === selectedElementId);
      // Schiefer Raum ohne Winkel/Diagonale: passende Diagonale anlegen und Eingabe öffnen
      const autoDiagonal = !!polyEl && polyEl.type === 'polyline' && autoDiagonalAfterPointMove(polyEl, editedPointIdx);
      if ((!pointMoveOnly || autoDiagonal) && polyEl && polyEl.type === 'polyline' && polyEl.data?.points) {
        const points = polyEl.data.points;
        // Das Segment VOR dem Punkt (Punkt i-1 → i) ist das natürlichste
        const segmentIdx = editedPointIdx > 0 ? editedPointIdx - 1 : 0;
        // Nur öffnen wenn das Segment existiert
        if (segmentIdx < points.length - 1) {
          setSelectedLineSegment({ elementId: polyEl.id, segmentIndex: segmentIdx });
          // Bestehende Stil-Einstellungen für dieses Element laden
          const existingStyle = measureLineStyles[polyEl.id];
          setTempMeasureLineColor(existingStyle?.color || '#1976d2');
          setTempMeasureLineStrokeWidth(existingStyle?.strokeWidth || 1.2);
          setTempMeasureLineFontSize(existingStyle?.fontSize || 11);
          setLineMeasurementExpression('');
          setShowLineMeasurementNumpad(true);
          if (!autoDiagonal) setTimeout(() => lineMeasurementInputRef.current?.focus(), 100);
        }
      }
    } else if (movingGroupBaseId && originalGroupElements.length > 0) {
      // Winkel-Gruppen-Bewegung abgeschlossen - zum History hinzufügen
      addToHistory(elements);
    }
    setEditingPolylinePoint(null);
    setDragMode(null);
    setResizeHandle(null);
    setDragStart(null);
    setOriginalElement(null);
    // Winkel-Gruppen-State zurücksetzen
    setOriginalGroupElements([]);
    setMovingGroupBaseId(null);
    // Lupe ausblenden
    setShowMagnifier(false);
    setMagnifierPosition(null);
    setMagnifierTargetPosition(null);
    setMagnifierSnapshot(null);
  } else if (drawMode === 'select' && draggingLabelId) {
    // Label-Verschiebung beenden
    setDraggingLabelId(null);
  } else if (startPoint && drawMode === 'arrow') {
    const touch = event.nativeEvent.changedTouches ? event.nativeEvent.changedTouches[0] : event.nativeEvent;
    let locationX = touch.locationX || touch.pageX;
    let locationY = touch.locationY || touch.pageY;
    // Android: Konvertiere via viewBox
    if (Platform.OS === 'android' && androidViewBox.w > 0 && androidViewBox.w !== screenWidth) {
      locationX = androidViewBox.x + (locationX / screenWidth) * androidViewBox.w;
      locationY = androidViewBox.y + (locationY / canvasHeight) * androidViewBox.h;
    }
    
    // Show arrow text input
    setPendingArrow({ x1: startPoint.x, y1: startPoint.y, x2: locationX, y2: locationY });
    setShowArrowModal(true);
    // Gleich das eingebaute Numpad statt der System-Tastatur öffnen
    openModalNumpad(setArrowText, arrowInputRef);
    setStartPoint(null);
    setTempElement(null);
  } else if (startPoint && drawMode === 'pointer') {
    // Memo-Pfeil: Modal öffnen für optionale Notiz
    const touch = event.nativeEvent.changedTouches ? event.nativeEvent.changedTouches[0] : event.nativeEvent;
    let locationX = touch.locationX || touch.pageX;
    let locationY = touch.locationY || touch.pageY;
    // Android: Konvertiere via viewBox
    if (Platform.OS === 'android' && androidViewBox.w > 0 && androidViewBox.w !== screenWidth) {
      locationX = androidViewBox.x + (locationX / screenWidth) * androidViewBox.w;
      locationY = androidViewBox.y + (locationY / canvasHeight) * androidViewBox.h;
    }
    
    // Speichere die Pointer-Koordinaten und öffne Modal
    setPendingPointer({ x1: startPoint.x, y1: startPoint.y, x2: locationX, y2: locationY });
    setPointerText(''); // Text zurücksetzen
    setShowPointerModal(true);
    setStartPoint(null);
    setTempElement(null);
  } else if (startPoint && drawMode === 'memo') {
    // Memo/Notiz: Annotation mit gestrichelter Linie und Textlabel
    const touch = event.nativeEvent.changedTouches ? event.nativeEvent.changedTouches[0] : event.nativeEvent;
    let locationX = touch.locationX || touch.pageX;
    let locationY = touch.locationY || touch.pageY;
    // Android: Konvertiere via viewBox
    if (Platform.OS === 'android' && androidViewBox.w > 0 && androidViewBox.w !== screenWidth) {
      locationX = androidViewBox.x + (locationX / screenWidth) * androidViewBox.w;
      locationY = androidViewBox.y + (locationY / canvasHeight) * androidViewBox.h;
    }
    
    // Speichere die Memo-Koordinaten und öffne Modal
    setPendingMemo({ x1: startPoint.x, y1: startPoint.y, x2: locationX, y2: locationY });
    setMemoText(''); // Leerer Anfangstext
    setShowMemoModal(true);
    setStartPoint(null);
    setTempElement(null);
  } else if (startPoint && tempElement) {
    // Wichtig: Neue eindeutige ID vergeben beim Hinzufügen
    const finalElement = { ...tempElement, id: Date.now().toString() };
    addToHistory([...elements, finalElement]);
    setStartPoint(null);
    setTempElement(null);
  }
}



export type CreateTempElementImplCtx = {
  drawMode: DrawMode;
  lineArrowType: "none" | "end" | "both";
  drawColor: string;
  strokeWidth: number;
  arrowHeads: "single" | "double";
  editArrowStrokeWidth: number;
  editPointerStrokeWidth: number;
  setTempElement: React.Dispatch<React.SetStateAction<DrawElement | null>>;
};

export function createTempElementImpl(ctx: CreateTempElementImplCtx, start: { x: number; y: number }, endX: number, endY: number) {
  const {
    drawMode, lineArrowType, drawColor, strokeWidth, arrowHeads, editArrowStrokeWidth,
    editPointerStrokeWidth, setTempElement,
  } = ctx;
  let element: DrawElement | null = null;

  switch (drawMode) {
    case 'line':
      element = {
        id: 'temp',
        type: 'line',
        data: { x1: start.x, y1: start.y, x2: endX, y2: endY, arrowHeads: lineArrowType },
        color: drawColor,
        strokeWidth,
        rotation: 0,
      };
      break;
    case 'circle':
      const radius = Math.sqrt(Math.pow(endX - start.x, 2) + Math.pow(endY - start.y, 2));
      element = {
        id: 'temp',
        type: 'circle',
        data: { cx: start.x, cy: start.y, r: radius },
        color: drawColor,
        strokeWidth,
        rotation: 0,
      };
      break;
    case 'rect':
      element = {
        id: 'temp',
        type: 'rect',
        data: {
          x: Math.min(start.x, endX),
          y: Math.min(start.y, endY),
          width: Math.abs(endX - start.x),
          height: Math.abs(endY - start.y),
        },
        color: drawColor,
        strokeWidth,
        rotation: 0,
      };
      break;
    case 'arrow':
      element = {
        id: 'temp',
        type: 'arrow',
        data: { x1: start.x, y1: start.y, x2: endX, y2: endY, text: '', heads: arrowHeads },
        color: drawColor,
        strokeWidth: editArrowStrokeWidth, // Gespeicherte Arrow-Strichstärke verwenden
        rotation: 0,
      };
      break;
    case 'pointer':
      // Pointer-Pfeil: verwendet die gespeicherte Pointer-Strichstärke
      element = {
        id: 'temp',
        type: 'pointer',
        data: { x1: start.x, y1: start.y, x2: endX, y2: endY },
        color: drawColor,
        strokeWidth: editPointerStrokeWidth, // Gespeicherte Pointer-Strichstärke verwenden
        rotation: 0,
      };
      break;
    case 'memo':
      // Memo/Notiz: Ankerpunkt mit gestrichelter Linie zum Textlabel
      element = {
        id: 'temp',
        type: 'memo',
        data: { x1: start.x, y1: start.y, x2: endX, y2: endY, text: '' },
        color: '#E74C3C',
        strokeWidth: 2,
        rotation: 0,
      };
      break;
  }

  setTempElement(element);
}



export type SnapPointToAngleImplCtx = {
  gridSnapEnabled: boolean;
  showGrid: boolean;
  gridSize: number;
  angleSnapEnabled: boolean;
  polylinePoints: { x: number; y: number; }[];
  angleSnapValue: number;
};

export function snapPointToAngleImpl(ctx: SnapPointToAngleImplCtx, newX: number, newY: number): { x: number; y: number } {
  const {
    gridSnapEnabled, showGrid, gridSize, angleSnapEnabled, polylinePoints, angleSnapValue,
  } = ctx;
  // Erst Raster-Einrastung anwenden
  let snappedX = newX;
  let snappedY = newY;
  
  if (gridSnapEnabled && showGrid && gridSize > 0) {
    snappedX = Math.round(newX / gridSize) * gridSize;
    snappedY = Math.round(newY / gridSize) * gridSize;
  }
  
  if (!angleSnapEnabled || polylinePoints.length === 0) {
    return { x: snappedX, y: snappedY };
  }
  
  const lastPoint = polylinePoints[polylinePoints.length - 1];
  const dx = snappedX - lastPoint.x;
  const dy = snappedY - lastPoint.y;
  const distance = Math.sqrt(dx * dx + dy * dy);
  
  if (distance < 5) return { x: snappedX, y: snappedY }; // Zu kurz, kein Snap
  
  // Aktuellen Winkel berechnen (in Grad, 0° = rechts, gegen Uhrzeigersinn)
  let currentAngle = Math.atan2(-dy, dx) * (180 / Math.PI); // -dy weil Y nach unten zeigt
  
  // Basiswinkel bestimmen
  let baseAngle = 0;
  if (polylinePoints.length >= 2) {
    // Winkel des vorherigen Segments als Basis
    const prevPoint = polylinePoints[polylinePoints.length - 2];
    const prevDx = lastPoint.x - prevPoint.x;
    const prevDy = lastPoint.y - prevPoint.y;
    baseAngle = Math.atan2(-prevDy, prevDx) * (180 / Math.PI);
  }
  
  // Relativen Winkel berechnen und auf Snap-Wert runden
  const relativeAngle = currentAngle - baseAngle;
  const snapAngleRad = angleSnapValue;
  const snappedRelative = Math.round(relativeAngle / snapAngleRad) * snapAngleRad;
  const snappedAbsolute = (baseAngle + snappedRelative) * (Math.PI / 180);
  
  // Neuen Punkt berechnen
  let resultX = lastPoint.x + distance * Math.cos(snappedAbsolute);
  let resultY = lastPoint.y - distance * Math.sin(snappedAbsolute); // -sin weil Y nach unten
  
  // Bei Raster+Winkel: Entfernung auf nächstes Raster-Vielfaches in der Winkelrichtung einrasten
  if (gridSnapEnabled && showGrid && gridSize > 0) {
    const gridDistance = Math.round(distance / gridSize) * gridSize;
    if (gridDistance > 0) {
      resultX = lastPoint.x + gridDistance * Math.cos(snappedAbsolute);
      resultY = lastPoint.y - gridDistance * Math.sin(snappedAbsolute);
    }
  }
  
  return { x: resultX, y: resultY };
}



export type HandleSelectTouchStartImplCtx = {
  diagonalPick: { elementId: string; first: number | null; } | null;
  handleDiagonalPick: (x: number, y: number) => void;
  handleAngleCornerTap: (x: number, y: number) => boolean;
  handleOpeningTap: (x: number, y: number) => boolean;
  findPolylineLabelAtPoint: (x: number, y: number) => { elementId: string; centerX: number; centerY: number; } | null;
  labelOffsets: { [elementId: string]: { x: number; y: number; }; };
  setDraggingLabelId: React.Dispatch<React.SetStateAction<string | null>>;
  labelDragStartRef: React.RefObject<{ x: number; y: number; offsetX: number; offsetY: number; }>;
  pointMoveOnly: boolean;
  findNearestPolylinePoint: (x: number, y: number) => { element: DrawElement; pointIndex: number; } | null;
  selectedElementId: string | null;
  setSelectedElementId: React.Dispatch<React.SetStateAction<string | null>>;
  setSelectedLineSegment: React.Dispatch<React.SetStateAction<{ elementId: string; segmentIndex: number; } | null>>;
  elements: DrawElement[];
  setEditingPolylinePoint: React.Dispatch<React.SetStateAction<number | null>>;
  setDragMode: React.Dispatch<React.SetStateAction<"move" | "resize" | "rotate" | null>>;
  setDragStart: React.Dispatch<React.SetStateAction<{ x: number; y: number; } | null>>;
  setOriginalElement: React.Dispatch<React.SetStateAction<DrawElement | null>>;
  setMagnifierTargetPosition: React.Dispatch<React.SetStateAction<{ x: number; y: number; } | null>>;
  setMagnifierPosition: React.Dispatch<React.SetStateAction<{ x: number; y: number; } | null>>;
  canvasLayout: { x: number; y: number; width: number; height: number; } | null;
  canvasRef: React.RefObject<null>;
  setMagnifierSnapshot: React.Dispatch<React.SetStateAction<string | null>>;
  setShowMagnifier: React.Dispatch<React.SetStateAction<boolean>>;
  checkTransformHandles: (element: DrawElement, x: number, y: number) => { type: "rotate" | "resize" | "angle-rotate" | "angle-adjust"; handle: string; } | null;
  getAngleGroupBaseId: (elementId: string) => string | null;
  getAngleGroupElementIds: (baseId: string) => string[];
  setAngleEditMode: React.Dispatch<React.SetStateAction<"rotate" | "adjust" | null>>;
  setAngleEditBaseId: React.Dispatch<React.SetStateAction<string | null>>;
  setAngleEditOriginals: React.Dispatch<React.SetStateAction<DrawElement[]>>;
  setResizeHandle: React.Dispatch<React.SetStateAction<string | null>>;
  findLineNumberAtPoint: (x: number, y: number) => { element: DrawElement; segmentIndex: number; } | null;
  setPanelOptionsOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setWallSectionOpen: React.Dispatch<React.SetStateAction<boolean>>;
  findPolylineSegmentAtPoint: (x: number, y: number) => { element: DrawElement; segmentIndex: number; } | null;
  measureLineStyles: { [elementId: string]: { color: string; strokeWidth: number; fontSize: number; }; };
  setTempMeasureLineColor: React.Dispatch<React.SetStateAction<string>>;
  setTempMeasureLineStrokeWidth: React.Dispatch<React.SetStateAction<number>>;
  setTempMeasureLineFontSize: React.Dispatch<React.SetStateAction<number>>;
  setLineMeasurementExpression: React.Dispatch<React.SetStateAction<string>>;
  setShowLineMeasurementNumpad: React.Dispatch<React.SetStateAction<boolean>>;
  lineMeasurementInputRef: React.RefObject<TextInput | null>;
  findElementAtPoint: (x: number, y: number, onlyImages?: boolean) => DrawElement | null;
  photoEditMode: boolean;
  lastTapRef: React.RefObject<{ time: number; elementId: string | null; }>;
  setTextInput: React.Dispatch<React.SetStateAction<string>>;
  setEditFontSize: React.Dispatch<React.SetStateAction<number>>;
  setEditFontWeight: React.Dispatch<React.SetStateAction<"normal" | "bold">>;
  setEditFontStyle: React.Dispatch<React.SetStateAction<"normal" | "italic">>;
  setEditFontFamily: React.Dispatch<React.SetStateAction<FontFamily>>;
  setDrawColor: React.Dispatch<React.SetStateAction<string>>;
  setShowEditTextModal: React.Dispatch<React.SetStateAction<boolean>>;
  setArrowText: React.Dispatch<React.SetStateAction<string>>;
  setArrowHeads: React.Dispatch<React.SetStateAction<"single" | "double">>;
  setEditArrowFontSize: React.Dispatch<React.SetStateAction<number>>;
  setEditArrowStrokeWidth: React.Dispatch<React.SetStateAction<number>>;
  setShowEditArrowModal: React.Dispatch<React.SetStateAction<boolean>>;
  openModalNumpad: (setter: React.Dispatch<React.SetStateAction<string>>, inputRef: React.RefObject<TextInput | null>) => void;
  arrowInputRef: React.RefObject<TextInput | null>;
  setPointerText: React.Dispatch<React.SetStateAction<string>>;
  setEditPointerFontSize: React.Dispatch<React.SetStateAction<number>>;
  setEditPointerStrokeWidth: React.Dispatch<React.SetStateAction<number>>;
  setShowEditPointerModal: React.Dispatch<React.SetStateAction<boolean>>;
  setMemoText: React.Dispatch<React.SetStateAction<string>>;
  setEditMemoFontSize: React.Dispatch<React.SetStateAction<number>>;
  setShowEditMemoModal: React.Dispatch<React.SetStateAction<boolean>>;
  setEditPolygonStrokeWidth: React.Dispatch<React.SetStateAction<number>>;
  setEditPolygonColor: React.Dispatch<React.SetStateAction<string>>;
  setShowEditPolygonModal: React.Dispatch<React.SetStateAction<boolean>>;
  setOriginalGroupElements: React.Dispatch<React.SetStateAction<DrawElement[]>>;
  setMovingGroupBaseId: React.Dispatch<React.SetStateAction<string | null>>;
};

export function handleSelectTouchStartImpl(ctx: HandleSelectTouchStartImplCtx, locationX: number, locationY: number) {
  const {
    diagonalPick, handleDiagonalPick, handleAngleCornerTap, handleOpeningTap, findPolylineLabelAtPoint, labelOffsets, setDraggingLabelId,
    labelDragStartRef, pointMoveOnly, findNearestPolylinePoint, selectedElementId,
    setSelectedElementId, setSelectedLineSegment, elements, setEditingPolylinePoint, setDragMode,
    setDragStart, setOriginalElement, setMagnifierTargetPosition, setMagnifierPosition, canvasLayout,
    canvasRef, setMagnifierSnapshot, setShowMagnifier, checkTransformHandles, getAngleGroupBaseId,
    getAngleGroupElementIds, setAngleEditMode, setAngleEditBaseId, setAngleEditOriginals,
    setResizeHandle, findLineNumberAtPoint, setPanelOptionsOpen, setWallSectionOpen,
    findPolylineSegmentAtPoint, measureLineStyles, setTempMeasureLineColor,
    setTempMeasureLineStrokeWidth, setTempMeasureLineFontSize, setLineMeasurementExpression,
    setShowLineMeasurementNumpad, lineMeasurementInputRef, findElementAtPoint, photoEditMode,
    lastTapRef, setTextInput, setEditFontSize, setEditFontWeight, setEditFontStyle,
    setEditFontFamily, setDrawColor, setShowEditTextModal, setArrowText, setArrowHeads,
    setEditArrowFontSize, setEditArrowStrokeWidth, setShowEditArrowModal, openModalNumpad,
    arrowInputRef, setPointerText, setEditPointerFontSize, setEditPointerStrokeWidth,
    setShowEditPointerModal, setMemoText, setEditMemoFontSize, setShowEditMemoModal,
    setEditPolygonStrokeWidth, setEditPolygonColor, setShowEditPolygonModal,
    setOriginalGroupElements, setMovingGroupBaseId,
  } = ctx;
  if (diagonalPick) {
    handleDiagonalPick(locationX, locationY);
    return;
  }
  if (handleAngleCornerTap(locationX, locationY)) return;
  if (handleOpeningTap(locationX, locationY)) return;
  // Zuerst prüfen: Klick auf ein Polyline-Label zum Verschieben?
  const labelHit = findPolylineLabelAtPoint(locationX, locationY);
  if (labelHit) {
    // Label gefunden - Verschiebung starten
    const currentOffset = labelOffsets[labelHit.elementId] || { x: 0, y: 0 };
    setDraggingLabelId(labelHit.elementId);
    labelDragStartRef.current = {
      x: locationX,
      y: locationY,
      offsetX: currentOffset.x,
      offsetY: currentOffset.y,
    };
    return;
  }
  
  // „Punkte verschieben“: nächstgelegenen Eckpunkt greifen, auch wenn das Polygon noch nicht ausgewählt ist
  const pointMoveHit = pointMoveOnly ? findNearestPolylinePoint(locationX, locationY) : null;
  const activeSelectedId = pointMoveHit ? pointMoveHit.element.id : selectedElementId;
  if (pointMoveHit && pointMoveHit.element.id !== selectedElementId) {
    setSelectedElementId(pointMoveHit.element.id);
    setSelectedLineSegment(null);
  }

  // Check if clicking on transformation handles first
  if (activeSelectedId) {
    const selectedEl = elements.find(el => el.id === activeSelectedId);
    if (selectedEl) {
      // Check for polyline center handle (for moving entire polygon)
      if (!pointMoveHit && selectedEl.type === 'polyline' && selectedEl.data?.points && selectedEl.data.points.length >= 2) {
        const points = selectedEl.data.points;
        const centerX = points.reduce((sum: number, pt: { x: number }) => sum + pt.x, 0) / points.length;
        const centerY = points.reduce((sum: number, pt: { y: number }) => sum + pt.y, 0) / points.length;
        const centerRadius = 8; // Klick-Toleranz für Mittelpunkt - kleiner gemacht für iPhone
        const distanceToCenter = Math.sqrt(
          Math.pow(locationX - centerX, 2) + Math.pow(locationY - centerY, 2)
        );
        if (distanceToCenter <= centerRadius) {
          // Mittelpunkt getroffen - Verschiebung des gesamten Polygons starten
          setEditingPolylinePoint(null); // Kein einzelner Punkt, sondern ganzes Polygon
          setDragMode('move');
          setDragStart({ x: locationX, y: locationY });
          setOriginalElement(deepCloneElement(selectedEl));
          return;
        }
      }
      
      // Check for polyline point editing
      if (selectedEl.type === 'polyline' && selectedEl.data?.points) {
        const pointRadius = 8; // Klick-Toleranz für Eckpunkte - kleiner gemacht für iPhone
        for (let i = 0; i < selectedEl.data.points.length; i++) {
          const pt = selectedEl.data.points[i];
          const distance = Math.sqrt(
            Math.pow(locationX - pt.x, 2) + Math.pow(locationY - pt.y, 2)
          );
          if (pointMoveHit ? i === pointMoveHit.pointIndex : distance <= pointRadius) {
            // Eckpunkt gefunden - Bearbeitungsmodus starten
            setEditingPolylinePoint(i);
            setDragMode('move');
            setDragStart({ x: locationX, y: locationY });
            setOriginalElement(deepCloneElement(selectedEl));
            
            // Lupe aktivieren für Polygon-Eckpunkte
            setMagnifierTargetPosition({ x: pt.x, y: pt.y });
            setMagnifierPosition({ x: locationX + (canvasLayout?.x || 0), y: locationY + (canvasLayout?.y || 0) });
            
            // Canvas-Snapshot für Lupe erstellen
            if (canvasRef.current) {
              captureRef(canvasRef.current, {
                format: 'png',
                quality: 1.0,
                result: 'data-uri',
              }).then((uri: string) => {
                setMagnifierSnapshot(uri);
                setShowMagnifier(true);
              }).catch((err: Error) => {
                console.log('Snapshot error:', err);
                // Fallback: Lupe ohne Snapshot zeigen
                setShowMagnifier(true);
              });
            } else {
              setShowMagnifier(true);
            }
            
            return;
          }
        }
      }
      
      const handle = checkTransformHandles(selectedEl, locationX, locationY);
      if (handle) {
        // Winkelgruppen-Bearbeitungsmodus (Drehen/Verlängern)
        if (handle.type === 'angle-rotate' || handle.type === 'angle-adjust') {
          const baseId = getAngleGroupBaseId(selectedEl.id);
          const groupIds = getAngleGroupElementIds(baseId);
          const originals = elements.filter(el => groupIds.includes(el.id)).map(el => deepCloneElement(el));
          setAngleEditMode(handle.type === 'angle-rotate' ? 'rotate' : 'adjust');
          setAngleEditBaseId(baseId);
          setAngleEditOriginals(originals);
          setDragStart({ x: locationX, y: locationY });
          return;
        }
        
        setDragMode(handle.type === 'rotate' ? 'rotate' : 'resize');
        setResizeHandle(handle.handle);
        setDragStart({ x: locationX, y: locationY });
        setOriginalElement(deepCloneElement(selectedEl));
        
        // Lupe aktivieren für Maßlinien-Endpunkte (start/end handles)
        if ((selectedEl.type === 'line' || selectedEl.type === 'arrow' || selectedEl.type === 'pointer' || selectedEl.type === 'memo') &&
            (handle.handle === 'start' || handle.handle === 'end')) {
          // Position des Zielpunktes setzen
          const targetX = handle.handle === 'start' ? selectedEl.data.x1 : selectedEl.data.x2;
          const targetY = handle.handle === 'start' ? selectedEl.data.y1 : selectedEl.data.y2;
          setMagnifierTargetPosition({ x: targetX, y: targetY });
          setMagnifierPosition({ x: locationX + (canvasLayout?.x || 0), y: locationY + (canvasLayout?.y || 0) });
          
          // Canvas-Snapshot für Lupe erstellen
          if (canvasRef.current) {
            captureRef(canvasRef.current, {
              format: 'png',
              quality: 1.0,
              result: 'data-uri',
            }).then((uri: string) => {
              setMagnifierSnapshot(uri);
              setShowMagnifier(true);
            }).catch((err: Error) => {
              console.log('Snapshot error:', err);
              // Fallback: Lupe ohne Snapshot zeigen
              setShowMagnifier(true);
            });
          } else {
            setShowMagnifier(true);
          }
        }
        
        return;
      }
    }
  }

  // Reset polyline point editing when clicking elsewhere
  setEditingPolylinePoint(null);
  
  // Prüfe ob auf ein Polyline-Segment geklickt wurde (für Maß-Funktion)
  // Im Modus „Punkte verschieben“ öffnet sich das Maß-Fenster nicht
  const numberHit = pointMoveOnly ? null : findLineNumberAtPoint(locationX, locationY);
  if (numberHit) {
    // Linien-Nummer angetippt: Wand-Bereich (Höhe/Öffnungen) dieser Linie direkt aufklappen
    setPanelOptionsOpen(true);
    setWallSectionOpen(true);
  }
  const segmentHit = pointMoveOnly ? null : (numberHit || findPolylineSegmentAtPoint(locationX, locationY));
  if (segmentHit) {
    // Segment gefunden - Maß-Eingabe DIREKT öffnen (ohne "Maß hinzufügen" Button)
    setSelectedLineSegment({ 
      elementId: segmentHit.element.id, 
      segmentIndex: segmentHit.segmentIndex 
    });
    setSelectedElementId(segmentHit.element.id);
    // Bestehende Stil-Einstellungen für dieses Element laden
    const existingStyle = measureLineStyles[segmentHit.element.id];
    setTempMeasureLineColor(existingStyle?.color || '#1976d2');
    setTempMeasureLineStrokeWidth(existingStyle?.strokeWidth || 1.2);
    setTempMeasureLineFontSize(existingStyle?.fontSize || 11);
    // Numpad direkt öffnen
    setLineMeasurementExpression('');
    setShowLineMeasurementNumpad(true);
    setTimeout(() => lineMeasurementInputRef.current?.focus(), 100);
    // KEIN dragMode setzen - Polylinie nur über Mittelpunkt oder Eckpunkte verschiebbar
    return;
  } else {
    // Kein Segment getroffen - Auswahl zurücksetzen
    setSelectedLineSegment(null);
  }

  // Check if clicking on an element - im Foto-Modus nur Bilder, sonst nur andere Elemente
  const clickedElement = findElementAtPoint(locationX, locationY, photoEditMode);
  if (clickedElement) {
    // Check for double tap
    const now = Date.now();
    const lastTap = lastTapRef.current;
    
    if (lastTap.elementId === clickedElement.id && now - lastTap.time < 300) {
      // Double tap detected - open edit modal
      if (clickedElement.type === 'text') {
        setTextInput(clickedElement.data.text || '');
        setEditFontSize(clickedElement.fontSize || 20);
        setEditFontWeight(clickedElement.fontWeight || 'bold');
        setEditFontStyle(clickedElement.fontStyle || 'normal');
        // FontFamily aus dem Element laden (svgFont zurück zu FontFamily ID konvertieren)
        const currentFontFamily = clickedElement.fontFamily || 'sans-serif';
        const fontFamilyId = FONT_FAMILIES.find(f => f.svgFont === currentFontFamily)?.id || 'System';
        setEditFontFamily(fontFamilyId);
        setDrawColor(clickedElement.color);
        setShowEditTextModal(true);
      } else if (clickedElement.type === 'arrow') {
        setArrowText(clickedElement.data.text || '');
        setArrowHeads(clickedElement.data.heads || 'double');
        setEditArrowFontSize(clickedElement.data.fontSize || 14);
        setEditArrowStrokeWidth(clickedElement.strokeWidth || 3);
        setDrawColor(clickedElement.color);
        setShowEditArrowModal(true);
        openModalNumpad(setArrowText, arrowInputRef);
      } else if (clickedElement.type === 'pointer') {
        // Memo-Pfeil bearbeiten
        setPointerText(clickedElement.data.text || '');
        setEditPointerFontSize(clickedElement.data.fontSize || 16);
        setEditPointerStrokeWidth(clickedElement.strokeWidth || 6);
        setDrawColor(clickedElement.color);
        setShowEditPointerModal(true);
      } else if (clickedElement.type === 'memo') {
        // Memo/Notiz bearbeiten bei Doppeltipp
        setMemoText(clickedElement.data.text || '');
        setEditMemoFontSize(clickedElement.data.fontSize || 14);
        setDrawColor(clickedElement.color);
        setShowEditMemoModal(true);
      } else if (clickedElement.type === 'polygon' || clickedElement.type === 'rect' || clickedElement.type === 'circle' || clickedElement.type === 'polyline' || clickedElement.type === 'path') {
        // Polygon/Rechteck/Kreis/Polyline/Pfad bearbeiten bei Doppeltipp
        setEditPolygonStrokeWidth(clickedElement.strokeWidth || 3);
        setEditPolygonColor(clickedElement.color || '#FF0000');
        setShowEditPolygonModal(true);
      }
      lastTapRef.current = { time: 0, elementId: null };
      return;
    }
    
    lastTapRef.current = { time: now, elementId: clickedElement.id };
    
    setSelectedElementId(clickedElement.id);
    console.log('[DEBUG] Selected element:', clickedElement.type, clickedElement.id);
    
    // Polylines nur über Mittelpunkt oder Eckpunkte verschiebbar, nicht über die Fläche
    if (clickedElement.type !== 'polyline') {
      // WINKEL-GRUPPEN-LOGIK: Prüfe ob das Element Teil einer Winkel-Gruppe ist
      const baseId = getAngleGroupBaseId(clickedElement.id);
      if (baseId) {
        console.log('[DEBUG] Angle group element tapped:', clickedElement.id, 'baseId:', baseId);
        // Winkelgruppe: NICHT sofort den Verschiebungsmodus starten
        // Stattdessen nur auswählen, damit die Griff-Punkte sichtbar werden
        // Der Benutzer kann dann entweder einen Griff ziehen oder das Element verschieben
        // Verschiebung wird erst beim NÄCHSTEN Drag gestartet
        if (selectedElementId === clickedElement.id) {
          // Element war schon ausgewählt → Verschiebung starten
          console.log('[DEBUG] Angle group: starting move (already selected)');
          setDragMode('move');
          setDragStart({ x: locationX, y: locationY });
          setOriginalElement(deepCloneElement(clickedElement));
          const groupIds = getAngleGroupElementIds(baseId);
          const groupElements = elements.filter(el => groupIds.includes(el.id));
          setOriginalGroupElements(groupElements.map(el => deepCloneElement(el)));
          setMovingGroupBaseId(baseId);
        }
        // Erstes Tap → nur auswählen (Handles werden sichtbar)
      } else {
        // Kein Winkel-Element → normales Verschieben
        console.log('[DEBUG] Setting drag mode to move for:', clickedElement.type);
        setDragMode('move');
        setDragStart({ x: locationX, y: locationY });
        setOriginalElement(deepCloneElement(clickedElement));
        // Gruppen-State zurücksetzen
        setOriginalGroupElements([]);
        setMovingGroupBaseId(null);
      }
    }
  } else {
    setSelectedElementId(null);
    setOriginalGroupElements([]);
    setMovingGroupBaseId(null);
    lastTapRef.current = { time: 0, elementId: null };
  }
}



export type HandleSelectTouchMoveImplCtx = {
  draggingLabelId: string | null;
  labelDragStartRef: React.RefObject<{ x: number; y: number; offsetX: number; offsetY: number; }>;
  setLabelOffsets: React.Dispatch<React.SetStateAction<{ [elementId: string]: { x: number; y: number; }; }>>;
  originalElement: DrawElement | null;
  dragStart: { x: number; y: number; } | null;
  angleEditMode: "rotate" | "adjust" | null;
  angleEditBaseId: string | null;
  getAngleGroupGeometry: (baseId: string, els?: DrawElement[]) => { cx: any; cy: any; refAngleRad: number; refLength: number; angleLineRad: number; anglLineLength: number; angleOffsetRad: number; } | null;
  angleEditOriginals: DrawElement[];
  recalculateAngleGroup: (baseId: string, centerX: number, centerY: number, refAngleRad: number, refLength: number, angleOffsetRad: number, anglLineLength: number, isMirrored: boolean) => DrawElement[];
  setElements: React.Dispatch<React.SetStateAction<DrawElement[]>>;
  movingGroupBaseId: string | null;
  originalGroupElements: DrawElement[];
  dragMode: "move" | "resize" | "rotate" | null;
  getAngleGroupElementIds: (baseId: string) => string[];
  elements: DrawElement[];
  selectedElementId: string | null;
  editingPolylinePoint: number | null;
  showMagnifier: boolean;
  setMagnifierTargetPosition: React.Dispatch<React.SetStateAction<{ x: number; y: number; } | null>>;
  setMagnifierPosition: React.Dispatch<React.SetStateAction<{ x: number; y: number; } | null>>;
  canvasLayout: { x: number; y: number; width: number; height: number; } | null;
  resizeHandle: string | null;
};

export function handleSelectTouchMoveImpl(ctx: HandleSelectTouchMoveImplCtx, locationX: number, locationY: number) {
  const {
    draggingLabelId, labelDragStartRef, setLabelOffsets, originalElement, dragStart, angleEditMode,
    angleEditBaseId, getAngleGroupGeometry, angleEditOriginals, recalculateAngleGroup, setElements,
    movingGroupBaseId, originalGroupElements, dragMode, getAngleGroupElementIds, elements,
    selectedElementId, editingPolylinePoint, showMagnifier, setMagnifierTargetPosition,
    setMagnifierPosition, canvasLayout, resizeHandle,
  } = ctx;
  // Label-Verschiebung wenn aktiv
  if (draggingLabelId) {
    const dx = locationX - labelDragStartRef.current.x;
    const dy = locationY - labelDragStartRef.current.y;
    setLabelOffsets(prev => ({
      ...prev,
      [draggingLabelId]: {
        x: labelDragStartRef.current.offsetX + dx,
        y: labelDragStartRef.current.offsetY + dy,
      },
    }));
    return;
  }
  
  if (!originalElement || !dragStart) {
    // Winkelgruppen-Bearbeitung (Drehen/Verlängern) - braucht kein originalElement
    if (angleEditMode && angleEditBaseId && dragStart) {
      const geo = getAngleGroupGeometry(angleEditBaseId, angleEditOriginals);
      if (!geo) return;
      
      if (angleEditMode === 'rotate') {
        // Blauen Linie-Endpunkt ziehen → Gesamte Rotation + Länge
        const newAngleRad = Math.atan2(locationY - geo.cy, locationX - geo.cx);
        const newLength = Math.max(30, Math.sqrt(
          Math.pow(locationX - geo.cx, 2) + Math.pow(locationY - geo.cy, 2)
        ));
        
        // Winkelversatz bleibt gleich (Winkel zwischen den Linien ändert sich nicht)
        const updatedElements = recalculateAngleGroup(
          angleEditBaseId,
          geo.cx, geo.cy,
          newAngleRad,
          newLength,
          geo.angleOffsetRad,
          geo.anglLineLength,
          false,
        );
        setElements(updatedElements);
      } else if (angleEditMode === 'adjust') {
        // Rote Linie-Endpunkt ziehen → Winkel anpassen + Länge
        const newAngleLineRad = Math.atan2(locationY - geo.cy, locationX - geo.cx);
        const newLength = Math.max(30, Math.sqrt(
          Math.pow(locationX - geo.cx, 2) + Math.pow(locationY - geo.cy, 2)
        ));
        
        // Neuer Winkelversatz = neue Richtung - Referenzlinie Richtung
        const newAngleOffset = newAngleLineRad - geo.refAngleRad;
        
        const updatedElements = recalculateAngleGroup(
          angleEditBaseId,
          geo.cx, geo.cy,
          geo.refAngleRad,
          geo.refLength,
          newAngleOffset,
          newLength,
          false,
        );
        setElements(updatedElements);
      }
      return;
    }
    return;
  }

  const dx = locationX - dragStart.x;
  const dy = locationY - dragStart.y;

  // WINKEL-GRUPPEN-BEWEGUNG: Wenn wir eine Gruppe verschieben
  if (movingGroupBaseId && originalGroupElements.length > 0 && dragMode === 'move') {
    const groupIds = getAngleGroupElementIds(movingGroupBaseId);
    
    const newElements = elements.map(el => {
      if (!groupIds.includes(el.id)) return el;
      
      // Finde das Original-Element
      const origEl = originalGroupElements.find(oe => oe.id === el.id);
      if (!origEl) return el;
      
      const newEl = { ...el };
      
      if (el.type === 'line') {
        // Linien (ref-line, angle-line)
        newEl.data = {
          ...el.data,
          x1: origEl.data.x1 + dx,
          y1: origEl.data.y1 + dy,
          x2: origEl.data.x2 + dx,
          y2: origEl.data.y2 + dy,
        };
      } else if (el.type === 'path') {
        // Bogen (arc) - SVG Pfad verschieben
        // Arc-Pfad hat Format: M x1 y1 A rx ry x-axis-rotation large-arc-flag sweep-flag x2 y2
        // Wir müssen M x1 y1 und die letzten x2 y2 vom A-Befehl verschieben
        const arcRegex = /M\s*(-?\d+\.?\d*)\s+(-?\d+\.?\d*)\s+A\s+(-?\d+\.?\d*)\s+(-?\d+\.?\d*)\s+(-?\d+\.?\d*)\s+(\d)\s+(\d)\s+(-?\d+\.?\d*)\s+(-?\d+\.?\d*)/;
        const arcMatch = origEl.data.match(arcRegex);
        if (arcMatch) {
          const [_, mx, my, rx, ry, xAxisRot, largeArc, sweep, ax, ay] = arcMatch;
          newEl.data = `M ${parseFloat(mx) + dx} ${parseFloat(my) + dy} A ${rx} ${ry} ${xAxisRot} ${largeArc} ${sweep} ${parseFloat(ax) + dx} ${parseFloat(ay) + dy}`;
        }
      } else if (el.type === 'text') {
        // Text
        newEl.x = (origEl.x || 0) + dx;
        newEl.y = (origEl.y || 0) + dy;
      }
      
      return newEl;
    });
    
    setElements(newElements);
    return;
  }

  const newElements = elements.map(el => {
    if (el.id !== selectedElementId) return el;

    const newEl = { ...el };

    if (dragMode === 'move') {
      // Check if we're editing a specific polyline point
      if (el.type === 'polyline' && editingPolylinePoint !== null) {
        // Move only the specific point
        const newPoints = originalElement.data.points.map((pt: { x: number; y: number }, idx: number) => {
          if (idx === editingPolylinePoint) {
            return { x: pt.x + dx, y: pt.y + dy };
          }
          return pt;
        });
        newEl.data = { ...el.data, points: newPoints };
        
        // Lupe-Position aktualisieren für Polygon-Eckpunkte
        if (showMagnifier) {
          const currentPoint = originalElement.data.points[editingPolylinePoint];
          const newX = currentPoint.x + dx;
          const newY = currentPoint.y + dy;
          setMagnifierTargetPosition({ x: newX, y: newY });
          setMagnifierPosition({ x: locationX + (canvasLayout?.x || 0), y: locationY + (canvasLayout?.y || 0) });
        }
      } else if (el.type === 'path') {
        // Move path by shifting all coordinates
        const pathRegex = /([ML])\s*(-?\d+\.?\d*)\s+(-?\d+\.?\d*)/g;
        newEl.data = originalElement.data.replace(pathRegex, (match: string, cmd: string, x: string, y: string) => {
          return `${cmd} ${parseFloat(x) + dx} ${parseFloat(y) + dy}`;
        });
      } else if (el.type === 'line' || el.type === 'arrow' || el.type === 'pointer' || el.type === 'memo') {
        newEl.data = {
          ...el.data,
          x1: originalElement.data.x1 + dx,
          y1: originalElement.data.y1 + dy,
          x2: originalElement.data.x2 + dx,
          y2: originalElement.data.y2 + dy,
        };
      } else if (el.type === 'circle') {
        newEl.data = {
          ...el.data,
          cx: originalElement.data.cx + dx,
          cy: originalElement.data.cy + dy,
        };
      } else if (el.type === 'rect') {
        newEl.data = {
          ...el.data,
          x: originalElement.data.x + dx,
          y: originalElement.data.y + dy,
        };
      } else if (el.type === 'text' || el.type === 'image') {
        newEl.x = (originalElement.x || 0) + dx;
        newEl.y = (originalElement.y || 0) + dy;
      } else if (el.type === 'polyline') {
        // Move polyline by shifting all points
        const newPoints = originalElement.data.points.map((pt: { x: number; y: number }) => ({
          x: pt.x + dx,
          y: pt.y + dy,
        }));
        newEl.data = { ...el.data, points: newPoints };
      } else if (el.type === 'path') {
        // Move path by shifting all coordinates in the SVG path string
        const pathRegex = /([MLQ])\s*(-?\d+\.?\d*)\s+(-?\d+\.?\d*)/g;
        newEl.data = originalElement.data.replace(pathRegex, (match: string, cmd: string, x: string, y: string) => {
          return `${cmd} ${parseFloat(x) + dx} ${parseFloat(y) + dy}`;
        });
      } else if (el.type === 'polygon') {
        // Move polygon by shifting all coordinates in the SVG path string
        // Format: "M x y L x y L x y ... Z"
        const pathRegex = /([ML])\s*(-?\d+\.?\d*)\s+(-?\d+\.?\d*)/g;
        let newPath = originalElement.data.replace(pathRegex, (match: string, cmd: string, x: string, y: string) => {
          return `${cmd} ${parseFloat(x) + dx} ${parseFloat(y) + dy}`;
        });
        // Keep the Z at the end if present
        if (originalElement.data.includes('Z') && !newPath.includes('Z')) {
          newPath += ' Z';
        }
        newEl.data = newPath;
      }
    } else if (dragMode === 'rotate' && resizeHandle === 'rotate') {
      // Rotate element
      let centerX = 0, centerY = 0;
      
      if (el.type === 'circle') {
        centerX = originalElement.data.cx;
        centerY = originalElement.data.cy;
      } else if (el.type === 'line' || el.type === 'arrow' || el.type === 'pointer' || el.type === 'memo') {
        centerX = (originalElement.data.x1 + originalElement.data.x2) / 2;
        centerY = (originalElement.data.y1 + originalElement.data.y2) / 2;
      } else if (el.type === 'rect') {
        centerX = originalElement.data.x + originalElement.data.width / 2;
        centerY = originalElement.data.y + originalElement.data.height / 2;
      } else if (el.type === 'image' || el.type === 'text') {
        centerX = (originalElement.x || 0) + ((originalElement.width || 50) / 2);
        centerY = (originalElement.y || 0) + ((originalElement.height || 50) / 2);
      }
      
      const startAngle = Math.atan2(dragStart.y - centerY, dragStart.x - centerX);
      const currentAngle = Math.atan2(locationY - centerY, locationX - centerX);
      const rotationDelta = ((currentAngle - startAngle) * 180 / Math.PI);
      const originalRotation = originalElement.rotation || 0;

      if (el.type === 'line' || el.type === 'arrow') {
        // Maßlinien/Linien: Endpunkte DIREKT rotieren statt transform-rotate.
        // Grund: react-native-svg rotiert Marker-Pfeilspitzen und den Maßtext NICHT mit,
        // wenn nur die <Line> ein transform bekommt. Mit rotierten Koordinaten folgen
        // Pfeilspitzen (orient=auto) und Textwinkel automatisch der neuen Richtung.
        // Eine evtl. vorhandene Alt-Rotation wird dabei in die Koordinaten "eingebacken".
        const rad = (currentAngle - startAngle) + (originalRotation * Math.PI / 180);
        const rotPoint = (px: number, py: number) => ({
          x: centerX + (px - centerX) * Math.cos(rad) - (py - centerY) * Math.sin(rad),
          y: centerY + (px - centerX) * Math.sin(rad) + (py - centerY) * Math.cos(rad),
        });
        const rp1 = rotPoint(originalElement.data.x1, originalElement.data.y1);
        const rp2 = rotPoint(originalElement.data.x2, originalElement.data.y2);
        newEl.data = { ...el.data, x1: rp1.x, y1: rp1.y, x2: rp2.x, y2: rp2.y };
        newEl.rotation = 0;
      } else {
        newEl.rotation = originalRotation + rotationDelta;
      }
    } else if (dragMode === 'resize' && resizeHandle) {
      // Resize element
      if (el.type === 'circle' && resizeHandle === 'radius') {
        const newRadius = Math.sqrt(
          Math.pow(locationX - originalElement.data.cx, 2) + 
          Math.pow(locationY - originalElement.data.cy, 2)
        );
        newEl.data = { ...el.data, r: Math.max(10, newRadius) };
      } else if (el.type === 'line' || el.type === 'arrow' || el.type === 'pointer' || el.type === 'memo') {
        if (resizeHandle === 'start') {
          newEl.data = { ...el.data, x1: locationX, y1: locationY };
          // Lupe-Position aktualisieren
          if (showMagnifier) {
            setMagnifierTargetPosition({ x: locationX, y: locationY });
            setMagnifierPosition({ x: locationX + (canvasLayout?.x || 0), y: locationY + (canvasLayout?.y || 0) });
          }
        } else if (resizeHandle === 'end') {
          newEl.data = { ...el.data, x2: locationX, y2: locationY };
          // Lupe-Position aktualisieren
          if (showMagnifier) {
            setMagnifierTargetPosition({ x: locationX, y: locationY });
            setMagnifierPosition({ x: locationX + (canvasLayout?.x || 0), y: locationY + (canvasLayout?.y || 0) });
          }
        }
      } else if (el.type === 'rect') {
        let newData = { ...el.data };
        const origData = originalElement.data;
        
        if (resizeHandle.includes('right')) {
          newData.width = origData.width + dx;
        }
        if (resizeHandle.includes('left')) {
          newData.x = origData.x + dx;
          newData.width = origData.width - dx;
        }
        if (resizeHandle.includes('bottom')) {
          newData.height = origData.height + dy;
        }
        if (resizeHandle.includes('top')) {
          newData.y = origData.y + dy;
          newData.height = origData.height - dy;
        }
        
        newEl.data = newData;
      } else if (el.type === 'image') {
        // Proportionales Resize - Seitenverhältnis beibehalten
        const origX = originalElement.x || 0;
        const origY = originalElement.y || 0;
        const origW = originalElement.width || 100;
        const origH = originalElement.height || 100;
        const aspectRatio = origW / origH;
        
        let newX = origX;
        let newY = origY;
        let newW = origW;
        let newH = origH;
        
        if (resizeHandle === 'bottom-right') {
          // Diagonal resize von rechts unten - proportional
          const delta = Math.max(dx, dy * aspectRatio);
          newW = origW + delta;
          newH = newW / aspectRatio;
        } else if (resizeHandle === 'top-left') {
          // Diagonal resize von links oben - proportional
          const delta = Math.max(-dx, -dy * aspectRatio);
          newW = origW + delta;
          newH = newW / aspectRatio;
          newX = origX - delta;
          newY = origY - (newH - origH);
        } else if (resizeHandle === 'top-right') {
          // Diagonal resize von rechts oben - proportional
          const delta = Math.max(dx, -dy * aspectRatio);
          newW = origW + delta;
          newH = newW / aspectRatio;
          newY = origY - (newH - origH);
        } else if (resizeHandle === 'bottom-left') {
          // Diagonal resize von links unten - proportional
          const delta = Math.max(-dx, dy * aspectRatio);
          newW = origW + delta;
          newH = newW / aspectRatio;
          newX = origX - delta;
        }
        
        // Mindestgröße einhalten
        if (newW >= 40 && newH >= 40) {
          newEl.x = newX;
          newEl.y = newY;
          newEl.width = newW;
          newEl.height = newH;
        }
      } else if (el.type === 'text') {
        // Text-Resize: Schriftgröße basierend auf Drag-Distanz ändern
        const origFontSize = originalElement.fontSize || 20;
        const origX = originalElement.x || 0;
        const origY = originalElement.y || 0;
        
        // Berechne neue Schriftgröße basierend auf der Ziehrichtung
        // Diagonale Handles: Größer = beide Richtungen positiv
        let scaleFactor = 1;
        
        if (resizeHandle === 'bottom-right') {
          // Ziehen nach rechts-unten vergrößert
          scaleFactor = 1 + (dx + dy) / 200;
        } else if (resizeHandle === 'top-left') {
          // Ziehen nach links-oben vergrößert (umgekehrt)
          scaleFactor = 1 + (-dx - dy) / 200;
          // Position anpassen damit Text an gleicher Stelle bleibt
          const newFontSize = Math.max(8, Math.min(200, origFontSize * scaleFactor));
          const fontSizeDiff = newFontSize - origFontSize;
          newEl.y = origY + fontSizeDiff;
        } else if (resizeHandle === 'top-right') {
          // Ziehen nach rechts-oben vergrößert
          scaleFactor = 1 + (dx - dy) / 200;
          const newFontSize = Math.max(8, Math.min(200, origFontSize * scaleFactor));
          const fontSizeDiff = newFontSize - origFontSize;
          newEl.y = origY + fontSizeDiff;
        } else if (resizeHandle === 'bottom-left') {
          // Ziehen nach links-unten vergrößert
          scaleFactor = 1 + (-dx + dy) / 200;
        }
        
        // Neue Schriftgröße berechnen mit Mindest- und Maximalgröße
        const newFontSize = Math.max(8, Math.min(200, origFontSize * scaleFactor));
        newEl.fontSize = Math.round(newFontSize);
      }
    }

    return newEl;
  });

  setElements(newElements);
}

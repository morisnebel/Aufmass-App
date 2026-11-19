import React from 'react';
import { DrawElement } from '../../../sketch/sketchShared';
import { Line, Circle, Rect, Text as SvgText, G } from 'react-native-svg';


export type RenderSketchTransformHandlesCtx = {
  scale: number;
  isAngleGroupElement: (elementId: string) => boolean;
  getAngleGroupBaseId: (elementId: string) => string | null;
  getAngleGroupGeometry: (baseId: string, els?: DrawElement[]) => { cx: any; cy: any; refAngleRad: number; refLength: number; angleLineRad: number; anglLineLength: number; angleOffsetRad: number; } | null;
};

export function renderSketchTransformHandles(ctx: RenderSketchTransformHandlesCtx, element: DrawElement) {
  const {
    scale, isAngleGroupElement, getAngleGroupBaseId, getAngleGroupGeometry,
  } = ctx;
  const handles: JSX.Element[] = [];
  
  // Skalierte Handle-Größen basierend auf Zoom-Level
  // Kleinere Basis-Werte für kompaktere Handles
  const baseHandleRadius = 5; // Kleiner als vorher (war 8)
  const baseRotateRadius = 6; // Kleiner als vorher (war 10)
  const baseStrokeWidth = 1.5;
  const baseFontSize = 8;
  const baseRotateFontSize = 10;
  
  // Skalierung: Bei Zoom > 1 werden Handles kleiner, bei Zoom < 1 werden sie größer
  const scaledHandleRadius = Math.max(3, baseHandleRadius / Math.max(scale, 0.5));
  const scaledRotateRadius = Math.max(4, baseRotateRadius / Math.max(scale, 0.5));
  const scaledStrokeWidth = Math.max(0.5, baseStrokeWidth / Math.max(scale, 0.5));
  const scaledFontSize = Math.max(5, baseFontSize / Math.max(scale, 0.5));
  const scaledRotateFontSize = Math.max(6, baseRotateFontSize / Math.max(scale, 0.5));
  const scaledRotateOffset = Math.max(15, 30 / Math.max(scale, 0.5));
  
  // Winkelgruppen: Nur einfache Auswahl-Markierung (verschieben als Ganzes)
  if (isAngleGroupElement(element.id)) {
    const baseId = getAngleGroupBaseId(element.id);
    const geo = baseId ? getAngleGroupGeometry(baseId) : null;
    
    if (geo) {
      const refEndX = geo.cx + geo.refLength * Math.cos(geo.refAngleRad);
      const refEndY = geo.cy + geo.refLength * Math.sin(geo.refAngleRad);
      const angleEndX = geo.cx + geo.anglLineLength * Math.cos(geo.angleLineRad);
      const angleEndY = geo.cy + geo.anglLineLength * Math.sin(geo.angleLineRad);
      const strokeW = Math.max(2, 3 / Math.max(scale, 0.5));
      const centerSize = Math.max(8, 12 / Math.max(scale, 0.5));
      
      // Auswahl-Rahmen: Gestrichelte Linien
      handles.push(
        <Line key="angle-ref-dash" x1={geo.cx} y1={geo.cy} x2={refEndX} y2={refEndY} 
          stroke="rgba(33,150,243,0.5)" strokeWidth={strokeW * 2} strokeDasharray={`${8/Math.max(scale,0.5)},${4/Math.max(scale,0.5)}`} />
      );
      handles.push(
        <Line key="angle-adj-dash" x1={geo.cx} y1={geo.cy} x2={angleEndX} y2={angleEndY} 
          stroke="rgba(244,67,54,0.5)" strokeWidth={strokeW * 2} strokeDasharray={`${8/Math.max(scale,0.5)},${4/Math.max(scale,0.5)}`} />
      );
      
      // Verschiebe-Griff am Mittelpunkt
      handles.push(
        <G key="angle-center">
          <Circle cx={geo.cx} cy={geo.cy} r={centerSize} fill="rgba(255,255,255,0.9)" stroke="#FF5722" strokeWidth={strokeW} />
          <SvgText x={geo.cx} y={geo.cy + centerSize * 0.35} fill="#FF5722" fontSize={centerSize * 0.8} textAnchor="middle" fontWeight="bold">✥</SvgText>
        </G>
      );
    }
    return <G>{handles}</G>;
  }
  
  if (element.type === 'rect') {
    const { x, y, width: w, height: h } = element.data;
    const handlePositions = [
      { x, y, label: '↖' },
      { x: x + w / 2, y, label: '↑' },
      { x: x + w, y, label: '↗' },
      { x, y: y + h / 2, label: '←' },
      { x: x + w, y: y + h / 2, label: '→' },
      { x, y: y + h, label: '↙' },
      { x: x + w / 2, y: y + h, label: '↓' },
      { x: x + w, y: y + h, label: '↘' },
    ];
    
    handlePositions.forEach((pos, idx) => {
      handles.push(
        <G key={`handle-${idx}`}>
          <Circle cx={pos.x} cy={pos.y} r={scaledHandleRadius} fill="#4caf50" stroke="#fff" strokeWidth={scaledStrokeWidth} />
          <SvgText x={pos.x - scaledFontSize * 0.4} y={pos.y + scaledFontSize * 0.5} fill="#fff" fontSize={scaledFontSize}>{pos.label}</SvgText>
        </G>
      );
    });
    
    // Rotation handle
    handles.push(
      <G key="rotate">
        <Circle cx={x + w / 2} cy={y - scaledRotateOffset} r={scaledRotateRadius} fill="#FF9800" stroke="#fff" strokeWidth={scaledStrokeWidth} />
        <SvgText x={x + w / 2 - scaledRotateFontSize * 0.4} y={y - scaledRotateOffset + scaledRotateFontSize * 0.4} fill="#fff" fontSize={scaledRotateFontSize}>↻</SvgText>
      </G>
    );
  } else if (element.type === 'circle') {
    const { cx, cy, r } = element.data;
    handles.push(
      <G key="radius">
        <Circle cx={cx + r} cy={cy} r={scaledHandleRadius} fill="#4caf50" stroke="#fff" strokeWidth={scaledStrokeWidth} />
        <SvgText x={cx + r - scaledFontSize * 0.4} y={cy + scaledFontSize * 0.5} fill="#fff" fontSize={scaledFontSize}>↔</SvgText>
      </G>
    );
    handles.push(
      <G key="rotate">
        <Circle cx={cx} cy={cy - r - scaledRotateOffset} r={scaledRotateRadius} fill="#FF9800" stroke="#fff" strokeWidth={scaledStrokeWidth} />
        <SvgText x={cx - scaledRotateFontSize * 0.4} y={cy - r - scaledRotateOffset + scaledRotateFontSize * 0.4} fill="#fff" fontSize={scaledRotateFontSize}>↻</SvgText>
      </G>
    );
  } else if (element.type === 'line' || element.type === 'arrow' || element.type === 'pointer' || element.type === 'memo') {
    const { x1, y1, x2, y2 } = element.data;
    handles.push(
      <Circle key="start" cx={x1} cy={y1} r={scaledHandleRadius} fill="#2196f3" stroke="#fff" strokeWidth={scaledStrokeWidth} />
    );
    handles.push(
      <Circle key="end" cx={x2} cy={y2} r={scaledHandleRadius} fill="#2196f3" stroke="#fff" strokeWidth={scaledStrokeWidth} />
    );
    const midX = (x1 + x2) / 2;
    const midY = (y1 + y2) / 2;
    handles.push(
      <G key="rotate">
        <Circle cx={midX} cy={midY - scaledRotateOffset} r={scaledRotateRadius} fill="#FF9800" stroke="#fff" strokeWidth={scaledStrokeWidth} />
        <SvgText x={midX - scaledRotateFontSize * 0.4} y={midY - scaledRotateOffset + scaledRotateFontSize * 0.4} fill="#fff" fontSize={scaledRotateFontSize}>↻</SvgText>
      </G>
    );
  } else if (element.type === 'image') {
    const imgX = element.x || 0;
    const imgY = element.y || 0;
    const imgW = element.width || 100;
    const imgH = element.height || 100;
    
    const corners = [
      { x: imgX, y: imgY },
      { x: imgX + imgW, y: imgY },
      { x: imgX, y: imgY + imgH },
      { x: imgX + imgW, y: imgY + imgH },
    ];
    
    corners.forEach((pos, idx) => {
      handles.push(
        <Circle key={`corner-${idx}`} cx={pos.x} cy={pos.y} r={scaledHandleRadius} fill="#4caf50" stroke="#fff" strokeWidth={scaledStrokeWidth} />
      );
    });
    
    handles.push(
      <G key="rotate">
        <Circle cx={imgX + imgW / 2} cy={imgY - scaledRotateOffset} r={scaledRotateRadius} fill="#FF9800" stroke="#fff" strokeWidth={scaledStrokeWidth} />
        <SvgText x={imgX + imgW / 2 - scaledRotateFontSize * 0.4} y={imgY - scaledRotateOffset + scaledRotateFontSize * 0.4} fill="#fff" fontSize={scaledRotateFontSize}>↻</SvgText>
      </G>
    );
  } else if (element.type === 'text') {
    // Text-Elemente: Bounding Box und Griffe anzeigen
    const textX = element.x || 0;
    const textY = element.y || 0;
    const fontSize = element.fontSize || 20;
    const text = element.data?.text || '';
    
    // Berechne ungefähre Textabmessungen
    // Breite: ca. 0.6 * fontSize pro Zeichen (Schätzung)
    // Höhe: fontSize
    const estimatedWidth = Math.max(text.length * fontSize * 0.6, 40);
    const estimatedHeight = fontSize * 1.2;
    
    // Bounding Box um den Text (Text sitzt auf der Baseline, also nach oben verschieben)
    const boxX = textX - 5;
    const boxY = textY - estimatedHeight;
    const boxWidth = estimatedWidth + 10;
    const boxHeight = estimatedHeight + 10;
    
    // Gestrichelte Bounding Box
    handles.push(
      <Rect
        key="text-bounds"
        x={boxX}
        y={boxY}
        width={boxWidth}
        height={boxHeight}
        fill="none"
        stroke="#2196f3"
        strokeWidth={scaledStrokeWidth * 1.5}
        strokeDasharray={`${4 / Math.max(scale, 0.5)},${4 / Math.max(scale, 0.5)}`}
      />
    );
    
    // Eck-Griffe
    const corners = [
      { x: boxX, y: boxY, label: '↖' },
      { x: boxX + boxWidth, y: boxY, label: '↗' },
      { x: boxX, y: boxY + boxHeight, label: '↙' },
      { x: boxX + boxWidth, y: boxY + boxHeight, label: '↘' },
    ];
    
    corners.forEach((pos, idx) => {
      handles.push(
        <G key={`text-corner-${idx}`}>
          <Circle cx={pos.x} cy={pos.y} r={scaledHandleRadius} fill="#2196f3" stroke="#fff" strokeWidth={scaledStrokeWidth} />
        </G>
      );
    });
    
    // Rotations-Griff
    handles.push(
      <G key="text-rotate">
        <Circle cx={boxX + boxWidth / 2} cy={boxY - scaledRotateOffset} r={scaledRotateRadius} fill="#FF9800" stroke="#fff" strokeWidth={scaledStrokeWidth} />
        <SvgText x={boxX + boxWidth / 2 - scaledRotateFontSize * 0.4} y={boxY - scaledRotateOffset + scaledRotateFontSize * 0.4} fill="#fff" fontSize={scaledRotateFontSize}>↻</SvgText>
      </G>
    );
  } else if (element.type === 'polygon' || element.type === 'path') {
    // Polygon/Path: Nur für diese Typen (NICHT polyline - das hat seinen eigenen Handle)
    let polygonPoints: { x: number; y: number }[] = [];
    
    if (typeof element.data === 'string') {
      // Polygon/Path haben SVG path string
      const pathRegex = /([MLQ])\s*(-?\d+\.?\d*)\s+(-?\d+\.?\d*)/g;
      let match;
      while ((match = pathRegex.exec(element.data)) !== null) {
        polygonPoints.push({ x: parseFloat(match[2]), y: parseFloat(match[3]) });
      }
    }
    
    if (polygonPoints.length >= 2) {
      // Berechne Bounding Box
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      polygonPoints.forEach(pt => {
        minX = Math.min(minX, pt.x);
        minY = Math.min(minY, pt.y);
        maxX = Math.max(maxX, pt.x);
        maxY = Math.max(maxY, pt.y);
      });
      
      const centerX = (minX + maxX) / 2;
      const centerY = (minY + maxY) / 2;
      const boxWidth = maxX - minX;
      const boxHeight = maxY - minY;
      
      const padding = 10 / Math.max(scale, 0.5);
      
      // Gestrichelte Bounding Box
      handles.push(
        <Rect
          key="polygon-bounds"
          x={minX - padding}
          y={minY - padding}
          width={boxWidth + padding * 2}
          height={boxHeight + padding * 2}
          fill="none"
          stroke="#4caf50"
          strokeWidth={2 / Math.max(scale, 0.5)}
          strokeDasharray={`${6 / Math.max(scale, 0.5)},${4 / Math.max(scale, 0.5)}`}
          rx={4 / Math.max(scale, 0.5)}
        />
      );
      
      // Mittelpunkt-Handle zum Verschieben
      const moveHandleSize = Math.max(20, 28 / Math.max(scale, 0.5));
      handles.push(
        <G key="center-move">
          <Circle 
            cx={centerX} 
            cy={centerY} 
            r={moveHandleSize} 
            fill="rgba(76, 175, 80, 0.3)" 
            stroke="#4caf50" 
            strokeWidth={2 / Math.max(scale, 0.5)} 
          />
          <Circle 
            cx={centerX} 
            cy={centerY} 
            r={moveHandleSize * 0.5} 
            fill="#4caf50" 
            stroke="#fff" 
            strokeWidth={1.5 / Math.max(scale, 0.5)} 
          />
          <SvgText 
            x={centerX} 
            y={centerY + (moveHandleSize * 0.2)} 
            fill="#fff" 
            fontSize={moveHandleSize * 0.6}
            textAnchor="middle"
            fontWeight="bold"
          >✥</SvgText>
        </G>
      );
    }
  }
  
  return <G>{handles}</G>;
}

// SVG-Vorschau-Erzeugung für Skizzen (ausgelagert aus app/sketches/draw.tsx)
// Baut aus den Zeichen-Elementen ein eigenständiges SVG (als data:-URI) für PDF/Vorschau.
import { DrawElement } from './sketchShared';

export interface PreviewSvgContext {
  elements: DrawElement[];
  canvasHeight: number;
  screenWidth: number;
  legendPosition: any;
  lineSegmentMeasurements: any;
  measureLineStyles: any;
  polygonAreaVisible: any;
  getPolylineElementsWithMeasurements: () => any[];
  calculatePolygonAreaM2: (el: any) => number;
  formatAreaM2: (n: number) => string;
  calculateTotalLfmForElement: (el: any) => number;
}

export function buildPreviewSvg(ctx: PreviewSvgContext): string {
  const {
    elements, canvasHeight, screenWidth, legendPosition,
    lineSegmentMeasurements, measureLineStyles, polygonAreaVisible,
    getPolylineElementsWithMeasurements, calculatePolygonAreaM2,
    formatAreaM2, calculateTotalLfmForElement,
  } = ctx;
    // NEW ARCHITECTURE: Use viewBox for scaling instead of transforming coordinates
    // This preserves original element sizes (especially text) and lets the browser handle scaling
    
    // Calculate bounds of all elements
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    let hasValidBounds = false;
    
    elements.forEach(el => {
      if (el.type === 'path') {
        const matches = el.data.match(/(-?\d+\.?\d*)/g);
        if (matches) {
          for (let i = 0; i < matches.length; i += 2) {
            const x = parseFloat(matches[i]);
            const y = parseFloat(matches[i + 1]);
            if (!isNaN(x) && !isNaN(y)) {
              minX = Math.min(minX, x);
              maxX = Math.max(maxX, x);
              minY = Math.min(minY, y);
              maxY = Math.max(maxY, y);
              hasValidBounds = true;
            }
          }
        }
      } else if (el.type === 'line' || el.type === 'arrow' || el.type === 'pointer' || el.type === 'memo') {
        minX = Math.min(minX, el.data.x1, el.data.x2);
        maxX = Math.max(maxX, el.data.x1, el.data.x2);
        minY = Math.min(minY, el.data.y1, el.data.y2);
        maxY = Math.max(maxY, el.data.y1, el.data.y2);
        // For text on arrows, account for text offset
        if (el.type === 'arrow' && el.data.text) {
          const textOffset = 20;
          minY = Math.min(minY, el.data.y1 - textOffset, el.data.y2 - textOffset);
        }
        if ((el.type === 'pointer' || el.type === 'memo') && el.data.text) {
          const fontSize = el.data.fontSize || 16;
          const textOffset = 30 + fontSize;
          minX = Math.min(minX, el.data.x1 - textOffset);
          minY = Math.min(minY, el.data.y1 - textOffset);
          maxX = Math.max(maxX, el.data.x1 + (el.data.text.length * fontSize * 0.6));
        }
        hasValidBounds = true;
      } else if (el.type === 'circle') {
        minX = Math.min(minX, el.data.cx - el.data.r);
        maxX = Math.max(maxX, el.data.cx + el.data.r);
        minY = Math.min(minY, el.data.cy - el.data.r);
        maxY = Math.max(maxY, el.data.cy + el.data.r);
        hasValidBounds = true;
      } else if (el.type === 'rect') {
        minX = Math.min(minX, el.data.x);
        maxX = Math.max(maxX, el.data.x + el.data.width);
        minY = Math.min(minY, el.data.y);
        maxY = Math.max(maxY, el.data.y + el.data.height);
        hasValidBounds = true;
      } else if (el.type === 'image' || el.type === 'text') {
        const x = el.x || 0;
        const y = el.y || 0;
        const w = el.width || (el.type === 'text' ? (el.data?.text?.length || 10) * ((el.fontSize || 20) * 0.6) : 50);
        const h = el.height || (el.type === 'text' ? (el.fontSize || 20) + 10 : 50);
        
        // Bei Rotation die gedrehten Ecken berechnen
        if (el.rotation && el.type === 'image') {
          const cx = x + w / 2;
          const cy = y + h / 2;
          const rad = (el.rotation * Math.PI) / 180;
          const cos = Math.cos(rad);
          const sin = Math.sin(rad);
          // Alle 4 Ecken rotieren
          const corners = [
            { x: x, y: y },
            { x: x + w, y: y },
            { x: x + w, y: y + h },
            { x: x, y: y + h },
          ];
          corners.forEach(corner => {
            const dx = corner.x - cx;
            const dy = corner.y - cy;
            const rx = cx + dx * cos - dy * sin;
            const ry = cy + dx * sin + dy * cos;
            minX = Math.min(minX, rx);
            maxX = Math.max(maxX, rx);
            minY = Math.min(minY, ry);
            maxY = Math.max(maxY, ry);
          });
        } else {
          minX = Math.min(minX, x);
          maxX = Math.max(maxX, x + w);
          // For text, y is the baseline, so we need to account for the height above baseline
          minY = Math.min(minY, y - (el.type === 'text' ? (el.fontSize || 20) : 0));
          maxY = Math.max(maxY, y + h);
        }
        hasValidBounds = true;
      } else if (el.type === 'polyline' && el.data?.points) {
        el.data.points.forEach((pt: { x: number; y: number }) => {
          minX = Math.min(minX, pt.x);
          maxX = Math.max(maxX, pt.x);
          minY = Math.min(minY, pt.y);
          maxY = Math.max(maxY, pt.y);
        });
        // Account for dimension lines offset (15px) and text
        const elementMeasurements = lineSegmentMeasurements[el.id];
        if (elementMeasurements && Object.keys(elementMeasurements).length > 0) {
          // Add extra space for dimension lines (offset + tick + text)
          minX -= 30;
          maxX += 30;
          minY -= 30;
          maxY += 30;
        }
        hasValidBounds = true;
      } else if (el.type === 'polygon') {
        const matches = el.data.match(/(-?\d+\.?\d*)/g);
        if (matches) {
          for (let i = 0; i < matches.length; i += 2) {
            const x = parseFloat(matches[i]);
            const y = parseFloat(matches[i + 1]);
            if (!isNaN(x) && !isNaN(y)) {
              minX = Math.min(minX, x);
              maxX = Math.max(maxX, x);
              minY = Math.min(minY, y);
              maxY = Math.max(maxY, y);
              hasValidBounds = true;
            }
          }
        }
      }
    });
    
    // If no valid bounds found, use default canvas size
    if (!hasValidBounds) {
      minX = 0;
      minY = 0;
      maxX = 400;
      maxY = 400;
    }
    
    // Add padding
    const padding = 30;
    
    minX -= padding;
    minY -= padding;
    maxX += padding;
    maxY += padding;
    
    // Berechne Legend-Position für die viewBox-Erweiterung
    // VERGRÖSSERTE Legend für PDF/Vorschau
    const polylinesForLegend = getPolylineElementsWithMeasurements();
    const svgLegendWidth = 220; // Noch breiter für bessere Lesbarkeit
    const svgLegendLineHeight = 36; // Deutlich höhere Zeilen
    const svgLegendHeight = polylinesForLegend.length > 0 ? (55 + polylinesForLegend.length * svgLegendLineHeight + 25) : 0;
    
    // Legend-Position berechnen (wird auch später für das Rendering verwendet)
    // Die Legend-Position kommt vom PanResponder Overlay:
    // Default: position absolute, bottom: 150, right: 12 + legendPosition (Drag-Offset)
    // Konvertierung in Canvas-Koordinaten:
    const canvasWidthForLegend = screenWidth;
    const canvasHeightForLegend = canvasHeight;
    // X: right: 12 bedeutet der rechte Rand ist 12px vom Container-Rand → linke Kante = containerWidth - 12 - legendWidth
    const uiStartXLegend = canvasWidthForLegend - 12 - svgLegendWidth;
    // Y: bottom: 150 bedeutet der untere Rand ist 150px vom Container-Bottom
    // In Canvas-Koordinaten: canvasHeight - 150 (Boden der Legend)
    const uiStartYLegend = canvasHeightForLegend - 150;
    const uiFinalXLegend = uiStartXLegend + legendPosition.x;
    const uiFinalYLegend = uiStartYLegend + legendPosition.y;
    
    // SVG-Koordinaten: Direkt Canvas-Koordinaten verwenden (KEIN Offset mit origMinX/Y!)
    // Canvas-Koordinaten = SVG-Koordinaten, die viewBox wird entsprechend erweitert
    const svgLegendXPos = uiFinalXLegend;
    const svgLegendYPos = uiFinalYLegend;
    
    // Erweitere die Bounds um die Legend-Position zu berücksichtigen
    if (polylinesForLegend.length > 0) {
      // Stelle sicher, dass die Legend komplett sichtbar ist
      if (svgLegendXPos < minX) minX = svgLegendXPos - 10;
      if (svgLegendXPos + svgLegendWidth > maxX) maxX = svgLegendXPos + svgLegendWidth + 10;
      if (svgLegendYPos - svgLegendHeight < minY) minY = svgLegendYPos - svgLegendHeight - 10;
      if (svgLegendYPos > maxY) maxY = svgLegendYPos + 10;
    }
    
    // Calculate actual drawing dimensions
    const drawWidth = Math.max(maxX - minX, 100);
    const drawHeight = Math.max(maxY - minY, 100);
    
    // Generate SVG with ORIGINAL coordinates - viewBox handles scaling
    let svgElements = '';
    
    elements.forEach(el => {
      const strokeWidth = el.strokeWidth || 2;
      
      if (el.type === 'path') {
        svgElements += `<path d="${el.data}" stroke="${el.color}" stroke-width="${strokeWidth}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
      } else if (el.type === 'line') {
        const lineCX = (el.data.x1 + el.data.x2) / 2;
        const lineCY = (el.data.y1 + el.data.y2) / 2;
        const lineRot = el.rotation ? ` transform="rotate(${el.rotation} ${lineCX} ${lineCY})"` : '';
        const lineAH = el.data.arrowHeads || 'none';
        if (lineAH !== 'none') {
          svgElements += `<defs>`;
          svgElements += `<marker id="la-end-${el.id}" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto" markerUnits="strokeWidth"><polygon points="0,0 0,6 9,3" fill="${el.color}"/></marker>`;
          if (lineAH === 'both') {
            svgElements += `<marker id="la-start-${el.id}" markerWidth="10" markerHeight="10" refX="0" refY="3" orient="auto" markerUnits="strokeWidth"><polygon points="9,0 9,6 0,3" fill="${el.color}"/></marker>`;
          }
          svgElements += `</defs>`;
          const meStart = lineAH === 'both' ? ` marker-start="url(#la-start-${el.id})"` : '';
          svgElements += `<line x1="${el.data.x1}" y1="${el.data.y1}" x2="${el.data.x2}" y2="${el.data.y2}" stroke="${el.color}" stroke-width="${strokeWidth}" marker-end="url(#la-end-${el.id})"${meStart}${lineRot}/>`;
        } else {
          svgElements += `<line x1="${el.data.x1}" y1="${el.data.y1}" x2="${el.data.x2}" y2="${el.data.y2}" stroke="${el.color}" stroke-width="${strokeWidth}"${lineRot}/>`;
        }
      } else if (el.type === 'circle') {
        const circRot = el.rotation ? ` transform="rotate(${el.rotation} ${el.data.cx} ${el.data.cy})"` : '';
        svgElements += `<circle cx="${el.data.cx}" cy="${el.data.cy}" r="${el.data.r}" stroke="${el.color}" stroke-width="${strokeWidth}" fill="none"${circRot}/>`;
      } else if (el.type === 'rect') {
        const rectCX = el.data.x + el.data.width / 2;
        const rectCY = el.data.y + el.data.height / 2;
        const rectRot = el.rotation ? ` transform="rotate(${el.rotation} ${rectCX} ${rectCY})"` : '';
        svgElements += `<rect x="${el.data.x}" y="${el.data.y}" width="${el.data.width}" height="${el.data.height}" stroke="${el.color}" stroke-width="${strokeWidth}" fill="none"${rectRot}/>`;
      } else if (el.type === 'arrow') {
        const { x1, y1, x2, y2, text, heads } = el.data;
        const angle = Math.atan2(y2 - y1, x2 - x1);
        const angleDeg = angle * 180 / Math.PI;
        const arrowSize = Math.max(10, strokeWidth * 3);
        
        // End arrowhead
        const endX1 = x2 - arrowSize * Math.cos(angle - Math.PI / 6);
        const endY1 = y2 - arrowSize * Math.sin(angle - Math.PI / 6);
        const endX2 = x2 - arrowSize * Math.cos(angle + Math.PI / 6);
        const endY2 = y2 - arrowSize * Math.sin(angle + Math.PI / 6);
        
        svgElements += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${el.color}" stroke-width="${strokeWidth}"/>`;
        svgElements += `<polygon points="${x2},${y2} ${endX1},${endY1} ${endX2},${endY2}" fill="${el.color}"/>`;
        
        // Start arrowhead if double
        if (heads === 'double') {
          const startX1 = x1 + arrowSize * Math.cos(angle - Math.PI / 6);
          const startY1 = y1 + arrowSize * Math.sin(angle - Math.PI / 6);
          const startX2 = x1 + arrowSize * Math.cos(angle + Math.PI / 6);
          const startY2 = y1 + arrowSize * Math.sin(angle + Math.PI / 6);
          svgElements += `<polygon points="${x1},${y1} ${startX1},${startY1} ${startX2},${startY2}" fill="${el.color}"/>`;
        }
        
        // Text on arrow - use original fontSize
        if (text) {
          const midX = (x1 + x2) / 2;
          const midY = (y1 + y2) / 2;
          const fontSize = el.data.fontSize || 14;
          svgElements += `<text x="${midX}" y="${midY - 10}" text-anchor="middle" font-size="${fontSize}" font-weight="bold" fill="${el.color}" transform="rotate(${angleDeg} ${midX} ${midY})">${text}</text>`;
        }
      } else if (el.type === 'pointer') {
        const { x1, y1, x2, y2, text } = el.data;
        const angle = Math.atan2(y2 - y1, x2 - x1);
        const pointerStrokeWidth = el.strokeWidth || 3;
        // Pfeilspitze proportional zur Strichdicke (skaliert für alle Größen)
        const arrowHeadSize = Math.max(12, pointerStrokeWidth * 4);
        const arrowHeadAngle = Math.PI / 6;
        
        // Arrowhead coordinates
        const leftX = x2 - arrowHeadSize * Math.cos(angle - arrowHeadAngle);
        const leftY = y2 - arrowHeadSize * Math.sin(angle - arrowHeadAngle);
        const rightX = x2 - arrowHeadSize * Math.cos(angle + arrowHeadAngle);
        const rightY = y2 - arrowHeadSize * Math.sin(angle + arrowHeadAngle);
        
        // Line ends before arrowhead
        const lineEndX = x2 - arrowHeadSize * 0.6 * Math.cos(angle);
        const lineEndY = y2 - arrowHeadSize * 0.6 * Math.sin(angle);
        
        svgElements += `<line x1="${x1}" y1="${y1}" x2="${lineEndX}" y2="${lineEndY}" stroke="${el.color}" stroke-width="${pointerStrokeWidth}" stroke-linecap="round"/>`;
        svgElements += `<polygon points="${x2},${y2} ${leftX},${leftY} ${rightX},${rightY}" fill="${el.color}"/>`;
        
        // Memo text at start point
        if (text) {
          const fontSize = el.data.fontSize || 16;
          const textOffset = 15;
          const textX = x1 + textOffset * Math.cos(angle - Math.PI / 2);
          const textY = y1 + textOffset * Math.sin(angle - Math.PI / 2);
          const textWidth = text.length * fontSize * 0.6 + 10;
          const textHeight = fontSize + 8;
          // Rahmen-Strichdicke proportional zur Pfeil-Strichdicke
          const textStrokeWidth = Math.max(1, pointerStrokeWidth / 3);
          
          svgElements += `<rect x="${textX - 5}" y="${textY - fontSize}" width="${textWidth}" height="${textHeight}" fill="white" fill-opacity="0.9" rx="4" stroke="${el.color}" stroke-width="${textStrokeWidth}"/>`;
          svgElements += `<text x="${textX}" y="${textY}" font-size="${fontSize}" fill="${el.color}" font-weight="bold">${text}</text>`;
        }
      } else if (el.type === 'memo') {
        // Memo/Notiz: Roter Ankerpunkt mit gestrichelter Linie zu Textlabel
        const { x1, y1, x2, y2, text } = el.data;
        const memoFontSize = el.data.fontSize || 14;
        const memoScaleFactor = memoFontSize / 14;
        const memoLineStroke = Math.max(1, 2 * memoScaleFactor);
        const memoAnchorRadius = Math.max(3, 6 * memoScaleFactor);
        const memoFrameStroke = Math.max(1, 2 * memoScaleFactor);
        const memoFrameRadius = Math.max(2, 4 * memoScaleFactor);
        const memoDashArray = `${6 * memoScaleFactor},${4 * memoScaleFactor}`;
        
        // Gestrichelte Verbindungslinie
        svgElements += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${el.color}" stroke-width="${memoLineStroke}" stroke-dasharray="${memoDashArray}"/>`;
        
        // Roter Ankerpunkt (gefüllter Kreis)
        svgElements += `<circle cx="${x1}" cy="${y1}" r="${memoAnchorRadius}" fill="${el.color}" stroke="${el.color}" stroke-width="${memoLineStroke}"/>`;
        
        // Textlabel mit Rahmen
        if (text) {
          const memoLabelWidth = Math.max(60 * memoScaleFactor, text.length * memoFontSize * 0.6 + 20 * memoScaleFactor);
          const memoLabelHeight = memoFontSize + 14 * memoScaleFactor;
          
          // Weißer Hintergrund mit farbigem Rahmen
          svgElements += `<rect x="${x2 - memoLabelWidth / 2}" y="${y2 - memoLabelHeight / 2}" width="${memoLabelWidth}" height="${memoLabelHeight}" fill="white" rx="${memoFrameRadius}" ry="${memoFrameRadius}" stroke="${el.color}" stroke-width="${memoFrameStroke}"/>`;
          // Text
          svgElements += `<text x="${x2}" y="${y2 + memoFontSize / 3}" font-size="${memoFontSize}" fill="${el.color}" font-weight="bold" text-anchor="middle">${text}</text>`;
        }
      } else if (el.type === 'text') {
        const x = el.x || 0;
        const y = el.y || 0;
        const fontSize = el.fontSize || 20;
        const textRot = el.rotation ? ` transform="rotate(${el.rotation} ${x} ${y})"` : '';
        svgElements += `<text x="${x}" y="${y}" font-size="${fontSize}" fill="${el.color}" font-weight="${el.fontWeight || 'bold'}" font-style="${el.fontStyle || 'normal'}"${textRot}>${el.data.text}</text>`;
      } else if (el.type === 'image' && el.data?.uri) {
        const x = el.x || 0;
        const y = el.y || 0;
        const w = el.width || 100;
        const h = el.height || 100;
        const imgCenterX = x + w / 2;
        const imgCenterY = y + h / 2;
        const imgRotation = el.rotation ? ` transform="rotate(${el.rotation} ${imgCenterX} ${imgCenterY})"` : '';
        svgElements += `<image href="${el.data.uri}" x="${x}" y="${y}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid meet"${imgRotation}/>`;
      } else if (el.type === 'polyline' && el.data?.points && el.data.points.length >= 2) {
        const points = el.data.points as { x: number; y: number }[];
        const isClosed = el.data.closed || false;
        
        let pathData = points.map((pt, idx) => {
          return `${idx === 0 ? 'M' : 'L'} ${pt.x} ${pt.y}`;
        }).join(' ');
        
        if (isClosed) pathData += ' Z';
        
        svgElements += `<path d="${pathData}" stroke="${el.color}" stroke-width="${strokeWidth}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
        
        // Render dimension lines for this polyline if measurements exist
        const elementMeasurements = lineSegmentMeasurements[el.id] || {};
        
        // Per-Element Maßlinien-Stil
        const expStyle = measureLineStyles[el.id] || { color: '#1976d2', strokeWidth: 1.2, fontSize: 11 };
        
        // Berechne den Schwerpunkt (Centroid) des Polygons für die Außen-Berechnung
        const centroidX = points.reduce((acc: number, pt: { x: number; y: number }) => acc + pt.x, 0) / points.length;
        const centroidY = points.reduce((acc: number, pt: { x: number; y: number }) => acc + pt.y, 0) / points.length;
        
        Object.keys(elementMeasurements).forEach((segIdxStr) => {
          const segIdx = parseInt(segIdxStr, 10);
          const measurementText = elementMeasurements[segIdx];
          if (!measurementText) return;
          
          const p1 = points[segIdx];
          const p2 = segIdx === points.length - 1 && isClosed 
            ? points[0] 
            : points[segIdx + 1];
          if (!p1 || !p2) return;
          
          // Midpoint of the line
          const midX = (p1.x + p2.x) / 2;
          const midY = (p1.y + p2.y) / 2;
          
          // Angle of the line
          const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
          
          // Normalenvektor der Kante (senkrecht zur Kante)
          const normalX = -Math.sin(angle);
          const normalY = Math.cos(angle);
          
          // Vektor vom Mittelpunkt zum Schwerpunkt
          const towardsCenterX = centroidX - midX;
          const towardsCenterY = centroidY - midY;
          
          // Skalarprodukt: Wenn positiv, zeigt Normale Richtung Schwerpunkt (= innen)
          const dotProduct = normalX * towardsCenterX + normalY * towardsCenterY;
          
          // Offset-Betrag
          const offsetMagnitude = 20;
          
          // Wenn dotProduct > 0, zeigt Normale nach innen -> umkehren für außen
          const sign = dotProduct > 0 ? -1 : 1;
          const offsetX = normalX * offsetMagnitude * sign;
          const offsetY = normalY * offsetMagnitude * sign;
          
          // Tick length for end marks
          const tickLength = 8;
          
          // Dimension line parallel to original line
          svgElements += `<line x1="${p1.x + offsetX}" y1="${p1.y + offsetY}" x2="${p2.x + offsetX}" y2="${p2.y + offsetY}" stroke="${expStyle.color}" stroke-width="${expStyle.strokeWidth * 1.25}"/>`;
          
          // Left end tick
          svgElements += `<line x1="${p1.x + offsetX - Math.sin(angle) * tickLength}" y1="${p1.y + offsetY + Math.cos(angle) * tickLength}" x2="${p1.x + offsetX + Math.sin(angle) * tickLength}" y2="${p1.y + offsetY - Math.cos(angle) * tickLength}" stroke="${expStyle.color}" stroke-width="${expStyle.strokeWidth * 1.25}"/>`;
          
          // Right end tick
          svgElements += `<line x1="${p2.x + offsetX - Math.sin(angle) * tickLength}" y1="${p2.y + offsetY + Math.cos(angle) * tickLength}" x2="${p2.x + offsetX + Math.sin(angle) * tickLength}" y2="${p2.y + offsetY - Math.cos(angle) * tickLength}" stroke="${expStyle.color}" stroke-width="${expStyle.strokeWidth * 1.25}"/>`;
          
          // Background for text
          const textWidth = measurementText.length * 8 + 8;
          const textHeight = 16;
          svgElements += `<rect x="${midX + offsetX - textWidth/2}" y="${midY + offsetY - 10}" width="${textWidth}" height="${textHeight}" fill="white" rx="2" ry="2"/>`;
          
          // Measurement text
          svgElements += `<text x="${midX + offsetX}" y="${midY + offsetY + 3}" fill="${expStyle.color}" font-size="${expStyle.fontSize}" font-weight="bold" text-anchor="middle">${measurementText}</text>`;
        });
        
        // Render label (S1, S2, S3...) at center if this polyline has measurements
        const polylinesWithMeasurements = getPolylineElementsWithMeasurements();
        const labelIndex = polylinesWithMeasurements.findIndex(p => p.id === el.id);
        if (labelIndex !== -1) {
          const sumX = points.reduce((acc: number, pt: { x: number; y: number }) => acc + pt.x, 0);
          const sumY = points.reduce((acc: number, pt: { x: number; y: number }) => acc + pt.y, 0);
          const centerX = sumX / points.length;
          const centerY = sumY / points.length;
          const labelText = `S${labelIndex + 1}`;
          
          // Label circle background
          svgElements += `<circle cx="${centerX}" cy="${centerY}" r="18" fill="${expStyle.color}" stroke="#fff" stroke-width="2"/>`;
          // Label text
          svgElements += `<text x="${centerX}" y="${centerY + 5}" fill="#fff" font-size="14" font-weight="bold" text-anchor="middle">${labelText}</text>`;
          
          // Flächenanzeige (m²) unter dem Label wenn aktiviert
          if (polygonAreaVisible[el.id]) {
            const exportAreaM2 = calculatePolygonAreaM2(el);
            if (exportAreaM2 !== null) {
              const areaText = formatAreaM2(exportAreaM2);
              const areaBoxWidth = areaText.length * 8 + 12;
              svgElements += `<rect x="${centerX - areaBoxWidth / 2}" y="${centerY + 24}" width="${areaBoxWidth}" height="20" fill="white" stroke="${expStyle.color}" stroke-width="1" rx="3" ry="3"/>`;
              svgElements += `<text x="${centerX}" y="${centerY + 38}" fill="${expStyle.color}" font-size="12" font-weight="bold" text-anchor="middle">${areaText}</text>`;
            }
          }
        }
      } else if (el.type === 'polygon' && typeof el.data === 'string') {
        svgElements += `<path d="${el.data}" stroke="${el.color}" stroke-width="${strokeWidth}" fill="${el.color}" fill-opacity="0.3" stroke-linecap="round" stroke-linejoin="round"/>`;
      }
    });
    
    // Render Summary Legend (Übersicht) in the SVG for PDF/Preview
    // Verwende die bereits berechneten Koordinaten: svgLegendXPos, svgLegendYPos
    if (polylinesForLegend.length > 0) {
      const lineHeight = svgLegendLineHeight; // Verwende konsistente Zeilenhöhe
      
      // Legend background
      svgElements += `<rect x="${svgLegendXPos}" y="${svgLegendYPos - svgLegendHeight}" width="${svgLegendWidth}" height="${svgLegendHeight}" fill="white" stroke="#e3f2fd" stroke-width="2" rx="8" ry="8"/>`;
      
      // Legend title - größere Schrift
      svgElements += `<text x="${svgLegendXPos + 15}" y="${svgLegendYPos - svgLegendHeight + 30}" fill="#333" font-size="18" font-weight="bold">Übersicht</text>`;
      
      // Legend items
      polylinesForLegend.forEach((element, index) => {
        const totalForElement = calculateTotalLfmForElement(element.id);
        if (totalForElement <= 0) return;
        
        const itemY = svgLegendYPos - svgLegendHeight + 55 + (index * lineHeight);
        const labelText = `S${index + 1}`;
        
        // Label badge - größer (Farbe pro Element)
        const elBadgeStyle = measureLineStyles[element.id] || { color: '#1976d2' };
        svgElements += `<rect x="${svgLegendXPos + 15}" y="${itemY - 16}" width="38" height="24" fill="${elBadgeStyle.color}" rx="4" ry="4"/>`;
        svgElements += `<text x="${svgLegendXPos + 34}" y="${itemY + 2}" fill="#fff" font-size="14" font-weight="bold" text-anchor="middle">${labelText}</text>`;
        
        // Value text - größere Schrift
        const legendAreaM2 = polygonAreaVisible[element.id] ? calculatePolygonAreaM2(element) : null;
        const legendValueText = `= ${totalForElement.toString().replace('.', ',')} lfm${legendAreaM2 !== null ? ` • ${formatAreaM2(legendAreaM2)}` : ''}`;
        svgElements += `<text x="${svgLegendXPos + 62}" y="${itemY + 2}" fill="#333" font-size="16">${legendValueText}</text>`;
      });
    }
    
    // Create SVG with viewBox that matches the drawing bounds
    // This allows the SVG to scale correctly when embedded in PDF without distorting proportions
    const previewSvg = `<svg width="100%" height="100%" viewBox="${minX} ${minY} ${drawWidth} ${drawHeight}" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg"><rect x="${minX}" y="${minY}" width="${drawWidth}" height="${drawHeight}" fill="#ffffff"/>${svgElements}</svg>`;
    
    console.log('Generated SVG preview with viewBox:', `${minX} ${minY} ${drawWidth} ${drawHeight}`);
    
    return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(previewSvg)))}`;
}

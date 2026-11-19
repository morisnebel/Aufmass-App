import React from 'react';
import { DrawElement } from '../../../sketch/sketchShared';
import { PolygonAreaOptions, listDiagonals, drawnInteriorAngles, computePolygon, angleExtraId, pairExtraId } from '../../../sketch/polygonArea';
import { PolygonWalls, hasWallHeights, segmentNumberPositions } from '../../../sketch/wallArea';
import { Path, Line, Circle, Rect, Image as SvgImage, Text as SvgText, G, Defs, Marker, Polygon } from 'react-native-svg';


export type RenderSketchElementCtx = {
  selectedElementId: string | null;
  renderTransformHandles: (element: DrawElement) => React.JSX.Element;
  selectedLineSegment: { elementId: string; segmentIndex: number; } | null;
  lineSegmentMeasurements: { [key: string]: { [segmentIndex: number]: string; }; };
  measureLineStyles: { [elementId: string]: { color: string; strokeWidth: number; fontSize: number; }; };
  polygonAreaOptions: PolygonAreaOptions;
  diagonalPick: { elementId: string; first: number | null; } | null;
  lineNumbersVisible: boolean;
  polygonWalls: PolygonWalls;
  scale: number;
  getPolylineElementsWithMeasurements: () => DrawElement[];
  labelOffsets: { [elementId: string]: { x: number; y: number; }; };
  polygonAreaVisible: { [elementId: string]: boolean; };
  calculatePolygonAreaM2: (element: DrawElement) => number | null;
  formatAreaM2: (area: number) => string;
  editingPolylinePoint: number | null;
};

export function renderSketchElement(ctx: RenderSketchElementCtx, element: DrawElement) {
  const {
    selectedElementId, renderTransformHandles, selectedLineSegment, lineSegmentMeasurements,
    measureLineStyles, polygonAreaOptions, diagonalPick, lineNumbersVisible, polygonWalls, scale,
    getPolylineElementsWithMeasurements, labelOffsets, polygonAreaVisible, calculatePolygonAreaM2,
    formatAreaM2, editingPolylinePoint,
  } = ctx;
  const isSelected = element.id === selectedElementId;
  
  switch (element.type) {
    case 'path':
      return (
        <G key={element.id}>
          <Path
            d={element.data}
            stroke={element.color}
            strokeWidth={element.strokeWidth}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {isSelected && (
            <Path
              d={element.data}
              stroke="#2196f3"
              strokeWidth={element.strokeWidth + 4}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={0.4}
            />
          )}
          {isSelected && renderTransformHandles(element)}
        </G>
      );
    
    case 'polygon':
      // Closed freeform shape - filled with semi-transparent color
      return (
        <G key={element.id}>
          <Path
            d={element.data}
            stroke={element.color}
            strokeWidth={element.strokeWidth}
            fill={element.color}
            fillOpacity={0.3}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {isSelected && (
            <Path
              d={element.data}
              stroke="#2196f3"
              strokeWidth={2}
              fill="none"
              strokeDasharray="5,5"
            />
          )}
          {isSelected && renderTransformHandles(element)}
        </G>
      );
    
    case 'line':
      const lineCenterX = (element.data.x1 + element.data.x2) / 2;
      const lineCenterY = (element.data.y1 + element.data.y2) / 2;
      const lineArrowHeads = element.data.arrowHeads || 'none';
      return (
        <G key={element.id}>
          {lineArrowHeads !== 'none' && (
            <Defs>
              <Marker
                id={`line-arrow-end-${element.id}`}
                markerWidth="10"
                markerHeight="10"
                refX="9"
                refY="3"
                orient="auto"
                markerUnits="strokeWidth"
              >
                <Polygon points="0,0 0,6 9,3" fill={element.color} />
              </Marker>
              <Marker
                id={`line-arrow-start-${element.id}`}
                markerWidth="10"
                markerHeight="10"
                refX="0"
                refY="3"
                orient="auto"
                markerUnits="strokeWidth"
              >
                <Polygon points="9,0 9,6 0,3" fill={element.color} />
              </Marker>
            </Defs>
          )}
          <Line
            x1={element.data.x1}
            y1={element.data.y1}
            x2={element.data.x2}
            y2={element.data.y2}
            stroke={element.color}
            strokeWidth={element.strokeWidth}
            markerEnd={lineArrowHeads === 'end' || lineArrowHeads === 'both' ? `url(#line-arrow-end-${element.id})` : undefined}
            markerStart={lineArrowHeads === 'both' ? `url(#line-arrow-start-${element.id})` : undefined}
            transform={element.rotation ? `rotate(${element.rotation} ${lineCenterX} ${lineCenterY})` : undefined}
          />
          {isSelected && renderTransformHandles(element)}
        </G>
      );
    
    case 'circle':
      return (
        <G key={element.id}>
          <Circle
            cx={element.data.cx}
            cy={element.data.cy}
            r={element.data.r}
            stroke={element.color}
            strokeWidth={element.strokeWidth}
            fill="none"
            transform={element.rotation ? `rotate(${element.rotation} ${element.data.cx} ${element.data.cy})` : undefined}
          />
          {isSelected && renderTransformHandles(element)}
        </G>
      );
    
    case 'rect':
      const rectCenterX = element.data.x + element.data.width / 2;
      const rectCenterY = element.data.y + element.data.height / 2;
      return (
        <G key={element.id}>
          <Rect
            x={element.data.x}
            y={element.data.y}
            width={element.data.width}
            height={element.data.height}
            stroke={element.color}
            strokeWidth={element.strokeWidth}
            fill="none"
            transform={element.rotation ? `rotate(${element.rotation} ${rectCenterX} ${rectCenterY})` : undefined}
          />
          {isSelected && renderTransformHandles(element)}
        </G>
      );
    
    case 'text':
      return (
        <G key={element.id}>
          <SvgText
            x={element.x}
            y={element.y}
            fill={element.color}
            fontSize={element.fontSize || 20}
            fontWeight={element.fontWeight || 'bold'}
            fontStyle={element.fontStyle || 'normal'}
            fontFamily={element.fontFamily || 'sans-serif'}
            transform={element.rotation ? `rotate(${element.rotation} ${element.x} ${element.y})` : undefined}
          >
            {element.data.text}
          </SvgText>
          {isSelected && renderTransformHandles(element)}
        </G>
      );
    
    case 'image':
      const imgX = element.x || 0;
      const imgY = element.y || 0;
      const imgW = element.width || 100;
      const imgH = element.height || 100;
      const imgCenterX = imgX + imgW / 2;
      const imgCenterY = imgY + imgH / 2;
      return (
        <G key={element.id}>
          <SvgImage
            href={element.data.uri}
            x={imgX}
            y={imgY}
            width={imgW}
            height={imgH}
            transform={element.rotation ? `rotate(${element.rotation} ${imgCenterX} ${imgCenterY})` : undefined}
          />
          {isSelected && renderTransformHandles(element)}
        </G>
      );
    
    case 'arrow':
      const { x1, y1, x2, y2, text, heads } = element.data;
      const midX = (x1 + x2) / 2;
      const midY = (y1 + y2) / 2;
      const angle = Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI;
      
      return (
        <G key={element.id}>
          <Defs>
            <Marker
              id={`arrowhead-end-${element.id}`}
              markerWidth="10"
              markerHeight="10"
              refX="9"
              refY="3"
              orient="auto"
              markerUnits="strokeWidth"
            >
              <Polygon points="0,0 0,6 9,3" fill={element.color} />
            </Marker>
            <Marker
              id={`arrowhead-start-${element.id}`}
              markerWidth="10"
              markerHeight="10"
              refX="0"
              refY="3"
              orient="auto"
              markerUnits="strokeWidth"
            >
              <Polygon points="9,0 9,6 0,3" fill={element.color} />
            </Marker>
          </Defs>
          <Line
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke={element.color}
            strokeWidth={element.strokeWidth}
            markerEnd={`url(#arrowhead-end-${element.id})`}
            markerStart={heads === 'double' ? `url(#arrowhead-start-${element.id})` : undefined}
            transform={element.rotation ? `rotate(${element.rotation} ${midX} ${midY})` : undefined}
          />
          {text && (
            <SvgText
              x={midX}
              y={midY - 10}
              fill={element.color}
              fontSize={element.data.fontSize || 14}
              fontWeight="bold"
              textAnchor="middle"
              transform={`rotate(${angle + (element.rotation || 0)} ${midX} ${midY})`}
            >
              {text}
            </SvgText>
          )}
          {isSelected && renderTransformHandles(element)}
        </G>
      );
    
    case 'pointer':
      // Großer Zeigepfeil mit nur einer prominenten Pfeilspitze am Ende (Memo-Pfeil)
      const ptrX1 = element.data.x1;
      const ptrY1 = element.data.y1;
      const ptrX2 = element.data.x2;
      const ptrY2 = element.data.y2;
      const ptrText = element.data.text || '';
      const ptrFontSize = element.data.fontSize || 16;
      const ptrMidX = (ptrX1 + ptrX2) / 2;
      const ptrMidY = (ptrY1 + ptrY2) / 2;
      const ptrAngle = Math.atan2(ptrY2 - ptrY1, ptrX2 - ptrX1);
      const ptrAngleDeg = ptrAngle * 180 / Math.PI;
      
      // Pfeilspitze proportional zur Strichdicke (skaliert für alle Größen)
      // Bei strokeWidth 1 → 12, bei 3 → 18, bei 8 → 32
      const arrowHeadSize = Math.max(12, element.strokeWidth * 4);
      const arrowHeadAngle = Math.PI / 6; // 30 Grad
      
      // Pfeilspitzen-Koordinaten
      const tipX = ptrX2;
      const tipY = ptrY2;
      const leftX = ptrX2 - arrowHeadSize * Math.cos(ptrAngle - arrowHeadAngle);
      const leftY = ptrY2 - arrowHeadSize * Math.sin(ptrAngle - arrowHeadAngle);
      const rightX = ptrX2 - arrowHeadSize * Math.cos(ptrAngle + arrowHeadAngle);
      const rightY = ptrY2 - arrowHeadSize * Math.sin(ptrAngle + arrowHeadAngle);
      
      // Linie bis kurz vor der Pfeilspitze
      const lineEndX = ptrX2 - arrowHeadSize * 0.6 * Math.cos(ptrAngle);
      const lineEndY = ptrY2 - arrowHeadSize * 0.6 * Math.sin(ptrAngle);
      
      // Position für den Text (etwas oberhalb der Linie, am Startpunkt)
      const textOffsetX = ptrX1 + 15 * Math.cos(ptrAngle - Math.PI / 2);
      const textOffsetY = ptrY1 + 15 * Math.sin(ptrAngle - Math.PI / 2);
      
      return (
        <G key={element.id}>
          {/* Dicke Linie */}
          <Line
            x1={ptrX1}
            y1={ptrY1}
            x2={lineEndX}
            y2={lineEndY}
            stroke={element.color}
            strokeWidth={element.strokeWidth}
            strokeLinecap="round"
            transform={element.rotation ? `rotate(${element.rotation} ${ptrMidX} ${ptrMidY})` : undefined}
          />
          {/* Große gefüllte Pfeilspitze */}
          <Polygon
            points={`${tipX},${tipY} ${leftX},${leftY} ${rightX},${rightY}`}
            fill={element.color}
            stroke={element.color}
            strokeWidth={2}
            transform={element.rotation ? `rotate(${element.rotation} ${ptrMidX} ${ptrMidY})` : undefined}
          />
          {/* Notiz-Text am Startpunkt (wenn vorhanden) */}
          {ptrText && (
            <G>
              {/* Hintergrund für bessere Lesbarkeit - Rahmen skaliert proportional zur Schriftgröße */}
              {(() => {
                // Skalierungsfaktor basierend auf Schriftgröße (Basis: 16px)
                const ptrScaleFactor = ptrFontSize / 16;
                const ptrFrameStroke = Math.max(1, 2 * ptrScaleFactor);
                const ptrFrameRadius = Math.max(2, 4 * ptrScaleFactor);
                const ptrPaddingX = 5 * ptrScaleFactor;
                const ptrPaddingY = 8 * ptrScaleFactor;
                return (
                  <>
                    <Rect
                      x={textOffsetX - ptrPaddingX}
                      y={textOffsetY - ptrFontSize}
                      width={ptrText.length * ptrFontSize * 0.6 + 2 * ptrPaddingX}
                      height={ptrFontSize + ptrPaddingY}
                      fill="rgba(255, 255, 255, 0.9)"
                      rx={ptrFrameRadius}
                      ry={ptrFrameRadius}
                      stroke={element.color}
                      strokeWidth={ptrFrameStroke}
                    />
                    <SvgText
                      x={textOffsetX}
                      y={textOffsetY}
                      fill={element.color}
                      fontSize={ptrFontSize}
                      fontWeight="bold"
                    >
                      {ptrText}
                    </SvgText>
                  </>
                );
              })()}
            </G>
          )}
          {isSelected && renderTransformHandles(element)}
        </G>
      );
    
    case 'memo':
      // Memo/Notiz: Roter Ankerpunkt mit gestrichelter Linie zu Textlabel (wie in Flächenberechnung)
      const memoX1 = element.data.x1; // Ankerpunkt
      const memoY1 = element.data.y1;
      const memoX2 = element.data.x2; // Textlabel Position
      const memoY2 = element.data.y2;
      const memoTextContent = element.data.text || '';
      const memoFontSize = element.data.fontSize || 14;
      const memoMidX = (memoX1 + memoX2) / 2;
      const memoMidY = (memoY1 + memoY2) / 2;
      
      // Skalierungsfaktor basierend auf Schriftgröße (Basis: 14px)
      const memoScaleFactor = memoFontSize / 14;
      
      // Berechne Textbreite für das Label - proportional skaliert
      const memoLabelWidth = Math.max(60 * memoScaleFactor, memoTextContent.length * memoFontSize * 0.6 + 20 * memoScaleFactor);
      const memoLabelHeight = memoFontSize + 14 * memoScaleFactor;
      
      // Rahmen-Attribute proportional zur Schriftgröße
      const memoLineStroke = Math.max(1, 2 * memoScaleFactor);
      const memoAnchorRadius = Math.max(3, 6 * memoScaleFactor);
      const memoFrameStroke = Math.max(1, 2 * memoScaleFactor);
      const memoFrameRadius = Math.max(2, 4 * memoScaleFactor);
      const memoDashArray = `${6 * memoScaleFactor},${4 * memoScaleFactor}`;
      
      return (
        <G key={element.id}>
          {/* Gestrichelte Verbindungslinie - skaliert */}
          <Line
            x1={memoX1}
            y1={memoY1}
            x2={memoX2}
            y2={memoY2}
            stroke={element.color}
            strokeWidth={memoLineStroke}
            strokeDasharray={memoDashArray}
            transform={element.rotation ? `rotate(${element.rotation} ${memoMidX} ${memoMidY})` : undefined}
          />
          {/* Roter Ankerpunkt (gefüllter Kreis) - skaliert */}
          <Circle
            cx={memoX1}
            cy={memoY1}
            r={memoAnchorRadius}
            fill={element.color}
            stroke={element.color}
            strokeWidth={memoLineStroke}
            transform={element.rotation ? `rotate(${element.rotation} ${memoMidX} ${memoMidY})` : undefined}
          />
          {/* Textlabel mit Rahmen - skaliert */}
          <G transform={element.rotation ? `rotate(${element.rotation} ${memoMidX} ${memoMidY})` : undefined}>
            {/* Weißer Hintergrund mit farbigem Rahmen - skaliert */}
            <Rect
              x={memoX2 - memoLabelWidth / 2}
              y={memoY2 - memoLabelHeight / 2}
              width={memoLabelWidth}
              height={memoLabelHeight}
              fill="white"
              rx={memoFrameRadius}
              ry={memoFrameRadius}
              stroke={element.color}
              strokeWidth={memoFrameStroke}
            />
            {/* Text im Label */}
            <SvgText
              x={memoX2}
              y={memoY2 + memoFontSize / 3}
              fill={element.color}
              fontSize={memoFontSize}
              fontWeight="bold"
              textAnchor="middle"
            >
              {memoTextContent}
            </SvgText>
          </G>
          {isSelected && renderTransformHandles(element)}
        </G>
      );
    
    case 'polyline':
      const { points, closed } = element.data;
      if (!points || points.length < 2) return null;
      
      // Erstelle Path-String aus Punkten
      let polylinePath = `M ${points[0].x} ${points[0].y}`;
      for (let i = 1; i < points.length; i++) {
        polylinePath += ` L ${points[i].x} ${points[i].y}`;
      }
      if (closed) {
        polylinePath += ' Z';
      }
      
      // Prüfe ob dieses Element ein ausgewähltes Segment hat
      const hasSelectedSegment = selectedLineSegment?.elementId === element.id;
      const selectedSegIdx = hasSelectedSegment ? selectedLineSegment.segmentIndex : -1;
      
      // Maße für dieses Element
      const elementMeasurements = lineSegmentMeasurements[element.id] || {};
      
      // Maßlinien-Stil für dieses Element (auf Element-Ebene definiert für Labels UND Maße)
      const elMeasureStyle = measureLineStyles[element.id] || { color: '#1976d2', strokeWidth: 1.2, fontSize: 11 };
      const elColor = elMeasureStyle.color;
      
      return (
        <G key={element.id}>
          <Path
            d={polylinePath}
            stroke={element.color}
            strokeWidth={element.strokeWidth}
            fill={closed ? 'rgba(33, 150, 243, 0.1)' : 'none'}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          
          {/* Ausgewähltes Segment hervorheben */}
          {hasSelectedSegment && selectedSegIdx >= 0 && selectedSegIdx < points.length && (() => {
            const p1 = points[selectedSegIdx];
            const p2 = selectedSegIdx === points.length - 1 && closed 
              ? points[0] 
              : points[selectedSegIdx + 1];
            if (!p1 || !p2) return null;
            return (
              <G>
                <Line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="#fff" strokeWidth={element.strokeWidth + 9} strokeLinecap="round" />
                <Line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="#FF3D00" strokeWidth={element.strokeWidth + 5} strokeLinecap="round" />
              </G>
            );
          })()}
          
          {/* Gemessene Diagonalen gestrichelt anzeigen */}
          {closed && polygonAreaOptions[element.id]?.useDiagonals !== false && listDiagonals(polygonAreaOptions[element.id], points.length).map(d => {
            // Abgelehnte (widersprüchliche) Diagonale rot, noch nicht gemessene mit „?“
            const diagonalRejected = !!computePolygon(element, lineSegmentMeasurements, undefined, polygonAreaOptions[element.id])?.rejected.includes(pairExtraId(d.i, d.j));
            const diagonalColor = diagonalRejected ? '#d32f2f' : '#2e7d32';
            return (
            <G key={`diagonal-${element.id}-${d.i}-${d.j}`}>
              <Line x1={points[d.i].x} y1={points[d.i].y} x2={points[d.j].x} y2={points[d.j].y} stroke={diagonalColor} strokeWidth={1.2} strokeDasharray="6,4" />
              <SvgText x={(points[d.i].x + points[d.j].x) / 2} y={(points[d.i].y + points[d.j].y) / 2 - 3} fill={diagonalColor} fontSize={10} fontWeight="bold" textAnchor="middle">{d.value.trim() || '?'}</SvgText>
            </G>
            );
          })}
          {/* Erste gewählte Ecke einer neuen Diagonale */}
          {diagonalPick?.elementId === element.id && diagonalPick.first !== null && points[diagonalPick.first] && (
            <Circle cx={points[diagonalPick.first].x} cy={points[diagonalPick.first].y} r={12} fill="none" stroke="#2e7d32" strokeWidth={3} />
          )}
          {/* Winkel je Ecke: immer der berechnete Wert – grün = Eingabe verwendet, rot = Eingabe abgelehnt, grau = berechnet */}
          {closed && polygonAreaOptions[element.id]?.useAngles && (() => {
            const cx = points.reduce((sum: number, p: any) => sum + p.x, 0) / points.length;
            const cy = points.reduce((sum: number, p: any) => sum + p.y, 0) / points.length;
            const solved = computePolygon(element, lineSegmentMeasurements, undefined, polygonAreaOptions[element.id]);
            const shown = solved && solved.angles.length === points.length ? solved.angles : drawnInteriorAngles(points);
            return shown.map((angle, k) => {
              const entered = polygonAreaOptions[element.id]?.angles?.[k]?.trim();
              const angleRejected = !!solved?.rejected.includes(angleExtraId(k));
              const len = Math.hypot(cx - points[k].x, cy - points[k].y) || 1;
              return (
                <SvgText
                  key={`angle-${element.id}-${k}`}
                  x={points[k].x + ((cx - points[k].x) / len) * 26}
                  y={points[k].y + ((cy - points[k].y) / len) * 26 + 4}
                  fill={angleRejected ? '#d32f2f' : entered ? '#2e7d32' : '#777'} fontSize={11} fontWeight="bold" textAnchor="middle"
                >
                  {`${(Math.round(angle * 10) / 10).toString().replace('.', ',')}°`}
                </SvgText>
              );
            });
          })()}

          {/* Linien-Nummern (passend zu „Linie x von n“ und zur Wandliste) */}
          {lineNumbersVisible && (hasSelectedSegment || hasWallHeights(polygonWalls[element.id])) && (() => {
            const numberScale = Math.max(scale, 0.5);
            return segmentNumberPositions(points, !!closed, Math.max(8, 16 / numberScale)).map(n => (
              <G key={`line-number-${element.id}-${n.line}`}>
                <Circle cx={n.x} cy={n.y} r={Math.max(5, 9 / numberScale)} fill="#fff" stroke="#5d4037" strokeWidth={Math.max(0.6, 1.2 / numberScale)} />
                <SvgText x={n.x} y={n.y + Math.max(2, 3.5 / numberScale)} fill="#5d4037" fontSize={Math.max(6, 10 / numberScale)} fontWeight="bold" textAnchor="middle">
                  {n.line}
                </SvgText>
              </G>
            ));
          })()}

          {/* Maßlinien für alle Segmente mit Maßen anzeigen */}
          {Object.keys(elementMeasurements).map((segIdxStr) => {
            const segIdx = parseInt(segIdxStr, 10);
            const measurementText = elementMeasurements[segIdx];
            if (!measurementText) return null;
            
            const p1 = points[segIdx];
            const p2 = segIdx === points.length - 1 && closed 
              ? points[0] 
              : points[segIdx + 1];
            if (!p1 || !p2) return null;
            
            // Mittelpunkt der Linie
            const midX = (p1.x + p2.x) / 2;
            const midY = (p1.y + p2.y) / 2;
            
            // Winkel der Linie
            const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
            
            // Berechne den Schwerpunkt (Centroid) des Polygons
            const centroidX = points.reduce((acc: number, pt: { x: number; y: number }) => acc + pt.x, 0) / points.length;
            const centroidY = points.reduce((acc: number, pt: { x: number; y: number }) => acc + pt.y, 0) / points.length;
            
            // Normalenvektor der Kante (senkrecht zur Kante)
            // Standard-Normale zeigt nach "links" der Zeichenrichtung
            const normalX = -Math.sin(angle);
            const normalY = Math.cos(angle);
            
            // Vektor vom Mittelpunkt zum Schwerpunkt
            const towardsCenterX = centroidX - midX;
            const towardsCenterY = centroidY - midY;
            
            // Skalarprodukt: Wenn positiv, zeigt Normale Richtung Schwerpunkt (= innen)
            // Dann müssen wir die Normale umkehren, damit sie nach außen zeigt
            const dotProduct = normalX * towardsCenterX + normalY * towardsCenterY;
            
            // Skalierte Größen basierend auf Zoom-Level
            const baseOffsetMagnitude = 16;
            const baseTickLength = 6;
            const baseStrokeWidth = elMeasureStyle.strokeWidth;
            const baseFontSize = elMeasureStyle.fontSize;
            
            const scaledOffsetMagnitude = Math.max(8, baseOffsetMagnitude / Math.max(scale, 0.5));
            const scaledTickLength = Math.max(3, baseTickLength / Math.max(scale, 0.5));
            const scaledStrokeWidth = Math.max(0.5, baseStrokeWidth / Math.max(scale, 0.5));
            const scaledFontSize = Math.max(6, baseFontSize / Math.max(scale, 0.5));
            
            // Wenn dotProduct > 0, zeigt Normale nach innen -> umkehren
            // Wenn dotProduct < 0, zeigt Normale nach außen -> beibehalten
            const sign = dotProduct > 0 ? -1 : 1;
            const offsetX = normalX * scaledOffsetMagnitude * sign;
            const offsetY = normalY * scaledOffsetMagnitude * sign;
            
            // Text-Box Dimensionen - skaliert
            const charWidth = scaledFontSize * 0.6;
            const boxWidth = measurementText.length * charWidth + scaledFontSize * 0.6;
            const boxHeight = scaledFontSize * 1.3;
            
            return (
              <G key={`measure-${element.id}-${segIdx}`}>
                {/* Maßlinie parallel zur Original-Linie */}
                <Line
                  x1={p1.x + offsetX}
                  y1={p1.y + offsetY}
                  x2={p2.x + offsetX}
                  y2={p2.y + offsetY}
                  stroke={elColor}
                  strokeWidth={scaledStrokeWidth}
                />
                {/* End-Strich links */}
                <Line
                  x1={p1.x + offsetX - Math.sin(angle) * scaledTickLength}
                  y1={p1.y + offsetY + Math.cos(angle) * scaledTickLength}
                  x2={p1.x + offsetX + Math.sin(angle) * scaledTickLength}
                  y2={p1.y + offsetY - Math.cos(angle) * scaledTickLength}
                  stroke={elColor}
                  strokeWidth={scaledStrokeWidth}
                />
                {/* End-Strich rechts */}
                <Line
                  x1={p2.x + offsetX - Math.sin(angle) * scaledTickLength}
                  y1={p2.y + offsetY + Math.cos(angle) * scaledTickLength}
                  x2={p2.x + offsetX + Math.sin(angle) * scaledTickLength}
                  y2={p2.y + offsetY - Math.cos(angle) * scaledTickLength}
                  stroke={elColor}
                  strokeWidth={scaledStrokeWidth}
                />
                {/* Hintergrund für Text - skaliert */}
                <Rect
                  x={midX + offsetX - boxWidth / 2}
                  y={midY + offsetY - boxHeight / 2}
                  width={boxWidth}
                  height={boxHeight}
                  fill="white"
                  rx={2}
                  ry={2}
                />
                {/* Maß-Text - skaliert */}
                <SvgText
                  x={midX + offsetX}
                  y={midY + offsetY + scaledFontSize * 0.35}
                  fill={elColor}
                  fontSize={scaledFontSize}
                  fontWeight="bold"
                  textAnchor="middle"
                >
                  {measurementText}
                </SvgText>
              </G>
            );
          })}
          
          {/* Label (S1, S2, S3...) im Zentrum des Grundrisses - kleiner und verschiebbar */}
          {(() => {
            // Maßlinien-Farbe für dieses Element
            const labelColor = (measureLineStyles[element.id] || { color: '#1976d2' }).color;
            
            // Berechne Zentrum des Grundrisses
            const sumX = points.reduce((acc: number, pt: { x: number; y: number }) => acc + pt.x, 0);
            const sumY = points.reduce((acc: number, pt: { x: number; y: number }) => acc + pt.y, 0);
            const centerX = sumX / points.length;
            const centerY = sumY / points.length;
            
            // Finde Index dieses Elements unter allen Polylines mit Maßen
            const polylinesWithMeasurements = getPolylineElementsWithMeasurements();
            const labelIndex = polylinesWithMeasurements.findIndex(el => el.id === element.id);
            
            // Nur Label anzeigen wenn dieses Element Maße hat
            if (labelIndex === -1) return null;
            
            const labelText = `S${labelIndex + 1}`;
            
            // Label-Offset aus State holen (falls vorhanden)
            const offset = labelOffsets[element.id] || { x: 0, y: 0 };
            const labelX = centerX + offset.x;
            const labelY = centerY + offset.y;
            
            // Skalierte Größen basierend auf Zoom-Level
            const baseLabelRadius = 10;
            const baseLabelFontSize = 9;
            const baseLabelStroke = 1.2;
            const baseLineStroke = 1.2;
            
            const scaledLabelRadius = Math.max(5, baseLabelRadius / Math.max(scale, 0.5));
            const scaledLabelFontSize = Math.max(5, baseLabelFontSize / Math.max(scale, 0.5));
            const scaledLabelStroke = Math.max(0.5, baseLabelStroke / Math.max(scale, 0.5));
            const scaledLineStroke = Math.max(0.5, baseLineStroke / Math.max(scale, 0.5));
            
            // Verbindungslinie nur anzeigen wenn das Label verschoben wurde
            const hasOffset = offset.x !== 0 || offset.y !== 0;
            
            return (
              <G key={`label-${element.id}`}>
                {/* Verbindungslinie zum Zentrum wenn Label verschoben */}
                {hasOffset && (
                  <Line
                    x1={centerX}
                    y1={centerY}
                    x2={labelX}
                    y2={labelY}
                    stroke={labelColor}
                    strokeWidth={scaledLineStroke}
                    strokeDasharray="3,2"
                    opacity={0.7}
                  />
                )}
                {/* Hintergrund-Kreis für Label - skaliert */}
                <Circle
                  cx={labelX}
                  cy={labelY}
                  r={scaledLabelRadius}
                  fill={labelColor}
                  stroke="#fff"
                  strokeWidth={scaledLabelStroke}
                />
                {/* Label-Text - skaliert */}
                <SvgText
                  x={labelX}
                  y={labelY + scaledLabelFontSize * 0.35}
                  fill="#fff"
                  fontSize={scaledLabelFontSize}
                  fontWeight="bold"
                  textAnchor="middle"
                >
                  {labelText}
                </SvgText>
                {/* Raumname rechts neben dem S-Kreis (mit weißem Rand für Lesbarkeit) */}
                {!!element.name && (
                  <G>
                    <SvgText
                      x={labelX + scaledLabelRadius + 3}
                      y={labelY + scaledLabelFontSize * 0.35}
                      fill="#fff"
                      stroke="#fff"
                      strokeWidth={scaledLabelStroke * 2.5}
                      fontSize={scaledLabelFontSize}
                      fontWeight="bold"
                      textAnchor="start"
                    >
                      {element.name}
                    </SvgText>
                    <SvgText
                      x={labelX + scaledLabelRadius + 3}
                      y={labelY + scaledLabelFontSize * 0.35}
                      fill={labelColor}
                      fontSize={scaledLabelFontSize}
                      fontWeight="bold"
                      textAnchor="start"
                    >
                      {element.name}
                    </SvgText>
                  </G>
                )}
                {/* Transparenter Kreis als Touch-Target für Verschieben (größer als sichtbarer Kreis) */}
                <Circle
                  cx={labelX}
                  cy={labelY}
                  r={scaledLabelRadius + 10}
                  fill="transparent"
                />
                {/* Flächenanzeige (m²) unter dem Label wenn aktiviert */}
                {(() => {
                  if (polygonAreaVisible[element.id] === false) return null;
                  const areaM2 = calculatePolygonAreaM2(element);
                  if (areaM2 === null) return null;
                  const areaText = formatAreaM2(areaM2);
                  const areaFontSize = Math.max(6, 10 / Math.max(scale, 0.5));
                  const areaBoxWidth = areaText.length * areaFontSize * 0.62 + areaFontSize;
                  const areaBoxHeight = areaFontSize * 1.5;
                  const areaY = labelY + scaledLabelRadius + areaBoxHeight * 0.75;
                  return (
                    <G key={`area-${element.id}`}>
                      <Rect
                        x={labelX - areaBoxWidth / 2}
                        y={areaY - areaBoxHeight / 2}
                        width={areaBoxWidth}
                        height={areaBoxHeight}
                        fill="white"
                        stroke={labelColor}
                        strokeWidth={scaledLabelStroke * 0.8}
                        rx={3}
                        ry={3}
                      />
                      <SvgText
                        x={labelX}
                        y={areaY + areaFontSize * 0.35}
                        fill={labelColor}
                        fontSize={areaFontSize}
                        fontWeight="bold"
                        textAnchor="middle"
                      >
                        {areaText}
                      </SvgText>
                    </G>
                  );
                })()}
              </G>
            );
          })()}
          
          {/* Punkte anzeigen wenn ausgewählt - skaliert mit Zoom */}
          {isSelected && points.map((pt: { x: number; y: number }, idx: number) => {
            // Größe wird durch Zoom-Level skaliert: größerer Zoom = kleinere Punkte
            const baseRadius = editingPolylinePoint === idx ? 10 : 6;
            const scaledRadius = Math.max(3, baseRadius / Math.max(scale, 0.5)); // Minimum 3px
            const baseStroke = editingPolylinePoint === idx ? 2.5 : 1.5;
            const scaledStroke = Math.max(1, baseStroke / Math.max(scale, 0.5));
            
            return (
              <Circle 
                key={`polyline-pt-${idx}`}
                cx={pt.x} 
                cy={pt.y} 
                r={scaledRadius} 
                fill={editingPolylinePoint === idx ? '#ff5722' : (idx === 0 ? '#4caf50' : '#2196f3')} 
                stroke="#fff" 
                strokeWidth={scaledStroke} 
              />
            );
          })}
          {/* Mittelpunkt zum Verschieben des gesamten Polygons - größenangepasst */}
          {isSelected && points.length >= 2 && (() => {
            const centerX = points.reduce((sum: number, pt: { x: number }) => sum + pt.x, 0) / points.length;
            const centerY = points.reduce((sum: number, pt: { y: number }) => sum + pt.y, 0) / points.length;
            
            // Berechne Bounding Box für größenangepassten Handle
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            points.forEach((pt: { x: number; y: number }) => {
              minX = Math.min(minX, pt.x);
              minY = Math.min(minY, pt.y);
              maxX = Math.max(maxX, pt.x);
              maxY = Math.max(maxY, pt.y);
            });
            const boxWidth = maxX - minX;
            const boxHeight = maxY - minY;
            const polygonSize = Math.min(boxWidth, boxHeight);
            
            // Handle-Größe: 15-25% der kleinsten Polygon-Dimension, mit Min/Max Grenzen
            const baseSize = polygonSize * 0.18;
            const scaledSize = baseSize / Math.max(scale, 0.5);
            const moveHandleSize = Math.max(12, Math.min(30, scaledSize)); // Min 12, Max 30
            
            return (
              <G key="move-handle">
                {/* Äußerer Ring */}
                <Circle 
                  cx={centerX} 
                  cy={centerY} 
                  r={moveHandleSize} 
                  fill="rgba(255, 152, 0, 0.25)" 
                  stroke="#FF9800" 
                  strokeWidth={Math.max(1, 2 / Math.max(scale, 0.5))} 
                />
                {/* Innerer Kreis */}
                <Circle 
                  cx={centerX} 
                  cy={centerY} 
                  r={moveHandleSize * 0.55} 
                  fill="#FF9800" 
                  stroke="#fff" 
                  strokeWidth={Math.max(0.8, 1.5 / Math.max(scale, 0.5))} 
                />
                {/* Verschiebe-Symbol */}
                <SvgText 
                  x={centerX} 
                  y={centerY + (moveHandleSize * 0.2)} 
                  fill="#fff" 
                  fontSize={moveHandleSize * 0.55}
                  textAnchor="middle"
                  fontWeight="bold"
                >✥</SvgText>
              </G>
            );
          })()}
        </G>
      );
    
    default:
      return null;
  }
}

import React from 'react';
import { View, Text, Platform, Image as RNImage } from 'react-native';
import { styles } from '../../../styles/sketchDrawStyles';
import Svg, { Line, Circle } from 'react-native-svg';


export type MagnifierOverlayProps = {
  showMagnifier: boolean;
  magnifierPosition: { x: number; y: number; } | null;
  magnifierTargetPosition: { x: number; y: number; } | null;
  isPhoneDevice: boolean;
  showProtractor: boolean;
  screenHeight: number;
  screenWidth: number;
  magnifierSnapshot: string | null;
  backgroundImage: string | null;
  canvasLayout: { x: number; y: number; width: number; height: number; } | null;
  canvasHeight: number;
  fabricInvalidateTick: React.RefObject<number>;
};

export function MagnifierOverlay(props: MagnifierOverlayProps) {
  const {
    showMagnifier, magnifierPosition, magnifierTargetPosition, isPhoneDevice, showProtractor,
    screenHeight, screenWidth, magnifierSnapshot, backgroundImage, canvasLayout, canvasHeight,
    fabricInvalidateTick,
  } = props;
  return (
    <>
      {/* Lupe (Magnifier) Overlay für präzises Positionieren von Maßlinien-Endpunkten */}
      {showMagnifier && magnifierPosition && magnifierTargetPosition && (() => {
        // Intelligente Positionierung: Nah am Punkt, aber ohne ihn zu verdecken
        const magnifierSize = isPhoneDevice ? 90 : 110;
        const coordsHeight = isPhoneDevice ? 20 : 25;
        const totalHeight = magnifierSize + coordsHeight;
        const offsetAbove = isPhoneDevice ? 25 : 40; // Abstand über dem Punkt
        const offsetBelow = isPhoneDevice ? 25 : 40; // Abstand unter dem Punkt
        const minTop = isPhoneDevice ? 10 : 10; // Minimum-Abstand zum oberen Rand
        
        // Berechne ideale Position über dem Punkt
        let magTop = magnifierPosition.y - totalHeight - offsetAbove;
        let showBelow = false;
        
        // Wenn die Lupe oben aus dem Bildschirm ragt → nach unten verschieben
        if (magTop < minTop) {
          magTop = magnifierPosition.y + offsetBelow;
          showBelow = true;
        }
        
        // Auf iPhone: Prüfen ob die Lupe hinter dem Protractor-Panel verschwindet
        // Panel ist ca. 200px hoch, ab bottom: 20 → oberkante bei screenHeight - 220
        if (isPhoneDevice && showProtractor && magTop + totalHeight > screenHeight - 220) {
          // Über dem Punkt platzieren, notfalls ganz oben
          magTop = Math.max(minTop, magnifierPosition.y - totalHeight - offsetAbove);
        }
        
        // Horizontal: zentriert über dem Punkt, aber im Bildschirm halten
        let magLeft = magnifierPosition.x - magnifierSize / 2;
        magLeft = Math.max(5, Math.min(magLeft, screenWidth - magnifierSize - 5));
        
        const halfSize = magnifierSize / 2;
        
        return (
        <View
          style={[
            styles.magnifierOverlay,
            {
              left: magLeft,
              top: magTop,
              width: magnifierSize + 10,
              zIndex: 10001, // Über dem Protractor-Panel
            },
          ]}
          pointerEvents="none"
        >
          <View style={styles.magnifierContent}>
            {/* Runder Lupen-Container mit Bild */}
            <View style={[styles.magnifierCircle, isPhoneDevice && { width: magnifierSize, height: magnifierSize, borderRadius: magnifierSize / 2 }]}>
              {/* Canvas-Snapshot oder Hintergrundbild vergrößert */}
              {(magnifierSnapshot || backgroundImage) ? (
                <View style={[styles.magnifierImageContainer, isPhoneDevice && { width: magnifierSize, height: magnifierSize, borderRadius: magnifierSize / 2 }]}>
                  <RNImage
                    source={{ uri: magnifierSnapshot || backgroundImage }}
                    style={{
                      width: (canvasLayout?.width || screenWidth) * 3,
                      height: (canvasLayout?.height || canvasHeight) * 3,
                      position: 'absolute',
                      left: -magnifierTargetPosition.x * 3 + halfSize,
                      top: -magnifierTargetPosition.y * 3 + halfSize,
                    }}
                    resizeMode="stretch"
                  />
                </View>
              ) : (
                /* Grid-basierte Lupe als Fallback (kein Bild verfügbar) */
                <Svg key={`mag-${fabricInvalidateTick.current++}`} width={magnifierSize} height={magnifierSize} style={{ position: 'absolute', top: 0, left: 0 }}>
                  <Circle cx={halfSize} cy={halfSize} r={halfSize} fill="#f8f9fa" />
                  {Array.from({ length: Math.ceil(magnifierSize / 30) + 1 }, (_, i) => {
                    const pos = (i * 30) - ((Math.round(magnifierTargetPosition.x) * 3) % 30);
                    return pos >= 0 && pos <= magnifierSize ? (
                      <Line key={`gv${i}`} x1={pos} y1={0} x2={pos} y2={magnifierSize} stroke="#e0e0e0" strokeWidth={0.5} />
                    ) : null;
                  })}
                  {Array.from({ length: Math.ceil(magnifierSize / 30) + 1 }, (_, i) => {
                    const pos = (i * 30) - ((Math.round(magnifierTargetPosition.y) * 3) % 30);
                    return pos >= 0 && pos <= magnifierSize ? (
                      <Line key={`gh${i}`} x1={0} y1={pos} x2={magnifierSize} y2={pos} stroke="#e0e0e0" strokeWidth={0.5} />
                    ) : null;
                  })}
                  {Platform.OS !== 'web' && (
                    <Circle key={`inv-${fabricInvalidateTick.current++}`} cx={-9999} cy={-9999} r={0.1} fill="none" stroke="none" opacity={0} />
                  )}
                </Svg>
              )}
              
              {/* Fadenkreuz-Overlay */}
              <Svg width={magnifierSize} height={magnifierSize} style={styles.magnifierCrosshair}>
                {/* Fadenkreuz */}
                <Line x1={halfSize} y1={8} x2={halfSize} y2={magnifierSize - 8} stroke="#f44336" strokeWidth={1.5} opacity={0.8} />
                <Line x1={8} y1={halfSize} x2={magnifierSize - 8} y2={halfSize} stroke="#f44336" strokeWidth={1.5} opacity={0.8} />
                {/* Zentraler Kreis */}
                <Circle cx={halfSize} cy={halfSize} r={3} fill="none" stroke="#f44336" strokeWidth={2} />
                {/* Rahmen */}
                <Circle cx={halfSize} cy={halfSize} r={halfSize - 2} fill="none" stroke="#1976d2" strokeWidth={3} />
              </Svg>
            </View>
            
            {/* Koordinaten-Anzeige */}
            <View style={styles.magnifierCoords}>
              <Text style={[styles.magnifierCoordsText, isPhoneDevice && { fontSize: 9 }]}>
                X: {Math.round(magnifierTargetPosition.x)}
              </Text>
              <Text style={[styles.magnifierCoordsText, isPhoneDevice && { fontSize: 9 }]}>
                Y: {Math.round(magnifierTargetPosition.y)}
              </Text>
            </View>
          </View>
          
          {/* Verbindungslinie zum Zielpunkt */}
          <View style={styles.magnifierLine} />
        </View>
        );
      })()}
    </>
  );
}

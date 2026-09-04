/**
 * SignaturePad - SVG-basierte Unterschriften-Komponente
 * - Keine externe Library
 * - Verwendet ref um setState im Render-Cycle zu vermeiden
 * - Signalisiert Eltern via onDrawingChange, ob gerade gezeichnet wird
 *   (damit die Eltern-ScrollView deaktiviert werden kann)
 */
import React, { useRef, useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, PanResponder, GestureResponderEvent } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';

// Workaround RN-SVG Fabric-Bug (SDK 57): erzwingt Canvas-Neuzeichnen pro Render
let fabricTick = 0;

interface SignaturePadProps {
  value?: string;
  onChange: (svgPath: string) => void;
  height?: number;
  label?: string;
  placeholder?: string;
  /** Wird aufgerufen wenn der Nutzer beginnt zu zeichnen (true) / aufhört (false).
   *  Eltern können damit z.B. eine ScrollView deaktivieren.
   */
  onDrawingChange?: (isDrawing: boolean) => void;
}

export const SignaturePad: React.FC<SignaturePadProps> = ({
  value = '',
  onChange,
  height = 180,
  label,
  placeholder = 'Hier unterschreiben',
  onDrawingChange,
}) => {
  // paths leben primär im ref um Render-Zyklen-Konflikte zu vermeiden.
  const pathsRef = useRef<string[]>(value ? value.split('|').filter(Boolean) : []);
  const [, forceRender] = useState(0);
  const [isActive, setIsActive] = useState(false);
  const rerender = useCallback(() => forceRender((v) => v + 1), []);

  // Aktuell laufender Pfad index
  const isDrawingRef = useRef(false);

  const commitChange = useCallback(() => {
    onChange(pathsRef.current.join('|'));
  }, [onChange]);

  // Drawing-Threshold: erst nach 4px Bewegung als "Unterschrift" werten
  // → schnelles vertikales Wischen scrollt, aber Stift-Bewegung startet die Unterschrift
  const moveStartedRef = useRef(false);
  const startPosRef = useRef<{ x: number; y: number } | null>(null);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      // Capture FALSE: damit ScrollView vertikales Scrollen darüber zulässt
      onStartShouldSetPanResponderCapture: () => false,
      onMoveShouldSetPanResponderCapture: () => false,
      // Termination FALSE: sobald aktiv gezeichnet wird, NICHT mehr an ScrollView abgeben
      onPanResponderTerminationRequest: () => !isDrawingRef.current,
      onPanResponderGrant: (e: GestureResponderEvent) => {
        const { locationX, locationY } = e.nativeEvent;
        // Path-Anfang merken aber NOCH NICHT scrollen sperren
        const newPath = `M${locationX.toFixed(1)},${locationY.toFixed(1)}`;
        pathsRef.current = [...pathsRef.current, newPath];
        moveStartedRef.current = false;
        startPosRef.current = { x: locationX, y: locationY };
        rerender();
      },
      onPanResponderMove: (e: GestureResponderEvent) => {
        const { locationX, locationY } = e.nativeEvent;
        // Beim ersten echten Move: Drawing aktivieren + Scroll sperren
        if (!moveStartedRef.current && startPosRef.current) {
          const dx = Math.abs(locationX - startPosRef.current.x);
          const dy = Math.abs(locationY - startPosRef.current.y);
          if (dx > 4 || dy > 4) {
            moveStartedRef.current = true;
            isDrawingRef.current = true;
            onDrawingChange?.(true); // ← Hier wird Scroll gesperrt
          } else {
            return; // Noch nicht genug Bewegung — nicht zeichnen
          }
        }
        const last = pathsRef.current[pathsRef.current.length - 1];
        if (!last) return;
        pathsRef.current[pathsRef.current.length - 1] = `${last} L${locationX.toFixed(1)},${locationY.toFixed(1)}`;
        rerender();
      },
      onPanResponderRelease: () => {
        const wasDrawing = isDrawingRef.current;
        isDrawingRef.current = false;
        moveStartedRef.current = false;
        startPosRef.current = null;
        // Falls kein echtes Zeichnen stattfand: leeren Path entfernen
        if (!wasDrawing) {
          const lastPath = pathsRef.current[pathsRef.current.length - 1];
          if (lastPath && !lastPath.includes('L')) {
            pathsRef.current = pathsRef.current.slice(0, -1);
            rerender();
          }
        }
        commitChange();
        // Scroll wieder aktivieren (mit kleinem Delay um Race-Conditions zu vermeiden)
        setTimeout(() => {
          if (!isDrawingRef.current) onDrawingChange?.(false);
        }, 50);
      },
      onPanResponderTerminate: () => {
        isDrawingRef.current = false;
        moveStartedRef.current = false;
        startPosRef.current = null;
        commitChange();
        setTimeout(() => {
          if (!isDrawingRef.current) onDrawingChange?.(false);
        }, 50);
      },
    })
  ).current;

  const handleClear = () => {
    pathsRef.current = [];
    rerender();
    commitChange();
  };

  const handleUndo = () => {
    pathsRef.current = pathsRef.current.slice(0, -1);
    rerender();
    commitChange();
  };

  const paths = pathsRef.current;
  const isEmpty = paths.length === 0;

  return (
    <View style={styles.wrapper}>
      {label && <Text style={styles.label}>{label}</Text>}
      <View
        style={[styles.canvas, { height }, isActive && styles.canvasActive]}
        {...(isActive ? panResponder.panHandlers : {})}
      >
        <Svg width="100%" height="100%">
          {paths.map((d, i) => (
            <Path key={i} d={d} stroke="#1a237e" strokeWidth={2.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
          ))}
          <Path key={`inv-${fabricTick++}`} d="M -9999 -9999" stroke="none" fill="none" />
        </Svg>
        {isEmpty && (
          <View pointerEvents="none" style={styles.placeholderContainer}>
            <Ionicons name={isActive ? 'create' : 'create-outline'} size={28} color={isActive ? '#1976d2' : '#bbb'} />
            <Text style={[styles.placeholderText, isActive && { color: '#1976d2', fontWeight: '600' }]}>
              {isActive ? 'Jetzt hier unterschreiben' : placeholder}
            </Text>
          </View>
        )}
        <View style={styles.baselineContainer} pointerEvents="none">
          <View style={styles.baseline} />
          <Text style={styles.xMark}>✕</Text>
        </View>
        {/* Overlay wenn inaktiv: blockiert keine Touch-Events (pointerEvents=none) und sieht "deaktiviert" aus */}
        {!isActive && (
          <View pointerEvents="none" style={styles.inactiveOverlay} />
        )}
      </View>
      <View style={styles.buttonRow}>
        <TouchableOpacity onPress={handleUndo} style={styles.button} disabled={isEmpty || !isActive}>
          <Ionicons name="arrow-undo" size={18} color={(isEmpty || !isActive) ? '#bbb' : '#1976d2'} />
          <Text style={[styles.buttonText, (isEmpty || !isActive) && { color: '#bbb' }]}>Rückgängig</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={handleClear} style={styles.button} disabled={isEmpty}>
          <Ionicons name="trash-outline" size={18} color={isEmpty ? '#bbb' : '#d32f2f'} />
          <Text style={[styles.buttonText, { color: isEmpty ? '#bbb' : '#d32f2f' }]}>Löschen</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => {
            if (!isActive) {
              // === Aktivieren: Eingabemodus starten ===
              setIsActive(true);
              onDrawingChange?.(true); // Scroll sperren
            } else {
              // === Beenden: Unterschrift speichern, Scroll wieder frei ===
              isDrawingRef.current = false;
              moveStartedRef.current = false;
              startPosRef.current = null;
              commitChange();
              setIsActive(false);
              onDrawingChange?.(false); // Scroll freigeben
              // Sicherheits-Doppel-Unlock
              setTimeout(() => onDrawingChange?.(false), 100);
            }
          }}
          style={[styles.button, isActive ? styles.doneButton : styles.startButton]}
          activeOpacity={0.7}
        >
          <Ionicons
            name={isActive ? 'checkmark-circle' : 'pencil'}
            size={18}
            color="#fff"
          />
          <Text style={[styles.buttonText, { color: '#fff', fontWeight: '700' }]}>
            {isActive ? 'Fertig' : 'Unterschrift'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    width: '100%',
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 6,
  },
  canvas: {
    backgroundColor: '#fafafa',
    borderWidth: 1.5,
    borderColor: '#cfd8dc',
    borderRadius: 10,
    overflow: 'hidden',
    position: 'relative',
  },
  placeholderContainer: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: {
    color: '#bbb',
    marginTop: 4,
    fontSize: 13,
  },
  baselineContainer: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 24,
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  baseline: {
    flex: 1,
    height: 1,
    backgroundColor: '#cfd8dc',
  },
  xMark: {
    fontSize: 10,
    color: '#cfd8dc',
    marginLeft: -10,
    marginBottom: -4,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 16,
    marginTop: 6,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  buttonText: {
    fontSize: 13,
    color: '#1976d2',
    fontWeight: '500',
  },
  doneButton: {
    backgroundColor: '#16a34a',
    borderRadius: 8,
    paddingHorizontal: 12,
  },
  startButton: {
    backgroundColor: '#1976d2',
    borderRadius: 8,
    paddingHorizontal: 14,
  },
  canvasActive: {
    borderColor: '#1976d2',
    borderWidth: 2,
    backgroundColor: '#f0f9ff',
  },
  inactiveOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(248, 250, 252, 0.4)',
  },
});

export default SignaturePad;

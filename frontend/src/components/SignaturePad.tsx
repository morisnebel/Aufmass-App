/**
 * SignaturePad - SVG-basierte Unterschriften-Komponente
 * Keine externe Library nötig. Speichert das Pfad-String (SVG "d"-Attribute).
 */
import React, { useRef, useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, PanResponder, GestureResponderEvent } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';

interface SignaturePadProps {
  value?: string;
  onChange: (svgPath: string) => void;
  height?: number;
  label?: string;
  placeholder?: string;
}

export const SignaturePad: React.FC<SignaturePadProps> = ({
  value = '',
  onChange,
  height = 180,
  label,
  placeholder = 'Hier unterschreiben',
}) => {
  const [paths, setPaths] = useState<string[]>(value ? value.split('|').filter(Boolean) : []);
  const currentPathRef = useRef<string>('');
  const containerLayoutRef = useRef<{ x: number; y: number; width: number; height: number }>({
    x: 0, y: 0, width: 0, height: 0
  });

  const updateExternal = useCallback((newPaths: string[]) => {
    onChange(newPaths.join('|'));
  }, [onChange]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e: GestureResponderEvent) => {
        const { locationX, locationY } = e.nativeEvent;
        currentPathRef.current = `M${locationX.toFixed(1)},${locationY.toFixed(1)}`;
        setPaths((prev) => [...prev, currentPathRef.current]);
      },
      onPanResponderMove: (e: GestureResponderEvent) => {
        const { locationX, locationY } = e.nativeEvent;
        currentPathRef.current += ` L${locationX.toFixed(1)},${locationY.toFixed(1)}`;
        setPaths((prev) => {
          const next = [...prev];
          next[next.length - 1] = currentPathRef.current;
          return next;
        });
      },
      onPanResponderRelease: () => {
        setPaths((prev) => {
          updateExternal(prev);
          return prev;
        });
      },
    })
  ).current;

  const handleClear = () => {
    setPaths([]);
    onChange('');
  };

  const handleUndo = () => {
    setPaths((prev) => {
      const next = prev.slice(0, -1);
      updateExternal(next);
      return next;
    });
  };

  const isEmpty = paths.length === 0;

  return (
    <View style={styles.wrapper}>
      {label && <Text style={styles.label}>{label}</Text>}
      <View
        style={[styles.canvas, { height }]}
        {...panResponder.panHandlers}
        onLayout={(e) => {
          containerLayoutRef.current = e.nativeEvent.layout;
        }}
      >
        <Svg width="100%" height="100%">
          {paths.map((d, i) => (
            <Path key={i} d={d} stroke="#1a237e" strokeWidth={2.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
          ))}
        </Svg>
        {isEmpty && (
          <View pointerEvents="none" style={styles.placeholderContainer}>
            <Ionicons name="create-outline" size={28} color="#bbb" />
            <Text style={styles.placeholderText}>{placeholder}</Text>
          </View>
        )}
        <View style={styles.baselineContainer} pointerEvents="none">
          <View style={styles.baseline} />
        </View>
      </View>
      <View style={styles.buttonRow}>
        <TouchableOpacity onPress={handleUndo} style={styles.button} disabled={isEmpty}>
          <Ionicons name="arrow-undo" size={18} color={isEmpty ? '#bbb' : '#1976d2'} />
          <Text style={[styles.buttonText, isEmpty && { color: '#bbb' }]}>Rückgängig</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={handleClear} style={styles.button} disabled={isEmpty}>
          <Ionicons name="trash-outline" size={18} color={isEmpty ? '#bbb' : '#d32f2f'} />
          <Text style={[styles.buttonText, { color: isEmpty ? '#bbb' : '#d32f2f' }]}>Löschen</Text>
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
  },
  baseline: {
    height: 1,
    backgroundColor: '#cfd8dc',
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
});

export default SignaturePad;

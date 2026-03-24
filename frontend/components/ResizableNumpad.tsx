import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  PanResponder,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';

const NUMPAD_SIZE_KEY = 'aufmassprofi_numpad_size';

type NumpadSize = 'S' | 'M' | 'L';

const SIZE_SCALES: Record<NumpadSize, number> = {
  S: 0.75,
  M: 1.0,
  L: 1.35,
};

interface ResizableNumpadProps {
  onKeyPress: (key: string) => void;
  onClose?: () => void;
  visible: boolean;
  showLetters?: boolean; // Buchstaben-Modus erlauben
  showUnits?: boolean; // Einheiten anzeigen (m, m², lfm etc.)
}

const ResizableNumpad: React.FC<ResizableNumpadProps> = ({
  onKeyPress,
  onClose,
  visible,
  showLetters = true,
  showUnits = true,
}) => {
  const [mode, setMode] = useState<'numbers' | 'letters'>('numbers');
  const [caps, setCaps] = useState(false);
  const [size, setSize] = useState<NumpadSize>('M');
  const [pinchScale, setPinchScale] = useState(1);

  // Draggable position
  const position = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  
  // Pinch tracking
  const lastPinchDistance = useRef(0);
  const initialPinchScale = useRef(1);

  // Load saved size
  useEffect(() => {
    AsyncStorage.getItem(NUMPAD_SIZE_KEY).then(saved => {
      if (saved && (saved === 'S' || saved === 'M' || saved === 'L')) {
        setSize(saved as NumpadSize);
      }
    });
  }, []);

  // Save size when it changes
  const changeSize = (newSize: NumpadSize) => {
    setSize(newSize);
    AsyncStorage.setItem(NUMPAD_SIZE_KEY, newSize);
  };

  // Pan responder for dragging (single finger) and pinch-to-zoom (two fingers)
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        // Only respond to drag if moved enough or multi-touch
        return Math.abs(gestureState.dx) > 2 || Math.abs(gestureState.dy) > 2 || gestureState.numberActiveTouches >= 2;
      },
      onPanResponderGrant: (evt) => {
        position.extractOffset();
        if (evt.nativeEvent.touches.length >= 2) {
          const t = evt.nativeEvent.touches;
          const dx = t[0].pageX - t[1].pageX;
          const dy = t[0].pageY - t[1].pageY;
          lastPinchDistance.current = Math.sqrt(dx * dx + dy * dy);
          initialPinchScale.current = SIZE_SCALES[size];
        }
      },
      onPanResponderMove: (evt, gestureState) => {
        if (evt.nativeEvent.touches.length >= 2) {
          // Pinch-to-zoom
          const t = evt.nativeEvent.touches;
          const dx = t[0].pageX - t[1].pageX;
          const dy = t[0].pageY - t[1].pageY;
          const distance = Math.sqrt(dx * dx + dy * dy);
          
          if (lastPinchDistance.current > 0) {
            const ratio = distance / lastPinchDistance.current;
            const newScale = initialPinchScale.current * ratio;
            
            // Snap to size steps
            if (newScale <= 0.85) {
              if (size !== 'S') changeSize('S');
            } else if (newScale >= 1.15) {
              if (size !== 'L') changeSize('L');
            } else {
              if (size !== 'M') changeSize('M');
            }
          }
        } else {
          // Single finger drag
          Animated.event(
            [null, { dx: position.x, dy: position.y }],
            { useNativeDriver: false }
          )(evt, gestureState);
        }
      },
      onPanResponderRelease: () => {
        position.extractOffset();
      },
    })
  ).current;

  if (!visible) return null;

  const scale = SIZE_SCALES[size];
  const baseKeySize = 44;
  const keySize = baseKeySize * scale;
  const fontSize = Math.round(16 * scale);
  const gap = Math.round(4 * scale);
  const padding = Math.round(8 * scale);

  const handleKey = (key: string) => {
    onKeyPress(key);
  };

  const renderNumberKeys = () => (
    <>
      <View style={[styles.row, { gap }]}>
        {['7', '8', '9', '+'].map(k => (
          <TouchableOpacity
            key={k}
            style={[styles.key, { minWidth: keySize, minHeight: keySize * 0.7 }, k === '+' && styles.opKey]}
            onPress={() => handleKey(k)}
          >
            <Text style={[k === '+' ? styles.opText : styles.keyText, { fontSize }]}>{k}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <View style={[styles.row, { gap }]}>
        {['4', '5', '6', '-'].map(k => (
          <TouchableOpacity
            key={k}
            style={[styles.key, { minWidth: keySize, minHeight: keySize * 0.7 }, k === '-' && styles.opKey]}
            onPress={() => handleKey(k)}
          >
            <Text style={[k === '-' ? styles.opText : styles.keyText, { fontSize }]}>{k === '-' ? '−' : k}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <View style={[styles.row, { gap }]}>
        {['1', '2', '3', '×'].map(k => (
          <TouchableOpacity
            key={k}
            style={[styles.key, { minWidth: keySize, minHeight: keySize * 0.7 }, k === '×' && styles.opKey]}
            onPress={() => handleKey(k === '×' ? '*' : k)}
          >
            <Text style={[k === '×' ? styles.opText : styles.keyText, { fontSize }]}>{k}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <View style={[styles.row, { gap }]}>
        {[',', '0', '.', '÷'].map(k => (
          <TouchableOpacity
            key={k}
            style={[styles.key, { minWidth: keySize, minHeight: keySize * 0.7 }, k === '÷' && styles.opKey]}
            onPress={() => handleKey(k === '÷' ? '/' : k)}
          >
            <Text style={[k === '÷' ? styles.opText : styles.keyText, { fontSize }]}>{k}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <View style={[styles.row, { gap }]}>
        {showLetters && (
          <TouchableOpacity style={[styles.key, { minWidth: keySize, minHeight: keySize * 0.7 }, styles.modeKey]} onPress={() => setMode('letters')}>
            <Text style={[styles.modeText, { fontSize: fontSize * 0.75 }]}>ABC</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={[styles.key, { minWidth: keySize, minHeight: keySize * 0.7 }, styles.clearKey]} onPress={() => handleKey('C')}>
          <Text style={[styles.clearText, { fontSize: fontSize * 0.9 }]}>C</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.key, { minWidth: keySize, minHeight: keySize * 0.7 }]} onPress={() => handleKey(' ')}>
          <Text style={[styles.keyText, { fontSize }]}>␣</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.key, { minWidth: keySize, minHeight: keySize * 0.7 }, styles.delKey]} onPress={() => handleKey('⌫')}>
          <Ionicons name="backspace-outline" size={Math.round(18 * scale)} color="#f44336" />
        </TouchableOpacity>
      </View>
    </>
  );

  const renderLetterKeys = () => (
    <>
      {showUnits && (
        <>
          <View style={[styles.row, { gap }]}>
            {['m', 'm²', 'm³', 'lfm'].map((k, i) => (
              <TouchableOpacity key={`unit-${i}`} style={[styles.key, { minWidth: keySize, minHeight: keySize * 0.7 }, styles.unitKey]} onPress={() => handleKey(k)}>
                <Text style={[styles.unitText, { fontSize: fontSize * 0.75 }]}>{k}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={[styles.row, { gap }]}>
            {['Stk', 'Paar', 'kg', 'l'].map((k, i) => (
              <TouchableOpacity key={`unit2-${i}`} style={[styles.key, { minWidth: keySize, minHeight: keySize * 0.7 }, styles.unitKey]} onPress={() => handleKey(k)}>
                <Text style={[styles.unitText, { fontSize: fontSize * 0.75 }]}>{k}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </>
      )}
      {['abcdef', 'ghijklm', 'nopqrs', 'tuvwxy', 'zäöüß-'].map((row, ri) => (
        <View key={`row-${ri}`} style={[styles.row, { gap }]}>
          {row.split('').map(k => (
            <TouchableOpacity
              key={`let-${k}`}
              style={[styles.key, { minWidth: keySize * 0.65, minHeight: keySize * 0.7 }]}
              onPress={() => handleKey(caps ? (k === 'ß' ? 'ẞ' : k.toUpperCase()) : k)}
            >
              <Text style={[styles.keyText, { fontSize }]}>{caps ? (k === 'ß' ? 'ẞ' : k.toUpperCase()) : k}</Text>
            </TouchableOpacity>
          ))}
        </View>
      ))}
      <View style={[styles.row, { gap }]}>
        <TouchableOpacity style={[styles.key, { minWidth: keySize, minHeight: keySize * 0.7 }, styles.modeKey]} onPress={() => setMode('numbers')}>
          <Text style={[styles.modeText, { fontSize: fontSize * 0.75 }]}>123</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.key, { minWidth: keySize, minHeight: keySize * 0.7 }, caps && styles.capsActive]} onPress={() => setCaps(!caps)}>
          <Ionicons name="arrow-up" size={Math.round(18 * scale)} color={caps ? '#fff' : '#666'} />
        </TouchableOpacity>
        <TouchableOpacity style={[styles.key, { minWidth: keySize, minHeight: keySize * 0.7 }]} onPress={() => handleKey(' ')}>
          <Text style={[styles.keyText, { fontSize }]}>␣</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.key, { minWidth: keySize, minHeight: keySize * 0.7 }, styles.delKey]} onPress={() => handleKey('⌫')}>
          <Ionicons name="backspace-outline" size={Math.round(18 * scale)} color="#f44336" />
        </TouchableOpacity>
      </View>
    </>
  );

  return (
    <Animated.View
      style={[
        styles.container,
        { transform: position.getTranslateTransform(), padding },
      ]}
    >
      {/* Header with drag handle + size controls + close */}
      <View {...panResponder.panHandlers} style={styles.header}>
        <View style={styles.dragIndicator} />
        
        {/* Size buttons S/M/L */}
        <View style={styles.sizeButtons}>
          {(['S', 'M', 'L'] as NumpadSize[]).map(s => (
            <TouchableOpacity
              key={s}
              style={[styles.sizeBtn, size === s && styles.sizeBtnActive]}
              onPress={() => changeSize(s)}
            >
              <Text style={[styles.sizeBtnText, size === s && styles.sizeBtnTextActive]}>{s}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Pinch hint */}
        <Text style={styles.pinchHint}>⤡</Text>
        
        {onClose && (
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="close-circle" size={22} color="#999" />
          </TouchableOpacity>
        )}
      </View>

      {/* Keys */}
      {mode === 'numbers' ? renderNumberKeys() : renderLetterKeys()}
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    paddingHorizontal: 4,
    gap: 8,
    marginBottom: 4,
  },
  dragIndicator: {
    width: 32,
    height: 4,
    backgroundColor: '#ccc',
    borderRadius: 2,
  },
  sizeButtons: {
    flexDirection: 'row',
    gap: 2,
  },
  sizeBtn: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    backgroundColor: '#f0f0f0',
    borderWidth: 1,
    borderColor: '#ddd',
  },
  sizeBtnActive: {
    backgroundColor: '#1976d2',
    borderColor: '#1565c0',
  },
  sizeBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#666',
  },
  sizeBtnTextActive: {
    color: '#fff',
  },
  pinchHint: {
    fontSize: 14,
    color: '#bbb',
  },
  row: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  key: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  keyText: {
    fontWeight: '600',
    color: '#333',
  },
  opKey: {
    backgroundColor: '#e3f2fd',
    borderColor: '#2196f3',
  },
  opText: {
    fontWeight: '700',
    color: '#1976d2',
  },
  delKey: {
    backgroundColor: '#ffebee',
    borderColor: '#f44336',
  },
  clearKey: {
    backgroundColor: '#fff3e0',
    borderColor: '#ff9800',
  },
  clearText: {
    fontWeight: '700',
    color: '#f57c00',
  },
  modeKey: {
    backgroundColor: '#e8eaf6',
    borderColor: '#5c6bc0',
  },
  modeText: {
    fontWeight: '700',
    color: '#3949ab',
  },
  unitKey: {
    backgroundColor: '#e8f5e9',
    borderColor: '#4caf50',
  },
  unitText: {
    fontWeight: '600',
    color: '#388e3c',
  },
  capsActive: {
    backgroundColor: '#1976d2',
    borderColor: '#1565c0',
  },
});

export default ResizableNumpad;

import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  PanResponder,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';

const NUMPAD_SIZE_KEY = 'aufmassprofi_numpad_size';

type NumpadSize = 'S' | 'M' | 'L';

const SIZE_SCALES: Record<NumpadSize, number> = {
  S: 0.7,
  M: 1.0,
  L: 1.3,
};

const SIZE_CYCLE: NumpadSize[] = ['S', 'M', 'L'];

interface ResizableNumpadProps {
  onKeyPress: (key: string) => void;
  onClose?: () => void;
  visible: boolean;
  showLetters?: boolean;
  showUnits?: boolean;
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

  // Draggable position
  const position = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;

  // Load saved size
  useEffect(() => {
    AsyncStorage.getItem(NUMPAD_SIZE_KEY).then(saved => {
      if (saved && (saved === 'S' || saved === 'M' || saved === 'L')) {
        setSize(saved as NumpadSize);
      }
    });
  }, []);

  // Save size when changed
  const changeSize = (newSize: NumpadSize) => {
    setSize(newSize);
    AsyncStorage.setItem(NUMPAD_SIZE_KEY, newSize);
  };

  // Cycle through sizes on long press of the drag handle
  const cycleSize = () => {
    const idx = SIZE_CYCLE.indexOf(size);
    const next = SIZE_CYCLE[(idx + 1) % SIZE_CYCLE.length];
    changeSize(next);
  };

  // Pan responder for dragging
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gs) => Math.abs(gs.dx) > 3 || Math.abs(gs.dy) > 3,
      onPanResponderGrant: () => {
        position.extractOffset();
      },
      onPanResponderMove: Animated.event(
        [null, { dx: position.x, dy: position.y }],
        { useNativeDriver: false }
      ),
      onPanResponderRelease: () => {
        position.extractOffset();
      },
    })
  ).current;

  if (!visible) return null;

  const scale = SIZE_SCALES[size];
  const baseKeySize = 44;
  const keySize = baseKeySize * scale;
  const keyHeight = keySize * 0.72;
  const fontSize = Math.round(16 * scale);
  const gap = Math.round(3 * scale);
  const padding = Math.round(6 * scale);

  const handleKey = (key: string) => {
    onKeyPress(key);
  };

  const renderKey = (label: string, value: string, extraStyle?: any, textStyle?: any, widthMul?: number) => (
    <TouchableOpacity
      key={label + value}
      style={[styles.key, { minWidth: keySize * (widthMul || 1), height: keyHeight }, extraStyle]}
      onPress={() => handleKey(value)}
      activeOpacity={0.6}
    >
      {label === '⌫' ? (
        <Ionicons name="backspace-outline" size={Math.round(18 * scale)} color="#f44336" />
      ) : (
        <Text style={[styles.keyText, { fontSize }, textStyle]}>{label}</Text>
      )}
    </TouchableOpacity>
  );

  const renderNumberKeys = () => (
    <View style={{ gap }}>
      <View style={[styles.row, { gap }]}>
        {renderKey('7', '7')}
        {renderKey('8', '8')}
        {renderKey('9', '9')}
        {renderKey('+', '+', styles.opKey, styles.opText)}
      </View>
      <View style={[styles.row, { gap }]}>
        {renderKey('4', '4')}
        {renderKey('5', '5')}
        {renderKey('6', '6')}
        {renderKey('−', '-', styles.opKey, styles.opText)}
      </View>
      <View style={[styles.row, { gap }]}>
        {renderKey('1', '1')}
        {renderKey('2', '2')}
        {renderKey('3', '3')}
        {renderKey('×', '*', styles.opKey, styles.opText)}
      </View>
      <View style={[styles.row, { gap }]}>
        {renderKey(',', ',')}
        {renderKey('0', '0')}
        {renderKey('.', '.')}
        {renderKey('÷', '/', styles.opKey, styles.opText)}
      </View>
      <View style={[styles.row, { gap }]}>
        {showLetters && renderKey('ABC', 'ABC', styles.modeKey, styles.modeText)}
        {renderKey('C', 'C', styles.clearKey, styles.clearText)}
        {renderKey('␣', ' ')}
        {renderKey('⌫', '⌫', styles.delKey)}
      </View>
    </View>
  );

  const renderLetterKeys = () => (
    <View style={{ gap }}>
      {showUnits && (
        <>
          <View style={[styles.row, { gap }]}>
            {['m', 'm²', 'm³', 'lfm'].map(k => renderKey(k, k, styles.unitKey, styles.unitText))}
          </View>
          <View style={[styles.row, { gap }]}>
            {['Stk', 'Paar', 'kg', 'l'].map(k => renderKey(k, k, styles.unitKey, styles.unitText))}
          </View>
        </>
      )}
      {[
        ['a','b','c','d','e','f'],
        ['g','h','i','j','k','l','m'],
        ['n','o','p','q','r','s'],
        ['t','u','v','w','x','y'],
        ['z','ä','ö','ü','ß','-'],
      ].map((row, ri) => (
        <View key={`row-${ri}`} style={[styles.row, { gap }]}>
          {row.map(k => {
            const display = caps ? (k === 'ß' ? 'ẞ' : k.toUpperCase()) : k;
            return renderKey(display, display, undefined, undefined, 0.7);
          })}
        </View>
      ))}
      <View style={[styles.row, { gap }]}>
        {renderKey('123', '123', styles.modeKey, styles.modeText)}
        <TouchableOpacity
          style={[styles.key, { minWidth: keySize, height: keyHeight }, caps && styles.capsActive]}
          onPress={() => setCaps(!caps)}
        >
          <Ionicons name="arrow-up" size={Math.round(18 * scale)} color={caps ? '#fff' : '#666'} />
        </TouchableOpacity>
        {renderKey('␣', ' ')}
        {renderKey('⌫', '⌫', styles.delKey)}
      </View>
    </View>
  );

  // Intercept special keys
  const originalOnKeyPress = onKeyPress;
  const wrappedHandleKey = (key: string) => {
    if (key === 'ABC') {
      setMode('letters');
      return;
    }
    if (key === '123') {
      setMode('numbers');
      return;
    }
    originalOnKeyPress(key);
  };

  // Override handleKey
  const handleKeyWrapped = wrappedHandleKey;

  return (
    <Animated.View
      style={[
        styles.container,
        { transform: position.getTranslateTransform(), padding },
      ]}
    >
      {/* Header: drag handle + size buttons + close */}
      <View style={styles.header}>
        {/* Drag handle */}
        <View {...panResponder.panHandlers} style={styles.dragArea}>
          <View style={styles.dragIndicator} />
        </View>
        
        {/* Size buttons S/M/L */}
        <View style={styles.sizeButtons}>
          {SIZE_CYCLE.map(s => (
            <TouchableOpacity
              key={s}
              style={[styles.sizeBtn, size === s && styles.sizeBtnActive]}
              onPress={() => changeSize(s)}
            >
              <Text style={[styles.sizeBtnText, size === s && styles.sizeBtnTextActive]}>{s}</Text>
            </TouchableOpacity>
          ))}
        </View>
        
        {onClose && (
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="close-circle" size={22} color="#999" />
          </TouchableOpacity>
        )}
      </View>

      {/* Keys */}
      {mode === 'numbers' ? (
        <NumberPad scale={scale} keySize={keySize} keyHeight={keyHeight} fontSize={fontSize} gap={gap}
          onKeyPress={handleKeyWrapped} showLetters={showLetters} />
      ) : (
        <LetterPad scale={scale} keySize={keySize} keyHeight={keyHeight} fontSize={fontSize} gap={gap}
          onKeyPress={handleKeyWrapped} caps={caps} setCaps={setCaps} showUnits={showUnits} />
      )}
    </Animated.View>
  );
};

// Extracted key pads as sub-components to avoid re-renders
const NumberPad = ({ scale, keySize, keyHeight, fontSize, gap, onKeyPress, showLetters }: any) => {
  const renderKey = (label: string, value: string, extraStyle?: any, textStyle?: any) => (
    <TouchableOpacity
      key={label + value}
      style={[styles.key, { minWidth: keySize, height: keyHeight }, extraStyle]}
      onPress={() => onKeyPress(value)}
      activeOpacity={0.6}
    >
      {label === '⌫' ? (
        <Ionicons name="backspace-outline" size={Math.round(18 * scale)} color="#f44336" />
      ) : (
        <Text style={[styles.keyText, { fontSize }, textStyle]}>{label}</Text>
      )}
    </TouchableOpacity>
  );

  return (
    <View style={{ gap }}>
      <View style={[styles.row, { gap }]}>
        {renderKey('7', '7')}{renderKey('8', '8')}{renderKey('9', '9')}{renderKey('+', '+', styles.opKey, styles.opText)}
      </View>
      <View style={[styles.row, { gap }]}>
        {renderKey('4', '4')}{renderKey('5', '5')}{renderKey('6', '6')}{renderKey('−', '-', styles.opKey, styles.opText)}
      </View>
      <View style={[styles.row, { gap }]}>
        {renderKey('1', '1')}{renderKey('2', '2')}{renderKey('3', '3')}{renderKey('×', '*', styles.opKey, styles.opText)}
      </View>
      <View style={[styles.row, { gap }]}>
        {renderKey(',', ',')}{renderKey('0', '0')}{renderKey('.', '.')}{renderKey('÷', '/', styles.opKey, styles.opText)}
      </View>
      <View style={[styles.row, { gap }]}>
        {showLetters && renderKey('ABC', 'ABC', styles.modeKey, styles.modeText)}
        {renderKey('C', 'C', styles.clearKey, styles.clearText)}
        {renderKey('␣', ' ')}
        {renderKey('⌫', '⌫', styles.delKey)}
      </View>
    </View>
  );
};

const LetterPad = ({ scale, keySize, keyHeight, fontSize, gap, onKeyPress, caps, setCaps, showUnits }: any) => {
  const renderKey = (label: string, value: string, extraStyle?: any, textStyle?: any, wMul?: number) => (
    <TouchableOpacity
      key={label + value}
      style={[styles.key, { minWidth: keySize * (wMul || 1), height: keyHeight }, extraStyle]}
      onPress={() => onKeyPress(value)}
      activeOpacity={0.6}
    >
      {label === '⌫' ? (
        <Ionicons name="backspace-outline" size={Math.round(18 * scale)} color="#f44336" />
      ) : (
        <Text style={[styles.keyText, { fontSize }, textStyle]}>{label}</Text>
      )}
    </TouchableOpacity>
  );

  return (
    <View style={{ gap }}>
      {showUnits && (
        <>
          <View style={[styles.row, { gap }]}>
            {['m', 'm²', 'm³', 'lfm'].map(k => renderKey(k, k, styles.unitKey, styles.unitText))}
          </View>
          <View style={[styles.row, { gap }]}>
            {['Stk', 'Paar', 'kg', 'l'].map(k => renderKey(k, k, styles.unitKey, styles.unitText))}
          </View>
        </>
      )}
      {[
        ['a','b','c','d','e','f'],
        ['g','h','i','j','k','l','m'],
        ['n','o','p','q','r','s'],
        ['t','u','v','w','x','y'],
        ['z','ä','ö','ü','ß','-'],
      ].map((row, ri) => (
        <View key={`row-${ri}`} style={[styles.row, { gap }]}>
          {row.map(k => {
            const display = caps ? (k === 'ß' ? 'ẞ' : k.toUpperCase()) : k;
            return renderKey(display, display, undefined, undefined, 0.7);
          })}
        </View>
      ))}
      <View style={[styles.row, { gap }]}>
        {renderKey('123', '123', styles.modeKey, styles.modeText)}
        <TouchableOpacity
          style={[styles.key, { minWidth: keySize, height: keyHeight }, caps && styles.capsActive]}
          onPress={() => setCaps(!caps)}
        >
          <Ionicons name="arrow-up" size={Math.round(18 * scale)} color={caps ? '#fff' : '#666'} />
        </TouchableOpacity>
        {renderKey('␣', ' ')}
        {renderKey('⌫', '⌫', styles.delKey)}
      </View>
    </View>
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
    marginTop: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 4,
    gap: 10,
  },
  dragArea: {
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  dragIndicator: {
    width: 36,
    height: 4,
    backgroundColor: '#ccc',
    borderRadius: 2,
  },
  sizeButtons: {
    flexDirection: 'row',
    gap: 3,
  },
  sizeBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: '#f0f0f0',
    borderWidth: 1,
    borderColor: '#ddd',
  },
  sizeBtnActive: {
    backgroundColor: '#1976d2',
    borderColor: '#1565c0',
  },
  sizeBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#666',
  },
  sizeBtnTextActive: {
    color: '#fff',
  },
  row: {
    flexDirection: 'row',
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

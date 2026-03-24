import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
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

  // Load saved size on mount
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

  if (!visible) return null;

  const scale = SIZE_SCALES[size];
  const keySize = 44 * scale;
  const keyHeight = keySize * 0.72;
  const fontSize = Math.round(16 * scale);
  const gap = Math.round(3 * scale);
  const padding = Math.round(8 * scale);

  // Handle key press with mode switching
  const handleKey = (key: string) => {
    if (key === '__ABC__') {
      setMode('letters');
      return;
    }
    if (key === '__123__') {
      setMode('numbers');
      return;
    }
    onKeyPress(key);
  };

  const Key = ({ label, value, style: extraStyle, textStyle, widthMul }: {
    label: string; value: string; style?: any; textStyle?: any; widthMul?: number;
  }) => (
    <TouchableOpacity
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

  return (
    <View style={[styles.container, { padding }]}>
      {/* Header: size buttons + close */}
      <View style={styles.header}>
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
          <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="close-circle" size={24} color="#999" />
          </TouchableOpacity>
        )}
      </View>

      {/* Number pad */}
      {mode === 'numbers' && (
        <View style={{ gap }}>
          <View style={[styles.row, { gap }]}>
            <Key label="7" value="7" /><Key label="8" value="8" /><Key label="9" value="9" /><Key label="+" value="+" style={styles.opKey} textStyle={styles.opText} />
          </View>
          <View style={[styles.row, { gap }]}>
            <Key label="4" value="4" /><Key label="5" value="5" /><Key label="6" value="6" /><Key label="−" value="-" style={styles.opKey} textStyle={styles.opText} />
          </View>
          <View style={[styles.row, { gap }]}>
            <Key label="1" value="1" /><Key label="2" value="2" /><Key label="3" value="3" /><Key label="×" value="*" style={styles.opKey} textStyle={styles.opText} />
          </View>
          <View style={[styles.row, { gap }]}>
            <Key label="," value="," /><Key label="0" value="0" /><Key label="." value="." /><Key label="÷" value="/" style={styles.opKey} textStyle={styles.opText} />
          </View>
          <View style={[styles.row, { gap }]}>
            {showLetters && <Key label="ABC" value="__ABC__" style={styles.modeKey} textStyle={styles.modeText} />}
            <Key label="C" value="C" style={styles.clearKey} textStyle={styles.clearText} />
            <Key label="␣" value=" " />
            <Key label="⌫" value="⌫" style={styles.delKey} />
          </View>
        </View>
      )}

      {/* Letter pad */}
      {mode === 'letters' && (
        <View style={{ gap }}>
          {showUnits && (
            <>
              <View style={[styles.row, { gap }]}>
                {['m', 'm²', 'm³', 'lfm'].map(k => <Key key={k} label={k} value={k} style={styles.unitKey} textStyle={styles.unitText} />)}
              </View>
              <View style={[styles.row, { gap }]}>
                {['Stk', 'Paar', 'kg', 'l'].map(k => <Key key={k} label={k} value={k} style={styles.unitKey} textStyle={styles.unitText} />)}
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
            <View key={`r${ri}`} style={[styles.row, { gap }]}>
              {row.map(k => {
                const d = caps ? (k === 'ß' ? 'ẞ' : k.toUpperCase()) : k;
                return <Key key={k} label={d} value={d} widthMul={0.7} />;
              })}
            </View>
          ))}
          <View style={[styles.row, { gap }]}>
            <Key label="123" value="__123__" style={styles.modeKey} textStyle={styles.modeText} />
            <TouchableOpacity
              style={[styles.key, { minWidth: keySize, height: keyHeight }, caps && styles.capsActive]}
              onPress={() => setCaps(!caps)}
            >
              <Ionicons name="arrow-up" size={Math.round(18 * scale)} color={caps ? '#fff' : '#666'} />
            </TouchableOpacity>
            <Key label="␣" value=" " />
            <Key label="⌫" value="⌫" style={styles.delKey} />
          </View>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#f8f8f8',
    borderTopWidth: 1,
    borderTopColor: '#ddd',
    borderRadius: 0,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 6,
  },
  sizeButtons: {
    flexDirection: 'row',
    gap: 4,
  },
  sizeBtn: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 6,
    backgroundColor: '#e8e8e8',
    borderWidth: 1,
    borderColor: '#ddd',
  },
  sizeBtnActive: {
    backgroundColor: '#1976d2',
    borderColor: '#1565c0',
  },
  sizeBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#666',
  },
  sizeBtnTextActive: {
    color: '#fff',
  },
  closeBtn: {
    padding: 2,
  },
  row: {
    flexDirection: 'row',
  },
  key: {
    flex: 1,
    backgroundColor: '#fff',
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
  opKey: { backgroundColor: '#e3f2fd', borderColor: '#2196f3' },
  opText: { fontWeight: '700', color: '#1976d2' },
  delKey: { backgroundColor: '#ffebee', borderColor: '#f44336' },
  clearKey: { backgroundColor: '#fff3e0', borderColor: '#ff9800' },
  clearText: { fontWeight: '700', color: '#f57c00' },
  modeKey: { backgroundColor: '#e8eaf6', borderColor: '#5c6bc0' },
  modeText: { fontWeight: '700', color: '#3949ab' },
  unitKey: { backgroundColor: '#e8f5e9', borderColor: '#4caf50' },
  unitText: { fontWeight: '600', color: '#388e3c' },
  capsActive: { backgroundColor: '#1976d2', borderColor: '#1565c0' },
});

export default ResizableNumpad;

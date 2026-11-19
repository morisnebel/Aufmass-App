import type { TFunction } from 'i18next';
import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { styles } from '../../../styles/sketchDrawStyles';
import Ionicons from '@react-native-vector-icons/ionicons';


export type MeasurePanelKeyboardProps = {
  panelKeyboardOpen: boolean;
  setMeasureKeyboardHeight: React.Dispatch<React.SetStateAction<number>>;
  numpadTargetId: string | null;
  numpadTargetLabel: (id: string) => string;
  numpadTargetValue: (id: string) => string;
  lineMeasurementExpression: string;
  numpadSize: "S" | "M" | "L";
  changeNumpadSize: (newSize: "S" | "M" | "L") => void;
  measureKeyboardMode: "numbers" | "letters";
  setMeasureKeyboardMode: React.Dispatch<React.SetStateAction<"numbers" | "letters">>;
  numpadScales: { S: number; M: number; L: number; };
  handleLineMeasurementNumpadPress: (key: string) => void;
  typeIntoPanelField: (update: (prev: string) => string) => void;
  measureKeyboardCaps: boolean;
  setMeasureKeyboardCaps: React.Dispatch<React.SetStateAction<boolean>>;
  t: TFunction<"translation", undefined>;
};

export function MeasurePanelKeyboard(props: MeasurePanelKeyboardProps) {
  const {
    panelKeyboardOpen, setMeasureKeyboardHeight, numpadTargetId, numpadTargetLabel,
    numpadTargetValue, lineMeasurementExpression, numpadSize, changeNumpadSize, measureKeyboardMode,
    setMeasureKeyboardMode, numpadScales, handleLineMeasurementNumpadPress, typeIntoPanelField,
    measureKeyboardCaps, setMeasureKeyboardCaps, t,
  } = props;
  return (
    <>
      {/* Tastatur fest unter dem scrollbaren Inhalt: Eingabefeld und Tastatur gleichzeitig sichtbar */}
      {panelKeyboardOpen && (
      <View
        style={{ paddingHorizontal: 10, paddingTop: 4, borderTopWidth: 1, borderTopColor: '#e0e0e0' }}
        onLayout={(e) => setMeasureKeyboardHeight(e.nativeEvent.layout.height)}
      >
        {/* Anzeige: in welches Feld die Tastatur gerade schreibt */}
        <Text testID="numpad-target-display" style={{ fontSize: 12, fontWeight: '700', color: '#1976d2', marginBottom: 4 }} numberOfLines={1}>
          {numpadTargetId ? `${numpadTargetLabel(numpadTargetId)}: ${numpadTargetValue(numpadTargetId) || '–'}` : `Maß: ${lineMeasurementExpression || '–'}`}
        </Text>
        {/* Umschalt-Leiste: S/M/L + Zahlen/ABC */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <View style={{ flexDirection: 'row', gap: 4 }}>
            {(['S', 'M', 'L'] as const).map(s => (
              <TouchableOpacity
                key={s}
                style={{
                  paddingHorizontal: 10, paddingVertical: 3, borderRadius: 5,
                  backgroundColor: numpadSize === s ? '#1976d2' : '#e8e8e8',
                }}
                onPress={() => changeNumpadSize(s)}
              >
                <Text style={{ fontSize: 11, fontWeight: '700', color: numpadSize === s ? '#fff' : '#666' }}>{s}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity
            style={{
              paddingHorizontal: 14, paddingVertical: 4, borderRadius: 6,
              backgroundColor: measureKeyboardMode === 'letters' ? '#1976d2' : '#e8e8e8',
              borderWidth: 1, borderColor: measureKeyboardMode === 'letters' ? '#1565c0' : '#ccc',
            }}
            onPress={() => setMeasureKeyboardMode(measureKeyboardMode === 'numbers' ? 'letters' : 'numbers')}
          >
            <Text style={{ fontSize: 12, fontWeight: '700', color: measureKeyboardMode === 'letters' ? '#fff' : '#555' }}>
              {measureKeyboardMode === 'numbers' ? 'ABC' : '123'}
            </Text>
          </TouchableOpacity>
        </View>
        
        {(() => {
          const sc = numpadScales[numpadSize];
          const kH = Math.round(36 * sc);
          const fS = Math.round(14 * sc);
          
          if (measureKeyboardMode === 'numbers') {
            const kStyle = [styles.floatingKey, { height: kH }] as any;
            const tStyle = [styles.floatingKeyText, { fontSize: fS }];
            return (
              <>
                <View style={styles.floatingKeyRow}>
                  {['7','8','9'].map(k => (
                    <TouchableOpacity key={k} style={kStyle} onPress={() => handleLineMeasurementNumpadPress(k)}>
                      <Text style={tStyle}>{k}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <View style={styles.floatingKeyRow}>
                  {['4','5','6'].map(k => (
                    <TouchableOpacity key={k} style={kStyle} onPress={() => handleLineMeasurementNumpadPress(k)}>
                      <Text style={tStyle}>{k}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <View style={styles.floatingKeyRow}>
                  {['1','2','3'].map(k => (
                    <TouchableOpacity key={k} style={kStyle} onPress={() => handleLineMeasurementNumpadPress(k)}>
                      <Text style={tStyle}>{k}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <View style={styles.floatingKeyRow}>
                  {[',','0','-'].map(k => (
                    <TouchableOpacity key={k} style={kStyle} onPress={() => handleLineMeasurementNumpadPress(k)}>
                      <Text style={tStyle}>{k}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <View style={styles.floatingKeyRow}>
                  <TouchableOpacity style={[...kStyle, { backgroundColor: '#e3f2fd' }]} onPress={() => handleLineMeasurementNumpadPress('m')}>
                    <Text style={[tStyle, { color: '#1976d2', fontWeight: '700' }]}>m</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[...kStyle, { backgroundColor: '#e3f2fd' }]} onPress={() => handleLineMeasurementNumpadPress('cm')}>
                    <Text style={[tStyle, { color: '#1976d2', fontWeight: '700' }]}>cm</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[...kStyle, { backgroundColor: '#ffebee' }]} onPress={() => handleLineMeasurementNumpadPress('\u232b')}>
                    <Ionicons name="backspace-outline" size={Math.round(18 * sc)} color="#f44336" />
                  </TouchableOpacity>
                </View>
              </>
            );
          } else {
            const letterRows = [
              ['Q','W','E','R','T','Z','U','I','O','P'],
              ['A','S','D','F','G','H','J','K','L'],
              ['Y','X','C','V','B','N','M'],
            ];
            const letterKH = Math.round(34 * sc);
            const letterFS = Math.round(12 * sc);
            return (
              <>
                {letterRows.map((row, ri) => (
                  <View key={`lr-${ri}`} style={[styles.floatingKeyRow, { gap: 3 }]}>
                    {row.map(letter => (
                      <TouchableOpacity 
                        key={letter} 
                        style={[styles.floatingLetterKey, { height: letterKH, minWidth: Math.round(28 * sc) }]}
                        onPress={() => {
                          typeIntoPanelField(prev => prev + (measureKeyboardCaps ? letter : letter.toLowerCase()));
                          if (measureKeyboardCaps) setMeasureKeyboardCaps(false);
                        }}
                      >
                        <Text style={[styles.floatingKeyText, { fontSize: letterFS }]}>{measureKeyboardCaps ? letter : letter.toLowerCase()}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                ))}
                {/* Umlaute + Shift */}
                <View style={[styles.floatingKeyRow, { gap: 3 }]}>
                  {['ä','ö','ü','ß'].map(k => (
                    <TouchableOpacity key={k} style={[styles.floatingLetterKey, { height: letterKH }]} onPress={() => {
                      typeIntoPanelField(prev => prev + (measureKeyboardCaps ? k.toUpperCase() : k));
                      if (measureKeyboardCaps) setMeasureKeyboardCaps(false);
                    }}>
                      <Text style={[styles.floatingKeyText, { fontSize: letterFS }]}>{measureKeyboardCaps ? k.toUpperCase() : k}</Text>
                    </TouchableOpacity>
                  ))}
                  <TouchableOpacity style={[styles.floatingLetterKey, { height: letterKH, backgroundColor: measureKeyboardCaps ? '#1976d2' : '#f0f0f0' }]} onPress={() => setMeasureKeyboardCaps(!measureKeyboardCaps)}>
                    <Ionicons name="arrow-up" size={Math.round(16 * sc)} color={measureKeyboardCaps ? '#fff' : '#666'} />
                  </TouchableOpacity>
                </View>
                {/* . + Leer (breit) + / + - + Backspace */}
                <View style={[styles.floatingKeyRow, { gap: 3 }]}>
                  <TouchableOpacity style={[styles.floatingLetterKey, { height: letterKH, minWidth: Math.round(24 * sc) }]} onPress={() => typeIntoPanelField(prev => prev + '.')}>
                    <Text style={[styles.floatingKeyText, { fontSize: letterFS }]}>.</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.floatingLetterKey, { height: letterKH, flex: 3, backgroundColor: '#e3f2fd' }]} onPress={() => typeIntoPanelField(prev => prev + ' ')}>
                    <Text style={[styles.floatingKeyText, { fontSize: letterFS, color: '#1976d2' }]}>{t('sketches.space')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.floatingLetterKey, { height: letterKH, minWidth: Math.round(24 * sc) }]} onPress={() => typeIntoPanelField(prev => prev + '/')}>
                    <Text style={[styles.floatingKeyText, { fontSize: letterFS }]}>/</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.floatingLetterKey, { height: letterKH, minWidth: Math.round(24 * sc) }]} onPress={() => typeIntoPanelField(prev => prev + '-')}>
                    <Text style={[styles.floatingKeyText, { fontSize: letterFS }]}>-</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.floatingLetterKey, { height: letterKH, flex: 1, backgroundColor: '#ffebee' }]} onPress={() => handleLineMeasurementNumpadPress('\u232b')}>
                    <Ionicons name="backspace-outline" size={Math.round(16 * sc)} color="#f44336" />
                  </TouchableOpacity>
                </View>
              </>
            );
          }
        })()}
      </View>
      )}
    </>
  );
}

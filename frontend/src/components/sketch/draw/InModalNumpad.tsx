import type { PanResponderInstance } from 'react-native';
import type { TFunction } from 'i18next';
import type { EdgeInsets } from 'react-native-safe-area-context';
import React from 'react';
import { View, Text, TouchableOpacity, Animated, Pressable } from 'react-native';
import { styles } from '../../../styles/sketchDrawStyles';
import Ionicons from '@react-native-vector-icons/ionicons';


export type RenderInModalNumpadViewCtx = {
  showModalNumpad: boolean;
  numpadScales: { S: number; M: number; L: number; };
  numpadSize: "S" | "M" | "L";
  isPhoneDevice: boolean;
  screenWidth: number;
  modalNumpadMode: "numbers" | "letters";
  modalNumpadPosition: Animated.ValueXY;
  isArrowNumpadOnPhone: () => boolean;
  insets: EdgeInsets;
  modalNumpadPanResponder: PanResponderInstance;
  t: TFunction<"translation", undefined>;
  closeModalNumpad: () => void;
  showTextModal: boolean;
  showEditTextModal: boolean;
  showMemoModal: boolean;
  showEditMemoModal: boolean;
  showNotesModal: boolean;
  textNumpadAuto: boolean;
  changeTextNumpadAuto: (enabled: boolean) => void;
  changeNumpadSize: (newSize: "S" | "M" | "L") => void;
  setModalNumpadMode: React.Dispatch<React.SetStateAction<"numbers" | "letters">>;
  handleActiveNumpadPress: (key: string) => void;
  modalNumpadCaps: boolean;
  setModalNumpadCaps: React.Dispatch<React.SetStateAction<boolean>>;
};

export function renderInModalNumpadView(ctx: RenderInModalNumpadViewCtx) {
  const {
    showModalNumpad, numpadScales, numpadSize, isPhoneDevice, screenWidth, modalNumpadMode,
    modalNumpadPosition, isArrowNumpadOnPhone, insets, modalNumpadPanResponder, t, closeModalNumpad,
    showTextModal, showEditTextModal, showMemoModal, showEditMemoModal, showNotesModal,
    textNumpadAuto, changeTextNumpadAuto, changeNumpadSize, setModalNumpadMode,
    handleActiveNumpadPress, modalNumpadCaps, setModalNumpadCaps,
  } = ctx;
  if (!showModalNumpad) return null;
  
  const scale = numpadScales[numpadSize];
  const kH = Math.round(36 * scale);
  const fS = Math.round(14 * scale);
  // iPhone: größere Panels damit Tasten tippbar sind und der Titel passt
  // Im Buchstaben-Modus auf iPhone: fast volle Breite damit alle QWERTZ-Tasten passen (10 pro Reihe)
  const numericPanelWidth = isPhoneDevice 
    ? (numpadSize === 'L' ? Math.max(Math.round(screenWidth * 0.55), 200) : numpadSize === 'M' ? Math.max(Math.round(screenWidth * 0.45), 170) : Math.max(Math.round(screenWidth * 0.35), 140))
    : (numpadSize === 'L' ? Math.round(screenWidth * 0.33) : numpadSize === 'M' ? Math.round(screenWidth * 0.27) : Math.round(screenWidth * 0.22));
  const panelWidth = (isPhoneDevice && modalNumpadMode === 'letters') 
    ? Math.round(screenWidth * 0.92)
    : numericPanelWidth;
  
  return (
    <Animated.View 
      style={[
        styles.floatingMeasurePanel,
        { 
          transform: modalNumpadPosition.getTranslateTransform(),
          width: panelWidth,
          // iPhone, Bemaßungspfeil: Dialog oben, Numpad darunter (verdeckt das Maß-Feld nicht)
          top: isArrowNumpadOnPhone() ? insets.top + 375 : 80,
        }
      ]}
    >
      {/* Header: Drag-Handle + Close-Button getrennt für Apple Pencil Kompatibilität */}
      <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#f8f8f8', borderBottomWidth: 1, borderBottomColor: '#e0e0e0' }}>
        <View {...modalNumpadPanResponder.panHandlers} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: isPhoneDevice ? 6 : 12, paddingVertical: isPhoneDevice ? 4 : 8 }}>
          <View style={styles.floatingMeasureDragHandle} />
          <Text style={[styles.floatingMeasureTitle, isPhoneDevice && { fontSize: 11 }]} numberOfLines={1}>{t('sketches.keyboard')}</Text>
        </View>
        <Pressable
          onPress={closeModalNumpad}
          style={{ width: isPhoneDevice ? 32 : 44, height: isPhoneDevice ? 32 : 44, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f0f0f0', borderRadius: isPhoneDevice ? 16 : 22, marginRight: isPhoneDevice ? 4 : 6 }}
        >
          <Ionicons name="close" size={isPhoneDevice ? 18 : 22} color="#666" />
        </Pressable>
      </View>
      
      {/* Tastatur-Bereich */}
      <View style={{ paddingHorizontal: 8, paddingTop: 6, paddingBottom: 8 }}>
        {/* Text/Memo/Notizen: Numpad künftig direkt öffnen */}
        {(showTextModal || showEditTextModal || showMemoModal || showEditMemoModal || showNotesModal) && (
          <TouchableOpacity
            testID="text-numpad-auto-toggle"
            accessibilityRole="switch"
            accessibilityState={{ checked: textNumpadAuto }}
            style={{
              flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 36, marginBottom: 6, paddingHorizontal: 6,
              borderRadius: 8, borderWidth: 1,
              backgroundColor: textNumpadAuto ? '#e3f2fd' : '#f5f5f5', borderColor: textNumpadAuto ? '#90caf9' : '#ddd',
            }}
            onPress={() => changeTextNumpadAuto(!textNumpadAuto)}
          >
            <Text style={{ flex: 1, fontSize: 10, fontWeight: '600', color: textNumpadAuto ? '#1976d2' : '#666' }} numberOfLines={2}>Immer direkt öffnen</Text>
            <Text style={{ fontSize: 10, fontWeight: '700', color: textNumpadAuto ? '#1976d2' : '#999' }}>{textNumpadAuto ? 'AN' : 'AUS'}</Text>
          </TouchableOpacity>
        )}
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
              backgroundColor: modalNumpadMode === 'letters' ? '#1976d2' : '#e8e8e8',
              borderWidth: 1, borderColor: modalNumpadMode === 'letters' ? '#1565c0' : '#ccc',
            }}
            onPress={() => setModalNumpadMode(modalNumpadMode === 'numbers' ? 'letters' : 'numbers')}
          >
            <Text style={{ fontSize: 12, fontWeight: '700', color: modalNumpadMode === 'letters' ? '#fff' : '#555' }}>
              {modalNumpadMode === 'numbers' ? 'ABC' : '123'}
            </Text>
          </TouchableOpacity>
        </View>
        
        {modalNumpadMode === 'numbers' ? (
          <>
            <View style={styles.floatingKeyRow}>
              {['7','8','9'].map(k => (
                <TouchableOpacity key={k} style={[styles.floatingKey, { height: kH }]} onPress={() => handleActiveNumpadPress(k)}>
                  <Text style={[styles.floatingKeyText, { fontSize: fS }]}>{k}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.floatingKeyRow}>
              {['4','5','6'].map(k => (
                <TouchableOpacity key={k} style={[styles.floatingKey, { height: kH }]} onPress={() => handleActiveNumpadPress(k)}>
                  <Text style={[styles.floatingKeyText, { fontSize: fS }]}>{k}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.floatingKeyRow}>
              {['1','2','3'].map(k => (
                <TouchableOpacity key={k} style={[styles.floatingKey, { height: kH }]} onPress={() => handleActiveNumpadPress(k)}>
                  <Text style={[styles.floatingKeyText, { fontSize: fS }]}>{k}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.floatingKeyRow}>
              {[',','0','-'].map(k => (
                <TouchableOpacity key={k} style={[styles.floatingKey, { height: kH }]} onPress={() => handleActiveNumpadPress(k)}>
                  <Text style={[styles.floatingKeyText, { fontSize: fS }]}>{k}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.floatingKeyRow}>
              {['+','×','÷'].map(k => (
                <TouchableOpacity key={k} style={[styles.floatingKey, { height: kH, backgroundColor: '#e3f2fd' }]} onPress={() => handleActiveNumpadPress(k === '×' ? '*' : k === '÷' ? '/' : k)}>
                  <Text style={[styles.floatingKeyText, { fontSize: fS, color: '#1976d2', fontWeight: '700' }]}>{k}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.floatingKeyRow}>
              <TouchableOpacity style={[styles.floatingKey, { height: kH, backgroundColor: '#e3f2fd' }]} onPress={() => handleActiveNumpadPress('m')}>
                <Text style={[styles.floatingKeyText, { fontSize: fS, color: '#1976d2', fontWeight: '700' }]}>m</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.floatingKey, { height: kH, backgroundColor: '#e3f2fd' }]} onPress={() => handleActiveNumpadPress('cm')}>
                <Text style={[styles.floatingKeyText, { fontSize: fS, color: '#1976d2', fontWeight: '700' }]}>cm</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.floatingKey, { height: kH, backgroundColor: '#ffebee' }]} onPress={() => handleActiveNumpadPress('⌫')}>
                <Ionicons name="backspace-outline" size={Math.round(18 * scale)} color="#f44336" />
              </TouchableOpacity>
            </View>
          </>
        ) : (
          <>
            {/* Einheiten-Zeile */}
            <View style={[styles.floatingKeyRow, { gap: 3 }]}>
              {['m','m²','m³','lfm'].map(k => (
                <TouchableOpacity key={`u-${k}`} style={[styles.floatingLetterKey, { height: kH, backgroundColor: '#e3f2fd' }]} onPress={() => handleActiveNumpadPress(k)}>
                  <Text style={[styles.floatingKeyText, { fontSize: Math.round(11 * scale), color: '#1976d2', fontWeight: '700' }]}>{k}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={[styles.floatingKeyRow, { gap: 3 }]}>
              {['Stk','kg','l','Paar'].map(k => (
                <TouchableOpacity key={`u2-${k}`} style={[styles.floatingLetterKey, { height: kH, backgroundColor: '#e3f2fd' }]} onPress={() => handleActiveNumpadPress(k)}>
                  <Text style={[styles.floatingKeyText, { fontSize: Math.round(11 * scale), color: '#1976d2', fontWeight: '700' }]}>{k}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {/* QWERTZ Buchstaben */}
            {[
              ['Q','W','E','R','T','Z','U','I','O','P'],
              ['A','S','D','F','G','H','J','K','L'],
              ['Y','X','C','V','B','N','M'],
            ].map((row, ri) => (
              <View key={`lr-${ri}`} style={[styles.floatingKeyRow, { gap: 3 }]}>
                {row.map(letter => (
                  <TouchableOpacity 
                    key={letter}
                    style={[styles.floatingLetterKey, { height: Math.round(34 * scale), minWidth: Math.round(26 * scale) }]}
                    onPress={() => {
                      handleActiveNumpadPress(modalNumpadCaps ? letter : letter.toLowerCase());
                      if (modalNumpadCaps) setModalNumpadCaps(false);
                    }}
                  >
                    <Text style={[styles.floatingKeyText, { fontSize: Math.round(12 * scale) }]}>
                      {modalNumpadCaps ? letter : letter.toLowerCase()}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            ))}
            {/* Umlaute + Sonderzeichen */}
            <View style={[styles.floatingKeyRow, { gap: 3 }]}>
              {['ä','ö','ü','ß'].map(k => (
                <TouchableOpacity key={k} style={[styles.floatingLetterKey, { height: Math.round(34 * scale) }]} onPress={() => {
                  handleActiveNumpadPress(modalNumpadCaps ? k.toUpperCase() : k);
                  if (modalNumpadCaps) setModalNumpadCaps(false);
                }}>
                  <Text style={[styles.floatingKeyText, { fontSize: Math.round(12 * scale) }]}>{modalNumpadCaps ? k.toUpperCase() : k}</Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity style={[styles.floatingLetterKey, { height: Math.round(34 * scale), backgroundColor: modalNumpadCaps ? '#1976d2' : '#f0f0f0' }]} onPress={() => setModalNumpadCaps(!modalNumpadCaps)}>
                <Ionicons name="arrow-up" size={Math.round(16 * scale)} color={modalNumpadCaps ? '#fff' : '#666'} />
              </TouchableOpacity>
            </View>
            {/* Leer + Sonderzeichen + Backspace */}
            <View style={[styles.floatingKeyRow, { gap: 3 }]}>
              <TouchableOpacity style={[styles.floatingLetterKey, { height: Math.round(34 * scale), minWidth: Math.round(24 * scale) }]} onPress={() => handleActiveNumpadPress('.')}>
                <Text style={[styles.floatingKeyText, { fontSize: Math.round(12 * scale) }]}>.</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.floatingLetterKey, { height: Math.round(34 * scale), flex: 3, backgroundColor: '#e3f2fd' }]} onPress={() => handleActiveNumpadPress(' ')}>
                <Text style={[styles.floatingKeyText, { fontSize: Math.round(12 * scale), color: '#1976d2' }]}>{t('sketches.space')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.floatingLetterKey, { height: Math.round(34 * scale), minWidth: Math.round(24 * scale) }]} onPress={() => handleActiveNumpadPress('/')}>
                <Text style={[styles.floatingKeyText, { fontSize: Math.round(12 * scale) }]}>/</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.floatingLetterKey, { height: Math.round(34 * scale), flex: 1, backgroundColor: '#ffebee' }]} onPress={() => handleActiveNumpadPress('⌫')}>
                <Ionicons name="backspace-outline" size={Math.round(16 * scale)} color="#f44336" />
              </TouchableOpacity>
            </View>
          </>
        )}
      </View>
    </Animated.View>
  );
}

import type { TFunction } from 'i18next';
import React from 'react';
import { View, Text, TouchableOpacity, TextInput, Platform, ScrollView, Modal, KeyboardAvoidingView } from 'react-native';
import { styles } from '../../../styles/sketchDrawStyles';
import Ionicons from '@react-native-vector-icons/ionicons';
import { DrawElement, FontFamily, FONT_FAMILIES } from '../../../sketch/sketchShared';
import BufferedTextInput from '../../BufferedTextInput';


export type EditTextModalProps = {
  showEditTextModal: boolean;
  t: TFunction<"translation", undefined>;
  textInputRef: React.RefObject<TextInput | null>;
  textInput: string;
  setTextInput: React.Dispatch<React.SetStateAction<string>>;
  showModalNumpad: boolean;
  closeModalNumpad: () => void;
  openModalNumpad: (setter: React.Dispatch<React.SetStateAction<string>>, inputRef: React.RefObject<TextInput | null>) => void;
  editFontSize: number;
  setEditFontSize: React.Dispatch<React.SetStateAction<number>>;
  editFontWeight: "normal" | "bold";
  setEditFontWeight: React.Dispatch<React.SetStateAction<"normal" | "bold">>;
  editFontStyle: "normal" | "italic";
  setEditFontStyle: React.Dispatch<React.SetStateAction<"normal" | "italic">>;
  editFontFamily: FontFamily;
  setEditFontFamily: React.Dispatch<React.SetStateAction<FontFamily>>;
  colors: string[];
  drawColor: string;
  setDrawColor: React.Dispatch<React.SetStateAction<string>>;
  setShowEditTextModal: React.Dispatch<React.SetStateAction<boolean>>;
  selectedElementId: string | null;
  elements: DrawElement[];
  addToHistory: (newElements: DrawElement[]) => void;
  renderInModalNumpad: () => React.JSX.Element | null;
};

export function EditTextModal(props: EditTextModalProps) {
  const {
    showEditTextModal, t, textInputRef, textInput, setTextInput, showModalNumpad, closeModalNumpad,
    openModalNumpad, editFontSize, setEditFontSize, editFontWeight, setEditFontWeight, editFontStyle,
    setEditFontStyle, editFontFamily, setEditFontFamily, colors, drawColor, setDrawColor,
    setShowEditTextModal, selectedElementId, elements, addToHistory, renderInModalNumpad,
  } = props;
  return (
    <>
      {/* Edit Text Modal */}
      <Modal visible={showEditTextModal} transparent animationType="slide">
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <ScrollView contentContainerStyle={styles.modalScrollContent} keyboardShouldPersistTaps="handled">
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>{t('sketches.editText')}</Text>
              <BufferedTextInput
                ref={textInputRef}
                style={styles.modalInput}
                value={textInput}
                onChangeText={setTextInput}
                placeholder="Text eingeben"
                multiline
                showSoftInputOnFocus={!showModalNumpad}
              />
              
              {/* Numpad Toggle */}
              <TouchableOpacity 
                style={[styles.numpadToggleBtn, showModalNumpad && styles.numpadToggleBtnActive]}
                onPress={() => {
                  if (showModalNumpad) {
                    closeModalNumpad();
                  } else {
                    openModalNumpad(setTextInput, textInputRef);
                  }
                }}
              >
                <Ionicons name="calculator" size={18} color={showModalNumpad ? '#fff' : '#2196f3'} />
                <Text style={[styles.numpadToggleBtnText, showModalNumpad && styles.numpadToggleBtnTextActive]}>
                  {showModalNumpad ? 'Numpad ausblenden' : 'Numpad einblenden'}
                </Text>
                <View style={styles.bluetoothBadgeSmall}>
                  <Ionicons name="bluetooth" size={12} color="#4caf50" />
                </View>
              </TouchableOpacity>
              
              {/* Font Size Slider */}
              <View style={styles.sliderContainer}>
                <Text style={styles.modalLabel}>{t('sketches.fontSize')}: {editFontSize}px</Text>
                <View style={styles.sliderRow}>
                  <TouchableOpacity 
                    style={styles.sliderButton} 
                    onPress={() => setEditFontSize(Math.max(10, editFontSize - 2))}
                  >
                    <Text style={styles.sliderButtonText}>-</Text>
                  </TouchableOpacity>
                  <View style={styles.sliderTrack}>
                    <View style={[styles.sliderFill, { width: `${((editFontSize - 10) / 50) * 100}%` }]} />
                  </View>
                  <TouchableOpacity 
                    style={styles.sliderButton} 
                    onPress={() => setEditFontSize(Math.min(60, editFontSize + 2))}
                  >
                    <Text style={styles.sliderButtonText}>+</Text>
                  </TouchableOpacity>
                </View>
              </View>
              
              {/* Font Style Buttons */}
              <View style={styles.fontStyleContainer}>
                <Text style={styles.modalLabel}>{t('sketches.fontStyle')}</Text>
                <View style={styles.fontStyleButtons}>
                  <TouchableOpacity
                    style={[styles.fontStyleButton, editFontWeight === 'bold' && styles.fontStyleButtonActive]}
                    onPress={() => setEditFontWeight(editFontWeight === 'bold' ? 'normal' : 'bold')}
                  >
                    <Text style={[styles.fontStyleButtonText, { fontWeight: 'bold' }]}>F</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.fontStyleButton, editFontStyle === 'italic' && styles.fontStyleButtonActive]}
                    onPress={() => setEditFontStyle(editFontStyle === 'italic' ? 'normal' : 'italic')}
                  >
                    <Text style={[styles.fontStyleButtonText, { fontStyle: 'italic' }]}>K</Text>
                  </TouchableOpacity>
                </View>
              </View>
              
              {/* Font Family Selection */}
              <View style={styles.fontFamilyContainer}>
                <Text style={styles.modalLabel}>{t('sketches.fontFamily')}</Text>
                <View style={styles.fontFamilyButtons}>
                  {FONT_FAMILIES.map(font => (
                    <TouchableOpacity
                      key={font.id}
                      style={[
                        styles.fontFamilyButton,
                        editFontFamily === font.id && styles.fontFamilyButtonActive
                      ]}
                      onPress={() => setEditFontFamily(font.id)}
                    >
                      <Text style={[
                        styles.fontFamilyButtonText,
                        { fontFamily: font.style },
                        editFontFamily === font.id && styles.fontFamilyButtonTextActive
                      ]}>
                        {font.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
              
              <View style={styles.colorPickerContainer}>
                <Text style={styles.modalLabel}>{t('sketches.colorLabel')}</Text>
                <View style={styles.colorGrid}>
                  {colors.map(color => (
                    <TouchableOpacity
                      key={color}
                      style={[
                        styles.colorOption,
                        { backgroundColor: color },
                        drawColor === color && styles.colorOptionSelected,
                      ]}
                      onPress={() => setDrawColor(color)}
                    />
                  ))}
                </View>
              </View>
              
              <View style={styles.modalButtons}>
                <TouchableOpacity
                  style={[styles.modalButton, styles.cancelButton]}
                  onPress={() => {
                    setShowEditTextModal(false);
                    setTextInput('');
                  }}
                >
                  <Text style={styles.cancelButtonText}>{t('common.cancel')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalButton, styles.confirmButton]}
                  onPress={() => {
                    if (selectedElementId && textInput.trim()) {
                      const newElements = elements.map(el => {
                        if (el.id === selectedElementId && el.type === 'text') {
                          return {
                            ...el,
                            data: { ...el.data, text: textInput },
                            color: drawColor,
                            fontSize: editFontSize,
                            fontWeight: editFontWeight,
                            fontStyle: editFontStyle,
                            fontFamily: FONT_FAMILIES.find(f => f.id === editFontFamily)?.svgFont || 'sans-serif',
                          };
                        }
                        return el;
                      });
                      addToHistory(newElements);
                      setShowEditTextModal(false);
                      setTextInput('');
                    }
                  }}
                >
                  <Text style={styles.confirmButtonText}>{t('sketches.update')}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
          {/* Numpad als floating Element INNERHALB des Modals */}
          {renderInModalNumpad()}
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

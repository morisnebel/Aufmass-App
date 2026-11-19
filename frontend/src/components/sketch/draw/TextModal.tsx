import type { TFunction } from 'i18next';
import React from 'react';
import { View, Text, TouchableOpacity, TextInput, Platform, ScrollView, Modal, KeyboardAvoidingView } from 'react-native';
import { styles } from '../../../styles/sketchDrawStyles';
import Ionicons from '@react-native-vector-icons/ionicons';
import { FontFamily, FONT_FAMILIES } from '../../../sketch/sketchShared';
import BufferedTextInput from '../../BufferedTextInput';


export type TextModalProps = {
  showTextModal: boolean;
  textInputRef: React.RefObject<TextInput | null>;
  textInput: string;
  setTextInput: React.Dispatch<React.SetStateAction<string>>;
  showModalNumpad: boolean;
  closeModalNumpad: () => void;
  openModalNumpad: (setter: React.Dispatch<React.SetStateAction<string>>, inputRef: React.RefObject<TextInput | null>) => void;
  t: TFunction<"translation", undefined>;
  lastTextFontSize: number;
  updateLastTextFontSize: (value: number) => void;
  lastTextFontFamily: FontFamily;
  updateLastTextFontFamily: (value: FontFamily) => void;
  colors: string[];
  lastTextColor: string;
  updateLastTextColor: (value: string) => void;
  setShowTextModal: React.Dispatch<React.SetStateAction<boolean>>;
  setPendingPosition: React.Dispatch<React.SetStateAction<{ x: number; y: number; } | null>>;
  addTextElement: () => void;
  renderInModalNumpad: () => React.JSX.Element | null;
};

export function TextModal(props: TextModalProps) {
  const {
    showTextModal, textInputRef, textInput, setTextInput, showModalNumpad, closeModalNumpad,
    openModalNumpad, t, lastTextFontSize, updateLastTextFontSize, lastTextFontFamily,
    updateLastTextFontFamily, colors, lastTextColor, updateLastTextColor, setShowTextModal,
    setPendingPosition, addTextElement, renderInModalNumpad,
  } = props;
  return (
    <>
      {/* Text Input Modal */}
      <Modal visible={showTextModal} transparent animationType="slide">
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <ScrollView contentContainerStyle={styles.modalScrollContent} keyboardShouldPersistTaps="handled">
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Text eingeben</Text>
              <BufferedTextInput
                ref={textInputRef}
                style={styles.modalInput}
                value={textInput}
                onChangeText={setTextInput}
                placeholder="Text hier eingeben..."
                multiline
                autoFocus
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
                <Text style={styles.modalLabel}>{t('sketches.fontSize')}: {lastTextFontSize}px</Text>
                <View style={styles.sliderRow}>
                  <TouchableOpacity 
                    style={styles.sliderButton} 
                    onPress={() => updateLastTextFontSize(Math.max(10, lastTextFontSize - 2))}
                  >
                    <Text style={styles.sliderButtonText}>-</Text>
                  </TouchableOpacity>
                  <View style={styles.sliderTrack}>
                    <View style={[styles.sliderFill, { width: `${((lastTextFontSize - 10) / 50) * 100}%` }]} />
                  </View>
                  <TouchableOpacity 
                    style={styles.sliderButton} 
                    onPress={() => updateLastTextFontSize(Math.min(60, lastTextFontSize + 2))}
                  >
                    <Text style={styles.sliderButtonText}>+</Text>
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
                        lastTextFontFamily === font.id && styles.fontFamilyButtonActive
                      ]}
                      onPress={() => updateLastTextFontFamily(font.id)}
                    >
                      <Text style={[
                        styles.fontFamilyButtonText,
                        { fontFamily: font.style },
                        lastTextFontFamily === font.id && styles.fontFamilyButtonTextActive
                      ]}>
                        {font.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
              
              {/* Color Picker */}
              <View style={styles.colorPickerContainer}>
                <Text style={styles.modalLabel}>{t('sketches.colorLabel')}</Text>
                <View style={styles.colorGrid}>
                  {colors.map(color => (
                    <TouchableOpacity
                      key={color}
                      style={[
                        styles.colorOption,
                        { backgroundColor: color },
                        lastTextColor === color && styles.colorOptionSelected,
                      ]}
                      onPress={() => updateLastTextColor(color)}
                    />
                  ))}
                </View>
              </View>
              
              <View style={styles.modalButtons}>
                <TouchableOpacity
                  style={[styles.modalButton, styles.cancelButton]}
                  onPress={() => {
                    setShowTextModal(false);
                    setTextInput('');
                    setPendingPosition(null);
                    closeModalNumpad();
                  }}
                >
                  <Text style={styles.cancelButtonText}>{t('common.cancel')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalButton, styles.confirmButton]}
                  onPress={() => {
                    addTextElement();
                    closeModalNumpad();
                  }}
                >
                  <Text style={styles.confirmButtonText}>{t('common.add')}</Text>
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

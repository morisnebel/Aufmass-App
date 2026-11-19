import type { TFunction } from 'i18next';
import React from 'react';
import { View, Text, TouchableOpacity, TextInput, Platform, ScrollView, Modal, KeyboardAvoidingView } from 'react-native';
import { styles } from '../../../styles/sketchDrawStyles';
import Ionicons from '@react-native-vector-icons/ionicons';
import { SketchLabelSettings } from '../../../../services/SketchLabels';
import BufferedTextInput from '../../BufferedTextInput';


export type EditPointerModalProps = {
  showEditPointerModal: boolean;
  toolLabels: SketchLabelSettings;
  pointerInputRef: React.RefObject<TextInput | null>;
  pointerText: string;
  setPointerText: React.Dispatch<React.SetStateAction<string>>;
  showModalNumpad: boolean;
  closeModalNumpad: () => void;
  openModalNumpad: (setter: React.Dispatch<React.SetStateAction<string>>, inputRef: React.RefObject<TextInput | null>) => void;
  editPointerStrokeWidth: number;
  updateEditPointerStrokeWidth: (value: number) => void;
  t: TFunction<"translation", undefined>;
  editPointerFontSize: number;
  updateEditPointerFontSize: (value: number) => void;
  colors: string[];
  drawColor: string;
  setDrawColor: React.Dispatch<React.SetStateAction<string>>;
  setShowEditPointerModal: React.Dispatch<React.SetStateAction<boolean>>;
  updatePointerElement: () => void;
  renderInModalNumpad: () => React.JSX.Element | null;
};

export function EditPointerModal(props: EditPointerModalProps) {
  const {
    showEditPointerModal, toolLabels, pointerInputRef, pointerText, setPointerText, showModalNumpad,
    closeModalNumpad, openModalNumpad, editPointerStrokeWidth, updateEditPointerStrokeWidth, t,
    editPointerFontSize, updateEditPointerFontSize, colors, drawColor, setDrawColor,
    setShowEditPointerModal, updatePointerElement, renderInModalNumpad,
  } = props;
  return (
    <>
      {/* Edit Pointer Modal */}
      <Modal visible={showEditPointerModal} transparent animationType="slide">
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <ScrollView contentContainerStyle={styles.modalScrollContent} keyboardShouldPersistTaps="handled">
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>{toolLabels.pointerName}-Pfeil bearbeiten</Text>
              <BufferedTextInput
                ref={pointerInputRef}
                style={styles.modalInput}
                value={pointerText}
                onChangeText={setPointerText}
                placeholder="Notiz eingeben (optional)"
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
                    openModalNumpad(setPointerText, pointerInputRef);
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
              
              {/* Stroke Width Slider */}
              <View style={styles.sliderContainer}>
                <Text style={styles.modalLabel}>Linienstärke: {editPointerStrokeWidth}px</Text>
                <View style={styles.sliderRow}>
                  <TouchableOpacity 
                    style={styles.sliderButton} 
                    onPress={() => updateEditPointerStrokeWidth(Math.max(1, editPointerStrokeWidth - 1))}
                  >
                    <Text style={styles.sliderButtonText}>-</Text>
                  </TouchableOpacity>
                  <View style={styles.sliderTrack}>
                    <View style={[styles.sliderFill, { width: `${((editPointerStrokeWidth - 1) / 19) * 100}%` }]} />
                  </View>
                  <TouchableOpacity 
                    style={styles.sliderButton} 
                    onPress={() => updateEditPointerStrokeWidth(Math.min(20, editPointerStrokeWidth + 2))}
                  >
                    <Text style={styles.sliderButtonText}>+</Text>
                  </TouchableOpacity>
                </View>
              </View>
              
              {/* Font Size Slider */}
              <View style={styles.sliderContainer}>
              <Text style={styles.modalLabel}>{t('sketches.fontSize')}: {editPointerFontSize}px</Text>
                <View style={styles.sliderRow}>
                  <TouchableOpacity 
                    style={styles.sliderButton} 
                    onPress={() => updateEditPointerFontSize(Math.max(6, editPointerFontSize - 2))}
                  >
                    <Text style={styles.sliderButtonText}>-</Text>
                  </TouchableOpacity>
                  <View style={styles.sliderTrack}>
                    <View style={[styles.sliderFill, { width: `${((editPointerFontSize - 6) / 34) * 100}%` }]} />
                  </View>
                  <TouchableOpacity 
                    style={styles.sliderButton} 
                    onPress={() => updateEditPointerFontSize(Math.min(40, editPointerFontSize + 2))}
                  >
                    <Text style={styles.sliderButtonText}>+</Text>
                  </TouchableOpacity>
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
                    setShowEditPointerModal(false);
                    setPointerText('');
                  }}
                >
                  <Text style={styles.cancelButtonText}>{t('common.cancel')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalButton, styles.confirmButton]}
                  onPress={updatePointerElement}
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

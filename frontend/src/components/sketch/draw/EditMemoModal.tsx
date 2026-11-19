import type { TFunction } from 'i18next';
import React from 'react';
import { View, Text, TouchableOpacity, TextInput, Platform, Modal, KeyboardAvoidingView } from 'react-native';
import { styles } from '../../../styles/sketchDrawStyles';
import Ionicons from '@react-native-vector-icons/ionicons';
import { SketchLabelSettings } from '../../../../services/SketchLabels';
import BufferedTextInput from '../../BufferedTextInput';


export type EditMemoModalProps = {
  showEditMemoModal: boolean;
  toolLabels: SketchLabelSettings;
  showModalNumpad: boolean;
  closeModalNumpad: () => void;
  openModalNumpad: (setter: React.Dispatch<React.SetStateAction<string>>, inputRef: React.RefObject<TextInput | null>) => void;
  setMemoText: React.Dispatch<React.SetStateAction<string>>;
  memoInputRef: React.RefObject<TextInput | null>;
  memoText: string;
  renderInModalNumpad: () => React.JSX.Element | null;
  t: TFunction<"translation", undefined>;
  editMemoFontSize: number;
  updateEditMemoFontSize: (value: number) => void;
  drawColor: string;
  setDrawColor: React.Dispatch<React.SetStateAction<string>>;
  setShowEditMemoModal: React.Dispatch<React.SetStateAction<boolean>>;
  updateMemoElement: () => void;
};

export function EditMemoModal(props: EditMemoModalProps) {
  const {
    showEditMemoModal, toolLabels, showModalNumpad, closeModalNumpad, openModalNumpad, setMemoText,
    memoInputRef, memoText, renderInModalNumpad, t, editMemoFontSize, updateEditMemoFontSize,
    drawColor, setDrawColor, setShowEditMemoModal, updateMemoElement,
  } = props;
  return (
    <>
      {/* Edit Memo Modal - Bestehende Notiz bearbeiten */}
      <Modal visible={showEditMemoModal} transparent animationType="slide">
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.modalContent}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={styles.modalTitle}>{toolLabels.memoName} bearbeiten</Text>
              <TouchableOpacity
                style={{
                  backgroundColor: showModalNumpad ? '#1976d2' : '#f0f0f0',
                  paddingHorizontal: 10,
                  paddingVertical: 6,
                  borderRadius: 8,
                }}
                onPress={() => {
                  if (showModalNumpad) {
                    closeModalNumpad();
                  } else {
                    openModalNumpad(setMemoText, memoInputRef);
                  }
                }}
              >
                <Ionicons name="keypad" size={22} color={showModalNumpad ? '#fff' : '#666'} />
              </TouchableOpacity>
            </View>
            <BufferedTextInput
              ref={memoInputRef}
              style={styles.modalInput}
              value={memoText}
              onChangeText={setMemoText}
              placeholder="Notiz eingeben"
              multiline
              showSoftInputOnFocus={!showModalNumpad}
            />
            {renderInModalNumpad()}
            {/* Font Size Slider */}
            <View style={styles.sliderContainer}>
              <Text style={styles.modalLabel}>{t('sketches.fontSize')}: {editMemoFontSize}px</Text>
              <View style={styles.sliderRow}>
                <TouchableOpacity 
                  style={styles.sliderButton} 
                  onPress={() => updateEditMemoFontSize(Math.max(6, editMemoFontSize - 2))}
                >
                  <Text style={styles.sliderButtonText}>-</Text>
                </TouchableOpacity>
                <View style={styles.sliderTrack}>
                  <View style={[styles.sliderFill, { width: `${((editMemoFontSize - 6) / 34) * 100}%` }]} />
                </View>
                <TouchableOpacity 
                  style={styles.sliderButton} 
                  onPress={() => updateEditMemoFontSize(Math.min(40, editMemoFontSize + 2))}
                >
                  <Text style={styles.sliderButtonText}>+</Text>
                </TouchableOpacity>
              </View>
            </View>
            {/* Color Selection */}
            <View style={styles.colorSelectionContainer}>
              <Text style={styles.modalLabel}>{t('sketches.colorLabel')}</Text>
              <View style={styles.colorOptions}>
                {['#E74C3C', '#333333', '#2196f3', '#4caf50', '#FF9800', '#9C27B0'].map((color) => (
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
                  setShowEditMemoModal(false);
                  setMemoText('');
                }}
              >
                <Text style={styles.cancelButtonText}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.confirmButton]}
                onPress={updateMemoElement}
              >
                <Text style={styles.confirmButtonText}>{t('sketches.update')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

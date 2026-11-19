import type { TFunction } from 'i18next';
import React from 'react';
import { View, Text, TouchableOpacity, TextInput, Platform, Modal, KeyboardAvoidingView } from 'react-native';
import { styles } from '../../../styles/sketchDrawStyles';
import Ionicons from '@react-native-vector-icons/ionicons';
import { SketchLabelSettings } from '../../../../services/SketchLabels';
import BufferedTextInput from '../../BufferedTextInput';


export type PointerModalProps = {
  showPointerModal: boolean;
  toolLabels: SketchLabelSettings;
  pointerInputRef: React.RefObject<TextInput | null>;
  pointerText: string;
  setPointerText: React.Dispatch<React.SetStateAction<string>>;
  showModalNumpad: boolean;
  closeModalNumpad: () => void;
  openModalNumpad: (setter: React.Dispatch<React.SetStateAction<string>>, inputRef: React.RefObject<TextInput | null>) => void;
  setShowPointerModal: React.Dispatch<React.SetStateAction<boolean>>;
  setPendingPointer: React.Dispatch<React.SetStateAction<{ x1: number; y1: number; x2: number; y2: number; } | null>>;
  t: TFunction<"translation", undefined>;
  addPointerElement: () => void;
  renderInModalNumpad: () => React.JSX.Element | null;
};

export function PointerModal(props: PointerModalProps) {
  const {
    showPointerModal, toolLabels, pointerInputRef, pointerText, setPointerText, showModalNumpad,
    closeModalNumpad, openModalNumpad, setShowPointerModal, setPendingPointer, t, addPointerElement,
    renderInModalNumpad,
  } = props;
  return (
    <>
      {/* Pointer (Memo Arrow) Modal - New */}
      <Modal visible={showPointerModal} transparent animationType="slide">
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{toolLabels.pointerName}-Pfeil</Text>
            <Text style={styles.modalSubtitle}>Optional: Notiz hinzufügen</Text>
            <BufferedTextInput
              ref={pointerInputRef}
              style={styles.modalInput}
              value={pointerText}
              onChangeText={setPointerText}
              placeholder="Notiz eingeben (optional)"
              autoFocus
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
            
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => {
                  setShowPointerModal(false);
                  setPointerText('');
                  setPendingPointer(null);
                  closeModalNumpad();
                }}
              >
                <Text style={styles.cancelButtonText}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.confirmButton]}
                onPress={() => {
                  addPointerElement();
                  closeModalNumpad();
                }}
              >
                <Text style={styles.confirmButtonText}>{t('common.add')}</Text>
              </TouchableOpacity>
            </View>
          </View>
          {/* Numpad als floating Element INNERHALB des Modals */}
          {renderInModalNumpad()}
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

import type { TFunction } from 'i18next';
import React from 'react';
import { View, Text, TouchableOpacity, TextInput, Platform, Modal, KeyboardAvoidingView } from 'react-native';
import { styles } from '../../../styles/sketchDrawStyles';
import Ionicons from '@react-native-vector-icons/ionicons';
import { SketchLabelSettings } from '../../../../services/SketchLabels';
import BufferedTextInput from '../../BufferedTextInput';


export type MemoModalProps = {
  showMemoModal: boolean;
  toolLabels: SketchLabelSettings;
  showModalNumpad: boolean;
  closeModalNumpad: () => void;
  openModalNumpad: (setter: React.Dispatch<React.SetStateAction<string>>, inputRef: React.RefObject<TextInput | null>) => void;
  setMemoText: React.Dispatch<React.SetStateAction<string>>;
  memoInputRef: React.RefObject<TextInput | null>;
  memoText: string;
  renderInModalNumpad: () => React.JSX.Element | null;
  setShowMemoModal: React.Dispatch<React.SetStateAction<boolean>>;
  setPendingMemo: React.Dispatch<React.SetStateAction<{ x1: number; y1: number; x2: number; y2: number; } | null>>;
  t: TFunction<"translation", undefined>;
  addMemoElement: () => void;
};

export function MemoModal(props: MemoModalProps) {
  const {
    showMemoModal, toolLabels, showModalNumpad, closeModalNumpad, openModalNumpad, setMemoText,
    memoInputRef, memoText, renderInModalNumpad, setShowMemoModal, setPendingMemo, t, addMemoElement,
  } = props;
  return (
    <>
      {/* Memo/Notiz Modal - Neue Notiz erstellen */}
      <Modal visible={showMemoModal} transparent animationType="slide">
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.modalContent}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View>
                <Text style={styles.modalTitle}>{toolLabels.memoName} hinzufügen</Text>
                <Text style={styles.modalSubtitle}>Text für die Notiz eingeben</Text>
              </View>
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
              autoFocus
              selectTextOnFocus
              showSoftInputOnFocus={!showModalNumpad}
            />
            {renderInModalNumpad()}
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => {
                  setShowMemoModal(false);
                  setMemoText('');
                  setPendingMemo(null);
                }}
              >
                <Text style={styles.cancelButtonText}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.confirmButton]}
                onPress={addMemoElement}
              >
                <Text style={styles.confirmButtonText}>{t('common.add')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

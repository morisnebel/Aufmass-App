import type { TFunction } from 'i18next';
import React from 'react';
import { View, Text, TouchableOpacity, TextInput, Platform, Modal, KeyboardAvoidingView } from 'react-native';
import { styles } from '../../../styles/sketchDrawStyles';
import Ionicons from '@react-native-vector-icons/ionicons';
import BufferedTextInput from '../../BufferedTextInput';


export type NotesModalProps = {
  showNotesModal: boolean;
  t: TFunction<"translation", undefined>;
  notesInputRef: React.RefObject<TextInput | null>;
  notes: string;
  setNotes: React.Dispatch<React.SetStateAction<string>>;
  showModalNumpad: boolean;
  activeNumpadRef: React.RefObject<TextInput | null> | null;
  closeModalNumpad: () => void;
  openModalNumpad: (setter: React.Dispatch<React.SetStateAction<string>>, inputRef: React.RefObject<TextInput | null>) => void;
  setShowNotesModal: React.Dispatch<React.SetStateAction<boolean>>;
  renderInModalNumpad: () => React.JSX.Element | null;
};

export function NotesModal(props: NotesModalProps) {
  const {
    showNotesModal, t, notesInputRef, notes, setNotes, showModalNumpad, activeNumpadRef,
    closeModalNumpad, openModalNumpad, setShowNotesModal, renderInModalNumpad,
  } = props;
  return (
    <>
      {/* Notes Modal */}
      <Modal visible={showNotesModal} transparent animationType="slide">
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{t('sketches.sketchNotes')}</Text>
            <Text style={styles.modalSubtitle}>{t('sketches.sketchNotesSubtitle')}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
              <BufferedTextInput
                ref={notesInputRef}
                style={[styles.modalInput, styles.notesInput, { flex: 1 }]}
                value={notes}
                onChangeText={setNotes}
                placeholder={t('sketches.notes')}
                placeholderTextColor="#999"
                multiline
                autoFocus
                textAlignVertical="top"
                showSoftInputOnFocus={!showModalNumpad}
              />
              <TouchableOpacity
                style={{
                  marginLeft: 8,
                  padding: 10,
                  backgroundColor: showModalNumpad && activeNumpadRef === notesInputRef ? '#1976d2' : '#f0f0f0',
                  borderRadius: 8,
                }}
                onPress={() => {
                  if (showModalNumpad && activeNumpadRef === notesInputRef) {
                    closeModalNumpad();
                  } else {
                    openModalNumpad(setNotes, notesInputRef);
                  }
                }}
              >
                <Ionicons
                  name="keypad"
                  size={24}
                  color={showModalNumpad && activeNumpadRef === notesInputRef ? '#fff' : '#666'}
                />
              </TouchableOpacity>
            </View>
            <View style={styles.notesModalButtons}>
              <TouchableOpacity
                style={styles.notesModalButton}
                onPress={() => {
                  closeModalNumpad();
                  setShowNotesModal(false);
                }}
              >
                <Text style={styles.notesModalButtonText}>{t('common.close')}</Text>
              </TouchableOpacity>
              {notes.trim().length > 0 && (
                <TouchableOpacity
                  style={[styles.notesModalButton, styles.notesModalButtonDelete]}
                  onPress={() => {
                    setNotes('');
                    closeModalNumpad();
                    setShowNotesModal(false);
                  }}
                >
                  <Text style={styles.notesModalButtonTextWhite}>{t('common.delete')}</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[styles.notesModalButton, styles.notesModalButtonSave]}
                onPress={() => {
                  closeModalNumpad();
                  setShowNotesModal(false);
                }}
              >
                <Text style={styles.notesModalButtonTextWhite}>{t('common.save')}</Text>
              </TouchableOpacity>
            </View>
            {/* In-Modal Numpad für Notizen */}
            {renderInModalNumpad()}
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

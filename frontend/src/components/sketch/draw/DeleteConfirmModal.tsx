import type { TFunction } from 'i18next';
import React from 'react';
import { View, Text, TouchableOpacity, Modal } from 'react-native';
import { styles } from '../../../styles/sketchDrawStyles';


export type DeleteConfirmModalProps = {
  showDeleteConfirm: boolean;
  setShowDeleteConfirm: React.Dispatch<React.SetStateAction<boolean>>;
  t: TFunction<"translation", undefined>;
  deleteSelectedElement: () => void;
};

export function DeleteConfirmModal(props: DeleteConfirmModalProps) {
  const {
    showDeleteConfirm, setShowDeleteConfirm, t, deleteSelectedElement,
  } = props;
  return (
    <>
      {/* Delete Confirmation Modal */}
      <Modal visible={showDeleteConfirm} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Element löschen</Text>
            <Text style={styles.modalMessage}>Möchten Sie das ausgewählte Element wirklich löschen?</Text>
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => setShowDeleteConfirm(false)}
              >
                <Text style={styles.cancelButtonText}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.deleteButton]}
                onPress={deleteSelectedElement}
              >
                <Text style={styles.deleteButtonText}>{t('common.delete')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

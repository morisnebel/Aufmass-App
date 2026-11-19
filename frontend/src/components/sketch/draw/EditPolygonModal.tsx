import type { TFunction } from 'i18next';
import React from 'react';
import { View, Text, TouchableOpacity, Platform, Modal, KeyboardAvoidingView } from 'react-native';
import { styles } from '../../../styles/sketchDrawStyles';


export type EditPolygonModalProps = {
  showEditPolygonModal: boolean;
  t: TFunction<"translation", undefined>;
  editPolygonStrokeWidth: number;
  setEditPolygonStrokeWidth: React.Dispatch<React.SetStateAction<number>>;
  editPolygonColor: string;
  setEditPolygonColor: React.Dispatch<React.SetStateAction<string>>;
  setShowEditPolygonModal: React.Dispatch<React.SetStateAction<boolean>>;
  updatePolygonElement: () => void;
};

export function EditPolygonModal(props: EditPolygonModalProps) {
  const {
    showEditPolygonModal, t, editPolygonStrokeWidth, setEditPolygonStrokeWidth, editPolygonColor,
    setEditPolygonColor, setShowEditPolygonModal, updatePolygonElement,
  } = props;
  return (
    <>
      {/* Edit Polygon Modal - Polygon/Polyline Eigenschaften bearbeiten */}
      <Modal visible={showEditPolygonModal} transparent animationType="slide">
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{t('sketches.editShape')}</Text>
            
            {/* Stroke Width Slider */}
            <View style={styles.sliderContainer}>
              <Text style={styles.modalLabel}>{t('sketches.strokeWidthLabel')}: {editPolygonStrokeWidth}px</Text>
              <View style={styles.sliderRow}>
                <TouchableOpacity 
                  style={styles.sliderButton} 
                  onPress={() => setEditPolygonStrokeWidth(Math.max(1, editPolygonStrokeWidth - 1))}
                >
                  <Text style={styles.sliderButtonText}>-</Text>
                </TouchableOpacity>
                <View style={styles.sliderTrack}>
                  <View style={[styles.sliderFill, { width: `${((editPolygonStrokeWidth - 1) / 19) * 100}%` }]} />
                </View>
                <TouchableOpacity 
                  style={styles.sliderButton} 
                  onPress={() => setEditPolygonStrokeWidth(Math.min(20, editPolygonStrokeWidth + 1))}
                >
                  <Text style={styles.sliderButtonText}>+</Text>
                </TouchableOpacity>
              </View>
            </View>
            
            {/* Color Selection */}
            <View style={styles.colorSelectionContainer}>
              <Text style={styles.modalLabel}>{t('sketches.colorLabel')}</Text>
              <View style={styles.colorOptions}>
                {['#E74C3C', '#333333', '#2196f3', '#4caf50', '#FF9800', '#9C27B0', '#795548', '#607D8B'].map((color) => (
                  <TouchableOpacity
                    key={color}
                    style={[
                      styles.colorOption,
                      { backgroundColor: color },
                      editPolygonColor === color && styles.colorOptionSelected,
                    ]}
                    onPress={() => setEditPolygonColor(color)}
                  />
                ))}
              </View>
            </View>
            
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => setShowEditPolygonModal(false)}
              >
                <Text style={styles.cancelButtonText}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.confirmButton]}
                onPress={updatePolygonElement}
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

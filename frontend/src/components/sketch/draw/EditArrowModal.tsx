import type { TFunction } from 'i18next';
import type { EdgeInsets } from 'react-native-safe-area-context';
import React from 'react';
import { View, Text, TouchableOpacity, TextInput, Platform, ScrollView, Modal, KeyboardAvoidingView } from 'react-native';
import { styles } from '../../../styles/sketchDrawStyles';
import Ionicons from '@react-native-vector-icons/ionicons';
import { DrawElement } from '../../../sketch/sketchShared';
import BufferedTextInput from '../../BufferedTextInput';


export type EditArrowModalProps = {
  showEditArrowModal: boolean;
  isArrowNumpadOnPhone: () => boolean;
  insets: EdgeInsets;
  arrowInputRef: React.RefObject<TextInput | null>;
  arrowText: string;
  setArrowText: React.Dispatch<React.SetStateAction<string>>;
  showModalNumpad: boolean;
  closeModalNumpad: () => void;
  openModalNumpad: (setter: React.Dispatch<React.SetStateAction<string>>, inputRef: React.RefObject<TextInput | null>) => void;
  arrowOptionsOpen: boolean;
  changeArrowOptionsOpen: (open: boolean) => void;
  arrowHeads: "single" | "double";
  setArrowHeads: React.Dispatch<React.SetStateAction<"single" | "double">>;
  editArrowStrokeWidth: number;
  updateEditArrowStrokeWidth: (value: number) => void;
  t: TFunction<"translation", undefined>;
  editArrowFontSize: number;
  updateEditArrowFontSize: (value: number) => void;
  colors: string[];
  drawColor: string;
  setDrawColor: React.Dispatch<React.SetStateAction<string>>;
  setShowEditArrowModal: React.Dispatch<React.SetStateAction<boolean>>;
  selectedElementId: string | null;
  elements: DrawElement[];
  addToHistory: (newElements: DrawElement[]) => void;
  renderInModalNumpad: () => React.JSX.Element | null;
};

export function EditArrowModal(props: EditArrowModalProps) {
  const {
    showEditArrowModal, isArrowNumpadOnPhone, insets, arrowInputRef, arrowText, setArrowText,
    showModalNumpad, closeModalNumpad, openModalNumpad, arrowOptionsOpen, changeArrowOptionsOpen,
    arrowHeads, setArrowHeads, editArrowStrokeWidth, updateEditArrowStrokeWidth, t,
    editArrowFontSize, updateEditArrowFontSize, colors, drawColor, setDrawColor,
    setShowEditArrowModal, selectedElementId, elements, addToHistory, renderInModalNumpad,
  } = props;
  return (
    <>
      {/* Edit Arrow Modal */}
      <Modal visible={showEditArrowModal} transparent animationType="slide">
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <ScrollView contentContainerStyle={[styles.modalScrollContent, isArrowNumpadOnPhone() && { justifyContent: 'flex-start', paddingTop: insets.top + 40 }]} keyboardShouldPersistTaps="handled">
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Pfeil bearbeiten</Text>
              <BufferedTextInput replaceOnBurst
                ref={arrowInputRef}
                style={styles.modalInput}
                value={arrowText}
                onChangeText={setArrowText}
                placeholder="Maß eingeben (z.B. 5,5m)"
                keyboardType={Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'default'}
                showSoftInputOnFocus={!showModalNumpad}
              />
              
              {/* Numpad Toggle */}
              <TouchableOpacity 
                style={[styles.numpadToggleBtn, showModalNumpad && styles.numpadToggleBtnActive]}
                onPress={() => {
                  if (showModalNumpad) {
                    closeModalNumpad();
                  } else {
                    openModalNumpad(setArrowText, arrowInputRef);
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
              
              {/* Weitere Einstellungen einklappbar: Dialog bleibt klein */}
              <TouchableOpacity
                testID="edit-arrow-options-toggle"
                accessibilityState={{ expanded: arrowOptionsOpen }}
                style={{
                  flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 44,
                  marginBottom: 12, borderRadius: 8, borderWidth: 1,
                  backgroundColor: arrowOptionsOpen ? '#e3f2fd' : '#f5f5f5', borderColor: arrowOptionsOpen ? '#90caf9' : '#ddd',
                }}
                onPress={() => changeArrowOptionsOpen(!arrowOptionsOpen)}
              >
                <Ionicons name="options" size={16} color={arrowOptionsOpen ? '#1976d2' : '#666'} />
                <Text style={{ fontSize: 13, fontWeight: '600', color: arrowOptionsOpen ? '#1976d2' : '#666' }}>Mehr Einstellungen</Text>
                <Ionicons name={arrowOptionsOpen ? 'chevron-up' : 'chevron-down'} size={16} color={arrowOptionsOpen ? '#1976d2' : '#666'} />
              </TouchableOpacity>
              {arrowOptionsOpen && (
              <>
              <View style={styles.arrowHeadsContainer}>
                <Text style={styles.modalLabel}>Pfeilspitzen:</Text>
                <View style={styles.arrowHeadsButtons}>
                  <TouchableOpacity
                    style={[styles.arrowHeadButton, arrowHeads === 'single' && styles.arrowHeadButtonActive]}
                    onPress={() => setArrowHeads('single')}
                  >
                    <Text style={styles.arrowHeadButtonText}>Einfach →</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.arrowHeadButton, arrowHeads === 'double' && styles.arrowHeadButtonActive]}
                    onPress={() => setArrowHeads('double')}
                  >
                    <Text style={styles.arrowHeadButtonText}>Doppelt ↔</Text>
                  </TouchableOpacity>
                </View>
              </View>
              
              {/* Stroke Width Slider */}
              <View style={styles.sliderContainer}>
                <Text style={styles.modalLabel}>Linienstärke: {editArrowStrokeWidth}px</Text>
                <View style={styles.sliderRow}>
                  <TouchableOpacity 
                    style={styles.sliderButton} 
                    onPress={() => updateEditArrowStrokeWidth(Math.max(1, editArrowStrokeWidth - 1))}
                  >
                    <Text style={styles.sliderButtonText}>-</Text>
                  </TouchableOpacity>
                  <View style={styles.sliderTrack}>
                    <View style={[styles.sliderFill, { width: `${(editArrowStrokeWidth / 10) * 100}%` }]} />
                  </View>
                  <TouchableOpacity 
                    style={styles.sliderButton} 
                    onPress={() => updateEditArrowStrokeWidth(Math.min(10, editArrowStrokeWidth + 1))}
                  >
                    <Text style={styles.sliderButtonText}>+</Text>
                  </TouchableOpacity>
                </View>
              </View>
              
              {/* Font Size Slider */}
              <View style={styles.sliderContainer}>
                <Text style={styles.modalLabel}>{t('sketches.fontSize')}: {editArrowFontSize}px</Text>
                <View style={styles.sliderRow}>
                  <TouchableOpacity 
                    style={styles.sliderButton} 
                    onPress={() => updateEditArrowFontSize(Math.max(8, editArrowFontSize - 2))}
                  >
                    <Text style={styles.sliderButtonText}>-</Text>
                  </TouchableOpacity>
                  <View style={styles.sliderTrack}>
                    <View style={[styles.sliderFill, { width: `${((editArrowFontSize - 8) / 32) * 100}%` }]} />
                  </View>
                  <TouchableOpacity 
                    style={styles.sliderButton} 
                    onPress={() => updateEditArrowFontSize(Math.min(40, editArrowFontSize + 2))}
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
              </>
              )}
              
              <View style={styles.modalButtons}>
                <TouchableOpacity
                  style={[styles.modalButton, styles.cancelButton]}
                  onPress={() => {
                    setShowEditArrowModal(false);
                    setArrowText('');
                  }}
                >
                  <Text style={styles.cancelButtonText}>{t('common.cancel')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalButton, styles.confirmButton]}
                  onPress={() => {
                    if (selectedElementId) {
                      const newElements = elements.map(el => {
                        if (el.id === selectedElementId && el.type === 'arrow') {
                          return {
                            ...el,
                            data: {
                              ...el.data,
                              text: arrowText,
                              heads: arrowHeads,
                              fontSize: editArrowFontSize,
                            },
                            color: drawColor,
                            strokeWidth: editArrowStrokeWidth,
                          };
                        }
                        return el;
                      });
                      addToHistory(newElements);
                      setShowEditArrowModal(false);
                      setArrowText('');
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

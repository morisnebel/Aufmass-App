import type { TFunction } from 'i18next';
import type { EdgeInsets } from 'react-native-safe-area-context';
import React from 'react';
import { View, Text, TouchableOpacity, TextInput, Platform, ScrollView, Modal, KeyboardAvoidingView, Switch } from 'react-native';
import { styles } from '../../../styles/sketchDrawStyles';
import Ionicons from '@react-native-vector-icons/ionicons';
import { LaserLog } from '../LaserLog';
import BufferedTextInput from '../../BufferedTextInput';
import { playLaserFeedback } from '../../../utils/laserFeedback';
import { LaserSoundOptions } from '../LaserSoundOptions';


export type ArrowModalProps = {
  showArrowModal: boolean;
  isArrowNumpadOnPhone: () => boolean;
  insets: EdgeInsets;
  arrowInputRef: React.RefObject<TextInput | null>;
  arrowText: string;
  setArrowText: React.Dispatch<React.SetStateAction<string>>;
  showModalNumpad: boolean;
  laserSound: boolean;
  arrowAutoAdd: boolean;
  addArrowElement: (text?: string) => void;
  closeModalNumpad: () => void;
  openModalNumpad: (setter: React.Dispatch<React.SetStateAction<string>>, inputRef: React.RefObject<TextInput | null>) => void;
  arrowOptionsOpen: boolean;
  changeArrowOptionsOpen: (open: boolean) => void;
  changeArrowAutoAdd: (enabled: boolean) => void;
  changeLaserSound: (enabled: boolean) => void;
  arrowHeads: "single" | "double";
  setArrowHeads: React.Dispatch<React.SetStateAction<"single" | "double">>;
  editArrowStrokeWidth: number;
  updateEditArrowStrokeWidth: (value: number) => void;
  t: TFunction<"translation", undefined>;
  editArrowFontSize: number;
  updateEditArrowFontSize: (value: number) => void;
  setShowArrowModal: React.Dispatch<React.SetStateAction<boolean>>;
  setPendingArrow: React.Dispatch<React.SetStateAction<{ x1: number; y1: number; x2: number; y2: number; } | null>>;
  renderInModalNumpad: () => React.JSX.Element | null;
};

export function ArrowModal(props: ArrowModalProps) {
  const {
    showArrowModal, isArrowNumpadOnPhone, insets, arrowInputRef, arrowText, setArrowText,
    showModalNumpad, laserSound, arrowAutoAdd, addArrowElement, closeModalNumpad, openModalNumpad,
    arrowOptionsOpen, changeArrowOptionsOpen, changeArrowAutoAdd, changeLaserSound, arrowHeads,
    setArrowHeads, editArrowStrokeWidth, updateEditArrowStrokeWidth, t, editArrowFontSize,
    updateEditArrowFontSize, setShowArrowModal, setPendingArrow, renderInModalNumpad,
  } = props;
  return (
    <>
      {/* Arrow Modal */}
      <Modal visible={showArrowModal} transparent animationType="slide">
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <ScrollView contentContainerStyle={[styles.modalScrollContent, isArrowNumpadOnPhone() && { justifyContent: 'flex-start', paddingTop: insets.top + 40 }]} keyboardShouldPersistTaps="handled">
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Bemaßungspfeil</Text>
              <BufferedTextInput replaceOnBurst
                ref={arrowInputRef}
                style={styles.modalInput}
                value={arrowText}
                onChangeText={setArrowText}
                placeholder="Maß eingeben (z.B. 5,5m)"
                keyboardType={Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'default'}
                autoFocus
                showSoftInputOnFocus={!showModalNumpad}
                onDeviceInput={(value) => {
                  if (laserSound) playLaserFeedback();
                  if (arrowAutoAdd) {
                    addArrowElement(value);
                    closeModalNumpad();
                  }
                }}
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
                testID="arrow-options-toggle"
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
              {/* Laser-Messwert ohne Bestätigen übernehmen */}
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 12 }}>
                <Text style={[styles.modalLabel, { flex: 1, marginBottom: 0 }]}>Laser-Messwert sofort übernehmen</Text>
                <Switch testID="arrow-auto-add-switch" value={arrowAutoAdd} onValueChange={changeArrowAutoAdd} />
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 12 }}>
                <Text style={[styles.modalLabel, { flex: 1, marginBottom: 0 }]}>Ton bei Laser-Messwert</Text>
                <Switch testID="arrow-laser-sound-switch" value={laserSound} onValueChange={changeLaserSound} />
              </View>
              {laserSound && (
                <View style={{ marginBottom: 12 }}>
                  <LaserSoundOptions />
                </View>
              )}
              <View style={{ marginHorizontal: -10, marginBottom: 6 }}>
                <LaserLog />
              </View>
              
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
              </>
              )}
              
              <View style={styles.modalButtons}>
                <TouchableOpacity
                  style={[styles.modalButton, styles.cancelButton]}
                  onPress={() => {
                    setShowArrowModal(false);
                    setArrowText('');
                    setPendingArrow(null);
                    closeModalNumpad();
                  }}
                >
                  <Text style={styles.cancelButtonText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{t('common.cancel')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalButton, styles.confirmButton]}
                  onPress={() => {
                    addArrowElement();
                    closeModalNumpad();
                  }}
                >
                  <Text style={styles.confirmButtonText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{t('common.add')}</Text>
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

import type { TFunction } from 'i18next';
import type { EdgeInsets } from 'react-native-safe-area-context';
import React from 'react';
import { View, Text, TouchableOpacity, TextInput, Platform } from 'react-native';
import { styles } from '../../../styles/sketchDrawStyles';
import Ionicons from '@react-native-vector-icons/ionicons';
import { SketchService } from '../../../../services/LocalStorage';
import { HelpButton } from '../../HelpButton';
import { tourRef } from '../../home/HomeTour';


export type SketchHeaderProps = {
  isPhoneLandscape: boolean;
  insets: EdgeInsets;
  handleBackPress: () => Promise<void>;
  isSaving: boolean;
  title: string;
  setTitle: React.Dispatch<React.SetStateAction<string>>;
  t: TFunction<"translation", undefined>;
  pdfSize: string;
  setPdfSize: React.Dispatch<React.SetStateAction<string>>;
  showAlert: (title: string, message: string) => void;
  sketchId: string | undefined;
  setShowDemo: React.Dispatch<React.SetStateAction<boolean>>;
  saveSketch: () => Promise<void>;
  loading: boolean;
};

export function SketchHeader(props: SketchHeaderProps) {
  const {
    isPhoneLandscape, insets, handleBackPress, isSaving, title, setTitle, t, pdfSize, setPdfSize,
    showAlert, sketchId, setShowDemo, saveSketch, loading,
  } = props;
  return (
    <>
      {/* Header - dynamisches Padding via SafeArea, kompakt im Querformat */}
      <View style={[styles.header, { 
        paddingTop: isPhoneLandscape ? Math.max(insets.top, 4) : (Platform.OS === 'ios' ? Math.max(insets.top, 20) : 12),
        paddingVertical: isPhoneLandscape ? 4 : 12,
        paddingLeft: isPhoneLandscape ? Math.max(insets.left, 8) : 16,
        paddingRight: isPhoneLandscape ? Math.max(insets.right, 8) : 16,
      }]}>
        <TouchableOpacity onPress={handleBackPress} style={styles.headerButton} disabled={isSaving}>
          <Ionicons name="arrow-back" size={isPhoneLandscape ? 20 : 24} color={isSaving ? "#999" : "#fff"} />
        </TouchableOpacity>
        <TextInput
          style={[styles.titleInput, isPhoneLandscape && { paddingVertical: 4, fontSize: 14 }]}
          value={title}
          onChangeText={setTitle}
          placeholder={t('sketches.sketchTitle')}
          placeholderTextColor="#ccc"
        />
        {/* PDF-Größe Button mit Label */}
        <TouchableOpacity 
          onPress={() => {
            const sizes = ['small', 'medium', 'large'];
            const labels = ['Klein (3/Zeile)', 'Mittel (2/Zeile)', 'Groß (1/Zeile)'];
            const currentIndex = sizes.indexOf(pdfSize);
            const nextIndex = (currentIndex + 1) % sizes.length;
            setPdfSize(sizes[nextIndex]);
            showAlert('PDF', labels[nextIndex]);
            // pdf_size sofort speichern, damit die Änderung beim Zurückkehren verfügbar ist
            if (sketchId) {
              SketchService.update(sketchId, { pdf_size: sizes[nextIndex] }).catch(err => 
                console.error('Error saving pdf_size:', err)
              );
            }
          }} 
          style={styles.pdfSizeHeaderButton}
        >
          <Ionicons 
            name={pdfSize === 'small' ? 'apps-outline' : pdfSize === 'medium' ? 'grid-outline' : 'square-outline'} 
            size={20} 
            color="#fff" 
          />
          <Text style={styles.pdfSizeHeaderLabel}>PDF</Text>
        </TouchableOpacity>
        <View ref={tourRef('sk-help')} collapsable={false} style={{ marginHorizontal: 4, flexDirection: 'row', gap: 4 }}>
          <TouchableOpacity testID="sketch-demo-open" onPress={() => setShowDemo(true)} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }} accessibilityLabel="Erklärvideo">
            <Ionicons name="play-circle-outline" size={26} color="#fff" />
          </TouchableOpacity>
          <HelpButton section="skizzen" light testID="sketch-help" />
        </View>
        <View ref={tourRef('sk-save')} collapsable={false}>
        <TouchableOpacity testID="sketch-save-button" onPress={saveSketch} style={styles.headerButton} disabled={loading}>
          <Ionicons name="checkmark" size={24} color={loading ? '#888' : '#fff'} />
        </TouchableOpacity>
        </View>
      </View>
    </>
  );
}

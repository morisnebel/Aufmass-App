import type { TFunction } from 'i18next';
import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import Slider from '@react-native-community/slider';
import { styles } from '../../../styles/sketchDrawStyles';
import Ionicons from '@react-native-vector-icons/ionicons';


export type GridSettingsPanelProps = {
  showGridSettings: boolean;
  backgroundImage: string | null;
  t: TFunction<"translation", undefined>;
  setShowGridSettings: React.Dispatch<React.SetStateAction<boolean>>;
  gridSize: number;
  setGridSize: React.Dispatch<React.SetStateAction<number>>;
  gridOpacity: number;
  setGridOpacity: React.Dispatch<React.SetStateAction<number>>;
};

export function GridSettingsPanel(props: GridSettingsPanelProps) {
  const {
    showGridSettings, backgroundImage, t, setShowGridSettings, gridSize, setGridSize, gridOpacity,
    setGridOpacity,
  } = props;
  return (
    <>
      {/* Gitter-Einstellungen Panel */}
      {showGridSettings && !backgroundImage && (
        <View style={styles.gridSettingsPanel}>
          <View style={styles.gridSettingsHeader}>
            <Text style={styles.gridSettingsTitle}>{t('sketches.gridSettings')}</Text>
            <TouchableOpacity onPress={() => setShowGridSettings(false)}>
              <Ionicons name="close" size={20} color="#666" />
            </TouchableOpacity>
          </View>
          
          {/* Größen-Slider */}
          <View style={styles.gridSliderSection}>
            <Text style={styles.gridSliderSectionLabel}>{t('sketches.gridSize')}: {gridSize}px</Text>
            <View style={styles.gridSliderRow}>
              <Text style={styles.gridSliderLabel}>{t('sketches.gridSmall')}</Text>
              <Slider
                style={styles.gridSlider}
                minimumValue={10}
                maximumValue={100}
                step={5}
                value={gridSize}
                onValueChange={(value) => setGridSize(value)}
                minimumTrackTintColor="#1976d2"
                maximumTrackTintColor="#ddd"
                thumbTintColor="#1976d2"
              />
              <Text style={styles.gridSliderLabel}>{t('sketches.gridLarge')}</Text>
            </View>
          </View>
          
          {/* Transparenz-Slider */}
          <View style={styles.gridSliderSection}>
            <Text style={styles.gridSliderSectionLabel}>{t('sketches.gridVisibility')}: {Math.round(gridOpacity * 100)}%</Text>
            <View style={styles.gridSliderRow}>
              <Text style={styles.gridSliderLabel}>{t('sketches.gridWeak')}</Text>
              <Slider
                style={styles.gridSlider}
                minimumValue={0.1}
                maximumValue={1}
                step={0.1}
                value={gridOpacity}
                onValueChange={(value) => setGridOpacity(value)}
                minimumTrackTintColor="#1976d2"
                maximumTrackTintColor="#ddd"
                thumbTintColor="#1976d2"
              />
              <Text style={styles.gridSliderLabel}>{t('sketches.gridStrong')}</Text>
            </View>
          </View>
        </View>
      )}
    </>
  );
}

import type { TFunction } from 'i18next';
import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { styles } from '../../../styles/sketchDrawStyles';


export type ColorPickerPanelProps = {
  showColorPicker: boolean;
  t: TFunction<"translation", undefined>;
  colors: string[];
  drawColor: string;
  setDrawColor: React.Dispatch<React.SetStateAction<string>>;
  setShowColorPicker: React.Dispatch<React.SetStateAction<boolean>>;
};

export function ColorPickerPanel(props: ColorPickerPanelProps) {
  const {
    showColorPicker, t, colors, drawColor, setDrawColor, setShowColorPicker,
  } = props;
  return (
    <>
      {/* Color picker expandable */}
      {showColorPicker && (
        <View style={styles.colorPickerPanel}>
          <Text style={styles.colorPickerTitle}>{t('sketches.chooseColor')}</Text>
          <View style={styles.colorGrid}>
            {colors.map(color => (
              <TouchableOpacity
                key={color}
                style={[
                  styles.colorOption,
                  { backgroundColor: color },
                  drawColor === color && styles.colorOptionSelected,
                ]}
                onPress={() => {
                  setDrawColor(color);
                  setShowColorPicker(false);
                }}
              />
            ))}
          </View>
        </View>
      )}
    </>
  );
}

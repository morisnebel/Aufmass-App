import type { TFunction } from 'i18next';
import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { styles } from '../../../styles/sketchDrawStyles';
import Ionicons from '@react-native-vector-icons/ionicons';
import { DrawElement } from '../../../sketch/sketchShared';


export type ElementStylePanelProps = {
  showElementStyleEditor: boolean;
  selectedElementForStyle: DrawElement | null | undefined;
  t: TFunction<"translation", undefined>;
  setShowElementStyleEditor: React.Dispatch<React.SetStateAction<boolean>>;
  colors: string[];
  changeSelectedElementColor: (newColor: string) => void;
  changeSelectedElementStrokeWidth: (newWidth: number) => void;
};

export function ElementStylePanel(props: ElementStylePanelProps) {
  const {
    showElementStyleEditor, selectedElementForStyle, t, setShowElementStyleEditor, colors,
    changeSelectedElementColor, changeSelectedElementStrokeWidth,
  } = props;
  return (
    <>
      {/* Stil-Editor Panel für ausgewähltes Element */}
      {showElementStyleEditor && selectedElementForStyle && (
        <View style={styles.elementStylePanel}>
          <View style={styles.elementStyleHeader}>
            <Text style={styles.elementStyleTitle}>{t('sketches.style')}</Text>
            <TouchableOpacity onPress={() => setShowElementStyleEditor(false)} style={{ padding: 4 }}>
              <Ionicons name="close-circle" size={22} color="#999" />
            </TouchableOpacity>
          </View>
          
          {/* Farbe + Linienstärke in einer kompakten Zeile */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            {/* Farbauswahl */}
            {selectedElementForStyle.type !== 'image' && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'wrap', flex: 1 }}>
                {colors.map(color => (
                  <TouchableOpacity
                    key={`style-${color}`}
                    style={[
                      styles.elementStyleColorOption,
                      { backgroundColor: color },
                      selectedElementForStyle.color === color && styles.elementStyleColorSelected,
                    ]}
                    onPress={() => changeSelectedElementColor(color)}
                  />
                ))}
              </View>
            )}
            
            {/* Linienstärke - kompakt */}
            {selectedElementForStyle.type !== 'image' && selectedElementForStyle.type !== 'text' && (
              <View style={{ flexDirection: 'row', gap: 4 }}>
                {[1, 2, 3, 5, 8].map(w => (
                  <TouchableOpacity
                    key={`style-sw-${w}`}
                    style={[
                      styles.elementStyleStrokeButton,
                      selectedElementForStyle.strokeWidth === w && styles.elementStyleStrokeButtonActive,
                    ]}
                    onPress={() => changeSelectedElementStrokeWidth(w)}
                  >
                    <View style={[
                      styles.elementStyleStrokeDot, 
                      { 
                        width: Math.max(w * 2, 5), 
                        height: Math.max(w * 2, 5),
                        backgroundColor: selectedElementForStyle.strokeWidth === w ? '#fff' : '#333',
                      }
                    ]} />
                    <Text style={[
                      styles.elementStyleStrokeLabel,
                      selectedElementForStyle.strokeWidth === w && { color: '#fff' }
                    ]}>{w}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        </View>
      )}
    </>
  );
}

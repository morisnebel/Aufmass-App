import type { TFunction } from 'i18next';
import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import Ionicons from '@react-native-vector-icons/ionicons';


export type MeasureLineStyleSectionProps = {
  panelOptionsOpen: boolean;
  setShowMeasureStyleSettings: React.Dispatch<React.SetStateAction<boolean>>;
  showMeasureStyleSettings: boolean;
  t: TFunction<"translation", undefined>;
  tempMeasureLineColor: string;
  setTempMeasureLineColor: React.Dispatch<React.SetStateAction<string>>;
  selectedLineSegment: { elementId: string; segmentIndex: number; } | null;
  setMeasureLineStyles: React.Dispatch<React.SetStateAction<{ [elementId: string]: { color: string; strokeWidth: number; fontSize: number; }; }>>;
  tempMeasureLineStrokeWidth: number;
  setTempMeasureLineStrokeWidth: React.Dispatch<React.SetStateAction<number>>;
  tempMeasureLineFontSize: number;
  setTempMeasureLineFontSize: React.Dispatch<React.SetStateAction<number>>;
};

export function MeasureLineStyleSection(props: MeasureLineStyleSectionProps) {
  const {
    panelOptionsOpen, setShowMeasureStyleSettings, showMeasureStyleSettings, t, tempMeasureLineColor,
    setTempMeasureLineColor, selectedLineSegment, setMeasureLineStyles, tempMeasureLineStrokeWidth,
    setTempMeasureLineStrokeWidth, tempMeasureLineFontSize, setTempMeasureLineFontSize,
  } = props;
  return (
    <>
      {/* Einklappbare Maßlinien-Darstellung (Teil der Optionen) */}
      {panelOptionsOpen && (
      <View style={{ paddingHorizontal: 10 }}>
        <TouchableOpacity 
          style={{ 
            flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
            paddingVertical: 6, borderTopWidth: 1, borderTopColor: '#e0e0e0', marginTop: 4,
          }}
          onPress={() => setShowMeasureStyleSettings(!showMeasureStyleSettings)}
        >
          <Text style={{ fontSize: 12, fontWeight: '700', color: '#555' }}>Maßlinien-Darstellung</Text>
          <Ionicons name={showMeasureStyleSettings ? 'chevron-up' : 'chevron-down'} size={16} color="#888" />
        </TouchableOpacity>
        
        {showMeasureStyleSettings && (
          <View style={{ paddingBottom: 4 }}>
            <View style={{ marginBottom: 6 }}>
              <Text style={{ fontSize: 10, color: '#666', marginBottom: 3 }}>{t('sketches.colorLabel')}</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5 }}>
                {['#1976d2', '#f44336', '#4caf50', '#ff9800', '#9c27b0', '#000000', '#795548', '#607d8b'].map(c => (
                  <TouchableOpacity
                    key={`ml-${c}`}
                    style={{
                      width: 24, height: 24, borderRadius: 12, backgroundColor: c,
                      borderWidth: tempMeasureLineColor === c ? 3 : 1.5,
                      borderColor: tempMeasureLineColor === c ? '#fff' : '#ddd',
                    }}
                    onPress={() => {
                      setTempMeasureLineColor(c);
                      if (selectedLineSegment) {
                        setMeasureLineStyles(prev => ({
                          ...prev,
                          [selectedLineSegment.elementId]: {
                            ...(prev[selectedLineSegment.elementId] || { color: '#1976d2', strokeWidth: 1.2, fontSize: 11 }),
                            color: c,
                          }
                        }));
                      }
                    }}
                  />
                ))}
              </View>
            </View>
            <View style={{ marginBottom: 6 }}>
              <Text style={{ fontSize: 10, color: '#666', marginBottom: 3 }}>Linienstärke:</Text>
              <View style={{ flexDirection: 'row', gap: 5 }}>
                {[0.8, 1.2, 2, 3, 4].map(w => (
                  <TouchableOpacity
                    key={`mlw-${w}`}
                    style={{
                      alignItems: 'center', justifyContent: 'center',
                      paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6,
                      backgroundColor: tempMeasureLineStrokeWidth === w ? tempMeasureLineColor : '#f0f0f0',
                      minWidth: 36,
                    }}
                    onPress={() => {
                      setTempMeasureLineStrokeWidth(w);
                      if (selectedLineSegment) {
                        setMeasureLineStyles(prev => ({
                          ...prev,
                          [selectedLineSegment.elementId]: {
                            ...(prev[selectedLineSegment.elementId] || { color: '#1976d2', strokeWidth: 1.2, fontSize: 11 }),
                            strokeWidth: w,
                          }
                        }));
                      }
                    }}
                  >
                    <View style={{
                      width: Math.max(w * 2.5, 4), height: Math.max(w * 2.5, 4),
                      borderRadius: 50, backgroundColor: tempMeasureLineStrokeWidth === w ? '#fff' : '#333',
                    }} />
                    <Text style={{ fontSize: 8, color: tempMeasureLineStrokeWidth === w ? '#fff' : '#666', fontWeight: '500' }}>{w}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            <View>
              <Text style={{ fontSize: 10, color: '#666', marginBottom: 3 }}>{t('sketches.fontSize')}:</Text>
              <View style={{ flexDirection: 'row', gap: 5 }}>
                {[8, 11, 14, 18, 22].map(fs => (
                  <TouchableOpacity
                    key={`mlfs-${fs}`}
                    style={{
                      alignItems: 'center', justifyContent: 'center',
                      paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6,
                      backgroundColor: tempMeasureLineFontSize === fs ? tempMeasureLineColor : '#f0f0f0',
                      minWidth: 36,
                    }}
                    onPress={() => {
                      setTempMeasureLineFontSize(fs);
                      if (selectedLineSegment) {
                        setMeasureLineStyles(prev => ({
                          ...prev,
                          [selectedLineSegment.elementId]: {
                            ...(prev[selectedLineSegment.elementId] || { color: '#1976d2', strokeWidth: 1.2, fontSize: 11 }),
                            fontSize: fs,
                          }
                        }));
                      }
                    }}
                  >
                    <Text style={{ fontSize: Math.min(fs, 14), color: tempMeasureLineFontSize === fs ? '#fff' : '#333', fontWeight: '700' }}>A</Text>
                    <Text style={{ fontSize: 8, color: tempMeasureLineFontSize === fs ? '#fff' : '#666', fontWeight: '500' }}>{fs}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>
        )}
      </View>
      )}
    </>
  );
}

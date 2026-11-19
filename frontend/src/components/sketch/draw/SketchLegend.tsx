import { lfmBreakdown } from '../../../sketch/polygonArea';
import type { PanResponderInstance } from 'react-native';
import type { TFunction } from 'i18next';
import React from 'react';
import { View, Text, Animated, Pressable } from 'react-native';
import { styles } from '../../../styles/sketchDrawStyles';
import Ionicons from '@react-native-vector-icons/ionicons';
import { DrawElement } from '../../../sketch/sketchShared';


export type SketchLegendProps = {
  lineSegmentMeasurements: { [key: string]: { [segmentIndex: number]: string } };
  getPolylineElementsWithMeasurements: () => DrawElement[];
  legendPan: Animated.ValueXY;
  legendPanResponder: PanResponderInstance;
  t: TFunction<"translation", undefined>;
  calculateTotalLfmForElement: (elementId: string) => number;
  polygonAreaVisible: { [elementId: string]: boolean; };
  calculatePolygonAreaM2: (element: DrawElement) => number | null;
  setRenamePolyline: React.Dispatch<React.SetStateAction<{ id: string; name: string; } | null>>;
  formatAreaM2: (area: number) => string;
};

export function SketchLegend(props: SketchLegendProps) {
  const {
    getPolylineElementsWithMeasurements, legendPan, legendPanResponder, t,
    calculateTotalLfmForElement, polygonAreaVisible, calculatePolygonAreaM2, setRenamePolyline,
    formatAreaM2,
    lineSegmentMeasurements,
  } = props;
  return (
    <>
      {/* Legende mit Skizzen-Summen (S1, S2, S3...) - verschiebbar */}
      {getPolylineElementsWithMeasurements().length > 0 && (
        <Animated.View 
          style={[
            styles.sketchLegend,
            { transform: legendPan.getTranslateTransform() }
          ]}
          {...legendPanResponder.panHandlers}
        >
          <View style={styles.sketchLegendDragHandle}>
            <Ionicons name="move" size={12} color="#999" />
          </View>
          <Text style={styles.sketchLegendTitle}>{t('sketches.overview')}</Text>
          {getPolylineElementsWithMeasurements().map((element, index) => {
            const totalForElement = calculateTotalLfmForElement(element.id);
            if (totalForElement <= 0) return null;
            const legendAreaM2 = polygonAreaVisible[element.id] !== false ? calculatePolygonAreaM2(element) : null;
            return (
              <Pressable
                key={`legend-${element.id}`}
                testID={`legend-row-${index}`}
                style={styles.sketchLegendRow}
                onPress={() => setRenamePolyline({ id: element.id, name: element.name || '' })}
                hitSlop={4}
              >
                <View style={styles.sketchLegendLabel}>
                  <Text style={styles.sketchLegendLabelText}>S{index + 1}</Text>
                </View>
                <Text style={styles.sketchLegendValue}>
                  {element.name ? `${element.name} ` : ''}{lfmBreakdown(element, lineSegmentMeasurements[element.id]) ? `${lfmBreakdown(element, lineSegmentMeasurements[element.id])} = ${totalForElement.toFixed(2).replace('.', ',')}` : `= ${totalForElement.toString().replace('.', ',')}`} lfm
                  {legendAreaM2 !== null ? ` • ${formatAreaM2(legendAreaM2)}` : ''}
                </Text>
                <Ionicons name="pencil" size={11} color="#999" style={{ marginLeft: 4 }} />
              </Pressable>
            );
          })}
        </Animated.View>
      )}
    </>
  );
}

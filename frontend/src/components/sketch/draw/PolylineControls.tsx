import type { PanResponderInstance } from 'react-native';
import type { TFunction } from 'i18next';
import React from 'react';
import { View, Text, TouchableOpacity, Animated } from 'react-native';
import { styles } from '../../../styles/sketchDrawStyles';
import Ionicons from '@react-native-vector-icons/ionicons';
import { DrawMode } from '../../../sketch/sketchShared';


export type PolylineControlsProps = {
  drawMode: DrawMode;
  polylinePoints: { x: number; y: number; }[];
  polylineControlPosition: Animated.ValueXY;
  polylineControlPanResponder: PanResponderInstance;
  t: TFunction<"translation", undefined>;
  angleSnapEnabled: boolean;
  setAngleSnapEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  angleSnapValue: number;
  setAngleSnapValue: React.Dispatch<React.SetStateAction<number>>;
  showGrid: boolean;
  backgroundImage: string | null;
  gridSnapEnabled: boolean;
  setGridSnapEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  undoLastPolylinePoint: () => void;
  finishPolyline: (closed?: boolean) => void;
  cancelPolyline: () => void;
};

export function PolylineControls(props: PolylineControlsProps) {
  const {
    drawMode, polylinePoints, polylineControlPosition, polylineControlPanResponder, t,
    angleSnapEnabled, setAngleSnapEnabled, angleSnapValue, setAngleSnapValue, showGrid,
    backgroundImage, gridSnapEnabled, setGridSnapEnabled, undoLastPolylinePoint, finishPolyline,
    cancelPolyline,
  } = props;
  return (
    <>
      {/* Polyline Steuerung - kompakt und verschiebbar */}
      {drawMode === 'polyline' && polylinePoints.length > 0 && (
        <Animated.View 
          style={[
            styles.polylineControlsCompact,
            { transform: polylineControlPosition.getTranslateTransform() }
          ]}
        >
          {/* Drag Handle */}
          <View {...polylineControlPanResponder.panHandlers} style={styles.polylineDragHandle}>
            <View style={styles.polylineDragIndicator} />
            <Text style={styles.polylineInfoCompact}>
              {t('sketches.groundPlan')}: {polylinePoints.length}
            </Text>
          </View>
          
          {/* Winkel-Snap + Raster-Snap Toggles */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingBottom: 4, flexWrap: 'wrap' }}>
            {/* Winkel-Snap Toggle */}
            <TouchableOpacity 
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                backgroundColor: angleSnapEnabled ? '#1976d2' : '#e0e0e0',
                borderRadius: 6,
                paddingHorizontal: 8,
                paddingVertical: 4,
                gap: 4,
              }}
              onPress={() => setAngleSnapEnabled(!angleSnapEnabled)}
              activeOpacity={0.7}
            >
              <Ionicons name="git-branch-outline" size={14} color={angleSnapEnabled ? '#fff' : '#666'} />
              <Text style={{ fontSize: 11, fontWeight: '600', color: angleSnapEnabled ? '#fff' : '#666' }}>
                {angleSnapEnabled ? `${angleSnapValue}°` : 'Winkel'}
              </Text>
            </TouchableOpacity>
            
            {angleSnapEnabled && (
              <View style={{ flexDirection: 'row', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
                {[30, 45, 60, 90, 120].map(angle => (
                  <TouchableOpacity
                    key={`snap-${angle}`}
                    style={{
                      backgroundColor: angleSnapValue === angle ? '#1565c0' : '#f0f0f0',
                      borderRadius: 4,
                      paddingHorizontal: 6,
                      paddingVertical: 3,
                    }}
                    onPress={() => setAngleSnapValue(angle)}
                    activeOpacity={0.7}
                  >
                    <Text style={{ fontSize: 10, fontWeight: '600', color: angleSnapValue === angle ? '#fff' : '#666' }}>
                      {angle}°
                    </Text>
                  </TouchableOpacity>
                ))}
                {/* Benutzerdefinierter Winkel - + / - Buttons */}
                <TouchableOpacity
                  style={{
                    backgroundColor: '#f0f0f0',
                    borderRadius: 4,
                    paddingHorizontal: 5,
                    paddingVertical: 3,
                  }}
                  onPress={() => setAngleSnapValue(Math.max(5, angleSnapValue - 5))}
                  activeOpacity={0.7}
                >
                  <Text style={{ fontSize: 12, fontWeight: '700', color: '#666' }}>−</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={{
                    backgroundColor: '#f0f0f0',
                    borderRadius: 4,
                    paddingHorizontal: 5,
                    paddingVertical: 3,
                  }}
                  onPress={() => setAngleSnapValue(Math.min(180, angleSnapValue + 5))}
                  activeOpacity={0.7}
                >
                  <Text style={{ fontSize: 12, fontWeight: '700', color: '#666' }}>+</Text>
                </TouchableOpacity>
              </View>
            )}
            
            {/* Raster-Snap Toggle */}
            {showGrid && !backgroundImage && (
              <TouchableOpacity 
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  backgroundColor: gridSnapEnabled ? '#4caf50' : '#e0e0e0',
                  borderRadius: 6,
                  paddingHorizontal: 8,
                  paddingVertical: 4,
                  gap: 4,
                }}
                onPress={() => setGridSnapEnabled(!gridSnapEnabled)}
                activeOpacity={0.7}
              >
                <Ionicons name="grid-outline" size={14} color={gridSnapEnabled ? '#fff' : '#666'} />
                <Text style={{ fontSize: 11, fontWeight: '600', color: gridSnapEnabled ? '#fff' : '#666' }}>
                  Raster
                </Text>
              </TouchableOpacity>
            )}
          </View>
          
          {/* Buttons */}
          <View style={styles.polylineButtonsCompact}>
            <TouchableOpacity 
              style={[styles.polylineButtonCompact, styles.polylineButtonUndo]} 
              onPress={undoLastPolylinePoint}
              activeOpacity={0.7}
            >
              <Ionicons name="arrow-undo" size={16} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.polylineButtonCompact, styles.polylineButtonFinish]} 
              onPress={() => finishPolyline(false)}
              activeOpacity={0.7}
            >
              <Ionicons name="checkmark" size={16} color="#fff" />
            </TouchableOpacity>
            {polylinePoints.length >= 3 && (
              <TouchableOpacity 
                style={[styles.polylineButtonCompact, styles.polylineButtonClose]} 
                onPress={() => finishPolyline(true)}
                activeOpacity={0.7}
              >
                <Ionicons name="link" size={16} color="#fff" />
              </TouchableOpacity>
            )}
            <TouchableOpacity 
              style={[styles.polylineButtonCompact, styles.polylineButtonCancel]} 
              onPress={cancelPolyline}
              activeOpacity={0.7}
            >
              <Ionicons name="trash" size={16} color="#fff" />
            </TouchableOpacity>
          </View>
        </Animated.View>
      )}
    </>
  );
}

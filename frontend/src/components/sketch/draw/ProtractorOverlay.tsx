import type { PanResponderInstance } from 'react-native';
import type { TFunction } from 'i18next';
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, Platform, Animated } from 'react-native';
import { styles } from '../../../styles/sketchDrawStyles';
import Ionicons from '@react-native-vector-icons/ionicons';
import Svg, { Path, Line, Circle, Text as SvgText } from 'react-native-svg';


export type ProtractorOverlayProps = {
  showProtractor: boolean;
  handleProtractorDragStart: (e: any) => void;
  handleProtractorDragMove: (e: any) => void;
  handleProtractorDragEnd: () => void;
  fabricInvalidateTick: React.RefObject<number>;
  screenWidth: number;
  screenHeight: number;
  protractorCenter: { x: number; y: number; };
  protractorRefEnd: { x: number; y: number; };
  protractorAngleEnd: { x: number; y: number; };
  protractorAngle: number;
  protractorUseComplementary: boolean;
  protractorPanelPan: Animated.ValueXY;
  isPhoneDevice: boolean;
  protractorPanelPanResponder: PanResponderInstance;
  adjustProtractorAngle: (deltaDeg: number) => void;
  setProtractorAngleInput: React.Dispatch<React.SetStateAction<string>>;
  setShowProtractorAngleInput: React.Dispatch<React.SetStateAction<boolean>>;
  setProtractorUseComplementary: React.Dispatch<React.SetStateAction<boolean>>;
  setProtractorDrawSize: React.Dispatch<React.SetStateAction<number>>;
  protractorDrawSize: number;
  canvasHeight: number;
  setProtractorCenter: React.Dispatch<React.SetStateAction<{ x: number; y: number; }>>;
  setProtractorRefEnd: React.Dispatch<React.SetStateAction<{ x: number; y: number; }>>;
  setProtractorAngleEnd: React.Dispatch<React.SetStateAction<{ x: number; y: number; }>>;
  setShowProtractor: React.Dispatch<React.SetStateAction<boolean>>;
  t: TFunction<"translation", undefined>;
  addProtractorToSketch: () => void;
  showProtractorAngleInput: boolean;
  protractorAngleInput: string;
  setProtractorAngleTo: (deg: number) => void;
  showProtractorHint: boolean;
  setShowProtractorHint: React.Dispatch<React.SetStateAction<boolean>>;
};

export function ProtractorOverlay(props: ProtractorOverlayProps) {
  const {
    showProtractor, handleProtractorDragStart, handleProtractorDragMove, handleProtractorDragEnd,
    fabricInvalidateTick, screenWidth, screenHeight, protractorCenter, protractorRefEnd,
    protractorAngleEnd, protractorAngle, protractorUseComplementary, protractorPanelPan,
    isPhoneDevice, protractorPanelPanResponder, adjustProtractorAngle, setProtractorAngleInput,
    setShowProtractorAngleInput, setProtractorUseComplementary, setProtractorDrawSize,
    protractorDrawSize, canvasHeight, setProtractorCenter, setProtractorRefEnd,
    setProtractorAngleEnd, setShowProtractor, t, addProtractorToSketch, showProtractorAngleInput,
    protractorAngleInput, setProtractorAngleTo, showProtractorHint, setShowProtractorHint,
  } = props;
  return (
    <>
      {/* Winkelmesser Overlay - NEU: Bildschirmkoordinaten-basiert */}
      {showProtractor && (
        <View style={styles.protractorOverlay} pointerEvents="box-none">
          {/* Vollbild-Drag-Bereich */}
          <View 
            style={[StyleSheet.absoluteFill, { zIndex: 1, backgroundColor: 'transparent' }]}
            collapsable={false}
            pointerEvents={Platform.OS === 'web' ? 'auto' : 'none'}
            // @ts-ignore - Web-only events
            onMouseDown={Platform.OS === 'web' ? handleProtractorDragStart : undefined}
            onMouseMove={Platform.OS === 'web' ? handleProtractorDragMove : undefined}
            onMouseUp={Platform.OS === 'web' ? handleProtractorDragEnd : undefined}
            onMouseLeave={Platform.OS === 'web' ? handleProtractorDragEnd : undefined}
            onTouchStart={Platform.OS === 'web' ? handleProtractorDragStart : undefined}
            onTouchMove={Platform.OS === 'web' ? handleProtractorDragMove : undefined}
            onTouchEnd={Platform.OS === 'web' ? handleProtractorDragEnd : undefined}
          >
            {/* Vollbild-SVG für Linien und Griffe (Wrapper-View statt Svg-Prop für pointerEvents – Fabric-Bug) */}
            <View style={StyleSheet.absoluteFill} pointerEvents="none">
            <Svg 
              key={`prot-${fabricInvalidateTick.current++}`}
              width={screenWidth} 
              height={screenHeight} 
              style={{ position: 'absolute', top: 0, left: 0, backgroundColor: 'transparent' }}
            >
              {/* Referenzlinie (blau) */}
              <Line 
                x1={protractorCenter.x} y1={protractorCenter.y}
                x2={protractorRefEnd.x} y2={protractorRefEnd.y}
                stroke="#2196f3" strokeWidth={3}
              />
              
              {/* Winkellinie (orange) */}
              <Line 
                x1={protractorCenter.x} y1={protractorCenter.y}
                x2={protractorAngleEnd.x} y2={protractorAngleEnd.y}
                stroke="#FF5722" strokeWidth={3}
              />
              
              {/* Winkelbogen */}
              {protractorAngle !== 0 && (() => {
                const refAng = Math.atan2(protractorRefEnd.y - protractorCenter.y, protractorRefEnd.x - protractorCenter.x);
                const angAng = Math.atan2(protractorAngleEnd.y - protractorCenter.y, protractorAngleEnd.x - protractorCenter.x);
                const arcR = 40;
                const arcX1 = protractorCenter.x + arcR * Math.cos(refAng);
                const arcY1 = protractorCenter.y + arcR * Math.sin(refAng);
                const arcX2 = protractorCenter.x + arcR * Math.cos(angAng);
                const arcY2 = protractorCenter.y + arcR * Math.sin(angAng);
                const largeArc = Math.abs(protractorAngle) > 180 ? 1 : 0;
                const sweep = protractorAngle > 0 ? 1 : 0;
                return (
                  <Path 
                    d={`M ${arcX1} ${arcY1} A ${arcR} ${arcR} 0 ${largeArc} ${sweep} ${arcX2} ${arcY2}`}
                    fill="none" stroke="#4caf50" strokeWidth={3}
                  />
                );
              })()}
              
              {/* Winkelwert am Mittelpunkt */}
              <SvgText
                x={protractorCenter.x}
                y={protractorCenter.y - 20}
                fill="#FF5722"
                fontSize={20}
                fontWeight="bold"
                textAnchor="middle"
              >
                {protractorUseComplementary && Math.abs(protractorAngle) !== 0 && Math.abs(protractorAngle) !== 180
                  ? `${180 - Math.abs(protractorAngle)}°`
                  : `${Math.abs(protractorAngle)}°`}
              </SvgText>
              
              {/* Mittelpunkt (kleiner Kreis) */}
              <Circle cx={protractorCenter.x} cy={protractorCenter.y} r={8} fill="#FF5722" stroke="#fff" strokeWidth={2} />
              
              {/* Griffpunkt Referenzlinie (blau, größer) */}
              <Circle cx={protractorRefEnd.x} cy={protractorRefEnd.y} r={14} fill="#2196f3" stroke="#fff" strokeWidth={3} />
              
              {/* Griffpunkt Winkellinie (orange, größer) */}
              <Circle cx={protractorAngleEnd.x} cy={protractorAngleEnd.y} r={14} fill="#FF5722" stroke="#fff" strokeWidth={3} />
              
              {/* Labels an den Griffpunkten */}
              <SvgText
                x={protractorRefEnd.x}
                y={protractorRefEnd.y - 20}
                fill="#2196f3"
                fontSize={12}
                fontWeight="bold"
                textAnchor="middle"
              >
                Ref
              </SvgText>
              <SvgText
                x={protractorAngleEnd.x}
                y={protractorAngleEnd.y - 20}
                fill="#FF5722"
                fontSize={12}
                fontWeight="bold"
                textAnchor="middle"
              >
                Winkel
              </SvgText>
              {Platform.OS !== 'web' && (
                <Circle key={`inv-${fabricInvalidateTick.current++}`} cx={-9999} cy={-9999} r={0.1} fill="none" stroke="none" opacity={0} />
              )}
            </Svg>
            </View>
          </View>
          
          {/* Kompakte Steuerelemente - verschiebbar */}
          <Animated.View 
            style={[
              styles.protractorBottomControls, 
              { 
                zIndex: 10,
                transform: protractorPanelPan.getTranslateTransform(),
              },
              isPhoneDevice && {
                bottom: 20,
                left: 10,
                right: 10,
                gap: 6,
              },
            ]}
          >
            {/* Drag-Handle */}
            <View {...protractorPanelPanResponder.panHandlers}>
              <View style={{
                width: 40, height: 5, borderRadius: 3,
                backgroundColor: '#ccc', alignSelf: 'center', marginBottom: isPhoneDevice ? 2 : 6,
              }} />
            </View>
            
            {/* Winkelsteuerung - kompakt auf iPhone */}
            <View style={[styles.protractorControlRow, isPhoneDevice && { paddingVertical: 4, paddingHorizontal: 8, gap: 4 }]}>
              <TouchableOpacity 
                style={[styles.protractorControlBtn, isPhoneDevice && { width: 34, height: 34, borderRadius: 17 }]}
                onPress={() => adjustProtractorAngle(-10)}
              >
                <Text style={[styles.protractorControlBtnText, isPhoneDevice && { fontSize: 11 }]}>-10°</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.protractorControlBtn, isPhoneDevice && { width: 34, height: 34, borderRadius: 17 }]}
                onPress={() => adjustProtractorAngle(-1)}
              >
                <Text style={[styles.protractorControlBtnText, isPhoneDevice && { fontSize: 11 }]}>-1°</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={[styles.protractorAngleBadge, isPhoneDevice && { paddingHorizontal: 10, paddingVertical: 4, minWidth: 56 }]}
                onPress={() => {
                  setProtractorAngleInput(Math.abs(protractorAngle).toString());
                  setShowProtractorAngleInput(true);
                }}
              >
                <Text style={[styles.protractorAngleBadgeText, isPhoneDevice && { fontSize: 16 }]}>
                  {protractorUseComplementary && Math.abs(protractorAngle) !== 0 && Math.abs(protractorAngle) !== 180
                    ? `${180 - Math.abs(protractorAngle)}°`
                    : `${Math.abs(protractorAngle)}°`}
                </Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={[styles.protractorControlBtn, isPhoneDevice && { width: 34, height: 34, borderRadius: 17 }]}
                onPress={() => adjustProtractorAngle(1)}
              >
                <Text style={[styles.protractorControlBtnText, isPhoneDevice && { fontSize: 11 }]}>+1°</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.protractorControlBtn, isPhoneDevice && { width: 34, height: 34, borderRadius: 17 }]}
                onPress={() => adjustProtractorAngle(10)}
              >
                <Text style={[styles.protractorControlBtnText, isPhoneDevice && { fontSize: 11 }]}>+10°</Text>
              </TouchableOpacity>
            </View>
            
            {/* Innen/Außen + Größe + Reset - kompakte Zeile */}
            <View style={[styles.protractorControlRow, isPhoneDevice && { paddingVertical: 4, paddingHorizontal: 8, gap: 4 }]}>
              <TouchableOpacity 
                style={[styles.protractorToggleBtn, protractorUseComplementary && styles.protractorToggleBtnActive, isPhoneDevice && { paddingHorizontal: 8, paddingVertical: 3 }]}
                onPress={() => setProtractorUseComplementary(prev => !prev)}
              >
                <Ionicons name="swap-horizontal" size={isPhoneDevice ? 14 : 16} color={protractorUseComplementary ? '#fff' : '#333'} />
                <Text style={[styles.protractorToggleBtnText, protractorUseComplementary && styles.protractorToggleBtnTextActive, isPhoneDevice && { fontSize: 10 }]}>
                  {protractorUseComplementary ? 'Außen' : 'Innen'}
                </Text>
              </TouchableOpacity>
              
              <View style={styles.protractorSizeControl}>
                <TouchableOpacity 
                  style={[styles.protractorControlBtnSmall, isPhoneDevice && { width: 26, height: 26, borderRadius: 13 }]}
                  onPress={() => setProtractorDrawSize(prev => Math.max(30, prev - 10))}
                >
                  <Ionicons name="remove" size={isPhoneDevice ? 12 : 16} color="#333" />
                </TouchableOpacity>
                <Text style={[styles.protractorSizeLabel, isPhoneDevice && { fontSize: 9 }]}>{protractorDrawSize}px</Text>
                <TouchableOpacity 
                  style={[styles.protractorControlBtnSmall, isPhoneDevice && { width: 26, height: 26, borderRadius: 13 }]}
                  onPress={() => setProtractorDrawSize(prev => Math.min(120, prev + 10))}
                >
                  <Ionicons name="add" size={isPhoneDevice ? 12 : 16} color="#333" />
                </TouchableOpacity>
              </View>
              
              <TouchableOpacity 
                style={[styles.protractorResetBtn, isPhoneDevice && { paddingHorizontal: 8, paddingVertical: 3 }]}
                onPress={() => {
                  const cx = screenWidth / 2;
                  const cy = Math.max(200, canvasHeight / 2 + 60);
                  const defaultLen = Math.min(screenWidth * 0.3, 150);
                  setProtractorCenter({ x: cx, y: cy });
                  setProtractorRefEnd({ x: cx + defaultLen, y: cy });
                  setProtractorAngleEnd({ x: cx + defaultLen * Math.cos(-Math.PI/4), y: cy + defaultLen * Math.sin(-Math.PI/4) });
                  setProtractorUseComplementary(false);
                  setProtractorDrawSize(60);
                }}
              >
                <Text style={[styles.protractorResetBtnText, isPhoneDevice && { fontSize: 10 }]}>Reset</Text>
              </TouchableOpacity>
            </View>
            
            {/* Aktions-Buttons - kompakt auf iPhone */}
            <View style={{ flexDirection: 'row', gap: isPhoneDevice ? 8 : 12, justifyContent: 'center' }}>
              <TouchableOpacity 
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  backgroundColor: '#f44336',
                  paddingHorizontal: isPhoneDevice ? 14 : 20,
                  paddingVertical: isPhoneDevice ? 8 : 12,
                  borderRadius: 20,
                  gap: isPhoneDevice ? 4 : 8,
                }}
                onPress={() => setShowProtractor(false)}
              >
                <Ionicons name="close-circle" size={isPhoneDevice ? 18 : 22} color="#fff" />
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: isPhoneDevice ? 12 : 15 }}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.protractorAddBtn, isPhoneDevice && { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 }]}
                onPress={addProtractorToSketch}
              >
                <Ionicons name="checkmark-circle" size={isPhoneDevice ? 18 : 24} color="#fff" />
                <Text style={[styles.protractorAddBtnText, isPhoneDevice && { fontSize: 12 }]}>{t('common.add')}</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
          
          {/* Winkel-Eingabe Modal */}
          {showProtractorAngleInput && (
            <View style={styles.protractorInputModal}>
              <Text style={styles.protractorInputLabel}>{t('sketches.enterAngle')}</Text>
              <TextInput
                style={styles.protractorInput}
                value={protractorAngleInput}
                onChangeText={setProtractorAngleInput}
                keyboardType="numeric"
                autoFocus
                selectTextOnFocus
              />
              <View style={styles.protractorInputButtons}>
                <TouchableOpacity 
                  style={styles.protractorInputCancelButton}
                  onPress={() => setShowProtractorAngleInput(false)}
                >
                  <Text style={styles.protractorInputCancelText}>{t('common.cancel')}</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={styles.protractorInputOkButton}
                  onPress={() => {
                    const angle = parseInt(protractorAngleInput) || 0;
                    setProtractorAngleTo(angle % 360);
                    setShowProtractorAngleInput(false);
                  }}
                >
                  <Text style={styles.protractorInputOkText}>OK</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
          
          {/* Hinweis-Overlay beim Öffnen */}
          {showProtractorHint && (
            <TouchableOpacity 
              style={{
                ...StyleSheet.absoluteFill,
                backgroundColor: 'rgba(0,0,0,0.6)',
                justifyContent: 'center',
                alignItems: 'center',
                zIndex: 100,
                padding: 24,
              }}
              activeOpacity={1}
              onPress={() => setShowProtractorHint(false)}
            >
              <View style={{
                backgroundColor: '#fff',
                borderRadius: 16,
                padding: 24,
                maxWidth: 360,
                width: '90%',
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.3,
                shadowRadius: 8,
                elevation: 8,
              }}>
                <Text style={{ fontSize: 20, fontWeight: '700', color: '#333', marginBottom: 16, textAlign: 'center' }}>
                  Winkelmesser
                </Text>
                
                <View style={{ marginBottom: 12 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                    <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: '#FF5722', marginRight: 10 }} />
                    <Text style={{ fontSize: 14, color: '#555', flex: 1 }}>
                      Mittelpunkt auf die Ecke ziehen
                    </Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                    <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: '#2196f3', marginRight: 10 }} />
                    <Text style={{ fontSize: 14, color: '#555', flex: 1 }}>
                      Referenzlinie auf die erste Kante ziehen
                    </Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                    <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: '#FF5722', marginRight: 10, borderWidth: 2, borderColor: '#fff' }} />
                    <Text style={{ fontSize: 14, color: '#555', flex: 1 }}>
                      Winkellinie auf die zweite Kante ziehen
                    </Text>
                  </View>
                </View>
                
                <View style={{ backgroundColor: '#FFF3E0', borderRadius: 8, padding: 10, marginBottom: 16 }}>
                  <Text style={{ fontSize: 12, color: '#E65100', textAlign: 'center' }}>
                    Tipp: Für genaue Ergebnisse das Foto möglichst frontal zur Oberfläche aufnehmen
                  </Text>
                </View>
                
                <TouchableOpacity 
                  style={{
                    backgroundColor: '#FF5722',
                    borderRadius: 25,
                    paddingVertical: 12,
                    alignItems: 'center',
                  }}
                  onPress={() => setShowProtractorHint(false)}
                >
                  <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>{t('sketches.understood')}</Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          )}
          
          {/* Schließen-Button */}
          <TouchableOpacity 
            style={[styles.protractorCloseButton, { zIndex: 20 }]}
            onPress={() => setShowProtractor(false)}
          >
            <Ionicons name="close-circle" size={44} color="#f44336" />
          </TouchableOpacity>
        </View>
      )}
    </>
  );
}

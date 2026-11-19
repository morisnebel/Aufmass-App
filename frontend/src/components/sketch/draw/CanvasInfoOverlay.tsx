import type { TFunction } from 'i18next';
import React from 'react';
import { View, Text, TouchableOpacity, Alert, Platform } from 'react-native';
import { styles } from '../../../styles/sketchDrawStyles';
import Ionicons from '@react-native-vector-icons/ionicons';
import { PhotoService } from '../../../../services/LocalStorage';
import { captureRef } from 'react-native-view-shot';
import { DrawElement } from '../../../sketch/sketchShared';


export type CanvasInfoOverlayProps = {
  elements: DrawElement[];
  selectedElementId: string | null;
  isAngleGroupElement: (elementId: string) => boolean;
  getAngleGroupBaseId: (elementId: string) => string | null;
  getAngleGroupGeometry: (baseId: string, els?: DrawElement[]) => { cx: any; cy: any; refAngleRad: number; refLength: number; angleLineRad: number; anglLineLength: number; angleOffsetRad: number; } | null;
  canvasLayout: { x: number; y: number; width: number; height: number; } | null;
  scaleRef: React.RefObject<number>;
  getAngleGroupElementIds: (baseId: string) => string[];
  addToHistory: (newElements: DrawElement[]) => void;
  setSelectedElementId: React.Dispatch<React.SetStateAction<string | null>>;
  canvasRef: React.RefObject<null>;
  protractorCanvasSnapshot: React.RefObject<string | null>;
  setProtractorCenter: React.Dispatch<React.SetStateAction<{ x: number; y: number; }>>;
  setProtractorRefEnd: React.Dispatch<React.SetStateAction<{ x: number; y: number; }>>;
  setProtractorAngleEnd: React.Dispatch<React.SetStateAction<{ x: number; y: number; }>>;
  setShowProtractorHint: React.Dispatch<React.SetStateAction<boolean>>;
  setShowProtractor: React.Dispatch<React.SetStateAction<boolean>>;
  t: TFunction<"translation", undefined>;
  projectId: string | undefined;
  photoEditMode: boolean;
  zoomMode: boolean;
  scale: number;
  resetAndroidZoom: () => void;
};

export function CanvasInfoOverlay(props: CanvasInfoOverlayProps) {
  const {
    elements, selectedElementId, isAngleGroupElement, getAngleGroupBaseId, getAngleGroupGeometry,
    canvasLayout, scaleRef, getAngleGroupElementIds, addToHistory, setSelectedElementId, canvasRef,
    protractorCanvasSnapshot, setProtractorCenter, setProtractorRefEnd, setProtractorAngleEnd,
    setShowProtractorHint, setShowProtractor, t, projectId, photoEditMode, zoomMode, scale,
    resetAndroidZoom,
  } = props;
  return (
    <>
      {/* Info overlay - mit eigenem Responder damit Buttons funktionieren */}
      <View 
        style={styles.infoOverlay}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => false}
        onResponderTerminationRequest={() => false}
      >
        <Text testID="sketch-element-count" style={styles.infoText}>Elemente: {elements.length}</Text>
        {selectedElementId && <Text style={styles.infoText}>Ausgewählt</Text>}
        {/* "Winkel anpassen" Button wenn ein Winkel-Element ausgewählt ist */}
        {selectedElementId && isAngleGroupElement(selectedElementId) && (
          <TouchableOpacity 
            style={{
              backgroundColor: '#FF5722',
              borderRadius: 20,
              paddingHorizontal: 14,
              paddingVertical: 8,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              marginTop: 4,
            }}
            onPress={() => {
              const baseId = getAngleGroupBaseId(selectedElementId);
              const geo = getAngleGroupGeometry(baseId);
              if (geo && canvasLayout) {
                // Canvas → Screen-Koordinaten (berücksichtigt Zoom)
                const currentScale = scaleRef.current || 1;
                
                // Frische Canvas-Position messen für genaue Umrechnung
                const doConvert = (freshLayout: { x: number; y: number; width: number; height: number }) => {
                  // Canvas → Screen: screenX = canvasX * scale + layout.x
                  // (layout.x enthält bereits Scroll-Position via measureInWindow)
                  const cx = geo.cx * currentScale + freshLayout.x;
                  const cy = geo.cy * currentScale + freshLayout.y;
                  // Linienlängen in Bildschirm-Koordinaten skalieren
                  const screenRefLength = geo.refLength * currentScale;
                  const screenAngleLength = geo.anglLineLength * currentScale;
                  const refEndX = cx + screenRefLength * Math.cos(geo.refAngleRad);
                  const refEndY = cy + screenRefLength * Math.sin(geo.refAngleRad);
                  const angleEndX = cx + screenAngleLength * Math.cos(geo.angleLineRad);
                  const angleEndY = cy + screenAngleLength * Math.sin(geo.angleLineRad);
                  
                  // Alte Elemente entfernen
                  const groupIds = getAngleGroupElementIds(baseId);
                  const newElements = elements.filter(el => !groupIds.includes(el.id));
                  addToHistory(newElements);
                  setSelectedElementId(null);
                  
                  // Canvas-Snapshot erstellen bevor Protractor-Overlay geöffnet wird
                  if (canvasRef.current) {
                    captureRef(canvasRef.current, {
                      format: 'png',
                      quality: 0.8,
                      result: 'data-uri',
                    }).then((uri: string) => {
                      protractorCanvasSnapshot.current = uri;
                    }).catch(() => {
                      protractorCanvasSnapshot.current = null;
                    });
                  }
                  
                  // Winkelmesser mit den Positionen öffnen
                  setProtractorCenter({ x: cx, y: cy });
                  setProtractorRefEnd({ x: refEndX, y: refEndY });
                  setProtractorAngleEnd({ x: angleEndX, y: angleEndY });
                  setShowProtractorHint(false); // Kein Hinweis beim Bearbeiten
                  setShowProtractor(true);
                };
                
                // Frische Messung wenn möglich, sonst canvasLayout verwenden
                if (canvasRef.current && Platform.OS !== 'web' && typeof (canvasRef.current as any).measureInWindow === 'function') {
                  (canvasRef.current as any).measureInWindow((x: number, y: number, w: number, h: number) => {
                    doConvert({ x, y, width: w, height: h });
                  });
                } else {
                  doConvert(canvasLayout);
                }
              }
            }}
          >
            <Ionicons name="pencil" size={16} color="#fff" />
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>{t('sketches.adjustAngle')}</Text>
          </TouchableOpacity>
        )}
        {/* "Zu Projektfotos hinzufügen" Button wenn ein Bild-Element ausgewählt ist */}
        {selectedElementId && elements.find(el => el.id === selectedElementId)?.type === 'image' && elements.find(el => el.id === selectedElementId)?.data?.uri && (
          <TouchableOpacity 
            style={{
              backgroundColor: '#1976d2',
              borderRadius: 20,
              paddingHorizontal: 14,
              paddingVertical: 8,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              marginTop: 4,
            }}
            onPress={async () => {
              try {
                const selEl = elements.find(el => el.id === selectedElementId);
                console.log('[FOTO-KOPIE] Start - projectId:', projectId, 'selectedId:', selectedElementId, 'type:', selEl?.type);
                
                if (!projectId) {
                  Alert.alert(t('common.error'), t('sketches.noProjectAssigned'));
                  return;
                }
                if (!selEl?.data?.uri) {
                  Alert.alert(t('common.error'), t('sketches.noImageAvailable'));
                  return;
                }
                
                const imageUri = selEl.data.uri;
                console.log('[FOTO-KOPIE] URI Länge:', imageUri.length, 'Prefix:', imageUri.substring(0, 30));
                
                const newPhoto = await PhotoService.create({
                  project_id: projectId,
                  uri: imageUri,
                  image_data: imageUri,
                  description: `Aus Skizze übernommen (${new Date().toLocaleDateString('de-DE')})`,
                });
                console.log('[FOTO-KOPIE] Erfolgreich! Photo-ID:', newPhoto.id);
                Alert.alert(t('common.saved'), t('sketches.photoSaved'));
              } catch (err: any) {
                console.error('[FOTO-KOPIE] Fehler:', err?.message || err);
                Alert.alert(t('common.error'), `${t('sketches.photoSaveError')}: ${err?.message || t('sketches.unknownError')}`);
              }
            }}
          >
            <Ionicons name="images-outline" size={16} color="#fff" />
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>{t('sketches.toProjectPhotos')}</Text>
          </TouchableOpacity>
        )}
        {photoEditMode && (
          <View style={styles.photoEditBadge}>
            <Ionicons name="image-outline" size={14} color="#fff" />
            <Text style={styles.photoEditBadgeText}>{t('sketches.photoMode')}</Text>
          </View>
        )}
        {zoomMode && (
          <View style={[styles.photoEditBadge, { backgroundColor: '#FF9800', flexDirection: 'row', alignItems: 'center', gap: 6 }]}>
            <Ionicons name="search-outline" size={14} color="#fff" />
            <Text style={styles.photoEditBadgeText}>Zoom {Math.round(scale * 100)}%</Text>
            {Platform.OS === 'android' && scale > 1.05 && (
              <TouchableOpacity onPress={resetAndroidZoom} style={{ marginLeft: 4, backgroundColor: 'rgba(255,255,255,0.3)', borderRadius: 10, paddingHorizontal: 6, paddingVertical: 2 }}>
                <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700' }}>Reset</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>
    </>
  );
}

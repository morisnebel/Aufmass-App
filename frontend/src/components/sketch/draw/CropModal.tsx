import type { PanResponderInstance } from 'react-native';
import type { TFunction } from 'i18next';
import React from 'react';
import { View, Text, TouchableOpacity, Modal, Image as RNImage } from 'react-native';
import { styles } from '../../../styles/sketchDrawStyles';
import Ionicons from '@react-native-vector-icons/ionicons';


export type CropModalProps = {
  showCropModal: boolean;
  t: TFunction<"translation", undefined>;
  cropContainerRef: React.RefObject<View | null>;
  cropPanResponder: PanResponderInstance;
  cropImageUri: string | null;
  cropBox: { x: number; y: number; width: number; height: number; };
  cancelCrop: () => void;
  applyCrop: () => Promise<void>;
};

export function CropModal(props: CropModalProps) {
  const {
    showCropModal, t, cropContainerRef, cropPanResponder, cropImageUri, cropBox, cancelCrop,
    applyCrop,
  } = props;
  return (
    <>
      {/* Crop Modal */}
      <Modal visible={showCropModal} transparent animationType="fade">
        <View style={styles.cropModalOverlay}>
          <View style={styles.cropModalContent}>
            <Text style={styles.cropModalTitle}>{t('sketches.cropPhoto')}</Text>
            <Text style={styles.cropModalSubtitle}>{t('sketches.cropSubtitle')}</Text>
            
            <View 
              ref={cropContainerRef}
              style={styles.cropImageContainer}
              {...cropPanResponder.panHandlers}
            >
              {cropImageUri && (
                <RNImage
                  source={{ uri: cropImageUri }}
                  style={styles.cropImage}
                  resizeMode="contain"
                  pointerEvents="none"
                />
              )}
              
              {/* Dunkle Overlay außerhalb der Crop-Box */}
              <View style={[styles.cropOverlay, styles.cropOverlayTop, { height: cropBox.y }]} pointerEvents="none" />
              <View style={[styles.cropOverlay, styles.cropOverlayBottom, { top: cropBox.y + cropBox.height, height: 300 - cropBox.y - cropBox.height }]} pointerEvents="none" />
              <View style={[styles.cropOverlay, styles.cropOverlayLeft, { top: cropBox.y, height: cropBox.height, width: cropBox.x }]} pointerEvents="none" />
              <View style={[styles.cropOverlay, styles.cropOverlayRight, { top: cropBox.y, height: cropBox.height, left: cropBox.x + cropBox.width, width: 300 - cropBox.x - cropBox.width }]} pointerEvents="none" />
              
              {/* Crop Box Rahmen */}
              <View 
                style={[
                  styles.cropBox,
                  {
                    left: cropBox.x,
                    top: cropBox.y,
                    width: cropBox.width,
                    height: cropBox.height,
                  }
                ]}
                pointerEvents="none"
              >
                {/* Ecken-Handles */}
                <View style={[styles.cropHandle, styles.cropHandleTopLeft]} />
                <View style={[styles.cropHandle, styles.cropHandleTopRight]} />
                <View style={[styles.cropHandle, styles.cropHandleBottomLeft]} />
                <View style={[styles.cropHandle, styles.cropHandleBottomRight]} />
              </View>
            </View>
            
            <View style={styles.cropButtonRow}>
              <TouchableOpacity style={styles.cropCancelButton} onPress={cancelCrop}>
                <Ionicons name="close" size={20} color="#fff" />
                <Text style={styles.cropButtonText}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.cropApplyButton} onPress={applyCrop}>
                <Ionicons name="checkmark" size={20} color="#fff" />
                <Text style={styles.cropButtonText}>{t('sketches.applyBtn')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

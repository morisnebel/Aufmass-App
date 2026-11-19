import type { TFunction } from 'i18next';
import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, Modal, Image as RNImage } from 'react-native';
import { styles } from '../../../styles/sketchDrawStyles';
import Ionicons from '@react-native-vector-icons/ionicons';


export type ProjectPhotosModalProps = {
  showProjectPhotosModal: boolean;
  t: TFunction<"translation", undefined>;
  setShowProjectPhotosModal: React.Dispatch<React.SetStateAction<boolean>>;
  projectPhotos: any[];
  insertProjectPhoto: (photo: any) => void;
};

export function ProjectPhotosModal(props: ProjectPhotosModalProps) {
  const {
    showProjectPhotosModal, t, setShowProjectPhotosModal, projectPhotos, insertProjectPhoto,
  } = props;
  return (
    <>
      {/* Projektfotos Modal */}
      <Modal visible={showProjectPhotosModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxHeight: '80%', width: '95%' }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <Text style={styles.modalTitle}>{t('sketches.selectProjectPhotos')}</Text>
              <TouchableOpacity onPress={() => setShowProjectPhotosModal(false)}>
                <Ionicons name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>
            
            {projectPhotos.length === 0 ? (
              <View style={{ padding: 40, alignItems: 'center' }}>
                <Ionicons name="images-outline" size={48} color="#ccc" />
                <Text style={{ marginTop: 16, color: '#666', textAlign: 'center' }}>
                  {t('sketches.noProjectPhotos')}
                </Text>
                <Text style={{ marginTop: 8, color: '#999', fontSize: 12, textAlign: 'center' }}>
                  {t('sketches.addPhotosHint')}
                </Text>
              </View>
            ) : (
              <ScrollView style={{ maxHeight: 400 }}>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {projectPhotos.map((photo, index) => (
                    <TouchableOpacity
                      key={photo.id || index}
                      style={{
                        width: '31%',
                        aspectRatio: 1,
                        borderRadius: 8,
                        overflow: 'hidden',
                        backgroundColor: '#f0f0f0',
                        borderWidth: 2,
                        borderColor: '#e0e0e0',
                      }}
                      onPress={() => insertProjectPhoto(photo)}
                    >
                      {(photo.image_data || photo.uri) ? (
                        <RNImage
                          source={{ uri: photo.image_data || photo.uri }}
                          style={{ width: '100%', height: '100%' }}
                          resizeMode="stretch"
                        />
                      ) : (
                        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                          <Ionicons name="image-outline" size={32} color="#ccc" />
                        </View>
                      )}
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
            )}
            
            <View style={[styles.modalButtons, { marginTop: 16 }]}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => setShowProjectPhotosModal(false)}
              >
                <Text style={styles.cancelButtonText}>{t('common.cancel')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

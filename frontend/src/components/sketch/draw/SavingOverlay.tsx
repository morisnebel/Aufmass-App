import React from 'react';
import { View, Text, ActivityIndicator } from 'react-native';


export type SavingOverlayProps = {
  isSaving: boolean;
};

export function SavingOverlay(props: SavingOverlayProps) {
  const {
    isSaving,
  } = props;
  return (
    <>
      {/* Speicher-Overlay - blockiert Interaktion während des Speicherns */}
      {isSaving && (
        <View style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 9999,
        }}>
          <View style={{
            backgroundColor: '#fff',
            padding: 30,
            borderRadius: 16,
            alignItems: 'center',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.3,
            shadowRadius: 8,
          }}>
            <ActivityIndicator size="large" color="#1976d2" />
            <Text style={{ marginTop: 16, fontSize: 18, fontWeight: '600', color: '#333' }}>
              Skizze wird gespeichert...
            </Text>
            <Text style={{ marginTop: 8, fontSize: 14, color: '#666' }}>
              Bitte warten
            </Text>
          </View>
        </View>
      )}
    </>
  );
}

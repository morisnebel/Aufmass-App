import React, { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet, Text } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function NewSketchScreen() {
  const router = useRouter();
  const { projectId } = useLocalSearchParams();

  useEffect(() => {
    // Direkt zur leeren Skizze navigieren
    // Alle Optionen (Foto, Galerie, Projektfotos) sind jetzt in der Skizzen-Toolbar verfügbar
    router.replace(`/sketches/draw?projectId=${projectId}`);
  }, [projectId]);

  // Kurzer Ladebildschirm während der Navigation
  return (
    <SafeAreaView style={styles.container}>
      <ActivityIndicator size="large" color="#1976d2" />
      <Text style={styles.loadingText}>Skizze wird erstellt...</Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666',
  },
});

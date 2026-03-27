import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Alert,
  Image,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTranslation } from 'react-i18next';

const IMAGEMETER_STORAGE_KEY = 'aufmassprofi_imagemeter_photos';

interface ImageMeterPhoto {
  id: string;
  imageUri: string;
  name: string;
  projectId?: string;
  measurements: any[];
  referenceScale?: number;
  createdAt: string;
  updatedAt: string;
}

export default function ImageMeterIndexScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const [photos, setPhotos] = useState<ImageMeterPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadPhotos = async () => {
    try {
      const data = await AsyncStorage.getItem(IMAGEMETER_STORAGE_KEY);
      if (data) {
        const parsed = JSON.parse(data);
        // Sortiere nach Datum (neueste zuerst)
        parsed.sort((a: ImageMeterPhoto, b: ImageMeterPhoto) => 
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        );
        setPhotos(parsed);
      }
    } catch (error) {
      console.error('Error loading imagemeter photos:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadPhotos();
    }, [])
  );

  const onRefresh = () => {
    setRefreshing(true);
    loadPhotos();
  };

  const deletePhoto = async (id: string) => {
    Alert.alert(
      t('imagemeter.deletePhoto'),
      t('imagemeter.deletePhotoConfirm'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              const newPhotos = photos.filter(p => p.id !== id);
              await AsyncStorage.setItem(IMAGEMETER_STORAGE_KEY, JSON.stringify(newPhotos));
              setPhotos(newPhotos);
            } catch (error) {
              console.error('Error deleting photo:', error);
              Alert.alert(t('common.error'), 'Foto konnte nicht gelöscht werden');
            }
          },
        },
      ]
    );
  };

  const renderPhoto = ({ item }: { item: ImageMeterPhoto }) => (
    <TouchableOpacity
      style={styles.photoCard}
      onPress={() => router.push(`/imagemeter/measure?id=${item.id}`)}
    >
      <Image source={{ uri: item.imageUri }} style={styles.thumbnail} />
      <View style={styles.photoInfo}>
        <Text style={styles.photoName} numberOfLines={1}>{item.name || 'Unbenannt'}</Text>
        <Text style={styles.photoMeta}>
          {item.measurements?.length || 0} Messungen
        </Text>
        <Text style={styles.photoDate}>
          {new Date(item.updatedAt).toLocaleDateString('de-DE', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })}
        </Text>
        {item.referenceScale && (
          <View style={styles.scaleBadge}>
            <Ionicons name="resize" size={12} color="#4CAF50" />
            <Text style={styles.scaleBadgeText}>Kalibriert</Text>
          </View>
        )}
      </View>
      <TouchableOpacity
        style={styles.deleteButton}
        onPress={() => deletePhoto(item.id)}
      >
        <Ionicons name="trash-outline" size={22} color="#f44336" />
      </TouchableOpacity>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#1976d2" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <View style={styles.headerTitleContainer}>
          <Ionicons name="camera" size={24} color="#fff" />
          <Text style={styles.headerTitle}>Fotomessung</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      {/* Info Banner */}
      <View style={styles.infoBanner}>
        <Ionicons name="information-circle" size={20} color="#1976d2" />
        <Text style={styles.infoBannerText}>
          Messen Sie direkt auf Fotos. Setzen Sie ein Referenzmaß für automatische Berechnungen.
        </Text>
      </View>

      {/* New Photo Button */}
      <TouchableOpacity
        style={styles.newPhotoButton}
        onPress={() => router.push('/imagemeter/new')}
      >
        <Ionicons name="add-circle" size={24} color="#fff" />
        <Text style={styles.newPhotoButtonText}>Neues Foto aufnehmen</Text>
      </TouchableOpacity>

      {/* Photo List */}
      {photos.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="images-outline" size={64} color="#ccc" />
          <Text style={styles.emptyTitle}>Keine Fotos vorhanden</Text>
          <Text style={styles.emptySubtitle}>
            Nehmen Sie ein Foto auf, um mit dem Messen zu beginnen
          </Text>
        </View>
      ) : (
        <FlatList
          data={photos}
          renderItem={renderPhoto}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1976d2',
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  backButton: {
    padding: 4,
  },
  headerTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e3f2fd',
    padding: 12,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#bbdefb',
  },
  infoBannerText: {
    flex: 1,
    fontSize: 13,
    color: '#1565c0',
    lineHeight: 18,
  },
  newPhotoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4CAF50',
    marginHorizontal: 16,
    marginVertical: 12,
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  newPhotoButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  listContent: {
    padding: 16,
    paddingTop: 4,
  },
  photoCard: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 12,
    marginBottom: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  thumbnail: {
    width: 100,
    height: 100,
    backgroundColor: '#e0e0e0',
  },
  photoInfo: {
    flex: 1,
    padding: 12,
    justifyContent: 'center',
  },
  photoName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  photoMeta: {
    fontSize: 13,
    color: '#666',
    marginBottom: 2,
  },
  photoDate: {
    fontSize: 12,
    color: '#999',
  },
  scaleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e8f5e9',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    alignSelf: 'flex-start',
    marginTop: 4,
    gap: 4,
  },
  scaleBadgeText: {
    fontSize: 11,
    color: '#4CAF50',
    fontWeight: '500',
  },
  deleteButton: {
    padding: 16,
    justifyContent: 'center',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#666',
    marginTop: 16,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#999',
    marginTop: 8,
    textAlign: 'center',
  },
});

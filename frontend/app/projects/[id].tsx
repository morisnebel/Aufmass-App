import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Image,
  Share,
  Linking,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import Constants from 'expo-constants';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';

const API_URL = Constants.expoConfig?.extra?.EXPO_PUBLIC_BACKEND_URL || process.env.EXPO_PUBLIC_BACKEND_URL;

interface Project {
  id: string;
  name: string;
  description?: string;
  customer_id: string;
  status: string;
}

interface Customer {
  id: string;
  name: string;
  email?: string;
  phone?: string;
}

interface Roof {
  id: string;
  roof_type: string;
  area: number;
  measurements: any;
  notes?: string;
}

interface Photo {
  id: string;
  image_data: string;
  description?: string;
}

interface Sketch {
  id: string;
  sketch_data: string;
  title?: string;
}

interface Checklist {
  id: string;
  template_name: string;
  items: Array<{ text: string; checked: boolean }>;
}

export default function ProjectDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const [project, setProject] = useState<Project | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [roofs, setRoofs] = useState<Roof[]>([]);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [sketches, setSketches] = useState<Sketch[]>([]);
  const [checklists, setChecklists] = useState<Checklist[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'roofs' | 'photos' | 'sketches' | 'checklists'>('overview');

  useEffect(() => {
    loadProjectData();
  }, [id]);

  const loadProjectData = async () => {
    try {
      const [projectRes, roofsRes, photosRes, sketchesRes, checklistsRes] = await Promise.all([
        axios.get(`${API_URL}/api/projects/${id}`),
        axios.get(`${API_URL}/api/roofs/project/${id}`),
        axios.get(`${API_URL}/api/photos/project/${id}`),
        axios.get(`${API_URL}/api/sketches/project/${id}`),
        axios.get(`${API_URL}/api/checklists/project/${id}`),
      ]);

      setProject(projectRes.data);
      setRoofs(roofsRes.data);
      setPhotos(photosRes.data);
      setSketches(sketchesRes.data);
      setChecklists(checklistsRes.data);

      if (projectRes.data.customer_id) {
        const customerRes = await axios.get(`${API_URL}/api/customers/${projectRes.data.customer_id}`);
        setCustomer(customerRes.data);
      }
    } catch (error) {
      console.error('Error loading project:', error);
      Alert.alert('Fehler', 'Projekt konnte nicht geladen werden');
    } finally {
      setLoading(false);
    }
  };

  const exportToPDF = async () => {
    try {
      Alert.alert('PDF Export', 'PDF wird erstellt...');
      const response = await axios.get(`${API_URL}/api/export/pdf/${id}`);
      
      const fileUri = `${FileSystem.documentDirectory}${response.data.filename}`;
      await FileSystem.writeAsStringAsync(fileUri, response.data.pdf_data, {
        encoding: FileSystem.EncodingType.Base64,
      });

      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(fileUri);
      } else {
        Alert.alert('Erfolg', 'PDF wurde erstellt und gespeichert');
      }
    } catch (error) {
      console.error('Error exporting PDF:', error);
      Alert.alert('Fehler', 'PDF konnte nicht erstellt werden');
    }
  };

  const sendEmail = () => {
    if (customer?.email) {
      const subject = `Aufmaß: ${project?.name}`;
      const body = `Sehr geehrte/r ${customer.name},\n\nanbei das Aufmaß für das Projekt "${project?.name}".`;
      Linking.openURL(`mailto:${customer.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`);
    } else {
      Alert.alert('Fehler', 'Keine E-Mail-Adresse für diesen Kunden vorhanden');
    }
  };

  const shareProject = async () => {
    try {
      const totalArea = roofs.reduce((sum, roof) => sum + roof.area, 0);
      const message = `Projekt: ${project?.name}\nKunde: ${customer?.name}\nDachflächen: ${roofs.length}\nGesamtfläche: ${totalArea.toFixed(2)} m²`;
      
      await Share.share({
        message,
        title: project?.name,
      });
    } catch (error) {
      console.error('Error sharing:', error);
    }
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#1976d2" />
      </View>
    );
  }

  if (!project) {
    return (
      <View style={styles.centerContainer}>
        <Text>Projekt nicht gefunden</Text>
      </View>
    );
  }

  const totalArea = roofs.reduce((sum, roof) => sum + roof.area, 0);

  return (
    <View style={styles.container}>
      {/* Action Bar */}
      <View style={styles.actionBar}>
        <TouchableOpacity style={styles.actionButton} onPress={exportToPDF}>
          <Ionicons name="document-text" size={20} color="#1976d2" />
          <Text style={styles.actionButtonText}>PDF</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionButton} onPress={sendEmail}>
          <Ionicons name="mail" size={20} color="#1976d2" />
          <Text style={styles.actionButtonText}>E-Mail</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionButton} onPress={shareProject}>
          <Ionicons name="share-social" size={20} color="#1976d2" />
          <Text style={styles.actionButtonText}>Teilen</Text>
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'overview' && styles.tabActive]}
          onPress={() => setActiveTab('overview')}
        >
          <Text style={[styles.tabText, activeTab === 'overview' && styles.tabTextActive]}>
            Übersicht
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'roofs' && styles.tabActive]}
          onPress={() => setActiveTab('roofs')}
        >
          <Text style={[styles.tabText, activeTab === 'roofs' && styles.tabTextActive]}>
            Dächer ({roofs.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'photos' && styles.tabActive]}
          onPress={() => setActiveTab('photos')}
        >
          <Text style={[styles.tabText, activeTab === 'photos' && styles.tabTextActive]}>
            Fotos ({photos.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'sketches' && styles.tabActive]}
          onPress={() => setActiveTab('sketches')}
        >
          <Text style={[styles.tabText, activeTab === 'sketches' && styles.tabTextActive]}>
            Skizzen ({sketches.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'checklists' && styles.tabActive]}
          onPress={() => setActiveTab('checklists')}
        >
          <Text style={[styles.tabText, activeTab === 'checklists' && styles.tabTextActive]}>
            Listen ({checklists.length})
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content}>
        {activeTab === 'overview' && (
          <View style={styles.overviewSection}>
            <View style={styles.infoCard}>
              <Text style={styles.cardTitle}>Projektinformationen</Text>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Name:</Text>
                <Text style={styles.infoValue}>{project.name}</Text>
              </View>
              {project.description && (
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Beschreibung:</Text>
                  <Text style={styles.infoValue}>{project.description}</Text>
                </View>
              )}
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Status:</Text>
                <Text style={styles.infoValue}>{project.status}</Text>
              </View>
            </View>

            {customer && (
              <View style={styles.infoCard}>
                <Text style={styles.cardTitle}>Kundendaten</Text>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Name:</Text>
                  <Text style={styles.infoValue}>{customer.name}</Text>
                </View>
                {customer.email && (
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>E-Mail:</Text>
                    <Text style={styles.infoValue}>{customer.email}</Text>
                  </View>
                )}
                {customer.phone && (
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>Telefon:</Text>
                    <Text style={styles.infoValue}>{customer.phone}</Text>
                  </View>
                )}
              </View>
            )}

            <View style={styles.statsCard}>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{roofs.length}</Text>
                <Text style={styles.statLabel}>Dachflächen</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{totalArea.toFixed(2)} m²</Text>
                <Text style={styles.statLabel}>Gesamtfläche</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{photos.length}</Text>
                <Text style={styles.statLabel}>Fotos</Text>
              </View>
            </View>
          </View>
        )}

        {activeTab === 'roofs' && (
          <View>
            <TouchableOpacity
              style={styles.addButton}
              onPress={() => router.push(`/roofs/new?projectId=${id}`)}
            >
              <Ionicons name="add-circle" size={24} color="#1976d2" />
              <Text style={styles.addButtonText}>Neue Dachmessung</Text>
            </TouchableOpacity>

            {roofs.map((roof) => (
              <TouchableOpacity
                key={roof.id}
                style={styles.itemCard}
                onPress={() => router.push(`/roofs/${roof.id}`)}
              >
                <View style={styles.itemHeader}>
                  <Ionicons name="home" size={24} color="#1976d2" />
                  <Text style={styles.itemTitle}>{roof.roof_type}</Text>
                  <Ionicons name="create-outline" size={20} color="#1976d2" />
                </View>
                <Text style={styles.itemDetail}>Fläche: {roof.area.toFixed(2)} m²</Text>
                {roof.notes && (
                  <Text style={styles.itemNotes}>{roof.notes}</Text>
                )}
              </TouchableOpacity>
            ))}
          </View>
        )}

        {activeTab === 'photos' && (
          <View>
            <TouchableOpacity
              style={styles.addButton}
              onPress={() => router.push(`/photos/new?projectId=${id}`)}
            >
              <Ionicons name="add-circle" size={24} color="#1976d2" />
              <Text style={styles.addButtonText}>Foto hinzufügen</Text>
            </TouchableOpacity>

            <View style={styles.photoGrid}>
              {photos.map((photo) => (
                <View
                  key={photo.id}
                  style={styles.photoItem}
                >
                  <Image
                    source={{ uri: photo.image_data }}
                    style={styles.photoImage}
                    resizeMode="cover"
                  />
                  {photo.description && (
                    <Text style={styles.photoDescription} numberOfLines={2}>
                      {photo.description}
                    </Text>
                  )}
                </View>
              ))}
            </View>
          </View>
        )}

        {activeTab === 'sketches' && (
          <View>
            <TouchableOpacity
              style={styles.addButton}
              onPress={() => router.push(`/sketches/draw?projectId=${id}`)}
            >
              <Ionicons name="add-circle" size={24} color="#1976d2" />
              <Text style={styles.addButtonText}>Neue Skizze</Text>
            </TouchableOpacity>

            {sketches.map((sketch) => (
              <View key={sketch.id} style={styles.itemCard}>
                {sketch.title && (
                  <Text style={styles.itemTitle}>{sketch.title}</Text>
                )}
                <Image
                  source={{ uri: sketch.sketch_data }}
                  style={styles.sketchImage}
                  resizeMode="contain"
                />
              </View>
            ))}
          </View>
        )}

        {activeTab === 'checklists' && (
          <View>
            <TouchableOpacity
              style={styles.addButton}
              onPress={() => router.push(`/checklists/new?projectId=${id}`)}
            >
              <Ionicons name="add-circle" size={24} color="#1976d2" />
              <Text style={styles.addButtonText}>Neue Checkliste</Text>
            </TouchableOpacity>

            {checklists.map((checklist) => (
              <TouchableOpacity
                key={checklist.id}
                style={styles.itemCard}
                onPress={() => router.push(`/checklists/${checklist.id}`)}
              >
                <View style={styles.itemHeader}>
                  <Text style={styles.itemTitle}>{checklist.template_name}</Text>
                  <Ionicons name="create-outline" size={20} color="#1976d2" />
                </View>
                {checklist.items.slice(0, 3).map((item, index) => (
                  <View key={index} style={styles.checklistItem}>
                    <Ionicons
                      name={item.checked ? 'checkbox' : 'square-outline'}
                      size={20}
                      color={item.checked ? '#4caf50' : '#666'}
                    />
                    <Text style={styles.checklistText}>{item.text}</Text>
                  </View>
                ))}
                {checklist.items.length > 3 && (
                  <Text style={styles.moreItemsText}>
                    + {checklist.items.length - 3} weitere Punkte
                  </Text>
                )}
              </TouchableOpacity>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
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
  actionBar: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    padding: 12,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#e3f2fd',
    padding: 12,
    borderRadius: 8,
    gap: 6,
  },
  actionButtonText: {
    color: '#1976d2',
    fontSize: 14,
    fontWeight: '600',
  },
  tabs: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: '#1976d2',
  },
  tabText: {
    fontSize: 12,
    color: '#666',
    fontWeight: '500',
  },
  tabTextActive: {
    color: '#1976d2',
    fontWeight: '600',
  },
  content: {
    flex: 1,
  },
  overviewSection: {
    padding: 16,
  },
  infoCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
  },
  infoRow: {
    marginBottom: 8,
  },
  infoLabel: {
    fontSize: 14,
    color: '#666',
    marginBottom: 2,
  },
  infoValue: {
    fontSize: 16,
    color: '#333',
    fontWeight: '500',
  },
  statsCard: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1976d2',
  },
  statLabel: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    margin: 16,
    padding: 16,
    borderRadius: 12,
    gap: 8,
    borderWidth: 2,
    borderColor: '#1976d2',
    borderStyle: 'dashed',
  },
  addButtonText: {
    color: '#1976d2',
    fontSize: 16,
    fontWeight: '600',
  },
  itemCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  itemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 8,
  },
  itemTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  itemDetail: {
    fontSize: 16,
    color: '#666',
    marginTop: 4,
  },
  itemNotes: {
    fontSize: 14,
    color: '#999',
    marginTop: 8,
    fontStyle: 'italic',
  },
  photoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 8,
  },
  photoItem: {
    width: '48%',
    margin: '1%',
    backgroundColor: '#fff',
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  photoImage: {
    width: '100%',
    height: 150,
  },
  photoDescription: {
    padding: 8,
    fontSize: 12,
    color: '#666',
  },
  sketchImage: {
    width: '100%',
    height: 200,
    marginTop: 8,
  },
  checklistItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    gap: 8,
  },
  checklistText: {
    fontSize: 14,
    color: '#333',
    flex: 1,
  },
  moreItemsText: {
    fontSize: 12,
    color: '#1976d2',
    fontStyle: 'italic',
    marginTop: 8,
  },
});

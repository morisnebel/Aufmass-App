import React, { useState, useEffect, useCallback } from 'react';
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
  Platform,
  Modal,
  TextInput,
  KeyboardAvoidingView,
} from 'react-native';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import Constants from 'expo-constants';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { SvgXml } from 'react-native-svg';

const API_URL = Constants.expoConfig?.extra?.EXPO_PUBLIC_BACKEND_URL || process.env.EXPO_PUBLIC_BACKEND_URL;

interface Project {
  id: string;
  name: string;
  description?: string;
  customer_id: string;
  status: string;
  remarks?: string;  // Zusätzliche Bemerkungen
}

interface Customer {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
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
  metadata?: string;
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
  const [activeTab, setActiveTab] = useState<'overview' | 'roofs' | 'photos' | 'sketches' | 'checklists' | 'remarks'>('overview');
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [photoToDelete, setPhotoToDelete] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteSketchModalVisible, setDeleteSketchModalVisible] = useState(false);
  const [sketchToDelete, setSketchToDelete] = useState<string | null>(null);
  const [isDeletingSketch, setIsDeletingSketch] = useState(false);
  
  // Remarks state
  const [remarks, setRemarks] = useState('');
  const [isSavingRemarks, setIsSavingRemarks] = useState(false);
  
  // Project edit modal state
  const [showEditProjectModal, setShowEditProjectModal] = useState(false);
  const [editProjectName, setEditProjectName] = useState('');
  const [editProjectDescription, setEditProjectDescription] = useState('');
  const [editProjectStatus, setEditProjectStatus] = useState('');
  const [isSavingProject, setIsSavingProject] = useState(false);

  // Use useFocusEffect to reload data when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      loadProjectData();
    }, [id])
  );

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
      setRemarks(projectRes.data.remarks || '');

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

  const handleDeletePhoto = async () => {
    if (!photoToDelete || isDeleting) return;
    
    setIsDeleting(true);
    
    try {
      await axios.delete(`${API_URL}/api/photos/${photoToDelete}`);
      
      // Close modal and reset state
      setDeleteModalVisible(false);
      setPhotoToDelete(null);
      
      // Reload data
      await loadProjectData();
      
      if (Platform.OS === 'web') {
        alert('Foto wurde gelöscht');
      } else {
        Alert.alert('Erfolg', 'Foto wurde gelöscht');
      }
    } catch (error: any) {
      console.error('Error deleting photo:', error);
      
      // Only show error if it's not a 404 (photo already deleted)
      if (error?.response?.status !== 404) {
        if (Platform.OS === 'web') {
          alert('Fehler: Foto konnte nicht gelöscht werden');
        } else {
          Alert.alert('Fehler', 'Foto konnte nicht gelöscht werden');
        }
      } else {
        // Photo was already deleted, just close modal and reload
        setDeleteModalVisible(false);
        setPhotoToDelete(null);
        await loadProjectData();
      }
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDeleteSketch = async () => {
    if (!sketchToDelete || isDeletingSketch) return;
    
    setIsDeletingSketch(true);
    
    try {
      await axios.delete(`${API_URL}/api/sketches/${sketchToDelete}`);
      
      // Close modal and reset state
      setDeleteSketchModalVisible(false);
      setSketchToDelete(null);
      
      // Reload data
      await loadProjectData();
      
      if (Platform.OS === 'web') {
        alert('Skizze wurde gelöscht');
      } else {
        Alert.alert('Erfolg', 'Skizze wurde gelöscht');
      }
    } catch (error: any) {
      console.error('Error deleting sketch:', error);
      
      // Only show error if it's not a 404 (sketch already deleted)
      if (error?.response?.status !== 404) {
        if (Platform.OS === 'web') {
          alert('Fehler: Skizze konnte nicht gelöscht werden');
        } else {
          Alert.alert('Fehler', 'Skizze konnte nicht gelöscht werden');
        }
      } else {
        // Sketch was already deleted, just close modal and reload
        setDeleteSketchModalVisible(false);
        setSketchToDelete(null);
        await loadProjectData();
      }
    } finally {
      setIsDeletingSketch(false);
    }
  };

  // Open edit project modal with current values
  const openEditProjectModal = () => {
    if (project) {
      setEditProjectName(project.name);
      setEditProjectDescription(project.description || '');
      setEditProjectStatus(project.status);
      setShowEditProjectModal(true);
    }
  };

  // Save project changes
  const handleSaveProject = async () => {
    if (!editProjectName.trim()) {
      if (Platform.OS === 'web') {
        alert('Bitte geben Sie einen Projektnamen ein');
      } else {
        Alert.alert('Fehler', 'Bitte geben Sie einen Projektnamen ein');
      }
      return;
    }

    setIsSavingProject(true);
    try {
      await axios.put(`${API_URL}/api/projects/${id}`, {
        name: editProjectName,
        description: editProjectDescription || undefined,
        status: editProjectStatus,
        customer_id: project?.customer_id,
      });

      setShowEditProjectModal(false);
      await loadProjectData();

      if (Platform.OS === 'web') {
        alert('Projekt wurde aktualisiert');
      } else {
        Alert.alert('Erfolg', 'Projekt wurde aktualisiert');
      }
    } catch (error) {
      console.error('Error updating project:', error);
      if (Platform.OS === 'web') {
        alert('Fehler: Projekt konnte nicht aktualisiert werden');
      } else {
        Alert.alert('Fehler', 'Projekt konnte nicht aktualisiert werden');
      }
    } finally {
      setIsSavingProject(false);
    }
  };

  const exportToPDF = async () => {
    try {
      Alert.alert('PDF Export', 'PDF wird erstellt...');
      
      const response = await axios.get(`${API_URL}/api/export/pdf/${id}`);
      
      if (!response.data || !response.data.pdf_data) {
        throw new Error('Keine PDF-Daten erhalten');
      }
      
      const filename = response.data.filename || 'Aufmass.pdf';
      
      // Use new File API
      const file = new File(Paths.cache, filename);
      
      // Decode base64 and write to file
      const binaryString = atob(response.data.pdf_data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      
      await file.write(bytes);

      // Check if sharing is available
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(file.uri, {
          mimeType: 'application/pdf',
          dialogTitle: 'PDF teilen',
          UTI: 'com.adobe.pdf',
        });
      } else {
        Alert.alert('Erfolg', `PDF wurde erstellt: ${filename}`);
      }
    } catch (error) {
      console.error('Error exporting PDF:', error);
      Alert.alert('Fehler', 'PDF konnte nicht erstellt werden. Bitte versuchen Sie es erneut.');
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
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>Projektinformationen</Text>
                <TouchableOpacity
                  style={styles.editButton}
                  onPress={openEditProjectModal}
                >
                  <Ionicons name="create-outline" size={20} color="#1976d2" />
                  <Text style={styles.editButtonText}>Bearbeiten</Text>
                </TouchableOpacity>
              </View>
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
                <View style={styles.cardHeader}>
                  <Text style={styles.cardTitle}>Kundendaten</Text>
                  <TouchableOpacity
                    style={styles.editButton}
                    onPress={() => router.push(`/customers/${customer.id}`)}
                  >
                    <Ionicons name="create-outline" size={20} color="#1976d2" />
                    <Text style={styles.editButtonText}>Bearbeiten</Text>
                  </TouchableOpacity>
                </View>
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
                {customer.address && (
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>Adresse:</Text>
                    <Text style={styles.infoValue}>{customer.address}</Text>
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
                <View key={photo.id} style={styles.photoItem}>
                  <TouchableOpacity
                    onPress={() => router.push(`/photos/annotate?photoId=${photo.id}&projectId=${id}`)}
                    style={{ flex: 1 }}
                  >
                    <Image
                      source={{ uri: photo.image_data }}
                      style={styles.photoImage}
                      resizeMode="contain"
                    />
                    {photo.description && (
                      <Text style={styles.photoDescription} numberOfLines={2}>
                        {photo.description}
                      </Text>
                    )}
                  </TouchableOpacity>
                  
                  {/* Edit Icon - Top Right */}
                  <View style={styles.photoEditOverlay}>
                    <Ionicons name="create-outline" size={20} color="#fff" />
                  </View>
                  
                  {/* Delete Button - Bottom Right */}
                  <TouchableOpacity
                    style={styles.photoDeleteButton}
                    onPress={() => {
                      setPhotoToDelete(photo.id);
                      setDeleteModalVisible(true);
                    }}
                  >
                    <Ionicons name="trash" size={20} color="#fff" />
                  </TouchableOpacity>
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

            {sketches.map((sketch) => {
              // Extract SVG XML from base64 data URI if it's an SVG
              const getSvgXml = (dataUri: string): string | null => {
                if (!dataUri) return null;
                
                // Check if it's an SVG data URI
                if (dataUri.startsWith('data:image/svg+xml;base64,')) {
                  try {
                    const base64Part = dataUri.replace('data:image/svg+xml;base64,', '');
                    // Decode base64 to SVG string
                    const svgString = decodeURIComponent(escape(atob(base64Part)));
                    return svgString;
                  } catch (e) {
                    console.log('Error decoding SVG:', e);
                    return null;
                  }
                }
                return null;
              };

              const svgXml = getSvgXml(sketch.sketch_data);
              const isRegularImage = sketch.sketch_data && !sketch.sketch_data.startsWith('data:image/svg+xml');

              return (
                <View key={sketch.id} style={styles.itemCard}>
                  <TouchableOpacity
                    onPress={() => router.push(`/sketches/draw?projectId=${id}&sketchId=${sketch.id}`)}
                    style={{ flex: 1 }}
                  >
                    <View style={styles.itemHeader}>
                      {sketch.title && (
                        <Text style={styles.itemTitle}>{sketch.title}</Text>
                      )}
                      <Ionicons name="create-outline" size={20} color="#1976d2" />
                    </View>
                    
                    {/* Render SVG preview */}
                    {svgXml && (
                      <View style={styles.sketchPreviewContainer}>
                        <SvgXml
                          xml={svgXml}
                          width="100%"
                          height={250}
                          preserveAspectRatio="xMidYMid meet"
                        />
                      </View>
                    )}
                    
                    {/* Render regular image (e.g., background photo) */}
                    {isRegularImage && (
                      <Image
                        source={{ uri: sketch.sketch_data }}
                        style={styles.sketchImage}
                        resizeMode="contain"
                      />
                    )}
                    
                    {/* Show placeholder if no preview available */}
                    {!svgXml && !isRegularImage && (
                      <View style={styles.sketchPlaceholder}>
                        <Ionicons name="create-outline" size={40} color="#ccc" />
                        <Text style={styles.sketchPlaceholderText}>Skizze</Text>
                      </View>
                    )}
                    
                    {sketch.metadata && (() => {
                      try {
                        const metadata = JSON.parse(sketch.metadata);
                        const elementCount = metadata.elements?.length || 0;
                        return (
                          <Text style={styles.sketchInfo}>
                            {elementCount} Element{elementCount !== 1 ? 'e' : ''}
                          </Text>
                        );
                      } catch (e) {
                        return null;
                      }
                    })()}
                  </TouchableOpacity>
                  
                  {/* Delete Button */}
                  <TouchableOpacity
                    style={styles.sketchDeleteButton}
                    onPress={() => {
                      setSketchToDelete(sketch.id);
                      setDeleteSketchModalVisible(true);
                    }}
                  >
                    <Ionicons name="trash" size={20} color="#fff" />
                  </TouchableOpacity>
                </View>
              );
            })}
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

      {/* Delete Confirmation Modal */}
      <Modal
        visible={deleteModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setDeleteModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Foto löschen</Text>
            <Text style={styles.modalMessage}>
              Möchten Sie dieses Foto wirklich löschen?
            </Text>
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => {
                  setDeleteModalVisible(false);
                  setPhotoToDelete(null);
                }}
              >
                <Text style={styles.cancelButtonText}>Abbrechen</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.deleteButton]}
                onPress={handleDeletePhoto}
                disabled={isDeleting}
              >
                <Text style={styles.deleteButtonText}>
                  {isDeleting ? 'Wird gelöscht...' : 'Löschen'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Delete Sketch Confirmation Modal */}
      <Modal
        visible={deleteSketchModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setDeleteSketchModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Skizze löschen</Text>
            <Text style={styles.modalMessage}>
              Möchten Sie diese Skizze wirklich löschen?
            </Text>
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => {
                  setDeleteSketchModalVisible(false);
                  setSketchToDelete(null);
                }}
              >
                <Text style={styles.cancelButtonText}>Abbrechen</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.deleteButton]}
                onPress={handleDeleteSketch}
                disabled={isDeletingSketch}
              >
                <Text style={styles.deleteButtonText}>
                  {isDeletingSketch ? 'Wird gelöscht...' : 'Löschen'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Edit Project Modal */}
      <Modal
        visible={showEditProjectModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowEditProjectModal(false)}
      >
        <KeyboardAvoidingView 
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={styles.editModalContent}>
            <Text style={styles.modalTitle}>Projekt bearbeiten</Text>
            
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Projektname *</Text>
              <TextInput
                style={styles.textInput}
                value={editProjectName}
                onChangeText={setEditProjectName}
                placeholder="Projektname"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Beschreibung</Text>
              <TextInput
                style={[styles.textInput, styles.textArea]}
                value={editProjectDescription}
                onChangeText={setEditProjectDescription}
                placeholder="Beschreibung (optional)"
                multiline
                numberOfLines={3}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Status</Text>
              <View style={styles.statusButtons}>
                {['active', 'completed', 'cancelled'].map((status) => (
                  <TouchableOpacity
                    key={status}
                    style={[
                      styles.statusButton,
                      editProjectStatus === status && styles.statusButtonActive,
                    ]}
                    onPress={() => setEditProjectStatus(status)}
                  >
                    <Text style={[
                      styles.statusButtonText,
                      editProjectStatus === status && styles.statusButtonTextActive,
                    ]}>
                      {status === 'active' ? 'Aktiv' : status === 'completed' ? 'Abgeschlossen' : 'Abgebrochen'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => setShowEditProjectModal(false)}
              >
                <Text style={styles.cancelButtonText}>Abbrechen</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.saveButton]}
                onPress={handleSaveProject}
                disabled={isSavingProject}
              >
                <Text style={styles.saveButtonText}>
                  {isSavingProject ? 'Wird gespeichert...' : 'Speichern'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
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
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
    backgroundColor: '#e3f2fd',
    borderRadius: 6,
    gap: 4,
  },
  editButtonText: {
    color: '#1976d2',
    fontSize: 14,
    fontWeight: '500',
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
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    minHeight: 200,
  },
  photoImage: {
    width: '100%',
    height: 200,
    backgroundColor: '#f5f5f5',
  },
  photoDescription: {
    padding: 8,
    fontSize: 12,
    color: '#666',
  },
  photoEditOverlay: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(25, 118, 210, 0.9)',
    borderRadius: 20,
    padding: 8,
    zIndex: 10,
  },
  photoDeleteButton: {
    position: 'absolute',
    bottom: 48,
    right: 8,
    backgroundColor: 'rgba(244, 67, 54, 0.9)',
    borderRadius: 20,
    padding: 8,
    zIndex: 10,
  },
  sketchImage: {
    width: '100%',
    height: 250,
    marginTop: 8,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
  },
  sketchPreviewContainer: {
    width: '100%',
    height: 250,
    marginTop: 8,
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sketchPlaceholder: {
    width: '100%',
    height: 150,
    marginTop: 8,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sketchPlaceholderText: {
    marginTop: 8,
    fontSize: 14,
    color: '#999',
  },
  sketchInfo: {
    fontSize: 12,
    color: '#666',
    marginTop: 8,
    fontStyle: 'italic',
  },
  sketchDeleteButton: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    backgroundColor: 'rgba(244, 67, 54, 0.9)',
    borderRadius: 20,
    padding: 8,
    zIndex: 10,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 24,
    width: '80%',
    maxWidth: 400,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
  },
  modalMessage: {
    fontSize: 16,
    color: '#666',
    marginBottom: 24,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  modalButton: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: '#e0e0e0',
  },
  cancelButtonText: {
    color: '#333',
    fontSize: 16,
    fontWeight: '600',
  },
  deleteButton: {
    backgroundColor: '#f44336',
  },
  deleteButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
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
  editModalContent: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 24,
    width: '90%',
    maxWidth: 500,
    maxHeight: '80%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  textInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#fafafa',
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  statusButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  statusButton: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    alignItems: 'center',
    backgroundColor: '#fafafa',
  },
  statusButtonActive: {
    borderColor: '#1976d2',
    backgroundColor: '#e3f2fd',
  },
  statusButtonText: {
    fontSize: 12,
    color: '#666',
    fontWeight: '500',
  },
  statusButtonTextActive: {
    color: '#1976d2',
    fontWeight: '600',
  },
  saveButton: {
    backgroundColor: '#1976d2',
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});

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
import { ProjectService, CustomerService, RoofService, PhotoService, SketchService, ChecklistService } from '../../services/LocalStorage';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { SvgXml } from 'react-native-svg';

// API_URL removed - using local storage now

interface Project {
  id: string;
  name: string;
  description?: string;
  customer_id: string;
  status: string;
  remarks?: string;
  // Bauherr-Daten (separate Felder)
  bauherr_name?: string;
  bauherr_phone?: string;
  bauherr_mobile?: string;
  bauherr_email?: string;
  bauherr_street?: string;
  bauherr_plz?: string;
  bauherr_city?: string;
  // Objektadresse (separate Felder)
  objekt_name?: string;
  objekt_street?: string;
  objekt_plz?: string;
  objekt_city?: string;
}

interface Customer {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  mobile?: string;
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

interface SubItem {
  text: string;
  checked: boolean;
}

interface ChecklistItem {
  text: string;
  checked: boolean;
  note?: string;
  subItems?: SubItem[];
}

interface Checklist {
  id: string;
  template_name: string;
  items: ChecklistItem[];
}

export default function ProjectDetailScreen() {
  const router = useRouter();
  const { id, tab } = useLocalSearchParams();
  const [project, setProject] = useState<Project | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [roofs, setRoofs] = useState<Roof[]>([]);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [sketches, setSketches] = useState<Sketch[]>([]);
  const [checklists, setChecklists] = useState<Checklist[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Determine initial tab from URL parameter
  const initialTab = (tab === 'sketches' || tab === 'roofs' || tab === 'photos' || tab === 'checklists' || tab === 'remarks') ? tab : 'overview';
  const [activeTab, setActiveTab] = useState<'overview' | 'roofs' | 'photos' | 'sketches' | 'checklists' | 'remarks'>(initialTab);
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [photoToDelete, setPhotoToDelete] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteSketchModalVisible, setDeleteSketchModalVisible] = useState(false);
  const [sketchToDelete, setSketchToDelete] = useState<string | null>(null);
  const [isDeletingSketch, setIsDeletingSketch] = useState(false);
  
  // Checklist delete state
  const [deleteChecklistModalVisible, setDeleteChecklistModalVisible] = useState(false);
  const [checklistToDelete, setChecklistToDelete] = useState<string | null>(null);
  const [isDeletingChecklist, setIsDeletingChecklist] = useState(false);
  
  // Remarks state
  const [remarks, setRemarks] = useState('');
  const [isSavingRemarks, setIsSavingRemarks] = useState(false);
  
  // Project edit modal state
  const [showEditProjectModal, setShowEditProjectModal] = useState(false);
  const [editProjectName, setEditProjectName] = useState('');
  const [editProjectDescription, setEditProjectDescription] = useState('');
  const [editProjectStatus, setEditProjectStatus] = useState('');
  // Bauherr edit fields (separate)
  const [editBauherrName, setEditBauherrName] = useState('');
  const [editBauherrPhone, setEditBauherrPhone] = useState('');
  const [editBauherrMobile, setEditBauherrMobile] = useState('');
  const [editBauherrEmail, setEditBauherrEmail] = useState('');
  const [editBauherrStreet, setEditBauherrStreet] = useState('');
  const [editBauherrPlz, setEditBauherrPlz] = useState('');
  const [editBauherrCity, setEditBauherrCity] = useState('');
  // Objektadresse edit fields (separate)
  const [editObjektName, setEditObjektName] = useState('');
  const [editObjektStreet, setEditObjektStreet] = useState('');
  const [editObjektPlz, setEditObjektPlz] = useState('');
  const [editObjektCity, setEditObjektCity] = useState('');
  const [isSavingProject, setIsSavingProject] = useState(false);

  // Helper to parse address from customer
  const parseCustomerAddress = (address: string | undefined) => {
    if (!address) return { street: '', plz: '', city: '' };
    const parts = address.split(',');
    const street = parts[0]?.trim() || '';
    const cityParts = parts[1]?.trim().split(' ') || [];
    const plz = cityParts[0] || '';
    const city = cityParts.slice(1).join(' ') || '';
    return { street, plz, city };
  };

  // Update active tab when URL parameter changes (e.g., when navigating back from sketch editor)
  useEffect(() => {
    if (tab === 'sketches' || tab === 'roofs' || tab === 'photos' || tab === 'checklists' || tab === 'remarks') {
      setActiveTab(tab);
    }
  }, [tab]);

  // Use useFocusEffect to reload data when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      loadProjectData();
    }, [id])
  );

  const loadProjectData = async () => {
    try {
      const projectId = Array.isArray(id) ? id[0] : id;
      const [projectData, roofsData, photosData, sketchesData, checklistsData] = await Promise.all([
        ProjectService.getById(projectId),
        RoofService.getByProjectId(projectId),
        PhotoService.getByProjectId(projectId),
        SketchService.getByProjectId(projectId),
        ChecklistService.getByProjectId(projectId),
      ]);

      if (projectData) {
        setProject(projectData);
        setRemarks(projectData.remarks || '');
        
        if (projectData.customer_id) {
          const customerData = await CustomerService.getById(projectData.customer_id);
          if (customerData) {
            setCustomer(customerData);
          }
        }
      }
      
      setRoofs(roofsData);
      setPhotos(photosData);
      setSketches(sketchesData);
      setChecklists(checklistsData);
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
      await PhotoService.delete(photoToDelete);
      
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
      await SketchService.delete(sketchToDelete);
      
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
      
      if (Platform.OS === 'web') {
        alert('Fehler: Skizze konnte nicht gelöscht werden');
      } else {
        Alert.alert('Fehler', 'Skizze konnte nicht gelöscht werden');
      }
    } finally {
      setIsDeletingSketch(false);
    }
  };

  const handleDeleteChecklist = async () => {
    if (!checklistToDelete || isDeletingChecklist) return;
    
    setIsDeletingChecklist(true);
    
    try {
      await ChecklistService.delete(checklistToDelete);
      
      // Close modal and reset state
      setDeleteChecklistModalVisible(false);
      setChecklistToDelete(null);
      
      // Reload data
      await loadProjectData();
      
      if (Platform.OS === 'web') {
        alert('Checkliste wurde gelöscht');
      } else {
        Alert.alert('Erfolg', 'Checkliste wurde gelöscht');
      }
    } catch (error: any) {
      console.error('Error deleting checklist:', error);
      
      if (Platform.OS === 'web') {
        alert('Fehler: Checkliste konnte nicht gelöscht werden');
      } else {
        Alert.alert('Fehler', 'Checkliste konnte nicht gelöscht werden');
      }
    } finally {
      setIsDeletingChecklist(false);
    }
  };

  // Open edit project modal with current values
  const openEditProjectModal = () => {
    if (project) {
      setEditProjectName(project.name);
      setEditProjectDescription(project.description || '');
      setEditProjectStatus(project.status);
      
      // Parse customer address as fallback
      const customerAddr = parseCustomerAddress(customer?.address);
      
      // Bauherr data - use project-specific or fall back to customer
      setEditBauherrName(project.bauherr_name || customer?.name || '');
      setEditBauherrPhone(project.bauherr_phone || customer?.phone || '');
      setEditBauherrMobile(project.bauherr_mobile || customer?.mobile || '');
      setEditBauherrEmail(project.bauherr_email || customer?.email || '');
      setEditBauherrStreet(project.bauherr_street || customerAddr.street || '');
      setEditBauherrPlz(project.bauherr_plz || customerAddr.plz || '');
      setEditBauherrCity(project.bauherr_city || customerAddr.city || '');
      
      // Objektadresse - leave empty if not set (will use bauherr as default)
      setEditObjektName(project.objekt_name || '');
      setEditObjektStreet(project.objekt_street || '');
      setEditObjektPlz(project.objekt_plz || '');
      setEditObjektCity(project.objekt_city || '');
      
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
      const projectId = Array.isArray(id) ? id[0] : id;
      await ProjectService.update(projectId, {
        name: editProjectName,
        description: editProjectDescription || undefined,
        status: editProjectStatus,
        customer_id: project?.customer_id,
        // Bauherr data (separate fields)
        bauherr_name: editBauherrName || undefined,
        bauherr_phone: editBauherrPhone || undefined,
        bauherr_mobile: editBauherrMobile || undefined,
        bauherr_email: editBauherrEmail || undefined,
        bauherr_street: editBauherrStreet || undefined,
        bauherr_plz: editBauherrPlz || undefined,
        bauherr_city: editBauherrCity || undefined,
        // Objektadresse (separate fields)
        objekt_name: editObjektName || undefined,
        objekt_street: editObjektStreet || undefined,
        objekt_plz: editObjektPlz || undefined,
        objekt_city: editObjektCity || undefined,
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
    // PDF Export is currently disabled in offline mode
    Alert.alert(
      'PDF Export',
      'PDF Export ist in der Offline-Version derzeit nicht verfügbar. Diese Funktion wird in einem zukünftigen Update hinzugefügt.',
      [{ text: 'OK' }]
    );
  };

  // Keep the old function signature for future implementation
  const exportToPDFLegacy = async () => {
    try {
      Alert.alert('PDF Export', 'PDF wird erstellt...');
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

  const sendEmail = async () => {
    // Generate PDF first, then share via native share dialog
    try {
      Alert.alert(
        'PDF erstellen und teilen',
        'Möchten Sie das Aufmaß-PDF erstellen und per E-Mail teilen?',
        [
          { text: 'Abbrechen', style: 'cancel' },
          {
            text: 'PDF erstellen',
            onPress: async () => {
              try {
                // Generate PDF
                const response = await axios.get(`${API_URL}/api/export/pdf/${id}`, {
                  responseType: 'json',
                });

                const filename = `Aufmass_${project?.name?.replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`;
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
                    dialogTitle: 'Aufmaß-PDF per E-Mail senden',
                    UTI: 'com.adobe.pdf',
                  });
                } else {
                  // Fallback: Open basic email without attachment
                  if (customer?.email) {
                    const subject = `Aufmaß: ${project?.name}`;
                    const body = `Sehr geehrte/r ${customer.name},\n\nanbei das Aufmaß für das Projekt "${project?.name}".\n\nMit freundlichen Grüßen`;
                    Linking.openURL(`mailto:${customer.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`);
                    Alert.alert('Hinweis', 'PDF wurde erstellt, aber kann auf diesem Gerät nicht direkt angehängt werden. Bitte teilen Sie das PDF manuell.');
                  } else {
                    Alert.alert('Erfolg', `PDF wurde erstellt: ${filename}`);
                  }
                }
              } catch (error) {
                console.error('Error generating PDF for email:', error);
                Alert.alert('Fehler', 'PDF konnte nicht erstellt werden. Bitte versuchen Sie es erneut.');
              }
            },
          },
        ]
      );
    } catch (error) {
      console.error('Error in sendEmail:', error);
      Alert.alert('Fehler', 'Ein unerwarteter Fehler ist aufgetreten');
    }
  };

  const shareProject = async () => {
    // Share project with PDF attachment via native share dialog
    try {
      Alert.alert(
        'Projekt teilen',
        'Möchten Sie das Aufmaß-PDF erstellen und teilen?',
        [
          { 
            text: 'Nur Text', 
            onPress: async () => {
              try {
                const totalArea = roofs.reduce((sum, roof) => sum + roof.area, 0);
                const message = `Projekt: ${project?.name}\nKunde: ${customer?.name}\nDachflächen: ${roofs.length}\nGesamtfläche: ${totalArea.toFixed(2)} m²`;
                
                await Share.share({
                  message,
                  title: project?.name,
                });
              } catch (error) {
                console.error('Error sharing text:', error);
              }
            }
          },
          {
            text: 'Mit PDF',
            onPress: async () => {
              try {
                // Generate PDF
                const response = await axios.get(`${API_URL}/api/export/pdf/${id}`, {
                  responseType: 'json',
                });

                const filename = `Aufmass_${project?.name?.replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`;
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
                    dialogTitle: 'Aufmaß-PDF teilen',
                    UTI: 'com.adobe.pdf',
                  });
                } else {
                  Alert.alert('Fehler', 'Teilen ist auf diesem Gerät nicht verfügbar');
                }
              } catch (error) {
                console.error('Error sharing PDF:', error);
                Alert.alert('Fehler', 'PDF konnte nicht erstellt werden');
              }
            },
          },
          { text: 'Abbrechen', style: 'cancel' },
        ]
      );
    } catch (error) {
      console.error('Error in shareProject:', error);
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
        <TouchableOpacity
          style={[styles.tab, activeTab === 'remarks' && styles.tabActive]}
          onPress={() => setActiveTab('remarks')}
        >
          <Text style={[styles.tabText, activeTab === 'remarks' && styles.tabTextActive]}>
            Sonstiges
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
                <Text style={styles.infoLabel}>Projekt:</Text>
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
                <View style={[styles.statusBadge, { backgroundColor: project.status === 'active' ? '#4caf50' : project.status === 'completed' ? '#2196f3' : '#ff9800' }]}>
                  <Text style={styles.statusBadgeText}>
                    {project.status === 'active' ? 'Aktiv' : project.status === 'completed' ? 'Abgeschlossen' : 'Abgebrochen'}
                  </Text>
                </View>
              </View>
              
              {/* Bauherr-Daten */}
              <View style={styles.sectionDivider} />
              <Text style={styles.subSectionTitle}>Bauherr</Text>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Name:</Text>
                <Text style={styles.infoValue}>{project?.bauherr_name || customer?.name || '-'}</Text>
              </View>
              {(project?.bauherr_phone || customer?.phone) && (
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Telefon:</Text>
                  <Text style={styles.infoValue}>{project?.bauherr_phone || customer?.phone}</Text>
                </View>
              )}
              {(project?.bauherr_email || customer?.email) && (
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>E-Mail:</Text>
                  <Text style={styles.infoValue}>{project?.bauherr_email || customer?.email}</Text>
                </View>
              )}
              {/* Bauherr-Adresse (separate Felder) */}
              {(project?.bauherr_street || customer?.address) && (
                <>
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>Straße:</Text>
                    <Text style={styles.infoValue}>
                      {project?.bauherr_street || parseCustomerAddress(customer?.address).street || '-'}
                    </Text>
                  </View>
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>PLZ / Ort:</Text>
                    <Text style={styles.infoValue}>
                      {project?.bauherr_plz || parseCustomerAddress(customer?.address).plz || ''} {project?.bauherr_city || parseCustomerAddress(customer?.address).city || ''}
                    </Text>
                  </View>
                </>
              )}
              
              {/* Objektadresse (separate Felder) */}
              {(project?.objekt_street || project?.objekt_plz || project?.objekt_city) && (
                <>
                  <View style={styles.sectionDivider} />
                  <Text style={styles.subSectionTitle}>Objektadresse</Text>
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>Straße:</Text>
                    <Text style={styles.infoValue}>{project.objekt_street || '-'}</Text>
                  </View>
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>PLZ / Ort:</Text>
                    <Text style={styles.infoValue}>{project.objekt_plz || ''} {project.objekt_city || ''}</Text>
                  </View>
                </>
              )}
            </View>

            {/* Statistik-Karte */}
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
              onPress={() => router.push(`/sketches/new?projectId=${id}`)}
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

              // Generate SVG from metadata elements (includes polylines)
              const generateSvgFromMetadata = (metadataStr: string): string | null => {
                try {
                  const metadata = JSON.parse(metadataStr);
                  const elements = metadata.elements || [];
                  if (elements.length === 0) return null;

                  // Calculate bounds
                  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
                  let hasValidBounds = false;

                  elements.forEach((el: any) => {
                    if (el.type === 'path' && typeof el.data === 'string') {
                      const matches = el.data.match(/(-?\d+\.?\d*)/g);
                      if (matches) {
                        for (let i = 0; i < matches.length; i += 2) {
                          const x = parseFloat(matches[i]);
                          const y = parseFloat(matches[i + 1]);
                          if (!isNaN(x) && !isNaN(y)) {
                            minX = Math.min(minX, x); maxX = Math.max(maxX, x);
                            minY = Math.min(minY, y); maxY = Math.max(maxY, y);
                            hasValidBounds = true;
                          }
                        }
                      }
                    } else if (el.type === 'line' || el.type === 'arrow' || el.type === 'pointer') {
                      minX = Math.min(minX, el.data.x1, el.data.x2);
                      maxX = Math.max(maxX, el.data.x1, el.data.x2);
                      minY = Math.min(minY, el.data.y1, el.data.y2);
                      maxY = Math.max(maxY, el.data.y1, el.data.y2);
                      hasValidBounds = true;
                    } else if (el.type === 'circle') {
                      minX = Math.min(minX, el.data.cx - el.data.r);
                      maxX = Math.max(maxX, el.data.cx + el.data.r);
                      minY = Math.min(minY, el.data.cy - el.data.r);
                      maxY = Math.max(maxY, el.data.cy + el.data.r);
                      hasValidBounds = true;
                    } else if (el.type === 'rect') {
                      minX = Math.min(minX, el.data.x);
                      maxX = Math.max(maxX, el.data.x + el.data.width);
                      minY = Math.min(minY, el.data.y);
                      maxY = Math.max(maxY, el.data.y + el.data.height);
                      hasValidBounds = true;
                    } else if (el.type === 'polyline' && el.data?.points) {
                      el.data.points.forEach((pt: { x: number; y: number }) => {
                        minX = Math.min(minX, pt.x); maxX = Math.max(maxX, pt.x);
                        minY = Math.min(minY, pt.y); maxY = Math.max(maxY, pt.y);
                      });
                      hasValidBounds = true;
                    } else if (el.type === 'image' || el.type === 'text') {
                      const x = el.x || 0; const y = el.y || 0;
                      const w = el.width || 50; const h = el.height || 50;
                      minX = Math.min(minX, x); maxX = Math.max(maxX, x + w);
                      minY = Math.min(minY, y); maxY = Math.max(maxY, y + h);
                      hasValidBounds = true;
                    }
                  });

                  if (!hasValidBounds) return null;

                  // Add padding and calculate scale
                  const padding = 20;
                  minX -= padding; minY -= padding; maxX += padding; maxY += padding;
                  const drawWidth = maxX - minX || 200;
                  const drawHeight = maxY - minY || 200;
                  const previewSize = 300;
                  const scale = Math.min(previewSize / drawWidth, previewSize / drawHeight, 1);
                  const scaledWidth = drawWidth * scale;
                  const scaledHeight = drawHeight * scale;
                  const offsetX = (previewSize - scaledWidth) / 2;
                  const offsetY = (previewSize - scaledHeight) / 2;

                  // Generate SVG elements
                  let svgElements = '';
                  elements.forEach((el: any) => {
                    const strokeWidth = Math.max(1, (el.strokeWidth || 2) * scale);
                    const color = el.color || '#000000';

                    if (el.type === 'path' && typeof el.data === 'string') {
                      const scaledPath = el.data.replace(/([ML])\s*(-?\d+\.?\d*)\s+(-?\d+\.?\d*)/g,
                        (_: string, cmd: string, xStr: string, yStr: string) => {
                          const x = ((parseFloat(xStr) - minX) * scale) + offsetX;
                          const y = ((parseFloat(yStr) - minY) * scale) + offsetY;
                          return `${cmd} ${x.toFixed(1)} ${y.toFixed(1)}`;
                        });
                      svgElements += `<path d="${scaledPath}" stroke="${color}" stroke-width="${strokeWidth}" fill="none" stroke-linecap="round"/>`;
                    } else if (el.type === 'line') {
                      const x1 = ((el.data.x1 - minX) * scale) + offsetX;
                      const y1 = ((el.data.y1 - minY) * scale) + offsetY;
                      const x2 = ((el.data.x2 - minX) * scale) + offsetX;
                      const y2 = ((el.data.y2 - minY) * scale) + offsetY;
                      svgElements += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${color}" stroke-width="${strokeWidth}"/>`;
                    } else if (el.type === 'circle') {
                      const cx = ((el.data.cx - minX) * scale) + offsetX;
                      const cy = ((el.data.cy - minY) * scale) + offsetY;
                      const r = Math.max(2, el.data.r * scale);
                      svgElements += `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${r.toFixed(1)}" stroke="${color}" stroke-width="${strokeWidth}" fill="none"/>`;
                    } else if (el.type === 'rect') {
                      const x = ((el.data.x - minX) * scale) + offsetX;
                      const y = ((el.data.y - minY) * scale) + offsetY;
                      const w = Math.max(2, el.data.width * scale);
                      const h = Math.max(2, el.data.height * scale);
                      svgElements += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" stroke="${color}" stroke-width="${strokeWidth}" fill="none"/>`;
                    } else if (el.type === 'polyline' && el.data?.points && el.data.points.length >= 2) {
                      const points = el.data.points as { x: number; y: number }[];
                      const isClosed = el.data.closed || false;
                      let pathData = points.map((pt, idx) => {
                        const x = ((pt.x - minX) * scale) + offsetX;
                        const y = ((pt.y - minY) * scale) + offsetY;
                        return `${idx === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
                      }).join(' ');
                      if (isClosed) pathData += ' Z';
                      svgElements += `<path d="${pathData}" stroke="${color}" stroke-width="${strokeWidth}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
                    } else if (el.type === 'arrow') {
                      const x1 = ((el.data.x1 - minX) * scale) + offsetX;
                      const y1 = ((el.data.y1 - minY) * scale) + offsetY;
                      const x2 = ((el.data.x2 - minX) * scale) + offsetX;
                      const y2 = ((el.data.y2 - minY) * scale) + offsetY;
                      const angle = Math.atan2(y2 - y1, x2 - x1);
                      const arrowSize = 8;
                      const endX1 = x2 - arrowSize * Math.cos(angle - Math.PI / 6);
                      const endY1 = y2 - arrowSize * Math.sin(angle - Math.PI / 6);
                      const endX2 = x2 - arrowSize * Math.cos(angle + Math.PI / 6);
                      const endY2 = y2 - arrowSize * Math.sin(angle + Math.PI / 6);
                      svgElements += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${color}" stroke-width="${strokeWidth}"/>`;
                      svgElements += `<polygon points="${x2.toFixed(1)},${y2.toFixed(1)} ${endX1.toFixed(1)},${endY1.toFixed(1)} ${endX2.toFixed(1)},${endY2.toFixed(1)}" fill="${color}"/>`;
                      if (el.data.text) {
                        const midX = (x1 + x2) / 2;
                        const midY = (y1 + y2) / 2 - 8;
                        svgElements += `<text x="${midX.toFixed(1)}" y="${midY.toFixed(1)}" text-anchor="middle" font-size="10" fill="${color}">${el.data.text}</text>`;
                      }
                    } else if (el.type === 'text' && el.data?.text) {
                      const x = ((el.x || 0) - minX) * scale + offsetX;
                      const y = ((el.y || 0) - minY) * scale + offsetY;
                      svgElements += `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" font-size="12" fill="${color}" font-weight="bold">${el.data.text}</text>`;
                    } else if (el.type === 'image' && el.data?.uri) {
                      // Bilder in der Vorschau anzeigen
                      const x = (((el.x || 0) - minX) * scale) + offsetX;
                      const y = (((el.y || 0) - minY) * scale) + offsetY;
                      const w = Math.max(10, (el.width || 100) * scale);
                      const h = Math.max(10, (el.height || 100) * scale);
                      svgElements += `<image href="${el.data.uri}" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" preserveAspectRatio="xMidYMid meet"/>`;
                    } else if (el.type === 'pointer') {
                      // Memo-Pfeil / Zeigepfeil in der Vorschau
                      const x1 = ((el.data.x1 - minX) * scale) + offsetX;
                      const y1 = ((el.data.y1 - minY) * scale) + offsetY;
                      const x2 = ((el.data.x2 - minX) * scale) + offsetX;
                      const y2 = ((el.data.y2 - minY) * scale) + offsetY;
                      const angle = Math.atan2(y2 - y1, x2 - x1);
                      const arrowHeadSize = Math.max(12, strokeWidth * 3);
                      const arrowHeadAngle = Math.PI / 6;
                      
                      // Pfeilspitzen-Koordinaten
                      const leftX = x2 - arrowHeadSize * Math.cos(angle - arrowHeadAngle);
                      const leftY = y2 - arrowHeadSize * Math.sin(angle - arrowHeadAngle);
                      const rightX = x2 - arrowHeadSize * Math.cos(angle + arrowHeadAngle);
                      const rightY = y2 - arrowHeadSize * Math.sin(angle + arrowHeadAngle);
                      
                      // Linie bis kurz vor der Pfeilspitze
                      const lineEndX = x2 - arrowHeadSize * 0.6 * Math.cos(angle);
                      const lineEndY = y2 - arrowHeadSize * 0.6 * Math.sin(angle);
                      
                      svgElements += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${lineEndX.toFixed(1)}" y2="${lineEndY.toFixed(1)}" stroke="${color}" stroke-width="${strokeWidth}" stroke-linecap="round"/>`;
                      svgElements += `<polygon points="${x2.toFixed(1)},${y2.toFixed(1)} ${leftX.toFixed(1)},${leftY.toFixed(1)} ${rightX.toFixed(1)},${rightY.toFixed(1)}" fill="${color}"/>`;
                    }
                  });

                  return `<svg width="${previewSize}" height="${previewSize}" viewBox="0 0 ${previewSize} ${previewSize}" xmlns="http://www.w3.org/2000/svg"><rect width="${previewSize}" height="${previewSize}" fill="#ffffff"/>${svgElements}</svg>`;
                } catch (e) {
                  console.log('Error generating SVG from metadata:', e);
                  return null;
                }
              };

              // Try metadata first (more accurate), then fall back to saved preview
              const metadataSvg = sketch.metadata ? generateSvgFromMetadata(sketch.metadata) : null;
              const svgXml = metadataSvg || getSvgXml(sketch.sketch_data);
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

            {checklists.map((checklist) => {
              // Rekursiv alle abgehakten Items zählen
              const countCheckedItemsRecursive = (items: any[]): number => {
                let total = 0;
                items.forEach(item => {
                  if (item.checked) total += 1;
                  if (item.subItems && item.subItems.length > 0) {
                    total += countCheckedItemsRecursive(item.subItems);
                  }
                });
                return total;
              };
              
              // Rekursive Render-Funktion für abgehakte Unterpunkte in der Vorschau
              const renderCheckedSubItems = (subItems: any[], depth: number = 0): React.ReactNode => {
                return subItems
                  .filter(sub => sub.checked)
                  .map((subItem, subIndex) => (
                    <View key={`${depth}-${subIndex}`}>
                      <View style={[styles.subItemRow, { marginLeft: depth * 12 }]}>
                        <Ionicons
                          name="checkbox"
                          size={16}
                          color="#4caf50"
                        />
                        <Text style={styles.subItemText}>{subItem.text}</Text>
                      </View>
                      {/* Rekursiv tiefere abgehakte Unterpunkte anzeigen */}
                      {subItem.subItems && subItem.subItems.length > 0 && (
                        renderCheckedSubItems(subItem.subItems, depth + 1)
                      )}
                    </View>
                  ));
              };
              
              return (
                <View key={checklist.id} style={styles.checklistCardWrapper}>
                  <TouchableOpacity
                    style={[styles.itemCard, { marginHorizontal: 0 }]}
                    onPress={() => router.push(`/checklists/${checklist.id}`)}
                  >
                    <View style={styles.itemHeader}>
                      <Text style={styles.itemTitle}>{checklist.template_name}</Text>
                      <View style={styles.checkedBadge}>
                        <Text style={styles.checkedBadgeText}>
                          {countCheckedItemsRecursive(checklist.items)} benötigt
                        </Text>
                      </View>
                      <Ionicons name="create-outline" size={20} color="#1976d2" />
                    </View>
                    
                    {/* Zeige alle Items mit ihren Unterpositionen */}
                    {checklist.items.map((item, index) => (
                      <View key={index} style={styles.checklistItemContainer}>
                        {/* Hauptpunkt */}
                        <View style={styles.checklistItem}>
                          <Ionicons
                            name={item.checked ? 'checkbox' : 'square-outline'}
                            size={20}
                            color={item.checked ? '#4caf50' : '#666'}
                          />
                          <Text style={styles.checklistText}>{item.text}</Text>
                        </View>
                        
                        {/* Alle abgehakten Unterpositionen rekursiv anzeigen */}
                        {item.subItems && item.subItems.length > 0 && (
                          <View style={styles.subItemsList}>
                            {renderCheckedSubItems(item.subItems, 0)}
                          </View>
                        )}
                        
                        {/* Notiz anzeigen, falls vorhanden */}
                        {item.note && item.note.trim() !== '' && (
                          <View style={styles.noteDisplay}>
                            <Ionicons name="document-text-outline" size={14} color="#888" />
                            <Text style={styles.noteDisplayText}>{item.note}</Text>
                          </View>
                        )}
                      </View>
                    ))}
                  </TouchableOpacity>
                  
                  {/* Delete Button */}
                  <TouchableOpacity
                    style={styles.checklistDeleteButton}
                    onPress={() => {
                      setChecklistToDelete(checklist.id);
                      setDeleteChecklistModalVisible(true);
                    }}
                  >
                    <Ionicons name="trash" size={18} color="#fff" />
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>
        )}

        {activeTab === 'remarks' && (
          <View style={styles.remarksSection}>
            <View style={styles.remarksCard}>
              <View style={styles.remarksHeader}>
                <Ionicons name="document-text-outline" size={24} color="#1976d2" />
                <Text style={styles.remarksTitle}>Zusätzliche Bemerkungen</Text>
              </View>
              <Text style={styles.remarksSubtitle}>
                Hier können Sie allgemeine Notizen und Bemerkungen zum Projekt erfassen.
              </Text>
              <TextInput
                style={styles.remarksInput}
                placeholder="Bemerkungen eingeben..."
                value={remarks}
                onChangeText={setRemarks}
                multiline
                numberOfLines={10}
                textAlignVertical="top"
              />
              <TouchableOpacity
                style={[styles.saveRemarksButton, isSavingRemarks && styles.buttonDisabled]}
                onPress={async () => {
                  if (!project) return;
                  setIsSavingRemarks(true);
                  try {
                    await axios.put(`${API_URL}/api/projects/${project.id}`, {
                      customer_id: project.customer_id,
                      name: project.name,
                      description: project.description || '',
                      status: project.status,
                      remarks: remarks,
                    });
                    // Update local project state with new remarks
                    setProject({ ...project, remarks: remarks });
                    if (Platform.OS === 'web') {
                      alert('Bemerkungen wurden gespeichert');
                    } else {
                      Alert.alert('Erfolg', 'Bemerkungen wurden gespeichert');
                    }
                  } catch (error) {
                    console.error('Error saving remarks:', error);
                    if (Platform.OS === 'web') {
                      alert('Fehler beim Speichern');
                    } else {
                      Alert.alert('Fehler', 'Bemerkungen konnten nicht gespeichert werden');
                    }
                  } finally {
                    setIsSavingRemarks(false);
                  }
                }}
                disabled={isSavingRemarks}
              >
                <Ionicons name="save-outline" size={20} color="#fff" />
                <Text style={styles.saveRemarksButtonText}>
                  {isSavingRemarks ? 'Wird gespeichert...' : 'Bemerkungen speichern'}
                </Text>
              </TouchableOpacity>
            </View>
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

      {/* Delete Checklist Confirmation Modal */}
      <Modal
        visible={deleteChecklistModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setDeleteChecklistModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Checkliste löschen</Text>
            <Text style={styles.modalMessage}>
              Möchten Sie diese Checkliste wirklich löschen?
            </Text>
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => {
                  setDeleteChecklistModalVisible(false);
                  setChecklistToDelete(null);
                }}
              >
                <Text style={styles.cancelButtonText}>Abbrechen</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.deleteButton]}
                onPress={handleDeleteChecklist}
                disabled={isDeletingChecklist}
              >
                <Text style={styles.deleteButtonText}>
                  {isDeletingChecklist ? 'Wird gelöscht...' : 'Löschen'}
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
          keyboardVerticalOffset={0}
        >
          <View style={styles.editModalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Projekt bearbeiten</Text>
              <TouchableOpacity onPress={() => setShowEditProjectModal(false)}>
                <Ionicons name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>
            
            <ScrollView 
              style={styles.editModalScroll}
              contentContainerStyle={styles.editModalScrollContent}
              keyboardShouldPersistTaps="handled"
            >
              <View style={styles.editFormRow}>
                {/* Linke Spalte */}
                <View style={styles.editFormColumn}>
                  <Text style={styles.editSectionTitle}>Projekt</Text>
                  
                  <View style={styles.compactInputGroup}>
                    <Text style={styles.compactLabel}>Name *</Text>
                    <TextInput
                      style={styles.compactInput}
                      value={editProjectName}
                      onChangeText={setEditProjectName}
                      placeholder="Projektname"
                    />
                  </View>

                  <View style={styles.compactInputGroup}>
                    <Text style={styles.compactLabel}>Beschreibung</Text>
                    <TextInput
                      style={[styles.compactInput, styles.compactTextArea]}
                      value={editProjectDescription}
                      onChangeText={setEditProjectDescription}
                      placeholder="Beschreibung"
                      multiline
                      numberOfLines={2}
                    />
                  </View>

                  <View style={styles.compactInputGroup}>
                    <Text style={styles.compactLabel}>Status</Text>
                    <View style={styles.statusButtonsCompact}>
                      {['active', 'completed', 'cancelled'].map((status) => (
                        <TouchableOpacity
                          key={status}
                          style={[
                            styles.statusButtonCompact,
                            editProjectStatus === status && styles.statusButtonActiveCompact,
                          ]}
                          onPress={() => setEditProjectStatus(status)}
                        >
                          <Text style={[
                            styles.statusButtonTextCompact,
                            editProjectStatus === status && styles.statusButtonTextActiveCompact,
                          ]}>
                            {status === 'active' ? 'Aktiv' : status === 'completed' ? 'Fertig' : 'Abgebr.'}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                </View>

                {/* Rechte Spalte */}
                <View style={styles.editFormColumn}>
                  <Text style={styles.editSectionTitle}>Bauherr</Text>
                  
                  <View style={styles.compactInputGroup}>
                    <Text style={styles.compactLabel}>Name</Text>
                    <TextInput
                      style={styles.compactInput}
                      value={editBauherrName}
                      onChangeText={setEditBauherrName}
                      placeholder="Bauherr Name"
                    />
                  </View>

                  <View style={styles.addressRow}>
                    <View style={styles.cityInput}>
                      <Text style={styles.compactLabel}>Telefon</Text>
                      <TextInput
                        style={styles.compactInput}
                        value={editBauherrPhone}
                        onChangeText={setEditBauherrPhone}
                        placeholder="Festnetz"
                        keyboardType="phone-pad"
                      />
                    </View>
                    <View style={styles.cityInput}>
                      <Text style={styles.compactLabel}>Mobil</Text>
                      <TextInput
                        style={styles.compactInput}
                        value={editBauherrMobile}
                        onChangeText={setEditBauherrMobile}
                        placeholder="Handynummer"
                        keyboardType="phone-pad"
                      />
                    </View>
                  </View>

                  <View style={styles.compactInputGroup}>
                    <Text style={styles.compactLabel}>E-Mail</Text>
                    <TextInput
                      style={styles.compactInput}
                      value={editBauherrEmail}
                      onChangeText={setEditBauherrEmail}
                      placeholder="E-Mail"
                      keyboardType="email-address"
                      autoCapitalize="none"
                    />
                  </View>

                  <Text style={styles.editSectionTitle}>Bauherr-Adresse</Text>
                  
                  <View style={styles.compactInputGroup}>
                    <Text style={styles.compactLabel}>Straße</Text>
                    <TextInput
                      style={styles.compactInput}
                      value={editBauherrStreet}
                      onChangeText={setEditBauherrStreet}
                      placeholder="Straße und Hausnummer"
                    />
                  </View>

                  <View style={styles.addressRow}>
                    <View style={styles.plzInput}>
                      <Text style={styles.compactLabel}>PLZ</Text>
                      <TextInput
                        style={styles.compactInput}
                        value={editBauherrPlz}
                        onChangeText={setEditBauherrPlz}
                        placeholder="PLZ"
                        keyboardType="number-pad"
                      />
                    </View>
                    <View style={styles.cityInput}>
                      <Text style={styles.compactLabel}>Ort</Text>
                      <TextInput
                        style={styles.compactInput}
                        value={editBauherrCity}
                        onChangeText={setEditBauherrCity}
                        placeholder="Ort"
                      />
                    </View>
                  </View>

                  <Text style={styles.editSectionTitle}>Objektadresse (optional)</Text>
                  
                  <View style={styles.compactInputGroup}>
                    <Text style={styles.compactLabel}>Name</Text>
                    <TextInput
                      style={styles.compactInput}
                      value={editObjektName}
                      onChangeText={setEditObjektName}
                      placeholder="z.B. Herr Müller"
                    />
                  </View>

                  <View style={styles.compactInputGroup}>
                    <Text style={styles.compactLabel}>Straße</Text>
                    <TextInput
                      style={styles.compactInput}
                      value={editObjektStreet}
                      onChangeText={setEditObjektStreet}
                      placeholder="Falls abweichend"
                    />
                  </View>

                  <View style={styles.addressRow}>
                    <View style={styles.plzInput}>
                      <Text style={styles.compactLabel}>PLZ</Text>
                      <TextInput
                        style={styles.compactInput}
                        value={editObjektPlz}
                        onChangeText={setEditObjektPlz}
                        placeholder="PLZ"
                        keyboardType="number-pad"
                      />
                    </View>
                    <View style={styles.cityInput}>
                      <Text style={styles.compactLabel}>Ort</Text>
                      <TextInput
                        style={styles.compactInput}
                        value={editObjektCity}
                        onChangeText={setEditObjektCity}
                        placeholder="Ort"
                      />
                    </View>
                  </View>
                </View>
              </View>
            </ScrollView>

            <View style={styles.editModalButtons}>
              <TouchableOpacity
                style={[styles.editModalButton, styles.cancelButton]}
                onPress={() => setShowEditProjectModal(false)}
              >
                <Text style={styles.cancelButtonText}>Abbrechen</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.editModalButton, styles.saveButton]}
                onPress={handleSaveProject}
                disabled={isSavingProject}
              >
                <Text style={styles.saveButtonText}>
                  {isSavingProject ? 'Speichern...' : 'Speichern'}
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
  checklistItemContainer: {
    marginBottom: 4,
  },
  checklistText: {
    fontSize: 14,
    color: '#333',
    flex: 1,
  },
  subItemsList: {
    marginLeft: 28,
    paddingLeft: 12,
    borderLeftWidth: 2,
    borderLeftColor: '#e0e0e0',
  },
  subItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    gap: 6,
  },
  subItemText: {
    fontSize: 13,
    color: '#555',
    flex: 1,
  },
  checkedBadge: {
    backgroundColor: '#e8f5e9',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    marginLeft: 'auto',
    marginRight: 8,
  },
  checkedBadgeText: {
    fontSize: 12,
    color: '#4caf50',
    fontWeight: '600',
  },
  noteDisplay: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#fff8e1',
    borderRadius: 6,
    padding: 8,
    marginTop: 6,
    marginLeft: 28,
    gap: 6,
  },
  noteDisplayText: {
    flex: 1,
    fontSize: 13,
    color: '#666',
    fontStyle: 'italic',
  },
  checklistCardWrapper: {
    position: 'relative',
    marginHorizontal: 16,
    marginBottom: 12,
  },
  checklistDeleteButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(244, 67, 54, 0.9)',
    borderRadius: 16,
    padding: 6,
    zIndex: 10,
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
    padding: 16,
    width: '95%',
    maxWidth: 800,
    maxHeight: '90%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  editModalScroll: {
    maxHeight: 350,
  },
  editModalScrollContent: {
    paddingBottom: 8,
  },
  editFormRow: {
    flexDirection: 'row',
    gap: 16,
  },
  editFormColumn: {
    flex: 1,
  },
  editSectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1976d2',
    marginBottom: 10,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#e3f2fd',
  },
  compactInputGroup: {
    marginBottom: 10,
  },
  compactLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#555',
    marginBottom: 4,
  },
  compactInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 6,
    padding: 8,
    fontSize: 14,
    backgroundColor: '#fafafa',
  },
  compactTextArea: {
    minHeight: 50,
    textAlignVertical: 'top',
  },
  addressRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  plzInput: {
    flex: 1,
  },
  cityInput: {
    flex: 2,
  },
  statusButtonsCompact: {
    flexDirection: 'row',
    gap: 6,
  },
  statusButtonCompact: {
    flex: 1,
    padding: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#ddd',
    alignItems: 'center',
    backgroundColor: '#fafafa',
  },
  statusButtonActiveCompact: {
    borderColor: '#1976d2',
    backgroundColor: '#e3f2fd',
  },
  statusButtonTextCompact: {
    fontSize: 11,
    color: '#666',
    fontWeight: '500',
  },
  statusButtonTextActiveCompact: {
    color: '#1976d2',
    fontWeight: '600',
  },
  editModalButtons: {
    flexDirection: 'row',
    gap: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  editModalButton: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  sectionDivider: {
    height: 1,
    backgroundColor: '#e0e0e0',
    marginVertical: 12,
  },
  subSectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1976d2',
    marginBottom: 8,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
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
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1976d2',
    marginTop: 16,
    marginBottom: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
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
  inputHint: {
    fontSize: 12,
    color: '#888',
    marginTop: 4,
    fontStyle: 'italic',
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
  remarksSection: {
    padding: 16,
  },
  remarksCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  remarksHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  remarksTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  remarksSubtitle: {
    fontSize: 14,
    color: '#666',
    marginBottom: 16,
  },
  remarksInput: {
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    minHeight: 200,
    borderWidth: 1,
    borderColor: '#ddd',
    textAlignVertical: 'top',
  },
  saveRemarksButton: {
    flexDirection: 'row',
    backgroundColor: '#1976d2',
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 16,
  },
  saveRemarksButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  buttonDisabled: {
    backgroundColor: '#ccc',
  },
});

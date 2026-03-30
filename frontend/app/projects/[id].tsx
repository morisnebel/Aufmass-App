import React, { useState, useEffect, useCallback, useRef } from 'react';
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
  Dimensions,
  useWindowDimensions,
  StatusBar,
} from 'react-native';
import { useRouter, useLocalSearchParams, useFocusEffect, useNavigation } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { ProjectService, CustomerService, RoofService, PhotoService, SketchService, ChecklistService, SettingsService, DocumentService, Document, ChecklistTemplateService, AreaCalculationService, AreaCalculation, LineCategoryService, LineCategory, isProjectNumberDuplicate, isCustomerNumberDuplicate, isObjectNumberDuplicateInProject, getNextAvailableProjectNumber, getNextAvailableCustomerNumber, getNextAvailableObjectNumber, setLastUsedProjectType, getLastUsedProjectType, loadAllProjectDataFast, migratePhotoStorage } from '../../services/LocalStorage';
import { ReferenceService, ReferencePhoto } from '../../services/ReferenceService';
import { Features } from '../../services/FeatureFlags';
import { isPro, getProStatus } from '../../services/FeatureFlags';
import { useTranslation } from 'react-i18next';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';
import { copyAsync, deleteAsync, cacheDirectory, writeAsStringAsync, readAsStringAsync } from 'expo-file-system/legacy';
import { WebView } from 'react-native-webview';
import { SvgXml } from 'react-native-svg';
import ViewShot from 'react-native-view-shot';
import * as MediaLibrary from 'expo-media-library';

// API_URL removed - using local storage now

// Anrede-Optionen für Bauherr
const SALUTATION_OPTIONS = ['Herr', 'Frau', 'Firma', 'Familie', 'Dr.', 'Prof.'];

interface Project {
  id: string;
  project_number?: string; // PR-26001 format
  name: string;
  description?: string;
  customer_id: string;
  status: string;
  remarks?: string;
  // Projektart (Überschrift für PDF)
  project_type?: string; // z.B. "Sturmschaden", "Wartung"
  project_type_date?: string; // Optionales Datum (ISO-String)
  // Bauherr-Daten (separate Felder) - erweitert für Anrede, Vorname, Nachname
  bauherr_salutation?: string; // Anrede
  bauherr_first_name?: string; // Vorname
  bauherr_last_name?: string; // Nachname
  bauherr_name?: string; // Vollständiger Name (für Abwärtskompatibilität)
  bauherr_phone?: string;
  bauherr_mobile?: string;
  bauherr_email?: string;
  bauherr_street?: string;
  bauherr_plz?: string;
  bauherr_city?: string;
  // Objektadresse (separate Felder)
  objekt_number?: string; // OBJ-26001 format
  objekt_name?: string;
  objekt_description?: string; // Beschreibung der Objektadresse
  objekt_street?: string;
  objekt_plz?: string;
  objekt_city?: string;
  objekt_address_name?: string; // Name der gespeicherten Adresse (z.B. "Haupthaus")
  objekt_contact_person?: string; // Ansprechpartner
  objekt_phone?: string; // Telefon
  objekt_email?: string; // E-Mail
}

interface Customer {
  id: string;
  customer_number?: string; // KD-26001 format
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
  notes?: string;
  pdf_size?: string;
}

interface SubItem {
  text: string;
  checked: boolean;
  printImage?: string;
  previewImages?: string[];
  categoryLogo?: string;
  referenceFolderId?: string;
  referenceFolderName?: string;
}

interface ChecklistItem {
  text: string;
  checked: boolean;
  note?: string;
  subItems?: SubItem[];
  printImage?: string;
  previewImages?: string[];
  categoryLogo?: string;
  referenceFolderId?: string;
  referenceFolderName?: string;
}

interface Checklist {
  id: string;
  template_name: string;
  templateLogo?: string;
  items: ChecklistItem[];
}

export default function ProjectDetailScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const navigation = useNavigation();
  const { id, tab } = useLocalSearchParams();
  
  // iPhone vs iPad Erkennung - für unterschiedliches Layout
  const { width: screenWidth } = useWindowDimensions();
  const isPhone = Platform.OS === 'ios' ? !Platform.isPad : screenWidth < 768;
  
  const [project, setProject] = useState<Project | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [roofs, setRoofs] = useState<Roof[]>([]);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [sketches, setSketches] = useState<Sketch[]>([]);
  const [checklists, setChecklists] = useState<Checklist[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [areaCalculations, setAreaCalculations] = useState<AreaCalculation[]>([]);
  const [checklistColumns, setChecklistColumns] = useState<number>(2);
  const [loading, setLoading] = useState(true);
  
  // Determine initial tab from URL parameter
  const initialTab = (tab === 'sketches' || tab === 'roofs' || tab === 'photos' || tab === 'checklists' || tab === 'remarks' || tab === 'documents' | tab === 'calculator' || tab === 'imagemeter') ? tab : 'overview';
  const [activeTab, setActiveTab] = useState<'overview' | 'roofs' | 'photos' | 'sketches' | 'checklists' | 'remarks' | 'documents' | 'calculator' | 'imagemeter'>(initialTab);
  
  // ImageMeter photos state
  const [imagemeterPhotos, setImagemeterPhotos] = useState<any[]>([]);
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [photoToDelete, setPhotoToDelete] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteSketchModalVisible, setDeleteSketchModalVisible] = useState(false);
  const [sketchToDelete, setSketchToDelete] = useState<string | null>(null);
  const [isDeletingSketch, setIsDeletingSketch] = useState(false);
  
  // Photo gallery save state
  const [photoSelectMode, setPhotoSelectMode] = useState(false);
  const [photoDeleteMode, setPhotoDeleteMode] = useState(false);
  const [selectedPhotos, setSelectedPhotos] = useState<string[]>([]);
  const [isSavingToGallery, setIsSavingToGallery] = useState(false);
  
  // Checklist delete state
  const [deleteChecklistModalVisible, setDeleteChecklistModalVisible] = useState(false);
  const [checklistToDelete, setChecklistToDelete] = useState<string | null>(null);
  const [isDeletingChecklist, setIsDeletingChecklist] = useState(false);
  
  // Remarks state
  const [remarks, setRemarks] = useState('');
  const [isSavingRemarks, setIsSavingRemarks] = useState(false);
  
  // Numpad state für Bemerkungen
  const [showRemarksNumpad, setShowRemarksNumpad] = useState(false);
  const [remarksNumpadMode, setRemarksNumpadMode] = useState<'numbers' | 'letters'>('numbers');
  const [remarksNumpadCaps, setRemarksNumpadCaps] = useState(false);
  const remarksInputRef = useRef<TextInput>(null);
  
  // Numpad-Taste drücken Handler
  const handleRemarksNumpadPress = (key: string) => {
    if (key === '⌫') {
      setRemarks(prev => prev.slice(0, -1));
    } else if (key === 'C') {
      setRemarks('');
    } else {
      setRemarks(prev => prev + key);
    }
    // Fokus zurücksetzen für Bluetooth-Eingabe
    setTimeout(() => remarksInputRef?.current?.focus(), 10);
  };
  
  // Project edit modal state
  const [showEditProjectModal, setShowEditProjectModal] = useState(false);
  const [editProjectNumber, setEditProjectNumber] = useState(''); // PR-26001
  const [editProjectName, setEditProjectName] = useState('');
  const [editProjectDescription, setEditProjectDescription] = useState('');
  const [editProjectStatus, setEditProjectStatus] = useState('');
  // Bauherr edit fields (separate) - erweitert für Anrede, Vorname, Nachname
  const [editCustomerNumber, setEditCustomerNumber] = useState(''); // KD-26001
  const [editBauherrSalutation, setEditBauherrSalutation] = useState('');
  const [editBauherrFirstName, setEditBauherrFirstName] = useState('');
  const [editBauherrLastName, setEditBauherrLastName] = useState('');
  const [editBauherrPhone, setEditBauherrPhone] = useState('');
  const [editBauherrMobile, setEditBauherrMobile] = useState('');
  const [editBauherrEmail, setEditBauherrEmail] = useState('');
  const [editBauherrStreet, setEditBauherrStreet] = useState('');
  const [editBauherrPlz, setEditBauherrPlz] = useState('');
  const [editBauherrCity, setEditBauherrCity] = useState('');
  // Anrede-Picker Modal für Bauherr
  const [showBauherrSalutationPicker, setShowBauherrSalutationPicker] = useState(false);
  // Objektadresse edit fields (separate)
  const [editObjektNumber, setEditObjektNumber] = useState(''); // OBJ-26001
  const [editObjektName, setEditObjektName] = useState('');
  const [editObjektDescription, setEditObjektDescription] = useState('');
  const [editObjektStreet, setEditObjektStreet] = useState('');
  const [editObjektPlz, setEditObjektPlz] = useState('');
  const [editObjektCity, setEditObjektCity] = useState('');
  const [editObjektContactPerson, setEditObjektContactPerson] = useState('');
  const [editObjektPhone, setEditObjektPhone] = useState('');
  const [editObjektEmail, setEditObjektEmail] = useState('');
  // Projektart-Überschrift Felder
  const [editProjectType, setEditProjectType] = useState('');
  const [editProjectTypeDate, setEditProjectTypeDate] = useState('');
  const [showProjectTypePicker, setShowProjectTypePicker] = useState(false);
  const [showProjectTypeDatePicker, setShowProjectTypeDatePicker] = useState(false);
  const [showDirectProjectTypePicker, setShowDirectProjectTypePicker] = useState(false);
  const [showDirectProjectTypeDatePicker, setShowDirectProjectTypeDatePicker] = useState(false);
  const [tempSelectedDate, setTempSelectedDate] = useState<Date | null>(null);
  const [projectTypeOptions, setProjectTypeOptions] = useState<string[]>([]);
  const [isSavingProject, setIsSavingProject] = useState(false);
  const [lastUsedProjectType, setLastUsedProjectTypeState] = useState<string | null>(null);
  const [showDateTimePicker, setShowDateTimePicker] = useState(false);
  
  // PDF Preview state
  const [showPdfPreviewModal, setShowPdfPreviewModal] = useState(false);
  const [pdfHtmlContent, setPdfHtmlContent] = useState('');
  const [pdfUri, setPdfUri] = useState<string | null>(null);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [isSharingImage, setIsSharingImage] = useState(false);
  const [showCalcDetailsPage, setShowCalcDetailsPage] = useState(true); // Toggle for detailed calculation page - default ON
  const viewShotRef = useRef<ViewShot>(null);

  // Checklist Image Preview Modal state
  const [imagePreviewModal, setImagePreviewModal] = useState<{ visible: boolean; images: string[]; title: string }>({ visible: false, images: [], title: '' });
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  
  // Reference Photos Modal state
  const [referencePhotosModal, setReferencePhotosModal] = useState<{ visible: boolean; photos: ReferencePhoto[]; title: string; folderId: string }>({ visible: false, photos: [], title: '', folderId: '' });
  const [loadingReferencePhotos, setLoadingReferencePhotos] = useState(false);

  // Function to open reference photos for a checklist item
  const openReferencePhotos = async (folderId: string, folderName: string) => {
    setLoadingReferencePhotos(true);
    setReferencePhotosModal({ visible: true, photos: [], title: folderName, folderId });
    try {
      const photos = await ReferenceService.getPhotosInFolder(folderId);
      setReferencePhotosModal({ visible: true, photos, title: folderName, folderId });
    } catch (error) {
      console.error('Error loading reference photos:', error);
      Alert.alert(t('common.error'), t('roof.referenceLoadError'));
    } finally {
      setLoadingReferencePhotos(false);
    }
  };

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
    if (tab === 'sketches' || tab === 'roofs' || tab === 'photos' || tab === 'checklists' || tab === 'remarks' || tab === 'documents' || tab === 'calculator') {
      setActiveTab(tab);
    }
  }, [tab]);

  // Dynamischer Header: Wenn ein Tab aktiv ist, zeige Tab-Name und "← Projektdetails" als Zurück-Button
  const tabTitles: Record<string, string> = {
    overview: t('projects.title'),
    sketches: t('projects.sketches'),
    roofs: t('projects.roofMeasurement'),
    photos: t('projects.photos'),
    checklists: t('projects.checklists'),
    remarks: t('projects.notes'),
    documents: t('projects.documents'),
    calculator: t('calculator.title'),
    imagemeter: t('projects.measurement'),
  };

  // Ladezustand für Tab-Wechsel (damit SVG-Vorschauen nicht den UI-Thread blockieren)
  const [isTabLoading, setIsTabLoading] = useState(false);
  const prevTabRef = useRef(activeTab);

  // Tab-Wechsel mit sofortiger Ladeanzeige für schwere Tabs
  const handleTabChange = useCallback((newTab: typeof activeTab) => {
    if (newTab === activeTab) return;
    if (newTab === 'sketches' || newTab === 'photos') {
      setIsTabLoading(true);
      setActiveTab(newTab);
      // Kurze Verzögerung, damit der Spinner erst angezeigt wird, bevor die schweren SVGs rendern
      setTimeout(() => setIsTabLoading(false), 150);
    } else {
      setActiveTab(newTab);
    }
  }, [activeTab]);

  useEffect(() => {
    if (activeTab !== 'overview') {
      navigation.setOptions({
        title: tabTitles[activeTab] || 'Projektdetails',
        headerLeft: () => (
          <TouchableOpacity 
            onPress={() => handleTabChange('overview')} 
            style={{ 
              flexDirection: 'row', 
              alignItems: 'center', 
              paddingRight: 8,
              paddingVertical: 8,
              minHeight: 44,
            }}
            activeOpacity={0.7}
          >
            <Ionicons name="chevron-back" size={28} color="#000" />
            <Text style={{ color: '#000', fontSize: 17, fontWeight: '600' }}>Projektdetails</Text>
          </TouchableOpacity>
        ),
      });
    } else {
      navigation.setOptions({
        title: 'Projektdetails',
        headerLeft: undefined,
      });
    }
  }, [activeTab, navigation]);

  // Auto-regenerate PDF when toggle changes while modal is open
  useEffect(() => {
    if (showPdfPreviewModal) {
      const regeneratePdf = async () => {
        const html = await generatePdfHtml();
        setPdfHtmlContent(html);
      };
      regeneratePdf();
    }
  }, [showCalcDetailsPage]);

  // Use useFocusEffect to reload data when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      loadProjectData();
    }, [id])
  );

  // PDF automatisch neu generieren wenn sich Sketch/Photo-Daten ändern
  useEffect(() => {
    if (sketches.length > 0 || photos.length > 0) {
      const regenerate = async () => {
        try {
          const html = await generatePdfHtml();
          setPdfHtmlContent(html);
        } catch (e) {
          console.error('Error auto-regenerating PDF:', e);
        }
      };
      regenerate();
    }
  }, [sketches, photos, checklists, roofs, areaCalculations, imagemeterPhotos, remarks]);

  const loadProjectData = async () => {
    try {
      const projectId = Array.isArray(id) ? id[0] : id;
      const startTime = Date.now();
      
      // Migration: Foto-Bilddaten in separate Schlüssel verschieben (einmalig)
      await migratePhotoStorage();
      
      // FAST: Read ALL data in ONE native call using multiGet
      const data = await loadAllProjectDataFast(projectId);
      
      // Load settings
      if (data.settings?.project_type_options) {
        setProjectTypeOptions(data.settings.project_type_options);
      }
      if (data.settings?.pdf_checklist_columns) {
        setChecklistColumns(data.settings.pdf_checklist_columns);
      }

      // Lade die zuletzt verwendete Projektart
      const lastUsed = await getLastUsedProjectType();
      if (lastUsed) {
        setLastUsedProjectTypeState(lastUsed);
      }

      if (data.project) {
        console.log('[DEBUG loadProjectData] project_type:', data.project.project_type);
        console.log('[DEBUG loadProjectData] project_type_date:', data.project.project_type_date);
        setProject(data.project);
        setRemarks(data.project.remarks || '');
        
        if (data.customer) {
          setCustomer(data.customer);
        }
      }
      
      setRoofs(data.roofs);
      setPhotos(data.photos);
      setSketches(data.sketches);
      setChecklists(data.checklists);
      setDocuments(data.documents);
      setAreaCalculations(data.areaCalculations);
      setImagemeterPhotos(data.imagemeterPhotos);
      
      console.log('[TIMING] loadProjectData total:', Date.now() - startTime, 'ms');
    } catch (error) {
      console.error('Error loading project:', error);
      Alert.alert(t('common.error'), t('projects.projectLoadError'));
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
        alert(t('projects.photoDeleted'));
      } else {
        Alert.alert(t('common.success'), t('photos.photoDeleted'));
      }
    } catch (error: any) {
      console.error('Error deleting photo:', error);
      
      // Only show error if it's not a 404 (photo already deleted)
      if (error?.response?.status !== 404) {
        if (Platform.OS === 'web') {
          alert(t('projects.photoDeleteError'));
        } else {
          Alert.alert(t('common.error'), t('photos.photoDeleteError'));
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

  // Fotos in iPad Galerie speichern
  const togglePhotoSelection = (photoId: string) => {
    setSelectedPhotos(prev => 
      prev.includes(photoId) 
        ? prev.filter(id => id !== photoId)
        : [...prev, photoId]
    );
  };

  const saveSelectedPhotosToGallery = async () => {
    if (selectedPhotos.length === 0) {
      Alert.alert(t('common.note'), t('photos.selectAtLeastOne'));
      return;
    }

    setIsSavingToGallery(true);

    try {
      // Request permission
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(t('photos.permissionNeeded'), t('photos.photoPermission'));
        setIsSavingToGallery(false);
        return;
      }

      // Try to find an available directory - try multiple options
      let baseDir = FileSystem.cacheDirectory || FileSystem.documentDirectory;
      
      console.log('Available directories:', {
        cacheDirectory: FileSystem.cacheDirectory,
        documentDirectory: FileSystem.documentDirectory,
      });
      
      if (!baseDir) {
        // For Expo Go, we might need to use a different approach
        // Try using Sharing instead
        Alert.alert(
          t('projects.alternativeMethod'),
          t('projects.alternativeMethodMessage'),
          [
            { text: t('common.cancel'), style: 'cancel', onPress: () => setIsSavingToGallery(false) },
            { 
              text: t('common.share'), 
              onPress: async () => {
                try {
                  for (const photoId of selectedPhotos) {
                    const photo = photos.find(p => p.id === photoId);
                    if (photo?.image_data) {
                      let dataUri = photo.image_data;
                      if (!dataUri.startsWith('data:')) {
                        dataUri = `data:image/jpeg;base64,${dataUri}`;
                      }
                      // Use Share API as fallback
                      await Share.share({
                        url: dataUri,
                        message: photo.description || 'Foto',
                      });
                    }
                  }
                  setPhotoSelectMode(false);
                  setSelectedPhotos([]);
                } catch (e) {
                  console.error('Share error:', e);
                } finally {
                  setIsSavingToGallery(false);
                }
              }
            }
          ]
        );
        return;
      }

      let savedCount = 0;
      const errors: string[] = [];
      
      for (const photoId of selectedPhotos) {
        const photo = photos.find(p => p.id === photoId);
        if (photo?.image_data) {
          try {
            // Get base64 data - remove data URI prefix if present
            let base64Data = photo.image_data;
            if (base64Data.includes(',')) {
              base64Data = base64Data.split(',')[1];
            }
            
            const filename = `photo_${photoId}_${Date.now()}.jpg`;
            const fileUri = `${baseDir}${filename}`;
            
            console.log('Attempting to write to:', fileUri);
            console.log('Base64 length:', base64Data.length);
            
            // Write base64 data directly to file
            await FileSystem.writeAsStringAsync(fileUri, base64Data, {
              encoding: FileSystem.EncodingType.Base64,
            });
            
            console.log('File written successfully to:', fileUri);
            
            // Verify file exists
            const fileInfo = await FileSystem.getInfoAsync(fileUri);
            console.log('File info:', fileInfo);
            
            if (!fileInfo.exists) {
              errors.push(`File not created for ${photoId}`);
              continue;
            }
            
            // Save to media library
            const asset = await MediaLibrary.createAssetAsync(fileUri);
            console.log('Asset created:', asset.id);
            
            // Clean up temp file
            try {
              await FileSystem.deleteAsync(fileUri, { idempotent: true });
            } catch (e) {
              // Ignore cleanup errors
            }
            
            savedCount++;
          } catch (err: any) {
            const errorMsg = err?.message || String(err);
            console.error('Error saving photo:', errorMsg);
            errors.push(errorMsg);
          }
        }
      }

      // Reset selection mode
      setPhotoSelectMode(false);
      setSelectedPhotos([]);

      if (savedCount > 0) {
        Alert.alert(t('common.success'), t('photos.savedToGallery', { count: savedCount }));
      } else {
        const errorDetail = errors.length > 0 ? `\n\nDetails: ${errors[0]}` : '';
        Alert.alert(t('common.error'), t('photos.saveToGalleryError'));
      }
    } catch (error: any) {
      console.error('Error saving photos to gallery:', error?.message || error);
      Alert.alert(t('common.error'), t('photos.saveError'));
    } finally {
      setIsSavingToGallery(false);
    }
  };

  // Mehrere Fotos auf einmal löschen
  const handleDeleteSelectedPhotos = async () => {
    if (selectedPhotos.length === 0) {
      Alert.alert('Hinweis', 'Bitte wählen Sie mindestens ein Foto aus.');
      return;
    }

    Alert.alert(
      `${selectedPhotos.length} Foto${selectedPhotos.length > 1 ? 's' : ''} löschen`,
      `Möchten Sie ${selectedPhotos.length} Foto${selectedPhotos.length > 1 ? 's' : ''} unwiderruflich löschen?`,
      [
        { text: 'Abbrechen', style: 'cancel' },
        {
          text: 'Löschen',
          style: 'destructive',
          onPress: async () => {
            setIsDeleting(true);
            try {
              let deletedCount = 0;
              for (const photoId of selectedPhotos) {
                try {
                  await PhotoService.delete(photoId);
                  deletedCount++;
                } catch (e) {
                  console.error(`Error deleting photo ${photoId}:`, e);
                }
              }

              // Reset und Daten neu laden
              setPhotoDeleteMode(false);
              setSelectedPhotos([]);
              await loadProjectData();

              Alert.alert('Erfolg', `${deletedCount} Foto${deletedCount > 1 ? 's' : ''} gelöscht.`);
            } catch (error) {
              console.error('Error deleting photos:', error);
              Alert.alert('Fehler', 'Fotos konnten nicht gelöscht werden.');
            } finally {
              setIsDeleting(false);
            }
          },
        },
      ]
    );
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
        alert(t('projects.sketchDeleted'));
      } else {
        Alert.alert(t('common.success'), t('sketches.title'));
      }
    } catch (error: any) {
      console.error('Error deleting sketch:', error);
      
      if (Platform.OS === 'web') {
        alert(t('projects.sketchDeleteError'));
      } else {
        Alert.alert(t('common.error'), t('sketches.title'));
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
        alert(t('projects.checklistDeleted'));
      } else {
        Alert.alert(t('common.success'), t('checklists.checklistDeleted'));
      }
    } catch (error: any) {
      console.error('Error deleting checklist:', error);
      
      if (Platform.OS === 'web') {
        alert(t('projects.checklistDeleteError'));
      } else {
        Alert.alert(t('common.error'), t('checklists.checklistDeleteError'));
      }
    } finally {
      setIsDeletingChecklist(false);
    }
  };

  // Checkliste als Vorlage speichern
  const saveChecklistAsTemplate = async (checklist: any) => {
    try {
      // Erstelle eine tiefe Kopie der Checklist-Items im Template-Format (text + subItems)
      const cleanItems = (items: any[]): any[] => {
        if (!items || !Array.isArray(items)) return [];
        return items.map(item => ({
          text: item.text || item.name || '',
          subItems: cleanItems(item.subItems || item.children || []),
        }));
      };

      // Die Checkliste hat "items" als Hauptarray mit Kategorien
      const cleanedItems = cleanItems(checklist.items || []);
      
      // Name: title > name > 'Kopierte Vorlage'
      const templateName = checklist.title || checklist.name || 'Kopierte Vorlage';

      const templateData = {
        name: templateName,
        items: cleanedItems,
      };

      await ChecklistTemplateService.create(templateData);

      if (Platform.OS === 'web') {
        alert(`"${templateName}" wurde als Vorlage gespeichert`);
      } else {
        Alert.alert(t('common.success'), t('checklists.templateSaved', { name: templateName }));
      }
    } catch (error) {
      console.error('Error saving checklist as template:', error);
      if (Platform.OS === 'web') {
        alert(t('projects.templateSaveError'));
      } else {
        Alert.alert(t('common.error'), t('checklists.templateSaveError'));
      }
    }
  };

  // Move checklist up or down
  const moveChecklist = async (index: number, direction: 'up' | 'down') => {
    if (!project) return;
    
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= checklists.length) return;
    
    // Swap the checklists
    const newChecklists = [...checklists];
    const temp = newChecklists[index];
    newChecklists[index] = newChecklists[newIndex];
    newChecklists[newIndex] = temp;
    
    // Update order field for all checklists
    try {
      for (let i = 0; i < newChecklists.length; i++) {
        await ChecklistService.update(newChecklists[i].id, {
          ...newChecklists[i],
          order: i
        });
      }
      // Reload checklists
      const updated = await ChecklistService.getByProjectId(project.id);
      // Sort by order
      updated.sort((a: any, b: any) => (a.order ?? 0) - (b.order ?? 0));
      setChecklists(updated);
    } catch (error) {
      console.error('Error moving checklist:', error);
      Alert.alert(t('common.error'), t('checklists.moveError'));
    }
  };

  // Open edit project modal with current values
  const openEditProjectModal = async () => {
    if (project) {
      // Project numbers
      setEditProjectNumber(project.project_number || '');
      setEditProjectName(project.name);
      setEditProjectDescription(project.description || '');
      setEditProjectStatus(project.status);
      
      // Parse customer address as fallback
      const customerAddr = parseCustomerAddress(customer?.address);
      
      // Customer number and Bauherr data - use project-specific or fall back to customer (mit separaten Feldern)
      setEditCustomerNumber(customer?.customer_number || '');
      setEditBauherrSalutation(project.bauherr_salutation || customer?.salutation || '');
      setEditBauherrFirstName(project.bauherr_first_name || customer?.firstName || '');
      setEditBauherrLastName(project.bauherr_last_name || customer?.lastName || '');
      setEditBauherrPhone(project.bauherr_phone || customer?.phone || '');
      setEditBauherrMobile(project.bauherr_mobile || customer?.mobile || '');
      setEditBauherrEmail(project.bauherr_email || customer?.email || '');
      setEditBauherrStreet(project.bauherr_street || customer?.street || customerAddr.street || '');
      setEditBauherrPlz(project.bauherr_plz || customer?.zip || customerAddr.plz || '');
      setEditBauherrCity(project.bauherr_city || customer?.city || customerAddr.city || '');
      
      // Objektadresse - leave empty if not set (will use bauherr as default)
      setEditObjektNumber(project.objekt_number || '');
      setEditObjektName(project.objekt_name || '');
      setEditObjektDescription(project.objekt_description || '');
      setEditObjektStreet(project.objekt_street || '');
      setEditObjektPlz(project.objekt_plz || '');
      setEditObjektCity(project.objekt_city || '');
      setEditObjektContactPerson(project.objekt_contact_person || '');
      setEditObjektPhone(project.objekt_phone || '');
      setEditObjektEmail(project.objekt_email || '');
      
      // Projektart-Überschrift
      // Wenn Projekt bereits eine Projektart hat, nutze diese
      // Sonst lade die zuletzt verwendete Projektart
      if (project.project_type) {
        setEditProjectType(project.project_type);
      } else {
        const lastUsed = await getLastUsedProjectType();
        setEditProjectType(lastUsed || '');
      }
      setEditProjectTypeDate(project.project_type_date || '');
      
      setShowEditProjectModal(true);
    }
  };

  // Save project changes
  const handleSaveProject = async () => {
    if (!editProjectName.trim()) {
      if (Platform.OS === 'web') {
        alert(t('projects.enterProjectName'));
      } else {
        Alert.alert(t('common.error'), t('projects.enterProjectNameError'));
      }
      return;
    }

    const projectId = Array.isArray(id) ? id[0] : id;
    
    // Duplikat-Prüfungen
    const duplicateChecks: { field: string; number: string; isDuplicate: boolean; getNewNumber: () => Promise<string> }[] = [];
    
    // Prüfe Projektnummer
    if (editProjectNumber && editProjectNumber !== project?.project_number) {
      const isDupe = await isProjectNumberDuplicate(editProjectNumber, projectId);
      if (isDupe) {
        duplicateChecks.push({
          field: 'Projektnummer',
          number: editProjectNumber,
          isDuplicate: true,
          getNewNumber: getNextAvailableProjectNumber
        });
      }
    }
    
    // Prüfe Kundennummer
    if (editCustomerNumber) {
      console.log('[DEBUG] Checking customer number:', editCustomerNumber);
      console.log('[DEBUG] customer_id:', project?.customer_id);
      
      // Prüfe ob die Nummer bereits von einem ANDEREN Kunden verwendet wird
      const isDupe = await isCustomerNumberDuplicate(editCustomerNumber, project?.customer_id);
      console.log('[DEBUG] isCustomerNumberDuplicate result:', isDupe);
      
      if (isDupe) {
        duplicateChecks.push({
          field: 'Kundennummer',
          number: editCustomerNumber,
          isDuplicate: true,
          getNewNumber: getNextAvailableCustomerNumber
        });
      }
    }
    
    // Prüfe Objektnummer (nur innerhalb des Kunden)
    if (editObjektNumber && editObjektNumber !== project?.objekt_number && project?.customer_id) {
      const projectId = Array.isArray(id) ? id[0] : id;
      const isDupe = await isObjectNumberDuplicateInProject(editObjektNumber, project.customer_id, projectId);
      if (isDupe) {
        duplicateChecks.push({
          field: 'Objektnummer',
          number: editObjektNumber,
          isDuplicate: true,
          getNewNumber: () => getNextAvailableObjectNumber(project?.customer_id)
        });
      }
    }
    
    // Wenn Duplikate gefunden wurden, zeige Dialog
    if (duplicateChecks.length > 0) {
      const dupeList = duplicateChecks.map(d => `${d.field}: "${d.number}"`).join('\n');
      Alert.alert(
        t('projects.numbersAlreadyTaken'),
        `Folgende Nummern existieren bereits:\n${dupeList}\n\nWas möchten Sie tun?`,
        [
          { text: t('common.cancel'), style: 'cancel' },
          { 
            text: t('projects.keepNumbers'), 
            onPress: () => doSaveProject(editProjectNumber, editCustomerNumber, editObjektNumber)
          },
          {
            text: t('projects.assignNewNumbers'),
            onPress: async () => {
              let newProjectNum = editProjectNumber;
              let newCustomerNum = editCustomerNumber;
              let newObjektNum = editObjektNumber;
              
              for (const check of duplicateChecks) {
                if (check.field === 'Projektnummer') {
                  newProjectNum = await check.getNewNumber();
                } else if (check.field === 'Kundennummer') {
                  newCustomerNum = await check.getNewNumber();
                } else if (check.field === 'Objektnummer') {
                  newObjektNum = await check.getNewNumber();
                }
              }
              doSaveProject(newProjectNum, newCustomerNum, newObjektNum);
            }
          }
        ]
      );
      return;
    }
    
    // Keine Duplikate, direkt speichern
    await doSaveProject(editProjectNumber, editCustomerNumber, editObjektNumber);
  };

  const doSaveProject = async (projectNumber: string, customerNumber: string, objektNumber: string) => {
    const projectId = Array.isArray(id) ? id[0] : id;

    setIsSavingProject(true);
    try {
      await ProjectService.update(projectId, {
        project_number: projectNumber || undefined,
        name: editProjectName,
        description: editProjectDescription || undefined,
        status: editProjectStatus,
        customer_id: project?.customer_id,
        // Bauherr data (separate fields) - erweitert
        bauherr_salutation: editBauherrSalutation || undefined,
        bauherr_first_name: editBauherrFirstName || undefined,
        bauherr_last_name: editBauherrLastName || undefined,
        bauherr_name: `${editBauherrSalutation} ${editBauherrFirstName} ${editBauherrLastName}`.trim() || undefined, // Für Abwärtskompatibilität
        bauherr_phone: editBauherrPhone || undefined,
        bauherr_mobile: editBauherrMobile || undefined,
        bauherr_email: editBauherrEmail || undefined,
        bauherr_street: editBauherrStreet || undefined,
        bauherr_plz: editBauherrPlz || undefined,
        bauherr_city: editBauherrCity || undefined,
        // Objektadresse (separate fields)
        objekt_number: objektNumber || undefined,
        objekt_name: editObjektName || undefined,
        objekt_description: editObjektDescription || undefined,
        objekt_street: editObjektStreet || undefined,
        objekt_plz: editObjektPlz || undefined,
        objekt_city: editObjektCity || undefined,
        objekt_contact_person: editObjektContactPerson || undefined,
        objekt_phone: editObjektPhone || undefined,
        objekt_email: editObjektEmail || undefined,
        objekt_address_name: editProjectName || project?.objekt_address_name || undefined, // Projektname = Bezeichnung
        // Projektart-Überschrift
        project_type: editProjectType || undefined,
        project_type_date: editProjectTypeDate || undefined,
      });

      // Speichere die zuletzt verwendete Projektart
      if (editProjectType) {
        await setLastUsedProjectType(editProjectType);
      }

      // Synchronisiere Bauherr-Daten mit Kundenstamm
      if (project?.customer_id) {
        try {
          const existingCustomer = await CustomerService.getById(project.customer_id);
          if (existingCustomer) {
            // Baue die Adresse zusammen
            const newAddress = editBauherrStreet || editBauherrPlz || editBauherrCity
              ? `${editBauherrStreet || ''}, ${editBauherrPlz || ''} ${editBauherrCity || ''}`.trim()
              : existingCustomer.address;
            
            const fullName = `${editBauherrSalutation} ${editBauherrFirstName} ${editBauherrLastName}`.trim();
            
            await CustomerService.update(project.customer_id, {
              ...existingCustomer,
              salutation: editBauherrSalutation || existingCustomer.salutation,
              firstName: editBauherrFirstName || existingCustomer.firstName,
              lastName: editBauherrLastName || existingCustomer.lastName,
              name: fullName || existingCustomer.name,
              phone: editBauherrPhone || existingCustomer.phone,
              mobile: editBauherrMobile || existingCustomer.mobile,
              email: editBauherrEmail || existingCustomer.email,
              street: editBauherrStreet || existingCustomer.street,
              zip: editBauherrPlz || existingCustomer.zip,
              city: editBauherrCity || existingCustomer.city,
              address: newAddress,
              customer_number: customerNumber || existingCustomer.customer_number,
            });
          }
        } catch (syncError) {
          console.error('Error syncing customer data:', syncError);
          // Fehler bei Synchronisation nicht an Benutzer zeigen, Projekt wurde trotzdem gespeichert
        }
      }

      setShowEditProjectModal(false);
      console.log('[DEBUG] Projekt gespeichert, lade Daten neu...');
      await loadProjectData();
      console.log('[DEBUG] Daten neu geladen, project_type:', project?.project_type);

      // Prüfe ob eine passende Projektadresse beim Kunden existiert und frage nach Sync
      console.log('=== SYNC CHECK ===');
      console.log('customer_id:', project?.customer_id);
      console.log('editObjektStreet:', editObjektStreet);
      console.log('editObjektPlz:', editObjektPlz);
      console.log('editObjektCity:', editObjektCity);
      console.log('objekt_address_name:', project?.objekt_address_name);
      
      if (project?.customer_id && (editObjektStreet || editObjektPlz || editObjektCity)) {
        try {
          const existingCustomer = await CustomerService.getById(project.customer_id);
          console.log('existingCustomer:', existingCustomer?.name);
          console.log('projectAddresses:', existingCustomer?.projectAddresses?.length);
          
          if (existingCustomer?.projectAddresses && existingCustomer.projectAddresses.length > 0) {
            // Finde passende Adresse - über Name oder über Straße/PLZ
            let matchingAddress = null;
            if (project?.objekt_address_name) {
              matchingAddress = existingCustomer.projectAddresses.find(
                addr => addr.name === project.objekt_address_name
              );
              console.log('Match by name:', matchingAddress?.name);
            }
            // Falls kein Name-Match, versuche über alte Straßendaten zu matchen
            if (!matchingAddress && project?.objekt_street) {
              matchingAddress = existingCustomer.projectAddresses.find(
                addr => addr.street === project.objekt_street && addr.zip === project.objekt_plz
              );
              console.log('Match by street:', matchingAddress?.name);
            }
            
            // Wenn immer noch kein Match, zeige alle Adressen zur Auswahl
            if (!matchingAddress && existingCustomer.projectAddresses.length > 0) {
              console.log('No match found, showing selection dialog');
              // Zeige Dialog mit allen Adressen
              Alert.alert(
                t('projects.updateAddressAtCustomer'),
                t('projects.whichAddressToUpdate'),
                [
                  { text: 'Keine', style: 'cancel' },
                  ...existingCustomer.projectAddresses.map(addr => ({
                    text: addr.name || t('projects.unnamed'),
                    onPress: async () => {
                      const updatedAddresses = existingCustomer.projectAddresses!.map(a => 
                        a.id === addr.id
                          ? { 
                              ...a, 
                              objectName: editObjektName || undefined,
                              description: editProjectDescription || undefined, // Projekt-Beschreibung synchronisieren
                              street: editObjektStreet, 
                              zip: editObjektPlz, 
                              city: editObjektCity,
                              contactPerson: editObjektContactPerson || undefined,
                              phone: editObjektPhone || undefined,
                              email: editObjektEmail || undefined,
                            }
                          : a
                      );
                      await CustomerService.update(project.customer_id!, {
                        ...existingCustomer,
                        projectAddresses: updatedAddresses,
                      });
                      // Speichere auch den Link zum Adress-Namen
                      const projectId = Array.isArray(id) ? id[0] : id;
                      const currentProject = await ProjectService.getById(projectId);
                      if (currentProject) {
                        await ProjectService.update(projectId, {
                          ...currentProject,
                          objekt_address_name: addr.name,
                        });
                      }
                      await loadProjectData(); // Daten neu laden
                      Alert.alert(t('common.success'), t('projects.addressUpdated', { name: addr.name }));
                    }
                  }))
                ]
              );
            } else if (matchingAddress) {
              console.log('Found matching address:', matchingAddress.name);
              // Prüfe ob sich Daten geändert haben
              const hasChanges = 
                matchingAddress.name !== editProjectName || // Projektname/Bezeichnung geändert
                (matchingAddress.objectName || '') !== (editObjektName || '') ||
                (matchingAddress.description || '') !== (editProjectDescription || '') || // Projekt-Beschreibung prüfen
                matchingAddress.street !== editObjektStreet ||
                matchingAddress.zip !== editObjektPlz ||
                matchingAddress.city !== editObjektCity ||
                (matchingAddress.contactPerson || '') !== (editObjektContactPerson || '') ||
                (matchingAddress.phone || '') !== (editObjektPhone || '') ||
                (matchingAddress.email || '') !== (editObjektEmail || '');
              
              console.log('hasChanges:', hasChanges);
              
              if (hasChanges) {
                Alert.alert(
                  t('projects.syncAddress'),
                  `Die Objektadresse wurde geändert. Soll die Projektadresse "${matchingAddress.name}" beim Kunden auch aktualisiert werden?`,
                  [
                    { text: 'Nein', style: 'cancel' },
                    { 
                      text: t('projects.yesSync'), 
                      onPress: async () => {
                        // Aktualisiere beim Kunden: Bezeichnung bleibt gleich, aber Objektname und andere Daten werden aktualisiert
                        const updatedAddresses = existingCustomer.projectAddresses!.map(addr => 
                          addr.id === matchingAddress!.id
                            ? { 
                                ...addr, 
                                object_number: editObjektNumber || addr.object_number, // Objektnummer synchronisieren
                                name: editProjectName || addr.name, // Bezeichnung = Projektname (wenn geändert)
                                objectName: editObjektName || undefined,
                                description: editProjectDescription || undefined, // Projekt-Beschreibung synchronisieren
                                street: editObjektStreet, 
                                zip: editObjektPlz, 
                                city: editObjektCity,
                                contactPerson: editObjektContactPerson || undefined,
                                phone: editObjektPhone || undefined,
                                email: editObjektEmail || undefined,
                              }
                            : addr
                        );
                        await CustomerService.update(project.customer_id!, {
                          ...existingCustomer,
                          projectAddresses: updatedAddresses,
                        });
                        // Aktualisiere auch objekt_address_name falls Projektname geändert wurde
                        if (editProjectName && editProjectName !== project?.objekt_address_name) {
                          const projectId = Array.isArray(id) ? id[0] : id;
                          const currentProject = await ProjectService.getById(projectId);
                          if (currentProject) {
                            await ProjectService.update(projectId, {
                              ...currentProject,
                              objekt_address_name: editProjectName,
                            });
                          }
                        }
                        Alert.alert(t('common.success'), t('projects.addressUpdatedAtCustomer'));
                        await loadProjectData(); // Daten neu laden nach Sync
                      }
                    },
                  ]
                );
              }
            }
          }
        } catch (syncError) {
          console.error('Error checking customer address sync:', syncError);
        }
      }

      if (Platform.OS === 'web') {
        alert(t('projects.projectUpdatedMsg'));
      } else {
        Alert.alert(t('common.success'), t('projects.projectUpdated'));
      }
    } catch (error) {
      console.error('Error updating project:', error);
      if (Platform.OS === 'web') {
        alert(t('projects.projectUpdateErrorMsg'));
      } else {
        Alert.alert(t('common.error'), t('projects.projectUpdateError'));
      }
    } finally {
      setIsSavingProject(false);
    }
  };

  // Generate PDF HTML content
  const generatePdfHtml = async () => {
    // Debug: Log remarks status
    console.log('generatePdfHtml - remarks state:', remarks);
    console.log('generatePdfHtml - project?.remarks:', project?.remarks);
    
    // Get company settings for header
    const settings = await SettingsService.get();
    
    // Load line categories for shortcut display
    const pdfLineCategories = await LineCategoryService.getAll();
    
    // Helper: Format category name with shortcut -> "(TR) Traufe"
    const formatCategoryForPdf = (categoryName: string): string => {
      const cat = pdfLineCategories.find(c => c.name === categoryName);
      if (cat?.shortcut) {
        return `(${cat.shortcut}) ${categoryName}`;
      }
      return categoryName;
    };
    
    // Calculate total area for PDF
    const pdfTotalArea = roofs.reduce((sum, roof) => sum + (roof.area || 0), 0);
    
    // Parse customer address helper
    const parseAddr = (address: string | undefined) => {
      if (!address) return { street: '', plz: '', city: '' };
      const parts = address.split(',');
      const street = parts[0]?.trim() || '';
      const cityParts = parts[1]?.trim().split(' ') || [];
      const plz = cityParts[0] || '';
      const city = cityParts.slice(1).join(' ') || '';
      return { street, plz, city };
    };
    
    const customerAddr = parseAddr(customer?.address);
    
    // Build bauherr info - alle Felder
    const bauherrName = project?.bauherr_name || customer?.name || '';
    const bauherrStreet = project?.bauherr_street || customerAddr.street || '';
    const bauherrPlz = project?.bauherr_plz || customerAddr.plz || '';
    const bauherrCity = project?.bauherr_city || customerAddr.city || '';
    const bauherrPhone = project?.bauherr_phone || customer?.phone || '';
    const bauherrMobile = project?.bauherr_mobile || customer?.mobile || '';
    const bauherrEmail = project?.bauherr_email || customer?.email || '';
    
    // Build objekt info - alle Felder
    const objektNumber = project?.objekt_number || ''; // OBJ-26001
    const objektName = project?.objekt_name || '';
    const objektAddressName = project?.objekt_address_name || ''; // z.B. "Haupthaus"
    const objektStreet = project?.objekt_street || '';
    const objektPlz = project?.objekt_plz || '';
    const objektCity = project?.objekt_city || '';
    const objektContactPerson = project?.objekt_contact_person || '';
    const objektPhone = project?.objekt_phone || '';
    const objektEmail = project?.objekt_email || '';
    
    // Company info für Header - verwende die Felder aus den Einstellungen
    const companyName = settings.company_name || '';
    const companySubtitle = settings.company_subtitle || '';
    const companyStreet = settings.street || '';
    const companyZipCode = settings.zip_code || '';
    const companyCity = settings.city || '';
    const companyPhone = settings.phone || '';
    const companyMobilePhone = settings.mobile_phone || '';
    const companyFax = settings.fax || '';
    const companyEmail = settings.email || '';
    const authorName = settings.author_name || '';
    
    // Logo: In Basic Version das Aufmassprofi-Logo verwenden
    let companyLogo = '';
    const isProActive = getProStatus();
    if (isProActive) {
      // Pro Version: Benutzer-Logo aus Einstellungen
      companyLogo = settings.logo_data || '';
    } else {
      // Basic Version: Aufmassprofi Logo laden
      try {
        const Asset = require('expo-asset').Asset;
        const iconAsset = Asset.fromModule(require('../../assets/images/icon.png'));
        await iconAsset.downloadAsync();
        if (iconAsset.localUri) {
          const base64 = await readAsStringAsync(iconAsset.localUri, { encoding: 'base64' });
          companyLogo = `data:image/png;base64,${base64}`;
        }
      } catch (e) {
        console.log('Could not load Basic logo for PDF:', e);
        companyLogo = '';
      }
    }
    
    // PDF Layout Einstellungen
    const checklistColumns = (settings as any).pdf_checklist_columns || 2;
    // Feste Spaltenanzahl statt auto-fit
    const gridColumns = checklistColumns === 1 ? '1fr' : checklistColumns === 2 ? '1fr 1fr' : '1fr 1fr 1fr';
    
    // Farb-Optionen für alle Bereiche
    const colorOptions: { [key: string]: { color: string; textColor: string } } = {
      blue: { color: '#1976d2', textColor: '#ffffff' },
      light_blue: { color: '#bbdefb', textColor: '#1565c0' },
      gray: { color: '#9e9e9e', textColor: '#ffffff' },
      light_gray: { color: '#e0e0e0', textColor: '#424242' },
      green: { color: '#388e3c', textColor: '#ffffff' },
      light_green: { color: '#c8e6c9', textColor: '#2e7d32' },
      orange: { color: '#f57c00', textColor: '#ffffff' },
      red: { color: '#d32f2f', textColor: '#ffffff' },
      black: { color: '#212121', textColor: '#ffffff' },
      white: { color: '#ffffff', textColor: '#333333' },
    };
    
    // Größen-Mapping für Schrift und Padding - deutlichere Unterschiede
    const sizeMapping = {
      small: { fontSize: 10, padding: 4, h1Size: 12, h2Size: 9 },
      medium: { fontSize: 14, padding: 8, h1Size: 16, h2Size: 11 },
      large: { fontSize: 18, padding: 14, h1Size: 22, h2Size: 14 },
    };
    
    // ===== HEADER SECTION SETTINGS =====
    const headerColorId = (settings as any).pdf_header_section_color || (settings as any).pdf_header_color || 'blue';
    const headerStyleSetting = (settings as any).pdf_header_section_style || (settings as any).pdf_header_style || 'filled';
    const headerSizeSetting = (settings as any).pdf_header_size || 'medium';
    const headerColor = colorOptions[headerColorId] || colorOptions.blue;
    const headerSize = sizeMapping[headerSizeSetting as keyof typeof sizeMapping] || sizeMapping.medium;
    
    // Header-Farben basierend auf Stil
    const headerBgColor = headerStyleSetting === 'outline' ? '#ffffff' : headerColor.color;
    const headerTextColor = headerStyleSetting === 'outline' ? headerColor.color : headerColor.textColor;
    const headerBorderStyle = headerStyleSetting === 'outline' ? `border: 2px solid ${headerColor.color};` : '';
    
    // ===== PROJECT TYPE (HEADLINE) SECTION SETTINGS =====
    const projectTypeColorId = (settings as any).pdf_project_type_color || headerColorId;
    const projectTypeStyleSetting = (settings as any).pdf_project_type_style || headerStyleSetting;
    const projectTypeSizeSetting = (settings as any).pdf_project_type_size || 'medium';
    const projectTypeColor = colorOptions[projectTypeColorId] || colorOptions.blue;
    const projectTypeSize = sizeMapping[projectTypeSizeSetting as keyof typeof sizeMapping] || sizeMapping.medium;
    
    // Project Type-Farben basierend auf Stil
    const projectTypeBgColor = projectTypeStyleSetting === 'outline' ? '#ffffff' : projectTypeColor.color;
    const projectTypeTextColor = projectTypeStyleSetting === 'outline' ? projectTypeColor.color : projectTypeColor.textColor;
    const projectTypeBorderStyle = projectTypeStyleSetting === 'outline' ? `border: 2px solid ${projectTypeColor.color};` : `border: 1px solid ${projectTypeColor.color};`;
    
    // ===== TOOLS SECTION SETTINGS (Info, Fotos, Skizzen, etc.) =====
    const toolsColorId = (settings as any).pdf_tools_color || headerColorId;
    const toolsStyleSetting = (settings as any).pdf_tools_style || 'filled';
    const toolsSizeSetting = (settings as any).pdf_tools_size || 'medium';
    const toolsColor = colorOptions[toolsColorId] || colorOptions.blue;
    const toolsSize = sizeMapping[toolsSizeSetting as keyof typeof sizeMapping] || sizeMapping.medium;
    
    // Tools-Farben (für Section Headers)
    const toolsAccentColor = toolsColor.color;
    const toolsBgColor = toolsStyleSetting === 'outline' ? '#ffffff' : toolsColor.color;
    const toolsTextColor = toolsStyleSetting === 'outline' ? toolsColor.color : toolsColor.textColor;
    
    // Legacy: Akzentfarbe für Überschriften im Dokument (verwendet jetzt Tools-Farbe)
    const accentColor = toolsAccentColor;
    // Legacy: Altes pdfColor für Abwärtskompatibilität
    const pdfColor = headerColor;
    const pdfHeaderStyle = headerStyleSetting;
    
    // Format date
    const formatDate = (dateStr: string) => {
      try {
        const date = new Date(dateStr);
        return date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
      } catch {
        return dateStr;
      }
    };
    
    // Generate roofs HTML with more details
    const roofsHtml = roofs.length > 0 ? roofs.map((roof, idx) => {
      let measurementsHtml = '';
      if (roof.measurements && typeof roof.measurements === 'object') {
        const m = roof.measurements;
        measurementsHtml = `
          <div class="measurements-grid">
            ${m.gebaeudelaenge ? `<div class="measure-item"><span class="measure-label">Gebäudelänge:</span> ${m.gebaeudelaenge} m</div>` : ''}
            ${m.gebaeudebreite ? `<div class="measure-item"><span class="measure-label">Gebäudebreite:</span> ${m.gebaeudebreite} m</div>` : ''}
            ${m.traufhoehe ? `<div class="measure-item"><span class="measure-label">Traufhöhe:</span> ${m.traufhoehe} m</div>` : ''}
            ${m.firsthoehe ? `<div class="measure-item"><span class="measure-label">Firsthöhe:</span> ${m.firsthoehe} m</div>` : ''}
            ${m.dachneigung1 ? `<div class="measure-item"><span class="measure-label">Dachneigung:</span> ${m.dachneigung1}°</div>` : ''}
            ${m.dachueberstand ? `<div class="measure-item"><span class="measure-label">Dachüberstand:</span> ${m.dachueberstand} m</div>` : ''}
            ${m.sparrenlaenge ? `<div class="measure-item"><span class="measure-label">Sparrenlänge:</span> ${m.sparrenlaenge} m</div>` : ''}
            ${m.ortganglaenge ? `<div class="measure-item"><span class="measure-label">Ortganglänge:</span> ${m.ortganglaenge} m</div>` : ''}
            ${m.firstlaenge ? `<div class="measure-item"><span class="measure-label">Firstlänge:</span> ${m.firstlaenge} m</div>` : ''}
            ${m.trauflaenge ? `<div class="measure-item"><span class="measure-label">Trauflänge:</span> ${m.trauflaenge} m</div>` : ''}
          </div>
        `;
      }
      return `
        <div class="roof-card">
          <h4>Dachfläche ${idx + 1}: ${roof.roof_type || 'Unbenannt'}</h4>
          <div class="roof-area"><strong>Gesamtfläche:</strong> ${roof.area?.toFixed(2) || 0} m²</div>
          ${measurementsHtml}
          ${roof.notes ? `<div class="roof-notes"><strong>Notizen:</strong> ${roof.notes}</div>` : ''}
        </div>
      `;
    }).join('') : '<p class="empty">Keine Dachflächen erfasst</p>';
    
    // Generate checklists HTML with new hierarchical layout
    // Helper: Flatten deep sub-items for PDF
    const flattenDeepSubItemsForPdf = (items: any[], basePrefix: string): { text: string; level: number; prefix: string; note?: string; measurements?: any[] }[] => {
      const result: { text: string; level: number; prefix: string; note?: string; measurements?: any[] }[] = [];
      items.forEach((item, index) => {
        const currentPrefix = `${basePrefix}.${index + 1}`;
        const currentLevel = currentPrefix.split('.').length - 2;
        if (item.checked) {
          result.push({ text: item.text, level: currentLevel, prefix: currentPrefix, note: item.note, measurements: item.measurements });
        }
        if (item.subItems && item.subItems.length > 0) {
          result.push(...flattenDeepSubItemsForPdf(item.subItems, currentPrefix));
        }
      });
      return result;
    };
    
    // Helper: Format measurement for display
    const formatMeasurementForPdf = (m: any): string => {
      const expr = m.expression || m.value?.toString() || '0';
      const result = m.result ?? m.value ?? 0;
      return `${expr.replace(/\./g, ',').replace(/\*/g, '×')} = ${result.toString().replace('.', ',')} ${m.unit}`;
    };
    
    // Helper: Count checked items recursively
    const countCheckedForPdf = (items: any[]): number => {
      let total = 0;
      items.forEach(item => {
        if (item.checked) total++;
        if (item.subItems && item.subItems.length > 0) {
          total += countCheckedForPdf(item.subItems);
        }
      });
      return total;
    };
    
    // Helper: Count total items recursively
    const countTotalForPdf = (items: any[]): number => {
      let total = items.length;
      items.forEach(item => {
        if (item.subItems && item.subItems.length > 0) {
          total += countTotalForPdf(item.subItems);
        }
      });
      return total;
    };
    
    const checklistItems = checklists.length > 0 ? checklists.map((checklist, checklistIndex) => {
      // Filter checked main categories
      const checkedCategories = checklist.items.filter((item: any) => item.checked);
      
      if (checkedCategories.length === 0) {
        return `
          <div class="checklist-card">
            <div class="checklist-main-header">${checklist.template_name}</div>
            <p class="empty">Keine Positionen abgehakt</p>
          </div>
        `;
      }
      
      // Build categories HTML
      const categoriesHtml = checkedCategories.map((category: any, catIndex: number) => {
        const level1Items = category.subItems || [];
        const checkedLevel1 = level1Items.filter((item: any) => item.checked);
        const checkedSubCount = category.subItems ? countCheckedForPdf(category.subItems) : 0;
        const totalSubCount = category.subItems ? countTotalForPdf(category.subItems) : 0;
        
        // Build level 1 containers
        const containersHtml = checkedLevel1.map((l1Item: any) => {
          const originalIndex = level1Items.indexOf(l1Item);
          const containerPrefix = `${catIndex + 1}.${originalIndex + 1}`;
          const deepSubs = l1Item.subItems ? flattenDeepSubItemsForPdf(l1Item.subItems, containerPrefix) : [];
          
          const deepSubsHtml = deepSubs.map(sub => `
            <div class="pdf-deep-sub" style="padding-left: ${sub.level * 10}px;">
              <span class="pdf-deep-prefix">${sub.prefix}</span>
              <span class="pdf-checkmark">✓</span>
              <span class="pdf-deep-text">${sub.text}</span>
            </div>
            ${sub.note ? `<div class="pdf-note" style="margin-left: ${sub.level * 10 + 36}px;"><span class="pdf-note-icon">📝</span> ${sub.note}</div>` : ''}
            ${sub.measurements && sub.measurements.length > 0 ? `<div class="pdf-measurement" style="margin-left: ${sub.level * 10 + 36}px;">${sub.measurements.map((m: any) => `📐 ${formatMeasurementForPdf(m)}`).join('<br>')}</div>` : ''}
          `).join('');
          
          return `
            <div class="pdf-level1-container">
              <div class="pdf-level1-header">
                <span class="pdf-level1-prefix">${containerPrefix}</span>
                <span class="pdf-checkmark-circle">✓</span>
                <span class="pdf-level1-title">${l1Item.text}</span>
                ${l1Item.printImage ? `<img src="${l1Item.printImage}" class="pdf-print-thumbnail-small" alt="Bild" />` : ''}
              </div>
              ${l1Item.note ? `<div class="pdf-note"><span class="pdf-note-icon">📝</span> ${l1Item.note}</div>` : ''}
              ${l1Item.measurements && l1Item.measurements.length > 0 ? `<div class="pdf-measurement">${l1Item.measurements.map((m: any) => `📐 ${formatMeasurementForPdf(m)}`).join('<br>')}</div>` : ''}
              ${deepSubs.length > 0 ? `<div class="pdf-level1-content">${deepSubsHtml}</div>` : ''}
            </div>
          `;
        }).join('');
        
        return `<!--CATEGORY_SPLIT-->
          <div class="pdf-category-section cols-${checklistColumns}" style="page-break-inside: avoid; break-inside: avoid; margin-bottom: 8px;">
            <div class="pdf-category-header">
              ${category.categoryLogo ? `<img src="${category.categoryLogo}" class="pdf-category-logo" alt="Logo" />` : ''}
              <span class="pdf-cat-check">✓</span>
              <span class="pdf-category-title">${category.text}</span>
              ${category.printImage ? `<img src="${category.printImage}" class="pdf-print-thumbnail" alt="Bild" />` : ''}
              ${totalSubCount > 0 ? `<span class="pdf-category-count">${checkedSubCount}/${totalSubCount}</span>` : ''}
            </div>
            ${category.note ? `<div class="pdf-category-note"><span class="pdf-note-icon">📝</span> ${category.note}</div>` : ''}
            ${category.measurements && category.measurements.length > 0 ? `
              <div class="pdf-category-measurements">
                ${category.measurements.map((m: any) => `<div class="pdf-measurement-line">📐 ${formatMeasurementForPdf(m)}</div>`).join('')}
                ${(() => {
                  const sumsByUnit: { [unit: string]: number } = {};
                  category.measurements.forEach((m: any) => {
                    const result = m.result ?? (m as any).value ?? 0;
                    sumsByUnit[m.unit] = (sumsByUnit[m.unit] || 0) + result;
                  });
                  const units = Object.keys(sumsByUnit);
                  if (units.length > 0) {
                    return `<div class="pdf-measurement-sum">Summen: ${units.map(u => `<span class="pdf-sum-badge">${sumsByUnit[u].toFixed(2).replace('.', ',')} ${u}</span>`).join(' ')}</div>`;
                  }
                  return '';
                })()}
              </div>
            ` : ''}
            <div class="pdf-level1-grid" style="display: grid; grid-template-columns: repeat(${checklistColumns}, 1fr); gap: 3px; width: 100%;">${containersHtml}</div>
          </div>
        `;
      }).join('');
      
      const totalChecked = countCheckedForPdf(checklist.items);
      const totalItems = countTotalForPdf(checklist.items);
      
      // Template Logo für PDF
      const templateLogoHtml = (checklist as any).templateLogo 
        ? `<img src="${(checklist as any).templateLogo}" class="pdf-template-logo" alt="Logo" />`
        : '';
      
      return { categoriesHtml, totalChecked, totalItems, templateLogoHtml };
    }) : [];

    // Alle Checklisten als einfache divs generieren
    // Jede Kategorie bekommt eine "Checklisten" Überschrift für Seitenumbrüche
    const checklistsHtml = checklistItems.length > 0 ? checklistItems.map((item, idx) => {
      if (!item) return '';
      
      const categoryHtmls = item.categoriesHtml.split('<!--CATEGORY_SPLIT-->').filter(Boolean);
      
      // Checklist-Header (z.B. "Dachsanierung 25/25")
      const cardHeader = `
        <div style="page-break-inside: avoid; break-inside: avoid;">
          <div style="font-size: 11px; font-weight: bold; color: #c62828; border-bottom: 2px solid #c62828; padding-bottom: 2px; margin-bottom: 4px; margin-top: ${idx > 0 ? '10px' : '0'};">${t('checklists.title')}</div>
          <div class="checklist-main-header">
            ${item.templateLogoHtml}
            <span class="checklist-main-title">${checklists[idx]?.template_name || ''}</span>
            <span class="checklist-main-count">${item.totalChecked} von ${item.totalItems}</span>
          </div>
          ${categoryHtmls.length > 0 ? categoryHtmls[0] : ''}
        </div>
      `;
      
      // Restliche Kategorien — jede als eigener Block mit "Checklisten" Marker
      const restCategories = categoryHtmls.slice(1).map(catHtml => `
        <div style="page-break-inside: avoid; break-inside: avoid;">
          <div style="font-size: 11px; font-weight: bold; color: #c62828; border-bottom: 2px solid #c62828; padding-bottom: 2px; margin-bottom: 4px; margin-top: 6px;">${t('checklists.title')}</div>
          ${catHtml}
        </div>
      `).join('');
      
      return cardHeader + restCategories;
    }).join('')
    : '<p class="empty">Keine Checklisten erfasst</p>';
    
    // Generate photos HTML (embedded as base64) with individual sizes
    // Neue Logik: Fotos bleiben in der ursprünglichen Reihenfolge
    // Jedes Foto bekommt page-break-inside: avoid
    // Die Größe bestimmt nur wie viel Platz das Foto einnimmt
    
    // iOS (iPhone UND iPad): Block-Layout für saubere Seitenumbrüche
    // WebKit ignoriert page-break-inside: avoid bei Flexbox-Containern
    // iPhone: Alles untereinander (display: block, width: 100%)
    // iPad: inline-block Layout (mehrere nebeneinander, aber Seitenumbrüche werden respektiert)
    const isIOSDevice = Platform.OS === 'ios';
    const isIpad = Platform.OS === 'ios' && Platform.isPad;
    const isIphone = Platform.OS === 'ios' && !Platform.isPad;
    
    // Hilfsfunktion um Fotos-HTML zu generieren - mit inline styles für zuverlässiges Drucken
    const generatePhotoHtml = (photo: typeof photos[0]) => {
      const size = (photo as any).pdf_size || 'medium';
      
      let annotationSvg = '';
      if ((photo as any).annotations) {
        try {
          const annotationData = JSON.parse((photo as any).annotations);
          const canvasWidth = annotationData.canvasWidth || 400;
          const canvasHeight = annotationData.canvasHeight || 300;
          let svgContent = '';
          
          // Render paths (drawing annotations)
          if (annotationData.paths && annotationData.paths.length > 0) {
            svgContent += annotationData.paths.map((p: any) => 
              `<path d="${p.path}" stroke="${p.color || '#FF0000'}" stroke-width="${p.strokeWidth || 3}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`
            ).join('');
          }
          
          // Render text elements (including date/time stamps)
          if (annotationData.textElements && annotationData.textElements.length > 0) {
            svgContent += annotationData.textElements.map((t: any) => {
              const escapedText = (t.text || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
              const fontFamily = t.fontFamily === 'System' ? 'Arial, sans-serif' : (t.fontFamily || 'Arial, sans-serif');
              return `<text x="${t.x}" y="${t.y}" font-size="${t.fontSize || 20}" fill="${t.color || '#FFFFFF'}" font-family="${fontFamily}" font-weight="bold" stroke="#000000" stroke-width="0.5" paint-order="stroke">${escapedText}</text>`;
            }).join('');
          }
          
          if (svgContent) {
            annotationSvg = `<svg class="photo-annotations" viewBox="0 0 ${canvasWidth} ${canvasHeight}" preserveAspectRatio="xMidYMid slice">${svgContent}</svg>`;
          }
        } catch (e) {
          console.error('Error parsing photo annotations:', e);
        }
      }
      
      // Bestimme Breite und max-height basierend auf Größe
      let width = '48%'; // medium default
      let maxImgHeight = '280px';
      let display = 'inline-block';
      
      if (size === 'small') {
        width = '31%';
        maxImgHeight = '180px';
      } else if (size === 'large' || size === 'full') {
        width = '100%';
        maxImgHeight = '400px';
        display = 'block';
      }
      
      return `
        <div style="display: ${display}; width: ${width}; vertical-align: top; margin: 0 1% 10px 0; page-break-inside: avoid; break-inside: avoid;">
          <div style="border: 1px solid #e0e0e0; border-radius: 6px; overflow: hidden; background: #fff;">
            <div style="position: relative; display: block; width: 100%;">
              <img src="${photo.image_data}" alt="Foto" style="display: block; width: 100%; height: auto; max-height: ${maxImgHeight}; object-fit: contain; background: #f5f5f5;" />
              ${annotationSvg}
            </div>
            ${photo.description ? `<p style="margin: 0; padding: 8px; font-size: 10px; color: #666; background: #f8f9fa;">${photo.description}</p>` : ''}
          </div>
        </div>
      `;
    };
    
    // Erzeuge Fotos in der ursprünglichen Reihenfolge
    let photosHtml = '';
    
    if (photos.length > 0) {
      const photoItems = photos.map(photo => generatePhotoHtml(photo)).join('');
      // iOS: Saubere Seitenumbrüche
      // iPhone: block layout (untereinander)
      // iPad: inline-block layout (nebeneinander, aber Seitenumbrüche respektiert)
      const photosContainerClass = isIphone 
        ? 'photos-print-container photos-print-iphone' 
        : isIpad 
          ? 'photos-print-container photos-print-ipad'
          : 'photos-print-container';
      photosHtml = `<div class="${photosContainerClass}" style="font-size: 0;">${photoItems}</div>`;
    } else {
      photosHtml = '<p class="empty">Keine Fotos erfasst</p>';
    }
    
    // Generate sketches HTML (embedded as base64/SVG) with size options
    // iPhone: kleinere Skizzen (2 pro Seite) für bessere Kompatibilität
    // iPad: normale Größe
    
    const sketchItems = sketches.map((sketch, index) => {
      // Read pdf_size and notes from sketch object or metadata
      let size = sketch.pdf_size || 'large';
      let sketchNotes = sketch.notes || '';
      
      // Also try to read from metadata as fallback
      try {
        const metadata = sketch.metadata ? JSON.parse(sketch.metadata) : {};
        if (!size || size === 'large') {
          if (metadata.pdf_size) {
            size = metadata.pdf_size;
          }
        }
        // Notes aus metadata als Fallback
        if (!sketchNotes && metadata.notes) {
          sketchNotes = metadata.notes;
        }
      } catch (e) {
        console.log('Error parsing sketch metadata:', e);
      }
      
      // Größenklasse basierend auf pdf_size - für alle Geräte gleich
      let sizeClass = 'sketch-large'; // Default
      if (size === 'small') sizeClass = 'sketch-small';
      else if (size === 'medium') sizeClass = 'sketch-medium';
      else if (size === 'full') sizeClass = 'sketch-full';
      else sizeClass = 'sketch-large';
      
      // Titel für Skizze
      const sketchTitle = sketch.title || `Skizze ${index + 1}`;
      
      // Notizen nur anzeigen wenn vorhanden - kompakt inline
      const notesHtml = sketchNotes.trim() 
        ? `<div class="sketch-notes sketch-notes-filled">
            <span class="sketch-notes-label">Notizen: </span><span class="sketch-notes-text">${sketchNotes.replace(/\n/g, '<br>')}</span>
          </div>`
        : '';
      
      return `
        <div class="sketch-item ${sizeClass}">
          <p class="sketch-title">${sketchTitle}</p>
          ${sketch.sketch_data ? `<img src="${sketch.sketch_data}" alt="Skizze" />` : '<div class="sketch-placeholder">Skizze</div>'}
          ${notesHtml}
        </div>
      `;
    });
    
    // Sketches-Container: iOS bekommt block/inline-block Layout für bessere Seitenumbrüche
    // WebKit (iOS) ignoriert page-break-inside: avoid bei Flexbox-Containern
    const sketchesContainerClass = isIphone 
      ? 'sketches-container sketches-container-iphone' 
      : isIpad 
        ? 'sketches-container sketches-container-ipad'
        : 'sketches-container';
    
    const sketchesHtml = sketches.length > 0 ? `
      <div class="${sketchesContainerClass}">
        ${sketchItems.join('')}
      </div>
    ` : '<p class="empty">Keine Skizzen erfasst</p>';
    
    // Helper function to calculate polygon area
    const calculatePolygonArea = (points: Array<{x: number, y: number}>, scale: number = 100) => {
      if (points.length < 3) return 0;
      let area = 0;
      for (let i = 0; i < points.length; i++) {
        const j = (i + 1) % points.length;
        area += points[i].x * points[j].y;
        area -= points[j].x * points[i].y;
      }
      return Math.abs(area / 2) / (scale * scale);
    };
    
    // Helper function to calculate line length
    const calculateLineLength = (p1: {x: number, y: number}, p2: {x: number, y: number}, scale: number = 100) => {
      return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2)) / scale;
    };
    
    // Category colors
    const getCategoryColor = (category: string): string => {
      // First try to find color from loaded line categories
      const loadedCat = pdfLineCategories.find(c => c.name === category);
      if (loadedCat) {
        return loadedCat.color;
      }
      // Fallback to hardcoded colors
      const colors: { [key: string]: string } = {
        'Ortgang': '#4CAF50', 'Traufe': '#2196F3', 'First': '#9C27B0',
        'Kehle': '#673AB7', 'Grat': '#FF9800', 'Fensterbank': '#795548',
        'Sturz': '#607D8B', 'Laibung': '#E91E63', 'Rinne': '#00BCD4',
        'Fensterumfang': '#FF5722', 'Sockelleiste': '#795548',
        'Ortgang rechts': '#4CAF50', 'Ortgang links': '#4CAF50',
      };
      return colors[category] || '#607D8B';
    };
    
    // Generate FULL SVG drawing for a calculation (large, with all details)
    const generateFullCalcSvg = (calc: any) => {
      const polygons = calc.polygons || [];
      const calcLines = calc.lines || [];
      const calcScale = calc.scale || 100;
      const calcBackgroundImage = calc.backgroundImage || null;
      if (polygons.length === 0) return '';
      
      // Find bounding box
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      polygons.forEach((p: any) => {
        p.points.forEach((pt: any) => {
          minX = Math.min(minX, pt.x);
          minY = Math.min(minY, pt.y);
          maxX = Math.max(maxX, pt.x);
          maxY = Math.max(maxY, pt.y);
        });
      });
      
      const padding = 50;
      const width = maxX - minX + padding * 2;
      const height = maxY - minY + padding * 2;
      
      // Scale to fit on page - FULL WIDTH for printing (A4 minus margins ~700px)
      const maxWidth = 700;
      const scaleRatio = Math.min(maxWidth / width, 550 / height);
      const svgWidth = width * scaleRatio;
      const svgHeight = height * scaleRatio;
      
      const transformPoint = (pt: any) => ({
        x: (pt.x - minX + padding) * scaleRatio,
        y: (pt.y - minY + padding) * scaleRatio
      });
      
      // Calculate areas for overlay
      const mainAreas = polygons.filter((p: any) => p.type === 'main');
      const deductionAreas = polygons.filter((p: any) => p.type === 'deduction');
      const grossArea = mainAreas.reduce((sum: number, p: any) => sum + calculatePolygonArea(p.points, calcScale), 0);
      const deductionsTotal = deductionAreas.reduce((sum: number, p: any) => sum + calculatePolygonArea(p.points, calcScale), 0);
      const netArea = grossArea - deductionsTotal;
      
      let svgContent = `<svg width="${svgWidth}" height="${svgHeight}" viewBox="0 0 ${svgWidth} ${svgHeight}" style="background: #fff; border: 1px solid #ddd; border-radius: 6px;">`;
      
      // Draw light grid
      const gridSize = 25 * scaleRatio;
      svgContent += `<defs><pattern id="grid-${calc.id || 'default'}" width="${gridSize}" height="${gridSize}" patternUnits="userSpaceOnUse">
        <path d="M ${gridSize} 0 L 0 0 0 ${gridSize}" fill="none" stroke="#f5f5f5" stroke-width="0.5"/>
      </pattern></defs>`;
      svgContent += `<rect width="100%" height="100%" fill="url(#grid-${calc.id || 'default'})"/>`;
      
      // Draw polygons - NO FILL for printing (save ink)
      polygons.forEach((polygon: any) => {
        const points = polygon.points.map((p: any) => {
          const tp = transformPoint(p);
          return `${tp.x},${tp.y}`;
        }).join(' ');
        
        const defaultStrokeColor = polygon.type === 'main' ? '#4CAF50' : '#f44336';
        
        // First draw the default polygon outline
        svgContent += `<polygon points="${points}" fill="none" stroke="${defaultStrokeColor}" stroke-width="2"/>`;
        
        // Now overdraw edges that have categories with their category color
        polygon.points.forEach((point: any, index: number) => {
          const nextPoint = polygon.points[(index + 1) % polygon.points.length];
          const lineCategory = calcLines.find((l: any) => l.polygonId === polygon.id && l.pointIndex === index);
          
          if (lineCategory) {
            const tp1 = transformPoint(point);
            const tp2 = transformPoint(nextPoint);
            const catColor = getCategoryColor(lineCategory.category);
            // Draw colored line over the default
            svgContent += `<line x1="${tp1.x}" y1="${tp1.y}" x2="${tp2.x}" y2="${tp2.y}" stroke="${catColor}" stroke-width="3"/>`;
          }
        });
        
        // Draw edge lengths
        polygon.points.forEach((point: any, index: number) => {
          const nextPoint = polygon.points[(index + 1) % polygon.points.length];
          const tp1 = transformPoint(point);
          const tp2 = transformPoint(nextPoint);
          
          const midX = (tp1.x + tp2.x) / 2;
          const midY = (tp1.y + tp2.y) / 2;
          
          const length = calculateLineLength(point, nextPoint, calcScale);
          if (length < 0.1) return;
          
          // Check if this edge has a category
          const lineCategory = calcLines.find((l: any) => l.polygonId === polygon.id && l.pointIndex === index);
          const bgColor = lineCategory ? getCategoryColor(lineCategory.category) : (polygon.type === 'main' ? '#4CAF50' : '#f44336');
          
          // Get shortcut for category
          let labelText = `${length.toFixed(2)}m`;
          let labelWidth = 44;
          if (lineCategory) {
            const catInfo = pdfLineCategories.find(c => c.name === lineCategory.category);
            if (catInfo?.shortcut) {
              labelText = `${catInfo.shortcut} ${length.toFixed(2)}m`;
              labelWidth = 62;
            }
          }
          
          // Draw label background
          const labelHeight = 14;
          svgContent += `<rect x="${midX - labelWidth/2}" y="${midY - labelHeight/2}" width="${labelWidth}" height="${labelHeight}" rx="7" fill="${bgColor}"/>`;
          svgContent += `<text x="${midX}" y="${midY + 4}" text-anchor="middle" font-size="9" font-weight="bold" fill="white">${labelText}</text>`;
        });
        
        // Draw corner points (smaller)
        polygon.points.forEach((point: any) => {
          const tp = transformPoint(point);
          svgContent += `<circle cx="${tp.x}" cy="${tp.y}" r="3" fill="${polygon.type === 'main' ? '#4CAF50' : '#f44336'}" stroke="white" stroke-width="1"/>`;
        });
        
        // Draw area label in center of polygon
        if (polygon.points.length >= 3) {
          const centerX = polygon.points.reduce((sum: number, p: any) => sum + p.x, 0) / polygon.points.length;
          const centerY = polygon.points.reduce((sum: number, p: any) => sum + p.y, 0) / polygon.points.length;
          const tc = transformPoint({ x: centerX, y: centerY });
          const polyArea = calculatePolygonArea(polygon.points, calcScale);
          const areaSign = polygon.type === 'main' ? '+' : '-';
          const areaColor = polygon.type === 'main' ? '#4CAF50' : '#f44336';
          
          // Draw area name and value
          svgContent += `<rect x="${tc.x - 35}" y="${tc.y - 18}" width="70" height="36" rx="4" fill="white" fill-opacity="0.9" stroke="${areaColor}" stroke-width="1"/>`;
          svgContent += `<text x="${tc.x}" y="${tc.y - 4}" text-anchor="middle" font-size="9" font-weight="bold" fill="#333">${polygon.name || (polygon.type === 'main' ? 'Fläche' : 'Abzug')}</text>`;
          svgContent += `<text x="${tc.x}" y="${tc.y + 10}" text-anchor="middle" font-size="10" font-weight="bold" fill="${areaColor}">${areaSign}${polyArea.toFixed(2)}m²</text>`;
        }
      });
      
      // Render annotations (shapes, texts, memos)
      const calcAnnotations = calc.annotations || {};
      
      // Render shapes
      if (calcAnnotations.shapes && calcAnnotations.shapes.length > 0) {
        calcAnnotations.shapes.forEach((shape: any) => {
          const tp1 = transformPoint(shape.startPoint);
          const tp2 = transformPoint(shape.endPoint);
          const color = shape.color || '#FF0000';
          const sw = Math.max(1, shape.strokeWidth * scaleRatio * 0.5);
          
          if (shape.type === 'rectangle' || shape.type === 'rect') {
            const x = Math.min(tp1.x, tp2.x);
            const y = Math.min(tp1.y, tp2.y);
            const w = Math.abs(tp2.x - tp1.x);
            const h = Math.abs(tp2.y - tp1.y);
            svgContent += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="${color}" stroke-width="${sw}"/>`;
          } else if (shape.type === 'circle') {
            const cx = (tp1.x + tp2.x) / 2;
            const cy = (tp1.y + tp2.y) / 2;
            const rx = Math.abs(tp2.x - tp1.x) / 2;
            const ry = Math.abs(tp2.y - tp1.y) / 2;
            svgContent += `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="none" stroke="${color}" stroke-width="${sw}"/>`;
          } else if (shape.type === 'arrow') {
            const angle = Math.atan2(tp2.y - tp1.y, tp2.x - tp1.x);
            const headLen = 10;
            svgContent += `<line x1="${tp1.x}" y1="${tp1.y}" x2="${tp2.x}" y2="${tp2.y}" stroke="${color}" stroke-width="${sw}"/>`;
            svgContent += `<polygon points="${tp2.x},${tp2.y} ${tp2.x - headLen * Math.cos(angle - Math.PI/6)},${tp2.y - headLen * Math.sin(angle - Math.PI/6)} ${tp2.x - headLen * Math.cos(angle + Math.PI/6)},${tp2.y - headLen * Math.sin(angle + Math.PI/6)}" fill="${color}"/>`;
          } else if (shape.type === 'line') {
            svgContent += `<line x1="${tp1.x}" y1="${tp1.y}" x2="${tp2.x}" y2="${tp2.y}" stroke="${color}" stroke-width="${sw}"/>`;
          }
        });
      }
      
      // Render text annotations
      if (calcAnnotations.texts && calcAnnotations.texts.length > 0) {
        calcAnnotations.texts.forEach((text: any) => {
          // Handle both old format (position.x/y) and new format (x/y directly)
          const textX = text.x ?? text.position?.x ?? 0;
          const textY = text.y ?? text.position?.y ?? 0;
          const tp = transformPoint({ x: textX, y: textY });
          const fontSize = Math.max(8, (text.fontSize || 16) * scaleRatio * 0.4);
          svgContent += `<text x="${tp.x}" y="${tp.y}" font-size="${fontSize}" fill="${text.color || '#333'}">${text.text}</text>`;
        });
      }
      
      // Render memo pointers
      if (calcAnnotations.memos && calcAnnotations.memos.length > 0) {
        calcAnnotations.memos.forEach((memo: any) => {
          // Handle both old format (anchorPoint/labelOffset) and new format (x1/y1/x2/y2)
          const anchorX = memo.x2 ?? memo.anchorPoint?.x ?? 0;
          const anchorY = memo.y2 ?? memo.anchorPoint?.y ?? 0;
          const labelX = memo.x1 ?? (memo.anchorPoint?.x + memo.labelOffset?.x) ?? 0;
          const labelY = memo.y1 ?? (memo.anchorPoint?.y + memo.labelOffset?.y) ?? 0;
          
          const anchor = transformPoint({ x: anchorX, y: anchorY });
          const label = transformPoint({ x: labelX, y: labelY });
          const color = memo.color || '#FF9800';
          
          // Line from anchor to label
          svgContent += `<line x1="${anchor.x}" y1="${anchor.y}" x2="${label.x}" y2="${label.y}" stroke="${color}" stroke-width="1.5" stroke-dasharray="3,2"/>`;
          // Anchor dot
          svgContent += `<circle cx="${anchor.x}" cy="${anchor.y}" r="4" fill="${color}"/>`;
          // Label background and text
          const memoText = memo.text || '';
          const textWidth = memoText.length * 5 + 10;
          svgContent += `<rect x="${label.x - 3}" y="${label.y - 10}" width="${textWidth}" height="16" rx="3" fill="white" stroke="${color}" stroke-width="1"/>`;
          svgContent += `<text x="${label.x + 2}" y="${label.y + 2}" font-size="9" fill="${color}">${memoText}</text>`;
        });
      }
      
      svgContent += '</svg>';
      
      // If there's a background image, show it ABOVE the drawing (not overlapping)
      if (calcBackgroundImage) {
        return `
          <div>
            <div style="display: flex; justify-content: flex-end; margin-bottom: 6px;">
              <div style="text-align: center;">
                <div style="font-size: 7px; color: #666; margin-bottom: 2px;">Referenzbild</div>
                <img src="${calcBackgroundImage}" style="width: 80px; max-height: 60px; object-fit: contain; border-radius: 4px; border: 1px solid #ddd; background: #fff;" />
              </div>
            </div>
            <div>${svgContent}</div>
          </div>
        `;
      }
      
      return svgContent;
    };
    
    // Generate Area Calculations HTML - Compact details with two-column positions
    const areaCalcsHtml = areaCalculations.length > 0 ? areaCalculations.map((calc, index) => {
      const polygons = calc.polygons || [];
      const calcLines = calc.lines || [];
      const calcScale = calc.scale || 100;
      const mainAreas = polygons.filter((p: any) => p.type === 'main');
      const deductionAreas = polygons.filter((p: any) => p.type === 'deduction');
      
      const grossArea = mainAreas.reduce((sum: number, p: any) => sum + calculatePolygonArea(p.points, calcScale), 0);
      const deductionsTotal = deductionAreas.reduce((sum: number, p: any) => sum + calculatePolygonArea(p.points, calcScale), 0);
      const netArea = grossArea - deductionsTotal;
      
      // Group lines by category
      const linesByCategory: { [key: string]: number } = {};
      calcLines.forEach((line: any) => {
        const polygon = polygons.find((p: any) => p.id === line.polygonId);
        if (polygon && polygon.points && polygon.points.length > line.pointIndex) {
          const point = polygon.points[line.pointIndex];
          const nextPoint = polygon.points[(line.pointIndex + 1) % polygon.points.length];
          const length = calculateLineLength(point, nextPoint, calcScale);
          if (!linesByCategory[line.category]) linesByCategory[line.category] = 0;
          linesByCategory[line.category] += length;
        }
      });
      
      return `
        <div style="margin-bottom: 12px; page-break-inside: avoid;">
          <!-- Header with name and result - more compact -->
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; padding-bottom: 4px; border-bottom: 2px solid #4CAF50;">
            <span style="font-size: 12px; font-weight: bold;">${calc.name || `Berechnung ${index + 1}`}</span>
            <span style="font-size: 16px; font-weight: bold; color: #4CAF50;">${netArea.toFixed(2)} m²</span>
          </div>
          
          <!-- Drawing - Full width -->
          <div style="text-align: center; margin-bottom: 8px;">
            ${generateFullCalcSvg(calc)}
          </div>
          
          <!-- Compact calculation summary - ohne Hintergrund, nur border-left -->
          <div style="display: flex; gap: 6px; font-size: 8px; line-height: 1.2;">
            <!-- Rechenweg -->
            <div style="padding: 3px 6px; border-left: 2px solid #4CAF50; font-family: monospace; min-width: 90px;">
              <div style="font-size: 7px; color: #666; font-weight: 600;">Rechenweg:</div>
              <div>Brutto: ${grossArea.toFixed(2)} m²</div>
              ${deductionsTotal > 0 ? `<div>− ${deductionsTotal.toFixed(2)} m²</div>` : ''}
              <div style="border-top: 1px solid #333; margin-top: 1px; padding-top: 1px; font-weight: bold;">= ${netArea.toFixed(2)} m²</div>
            </div>
            
            <!-- Flächen -->
            <div style="flex: 1; padding: 3px 6px; border-left: 2px solid #666;">
              ${mainAreas.length > 0 ? `
                <div style="margin-bottom: 2px;">
                  <span style="font-weight: 600; color: #4CAF50; font-size: 7px;">Flächen: </span>
                  ${mainAreas.map((p: any) => `<span style="margin-right: 4px;">${p.name} +${calculatePolygonArea(p.points, calcScale).toFixed(2)}m²</span>`).join('')}
                </div>
              ` : ''}
              ${deductionAreas.length > 0 ? `
                <div>
                  <span style="font-weight: 600; color: #f44336; font-size: 7px;">Abzüge: </span>
                  ${deductionAreas.map((p: any) => `<span style="margin-right: 4px;">${p.name} -${calculatePolygonArea(p.points, calcScale).toFixed(2)}m²</span>`).join('')}
                </div>
              ` : ''}
            </div>
            
            <!-- Linien -->
            ${Object.keys(linesByCategory).length > 0 ? `
              <div style="padding: 3px 6px; border-left: 2px solid #FF9800; min-width: 150px;">
                <div style="font-weight: 600; color: #e65100; font-size: 7px; margin-bottom: 1px;">Linien:</div>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1px 8px;">
                  ${Object.entries(linesByCategory).map(([cat, length]) => `
                    <div style="display: flex; justify-content: space-between; font-size: 7px;">
                      <span style="display: flex; align-items: center;">
                        <span style="width: 4px; height: 4px; border-radius: 50%; background: ${getCategoryColor(cat)}; margin-right: 2px; display: inline-block;"></span>
                        ${formatCategoryForPdf(cat)}
                      </span>
                      <span style="margin-left: 2px;">${(length as number).toFixed(2)}m</span>
                    </div>
                  `).join('')}
                </div>
              </div>
            ` : ''}
          </div>
        </div>
      `;
    }).join('<hr style="border: none; border-top: 1px dashed #ddd; margin: 8px 0;"/>') : '<p class="empty">Keine Flächenberechnungen erfasst</p>';

    // Generate combined area calculations (Drawing + Details together for each calculation)
    const generateCombinedAreaCalcs = () => {
      if (areaCalculations.length === 0) return '<p class="empty">Keine Flächenberechnungen erfasst</p>';
      
      return areaCalculations.map((calc, calcIndex) => {
        const polygons = calc.polygons || [];
        const calcLines = calc.lines || [];
        const calcScale = calc.scale || 100;
        const mainAreas = polygons.filter((p: any) => p.type === 'main');
        const deductionAreas = polygons.filter((p: any) => p.type === 'deduction');
        
        const grossArea = mainAreas.reduce((sum: number, p: any) => sum + calculatePolygonArea(p.points, calcScale), 0);
        const deductionsTotal = deductionAreas.reduce((sum: number, p: any) => sum + calculatePolygonArea(p.points, calcScale), 0);
        const netArea = grossArea - deductionsTotal;
        
        // Generate lines per polygon for details
        const generateLinesForPolygon = (polygon: any) => {
          const polygonLines = calcLines.filter((l: any) => l.polygonId === polygon.id);
          const categoryGroups: { [key: string]: number[] } = {};
          
          polygonLines.forEach((line: any) => {
            if (polygon.points && polygon.points.length > line.pointIndex) {
              const point = polygon.points[line.pointIndex];
              const nextPoint = polygon.points[(line.pointIndex + 1) % polygon.points.length];
              const length = calculateLineLength(point, nextPoint, calcScale);
              if (length > 0.01) {
                if (!categoryGroups[line.category]) {
                  categoryGroups[line.category] = [];
                }
                categoryGroups[line.category].push(length);
              }
            }
          });
          
          if (Object.keys(categoryGroups).length === 0) {
            return '<div style="font-size: 9px; color: #999; font-style: italic; margin-left: 8px;">Keine Kategorien</div>';
          }
          
          return Object.entries(categoryGroups).map(([category, lengths]) => {
            const total = (lengths as number[]).reduce((sum, l) => sum + l, 0);
            const catColor = getCategoryColor(category);
            const breakdown = lengths.length >= 2 ? `<div style="font-size: 8px; color: ${catColor}; margin-left: 16px; opacity: 0.8;">${(lengths as number[]).map(l => l.toFixed(2)).join(' + ')} = ${total.toFixed(2)} m</div>` : '';
            const displayName = formatCategoryForPdf(category);
            
            return `
              <div style="margin-bottom: 2px;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                  <span style="display: flex; align-items: center; color: ${catColor};">
                    <span style="width: 6px; height: 6px; border-radius: 50%; background: ${catColor}; margin-right: 4px; display: inline-block;"></span>
                    <span style="font-size: 9px; font-weight: 600;">${displayName}</span>
                  </span>
                  <span style="font-size: 9px; font-weight: 700; color: ${catColor};">${total.toFixed(2)} m</span>
                </div>
                ${breakdown}
              </div>
            `;
          }).join('');
        };
        
        // Calculate total lines by category
        const totalLinesByCategory: { [key: string]: number } = {};
        calcLines.forEach((line: any) => {
          const polygon = polygons.find((p: any) => p.id === line.polygonId);
          if (polygon && polygon.points && polygon.points.length > line.pointIndex) {
            const point = polygon.points[line.pointIndex];
            const nextPoint = polygon.points[(line.pointIndex + 1) % polygon.points.length];
            const length = calculateLineLength(point, nextPoint, calcScale);
            if (!totalLinesByCategory[line.category]) totalLinesByCategory[line.category] = 0;
            totalLinesByCategory[line.category] += length;
          }
        });
        
        return `
          <!-- ========== BERECHNUNG ${calcIndex + 1}: ZEICHNUNG ========== -->
          <div style="page-break-before: ${calcIndex > 0 ? 'always' : 'auto'}; margin-bottom: 0;">
            <!-- Überschrift für die Zeichnung (Tinte sparend) -->
            <div style="border-bottom: 3px solid #4CAF50; padding-bottom: 8px; margin-bottom: 10px;">
              <div style="display: flex; justify-content: space-between; align-items: flex-end;">
                <div>
                  <div style="font-size: 9px; text-transform: uppercase; letter-spacing: 1px; color: #666;">Flächenberechnung ${calcIndex + 1}</div>
                  <div style="font-size: 16px; font-weight: bold; color: #333;">${calc.name || `Berechnung ${calcIndex + 1}`}</div>
                </div>
                <div style="text-align: right;">
                  <div style="font-size: 9px; color: #666;">Nettofläche</div>
                  <div style="font-size: 22px; font-weight: bold; color: #4CAF50;">${netArea.toFixed(2)} m²</div>
                </div>
              </div>
            </div>
            
            <!-- Zeichnung - Mindestens 60% der Seite -->
            <div style="border: 1px solid #ddd; border-radius: 4px; padding: 10px; background: #fafafa; min-height: 450px; display: flex; align-items: center; justify-content: center;">
              ${generateFullCalcSvg(calc)}
            </div>
            
            <!-- Kurzübersicht unter der Zeichnung - kompakt, kein Hintergrund -->
            <div style="display: flex; gap: 6px; margin-top: 6px; font-size: 8px;">
              <div style="padding: 2px 6px; border-left: 2px solid #4CAF50;">
                <span style="color: #666; font-weight: 600;">Rechenweg: </span>
                <span>Brutto ${grossArea.toFixed(2)} m²${deductionsTotal > 0 ? ` − ${deductionsTotal.toFixed(2)} m²` : ''} = <strong>${netArea.toFixed(2)} m²</strong></span>
              </div>
              
              ${Object.keys(totalLinesByCategory).length > 0 ? `
                <div style="flex: 1; padding: 2px 6px; border-left: 2px solid #FF9800;">
                  <span style="color: #e65100; font-weight: 600;">Linien: </span>
                  ${Object.entries(totalLinesByCategory).map(([cat, length]) => {
                    const catColor = getCategoryColor(cat);
                    return `<span style="margin-right: 6px;"><span style="display: inline-block; width: 4px; height: 4px; border-radius: 50%; background: ${catColor}; margin-right: 2px; vertical-align: middle;"></span><span style="color: ${catColor};">${formatCategoryForPdf(cat)} ${(length as number).toFixed(2)}m</span></span>`;
                  }).join('')}
                </div>
              ` : ''}
            </div>
          </div>
          
          ${showCalcDetailsPage ? `
          <!-- ========== BERECHNUNG ${calcIndex + 1}: DETAILBERECHNUNG ========== -->
          <div style="page-break-before: always;">
            <!-- Überschrift - schlank, nur border-bottom -->
            <div style="border-bottom: 2px solid #1976d2; padding-bottom: 4px; margin-bottom: 8px;">
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <div>
                  <span style="font-size: 8px; text-transform: uppercase; letter-spacing: 0.5px; color: #666;">Details: </span>
                  <span style="font-size: 12px; font-weight: bold; color: #333;">${calc.name || `Berechnung ${calcIndex + 1}`}</span>
                </div>
                <div style="font-size: 14px; font-weight: bold; color: #1976d2;">${netArea.toFixed(2)} m²</div>
              </div>
            </div>
            
            <!-- Kompakte Detail-Tabelle - ohne Hintergrundfarbe -->
            <div style="display: flex; gap: 8px; font-size: 8px;">
              <!-- Hauptflächen -->
              ${mainAreas.length > 0 ? `
                <div style="flex: 1;">
                  <div style="font-size: 9px; font-weight: 700; color: #4CAF50; border-bottom: 1px solid #4CAF50; padding-bottom: 2px; margin-bottom: 4px;">+ Hauptflächen</div>
                  ${mainAreas.map((p: any) => `
                    <div style="border-left: 2px solid #4CAF50; padding: 2px 6px; margin-bottom: 3px;">
                      <div style="display: flex; justify-content: space-between;">
                        <span style="font-weight: 600;">${p.name}</span>
                        <span style="font-weight: 600; color: #4CAF50;">+${calculatePolygonArea(p.points, calcScale).toFixed(2)} m²</span>
                      </div>
                      <div style="margin-top: 1px;">${generateLinesForPolygon(p)}</div>
                    </div>
                  `).join('')}
                </div>
              ` : ''}
              
              <!-- Abzüge -->
              ${deductionAreas.length > 0 ? `
                <div style="flex: 1;">
                  <div style="font-size: 9px; font-weight: 700; color: #f44336; border-bottom: 1px solid #f44336; padding-bottom: 2px; margin-bottom: 4px;">− Abzüge</div>
                  ${deductionAreas.map((p: any) => `
                    <div style="border-left: 2px solid #f44336; padding: 2px 6px; margin-bottom: 3px;">
                      <div style="display: flex; justify-content: space-between;">
                        <span style="font-weight: 600;">${p.name}</span>
                        <span style="font-weight: 600; color: #f44336;">−${calculatePolygonArea(p.points, calcScale).toFixed(2)} m²</span>
                      </div>
                      <div style="margin-top: 1px;">${generateLinesForPolygon(p)}</div>
                    </div>
                  `).join('')}
                </div>
              ` : ''}
            </div>
            
            <!-- Endergebnis - zwei Boxen mit Rahmen wie auf dem Bild -->
            <div style="display: flex; gap: 6px; margin-top: 8px;">
              <!-- Flächenberechnung Box - blauer Rahmen -->
              <div style="flex: 0.8; padding: 4px 8px; border: 1px solid #1976d2; border-radius: 3px;">
                <div style="font-size: 9px; font-weight: 700; color: #1976d2; margin-bottom: 3px;">Flächenberechnung</div>
                <div style="font-family: monospace; font-size: 9px; line-height: 1.3;">
                  <div>Brutto: ${grossArea.toFixed(2)} m²</div>
                  ${deductionsTotal > 0 ? `<div>− Abzüge: ${deductionsTotal.toFixed(2)} m²</div>` : ''}
                  <div style="border-top: 1px solid #333; margin-top: 3px; padding-top: 3px; font-weight: 700; font-size: 11px; color: #4CAF50;">
                    = Netto: ${netArea.toFixed(2)} m²
                  </div>
                </div>
              </div>
              
              <!-- Linien Zusammenfassung Box - oranger Rahmen, breiter -->
              ${Object.keys(totalLinesByCategory).length > 0 ? `
                <div style="flex: 1.2; padding: 4px 8px; border: 1px solid #FF9800; border-radius: 3px;">
                  <div style="font-size: 9px; font-weight: 700; color: #FF9800; margin-bottom: 3px;">Linien Zusammenfassung</div>
                  <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1px 6px;">
                    ${Object.entries(totalLinesByCategory).map(([cat, length]) => `
                      <div style="display: flex; justify-content: space-between; font-size: 8px; white-space: nowrap; overflow: hidden;">
                        <span style="display: flex; align-items: center; min-width: 0; overflow: hidden;">
                          <span style="width: 5px; height: 5px; border-radius: 50%; background: ${getCategoryColor(cat)}; margin-right: 3px; flex-shrink: 0;"></span>
                          <span style="overflow: hidden; text-overflow: ellipsis;">${formatCategoryForPdf(cat)}</span>
                        </span>
                        <span style="font-weight: 600; color: ${getCategoryColor(cat)}; margin-left: 4px; flex-shrink: 0;">${(length as number).toFixed(2)} m</span>
                      </div>
                    `).join('')}
                  </div>
                  <div style="border-top: 1px solid #333; margin-top: 3px; padding-top: 3px; display: flex; justify-content: space-between; font-weight: 700; font-size: 9px;">
                    <span>Gesamt:</span>
                    <span>${Object.values(totalLinesByCategory).reduce((sum: number, l) => sum + (l as number), 0).toFixed(2)} m</span>
                  </div>
                </div>
              ` : ''}
            </div>
          </div>
          ` : ''}
        `;
      }).join('');
    };

    // Generate detailed calculation pages (optional, controlled by showCalcDetailsPage)
    const generateDetailedCalcPages = () => {
      if (!showCalcDetailsPage || areaCalculations.length === 0) return '';
      
      return areaCalculations.map((calc, calcIndex) => {
        const polygons = calc.polygons || [];
        const calcLines = calc.lines || [];
        const calcScale = calc.scale || 100;
        const mainAreas = polygons.filter((p: any) => p.type === 'main');
        const deductionAreas = polygons.filter((p: any) => p.type === 'deduction');
        
        const grossArea = mainAreas.reduce((sum: number, p: any) => sum + calculatePolygonArea(p.points, calcScale), 0);
        const deductionsTotal = deductionAreas.reduce((sum: number, p: any) => sum + calculatePolygonArea(p.points, calcScale), 0);
        const netArea = grossArea - deductionsTotal;
        
        // Generate lines per polygon
        const generateLinesForPolygon = (polygon: any) => {
          const polygonLines = calcLines.filter((l: any) => l.polygonId === polygon.id);
          const categoryGroups: { [key: string]: number[] } = {};
          
          polygonLines.forEach((line: any) => {
            if (polygon.points && polygon.points.length > line.pointIndex) {
              const point = polygon.points[line.pointIndex];
              const nextPoint = polygon.points[(line.pointIndex + 1) % polygon.points.length];
              const length = calculateLineLength(point, nextPoint, calcScale);
              if (length > 0.01) {
                if (!categoryGroups[line.category]) {
                  categoryGroups[line.category] = [];
                }
                categoryGroups[line.category].push(length);
              }
            }
          });
          
          if (Object.keys(categoryGroups).length === 0) {
            return '<div style="font-size: 10px; color: #999; font-style: italic; margin-left: 12px;">Keine Linien-Kategorien zugewiesen</div>';
          }
          
          return Object.entries(categoryGroups).map(([category, lengths]) => {
            const total = (lengths as number[]).reduce((sum, l) => sum + l, 0);
            const breakdown = lengths.length >= 2 ? `<div style="font-size: 9px; color: #666; margin-left: 20px;">${(lengths as number[]).map(l => l.toFixed(2)).join(' + ')} = ${total.toFixed(2)} m</div>` : '';
            const displayName = formatCategoryForPdf(category);
            
            return `
              <div style="margin-bottom: 4px;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                  <span style="display: flex; align-items: center;">
                    <span style="width: 8px; height: 8px; border-radius: 50%; background: ${getCategoryColor(category)}; margin-right: 6px; display: inline-block;"></span>
                    <span style="font-size: 11px;">${displayName}</span>
                  </span>
                  <span style="font-size: 11px; font-weight: 600; color: ${getCategoryColor(category)};">${total.toFixed(2)} m</span>
                </div>
                ${breakdown}
              </div>
            `;
          }).join('');
        };
        
        // Calculate total lines by category for this calculation
        const totalLinesByCategory: { [key: string]: number } = {};
        calcLines.forEach((line: any) => {
          const polygon = polygons.find((p: any) => p.id === line.polygonId);
          if (polygon && polygon.points && polygon.points.length > line.pointIndex) {
            const point = polygon.points[line.pointIndex];
            const nextPoint = polygon.points[(line.pointIndex + 1) % polygon.points.length];
            const length = calculateLineLength(point, nextPoint, calcScale);
            if (!totalLinesByCategory[line.category]) totalLinesByCategory[line.category] = 0;
            totalLinesByCategory[line.category] += length;
          }
        });
        
        return `
          <div class="new-page" style="page-break-before: always;">
            <h2 style="color: #1976d2; font-size: 12px; margin-bottom: 6px; padding-bottom: 4px; border-bottom: 2px solid #1976d2;">
              Details: ${calc.name || `Berechnung ${calcIndex + 1}`}
            </h2>
            
            <!-- Main Areas + Deductions Side by Side - kompakt -->
            <div style="display: flex; gap: 8px; margin-bottom: 6px;">
              <!-- Main Areas Section -->
              ${mainAreas.length > 0 ? `
                <div style="flex: 1;">
                  <h3 style="font-size: 9px; color: #4CAF50; margin-bottom: 3px; border-bottom: 1px solid #4CAF50; padding-bottom: 2px;">Hauptflächen</h3>
                  ${mainAreas.map((p: any) => `
                    <div style="border-left: 2px solid #4CAF50; padding: 2px 6px; margin-bottom: 2px;">
                      <div style="display: flex; justify-content: space-between;">
                        <span style="font-weight: 600; font-size: 8px;">${p.name}</span>
                        <span style="font-weight: 600; color: #4CAF50; font-size: 8px;">+${calculatePolygonArea(p.points, calcScale).toFixed(2)} m²</span>
                      </div>
                      <div style="font-size: 7px; margin-top: 1px;">${generateLinesForPolygon(p)}</div>
                    </div>
                  `).join('')}
                  <div style="padding: 2px 6px; display: flex; justify-content: space-between; border-top: 1px solid #4CAF50;">
                    <span style="font-weight: 600; font-size: 8px;">Brutto:</span>
                    <span style="font-weight: 700; font-size: 8px;">${grossArea.toFixed(2)} m²</span>
                  </div>
                </div>
              ` : ''}
              
              <!-- Deduction Areas Section -->
              ${deductionAreas.length > 0 ? `
                <div style="flex: 1;">
                  <h3 style="font-size: 9px; color: #f44336; margin-bottom: 3px; border-bottom: 1px solid #f44336; padding-bottom: 2px;">Abzüge</h3>
                  ${deductionAreas.map((p: any) => `
                    <div style="border-left: 2px solid #f44336; padding: 2px 6px; margin-bottom: 2px;">
                      <div style="display: flex; justify-content: space-between;">
                        <span style="font-weight: 600; font-size: 8px;">${p.name}</span>
                        <span style="font-weight: 600; color: #f44336; font-size: 8px;">-${calculatePolygonArea(p.points, calcScale).toFixed(2)} m²</span>
                      </div>
                      <div style="font-size: 7px; margin-top: 1px;">${generateLinesForPolygon(p)}</div>
                    </div>
                  `).join('')}
                  <div style="padding: 2px 6px; display: flex; justify-content: space-between; border-top: 1px solid #f44336;">
                    <span style="font-weight: 600; font-size: 8px;">Gesamt:</span>
                    <span style="font-weight: 700; color: #f44336; font-size: 8px;">-${deductionsTotal.toFixed(2)} m²</span>
                  </div>
                </div>
              ` : ''}
            </div>
            
            <!-- Final Calculation + Lines Summary - mit Rahmen wie auf dem Bild -->
            <div style="display: flex; gap: 6px;">
              <!-- Flächenberechnung - blauer Rahmen -->
              <div style="flex: 0.8; padding: 4px 8px; border: 1px solid #1976d2; border-radius: 3px;">
                <h3 style="font-size: 9px; color: #1976d2; margin-bottom: 3px;">Flächenberechnung</h3>
                <div style="font-family: monospace; font-size: 9px; line-height: 1.3;">
                  <div>Brutto: ${grossArea.toFixed(2)} m²</div>
                  ${deductionsTotal > 0 ? `<div>− Abzüge: ${deductionsTotal.toFixed(2)} m²</div>` : ''}
                  <div style="border-top: 1px solid #333; margin-top: 3px; padding-top: 3px; font-weight: 700; font-size: 11px; color: #4CAF50;">
                    = Netto: ${netArea.toFixed(2)} m²
                  </div>
                </div>
              </div>
              
              <!-- Linien Zusammenfassung - oranger Rahmen, breiter -->
              ${Object.keys(totalLinesByCategory).length > 0 ? `
                <div style="flex: 1.2; padding: 4px 8px; border: 1px solid #FF9800; border-radius: 3px;">
                  <h3 style="font-size: 9px; color: #FF9800; margin-bottom: 3px;">Linien Zusammenfassung</h3>
                  <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1px 6px;">
                    ${Object.entries(totalLinesByCategory).map(([cat, length]) => `
                      <div style="display: flex; justify-content: space-between; font-size: 8px; white-space: nowrap; overflow: hidden;">
                        <span style="display: flex; align-items: center; min-width: 0; overflow: hidden;">
                          <span style="width: 5px; height: 5px; border-radius: 50%; background: ${getCategoryColor(cat)}; margin-right: 3px; flex-shrink: 0;"></span>
                          <span style="overflow: hidden; text-overflow: ellipsis;">${formatCategoryForPdf(cat)}</span>
                        </span>
                        <span style="font-weight: 600; color: ${getCategoryColor(cat)}; margin-left: 4px; flex-shrink: 0;">${(length as number).toFixed(2)} m</span>
                      </div>
                    `).join('')}
                  </div>
                  <div style="border-top: 1px solid #333; margin-top: 3px; padding-top: 3px; display: flex; justify-content: space-between; font-weight: 700; font-size: 9px;">
                    <span>Gesamt:</span>
                    <span>${Object.values(totalLinesByCategory).reduce((sum: number, l) => sum + (l as number), 0).toFixed(2)} m</span>
                  </div>
                </div>
              ` : ''}
            </div>
            
            <!-- Footer - kompakt -->
            <div style="text-align: center; font-size: 8px; color: #1976d2; font-weight: 600; margin-top: 12px; padding-top: 6px; border-top: 1px solid #1976d2;">
              ${t('pdf.createdWith')} - Aufmassprofi - • ${formatDate(new Date().toISOString())}
            </div>
          </div>
        `;
      }).join('');
    };

    const detailedCalcPagesHtml = generateDetailedCalcPages();

    // Build complete HTML
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          @page {
            margin: 15mm;
            size: A4;
          }
          @media screen {
            body {
              background: #e0e0e0 !important;
              padding: 10px !important;
            }
            .page {
              background: #fff;
              width: 210mm;
              min-height: auto; /* Keine feste Höhe - Inhalt bestimmt die Höhe */
              padding: 15mm;
              margin: 0 auto 10px auto;
              box-shadow: 0 4px 12px rgba(0,0,0,0.15);
              border-radius: 2px;
              position: relative;
            }
            .page-break {
              display: none;
            }
            .new-page, .remarks-and-footer-page {
              background: #fff;
              width: 210mm;
              min-height: 297mm;
              padding: 15mm;
              margin: 10px auto;
              box-shadow: 0 4px 12px rgba(0,0,0,0.15);
              border-radius: 2px;
              position: relative;
            }
          }
          @media print {
            body {
              background: #fff !important;
              padding: 0 !important;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
              color-adjust: exact !important;
            }
            .page {
              width: auto;
              min-height: auto;
              padding: 0mm 5mm;
              margin: 0;
              box-shadow: none;
              border-radius: 0;
            }
            /* iOS WebKit Fix: Grid/Flex in Eltern-Elementen bricht page-break für alle nachfolgenden Geschwister */
            .info-grid {
              display: block !important;
            }
            .info-grid .info-box {
              display: inline-block !important;
              width: 48% !important;
              vertical-align: top !important;
              margin-right: 1% !important;
              margin-bottom: 5px !important;
            }
            .info-row {
              display: block !important;
              overflow: hidden !important;
            }
            .info-label {
              float: left !important;
              display: inline !important;
            }
            .info-value {
              display: inline !important;
            }
            .page .header {
              margin: 0 0 10px 0 !important;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
              background: ${headerBgColor} !important;
            }
            .new-page, .remarks-and-footer-page {
              width: auto;
              min-height: auto;
              padding: 0mm 5mm;
              margin: 0;
              box-shadow: none;
              border-radius: 0;
              page-break-before: always;
            }
            .remarks-page {
              page-break-before: always;
              display: block !important;
              visibility: visible !important;
            }
            .remarks-section {
              display: block !important;
              visibility: visible !important;
            }
            .remarks-box {
              display: block !important;
              visibility: visible !important;
            }
            /* Checklisten: Kein Seitenumbruch auf Sektionsebene - fließt natürlich */
            .checklists-page-break {
              /* page-break-before removed for compact layout */
            }
            /* Section-Headers nicht am Seitenende allein lassen */
            h2, h3 {
              page-break-after: avoid !important;
              break-after: avoid !important;
              orphans: 3;
              widows: 3;
            }
            /* Checklist-Kategorien als Einheit halten */
            .pdf-category-section {
              page-break-inside: avoid !important;
              break-inside: avoid !important;
            }
            /* Checklist-Cards dürfen umbrechen */
            .checklist-card {
              page-break-inside: auto !important;
              break-inside: auto !important;
            }
            /* Checklisten-Tabelle: Überschrift wiederholt sich auf jeder Seite */
            .checklists-table {
              page-break-inside: auto !important;
              width: 100%;
            }
            .checklists-table thead {
              display: table-header-group !important;
            }
            .checklists-table thead th {
              background: #fff !important;
            }
            .checklists-table tbody tr {
              page-break-inside: avoid !important;
              break-inside: avoid !important;
            }
            .checklists-table td, .checklists-table th {
              border: none !important;
            }
            /* Checklist-Items nicht umbrechen */
            .checklist-item {
              page-break-inside: avoid !important;
              break-inside: avoid !important;
            }
            /* Roof-Sections nicht umbrechen */
            .roof-detail {
              page-break-inside: avoid !important;
              break-inside: avoid !important;
            }
            /* Calculator-Sections nicht umbrechen */
            .calc-detail {
              page-break-inside: avoid !important;
              break-inside: avoid !important;
            }
            /* Neue Seite für große Abschnitte */
            .section-page-break {
              page-break-before: always !important;
              break-before: always !important;
            }
            /* Foto-Layouts für Druck */
            .photos-section {
              margin-bottom: 15px !important;
            }
            .photos-section-small {
              display: grid !important;
              grid-template-columns: repeat(3, 1fr) !important;
              gap: 8px !important;
            }
            .photos-section-small .photo-item {
              page-break-inside: avoid !important;
              break-inside: avoid !important;
            }
            .photos-section-small .photo-item img {
              max-height: 180px !important;
            }
            .photos-section-medium {
              display: grid !important;
              grid-template-columns: repeat(2, 1fr) !important;
              gap: 12px !important;
            }
            .photos-section-medium .photo-item {
              page-break-inside: avoid !important;
              break-inside: avoid !important;
            }
            .photos-section-medium .photo-item img {
              max-height: 280px !important;
            }
            .photos-section-large {
              display: flex !important;
              flex-direction: column !important;
              gap: 15px !important;
            }
            .photos-section-large .photo-item {
              page-break-inside: avoid !important;
              break-inside: avoid !important;
            }
            .photos-section-large .photo-item img {
              max-height: 340px !important;
            }
            .photo-item {
              page-break-inside: avoid !important;
              break-inside: avoid !important;
            }
            .photo-item img {
              page-break-inside: avoid !important;
              break-inside: avoid !important;
            }
            /* KRITISCH: Verhindere Abschneiden von Inhalten beim Drucken */
            img {
              max-width: 100% !important;
              height: auto !important;
              page-break-inside: avoid !important;
              break-inside: avoid !important;
            }
            /* Seitenumbrüche für Abschnitte */
            .roof-section, .calculator-section {
              page-break-inside: avoid !important;
              break-inside: avoid !important;
            }
            /* Checklisten: Sektion darf umbrechen, nur Kategorien bleiben zusammen */
            .checklists-section {
              page-break-inside: auto !important;
              break-inside: auto !important;
              page-break-before: auto !important;
              break-before: auto !important;
            }
            /* Sektionen erlauben Umbrüche, aber starten auf neuer Seite */
            .sketches-section { 
              page-break-before: always !important;
              break-before: page !important;
              page-break-inside: auto !important; 
            }
            .photos-section { 
              page-break-before: always !important;
              break-before: page !important;
              page-break-inside: auto !important; 
            }
            .sketch-item {
              page-break-inside: avoid !important;
              break-inside: avoid !important;
              max-height: 850px !important;
              overflow: hidden !important;
            }
            .sketch-item img {
              max-width: 100% !important;
              max-height: 780px !important;
              height: auto !important;
              object-fit: contain !important;
            }
            .photo-item {
              page-break-inside: avoid !important;
              break-inside: avoid !important;
              max-height: 450px !important;
              overflow: hidden !important;
            }
            .photo-item img {
              max-width: 100% !important;
              max-height: 380px !important;
              height: auto !important;
              object-fit: contain !important;
            }
            svg {
              max-width: 100% !important;
              height: auto !important;
            }
            .sketch-svg-container svg {
              max-width: 100% !important;
              height: auto !important;
            }
            .sketches-container, .photos-container {
              display: flex !important;
              flex-wrap: wrap !important;
              gap: 10px !important;
            }
            /* iPhone: inline-block für nebeneinander + saubere Seitenumbrüche */
            .sketches-container-iphone {
              display: block !important;
              font-size: 0 !important;
            }
            .sketches-container-iphone .sketch-item {
              display: inline-block !important;
              vertical-align: top !important;
              font-size: 14px !important;
              page-break-inside: avoid !important;
              break-inside: avoid !important;
              margin-bottom: 10px !important;
              margin-right: 1% !important;
            }
            .sketches-container-iphone .sketch-small {
              width: 32% !important;
              max-width: 32% !important;
            }
            .sketches-container-iphone .sketch-medium {
              width: 48% !important;
              max-width: 48% !important;
            }
            .sketches-container-iphone .sketch-large {
              width: 100% !important;
              max-width: 100% !important;
            }
            .sketches-container-iphone .sketch-full {
              width: 100% !important;
              max-width: 100% !important;
            }
            .sketches-container-iphone .sketch-item img {
              max-height: none !important;
              max-width: 100% !important;
              width: 100% !important;
              height: auto !important;
              object-fit: contain !important;
            }
            /* iPad: inline-block für nebeneinander + saubere Seitenumbrüche */
            .sketches-container-ipad {
              display: block !important;
              font-size: 0 !important;
            }
            .sketches-container-ipad .sketch-item {
              display: inline-block !important;
              vertical-align: top !important;
              font-size: 14px !important;
              page-break-inside: avoid !important;
              break-inside: avoid !important;
              margin-bottom: 10px !important;
              margin-right: 1% !important;
            }
            .sketches-container-ipad .sketch-small {
              width: 32% !important;
              max-width: 32% !important;
            }
            .sketches-container-ipad .sketch-medium {
              width: 48% !important;
              max-width: 48% !important;
            }
            .sketches-container-ipad .sketch-large {
              width: 100% !important;
              max-width: 100% !important;
            }
            .sketches-container-ipad .sketch-full {
              width: 100% !important;
              max-width: 100% !important;
            }
            .sketches-container-ipad .sketch-item img {
              max-width: 100% !important;
              height: auto !important;
              object-fit: contain !important;
            }
            .sketch-item, .photo-item {
              box-sizing: border-box !important;
              max-height: none !important;
              overflow: visible !important;
            }
            /* Sketch-Größen beim Drucken beibehalten */
            .sketch-small {
              flex: 0 0 calc(33.33% - 10px) !important;
              max-width: calc(33.33% - 10px) !important;
            }
            .sketch-medium {
              flex: 0 0 calc(50% - 10px) !important;
              max-width: calc(50% - 10px) !important;
            }
            .sketch-large {
              flex: 0 0 100% !important;
              max-width: 100% !important;
            }
            .sketch-full {
              flex: 0 0 100% !important;
              max-width: 100% !important;
            }
            /* Sketch/Photo: Höhenbeschränkung entfernt - inline-block mit page-break-inside: avoid reicht */
            /* iPhone: Fotos nebeneinander mit sauberen Seitenumbrüchen */
            .photos-print-iphone > div {
              display: inline-block !important;
              vertical-align: top !important;
              font-size: 14px !important;
              page-break-inside: avoid !important;
              break-inside: avoid !important;
              margin-bottom: 10px !important;
            }
            .photos-print-iphone > div img {
              max-height: 500px !important;
            }
            /* iPad: Fotos nebeneinander mit sauberen Seitenumbrüchen */
            .photos-print-ipad {
              display: block !important;
              font-size: 0 !important;
            }
            .photos-print-ipad > div {
              display: inline-block !important;
              vertical-align: top !important;
              font-size: 14px !important;
              page-break-inside: avoid !important;
              break-inside: avoid !important;
              margin-bottom: 10px !important;
            }
          }
          * {
            box-sizing: border-box;
          }
          /* Globale Überlauf-Kontrolle für alle Container */
          .sketch-item, .photo-item {
            overflow: hidden;
            max-width: 100%;
          }
          img {
            max-width: 100%;
            height: auto;
          }
          svg {
            max-width: 100%;
            height: auto;
          }
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            font-size: 9px;
            line-height: 1.3;
            color: #333;
            margin: 0;
            padding: 8px;
            background: #fff;
          }
          .header {
            background: ${headerBgColor};
            color: ${headerTextColor};
            padding: ${Math.max(headerSize.padding - 2, 2)}px ${headerSize.padding + 2}px;
            margin: 0 0 4px 0;
            border-radius: 0;
            display: flex;
            flex-direction: column;
            gap: 3px;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
            ${headerBorderStyle}
          }
          .header-top {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            width: 100%;
          }
          .company-header {
            display: flex;
            align-items: flex-start;
            gap: 10px;
          }
          .company-logo {
            max-width: 60px;
            max-height: 40px;
          }
          .header h1 {
            margin: 0;
            font-size: ${headerSize.h1Size}px;
            font-weight: 600;
          }
          .header .date {
            font-size: 9px;
            opacity: 0.9;
            margin-top: 2px;
            white-space: nowrap;
          }
          .company-info {
            text-align: right;
            font-size: 8px;
            max-width: 180px;
            word-wrap: break-word;
            line-height: 1.2;
          }
          h2 {
            color: ${toolsAccentColor};
            border-bottom: 1px solid ${toolsAccentColor};
            padding-bottom: 2px;
            margin-top: 8px;
            margin-bottom: 4px;
            font-size: ${toolsSize.h2Size}px;
            page-break-after: avoid;
            page-break-inside: avoid;
          }
          /* Sektionen zusammenhalten - verstärkt für iPhone */
          .section-with-header {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            -webkit-column-break-inside: avoid !important;
          }
          /* Überschriften NIEMALS alleine lassen */
          h2, h3, h4 {
            page-break-after: avoid !important;
            break-after: avoid !important;
            -webkit-column-break-after: avoid !important;
            orphans: 3;
            widows: 3;
          }
          /* Skizzen-Sektion - neue Seite starten damit Überschrift beim Inhalt bleibt */
          .sketches-section {
            page-break-before: always !important;
            break-before: page !important;
            page-break-inside: auto !important;
            break-inside: auto !important;
          }
          .sketches-section h2 {
            page-break-after: avoid !important;
            break-after: avoid !important;
            margin-top: 0 !important;
            margin-bottom: 10px;
          }
          .sketches-section .sketches-container {
            page-break-before: avoid !important;
            break-before: avoid !important;
          }
          /* Einzelne Skizzen-Items nicht umbrechen */
          .sketches-section .sketch-item {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
          /* Skizzen-Wrapper: Überschrift + erste Skizze zusammen */
          .sketch-wrapper {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            -webkit-column-break-inside: avoid !important;
          }
          /* Fotos Sektion - neue Seite starten damit Überschrift beim Inhalt bleibt */
          .photos-section {
            page-break-before: always !important;
            break-before: page !important;
            page-break-inside: auto !important;
            break-inside: auto !important;
          }
          .photos-section h2 {
            page-break-after: avoid !important;
            break-after: avoid !important;
            margin-top: 0 !important;
          }
          /* Fotos-Wrapper: Überschrift + erstes Foto zusammen */
          .photos-wrapper {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            -webkit-column-break-inside: avoid !important;
          }
          /* Bemerkungen Sektion */
          .remarks-section {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
          .remarks-section h2 {
            page-break-after: avoid !important;
            break-after: avoid !important;
          }
          /* Checklisten Sektion - KEIN page-break-inside: avoid damit es auf Seite 1 beginnt */
          .checklists-section {
            width: 100%;
          }
          .checklists-section h2 {
            page-break-after: avoid !important;
            break-after: avoid !important;
          }
          /* Jede Hauptkategorie bleibt zusammen */
          .pdf-category-section {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
          /* Checklist-Card darf umbrechen, aber nicht die einzelnen Kategorien */
          .checklist-card {
            page-break-inside: auto !important;
            break-inside: auto !important;
          }
          /* Checklist Header bleibt mit erstem Inhalt zusammen */
          .checklist-main-header {
            page-break-after: avoid !important;
            break-after: avoid !important;
          }
          /* Dachflächen Sektion */
          .roofs-section {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
          .roofs-section h2 {
            page-break-after: avoid !important;
            break-after: avoid !important;
          }
          h3 {
            color: #333;
            margin-top: 8px;
            margin-bottom: 5px;
            font-size: 10px;
            page-break-after: avoid;
          }
          h4 {
            color: ${accentColor};
            margin: 5px 0 3px 0;
            font-size: 9px;
          }
          .info-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 5px;
            margin-bottom: 6px;
          }
          .info-box {
            background: #f8f9fa;
            border: 1px solid #e0e0e0;
            border-radius: 4px;
            padding: 4px 6px;
          }
          .info-box h3 {
            margin-top: 0;
            color: #1976d2;
            font-size: 8px;
            border-bottom: 1px solid #e0e0e0;
            padding-bottom: 2px;
            margin-bottom: 3px;
          }
          .info-row {
            display: flex;
            margin-bottom: 1px;
            font-size: 7px;
            line-height: 1.3;
          }
          .info-label {
            font-weight: 800;
            min-width: 80px;
            flex-shrink: 0;
            color: #000;
            font-size: 7.5px;
          }
          .info-value {
            flex: 1;
            font-size: 7.5px;
          }
          .stats-grid {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 8px;
            margin-bottom: 12px;
          }
          .stat-box {
            background: #e3f2fd;
            border-radius: 4px;
            padding: 6px 4px;
            text-align: center;
          }
          .stat-value {
            font-size: 16px;
            font-weight: 700;
            color: #1976d2;
          }
          .stat-label {
            font-size: 7px;
            color: #666;
            text-transform: uppercase;
            letter-spacing: 0.3px;
          }
          /* Projektart-Überschrift - eigene Farb- und Stil-Einstellungen */
          .project-type-header {
            background: ${projectTypeBgColor};
            ${projectTypeBorderStyle}
            border-radius: 4px;
            padding: ${Math.max(projectTypeSize.padding - 2, 2)}px ${projectTypeSize.padding + 2}px;
            margin-bottom: 6px;
            text-align: center;
            display: flex;
            align-items: center;
            justify-content: center;
          }
          .project-type-icon {
            color: ${projectTypeTextColor};
            font-size: ${projectTypeSize.fontSize - 2}px;
          }
          .project-type-text {
            font-size: ${projectTypeSize.fontSize}px;
            font-weight: 600;
            color: ${projectTypeTextColor};
            text-transform: uppercase;
            letter-spacing: 0.5px;
          }
          .roof-card, .checklist-card {
            background: #f8f9fa;
            border: 1px solid #e0e0e0;
            border-radius: 4px;
            padding: 6px 8px;
            margin-bottom: 6px;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            -webkit-column-break-inside: avoid !important;
          }
          .roof-card h4, .checklist-card h4 {
            margin-top: 0;
          }
          /* Alle Kategorie-Container nicht trennen */
          .pdf-category-section {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            -webkit-column-break-inside: avoid !important;
          }
          .pdf-level1-container {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            -webkit-column-break-inside: avoid !important;
          }
          /* Fotos nicht trennen */
          .photo-card {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            -webkit-column-break-inside: avoid !important;
          }
          .photo-card img {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
          /* Skizzen nicht trennen */
          .sketch-item {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            -webkit-column-break-inside: avoid !important;
          }
          /* Block-Struktur für Fotos und Skizzen (iPhone-kompatibel) */
          .photo-block, .sketch-block {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            -webkit-column-break-inside: avoid !important;
          }
          .photo-inline-heading, .sketch-inline-heading {
            color: ${accentColor};
            border-bottom: 1px solid ${accentColor};
            padding-bottom: 3px;
            margin-top: 0;
            margin-bottom: 8px;
            font-size: 11px;
          }
          .sketch-inline-title {
            color: ${accentColor};
            margin: 8px 0 5px 0;
            font-size: 9px;
          }
          /* New checklist PDF styles */
          .checklist-main-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding-bottom: 4px;
            border-bottom: 1px solid ${accentColor};
            margin-bottom: 6px;
          }
          .checklist-main-title {
            font-size: 11px;
            font-weight: 700;
            color: ${accentColor};
            flex: 1;
          }
          .checklist-main-count {
            font-size: 9px;
            color: #4caf50;
            font-weight: 600;
          }
          /* PDF Checklist Image Styles */
          .pdf-template-logo {
            max-width: 50px;
            max-height: 20px;
            margin-right: 6px;
            object-fit: contain;
            border-radius: 2px;
          }
          .pdf-category-logo {
            max-width: 35px;
            max-height: 14px;
            margin-right: 3px;
            object-fit: contain;
            border-radius: 2px;
          }
          .pdf-print-thumbnail {
            width: 40px;
            height: 30px;
            object-fit: contain;
            border-radius: 2px;
            border: 1px solid #4caf50;
            margin-left: auto;
            background: #f5f5f5;
          }
          .pdf-print-thumbnail-small {
            width: 32px;
            height: 24px;
            object-fit: contain;
            border-radius: 2px;
            border: 1px solid #4caf50;
            margin-left: auto;
            background: #f5f5f5;
          }
          /* Grid container for categories - IMMER 1 Spalte, da Level-1 Items das Grid haben */
          .pdf-categories-grid {
            display: block;
            width: 100%;
          }
          .pdf-categories-grid::after {
            content: "";
            display: table;
            clear: both;
          }
          .pdf-category-section {
            background: #f9f9f9;
            border: 1px solid #e0e0e0;
            border-radius: 3px;
            padding: 5px 6px;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            -webkit-column-break-inside: avoid !important;
            box-sizing: border-box;
            width: 100%;
            margin-bottom: 8px;
          }
          /* Spalten-Layout basierend auf Einstellung */
          .pdf-category-section.cols-1,
          .pdf-category-section.cols-2,
          .pdf-category-section.cols-3 {
            width: 100%;
          }
          .pdf-category-header {
            display: flex;
            align-items: center;
            gap: 4px;
            padding-bottom: 3px;
            border-bottom: 1px solid #4caf50;
            margin-bottom: 4px;
          }
          .pdf-cat-check {
            color: #4caf50;
            font-weight: bold;
            font-size: 8px;
          }
          .pdf-category-title {
            font-size: 8px;
            font-weight: 700;
            color: #333;
            flex: 1;
          }
          .pdf-category-count {
            font-size: 7px;
            color: #4caf50;
            font-weight: 600;
          }
          .pdf-category-note {
            background: #fff8e1;
            padding: 2px 4px;
            border-radius: 2px;
            font-size: 7px;
            color: #f57c00;
            font-style: italic;
            margin-bottom: 3px;
          }
          .pdf-category-measurements {
            background: #e3f2fd;
            padding: 2px 4px;
            border-radius: 2px;
            margin-bottom: 3px;
          }
          .pdf-measurement-line {
            font-size: 7px;
            color: #1565c0;
            font-weight: 500;
            margin-bottom: 1px;
          }
          .pdf-measurement-sum {
            margin-top: 2px;
            padding-top: 2px;
            border-top: 1px solid #90caf9;
            font-size: 7px;
            color: #1565c0;
          }
          .pdf-sum-badge {
            background: #bbdefb;
            padding: 1px 4px;
            border-radius: 6px;
            font-weight: 600;
            margin-left: 3px;
          }
          .pdf-level1-grid {
            display: grid;
            grid-template-columns: repeat(${checklistColumns}, 1fr);
            gap: 3px;
          }
          .pdf-level1-container {
            background: #fff;
            border: 1px solid #e0e0e0;
            border-left: 2px solid ${accentColor};
            border-radius: 2px;
            padding: 3px 4px;
            box-sizing: border-box;
          }
          .pdf-level1-header {
            display: flex;
            align-items: center;
            gap: 3px;
            padding-bottom: 2px;
            border-bottom: 1px solid #eee;
            margin-bottom: 2px;
          }
          .pdf-level1-prefix {
            background: ${accentColor};
            color: ${pdfColor.textColor};
            font-size: 7px;
            font-weight: 700;
            padding: 1px 3px;
            border-radius: 2px;
          }
          .pdf-checkmark-circle {
            color: #4caf50;
            font-size: 8px;
          }
          .pdf-level1-title {
            font-size: 8px;
            font-weight: 600;
            color: #333;
            flex: 1;
          }
          .pdf-level1-content {
            padding-left: 1px;
          }
          .pdf-deep-sub {
            display: flex;
            align-items: center;
            gap: 2px;
            padding: 0;
          }
          .pdf-deep-prefix {
            font-size: 7px;
            color: #666;
            font-weight: 600;
            min-width: 18px;
          }
          .pdf-checkmark {
            color: #4caf50;
            font-size: 7px;
          }
          .pdf-deep-text {
            font-size: 7px;
            color: #444;
            flex: 1;
          }
          .pdf-note {
            background: #fff8e1;
            padding: 2px 3px;
            border-radius: 2px;
            font-size: 6px;
            color: #f57c00;
            font-style: italic;
            margin-top: 1px;
            margin-bottom: 1px;
          }
          .pdf-note-icon {
            margin-right: 1px;
          }
          .pdf-measurement {
            background: #e3f2fd;
            padding: 2px 3px;
            border-radius: 2px;
            font-size: 6px;
            color: #1565c0;
            font-weight: 500;
            margin-top: 1px;
            margin-bottom: 1px;
          }
          .photos-grid, .sketches-grid {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 15px;
          }
          /* Flexible photo/sketch containers */
          .photos-container, .sketches-container {
            display: flex;
            flex-wrap: wrap;
            gap: 15px;
            align-items: flex-start;
          }
          .photos-container::after, .sketches-container::after {
            content: "";
            display: table;
            clear: both;
          }
          /* Photo page groups - jede Gruppe auf eigener Seite */
          .photos-page-group {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            -webkit-column-break-inside: avoid !important;
          }
          .photos-page-group .photos-container {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 15px;
          }
          .photos-page-group .photo-item {
            max-height: 320px;
            overflow: hidden;
          }
          .photos-page-group .photo-item img {
            max-height: 280px;
            object-fit: contain;
          }
          /* Neue Foto-Seiten Layouts */
          .photos-section {
            margin-bottom: 15px;
          }
          /* Klein: 3 Spalten Grid */
          .photos-section-small {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 8px;
          }
          .photos-section-small .photo-item {
            page-break-inside: avoid;
            break-inside: avoid;
          }
          .photos-section-small .photo-item img {
            max-height: 180px;
            object-fit: contain;
          }
          .photo-grid-small {
            width: 100%;
          }
          /* Mittel: 2 Spalten Grid */
          .photos-section-medium {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 12px;
          }
          .photos-section-medium .photo-item {
            page-break-inside: avoid;
            break-inside: avoid;
          }
          .photos-section-medium .photo-item img {
            max-height: 280px;
            object-fit: contain;
          }
          .photo-grid-medium {
            width: 100%;
          }
          /* Groß: 1 Spalte (übereinander) */
          .photos-section-large {
            display: flex;
            flex-direction: column;
            gap: 15px;
          }
          .photos-section-large .photo-item {
            page-break-inside: avoid;
            break-inside: avoid;
          }
          .photos-section-large .photo-item img {
            max-height: 340px;
            object-fit: contain;
          }
          .photo-grid-large {
            width: 100%;
          }
          /* iPhone-spezifischer Skizzen-Container: Grid mit 2 Spalten */
          .sketches-container-iphone {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 10px;
          }
          .sketch-iphone {
            width: 100%;
            margin: 0;
          }
          .sketch-iphone img {
            max-height: 280px;
            object-fit: contain;
          }
          /* iPhone-spezifischer Fotos-Container: Grid mit 2 Spalten */
          .photos-container-iphone {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 15px;
            margin-bottom: 20px;
            align-items: start;
          }
          .photos-container-iphone.photos-new-page {
            page-break-before: always !important;
            break-before: page !important;
          }
          .photo-iphone {
            width: 100%;
            margin: 0;
          }
          .photo-iphone .photo-wrapper {
            display: flex;
            align-items: center;
            justify-content: center;
            background: #f5f5f5;
            border-radius: 4px;
            overflow: hidden;
          }
          .photo-iphone img {
            width: 100%;
            height: auto;
            max-height: 200px;
            object-fit: contain;
          }
          /* Photo sizes - iPad mit Flexbox */
          .photo-small {
            flex: 0 0 calc(33.33% - 10px);
            max-width: calc(33.33% - 10px);
            margin-bottom: 15px;
          }
          .photo-medium {
            flex: 0 0 calc(50% - 10px);
            max-width: calc(50% - 10px);
            margin-bottom: 15px;
          }
          .photo-large {
            flex: 0 0 100%;
            max-width: 100%;
            margin-bottom: 15px;
          }
          .photo-full {
            flex: 0 0 100%;
            max-width: 100%;
            margin-bottom: 15px;
          }
          /* Photo wrapper for annotation overlay */
          .photo-wrapper {
            position: relative;
            display: block;
            width: 100%;
          }
          .photo-wrapper img {
            display: block;
            width: 100%;
            height: auto;
            max-height: 400px;
            object-fit: contain;
          }
          .photo-annotations {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            pointer-events: none;
          }
          /* Sketch sizes - mit Flexbox */
          .sketch-small {
            flex: 0 0 calc(33.33% - 10px);
            max-width: calc(33.33% - 10px);
            margin-bottom: 15px;
          }
          .sketch-medium {
            flex: 0 0 calc(50% - 10px);
            max-width: calc(50% - 10px);
            margin-bottom: 15px;
          }
          .sketch-large {
            flex: 0 0 100%;
            max-width: 100%;
            margin-bottom: 15px;
          }
          .sketch-full {
            flex: 0 0 100%;
            max-width: 100%;
            margin-bottom: 15px;
          }
          .sketch-item img {
            max-height: 500px;
            object-fit: contain;
          }
          .photo-item, .sketch-item {
            border: 1px solid #e0e0e0;
            border-radius: 6px;
            overflow: hidden;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            -webkit-column-break-inside: avoid !important;
            display: block;
            max-height: 350px;
          }
          /* Photo/Sketch im Grid nicht umbrechen */
          .photo-iphone, .sketch-iphone {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            -webkit-column-break-inside: avoid !important;
            max-height: 280px;
            overflow: hidden;
          }
          .photo-small, .photo-medium, .photo-large, .photo-full {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            -webkit-column-break-inside: avoid !important;
          }
          .sketch-small, .sketch-medium, .sketch-large, .sketch-full {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            -webkit-column-break-inside: avoid !important;
          }
          /* All images fill their container width */
          .photo-item img, .sketch-item img {
            display: block;
            width: 100%;
            height: auto;
            max-height: 300px;
            object-fit: contain;
            background: #f5f5f5;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
          .photo-item p, .sketch-item p {
            margin: 0;
            padding: 8px;
            font-size: 10px;
            color: #666;
            background: #f8f9fa;
          }
          .sketch-title {
            margin: 0;
            padding: 8px 10px;
            font-size: 11px;
            font-weight: 600;
            color: ${accentColor};
            background: #f0f4f8;
            border-bottom: 1px solid ${accentColor};
          }
          .sketch-notes {
            padding: 8px 10px;
            background: #fafafa;
            border-top: 1px solid #e0e0e0;
          }
          .sketch-notes-filled {
            background: #fff8e1;
            border-top: 1px solid #ffe082;
          }
          .sketch-notes-label {
            font-size: 9px;
            font-weight: 600;
            color: #666;
          }
          .sketch-notes-text {
            font-size: 9px;
            color: #333;
            line-height: 1.4;
          }
          .sketch-notes-lines {
            display: flex;
            flex-direction: column;
            gap: 10px;
          }
          .sketch-note-line {
            height: 1px;
            background: #ccc;
            width: 100%;
          }
          .sketch-placeholder {
            height: 150px;
            display: flex;
            align-items: center;
            justify-content: center;
            background: #f5f5f5;
            color: #999;
          }
          .empty {
            color: #999;
            font-style: italic;
            padding: 10px;
            background: #f8f9fa;
            border-radius: 4px;
          }
          .remarks-box {
            background: #fff8e1;
            border: 1px solid #ffe082;
            border-radius: 4px;
            padding: 6px 8px;
            margin-top: 5px;
            font-size: 8px;
          }
          .footer {
            margin-top: 5px;
            padding: 3px 0;
            border-top: 1px solid ${accentColor};
            font-size: 6px;
            color: #999;
            text-align: center;
            font-weight: 400;
            page-break-inside: avoid;
            page-break-before: avoid;
            break-before: avoid;
            break-inside: avoid;
          }
          /* Wrapper um den letzten Inhalt und Footer, um sie zusammenzuhalten */
          .footer-container {
            page-break-inside: avoid;
            break-inside: avoid;
          }
          /* Footer im Druck nur anzeigen wenn genug Platz - sonst verstecken */
          @media print {
            .footer {
              /* Footer wird nur gedruckt wenn er auf die Seite passt */
              orphans: 3;
              widows: 3;
            }
          }
          .page-break {
            page-break-before: always;
          }
          .measurements-grid {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 2px;
            margin-top: 4px;
          }
          .measure-item {
            font-size: 8px;
          }
          .measure-label {
            color: #666;
          }
          .roof-area {
            font-size: 10px;
            color: ${accentColor};
            margin-bottom: 3px;
          }
          .roof-notes {
            margin-top: 4px;
            padding-top: 4px;
            border-top: 1px dashed #e0e0e0;
            font-size: 8px;
          }
          .company-header {
            display: flex;
            align-items: center;
            gap: 10px;
          }
          .company-logo {
            max-width: 120px;
            max-height: 80px;
            object-fit: contain;
          }
        </style>
      </head>
      <body>
        <div class="page">
        <div class="header">
          <div class="header-top">
            <div class="company-header">
              ${companyLogo ? `<img src="${companyLogo}" class="company-logo" alt="Logo" />` : ''}
              <div>
                <h1>AUFMASS-DOKUMENTATION</h1>
                <div class="date">Erstellt am: ${formatDate(new Date().toISOString())}${authorName ? ` | Verfasser: ${authorName}` : ''}</div>
              </div>
            </div>
            ${companyName ? `
              <div class="company-info">
                <strong>${companyName}</strong>
                ${companySubtitle ? `<br/><em>${companySubtitle}</em>` : ''}
                ${companyStreet ? `<br/>${companyStreet}` : ''}
                ${companyZipCode || companyCity ? `<br/>${companyZipCode} ${companyCity}` : ''}
                ${companyPhone ? `<br/>${t('pdf.phone')}: ${companyPhone}` : ''}
                ${companyMobilePhone ? `<br/>${t('pdf.mobile')}: ${companyMobilePhone}` : ''}
                ${companyFax ? `<br/>${t('pdf.fax')}: ${companyFax}` : ''}
                ${companyEmail ? `<br/>${companyEmail}` : ''}
              </div>
            ` : ''}
          </div>
        </div>
        
        <h2>${t('pdf.projectOverview')}</h2>
        <div class="info-grid">
          <div class="info-box">
            <h3>${t('pdf.project')}</h3>
            ${project?.project_number ? `
              <div class="info-row">
                <span class="info-label">${t('projects.projectNumber')}:</span>
                <span class="info-value" style="color: #4caf50; font-weight: 600;">${project.project_number}</span>
              </div>
            ` : ''}
            <div class="info-row">
              <span class="info-label">Name:</span>
              <span class="info-value">${project?.name || '-'}</span>
            </div>
            ${project?.description ? `
              <div class="info-row">
                <span class="info-label">${t('projects.description')}:</span>
                <span class="info-value">${project.description}</span>
              </div>
            ` : ''}
            <div class="info-row">
              <span class="info-label">${t('projects.status')}:</span>
              <span class="info-value">${project?.status === 'aktiv' ? t('projects.statusActive') : project?.status === 'abgeschlossen' ? t('projects.statusCompleted') : t('projects.statusCancelled')}</span>
            </div>
            ${(objektStreet || objektPlz || objektCity || objektName || objektAddressName || objektContactPerson || objektPhone || objektEmail || objektNumber) ? `
              <div style="margin-top: 6px; padding-top: 4px; border-top: 1px solid #e0e0e0;">
                <h4 style="color: #1976d2; margin: 0 0 3px 0; font-size: 8px; border-bottom: 1px solid #e0e0e0; padding-bottom: 2px;">
                  ${t('projects.objectAddress')}${objektAddressName ? ` (${objektAddressName})` : ''}
                </h4>
                ${objektNumber ? `
                  <div class="info-row">
                    <span class="info-label">${t('projects.objectNumber')}:</span>
                    <span class="info-value" style="color: #ff9800; font-weight: 600;">${objektNumber}</span>
                  </div>
                ` : ''}
                ${objektName ? `
                  <div class="info-row">
                    <span class="info-label">Name:</span>
                    <span class="info-value">${objektName}</span>
                  </div>
                ` : ''}
                ${objektStreet ? `
                  <div class="info-row">
                    <span class="info-label">${t('common.street')}:</span>
                    <span class="info-value">${objektStreet}</span>
                  </div>
                ` : ''}
                ${(objektPlz || objektCity) ? `
                  <div class="info-row">
                    <span class="info-label">${t('common.zip')}/${t('common.city')}:</span>
                    <span class="info-value">${objektPlz || ''} ${objektCity || ''}</span>
                  </div>
                ` : ''}
                ${objektContactPerson ? `
                  <div class="info-row">
                    <span class="info-label">Ansprechpartner:</span>
                    <span class="info-value">${objektContactPerson}</span>
                  </div>
                ` : ''}
                ${objektPhone ? `
                  <div class="info-row">
                    <span class="info-label">Tel:</span>
                    <span class="info-value">${objektPhone}</span>
                  </div>
                ` : ''}
                ${objektEmail ? `
                  <div class="info-row">
                    <span class="info-label">E-Mail:</span>
                    <span class="info-value">${objektEmail}</span>
                  </div>
                ` : ''}
              </div>
            ` : ''}
          </div>
          
          <div class="info-box">
            <h3>${t('projects.bauherr')}</h3>
            ${customer?.customer_number ? `
              <div class="info-row">
                <span class="info-label">${t('customers.customerNumber')}:</span>
                <span class="info-value" style="color: #1976d2; font-weight: 600;">${customer.customer_number}</span>
              </div>
            ` : ''}
            ${bauherrName ? `
              <div class="info-row">
                <span class="info-label">Name:</span>
                <span class="info-value">${bauherrName}</span>
              </div>
            ` : ''}
            ${bauherrStreet ? `
              <div class="info-row">
                <span class="info-label">${t('common.street')}:</span>
                <span class="info-value">${bauherrStreet}</span>
              </div>
            ` : ''}
            ${(bauherrPlz || bauherrCity) ? `
              <div class="info-row">
                <span class="info-label">${t('common.zip')}/${t('common.city')}:</span>
                <span class="info-value">${bauherrPlz || ''} ${bauherrCity || ''}</span>
              </div>
            ` : ''}
            ${bauherrPhone ? `
              <div class="info-row">
                <span class="info-label">${t('common.phone')}:</span>
                <span class="info-value">${bauherrPhone}</span>
              </div>
            ` : ''}
            ${bauherrMobile ? `
              <div class="info-row">
                <span class="info-label">${t('pdf.mobile')}:</span>
                <span class="info-value">${bauherrMobile}</span>
              </div>
            ` : ''}
            ${bauherrEmail ? `
              <div class="info-row">
                <span class="info-label">${t('common.email')}:</span>
                <span class="info-value">${bauherrEmail}</span>
              </div>
            ` : ''}
          </div>
        </div>
        
        ${project?.project_type ? `
          <div class="project-type-header">
            <span class="project-type-text">${project.project_type}${project.project_type_date ? ` vom ${new Date(project.project_type_date).toLocaleDateString('de-DE')}` : ''}</span>
          </div>
        ` : ''}
        
        ${roofs.length > 0 ? `
        <div class="roofs-section">
          <h2>${t('projects.roofMeasurement')}</h2>
          ${roofsHtml}
        </div>
        ` : ''}
        
        ${checklists.length > 0 ? `
        <div class="checklists-section" style="page-break-before: auto !important; page-break-inside: auto !important; break-inside: auto !important;">
          ${checklistsHtml}
        </div>
        ` : ''}
        
        ${photos.length > 0 ? `
          <div class="photos-section">
            <h2>${t('photos.title')}</h2>
            ${photosHtml}
          </div>
        ` : ''}
        
        ${sketches.length > 0 ? `
          <div class="sketches-section">
            <h2>${t('sketches.title')}</h2>
            ${sketchesHtml}
          </div>
        ` : ''}
        
        ${areaCalculations.length === 0 && (photos.length > 0 || sketches.length > 0) ? `
          <div class="footer-container">
            ${(remarks || project?.remarks) ? `
              <div class="remarks-section" style="margin-top: 30px;">
                <h2>Bemerkungen</h2>
                <div class="remarks-box">
                  ${(remarks || project?.remarks || '').replace(/\n/g, '<br/>')}
                </div>
              </div>
            ` : ''}
            <div class="footer">
              ${t('pdf.createdWith')} - Aufmassprofi - • ${formatDate(new Date().toISOString())}
            </div>
          </div>
        ` : ''}
        </div><!-- end .page -->
        
        ${areaCalculations.length > 0 ? `
          <div class="new-page">
            <div class="area-calcs-section">
              <h2>Flächenberechnungen</h2>
              ${generateCombinedAreaCalcs()}
            </div>
            <div class="footer-container">
              ${(remarks || project?.remarks) ? `
                <div class="remarks-section" style="margin-top: 30px;">
                  <h2>Bemerkungen</h2>
                  <div class="remarks-box">
                    ${(remarks || project?.remarks || '').replace(/\n/g, '<br/>')}
                  </div>
                </div>
              ` : ''}
              <div class="footer">
                ${t('pdf.createdWith')} - Aufmassprofi - • ${formatDate(new Date().toISOString())}
              </div>
            </div>
          </div>
        ` : ''}
        
        ${photos.length === 0 && sketches.length === 0 && areaCalculations.length === 0 ? `
          <div class="footer-container">
            ${(remarks || project?.remarks) ? `
              <div class="remarks-section" style="margin-top: 30px;">
                <h2>Bemerkungen</h2>
                <div class="remarks-box">
                  ${(remarks || project?.remarks || '').replace(/\n/g, '<br/>')}
                </div>
              </div>
            ` : ''}
            <div class="footer">
              ${t('pdf.createdWith')} - Aufmassprofi - • ${formatDate(new Date().toISOString())}
            </div>
          </div>
        ` : ''}
      </body>
      </html>
    `;
    
    return html;
  };

  // Show PDF options dialog
  const exportToPDF = async () => {
    Alert.alert(
      'PDF Export',
      t('projects.whatToDo'),
      [
        {
          text: t('projects.showPreview'),
          onPress: async () => {
            try {
              setIsGeneratingPdf(true);
              const html = await generatePdfHtml();
              setPdfHtmlContent(html);
              setShowPdfPreviewModal(true);
            } catch (error) {
              console.error('Error generating preview:', error);
              Alert.alert(t('common.error'), t('pdf.previewError'));
            } finally {
              setIsGeneratingPdf(false);
            }
          },
        },
        {
          text: 'PDF teilen',
          onPress: () => generateAndSharePdf(),
        },
        {
          text: t('projects.saveToFiles'),
          onPress: () => generateAndSavePdf(),
        },
        { text: t('common.cancel'), style: 'cancel' },
      ]
    );
  };

  // Generate and share PDF
  const generateAndSharePdf = async () => {
    try {
      setIsGeneratingPdf(true);
      
      const html = await generatePdfHtml();
      const { uri } = await Print.printToFileAsync({
        html,
        base64: false,
      });
      
      // Hide loader BEFORE opening share dialog to prevent stuck overlay
      // Share dialog may not always resolve properly when user interacts with sub-dialogs (like Print)
      setIsGeneratingPdf(false);
      
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(uri, {
          mimeType: 'application/pdf',
          dialogTitle: `Aufmaß ${project?.name} teilen`,
          UTI: 'com.adobe.pdf',
        });
      } else {
        Alert.alert(t('common.error'), t('pdf.shareNotAvailable'));
      }
    } catch (error) {
      console.error('Error sharing PDF:', error);
      Alert.alert(t('common.error'), t('pdf.pdfCreateError'));
      setIsGeneratingPdf(false);
    }
  };

  // Generate and save PDF to Files app
  const generateAndSavePdf = async () => {
    try {
      setIsGeneratingPdf(true);
      
      const html = await generatePdfHtml();
      const { uri } = await Print.printToFileAsync({
        html,
        base64: false,
      });
      
      // Hide loader BEFORE opening share dialog to prevent stuck overlay
      // Share dialog may not always resolve properly when user interacts with sub-dialogs (like Print)
      setIsGeneratingPdf(false);
      
      // Share the file directly - iOS will show "Save to Files" option
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(uri, {
          mimeType: 'application/pdf',
          dialogTitle: 'PDF speichern',
          UTI: 'com.adobe.pdf',
        });
      } else {
        Alert.alert(t('common.error'), t('pdf.shareNotAvailable'));
      }
    } catch (error) {
      console.error('Error saving PDF:', error);
      Alert.alert(t('common.error'), t('pdf.pdfSaveError'));
      setIsGeneratingPdf(false);
    }
  };

  // Share PDF from preview - use native print/share
  const sharePdfFromPreview = async () => {
    try {
      // Close modal first
      setShowPdfPreviewModal(false);
      
      // Small delay to let modal close
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Generate fresh HTML to ensure all data is current
      const html = await generatePdfHtml();
      
      // Generate PDF file first, then share
      const { uri } = await Print.printToFileAsync({
        html: html,
        base64: false,
      });
      
      // Share the PDF file
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(uri, {
          mimeType: 'application/pdf',
          dialogTitle: `Aufmaß ${project?.name} teilen`,
          UTI: 'com.adobe.pdf',
        });
      } else {
        // Fallback to native print
        await Print.printAsync({ html: html });
      }
    } catch (error) {
      console.error('Error sharing PDF from preview:', error);
      Alert.alert(t('common.error'), t('pdf.pdfCreateError'));
    }
  };

  // Save PDF from preview - same as share (iOS shows save option in print dialog)
  const savePdfFromPreview = async () => {
    try {
      // Close modal first
      setShowPdfPreviewModal(false);
      
      // Small delay to let modal close
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Generate fresh HTML to ensure all data is current
      const html = await generatePdfHtml();
      
      // Generate PDF file first, then share (iOS shows "Save to Files" option)
      const { uri } = await Print.printToFileAsync({
        html: html,
        base64: false,
      });
      
      // Share the PDF file - iOS will show save option
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(uri, {
          mimeType: 'application/pdf',
          dialogTitle: 'PDF speichern',
          UTI: 'com.adobe.pdf',
        });
      } else {
        // Fallback to native print
        await Print.printAsync({ html: html });
      }
    } catch (error) {
      console.error('Error saving PDF from preview:', error);
      Alert.alert(t('common.error'), t('pdf.pdfSaveError'));
    }
  };

  // Share preview as image for WhatsApp/Messenger
  const sharePreviewAsImage = async () => {
    if (!viewShotRef.current) return;
    
    setIsSharingImage(true);
    try {
      // Capture the WebView as an image
      const uri = await viewShotRef.current.capture?.();
      
      if (uri) {
        // Share the image directly without moving
        const canShare = await Sharing.isAvailableAsync();
        if (canShare) {
          await Sharing.shareAsync(uri, {
            mimeType: 'image/jpeg',
            dialogTitle: t('projects.sharePreview'),
          });
        } else {
          Alert.alert(t('common.error'), t('pdf.shareNotAvailable'));
        }
      } else {
        Alert.alert(t('common.error'), t('pdf.screenshotError'));
      }
    } catch (error) {
      console.error('Error sharing image:', error);
      Alert.alert(t('common.error'), t('pdf.imageCreateError'));
    } finally {
      setIsSharingImage(false);
    }
  };

  const sendEmail = async () => {
    // Generate PDF and share via native share dialog
    try {
      Alert.alert(
        'PDF erstellen und teilen',
        'Möchten Sie das Aufmaß-PDF erstellen und per E-Mail teilen?',
        [
          { text: t('common.cancel'), style: 'cancel' },
          {
            text: 'PDF erstellen',
            onPress: async () => {
              // Use the same PDF generation as exportToPDF
              await exportToPDF();
            },
          },
        ]
      );
    } catch (error) {
      console.error('Error in sendEmail:', error);
      Alert.alert(t('common.error'), t('pdf.unexpectedError'));
    }
  };

  const shareProject = async () => {
    // Share project with PDF or text
    try {
      Alert.alert(
        t('projects.shareProject'),
        t('projects.howToShare'),
        [
          { 
            text: t('projects.textOnly'), 
            onPress: async () => {
              try {
                const message = `Projekt: ${project?.name}\nKunde: ${customer?.name || project?.bauherr_name || '-'}\nDachflächen: ${roofs.length}\nGesamtfläche: ${totalArea.toFixed(2)} m²`;
                
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
              await exportToPDF();
            },
          },
          { text: t('common.cancel'), style: 'cancel' },
        ]
      );
    } catch (error) {
      console.error('Error in shareProject:', error);
    }
  };

  // Export project as .aufmass file to iCloud/Files
  const exportProjectFile = async () => {
    try {
      setIsGeneratingPdf(true);
      
      // Gather all project data
      const exportData = {
        version: '1.0',
        exportDate: new Date().toISOString(),
        project: project || {},
        customer: customer || {},
        roofs: roofs || [],
        photos: photos || [],
        sketches: sketches || [],
        checklists: checklists || [],
      };
      
      // Convert to JSON string
      const jsonString = JSON.stringify(exportData, null, 2);
      
      // Get safe filename
      const safeName = (project?.name || 'projekt').replace(/[^a-zA-Z0-9äöüÄÖÜß]/g, '_');
      
      // Create file in cache directory directly as JSON
      const fileUri = `${cacheDirectory}${safeName}.aufmass`;
      
      await writeAsStringAsync(fileUri, jsonString);
      
      // Hide loader BEFORE opening share dialog to prevent stuck overlay
      setIsGeneratingPdf(false);
      
      // Share the file
      await Sharing.shareAsync(fileUri, {
        mimeType: 'application/json',
        dialogTitle: t('projects.saveProject2'),
      });
      
    } catch (error: any) {
      console.error('Export error:', error);
      setIsGeneratingPdf(false);
      // Fallback: Share as text
      try {
        const exportData = {
          version: '1.0',
          exportDate: new Date().toISOString(),
          project: project || {},
          customer: customer || {},
          roofs: roofs || [],
          photos: photos || [],
          sketches: sketches || [],
          checklists: checklists || [],
        };
        const jsonString = JSON.stringify(exportData);
        await Share.share({
          message: jsonString,
          title: `${project?.name || 'Projekt'}.aufmass`,
        });
      } catch (shareError) {
        Alert.alert(t('projects.exportError2'), t('projects.exportNotPossible'));
      }
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
          <Text style={styles.actionButtonText}>{t('projects.projectPdf')}</Text>
        </TouchableOpacity>
        {/* Projekt exportieren - nur in Pro Version */}
        {Features.showProjektExport && (
        <TouchableOpacity style={styles.actionButton} onPress={exportProjectFile}>
          <Ionicons name="cloud-upload" size={20} color="#1976d2" />
          <Text style={styles.actionButtonText}>{t('projects.exportProject')}</Text>
        </TouchableOpacity>
        )}
      </View>

      {/* Modern Colorful Tabs */}
      <View style={styles.tabsContainer}>
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabsScrollContent}
        >
          {/* 1. Info - Blau */}
          <TouchableOpacity
            style={[styles.tabPill, activeTab === 'overview' && styles.tabPillActive]}
            onPress={() => handleTabChange('overview')}
          >
            <Ionicons 
              name={activeTab === 'overview' ? "information-circle" : "information-circle-outline"}
              size={20} 
              color="#3b82f6"
            />
            <Text style={[styles.tabPillText, activeTab === 'overview' && styles.tabPillTextActive]}>
              {t('common.info', 'Info')}
            </Text>
          </TouchableOpacity>
          
          {/* 2. Foto - Grün */}
          <TouchableOpacity
            style={[styles.tabPill, activeTab === 'photos' && styles.tabPillActive]}
            onPress={() => handleTabChange('photos')}
          >
            <Ionicons 
              name={activeTab === 'photos' ? "camera" : "camera-outline"}
              size={20} 
              color="#10b981"
            />
            <Text style={[styles.tabPillText, activeTab === 'photos' && styles.tabPillTextActive]}>
              {t('projects.photos')}
            </Text>
            {photos.length > 0 && (
              <View style={[styles.tabBadge, { backgroundColor: '#d1fae5' }]}>
                <Text style={[styles.tabBadgeText, { color: '#10b981' }]}>
                  {photos.length}
                </Text>
              </View>
            )}
          </TouchableOpacity>
          
          {/* 3. Skizze - Lila */}
          <TouchableOpacity
            style={[styles.tabPill, activeTab === 'sketches' && styles.tabPillActive]}
            onPress={() => handleTabChange('sketches')}
          >
            <Ionicons 
              name={activeTab === 'sketches' ? "brush" : "brush-outline"}
              size={20} 
              color="#8b5cf6"
            />
            <Text style={[styles.tabPillText, activeTab === 'sketches' && styles.tabPillTextActive]}>
              {t('projects.sketches')}
            </Text>
            {sketches.length > 0 && (
              <View style={[styles.tabBadge, { backgroundColor: '#ede9fe' }]}>
                <Text style={[styles.tabBadgeText, { color: '#8b5cf6' }]}>
                  {sketches.length}
                </Text>
              </View>
            )}
          </TouchableOpacity>
          
          {/* 3.5 Fotomessung - Grün/Teal - nur in Pro */}
          {Features.showMessungTab && (
          <TouchableOpacity
            style={[styles.tabPill, activeTab === 'imagemeter' && styles.tabPillActive]}
            onPress={() => handleTabChange('imagemeter')}
          >
            <Ionicons 
              name={activeTab === 'imagemeter' ? "analytics" : "analytics-outline"}
              size={20} 
              color="#14b8a6"
            />
            <Text style={[styles.tabPillText, activeTab === 'imagemeter' && styles.tabPillTextActive]}>
              {t('projects.measurement')}
            </Text>
            {imagemeterPhotos.length > 0 && (
              <View style={[styles.tabBadge, { backgroundColor: '#ccfbf1' }]}>
                <Text style={[styles.tabBadgeText, { color: '#14b8a6' }]}>
                  {imagemeterPhotos.length}
                </Text>
              </View>
            )}
          </TouchableOpacity>
          )}
          
          {/* 4. Flächen - Orange - nur in Pro */}
          {Features.showFlaechenTab && (
          <TouchableOpacity
            style={[styles.tabPill, activeTab === 'calculator' && styles.tabPillActive]}
            onPress={() => handleTabChange('calculator')}
          >
            <Ionicons 
              name={activeTab === 'calculator' ? "grid" : "grid-outline"}
              size={20} 
              color="#f59e0b"
            />
            <Text style={[styles.tabPillText, activeTab === 'calculator' && styles.tabPillTextActive]}>
              {t('calculator.area', 'Flächen')}
            </Text>
            {areaCalculations.length > 0 && (
              <View style={[styles.tabBadge, { backgroundColor: '#fef3c7' }]}>
                <Text style={[styles.tabBadgeText, { color: '#f59e0b' }]}>
                  {areaCalculations.length}
                </Text>
              </View>
            )}
          </TouchableOpacity>
          )}
          
          {/* 5. Dach - Rot - nur in Pro */}
          {Features.showDachTab && (
          <TouchableOpacity
            style={[styles.tabPill, activeTab === 'roofs' && styles.tabPillActive]}
            onPress={() => handleTabChange('roofs')}
          >
            <Ionicons 
              name={activeTab === 'roofs' ? "home" : "home-outline"}
              size={20} 
              color="#ef4444"
            />
            <Text style={[styles.tabPillText, activeTab === 'roofs' && styles.tabPillTextActive]}>
              {t('projects.roofMeasurement', 'Dach')}
            </Text>
            {roofs.length > 0 && (
              <View style={[styles.tabBadge, { backgroundColor: '#fee2e2' }]}>
                <Text style={[styles.tabBadgeText, { color: '#ef4444' }]}>
                  {roofs.length}
                </Text>
              </View>
            )}
          </TouchableOpacity>
          )}
          
          {/* 6. Liste - Türkis */}
          <TouchableOpacity
            style={[styles.tabPill, activeTab === 'checklists' && styles.tabPillActive]}
            onPress={() => handleTabChange('checklists')}
          >
            <Ionicons 
              name={activeTab === 'checklists' ? "checkbox" : "checkbox-outline"}
              size={20} 
              color="#06b6d4"
            />
            <Text style={[styles.tabPillText, activeTab === 'checklists' && styles.tabPillTextActive]}>
              {t('projects.checklists')}
            </Text>
            {checklists.length > 0 && (
              <View style={[styles.tabBadge, { backgroundColor: '#cffafe' }]}>
                <Text style={[styles.tabBadgeText, { color: '#06b6d4' }]}>
                  {checklists.length}
                </Text>
              </View>
            )}
          </TouchableOpacity>
          
          {/* 7. Notiz - Pink */}
          <TouchableOpacity
            style={[styles.tabPill, activeTab === 'remarks' && styles.tabPillActive]}
            onPress={() => handleTabChange('remarks')}
          >
            <Ionicons 
              name={activeTab === 'remarks' ? "document-text" : "document-text-outline"}
              size={20} 
              color="#ec4899"
            />
            <Text style={[styles.tabPillText, activeTab === 'remarks' && styles.tabPillTextActive]}>
              {t('projects.notes')}
            </Text>
          </TouchableOpacity>
          
          {/* 8. Doku - Indigo - nur in Pro */}
          {Features.showDokuTab && (
          <TouchableOpacity
            style={[styles.tabPill, activeTab === 'documents' && styles.tabPillActive]}
            onPress={() => handleTabChange('documents')}
          >
            <Ionicons 
              name={activeTab === 'documents' ? "folder" : "folder-outline"}
              size={20} 
              color="#6366f1"
            />
            <Text style={[styles.tabPillText, activeTab === 'documents' && styles.tabPillTextActive]}>
              {t('projects.documents')}
            </Text>
            {documents.length > 0 && (
              <View style={[styles.tabBadge, { backgroundColor: '#e0e7ff' }]}>
                <Text style={[styles.tabBadgeText, { color: '#6366f1' }]}>
                  {documents.length}
                </Text>
              </View>
            )}
          </TouchableOpacity>
          )}
        </ScrollView>
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
              {/* Projektnummer */}
              {project.project_number && (
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Projekt Nr.:</Text>
                  <Text style={[styles.infoValue, {color: '#4caf50', fontWeight: '600'}]}>{project.project_number}</Text>
                </View>
              )}
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
                <View style={[styles.statusBadge, { backgroundColor: project.status === 'aktiv' ? '#4caf50' : project.status === 'abgeschlossen' ? '#2196f3' : '#ff9800' }]}>
                  <Text style={styles.statusBadgeText}>
                    {project.status === 'aktiv' ? t('projects.statusActive') : project.status === 'abgeschlossen' ? t('projects.statusCompleted') : t('projects.statusCancelled')}
                  </Text>
                </View>
              </View>
              
              {/* Projektart Section - GANZ OBEN */}
              <View style={styles.sectionDivider} />
              <Text style={styles.subSectionTitle}>Projektart / Überschrift</Text>
              
              {/* Projektart und Datum nebeneinander - modernes Design */}
              <View style={{ flexDirection: 'row', gap: 12, marginTop: 8 }}>
                {/* Projektart Auswahl */}
                <TouchableOpacity
                  style={{
                    flex: 2,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    backgroundColor: project?.project_type ? '#e3f2fd' : '#f5f5f5',
                    borderWidth: 1.5,
                    borderColor: project?.project_type ? '#1976d2' : '#ddd',
                    borderRadius: 12,
                    paddingHorizontal: 14,
                    paddingVertical: 12,
                  }}
                  onPress={() => setShowDirectProjectTypePicker(true)}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                    <Ionicons 
                      name="ribbon" 
                      size={20} 
                      color={project?.project_type ? '#1976d2' : '#999'} 
                      style={{ marginRight: 10 }}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 10, color: '#666', marginBottom: 2 }}>Projektart</Text>
                      <Text style={{ 
                        fontSize: 14, 
                        fontWeight: '600',
                        color: project?.project_type ? '#1976d2' : '#999',
                      }} numberOfLines={1}>
                        {project?.project_type || 'Auswählen...'}
                      </Text>
                    </View>
                  </View>
                  <Ionicons name="chevron-down" size={18} color={project?.project_type ? '#1976d2' : '#999'} />
                </TouchableOpacity>

                {/* Datum Auswahl */}
                <TouchableOpacity
                  style={{
                    flex: 1,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    backgroundColor: project?.project_type_date ? '#e8f5e9' : '#f5f5f5',
                    borderWidth: 1.5,
                    borderColor: project?.project_type_date ? '#4caf50' : '#ddd',
                    borderRadius: 12,
                    paddingHorizontal: 14,
                    paddingVertical: 12,
                  }}
                  onPress={() => setShowDirectProjectTypeDatePicker(true)}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 10, color: '#666', marginBottom: 2 }}>Datum</Text>
                    <Text style={{ 
                      fontSize: 14, 
                      fontWeight: '600',
                      color: project?.project_type_date ? '#4caf50' : '#999',
                    }}>
                      {project?.project_type_date 
                        ? new Date(project.project_type_date).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' })
                        : '---'}
                    </Text>
                  </View>
                  <Ionicons name="calendar" size={18} color={project?.project_type_date ? '#4caf50' : '#999'} />
                </TouchableOpacity>
              </View>
              
              {/* Bauherr-Daten */}
              <View style={styles.sectionDivider} />
              <Text style={styles.subSectionTitle}>Bauherr</Text>
              {/* Kundennummer */}
              {customer?.customer_number && (
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Kunden Nr.:</Text>
                  <Text style={[styles.infoValue, {color: '#1976d2', fontWeight: '600'}]}>{customer.customer_number}</Text>
                </View>
              )}
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Name:</Text>
                <Text style={styles.infoValue}>{project?.bauherr_name || customer?.name || '-'}</Text>
              </View>
              {(project?.bauherr_phone || customer?.phone) && (
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>{t('settings.phone')}:</Text>
                  <Text style={styles.infoValue}>{project?.bauherr_phone || customer?.phone}</Text>
                </View>
              )}
              {(project?.bauherr_email || customer?.email) && (
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>{t('settings.email')}:</Text>
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
              {(project?.objekt_street || project?.objekt_plz || project?.objekt_city || project?.objekt_address_name || project?.objekt_name || project?.objekt_contact_person || project?.objekt_phone || project?.objekt_email || project?.objekt_number) && (
                <>
                  <View style={styles.sectionDivider} />
                  <Text style={styles.subSectionTitle}>
                    Objektadresse{project?.objekt_address_name ? ` (${project.objekt_address_name})` : ''}
                  </Text>
                  {/* Objektnummer */}
                  {project?.objekt_number && (
                    <View style={styles.infoRow}>
                      <Text style={styles.infoLabel}>Objekt Nr.:</Text>
                      <Text style={[styles.infoValue, {color: '#ff9800', fontWeight: '600'}]}>{project.objekt_number}</Text>
                    </View>
                  )}
                  {project?.objekt_name && (
                    <View style={styles.infoRow}>
                      <Text style={styles.infoLabel}>Name:</Text>
                      <Text style={styles.infoValue}>{project.objekt_name}</Text>
                    </View>
                  )}
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>Straße:</Text>
                    <Text style={styles.infoValue}>{project.objekt_street || '-'}</Text>
                  </View>
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>PLZ / Ort:</Text>
                    <Text style={styles.infoValue}>{project.objekt_plz || ''} {project.objekt_city || ''}</Text>
                  </View>
                  {project?.objekt_contact_person && (
                    <View style={styles.infoRow}>
                      <Text style={styles.infoLabel}>{t('projects.contactPerson')}:</Text>
                      <Text style={styles.infoValue}>{project.objekt_contact_person}</Text>
                    </View>
                  )}
                  {project?.objekt_phone && (
                    <View style={styles.infoRow}>
                      <Text style={styles.infoLabel}>{t('settings.phone')}:</Text>
                      <Text style={styles.infoValue}>{project.objekt_phone}</Text>
                    </View>
                  )}
                  {project?.objekt_email && (
                    <View style={styles.infoRow}>
                      <Text style={styles.infoLabel}>{t('settings.email')}:</Text>
                      <Text style={styles.infoValue}>{project.objekt_email}</Text>
                    </View>
                  )}
                </>
              )}
            </View>

            {/* Projektart-Überschrift (anstelle der Statistik-Karte) */}
            {project?.project_type && (
              <View style={styles.projectTypeHeader}>
                <View style={styles.projectTypeHeaderInner}>
                  <Ionicons name="ribbon" size={24} color="#1976d2" />
                  <Text style={styles.projectTypeHeaderText}>
                    {project.project_type}
                    {project.project_type_date && ` vom ${new Date(project.project_type_date).toLocaleDateString('de-DE')}`}
                  </Text>
                </View>
              </View>
            )}
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
              <View key={roof.id} style={styles.itemCardWithDelete}>
                <TouchableOpacity
                  style={styles.itemCardContent}
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
                <TouchableOpacity
                  style={styles.roofDeleteButton}
                  onPress={() => {
                    Alert.alert(
                      t('roof.deleteConfirm'),
                      t('checklists.deleteConfirmItem', { text: roof.roof_type }),
                      [
                        { text: t('common.cancel'), style: 'cancel' },
                        {
                          text: t('common.delete'),
                          style: 'destructive',
                          onPress: async () => {
                            try {
                              await RoofService.delete(roof.id);
                              setRoofs(roofs.filter(r => r.id !== roof.id));
                            } catch (error) {
                              console.error('Error deleting roof:', error);
                              Alert.alert(t('common.error'), t('roof.deleteError'));
                            }
                          }
                        }
                      ]
                    );
                  }}
                >
                  <Ionicons name="trash" size={20} color="#f44336" />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        {activeTab === 'photos' && (
          <View>
            {/* Button-Leiste */}
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
              {photoSelectMode ? (
                <>
                  <TouchableOpacity
                    style={[styles.photoActionButton, styles.photoActionButtonSave]}
                    onPress={saveSelectedPhotosToGallery}
                    disabled={isSavingToGallery}
                  >
                    {isSavingToGallery ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <>
                        <Ionicons name="download" size={22} color="#fff" />
                        <Text style={styles.photoActionButtonTextWhite}>
                          Speichern ({selectedPhotos.length})
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.photoActionButton, styles.photoActionButtonCancel]}
                    onPress={() => {
                      setPhotoSelectMode(false);
                      setSelectedPhotos([]);
                    }}
                  >
                    <Ionicons name="close" size={22} color="#fff" />
                    <Text style={styles.photoActionButtonTextWhite}>Abbrechen</Text>
                  </TouchableOpacity>
                </>
              ) : photoDeleteMode ? (
                <>
                  <TouchableOpacity
                    style={[styles.photoActionButton, { backgroundColor: selectedPhotos.length > 0 ? '#f44336' : '#ccc', flex: 1 }]}
                    onPress={handleDeleteSelectedPhotos}
                    disabled={selectedPhotos.length === 0 || isDeleting}
                  >
                    {isDeleting ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <>
                        <Ionicons name="trash" size={22} color="#fff" />
                        <Text style={styles.photoActionButtonTextWhite}>
                          Löschen ({selectedPhotos.length})
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>
                  {photos.length > 0 && (
                    <TouchableOpacity
                      style={[styles.photoActionButton, { backgroundColor: '#e3f2fd', flex: 0, paddingHorizontal: 12 }]}
                      onPress={() => {
                        if (selectedPhotos.length === photos.length) {
                          setSelectedPhotos([]);
                        } else {
                          setSelectedPhotos(photos.map(p => p.id));
                        }
                      }}
                    >
                      <Ionicons 
                        name={selectedPhotos.length === photos.length ? "checkbox" : "checkbox-outline"} 
                        size={20} 
                        color="#1976d2" 
                      />
                      <Text style={[styles.photoActionButtonText, { color: '#1976d2', fontSize: 12 }]}>Alle</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    style={[styles.photoActionButton, styles.photoActionButtonCancel]}
                    onPress={() => {
                      setPhotoDeleteMode(false);
                      setSelectedPhotos([]);
                    }}
                  >
                    <Ionicons name="close" size={22} color="#fff" />
                    <Text style={styles.photoActionButtonTextWhite}>Abbrechen</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  {/* Zur Galerie (Exportieren) */}
                  <TouchableOpacity
                    style={[styles.photoActionButton, styles.photoActionButtonExport]}
                    onPress={() => {
                      setPhotoSelectMode(true);
                      setPhotoDeleteMode(false);
                      setSelectedPhotos([]);
                    }}
                  >
                    <Ionicons name="cloud-upload-outline" size={22} color="#43a047" />
                    <View style={styles.photoActionButtonTextContainer}>
                      <Text style={[styles.photoActionButtonText, { color: '#43a047' }]}>{t('photos.fromGallery')}</Text>
                      <Text style={[styles.photoActionButtonSubtext, { color: '#43a047' }]}>(Exportieren)</Text>
                    </View>
                  </TouchableOpacity>
                  
                  {/* Fotos löschen (Mehrfach) */}
                  {photos.length > 0 && (
                    <TouchableOpacity
                      style={[styles.photoActionButton, { backgroundColor: '#ffebee', borderColor: '#f44336', borderWidth: 1.5 }]}
                      onPress={() => {
                        setPhotoDeleteMode(true);
                        setPhotoSelectMode(false);
                        setSelectedPhotos([]);
                      }}
                    >
                      <Ionicons name="trash-outline" size={22} color="#f44336" />
                      <View style={styles.photoActionButtonTextContainer}>
                        <Text style={[styles.photoActionButtonText, { color: '#f44336' }]}>Fotos löschen</Text>
                        <Text style={[styles.photoActionButtonSubtext, { color: '#f44336' }]}>(Mehrfach)</Text>
                      </View>
                    </TouchableOpacity>
                  )}
                  
                  {/* Foto hinzufügen (Importieren) */}
                  <TouchableOpacity
                    style={[styles.photoActionButton, styles.photoActionButtonImport]}
                    onPress={() => router.push(`/photos/new?projectId=${id}`)}
                  >
                    <Ionicons name="camera-outline" size={22} color="#1976d2" />
                    <View style={styles.photoActionButtonTextContainer}>
                      <Text style={[styles.photoActionButtonText, { color: '#1976d2' }]}>{t('sketches.addPhoto')}</Text>
                      <Text style={[styles.photoActionButtonSubtext, { color: '#1976d2' }]}>(Importieren)</Text>
                    </View>
                  </TouchableOpacity>
                </>
              )}
            </View>

            <View style={styles.photoGrid}>
              {photos.map((photo) => (
                <View key={photo.id} style={styles.photoItem}>
                  <TouchableOpacity
                    onPress={() => {
                      if (photoSelectMode || photoDeleteMode) {
                        togglePhotoSelection(photo.id);
                      } else {
                        router.push(`/photos/annotate?photoId=${photo.id}&projectId=${id}`);
                      }
                    }}
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
                    
                    {/* Selection Overlay - Export Modus (grün) */}
                    {photoSelectMode && (
                      <View style={[
                        styles.photoSelectOverlay,
                        selectedPhotos.includes(photo.id) && styles.photoSelectOverlayActive
                      ]}>
                        <Ionicons 
                          name={selectedPhotos.includes(photo.id) ? "checkmark-circle" : "ellipse-outline"} 
                          size={32} 
                          color={selectedPhotos.includes(photo.id) ? "#4CAF50" : "#fff"} 
                        />
                      </View>
                    )}
                    
                    {/* Selection Overlay - Lösch Modus (rot) */}
                    {photoDeleteMode && (
                      <View style={[
                        styles.photoSelectOverlay,
                        selectedPhotos.includes(photo.id) && { backgroundColor: 'rgba(244, 67, 54, 0.3)' }
                      ]}>
                        <Ionicons 
                          name={selectedPhotos.includes(photo.id) ? "checkmark-circle" : "ellipse-outline"} 
                          size={32} 
                          color={selectedPhotos.includes(photo.id) ? "#f44336" : "#fff"} 
                        />
                      </View>
                    )}
                  </TouchableOpacity>
                  
                  {/* Edit Icon - Top Right (nur wenn nicht im Auswahl-Modus) */}
                  {!photoSelectMode && !photoDeleteMode && (
                    <View style={styles.photoEditOverlay}>
                      <Ionicons name="create-outline" size={20} color="#fff" />
                    </View>
                  )}
                  
                  {/* Delete Button - Bottom Right (nur wenn nicht im Auswahl-Modus) */}
                  {!photoSelectMode && !photoDeleteMode && (
                    <TouchableOpacity
                      style={styles.photoDeleteButton}
                      onPress={() => {
                        setPhotoToDelete(photo.id);
                        setDeleteModalVisible(true);
                      }}
                    >
                      <Ionicons name="trash" size={20} color="#fff" />
                    </TouchableOpacity>
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
              <Text style={styles.addButtonText}>{t('sketches.newSketch')}</Text>
            </TouchableOpacity>

            {isTabLoading ? (
              <View style={{ padding: 40, alignItems: 'center' }}>
                <ActivityIndicator size="large" color="#1976d2" />
                <Text style={{ marginTop: 12, fontSize: 15, color: '#666' }}>Skizzen werden geladen...</Text>
              </View>
            ) : sketches.map((sketch) => {
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

                  // Calculate bounds - use viewBox approach for proper scaling
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
                      // Account for text on arrows
                      if (el.type === 'arrow' && el.data.text) {
                        minY = Math.min(minY, el.data.y1 - 20, el.data.y2 - 20);
                      }
                      if (el.type === 'pointer' && el.data.text) {
                        const fontSize = el.data.fontSize || 16;
                        minX = Math.min(minX, el.data.x1 - 30);
                        minY = Math.min(minY, el.data.y1 - fontSize - 20);
                        maxX = Math.max(maxX, el.data.x1 + el.data.text.length * fontSize * 0.6);
                      }
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
                      const x = el.x || 0;
                      const y = el.y || 0;
                      const w = el.width || (el.type === 'text' ? (el.data?.text?.length || 10) * ((el.fontSize || 20) * 0.6) : 50);
                      const h = el.height || (el.type === 'text' ? (el.fontSize || 20) + 10 : 50);
                      minX = Math.min(minX, x); maxX = Math.max(maxX, x + w);
                      // For text, y is baseline, so account for height above
                      minY = Math.min(minY, y - (el.type === 'text' ? (el.fontSize || 20) : 0));
                      maxY = Math.max(maxY, y + h);
                      hasValidBounds = true;
                    }
                  });

                  if (!hasValidBounds) return null;

                  // Add padding
                  const padding = 30;
                  minX -= padding; minY -= padding; maxX += padding; maxY += padding;
                  const drawWidth = Math.max(maxX - minX, 100);
                  const drawHeight = Math.max(maxY - minY, 100);

                  // Generate SVG elements with ORIGINAL coordinates - viewBox handles scaling
                  let svgElements = '';
                  elements.forEach((el: any) => {
                    const strokeWidth = el.strokeWidth || 2;
                    const color = el.color || '#000000';

                    if (el.type === 'path' && typeof el.data === 'string') {
                      svgElements += `<path d="${el.data}" stroke="${color}" stroke-width="${strokeWidth}" fill="none" stroke-linecap="round"/>`;
                    } else if (el.type === 'line') {
                      svgElements += `<line x1="${el.data.x1}" y1="${el.data.y1}" x2="${el.data.x2}" y2="${el.data.y2}" stroke="${color}" stroke-width="${strokeWidth}"/>`;
                    } else if (el.type === 'circle') {
                      svgElements += `<circle cx="${el.data.cx}" cy="${el.data.cy}" r="${el.data.r}" stroke="${color}" stroke-width="${strokeWidth}" fill="none"/>`;
                    } else if (el.type === 'rect') {
                      svgElements += `<rect x="${el.data.x}" y="${el.data.y}" width="${el.data.width}" height="${el.data.height}" stroke="${color}" stroke-width="${strokeWidth}" fill="none"/>`;
                    } else if (el.type === 'polyline' && el.data?.points && el.data.points.length >= 2) {
                      const points = el.data.points as { x: number; y: number }[];
                      const isClosed = el.data.closed || false;
                      let pathData = points.map((pt: {x: number; y: number}, idx: number) => `${idx === 0 ? 'M' : 'L'} ${pt.x} ${pt.y}`).join(' ');
                      if (isClosed) pathData += ' Z';
                      svgElements += `<path d="${pathData}" stroke="${color}" stroke-width="${strokeWidth}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
                      
                      // Render dimension lines for this polyline if measurements exist in metadata
                      const lineSegmentMeasurements = metadata.lineSegmentMeasurements || {};
                      const elementMeasurements = lineSegmentMeasurements[el.id] || {};
                      Object.keys(elementMeasurements).forEach((segIdxStr: string) => {
                        const segIdx = parseInt(segIdxStr, 10);
                        const measurementText = elementMeasurements[segIdx];
                        if (!measurementText) return;
                        
                        const p1 = points[segIdx];
                        const p2 = segIdx === points.length - 1 && isClosed 
                          ? points[0] 
                          : points[segIdx + 1];
                        if (!p1 || !p2) return;
                        
                        // Midpoint of the line
                        const midX = (p1.x + p2.x) / 2;
                        const midY = (p1.y + p2.y) / 2;
                        
                        // Angle of the line
                        const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
                        
                        // Offset for dimension line
                        const offset = 15;
                        const offsetX = -Math.sin(angle) * offset;
                        const offsetY = Math.cos(angle) * offset;
                        const tickLength = 8;
                        
                        // Dimension line
                        svgElements += `<line x1="${p1.x + offsetX}" y1="${p1.y + offsetY}" x2="${p2.x + offsetX}" y2="${p2.y + offsetY}" stroke="#1976d2" stroke-width="1.5"/>`;
                        // Left tick
                        svgElements += `<line x1="${p1.x + offsetX - Math.sin(angle) * tickLength}" y1="${p1.y + offsetY + Math.cos(angle) * tickLength}" x2="${p1.x + offsetX + Math.sin(angle) * tickLength}" y2="${p1.y + offsetY - Math.cos(angle) * tickLength}" stroke="#1976d2" stroke-width="1.5"/>`;
                        // Right tick
                        svgElements += `<line x1="${p2.x + offsetX - Math.sin(angle) * tickLength}" y1="${p2.y + offsetY + Math.cos(angle) * tickLength}" x2="${p2.x + offsetX + Math.sin(angle) * tickLength}" y2="${p2.y + offsetY - Math.cos(angle) * tickLength}" stroke="#1976d2" stroke-width="1.5"/>`;
                        // Text background
                        const textWidth = measurementText.length * 8 + 8;
                        svgElements += `<rect x="${midX + offsetX - textWidth/2}" y="${midY + offsetY - 10}" width="${textWidth}" height="16" fill="white" rx="2"/>`;
                        // Text
                        svgElements += `<text x="${midX + offsetX}" y="${midY + offsetY + 3}" fill="#1976d2" font-size="12" font-weight="bold" text-anchor="middle">${measurementText}</text>`;
                      });
                      
                      // Render label (S1, S2, S3...) at center if this polyline has measurements
                      if (Object.keys(elementMeasurements).length > 0) {
                        const sumX = points.reduce((acc: number, pt: {x: number; y: number}) => acc + pt.x, 0);
                        const sumY = points.reduce((acc: number, pt: {x: number; y: number}) => acc + pt.y, 0);
                        const centerX = sumX / points.length;
                        const centerY = sumY / points.length;
                        
                        // Find index of this element among all polylines with measurements
                        const polylinesWithMeasurements = elements.filter((e: any) => 
                          e.type === 'polyline' && 
                          e.data?.points && 
                          Object.keys(lineSegmentMeasurements[e.id] || {}).length > 0
                        );
                        const labelIndex = polylinesWithMeasurements.findIndex((e: any) => e.id === el.id);
                        if (labelIndex !== -1) {
                          const labelText = `S${labelIndex + 1}`;
                          svgElements += `<circle cx="${centerX}" cy="${centerY}" r="18" fill="#1976d2" stroke="#fff" stroke-width="2"/>`;
                          svgElements += `<text x="${centerX}" y="${centerY + 5}" fill="#fff" font-size="14" font-weight="bold" text-anchor="middle">${labelText}</text>`;
                        }
                      }
                    } else if (el.type === 'arrow') {
                      const { x1, y1, x2, y2, text, heads } = el.data;
                      const angle = Math.atan2(y2 - y1, x2 - x1);
                      const angleDeg = angle * 180 / Math.PI;
                      const arrowSize = Math.max(10, strokeWidth * 3);
                      
                      const endX1 = x2 - arrowSize * Math.cos(angle - Math.PI / 6);
                      const endY1 = y2 - arrowSize * Math.sin(angle - Math.PI / 6);
                      const endX2 = x2 - arrowSize * Math.cos(angle + Math.PI / 6);
                      const endY2 = y2 - arrowSize * Math.sin(angle + Math.PI / 6);
                      
                      svgElements += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="${strokeWidth}"/>`;
                      svgElements += `<polygon points="${x2},${y2} ${endX1},${endY1} ${endX2},${endY2}" fill="${color}"/>`;
                      
                      if (heads === 'double') {
                        const startX1 = x1 + arrowSize * Math.cos(angle - Math.PI / 6);
                        const startY1 = y1 + arrowSize * Math.sin(angle - Math.PI / 6);
                        const startX2 = x1 + arrowSize * Math.cos(angle + Math.PI / 6);
                        const startY2 = y1 + arrowSize * Math.sin(angle + Math.PI / 6);
                        svgElements += `<polygon points="${x1},${y1} ${startX1},${startY1} ${startX2},${startY2}" fill="${color}"/>`;
                      }
                      
                      if (text) {
                        const midX = (x1 + x2) / 2;
                        const midY = (y1 + y2) / 2;
                        const fontSize = el.data.fontSize || 14;
                        svgElements += `<text x="${midX}" y="${midY - 10}" text-anchor="middle" font-size="${fontSize}" font-weight="bold" fill="${color}" transform="rotate(${angleDeg} ${midX} ${midY})">${text}</text>`;
                      }
                    } else if (el.type === 'text' && el.data?.text) {
                      const x = el.x || 0;
                      const y = el.y || 0;
                      const fontSize = el.fontSize || 20;
                      svgElements += `<text x="${x}" y="${y}" font-size="${fontSize}" fill="${color}" font-weight="${el.fontWeight || 'bold'}" font-style="${el.fontStyle || 'normal'}">${el.data.text}</text>`;
                    } else if (el.type === 'image' && el.data?.uri) {
                      const x = el.x || 0;
                      const y = el.y || 0;
                      const w = el.width || 100;
                      const h = el.height || 100;
                      svgElements += `<image href="${el.data.uri}" x="${x}" y="${y}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid meet"/>`;
                    } else if (el.type === 'pointer') {
                      const { x1, y1, x2, y2, text } = el.data;
                      const angle = Math.atan2(y2 - y1, x2 - x1);
                      const pointerStrokeWidth = el.strokeWidth || 6;
                      const arrowHeadSize = Math.max(20, pointerStrokeWidth * 4);
                      const arrowHeadAngle = Math.PI / 6;
                      
                      const leftX = x2 - arrowHeadSize * Math.cos(angle - arrowHeadAngle);
                      const leftY = y2 - arrowHeadSize * Math.sin(angle - arrowHeadAngle);
                      const rightX = x2 - arrowHeadSize * Math.cos(angle + arrowHeadAngle);
                      const rightY = y2 - arrowHeadSize * Math.sin(angle + arrowHeadAngle);
                      
                      const lineEndX = x2 - arrowHeadSize * 0.6 * Math.cos(angle);
                      const lineEndY = y2 - arrowHeadSize * 0.6 * Math.sin(angle);
                      
                      svgElements += `<line x1="${x1}" y1="${y1}" x2="${lineEndX}" y2="${lineEndY}" stroke="${color}" stroke-width="${pointerStrokeWidth}" stroke-linecap="round"/>`;
                      svgElements += `<polygon points="${x2},${y2} ${leftX},${leftY} ${rightX},${rightY}" fill="${color}"/>`;
                      
                      if (text) {
                        const fontSize = el.data.fontSize || 16;
                        const textOffset = 15;
                        const textX = x1 + textOffset * Math.cos(angle - Math.PI / 2);
                        const textY = y1 + textOffset * Math.sin(angle - Math.PI / 2);
                        const textWidth = text.length * fontSize * 0.6 + 10;
                        const textHeight = fontSize + 8;
                        svgElements += `<rect x="${textX - 5}" y="${textY - fontSize}" width="${textWidth}" height="${textHeight}" fill="white" fill-opacity="0.85" rx="4" ry="4" stroke="${color}" stroke-width="1"/>`;
                        svgElements += `<text x="${textX}" y="${textY}" font-size="${fontSize}" fill="${color}" font-weight="bold">${text}</text>`;
                      }
                    }
                  });

                  // Render Summary Legend (Übersicht)
                  const lineSegmentMeasurements = metadata.lineSegmentMeasurements || {};
                  const polylinesWithMeasurements = elements.filter((e: any) => 
                    e.type === 'polyline' && 
                    e.data?.points && 
                    Object.keys(lineSegmentMeasurements[e.id] || {}).length > 0
                  );
                  
                  if (polylinesWithMeasurements.length > 0) {
                    const legendWidth = 220; // Noch breiter für bessere Lesbarkeit
                    const lineHeight = 36; // Deutlich höhere Zeilen
                    const legendHeight = 55 + (polylinesWithMeasurements.length * lineHeight) + 25;
                    
                    // Get legend position from metadata or use default
                    const legendPosition = metadata.legendPosition || { x: 0, y: 0 };
                    const canvasWidth = metadata.canvasWidth || 400;
                    const canvasHeight = metadata.canvasHeight || 600;
                    
                    // Calculate legend position
                    const uiStartX = canvasWidth - 12 - legendWidth;
                    const uiStartY = canvasHeight - 150;
                    const uiFinalX = uiStartX + legendPosition.x;
                    const uiFinalY = uiStartY + legendPosition.y;
                    
                    // Convert to SVG coordinates (relative to original minX/minY before padding)
                    const origMinX = minX;
                    const origMinY = minY;
                    const svgLegendX = origMinX + uiFinalX;
                    const svgLegendY = origMinY + uiFinalY;
                    
                    // Extend bounds to include legend
                    if (svgLegendX < minX) minX = svgLegendX - 10;
                    if (svgLegendX + legendWidth > maxX) maxX = svgLegendX + legendWidth + 10;
                    if (svgLegendY - legendHeight < minY) minY = svgLegendY - legendHeight - 10;
                    if (svgLegendY > maxY) maxY = svgLegendY + 10;
                    
                    // Legend background - größer
                    svgElements += `<rect x="${svgLegendX}" y="${svgLegendY - legendHeight}" width="${legendWidth}" height="${legendHeight}" fill="white" stroke="#e3f2fd" stroke-width="2" rx="8" ry="8"/>`;
                    
                    // Legend title - größere Schrift
                    svgElements += `<text x="${svgLegendX + 15}" y="${svgLegendY - legendHeight + 30}" fill="#333" font-size="18" font-weight="bold">Übersicht</text>`;
                    
                    // Legend items
                    polylinesWithMeasurements.forEach((polyEl: any, index: number) => {
                      const elementMeasurements = lineSegmentMeasurements[polyEl.id] || {};
                      let totalLfm = 0;
                      
                      // Calculate total for this element
                      Object.values(elementMeasurements).forEach((measurementText: any) => {
                        if (!measurementText) return;
                        const cleanText = measurementText.replace('m', '').replace(',', '.').trim();
                        const value = parseFloat(cleanText);
                        if (!isNaN(value)) totalLfm += value;
                      });
                      
                      if (totalLfm <= 0) return;
                      
                      const itemY = svgLegendY - legendHeight + 55 + (index * lineHeight);
                      const labelText = `S${index + 1}`;
                      
                      // Label badge - größer
                      svgElements += `<rect x="${svgLegendX + 15}" y="${itemY - 16}" width="38" height="24" fill="#1976d2" rx="4" ry="4"/>`;
                      svgElements += `<text x="${svgLegendX + 34}" y="${itemY + 2}" fill="#fff" font-size="14" font-weight="bold" text-anchor="middle">${labelText}</text>`;
                      
                      // Value text - größere Schrift
                      svgElements += `<text x="${svgLegendX + 62}" y="${itemY + 2}" fill="#333" font-size="16">= ${totalLfm.toString().replace('.', ',')} lfm</text>`;
                    });
                  }
                  
                  // Recalculate dimensions after adding legend
                  const finalDrawWidth = Math.max(maxX - minX, 100);
                  const finalDrawHeight = Math.max(maxY - minY, 100);

                  // Use viewBox for proper scaling - browser handles the resize
                  return `<svg width="100%" height="100%" viewBox="${minX} ${minY} ${finalDrawWidth} ${finalDrawHeight}" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg"><rect x="${minX}" y="${minY}" width="${finalDrawWidth}" height="${finalDrawHeight}" fill="#ffffff"/>${svgElements}</svg>`;
                } catch (e) {
                  console.log('Error generating SVG from metadata:', e);
                  return null;
                }
              };

              // Use saved preview SVG from sketch_data (metadata is stored separately for performance)
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
                          height="100%"
                          preserveAspectRatio="xMidYMid meet"
                        />
                      </View>
                    )}
                    
                    {/* Render regular image (e.g., background photo) */}
                    {isRegularImage && (
                      <Image
                        source={{ uri: sketch.sketch_data }}
                        style={styles.sketchImage}
                        resizeMode="cover"
                      />
                    )}
                    
                    {/* Show placeholder if no preview available */}
                    {!svgXml && !isRegularImage && (
                      <View style={styles.sketchPlaceholder}>
                        <Ionicons name="create-outline" size={40} color="#ccc" />
                        <Text style={styles.sketchPlaceholderText}>Skizze</Text>
                      </View>
                    )}
                    
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
            })
            }
          </View>
        )}

        {activeTab === 'checklists' && (
          <View>
            <TouchableOpacity
              style={styles.addButton}
              onPress={() => router.push(`/checklists/new?projectId=${id}`)}
            >
              <Ionicons name="add-circle" size={24} color="#1976d2" />
              <Text style={styles.addButtonText}>{t('checklists.newChecklist')}</Text>
            </TouchableOpacity>

            {checklists.map((checklist, checklistIndex) => {
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
              
              // Rekursiv alle Items zählen
              const countTotalItemsRecursive = (items: any[]): number => {
                let total = items.length;
                items.forEach(item => {
                  if (item.subItems && item.subItems.length > 0) {
                    total += countTotalItemsRecursive(item.subItems);
                  }
                });
                return total;
              };
              
              // Flache Liste aller tieferen Unterpunkte (ab Level 2) erstellen
              const flattenDeepSubItems = (items: any[], basePrefix: string): { text: string; level: number; prefix: string; note?: string; measurements?: any[] }[] => {
                const result: { text: string; level: number; prefix: string; note?: string; measurements?: any[] }[] = [];
                items.forEach((item, index) => {
                  const currentPrefix = `${basePrefix}.${index + 1}`;
                  const currentLevel = currentPrefix.split('.').length - 2; // Level relativ zum Container
                  
                  if (item.checked) {
                    result.push({
                      text: item.text,
                      level: currentLevel,
                      prefix: currentPrefix,
                      note: item.note,
                      measurements: item.measurements,
                    });
                  }
                  if (item.subItems && item.subItems.length > 0) {
                    result.push(...flattenDeepSubItems(item.subItems, currentPrefix));
                  }
                });
                return result;
              };
              
              // Hauptkategorien (Level 0) als Überschriften, Level 1 als Container
              const renderCategoryContainers = (items: any[]): React.ReactNode => {
                // Nur abgehakte Hauptkategorien filtern
                const checkedCategories = items.filter(item => item.checked);
                
                if (checkedCategories.length === 0) {
                  return <Text style={styles.emptyHint}>Noch keine Positionen abgehakt</Text>;
                }
                
                return (
                  <View>
                    {checkedCategories.map((category, catIndex) => {
                      // Level 1 Unterpunkte (die werden zu Containern)
                      const level1Items = category.subItems || [];
                      const checkedLevel1Items = level1Items.filter((item: any) => item.checked);
                      
                      // Zähler für die Kategorie
                      const checkedSubCount = category.subItems 
                        ? countCheckedItemsRecursive(category.subItems)
                        : 0;
                      const totalSubCount = category.subItems 
                        ? countTotalItemsRecursive(category.subItems)
                        : 0;
                      
                      return (
                        <View key={`cat-${catIndex}`} style={styles.categorySection}>
                          {/* Kategorie-Überschrift mit Logo */}
                          <View style={styles.categorySectionHeader}>
                            {category.categoryLogo && (
                              <TouchableOpacity 
                                onPress={() => {
                                  setCurrentImageIndex(0);
                                  setImagePreviewModal({ visible: true, images: [category.categoryLogo], title: category.text });
                                }}
                              >
                                <Image source={{ uri: category.categoryLogo }} style={styles.categoryLogoSmall} />
                              </TouchableOpacity>
                            )}
                            <Ionicons name="checkbox" size={18} color="#4caf50" />
                            <Text style={styles.categorySectionTitle}>{category.text}</Text>
                            {/* Druckbild Thumbnail */}
                            {category.printImage && (
                              <TouchableOpacity 
                                onPress={() => {
                                  setCurrentImageIndex(0);
                                  setImagePreviewModal({ visible: true, images: [category.printImage], title: `${category.text} - Druckbild` });
                                }}
                                style={styles.printImageThumbnailBtn}
                              >
                                <Image source={{ uri: category.printImage }} style={styles.printImageThumbnail} resizeMode="contain" />
                              </TouchableOpacity>
                            )}
                            {/* Galerie-Button für Vorschau-Bilder */}
                            {category.previewImages && category.previewImages.length > 0 && (
                              <TouchableOpacity 
                                onPress={() => {
                                  setCurrentImageIndex(0);
                                  setImagePreviewModal({ visible: true, images: category.previewImages, title: `${category.text} - Galerie` });
                                }}
                                style={styles.previewGalleryBtn}
                              >
                                <Ionicons name="images" size={18} color="#ff9800" />
                                <Text style={styles.previewGalleryCount}>{category.previewImages.length}</Text>
                              </TouchableOpacity>
                            )}
                            {/* Referenz-Button für verknüpften Ordner */}
                            {category.referenceFolderId && (
                              <TouchableOpacity 
                                onPress={() => openReferencePhotos(category.referenceFolderId!, category.referenceFolderName || 'Referenzen')}
                                style={styles.referenceFolderBtn}
                              >
                                <Ionicons name="folder" size={18} color="#2196f3" />
                              </TouchableOpacity>
                            )}
                            {totalSubCount > 0 && (
                              <Text style={styles.categorySectionCount}>{checkedSubCount}/{totalSubCount}</Text>
                            )}
                          </View>
                          
                          {/* Notiz für Hauptkategorie */}
                          {category.note && (
                            <View style={styles.categoryNoteContainer}>
                              <Ionicons name="document-text-outline" size={14} color="#ff9800" />
                              <Text style={styles.categoryNoteText}>{category.note}</Text>
                            </View>
                          )}
                          
                          {/* Messungen für Hauptkategorie */}
                          {category.measurements && category.measurements.length > 0 && (
                            <View style={styles.categoryMeasurementContainer}>
                              {category.measurements.map((m: any, mIdx: number) => {
                                const expr = m.expression || m.value?.toString() || '0';
                                const result = m.result ?? m.value ?? 0;
                                return (
                                  <Text key={mIdx} style={styles.categoryMeasurementText}>
                                    📐 {expr.replace(/\./g, ',').replace(/\*/g, '×')} = {result.toString().replace('.', ',')} {m.unit}
                                  </Text>
                                );
                              })}
                              {/* Summen für Hauptkategorie */}
                              {(() => {
                                const sumsByUnit: { [unit: string]: number } = {};
                                category.measurements.forEach((m: any) => {
                                  const result = m.result ?? m.value ?? 0;
                                  sumsByUnit[m.unit] = (sumsByUnit[m.unit] || 0) + result;
                                });
                                const units = Object.keys(sumsByUnit);
                                if (units.length > 0) {
                                  return (
                                    <View style={styles.categorySumRow}>
                                      <Text style={styles.categorySumLabel}>Summen:</Text>
                                      {units.map(unit => (
                                        <Text key={unit} style={styles.categorySumValue}>
                                          {sumsByUnit[unit].toFixed(2).replace('.', ',')} {unit}
                                        </Text>
                                      ))}
                                    </View>
                                  );
                                }
                                return null;
                              })()}
                            </View>
                          )}
                          
                          {/* Grid mit Level 1 Containern */}
                          {checkedLevel1Items.length > 0 ? (
                            <View style={[styles.level1Grid, { 
                              flexDirection: 'row',
                              flexWrap: 'wrap',
                              gap: 8,
                            }]}>
                              {checkedLevel1Items.map((level1Item: any, l1Index: number) => {
                                // Finde den Original-Index für korrekte Nummerierung
                                const originalIndex = level1Items.indexOf(level1Item);
                                const containerPrefix = `${catIndex + 1}.${originalIndex + 1}`;
                                
                                // Tiefere Unterpunkte für diesen Container
                                const deepSubItems = level1Item.subItems 
                                  ? flattenDeepSubItems(level1Item.subItems, containerPrefix)
                                  : [];
                                
                                // Dynamische Breite basierend auf Spaltenanzahl
                                const itemWidth = checklistColumns === 1 ? '100%' : 
                                                  checklistColumns === 2 ? '48%' : '31%';
                                
                                return (
                                  <View key={`l1-${catIndex}-${l1Index}`} style={[styles.level1Container, {
                                    minWidth: itemWidth,
                                    maxWidth: checklistColumns === 1 ? '100%' : itemWidth,
                                    flexBasis: itemWidth,
                                  }]}>
                                    {/* Container-Überschrift (z.B. 1.1 Test 1.1) */}
                                    <View style={styles.level1Header}>
                                      <Text style={styles.level1Prefix}>{containerPrefix}</Text>
                                      <Ionicons name="checkmark-circle" size={14} color="#4caf50" />
                                      <Text style={styles.level1Title} numberOfLines={2}>{level1Item.text}</Text>
                                      {/* Druckbild und Galerie für Level 1 */}
                                      {level1Item.printImage && (
                                        <TouchableOpacity 
                                          onPress={() => {
                                            setCurrentImageIndex(0);
                                            setImagePreviewModal({ visible: true, images: [level1Item.printImage], title: `${level1Item.text} - Druckbild` });
                                          }}
                                          style={styles.printImageThumbnailBtnSmall}
                                        >
                                          <Image source={{ uri: level1Item.printImage }} style={styles.printImageThumbnailSmall} resizeMode="contain" />
                                        </TouchableOpacity>
                                      )}
                                      {level1Item.previewImages && level1Item.previewImages.length > 0 && (
                                        <TouchableOpacity 
                                          onPress={() => {
                                            setCurrentImageIndex(0);
                                            setImagePreviewModal({ visible: true, images: level1Item.previewImages, title: `${level1Item.text} - Galerie` });
                                          }}
                                          style={styles.previewGalleryBtnSmall}
                                        >
                                          <Ionicons name="images" size={14} color="#ff9800" />
                                          <Text style={styles.previewGalleryCountSmall}>{level1Item.previewImages.length}</Text>
                                        </TouchableOpacity>
                                      )}
                                      {/* Referenz-Button für Level 1 Item */}
                                      {level1Item.referenceFolderId && (
                                        <TouchableOpacity 
                                          onPress={() => openReferencePhotos(level1Item.referenceFolderId!, level1Item.referenceFolderName || 'Referenzen')}
                                          style={styles.referenceFolderBtnSmall}
                                        >
                                          <Ionicons name="folder" size={14} color="#2196f3" />
                                        </TouchableOpacity>
                                      )}
                                    </View>
                                    
                                    {/* Notiz für Level 1 Item */}
                                    {level1Item.note && (
                                      <View style={styles.noteContainer}>
                                        <Ionicons name="document-text-outline" size={12} color="#ff9800" />
                                        <Text style={styles.noteText}>{level1Item.note}</Text>
                                      </View>
                                    )}
                                    
                                    {/* Messungen für Level 1 Item */}
                                    {level1Item.measurements && level1Item.measurements.length > 0 && (
                                      <View style={styles.measurementDisplayContainer}>
                                        {level1Item.measurements.map((m: any, mIdx: number) => {
                                          const expr = m.expression || m.value?.toString() || '0';
                                          const result = m.result ?? m.value ?? 0;
                                          return (
                                            <Text key={mIdx} style={styles.measurementDisplayText}>
                                              📐 {expr.replace(/\./g, ',').replace(/\*/g, '×')} = {result.toString().replace('.', ',')} {m.unit}
                                            </Text>
                                          );
                                        })}
                                      </View>
                                    )}
                                    
                                    {/* Tiefere Unterpunkte */}
                                    {deepSubItems.length > 0 && (
                                      <View style={styles.level1Content}>
                                        {deepSubItems.map((subItem, subIndex) => (
                                          <View key={`deep-${subIndex}`}>
                                            <View 
                                              style={[
                                                styles.deepSubItem,
                                                { paddingLeft: subItem.level * 8 }
                                              ]}
                                            >
                                              <Text style={styles.deepSubPrefix}>{subItem.prefix}</Text>
                                              <Ionicons name="checkmark" size={10} color="#4caf50" />
                                              <Text style={styles.deepSubText} numberOfLines={1}>{subItem.text}</Text>
                                            </View>
                                            {/* Notiz für Unterposition */}
                                            {subItem.note && (
                                              <View style={[styles.deepNoteContainer, { marginLeft: subItem.level * 8 + 36 }]}>
                                                <Ionicons name="document-text-outline" size={10} color="#ff9800" />
                                                <Text style={styles.deepNoteText}>{subItem.note}</Text>
                                              </View>
                                            )}
                                            {/* Messungen für Unterposition */}
                                            {subItem.measurements && subItem.measurements.length > 0 && (
                                              <View style={[styles.measurementDisplayContainer, { marginLeft: subItem.level * 8 + 36 }]}>
                                                {subItem.measurements.map((m: any, mIdx: number) => {
                                                  const expr = m.expression || m.value?.toString() || '0';
                                                  const result = m.result ?? m.value ?? 0;
                                                  return (
                                                    <Text key={mIdx} style={styles.measurementDisplayText}>
                                                      📐 {expr.replace(/\./g, ',').replace(/\*/g, '×')} = {result.toString().replace('.', ',')} {m.unit}
                                                    </Text>
                                                  );
                                                })}
                                              </View>
                                            )}
                                          </View>
                                        ))}
                                      </View>
                                    )}
                                  </View>
                                );
                              })}
                            </View>
                          ) : (
                            <Text style={styles.noSubItemsHint}>Keine Unterpunkte abgehakt</Text>
                          )}
                        </View>
                      );
                    })}
                  </View>
                );
              };
              
              const checkedCount = countCheckedItemsRecursive(checklist.items);
              const totalCount = countTotalItemsRecursive(checklist.items);
              
              return (
                <View key={checklist.id} style={styles.checklistCardWrapper}>
                  <TouchableOpacity
                    style={styles.compactChecklistCard}
                    onPress={() => router.push(`/checklists/${checklist.id}`)}
                  >
                    {/* Hauptüberschrift - mit Template-Logo */}
                    <View style={styles.checklistMainHeader}>
                      {(checklist as any).templateLogo && (
                        <TouchableOpacity 
                          onPress={(e) => {
                            e.stopPropagation();
                            setCurrentImageIndex(0);
                            setImagePreviewModal({ visible: true, images: [(checklist as any).templateLogo], title: checklist.template_name });
                          }}
                        >
                          <Image source={{ uri: (checklist as any).templateLogo }} style={styles.checklistTemplateLogo} />
                        </TouchableOpacity>
                      )}
                      <Text style={[styles.checklistMainTitle, (checklist as any).templateLogo && { flex: 1 }]}>{checklist.template_name}</Text>
                      <View style={styles.headerRight}>
                        <View style={styles.checkedBadge}>
                          <Text style={styles.checkedBadgeText}>
                            {checkedCount} von {totalCount}
                          </Text>
                        </View>
                      </View>
                    </View>
                    
                    {/* Kategorie-Container Grid */}
                    {renderCategoryContainers(checklist.items)}
                  </TouchableOpacity>
                  
                  {/* Move Up Button */}
                  {checklistIndex > 0 && (
                    <TouchableOpacity
                      style={styles.checklistMoveUpButton}
                      onPress={() => moveChecklist(checklistIndex, 'up')}
                    >
                      <Ionicons name="arrow-up" size={16} color="#fff" />
                    </TouchableOpacity>
                  )}
                  
                  {/* Move Down Button */}
                  {checklistIndex < checklists.length - 1 && (
                    <TouchableOpacity
                      style={styles.checklistMoveDownButton}
                      onPress={() => moveChecklist(checklistIndex, 'down')}
                    >
                      <Ionicons name="arrow-down" size={16} color="#fff" />
                    </TouchableOpacity>
                  )}
                  
                  {/* Save as Template Button */}
                  <TouchableOpacity
                    style={styles.checklistTemplateButton}
                    onPress={() => saveChecklistAsTemplate(checklist)}
                  >
                    <Ionicons name="copy-outline" size={18} color="#fff" />
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
                <Text style={styles.remarksTitle}>{t('projects.remarks')}</Text>
              </View>
              <Text style={styles.remarksSubtitle}>
                {t('projects.remarksSubtitle')}
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                <TextInput
                  ref={remarksInputRef}
                  style={[styles.remarksInput, { flex: 1 }]}
                  placeholderTextColor="#999" placeholder={t('projects.remarksPlaceholder')}
                  value={remarks}
                  onChangeText={setRemarks}
                  multiline
                  numberOfLines={10}
                  textAlignVertical="top"
                />
                <TouchableOpacity
                  style={{
                    marginLeft: 8,
                    padding: 12,
                    backgroundColor: showRemarksNumpad ? '#1976d2' : '#f0f0f0',
                    borderRadius: 8,
                  }}
                  onPress={() => setShowRemarksNumpad(!showRemarksNumpad)}
                >
                  <Ionicons
                    name="keypad"
                    size={24}
                    color={showRemarksNumpad ? '#fff' : '#666'}
                  />
                </TouchableOpacity>
              </View>
              
              {/* Numpad für Bemerkungen */}
              {showRemarksNumpad && (
                <View style={styles.remarksNumpadContainer}>
                  <View style={styles.remarksNumpadHeader}>
                    <Text style={styles.remarksNumpadTitle}>Numpad</Text>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <TouchableOpacity
                        style={[
                          styles.remarksNumpadModeButton,
                          remarksNumpadMode === 'numbers' && styles.remarksNumpadModeButtonActive,
                        ]}
                        onPress={() => setRemarksNumpadMode('numbers')}
                      >
                        <Text style={[
                          styles.remarksNumpadModeButtonText,
                          remarksNumpadMode === 'numbers' && styles.remarksNumpadModeButtonTextActive,
                        ]}>123</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[
                          styles.remarksNumpadModeButton,
                          remarksNumpadMode === 'letters' && styles.remarksNumpadModeButtonActive,
                        ]}
                        onPress={() => setRemarksNumpadMode('letters')}
                      >
                        <Text style={[
                          styles.remarksNumpadModeButtonText,
                          remarksNumpadMode === 'letters' && styles.remarksNumpadModeButtonTextActive,
                        ]}>ABC</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                  
                  {remarksNumpadMode === 'numbers' ? (
                    <View style={styles.remarksNumpadGrid}>
                      {/* Zahlenreihen */}
                      <View style={styles.remarksNumpadRow}>
                        {['7', '8', '9', '+'].map((k) => (
                          <TouchableOpacity
                            key={`num-${k}`}
                            style={[styles.remarksNumpadKey, k === '+' && styles.remarksNumpadOp]}
                            onPress={() => handleRemarksNumpadPress(k)}
                          >
                            <Text style={k === '+' ? styles.remarksNumpadOpText : styles.remarksNumpadKeyText}>{k}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                      <View style={styles.remarksNumpadRow}>
                        {['4', '5', '6', '-'].map((k) => (
                          <TouchableOpacity
                            key={`num-${k}`}
                            style={[styles.remarksNumpadKey, k === '-' && styles.remarksNumpadOp]}
                            onPress={() => handleRemarksNumpadPress(k)}
                          >
                            <Text style={k === '-' ? styles.remarksNumpadOpText : styles.remarksNumpadKeyText}>{k === '-' ? '−' : k}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                      <View style={styles.remarksNumpadRow}>
                        {['1', '2', '3', '×'].map((k) => (
                          <TouchableOpacity
                            key={`num-${k}`}
                            style={[styles.remarksNumpadKey, k === '×' && styles.remarksNumpadOp]}
                            onPress={() => handleRemarksNumpadPress(k === '×' ? '*' : k)}
                          >
                            <Text style={k === '×' ? styles.remarksNumpadOpText : styles.remarksNumpadKeyText}>{k}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                      <View style={styles.remarksNumpadRow}>
                        {['0', ',', '.', '÷'].map((k) => (
                          <TouchableOpacity
                            key={`num-${k}`}
                            style={[styles.remarksNumpadKey, k === '÷' && styles.remarksNumpadOp]}
                            onPress={() => handleRemarksNumpadPress(k === '÷' ? '/' : k)}
                          >
                            <Text style={k === '÷' ? styles.remarksNumpadOpText : styles.remarksNumpadKeyText}>{k}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                      {/* Einheiten */}
                      <View style={styles.remarksNumpadRow}>
                        {['m', 'cm', 'mm', 'm²'].map((k, i) => (
                          <TouchableOpacity
                            key={`unit-${i}`}
                            style={[styles.remarksNumpadKey, styles.remarksNumpadUnit]}
                            onPress={() => handleRemarksNumpadPress(k)}
                          >
                            <Text style={styles.remarksNumpadUnitText}>{k}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                      <View style={styles.remarksNumpadRow}>
                        {['lfm', 'Stk', '€', '%'].map((k, i) => (
                          <TouchableOpacity
                            key={`unit2-${i}`}
                            style={[styles.remarksNumpadKey, styles.remarksNumpadUnit]}
                            onPress={() => handleRemarksNumpadPress(k)}
                          >
                            <Text style={styles.remarksNumpadUnitText}>{k}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                      {/* Aktionstasten */}
                      <View style={styles.remarksNumpadRow}>
                        <TouchableOpacity
                          style={[styles.remarksNumpadKey, styles.remarksNumpadClear]}
                          onPress={() => handleRemarksNumpadPress('C')}
                        >
                          <Text style={styles.remarksNumpadClearText}>C</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.remarksNumpadKey}
                          onPress={() => handleRemarksNumpadPress(' ')}
                        >
                          <Text style={styles.remarksNumpadKeyText}>␣</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.remarksNumpadKey}
                          onPress={() => handleRemarksNumpadPress('\n')}
                        >
                          <Text style={styles.remarksNumpadKeyText}>↵</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.remarksNumpadKey, styles.remarksNumpadDel]}
                          onPress={() => handleRemarksNumpadPress('⌫')}
                        >
                          <Ionicons name="backspace-outline" size={20} color="#fff" />
                        </TouchableOpacity>
                      </View>
                    </View>
                  ) : (
                    <View style={styles.remarksNumpadGrid}>
                      {/* Buchstaben */}
                      <View style={styles.remarksNumpadRow}>
                        {['q', 'w', 'e', 'r', 't', 'z', 'u', 'i', 'o', 'p'].map((k) => (
                          <TouchableOpacity
                            key={`let-${k}`}
                            style={styles.remarksNumpadKeySmall}
                            onPress={() => handleRemarksNumpadPress(remarksNumpadCaps ? k.toUpperCase() : k)}
                          >
                            <Text style={styles.remarksNumpadKeyTextSmall}>{remarksNumpadCaps ? k.toUpperCase() : k}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                      <View style={styles.remarksNumpadRow}>
                        {['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'].map((k) => (
                          <TouchableOpacity
                            key={`let-${k}`}
                            style={styles.remarksNumpadKeySmall}
                            onPress={() => handleRemarksNumpadPress(remarksNumpadCaps ? k.toUpperCase() : k)}
                          >
                            <Text style={styles.remarksNumpadKeyTextSmall}>{remarksNumpadCaps ? k.toUpperCase() : k}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                      <View style={styles.remarksNumpadRow}>
                        <TouchableOpacity
                          style={[styles.remarksNumpadKeySmall, remarksNumpadCaps && styles.remarksNumpadCapsActive]}
                          onPress={() => setRemarksNumpadCaps(!remarksNumpadCaps)}
                        >
                          <Ionicons name="arrow-up" size={16} color={remarksNumpadCaps ? '#fff' : '#666'} />
                        </TouchableOpacity>
                        {['y', 'x', 'c', 'v', 'b', 'n', 'm'].map((k) => (
                          <TouchableOpacity
                            key={`let-${k}`}
                            style={styles.remarksNumpadKeySmall}
                            onPress={() => handleRemarksNumpadPress(remarksNumpadCaps ? k.toUpperCase() : k)}
                          >
                            <Text style={styles.remarksNumpadKeyTextSmall}>{remarksNumpadCaps ? k.toUpperCase() : k}</Text>
                          </TouchableOpacity>
                        ))}
                        <TouchableOpacity
                          style={[styles.remarksNumpadKeySmall, styles.remarksNumpadDel]}
                          onPress={() => handleRemarksNumpadPress('⌫')}
                        >
                          <Ionicons name="backspace-outline" size={16} color="#fff" />
                        </TouchableOpacity>
                      </View>
                      <View style={styles.remarksNumpadRow}>
                        <TouchableOpacity
                          style={[styles.remarksNumpadKey, { flex: 3 }]}
                          onPress={() => handleRemarksNumpadPress(' ')}
                        >
                          <Text style={styles.remarksNumpadKeyText}>Leerzeichen</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.remarksNumpadKey}
                          onPress={() => handleRemarksNumpadPress('\n')}
                        >
                          <Text style={styles.remarksNumpadKeyText}>↵</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  )}
                </View>
              )}
              <TouchableOpacity
                style={[styles.saveRemarksButton, isSavingRemarks && styles.buttonDisabled]}
                onPress={async () => {
                  if (!project) return;
                  setIsSavingRemarks(true);
                  try {
                    await ProjectService.update(project.id, {
                      customer_id: project.customer_id,
                      name: project.name,
                      description: project.description || '',
                      status: project.status,
                      remarks: remarks,
                    });
                    // Update local project state with new remarks
                    setProject({ ...project, remarks: remarks });
                    if (Platform.OS === 'web') {
                      alert(t('projects.remarksSaved'));
                    } else {
                      Alert.alert(t('common.success'), t('roof.notesSaved'));
                    }
                  } catch (error) {
                    console.error('Error saving remarks:', error);
                    if (Platform.OS === 'web') {
                      alert(t('projects.remarksSaveError'));
                    } else {
                      Alert.alert(t('common.error'), t('roof.notesSaveError'));
                    }
                  } finally {
                    setIsSavingRemarks(false);
                  }
                }}
                disabled={isSavingRemarks}
              >
                <Ionicons name="save-outline" size={20} color="#fff" />
                <Text style={styles.saveRemarksButtonText}>
                  {isSavingRemarks ? t('common.isSaving') : t('projects.saveRemarks')}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {activeTab === 'documents' && (
          <View style={styles.documentsSection}>
            <TouchableOpacity
              style={styles.addButton}
              onPress={() => router.push({
                pathname: '/documents/new',
                params: { projectId: Array.isArray(id) ? id[0] : id },
              })}
            >
              <Ionicons name="add-circle" size={24} color="#fff" />
              <Text style={styles.addButtonText}>PDF hinzufügen</Text>
            </TouchableOpacity>

            {documents.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="document-text-outline" size={48} color="#ccc" />
                <Text style={styles.emptyText}>Keine Dokumente vorhanden</Text>
                <Text style={styles.emptySubtext}>
                  Fügen Sie PDF-Dokumente hinzu, um Angebote mit Kunden zu besprechen und Anmerkungen zu machen.
                </Text>
              </View>
            ) : (
              <View style={styles.documentsGrid}>
                {documents.map((doc) => (
                  <TouchableOpacity
                    key={doc.id}
                    style={styles.documentCard}
                    onPress={() => router.push({
                      pathname: '/documents/view',
                      params: { documentId: doc.id, projectId: Array.isArray(id) ? id[0] : id },
                    })}
                  >
                    <View style={styles.documentIcon}>
                      <Ionicons name="document-text" size={40} color="#1976d2" />
                      {doc.pages.length > 0 && (
                        <View style={styles.annotationBadge}>
                          <Ionicons name="pencil" size={12} color="#fff" />
                        </View>
                      )}
                    </View>
                    <Text style={styles.documentName} numberOfLines={2}>{doc.name}</Text>
                    <Text style={styles.documentDate}>
                      {new Date(doc.updated_at).toLocaleDateString('de-DE')}
                    </Text>
                    <TouchableOpacity
                      style={styles.deleteDocButton}
                      onPress={() => {
                        Alert.alert(
                          t('documents.deleteDocument'),
                          t('checklists.deleteConfirmItem', { text: doc.name }),
                          [
                            { text: t('common.cancel'), style: 'cancel' },
                            {
                              text: t('common.delete'),
                              style: 'destructive',
                              onPress: async () => {
                                try {
                                  await DocumentService.delete(doc.id);
                                  await loadProjectData();
                                  Alert.alert(t('common.success'), t('documents.documentDeleted'));
                                } catch (error) {
                                  console.error('Error deleting document:', error);
                                  Alert.alert(t('common.error'), t('documents.documentDeleteError'));
                                }
                              },
                            },
                          ]
                        );
                      }}
                    >
                      <Ionicons name="trash-outline" size={18} color="#f44336" />
                    </TouchableOpacity>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        )}

        {activeTab === 'imagemeter' && (
          <View style={styles.documentsSection}>
            <TouchableOpacity
              style={styles.addButton}
              onPress={() => router.push({
                pathname: '/imagemeter/new',
                params: { projectId: Array.isArray(id) ? id[0] : id },
              })}
            >
              <Ionicons name="add-circle" size={24} color="#fff" />
              <Text style={styles.addButtonText}>{t('photos.newPhoto')}</Text>
            </TouchableOpacity>

            {imagemeterPhotos.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="camera-outline" size={48} color="#ccc" />
                <Text style={styles.emptyText}>{t('photos.noPhotos')}</Text>
                <Text style={styles.emptySubtext}>
                  Messen Sie direkt auf Fotos. Setzen Sie ein Referenzmaß für automatische Berechnungen.
                </Text>
              </View>
            ) : (
              <View style={styles.documentsGrid}>
                {imagemeterPhotos.map((photo: any) => (
                  <TouchableOpacity
                    key={photo.id}
                    style={styles.documentCard}
                    onPress={() => router.push({
                      pathname: '/imagemeter/measure',
                      params: { id: photo.id },
                    })}
                  >
                    <Image 
                      source={{ uri: photo.imageUri }} 
                      style={{ width: '100%', height: 100, borderRadius: 8, marginBottom: 8 }}
                      resizeMode="cover"
                    />
                    <Text style={styles.documentName} numberOfLines={2}>{photo.name || 'Unbenannt'}</Text>
                    <Text style={styles.calculatorResultText}>
                      {photo.measurements?.length || 0} Messungen
                    </Text>
                    {photo.referenceScale && (
                      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                        <Ionicons name="resize" size={12} color="#4CAF50" />
                        <Text style={{ fontSize: 10, color: '#4CAF50', marginLeft: 4 }}>Kalibriert</Text>
                      </View>
                    )}
                    <Text style={styles.documentDate}>
                      {new Date(photo.updatedAt).toLocaleDateString('de-DE')}
                    </Text>
                    <TouchableOpacity
                      style={styles.deleteDocButton}
                      onPress={() => {
                        Alert.alert(
                          t('roof.photoMeasurementDeleted'),
                          t('checklists.deleteConfirmItem', { text: photo.name || t('projects.unnamed') }),
                          [
                            { text: t('common.cancel'), style: 'cancel' },
                            {
                              text: t('common.delete'),
                              style: 'destructive',
                              onPress: async () => {
                                try {
                                  const AsyncStorage = require('@react-native-async-storage/async-storage').default;
                                  const data = await AsyncStorage.getItem('aufmassprofi_imagemeter_photos');
                                  if (data) {
                                    const allPhotos = JSON.parse(data);
                                    const filtered = allPhotos.filter((p: any) => p.id !== photo.id);
                                    await AsyncStorage.setItem('aufmassprofi_imagemeter_photos', JSON.stringify(filtered));
                                    await loadProjectData();
                                    Alert.alert(t('common.success'), t('roof.photoMeasurementDeleted'));
                                  }
                                } catch (error) {
                                  console.error('Error deleting imagemeter photo:', error);
                                  Alert.alert(t('common.error'), t('roof.deleteFailed'));
                                }
                              },
                            },
                          ]
                        );
                      }}
                    >
                      <Ionicons name="trash-outline" size={18} color="#f44336" />
                    </TouchableOpacity>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        )}

        {activeTab === 'calculator' && (
          <View style={styles.documentsSection}>
            <TouchableOpacity
              style={styles.addButton}
              onPress={() => router.push({
                pathname: '/calculator/new',
                params: { projectId: Array.isArray(id) ? id[0] : id },
              })}
            >
              <Ionicons name="add-circle" size={24} color="#fff" />
              <Text style={styles.addButtonText}>Neue Flächenberechnung</Text>
            </TouchableOpacity>

            {areaCalculations.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="calculator-outline" size={48} color="#ccc" />
                <Text style={styles.emptyText}>Keine Flächenberechnungen</Text>
                <Text style={styles.emptySubtext}>
                  Berechnen Sie Flächen und Linien mit Polygonen für Giebel, Dächer und Fassaden.
                </Text>
              </View>
            ) : (
              <View style={styles.documentsGrid}>
                {areaCalculations.map((calc) => (
                  <TouchableOpacity
                    key={calc.id}
                    style={styles.documentCard}
                    onPress={() => router.push({
                      pathname: '/calculator/edit',
                      params: { id: calc.id, projectId: Array.isArray(id) ? id[0] : id },
                    })}
                  >
                    <View style={styles.documentIcon}>
                      <Ionicons name="shapes" size={40} color="#1976d2" />
                    </View>
                    <Text style={styles.documentName} numberOfLines={2}>{calc.name}</Text>
                    {calc.results && (
                      <Text style={styles.calculatorResultText}>
                        {calc.results.netArea.toFixed(2).replace('.', ',')} m²
                      </Text>
                    )}
                    <Text style={styles.documentDate}>
                      {new Date(calc.updated_at).toLocaleDateString('de-DE')}
                    </Text>
                    <TouchableOpacity
                      style={styles.deleteDocButton}
                      onPress={() => {
                        Alert.alert(
                          t('calculator.calculationDeleted'),
                          t('checklists.deleteConfirmItem', { text: calc.name }),
                          [
                            { text: t('common.cancel'), style: 'cancel' },
                            {
                              text: t('common.delete'),
                              style: 'destructive',
                              onPress: async () => {
                                try {
                                  await AreaCalculationService.delete(calc.id);
                                  await loadProjectData();
                                  Alert.alert(t('common.success'), t('calculator.calculationDeleted'));
                                } catch (error) {
                                  console.error('Error deleting calculation:', error);
                                  Alert.alert(t('common.error'), t('calculator.calculationDeleteError'));
                                }
                              },
                            },
                          ]
                        );
                      }}
                    >
                      <Ionicons name="trash-outline" size={18} color="#f44336" />
                    </TouchableOpacity>
                  </TouchableOpacity>
                ))}
              </View>
            )}
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
              {t('photos.deleteConfirm')}
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
                  {isDeleting ? t('projects.deleting2') : t('projects.deleteItem')}
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
              {t('common.delete')}?
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
                  {isDeletingSketch ? t('projects.deleting2') : t('projects.deleteItem')}
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
              {t('checklists.deleteChecklist')}?
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
                  {isDeletingChecklist ? t('projects.deleting2') : t('projects.deleteItem')}
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
              <Text style={styles.modalTitle}>{t('projects.editProject')}</Text>
              <TouchableOpacity onPress={() => setShowEditProjectModal(false)}>
                <Ionicons name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>
            
            <ScrollView 
              style={styles.editModalScroll}
              contentContainerStyle={styles.editModalScrollContent}
              keyboardShouldPersistTaps="handled"
            >
              <View style={[styles.editFormRow, isPhone && styles.editFormRowPhone]}>
                {/* Linke Spalte */}
                <View style={styles.editFormColumn}>
                  <Text style={styles.editSectionTitle}>Projekt</Text>
                  
                  <View style={styles.compactInputGroup}>
                    <Text style={styles.compactLabel}>PN (Projektnummer)</Text>
                    <TextInput
                      style={styles.compactInput}
                      value={editProjectNumber}
                      onChangeText={setEditProjectNumber}
                      placeholderTextColor="#999" placeholder="z.B. PR-26001"
                    />
                  </View>
                  
                  <View style={styles.compactInputGroup}>
                    <Text style={styles.compactLabel}>Name *</Text>
                    <TextInput
                      style={styles.compactInput}
                      value={editProjectName}
                      onChangeText={setEditProjectName}
                      placeholderTextColor="#999" placeholder={t('projects.projectName')}
                    />
                  </View>

                  <View style={styles.compactInputGroup}>
                    <Text style={styles.compactLabel}>{t('projects.description')}</Text>
                    <TextInput
                      style={[styles.compactInput, styles.compactTextArea]}
                      value={editProjectDescription}
                      onChangeText={setEditProjectDescription}
                      placeholderTextColor="#999" placeholder={t('projects.description')}
                      multiline
                      numberOfLines={2}
                    />
                  </View>

                  <View style={styles.compactInputGroup}>
                    <Text style={styles.compactLabel}>Status</Text>
                    <View style={styles.statusButtonsCompact}>
                      {['aktiv', 'abgeschlossen', 'abgebrochen'].map((status) => (
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
                            {status === 'aktiv' ? t('projects.statusActive') : status === 'abgeschlossen' ? t('home.completed') : t('home.cancelled')}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                  
                  {/* Projektart-Überschrift - OBEN */}
                  <View style={styles.projectTypeEditSection}>
                    <Text style={styles.editSectionTitle}>Projektart / Überschrift</Text>
                    
                    <View style={styles.projectTypeEditRow}>
                      <View style={styles.projectTypeEditPicker}>
                        <Text style={styles.compactLabel}>Projektart</Text>
                        <TouchableOpacity 
                          style={styles.compactPickerButton}
                          onPress={() => setShowProjectTypePicker(true)}
                        >
                          <Text style={editProjectType ? styles.compactPickerText : styles.compactPickerPlaceholder}>
                            {editProjectType || t('projects.selectProjectType')}
                          </Text>
                          <Ionicons name="chevron-down" size={16} color="#666" />
                        </TouchableOpacity>
                      </View>
                      
                      <View style={styles.projectTypeEditDate}>
                        <Text style={styles.compactLabel}>Datum (optional)</Text>
                        <TouchableOpacity 
                          style={styles.compactPickerButton}
                          onPress={() => {
                            if (editProjectTypeDate) {
                              Alert.alert(
                                t('projects.dateLabel'),
                                t('projects.whatToDo'),
                                [
                                  { text: t('common.cancel'), style: 'cancel' },
                                  { 
                                    text: t('projects.deleteDate'), 
                                    style: 'destructive',
                                    onPress: () => setEditProjectTypeDate('')
                                  },
                                  {
                                    text: t('projects.changeDate'),
                                    onPress: () => setShowProjectTypeDatePicker(true)
                                  }
                                ]
                              );
                            } else {
                              setShowProjectTypeDatePicker(true);
                            }
                          }}
                        >
                          <Text style={editProjectTypeDate ? styles.compactPickerText : styles.compactPickerPlaceholder}>
                            {editProjectTypeDate 
                              ? new Date(editProjectTypeDate).toLocaleDateString('de-DE')
                              : 'Datum auswählen...'}
                          </Text>
                          <Ionicons name="calendar-outline" size={16} color="#666" />
                        </TouchableOpacity>
                      </View>
                      
                      {editProjectType && (
                        <TouchableOpacity
                          style={styles.projectTypeClearButton}
                          onPress={() => {
                            setEditProjectType('');
                            setEditProjectTypeDate('');
                          }}
                        >
                          <Ionicons name="close-circle" size={24} color="#f44336" />
                        </TouchableOpacity>
                      )}
                    </View>
                    
                    {editProjectType && (
                      <View style={styles.projectTypePreview}>
                        <Text style={styles.projectTypePreviewLabel}>Vorschau:</Text>
                        <Text style={styles.projectTypePreviewText}>
                          {editProjectType}
                          {editProjectTypeDate && ` vom ${new Date(editProjectTypeDate).toLocaleDateString('de-DE')}`}
                        </Text>
                      </View>
                    )}
                  </View>
                </View>

                {/* Rechte Spalte */}
                <View style={styles.editFormColumn}>
                  <Text style={styles.editSectionTitle}>Bauherr</Text>
                  
                  <View style={styles.compactInputGroup}>
                    <Text style={styles.compactLabel}>KN (Kundennummer)</Text>
                    <TextInput
                      style={styles.compactInput}
                      value={editCustomerNumber}
                      onChangeText={setEditCustomerNumber}
                      placeholderTextColor="#999" placeholder="z.B. KD-26001"
                    />
                  </View>
                  
                  <View style={styles.compactInputGroup}>
                    <Text style={styles.compactLabel}>Anrede</Text>
                    <TouchableOpacity 
                      style={styles.compactPickerButton}
                      onPress={() => setShowBauherrSalutationPicker(true)}
                    >
                      <Text style={editBauherrSalutation ? styles.compactPickerText : styles.compactPickerPlaceholder}>
                        {editBauherrSalutation || 'Anrede...'}
                      </Text>
                      <Ionicons name="chevron-down" size={16} color="#666" />
                    </TouchableOpacity>
                  </View>

                  <View style={styles.addressRow}>
                    <View style={styles.cityInput}>
                      <Text style={styles.compactLabel}>Vorname</Text>
                      <TextInput
                        style={styles.compactInput}
                        value={editBauherrFirstName}
                        onChangeText={setEditBauherrFirstName}
                        placeholderTextColor="#999" placeholder="Vorname"
                      />
                    </View>
                    <View style={styles.cityInput}>
                      <Text style={styles.compactLabel}>Nachname</Text>
                      <TextInput
                        style={styles.compactInput}
                        value={editBauherrLastName}
                        onChangeText={setEditBauherrLastName}
                        placeholderTextColor="#999" placeholder="Nachname"
                      />
                    </View>
                  </View>

                  <View style={styles.addressRow}>
                    <View style={styles.cityInput}>
                      <Text style={styles.compactLabel}>Telefon</Text>
                      <TextInput
                        style={styles.compactInput}
                        value={editBauherrPhone}
                        onChangeText={setEditBauherrPhone}
                        placeholderTextColor="#999" placeholder="Festnetz"
                        keyboardType="phone-pad"
                      />
                    </View>
                    <View style={styles.cityInput}>
                      <Text style={styles.compactLabel}>Mobil</Text>
                      <TextInput
                        style={styles.compactInput}
                        value={editBauherrMobile}
                        onChangeText={setEditBauherrMobile}
                        placeholderTextColor="#999" placeholder="Handynummer"
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
                      placeholderTextColor="#999" placeholder="E-Mail"
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
                      placeholderTextColor="#999" placeholder="Straße und Hausnummer"
                    />
                  </View>

                  <View style={styles.compactInputGroup}>
                    <Text style={styles.compactLabel}>PLZ</Text>
                    <TextInput
                      style={[styles.compactInput, { width: 120 }]}
                      value={editBauherrPlz}
                      onChangeText={setEditBauherrPlz}
                      placeholderTextColor="#999" placeholder="PLZ"
                      keyboardType="number-pad"
                    />
                  </View>
                  
                  <View style={styles.compactInputGroup}>
                    <Text style={styles.compactLabel}>Ort</Text>
                    <TextInput
                      style={styles.compactInput}
                      value={editBauherrCity}
                      onChangeText={setEditBauherrCity}
                      placeholderTextColor="#999" placeholder="Ort (inkl. Ortsteil)"
                    />
                  </View>

                  <Text style={styles.editSectionTitle}>Objektadresse (optional)</Text>
                  
                  <View style={styles.compactInputGroup}>
                    <Text style={styles.compactLabel}>OBJ (Objektnummer)</Text>
                    <TextInput
                      style={styles.compactInput}
                      value={editObjektNumber}
                      onChangeText={setEditObjektNumber}
                      placeholderTextColor="#999" placeholder="z.B. OBJ-26001"
                    />
                  </View>
                  
                  <View style={styles.compactInputGroup}>
                    <Text style={styles.compactLabel}>Name</Text>
                    <TextInput
                      style={styles.compactInput}
                      value={editObjektName}
                      onChangeText={setEditObjektName}
                      placeholderTextColor="#999" placeholder="z.B. Herr Müller"
                    />
                  </View>

                  <View style={styles.compactInputGroup}>
                    <Text style={styles.compactLabel}>Straße</Text>
                    <TextInput
                      style={styles.compactInput}
                      value={editObjektStreet}
                      onChangeText={setEditObjektStreet}
                      placeholderTextColor="#999" placeholder="Falls abweichend"
                    />
                  </View>

                  <View style={styles.addressRow}>
                    <View style={styles.plzInput}>
                      <Text style={styles.compactLabel}>PLZ</Text>
                      <TextInput
                        style={styles.compactInput}
                        value={editObjektPlz}
                        onChangeText={setEditObjektPlz}
                        placeholderTextColor="#999" placeholder="PLZ"
                        keyboardType="number-pad"
                      />
                    </View>
                    <View style={styles.cityInput}>
                      <Text style={styles.compactLabel}>Ort</Text>
                      <TextInput
                        style={styles.compactInput}
                        value={editObjektCity}
                        onChangeText={setEditObjektCity}
                        placeholderTextColor="#999" placeholder="Ort"
                      />
                    </View>
                  </View>
                  
                  <View style={styles.compactInputGroup}>
                    <Text style={styles.compactLabel}>Ansprechpartner</Text>
                    <TextInput
                      style={styles.compactInput}
                      value={editObjektContactPerson}
                      onChangeText={setEditObjektContactPerson}
                      placeholderTextColor="#999" placeholder="Name des Ansprechpartners"
                    />
                  </View>
                  
                  <View style={styles.addressRow}>
                    <View style={styles.plzInput}>
                      <Text style={styles.compactLabel}>Telefon</Text>
                      <TextInput
                        style={styles.compactInput}
                        value={editObjektPhone}
                        onChangeText={setEditObjektPhone}
                        placeholderTextColor="#999" placeholder="Telefon"
                        keyboardType="phone-pad"
                      />
                    </View>
                    <View style={styles.cityInput}>
                      <Text style={styles.compactLabel}>E-Mail</Text>
                      <TextInput
                        style={styles.compactInput}
                        value={editObjektEmail}
                        onChangeText={setEditObjektEmail}
                        placeholderTextColor="#999" placeholder="E-Mail"
                        keyboardType="email-address"
                        autoCapitalize="none"
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
                  {isSavingProject ? t('common.saving') : t('common.save')}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>

        {/* Bauherr Anrede Picker - innerhalb des Edit Modal */}
        {showBauherrSalutationPicker && (
          <View style={styles.salutationPickerOverlay}>
            <TouchableOpacity 
              style={styles.salutationPickerBackdrop}
              activeOpacity={1}
              onPress={() => setShowBauherrSalutationPicker(false)}
            />
            <View style={styles.salutationPickerContent}>
              <Text style={styles.salutationModalTitle}>Anrede auswählen</Text>
              {SALUTATION_OPTIONS.map((option) => (
                <TouchableOpacity
                  key={option}
                  style={styles.salutationOption}
                  onPress={() => {
                    setEditBauherrSalutation(option);
                    setShowBauherrSalutationPicker(false);
                  }}
                >
                  <Text style={[
                    styles.salutationOptionText,
                    editBauherrSalutation === option && styles.salutationOptionSelected
                  ]}>{option}</Text>
                  {editBauherrSalutation === option && (
                    <Ionicons name="checkmark" size={20} color="#1976d2" />
                  )}
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                style={styles.salutationOption}
                onPress={() => {
                  setEditBauherrSalutation('');
                  setShowBauherrSalutationPicker(false);
                }}
              >
                <Text style={styles.salutationOptionText}>Keine Anrede</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Projektart Picker */}
        {showProjectTypePicker && (
          <View style={styles.salutationPickerOverlay}>
            <TouchableOpacity 
              style={styles.salutationPickerBackdrop}
              activeOpacity={1}
              onPress={() => setShowProjectTypePicker(false)}
            />
            <View style={[styles.salutationPickerContent, { maxHeight: 400 }]}>
              <Text style={styles.salutationModalTitle}>Projektart auswählen</Text>
              <ScrollView style={{ maxHeight: 300 }}>
                {projectTypeOptions.length === 0 ? (
                  <View style={{ padding: 20, alignItems: 'center' }}>
                    <Ionicons name="alert-circle-outline" size={40} color="#999" />
                    <Text style={{ color: '#666', marginTop: 10, textAlign: 'center' }}>
                      Keine Projektarten definiert.{'\n'}Bitte in den Einstellungen hinzufügen.
                    </Text>
                  </View>
                ) : (
                  projectTypeOptions.map((option) => (
                    <TouchableOpacity
                      key={option}
                      style={styles.salutationOption}
                      onPress={() => {
                        setEditProjectType(option);
                        setShowProjectTypePicker(false);
                      }}
                    >
                      <Text style={[
                        styles.salutationOptionText,
                        editProjectType === option && styles.salutationOptionSelected
                      ]}>{option}</Text>
                      {editProjectType === option && (
                        <Ionicons name="checkmark" size={20} color="#1976d2" />
                      )}
                    </TouchableOpacity>
                  ))
                )}
              </ScrollView>
              <TouchableOpacity
                style={[styles.salutationOption, { borderTopWidth: 1, borderTopColor: '#e0e0e0' }]}
                onPress={() => {
                  setEditProjectType('');
                  setShowProjectTypePicker(false);
                }}
              >
                <Text style={styles.salutationOptionText}>Keine Projektart</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Datum Picker - Native iOS/Android DateTimePicker */}
        {showProjectTypeDatePicker && (
          <View style={styles.salutationPickerOverlay}>
            <TouchableOpacity 
              style={styles.salutationPickerBackdrop}
              activeOpacity={1}
              onPress={() => setShowProjectTypeDatePicker(false)}
            />
            <View style={[styles.salutationPickerContent, { padding: 20 }]}>
              <Text style={styles.salutationModalTitle}>Datum auswählen</Text>
              <View style={{ marginTop: 10, alignItems: 'center', backgroundColor: '#fff' }}>
                <DateTimePicker
                  value={editProjectTypeDate ? new Date(editProjectTypeDate) : new Date()}
                  mode="date"
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  onChange={(event, selectedDate) => {
                    if (Platform.OS === 'android') {
                      setShowProjectTypeDatePicker(false);
                    }
                    if (selectedDate) {
                      setEditProjectTypeDate(selectedDate.toISOString());
                    }
                  }}
                  locale="de-DE"
                  themeVariant="light"
                  accentColor="#1976d2"
                  style={{ width: '100%', height: 180, backgroundColor: '#fff' }}
                />
                <View style={{ flexDirection: 'row', gap: 10, marginTop: 15, width: '100%' }}>
                  <TouchableOpacity
                    style={{ flex: 1, backgroundColor: '#f44336', padding: 12, borderRadius: 8, alignItems: 'center' }}
                    onPress={() => {
                      setEditProjectTypeDate('');
                      setShowProjectTypeDatePicker(false);
                    }}
                  >
                    <Text style={{ color: '#fff' }}>Löschen</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={{ flex: 1, backgroundColor: '#1976d2', padding: 12, borderRadius: 8, alignItems: 'center' }}
                    onPress={() => setShowProjectTypeDatePicker(false)}
                  >
                    <Text style={{ color: '#fff' }}>Fertig</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </View>
        )}
      </Modal>

      {/* DIREKTE Projektart Picker (für Übersicht - speichert sofort) - AUSSERHALB des Edit-Modals */}
      {showDirectProjectTypePicker && (
        <View style={styles.salutationPickerOverlay}>
          <TouchableOpacity 
            style={styles.salutationPickerBackdrop}
            activeOpacity={1}
            onPress={() => setShowDirectProjectTypePicker(false)}
          />
          <View style={[styles.salutationPickerContent, { maxHeight: 400 }]}>
            <Text style={styles.salutationModalTitle}>Projektart auswählen</Text>
            <ScrollView style={{ maxHeight: 300 }}>
              {projectTypeOptions.length === 0 ? (
                <View style={{ padding: 20, alignItems: 'center' }}>
                  <Ionicons name="alert-circle-outline" size={40} color="#999" />
                  <Text style={{ color: '#666', marginTop: 10, textAlign: 'center' }}>
                    Keine Projektarten definiert.{'\n'}Bitte in den Einstellungen hinzufügen.
                  </Text>
                </View>
              ) : (
                projectTypeOptions.map((option) => (
                  <TouchableOpacity
                    key={option}
                    style={styles.salutationOption}
                    onPress={async () => {
                      // Direkt speichern
                      const projectId = Array.isArray(id) ? id[0] : id;
                      await ProjectService.update(projectId, {
                        ...project,
                        project_type: option,
                      });
                      // Speichere als zuletzt verwendete Projektart
                      await setLastUsedProjectType(option);
                      setShowDirectProjectTypePicker(false);
                      await loadProjectData();
                    }}
                  >
                    <Text style={[
                      styles.salutationOptionText,
                      project?.project_type === option && styles.salutationOptionSelected
                    ]}>{option}</Text>
                    {project?.project_type === option && (
                      <Ionicons name="checkmark" size={20} color="#1976d2" />
                    )}
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>
            <TouchableOpacity
              style={[styles.salutationOption, { borderTopWidth: 1, borderTopColor: '#e0e0e0' }]}
              onPress={async () => {
                // Projektart löschen
                const projectId = Array.isArray(id) ? id[0] : id;
                await ProjectService.update(projectId, {
                  ...project,
                  project_type: undefined,
                });
                setShowDirectProjectTypePicker(false);
                await loadProjectData();
              }}
            >
              <Text style={[styles.salutationOptionText, { color: '#f44336' }]}>Keine Projektart</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* DIREKTE Datum Picker (für Übersicht - speichert sofort) - AUSSERHALB des Edit-Modals */}
      {showDirectProjectTypeDatePicker && (
        <View style={styles.salutationPickerOverlay}>
          <TouchableOpacity 
            style={styles.salutationPickerBackdrop}
            activeOpacity={1}
            onPress={() => setShowDirectProjectTypeDatePicker(false)}
          />
          <View style={[styles.salutationPickerContent, { padding: 20 }]}>
            <Text style={styles.salutationModalTitle}>Datum auswählen</Text>
            <View style={{ marginTop: 10, alignItems: 'center', backgroundColor: '#fff' }}>
              <DateTimePicker
                value={project?.project_type_date ? new Date(project.project_type_date) : new Date()}
                mode="date"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                onChange={async (event, selectedDate) => {
                  if (Platform.OS === 'android') {
                    setShowDirectProjectTypeDatePicker(false);
                    if (selectedDate) {
                      const projectId = Array.isArray(id) ? id[0] : id;
                      await ProjectService.update(projectId, {
                        ...project,
                        project_type_date: selectedDate.toISOString(),
                      });
                      await loadProjectData();
                    }
                  }
                  // Auf iOS: Nur temporär speichern, "Fertig" Button speichert endgültig
                  if (selectedDate && Platform.OS === 'ios') {
                    setTempSelectedDate(selectedDate);
                  }
                }}
                locale="de-DE"
                themeVariant="light"
                accentColor="#1976d2"
                style={{ width: '100%', height: 180, backgroundColor: '#fff' }}
              />
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 15, width: '100%' }}>
                <TouchableOpacity
                  style={{ flex: 1, backgroundColor: '#f44336', padding: 12, borderRadius: 8, alignItems: 'center' }}
                  onPress={async () => {
                    // Datum löschen
                    const projectId = Array.isArray(id) ? id[0] : id;
                    await ProjectService.update(projectId, {
                      ...project,
                      project_type_date: undefined,
                    });
                    setShowDirectProjectTypeDatePicker(false);
                    setTempSelectedDate(null);
                    await loadProjectData();
                  }}
                >
                  <Text style={{ color: '#fff' }}>Löschen</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={{ flex: 1, backgroundColor: '#1976d2', padding: 12, borderRadius: 8, alignItems: 'center' }}
                  onPress={async () => {
                    // Speichere das aktuell angezeigte Datum
                    const dateToSave = tempSelectedDate || (project?.project_type_date ? new Date(project.project_type_date) : new Date());
                    const projectId = Array.isArray(id) ? id[0] : id;
                    await ProjectService.update(projectId, {
                      ...project,
                      project_type_date: dateToSave.toISOString(),
                    });
                    setShowDirectProjectTypeDatePicker(false);
                    setTempSelectedDate(null);
                    await loadProjectData();
                  }}
                >
                  <Text style={{ color: '#fff' }}>Fertig</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      )}

      {/* PDF Preview Modal */}
      <Modal
        visible={showPdfPreviewModal}
        animationType="slide"
        onRequestClose={() => setShowPdfPreviewModal(false)}
      >
        <View style={styles.pdfPreviewContainer}>
          <View style={styles.pdfPreviewHeader}>
            <TouchableOpacity 
              style={styles.pdfPreviewCloseButton}
              onPress={() => setShowPdfPreviewModal(false)}
            >
              <Ionicons name="close" size={24} color="#333" />
            </TouchableOpacity>
            <Text style={styles.pdfPreviewTitle}>{t('projects.pdfPreview')}</Text>
            <TouchableOpacity 
              style={{
                backgroundColor: '#1976d2',
                paddingHorizontal: 12,
                paddingVertical: 6,
                borderRadius: 16,
                flexDirection: 'row',
                alignItems: 'center',
              }}
              onPress={async () => {
                try {
                  const { uri } = await Print.printToFileAsync({ html: pdfHtmlContent });
                  await Sharing.shareAsync(uri, { UTI: '.pdf', mimeType: 'application/pdf' });
                } catch (error) {
                  console.error('Print error:', error);
                }
              }}
            >
              <Ionicons name="print" size={18} color="#fff" />
              <Text style={{ color: '#fff', marginLeft: 6, fontWeight: '600', fontSize: 13 }}>{t('projects.print')}</Text>
            </TouchableOpacity>
          </View>
          
          {/* Toggle for detailed calculation pages */}
          {areaCalculations.length > 0 && (
            <TouchableOpacity 
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                paddingVertical: 8,
                paddingHorizontal: 16,
                backgroundColor: showCalcDetailsPage ? '#4CAF50' : '#e0e0e0',
                marginHorizontal: 16,
                marginVertical: 8,
                borderRadius: 20,
              }}
              onPress={() => setShowCalcDetailsPage(!showCalcDetailsPage)}
            >
              <Ionicons 
                name={showCalcDetailsPage ? "checkbox" : "square-outline"} 
                size={20} 
                color={showCalcDetailsPage ? "#fff" : "#666"} 
              />
              <Text style={{ 
                marginLeft: 8, 
                color: showCalcDetailsPage ? '#fff' : '#666',
                fontWeight: '600',
                fontSize: 14,
              }}>
                Berechnungsdetails drucken
              </Text>
            </TouchableOpacity>
          )}
          
          <ViewShot 
            ref={viewShotRef} 
            style={styles.pdfPreviewContent}
            options={{ format: 'jpg', quality: 0.9 }}
          >
            {pdfHtmlContent ? (
              <WebView
                source={{ html: pdfHtmlContent }}
                style={styles.pdfWebView}
                scalesPageToFit={true}
                showsVerticalScrollIndicator={true}
              />
            ) : (
              <View style={styles.pdfPreviewLoading}>
                <ActivityIndicator size="large" color="#1976d2" />
                <Text style={styles.pdfPreviewLoadingText}>Vorschau wird geladen...</Text>
              </View>
            )}
          </ViewShot>
          
          <View style={styles.pdfPreviewActions}>
            <TouchableOpacity 
              style={[styles.pdfPreviewActionButton, styles.pdfPreviewImageButton, { flex: 1 }]}
              onPress={sharePreviewAsImage}
              disabled={isSharingImage}
            >
              {isSharingImage ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="image-outline" size={22} color="#fff" />
                  <Text style={styles.pdfPreviewActionText}>{t('projects.shareAsImage')}</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Checklist Image Preview Modal */}
      <Modal
        visible={imagePreviewModal.visible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setImagePreviewModal({ ...imagePreviewModal, visible: false })}
      >
        <View style={styles.imageModalOverlay}>
          <View style={styles.imageModalContent}>
            <View style={styles.imageModalHeader}>
              <Text style={styles.imageModalTitle}>{imagePreviewModal.title}</Text>
              <TouchableOpacity onPress={() => setImagePreviewModal({ ...imagePreviewModal, visible: false })}>
                <Ionicons name="close" size={28} color="#fff" />
              </TouchableOpacity>
            </View>
            
            {imagePreviewModal.images.length > 0 && (
              <View style={styles.imageModalBody}>
                <Image
                  source={{ uri: imagePreviewModal.images[currentImageIndex] }}
                  style={styles.fullPreviewImage}
                  resizeMode="contain"
                />
                
                {imagePreviewModal.images.length > 1 && (
                  <View style={styles.imageNavigation}>
                    <TouchableOpacity
                      style={[styles.imageNavButton, currentImageIndex === 0 && styles.imageNavButtonDisabled]}
                      onPress={() => setCurrentImageIndex(Math.max(0, currentImageIndex - 1))}
                      disabled={currentImageIndex === 0}
                    >
                      <Ionicons name="chevron-back" size={36} color={currentImageIndex === 0 ? '#666' : '#fff'} />
                    </TouchableOpacity>
                    
                    <Text style={styles.imageCounter}>
                      {currentImageIndex + 1} / {imagePreviewModal.images.length}
                    </Text>
                    
                    <TouchableOpacity
                      style={[styles.imageNavButton, currentImageIndex === imagePreviewModal.images.length - 1 && styles.imageNavButtonDisabled]}
                      onPress={() => setCurrentImageIndex(Math.min(imagePreviewModal.images.length - 1, currentImageIndex + 1))}
                      disabled={currentImageIndex === imagePreviewModal.images.length - 1}
                    >
                      <Ionicons name="chevron-forward" size={36} color={currentImageIndex === imagePreviewModal.images.length - 1 ? '#666' : '#fff'} />
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            )}
          </View>
        </View>
      </Modal>

      {/* Loading Overlay for PDF Generation */}
      {isGeneratingPdf && (
        <View style={styles.pdfLoadingOverlay}>
          <View style={styles.pdfLoadingCard}>
            <ActivityIndicator size="large" color="#1976d2" />
            <Text style={styles.pdfLoadingText}>PDF wird erstellt...</Text>
          </View>
        </View>
      )}

      {/* Reference Photos Modal */}
      <Modal
        visible={referencePhotosModal.visible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setReferencePhotosModal({ ...referencePhotosModal, visible: false })}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.referencePhotosModalContent}>
            <View style={styles.referencePhotosHeader}>
              <Text style={styles.referencePhotosTitle}>{referencePhotosModal.title}</Text>
              <TouchableOpacity onPress={() => setReferencePhotosModal({ ...referencePhotosModal, visible: false })}>
                <Ionicons name="close" size={28} color="#333" />
              </TouchableOpacity>
            </View>
            
            {loadingReferencePhotos ? (
              <View style={styles.referencePhotosLoading}>
                <ActivityIndicator size="large" color="#1976d2" />
              </View>
            ) : referencePhotosModal.photos.length > 0 ? (
              <ScrollView style={styles.referencePhotosGrid}>
                <View style={styles.referencePhotosGridInner}>
                  {referencePhotosModal.photos.map((photo, index) => (
                    <TouchableOpacity
                      key={photo.id}
                      style={styles.referencePhotoItem}
                      onPress={() => {
                        // Erst Referenz-Modal schließen, dann Bild-Modal öffnen
                        setReferencePhotosModal({ ...referencePhotosModal, visible: false });
                        setCurrentImageIndex(index);
                        setImagePreviewModal({ 
                          visible: true, 
                          images: referencePhotosModal.photos.map(p => p.uri), 
                          title: referencePhotosModal.title 
                        });
                      }}
                    >
                      <Image source={{ uri: photo.uri }} style={styles.referencePhotoThumb} />
                      {photo.name && (
                        <Text style={styles.referencePhotoName} numberOfLines={1}>{photo.name}</Text>
                      )}
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
            ) : (
              <View style={styles.referencePhotosEmpty}>
                <Ionicons name="images-outline" size={48} color="#ccc" />
                <Text style={styles.referencePhotosEmptyText}>Keine Fotos in diesem Ordner</Text>
              </View>
            )}
          </View>
        </View>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  projectTypeSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#f8f9fa',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  projectTypeSelectorText: {
    fontSize: 14,
    color: '#333',
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
  tabsContainer: {
    backgroundColor: '#f8fafc',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  tabsScrollContent: {
    paddingHorizontal: 16,
    gap: 8,
  },
  tabPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#fff',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    gap: 6,
  },
  tabPillActive: {
    backgroundColor: '#1976d2',
    borderColor: '#1976d2',
  },
  tabPillText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748b',
  },
  tabPillTextActive: {
    color: '#fff',
  },
  tabBadge: {
    backgroundColor: '#e2e8f0',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 10,
    minWidth: 22,
    alignItems: 'center',
  },
  tabBadgeActive: {
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  tabBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748b',
  },
  tabBadgeTextActive: {
    color: '#fff',
  },
  tab: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: '#1976d2',
  },
  tabText: {
    fontSize: 11,
    color: '#666',
    fontWeight: '500',
  },
  tabTextActive: {
    color: '#1976d2',
    fontWeight: '600',
  },
  tabCount: {
    fontSize: 10,
    color: '#999',
    marginTop: 2,
  },
  tabCountActive: {
    color: '#1976d2',
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
  // Neue Photo Action Button Styles
  photoActionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  photoActionButtonExport: {
    backgroundColor: '#e8f5e9',
    borderWidth: 1,
    borderColor: '#81c784',
  },
  photoActionButtonImport: {
    backgroundColor: '#e3f2fd',
    borderWidth: 1,
    borderColor: '#90caf9',
  },
  photoActionButtonSave: {
    backgroundColor: '#4CAF50',
  },
  photoActionButtonCancel: {
    flex: 0,
    backgroundColor: '#f44336',
    paddingHorizontal: 20,
  },
  photoActionButtonTextContainer: {
    alignItems: 'flex-start',
  },
  photoActionButtonText: {
    fontSize: 15,
    fontWeight: '600',
  },
  photoActionButtonSubtext: {
    fontSize: 11,
    fontWeight: '400',
    opacity: 0.8,
  },
  photoActionButtonTextWhite: {
    color: '#fff',
    fontSize: 15,
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
  itemCardWithDelete: {
    backgroundColor: '#fff',
    borderRadius: 12,
    marginHorizontal: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    flexDirection: 'row',
    alignItems: 'center',
  },
  itemCardContent: {
    flex: 1,
    padding: 16,
  },
  roofDeleteButton: {
    padding: 16,
    justifyContent: 'center',
    alignItems: 'center',
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
  photoSelectOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  photoSelectOverlayActive: {
    backgroundColor: 'rgba(76, 175, 80, 0.3)',
    borderWidth: 3,
    borderColor: '#4CAF50',
  },
  sketchImage: {
    width: '100%',
    height: 350,
    marginTop: 8,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
  },
  sketchPreviewContainer: {
    width: '100%',
    height: 350,
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
    height: 200,
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
  emptyHint: {
    fontSize: 13,
    color: '#999',
    fontStyle: 'italic',
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  checkedBadge: {
    backgroundColor: '#e8f5e9',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    marginRight: 160,
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
  compactChecklistCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  checklistMainHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 10,
    borderBottomWidth: 2,
    borderBottomColor: '#1976d2',
    marginBottom: 10,
  },
  checklistMainTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1976d2',
    flex: 1,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  categorySection: {
    marginBottom: 16,
  },
  categorySectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
    paddingBottom: 6,
    borderBottomWidth: 2,
    borderBottomColor: '#4caf50',
  },
  categorySectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#333',
    flex: 1,
  },
  categorySectionCount: {
    fontSize: 12,
    color: '#4caf50',
    fontWeight: '600',
  },
  // Checklist Image Styles
  checklistTemplateLogo: {
    width: 60,
    height: 25,
    borderRadius: 4,
    marginRight: 8,
    backgroundColor: '#f5f5f5',
  },
  categoryLogoSmall: {
    width: 50,
    height: 20,
    borderRadius: 3,
    backgroundColor: '#f5f5f5',
  },
  printImageThumbnailBtn: {
    marginLeft: 8,
    borderRadius: 4,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#4caf50',
    backgroundColor: '#f5f5f5',
  },
  printImageThumbnail: {
    width: 50,
    height: 38,
  },
  printImageThumbnailBtnSmall: {
    marginLeft: 4,
    borderRadius: 3,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#4caf50',
    backgroundColor: '#f5f5f5',
  },
  printImageThumbnailSmall: {
    width: 40,
    height: 30,
  },
  previewGalleryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff3e0',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
    marginLeft: 8,
  },
  previewGalleryCount: {
    fontSize: 12,
    color: '#ff9800',
    fontWeight: '600',
  },
  previewGalleryBtnSmall: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff3e0',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
    gap: 2,
    marginLeft: 4,
  },
  previewGalleryCountSmall: {
    fontSize: 10,
    color: '#ff9800',
    fontWeight: '600',
  },
  categoryNoteContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    backgroundColor: '#fff8e1',
    padding: 8,
    borderRadius: 6,
    marginBottom: 10,
  },
  categoryNoteText: {
    fontSize: 12,
    color: '#f57c00',
    flex: 1,
    fontStyle: 'italic',
  },
  categoryMeasurementContainer: {
    backgroundColor: '#e3f2fd',
    borderRadius: 8,
    padding: 10,
    marginBottom: 10,
  },
  categoryMeasurementText: {
    fontSize: 13,
    color: '#1565c0',
    fontWeight: '500',
    marginBottom: 4,
  },
  categorySumRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#90caf9',
  },
  categorySumLabel: {
    fontSize: 12,
    color: '#1565c0',
    fontWeight: '600',
  },
  categorySumValue: {
    fontSize: 13,
    color: '#1565c0',
    fontWeight: '700',
    backgroundColor: '#bbdefb',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  level1Grid: {
    // Dynamische Werte werden inline gesetzt basierend auf checklistColumns
  },
  level1Container: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 10,
    flexGrow: 1,
    flexShrink: 0,
    borderLeftWidth: 4,
    borderLeftColor: '#1976d2',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  level1Header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  level1Prefix: {
    fontSize: 14,
    fontWeight: '800',
    color: '#fff',
    backgroundColor: '#1976d2',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: 'hidden',
    minWidth: 32,
    textAlign: 'center',
  },
  level1Title: {
    fontSize: 13,
    fontWeight: '600',
    color: '#333',
    flex: 1,
  },
  level1Content: {
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    paddingTop: 4,
    marginTop: 4,
  },
  deepSubItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 2,
  },
  deepSubPrefix: {
    fontSize: 11,
    color: '#666',
    fontWeight: '600',
    minWidth: 36,
  },
  deepSubText: {
    fontSize: 12,
    color: '#444',
    flex: 1,
  },
  noteContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 4,
    backgroundColor: '#fff8e1',
    padding: 6,
    borderRadius: 4,
    marginTop: 4,
    marginBottom: 4,
  },
  noteText: {
    fontSize: 11,
    color: '#f57c00',
    flex: 1,
    fontStyle: 'italic',
  },
  deepNoteContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 3,
    backgroundColor: '#fff8e1',
    padding: 4,
    borderRadius: 3,
    marginTop: 2,
    marginBottom: 2,
  },
  deepNoteText: {
    fontSize: 10,
    color: '#f57c00',
    flex: 1,
    fontStyle: 'italic',
  },
  measurementDisplayContainer: {
    backgroundColor: '#e3f2fd',
    borderRadius: 4,
    padding: 4,
    marginTop: 4,
  },
  measurementDisplayText: {
    fontSize: 10,
    color: '#1565c0',
    fontWeight: '500',
  },
  noSubItemsHint: {
    fontSize: 12,
    color: '#999',
    fontStyle: 'italic',
    paddingVertical: 4,
  },
  categoryContainer: {
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    padding: 8,
    minWidth: '48%',
    maxWidth: '100%',
    flexGrow: 1,
    flexShrink: 0,
    flexBasis: '48%',
    borderLeftWidth: 3,
    borderLeftColor: '#4caf50',
  },
  categoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 4,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  categoryTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#333',
    flex: 1,
  },
  categoryCount: {
    fontSize: 10,
    color: '#4caf50',
    fontWeight: '500',
  },
  categoryContent: {
    paddingLeft: 2,
  },
  compactSubItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 2,
  },
  compactSubItemText: {
    fontSize: 11,
    color: '#555',
    flex: 1,
    lineHeight: 14,
  },
  subItemPrefix: {
    fontSize: 9,
    color: '#999',
    fontWeight: '500',
    minWidth: 28,
  },
  nestedSubItems: {
    marginLeft: 10,
  },
  checklistTemplateButton: {
    position: 'absolute',
    top: 8,
    right: 44,
    backgroundColor: 'rgba(25, 118, 210, 0.9)',
    borderRadius: 16,
    padding: 6,
    zIndex: 10,
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
  editFormRowPhone: {
    flexDirection: 'column',
    gap: 8,
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
  objektAdresseHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  aufmassButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ff9800',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 4,
  },
  aufmassButtonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
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
  // Numpad Styles für Bemerkungen
  remarksNumpadContainer: {
    marginTop: 12,
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  remarksNumpadHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  remarksNumpadTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  remarksNumpadModeButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#e0e0e0',
  },
  remarksNumpadModeButtonActive: {
    backgroundColor: '#1976d2',
  },
  remarksNumpadModeButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
  },
  remarksNumpadModeButtonTextActive: {
    color: '#fff',
  },
  remarksNumpadGrid: {
    gap: 6,
  },
  remarksNumpadRow: {
    flexDirection: 'row',
    gap: 6,
    justifyContent: 'center',
  },
  remarksNumpadKey: {
    flex: 1,
    height: 44,
    backgroundColor: '#fff',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ddd',
  },
  remarksNumpadKeySmall: {
    flex: 1,
    height: 40,
    backgroundColor: '#fff',
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ddd',
  },
  remarksNumpadKeyText: {
    fontSize: 18,
    fontWeight: '500',
    color: '#333',
  },
  remarksNumpadKeyTextSmall: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
  },
  remarksNumpadOp: {
    backgroundColor: '#e3f2fd',
    borderColor: '#1976d2',
  },
  remarksNumpadOpText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1976d2',
  },
  remarksNumpadUnit: {
    backgroundColor: '#f3e5f5',
    borderColor: '#9c27b0',
  },
  remarksNumpadUnitText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#9c27b0',
  },
  remarksNumpadClear: {
    backgroundColor: '#ffebee',
    borderColor: '#f44336',
  },
  remarksNumpadClearText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#f44336',
  },
  remarksNumpadDel: {
    backgroundColor: '#f44336',
    borderColor: '#f44336',
  },
  remarksNumpadCapsActive: {
    backgroundColor: '#1976d2',
    borderColor: '#1976d2',
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
  // PDF Preview Styles
  pdfPreviewContainer: {
    flex: 1,
    backgroundColor: '#fff',
  },
  pdfPreviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingTop: Platform.OS === 'ios' ? 50 : (StatusBar.currentHeight || 24) + 8,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  pdfPreviewCloseButton: {
    padding: 8,
  },
  pdfPreviewTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  pdfPreviewContent: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  pdfWebView: {
    flex: 1,
    backgroundColor: '#fff',
  },
  pdfPreviewLoading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pdfPreviewLoadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#666',
  },
  pdfPreviewActions: {
    flexDirection: 'row',
    padding: 16,
    paddingBottom: 32,
    gap: 12,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  pdfPreviewActionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1976d2',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 10,
    gap: 8,
  },
  pdfPreviewSaveButton: {
    backgroundColor: '#4caf50',
  },
  pdfPreviewImageButton: {
    backgroundColor: '#9c27b0',
  },
  pdfPreviewActionText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  pdfLoadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  pdfLoadingCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 5,
  },
  pdfLoadingText: {
    fontSize: 16,
    color: '#333',
    fontWeight: '500',
  },
  // Checklist Image Preview Modal Styles
  imageModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  imageModalContent: {
    width: '98%',
    height: '88%',
    backgroundColor: '#000',
    borderRadius: 12,
    overflow: 'hidden',
  },
  imageModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#000',
  },
  imageModalTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    flex: 1,
  },
  imageModalBody: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#000',
    paddingHorizontal: 10,
  },
  fullPreviewImage: {
    width: '100%',
    height: '85%',
  },
  imageNavigation: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
    paddingBottom: 30,
    gap: 40,
    backgroundColor: '#000',
  },
  imageNavButton: {
    padding: 12,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 25,
  },
  imageNavButtonDisabled: {
    opacity: 0.3,
  },
  imageCounter: {
    fontSize: 20,
    color: '#fff',
    fontWeight: '600',
  },
  // Documents Section Styles
  documentsSection: {
    padding: 16,
  },
  documentsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 16,
  },
  documentCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    width: '47%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    position: 'relative',
  },
  documentIcon: {
    alignItems: 'center',
    marginBottom: 12,
    position: 'relative',
  },
  annotationBadge: {
    position: 'absolute',
    top: -4,
    right: 20,
    backgroundColor: '#4caf50',
    borderRadius: 10,
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  documentName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    textAlign: 'center',
    marginBottom: 4,
  },
  documentDate: {
    fontSize: 12,
    color: '#999',
    textAlign: 'center',
  },
  deleteDocButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    padding: 4,
  },
  calculatorResultText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1976d2',
    textAlign: 'center',
    marginBottom: 2,
  },
  // Anrede Picker Styles für Bauherr
  compactPickerButton: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  compactPickerText: {
    fontSize: 14,
    color: '#333',
  },
  compactPickerPlaceholder: {
    fontSize: 14,
    color: '#999',
  },
  salutationModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  salutationModalContent: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    width: '80%',
    maxWidth: 300,
  },
  salutationModalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 16,
    textAlign: 'center',
  },
  salutationOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  salutationOptionText: {
    fontSize: 16,
    color: '#333',
  },
  salutationOptionSelected: {
    color: '#1976d2',
    fontWeight: '600',
  },
  salutationPickerOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  salutationPickerBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  salutationPickerContent: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    width: '80%',
    maxWidth: 300,
    zIndex: 1001,
  },
  // Reference Folder Button Styles
  referenceFolderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e3f2fd',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginLeft: 4,
  },
  referenceFolderBtnSmall: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e3f2fd',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 4,
    marginLeft: 4,
  },
  // Reference Photos Modal Styles
  referencePhotosModalContent: {
    width: '95%',
    maxHeight: '80%',
    backgroundColor: '#fff',
    borderRadius: 12,
    overflow: 'hidden',
  },
  referencePhotosHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  referencePhotosTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    flex: 1,
  },
  referencePhotosLoading: {
    padding: 40,
    alignItems: 'center',
  },
  referencePhotosGrid: {
    maxHeight: 500,
  },
  referencePhotosGridInner: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 12,
    gap: 10,
  },
  referencePhotoItem: {
    width: 100,
    alignItems: 'center',
  },
  referencePhotoThumb: {
    width: 100,
    height: 100,
    borderRadius: 8,
    backgroundColor: '#f5f5f5',
  },
  referencePhotoName: {
    fontSize: 11,
    color: '#666',
    marginTop: 4,
    textAlign: 'center',
  },
  referencePhotosEmpty: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  referencePhotosEmptyText: {
    fontSize: 14,
    color: '#999',
    marginTop: 12,
  },
  // Checklist Move Buttons
  checklistMoveUpButton: {
    position: 'absolute',
    top: 8,
    right: 118,
    backgroundColor: '#9c27b0',
    borderRadius: 20,
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  checklistMoveDownButton: {
    position: 'absolute',
    top: 8,
    right: 82,
    backgroundColor: '#9c27b0',
    borderRadius: 20,
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  // Projektart-Überschrift Header (für Overview)
  projectTypeHeader: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    marginTop: 0,
  },
  projectTypeHeaderInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  projectTypeHeaderText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1976d2',
    textAlign: 'center',
  },
  // Projektart-Überschrift Edit (für Modal)
  editFormFullWidth: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  projectTypeEditRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-end',
    marginTop: 8,
  },
  projectTypeEditPicker: {
    flex: 2,
  },
  projectTypeEditDate: {
    flex: 1,
  },
  projectTypeClearButton: {
    padding: 8,
    marginBottom: 4,
  },
  projectTypePreview: {
    backgroundColor: '#e3f2fd',
    borderRadius: 8,
    padding: 12,
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  projectTypePreviewLabel: {
    fontSize: 12,
    color: '#666',
  },
  projectTypePreviewText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1976d2',
    flex: 1,
  },
  // Projektart in Projektinformationen
  projectTypePreviewInInfo: {
    backgroundColor: '#e3f2fd',
    borderRadius: 8,
    padding: 12,
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#1976d2',
  },
  projectTypePreviewInInfoText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1976d2',
    flex: 1,
  },
  quickSaveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e8f5e9',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 15,
    gap: 4,
  },
  quickSaveButtonText: {
    fontSize: 12,
    color: '#4caf50',
    fontWeight: '600',
  },
  // Projektart Edit Section (oben im Modal)
  projectTypeEditSection: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
});

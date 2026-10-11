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
import { ProjectService, CustomerService, RoofService, PhotoService, SketchService, ChecklistService, SettingsService, DocumentService, Document, ChecklistTemplateService, AreaCalculationService, AreaCalculation, LineCategoryService, LineCategory, ReportService, Report, EmployeeMasterService, MaterialMasterService, MachineMasterService, isProjectNumberDuplicate, isCustomerNumberDuplicate, isObjectNumberDuplicateInProject, getNextAvailableProjectNumber, getNextAvailableCustomerNumber, getNextAvailableObjectNumber, setLastUsedProjectType, getLastUsedProjectType, loadAllProjectDataFast, migratePhotoStorage, cleanupGhostPhotos, migrateChecklistImages } from '../../services/LocalStorage';
import { PROJECT_STATUSES, getStatusMeta, normalizeStatus } from '../../src/constants/projectStatus';
import { useUnsavedChangesGuard } from '../../src/hooks/useUnsavedChangesGuard';
import { CoverStyle } from '../../services/CoverPageTemplates';
import { generateProjectPdfHtml } from '../../services/ProjectPdfService';
import PdfPreviewModal from '../../src/components/project/PdfPreviewModal';
import { createPdfFile } from '../../services/PdfExport';
import { styles } from '../../src/styles/projectDetailStyles';
import { ReferenceService, ReferencePhoto } from '../../services/ReferenceService';
import { Features } from '../../services/FeatureFlags';
import { isPro, getProStatus } from '../../services/FeatureFlags';
import { useTranslation } from 'react-i18next';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { copyAsync, deleteAsync, cacheDirectory, writeAsStringAsync, readAsStringAsync } from 'expo-file-system/legacy';
import { exportProjectsToFile, askExportPhotoChoice } from '../../utils/projectTransfer';
import { SvgXml } from 'react-native-svg';
import Svg, { Path as SvgPath, Text as SvgText, Image as SvgImage } from 'react-native-svg';

// Workaround RN-SVG Fabric-Bug (SDK 57): erzwingt Canvas-Neuzeichnen pro Render
let fabricTick = 0;
import ViewShot from 'react-native-view-shot';
import * as MediaLibrary from 'expo-media-library/legacy';
import AsyncStorage from '@react-native-async-storage/async-storage';

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
  // Memo-/Notiz-Texte der Skizzen (für gruppierte Anzeige unter der Vorschau)
  const [sketchElementNotes, setSketchElementNotes] = useState<Record<string, { pointer: string[]; memo: string[] }>>({});
  const [sketchLabelCfg, setSketchLabelCfg] = useState<{ pointerName: string; memoName: string }>({ pointerName: 'Memo', memoName: 'Notiz' });
  useEffect(() => {
    const loadSketchElementNotes = async () => {
      try {
        const lblRaw = await AsyncStorage.getItem('sketch_label_settings');
        if (lblRaw) {
          const p = JSON.parse(lblRaw);
          setSketchLabelCfg({ pointerName: p.pointerName?.trim() || 'Memo', memoName: p.memoName?.trim() || 'Notiz' });
        }
        const result: Record<string, { pointer: string[]; memo: string[] }> = {};
        for (const sk of sketches) {
          const metaRaw = await AsyncStorage.getItem(`sketch_meta_${sk.id}`);
          if (!metaRaw) continue;
          const meta = JSON.parse(metaRaw);
          if (meta.elements && Array.isArray(meta.elements)) {
            const pointer = meta.elements.filter((el: any) => el.type === 'pointer' && el.data?.text).map((el: any) => el.data.text.trim()).filter((t: string) => t.length > 0);
            const memo = meta.elements.filter((el: any) => el.type === 'memo' && el.data?.text).map((el: any) => el.data.text.trim()).filter((t: string) => t.length > 0);
            if (pointer.length || memo.length) result[sk.id] = { pointer, memo };
          }
        }
        setSketchElementNotes(result);
      } catch (e) {
        console.log('Error loading sketch element notes:', e);
      }
    };
    if (sketches.length > 0) loadSketchElementNotes(); else setSketchElementNotes({});
  }, [sketches]);
  const [checklists, setChecklists] = useState<Checklist[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [areaCalculations, setAreaCalculations] = useState<AreaCalculation[]>([]);
  const [checklistColumns, setChecklistColumns] = useState<number>(2);
  const [loading, setLoading] = useState(true);
  
  // Determine initial tab from URL parameter
  const initialTab = (tab === 'sketches' || tab === 'roofs' || tab === 'photos' || tab === 'checklists' || tab === 'remarks' || tab === 'documents' | tab === 'calculator' || tab === 'imagemeter' || tab === 'reports') ? tab : 'overview';
  const [activeTab, setActiveTab] = useState<'overview' | 'roofs' | 'photos' | 'sketches' | 'checklists' | 'remarks' | 'documents' | 'calculator' | 'imagemeter' | 'reports'>(initialTab);
  
  // ImageMeter photos state
  const [imagemeterPhotos, setImagemeterPhotos] = useState<any[]>([]);
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [photoToDelete, setPhotoToDelete] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteSketchModalVisible, setDeleteSketchModalVisible] = useState(false);
  const [sketchToDelete, setSketchToDelete] = useState<string | null>(null);
  const [isDeletingSketch, setIsDeletingSketch] = useState(false);
  const [isDuplicatingSketch, setIsDuplicatingSketch] = useState(false);
  const [moveSketchModal, setMoveSketchModal] = useState<{ visible: boolean; itemIds: string[]; mode: 'move' | 'copy'; kind: 'sketch' | 'photo'; label: string }>({ visible: false, itemIds: [], mode: 'move', kind: 'sketch', label: '' });
  const [moveTargetProjects, setMoveTargetProjects] = useState<any[]>([]);
  const [isMovingSketch, setIsMovingSketch] = useState(false);
  // Mehrfach-Auswahl von Skizzen (gesammelt verschieben/kopieren)
  const [sketchSelectMode, setSketchSelectMode] = useState(false);
  const [selectedSketches, setSelectedSketches] = useState<string[]>([]);
  // Skizzen-Zwischenablage: gemerkte Skizze zum gezielten Einfügen in (andere) Projekte
  const [sketchClipboard, setSketchClipboard] = useState<{ sketchId: string; title: string } | null>(null);
  // Foto-Zwischenablage: gemerkte Fotos zum gezielten Einfügen in (andere) Projekte
  const [photoClipboard, setPhotoClipboard] = useState<{ photoIds: string[]; label: string } | null>(null);
  // Ziel-Ordner-Schritt beim Übertragen (nach Projektauswahl)
  const [folderStep, setFolderStep] = useState<{ project: any; folders: string[] } | null>(null);
  
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

  // Schutz vor Datenverlust: nicht gespeicherte Notizen beim Verlassen (Wisch-Geste etc.)
  const remarksChanged = !!project && remarks !== (project.remarks || '');
  const leaveGuard = useUnsavedChangesGuard(remarksChanged, async () => {
    if (project) {
      try {
        await ProjectService.update(project.id, {
          customer_id: project.customer_id,
          name: project.name,
          description: project.description || '',
          status: project.status,
          remarks: remarks,
        });
      } catch (e) {
        console.error('Error saving remarks on leave:', e);
      }
    }
    leaveGuard.allowLeave();
    router.back();
  });
  
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
  const [editBauherrCustomerType, setEditBauherrCustomerType] = useState('');
  const [editBauherrCustomerTypeName, setEditBauherrCustomerTypeName] = useState('');
  const [showEditCustomerTypePicker, setShowEditCustomerTypePicker] = useState(false);
  // Anrede-Picker Modal für Bauherr
  const [showBauherrSalutationPicker, setShowBauherrSalutationPicker] = useState(false);
  // Objektadresse edit fields (separate)
  const [editObjektNumber, setEditObjektNumber] = useState(''); // OBJ-26001
  const [editObjektAddressName, setEditObjektAddressName] = useState(''); // Bezeichnung, z.B. "Haupthaus"
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
  // Optionales PDF-Deckblatt (Logo, Projektdaten, Titelbild)
  const [includeCoverPage, setIncludeCoverPage] = useState(false);
  const [coverPhotoId, setCoverPhotoId] = useState<string | null>(null); // null = erstes Foto, 'none' = ohne Bild
  useEffect(() => {
    AsyncStorage.getItem('aufmassprofi_pdf_cover')
      .then(v => { if (v === '1') setIncludeCoverPage(true); })
      .catch(() => {});
  }, []);
  const toggleCoverPage = () => {
    setIncludeCoverPage(prev => {
      AsyncStorage.setItem('aufmassprofi_pdf_cover', prev ? '0' : '1').catch(() => {});
      return !prev;
    });
  };
  // Deckblatt: Untertitel (pro Projekt) + Vorlagen-Stil (global)
  const [coverSubtitle, setCoverSubtitle] = useState('');
  const [coverStyle, setCoverStyle] = useState<CoverStyle>('classic');
  useEffect(() => {
    AsyncStorage.getItem('aufmassprofi_pdf_cover_style')
      .then(v => { if (v === 'classic' || v === 'modern' || v === 'minimal') setCoverStyle(v); })
      .catch(() => {});
  }, []);
  useEffect(() => {
    if (!id) return;
    AsyncStorage.getItem(`aufmassprofi_pdf_cover_subtitle_${id}`)
      .then(v => { if (v) setCoverSubtitle(v); })
      .catch(() => {});
  }, [id]);
  const changeCoverStyle = (s: CoverStyle) => {
    setCoverStyle(s);
    AsyncStorage.setItem('aufmassprofi_pdf_cover_style', s).catch(() => {});
  };
  const changeCoverSubtitle = (txt: string) => {
    setCoverSubtitle(txt);
    if (id) AsyncStorage.setItem(`aufmassprofi_pdf_cover_subtitle_${id}`, txt).catch(() => {});
  };
  // Deckblatt: Akzentfarbe (global, null = Farbe aus Einstellungen)
  const [coverAccent, setCoverAccent] = useState<string | null>(null);
  useEffect(() => {
    AsyncStorage.getItem('aufmassprofi_pdf_cover_accent')
      .then(v => { if (v) setCoverAccent(v === 'auto' ? null : v); })
      .catch(() => {});
  }, []);
  const changeCoverAccent = (accentId: string | null) => {
    setCoverAccent(accentId);
    AsyncStorage.setItem('aufmassprofi_pdf_cover_accent', accentId || 'auto').catch(() => {});
  };
  // PDF: Inhaltsverzeichnis-Seite (global persistiert)
  const [includeToc, setIncludeToc] = useState(false);
  useEffect(() => {
    AsyncStorage.getItem('aufmassprofi_pdf_toc')
      .then(v => { if (v === '1') setIncludeToc(true); })
      .catch(() => {});
  }, []);
  const toggleToc = () => {
    setIncludeToc(prev => {
      AsyncStorage.setItem('aufmassprofi_pdf_toc', prev ? '0' : '1').catch(() => {});
      return !prev;
    });
  };
  // Ordner-Zuweisung (Skizzen & Fotos) per Long-Press
  const [sketchFolderModal, setSketchFolderModal] = useState<{ visible: boolean; kind: 'sketch' | 'photo'; itemId: string; value: string }>({ visible: false, kind: 'sketch', itemId: '', value: '' });
  const openSketchFolderModal = (sketch: any) => {
    setSketchFolderModal({ visible: true, kind: 'sketch', itemId: sketch.id, value: ((sketch.folder || '') as string).trim() });
  };
  const openPhotoFolderModal = (photo: any) => {
    setSketchFolderModal({ visible: true, kind: 'photo', itemId: photo.id, value: ((photo.folder || '') as string).trim() });
  };
  const saveSketchFolder = async (folder: string) => {
    try {
      if (sketchFolderModal.kind === 'photo') {
        await PhotoService.update(sketchFolderModal.itemId, { folder: folder.trim() } as any);
      } else {
        await SketchService.update(sketchFolderModal.itemId, { folder: folder.trim() } as any);
      }
      setSketchFolderModal({ visible: false, kind: 'sketch', itemId: '', value: '' });
      await loadProjectData();
    } catch (e) {
      console.error('Ordner speichern fehlgeschlagen:', e);
    }
  };
  // Ordner zentral umbenennen (zieht alle Skizzen UND Fotos mit diesem Ordner mit)
  const [renameFolderModal, setRenameFolderModal] = useState({ visible: false, oldName: '', value: '' });
  const openRenameFolderModal = (name: string) => {
    if (!name) return;
    setRenameFolderModal({ visible: true, oldName: name, value: name });
  };
  const saveRenameFolder = async () => {
    const oldName = renameFolderModal.oldName;
    const newName = renameFolderModal.value.trim();
    try {
      await Promise.all([
        ...sketches
          .filter((s: any) => (((s.folder || '') as string).trim()) === oldName)
          .map((s: any) => SketchService.update(s.id, { folder: newName } as any)),
        ...photos
          .filter((p: any) => (((p.folder || '') as string).trim()) === oldName)
          .map((p: any) => PhotoService.update(p.id, { folder: newName } as any)),
      ]);
      setRenameFolderModal({ visible: false, oldName: '', value: '' });
      await loadProjectData();
    } catch (e) {
      console.error('Ordner umbenennen fehlgeschlagen:', e);
    }
  };
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
    // Ungespeicherte Notizen beim Tab-Wechsel still sichern
    if (activeTab === 'remarks' && project && remarks !== (project.remarks || '')) {
      ProjectService.update(project.id, {
        customer_id: project.customer_id,
        name: project.name,
        description: project.description || '',
        status: project.status,
        remarks: remarks,
      })
        .then(() => setProject(prev => (prev ? { ...prev, remarks } : prev)))
        .catch(e => console.error('Error auto-saving remarks on tab change:', e));
    }
    if (newTab === 'sketches' || newTab === 'photos') {
      setIsTabLoading(true);
      setActiveTab(newTab);
      // Kurze Verzögerung, damit der Spinner erst angezeigt wird, bevor die schweren SVGs rendern
      setTimeout(() => setIsTabLoading(false), 150);
    } else {
      setActiveTab(newTab);
    }
  }, [activeTab, project, remarks]);
  const handleTabChangeRef = useRef(handleTabChange);
  handleTabChangeRef.current = handleTabChange;

  // Einheitlicher Header: Weißer Hintergrund, schwarze Schrift (wie iPad)
  useEffect(() => {
    if (activeTab !== 'overview') {
      navigation.setOptions({
        title: tabTitles[activeTab] || 'Projektdetails',
        headerStyle: { backgroundColor: '#ffffff' },
        headerTintColor: '#000',
        headerTitleStyle: { color: '#000', fontWeight: 'bold' },
        headerShadowVisible: true,
        headerTransparent: false,
        headerBackVisible: false,
        headerLeft: () => (
          <TouchableOpacity 
            onPress={() => handleTabChangeRef.current('overview')} 
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
        headerStyle: { backgroundColor: '#ffffff' },
        headerTintColor: '#000',
        headerTitleStyle: { color: '#000', fontWeight: 'bold' },
        headerShadowVisible: true,
        headerTransparent: false,
        headerBackVisible: false,
        headerLeft: () => (
          <TouchableOpacity 
            onPress={() => router.back()} 
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
            <Text style={{ color: '#000', fontSize: 17 }}>Zurück</Text>
          </TouchableOpacity>
        ),
      });
    }
  }, [activeTab, navigation]);

  // Auto-regenerate PDF when toggle changes while modal is open (debounced wegen Untertitel-Eingabe)
  useEffect(() => {
    if (!showPdfPreviewModal) return;
    const timer = setTimeout(async () => {
      try {
        const html = await generatePdfHtml();
        setPdfHtmlContent(html);
      } catch (e) {
        console.error('Error regenerating PDF preview:', e);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [showCalcDetailsPage, includeCoverPage, coverPhotoId, coverStyle, coverSubtitle, coverAccent, includeToc]);

  // Use useFocusEffect to reload data when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      loadProjectData();
      loadSketchClipboard();
      loadPhotoClipboard();
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
      // Geister-Fotos (Einträge ohne Bilddaten nach fehlgeschlagenem Import) entfernen
      await cleanupGhostPhotos();
      // Migration: Checklisten-Bilder in separate Schlüssel verschieben (einmalig, OOM-Schutz)
      await migrateChecklistImages();
      
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

      // Reports separat laden (Pro Feature)
      try {
        const projReports = await ReportService.getByProjectId(Array.isArray(id) ? id[0] : (id as string));
        setReports(projReports);
      } catch (e) {
        console.warn('[loadProjectData] Reports load error:', e);
      }
      
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

      // Basis-Verzeichnis für temporäre Dateien
      const baseDir = FileSystem.cacheDirectory || FileSystem.documentDirectory || cacheDirectory;
      console.log('Save to gallery - baseDir:', baseDir);

      let savedCount = 0;
      const errors: string[] = [];
      
      for (const photoId of selectedPhotos) {
        const photo = photos.find(p => p.id === photoId);
        if (!photo) continue;
        
        // Bilddaten laden (ggf. aus separatem Storage)
        let imageData = photo.image_data || photo.uri;
        if (!imageData || imageData.length < 100) {
          try {
            const stored = await AsyncStorage.getItem(`photo_img_${photoId}`);
            if (stored) imageData = stored;
          } catch (e) {
            console.error('Error loading photo data:', e);
          }
        }
        
        if (!imageData || imageData.length < 100) {
          errors.push(`Keine Bilddaten für Foto ${photoId}`);
          continue;
        }
        
        try {
          // Base64-Daten extrahieren (Prefix entfernen)
          let base64Data = imageData;
          if (base64Data.includes(',')) {
            base64Data = base64Data.split(',')[1];
          }
          
          const filename = `aufmass_photo_${Date.now()}_${savedCount}.jpg`;
          const fileUri = `${baseDir}${filename}`;
          
          // Datei schreiben (Legacy-API für Kompatibilität)
          await writeAsStringAsync(fileUri, base64Data, {
            encoding: 'base64',
          });
          
          // In Galerie speichern
          await MediaLibrary.createAssetAsync(fileUri);
          
          // Temp-Datei aufräumen
          try {
            await FileSystem.deleteAsync(fileUri, { idempotent: true });
          } catch (e) { /* ignore */ }
          
          savedCount++;
        } catch (err: any) {
          console.error('Error saving photo:', err?.message || err);
          errors.push(err?.message || String(err));
        }
      }

      // Reset
      setPhotoSelectMode(false);
      setSelectedPhotos([]);

      if (savedCount > 0) {
        Alert.alert(t('common.success'), t('photos.savedToGallery', { count: savedCount }));
      } else {
        Alert.alert(t('common.error'), `Fotos konnten nicht gespeichert werden.\n${errors[0] || ''}`);
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

  // ===== Skizzen-Zwischenablage (gezieltes Einfügen in andere Projekte) =====
  const SKETCH_CLIPBOARD_KEY = 'aufmassprofi_sketch_clipboard';

  // Zwischenablage laden + prüfen, ob die gemerkte Skizze noch existiert
  const loadSketchClipboard = async () => {
    try {
      const raw = await AsyncStorage.getItem(SKETCH_CLIPBOARD_KEY);
      if (!raw) { setSketchClipboard(null); return; }
      const clip = JSON.parse(raw);
      if (!clip?.sketchId) { setSketchClipboard(null); return; }
      const all = await SketchService.getAll();
      if (!all.find((s: any) => s.id === clip.sketchId)) {
        // Quelle wurde gelöscht → Zwischenablage aufräumen
        await AsyncStorage.removeItem(SKETCH_CLIPBOARD_KEY);
        setSketchClipboard(null);
        return;
      }
      setSketchClipboard({ sketchId: clip.sketchId, title: clip.title || 'Skizze' });
    } catch {
      setSketchClipboard(null);
    }
  };

  const clearSketchClipboard = async () => {
    setSketchClipboard(null);
    await AsyncStorage.removeItem(SKETCH_CLIPBOARD_KEY).catch(() => {});
  };

  // ===== Foto-Zwischenablage (gezieltes Einfügen in andere Projekte) =====
  const PHOTO_CLIPBOARD_KEY = 'aufmassprofi_photo_clipboard';

  const loadPhotoClipboard = async () => {
    try {
      const raw = await AsyncStorage.getItem(PHOTO_CLIPBOARD_KEY);
      if (!raw) { setPhotoClipboard(null); return; }
      const clip = JSON.parse(raw);
      if (!Array.isArray(clip?.photoIds) || clip.photoIds.length === 0) { setPhotoClipboard(null); return; }
      // Nur noch existierende Fotos behalten
      const all = await PhotoService.getAll();
      const validIds = new Set(all.map((p: any) => p.id));
      const ids = clip.photoIds.filter((pid: string) => validIds.has(pid));
      if (ids.length === 0) {
        await AsyncStorage.removeItem(PHOTO_CLIPBOARD_KEY);
        setPhotoClipboard(null);
        return;
      }
      setPhotoClipboard({ photoIds: ids, label: `${ids.length} ${ids.length === 1 ? 'Foto' : 'Fotos'}` });
    } catch {
      setPhotoClipboard(null);
    }
  };

  const clearPhotoClipboard = async () => {
    setPhotoClipboard(null);
    await AsyncStorage.removeItem(PHOTO_CLIPBOARD_KEY).catch(() => {});
  };

  // Ausgewählte Fotos merken – danach in jedem Projekt über „Fotos einfügen" platzierbar
  const handleRememberPhotos = async () => {
    if (selectedPhotos.length === 0) return;
    const ids = [...selectedPhotos];
    await AsyncStorage.setItem(PHOTO_CLIPBOARD_KEY, JSON.stringify({ photoIds: ids })).catch(() => {});
    setPhotoClipboard({ photoIds: ids, label: `${ids.length} ${ids.length === 1 ? 'Foto' : 'Fotos'}` });
    setPhotoDeleteMode(false);
    setSelectedPhotos([]);
    const msg = `${ids.length} ${ids.length === 1 ? 'Foto' : 'Fotos'} gemerkt. Öffne ein Projekt und tippe im Foto-Tab auf „Fotos einfügen".`;
    if (Platform.OS === 'web') alert(msg);
    else Alert.alert('Fotos gemerkt', msg);
  };

  // Gemerkte Fotos als Kopien in DIESES Projekt einfügen (Zwischenablage wird geleert)
  const handlePastePhotos = async () => {
    if (!photoClipboard || isMovingSketch) return;
    setIsMovingSketch(true);
    try {
      const projectId = (Array.isArray(id) ? id[0] : id) as string;
      let done = 0;
      for (const pid of photoClipboard.photoIds) {
        try {
          const copy = await PhotoService.duplicate(pid, projectId);
          if (copy) done++;
        } catch (e) { console.error('[PhotoPaste] fehlgeschlagen:', pid, e); }
      }
      await clearPhotoClipboard();
      await loadProjectData();
      const msg = `${done} ${done === 1 ? 'Foto' : 'Fotos'} eingefügt.`;
      if (Platform.OS === 'web') alert(msg);
      else Alert.alert('Fotos eingefügt', msg);
    } catch (error) {
      console.error('Error pasting photos:', error);
      Alert.alert('Fehler', 'Fotos konnten nicht eingefügt werden.');
    } finally {
      setIsMovingSketch(false);
    }
  };

  // Gemerkte Skizze in DIESES Projekt einfügen (Zwischenablage wird danach geleert)
  const handlePasteSketch = async () => {
    if (!sketchClipboard || isDuplicatingSketch) return;
    setIsDuplicatingSketch(true);
    try {
      const projectId = (Array.isArray(id) ? id[0] : id) as string;
      const copy = await SketchService.duplicate(sketchClipboard.sketchId, projectId);
      if (!copy) {
        await clearSketchClipboard();
        if (Platform.OS === 'web') alert('Die kopierte Skizze existiert nicht mehr.');
        else Alert.alert('Einfügen nicht möglich', 'Die kopierte Skizze existiert nicht mehr.');
        return;
      }
      await clearSketchClipboard();
      await loadProjectData();
      if (Platform.OS === 'web') {
        alert(`„${copy.title || 'Skizze'}" wurde eingefügt.`);
      } else {
        Alert.alert('Skizze eingefügt', `„${copy.title || 'Skizze'}" wurde in dieses Projekt eingefügt.`, [
          { text: 'OK', style: 'cancel' },
          {
            text: 'Jetzt bearbeiten',
            onPress: () => router.push(`/sketches/draw?projectId=${projectId}&sketchId=${copy.id}`),
          },
        ]);
      }
    } catch (error) {
      console.error('Error pasting sketch:', error);
      Alert.alert('Fehler', 'Skizze konnte nicht eingefügt werden.');
    } finally {
      setIsDuplicatingSketch(false);
    }
  };

  // Skizze duplizieren (inkl. aller ausgelagerten Daten) und optional
  // direkt die Kopie zum Weiterbearbeiten öffnen
  const handleDuplicateSketch = async (sketchId: string) => {
    if (isDuplicatingSketch) return;
    setIsDuplicatingSketch(true);
    try {
      const copy = await SketchService.duplicate(sketchId);
      // Skizze zusätzlich merken: kann danach gezielt in einem anderen
      // Projekt über „Skizze einfügen" eingefügt werden
      const original = sketches.find((s: any) => s.id === sketchId);
      const clipTitle = original?.title || (original as any)?.name || 'Skizze';
      await AsyncStorage.setItem(SKETCH_CLIPBOARD_KEY, JSON.stringify({ sketchId, title: clipTitle })).catch(() => {});
      setSketchClipboard({ sketchId, title: clipTitle });
      await loadProjectData();
      if (copy) {
        if (Platform.OS === 'web') {
          alert('Skizze wurde dupliziert und gemerkt – über „Skizze einfügen" kannst du sie auch in anderen Projekten einfügen.');
        } else {
          Alert.alert(
            'Skizze dupliziert',
            'Die Kopie wurde angelegt. Die Skizze ist außerdem gemerkt – öffne ein anderes Projekt und tippe dort auf „Skizze einfügen".',
            [
              { text: 'Später', style: 'cancel' },
              {
                text: 'Jetzt bearbeiten',
                onPress: () => router.push(`/sketches/draw?projectId=${id}&sketchId=${copy.id}`),
              },
            ]
          );
        }
      }
    } catch (error) {
      console.error('Error duplicating sketch:', error);
      Alert.alert('Fehler', 'Skizze konnte nicht dupliziert werden.');
    } finally {
      setIsDuplicatingSketch(false);
    }
  };

  // Skizze(n)/Foto(s) verschieben/kopieren: Zielauswahl-Modal öffnen
  const openTransferModal = async (itemIds: string[], mode: 'move' | 'copy', label: string, kind: 'sketch' | 'photo' = 'sketch') => {
    if (itemIds.length === 0) return;
    try {
      const all = await ProjectService.getAll();
      const targets = all
        .filter((p: any) => p.id !== id)
        .sort((a: any, b: any) => (a.name || '').localeCompare(b.name || ''));
      if (targets.length === 0) {
        if (Platform.OS === 'web') alert('Kein anderes Projekt vorhanden.');
        else Alert.alert('Nicht möglich', 'Es gibt kein anderes Projekt, in das übertragen werden könnte.');
        return;
      }
      setMoveTargetProjects(targets);
      setMoveSketchModal({ visible: true, itemIds, mode, kind, label });
    } catch (error) {
      console.error('Error loading projects for transfer:', error);
    }
  };

  const toggleSketchSelection = (sketchId: string) => {
    setSelectedSketches(prev =>
      prev.includes(sketchId) ? prev.filter(sid => sid !== sketchId) : [...prev, sketchId]
    );
  };

  const exitSketchSelectMode = () => {
    setSketchSelectMode(false);
    setSelectedSketches([]);
  };

  // Mehrere ausgewählte Skizzen auf einmal löschen (inkl. aller Daten-Keys)
  const handleMultiDeleteSketches = () => {
    if (selectedSketches.length === 0 || isMovingSketch) return;
    const n = selectedSketches.length;
    const doDelete = async () => {
      setIsMovingSketch(true);
      try {
        for (const sid of selectedSketches) {
          try { await SketchService.delete(sid); } catch (e) { console.error('[MultiDelete] Skizze fehlgeschlagen:', sid, e); }
        }
        exitSketchSelectMode();
        await loadProjectData();
      } finally {
        setIsMovingSketch(false);
      }
    };
    if (Platform.OS === 'web') {
      // eslint-disable-next-line no-alert
      if (window.confirm(`${n} ${n === 1 ? 'Skizze' : 'Skizzen'} unwiderruflich löschen?`)) doDelete();
    } else {
      Alert.alert(
        `${n} ${n === 1 ? 'Skizze' : 'Skizzen'} löschen`,
        'Die ausgewählten Skizzen werden unwiderruflich gelöscht.',
        [
          { text: 'Abbrechen', style: 'cancel' },
          { text: 'Löschen', style: 'destructive', onPress: doDelete },
        ]
      );
    }
  };

  // Nach Projektauswahl: vorhandene Ordner des Zielprojekts laden (Ordner-Schritt)
  const prepareFolderStep = async (target: any) => {
    try {
      const all = moveSketchModal.kind === 'photo' ? await PhotoService.getAll() : await SketchService.getAll();
      const folders = [...new Set(
        all.filter((x: any) => x.project_id === target.id && x.folder).map((x: any) => x.folder as string)
      )].sort((a, b) => a.localeCompare(b));
      setFolderStep({ project: target, folders });
    } catch {
      setFolderStep({ project: target, folders: [] });
    }
  };

  const transferItemsToProject = async (targetProject: any, folderChoice?: { type: 'keep' | 'none' | 'set'; name?: string }) => {
    if (isMovingSketch) return;
    setIsMovingSketch(true);
    try {
      const { itemIds, mode, kind } = moveSketchModal;
      // Ordner-Override: 'keep' = unverändert lassen
      const folderPatch = !folderChoice || folderChoice.type === 'keep'
        ? {}
        : { folder: folderChoice.type === 'set' ? folderChoice.name : undefined };
      let done = 0;
      for (const itemId of itemIds) {
        try {
          if (kind === 'photo') {
            if (mode === 'move') {
              await PhotoService.update(itemId, { project_id: targetProject.id, ...folderPatch } as any);
            } else {
              const copy = await PhotoService.duplicate(itemId, targetProject.id);
              if (copy && folderChoice && folderChoice.type !== 'keep') {
                await PhotoService.update(copy.id, folderPatch as any);
              }
            }
          } else {
            if (mode === 'move') {
              await SketchService.update(itemId, { project_id: targetProject.id, ...folderPatch } as any);
            } else {
              const copy = await SketchService.duplicate(itemId, targetProject.id);
              if (copy && folderChoice && folderChoice.type !== 'keep') {
                await SketchService.update(copy.id, folderPatch as any);
              }
            }
          }
          done++;
        } catch (e) {
          console.error('[Transfer] Element fehlgeschlagen:', itemId, e);
        }
      }
      setFolderStep(null);
      setMoveSketchModal({ visible: false, itemIds: [], mode: 'move', kind: 'sketch', label: '' });
      if (kind === 'photo') {
        setPhotoDeleteMode(false);
        setSelectedPhotos([]);
      } else {
        exitSketchSelectMode();
      }
      await loadProjectData();
      const verb = mode === 'move' ? 'verschoben' : 'kopiert';
      const noun = kind === 'photo' ? (done === 1 ? '1 Foto' : `${done} Fotos`) : (done === 1 ? '1 Skizze' : `${done} Skizzen`);
      if (Platform.OS === 'web') {
        alert(`${noun} nach „${targetProject.name}" ${verb}.`);
      } else {
        Alert.alert(`${kind === 'photo' ? 'Fotos' : 'Skizzen'} ${verb}`, `${noun} ${done === 1 ? 'ist' : 'sind'} jetzt im Projekt „${targetProject.name}".`, [
          { text: 'OK', style: 'cancel' },
          { text: 'Projekt öffnen', onPress: () => router.push(`/projects/${targetProject.id}`) },
        ]);
      }
    } catch (error) {
      console.error('Error transferring items:', error);
      Alert.alert('Fehler', 'Übertragen fehlgeschlagen.');
    } finally {
      setIsMovingSketch(false);
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
      setEditProjectStatus(normalizeStatus(project.status));
      
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
      setEditBauherrCustomerType(customer?.customerType || '');
      setEditBauherrCustomerTypeName((customer as any)?.customerTypeName || '');
      
      // Objektadresse - leave empty if not set (will use bauherr as default)
      setEditObjektNumber(project.objekt_number || '');
      setEditObjektAddressName(project.objekt_address_name || '');
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
        objekt_address_name: editObjektAddressName || project?.objekt_address_name || undefined, // Bezeichnung, z.B. "Haupthaus"
        // Projektart-Überschrift
        project_type: editProjectType || undefined,
        project_type_date: editProjectTypeDate || undefined,
      });

      // Speichere die zuletzt verwendete Projektart
      if (editProjectType) {
        await setLastUsedProjectType(editProjectType);
      }

      // Synchronisiere Bauherr-Daten mit Kundenstamm - jetzt mit Rückfrage
      if (project?.customer_id) {
        try {
          const existingCustomer = await CustomerService.getById(project.customer_id);
          if (existingCustomer) {
            const fullName = `${editBauherrSalutation} ${editBauherrFirstName} ${editBauherrLastName}`.trim();
            // Prüfen ob sich etwas geändert hat vs. Kundenstamm
            const hasCustomerChanges =
              (editBauherrSalutation || '') !== (existingCustomer.salutation || '') ||
              (editBauherrFirstName || '') !== (existingCustomer.firstName || '') ||
              (editBauherrLastName || '') !== (existingCustomer.lastName || '') ||
              (editBauherrPhone || '') !== (existingCustomer.phone || '') ||
              (editBauherrMobile || '') !== (existingCustomer.mobile || '') ||
              (editBauherrEmail || '') !== (existingCustomer.email || '') ||
              (editBauherrStreet || '') !== (existingCustomer.street || '') ||
              (editBauherrPlz || '') !== (existingCustomer.zip || '') ||
              (editBauherrCity || '') !== (existingCustomer.city || '') ||
              (editBauherrCustomerType || '') !== (existingCustomer.customerType || '') ||
              (editBauherrCustomerTypeName || '') !== ((existingCustomer as any).customerTypeName || '') ||
              (customerNumber || '') !== (existingCustomer.customer_number || '');

            if (hasCustomerChanges) {
              // Prüfen: Ist der Kundenstamm quasi leer (Bauherr wird "neu" angelegt)?
              const customerIsEmpty = !existingCustomer.firstName && !existingCustomer.lastName &&
                !existingCustomer.phone && !existingCustomer.mobile && !existingCustomer.email &&
                !existingCustomer.street && !existingCustomer.zip && !existingCustomer.city;

              const dialogTitle = customerIsEmpty ? 'Neuen Kunden anlegen?' : 'Kundendaten synchronisieren?';
              const dialogMessage = customerIsEmpty
                ? 'Die Kundendaten im Kundenstamm sind noch leer. Sollen die im Projekt eingegebenen Daten als neuer Kunde übernommen werden?'
                : `Die Bauherr-/Kundendaten wurden im Projekt geändert. Sollen die Änderungen auch im Kundenstamm "${existingCustomer.name || 'Kunde'}" übernommen werden?`;

              const newAddress = editBauherrStreet || editBauherrPlz || editBauherrCity
                ? `${editBauherrStreet || ''}, ${editBauherrPlz || ''} ${editBauherrCity || ''}`.trim()
                : existingCustomer.address;

              const doCustomerSync = async () => {
                await CustomerService.update(project.customer_id!, {
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
                  customerType: editBauherrCustomerType || existingCustomer.customerType,
                  customerTypeName: editBauherrCustomerTypeName || (existingCustomer as any).customerTypeName,
                } as any);
                await loadProjectData();
              };

              Alert.alert(
                dialogTitle,
                dialogMessage,
                [
                  { text: 'Nein', style: 'cancel' },
                  { text: 'Ja, übernehmen', onPress: () => { doCustomerSync().catch(e => console.error('Customer sync error:', e)); } },
                ]
              );
            }
          }
        } catch (syncError) {
          console.error('Error checking customer sync:', syncError);
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

          // Helper: Legt eine neue Projektadresse beim Kunden an und verknüpft das Projekt damit
          const createNewObjectAddress = async () => {
            if (!existingCustomer) return;
            const newObjectNumber = editObjektNumber || await getNextAvailableObjectNumber(project.customer_id);
            const newAddressName = editObjektAddressName || editProjectName || editObjektName || `Adresse ${(existingCustomer.projectAddresses?.length || 0) + 1}`;
            const newAddr: any = {
              id: `addr_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
              object_number: newObjectNumber,
              name: newAddressName,
              objectName: editObjektName || undefined,
              description: editObjektDescription || undefined,
              street: editObjektStreet || '',
              zip: editObjektPlz || '',
              city: editObjektCity || '',
              contactPerson: editObjektContactPerson || undefined,
              phone: editObjektPhone || undefined,
              email: editObjektEmail || undefined,
            };
            const updatedAddresses = [...(existingCustomer.projectAddresses || []), newAddr];
            await CustomerService.update(project.customer_id!, {
              ...existingCustomer,
              projectAddresses: updatedAddresses,
            });
            // Projekt mit Adress-Namen verknüpfen, damit späteres Sync greift
            const projectId = Array.isArray(id) ? id[0] : id;
            const currentProject = await ProjectService.getById(projectId);
            if (currentProject) {
              await ProjectService.update(projectId, {
                ...currentProject,
                objekt_address_name: newAddressName,
                objekt_number: newObjectNumber,
              });
            }
            await loadProjectData();
            Alert.alert(t('common.success'), `Neue Objektadresse "${newAddressName}" wurde beim Kunden angelegt.`);
          };

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
            
            // Wenn immer noch kein Match, zeige alle Adressen zur Auswahl + Neue anlegen
            if (!matchingAddress && existingCustomer.projectAddresses.length > 0) {
              console.log('No match found, showing selection dialog');
              // Zeige Dialog mit allen Adressen + Option "Neu anlegen"
              Alert.alert(
                'Objektadresse zuordnen',
                'Die eingegebene Objektadresse ist keiner gespeicherten Adresse zugeordnet. Möchtest du eine bestehende Adresse aktualisieren oder eine neue Adresse anlegen?',
                [
                  { text: 'Abbrechen', style: 'cancel' },
                  {
                    text: '➕ Neue Adresse anlegen',
                    onPress: () => { createNewObjectAddress().catch(e => console.error('Create address error:', e)); }
                  },
                  ...existingCustomer.projectAddresses.map(addr => ({
                    text: `Update: ${addr.name || t('projects.unnamed')}`,
                    onPress: async () => {
                      const updatedAddresses = existingCustomer.projectAddresses!.map(a => 
                        a.id === addr.id
                          ? { 
                              ...a, 
                              objectName: editObjektName || undefined,
                              description: editObjektDescription || undefined, // Beschreibung der Objektadresse synchronisieren
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
                matchingAddress.name !== editObjektAddressName || // Bezeichnung geändert
                (matchingAddress.objectName || '') !== (editObjektName || '') ||
                (matchingAddress.description || '') !== (editObjektDescription || '') || // Beschreibung prüfen
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
                        // Aktualisiere beim Kunden mit ALLEN Objektadress-Feldern
                        const updatedAddresses = existingCustomer.projectAddresses!.map(addr => 
                          addr.id === matchingAddress!.id
                            ? { 
                                ...addr, 
                                object_number: editObjektNumber || addr.object_number, // Objektnummer synchronisieren
                                name: editObjektAddressName || addr.name, // Bezeichnung
                                objectName: editObjektName || undefined,
                                description: editObjektDescription || undefined, // Beschreibung
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
                        // Aktualisiere auch objekt_address_name falls Bezeichnung geändert wurde
                        if (editObjektAddressName && editObjektAddressName !== project?.objekt_address_name) {
                          const projectId = Array.isArray(id) ? id[0] : id;
                          const currentProject = await ProjectService.getById(projectId);
                          if (currentProject) {
                            await ProjectService.update(projectId, {
                              ...currentProject,
                              objekt_address_name: editObjektAddressName,
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
          } else if (existingCustomer) {
            // Kunde hat noch keine gespeicherten Objektadressen -> Neu anlegen anbieten
            console.log('Kunde hat keine gespeicherten Objektadressen. Frage nach Neuanlage.');
            Alert.alert(
              'Neue Objektadresse anlegen?',
              `Der Kunde "${existingCustomer.name || 'Kunde'}" hat noch keine gespeicherte Objektadresse. Soll die eingegebene Adresse als neue Objektadresse beim Kunden angelegt werden?`,
              [
                { text: 'Nein', style: 'cancel' },
                {
                  text: 'Ja, anlegen',
                  onPress: () => { createNewObjectAddress().catch(e => console.error('Create address error:', e)); }
                },
              ]
            );
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
    return generateProjectPdfHtml({
      project, customer, roofs, photos, sketches, checklists,
      areaCalculations, imagemeterPhotos, remarks, t,
      includeCoverPage, coverPhotoId, coverStyle, coverSubtitle, coverAccent, includeToc,
      showCalcDetailsPage,
    });
  };

  // Wrapper: appends Rapport-Sections to the existing project PDF HTML
  const appendReportsToHtml = async (html: string, reportsList: Report[]): Promise<string> => {
    if (!reportsList || reportsList.length === 0) return html;
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { generateReportSectionHtml, REPORT_CSS, getReportAccentCss } = require('../../services/ReportPdfService');
      // Firmendaten + Master-Daten für Preisberechnung
      const s: any = await SettingsService.get();
      const [employeesMaster, materialsMaster, machinesMaster] = await Promise.all([
        (async () => { try { return await EmployeeMasterService.getAll(); } catch { return []; } })(),
        (async () => { try { return await MaterialMasterService.getAll(); } catch { return []; } })(),
        (async () => { try { return await MachineMasterService.getAll(); } catch { return []; } })(),
      ]);
      const companyOpts = {
        logoData: s.logo_data || s.company_logo || '',
        companyName: s.company_name || '',
        companySubtitle: s.company_subtitle || '',
        companyOwner: s.owner_name || '',
        companyStreet: s.street || s.company_street || s.company_address || '',
        companyZip: s.zip_code || s.company_zip || '',
        companyCity: s.city || s.company_city || '',
        companyPhone: s.phone || s.company_phone || '',
        companyMobile: s.mobile_phone || s.company_mobile_phone || '',
        companyFax: s.fax || s.company_fax || '',
        companyEmail: s.email || s.company_email || '',
        reportTitle: s.report_title || 'Rapport',
        employeesMaster,
        materialsMaster,
        machinesMaster,
        standalone: true,
      };
      // Jeden Rapport in einen eigenen .page-Container packen, damit er die volle Seitenbreite
      // (210mm) bekommt - sonst sind Rapporte im iPhone-PDF-Preview zu schmal.
      const rapportePages = reportsList.map((r: Report, idx: number) => `
        <div class="page" style="page-break-before: always;">
          ${idx === 0 ? `<h1 style="color:#0d9488;border-bottom:2px solid #0d9488;padding-bottom:6px;margin-top:0;">📝 Rapporte (${reportsList.length})</h1>` : ''}
          ${generateReportSectionHtml(r, project, customer, companyOpts)}
        </div>
      `).join('');
      // inject extra css + reports before </body>
      let result = html;
      if (result.includes('</head>')) {
        result = result.replace('</head>', `<style>${REPORT_CSS}\n${getReportAccentCss(s)}</style></head>`);
      }
      if (result.includes('</body>')) {
        result = result.replace('</body>', `${rapportePages}</body>`);
      } else {
        result = result + rapportePages;
      }
      return result;
    } catch (e) {
      console.error('appendReportsToHtml error:', e);
      return html;
    }
  };

  // Erzeugt Projekt-PDF-HTML, optional inklusive aller Rapporte
  const generateProjectPdfHtmlWithOptions = async (opts: { includeReports?: boolean } = {}): Promise<string> => {
    const html = await generatePdfHtml();
    if (opts.includeReports && reports.length > 0) {
      return await appendReportsToHtml(html, reports);
    }
    return html;
  };

  // Show PDF options dialog
  const exportToPDF = async () => {
    // Wenn Rapporte vorhanden sind: erst fragen ob inkludieren
    if (Features.showReportTab && reports.length > 0) {
      Alert.alert(
        '📝 Rapporte einschließen?',
        `Es ${reports.length === 1 ? 'ist 1 Rapport' : `sind ${reports.length} Rapporte`} in diesem Projekt vorhanden. Sollen sie im PDF mit ausgegeben werden?`,
        [
          { text: 'Ohne Rapporte', onPress: () => showPdfExportOptions(false) },
          { text: 'Mit Rapporten', onPress: () => showPdfExportOptions(true) },
          { text: t('common.cancel'), style: 'cancel' },
        ]
      );
    } else {
      showPdfExportOptions(false);
    }
  };

  const showPdfExportOptions = (includeReports: boolean) => {
    Alert.alert(
      includeReports ? 'PDF Export (mit Rapporten)' : 'PDF Export',
      t('projects.whatToDo'),
      [
        {
          text: t('projects.showPreview'),
          onPress: async () => {
            try {
              setIsGeneratingPdf(true);
              const html = await generateProjectPdfHtmlWithOptions({ includeReports });
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
          onPress: () => generateAndSharePdf(includeReports),
        },
        {
          text: t('projects.saveToFiles'),
          onPress: () => generateAndSavePdf(includeReports),
        },
        { text: t('common.cancel'), style: 'cancel' },
      ]
    );
  };

  // Generate and share PDF
  const generateAndSharePdf = async (includeReports = false) => {
    try {
      setIsGeneratingPdf(true);
      
      const html = await generateProjectPdfHtmlWithOptions({ includeReports });
      const uri = await createPdfFile(html);
      
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
  const generateAndSavePdf = async (includeReports = false) => {
    try {
      setIsGeneratingPdf(true);
      
      const html = await generateProjectPdfHtmlWithOptions({ includeReports });
      const uri = await createPdfFile(html);
      
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
      const uri = await createPdfFile(html);
      
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
        await Print.printAsync({ uri });
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
      const uri = await createPdfFile(html);
      
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
        await Print.printAsync({ uri });
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
  // Speicherschonender Streaming-Export: Daten werden zeilenweise in die Datei
  // geschrieben (verhindert Hermes-OOM-Crash bei großen Projekten).
  const exportProjectFile = async () => {
    if (!project?.id) return;
    try {
      // Abfrage: Fotos mit exportieren oder weglassen (kleinere Datei)?
      const includePhotos = await askExportPhotoChoice();
      if (includePhotos === null) return;

      setIsGeneratingPdf(true);
      const { uri } = await exportProjectsToFile([project.id], { includePhotos });

      // Export-Verlauf lokal aktualisieren (Anzeige "Zuletzt exportiert")
      const exportedAt = new Date().toISOString();
      setProject(prev => (prev ? { ...prev, last_exported_at: exportedAt } : prev));

      // Hide loader BEFORE opening share dialog to prevent stuck overlay
      setIsGeneratingPdf(false);

      // Web: Datei wurde bereits als Browser-Download ausgeliefert
      if (Platform.OS !== 'web') {
        await Sharing.shareAsync(uri, {
          mimeType: 'application/json',
          dialogTitle: t('projects.saveProject2'),
        });
      }
    } catch (error: any) {
      console.error('Export error:', error);
      setIsGeneratingPdf(false);
      Alert.alert(t('projects.exportError2'), t('projects.exportNotPossible'));
    }
  };

  // Projekt ARCHIVIEREN: als Datei exportieren (extern sichern), danach
  // ENDGÜLTIG aus der App entfernen – spart dauerhaft Speicher.
  // Wiederherstellung jederzeit über den normalen Import möglich.
  const archiveProject = async () => {
    if (!project?.id || isGeneratingPdf) return;
    const projectName = project.name;

    const confirmDelete = () => {
      const doDelete = async () => {
        setIsGeneratingPdf(true);
        try {
          await ProjectService.delete(project.id);
          setIsGeneratingPdf(false);
          router.replace('/');
          setTimeout(() => {
            const msg = `„${projectName}" wurde archiviert und aus der App entfernt. Über „Importieren" kannst du es jederzeit aus der Archiv-Datei wiederherstellen.`;
            if (Platform.OS === 'web') alert(msg);
            else Alert.alert('✅ Projekt archiviert', msg);
          }, 400);
        } catch (e) {
          setIsGeneratingPdf(false);
          console.error('Archive delete error:', e);
          Alert.alert('Fehler', 'Projekt konnte nicht entfernt werden.');
        }
      };
      if (Platform.OS === 'web') {
        // eslint-disable-next-line no-alert
        if (window.confirm(`Archiv-Datei heruntergeladen?\n\n„${projectName}" wird jetzt ENDGÜLTIG aus der App entfernt (inkl. aller Fotos, Skizzen und Dokumente).`)) doDelete();
      } else {
        Alert.alert(
          'Datei sicher gespeichert?',
          `Wenn die Archiv-Datei in iCloud Drive / Google Drive gespeichert ist, wird „${projectName}" jetzt ENDGÜLTIG aus der App entfernt (inkl. aller Fotos, Skizzen und Dokumente).`,
          [
            { text: 'Projekt behalten', style: 'cancel' },
            { text: 'Ja, jetzt entfernen', style: 'destructive', onPress: doDelete },
          ]
        );
      }
    };

    const start = async () => {
      try {
        setIsGeneratingPdf(true);
        // Archiv IMMER komplett (mit Fotos) – nur so ist die Wiederherstellung vollständig
        const { uri } = await exportProjectsToFile([project.id], { includePhotos: true });
        setIsGeneratingPdf(false);
        if (Platform.OS !== 'web') {
          await Sharing.shareAsync(uri, {
            mimeType: 'application/json',
            dialogTitle: 'Projekt-Archiv speichern (iCloud Drive / Google Drive)',
          });
        }
        confirmDelete();
      } catch (e) {
        setIsGeneratingPdf(false);
        console.error('Archive export error:', e);
        Alert.alert('Fehler', 'Archivieren fehlgeschlagen – das Projekt wurde NICHT entfernt.');
      }
    };

    const intro = `1. „${projectName}" wird komplett als Datei exportiert (inkl. Fotos, Skizzen, Dokumente)\n2. Speichere die Datei extern, z. B. in iCloud Drive oder Google Drive\n3. Danach wird das Projekt endgültig aus der App entfernt und gibt Speicher frei\n\nWiederherstellen jederzeit über „Importieren" möglich.`;
    if (Platform.OS === 'web') {
      // eslint-disable-next-line no-alert
      if (window.confirm(`Projekt archivieren?\n\n${intro}`)) start();
    } else {
      Alert.alert('Projekt archivieren', intro, [
        { text: 'Abbrechen', style: 'cancel' },
        { text: 'Archivieren starten', onPress: start },
      ]);
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
        <TouchableOpacity testID="project-export" style={styles.actionButton} onPress={exportProjectFile}>
          <Ionicons name="cloud-upload" size={20} color="#1976d2" />
          <Text style={styles.actionButtonText}>{t('projects.exportProject')}</Text>
        </TouchableOpacity>
        )}
        {/* Projekt archivieren: exportieren + endgültig entfernen */}
        {Features.showProjektExport && (
        <TouchableOpacity testID="project-archive" style={styles.actionButton} onPress={archiveProject}>
          <Ionicons name="archive-outline" size={20} color="#d97706" />
          <Text style={[styles.actionButtonText, { color: '#d97706' }]}>Archivieren</Text>
        </TouchableOpacity>
        )}
      </View>

      {/* Export-Verlauf: wann wurde dieses Projekt zuletzt exportiert */}
      {Features.showProjektExport && !!project.last_exported_at && (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 4, backgroundColor: '#f0f7ff' }}>
          <Ionicons name="cloud-done-outline" size={13} color="#64748b" />
          <Text style={{ fontSize: 12, color: '#64748b' }}>
            Zuletzt exportiert: {new Date(project.last_exported_at).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })}, {new Date(project.last_exported_at).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr
          </Text>
        </View>
      )}

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

          {/* 9. Rapport - Teal - nur in Pro */}
          {Features.showReportTab && (
          <TouchableOpacity
            style={[styles.tabPill, activeTab === 'reports' && styles.tabPillActive]}
            onPress={() => handleTabChange('reports' as any)}
          >
            <Ionicons 
              name={activeTab === 'reports' ? "clipboard" : "clipboard-outline"}
              size={20} 
              color="#0d9488"
            />
            <Text style={[styles.tabPillText, activeTab === 'reports' && styles.tabPillTextActive]}>
              Rapport
            </Text>
            {reports.length > 0 && (
              <View style={[styles.tabBadge, { backgroundColor: '#ccfbf1' }]}>
                <Text style={[styles.tabBadgeText, { color: '#0d9488' }]}>
                  {reports.length}
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
                <View style={[styles.statusBadge, { backgroundColor: getStatusMeta(project.status).color }]}>
                  <Text style={styles.statusBadgeText}>
                    {getStatusMeta(project.status).label}
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
                  onPress={() => { setTempSelectedDate(null); setShowDirectProjectTypeDatePicker(true); }}
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
              {customer?.customerType && (
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Kundentyp:</Text>
                  <Text style={[styles.infoValue, { color: '#1976d2', fontWeight: '600' }]}>
                    {customer.customerType}{(customer as any).customerTypeName ? ` ${(customer as any).customerTypeName}` : ''}
                  </Text>
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
              {(project?.bauherr_mobile || customer?.mobile) && (
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Mobil:</Text>
                  <Text style={styles.infoValue}>{project?.bauherr_mobile || customer?.mobile}</Text>
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
              {(project?.objekt_street || project?.objekt_plz || project?.objekt_city || project?.objekt_address_name || project?.objekt_name || project?.objekt_description || project?.objekt_contact_person || project?.objekt_phone || project?.objekt_email || project?.objekt_number) && (
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
                  {project?.objekt_description && (
                    <View style={styles.infoRow}>
                      <Text style={styles.infoLabel}>Beschreibung:</Text>
                      <Text style={styles.infoValue}>{project.objekt_description}</Text>
                    </View>
                  )}
                  {project?.objekt_name && (
                    <View style={styles.infoRow}>
                      <Text style={styles.infoLabel}>Objektname:</Text>
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
                <View style={{ width: '100%', gap: 8 }}>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
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
                  </TouchableOpacity>
                  </View>
                  {/* Ausgewählte Fotos in anderes Projekt verschieben/kopieren */}
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <TouchableOpacity
                      testID="photo-multi-move"
                      style={[styles.photoActionButton, { backgroundColor: selectedPhotos.length > 0 ? '#607d8b' : '#ccc' }]}
                      disabled={selectedPhotos.length === 0 || isMovingSketch}
                      onPress={() => openTransferModal(selectedPhotos, 'move', `${selectedPhotos.length} ${selectedPhotos.length === 1 ? 'Foto' : 'Fotos'}`, 'photo')}
                    >
                      <Ionicons name="arrow-redo-outline" size={20} color="#fff" />
                      <Text style={[styles.photoActionButtonTextWhite, { fontSize: 12 }]}>Verschieben</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      testID="photo-multi-copy"
                      style={[styles.photoActionButton, { backgroundColor: selectedPhotos.length > 0 ? '#1976d2' : '#ccc' }]}
                      disabled={selectedPhotos.length === 0 || isMovingSketch}
                      onPress={() => openTransferModal(selectedPhotos, 'copy', `${selectedPhotos.length} ${selectedPhotos.length === 1 ? 'Foto' : 'Fotos'}`, 'photo')}
                    >
                      <Ionicons name="copy-outline" size={20} color="#fff" />
                      <Text style={[styles.photoActionButtonTextWhite, { fontSize: 12 }]}>Kopieren</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      testID="photo-remember"
                      style={[styles.photoActionButton, { backgroundColor: selectedPhotos.length > 0 ? '#16a34a' : '#ccc' }]}
                      disabled={selectedPhotos.length === 0}
                      onPress={handleRememberPhotos}
                    >
                      <Ionicons name="clipboard-outline" size={20} color="#fff" />
                      <Text style={[styles.photoActionButtonTextWhite, { fontSize: 12 }]}>Merken</Text>
                    </TouchableOpacity>
                  </View>
                </View>
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
                        <Text style={[styles.photoActionButtonText, { color: '#f44336' }]}>Fotos auswählen</Text>
                        <Text style={[styles.photoActionButtonSubtext, { color: '#f44336' }]}>(Löschen/Verschieben)</Text>
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

            {/* Fotos aus der Zwischenablage einfügen */}
            {photoClipboard && !photoDeleteMode && !photoSelectMode && (
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 8 }}>
                <TouchableOpacity
                  testID="photo-paste"
                  disabled={isMovingSketch}
                  onPress={handlePastePhotos}
                  style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#e8f5e9', borderWidth: 2, borderColor: '#16a34a', borderStyle: 'dashed', borderRadius: 12, paddingVertical: 12, paddingHorizontal: 12 }}
                >
                  <Ionicons name="clipboard-outline" size={20} color="#16a34a" />
                  <Text style={{ color: '#15803d', fontWeight: '700', fontSize: 14 }} numberOfLines={1}>
                    Fotos einfügen: {photoClipboard.label}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  testID="photo-paste-clear"
                  onPress={clearPhotoClipboard}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  style={{ padding: 8, borderRadius: 16, backgroundColor: '#f1f5f9' }}
                >
                  <Ionicons name="close" size={18} color="#64748b" />
                </TouchableOpacity>
              </View>
            )}

            {!isTabLoading && photos.length > 0 && (
              <Text style={{ fontSize: 12, color: '#999', textAlign: 'center', marginBottom: 6 }}>
                Tipp: Foto gedrückt halten, um es einem Ordner zuzuordnen
              </Text>
            )}

            {(() => {
              const folderOf = (p: any) => ((p.folder || '') as string).trim();
              const photoGroups: { name: string; items: typeof photos }[] = [];
              [...photos]
                .sort((a, b) => folderOf(a).localeCompare(folderOf(b)))
                .forEach(p => {
                  const gName = folderOf(p);
                  const g = photoGroups.find(x => x.name === gName);
                  if (g) g.items.push(p); else photoGroups.push({ name: gName, items: [p] });
                });
              const showPhotoFolderHeaders = photoGroups.length > 1 || (photoGroups.length === 1 && photoGroups[0].name !== '');
              return photoGroups.map(group => (
              <View key={group.name || '_none'}>
              {showPhotoFolderHeaders && (
                <TouchableOpacity
                  onPress={() => openRenameFolderModal(group.name)}
                  disabled={!group.name}
                  style={{ flexDirection: 'row', alignItems: 'center', marginTop: 10, marginBottom: 6, paddingHorizontal: 4 }}
                >
                  <Ionicons name={group.name ? 'folder' : 'folder-open-outline'} size={18} color={group.name ? '#1976d2' : '#999'} />
                  <Text style={{ marginLeft: 6, fontSize: 14, fontWeight: '700', color: group.name ? '#333' : '#999' }}>
                    {group.name || 'Ohne Ordner'} ({group.items.length})
                  </Text>
                  {!!group.name && <Ionicons name="pencil" size={13} color="#bbb" style={{ marginLeft: 6 }} />}
                </TouchableOpacity>
              )}
              <View style={styles.photoGrid}>
              {group.items.map((photo) => (
                <View key={photo.id} style={styles.photoItem}>
                  <TouchableOpacity
                    onPress={() => {
                      if (photoSelectMode || photoDeleteMode) {
                        togglePhotoSelection(photo.id);
                      } else {
                        router.push(`/photos/annotate?photoId=${photo.id}&projectId=${id}`);
                      }
                    }}
                    onLongPress={() => {
                      if (!photoSelectMode && !photoDeleteMode) openPhotoFolderModal(photo);
                    }}
                    delayLongPress={450}
                    style={{ flex: 1 }}
                  >
                    {(photo as any).annotations ? (() => {
                      try {
                        const annotationData = JSON.parse((photo as any).annotations);
                        const canvasW = annotationData.canvasWidth || 400;
                        const canvasH = annotationData.canvasHeight || 300;
                        const hasPaths = annotationData.paths && annotationData.paths.length > 0;
                        const hasTexts = annotationData.textElements && annotationData.textElements.length > 0;
                        if (!hasPaths && !hasTexts) {
                          return (
                            <Image
                              source={{ uri: photo.image_data }}
                              style={styles.photoImage}
                              resizeMode="contain"
                            />
                          );
                        }
                        // Bild + Annotationen in einem einzigen SVG rendern
                        // damit beide denselben Koordinatenraum teilen
                        return (
                          <Svg
                            viewBox={`0 0 ${canvasW} ${canvasH}`}
                            preserveAspectRatio="xMidYMid meet"
                            style={[styles.photoImage, { backgroundColor: '#f5f5f5' }]}
                          >
                            <SvgImage
                              href={photo.image_data}
                              x="0" y="0"
                              width={canvasW}
                              height={canvasH}
                              preserveAspectRatio="xMidYMid meet"
                            />
                            {hasPaths && annotationData.paths.map((p: any, pi: number) => (
                              <SvgPath
                                key={`p${pi}`}
                                d={p.path}
                                stroke={p.color || '#FF0000'}
                                strokeWidth={p.strokeWidth || 3}
                                fill="none"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            ))}
                            {hasTexts && annotationData.textElements.map((t: any, ti: number) => (
                              <SvgText
                                key={`t${ti}`}
                                x={t.x}
                                y={t.y}
                                fontSize={t.fontSize || 20}
                                fill={t.color || '#FFFFFF'}
                                fontWeight="bold"
                                stroke="#000000"
                                strokeWidth={0.5}
                                fontFamily={t.fontFamily === 'System' ? undefined : (t.fontFamily || undefined)}
                              >
                                {t.text}
                              </SvgText>
                            ))}
                            <SvgPath key={`inv-${fabricTick++}`} d="M -9999 -9999" fill="none" stroke="none" />
                          </Svg>
                        );
                      } catch (e) {
                        return (
                          <Image
                            source={{ uri: photo.image_data }}
                            style={styles.photoImage}
                            resizeMode="contain"
                          />
                        );
                      }
                    })() : (
                    <Image
                      source={{ uri: photo.image_data }}
                      style={styles.photoImage}
                      resizeMode="contain"
                    />
                    )}
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
              ));
            })()}
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

            {/* Skizze aus der Zwischenablage einfügen */}
            {sketchClipboard && (
              <View style={{ flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginTop: -8, marginBottom: 12, gap: 8 }}>
                <TouchableOpacity
                  testID="sketch-paste"
                  disabled={isDuplicatingSketch}
                  onPress={handlePasteSketch}
                  style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#e8f5e9', borderWidth: 2, borderColor: '#16a34a', borderStyle: 'dashed', borderRadius: 12, paddingVertical: 12, paddingHorizontal: 12 }}
                >
                  <Ionicons name="clipboard-outline" size={20} color="#16a34a" />
                  <Text style={{ color: '#15803d', fontWeight: '700', fontSize: 14 }} numberOfLines={1}>
                    Skizze einfügen: „{sketchClipboard.title}"
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  testID="sketch-paste-clear"
                  onPress={clearSketchClipboard}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  style={{ padding: 8, borderRadius: 16, backgroundColor: '#f1f5f9' }}
                >
                  <Ionicons name="close" size={18} color="#64748b" />
                </TouchableOpacity>
              </View>
            )}

            {/* Mehrfach-Auswahl: Umschalter + Aktionsleiste */}
            {!isTabLoading && sketches.length > 1 && !sketchSelectMode && (
              <TouchableOpacity
                testID="sketch-select-toggle"
                onPress={() => setSketchSelectMode(true)}
                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginHorizontal: 16, marginTop: -8, marginBottom: 12, paddingVertical: 9, borderRadius: 10, backgroundColor: '#f1f5f9' }}
              >
                <Ionicons name="checkbox-outline" size={18} color="#475569" />
                <Text style={{ color: '#475569', fontWeight: '700', fontSize: 13 }}>Mehrere auswählen</Text>
              </TouchableOpacity>
            )}
            {sketchSelectMode && (
              <View style={{ marginHorizontal: 16, marginTop: -8, marginBottom: 12, backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', padding: 10 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: '#0f172a', textAlign: 'center', marginBottom: 8 }}>
                  {selectedSketches.length === 0
                    ? 'Skizzen antippen, um sie auszuwählen'
                    : `${selectedSketches.length} ${selectedSketches.length === 1 ? 'Skizze' : 'Skizzen'} ausgewählt`}
                </Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TouchableOpacity
                    testID="sketch-multi-move"
                    disabled={selectedSketches.length === 0}
                    onPress={() => openTransferModal(selectedSketches, 'move', `${selectedSketches.length} Skizzen`)}
                    style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 10, backgroundColor: selectedSketches.length === 0 ? '#e2e8f0' : '#607d8b' }}
                  >
                    <Ionicons name="arrow-redo-outline" size={16} color="#fff" />
                    <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>Verschieben</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    testID="sketch-multi-copy"
                    disabled={selectedSketches.length === 0}
                    onPress={() => openTransferModal(selectedSketches, 'copy', `${selectedSketches.length} Skizzen`)}
                    style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 10, backgroundColor: selectedSketches.length === 0 ? '#e2e8f0' : '#1976d2' }}
                  >
                    <Ionicons name="copy-outline" size={16} color="#fff" />
                    <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>Kopieren</Text>
                  </TouchableOpacity>
                </View>
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                  <TouchableOpacity
                    testID="sketch-multi-delete"
                    disabled={selectedSketches.length === 0}
                    onPress={handleMultiDeleteSketches}
                    style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 10, backgroundColor: selectedSketches.length === 0 ? '#e2e8f0' : '#dc2626' }}
                  >
                    <Ionicons name="trash" size={16} color="#fff" />
                    <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>Löschen</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    testID="sketch-select-cancel"
                    onPress={exitSketchSelectMode}
                    style={{ flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: '#f1f5f9', paddingVertical: 10 }}
                  >
                    <Text style={{ color: '#64748b', fontWeight: '700', fontSize: 13 }}>Abbrechen</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {!isTabLoading && sketches.length > 0 && (
              <Text style={{ fontSize: 12, color: '#999', textAlign: 'center', marginBottom: 6 }}>
                Tipp: Skizze gedrückt halten, um sie einem Ordner zuzuordnen
              </Text>
            )}

            {isTabLoading ? (
              <View style={{ padding: 40, alignItems: 'center' }}>
                <ActivityIndicator size="large" color="#1976d2" />
                <Text style={{ marginTop: 12, fontSize: 15, color: '#666' }}>Skizzen werden geladen...</Text>
              </View>
            ) : [...sketches]
              .sort((a, b) =>
                (((a as any).folder || '') as string).trim().localeCompare((((b as any).folder || '') as string).trim())
                || (a.created_at || '').localeCompare(b.created_at || ''))
              .map((sketch, sketchIdx, sortedSketches) => {
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

              const sketchFolder = (((sketch as any).folder || '') as string).trim();
              const prevSketchFolder = sketchIdx > 0
                ? ((((sortedSketches[sketchIdx - 1] as any).folder || '') as string).trim())
                : null;
              const showFolderHeader = sketchFolder !== prevSketchFolder;

              return (
                <View key={sketch.id}>
                  {showFolderHeader && (
                    <TouchableOpacity
                      onPress={() => openRenameFolderModal(sketchFolder)}
                      disabled={!sketchFolder}
                      style={{ flexDirection: 'row', alignItems: 'center', marginTop: 10, marginBottom: 6, paddingHorizontal: 4 }}
                    >
                      <Ionicons name={sketchFolder ? 'folder' : 'folder-open-outline'} size={18} color={sketchFolder ? '#1976d2' : '#999'} />
                      <Text style={{ marginLeft: 6, fontSize: 14, fontWeight: '700', color: sketchFolder ? '#333' : '#999' }}>
                        {sketchFolder || 'Ohne Ordner'}
                      </Text>
                      {!!sketchFolder && <Ionicons name="pencil" size={13} color="#bbb" style={{ marginLeft: 6 }} />}
                    </TouchableOpacity>
                  )}
                <View style={[styles.itemCard, sketchSelectMode && selectedSketches.includes(sketch.id) && { borderWidth: 2, borderColor: '#16a34a' }]}>
                  <TouchableOpacity
                    testID={`sketch-card-${sketch.id}`}
                    onPress={() => {
                      if (sketchSelectMode) {
                        toggleSketchSelection(sketch.id);
                        return;
                      }
                      router.push(`/sketches/draw?projectId=${id}&sketchId=${sketch.id}`);
                    }}
                    onLongPress={() => { if (!sketchSelectMode) openSketchFolderModal(sketch); }}
                    delayLongPress={450}
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
                    
                    {/* Notizen gruppiert anzeigen: Hauptnotiz + Memo + Notiz */}
                    {(sketch.notes || sketchElementNotes[sketch.id]?.pointer?.length || sketchElementNotes[sketch.id]?.memo?.length) ? (
                      <View style={{ paddingHorizontal: 8, paddingBottom: 6 }}>
                        {sketch.notes ? (
                          <Text style={{ fontSize: 12, color: '#666' }} numberOfLines={2}>
                            <Text style={{ fontWeight: '700' }}>Notizen: </Text>{sketch.notes}
                          </Text>
                        ) : null}
                        {sketchElementNotes[sketch.id]?.pointer?.length ? (
                          <Text style={{ fontSize: 12, color: '#666' }} numberOfLines={2}>
                            <Text style={{ fontWeight: '700' }}>{sketchLabelCfg.pointerName}: </Text>{sketchElementNotes[sketch.id].pointer.join(' | ')}
                          </Text>
                        ) : null}
                        {sketchElementNotes[sketch.id]?.memo?.length ? (
                          <Text style={{ fontSize: 12, color: '#666' }} numberOfLines={2}>
                            <Text style={{ fontWeight: '700' }}>{sketchLabelCfg.memoName}: </Text>{sketchElementNotes[sketch.id].memo.join(' | ')}
                          </Text>
                        ) : null}
                      </View>
                    ) : null}
                    
                  </TouchableOpacity>
                  
                  {/* Aktions-Buttons (im Auswahlmodus ausgeblendet) */}
                  {!sketchSelectMode && (
                    <>
                  {/* Move Button */}
                  <TouchableOpacity
                    style={styles.sketchMoveButton}
                    testID={`sketch-move-${sketch.id}`}
                    onPress={() => openTransferModal([sketch.id], 'move', sketch.title || (sketch as any).name || 'Skizze')}
                  >
                    <Ionicons name="arrow-redo-outline" size={20} color="#fff" />
                  </TouchableOpacity>

                  {/* Duplicate Button */}
                  <TouchableOpacity
                    style={styles.sketchCopyButton}
                    testID={`sketch-duplicate-${sketch.id}`}
                    disabled={isDuplicatingSketch}
                    onPress={() => handleDuplicateSketch(sketch.id)}
                  >
                    <Ionicons name="copy-outline" size={20} color="#fff" />
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
                    </>
                  )}

                  {/* Auswahl-Indikator im Mehrfach-Auswahlmodus */}
                  {sketchSelectMode && (
                    <View style={{ position: 'absolute', top: 10, right: 10, zIndex: 10 }} pointerEvents="none">
                      <Ionicons
                        name={selectedSketches.includes(sketch.id) ? 'checkmark-circle' : 'ellipse-outline'}
                        size={28}
                        color={selectedSketches.includes(sketch.id) ? '#16a34a' : '#94a3b8'}
                      />
                    </View>
                  )}
                </View>
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

        {activeTab === 'reports' && (
          <View style={styles.documentsSection}>
            <TouchableOpacity
              style={styles.addButton}
              onPress={() => router.push({
                pathname: '/reports/edit',
                params: { projectId: Array.isArray(id) ? id[0] : id },
              })}
            >
              <Ionicons name="add-circle" size={24} color="#fff" />
              <Text style={styles.addButtonText}>Neuer Rapport</Text>
            </TouchableOpacity>

            {reports.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="clipboard-outline" size={48} color="#ccc" />
                <Text style={styles.emptyText}>Keine Rapporte vorhanden</Text>
                <Text style={styles.emptySubtext}>
                  Erstellen Sie Arbeitsrapporte mit Datum, Mitarbeitern, Material und Unterschriften – direkt aus den Projektdaten.
                </Text>
              </View>
            ) : (
              <View style={{ marginTop: 8 }}>
                {reports.map((rep) => {
                  const dateStr = rep.date ? new Date(rep.date).toLocaleDateString('de-DE') : '-';
                  const empCount = (rep.employees || []).length;
                  const hoursVal = rep.total_hours ?? (() => {
                    if (!rep.time_from || !rep.time_to) return 0;
                    const [fh, fm] = rep.time_from.split(':').map(Number);
                    const [th, tm] = rep.time_to.split(':').map(Number);
                    let mins = (th * 60 + tm) - (fh * 60 + fm);
                    if (mins < 0) mins += 24 * 60;
                    return Math.round((mins / 60) * 100) / 100;
                  })();
                  const signed = !!(rep.signature_customer || rep.signature_worker);
                  return (
                    <TouchableOpacity
                      key={rep.id}
                      style={styles.reportCard}
                      onPress={() => router.push({
                        pathname: '/reports/edit',
                        params: { projectId: Array.isArray(id) ? id[0] : id, reportId: rep.id },
                      })}
                    >
                      <View style={styles.reportCardLeft}>
                        <View style={styles.reportIconBox}>
                          <Ionicons name="clipboard" size={26} color="#0d9488" />
                        </View>
                      </View>
                      <View style={styles.reportCardBody}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                          <Text style={styles.reportCardTitle}>
                            {rep.report_number || 'Rapport'}
                          </Text>
                          {signed && (
                            <View style={styles.signedBadge}>
                              <Ionicons name="checkmark-circle" size={12} color="#0d9488" />
                              <Text style={styles.signedBadgeText}>unterschrieben</Text>
                            </View>
                          )}
                        </View>
                        <Text style={styles.reportCardDate}>{dateStr}</Text>
                        <View style={styles.reportCardStats}>
                          <View style={styles.reportStat}>
                            <Ionicons name="people-outline" size={13} color="#666" />
                            <Text style={styles.reportStatText}>{empCount} MA</Text>
                          </View>
                          {hoursVal > 0 && (
                            <View style={styles.reportStat}>
                              <Ionicons name="time-outline" size={13} color="#666" />
                              <Text style={styles.reportStatText}>{hoursVal} Std.</Text>
                            </View>
                          )}
                          {(rep.photos || []).length > 0 && (
                            <View style={styles.reportStat}>
                              <Ionicons name="camera-outline" size={13} color="#666" />
                              <Text style={styles.reportStatText}>{(rep.photos || []).length}</Text>
                            </View>
                          )}
                        </View>
                        {rep.work_description ? (
                          <Text style={styles.reportCardDesc} numberOfLines={1}>{rep.work_description}</Text>
                        ) : null}
                      </View>
                      <TouchableOpacity
                        style={styles.reportCardDelete}
                        onPress={(e) => {
                          e.stopPropagation();
                          Alert.alert(
                            'Rapport löschen',
                            `${rep.report_number || 'Rapport'} wirklich löschen?`,
                            [
                              { text: t('common.cancel'), style: 'cancel' },
                              {
                                text: t('common.delete'),
                                style: 'destructive',
                                onPress: async () => {
                                  try {
                                    await ReportService.delete(rep.id);
                                    await loadProjectData();
                                  } catch (err) {
                                    console.error('Delete report error:', err);
                                    Alert.alert(t('common.error'), 'Rapport konnte nicht gelöscht werden.');
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
                  );
                })}
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
                    {photo.showInPdf && (
                      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                        <Ionicons name="document-text" size={12} color="#1976d2" />
                        <Text style={{ fontSize: 10, color: '#1976d2', marginLeft: 4 }}>Im PDF</Text>
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
                                    // Cleanup PDF snapshot
                                    try { await AsyncStorage.removeItem(`imagemeter_pdf_${photo.id}`); } catch (_) {}
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
                      {PROJECT_STATUSES.map((statusMeta) => (
                        <TouchableOpacity
                          key={statusMeta.key}
                          style={[
                            styles.statusButtonCompact,
                            editProjectStatus === statusMeta.key && styles.statusButtonActiveCompact,
                            editProjectStatus === statusMeta.key && { borderColor: statusMeta.color, backgroundColor: statusMeta.color + '20' },
                          ]}
                          onPress={() => setEditProjectStatus(statusMeta.key)}
                        >
                          <Text style={[
                            styles.statusButtonTextCompact,
                            editProjectStatus === statusMeta.key && styles.statusButtonTextActiveCompact,
                            editProjectStatus === statusMeta.key && { color: statusMeta.color },
                          ]}>
                            {statusMeta.label}
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
                    <Text style={styles.compactLabel}>Kundentyp</Text>
                    <TouchableOpacity 
                      style={styles.compactPickerButton}
                      onPress={() => setShowEditCustomerTypePicker(true)}
                    >
                      <Text style={editBauherrCustomerType ? styles.compactPickerText : styles.compactPickerPlaceholder}>
                        {editBauherrCustomerType || 'Kundentyp...'}
                      </Text>
                      <Ionicons name="chevron-down" size={16} color="#666" />
                    </TouchableOpacity>
                  </View>

                  {editBauherrCustomerType ? (
                    <View style={styles.compactInputGroup}>
                      <Text style={styles.compactLabel}>Bezeichnung {editBauherrCustomerType}</Text>
                      <TextInput
                        style={styles.compactInput}
                        value={editBauherrCustomerTypeName}
                        onChangeText={setEditBauherrCustomerTypeName}
                        placeholderTextColor="#999"
                        placeholder={editBauherrCustomerType === 'Privat' ? 'z.B. Familie Mustermann' : 'z.B. Elektro Mustermann GmbH'}
                      />
                    </View>
                  ) : null}

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
                    <Text style={styles.compactLabel}>Bezeichnung</Text>
                    <TextInput
                      style={styles.compactInput}
                      value={editObjektAddressName}
                      onChangeText={setEditObjektAddressName}
                      placeholderTextColor="#999" placeholder="z.B. Haupthaus, Garage"
                    />
                  </View>

                  <View style={styles.compactInputGroup}>
                    <Text style={styles.compactLabel}>Beschreibung</Text>
                    <TextInput
                      style={[styles.compactInput, { minHeight: 60, textAlignVertical: 'top' }]}
                      value={editObjektDescription}
                      onChangeText={setEditObjektDescription}
                      placeholderTextColor="#999" placeholder="Optionale Beschreibung"
                      multiline
                      numberOfLines={2}
                    />
                  </View>

                  <View style={styles.compactInputGroup}>
                    <Text style={styles.compactLabel}>Objektname</Text>
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

        {/* Kundentyp Picker */}
        {showEditCustomerTypePicker && (
          <View style={styles.salutationPickerOverlay}>
            <TouchableOpacity 
              style={styles.salutationPickerBackdrop}
              activeOpacity={1}
              onPress={() => setShowEditCustomerTypePicker(false)}
            />
            <View style={styles.salutationPickerContent}>
              <Text style={styles.salutationModalTitle}>Kundentyp auswählen</Text>
              {['Privat', 'Firma', 'Hausverwaltung', 'Architekturbüro', 'Planungsbüro', 'Generalunternehmen', 'Versicherung', 'Sonstiges'].map((option) => (
                <TouchableOpacity
                  key={option}
                  style={styles.salutationOption}
                  onPress={() => {
                    setEditBauherrCustomerType(option);
                    setShowEditCustomerTypePicker(false);
                  }}
                >
                  <Text style={[
                    styles.salutationOptionText,
                    editBauherrCustomerType === option && styles.salutationOptionSelected
                  ]}>{option}</Text>
                  {editBauherrCustomerType === option && (
                    <Ionicons name="checkmark" size={20} color="#1976d2" />
                  )}
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                style={styles.salutationOption}
                onPress={() => {
                  setEditBauherrCustomerType('');
                  setShowEditCustomerTypePicker(false);
                }}
              >
                <Text style={styles.salutationOptionText}>Kein Typ</Text>
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
                value={tempSelectedDate || (project?.project_type_date ? new Date(project.project_type_date) : new Date())}
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

      {/* Ordner-Umbenennen Modal */}
      <Modal visible={renameFolderModal.visible} transparent animationType="fade" onRequestClose={() => setRenameFolderModal({ visible: false, oldName: '', value: '' })}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 24 }}>
          <View style={{ backgroundColor: '#fff', borderRadius: 14, padding: 18 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
              <Ionicons name="pencil" size={20} color="#1976d2" />
              <Text style={{ marginLeft: 8, fontSize: 17, fontWeight: '700', color: '#333' }}>Ordner umbenennen</Text>
            </View>
            <Text style={{ fontSize: 13, color: '#888', marginBottom: 12 }}>
              Alle Skizzen und Fotos im Ordner "{renameFolderModal.oldName}" werden automatisch mitgezogen.
            </Text>
            <TextInput
              value={renameFolderModal.value}
              onChangeText={txt => setRenameFolderModal(m => ({ ...m, value: txt }))}
              placeholder="Neuer Ordnername"
              placeholderTextColor="#999"
              style={{ borderWidth: 1, borderColor: '#ddd', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: '#333' }}
              testID="rename-folder-input"
            />
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 16 }}>
              <TouchableOpacity
                onPress={() => setRenameFolderModal({ visible: false, oldName: '', value: '' })}
                style={{ flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center', backgroundColor: '#f5f5f5' }}
              >
                <Text style={{ color: '#666', fontWeight: '600' }}>Abbrechen</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={saveRenameFolder}
                style={{ flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center', backgroundColor: '#1976d2' }}
                testID="rename-folder-save"
              >
                <Text style={{ color: '#fff', fontWeight: '700' }}>Umbenennen</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Skizzen-Ordner Modal */}
      <Modal visible={sketchFolderModal.visible} transparent animationType="fade" onRequestClose={() => setSketchFolderModal({ visible: false, kind: 'sketch', itemId: '', value: '' })}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 24 }}>
          <View style={{ backgroundColor: '#fff', borderRadius: 14, padding: 18 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
              <Ionicons name="folder" size={22} color="#1976d2" />
              <Text style={{ marginLeft: 8, fontSize: 17, fontWeight: '700', color: '#333' }}>
                {sketchFolderModal.kind === 'photo' ? 'Foto-Ordner' : 'Skizzen-Ordner'}
              </Text>
            </View>
            <TextInput
              value={sketchFolderModal.value}
              onChangeText={txt => setSketchFolderModal(m => ({ ...m, value: txt }))}
              placeholder='z.B. "Hauptdach", "Garage", "Anbau"'
              placeholderTextColor="#999"
              style={{ borderWidth: 1, borderColor: '#ddd', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: '#333' }}
              testID="sketch-folder-input"
            />
            {(() => {
              const sourceItems: any[] = sketchFolderModal.kind === 'photo' ? photos : sketches;
              const existing = Array.from(new Set(sourceItems.map((s: any) => ((s.folder || '') as string).trim()).filter(Boolean))).sort();
              if (existing.length === 0) return null;
              return (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
                  {existing.map(f => (
                    <TouchableOpacity
                      key={f}
                      onPress={() => setSketchFolderModal(m => ({ ...m, value: f }))}
                      style={{ backgroundColor: sketchFolderModal.value === f ? '#1976d2' : '#eef2f6', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14 }}
                    >
                      <Text style={{ fontSize: 13, color: sketchFolderModal.value === f ? '#fff' : '#555' }}>{f}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              );
            })()}
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 16 }}>
              <TouchableOpacity
                onPress={() => saveSketchFolder('')}
                style={{ flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center', backgroundColor: '#f5f5f5' }}
              >
                <Text style={{ color: '#666', fontWeight: '600' }}>Kein Ordner</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setSketchFolderModal({ visible: false, kind: 'sketch', itemId: '', value: '' })}
                style={{ flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center', backgroundColor: '#f5f5f5' }}
              >
                <Text style={{ color: '#666', fontWeight: '600' }}>Abbrechen</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => saveSketchFolder(sketchFolderModal.value)}
                style={{ flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center', backgroundColor: '#1976d2' }}
                testID="sketch-folder-save"
              >
                <Text style={{ color: '#fff', fontWeight: '700' }}>Speichern</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Skizzen/Fotos-übertragen Modal */}
      <Modal visible={moveSketchModal.visible} transparent animationType="fade" onRequestClose={() => { setFolderStep(null); setMoveSketchModal({ visible: false, itemIds: [], mode: 'move', kind: 'sketch', label: '' }); }}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 24 }}>
          <View style={{ backgroundColor: '#fff', borderRadius: 14, padding: 18, maxHeight: '75%' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
              <Ionicons name={moveSketchModal.mode === 'move' ? 'arrow-redo-outline' : 'copy-outline'} size={22} color="#1976d2" />
              <Text style={{ marginLeft: 8, fontSize: 17, fontWeight: '700', color: '#333' }} numberOfLines={1}>
                {(moveSketchModal.kind === 'photo'
                  ? (moveSketchModal.itemIds.length > 1 ? 'Fotos' : 'Foto')
                  : (moveSketchModal.itemIds.length > 1 ? 'Skizzen' : 'Skizze'))} {moveSketchModal.mode === 'move' ? 'verschieben' : 'kopieren'}
              </Text>
            </View>
            <Text style={{ fontSize: 13, color: '#666', marginBottom: 12 }} numberOfLines={2}>
              „{moveSketchModal.label}" in welches Projekt {moveSketchModal.mode === 'move' ? 'verschieben' : 'kopieren'}?
            </Text>
            {folderStep ? (
              <>
                <Text style={{ fontSize: 13, color: '#1976d2', fontWeight: '700', marginBottom: 8 }} numberOfLines={1}>
                  📁 Ziel-Ordner in „{folderStep.project.name}" wählen:
                </Text>
                <ScrollView style={{ maxHeight: 360 }}>
                  <TouchableOpacity
                    testID="folder-keep"
                    disabled={isMovingSketch}
                    onPress={() => transferItemsToProject(folderStep.project, { type: 'keep' })}
                    style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 10, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' }}
                  >
                    <Ionicons name="checkmark-circle-outline" size={20} color="#16a34a" />
                    <Text style={{ flex: 1, marginLeft: 10, fontSize: 15, fontWeight: '600', color: '#333' }}>Ordner beibehalten</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    testID="folder-none"
                    disabled={isMovingSketch}
                    onPress={() => transferItemsToProject(folderStep.project, { type: 'none' })}
                    style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 10, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' }}
                  >
                    <Ionicons name="remove-circle-outline" size={20} color="#64748b" />
                    <Text style={{ flex: 1, marginLeft: 10, fontSize: 15, fontWeight: '600', color: '#333' }}>Ohne Ordner</Text>
                  </TouchableOpacity>
                  {folderStep.folders.map(f => (
                    <TouchableOpacity
                      key={f}
                      testID={`folder-target-${f}`}
                      disabled={isMovingSketch}
                      onPress={() => transferItemsToProject(folderStep.project, { type: 'set', name: f })}
                      style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 10, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' }}
                    >
                      <Ionicons name="folder-outline" size={20} color="#1976d2" />
                      <Text style={{ flex: 1, marginLeft: 10, fontSize: 15, fontWeight: '600', color: '#333' }} numberOfLines={1}>{f}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
                <TouchableOpacity
                  onPress={() => setFolderStep(null)}
                  style={{ marginTop: 14, paddingVertical: 11, borderRadius: 10, alignItems: 'center', backgroundColor: '#f5f5f5' }}
                >
                  <Text style={{ color: '#666', fontWeight: '600' }}>Zurück zur Projektauswahl</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
            <ScrollView style={{ maxHeight: 360 }}>
              {moveTargetProjects.map((p: any) => (
                <TouchableOpacity
                  key={p.id}
                  testID={`move-target-${p.id}`}
                  disabled={isMovingSketch}
                  onPress={() => prepareFolderStep(p)}
                  style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 10, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' }}
                >
                  <Ionicons name="folder-outline" size={20} color="#1976d2" />
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={{ fontSize: 15, fontWeight: '600', color: '#333' }} numberOfLines={1}>{p.name}</Text>
                    {!!p.project_number && (
                      <Text style={{ fontSize: 12, color: '#999' }}>Nr. {p.project_number}</Text>
                    )}
                  </View>
                  <Ionicons name="chevron-forward" size={18} color="#bbb" />
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity
              onPress={() => { setFolderStep(null); setMoveSketchModal({ visible: false, itemIds: [], mode: 'move', kind: 'sketch', label: '' }); }}
              style={{ marginTop: 14, paddingVertical: 11, borderRadius: 10, alignItems: 'center', backgroundColor: '#f5f5f5' }}
            >
              <Text style={{ color: '#666', fontWeight: '600' }}>Abbrechen</Text>
            </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* PDF Preview Modal */}
      <PdfPreviewModal
        visible={showPdfPreviewModal}
        onClose={() => setShowPdfPreviewModal(false)}
        pdfHtmlContent={pdfHtmlContent}
        viewShotRef={viewShotRef}
        photos={photos}
        areaCalculationsCount={areaCalculations.length}
        showCalcDetailsPage={showCalcDetailsPage}
        onToggleCalcDetails={() => setShowCalcDetailsPage(!showCalcDetailsPage)}
        includeCoverPage={includeCoverPage}
        onToggleCoverPage={toggleCoverPage}
        coverSubtitle={coverSubtitle}
        onChangeCoverSubtitle={changeCoverSubtitle}
        coverStyle={coverStyle}
        onChangeCoverStyle={changeCoverStyle}
        coverPhotoId={coverPhotoId}
        onSelectCoverPhoto={setCoverPhotoId}
        coverAccent={coverAccent}
        onChangeCoverAccent={changeCoverAccent}
        includeToc={includeToc}
        onToggleToc={toggleToc}
        isSharingImage={isSharingImage}
        onShareAsImage={sharePreviewAsImage}
      />

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

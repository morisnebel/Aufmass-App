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
} from 'react-native';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ProjectService, CustomerService, RoofService, PhotoService, SketchService, ChecklistService, SettingsService } from '../../services/LocalStorage';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';
import { copyAsync, deleteAsync, cacheDirectory, writeAsStringAsync } from 'expo-file-system/legacy';
import { WebView } from 'react-native-webview';
import { SvgXml } from 'react-native-svg';
import ViewShot from 'react-native-view-shot';

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
  
  // PDF Preview state
  const [showPdfPreviewModal, setShowPdfPreviewModal] = useState(false);
  const [pdfHtmlContent, setPdfHtmlContent] = useState('');
  const [pdfUri, setPdfUri] = useState<string | null>(null);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [isSharingImage, setIsSharingImage] = useState(false);
  const viewShotRef = useRef<ViewShot>(null);

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

  // Generate PDF HTML content
  const generatePdfHtml = async () => {
    // Get company settings for header
    const settings = await SettingsService.get();
    
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
    const objektName = project?.objekt_name || '';
    const objektStreet = project?.objekt_street || '';
    const objektPlz = project?.objekt_plz || '';
    const objektCity = project?.objekt_city || '';
    
    // Company info für Header - verwende die Felder aus den Einstellungen
    const companyName = settings.company_name || '';
    const companySubtitle = settings.company_subtitle || '';
    const companyStreet = settings.street || '';
    const companyZipCode = settings.zip_code || '';
    const companyCity = settings.city || '';
    const companyPhone = settings.phone || '';
    const companyEmail = settings.email || '';
    const companyLogo = settings.logo_data || '';
    const authorName = settings.author_name || '';
    
    // PDF Layout Einstellungen
    const checklistColumns = (settings as any).pdf_checklist_columns || 2;
    // Feste Spaltenanzahl statt auto-fit
    const gridColumns = checklistColumns === 1 ? '1fr' : checklistColumns === 2 ? '1fr 1fr' : '1fr 1fr 1fr';
    
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
    
    const checklistsHtml = checklists.length > 0 ? checklists.map(checklist => {
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
              </div>
              ${l1Item.note ? `<div class="pdf-note"><span class="pdf-note-icon">📝</span> ${l1Item.note}</div>` : ''}
              ${l1Item.measurements && l1Item.measurements.length > 0 ? `<div class="pdf-measurement">${l1Item.measurements.map((m: any) => `📐 ${formatMeasurementForPdf(m)}`).join('<br>')}</div>` : ''}
              ${deepSubs.length > 0 ? `<div class="pdf-level1-content">${deepSubsHtml}</div>` : ''}
            </div>
          `;
        }).join('');
        
        return `
          <div class="pdf-category-section cols-${checklistColumns}">
            <div class="pdf-category-header">
              <span class="pdf-cat-check">✓</span>
              <span class="pdf-category-title">${category.text}</span>
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
            <div class="pdf-level1-grid">${containersHtml}</div>
          </div>
        `;
      }).join('');
      
      const totalChecked = countCheckedForPdf(checklist.items);
      const totalItems = countTotalForPdf(checklist.items);
      
      return `
        <div class="checklist-card">
          <div class="checklist-main-header">
            <span class="checklist-main-title">${checklist.template_name}</span>
            <span class="checklist-main-count">${totalChecked} von ${totalItems}</span>
          </div>
          <div class="pdf-categories-grid">${categoriesHtml}</div>
        </div>
      `;
    }).join('') : '<p class="empty">Keine Checklisten erfasst</p>';
    
    // Generate photos HTML (embedded as base64) with individual sizes
    const photosHtml = photos.length > 0 ? `
      <div class="photos-container">
        ${photos.map(photo => {
          const size = (photo as any).pdf_size || 'medium';
          let sizeClass = 'photo-medium'; // default: 2 pro Zeile
          if (size === 'small') sizeClass = 'photo-small'; // 3 pro Zeile
          if (size === 'large') sizeClass = 'photo-large'; // 1 pro Zeile
          if (size === 'full') sizeClass = 'photo-large'; // full wird zu large (verhindert Abschneiden)
          
          // Generate annotation SVG overlay if annotations exist
          let annotationSvg = '';
          if ((photo as any).annotations) {
            try {
              const annotationData = JSON.parse((photo as any).annotations);
              if (annotationData.paths && annotationData.paths.length > 0) {
                const canvasWidth = annotationData.canvasWidth || 400;
                const canvasHeight = annotationData.canvasHeight || 300;
                
                // Build SVG paths for annotations
                const svgPaths = annotationData.paths.map((p: any) => 
                  `<path d="${p.path}" stroke="${p.color || '#FF0000'}" stroke-width="${p.strokeWidth || 3}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`
                ).join('');
                
                annotationSvg = `<svg class="photo-annotations" viewBox="0 0 ${canvasWidth} ${canvasHeight}" preserveAspectRatio="xMidYMid slice">${svgPaths}</svg>`;
              }
            } catch (e) {
              console.error('Error parsing photo annotations:', e);
            }
          }
          
          return `
            <div class="photo-item ${sizeClass}">
              <div class="photo-wrapper">
                <img src="${photo.image_data}" alt="Foto" />
                ${annotationSvg}
              </div>
              ${photo.description ? `<p>${photo.description}</p>` : ''}
            </div>
          `;
        }).join('')}
      </div>
    ` : '<p class="empty">Keine Fotos erfasst</p>';
    
    // Generate sketches HTML (embedded as base64/SVG) with size options
    const sketchesHtml = sketches.length > 0 ? `
      <div class="sketches-container">
        ${sketches.map(sketch => {
          // Read pdf_size from sketch object or metadata
          let size = (sketch as any).pdf_size || 'large';
          if (!size || size === 'large') {
            // Try to read from metadata
            try {
              const metadata = sketch.metadata ? JSON.parse(sketch.metadata) : {};
              if (metadata.pdf_size) {
                size = metadata.pdf_size;
              }
            } catch (e) {}
          }
          let sizeClass = 'sketch-large';
          if (size === 'small') sizeClass = 'sketch-small';
          if (size === 'medium') sizeClass = 'sketch-medium';
          if (size === 'full') sizeClass = 'sketch-full';
          return `
            <div class="sketch-item ${sizeClass}">
              ${sketch.sketch_data ? `<img src="${sketch.sketch_data}" alt="Skizze" />` : '<div class="sketch-placeholder">Skizze</div>'}
              ${sketch.title ? `<p>${sketch.title}</p>` : ''}
            </div>
          `;
        }).join('')}
      </div>
    ` : '<p class="empty">Keine Skizzen erfasst</p>';
    
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
              padding: 20px !important;
            }
            .page {
              background: #fff;
              width: 210mm;
              min-height: 297mm;
              padding: 15mm;
              margin: 0 auto 20px auto;
              box-shadow: 0 4px 12px rgba(0,0,0,0.15);
              border-radius: 2px;
              position: relative;
            }
            /* Visuelle Seitenmarkierung alle 297mm */
            .page::after {
              content: '';
              position: absolute;
              left: 0;
              right: 0;
              top: 297mm;
              height: 2px;
              background: repeating-linear-gradient(90deg, #ccc 0, #ccc 10px, transparent 10px, transparent 20px);
            }
            .page-break {
              display: none;
            }
            .new-page {
              background: #fff;
              width: 210mm;
              min-height: 297mm;
              padding: 15mm;
              margin: 20px auto;
              box-shadow: 0 4px 12px rgba(0,0,0,0.15);
              border-radius: 2px;
              position: relative;
            }
            .new-page::after {
              content: '';
              position: absolute;
              left: 0;
              right: 0;
              top: 297mm;
              height: 2px;
              background: repeating-linear-gradient(90deg, #ccc 0, #ccc 10px, transparent 10px, transparent 20px);
            }
          }
          @media print {
            body {
              background: #fff !important;
              padding: 0 !important;
            }
            .page, .new-page {
              width: auto;
              min-height: auto;
              padding: 0;
              margin: 0;
              box-shadow: none;
              border-radius: 0;
            }
            .new-page {
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
          }
          * {
            box-sizing: border-box;
          }
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            font-size: 11px;
            line-height: 1.4;
            color: #333;
            margin: 0;
            padding: 15px;
            background: #fff;
          }
          .header {
            background: linear-gradient(135deg, #1976d2, #1565c0);
            color: white;
            padding: 15px 20px;
            margin: -15mm -15mm 20px -15mm;
            display: flex;
            flex-direction: column;
            gap: 15px;
          }
          .header-top {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            width: 100%;
          }
          .header h1 {
            margin: 0;
            font-size: 20px;
            font-weight: 600;
          }
          .header .date {
            font-size: 11px;
            opacity: 0.9;
            margin-top: 4px;
          }
          .company-info {
            text-align: right;
            font-size: 10px;
            max-width: 200px;
            word-wrap: break-word;
          }
          h2 {
            color: #1976d2;
            border-bottom: 2px solid #1976d2;
            padding-bottom: 5px;
            margin-top: 25px;
            margin-bottom: 15px;
            font-size: 14px;
            page-break-after: avoid;
            page-break-inside: avoid;
          }
          /* Sektionen zusammenhalten */
          .section-with-header {
            page-break-inside: avoid;
          }
          /* Ensure Skizzen header stays with sketches */
          .sketches-section {
            page-break-inside: avoid;
          }
          .sketches-section h2 {
            page-break-after: avoid;
            margin-bottom: 10px;
          }
          .sketches-section .sketches-container {
            page-break-before: avoid;
          }
          /* Fotos Sektion */
          .photos-section {
            page-break-inside: avoid;
          }
          .photos-section h2 {
            page-break-after: avoid;
          }
          /* Bemerkungen Sektion */
          .remarks-section {
            page-break-inside: avoid;
          }
          .remarks-section h2 {
            page-break-after: avoid;
          }
          /* Checklisten Sektion */
          .checklists-section h2 {
            page-break-after: avoid;
          }
          /* Dachflächen Sektion */
          .roofs-section h2 {
            page-break-after: avoid;
          }
          h3 {
            color: #333;
            margin-top: 15px;
            margin-bottom: 10px;
            font-size: 13px;
            page-break-after: avoid;
          }
          h4 {
            color: #1976d2;
            margin: 10px 0 5px 0;
            font-size: 12px;
          }
          .info-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 20px;
            margin-bottom: 20px;
          }
          .info-box {
            background: #f8f9fa;
            border: 1px solid #e0e0e0;
            border-radius: 6px;
            padding: 12px;
          }
          .info-box h3 {
            margin-top: 0;
            color: #1976d2;
            font-size: 12px;
            border-bottom: 1px solid #e0e0e0;
            padding-bottom: 5px;
            margin-bottom: 8px;
          }
          .info-row {
            display: flex;
            margin-bottom: 4px;
          }
          .info-label {
            font-weight: 600;
            width: 80px;
            flex-shrink: 0;
            color: #666;
          }
          .info-value {
            flex: 1;
          }
          .stats-grid {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 15px;
            margin-bottom: 25px;
          }
          .stat-box {
            background: #e3f2fd;
            border-radius: 8px;
            padding: 15px;
            text-align: center;
          }
          .stat-value {
            font-size: 24px;
            font-weight: 700;
            color: #1976d2;
          }
          .stat-label {
            font-size: 10px;
            color: #666;
            text-transform: uppercase;
            letter-spacing: 0.5px;
          }
          .roof-card, .checklist-card {
            background: #f8f9fa;
            border: 1px solid #e0e0e0;
            border-radius: 6px;
            padding: 12px;
            margin-bottom: 10px;
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
          /* New checklist PDF styles */
          .checklist-main-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding-bottom: 8px;
            border-bottom: 2px solid #1976d2;
            margin-bottom: 12px;
          }
          .checklist-main-title {
            font-size: 16px;
            font-weight: 700;
            color: #1976d2;
          }
          .checklist-main-count {
            font-size: 12px;
            color: #4caf50;
            font-weight: 600;
          }
          /* Grid container for categories - configurable columns */
          .pdf-categories-grid {
            display: block;
          }
          .pdf-categories-grid::after {
            content: "";
            display: table;
            clear: both;
          }
          .pdf-category-section {
            background: #f9f9f9;
            border: 1px solid #e0e0e0;
            border-radius: 6px;
            padding: 10px;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            -webkit-column-break-inside: avoid !important;
            box-sizing: border-box;
            margin-bottom: 12px;
          }
          /* Spalten-Layout basierend auf Einstellung */
          .pdf-category-section.cols-1 {
            width: 100%;
          }
          .pdf-category-section.cols-2 {
            width: calc(50% - 6px);
            float: left;
            margin-right: 12px;
          }
          .pdf-category-section.cols-2:nth-child(2n) {
            margin-right: 0;
          }
          .pdf-category-section.cols-3 {
            width: calc(33.33% - 8px);
            float: left;
            margin-right: 12px;
          }
          .pdf-category-section.cols-3:nth-child(3n) {
            margin-right: 0;
          }
          .pdf-category-header {
            display: flex;
            align-items: center;
            gap: 6px;
            padding-bottom: 6px;
            border-bottom: 2px solid #4caf50;
            margin-bottom: 8px;
          }
          .pdf-cat-check {
            color: #4caf50;
            font-weight: bold;
            font-size: 11px;
          }
          .pdf-category-title {
            font-size: 11px;
            font-weight: 700;
            color: #333;
            flex: 1;
          }
          .pdf-category-count {
            font-size: 9px;
            color: #4caf50;
            font-weight: 600;
          }
          .pdf-category-note {
            background: #fff8e1;
            padding: 4px 6px;
            border-radius: 3px;
            font-size: 9px;
            color: #f57c00;
            font-style: italic;
            margin-bottom: 6px;
          }
          .pdf-category-measurements {
            background: #e3f2fd;
            padding: 4px 6px;
            border-radius: 3px;
            margin-bottom: 6px;
          }
          .pdf-measurement-line {
            font-size: 9px;
            color: #1565c0;
            font-weight: 500;
            margin-bottom: 2px;
          }
          .pdf-measurement-sum {
            margin-top: 4px;
            padding-top: 4px;
            border-top: 1px solid #90caf9;
            font-size: 9px;
            color: #1565c0;
          }
          .pdf-sum-badge {
            background: #bbdefb;
            padding: 2px 6px;
            border-radius: 8px;
            font-weight: 600;
            margin-left: 4px;
          }
          .pdf-level1-grid {
            display: grid;
            grid-template-columns: 1fr;
            gap: 6px;
          }
          .pdf-level1-container {
            background: #fff;
            border: 1px solid #e0e0e0;
            border-left: 3px solid #1976d2;
            border-radius: 4px;
            padding: 6px;
            box-sizing: border-box;
          }
          .pdf-level1-header {
            display: flex;
            align-items: center;
            gap: 4px;
            padding-bottom: 4px;
            border-bottom: 1px solid #eee;
            margin-bottom: 4px;
          }
          .pdf-level1-prefix {
            background: #1976d2;
            color: #fff;
            font-size: 9px;
            font-weight: 700;
            padding: 1px 4px;
            border-radius: 3px;
          }
          .pdf-checkmark-circle {
            color: #4caf50;
            font-size: 10px;
          }
          .pdf-level1-title {
            font-size: 10px;
            font-weight: 600;
            color: #333;
            flex: 1;
          }
          .pdf-level1-content {
            padding-left: 2px;
          }
          .pdf-deep-sub {
            display: flex;
            align-items: center;
            gap: 3px;
            padding: 1px 0;
          }
          .pdf-deep-prefix {
            font-size: 9px;
            color: #666;
            font-weight: 600;
            min-width: 24px;
          }
          .pdf-checkmark {
            color: #4caf50;
            font-size: 9px;
          }
          .pdf-deep-text {
            font-size: 9px;
            color: #444;
            flex: 1;
          }
          .pdf-note {
            background: #fff8e1;
            padding: 3px 5px;
            border-radius: 3px;
            font-size: 8px;
            color: #f57c00;
            font-style: italic;
            margin-top: 2px;
            margin-bottom: 2px;
          }
          .pdf-note-icon {
            margin-right: 2px;
          }
          .pdf-measurement {
            background: #e3f2fd;
            padding: 3px 5px;
            border-radius: 3px;
            font-size: 8px;
            color: #1565c0;
            font-weight: 500;
            margin-top: 2px;
            margin-bottom: 2px;
          }
          .photos-grid, .sketches-grid {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 15px;
          }
          /* Flexible photo/sketch containers */
          .photos-container, .sketches-container {
            display: block;
          }
          .photos-container::after, .sketches-container::after {
            content: "";
            display: table;
            clear: both;
          }
          /* Photo sizes */
          .photo-small {
            width: calc(33.33% - 10px);
            float: left;
            margin-right: 15px;
            margin-bottom: 15px;
          }
          .photo-medium {
            width: calc(50% - 10px);
            float: left;
            margin-right: 15px;
            margin-bottom: 15px;
          }
          .photo-large {
            width: 100%;
            margin-bottom: 15px;
          }
          .photo-full {
            width: 100%;
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
          }
          .photo-annotations {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            pointer-events: none;
          }
          /* Sketch sizes */
          .sketch-small {
            width: calc(33.33% - 10px);
            float: left;
            margin-right: 15px;
            margin-bottom: 15px;
          }
          .sketch-medium {
            width: calc(50% - 10px);
            float: left;
            margin-right: 15px;
            margin-bottom: 15px;
          }
          .sketch-large {
            width: 100%;
            margin-bottom: 15px;
          }
          .sketch-full {
            width: 100%;
            margin-bottom: 15px;
          }
          .photo-item, .sketch-item {
            border: 1px solid #e0e0e0;
            border-radius: 6px;
            overflow: hidden;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            -webkit-column-break-inside: avoid !important;
          }
          /* All images fill their container width */
          .photo-item img, .sketch-item img {
            display: block;
            width: 100%;
            height: auto;
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
            border-radius: 6px;
            padding: 12px;
            margin-top: 10px;
          }
          .footer {
            margin-top: 30px;
            padding-top: 15px;
            border-top: 2px solid #1976d2;
            font-size: 11px;
            color: #666;
            text-align: center;
            font-weight: 500;
          }
          .page-break {
            page-break-before: always;
          }
          .measurements-grid {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 5px;
            margin-top: 8px;
          }
          .measure-item {
            font-size: 11px;
          }
          .measure-label {
            color: #666;
          }
          .roof-area {
            font-size: 14px;
            color: #1976d2;
            margin-bottom: 5px;
          }
          .roof-notes {
            margin-top: 8px;
            padding-top: 8px;
            border-top: 1px dashed #e0e0e0;
          }
          .company-header {
            display: flex;
            align-items: center;
            gap: 15px;
          }
          .company-logo {
            max-width: 180px;
            max-height: 130px;
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
                ${companyPhone ? `<br/>Tel: ${companyPhone}` : ''}
                ${companyEmail ? `<br/>${companyEmail}` : ''}
              </div>
            ` : ''}
          </div>
        </div>
        
        <h2>Projektübersicht</h2>
        <div class="info-grid">
          <div class="info-box">
            <h3>Projekt</h3>
            <div class="info-row">
              <span class="info-label">Name:</span>
              <span class="info-value">${project?.name || '-'}</span>
            </div>
            ${project?.description ? `
              <div class="info-row">
                <span class="info-label">Beschreibung:</span>
                <span class="info-value">${project.description}</span>
              </div>
            ` : ''}
            <div class="info-row">
              <span class="info-label">Status:</span>
              <span class="info-value">${project?.status === 'active' ? 'Aktiv' : project?.status === 'completed' ? 'Abgeschlossen' : 'Abgebrochen'}</span>
            </div>
            ${(objektStreet || objektPlz || objektCity || objektName) ? `
              <div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid #e0e0e0;">
                <strong style="color: #1976d2;">Objektadresse</strong>
                ${objektName ? `<div style="margin-top: 4px;">${objektName}</div>` : ''}
                <div style="margin-top: 2px;">${objektStreet || bauherrStreet}</div>
                <div>${objektPlz || bauherrPlz} ${objektCity || bauherrCity}</div>
              </div>
            ` : ''}
          </div>
          
          <div class="info-box">
            <h3>Bauherr</h3>
            <div class="info-row">
              <span class="info-label">Name:</span>
              <span class="info-value">${bauherrName}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Adresse:</span>
              <span class="info-value">${bauherrStreet}<br/>${bauherrPlz} ${bauherrCity}</span>
            </div>
            ${bauherrPhone ? `
              <div class="info-row">
                <span class="info-label">Telefon:</span>
                <span class="info-value">${bauherrPhone}</span>
              </div>
            ` : ''}
            ${bauherrMobile ? `
              <div class="info-row">
                <span class="info-label">Mobil:</span>
                <span class="info-value">${bauherrMobile}</span>
              </div>
            ` : ''}
            ${bauherrEmail ? `
              <div class="info-row">
                <span class="info-label">E-Mail:</span>
                <span class="info-value">${bauherrEmail}</span>
              </div>
            ` : ''}
          </div>
        </div>
        
        <div class="stats-grid">
          <div class="stat-box">
            <div class="stat-value">${roofs.length}</div>
            <div class="stat-label">Dachflächen</div>
          </div>
          <div class="stat-box">
            <div class="stat-value">${pdfTotalArea.toFixed(2)} m²</div>
            <div class="stat-label">Gesamtfläche</div>
          </div>
          <div class="stat-box">
            <div class="stat-value">${photos.length}</div>
            <div class="stat-label">Fotos</div>
          </div>
        </div>
        
        <div class="roofs-section">
          <h2>Dachflächen</h2>
          ${roofsHtml}
        </div>
        
        <div class="checklists-section">
          <h2>Checklisten</h2>
          ${checklistsHtml}
        </div>
        </div><!-- end .page -->
        
        ${photos.length > 0 ? `
          <div class="new-page">
            <div class="photos-section">
              <h2>Fotos</h2>
              ${photosHtml}
            </div>
          </div>
        ` : ''}
        
        ${sketches.length > 0 ? `
          <div class="new-page">
            <div class="sketches-section">
              <h2>Skizzen</h2>
              ${sketchesHtml}
            </div>
            ${!remarks ? `
              <div class="footer" style="margin-top: 30px;">
                Erstellt mit AUFMASSPROFI DACH • ${formatDate(new Date().toISOString())}
              </div>
            ` : ''}
          </div>
        ` : ''}
        
        ${remarks ? `
          <div class="new-page remarks-page">
            <div class="remarks-section">
              <h2>Bemerkungen</h2>
              <div class="remarks-box">
                ${remarks.replace(/\n/g, '<br/>')}
              </div>
            </div>
            <div class="footer">
              Erstellt mit AUFMASSPROFI DACH • ${formatDate(new Date().toISOString())}
            </div>
          </div>
        ` : (!sketches.length && !photos.length ? `
          <div class="footer" style="margin-top: 30px;">
            Erstellt mit AUFMASSPROFI DACH • ${formatDate(new Date().toISOString())}
          </div>
        ` : '')}
      </body>
      </html>
    `;
    
    return html;
  };

  // Show PDF options dialog
  const exportToPDF = async () => {
    Alert.alert(
      'PDF Export',
      'Was möchten Sie tun?',
      [
        {
          text: 'Vorschau anzeigen',
          onPress: async () => {
            try {
              setIsGeneratingPdf(true);
              const html = await generatePdfHtml();
              setPdfHtmlContent(html);
              setShowPdfPreviewModal(true);
            } catch (error) {
              console.error('Error generating preview:', error);
              Alert.alert('Fehler', 'Vorschau konnte nicht erstellt werden.');
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
          text: 'In Dateien speichern',
          onPress: () => generateAndSavePdf(),
        },
        { text: 'Abbrechen', style: 'cancel' },
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
      
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(uri, {
          mimeType: 'application/pdf',
          dialogTitle: `Aufmaß ${project?.name} teilen`,
          UTI: 'com.adobe.pdf',
        });
      } else {
        Alert.alert('Fehler', 'Teilen ist auf diesem Gerät nicht verfügbar.');
      }
    } catch (error) {
      console.error('Error sharing PDF:', error);
      Alert.alert('Fehler', 'PDF konnte nicht erstellt werden.');
    } finally {
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
      
      // Share the file directly - iOS will show "Save to Files" option
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(uri, {
          mimeType: 'application/pdf',
          dialogTitle: 'PDF speichern',
          UTI: 'com.adobe.pdf',
        });
      } else {
        Alert.alert('Fehler', 'Teilen ist auf diesem Gerät nicht verfügbar.');
      }
    } catch (error) {
      console.error('Error saving PDF:', error);
      Alert.alert('Fehler', 'PDF konnte nicht gespeichert werden.');
    } finally {
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
      
      // Use native print which allows sharing
      await Print.printAsync({
        html: html,
      });
    } catch (error) {
      console.error('Error sharing PDF from preview:', error);
      Alert.alert('Fehler', 'PDF konnte nicht erstellt werden.');
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
      
      // Use native print which allows saving
      await Print.printAsync({
        html: html,
      });
    } catch (error) {
      console.error('Error saving PDF from preview:', error);
      Alert.alert('Fehler', 'PDF konnte nicht gespeichert werden.');
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
            dialogTitle: 'Aufmaß-Vorschau teilen',
          });
        } else {
          Alert.alert('Fehler', 'Teilen ist auf diesem Gerät nicht verfügbar.');
        }
      } else {
        Alert.alert('Fehler', 'Screenshot konnte nicht erstellt werden.');
      }
    } catch (error) {
      console.error('Error sharing image:', error);
      Alert.alert('Fehler', 'Bild konnte nicht erstellt werden.');
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
          { text: 'Abbrechen', style: 'cancel' },
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
      Alert.alert('Fehler', 'Ein unerwarteter Fehler ist aufgetreten');
    }
  };

  const shareProject = async () => {
    // Share project with PDF or text
    try {
      Alert.alert(
        'Projekt teilen',
        'Wie möchten Sie das Projekt teilen?',
        [
          { 
            text: 'Nur Text', 
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
          { text: 'Abbrechen', style: 'cancel' },
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
      
      // Share the file
      await Sharing.shareAsync(fileUri, {
        mimeType: 'application/json',
        dialogTitle: 'Projekt speichern',
      });
      
    } catch (error: any) {
      console.error('Export error:', error);
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
        Alert.alert('Export Fehler', 'Export nicht möglich');
      }
    } finally {
      setIsGeneratingPdf(false);
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
        <TouchableOpacity style={styles.actionButton} onPress={exportProjectFile}>
          <Ionicons name="cloud-upload" size={20} color="#1976d2" />
          <Text style={styles.actionButtonText}>Export</Text>
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
                      note: item.note,
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
                          {/* Kategorie-Überschrift (außerhalb der Container) */}
                          <View style={styles.categorySectionHeader}>
                            <Ionicons name="checkbox" size={18} color="#4caf50" />
                            <Text style={styles.categorySectionTitle}>{category.text}</Text>
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
                            <View style={styles.level1Grid}>
                              {checkedLevel1Items.map((level1Item: any, l1Index: number) => {
                                // Finde den Original-Index für korrekte Nummerierung
                                const originalIndex = level1Items.indexOf(level1Item);
                                const containerPrefix = `${catIndex + 1}.${originalIndex + 1}`;
                                
                                // Tiefere Unterpunkte für diesen Container
                                const deepSubItems = level1Item.subItems 
                                  ? flattenDeepSubItems(level1Item.subItems, containerPrefix)
                                  : [];
                                
                                return (
                                  <View key={`l1-${catIndex}-${l1Index}`} style={styles.level1Container}>
                                    {/* Container-Überschrift (z.B. 1.1 Test 1.1) */}
                                    <View style={styles.level1Header}>
                                      <Text style={styles.level1Prefix}>{containerPrefix}</Text>
                                      <Ionicons name="checkmark-circle" size={14} color="#4caf50" />
                                      <Text style={styles.level1Title} numberOfLines={2}>{level1Item.text}</Text>
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
                    {/* Hauptüberschrift - prominent hervorgehoben */}
                    <View style={styles.checklistMainHeader}>
                      <Text style={styles.checklistMainTitle}>{checklist.template_name}</Text>
                      <View style={styles.headerRight}>
                        <View style={styles.checkedBadge}>
                          <Text style={styles.checkedBadgeText}>
                            {checkedCount} von {totalCount}
                          </Text>
                        </View>
                        <Ionicons name="chevron-forward" size={20} color="#1976d2" />
                      </View>
                    </View>
                    
                    {/* Kategorie-Container Grid */}
                    {renderCategoryContainers(checklist.items)}
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
            <Text style={styles.pdfPreviewTitle}>PDF Vorschau</Text>
            <View style={{ width: 40 }} />
          </View>
          
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
                  <Text style={styles.pdfPreviewActionText}>Als Bild teilen</Text>
                </>
              )}
            </TouchableOpacity>
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
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  level1Container: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 10,
    minWidth: '48%',
    maxWidth: '100%',
    flexGrow: 1,
    flexShrink: 0,
    flexBasis: '48%',
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
    paddingTop: 50,
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
});

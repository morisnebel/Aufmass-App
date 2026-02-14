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
    
    // Generate checklists HTML with recursive sub-items
    const renderChecklistItems = (items: any[], depth: number = 0): string => {
      return items.map(item => {
        const indent = depth * 20;
        const icon = item.checked ? '☑' : '☐';
        let html = `<div style="margin-left: ${indent}px; margin-bottom: 4px;">
          <span style="color: ${item.checked ? '#4caf50' : '#666'};">${icon}</span> ${item.text}
          ${item.note ? `<div style="font-size: 10px; color: #666; margin-left: 20px;">📝 ${item.note}</div>` : ''}
        </div>`;
        if (item.subItems && item.subItems.length > 0) {
          html += renderChecklistItems(item.subItems, depth + 1);
        }
        return html;
      }).join('');
    };
    
    const checklistsHtml = checklists.length > 0 ? checklists.map(checklist => `
      <div class="checklist-card">
        <h4>${checklist.template_name}</h4>
        ${renderChecklistItems(checklist.items)}
      </div>
    `).join('') : '<p class="empty">Keine Checklisten erfasst</p>';
    
    // Generate photos HTML (embedded as base64) with individual sizes
    const photosHtml = photos.length > 0 ? `
      <div class="photos-container">
        ${photos.map(photo => {
          const size = (photo as any).pdf_size || 'medium';
          let sizeClass = 'photo-medium'; // default: 2 pro Zeile
          if (size === 'small') sizeClass = 'photo-small'; // 3 pro Zeile
          if (size === 'large') sizeClass = 'photo-large'; // 1 pro Zeile
          if (size === 'full') sizeClass = 'photo-full'; // volle Breite
          return `
            <div class="photo-item ${sizeClass}">
              <img src="${photo.image_data}" alt="Foto" />
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
          const size = (sketch as any).pdf_size || 'large'; // Skizzen default groß
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
            margin: -15px -15px 20px -15px;
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
          }
          h3 {
            color: #333;
            margin-top: 15px;
            margin-bottom: 10px;
            font-size: 13px;
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
            page-break-inside: avoid;
          }
          .roof-card h4, .checklist-card h4 {
            margin-top: 0;
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
          }
          /* Photo sizes */
          .photo-small {
            width: calc(33.33% - 10px);
          }
          .photo-medium {
            width: calc(50% - 10px);
          }
          .photo-large {
            width: 100%;
          }
          .photo-full {
            width: 100%;
          }
          /* Sketch sizes */
          .sketch-small {
            width: calc(33.33% - 10px);
          }
          .sketch-medium {
            width: calc(50% - 10px);
          }
          .sketch-large {
            width: 100%;
          }
          .sketch-full {
            width: 100%;
          }
          .photo-item, .sketch-item {
            border: 1px solid #e0e0e0;
            border-radius: 6px;
            overflow: hidden;
            page-break-inside: avoid;
          }
          /* All images fill their container width */
          .photo-item img, .sketch-item img {
            display: block;
            width: 100%;
            height: auto;
            background: #f5f5f5;
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
            border-top: 1px solid #e0e0e0;
            font-size: 9px;
            color: #999;
            text-align: center;
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
            max-width: 120px;
            max-height: 90px;
            object-fit: contain;
          }
        </style>
      </head>
      <body>
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
        
        <h2>Dachflächen</h2>
        ${roofsHtml}
        
        <h2>Checklisten</h2>
        ${checklistsHtml}
        
        ${project?.remarks ? `
          <h2>Bemerkungen</h2>
          <div class="remarks-box">
            ${project.remarks.replace(/\n/g, '<br/>')}
          </div>
        ` : ''}
        
        ${photos.length > 0 ? `
          <div class="page-break"></div>
          <h2>Fotos</h2>
          ${photosHtml}
        ` : ''}
        
        ${sketches.length > 0 ? `
          <div class="page-break"></div>
          <h2>Skizzen</h2>
          ${sketchesHtml}
        ` : ''}
        
        <div class="footer">
          Erstellt mit AUFMASSPROFI DACH • ${formatDate(new Date().toISOString())}
        </div>
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
    if (!pdfHtmlContent) {
      Alert.alert('Fehler', 'Keine Vorschau verfügbar.');
      return;
    }
    
    try {
      // Close modal first
      setShowPdfPreviewModal(false);
      
      // Small delay to let modal close
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Use native print which allows sharing
      await Print.printAsync({
        html: pdfHtmlContent,
      });
    } catch (error) {
      console.error('Error sharing PDF from preview:', error);
      Alert.alert('Fehler', 'PDF konnte nicht erstellt werden.');
    }
  };

  // Save PDF from preview - same as share (iOS shows save option in print dialog)
  const savePdfFromPreview = async () => {
    if (!pdfHtmlContent) {
      Alert.alert('Fehler', 'Keine Vorschau verfügbar.');
      return;
    }
    
    try {
      // Close modal first
      setShowPdfPreviewModal(false);
      
      // Small delay to let modal close
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Use native print which allows saving
      await Print.printAsync({
        html: pdfHtmlContent,
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

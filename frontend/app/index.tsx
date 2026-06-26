import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Alert,
  RefreshControl,
  Image,
  TextInput,
  ScrollView,
  Platform,
  useWindowDimensions,
} from 'react-native';

import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { ProjectService, CustomerService, RoofService, PhotoService, SketchService, ChecklistService, MachineMasterService, MachineMaster, MaterialMasterService, MaterialMaster, Project, Customer } from '../services/LocalStorage';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { readAsStringAsync, writeAsStringAsync, cacheDirectory } from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Features, AppName, getProStatus, loadProStatus } from '../services/FeatureFlags';
import { useTranslation } from 'react-i18next';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Status-Optionen
const STATUS_OPTIONS = [
  { key: 'all', labelKey: 'home.allProjects', icon: 'folder-outline' },
  { key: 'aktiv', labelKey: 'home.active', icon: 'play-circle-outline', color: '#4caf50' },
  { key: 'abgeschlossen', labelKey: 'home.completed', icon: 'checkmark-circle-outline', color: '#2196f3' },
  { key: 'abgebrochen', labelKey: 'home.cancelled', icon: 'close-circle-outline', color: '#f44336' },
];

export default function HomeScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  // iPhone hat typisch < 500px Breite (kürzere Seite), iPad >= 768px
  const isPhoneDevice = Math.min(screenWidth, screenHeight) < 500;
  const isLandscape = screenWidth > screenHeight;
  const isPhoneLandscape = isPhoneDevice && isLandscape;
  
  const [projects, setProjects] = useState<Project[]>([]);
  const [customers, setCustomers] = useState<{ [key: string]: Customer }>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [activeFilter, setActiveFilter] = useState('all');
  const [sortBy, setSortBy] = useState<'date_desc' | 'date_asc' | 'name_asc' | 'name_desc' | 'status'>('date_desc');
  const [customerSearchQuery, setCustomerSearchQuery] = useState('');
  
  // Letzten Filter aus AsyncStorage laden
  useEffect(() => {
    AsyncStorage.getItem('lastActiveFilter').then(saved => {
      if (saved && ['all', 'aktiv', 'abgeschlossen', 'abgebrochen'].includes(saved)) {
        setActiveFilter(saved);
      }
    }).catch(() => {});
  }, []);

  // Filter-Änderung speichern
  const handleFilterChange = useCallback((key: string) => {
    setActiveFilter(key);
    AsyncStorage.setItem('lastActiveFilter', key).catch(() => {});
  }, []);
  // Multi-Select Mode
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedProjects, setSelectedProjects] = useState<Set<string>>(new Set());
  const [isProcessing, setIsProcessing] = useState(false);
  // Pro-Banner: Ausgeliehene Maschinen, Inspektionen, TÜV & niedriger Lagerbestand
  const [loanedMachines, setLoanedMachines] = useState<MachineMaster[]>([]);
  const [inspectionMachines, setInspectionMachines] = useState<MachineMaster[]>([]);
  const [tuvMachines, setTuvMachines] = useState<MachineMaster[]>([]);
  const [lowStockMaterials, setLowStockMaterials] = useState<MaterialMaster[]>([]);
  const [expandedBanner, setExpandedBanner] = useState<'loaned' | 'inspection' | 'tuv' | 'lowstock' | null>(null);
  const [isProUser, setIsProUser] = useState<boolean>(getProStatus());

  const loadData = async () => {
    try {
      const [projectsData, customersData] = await Promise.all([
        ProjectService.getAll(),
        CustomerService.getAll(),
      ]);

      setProjects(projectsData);
      
      const customerMap: { [key: string]: Customer } = {};
      customersData.forEach((customer: Customer) => {
        customerMap[customer.id] = customer;
      });
      setCustomers(customerMap);

      // Ausgeliehene & Inspektion-fällige Maschinen laden (nur Pro)
      const proStatus = await loadProStatus();
      setIsProUser(proStatus);
      if (proStatus) {
        try {
          const allMachines = await MachineMasterService.getAll();
          setLoanedMachines(allMachines.filter(m => m.status === 'ausgeliehen'));
          // Inspektion fällig: nächste_inspektion innerhalb 30 Tagen oder überfällig
          const now = Date.now();
          const warnMs = 30 * 24 * 60 * 60 * 1000;
          const inspect = allMachines.filter(m => {
            if (!m.next_inspection_date) return false;
            const due = new Date(m.next_inspection_date).getTime();
            return !isNaN(due) && (due - now) <= warnMs;
          }).sort((a, b) => {
            const da = new Date(a.next_inspection_date!).getTime();
            const db = new Date(b.next_inspection_date!).getTime();
            return da - db;
          });
          setInspectionMachines(inspect);
          // TÜV fällig: nächster TÜV innerhalb 30 Tagen oder überfällig
          const tuv = allMachines.filter(m => {
            if (!m.next_tuv_date) return false;
            const due = new Date(m.next_tuv_date).getTime();
            return !isNaN(due) && (due - now) <= warnMs;
          }).sort((a, b) => {
            const da = new Date(a.next_tuv_date!).getTime();
            const db = new Date(b.next_tuv_date!).getTime();
            return da - db;
          });
          setTuvMachines(tuv);
          // Lager-Warnung: Materialien deren Bestand <= low_stock_threshold ist
          try {
            const allMaterials = await MaterialMasterService.getAll();
            const lowStock = allMaterials.filter(m => {
              if (m.stock_quantity == null) return false;
              const threshold = m.low_stock_threshold ?? 5;
              return m.stock_quantity <= threshold;
            }).sort((a, b) => (a.stock_quantity || 0) - (b.stock_quantity || 0));
            setLowStockMaterials(lowStock);
          } catch { /* silent */ }
        } catch { /* silent */ }
      }
    } catch (error) {
      console.error('Error loading data:', error);
      Alert.alert(t('common.error'), t('home.dataLoadError'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [])
  );

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  // === MULTI-SELECT FUNCTIONS ===
  
  // Toggle selection mode
  const toggleSelectionMode = () => {
    if (selectionMode) {
      // Exit selection mode
      setSelectionMode(false);
      setSelectedProjects(new Set());
    } else {
      // Enter selection mode
      setSelectionMode(true);
    }
  };
  
  // Toggle project selection
  const toggleProjectSelection = (projectId: string) => {
    setSelectedProjects(prev => {
      const newSet = new Set(prev);
      if (newSet.has(projectId)) {
        newSet.delete(projectId);
      } else {
        newSet.add(projectId);
      }
      return newSet;
    });
  };
  
  // Select all visible projects
  const selectAllProjects = () => {
    const allIds = new Set(filteredProjects.map(p => p.id));
    setSelectedProjects(allIds);
  };
  
  // Deselect all
  const deselectAllProjects = () => {
    setSelectedProjects(new Set());
  };
  
  // Export selected projects
  const exportSelectedProjects = async () => {
    if (selectedProjects.size === 0) {
      Alert.alert(t('common.note'), t('home.selectAtLeastOne'));
      return;
    }
    
    setIsProcessing(true);
    try {
      const exportDataArray = [];
      
      for (const projectId of selectedProjects) {
        const project = projects.find(p => p.id === projectId);
        if (!project) continue;
        
        const customer = customers[project.customer_id];
        const [roofs, photos, sketches, checklists] = await Promise.all([
          RoofService.getByProjectId(projectId),
          PhotoService.getByProjectId(projectId),
          SketchService.getByProjectId(projectId),
          ChecklistService.getByProjectId(projectId),
        ]);
        
        exportDataArray.push({
          version: '1.0',
          exportDate: new Date().toISOString(),
          project,
          customer: customer || {},
          roofs: roofs || [],
          photos: photos || [],
          sketches: sketches || [],
          checklists: checklists || [],
        });
      }
      
      // Create combined export file
      const combinedExport = {
        version: '1.0',
        exportDate: new Date().toISOString(),
        projectCount: exportDataArray.length,
        projects: exportDataArray,
      };
      
      const jsonString = JSON.stringify(combinedExport, null, 2);
      const timestamp = new Date().toISOString().slice(0, 10);
      const fileUri = `${cacheDirectory}Projekte_${timestamp}_${selectedProjects.size}.aufmass`;
      
      await writeAsStringAsync(fileUri, jsonString);
      
      setIsProcessing(false);
      
      await Sharing.shareAsync(fileUri, {
        mimeType: 'application/json',
        dialogTitle: `${selectedProjects.size} Projekte exportieren`,
      });
      
      // Exit selection mode after successful export
      setSelectionMode(false);
      setSelectedProjects(new Set());
      
    } catch (error) {
      console.error('Export error:', error);
      setIsProcessing(false);
      Alert.alert(t('common.error'), t('home.exportFailed'));
    }
  };
  
  // Delete selected projects
  const deleteSelectedProjects = async () => {
    if (selectedProjects.size === 0) {
      Alert.alert(t('common.note'), t('home.selectAtLeastOne'));
      return;
    }
    
    Alert.alert(
      t('home.deleteMultiple', { count: selectedProjects.size }),
      t('home.deleteMultipleConfirm', { count: selectedProjects.size }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: async () => {
            setIsProcessing(true);
            try {
              for (const projectId of selectedProjects) {
                await ProjectService.delete(projectId);
              }
              await loadData();
              setSelectionMode(false);
              setSelectedProjects(new Set());
              Alert.alert(t('common.success'), t('home.deletedCount', { count: selectedProjects.size }));
            } catch (error) {
              console.error('Delete error:', error);
              Alert.alert(t('common.error'), t('home.deleteFailed'));
            } finally {
              setIsProcessing(false);
            }
          },
        },
      ]
    );
  };
  
  // Move selected projects to status
  const moveSelectedToStatus = async (newStatus: string) => {
    if (selectedProjects.size === 0) {
      Alert.alert(t('common.note'), t('home.selectAtLeastOne'));
      return;
    }
    
    const statusLabel = newStatus === 'abgeschlossen' ? t('home.markAsCompleted') : (newStatus === 'aktiv' ? t('home.markAsActive') : t('home.markAsCancelled'));
    
    Alert.alert(
      t('home.statusChanged'),
      t('home.statusChangedMessage', { count: selectedProjects.size, status: statusLabel }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.ok'),
          onPress: async () => {
            setIsProcessing(true);
            try {
              for (const projectId of selectedProjects) {
                const project = projects.find(p => p.id === projectId);
                if (project) {
                  await ProjectService.update(projectId, { status: newStatus });
                }
              }
              await loadData();
              setSelectionMode(false);
              setSelectedProjects(new Set());
              Alert.alert(t('common.success'), t('home.movedCount', { count: selectedProjects.size }));
            } catch (error) {
              console.error('Status change error:', error);
              Alert.alert(t('common.error'), t('home.moveFailed'));
            } finally {
              setIsProcessing(false);
            }
          },
        },
      ]
    );
  };

  // Import project from .aufmass file
  const importProjectFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/json', '*/*'],
        copyToCacheDirectory: true,
      });
      
      if (result.canceled || !result.assets || result.assets.length === 0) {
        return;
      }
      
      const file = result.assets[0];
      
      // Accept .aufmass, .json and .txt files
      const fileName = file.name?.toLowerCase() || '';
      if (!fileName.endsWith('.aufmass') && !fileName.endsWith('.json') && !fileName.endsWith('.txt')) {
        Alert.alert(t('common.error'), t('home.importFileError'));
        return;
      }
      
      setLoading(true);
      
      // Read file content
      const content = await readAsStringAsync(file.uri);
      
      // Clean up content - remove truncation markers if present
      let cleanContent = content;
      if (content.includes('... (gekürzt)')) {
        Alert.alert(t('common.error'), t('home.importIncomplete'));
        setLoading(false);
        return;
      }
      
      const importData = JSON.parse(cleanContent);
      
      // Validate import data
      if (!importData.project || !importData.version) {
        Alert.alert(t('common.error'), t('home.importInvalid'));
        setLoading(false);
        return;
      }
      
      // Generate new IDs for imported data
      const generateId = () => Date.now().toString(36) + Math.random().toString(36).substr(2);
      const newProjectId = generateId();
      const now = new Date().toISOString();
      
      // Import customer if exists
      let newCustomerId = importData.project.customer_id;
      if (importData.customer && importData.customer.name) {
        // Always create a new customer for imports to avoid conflicts
        const customerData = {
          ...importData.customer,
          id: undefined,
          created_at: undefined,
          updated_at: undefined,
        };
        delete customerData.id;
        const newCustomer = await CustomerService.create(customerData);
        newCustomerId = newCustomer.id;
      }
      
      // Import project with new ID
      const projectData = {
        ...importData.project,
        name: `${importData.project.name} (Import)`,
        customer_id: newCustomerId,
      };
      delete projectData.id;
      delete projectData.created_at;
      delete projectData.updated_at;
      
      const newProject = await ProjectService.create(projectData);
      
      // Import roofs
      if (importData.roofs && importData.roofs.length > 0) {
        for (const roof of importData.roofs) {
          const roofData = { ...roof, project_id: newProject.id };
          delete roofData.id;
          delete roofData.created_at;
          delete roofData.updated_at;
          await RoofService.create(roofData);
        }
      }
      
      // Import photos
      if (importData.photos && importData.photos.length > 0) {
        for (const photo of importData.photos) {
          const photoData = { ...photo, project_id: newProject.id };
          delete photoData.id;
          delete photoData.created_at;
          delete photoData.updated_at;
          await PhotoService.create(photoData);
        }
      }
      
      // Import sketches
      if (importData.sketches && importData.sketches.length > 0) {
        for (const sketch of importData.sketches) {
          const sketchData = { ...sketch, project_id: newProject.id };
          delete sketchData.id;
          delete sketchData.created_at;
          delete sketchData.updated_at;
          await SketchService.create(sketchData);
        }
      }
      
      // Import checklists
      if (importData.checklists && importData.checklists.length > 0) {
        for (const checklist of importData.checklists) {
          const checklistData = { ...checklist, project_id: newProject.id };
          delete checklistData.id;
          delete checklistData.created_at;
          delete checklistData.updated_at;
          await ChecklistService.create(checklistData);
        }
      }
      
      await loadData();
      Alert.alert(t('common.success'), t('home.importSuccess', { name: importData.project.name }));
      
      // Navigate to the imported project
      router.push(`/projects/${newProject.id}`);
      
    } catch (error) {
      console.error('Error importing project:', error);
      Alert.alert(t('common.error'), t('home.importFailed'));
    } finally {
      setLoading(false);
    }
  };

  const deleteProject = async (projectId: string) => {
    Alert.alert(
      t('home.deleteProject'),
      t('home.deleteProjectConfirm', { name: '' }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              await ProjectService.delete(projectId);
              loadData();
            } catch (error) {
              console.error('Error deleting project:', error);
              Alert.alert(t('common.error'), t('home.deleteError'));
            }
          },
        },
      ]
    );
  };

  // Status ändern
  const changeProjectStatus = async (projectId: string, currentStatus: string) => {
    const statusOptions = ['aktiv', 'abgeschlossen', 'abgebrochen'];
    const buttons = statusOptions.map(status => ({
      text: status.charAt(0).toUpperCase() + status.slice(1),
      onPress: async () => {
        try {
          const project = projects.find(p => p.id === projectId);
          if (project) {
            await ProjectService.update(projectId, { ...project, status });
            loadData();
          }
        } catch (error) {
          console.error('Error updating status:', error);
          Alert.alert(t('common.error'), t('home.statusChangeError'));
        }
      },
      style: status === currentStatus ? 'cancel' : 'default' as const,
    }));
    buttons.push({ text: t('common.cancel'), onPress: () => {}, style: 'cancel' as const });
    
    Alert.alert(
      t('home.statusChanged', 'Status ändern'), 
      t('home.statusChangedMessage', { count: selectedProjects.length, status: '' }) || 'Wählen Sie den neuen Status:', 
      buttons
    );
  };

  // Sortierung ändern
  const changeSortOrder = () => {
    const sortOptions = [
      { key: 'date_desc', labelKey: 'home.sortNewest' },
      { key: 'date_asc', labelKey: 'home.sortOldest' },
      { key: 'name_asc', labelKey: 'home.sortNameAZ' },
      { key: 'name_desc', labelKey: 'home.sortNameZA' },
      { key: 'status', labelKey: 'home.sortByStatus' },
    ];
    
    const buttons = sortOptions.map(option => ({
      text: t(option.labelKey) + (sortBy === option.key ? ' ✓' : ''),
      onPress: () => setSortBy(option.key as typeof sortBy),
      style: sortBy === option.key ? 'cancel' : 'default' as const,
    }));
    buttons.push({ text: t('common.cancel'), onPress: () => {}, style: 'cancel' as const });
    
    Alert.alert(t('common.sortBy'), t('common.selectSort'), buttons);
  };

  // Sortier-Label
  const getSortLabel = () => {
    switch (sortBy) {
      case 'date_desc': return t('home.newestLabel');
      case 'date_asc': return t('home.oldestLabel');
      case 'name_asc': return 'A-Z';
      case 'name_desc': return 'Z-A';
      case 'status': return 'Status';
      default: return t('home.sortLabel');
    }
  };

  // Gefilterte und sortierte Projekte
  const filteredProjects = projects.filter(project => {
    // Status-Filter
    if (activeFilter !== 'all' && project.status !== activeFilter) {
      return false;
    }
    
    // Suchfilter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      const customer = customers[project.customer_id];
      const customerName = customer?.name?.toLowerCase() || '';
      const projectName = project.name?.toLowerCase() || '';
      const description = project.description?.toLowerCase() || '';
      
      return projectName.includes(query) || 
             customerName.includes(query) || 
             description.includes(query);
    }
    
    return true;
  }).sort((a, b) => {
    switch (sortBy) {
      case 'date_desc':
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      case 'date_asc':
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      case 'name_asc':
        return a.name.localeCompare(b.name, 'de');
      case 'name_desc':
        return b.name.localeCompare(a.name, 'de');
      case 'status':
        const statusOrder = { 'aktiv': 0, 'abgeschlossen': 1, 'abgebrochen': 2 };
        return (statusOrder[a.status as keyof typeof statusOrder] || 3) - (statusOrder[b.status as keyof typeof statusOrder] || 3);
      default:
        return 0;
    }
  });

  // Gefilterte Kundenliste für Schnellauswahl
  const filteredCustomerList = Object.values(customers).filter(customer => {
    if (!customerSearchQuery.trim()) return true;
    const query = customerSearchQuery.toLowerCase();
    return customer.name?.toLowerCase().includes(query) ||
           customer.phone?.includes(query) ||
           customer.email?.toLowerCase().includes(query);
  });

  // Status-Farbe ermitteln
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'aktiv': return '#4caf50';
      case 'abgeschlossen': return '#2196f3';
      case 'abgebrochen': return '#f44336';
      default: return '#1976d2';
    }
  };

  const renderProject = ({ item }: { item: Project }) => {
    const customer = customers[item.customer_id];
    const statusColor = getStatusColor(item.status);
    // Kundenname: erst aus Customer, dann aus bauherr_name des Projekts
    const displayCustomerName = customer?.name || (item as any).bauherr_name;
    const customerNumber = customer?.customer_number;
    const isSelected = selectedProjects.has(item.id);
    
    return (
      <TouchableOpacity
        style={[styles.projectCard, isSelected && styles.projectCardSelected]}
        onPress={() => {
          if (selectionMode) {
            toggleProjectSelection(item.id);
          } else {
            router.push(`/projects/${item.id}`);
          }
        }}
        onLongPress={() => {
          if (!selectionMode) {
            setSelectionMode(true);
            toggleProjectSelection(item.id);
          }
        }}
      >
        <View style={styles.projectHeader}>
          {selectionMode ? (
            <TouchableOpacity
              style={styles.checkboxContainer}
              onPress={() => toggleProjectSelection(item.id)}
            >
              <Ionicons 
                name={isSelected ? "checkbox" : "square-outline"} 
                size={26} 
                color={isSelected ? "#1976d2" : "#999"} 
              />
            </TouchableOpacity>
          ) : (
            <Ionicons name="folder" size={24} color={statusColor} />
          )}
          <View style={styles.projectInfo}>
            <View style={styles.projectNameRow}>
              {item.project_number && (
                <Text style={styles.projectNumber}>{item.project_number}</Text>
              )}
              <Text style={styles.projectName}>{item.name}</Text>
            </View>
            {displayCustomerName && (
              <View style={styles.customerNameRow}>
                {customerNumber && (
                  <Text style={styles.customerNumberSmall}>{customerNumber}</Text>
                )}
                <Text style={styles.customerName}>{displayCustomerName}</Text>
              </View>
            )}
          </View>
          {!selectionMode && (
            <TouchableOpacity
              onPress={() => deleteProject(item.id)}
              style={styles.deleteButton}
            >
              <Ionicons name="trash-outline" size={20} color="#f44336" />
            </TouchableOpacity>
          )}
        </View>
        {item.description && (
          <Text style={styles.projectDescription}>{item.description}</Text>
        )}
        <View style={styles.projectFooter}>
          <TouchableOpacity 
            style={[styles.statusBadge, { backgroundColor: statusColor + '20', borderColor: statusColor }]}
            onPress={() => !selectionMode && changeProjectStatus(item.id, item.status)}
            disabled={selectionMode}
          >
            <Text style={[styles.statusText, { color: statusColor }]}>{item.status === 'aktiv' ? t('projects.statusActive') : item.status === 'abgeschlossen' ? t('projects.statusCompleted') : t('projects.statusCancelled')}</Text>
            {!selectionMode && <Ionicons name="chevron-down" size={14} color={statusColor} />}
          </TouchableOpacity>
          <Text style={styles.projectDate}>
            {new Date(item.created_at).toLocaleDateString('de-DE')}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#1976d2" />
      </View>
    );
  }

  // Header-Inhalte als ListHeaderComponent für scrollbare Gesamtseite
  // Suchleiste aktiv = Logo und Buttons ausblenden für mehr Platz
  const isSearchActive = isSearchFocused || searchQuery.length > 0;

  const renderListHeader = () => (
    <>
      {/* Company Logo - nur anzeigen wenn Suche nicht aktiv */}
      {!isSearchActive && (
      <View style={[styles.logoContainer, isLandscape && isPhoneDevice && styles.logoContainerLandscape]}>
        <Image
          source={require('../assets/images/icon.png')}
          style={[styles.logo, isLandscape && isPhoneDevice && styles.logoLandscape]}
          resizeMode="contain"
        />
        <Text style={styles.versionCode}>{AppName}</Text>
      </View>
      )}

      {/* Pro: Hinweise auf ausgeliehene Maschinen, Inspektionen, TÜV & niedrigen Lagerbestand */}
      {isProUser && (loanedMachines.length > 0 || inspectionMachines.length > 0 || tuvMachines.length > 0 || lowStockMaterials.length > 0) && (
        <View style={{ marginHorizontal: 16, marginTop: 12, marginBottom: 4 }}>
          <View style={[styles.bannerRow, { flexWrap: 'wrap' }]}>
            {loanedMachines.length > 0 && (
              <TouchableOpacity
                style={[styles.bannerCard, { backgroundColor: '#7c3aed' }]}
                onPress={() => setExpandedBanner(expandedBanner === 'loaned' ? null : 'loaned')}
                activeOpacity={0.85}
              >
                <View style={styles.bannerCardIcon}>
                  <Ionicons name="swap-horizontal" size={16} color="#fff" />
                </View>
                <View style={styles.bannerCardTextWrap}>
                  <Text style={styles.bannerCardTitle} numberOfLines={1} adjustsFontSizeToFit>
                    {loanedMachines.length} {loanedMachines.length === 1 ? 'Gerät' : 'Geräte'}
                  </Text>
                  <Text style={styles.bannerCardSub} numberOfLines={1} adjustsFontSizeToFit>Ausgeliehen</Text>
                </View>
                <Ionicons name={expandedBanner === 'loaned' ? 'chevron-up' : 'chevron-down'} size={14} color="#fff" />
              </TouchableOpacity>
            )}
            {inspectionMachines.length > 0 && (() => {
              const overdue = inspectionMachines.filter(m => {
                const due = new Date(m.next_inspection_date!).getTime();
                return !isNaN(due) && due < Date.now();
              }).length;
              return (
                <TouchableOpacity
                  style={[styles.bannerCard, { backgroundColor: overdue > 0 ? '#dc2626' : '#ea580c' }]}
                  onPress={() => setExpandedBanner(expandedBanner === 'inspection' ? null : 'inspection')}
                  activeOpacity={0.85}
                >
                  <View style={styles.bannerCardIcon}>
                    <Ionicons name={overdue > 0 ? 'warning' : 'shield-checkmark'} size={16} color="#fff" />
                  </View>
                  <View style={styles.bannerCardTextWrap}>
                    <Text style={styles.bannerCardTitle} numberOfLines={1} adjustsFontSizeToFit>
                      {inspectionMachines.length} {inspectionMachines.length === 1 ? 'Gerät' : 'Geräte'}
                    </Text>
                    <Text style={styles.bannerCardSub} numberOfLines={1} adjustsFontSizeToFit>
                      {overdue > 0 ? `Insp. überf. (${overdue})` : 'Inspektion fällig'}
                    </Text>
                  </View>
                  <Ionicons name={expandedBanner === 'inspection' ? 'chevron-up' : 'chevron-down'} size={14} color="#fff" />
                </TouchableOpacity>
              );
            })()}
            {tuvMachines.length > 0 && (() => {
              const overdue = tuvMachines.filter(m => {
                const due = new Date(m.next_tuv_date!).getTime();
                return !isNaN(due) && due < Date.now();
              }).length;
              return (
                <TouchableOpacity
                  style={[styles.bannerCard, { backgroundColor: overdue > 0 ? '#991b1b' : '#dc2626' }]}
                  onPress={() => setExpandedBanner(expandedBanner === 'tuv' ? null : 'tuv')}
                  activeOpacity={0.85}
                >
                  <View style={styles.bannerCardIcon}>
                    <Ionicons name={overdue > 0 ? 'warning' : 'car-sport'} size={16} color="#fff" />
                  </View>
                  <View style={styles.bannerCardTextWrap}>
                    <Text style={styles.bannerCardTitle} numberOfLines={1} adjustsFontSizeToFit>
                      {tuvMachines.length} {tuvMachines.length === 1 ? 'TÜV' : 'TÜV'}
                    </Text>
                    <Text style={styles.bannerCardSub} numberOfLines={1} adjustsFontSizeToFit>
                      {overdue > 0 ? `überfällig (${overdue})` : 'TÜV fällig'}
                    </Text>
                  </View>
                  <Ionicons name={expandedBanner === 'tuv' ? 'chevron-up' : 'chevron-down'} size={14} color="#fff" />
                </TouchableOpacity>
              );
            })()}
            {lowStockMaterials.length > 0 && (() => {
              const empty = lowStockMaterials.filter(m => (m.stock_quantity || 0) <= 0).length;
              return (
                <TouchableOpacity
                  style={[styles.bannerCard, { backgroundColor: empty > 0 ? '#dc2626' : '#0891b2' }]}
                  onPress={() => setExpandedBanner(expandedBanner === 'lowstock' ? null : 'lowstock')}
                  activeOpacity={0.85}
                >
                  <View style={styles.bannerCardIcon}>
                    <Ionicons name={empty > 0 ? 'alert-circle' : 'cube-outline'} size={16} color="#fff" />
                  </View>
                  <View style={styles.bannerCardTextWrap}>
                    <Text style={styles.bannerCardTitle} numberOfLines={1} adjustsFontSizeToFit>
                      {lowStockMaterials.length} {lowStockMaterials.length === 1 ? 'Material' : 'Materialien'}
                    </Text>
                    <Text style={styles.bannerCardSub} numberOfLines={1} adjustsFontSizeToFit>
                      {empty > 0 ? `Bestand leer (${empty})` : 'Bestand niedrig'}
                    </Text>
                  </View>
                  <Ionicons name={expandedBanner === 'lowstock' ? 'chevron-up' : 'chevron-down'} size={14} color="#fff" />
                </TouchableOpacity>
              );
            })()}
          </View>

          {/* Detail-Panel für die jeweils aufgeklappte Karte */}
          {expandedBanner === 'loaned' && loanedMachines.length > 0 && (
            <View style={[styles.bannerDetail, { backgroundColor: '#f5f3ff', borderColor: '#7c3aed' }]}>
              {loanedMachines.map(m => {
                const due = m.loan_until_date ? new Date(m.loan_until_date) : null;
                const overdue = due ? due.getTime() < Date.now() : false;
                const dueStr = due && !isNaN(due.getTime())
                  ? due.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
                  : null;
                return (
                  <View key={m.id} style={styles.bannerDetailItem}>
                    <Ionicons name="construct" size={14} color="#7c3aed" />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.bannerDetailName}>{m.name}</Text>
                      <Text style={[styles.bannerDetailMeta, overdue && { color: '#dc2626', fontWeight: '700' }]} numberOfLines={1}>
                        {m.loan_to ? `↗ ${m.loan_to}` : '↗ ausgeliehen'}
                        {dueStr ? `  ·  ${overdue ? '⚠ überfällig seit ' : 'bis '}${dueStr}` : ''}
                      </Text>
                    </View>
                  </View>
                );
              })}
              <TouchableOpacity style={[styles.bannerOpenBtn, { backgroundColor: '#7c3aed' }]} onPress={() => router.push('/machines')}>
                <Ionicons name="arrow-forward" size={14} color="#fff" />
                <Text style={styles.bannerOpenBtnText}>Maschinen öffnen</Text>
              </TouchableOpacity>
            </View>
          )}
          {expandedBanner === 'inspection' && inspectionMachines.length > 0 && (
            <View style={[styles.bannerDetail, { backgroundColor: '#fff7ed', borderColor: '#ea580c' }]}>
              {inspectionMachines.map(m => {
                const due = new Date(m.next_inspection_date!);
                const overdue = !isNaN(due.getTime()) && due.getTime() < Date.now();
                const days = !isNaN(due.getTime())
                  ? Math.round((due.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
                  : null;
                const dueStr = !isNaN(due.getTime())
                  ? due.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
                  : '';
                return (
                  <View key={m.id} style={styles.bannerDetailItem}>
                    <Ionicons
                      name={overdue ? 'warning' : 'time'}
                      size={14}
                      color={overdue ? '#dc2626' : '#ea580c'}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.bannerDetailName}>{m.name}</Text>
                      <Text style={[styles.bannerDetailMeta, { color: overdue ? '#dc2626' : '#ea580c', fontWeight: overdue ? '700' : '600' }]} numberOfLines={1}>
                        {overdue
                          ? `⚠ Überfällig seit ${dueStr}${days != null ? ` (${Math.abs(days)} Tage)` : ''}`
                          : `Fällig am ${dueStr}${days != null && days >= 0 ? ` (in ${days} Tagen)` : ''}`}
                      </Text>
                    </View>
                  </View>
                );
              })}
              <TouchableOpacity style={[styles.bannerOpenBtn, { backgroundColor: '#ea580c' }]} onPress={() => router.push('/machines')}>
                <Ionicons name="arrow-forward" size={14} color="#fff" />
                <Text style={styles.bannerOpenBtnText}>Maschinen öffnen</Text>
              </TouchableOpacity>
            </View>
          )}
          {expandedBanner === 'tuv' && tuvMachines.length > 0 && (
            <View style={[styles.bannerDetail, { backgroundColor: '#fef2f2', borderColor: '#dc2626' }]}>
              {tuvMachines.map(m => {
                const due = new Date(m.next_tuv_date!);
                const overdue = !isNaN(due.getTime()) && due.getTime() < Date.now();
                const days = !isNaN(due.getTime())
                  ? Math.round((due.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
                  : null;
                const dueStr = !isNaN(due.getTime())
                  ? due.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
                  : '';
                return (
                  <View key={m.id} style={styles.bannerDetailItem}>
                    <Ionicons
                      name={overdue ? 'warning' : 'car-sport'}
                      size={14}
                      color={overdue ? '#991b1b' : '#dc2626'}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.bannerDetailName}>
                        {m.name}{m.license_plate ? `  ·  ${m.license_plate}` : ''}
                      </Text>
                      <Text style={[styles.bannerDetailMeta, { color: overdue ? '#991b1b' : '#dc2626', fontWeight: overdue ? '700' : '600' }]} numberOfLines={1}>
                        {overdue
                          ? `⚠ TÜV überfällig seit ${dueStr}${days != null ? ` (${Math.abs(days)} Tage)` : ''}`
                          : `TÜV fällig am ${dueStr}${days != null && days >= 0 ? ` (in ${days} Tagen)` : ''}`}
                      </Text>
                    </View>
                  </View>
                );
              })}
              <TouchableOpacity style={[styles.bannerOpenBtn, { backgroundColor: '#dc2626' }]} onPress={() => router.push('/machines')}>
                <Ionicons name="arrow-forward" size={14} color="#fff" />
                <Text style={styles.bannerOpenBtnText}>Maschinen öffnen</Text>
              </TouchableOpacity>
            </View>
          )}
          {expandedBanner === 'lowstock' && lowStockMaterials.length > 0 && (
            <View style={[styles.bannerDetail, { backgroundColor: '#ecfeff', borderColor: '#0891b2' }]}>
              {lowStockMaterials.map(m => {
                const empty = (m.stock_quantity || 0) <= 0;
                const threshold = m.low_stock_threshold ?? 5;
                return (
                  <View key={m.id} style={styles.bannerDetailItem}>
                    <Ionicons name={empty ? 'alert-circle' : 'cube'} size={14} color={empty ? '#dc2626' : '#0891b2'} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.bannerDetailName}>{m.name}</Text>
                      <Text style={[styles.bannerDetailMeta, { color: empty ? '#dc2626' : '#0891b2', fontWeight: empty ? '700' : '600' }]}>
                        Bestand: {m.stock_quantity ?? 0} {m.unit || 'Stk'} {empty ? '(leer!)' : `(Schwelle: ${threshold})`}
                      </Text>
                    </View>
                  </View>
                );
              })}
              <TouchableOpacity style={[styles.bannerOpenBtn, { backgroundColor: '#0891b2' }]} onPress={() => router.push('/materials')}>
                <Ionicons name="arrow-forward" size={14} color="#fff" />
                <Text style={styles.bannerOpenBtnText}>Materialien öffnen</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}

      {/* Suchleiste */}
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color="#666" />
        <TextInput
          style={styles.searchInput}
          placeholder={t('home.searchPlaceholder')}
          placeholderTextColor="#999"
          value={searchQuery}
          onChangeText={setSearchQuery}
          onFocus={() => setIsSearchFocused(true)}
          onBlur={() => setIsSearchFocused(false)}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => { setSearchQuery(''); setIsSearchFocused(false); }}>
            <Ionicons name="close-circle" size={20} color="#999" />
          </TouchableOpacity>
        )}
        {/* Globale Suche Button */}
        <TouchableOpacity
          style={styles.globalSearchBtn}
          onPress={() => router.push('/search')}
          accessibilityLabel="Globale Suche"
        >
          <Ionicons name="search-circle" size={26} color="#1976d2" />
        </TouchableOpacity>
      </View>

      {/* Status-Filter Tabs */}
      <View style={styles.filterContainer}>
        {STATUS_OPTIONS.map(option => (
          <TouchableOpacity
            key={option.key}
            style={[
              styles.filterTab,
              activeFilter === option.key && styles.filterTabActive,
              activeFilter === option.key && option.color && { borderColor: option.color }
            ]}
            onPress={() => handleFilterChange(option.key)}
          >
            <Ionicons 
              name={option.icon as any} 
              size={16} 
              color={activeFilter === option.key ? (option.color || '#1976d2') : '#666'} 
            />
            <Text 
              style={[
                styles.filterTabText,
                activeFilter === option.key && styles.filterTabTextActive,
                activeFilter === option.key && option.color && { color: option.color }
              ]}
              numberOfLines={1}
            >
              {t(option.labelKey)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Buttons und Quick-Actions - nur anzeigen wenn Suche nicht aktiv */}
      {!isSearchActive && (
      <View style={styles.actionButtons}>
        {/* Primary action - Neues Projekt */}
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={() => router.push('/projects/new')}
        >
          <Ionicons name="add-circle" size={22} color="#fff" />
          <Text style={styles.primaryButtonText}>{t('home.newProject')}</Text>
        </TouchableOpacity>

        {/* Quick action grid */}
        <View style={[styles.quickGrid, isPhoneDevice && styles.quickGridPhone]}>
          <TouchableOpacity
            style={[styles.quickButton, isPhoneDevice && styles.quickButtonPhone]}
            onPress={() => router.push('/customers/')}
          >
            <View style={[styles.quickIconContainer, isPhoneDevice && styles.quickIconContainerPhone, { backgroundColor: '#e3f2fd' }]}>
              <Ionicons name="people" size={isPhoneDevice ? 18 : 20} color="#1976d2" />
            </View>
            <Text style={[styles.quickButtonText, isPhoneDevice && styles.quickButtonTextPhone]}>{t('home.customers')}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.quickButton, isPhoneDevice && styles.quickButtonPhone]}
            onPress={() => router.push('/checklists/templates')}
          >
            <View style={[styles.quickIconContainer, isPhoneDevice && styles.quickIconContainerPhone, { backgroundColor: '#f3e5f5' }]}>
              <Ionicons name="checkbox-outline" size={isPhoneDevice ? 18 : 20} color="#7b1fa2" />
            </View>
            <Text style={[styles.quickButtonText, isPhoneDevice && styles.quickButtonTextPhone]}>{t('home.checklists')}</Text>
          </TouchableOpacity>

          {/* Mitarbeiter - nur in Pro Version */}
          {Features.showReportTab && (
          <TouchableOpacity
            style={[styles.quickButton, isPhoneDevice && styles.quickButtonPhone]}
            onPress={() => router.push('/employees/')}
          >
            <View style={[styles.quickIconContainer, isPhoneDevice && styles.quickIconContainerPhone, { backgroundColor: '#dbeafe' }]}>
              <Ionicons name="people-circle-outline" size={isPhoneDevice ? 18 : 20} color="#1d4ed8" />
            </View>
            <Text style={[styles.quickButtonText, isPhoneDevice && styles.quickButtonTextPhone]}>Mitarbeiter</Text>
          </TouchableOpacity>
          )}

          {/* Material - nur in Pro Version */}
          {Features.showReportTab && (
          <TouchableOpacity
            style={[styles.quickButton, isPhoneDevice && styles.quickButtonPhone]}
            onPress={() => router.push('/materials/')}
          >
            <View style={[styles.quickIconContainer, isPhoneDevice && styles.quickIconContainerPhone, { backgroundColor: '#fef3c7' }]}>
              <Ionicons name="cube-outline" size={isPhoneDevice ? 18 : 20} color="#d97706" />
            </View>
            <Text style={[styles.quickButtonText, isPhoneDevice && styles.quickButtonTextPhone]}>Material</Text>
          </TouchableOpacity>
          )}

          {/* Maschinen / Geräte - nur in Pro Version */}
          {Features.showReportTab && (
          <TouchableOpacity
            style={[styles.quickButton, isPhoneDevice && styles.quickButtonPhone]}
            onPress={() => router.push('/machines/')}
          >
            <View style={[styles.quickIconContainer, isPhoneDevice && styles.quickIconContainerPhone, { backgroundColor: '#ede9fe' }]}>
              <Ionicons name="construct-outline" size={isPhoneDevice ? 18 : 20} color="#7c3aed" />
            </View>
            <Text style={[styles.quickButtonText, isPhoneDevice && styles.quickButtonTextPhone]}>Maschinen</Text>
          </TouchableOpacity>
          )}

          {/* Referenzen - nur in Pro Version */}
          {Features.showReferenzButton && (
          <TouchableOpacity
            style={[styles.quickButton, isPhoneDevice && styles.quickButtonPhone]}
            onPress={() => router.push('/references/')}
          >
            <View style={[styles.quickIconContainer, isPhoneDevice && styles.quickIconContainerPhone, { backgroundColor: '#fff3e0' }]}>
              <Ionicons name="images" size={isPhoneDevice ? 18 : 20} color="#f57c00" />
            </View>
            <Text style={[styles.quickButtonText, isPhoneDevice && styles.quickButtonTextPhone]}>{t('home.references')}</Text>
          </TouchableOpacity>
          )}

          <TouchableOpacity
            style={[styles.quickButton, isPhoneDevice && styles.quickButtonPhone]}
            onPress={() => router.push('/settings')}
          >
            <View style={[styles.quickIconContainer, isPhoneDevice && styles.quickIconContainerPhone, { backgroundColor: '#eceff1' }]}>
              <Ionicons name="settings-outline" size={isPhoneDevice ? 18 : 20} color="#546e7a" />
            </View>
            <Text style={[styles.quickButtonText, isPhoneDevice && styles.quickButtonTextPhone]}>{t('home.settings')}</Text>
          </TouchableOpacity>
        </View>

        {/* Sort and Import row */}
        <View style={styles.utilityRow}>
          <TouchableOpacity
            style={styles.utilityButton}
            onPress={changeSortOrder}
          >
            <Ionicons name="swap-vertical" size={16} color="#1976d2" />
            <Text style={styles.utilityButtonText}>{getSortLabel()}</Text>
          </TouchableOpacity>

          {/* Import Button - nur in Pro Version */}
          {Features.showImportButton && (
          <TouchableOpacity
            style={[styles.utilityButton, styles.importUtilityButton]}
            onPress={importProjectFile}
          >
            <Ionicons name="download-outline" size={16} color="#2e7d32" />
            <Text style={[styles.utilityButtonText, { color: '#2e7d32' }]}>Import</Text>
          </TouchableOpacity>
          )}
          
          {/* Verschieben Button - nur in Pro Version */}
          {Features.showVerschiebenButton && (
          <TouchableOpacity
            style={[styles.utilityButton, selectionMode && styles.utilityButtonActive]}
            onPress={toggleSelectionMode}
          >
            <Ionicons 
              name={selectionMode ? "close-circle" : "swap-horizontal"} 
              size={16} 
              color={selectionMode ? "#fff" : "#9c27b0"} 
            />
            <Text style={[styles.utilityButtonText, { color: selectionMode ? '#fff' : '#9c27b0' }]}>
              {selectionMode ? t('common.cancel') : t('home.select')}
            </Text>
          </TouchableOpacity>
          )}
        </View>
        
        {/* Multi-Select Action Row - nur wenn Selection Mode aktiv und Pro Version */}
        {Features.showVerschiebenButton && selectionMode && (
        <View style={styles.multiSelectRow}>
          <TouchableOpacity
            style={[styles.multiSelectButton, { backgroundColor: '#e3f2fd' }]}
            onPress={selectedProjects.size === filteredProjects.length ? deselectAllProjects : selectAllProjects}
          >
            <Ionicons 
              name={selectedProjects.size === filteredProjects.length ? "checkbox" : "checkbox-outline"} 
              size={16} 
              color="#1976d2" 
            />
            <Text style={[styles.multiSelectButtonText, { color: '#1976d2' }]}>
              {selectedProjects.size > 0 ? `(${selectedProjects.size})` : t('home.selectAll')}
            </Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={[styles.multiSelectButton, { backgroundColor: '#e8f5e9' }]}
            onPress={exportSelectedProjects}
            disabled={selectedProjects.size === 0}
          >
            <Ionicons name="share-outline" size={16} color="#2e7d32" />
            <Text style={[styles.multiSelectButtonText, { color: '#2e7d32' }]}>{t('common.export')}</Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={[styles.multiSelectButton, { backgroundColor: '#e8f5e9' }]}
            onPress={() => moveSelectedToStatus('aktiv')}
            disabled={selectedProjects.size === 0}
          >
            <Ionicons name="play-circle-outline" size={16} color="#4caf50" />
            <Text style={[styles.multiSelectButtonText, { color: '#4caf50' }]}>{t('home.active')}</Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={[styles.multiSelectButton, { backgroundColor: '#e3f2fd' }]}
            onPress={() => moveSelectedToStatus('abgeschlossen')}
            disabled={selectedProjects.size === 0}
          >
            <Ionicons name="checkmark-circle-outline" size={16} color="#1976d2" />
            <Text style={[styles.multiSelectButtonText, { color: '#1976d2' }]}>{t('home.completed')}</Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={[styles.multiSelectButton, { backgroundColor: '#fff3e0' }]}
            onPress={() => moveSelectedToStatus('abgebrochen')}
            disabled={selectedProjects.size === 0}
          >
            <Ionicons name="close-circle-outline" size={16} color="#f57c00" />
            <Text style={[styles.multiSelectButtonText, { color: '#f57c00' }]}>{t('home.cancelled')}</Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={[styles.multiSelectButton, { backgroundColor: '#ffebee' }]}
            onPress={deleteSelectedProjects}
            disabled={selectedProjects.size === 0}
          >
            <Ionicons name="trash-outline" size={16} color="#f44336" />
            <Text style={[styles.multiSelectButtonText, { color: '#f44336' }]}>{t('common.delete')}</Text>
          </TouchableOpacity>
        </View>
        )}
      </View>
      )}
    </>
  );

  return (
    <View style={styles.container}>
      {/* Processing Overlay */}
      {isProcessing && (
        <View style={styles.processingOverlay}>
          <ActivityIndicator size="large" color="#fff" />
          <Text style={styles.processingText}>{t('common.loading')}</Text>
        </View>
      )}

      {/* Gesamte Seite als eine scrollbare FlatList - Header scrollt mit */}
      <FlatList
        data={filteredProjects}
        renderItem={renderProject}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.projectList}
        ListHeaderComponent={renderListHeader()}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="folder-open-outline" size={64} color="#ccc" />
            <Text style={styles.emptyText}>
              {projects.length === 0 ? t('home.noProjects') : t('home.noProjects')}
            </Text>
            <Text style={styles.emptySubtext}>
              {projects.length === 0 
                ? t('home.createFirst') 
                : searchQuery 
                  ? t('home.searchPlaceholder')
                  : t('home.noProjects')}
            </Text>
          </View>
        }
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      />
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
  logoContainer: {
    backgroundColor: '#0a1628',
    padding: 20,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  logoContainerLandscape: {
    flexDirection: 'row',
    padding: 8,
    paddingHorizontal: 16,
    gap: 10,
    justifyContent: 'center',
  },
  logo: {
    width: 120,
    height: 120,
    borderRadius: 20,
  },
  logoLandscape: {
    width: 36,
    height: 36,
    borderRadius: 8,
  },
  versionCode: {
    color: '#ffffff',
    fontSize: 12,
    marginTop: 8,
    opacity: 0.8,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#333',
  },
  filterContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  filterTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    gap: 4,
  },
  filterTabActive: {
    backgroundColor: '#e3f2fd',
    borderColor: '#1976d2',
  },
  filterTabText: {
    fontSize: 12,
    color: '#666',
    fontWeight: '500',
  },
  filterTabTextActive: {
    color: '#1976d2',
    fontWeight: '600',
  },
  actionButtons: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 10,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1976d2',
    paddingVertical: 12,
    borderRadius: 10,
    gap: 8,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  quickGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  quickGridPhone: {
    gap: 6,
    justifyContent: 'space-between',
  },
  quickButton: {
    width: '23%',
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2,
  },
  quickButtonPhone: {
    width: '23%',
    paddingVertical: 8,
    paddingHorizontal: 2,
    borderRadius: 8,
  },
  quickIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
  },
  quickIconContainerPhone: {
    width: 32,
    height: 32,
    borderRadius: 8,
    marginBottom: 4,
  },
  quickButtonText: {
    fontSize: 11,
    color: '#333',
    fontWeight: '500',
    textAlign: 'center',
  },
  quickButtonTextPhone: {
    fontSize: 10,
  },
  utilityRow: {
    flexDirection: 'row',
    gap: 10,
  },
  utilityButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingVertical: 8,
    gap: 6,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  importUtilityButton: {
    borderColor: '#c8e6c9',
    backgroundColor: '#f1f8e9',
  },
  utilityButtonActive: {
    borderColor: '#9c27b0',
    backgroundColor: '#9c27b0',
  },
  utilityButtonText: {
    fontSize: 12,
    color: '#1976d2',
    fontWeight: '500',
  },
  // Multi-Select Styles
  multiSelectRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
  },
  multiSelectButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: '#f5f5f5',
    gap: 4,
  },
  multiSelectButtonActive: {
    backgroundColor: '#1976d2',
  },
  multiSelectButtonText: {
    fontSize: 11,
    color: '#666',
    fontWeight: '500',
  },
  checkboxContainer: {
    marginRight: 4,
  },
  projectCardSelected: {
    borderColor: '#1976d2',
    borderWidth: 2,
    backgroundColor: '#e3f2fd',
  },
  processingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  processingText: {
    color: '#fff',
    fontSize: 16,
    marginTop: 12,
    fontWeight: '500',
  },
  // Legacy styles kept for compatibility
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
  },
  button: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 12,
    borderRadius: 12,
    gap: 8,
  },
  secondaryButton: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#1976d2',
  },
  buttonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  secondaryButtonText: {
    color: '#1976d2',
    fontSize: 14,
    fontWeight: '600',
  },
  importSortRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 4,
  },
  sortButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#e3f2fd',
    borderWidth: 1,
    borderColor: '#1976d2',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 12,
    gap: 8,
  },
  sortButtonText: {
    color: '#1976d2',
    fontSize: 14,
    fontWeight: '600',
  },
  importButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#e8f5e9',
    borderWidth: 1,
    borderColor: '#4caf50',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 12,
    gap: 8,
  },
  importButtonText: {
    color: '#2e7d32',
    fontSize: 14,
    fontWeight: '600',
  },
  referenceButton: {
    backgroundColor: '#fff3e0',
    borderWidth: 1,
    borderColor: '#ff9800',
  },
  referenceButtonText: {
    color: '#e65100',
    fontSize: 14,
    fontWeight: '600',
  },
  quickCustomerSection: {
    marginTop: 8,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    padding: 12,
  },
  quickCustomerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  quickCustomerTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  customerSearchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 10,
    gap: 8,
  },
  customerSearchInput: {
    flex: 1,
    fontSize: 14,
    color: '#333',
  },
  customerListContainer: {
    gap: 6,
  },
  customerListItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f9f9f9',
    borderRadius: 8,
    padding: 10,
    gap: 10,
  },
  customerListAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1976d2',
    justifyContent: 'center',
    alignItems: 'center',
  },
  customerListInitial: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  customerListInfo: {
    flex: 1,
  },
  customerListName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  customerListPhone: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  customerListAction: {
    padding: 4,
  },
  customerListMore: {
    textAlign: 'center',
    fontSize: 12,
    color: '#666',
    marginTop: 6,
  },
  customerListEmpty: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  customerListEmptyText: {
    fontSize: 13,
    color: '#999',
    marginBottom: 10,
  },
  customerAddButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#e3f2fd',
    borderRadius: 8,
  },
  customerAddButtonText: {
    fontSize: 13,
    color: '#1976d2',
    fontWeight: '500',
  },
  projectList: {
    padding: 16,
    paddingTop: 0,
  },
  projectCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  projectHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  projectInfo: {
    flex: 1,
    marginLeft: 12,
  },
  projectNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  projectNumber: {
    fontSize: 11,
    fontWeight: '600',
    color: '#4caf50',
    backgroundColor: '#e8f5e9',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  projectName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    flexShrink: 1,
  },
  customerNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  customerNumberSmall: {
    fontSize: 10,
    fontWeight: '600',
    color: '#1976d2',
    backgroundColor: '#e3f2fd',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
  },
  customerName: {
    fontSize: 14,
    color: '#666',
  },
  deleteButton: {
    padding: 8,
  },
  projectDescription: {
    fontSize: 14,
    color: '#666',
    marginBottom: 12,
  },
  projectFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    gap: 4,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  projectDate: {
    fontSize: 12,
    color: '#999',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#666',
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#999',
    marginTop: 8,
  },
  // Banner row (Pro-Hinweise: ausgeliehen / Inspektion)
  bannerRow: {
    flexDirection: 'row',
    gap: 6,
  },
  bannerCard: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 10,
  },
  bannerCardIcon: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  bannerCardTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  bannerCardTitle: { color: '#fff', fontWeight: '800', fontSize: 13 },
  bannerCardSub: { color: 'rgba(255,255,255,0.9)', fontSize: 10, marginTop: 1 },
  // Detail panel (expanded)
  bannerDetail: {
    marginTop: 8,
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 8,
    paddingHorizontal: 10,
    gap: 6,
  },
  bannerDetailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
  },
  bannerDetailName: { color: '#0f172a', fontWeight: '700', fontSize: 13 },
  bannerDetailMeta: { color: '#475569', fontSize: 11, marginTop: 1 },
  bannerOpenBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    borderRadius: 8, paddingVertical: 8, marginTop: 4,
  },
  bannerOpenBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  globalSearchBtn: {
    marginLeft: 6,
    padding: 2,
  },
});

import React, { useState, useEffect, useCallback } from 'react';
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
import { ProjectService, CustomerService, RoofService, PhotoService, SketchService, ChecklistService, Project, Customer } from '../services/LocalStorage';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { readAsStringAsync } from 'expo-file-system/legacy';

// Status-Optionen
const STATUS_OPTIONS = [
  { key: 'all', label: 'Alle', icon: 'folder-outline' },
  { key: 'aktiv', label: 'Aktiv', icon: 'play-circle-outline', color: '#4caf50' },
  { key: 'abgeschlossen', label: 'Fertig', icon: 'checkmark-circle-outline', color: '#2196f3' },
  { key: 'abgebrochen', label: 'Abgebr.', icon: 'close-circle-outline', color: '#f44336' },
];

export default function HomeScreen() {
  const router = useRouter();
  const { width: screenWidth } = useWindowDimensions();
  // iPhone hat typisch < 500px Breite, iPad >= 768px
  const isPhone = screenWidth < 500;
  
  const [projects, setProjects] = useState<Project[]>([]);
  const [customers, setCustomers] = useState<{ [key: string]: Customer }>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState('all');
  const [sortBy, setSortBy] = useState<'date_desc' | 'date_asc' | 'name_asc' | 'name_desc' | 'status'>('date_desc');
  const [customerSearchQuery, setCustomerSearchQuery] = useState('');

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
    } catch (error) {
      console.error('Error loading data:', error);
      Alert.alert('Fehler', 'Daten konnten nicht geladen werden');
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
        Alert.alert('Fehler', 'Bitte wählen Sie eine .aufmass, .json oder .txt Datei aus');
        return;
      }
      
      setLoading(true);
      
      // Read file content
      const content = await readAsStringAsync(file.uri);
      
      // Clean up content - remove truncation markers if present
      let cleanContent = content;
      if (content.includes('... (gekürzt)')) {
        Alert.alert('Fehler', 'Die Datei ist unvollständig. Bitte exportieren Sie das Projekt erneut.');
        setLoading(false);
        return;
      }
      
      const importData = JSON.parse(cleanContent);
      
      // Validate import data
      if (!importData.project || !importData.version) {
        Alert.alert('Fehler', 'Ungültige Projektdatei');
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
      Alert.alert('Erfolg', `Projekt "${importData.project.name}" wurde importiert`);
      
      // Navigate to the imported project
      router.push(`/projects/${newProject.id}`);
      
    } catch (error) {
      console.error('Error importing project:', error);
      Alert.alert('Fehler', 'Projekt konnte nicht importiert werden');
    } finally {
      setLoading(false);
    }
  };

  const deleteProject = async (projectId: string) => {
    Alert.alert(
      'Projekt löschen',
      'Möchten Sie dieses Projekt wirklich löschen?',
      [
        { text: 'Abbrechen', style: 'cancel' },
        {
          text: 'Löschen',
          style: 'destructive',
          onPress: async () => {
            try {
              await ProjectService.delete(projectId);
              loadData();
            } catch (error) {
              console.error('Error deleting project:', error);
              Alert.alert('Fehler', 'Projekt konnte nicht gelöscht werden');
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
          Alert.alert('Fehler', 'Status konnte nicht geändert werden');
        }
      },
      style: status === currentStatus ? 'cancel' : 'default' as const,
    }));
    buttons.push({ text: 'Abbrechen', onPress: () => {}, style: 'cancel' as const });
    
    Alert.alert('Status ändern', 'Wählen Sie den neuen Status:', buttons);
  };

  // Sortierung ändern
  const changeSortOrder = () => {
    const sortOptions = [
      { key: 'date_desc', label: 'Neueste zuerst' },
      { key: 'date_asc', label: 'Älteste zuerst' },
      { key: 'name_asc', label: 'Name A-Z' },
      { key: 'name_desc', label: 'Name Z-A' },
      { key: 'status', label: 'Nach Status' },
    ];
    
    const buttons = sortOptions.map(option => ({
      text: option.label + (sortBy === option.key ? ' ✓' : ''),
      onPress: () => setSortBy(option.key as typeof sortBy),
      style: sortBy === option.key ? 'cancel' : 'default' as const,
    }));
    buttons.push({ text: 'Abbrechen', onPress: () => {}, style: 'cancel' as const });
    
    Alert.alert('Sortieren nach', 'Wählen Sie die Sortierung:', buttons);
  };

  // Sortier-Label
  const getSortLabel = () => {
    switch (sortBy) {
      case 'date_desc': return 'Neueste';
      case 'date_asc': return 'Älteste';
      case 'name_asc': return 'A-Z';
      case 'name_desc': return 'Z-A';
      case 'status': return 'Status';
      default: return 'Sortieren';
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
    return (
      <TouchableOpacity
        style={styles.projectCard}
        onPress={() => router.push(`/projects/${item.id}`)}
      >
        <View style={styles.projectHeader}>
          <Ionicons name="folder" size={24} color={statusColor} />
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
          <TouchableOpacity
            onPress={() => deleteProject(item.id)}
            style={styles.deleteButton}
          >
            <Ionicons name="trash-outline" size={20} color="#f44336" />
          </TouchableOpacity>
        </View>
        {item.description && (
          <Text style={styles.projectDescription}>{item.description}</Text>
        )}
        <View style={styles.projectFooter}>
          <TouchableOpacity 
            style={[styles.statusBadge, { backgroundColor: statusColor + '20', borderColor: statusColor }]}
            onPress={() => changeProjectStatus(item.id, item.status)}
          >
            <Text style={[styles.statusText, { color: statusColor }]}>{item.status}</Text>
            <Ionicons name="chevron-down" size={14} color={statusColor} />
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

  return (
    <View style={styles.container}>
      {/* Company Logo */}
      <View style={styles.logoContainer}>
        <Image
          source={require('../assets/images/icon.png')}
          style={styles.logo}
          resizeMode="contain"
        />
        <Text style={styles.versionCode}>Aufmassprofi_17.03.2026_01:00</Text>
      </View>

      {/* Suchleiste */}
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color="#666" />
        <TextInput
          style={styles.searchInput}
          placeholder="Projekt oder Kunde suchen..."
          placeholderTextColor="#999"
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <Ionicons name="close-circle" size={20} color="#999" />
          </TouchableOpacity>
        )}
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
            onPress={() => setActiveFilter(option.key)}
          >
            <Ionicons 
              name={option.icon as any} 
              size={16} 
              color={activeFilter === option.key ? (option.color || '#1976d2') : '#666'} 
            />
            <Text style={[
              styles.filterTabText,
              activeFilter === option.key && styles.filterTabTextActive,
              activeFilter === option.key && option.color && { color: option.color }
            ]}>
              {option.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.actionButtons}>
        {/* Primary action - Neues Projekt */}
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={() => router.push('/projects/new')}
        >
          <Ionicons name="add-circle" size={22} color="#fff" />
          <Text style={styles.primaryButtonText}>Neues Projekt</Text>
        </TouchableOpacity>

        {/* Quick action grid */}
        <View style={[styles.quickGrid, isPhone && styles.quickGridPhone]}>
          <TouchableOpacity
            style={[styles.quickButton, isPhone && styles.quickButtonPhone]}
            onPress={() => router.push('/customers/')}
          >
            <View style={[styles.quickIconContainer, isPhone && styles.quickIconContainerPhone, { backgroundColor: '#e3f2fd' }]}>
              <Ionicons name="people" size={isPhone ? 18 : 20} color="#1976d2" />
            </View>
            <Text style={[styles.quickButtonText, isPhone && styles.quickButtonTextPhone]}>Kunden</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.quickButton, isPhone && styles.quickButtonPhone]}
            onPress={() => router.push('/checklists/templates')}
          >
            <View style={[styles.quickIconContainer, isPhone && styles.quickIconContainerPhone, { backgroundColor: '#f3e5f5' }]}>
              <Ionicons name="checkbox-outline" size={isPhone ? 18 : 20} color="#7b1fa2" />
            </View>
            <Text style={[styles.quickButtonText, isPhone && styles.quickButtonTextPhone]}>{isPhone ? 'Listen' : 'Checklisten'}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.quickButton, isPhone && styles.quickButtonPhone]}
            onPress={() => router.push('/references/')}
          >
            <View style={[styles.quickIconContainer, isPhone && styles.quickIconContainerPhone, { backgroundColor: '#fff3e0' }]}>
              <Ionicons name="images" size={isPhone ? 18 : 20} color="#f57c00" />
            </View>
            <Text style={[styles.quickButtonText, isPhone && styles.quickButtonTextPhone]}>{isPhone ? 'Referenz' : 'Referenzen'}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.quickButton, isPhone && styles.quickButtonPhone]}
            onPress={() => router.push('/settings')}
          >
            <View style={[styles.quickIconContainer, isPhone && styles.quickIconContainerPhone, { backgroundColor: '#eceff1' }]}>
              <Ionicons name="settings-outline" size={isPhone ? 18 : 20} color="#546e7a" />
            </View>
            <Text style={[styles.quickButtonText, isPhone && styles.quickButtonTextPhone]}>{isPhone ? 'Setup' : 'Einstellungen'}</Text>
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

          <TouchableOpacity
            style={[styles.utilityButton, styles.importUtilityButton]}
            onPress={importProjectFile}
          >
            <Ionicons name="download-outline" size={16} color="#2e7d32" />
            <Text style={[styles.utilityButtonText, { color: '#2e7d32' }]}>Import</Text>
          </TouchableOpacity>
        </View>
      </View>

      {filteredProjects.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="folder-open-outline" size={64} color="#ccc" />
          <Text style={styles.emptyText}>
            {projects.length === 0 ? 'Keine Projekte vorhanden' : 'Keine Projekte gefunden'}
          </Text>
          <Text style={styles.emptySubtext}>
            {projects.length === 0 
              ? 'Erstellen Sie Ihr erstes Projekt' 
              : searchQuery 
                ? 'Versuchen Sie einen anderen Suchbegriff'
                : 'Keine Projekte mit diesem Status'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredProjects}
          renderItem={renderProject}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.projectList}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        />
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
  logoContainer: {
    backgroundColor: '#0a1628',
    padding: 20,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  logo: {
    width: 120,
    height: 120,
    borderRadius: 20,
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
  utilityButtonText: {
    fontSize: 12,
    color: '#1976d2',
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
});

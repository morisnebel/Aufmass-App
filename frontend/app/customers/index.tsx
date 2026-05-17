import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Alert,
  TextInput,
  Modal,
  ScrollView,
  Platform,
  useWindowDimensions,
  StatusBar,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CustomerService, Customer, ProjectAddress, ProjectService, Project, generateFullName, generateFullAddress, generateObjectNumber, isCustomerNumberDuplicate, isObjectNumberDuplicate, isProjectNumberDuplicate, getNextAvailableCustomerNumber, getNextAvailableObjectNumber, getNextAvailableProjectNumber } from '../../services/LocalStorage';
import { useTranslation } from 'react-i18next';

export default function CustomersScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const params = useLocalSearchParams();
  const selectMode = params.selectMode === 'true';
  
  // iPhone vs iPad Erkennung - für unterschiedliches Layout
  const { width: screenWidth } = useWindowDimensions();
  const isPhone = Platform.OS === 'ios' ? !Platform.isPad : screenWidth < 768;
  
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'name_asc' | 'name_desc' | 'number_asc' | 'number_desc' | 'date_desc' | 'date_asc'>('name_asc');
  
  // Delete modal state
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [customerToDelete, setCustomerToDelete] = useState<Customer | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Address modal state
  const [showAddressModal, setShowAddressModal] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [editingAddress, setEditingAddress] = useState<ProjectAddress | null>(null);
  const [addressObjectNumber, setAddressObjectNumber] = useState(''); // OBJ-26001
  const [addressName, setAddressName] = useState('');
  const [addressDescription, setAddressDescription] = useState('');
  const [addressObjectName, setAddressObjectName] = useState('');
  const [addressStreet, setAddressStreet] = useState('');
  const [addressZip, setAddressZip] = useState('');
  const [addressCity, setAddressCity] = useState('');
  const [addressContactPerson, setAddressContactPerson] = useState('');
  const [addressPhone, setAddressPhone] = useState('');
  const [addressEmail, setAddressEmail] = useState('');
  
  // Projects für Aufmaß-Navigation
  const [projects, setProjects] = useState<Project[]>([]);
  
  // Projects Modal state
  const [showProjectsModal, setShowProjectsModal] = useState(false);
  const [projectsCustomer, setProjectsCustomer] = useState<Customer | null>(null);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [editProjectNumber, setEditProjectNumber] = useState('');
  const [editProjectName, setEditProjectName] = useState('');
  const [editProjectDescription, setEditProjectDescription] = useState('');
  const [savingProject, setSavingProject] = useState(false);
  const loadCustomers = async () => {
    try {
      const [customerData, projectData] = await Promise.all([
        CustomerService.getAll(),
        ProjectService.getAll()
      ]);
      console.log('Loaded customers:', customerData.length, customerData);
      setCustomers(customerData);
      setProjects(projectData);
    } catch (error) {
      console.error('Error loading customers:', error);
      Alert.alert(t('common.error'), 'Kunden konnten nicht geladen werden');
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadCustomers();
    }, [])
  );

  const openDeleteModal = (customer: Customer) => {
    setCustomerToDelete(customer);
    setShowDeleteModal(true);
  };

  const confirmDelete = async () => {
    if (!customerToDelete) return;
    
    setIsDeleting(true);
    try {
      await CustomerService.delete(customerToDelete.id);
      setShowDeleteModal(false);
      setCustomerToDelete(null);
      loadCustomers();
    } catch (error) {
      console.error('Error deleting customer:', error);
      Alert.alert(t('common.error'), 'Kunde konnte nicht gelöscht werden');
    } finally {
      setIsDeleting(false);
    }
  };

  // Address Management Functions
  const openAddressModal = (customer: Customer) => {
    setSelectedCustomer(customer);
    setEditingAddress(null);
    resetAddressForm();
    setShowAddressModal(true);
  };

  const resetAddressForm = () => {
    setAddressObjectNumber('');
    setAddressName('');
    setAddressDescription('');
    setAddressObjectName('');
    setAddressStreet('');
    setAddressZip('');
    setAddressCity('');
    setAddressContactPerson('');
    setAddressPhone('');
    setAddressEmail('');
    setEditingAddress(null);
  };

  const editAddress = (address: ProjectAddress) => {
    setEditingAddress(address);
    setAddressObjectNumber(address.object_number || '');
    setAddressName(address.name);
    setAddressDescription(address.description || '');
    setAddressObjectName(address.objectName || '');
    setAddressStreet(address.street);
    setAddressZip(address.zip);
    setAddressCity(address.city);
    setAddressContactPerson(address.contactPerson || '');
    setAddressPhone(address.phone || '');
    setAddressEmail(address.email || '');
  };

  const saveAddress = async () => {
    if (!selectedCustomer || !addressName.trim()) {
      Alert.alert(t('common.error'), 'Bitte geben Sie mindestens einen Namen ein');
      return;
    }

    const addresses = selectedCustomer.projectAddresses || [];
    
    // Duplikat-Prüfung für Objektnummer
    const objectNumToCheck = addressObjectNumber;
    if (objectNumToCheck) {
      const isDuplicate = await isObjectNumberDuplicate(
        objectNumToCheck, 
        selectedCustomer.id, 
        editingAddress?.id
      );
      
      if (isDuplicate) {
        Alert.alert(
          'Objektnummer bereits vergeben',
          `Die Objektnummer "${objectNumToCheck}" existiert bereits. Was möchten Sie tun?`,
          [
            { text: t('common.cancel'), style: 'cancel' },
            { 
              text: 'Trotzdem behalten', 
              onPress: () => saveAddressWithNumber(objectNumToCheck)
            },
            {
              text: 'Neue Nummer vergeben',
              onPress: async () => {
                const newNumber = await getNextAvailableObjectNumber(selectedCustomer.id);
                saveAddressWithNumber(newNumber);
              }
            }
          ]
        );
        return;
      }
    }
    
    // Kein Duplikat, normal speichern
    const finalObjectNumber = addressObjectNumber || await getNextAvailableObjectNumber(selectedCustomer.id);
    await saveAddressWithNumber(finalObjectNumber);
  };
  
  const saveAddressWithNumber = async (objectNumber: string) => {
    if (!selectedCustomer) return;
    
    const addresses = selectedCustomer.projectAddresses || [];
    
    if (editingAddress) {
      // Bestehende Adresse aktualisieren
      const updatedAddresses = addresses.map(a => 
        a.id === editingAddress.id 
          ? { ...a, object_number: objectNumber, name: addressName, description: addressDescription || undefined, objectName: addressObjectName || undefined, street: addressStreet, zip: addressZip, city: addressCity, contactPerson: addressContactPerson || undefined, phone: addressPhone || undefined, email: addressEmail || undefined }
          : a
      );
      await CustomerService.update(selectedCustomer.id, { 
        ...selectedCustomer, 
        projectAddresses: updatedAddresses 
      });
    } else {
      // Neue Adresse hinzufügen
      const newAddress: ProjectAddress = {
        id: Date.now().toString(36) + Math.random().toString(36).substr(2),
        object_number: objectNumber,
        name: addressName,
        description: addressDescription || undefined,
        objectName: addressObjectName || undefined,
        street: addressStreet,
        zip: addressZip,
        city: addressCity,
        contactPerson: addressContactPerson || undefined,
        phone: addressPhone || undefined,
        email: addressEmail || undefined,
      };
      await CustomerService.update(selectedCustomer.id, { 
        ...selectedCustomer, 
        projectAddresses: [...addresses, newAddress] 
      });
    }

    loadCustomers();
    // Update selectedCustomer for UI refresh
    const updatedCustomer = await CustomerService.getById(selectedCustomer.id);
    setSelectedCustomer(updatedCustomer);
    resetAddressForm();
    
    // Prüfe ob es Projekte gibt, die diese Adresse verwenden und frage nach Sync
    const addressNameToSync = editingAddress?.name || addressName;
    if (addressNameToSync) {
      try {
        const allProjects = await ProjectService.getByCustomerId(selectedCustomer.id);
        const matchingProjects = allProjects.filter(
          p => p.objekt_address_name === addressNameToSync
        );
        
        if (matchingProjects.length > 0) {
          Alert.alert(
            'Projekte synchronisieren?',
            `${matchingProjects.length} Projekt(e) verwenden diese Adresse. Sollen die Objektadressen in diesen Projekten auch aktualisiert werden?`,
            [
              { text: t('common.no'), style: 'cancel' },
              { 
                text: 'Ja, synchronisieren', 
                onPress: async () => {
                  for (const proj of matchingProjects) {
                    await ProjectService.update(proj.id, {
                      ...proj,
                      name: addressName, // Projektname = Bezeichnung
                      objekt_description: addressDescription || undefined, // Objektadress-Beschreibung
                      objekt_address_name: addressName, // Bezeichnung aktualisieren
                      objekt_name: addressObjectName || undefined,
                      objekt_street: addressStreet,
                      objekt_plz: addressZip,
                      objekt_city: addressCity,
                      objekt_contact_person: addressContactPerson || undefined,
                      objekt_phone: addressPhone || undefined,
                      objekt_email: addressEmail || undefined,
                    });
                  }
                  Alert.alert(t('common.success'), `${matchingProjects.length} Projekt(e) wurden aktualisiert`);
                }
              },
            ]
          );
        }
      } catch (syncError) {
        console.error('Error syncing project addresses:', syncError);
      }
    }
  };

  const deleteAddress = async (addressId: string) => {
    if (!selectedCustomer) return;
    
    Alert.alert(
      'Adresse löschen',
      'Möchten Sie diese Adresse wirklich löschen?',
      [
        { text: t('common.cancel'), style: 'cancel' },
        { 
          text: 'Löschen', 
          style: 'destructive',
          onPress: async () => {
            const addresses = selectedCustomer.projectAddresses || [];
            const updatedAddresses = addresses.filter(a => a.id !== addressId);
            await CustomerService.update(selectedCustomer.id, { 
              ...selectedCustomer, 
              projectAddresses: updatedAddresses 
            });
            loadCustomers();
            const updatedCustomer = await CustomerService.getById(selectedCustomer.id);
            setSelectedCustomer(updatedCustomer);
          }
        }
      ]
    );
  };

  // Funktion: Projekt mit dieser Adresse finden oder neues erstellen
  const goToAufmass = async (address: ProjectAddress) => {
    if (!selectedCustomer) return;
    
    // Suche nach Projekt mit dieser Adresse
    const matchingProject = projects.find(p => 
      p.customer_id === selectedCustomer.id && 
      p.objekt_address_name === address.name &&
      p.objekt_street === address.street
    );
    
    if (matchingProject) {
      // Projekt gefunden - navigiere dorthin
      setShowAddressModal(false);
      router.push(`/projects/${matchingProject.id}`);
    } else {
      // Kein Projekt gefunden - Frage ob neues erstellt werden soll
      Alert.alert(
        'Kein Projekt gefunden',
        `Für "${address.name}" existiert noch kein Projekt. Möchten Sie ein neues Projekt erstellen?`,
        [
          { text: t('common.cancel'), style: 'cancel' },
          {
            text: 'Projekt erstellen',
            onPress: async () => {
              try {
                const newProject = await ProjectService.create({
                  name: `${selectedCustomer.name} - ${address.name}`,
                  customer_id: selectedCustomer.id,
                  status: 'aktiv',
                  bauherr_name: selectedCustomer.name,
                  bauherr_phone: selectedCustomer.phone,
                  bauherr_email: selectedCustomer.email,
                  bauherr_address: selectedCustomer.address,
                  objekt_street: address.street,
                  objekt_plz: address.zip,
                  objekt_city: address.city,
                  objekt_address_name: address.name,
                });
                setShowAddressModal(false);
                router.push(`/projects/${newProject.id}`);
              } catch (error) {
                console.error('Error creating project:', error);
                Alert.alert(t('common.error'), 'Projekt konnte nicht erstellt werden');
              }
            }
          }
        ]
      );
    }
  };

  // Project Management Functions
  const openProjectsModal = async (customer: Customer) => {
    // Reload projects to ensure we have the latest data
    try {
      const projectData = await ProjectService.getAll();
      setProjects(projectData);
      console.log('Projects loaded for modal:', projectData.filter(p => p.customer_id === customer.id));
    } catch (error) {
      console.error('Error loading projects:', error);
    }
    setProjectsCustomer(customer);
    setEditingProject(null);
    setShowProjectsModal(true);
  };

  const getCustomerProjects = () => {
    if (!projectsCustomer) return [];
    return projects.filter(p => p.customer_id === projectsCustomer.id);
  };

  const startEditProject = (project: Project) => {
    setEditingProject(project);
    setEditProjectNumber(project.project_number || '');
    setEditProjectName(project.name || '');
    setEditProjectDescription(project.description || '');
  };

  const cancelEditProject = () => {
    setEditingProject(null);
    setEditProjectNumber('');
    setEditProjectName('');
    setEditProjectDescription('');
  };

  const saveProjectChanges = async () => {
    if (!editingProject) return;
    
    if (!editProjectName.trim()) {
      Alert.alert(t('common.error'), 'Bitte geben Sie einen Projektnamen ein');
      return;
    }
    
    // Duplikat-Prüfung für Projektnummer
    if (editProjectNumber && editProjectNumber !== editingProject.project_number) {
      const isDuplicate = await isProjectNumberDuplicate(editProjectNumber, editingProject.id);
      if (isDuplicate) {
        Alert.alert(
          'Projektnummer bereits vergeben',
          `Die Projektnummer "${editProjectNumber}" existiert bereits. Was möchten Sie tun?`,
          [
            { text: t('common.cancel'), style: 'cancel' },
            { 
              text: 'Trotzdem behalten', 
              onPress: () => doSaveProjectChanges(editProjectNumber)
            },
            {
              text: 'Neue Nummer vergeben',
              onPress: async () => {
                const newNumber = await getNextAvailableProjectNumber();
                doSaveProjectChanges(newNumber);
              }
            }
          ]
        );
        return;
      }
    }
    
    await doSaveProjectChanges(editProjectNumber);
  };
  
  const doSaveProjectChanges = async (projectNumber: string) => {
    if (!editingProject) return;
    
    setSavingProject(true);
    try {
      await ProjectService.update(editingProject.id, {
        ...editingProject,
        project_number: projectNumber || undefined,
        name: editProjectName,
        description: editProjectDescription || undefined,
      });
      
      // Reload projects
      const projectData = await ProjectService.getAll();
      setProjects(projectData);
      
      cancelEditProject();
      Alert.alert(t('common.success'), 'Projekt wurde aktualisiert');
    } catch (error) {
      console.error('Error saving project:', error);
      Alert.alert(t('common.error'), 'Projekt konnte nicht gespeichert werden');
    } finally {
      setSavingProject(false);
    }
  };

  const navigateToProject = (project: Project) => {
    setShowProjectsModal(false);
    router.push(`/projects/${project.id}`);
  };

  // Sortier-Funktion
  const getSortLabel = () => {
    switch (sortBy) {
      case 'name_asc': return 'Name A-Z';
      case 'name_desc': return 'Name Z-A';
      case 'number_asc': return 'KD-Nr. ↑';
      case 'number_desc': return 'KD-Nr. ↓';
      case 'date_desc': return 'Neueste';
      case 'date_asc': return 'Älteste';
      default: return 'Sortieren';
    }
  };

  const changeSortOrder = () => {
    const sortOptions: Array<'name_asc' | 'name_desc' | 'number_asc' | 'number_desc' | 'date_desc' | 'date_asc'> = [
      'name_asc', 'name_desc', 'number_asc', 'number_desc', 'date_desc', 'date_asc'
    ];
    const currentIndex = sortOptions.indexOf(sortBy);
    const nextIndex = (currentIndex + 1) % sortOptions.length;
    setSortBy(sortOptions[nextIndex]);
  };

  const filteredCustomers = customers
    .filter(customer =>
      customer.lastName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      customer.firstName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      customer.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      customer.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      customer.phone?.includes(searchQuery) ||
      customer.customer_number?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      customer.customerType?.toLowerCase().includes(searchQuery.toLowerCase())
    )
    .sort((a, b) => {
      switch (sortBy) {
        case 'name_asc':
          return (a.lastName || a.name || '').localeCompare(b.lastName || b.name || '', 'de');
        case 'name_desc':
          return (b.lastName || b.name || '').localeCompare(a.lastName || a.name || '', 'de');
        case 'number_asc':
          return (a.customer_number || 'ZZZ').localeCompare(b.customer_number || 'ZZZ');
        case 'number_desc':
          return (b.customer_number || '').localeCompare(a.customer_number || '');
        case 'date_desc':
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        case 'date_asc':
          return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        default:
          return 0;
      }
    });

  const renderCustomer = ({ item }: { item: Customer }) => (
    <View style={[styles.customerCard, isPhone && styles.customerCardPhone]}>
      <TouchableOpacity
        style={[styles.customerMainArea, isPhone && styles.customerMainAreaPhone]}
        onPress={async () => {
          if (selectMode) {
            // Im Auswahlmodus: Kunde in AsyncStorage speichern und zurück navigieren
            console.log('Customer selected:', item.id, item.name);
            await AsyncStorage.setItem('selectedCustomerId', item.id);
            router.back();
          } else {
            // Normaler Modus: Zur Bearbeitung navigieren
            console.log('Navigating to customer with ID:', item.id);
            router.push(`/customers/${item.id}`);
          }
        }}
      >
        <View style={[styles.customerAvatar, isPhone && styles.customerAvatarPhone]}>
          <Text style={[styles.customerInitial, isPhone && styles.customerInitialPhone]}>
            {(item.lastName?.charAt(0) || item.name?.charAt(0) || '?').toUpperCase()}
          </Text>
        </View>
        <View style={styles.customerInfo}>
          {/* iPhone: Kundennummer über dem Namen, iPad: nebeneinander */}
          {isPhone ? (
            <View style={styles.customerNameColumnPhone}>
              {item.customer_number && (
                <Text style={styles.customerNumberAbove}>{item.customer_number}</Text>
              )}
              {item.customerType && (
                <Text style={{ color: '#1976d2', fontSize: 11, fontWeight: '600' }}>{item.customerType}</Text>
              )}
              <Text style={styles.customerNamePhone} numberOfLines={1} ellipsizeMode="tail">{item.name || 'Unbekannt'}</Text>
            </View>
          ) : (
            <View style={styles.customerNameRow}>
              {item.customer_number && (
                <Text style={styles.customerNumber}>{item.customer_number}</Text>
              )}
              {item.customerType && (
                <Text style={{ color: '#1976d2', fontSize: 12, fontWeight: '600', marginRight: 6 }}>{item.customerType}</Text>
              )}
              <Text style={styles.customerName} numberOfLines={1} ellipsizeMode="tail">{item.name || 'Unbekannt'}</Text>
            </View>
          )}
          {item.email && (
            <Text style={[styles.customerDetail, isPhone && styles.customerDetailPhone]} numberOfLines={1} ellipsizeMode="tail">
              <Ionicons name="mail" size={isPhone ? 10 : 12} color="#666" /> {item.email}
            </Text>
          )}
          {item.phone && (
            <Text style={[styles.customerDetail, isPhone && styles.customerDetailPhone]} numberOfLines={1} ellipsizeMode="tail">
              <Ionicons name="call" size={isPhone ? 10 : 12} color="#666" /> {item.phone}
            </Text>
          )}
        </View>
        {selectMode && (
          <Ionicons name="chevron-forward" size={20} color="#1976d2" />
        )}
      </TouchableOpacity>
      {!selectMode && (
      <View>
        <View style={[styles.customerActions, isPhone && styles.customerActionsPhone]}>
          {/* Projekte-Button mit Label */}
          <TouchableOpacity
            style={[styles.actionButtonWithLabel, isPhone && styles.actionButtonWithLabelPhone]}
            onPress={() => openProjectsModal(item)}
          >
            <View style={styles.iconContainer}>
              <Ionicons name="folder-open" size={isPhone ? 18 : 22} color="#9c27b0" />
              {projects.filter(p => p.customer_id === item.id).length > 0 && (
                <View style={styles.projectsBadge}>
                  <Text style={styles.projectsBadgeText}>
                    {projects.filter(p => p.customer_id === item.id).length}
                  </Text>
                </View>
              )}
            </View>
            {!isPhone && <Text style={styles.actionButtonLabel}>Projekte</Text>}
          </TouchableOpacity>
          
          {/* Objekte/Adressen-Button mit Label */}
          <TouchableOpacity
            style={[styles.actionButtonWithLabel, isPhone && styles.actionButtonWithLabelPhone]}
            onPress={() => openAddressModal(item)}
          >
            <View style={styles.iconContainer}>
              <Ionicons name="home" size={isPhone ? 18 : 22} color="#ff9800" />
              {(item.projectAddresses?.length || 0) > 0 && (
                <View style={styles.addressBadge}>
                  <Text style={styles.addressBadgeText}>{item.projectAddresses?.length}</Text>
                </View>
              )}
            </View>
            {!isPhone && <Text style={styles.actionButtonLabel}>Objekte</Text>}
          </TouchableOpacity>
          
          {/* Auf iPad: Neues Projekt + Löschen in gleicher Zeile */}
          {!isPhone && (
            <>
              <TouchableOpacity
                style={[styles.newProjectButton, { flexDirection: 'row', alignItems: 'center', gap: 3 }]}
                onPress={() => router.push(`/projects/new?customer_id=${item.id}`)}
              >
                <Ionicons name="add-circle" size={28} color="#4caf50" />
                <Text style={{ color: '#4caf50', fontSize: 12, fontWeight: '600' }}>Neues Projekt</Text>
              </TouchableOpacity>
            </>
          )}
          <TouchableOpacity
            onPress={() => openDeleteModal(item)}
            style={styles.deleteButton}
          >
            <Ionicons name="trash-outline" size={isPhone ? 16 : 20} color="#f44336" />
          </TouchableOpacity>
        </View>
        
        {/* iPhone: Zweite Zeile mit Neues Projekt */}
        {isPhone && (
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', marginTop: 4, gap: 8, paddingRight: 2 }}>
            <TouchableOpacity
              style={{ flexDirection: 'row', alignItems: 'center', gap: 3, paddingVertical: 4, paddingHorizontal: 6, backgroundColor: '#e8f5e9', borderRadius: 8 }}
              onPress={() => router.push(`/projects/new?customer_id=${item.id}`)}
            >
              <Ionicons name="add-circle" size={18} color="#4caf50" />
              <Text style={{ color: '#4caf50', fontSize: 11, fontWeight: '600' }}>Neues Projekt</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
      )}
    </View>
  );

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#1976d2" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header mit Zurück-Button (immer sichtbar, nicht nur im selectMode) */}
      <View style={styles.mainHeader}>
        <TouchableOpacity onPress={() => router.push('/')} style={styles.backButtonMain}>
          <Ionicons name="arrow-back" size={24} color="#1976d2" />
        </TouchableOpacity>
        <Text style={styles.mainHeaderTitle}>Startseite</Text>
        <View style={{ width: 40 }} />
      </View>
      
      {selectMode && (
        <View style={styles.selectModeHeader}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#1976d2" />
          </TouchableOpacity>
          <Text style={styles.selectModeTitle}>Projekteingabe</Text>
        </View>
      )}
      <View style={styles.header}>
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={20} color="#666" />
          <TextInput
            style={styles.searchInput}
            placeholderTextColor="#999" placeholder={t('customers.searchPlaceholder')}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => router.push(selectMode ? '/customers/new?selectMode=true' : '/customers/new')}
        >
          <Ionicons name="add" size={24} color="#fff" />
        </TouchableOpacity>
      </View>
      
      {/* Sortier-Button */}
      <View style={styles.sortRow}>
        <TouchableOpacity style={styles.sortButton} onPress={changeSortOrder}>
          <Ionicons name="swap-vertical" size={16} color="#1976d2" />
          <Text style={styles.sortButtonText}>{getSortLabel()}</Text>
        </TouchableOpacity>
        <Text style={styles.customerCount}>{filteredCustomers.length} Kunden</Text>
      </View>

      {filteredCustomers.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="people-outline" size={64} color="#ccc" />
          <Text style={styles.emptyText}>Keine Kunden gefunden</Text>
        </View>
      ) : (
        <FlatList
          data={filteredCustomers}
          renderItem={renderCustomer}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.customerList}
        />
      )}

      {/* Delete Confirmation Modal */}
      <Modal
        visible={showDeleteModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowDeleteModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Ionicons name="warning" size={48} color="#f44336" style={{ marginBottom: 16 }} />
            <Text style={styles.modalTitle}>Kunde löschen?</Text>
            <Text style={styles.modalText}>
              Möchten Sie "{customerToDelete?.name}" wirklich löschen?
            </Text>
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => {
                  setShowDeleteModal(false);
                  setCustomerToDelete(null);
                }}
                disabled={isDeleting}
              >
                <Text style={styles.cancelButtonText}>Abbrechen</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.confirmButton]}
                onPress={confirmDelete}
                disabled={isDeleting}
              >
                <Text style={styles.confirmButtonText}>
                  {isDeleting ? 'Löschen...' : 'Löschen'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Address Management Modal */}
      <Modal
        visible={showAddressModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowAddressModal(false)}
      >
        <View style={styles.addressModalOverlay}>
          <View style={styles.addressModalContent}>
            <View style={styles.addressModalHeader}>
              <Text style={styles.addressModalTitle}>
                Projektadressen - {selectedCustomer?.name}
              </Text>
              <TouchableOpacity onPress={() => setShowAddressModal(false)}>
                <Ionicons name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>

            <ScrollView 
              style={styles.addressList}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={true}
            >
              {/* Bestehende Adressen */}
              {selectedCustomer?.projectAddresses?.map((address) => (
                <View key={address.id} style={styles.addressItem}>
                  <TouchableOpacity 
                    style={styles.addressItemContent}
                    onPress={() => goToAufmass(address)}
                  >
                    <View style={styles.addressItemHeader}>
                      {address.object_number && (
                        <Text style={styles.objectNumberBadge}>{address.object_number}</Text>
                      )}
                      <Text style={styles.addressItemName}>{address.name}</Text>
                    </View>
                    {address.objectName && (
                      <Text style={styles.addressItemObjectName}>{address.objectName}</Text>
                    )}
                    <Text style={styles.addressItemDetails}>
                      {address.street}{address.street && (address.zip || address.city) ? ', ' : ''}
                      {address.zip} {address.city}
                    </Text>
                    {(address.contactPerson || address.phone || address.email) && (
                      <View style={styles.addressItemExtraInfo}>
                        {address.contactPerson && (
                          <Text style={styles.addressItemExtraText}>
                            <Text style={styles.addressItemExtraLabel}>Ansprechpartner: </Text>
                            {address.contactPerson}
                          </Text>
                        )}
                        {address.phone && (
                          <Text style={styles.addressItemExtraText}>
                            <Text style={styles.addressItemExtraLabel}>Tel: </Text>
                            {address.phone}
                          </Text>
                        )}
                        {address.email && (
                          <Text style={styles.addressItemExtraText}>
                            <Text style={styles.addressItemExtraLabel}>E-Mail: </Text>
                            {address.email}
                          </Text>
                        )}
                      </View>
                    )}
                  </TouchableOpacity>
                  <View style={styles.addressItemActions}>
                    <TouchableOpacity 
                      style={styles.aufmassButton}
                      onPress={() => goToAufmass(address)}
                    >
                      <Ionicons name="resize" size={16} color="#fff" />
                      <Text style={styles.aufmassButtonText}>Aufmaß</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => editAddress(address)}>
                      <Ionicons name="pencil" size={20} color="#1976d2" />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => deleteAddress(address.id)}>
                      <Ionicons name="trash-outline" size={20} color="#f44336" />
                    </TouchableOpacity>
                  </View>
                </View>
              ))}

              {(!selectedCustomer?.projectAddresses || selectedCustomer.projectAddresses.length === 0) && !editingAddress && (
                <Text style={styles.noAddressesText}>
                  Noch keine Projektadressen hinterlegt
                </Text>
              )}

            {/* Formular für neue/bearbeitete Adresse */}
            <View style={styles.addressForm}>
              <Text style={styles.addressFormTitle}>
                {editingAddress ? 'Adresse bearbeiten' : 'Neue Adresse hinzufügen'}
              </Text>
              
              <Text style={styles.fieldLabel}>Objektnummer (optional)</Text>
              <TextInput
                style={styles.addressInput}
                placeholderTextColor="#999" placeholder="Wird automatisch vergeben (z.B. OBJ-26001)"
                value={addressObjectNumber}
                onChangeText={setAddressObjectNumber}
                placeholderTextColor="#999"
              />
              <Text style={styles.fieldHint}>Leer lassen für automatische Vergabe</Text>
              
              <Text style={styles.fieldLabel}>Bezeichnung *</Text>
              <TextInput
                style={styles.addressInput}
                placeholderTextColor="#999" placeholder="z.B. Haupthaus, Garage"
                value={addressName}
                onChangeText={setAddressName}
                placeholderTextColor="#999"
              />
              
              <Text style={styles.fieldLabel}>Beschreibung</Text>
              <TextInput
                style={[styles.addressInput, styles.textArea]}
                placeholderTextColor="#999" placeholder="Optional"
                value={addressDescription}
                onChangeText={setAddressDescription}
                multiline
                numberOfLines={2}
                placeholderTextColor="#999"
              />
              
              <Text style={styles.fieldLabel}>Objektname</Text>
              <TextInput
                style={styles.addressInput}
                placeholderTextColor="#999" placeholder="Optional"
                value={addressObjectName}
                onChangeText={setAddressObjectName}
                placeholderTextColor="#999"
              />
              
              <Text style={styles.fieldLabel}>Straße und Hausnummer</Text>
              <TextInput
                style={styles.addressInput}
                placeholderTextColor="#999" placeholder="Straße und Hausnummer"
                value={addressStreet}
                onChangeText={setAddressStreet}
                placeholderTextColor="#999"
              />
              
              <View style={styles.addressInputRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>PLZ</Text>
                  <TextInput
                    style={styles.addressInput}
                    placeholderTextColor="#999" placeholder="PLZ"
                    value={addressZip}
                    onChangeText={setAddressZip}
                    keyboardType="number-pad"
                    placeholderTextColor="#999"
                  />
                </View>
                <View style={{ flex: 2 }}>
                  <Text style={styles.fieldLabel}>Ort</Text>
                  <TextInput
                    style={styles.addressInput}
                    placeholderTextColor="#999" placeholder="Stadt"
                    value={addressCity}
                    onChangeText={setAddressCity}
                    placeholderTextColor="#999"
                  />
                </View>
              </View>
              
              <Text style={styles.fieldLabel}>Ansprechpartner</Text>
              <TextInput
                style={styles.addressInput}
                placeholderTextColor="#999" placeholder="Ansprechpartner"
                value={addressContactPerson}
                onChangeText={setAddressContactPerson}
                placeholderTextColor="#999"
              />
              
              <View style={styles.addressRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>Telefon</Text>
                  <TextInput
                    style={styles.addressInput}
                    placeholderTextColor="#999" placeholder="Telefon"
                    value={addressPhone}
                    onChangeText={setAddressPhone}
                    keyboardType="phone-pad"
                    placeholderTextColor="#999"
                  />
                </View>
                <View style={{ flex: 1.5 }}>
                  <Text style={styles.fieldLabel}>E-Mail</Text>
                  <TextInput
                    style={styles.addressInput}
                    placeholderTextColor="#999" placeholder="E-Mail"
                    value={addressEmail}
                    onChangeText={setAddressEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    placeholderTextColor="#999"
                  />
                </View>
              </View>
              
              <View style={styles.addressFormButtons}>
                {editingAddress && (
                  <TouchableOpacity 
                    style={styles.addressCancelButton}
                    onPress={resetAddressForm}
                  >
                    <Text style={styles.addressCancelButtonText}>Abbrechen</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity 
                  style={styles.addressSaveButton}
                  onPress={saveAddress}
                >
                  <Ionicons name={editingAddress ? "checkmark" : "add"} size={20} color="#fff" />
                  <Text style={styles.addressSaveButtonText}>
                    {editingAddress ? 'Speichern' : 'Hinzufügen'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Projects Modal */}
      <Modal
        visible={showProjectsModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowProjectsModal(false)}
      >
        <View style={styles.projectsModalOverlay}>
          <View style={styles.projectsModalContent}>
            <View style={styles.projectsModalHeader}>
              <Text style={styles.projectsModalTitle}>
                Projekte von {projectsCustomer?.name}
              </Text>
              <TouchableOpacity 
                onPress={() => {
                  setShowProjectsModal(false);
                  cancelEditProject();
                }}
                style={styles.projectsModalClose}
              >
                <Ionicons name="close-circle" size={28} color="#666" />
              </TouchableOpacity>
            </View>
            
            <ScrollView style={styles.projectsScrollView} contentContainerStyle={styles.projectsScrollContent}>
              {getCustomerProjects().length === 0 ? (
                <View style={styles.noProjectsContainer}>
                  <Ionicons name="folder-open-outline" size={48} color="#ccc" />
                  <Text style={styles.noProjectsText}>Keine Projekte vorhanden</Text>
                  <TouchableOpacity
                    style={styles.createProjectButton}
                    onPress={() => {
                      setShowProjectsModal(false);
                      router.push(`/projects/new?customer_id=${projectsCustomer?.id}`);
                    }}
                  >
                    <Ionicons name="add-circle" size={20} color="#fff" />
                    <Text style={styles.createProjectButtonText}>{t('projects.newProject')}</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                getCustomerProjects().map((project) => (
                  <View key={project.id} style={styles.projectItem}>
                    {editingProject?.id === project.id ? (
                      // Edit Mode
                      <View style={styles.projectEditForm}>
                        <Text style={styles.projectEditLabel}>Projektnummer</Text>
                        <TextInput
                          style={styles.projectEditInput}
                          placeholderTextColor="#999" placeholder="z.B. PR-26001"
                          value={editProjectNumber}
                          onChangeText={setEditProjectNumber}
                          placeholderTextColor="#999"
                        />
                        
                        <Text style={styles.projectEditLabel}>Projektname *</Text>
                        <TextInput
                          style={styles.projectEditInput}
                          placeholderTextColor="#999" placeholder="Projektname"
                          value={editProjectName}
                          onChangeText={setEditProjectName}
                          placeholderTextColor="#999"
                        />
                        
                        <Text style={styles.projectEditLabel}>Beschreibung</Text>
                        <TextInput
                          style={[styles.projectEditInput, styles.projectEditTextarea]}
                          placeholderTextColor="#999" placeholder="Beschreibung"
                          value={editProjectDescription}
                          onChangeText={setEditProjectDescription}
                          multiline
                          numberOfLines={3}
                          placeholderTextColor="#999"
                        />
                        
                        <View style={styles.projectEditButtons}>
                          <TouchableOpacity
                            style={styles.projectCancelButton}
                            onPress={cancelEditProject}
                          >
                            <Text style={styles.projectCancelButtonText}>Abbrechen</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={styles.projectSaveButton}
                            onPress={saveProjectChanges}
                            disabled={savingProject}
                          >
                            {savingProject ? (
                              <ActivityIndicator size="small" color="#fff" />
                            ) : (
                              <>
                                <Ionicons name="checkmark" size={18} color="#fff" />
                                <Text style={styles.projectSaveButtonText}>Speichern</Text>
                              </>
                            )}
                          </TouchableOpacity>
                        </View>
                      </View>
                    ) : (
                      // View Mode
                      <View style={styles.projectItemContent}>
                        <TouchableOpacity
                          style={styles.projectItemInfo}
                          onPress={() => navigateToProject(project)}
                        >
                          <View style={styles.projectItemHeader}>
                            {project.project_number && (
                              <Text style={styles.projectItemNumber}>{project.project_number}</Text>
                            )}
                            <Text style={styles.projectItemName}>{project.name}</Text>
                          </View>
                          {project.description && (
                            <Text style={styles.projectItemDescription} numberOfLines={1}>
                              {project.description}
                            </Text>
                          )}
                          <Text style={styles.projectItemStatus}>
                            Status: {project.status}
                          </Text>
                        </TouchableOpacity>
                        <View style={styles.projectItemActions}>
                          <TouchableOpacity
                            style={styles.projectEditButton}
                            onPress={() => startEditProject(project)}
                            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                          >
                            <Ionicons name="create-outline" size={22} color="#1976d2" />
                          </TouchableOpacity>
                        </View>
                      </View>
                    )}
                  </View>
                ))
              )}
            </ScrollView>
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
  mainHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingTop: Platform.OS === 'ios' ? 50 : (StatusBar.currentHeight || 24) + 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  backButtonMain: {
    padding: 8,
    marginRight: 8,
  },
  mainHeaderTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  searchContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    paddingHorizontal: 12,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    height: 40,
    fontSize: 16,
  },
  addButton: {
    width: 48,
    height: 48,
    backgroundColor: '#1976d2',
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  customerList: {
    padding: 16,
  },
  sortRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#f8f9fa',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  sortButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: '#e3f2fd',
    borderRadius: 8,
    gap: 6,
  },
  sortButtonText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#1976d2',
  },
  customerCount: {
    fontSize: 12,
    color: '#666',
  },
  customerCard: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  customerCardPhone: {
    padding: 8,
  },
  customerMainArea: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  customerMainAreaPhone: {
    flex: 1,
  },
  customerAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#1976d2',
    justifyContent: 'center',
    alignItems: 'center',
  },
  customerAvatarPhone: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  customerInitial: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '600',
  },
  customerInitialPhone: {
    fontSize: 16,
  },
  customerInfo: {
    flex: 1,
    marginLeft: 12,
  },
  customerNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 2,
  },
  customerNameColumnPhone: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    marginBottom: 2,
  },
  customerNumberAbove: {
    fontSize: 10,
    fontWeight: '600',
    color: '#1976d2',
    backgroundColor: '#e3f2fd',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 3,
    marginBottom: 2,
  },
  customerNumber: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1976d2',
    backgroundColor: '#e3f2fd',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  customerNumberPhone: {
    fontSize: 10,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  customerName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    flexShrink: 1,
  },
  customerNamePhone: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#333',
  },
  customerDetail: {
    fontSize: 13,
    color: '#666',
    marginTop: 2,
  },
  customerDetailPhone: {
    fontSize: 11,
  },
  customerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  customerActionsPhone: {
    gap: 2,
  },
  actionButtonWithLabelPhone: {
    paddingHorizontal: 4,
  },
  newProjectButton: {
    padding: 4,
  },
  deleteButton: {
    padding: 8,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyText: {
    fontSize: 18,
    color: '#666',
    marginTop: 16,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    width: '100%',
    maxWidth: 340,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
  },
  modalText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 22,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  modalButton: {
    flex: 1,
    padding: 14,
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
  confirmButton: {
    backgroundColor: '#f44336',
  },
  confirmButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  // Address Button & Badge
  addressButton: {
    padding: 4,
    position: 'relative',
  },
  addressBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    backgroundColor: '#ff9800',
    borderRadius: 10,
    minWidth: 16,
    height: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addressBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
  },
  // Address Modal
  addressModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-start',
    paddingTop: 50,
    paddingHorizontal: 15,
  },
  addressModalContent: {
    backgroundColor: '#fff',
    borderRadius: 20,
    width: '100%',
    height: 450,
  },
  addressModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  addressModalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    flex: 1,
  },
  fieldHint: {
    fontSize: 12,
    color: '#888',
    marginTop: 4,
    marginBottom: 8,
    fontStyle: 'italic',
  },
  addressList: {
    flex: 1,
    padding: 16,
  },
  addressRow: {
    flexDirection: 'row',
    gap: 8,
  },
  addressItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f9f9f9',
    padding: 12,
    borderRadius: 10,
    marginBottom: 8,
  },
  addressItemContent: {
    flex: 1,
  },
  addressItemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  objectNumberBadge: {
    fontSize: 10,
    fontWeight: '600',
    color: '#ff9800',
    backgroundColor: '#fff3e0',
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 3,
  },
  addressItemName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#333',
  },
  addressItemObjectName: {
    fontSize: 13,
    color: '#1976d2',
    marginTop: 2,
    fontStyle: 'italic',
  },
  addressItemDetails: {
    fontSize: 13,
    color: '#666',
    marginTop: 2,
  },
  addressItemExtraInfo: {
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  addressItemExtraText: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  addressItemExtraLabel: {
    fontWeight: '600',
    color: '#333',
  },
  addressItemActions: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  aufmassButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ff9800',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    gap: 4,
  },
  aufmassButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  noAddressesText: {
    textAlign: 'center',
    color: '#999',
    fontSize: 14,
    padding: 20,
  },
  addressForm: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    backgroundColor: '#f5f5f5',
  },
  addressFormTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginBottom: 12,
  },
  addressInput: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    marginBottom: 8,
    color: '#333',
  },
  textArea: {
    minHeight: 60,
    textAlignVertical: 'top',
  },
  addressInputRow: {
    flexDirection: 'row',
    gap: 8,
  },
  addressFormButtons: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
  },
  addressCancelButton: {
    flex: 1,
    backgroundColor: '#e0e0e0',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  addressCancelButtonText: {
    color: '#666',
    fontSize: 15,
    fontWeight: '600',
  },
  addressSaveButton: {
    flex: 2,
    backgroundColor: '#4caf50',
    padding: 12,
    borderRadius: 8,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
  },
  addressSaveButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1976d2',
    marginBottom: 4,
    marginTop: 10,
  },
  selectModeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  backButton: {
    padding: 8,
  },
  selectModeTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginLeft: 8,
  },
  // Projects Button and Modal Styles
  actionButtonWithLabel: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  iconContainer: {
    position: 'relative',
    padding: 4,
  },
  actionButtonLabel: {
    fontSize: 10,
    color: '#666',
    marginTop: 2,
  },
  projectsButton: {
    padding: 8,
    position: 'relative',
  },
  projectsBadge: {
    position: 'absolute',
    top: 2,
    right: 2,
    backgroundColor: '#9c27b0',
    borderRadius: 10,
    minWidth: 16,
    height: 16,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  projectsBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
  },
  projectsScrollView: {
    flex: 1,
  },
  projectsScrollContent: {
    padding: 16,
  },
  // Projects Modal Styles
  projectsModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 60,
  },
  projectsModalContent: {
    backgroundColor: '#fff',
    borderRadius: 16,
    flex: 1,
    maxHeight: '80%',
  },
  projectsModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  projectsModalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    flex: 1,
  },
  projectsModalClose: {
    padding: 4,
  },
  noProjectsContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  noProjectsText: {
    color: '#999',
    fontSize: 16,
    marginTop: 12,
    marginBottom: 20,
  },
  createProjectButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#4caf50',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    gap: 8,
  },
  createProjectButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  projectItem: {
    backgroundColor: '#fff',
    borderRadius: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    overflow: 'hidden',
  },
  projectItemContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
  },
  projectItemInfo: {
    flex: 1,
  },
  projectItemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  projectItemNumber: {
    fontSize: 11,
    fontWeight: '600',
    color: '#4caf50',
    backgroundColor: '#e8f5e9',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  projectItemName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    flexShrink: 1,
  },
  projectItemDescription: {
    fontSize: 13,
    color: '#666',
    marginTop: 4,
  },
  projectItemStatus: {
    fontSize: 12,
    color: '#999',
    marginTop: 4,
  },
  projectItemActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  projectEditButton: {
    padding: 10,
    backgroundColor: '#e3f2fd',
    borderRadius: 8,
    marginLeft: 10,
  },
  projectEditForm: {
    padding: 14,
  },
  projectEditLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#333',
    marginBottom: 6,
    marginTop: 10,
  },
  projectEditInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    backgroundColor: '#fff',
  },
  projectEditTextarea: {
    minHeight: 70,
    textAlignVertical: 'top',
  },
  projectEditButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 16,
  },
  projectCancelButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#f5f5f5',
  },
  projectCancelButtonText: {
    color: '#666',
    fontSize: 14,
    fontWeight: '600',
  },
  projectSaveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#1976d2',
    gap: 6,
  },
  projectSaveButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
});

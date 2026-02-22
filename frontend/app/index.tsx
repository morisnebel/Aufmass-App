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
} from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { ProjectService, CustomerService, RoofService, PhotoService, SketchService, ChecklistService, Project, Customer } from '../services/LocalStorage';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { readAsStringAsync } from 'expo-file-system/legacy';

export default function HomeScreen() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [customers, setCustomers] = useState<{ [key: string]: Customer }>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

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
      if (importData.customer) {
        const existingCustomer = await CustomerService.getById(importData.customer.id);
        if (!existingCustomer) {
          newCustomerId = generateId();
          await CustomerService.create({
            ...importData.customer,
            id: undefined,
            created_at: undefined,
            updated_at: undefined,
          });
        }
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

  const renderProject = ({ item }: { item: Project }) => {
    const customer = customers[item.customer_id];
    return (
      <TouchableOpacity
        style={styles.projectCard}
        onPress={() => router.push(`/projects/${item.id}`)}
      >
        <View style={styles.projectHeader}>
          <Ionicons name="folder" size={24} color="#1976d2" />
          <View style={styles.projectInfo}>
            <Text style={styles.projectName}>{item.name}</Text>
            {customer && (
              <Text style={styles.customerName}>{customer.name}</Text>
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
          <View style={styles.statusBadge}>
            <Text style={styles.statusText}>{item.status}</Text>
          </View>
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
      </View>

      <View style={styles.actionButtons}>
        <View style={styles.buttonRow}>
          <TouchableOpacity
            style={[styles.button, styles.primaryButton]}
            onPress={() => router.push('/projects/new')}
          >
            <Ionicons name="add" size={24} color="#fff" />
            <Text style={styles.buttonText}>Neues Projekt</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, styles.secondaryButton]}
            onPress={() => router.push('/customers')}
          >
            <Ionicons name="people" size={24} color="#1976d2" />
            <Text style={styles.secondaryButtonText}>Kunden</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.buttonRow}>
          <TouchableOpacity
            style={[styles.button, styles.secondaryButton]}
            onPress={() => router.push('/checklists/templates')}
          >
            <Ionicons name="list" size={24} color="#1976d2" />
            <Text style={styles.secondaryButtonText}>Checklisten</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, styles.secondaryButton]}
            onPress={() => router.push('/settings')}
          >
            <Ionicons name="settings-outline" size={24} color="#1976d2" />
            <Text style={styles.secondaryButtonText}>Einstellungen</Text>
          </TouchableOpacity>
        </View>

        {/* Import Button */}
        <TouchableOpacity
          style={styles.importButtonContainer}
          onPress={importProjectFile}
        >
          <Ionicons name="cloud-download" size={22} color="#2e7d32" />
          <Text style={styles.importButtonText}>Projekt aus Datei importieren</Text>
        </TouchableOpacity>
      </View>

      {projects.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="folder-open-outline" size={64} color="#ccc" />
          <Text style={styles.emptyText}>Keine Projekte vorhanden</Text>
          <Text style={styles.emptySubtext}>
            Erstellen Sie Ihr erstes Projekt
          </Text>
        </View>
      ) : (
        <FlatList
          data={projects}
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
  actionButtons: {
    padding: 16,
    gap: 12,
  },
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
  primaryButton: {
    backgroundColor: '#1976d2',
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
  importButtonContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#e8f5e9',
    borderWidth: 2,
    borderColor: '#4caf50',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginTop: 8,
    marginHorizontal: 16,
    gap: 10,
  },
  importButtonText: {
    color: '#2e7d32',
    fontSize: 15,
    fontWeight: '700',
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
  projectName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  customerName: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
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
    backgroundColor: '#e3f2fd',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 12,
    color: '#1976d2',
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

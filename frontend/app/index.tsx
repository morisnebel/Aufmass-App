import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import Constants from 'expo-constants';

const API_URL = Constants.expoConfig?.extra?.EXPO_PUBLIC_BACKEND_URL || process.env.EXPO_PUBLIC_BACKEND_URL;

interface Project {
  id: string;
  name: string;
  description?: string;
  customer_id: string;
  status: string;
  created_at: string;
}

interface Customer {
  id: string;
  name: string;
}

export default function HomeScreen() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [customers, setCustomers] = useState<{ [key: string]: Customer }>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = async () => {
    try {
      const [projectsRes, customersRes] = await Promise.all([
        axios.get(`${API_URL}/api/projects`),
        axios.get(`${API_URL}/api/customers`),
      ]);

      setProjects(projectsRes.data);
      
      const customerMap: { [key: string]: Customer } = {};
      customersRes.data.forEach((customer: Customer) => {
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

  useEffect(() => {
    loadData();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
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
              await axios.delete(`${API_URL}/api/projects/${projectId}`);
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
          source={{ uri: 'https://customer-assets.emergentagent.com/job_measure-master-31/artifacts/pf6s0rym_LOGO%202025.png' }}
          style={styles.logo}
          resizeMode="contain"
        />
      </View>

      <View style={styles.actionButtons}>
        <TouchableOpacity
          style={[styles.button, styles.primaryButton]}
          onPress={() => router.push('/projects/new')}
        >
          <Ionicons name="add" size={20} color="#fff" />
          <Text style={styles.buttonText}>Neues Projekt</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.button, styles.secondaryButton]}
          onPress={() => router.push('/customers/index')}
        >
          <Ionicons name="people" size={20} color="#1976d2" />
          <Text style={styles.secondaryButtonText}>Kunden</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.button, styles.secondaryButton]}
          onPress={() => router.push('/checklists/templates')}
        >
          <Ionicons name="list" size={20} color="#1976d2" />
          <Text style={styles.secondaryButtonText}>Checklisten</Text>
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
    backgroundColor: '#fff',
    padding: 16,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  logo: {
    width: 200,
    height: 80,
  },
  actionButtons: {
    flexDirection: 'row',
    padding: 16,
    gap: 8,
  },
  button: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    borderRadius: 8,
    gap: 6,
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

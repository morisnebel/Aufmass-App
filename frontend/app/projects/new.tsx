import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
  Modal,
  FlatList,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import Constants from 'expo-constants';

const API_URL = Constants.expoConfig?.extra?.EXPO_PUBLIC_BACKEND_URL || process.env.EXPO_PUBLIC_BACKEND_URL;

interface Customer {
  id: string;
  name: string;
  address?: string;
  phone?: string;
  email?: string;
}

export default function NewProjectScreen() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingCustomers, setLoadingCustomers] = useState(true);
  
  // Customer picker modal
  const [showCustomerPicker, setShowCustomerPicker] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    loadCustomers();
  }, []);

  const loadCustomers = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/customers`);
      setCustomers(response.data);
      if (response.data.length > 0) {
        setCustomerId(response.data[0].id);
        setSelectedCustomer(response.data[0]);
      }
    } catch (error) {
      console.error('Error loading customers:', error);
      Alert.alert('Fehler', 'Kunden konnten nicht geladen werden');
    } finally {
      setLoadingCustomers(false);
    }
  };

  const handleSelectCustomer = (customer: Customer) => {
    setCustomerId(customer.id);
    setSelectedCustomer(customer);
    setShowCustomerPicker(false);
    setSearchQuery('');
  };

  const filteredCustomers = customers.filter(customer =>
    customer.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (customer.address && customer.address.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('Fehler', 'Bitte geben Sie einen Projektnamen ein');
      return;
    }

    if (!customerId) {
      Alert.alert('Fehler', 'Bitte wählen Sie einen Kunden aus');
      return;
    }

    setLoading(true);
    try {
      const response = await axios.post(`${API_URL}/api/projects`, {
        name,
        description: description || undefined,
        customer_id: customerId,
        status: 'active',
      });
      Alert.alert('Erfolg', 'Projekt wurde erstellt', [
        { text: 'OK', onPress: () => router.replace(`/projects/${response.data.id}`) },
      ]);
    } catch (error) {
      console.error('Error creating project:', error);
      Alert.alert('Fehler', 'Projekt konnte nicht erstellt werden');
    } finally {
      setLoading(false);
    }
  };

  if (loadingCustomers) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#1976d2" />
      </View>
    );
  }

  if (customers.length === 0) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.emptyText}>Keine Kunden vorhanden</Text>
        <Text style={styles.emptySubtext}>Erstellen Sie zuerst einen Kunden</Text>
        <TouchableOpacity
          style={styles.button}
          onPress={() => router.push('/customers/new')}
        >
          <Text style={styles.buttonText}>Neuer Kunde</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView style={styles.scrollView}>
        <View style={styles.form}>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Projektname *</Text>
            <TextInput
              style={styles.input}
              placeholder="z.B. Dachsanierung Hauptstraße"
              value={name}
              onChangeText={setName}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Kunde *</Text>
            <TouchableOpacity
              style={styles.customerSelector}
              onPress={() => setShowCustomerPicker(true)}
            >
              <View style={styles.customerSelectorContent}>
                <Ionicons name="person" size={20} color="#666" />
                <View style={styles.customerInfo}>
                  <Text style={styles.customerName}>
                    {selectedCustomer?.name || 'Kunde auswählen...'}
                  </Text>
                  {selectedCustomer?.address && (
                    <Text style={styles.customerAddress} numberOfLines={1}>
                      {selectedCustomer.address}
                    </Text>
                  )}
                </View>
              </View>
              <Ionicons name="chevron-down" size={20} color="#666" />
            </TouchableOpacity>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Beschreibung</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder="Projektbeschreibung..."
              value={description}
              onChangeText={setDescription}
              multiline
              numberOfLines={4}
            />
          </View>

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleSave}
            disabled={loading}
          >
            <Text style={styles.buttonText}>
              {loading ? 'Wird gespeichert...' : 'Projekt erstellen'}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Customer Picker Modal */}
      <Modal
        visible={showCustomerPicker}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowCustomerPicker(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Kunde auswählen</Text>
              <TouchableOpacity
                onPress={() => {
                  setShowCustomerPicker(false);
                  setSearchQuery('');
                }}
              >
                <Ionicons name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>

            <View style={styles.searchContainer}>
              <Ionicons name="search" size={20} color="#666" style={styles.searchIcon} />
              <TextInput
                style={styles.searchInput}
                placeholder="Kunde suchen..."
                value={searchQuery}
                onChangeText={setSearchQuery}
                autoFocus
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setSearchQuery('')}>
                  <Ionicons name="close-circle" size={20} color="#999" />
                </TouchableOpacity>
              )}
            </View>

            <FlatList
              data={filteredCustomers}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.customerItem,
                    item.id === customerId && styles.customerItemSelected,
                  ]}
                  onPress={() => handleSelectCustomer(item)}
                >
                  <View style={styles.customerItemIcon}>
                    <Ionicons 
                      name="person-circle" 
                      size={40} 
                      color={item.id === customerId ? '#1976d2' : '#ccc'} 
                    />
                  </View>
                  <View style={styles.customerItemInfo}>
                    <Text style={[
                      styles.customerItemName,
                      item.id === customerId && styles.customerItemNameSelected,
                    ]}>
                      {item.name}
                    </Text>
                    {item.address && (
                      <Text style={styles.customerItemAddress} numberOfLines={1}>
                        {item.address}
                      </Text>
                    )}
                    {item.phone && (
                      <Text style={styles.customerItemPhone}>
                        <Ionicons name="call-outline" size={12} color="#888" /> {item.phone}
                      </Text>
                    )}
                  </View>
                  {item.id === customerId && (
                    <Ionicons name="checkmark-circle" size={24} color="#1976d2" />
                  )}
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <View style={styles.emptyListContainer}>
                  <Text style={styles.emptyListText}>Keine Kunden gefunden</Text>
                </View>
              }
              style={styles.customerList}
            />

            <TouchableOpacity
              style={styles.newCustomerButton}
              onPress={() => {
                setShowCustomerPicker(false);
                router.push('/customers/new');
              }}
            >
              <Ionicons name="add-circle" size={20} color="#1976d2" />
              <Text style={styles.newCustomerButtonText}>Neuen Kunden anlegen</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
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
    padding: 32,
  },
  scrollView: {
    flex: 1,
  },
  form: {
    padding: 16,
  },
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  textArea: {
    height: 100,
    textAlignVertical: 'top',
  },
  customerSelector: {
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  customerSelectorContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  customerInfo: {
    marginLeft: 12,
    flex: 1,
  },
  customerName: {
    fontSize: 16,
    color: '#333',
    fontWeight: '500',
  },
  customerAddress: {
    fontSize: 13,
    color: '#666',
    marginTop: 2,
  },
  button: {
    backgroundColor: '#1976d2',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 16,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#666',
    marginBottom: 24,
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
    paddingBottom: Platform.OS === 'ios' ? 34 : 16,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    margin: 16,
    marginTop: 8,
    borderRadius: 10,
    paddingHorizontal: 12,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 16,
  },
  customerList: {
    maxHeight: 400,
  },
  customerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  customerItemSelected: {
    backgroundColor: '#e3f2fd',
  },
  customerItemIcon: {
    marginRight: 12,
  },
  customerItemInfo: {
    flex: 1,
  },
  customerItemName: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
  },
  customerItemNameSelected: {
    color: '#1976d2',
  },
  customerItemAddress: {
    fontSize: 13,
    color: '#666',
    marginTop: 2,
  },
  customerItemPhone: {
    fontSize: 12,
    color: '#888',
    marginTop: 2,
  },
  emptyListContainer: {
    padding: 32,
    alignItems: 'center',
  },
  emptyListText: {
    fontSize: 14,
    color: '#666',
  },
  newCustomerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#eee',
    gap: 8,
  },
  newCustomerButtonText: {
    fontSize: 16,
    color: '#1976d2',
    fontWeight: '500',
  },
});

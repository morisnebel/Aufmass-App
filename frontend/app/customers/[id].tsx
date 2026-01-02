import React, { useState, useEffect, useRef } from 'react';
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
  Pressable,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import axios from 'axios';
import Constants from 'expo-constants';
import * as Contacts from 'expo-contacts';
import { Ionicons } from '@expo/vector-icons';

const API_URL = Constants.expoConfig?.extra?.EXPO_PUBLIC_BACKEND_URL || process.env.EXPO_PUBLIC_BACKEND_URL;

// Helper function to extract contact data
function extractContactData(contact: Contacts.Contact) {
  let extractedName = '';
  let extractedEmail = '';
  let extractedPhone = '';
  let extractedAddress = '';

  // Name
  extractedName = contact.name || 
    [contact.firstName, contact.lastName].filter(Boolean).join(' ') || '';

  // Email
  if (contact.emails && contact.emails.length > 0) {
    const emailObj = contact.emails[0] as any;
    extractedEmail = typeof emailObj === 'string' ? emailObj : 
      (emailObj?.email || emailObj?.value || '');
  }

  // Phone
  if (contact.phoneNumbers && contact.phoneNumbers.length > 0) {
    const phoneObj = contact.phoneNumbers[0] as any;
    if (typeof phoneObj === 'string') {
      extractedPhone = phoneObj;
    } else {
      extractedPhone = phoneObj?.number || phoneObj?.digits || phoneObj?.value || '';
    }
  }

  // Address
  if (contact.addresses && contact.addresses.length > 0) {
    const addr = contact.addresses[0] as any;
    if (typeof addr === 'string') {
      extractedAddress = addr;
    } else if (addr?.formattedAddress) {
      extractedAddress = addr.formattedAddress;
    } else {
      const parts = [
        addr?.street,
        [addr?.postalCode, addr?.city].filter(Boolean).join(' '),
        addr?.region,
        addr?.country
      ].filter(Boolean);
      extractedAddress = parts.join(', ');
    }
  }

  return { extractedName, extractedEmail, extractedPhone, extractedAddress };
}

export default function EditCustomerScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  
  // Form state
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  // Contact picker state
  const [showContactPicker, setShowContactPicker] = useState(false);
  const [contacts, setContacts] = useState<Contacts.Contact[]>([]);
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Delete modal state
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  
  // Ref for immediate synchronous protection against loadCustomer overwriting imported data
  const isImportingRef = useRef(false);

  useEffect(() => {
    // Only load customer data if we're not currently importing a contact
    if (!isImportingRef.current) {
      loadCustomer();
    }
  }, [id]);

  const loadCustomer = async () => {
    // Double-check the ref in case of race conditions
    if (isImportingRef.current) {
      console.log('loadCustomer skipped - import in progress');
      setLoading(false);
      return;
    }
    
    try {
      const response = await axios.get(`${API_URL}/api/customers/${id}`);
      const customer = response.data;
      
      // Check again before setting state
      if (!isImportingRef.current) {
        setName(customer.name || '');
        setEmail(customer.email || '');
        setPhone(customer.phone || '');
        setAddress(customer.address || '');
      }
    } catch (error) {
      console.error('Error loading customer:', error);
      Alert.alert('Fehler', 'Kunde konnte nicht geladen werden');
    } finally {
      setLoading(false);
    }
  };

  const openContactPicker = async () => {
    console.log('=== OPEN CONTACT PICKER CALLED ===');
    console.log('Platform.OS:', Platform.OS);
    
    if (Platform.OS === 'web') {
      Alert.alert('Hinweis', 'Kontakt-Import ist nur auf dem iPad/iPhone verfügbar');
      return;
    }

    try {
      console.log('Requesting contacts permission...');
      const { status } = await Contacts.requestPermissionsAsync();
      console.log('Permission status:', status);
      
      if (status !== 'granted') {
        Alert.alert('Berechtigung erforderlich', 'Bitte erlauben Sie den Zugriff auf Ihre Kontakte');
        return;
      }

      console.log('Opening contact picker modal...');
      setShowContactPicker(true);
      setLoadingContacts(true);

      console.log('Fetching contacts...');
      const { data } = await Contacts.getContactsAsync({
        fields: [
          Contacts.Fields.Name,
          Contacts.Fields.FirstName,
          Contacts.Fields.LastName,
          Contacts.Fields.Emails,
          Contacts.Fields.PhoneNumbers,
          Contacts.Fields.Addresses,
        ],
      });

      console.log('Contacts fetched:', data.length);

      const sortedContacts = data
        .filter(c => c.name || c.firstName || c.lastName)
        .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      
      setContacts(sortedContacts);
      console.log('Contacts set:', sortedContacts.length);
    } catch (error) {
      console.error('Error in openContactPicker:', error);
      Alert.alert('Fehler', 'Kontakte konnten nicht geladen werden: ' + String(error));
      setShowContactPicker(false);
    } finally {
      setLoadingContacts(false);
    }
  };

  const selectContact = (contact: Contacts.Contact) => {
    // Set ref IMMEDIATELY (synchronous) to block loadCustomer
    isImportingRef.current = true;
    
    const { extractedName, extractedEmail, extractedPhone, extractedAddress } = extractContactData(contact);
    
    console.log('=== CONTACT IMPORT DEBUG ===');
    console.log('Extracted name:', extractedName);
    console.log('Extracted email:', extractedEmail);
    console.log('Extracted phone:', extractedPhone);
    console.log('Extracted address:', extractedAddress);
    
    // Apply all values IMMEDIATELY - no delays
    setName(extractedName || '');
    setEmail(extractedEmail || '');
    setPhone(extractedPhone || '');
    setAddress(extractedAddress || '');
    
    // Close modal and reset search
    setSearchQuery('');
    setShowContactPicker(false);
    
    console.log('=== CONTACT DATA APPLIED ===');
  };

  const filteredContacts = contacts.filter(contact => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    const contactName = contact.name?.toLowerCase() || '';
    return contactName.includes(query);
  });

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('Fehler', 'Bitte geben Sie einen Namen ein');
      return;
    }

    setSaving(true);
    try {
      await axios.put(`${API_URL}/api/customers/${id}`, {
        name,
        email: email || undefined,
        phone: phone || undefined,
        address: address || undefined,
      });
      Alert.alert('Erfolg', 'Kunde wurde aktualisiert', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (error) {
      console.error('Error updating customer:', error);
      Alert.alert('Fehler', 'Kunde konnte nicht aktualisiert werden');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteCustomer = () => {
    setShowDeleteModal(true);
  };

  const confirmDeleteCustomer = async () => {
    setIsDeleting(true);
    try {
      await axios.delete(`${API_URL}/api/customers/${id}`);
      setShowDeleteModal(false);
      Alert.alert('Erfolg', 'Kunde wurde gelöscht', [
        { text: 'OK', onPress: () => router.replace('/customers/') },
      ]);
    } catch (error) {
      console.error('Error deleting customer:', error);
      Alert.alert('Fehler', 'Kunde konnte nicht gelöscht werden');
    } finally {
      setIsDeleting(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#1976d2" />
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
          {/* Import from Contacts Button */}
          <Pressable
            style={({ pressed }) => [
              styles.importButton,
              pressed && { opacity: 0.7, backgroundColor: '#bbdefb' }
            ]}
            onPress={() => {
              console.log('=== BUTTON PRESSED ===');
              Alert.alert(
                'Kontakt importieren',
                'Möchten Sie einen Kontakt aus Ihrem Adressbuch importieren?',
                [
                  { text: 'Abbrechen', style: 'cancel' },
                  { text: 'Ja', onPress: () => openContactPicker() }
                ]
              );
            }}
          >
            <Ionicons name="person-add" size={20} color="#1976d2" />
            <Text style={styles.importButtonText}>Aus Kontakten importieren</Text>
          </Pressable>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Name *</Text>
            <TextInput
              style={styles.input}
              placeholder="Kundenname"
              value={name}
              onChangeText={setName}
              textContentType="name"
              autoComplete="name"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>E-Mail</Text>
            <TextInput
              style={styles.input}
              placeholder="kunde@beispiel.de"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              textContentType="emailAddress"
              autoComplete="email"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Telefon</Text>
            <TextInput
              style={styles.input}
              placeholder="+49 123 456789"
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              textContentType="telephoneNumber"
              autoComplete="tel"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Adresse</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder="Straße, PLZ, Stadt"
              value={address}
              onChangeText={setAddress}
              multiline
              numberOfLines={3}
              textContentType="fullStreetAddress"
              autoComplete="street-address"
            />
          </View>

          <TouchableOpacity
            style={[styles.button, saving && styles.buttonDisabled]}
            onPress={handleSave}
            disabled={saving}
          >
            <Text style={styles.buttonText}>
              {saving ? 'Wird gespeichert...' : 'Änderungen speichern'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.deleteCustomerButton}
            onPress={handleDeleteCustomer}
          >
            <Ionicons name="trash-outline" size={20} color="#f44336" />
            <Text style={styles.deleteCustomerButtonText}>Kunde löschen</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Contact Picker Modal */}
      <Modal
        visible={showContactPicker}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowContactPicker(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Kontakt auswählen</Text>
            <TouchableOpacity
              onPress={() => {
                setSearchQuery('');
                setShowContactPicker(false);
              }}
              style={styles.closeButton}
            >
              <Ionicons name="close" size={28} color="#333" />
            </TouchableOpacity>
          </View>

          <TextInput
            style={styles.searchInput}
            placeholder="Kontakt suchen..."
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCapitalize="none"
          />

          {loadingContacts ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#1976d2" />
              <Text style={styles.loadingText}>Kontakte werden geladen...</Text>
            </View>
          ) : filteredContacts.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="people-outline" size={48} color="#ccc" />
              <Text style={styles.emptyText}>
                {searchQuery ? 'Keine Kontakte gefunden' : 'Keine Kontakte verfügbar'}
              </Text>
            </View>
          ) : (
            <FlatList
              data={filteredContacts}
              keyExtractor={(item) => item.id || Math.random().toString()}
              renderItem={({ item }) => {
                const { extractedPhone, extractedEmail } = extractContactData(item);
                return (
                  <TouchableOpacity
                    style={styles.contactItem}
                    onPress={() => selectContact(item)}
                  >
                    <View style={styles.contactAvatar}>
                      <Ionicons name="person" size={24} color="#fff" />
                    </View>
                    <View style={styles.contactInfo}>
                      <Text style={styles.contactName}>{item.name || 'Unbekannt'}</Text>
                      {extractedPhone ? (
                        <Text style={styles.contactDetail}>{extractedPhone}</Text>
                      ) : null}
                      {extractedEmail ? (
                        <Text style={styles.contactDetail}>{extractedEmail}</Text>
                      ) : null}
                    </View>
                    <Ionicons name="chevron-forward" size={20} color="#ccc" />
                  </TouchableOpacity>
                );
              }}
              ItemSeparatorComponent={() => <View style={styles.separator} />}
            />
          )}
        </View>
      </Modal>

      {/* Delete Customer Confirmation Modal */}
      <Modal
        visible={showDeleteModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowDeleteModal(false)}
      >
        <View style={styles.deleteModalOverlay}>
          <View style={styles.deleteModalContent}>
            <Ionicons name="warning" size={48} color="#f44336" style={{ marginBottom: 16 }} />
            <Text style={styles.deleteModalTitle}>Kunde löschen?</Text>
            <Text style={styles.deleteModalText}>
              Möchten Sie diesen Kunden wirklich löschen?
            </Text>
            <View style={styles.deleteModalButtons}>
              <TouchableOpacity
                style={[styles.deleteModalButton, styles.deleteModalCancelButton]}
                onPress={() => setShowDeleteModal(false)}
                disabled={isDeleting}
              >
                <Text style={styles.deleteModalCancelText}>Abbrechen</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.deleteModalButton, styles.deleteModalConfirmButton]}
                onPress={confirmDeleteCustomer}
                disabled={isDeleting}
              >
                <Text style={styles.deleteModalConfirmText}>
                  {isDeleting ? 'Wird gelöscht...' : 'Löschen'}
                </Text>
              </TouchableOpacity>
            </View>
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
  },
  scrollView: {
    flex: 1,
  },
  form: {
    padding: 16,
  },
  importButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#e3f2fd',
    padding: 16,
    borderRadius: 12,
    marginBottom: 24,
    gap: 8,
    borderWidth: 2,
    borderColor: '#1976d2',
    borderStyle: 'dashed',
  },
  importButtonText: {
    color: '#1976d2',
    fontSize: 16,
    fontWeight: '600',
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#fff',
    padding: 14,
    borderRadius: 8,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  textArea: {
    height: 80,
    textAlignVertical: 'top',
  },
  button: {
    backgroundColor: '#1976d2',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: {
    backgroundColor: '#ccc',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  deleteCustomerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 8,
    marginTop: 24,
    borderWidth: 1,
    borderColor: '#f44336',
    gap: 8,
  },
  deleteCustomerButtonText: {
    color: '#f44336',
    fontSize: 16,
    fontWeight: '600',
  },
  // Modal styles
  modalContainer: {
    flex: 1,
    backgroundColor: '#fff',
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
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  closeButton: {
    padding: 4,
  },
  searchInput: {
    margin: 16,
    padding: 14,
    backgroundColor: '#f5f5f5',
    borderRadius: 10,
    fontSize: 16,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#666',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    marginTop: 12,
    fontSize: 16,
    color: '#666',
  },
  contactItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  contactAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#1976d2',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  contactInfo: {
    flex: 1,
  },
  contactName: {
    fontSize: 17,
    fontWeight: '600',
    color: '#333',
  },
  contactDetail: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
  separator: {
    height: 1,
    backgroundColor: '#eee',
    marginLeft: 78,
  },
  // Delete modal styles
  deleteModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  deleteModalContent: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    width: '100%',
    maxWidth: 340,
  },
  deleteModalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
  },
  deleteModalText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 24,
  },
  deleteModalButtons: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  deleteModalButton: {
    flex: 1,
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  deleteModalCancelButton: {
    backgroundColor: '#e0e0e0',
  },
  deleteModalCancelText: {
    color: '#333',
    fontSize: 16,
    fontWeight: '600',
  },
  deleteModalConfirmButton: {
    backgroundColor: '#f44336',
  },
  deleteModalConfirmText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});

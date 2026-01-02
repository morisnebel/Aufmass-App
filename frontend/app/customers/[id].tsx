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
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import axios from 'axios';
import Constants from 'expo-constants';
import * as Contacts from 'expo-contacts';
import { Ionicons } from '@expo/vector-icons';

const API_URL = Constants.expoConfig?.extra?.EXPO_PUBLIC_BACKEND_URL || process.env.EXPO_PUBLIC_BACKEND_URL;

export default function EditCustomerScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
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
  
  // Manual entry modal for web
  const [showManualEntryModal, setShowManualEntryModal] = useState(false);
  const [manualName, setManualName] = useState('');
  const [manualEmail, setManualEmail] = useState('');
  const [manualPhone, setManualPhone] = useState('');
  const [manualAddress, setManualAddress] = useState('');

  // Ref to store pending contact data
  const pendingContactData = useRef<{name: string, email: string, phone: string, address: string} | null>(null);

  useEffect(() => {
    loadCustomer();
  }, [id]);

  // Apply pending contact data when modal closes
  useEffect(() => {
    if (!showContactPicker && pendingContactData.current) {
      const data = pendingContactData.current;
      console.log('Applying pending contact data:', data);
      
      // Use a small delay to ensure modal is fully closed
      setTimeout(() => {
        if (data.name) setName(data.name);
        if (data.email) setEmail(data.email);
        if (data.phone) setPhone(data.phone);
        if (data.address) setAddress(data.address);
        pendingContactData.current = null;
        
        // Show success message after values are set
        Alert.alert('Erfolg', 'Kontaktdaten wurden übernommen');
      }, 300);
    }
  }, [showContactPicker]);

  const loadCustomer = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/customers/${id}`);
      const customer = response.data;
      setName(customer.name || '');
      setEmail(customer.email || '');
      setPhone(customer.phone || '');
      setAddress(customer.address || '');
    } catch (error) {
      console.error('Error loading customer:', error);
      Alert.alert('Fehler', 'Kunde konnte nicht geladen werden');
    } finally {
      setLoading(false);
    }
  };

  const openContactPicker = async () => {
    try {
      console.log('Opening contact picker, Platform:', Platform.OS);
      
      // Check if we're on web - show manual entry modal instead
      if (Platform.OS === 'web') {
        setShowManualEntryModal(true);
        return;
      }

      setShowContactPicker(true);
      setLoadingContacts(true);
      
      console.log('Requesting contacts permission...');
      const { status } = await Contacts.requestPermissionsAsync();
      console.log('Permission status:', status);
      
      if (status !== 'granted') {
        Alert.alert('Berechtigung erforderlich', 'Bitte erlauben Sie den Zugriff auf Ihre Kontakte in den Einstellungen');
        setShowContactPicker(false);
        setLoadingContacts(false);
        return;
      }
      
      console.log('Loading contacts...');
      const { data } = await Contacts.getContactsAsync({
        fields: [
          Contacts.Fields.Name,
          Contacts.Fields.Emails,
          Contacts.Fields.PhoneNumbers,
          Contacts.Fields.Addresses,
        ],
      });
      
      console.log('Loaded', data.length, 'contacts');
      
      // Sort contacts by name
      const sortedContacts = data.sort((a, b) => {
        const nameA = a.name || '';
        const nameB = b.name || '';
        return nameA.localeCompare(nameB);
      });
      
      setContacts(sortedContacts);
      setLoadingContacts(false);
    } catch (error) {
      console.error('Error loading contacts:', error);
      Alert.alert('Fehler', 'Kontakte konnten nicht geladen werden: ' + String(error));
      setShowContactPicker(false);
      setLoadingContacts(false);
    }
  };

  const selectContact = (contact: Contacts.Contact) => {
    console.log('=== SELECTED CONTACT ===');
    
    // Variables to store extracted values
    let extractedName = '';
    let extractedEmail = '';
    let extractedPhone = '';
    let extractedAddress = '';
    
    // Extract name
    extractedName = contact.name || 
      (contact.firstName && contact.lastName ? `${contact.firstName} ${contact.lastName}`.trim() : '') ||
      contact.firstName || 
      contact.lastName || '';
    
    // Extract email
    if (contact.emails && contact.emails.length > 0) {
      const emailObj = contact.emails[0] as any;
      if (typeof emailObj === 'string') {
        extractedEmail = emailObj;
      } else if (emailObj?.email) {
        extractedEmail = emailObj.email;
      } else if (emailObj?.value) {
        extractedEmail = emailObj.value;
      }
    }
    
    // Extract phone
    if (contact.phoneNumbers && contact.phoneNumbers.length > 0) {
      const phoneObj = contact.phoneNumbers[0] as any;
      console.log('Phone object type:', typeof phoneObj, 'value:', JSON.stringify(phoneObj));
      if (typeof phoneObj === 'string') {
        extractedPhone = phoneObj;
      } else if (phoneObj?.number) {
        extractedPhone = phoneObj.number;
      } else if (phoneObj?.digits) {
        extractedPhone = phoneObj.digits;
      } else if (phoneObj?.value) {
        extractedPhone = phoneObj.value;
      } else if (phoneObj?.phoneNumber) {
        extractedPhone = phoneObj.phoneNumber;
      } else if (phoneObj) {
        // Try all keys
        const keys = Object.keys(phoneObj);
        console.log('Phone object keys:', keys);
        for (const key of keys) {
          const val = phoneObj[key];
          if (typeof val === 'string' && val.match(/[\d+\-\s]/)) {
            extractedPhone = val;
            console.log('Found phone in key:', key, 'value:', val);
            break;
          }
        }
      }
    }
    
    // Extract address
    if (contact.addresses && contact.addresses.length > 0) {
      const addr = contact.addresses[0] as any;
      console.log('Address object type:', typeof addr, 'value:', JSON.stringify(addr));
      
      if (addr?.formattedAddress) {
        extractedAddress = addr.formattedAddress;
      } else if (typeof addr === 'string') {
        extractedAddress = addr;
      } else if (addr) {
        const parts: string[] = [];
        if (addr.street) parts.push(addr.street);
        if (addr.city) parts.push(addr.city);
        if (addr.postalCode) parts.push(addr.postalCode);
        if (addr.region) parts.push(addr.region);
        if (addr.country) parts.push(addr.country);
        
        if (parts.length === 0) {
          // Try all string keys
          const keys = Object.keys(addr);
          console.log('Address object keys:', keys);
          for (const key of keys) {
            const val = addr[key];
            if (typeof val === 'string' && val.length > 0 && !['id', 'label', 'type'].includes(key)) {
              parts.push(val);
            }
          }
        }
        extractedAddress = parts.join(', ');
      }
    }
    
    console.log('=== EXTRACTED VALUES ===');
    console.log('Name:', extractedName);
    console.log('Email:', extractedEmail);
    console.log('Phone:', extractedPhone);
    console.log('Address:', extractedAddress);
    
    // IMMEDIATELY set all values before closing modal
    console.log('Setting states NOW...');
    if (extractedName) {
      console.log('Calling setName with:', extractedName);
      setName(extractedName);
    }
    if (extractedEmail) {
      console.log('Calling setEmail with:', extractedEmail);
      setEmail(extractedEmail);
    }
    if (extractedPhone) {
      console.log('Calling setPhone with:', extractedPhone);
      setPhone(extractedPhone);
    }
    if (extractedAddress) {
      console.log('Calling setAddress with:', extractedAddress);
      setAddress(extractedAddress);
    }
    console.log('All setState calls completed');
    
    // Close modal AFTER setting values
    setShowContactPicker(false);
    setSearchQuery('');
    
    // Show confirmation
    Alert.alert(
      'Kontakt übernommen',
      `Die folgenden Daten wurden übernommen:\n\nName: ${extractedName || '-'}\nEmail: ${extractedEmail || '-'}\nTelefon: ${extractedPhone || '-'}\nAdresse: ${extractedAddress || '-'}`,
      [{ text: 'OK' }]
    );
  };

  const filteredContacts = contacts.filter(contact => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      (contact.name?.toLowerCase().includes(query)) ||
      (contact.emails?.some(e => e.email?.toLowerCase().includes(query))) ||
      (contact.phoneNumbers?.some(p => p.number?.includes(query)))
    );
  });

  // Apply manual entry data
  const applyManualEntry = () => {
    // Set all values that were entered
    if (manualName.trim()) setName(manualName.trim());
    if (manualEmail.trim()) setEmail(manualEmail.trim());
    if (manualPhone.trim()) setPhone(manualPhone.trim());
    if (manualAddress.trim()) setAddress(manualAddress.trim());
    
    console.log('Applied manual entry:', {
      name: manualName,
      email: manualEmail,
      phone: manualPhone,
      address: manualAddress
    });
    
    // Reset and close modal
    setManualName('');
    setManualEmail('');
    setManualPhone('');
    setManualAddress('');
    setShowManualEntryModal(false);
  };

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
    Alert.alert(
      'Kunde löschen',
      'Möchten Sie diesen Kunden wirklich löschen? Alle zugehörigen Projekte bleiben erhalten.',
      [
        { text: 'Abbrechen', style: 'cancel' },
        {
          text: 'Löschen',
          style: 'destructive',
          onPress: async () => {
            try {
              await axios.delete(`${API_URL}/api/customers/${id}`);
              Alert.alert('Erfolg', 'Kunde wurde gelöscht', [
                { text: 'OK', onPress: () => router.replace('/customers') },
              ]);
            } catch (error) {
              console.error('Error deleting customer:', error);
              Alert.alert('Fehler', 'Kunde konnte nicht gelöscht werden');
            }
          },
        },
      ]
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
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView style={styles.scrollView}>
        <View style={styles.form}>
          {/* Import from Contacts Button */}
          <TouchableOpacity
            style={styles.importButton}
            onPress={openContactPicker}
          >
            <Ionicons name="person-add" size={20} color="#1976d2" />
            <Text style={styles.importButtonText}>Aus Adressbuch importieren</Text>
          </TouchableOpacity>

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
        transparent={true}
        onRequestClose={() => {
          setShowContactPicker(false);
          setSearchQuery('');
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Kontakt auswählen</Text>
              <TouchableOpacity
                onPress={() => {
                  setShowContactPicker(false);
                  setSearchQuery('');
                }}
              >
                <Ionicons name="close" size={24} color="#333" />
              </TouchableOpacity>
            </View>

            <TextInput
              style={styles.searchInput}
              placeholder="Kontakt suchen..."
              value={searchQuery}
              onChangeText={setSearchQuery}
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
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.contactItem}
                    onPress={() => selectContact(item)}
                  >
                    <View style={styles.contactAvatar}>
                      <Ionicons name="person" size={24} color="#fff" />
                    </View>
                    <View style={styles.contactInfo}>
                      <Text style={styles.contactName}>{item.name || 'Unbekannt'}</Text>
                      {item.phoneNumbers && item.phoneNumbers.length > 0 && (
                        <Text style={styles.contactDetail}>
                          {item.phoneNumbers[0].number}
                        </Text>
                      )}
                      {item.emails && item.emails.length > 0 && (
                        <Text style={styles.contactDetail}>
                          {item.emails[0].email}
                        </Text>
                      )}
                    </View>
                    <Ionicons name="chevron-forward" size={20} color="#ccc" />
                  </TouchableOpacity>
                )}
                ItemSeparatorComponent={() => <View style={styles.separator} />}
              />
            )}
          </View>
        </View>
      </Modal>

      {/* Manual Entry Modal for Web */}
      <Modal
        visible={showManualEntryModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowManualEntryModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.manualEntryModal}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Kontaktdaten eingeben</Text>
              <TouchableOpacity onPress={() => setShowManualEntryModal(false)}>
                <Ionicons name="close" size={24} color="#333" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.manualEntryForm}>
              <Text style={styles.manualEntryHint}>
                💡 Tipp: Auf dem Handy können Sie Kontakte direkt aus dem Adressbuch importieren.
              </Text>

              <View style={styles.manualInputGroup}>
                <Text style={styles.manualInputLabel}>Name</Text>
                <TextInput
                  style={styles.manualInput}
                  placeholder="Max Mustermann"
                  value={manualName}
                  onChangeText={setManualName}
                />
              </View>

              <View style={styles.manualInputGroup}>
                <Text style={styles.manualInputLabel}>E-Mail</Text>
                <TextInput
                  style={styles.manualInput}
                  placeholder="max@beispiel.de"
                  value={manualEmail}
                  onChangeText={setManualEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
              </View>

              <View style={styles.manualInputGroup}>
                <Text style={styles.manualInputLabel}>Telefon</Text>
                <TextInput
                  style={styles.manualInput}
                  placeholder="+49 123 456789"
                  value={manualPhone}
                  onChangeText={setManualPhone}
                  autoCapitalize="none"
                />
              </View>

              <View style={styles.manualInputGroup}>
                <Text style={styles.manualInputLabel}>Adresse</Text>
                <TextInput
                  style={[styles.manualInput, styles.manualTextArea]}
                  placeholder="Musterstraße 1, 12345 Musterstadt"
                  value={manualAddress}
                  onChangeText={setManualAddress}
                  multiline
                  numberOfLines={3}
                />
              </View>

              <View style={styles.manualEntryButtons}>
                <TouchableOpacity
                  style={[styles.manualEntryButton, styles.cancelButton]}
                  onPress={() => setShowManualEntryModal(false)}
                >
                  <Text style={styles.cancelButtonText}>Abbrechen</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.manualEntryButton, styles.applyButton]}
                  onPress={applyManualEntry}
                >
                  <Text style={styles.applyButtonText}>Übernehmen</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
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
    height: 80,
    textAlignVertical: 'top',
  },
  importButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#e3f2fd',
    padding: 14,
    borderRadius: 8,
    marginBottom: 20,
    gap: 8,
    borderWidth: 1,
    borderColor: '#1976d2',
    borderStyle: 'dashed',
  },
  importButtonText: {
    color: '#1976d2',
    fontSize: 16,
    fontWeight: '600',
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
    paddingBottom: 20,
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
    fontWeight: 'bold',
    color: '#333',
  },
  searchInput: {
    margin: 16,
    padding: 12,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    fontSize: 16,
  },
  loadingContainer: {
    padding: 40,
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#666',
  },
  emptyContainer: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    marginTop: 12,
    fontSize: 14,
    color: '#666',
  },
  contactItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  contactAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#1976d2',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  contactInfo: {
    flex: 1,
  },
  contactName: {
    fontSize: 16,
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
    marginLeft: 72,
  },
  manualEntryModal: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '90%',
    paddingBottom: 20,
  },
  manualEntryForm: {
    padding: 16,
  },
  manualEntryHint: {
    backgroundColor: '#e3f2fd',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    fontSize: 14,
    color: '#1976d2',
  },
  manualInputGroup: {
    marginBottom: 16,
  },
  manualInputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  manualInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#fafafa',
  },
  manualTextArea: {
    height: 80,
    textAlignVertical: 'top',
  },
  manualEntryButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
  },
  manualEntryButton: {
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
  applyButton: {
    backgroundColor: '#1976d2',
  },
  applyButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});

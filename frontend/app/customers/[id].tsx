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

  useEffect(() => {
    loadCustomer();
  }, [id]);

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
    console.log('Full contact object:', JSON.stringify(contact, null, 2));
    
    // Debug: Show what we received
    let debugInfo = `Name: ${contact.name || 'nicht gefunden'}\n`;
    debugInfo += `Emails: ${JSON.stringify(contact.emails)}\n`;
    debugInfo += `Phones: ${JSON.stringify(contact.phoneNumbers)}\n`;
    debugInfo += `Addresses: ${JSON.stringify(contact.addresses)}`;
    console.log('Debug Info:', debugInfo);
    
    // Set name - try different name fields
    const contactName = contact.name || 
      (contact.firstName && contact.lastName ? `${contact.firstName} ${contact.lastName}`.trim() : '') ||
      contact.firstName || 
      contact.lastName ||
      '';
    if (contactName) {
      console.log('Setting name:', contactName);
      setName(contactName);
    }
    
    // Set email (first email if available)
    if (contact.emails && contact.emails.length > 0) {
      const emailObj = contact.emails[0] as any;
      console.log('Raw email object:', emailObj, typeof emailObj);
      let emailValue = '';
      if (typeof emailObj === 'string') {
        emailValue = emailObj;
      } else if (emailObj?.email) {
        emailValue = emailObj.email;
      } else if (emailObj?.value) {
        emailValue = emailObj.value;
      } else if (emailObj?.address) {
        emailValue = emailObj.address;
      }
      console.log('Setting email:', emailValue);
      if (emailValue) {
        setEmail(emailValue);
      }
    }
    
    // Set phone (first phone number if available)
    if (contact.phoneNumbers && contact.phoneNumbers.length > 0) {
      const phoneObj = contact.phoneNumbers[0] as any;
      console.log('Raw phone object:', phoneObj, typeof phoneObj);
      let phoneValue = '';
      if (typeof phoneObj === 'string') {
        phoneValue = phoneObj;
      } else if (phoneObj?.number) {
        phoneValue = phoneObj.number;
      } else if (phoneObj?.digits) {
        phoneValue = phoneObj.digits;
      } else if (phoneObj?.value) {
        phoneValue = phoneObj.value;
      } else if (phoneObj?.phoneNumber) {
        phoneValue = phoneObj.phoneNumber;
      } else {
        // Try to extract any string value from the object
        const keys = Object.keys(phoneObj || {});
        for (const key of keys) {
          if (typeof phoneObj[key] === 'string' && phoneObj[key].match(/[\d+]/)) {
            phoneValue = phoneObj[key];
            break;
          }
        }
      }
      console.log('Setting phone:', phoneValue);
      if (phoneValue) {
        setPhone(phoneValue);
      }
    }
    
    // Set address (first address if available)
    if (contact.addresses && contact.addresses.length > 0) {
      const addr = contact.addresses[0] as any;
      console.log('Raw address object:', addr, typeof addr);
      
      let addressValue = '';
      
      // Try formatted address first
      if (addr?.formattedAddress) {
        addressValue = addr.formattedAddress;
      } else if (typeof addr === 'string') {
        addressValue = addr;
      } else if (addr) {
        const addressParts: string[] = [];
        
        // Street
        if (addr.street) addressParts.push(addr.street);
        if (addr.streetNumber) addressParts.push(addr.streetNumber);
        
        // City line
        const cityLine: string[] = [];
        if (addr.postalCode) cityLine.push(addr.postalCode);
        if (addr.city) cityLine.push(addr.city);
        if (cityLine.length > 0) addressParts.push(cityLine.join(' '));
        
        // Region
        if (addr.region) addressParts.push(addr.region);
        if (addr.state) addressParts.push(addr.state);
        
        // Country
        if (addr.country) addressParts.push(addr.country);
        
        // If still empty, try to get any string values
        if (addressParts.length === 0) {
          const keys = Object.keys(addr);
          for (const key of keys) {
            if (typeof addr[key] === 'string' && addr[key].length > 0 && key !== 'id' && key !== 'label') {
              addressParts.push(addr[key]);
            }
          }
        }
        
        addressValue = addressParts.join(', ');
      }
      
      console.log('Setting address:', addressValue);
      if (addressValue) {
        setAddress(addressValue);
      }
    }
    
    console.log('=== CONTACT SELECTION COMPLETE ===');
    
    // Show debug alert on mobile
    if (Platform.OS !== 'web') {
      Alert.alert(
        'Kontakt übernommen',
        `Name: ${contactName || '(leer)'}\nTelefon: ${phone || '(nicht gefunden)'}\nAdresse: ${address || '(nicht gefunden)'}`,
        [{ text: 'OK' }]
      );
    }
    
    setShowContactPicker(false);
    setSearchQuery('');
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
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Telefon</Text>
            <TextInput
              style={styles.input}
              placeholder="+49 123 456789"
              value={phone}
              onChangeText={setPhone}
              keyboardType="default"
              autoCapitalize="none"
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

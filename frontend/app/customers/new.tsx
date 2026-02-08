import React, { useState } from 'react';
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
  Modal,
  FlatList,
  ActivityIndicator,
  Pressable,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Contacts from 'expo-contacts';
import axios from 'axios';
import Constants from 'expo-constants';

const API_URL = Constants.expoConfig?.extra?.EXPO_PUBLIC_BACKEND_URL || process.env.EXPO_PUBLIC_BACKEND_URL;

// Helper function to extract contact data
function extractContactData(contact: Contacts.Contact) {
  let extractedName = '';
  let extractedEmail = '';
  let extractedPhone = '';
  let extractedAddress = '';

  extractedName = contact.name || 
    [contact.firstName, contact.lastName].filter(Boolean).join(' ') || '';

  if (contact.emails && contact.emails.length > 0) {
    const emailObj = contact.emails[0] as any;
    extractedEmail = typeof emailObj === 'string' ? emailObj : 
      (emailObj?.email || emailObj?.value || '');
  }

  if (contact.phoneNumbers && contact.phoneNumbers.length > 0) {
    const phoneObj = contact.phoneNumbers[0] as any;
    if (typeof phoneObj === 'string') {
      extractedPhone = phoneObj;
    } else {
      extractedPhone = phoneObj?.number || phoneObj?.digits || phoneObj?.value || '';
    }
  }

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

export default function NewCustomerScreen() {
  const router = useRouter();
  
  // Form state
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [loading, setLoading] = useState(false);
  
  // Import options modal
  const [showImportOptions, setShowImportOptions] = useState(false);
  
  // Quick entry modal state
  const [showQuickEntry, setShowQuickEntry] = useState(false);
  const [quickName, setQuickName] = useState('');
  const [quickEmail, setQuickEmail] = useState('');
  const [quickPhone, setQuickPhone] = useState('');
  const [quickAddress, setQuickAddress] = useState('');
  
  // Contact picker state
  const [showContactPicker, setShowContactPicker] = useState(false);
  const [contacts, setContacts] = useState<Contacts.Contact[]>([]);
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const handleImportPress = () => {
    setShowImportOptions(true);
  };

  const openQuickEntry = () => {
    setShowImportOptions(false);
    setQuickName('');
    setQuickEmail('');
    setQuickPhone('');
    setQuickAddress('');
    setShowQuickEntry(true);
  };

  const applyQuickEntry = () => {
    if (quickName) setName(quickName);
    if (quickEmail) setEmail(quickEmail);
    if (quickPhone) setPhone(quickPhone);
    if (quickAddress) setAddress(quickAddress);
    setShowQuickEntry(false);
  };

  const openContactPicker = async () => {
    console.log('=== openContactPicker called ===');
    console.log('Platform.OS:', Platform.OS);
    
    setShowImportOptions(false);
    
    if (Platform.OS === 'web') {
      Alert.alert('Hinweis', 'Kontakt-Import aus dem Adressbuch ist nur in der mobilen App verfügbar. Bitte nutzen Sie die manuelle Eingabe.');
      return;
    }

    try {
      console.log('Requesting contacts permission...');
      const { status } = await Contacts.requestPermissionsAsync();
      console.log('Permission status:', status);
      
      if (status !== 'granted') {
        Alert.alert('Berechtigung erforderlich', 'Bitte erlauben Sie den Zugriff auf Ihre Kontakte in den Einstellungen.');
        return;
      }

      // Use modal-based contact picker
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
        pageSize: 10000, // Load more contacts
        pageOffset: 0,
      });

      console.log('Contacts fetched:', data.length);

      // Sort contacts alphabetically
      const sortedContacts = data
        .sort((a, b) => {
          const nameA = a.name || a.firstName || a.lastName || '';
          const nameB = b.name || b.firstName || b.lastName || '';
          return nameA.localeCompare(nameB);
        });
      
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
    const { extractedName, extractedEmail, extractedPhone, extractedAddress } = extractContactData(contact);
    
    console.log('=== CONTACT IMPORT DEBUG (NEW CUSTOMER) ===');
    console.log('Extracted name:', extractedName);
    console.log('Extracted email:', extractedEmail);
    console.log('Extracted phone:', extractedPhone);
    console.log('Extracted address:', extractedAddress);
    
    // Apply all values
    setName(extractedName || '');
    setEmail(extractedEmail || '');
    setPhone(extractedPhone || '');
    setAddress(extractedAddress || '');
    
    // Close modal
    setSearchQuery('');
    setShowContactPicker(false);
    
    console.log('=== CONTACT DATA APPLIED (NEW CUSTOMER) ===');
  };

  const filteredContacts = contacts.filter(contact => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    const contactName = contact.name?.toLowerCase() || '';
    return contactName.includes(query);
  });

  // Function to save contact to device contacts
  const saveToDeviceContacts = async (customerData: {
    name: string;
    email?: string;
    phone?: string;
    address?: string;
  }) => {
    if (Platform.OS === 'web') {
      return; // Not available on web
    }

    try {
      const { status } = await Contacts.requestPermissionsAsync();
      if (status !== 'granted') {
        console.log('Contacts permission not granted');
        return;
      }

      // Parse address into components if provided
      let addressComponents: Contacts.Address | undefined;
      if (customerData.address) {
        // Try to parse address (format: "Street, PostalCode City, Country")
        const parts = customerData.address.split(',').map(p => p.trim());
        addressComponents = {
          street: parts[0] || '',
          city: parts[1]?.split(' ').slice(1).join(' ') || '',
          postalCode: parts[1]?.split(' ')[0] || '',
          country: parts[2] || '',
          label: 'Arbeit',
        };
      }

      // Parse name into first and last name
      const nameParts = customerData.name.split(' ');
      const firstName = nameParts[0] || '';
      const lastName = nameParts.slice(1).join(' ') || '';

      const contact: Contacts.Contact = {
        contactType: Contacts.ContactTypes.Person,
        name: customerData.name,
        firstName,
        lastName,
        ...(customerData.email && {
          emails: [{ email: customerData.email, label: 'Arbeit' }],
        }),
        ...(customerData.phone && {
          phoneNumbers: [{ number: customerData.phone, label: 'Mobil' }],
        }),
        ...(addressComponents && {
          addresses: [addressComponents],
        }),
      };

      await Contacts.addContactAsync(contact);
      console.log('Contact saved to device contacts');
    } catch (error) {
      console.error('Error saving to device contacts:', error);
      // Don't show error to user - this is a secondary feature
    }
  };

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('Fehler', 'Bitte geben Sie einen Namen ein');
      return;
    }

    setLoading(true);
    try {
      await axios.post(`${API_URL}/api/customers`, {
        name,
        email: email || undefined,
        phone: phone || undefined,
        address: address || undefined,
      });
      
      // Save to device contacts
      await saveToDeviceContacts({
        name,
        email: email || undefined,
        phone: phone || undefined,
        address: address || undefined,
      });
      
      Alert.alert('Erfolg', 'Kunde wurde erstellt und in Kontakten gespeichert', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (error) {
      console.error('Error creating customer:', error);
      Alert.alert('Fehler', 'Kunde konnte nicht erstellt werden');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView style={styles.scrollView}>
        <View style={styles.form}>
          {/* Import Button */}
          <Pressable
            style={({ pressed }) => [
              styles.importButton,
              pressed && { opacity: 0.7, backgroundColor: '#bbdefb' }
            ]}
            onPress={handleImportPress}
          >
            <Ionicons name="person-add" size={20} color="#1976d2" />
            <Text style={styles.importButtonText}>Daten importieren / Schnelleingabe</Text>
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
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleSave}
            disabled={loading}
          >
            <Text style={styles.buttonText}>
              {loading ? 'Wird gespeichert...' : 'Kunde speichern'}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Import Options Modal */}
      <Modal
        visible={showImportOptions}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowImportOptions(false)}
      >
        <Pressable 
          style={styles.modalOverlay}
          onPress={() => setShowImportOptions(false)}
        >
          <View style={styles.optionsModalContent}>
            <Text style={styles.optionsTitle}>Daten importieren</Text>
            
            <TouchableOpacity
              style={styles.optionButton}
              onPress={openQuickEntry}
            >
              <Ionicons name="create-outline" size={24} color="#1976d2" />
              <View style={styles.optionTextContainer}>
                <Text style={styles.optionTitle}>Schnelleingabe</Text>
                <Text style={styles.optionSubtitle}>Daten manuell eingeben</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#ccc" />
            </TouchableOpacity>

            {Platform.OS !== 'web' && (
              <TouchableOpacity
                style={styles.optionButton}
                onPress={openContactPicker}
              >
                <Ionicons name="people-outline" size={24} color="#1976d2" />
                <View style={styles.optionTextContainer}>
                  <Text style={styles.optionTitle}>Aus Kontakten</Text>
                  <Text style={styles.optionSubtitle}>Vom Adressbuch importieren</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color="#ccc" />
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={styles.cancelButton}
              onPress={() => setShowImportOptions(false)}
            >
              <Text style={styles.cancelButtonText}>Abbrechen</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>

      {/* Quick Entry Modal */}
      <Modal
        visible={showQuickEntry}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowQuickEntry(false)}
      >
        <KeyboardAvoidingView 
          style={styles.quickEntryContainer}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={styles.quickEntryHeader}>
            <Text style={styles.quickEntryTitle}>Schnelleingabe</Text>
            <TouchableOpacity
              onPress={() => setShowQuickEntry(false)}
              style={styles.closeButton}
            >
              <Ionicons name="close" size={28} color="#333" />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.quickEntryForm}>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Name</Text>
              <TextInput
                style={styles.input}
                placeholder="Kundenname"
                value={quickName}
                onChangeText={setQuickName}
                autoFocus
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>E-Mail</Text>
              <TextInput
                style={styles.input}
                placeholder="kunde@beispiel.de"
                value={quickEmail}
                onChangeText={setQuickEmail}
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Telefon</Text>
              <TextInput
                style={styles.input}
                placeholder="+49 123 456789"
                value={quickPhone}
                onChangeText={setQuickPhone}
                keyboardType="phone-pad"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Adresse</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                placeholder="Straße, PLZ, Stadt"
                value={quickAddress}
                onChangeText={setQuickAddress}
                multiline
                numberOfLines={3}
              />
            </View>

            <TouchableOpacity
              style={styles.applyButton}
              onPress={applyQuickEntry}
            >
              <Ionicons name="checkmark" size={20} color="#fff" />
              <Text style={styles.applyButtonText}>Übernehmen</Text>
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

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
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
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
  // Import Options Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  optionsModalContent: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    width: '100%',
    maxWidth: 340,
  },
  optionsTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 20,
    textAlign: 'center',
  },
  optionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    marginBottom: 12,
  },
  optionTextContainer: {
    flex: 1,
    marginLeft: 14,
  },
  optionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  optionSubtitle: {
    fontSize: 13,
    color: '#666',
    marginTop: 2,
  },
  cancelButton: {
    padding: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  cancelButtonText: {
    color: '#666',
    fontSize: 16,
  },
  // Quick Entry Modal
  quickEntryContainer: {
    flex: 1,
    backgroundColor: '#fff',
  },
  quickEntryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  quickEntryTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  quickEntryForm: {
    flex: 1,
    padding: 16,
  },
  applyButton: {
    flexDirection: 'row',
    backgroundColor: '#4caf50',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
    gap: 8,
  },
  applyButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  // Contact Picker Modal
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
});

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

// Helper function to extract contact data with separate address fields
function extractContactData(contact: Contacts.Contact) {
  let extractedName = '';
  let extractedEmail = '';
  let extractedPhone = '';
  let extractedMobile = '';
  let extractedStreet = '';
  let extractedPlz = '';
  let extractedCity = '';

  extractedName = contact.name || 
    [contact.firstName, contact.lastName].filter(Boolean).join(' ') || '';

  if (contact.emails && contact.emails.length > 0) {
    const emailObj = contact.emails[0] as any;
    extractedEmail = typeof emailObj === 'string' ? emailObj : 
      (emailObj?.email || emailObj?.value || '');
  }

  // Try to get both phone and mobile
  if (contact.phoneNumbers && contact.phoneNumbers.length > 0) {
    for (const phoneObj of contact.phoneNumbers as any[]) {
      const label = (phoneObj?.label || '').toLowerCase();
      const number = phoneObj?.number || phoneObj?.digits || phoneObj?.value || '';
      
      if (label.includes('mobil') || label.includes('mobile') || label.includes('handy') || label.includes('cell')) {
        if (!extractedMobile) extractedMobile = number;
      } else {
        if (!extractedPhone) extractedPhone = number;
      }
    }
    // If no phone found, use first number as phone
    if (!extractedPhone && !extractedMobile) {
      const phoneObj = contact.phoneNumbers[0] as any;
      extractedPhone = phoneObj?.number || phoneObj?.digits || phoneObj?.value || '';
    }
    // If only mobile found, keep it there
    if (!extractedPhone && extractedMobile) {
      // Leave as is - mobile only
    }
  }

  if (contact.addresses && contact.addresses.length > 0) {
    const addr = contact.addresses[0] as any;
    extractedStreet = addr?.street || '';
    extractedPlz = addr?.postalCode || '';
    extractedCity = addr?.city || '';
  }

  return { extractedName, extractedEmail, extractedPhone, extractedMobile, extractedStreet, extractedPlz, extractedCity };
}

export default function NewCustomerScreen() {
  const router = useRouter();
  
  // Form state - separate address fields
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [mobile, setMobile] = useState('');
  const [street, setStreet] = useState('');
  const [plz, setPlz] = useState('');
  const [city, setCity] = useState('');
  const [loading, setLoading] = useState(false);
  
  // Import options modal
  const [showImportOptions, setShowImportOptions] = useState(false);
  
  // Contact picker state
  const [showContactPicker, setShowContactPicker] = useState(false);
  const [contacts, setContacts] = useState<Contacts.Contact[]>([]);
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Function to save contact to device contacts
  const saveToDeviceContacts = async (customerData: {
    name: string;
    email?: string;
    phone?: string;
    mobile?: string;
    street?: string;
    plz?: string;
    city?: string;
  }) => {
    if (Platform.OS === 'web') {
      return;
    }

    try {
      const { status } = await Contacts.requestPermissionsAsync();
      if (status !== 'granted') {
        console.log('Contacts permission not granted');
        return;
      }

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
        phoneNumbers: [
          ...(customerData.phone ? [{ number: customerData.phone, label: 'Arbeit' }] : []),
          ...(customerData.mobile ? [{ number: customerData.mobile, label: 'Mobil' }] : []),
        ].filter(p => p.number),
        ...(customerData.street && {
          addresses: [{
            street: customerData.street,
            postalCode: customerData.plz || '',
            city: customerData.city || '',
            label: 'Arbeit',
          }],
        }),
      };

      await Contacts.addContactAsync(contact);
      console.log('Contact saved to device contacts');
    } catch (error) {
      console.error('Error saving to device contacts:', error);
    }
  };

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('Fehler', 'Bitte geben Sie einen Namen ein');
      return;
    }

    setLoading(true);
    try {
      // Combine address fields for storage
      const address = [street, [plz, city].filter(Boolean).join(' ')].filter(Boolean).join(', ');
      
      await axios.post(`${API_URL}/api/customers`, {
        name,
        email: email || undefined,
        phone: phone || undefined,
        mobile: mobile || undefined,
        address: address || undefined,
      });
      
      // Save to device contacts
      await saveToDeviceContacts({
        name,
        email: email || undefined,
        phone: phone || undefined,
        mobile: mobile || undefined,
        street: street || undefined,
        plz: plz || undefined,
        city: city || undefined,
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

  // Open contact picker
  const openContactPicker = async () => {
    if (Platform.OS === 'web') {
      Alert.alert('Hinweis', 'Kontakt-Import ist nur in der mobilen App verfügbar.');
      return;
    }

    try {
      const { status } = await Contacts.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Berechtigung erforderlich', 'Bitte erlauben Sie den Zugriff auf Ihre Kontakte.');
        return;
      }

      setShowImportOptions(false);
      setShowContactPicker(true);
      setLoadingContacts(true);

      const { data } = await Contacts.getContactsAsync({
        fields: [
          Contacts.Fields.Name,
          Contacts.Fields.FirstName,
          Contacts.Fields.LastName,
          Contacts.Fields.Emails,
          Contacts.Fields.PhoneNumbers,
          Contacts.Fields.Addresses,
        ],
        pageSize: 10000,
        pageOffset: 0,
      });

      // Sort contacts alphabetically
      const sortedContacts = data
        .filter(c => c.name || c.firstName || c.lastName)
        .sort((a, b) => {
          const nameA = a.name || `${a.firstName} ${a.lastName}` || '';
          const nameB = b.name || `${b.firstName} ${b.lastName}` || '';
          return nameA.localeCompare(nameB);
        });

      setContacts(sortedContacts);
    } catch (error) {
      console.error('Error loading contacts:', error);
      Alert.alert('Fehler', 'Kontakte konnten nicht geladen werden');
    } finally {
      setLoadingContacts(false);
    }
  };

  // Select contact and fill form
  const handleSelectContact = (contact: Contacts.Contact) => {
    const { extractedName, extractedEmail, extractedPhone, extractedMobile, extractedStreet, extractedPlz, extractedCity } = extractContactData(contact);
    
    setName(extractedName);
    setEmail(extractedEmail);
    setPhone(extractedPhone);
    setMobile(extractedMobile);
    setStreet(extractedStreet);
    setPlz(extractedPlz);
    setCity(extractedCity);
    
    setShowContactPicker(false);
    setSearchQuery('');
  };

  // Filter contacts based on search
  const filteredContacts = contacts.filter(contact => {
    const contactName = contact.name || `${contact.firstName || ''} ${contact.lastName || ''}`.trim();
    return contactName.toLowerCase().includes(searchQuery.toLowerCase());
  });

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView style={styles.scrollView} keyboardShouldPersistTaps="handled">
        <View style={styles.form}>
          {/* Import from Contacts Button */}
          <Pressable
            style={({ pressed }) => [
              styles.importButton,
              pressed && { opacity: 0.7, backgroundColor: '#bbdefb' }
            ]}
            onPress={openContactPicker}
          >
            <Ionicons name="people" size={20} color="#1976d2" />
            <Text style={styles.importButtonText}>Aus Kontakten importieren</Text>
          </Pressable>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Name *</Text>
            <TextInput
              style={styles.input}
              placeholder="Kundenname"
              value={name}
              onChangeText={setName}
              autoComplete="name"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>E-Mail</Text>
            <TextInput
              style={styles.input}
              placeholder="E-Mail-Adresse"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
            />
          </View>

          <View style={styles.row}>
            <View style={styles.halfInput}>
              <Text style={styles.label}>Telefon</Text>
              <TextInput
                style={styles.input}
                placeholder="Festnetz"
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
                autoComplete="tel"
              />
            </View>
            <View style={styles.halfInput}>
              <Text style={styles.label}>Mobil</Text>
              <TextInput
                style={styles.input}
                placeholder="Handynummer"
                value={mobile}
                onChangeText={setMobile}
                keyboardType="phone-pad"
              />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Straße</Text>
            <TextInput
              style={styles.input}
              placeholder="Straße und Hausnummer"
              value={street}
              onChangeText={setStreet}
              autoComplete="street-address"
            />
          </View>

          <View style={styles.row}>
            <View style={styles.plzInput}>
              <Text style={styles.label}>PLZ</Text>
              <TextInput
                style={styles.input}
                placeholder="PLZ"
                value={plz}
                onChangeText={setPlz}
                keyboardType="number-pad"
                autoComplete="postal-code"
              />
            </View>
            <View style={styles.cityInput}>
              <Text style={styles.label}>Ort</Text>
              <TextInput
                style={styles.input}
                placeholder="Ort"
                value={city}
                onChangeText={setCity}
              />
            </View>
          </View>

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleSave}
            disabled={loading}
          >
            <Text style={styles.buttonText}>
              {loading ? 'Wird gespeichert...' : 'Kunde erstellen'}
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
                <Ionicons name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>

            <View style={styles.searchContainer}>
              <Ionicons name="search" size={20} color="#666" style={styles.searchIcon} />
              <TextInput
                style={styles.searchInput}
                placeholder="Kontakt suchen..."
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

            {loadingContacts ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#1976d2" />
                <Text style={styles.loadingText}>Kontakte werden geladen...</Text>
              </View>
            ) : (
              <FlatList
                data={filteredContacts}
                keyExtractor={(item, index) => item.id || index.toString()}
                renderItem={({ item }) => {
                  const { extractedName, extractedPhone, extractedMobile, extractedStreet, extractedCity } = extractContactData(item);
                  return (
                    <TouchableOpacity
                      style={styles.contactItem}
                      onPress={() => handleSelectContact(item)}
                    >
                      <Ionicons name="person-circle" size={40} color="#1976d2" />
                      <View style={styles.contactItemInfo}>
                        <Text style={styles.contactItemName}>{extractedName}</Text>
                        {(extractedPhone || extractedMobile) && (
                          <Text style={styles.contactItemDetail}>
                            {extractedPhone || extractedMobile}
                          </Text>
                        )}
                        {extractedStreet && (
                          <Text style={styles.contactItemDetail} numberOfLines={1}>
                            {extractedStreet}{extractedCity ? `, ${extractedCity}` : ''}
                          </Text>
                        )}
                      </View>
                    </TouchableOpacity>
                  );
                }}
                ListEmptyComponent={
                  <View style={styles.emptyListContainer}>
                    <Text style={styles.emptyListText}>Keine Kontakte gefunden</Text>
                  </View>
                }
                style={styles.contactList}
              />
            )}
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
    padding: 14,
    borderRadius: 10,
    marginBottom: 20,
    gap: 8,
  },
  importButtonText: {
    color: '#1976d2',
    fontSize: 16,
    fontWeight: '500',
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
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  row: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  halfInput: {
    flex: 1,
  },
  plzInput: {
    flex: 1,
  },
  cityInput: {
    flex: 2,
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
  contactList: {
    maxHeight: 400,
  },
  contactItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    gap: 12,
  },
  contactItemInfo: {
    flex: 1,
  },
  contactItemName: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
  },
  contactItemDetail: {
    fontSize: 13,
    color: '#666',
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
  loadingContainer: {
    padding: 40,
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#666',
  },
});

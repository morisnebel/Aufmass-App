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
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Contacts from 'expo-contacts';
import axios from 'axios';
import Constants from 'expo-constants';

const API_URL = Constants.expoConfig?.extra?.EXPO_PUBLIC_BACKEND_URL || process.env.EXPO_PUBLIC_BACKEND_URL;

export default function NewCustomerScreen() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [loading, setLoading] = useState(false);
  
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

  const importFromContacts = async () => {
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
    console.log('Selected contact:', JSON.stringify(contact, null, 2));
    
    // Set name
    if (contact.name) {
      console.log('Setting name:', contact.name);
      setName(contact.name);
    }
    
    // Set email (first email if available)
    if (contact.emails && contact.emails.length > 0) {
      const emailValue = contact.emails[0].email || '';
      console.log('Setting email:', emailValue);
      setEmail(emailValue);
    }
    
    // Set phone (first phone number if available)
    if (contact.phoneNumbers && contact.phoneNumbers.length > 0) {
      const phoneValue = contact.phoneNumbers[0].number || '';
      console.log('Setting phone:', phoneValue);
      setPhone(phoneValue);
    }
    
    // Set address (first address if available)
    if (contact.addresses && contact.addresses.length > 0) {
      const addr = contact.addresses[0];
      console.log('Address data:', addr);
      const addressParts = [];
      if (addr.street) addressParts.push(addr.street);
      if (addr.postalCode || addr.city) {
        addressParts.push([addr.postalCode, addr.city].filter(Boolean).join(' '));
      }
      if (addr.country) addressParts.push(addr.country);
      const addressValue = addressParts.join(', ');
      console.log('Setting address:', addressValue);
      setAddress(addressValue);
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
      Alert.alert('Erfolg', 'Kunde wurde erstellt', [
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
          <TouchableOpacity
            style={styles.importButton}
            onPress={importFromContacts}
          >
            <Ionicons name="people" size={20} color="#1976d2" />
            <Text style={styles.importButtonText}>Aus Kontakten importieren</Text>
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
              keyboardType="phone-pad"
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
    borderRadius: 8,
    marginBottom: 24,
    gap: 8,
  },
  importButtonText: {
    color: '#1976d2',
    fontSize: 16,
    fontWeight: '600',
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
});

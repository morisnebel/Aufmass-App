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
      // Check if we're on web
      if (Platform.OS === 'web') {
        Alert.alert('Hinweis', 'Kontakt-Import ist nur in der mobilen App verfügbar');
        return;
      }

      setLoadingContacts(true);
      setShowContactPicker(true);
      
      const { status } = await Contacts.requestPermissionsAsync();
      
      if (status !== 'granted') {
        Alert.alert('Berechtigung erforderlich', 'Bitte erlauben Sie den Zugriff auf Ihre Kontakte');
        setShowContactPicker(false);
        setLoadingContacts(false);
        return;
      }
      
      const { data } = await Contacts.getContactsAsync({
        fields: [
          Contacts.Fields.Name,
          Contacts.Fields.Emails,
          Contacts.Fields.PhoneNumbers,
          Contacts.Fields.Addresses,
        ],
      });
      
      // Sort contacts by name
      const sortedContacts = data.sort((a, b) => {
        const nameA = a.name || '';
        const nameB = b.name || '';
        return nameA.localeCompare(nameB);
      });
      
      setContacts(sortedContacts);
    } catch (error) {
      console.error('Error loading contacts:', error);
      Alert.alert('Fehler', 'Kontakte konnten nicht geladen werden');
      setShowContactPicker(false);
    } finally {
      setLoadingContacts(false);
    }
  };

  const selectContact = (contact: Contacts.Contact) => {
    // Set name
    if (contact.name) {
      setName(contact.name);
    }
    
    // Set email (first email if available)
    if (contact.emails && contact.emails.length > 0) {
      setEmail(contact.emails[0].email || '');
    }
    
    // Set phone (first phone number if available)
    if (contact.phoneNumbers && contact.phoneNumbers.length > 0) {
      setPhone(contact.phoneNumbers[0].number || '');
    }
    
    // Set address (first address if available)
    if (contact.addresses && contact.addresses.length > 0) {
      const addr = contact.addresses[0];
      const addressParts = [];
      if (addr.street) addressParts.push(addr.street);
      if (addr.postalCode || addr.city) {
        addressParts.push([addr.postalCode, addr.city].filter(Boolean).join(' '));
      }
      if (addr.country) addressParts.push(addr.country);
      setAddress(addressParts.join(', '));
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
});

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
import * as Contacts from 'expo-contacts';
import { Ionicons } from '@expo/vector-icons';
import { CustomerService, generateFullName, generateFullAddress } from '../../services/LocalStorage';

// Anrede-Optionen
const SALUTATION_OPTIONS = ['Herr', 'Frau', 'Firma', 'Familie', 'Dr.', 'Prof.'];

// Helper function to extract contact data
function extractContactData(contact: Contacts.Contact) {
  let extractedFirstName = '';
  let extractedLastName = '';
  let extractedEmail = '';
  let extractedPhone = '';
  let extractedMobile = '';
  let extractedStreet = '';
  let extractedPlz = '';
  let extractedCity = '';

  extractedFirstName = contact.firstName || '';
  extractedLastName = contact.lastName || '';
  
  // Falls kein Vor-/Nachname, versuche den Namen zu splitten
  if (!extractedFirstName && !extractedLastName && contact.name) {
    const nameParts = contact.name.split(' ');
    extractedFirstName = nameParts[0] || '';
    extractedLastName = nameParts.slice(1).join(' ') || '';
  }

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
    if (!extractedPhone && !extractedMobile) {
      const phoneObj = contact.phoneNumbers[0] as any;
      extractedPhone = phoneObj?.number || phoneObj?.digits || phoneObj?.value || '';
    }
  }

  if (contact.addresses && contact.addresses.length > 0) {
    const addr = contact.addresses[0] as any;
    extractedStreet = addr?.street || '';
    extractedPlz = addr?.postalCode || '';
    extractedCity = addr?.city || '';
  }

  return { extractedFirstName, extractedLastName, extractedEmail, extractedPhone, extractedMobile, extractedStreet, extractedPlz, extractedCity };
}

export default function EditCustomerScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const customerId = Array.isArray(id) ? id[0] : id;
  
  // Skip if this is the index route being misrouted
  const isValidCustomerId = customerId && customerId !== 'index' && customerId !== 'new';
  
  // Form state - neue erweiterte Felder
  const [salutation, setSalutation] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [mobile, setMobile] = useState('');
  const [street, setStreet] = useState('');
  const [zip, setZip] = useState('');
  const [city, setCity] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  // Anrede-Picker Modal
  const [showSalutationPicker, setShowSalutationPicker] = useState(false);
  
  // Contact sync state
  const [importedContactId, setImportedContactId] = useState<string | null>(null);
  
  // Import options modal
  const [showImportOptions, setShowImportOptions] = useState(false);
  
  // Quick entry modal state
  const [showQuickEntry, setShowQuickEntry] = useState(false);
  const [quickFirstName, setQuickFirstName] = useState('');
  const [quickLastName, setQuickLastName] = useState('');
  const [quickEmail, setQuickEmail] = useState('');
  const [quickPhone, setQuickPhone] = useState('');
  const [quickStreet, setQuickStreet] = useState('');
  const [quickZip, setQuickZip] = useState('');
  const [quickCity, setQuickCity] = useState('');
  
  // Contact picker state
  const [showContactPicker, setShowContactPicker] = useState(false);
  const [contacts, setContacts] = useState<(Contacts.Contact & { id?: string })[]>([]);
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Delete modal state
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  
  const isImportingRef = useRef(false);

  useEffect(() => {
    if (!isImportingRef.current && isValidCustomerId) {
      loadCustomer();
    } else if (!isValidCustomerId) {
      setLoading(false);
    }
  }, [customerId, isValidCustomerId]);

  const loadCustomer = async () => {
    if (isImportingRef.current || !isValidCustomerId) {
      setLoading(false);
      return;
    }
    
    try {
      console.log('Loading customer with ID:', customerId);
      const customer = await CustomerService.getById(customerId);
      console.log('Loaded customer:', customer);
      
      if (customer && !isImportingRef.current) {
        setSalutation(customer.salutation || '');
        setFirstName(customer.firstName || '');
        setLastName(customer.lastName || '');
        setEmail(customer.email || '');
        setPhone(customer.phone || '');
        setMobile(customer.mobile || '');
        setStreet(customer.street || '');
        setZip(customer.zip || '');
        setCity(customer.city || '');
        
        // Lade die importedContactId wenn vorhanden
        if (customer.importedContactId) {
          setImportedContactId(customer.importedContactId);
        }
        
        // Abwärtskompatibilität: Falls nur name vorhanden, versuche zu splitten
        if (!customer.firstName && !customer.lastName && customer.name) {
          const nameParts = customer.name.split(' ');
          if (nameParts.length >= 2) {
            // Prüfe ob erster Teil eine Anrede ist
            const possibleSalutation = nameParts[0];
            if (SALUTATION_OPTIONS.includes(possibleSalutation)) {
              setSalutation(possibleSalutation);
              setFirstName(nameParts[1] || '');
              setLastName(nameParts.slice(2).join(' ') || '');
            } else {
              setFirstName(nameParts[0] || '');
              setLastName(nameParts.slice(1).join(' ') || '');
            }
          } else {
            setLastName(customer.name);
          }
        }
        
        // Abwärtskompatibilität: Falls nur address vorhanden, versuche zu parsen
        if (!customer.street && !customer.zip && !customer.city && customer.address) {
          const addressParts = customer.address.split(',').map(p => p.trim());
          if (addressParts.length >= 1) {
            setStreet(addressParts[0] || '');
          }
          if (addressParts.length >= 2) {
            const cityParts = addressParts[1].split(' ');
            if (cityParts.length >= 2 && /^\d+$/.test(cityParts[0])) {
              setZip(cityParts[0]);
              setCity(cityParts.slice(1).join(' '));
            } else {
              setCity(addressParts[1]);
            }
          }
        }
      } else {
        console.log('Customer not found or importing');
      }
    } catch (error) {
      console.error('Error loading customer:', error);
      Alert.alert('Fehler', 'Kunde konnte nicht geladen werden');
    } finally {
      setLoading(false);
    }
  };

  const handleImportPress = () => {
    setShowImportOptions(true);
  };

  const openQuickEntry = () => {
    setShowImportOptions(false);
    setQuickFirstName(firstName);
    setQuickLastName(lastName);
    setQuickEmail(email);
    setQuickPhone(phone);
    setQuickStreet(street);
    setQuickZip(zip);
    setQuickCity(city);
    setShowQuickEntry(true);
  };

  const applyQuickEntry = () => {
    isImportingRef.current = true;
    setFirstName(quickFirstName);
    setLastName(quickLastName);
    setEmail(quickEmail);
    setPhone(quickPhone);
    setStreet(quickStreet);
    setZip(quickZip);
    setCity(quickCity);
    setShowQuickEntry(false);
  };

  const openContactPicker = async () => {
    setShowImportOptions(false);
    
    if (Platform.OS === 'web') {
      Alert.alert('Hinweis', 'Kontakt-Import aus dem Adressbuch ist nur in der mobilen App verfügbar.');
      return;
    }

    try {
      const { status } = await Contacts.requestPermissionsAsync();
      
      if (status !== 'granted') {
        Alert.alert('Berechtigung erforderlich', 'Bitte erlauben Sie den Zugriff auf Ihre Kontakte.');
        return;
      }

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

      const sortedContacts = data.sort((a, b) => {
        const nameA = a.name || a.firstName || a.lastName || '';
        const nameB = b.name || b.firstName || b.lastName || '';
        return nameA.localeCompare(nameB);
      });
      
      setContacts(sortedContacts);
    } catch (error) {
      console.error('Error in openContactPicker:', error);
      Alert.alert('Fehler', 'Kontakte konnten nicht geladen werden');
      setShowContactPicker(false);
    } finally {
      setLoadingContacts(false);
    }
  };

  const selectContact = (contact: Contacts.Contact & { id?: string }) => {
    isImportingRef.current = true;
    
    const { extractedFirstName, extractedLastName, extractedEmail, extractedPhone, extractedMobile, extractedStreet, extractedPlz, extractedCity } = extractContactData(contact);
    
    setFirstName(extractedFirstName || '');
    setLastName(extractedLastName || '');
    setEmail(extractedEmail || '');
    setPhone(extractedPhone || '');
    setMobile(extractedMobile || '');
    setStreet(extractedStreet || '');
    setZip(extractedPlz || '');
    setCity(extractedCity || '');
    
    if (contact.id) {
      setImportedContactId(contact.id);
    }
    
    setSearchQuery('');
    setShowContactPicker(false);
  };

  const filteredContacts = contacts.filter(contact => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    const contactName = contact.name?.toLowerCase() || '';
    return contactName.includes(query);
  });

  const handleSave = async () => {
    if (!firstName.trim() && !lastName.trim()) {
      Alert.alert('Fehler', 'Bitte geben Sie mindestens einen Vor- oder Nachnamen ein');
      return;
    }

    saveCustomer();
  };

  const saveCustomer = async () => {
    setSaving(true);
    try {
      // Generiere den vollständigen Namen und die kombinierte Adresse
      const fullName = generateFullName(salutation, firstName, lastName);
      const fullAddress = generateFullAddress(street, zip, city);
      
      await CustomerService.update(customerId, {
        salutation: salutation,
        firstName: firstName,
        lastName: lastName,
        name: fullName,
        email: email,
        phone: phone,
        mobile: mobile,
        street: street,
        zip: zip,
        city: city,
        address: fullAddress,
        importedContactId: importedContactId || undefined,
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
      await CustomerService.delete(customerId);
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

  // Sync mit Gerätekontakten
  const syncWithDeviceContacts = async () => {
    if (Platform.OS === 'web') {
      Alert.alert('Hinweis', 'Kontakt-Synchronisation ist nur in der mobilen App verfügbar.');
      return;
    }

    console.log('=== SYNC START ===');
    console.log('importedContactId:', importedContactId);

    try {
      const { status } = await Contacts.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Berechtigung erforderlich', 'Bitte erlauben Sie den Zugriff auf Ihre Kontakte.');
        return;
      }

      const fullName = generateFullName(salutation, firstName, lastName);

      // Kontaktdaten vorbereiten - Anrede separat als namePrefix
      const contactData: Partial<Contacts.Contact> = {
        contactType: Contacts.ContactTypes.Person,
        name: fullName,
        namePrefix: salutation || '', // Anrede (Herr, Frau, Dr., etc.)
        firstName: firstName || '',
        lastName: lastName || '',
        emails: email ? [{ email: email, label: 'Arbeit' }] : [],
        phoneNumbers: [
          ...(mobile ? [{ number: mobile, label: 'Mobil' }] : []),
          ...(phone ? [{ number: phone, label: 'Arbeit' }] : []),
        ].filter(p => p.number),
        addresses: street ? [{
          street: street,
          postalCode: zip || '',
          city: city || '',
          label: 'Arbeit',
        }] : [],
      };

      // Prüfen, ob wir einen existierenden Kontakt haben
      if (importedContactId) {
        console.log('Versuche existierenden Kontakt zu finden:', importedContactId);
        try {
          // Versuche den existierenden Kontakt zu laden
          const existingContact = await Contacts.getContactByIdAsync(importedContactId);
          console.log('Existierender Kontakt gefunden:', existingContact ? 'JA' : 'NEIN');
          
          if (existingContact) {
            // Kontakt existiert - lösche den alten und erstelle einen neuen mit denselben Daten
            console.log('Lösche alten Kontakt...');
            await Contacts.removeContactAsync(importedContactId);
            console.log('Alter Kontakt gelöscht');
            
            // Neuen Kontakt mit aktualisierten Daten erstellen
            console.log('Erstelle neuen Kontakt mit aktualisierten Daten...');
            const newContactId = await Contacts.addContactAsync(contactData as Contacts.Contact);
            console.log('Neuer Kontakt erstellt mit ID:', newContactId);
            
            // Speichere die neue Contact-ID
            if (newContactId) {
              setImportedContactId(newContactId);
              await CustomerService.update(customerId, { importedContactId: newContactId });
              console.log('Neue ID gespeichert');
            }
            
            Alert.alert('Erfolg', `"${fullName}" wurde in Ihren Kontakten aktualisiert.`);
            return;
          }
        } catch (updateError) {
          console.log('Fehler beim Update:', updateError);
        }
      }

      // Kein existierender Kontakt - neuen erstellen
      console.log('Erstelle komplett neuen Kontakt...');
      const newContactId = await Contacts.addContactAsync(contactData as Contacts.Contact);
      console.log('Neuer Kontakt erstellt mit ID:', newContactId);
      
      // Speichere die neue Contact-ID
      if (newContactId) {
        setImportedContactId(newContactId);
        await CustomerService.update(customerId, { importedContactId: newContactId });
        console.log('ID beim Kunden gespeichert');
      }
      
      Alert.alert('Erfolg', `"${fullName}" wurde zu Ihren Kontakten hinzugefügt.`);
    } catch (error) {
      console.error('Error syncing contact:', error);
      Alert.alert('Fehler', 'Kontakt konnte nicht synchronisiert werden.');
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
      <ScrollView style={styles.scrollView} keyboardShouldPersistTaps="handled">
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

          {/* Anrede */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Anrede</Text>
            <TouchableOpacity 
              style={styles.pickerButton}
              onPress={() => setShowSalutationPicker(true)}
            >
              <Text style={salutation ? styles.pickerText : styles.pickerPlaceholder}>
                {salutation || 'Anrede auswählen'}
              </Text>
              <Ionicons name="chevron-down" size={20} color="#666" />
            </TouchableOpacity>
          </View>

          {/* Vorname & Nachname */}
          <View style={styles.row}>
            <View style={styles.halfInput}>
              <Text style={styles.label}>Vorname *</Text>
              <TextInput
                style={styles.input}
                placeholder="Vorname"
                value={firstName}
                onChangeText={setFirstName}
              />
            </View>
            <View style={styles.halfInput}>
              <Text style={styles.label}>Nachname *</Text>
              <TextInput
                style={styles.input}
                placeholder="Nachname"
                value={lastName}
                onChangeText={setLastName}
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
            />
          </View>

          <View style={styles.row}>
            <View style={styles.plzInput}>
              <Text style={styles.label}>PLZ</Text>
              <TextInput
                style={styles.input}
                placeholder="PLZ"
                value={zip}
                onChangeText={setZip}
                keyboardType="number-pad"
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

          <View style={styles.row}>
            <View style={styles.halfInput}>
              <Text style={styles.label}>Mobiltelefon</Text>
              <TextInput
                style={styles.input}
                placeholder="Handynummer"
                value={mobile}
                onChangeText={setMobile}
                keyboardType="phone-pad"
              />
            </View>
            <View style={styles.halfInput}>
              <Text style={styles.label}>Telefon</Text>
              <TextInput
                style={styles.input}
                placeholder="Festnetz"
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
              />
            </View>
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
            style={styles.syncContactButton}
            onPress={syncWithDeviceContacts}
          >
            <Ionicons name="sync" size={20} color="#4caf50" />
            <Text style={styles.syncContactButtonText}>Mit Kontakten synchronisieren</Text>
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
                <Text style={styles.optionSubtitle}>Daten manuell bearbeiten</Text>
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
            <View style={styles.row}>
              <View style={styles.halfInput}>
                <Text style={styles.label}>Vorname</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Vorname"
                  value={quickFirstName}
                  onChangeText={setQuickFirstName}
                  autoFocus
                />
              </View>
              <View style={styles.halfInput}>
                <Text style={styles.label}>Nachname</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Nachname"
                  value={quickLastName}
                  onChangeText={setQuickLastName}
                />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Straße</Text>
              <TextInput
                style={styles.input}
                placeholder="Straße und Hausnummer"
                value={quickStreet}
                onChangeText={setQuickStreet}
              />
            </View>

            <View style={styles.row}>
              <View style={styles.plzInput}>
                <Text style={styles.label}>PLZ</Text>
                <TextInput
                  style={styles.input}
                  placeholder="PLZ"
                  value={quickZip}
                  onChangeText={setQuickZip}
                  keyboardType="number-pad"
                />
              </View>
              <View style={styles.cityInput}>
                <Text style={styles.label}>Ort</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Ort"
                  value={quickCity}
                  onChangeText={setQuickCity}
                />
              </View>
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
        <View style={styles.contactModalContainer}>
          <View style={styles.contactModalHeader}>
            <Text style={styles.contactModalTitle}>Kontakt auswählen</Text>
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

      {/* Anrede Picker Modal */}
      <Modal
        visible={showSalutationPicker}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowSalutationPicker(false)}
      >
        <Pressable 
          style={styles.salutationModalOverlay}
          onPress={() => setShowSalutationPicker(false)}
        >
          <View style={styles.salutationModalContent}>
            <Text style={styles.salutationModalTitle}>Anrede auswählen</Text>
            {SALUTATION_OPTIONS.map((option) => (
              <TouchableOpacity
                key={option}
                style={styles.salutationOption}
                onPress={() => {
                  setSalutation(option);
                  setShowSalutationPicker(false);
                }}
              >
                <Text style={[
                  styles.salutationOptionText,
                  salutation === option && styles.salutationOptionSelected
                ]}>{option}</Text>
                {salutation === option && (
                  <Ionicons name="checkmark" size={20} color="#1976d2" />
                )}
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={styles.salutationOption}
              onPress={() => {
                setSalutation('');
                setShowSalutationPicker(false);
              }}
            >
              <Text style={styles.salutationOptionText}>Keine Anrede</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
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
  syncContactButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#4caf50',
    marginTop: 16,
    gap: 8,
    backgroundColor: '#e8f5e9',
  },
  syncContactButtonText: {
    color: '#4caf50',
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
  closeButton: {
    padding: 4,
  },
  // Contact Picker Modal
  contactModalContainer: {
    flex: 1,
    backgroundColor: '#fff',
  },
  contactModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  contactModalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
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
  // Neue Styles für erweiterte Felder
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
  pickerButton: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  pickerText: {
    fontSize: 16,
    color: '#333',
  },
  pickerPlaceholder: {
    fontSize: 16,
    color: '#999',
  },
  salutationModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  salutationModalContent: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    width: '80%',
    maxWidth: 300,
  },
  salutationModalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 16,
    textAlign: 'center',
  },
  salutationOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  salutationOptionText: {
    fontSize: 16,
    color: '#333',
  },
  salutationOptionSelected: {
    color: '#1976d2',
    fontWeight: '600',
  },
});

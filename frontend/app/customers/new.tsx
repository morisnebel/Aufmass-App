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
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Contacts from 'expo-contacts';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CustomerService, generateFullName, generateFullAddress, isCustomerNumberDuplicate, getNextAvailableCustomerNumber } from '../../services/LocalStorage';

// Anrede-Optionen
const SALUTATION_OPTIONS = ['Herr', 'Frau', 'Firma', 'Familie', 'Dr.', 'Prof.'];

// Helper function to extract contact data with separate address fields
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

export default function NewCustomerScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const selectMode = params.selectMode === 'true';
  
  // Form state - neue erweiterte Felder
  const [customerNumber, setCustomerNumber] = useState(''); // KD-26001 etc.
  const [salutation, setSalutation] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [mobile, setMobile] = useState('');
  const [street, setStreet] = useState('');
  const [plz, setPlz] = useState('');
  const [city, setCity] = useState('');
  const [loading, setLoading] = useState(false);
  
  // Importierte Kontakt-ID für Synchronisation
  const [importedContactId, setImportedContactId] = useState<string | null>(null);
  
  // Anrede-Picker Modal
  const [showSalutationPicker, setShowSalutationPicker] = useState(false);
  
  // Import options modal
  const [showImportOptions, setShowImportOptions] = useState(false);
  
  // Contact picker state
  const [showContactPicker, setShowContactPicker] = useState(false);
  const [contacts, setContacts] = useState<Contacts.Contact[]>([]);
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Function to save contact to device contacts
  const saveToDeviceContacts = async (customerData: {
    salutation?: string;
    firstName?: string;
    lastName?: string;
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

      const fullName = generateFullName(customerData.salutation, customerData.firstName, customerData.lastName);

      const contact: Contacts.Contact = {
        contactType: Contacts.ContactTypes.Person,
        name: fullName,
        namePrefix: customerData.salutation || '', // Anrede als Präfix
        firstName: customerData.firstName || '',
        lastName: customerData.lastName || '',
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

  // Funktion zum Aktualisieren eines bestehenden iPad-Kontakts
  const updateDeviceContact = async (contactId: string, customerData: {
    salutation?: string;
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
    mobile?: string;
    street?: string;
    plz?: string;
    city?: string;
  }) => {
    if (Platform.OS === 'web') {
      return false;
    }

    try {
      const { status } = await Contacts.requestPermissionsAsync();
      if (status !== 'granted') {
        console.log('Contacts permission not granted');
        return false;
      }

      const fullName = generateFullName(customerData.salutation, customerData.firstName, customerData.lastName);

      const updatedContact: Contacts.Contact = {
        id: contactId,
        contactType: Contacts.ContactTypes.Person,
        name: fullName,
        namePrefix: customerData.salutation || '',
        firstName: customerData.firstName || '',
        lastName: customerData.lastName || '',
        emails: customerData.email ? [{ email: customerData.email, label: 'Arbeit' }] : [],
        phoneNumbers: [
          ...(customerData.phone ? [{ number: customerData.phone, label: 'Arbeit' }] : []),
          ...(customerData.mobile ? [{ number: customerData.mobile, label: 'Mobil' }] : []),
        ].filter(p => p.number),
        addresses: customerData.street ? [{
          street: customerData.street,
          postalCode: customerData.plz || '',
          city: customerData.city || '',
          label: 'Arbeit',
        }] : [],
      };

      await Contacts.updateContactAsync(updatedContact);
      console.log('Contact updated in device contacts');
      return true;
    } catch (error) {
      console.error('Error updating device contact:', error);
      return false;
    }
  };

  const handleSave = async () => {
    if (!firstName.trim() && !lastName.trim()) {
      Alert.alert('Fehler', 'Bitte geben Sie mindestens einen Vor- oder Nachnamen ein');
      return;
    }

    // Prüfe ob der Kontakt aus iPad-Kontakten importiert wurde
    if (Platform.OS !== 'web' && importedContactId) {
      // Kontakt wurde importiert - biete Option zum Aktualisieren an
      Alert.alert(
        'Kontakt synchronisieren?',
        'Dieser Kunde wurde aus Ihren iPad-Kontakten importiert. Möchten Sie die Änderungen auch dort aktualisieren?',
        [
          {
            text: 'Nur hier speichern',
            style: 'cancel',
            onPress: () => saveCustomer(false),
          },
          {
            text: 'Kontakt aktualisieren',
            onPress: () => saveCustomer(true, true), // updateExisting = true
          },
        ]
      );
    } else if (Platform.OS !== 'web') {
      // Neuer Kontakt - frage ob in Kontakten speichern
      Alert.alert(
        'In Kontakte speichern?',
        'Soll dieser Kunde auch in Ihren iPad-Kontakten gespeichert werden?',
        [
          {
            text: 'Nein',
            style: 'cancel',
            onPress: () => saveCustomer(false),
          },
          {
            text: 'Ja',
            onPress: () => saveCustomer(true),
          },
        ]
      );
    } else {
      saveCustomer(false);
    }
  };

  const saveCustomer = async (saveToContacts: boolean, updateExisting: boolean = false) => {
    console.log('[DEBUG] saveCustomer aufgerufen mit customerNumber:', customerNumber);
    
    // Duplikat-Prüfung für Kundennummer
    if (customerNumber) {
      console.log('[DEBUG] Prüfe Kundennummer auf Duplikat:', customerNumber);
      const isDuplicate = await isCustomerNumberDuplicate(customerNumber);
      console.log('[DEBUG] isDuplicate Ergebnis:', isDuplicate);
      
      if (isDuplicate) {
        console.log('[DEBUG] Duplikat gefunden! Zeige Dialog...');
        Alert.alert(
          'Kundennummer bereits vergeben',
          `Die Kundennummer "${customerNumber}" existiert bereits. Was möchten Sie tun?`,
          [
            { text: 'Abbrechen', style: 'cancel' },
            { 
              text: 'Trotzdem verwenden', 
              onPress: () => doSaveCustomer(saveToContacts, updateExisting, customerNumber)
            },
            {
              text: 'Automatisch vergeben',
              onPress: async () => {
                const newNumber = await getNextAvailableCustomerNumber();
                doSaveCustomer(saveToContacts, updateExisting, newNumber);
              }
            }
          ]
        );
        return;
      }
    }
    
    // Keine Duplikate, normal speichern
    console.log('[DEBUG] Kein Duplikat, speichere direkt...');
    await doSaveCustomer(saveToContacts, updateExisting, customerNumber || undefined);
  };
  
  const doSaveCustomer = async (saveToContacts: boolean, updateExisting: boolean, finalCustomerNumber: string | undefined) => {
    setLoading(true);
    try {
      // Generiere den vollständigen Namen und die kombinierte Adresse
      const fullName = generateFullName(salutation, firstName, lastName);
      const fullAddress = generateFullAddress(street, plz, city);
      
      const newCustomer = await CustomerService.create({
        salutation: salutation || undefined,
        firstName: firstName || undefined,
        lastName: lastName || undefined,
        name: fullName,
        email: email || undefined,
        phone: phone || undefined,
        mobile: mobile || undefined,
        street: street || undefined,
        zip: plz || undefined,
        city: city || undefined,
        address: fullAddress || undefined,
        importedContactId: importedContactId || undefined,
        customer_number: finalCustomerNumber,
      });
      
      // Hilfsfunktion für Navigation nach Kundenerstellung
      const handleNavigateBack = async () => {
        if (selectMode && newCustomer?.id) {
          // Im selectMode: Speichere die ID und gehe 2x zurück (zur Projekterstellung)
          await AsyncStorage.setItem('selectedCustomerId', newCustomer.id);
          router.back(); // Zurück zur Kundenliste
          setTimeout(() => {
            router.back(); // Zurück zur Projekterstellung
          }, 100);
        } else {
          router.back();
        }
      };
      
      // Handle contact synchronization
      if (saveToContacts && updateExisting && importedContactId) {
        // Aktualisiere den bestehenden iPad-Kontakt
        const success = await updateDeviceContact(importedContactId, {
          salutation: salutation || undefined,
          firstName: firstName || undefined,
          lastName: lastName || undefined,
          email: email || undefined,
          phone: phone || undefined,
          mobile: mobile || undefined,
          street: street || undefined,
          plz: plz || undefined,
          city: city || undefined,
        });
        if (success) {
          Alert.alert('Erfolg', 'Kunde wurde erstellt und iPad-Kontakt wurde aktualisiert', [
            { text: 'OK', onPress: handleNavigateBack },
          ]);
        } else {
          Alert.alert('Teilweise erfolgreich', 'Kunde wurde erstellt, aber der iPad-Kontakt konnte nicht aktualisiert werden', [
            { text: 'OK', onPress: handleNavigateBack },
          ]);
        }
      } else if (saveToContacts) {
        // Neuen Kontakt erstellen
        await saveToDeviceContacts({
          salutation: salutation || undefined,
          firstName: firstName || undefined,
          lastName: lastName || undefined,
          email: email || undefined,
          phone: phone || undefined,
          mobile: mobile || undefined,
          street: street || undefined,
          plz: plz || undefined,
          city: city || undefined,
        });
        Alert.alert('Erfolg', 'Kunde wurde erstellt und in Kontakten gespeichert', [
          { text: 'OK', onPress: handleNavigateBack },
        ]);
      } else {
        Alert.alert('Erfolg', 'Kunde wurde erstellt', [
          { text: 'OK', onPress: handleNavigateBack },
        ]);
      }
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
    const { extractedFirstName, extractedLastName, extractedEmail, extractedPhone, extractedMobile, extractedStreet, extractedPlz, extractedCity } = extractContactData(contact);
    
    setFirstName(extractedFirstName);
    setLastName(extractedLastName);
    setEmail(extractedEmail);
    setPhone(extractedPhone);
    setMobile(extractedMobile);
    setStreet(extractedStreet);
    setPlz(extractedPlz);
    setCity(extractedCity);
    
    // Speichere die Kontakt-ID für spätere Synchronisation
    if ((contact as any).id) {
      setImportedContactId((contact as any).id);
    }
    
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
      {/* Header mit Zurück-Button */}
      <View style={styles.header}>
        <TouchableOpacity 
          style={styles.backButton} 
          onPress={() => router.back()}
        >
          <Ionicons name="arrow-back" size={24} color="#1976d2" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Neuer Kunde</Text>
        <View style={styles.headerSpacer} />
      </View>
      
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

          {/* Kundennummer */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Kundennummer (optional)</Text>
            <TextInput
              style={styles.input}
              placeholder="Wird automatisch vergeben (z.B. KD-26001)"
              value={customerNumber}
              onChangeText={setCustomerNumber}
            />
            <Text style={styles.fieldHint}>Leer lassen für automatische Vergabe</Text>
          </View>

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
                autoComplete="given-name"
              />
            </View>
            <View style={styles.halfInput}>
              <Text style={styles.label}>Nachname *</Text>
              <TextInput
                style={styles.input}
                placeholder="Nachname"
                value={lastName}
                onChangeText={setLastName}
                autoComplete="family-name"
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
                autoComplete="tel"
              />
            </View>
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
                keyExtractor={(item, index) => (item as any).id || index.toString()}
                renderItem={({ item }) => {
                  const { extractedFirstName, extractedLastName, extractedPhone, extractedMobile, extractedStreet, extractedCity } = extractContactData(item);
                  const displayName = `${extractedFirstName} ${extractedLastName}`.trim() || item.name || 'Unbekannt';
                  return (
                    <TouchableOpacity
                      style={styles.contactItem}
                      onPress={() => handleSelectContact(item)}
                    >
                      <Ionicons name="person-circle" size={40} color="#1976d2" />
                      <View style={styles.contactItemInfo}>
                        <Text style={styles.contactItemName}>{displayName}</Text>
                        {(extractedPhone || extractedMobile) && (
                          <Text style={styles.contactItemDetail}>
                            {extractedMobile || extractedPhone}
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingTop: Platform.OS === 'ios' ? 50 : 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  backButton: {
    padding: 8,
    marginRight: 8,
  },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  headerSpacer: {
    width: 40,
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
    justifyContent: 'flex-start',
    paddingTop: 50,
    paddingHorizontal: 15,
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 20,
    height: 450,
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
  // Anrede Picker Styles
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
  fieldHint: {
    fontSize: 12,
    color: '#888',
    marginTop: 4,
    fontStyle: 'italic',
  },
});

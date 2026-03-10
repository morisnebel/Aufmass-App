import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
  Modal,
  FlatList,
  Pressable,
  InteractionManager,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Contacts from 'expo-contacts';
import { CustomerService, ProjectService, Customer, ProjectAddress } from '../../services/LocalStorage';

// Customer type is imported from LocalStorage service

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

  return { extractedName, extractedEmail, extractedPhone, extractedMobile, extractedStreet, extractedPlz, extractedCity };
}

export default function NewProjectScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ customer_id?: string }>();
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
  
  // New customer modal state - separate fields
  const [showNewCustomerModal, setShowNewCustomerModal] = useState(false);
  const [newCustomerAnrede, setNewCustomerAnrede] = useState('');
  const [newCustomerName, setNewCustomerName] = useState('');
  const [newCustomerEmail, setNewCustomerEmail] = useState('');
  const [newCustomerPhone, setNewCustomerPhone] = useState('');
  const [newCustomerMobile, setNewCustomerMobile] = useState('');
  const [newCustomerStreet, setNewCustomerStreet] = useState('');
  const [newCustomerPlz, setNewCustomerPlz] = useState('');
  const [newCustomerCity, setNewCustomerCity] = useState('');
  const [creatingCustomer, setCreatingCustomer] = useState(false);
  
  // Contact picker modal
  const [showContactPicker, setShowContactPicker] = useState(false);
  const [deviceContacts, setDeviceContacts] = useState<Contacts.Contact[]>([]);
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [contactSearchQuery, setContactSearchQuery] = useState('');
  
  // Importierte Kontakt-ID für Sync
  const [importedContactId, setImportedContactId] = useState<string | null>(null);

  // Objektadresse States
  const [selectedProjectAddress, setSelectedProjectAddress] = useState<ProjectAddress | null>(null);
  const [objektStreet, setObjektStreet] = useState('');
  const [objektPlz, setObjektPlz] = useState('');
  const [objektCity, setObjektCity] = useState('');
  const [objektContactPerson, setObjektContactPerson] = useState('');
  const [objektPhone, setObjektPhone] = useState('');
  const [objektEmail, setObjektEmail] = useState('');
  const [showAddressPicker, setShowAddressPicker] = useState(false);
  
  // Adresse speichern Modal
  const [showSaveAddressModal, setShowSaveAddressModal] = useState(false);
  const [newAddressName, setNewAddressName] = useState('');

  useEffect(() => {
    loadCustomers();
  }, []);

  const loadCustomers = async () => {
    try {
      const data = await CustomerService.getAll();
      setCustomers(data);
      
      // Pre-select customer if customer_id is provided via URL params
      if (params.customer_id) {
        const preselectedCustomer = data.find(c => c.id === params.customer_id);
        if (preselectedCustomer) {
          setCustomerId(preselectedCustomer.id);
          setSelectedCustomer(preselectedCustomer);
        }
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
    // Objektadresse zurücksetzen wenn Kunde wechselt
    setSelectedProjectAddress(null);
    setObjektStreet('');
    setObjektPlz('');
    setObjektCity('');
    setObjektContactPerson('');
    setObjektPhone('');
    setObjektEmail('');
  };

  const handleSelectProjectAddress = (address: ProjectAddress) => {
    setSelectedProjectAddress(address);
    setObjektStreet(address.street);
    setObjektPlz(address.zip);
    setObjektCity(address.city);
    setObjektContactPerson(address.contactPerson || '');
    setObjektPhone(address.phone || '');
    setObjektEmail(address.email || '');
    setShowAddressPicker(false);
  };

  const clearProjectAddress = () => {
    setSelectedProjectAddress(null);
    setObjektStreet('');
    setObjektPlz('');
    setObjektCity('');
    setObjektContactPerson('');
    setObjektPhone('');
    setObjektEmail('');
  };

  const filteredCustomers = customers.filter(customer =>
    (customer.name?.toLowerCase() || '').includes(searchQuery.toLowerCase()) ||
    (customer.address?.toLowerCase() || '').includes(searchQuery.toLowerCase())
  );

  // Open contact picker from device
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

      // Schließe zuerst das NewCustomer Modal
      setShowNewCustomerModal(false);
      
      // Verwende InteractionManager für bessere Performance
      // Dies wartet bis alle Animationen abgeschlossen sind
      InteractionManager.runAfterInteractions(async () => {
        setShowContactPicker(true);
        setLoadingContacts(true);

        try {
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

          const sortedContacts = data
            .filter(c => c.name || c.firstName || c.lastName)
            .sort((a, b) => {
              const nameA = a.name || `${a.firstName} ${a.lastName}` || '';
              const nameB = b.name || `${b.firstName} ${b.lastName}` || '';
              return nameA.localeCompare(nameB);
            });

          setDeviceContacts(sortedContacts);
        } catch (error) {
          console.error('Error loading contacts:', error);
          Alert.alert('Fehler', 'Kontakte konnten nicht geladen werden');
          setShowContactPicker(false);
        } finally {
          setLoadingContacts(false);
        }
      });
    } catch (error) {
      console.error('Error requesting contacts permission:', error);
      Alert.alert('Fehler', 'Kontakt-Berechtigung konnte nicht angefordert werden');
    }
  };

  // Select a contact and fill new customer form
  const handleSelectContact = (contact: Contacts.Contact & { id?: string }) => {
    const { extractedName, extractedEmail, extractedPhone, extractedMobile, extractedStreet, extractedPlz, extractedCity } = extractContactData(contact);
    
    setNewCustomerName(extractedName);
    setNewCustomerEmail(extractedEmail);
    setNewCustomerPhone(extractedPhone);
    setNewCustomerMobile(extractedMobile);
    setNewCustomerStreet(extractedStreet);
    setNewCustomerPlz(extractedPlz);
    setNewCustomerCity(extractedCity);
    
    // Speichere die Kontakt-ID für spätere Synchronisation
    if (contact.id) {
      setImportedContactId(contact.id);
    }
    
    setShowContactPicker(false);
    setContactSearchQuery('');
    
    // Verwende InteractionManager für bessere Performance
    InteractionManager.runAfterInteractions(() => {
      setShowNewCustomerModal(true);
    });
  };

  const filteredContacts = deviceContacts.filter(contact => {
    const contactName = contact.name || `${contact.firstName || ''} ${contact.lastName || ''}`.trim();
    return contactName.toLowerCase().includes(contactSearchQuery.toLowerCase());
  });

  // Create new customer - mit Bestätigungsdialog
  const handleCreateCustomer = async () => {
    if (!newCustomerName.trim()) {
      Alert.alert('Fehler', 'Bitte geben Sie einen Namen ein');
      return;
    }

    // Wenn aus Kontakten importiert wurde, frage nach Aktualisierung
    if (Platform.OS !== 'web' && importedContactId) {
      Alert.alert(
        'Kontakt aktualisieren?',
        'Möchten Sie die Änderungen auch in Ihren iPad-Kontakten aktualisieren?',
        [
          {
            text: 'Nein',
            style: 'cancel',
            onPress: () => saveNewCustomer(false),
          },
          {
            text: 'Ja',
            onPress: () => saveNewCustomer(true),
          },
        ]
      );
    } else if (Platform.OS !== 'web') {
      // Neuer Kunde - frage ob in Kontakte speichern
      Alert.alert(
        'In Kontakte speichern?',
        'Soll dieser Kunde auch in Ihren iPad-Kontakten gespeichert werden?',
        [
          {
            text: 'Nein',
            style: 'cancel',
            onPress: () => saveNewCustomer(false),
          },
          {
            text: 'Ja',
            onPress: () => saveNewCustomer(true),
          },
        ]
      );
    } else {
      saveNewCustomer(false);
    }
  };

  const saveNewCustomer = async (saveOrUpdateContact: boolean) => {
    setCreatingCustomer(true);
    
    // Referenz für den neuen Kunden speichern
    let createdCustomer: Customer | null = null;
    const wasImportedContact = !!importedContactId;
    const savedImportedContactId = importedContactId;
    
    try {
      // Combine name with Anrede
      const fullName = newCustomerAnrede 
        ? `${newCustomerAnrede} ${newCustomerName}` 
        : newCustomerName;
      
      // Combine address fields
      const address = [newCustomerStreet, [newCustomerPlz, newCustomerCity].filter(Boolean).join(' ')].filter(Boolean).join(', ');
      
      createdCustomer = await CustomerService.create({
        name: fullName,
        email: newCustomerEmail || undefined,
        phone: newCustomerPhone || undefined,
        address: address || undefined,
      });
      
      // Save or update device contacts (nur wenn erforderlich)
      if (saveOrUpdateContact && Platform.OS !== 'web') {
        try {
          const { status } = await Contacts.requestPermissionsAsync();
          if (status === 'granted') {
            const nameParts = newCustomerName.split(' ');
            const firstName = nameParts[0] || '';
            const lastName = nameParts.slice(1).join(' ') || '';

            if (savedImportedContactId) {
              // Aktualisiere bestehenden Kontakt
              const updatedContact = {
                id: savedImportedContactId,
                contactType: Contacts.ContactTypes.Person,
                name: fullName,
                firstName: newCustomerAnrede ? newCustomerAnrede : firstName,
                lastName: newCustomerAnrede ? newCustomerName : lastName,
                ...(newCustomerEmail && {
                  emails: [{ email: newCustomerEmail, label: 'Arbeit' }],
                }),
                phoneNumbers: [
                  ...(newCustomerPhone ? [{ number: newCustomerPhone, label: 'Arbeit' }] : []),
                  ...(newCustomerMobile ? [{ number: newCustomerMobile, label: 'Mobil' }] : []),
                ].filter(p => p.number),
                ...(newCustomerStreet && {
                  addresses: [{
                    street: newCustomerStreet,
                    postalCode: newCustomerPlz || '',
                    city: newCustomerCity || '',
                    label: 'Arbeit',
                  }],
                }),
              };
              await Contacts.updateContactAsync(updatedContact as any);
            } else {
              // Erstelle neuen Kontakt
              const contact: Contacts.Contact = {
                contactType: Contacts.ContactTypes.Person,
                name: fullName,
                firstName: newCustomerAnrede ? newCustomerAnrede : firstName,
                lastName: newCustomerAnrede ? newCustomerName : lastName,
                ...(newCustomerEmail && {
                  emails: [{ email: newCustomerEmail, label: 'Arbeit' }],
                }),
                phoneNumbers: [
                  ...(newCustomerPhone ? [{ number: newCustomerPhone, label: 'Arbeit' }] : []),
                  ...(newCustomerMobile ? [{ number: newCustomerMobile, label: 'Mobil' }] : []),
                ].filter(p => p.number),
                ...(newCustomerStreet && {
                  addresses: [{
                    street: newCustomerStreet,
                    postalCode: newCustomerPlz || '',
                    city: newCustomerCity || '',
                    label: 'Arbeit',
                  }],
                }),
              };
              await Contacts.addContactAsync(contact);
            }
          }
        } catch (e) {
          console.log('Could not save/update device contacts:', e);
        }
      }

      // WICHTIG: State-Updates SOFORT durchführen (nicht in setTimeout)
      // Dies verhindert Race Conditions und UI-Freeze
      if (createdCustomer) {
        setCustomers(prevCustomers => [...prevCustomers, createdCustomer!]);
        setCustomerId(createdCustomer.id);
        setSelectedCustomer(createdCustomer);
      }
      
      // Formular zurücksetzen
      resetNewCustomerForm();
      
      // Modals schließen
      setShowNewCustomerModal(false);
      setShowCustomerPicker(false);
      
      // Loading-State beenden BEVOR Alert angezeigt wird
      setCreatingCustomer(false);
      
      // Alert mit requestAnimationFrame verzögern um UI-Thread nicht zu blockieren
      requestAnimationFrame(() => {
        const message = saveOrUpdateContact 
          ? (wasImportedContact ? 'Kunde erstellt und Kontakt aktualisiert' : 'Kunde erstellt und in Kontakten gespeichert')
          : 'Kunde wurde erstellt';
        Alert.alert('Erfolg', message, [{ text: 'OK' }]);
      });
      
    } catch (error) {
      console.error('Error creating customer:', error);
      setCreatingCustomer(false);
      Alert.alert('Fehler', 'Kunde konnte nicht erstellt werden');
    }
  };

  // Helper zum Zurücksetzen des Formulars
  const resetNewCustomerForm = () => {
    setNewCustomerAnrede('');
    setNewCustomerName('');
    setNewCustomerEmail('');
    setNewCustomerPhone('');
    setNewCustomerMobile('');
    setNewCustomerStreet('');
    setNewCustomerPlz('');
    setNewCustomerCity('');
    setImportedContactId(null);
  };

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('Fehler', 'Bitte geben Sie einen Projektnamen ein');
      return;
    }

    if (!customerId) {
      Alert.alert('Fehler', 'Bitte wählen Sie einen Kunden aus');
      return;
    }

    // Prüfen ob eine neue Objektadresse eingegeben wurde (nicht aus gespeicherten Adressen)
    const hasNewAddress = (objektStreet || objektPlz || objektCity) && !selectedProjectAddress;
    
    if (hasNewAddress && selectedCustomer) {
      // Frage ob die Adresse beim Kunden gespeichert werden soll
      Alert.alert(
        'Adresse speichern?',
        'Möchten Sie diese Objektadresse auch beim Kunden für zukünftige Projekte speichern?',
        [
          {
            text: 'Nein',
            style: 'cancel',
            onPress: () => saveProject(null),
          },
          {
            text: 'Ja',
            onPress: () => {
              // Modal für Adressbezeichnung öffnen
              setNewAddressName('');
              setShowSaveAddressModal(true);
            },
          },
        ]
      );
    } else {
      saveProject(null);
    }
  };

  const handleSaveAddressAndProject = () => {
    const addressName = newAddressName.trim() || 'Projektadresse';
    setShowSaveAddressModal(false);
    saveProject(addressName);
  };

  const saveProject = async (saveAddressWithName: string | null) => {
    setLoading(true);
    try {
      // Wenn eine neue Adresse gespeichert werden soll
      let savedAddressName = selectedProjectAddress?.name;
      
      if (saveAddressWithName && selectedCustomer) {
        const newAddress: ProjectAddress = {
          id: Date.now().toString(36) + Math.random().toString(36).substr(2),
          name: saveAddressWithName,
          street: objektStreet,
          zip: objektPlz,
          city: objektCity,
          contactPerson: objektContactPerson || undefined,
          phone: objektPhone || undefined,
          email: objektEmail || undefined,
        };
        
        const existingAddresses = selectedCustomer.projectAddresses || [];
        await CustomerService.update(selectedCustomer.id, {
          ...selectedCustomer,
          projectAddresses: [...existingAddresses, newAddress],
        });
        
        savedAddressName = saveAddressWithName;
      }
      
      const newProject = await ProjectService.create({
        name,
        description: description || undefined,
        customer_id: customerId,
        status: 'aktiv',
        bauherr_name: selectedCustomer?.name || undefined,
        bauherr_phone: selectedCustomer?.phone || undefined,
        bauherr_email: selectedCustomer?.email || undefined,
        bauherr_address: selectedCustomer?.address || undefined,
        // Objektadresse
        objekt_street: objektStreet || undefined,
        objekt_plz: objektPlz || undefined,
        objekt_city: objektCity || undefined,
        objekt_address_name: savedAddressName || undefined,
        objekt_contact_person: objektContactPerson || undefined,
        objekt_phone: objektPhone || undefined,
        objekt_email: objektEmail || undefined,
      });
      
      const successMessage = saveAddressWithName 
        ? 'Projekt wurde erstellt und Adresse beim Kunden gespeichert'
        : 'Projekt wurde erstellt';
        
      Alert.alert('Erfolg', successMessage, [
        { text: 'OK', onPress: () => router.replace(`/projects/${newProject.id}`) },
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

          {/* Objektadresse - nur anzeigen wenn Kunde ausgewählt und Adressen vorhanden */}
          {selectedCustomer && selectedCustomer.projectAddresses && selectedCustomer.projectAddresses.length > 0 && (
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Objektadresse</Text>
              <TouchableOpacity
                style={styles.addressSelector}
                onPress={() => setShowAddressPicker(true)}
              >
                <View style={styles.addressSelectorContent}>
                  <Ionicons name="home" size={20} color="#ff9800" />
                  <View style={styles.addressInfo}>
                    {selectedProjectAddress ? (
                      <>
                        <Text style={styles.addressName}>{selectedProjectAddress.name}</Text>
                        <Text style={styles.addressDetails} numberOfLines={1}>
                          {selectedProjectAddress.street}
                          {selectedProjectAddress.street && (selectedProjectAddress.zip || selectedProjectAddress.city) ? ', ' : ''}
                          {selectedProjectAddress.zip} {selectedProjectAddress.city}
                        </Text>
                      </>
                    ) : (
                      <Text style={styles.addressPlaceholder}>
                        Gespeicherte Adresse auswählen...
                      </Text>
                    )}
                  </View>
                </View>
                <View style={styles.addressSelectorRight}>
                  {selectedProjectAddress && (
                    <TouchableOpacity 
                      onPress={(e) => { e.stopPropagation(); clearProjectAddress(); }}
                      style={styles.clearAddressButton}
                    >
                      <Ionicons name="close-circle" size={22} color="#999" />
                    </TouchableOpacity>
                  )}
                  <Ionicons name="chevron-down" size={20} color="#666" />
                </View>
              </TouchableOpacity>
            </View>
          )}

          {/* Manuelle Objektadress-Felder */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>
              {selectedCustomer?.projectAddresses?.length ? 'Objektadresse (manuell)' : 'Objektadresse'}
            </Text>
            <TextInput
              style={styles.input}
              placeholder="Straße und Hausnummer"
              value={objektStreet}
              onChangeText={(text) => {
                setObjektStreet(text);
                if (selectedProjectAddress) setSelectedProjectAddress(null);
              }}
            />
            <View style={styles.addressRow}>
              <TextInput
                style={[styles.input, styles.plzInput]}
                placeholder="PLZ"
                value={objektPlz}
                onChangeText={(text) => {
                  setObjektPlz(text);
                  if (selectedProjectAddress) setSelectedProjectAddress(null);
                }}
                keyboardType="number-pad"
              />
              <TextInput
                style={[styles.input, styles.cityInput]}
                placeholder="Ort"
                value={objektCity}
                onChangeText={(text) => {
                  setObjektCity(text);
                  if (selectedProjectAddress) setSelectedProjectAddress(null);
                }}
              />
            </View>
            
            {/* Ansprechpartner */}
            <TextInput
              style={styles.input}
              placeholder="Ansprechpartner"
              value={objektContactPerson}
              onChangeText={(text) => {
                setObjektContactPerson(text);
                if (selectedProjectAddress) setSelectedProjectAddress(null);
              }}
            />
            
            {/* Telefon und E-Mail */}
            <View style={styles.addressRow}>
              <TextInput
                style={[styles.input, { flex: 1, marginRight: 8 }]}
                placeholder="Telefon"
                value={objektPhone}
                onChangeText={(text) => {
                  setObjektPhone(text);
                  if (selectedProjectAddress) setSelectedProjectAddress(null);
                }}
                keyboardType="phone-pad"
              />
              <TextInput
                style={[styles.input, { flex: 1.5 }]}
                placeholder="E-Mail"
                value={objektEmail}
                onChangeText={(text) => {
                  setObjektEmail(text);
                  if (selectedProjectAddress) setSelectedProjectAddress(null);
                }}
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </View>
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

            {/* New Customer Button */}
            <TouchableOpacity
              style={styles.newCustomerTopButton}
              onPress={() => {
                setShowCustomerPicker(false);  // Close this modal first
                InteractionManager.runAfterInteractions(() => {
                  setShowNewCustomerModal(true);  // Then open new customer modal
                });
              }}
            >
              <Ionicons name="add-circle" size={24} color="#fff" />
              <Text style={styles.newCustomerTopButtonText}>Neuen Kunden anlegen</Text>
            </TouchableOpacity>

            <View style={styles.searchContainer}>
              <Ionicons name="search" size={20} color="#666" style={styles.searchIcon} />
              <TextInput
                style={styles.searchInput}
                placeholder="Kunde suchen..."
                value={searchQuery}
                onChangeText={setSearchQuery}
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
                  <Text style={styles.emptyListSubtext}>Erstellen Sie einen neuen Kunden</Text>
                </View>
              }
              style={styles.customerList}
            />
          </View>
        </View>
      </Modal>

      {/* New Customer Modal */}
      <Modal
        visible={showNewCustomerModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowNewCustomerModal(false)}
      >
        <TouchableWithoutFeedback onPress={() => {}}>
          <KeyboardAvoidingView 
            style={styles.modalOverlay}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            keyboardVerticalOffset={0}
          >
            <View style={styles.newCustomerModalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Neuer Kunde</Text>
                <TouchableOpacity
                  onPress={() => {
                    setShowNewCustomerModal(false);
                    resetNewCustomerForm();
                  }}
                >
                  <Ionicons name="close" size={24} color="#666" />
                </TouchableOpacity>
              </View>

              <ScrollView 
                style={styles.newCustomerForm} 
                keyboardShouldPersistTaps="always"
                keyboardDismissMode="none"
              >
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

              {/* Anrede und Name in einer Zeile */}
              <View style={styles.formRowGroup}>
                <View style={styles.formInputGroupSmall}>
                  <Text style={styles.formLabel}>Anrede</Text>
                  <View style={styles.anredeContainer}>
                    <ScrollView 
                      horizontal 
                      showsHorizontalScrollIndicator={false}
                      style={styles.anredeScrollView}
                    >
                      {['', 'Herr', 'Frau', 'Bauherr', 'Bauherren', 'Firma', 'Familie'].map((option) => (
                        <TouchableOpacity
                          key={option || 'none'}
                          style={[
                            styles.anredeChip,
                            newCustomerAnrede === option && styles.anredeChipSelected
                          ]}
                          onPress={() => setNewCustomerAnrede(option)}
                        >
                          <Text style={[
                            styles.anredeChipText,
                            newCustomerAnrede === option && styles.anredeChipTextSelected
                          ]}>
                            {option || '-'}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                </View>
              </View>
              
              <View style={styles.formInputGroup}>
                <Text style={styles.formLabel}>Name *</Text>
                <TextInput
                  style={styles.formInput}
                  placeholder="Kundenname"
                  value={newCustomerName}
                  onChangeText={setNewCustomerName}
                />
              </View>

              <View style={styles.formInputGroup}>
                <Text style={styles.formLabel}>E-Mail</Text>
                <TextInput
                  style={styles.formInput}
                  placeholder="E-Mail-Adresse"
                  value={newCustomerEmail}
                  onChangeText={setNewCustomerEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
              </View>

              <View style={styles.formInputGroup}>
                <Text style={styles.formLabel}>Telefon</Text>
                <TextInput
                  style={styles.formInput}
                  placeholder="Telefonnummer"
                  value={newCustomerPhone}
                  onChangeText={setNewCustomerPhone}
                  keyboardType="default"
                  autoCorrect={false}
                />
              </View>

              <View style={styles.formInputGroup}>
                <Text style={styles.formLabel}>Handynummer</Text>
                <TextInput
                  style={styles.formInput}
                  placeholder="Handynummer"
                  value={newCustomerMobile}
                  onChangeText={setNewCustomerMobile}
                  keyboardType="default"
                  autoCorrect={false}
                />
              </View>

              <View style={styles.formInputGroup}>
                <Text style={styles.formLabel}>Straße</Text>
                <TextInput
                  style={styles.formInput}
                  placeholder="Straße und Hausnummer"
                  value={newCustomerStreet}
                  onChangeText={setNewCustomerStreet}
                />
              </View>

              <View style={styles.formRowGroup}>
                <View style={styles.formInputGroupHalf}>
                  <Text style={styles.formLabel}>PLZ</Text>
                  <TextInput
                    style={styles.formInput}
                    placeholder="PLZ"
                    value={newCustomerPlz}
                    onChangeText={setNewCustomerPlz}
                    keyboardType="number-pad"
                  />
                </View>
                <View style={styles.formInputGroupHalf}>
                  <Text style={styles.formLabel}>Ort</Text>
                  <TextInput
                    style={styles.formInput}
                    placeholder="Ort"
                    value={newCustomerCity}
                    onChangeText={setNewCustomerCity}
                  />
                </View>
              </View>
            </ScrollView>

            <View style={styles.newCustomerButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => {
                  setShowNewCustomerModal(false);
                  resetNewCustomerForm();
                }}
              >
                <Text style={styles.cancelButtonText}>Abbrechen</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.saveButton, creatingCustomer && styles.buttonDisabled]}
                onPress={handleCreateCustomer}
                disabled={creatingCustomer}
              >
                <Text style={styles.saveButtonText}>
                  {creatingCustomer ? 'Wird erstellt...' : 'Kunde erstellen'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Contact Picker Modal */}
      <Modal
        visible={showContactPicker}
        animationType="slide"
        transparent={true}
        onRequestClose={() => {
          setShowContactPicker(false);
          setContactSearchQuery('');
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Kontakt auswählen</Text>
              <TouchableOpacity
                onPress={() => {
                  setShowContactPicker(false);
                  setContactSearchQuery('');
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
                value={contactSearchQuery}
                onChangeText={setContactSearchQuery}
                autoFocus
              />
              {contactSearchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setContactSearchQuery('')}>
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
                  const { extractedName, extractedPhone, extractedStreet, extractedPlz, extractedCity } = extractContactData(item);
                  const displayAddress = [extractedStreet, [extractedPlz, extractedCity].filter(Boolean).join(' ')].filter(Boolean).join(', ');
                  return (
                    <TouchableOpacity
                      style={styles.contactItem}
                      onPress={() => handleSelectContact(item)}
                    >
                      <Ionicons name="person-circle" size={40} color="#1976d2" />
                      <View style={styles.contactItemInfo}>
                        <Text style={styles.contactItemName}>{extractedName}</Text>
                        {extractedPhone && (
                          <Text style={styles.contactItemDetail}>{extractedPhone}</Text>
                        )}
                        {displayAddress && (
                          <Text style={styles.contactItemDetail} numberOfLines={1}>{displayAddress}</Text>
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

      {/* Project Address Picker Modal */}
      <Modal
        visible={showAddressPicker}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowAddressPicker(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.addressPickerContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Objektadresse wählen</Text>
              <TouchableOpacity onPress={() => setShowAddressPicker(false)}>
                <Ionicons name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>
            
            <ScrollView style={styles.addressPickerList}>
              {selectedCustomer?.projectAddresses?.map((address) => (
                <TouchableOpacity
                  key={address.id}
                  style={[
                    styles.addressPickerItem,
                    selectedProjectAddress?.id === address.id && styles.addressPickerItemSelected
                  ]}
                  onPress={() => handleSelectProjectAddress(address)}
                >
                  <View style={styles.addressPickerItemIcon}>
                    <Ionicons 
                      name="home" 
                      size={24} 
                      color={selectedProjectAddress?.id === address.id ? '#ff9800' : '#ccc'} 
                    />
                  </View>
                  <View style={styles.addressPickerItemInfo}>
                    <Text style={[
                      styles.addressPickerItemName,
                      selectedProjectAddress?.id === address.id && styles.addressPickerItemNameSelected
                    ]}>
                      {address.name}
                    </Text>
                    <Text style={styles.addressPickerItemDetails}>
                      {address.street}
                      {address.street && (address.zip || address.city) ? ', ' : ''}
                      {address.zip} {address.city}
                    </Text>
                  </View>
                  {selectedProjectAddress?.id === address.id && (
                    <Ionicons name="checkmark-circle" size={24} color="#ff9800" />
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Save Address Modal - für Adressbezeichnung */}
      <Modal
        visible={showSaveAddressModal}
        animationType="fade"
        transparent={true}
        onRequestClose={() => {
          setShowSaveAddressModal(false);
          saveProject(null);
        }}
      >
        <View style={styles.saveAddressModalOverlay}>
          <View style={styles.saveAddressModalContent}>
            <View style={styles.saveAddressModalHeader}>
              <Ionicons name="home" size={32} color="#ff9800" />
              <Text style={styles.saveAddressModalTitle}>Adresse benennen</Text>
            </View>
            
            <Text style={styles.saveAddressModalText}>
              Geben Sie eine Bezeichnung für die Adresse ein (z.B. "Haupthaus", "Garage"):
            </Text>
            
            <TextInput
              style={styles.saveAddressModalInput}
              placeholder="z.B. Haupthaus"
              value={newAddressName}
              onChangeText={setNewAddressName}
              autoFocus
            />
            
            <View style={styles.saveAddressModalButtons}>
              <TouchableOpacity
                style={[styles.saveAddressModalButton, styles.saveAddressModalCancelButton]}
                onPress={() => {
                  setShowSaveAddressModal(false);
                  saveProject(null);
                }}
              >
                <Text style={styles.saveAddressModalCancelText}>Überspringen</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveAddressModalButton, styles.saveAddressModalSaveButton]}
                onPress={handleSaveAddressAndProject}
              >
                <Ionicons name="checkmark" size={20} color="#fff" />
                <Text style={styles.saveAddressModalSaveText}>Speichern</Text>
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
    maxHeight: '85%',
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
  newCustomerTopButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4caf50',
    margin: 16,
    marginBottom: 8,
    padding: 14,
    borderRadius: 10,
    gap: 8,
  },
  newCustomerTopButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
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
    maxHeight: 350,
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
    fontSize: 16,
    color: '#666',
    fontWeight: '500',
  },
  emptyListSubtext: {
    fontSize: 14,
    color: '#999',
    marginTop: 4,
  },
  // New Customer Modal
  newCustomerModalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '90%',
    paddingBottom: Platform.OS === 'ios' ? 34 : 16,
  },
  newCustomerForm: {
    padding: 16,
    maxHeight: 400,
  },
  importButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#e3f2fd',
    padding: 14,
    borderRadius: 10,
    marginBottom: 16,
    gap: 8,
  },
  importButtonText: {
    color: '#1976d2',
    fontSize: 16,
    fontWeight: '500',
  },
  formInputGroup: {
    marginBottom: 16,
  },
  formInputGroupSmall: {
    marginBottom: 8,
    flex: 1,
  },
  formRowGroup: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  formInputGroupHalf: {
    flex: 1,
  },
  formLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 6,
  },
  formInput: {
    backgroundColor: '#f9f9f9',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  formTextArea: {
    minHeight: 60,
    textAlignVertical: 'top',
  },
  newCustomerButtons: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  modalButton: {
    flex: 1,
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: '#f5f5f5',
  },
  cancelButtonText: {
    color: '#666',
    fontSize: 16,
    fontWeight: '500',
  },
  saveButton: {
    backgroundColor: '#1976d2',
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  // Contact Picker
  contactList: {
    maxHeight: 450,
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
  loadingContainer: {
    padding: 40,
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#666',
  },
  // Anrede Chips (horizontal scrollbar)
  anredeContainer: {
    flexDirection: 'row',
  },
  anredeScrollView: {
    flexGrow: 0,
  },
  anredeChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: '#f0f0f0',
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  anredeChipSelected: {
    backgroundColor: '#e3f2fd',
    borderColor: '#1976d2',
  },
  anredeChipText: {
    fontSize: 14,
    color: '#666',
  },
  anredeChipTextSelected: {
    color: '#1976d2',
    fontWeight: '600',
  },
  // Address Selector Styles
  addressSelector: {
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ff9800',
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  addressSelectorContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  addressInfo: {
    marginLeft: 12,
    flex: 1,
  },
  addressName: {
    fontSize: 16,
    color: '#333',
    fontWeight: '500',
  },
  addressDetails: {
    fontSize: 13,
    color: '#666',
    marginTop: 2,
  },
  addressPlaceholder: {
    fontSize: 15,
    color: '#999',
  },
  addressSelectorRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  clearAddressButton: {
    padding: 2,
  },
  addressRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  plzInput: {
    flex: 1,
  },
  cityInput: {
    flex: 2,
  },
  // Address Picker Modal
  addressPickerContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '60%',
    paddingBottom: Platform.OS === 'ios' ? 34 : 16,
  },
  addressPickerList: {
    padding: 16,
  },
  addressPickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    borderRadius: 10,
    marginBottom: 8,
    backgroundColor: '#f9f9f9',
  },
  addressPickerItemSelected: {
    backgroundColor: '#fff3e0',
    borderColor: '#ff9800',
    borderWidth: 1,
  },
  addressPickerItemIcon: {
    marginRight: 12,
  },
  addressPickerItemInfo: {
    flex: 1,
  },
  addressPickerItemName: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
  },
  addressPickerItemNameSelected: {
    color: '#e65100',
  },
  addressPickerItemDetails: {
    fontSize: 13,
    color: '#666',
    marginTop: 2,
  },
  // Save Address Modal
  saveAddressModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  saveAddressModalContent: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 400,
  },
  saveAddressModalHeader: {
    alignItems: 'center',
    marginBottom: 16,
  },
  saveAddressModalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 8,
  },
  saveAddressModalText: {
    fontSize: 15,
    color: '#666',
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 22,
  },
  saveAddressModalInput: {
    backgroundColor: '#f9f9f9',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
    marginBottom: 20,
  },
  saveAddressModalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  saveAddressModalButton: {
    flex: 1,
    padding: 14,
    borderRadius: 10,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  saveAddressModalCancelButton: {
    backgroundColor: '#f0f0f0',
  },
  saveAddressModalCancelText: {
    color: '#666',
    fontSize: 15,
    fontWeight: '500',
  },
  saveAddressModalSaveButton: {
    backgroundColor: '#ff9800',
  },
  saveAddressModalSaveText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
});

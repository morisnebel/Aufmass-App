import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Image,
  Switch,
  useWindowDimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SettingsService } from '../../services/LocalStorage';
import * as ImagePicker from 'expo-image-picker';

interface CompanySettings {
  company_name: string;
  company_subtitle: string;
  owner_name: string;
  street: string;
  zip_code: string;
  city: string;
  phone: string;
  email: string;
  services: string;
  author_name: string;
  logo_data: string | null;
  bluetooth_mode: boolean;
  pdf_checklist_columns: number; // 1, 2, oder 3 Spalten
  pdf_header_color: string; // Hintergrundfarbe für PDF-Header
  pdf_header_style: 'filled' | 'outline'; // Voll oder nur Rahmen
  project_type_options: string[]; // Projektart-Überschriften
  // Neue Größen-Einstellungen für PDF-Layout
  pdf_header_size: 'small' | 'medium' | 'large'; // Größe des Headers
  pdf_project_type_size: 'small' | 'medium' | 'large'; // Größe der Projektart-Überschrift
  pdf_tools_size: 'small' | 'medium' | 'large'; // Größe der Tool-Bereiche
}

// Größen-Optionen für PDF-Layout
const PDF_SIZE_OPTIONS = [
  { id: 'small', label: 'Klein' },
  { id: 'medium', label: 'Mittel' },
  { id: 'large', label: 'Groß' },
];

// Verfügbare Farboptionen für PDF-Header
const PDF_COLOR_OPTIONS = [
  { id: 'blue', label: 'Blau (Standard)', color: '#1976d2', textColor: '#ffffff' },
  { id: 'light_blue', label: 'Hellblau', color: '#bbdefb', textColor: '#1565c0' },
  { id: 'gray', label: 'Grau', color: '#9e9e9e', textColor: '#ffffff' },
  { id: 'light_gray', label: 'Hellgrau', color: '#e0e0e0', textColor: '#424242' },
  { id: 'green', label: 'Grün', color: '#388e3c', textColor: '#ffffff' },
  { id: 'light_green', label: 'Hellgrün', color: '#c8e6c9', textColor: '#2e7d32' },
  { id: 'orange', label: 'Orange', color: '#f57c00', textColor: '#ffffff' },
  { id: 'red', label: 'Rot', color: '#d32f2f', textColor: '#ffffff' },
  { id: 'black', label: 'Schwarz', color: '#212121', textColor: '#ffffff' },
];

export default function SettingsScreen() {
  const router = useRouter();
  const { width: screenWidth } = useWindowDimensions();
  const isPhone = screenWidth < 500;
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<CompanySettings>({
    company_name: '',
    company_subtitle: '',
    owner_name: '',
    street: '',
    zip_code: '',
    city: '',
    phone: '',
    email: '',
    services: '',
    author_name: '',
    logo_data: null,
    bluetooth_mode: false,
    pdf_checklist_columns: 2, // Standard: 2 Spalten
    pdf_header_color: 'blue', // Standard: Blau
    pdf_header_style: 'filled', // Standard: Volle Farbe
    project_type_options: [], // Projektart-Überschriften
    pdf_header_size: 'medium', // Standard: Mittel
    pdf_project_type_size: 'medium', // Standard: Mittel
    pdf_tools_size: 'medium', // Standard: Mittel
  });
  
  // Für die Bereichsauswahl
  const [selectedLayoutSection, setSelectedLayoutSection] = useState<'header' | 'project_type' | 'tools'>('header');
  
  // Neuer Projektart-Eintrag
  const [newProjectType, setNewProjectType] = useState('');

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const data = await SettingsService.get();
      if (data && Object.keys(data).length > 0) {
        setSettings(prev => ({ ...prev, ...data }));
      }
    } catch (error) {
      console.error('Error loading settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const pickLogo = async () => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissionResult.granted) {
      Alert.alert('Berechtigung erforderlich', 'Bitte erlauben Sie den Zugriff auf Ihre Fotos.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [3, 2],
      quality: 0.8,
      base64: true,
    });

    if (!result.canceled && result.assets[0].base64) {
      const base64Data = `data:image/jpeg;base64,${result.assets[0].base64}`;
      setSettings({ ...settings, logo_data: base64Data });
    }
  };

  const removeLogo = () => {
    setSettings({ ...settings, logo_data: null });
  };

  const saveSettings = async () => {
    setSaving(true);
    try {
      await SettingsService.update(settings);
      if (Platform.OS === 'web') {
        alert('Einstellungen wurden gespeichert');
      } else {
        Alert.alert('Erfolg', 'Einstellungen wurden gespeichert');
      }
    } catch (error) {
      console.error('Error saving settings:', error);
      if (Platform.OS === 'web') {
        alert('Fehler beim Speichern');
      } else {
        Alert.alert('Fehler', 'Einstellungen konnten nicht gespeichert werden');
      }
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
      {/* Custom Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#1976d2" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Einstellungen</Text>
        <TouchableOpacity style={styles.saveButton} onPress={saveSettings} disabled={saving}>
          {saving ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.saveButtonText}>Speichern</Text>
          )}
        </TouchableOpacity>
      </View>
      
      <ScrollView style={styles.scrollView}>
        <View style={styles.content}>
          {/* Logo Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Logo</Text>
            <View style={styles.logoContainer}>
              {settings.logo_data ? (
                <View style={styles.logoPreview}>
                  <Image
                    source={{ uri: settings.logo_data }}
                    style={styles.logoImage}
                    resizeMode="contain"
                  />
                  <TouchableOpacity style={styles.removeLogoButton} onPress={removeLogo}>
                    <Ionicons name="close-circle" size={24} color="#f44336" />
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity style={styles.uploadLogoButton} onPress={pickLogo}>
                  <Ionicons name="cloud-upload-outline" size={40} color="#1976d2" />
                  <Text style={styles.uploadLogoText}>Logo hochladen</Text>
                </TouchableOpacity>
              )}
              {settings.logo_data && (
                <TouchableOpacity style={styles.changeLogoButton} onPress={pickLogo}>
                  <Text style={styles.changeLogoText}>Logo ändern</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* Bluetooth-Modus Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Eingabe-Modus</Text>
            <View style={styles.bluetoothModeContainer}>
              <View style={styles.bluetoothModeInfo}>
                <View style={styles.bluetoothModeIcon}>
                  <Ionicons name="bluetooth" size={24} color={settings.bluetooth_mode ? '#2196f3' : '#999'} />
                </View>
                <View style={styles.bluetoothModeText}>
                  <Text style={styles.bluetoothModeTitle}>Bluetooth-Laser Modus</Text>
                  <Text style={styles.bluetoothModeDescription}>
                    {settings.bluetooth_mode 
                      ? 'Aktiviert: Numpad wird bei Maßeingaben angezeigt' 
                      : 'Deaktiviert: Normale iPad-Tastatur wird verwendet'}
                  </Text>
                </View>
              </View>
              <Switch
                value={settings.bluetooth_mode}
                onValueChange={(value) => setSettings({ ...settings, bluetooth_mode: value })}
                trackColor={{ false: '#ddd', true: '#90caf9' }}
                thumbColor={settings.bluetooth_mode ? '#2196f3' : '#f4f3f4'}
              />
            </View>
            <Text style={styles.bluetoothModeHint}>
              Aktivieren Sie diesen Modus, wenn Sie ein Bluetooth-Lasermessgerät verwenden. 
              Das Numpad erscheint dann bei Maßeingaben und kann frei verschoben werden.
            </Text>
          </View>

          {/* Briefkopf Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Briefkopf / Firmendaten</Text>
            
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Firmenname</Text>
              <TextInput
                style={styles.input}
                value={settings.company_name}
                onChangeText={(text) => setSettings({ ...settings, company_name: text })}
                placeholder="z.B. Nebel-Bedachung"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Untertitel</Text>
              <TextInput
                style={styles.input}
                value={settings.company_subtitle}
                onChangeText={(text) => setSettings({ ...settings, company_subtitle: text })}
                placeholder="z.B. Dachdeckermeister"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Inhaber / Name</Text>
              <TextInput
                style={styles.input}
                value={settings.owner_name}
                onChangeText={(text) => setSettings({ ...settings, owner_name: text })}
                placeholder="z.B. Max Mustermann"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Straße</Text>
              <TextInput
                style={styles.input}
                value={settings.street}
                onChangeText={(text) => setSettings({ ...settings, street: text })}
                placeholder="z.B. Musterstraße 1"
              />
            </View>

            <View style={styles.row}>
              <View style={[styles.inputGroup, { flex: 1, marginRight: 8 }]}>
                <Text style={styles.label}>PLZ</Text>
                <TextInput
                  style={styles.input}
                  value={settings.zip_code}
                  onChangeText={(text) => setSettings({ ...settings, zip_code: text })}
                  placeholder="12345"
                  keyboardType="number-pad"
                />
              </View>
              <View style={[styles.inputGroup, { flex: 2 }]}>
                <Text style={styles.label}>Ort</Text>
                <TextInput
                  style={styles.input}
                  value={settings.city}
                  onChangeText={(text) => setSettings({ ...settings, city: text })}
                  placeholder="Musterstadt"
                />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Telefon</Text>
              <TextInput
                style={styles.input}
                value={settings.phone}
                onChangeText={(text) => setSettings({ ...settings, phone: text })}
                placeholder="0123 456789"
                keyboardType="phone-pad"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>E-Mail</Text>
              <TextInput
                style={styles.input}
                value={settings.email}
                onChangeText={(text) => setSettings({ ...settings, email: text })}
                placeholder="info@firma.de"
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Leistungen (eine pro Zeile)</Text>
              <TextInput
                style={[styles.input, styles.multilineInput]}
                value={settings.services}
                onChangeText={(text) => setSettings({ ...settings, services: text })}
                placeholder="Dächer aller Art&#10;Fassadenarbeiten"
                multiline
                numberOfLines={4}
              />
            </View>
          </View>

          {/* Verfasser Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Verfasser (für PDF)</Text>
            
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Name des Verfassers</Text>
              <TextInput
                style={styles.input}
                value={settings.author_name}
                onChangeText={(text) => setSettings({ ...settings, author_name: text })}
                placeholder="z.B. Max Mustermann"
              />
            </View>
          </View>

          {/* PDF Einstellungen Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>PDF-Layout</Text>
            
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Checklisten-Spalten im PDF</Text>
              <Text style={styles.sublabel}>Wie viele Spalten sollen für Checklisten-Kategorien verwendet werden?</Text>
              <View style={styles.columnSelector}>
                {[1, 2, 3].map((num) => (
                  <TouchableOpacity
                    key={num}
                    style={[
                      styles.columnOption,
                      settings.pdf_checklist_columns === num && styles.columnOptionActive
                    ]}
                    onPress={() => setSettings({ ...settings, pdf_checklist_columns: num })}
                  >
                    <Text style={[
                      styles.columnOptionText,
                      settings.pdf_checklist_columns === num && styles.columnOptionTextActive
                    ]}>
                      {num}
                    </Text>
                    <Text style={[
                      styles.columnOptionLabel,
                      settings.pdf_checklist_columns === num && styles.columnOptionLabelActive
                    ]}>
                      {num === 1 ? 'Spalte' : 'Spalten'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>PDF Kopfzeilen-Farbe</Text>
              <Text style={styles.sublabel}>Wählen Sie eine Farbe für den PDF-Header</Text>
              <View style={[styles.colorSelector, isPhone && styles.colorSelectorPhone]}>
                {PDF_COLOR_OPTIONS.map((option) => (
                  <TouchableOpacity
                    key={option.id}
                    style={[
                      styles.colorOption,
                      isPhone && styles.colorOptionPhone,
                      settings.pdf_header_color === option.id && styles.colorOptionActive
                    ]}
                    onPress={() => setSettings({ ...settings, pdf_header_color: option.id })}
                  >
                    <View style={[styles.colorPreview, isPhone && styles.colorPreviewPhone, { backgroundColor: option.color }]}>
                      {settings.pdf_header_color === option.id && (
                        <Ionicons name="checkmark" size={isPhone ? 12 : 16} color={option.textColor} />
                      )}
                    </View>
                    <Text style={[
                      styles.colorLabel,
                      isPhone && styles.colorLabelPhone,
                      settings.pdf_header_color === option.id && styles.colorLabelActive
                    ]}>
                      {isPhone ? option.label.split(' ')[0] : option.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>PDF Kopfzeilen-Stil</Text>
              <Text style={styles.sublabel}>Rahmen spart Druckertinte</Text>
              <View style={styles.styleSelector}>
                <TouchableOpacity
                  style={[
                    styles.styleOption,
                    settings.pdf_header_style === 'filled' && styles.styleOptionActive
                  ]}
                  onPress={() => setSettings({ ...settings, pdf_header_style: 'filled' })}
                >
                  <View style={[styles.stylePreviewFilled, { backgroundColor: PDF_COLOR_OPTIONS.find(o => o.id === settings.pdf_header_color)?.color || '#1976d2' }]} />
                  <Text style={[styles.styleLabel, settings.pdf_header_style === 'filled' && styles.styleLabelActive]}>
                    Volle Farbe
                  </Text>
                </TouchableOpacity>
                
                <TouchableOpacity
                  style={[
                    styles.styleOption,
                    settings.pdf_header_style === 'outline' && styles.styleOptionActive
                  ]}
                  onPress={() => setSettings({ ...settings, pdf_header_style: 'outline' })}
                >
                  <View style={[styles.stylePreviewOutline, { borderColor: PDF_COLOR_OPTIONS.find(o => o.id === settings.pdf_header_color)?.color || '#1976d2' }]} />
                  <Text style={[styles.styleLabel, settings.pdf_header_style === 'outline' && styles.styleLabelActive]}>
                    Nur Rahmen
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>

          {/* PDF Layout Größen Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>PDF Layout-Größen</Text>
            <Text style={styles.sublabel}>
              Passen Sie die Größe der verschiedenen Bereiche im PDF an (klein, mittel, groß).
            </Text>
            
            {/* Bereichsauswahl-Tabs */}
            <View style={styles.layoutTabsContainer}>
              <TouchableOpacity
                style={[styles.layoutTab, selectedLayoutSection === 'header' && styles.layoutTabActive]}
                onPress={() => setSelectedLayoutSection('header')}
              >
                <Ionicons name="document-text" size={18} color={selectedLayoutSection === 'header' ? '#fff' : '#666'} />
                <Text style={[styles.layoutTabText, selectedLayoutSection === 'header' && styles.layoutTabTextActive]}>Header</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.layoutTab, selectedLayoutSection === 'project_type' && styles.layoutTabActive]}
                onPress={() => setSelectedLayoutSection('project_type')}
              >
                <Ionicons name="ribbon" size={18} color={selectedLayoutSection === 'project_type' ? '#fff' : '#666'} />
                <Text style={[styles.layoutTabText, selectedLayoutSection === 'project_type' && styles.layoutTabTextActive]}>Überschrift</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.layoutTab, selectedLayoutSection === 'tools' && styles.layoutTabActive]}
                onPress={() => setSelectedLayoutSection('tools')}
              >
                <Ionicons name="construct" size={18} color={selectedLayoutSection === 'tools' ? '#fff' : '#666'} />
                <Text style={[styles.layoutTabText, selectedLayoutSection === 'tools' && styles.layoutTabTextActive]}>Tools</Text>
              </TouchableOpacity>
            </View>
            
            {/* Größen-Auswahl basierend auf ausgewähltem Bereich */}
            <View style={styles.layoutSizeContainer}>
              {selectedLayoutSection === 'header' && (
                <>
                  <Text style={styles.layoutSectionInfo}>
                    <Ionicons name="information-circle" size={14} color="#666" /> Firmendaten und Logo im PDF-Kopf
                  </Text>
                  <View style={styles.sizeButtonsRow}>
                    {PDF_SIZE_OPTIONS.map((size) => (
                      <TouchableOpacity
                        key={size.id}
                        style={[
                          styles.sizeButton,
                          settings.pdf_header_size === size.id && styles.sizeButtonActive
                        ]}
                        onPress={() => setSettings({ ...settings, pdf_header_size: size.id as 'small' | 'medium' | 'large' })}
                      >
                        <View style={[styles.sizePreview, styles[`sizePreview${size.id.charAt(0).toUpperCase() + size.id.slice(1)}` as keyof typeof styles]]} />
                        <Text style={[styles.sizeButtonText, settings.pdf_header_size === size.id && styles.sizeButtonTextActive]}>
                          {size.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </>
              )}
              
              {selectedLayoutSection === 'project_type' && (
                <>
                  <Text style={styles.layoutSectionInfo}>
                    <Ionicons name="information-circle" size={14} color="#666" /> Projektart-Überschrift (z.B. "Sturmschaden")
                  </Text>
                  <View style={styles.sizeButtonsRow}>
                    {PDF_SIZE_OPTIONS.map((size) => (
                      <TouchableOpacity
                        key={size.id}
                        style={[
                          styles.sizeButton,
                          settings.pdf_project_type_size === size.id && styles.sizeButtonActive
                        ]}
                        onPress={() => setSettings({ ...settings, pdf_project_type_size: size.id as 'small' | 'medium' | 'large' })}
                      >
                        <View style={[styles.sizePreview, styles[`sizePreview${size.id.charAt(0).toUpperCase() + size.id.slice(1)}` as keyof typeof styles]]} />
                        <Text style={[styles.sizeButtonText, settings.pdf_project_type_size === size.id && styles.sizeButtonTextActive]}>
                          {size.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </>
              )}
              
              {selectedLayoutSection === 'tools' && (
                <>
                  <Text style={styles.layoutSectionInfo}>
                    <Ionicons name="information-circle" size={14} color="#666" /> Info, Fotos, Skizzen, Flächen, Dach, Liste, Notiz, Doku
                  </Text>
                  <View style={styles.sizeButtonsRow}>
                    {PDF_SIZE_OPTIONS.map((size) => (
                      <TouchableOpacity
                        key={size.id}
                        style={[
                          styles.sizeButton,
                          settings.pdf_tools_size === size.id && styles.sizeButtonActive
                        ]}
                        onPress={() => setSettings({ ...settings, pdf_tools_size: size.id as 'small' | 'medium' | 'large' })}
                      >
                        <View style={[styles.sizePreview, styles[`sizePreview${size.id.charAt(0).toUpperCase() + size.id.slice(1)}` as keyof typeof styles]]} />
                        <Text style={[styles.sizeButtonText, settings.pdf_tools_size === size.id && styles.sizeButtonTextActive]}>
                          {size.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </>
              )}
            </View>
          </View>

          {/* Projektart-Überschriften Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Projektart-Überschriften</Text>
            <Text style={styles.sublabel}>
              Definieren Sie hier die Überschriften, die bei Projekten ausgewählt werden können (z.B. "Sturmschaden", "Wartung", "Neueindeckung").
            </Text>
            
            {/* Liste der vorhandenen Überschriften */}
            <View style={styles.projectTypeList}>
              {(settings.project_type_options || []).map((option, index) => (
                <View key={index} style={styles.projectTypeItem}>
                  <Ionicons name="document-text-outline" size={20} color="#1976d2" />
                  <Text style={styles.projectTypeText}>{option}</Text>
                  <TouchableOpacity
                    style={styles.projectTypeDeleteButton}
                    onPress={() => {
                      const newOptions = [...(settings.project_type_options || [])];
                      newOptions.splice(index, 1);
                      setSettings({ ...settings, project_type_options: newOptions });
                    }}
                  >
                    <Ionicons name="close-circle" size={22} color="#f44336" />
                  </TouchableOpacity>
                </View>
              ))}
              {(settings.project_type_options || []).length === 0 && (
                <Text style={styles.emptyListText}>Keine Überschriften definiert</Text>
              )}
            </View>
            
            {/* Neue Überschrift hinzufügen */}
            <View style={styles.addProjectTypeContainer}>
              <TextInput
                style={styles.addProjectTypeInput}
                value={newProjectType}
                onChangeText={setNewProjectType}
                placeholder="Neue Überschrift eingeben..."
                placeholderTextColor="#999"
              />
              <TouchableOpacity
                style={[
                  styles.addProjectTypeButton,
                  !newProjectType.trim() && styles.addProjectTypeButtonDisabled
                ]}
                onPress={() => {
                  if (newProjectType.trim()) {
                    const newOptions = [...(settings.project_type_options || []), newProjectType.trim()];
                    setSettings({ ...settings, project_type_options: newOptions });
                    setNewProjectType('');
                  }
                }}
                disabled={!newProjectType.trim()}
              >
                <Ionicons name="add" size={24} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>

          {/* Zurücksetzen Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Daten zurücksetzen</Text>
            <Text style={styles.resetInfo}>
              Alle Einstellungen leeren und auf Standardwerte zurücksetzen.
            </Text>
            <TouchableOpacity
              style={styles.resetButton}
              onPress={() => {
                Alert.alert(
                  'Einstellungen zurücksetzen',
                  'Möchten Sie wirklich alle Einstellungen leeren?',
                  [
                    { text: 'Abbrechen', style: 'cancel' },
                    {
                      text: 'Zurücksetzen',
                      style: 'destructive',
                      onPress: () => {
                        setSettings({
                          company_name: '',
                          company_subtitle: '',
                          owner_name: '',
                          street: '',
                          zip_code: '',
                          city: '',
                          phone: '',
                          email: '',
                          services: '',
                          author_name: '',
                          logo_data: null,
                          bluetooth_mode: false,
                          pdf_checklist_columns: 2,
                          pdf_header_color: 'blue',
                          pdf_header_style: 'filled',
                          project_type_options: [],
                          pdf_header_size: 'medium',
                          pdf_project_type_size: 'medium',
                          pdf_tools_size: 'medium',
                        });
                        Alert.alert('Erfolg', 'Einstellungen wurden zurückgesetzt. Vergessen Sie nicht zu speichern!');
                      },
                    },
                  ]
                );
              }}
            >
              <Ionicons name="trash-outline" size={20} color="#f44336" />
              <Text style={styles.resetButtonText}>Alle Felder leeren</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.saveButton, saving && styles.buttonDisabled]}
          onPress={saveSettings}
          disabled={saving}
        >
          <Ionicons name="save-outline" size={24} color="#fff" />
          <Text style={styles.saveButtonText}>
            {saving ? 'Wird gespeichert...' : 'Einstellungen speichern'}
          </Text>
        </TouchableOpacity>
      </View>
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
  content: {
    padding: 16,
  },
  section: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 16,
  },
  logoContainer: {
    alignItems: 'center',
  },
  logoPreview: {
    position: 'relative',
    width: 200,
    height: 120,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    overflow: 'hidden',
  },
  logoImage: {
    width: '100%',
    height: '100%',
  },
  removeLogoButton: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: '#fff',
    borderRadius: 12,
  },
  uploadLogoButton: {
    width: 200,
    height: 120,
    backgroundColor: '#e3f2fd',
    borderRadius: 8,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: '#1976d2',
    justifyContent: 'center',
    alignItems: 'center',
  },
  uploadLogoText: {
    color: '#1976d2',
    marginTop: 8,
    fontSize: 14,
  },
  changeLogoButton: {
    marginTop: 12,
    padding: 8,
  },
  changeLogoText: {
    color: '#1976d2',
    fontSize: 14,
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 6,
  },
  input: {
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  multilineInput: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  row: {
    flexDirection: 'row',
  },
  footer: {
    backgroundColor: '#fff',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  saveButton: {
    flexDirection: 'row',
    backgroundColor: '#1976d2',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  buttonDisabled: {
    backgroundColor: '#ccc',
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  resetInfo: {
    fontSize: 13,
    color: '#666',
    marginBottom: 12,
  },
  resetButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#f44336',
    borderRadius: 8,
    backgroundColor: '#fff',
  },
  resetButtonText: {
    color: '#f44336',
    fontSize: 14,
    fontWeight: '600',
  },
  bluetoothModeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#f8f9fa',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
  },
  bluetoothModeInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 16,
  },
  bluetoothModeIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  bluetoothModeText: {
    flex: 1,
  },
  bluetoothModeTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  bluetoothModeDescription: {
    fontSize: 13,
    color: '#666',
  },
  bluetoothModeHint: {
    fontSize: 12,
    color: '#888',
    fontStyle: 'italic',
    lineHeight: 18,
  },
  sublabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 12,
  },
  columnSelector: {
    flexDirection: 'row',
    gap: 12,
  },
  columnOption: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#e0e0e0',
  },
  columnOptionActive: {
    backgroundColor: '#e3f2fd',
    borderColor: '#1976d2',
  },
  columnOptionText: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#666',
  },
  columnOptionTextActive: {
    color: '#1976d2',
  },
  columnOptionLabel: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  columnOptionLabelActive: {
    color: '#1976d2',
  },
  colorSelector: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  colorSelectorPhone: {
    gap: 6,
  },
  colorOption: {
    alignItems: 'center',
    padding: 8,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: 'transparent',
    width: '23%',
  },
  colorOptionPhone: {
    width: '31%',
    padding: 6,
  },
  colorOptionActive: {
    borderColor: '#1976d2',
    backgroundColor: '#e3f2fd',
  },
  colorPreview: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ddd',
    marginBottom: 4,
  },
  colorPreviewPhone: {
    width: 30,
    height: 30,
    borderRadius: 15,
  },
  colorLabel: {
    fontSize: 10,
    color: '#666',
    textAlign: 'center',
  },
  colorLabelPhone: {
    fontSize: 8,
  },
  colorLabelActive: {
    color: '#1976d2',
    fontWeight: '600',
  },
  styleSelector: {
    flexDirection: 'row',
    gap: 15,
    marginTop: 8,
  },
  styleOption: {
    flex: 1,
    alignItems: 'center',
    padding: 12,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#e0e0e0',
    backgroundColor: '#f9f9f9',
  },
  styleOptionActive: {
    borderColor: '#1976d2',
    backgroundColor: '#e3f2fd',
  },
  stylePreviewFilled: {
    width: 60,
    height: 30,
    borderRadius: 4,
    marginBottom: 8,
  },
  stylePreviewOutline: {
    width: 60,
    height: 30,
    borderRadius: 4,
    borderWidth: 3,
    backgroundColor: '#fff',
    marginBottom: 8,
  },
  styleLabel: {
    fontSize: 12,
    color: '#666',
  },
  styleLabelActive: {
    color: '#1976d2',
    fontWeight: '600',
  },
  // Projektart-Überschriften Styles
  projectTypeList: {
    marginTop: 12,
    marginBottom: 16,
  },
  projectTypeItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    gap: 10,
  },
  projectTypeText: {
    flex: 1,
    fontSize: 15,
    color: '#333',
  },
  projectTypeDeleteButton: {
    padding: 4,
  },
  emptyListText: {
    fontSize: 14,
    color: '#999',
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: 20,
  },
  addProjectTypeContainer: {
    flexDirection: 'row',
    gap: 10,
  },
  addProjectTypeInput: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  addProjectTypeButton: {
    backgroundColor: '#1976d2',
    borderRadius: 8,
    width: 48,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addProjectTypeButtonDisabled: {
    backgroundColor: '#ccc',
  },
  // Header Styles
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  saveButton: {
    backgroundColor: '#1976d2',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  saveButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  // Layout-Größen Styles
  layoutTabsContainer: {
    flexDirection: 'row',
    marginTop: 12,
    gap: 8,
  },
  layoutTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 8,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    gap: 6,
  },
  layoutTabActive: {
    backgroundColor: '#1976d2',
  },
  layoutTabText: {
    fontSize: 13,
    color: '#666',
    fontWeight: '500',
  },
  layoutTabTextActive: {
    color: '#fff',
  },
  layoutSizeContainer: {
    marginTop: 16,
    padding: 16,
    backgroundColor: '#f9f9f9',
    borderRadius: 8,
  },
  layoutSectionInfo: {
    fontSize: 13,
    color: '#666',
    marginBottom: 12,
  },
  sizeButtonsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  sizeButton: {
    flex: 1,
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#e0e0e0',
  },
  sizeButtonActive: {
    borderColor: '#1976d2',
    backgroundColor: '#e3f2fd',
  },
  sizePreview: {
    width: '100%',
    backgroundColor: '#1976d2',
    borderRadius: 4,
    marginBottom: 8,
  },
  sizePreviewSmall: {
    height: 20,
  },
  sizePreviewMedium: {
    height: 30,
  },
  sizePreviewLarge: {
    height: 40,
  },
  sizeButtonText: {
    fontSize: 13,
    color: '#666',
  },
  sizeButtonTextActive: {
    color: '#1976d2',
    fontWeight: '600',
  },
});

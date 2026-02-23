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
}

export default function SettingsScreen() {
  const router = useRouter();
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
  });

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
});

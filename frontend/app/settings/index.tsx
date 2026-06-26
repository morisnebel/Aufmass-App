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
import { isPro, getAppName, getProStatus, setProStatus, loadProStatus, updateFeatures } from '../../services/FeatureFlags';
import { useTranslation } from 'react-i18next';
import { saveLanguage, getCurrentLanguage } from '../../i18n';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getSketchLabels, saveSketchLabels, DEFAULT_SKETCH_LABELS, SketchLabelSettings } from '../../services/SketchLabels';

interface CompanySettings {
  company_name: string;
  company_subtitle: string;
  owner_name: string;
  street: string;
  zip_code: string;
  city: string;
  phone: string;
  mobile_phone: string;
  fax: string;
  email: string;
  services: string;
  author_name: string;
  logo_data: string | null;
  bluetooth_mode: boolean;
  pdf_checklist_columns: number; // 1, 2, oder 3 Spalten
  // Alte globale Einstellungen (für Abwärtskompatibilität)
  pdf_header_color: string;
  pdf_header_style: 'filled' | 'outline';
  project_type_options: string[];
  // Neue Layout-Einstellungen pro Bereich
  pdf_header_size: 'small' | 'medium' | 'large';
  pdf_header_section_color: string;
  pdf_header_section_style: 'filled' | 'outline';
  pdf_project_type_size: 'small' | 'medium' | 'large';
  pdf_project_type_color: string;
  pdf_project_type_style: 'filled' | 'outline';
  pdf_tools_size: 'small' | 'medium' | 'large';
  pdf_tools_color: string;
  pdf_tools_style: 'filled' | 'outline';
}

// Größen-Optionen für PDF-Layout
const PDF_SIZE_OPTIONS = [
  { id: 'small', labelKey: 'settings.sizeSmall' },
  { id: 'medium', labelKey: 'settings.sizeMedium' },
  { id: 'large', labelKey: 'settings.sizeLarge' },
];

// Style-Optionen für PDF-Layout
const PDF_STYLE_OPTIONS = [
  { id: 'filled', labelKey: 'settings.fullColor' },
  { id: 'outline', labelKey: 'settings.outlineOnly' },
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
  const { t, i18n } = useTranslation();
  const { width: screenWidth } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const isPhone = screenWidth < 500;
  const [currentLang, setCurrentLang] = useState(getCurrentLanguage());
  
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
    mobile_phone: '',
    fax: '',
    email: '',
    services: '',
    author_name: '',
    logo_data: null,
    bluetooth_mode: false,
    pdf_checklist_columns: 2,
    pdf_header_color: 'blue',
    pdf_header_style: 'filled',
    project_type_options: [],
    // Neue Layout-Einstellungen
    pdf_header_size: 'medium',
    pdf_header_section_color: 'blue',
    pdf_header_section_style: 'filled',
    pdf_project_type_size: 'medium',
    pdf_project_type_color: 'blue',
    pdf_project_type_style: 'filled',
    pdf_tools_size: 'medium',
    pdf_tools_color: 'blue',
    pdf_tools_style: 'filled',
  });
  
  // Für die Bereichsauswahl
  const [selectedLayoutSection, setSelectedLayoutSection] = useState<'header' | 'project_type' | 'tools'>('header');
  
  // Neuer Projektart-Eintrag
  const [newProjectType, setNewProjectType] = useState('');
  
  // Versteckter Pro-Schalter
  const [tapCount, setTapCount] = useState(0);
  const [isProUnlocked, setIsProUnlocked] = useState(false);
  const [lastTapTime, setLastTapTime] = useState(0);
  
  // Expertenmodus
  const [showExpertModal, setShowExpertModal] = useState(false);
  const [expertCode, setExpertCode] = useState('');
  const [showResetCodeModal, setShowResetCodeModal] = useState(false);
  const [masterCode, setMasterCode] = useState('');
  const [newExpertCode, setNewExpertCode] = useState('');
  const [confirmNewCode, setConfirmNewCode] = useState('');
  
  // Standard Expert-Code (kann vom Nutzer geändert werden)
  const DEFAULT_EXPERT_CODE = 'PROFI2024';
  const MASTER_RESET_CODE = 'RESET-MASTER-8472'; // Geheimer Master-Code zum Zurücksetzen

  useEffect(() => {
    loadSettings();
    // Pro-Status laden
    loadProStatus().then((status) => {
      setIsProUnlocked(status);
      updateFeatures();
    });
    // Gespeicherten Expert-Code laden
    loadExpertCode();
    // Skizzen-Werkzeug-Beschriftungen laden
    getSketchLabels().then(setSketchLabels);
  }, []);

  // Skizzen-Werkzeuge benennen (Memo-Pfeil & Notiz)
  const [sketchLabels, setSketchLabels] = useState<SketchLabelSettings>({ ...DEFAULT_SKETCH_LABELS });
  const updateSketchLabel = (field: keyof SketchLabelSettings, value: string) => {
    const next = { ...sketchLabels, [field]: value };
    setSketchLabels(next);
    saveSketchLabels(next);
  };
  
  // Expert-Code aus AsyncStorage laden
  const loadExpertCode = async () => {
    try {
      const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
      const savedCode = await AsyncStorage.getItem('aufmassprofi_expert_code');
      if (savedCode) {
        // Code existiert bereits
      }
    } catch (e) {
      console.error('Error loading expert code:', e);
    }
  };
  
  // Expert-Code prüfen und Pro aktivieren
  const handleExpertCodeSubmit = async () => {
    try {
      const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
      const savedCode = await AsyncStorage.getItem('aufmassprofi_expert_code');
      const correctCode = savedCode || DEFAULT_EXPERT_CODE;
      
      if (expertCode.toUpperCase() === correctCode.toUpperCase()) {
        await setProStatus(true);
        setIsProUnlocked(true);
        updateFeatures();
        setShowExpertModal(false);
        setExpertCode('');
        
        Alert.alert(
          '🎉 Expertenmodus aktiviert!',
          t('settings.proFeaturesUnlocked'),
          [{ text: t('common.ok') }]
        );
      } else {
        Alert.alert(t('settings.wrongCode'), t('settings.wrongCodeMessage'));
      }
    } catch (e) {
      console.error('Error checking expert code:', e);
    }
  };
  
  // Pro deaktivieren (zurück zu Basic)
  const handleDeactivatePro = async () => {
    Alert.alert(
      t('settings.deactivateExpertMode'),
      t('settings.deactivateExpertConfirm'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('settings.deactivate'),
          style: 'destructive',
          onPress: async () => {
            await setProStatus(false);
            setIsProUnlocked(false);
            updateFeatures();
            Alert.alert(
              t('settings.basicVersionActivated'),
              t('settings.basicVersionResetMessage'),
              [{ text: t('common.ok') }]
            );
          }
        }
      ]
    );
  };
  
  // Master-Reset: Neuen Expert-Code setzen
  const handleResetCode = async () => {
    if (masterCode !== MASTER_RESET_CODE) {
      Alert.alert(t('settings.wrongMasterCode'), t('settings.wrongMasterCodeMessage'));
      return;
    }
    
    if (newExpertCode.length < 4) {
      Alert.alert(t('settings.codeTooShort'), t('settings.codeTooShortMessage'));
      return;
    }
    
    if (newExpertCode !== confirmNewCode) {
      Alert.alert(t('settings.codesNoMatch'), t('settings.codesNoMatchMessage'));
      return;
    }
    
    try {
      const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
      await AsyncStorage.setItem('aufmassprofi_expert_code', newExpertCode.toUpperCase());
      
      setShowResetCodeModal(false);
      setMasterCode('');
      setNewExpertCode('');
      setConfirmNewCode('');
      
      Alert.alert('✅ Code geändert', `Der neue Expert-Code wurde gespeichert: ${newExpertCode.toUpperCase()}`);
    } catch (e) {
      console.error('Error saving new expert code:', e);
    }
  };
  
  // Versteckter Tap-Handler für Code-Reset Modal (5x tippen auf "Einstellungen")
  const handleVersionTap = async () => {
    const now = Date.now();
    let newTapCount: number;
    
    if (now - lastTapTime > 2000) {
      newTapCount = 1;
    } else {
      newTapCount = tapCount + 1;
    }
    
    setTapCount(newTapCount);
    setLastTapTime(now);
    
    // Bei 5 Taps: Code-Reset Modal öffnen
    if (newTapCount >= 5) {
      setTapCount(0);
      setShowResetCodeModal(true);
    }
  };

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
      Alert.alert(t('customers.permissionRequired'), t('settings.photoPermission'));
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
        alert(t('settings.settingsSaved'));
      } else {
        Alert.alert(t('common.success'), t('settings.settingsSaved'));
      }
    } catch (error) {
      console.error('Error saving settings:', error);
      if (Platform.OS === 'web') {
        alert('Fehler beim Speichern');
      } else {
        Alert.alert(t('common.error'), t('settings.settingsSaveError'));
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
      {/* Custom Header mit SafeArea */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Text style={styles.headerScreenTitle}>{t('screenTitles.settings')}</Text>
        <View style={styles.headerRow}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color="#1976d2" />
          </TouchableOpacity>
          <TouchableOpacity onPress={handleVersionTap} activeOpacity={1}>
            <Text style={styles.headerTitle}>{isProUnlocked ? t('settings.titlePro') : t('settings.titleBasic')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.saveButton} onPress={saveSettings} disabled={saving}>
            {saving ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.saveButtonText}>{t('common.save')}</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
      
      <ScrollView style={styles.scrollView}>
        <View style={styles.content}>
          {/* Logo Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Logo</Text>
            <View style={styles.logoContainer}>
              {/* Basic Version: Festes Aufmassprofi Logo */}
              {!isProUnlocked ? (
                <View style={styles.logoPreviewBasic}>
                  <Image
                    source={require('../../assets/images/icon.png')}
                    style={styles.logoImage}
                    resizeMode="contain"
                  />
                  <View style={styles.basicLogoOverlay}>
                    <Text style={styles.basicLogoText}>{getAppName()}</Text>
                    <Text style={styles.basicLogoHint}>{t('settings.customLogoProHint')}</Text>
                  </View>
                </View>
              ) : (
                <>
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
                      <Text style={styles.changeLogoText}>{t('settings.changeLogo')}</Text>
                    </TouchableOpacity>
                  )}
                </>
              )}
            </View>
          </View>

          {/* Briefkopf Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('settings.language')}</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 4 }}>
              <TouchableOpacity
                style={{
                  flex: 1,
                  paddingVertical: 10,
                  paddingHorizontal: 16,
                  borderRadius: 8,
                  backgroundColor: currentLang === 'de' ? '#1976d2' : '#f0f0f0',
                  alignItems: 'center',
                  borderWidth: 1,
                  borderColor: currentLang === 'de' ? '#1565c0' : '#ddd',
                }}
                onPress={() => {
                  setCurrentLang('de');
                  saveLanguage('de');
                }}
              >
                <Text style={{ fontSize: 14, fontWeight: '600', color: currentLang === 'de' ? '#fff' : '#333' }}>
                  🇩🇪  {t('settings.german')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{
                  flex: 1,
                  paddingVertical: 10,
                  paddingHorizontal: 16,
                  borderRadius: 8,
                  backgroundColor: currentLang === 'en' ? '#1976d2' : '#f0f0f0',
                  alignItems: 'center',
                  borderWidth: 1,
                  borderColor: currentLang === 'en' ? '#1565c0' : '#ddd',
                }}
                onPress={() => {
                  setCurrentLang('en');
                  saveLanguage('en');
                }}
              >
                <Text style={{ fontSize: 14, fontWeight: '600', color: currentLang === 'en' ? '#fff' : '#333' }}>
                  🇬🇧  {t('settings.english')}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Skizzen-Werkzeuge benennen */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Skizzen-Werkzeuge benennen</Text>
            <Text style={{ fontSize: 12, color: '#888', marginBottom: 14 }}>
              Der Name erscheint in der Vorschau und im PDF (z.B. „Vermerk"), das Kürzel auf dem Button in der Skizze (z.B. „VM").
            </Text>

            <Text style={{ fontSize: 13, fontWeight: '700', color: '#e91e63', marginBottom: 8 }}>➤ Memo-Pfeil</Text>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={[styles.inputGroup, { flex: 2 }]}>
                <Text style={styles.label}>Name</Text>
                <TextInput
                  testID="sketch-label-pointer-name"
                  style={styles.input}
                  value={sketchLabels.pointerName}
                  onChangeText={(v) => updateSketchLabel('pointerName', v)}
                  placeholder="z.B. Vermerk"
                />
              </View>
              <View style={[styles.inputGroup, { flex: 1 }]}>
                <Text style={styles.label}>Kürzel</Text>
                <TextInput
                  testID="sketch-label-pointer-code"
                  style={styles.input}
                  value={sketchLabels.pointerCode}
                  onChangeText={(v) => updateSketchLabel('pointerCode', v)}
                  placeholder="z.B. VM"
                  maxLength={8}
                />
              </View>
            </View>

            <Text style={{ fontSize: 13, fontWeight: '700', color: '#E74C3C', marginTop: 8, marginBottom: 8 }}>💬 Notiz</Text>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={[styles.inputGroup, { flex: 2 }]}>
                <Text style={styles.label}>Name</Text>
                <TextInput
                  testID="sketch-label-memo-name"
                  style={styles.input}
                  value={sketchLabels.memoName}
                  onChangeText={(v) => updateSketchLabel('memoName', v)}
                  placeholder="z.B. Zusatzleistung"
                />
              </View>
              <View style={[styles.inputGroup, { flex: 1 }]}>
                <Text style={styles.label}>Kürzel</Text>
                <TextInput
                  testID="sketch-label-memo-code"
                  style={styles.input}
                  value={sketchLabels.memoCode}
                  onChangeText={(v) => updateSketchLabel('memoCode', v)}
                  placeholder="z.B. ZL"
                  maxLength={8}
                />
              </View>
            </View>
          </View>

          {/* Briefkopf Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('settings.pdfSettings')}</Text>
            
            <View style={styles.inputGroup}>
              <Text style={styles.label}>{t('settings.companyName')}</Text>
              <TextInput
                style={styles.input}
                value={settings.company_name}
                onChangeText={(text) => setSettings({ ...settings, company_name: text })}
                placeholder={t('settings.companyNamePlaceholder')}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>{t('settings.subtitle')}</Text>
              <TextInput
                style={styles.input}
                value={settings.company_subtitle}
                onChangeText={(text) => setSettings({ ...settings, company_subtitle: text })}
                placeholder={t('settings.subtitlePlaceholder')}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>{t('settings.ownerName')}</Text>
              <TextInput
                style={styles.input}
                value={settings.owner_name}
                onChangeText={(text) => setSettings({ ...settings, owner_name: text })}
                placeholder={t('settings.ownerPlaceholder')}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>{t('settings.street')}</Text>
              <TextInput
                style={styles.input}
                value={settings.street}
                onChangeText={(text) => setSettings({ ...settings, street: text })}
                placeholder={t('settings.streetPlaceholder')}
              />
            </View>

            <View style={styles.row}>
              <View style={[styles.inputGroup, { flex: 1, marginRight: 8 }]}>
                <Text style={styles.label}>{t('settings.zipCode')}</Text>
                <TextInput
                  style={styles.input}
                  value={settings.zip_code}
                  onChangeText={(text) => setSettings({ ...settings, zip_code: text })}
                  placeholder={t('settings.zipPlaceholder')}
                  keyboardType="number-pad"
                />
              </View>
              <View style={[styles.inputGroup, { flex: 2 }]}>
                <Text style={styles.label}>{t('settings.city')}</Text>
                <TextInput
                  style={styles.input}
                  value={settings.city}
                  onChangeText={(text) => setSettings({ ...settings, city: text })}
                  placeholder={t('settings.cityPlaceholder')}
                />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>{t('settings.phone')}</Text>
              <TextInput
                style={styles.input}
                value={settings.phone}
                onChangeText={(text) => setSettings({ ...settings, phone: text })}
                placeholder={t('settings.phonePlaceholder')}
                keyboardType="phone-pad"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>{t('settings.mobilePhone')}</Text>
              <TextInput
                style={styles.input}
                value={settings.mobile_phone}
                onChangeText={(text) => setSettings({ ...settings, mobile_phone: text })}
                placeholder={t('settings.mobilePlaceholder')}
                keyboardType="phone-pad"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>{t('settings.fax')}</Text>
              <TextInput
                style={styles.input}
                value={settings.fax}
                onChangeText={(text) => setSettings({ ...settings, fax: text })}
                placeholder={t('settings.faxPlaceholder')}
                keyboardType="phone-pad"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>{t('settings.email')}</Text>
              <TextInput
                style={styles.input}
                value={settings.email}
                onChangeText={(text) => setSettings({ ...settings, email: text })}
                placeholder={t('settings.emailPlaceholder')}
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>{t('settings.services')}</Text>
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
            <Text style={styles.sectionTitle}>{t('settings.authorLabel')}</Text>
            
            <View style={styles.inputGroup}>
              <Text style={styles.label}>{t('settings.authorName')}</Text>
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
            <Text style={styles.sectionTitle}>{t('settings.pdfLayout')}</Text>
            
            <View style={styles.inputGroup}>
              <Text style={styles.label}>{t('settings.checklistColumns')}</Text>
              <Text style={styles.sublabel}>{t('settings.checklistColumnsHint')}</Text>
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
                      {num === 1 ? t('settings.column') : t('settings.columns')}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>

          {/* PDF Layout Größen Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('settings.pdfLayoutSizes')}</Text>
            <Text style={styles.sublabel}>
              {t('settings.pdfLayoutSizesHint')}
            </Text>
            
            {/* Bereichsauswahl-Tabs */}
            <View style={styles.layoutTabsContainer}>
              <TouchableOpacity
                style={[styles.layoutTab, selectedLayoutSection === 'header' && styles.layoutTabActive]}
                onPress={() => setSelectedLayoutSection('header')}
              >
                <Ionicons name="document-text" size={18} color={selectedLayoutSection === 'header' ? '#fff' : '#666'} />
                <Text style={[styles.layoutTabText, selectedLayoutSection === 'header' && styles.layoutTabTextActive]}>{t('settings.headerStyle')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.layoutTab, selectedLayoutSection === 'project_type' && styles.layoutTabActive]}
                onPress={() => setSelectedLayoutSection('project_type')}
              >
                <Ionicons name="ribbon" size={18} color={selectedLayoutSection === 'project_type' ? '#fff' : '#666'} />
                <Text style={[styles.layoutTabText, selectedLayoutSection === 'project_type' && styles.layoutTabTextActive]}>{t('settings.headerStyleLabel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.layoutTab, selectedLayoutSection === 'tools' && styles.layoutTabActive]}
                onPress={() => setSelectedLayoutSection('tools')}
              >
                <Ionicons name="construct" size={18} color={selectedLayoutSection === 'tools' ? '#fff' : '#666'} />
                <Text style={[styles.layoutTabText, selectedLayoutSection === 'tools' && styles.layoutTabTextActive]}>{t('settings.toolsLabel')}</Text>
              </TouchableOpacity>
            </View>
            
            {/* Größen-Auswahl basierend auf ausgewähltem Bereich */}
            <View style={styles.layoutSizeContainer}>
              {selectedLayoutSection === 'header' && (
                <>
                  <Text style={styles.layoutSectionInfo}>
                    <Ionicons name="information-circle" size={14} color="#666" /> {t('settings.companyDataInHeader')}
                  </Text>
                  
                  {/* Größe */}
                  <Text style={styles.layoutSubLabel}>{t('settings.sizeLabel')}</Text>
                  <View style={styles.sizeButtonsRow}>
                    {PDF_SIZE_OPTIONS.map((size) => (
                      <TouchableOpacity
                        key={size.id}
                        style={[styles.sizeButton, settings.pdf_header_size === size.id && styles.sizeButtonActive]}
                        onPress={() => setSettings({ ...settings, pdf_header_size: size.id as 'small' | 'medium' | 'large' })}
                      >
                        <View style={[styles.sizePreview, styles[`sizePreview${size.id.charAt(0).toUpperCase() + size.id.slice(1)}` as keyof typeof styles]]} />
                        <Text style={[styles.sizeButtonText, settings.pdf_header_size === size.id && styles.sizeButtonTextActive]}>{t(size.labelKey)}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  
                  {/* Farbe */}
                  <Text style={styles.layoutSubLabel}>{t('settings.headerColor')}</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.colorScrollRow}>
                    {PDF_COLOR_OPTIONS.map((color) => (
                      <TouchableOpacity
                        key={color.id}
                        style={[styles.colorButtonSmall, settings.pdf_header_section_color === color.id && styles.colorButtonSmallActive]}
                        onPress={() => setSettings({ ...settings, pdf_header_section_color: color.id })}
                      >
                        <View style={[styles.colorPreviewSmall, { backgroundColor: color.color }]} />
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                  
                  {/* Stil */}
                  <Text style={styles.layoutSubLabel}>{t('sketches.fontStyle')}</Text>
                  <View style={styles.styleButtonsRow}>
                    {PDF_STYLE_OPTIONS.map((style) => (
                      <TouchableOpacity
                        key={style.id}
                        style={[styles.styleButtonSmall, settings.pdf_header_section_style === style.id && styles.styleButtonSmallActive]}
                        onPress={() => setSettings({ ...settings, pdf_header_section_style: style.id as 'filled' | 'outline' })}
                      >
                        <Text style={[styles.styleButtonSmallText, settings.pdf_header_section_style === style.id && styles.styleButtonSmallTextActive]}>{t(style.labelKey)}</Text>
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
                  
                  {/* Größe */}
                  <Text style={styles.layoutSubLabel}>{t('settings.sizeLabel')}</Text>
                  <View style={styles.sizeButtonsRow}>
                    {PDF_SIZE_OPTIONS.map((size) => (
                      <TouchableOpacity
                        key={size.id}
                        style={[styles.sizeButton, settings.pdf_project_type_size === size.id && styles.sizeButtonActive]}
                        onPress={() => setSettings({ ...settings, pdf_project_type_size: size.id as 'small' | 'medium' | 'large' })}
                      >
                        <View style={[styles.sizePreview, styles[`sizePreview${size.id.charAt(0).toUpperCase() + size.id.slice(1)}` as keyof typeof styles]]} />
                        <Text style={[styles.sizeButtonText, settings.pdf_project_type_size === size.id && styles.sizeButtonTextActive]}>{t(size.labelKey)}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  
                  {/* Farbe */}
                  <Text style={styles.layoutSubLabel}>{t('settings.headerColor')}</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.colorScrollRow}>
                    {PDF_COLOR_OPTIONS.map((color) => (
                      <TouchableOpacity
                        key={color.id}
                        style={[styles.colorButtonSmall, settings.pdf_project_type_color === color.id && styles.colorButtonSmallActive]}
                        onPress={() => setSettings({ ...settings, pdf_project_type_color: color.id })}
                      >
                        <View style={[styles.colorPreviewSmall, { backgroundColor: color.color }]} />
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                  
                  {/* Stil */}
                  <Text style={styles.layoutSubLabel}>{t('sketches.fontStyle')}</Text>
                  <View style={styles.styleButtonsRow}>
                    {PDF_STYLE_OPTIONS.map((style) => (
                      <TouchableOpacity
                        key={style.id}
                        style={[styles.styleButtonSmall, settings.pdf_project_type_style === style.id && styles.styleButtonSmallActive]}
                        onPress={() => setSettings({ ...settings, pdf_project_type_style: style.id as 'filled' | 'outline' })}
                      >
                        <Text style={[styles.styleButtonSmallText, settings.pdf_project_type_style === style.id && styles.styleButtonSmallTextActive]}>{t(style.labelKey)}</Text>
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
                  
                  {/* Größe */}
                  <Text style={styles.layoutSubLabel}>{t('settings.sizeLabel')}</Text>
                  <View style={styles.sizeButtonsRow}>
                    {PDF_SIZE_OPTIONS.map((size) => (
                      <TouchableOpacity
                        key={size.id}
                        style={[styles.sizeButton, settings.pdf_tools_size === size.id && styles.sizeButtonActive]}
                        onPress={() => setSettings({ ...settings, pdf_tools_size: size.id as 'small' | 'medium' | 'large' })}
                      >
                        <View style={[styles.sizePreview, styles[`sizePreview${size.id.charAt(0).toUpperCase() + size.id.slice(1)}` as keyof typeof styles]]} />
                        <Text style={[styles.sizeButtonText, settings.pdf_tools_size === size.id && styles.sizeButtonTextActive]}>{t(size.labelKey)}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  
                  {/* Farbe */}
                  <Text style={styles.layoutSubLabel}>{t('settings.headerColor')}</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.colorScrollRow}>
                    {PDF_COLOR_OPTIONS.map((color) => (
                      <TouchableOpacity
                        key={color.id}
                        style={[styles.colorButtonSmall, settings.pdf_tools_color === color.id && styles.colorButtonSmallActive]}
                        onPress={() => setSettings({ ...settings, pdf_tools_color: color.id })}
                      >
                        <View style={[styles.colorPreviewSmall, { backgroundColor: color.color }]} />
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                  
                  {/* Hinweis: Kein Stil bei Tools, da diese nur Unterstreichung haben */}
                  <Text style={styles.layoutHint}>
                    <Ionicons name="information-circle-outline" size={12} color="#999" /> Tools-Überschriften haben keinen Rahmen, daher keine Stil-Auswahl.
                  </Text>
                </>
              )}
            </View>
          </View>

          {/* Projektart-Überschriften Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('settings.projectTypes')}</Text>
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
                placeholder={t('settings.addProjectType')}
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
              {t('settings.resetInfo')}
            </Text>
            <TouchableOpacity
              style={styles.resetButton}
              onPress={() => {
                Alert.alert(
                  t('settings.resetSettings'),
                  t('settings.resetConfirm'),
                  [
                    { text: t('common.cancel'), style: 'cancel' },
                    {
                      text: t('common.reset'),
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
                          mobile_phone: '',
                          fax: '',
                          email: '',
                          services: '',
                          author_name: '',
                          logo_data: null,
                          bluetooth_mode: false,
                          pdf_checklist_columns: 2,
                          pdf_header_color: 'blue',
                          pdf_header_style: 'filled',
                          project_type_options: [],
                          // Layout-Größen
                          pdf_header_size: 'medium',
                          pdf_project_type_size: 'medium',
                          pdf_tools_size: 'medium',
                          // Layout-Farben (je Bereich)
                          pdf_header_section_color: 'blue',
                          pdf_header_section_style: 'filled',
                          pdf_project_type_color: 'blue',
                          pdf_project_type_style: 'filled',
                          pdf_tools_color: 'blue',
                          pdf_tools_style: 'filled',
                        });
                        Alert.alert(t('common.success'), t('settings.resetDone'));
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
          
          {/* Expertenmodus Section - unauffällig */}
          <View style={[styles.section, { marginTop: 20, paddingVertical: 8 }]}>
            {isProUnlocked ? (
              <View>
                <View style={styles.expertActiveContainer}>
                  <Ionicons name="checkmark-circle" size={20} color="#4caf50" />
                  <Text style={styles.expertActiveText}>Pro aktiv</Text>
                </View>
                <TouchableOpacity
                  style={styles.expertDeactivateButton}
                  onPress={handleDeactivatePro}
                >
                  <Text style={styles.expertDeactivateText}>Deaktivieren</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                style={styles.expertButtonSmall}
                onPress={() => setShowExpertModal(true)}
              >
                <Text style={styles.expertButtonSmallText}>Erweitert...</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* ===== Rechtliches & Datenschutz ===== */}
          <View style={[styles.section, { marginTop: 8 }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <Ionicons name="document-lock-outline" size={20} color="#1976d2" />
              <Text style={styles.sectionTitle}>Rechtliches</Text>
            </View>

            <TouchableOpacity
              style={legalStyles.navRow}
              onPress={() => router.push('/legal/datenschutz')}
              activeOpacity={0.7}
            >
              <View style={[legalStyles.navIcon, { backgroundColor: '#dcfce7' }]}>
                <Ionicons name="shield-checkmark" size={18} color="#16a34a" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={legalStyles.navTitle}>Datenschutzerklärung</Text>
                <Text style={legalStyles.navSub}>Welche Daten verarbeitet die App?</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#94a3b8" />
            </TouchableOpacity>

            <TouchableOpacity
              style={legalStyles.navRow}
              onPress={() => router.push('/legal/haftung')}
              activeOpacity={0.7}
            >
              <View style={[legalStyles.navIcon, { backgroundColor: '#fed7aa' }]}>
                <Ionicons name="warning" size={18} color="#ea580c" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={legalStyles.navTitle}>Haftungsausschluss</Text>
                <Text style={legalStyles.navSub}>Maße, Berechnungen & Ergebnisse</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#94a3b8" />
            </TouchableOpacity>

            <TouchableOpacity
              style={legalStyles.navRow}
              onPress={() => router.push('/legal/impressum')}
              activeOpacity={0.7}
            >
              <View style={[legalStyles.navIcon, { backgroundColor: '#dbeafe' }]}>
                <Ionicons name="business" size={18} color="#1976d2" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={legalStyles.navTitle}>Impressum</Text>
                <Text style={legalStyles.navSub}>Angaben gem. § 5 TMG</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#94a3b8" />
            </TouchableOpacity>

            <TouchableOpacity
              style={legalStyles.navRow}
              onPress={() => router.push('/legal')}
              activeOpacity={0.7}
            >
              <View style={[legalStyles.navIcon, { backgroundColor: '#e0f2fe' }]}>
                <Ionicons name="information-circle" size={18} color="#0369a1" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={legalStyles.navTitle}>Über die App</Text>
                <Text style={legalStyles.navSub}>Version, Build & Open-Source-Hinweise</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#94a3b8" />
            </TouchableOpacity>

            <TouchableOpacity
              style={legalStyles.navRow}
              onPress={async () => {
                Alert.alert(
                  'Haftungsausschluss erneut anzeigen?',
                  'Beim nächsten App-Start wird der Haftungsausschluss-Dialog erneut angezeigt, damit du ihn überprüfen und neu bestätigen kannst.',
                  [
                    { text: 'Abbrechen', style: 'cancel' },
                    {
                      text: 'Ja, erneut anzeigen',
                      style: 'destructive',
                      onPress: async () => {
                        try {
                          await SettingsService.update({ disclaimer_accepted_at: undefined, disclaimer_version: undefined } as any);
                          Alert.alert('Erledigt', 'Bitte starte die App neu, um den Haftungsausschluss zu sehen.');
                        } catch { /* silent */ }
                      },
                    },
                  ]
                );
              }}
              activeOpacity={0.7}
            >
              <View style={[legalStyles.navIcon, { backgroundColor: '#fee2e2' }]}>
                <Ionicons name="refresh" size={18} color="#dc2626" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={legalStyles.navTitle}>Haftungsausschluss zurücksetzen</Text>
                <Text style={legalStyles.navSub}>Dialog beim nächsten App-Start erneut anzeigen</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#94a3b8" />
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
      
      {/* Expert Code Modal */}
      {showExpertModal && (
        <View style={styles.modalOverlay}>
          <View style={styles.expertModal}>
            <Text style={styles.expertModalTitle}>Expertenmodus freischalten</Text>
            <Text style={styles.expertModalSubtitle}>Geben Sie Ihren Freischaltcode ein:</Text>
            <TextInput
              style={styles.expertCodeInput}
              value={expertCode}
              onChangeText={setExpertCode}
              placeholder="Code eingeben..."
              placeholderTextColor="#999"
              autoCapitalize="characters"
              autoCorrect={false}
            />
            <View style={styles.expertModalButtons}>
              <TouchableOpacity
                style={styles.expertModalCancelButton}
                onPress={() => {
                  setShowExpertModal(false);
                  setExpertCode('');
                }}
              >
                <Text style={styles.expertModalCancelText}>Abbrechen</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.expertModalSubmitButton}
                onPress={handleExpertCodeSubmit}
              >
                <Text style={styles.expertModalSubmitText}>Freischalten</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
      
      {/* Reset Code Modal (versteckt - 5x auf Einstellungen tippen) */}
      {showResetCodeModal && (
        <View style={styles.modalOverlay}>
          <View style={styles.expertModal}>
            <Text style={styles.expertModalTitle}>Expert-Code zurücksetzen</Text>
            <Text style={styles.expertModalSubtitle}>Master-Code:</Text>
            <TextInput
              style={styles.expertCodeInput}
              value={masterCode}
              onChangeText={setMasterCode}
              placeholder="Master-Code..."
              placeholderTextColor="#999"
              secureTextEntry
            />
            <Text style={[styles.expertModalSubtitle, { marginTop: 15 }]}>Neuer Expert-Code:</Text>
            <TextInput
              style={styles.expertCodeInput}
              value={newExpertCode}
              onChangeText={setNewExpertCode}
              placeholder="Neuer Code (min. 4 Zeichen)..."
              placeholderTextColor="#999"
              autoCapitalize="characters"
            />
            <Text style={[styles.expertModalSubtitle, { marginTop: 10 }]}>Code bestätigen:</Text>
            <TextInput
              style={styles.expertCodeInput}
              value={confirmNewCode}
              onChangeText={setConfirmNewCode}
              placeholder="Code wiederholen..."
              placeholderTextColor="#999"
              autoCapitalize="characters"
            />
            <View style={styles.expertModalButtons}>
              <TouchableOpacity
                style={styles.expertModalCancelButton}
                onPress={() => {
                  setShowResetCodeModal(false);
                  setMasterCode('');
                  setNewExpertCode('');
                  setConfirmNewCode('');
                }}
              >
                <Text style={styles.expertModalCancelText}>Abbrechen</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.expertModalSubmitButton}
                onPress={handleResetCode}
              >
                <Text style={styles.expertModalSubmitText}>Speichern</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.saveButton, saving && styles.buttonDisabled]}
          onPress={saveSettings}
          disabled={saving}
        >
          <Ionicons name="save-outline" size={24} color="#fff" />
          <Text style={styles.saveButtonText}>
            {saving ? t('common.isSaving') : t('common.save')}
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
  logoPreviewBasic: {
    position: 'relative',
    width: 200,
    height: 150,
    backgroundColor: '#0a1628',
    borderRadius: 12,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  basicLogoOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingVertical: 8,
    alignItems: 'center',
  },
  basicLogoText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 12,
  },
  basicLogoHint: {
    color: '#90caf9',
    fontSize: 10,
    marginTop: 2,
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
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  headerScreenTitle: {
    fontSize: 13,
    color: '#888',
    textAlign: 'center',
    marginBottom: 6,
    fontWeight: '500',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
  // Neue Styles für Layout-Farben und Stil-Auswahl
  layoutSubLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#444',
    marginTop: 12,
    marginBottom: 8,
  },
  colorScrollRow: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  colorButtonSmall: {
    padding: 6,
    marginRight: 8,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  colorButtonSmallActive: {
    borderColor: '#1976d2',
    backgroundColor: '#e3f2fd',
  },
  colorPreviewSmall: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  styleButtonsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  styleButtonSmall: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#e0e0e0',
    alignItems: 'center',
  },
  styleButtonSmallActive: {
    borderColor: '#1976d2',
    backgroundColor: '#e3f2fd',
  },
  styleButtonSmallText: {
    fontSize: 12,
    color: '#666',
  },
  styleButtonSmallTextActive: {
    color: '#1976d2',
    fontWeight: '600',
  },
  layoutHint: {
    fontSize: 11,
    color: '#999',
    fontStyle: 'italic',
    marginTop: 12,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  // Expertenmodus Styles
  expertButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ff9800',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 10,
    gap: 10,
  },
  expertButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  expertButtonSmall: {
    alignSelf: 'flex-start',
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  expertButtonSmallText: {
    color: '#bbb',
    fontSize: 11,
  },
  expertActiveContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#e8f5e9',
    padding: 16,
    borderRadius: 10,
    gap: 10,
    marginBottom: 12,
  },
  expertActiveText: {
    color: '#2e7d32',
    fontSize: 16,
    fontWeight: '600',
  },
  expertDeactivateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    gap: 6,
  },
  expertDeactivateText: {
    color: '#f44336',
    fontSize: 14,
  },
  modalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  expertModal: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    width: '85%',
    maxWidth: 400,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 10,
  },
  expertModalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#333',
    textAlign: 'center',
    marginBottom: 8,
  },
  expertModalSubtitle: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
  },
  expertCodeInput: {
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    padding: 14,
    fontSize: 18,
    borderWidth: 1,
    borderColor: '#ddd',
    textAlign: 'center',
    letterSpacing: 2,
  },
  expertModalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 20,
    gap: 12,
  },
  expertModalCancelButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#f5f5f5',
    alignItems: 'center',
  },
  expertModalCancelText: {
    color: '#666',
    fontSize: 16,
    fontWeight: '500',
  },
  expertModalSubmitButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#ff9800',
    alignItems: 'center',
  },
  expertModalSubmitText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});

const legalStyles = StyleSheet.create({
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  navIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0f172a',
  },
  navSub: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 1,
  },
});

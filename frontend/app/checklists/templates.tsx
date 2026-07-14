import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Alert,
  TextInput,
  Modal,
  KeyboardAvoidingView,
  ScrollView,
  Platform,
  Keyboard,
  TouchableWithoutFeedback,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ChecklistTemplateService } from '../../services/LocalStorage';
import * as FileSystem from 'expo-file-system/legacy';
import { copyAsync, deleteAsync, readAsStringAsync, writeAsStringAsync, cacheDirectory } from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import { Share } from 'react-native';
import { Features } from '../../services/FeatureFlags';
import { useTranslation } from 'react-i18next';

interface SubItem {
  text: string;
}

interface TemplateItem {
  text: string;
  subItems?: SubItem[];
}

interface ChecklistTemplate {
  id: string;
  name: string;
  items: (string | TemplateItem)[];
}

const DEFAULT_TEMPLATES = [
  {
    name: 'Dachinspektion',
    items: [
      'Dachziegel/Dachsteine prüfen',
      'Dachrinne kontrollieren',
      'Fallrohre prüfen',
      'Schornstein kontrollieren',
      'Lüftung prüfen',
      'Dachfenster kontrollieren',
      'Dachisolierung prüfen',
    ],
  },
  {
    name: 'Dachsanierung',
    items: [
      'Alte Eindeckung entfernen',
      'Unterkonstruktion prüfen',
      'Dämmung erneuern',
      'Dampfsperre verlegen',
      'Lattung anbringen',
      'Neue Eindeckung verlegen',
      'Anschlüsse abdichten',
      'Dachrinnen montieren',
    ],
  },
  {
    name: 'Flachdach-Wartung',
    items: [
      'Abdichtung prüfen',
      'Abläufe kontrollieren',
      'Vegetation entfernen',
      'Kiesschicht prüfen',
      'Anschlüsse kontrollieren',
      'Bewegungsfugen prüfen',
    ],
  },
];

export default function ChecklistTemplatesScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const [templates, setTemplates] = useState<ChecklistTemplate[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState('');
  const [newTemplateItems, setNewTemplateItems] = useState('');
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  useEffect(() => {
    loadTemplates();
  }, []);

  const loadTemplates = async () => {
    try {
      const data = await ChecklistTemplateService.getAll();
      // Sortiere nach order-Feld (falls vorhanden)
      const sortedData = data.sort((a: any, b: any) => {
        const orderA = a.order !== undefined ? a.order : 999;
        const orderB = b.order !== undefined ? b.order : 999;
        return orderA - orderB;
      });
      setTemplates(sortedData);
    } catch (error) {
      console.error('Error loading templates:', error);
    }
  };

  // Vorlage nach oben verschieben
  const moveTemplateUp = async (index: number) => {
    if (index === 0) return;
    const newTemplates = [...templates];
    [newTemplates[index - 1], newTemplates[index]] = [newTemplates[index], newTemplates[index - 1]];
    
    // Setze order für alle Templates
    const updatedTemplates = newTemplates.map((t, i) => ({ ...t, order: i }));
    setTemplates(updatedTemplates);
    
    // Speichern aller Templates auf einmal
    try {
      await ChecklistTemplateService.saveAll(updatedTemplates);
    } catch (error) {
      console.error('Error saving template order:', error);
    }
  };

  // Vorlage nach unten verschieben
  const moveTemplateDown = async (index: number) => {
    if (index >= templates.length - 1) return;
    const newTemplates = [...templates];
    [newTemplates[index], newTemplates[index + 1]] = [newTemplates[index + 1], newTemplates[index]];
    
    // Setze order für alle Templates
    const updatedTemplates = newTemplates.map((t, i) => ({ ...t, order: i }));
    setTemplates(updatedTemplates);
    
    // Speichern aller Templates auf einmal
    try {
      await ChecklistTemplateService.saveAll(updatedTemplates);
    } catch (error) {
      console.error('Error saving template order:', error);
    }
  };

  // Export a single template
  const exportTemplate = async (template: ChecklistTemplate) => {
    setIsExporting(true);
    try {
      // Vollständige Vorlage inkl. ausgelagerter Bilder laden
      const fullTemplate = (await ChecklistTemplateService.getById(template.id)) || template;
      const exportData = {
        type: 'aufmass_checklist_template',
        version: '1.0',
        exportDate: new Date().toISOString(),
        template: {
          name: fullTemplate.name,
          items: fullTemplate.items,
        },
      };

      const jsonString = JSON.stringify(exportData, null, 2);
      const safeName = template.name.replace(/[^a-zA-Z0-9äöüÄÖÜß]/g, '_');
      
      // Create file in cache directory
      const fileUri = `${cacheDirectory}${safeName}.checklistvorlage`;
      
      await writeAsStringAsync(fileUri, jsonString);

      // Share the file
      await Sharing.shareAsync(fileUri, {
        mimeType: 'application/json',
        dialogTitle: `Vorlage "${template.name}" teilen`,
      });
    } catch (error: any) {
      console.error('Error exporting template:', error);
      // Fallback: Share as text
      try {
        const exportData = {
          type: 'aufmass_checklist_template',
          version: '1.0',
          exportDate: new Date().toISOString(),
          template: {
            name: template.name,
            items: template.items,
          },
        };
        const jsonString = JSON.stringify(exportData);
        await Share.share({
          message: jsonString,
          title: `${template.name}.checklistvorlage`,
        });
      } catch (shareError) {
        Alert.alert(t('common.error'), t('checklists.templateExportError'));
      }
    } finally {
      setIsExporting(false);
    }
  };

  // Import a template from file
  const importTemplate = async () => {
    setIsImporting(true);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
      });

      if (result.canceled) {
        setIsImporting(false);
        return;
      }

      const file = result.assets[0];
      
      // Check file extension
      if (!file.name.endsWith('.checklistvorlage')) {
        Alert.alert(t('common.error'), t('checklists.selectTemplateFile'));
        setIsImporting(false);
        return;
      }

      const fileContent = await readAsStringAsync(file.uri);
      
      // Try to parse as JSON - the file might be a PDF with JSON content
      let importData;
      try {
        importData = JSON.parse(fileContent);
      } catch {
        // If direct parsing fails, try to extract JSON from content
        const jsonMatch = fileContent.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          importData = JSON.parse(jsonMatch[0]);
        } else {
          throw new Error(t('checklists.noValidData'));
        }
      }

      // Validate import data
      if (importData.type !== 'aufmass_checklist_template' || !importData.template) {
        Alert.alert(t('common.error'), t('checklists.invalidFileFormat'));
        setIsImporting(false);
        return;
      }

      const { template } = importData;

      // Check if template with same name exists
      const existingTemplates = await ChecklistTemplateService.getAll();
      const nameExists = existingTemplates.some(t => t.name === template.name);
      
      let finalName = template.name;
      if (nameExists) {
        finalName = `${template.name} (Import)`;
      }

      // Create the template
      await ChecklistTemplateService.create({
        name: finalName,
        items: template.items,
        templateLogo: template.templateLogo,
      });

      await loadTemplates();
      Alert.alert(t('common.success'), t('checklists.templateCreated'));
    } catch (error) {
      console.error('Error importing template:', error);
      Alert.alert(t('common.error'), t('checklists.templateSaveError'));
    } finally {
      setIsImporting(false);
    }
  };

  const createTemplate = async () => {
    if (!newTemplateName.trim() || !newTemplateItems.trim()) {
      Alert.alert(t('common.error'), t('checklists.fillAllFields'));
      return;
    }

    // Basis-Version: Max 3 Vorlagen
    if (Features.maxTemplates < 100 && templates.length >= Features.maxTemplates) {
      Alert.alert(
        t('checklists.basicVersionTitle'),
        t('checklists.basicVersionLimit', { max: Features.maxTemplates }),
        [{ text: t('common.ok') }]
      );
      return;
    }

    try {
      const items = newTemplateItems
        .split('\n')
        .filter((item) => item.trim())
        .map((item) => item.trim());

      await ChecklistTemplateService.create({
        name: newTemplateName,
        items,
      });

      setShowModal(false);
      setNewTemplateName('');
      setNewTemplateItems('');
      loadTemplates();
      Alert.alert(t('common.success'), t('checklists.templateCreated'));
    } catch (error) {
      console.error('Error creating template:', error);
      Alert.alert(t('common.error'), t('checklists.templateCreateError'));
    }
  };

  const deleteTemplate = async (templateId: string) => {
    Alert.alert(
      t('checklists.deleteTemplate'),
      t('checklists.deleteTemplateConfirm'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              await ChecklistTemplateService.delete(templateId);
              loadTemplates();
            } catch (error) {
              console.error('Error deleting template:', error);
              Alert.alert(t('common.error'), t('checklists.templateDeleteError'));
            }
          },
        },
      ]
    );
  };

  const renderTemplate = ({ item, index }: { item: ChecklistTemplate; index: number }) => (
    <View style={styles.templateCard}>
      <View style={styles.templateHeader}>
        <Ionicons name="list" size={24} color="#1976d2" />
        <Text style={styles.templateName}>{item.name}</Text>
        
        {/* Move Buttons */}
        <View style={styles.moveButtons}>
          <TouchableOpacity 
            onPress={() => moveTemplateUp(index)}
            style={[styles.moveButton, index === 0 && styles.moveButtonDisabled]}
            disabled={index === 0}
          >
            <Ionicons name="chevron-up" size={20} color={index === 0 ? '#ccc' : '#666'} />
          </TouchableOpacity>
          <TouchableOpacity 
            onPress={() => moveTemplateDown(index)}
            style={[styles.moveButton, index >= templates.length - 1 && styles.moveButtonDisabled]}
            disabled={index >= templates.length - 1}
          >
            <Ionicons name="chevron-down" size={20} color={index >= templates.length - 1 ? '#ccc' : '#666'} />
          </TouchableOpacity>
        </View>
      </View>
      <Text style={styles.itemCount}>{item.items.length} Punkte</Text>
      <View style={styles.itemsList}>
        {item.items.slice(0, 3).map((itm, idx) => (
          <Text key={idx} style={styles.itemPreview}>
            • {typeof itm === 'string' ? itm : itm.text}
          </Text>
        ))}
        {item.items.length > 3 && (
          <Text style={styles.moreItems}>+ {item.items.length - 3} weitere</Text>
        )}
      </View>
      
      {/* Button Row - separate line for better touch targets */}
      <View style={styles.actionButtonRow}>
        {/* Export Button - nur in Pro */}
        {Features.showChecklistImportExport && (
        <TouchableOpacity 
          onPress={() => exportTemplate(item)}
          style={styles.actionButtonExport}
          disabled={isExporting}
        >
          <Ionicons name="share-outline" size={20} color="#fff" />
          <Text style={styles.actionButtonTextExport}>Exportieren</Text>
        </TouchableOpacity>
        )}
        
        <TouchableOpacity 
          onPress={() => router.push(`/checklists/edit-template?templateId=${item.id}`)}
          style={styles.actionButtonEdit}
        >
          <Ionicons name="create-outline" size={20} color="#fff" />
          <Text style={styles.actionButtonTextEdit}>Bearbeiten</Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          onPress={() => deleteTemplate(item.id)}
          style={styles.actionButtonDelete}
        >
          <Ionicons name="trash-outline" size={20} color="#fff" />
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      {/* Loading Overlay */}
      {(isExporting || isImporting) && (
        <View style={styles.loadingOverlay}>
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color="#1976d2" />
            <Text style={styles.loadingText}>
              {isExporting ? t('checklists.exporting') : t('checklists.importing')}
            </Text>
          </View>
        </View>
      )}

      <View style={styles.header}>
        <Text style={styles.headerText}>
          {t('checklists.selectTemplateTitle')}
        </Text>
        
        {/* Button Row */}
        <View style={styles.buttonRow}>
          {/* Neue Vorlage Button - nur wenn unter dem Limit */}
          {(Features.maxTemplates >= 100 || templates.length < Features.maxTemplates) && (
          <TouchableOpacity
            style={styles.addButton}
            onPress={() => setShowModal(true)}
          >
            <Ionicons name="add-circle" size={24} color="#1976d2" />
            <Text style={styles.addButtonText}>{t('checklists.newChecklist')}</Text>
          </TouchableOpacity>
          )}
          
          {/* Import Button - nur in Pro */}
          {Features.showChecklistImportExport && (
          <TouchableOpacity
            style={styles.importButton}
            onPress={importTemplate}
            disabled={isImporting}
          >
            <Ionicons name="download-outline" size={24} color="#4caf50" />
            <Text style={styles.importButtonText}>{t('common.import')}</Text>
          </TouchableOpacity>
          )}
        </View>
        
        {/* Limit-Hinweis für Basis */}
        {Features.maxTemplates < 100 && (
          <Text style={styles.limitHint}>
            {t('checklists.templatesCount', { count: templates.length, max: Features.maxTemplates })}
          </Text>
        )}
      </View>

      <FlatList
        data={templates}
        renderItem={renderTemplate}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
      />

      <Modal
        visible={showModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowModal(false)}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <KeyboardAvoidingView 
            style={styles.modalOverlay}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          >
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>{t('checklists.newTemplate')}</Text>
                <TouchableOpacity onPress={() => setShowModal(false)}>
                  <Ionicons name="close" size={24} color="#333" />
                </TouchableOpacity>
              </View>

              <ScrollView 
                style={styles.modalScrollView}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={true}
              >
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>{t('checklists.templateName')}</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="z.B. Dachsanierung"
                    value={newTemplateName}
                    onChangeText={setNewTemplateName}
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.label}>{t('checklists.itemsPerLine')}</Text>
                  <TextInput
                    style={[styles.input, styles.textArea]}
                    placeholder={t('checklists.itemsPlaceholder')}
                    value={newTemplateItems}
                    onChangeText={setNewTemplateItems}
                    multiline
                    numberOfLines={10}
                  />
                </View>

                <TouchableOpacity style={styles.createButton} onPress={createTemplate}>
                  <Text style={styles.createButtonText}>{t('checklists.createTemplate')}</Text>
                </TouchableOpacity>
                
                <View style={styles.keyboardSpacer} />
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </TouchableWithoutFeedback>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  loadingBox: {
    backgroundColor: '#fff',
    padding: 30,
    borderRadius: 12,
    alignItems: 'center',
    gap: 15,
  },
  loadingText: {
    fontSize: 16,
    color: '#333',
    fontWeight: '500',
  },
  header: {
    backgroundColor: '#fff',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  headerText: {
    fontSize: 16,
    color: '#666',
    marginBottom: 12,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 10,
  },
  addButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    backgroundColor: '#e3f2fd',
    borderRadius: 8,
    gap: 8,
  },
  addButtonText: {
    color: '#1976d2',
    fontSize: 16,
    fontWeight: '600',
  },
  importButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    backgroundColor: '#e8f5e9',
    borderRadius: 8,
    gap: 8,
  },
  importButtonText: {
    color: '#4caf50',
    fontSize: 16,
    fontWeight: '600',
  },
  list: {
    padding: 16,
  },
  templateCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  templateHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 12,
  },
  templateName: {
    flex: 1,
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  moveButtons: {
    flexDirection: 'row',
    gap: 4,
  },
  moveButton: {
    padding: 4,
    backgroundColor: '#f5f5f5',
    borderRadius: 4,
  },
  moveButtonDisabled: {
    opacity: 0.4,
  },
  actionButtonRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  actionButtonExport: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#4caf50',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  actionButtonTextExport: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  actionButtonEdit: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#1976d2',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  actionButtonTextEdit: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  actionButtonDelete: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f44336',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
  },
  itemCount: {
    fontSize: 14,
    color: '#666',
    marginBottom: 12,
  },
  itemsList: {
    gap: 4,
  },
  itemPreview: {
    fontSize: 14,
    color: '#333',
  },
  moreItems: {
    fontSize: 14,
    color: '#1976d2',
    fontStyle: 'italic',
    marginTop: 4,
  },
  limitHint: {
    fontSize: 12,
    color: '#f57c00',
    textAlign: 'center',
    marginTop: 8,
    fontWeight: '500',
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
    padding: 20,
    maxHeight: '90%',
  },
  modalScrollView: {
    flexGrow: 0,
  },
  keyboardSpacer: {
    height: 40,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
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
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  textArea: {
    height: 200,
    textAlignVertical: 'top',
  },
  createButton: {
    backgroundColor: '#1976d2',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  createButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});

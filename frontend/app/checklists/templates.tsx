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
import * as FileSystem from 'expo-file-system';
import { copyAsync, deleteAsync } from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import * as Print from 'expo-print';
import { Share } from 'react-native';

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
      setTemplates(data);
    } catch (error) {
      console.error('Error loading templates:', error);
    }
  };

  // Export a single template
  const exportTemplate = async (template: ChecklistTemplate) => {
    setIsExporting(true);
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

      const jsonString = JSON.stringify(exportData, null, 2);
      const safeName = template.name.replace(/[^a-zA-Z0-9äöüÄÖÜß]/g, '_');
      
      // Use Print to create a temporary file with JSON content
      const htmlContent = `<!DOCTYPE html><html><body><pre>${jsonString}</pre></body></html>`;
      
      const { uri } = await Print.printToFileAsync({
        html: htmlContent,
        base64: false,
      });
      
      // Copy to new location with correct extension
      const directory = uri.substring(0, uri.lastIndexOf('/') + 1);
      const newUri = `${directory}${safeName}.checklistvorlage`;
      
      await FileSystem.copyAsync({
        from: uri,
        to: newUri,
      });
      
      // Delete the original PDF
      await FileSystem.deleteAsync(uri, { idempotent: true });

      // Share the file
      await Sharing.shareAsync(newUri, {
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
        Alert.alert('Fehler', 'Vorlage konnte nicht exportiert werden');
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
        Alert.alert('Fehler', 'Bitte wählen Sie eine .checklistvorlage Datei aus');
        setIsImporting(false);
        return;
      }

      const fileContent = await FileSystem.readAsStringAsync(file.uri);
      
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
          throw new Error('Keine gültigen Daten gefunden');
        }
      }

      // Validate import data
      if (importData.type !== 'aufmass_checklist_template' || !importData.template) {
        Alert.alert('Fehler', 'Ungültiges Dateiformat');
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
      });

      await loadTemplates();
      Alert.alert('Erfolg', `Vorlage "${finalName}" wurde importiert`);
    } catch (error) {
      console.error('Error importing template:', error);
      Alert.alert('Fehler', 'Vorlage konnte nicht importiert werden');
    } finally {
      setIsImporting(false);
    }
  };

  const createTemplate = async () => {
    if (!newTemplateName.trim() || !newTemplateItems.trim()) {
      Alert.alert('Fehler', 'Bitte füllen Sie alle Felder aus');
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
      Alert.alert('Erfolg', 'Vorlage wurde erstellt');
    } catch (error) {
      console.error('Error creating template:', error);
      Alert.alert('Fehler', 'Vorlage konnte nicht erstellt werden');
    }
  };

  const deleteTemplate = async (templateId: string) => {
    Alert.alert(
      'Vorlage löschen',
      'Möchten Sie diese Vorlage wirklich löschen?',
      [
        { text: 'Abbrechen', style: 'cancel' },
        {
          text: 'Löschen',
          style: 'destructive',
          onPress: async () => {
            try {
              await ChecklistTemplateService.delete(templateId);
              loadTemplates();
            } catch (error) {
              console.error('Error deleting template:', error);
              Alert.alert('Fehler', 'Vorlage konnte nicht gelöscht werden');
            }
          },
        },
      ]
    );
  };

  const renderTemplate = ({ item }: { item: ChecklistTemplate }) => (
    <View style={styles.templateCard}>
      <View style={styles.templateHeader}>
        <Ionicons name="list" size={24} color="#1976d2" />
        <Text style={styles.templateName}>{item.name}</Text>
        <TouchableOpacity 
          onPress={() => exportTemplate(item)}
          style={styles.actionButton}
          disabled={isExporting}
        >
          <Ionicons name="share-outline" size={20} color="#4caf50" />
        </TouchableOpacity>
        <TouchableOpacity 
          onPress={() => router.push(`/checklists/edit-template?templateId=${item.id}`)}
          style={styles.actionButton}
        >
          <Ionicons name="create-outline" size={20} color="#1976d2" />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => deleteTemplate(item.id)}>
          <Ionicons name="trash-outline" size={20} color="#f44336" />
        </TouchableOpacity>
      </View>
      <Text style={styles.itemCount}>{item.items.length} Punkte</Text>
      <View style={styles.itemsList}>
        {item.items.slice(0, 3).map((itm, index) => (
          <Text key={index} style={styles.itemPreview}>
            • {typeof itm === 'string' ? itm : itm.text}
          </Text>
        ))}
        {item.items.length > 3 && (
          <Text style={styles.moreItems}>+ {item.items.length - 3} weitere</Text>
        )}
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
              {isExporting ? 'Exportiere...' : 'Importiere...'}
            </Text>
          </View>
        </View>
      )}

      <View style={styles.header}>
        <Text style={styles.headerText}>
          Wählen Sie eine Vorlage für Ihr Projekt aus
        </Text>
        
        {/* Button Row */}
        <View style={styles.buttonRow}>
          <TouchableOpacity
            style={styles.addButton}
            onPress={() => setShowModal(true)}
          >
            <Ionicons name="add-circle" size={24} color="#1976d2" />
            <Text style={styles.addButtonText}>Neue Vorlage</Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={styles.importButton}
            onPress={importTemplate}
            disabled={isImporting}
          >
            <Ionicons name="download-outline" size={24} color="#4caf50" />
            <Text style={styles.importButtonText}>Importieren</Text>
          </TouchableOpacity>
        </View>
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
                <Text style={styles.modalTitle}>Neue Checklisten-Vorlage</Text>
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
                  <Text style={styles.label}>Vorlagen-Name</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="z.B. Dachsanierung"
                    value={newTemplateName}
                    onChangeText={setNewTemplateName}
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Punkte (ein Punkt pro Zeile)</Text>
                  <TextInput
                    style={[styles.input, styles.textArea]}
                    placeholder="Punkt 1\nPunkt 2\nPunkt 3"
                    value={newTemplateItems}
                    onChangeText={setNewTemplateItems}
                    multiline
                    numberOfLines={10}
                  />
                </View>

                <TouchableOpacity style={styles.createButton} onPress={createTemplate}>
                  <Text style={styles.createButtonText}>Vorlage erstellen</Text>
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
  actionButton: {
    padding: 4,
  },
  templateName: {
    flex: 1,
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
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

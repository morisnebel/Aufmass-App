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
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ChecklistTemplateService } from '../../services/LocalStorage';

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

  useEffect(() => {
    loadTemplates();
  }, []);

  const loadTemplates = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/checklist-templates`);
      setTemplates(response.data);
      
      // Add default templates if none exist
      if (response.data.length === 0) {
        for (const template of DEFAULT_TEMPLATES) {
          await axios.post(`${API_URL}/api/checklist-templates`, template);
        }
        loadTemplates();
      }
    } catch (error) {
      console.error('Error loading templates:', error);
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

      await axios.post(`${API_URL}/api/checklist-templates`, {
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
              await axios.delete(`${API_URL}/api/checklist-templates/${templateId}`);
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
          onPress={() => router.push(`/checklists/edit-template?templateId=${item.id}`)}
          style={styles.editButton}
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
      <View style={styles.header}>
        <Text style={styles.headerText}>
          Wählen Sie eine Vorlage für Ihr Projekt aus
        </Text>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => setShowModal(true)}
        >
          <Ionicons name="add-circle" size={24} color="#1976d2" />
          <Text style={styles.addButtonText}>Neue Vorlage</Text>
        </TouchableOpacity>
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
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Neue Checklisten-Vorlage</Text>
              <TouchableOpacity onPress={() => setShowModal(false)}>
                <Ionicons name="close" size={24} color="#333" />
              </TouchableOpacity>
            </View>

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
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
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
  addButton: {
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
  editButton: {
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
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    width: '90%',
    maxHeight: '80%',
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

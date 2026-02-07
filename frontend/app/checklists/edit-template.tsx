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
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import Constants from 'expo-constants';

const API_URL = Constants.expoConfig?.extra?.EXPO_PUBLIC_BACKEND_URL || process.env.EXPO_PUBLIC_BACKEND_URL;

interface SubItem {
  text: string;
}

interface TemplateItem {
  text: string;
  subItems: SubItem[];
}

interface ChecklistTemplate {
  id: string;
  name: string;
  items: (string | TemplateItem)[];
}

export default function EditTemplateScreen() {
  const router = useRouter();
  const { templateId } = useLocalSearchParams();
  const [template, setTemplate] = useState<ChecklistTemplate | null>(null);
  const [templateName, setTemplateName] = useState('');
  const [items, setItems] = useState<TemplateItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (templateId) {
      loadTemplate();
    } else {
      setLoading(false);
    }
  }, [templateId]);

  const loadTemplate = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/checklist-templates/${templateId}`);
      const data = response.data;
      setTemplate(data);
      setTemplateName(data.name);
      
      // Convert items to new format
      const convertedItems: TemplateItem[] = data.items.map((item: string | TemplateItem) => {
        if (typeof item === 'string') {
          return { text: item, subItems: [] };
        }
        return {
          text: item.text || '',
          subItems: item.subItems || [],
        };
      });
      setItems(convertedItems);
    } catch (error) {
      console.error('Error loading template:', error);
      Alert.alert('Fehler', 'Vorlage konnte nicht geladen werden');
    } finally {
      setLoading(false);
    }
  };

  const addItem = () => {
    setItems([...items, { text: '', subItems: [] }]);
  };

  const updateItemText = (index: number, text: string) => {
    const newItems = [...items];
    newItems[index].text = text;
    setItems(newItems);
  };

  const removeItem = (index: number) => {
    const newItems = items.filter((_, i) => i !== index);
    setItems(newItems);
  };

  const addSubItem = (itemIndex: number) => {
    const newItems = [...items];
    newItems[itemIndex].subItems.push({ text: '' });
    setItems(newItems);
  };

  const updateSubItemText = (itemIndex: number, subIndex: number, text: string) => {
    const newItems = [...items];
    newItems[itemIndex].subItems[subIndex].text = text;
    setItems(newItems);
  };

  const removeSubItem = (itemIndex: number, subIndex: number) => {
    const newItems = [...items];
    newItems[itemIndex].subItems = newItems[itemIndex].subItems.filter((_, i) => i !== subIndex);
    setItems(newItems);
  };

  const saveTemplate = async () => {
    if (!templateName.trim()) {
      Alert.alert('Fehler', 'Bitte geben Sie einen Namen ein');
      return;
    }

    const validItems = items.filter(item => item.text.trim());
    if (validItems.length === 0) {
      Alert.alert('Fehler', 'Bitte fügen Sie mindestens einen Punkt hinzu');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: templateName,
        items: validItems.map(item => ({
          text: item.text.trim(),
          subItems: item.subItems.filter(sub => sub.text.trim()).map(sub => sub.text.trim()),
        })),
      };

      if (templateId) {
        await axios.put(`${API_URL}/api/checklist-templates/${templateId}`, payload);
        Alert.alert('Erfolg', 'Vorlage wurde aktualisiert', [
          { text: 'OK', onPress: () => router.back() },
        ]);
      } else {
        await axios.post(`${API_URL}/api/checklist-templates`, payload);
        Alert.alert('Erfolg', 'Vorlage wurde erstellt', [
          { text: 'OK', onPress: () => router.back() },
        ]);
      }
    } catch (error) {
      console.error('Error saving template:', error);
      Alert.alert('Fehler', 'Vorlage konnte nicht gespeichert werden');
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
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Vorlagen-Name</Text>
            <TextInput
              style={styles.input}
              placeholder="z.B. Dachinspektion"
              value={templateName}
              onChangeText={setTemplateName}
            />
          </View>

          <View style={styles.itemsSection}>
            <Text style={styles.sectionTitle}>Checklisten-Punkte</Text>
            
            {items.map((item, itemIndex) => (
              <View key={itemIndex} style={styles.itemContainer}>
                <View style={styles.itemHeader}>
                  <TextInput
                    style={styles.itemInput}
                    placeholder={`Punkt ${itemIndex + 1}`}
                    value={item.text}
                    onChangeText={(text) => updateItemText(itemIndex, text)}
                  />
                  <TouchableOpacity
                    style={styles.removeButton}
                    onPress={() => removeItem(itemIndex)}
                  >
                    <Ionicons name="trash-outline" size={20} color="#f44336" />
                  </TouchableOpacity>
                </View>

                {/* Sub-Items */}
                <View style={styles.subItemsContainer}>
                  {item.subItems.map((subItem, subIndex) => (
                    <View key={subIndex} style={styles.subItemRow}>
                      <View style={styles.subItemConnector} />
                      <TextInput
                        style={styles.subItemInput}
                        placeholder={`Unter-Punkt ${subIndex + 1}`}
                        value={subItem.text}
                        onChangeText={(text) => updateSubItemText(itemIndex, subIndex, text)}
                      />
                      <TouchableOpacity
                        style={styles.removeSubButton}
                        onPress={() => removeSubItem(itemIndex, subIndex)}
                      >
                        <Ionicons name="close-circle" size={20} color="#999" />
                      </TouchableOpacity>
                    </View>
                  ))}
                  
                  <TouchableOpacity
                    style={styles.addSubItemButton}
                    onPress={() => addSubItem(itemIndex)}
                  >
                    <Ionicons name="add" size={18} color="#1976d2" />
                    <Text style={styles.addSubItemText}>Unter-Punkt hinzufügen</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}

            <TouchableOpacity style={styles.addItemButton} onPress={addItem}>
              <Ionicons name="add-circle" size={24} color="#1976d2" />
              <Text style={styles.addItemText}>Neuen Punkt hinzufügen</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.saveButton, saving && styles.buttonDisabled]}
          onPress={saveTemplate}
          disabled={saving}
        >
          <Ionicons name="checkmark-circle" size={24} color="#fff" />
          <Text style={styles.saveButtonText}>
            {saving ? 'Wird gespeichert...' : 'Vorlage speichern'}
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
  inputGroup: {
    marginBottom: 20,
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
  itemsSection: {
    marginTop: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  itemContainer: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  itemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  itemInput: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
  },
  removeButton: {
    padding: 8,
  },
  subItemsContainer: {
    marginTop: 8,
    marginLeft: 16,
  },
  subItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  subItemConnector: {
    width: 16,
    height: 2,
    backgroundColor: '#ddd',
    marginRight: 8,
  },
  subItemInput: {
    flex: 1,
    backgroundColor: '#f0f7ff',
    borderRadius: 8,
    padding: 10,
    fontSize: 14,
  },
  removeSubButton: {
    padding: 4,
    marginLeft: 4,
  },
  addSubItemButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    gap: 4,
  },
  addSubItemText: {
    color: '#1976d2',
    fontSize: 14,
  },
  addItemButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    backgroundColor: '#e3f2fd',
    borderRadius: 12,
    gap: 8,
    marginTop: 8,
  },
  addItemText: {
    color: '#1976d2',
    fontSize: 16,
    fontWeight: '600',
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
});

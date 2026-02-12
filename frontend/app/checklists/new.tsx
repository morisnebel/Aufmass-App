import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import Constants from 'expo-constants';

const API_URL = Constants.expoConfig?.extra?.EXPO_PUBLIC_BACKEND_URL || process.env.EXPO_PUBLIC_BACKEND_URL;

interface TemplateItem {
  text: string;
  subItems?: string[];
}

interface ChecklistTemplate {
  id: string;
  name: string;
  items: (string | TemplateItem)[];
}

interface SubItem {
  text: string;
  checked: boolean;
}

interface ChecklistItem {
  text: string;
  checked: boolean;
  note?: string;
  subItems?: SubItem[];
}

export default function NewChecklistScreen() {
  const router = useRouter();
  const { projectId } = useLocalSearchParams();
  const [templates, setTemplates] = useState<ChecklistTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<ChecklistTemplate | null>(null);
  const [checklistItems, setChecklistItems] = useState<ChecklistItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadTemplates();
  }, []);

  const loadTemplates = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/checklist-templates`);
      setTemplates(response.data);
    } catch (error) {
      console.error('Error loading templates:', error);
      Alert.alert('Fehler', 'Vorlagen konnten nicht geladen werden');
    } finally {
      setLoading(false);
    }
  };

  // Rekursive Funktion zum Konvertieren von Template-Items
  const convertTemplateItem = (item: any): ChecklistItem => {
    if (typeof item === 'string') {
      return {
        text: item,
        checked: false,
        note: '',
        subItems: [],
      };
    }
    
    const subItems: SubItem[] = (item.subItems || []).map((subItem: any) => {
      if (typeof subItem === 'string') {
        return {
          text: subItem,
          checked: false,
          subItems: [],
        };
      }
      // Rekursiv konvertieren für tiefere Ebenen
      return {
        text: subItem.text || '',
        checked: false,
        subItems: (subItem.subItems || []).map((deepSub: any) => convertTemplateItem(deepSub)),
      };
    });
    
    return {
      text: item.text,
      checked: false,
      note: '',
      subItems: subItems,
    };
  };

  const selectTemplate = (template: ChecklistTemplate) => {
    setSelectedTemplate(template);
    setChecklistItems(template.items.map((item) => convertTemplateItem(item)));
  };

  const toggleItem = (index: number) => {
    const newItems = [...checklistItems];
    newItems[index].checked = !newItems[index].checked;
    setChecklistItems(newItems);
  };

  const toggleSubItem = (itemIndex: number, subIndex: number) => {
    const newItems = [...checklistItems];
    if (newItems[itemIndex].subItems && newItems[itemIndex].subItems![subIndex]) {
      newItems[itemIndex].subItems![subIndex].checked = !newItems[itemIndex].subItems![subIndex].checked;
      setChecklistItems(newItems);
    }
  };

  // Berechne Gesamtfortschritt inkl. Unterpositionen
  const calculateProgress = () => {
    let totalItems = 0;
    let checkedItems = 0;
    
    checklistItems.forEach(item => {
      if (item.subItems && item.subItems.length > 0) {
        // Wenn es Unterpositionen gibt, zählen nur diese
        totalItems += item.subItems.length;
        checkedItems += item.subItems.filter(sub => sub.checked).length;
      } else {
        // Sonst zählt der Hauptpunkt
        totalItems += 1;
        if (item.checked) checkedItems += 1;
      }
    });
    
    return { totalItems, checkedItems };
  };

  const saveChecklist = async () => {
    if (!selectedTemplate) {
      Alert.alert('Fehler', 'Bitte wählen Sie eine Vorlage aus');
      return;
    }

    try {
      await axios.post(`${API_URL}/api/checklists`, {
        project_id: projectId,
        template_id: selectedTemplate.id,
        template_name: selectedTemplate.name,
        items: checklistItems,
      });

      Alert.alert('Erfolg', 'Checkliste wurde erstellt', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (error) {
      console.error('Error saving checklist:', error);
      Alert.alert('Fehler', 'Checkliste konnte nicht gespeichert werden');
    }
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#1976d2" />
      </View>
    );
  }

  if (templates.length === 0) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.emptyText}>Keine Vorlagen vorhanden</Text>
        <TouchableOpacity
          style={styles.button}
          onPress={() => router.push('/checklists/templates')}
        >
          <Text style={styles.buttonText}>Vorlagen erstellen</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!selectedTemplate) {
    return (
      <ScrollView style={styles.container}>
        <View style={styles.content}>
          <Text style={styles.title}>Wählen Sie eine Vorlage</Text>
          {templates.map((template) => (
            <TouchableOpacity
              key={template.id}
              style={styles.templateCard}
              onPress={() => selectTemplate(template)}
            >
              <View style={styles.templateHeader}>
                <Ionicons name="list" size={24} color="#1976d2" />
                <Text style={styles.templateName}>{template.name}</Text>
                <Ionicons name="chevron-forward" size={24} color="#666" />
              </View>
              <Text style={styles.itemCount}>{template.items.length} Punkte</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => setSelectedTemplate(null)}
        >
          <Ionicons name="arrow-back" size={24} color="#1976d2" />
          <Text style={styles.backText}>Andere Vorlage</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{selectedTemplate.name}</Text>
      </View>

      <ScrollView style={styles.checklistContainer}>
        <View style={styles.checklistContent}>
          {checklistItems.map((item, index) => (
            <View key={index} style={styles.checklistItemContainer}>
              {/* Hauptpunkt */}
              <TouchableOpacity
                style={[
                  styles.checklistItem,
                  item.subItems && item.subItems.length > 0 && styles.checklistItemWithSubs
                ]}
                onPress={() => toggleItem(index)}
              >
                <Ionicons
                  name={item.checked ? 'checkbox' : 'square-outline'}
                  size={28}
                  color={item.checked ? '#4caf50' : '#666'}
                />
                <Text
                  style={[
                    styles.checklistText,
                    item.checked && styles.checklistTextChecked,
                  ]}
                >
                  {item.text}
                </Text>
              </TouchableOpacity>
              
              {/* Unterpositionen anzeigen */}
              {item.subItems && item.subItems.length > 0 && (
                <View style={styles.subItemsContainer}>
                  {item.subItems.map((subItem, subIndex) => (
                    <TouchableOpacity
                      key={subIndex}
                      style={styles.subChecklistItem}
                      onPress={() => toggleSubItem(index, subIndex)}
                    >
                      <Ionicons
                        name={subItem.checked ? 'checkbox' : 'square-outline'}
                        size={22}
                        color={subItem.checked ? '#4caf50' : '#999'}
                      />
                      <Text
                        style={[
                          styles.subChecklistText,
                          subItem.checked && styles.subChecklistTextChecked,
                        ]}
                      >
                        {subItem.text}
                      </Text>
                    </TouchableOpacity>
                  ))}
                  
                  {/* Fortschrittsanzeige für Unterpositionen */}
                  <View style={styles.subProgressContainer}>
                    <View style={styles.subProgressBar}>
                      <View
                        style={[
                          styles.subProgressFill,
                          {
                            width: `${(item.subItems.filter(s => s.checked).length / item.subItems.length) * 100}%`,
                          },
                        ]}
                      />
                    </View>
                    <Text style={styles.subProgressText}>
                      {item.subItems.filter(s => s.checked).length}/{item.subItems.length}
                    </Text>
                  </View>
                </View>
              )}
            </View>
          ))}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <View style={styles.progressBar}>
          <View
            style={[
              styles.progressFill,
              {
                width: `${(checklistItems.filter((i) => i.checked).length /
                  checklistItems.length) *
                  100}%`,
              },
            ]}
          />
        </View>
        <Text style={styles.progressText}>
          {checklistItems.filter((i) => i.checked).length} von{' '}
          {checklistItems.length} erledigt
        </Text>
        <TouchableOpacity style={styles.saveButton} onPress={saveChecklist}>
          <Text style={styles.saveButtonText}>Checkliste speichern</Text>
        </TouchableOpacity>
      </View>
    </View>
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
  content: {
    padding: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 16,
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
  itemCount: {
    fontSize: 14,
    color: '#666',
  },
  header: {
    backgroundColor: '#fff',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  backText: {
    fontSize: 16,
    color: '#1976d2',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  checklistContainer: {
    flex: 1,
  },
  checklistContent: {
    padding: 16,
  },
  checklistItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  checklistText: {
    flex: 1,
    fontSize: 16,
    color: '#333',
  },
  checklistTextChecked: {
    color: '#4caf50',
    fontWeight: '600',
  },
  footer: {
    backgroundColor: '#fff',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  progressBar: {
    height: 8,
    backgroundColor: '#e0e0e0',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#4caf50',
  },
  progressText: {
    fontSize: 14,
    color: '#666',
    marginBottom: 12,
    textAlign: 'center',
  },
  saveButton: {
    backgroundColor: '#1976d2',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  button: {
    backgroundColor: '#1976d2',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 16,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  emptyText: {
    fontSize: 18,
    color: '#666',
  },
  // Styles für Unterpositionen
  checklistItemContainer: {
    marginBottom: 12,
  },
  checklistItemWithSubs: {
    marginBottom: 4,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
  },
  subItemsContainer: {
    backgroundColor: '#f9f9f9',
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: 12,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
    marginTop: -4,
    borderWidth: 1,
    borderTopWidth: 0,
    borderColor: '#e8e8e8',
  },
  subChecklistItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingLeft: 28,
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  subChecklistText: {
    flex: 1,
    fontSize: 14,
    color: '#555',
  },
  subChecklistTextChecked: {
    color: '#4caf50',
    fontWeight: '500',
  },
  subProgressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    paddingLeft: 28,
    gap: 10,
  },
  subProgressBar: {
    flex: 1,
    height: 6,
    backgroundColor: '#e0e0e0',
    borderRadius: 3,
    overflow: 'hidden',
  },
  subProgressFill: {
    height: '100%',
    backgroundColor: '#66bb6a',
  },
  subProgressText: {
    fontSize: 12,
    color: '#888',
    minWidth: 35,
    textAlign: 'right',
  },
});

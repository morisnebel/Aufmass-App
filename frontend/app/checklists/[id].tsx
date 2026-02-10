import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  TextInput,
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
  checked: boolean;
}

interface ChecklistItem {
  text: string;
  checked: boolean;
  note?: string;
  subItems?: SubItem[];
}

interface Checklist {
  id: string;
  project_id: string;
  template_id: string;
  template_name: string;
  items: ChecklistItem[];
}

export default function EditChecklistScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const [checklist, setChecklist] = useState<Checklist | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [expandedItems, setExpandedItems] = useState<Set<number>>(new Set());

  useEffect(() => {
    loadChecklist();
  }, [id]);

  const loadChecklist = async () => {
    try {
      const projectsRes = await axios.get(`${API_URL}/api/projects`);
      let foundChecklist = null;
      
      for (const project of projectsRes.data) {
        const checklistsRes = await axios.get(`${API_URL}/api/checklists/project/${project.id}`);
        const checklist = checklistsRes.data.find((c: any) => c.id === id);
        if (checklist) {
          foundChecklist = checklist;
          break;
        }
      }
      
      if (foundChecklist) {
        // Initialize subItems and note if not present, handle different formats
        const items = foundChecklist.items.map((item: any) => {
          // Convert subItems to correct format
          let subItems: SubItem[] = [];
          if (item.subItems && Array.isArray(item.subItems)) {
            subItems = item.subItems.map((sub: string | SubItem) => {
              if (typeof sub === 'string') {
                return { text: sub, checked: false };
              }
              return { text: sub.text || '', checked: sub.checked || false };
            });
          }
          return {
            text: item.text || '',
            checked: item.checked || false,
            note: item.note || '',
            subItems: subItems,
          };
        });
        setChecklist({ ...foundChecklist, items });
        
        // Expand items that are checked
        const expanded = new Set<number>();
        items.forEach((item: ChecklistItem, index: number) => {
          if (item.checked) {
            expanded.add(index);
          }
        });
        setExpandedItems(expanded);
      } else {
        Alert.alert('Fehler', 'Checkliste wurde nicht gefunden');
      }
    } catch (error) {
      console.error('Error loading checklist:', error);
      Alert.alert('Fehler', 'Checkliste konnte nicht geladen werden');
    } finally {
      setLoading(false);
    }
  };

  const toggleItem = (index: number) => {
    if (!checklist) return;
    
    const newItems = [...checklist.items];
    newItems[index].checked = !newItems[index].checked;
    setChecklist({ ...checklist, items: newItems });
    
    // Toggle expanded state
    const newExpanded = new Set(expandedItems);
    if (newItems[index].checked) {
      newExpanded.add(index);
    } else {
      newExpanded.delete(index);
    }
    setExpandedItems(newExpanded);
  };

  const toggleSubItem = (itemIndex: number, subIndex: number) => {
    if (!checklist) return;
    
    const newItems = [...checklist.items];
    if (newItems[itemIndex].subItems) {
      newItems[itemIndex].subItems![subIndex].checked = !newItems[itemIndex].subItems![subIndex].checked;
      setChecklist({ ...checklist, items: newItems });
    }
  };

  const updateNote = (index: number, note: string) => {
    if (!checklist) return;
    
    const newItems = [...checklist.items];
    newItems[index].note = note;
    setChecklist({ ...checklist, items: newItems });
  };

  const toggleExpand = (index: number) => {
    const newExpanded = new Set(expandedItems);
    if (newExpanded.has(index)) {
      newExpanded.delete(index);
    } else {
      newExpanded.add(index);
    }
    setExpandedItems(newExpanded);
  };

  const handleSave = async () => {
    if (!checklist) return;

    setSaving(true);
    try {
      await axios.put(`${API_URL}/api/checklists/${checklist.id}`, checklist);
      Alert.alert('Erfolg', 'Checkliste wurde aktualisiert', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (error) {
      console.error('Error saving checklist:', error);
      Alert.alert('Fehler', 'Checkliste konnte nicht gespeichert werden');
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

  if (!checklist) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.emptyText}>Checkliste nicht gefunden</Text>
      </View>
    );
  }

  const completedCount = checklist.items.filter(item => item.checked).length;
  const totalCount = checklist.items.length;
  const progress = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

  return (
    <KeyboardAvoidingView 
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{checklist.template_name}</Text>
        <View style={styles.progressBar}>
          <View
            style={[
              styles.progressFill,
              { width: `${progress}%` },
            ]}
          />
        </View>
        <Text style={styles.progressText}>
          {completedCount} von {totalCount} erledigt ({Math.round(progress)}%)
        </Text>
      </View>

      <ScrollView style={styles.checklistContainer}>
        <View style={styles.checklistContent}>
          {checklist.items.map((item, index) => {
            const isExpanded = expandedItems.has(index);
            const hasSubItems = item.subItems && item.subItems.length > 0;
            
            return (
              <View key={index} style={styles.itemWrapper}>
                {/* Main Item */}
                <TouchableOpacity
                  style={[
                    styles.checklistItem,
                    item.checked && styles.checklistItemChecked,
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
                  {/* Show expand button if has subItems OR is checked (for note field) */}
                  {hasSubItems && (
                    <TouchableOpacity
                      onPress={() => toggleExpand(index)}
                      style={styles.expandButton}
                    >
                      <Ionicons
                        name={isExpanded ? 'chevron-up' : 'chevron-down'}
                        size={24}
                        color="#1976d2"
                      />
                    </TouchableOpacity>
                  )}
                </TouchableOpacity>

                {/* Expanded Content - Sub Items & Note */}
                {isExpanded && (
                  <View style={styles.expandedContent}>
                    {/* Sub Items */}
                    {hasSubItems && (
                      <View style={styles.subItemsContainer}>
                        {item.subItems!.map((subItem, subIndex) => (
                          <TouchableOpacity
                            key={subIndex}
                            style={styles.subItem}
                            onPress={() => toggleSubItem(index, subIndex)}
                          >
                            <View style={styles.subItemConnector}>
                              <View style={styles.connectorLine} />
                            </View>
                            <Ionicons
                              name={subItem.checked ? 'checkbox' : 'square-outline'}
                              size={22}
                              color={subItem.checked ? '#4caf50' : '#999'}
                            />
                            <Text
                              style={[
                                styles.subItemText,
                                subItem.checked && styles.subItemTextChecked,
                              ]}
                            >
                              {subItem.text}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}

                    {/* Note Field */}
                    <View style={styles.noteContainer}>
                      <View style={styles.noteHeader}>
                        <Ionicons name="create-outline" size={18} color="#666" />
                        <Text style={styles.noteLabel}>Notiz</Text>
                      </View>
                      <TextInput
                        style={styles.noteInput}
                        placeholder="Notiz hinzufügen..."
                        value={item.note || ''}
                        onChangeText={(text) => updateNote(index, text)}
                        multiline
                        numberOfLines={3}
                      />
                    </View>
                  </View>
                )}
              </View>
            );
          })}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.saveButton, saving && styles.buttonDisabled]}
          onPress={handleSave}
          disabled={saving}
        >
          <Ionicons name="checkmark-circle" size={24} color="#fff" />
          <Text style={styles.saveButtonText}>
            {saving ? 'Wird gespeichert...' : 'Änderungen speichern'}
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
    padding: 32,
  },
  header: {
    backgroundColor: '#fff',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 16,
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
    textAlign: 'center',
  },
  checklistContainer: {
    flex: 1,
  },
  checklistContent: {
    padding: 16,
  },
  itemWrapper: {
    marginBottom: 12,
  },
  checklistItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  checklistItemChecked: {
    backgroundColor: '#f8fff8',
    borderWidth: 1,
    borderColor: '#4caf50',
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
  expandButton: {
    padding: 4,
  },
  expandedContent: {
    marginTop: 8,
    marginLeft: 16,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    borderLeftWidth: 3,
    borderLeftColor: '#1976d2',
  },
  subItemsContainer: {
    marginBottom: 12,
  },
  subItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    gap: 8,
  },
  subItemConnector: {
    width: 16,
    alignItems: 'center',
  },
  connectorLine: {
    width: 12,
    height: 2,
    backgroundColor: '#ddd',
  },
  subItemText: {
    flex: 1,
    fontSize: 14,
    color: '#666',
  },
  subItemTextChecked: {
    color: '#4caf50',
    fontWeight: '500',
  },
  noteContainer: {
    borderTopWidth: 1,
    borderTopColor: '#eee',
    paddingTop: 12,
  },
  noteHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  noteLabel: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  noteInput: {
    backgroundColor: '#f9f9f9',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    minHeight: 60,
    textAlignVertical: 'top',
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
  emptyText: {
    fontSize: 18,
    color: '#666',
  },
});

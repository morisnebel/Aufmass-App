import React, { useState, useEffect, useCallback } from 'react';
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
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import Constants from 'expo-constants';

const API_URL = Constants.expoConfig?.extra?.EXPO_PUBLIC_BACKEND_URL || process.env.EXPO_PUBLIC_BACKEND_URL;

// Rekursive Struktur für verschachtelte Unterpunkte
interface RecursiveItem {
  text: string;
  checked: boolean;
  note?: string;
  subItems?: RecursiveItem[];
}

interface Checklist {
  id: string;
  project_id: string;
  template_id: string;
  template_name: string;
  items: RecursiveItem[];
}

export default function EditChecklistScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const [checklist, setChecklist] = useState<Checklist | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  // State für neue Unterpunkt-Eingaben (path -> text)
  const [newSubItemTexts, setNewSubItemTexts] = useState<{[key: string]: string}>({});
  // State um zu tracken welche Eingabefelder offen sind
  const [openInputs, setOpenInputs] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadChecklist();
  }, [id]);

  // Auto-Save wenn die Seite verlassen wird
  useFocusEffect(
    useCallback(() => {
      return () => {
        // Wird aufgerufen wenn die Seite verlassen wird
        if (hasChanges && checklist) {
          saveChecklistSilent();
        }
      };
    }, [hasChanges, checklist])
  );

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
        // Konvertiere Items zu rekursiver Struktur
        const convertItems = (items: any[]): RecursiveItem[] => {
          return items.map((item: any) => {
            let subItems: RecursiveItem[] = [];
            if (item.subItems && Array.isArray(item.subItems)) {
              subItems = item.subItems.map((sub: any) => {
                if (typeof sub === 'string') {
                  return { text: sub, checked: false, subItems: [] };
                }
                return {
                  text: sub.text || '',
                  checked: sub.checked || false,
                  note: sub.note || '',
                  subItems: sub.subItems ? convertItems(sub.subItems) : [],
                };
              });
            }
            return {
              text: item.text || '',
              checked: item.checked || false,
              note: item.note || '',
              subItems: subItems,
            };
          });
        };
        
        setChecklist({
          ...foundChecklist,
          items: convertItems(foundChecklist.items),
        });
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

  // Rekursiv einen Item an einem Pfad updaten
  const updateItemAtPath = (items: RecursiveItem[], path: number[], updates: Partial<RecursiveItem>): RecursiveItem[] => {
    const newItems = [...items];
    if (path.length === 1) {
      newItems[path[0]] = { ...newItems[path[0]], ...updates };
    } else {
      const [first, ...rest] = path;
      newItems[first] = {
        ...newItems[first],
        subItems: updateItemAtPath(newItems[first].subItems || [], rest, updates),
      };
    }
    return newItems;
  };

  // Toggle checked status und automatisch aufklappen
  const toggleItemChecked = (path: number[]) => {
    if (!checklist) return;
    
    const getItemAtPath = (items: RecursiveItem[], path: number[]): RecursiveItem | null => {
      if (path.length === 0) return null;
      if (path.length === 1) return items[path[0]];
      const [first, ...rest] = path;
      return getItemAtPath(items[first].subItems || [], rest);
    };
    
    const item = getItemAtPath(checklist.items, path);
    if (!item) return;
    
    const newChecked = !item.checked;
    const newItems = updateItemAtPath(checklist.items, path, { checked: newChecked });
    
    setChecklist({ ...checklist, items: newItems });
    setHasChanges(true);
  };

  // Notiz updaten
  const updateNote = (path: number[], note: string) => {
    if (!checklist) return;
    const newItems = updateItemAtPath(checklist.items, path, { note });
    setChecklist({ ...checklist, items: newItems });
    setHasChanges(true);
  };

  // Neuen Unterpunkt hinzufügen
  const addSubItem = (path: number[]) => {
    if (!checklist) return;
    
    const getItemAtPath = (items: RecursiveItem[], path: number[]): RecursiveItem | null => {
      if (path.length === 0) return null;
      if (path.length === 1) return items[path[0]];
      const [first, ...rest] = path;
      return getItemAtPath(items[first].subItems || [], rest);
    };
    
    const item = getItemAtPath(checklist.items, path);
    if (!item) return;
    
    // Öffne das Eingabefeld für diesen Pfad
    const pathKey = path.join('-');
    setOpenInputs(prev => new Set(prev).add(pathKey));
    setNewSubItemTexts(prev => ({ ...prev, [pathKey]: '' }));
  };

  // Neuen Unterpunkt bestätigen und hinzufügen
  const confirmNewSubItem = (path: number[]) => {
    if (!checklist) return;
    
    const pathKey = path.join('-');
    const text = newSubItemTexts[pathKey]?.trim();
    
    if (!text) {
      // Eingabefeld schließen wenn leer
      setOpenInputs(prev => {
        const newSet = new Set(prev);
        newSet.delete(pathKey);
        return newSet;
      });
      return;
    }
    
    const getItemAtPath = (items: RecursiveItem[], path: number[]): RecursiveItem | null => {
      if (path.length === 0) return null;
      if (path.length === 1) return items[path[0]];
      const [first, ...rest] = path;
      return getItemAtPath(items[first].subItems || [], rest);
    };
    
    const item = getItemAtPath(checklist.items, path);
    if (!item) return;
    
    const newSubItems = [...(item.subItems || []), { text, checked: false, subItems: [] }];
    const newItems = updateItemAtPath(checklist.items, path, { subItems: newSubItems });
    
    setChecklist({ ...checklist, items: newItems });
    setHasChanges(true);
    
    // Eingabefeld leeren aber offen lassen für weitere Eingaben
    setNewSubItemTexts(prev => ({ ...prev, [pathKey]: '' }));
  };

  // Eingabefeld schließen
  const cancelNewSubItem = (path: number[]) => {
    const pathKey = path.join('-');
    setOpenInputs(prev => {
      const newSet = new Set(prev);
      newSet.delete(pathKey);
      return newSet;
    });
    setNewSubItemTexts(prev => {
      const newTexts = { ...prev };
      delete newTexts[pathKey];
      return newTexts;
    });
  };

  // Unterpunkt-Text updaten
  const updateSubItemText = (path: number[], text: string) => {
    if (!checklist) return;
    const newItems = updateItemAtPath(checklist.items, path, { text });
    setChecklist({ ...checklist, items: newItems });
    setHasChanges(true);
  };

  // Unterpunkt löschen
  const removeSubItem = (parentPath: number[], subIndex: number) => {
    if (!checklist) return;
    
    const getItemAtPath = (items: RecursiveItem[], path: number[]): RecursiveItem | null => {
      if (path.length === 0) return null;
      if (path.length === 1) return items[path[0]];
      const [first, ...rest] = path;
      return getItemAtPath(items[first].subItems || [], rest);
    };
    
    const parentItem = getItemAtPath(checklist.items, parentPath);
    if (!parentItem || !parentItem.subItems) return;
    
    const newSubItems = parentItem.subItems.filter((_, i) => i !== subIndex);
    const newItems = updateItemAtPath(checklist.items, parentPath, { subItems: newSubItems });
    
    setChecklist({ ...checklist, items: newItems });
    setHasChanges(true);
  };

  // Stilles Speichern (ohne Alert)
  const saveChecklistSilent = async () => {
    if (!checklist || saving) return;
    try {
      await axios.put(`${API_URL}/api/checklists/${checklist.id}`, checklist);
      setHasChanges(false);
    } catch (error) {
      console.error('Error auto-saving checklist:', error);
    }
  };

  // Manuelles Speichern mit Feedback
  const handleSave = async () => {
    if (!checklist) return;

    setSaving(true);
    try {
      await axios.put(`${API_URL}/api/checklists/${checklist.id}`, checklist);
      setHasChanges(false);
      Alert.alert('Erfolg', 'Checkliste wurde gespeichert', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (error) {
      console.error('Error saving checklist:', error);
      Alert.alert('Fehler', 'Checkliste konnte nicht gespeichert werden');
    } finally {
      setSaving(false);
    }
  };

  // Rekursive Render-Funktion für Items
  const renderItem = (item: RecursiveItem, path: number[], depth: number = 0) => {
    const hasSubItems = item.subItems && item.subItems.length > 0;
    const isMainItem = depth === 0;
    
    return (
      <View key={path.join('-')} style={[styles.itemWrapper, { marginLeft: depth * 16 }]}>
        {/* Item Header - ganze Zeile anklickbar */}
        <TouchableOpacity
          style={[
            styles.checklistItem,
            item.checked && styles.checklistItemChecked,
            !isMainItem && styles.subItemCard,
          ]}
          onPress={() => toggleItemChecked(path)}
          activeOpacity={0.7}
        >
          <Ionicons
            name={item.checked ? 'checkbox' : 'square-outline'}
            size={isMainItem ? 28 : 22}
            color={item.checked ? '#4caf50' : '#666'}
          />
          
          <View style={styles.itemContent}>
            <Text
              style={[
                isMainItem ? styles.checklistText : styles.subItemText,
                item.checked && (isMainItem ? styles.checklistTextChecked : styles.subItemTextChecked),
              ]}
            >
              {item.text}
            </Text>
            
            {/* Hinweis auf Unterpunkte wenn nicht abgehakt */}
            {hasSubItems && !item.checked && (
              <Text style={styles.subItemsHint}>
                {item.subItems!.length} Unterpunkt{item.subItems!.length !== 1 ? 'e' : ''}
              </Text>
            )}
          </View>
          
          {/* Pfeil-Icon zeigt an dass es aufklappbar ist */}
          {hasSubItems && (
            <Ionicons
              name={item.checked ? 'chevron-down' : 'chevron-forward'}
              size={20}
              color="#999"
            />
          )}
        </TouchableOpacity>

        {/* Expanded Content - nur wenn abgehakt */}
        {item.checked && (
          <View style={[styles.expandedContent, { marginLeft: 8 }]}>
            {/* Vorhandene Unterpunkte rekursiv rendern */}
            {hasSubItems && (
              <View style={styles.subItemsContainer}>
                {item.subItems!.map((subItem, subIndex) => (
                  <View key={subIndex}>
                    {subItem.text ? (
                      // Vorhandener Unterpunkt
                      renderItem(subItem, [...path, subIndex], depth + 1)
                    ) : (
                      // Neuer Unterpunkt (Eingabefeld)
                      <View style={[styles.newSubItemRow, { marginLeft: (depth + 1) * 16 }]}>
                        <View style={styles.subItemConnector}>
                          <View style={styles.connectorLine} />
                        </View>
                        <TextInput
                          style={styles.newSubItemInput}
                          placeholder="Neuen Unterpunkt eingeben..."
                          value={subItem.text}
                          onChangeText={(text) => updateSubItemText([...path, subIndex], text)}
                          autoFocus
                        />
                        <TouchableOpacity
                          onPress={() => removeSubItem(path, subIndex)}
                          style={styles.removeSubButton}
                        >
                          <Ionicons name="close-circle" size={20} color="#999" />
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                ))}
              </View>
            )}

            {/* Button zum Hinzufügen von Unterpunkten */}
            <TouchableOpacity
              style={styles.addSubItemButton}
              onPress={() => addSubItem(path)}
            >
              <Ionicons name="add" size={18} color="#1976d2" />
              <Text style={styles.addSubItemText}>Unterpunkt hinzufügen</Text>
            </TouchableOpacity>

            {/* Notiz-Feld nur für Hauptpunkte */}
            {isMainItem && (
              <View style={styles.noteContainer}>
                <View style={styles.noteHeader}>
                  <Ionicons name="create-outline" size={18} color="#666" />
                  <Text style={styles.noteLabel}>Notiz</Text>
                </View>
                <TextInput
                  style={styles.noteInput}
                  placeholder="Notiz hinzufügen..."
                  value={item.note || ''}
                  onChangeText={(text) => updateNote(path, text)}
                  multiline
                  numberOfLines={3}
                />
              </View>
            )}
          </View>
        )}
      </View>
    );
  };

  // Zähle alle abgehakten Items (rekursiv)
  const countChecked = (items: RecursiveItem[]): { checked: number; total: number } => {
    let checked = 0;
    let total = 0;
    
    items.forEach(item => {
      total++;
      if (item.checked) checked++;
      if (item.subItems && item.subItems.length > 0) {
        const subCount = countChecked(item.subItems);
        checked += subCount.checked;
        total += subCount.total;
      }
    });
    
    return { checked, total };
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

  const { checked: completedCount, total: totalCount } = countChecked(checklist.items);
  const progress = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

  return (
    <KeyboardAvoidingView 
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{checklist.template_name}</Text>
        {hasChanges && (
          <Text style={styles.unsavedHint}>Nicht gespeicherte Änderungen</Text>
        )}
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

      <ScrollView style={styles.checklistContainer} keyboardShouldPersistTaps="handled">
        <View style={styles.checklistContent}>
          {checklist.items.map((item, index) => renderItem(item, [index], 0))}
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
            {saving ? 'Wird gespeichert...' : 'Speichern & Zurück'}
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
    marginBottom: 8,
  },
  unsavedHint: {
    fontSize: 12,
    color: '#ff9800',
    marginBottom: 8,
    fontStyle: 'italic',
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
    padding: 12,
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
  subItemCard: {
    backgroundColor: '#fafafa',
    shadowOpacity: 0.05,
    elevation: 1,
  },
  itemContent: {
    flex: 1,
  },
  checklistText: {
    fontSize: 16,
    color: '#333',
  },
  checklistTextChecked: {
    color: '#4caf50',
    fontWeight: '600',
  },
  subItemText: {
    fontSize: 14,
    color: '#555',
  },
  subItemTextChecked: {
    color: '#4caf50',
    fontWeight: '500',
  },
  subItemsHint: {
    fontSize: 12,
    color: '#999',
    marginTop: 4,
    fontStyle: 'italic',
  },
  expandedContent: {
    marginTop: 8,
    paddingLeft: 8,
    borderLeftWidth: 2,
    borderLeftColor: '#4caf50',
  },
  subItemsContainer: {
    marginBottom: 8,
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
  newSubItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 8,
  },
  newSubItemInput: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    borderRadius: 6,
    padding: 10,
    fontSize: 14,
  },
  removeSubButton: {
    padding: 4,
    marginLeft: 8,
  },
  addSubItemButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: '#e3f2fd',
    borderRadius: 8,
    marginBottom: 12,
    gap: 6,
  },
  addSubItemText: {
    color: '#1976d2',
    fontSize: 14,
    fontWeight: '500',
  },
  noteContainer: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    marginTop: 4,
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

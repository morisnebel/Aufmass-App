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

interface ChecklistItem {
  text: string;
  checked: boolean;
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

  useEffect(() => {
    loadChecklist();
  }, [id]);

  const loadChecklist = async () => {
    try {
      // First try to get all projects to find which project has this checklist
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
        setChecklist(foundChecklist);
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
    <View style={styles.container}>
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
          {checklist.items.map((item, index) => (
            <TouchableOpacity
              key={index}
              style={styles.checklistItem}
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
          ))}
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
    textDecorationLine: 'line-through',
    color: '#999',
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

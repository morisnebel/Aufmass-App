import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
  Modal,
  FlatList,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import Constants from 'expo-constants';

const API_URL = Constants.expoConfig?.extra?.EXPO_PUBLIC_BACKEND_URL || process.env.EXPO_PUBLIC_BACKEND_URL;

const ROOF_TYPES = [
  'Satteldach',
  'Walmdach',
  'Flachdach',
  'Pultdach',
  'Zeltdach',
  'Mansarddach',
];

export default function EditRoofScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const [roofType, setRoofType] = useState('Satteldach');
  const [showRoofTypePicker, setShowRoofTypePicker] = useState(false);
  const [length, setLength] = useState('');
  const [width, setWidth] = useState('');
  const [height, setHeight] = useState('');
  const [angle, setAngle] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [projectId, setProjectId] = useState('');

  useEffect(() => {
    loadRoof();
  }, [id]);

  const loadRoof = async () => {
    try {
      // We need to get the roof through all project roofs since we don't have a direct endpoint
      const projectsRes = await axios.get(`${API_URL}/api/projects`);
      for (const project of projectsRes.data) {
        const roofsRes = await axios.get(`${API_URL}/api/roofs/project/${project.id}`);
        const roof = roofsRes.data.find((r: any) => r.id === id);
        if (roof) {
          setProjectId(project.id);
          setRoofType(roof.roof_type);
          setLength(roof.measurements.length.toString());
          setWidth(roof.measurements.width.toString());
          setHeight(roof.measurements.height?.toString() || '');
          setAngle(roof.measurements.angle?.toString() || '');
          setNotes(roof.notes || '');
          break;
        }
      }
    } catch (error) {
      console.error('Error loading roof:', error);
      Alert.alert('Fehler', 'Dachmessung konnte nicht geladen werden');
    } finally {
      setLoading(false);
    }
  };

  const calculateArea = () => {
    const l = parseFloat(length) || 0;
    const w = parseFloat(width) || 0;
    const h = parseFloat(height) || 0;
    const a = parseFloat(angle) || 0;

    let area = 0;

    switch (roofType) {
      case 'Flachdach':
        area = l * w;
        break;
      case 'Pultdach':
        if (a > 0) {
          const radian = (a * Math.PI) / 180;
          const hypotenuse = w / Math.cos(radian);
          area = l * hypotenuse;
        } else {
          area = l * w;
        }
        break;
      case 'Satteldach':
      case 'Walmdach':
      case 'Zeltdach':
      case 'Mansarddach':
        if (h > 0) {
          const hypotenuse = Math.sqrt((w / 2) ** 2 + h ** 2);
          area = l * hypotenuse * 2;
        } else if (a > 0) {
          const radian = (a * Math.PI) / 180;
          const hypotenuse = (w / 2) / Math.cos(radian);
          area = l * hypotenuse * 2;
        } else {
          area = l * w;
        }
        break;
      default:
        area = l * w;
    }

    return area;
  };

  const handleSave = async () => {
    if (!length || !width) {
      Alert.alert('Fehler', 'Bitte geben Sie mindestens Länge und Breite ein');
      return;
    }

    const area = calculateArea();

    setSaving(true);
    try {
      await axios.put(`${API_URL}/api/roofs/${id}`, {
        project_id: projectId,
        roof_type: roofType,
        measurements: {
          length: parseFloat(length),
          width: parseFloat(width),
          height: parseFloat(height) || 0,
          angle: parseFloat(angle) || 0,
        },
        area,
        notes: notes || undefined,
      });
      Alert.alert('Erfolg', 'Dachmessung wurde aktualisiert', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (error) {
      console.error('Error updating roof:', error);
      Alert.alert('Fehler', 'Dachmessung konnte nicht gespeichert werden');
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

  const calculatedArea = calculateArea();

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView style={styles.scrollView}>
        <View style={styles.form}>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Dachtyp *</Text>
            <TouchableOpacity
              style={styles.roofTypeSelector}
              onPress={() => setShowRoofTypePicker(true)}
            >
              <Text style={styles.roofTypeSelectorText}>{roofType}</Text>
              <Ionicons name="chevron-down" size={20} color="#666" />
            </TouchableOpacity>
          </View>

          <View style={styles.measurementsCard}>
            <Text style={styles.cardTitle}>Maße</Text>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Länge (m) *</Text>
              <TextInput
                style={styles.input}
                placeholder="z.B. 12.5"
                value={length}
                onChangeText={setLength}
                keyboardType="decimal-pad"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Breite (m) *</Text>
              <TextInput
                style={styles.input}
                placeholder="z.B. 8.0"
                value={width}
                onChangeText={setWidth}
                keyboardType="decimal-pad"
              />
            </View>

            {roofType !== 'Flachdach' && (
              <>
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Firsthöhe (m)</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="z.B. 3.5"
                    value={height}
                    onChangeText={setHeight}
                    keyboardType="decimal-pad"
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Dachneigung (°)</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="z.B. 35"
                    value={angle}
                    onChangeText={setAngle}
                    keyboardType="decimal-pad"
                  />
                </View>
              </>
            )}
          </View>

          <View style={styles.resultCard}>
            <Text style={styles.resultLabel}>Berechnete Dachfläche:</Text>
            <Text style={styles.resultValue}>{calculatedArea.toFixed(2)} m²</Text>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Notizen</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder="Zusätzliche Hinweise..."
              value={notes}
              onChangeText={setNotes}
              multiline
              numberOfLines={4}
            />
          </View>

          <TouchableOpacity
            style={[styles.button, saving && styles.buttonDisabled]}
            onPress={handleSave}
            disabled={saving}
          >
            <Text style={styles.buttonText}>
              {saving ? 'Wird gespeichert...' : 'Änderungen speichern'}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Roof Type Picker Modal */}
      <Modal
        visible={showRoofTypePicker}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowRoofTypePicker(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Dachtyp auswählen</Text>
              <TouchableOpacity onPress={() => setShowRoofTypePicker(false)}>
                <Ionicons name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>
            <FlatList
              data={ROOF_TYPES}
              keyExtractor={(item) => item}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.roofTypeItem,
                    item === roofType && styles.roofTypeItemSelected,
                  ]}
                  onPress={() => {
                    setRoofType(item);
                    setShowRoofTypePicker(false);
                  }}
                >
                  <View style={styles.roofTypeItemContent}>
                    <Ionicons 
                      name="home" 
                      size={24} 
                      color={item === roofType ? '#1976d2' : '#666'} 
                    />
                    <Text style={[
                      styles.roofTypeItemText,
                      item === roofType && styles.roofTypeItemTextSelected,
                    ]}>
                      {item}
                    </Text>
                  </View>
                  {item === roofType && (
                    <Ionicons name="checkmark-circle" size={24} color="#1976d2" />
                  )}
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>
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
  form: {
    padding: 16,
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
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  textArea: {
    height: 100,
    textAlignVertical: 'top',
  },
  measurementsCard: {
    backgroundColor: '#e3f2fd',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1976d2',
    marginBottom: 16,
  },
  resultCard: {
    backgroundColor: '#4caf50',
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    marginBottom: 16,
  },
  resultLabel: {
    fontSize: 14,
    color: '#fff',
    marginBottom: 8,
  },
  resultValue: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#fff',
  },
  button: {
    backgroundColor: '#1976d2',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: {
    backgroundColor: '#ccc',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  // Roof Type Selector
  roofTypeSelector: {
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  roofTypeSelectorText: {
    fontSize: 16,
    color: '#333',
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '60%',
    paddingBottom: Platform.OS === 'ios' ? 34 : 16,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  roofTypeItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  roofTypeItemSelected: {
    backgroundColor: '#e3f2fd',
  },
  roofTypeItemContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  roofTypeItemText: {
    fontSize: 16,
    color: '#333',
  },
  roofTypeItemTextSelected: {
    color: '#1976d2',
    fontWeight: '600',
  },
});

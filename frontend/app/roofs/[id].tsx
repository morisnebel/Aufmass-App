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
  { id: 'Flachdach', name: 'Flachdach', description: 'Ebene Dachfläche ohne Neigung' },
  { id: 'Pultdach', name: 'Pultdach', description: 'Einseitig geneigte Dachfläche' },
  { id: 'Satteldach', name: 'Satteldach', description: 'Zwei gegenüberliegende Dachflächen' },
  { id: 'Walmdach', name: 'Walmdach', description: 'Vier geneigte Dachflächen' },
  { id: 'Zeltdach', name: 'Zeltdach', description: 'Vier gleiche Dreiecksflächen' },
  { id: 'Mansarddach', name: 'Mansarddach', description: 'Dach mit Knick (steiler unten)' },
];

export default function EditRoofScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const [roofType, setRoofType] = useState('Satteldach');
  const [showRoofTypePicker, setShowRoofTypePicker] = useState(false);
  
  // Gemeinsame Maße
  const [length, setLength] = useState('');      // Trauflänge
  const [width, setWidth] = useState('');        // Gebäudebreite/Traufbreite
  const [height, setHeight] = useState('');      // Firsthöhe
  const [angle, setAngle] = useState('');        // Dachneigung
  
  // Walmdach spezifisch
  const [ridgeLength, setRidgeLength] = useState('');  // Firstlänge
  
  // Mansarddach spezifisch
  const [lowerHeight, setLowerHeight] = useState('');  // Untere Höhe (bis zum Knick)
  const [upperHeight, setUpperHeight] = useState('');  // Obere Höhe (vom Knick bis First)
  const [breakWidth, setBreakWidth] = useState('');    // Breite am Knickpunkt
  
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
          setLength(roof.measurements.length?.toString() || '');
          setWidth(roof.measurements.width?.toString() || '');
          setHeight(roof.measurements.height?.toString() || '');
          setAngle(roof.measurements.angle?.toString() || '');
          setRidgeLength(roof.measurements.ridge_length?.toString() || '');
          setLowerHeight(roof.measurements.lower_height?.toString() || '');
          setUpperHeight(roof.measurements.upper_height?.toString() || '');
          setBreakWidth(roof.measurements.break_width?.toString() || '');
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

  // Berechnung der Dachfläche je nach Dachtyp
  const calculateArea = () => {
    const l = parseFloat(length) || 0;
    const w = parseFloat(width) || 0;
    const h = parseFloat(height) || 0;
    const a = parseFloat(angle) || 0;
    const rl = parseFloat(ridgeLength) || 0;
    const lh = parseFloat(lowerHeight) || 0;
    const uh = parseFloat(upperHeight) || 0;
    const bw = parseFloat(breakWidth) || 0;

    let area = 0;

    switch (roofType) {
      case 'Flachdach':
        // Einfache Rechteckfläche
        area = l * w;
        break;

      case 'Pultdach':
        // Einseitig geneigtes Dach
        // Sparrenlänge = Breite / cos(Winkel) oder √(Breite² + Höhe²)
        if (h > 0) {
          const sparrenlaenge = Math.sqrt(w * w + h * h);
          area = l * sparrenlaenge;
        } else if (a > 0) {
          const radian = (a * Math.PI) / 180;
          const sparrenlaenge = w / Math.cos(radian);
          area = l * sparrenlaenge;
        } else {
          area = l * w;
        }
        break;

      case 'Satteldach':
        // Zwei gleiche Dachflächen, die sich am First treffen
        // Sparrenlänge = √((Breite/2)² + Firsthöhe²)
        if (h > 0) {
          const sparrenlaenge = Math.sqrt(Math.pow(w / 2, 2) + Math.pow(h, 2));
          area = 2 * l * sparrenlaenge;
        } else if (a > 0) {
          const radian = (a * Math.PI) / 180;
          const sparrenlaenge = (w / 2) / Math.cos(radian);
          area = 2 * l * sparrenlaenge;
        } else {
          area = l * w;
        }
        break;

      case 'Walmdach':
        // Vier Dachflächen: 2 Trapeze (Seiten) + 2 Dreiecke (Giebel)
        if (h > 0 && rl >= 0) {
          const sparrenlaenge = Math.sqrt(Math.pow(w / 2, 2) + Math.pow(h, 2));
          
          // Überstand an den Giebelseiten (Länge - Firstlänge) / 2
          const overhang = (l - rl) / 2;
          
          // Gratlänge (Länge der Grate vom First zur Traufecke)
          const gratlaenge = Math.sqrt(Math.pow(overhang, 2) + Math.pow(sparrenlaenge, 2));
          
          // Trapezflächen (Seitenflächen): ((Firstlänge + Trauflänge) / 2) × Sparrenlänge × 2
          const trapezFlaeche = ((rl + l) / 2) * sparrenlaenge * 2;
          
          // Dreiecksflächen (Giebelseiten): (Traufbreite × Gratlänge) / 2 × 2
          // Vereinfacht: Breite/2 × Sparrenlänge × 2 (da Dreieck)
          const dreieckFlaeche = (w / 2) * gratlaenge * 2;
          
          area = trapezFlaeche + dreieckFlaeche;
        } else {
          // Fallback: wie Satteldach berechnen
          if (h > 0) {
            const sparrenlaenge = Math.sqrt(Math.pow(w / 2, 2) + Math.pow(h, 2));
            area = 2 * l * sparrenlaenge * 1.15; // +15% für Walm-Anteil
          } else {
            area = l * w * 1.15;
          }
        }
        break;

      case 'Zeltdach':
        // Vier gleiche Dreiecksflächen, die sich in der Mitte treffen
        // Basis ist quadratisch (Länge = Breite)
        if (h > 0) {
          const basisSeite = (l + w) / 2; // Durchschnitt falls nicht quadratisch
          const sparrenlaenge = Math.sqrt(Math.pow(basisSeite / 2, 2) + Math.pow(h, 2));
          // Fläche eines Dreiecks = (Basis × Höhe) / 2
          // Hier: Höhe = Sparrenlänge
          area = 4 * (basisSeite / 2) * sparrenlaenge;
        } else {
          area = l * w;
        }
        break;

      case 'Mansarddach':
        // Dach mit Knick: steiler unten, flacher oben
        if (lh > 0 && uh > 0 && bw > 0) {
          // Unterer Teil (steiler): von Traufe bis Knick
          const untereBreite = (w - bw) / 2;
          const untereSparrenlaenge = Math.sqrt(Math.pow(untereBreite, 2) + Math.pow(lh, 2));
          const untereFlaeche = 2 * l * untereSparrenlaenge;
          
          // Oberer Teil (flacher): vom Knick bis First
          const obereBreite = bw / 2;
          const obereSparrenlaenge = Math.sqrt(Math.pow(obereBreite, 2) + Math.pow(uh, 2));
          const obereFlaeche = 2 * l * obereSparrenlaenge;
          
          area = untereFlaeche + obereFlaeche;
        } else if (h > 0) {
          // Fallback: wie Satteldach mit Aufschlag
          const sparrenlaenge = Math.sqrt(Math.pow(w / 2, 2) + Math.pow(h, 2));
          area = 2 * l * sparrenlaenge * 1.2; // +20% für Mansard-Form
        } else {
          area = l * w * 1.2;
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
          ridge_length: parseFloat(ridgeLength) || 0,
          lower_height: parseFloat(lowerHeight) || 0,
          upper_height: parseFloat(upperHeight) || 0,
          break_width: parseFloat(breakWidth) || 0,
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

  // Dynamische Eingabefelder je nach Dachtyp
  const renderMeasurementFields = () => {
    switch (roofType) {
      case 'Flachdach':
        return (
          <>
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
          </>
        );

      case 'Pultdach':
        return (
          <>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Trauflänge (m) *</Text>
              <TextInput
                style={styles.input}
                placeholder="z.B. 12.5"
                value={length}
                onChangeText={setLength}
                keyboardType="decimal-pad"
              />
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Sparrenbreite / Tiefe (m) *</Text>
              <TextInput
                style={styles.input}
                placeholder="z.B. 6.0"
                value={width}
                onChangeText={setWidth}
                keyboardType="decimal-pad"
              />
            </View>
            <View style={styles.inputRow}>
              <View style={styles.inputHalf}>
                <Text style={styles.label}>Höhenunterschied (m)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="z.B. 2.0"
                  value={height}
                  onChangeText={setHeight}
                  keyboardType="decimal-pad"
                />
              </View>
              <View style={styles.inputHalf}>
                <Text style={styles.label}>oder Neigung (°)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="z.B. 15"
                  value={angle}
                  onChangeText={setAngle}
                  keyboardType="decimal-pad"
                />
              </View>
            </View>
            <Text style={styles.hint}>Geben Sie entweder Höhe oder Neigung ein</Text>
          </>
        );

      case 'Satteldach':
        return (
          <>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Trauflänge (m) *</Text>
              <TextInput
                style={styles.input}
                placeholder="z.B. 12.5"
                value={length}
                onChangeText={setLength}
                keyboardType="decimal-pad"
              />
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Gebäudebreite (m) *</Text>
              <TextInput
                style={styles.input}
                placeholder="z.B. 10.0"
                value={width}
                onChangeText={setWidth}
                keyboardType="decimal-pad"
              />
            </View>
            <View style={styles.inputRow}>
              <View style={styles.inputHalf}>
                <Text style={styles.label}>Firsthöhe (m)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="z.B. 4.0"
                  value={height}
                  onChangeText={setHeight}
                  keyboardType="decimal-pad"
                />
              </View>
              <View style={styles.inputHalf}>
                <Text style={styles.label}>oder Neigung (°)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="z.B. 35"
                  value={angle}
                  onChangeText={setAngle}
                  keyboardType="decimal-pad"
                />
              </View>
            </View>
            <Text style={styles.hint}>Firsthöhe = Höhe von Traufe bis First</Text>
          </>
        );

      case 'Walmdach':
        return (
          <>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Trauflänge (m) *</Text>
              <TextInput
                style={styles.input}
                placeholder="z.B. 14.0"
                value={length}
                onChangeText={setLength}
                keyboardType="decimal-pad"
              />
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Gebäudebreite (m) *</Text>
              <TextInput
                style={styles.input}
                placeholder="z.B. 10.0"
                value={width}
                onChangeText={setWidth}
                keyboardType="decimal-pad"
              />
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Firsthöhe (m) *</Text>
              <TextInput
                style={styles.input}
                placeholder="z.B. 4.5"
                value={height}
                onChangeText={setHeight}
                keyboardType="decimal-pad"
              />
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Firstlänge (m) *</Text>
              <TextInput
                style={styles.input}
                placeholder="z.B. 8.0"
                value={ridgeLength}
                onChangeText={setRidgeLength}
                keyboardType="decimal-pad"
              />
            </View>
            <Text style={styles.hint}>Firstlänge = Länge des waagerechten Firsts (kürzer als Trauflänge)</Text>
          </>
        );

      case 'Zeltdach':
        return (
          <>
            <View style={styles.inputRow}>
              <View style={styles.inputHalf}>
                <Text style={styles.label}>Seitenlänge A (m) *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="z.B. 8.0"
                  value={length}
                  onChangeText={setLength}
                  keyboardType="decimal-pad"
                />
              </View>
              <View style={styles.inputHalf}>
                <Text style={styles.label}>Seitenlänge B (m) *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="z.B. 8.0"
                  value={width}
                  onChangeText={setWidth}
                  keyboardType="decimal-pad"
                />
              </View>
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Höhe bis Spitze (m) *</Text>
              <TextInput
                style={styles.input}
                placeholder="z.B. 5.0"
                value={height}
                onChangeText={setHeight}
                keyboardType="decimal-pad"
              />
            </View>
            <Text style={styles.hint}>Bei quadratischem Grundriss sind beide Seiten gleich</Text>
          </>
        );

      case 'Mansarddach':
        return (
          <>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Trauflänge (m) *</Text>
              <TextInput
                style={styles.input}
                placeholder="z.B. 12.0"
                value={length}
                onChangeText={setLength}
                keyboardType="decimal-pad"
              />
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Gebäudebreite unten (m) *</Text>
              <TextInput
                style={styles.input}
                placeholder="z.B. 10.0"
                value={width}
                onChangeText={setWidth}
                keyboardType="decimal-pad"
              />
            </View>
            <View style={styles.sectionTitle}>
              <Text style={styles.sectionTitleText}>Unterer Teil (steil)</Text>
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Höhe bis Knick (m) *</Text>
              <TextInput
                style={styles.input}
                placeholder="z.B. 2.5"
                value={lowerHeight}
                onChangeText={setLowerHeight}
                keyboardType="decimal-pad"
              />
            </View>
            <View style={styles.sectionTitle}>
              <Text style={styles.sectionTitleText}>Oberer Teil (flach)</Text>
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Breite am Knick (m) *</Text>
              <TextInput
                style={styles.input}
                placeholder="z.B. 6.0"
                value={breakWidth}
                onChangeText={setBreakWidth}
                keyboardType="decimal-pad"
              />
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Höhe vom Knick bis First (m) *</Text>
              <TextInput
                style={styles.input}
                placeholder="z.B. 2.0"
                value={upperHeight}
                onChangeText={setUpperHeight}
                keyboardType="decimal-pad"
              />
            </View>
            <Text style={styles.hint}>Knick = Stelle wo sich die Dachneigung ändert</Text>
          </>
        );

      default:
        return null;
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
              <View style={styles.roofTypeSelectorContent}>
                <Ionicons name="home" size={24} color="#1976d2" />
                <View style={styles.roofTypeSelectorText}>
                  <Text style={styles.roofTypeName}>{roofType}</Text>
                  <Text style={styles.roofTypeDesc}>
                    {ROOF_TYPES.find(r => r.id === roofType)?.description}
                  </Text>
                </View>
              </View>
              <Ionicons name="chevron-down" size={20} color="#666" />
            </TouchableOpacity>
          </View>

          <View style={styles.measurementsCard}>
            <Text style={styles.cardTitle}>Maße für {roofType}</Text>
            {renderMeasurementFields()}
          </View>

          <View style={styles.resultCard}>
            <Text style={styles.resultLabel}>Berechnete Dachfläche:</Text>
            <Text style={styles.resultValue}>{calculatedArea.toFixed(2)} m²</Text>
            <Text style={styles.resultFormula}>
              {roofType === 'Flachdach' && 'Formel: Länge × Breite'}
              {roofType === 'Pultdach' && 'Formel: Länge × Sparrenlänge'}
              {roofType === 'Satteldach' && 'Formel: 2 × Länge × Sparrenlänge'}
              {roofType === 'Walmdach' && 'Formel: Trapezflächen + Dreiecksflächen'}
              {roofType === 'Zeltdach' && 'Formel: 4 × Dreiecksfläche'}
              {roofType === 'Mansarddach' && 'Formel: Untere + Obere Dachfläche'}
            </Text>
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
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.roofTypeItem,
                    item.id === roofType && styles.roofTypeItemSelected,
                  ]}
                  onPress={() => {
                    setRoofType(item.id);
                    setShowRoofTypePicker(false);
                    // Reset specific fields when changing roof type
                    setRidgeLength('');
                    setLowerHeight('');
                    setUpperHeight('');
                    setBreakWidth('');
                  }}
                >
                  <View style={styles.roofTypeItemContent}>
                    <Ionicons 
                      name="home" 
                      size={28} 
                      color={item.id === roofType ? '#1976d2' : '#666'} 
                    />
                    <View style={styles.roofTypeItemTextContainer}>
                      <Text style={[
                        styles.roofTypeItemText,
                        item.id === roofType && styles.roofTypeItemTextSelected,
                      ]}>
                        {item.name}
                      </Text>
                      <Text style={styles.roofTypeItemDesc}>{item.description}</Text>
                    </View>
                  </View>
                  {item.id === roofType && (
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
  inputRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 8,
  },
  inputHalf: {
    flex: 1,
  },
  hint: {
    fontSize: 12,
    color: '#888',
    fontStyle: 'italic',
    marginTop: 4,
    marginBottom: 8,
  },
  sectionTitle: {
    backgroundColor: '#e8e8e8',
    padding: 8,
    borderRadius: 6,
    marginBottom: 12,
    marginTop: 4,
  },
  sectionTitleText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#555',
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
    fontSize: 36,
    fontWeight: 'bold',
    color: '#fff',
  },
  resultFormula: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 8,
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
  roofTypeSelectorContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  roofTypeSelectorText: {
    flex: 1,
  },
  roofTypeName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  roofTypeDesc: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
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
    maxHeight: '70%',
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
    flex: 1,
  },
  roofTypeItemTextContainer: {
    flex: 1,
  },
  roofTypeItemText: {
    fontSize: 16,
    color: '#333',
    fontWeight: '500',
  },
  roofTypeItemTextSelected: {
    color: '#1976d2',
    fontWeight: '600',
  },
  roofTypeItemDesc: {
    fontSize: 12,
    color: '#888',
    marginTop: 2,
  },
});

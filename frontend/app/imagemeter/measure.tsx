import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Alert,
  TextInput,
  Modal,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
  ScrollView,
} from 'react-native';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Line, Circle, G, Text as SvgText, Rect } from 'react-native-svg';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTranslation } from 'react-i18next';

const IMAGEMETER_STORAGE_KEY = 'aufmassprofi_imagemeter_photos';
const { width: SCREEN_WIDTH } = Dimensions.get('window');

type MeasurementType = 'line' | 'reference';

interface Point {
  x: number;
  y: number;
}

interface Measurement {
  id: string;
  type: MeasurementType;
  startPoint: Point;
  endPoint: Point;
  pixelLength: number;
  realLength?: number; // In cm oder m
  unit: 'cm' | 'm';
  label?: string;
}

interface ImageMeterPhoto {
  id: string;
  imageUri: string;
  name: string;
  projectId?: string;
  measurements: Measurement[];
  referenceScale?: number; // Pixel pro cm
  createdAt: string;
  updatedAt: string;
}

export default function ImageMeterMeasureScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useLocalSearchParams();
  const photoId = params.id as string;

  const [photo, setPhoto] = useState<ImageMeterPhoto | null>(null);
  const [loading, setLoading] = useState(true);
  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const [referenceScale, setReferenceScale] = useState<number | null>(null);
  
  // Drawing state
  const [drawMode, setDrawMode] = useState<'none' | 'line' | 'reference'>('none');
  const [currentLine, setCurrentLine] = useState<{ start: Point; end: Point } | null>(null);
  const [selectedMeasurement, setSelectedMeasurement] = useState<string | null>(null);
  
  // Image dimensions
  const [imageDimensions, setImageDimensions] = useState({ width: 0, height: 0 });
  const [containerDimensions, setContainerDimensions] = useState({ width: SCREEN_WIDTH, height: 400 });
  const [imageOffset, setImageOffset] = useState({ x: 0, y: 0 });
  
  // Modal state
  const [showLengthModal, setShowLengthModal] = useState(false);
  const [pendingMeasurement, setPendingMeasurement] = useState<{ start: Point; end: Point; type: MeasurementType } | null>(null);
  const [lengthInput, setLengthInput] = useState('');
  const [unitInput, setUnitInput] = useState<'cm' | 'm'>('cm');
  const [labelInput, setLabelInput] = useState('');  
  // Auto-save state
  const [hasChanges, setHasChanges] = useState(false);

  // Load photo data
  useEffect(() => {
    loadPhoto();
  }, [photoId]);

  // Auto-save on focus loss
  useFocusEffect(
    useCallback(() => {
      return () => {
        if (hasChanges) {
          autoSave();
        }
      };
    }, [hasChanges, measurements, referenceScale])
  );

  const loadPhoto = async () => {
    try {
      const data = await AsyncStorage.getItem(IMAGEMETER_STORAGE_KEY);
      if (data) {
        const photos: ImageMeterPhoto[] = JSON.parse(data);
        const found = photos.find(p => p.id === photoId);
        if (found) {
          setPhoto(found);
          setMeasurements(found.measurements || []);
          setReferenceScale(found.referenceScale || null);
          
          // Get image dimensions
          Image.getSize(
            found.imageUri,
            (width, height) => setImageDimensions({ width, height }),
            (error) => console.error('Error getting image size:', error)
          );
        }
      }
    } catch (error) {
      console.error('Error loading photo:', error);
      Alert.alert(t('common.error'), 'Foto konnte nicht geladen werden');
    } finally {
      setLoading(false);
    }
  };

  const autoSave = async () => {
    if (!photo) return;
    try {
      const data = await AsyncStorage.getItem(IMAGEMETER_STORAGE_KEY);
      if (data) {
        const photos: ImageMeterPhoto[] = JSON.parse(data);
        const index = photos.findIndex(p => p.id === photoId);
        if (index !== -1) {
          photos[index] = {
            ...photos[index],
            measurements,
            referenceScale,
            updatedAt: new Date().toISOString(),
          };
          await AsyncStorage.setItem(IMAGEMETER_STORAGE_KEY, JSON.stringify(photos));
        }
      }
    } catch (error) {
      console.error('Error auto-saving:', error);
    }
  };

  const saveChanges = async () => {
    if (!photo) return;
    try {
      const data = await AsyncStorage.getItem(IMAGEMETER_STORAGE_KEY);
      if (data) {
        const photos: ImageMeterPhoto[] = JSON.parse(data);
        const index = photos.findIndex(p => p.id === photoId);
        if (index !== -1) {
          photos[index] = {
            ...photos[index],
            measurements,
            referenceScale,
            updatedAt: new Date().toISOString(),
          };
          await AsyncStorage.setItem(IMAGEMETER_STORAGE_KEY, JSON.stringify(photos));
          setHasChanges(false);
          Alert.alert(t('common.success'), 'Messungen wurden gespeichert');
        }
      }
    } catch (error) {
      console.error('Error saving:', error);
      Alert.alert(t('common.error'), 'Speichern fehlgeschlagen');
    }
  };

  // Calculate display scale
  const getDisplayScale = () => {
    if (imageDimensions.width === 0 || containerDimensions.width === 0) return 1;
    const scaleX = containerDimensions.width / imageDimensions.width;
    const scaleY = containerDimensions.height / imageDimensions.height;
    return Math.min(scaleX, scaleY);
  };

  // Convert touch to image coordinates
  const touchToImageCoords = (touchX: number, touchY: number): Point => {
    const scale = getDisplayScale();
    const displayWidth = imageDimensions.width * scale;
    const displayHeight = imageDimensions.height * scale;
    const offsetX = (containerDimensions.width - displayWidth) / 2;
    const offsetY = (containerDimensions.height - displayHeight) / 2;
    
    return {
      x: (touchX - offsetX) / scale,
      y: (touchY - offsetY) / scale,
    };
  };

  // Convert image to display coordinates
  const imageToDisplayCoords = (point: Point): Point => {
    const scale = getDisplayScale();
    const displayWidth = imageDimensions.width * scale;
    const displayHeight = imageDimensions.height * scale;
    const offsetX = (containerDimensions.width - displayWidth) / 2;
    const offsetY = (containerDimensions.height - displayHeight) / 2;
    
    return {
      x: point.x * scale + offsetX,
      y: point.y * scale + offsetY,
    };
  };

  // Calculate pixel distance
  const calculatePixelLength = (start: Point, end: Point): number => {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    return Math.sqrt(dx * dx + dy * dy);
  };

  // Handle touch events
  const handleTouchStart = (event: any) => {
    if (drawMode === 'none') return;
    
    const touch = event.nativeEvent;
    const point = touchToImageCoords(touch.locationX, touch.locationY);
    setCurrentLine({ start: point, end: point });
  };

  const handleTouchMove = (event: any) => {
    if (drawMode === 'none' || !currentLine) return;
    
    const touch = event.nativeEvent;
    const point = touchToImageCoords(touch.locationX, touch.locationY);
    setCurrentLine(prev => prev ? { ...prev, end: point } : null);
  };

  const handleTouchEnd = () => {
    if (drawMode === 'none' || !currentLine) return;
    
    const pixelLength = calculatePixelLength(currentLine.start, currentLine.end);
    
    // Mindestlänge prüfen
    if (pixelLength < 20) {
      setCurrentLine(null);
      return;
    }
    
    // Wenn Referenz gesetzt ist und normale Messung: automatisch berechnen
    if (drawMode === 'line' && referenceScale) {
      const calculatedLength = pixelLength / referenceScale;
      
      const newMeasurement: Measurement = {
        id: `measurement_${Date.now()}`,
        type: 'line',
        startPoint: currentLine.start,
        endPoint: currentLine.end,
        pixelLength,
        realLength: calculatedLength,
        unit: calculatedLength >= 100 ? 'm' : 'cm',
        label: undefined,
      };
      
      setMeasurements(prev => [...prev, newMeasurement]);
      setHasChanges(true);
      setCurrentLine(null);
      setDrawMode('none');
      return;
    }
    
    // Sonst: Modal für Längeneingabe öffnen (Referenz setzen oder manuelle Eingabe)
    setPendingMeasurement({
      start: currentLine.start,
      end: currentLine.end,
      type: drawMode,
    });
    setShowLengthModal(true);
    setCurrentLine(null);
  };

  // Add measurement
  const addMeasurement = () => {
    if (!pendingMeasurement) return;
    
    const length = parseFloat(lengthInput.replace(',', '.'));
    if (isNaN(length) || length <= 0) {
      Alert.alert(t('common.error'), 'Bitte geben Sie eine gültige Länge ein');
      return;
    }
    
    const pixelLength = calculatePixelLength(pendingMeasurement.start, pendingMeasurement.end);
    const realLengthInCm = unitInput === 'm' ? length * 100 : length;
    
    // If this is a reference measurement, update the scale
    if (pendingMeasurement.type === 'reference') {
      const newScale = pixelLength / realLengthInCm;
      setReferenceScale(newScale);
      
      // Update existing measurements with new scale
      setMeasurements(prev => prev.map(m => ({
        ...m,
        realLength: m.pixelLength / newScale,
      })));
    }
    
    const newMeasurement: Measurement = {
      id: `measurement_${Date.now()}`,
      type: pendingMeasurement.type,
      startPoint: pendingMeasurement.start,
      endPoint: pendingMeasurement.end,
      pixelLength,
      realLength: realLengthInCm,
      unit: unitInput,
      label: labelInput.trim() || undefined,
    };
    
    setMeasurements(prev => [...prev, newMeasurement]);
    setHasChanges(true);
    
    // Reset modal
    setShowLengthModal(false);
    setPendingMeasurement(null);
    setLengthInput('');
    setLabelInput('');
    setDrawMode('none');
  };

  // Delete measurement
  const deleteMeasurement = (id: string) => {
    const measurement = measurements.find(m => m.id === id);
    if (!measurement) return;
    
    Alert.alert(
      'Messung löschen',
      measurement.type === 'reference' 
        ? 'Das Referenzmaß wird gelöscht. Automatische Berechnungen sind dann nicht mehr möglich.'
        : 'Möchten Sie diese Messung löschen?',
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: 'Löschen',
          style: 'destructive',
          onPress: () => {
            setMeasurements(prev => prev.filter(m => m.id !== id));
            if (measurement.type === 'reference') {
              setReferenceScale(null);
            }
            setSelectedMeasurement(null);
            setHasChanges(true);
          },
        },
      ]
    );
  };

  // Format length for display
  const formatLength = (measurement: Measurement): string => {
    if (measurement.type === 'reference') {
      return `${measurement.realLength?.toFixed(1)} cm (Referenz)`;
    }
    
    if (referenceScale && measurement.pixelLength) {
      const calculatedLength = measurement.pixelLength / referenceScale;
      if (calculatedLength >= 100) {
        return `${(calculatedLength / 100).toFixed(2)} m`;
      }
      return `${calculatedLength.toFixed(1)} cm`;
    }
    
    if (measurement.realLength) {
      if (measurement.unit === 'm') {
        return `${(measurement.realLength / 100).toFixed(2)} m`;
      }
      return `${measurement.realLength.toFixed(1)} cm`;
    }
    
    return '?';
  };

  // Render measurement line
  const renderMeasurement = (m: Measurement) => {
    const start = imageToDisplayCoords(m.startPoint);
    const end = imageToDisplayCoords(m.endPoint);
    const isSelected = selectedMeasurement === m.id;
    const isReference = m.type === 'reference';
    
    // Calculate midpoint for label
    const midX = (start.x + end.x) / 2;
    const midY = (start.y + end.y) / 2;
    
    // Calculate angle for label rotation
    const angle = Math.atan2(end.y - start.y, end.x - start.x) * (180 / Math.PI);
    const labelRotation = angle > 90 || angle < -90 ? angle + 180 : angle;
    
    const lineColor = isReference ? '#4CAF50' : (isSelected ? '#FF9800' : '#f44336');
    const strokeWidth = isSelected ? 4 : 3;
    
    return (
      <G key={m.id}>
        {/* Main line */}
        <Line
          x1={start.x}
          y1={start.y}
          x2={end.x}
          y2={end.y}
          stroke={lineColor}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
        
        {/* End caps */}
        <Circle cx={start.x} cy={start.y} r={6} fill={lineColor} />
        <Circle cx={end.x} cy={end.y} r={6} fill={lineColor} />
        
        {/* Label background */}
        <Rect
          x={midX - 35}
          y={midY - 12}
          width={70}
          height={24}
          rx={4}
          fill="rgba(255,255,255,0.95)"
          stroke={lineColor}
          strokeWidth={1}
        />
        
        {/* Label text */}
        <SvgText
          x={midX}
          y={midY + 5}
          fill={lineColor}
          fontSize={12}
          fontWeight="bold"
          textAnchor="middle"
        >
          {formatLength(m)}
        </SvgText>
        
        {/* Reference icon */}
        {isReference && (
          <Circle
            cx={midX + 32}
            cy={midY - 6}
            r={6}
            fill="#4CAF50"
          />
        )}
      </G>
    );
  };

  if (loading || !photo) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContainer}>
          <Text>Lade...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{photo.name}</Text>
        <TouchableOpacity onPress={saveChanges} style={styles.saveHeaderButton}>
          <Ionicons name="checkmark" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Toolbar */}
      <View style={styles.toolbar}>
        <TouchableOpacity
          style={[
            styles.toolButton,
            drawMode === 'reference' && styles.toolButtonActive,
            !referenceScale && styles.toolButtonHighlight,
          ]}
          onPress={() => setDrawMode(drawMode === 'reference' ? 'none' : 'reference')}
        >
          <Ionicons 
            name="resize" 
            size={20} 
            color={drawMode === 'reference' ? '#fff' : '#4CAF50'} 
          />
          <Text style={[
            styles.toolButtonText,
            drawMode === 'reference' && styles.toolButtonTextActive,
            { color: drawMode === 'reference' ? '#fff' : '#4CAF50' },
          ]}>
            Referenz
          </Text>
          {referenceScale && (
            <View style={styles.checkBadge}>
              <Ionicons name="checkmark" size={10} color="#fff" />
            </View>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.toolButton,
            drawMode === 'line' && styles.toolButtonActive,
          ]}
          onPress={() => setDrawMode(drawMode === 'line' ? 'none' : 'line')}
        >
          <Ionicons 
            name="analytics" 
            size={20} 
            color={drawMode === 'line' ? '#fff' : '#1976d2'} 
          />
          <Text style={[
            styles.toolButtonText,
            drawMode === 'line' && styles.toolButtonTextActive,
          ]}>
            Messen
          </Text>
        </TouchableOpacity>

        {selectedMeasurement && (
          <TouchableOpacity
            style={[styles.toolButton, styles.deleteToolButton]}
            onPress={() => deleteMeasurement(selectedMeasurement)}
          >
            <Ionicons name="trash-outline" size={20} color="#f44336" />
            <Text style={[styles.toolButtonText, { color: '#f44336' }]}>
              Löschen
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Status Bar */}
      {drawMode !== 'none' && (
        <View style={[
          styles.statusBar,
          drawMode === 'reference' ? styles.statusBarReference : styles.statusBarLine,
        ]}>
          <Ionicons 
            name="finger-print" 
            size={18} 
            color={drawMode === 'reference' ? '#4CAF50' : '#1976d2'} 
          />
          <Text style={[
            styles.statusText,
            { color: drawMode === 'reference' ? '#4CAF50' : '#1976d2' },
          ]}>
            {drawMode === 'reference' 
              ? 'Ziehen Sie eine Linie über eine bekannte Länge'
              : 'Ziehen Sie eine Linie zum Messen'
            }
          </Text>
        </View>
      )}

      {/* Image Canvas */}
      <View 
        style={styles.canvasContainer}
        onLayout={(e) => setContainerDimensions({
          width: e.nativeEvent.layout.width,
          height: e.nativeEvent.layout.height,
        })}
      >
        <Image
          source={{ uri: photo.imageUri }}
          style={styles.image}
          resizeMode="contain"
        />
        
        <View
          style={StyleSheet.absoluteFill}
          onStartShouldSetResponder={() => drawMode !== 'none'}
          onMoveShouldSetResponder={() => drawMode !== 'none'}
          onResponderGrant={handleTouchStart}
          onResponderMove={handleTouchMove}
          onResponderRelease={handleTouchEnd}
          onTouchStart={(e) => {
            // Check if tapping on existing measurement
            if (drawMode === 'none') {
              const touch = e.nativeEvent;
              const point = touchToImageCoords(touch.locationX, touch.locationY);
              
              for (const m of measurements) {
                const midX = (m.startPoint.x + m.endPoint.x) / 2;
                const midY = (m.startPoint.y + m.endPoint.y) / 2;
                const dist = Math.sqrt(Math.pow(point.x - midX, 2) + Math.pow(point.y - midY, 2));
                
                if (dist < 50) {
                  setSelectedMeasurement(m.id === selectedMeasurement ? null : m.id);
                  return;
                }
              }
              setSelectedMeasurement(null);
            }
          }}
        >
          <Svg style={StyleSheet.absoluteFill}>
            {/* Existing measurements */}
            {measurements.map(renderMeasurement)}
            
            {/* Current drawing line */}
            {currentLine && (
              <G>
                <Line
                  x1={imageToDisplayCoords(currentLine.start).x}
                  y1={imageToDisplayCoords(currentLine.start).y}
                  x2={imageToDisplayCoords(currentLine.end).x}
                  y2={imageToDisplayCoords(currentLine.end).y}
                  stroke={drawMode === 'reference' ? '#4CAF50' : '#1976d2'}
                  strokeWidth={3}
                  strokeDasharray="5,5"
                />
                <Circle
                  cx={imageToDisplayCoords(currentLine.start).x}
                  cy={imageToDisplayCoords(currentLine.start).y}
                  r={8}
                  fill={drawMode === 'reference' ? '#4CAF50' : '#1976d2'}
                />
                <Circle
                  cx={imageToDisplayCoords(currentLine.end).x}
                  cy={imageToDisplayCoords(currentLine.end).y}
                  r={8}
                  fill={drawMode === 'reference' ? '#4CAF50' : '#1976d2'}
                />
              </G>
            )}
          </Svg>
        </View>
      </View>

      {/* Measurements List */}
      {measurements.length > 0 && (
        <View style={styles.measurementsList}>
          <Text style={styles.measurementsTitle}>
            {measurements.length} Messung{measurements.length !== 1 ? 'en' : ''}
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {measurements.map(m => (
              <TouchableOpacity
                key={m.id}
                style={[
                  styles.measurementChip,
                  m.type === 'reference' && styles.measurementChipReference,
                  selectedMeasurement === m.id && styles.measurementChipSelected,
                ]}
                onPress={() => setSelectedMeasurement(m.id === selectedMeasurement ? null : m.id)}
              >
                <Ionicons 
                  name={m.type === 'reference' ? 'resize' : 'analytics'} 
                  size={14} 
                  color={m.type === 'reference' ? '#4CAF50' : '#1976d2'} 
                />
                <Text style={styles.measurementChipText}>
                  {m.label || formatLength(m)}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Length Input Modal */}
      <Modal visible={showLengthModal} transparent animationType="slide">
        <KeyboardAvoidingView 
          style={styles.modalOverlay} 
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              {pendingMeasurement?.type === 'reference' ? 'Referenzmaß eingeben' : 'Maß eingeben'}
            </Text>
            
            {pendingMeasurement?.type === 'reference' && (
              <View style={styles.modalInfo}>
                <Ionicons name="information-circle" size={18} color="#4CAF50" />
                <Text style={styles.modalInfoText}>
                  Geben Sie die tatsächliche Länge der gezeichneten Linie ein.
                  Alle weiteren Messungen werden automatisch berechnet.
                </Text>
              </View>
            )}
            
            <Text style={styles.inputLabel}>Länge</Text>
            <View style={styles.lengthInputRow}>
              <TextInput
                style={styles.lengthInput}
                value={lengthInput}
                onChangeText={setLengthInput}
                placeholder="0"
                keyboardType="decimal-pad"
                autoFocus
              />
              <View style={styles.unitToggle}>
                <TouchableOpacity
                  style={[
                    styles.unitButton,
                    unitInput === 'cm' && styles.unitButtonActive,
                  ]}
                  onPress={() => setUnitInput('cm')}
                >
                  <Text style={[
                    styles.unitButtonText,
                    unitInput === 'cm' && styles.unitButtonTextActive,
                  ]}>cm</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.unitButton,
                    unitInput === 'm' && styles.unitButtonActive,
                  ]}
                  onPress={() => setUnitInput('m')}
                >
                  <Text style={[
                    styles.unitButtonText,
                    unitInput === 'm' && styles.unitButtonTextActive,
                  ]}>m</Text>
                </TouchableOpacity>
              </View>
            </View>
            
            <Text style={styles.inputLabel}>Beschriftung (optional)</Text>
            <TextInput
              style={styles.labelInput}
              value={labelInput}
              onChangeText={setLabelInput}
              placeholder="z.B. Fensterbreite, Türhöhe..."
              placeholderTextColor="#999"
            />
            
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => {
                  setShowLengthModal(false);
                  setPendingMeasurement(null);
                  setLengthInput('');
                  setLabelInput('');
                }}
              >
                <Text style={styles.cancelButtonText}>Abbrechen</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.confirmButton}
                onPress={addMeasurement}
              >
                <Text style={styles.confirmButtonText}>Hinzufügen</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a1a',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1976d2',
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
    textAlign: 'center',
    marginHorizontal: 8,
  },
  saveHeaderButton: {
    padding: 4,
  },
  toolbar: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    paddingVertical: 8,
    paddingHorizontal: 12,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  toolButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
    backgroundColor: '#f5f5f5',
    gap: 6,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  toolButtonActive: {
    backgroundColor: '#1976d2',
    borderColor: '#1565c0',
  },
  toolButtonHighlight: {
    borderColor: '#4CAF50',
    borderWidth: 2,
  },
  deleteToolButton: {
    marginLeft: 'auto',
    backgroundColor: '#ffebee',
    borderColor: '#f44336',
  },
  toolButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1976d2',
  },
  toolButtonTextActive: {
    color: '#fff',
  },
  checkBadge: {
    backgroundColor: '#4CAF50',
    borderRadius: 8,
    width: 16,
    height: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  statusBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
    gap: 8,
  },
  statusBarReference: {
    backgroundColor: '#e8f5e9',
  },
  statusBarLine: {
    backgroundColor: '#e3f2fd',
  },
  statusText: {
    fontSize: 13,
    fontWeight: '500',
  },
  canvasContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  measurementsList: {
    backgroundColor: '#fff',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  measurementsTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
    marginBottom: 6,
  },
  measurementChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 16,
    marginRight: 8,
    gap: 4,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  measurementChipReference: {
    backgroundColor: '#e8f5e9',
    borderColor: '#4CAF50',
  },
  measurementChipSelected: {
    backgroundColor: '#fff3e0',
    borderColor: '#FF9800',
  },
  measurementChipText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#333',
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 16,
    textAlign: 'center',
  },
  modalInfo: {
    flexDirection: 'row',
    backgroundColor: '#e8f5e9',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    gap: 8,
  },
  modalInfoText: {
    flex: 1,
    fontSize: 13,
    color: '#2e7d32',
    lineHeight: 18,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginBottom: 8,
  },
  lengthInputRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  lengthInput: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    textAlign: 'center',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  unitToggle: {
    flexDirection: 'column',
    gap: 4,
  },
  unitButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#f5f5f5',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  unitButtonActive: {
    backgroundColor: '#1976d2',
    borderColor: '#1565c0',
  },
  unitButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  unitButtonTextActive: {
    color: '#fff',
  },
  labelInput: {
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#333',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    marginBottom: 20,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#f5f5f5',
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
  },
  confirmButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#4CAF50',
    alignItems: 'center',
  },
  confirmButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
});

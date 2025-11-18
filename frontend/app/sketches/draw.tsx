import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  TextInput,
  Dimensions,
  Image,
  Platform,
  ScrollView,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { captureRef } from 'react-native-view-shot';
import axios from 'axios';
import Constants from 'expo-constants';
import Svg, { Path, Line, Circle, Rect, Image as SvgImage, Text as SvgText, G, Polygon } from 'react-native-svg';

const API_URL = Constants.expoConfig?.extra?.EXPO_PUBLIC_BACKEND_URL || process.env.EXPO_PUBLIC_BACKEND_URL;
const { width, height } = Dimensions.get('window');

interface DrawElement {
  type: 'path' | 'line' | 'circle' | 'rect' | 'text' | 'image' | 'arrow' | 'dimension';
  data: any;
  color: string;
  strokeWidth: number;
}

export default function DrawSketchScreen() {
  const router = useRouter();
  const { projectId } = useLocalSearchParams();
  const canvasRef = useRef(null);
  const svgRef = useRef(null);
  const [title, setTitle] = useState('');
  const [elements, setElements] = useState<DrawElement[]>([]);
  const [currentPath, setCurrentPath] = useState<string>('');
  const [drawColor, setDrawColor] = useState('#000000');
  const [strokeWidth, setStrokeWidth] = useState(3);
  const [loading, setLoading] = useState(false);
  const [showTitleInput, setShowTitleInput] = useState(false);
  const [backgroundImage, setBackgroundImage] = useState<string | null>(null);
  const [drawMode, setDrawMode] = useState<'pen' | 'line' | 'circle' | 'rect' | 'text' | 'dimension'>('pen');
  const [startPoint, setStartPoint] = useState<{ x: number; y: number } | null>(null);
  const [showTextInput, setShowTextInput] = useState(false);
  const [textInput, setTextInput] = useState('');
  const [showDimensionInput, setShowDimensionInput] = useState(false);
  const [dimensionInput, setDimensionInput] = useState('');
  const [pendingTextPosition, setPendingTextPosition] = useState<{ x: number; y: number } | null>(null);
  const [pendingDimension, setPendingDimension] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);

  const requestPermissions = async () => {
    if (Platform.OS !== 'web') {
      const { status: cameraStatus } = await ImagePicker.requestCameraPermissionsAsync();
      const { status: mediaStatus } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      
      if (cameraStatus !== 'granted' || mediaStatus !== 'granted') {
        Alert.alert(
          'Berechtigungen erforderlich',
          'Bitte erlauben Sie den Zugriff auf Kamera und Galerie'
        );
        return false;
      }
    }
    return true;
  };

  const pickImage = async () => {
    const hasPermission = await requestPermissions();
    if (!hasPermission) return;

    Alert.alert(
      'Bild hinzufügen',
      'Wo möchten Sie das Bild hinzufügen?',
      [
        {
          text: 'Als Hintergrund',
          onPress: async () => {
            const result = await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ImagePicker.MediaTypeOptions.Images,
              allowsEditing: true,
              quality: 0.8,
              base64: true,
            });

            if (!result.canceled && result.assets[0]) {
              const base64Image = `data:image/jpeg;base64,${result.assets[0].base64}`;
              setBackgroundImage(base64Image);
            }
          },
        },
        {
          text: 'Auf Zeichenfläche',
          onPress: async () => {
            const result = await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ImagePicker.MediaTypeOptions.Images,
              allowsEditing: true,
              quality: 0.8,
              base64: true,
            });

            if (!result.canceled && result.assets[0]) {
              const base64Image = `data:image/jpeg;base64,${result.assets[0].base64}`;
              const newElement: DrawElement = {
                type: 'image',
                data: {
                  uri: base64Image,
                  x: 50,
                  y: 100,
                  width: 200,
                  height: 150,
                },
                color: drawColor,
                strokeWidth,
              };
              setElements([...elements, newElement]);
            }
          },
        },
        { text: 'Abbrechen', style: 'cancel' },
      ]
    );
  };

  const takePhoto = async () => {
    const hasPermission = await requestPermissions();
    if (!hasPermission) return;

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      quality: 0.8,
      base64: true,
    });

    if (!result.canceled && result.assets[0]) {
      const base64Image = `data:image/jpeg;base64,${result.assets[0].base64}`;
      
      Alert.alert(
        'Foto hinzufügen',
        'Wo möchten Sie das Foto hinzufügen?',
        [
          {
            text: 'Als Hintergrund',
            onPress: () => setBackgroundImage(base64Image),
          },
          {
            text: 'Auf Zeichenfläche',
            onPress: () => {
              const newElement: DrawElement = {
                type: 'image',
                data: {
                  uri: base64Image,
                  x: 50,
                  y: 100,
                  width: 200,
                  height: 150,
                },
                color: drawColor,
                strokeWidth,
              };
              setElements([...elements, newElement]);
            },
          },
          { text: 'Abbrechen', style: 'cancel' },
        ]
      );
    }
  };

  const onTouchStart = (event: any) => {
    const { locationX, locationY } = event.nativeEvent;
    
    if (drawMode === 'text') {
      setPendingTextPosition({ x: locationX, y: locationY });
      setShowTextInput(true);
      return;
    }
    
    if (drawMode === 'pen') {
      setCurrentPath(`M ${locationX} ${locationY}`);
    } else {
      setStartPoint({ x: locationX, y: locationY });
    }
  };

  const onTouchMove = (event: any) => {
    if (drawMode !== 'pen') return;
    
    const { locationX, locationY } = event.nativeEvent;
    setCurrentPath((prev) => `${prev} L ${locationX} ${locationY}`);
  };

  const onTouchEnd = (event: any) => {
    const { locationX, locationY } = event.nativeEvent;

    if (drawMode === 'text' || drawMode === 'dimension') {
      return; // Handled by input dialogs
    }

    if (drawMode === 'pen' && currentPath) {
      const newElement: DrawElement = {
        type: 'path',
        data: currentPath,
        color: drawColor,
        strokeWidth,
      };
      setElements([...elements, newElement]);
      setCurrentPath('');
    } else if (startPoint) {
      let newElement: DrawElement | null = null;
      
      switch (drawMode) {
        case 'line':
          newElement = {
            type: 'line',
            data: { x1: startPoint.x, y1: startPoint.y, x2: locationX, y2: locationY },
            color: drawColor,
            strokeWidth,
          };
          break;
        case 'circle':
          const radius = Math.sqrt(
            Math.pow(locationX - startPoint.x, 2) + Math.pow(locationY - startPoint.y, 2)
          );
          newElement = {
            type: 'circle',
            data: { cx: startPoint.x, cy: startPoint.y, r: radius },
            color: drawColor,
            strokeWidth,
          };
          break;
        case 'rect':
          newElement = {
            type: 'rect',
            data: {
              x: Math.min(startPoint.x, locationX),
              y: Math.min(startPoint.y, locationY),
              width: Math.abs(locationX - startPoint.x),
              height: Math.abs(locationY - startPoint.y),
            },
            color: drawColor,
            strokeWidth,
          };
          break;
        case 'dimension':
          setPendingDimension({
            x1: startPoint.x,
            y1: startPoint.y,
            x2: locationX,
            y2: locationY,
          });
          setShowDimensionInput(true);
          setStartPoint(null);
          return;
      }
      
      if (newElement) {
        setElements([...elements, newElement]);
      }
      setStartPoint(null);
    }
  };

  const addTextElement = () => {
    if (textInput.trim() && pendingTextPosition) {
      const newElement: DrawElement = {
        type: 'text',
        data: {
          text: textInput,
          x: pendingTextPosition.x,
          y: pendingTextPosition.y,
        },
        color: drawColor,
        strokeWidth,
      };
      setElements([...elements, newElement]);
      setTextInput('');
      setPendingTextPosition(null);
      setShowTextInput(false);
    }
  };

  const addDimensionElement = () => {
    if (dimensionInput.trim() && pendingDimension) {
      const { x1, y1, x2, y2 } = pendingDimension;
      
      // Calculate arrow positions
      const dx = x2 - x1;
      const dy = y2 - y1;
      const length = Math.sqrt(dx * dx + dy * dy);
      const angle = Math.atan2(dy, dx);
      
      // Arrow head size
      const arrowSize = 15;
      
      // Calculate arrow head points
      const arrowAngle = Math.PI / 6; // 30 degrees
      
      const newElement: DrawElement = {
        type: 'dimension',
        data: {
          x1,
          y1,
          x2,
          y2,
          text: dimensionInput,
          angle,
          length,
          arrowSize,
        },
        color: drawColor,
        strokeWidth: 2,
      };
      
      setElements([...elements, newElement]);
      setDimensionInput('');
      setPendingDimension(null);
      setShowDimensionInput(false);
    }
  };

  const undo = () => {
    if (elements.length > 0) {
      setElements(elements.slice(0, -1));
    }
  };

  const clear = () => {
    Alert.alert(
      'Alles löschen',
      'Möchten Sie die gesamte Zeichnung löschen?',
      [
        { text: 'Abbrechen', style: 'cancel' },
        { 
          text: 'Löschen', 
          onPress: () => {
            setElements([]);
            setBackgroundImage(null);
          } 
        },
      ]
    );
  };

  const save = async () => {
    if (elements.length === 0 && !backgroundImage) {
      Alert.alert('Fehler', 'Bitte zeichnen Sie etwas oder fügen Sie ein Bild hinzu');
      return;
    }

    setLoading(true);
    try {
      // Capture the sketch
      const uri = await captureRef(canvasRef, {
        format: 'png',
        quality: 0.8,
        result: 'base64',
      });

      const base64Image = `data:image/png;base64,${uri}`;

      await axios.post(`${API_URL}/api/sketches`, {
        project_id: projectId,
        sketch_data: base64Image,
        title: title || undefined,
      });

      Alert.alert('Erfolg', 'Skizze wurde gespeichert', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (error) {
      console.error('Error saving sketch:', error);
      Alert.alert('Fehler', 'Skizze konnte nicht gespeichert werden');
    } finally {
      setLoading(false);
    }
  };

  const toggleStrokeWidth = () => {
    setStrokeWidth(strokeWidth === 3 ? 6 : strokeWidth === 6 ? 10 : 3);
  };

  const colors = [
    { color: '#000000', name: 'Schwarz' },
    { color: '#FF0000', name: 'Rot' },
    { color: '#0000FF', name: 'Blau' },
    { color: '#00FF00', name: 'Grün' },
    { color: '#FFFF00', name: 'Gelb' },
    { color: '#FF8800', name: 'Orange' },
  ];

  return (
    <View style={styles.container}>
      {/* Toolbar */}
      <ScrollView horizontal style={styles.toolbar} contentContainerStyle={styles.toolbarContent}>
        <TouchableOpacity 
          style={[styles.toolButton, drawMode === 'pen' && styles.toolButtonActive]} 
          onPress={() => setDrawMode('pen')}
        >
          <Ionicons name="brush" size={24} color={drawMode === 'pen' ? '#fff' : '#1976d2'} />
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={[styles.toolButton, drawMode === 'line' && styles.toolButtonActive]} 
          onPress={() => setDrawMode('line')}
        >
          <Ionicons name="remove" size={24} color={drawMode === 'line' ? '#fff' : '#1976d2'} />
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={[styles.toolButton, drawMode === 'circle' && styles.toolButtonActive]} 
          onPress={() => setDrawMode('circle')}
        >
          <Ionicons name="ellipse-outline" size={24} color={drawMode === 'circle' ? '#fff' : '#1976d2'} />
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={[styles.toolButton, drawMode === 'rect' && styles.toolButtonActive]} 
          onPress={() => setDrawMode('rect')}
        >
          <Ionicons name="square-outline" size={24} color={drawMode === 'rect' ? '#fff' : '#1976d2'} />
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.toolButton, drawMode === 'text' && styles.toolButtonActive]} 
          onPress={() => setDrawMode('text')}
        >
          <Ionicons name="text" size={24} color={drawMode === 'text' ? '#fff' : '#1976d2'} />
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.toolButton, drawMode === 'dimension' && styles.toolButtonActive]} 
          onPress={() => setDrawMode('dimension')}
        >
          <Ionicons name="resize" size={24} color={drawMode === 'dimension' ? '#fff' : '#1976d2'} />
        </TouchableOpacity>

        <TouchableOpacity style={styles.toolButton} onPress={toggleStrokeWidth}>
          <View style={[styles.strokePreview, { width: strokeWidth * 3, height: strokeWidth * 3 }]} />
        </TouchableOpacity>

        <TouchableOpacity style={styles.toolButton} onPress={pickImage}>
          <Ionicons name="images" size={24} color="#1976d2" />
        </TouchableOpacity>

        <TouchableOpacity style={styles.toolButton} onPress={takePhoto}>
          <Ionicons name="camera" size={24} color="#1976d2" />
        </TouchableOpacity>

        <TouchableOpacity style={styles.toolButton} onPress={undo}>
          <Ionicons name="arrow-undo" size={24} color="#1976d2" />
        </TouchableOpacity>
        
        <TouchableOpacity style={styles.toolButton} onPress={clear}>
          <Ionicons name="trash-outline" size={24} color="#f44336" />
        </TouchableOpacity>
        
        <TouchableOpacity style={styles.toolButton} onPress={() => setShowTitleInput(!showTitleInput)}>
          <Ionicons name="create-outline" size={24} color="#1976d2" />
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={[styles.toolButton, styles.saveButton]} 
          onPress={save}
          disabled={loading}
        >
          <Ionicons name="checkmark-circle" size={24} color="#fff" />
        </TouchableOpacity>
      </ScrollView>

      {showTitleInput && (
        <View style={styles.titleInput}>
          <TextInput
            style={styles.input}
            placeholder="Titel der Skizze..."
            value={title}
            onChangeText={setTitle}
          />
        </View>
      )}

      {/* Color Picker */}
      <ScrollView horizontal style={styles.colorPicker} contentContainerStyle={styles.colorPickerContent}>
        {colors.map((c) => (
          <TouchableOpacity
            key={c.color}
            style={[
              styles.colorButton,
              { backgroundColor: c.color },
              drawColor === c.color && styles.colorButtonActive,
            ]}
            onPress={() => setDrawColor(c.color)}
          />
        ))}
      </ScrollView>

      {/* Canvas */}
      <View style={styles.canvasContainer} ref={canvasRef}>
        {backgroundImage && (
          <Image 
            source={{ uri: backgroundImage }} 
            style={styles.backgroundImage} 
            resizeMode="contain" 
          />
        )}
        <View
          style={styles.svgContainer}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        >
          <Svg height="100%" width="100%" ref={svgRef}>
            {/* Render saved elements */}
            {elements.map((element, index) => {
              switch (element.type) {
                case 'path':
                  return (
                    <Path
                      key={index}
                      d={element.data}
                      stroke={element.color}
                      strokeWidth={element.strokeWidth}
                      fill="none"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  );
                case 'line':
                  return (
                    <Line
                      key={index}
                      x1={element.data.x1}
                      y1={element.data.y1}
                      x2={element.data.x2}
                      y2={element.data.y2}
                      stroke={element.color}
                      strokeWidth={element.strokeWidth}
                    />
                  );
                case 'circle':
                  return (
                    <Circle
                      key={index}
                      cx={element.data.cx}
                      cy={element.data.cy}
                      r={element.data.r}
                      stroke={element.color}
                      strokeWidth={element.strokeWidth}
                      fill="none"
                    />
                  );
                case 'rect':
                  return (
                    <Rect
                      key={index}
                      x={element.data.x}
                      y={element.data.y}
                      width={element.data.width}
                      height={element.data.height}
                      stroke={element.color}
                      strokeWidth={element.strokeWidth}
                      fill="none"
                    />
                  );
                case 'image':
                  return (
                    <SvgImage
                      key={index}
                      href={element.data.uri}
                      x={element.data.x}
                      y={element.data.y}
                      width={element.data.width}
                      height={element.data.height}
                    />
                  );
                case 'text':
                  return (
                    <SvgText
                      key={index}
                      x={element.data.x}
                      y={element.data.y}
                      fill={element.color}
                      fontSize={16}
                      fontWeight="bold"
                    >
                      {element.data.text}
                    </SvgText>
                  );
                case 'dimension':
                  const { x1: dx1, y1: dy1, x2: dx2, y2: dy2, text: dimText, angle: dimAngle, arrowSize } = element.data;
                  const midX = (dx1 + dx2) / 2;
                  const midY = (dy1 + dy2) / 2;
                  
                  // Calculate arrow heads
                  const arrowAngle1 = Math.PI / 6;
                  const arrow1_1_x = dx1 + arrowSize * Math.cos(dimAngle + Math.PI - arrowAngle1);
                  const arrow1_1_y = dy1 + arrowSize * Math.sin(dimAngle + Math.PI - arrowAngle1);
                  const arrow1_2_x = dx1 + arrowSize * Math.cos(dimAngle + Math.PI + arrowAngle1);
                  const arrow1_2_y = dy1 + arrowSize * Math.sin(dimAngle + Math.PI + arrowAngle1);
                  
                  const arrow2_1_x = dx2 + arrowSize * Math.cos(dimAngle - arrowAngle1);
                  const arrow2_1_y = dy2 + arrowSize * Math.sin(dimAngle - arrowAngle1);
                  const arrow2_2_x = dx2 + arrowSize * Math.cos(dimAngle + arrowAngle1);
                  const arrow2_2_y = dy2 + arrowSize * Math.sin(dimAngle + arrowAngle1);
                  
                  return (
                    <G key={index}>
                      {/* Main line */}
                      <Line
                        x1={dx1}
                        y1={dy1}
                        x2={dx2}
                        y2={dy2}
                        stroke={element.color}
                        strokeWidth={2}
                      />
                      {/* Arrow head 1 */}
                      <Polygon
                        points={`${dx1},${dy1} ${arrow1_1_x},${arrow1_1_y} ${arrow1_2_x},${arrow1_2_y}`}
                        fill={element.color}
                      />
                      {/* Arrow head 2 */}
                      <Polygon
                        points={`${dx2},${dy2} ${arrow2_1_x},${arrow2_1_y} ${arrow2_2_x},${arrow2_2_y}`}
                        fill={element.color}
                      />
                      {/* Text */}
                      <SvgText
                        x={midX}
                        y={midY - 10}
                        fill={element.color}
                        fontSize={14}
                        fontWeight="bold"
                        textAnchor="middle"
                      >
                        {dimText}
                      </SvgText>
                    </G>
                  );
                default:
                  return null;
              }
            })}
            
            {/* Render current path being drawn */}
            {currentPath && (
              <Path
                d={currentPath}
                stroke={drawColor}
                strokeWidth={strokeWidth}
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}
          </Svg>
        </View>
      </View>

      {/* Text Input Modal */}
      {showTextInput && (
        <View style={styles.inputModal}>
          <View style={styles.inputModalContent}>
            <Text style={styles.inputModalTitle}>Text hinzufügen</Text>
            <TextInput
              style={styles.modalTextInput}
              placeholder="Text eingeben..."
              value={textInput}
              onChangeText={setTextInput}
              autoFocus
            />
            <View style={styles.inputModalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => {
                  setShowTextInput(false);
                  setTextInput('');
                  setPendingTextPosition(null);
                }}
              >
                <Text style={styles.modalButtonText}>Abbrechen</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.confirmButton]}
                onPress={addTextElement}
              >
                <Text style={styles.modalButtonTextWhite}>Hinzufügen</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {/* Dimension Input Modal */}
      {showDimensionInput && (
        <View style={styles.inputModal}>
          <View style={styles.inputModalContent}>
            <Text style={styles.inputModalTitle}>Maßangabe hinzufügen</Text>
            <TextInput
              style={styles.modalTextInput}
              placeholder="z.B. 5,40 m"
              value={dimensionInput}
              onChangeText={setDimensionInput}
              autoFocus
            />
            <View style={styles.inputModalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => {
                  setShowDimensionInput(false);
                  setDimensionInput('');
                  setPendingDimension(null);
                }}
              >
                <Text style={styles.modalButtonText}>Abbrechen</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.confirmButton]}
                onPress={addDimensionElement}
              >
                <Text style={styles.modalButtonTextWhite}>Hinzufügen</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      <View style={styles.hint}>
        <Text style={styles.hintText}>
          {drawMode === 'text' && 'Tippen Sie auf die Zeichenfläche, um Text hinzuzufügen'}
          {drawMode === 'dimension' && 'Zeichnen Sie eine Linie für die Maßangabe'}
          {drawMode !== 'text' && drawMode !== 'dimension' && 'Zeichnen Sie, fügen Sie Formen, Texte oder Maßpfeile hinzu'}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  toolbar: {
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    maxHeight: 60,
  },
  toolbarContent: {
    flexDirection: 'row',
    padding: 8,
    gap: 8,
  },
  toolButton: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    borderRadius: 8,
    backgroundColor: '#f5f5f5',
    minWidth: 48,
  },
  toolButtonActive: {
    backgroundColor: '#1976d2',
  },
  saveButton: {
    backgroundColor: '#4caf50',
  },
  strokePreview: {
    backgroundColor: '#333',
    borderRadius: 10,
  },
  titleInput: {
    backgroundColor: '#fff',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  input: {
    fontSize: 16,
    padding: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
  },
  colorPicker: {
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    maxHeight: 60,
  },
  colorPickerContent: {
    flexDirection: 'row',
    padding: 8,
    gap: 8,
    justifyContent: 'center',
  },
  colorButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: '#ddd',
  },
  colorButtonActive: {
    borderWidth: 4,
    borderColor: '#1976d2',
  },
  canvasContainer: {
    flex: 1,
    backgroundColor: '#fff',
    position: 'relative',
  },
  backgroundImage: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    opacity: 0.5,
  },
  svgContainer: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  hint: {
    padding: 12,
    backgroundColor: '#e3f2fd',
    alignItems: 'center',
  },
  hintText: {
    fontSize: 14,
    color: '#1976d2',
  },
});

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
  PanResponder,
  Modal,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { captureRef } from 'react-native-view-shot';
import axios from 'axios';
import Constants from 'expo-constants';
import Svg, { Path, Line, Circle, Rect, Image as SvgImage, Text as SvgText, G, Polygon, Defs, Marker } from 'react-native-svg';

const API_URL = Constants.expoConfig?.extra?.EXPO_PUBLIC_BACKEND_URL || process.env.EXPO_PUBLIC_BACKEND_URL;
const { width, height } = Dimensions.get('window');

interface DrawElement {
  id: string;
  type: 'path' | 'line' | 'circle' | 'rect' | 'text' | 'image' | 'arrow';
  data: any;
  color: string;
  strokeWidth: number;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  rotation?: number;
}

interface ArrowConfig {
  heads: 'single' | 'double';
  strokeWidth: number;
}

export default function DrawSketchScreen() {
  const router = useRouter();
  const { projectId, sketchId } = useLocalSearchParams();
  const canvasRef = useRef(null);
  const [title, setTitle] = useState('');
  const [elements, setElements] = useState<DrawElement[]>([]);
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const [currentPath, setCurrentPath] = useState<string>('');
  const [drawColor, setDrawColor] = useState('#000000');
  const [strokeWidth, setStrokeWidth] = useState(3);
  const [loading, setLoading] = useState(false);
  const [showTitleInput, setShowTitleInput] = useState(false);
  const [backgroundImage, setBackgroundImage] = useState<string | null>(null);
  const [drawMode, setDrawMode] = useState<'pen' | 'line' | 'circle' | 'rect' | 'text' | 'arrow' | 'select'>('pen');
  const [startPoint, setStartPoint] = useState<{ x: number; y: number } | null>(null);
  const [showTextInput, setShowTextInput] = useState(false);
  const [textInput, setTextInput] = useState('');
  const [showDimensionInput, setShowDimensionInput] = useState(false);
  const [dimensionInput, setDimensionInput] = useState('');
  const [pendingTextPosition, setPendingTextPosition] = useState<{ x: number; y: number } | null>(null);
  const [pendingArrow, setPendingArrow] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const [arrowConfig, setArrowConfig] = useState<ArrowConfig>({ heads: 'double', strokeWidth: 2 });
  const [showArrowConfig, setShowArrowConfig] = useState(false);
  const [dragMode, setDragMode] = useState<'move' | 'resize' | null>(null);
  const [resizeHandle, setResizeHandle] = useState<string | null>(null);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [originalElement, setOriginalElement] = useState<DrawElement | null>(null);

  React.useEffect(() => {
    if (sketchId) {
      loadSketch();
    }
  }, [sketchId]);

  const loadSketch = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/sketches/project/${projectId}`);
      const sketch = response.data.find((s: any) => s.id === sketchId);
      if (sketch) {
        setTitle(sketch.title || '');
        setBackgroundImage(sketch.sketch_data);
        // TODO: Load elements from sketch metadata if saved
      }
    } catch (error) {
      console.error('Error loading sketch:', error);
    }
  };

  const generateId = () => `${Date.now()}_${Math.random()}`;

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
                id: generateId(),
                type: 'image',
                data: {
                  uri: base64Image,
                },
                x: 50,
                y: 100,
                width: 200,
                height: 150,
                color: drawColor,
                strokeWidth,
                rotation: 0,
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
                id: generateId(),
                type: 'image',
                data: { uri: base64Image },
                x: 50,
                y: 100,
                width: 200,
                height: 150,
                color: drawColor,
                strokeWidth,
                rotation: 0,
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
    
    // In select mode, check if we clicked on an element or handle
    if (drawMode === 'select') {
      // First check if we clicked on a resize handle of selected element
      if (selectedElementId) {
        const selectedEl = elements.find(el => el.id === selectedElementId);
        if (selectedEl) {
          let handleHit = null;
          const handleRadius = 10;
          
          if (selectedEl.type === 'rect') {
            const x = selectedEl.data.x;
            const y = selectedEl.data.y;
            const w = selectedEl.data.width;
            const h = selectedEl.data.height;
            
            // Check corners
            if (Math.sqrt(Math.pow(locationX - x, 2) + Math.pow(locationY - y, 2)) < handleRadius) {
              handleHit = 'top-left';
            } else if (Math.sqrt(Math.pow(locationX - (x + w), 2) + Math.pow(locationY - y, 2)) < handleRadius) {
              handleHit = 'top-right';
            } else if (Math.sqrt(Math.pow(locationX - x, 2) + Math.pow(locationY - (y + h), 2)) < handleRadius) {
              handleHit = 'bottom-left';
            } else if (Math.sqrt(Math.pow(locationX - (x + w), 2) + Math.pow(locationY - (y + h), 2)) < handleRadius) {
              handleHit = 'bottom-right';
            }
            // Check sides
            else if (Math.sqrt(Math.pow(locationX - (x + w / 2), 2) + Math.pow(locationY - y, 2)) < handleRadius) {
              handleHit = 'top';
            } else if (Math.sqrt(Math.pow(locationX - (x + w / 2), 2) + Math.pow(locationY - (y + h), 2)) < handleRadius) {
              handleHit = 'bottom';
            } else if (Math.sqrt(Math.pow(locationX - x, 2) + Math.pow(locationY - (y + h / 2), 2)) < handleRadius) {
              handleHit = 'left';
            } else if (Math.sqrt(Math.pow(locationX - (x + w), 2) + Math.pow(locationY - (y + h / 2), 2)) < handleRadius) {
              handleHit = 'right';
            }
          } else if (selectedEl.type === 'circle') {
            const cx = selectedEl.data.cx;
            const cy = selectedEl.data.cy;
            const r = selectedEl.data.r;
            
            // Check radius handle (right side)
            if (Math.sqrt(Math.pow(locationX - (cx + r), 2) + Math.pow(locationY - cy, 2)) < handleRadius) {
              handleHit = 'radius';
            }
            // Check rotation handle (top)
            else if (Math.sqrt(Math.pow(locationX - cx, 2) + Math.pow(locationY - (cy - r), 2)) < handleRadius) {
              handleHit = 'rotate';
            }
          } else if (selectedEl.type === 'line') {
            const x1 = selectedEl.data.x1;
            const y1 = selectedEl.data.y1;
            const x2 = selectedEl.data.x2;
            const y2 = selectedEl.data.y2;
            
            // Check start point
            if (Math.sqrt(Math.pow(locationX - x1, 2) + Math.pow(locationY - y1, 2)) < handleRadius) {
              handleHit = 'start';
            }
            // Check end point
            else if (Math.sqrt(Math.pow(locationX - x2, 2) + Math.pow(locationY - y2, 2)) < handleRadius) {
              handleHit = 'end';
            }
            // Check rotation handle (midpoint)
            else if (Math.sqrt(Math.pow(locationX - (x1 + x2) / 2, 2) + Math.pow(locationY - (y1 + y2) / 2, 2)) < handleRadius) {
              handleHit = 'rotate';
            }
          } else if (selectedEl.type === 'arrow') {
            const x1 = selectedEl.data.x1;
            const y1 = selectedEl.data.y1;
            const x2 = selectedEl.data.x2;
            const y2 = selectedEl.data.y2;
            
            // Check start point
            if (Math.sqrt(Math.pow(locationX - x1, 2) + Math.pow(locationY - y1, 2)) < handleRadius) {
              handleHit = 'start';
            }
            // Check end point
            else if (Math.sqrt(Math.pow(locationX - x2, 2) + Math.pow(locationY - y2, 2)) < handleRadius) {
              handleHit = 'end';
            }
            // Check rotation handle (midpoint)
            else if (Math.sqrt(Math.pow(locationX - (x1 + x2) / 2, 2) + Math.pow(locationY - (y1 + y2) / 2, 2)) < handleRadius) {
              handleHit = 'rotate';
            }
          } else if (selectedEl.type === 'image') {
            const x = selectedEl.x || 0;
            const y = selectedEl.y || 0;
            const w = selectedEl.width || 100;
            const h = selectedEl.height || 100;
            
            if (Math.sqrt(Math.pow(locationX - x, 2) + Math.pow(locationY - y, 2)) < handleRadius) {
              handleHit = 'top-left';
            } else if (Math.sqrt(Math.pow(locationX - (x + w), 2) + Math.pow(locationY - y, 2)) < handleRadius) {
              handleHit = 'top-right';
            } else if (Math.sqrt(Math.pow(locationX - x, 2) + Math.pow(locationY - (y + h), 2)) < handleRadius) {
              handleHit = 'bottom-left';
            } else if (Math.sqrt(Math.pow(locationX - (x + w), 2) + Math.pow(locationY - (y + h), 2)) < handleRadius) {
              handleHit = 'bottom-right';
            } else if (Math.sqrt(Math.pow(locationX - (x + w / 2), 2) + Math.pow(locationY - y, 2)) < handleRadius) {
              handleHit = 'top';
            } else if (Math.sqrt(Math.pow(locationX - (x + w / 2), 2) + Math.pow(locationY - (y + h), 2)) < handleRadius) {
              handleHit = 'bottom';
            } else if (Math.sqrt(Math.pow(locationX - x, 2) + Math.pow(locationY - (y + h / 2), 2)) < handleRadius) {
              handleHit = 'left';
            } else if (Math.sqrt(Math.pow(locationX - (x + w), 2) + Math.pow(locationY - (y + h / 2), 2)) < handleRadius) {
              handleHit = 'right';
            }
          }
          
          if (handleHit) {
            setDragMode('resize');
            setResizeHandle(handleHit);
            setDragStart({ x: locationX, y: locationY });
            setOriginalElement(JSON.parse(JSON.stringify(selectedEl)));
            return;
          }
        }
      }
      
      // Check if we clicked on an element
      let foundElement = null;
      
      for (let i = elements.length - 1; i >= 0; i--) {
        const el = elements[i];
        let hit = false;
        
        switch (el.type) {
          case 'rect':
            hit = locationX >= el.data.x && 
                  locationX <= el.data.x + el.data.width &&
                  locationY >= el.data.y && 
                  locationY <= el.data.y + el.data.height;
            break;
          case 'circle':
            const dist = Math.sqrt(
              Math.pow(locationX - el.data.cx, 2) + 
              Math.pow(locationY - el.data.cy, 2)
            );
            hit = dist <= el.data.r;
            break;
          case 'text':
            hit = locationX >= (el.x || 0) - 20 && 
                  locationX <= (el.x || 0) + 100 &&
                  locationY >= (el.y || 0) - 20 && 
                  locationY <= (el.y || 0) + 20;
            break;
          case 'image':
            hit = locationX >= (el.x || 0) && 
                  locationX <= (el.x || 0) + (el.width || 0) &&
                  locationY >= (el.y || 0) && 
                  locationY <= (el.y || 0) + (el.height || 0);
            break;
          case 'line':
            const lineThreshold = 10;
            const dx = el.data.x2 - el.data.x1;
            const dy = el.data.y2 - el.data.y1;
            const length = Math.sqrt(dx * dx + dy * dy);
            const dot = ((locationX - el.data.x1) * dx + (locationY - el.data.y1) * dy) / (length * length);
            const closestX = el.data.x1 + dot * dx;
            const closestY = el.data.y1 + dot * dy;
            const distance = Math.sqrt(
              Math.pow(locationX - closestX, 2) + 
              Math.pow(locationY - closestY, 2)
            );
            hit = distance <= lineThreshold && dot >= 0 && dot <= 1;
            break;
          case 'arrow':
            const arrowThreshold = 10;
            const adx = el.data.x2 - el.data.x1;
            const ady = el.data.y2 - el.data.y1;
            const alength = Math.sqrt(adx * adx + ady * ady);
            const adot = ((locationX - el.data.x1) * adx + (locationY - el.data.y1) * ady) / (alength * alength);
            const aclosestX = el.data.x1 + adot * adx;
            const aclosestY = el.data.y1 + adot * ady;
            const adistance = Math.sqrt(
              Math.pow(locationX - aclosestX, 2) + 
              Math.pow(locationY - aclosestY, 2)
            );
            hit = adistance <= arrowThreshold && adot >= 0 && adot <= 1;
            break;
        }
        
        if (hit) {
          foundElement = el;
          break;
        }
      }
      
      if (foundElement) {
        setSelectedElementId(foundElement.id);
        setDragMode('move');
        setDragStart({ x: locationX, y: locationY });
        setOriginalElement(JSON.parse(JSON.stringify(foundElement)));
      } else {
        setSelectedElementId(null);
      }
      return;
    }
    
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
    const { locationX, locationY } = event.nativeEvent;
    
    // Handle dragging/resizing in select mode
    if (drawMode === 'select' && dragStart && originalElement) {
      const dx = locationX - dragStart.x;
      const dy = locationY - dragStart.y;
      
      const updatedElements = elements.map(el => {
        if (el.id !== selectedElementId) return el;
        
        const newEl = { ...el };
        
        if (dragMode === 'move') {
          // Move element
          if (el.type === 'rect') {
            newEl.data = {
              ...el.data,
              x: originalElement.data.x + dx,
              y: originalElement.data.y + dy,
            };
          } else if (el.type === 'image' || el.type === 'text') {
            newEl.x = (originalElement.x || 0) + dx;
            newEl.y = (originalElement.y || 0) + dy;
          } else if (el.type === 'circle') {
            newEl.data = {
              ...el.data,
              cx: originalElement.data.cx + dx,
              cy: originalElement.data.cy + dy,
            };
          } else if (el.type === 'line' || el.type === 'arrow') {
            newEl.data = {
              ...el.data,
              x1: originalElement.data.x1 + dx,
              y1: originalElement.data.y1 + dy,
              x2: originalElement.data.x2 + dx,
              y2: originalElement.data.y2 + dy,
            };
          }
        } else if (dragMode === 'resize' && resizeHandle) {
          // Resize element
          if (el.type === 'circle') {
            if (resizeHandle === 'radius') {
              const newRadius = Math.sqrt(
                Math.pow(locationX - originalElement.data.cx, 2) + 
                Math.pow(locationY - originalElement.data.cy, 2)
              );
              newEl.data = {
                ...el.data,
                r: Math.max(10, newRadius),
              };
            }
          } else if (el.type === 'line') {
            if (resizeHandle === 'start') {
              newEl.data = {
                ...el.data,
                x1: locationX,
                y1: locationY,
              };
            } else if (resizeHandle === 'end') {
              newEl.data = {
                ...el.data,
                x2: locationX,
                y2: locationY,
              };
            }
          } else if (el.type === 'arrow') {
            if (resizeHandle === 'start') {
              newEl.data = {
                ...el.data,
                x1: locationX,
                y1: locationY,
              };
            } else if (resizeHandle === 'end') {
              newEl.data = {
                ...el.data,
                x2: locationX,
                y2: locationY,
              };
            }
          } else if (el.type === 'rect') {
            const origData = originalElement.data;
            let newData = { ...el.data };
            
            if (resizeHandle.includes('right')) {
              newData.width = origData.width + dx;
            }
            if (resizeHandle.includes('left')) {
              newData.x = origData.x + dx;
              newData.width = origData.width - dx;
            }
            if (resizeHandle.includes('bottom')) {
              newData.height = origData.height + dy;
            }
            if (resizeHandle.includes('top')) {
              newData.y = origData.y + dy;
              newData.height = origData.height - dy;
            }
            
            newEl.data = newData;
          } else if (el.type === 'image') {
            let newX = originalElement.x || 0;
            let newY = originalElement.y || 0;
            let newW = originalElement.width || 100;
            let newH = originalElement.height || 100;
            
            if (resizeHandle.includes('right')) {
              newW = (originalElement.width || 100) + dx;
            }
            if (resizeHandle.includes('left')) {
              newX = (originalElement.x || 0) + dx;
              newW = (originalElement.width || 100) - dx;
            }
            if (resizeHandle.includes('bottom')) {
              newH = (originalElement.height || 100) + dy;
            }
            if (resizeHandle.includes('top')) {
              newY = (originalElement.y || 0) + dy;
              newH = (originalElement.height || 100) - dy;
            }
            
            newEl.x = newX;
            newEl.y = newY;
            newEl.width = Math.max(20, newW);
            newEl.height = Math.max(20, newH);
          }
        }
        
        return newEl;
      });
      
      setElements(updatedElements);
      return;
    }
    
    if (drawMode !== 'pen') return;
    
    setCurrentPath((prev) => `${prev} L ${locationX} ${locationY}`);
  };

  const onTouchEnd = (event: any) => {
    // End drag/resize operation
    if (drawMode === 'select' && (dragMode === 'move' || dragMode === 'resize')) {
      setDragMode(null);
      setResizeHandle(null);
      setDragStart(null);
      setOriginalElement(null);
      return;
    }
    
    if (drawMode === 'text' || drawMode === 'select') return;

    const { locationX, locationY } = event.nativeEvent;

    if (drawMode === 'pen' && currentPath) {
      const newElement: DrawElement = {
        id: generateId(),
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
            id: generateId(),
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
            id: generateId(),
            type: 'circle',
            data: { cx: startPoint.x, cy: startPoint.y, r: radius },
            color: drawColor,
            strokeWidth,
          };
          break;
        case 'rect':
          newElement = {
            id: generateId(),
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
        case 'arrow':
          setPendingArrow({
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
        id: generateId(),
        type: 'text',
        data: {
          text: textInput,
        },
        x: pendingTextPosition.x,
        y: pendingTextPosition.y,
        color: drawColor,
        strokeWidth,
        rotation: 0,
      };
      setElements([...elements, newElement]);
      setTextInput('');
      setPendingTextPosition(null);
      setShowTextInput(false);
    }
  };

  const addArrowElement = () => {
    if (dimensionInput.trim() && pendingArrow) {
      const { x1, y1, x2, y2 } = pendingArrow;
      
      const newElement: DrawElement = {
        id: generateId(),
        type: 'arrow',
        data: {
          x1,
          y1,
          x2,
          y2,
          text: dimensionInput,
          heads: arrowConfig.heads,
        },
        color: drawColor,
        strokeWidth: arrowConfig.strokeWidth,
      };
      
      setElements([...elements, newElement]);
      setDimensionInput('');
      setPendingArrow(null);
      setShowDimensionInput(false);
    }
  };

  const deleteElement = (id: string) => {
    Alert.alert(
      'Element löschen',
      'Möchten Sie dieses Element wirklich löschen?',
      [
        { text: 'Abbrechen', style: 'cancel' },
        {
          text: 'Löschen',
          style: 'destructive',
          onPress: () => {
            setElements(elements.filter(el => el.id !== id));
            setSelectedElementId(null);
          },
        },
      ]
    );
  };

  const undo = () => {
    if (elements.length > 0) {
      setElements(elements.slice(0, -1));
      setSelectedElementId(null);
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
            setSelectedElementId(null);
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
      const uri = await captureRef(canvasRef, {
        format: 'png',
        quality: 0.8,
        result: 'base64',
      });

      const base64Image = `data:image/png;base64,${uri}`;

      if (sketchId) {
        // Update existing sketch
        await axios.put(`${API_URL}/api/sketches/${sketchId}`, {
          project_id: projectId,
          sketch_data: base64Image,
          title: title || undefined,
        });
      } else {
        // Create new sketch
        await axios.post(`${API_URL}/api/sketches`, {
          project_id: projectId,
          sketch_data: base64Image,
          title: title || undefined,
        });
      }

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

  const renderElement = (element: DrawElement, index: number) => {
    const isSelected = element.id === selectedElementId;
    
    switch (element.type) {
      case 'path':
        return (
          <G key={element.id}>
            <Path
              d={element.data}
              stroke={element.color}
              strokeWidth={element.strokeWidth}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {isSelected && (
              <Circle cx={0} cy={0} r={8} fill="#1976d2" opacity={0.5} />
            )}
          </G>
        );
      case 'line':
        return (
          <G key={element.id}>
            <Line
              x1={element.data.x1}
              y1={element.data.y1}
              x2={element.data.x2}
              y2={element.data.y2}
              stroke={element.color}
              strokeWidth={element.strokeWidth}
            />
            {isSelected && (
              <>
                {/* Start point handle (green) */}
                <Circle cx={element.data.x1} cy={element.data.y1} r={8} fill="#4caf50" stroke="#fff" strokeWidth={2} />
                {/* End point handle (green) */}
                <Circle cx={element.data.x2} cy={element.data.y2} r={8} fill="#4caf50" stroke="#fff" strokeWidth={2} />
                {/* Rotation handle (orange) at midpoint */}
                <Circle 
                  cx={(element.data.x1 + element.data.x2) / 2} 
                  cy={(element.data.y1 + element.data.y2) / 2} 
                  r={8} 
                  fill="#FF9800" 
                  stroke="#fff" 
                  strokeWidth={2} 
                />
                <SvgText 
                  x={(element.data.x1 + element.data.x2) / 2 - 4} 
                  y={(element.data.y1 + element.data.y2) / 2 + 5} 
                  fill="#fff" 
                  fontSize={10}
                >↻</SvgText>
              </>
            )}
          </G>
        );
      case 'circle':
        return (
          <G key={element.id}>
            <Circle
              cx={element.data.cx}
              cy={element.data.cy}
              r={element.data.r}
              stroke={element.color}
              strokeWidth={element.strokeWidth}
              fill="none"
            />
            {isSelected && (
              <>
                {/* Center handle */}
                <Circle cx={element.data.cx} cy={element.data.cy} r={6} fill="#1976d2" stroke="#fff" strokeWidth={2} />
                {/* Radius handle (right side) */}
                <Circle cx={element.data.cx + element.data.r} cy={element.data.cy} r={8} fill="#4caf50" stroke="#fff" strokeWidth={2} />
                <SvgText x={element.data.cx + element.data.r - 4} y={element.data.cy + 5} fill="#fff" fontSize={10}>↔</SvgText>
                {/* Rotation handle (top) */}
                <Circle cx={element.data.cx} cy={element.data.cy - element.data.r} r={8} fill="#FF9800" stroke="#fff" strokeWidth={2} />
                <SvgText x={element.data.cx - 4} y={element.data.cy - element.data.r + 5} fill="#fff" fontSize={10}>↻</SvgText>
              </>
            )}
          </G>
        );
      case 'rect':
        return (
          <G key={element.id}>
            <Rect
              x={element.data.x}
              y={element.data.y}
              width={element.data.width}
              height={element.data.height}
              stroke={element.color}
              strokeWidth={element.strokeWidth}
              fill="none"
            />
            {isSelected && (
              <>
                {/* Selection border */}
                <Rect
                  x={element.data.x - 4}
                  y={element.data.y - 4}
                  width={element.data.width + 8}
                  height={element.data.height + 8}
                  stroke="#1976d2"
                  strokeWidth={2}
                  strokeDasharray="5,5"
                  fill="none"
                />
                {/* Corner handles */}
                <Circle cx={element.data.x} cy={element.data.y} r={6} fill="#1976d2" stroke="#fff" strokeWidth={2} />
                <Circle cx={element.data.x + element.data.width} cy={element.data.y} r={6} fill="#1976d2" stroke="#fff" strokeWidth={2} />
                <Circle cx={element.data.x} cy={element.data.y + element.data.height} r={6} fill="#1976d2" stroke="#fff" strokeWidth={2} />
                <Circle cx={element.data.x + element.data.width} cy={element.data.y + element.data.height} r={6} fill="#1976d2" stroke="#fff" strokeWidth={2} />
                {/* Side handles with arrows */}
                {/* Top */}
                <G>
                  <Circle cx={element.data.x + element.data.width / 2} cy={element.data.y} r={6} fill="#4caf50" stroke="#fff" strokeWidth={2} />
                  <SvgText x={element.data.x + element.data.width / 2 - 4} y={element.data.y + 5} fill="#fff" fontSize={10}>↕</SvgText>
                </G>
                {/* Bottom */}
                <G>
                  <Circle cx={element.data.x + element.data.width / 2} cy={element.data.y + element.data.height} r={6} fill="#4caf50" stroke="#fff" strokeWidth={2} />
                  <SvgText x={element.data.x + element.data.width / 2 - 4} y={element.data.y + element.data.height + 5} fill="#fff" fontSize={10}>↕</SvgText>
                </G>
                {/* Left */}
                <G>
                  <Circle cx={element.data.x} cy={element.data.y + element.data.height / 2} r={6} fill="#4caf50" stroke="#fff" strokeWidth={2} />
                  <SvgText x={element.data.x - 4} y={element.data.y + element.data.height / 2 + 5} fill="#fff" fontSize={10}>↔</SvgText>
                </G>
                {/* Right */}
                <G>
                  <Circle cx={element.data.x + element.data.width} cy={element.data.y + element.data.height / 2} r={6} fill="#4caf50" stroke="#fff" strokeWidth={2} />
                  <SvgText x={element.data.x + element.data.width - 4} y={element.data.y + element.data.height / 2 + 5} fill="#fff" fontSize={10}>↔</SvgText>
                </G>
              </>
            )}
          </G>
        );
      case 'text':
        return (
          <G key={element.id}>
            <SvgText
              x={element.x}
              y={element.y}
              fill={element.color}
              fontSize={16}
              fontWeight="bold"
            >
              {element.data.text}
            </SvgText>
            {isSelected && (
              <Circle cx={element.x} cy={element.y} r={8} fill="#1976d2" opacity={0.5} />
            )}
          </G>
        );
      case 'image':
        const imgX = element.x || 0;
        const imgY = element.y || 0;
        const imgW = element.width || 100;
        const imgH = element.height || 100;
        return (
          <G key={element.id}>
            <SvgImage
              href={element.data.uri}
              x={imgX}
              y={imgY}
              width={imgW}
              height={imgH}
            />
            {isSelected && (
              <>
                {/* Selection border */}
                <Rect
                  x={imgX - 4}
                  y={imgY - 4}
                  width={imgW + 8}
                  height={imgH + 8}
                  stroke="#1976d2"
                  strokeWidth={2}
                  strokeDasharray="5,5"
                  fill="none"
                />
                {/* Corner handles */}
                <Circle cx={imgX} cy={imgY} r={6} fill="#1976d2" stroke="#fff" strokeWidth={2} />
                <Circle cx={imgX + imgW} cy={imgY} r={6} fill="#1976d2" stroke="#fff" strokeWidth={2} />
                <Circle cx={imgX} cy={imgY + imgH} r={6} fill="#1976d2" stroke="#fff" strokeWidth={2} />
                <Circle cx={imgX + imgW} cy={imgY + imgH} r={6} fill="#1976d2" stroke="#fff" strokeWidth={2} />
                {/* Side handles with arrows */}
                <G>
                  <Circle cx={imgX + imgW / 2} cy={imgY} r={6} fill="#4caf50" stroke="#fff" strokeWidth={2} />
                  <SvgText x={imgX + imgW / 2 - 4} y={imgY + 5} fill="#fff" fontSize={10}>↕</SvgText>
                </G>
                <G>
                  <Circle cx={imgX + imgW / 2} cy={imgY + imgH} r={6} fill="#4caf50" stroke="#fff" strokeWidth={2} />
                  <SvgText x={imgX + imgW / 2 - 4} y={imgY + imgH + 5} fill="#fff" fontSize={10}>↕</SvgText>
                </G>
                <G>
                  <Circle cx={imgX} cy={imgY + imgH / 2} r={6} fill="#4caf50" stroke="#fff" strokeWidth={2} />
                  <SvgText x={imgX - 4} y={imgY + imgH / 2 + 5} fill="#fff" fontSize={10}>↔</SvgText>
                </G>
                <G>
                  <Circle cx={imgX + imgW} cy={imgY + imgH / 2} r={6} fill="#4caf50" stroke="#fff" strokeWidth={2} />
                  <SvgText x={imgX + imgW - 4} y={imgY + imgH / 2 + 5} fill="#fff" fontSize={10}>↔</SvgText>
                </G>
              </>
            )}
          </G>
        );
      case 'arrow':
        const { x1, y1, x2, y2, text: arrowText, heads } = element.data;
        const dx = x2 - x1;
        const dy = y2 - y1;
        const angle = Math.atan2(dy, dx);
        const length = Math.sqrt(dx * dx + dy * dy);
        const arrowSize = 15;
        const arrowAngle = Math.PI / 6;
        
        const midX = (x1 + x2) / 2;
        const midY = (y1 + y2) / 2;
        
        return (
          <G key={element.id}>
            <Defs>
              <Marker
                id={`arrowhead-${element.id}`}
                markerWidth="10"
                markerHeight="10"
                refX="5"
                refY="3"
                orient="auto"
                markerUnits="strokeWidth"
              >
                <Polygon
                  points="0,0 0,6 9,3"
                  fill={element.color}
                />
              </Marker>
            </Defs>
            <Line
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke={element.color}
              strokeWidth={element.strokeWidth}
              markerEnd={`url(#arrowhead-${element.id})`}
              markerStart={heads === 'double' ? `url(#arrowhead-${element.id})` : undefined}
            />
            {arrowText && (
              <SvgText
                x={midX}
                y={midY - 10}
                fill={element.color}
                fontSize={14}
                fontWeight="bold"
                textAnchor="middle"
              >
                {arrowText}
              </SvgText>
            )}
            {isSelected && (
              <>
                {/* Start point handle (green) */}
                <Circle cx={x1} cy={y1} r={8} fill="#4caf50" stroke="#fff" strokeWidth={2} />
                {/* End point handle (green) */}
                <Circle cx={x2} cy={y2} r={8} fill="#4caf50" stroke="#fff" strokeWidth={2} />
                {/* Rotation handle (orange) at midpoint */}
                <Circle cx={midX} cy={midY} r={8} fill="#FF9800" stroke="#fff" strokeWidth={2} />
                <SvgText x={midX - 4} y={midY + 5} fill="#fff" fontSize={10}>↻</SvgText>
              </>
            )}
          </G>
        );
      default:
        return null;
    }
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
          style={[styles.toolButton, drawMode === 'select' && styles.toolButtonActive]} 
          onPress={() => setDrawMode('select')}
        >
          <Ionicons name="hand-left" size={24} color={drawMode === 'select' ? '#fff' : '#1976d2'} />
        </TouchableOpacity>

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
          style={[styles.toolButton, drawMode === 'arrow' && styles.toolButtonActive]} 
          onPress={() => {
            setDrawMode('arrow');
            setShowArrowConfig(true);
          }}
        >
          <Ionicons name="arrow-forward" size={24} color={drawMode === 'arrow' ? '#fff' : '#1976d2'} />
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

        {selectedElementId && (
          <TouchableOpacity 
            style={[styles.toolButton, styles.deleteButton]} 
            onPress={() => deleteElement(selectedElementId)}
          >
            <Ionicons name="trash" size={24} color="#fff" />
          </TouchableOpacity>
        )}

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
          <Svg height="100%" width="100%">
            {elements.map((element, index) => renderElement(element, index))}
            
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

      {/* Arrow Config Modal */}
      {showArrowConfig && (
        <View style={styles.inputModal}>
          <View style={styles.inputModalContent}>
            <Text style={styles.inputModalTitle}>Pfeil-Einstellungen</Text>
            
            <Text style={styles.label}>Pfeilspitzen:</Text>
            <View style={styles.optionButtons}>
              <TouchableOpacity
                style={[
                  styles.optionButton,
                  arrowConfig.heads === 'single' && styles.optionButtonActive,
                ]}
                onPress={() => setArrowConfig({ ...arrowConfig, heads: 'single' })}
              >
                <Text style={styles.optionButtonText}>Einfach →</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.optionButton,
                  arrowConfig.heads === 'double' && styles.optionButtonActive,
                ]}
                onPress={() => setArrowConfig({ ...arrowConfig, heads: 'double' })}
              >
                <Text style={styles.optionButtonText}>Doppelt ↔</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.label}>Linienstärke:</Text>
            <View style={styles.optionButtons}>
              {[2, 4, 6].map(width => (
                <TouchableOpacity
                  key={width}
                  style={[
                    styles.optionButton,
                    arrowConfig.strokeWidth === width && styles.optionButtonActive,
                  ]}
                  onPress={() => setArrowConfig({ ...arrowConfig, strokeWidth: width })}
                >
                  <Text style={styles.optionButtonText}>{width}px</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.inputModalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.confirmButton]}
                onPress={() => setShowArrowConfig(false)}
              >
                <Text style={styles.modalButtonTextWhite}>OK</Text>
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
                  setPendingArrow(null);
                }}
              >
                <Text style={styles.modalButtonText}>Abbrechen</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.confirmButton]}
                onPress={addArrowElement}
              >
                <Text style={styles.modalButtonTextWhite}>Hinzufügen</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      <View style={styles.hint}>
        <Text style={styles.hintText}>
          {drawMode === 'select' && 'Wählen Sie ein Element zum Bearbeiten'}
          {drawMode === 'text' && 'Tippen Sie auf die Zeichenfläche für Text'}
          {drawMode === 'arrow' && 'Zeichnen Sie eine Linie für Maßpfeil'}
          {!['select', 'text', 'arrow'].includes(drawMode) && 'Zeichnen Sie oder wählen Sie ein Werkzeug'}
        </Text>
        {selectedElementId && (
          <Text style={styles.hintTextSmall}>Element ausgewählt - Löschen im Toolbar</Text>
        )}
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
  deleteButton: {
    backgroundColor: '#f44336',
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
    fontWeight: '600',
  },
  hintTextSmall: {
    fontSize: 12,
    color: '#1976d2',
    marginTop: 4,
  },
  inputModal: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  inputModalContent: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    width: '80%',
    maxWidth: 400,
  },
  inputModalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 16,
  },
  modalTextInput: {
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#ddd',
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginTop: 12,
    marginBottom: 8,
  },
  optionButtons: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  optionButton: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    backgroundColor: '#f5f5f5',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#ddd',
  },
  optionButtonActive: {
    backgroundColor: '#e3f2fd',
    borderColor: '#1976d2',
  },
  optionButtonText: {
    fontSize: 14,
    color: '#333',
    fontWeight: '600',
  },
  inputModalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  modalButton: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: '#f5f5f5',
    borderWidth: 1,
    borderColor: '#ddd',
  },
  confirmButton: {
    backgroundColor: '#1976d2',
  },
  modalButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  modalButtonTextWhite: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
});

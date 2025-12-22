import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  TextInput,
  Dimensions,
  Platform,
  ScrollView,
  Modal,
  KeyboardAvoidingView,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import axios from 'axios';
import Constants from 'expo-constants';
import Svg, { 
  Path, 
  Line, 
  Circle, 
  Rect, 
  Image as SvgImage, 
  Text as SvgText, 
  G, 
  Defs, 
  Marker,
  Polygon 
} from 'react-native-svg';

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

type DrawMode = 'select' | 'pen' | 'line' | 'circle' | 'rect' | 'arrow' | 'text' | 'image';

export default function DrawSketchScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const projectId = Array.isArray(params.projectId) ? params.projectId[0] : params.projectId;
  const sketchId = Array.isArray(params.sketchId) ? params.sketchId[0] : params.sketchId;
  
  const canvasRef = useRef(null);
  const svgRef = useRef(null);
  
  // State
  const [title, setTitle] = useState('Neue Skizze');
  const [elements, setElements] = useState<DrawElement[]>([]);
  const [history, setHistory] = useState<DrawElement[][]>([[]]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const [drawMode, setDrawMode] = useState<DrawMode>('pen');
  const [drawColor, setDrawColor] = useState('#000000');
  const [strokeWidth, setStrokeWidth] = useState(3);
  const [loading, setLoading] = useState(false);
  
  // Drawing state
  const [currentPath, setCurrentPath] = useState('');
  const [startPoint, setStartPoint] = useState<{ x: number; y: number } | null>(null);
  const [tempElement, setTempElement] = useState<DrawElement | null>(null);
  
  // Transform state
  const [dragMode, setDragMode] = useState<'move' | 'resize' | 'rotate' | null>(null);
  const [resizeHandle, setResizeHandle] = useState<string | null>(null);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [originalElement, setOriginalElement] = useState<DrawElement | null>(null);
  
  // Zoom & Pan
  const [scale, setScale] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  
  // Modals
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showTextModal, setShowTextModal] = useState(false);
  const [showArrowModal, setShowArrowModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [textInput, setTextInput] = useState('');
  const [arrowText, setArrowText] = useState('');
  const [arrowHeads, setArrowHeads] = useState<'single' | 'double'>('double');
  
  // Background
  const [backgroundImage, setBackgroundImage] = useState<string | null>(null);

  // Load existing sketch
  React.useEffect(() => {
    if (sketchId) {
      loadSketch();
    }
  }, [sketchId]);

  const loadSketch = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${API_URL}/api/sketches/project/${projectId}`);
      const sketch = response.data.find((s: any) => s.id === sketchId);
      
      if (sketch) {
        setTitle(sketch.title || 'Skizze');
        
        // Parse saved elements if available
        if (sketch.metadata) {
          try {
            const metadata = JSON.parse(sketch.metadata);
            if (metadata.elements && Array.isArray(metadata.elements)) {
              setElements(metadata.elements);
              setHistory([metadata.elements]);
              setHistoryIndex(0);
            }
            if (metadata.backgroundImage) {
              setBackgroundImage(metadata.backgroundImage);
            }
          } catch (e) {
            console.error('Error parsing metadata:', e);
          }
        }
      }
    } catch (error) {
      console.error('Error loading sketch:', error);
      showAlert('Fehler', 'Skizze konnte nicht geladen werden');
    } finally {
      setLoading(false);
    }
  };

  const generateId = () => `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  const showAlert = (title: string, message: string) => {
    if (Platform.OS === 'web') {
      alert(`${title}: ${message}`);
    } else {
      Alert.alert(title, message);
    }
  };

  // History management (Undo/Redo)
  const addToHistory = (newElements: DrawElement[]) => {
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(newElements);
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
    setElements(newElements);
  };

  const undo = () => {
    if (historyIndex > 0) {
      setHistoryIndex(historyIndex - 1);
      setElements(history[historyIndex - 1]);
      setSelectedElementId(null);
    }
  };

  const redo = () => {
    if (historyIndex < history.length - 1) {
      setHistoryIndex(historyIndex + 1);
      setElements(history[historyIndex + 1]);
      setSelectedElementId(null);
    }
  };

  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < history.length - 1;

  // Delete selected element
  const deleteSelectedElement = () => {
    if (selectedElementId) {
      const newElements = elements.filter(el => el.id !== selectedElementId);
      addToHistory(newElements);
      setSelectedElementId(null);
      setShowDeleteConfirm(false);
    }
  };

  // Clear all
  const clearAll = () => {
    addToHistory([]);
    setSelectedElementId(null);
  };

  // Background image
  const pickBackgroundImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.8,
        base64: true,
      });

      if (!result.canceled && result.assets[0].base64) {
        const base64Image = `data:image/jpeg;base64,${result.assets[0].base64}`;
        setBackgroundImage(base64Image);
      }
    } catch (error) {
      console.error('Error picking image:', error);
      showAlert('Fehler', 'Bild konnte nicht ausgewählt werden');
    }
  };

  const takeBackgroundPhoto = async () => {
    try {
      if (Platform.OS !== 'web') {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') {
          showAlert('Berechtigung erforderlich', 'Kamera-Zugriff wird benötigt');
          return;
        }
      }

      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        quality: 0.8,
        base64: true,
      });

      if (!result.canceled && result.assets[0].base64) {
        const base64Image = `data:image/jpeg;base64,${result.assets[0].base64}`;
        setBackgroundImage(base64Image);
      }
    } catch (error) {
      console.error('Error taking photo:', error);
      showAlert('Fehler', 'Foto konnte nicht aufgenommen werden');
    }
  };

  // Insert image on canvas
  const insertImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.7,
        base64: true,
      });

      if (!result.canceled && result.assets[0].base64) {
        const base64Image = `data:image/jpeg;base64,${result.assets[0].base64}`;
        const newElement: DrawElement = {
          id: generateId(),
          type: 'image',
          data: { uri: base64Image },
          color: '#000000',
          strokeWidth: 0,
          x: 100,
          y: 100,
          width: 200,
          height: 200,
          rotation: 0,
        };
        addToHistory([...elements, newElement]);
      }
    } catch (error) {
      console.error('Error inserting image:', error);
      showAlert('Fehler', 'Bild konnte nicht eingefügt werden');
    }
  };

  // Touch handlers
  const onTouchStart = (event: any) => {
    const touch = event.nativeEvent.touches ? event.nativeEvent.touches[0] : event.nativeEvent;
    const locationX = (touch.locationX || touch.pageX) / scale - panOffset.x / scale;
    const locationY = (touch.locationY || touch.pageY) / scale - panOffset.y / scale;

    if (drawMode === 'select') {
      handleSelectTouchStart(locationX, locationY);
    } else if (drawMode === 'text') {
      // Show text input modal
      setPendingPosition({ x: locationX, y: locationY });
      setShowTextModal(true);
    } else if (drawMode === 'pen') {
      setCurrentPath(`M ${locationX} ${locationY}`);
    } else {
      // Other drawing modes
      setStartPoint({ x: locationX, y: locationY });
    }
  };

  const onTouchMove = (event: any) => {
    const touch = event.nativeEvent.touches ? event.nativeEvent.touches[0] : event.nativeEvent;
    const locationX = (touch.locationX || touch.pageX) / scale - panOffset.x / scale;
    const locationY = (touch.locationY || touch.pageY) / scale - panOffset.y / scale;

    if (drawMode === 'select' && dragMode && originalElement && dragStart) {
      handleSelectTouchMove(locationX, locationY);
    } else if (drawMode === 'pen' && currentPath) {
      setCurrentPath(prev => `${prev} L ${locationX} ${locationY}`);
    } else if (startPoint && drawMode !== 'text') {
      // Preview for other shapes
      createTempElement(startPoint, locationX, locationY);
    }
  };

  const onTouchEnd = (event: any) => {
    if (drawMode === 'pen' && currentPath && currentPath.length > 0) {
      const newElement: DrawElement = {
        id: generateId(),
        type: 'path',
        data: currentPath,
        color: drawColor,
        strokeWidth,
        rotation: 0,
      };
      addToHistory([...elements, newElement]);
      setCurrentPath('');
    } else if (drawMode === 'select' && dragMode) {
      // Finish transform
      setDragMode(null);
      setResizeHandle(null);
      setDragStart(null);
      setOriginalElement(null);
    } else if (startPoint && drawMode === 'arrow') {
      const touch = event.nativeEvent.changedTouches ? event.nativeEvent.changedTouches[0] : event.nativeEvent;
      const locationX = (touch.locationX || touch.pageX) / scale - panOffset.x / scale;
      const locationY = (touch.locationY || touch.pageY) / scale - panOffset.y / scale;
      
      // Show arrow text input
      setPendingArrow({ x1: startPoint.x, y1: startPoint.y, x2: locationX, y2: locationY });
      setShowArrowModal(true);
      setStartPoint(null);
      setTempElement(null);
    } else if (startPoint && tempElement) {
      addToHistory([...elements, tempElement]);
      setStartPoint(null);
      setTempElement(null);
    }
  };

  // Helper: Create temporary preview element
  const createTempElement = (start: { x: number; y: number }, endX: number, endY: number) => {
    let element: DrawElement | null = null;

    switch (drawMode) {
      case 'line':
        element = {
          id: 'temp',
          type: 'line',
          data: { x1: start.x, y1: start.y, x2: endX, y2: endY },
          color: drawColor,
          strokeWidth,
          rotation: 0,
        };
        break;
      case 'circle':
        const radius = Math.sqrt(Math.pow(endX - start.x, 2) + Math.pow(endY - start.y, 2));
        element = {
          id: 'temp',
          type: 'circle',
          data: { cx: start.x, cy: start.y, r: radius },
          color: drawColor,
          strokeWidth,
          rotation: 0,
        };
        break;
      case 'rect':
        element = {
          id: 'temp',
          type: 'rect',
          data: {
            x: Math.min(start.x, endX),
            y: Math.min(start.y, endY),
            width: Math.abs(endX - start.x),
            height: Math.abs(endY - start.y),
          },
          color: drawColor,
          strokeWidth,
          rotation: 0,
        };
        break;
      case 'arrow':
        element = {
          id: 'temp',
          type: 'arrow',
          data: { x1: start.x, y1: start.y, x2: endX, y2: endY, text: '', heads: arrowHeads },
          color: drawColor,
          strokeWidth: 2,
          rotation: 0,
        };
        break;
    }

    setTempElement(element);
  };

  const [pendingPosition, setPendingPosition] = useState<{ x: number; y: number } | null>(null);
  const [pendingArrow, setPendingArrow] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);

  // Add text element
  const addTextElement = () => {
    if (textInput.trim() && pendingPosition) {
      const newElement: DrawElement = {
        id: generateId(),
        type: 'text',
        data: { text: textInput },
        color: drawColor,
        strokeWidth: 0,
        x: pendingPosition.x,
        y: pendingPosition.y,
        rotation: 0,
      };
      addToHistory([...elements, newElement]);
      setTextInput('');
      setPendingPosition(null);
      setShowTextModal(false);
    }
  };

  // Add arrow element
  const addArrowElement = () => {
    if (pendingArrow) {
      const newElement: DrawElement = {
        id: generateId(),
        type: 'arrow',
        data: {
          x1: pendingArrow.x1,
          y1: pendingArrow.y1,
          x2: pendingArrow.x2,
          y2: pendingArrow.y2,
          text: arrowText,
          heads: arrowHeads,
        },
        color: drawColor,
        strokeWidth: 2,
        rotation: 0,
      };
      addToHistory([...elements, newElement]);
      setArrowText('');
      setPendingArrow(null);
      setShowArrowModal(false);
    }
  };

  // Selection & Transform handlers
  const handleSelectTouchStart = (locationX: number, locationY: number) => {
    // Check if clicking on transformation handles first
    if (selectedElementId) {
      const selectedEl = elements.find(el => el.id === selectedElementId);
      if (selectedEl) {
        const handle = checkTransformHandles(selectedEl, locationX, locationY);
        if (handle) {
          setDragMode(handle.type === 'rotate' ? 'rotate' : 'resize');
          setResizeHandle(handle.handle);
          setDragStart({ x: locationX, y: locationY });
          setOriginalElement(JSON.parse(JSON.stringify(selectedEl)));
          return;
        }
      }
    }

    // Check if clicking on an element
    const clickedElement = findElementAtPoint(locationX, locationY);
    if (clickedElement) {
      setSelectedElementId(clickedElement.id);
      setDragMode('move');
      setDragStart({ x: locationX, y: locationY });
      setOriginalElement(JSON.parse(JSON.stringify(clickedElement)));
    } else {
      setSelectedElementId(null);
    }
  };

  const handleSelectTouchMove = (locationX: number, locationY: number) => {
    if (!originalElement || !dragStart) return;

    const dx = locationX - dragStart.x;
    const dy = locationY - dragStart.y;

    const newElements = elements.map(el => {
      if (el.id !== selectedElementId) return el;

      const newEl = { ...el };

      if (dragMode === 'move') {
        // Move element
        if (el.type === 'path') {
          // Move path by shifting all coordinates
          const pathRegex = /([ML])\s*(-?\d+\.?\d*)\s+(-?\d+\.?\d*)/g;
          newEl.data = originalElement.data.replace(pathRegex, (match: string, cmd: string, x: string, y: string) => {
            return `${cmd} ${parseFloat(x) + dx} ${parseFloat(y) + dy}`;
          });
        } else if (el.type === 'line' || el.type === 'arrow') {
          newEl.data = {
            ...el.data,
            x1: originalElement.data.x1 + dx,
            y1: originalElement.data.y1 + dy,
            x2: originalElement.data.x2 + dx,
            y2: originalElement.data.y2 + dy,
          };
        } else if (el.type === 'circle') {
          newEl.data = {
            ...el.data,
            cx: originalElement.data.cx + dx,
            cy: originalElement.data.cy + dy,
          };
        } else if (el.type === 'rect') {
          newEl.data = {
            ...el.data,
            x: originalElement.data.x + dx,
            y: originalElement.data.y + dy,
          };
        } else if (el.type === 'text' || el.type === 'image') {
          newEl.x = (originalElement.x || 0) + dx;
          newEl.y = (originalElement.y || 0) + dy;
        }
      } else if (dragMode === 'rotate' && resizeHandle === 'rotate') {
        // Rotate element
        let centerX = 0, centerY = 0;
        
        if (el.type === 'circle') {
          centerX = originalElement.data.cx;
          centerY = originalElement.data.cy;
        } else if (el.type === 'line' || el.type === 'arrow') {
          centerX = (originalElement.data.x1 + originalElement.data.x2) / 2;
          centerY = (originalElement.data.y1 + originalElement.data.y2) / 2;
        } else if (el.type === 'rect') {
          centerX = originalElement.data.x + originalElement.data.width / 2;
          centerY = originalElement.data.y + originalElement.data.height / 2;
        } else if (el.type === 'image' || el.type === 'text') {
          centerX = (originalElement.x || 0) + ((originalElement.width || 50) / 2);
          centerY = (originalElement.y || 0) + ((originalElement.height || 50) / 2);
        }
        
        const startAngle = Math.atan2(dragStart.y - centerY, dragStart.x - centerX);
        const currentAngle = Math.atan2(locationY - centerY, locationX - centerX);
        const rotationDelta = ((currentAngle - startAngle) * 180 / Math.PI);
        const originalRotation = originalElement.rotation || 0;
        
        newEl.rotation = originalRotation + rotationDelta;
      } else if (dragMode === 'resize' && resizeHandle) {
        // Resize element
        if (el.type === 'circle' && resizeHandle === 'radius') {
          const newRadius = Math.sqrt(
            Math.pow(locationX - originalElement.data.cx, 2) + 
            Math.pow(locationY - originalElement.data.cy, 2)
          );
          newEl.data = { ...el.data, r: Math.max(10, newRadius) };
        } else if (el.type === 'line' || el.type === 'arrow') {
          if (resizeHandle === 'start') {
            newEl.data = { ...el.data, x1: locationX, y1: locationY };
          } else if (resizeHandle === 'end') {
            newEl.data = { ...el.data, x2: locationX, y2: locationY };
          }
        } else if (el.type === 'rect') {
          let newData = { ...el.data };
          const origData = originalElement.data;
          
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

    setElements(newElements);
  };

  // Find element at point
  const findElementAtPoint = (x: number, y: number): DrawElement | null => {
    // Check in reverse order (top elements first)
    for (let i = elements.length - 1; i >= 0; i--) {
      const el = elements[i];
      
      if (el.type === 'circle') {
        const dist = Math.sqrt(Math.pow(x - el.data.cx, 2) + Math.pow(y - el.data.cy, 2));
        if (dist <= el.data.r + 10) return el;
      } else if (el.type === 'rect') {
        if (x >= el.data.x - 10 && x <= el.data.x + el.data.width + 10 &&
            y >= el.data.y - 10 && y <= el.data.y + el.data.height + 10) {
          return el;
        }
      } else if (el.type === 'line' || el.type === 'arrow') {
        const dist = distanceToLineSegment(x, y, el.data.x1, el.data.y1, el.data.x2, el.data.y2);
        if (dist < 15) return el;
      } else if (el.type === 'text' || el.type === 'image') {
        const elX = el.x || 0;
        const elY = el.y || 0;
        const elW = el.width || 100;
        const elH = el.height || 30;
        if (x >= elX - 10 && x <= elX + elW + 10 &&
            y >= elY - 10 && y <= elY + elH + 10) {
          return el;
        }
      }
    }
    return null;
  };

  // Distance to line segment helper
  const distanceToLineSegment = (px: number, py: number, x1: number, y1: number, x2: number, y2: number) => {
    const A = px - x1;
    const B = py - y1;
    const C = x2 - x1;
    const D = y2 - y1;
    const dot = A * C + B * D;
    const lenSq = C * C + D * D;
    let param = -1;
    if (lenSq !== 0) param = dot / lenSq;
    
    let xx, yy;
    if (param < 0) {
      xx = x1;
      yy = y1;
    } else if (param > 1) {
      xx = x2;
      yy = y2;
    } else {
      xx = x1 + param * C;
      yy = y1 + param * D;
    }
    
    const dx = px - xx;
    const dy = py - yy;
    return Math.sqrt(dx * dx + dy * dy);
  };

  // Check transform handles
  const checkTransformHandles = (element: DrawElement, x: number, y: number): { type: 'rotate' | 'resize', handle: string } | null => {
    const handleRadius = 15;
    
    if (element.type === 'rect') {
      const { x: rx, y: ry, width: w, height: h } = element.data;
      const handles = [
        { x: rx, y: ry, handle: 'top-left' },
        { x: rx + w / 2, y: ry, handle: 'top' },
        { x: rx + w, y: ry, handle: 'top-right' },
        { x: rx, y: ry + h / 2, handle: 'left' },
        { x: rx + w, y: ry + h / 2, handle: 'right' },
        { x: rx, y: ry + h, handle: 'bottom-left' },
        { x: rx + w / 2, y: ry + h, handle: 'bottom' },
        { x: rx + w, y: ry + h, handle: 'bottom-right' },
        { x: rx + w / 2, y: ry - 30, handle: 'rotate' },
      ];
      
      for (const h of handles) {
        if (Math.sqrt(Math.pow(x - h.x, 2) + Math.pow(y - h.y, 2)) < handleRadius) {
          return { type: h.handle === 'rotate' ? 'rotate' : 'resize', handle: h.handle };
        }
      }
    } else if (element.type === 'circle') {
      const { cx, cy, r } = element.data;
      if (Math.sqrt(Math.pow(x - (cx + r), 2) + Math.pow(y - cy, 2)) < handleRadius) {
        return { type: 'resize', handle: 'radius' };
      }
      if (Math.sqrt(Math.pow(x - cx, 2) + Math.pow(y - (cy - r - 30), 2)) < handleRadius) {
        return { type: 'rotate', handle: 'rotate' };
      }
    } else if (element.type === 'line' || element.type === 'arrow') {
      const { x1, y1, x2, y2 } = element.data;
      if (Math.sqrt(Math.pow(x - x1, 2) + Math.pow(y - y1, 2)) < handleRadius) {
        return { type: 'resize', handle: 'start' };
      }
      if (Math.sqrt(Math.pow(x - x2, 2) + Math.pow(y - y2, 2)) < handleRadius) {
        return { type: 'resize', handle: 'end' };
      }
      const midX = (x1 + x2) / 2;
      const midY = (y1 + y2) / 2;
      if (Math.sqrt(Math.pow(x - midX, 2) + Math.pow(y - (midY - 30), 2)) < handleRadius) {
        return { type: 'rotate', handle: 'rotate' };
      }
    } else if (element.type === 'image') {
      const elX = element.x || 0;
      const elY = element.y || 0;
      const elW = element.width || 100;
      const elH = element.height || 100;
      
      const handles = [
        { x: elX, y: elY, handle: 'top-left' },
        { x: elX + elW, y: elY, handle: 'top-right' },
        { x: elX, y: elY + elH, handle: 'bottom-left' },
        { x: elX + elW, y: elY + elH, handle: 'bottom-right' },
        { x: elX + elW / 2, y: elY - 30, handle: 'rotate' },
      ];
      
      for (const h of handles) {
        if (Math.sqrt(Math.pow(x - h.x, 2) + Math.pow(y - h.y, 2)) < handleRadius) {
          return { type: h.handle === 'rotate' ? 'rotate' : 'resize', handle: h.handle };
        }
      }
    }
    
    return null;
  };

  // Render element
  const renderElement = (element: DrawElement) => {
    const isSelected = element.id === selectedElementId;
    
    switch (element.type) {
      case 'path':
        return (
          <Path
            key={element.id}
            d={element.data}
            stroke={element.color}
            strokeWidth={element.strokeWidth}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        );
      
      case 'line':
        const lineCenterX = (element.data.x1 + element.data.x2) / 2;
        const lineCenterY = (element.data.y1 + element.data.y2) / 2;
        return (
          <G key={element.id}>
            <Line
              x1={element.data.x1}
              y1={element.data.y1}
              x2={element.data.x2}
              y2={element.data.y2}
              stroke={element.color}
              strokeWidth={element.strokeWidth}
              transform={element.rotation ? `rotate(${element.rotation} ${lineCenterX} ${lineCenterY})` : undefined}
            />
            {isSelected && renderTransformHandles(element)}
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
              transform={element.rotation ? `rotate(${element.rotation} ${element.data.cx} ${element.data.cy})` : undefined}
            />
            {isSelected && renderTransformHandles(element)}
          </G>
        );
      
      case 'rect':
        const rectCenterX = element.data.x + element.data.width / 2;
        const rectCenterY = element.data.y + element.data.height / 2;
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
              transform={element.rotation ? `rotate(${element.rotation} ${rectCenterX} ${rectCenterY})` : undefined}
            />
            {isSelected && renderTransformHandles(element)}
          </G>
        );
      
      case 'text':
        return (
          <G key={element.id}>
            <SvgText
              x={element.x}
              y={element.y}
              fill={element.color}
              fontSize={20}
              fontWeight="bold"
              transform={element.rotation ? `rotate(${element.rotation} ${element.x} ${element.y})` : undefined}
            >
              {element.data.text}
            </SvgText>
            {isSelected && renderTransformHandles(element)}
          </G>
        );
      
      case 'image':
        const imgX = element.x || 0;
        const imgY = element.y || 0;
        const imgW = element.width || 100;
        const imgH = element.height || 100;
        const imgCenterX = imgX + imgW / 2;
        const imgCenterY = imgY + imgH / 2;
        return (
          <G key={element.id}>
            <SvgImage
              href={element.data.uri}
              x={imgX}
              y={imgY}
              width={imgW}
              height={imgH}
              transform={element.rotation ? `rotate(${element.rotation} ${imgCenterX} ${imgCenterY})` : undefined}
            />
            {isSelected && renderTransformHandles(element)}
          </G>
        );
      
      case 'arrow':
        const { x1, y1, x2, y2, text, heads } = element.data;
        const midX = (x1 + x2) / 2;
        const midY = (y1 + y2) / 2;
        const angle = Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI;
        
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
                <Polygon points="0,0 0,6 9,3" fill={element.color} />
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
              transform={element.rotation ? `rotate(${element.rotation} ${midX} ${midY})` : undefined}
            />
            {text && (
              <SvgText
                x={midX}
                y={midY - 10}
                fill={element.color}
                fontSize={14}
                fontWeight="bold"
                textAnchor="middle"
                transform={`rotate(${angle} ${midX} ${midY})`}
              >
                {text}
              </SvgText>
            )}
            {isSelected && renderTransformHandles(element)}
          </G>
        );
      
      default:
        return null;
    }
  };

  // Render transformation handles
  const renderTransformHandles = (element: DrawElement) => {
    const handles: JSX.Element[] = [];
    
    if (element.type === 'rect') {
      const { x, y, width: w, height: h } = element.data;
      const handlePositions = [
        { x, y, label: '↖' },
        { x: x + w / 2, y, label: '↑' },
        { x: x + w, y, label: '↗' },
        { x, y: y + h / 2, label: '←' },
        { x: x + w, y: y + h / 2, label: '→' },
        { x, y: y + h, label: '↙' },
        { x: x + w / 2, y: y + h, label: '↓' },
        { x: x + w, y: y + h, label: '↘' },
      ];
      
      handlePositions.forEach((pos, idx) => {
        handles.push(
          <G key={`handle-${idx}`}>
            <Circle cx={pos.x} cy={pos.y} r={8} fill="#4caf50" stroke="#fff" strokeWidth={2} />
            <SvgText x={pos.x - 4} y={pos.y + 5} fill="#fff" fontSize={10}>{pos.label}</SvgText>
          </G>
        );
      });
      
      // Rotation handle
      handles.push(
        <G key="rotate">
          <Circle cx={x + w / 2} cy={y - 30} r={10} fill="#FF9800" stroke="#fff" strokeWidth={2} />
          <SvgText x={x + w / 2 - 5} y={y - 30 + 5} fill="#fff" fontSize={12}>↻</SvgText>
        </G>
      );
    } else if (element.type === 'circle') {
      const { cx, cy, r } = element.data;
      handles.push(
        <G key="radius">
          <Circle cx={cx + r} cy={cy} r={8} fill="#4caf50" stroke="#fff" strokeWidth={2} />
          <SvgText x={cx + r - 4} y={cy + 5} fill="#fff" fontSize={10}>↔</SvgText>
        </G>
      );
      handles.push(
        <G key="rotate">
          <Circle cx={cx} cy={cy - r - 30} r={10} fill="#FF9800" stroke="#fff" strokeWidth={2} />
          <SvgText x={cx - 5} y={cy - r - 30 + 5} fill="#fff" fontSize={12}>↻</SvgText>
        </G>
      );
    } else if (element.type === 'line' || element.type === 'arrow') {
      const { x1, y1, x2, y2 } = element.data;
      handles.push(
        <Circle key="start" cx={x1} cy={y1} r={8} fill="#2196f3" stroke="#fff" strokeWidth={2} />
      );
      handles.push(
        <Circle key="end" cx={x2} cy={y2} r={8} fill="#2196f3" stroke="#fff" strokeWidth={2} />
      );
      const midX = (x1 + x2) / 2;
      const midY = (y1 + y2) / 2;
      handles.push(
        <G key="rotate">
          <Circle cx={midX} cy={midY - 30} r={10} fill="#FF9800" stroke="#fff" strokeWidth={2} />
          <SvgText x={midX - 5} y={midY - 30 + 5} fill="#fff" fontSize={12}>↻</SvgText>
        </G>
      );
    } else if (element.type === 'image') {
      const imgX = element.x || 0;
      const imgY = element.y || 0;
      const imgW = element.width || 100;
      const imgH = element.height || 100;
      
      const corners = [
        { x: imgX, y: imgY },
        { x: imgX + imgW, y: imgY },
        { x: imgX, y: imgY + imgH },
        { x: imgX + imgW, y: imgY + imgH },
      ];
      
      corners.forEach((pos, idx) => {
        handles.push(
          <Circle key={`corner-${idx}`} cx={pos.x} cy={pos.y} r={8} fill="#4caf50" stroke="#fff" strokeWidth={2} />
        );
      });
      
      handles.push(
        <G key="rotate">
          <Circle cx={imgX + imgW / 2} cy={imgY - 30} r={10} fill="#FF9800" stroke="#fff" strokeWidth={2} />
          <SvgText x={imgX + imgW / 2 - 5} y={imgY - 30 + 5} fill="#fff" fontSize={12}>↻</SvgText>
        </G>
      );
    }
    
    return <G>{handles}</G>;
  };

  // Save sketch
  const saveSketch = async () => {
    if (!title.trim()) {
      showAlert('Fehler', 'Bitte geben Sie einen Titel ein');
      return;
    }

    try {
      setLoading(true);
      
      // Create metadata with elements
      const metadata = {
        elements,
        backgroundImage,
      };

      // For sketch_data, we'll save a placeholder or the background image
      const sketchData = backgroundImage || 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

      if (sketchId) {
        // Update existing sketch
        await axios.put(`${API_URL}/api/sketches/${sketchId}`, {
          project_id: projectId,
          title,
          sketch_data: sketchData,
          metadata: JSON.stringify(metadata),
        });
        showAlert('Erfolg', 'Skizze wurde aktualisiert');
      } else {
        // Create new sketch
        await axios.post(`${API_URL}/api/sketches`, {
          project_id: projectId,
          title,
          sketch_data: sketchData,
          metadata: JSON.stringify(metadata),
        });
        showAlert('Erfolg', 'Skizze wurde gespeichert');
      }

      router.back();
    } catch (error) {
      console.error('Error saving sketch:', error);
      showAlert('Fehler', 'Skizze konnte nicht gespeichert werden');
    } finally {
      setLoading(false);
    }
  };

  // Color palette
  const colors = [
    '#000000', '#FFFFFF', '#FF0000', '#00FF00', '#0000FF',
    '#FFFF00', '#FF00FF', '#00FFFF', '#FFA500', '#800080',
  ];

  // Stroke widths
  const strokeWidths = [1, 2, 3, 5, 8, 12];

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerButton}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <TextInput
          style={styles.titleInput}
          value={title}
          onChangeText={setTitle}
          placeholder="Skizzen-Titel"
          placeholderTextColor="#ccc"
        />
        <TouchableOpacity onPress={saveSketch} style={styles.headerButton} disabled={loading}>
          <Ionicons name="checkmark" size={24} color={loading ? '#888' : '#fff'} />
        </TouchableOpacity>
      </View>

      {/* Main toolbar */}
      <ScrollView horizontal style={styles.toolbar} showsHorizontalScrollIndicator={false}>
        {/* Undo/Redo */}
        <TouchableOpacity
          style={[styles.toolButton, !canUndo && styles.toolButtonDisabled]}
          onPress={undo}
          disabled={!canUndo}
        >
          <Ionicons name="arrow-undo" size={24} color={canUndo ? '#1976d2' : '#ccc'} />
          <Text style={styles.toolLabel}>Zurück</Text>
        </TouchableOpacity>
        
        <TouchableOpacity
          style={[styles.toolButton, !canRedo && styles.toolButtonDisabled]}
          onPress={redo}
          disabled={!canRedo}
        >
          <Ionicons name="arrow-redo" size={24} color={canRedo ? '#1976d2' : '#ccc'} />
          <Text style={styles.toolLabel}>Weiter</Text>
        </TouchableOpacity>

        <View style={styles.separator} />

        {/* Drawing tools */}
        <TouchableOpacity
          style={[styles.toolButton, drawMode === 'select' && styles.toolButtonActive]}
          onPress={() => setDrawMode('select')}
        >
          <Ionicons name="hand-left" size={24} color={drawMode === 'select' ? '#fff' : '#333'} />
          <Text style={[styles.toolLabel, drawMode === 'select' && styles.toolLabelActive]}>Auswahl</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.toolButton, drawMode === 'pen' && styles.toolButtonActive]}
          onPress={() => setDrawMode('pen')}
        >
          <Ionicons name="create" size={24} color={drawMode === 'pen' ? '#fff' : '#333'} />
          <Text style={[styles.toolLabel, drawMode === 'pen' && styles.toolLabelActive]}>Stift</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.toolButton, drawMode === 'line' && styles.toolButtonActive]}
          onPress={() => setDrawMode('line')}
        >
          <Ionicons name="remove" size={24} color={drawMode === 'line' ? '#fff' : '#333'} />
          <Text style={[styles.toolLabel, drawMode === 'line' && styles.toolLabelActive]}>Linie</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.toolButton, drawMode === 'circle' && styles.toolButtonActive]}
          onPress={() => setDrawMode('circle')}
        >
          <Ionicons name="ellipse-outline" size={24} color={drawMode === 'circle' ? '#fff' : '#333'} />
          <Text style={[styles.toolLabel, drawMode === 'circle' && styles.toolLabelActive]}>Kreis</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.toolButton, drawMode === 'rect' && styles.toolButtonActive]}
          onPress={() => setDrawMode('rect')}
        >
          <Ionicons name="square-outline" size={24} color={drawMode === 'rect' ? '#fff' : '#333'} />
          <Text style={[styles.toolLabel, drawMode === 'rect' && styles.toolLabelActive]}>Rechteck</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.toolButton, drawMode === 'arrow' && styles.toolButtonActive]}
          onPress={() => setDrawMode('arrow')}
        >
          <Ionicons name="arrow-forward" size={24} color={drawMode === 'arrow' ? '#fff' : '#333'} />
          <Text style={[styles.toolLabel, drawMode === 'arrow' && styles.toolLabelActive]}>Pfeil</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.toolButton, drawMode === 'text' && styles.toolButtonActive]}
          onPress={() => setDrawMode('text')}
        >
          <Ionicons name="text" size={24} color={drawMode === 'text' ? '#fff' : '#333'} />
          <Text style={[styles.toolLabel, drawMode === 'text' && styles.toolLabelActive]}>Text</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.toolButton} onPress={insertImage}>
          <Ionicons name="image" size={24} color="#333" />
          <Text style={styles.toolLabel}>Bild</Text>
        </TouchableOpacity>

        <View style={styles.separator} />

        {/* Color picker */}
        <TouchableOpacity style={styles.toolButton} onPress={() => setShowColorPicker(!showColorPicker)}>
          <View style={[styles.colorPreview, { backgroundColor: drawColor }]} />
          <Text style={styles.toolLabel}>Farbe</Text>
        </TouchableOpacity>

        {/* Stroke width */}
        <View style={styles.strokeWidthContainer}>
          <Text style={styles.toolLabel}>Stärke: {strokeWidth}px</Text>
          <View style={styles.strokeWidthButtons}>
            {strokeWidths.map(w => (
              <TouchableOpacity
                key={w}
                style={[styles.strokeWidthButton, strokeWidth === w && styles.strokeWidthButtonActive]}
                onPress={() => setStrokeWidth(w)}
              >
                <View style={[styles.strokeWidthDot, { width: w * 2, height: w * 2 }]} />
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.separator} />

        {/* Delete */}
        <TouchableOpacity
          style={[styles.toolButton, !selectedElementId && styles.toolButtonDisabled]}
          onPress={() => selectedElementId && setShowDeleteConfirm(true)}
          disabled={!selectedElementId}
        >
          <Ionicons name="trash" size={24} color={selectedElementId ? '#f44336' : '#ccc'} />
          <Text style={styles.toolLabel}>Löschen</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.toolButton} onPress={() => {
          if (Platform.OS === 'web') {
            if (confirm('Möchten Sie alle Elemente löschen?')) {
              clearAll();
            }
          } else {
            Alert.alert('Alles löschen', 'Möchten Sie alle Elemente löschen?', [
              { text: 'Abbrechen', style: 'cancel' },
              { text: 'Löschen', style: 'destructive', onPress: clearAll },
            ]);
          }
        }}>
          <Ionicons name="trash-bin" size={24} color="#f44336" />
          <Text style={styles.toolLabel}>Alle</Text>
        </TouchableOpacity>

        <View style={styles.separator} />

        {/* Background */}
        <TouchableOpacity style={styles.toolButton} onPress={pickBackgroundImage}>
          <Ionicons name="images" size={24} color="#333" />
          <Text style={styles.toolLabel}>Hintergrund</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.toolButton} onPress={takeBackgroundPhoto}>
          <Ionicons name="camera" size={24} color="#333" />
          <Text style={styles.toolLabel}>Foto</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Color picker expandable */}
      {showColorPicker && (
        <View style={styles.colorPickerPanel}>
          <Text style={styles.colorPickerTitle}>Farbe wählen:</Text>
          <View style={styles.colorGrid}>
            {colors.map(color => (
              <TouchableOpacity
                key={color}
                style={[
                  styles.colorOption,
                  { backgroundColor: color },
                  drawColor === color && styles.colorOptionSelected,
                ]}
                onPress={() => {
                  setDrawColor(color);
                  setShowColorPicker(false);
                }}
              />
            ))}
          </View>
        </View>
      )}

      {/* Canvas */}
      <View
        ref={canvasRef}
        style={styles.canvasContainer}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={onTouchStart}
        onResponderMove={onTouchMove}
        onResponderRelease={onTouchEnd}
      >
        <Svg
          ref={svgRef}
          width={width}
          height={height - 200}
          style={styles.svg}
        >
          {/* Background image */}
          {backgroundImage && (
            <SvgImage
              href={backgroundImage}
              x={0}
              y={0}
              width={width}
              height={height - 200}
              preserveAspectRatio="xMidYMid meet"
              opacity={0.5}
            />
          )}

          {/* Render all elements */}
          {elements.map(el => renderElement(el))}

          {/* Render temporary element */}
          {tempElement && renderElement(tempElement)}

          {/* Render current path */}
          {currentPath && currentPath.length > 0 && (
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

        {/* Info overlay */}
        <View style={styles.infoOverlay}>
          <Text style={styles.infoText}>Elemente: {elements.length}</Text>
          {selectedElementId && <Text style={styles.infoText}>Ausgewählt</Text>}
        </View>
      </View>

      {/* Text Input Modal */}
      <Modal visible={showTextModal} transparent animationType="slide">
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Text eingeben</Text>
            <TextInput
              style={styles.modalInput}
              value={textInput}
              onChangeText={setTextInput}
              placeholder="Text hier eingeben..."
              multiline
              autoFocus
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => {
                  setShowTextModal(false);
                  setTextInput('');
                  setPendingPosition(null);
                }}
              >
                <Text style={styles.cancelButtonText}>Abbrechen</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.confirmButton]}
                onPress={addTextElement}
              >
                <Text style={styles.confirmButtonText}>Hinzufügen</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Arrow Modal */}
      <Modal visible={showArrowModal} transparent animationType="slide">
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Bemaßungspfeil</Text>
            <TextInput
              style={styles.modalInput}
              value={arrowText}
              onChangeText={setArrowText}
              placeholder="Maß eingeben (z.B. 5.5m)"
              autoFocus
            />
            <View style={styles.arrowHeadsContainer}>
              <Text style={styles.modalLabel}>Pfeilspitzen:</Text>
              <View style={styles.arrowHeadsButtons}>
                <TouchableOpacity
                  style={[styles.arrowHeadButton, arrowHeads === 'single' && styles.arrowHeadButtonActive]}
                  onPress={() => setArrowHeads('single')}
                >
                  <Text style={styles.arrowHeadButtonText}>Einfach →</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.arrowHeadButton, arrowHeads === 'double' && styles.arrowHeadButtonActive]}
                  onPress={() => setArrowHeads('double')}
                >
                  <Text style={styles.arrowHeadButtonText}>Doppelt ↔</Text>
                </TouchableOpacity>
              </View>
            </View>
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => {
                  setShowArrowModal(false);
                  setArrowText('');
                  setPendingArrow(null);
                }}
              >
                <Text style={styles.cancelButtonText}>Abbrechen</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.confirmButton]}
                onPress={addArrowElement}
              >
                <Text style={styles.confirmButtonText}>Hinzufügen</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal visible={showDeleteConfirm} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Element löschen</Text>
            <Text style={styles.modalMessage}>Möchten Sie das ausgewählte Element wirklich löschen?</Text>
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => setShowDeleteConfirm(false)}
              >
                <Text style={styles.cancelButtonText}>Abbrechen</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.deleteButton]}
                onPress={deleteSelectedElement}
              >
                <Text style={styles.deleteButtonText}>Löschen</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1976d2',
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingTop: Platform.OS === 'ios' ? 50 : 12,
  },
  headerButton: {
    padding: 8,
  },
  titleInput: {
    flex: 1,
    marginHorizontal: 16,
    padding: 8,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 8,
    color: '#fff',
    fontSize: 16,
  },
  toolbar: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
    paddingVertical: 8,
  },
  toolButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    minWidth: 70,
  },
  toolButtonActive: {
    backgroundColor: '#1976d2',
    borderRadius: 8,
  },
  toolButtonDisabled: {
    opacity: 0.4,
  },
  toolLabel: {
    fontSize: 11,
    color: '#666',
    marginTop: 4,
  },
  toolLabelActive: {
    color: '#fff',
  },
  separator: {
    width: 1,
    backgroundColor: '#ddd',
    marginHorizontal: 8,
  },
  colorPreview: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 2,
    borderColor: '#ddd',
  },
  strokeWidthContainer: {
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  strokeWidthButtons: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  strokeWidthButton: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 4,
    backgroundColor: '#f0f0f0',
  },
  strokeWidthButtonActive: {
    backgroundColor: '#1976d2',
  },
  strokeWidthDot: {
    backgroundColor: '#333',
    borderRadius: 10,
  },
  colorPickerPanel: {
    backgroundColor: '#fff',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
  },
  colorPickerTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 12,
  },
  colorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  colorOption: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: '#ddd',
  },
  colorOptionSelected: {
    borderColor: '#1976d2',
    borderWidth: 4,
  },
  canvasContainer: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  svg: {
    backgroundColor: '#fff',
  },
  infoOverlay: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(0,0,0,0.7)',
    padding: 8,
    borderRadius: 8,
  },
  infoText: {
    color: '#fff',
    fontSize: 12,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 24,
    width: '90%',
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 16,
    color: '#333',
  },
  modalMessage: {
    fontSize: 16,
    color: '#666',
    marginBottom: 24,
  },
  modalLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
    color: '#333',
  },
  modalInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    marginBottom: 16,
    minHeight: 50,
  },
  arrowHeadsContainer: {
    marginBottom: 16,
  },
  arrowHeadsButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  arrowHeadButton: {
    flex: 1,
    padding: 12,
    borderWidth: 2,
    borderColor: '#ddd',
    borderRadius: 8,
    alignItems: 'center',
  },
  arrowHeadButtonActive: {
    borderColor: '#1976d2',
    backgroundColor: '#e3f2fd',
  },
  arrowHeadButtonText: {
    fontSize: 14,
    color: '#333',
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  modalButton: {
    flex: 1,
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: '#e0e0e0',
  },
  cancelButtonText: {
    color: '#333',
    fontSize: 16,
    fontWeight: '600',
  },
  confirmButton: {
    backgroundColor: '#1976d2',
  },
  confirmButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  deleteButton: {
    backgroundColor: '#f44336',
  },
  deleteButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});

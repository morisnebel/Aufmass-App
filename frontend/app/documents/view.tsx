import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Pressable,
  Alert,
  ActivityIndicator,
  Image,
  Modal,
  TextInput,
  useWindowDimensions,
  ScrollView,
  Dimensions,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { WebView } from 'react-native-webview';
import Svg, { Path, Text as SvgText, Rect, Circle, Line, G } from 'react-native-svg';
import { DocumentService, Document } from '../../services/LocalStorage';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';
import { captureRef } from 'react-native-view-shot';

// Annotation types for saving
interface SavedAnnotations {
  paths: DrawPath[];
  shapes: Shape[];
  texts: TextAnnotation[];
}

interface Shape {
  id: string;
  type: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
  strokeWidth: number;
  text?: string;
}

interface TextAnnotation {
  id: string;
  text: string;
  x: number;
  y: number;
  color: string;
  fontSize: number;
}

interface DrawPath {
  path: string;
  color: string;
  strokeWidth: number;
  opacity: number;
}

export default function DocumentViewScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const documentId = params.documentId as string;
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  
  // Document state
  const [document, setDocument] = useState<Document | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  
  // Edit mode
  const [isEditing, setIsEditing] = useState(false);
  const [pageImage, setPageImage] = useState<string | null>(null);
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
  const [renderingPage, setRenderingPage] = useState(false);
  
  // Page-specific annotations storage
  const [pageAnnotations, setPageAnnotations] = useState<{[page: number]: {paths: DrawPath[], shapes: Shape[], texts: TextAnnotation[]}}>({});
  
  // Drawing (current page)
  const [paths, setPaths] = useState<DrawPath[]>([]);
  const [currentPath, setCurrentPath] = useState('');
  const [drawColor, setDrawColor] = useState('#FF0000');
  const [strokeWidth, setStrokeWidth] = useState(3);
  const [isHighlighter, setIsHighlighter] = useState(false);
  const [isEraser, setIsEraser] = useState(false);
  
  // Shapes (current page)
  const [shapes, setShapes] = useState<Shape[]>([]);
  const [currentShape, setCurrentShape] = useState<{type: string, x1: number, y1: number, x2: number, y2: number} | null>(null);
  const [shapeMode, setShapeMode] = useState<'none' | 'rectangle' | 'circle' | 'arrow' | 'line'>('none');
  
  // Actual canvas area size (measured via onLayout)
  const [canvasAreaSize, setCanvasAreaSize] = useState({ width: 0, height: 0 });
  
  // Text (current page)
  const [textAnnotations, setTextAnnotations] = useState<TextAnnotation[]>([]);
  const [showTextModal, setShowTextModal] = useState(false);
  const [newText, setNewText] = useState('');
  const [textPosition, setTextPosition] = useState({ x: 0, y: 0 });
  const [isTextMode, setIsTextMode] = useState(false);
  const [textFontSize, setTextFontSize] = useState(16);
  
  // Zoom
  const [zoomLevel, setZoomLevel] = useState(1);
  const [zoomEnabled, setZoomEnabled] = useState(false);
  
  // Select/Move mode
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedElement, setSelectedElement] = useState<{type: 'shape' | 'text', id: string} | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [isResizing, setIsResizing] = useState(false);
  const [resizeCorner, setResizeCorner] = useState<'tl' | 'tr' | 'bl' | 'br' | null>(null);
  
  // Memo pointer
  const [isPointerMode, setIsPointerMode] = useState(false);
  const [pendingPointer, setPendingPointer] = useState<{x1: number, y1: number, x2: number, y2: number} | null>(null);
  const [showPointerModal, setShowPointerModal] = useState(false);
  const [pointerText, setPointerText] = useState('');
  
  // Track undo history for better ordering
  const [undoHistory, setUndoHistory] = useState<Array<{type: 'path' | 'shape' | 'text', id: string}>>([]);
  
  const webViewRef = useRef<WebView>(null);
  const pageWebViewRef = useRef<WebView>(null);
  const canvasRef = useRef<View>(null);

  // Calculate canvas size to fit screen
  const headerHeight = 50;
  const toolbarHeight = 60;
  const padding = 10;
  const availableHeight = screenHeight - headerHeight - toolbarHeight - padding * 2;
  const availableWidth = screenWidth - padding * 2;

  useEffect(() => {
    loadDocument();
  }, [documentId]);

  const loadDocument = async () => {
    try {
      const doc = await DocumentService.getById(documentId || '');
      if (doc) {
        setDocument(doc);
      } else {
        Alert.alert('Fehler', 'Dokument nicht gefunden');
        router.back();
      }
    } catch (error) {
      Alert.alert('Fehler', 'Dokument konnte nicht geladen werden');
    } finally {
      setLoading(false);
    }
  };

  // Save current page annotations and load new page annotations when page changes
  const [prevPage, setPrevPage] = useState(currentPage);
  
  useEffect(() => {
    if (isEditing && prevPage !== currentPage) {
      // Save current page annotations before switching
      setPageAnnotations(prev => ({
        ...prev,
        [prevPage]: { paths, shapes, texts: textAnnotations }
      }));
      
      // Load new page annotations
      const newPageAnnotations = pageAnnotations[currentPage];
      if (newPageAnnotations) {
        setPaths(newPageAnnotations.paths || []);
        setShapes(newPageAnnotations.shapes || []);
        setTextAnnotations(newPageAnnotations.texts || []);
      } else {
        setPaths([]);
        setShapes([]);
        setTextAnnotations([]);
      }
      setUndoHistory([]);
      setSelectedElement(null);
      
      // Re-render the new page image
      setRenderingPage(true);
      setPageImage(null);
      
      setPrevPage(currentPage);
    }
  }, [currentPage, isEditing]);

  const handleWebViewMessage = (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'pageCount') {
        setTotalPages(data.count);
      } else if (data.type === 'currentPage') {
        setCurrentPage(data.page);
      }
    } catch (e) {}
  };

  const handlePageRendered = (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'pageRendered') {
        // Use the measured canvas area size instead of calculated
        const pdfAspect = data.width / data.height;
        let displayWidth, displayHeight;
        
        // Use measured size if available, otherwise fall back to calculated
        const useWidth = canvasAreaSize.width > 0 ? canvasAreaSize.width : availableWidth;
        const useHeight = canvasAreaSize.height > 0 ? canvasAreaSize.height : availableHeight;
        
        if (useWidth / useHeight > pdfAspect) {
          displayHeight = useHeight;
          displayWidth = displayHeight * pdfAspect;
        } else {
          displayWidth = useWidth;
          displayHeight = displayWidth / pdfAspect;
        }
        
        console.log(`PDF size: ${displayWidth} x ${displayHeight}, area: ${useWidth} x ${useHeight}`);
        setImageSize({ width: displayWidth, height: displayHeight });
        setPageImage(data.imageData);
        setRenderingPage(false);
      }
    } catch (e) {
      setRenderingPage(false);
    }
  };

  const onCanvasAreaLayout = (event: any) => {
    const { width, height } = event.nativeEvent.layout;
    console.log(`Canvas area measured: ${width} x ${height}`);
    setCanvasAreaSize({ width, height });
  };

  const goToPage = (page: number) => {
    if (page >= 1 && page <= totalPages) {
      webViewRef.current?.injectJavaScript(`goToPage(${page}); true;`);
    }
  };

  const startEditing = async () => {
    setIsEditing(true);
    setRenderingPage(true);
    
    // Load existing annotations for this page if available
    if (document) {
      const page = document.pages?.find(p => p.pageNumber === currentPage);
      if (page?.annotations) {
        try {
          const saved: SavedAnnotations = JSON.parse(page.annotations);
          setPaths(saved.paths || []);
          setShapes(saved.shapes || []);
          setTextAnnotations(saved.texts || []);
          // Rebuild undo history
          const history: Array<{type: 'path' | 'shape' | 'text', id: string}> = [];
          (saved.paths || []).forEach((_, i) => history.push({ type: 'path', id: `path-${i}` }));
          (saved.shapes || []).forEach(s => history.push({ type: 'shape', id: s.id }));
          (saved.texts || []).forEach(t => history.push({ type: 'text', id: t.id }));
          setUndoHistory(history);
        } catch (e) {
          console.log('Error parsing annotations:', e);
          setPaths([]);
          setShapes([]);
          setTextAnnotations([]);
          setUndoHistory([]);
        }
      } else {
        setPaths([]);
        setShapes([]);
        setTextAnnotations([]);
        setUndoHistory([]);
      }
    }
  };

  const cancelEditing = async () => {
    // Ask if user wants to save before leaving
    if (paths.length > 0 || shapes.length > 0 || textAnnotations.length > 0) {
      Alert.alert(
        'Anmerkungen speichern?',
        'Möchten Sie die Anmerkungen vor dem Beenden speichern?',
        [
          { text: 'Verwerfen', style: 'destructive', onPress: () => exitEditMode() },
          { text: 'Abbrechen', style: 'cancel' },
          { text: 'Speichern', onPress: () => saveAndExit() },
        ]
      );
    } else {
      exitEditMode();
    }
  };

  const exitEditMode = () => {
    setIsEditing(false);
    setPageImage(null);
    setPaths([]);
    setShapes([]);
    setTextAnnotations([]);
    setUndoHistory([]);
  };

  const saveAnnotations = async () => {
    if (!document) return;
    
    // First save current page to pageAnnotations
    const allAnnotations = {
      ...pageAnnotations,
      [currentPage]: { paths, shapes, texts: textAnnotations }
    };
    setPageAnnotations(allAnnotations);
    
    try {
      // Save all pages
      for (const [pageNum, annotations] of Object.entries(allAnnotations)) {
        const annotationData: SavedAnnotations = {
          paths: annotations.paths,
          shapes: annotations.shapes,
          texts: annotations.texts,
        };
        await DocumentService.updatePage(document.id, parseInt(pageNum), {
          annotations: JSON.stringify(annotationData),
        });
      }
      Alert.alert('Gespeichert', 'Alle Anmerkungen wurden gespeichert');
    } catch (error) {
      Alert.alert('Fehler', 'Konnte nicht gespeichert werden');
    }
  };

  const saveAndExit = async () => {
    await saveAnnotations();
    exitEditMode();
  };

  const shareAnnotated = async () => {
    if (!canvasRef.current) return;
    try {
      const uri = await captureRef(canvasRef.current, { format: 'png', quality: 1 });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'image/png' });
      }
    } catch (error) {
      Alert.alert('Fehler', 'Konnte nicht geteilt werden');
    }
  };

  const handleTouch = (evt: any, type: 'start' | 'move' | 'end') => {
    const { locationX, locationY } = evt.nativeEvent;
    console.log(`Touch ${type}: x=${locationX}, y=${locationY}, tool=${getCurrentTool()}`);
    
    if (type === 'start') {
      // Select/Move mode
      if (isSelectMode) {
        // Check if clicking on a resize handle first
        if (selectedElement && selectedElement.type === 'shape') {
          const shape = shapes.find(s => s.id === selectedElement.id);
          if (shape) {
            const handleSize = 20;
            const corners = [
              { name: 'tl', x: Math.min(shape.x1, shape.x2), y: Math.min(shape.y1, shape.y2) },
              { name: 'tr', x: Math.max(shape.x1, shape.x2), y: Math.min(shape.y1, shape.y2) },
              { name: 'bl', x: Math.min(shape.x1, shape.x2), y: Math.max(shape.y1, shape.y2) },
              { name: 'br', x: Math.max(shape.x1, shape.x2), y: Math.max(shape.y1, shape.y2) },
            ];
            for (const corner of corners) {
              if (Math.abs(locationX - corner.x) < handleSize && Math.abs(locationY - corner.y) < handleSize) {
                setIsResizing(true);
                setResizeCorner(corner.name as 'tl' | 'tr' | 'bl' | 'br');
                return;
              }
            }
          }
        }
        
        // Find clicked element (shapes or text)
        const clickedShape = shapes.find(s => {
          const minX = Math.min(s.x1, s.x2) - 10;
          const maxX = Math.max(s.x1, s.x2) + 10;
          const minY = Math.min(s.y1, s.y2) - 10;
          const maxY = Math.max(s.y1, s.y2) + 10;
          return locationX >= minX && locationX <= maxX && locationY >= minY && locationY <= maxY;
        });
        const clickedText = textAnnotations.find(t => {
          return locationX >= t.x - 50 && locationX <= t.x + 100 && locationY >= t.y - 20 && locationY <= t.y + 10;
        });
        
        if (clickedShape) {
          setSelectedElement({ type: 'shape', id: clickedShape.id });
          setDragOffset({ x: locationX - clickedShape.x1, y: locationY - clickedShape.y1 });
        } else if (clickedText) {
          setSelectedElement({ type: 'text', id: clickedText.id });
          setDragOffset({ x: locationX - clickedText.x, y: locationY - clickedText.y });
        } else {
          setSelectedElement(null);
        }
        return;
      }
      
      // Pointer/Memo mode
      if (isPointerMode) {
        setPendingPointer({ x1: locationX, y1: locationY, x2: locationX, y2: locationY });
        return;
      }
      
      // Text mode
      if (isTextMode) {
        setTextPosition({ x: locationX, y: locationY });
        setShowTextModal(true);
        return;
      }
      
      // Shape mode
      if (shapeMode !== 'none') {
        setCurrentShape({ type: shapeMode, x1: locationX, y1: locationY, x2: locationX, y2: locationY });
        return;
      }
      
      // Drawing mode (pen, highlighter, eraser)
      setCurrentPath(`M ${locationX} ${locationY}`);
    } else if (type === 'move') {
      // Resizing mode
      if (isResizing && selectedElement && selectedElement.type === 'shape' && resizeCorner) {
        setShapes(prev => prev.map(s => {
          if (s.id === selectedElement.id) {
            switch (resizeCorner) {
              case 'tl': return { ...s, x1: locationX, y1: locationY };
              case 'tr': return { ...s, x2: locationX, y1: locationY };
              case 'bl': return { ...s, x1: locationX, y2: locationY };
              case 'br': return { ...s, x2: locationX, y2: locationY };
            }
          }
          return s;
        }));
        return;
      }
      
      // Select/Move mode - drag selected element
      if (isSelectMode && selectedElement) {
        const dx = locationX - dragOffset.x;
        const dy = locationY - dragOffset.y;
        
        if (selectedElement.type === 'shape') {
          setShapes(prev => prev.map(s => {
            if (s.id === selectedElement.id) {
              const width = s.x2 - s.x1;
              const height = s.y2 - s.y1;
              return { ...s, x1: dx, y1: dy, x2: dx + width, y2: dy + height };
            }
            return s;
          }));
        } else if (selectedElement.type === 'text') {
          setTextAnnotations(prev => prev.map(t => {
            if (t.id === selectedElement.id) {
              return { ...t, x: dx, y: dy };
            }
            return t;
          }));
        }
        return;
      }
      
      // Pointer mode
      if (pendingPointer) {
        setPendingPointer({ ...pendingPointer, x2: locationX, y2: locationY });
        return;
      }
      
      // Shape mode
      if (currentShape) {
        setCurrentShape({ ...currentShape, x2: locationX, y2: locationY });
        return;
      }
      
      // Drawing mode
      if (currentPath) {
        setCurrentPath(prev => `${prev} L ${locationX} ${locationY}`);
      }
    } else if (type === 'end') {
      // End resizing
      if (isResizing) {
        setIsResizing(false);
        setResizeCorner(null);
        return;
      }
      
      // Select mode - end drag
      if (isSelectMode) {
        return;
      }
      
      // Pointer mode - show text modal
      if (pendingPointer) {
        setShowPointerModal(true);
        return;
      }
      
      // Shape mode
      if (currentShape) {
        const newId = Date.now().toString();
        const newShape: Shape = {
          id: newId,
          type: currentShape.type,
          x1: currentShape.x1,
          y1: currentShape.y1,
          x2: locationX,
          y2: locationY,
          color: drawColor,
          strokeWidth: strokeWidth,
        };
        setShapes(prev => [...prev, newShape]);
        setUndoHistory(prev => [...prev, { type: 'shape', id: newId }]);
        setCurrentShape(null);
        console.log('Shape added:', newShape);
        return;
      }
      
      // Drawing mode
      if (currentPath) {
        const pathId = `path-${Date.now()}`;
        setPaths(prev => [...prev, {
          path: currentPath,
          color: isEraser ? '#FFFFFF' : drawColor,
          strokeWidth: isEraser ? strokeWidth * 3 : strokeWidth,
          opacity: isHighlighter ? 0.4 : 1,
        }]);
        setUndoHistory(prev => [...prev, { type: 'path', id: pathId }]);
        setCurrentPath('');
        console.log('Path added');
      }
    }
  };

  // Add pointer element
  const addPointerElement = () => {
    if (pendingPointer) {
      const newId = Date.now().toString();
      const newShape: Shape = {
        id: newId,
        type: 'pointer',
        x1: pendingPointer.x1,
        y1: pendingPointer.y1,
        x2: pendingPointer.x2,
        y2: pendingPointer.y2,
        color: drawColor,
        strokeWidth: 3,
        text: pointerText,
      };
      setShapes(prev => [...prev, newShape]);
      setUndoHistory(prev => [...prev, { type: 'shape', id: newId }]);
      setPointerText('');
      setPendingPointer(null);
      setShowPointerModal(false);
    }
  };

  const selectTool = (tool: string) => {
    console.log('Tool selected:', tool);
    setIsTextMode(false);
    setIsHighlighter(false);
    setIsEraser(false);
    setShapeMode('none');
    setIsSelectMode(false);
    setIsPointerMode(false);
    setSelectedElement(null);
    
    switch(tool) {
      case 'pen': break; // Default
      case 'highlighter': setIsHighlighter(true); break;
      case 'eraser': setIsEraser(true); break;
      case 'text': setIsTextMode(true); break;
      case 'rectangle': setShapeMode('rectangle'); break;
      case 'circle': setShapeMode('circle'); break;
      case 'arrow': setShapeMode('arrow'); break;
      case 'line': setShapeMode('line'); break;
      case 'select': setIsSelectMode(true); break;
      case 'pointer': setIsPointerMode(true); break;
    }
  };

  const getCurrentTool = () => {
    if (isSelectMode) return 'select';
    if (isPointerMode) return 'pointer';
    if (isTextMode) return 'text';
    if (isHighlighter) return 'highlighter';
    if (isEraser) return 'eraser';
    if (shapeMode !== 'none') return shapeMode;
    return 'pen';
  };

  // Render pointer/memo arrow
  const renderPointer = (pointer: any, isPreview = false) => {
    const { x1, y1, x2, y2, text, color: pColor } = pointer;
    const key = isPreview ? 'preview-pointer' : pointer.id;
    const col = pColor || drawColor;
    
    // Calculate arrow angle
    const angle = Math.atan2(y2 - y1, x2 - x1);
    const arrowLength = 15;
    const arrowAngle = Math.PI / 6;
    
    // Arrow head points
    const ax1 = x2 - arrowLength * Math.cos(angle - arrowAngle);
    const ay1 = y2 - arrowLength * Math.sin(angle - arrowAngle);
    const ax2 = x2 - arrowLength * Math.cos(angle + arrowAngle);
    const ay2 = y2 - arrowLength * Math.sin(angle + arrowAngle);
    
    // Text position (middle of line, offset)
    const midX = (x1 + x2) / 2;
    const midY = (y1 + y2) / 2 - 10;
    
    return (
      <G key={key}>
        <Line x1={x1} y1={y1} x2={x2} y2={y2} stroke={col} strokeWidth={3} />
        <Line x1={x2} y1={y2} x2={ax1} y2={ay1} stroke={col} strokeWidth={3} />
        <Line x1={x2} y1={y2} x2={ax2} y2={ay2} stroke={col} strokeWidth={3} />
        {text && <SvgText x={midX} y={midY} fill={col} fontSize={14} fontWeight="bold" textAnchor="middle">{text}</SvgText>}
      </G>
    );
  };

  const renderShape = (shape: any, isPreview = false) => {
    const { type, x1, y1, x2, y2, color, strokeWidth: sw } = shape;
    const key = isPreview ? 'preview' : shape.id;

    switch (type) {
      case 'rectangle':
        return (
          <Rect
            key={key}
            x={Math.min(x1, x2)}
            y={Math.min(y1, y2)}
            width={Math.abs(x2 - x1)}
            height={Math.abs(y2 - y1)}
            stroke={color || drawColor}
            strokeWidth={sw || strokeWidth}
            fill="none"
          />
        );
      case 'circle':
        const cx = (x1 + x2) / 2;
        const cy = (y1 + y2) / 2;
        const r = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1)) / 2;
        return (
          <Circle key={key} cx={cx} cy={cy} r={r} stroke={color || drawColor} strokeWidth={sw || strokeWidth} fill="none" />
        );
      case 'line':
        return (
          <Line key={key} x1={x1} y1={y1} x2={x2} y2={y2} stroke={color || drawColor} strokeWidth={sw || strokeWidth} />
        );
      case 'arrow':
        const angle = Math.atan2(y2 - y1, x2 - x1);
        const headLength = 15;
        return (
          <G key={key}>
            <Line x1={x1} y1={y1} x2={x2} y2={y2} stroke={color || drawColor} strokeWidth={sw || strokeWidth} />
            <Line
              x1={x2}
              y1={y2}
              x2={x2 - headLength * Math.cos(angle - Math.PI / 6)}
              y2={y2 - headLength * Math.sin(angle - Math.PI / 6)}
              stroke={color || drawColor}
              strokeWidth={sw || strokeWidth}
            />
            <Line
              x1={x2}
              y1={y2}
              x2={x2 - headLength * Math.cos(angle + Math.PI / 6)}
              y2={y2 - headLength * Math.sin(angle + Math.PI / 6)}
              stroke={color || drawColor}
              strokeWidth={sw || strokeWidth}
            />
          </G>
        );
      case 'pointer':
        const pAngle = Math.atan2(y2 - y1, x2 - x1);
        const pHeadLength = 18;
        const pAngleOffset = Math.PI / 7;
        const col = color || drawColor;
        
        // Calculate text box position - at the start of the arrow
        const textBoxX = x1;
        const textBoxY = y1 - 25;
        const textWidth = shape.text ? Math.max(shape.text.length * 8, 60) : 0;
        const textHeight = 22;
        
        // Filled arrow head points for polygon
        const ax1 = x2 - pHeadLength * Math.cos(pAngle - pAngleOffset);
        const ay1 = y2 - pHeadLength * Math.sin(pAngle - pAngleOffset);
        const ax2 = x2 - pHeadLength * Math.cos(pAngle + pAngleOffset);
        const ay2 = y2 - pHeadLength * Math.sin(pAngle + pAngleOffset);
        
        return (
          <G key={key}>
            {/* Main line */}
            <Line x1={x1} y1={y1} x2={x2} y2={y2} stroke={col} strokeWidth={3} />
            
            {/* Filled arrow head */}
            <Path 
              d={`M ${x2} ${y2} L ${ax1} ${ay1} L ${ax2} ${ay2} Z`} 
              fill={col} 
              stroke={col} 
              strokeWidth={1} 
            />
            
            {/* Text box with background */}
            {shape.text && (
              <G>
                <Rect 
                  x={textBoxX - textWidth/2 - 5} 
                  y={textBoxY - textHeight + 5} 
                  width={textWidth + 10} 
                  height={textHeight} 
                  fill="white" 
                  stroke={col} 
                  strokeWidth={2} 
                  rx={4}
                />
                <SvgText 
                  x={textBoxX} 
                  y={textBoxY} 
                  fill={col} 
                  fontSize={14} 
                  fontWeight="bold" 
                  textAnchor="middle"
                >
                  {shape.text}
                </SvgText>
              </G>
            )}
          </G>
        );
      default:
        return null;
    }
  };

  const addText = () => {
    if (newText.trim()) {
      const newId = Date.now().toString();
      const newTextAnnotation: TextAnnotation = {
        id: newId,
        text: newText.trim(),
        x: textPosition.x,
        y: textPosition.y,
        color: drawColor,
        fontSize: textFontSize,
      };
      setTextAnnotations(prev => [...prev, newTextAnnotation]);
      setUndoHistory(prev => [...prev, { type: 'text', id: newId }]);
    }
    setNewText('');
    setShowTextModal(false);
  };

  const undo = () => {
    if (undoHistory.length === 0) return;
    
    const lastAction = undoHistory[undoHistory.length - 1];
    setUndoHistory(prev => prev.slice(0, -1));
    
    switch (lastAction.type) {
      case 'path':
        setPaths(prev => prev.slice(0, -1));
        break;
      case 'shape':
        setShapes(prev => prev.filter(s => s.id !== lastAction.id));
        break;
      case 'text':
        setTextAnnotations(prev => prev.filter(t => t.id !== lastAction.id));
        break;
    }
  };

  const clearAll = () => {
    Alert.alert(
      'Alles löschen?',
      'Möchten Sie wirklich alle Anmerkungen löschen?',
      [
        { text: 'Abbrechen', style: 'cancel' },
        { 
          text: 'Löschen', 
          style: 'destructive',
          onPress: () => {
            setPaths([]);
            setShapes([]);
            setTextAnnotations([]);
            setCurrentPath('');
            setCurrentShape(null);
            setUndoHistory([]);
          }
        },
      ]
    );
  };

  const shareDocument = async () => {
    if (!document?.originalPdfData) return;
    try {
      const base64 = document.originalPdfData.includes(',') 
        ? document.originalPdfData.split(',')[1] 
        : document.originalPdfData;
      const fileUri = `${FileSystem.cacheDirectory}${document.name}`;
      await FileSystem.writeAsStringAsync(fileUri, base64, { encoding: 'base64' });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, { mimeType: 'application/pdf' });
      }
    } catch (error) {
      Alert.alert('Fehler', 'Konnte nicht geteilt werden');
    }
  };

  const getPdfViewerHtml = () => {
    if (!document?.originalPdfData) return '';
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>
        <style>
          * { margin: 0; padding: 0; }
          body { background: #525659; display: flex; flex-direction: column; align-items: center; padding: 10px; }
          .page { background: white; margin: 10px 0; box-shadow: 0 4px 12px rgba(0,0,0,0.3); }
          canvas { display: block; max-width: 100%; height: auto; }
        </style>
      </head>
      <body>
        <div id="container"></div>
        <script>
          pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
          const pdfData = '${document.originalPdfData}';
          const base64 = pdfData.includes(',') ? pdfData.split(',')[1] : pdfData;
          const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
          
          let currentPage = 1;
          pdfjsLib.getDocument({data: bytes}).promise.then(async pdf => {
            window.ReactNativeWebView.postMessage(JSON.stringify({type: 'pageCount', count: pdf.numPages}));
            for (let i = 1; i <= pdf.numPages; i++) {
              const page = await pdf.getPage(i);
              const viewport = page.getViewport({scale: 2});
              const wrapper = document.createElement('div');
              wrapper.className = 'page';
              wrapper.id = 'page-' + i;
              const canvas = document.createElement('canvas');
              canvas.width = viewport.width;
              canvas.height = viewport.height;
              canvas.style.width = '100%';
              wrapper.appendChild(canvas);
              document.getElementById('container').appendChild(wrapper);
              await page.render({canvasContext: canvas.getContext('2d'), viewport}).promise;
            }
            
            new IntersectionObserver(entries => {
              entries.forEach(e => {
                if (e.isIntersecting) {
                  const p = parseInt(e.target.id.split('-')[1]);
                  if (p !== currentPage) {
                    currentPage = p;
                    window.ReactNativeWebView.postMessage(JSON.stringify({type: 'currentPage', page: p}));
                  }
                }
              });
            }, {threshold: 0.5}).observe(...document.querySelectorAll('.page'));
          });
          
          window.goToPage = p => document.getElementById('page-' + p)?.scrollIntoView({behavior: 'smooth'});
        </script>
      </body>
      </html>
    `;
  };

  const getPageRendererHtml = () => {
    if (!document?.originalPdfData) return '';
    return `
      <!DOCTYPE html>
      <html><body>
        <canvas id="c"></canvas>
        <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>
        <script>
          pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
          const pdfData = '${document.originalPdfData}';
          const base64 = pdfData.includes(',') ? pdfData.split(',')[1] : pdfData;
          const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
          pdfjsLib.getDocument({data: bytes}).promise.then(async pdf => {
            const page = await pdf.getPage(${currentPage});
            const viewport = page.getViewport({scale: 2});
            const canvas = document.getElementById('c');
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            await page.render({canvasContext: canvas.getContext('2d'), viewport}).promise;
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'pageRendered',
              imageData: canvas.toDataURL('image/png'),
              width: viewport.width,
              height: viewport.height
            }));
          });
        </script>
      </body></html>
    `;
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#1976d2" />
        <Text style={styles.loadingText}>Laden...</Text>
      </View>
    );
  }



  // EDIT MODE - Hybrid: flexbox with calculated canvas height
  if (isEditing) {
    const { width: screenW, height: screenH } = Dimensions.get('screen');
    const SAFE_AREA_TOP = 24;
    const HEADER_H = 70;
    const TOOLBAR_H = 60;
    const CANVAS_H = screenH - SAFE_AREA_TOP - HEADER_H - TOOLBAR_H;
    
    return (
      <Modal visible={true} animationType="none" statusBarTranslucent={true} presentationStyle="overFullScreen">
        <StatusBar hidden={true} />
        <View style={{ width: screenW, height: screenH, backgroundColor: '#e8e8e8' }}>
          {/* Safe Area Spacer */}
          <View style={{ height: SAFE_AREA_TOP, backgroundColor: '#fff' }} />
          
          {/* Header - fixed height */}
          <View style={[styles.editHeader, { height: HEADER_H }]}>
            <TouchableOpacity onPress={cancelEditing} style={styles.iconBtn}>
              <Ionicons name="close" size={24} color="#f44336" />
            </TouchableOpacity>
            
            <Text style={styles.headerText}>Seite {currentPage}/{totalPages || 1}</Text>
            
            <View style={{ flex: 1 }} />
            <TouchableOpacity onPress={undo} style={styles.iconBtn} disabled={undoHistory.length === 0}>
              <Ionicons name="arrow-undo" size={24} color={undoHistory.length > 0 ? "#1976d2" : "#ccc"} />
            </TouchableOpacity>
            <TouchableOpacity onPress={clearAll} style={styles.iconBtn}>
              <Ionicons name="trash-outline" size={24} color="#f44336" />
            </TouchableOpacity>
            <TouchableOpacity onPress={saveAnnotations} style={styles.iconBtn}>
              <Ionicons name="save-outline" size={24} color="#4caf50" />
            </TouchableOpacity>
            <TouchableOpacity onPress={shareAnnotated} style={styles.iconBtn}>
              <Ionicons name="share-outline" size={24} color="#1976d2" />
            </TouchableOpacity>
          </View>

          {/* Canvas Area with side navigation arrows */}
          <View style={{ width: screenW, height: CANVAS_H, flexDirection: 'row', alignItems: 'center', backgroundColor: '#d0d0d0' }}>
            {/* Left Arrow */}
            <TouchableOpacity 
              onPress={() => { if (currentPage > 1) setCurrentPage(currentPage - 1); }} 
              style={styles.sideArrow}
              disabled={currentPage <= 1}
            >
              <Ionicons name="chevron-back" size={40} color={currentPage > 1 ? "#1976d2" : "#ccc"} />
            </TouchableOpacity>
            
            {/* Canvas */}
            <View style={{ flex: 1, height: '100%', justifyContent: 'center', alignItems: 'center' }} onLayout={onCanvasAreaLayout}>
            {renderingPage && !pageImage ? (
              <View style={styles.centered}>
                <ActivityIndicator size="large" color="#1976d2" />
              </View>
            ) : (
              <ScrollView 
                horizontal 
                contentContainerStyle={{ justifyContent: 'center', alignItems: 'center', minWidth: '100%', minHeight: '100%' }}
                maximumZoomScale={3}
                minimumZoomScale={0.5}
                showsHorizontalScrollIndicator={false}
                showsVerticalScrollIndicator={false}
                scrollEnabled={zoomEnabled}
              >
                <ScrollView 
                  contentContainerStyle={{ justifyContent: 'center', alignItems: 'center' }}
                  showsVerticalScrollIndicator={false}
                  scrollEnabled={zoomEnabled}
                >
                  <View
                    ref={canvasRef}
                    style={[styles.canvas, { 
                      width: imageSize.width * (zoomEnabled ? zoomLevel : 1), 
                      height: imageSize.height * (zoomEnabled ? zoomLevel : 1),
                      transform: [{ scale: zoomEnabled ? zoomLevel : 1 }],
                    }]}
                    onStartShouldSetResponder={() => !zoomEnabled}
                    onMoveShouldSetResponder={() => !zoomEnabled}
                    onResponderGrant={(e) => handleTouch(e, 'start')}
                    onResponderMove={(e) => handleTouch(e, 'move')}
                    onResponderRelease={(e) => handleTouch(e, 'end')}
                  >
                    {pageImage && (
                      <Image
                        source={{ uri: pageImage }}
                        style={{ width: imageSize.width, height: imageSize.height }}
                        resizeMode="contain"
                      />
                    )}
                    <Svg style={StyleSheet.absoluteFill}>
                      {paths.map((p, i) => (
                        <Path key={i} d={p.path} stroke={p.color} strokeWidth={p.strokeWidth} fill="none" opacity={p.opacity} strokeLinecap="round" />
                      ))}
                      {currentPath && (
                        <Path d={currentPath} stroke={isEraser ? '#FFFFFF' : drawColor} strokeWidth={isEraser ? strokeWidth * 3 : strokeWidth} fill="none" opacity={isHighlighter ? 0.4 : 1} strokeLinecap="round" />
                      )}
                      {shapes.map(shape => renderShape(shape))}
                      {currentShape && renderShape({ ...currentShape, color: drawColor, strokeWidth }, true)}
                      {textAnnotations.map(t => (
                        <SvgText key={t.id} x={t.x} y={t.y} fill={t.color || drawColor} fontSize={t.fontSize || 16} fontWeight="bold">{t.text}</SvgText>
                      ))}
                      
                      {/* Resize Handles for selected shape */}
                      {isSelectMode && selectedElement && selectedElement.type === 'shape' && (() => {
                        const shape = shapes.find(s => s.id === selectedElement.id);
                        if (!shape) return null;
                        const minX = Math.min(shape.x1, shape.x2);
                        const maxX = Math.max(shape.x1, shape.x2);
                        const minY = Math.min(shape.y1, shape.y2);
                        const maxY = Math.max(shape.y1, shape.y2);
                        const handleSize = 12;
                        return (
                          <G>
                            {/* Selection border */}
                            <Rect 
                              x={minX - 2} 
                              y={minY - 2} 
                              width={maxX - minX + 4} 
                              height={maxY - minY + 4} 
                              stroke="#1976d2" 
                              strokeWidth={2} 
                              strokeDasharray="5,5" 
                              fill="none" 
                            />
                            {/* Corner handles */}
                            <Rect x={minX - handleSize/2} y={minY - handleSize/2} width={handleSize} height={handleSize} fill="#1976d2" />
                            <Rect x={maxX - handleSize/2} y={minY - handleSize/2} width={handleSize} height={handleSize} fill="#1976d2" />
                            <Rect x={minX - handleSize/2} y={maxY - handleSize/2} width={handleSize} height={handleSize} fill="#1976d2" />
                            <Rect x={maxX - handleSize/2} y={maxY - handleSize/2} width={handleSize} height={handleSize} fill="#1976d2" />
                          </G>
                        );
                      })()}
                      
                      {/* Selection indicator for text */}
                      {isSelectMode && selectedElement && selectedElement.type === 'text' && (() => {
                        const text = textAnnotations.find(t => t.id === selectedElement.id);
                        if (!text) return null;
                        return (
                          <Rect 
                            x={text.x - 5} 
                            y={text.y - (text.fontSize || 16)} 
                            width={100} 
                            height={(text.fontSize || 16) + 10} 
                            stroke="#1976d2" 
                            strokeWidth={2} 
                            strokeDasharray="5,5" 
                            fill="none" 
                          />
                        );
                      })()}
                    </Svg>
                  </View>
                </ScrollView>
              </ScrollView>
            )}
          </View>
            
            {/* Right Arrow */}
            <TouchableOpacity 
              onPress={() => { if (currentPage < totalPages) setCurrentPage(currentPage + 1); }} 
              style={styles.sideArrow}
              disabled={currentPage >= totalPages}
            >
              <Ionicons name="chevron-forward" size={40} color={currentPage < totalPages ? "#1976d2" : "#ccc"} />
            </TouchableOpacity>
          </View>

          {/* Toolbar - fixed height at bottom */}
          <View style={[styles.editToolbar, { height: TOOLBAR_H }]}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.toolbarContent} keyboardShouldPersistTaps="always">
              {/* Select/Move Tool */}
              <TouchableOpacity style={[styles.toolBtn, getCurrentTool() === 'select' && styles.toolBtnActive]} onPress={() => selectTool('select')}>
                <Ionicons name="move" size={20} color={getCurrentTool() === 'select' ? '#fff' : '#666'} />
              </TouchableOpacity>
              <View style={styles.divider} />
              
              <TouchableOpacity style={[styles.toolBtn, getCurrentTool() === 'pen' && styles.toolBtnActive]} onPress={() => selectTool('pen')}>
                <Ionicons name="pencil" size={20} color={getCurrentTool() === 'pen' ? '#fff' : '#666'} />
              </TouchableOpacity>
              <TouchableOpacity style={[styles.toolBtn, getCurrentTool() === 'eraser' && styles.toolBtnActive]} onPress={() => selectTool('eraser')}>
                <Text style={{ fontSize: 18 }}>🧽</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.toolBtn, getCurrentTool() === 'text' && styles.toolBtnActive]} onPress={() => selectTool('text')}>
                <Ionicons name="text" size={20} color={getCurrentTool() === 'text' ? '#fff' : '#666'} />
              </TouchableOpacity>
              <View style={styles.divider} />
              <TouchableOpacity style={[styles.toolBtn, getCurrentTool() === 'rectangle' && styles.toolBtnActive]} onPress={() => selectTool('rectangle')}>
                <Ionicons name="square-outline" size={20} color={getCurrentTool() === 'rectangle' ? '#fff' : '#666'} />
              </TouchableOpacity>
              <TouchableOpacity style={[styles.toolBtn, getCurrentTool() === 'circle' && styles.toolBtnActive]} onPress={() => selectTool('circle')}>
                <Ionicons name="ellipse-outline" size={20} color={getCurrentTool() === 'circle' ? '#fff' : '#666'} />
              </TouchableOpacity>
              <TouchableOpacity style={[styles.toolBtn, getCurrentTool() === 'arrow' && styles.toolBtnActive]} onPress={() => selectTool('arrow')}>
                <Ionicons name="arrow-forward" size={20} color={getCurrentTool() === 'arrow' ? '#fff' : '#666'} />
              </TouchableOpacity>
              <TouchableOpacity style={[styles.toolBtn, getCurrentTool() === 'line' && styles.toolBtnActive]} onPress={() => selectTool('line')}>
                <Ionicons name="remove" size={20} color={getCurrentTool() === 'line' ? '#fff' : '#666'} />
              </TouchableOpacity>
              {/* Memo Pointer */}
              <TouchableOpacity style={[styles.toolBtn, getCurrentTool() === 'pointer' && styles.toolBtnActive]} onPress={() => selectTool('pointer')}>
                <Ionicons name="chatbubble-outline" size={20} color={getCurrentTool() === 'pointer' ? '#fff' : '#666'} />
              </TouchableOpacity>
              <View style={styles.divider} />
              <TouchableOpacity style={styles.toolBtn} onPress={() => setStrokeWidth(strokeWidth === 3 ? 6 : strokeWidth === 6 ? 9 : 3)}>
                <View style={[styles.strokePreview, { height: strokeWidth, backgroundColor: drawColor }]} />
              </TouchableOpacity>
              {isTextMode && (
                <TouchableOpacity style={styles.toolBtn} onPress={() => setTextFontSize(textFontSize === 12 ? 16 : textFontSize === 16 ? 24 : 12)}>
                  <Text style={{ fontSize: textFontSize === 12 ? 10 : textFontSize === 16 ? 14 : 18, fontWeight: 'bold', color: '#666' }}>A</Text>
                </TouchableOpacity>
              )}
              <View style={styles.divider} />
              
              {/* Zoom Toggle */}
              <TouchableOpacity 
                style={[styles.toolBtn, zoomEnabled && styles.toolBtnActive]} 
                onPress={() => setZoomEnabled(!zoomEnabled)}
              >
                <Ionicons name="search" size={20} color={zoomEnabled ? '#fff' : '#666'} />
              </TouchableOpacity>
              
              <View style={styles.divider} />
              {['#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#FF9800', '#000000', '#FFFFFF'].map(color => (
                <TouchableOpacity
                  key={color}
                  style={[styles.colorBtn, { backgroundColor: color }, drawColor === color && styles.colorBtnActive, color === '#FFFFFF' && styles.colorBtnWhite]}
                  onPress={() => setDrawColor(color)}
                />
              ))}
            </ScrollView>
          </View>

          {/* Hidden WebView */}
          <WebView
            ref={pageWebViewRef}
            source={{ html: getPageRendererHtml() }}
            style={{ height: 1, width: 1, position: 'absolute', top: -1000 }}
            onMessage={handlePageRendered}
            javaScriptEnabled
          />

          {/* Text Modal */}
          <Modal visible={showTextModal} transparent animationType="fade">
            <View style={styles.modalOverlay}>
              <View style={[styles.modalContent, { marginBottom: 200 }]}>
                <Text style={styles.modalTitle}>Text hinzufügen</Text>
                <TextInput
                  style={[styles.textInput, { color: drawColor, fontSize: textFontSize }]}
                  value={newText}
                  onChangeText={setNewText}
                  placeholder="Text eingeben..."
                  placeholderTextColor="#999"
                  autoFocus
                  multiline
                />
                <View style={styles.textSizeRow}>
                  <Text style={styles.textSizeLabel}>Textgröße:</Text>
                  {[12, 16, 24].map(size => (
                    <TouchableOpacity 
                      key={size}
                      style={[styles.textSizeBtn, textFontSize === size && styles.textSizeBtnActive]}
                      onPress={() => setTextFontSize(size)}
                    >
                      <Text style={{ fontSize: size * 0.6, fontWeight: textFontSize === size ? 'bold' : 'normal' }}>
                        {size === 12 ? 'S' : size === 16 ? 'M' : 'L'}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <View style={styles.modalButtons}>
                  <TouchableOpacity style={styles.modalBtnCancel} onPress={() => { setNewText(''); setShowTextModal(false); }}>
                    <Text>Abbrechen</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.modalBtnOk} onPress={addText}>
                    <Text style={{ color: '#fff' }}>OK</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </Modal>

          {/* Pointer Text Modal */}
          <Modal visible={showPointerModal} transparent animationType="fade">
            <View style={styles.modalOverlay}>
              <View style={[styles.modalContent, { marginBottom: 200 }]}>
                <Text style={styles.modalTitle}>Memo-Pfeil Text</Text>
                <TextInput
                  style={[styles.textInput, { color: drawColor }]}
                  value={pointerText}
                  onChangeText={setPointerText}
                  placeholder="Text für Pfeil (optional)..."
                  placeholderTextColor="#999"
                  autoFocus
                />
                <View style={styles.modalButtons}>
                  <TouchableOpacity style={styles.modalBtnCancel} onPress={() => { setPointerText(''); setPendingPointer(null); setShowPointerModal(false); }}>
                    <Text>Abbrechen</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.modalBtnOk} onPress={addPointerElement}>
                    <Text style={{ color: '#fff' }}>OK</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </Modal>
        </View>
      </Modal>
    );
  }

  // NORMAL VIEW MODE
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn}>
          <Ionicons name="arrow-back" size={24} color="#1976d2" />
        </TouchableOpacity>
        <View style={{ flex: 1, marginHorizontal: 10 }}>
          <Text style={styles.headerText} numberOfLines={1}>{document?.name}</Text>
          <Text style={styles.pageText}>Seite {currentPage} von {totalPages}</Text>
        </View>
        <TouchableOpacity onPress={shareDocument} style={styles.iconBtn}>
          <Ionicons name="share-outline" size={24} color="#1976d2" />
        </TouchableOpacity>
      </View>

      <View style={styles.pdfArea}>
        {document?.originalPdfData ? (
          <WebView
            ref={webViewRef}
            source={{ html: getPdfViewerHtml() }}
            style={{ flex: 1 }}
            onMessage={handleWebViewMessage}
            javaScriptEnabled
          />
        ) : (
          <View style={styles.centered}>
            <Text>Keine PDF-Daten</Text>
          </View>
        )}
      </View>

      <View style={styles.toolbar}>
        <TouchableOpacity style={styles.navBtn} onPress={() => goToPage(currentPage - 1)} disabled={currentPage <= 1}>
          <Ionicons name="chevron-back" size={28} color={currentPage <= 1 ? '#ccc' : '#1976d2'} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.editBtn} onPress={startEditing}>
          <Ionicons name="pencil" size={24} color="#fff" />
          <Text style={styles.editBtnText}>Bearbeiten</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.navBtn} onPress={() => goToPage(currentPage + 1)} disabled={currentPage >= totalPages}>
          <Ionicons name="chevron-forward" size={28} color={currentPage >= totalPages ? '#ccc' : '#1976d2'} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#525659' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 10, color: '#666' },
  
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
  },
  headerText: { fontSize: 16, fontWeight: '600' },
  pageText: { fontSize: 12, color: '#666' },
  iconBtn: { padding: 8 },
  
  pdfArea: { flex: 1 },
  
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    padding: 10,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#ddd',
  },
  navBtn: { padding: 10 },
  editBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#4caf50',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 25,
    gap: 8,
  },
  editBtnText: { color: '#fff', fontWeight: '600' },

  // Edit mode styles
  editRoot: { 
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#e8e8e8',
  },
  editHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
  },
  editCanvasContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#e8e8e8',
  },
  editCanvas: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  canvas: {
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  editToolbar: {
    height: 60,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#ddd',
    justifyContent: 'center',
  },
  editToolbarFixed: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 60,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#ddd',
    justifyContent: 'center',
  },
  editToolbarNormal: {
    height: 60,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#ddd',
    justifyContent: 'center',
  },
  toolbarContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
  },
  toolBtn: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 4,
  },
  toolBtnActive: { backgroundColor: '#1976d2' },
  divider: { width: 1, height: 30, backgroundColor: '#ddd', marginHorizontal: 10 },
  colorBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    marginHorizontal: 4,
    borderWidth: 2,
    borderColor: '#ddd',
  },
  colorBtnActive: { borderColor: '#1976d2', borderWidth: 3 },
  sideArrow: {
    width: 50,
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.8)',
  },

  // Modal
  modalOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.5)' },
  modalContent: { backgroundColor: '#fff', borderRadius: 12, padding: 20, width: '80%', maxWidth: 400 },
  modalTitle: { fontSize: 18, fontWeight: '600', marginBottom: 15, textAlign: 'center' },
  textInput: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, fontSize: 16, minHeight: 60 },
  modalButtons: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 15, gap: 10 },
  modalBtnCancel: { flex: 1, padding: 12, borderRadius: 8, backgroundColor: '#f0f0f0', alignItems: 'center' },
  modalBtnOk: { flex: 1, padding: 12, borderRadius: 8, backgroundColor: '#1976d2', alignItems: 'center' },
  textSizeRow: { flexDirection: 'row', alignItems: 'center', marginTop: 12, gap: 8 },
  textSizeLabel: { fontSize: 14, color: '#666' },
  textSizeBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#f0f0f0', justifyContent: 'center', alignItems: 'center' },
  textSizeBtnActive: { backgroundColor: '#1976d2', color: '#fff' },
  strokePreview: { width: 30, borderRadius: 2 },
  colorBtnWhite: { borderColor: '#ccc' },
});

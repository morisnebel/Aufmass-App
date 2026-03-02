import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Dimensions,
  ScrollView,
  TextInput,
  Modal,
  KeyboardAvoidingView,
  Platform,
  Image,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { WebView } from 'react-native-webview';
import Svg, { Path, Text as SvgText, Rect, Circle, Line, G } from 'react-native-svg';
import { captureRef } from 'react-native-view-shot';
import { DocumentService, Document, DocumentPage, TextAnnotation } from '../../services/LocalStorage';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface DrawPath {
  path: string;
  color: string;
  strokeWidth: number;
  opacity?: number;
  type: 'pen' | 'highlighter' | 'eraser';
}

interface ShapeAnnotation {
  id: string;
  type: 'rectangle' | 'circle' | 'arrow' | 'line';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
  strokeWidth: number;
}

type ToolMode = 'pen' | 'highlighter' | 'eraser' | 'text' | 'rectangle' | 'circle' | 'arrow' | 'line';

export default function DocumentAnnotateScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const documentId = Array.isArray(params.documentId) ? params.documentId[0] : params.documentId;
  const projectId = Array.isArray(params.projectId) ? params.projectId[0] : params.projectId;
  const initialPage = parseInt(Array.isArray(params.page) ? params.page[0] : params.page || '1');
  
  const [document, setDocument] = useState<Document | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(initialPage);
  const [totalPages, setTotalPages] = useState(0);
  const [pageImage, setPageImage] = useState<string | null>(null);
  const [renderingPage, setRenderingPage] = useState(false);
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
  
  // Drawing state
  const [paths, setPaths] = useState<DrawPath[]>([]);
  const [currentPath, setCurrentPath] = useState<string>('');
  const [drawColor, setDrawColor] = useState('#FF0000');
  const [strokeWidth, setStrokeWidth] = useState(3);
  const [canvasDimensions, setCanvasDimensions] = useState({ width: SCREEN_WIDTH, height: 600 });
  
  // Shape annotations
  const [shapes, setShapes] = useState<ShapeAnnotation[]>([]);
  const [currentShape, setCurrentShape] = useState<ShapeAnnotation | null>(null);
  
  // Text annotations
  const [textAnnotations, setTextAnnotations] = useState<TextAnnotation[]>([]);
  const [showTextModal, setShowTextModal] = useState(false);
  const [newTextAnnotation, setNewTextAnnotation] = useState('');
  const [textPosition, setTextPosition] = useState({ x: 50, y: 50 });
  const [textSize, setTextSize] = useState<'small' | 'medium' | 'large'>('medium');
  
  // Tool mode
  const [toolMode, setToolMode] = useState<ToolMode>('pen');
  const [showToolPicker, setShowToolPicker] = useState(false);
  const [showStrokePicker, setShowStrokePicker] = useState(false);
  
  const canvasRef = useRef(null);
  const webViewRef = useRef<WebView>(null);
  const scrollViewRef = useRef<ScrollView>(null);

  useEffect(() => {
    loadDocument();
  }, [documentId]);

  useEffect(() => {
    if (document && totalPages > 0) {
      loadPageAnnotations();
      renderCurrentPage();
    }
  }, [currentPage, document, totalPages]);

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
      console.error('Error loading document:', error);
      Alert.alert('Fehler', 'Dokument konnte nicht geladen werden');
    } finally {
      setLoading(false);
    }
  };

  const loadPageAnnotations = () => {
    if (!document) return;
    
    const page = document.pages.find(p => p.pageNumber === currentPage);
    if (page) {
      if (page.annotations) {
        try {
          const annotationData = JSON.parse(page.annotations);
          if (annotationData.paths) {
            setPaths(annotationData.paths);
          }
          if (annotationData.shapes) {
            setShapes(annotationData.shapes);
          }
        } catch (e) {
          console.error('Error parsing annotations:', e);
          setPaths([]);
          setShapes([]);
        }
      } else {
        setPaths([]);
        setShapes([]);
      }
      setTextAnnotations(page.textAnnotations || []);
    } else {
      setPaths([]);
      setShapes([]);
      setTextAnnotations([]);
    }
  };

  const handleWebViewMessage = (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'pageCount') {
        setTotalPages(data.count);
      } else if (data.type === 'pageImage') {
        setPageImage(data.image);
        setImageSize({ width: data.width, height: data.height });
        // Calculate canvas dimensions based on image aspect ratio
        // A4 aspect ratio is approximately 1:1.414
        const aspectRatio = data.height / data.width;
        const canvasWidth = SCREEN_WIDTH - 20;
        const canvasHeight = canvasWidth * aspectRatio;
        console.log('PDF dimensions:', data.width, 'x', data.height, 'aspectRatio:', aspectRatio, 'canvas:', canvasWidth, 'x', canvasHeight);
        setCanvasDimensions({ width: canvasWidth, height: canvasHeight });
        setRenderingPage(false);
      } else if (data.type === 'error') {
        console.warn('PDF render warning:', data.message);
        setRenderingPage(false);
      }
    } catch (e) {
      console.warn('Error parsing WebView message:', e);
    }
  };

  const renderCurrentPage = () => {
    setRenderingPage(true);
    webViewRef.current?.injectJavaScript(`renderPageAsImage(${currentPage}); true;`);
  };

  const getPdfRendererHtml = () => {
    if (!document?.originalPdfData) return '';

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>
      </head>
      <body>
        <canvas id="canvas" style="display:none;"></canvas>
        <script>
          pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
          
          let pdfDoc = null;
          let currentRenderTask = null;
          let isRendering = false;
          const scale = 2.0;
          
          async function loadPdf() {
            try {
              const pdfData = '${document.originalPdfData}';
              const base64Data = pdfData.includes(',') ? pdfData.split(',')[1] : pdfData;
              const binaryString = atob(base64Data);
              const bytes = new Uint8Array(binaryString.length);
              for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
              }
              
              pdfDoc = await pdfjsLib.getDocument({ data: bytes }).promise;
              
              window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'pageCount',
                count: pdfDoc.numPages
              }));
              
              await renderPageAsImage(${initialPage});
              
            } catch (error) {
              window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'error',
                message: error.message
              }));
            }
          }
          
          async function renderPageAsImage(pageNum) {
            if (!pdfDoc) return;
            
            if (currentRenderTask) {
              try {
                currentRenderTask.cancel();
              } catch (e) {}
              currentRenderTask = null;
            }
            
            if (isRendering) {
              await new Promise(resolve => setTimeout(resolve, 100));
            }
            
            isRendering = true;
            
            try {
              const page = await pdfDoc.getPage(pageNum);
              const viewport = page.getViewport({ scale: scale });
              
              const canvas = document.createElement('canvas');
              const context = canvas.getContext('2d');
              canvas.height = viewport.height;
              canvas.width = viewport.width;
              
              currentRenderTask = page.render({
                canvasContext: context,
                viewport: viewport
              });
              
              await currentRenderTask.promise;
              currentRenderTask = null;
              
              const imageData = canvas.toDataURL('image/png');
              
              window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'pageImage',
                image: imageData,
                page: pageNum,
                width: viewport.width,
                height: viewport.height
              }));
              
            } catch (error) {
              if (error.name !== 'RenderingCancelledException') {
                console.warn('PDF render warning:', error.message);
              }
            } finally {
              isRendering = false;
            }
          }
          
          loadPdf();
        </script>
      </body>
      </html>
    `;
  };

  // Touch handlers
  const onTouchStart = (event: any) => {
    const touch = event.nativeEvent.touches ? event.nativeEvent.touches[0] : event.nativeEvent;
    const locationX = touch.locationX || touch.pageX;
    const locationY = touch.locationY || touch.pageY;

    if (toolMode === 'text') {
      setTextPosition({ x: locationX, y: locationY });
      setShowTextModal(true);
      return;
    }

    if (['rectangle', 'circle', 'arrow', 'line'].includes(toolMode)) {
      const newShape: ShapeAnnotation = {
        id: Date.now().toString(),
        type: toolMode as 'rectangle' | 'circle' | 'arrow' | 'line',
        x1: locationX,
        y1: locationY,
        x2: locationX,
        y2: locationY,
        color: drawColor,
        strokeWidth: strokeWidth,
      };
      setCurrentShape(newShape);
      return;
    }

    // Pen, highlighter, or eraser
    setCurrentPath(`M ${locationX} ${locationY}`);
  };

  const onTouchMove = (event: any) => {
    const touch = event.nativeEvent.touches ? event.nativeEvent.touches[0] : event.nativeEvent;
    const locationX = touch.locationX || touch.pageX;
    const locationY = touch.locationY || touch.pageY;

    if (currentShape) {
      setCurrentShape({
        ...currentShape,
        x2: locationX,
        y2: locationY,
      });
      return;
    }

    if (currentPath) {
      setCurrentPath((prev) => `${prev} L ${locationX} ${locationY}`);
    }
  };

  const onTouchEnd = () => {
    if (currentShape) {
      setShapes([...shapes, currentShape]);
      setCurrentShape(null);
      return;
    }

    if (currentPath && currentPath.length > 0) {
      const newPath: DrawPath = {
        path: currentPath,
        color: toolMode === 'eraser' ? '#FFFFFF' : drawColor,
        strokeWidth: toolMode === 'eraser' ? strokeWidth * 3 : strokeWidth,
        opacity: toolMode === 'highlighter' ? 0.4 : 1,
        type: toolMode as 'pen' | 'highlighter' | 'eraser',
      };
      setPaths([...paths, newPath]);
      setCurrentPath('');
    }
  };

  const addTextAnnotation = () => {
    if (!newTextAnnotation.trim()) {
      setShowTextModal(false);
      return;
    }

    const fontSize = textSize === 'small' ? 12 : textSize === 'large' ? 24 : 16;
    const newAnnotation: TextAnnotation = {
      id: Date.now().toString(),
      x: textPosition.x,
      y: textPosition.y,
      text: newTextAnnotation.trim(),
      color: drawColor,
      fontSize: fontSize,
    };

    setTextAnnotations([...textAnnotations, newAnnotation]);
    setNewTextAnnotation('');
    setShowTextModal(false);
  };

  const undo = () => {
    if (paths.length > 0) {
      setPaths(paths.slice(0, -1));
    } else if (shapes.length > 0) {
      setShapes(shapes.slice(0, -1));
    } else if (textAnnotations.length > 0) {
      setTextAnnotations(textAnnotations.slice(0, -1));
    }
  };

  const clear = () => {
    Alert.alert(
      'Alle Anmerkungen löschen',
      'Möchten Sie alle Zeichnungen, Formen und Texte auf dieser Seite löschen?',
      [
        { text: 'Abbrechen', style: 'cancel' },
        { 
          text: 'Löschen', 
          style: 'destructive',
          onPress: () => {
            setPaths([]);
            setShapes([]);
            setTextAnnotations([]);
          }
        },
      ]
    );
  };

  const save = async () => {
    try {
      setLoading(true);
      
      const annotationData = {
        paths: paths,
        shapes: shapes,
        canvasWidth: canvasDimensions.width,
        canvasHeight: canvasDimensions.height,
      };

      let pages = document?.pages || [];
      const pageIndex = pages.findIndex(p => p.pageNumber === currentPage);
      
      const pageData: DocumentPage = {
        pageNumber: currentPage,
        imageData: pageImage || '',
        annotations: JSON.stringify(annotationData),
        textAnnotations: textAnnotations,
      };

      if (pageIndex !== -1) {
        pages[pageIndex] = pageData;
      } else {
        pages.push(pageData);
      }

      await DocumentService.update(documentId || '', {
        pages: pages,
      });

      Alert.alert('Erfolg', 'Anmerkungen wurden gespeichert');
    } catch (error) {
      console.error('Error saving annotations:', error);
      Alert.alert('Fehler', 'Anmerkungen konnten nicht gespeichert werden');
    } finally {
      setLoading(false);
    }
  };

  const shareAnnotatedPage = async () => {
    if (!canvasRef.current) return;
    
    try {
      setLoading(true);
      
      const uri = await captureRef(canvasRef, {
        format: 'png',
        quality: 1,
      });
      
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(uri, {
          mimeType: 'image/png',
          dialogTitle: 'Seite teilen',
        });
      }
    } catch (error) {
      console.error('Error sharing page:', error);
      Alert.alert('Fehler', 'Seite konnte nicht geteilt werden');
    } finally {
      setLoading(false);
    }
  };

  const colors = [
    { color: '#FF0000', name: 'Rot' },
    { color: '#00AA00', name: 'Grün' },
    { color: '#0000FF', name: 'Blau' },
    { color: '#FF9900', name: 'Orange' },
    { color: '#FFFF00', name: 'Gelb' },
    { color: '#000000', name: 'Schwarz' },
    { color: '#FFFFFF', name: 'Weiß' },
  ];

  const strokeWidths = [
    { width: 2, label: 'Dünn' },
    { width: 4, label: 'Mittel' },
    { width: 8, label: 'Dick' },
  ];

  const tools = [
    { mode: 'pen' as ToolMode, icon: 'pencil', label: 'Stift' },
    { mode: 'highlighter' as ToolMode, icon: 'color-fill', label: 'Marker' },
    { mode: 'eraser' as ToolMode, icon: 'backspace', label: 'Radierer' },
    { mode: 'text' as ToolMode, icon: 'text', label: 'Text' },
    { mode: 'rectangle' as ToolMode, icon: 'square-outline', label: 'Rechteck' },
    { mode: 'circle' as ToolMode, icon: 'ellipse-outline', label: 'Kreis' },
    { mode: 'arrow' as ToolMode, icon: 'arrow-forward', label: 'Pfeil' },
    { mode: 'line' as ToolMode, icon: 'remove', label: 'Linie' },
  ];

  const renderShape = (shape: ShapeAnnotation, isPreview = false) => {
    const key = isPreview ? 'preview' : shape.id;
    
    switch (shape.type) {
      case 'rectangle':
        const rectX = Math.min(shape.x1, shape.x2);
        const rectY = Math.min(shape.y1, shape.y2);
        const rectW = Math.abs(shape.x2 - shape.x1);
        const rectH = Math.abs(shape.y2 - shape.y1);
        return (
          <Rect
            key={key}
            x={rectX}
            y={rectY}
            width={rectW}
            height={rectH}
            stroke={shape.color}
            strokeWidth={shape.strokeWidth}
            fill="none"
          />
        );
      case 'circle':
        const cx = (shape.x1 + shape.x2) / 2;
        const cy = (shape.y1 + shape.y2) / 2;
        const rx = Math.abs(shape.x2 - shape.x1) / 2;
        const ry = Math.abs(shape.y2 - shape.y1) / 2;
        return (
          <Circle
            key={key}
            cx={cx}
            cy={cy}
            r={Math.max(rx, ry)}
            stroke={shape.color}
            strokeWidth={shape.strokeWidth}
            fill="none"
          />
        );
      case 'arrow':
      case 'line':
        const angle = Math.atan2(shape.y2 - shape.y1, shape.x2 - shape.x1);
        const arrowLength = 15;
        const arrowAngle = Math.PI / 6;
        
        return (
          <G key={key}>
            <Line
              x1={shape.x1}
              y1={shape.y1}
              x2={shape.x2}
              y2={shape.y2}
              stroke={shape.color}
              strokeWidth={shape.strokeWidth}
            />
            {shape.type === 'arrow' && (
              <>
                <Line
                  x1={shape.x2}
                  y1={shape.y2}
                  x2={shape.x2 - arrowLength * Math.cos(angle - arrowAngle)}
                  y2={shape.y2 - arrowLength * Math.sin(angle - arrowAngle)}
                  stroke={shape.color}
                  strokeWidth={shape.strokeWidth}
                />
                <Line
                  x1={shape.x2}
                  y1={shape.y2}
                  x2={shape.x2 - arrowLength * Math.cos(angle + arrowAngle)}
                  y2={shape.y2 - arrowLength * Math.sin(angle + arrowAngle)}
                  stroke={shape.color}
                  strokeWidth={shape.strokeWidth}
                />
              </>
            )}
          </G>
        );
      default:
        return null;
    }
  };

  if (loading && !document) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#1976d2" />
        <Text style={styles.loadingText}>Dokument wird geladen...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Hidden WebView for PDF rendering */}
      <WebView
        ref={webViewRef}
        source={{ html: getPdfRendererHtml() }}
        style={{ height: 0, width: 0, opacity: 0 }}
        onMessage={handleWebViewMessage}
        javaScriptEnabled={true}
      />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerButton}>
          <Ionicons name="arrow-back" size={24} color="#1976d2" />
        </TouchableOpacity>
        <View style={styles.headerTitle}>
          <Text style={styles.title} numberOfLines={1}>{document?.name}</Text>
          <Text style={styles.pageInfo}>Seite {currentPage} von {totalPages}</Text>
        </View>
        <TouchableOpacity onPress={shareAnnotatedPage} style={styles.headerButton}>
          <Ionicons name="share-outline" size={24} color="#1976d2" />
        </TouchableOpacity>
        <TouchableOpacity onPress={save} style={styles.headerButton}>
          <Ionicons name="checkmark" size={28} color="#4caf50" />
        </TouchableOpacity>
      </View>

      {/* Main Toolbar */}
      <View style={styles.toolbar}>
        <TouchableOpacity style={styles.toolButton} onPress={undo}>
          <Ionicons name="arrow-undo" size={20} color="#1976d2" />
          <Text style={styles.toolText}>Zurück</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.toolButton} onPress={clear}>
          <Ionicons name="trash-outline" size={20} color="#f44336" />
          <Text style={styles.toolText}>Löschen</Text>
        </TouchableOpacity>
        
        {/* Current Tool Indicator */}
        <TouchableOpacity 
          style={[styles.toolButton, styles.toolButtonActive]}
          onPress={() => setShowToolPicker(true)}
        >
          <Ionicons 
            name={tools.find(t => t.mode === toolMode)?.icon as any || 'pencil'} 
            size={20} 
            color="#fff" 
          />
          <Text style={styles.toolTextActive}>
            {tools.find(t => t.mode === toolMode)?.label || 'Stift'}
          </Text>
        </TouchableOpacity>

        {/* Stroke Width */}
        <TouchableOpacity 
          style={styles.toolButton}
          onPress={() => setShowStrokePicker(true)}
        >
          <View style={[styles.strokePreview, { height: strokeWidth }]} />
          <Text style={styles.toolText}>Stärke</Text>
        </TouchableOpacity>
      </View>

      {/* Color Picker */}
      <View style={styles.colorPicker}>
        {colors.map((c) => (
          <TouchableOpacity
            key={c.color}
            style={[
              styles.colorButton,
              { backgroundColor: c.color },
              drawColor === c.color && styles.colorButtonActive,
              c.color === '#FFFFFF' && styles.colorButtonWhite,
            ]}
            onPress={() => setDrawColor(c.color)}
          />
        ))}
      </View>

      {/* Canvas Area - Scrollable */}
      <ScrollView 
        ref={scrollViewRef}
        style={styles.scrollContainer}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={true}
        bounces={true}
      >
        {renderingPage && (
          <View style={[styles.renderingOverlay, { height: canvasDimensions.height || 600 }]}>
            <ActivityIndicator size="large" color="#1976d2" />
            <Text style={styles.renderingText}>Seite wird geladen...</Text>
          </View>
        )}
        
        <View 
          ref={canvasRef}
          style={[styles.canvasContainer, { 
            width: canvasDimensions.width, 
            height: canvasDimensions.height || 600,
          }]}
        >
          {/* PDF Page Image as Background */}
          {pageImage && (
            <Image
              source={{ uri: pageImage }}
              style={{
                width: canvasDimensions.width,
                height: canvasDimensions.height || 600,
              }}
              resizeMode="contain"
            />
          )}
          
          {/* Drawing Layer - Absolute positioned over image */}
          <View
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: canvasDimensions.width,
              height: canvasDimensions.height || 600,
            }}
            onStartShouldSetResponder={() => true}
            onMoveShouldSetResponder={() => true}
            onResponderGrant={onTouchStart}
            onResponderMove={onTouchMove}
            onResponderRelease={onTouchEnd}
          >
            <Svg height="100%" width="100%" style={styles.svg}>
              {/* Drawn paths */}
              {paths.map((p, index) => (
                <Path
                  key={index}
                  d={p.path}
                  stroke={p.color}
                  strokeWidth={p.strokeWidth}
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  opacity={p.opacity || 1}
                />
              ))}
              
              {/* Current path being drawn */}
              {currentPath && (
                <Path
                  d={currentPath}
                  stroke={toolMode === 'eraser' ? '#FFFFFF' : drawColor}
                  strokeWidth={toolMode === 'eraser' ? strokeWidth * 3 : strokeWidth}
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  opacity={toolMode === 'highlighter' ? 0.4 : 1}
                />
              )}

              {/* Shapes */}
              {shapes.map(shape => renderShape(shape))}
              
              {/* Current shape being drawn */}
              {currentShape && renderShape(currentShape, true)}
              
              {/* Text annotations */}
              {textAnnotations.map((t) => (
                <SvgText
                  key={t.id}
                  x={t.x}
                  y={t.y}
                  fill={t.color}
                  fontSize={t.fontSize}
                  fontWeight="bold"
                  stroke={t.color === '#FFFFFF' || t.color === '#FFFF00' ? '#000' : 'none'}
                  strokeWidth={t.color === '#FFFFFF' || t.color === '#FFFF00' ? 0.5 : 0}
                >
                  {t.text}
                </SvgText>
              ))}
            </Svg>
          </View>
        </View>
      </ScrollView>

      {/* Page Navigation */}
      <View style={styles.pageNav}>
        <TouchableOpacity 
          style={[styles.navButton, currentPage <= 1 && styles.navButtonDisabled]}
          onPress={() => currentPage > 1 && setCurrentPage(currentPage - 1)}
          disabled={currentPage <= 1}
        >
          <Ionicons name="chevron-back" size={24} color={currentPage <= 1 ? '#ccc' : '#1976d2'} />
          <Text style={[styles.navText, currentPage <= 1 && styles.navTextDisabled]}>Vorherige</Text>
        </TouchableOpacity>
        
        <Text style={styles.pageIndicator}>{currentPage} / {totalPages}</Text>
        
        <TouchableOpacity 
          style={[styles.navButton, currentPage >= totalPages && styles.navButtonDisabled]}
          onPress={() => currentPage < totalPages && setCurrentPage(currentPage + 1)}
          disabled={currentPage >= totalPages}
        >
          <Text style={[styles.navText, currentPage >= totalPages && styles.navTextDisabled]}>Nächste</Text>
          <Ionicons name="chevron-forward" size={24} color={currentPage >= totalPages ? '#ccc' : '#1976d2'} />
        </TouchableOpacity>
      </View>

      {/* Tool Picker Modal */}
      <Modal visible={showToolPicker} transparent animationType="fade">
        <TouchableOpacity 
          style={styles.modalOverlay} 
          activeOpacity={1}
          onPress={() => setShowToolPicker(false)}
        >
          <View style={styles.toolPickerModal}>
            <Text style={styles.modalTitle}>Werkzeug wählen</Text>
            <View style={styles.toolGrid}>
              {tools.map((tool) => (
                <TouchableOpacity
                  key={tool.mode}
                  style={[
                    styles.toolPickerButton,
                    toolMode === tool.mode && styles.toolPickerButtonActive,
                  ]}
                  onPress={() => {
                    setToolMode(tool.mode);
                    setShowToolPicker(false);
                  }}
                >
                  <Ionicons 
                    name={tool.icon as any} 
                    size={28} 
                    color={toolMode === tool.mode ? '#fff' : '#1976d2'} 
                  />
                  <Text style={[
                    styles.toolPickerLabel,
                    toolMode === tool.mode && styles.toolPickerLabelActive,
                  ]}>
                    {tool.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Stroke Width Picker Modal */}
      <Modal visible={showStrokePicker} transparent animationType="fade">
        <TouchableOpacity 
          style={styles.modalOverlay} 
          activeOpacity={1}
          onPress={() => setShowStrokePicker(false)}
        >
          <View style={styles.strokePickerModal}>
            <Text style={styles.modalTitle}>Strichstärke</Text>
            <View style={styles.strokeOptions}>
              {strokeWidths.map((sw) => (
                <TouchableOpacity
                  key={sw.width}
                  style={[
                    styles.strokeOption,
                    strokeWidth === sw.width && styles.strokeOptionActive,
                  ]}
                  onPress={() => {
                    setStrokeWidth(sw.width);
                    setShowStrokePicker(false);
                  }}
                >
                  <View style={[styles.strokeLine, { height: sw.width, backgroundColor: drawColor }]} />
                  <Text style={styles.strokeLabel}>{sw.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            
            <Text style={[styles.modalTitle, { marginTop: 20 }]}>Textgröße</Text>
            <View style={styles.strokeOptions}>
              {[
                { size: 'small' as const, label: 'Klein', fontSize: 12 },
                { size: 'medium' as const, label: 'Mittel', fontSize: 16 },
                { size: 'large' as const, label: 'Groß', fontSize: 24 },
              ].map((ts) => (
                <TouchableOpacity
                  key={ts.size}
                  style={[
                    styles.strokeOption,
                    textSize === ts.size && styles.strokeOptionActive,
                  ]}
                  onPress={() => setTextSize(ts.size)}
                >
                  <Text style={[styles.textSizePreview, { fontSize: ts.fontSize }]}>Aa</Text>
                  <Text style={styles.strokeLabel}>{ts.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Text Input Modal */}
      <Modal visible={showTextModal} transparent animationType="fade">
        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={styles.textModal}>
            <Text style={styles.modalTitle}>Text hinzufügen</Text>
            <TextInput
              style={styles.textInput}
              value={newTextAnnotation}
              onChangeText={setNewTextAnnotation}
              placeholder="Text eingeben..."
              placeholderTextColor="#999"
              multiline
              autoFocus
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity 
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => {
                  setNewTextAnnotation('');
                  setShowTextModal(false);
                }}
              >
                <Text style={styles.cancelButtonText}>Abbrechen</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.modalButton, styles.addButton]}
                onPress={addTextAnnotation}
              >
                <Text style={styles.addButtonText}>Hinzufügen</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  headerButton: {
    padding: 8,
  },
  headerTitle: {
    flex: 1,
    marginHorizontal: 8,
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  pageInfo: {
    fontSize: 12,
    color: '#666',
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
    backgroundColor: '#fff',
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  toolButton: {
    alignItems: 'center',
    padding: 8,
    borderRadius: 8,
    backgroundColor: '#f5f5f5',
    minWidth: 60,
  },
  toolButtonActive: {
    backgroundColor: '#1976d2',
  },
  toolText: {
    fontSize: 10,
    color: '#333',
    marginTop: 2,
  },
  toolTextActive: {
    fontSize: 10,
    color: '#fff',
    marginTop: 2,
  },
  strokePreview: {
    width: 30,
    backgroundColor: '#333',
    borderRadius: 2,
    marginBottom: 2,
  },
  colorPicker: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    padding: 8,
    gap: 8,
    justifyContent: 'center',
  },
  colorButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#ddd',
  },
  colorButtonActive: {
    borderWidth: 3,
    borderColor: '#1976d2',
    transform: [{ scale: 1.1 }],
  },
  colorButtonWhite: {
    borderColor: '#999',
  },
  scrollContainer: {
    flex: 1,
    backgroundColor: '#e0e0e0',
  },
  scrollContent: {
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 10,
    flexGrow: 1,
  },
  renderingOverlay: {
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
  },
  renderingText: {
    color: '#fff',
    marginTop: 12,
    fontSize: 14,
  },
  canvasContainer: {
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
    position: 'relative',
  },
  pageImage: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  drawingLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  svg: {
    position: 'absolute',
  },
  pageNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  navButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
    gap: 4,
  },
  navButtonDisabled: {
    opacity: 0.5,
  },
  navText: {
    fontSize: 14,
    color: '#1976d2',
    fontWeight: '500',
  },
  navTextDisabled: {
    color: '#ccc',
  },
  pageIndicator: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  toolPickerModal: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    width: '100%',
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 16,
    textAlign: 'center',
  },
  toolGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'center',
  },
  toolPickerButton: {
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#f5f5f5',
    width: 80,
  },
  toolPickerButtonActive: {
    backgroundColor: '#1976d2',
  },
  toolPickerLabel: {
    fontSize: 12,
    color: '#333',
    marginTop: 4,
  },
  toolPickerLabelActive: {
    color: '#fff',
  },
  strokePickerModal: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    width: '100%',
    maxWidth: 350,
  },
  strokeOptions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    gap: 12,
  },
  strokeOption: {
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#f5f5f5',
    minWidth: 80,
  },
  strokeOptionActive: {
    backgroundColor: '#e3f2fd',
    borderWidth: 2,
    borderColor: '#1976d2',
  },
  strokeLine: {
    width: 50,
    borderRadius: 2,
    marginBottom: 8,
  },
  strokeLabel: {
    fontSize: 12,
    color: '#333',
  },
  textSizePreview: {
    color: '#333',
    fontWeight: 'bold',
    marginBottom: 8,
  },
  textModal: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    width: '100%',
    maxWidth: 400,
  },
  textInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 16,
  },
  modalButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  cancelButton: {
    backgroundColor: '#f5f5f5',
  },
  cancelButtonText: {
    color: '#666',
    fontWeight: '500',
  },
  addButton: {
    backgroundColor: '#1976d2',
  },
  addButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
});

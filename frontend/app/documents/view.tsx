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
  Platform,
  Image,
  Modal,
  TextInput,
  KeyboardAvoidingView,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { WebView } from 'react-native-webview';
import Svg, { Path, Text as SvgText, Rect, Circle, Line, G } from 'react-native-svg';
import { DocumentService, Document, TextAnnotation } from '../../services/LocalStorage';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';
import { captureRef } from 'react-native-view-shot';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface DrawPath {
  path: string;
  color: string;
  strokeWidth: number;
  opacity?: number;
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

export default function DocumentViewScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const documentId = Array.isArray(params.documentId) ? params.documentId[0] : params.documentId;
  const projectId = Array.isArray(params.projectId) ? params.projectId[0] : params.projectId;
  
  const [document, setDocument] = useState<Document | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [pdfLoaded, setPdfLoaded] = useState(false);
  const webViewRef = useRef<WebView>(null);
  
  // Edit mode state
  const [isEditing, setIsEditing] = useState(false);
  const [pageImage, setPageImage] = useState<string | null>(null);
  const [renderingPage, setRenderingPage] = useState(false);
  const pageWebViewRef = useRef<WebView>(null);
  const canvasRef = useRef<View>(null);
  
  // Drawing state
  const [paths, setPaths] = useState<DrawPath[]>([]);
  const [currentPath, setCurrentPath] = useState<string>('');
  const [drawColor, setDrawColor] = useState('#FF0000');
  const [strokeWidth, setStrokeWidth] = useState(3);
  
  // Shape annotations
  const [shapes, setShapes] = useState<ShapeAnnotation[]>([]);
  const [currentShape, setCurrentShape] = useState<ShapeAnnotation | null>(null);
  
  // Text annotations
  const [textAnnotations, setTextAnnotations] = useState<TextAnnotation[]>([]);
  const [showTextModal, setShowTextModal] = useState(false);
  const [newTextAnnotation, setNewTextAnnotation] = useState('');
  const [textPosition, setTextPosition] = useState({ x: 50, y: 50 });
  
  // Tool mode
  const [toolMode, setToolMode] = useState<ToolMode>('pen');

  // Colors available
  const colors = [
    { color: '#FF0000', name: 'Rot' },
    { color: '#00FF00', name: 'Grün' },
    { color: '#0000FF', name: 'Blau' },
    { color: '#FFFF00', name: 'Gelb' },
    { color: '#FF9800', name: 'Orange' },
    { color: '#000000', name: 'Schwarz' },
  ];

  // Tools available
  const tools = [
    { mode: 'pen' as ToolMode, icon: 'pencil', name: 'Stift' },
    { mode: 'highlighter' as ToolMode, icon: 'brush', name: 'Marker' },
    { mode: 'eraser' as ToolMode, icon: 'backspace', name: 'Radierer' },
    { mode: 'text' as ToolMode, icon: 'text', name: 'Text' },
    { mode: 'rectangle' as ToolMode, icon: 'square-outline', name: 'Rechteck' },
    { mode: 'circle' as ToolMode, icon: 'ellipse-outline', name: 'Kreis' },
    { mode: 'arrow' as ToolMode, icon: 'arrow-forward', name: 'Pfeil' },
    { mode: 'line' as ToolMode, icon: 'remove', name: 'Linie' },
  ];

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
      console.error('Error loading document:', error);
      Alert.alert('Fehler', 'Dokument konnte nicht geladen werden');
    } finally {
      setLoading(false);
    }
  };

  const handleMessage = (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'pageCount') {
        setTotalPages(data.count);
        setPdfLoaded(true);
      } else if (data.type === 'currentPage') {
        setCurrentPage(data.page);
      } else if (data.type === 'error') {
        console.warn('PDF render warning:', data.message);
      }
    } catch (e) {
      console.warn('Error parsing WebView message:', e);
    }
  };

  const handlePageImageMessage = (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'pageRendered') {
        setPageImage(data.imageData);
        setRenderingPage(false);
      } else if (data.type === 'error') {
        console.warn('Page render error:', data.message);
        setRenderingPage(false);
      }
    } catch (e) {
      console.warn('Error parsing page WebView message:', e);
    }
  };

  const goToPage = (page: number) => {
    if (page >= 1 && page <= totalPages) {
      webViewRef.current?.injectJavaScript(`goToPage(${page}); true;`);
    }
  };

  const startEditing = () => {
    setIsEditing(true);
    setRenderingPage(true);
    // Clear any previous annotations
    setPaths([]);
    setShapes([]);
    setTextAnnotations([]);
    setCurrentPath('');
    setCurrentShape(null);
  };

  const cancelEditing = () => {
    setIsEditing(false);
    setPageImage(null);
    setPaths([]);
    setShapes([]);
    setTextAnnotations([]);
  };

  const saveAnnotations = async () => {
    if (!canvasRef.current) {
      Alert.alert('Fehler', 'Canvas nicht verfügbar');
      return;
    }

    try {
      // Capture the annotated image
      const uri = await captureRef(canvasRef.current, {
        format: 'png',
        quality: 1,
      });

      // Share the annotated image
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(uri, {
          mimeType: 'image/png',
          dialogTitle: 'Annotiertes PDF teilen',
        });
      }

      setIsEditing(false);
      setPageImage(null);
    } catch (error) {
      console.error('Error saving annotations:', error);
      Alert.alert('Fehler', 'Annotationen konnten nicht gespeichert werden');
    }
  };

  // Touch handlers for drawing
  const handleTouchStart = (evt: any) => {
    const { locationX, locationY } = evt.nativeEvent;

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

    setCurrentPath(`M ${locationX} ${locationY}`);
  };

  const handleTouchMove = (evt: any) => {
    const { locationX, locationY } = evt.nativeEvent;

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

  const handleTouchEnd = () => {
    if (currentShape) {
      setShapes((prev) => [...prev, currentShape]);
      setCurrentShape(null);
      return;
    }

    if (currentPath && currentPath.length > 0) {
      const newPath: DrawPath = {
        path: currentPath,
        color: toolMode === 'eraser' ? '#FFFFFF' : drawColor,
        strokeWidth: toolMode === 'eraser' ? strokeWidth * 3 : strokeWidth,
        opacity: toolMode === 'highlighter' ? 0.4 : 1,
      };
      setPaths((prev) => [...prev, newPath]);
      setCurrentPath('');
    }
  };

  const addTextAnnotation = () => {
    if (newTextAnnotation.trim()) {
      const newText: TextAnnotation = {
        id: Date.now().toString(),
        text: newTextAnnotation.trim(),
        x: textPosition.x,
        y: textPosition.y,
        fontSize: 16,
        color: drawColor,
      };
      setTextAnnotations((prev) => [...prev, newText]);
    }
    setNewTextAnnotation('');
    setShowTextModal(false);
  };

  const undo = () => {
    if (paths.length > 0) {
      setPaths((prev) => prev.slice(0, -1));
    } else if (shapes.length > 0) {
      setShapes((prev) => prev.slice(0, -1));
    } else if (textAnnotations.length > 0) {
      setTextAnnotations((prev) => prev.slice(0, -1));
    }
  };

  const clearAll = () => {
    setPaths([]);
    setShapes([]);
    setTextAnnotations([]);
    setCurrentPath('');
    setCurrentShape(null);
  };

  const renderShape = (shape: ShapeAnnotation, isPreview = false) => {
    const { type, x1, y1, x2, y2, color, strokeWidth } = shape;
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
            stroke={color}
            strokeWidth={strokeWidth}
            fill="none"
          />
        );
      case 'circle':
        const cx = (x1 + x2) / 2;
        const cy = (y1 + y2) / 2;
        const rx = Math.abs(x2 - x1) / 2;
        const ry = Math.abs(y2 - y1) / 2;
        return (
          <Circle
            key={key}
            cx={cx}
            cy={cy}
            r={Math.max(rx, ry)}
            stroke={color}
            strokeWidth={strokeWidth}
            fill="none"
          />
        );
      case 'line':
        return (
          <Line
            key={key}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke={color}
            strokeWidth={strokeWidth}
          />
        );
      case 'arrow':
        const angle = Math.atan2(y2 - y1, x2 - x1);
        const headLength = 15;
        return (
          <G key={key}>
            <Line x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth={strokeWidth} />
            <Line
              x1={x2}
              y1={y2}
              x2={x2 - headLength * Math.cos(angle - Math.PI / 6)}
              y2={y2 - headLength * Math.sin(angle - Math.PI / 6)}
              stroke={color}
              strokeWidth={strokeWidth}
            />
            <Line
              x1={x2}
              y1={y2}
              x2={x2 - headLength * Math.cos(angle + Math.PI / 6)}
              y2={y2 - headLength * Math.sin(angle + Math.PI / 6)}
              stroke={color}
              strokeWidth={strokeWidth}
            />
          </G>
        );
      default:
        return null;
    }
  };

  const shareDocument = async () => {
    if (!document?.originalPdfData) {
      Alert.alert('Fehler', 'Keine PDF-Daten vorhanden');
      return;
    }

    try {
      const base64Data = document.originalPdfData.includes(',')
        ? document.originalPdfData.split(',')[1]
        : document.originalPdfData;

      const filename = `${document.name.replace('.pdf', '')}_${Date.now()}.pdf`;
      const fileUri = `${FileSystem.cacheDirectory}${filename}`;
      
      await FileSystem.writeAsStringAsync(fileUri, base64Data, {
        encoding: 'base64',
      });

      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(fileUri, {
          mimeType: 'application/pdf',
          dialogTitle: 'PDF teilen',
          UTI: 'com.adobe.pdf',
        });
      }
    } catch (error) {
      console.error('Error sharing document:', error);
      Alert.alert('Fehler', 'Dokument konnte nicht geteilt werden');
    }
  };

  const deleteDocument = () => {
    Alert.alert(
      'Dokument löschen',
      'Möchten Sie dieses Dokument wirklich löschen?',
      [
        { text: 'Abbrechen', style: 'cancel' },
        {
          text: 'Löschen',
          style: 'destructive',
          onPress: async () => {
            try {
              await DocumentService.delete(documentId || '');
              Alert.alert('Erfolg', 'Dokument wurde gelöscht', [
                { text: 'OK', onPress: () => router.back() },
              ]);
            } catch (error) {
              console.error('Error deleting document:', error);
              Alert.alert('Fehler', 'Dokument konnte nicht gelöscht werden');
            }
          },
        },
      ]
    );
  };

  // HTML for PDF viewer
  const getPdfViewerHtml = () => {
    if (!document?.originalPdfData) return '';

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=3.0, user-scalable=yes">
        <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { 
            background: #525659; 
            display: flex; 
            flex-direction: column;
            align-items: center;
            padding: 10px;
            min-height: 100vh;
          }
          #pdf-container {
            width: 100%;
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 20px;
          }
          .page-wrapper {
            background: white;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            margin-bottom: 10px;
          }
          canvas {
            display: block;
            max-width: 100%;
            height: auto;
          }
          #loading {
            color: white;
            font-size: 18px;
            padding: 20px;
          }
        </style>
      </head>
      <body>
        <div id="loading">PDF wird geladen...</div>
        <div id="pdf-container"></div>
        
        <script>
          pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
          
          let pdfDoc = null;
          let currentPage = 1;
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
              document.getElementById('loading').style.display = 'none';
              
              window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'pageCount',
                count: pdfDoc.numPages
              }));
              
              for (let i = 1; i <= pdfDoc.numPages; i++) {
                await renderPage(i);
                await new Promise(resolve => setTimeout(resolve, 100));
              }
            } catch (error) {
              console.error('Error loading PDF:', error);
            }
          }
          
          async function renderPage(pageNum) {
            try {
              const page = await pdfDoc.getPage(pageNum);
              const viewport = page.getViewport({ scale: scale });
              
              const wrapper = document.createElement('div');
              wrapper.className = 'page-wrapper';
              wrapper.id = 'page-' + pageNum;
              wrapper.setAttribute('data-page', pageNum);
              
              const canvas = document.createElement('canvas');
              const context = canvas.getContext('2d');
              canvas.height = viewport.height;
              canvas.width = viewport.width;
              canvas.style.width = '100%';
              canvas.style.height = 'auto';
              
              wrapper.appendChild(canvas);
              document.getElementById('pdf-container').appendChild(wrapper);
              
              await page.render({ canvasContext: context, viewport: viewport }).promise;
            } catch (error) {
              console.error('Error rendering page:', error);
            }
          }
          
          function goToPage(pageNum) {
            const pageElement = document.getElementById('page-' + pageNum);
            if (pageElement) {
              pageElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
              currentPage = pageNum;
              window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'currentPage',
                page: pageNum
              }));
            }
          }
          
          const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
              if (entry.isIntersecting) {
                const pageNum = parseInt(entry.target.getAttribute('data-page'));
                if (pageNum !== currentPage) {
                  currentPage = pageNum;
                  window.ReactNativeWebView.postMessage(JSON.stringify({
                    type: 'currentPage',
                    page: pageNum
                  }));
                }
              }
            });
          }, { threshold: 0.5 });
          
          loadPdf().then(() => {
            document.querySelectorAll('.page-wrapper').forEach(el => {
              observer.observe(el);
            });
          });
        </script>
      </body>
      </html>
    `;
  };

  // HTML for single page rendering (for annotation)
  const getPageRendererHtml = () => {
    if (!document?.originalPdfData) return '';

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>
      </head>
      <body>
        <canvas id="canvas"></canvas>
        <script>
          pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
          
          async function renderPage() {
            try {
              const pdfData = '${document.originalPdfData}';
              const base64Data = pdfData.includes(',') ? pdfData.split(',')[1] : pdfData;
              const binaryString = atob(base64Data);
              const bytes = new Uint8Array(binaryString.length);
              for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
              }
              
              const pdfDoc = await pdfjsLib.getDocument({ data: bytes }).promise;
              const page = await pdfDoc.getPage(${currentPage});
              const scale = 2.0;
              const viewport = page.getViewport({ scale: scale });
              
              const canvas = document.getElementById('canvas');
              const context = canvas.getContext('2d');
              canvas.height = viewport.height;
              canvas.width = viewport.width;
              
              await page.render({ canvasContext: context, viewport: viewport }).promise;
              
              const imageData = canvas.toDataURL('image/png');
              window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'pageRendered',
                imageData: imageData,
                width: viewport.width,
                height: viewport.height
              }));
            } catch (error) {
              window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'error',
                message: error.message
              }));
            }
          }
          
          renderPage();
        </script>
      </body>
      </html>
    `;
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#1976d2" />
        <Text style={styles.loadingText}>Dokument wird geladen...</Text>
      </View>
    );
  }

  // Edit mode view
  if (isEditing) {
    return (
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={cancelEditing} style={styles.headerButton}>
            <Ionicons name="close" size={24} color="#f44336" />
          </TouchableOpacity>
          <View style={styles.headerTitle}>
            <Text style={styles.title}>Seite {currentPage} bearbeiten</Text>
          </View>
          <TouchableOpacity onPress={undo} style={styles.headerButton}>
            <Ionicons name="arrow-undo" size={24} color="#1976d2" />
          </TouchableOpacity>
          <TouchableOpacity onPress={clearAll} style={styles.headerButton}>
            <Ionicons name="trash-outline" size={24} color="#f44336" />
          </TouchableOpacity>
          <TouchableOpacity onPress={saveAnnotations} style={styles.headerButton}>
            <Ionicons name="share-outline" size={24} color="#4caf50" />
          </TouchableOpacity>
        </View>

        {/* Canvas Area */}
        <View style={styles.canvasContainer}>
          {renderingPage && !pageImage && (
            <View style={styles.loadingOverlay}>
              <ActivityIndicator size="large" color="#1976d2" />
              <Text style={styles.loadingText}>Seite wird geladen...</Text>
            </View>
          )}

          <ScrollView 
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            maximumZoomScale={3}
            minimumZoomScale={1}
            bouncesZoom={true}
          >
            <View 
              ref={canvasRef}
              style={styles.canvasWrapper}
              onStartShouldSetResponder={() => true}
              onMoveShouldSetResponder={() => true}
              onResponderGrant={handleTouchStart}
              onResponderMove={handleTouchMove}
              onResponderRelease={handleTouchEnd}
            >
              {pageImage && (
                <Image
                  source={{ uri: pageImage }}
                  style={styles.pageImage}
                  resizeMode="contain"
                />
              )}
              
              <Svg style={StyleSheet.absoluteFill}>
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

                {shapes.map(shape => renderShape(shape))}
                {currentShape && renderShape(currentShape, true)}
                
                {textAnnotations.map((t) => (
                  <SvgText
                    key={t.id}
                    x={t.x}
                    y={t.y}
                    fill={t.color}
                    fontSize={t.fontSize}
                    fontWeight="bold"
                  >
                    {t.text}
                  </SvgText>
                ))}
              </Svg>
            </View>
          </ScrollView>
        </View>

        {/* Tool Selection Bar */}
        <View style={styles.toolBar}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {tools.map((tool) => (
              <TouchableOpacity
                key={tool.mode}
                style={[
                  styles.toolItem,
                  toolMode === tool.mode && styles.toolItemActive,
                ]}
                onPress={() => setToolMode(tool.mode)}
              >
                <Ionicons
                  name={tool.icon as any}
                  size={22}
                  color={toolMode === tool.mode ? '#fff' : '#666'}
                />
              </TouchableOpacity>
            ))}
            <View style={styles.toolDivider} />
            {colors.map((c) => (
              <TouchableOpacity
                key={c.color}
                style={[
                  styles.colorItem,
                  { backgroundColor: c.color },
                  drawColor === c.color && styles.colorItemActive,
                ]}
                onPress={() => setDrawColor(c.color)}
              />
            ))}
          </ScrollView>
        </View>

        {/* Hidden WebView for page rendering */}
        <WebView
          ref={pageWebViewRef}
          source={{ html: getPageRendererHtml() }}
          style={{ height: 1, width: 1, position: 'absolute', top: -1000 }}
          onMessage={handlePageImageMessage}
          javaScriptEnabled={true}
        />

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

  // Normal view mode
  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerButton}>
          <Ionicons name="arrow-back" size={24} color="#1976d2" />
        </TouchableOpacity>
        <View style={styles.headerTitle}>
          <Text style={styles.title} numberOfLines={1}>{document?.name}</Text>
          {pdfLoaded && (
            <Text style={styles.pageInfo}>Seite {currentPage} von {totalPages}</Text>
          )}
        </View>
        <TouchableOpacity onPress={shareDocument} style={styles.headerButton}>
          <Ionicons name="share-outline" size={24} color="#1976d2" />
        </TouchableOpacity>
        <TouchableOpacity onPress={deleteDocument} style={styles.headerButton}>
          <Ionicons name="trash-outline" size={24} color="#f44336" />
        </TouchableOpacity>
      </View>

      {/* PDF Viewer */}
      <View style={styles.pdfContainer}>
        {document?.originalPdfData ? (
          <WebView
            ref={webViewRef}
            source={{ html: getPdfViewerHtml() }}
            style={styles.webview}
            onMessage={handleMessage}
            javaScriptEnabled={true}
            domStorageEnabled={true}
            originWhitelist={['*']}
            mixedContentMode="always"
            allowFileAccess={true}
            scalesPageToFit={true}
            bounces={true}
            scrollEnabled={true}
          />
        ) : (
          <View style={styles.errorContainer}>
            <Ionicons name="alert-circle" size={48} color="#f44336" />
            <Text style={styles.errorText}>Keine PDF-Daten vorhanden</Text>
          </View>
        )}
      </View>

      {/* Bottom Toolbar */}
      <View style={styles.toolbar}>
        <TouchableOpacity 
          style={styles.navButton} 
          onPress={() => goToPage(currentPage - 1)}
          disabled={currentPage <= 1}
        >
          <Ionicons 
            name="chevron-back" 
            size={28} 
            color={currentPage <= 1 ? '#ccc' : '#1976d2'} 
          />
          <Text style={[styles.navText, currentPage <= 1 && styles.navTextDisabled]}>
            Zurück
          </Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.editButton} onPress={startEditing}>
          <Ionicons name="pencil" size={28} color="#fff" />
          <Text style={styles.editText}>Bearbeiten</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.navButton} 
          onPress={() => goToPage(currentPage + 1)}
          disabled={currentPage >= totalPages}
        >
          <Ionicons 
            name="chevron-forward" 
            size={28} 
            color={currentPage >= totalPages ? '#ccc' : '#1976d2'} 
          />
          <Text style={[styles.navText, currentPage >= totalPages && styles.navTextDisabled]}>
            Weiter
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#525659',
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
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  pageInfo: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  pdfContainer: {
    flex: 1,
  },
  webview: {
    flex: 1,
    backgroundColor: '#525659',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
  errorText: {
    fontSize: 16,
    color: '#666',
    marginTop: 12,
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    padding: 12,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  navButton: {
    alignItems: 'center',
    padding: 8,
    minWidth: 70,
  },
  navText: {
    fontSize: 12,
    color: '#1976d2',
    marginTop: 4,
  },
  navTextDisabled: {
    color: '#ccc',
  },
  editButton: {
    alignItems: 'center',
    backgroundColor: '#4caf50',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 25,
  },
  editText: {
    fontSize: 12,
    color: '#fff',
    fontWeight: '600',
    marginTop: 4,
  },
  // Edit mode styles
  canvasContainer: {
    flex: 1,
    backgroundColor: '#e8e8e8',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.9)',
    zIndex: 10,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    alignItems: 'center',
    padding: 10,
  },
  canvasWrapper: {
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  pageImage: {
    width: SCREEN_WIDTH - 40,
    height: (SCREEN_WIDTH - 40) * 1.414, // A4 aspect ratio
  },
  toolBar: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  toolItem: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: '#f5f5f5',
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 4,
  },
  toolItemActive: {
    backgroundColor: '#1976d2',
  },
  toolDivider: {
    width: 1,
    height: 30,
    backgroundColor: '#ddd',
    marginHorizontal: 8,
  },
  colorItem: {
    width: 32,
    height: 32,
    borderRadius: 16,
    marginHorizontal: 4,
    borderWidth: 2,
    borderColor: '#ddd',
  },
  colorItemActive: {
    borderWidth: 3,
    borderColor: '#1976d2',
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  textModal: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    width: '80%',
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 16,
    textAlign: 'center',
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
    justifyContent: 'space-between',
    marginTop: 16,
  },
  modalButton: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginHorizontal: 4,
  },
  cancelButton: {
    backgroundColor: '#f5f5f5',
  },
  cancelButtonText: {
    color: '#666',
    fontWeight: '600',
  },
  addButton: {
    backgroundColor: '#1976d2',
  },
  addButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
});

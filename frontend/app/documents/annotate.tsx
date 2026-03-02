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
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { WebView } from 'react-native-webview';
import Svg, { Path, Text as SvgText } from 'react-native-svg';
import { captureRef } from 'react-native-view-shot';
import { DocumentService, Document, DocumentPage, TextAnnotation } from '../../services/LocalStorage';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface DrawPath {
  path: string;
  color: string;
  strokeWidth: number;
}

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
  
  // Drawing state
  const [paths, setPaths] = useState<DrawPath[]>([]);
  const [currentPath, setCurrentPath] = useState<string>('');
  const [drawColor, setDrawColor] = useState('#FF0000');
  const [strokeWidth, setStrokeWidth] = useState(3);
  const [canvasDimensions, setCanvasDimensions] = useState({ width: 0, height: 0 });
  
  // Text annotations
  const [textAnnotations, setTextAnnotations] = useState<TextAnnotation[]>([]);
  const [showTextModal, setShowTextModal] = useState(false);
  const [newTextAnnotation, setNewTextAnnotation] = useState('');
  const [textPosition, setTextPosition] = useState({ x: 50, y: 50 });
  
  // Mode: 'draw' or 'text'
  const [mode, setMode] = useState<'draw' | 'text'>('draw');
  
  const canvasRef = useRef(null);
  const webViewRef = useRef<WebView>(null);

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
      // Load drawing annotations
      if (page.annotations) {
        try {
          const annotationData = JSON.parse(page.annotations);
          if (annotationData.paths) {
            setPaths(annotationData.paths);
          }
        } catch (e) {
          console.error('Error parsing annotations:', e);
          setPaths([]);
        }
      } else {
        setPaths([]);
      }
      
      // Load text annotations
      setTextAnnotations(page.textAnnotations || []);
    } else {
      setPaths([]);
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
        setRenderingPage(false);
      } else if (data.type === 'error') {
        console.error('PDF Error:', data.message);
        setRenderingPage(false);
      }
    } catch (e) {
      console.error('Error parsing WebView message:', e);
    }
  };

  const renderCurrentPage = () => {
    setRenderingPage(true);
    webViewRef.current?.injectJavaScript(`renderPageAsImage(${currentPage}); true;`);
  };

  // PDF renderer WebView (hidden, just for rendering pages as images)
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
              
              // Render initial page
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
            
            // Cancel any ongoing render task
            if (currentRenderTask) {
              try {
                currentRenderTask.cancel();
              } catch (e) {
                // Ignore cancel errors
              }
              currentRenderTask = null;
            }
            
            // Wait if still rendering
            if (isRendering) {
              await new Promise(resolve => setTimeout(resolve, 100));
            }
            
            isRendering = true;
            
            try {
              const page = await pdfDoc.getPage(pageNum);
              const viewport = page.getViewport({ scale: scale });
              
              // Create a new canvas for each render to avoid conflicts
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
                page: pageNum
              }));
              
            } catch (error) {
              if (error.name !== 'RenderingCancelledException') {
                window.ReactNativeWebView.postMessage(JSON.stringify({
                  type: 'error',
                  message: error.message
                }));
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

  // Drawing handlers
  const onTouchStart = (event: any) => {
    if (mode === 'text') {
      // In text mode, tap to place text
      const touch = event.nativeEvent.touches ? event.nativeEvent.touches[0] : event.nativeEvent;
      const locationX = touch.locationX || touch.pageX;
      const locationY = touch.locationY || touch.pageY;
      setTextPosition({ x: locationX, y: locationY });
      setShowTextModal(true);
      return;
    }
    
    const touch = event.nativeEvent.touches ? event.nativeEvent.touches[0] : event.nativeEvent;
    const locationX = touch.locationX || touch.pageX;
    const locationY = touch.locationY || touch.pageY;
    setCurrentPath(`M ${locationX} ${locationY}`);
  };

  const onTouchMove = (event: any) => {
    if (mode === 'text' || !currentPath) return;
    
    const touch = event.nativeEvent.touches ? event.nativeEvent.touches[0] : event.nativeEvent;
    const locationX = touch.locationX || touch.pageX;
    const locationY = touch.locationY || touch.pageY;
    setCurrentPath((prev) => `${prev} L ${locationX} ${locationY}`);
  };

  const onTouchEnd = () => {
    if (mode === 'text') return;
    
    if (currentPath && currentPath.length > 0) {
      setPaths([...paths, { path: currentPath, color: drawColor, strokeWidth }]);
      setCurrentPath('');
    }
  };

  const addTextAnnotation = () => {
    if (!newTextAnnotation.trim()) {
      setShowTextModal(false);
      return;
    }

    const newAnnotation: TextAnnotation = {
      id: Date.now().toString(),
      x: textPosition.x,
      y: textPosition.y,
      text: newTextAnnotation.trim(),
      color: drawColor,
      fontSize: 16,
    };

    setTextAnnotations([...textAnnotations, newAnnotation]);
    setNewTextAnnotation('');
    setShowTextModal(false);
  };

  const deleteTextAnnotation = (id: string) => {
    setTextAnnotations(textAnnotations.filter(t => t.id !== id));
  };

  const undo = () => {
    if (paths.length > 0) {
      setPaths(paths.slice(0, -1));
    } else if (textAnnotations.length > 0) {
      setTextAnnotations(textAnnotations.slice(0, -1));
    }
  };

  const clear = () => {
    Alert.alert(
      'Alle Anmerkungen löschen',
      'Möchten Sie alle Zeichnungen und Texte auf dieser Seite löschen?',
      [
        { text: 'Abbrechen', style: 'cancel' },
        { 
          text: 'Löschen', 
          onPress: () => {
            setPaths([]);
            setTextAnnotations([]);
          }
        },
      ]
    );
  };

  const save = async () => {
    try {
      setLoading(true);
      
      // Create annotation data
      const annotationData = {
        paths: paths,
        canvasWidth: canvasDimensions.width || SCREEN_WIDTH,
        canvasHeight: canvasDimensions.height || 400,
      };

      // Find or create page entry
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

      // Update document
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
      
      // Capture the canvas with annotations
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
    { color: '#00FF00', name: 'Grün' },
    { color: '#0000FF', name: 'Blau' },
    { color: '#FFFF00', name: 'Gelb' },
    { color: '#000000', name: 'Schwarz' },
    { color: '#FFFFFF', name: 'Weiß' },
  ];

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

      {/* Toolbar */}
      <View style={styles.toolbar}>
        <TouchableOpacity style={styles.toolButton} onPress={undo}>
          <Ionicons name="arrow-undo" size={20} color="#1976d2" />
          <Text style={styles.toolText}>Rückgängig</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.toolButton} onPress={clear}>
          <Ionicons name="trash-outline" size={20} color="#f44336" />
          <Text style={styles.toolText}>Löschen</Text>
        </TouchableOpacity>
        
        {/* Mode Toggle */}
        <View style={styles.modeToggle}>
          <TouchableOpacity 
            style={[styles.modeButton, mode === 'draw' && styles.modeButtonActive]}
            onPress={() => setMode('draw')}
          >
            <Ionicons name="pencil" size={20} color={mode === 'draw' ? '#fff' : '#1976d2'} />
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.modeButton, mode === 'text' && styles.modeButtonActive]}
            onPress={() => setMode('text')}
          >
            <Ionicons name="text" size={20} color={mode === 'text' ? '#fff' : '#1976d2'} />
          </TouchableOpacity>
        </View>
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
            ]}
            onPress={() => setDrawColor(c.color)}
          />
        ))}
      </View>

      {/* Canvas Area */}
      <View style={styles.canvasArea}>
        {renderingPage && (
          <View style={styles.renderingOverlay}>
            <ActivityIndicator size="large" color="#1976d2" />
            <Text style={styles.renderingText}>Seite wird geladen...</Text>
          </View>
        )}
        
        <View 
          ref={canvasRef}
          style={styles.canvasContainer}
          onLayout={(event) => {
            const { width, height } = event.nativeEvent.layout;
            setCanvasDimensions({ width, height });
          }}
        >
          {pageImage && (
            <View style={styles.imageContainer}>
              <WebView
                source={{ html: `
                  <html>
                  <head>
                    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
                    <style>
                      * { margin: 0; padding: 0; }
                      body { display: flex; justify-content: center; align-items: flex-start; background: #333; }
                      img { width: 100%; height: auto; }
                    </style>
                  </head>
                  <body>
                    <img src="${pageImage}" />
                  </body>
                  </html>
                `}}
                style={styles.pageImage}
                scrollEnabled={false}
                scalesPageToFit={true}
              />
            </View>
          )}
          
          {/* Drawing Layer */}
          <View
            style={styles.drawingLayer}
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
                />
              ))}
              {/* Current path being drawn */}
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
      </View>

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
    backgroundColor: '#333',
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
  },
  toolButton: {
    alignItems: 'center',
    padding: 8,
    borderRadius: 8,
    backgroundColor: '#f5f5f5',
    minWidth: 70,
  },
  toolText: {
    fontSize: 10,
    color: '#333',
    marginTop: 2,
  },
  modeToggle: {
    flexDirection: 'row',
    marginLeft: 'auto',
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#1976d2',
  },
  modeButton: {
    padding: 10,
    backgroundColor: '#fff',
  },
  modeButtonActive: {
    backgroundColor: '#1976d2',
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
  },
  canvasArea: {
    flex: 1,
    position: 'relative',
  },
  renderingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  renderingText: {
    color: '#fff',
    marginTop: 12,
    fontSize: 14,
  },
  canvasContainer: {
    flex: 1,
    position: 'relative',
  },
  imageContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  pageImage: {
    flex: 1,
    backgroundColor: '#333',
  },
  drawingLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
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
  textModal: {
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

import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Image,
  Modal,
  TextInput,
  useWindowDimensions,
  ScrollView,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { WebView } from 'react-native-webview';
import Svg, { Path, Text as SvgText } from 'react-native-svg';
import { DocumentService, Document } from '../../services/LocalStorage';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';
import { captureRef } from 'react-native-view-shot';

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
  
  // Drawing
  const [paths, setPaths] = useState<DrawPath[]>([]);
  const [currentPath, setCurrentPath] = useState('');
  const [drawColor, setDrawColor] = useState('#FF0000');
  const [strokeWidth] = useState(3);
  const [isHighlighter, setIsHighlighter] = useState(false);
  
  // Text
  const [textAnnotations, setTextAnnotations] = useState<{id: string, text: string, x: number, y: number}[]>([]);
  const [showTextModal, setShowTextModal] = useState(false);
  const [newText, setNewText] = useState('');
  const [textPosition, setTextPosition] = useState({ x: 0, y: 0 });
  const [isTextMode, setIsTextMode] = useState(false);
  
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
        // Calculate display size maintaining aspect ratio
        const pdfAspect = data.width / data.height;
        let displayWidth, displayHeight;
        
        if (availableWidth / availableHeight > pdfAspect) {
          displayHeight = availableHeight;
          displayWidth = displayHeight * pdfAspect;
        } else {
          displayWidth = availableWidth;
          displayHeight = displayWidth / pdfAspect;
        }
        
        setImageSize({ width: displayWidth, height: displayHeight });
        setPageImage(data.imageData);
        setRenderingPage(false);
      }
    } catch (e) {
      setRenderingPage(false);
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
    setPaths([]);
    setTextAnnotations([]);
  };

  const cancelEditing = () => {
    setIsEditing(false);
    setPageImage(null);
    setPaths([]);
    setTextAnnotations([]);
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
    
    if (type === 'start') {
      if (isTextMode) {
        setTextPosition({ x: locationX, y: locationY });
        setShowTextModal(true);
        return;
      }
      setCurrentPath(`M ${locationX} ${locationY}`);
    } else if (type === 'move' && currentPath) {
      setCurrentPath(prev => `${prev} L ${locationX} ${locationY}`);
    } else if (type === 'end' && currentPath) {
      setPaths(prev => [...prev, {
        path: currentPath,
        color: drawColor,
        strokeWidth: strokeWidth,
        opacity: isHighlighter ? 0.4 : 1,
      }]);
      setCurrentPath('');
    }
  };

  const addText = () => {
    if (newText.trim()) {
      setTextAnnotations(prev => [...prev, {
        id: Date.now().toString(),
        text: newText.trim(),
        x: textPosition.x,
        y: textPosition.y,
      }]);
    }
    setNewText('');
    setShowTextModal(false);
  };

  const undo = () => {
    if (paths.length > 0) {
      setPaths(prev => prev.slice(0, -1));
    } else if (textAnnotations.length > 0) {
      setTextAnnotations(prev => prev.slice(0, -1));
    }
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

  // EDIT MODE
  if (isEditing) {
    return (
      <View style={styles.editRoot}>
        {/* Fixed Header */}
        <View style={[styles.editHeader, { height: headerHeight }]}>
          <TouchableOpacity onPress={cancelEditing} style={styles.iconBtn}>
            <Ionicons name="close" size={24} color="#f44336" />
          </TouchableOpacity>
          <Text style={styles.headerText}>Seite {currentPage}</Text>
          <TouchableOpacity onPress={undo} style={styles.iconBtn}>
            <Ionicons name="arrow-undo" size={24} color="#1976d2" />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => { setPaths([]); setTextAnnotations([]); }} style={styles.iconBtn}>
            <Ionicons name="trash-outline" size={24} color="#f44336" />
          </TouchableOpacity>
          <TouchableOpacity onPress={shareAnnotated} style={styles.iconBtn}>
            <Ionicons name="share-outline" size={24} color="#4caf50" />
          </TouchableOpacity>
        </View>

        {/* Canvas Area - Fixed size in center */}
        <View style={styles.editCanvas}>
          {renderingPage && !pageImage ? (
            <View style={styles.centered}>
              <ActivityIndicator size="large" color="#1976d2" />
            </View>
          ) : (
            <View
              ref={canvasRef}
              style={[styles.canvas, { width: imageSize.width, height: imageSize.height }]}
              onStartShouldSetResponder={() => true}
              onMoveShouldSetResponder={() => true}
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
                  <Path d={currentPath} stroke={drawColor} strokeWidth={strokeWidth} fill="none" opacity={isHighlighter ? 0.4 : 1} strokeLinecap="round" />
                )}
                {textAnnotations.map(t => (
                  <SvgText key={t.id} x={t.x} y={t.y} fill={drawColor} fontSize={16} fontWeight="bold">{t.text}</SvgText>
                ))}
              </Svg>
            </View>
          )}
        </View>

        {/* Fixed Toolbar at bottom */}
        <View style={[styles.editToolbar, { height: toolbarHeight }]}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.toolbarContent}>
            <TouchableOpacity 
              style={[styles.toolBtn, !isTextMode && !isHighlighter && styles.toolBtnActive]} 
              onPress={() => { setIsTextMode(false); setIsHighlighter(false); }}
            >
              <Ionicons name="pencil" size={20} color={!isTextMode && !isHighlighter ? '#fff' : '#666'} />
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.toolBtn, isHighlighter && styles.toolBtnActive]} 
              onPress={() => { setIsTextMode(false); setIsHighlighter(true); }}
            >
              <Ionicons name="brush" size={20} color={isHighlighter ? '#fff' : '#666'} />
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.toolBtn, isTextMode && styles.toolBtnActive]} 
              onPress={() => { setIsTextMode(true); setIsHighlighter(false); }}
            >
              <Ionicons name="text" size={20} color={isTextMode ? '#fff' : '#666'} />
            </TouchableOpacity>
            
            <View style={styles.divider} />
            
            {['#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#FF9800', '#000000'].map(color => (
              <TouchableOpacity
                key={color}
                style={[styles.colorBtn, { backgroundColor: color }, drawColor === color && styles.colorBtnActive]}
                onPress={() => setDrawColor(color)}
              />
            ))}
          </ScrollView>
        </View>

        {/* Hidden WebView for rendering */}
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
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Text hinzufügen</Text>
              <TextInput
                style={styles.textInput}
                value={newText}
                onChangeText={setNewText}
                placeholder="Text eingeben..."
                autoFocus
              />
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
      </View>
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
  editRoot: { flex: 1, backgroundColor: '#e8e8e8' },
  editHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
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

  // Modal
  modalOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.5)' },
  modalContent: { backgroundColor: '#fff', borderRadius: 12, padding: 20, width: '80%', maxWidth: 400 },
  modalTitle: { fontSize: 18, fontWeight: '600', marginBottom: 15, textAlign: 'center' },
  textInput: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, fontSize: 16 },
  modalButtons: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 15, gap: 10 },
  modalBtnCancel: { flex: 1, padding: 12, borderRadius: 8, backgroundColor: '#f0f0f0', alignItems: 'center' },
  modalBtnOk: { flex: 1, padding: 12, borderRadius: 8, backgroundColor: '#1976d2', alignItems: 'center' },
});

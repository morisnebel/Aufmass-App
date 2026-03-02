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
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { WebView } from 'react-native-webview';
import { DocumentService, Document } from '../../services/LocalStorage';
import * as Sharing from 'expo-sharing';
import { File } from 'expo-file-system/next';
import * as FileSystem from 'expo-file-system';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

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
        console.error('PDF Error:', data.message);
        Alert.alert('Fehler', 'PDF konnte nicht geladen werden');
      }
    } catch (e) {
      console.error('Error parsing WebView message:', e);
    }
  };

  const goToPage = (page: number) => {
    if (page >= 1 && page <= totalPages) {
      webViewRef.current?.injectJavaScript(`goToPage(${page}); true;`);
    }
  };

  const openAnnotateScreen = () => {
    router.push({
      pathname: '/documents/annotate',
      params: { documentId, projectId, page: currentPage },
    });
  };

  const shareDocument = async () => {
    if (!document?.originalPdfData) {
      Alert.alert('Fehler', 'Keine PDF-Daten vorhanden');
      return;
    }

    try {
      // Extract base64 data
      const base64Data = document.originalPdfData.includes(',')
        ? document.originalPdfData.split(',')[1]
        : document.originalPdfData;

      // Save to temp file using the new API
      const filename = `${document.name.replace('.pdf', '')}_${Date.now()}.pdf`;
      const fileUri = `${FileSystem.cacheDirectory}${filename}`;
      
      await FileSystem.writeAsStringAsync(fileUri, base64Data, {
        encoding: 'base64',
      });

      // Share
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

  // HTML for PDF viewer using pdf.js
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
          #error {
            color: #ff6b6b;
            font-size: 16px;
            padding: 20px;
            text-align: center;
          }
        </style>
      </head>
      <body>
        <div id="loading">PDF wird geladen...</div>
        <div id="error" style="display: none;"></div>
        <div id="pdf-container"></div>
        
        <script>
          pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
          
          let pdfDoc = null;
          let currentPage = 1;
          let renderQueue = [];
          let isRendering = false;
          const scale = 2.0; // Higher resolution for better quality
          
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
              
              // Send page count to React Native
              window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'pageCount',
                count: pdfDoc.numPages
              }));
              
              // Queue all pages for rendering
              for (let i = 1; i <= pdfDoc.numPages; i++) {
                renderQueue.push(i);
              }
              
              // Start processing the queue
              processRenderQueue();
              
            } catch (error) {
              console.error('Error loading PDF:', error);
              document.getElementById('loading').style.display = 'none';
              document.getElementById('error').style.display = 'block';
              document.getElementById('error').textContent = 'Fehler beim Laden: ' + error.message;
              window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'error',
                message: error.message
              }));
            }
          }
          
          async function processRenderQueue() {
            if (isRendering || renderQueue.length === 0) return;
            
            isRendering = true;
            const pageNum = renderQueue.shift();
            
            try {
              await renderPage(pageNum);
            } catch (error) {
              console.error('Error in render queue:', error);
            }
            
            isRendering = false;
            
            // Process next page
            if (renderQueue.length > 0) {
              setTimeout(processRenderQueue, 50);
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
              
              const renderTask = page.render({
                canvasContext: context,
                viewport: viewport
              });
              
              await renderTask.promise;
              
            } catch (error) {
              if (error.name !== 'RenderingCancelledException') {
                console.error('Error rendering page ' + pageNum + ':', error);
              }
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
          
          // Intersection Observer to track current page
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
          
          // Start loading
          loadPdf().then(() => {
            // Observe all pages
            document.querySelectorAll('.page-wrapper').forEach(el => {
              observer.observe(el);
            });
          });
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
          style={styles.toolButton} 
          onPress={() => goToPage(currentPage - 1)}
          disabled={currentPage <= 1}
        >
          <Ionicons 
            name="chevron-back" 
            size={28} 
            color={currentPage <= 1 ? '#ccc' : '#1976d2'} 
          />
          <Text style={[styles.toolText, currentPage <= 1 && styles.toolTextDisabled]}>
            Zurück
          </Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.annotateButton} onPress={openAnnotateScreen}>
          <Ionicons name="pencil" size={28} color="#fff" />
          <Text style={styles.annotateText}>Bearbeiten</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.toolButton} 
          onPress={() => goToPage(currentPage + 1)}
          disabled={currentPage >= totalPages}
        >
          <Ionicons 
            name="chevron-forward" 
            size={28} 
            color={currentPage >= totalPages ? '#ccc' : '#1976d2'} 
          />
          <Text style={[styles.toolText, currentPage >= totalPages && styles.toolTextDisabled]}>
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
  toolButton: {
    alignItems: 'center',
    padding: 8,
    minWidth: 70,
  },
  toolText: {
    fontSize: 12,
    color: '#1976d2',
    marginTop: 4,
  },
  toolTextDisabled: {
    color: '#ccc',
  },
  annotateButton: {
    alignItems: 'center',
    backgroundColor: '#4caf50',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 25,
  },
  annotateText: {
    fontSize: 12,
    color: '#fff',
    fontWeight: '600',
    marginTop: 4,
  },
});

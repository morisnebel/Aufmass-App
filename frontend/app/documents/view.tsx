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
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { WebView } from 'react-native-webview';
import Svg, { Path, Text as SvgText, Rect, Circle, Line, G } from 'react-native-svg';
import { DocumentService, Document } from '../../services/LocalStorage';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';
import * as Print from 'expo-print';
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
  const [selectedElement, setSelectedElement] = useState<{type: 'shape' | 'text' | 'pointer' | 'path', id: string, dragPart?: 'note' | 'target'} | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [isResizing, setIsResizing] = useState(false);
  const [resizeCorner, setResizeCorner] = useState<'tl' | 'tr' | 'bl' | 'br' | null>(null);
  
  // Memo pointer
  const [isPointerMode, setIsPointerMode] = useState(false);
  const [pendingPointer, setPendingPointer] = useState<{x1: number, y1: number, x2: number, y2: number} | null>(null);
  const [showPointerModal, setShowPointerModal] = useState(false);
  const [pointerText, setPointerText] = useState('');
  
  // Editing existing pointer text
  const [editingPointerId, setEditingPointerId] = useState<string | null>(null);
  const [editingPointerText, setEditingPointerText] = useState('');
  
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
  
  // Function to change page with proper annotation saving
  // Use ref to store annotations immediately (React state is async)
  const pageAnnotationsRef = useRef<{[page: number]: {paths: DrawPath[], shapes: Shape[], texts: TextAnnotation[]}}>({});
  
  const changePage = (newPage: number) => {
    if (newPage < 1 || newPage > totalPages || newPage === currentPage) return;
    
    // Save current page annotations to ref immediately
    pageAnnotationsRef.current[currentPage] = { 
      paths: [...paths], 
      shapes: [...shapes], 
      texts: [...textAnnotations] 
    };
    setPageAnnotations({...pageAnnotationsRef.current});
    
    // Load new page annotations from ref
    const newPageAnnotations = pageAnnotationsRef.current[newPage];
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
    setRenderingPage(true);
    setPageImage(null);
    setCurrentPage(newPage);
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
    
    // Load ALL existing annotations from document into pageAnnotationsRef
    if (document) {
      const loadedAnnotations: {[page: number]: {paths: DrawPath[], shapes: Shape[], texts: TextAnnotation[]}} = {};
      
      // Load annotations for all pages
      if (document.pages) {
        for (const page of document.pages) {
          if (page.annotations) {
            try {
              const saved: SavedAnnotations = JSON.parse(page.annotations);
              loadedAnnotations[page.pageNumber] = {
                paths: saved.paths || [],
                shapes: saved.shapes || [],
                texts: saved.texts || [],
              };
              console.log(`Loaded annotations for page ${page.pageNumber}: ${saved.paths?.length || 0} paths, ${saved.shapes?.length || 0} shapes, ${saved.texts?.length || 0} texts`);
            } catch (e) {
              console.log(`Error parsing annotations for page ${page.pageNumber}:`, e);
              loadedAnnotations[page.pageNumber] = { paths: [], shapes: [], texts: [] };
            }
          }
        }
      }
      
      // Store in ref
      pageAnnotationsRef.current = loadedAnnotations;
      setPageAnnotations(loadedAnnotations);
      
      // Load current page into state
      const currentPageAnnotations = loadedAnnotations[currentPage];
      if (currentPageAnnotations) {
        setPaths(currentPageAnnotations.paths || []);
        setShapes(currentPageAnnotations.shapes || []);
        setTextAnnotations(currentPageAnnotations.texts || []);
        // Rebuild undo history
        const history: Array<{type: 'path' | 'shape' | 'text', id: string}> = [];
        (currentPageAnnotations.paths || []).forEach((_, i) => history.push({ type: 'path', id: `path-${i}` }));
        (currentPageAnnotations.shapes || []).forEach(s => history.push({ type: 'shape', id: s.id }));
        (currentPageAnnotations.texts || []).forEach(t => history.push({ type: 'text', id: t.id }));
        setUndoHistory(history);
      } else {
        setPaths([]);
        setShapes([]);
        setTextAnnotations([]);
        setUndoHistory([]);
      }
    }
  };

  const cancelEditing = async () => {
    // Always save all annotations before leaving
    await saveAllAnnotations();
    // Reload document to get updated annotations
    await loadDocument();
    exitEditMode();
  };

  const exitEditMode = () => {
    setIsEditing(false);
    setPageImage(null);
    setPaths([]);
    setShapes([]);
    setTextAnnotations([]);
    setUndoHistory([]);
    setPageAnnotations({});
  };

  const saveAllAnnotations = async () => {
    if (!document) {
      console.log('saveAllAnnotations: No document');
      return;
    }
    
    // Save current page to ref first
    pageAnnotationsRef.current[currentPage] = { 
      paths: [...paths], 
      shapes: [...shapes], 
      texts: [...textAnnotations] 
    };
    
    // Get all annotations from ref
    const allAnnotations = pageAnnotationsRef.current;
    
    console.log('saveAllAnnotations: Saving pages', Object.keys(allAnnotations));
    
    try {
      // Save all pages that have annotations
      for (const [pageNum, annotations] of Object.entries(allAnnotations)) {
        if (annotations.paths.length > 0 || annotations.shapes.length > 0 || annotations.texts.length > 0) {
          const annotationData: SavedAnnotations = {
            paths: annotations.paths,
            shapes: annotations.shapes,
            texts: annotations.texts,
          };
          console.log(`saveAllAnnotations: Saving page ${pageNum} with ${annotations.paths.length} paths, ${annotations.shapes.length} shapes, ${annotations.texts.length} texts`);
          const result = await DocumentService.updatePage(document.id, parseInt(pageNum), {
            annotations: JSON.stringify(annotationData),
          });
          console.log(`saveAllAnnotations: Page ${pageNum} saved, result:`, result ? 'success' : 'failed');
        }
      }
      console.log('saveAllAnnotations: All saved successfully');
    } catch (error) {
      console.log('Error saving annotations:', error);
    }
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

  // State for PDF export progress
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [allPageImages, setAllPageImages] = useState<{[page: number]: string}>({});
  const [renderAllPagesMode, setRenderAllPagesMode] = useState(false);
  const [renderingForExport, setRenderingForExport] = useState(0);
  const isPrintingRef = useRef(false);

  // Share/Print all pages with annotations as PDF
  const shareAllPagesAnnotated = async () => {
    if (isPrintingRef.current) {
      console.log('Print already in progress, ignoring');
      return;
    }
    
    // Save current page annotations first
    pageAnnotationsRef.current[currentPage] = { 
      paths: [...paths], 
      shapes: [...shapes], 
      texts: [...textAnnotations] 
    };
    await saveAllAnnotations();

    isPrintingRef.current = true;
    setIsExporting(true);
    setExportProgress(10);
    
    // Store current page image
    const images: {[page: number]: string} = {};
    if (pageImage) {
      images[currentPage] = pageImage;
    }
    setAllPageImages(images);
    
    // Start rendering all pages for export
    setRenderAllPagesMode(true);
    setRenderingForExport(1);
  };

  // Handle page rendered for export
  const handleExportPageRendered = (pageNum: number, imageData: string) => {
    console.log('Export page rendered:', pageNum);
    
    setAllPageImages(prev => ({
      ...prev,
      [pageNum]: imageData
    }));
    
    const progress = 10 + Math.round((pageNum / totalPages) * 60);
    setExportProgress(progress);
    
    if (pageNum < totalPages) {
      // Render next page
      setRenderingForExport(pageNum + 1);
    } else {
      // All pages rendered, now create PDF
      setRenderAllPagesMode(false);
      setRenderingForExport(0);
      
      // Use setTimeout to allow state to update
      setTimeout(() => finishPdfExport(), 100);
    }
  };

  // Effect to trigger page rendering for export
  useEffect(() => {
    if (renderAllPagesMode && renderingForExport > 0 && exportWebViewRef.current) {
      console.log('Requesting render of page', renderingForExport);
      exportWebViewRef.current.injectJavaScript(`renderPageForExport(${renderingForExport}); true;`);
    }
  }, [renderAllPagesMode, renderingForExport]);

  const finishPdfExport = async () => {
    setExportProgress(80);
    
    // Get document with annotations
    const freshDoc = await DocumentService.getById(documentId || '');
    
    const pageWidth = imageSize.width || 615;
    const pageHeight = imageSize.height || 870;
    
    let pagesHtml = '';
    
    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
      const bgImage = allPageImages[pageNum] || '';
      
      // Get annotations for this page
      let annotations = { paths: [] as any[], shapes: [] as any[], texts: [] as any[] };
      const pageData = freshDoc?.pages?.find(p => p.pageNumber === pageNum);
      if (pageData?.annotations) {
        try {
          annotations = JSON.parse(pageData.annotations);
        } catch (e) {}
      }

      // Generate SVG content for annotations
      let svgContent = '';

      // Render paths
      (annotations.paths || []).forEach((p: any) => {
        svgContent += `<path d="${p.path}" stroke="${p.color}" stroke-width="${p.strokeWidth}" fill="none" opacity="${p.opacity}" stroke-linecap="round" stroke-linejoin="round"/>`;
      });

      // Render shapes
      (annotations.shapes || []).forEach((s: any) => {
        const x1 = s.x1, y1 = s.y1, x2 = s.x2, y2 = s.y2;
        const sw = s.strokeWidth || 3;
        
        if (s.type === 'rectangle') {
          svgContent += `<rect x="${Math.min(x1,x2)}" y="${Math.min(y1,y2)}" width="${Math.abs(x2-x1)}" height="${Math.abs(y2-y1)}" stroke="${s.color}" stroke-width="${sw}" fill="none"/>`;
        } else if (s.type === 'circle') {
          const cx = (x1 + x2) / 2, cy = (y1 + y2) / 2;
          const r = Math.max(Math.abs(x2-x1), Math.abs(y2-y1)) / 2;
          svgContent += `<circle cx="${cx}" cy="${cy}" r="${r}" stroke="${s.color}" stroke-width="${sw}" fill="none"/>`;
        } else if (s.type === 'line') {
          svgContent += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${s.color}" stroke-width="${sw}"/>`;
        } else if (s.type === 'arrow') {
          // Regular arrow
          const angle = Math.atan2(y2-y1, x2-x1);
          const headLen = 15;
          const ax1 = x2 - headLen * Math.cos(angle - Math.PI/6);
          const ay1 = y2 - headLen * Math.sin(angle - Math.PI/6);
          const ax2 = x2 - headLen * Math.cos(angle + Math.PI/6);
          const ay2 = y2 - headLen * Math.sin(angle + Math.PI/6);
          svgContent += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${s.color}" stroke-width="${sw}"/>`;
          svgContent += `<polygon points="${x2},${y2} ${ax1},${ay1} ${ax2},${ay2}" fill="${s.color}"/>`;
        } else if (s.type === 'pointer') {
          // Note annotation with connecting line
          const noteText = s.text || '';
          const textLength = noteText.length;
          const noteWidth = Math.max(textLength * 9 + 20, 80);
          const noteHeight = 32;
          const noteX = x1 - noteWidth / 2;
          const noteY = y1 - noteHeight - 5;
          const cornerRadius = 6;
          
          // Connecting dashed line
          svgContent += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${s.color}" stroke-width="2" stroke-dasharray="5,3"/>`;
          
          // Target circle
          svgContent += `<circle cx="${x2}" cy="${y2}" r="6" fill="${s.color}" stroke="white" stroke-width="2"/>`;
          
          // Note box shadow
          svgContent += `<rect x="${noteX + 2}" y="${noteY + 2}" width="${noteWidth}" height="${noteHeight}" fill="rgba(0,0,0,0.15)" rx="${cornerRadius}"/>`;
          
          // Note box background
          svgContent += `<rect x="${noteX}" y="${noteY}" width="${noteWidth}" height="${noteHeight}" fill="#FFFDE7" stroke="${s.color}" stroke-width="2" rx="${cornerRadius}"/>`;
          
          // Triangle pointer
          svgContent += `<path d="M ${x1 - 6} ${noteY + noteHeight} L ${x1} ${noteY + noteHeight + 8} L ${x1 + 6} ${noteY + noteHeight} Z" fill="#FFFDE7" stroke="${s.color}" stroke-width="2"/>`;
          
          // Note text
          if (noteText) {
            svgContent += `<text x="${x1}" y="${noteY + noteHeight / 2 + 5}" fill="#333" font-size="14" font-weight="600" text-anchor="middle">${noteText}</text>`;
          }
        }
      });

      // Render text annotations
      (annotations.texts || []).forEach((t: any) => {
        svgContent += `<text x="${t.x}" y="${t.y}" fill="${t.color}" font-size="${t.fontSize || 16}" font-weight="bold">${t.text}</text>`;
      });

      pagesHtml += `
        <div class="page">
          <div class="page-content">
            ${bgImage ? `<img src="${bgImage}" class="bg-image"/>` : ''}
            <svg class="annotations" viewBox="0 0 ${pageWidth} ${pageHeight}" preserveAspectRatio="xMidYMid meet">
              ${svgContent}
            </svg>
          </div>
        </div>
      `;
    }

    setExportProgress(90);

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          @page { margin: 0; size: A4; }
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { margin: 0; padding: 0; }
          .page {
            width: 210mm;
            height: 297mm;
            page-break-after: always;
            display: flex;
            justify-content: center;
            align-items: center;
            background: white;
            overflow: hidden;
          }
          .page:last-child { page-break-after: avoid; }
          .page-content {
            position: relative;
            width: 100%;
            height: 100%;
          }
          .bg-image {
            width: 100%;
            height: 100%;
            object-fit: contain;
          }
          .annotations {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
          }
        </style>
      </head>
      <body>
        ${pagesHtml}
      </body>
      </html>
    `;

    setExportProgress(100);
    
    setIsExporting(false);
    setAllPageImages({});
    setRenderAllPagesMode(false);

    try {
      console.log('Creating PDF file');
      
      // First create a PDF file
      const { uri } = await Print.printToFileAsync({ 
        html: htmlContent,
        width: 595, // A4 width in points
        height: 842, // A4 height in points
      });
      
      console.log('PDF created at:', uri);
      
      // Store URI and close editor - share will be triggered after modal closes
      setPendingShareUri(uri);
      setIsEditing(false);
      
    } catch (e) {
      console.log('PDF export error:', e);
      Alert.alert('Fehler', 'PDF konnte nicht erstellt werden');
      isPrintingRef.current = false;
    }
  };

  // State for pending share
  const [pendingShareUri, setPendingShareUri] = useState<string | null>(null);

  // Effect to share PDF after editor closes
  useEffect(() => {
    if (!isEditing && pendingShareUri && isPrintingRef.current) {
      const doShare = async () => {
        // Wait for modal animation to complete
        await new Promise(resolve => setTimeout(resolve, 500));
        
        try {
          console.log('Opening share dialog for:', pendingShareUri);
          if (await Sharing.isAvailableAsync()) {
            await Sharing.shareAsync(pendingShareUri, {
              mimeType: 'application/pdf',
              UTI: 'com.adobe.pdf',
            });
            console.log('Share dialog closed');
          }
        } catch (e) {
          console.log('Share error:', e);
        } finally {
          isPrintingRef.current = false;
          setPendingShareUri(null);
        }
      };
      doShare();
    }
  }, [isEditing, pendingShareUri]);

  // Ref for export WebView
  const exportWebViewRef = useRef<WebView>(null);

  // Generate HTML for export WebView that can render any page
  const getExportWebViewHtml = () => {
    if (!document?.originalPdfData) return '<html><body></body></html>';
    
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>
        <style>* { margin: 0; padding: 0; } body { background: white; }</style>
      </head>
      <body>
        <canvas id="export-canvas"></canvas>
        <script>
          pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
          
          let pdf = null;
          const pdfData = '${document.originalPdfData}';
          const base64 = pdfData.includes(',') ? pdfData.split(',')[1] : pdfData;
          const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
          
          pdfjsLib.getDocument({data: bytes}).promise.then(loadedPdf => {
            pdf = loadedPdf;
            window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'exportReady' }));
          });
          
          async function renderPageForExport(pageNum) {
            if (!pdf) return;
            try {
              const page = await pdf.getPage(pageNum);
              const viewport = page.getViewport({scale: 2});
              const canvas = document.getElementById('export-canvas');
              canvas.width = viewport.width;
              canvas.height = viewport.height;
              const ctx = canvas.getContext('2d');
              ctx.fillStyle = 'white';
              ctx.fillRect(0, 0, viewport.width, viewport.height);
              await page.render({ canvasContext: ctx, viewport: viewport }).promise;
              const imageData = canvas.toDataURL('image/jpeg', 0.85);
              window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'exportPageRendered',
                pageNum: pageNum,
                imageData: imageData
              }));
            } catch (err) {
              window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'exportError',
                error: err.message
              }));
            }
          }
        </script>
      </body>
      </html>
    `;
  };

  const handleExportWebViewMessage = (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'exportReady') {
        console.log('Export WebView ready');
        if (renderAllPagesMode && renderingForExport > 0) {
          exportWebViewRef.current?.injectJavaScript(`renderPageForExport(${renderingForExport}); true;`);
        }
      } else if (data.type === 'exportPageRendered') {
        handleExportPageRendered(data.pageNum, data.imageData);
      } else if (data.type === 'exportError') {
        console.log('Export error:', data.error);
        Alert.alert('Fehler', 'Seite konnte nicht gerendert werden');
        setIsExporting(false);
        setRenderAllPagesMode(false);
      }
    } catch (e) {
      console.log('Export message parse error:', e);
    }
  };

  // Legacy refs - kept for compatibility
  const exportResolveRef = useRef<((value: string | null) => void) | null>(null);
  const [exportHtml, setExportHtml] = useState<string | null>(null);

  const handleExportMessage = async (event: any) => {
    // Not used
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
        
        // Check for pointer/note elements first (they have type 'pointer')
        const clickedPointer = shapes.find(s => {
          if (s.type !== 'pointer') return false;
          // Check if clicking on note box area
          const noteWidth = Math.max((s.text?.length || 0) * 9 + 20, 80);
          const noteHeight = 32;
          const noteX = s.x1 - noteWidth / 2;
          const noteY = s.y1 - noteHeight - 5;
          const inNoteBox = locationX >= noteX && locationX <= noteX + noteWidth && 
                          locationY >= noteY && locationY <= noteY + noteHeight + 15;
          // Check if clicking on target circle
          const inTarget = Math.sqrt(Math.pow(locationX - s.x2, 2) + Math.pow(locationY - s.y2, 2)) < 20;
          return inNoteBox || inTarget;
        });
        
        if (clickedPointer) {
          // Determine which part was clicked
          const noteWidth = Math.max((clickedPointer.text?.length || 0) * 9 + 20, 80);
          const noteHeight = 32;
          const noteX = clickedPointer.x1 - noteWidth / 2;
          const noteY = clickedPointer.y1 - noteHeight - 5;
          const inNoteBox = locationX >= noteX && locationX <= noteX + noteWidth && 
                          locationY >= noteY && locationY <= noteY + noteHeight + 15;
          const inTarget = Math.sqrt(Math.pow(locationX - clickedPointer.x2, 2) + Math.pow(locationY - clickedPointer.y2, 2)) < 20;
          
          const dragPart = inTarget ? 'target' : 'note';
          setSelectedElement({ type: 'pointer', id: clickedPointer.id, dragPart });
          if (dragPart === 'target') {
            setDragOffset({ x: locationX - clickedPointer.x2, y: locationY - clickedPointer.y2 });
          } else {
            setDragOffset({ x: locationX - clickedPointer.x1, y: locationY - clickedPointer.y1 });
          }
          return;
        }
        
        // Check for path (pencil drawing) clicks
        const clickedPath = paths.find((p, index) => {
          // Parse path to get points
          const pathData = p.path;
          const coords = pathData.match(/[\d.]+/g);
          if (!coords || coords.length < 2) return false;
          
          // Check if click is near any point on the path
          for (let i = 0; i < coords.length - 1; i += 2) {
            const px = parseFloat(coords[i]);
            const py = parseFloat(coords[i + 1]);
            const dist = Math.sqrt(Math.pow(locationX - px, 2) + Math.pow(locationY - py, 2));
            if (dist < 15) return true; // Within 15 pixels of path
          }
          return false;
        });
        
        if (clickedPath) {
          const pathIndex = paths.indexOf(clickedPath);
          // Get first point of path as reference for dragging
          const coords = clickedPath.path.match(/[\d.]+/g);
          if (coords && coords.length >= 2) {
            const firstX = parseFloat(coords[0]);
            const firstY = parseFloat(coords[1]);
            setDragOffset({ x: locationX - firstX, y: locationY - firstY });
          }
          setSelectedElement({ type: 'path', id: `path-${pathIndex}` });
          return;
        }
        
        // Find clicked element (shapes or text)
        const clickedShape = shapes.find(s => {
          if (s.type === 'pointer') return false; // Already handled above
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
      
      // Pointer/Memo mode - Tap on TARGET point first, then drag to NOTE position
      // x2,y2 = target (where the red circle will be - first tap stays fixed)
      // x1,y1 = note box position (updated while dragging)
      if (isPointerMode) {
        // Both start at tap position, then x1,y1 follows the drag
        setPendingPointer({ x1: locationX, y1: locationY - 50, x2: locationX, y2: locationY });
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
        } else if (selectedElement.type === 'pointer') {
          // Move pointer/note element
          setShapes(prev => prev.map(s => {
            if (s.id === selectedElement.id && s.type === 'pointer') {
              if (selectedElement.dragPart === 'target') {
                // Move target point only
                return { ...s, x2: dx, y2: dy };
              } else {
                // Move note box only
                return { ...s, x1: dx, y1: dy };
              }
            }
            return s;
          }));
        } else if (selectedElement.type === 'path') {
          // Move path (pencil drawing)
          const pathIndex = parseInt(selectedElement.id.replace('path-', ''));
          const pathObj = paths[pathIndex];
          if (pathObj) {
            // Get the bounding box first point as reference
            const coords = pathObj.path.match(/[\d.]+/g);
            if (coords && coords.length >= 2) {
              const firstX = parseFloat(coords[0]);
              const firstY = parseFloat(coords[1]);
              
              // Calculate movement delta from original position
              const deltaX = dx - firstX;
              const deltaY = dy - firstY;
              
              // Create new path with translated coordinates
              let coordIndex = 0;
              const newPathStr = pathObj.path.replace(/([\d.]+)\s+([\d.]+)/g, (match, xStr, yStr) => {
                const oldX = parseFloat(xStr);
                const oldY = parseFloat(yStr);
                return `${oldX + deltaX} ${oldY + deltaY}`;
              });
              
              setPaths(prev => prev.map((p, i) => {
                if (i === pathIndex) {
                  return { ...p, path: newPathStr };
                }
                return p;
              }));
            }
          }
        }
        return;
      }
      
      // Pointer mode - update note position (x1,y1), keep target fixed (x2,y2)
      if (pendingPointer) {
        setPendingPointer({ ...pendingPointer, x1: locationX, y1: locationY });
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

  // Render pointer/memo arrow - NEW DESIGN: Note with connecting line
  const renderPointer = (pointer: any, isPreview = false) => {
    const { x1, y1, x2, y2, text, color: pColor } = pointer;
    const key = isPreview ? 'preview-pointer' : pointer.id;
    const col = pColor || drawColor;
    
    const noteText = text || '';
    const textLength = noteText.length;
    const noteWidth = Math.max(textLength * 9 + 20, 80);
    const noteHeight = 32;
    const noteX = x1 - noteWidth / 2;
    const noteY = y1 - noteHeight - 5;
    const cornerRadius = 6;
    const targetRadius = 6;
    
    return (
      <G key={key}>
        {/* Connecting line from note to target */}
        <Line 
          x1={x1} 
          y1={y1} 
          x2={x2} 
          y2={y2} 
          stroke={col} 
          strokeWidth={2}
          strokeDasharray="5,3"
        />
        
        {/* Target indicator - filled circle */}
        <Circle 
          cx={x2} 
          cy={y2} 
          r={targetRadius} 
          fill={col}
          stroke="white"
          strokeWidth={2}
        />
        
        {/* Note box shadow */}
        <Rect 
          x={noteX + 2} 
          y={noteY + 2} 
          width={noteWidth} 
          height={noteHeight} 
          fill="rgba(0,0,0,0.15)" 
          rx={cornerRadius}
        />
        
        {/* Note box background */}
        <Rect 
          x={noteX} 
          y={noteY} 
          width={noteWidth} 
          height={noteHeight} 
          fill="#FFFDE7"
          stroke={col} 
          strokeWidth={2} 
          rx={cornerRadius}
        />
        
        {/* Small triangle/pointer from box to line */}
        <Path 
          d={`M ${x1 - 6} ${noteY + noteHeight} L ${x1} ${noteY + noteHeight + 8} L ${x1 + 6} ${noteY + noteHeight} Z`}
          fill="#FFFDE7"
          stroke={col}
          strokeWidth={2}
        />
        {/* Cover the bottom stroke where triangle meets box */}
        <Line 
          x1={x1 - 5} 
          y1={noteY + noteHeight} 
          x2={x1 + 5} 
          y2={noteY + noteHeight} 
          stroke="#FFFDE7" 
          strokeWidth={3}
        />
        
        {/* Note text */}
        {noteText && (
          <SvgText 
            x={x1} 
            y={noteY + noteHeight / 2 + 5} 
            fill="#333" 
            fontSize={14} 
            fontWeight="600" 
            textAnchor="middle"
          >
            {noteText}
          </SvgText>
        )}
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
        const col = color || drawColor;
        
        // New design: Note box with connecting line
        // x1,y1 = where the note box is (start of drag)
        // x2,y2 = where it points to (end of drag)
        
        const noteText = shape.text || '';
        const textLength = noteText.length;
        const noteWidth = Math.max(textLength * 9 + 20, 80);
        const noteHeight = 32;
        const noteX = x1 - noteWidth / 2;
        const noteY = y1 - noteHeight - 5;
        const cornerRadius = 6;
        
        // Connection point from note to target
        const noteBottomCenterX = x1;
        const noteBottomCenterY = y1;
        
        // Small circle at target point
        const targetRadius = 6;
        
        return (
          <G key={key}>
            {/* Connecting line from note to target */}
            <Line 
              x1={noteBottomCenterX} 
              y1={noteBottomCenterY} 
              x2={x2} 
              y2={y2} 
              stroke={col} 
              strokeWidth={2}
              strokeDasharray="5,3"
            />
            
            {/* Target indicator - filled circle */}
            <Circle 
              cx={x2} 
              cy={y2} 
              r={targetRadius} 
              fill={col}
              stroke="white"
              strokeWidth={2}
            />
            
            {/* Note box shadow */}
            <Rect 
              x={noteX + 2} 
              y={noteY + 2} 
              width={noteWidth} 
              height={noteHeight} 
              fill="rgba(0,0,0,0.15)" 
              rx={cornerRadius}
            />
            
            {/* Note box background */}
            <Rect 
              x={noteX} 
              y={noteY} 
              width={noteWidth} 
              height={noteHeight} 
              fill="#FFFDE7"
              stroke={col} 
              strokeWidth={2} 
              rx={cornerRadius}
            />
            
            {/* Small triangle/pointer from box to line */}
            <Path 
              d={`M ${x1 - 6} ${noteY + noteHeight} L ${x1} ${noteY + noteHeight + 8} L ${x1 + 6} ${noteY + noteHeight} Z`}
              fill="#FFFDE7"
              stroke={col}
              strokeWidth={2}
            />
            {/* Cover the bottom stroke where triangle meets box */}
            <Line 
              x1={x1 - 5} 
              y1={noteY + noteHeight} 
              x2={x1 + 5} 
              y2={noteY + noteHeight} 
              stroke="#FFFDE7" 
              strokeWidth={3}
            />
            
            {/* Note text */}
            {noteText && (
              <SvgText 
                x={x1} 
                y={noteY + noteHeight / 2 + 5} 
                fill="#333" 
                fontSize={14} 
                fontWeight="600" 
                textAnchor="middle"
              >
                {noteText}
              </SvgText>
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
    
    // Show options
    Alert.alert(
      'PDF teilen',
      'Wählen Sie eine Option',
      [
        {
          text: 'Original-PDF teilen',
          onPress: shareOriginalPdf,
        },
        {
          text: 'Mit Annotationen teilen',
          onPress: shareWithAnnotations,
        },
        {
          text: 'Abbrechen',
          style: 'cancel',
        },
      ]
    );
  };

  const shareOriginalPdf = async () => {
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

  const shareWithAnnotations = async () => {
    // Load all annotations and create PDF with them
    const freshDoc = await DocumentService.getById(documentId || '');
    if (!freshDoc) {
      Alert.alert('Fehler', 'Dokument nicht gefunden');
      return;
    }

    // Check if there are any annotations
    let hasAnnotations = false;
    if (freshDoc.pages) {
      for (const page of freshDoc.pages) {
        if (page.annotations) {
          try {
            const ann = JSON.parse(page.annotations);
            if ((ann.paths?.length > 0) || (ann.shapes?.length > 0) || (ann.texts?.length > 0)) {
              hasAnnotations = true;
              break;
            }
          } catch (e) {}
        }
      }
    }

    if (!hasAnnotations) {
      // No annotations, just share original
      Alert.alert(
        'Keine Annotationen',
        'Es wurden keine Annotationen gefunden. Das Original-PDF wird geteilt.',
        [{ text: 'OK', onPress: shareOriginalPdf }]
      );
      return;
    }

    // Start the export process - this will render all pages with annotations
    // Re-use the existing export logic from edit mode
    setIsExporting(true);
    setExportProgress(10);
    
    // Build annotations data for all pages
    const allPagesAnnotations: {[key: number]: any} = {};
    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
      const pageData = freshDoc.pages?.find(p => p.pageNumber === pageNum);
      if (pageData?.annotations) {
        try {
          allPagesAnnotations[pageNum] = JSON.parse(pageData.annotations);
        } catch (e) {
          allPagesAnnotations[pageNum] = { paths: [], shapes: [], texts: [] };
        }
      } else {
        allPagesAnnotations[pageNum] = { paths: [], shapes: [], texts: [] };
      }
    }

    // Start rendering all pages for export
    setAllPageImages({});
    setRenderAllPagesMode(true);
    setRenderingForExport(1);
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
              <Ionicons name="image-outline" size={24} color="#1976d2" />
            </TouchableOpacity>
            <TouchableOpacity onPress={shareAllPagesAnnotated} style={styles.iconBtn}>
              <Ionicons name="print-outline" size={24} color="#4caf50" />
            </TouchableOpacity>
          </View>

          {/* Canvas Area with side navigation arrows */}
          <View style={{ width: screenW, height: CANVAS_H, flexDirection: 'row', alignItems: 'center', backgroundColor: '#d0d0d0' }}>
            {/* Left Arrow */}
            <TouchableOpacity 
              onPress={() => changePage(currentPage - 1)} 
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
                      {/* Live preview of pointer/note while dragging */}
                      {pendingPointer && renderPointer({ ...pendingPointer, text: '', color: drawColor }, true)}
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
                      
                      {/* Selection indicator for pointer/note */}
                      {isSelectMode && selectedElement && selectedElement.type === 'pointer' && (() => {
                        const pointer = shapes.find(s => s.id === selectedElement.id && s.type === 'pointer');
                        if (!pointer) return null;
                        const noteText = pointer.text || '';
                        const noteWidth = Math.max(noteText.length * 9 + 20, 80);
                        const noteHeight = 32;
                        const noteX = pointer.x1 - noteWidth / 2;
                        const noteY = pointer.y1 - noteHeight - 5;
                        return (
                          <G>
                            {/* Highlight note box */}
                            <Rect 
                              x={noteX - 4} 
                              y={noteY - 4} 
                              width={noteWidth + 8} 
                              height={noteHeight + 20} 
                              stroke="#1976d2" 
                              strokeWidth={2} 
                              strokeDasharray="5,5" 
                              fill="rgba(25, 118, 210, 0.1)" 
                              rx={8}
                            />
                            {/* Highlight target point */}
                            <Circle 
                              cx={pointer.x2} 
                              cy={pointer.y2} 
                              r={14} 
                              stroke="#1976d2" 
                              strokeWidth={2} 
                              strokeDasharray="5,5" 
                              fill="rgba(25, 118, 210, 0.1)" 
                            />
                            {/* Move handle on note */}
                            <Circle cx={noteX + noteWidth + 4} cy={noteY - 4} r={8} fill="#1976d2" />
                            {/* Move handle on target */}
                            <Circle cx={pointer.x2 + 14} cy={pointer.y2 - 14} r={8} fill="#e91e63" />
                          </G>
                        );
                      })()}
                      
                      {/* Selection indicator for path (pencil drawing) */}
                      {isSelectMode && selectedElement && selectedElement.type === 'path' && (() => {
                        const pathIndex = parseInt(selectedElement.id.replace('path-', ''));
                        const pathObj = paths[pathIndex];
                        if (!pathObj) return null;
                        
                        // Calculate bounding box of path
                        const coords = pathObj.path.match(/[\d.]+/g);
                        if (!coords || coords.length < 2) return null;
                        
                        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
                        for (let i = 0; i < coords.length - 1; i += 2) {
                          const px = parseFloat(coords[i]);
                          const py = parseFloat(coords[i + 1]);
                          minX = Math.min(minX, px);
                          minY = Math.min(minY, py);
                          maxX = Math.max(maxX, px);
                          maxY = Math.max(maxY, py);
                        }
                        
                        return (
                          <Rect 
                            x={minX - 10} 
                            y={minY - 10} 
                            width={maxX - minX + 20} 
                            height={maxY - minY + 20} 
                            stroke="#e91e63" 
                            strokeWidth={2} 
                            strokeDasharray="5,5" 
                            fill="rgba(233, 30, 99, 0.1)" 
                            rx={5}
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
              onPress={() => changePage(currentPage + 1)} 
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
              
              {/* Edit Text Button - shows when pointer is selected */}
              {isSelectMode && selectedElement?.type === 'pointer' && (
                <>
                  <View style={styles.divider} />
                  <TouchableOpacity 
                    style={styles.actionBtn}
                    onPress={() => {
                      const pointer = shapes.find(s => s.id === selectedElement.id);
                      if (pointer) {
                        setEditingPointerId(pointer.id);
                        setEditingPointerText(pointer.text || '');
                      }
                    }}
                  >
                    <View style={[styles.actionBtnInner, { backgroundColor: '#4caf50' }]}>
                      <Ionicons name="create-outline" size={16} color="#fff" />
                      <Text style={styles.actionBtnText}>Text</Text>
                    </View>
                  </TouchableOpacity>
                </>
              )}
              
              {/* Delete Button - shows when any element is selected */}
              {isSelectMode && selectedElement && (
                <>
                  <View style={styles.divider} />
                  <TouchableOpacity 
                    style={styles.actionBtn}
                    onPress={() => {
                      if (selectedElement.type === 'path') {
                        const pathIndex = parseInt(selectedElement.id.replace('path-', ''));
                        setPaths(prev => prev.filter((_, i) => i !== pathIndex));
                      } else if (selectedElement.type === 'shape' || selectedElement.type === 'pointer') {
                        setShapes(prev => prev.filter(s => s.id !== selectedElement.id));
                      } else if (selectedElement.type === 'text') {
                        setTextAnnotations(prev => prev.filter(t => t.id !== selectedElement.id));
                      }
                      setSelectedElement(null);
                    }}
                  >
                    <View style={[styles.actionBtnInner, { backgroundColor: '#f44336' }]}>
                      <Ionicons name="trash-outline" size={16} color="#fff" />
                      <Text style={styles.actionBtnText}>Löschen</Text>
                    </View>
                  </TouchableOpacity>
                </>
              )}
              
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

          {/* Hidden WebView for PDF Export - renders all pages sequentially */}
          {renderAllPagesMode && (
            <WebView
              ref={exportWebViewRef}
              source={{ html: getExportWebViewHtml() }}
              style={{ height: 1, width: 1, position: 'absolute', top: -2000, left: -2000 }}
              onMessage={handleExportWebViewMessage}
              javaScriptEnabled
            />
          )}

          {/* Export Progress Modal */}
          <Modal visible={isExporting} transparent animationType="fade">
            <View style={styles.modalOverlay}>
              <View style={styles.modalContent}>
                <Text style={styles.modalTitle}>PDF wird erstellt...</Text>
                <Text style={styles.progressSubtitle}>
                  {renderingForExport > 0 ? `Seite ${renderingForExport} von ${totalPages}` : 'Vorbereitung...'}
                </Text>
                <View style={styles.progressBar}>
                  <View style={[styles.progressFill, { width: `${exportProgress}%` }]} />
                </View>
                <Text style={styles.progressText}>{exportProgress}%</Text>
              </View>
            </View>
          </Modal>

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
            <KeyboardAvoidingView 
              behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
              style={styles.pointerModalContainer}
            >
              {/* Semi-transparent background - tap to see note position */}
              <View style={styles.pointerModalBackdrop}>
                <Text style={styles.pointerHintText}>Notiz-Position wird angezeigt</Text>
              </View>
              
              {/* Input card at top */}
              <View style={styles.pointerInputCard}>
                <Text style={styles.pointerInputTitle}>Notiz-Text eingeben</Text>
                <TextInput
                  style={[styles.pointerTextInput, { borderColor: drawColor }]}
                  value={pointerText}
                  onChangeText={setPointerText}
                  placeholder="Text für Notiz..."
                  placeholderTextColor="#999"
                  autoFocus
                />
                <View style={styles.pointerInputButtons}>
                  <TouchableOpacity 
                    style={styles.pointerBtnCancel} 
                    onPress={() => { setPointerText(''); setPendingPointer(null); setShowPointerModal(false); }}
                  >
                    <Text style={styles.pointerBtnCancelText}>Abbrechen</Text>
                  </TouchableOpacity>
                  <TouchableOpacity 
                    style={[styles.pointerBtnOk, { backgroundColor: drawColor }]} 
                    onPress={addPointerElement}
                  >
                    <Text style={styles.pointerBtnOkText}>Hinzufügen</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </KeyboardAvoidingView>
          </Modal>

          {/* Edit Pointer Text Modal */}
          <Modal visible={!!editingPointerId} transparent animationType="fade">
            <KeyboardAvoidingView 
              behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
              style={styles.pointerModalContainer}
            >
              <View style={styles.pointerModalBackdrop}>
                <Text style={styles.pointerHintText}>Notiz-Text bearbeiten</Text>
              </View>
              
              <View style={styles.pointerInputCard}>
                <Text style={styles.pointerInputTitle}>Text ändern</Text>
                <TextInput
                  style={[styles.pointerTextInput, { borderColor: '#4caf50' }]}
                  value={editingPointerText}
                  onChangeText={setEditingPointerText}
                  placeholder="Neuer Text..."
                  placeholderTextColor="#999"
                  autoFocus
                />
                <View style={styles.pointerInputButtons}>
                  <TouchableOpacity 
                    style={styles.pointerBtnCancel} 
                    onPress={() => { setEditingPointerId(null); setEditingPointerText(''); }}
                  >
                    <Text style={styles.pointerBtnCancelText}>Abbrechen</Text>
                  </TouchableOpacity>
                  <TouchableOpacity 
                    style={[styles.pointerBtnOk, { backgroundColor: '#4caf50' }]} 
                    onPress={() => {
                      if (editingPointerId) {
                        setShapes(prev => prev.map(s => 
                          s.id === editingPointerId ? { ...s, text: editingPointerText } : s
                        ));
                        setEditingPointerId(null);
                        setEditingPointerText('');
                      }
                    }}
                  >
                    <Text style={styles.pointerBtnOkText}>Speichern</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </KeyboardAvoidingView>
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

      {/* Hidden WebView for PDF Export - renders all pages sequentially */}
      {renderAllPagesMode && (
        <WebView
          ref={exportWebViewRef}
          source={{ html: getExportWebViewHtml() }}
          style={{ height: 1, width: 1, position: 'absolute', top: -2000, left: -2000 }}
          onMessage={handleExportWebViewMessage}
          javaScriptEnabled
        />
      )}

      {/* Export Progress Modal */}
      <Modal visible={isExporting} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>PDF wird erstellt...</Text>
            <Text style={styles.progressSubtitle}>
              {renderingForExport > 0 ? `Seite ${renderingForExport} von ${totalPages}` : 'Vorbereitung...'}
            </Text>
            <View style={styles.progressBar}>
              <View style={[styles.progressFill, { width: `${exportProgress}%` }]} />
            </View>
            <Text style={styles.progressText}>{exportProgress}%</Text>
          </View>
        </View>
      </Modal>
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
  
  // Action buttons (Text, Löschen)
  actionBtn: {
    marginHorizontal: 4,
  },
  actionBtnInner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
    gap: 6,
  },
  actionBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  
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
  
  // Progress bar styles
  progressBar: {
    width: '100%',
    height: 8,
    backgroundColor: '#e0e0e0',
    borderRadius: 4,
    marginTop: 15,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#4caf50',
    borderRadius: 4,
  },
  progressText: {
    marginTop: 10,
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
  },
  progressSubtitle: {
    marginTop: 5,
    marginBottom: 10,
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
  },
  
  // Pointer/Note input modal styles
  pointerModalContainer: {
    flex: 1,
  },
  pointerModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  pointerHintText: {
    color: 'white',
    fontSize: 16,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
  },
  pointerInputCard: {
    backgroundColor: 'white',
    paddingHorizontal: 20,
    paddingVertical: 15,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.2,
    shadowRadius: 5,
    elevation: 10,
  },
  pointerInputTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 10,
    textAlign: 'center',
  },
  pointerTextInput: {
    borderWidth: 2,
    borderRadius: 10,
    paddingHorizontal: 15,
    paddingVertical: 12,
    fontSize: 16,
    backgroundColor: '#FFFDE7',
  },
  pointerInputButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 15,
  },
  pointerBtnCancel: {
    flex: 1,
    paddingVertical: 12,
    marginRight: 10,
    borderRadius: 10,
    backgroundColor: '#f0f0f0',
    alignItems: 'center',
  },
  pointerBtnCancelText: {
    fontSize: 16,
    color: '#666',
  },
  pointerBtnOk: {
    flex: 1,
    paddingVertical: 12,
    marginLeft: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  pointerBtnOkText: {
    fontSize: 16,
    color: 'white',
    fontWeight: '600',
  },
});

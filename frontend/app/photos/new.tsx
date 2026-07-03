import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  TextInput,
  ScrollView,
  Alert,
  Platform,
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { WebView } from 'react-native-webview';
import { File } from 'expo-file-system/next';
import { PhotoService } from '../../services/LocalStorage';
import { useTranslation } from 'react-i18next';

interface SelectedPhoto {
  uri: string;
  description: string;
}

export default function NewPhotoScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { projectId } = useLocalSearchParams();
  const [selectedPhotos, setSelectedPhotos] = useState<SelectedPhoto[]>([]);
  const [loading, setLoading] = useState(false);
  const [savingProgress, setSavingProgress] = useState(0);
  
  // PDF Konverter State (pdf.js via WebView)
  const [showPdfConverter, setShowPdfConverter] = useState(false);
  const [pdfBase64Data, setPdfBase64Data] = useState<string | null>(null);
  const [pdfTotalPages, setPdfTotalPages] = useState(1);
  const [selectedPdfPage, setSelectedPdfPage] = useState(1);
  const pdfWebViewRef = useRef<WebView>(null);

  const requestPermissions = async () => {
    if (Platform.OS !== 'web') {
      const { status: cameraStatus } = await ImagePicker.requestCameraPermissionsAsync();
      // Note: We don't request MediaLibrary permissions anymore because:
      // 1. We use the system Photo Picker which doesn't require them
      // 2. These permissions are blocked for Google Play Store compliance
      // Only camera permission is needed for taking photos
      if (cameraStatus !== 'granted') {
        Alert.alert(
          'Kamera-Berechtigung erforderlich',
          'Bitte erlauben Sie den Zugriff auf die Kamera, um Fotos aufzunehmen'
        );
        return false;
      }
    }
    return true;
  };

  const pickImages = async () => {
    const hasPermission = await requestPermissions();
    if (!hasPermission) return;

    try {
      // FIX: Android expo-image-picker hat einen bekannten Bug wo allowsMultipleSelection
      // auf echten Geräten/APKs nicht richtig funktioniert. Wir zeigen einen Hinweis
      // und erlauben wiederholtes Hinzufügen von Einzelfotos.
      const isAndroid = Platform.OS === 'android';
      
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: true,
        quality: 0.8,
        selectionLimit: 20,
        // FIX: exif:false kann auf manchen Android-Geräten die Mehrfachauswahl verbessern
        exif: false,
      });

      if (!result.canceled && result.assets.length > 0) {
        setLoading(true);
        setSavingProgress(0);
        const newPhotos: SelectedPhoto[] = [];
        const failedAssets: { index: number; reason: string }[] = [];
        const total = result.assets.length;
        
        // FIX: Zeige Android-Hinweis wenn nur 1 Foto zurückkommt trotz Mehrfachauswahl
        const showAndroidHint = isAndroid && total === 1 && selectedPhotos.length === 0;
        
        for (let i = 0; i < total; i++) {
          const asset = result.assets[i];
          let base64Image: string | null = null;
          
          // 1. Versuch: Resize + Compress (Standard-Qualität)
          try {
            const manipResult = await ImageManipulator.manipulateAsync(
              asset.uri,
              [{ resize: { width: Math.min(asset.width || 800, 800) } }],
              { compress: 0.6, format: ImageManipulator.SaveFormat.JPEG, base64: true }
            );
            if (manipResult.base64) {
              base64Image = `data:image/jpeg;base64,${manipResult.base64}`;
            }
          } catch (manipError) {
            console.warn(`[pickImages] Resize fehlgeschlagen für Foto ${i + 1}:`, manipError);
          }
          
          // 2. Versuch: Kleinere Größe + stärkere Kompression (Memory-sparsamer)
          if (!base64Image) {
            try {
              const manipResult = await ImageManipulator.manipulateAsync(
                asset.uri,
                [{ resize: { width: 800 } }],
                { compress: 0.6, format: ImageManipulator.SaveFormat.JPEG, base64: true }
              );
              if (manipResult.base64) {
                base64Image = `data:image/jpeg;base64,${manipResult.base64}`;
              }
            } catch (retryError) {
              console.warn(`[pickImages] Retry fehlgeschlagen für Foto ${i + 1}:`, retryError);
            }
          }
          
          // 3. Fallback: Nutze direkt asset.base64 falls vorhanden
          if (!base64Image && asset.base64) {
            base64Image = `data:image/jpeg;base64,${asset.base64}`;
          }
          
          if (base64Image) {
            newPhotos.push({ uri: base64Image, description: '' });
          } else {
            failedAssets.push({ index: i + 1, reason: 'Bild konnte nicht verarbeitet werden' });
          }
          
          setSavingProgress(i + 1);
          // Kurze Pause zwischen Fotos → gibt Android Zeit für Garbage Collection
          // Verhindert OOM-Crashes bei vielen großen Bildern
          if (i < total - 1) {
            await new Promise(resolve => setTimeout(resolve, 50));
          }
        }
        
        if (newPhotos.length > 0) {
          setSelectedPhotos(prev => [...prev, ...newPhotos]);
        }
        
        setLoading(false);
        setSavingProgress(0);
        
        // FIX: Android-spezifischer Hinweis für Mehrfachauswahl-Workaround
        if (showAndroidHint) {
          Alert.alert(
            'Foto hinzugefügt',
            'Auf Android können Sie weitere Fotos hinzufügen, indem Sie erneut auf "Aus Galerie wählen" tippen. Sie können den Vorgang beliebig oft wiederholen.',
            [{ text: 'Verstanden', style: 'default' }]
          );
        }
        // Feedback an User bei teilweisen Fehlern
        else if (failedAssets.length > 0) {
          Alert.alert(
            `${newPhotos.length} von ${total} Fotos geladen`,
            failedAssets.length === total
              ? 'Keines der ausgewählten Fotos konnte geladen werden. Bitte versuchen Sie es erneut oder wählen Sie weniger Fotos auf einmal.'
              : `${failedAssets.length} ${failedAssets.length === 1 ? 'Foto konnte' : 'Fotos konnten'} nicht geladen werden (z.B. zu groß, Cloud-Foto, oder nicht unterstützt). Bitte einzeln erneut versuchen.`,
            [{ text: t('common.ok'), style: 'default' }]
          );
        }
      }
    } catch (error) {
      setLoading(false);
      setSavingProgress(0);
      console.error('Error picking images:', error);
      Alert.alert(t('common.error'), 'Bilder konnten nicht geladen werden');
    }
  };

  const takePhoto = async () => {
    const hasPermission = await requestPermissions();
    if (!hasPermission) return;

    try {
      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: false,
        quality: 0.8,
        base64: true,
      });

      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        
        // Android: base64 könnte undefined sein, dann URI als Fallback verwenden
        // und mit ImageManipulator in base64 konvertieren
        let base64Image: string;
        
        if (asset.base64) {
          base64Image = `data:image/jpeg;base64,${asset.base64}`;
        } else if (asset.uri) {
          // Fallback: URI mit ImageManipulator in base64 konvertieren
          console.log('base64 not available, converting from URI:', asset.uri);
          const manipResult = await ImageManipulator.manipulateAsync(
            asset.uri,
            [{ resize: { width: 800 } }],
            { compress: 0.6, format: ImageManipulator.SaveFormat.JPEG, base64: true }
          );
          if (manipResult.base64) {
            base64Image = `data:image/jpeg;base64,${manipResult.base64}`;
          } else {
            throw new Error('Konnte Foto nicht in base64 konvertieren');
          }
        } else {
          throw new Error('Kein Bild verfügbar');
        }
        
        setSelectedPhotos(prev => [...prev, { uri: base64Image, description: '' }]);
      }
    } catch (error) {
      console.error('Error taking photo:', error);
      Alert.alert(t('common.error'), 'Foto konnte nicht aufgenommen werden');
    }
  };

  const removePhoto = (index: number) => {
    setSelectedPhotos(prev => prev.filter((_, i) => i !== index));
  };

  // Import from Files (including PDF conversion via pdf.js WebView)
  const importFromFiles = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['image/*', 'application/pdf'],
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) {
        return;
      }

      const file = result.assets[0];
      const fileUri = file.uri;
      const mimeType = file.mimeType || '';
      
      console.log('[importFromFiles] Selected file:', file.name, mimeType);

      // Wenn es ein PDF ist, öffne den PDF-Konverter (pdf.js via WebView)
      if (mimeType === 'application/pdf' || file.name?.toLowerCase().endsWith('.pdf')) {
        try {
          console.log('[importFromFiles] Loading PDF for conversion via pdf.js...');
          setLoading(true);
          
          // Lese PDF als Base64 mit dem neuen expo-file-system/next API
          const pdfFile = new File(fileUri);
          const base64 = await pdfFile.base64();
          const pdfDataUri = `data:application/pdf;base64,${base64}`;
          
          console.log('[importFromFiles] PDF loaded, base64 length:', base64.length);
          
          // Setze State und zeige Konverter-Modal
          setPdfBase64Data(pdfDataUri);
          setSelectedPdfPage(1);
          setPdfTotalPages(1);
          setShowPdfConverter(true);
          setLoading(false);
          return;
        } catch (pdfError) {
          console.error('[importFromFiles] PDF loading error:', pdfError);
          setLoading(false);
          Alert.alert(
            'PDF Import',
            'Die PDF-Datei konnte nicht geladen werden. Bitte versuchen Sie es mit einer anderen Datei.',
            [{ text: 'OK', style: 'default' }]
          );
          return;
        }
      }

      // Wenn es ein Bild ist, füge es direkt ein
      if (mimeType.startsWith('image/')) {
        const manipResult = await ImageManipulator.manipulateAsync(
          fileUri,
          [{ resize: { width: 800 } }],
          { compress: 0.6, format: ImageManipulator.SaveFormat.JPEG, base64: true }
        );
        
        if (manipResult.base64) {
          const base64Image = `data:image/jpeg;base64,${manipResult.base64}`;
          setSelectedPhotos(prev => [...prev, { uri: base64Image, description: '' }]);
        }
      } else {
        Alert.alert(t('common.error'), 'Dieser Dateityp wird nicht unterstützt. Bitte wählen Sie ein Bild (JPG, PNG, etc.) oder PDF.');
      }
    } catch (error) {
      console.error('Error importing from files:', error);
      Alert.alert(t('common.error'), 'Datei konnte nicht importiert werden');
    }
  };
  
  // PDF WebView Message Handler
  const handlePdfWebViewMessage = async (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      console.log('[PDF WebView] Message received:', data.type);
      
      if (data.type === 'pageCount') {
        setPdfTotalPages(data.count);
      } else if (data.type === 'pageRendered') {
        console.log('[PDF WebView] Page rendered, adding to photos...');
        setShowPdfConverter(false);
        setPdfBase64Data(null);
        
        // Füge das Bild zu den ausgewählten Fotos hinzu
        setSelectedPhotos(prev => [...prev, { uri: data.imageData, description: `PDF Seite ${data.pageNum}` }]);
      } else if (data.type === 'error') {
        Alert.alert('PDF Fehler', data.message || 'Ein Fehler ist aufgetreten');
      }
    } catch (e) {
      console.error('[PDF WebView] Message parse error:', e);
    }
  };
  
  // Konvertiert die ausgewählte PDF-Seite zu einem Bild
  const convertPdfPageToImage = () => {
    if (pdfWebViewRef.current) {
      pdfWebViewRef.current.injectJavaScript(`renderPageAsImage(${selectedPdfPage}); true;`);
    }
  };
  
  // Generiert den HTML-Code für den PDF-Konverter
  const getPdfConverterHtml = () => {
    if (!pdfBase64Data) return '<html><body></body></html>';
    
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
        <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { 
            background: #525659; 
            display: flex; 
            flex-direction: column; 
            align-items: center; 
            justify-content: center;
            min-height: 100vh;
            padding: 10px;
          }
          #preview-container {
            background: white;
            box-shadow: 0 4px 20px rgba(0,0,0,0.3);
            max-width: 100%;
            max-height: 80vh;
            overflow: hidden;
          }
          #preview-canvas {
            display: block;
            max-width: 100%;
            height: auto;
          }
          .loading {
            color: white;
            font-family: -apple-system, BlinkMacSystemFont, sans-serif;
            font-size: 16px;
            text-align: center;
          }
        </style>
      </head>
      <body>
        <div id="preview-container">
          <canvas id="preview-canvas"></canvas>
        </div>
        <p class="loading" id="status">Lade PDF...</p>
        <canvas id="export-canvas" style="display:none;"></canvas>
        
        <script>
          pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
          
          let pdf = null;
          let currentPage = 1;
          
          const pdfData = '${pdfBase64Data}';
          const base64 = pdfData.includes(',') ? pdfData.split(',')[1] : pdfData;
          
          const binaryString = atob(base64);
          const bytes = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }
          
          pdfjsLib.getDocument({ data: bytes }).promise.then(async loadedPdf => {
            pdf = loadedPdf;
            window.ReactNativeWebView.postMessage(JSON.stringify({ 
              type: 'pageCount', 
              count: pdf.numPages 
            }));
            document.getElementById('status').textContent = 'Seite 1 von ' + pdf.numPages;
            await showPagePreview(1);
          }).catch(err => {
            document.getElementById('status').textContent = 'Fehler beim Laden';
            window.ReactNativeWebView.postMessage(JSON.stringify({ 
              type: 'error', 
              message: 'PDF konnte nicht geladen werden: ' + err.message 
            }));
          });
          
          async function showPagePreview(pageNum) {
            if (!pdf) return;
            try {
              currentPage = pageNum;
              const page = await pdf.getPage(pageNum);
              const viewport = page.getViewport({ scale: 1.5 });
              const canvas = document.getElementById('preview-canvas');
              canvas.width = viewport.width;
              canvas.height = viewport.height;
              const ctx = canvas.getContext('2d');
              ctx.fillStyle = 'white';
              ctx.fillRect(0, 0, viewport.width, viewport.height);
              await page.render({ canvasContext: ctx, viewport: viewport }).promise;
              document.getElementById('status').textContent = 'Seite ' + pageNum + ' von ' + pdf.numPages + ' - Bereit';
            } catch (err) {
              console.error('Page preview error:', err);
            }
          }
          
          async function renderPageAsImage(pageNum) {
            if (!pdf) return;
            try {
              document.getElementById('status').textContent = 'Konvertiere...';
              const page = await pdf.getPage(pageNum);
              const scale = 2.5;
              const viewport = page.getViewport({ scale: scale });
              const canvas = document.getElementById('export-canvas');
              canvas.width = viewport.width;
              canvas.height = viewport.height;
              const ctx = canvas.getContext('2d');
              ctx.fillStyle = 'white';
              ctx.fillRect(0, 0, viewport.width, viewport.height);
              await page.render({ canvasContext: ctx, viewport: viewport }).promise;
              const imageData = canvas.toDataURL('image/jpeg', 0.9);
              window.ReactNativeWebView.postMessage(JSON.stringify({ 
                type: 'pageRendered', 
                imageData: imageData,
                pageNum: pageNum
              }));
            } catch (err) {
              window.ReactNativeWebView.postMessage(JSON.stringify({ 
                type: 'error', 
                message: 'Seite konnte nicht gerendert werden: ' + err.message 
              }));
            }
          }
          
          window.showPage = function(pageNum) {
            if (pageNum >= 1 && pageNum <= pdf.numPages) {
              showPagePreview(pageNum);
            }
          };
        </script>
      </body>
      </html>
    `;
  };

  const updateDescription = (index: number, description: string) => {
    setSelectedPhotos(prev => prev.map((photo, i) => 
      i === index ? { ...photo, description } : photo
    ));
  };

  const handleSave = async () => {
    if (selectedPhotos.length === 0) {
      Alert.alert(t('common.error'), 'Bitte wählen Sie mindestens ein Foto aus');
      return;
    }

    setLoading(true);
    setSavingProgress(0);
    let savedCount = 0;
    
    try {
      const projId = Array.isArray(projectId) ? projectId[0] : projectId;
      
      // Fotos einzeln speichern (verhindert OOM bei vielen Bildern)
      for (let i = 0; i < selectedPhotos.length; i++) {
        try {
          const photo = selectedPhotos[i];
          await PhotoService.create({
            project_id: projId || '',
            image_data: photo.uri,
            uri: photo.uri,
            description: photo.description || undefined,
          });
          savedCount++;
          setSavingProgress(savedCount);
          
          // Speicher freigeben: Bereits gespeichertes Foto aus State entfernen
          // Dies reduziert den RAM-Verbrauch bei vielen Bildern
        } catch (photoError) {
          console.error(`Error saving photo ${i + 1}:`, photoError);
          // Einzelfehler nicht abbrechen — weiter mit nächstem Foto
        }
      }

      router.back();
      
      setTimeout(() => {
        const message = savedCount === 1 
          ? 'Foto wurde hinzugefügt' 
          : `${savedCount} Fotos wurden hinzugefügt`;
        if (Platform.OS === 'web') {
          alert(message);
        } else {
          Alert.alert(t('common.success'), message);
        }
      }, 300);
    } catch (error) {
      console.error('Error saving photos:', error);
      if (Platform.OS === 'web') {
        alert('Fehler: Fotos konnten nicht gespeichert werden');
      } else {
        Alert.alert(t('common.error'), `${savedCount} von ${selectedPhotos.length} Fotos gespeichert. Fehler beim Speichern.`);
      }
    } finally {
      setLoading(false);
      setSavingProgress(0);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {/* Loading-Overlay während Import großer Foto-Mengen */}
      {loading && selectedPhotos.length === 0 && savingProgress > 0 && (
        <View style={styles.loadingOverlay} pointerEvents="none">
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color="#1976d2" />
            <Text style={styles.loadingText}>
              Fotos werden geladen... ({savingProgress})
            </Text>
          </View>
        </View>
      )}
      <ScrollView style={styles.scrollView} keyboardShouldPersistTaps="handled">
        <View style={styles.content}>
          {/* Upload Buttons - immer sichtbar */}
          <View style={styles.uploadSection}>
            <TouchableOpacity style={styles.uploadButton} onPress={takePhoto}>
              <Ionicons name="camera" size={36} color="#1976d2" />
              <Text style={styles.uploadButtonText}>Foto aufnehmen</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.uploadButton} onPress={pickImages}>
              <Ionicons name="images" size={36} color="#1976d2" />
              <Text style={styles.uploadButtonText}>Aus Galerie wählen</Text>
              <Text style={styles.uploadButtonSubtext}>
                {Platform.OS === 'android' 
                  ? 'Tippen zum Hinzufügen (wiederholbar)'
                  : 'Mehrfachauswahl möglich'}
              </Text>
            </TouchableOpacity>
          </View>
          
          {/* Aus Dateien Button */}
          <TouchableOpacity style={styles.filesButton} onPress={importFromFiles}>
            <Ionicons name="document" size={24} color="#FF5722" />
            <View style={styles.filesButtonText}>
              <Text style={styles.filesButtonTitle}>Aus Dateien importieren</Text>
              <Text style={styles.filesButtonSubtitle}>Bilder oder PDF (wird als Bild gespeichert)</Text>
            </View>
          </TouchableOpacity>

          {/* Ausgewählte Fotos */}
          {selectedPhotos.length > 0 && (
            <View style={styles.selectedSection}>
              <Text style={styles.sectionTitle}>
                {selectedPhotos.length} {selectedPhotos.length === 1 ? 'Foto' : 'Fotos'} ausgewählt
              </Text>
              
              {selectedPhotos.map((photo, index) => (
                <View key={index} style={styles.photoCard}>
                  <View style={styles.photoHeader}>
                    <Image source={{ uri: photo.uri }} style={styles.thumbnail} />
                    <View style={styles.photoInfo}>
                      <Text style={styles.photoNumber}>Foto {index + 1}</Text>
                      <TextInput
                        style={styles.descriptionInput}
                        placeholder="Beschreibung (optional)"
                        value={photo.description}
                        onChangeText={(text) => updateDescription(index, text)}
                        multiline
                      />
                  </View>
                  <TouchableOpacity 
                    style={styles.removeButton}
                    onPress={() => removePhoto(index)}
                  >
                    <Ionicons name="close-circle" size={28} color="#f44336" />
                  </TouchableOpacity>
                </View>
              </View>
            ))}

            {/* Speichern Button */}
            <TouchableOpacity
              style={[styles.saveButton, loading && styles.buttonDisabled]}
              onPress={handleSave}
              disabled={loading}
            >
              {loading ? (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator size="small" color="#fff" />
                  <Text style={styles.saveButtonText}>
                    Speichern... ({savingProgress}/{selectedPhotos.length})
                  </Text>
                </View>
              ) : (
                <Text style={styles.saveButtonText}>
                  {selectedPhotos.length === 1 ? 'Foto speichern' : `${selectedPhotos.length} Fotos speichern`}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        )}
        </View>
      </ScrollView>
      
      {/* PDF Konverter Modal (pdf.js via WebView) */}
      <Modal visible={showPdfConverter} transparent animationType="fade">
        <View style={styles.pdfModalOverlay}>
          <View style={styles.pdfModalContent}>
            <Text style={styles.pdfModalTitle}>PDF importieren</Text>
            <Text style={styles.pdfModalSubtitle}>
              Seite {selectedPdfPage} von {pdfTotalPages}
            </Text>
            
            {/* PDF Vorschau via WebView */}
            <View style={styles.pdfPreviewContainer}>
              {pdfBase64Data && (
                <WebView
                  ref={pdfWebViewRef}
                  originWhitelist={['*']}
                  source={{ html: getPdfConverterHtml() }}
                  onMessage={handlePdfWebViewMessage}
                  style={{ flex: 1 }}
                  javaScriptEnabled={true}
                  domStorageEnabled={true}
                  scrollEnabled={false}
                />
              )}
            </View>
            
            {/* Seitennavigation bei mehrseitigen PDFs */}
            {pdfTotalPages > 1 && (
              <View style={styles.pdfNavigation}>
                <TouchableOpacity
                  onPress={() => {
                    if (selectedPdfPage > 1) {
                      const newPage = selectedPdfPage - 1;
                      setSelectedPdfPage(newPage);
                      pdfWebViewRef.current?.injectJavaScript(`showPage(${newPage}); true;`);
                    }
                  }}
                  disabled={selectedPdfPage <= 1}
                  style={[styles.pdfNavButton, selectedPdfPage <= 1 && styles.pdfNavButtonDisabled]}
                >
                  <Ionicons name="chevron-back" size={20} color="#fff" />
                  <Text style={styles.pdfNavButtonText}>Zurück</Text>
                </TouchableOpacity>
                
                <Text style={styles.pdfPageIndicator}>
                  {selectedPdfPage} / {pdfTotalPages}
                </Text>
                
                <TouchableOpacity
                  onPress={() => {
                    if (selectedPdfPage < pdfTotalPages) {
                      const newPage = selectedPdfPage + 1;
                      setSelectedPdfPage(newPage);
                      pdfWebViewRef.current?.injectJavaScript(`showPage(${newPage}); true;`);
                    }
                  }}
                  disabled={selectedPdfPage >= pdfTotalPages}
                  style={[styles.pdfNavButton, selectedPdfPage >= pdfTotalPages && styles.pdfNavButtonDisabled]}
                >
                  <Text style={styles.pdfNavButtonText}>Weiter</Text>
                  <Ionicons name="chevron-forward" size={20} color="#fff" />
                </TouchableOpacity>
              </View>
            )}
            
            {/* Aktionsbuttons */}
            <View style={styles.pdfActionButtons}>
              <TouchableOpacity
                onPress={() => {
                  setShowPdfConverter(false);
                  setPdfBase64Data(null);
                }}
                style={[styles.pdfActionButton, styles.pdfCancelButton]}
              >
                <Text style={styles.pdfActionButtonText}>Abbrechen</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                onPress={convertPdfPageToImage}
                style={[styles.pdfActionButton, styles.pdfConfirmButton]}
              >
                <Ionicons name="checkmark" size={20} color="#fff" />
                <Text style={styles.pdfActionButtonText}>Seite hinzufügen</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 100,
  },
  uploadSection: {
    flexDirection: 'row',
    gap: 12,
  },
  uploadButton: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#1976d2',
    borderStyle: 'dashed',
  },
  uploadButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1976d2',
    marginTop: 8,
    textAlign: 'center',
  },
  uploadButtonSubtext: {
    fontSize: 11,
    color: '#666',
    marginTop: 4,
  },
  selectedSection: {
    marginTop: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#333',
    marginBottom: 12,
  },
  photoCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  photoHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  thumbnail: {
    width: 80,
    height: 80,
    borderRadius: 8,
    backgroundColor: '#f0f0f0',
  },
  photoInfo: {
    flex: 1,
    marginLeft: 12,
  },
  photoNumber: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1976d2',
    marginBottom: 6,
  },
  descriptionInput: {
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    padding: 10,
    fontSize: 14,
    minHeight: 50,
    textAlignVertical: 'top',
  },
  removeButton: {
    padding: 4,
  },
  saveButton: {
    backgroundColor: '#4caf50',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: {
    backgroundColor: '#ccc',
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  // Dateien Button Styles
  filesButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    marginTop: 16,
    borderWidth: 1,
    borderColor: '#FF5722',
    borderStyle: 'dashed',
    gap: 12,
  },
  filesButtonText: {
    flex: 1,
  },
  filesButtonTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FF5722',
  },
  filesButtonSubtitle: {
    fontSize: 12,
    color: '#999',
    marginTop: 2,
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
  },
  loadingBox: {
    backgroundColor: '#fff',
    padding: 24,
    borderRadius: 16,
    minWidth: 220,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 8,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    fontWeight: '600',
    color: '#1976d2',
  },
  // PDF Modal Styles
  pdfModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  pdfModalContent: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    width: '100%',
    maxWidth: 500,
    maxHeight: '90%',
  },
  pdfModalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#333',
    textAlign: 'center',
    marginBottom: 4,
  },
  pdfModalSubtitle: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 16,
  },
  pdfPreviewContainer: {
    width: '100%',
    height: 350,
    backgroundColor: '#525659',
    borderRadius: 8,
    overflow: 'hidden',
  },
  pdfNavigation: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 12,
    gap: 16,
  },
  pdfNavButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1976d2',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    gap: 4,
  },
  pdfNavButtonDisabled: {
    opacity: 0.4,
  },
  pdfNavButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  pdfPageIndicator: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  pdfActionButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 16,
    gap: 12,
  },
  pdfActionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 8,
    gap: 8,
  },
  pdfCancelButton: {
    backgroundColor: '#757575',
  },
  pdfConfirmButton: {
    backgroundColor: '#4CAF50',
  },
  pdfActionButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});

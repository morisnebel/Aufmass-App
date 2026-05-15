// Wrapper for PDF to image conversion
// Uses react-native-pdf-thumbnail native module
import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';

interface ThumbnailResult {
  uri: string;
  width: number;
  height: number;
}

interface GenerateOptions {
  quality?: number;
}

const PdfThumbnail = {
  generate: async (filePath: string, page: number = 0, options?: GenerateOptions): Promise<ThumbnailResult> => {
    console.log('[PdfThumbnail] Starting PDF conversion for:', filePath, 'Platform:', Platform.OS);
    
    // Web wird nicht unterstützt
    if (Platform.OS === 'web') {
      throw new Error('PDF thumbnail generation not supported on web platform');
    }
    
    // Versuche verschiedene Methoden
    const errors: string[] = [];
    
    // Methode 1: react-native-pdf-thumbnail direkt
    try {
      console.log('[PdfThumbnail] Trying react-native-pdf-thumbnail...');
      const RealPdfThumbnail = require('react-native-pdf-thumbnail').default;
      
      if (RealPdfThumbnail && RealPdfThumbnail.generate) {
        // Stelle sicher dass der Pfad korrekt ist für Android
        let adjustedPath = filePath;
        
        // Android: file:// Prefix hinzufügen wenn nötig
        if (Platform.OS === 'android') {
          if (!filePath.startsWith('file://') && !filePath.startsWith('content://')) {
            adjustedPath = 'file://' + filePath;
          }
        }
        
        console.log('[PdfThumbnail] Using path:', adjustedPath);
        const result = await RealPdfThumbnail.generate(adjustedPath, page);
        console.log('[PdfThumbnail] Result:', result);
        
        if (result && result.uri) {
          return {
            uri: result.uri,
            width: result.width || 800,
            height: result.height || 1000,
          };
        }
        throw new Error('Result was empty');
      }
      throw new Error('Module not available');
    } catch (e: any) {
      console.log('[PdfThumbnail] Method 1 failed:', e.message);
      errors.push(`direct: ${e.message}`);
    }
    
    // Methode 2: Kopiere PDF zu temporärem Cache-Ort und versuche erneut
    try {
      console.log('[PdfThumbnail] Trying with cached copy...');
      const fileName = 'temp_pdf_' + Date.now() + '.pdf';
      const tempPath = FileSystem.cacheDirectory + fileName;
      
      // Kopiere die Datei
      await FileSystem.copyAsync({
        from: filePath,
        to: tempPath,
      });
      console.log('[PdfThumbnail] Copied to:', tempPath);
      
      const RealPdfThumbnail = require('react-native-pdf-thumbnail').default;
      const result = await RealPdfThumbnail.generate(tempPath, page);
      
      // Cleanup
      try { await FileSystem.deleteAsync(tempPath, { idempotent: true }); } catch {}
      
      if (result && result.uri) {
        console.log('[PdfThumbnail] Cached copy method success:', result);
        return {
          uri: result.uri,
          width: result.width || 800,
          height: result.height || 1000,
        };
      }
      throw new Error('Result was empty');
    } catch (e: any) {
      console.log('[PdfThumbnail] Method 2 failed:', e.message);
      errors.push(`cached: ${e.message}`);
    }
    
    // Alle Methoden fehlgeschlagen
    const errorMsg = `PDF conversion failed on ${Platform.OS}. Errors: ${errors.join('; ')}`;
    console.error('[PdfThumbnail]', errorMsg);
    throw new Error(errorMsg);
  },
};

export default PdfThumbnail;

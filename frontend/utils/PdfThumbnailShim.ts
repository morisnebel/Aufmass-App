// Wrapper for PDF to image conversion
// Uses multiple approaches: native module (if available) + cloud fallback
import { Platform, Alert } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';

interface ThumbnailResult {
  uri: string;
  width: number;
  height: number;
}

interface GenerateOptions {
  quality?: number;
}

// Cloud-basierte PDF-zu-Bild Konvertierung (Fallback)
const convertPdfViaCloud = async (pdfBase64: string): Promise<string> => {
  // Verwende pdf.co API (kostenlose Tier verfügbar) oder ähnlichen Service
  // Für Demo-Zwecke: Gebe Fehler zurück, da kein API-Key konfiguriert
  throw new Error('Cloud PDF conversion not configured');
};

const PdfThumbnail = {
  generate: async (filePath: string, page: number = 0, options?: GenerateOptions): Promise<ThumbnailResult> => {
    console.log('[PdfThumbnail] Starting PDF conversion');
    console.log('[PdfThumbnail] File path:', filePath);
    console.log('[PdfThumbnail] Platform:', Platform.OS);
    
    // Web wird nicht unterstützt
    if (Platform.OS === 'web') {
      throw new Error('PDF thumbnail generation not supported on web platform');
    }
    
    const errors: string[] = [];
    
    // ===== METHODE 1: Native Module (react-native-pdf-thumbnail) =====
    try {
      console.log('[PdfThumbnail] Trying native module...');
      
      // Dynamischer Import um Fehler zu vermeiden wenn Modul nicht existiert
      const RealPdfThumbnail = require('react-native-pdf-thumbnail').default;
      
      if (!RealPdfThumbnail || !RealPdfThumbnail.generate) {
        throw new Error('Native module not available');
      }
      
      // Pfad anpassen für Android
      let adjustedPath = filePath;
      if (Platform.OS === 'android') {
        // Android benötigt manchmal file:// prefix
        if (!filePath.startsWith('file://') && !filePath.startsWith('content://')) {
          adjustedPath = 'file://' + filePath;
        }
        // Oder ohne prefix wenn content://
        if (filePath.startsWith('content://')) {
          adjustedPath = filePath;
        }
      }
      
      console.log('[PdfThumbnail] Calling native generate with:', adjustedPath);
      const result = await RealPdfThumbnail.generate(adjustedPath, page);
      console.log('[PdfThumbnail] Native result:', JSON.stringify(result));
      
      if (result && result.uri) {
        return {
          uri: result.uri,
          width: result.width || 800,
          height: result.height || 1000,
        };
      }
      throw new Error('Native module returned empty result');
    } catch (e: any) {
      const errorMsg = e?.message || String(e);
      console.log('[PdfThumbnail] Native module error:', errorMsg);
      errors.push(`Native: ${errorMsg}`);
    }
    
    // ===== METHODE 2: Kopiere zu Cache und versuche erneut =====
    try {
      console.log('[PdfThumbnail] Trying cache copy method...');
      
      const fileName = 'temp_pdf_' + Date.now() + '.pdf';
      const tempPath = FileSystem.cacheDirectory + fileName;
      
      // Lese Original-Datei Info
      const fileInfo = await FileSystem.getInfoAsync(filePath);
      console.log('[PdfThumbnail] Original file info:', JSON.stringify(fileInfo));
      
      if (!fileInfo.exists) {
        throw new Error('Source file does not exist');
      }
      
      // Kopiere
      await FileSystem.copyAsync({ from: filePath, to: tempPath });
      console.log('[PdfThumbnail] Copied to:', tempPath);
      
      // Versuche mit kopierter Datei
      const RealPdfThumbnail = require('react-native-pdf-thumbnail').default;
      const result = await RealPdfThumbnail.generate(tempPath, page);
      
      // Cleanup
      try { await FileSystem.deleteAsync(tempPath, { idempotent: true }); } catch {}
      
      if (result && result.uri) {
        console.log('[PdfThumbnail] Cache method success');
        return {
          uri: result.uri,
          width: result.width || 800,
          height: result.height || 1000,
        };
      }
      throw new Error('Cache method returned empty result');
    } catch (e: any) {
      const errorMsg = e?.message || String(e);
      console.log('[PdfThumbnail] Cache method error:', errorMsg);
      errors.push(`Cache: ${errorMsg}`);
    }
    
    // ===== METHODE 3: Mit file:// prefix für Android =====
    if (Platform.OS === 'android') {
      try {
        console.log('[PdfThumbnail] Trying with explicit file:// prefix...');
        
        let cleanPath = filePath;
        // Entferne eventuelles file:// prefix
        if (cleanPath.startsWith('file://')) {
          cleanPath = cleanPath.substring(7);
        }
        // Füge file:// hinzu
        const fileUriPath = 'file://' + cleanPath;
        
        console.log('[PdfThumbnail] Trying path:', fileUriPath);
        const RealPdfThumbnail = require('react-native-pdf-thumbnail').default;
        const result = await RealPdfThumbnail.generate(fileUriPath, page);
        
        if (result && result.uri) {
          console.log('[PdfThumbnail] file:// method success');
          return {
            uri: result.uri,
            width: result.width || 800,
            height: result.height || 1000,
          };
        }
      } catch (e: any) {
        const errorMsg = e?.message || String(e);
        console.log('[PdfThumbnail] file:// method error:', errorMsg);
        errors.push(`FileUri: ${errorMsg}`);
      }
    }
    
    // Alle Methoden fehlgeschlagen - zeige detaillierte Fehlermeldung
    const fullError = `PDF-Konvertierung fehlgeschlagen.\n\nTechnische Details:\n${errors.join('\n')}`;
    console.error('[PdfThumbnail] All methods failed:', fullError);
    throw new Error(fullError);
  },
};

export default PdfThumbnail;

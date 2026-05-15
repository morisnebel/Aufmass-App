// Wrapper for react-native-pdf-thumbnail
// Works in EAS builds (Development Build/Production), not in Expo Go
import { Platform } from 'react-native';

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
    // Unterstützt sowohl iOS als auch Android
    if (Platform.OS === 'ios' || Platform.OS === 'android') {
      try {
        const RealPdfThumbnail = require('react-native-pdf-thumbnail').default;
        console.log('[PdfThumbnail] Generating thumbnail for:', filePath, 'page:', page);
        
        // Android und iOS haben leicht unterschiedliche APIs
        let result;
        if (Platform.OS === 'android') {
          // Android: generate(filePath, page) - ohne options
          result = await RealPdfThumbnail.generate(filePath, page);
        } else {
          // iOS: generate(filePath, page) 
          result = await RealPdfThumbnail.generate(filePath, page);
        }
        
        console.log('[PdfThumbnail] Result:', result);
        
        if (result && result.uri) {
          return {
            uri: result.uri,
            width: result.width || 800,
            height: result.height || 1000,
          };
        }
        throw new Error('PDF thumbnail result was empty');
      } catch (error) {
        console.error('[PdfThumbnail] Generation failed:', error);
        throw error;
      }
    }
    throw new Error('PDF thumbnail generation not supported on this platform (web)');
  },
};

export default PdfThumbnail;

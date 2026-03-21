// Shim for react-native-pdf-thumbnail
// This module doesn't work on Android, so we provide a mock implementation
import { Platform } from 'react-native';

interface ThumbnailResult {
  uri: string;
  width: number;
  height: number;
}

// Mock implementation that returns null - the app handles this gracefully
const PdfThumbnail = {
  generate: async (filePath: string, page: number = 0): Promise<ThumbnailResult | null> => {
    if (Platform.OS === 'ios') {
      // On iOS, try to use the real module dynamically
      try {
        const RealPdfThumbnail = require('react-native-pdf-thumbnail').default;
        return await RealPdfThumbnail.generate(filePath, page);
      } catch (error) {
        console.log('PDF thumbnail generation not available:', error);
        return null;
      }
    }
    // On Android and Web, return null - PDF thumbnails not supported
    console.log('PDF thumbnail generation not supported on this platform');
    return null;
  },
};

export default PdfThumbnail;

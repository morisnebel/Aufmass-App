// Wrapper for react-native-pdf-thumbnail
// Works in EAS builds (TestFlight/App Store), not in Expo Go
import { Platform } from 'react-native';

interface ThumbnailResult {
  uri: string;
  width: number;
  height: number;
}

const PdfThumbnail = {
  generate: async (filePath: string, page: number = 0): Promise<ThumbnailResult> => {
    if (Platform.OS === 'ios') {
      try {
        const RealPdfThumbnail = require('react-native-pdf-thumbnail').default;
        const result = await RealPdfThumbnail.generate(filePath, page);
        if (result && result.uri) {
          return result;
        }
        throw new Error('PDF thumbnail result was empty');
      } catch (error) {
        console.error('[PdfThumbnail] Generation failed:', error);
        throw error;
      }
    }
    throw new Error('PDF thumbnail generation not supported on this platform');
  },
};

export default PdfThumbnail;

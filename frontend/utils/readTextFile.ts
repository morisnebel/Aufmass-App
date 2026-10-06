// Liest eine Textdatei zuverlässig auf allen Plattformen.
// Android liefert vom DocumentPicker teils content://-URIs, die das legacy
// readAsStringAsync ablehnt ("Unsupported scheme ... has been rejected").
// Fallback: SAF-Reader, danach Kopie in den Cache.
import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';

export async function readTextFile(uri: string): Promise<string> {
  if (Platform.OS === 'web') {
    // Web: blob:/data:-URIs über fetch lesen (expo-file-system existiert dort nicht)
    const res = await fetch(uri);
    return await res.text();
  }
  try {
    return await FileSystem.readAsStringAsync(uri, { encoding: 'utf8' as never });
  } catch (e) {
    if (!uri.startsWith('content://')) throw e;
    try {
      return await FileSystem.StorageAccessFramework.readAsStringAsync(uri, { encoding: 'utf8' as never });
    } catch {
      const dest = `${FileSystem.cacheDirectory}import_${Date.now()}.tmp`;
      await FileSystem.copyAsync({ from: uri, to: dest });
      const content = await FileSystem.readAsStringAsync(dest, { encoding: 'utf8' as never });
      FileSystem.deleteAsync(dest, { idempotent: true }).catch(() => {});
      return content;
    }
  }
}

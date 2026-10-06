// Liest eine Textdatei zuverlässig auf allen Plattformen.
// Android liefert vom DocumentPicker teils content://-URIs, die das legacy
// readAsStringAsync ablehnt ("Unsupported scheme ... has been rejected").
// Fallback: SAF-Reader, danach Kopie in den Cache.
import * as FileSystem from 'expo-file-system/legacy';

export async function readTextFile(uri: string): Promise<string> {
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

import AsyncStorage from '@react-native-async-storage/async-storage';

// Individuelle Benennung der Skizzen-Werkzeuge (Memo-Pfeil & Notiz)
// Name = erscheint in Vorschau & PDF, Kürzel = Button-Beschriftung in der Skizze
export interface SketchLabelSettings {
  pointerName: string; // Memo-Pfeil: voller Name (z.B. "Vermerk")
  pointerCode: string; // Memo-Pfeil: Kürzel (z.B. "VM")
  memoName: string;    // Notiz: voller Name (z.B. "Zusatzleistung")
  memoCode: string;    // Notiz: Kürzel (z.B. "ZL")
}

export const DEFAULT_SKETCH_LABELS: SketchLabelSettings = {
  pointerName: 'Memo',
  pointerCode: 'Memo',
  memoName: 'Notiz',
  memoCode: 'Notiz',
};

const KEY = 'sketch_label_settings';

export const getSketchLabels = async (): Promise<SketchLabelSettings> => {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        pointerName: parsed.pointerName?.trim() || DEFAULT_SKETCH_LABELS.pointerName,
        pointerCode: parsed.pointerCode?.trim() || DEFAULT_SKETCH_LABELS.pointerCode,
        memoName: parsed.memoName?.trim() || DEFAULT_SKETCH_LABELS.memoName,
        memoCode: parsed.memoCode?.trim() || DEFAULT_SKETCH_LABELS.memoCode,
      };
    }
  } catch (_) {}
  return { ...DEFAULT_SKETCH_LABELS };
};

export const saveSketchLabels = async (labels: SketchLabelSettings): Promise<void> => {
  await AsyncStorage.setItem(KEY, JSON.stringify(labels));
};

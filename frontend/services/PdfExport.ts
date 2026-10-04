// Zentrale PDF-Datei-Erzeugung (A4) mit "Seite X von Y" auf jeder Seite.
// expo-print kann keine Seitenzahlen rendern (WebKit unterstützt keine @page-Margin-Boxen),
// daher wird das fertige PDF mit pdf-lib nachbearbeitet.
import * as Print from 'expo-print';
// Metro löst beim ES-Build von pdf-lib die tslib-Interop falsch auf ("__extends of tslib.default"),
// daher explizit den CJS-Build laden.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib/cjs') as typeof import('pdf-lib');
import { cacheDirectory, documentDirectory, writeAsStringAsync } from 'expo-file-system/legacy';

export async function addPageNumbersToPdfBase64(base64: string): Promise<string> {
  const doc = await PDFDocument.load(base64);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const pages = doc.getPages();
  const total = pages.length;
  pages.forEach((page, i) => {
    const { width } = page.getSize();
    const label = `Seite ${i + 1} von ${total}`;
    const size = 8;
    const textWidth = font.widthOfTextAtSize(label, size);
    page.drawText(label, {
      x: (width - textWidth) / 2,
      y: 14,
      size,
      font,
      color: rgb(0.45, 0.45, 0.45),
    });
  });
  return doc.saveAsBase64();
}

export interface CreatePdfOptions {
  margins?: { left: number; top: number; right: number; bottom: number };
}

// Erzeugt ein A4-PDF aus HTML inkl. Seitenzahlen; gibt die file://-URI zurück.
// Fällt bei Fehlern in der Nachbearbeitung auf das Original-PDF zurück.
export async function createPdfFile(html: string, opts: CreatePdfOptions = {}): Promise<string> {
  const { uri, base64 } = await Print.printToFileAsync({
    html,
    base64: true,
    width: 595,
    height: 842,
    ...(opts.margins ? { margins: opts.margins } : {}),
  });
  if (!base64) return uri;
  try {
    const numbered = await addPageNumbersToPdfBase64(base64);
    const dir = cacheDirectory || documentDirectory || '';
    const outUri = `${dir}aufmass_pdf_${Date.now()}.pdf`;
    await writeAsStringAsync(outUri, numbered, { encoding: 'base64' });
    return outUri;
  } catch (e) {
    console.error('Seitenzahlen konnten nicht hinzugefügt werden, nutze Original-PDF:', e);
    return uri;
  }
}

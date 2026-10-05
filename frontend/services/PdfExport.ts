// Zentrale PDF-Datei-Erzeugung (A4) mit "Seite X von Y" auf jeder Seite.
// expo-print kann keine Seitenzahlen rendern (WebKit unterstützt keine @page-Margin-Boxen),
// daher wird das fertige PDF mit pdf-lib nachbearbeitet.
import * as Print from 'expo-print';
import { Platform } from 'react-native';
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

// iOS-Druck-Fix: Der iOS-Print-Formatter layoutet das HTML mit der Druckbereichs-Breite in
// Punkten (595pt - Ränder = 523px Layout-Breite), die Vorschau ist aber für 210mm (794px,
// .page-Innenbreite 680px) designt. Dadurch wirken alle Schriften ~50% zu groß und der
// Header überlappt. Lösung: per CSS-Zoom das Layout auf eine Design-Breite von 770px
// aufspannen (770px - 24mm .page-Padding = 680px Inhalt, exakt wie die Vorschau).
// Zusätzlich iOS-Text-Autosizing (Font-Boosting) deaktivieren.
const PRINT_DESIGN_WIDTH = 770;

function prepareHtmlForPrint(html: string, margins: { left: number; right: number }): string {
  const printableWidth = 595 - margins.left - margins.right;
  const zoom = printableWidth / PRINT_DESIGN_WIDTH;
  const printFixStyle = `
  <style>
    html, body {
      -webkit-text-size-adjust: 100% !important;
      text-size-adjust: 100% !important;
    }
    ${Platform.OS === 'ios' ? `
    body {
      zoom: ${zoom.toFixed(4)} !important;
    }` : ''}
  </style>
`;
  if (html.includes('</head>')) {
    return html.replace('</head>', `${printFixStyle}</head>`);
  }
  return `${printFixStyle}${html}`;
}

// Erzeugt ein A4-PDF aus HTML inkl. Seitenzahlen; gibt die file://-URI zurück.
// Fällt bei Fehlern in der Nachbearbeitung auf das Original-PDF zurück.
// WICHTIG: iOS ignoriert CSS @page-Margins -> native Seitenränder setzen (gelten für ALLE Seiten,
// sonst starten Fotos/Skizzen auf Folgeseiten direkt am Blattrand). 36pt ≈ 12,7mm.
export async function createPdfFile(html: string, opts: CreatePdfOptions = {}): Promise<string> {
  const margins = opts.margins ?? { left: 36, top: 36, right: 36, bottom: 36 };
  const { uri, base64 } = await Print.printToFileAsync({
    html: prepareHtmlForPrint(html, margins),
    base64: true,
    width: 595,
    height: 842,
    margins,
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

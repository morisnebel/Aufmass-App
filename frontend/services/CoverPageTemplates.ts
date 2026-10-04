// Deckblatt-Vorlagen für das Projekt-PDF (A4-optimiert)
// Wichtig: Alle Layouts nutzen eine feste Seitenhöhe (255mm) mit overflow:hidden,
// damit das Deckblatt garantiert auf EINE A4-Seite passt (expo-print, @page margin 15mm).

export type CoverStyle = 'classic' | 'modern' | 'minimal';

export const COVER_STYLE_OPTIONS: { key: CoverStyle; label: string }[] = [
  { key: 'classic', label: 'Klassisch' },
  { key: 'modern', label: 'Modern' },
  { key: 'minimal', label: 'Minimal' },
];

export interface CoverPageOptions {
  style: CoverStyle;
  projectName: string;
  projectNumber?: string;
  statusLabel?: string;
  subtitle?: string;
  customerName: string;
  addressLine?: string;
  dateLabel: string;
  accentColor: string;
  accentTextColor: string;
  companyLogo?: string | null;
  companyName?: string;
  companyStreet?: string;
  companyZipCity?: string;
  companyPhone?: string;
  companyEmail?: string;
  coverImage?: string | null;
}

const esc = (s: unknown): string =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

// Seiten-Container: fließendes Layout OHNE feste Höhe.
// WICHTIG: iOS rendert CSS-mm im Druck nicht verlässlich (mm/pt/px-Interpretation variiert je Gerät),
// feste Seitenhöhen + absolute Fußzeilen liefen daher auf Seite 2 über.
// Lösung: Inhalt bewusst kompakt halten (< 1 Seite in jeder Interpretation), Seite endet per page-break.
const PAGE_OPEN = `<div style="width: 100%; page-break-after: always;">`;
const PAGE_CLOSE = `</div>`;

// Logo-Grössen NUR in px mit max-width/max-height begrenzen:
// mm-Masse und object-fit auf <img> werden vom iOS-Druck ignoriert (Logo wurde abgeschnitten).
// Dieses px-Muster entspricht dem bewährten .company-logo im Hauptdokument.
function logoHtml(logo: string | null | undefined, maxHeightPx: number): string {
  if (!logo) return '';
  return `<img src="${logo}" style="max-height: ${maxHeightPx}px; max-width: 220px; width: auto; height: auto;" />`;
}

function companyBlockHtml(o: CoverPageOptions): string {
  const lines: string[] = [];
  if (o.companyName) lines.push(`<strong style="font-size: 11pt; color: #333;">${esc(o.companyName)}</strong>`);
  if (o.companyStreet) lines.push(esc(o.companyStreet));
  if (o.companyZipCity) lines.push(esc(o.companyZipCity));
  if (o.companyPhone) lines.push(`Tel. ${esc(o.companyPhone)}`);
  if (o.companyEmail) lines.push(esc(o.companyEmail));
  return lines.join('<br/>');
}

function coverImageHtml(o: CoverPageOptions, maxHeightMm: number, radius = 10): string {
  if (!o.coverImage) return '';
  return `<div style="text-align: center; margin-top: 8mm; height: ${maxHeightMm}mm; overflow: hidden;">
    <img src="${o.coverImage}" style="max-width: 100%; max-height: ${maxHeightMm}mm; width: auto; height: auto; object-fit: contain; border-radius: ${radius}px;" />
  </div>`;
}

function metaLine(o: CoverPageOptions): string {
  const parts: string[] = [];
  if (o.projectNumber) parts.push(`Projekt-Nr. ${esc(o.projectNumber)}`);
  if (o.statusLabel) parts.push(esc(o.statusLabel));
  return parts.join(' &nbsp;&middot;&nbsp; ');
}

// ===== Vorlage: Klassisch (zentriert, Akzentlinie) =====
function classicTemplate(o: CoverPageOptions): string {
  return `${PAGE_OPEN}
    <table style="width: 100%; border-collapse: collapse;"><tr>
      <td style="vertical-align: top; width: 50%;">${logoHtml(o.companyLogo, 64)}</td>
      <td style="vertical-align: top; width: 50%; text-align: right; font-size: 9pt; color: #555; line-height: 1.5;">
        ${companyBlockHtml(o)}
      </td>
    </tr></table>
    <div style="margin-top: 8mm; text-align: center;">
      <div style="font-size: 10pt; letter-spacing: 4px; color: ${o.accentColor}; text-transform: uppercase; font-weight: 600;">Aufmass-Dokumentation</div>
      <div style="font-size: 26pt; font-weight: 800; color: #222; margin-top: 6px;">${esc(o.projectName)}</div>
      ${o.subtitle ? `<div style="font-size: 13pt; color: #555; font-style: italic; margin-top: 4px;">${esc(o.subtitle)}</div>` : ''}
      ${metaLine(o) ? `<div style="font-size: 11pt; color: #666; margin-top: 6px;">${metaLine(o)}</div>` : ''}
      <div style="width: 70px; height: 4px; background: ${o.accentColor}; margin: 12px auto 0 auto; border-radius: 2px;"></div>
    </div>
    ${coverImageHtml(o, 70)}
    <div style="margin-top: 8mm; border-top: 2px solid ${o.accentColor}; padding-top: 8px; page-break-inside: avoid;">
      <table style="width: 100%; border-collapse: collapse; font-size: 10pt; color: #444;"><tr>
        <td style="vertical-align: bottom; line-height: 1.6;">
          <strong style="color: ${o.accentColor}; font-size: 8pt; letter-spacing: 1px;">KUNDE</strong><br/>
          ${esc(o.customerName)}${o.addressLine ? `<br/>${esc(o.addressLine)}` : ''}
        </td>
        <td style="vertical-align: bottom; text-align: right; line-height: 1.6;">
          <strong style="color: ${o.accentColor}; font-size: 8pt; letter-spacing: 1px;">DATUM</strong><br/>
          ${esc(o.dateLabel)}
        </td>
      </tr></table>
    </div>
  ${PAGE_CLOSE}`;
}

// ===== Vorlage: Modern (Farbband, linksbündig) =====
function modernTemplate(o: CoverPageOptions): string {
  return `${PAGE_OPEN}
    <div style="background: ${o.accentColor}; border-radius: 12px; padding: 6mm 7mm; color: ${o.accentTextColor};">
      <table style="width: 100%; border-collapse: collapse;"><tr>
        <td style="vertical-align: top;">
          <div style="font-size: 9pt; letter-spacing: 3px; text-transform: uppercase; font-weight: 600; opacity: 0.85;">Aufmass-Dokumentation</div>
          <div style="font-size: 24pt; font-weight: 800; margin-top: 5px;">${esc(o.projectName)}</div>
          ${o.subtitle ? `<div style="font-size: 12pt; font-style: italic; margin-top: 4px; opacity: 0.9;">${esc(o.subtitle)}</div>` : ''}
        </td>
        ${o.companyLogo ? `<td style="vertical-align: top; text-align: right; width: 40mm;">
          <div style="display: inline-block; background: #ffffff; border-radius: 8px; padding: 2mm;">
            <img src="${o.companyLogo}" style="max-height: 48px; max-width: 128px; width: auto; height: auto;" />
          </div>
        </td>` : ''}
      </tr></table>
    </div>
    <table style="width: 100%; border-collapse: collapse; margin-top: 5mm; font-size: 10pt; color: #555;"><tr>
      <td>${metaLine(o)}</td>
      <td style="text-align: right;">${esc(o.dateLabel)}</td>
    </tr></table>
    ${coverImageHtml(o, 70, 12)}
    <div style="margin-top: 8mm; page-break-inside: avoid;">
      <table style="width: 100%; border-collapse: separate; border-spacing: 6px 0;"><tr>
        <td style="width: 60%; background: #f5f7fa; border-left: 4px solid ${o.accentColor}; border-radius: 6px; padding: 10px 12px; font-size: 10pt; color: #444; line-height: 1.6; vertical-align: top;">
          <strong style="color: ${o.accentColor}; font-size: 8pt; letter-spacing: 1px;">KUNDE</strong><br/>
          ${esc(o.customerName)}${o.addressLine ? `<br/>${esc(o.addressLine)}` : ''}
        </td>
        <td style="background: #f5f7fa; border-left: 4px solid ${o.accentColor}; border-radius: 6px; padding: 10px 12px; font-size: 10pt; color: #444; line-height: 1.6; vertical-align: top;">
          <strong style="color: ${o.accentColor}; font-size: 8pt; letter-spacing: 1px;">ERSTELLT VON</strong><br/>
          ${esc(o.companyName || '-')}${o.companyZipCity ? `<br/>${esc(o.companyZipCity)}` : ''}${o.companyPhone ? `<br/>Tel. ${esc(o.companyPhone)}` : ''}${o.companyEmail ? `<br/>${esc(o.companyEmail)}` : ''}
        </td>
      </tr></table>
    </div>
  ${PAGE_CLOSE}`;
}

// ===== Vorlage: Minimal (dezent, feine Linien) =====
function minimalTemplate(o: CoverPageOptions): string {
  return `${PAGE_OPEN}
    <table style="width: 100%; border-collapse: collapse; border-bottom: 1px solid #ddd;"><tr>
      <td style="vertical-align: bottom; padding-bottom: 8px;">${o.companyLogo ? logoHtml(o.companyLogo, 45) : `<span style="font-size: 10pt; color: #333; font-weight: 600;">${esc(o.companyName || '')}</span>`}</td>
      <td style="vertical-align: bottom; text-align: right; font-size: 9pt; color: #888; padding-bottom: 8px;">${esc(o.dateLabel)}</td>
    </tr></table>
    <div style="margin-top: 16mm;">
      <div style="font-size: 9pt; letter-spacing: 3px; color: #999; text-transform: uppercase;">Aufmass-Dokumentation</div>
      <div style="font-size: 24pt; font-weight: 700; color: #111; margin-top: 6px;">${esc(o.projectName)}</div>
      ${o.subtitle ? `<div style="font-size: 12pt; color: #777; font-style: italic; margin-top: 4px;">${esc(o.subtitle)}</div>` : ''}
      ${metaLine(o) ? `<div style="font-size: 10pt; color: #888; margin-top: 8px;">${metaLine(o)}</div>` : ''}
      <div style="width: 40px; height: 2px; background: #111; margin-top: 12px;"></div>
    </div>
    ${coverImageHtml(o, 72, 4)}
    <div style="margin-top: 10mm; border-top: 1px solid #ddd; padding-top: 8px; page-break-inside: avoid;">
      <table style="width: 100%; border-collapse: collapse; font-size: 9pt; color: #555;"><tr>
        <td style="line-height: 1.6;">${esc(o.customerName)}${o.addressLine ? ` &middot; ${esc(o.addressLine)}` : ''}</td>
        <td style="text-align: right; color: #999; line-height: 1.6;">${[o.companyName, o.companyPhone ? `Tel. ${o.companyPhone}` : '', o.companyEmail].filter(Boolean).map(esc).join(' &middot; ')}</td>
      </tr></table>
    </div>
  ${PAGE_CLOSE}`;
}

export function buildCoverPageHtml(o: CoverPageOptions): string {
  switch (o.style) {
    case 'modern':
      return modernTemplate(o);
    case 'minimal':
      return minimalTemplate(o);
    default:
      return classicTemplate(o);
  }
}

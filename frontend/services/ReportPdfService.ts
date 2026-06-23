/**
 * Reports PDF Service
 * Generiert das HTML für einen Rapport-PDF und stellt einen Generator bereit,
 * der auch in das Gesamt-Projekt-PDF eingebunden werden kann.
 */
import { Report, Project, Customer } from './LocalStorage';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { getAppName } from './FeatureFlags';

const escapeHtml = (text: string | undefined | null): string => {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
};

const formatDate = (iso: string | undefined): string => {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString('de-DE');
  } catch {
    return iso;
  }
};

const weatherIcons: Record<string, string> = {
  sunny: '☀️ Sonnig',
  cloudy: '☁️ Bewölkt',
  rain: '🌧️ Regen',
  snow: '🌨️ Schnee',
  wind: '💨 Wind',
  fog: '🌫️ Nebel',
};

/**
 * Erzeugt einen SVG für eine Unterschrift (aus Pfad-String "M..L..|M..L..").
 */
const renderSignatureSvg = (paths: string | undefined, width = 280, height = 90): string => {
  if (!paths) {
    return `<div style="width:${width}px;height:${height}px;border-bottom:1px solid #999;display:flex;align-items:flex-end;justify-content:center;color:#bbb;font-size:11px;padding-bottom:4px;">(keine Unterschrift)</div>`;
  }
  const splitPaths = paths.split('|').filter(Boolean);
  const svgPaths = splitPaths
    .map((d) => `<path d="${d}" stroke="#1a237e" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`)
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 320 180" preserveAspectRatio="xMidYMid meet" style="border-bottom:1px solid #999;">${svgPaths}</svg>`;
};

/**
 * Berechnet die Gesamtstunden aus von/bis (HH:MM).
 */
export const calcHoursFromTimes = (from?: string, to?: string): number => {
  if (!from || !to) return 0;
  const [fh, fm] = from.split(':').map(Number);
  const [th, tm] = to.split(':').map(Number);
  if (isNaN(fh) || isNaN(fm) || isNaN(th) || isNaN(tm)) return 0;
  let mins = (th * 60 + tm) - (fh * 60 + fm);
  if (mins < 0) mins += 24 * 60;
  return Math.round((mins / 60) * 100) / 100;
};

/**
 * Erzeugt das HTML eines einzelnen Rapports (zur Einbettung im Gesamt-PDF
 * oder als Standalone-Dokument).
 */
export const generateReportSectionHtml = (
  report: Report,
  project: Project | null,
  customer: Customer | null,
  options: { standalone?: boolean } = {}
): string => {
  const totalHours = report.total_hours ?? calcHoursFromTimes(report.time_from, report.time_to);
  const employeesList = report.employees && report.employees.length > 0
    ? report.employees.map(e => {
        const h = e.hours ? ` <span style="color:#666;">(${e.hours} Std.)</span>` : '';
        return `<li>${escapeHtml(e.name)}${h}</li>`;
      }).join('')
    : '<li style="color:#999;font-style:italic;">Keine Mitarbeiter angegeben</li>';

  const materialsRows = report.materials && report.materials.length > 0
    ? report.materials.map(m =>
        `<tr><td>${escapeHtml(m.name)}</td><td style="text-align:right;">${m.quantity}</td><td>${escapeHtml(m.unit)}</td><td>${escapeHtml(m.note || '')}</td></tr>`
      ).join('')
    : '';

  const photosHtml = report.photos && report.photos.length > 0
    ? `<div class="section">
         <div class="section-title">📷 Fotos</div>
         <div class="photo-grid">
           ${report.photos.map(p => `
             <div class="photo-item">
               <img src="${p.uri}" />
               ${p.caption ? `<div class="photo-caption">${escapeHtml(p.caption)}</div>` : ''}
             </div>
           `).join('')}
         </div>
       </div>`
    : '';

  const weatherText = report.weather && weatherIcons[report.weather] ? weatherIcons[report.weather] : '';
  const tempText = report.temperature != null ? `${report.temperature}°C` : '';

  const p = project as any;
  const bauherrName = project ? [project.bauherr_salutation, p?.bauherr_first_name || p?.bauherr_firstName, p?.bauherr_last_name || p?.bauherr_lastName].filter(Boolean).join(' ').trim() || project.bauherr_name || '' : '';
  const bauherrAddr = project ? [project.bauherr_street, [(p?.bauherr_plz || p?.bauherr_zip), project.bauherr_city].filter(Boolean).join(' ')].filter(Boolean).join(', ') : '';
  const objektAddr = project ? [project.objekt_street, [project.objekt_plz, project.objekt_city].filter(Boolean).join(' ')].filter(Boolean).join(', ') : '';

  return `
    <div class="report-page">
      <div class="report-header">
        <div>
          <div class="report-title">📝 RAPPORT / TAGESBERICHT</div>
          ${report.report_number ? `<div class="report-number">${escapeHtml(report.report_number)}</div>` : ''}
        </div>
        <div class="report-meta">
          <div><b>Datum:</b> ${formatDate(report.date)}</div>
          ${report.time_from || report.time_to ? `<div><b>Zeit:</b> ${escapeHtml(report.time_from || '')} – ${escapeHtml(report.time_to || '')}</div>` : ''}
          ${totalHours > 0 ? `<div><b>Stunden:</b> ${totalHours}</div>` : ''}
        </div>
      </div>

      ${project ? `
        <div class="info-box">
          <div class="info-box-title">Projekt</div>
          <div class="info-row"><b>Projekt:</b> ${escapeHtml(project.name)}${project.project_number ? ' (' + escapeHtml(project.project_number) + ')' : ''}</div>
          ${project.project_type ? `<div class="info-row"><b>Projektart:</b> ${escapeHtml(project.project_type)}</div>` : ''}
          ${bauherrName ? `<div class="info-row"><b>Bauherr:</b> ${escapeHtml(bauherrName)}</div>` : ''}
          ${bauherrAddr ? `<div class="info-row"><b>Adresse:</b> ${escapeHtml(bauherrAddr)}</div>` : ''}
          ${objektAddr ? `<div class="info-row"><b>Objekt:</b> ${escapeHtml(objektAddr)}</div>` : ''}
        </div>
      ` : ''}

      <div class="section">
        <div class="section-title">👷 Mitarbeiter vor Ort</div>
        <ul class="employees-list">${employeesList}</ul>
      </div>

      <div class="section">
        <div class="section-title">🛠️ Ausgeführte Arbeiten</div>
        <div class="work-desc">${escapeHtml(report.work_description) || '<span style="color:#999;font-style:italic;">Keine Angaben</span>'}</div>
      </div>

      ${materialsRows ? `
        <div class="section">
          <div class="section-title">🧱 Verwendetes Material</div>
          <table class="material-table">
            <thead><tr><th>Material</th><th style="text-align:right;">Menge</th><th>Einheit</th><th>Bemerkung</th></tr></thead>
            <tbody>${materialsRows}</tbody>
          </table>
        </div>
      ` : ''}

      <div class="section info-grid">
        ${(report.travel_km != null || report.travel_time != null) ? `
          <div class="info-mini">
            <div class="info-mini-label">🚗 Anfahrt</div>
            <div class="info-mini-value">
              ${report.travel_km != null ? `${report.travel_km} km` : ''}
              ${report.travel_km != null && report.travel_time != null ? ' · ' : ''}
              ${report.travel_time != null ? `${report.travel_time} Min.` : ''}
            </div>
          </div>
        ` : ''}
        ${(weatherText || tempText) ? `
          <div class="info-mini">
            <div class="info-mini-label">🌦️ Wetter</div>
            <div class="info-mini-value">${weatherText}${weatherText && tempText ? ' · ' : ''}${tempText}</div>
          </div>
        ` : ''}
      </div>

      ${report.remarks ? `
        <div class="section">
          <div class="section-title">📝 Bemerkungen</div>
          <div class="work-desc">${escapeHtml(report.remarks)}</div>
        </div>
      ` : ''}

      ${photosHtml}

      <div class="signatures">
        <div class="signature-block">
          <div class="signature-area">
            ${renderSignatureSvg(report.signature_customer)}
          </div>
          <div class="signature-label">
            <b>Kunde / Auftraggeber</b>
            ${report.signature_customer_name ? `<div>${escapeHtml(report.signature_customer_name)}</div>` : ''}
          </div>
        </div>
        <div class="signature-block">
          <div class="signature-area">
            ${renderSignatureSvg(report.signature_worker)}
          </div>
          <div class="signature-label">
            <b>Handwerker / Auftragnehmer</b>
            ${report.signature_worker_name ? `<div>${escapeHtml(report.signature_worker_name)}</div>` : ''}
          </div>
        </div>
      </div>
    </div>
  `;
};

export const REPORT_CSS = `
  .report-page {
    background: #fff;
    padding: 8px 0 16px 0;
    page-break-after: always;
  }
  .report-page:last-child { page-break-after: auto; }
  .report-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    border-bottom: 2px solid #1976d2;
    padding-bottom: 8px;
    margin-bottom: 12px;
  }
  .report-title { font-size: 18px; font-weight: bold; color: #1976d2; }
  .report-number { font-size: 12px; color: #666; margin-top: 2px; }
  .report-meta { font-size: 12px; text-align: right; line-height: 1.5; }
  .info-box {
    background: #f5f7fa;
    border-left: 4px solid #1976d2;
    padding: 8px 12px;
    margin-bottom: 12px;
    border-radius: 4px;
  }
  .info-box-title { font-weight: bold; color: #1976d2; margin-bottom: 4px; font-size: 12px; }
  .info-row { font-size: 11px; margin: 2px 0; }
  .section { margin-bottom: 12px; }
  .section-title {
    font-size: 13px;
    font-weight: bold;
    color: #333;
    background: #e3f2fd;
    padding: 5px 10px;
    border-radius: 4px;
    margin-bottom: 6px;
  }
  .employees-list { margin: 4px 0 0 18px; font-size: 12px; }
  .employees-list li { margin: 2px 0; }
  .work-desc {
    font-size: 12px;
    line-height: 1.5;
    padding: 6px 10px;
    background: #fafafa;
    border-radius: 4px;
    white-space: pre-wrap;
    border: 1px solid #e0e0e0;
  }
  .material-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 11px;
    margin-top: 4px;
  }
  .material-table th { background: #1976d2; color: #fff; padding: 5px 8px; text-align: left; }
  .material-table td { padding: 4px 8px; border-bottom: 1px solid #e0e0e0; }
  .info-grid { display: flex; gap: 12px; flex-wrap: wrap; }
  .info-mini {
    flex: 1;
    min-width: 140px;
    padding: 6px 10px;
    background: #fff8e1;
    border-radius: 4px;
    border-left: 3px solid #ffa000;
  }
  .info-mini-label { font-size: 10px; color: #888; }
  .info-mini-value { font-size: 12px; font-weight: 600; color: #333; }
  .photo-grid { display: flex; flex-wrap: wrap; gap: 8px; }
  .photo-item {
    width: 30%;
    border: 1px solid #ccc;
    border-radius: 4px;
    overflow: hidden;
  }
  .photo-item img { width: 100%; height: 120px; object-fit: cover; display: block; }
  .photo-caption { font-size: 9px; padding: 3px; background: #f5f5f5; }
  .signatures {
    display: flex;
    justify-content: space-between;
    gap: 16px;
    margin-top: 18px;
    page-break-inside: avoid;
  }
  .signature-block { flex: 1; text-align: center; }
  .signature-area { background: #fafafa; border-radius: 4px; min-height: 90px; display: flex; align-items: center; justify-content: center; }
  .signature-label { font-size: 11px; margin-top: 4px; color: #333; }
`;

/**
 * Generiert das vollständige HTML eines Standalone-Rapport-PDFs.
 */
export const generateReportHtml = (
  report: Report,
  project: Project | null,
  customer: Customer | null
): string => {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; margin: 0; padding: 20px; color: #333; }
        ${REPORT_CSS}
        .doc-footer { margin-top: 24px; padding-top: 8px; border-top: 1px solid #e0e0e0; font-size: 10px; color: #999; text-align: center; }
      </style>
    </head>
    <body>
      ${generateReportSectionHtml(report, project, customer, { standalone: true })}
      <div class="doc-footer">Erstellt mit ${escapeHtml(getAppName())} · ${new Date().toLocaleDateString('de-DE')}</div>
    </body>
    </html>
  `;
};

/**
 * Erzeugt und teilt eine PDF-Datei für einen einzelnen Rapport.
 */
export const exportReportAsPdf = async (
  report: Report,
  project: Project | null,
  customer: Customer | null
): Promise<void> => {
  const html = generateReportHtml(report, project, customer);
  const { uri } = await Print.printToFileAsync({
    html,
    base64: false,
  });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, {
      mimeType: 'application/pdf',
      dialogTitle: report.report_number ? `Rapport ${report.report_number}` : 'Rapport',
      UTI: 'com.adobe.pdf',
    });
  }
};

/**
 * Reports PDF Service
 * Generiert das HTML für einen Rapport-PDF und stellt einen Generator bereit,
 * der auch in das Gesamt-Projekt-PDF eingebunden werden kann.
 */
import { Report, Project, Customer, SettingsService } from './LocalStorage';
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
 * Berechnet automatisch die Bounding-Box der Punkte und nutzt
 * vector-effect="non-scaling-stroke" damit die Striche unabhängig von der
 * Skalierung immer gut sichtbar bleiben.
 */
const renderSignatureSvg = (paths: string | undefined, width = 280, height = 100): string => {
  if (!paths) {
    return `<div style="width:100%;height:${height}px;border-bottom:1.5px solid #333;display:flex;align-items:flex-end;justify-content:center;color:#bbb;font-size:11px;padding-bottom:4px;">(keine Unterschrift)</div>`;
  }
  const splitPaths = paths.split('|').filter(Boolean);

  // Bounding-Box aller Punkte berechnen
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  const coordRegex = /[ML]?\s*([\d.]+)\s*,\s*([\d.]+)/g;
  splitPaths.forEach((d) => {
    let m: RegExpExecArray | null;
    coordRegex.lastIndex = 0;
    while ((m = coordRegex.exec(d)) !== null) {
      const x = parseFloat(m[1]);
      const y = parseFloat(m[2]);
      if (!isNaN(x) && !isNaN(y)) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  });

  if (!isFinite(minX) || !isFinite(maxX) || !isFinite(minY) || !isFinite(maxY)) {
    return `<div style="width:100%;height:${height}px;border-bottom:1.5px solid #333;display:flex;align-items:flex-end;justify-content:center;color:#bbb;font-size:11px;padding-bottom:4px;">(keine Unterschrift)</div>`;
  }

  // Minimale Bounding-Box ein bisschen größer machen für saubere Darstellung
  const padding = 6;
  const sigWidth = Math.max(40, (maxX - minX) + padding * 2);
  const sigHeight = Math.max(40, (maxY - minY) + padding * 2);
  const vbX = minX - padding;
  const vbY = minY - padding;

  // Aspect ratio: signature breit vs hoch
  const sigRatio = sigWidth / sigHeight;
  // Anzeige-Container: 100% width, fixed height
  // Wenn signature sehr breit ist (z.B. 4:1), wird sie skaliert dass sie passt
  // Wenn signature kompakter ist, sollte sie schön zentriert sein

  const svgPaths = splitPaths
    .map((d) => `<path d="${d}" stroke="#0f172a" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>`)
    .join('');

  // preserveAspectRatio xMidYMax: zentriert horizontal, unten ausgerichtet (Unterschrift sitzt auf Linie)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="${height}" viewBox="${vbX} ${vbY} ${sigWidth} ${sigHeight}" preserveAspectRatio="xMidYMax meet" style="display:block;border-bottom:1.5px solid #333;" data-ratio="${sigRatio.toFixed(2)}">${svgPaths}</svg>`;
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
  // Mitarbeiter-Tabelle mit Datum, Funktion, Beginn/Ende/Pause/Stunden
  const employeesTable = report.employees && report.employees.length > 0
    ? `<table class="emp-table">
        <thead>
          <tr>
            <th>Datum</th>
            <th>Mitarbeiter</th>
            <th>Funktion</th>
            <th>Beginn</th>
            <th>Ende</th>
            <th>Pause</th>
            <th style="text-align:right;">Stunden</th>
          </tr>
        </thead>
        <tbody>
          ${report.employees.map(e => {
            const empAny = e as any;
            const calc = (() => {
              if (e.hours != null) return e.hours;
              if (!empAny.time_from || !empAny.time_to) return 0;
              const [fh, fm] = empAny.time_from.split(':').map(Number);
              const [th, tm] = empAny.time_to.split(':').map(Number);
              let mins = (th * 60 + tm) - (fh * 60 + fm);
              if (mins < 0) mins += 24 * 60;
              mins -= empAny.pause_minutes || 0;
              return Math.max(0, Math.round((mins / 60) * 100) / 100);
            })();
            const empDate = empAny.entry_date || report.date;
            return `<tr>
              <td style="font-size:10px;">${formatDate(empDate)}</td>
              <td style="font-weight:600;">${escapeHtml(e.name)}</td>
              <td style="color:#64748b;font-size:10px;">${escapeHtml(empAny.role || '')}</td>
              <td style="text-align:center;">${escapeHtml(empAny.time_from || '–')}</td>
              <td style="text-align:center;">${escapeHtml(empAny.time_to || '–')}</td>
              <td style="text-align:center;">${empAny.pause_minutes ? `${empAny.pause_minutes} min` : '–'}</td>
              <td style="text-align:right;font-weight:600;">${calc.toFixed(2)} h</td>
            </tr>`;
          }).join('')}
          <tr class="emp-total-row">
            <td colspan="6" style="text-align:right;font-weight:700;">Gesamtstunden:</td>
            <td style="text-align:right;font-weight:800;color:#1976d2;">${(report.total_hours ?? report.employees.reduce((s, e) => {
              const ea = e as any;
              if (e.hours != null) return s + e.hours;
              if (!ea.time_from || !ea.time_to) return s;
              const [fh, fm] = ea.time_from.split(':').map(Number);
              const [th, tm] = ea.time_to.split(':').map(Number);
              let mins = (th * 60 + tm) - (fh * 60 + fm);
              if (mins < 0) mins += 24 * 60;
              mins -= ea.pause_minutes || 0;
              return s + Math.max(0, Math.round((mins / 60) * 100) / 100);
            }, 0)).toFixed(2)} h</td>
          </tr>
          ${((report as any).travel_in_total_hours) ? (() => {
            // Fahrzeit aggregieren
            let travelSum = 0;
            if ((report as any).travel_per_employee_enabled) {
              (report.employees || []).forEach((e: any) => {
                travelSum += (e.travel_to_hours || 0) + (e.travel_back_hours || 0);
              });
            } else {
              travelSum = ((report as any).travel_to_hours || 0) + ((report as any).travel_back_hours || 0);
            }
            const baseHours = (report.total_hours ?? report.employees.reduce((s, e) => {
              const ea = e as any;
              if (e.hours != null) return s + e.hours;
              if (!ea.time_from || !ea.time_to) return s;
              const [fh, fm] = ea.time_from.split(':').map(Number);
              const [th, tm] = ea.time_to.split(':').map(Number);
              let mins = (th * 60 + tm) - (fh * 60 + fm);
              if (mins < 0) mins += 24 * 60;
              mins -= ea.pause_minutes || 0;
              return s + Math.max(0, Math.round((mins / 60) * 100) / 100);
            }, 0));
            if (travelSum <= 0) return '';
            return `
              <tr>
                <td colspan="6" style="text-align:right;font-size:10px;color:#0891b2;">+ Fahrzeit:</td>
                <td style="text-align:right;font-weight:600;color:#0891b2;font-size:10px;">${travelSum.toFixed(2)} h</td>
              </tr>
              <tr style="background:#ecfeff;">
                <td colspan="6" style="text-align:right;font-weight:800;color:#0e7490;">Gesamt inkl. Fahrzeit:</td>
                <td style="text-align:right;font-weight:800;color:#0e7490;">${(baseHours + travelSum).toFixed(2)} h</td>
              </tr>`;
          })() : ''}
        </tbody>
      </table>`
    : '<p style="color:#999;font-style:italic;font-size:11px;">Keine Mitarbeiter angegeben</p>';

  // Stunden pro Funktion gruppieren
  const roleMap: Record<string, { hours: number; count: number }> = {};
  (report.employees || []).forEach(e => {
    const empAny = e as any;
    const role = (empAny.role || '').trim();
    if (!role) return;
    const calc = (() => {
      if (e.hours != null) return e.hours;
      if (!empAny.time_from || !empAny.time_to) return 0;
      const [fh, fm] = empAny.time_from.split(':').map(Number);
      const [th, tm] = empAny.time_to.split(':').map(Number);
      let mins = (th * 60 + tm) - (fh * 60 + fm);
      if (mins < 0) mins += 24 * 60;
      mins -= empAny.pause_minutes || 0;
      return Math.max(0, Math.round((mins / 60) * 100) / 100);
    })();
    if (!roleMap[role]) roleMap[role] = { hours: 0, count: 0 };
    roleMap[role].hours += calc;
    roleMap[role].count += 1;
  });
  const roleSummaryHtml = Object.keys(roleMap).length > 0
    ? `<div class="role-summary">
        <div class="role-summary-title">Stunden pro Funktion</div>
        ${Object.keys(roleMap).map(role => `
          <div class="role-row">
            <span class="role-tag">${escapeHtml(role)} <span class="role-count">${roleMap[role].count}×</span></span>
            <span class="role-hours">${roleMap[role].hours.toFixed(2)} h</span>
          </div>
        `).join('')}
      </div>`
    : '';

  // Work Items (Checkbox-Liste) - automatisch 2 oder 3 Spalten je nach Anzahl
  const workItemsAny = (report as any).work_items as { id: string; text: string; checked: boolean }[] | undefined;
  const workItemsHtml = workItemsAny && workItemsAny.length > 0
    ? `<ul class="work-items${workItemsAny.length > 12 ? ' dense' : ''}">${workItemsAny.map(w => `
        <li class="${w.checked ? 'checked' : 'unchecked'}">
          <span class="check-box">${w.checked ? '☑' : '☐'}</span>
          <span class="${w.checked ? '' : 'strike'}">${escapeHtml(w.text)}</span>
        </li>`).join('')}</ul>`
    : '';

  // Maschinen / Geräte
  const machinesAny = (report as any).machines as { id: string; name: string; note?: string; hours?: number }[] | undefined;
  const machinesHtml = machinesAny && machinesAny.length > 0
    ? `<div class="machines-list">
        ${machinesAny.map(m => {
          const h = (m.hours != null && !isNaN(m.hours) && m.hours > 0)
            ? ` <strong>· ${String(m.hours).replace('.', ',')} h</strong>` : '';
          return `<span class="machine-tag">🔧 ${escapeHtml(m.name)}${h}</span>`;
        }).join('')}
       </div>`
    : '';

  const materialsRows = report.materials && report.materials.length > 0
    ? report.materials.map(m =>
        `<tr><td>${escapeHtml(m.name)}</td><td style="text-align:right;">${m.quantity}</td><td>${escapeHtml(m.unit)}</td><td>${escapeHtml(m.note || '')}</td></tr>`
      ).join('')
    : '';

  // Fotos: Tabellen-Layout für 100% zuverlässige Page-Breaks in WebKit/Chromium-Print.
  // 2 Fotos pro <tr>, wobei <tr> mit page-break-inside:avoid niemals zwischen Seiten zerrissen wird.
  let photosHtml = '';
  if (report.photos && report.photos.length > 0) {
    const rows: string[] = [];
    for (let i = 0; i < report.photos.length; i += 2) {
      const left = report.photos[i];
      const right = report.photos[i + 1];
      const cell = (p: any) => p
        ? `<td class="photo-cell">
             <div class="photo-box">
               <img src="${p.uri}" />
               ${p.caption ? `<div class="photo-caption">${escapeHtml(p.caption)}</div>` : ''}
             </div>
           </td>`
        : `<td class="photo-cell"></td>`;
      rows.push(`<tr class="photo-row">${cell(left)}${cell(right)}</tr>`);
    }
    photosHtml = `<div class="section">
         <div class="section-title">📷 Fotos</div>
         <table class="photo-table">
           <tbody>${rows.join('')}</tbody>
         </table>
       </div>`;
  }

  const weatherText = report.weather && weatherIcons[report.weather] ? weatherIcons[report.weather] : '';
  const tempText = report.temperature != null ? `${report.temperature}°C` : '';

  const p = project as any;
  const bauherrName = project ? [project.bauherr_salutation, p?.bauherr_first_name || p?.bauherr_firstName, p?.bauherr_last_name || p?.bauherr_lastName].filter(Boolean).join(' ').trim() || project.bauherr_name || '' : '';
  const bauherrAddr = project ? [project.bauherr_street, [(p?.bauherr_plz || p?.bauherr_zip), project.bauherr_city].filter(Boolean).join(' ')].filter(Boolean).join(', ') : '';
  const objektAddr = project ? [project.objekt_street, [project.objekt_plz, project.objekt_city].filter(Boolean).join(' ')].filter(Boolean).join(', ') : '';

  // ===== Konfigurierbare Briefkopf-Felder =====
  // Default: alle wichtigen Felder anzeigen wenn nichts konfiguriert ist (Abwärtskompatibilität)
  const DEFAULT_HEADER = ['customer_name','customer_address','project_name','project_address','project_number','project_type'];
  const enabledHeaderFields = (report as any).header_fields && (report as any).header_fields.length > 0
    ? (report as any).header_fields as string[]
    : DEFAULT_HEADER;
  const hfSet = new Set(enabledHeaderFields);

  // Werte aus Project/Customer ziehen
  const customerName = customer ? (customer.name || [customer.salutation, customer.firstName, customer.lastName].filter(Boolean).join(' ')) : bauherrName;
  const customerAddress = customer ? (customer.address || [customer.street, [customer.zip, customer.city].filter(Boolean).join(' ')].filter(Boolean).join(', ')) : bauherrAddr;
  const customerPhone = customer ? (customer.phone || customer.mobile || '') : (project?.bauherr_phone || project?.bauherr_mobile || '');
  const customerEmail = customer ? (customer.email || '') : (project?.bauherr_email || '');
  const projectName = project ? (project.name || '') : '';
  const projectAddress = objektAddr;
  const projectNumber = project ? (project.project_number || '') : '';
  const projectType = project ? (project.project_type || '') : '';
  const projectContact = report.contact_person || project?.objekt_contact_person || '';

  const headerRows: string[] = [];
  if (hfSet.has('customer_name') && customerName) headerRows.push(`<div class="info-row"><b>Kunde:</b> ${escapeHtml(customerName)}</div>`);
  if (hfSet.has('customer_address') && customerAddress) headerRows.push(`<div class="info-row"><b>Adresse:</b> ${escapeHtml(customerAddress)}</div>`);
  if (hfSet.has('customer_phone') && customerPhone) headerRows.push(`<div class="info-row"><b>Telefon:</b> ${escapeHtml(customerPhone)}</div>`);
  if (hfSet.has('customer_email') && customerEmail) headerRows.push(`<div class="info-row"><b>E-Mail:</b> ${escapeHtml(customerEmail)}</div>`);
  if (hfSet.has('project_name') && projectName) {
    const num = (hfSet.has('project_number') && projectNumber) ? ` (${escapeHtml(projectNumber)})` : '';
    headerRows.push(`<div class="info-row"><b>Projekt:</b> ${escapeHtml(projectName)}${num}</div>`);
  } else if (hfSet.has('project_number') && projectNumber) {
    headerRows.push(`<div class="info-row"><b>Projekt-Nr.:</b> ${escapeHtml(projectNumber)}</div>`);
  }
  if (hfSet.has('project_type') && projectType) headerRows.push(`<div class="info-row"><b>Projektart:</b> ${escapeHtml(projectType)}</div>`);
  if (hfSet.has('project_address') && projectAddress) headerRows.push(`<div class="info-row"><b>Baustelle:</b> ${escapeHtml(projectAddress)}</div>`);
  if (hfSet.has('project_contact') && projectContact) headerRows.push(`<div class="info-row"><b>Ansprechpartner:</b> ${escapeHtml(projectContact)}</div>`);

  // ===== Fahrzeiten HTML =====
  const r = report as any;
  const teamTravelHas = (r.travel_to_hours != null || r.travel_back_hours != null || r.travel_to_km != null || r.travel_back_km != null || r.travel_costs != null || r.travel_note);
  const perEmpTravelHas = r.travel_per_employee_enabled && (report.employees || []).some((e: any) => e.travel_to_hours != null || e.travel_back_hours != null || e.travel_to_km != null || e.travel_back_km != null || e.travel_costs != null);
  let travelHtml = '';
  if (perEmpTravelHas) {
    const rows = (report.employees || []).map((e: any) => {
      const hasAny = e.travel_to_hours != null || e.travel_back_hours != null || e.travel_to_km != null || e.travel_back_km != null || e.travel_costs != null;
      if (!hasAny) return '';
      const fmt = (v: any, suffix = '') => (v != null ? `${v}${suffix}` : '–');
      return `<tr>
        <td>${escapeHtml(e.name || '')}</td>
        <td style="text-align:right;">${fmt(e.travel_to_hours, ' h')}</td>
        <td style="text-align:right;">${fmt(e.travel_back_hours, ' h')}</td>
        <td style="text-align:right;">${fmt(e.travel_to_km, ' km')}</td>
        <td style="text-align:right;">${fmt(e.travel_back_km, ' km')}</td>
        <td style="text-align:right;">${e.travel_costs != null ? `${e.travel_costs.toFixed ? e.travel_costs.toFixed(2) : e.travel_costs} €` : '–'}</td>
      </tr>`;
    }).join('');
    if (rows) {
      travelHtml = `
        <div class="section keep-together">
          <div class="section-title">🚗 Fahrzeiten (pro Mitarbeiter)</div>
          <table class="emp-table">
            <thead><tr><th>Mitarbeiter</th><th>Hin (h)</th><th>Rück (h)</th><th>Hin (km)</th><th>Rück (km)</th><th>Spesen</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>`;
    }
  } else if (teamTravelHas) {
    const items: string[] = [];
    if (r.travel_to_hours != null) items.push(`<div class="info-mini"><div class="info-mini-label">🛣️ Hin</div><div class="info-mini-value">${r.travel_to_hours} h${r.travel_to_km != null ? ' · ' + r.travel_to_km + ' km' : ''}</div></div>`);
    if (r.travel_back_hours != null) items.push(`<div class="info-mini"><div class="info-mini-label">↩️ Rück</div><div class="info-mini-value">${r.travel_back_hours} h${r.travel_back_km != null ? ' · ' + r.travel_back_km + ' km' : ''}</div></div>`);
    if ((r.travel_to_hours == null && r.travel_to_km != null) || (r.travel_back_hours == null && r.travel_back_km != null)) {
      if (r.travel_to_km != null && r.travel_to_hours == null) items.push(`<div class="info-mini"><div class="info-mini-label">📏 Hin</div><div class="info-mini-value">${r.travel_to_km} km</div></div>`);
      if (r.travel_back_km != null && r.travel_back_hours == null) items.push(`<div class="info-mini"><div class="info-mini-label">📏 Rück</div><div class="info-mini-value">${r.travel_back_km} km</div></div>`);
    }
    if (r.travel_costs != null) items.push(`<div class="info-mini"><div class="info-mini-label">💶 Spesen</div><div class="info-mini-value">${(r.travel_costs.toFixed ? r.travel_costs.toFixed(2) : r.travel_costs)} €</div></div>`);
    travelHtml = `
      <div class="section keep-together">
        <div class="section-title">🚗 Fahrzeiten (Team)</div>
        <div class="info-grid">${items.join('')}</div>
        ${r.travel_note ? `<div class="work-desc" style="margin-top:6px;">${escapeHtml(r.travel_note)}</div>` : ''}
      </div>`;
  }


  return `
    <div class="report-page">
      <div class="report-header">
        <div style="display:flex;align-items:flex-start;gap:10px;">
          ${(options as any).logoData ? `<img src="${(options as any).logoData}" style="height:50px;max-width:120px;object-fit:contain;" />` : ''}
          <div>
            <div class="report-title">📝 ${escapeHtml((options as any).reportTitle || 'RAPPORT')}</div>
            ${(options as any).companyName ? `<div style="font-size:11px;color:#475569;margin-top:2px;font-weight:600;">${escapeHtml((options as any).companyName)}</div>` : ''}
            ${report.report_number ? `<div class="report-number">${escapeHtml(report.report_number)}</div>` : ''}
          </div>
        </div>
        <div class="report-meta">
          <div><b>Datum:</b> ${formatDate(report.date)}</div>
          ${totalHours > 0 ? `<div><b>Stunden:</b> ${totalHours}</div>` : ''}
        </div>
      </div>

      ${headerRows.length > 0 ? `
        <div class="info-box">
          <div class="info-box-title">Projekt &amp; Kunde</div>
          ${headerRows.join('')}
        </div>
      ` : ''}

      <div class="section">
        <div class="section-title">👷 Mitarbeiter & Arbeitszeiten</div>
        ${employeesTable}
        ${roleSummaryHtml}
      </div>

      <div class="section">
        <div class="section-title">🛠️ Ausgeführte Arbeiten</div>
        ${workItemsHtml}
        ${report.work_description ? `<div class="work-desc">${escapeHtml(report.work_description)}</div>` : ''}
        ${!workItemsHtml && !report.work_description ? '<span style="color:#999;font-style:italic;">Keine Angaben</span>' : ''}
      </div>

      ${machinesHtml ? `
        <div class="section">
          <div class="section-title">🚜 Maschinen / Geräte</div>
          ${machinesHtml}
        </div>
      ` : ''}

      ${materialsRows ? `
        <div class="section">
          <div class="section-title">🧱 Verwendetes Material</div>
          <table class="material-table">
            <thead><tr><th>Material</th><th style="text-align:right;">Menge</th><th>Einheit</th><th>Bemerkung</th></tr></thead>
            <tbody>${materialsRows}</tbody>
          </table>
        </div>
      ` : ''}

      ${travelHtml}

      <div class="section info-grid">
        ${(weatherText || tempText) ? `
          <div class="info-mini">
            <div class="info-mini-label">🌦️ Wetter</div>
            <div class="info-mini-value">${weatherText}${weatherText && tempText ? ' · ' : ''}${tempText}</div>
          </div>
        ` : ''}
        ${(report.travel_km != null && !teamTravelHas && !perEmpTravelHas) ? `
          <div class="info-mini">
            <div class="info-mini-label">🚗 Anfahrt</div>
            <div class="info-mini-value">${report.travel_km} km</div>
          </div>
        ` : ''}
      </div>

      ${(report as any).obstacles ? `
        <div class="section keep-together">
          <div class="section-title" style="background:#fee2e2;color:#991b1b;">⚠️ Besonderheiten / Behinderungen</div>
          <div class="work-desc" style="border-left:3px solid #dc2626;">${escapeHtml((report as any).obstacles)}</div>
        </div>
      ` : ''}

      ${report.remarks ? `
        <div class="section keep-together">
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
      ${(options as any).includeFooterText ? `<div class="doc-footer">${(options as any).includeFooterText}</div>` : ''}
    </div>
  `;
};

export const REPORT_CSS = `
  .report-page {
    background: #fff;
    padding: 8px 0 16px 0;
  }
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
    page-break-inside: avoid;
  }
  .info-box-title { font-weight: bold; color: #1976d2; margin-bottom: 4px; font-size: 12px; }
  .info-row { font-size: 11px; margin: 2px 0; }
  .section { margin-bottom: 12px; orphans: 3; widows: 3; }
  /* Atomare Sektionen (Überschrift + kurzer Inhalt) — niemals zwischen Seiten zerreißen */
  .keep-together {
    page-break-inside: avoid !important;
    break-inside: avoid !important;
    -webkit-column-break-inside: avoid !important;
    display: block;
  }
  .section-title {
    font-size: 13px;
    font-weight: bold;
    color: #333;
    background: #e3f2fd;
    padding: 5px 10px;
    border-radius: 4px;
    margin-bottom: 6px;
    page-break-after: avoid !important;
    break-after: avoid-page !important;
    page-break-inside: avoid;
  }
  /* Erste Inhalts-Elemente direkt nach .section-title sollen niemals
     auf einer neuen Seite alleine erscheinen — sie kleben an ihrer Überschrift. */
  .section-title + .info-box,
  .section-title + .work-desc,
  .section-title + .material-table,
  .section-title + .emp-table,
  .section-title + .work-items,
  .section-title + .machines-list,
  .section-title + .role-summary,
  .section-title + .single-line,
  .section-title + table,
  .section-title + ul,
  .section-title + p {
    page-break-before: avoid !important;
    break-before: avoid-page !important;
  }
  /* Generisches "single-line" Element für kurze 1-Zeilen-Inhalte (z.B. "10 km" Anfahrt, "Zu warm" Besonderheiten) */
  .single-line {
    font-size: 12px;
    padding: 6px 10px;
    background: #fafafa;
    border-radius: 4px;
    border-left: 3px solid #f59e0b;
    page-break-inside: avoid;
  }
  .employees-list { margin: 4px 0 0 18px; font-size: 12px; }
  .employees-list li { margin: 2px 0; }
  .emp-table {
    width: 100%; border-collapse: collapse; font-size: 11px; margin-top: 4px;
    page-break-inside: avoid;
  }
  .emp-table th { background: #1976d2; color: #fff; padding: 5px 8px; text-align: left; font-size: 10px; }
  .emp-table td { padding: 5px 8px; border-bottom: 1px solid #e0e0e0; }
  .emp-table tr { page-break-inside: avoid; }
  .emp-total-row td { background: #e0f2fe; padding: 6px 8px; font-size: 12px; border-top: 2px solid #1976d2; }
  .work-items {
    list-style: none;
    padding-left: 0;
    margin: 4px 0 0 0;
    font-size: 11px;
    /* font-size:0 verhindert Whitespace zwischen inline-block Items */
    font-size: 0;
    page-break-inside: avoid;
  }
  .work-items li {
    /* 2 Spalten Standard: 2 Items pro Reihe (jeweils ~50%) */
    display: inline-block;
    vertical-align: top;
    width: 49%;
    margin-right: 1%;
    padding: 2px 0;
    font-size: 11px;
    page-break-inside: avoid;
    break-inside: avoid;
    -webkit-column-break-inside: avoid;
    line-height: 1.35;
    box-sizing: border-box;
    padding-left: 4px;
    padding-right: 4px;
  }
  /* Bei mehr als 12 Items: 3 Spalten (jeweils ~33%) */
  .work-items.dense li {
    width: 32%;
    font-size: 10px;
  }
  .work-items li .check-box {
    display: inline-block;
    margin-right: 4px;
    vertical-align: middle;
  }
  .work-items li > span {
    vertical-align: middle;
  }
  .work-items .check-box { font-size: 14px; color: #16a34a; }
  .work-items li.unchecked .check-box { color: #94a3b8; }
  .work-items .strike { text-decoration: line-through; color: #94a3b8; }
  .machines-list { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 4px; }
  .machine-tag {
    background: #ede9fe; color: #5b21b6;
    padding: 4px 10px; border-radius: 12px; font-size: 11px; font-weight: 600;
  }
  .role-summary {
    background: #f8fafc; border-radius: 6px; padding: 8px 10px; margin-top: 8px;
    border-left: 3px solid #1976d2;
    page-break-inside: avoid;
  }
  .role-summary-title {
    font-size: 10px; font-weight: 700; color: #475569;
    letter-spacing: 0.5px; text-transform: uppercase; margin-bottom: 4px;
  }
  .role-row {
    display: flex; justify-content: space-between; align-items: center;
    padding: 3px 0;
  }
  .role-tag {
    background: #dbeafe; color: #1d4ed8;
    padding: 3px 8px; border-radius: 10px; font-size: 11px; font-weight: 600;
  }
  .role-count { color: #64748b; font-weight: 400; font-size: 10px; margin-left: 4px; }
  .role-hours { font-size: 12px; font-weight: 800; color: #0f172a; }
  .work-desc {
    font-size: 12px;
    line-height: 1.5;
    padding: 6px 10px;
    background: #fafafa;
    border-radius: 4px;
    white-space: pre-wrap;
    border: 1px solid #e0e0e0;
    page-break-inside: avoid;
  }
  .material-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 11px;
    margin-top: 4px;
    page-break-inside: avoid;
  }
  .material-table th { background: #1976d2; color: #fff; padding: 5px 8px; text-align: left; }
  .material-table td { padding: 4px 8px; border-bottom: 1px solid #e0e0e0; }
  .material-table tr { page-break-inside: avoid; }
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
  /* Foto-Layout via Tabelle: <tr> wird in Chromium-Print zuverlässig nicht zwischen Seiten zerrissen */
  .photo-table {
    width: 100%;
    border-collapse: separate;
    border-spacing: 8px 8px;
    table-layout: fixed;
  }
  .photo-row {
    page-break-inside: avoid;
    break-inside: avoid;
    -webkit-column-break-inside: avoid;
  }
  .photo-cell {
    width: 50%;
    padding: 0;
    vertical-align: top;
    page-break-inside: avoid;
    break-inside: avoid;
  }
  .photo-box {
    border: 1px solid #ccc;
    border-radius: 4px;
    overflow: hidden;
    background: #1f2937;
  }
  .photo-box img {
    width: 100%;
    height: 240px;
    object-fit: cover;
    display: block;
    background: #1f2937;
  }
  .photo-caption { font-size: 9px; padding: 3px 5px; background: #f5f5f5; color: #333; }
  .signatures {
    display: flex;
    justify-content: space-between;
    gap: 16px;
    margin-top: 14px;
    page-break-inside: avoid;
  }
  .signature-block { flex: 1; text-align: center; }
  .signature-area {
    background: #fff;
    border-radius: 4px;
    min-height: 50px;
    height: 50px;
    overflow: hidden;
    position: relative;
  }
  .signature-area > svg { width: 100% !important; height: 100% !important; }
  .signature-area > div { width: 100% !important; height: 100% !important; }
  .signature-label { font-size: 9px; margin-top: 2px; color: #333; font-weight: 600; border-top: 1px solid #94a3b8; padding-top: 2px; line-height: 1.3; }
`;

/**
 * Generiert das vollständige HTML eines Standalone-Rapport-PDFs.
 */
export const generateReportHtml = async (
  report: Report,
  project: Project | null,
  customer: Customer | null
): Promise<string> => {
  // Lade Settings (Logo, Titel, Firmenname)
  let logoData = '';
  let companyName = '';
  let reportTitle = 'Rapport';
  try {
    const s = await SettingsService.get();
    const sAny = s as any;
    logoData = sAny.logo_data || sAny.company_logo || '';
    companyName = s.company_name || '';
    reportTitle = s.report_title || 'Rapport';
  } catch (e) {
    console.warn('[generateReportHtml] settings load error:', e);
  }
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        @page { margin: 14mm; }
        body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; margin: 0; padding: 0; color: #333; }
        ${REPORT_CSS}
        .doc-footer { margin-top: 16px; padding-top: 6px; border-top: 1px solid #e0e0e0; font-size: 9px; color: #999; text-align: center; page-break-before: avoid; page-break-inside: avoid; }
      </style>
    </head>
    <body>
      ${generateReportSectionHtml(report, project, customer, { standalone: true, logoData, companyName, reportTitle, includeFooterText: `Erstellt mit ${escapeHtml(getAppName())} · ${new Date().toLocaleDateString('de-DE')}` } as any)}
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
  const html = await generateReportHtml(report, project, customer);
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

// HTML der Wandliste für das Projekt-PDF
import { formatAreaM2 } from './polygonArea';
import { openingAreaM2, wallRows } from './wallArea';

export const buildWallListHtml = (wallLists: { title: string; rows: ReturnType<typeof wallRows> }[]): string => {
  // Wandliste: Länge × Höhe − Abzug = Fläche je Wand (zum Nachrechnen)
  const esc = (v: string) => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const num = (v: number) => v.toFixed(2).replace('.', ',');
  const wc = 'padding: 4px 8px; border: 1px solid #ddd;';
  return wallLists.length > 0 ? `
    <div class="sketch-wall-list" style="margin: 12px 0;">
      <h3 style="font-size: 12pt; margin: 0 0 6px 0; color: #333;">Wandliste (Skizzen)</h3>
      ${wallLists.map(list => `
        <table style="width: 100%; border-collapse: collapse; font-size: 10pt; margin-bottom: 8px; page-break-inside: avoid; break-inside: avoid;">
          <thead>
            <tr style="background: #f0f4f8;"><th colspan="5" style="text-align: left; ${wc}">${esc(list.title)}</th></tr>
            <tr style="background: #f7f9fb;">
              <th style="text-align: left; ${wc}">Wand</th>
              <th style="text-align: right; ${wc}">Länge</th>
              <th style="text-align: right; ${wc}">Höhe</th>
              <th style="text-align: right; ${wc}">Abzug</th>
              <th style="text-align: right; ${wc}">Fläche</th>
            </tr>
          </thead>
          <tbody>
            ${list.rows.map(r => `
              <tr>
                <td style="${wc}">Linie ${r.line}</td>
                <td style="text-align: right; ${wc}">${num(r.length)} m</td>
                <td style="text-align: right; ${wc}">${num(r.height)} m</td>
                <td style="text-align: right; ${wc}">${r.deduction > 0 ? `${formatAreaM2(r.deduction)}${r.openings.length > 0 ? `<br><span style="font-size: 8pt; color: #666;">${r.openings.map(o => `${esc(o.width)} × ${esc(o.height)} = ${num(openingAreaM2(o))}`).join('<br>')}</span>` : ''}` : '–'}</td>
                <td style="text-align: right; ${wc}">${formatAreaM2(r.area)}</td>
              </tr>`).join('')}
            <tr style="font-weight: 700; background: #e3f2fd;">
              <td colspan="4" style="${wc}">Summe</td>
              <td style="text-align: right; ${wc}">${formatAreaM2(Math.round(list.rows.reduce((a, r) => a + r.area, 0) * 100) / 100)}</td>
            </tr>
          </tbody>
        </table>`).join('')}
    </div>
  ` : '';
};

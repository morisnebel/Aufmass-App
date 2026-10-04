// Projekt-PDF-Erzeugung (HTML für expo-print)
// Ausgelagert aus app/projects/[id].tsx (Refactoring) - Logik unverändert.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { readAsStringAsync } from 'expo-file-system/legacy';
import { SettingsService, LineCategoryService } from './LocalStorage';
import { isPro, getProStatus } from './FeatureFlags';
import { getStatusMeta } from '../src/constants/projectStatus';
import { buildCoverPageHtml, CoverStyle } from './CoverPageTemplates';

// PDF-Farbpalette (auch für die Deckblatt-Akzentfarbe im PDF-Modal)
export const PDF_COLOR_OPTIONS: { [key: string]: { color: string; textColor: string } } = {
  blue: { color: '#1976d2', textColor: '#ffffff' },
  light_blue: { color: '#bbdefb', textColor: '#1565c0' },
  gray: { color: '#9e9e9e', textColor: '#ffffff' },
  light_gray: { color: '#e0e0e0', textColor: '#424242' },
  green: { color: '#388e3c', textColor: '#ffffff' },
  light_green: { color: '#c8e6c9', textColor: '#2e7d32' },
  orange: { color: '#f57c00', textColor: '#ffffff' },
  red: { color: '#d32f2f', textColor: '#ffffff' },
  black: { color: '#212121', textColor: '#ffffff' },
  white: { color: '#ffffff', textColor: '#333333' },
};

export interface ProjectPdfContext {
  project: any;
  customer: any;
  roofs: any[];
  photos: any[];
  sketches: any[];
  checklists: any[];
  areaCalculations: any[];
  imagemeterPhotos: any[];
  remarks: string;
  t: (key: string, opts?: any) => string;
  includeCoverPage: boolean;
  coverPhotoId: string | null;
  coverStyle: CoverStyle;
  coverSubtitle: string;
  coverAccent?: string | null; // Farb-ID aus PDF_COLOR_OPTIONS, null = Farbe aus Einstellungen
  includeToc?: boolean; // Inhaltsverzeichnis-Seite einfügen
  showCalcDetailsPage: boolean;
}

export const generateProjectPdfHtml = async (ctx: ProjectPdfContext): Promise<string> => {
  const {
    project, customer, roofs, photos, sketches, checklists,
    areaCalculations, imagemeterPhotos, remarks, t,
    includeCoverPage, coverPhotoId, coverStyle, coverSubtitle, coverAccent, includeToc,
    showCalcDetailsPage,
  } = ctx;
    // Debug: Log remarks status
    console.log('generatePdfHtml - remarks state:', remarks);
    console.log('generatePdfHtml - project?.remarks:', project?.remarks);
    
    // Get company settings for header
    const settings: any = await SettingsService.get();
    
    // Load line categories for shortcut display
    const pdfLineCategories = await LineCategoryService.getAll();
    
    // Helper: Format category name with shortcut -> "(TR) Traufe"
    const formatCategoryForPdf = (categoryName: string): string => {
      const cat = pdfLineCategories.find(c => c.name === categoryName);
      if (cat?.shortcut) {
        return `(${cat.shortcut}) ${categoryName}`;
      }
      return categoryName;
    };
    
    // Calculate total area for PDF
    const pdfTotalArea = roofs.reduce((sum, roof) => sum + (roof.area || 0), 0);
    
    // Parse customer address helper
    const parseAddr = (address: string | undefined) => {
      if (!address) return { street: '', plz: '', city: '' };
      const parts = address.split(',');
      const street = parts[0]?.trim() || '';
      const cityParts = parts[1]?.trim().split(' ') || [];
      const plz = cityParts[0] || '';
      const city = cityParts.slice(1).join(' ') || '';
      return { street, plz, city };
    };
    
    const customerAddr = parseAddr(customer?.address);
    
    // Build bauherr info - alle Felder
    const bauherrName = project?.bauherr_name || customer?.name || '';
    const bauherrStreet = project?.bauherr_street || customerAddr.street || '';
    const bauherrPlz = project?.bauherr_plz || customerAddr.plz || '';
    const bauherrCity = project?.bauherr_city || customerAddr.city || '';
    const bauherrPhone = project?.bauherr_phone || customer?.phone || '';
    const bauherrMobile = project?.bauherr_mobile || customer?.mobile || '';
    const bauherrEmail = project?.bauherr_email || customer?.email || '';
    const bauherrCustomerType = customer?.customerType || '';
    const bauherrCustomerTypeName = (customer as any)?.customerTypeName || '';
    
    // Build objekt info - alle Felder
    const objektNumber = project?.objekt_number || ''; // OBJ-26001
    const objektName = project?.objekt_name || '';
    const objektAddressName = project?.objekt_address_name || ''; // z.B. "Haupthaus"
    const objektDescription = project?.objekt_description || ''; // Beschreibung
    const objektStreet = project?.objekt_street || '';
    const objektPlz = project?.objekt_plz || '';
    const objektCity = project?.objekt_city || '';
    const objektContactPerson = project?.objekt_contact_person || '';
    const objektPhone = project?.objekt_phone || '';
    const objektEmail = project?.objekt_email || '';
    
    // Company info für Header - verwende die Felder aus den Einstellungen
    const companyName = settings.company_name || '';
    const companySubtitle = settings.company_subtitle || '';
    const companyOwner = (settings as any).owner_name || '';
    const companyStreet = settings.street || '';
    const companyZipCode = settings.zip_code || '';
    const companyCity = settings.city || '';
    const companyPhone = settings.phone || '';
    const companyMobilePhone = settings.mobile_phone || '';
    const companyFax = settings.fax || '';
    const companyEmail = settings.email || '';
    const authorName = settings.author_name || '';
    
    // Logo: In Basic Version das Aufmassprofi-Logo verwenden
    let companyLogo = '';
    const isProActive = getProStatus();
    if (isProActive) {
      // Pro Version: Benutzer-Logo aus Einstellungen
      companyLogo = settings.logo_data || '';
    } else {
      // Basic Version: Aufmassprofi Logo laden
      try {
        const Asset = require('expo-asset').Asset;
        const iconAsset = Asset.fromModule(require('../assets/images/icon.png'));
        await iconAsset.downloadAsync();
        if (iconAsset.localUri) {
          const base64 = await readAsStringAsync(iconAsset.localUri, { encoding: 'base64' });
          companyLogo = `data:image/png;base64,${base64}`;
        }
      } catch (e) {
        console.log('Could not load Basic logo for PDF:', e);
        companyLogo = '';
      }
    }
    
    // PDF Layout Einstellungen
    const checklistColumns = (settings as any).pdf_checklist_columns || 2;
    // Feste Spaltenanzahl statt auto-fit
    const gridColumns = checklistColumns === 1 ? '1fr' : checklistColumns === 2 ? '1fr 1fr' : '1fr 1fr 1fr';
    
    // Farb-Optionen für alle Bereiche
    const colorOptions = PDF_COLOR_OPTIONS;
    
    // Größen-Mapping für Schrift und Padding - deutlichere Unterschiede
    const sizeMapping = {
      small: { fontSize: 10, padding: 4, h1Size: 12, h2Size: 9 },
      medium: { fontSize: 14, padding: 8, h1Size: 16, h2Size: 11 },
      large: { fontSize: 18, padding: 14, h1Size: 22, h2Size: 14 },
    };
    
    // ===== HEADER SECTION SETTINGS =====
    const headerColorId = (settings as any).pdf_header_section_color || (settings as any).pdf_header_color || 'blue';
    const headerStyleSetting = (settings as any).pdf_header_section_style || (settings as any).pdf_header_style || 'filled';
    const headerSizeSetting = (settings as any).pdf_header_size || 'medium';
    const headerColor = colorOptions[headerColorId] || colorOptions.blue;
    const headerSize = sizeMapping[headerSizeSetting as keyof typeof sizeMapping] || sizeMapping.medium;
    
    // Header-Farben basierend auf Stil
    const headerBgColor = headerStyleSetting === 'outline' ? '#ffffff' : headerColor.color;
    const headerTextColor = headerStyleSetting === 'outline' ? headerColor.color : headerColor.textColor;
    const headerBorderStyle = headerStyleSetting === 'outline' ? `border: 2px solid ${headerColor.color};` : '';
    
    // ===== PROJECT TYPE (HEADLINE) SECTION SETTINGS =====
    const projectTypeColorId = (settings as any).pdf_project_type_color || headerColorId;
    const projectTypeStyleSetting = (settings as any).pdf_project_type_style || headerStyleSetting;
    const projectTypeSizeSetting = (settings as any).pdf_project_type_size || 'medium';
    const projectTypeColor = colorOptions[projectTypeColorId] || colorOptions.blue;
    const projectTypeSize = sizeMapping[projectTypeSizeSetting as keyof typeof sizeMapping] || sizeMapping.medium;
    
    // Project Type-Farben basierend auf Stil
    const projectTypeBgColor = projectTypeStyleSetting === 'outline' ? '#ffffff' : projectTypeColor.color;
    const projectTypeTextColor = projectTypeStyleSetting === 'outline' ? projectTypeColor.color : projectTypeColor.textColor;
    const projectTypeBorderStyle = projectTypeStyleSetting === 'outline' ? `border: 2px solid ${projectTypeColor.color};` : `border: 1px solid ${projectTypeColor.color};`;
    
    // ===== TOOLS SECTION SETTINGS (Info, Fotos, Skizzen, etc.) =====
    const toolsColorId = (settings as any).pdf_tools_color || headerColorId;
    const toolsStyleSetting = (settings as any).pdf_tools_style || 'filled';
    const toolsSizeSetting = (settings as any).pdf_tools_size || 'medium';
    const toolsColor = colorOptions[toolsColorId] || colorOptions.blue;
    const toolsSize = sizeMapping[toolsSizeSetting as keyof typeof sizeMapping] || sizeMapping.medium;
    
    // Tools-Farben (für Section Headers)
    const toolsAccentColor = toolsColor.color;
    const toolsBgColor = toolsStyleSetting === 'outline' ? '#ffffff' : toolsColor.color;
    const toolsTextColor = toolsStyleSetting === 'outline' ? toolsColor.color : toolsColor.textColor;
    
    // Legacy: Akzentfarbe für Überschriften im Dokument (verwendet jetzt Tools-Farbe)
    const accentColor = toolsAccentColor;
    // Legacy: Altes pdfColor für Abwärtskompatibilität
    const pdfColor = headerColor;
    const pdfHeaderStyle = headerStyleSetting;
    
    // Format date
    const formatDate = (dateStr: string) => {
      try {
        const date = new Date(dateStr);
        return date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
      } catch {
        return dateStr;
      }
    };
    
    // Generate roofs HTML with more details
    const roofsHtml = roofs.length > 0 ? roofs.map((roof, idx) => {
      let measurementsHtml = '';
      if (roof.measurements && typeof roof.measurements === 'object') {
        const m = roof.measurements;
        measurementsHtml = `
          <div class="measurements-grid">
            ${m.gebaeudelaenge ? `<div class="measure-item"><span class="measure-label">Gebäudelänge:</span> ${m.gebaeudelaenge} m</div>` : ''}
            ${m.gebaeudebreite ? `<div class="measure-item"><span class="measure-label">Gebäudebreite:</span> ${m.gebaeudebreite} m</div>` : ''}
            ${m.traufhoehe ? `<div class="measure-item"><span class="measure-label">Traufhöhe:</span> ${m.traufhoehe} m</div>` : ''}
            ${m.firsthoehe ? `<div class="measure-item"><span class="measure-label">Firsthöhe:</span> ${m.firsthoehe} m</div>` : ''}
            ${m.dachneigung1 ? `<div class="measure-item"><span class="measure-label">Dachneigung:</span> ${m.dachneigung1}°</div>` : ''}
            ${m.dachueberstand ? `<div class="measure-item"><span class="measure-label">Dachüberstand:</span> ${m.dachueberstand} m</div>` : ''}
            ${m.sparrenlaenge ? `<div class="measure-item"><span class="measure-label">Sparrenlänge:</span> ${m.sparrenlaenge} m</div>` : ''}
            ${m.ortganglaenge ? `<div class="measure-item"><span class="measure-label">Ortganglänge:</span> ${m.ortganglaenge} m</div>` : ''}
            ${m.firstlaenge ? `<div class="measure-item"><span class="measure-label">Firstlänge:</span> ${m.firstlaenge} m</div>` : ''}
            ${m.trauflaenge ? `<div class="measure-item"><span class="measure-label">Trauflänge:</span> ${m.trauflaenge} m</div>` : ''}
          </div>
        `;
      }
      return `
        <div class="roof-card">
          <h4>Dachfläche ${idx + 1}: ${roof.roof_type || 'Unbenannt'}</h4>
          <div class="roof-area"><strong>Gesamtfläche:</strong> ${roof.area?.toFixed(2) || 0} m²</div>
          ${measurementsHtml}
          ${roof.notes ? `<div class="roof-notes"><strong>Notizen:</strong> ${roof.notes}</div>` : ''}
        </div>
      `;
    }).join('') : '<p class="empty">Keine Dachflächen erfasst</p>';
    
    // Generate checklists HTML with new hierarchical layout
    // Helper: Flatten deep sub-items for PDF
    const flattenDeepSubItemsForPdf = (items: any[], basePrefix: string): { text: string; level: number; prefix: string; note?: string; measurements?: any[] }[] => {
      const result: { text: string; level: number; prefix: string; note?: string; measurements?: any[] }[] = [];
      items.forEach((item, index) => {
        const currentPrefix = `${basePrefix}.${index + 1}`;
        const currentLevel = currentPrefix.split('.').length - 2;
        if (item.checked) {
          result.push({ text: item.text, level: currentLevel, prefix: currentPrefix, note: item.note, measurements: item.measurements });
        }
        if (item.subItems && item.subItems.length > 0) {
          result.push(...flattenDeepSubItemsForPdf(item.subItems, currentPrefix));
        }
      });
      return result;
    };
    
    // Helper: Format measurement for display
    const formatMeasurementForPdf = (m: any): string => {
      const expr = m.expression || m.value?.toString() || '0';
      const result = m.result ?? m.value ?? 0;
      return `${expr.replace(/\./g, ',').replace(/\*/g, '×')} = ${result.toString().replace('.', ',')} ${m.unit}`;
    };
    
    // Helper: Count checked items recursively
    const countCheckedForPdf = (items: any[]): number => {
      let total = 0;
      items.forEach(item => {
        if (item.checked) total++;
        if (item.subItems && item.subItems.length > 0) {
          total += countCheckedForPdf(item.subItems);
        }
      });
      return total;
    };
    
    // Helper: Count total items recursively
    const countTotalForPdf = (items: any[]): number => {
      let total = items.length;
      items.forEach(item => {
        if (item.subItems && item.subItems.length > 0) {
          total += countTotalForPdf(item.subItems);
        }
      });
      return total;
    };
    
    const checklistItems = checklists.length > 0 ? checklists.map((checklist, checklistIndex) => {
      // Filter checked main categories
      const checkedCategories = checklist.items.filter((item: any) => item.checked);
      
      if (checkedCategories.length === 0) {
        // Wichtig: gleiche Objekt-Struktur wie unten zurückgeben,
        // sonst crasht item.categoriesHtml.split() ("split of undefined")
        return {
          categoriesHtml: '<!--CATEGORY_SPLIT--><p class="empty">Keine Positionen abgehakt</p>',
          totalChecked: 0,
          totalItems: countTotalForPdf(checklist.items),
          templateLogoHtml: (checklist as any).templateLogo
            ? `<img src="${(checklist as any).templateLogo}" class="pdf-template-logo" alt="Logo" />`
            : '',
        };
      }
      
      // Build categories HTML
      const categoriesHtml = checkedCategories.map((category: any, catIndex: number) => {
        const level1Items = category.subItems || [];
        const checkedLevel1 = level1Items.filter((item: any) => item.checked);
        const checkedSubCount = category.subItems ? countCheckedForPdf(category.subItems) : 0;
        const totalSubCount = category.subItems ? countTotalForPdf(category.subItems) : 0;
        
        // Build level 1 containers
        const containersHtml = checkedLevel1.map((l1Item: any) => {
          const originalIndex = level1Items.indexOf(l1Item);
          const containerPrefix = `${catIndex + 1}.${originalIndex + 1}`;
          const deepSubs = l1Item.subItems ? flattenDeepSubItemsForPdf(l1Item.subItems, containerPrefix) : [];
          
          const deepSubsHtml = deepSubs.map(sub => `
            <div class="pdf-deep-sub" style="padding-left: ${sub.level * 10}px;">
              <span class="pdf-deep-prefix">${sub.prefix}</span>
              <span class="pdf-checkmark">✓</span>
              <span class="pdf-deep-text">${sub.text}</span>
            </div>
            ${sub.note ? `<div class="pdf-note" style="margin-left: ${sub.level * 10 + 36}px;"><span class="pdf-note-icon">📝</span> ${sub.note}</div>` : ''}
            ${sub.measurements && sub.measurements.length > 0 ? `<div class="pdf-measurement" style="margin-left: ${sub.level * 10 + 36}px;">${sub.measurements.map((m: any) => `📐 ${formatMeasurementForPdf(m)}`).join('<br>')}</div>` : ''}
          `).join('');
          
          return `
            <div class="pdf-level1-container">
              <div class="pdf-level1-header">
                <span class="pdf-level1-prefix">${containerPrefix}</span>
                <span class="pdf-checkmark-circle">✓</span>
                <span class="pdf-level1-title">${l1Item.text}</span>
                ${l1Item.printImage ? `<img src="${l1Item.printImage}" class="pdf-print-thumbnail-small" alt="Bild" />` : ''}
              </div>
              ${l1Item.note ? `<div class="pdf-note"><span class="pdf-note-icon">📝</span> ${l1Item.note}</div>` : ''}
              ${l1Item.measurements && l1Item.measurements.length > 0 ? `<div class="pdf-measurement">${l1Item.measurements.map((m: any) => `📐 ${formatMeasurementForPdf(m)}`).join('<br>')}</div>` : ''}
              ${deepSubs.length > 0 ? `<div class="pdf-level1-content">${deepSubsHtml}</div>` : ''}
            </div>
          `;
        }).join('');
        
        return `<!--CATEGORY_SPLIT-->
          <div class="pdf-category-section cols-${checklistColumns}" style="page-break-inside: avoid; break-inside: avoid; margin-bottom: 8px;">
            <div class="pdf-category-header">
              ${category.categoryLogo ? `<img src="${category.categoryLogo}" class="pdf-category-logo" alt="Logo" />` : ''}
              <span class="pdf-cat-check">✓</span>
              <span class="pdf-category-title">${category.text}</span>
              ${category.printImage ? `<img src="${category.printImage}" class="pdf-print-thumbnail" alt="Bild" />` : ''}
              ${totalSubCount > 0 ? `<span class="pdf-category-count">${checkedSubCount}/${totalSubCount}</span>` : ''}
            </div>
            ${category.note ? `<div class="pdf-category-note"><span class="pdf-note-icon">📝</span> ${category.note}</div>` : ''}
            ${category.measurements && category.measurements.length > 0 ? `
              <div class="pdf-category-measurements">
                ${category.measurements.map((m: any) => `<div class="pdf-measurement-line">📐 ${formatMeasurementForPdf(m)}</div>`).join('')}
                ${(() => {
                  const sumsByUnit: { [unit: string]: number } = {};
                  category.measurements.forEach((m: any) => {
                    const result = m.result ?? (m as any).value ?? 0;
                    sumsByUnit[m.unit] = (sumsByUnit[m.unit] || 0) + result;
                  });
                  const units = Object.keys(sumsByUnit);
                  if (units.length > 0) {
                    return `<div class="pdf-measurement-sum">Summen: ${units.map(u => `<span class="pdf-sum-badge">${sumsByUnit[u].toFixed(2).replace('.', ',')} ${u}</span>`).join(' ')}</div>`;
                  }
                  return '';
                })()}
              </div>
            ` : ''}
            <div class="pdf-level1-grid" style="display: grid; grid-template-columns: repeat(${checklistColumns}, 1fr); gap: 3px; width: 100%;">${containersHtml}</div>
          </div>
        `;
      }).join('');
      
      const totalChecked = countCheckedForPdf(checklist.items);
      const totalItems = countTotalForPdf(checklist.items);
      
      // Template Logo für PDF
      const templateLogoHtml = (checklist as any).templateLogo 
        ? `<img src="${(checklist as any).templateLogo}" class="pdf-template-logo" alt="Logo" />`
        : '';
      
      return { categoriesHtml, totalChecked, totalItems, templateLogoHtml };
    }) : [];

    // Alle Checklisten als einfache divs generieren
    const checklistsHtml = checklistItems.length > 0 ? checklistItems.map((item, idx) => {
      if (!item) return '';
      if (typeof item === 'string') return item;
      
      const categoryHtmls = item.categoriesHtml.split('<!--CATEGORY_SPLIT-->').filter(Boolean);
      
      // Hauptüberschrift kommt jetzt direkt aus dem Section-div als <h2>
      const sectionHeader = '';
      
      // Checklist-Header + erste Kategorie zusammen (nicht trennen)
      const cardHeader = `
        <div style="page-break-inside: avoid; break-inside: avoid;">
          ${sectionHeader}
          <div class="checklist-main-header" style="margin-top: ${idx > 0 ? '8px' : '0'};">
            ${item.templateLogoHtml}
            <span class="checklist-main-title">${checklists[idx]?.template_name || ''}</span>
            <span class="checklist-main-count">${item.totalChecked} von ${item.totalItems}</span>
          </div>
          ${categoryHtmls.length > 0 ? categoryHtmls[0] : ''}
        </div>
      `;
      
      // Restliche Kategorien — sauber ohne Wiederholung
      const restCategories = categoryHtmls.slice(1).map(catHtml => `
        <div style="page-break-inside: avoid; break-inside: avoid;">
          ${catHtml}
        </div>
      `).join('');
      
      return cardHeader + restCategories;
    }).join('')
    : '<p class="empty">Keine Checklisten erfasst</p>';
    
    // Generate photos HTML (embedded as base64) with individual sizes
    // Neue Logik: Fotos bleiben in der ursprünglichen Reihenfolge
    // Jedes Foto bekommt page-break-inside: avoid
    // Die Größe bestimmt nur wie viel Platz das Foto einnimmt
    
    // iOS (iPhone UND iPad): Block-Layout für saubere Seitenumbrüche
    // WebKit ignoriert page-break-inside: avoid bei Flexbox-Containern
    // iPhone: Alles untereinander (display: block, width: 100%)
    // iPad: inline-block Layout (mehrere nebeneinander, aber Seitenumbrüche werden respektiert)
    const isIOSDevice = Platform.OS === 'ios';
    const isIpad = Platform.OS === 'ios' && Platform.isPad;
    const isIphone = Platform.OS === 'ios' && !Platform.isPad;
    
    // Hilfsfunktion um Fotos-HTML zu generieren - mit inline styles für zuverlässiges Drucken
    const generatePhotoHtml = (photo: typeof photos[0]) => {
      const size = (photo as any).pdf_size || 'medium';
      
      let svgContent = '';
      let canvasWidth = 0;
      let canvasHeight = 0;
      
      if ((photo as any).annotations) {
        try {
          const annotationData = JSON.parse((photo as any).annotations);
          canvasWidth = annotationData.canvasWidth || 400;
          canvasHeight = annotationData.canvasHeight || 300;
          
          // Render paths (drawing annotations)
          if (annotationData.paths && annotationData.paths.length > 0) {
            svgContent += annotationData.paths.map((p: any) => 
              `<path d="${p.path}" stroke="${p.color || '#FF0000'}" stroke-width="${p.strokeWidth || 3}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`
            ).join('');
          }
          
          // Render text elements (including date/time stamps)
          if (annotationData.textElements && annotationData.textElements.length > 0) {
            svgContent += annotationData.textElements.map((t: any) => {
              const escapedText = (t.text || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
              const fontFamily = t.fontFamily === 'System' ? 'Arial, sans-serif' : (t.fontFamily || 'Arial, sans-serif');
              return `<text x="${t.x}" y="${t.y}" font-size="${t.fontSize || 20}" fill="${t.color || '#FFFFFF'}" font-family="${fontFamily}" font-weight="bold" stroke="#000000" stroke-width="0.5" paint-order="stroke">${escapedText}</text>`;
            }).join('');
          }
        } catch (e) {
          console.error('Error parsing photo annotations:', e);
        }
      }
      
      // Bestimme Breite und max-height basierend auf Größe
      let width = '48%'; // medium default
      let maxImgHeight = '280px';
      let display = 'inline-block';
      
      if (size === 'small') {
        width = '31%';
        maxImgHeight = '180px';
      } else if (size === 'large' || size === 'full') {
        width = '100%';
        maxImgHeight = '400px';
        display = 'block';
      }
      
      // Bild und Annotationen in einem einzigen SVG für korrekte Koordinaten
      const hasAnnotations = svgContent.length > 0;
      let imageHtml = '';
      if (hasAnnotations && canvasWidth > 0 && canvasHeight > 0) {
        // Bild INNERHALB des SVG rendern damit Bild und Annotationen
        // denselben Koordinatenraum teilen
        imageHtml = `
          <svg viewBox="0 0 ${canvasWidth} ${canvasHeight}" preserveAspectRatio="xMidYMid meet" style="display: block; width: 100%; max-height: ${maxImgHeight}; background: #f5f5f5;">
            <image href="${photo.image_data}" x="0" y="0" width="${canvasWidth}" height="${canvasHeight}" preserveAspectRatio="xMidYMid meet" />
            ${svgContent}
          </svg>
        `;
      } else {
        imageHtml = `<img src="${photo.image_data}" alt="Foto" style="display: block; width: 100%; height: auto; max-height: ${maxImgHeight}; object-fit: contain; background: #f5f5f5;" />`;
      }

      return `
        <div style="display: ${display}; width: ${width}; vertical-align: top; margin: 0 1% 10px 0; page-break-inside: avoid; break-inside: avoid;">
          <div style="border: 1px solid #e0e0e0; border-radius: 6px; overflow: hidden; background: #fff;">
            <div style="display: block; width: 100%;">
              ${imageHtml}
            </div>
            ${photo.description ? `<p style="margin: 0; padding: 8px; font-size: 10px; color: #666; background: #f8f9fa;">${photo.description}</p>` : ''}
          </div>
        </div>
      `;
    };
    
    // Erzeuge Fotos - Überschrift wird ins erste Foto-Item eingebettet
    let photosHtml = '';
    
    if (photos.length > 0) {
      // iOS: Saubere Seitenumbrüche
      const photosContainerClass = isIphone 
        ? 'photos-print-container photos-print-iphone' 
        : isIpad 
          ? 'photos-print-container photos-print-ipad'
          : 'photos-print-container';
      
      // Erstes Foto mit eingebetteter Überschrift
      const firstPhotoHtml = generatePhotoHtml(photos[0]);
      // Überschrift VOR dem ersten Foto-Item einfügen (im Container, nicht außerhalb)
      const headingHtml = `<h2 class="photo-inline-heading">${t('photos.title')}</h2>`;
      
      const restPhotoItems = photos.slice(1).map(photo => generatePhotoHtml(photo)).join('');
      photosHtml = `<div class="${photosContainerClass}" style="font-size: 0;">${headingHtml}${firstPhotoHtml}${restPhotoItems}</div>`;
    }
    
    // Generate sketches HTML (embedded as base64/SVG) with size options
    // iPhone: kleinere Skizzen (2 pro Seite) für bessere Kompatibilität
    // iPad: normale Größe
    
    // Individuelle Werkzeug-Beschriftungen laden (für Memo-/Notiz-Gruppierung)
    let sketchLbl = { pointerName: 'Memo', memoName: 'Notiz' };
    try {
      const sketchLblRaw = await AsyncStorage.getItem('sketch_label_settings');
      if (sketchLblRaw) {
        const parsed = JSON.parse(sketchLblRaw);
        sketchLbl = {
          pointerName: parsed.pointerName?.trim() || 'Memo',
          memoName: parsed.memoName?.trim() || 'Notiz',
        };
      }
    } catch (_) {}

    const sketchItems = await Promise.all(sketches.map(async (sketch, index) => {
      // Read pdf_size and notes from sketch object or metadata
      let size = sketch.pdf_size || 'large';
      let sketchNotes = sketch.notes || '';
      let pointerTexts: string[] = [];
      let memoTexts: string[] = [];
      
      // Metadata aus separatem Storage laden (zuverlässiger als sketch.metadata)
      try {
        let metadata: any = {};
        const storedMeta = await AsyncStorage.getItem(`sketch_meta_${sketch.id}`);
        if (storedMeta) {
          metadata = JSON.parse(storedMeta);
        } else if (sketch.metadata) {
          metadata = typeof sketch.metadata === 'string' ? JSON.parse(sketch.metadata) : sketch.metadata;
        }
        
        if (!size || size === 'large') {
          if (metadata.pdf_size) {
            size = metadata.pdf_size;
          }
        }
        // Notes aus metadata als Fallback
        if (!sketchNotes && metadata.notes) {
          sketchNotes = metadata.notes;
        }
        // Memo- und Pointer-Texte IMMER separat extrahieren (werden ZUSÄTZLICH zur Hauptnotiz angezeigt)
        if (metadata.elements && Array.isArray(metadata.elements)) {
          pointerTexts = metadata.elements
            .filter((el: any) => el.type === 'pointer' && el.data?.text)
            .map((el: any) => el.data.text.trim())
            .filter((t: string) => t.length > 0);
          memoTexts = metadata.elements
            .filter((el: any) => el.type === 'memo' && el.data?.text)
            .map((el: any) => el.data.text.trim())
            .filter((t: string) => t.length > 0);
        }
      } catch (e) {
        console.log('Error parsing sketch metadata:', e);
      }
      
      // Größenklasse basierend auf pdf_size - für alle Geräte gleich
      let sizeClass = 'sketch-large'; // Default
      if (size === 'small') sizeClass = 'sketch-small';
      else if (size === 'medium') sizeClass = 'sketch-medium';
      else if (size === 'full') sizeClass = 'sketch-full';
      else sizeClass = 'sketch-large';
      
      // Titel für Skizze
      const sketchTitle = sketch.title || `Skizze ${index + 1}`;
      
      // Notizen gruppiert anzeigen: Hauptnotiz + Memo-Pfeil-Texte + Notiz-Texte (alle zusammen)
      const noteParts: string[] = [];
      if (sketchNotes.trim()) {
        noteParts.push(`<span class="sketch-notes-label">Notizen: </span><span class="sketch-notes-text">${sketchNotes.replace(/\n/g, '<br>')}</span>`);
      }
      if (pointerTexts.length > 0) {
        noteParts.push(`<span class="sketch-notes-label">${sketchLbl.pointerName}: </span><span class="sketch-notes-text">${pointerTexts.join(' | ')}</span>`);
      }
      if (memoTexts.length > 0) {
        noteParts.push(`<span class="sketch-notes-label">${sketchLbl.memoName}: </span><span class="sketch-notes-text">${memoTexts.join(' | ')}</span>`);
      }
      const notesHtml = noteParts.length > 0
        ? `<div class="sketch-notes sketch-notes-filled">${noteParts.join('<br>')}</div>`
        : '';
      
      return `
        <div class="sketch-item ${sizeClass}">
          ${index === 0 ? `<h2 class="sketch-inline-heading">${t('sketches.title')}</h2>` : ''}
          <p class="sketch-title">${sketchTitle}</p>
          ${sketch.sketch_data ? `<img src="${sketch.sketch_data}" alt="Skizze" />` : '<div class="sketch-placeholder">Skizze</div>'}
          ${notesHtml}
        </div>
      `;
    }));
    
    // Sketches-Container: iOS bekommt block/inline-block Layout für bessere Seitenumbrüche
    // WebKit (iOS) ignoriert page-break-inside: avoid bei Flexbox-Containern
    const sketchesContainerClass = isIphone 
      ? 'sketches-container sketches-container-iphone' 
      : isIpad 
        ? 'sketches-container sketches-container-ipad'
        : 'sketches-container';
    
    // Alle Sketches im Container zusammen - Überschrift ist im ersten Item eingebettet
    const sketchesHtml = sketches.length > 0 ? `
      <div class="${sketchesContainerClass}">
        ${sketchItems.join('')}
      </div>
    ` : '';
    
    // ===== IMAGEMETER SECTION FOR PDF =====
    // Load ImageMeter photos that have showInPdf enabled
    const pdfImagemeterPhotos = imagemeterPhotos.filter((p: any) => p.showInPdf === true);
    let imagemeterHtml = '';
    
    if (pdfImagemeterPhotos.length > 0) {
      const imagemeterItems = await Promise.all(pdfImagemeterPhotos.map(async (imPhoto: any) => {
        // Load snapshot image
        let snapshotData = '';
        try {
          const stored = await AsyncStorage.getItem(`imagemeter_pdf_${imPhoto.id}`);
          if (stored) {
            snapshotData = stored;
          }
        } catch (e) {
          console.warn('[PDF] Could not load imagemeter snapshot:', e);
        }
        
        // Fallback: use original image
        if (!snapshotData && imPhoto.imageUri) {
          if (imPhoto.imageUri.startsWith('data:')) {
            snapshotData = imPhoto.imageUri;
          } else {
            try {
              const b64 = await readAsStringAsync(imPhoto.imageUri, { encoding: 'base64' });
              snapshotData = `data:image/jpeg;base64,${b64}`;
            } catch (e) {
              console.warn('[PDF] Could not load imagemeter original image:', e);
            }
          }
        }
        
        // Build measurement summary HTML
        const refScale = imPhoto.referenceScale;
        const measurements = imPhoto.measurements || [];
        const areas = imPhoto.areaMeasurements || [];
        const angles = imPhoto.angleMeasurements || [];
        const components = imPhoto.buildingComponents || [];
        
        const fmtLen = (pixLen: number) => {
          if (!refScale) return `${Math.round(pixLen)} px`;
          const cm = pixLen / refScale;
          return cm >= 100 ? `${(cm / 100).toFixed(2).replace('.', ',')} m` : `${cm.toFixed(1).replace('.', ',')} cm`;
        };
        
        const fmtArea = (pixArea: number) => {
          if (!refScale) return `${Math.round(pixArea)} px²`;
          const cmSq = pixArea / (refScale * refScale);
          const unit = (imPhoto as any).areaUnit || 'auto';
          if (unit === 'm2') return `${(cmSq / 10000).toFixed(2).replace('.', ',')} m²`;
          if (unit === 'cm2') return `${cmSq.toFixed(2).replace('.', ',')} cm²`;
          return cmSq >= 10000 ? `${(cmSq / 10000).toFixed(2).replace('.', ',')} m²` : `${cmSq.toFixed(2).replace('.', ',')} cm²`;
        };
        
        // Point-in-polygon (ray casting) for subtraction area assignment
        const pip = (pt: { x: number; y: number }, poly: any[]) => {
          let inside = false;
          for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
            if ((poly[i].y > pt.y) !== (poly[j].y > pt.y) &&
                pt.x < ((poly[j].x - poly[i].x) * (pt.y - poly[i].y)) / (poly[j].y - poly[i].y) + poly[i].x) inside = !inside;
          }
          return inside;
        };
        
        let summaryRows = '';
        
        // Line measurements
        const lineMeasures = measurements.filter((m: any) => m.type !== 'reference');
        if (lineMeasures.length > 0) {
          summaryRows += `<tr><td colspan="2" style="font-weight: bold; background: #f0f4f8; padding: 6px 10px; font-size: 11px; color: #333;">📏 Maßlinien</td></tr>`;
          lineMeasures.forEach((m: any, idx: number) => {
            const dist = Math.sqrt(Math.pow(m.endPoint.x - m.startPoint.x, 2) + Math.pow(m.endPoint.y - m.startPoint.y, 2));
            const label = m.label || fmtLen(dist);
            summaryRows += `<tr><td style="padding: 4px 10px; font-size: 10px; color: #666;">${idx + 1}. ${m.label ? m.label : 'Maßlinie'}</td><td style="padding: 4px 10px; font-size: 10px; font-weight: bold; text-align: right;">${label}</td></tr>`;
          });
        }
        
        // Area measurements (with subtraction breakdown, e.g. "7,80 m² − 0,53 m² = 7,27 m²")
        if (areas.length > 0) {
          summaryRows += `<tr><td colspan="2" style="font-weight: bold; background: #f0f4f8; padding: 6px 10px; font-size: 11px; color: #333;">📊 Flächen</td></tr>`;
          const subAreas = areas.filter((a: any) => a.isSubtract);
          areas.forEach((a: any, idx: number) => {
            const rowName = `F${idx + 1}${a.name ? ' – ' + a.name : ''}`;
            if (a.isSubtract) {
              summaryRows += `<tr><td style="padding: 4px 10px; font-size: 10px; color: #c62828;">${rowName} (Abzug)</td><td style="padding: 4px 10px; font-size: 10px; font-weight: bold; text-align: right; color: #c62828;">− ${fmtArea(a.pixelArea)}</td></tr>`;
              return;
            }
            const contained = subAreas.filter((s: any) => {
              const scx = s.points.reduce((t: number, p: any) => t + p.x, 0) / s.points.length;
              const scy = s.points.reduce((t: number, p: any) => t + p.y, 0) / s.points.length;
              return pip({ x: scx, y: scy }, a.points);
            });
            if (contained.length > 0) {
              const subPix = contained.reduce((t: number, s: any) => t + s.pixelArea, 0);
              const netPix = Math.max(0, a.pixelArea - subPix);
              const breakdown = `${fmtArea(a.pixelArea)} − ${contained.map((s: any) => fmtArea(s.pixelArea)).join(' − ')} = <span style="color: #1565C0;">${fmtArea(netPix)}</span>`;
              summaryRows += `<tr><td style="padding: 4px 10px; font-size: 10px; color: #666;">${rowName} (netto)</td><td style="padding: 4px 10px; font-size: 10px; font-weight: bold; text-align: right;">${breakdown}</td></tr>`;
            } else {
              summaryRows += `<tr><td style="padding: 4px 10px; font-size: 10px; color: #666;">${rowName}</td><td style="padding: 4px 10px; font-size: 10px; font-weight: bold; text-align: right;">${fmtArea(a.pixelArea)}</td></tr>`;
            }
          });
          // Total sum of all net areas
          const totalNetPix = areas.reduce((total: number, a: any) => {
            if (a.isSubtract) return total;
            const subPix = subAreas.reduce((t: number, s: any) => {
              const scx = s.points.reduce((u: number, p: any) => u + p.x, 0) / s.points.length;
              const scy = s.points.reduce((u: number, p: any) => u + p.y, 0) / s.points.length;
              return pip({ x: scx, y: scy }, a.points) ? t + s.pixelArea : t;
            }, 0);
            return total + Math.max(0, a.pixelArea - subPix);
          }, 0);
          if (areas.some((a: any) => !a.isSubtract)) {
            summaryRows += `<tr><td style="padding: 5px 10px; font-size: 10px; font-weight: bold; color: #333; border-top: 1.5px solid #1565C0;">Σ Netto-Flächen</td><td style="padding: 5px 10px; font-size: 11px; font-weight: bold; text-align: right; color: #1565C0; border-top: 1.5px solid #1565C0;">${fmtArea(totalNetPix)}</td></tr>`;
          }
        }
        
        // Angle measurements
        if (angles.length > 0) {
          summaryRows += `<tr><td colspan="2" style="font-weight: bold; background: #f0f4f8; padding: 6px 10px; font-size: 11px; color: #333;">📐 Winkel</td></tr>`;
          angles.forEach((ang: any, idx: number) => {
            summaryRows += `<tr><td style="padding: 4px 10px; font-size: 10px; color: #666;">Winkel ${idx + 1}</td><td style="padding: 4px 10px; font-size: 10px; font-weight: bold; text-align: right;">${ang.angle}°</td></tr>`;
          });
        }
        
        // Components
        if (components.length > 0) {
          summaryRows += `<tr><td colspan="2" style="font-weight: bold; background: #f0f4f8; padding: 6px 10px; font-size: 11px; color: #333;">🏷️ Bauteile</td></tr>`;
          components.forEach((c: any, idx: number) => {
            summaryRows += `<tr><td colspan="2" style="padding: 4px 10px; font-size: 10px; color: #666;">${idx + 1}. ${c.label || c.type}</td></tr>`;
          });
        }
        
        // Reference info
        const refMeasure = measurements.find((m: any) => m.type === 'reference');
        let refInfo = '';
        if (refMeasure && refScale) {
          const refLen = refMeasure.realLength;
          refInfo = `<div style="font-size: 9px; color: #888; margin-top: 6px; text-align: right;">Referenzmaß: ${refLen ? (refLen >= 100 ? `${(refLen / 100).toFixed(2).replace('.', ',')} m` : `${refLen.toFixed(1).replace('.', ',')} cm`) : '?'}</div>`;
        }
        
        return `
          <div style="page-break-inside: avoid; break-inside: avoid; margin-bottom: 20px; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden; background: #fff;">
            <div style="padding: 10px; background: #f8f9fa; border-bottom: 1px solid #eee;">
              <div style="font-size: 13px; font-weight: bold; color: #333;">📷 ${imPhoto.name || 'Fotomessung'}</div>
            </div>
            ${snapshotData ? `
              <div style="text-align: center; background: #000;">
                <img src="${snapshotData}" style="display: block; max-width: 100%; max-height: 500px; margin: 0 auto; object-fit: contain;" />
              </div>
            ` : ''}
            ${summaryRows ? `
              <table style="width: 100%; border-collapse: collapse; margin: 0;">
                ${summaryRows}
              </table>
            ` : ''}
            ${refInfo}
          </div>
        `;
      }));
      
      imagemeterHtml = `
        <div style="page-break-before: always;">
          <h2 style="background: ${toolsBgColor}; color: ${toolsTextColor}; padding: ${toolsSize.padding}px 14px; border-radius: 4px; font-size: ${toolsSize.h1Size}px; margin: 0 0 16px 0;">📐 Fotomessungen</h2>
          ${imagemeterItems.join('')}
        </div>
      `;
    }
    
    // Helper function to calculate polygon area
    const calculatePolygonArea = (points: Array<{x: number, y: number}>, scale: number = 100) => {
      if (points.length < 3) return 0;
      let area = 0;
      for (let i = 0; i < points.length; i++) {
        const j = (i + 1) % points.length;
        area += points[i].x * points[j].y;
        area -= points[j].x * points[i].y;
      }
      return Math.abs(area / 2) / (scale * scale);
    };
    
    // Helper function to calculate line length
    const calculateLineLength = (p1: {x: number, y: number}, p2: {x: number, y: number}, scale: number = 100) => {
      return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2)) / scale;
    };
    
    // Category colors
    const getCategoryColor = (category: string): string => {
      // First try to find color from loaded line categories
      const loadedCat = pdfLineCategories.find(c => c.name === category);
      if (loadedCat) {
        return loadedCat.color;
      }
      // Fallback to hardcoded colors
      const colors: { [key: string]: string } = {
        'Ortgang': '#4CAF50', 'Traufe': '#2196F3', 'First': '#9C27B0',
        'Kehle': '#673AB7', 'Grat': '#FF9800', 'Fensterbank': '#795548',
        'Sturz': '#607D8B', 'Laibung': '#E91E63', 'Rinne': '#00BCD4',
        'Fensterumfang': '#FF5722', 'Sockelleiste': '#795548',
        'Ortgang rechts': '#4CAF50', 'Ortgang links': '#4CAF50',
      };
      return colors[category] || '#607D8B';
    };
    
    // Generate FULL SVG drawing for a calculation (large, with all details)
    const generateFullCalcSvg = (calc: any) => {
      const polygons = calc.polygons || [];
      const calcLines = calc.lines || [];
      const calcScale = calc.scale || 100;
      const calcBackgroundImage = calc.backgroundImage || null;
      if (polygons.length === 0) return '';
      
      // Find bounding box
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      polygons.forEach((p: any) => {
        p.points.forEach((pt: any) => {
          minX = Math.min(minX, pt.x);
          minY = Math.min(minY, pt.y);
          maxX = Math.max(maxX, pt.x);
          maxY = Math.max(maxY, pt.y);
        });
      });
      
      const padding = 50;
      const width = maxX - minX + padding * 2;
      const height = maxY - minY + padding * 2;
      
      // Scale to fit on page - FULL WIDTH for printing (A4 minus margins ~700px)
      const maxWidth = 700;
      const scaleRatio = Math.min(maxWidth / width, 550 / height);
      const svgWidth = width * scaleRatio;
      const svgHeight = height * scaleRatio;
      
      const transformPoint = (pt: any) => ({
        x: (pt.x - minX + padding) * scaleRatio,
        y: (pt.y - minY + padding) * scaleRatio
      });
      
      // Calculate areas for overlay
      const mainAreas = polygons.filter((p: any) => p.type === 'main');
      const deductionAreas = polygons.filter((p: any) => p.type === 'deduction');
      const grossArea = mainAreas.reduce((sum: number, p: any) => sum + calculatePolygonArea(p.points, calcScale), 0);
      const deductionsTotal = deductionAreas.reduce((sum: number, p: any) => sum + calculatePolygonArea(p.points, calcScale), 0);
      const netArea = grossArea - deductionsTotal;
      
      let svgContent = `<svg width="${svgWidth}" height="${svgHeight}" viewBox="0 0 ${svgWidth} ${svgHeight}" style="background: #fff; border: 1px solid #ddd; border-radius: 6px;">`;
      
      // Draw light grid
      const gridSize = 25 * scaleRatio;
      svgContent += `<defs><pattern id="grid-${calc.id || 'default'}" width="${gridSize}" height="${gridSize}" patternUnits="userSpaceOnUse">
        <path d="M ${gridSize} 0 L 0 0 0 ${gridSize}" fill="none" stroke="#f5f5f5" stroke-width="0.5"/>
      </pattern></defs>`;
      svgContent += `<rect width="100%" height="100%" fill="url(#grid-${calc.id || 'default'})"/>`;
      
      // Draw polygons - NO FILL for printing (save ink)
      polygons.forEach((polygon: any) => {
        const points = polygon.points.map((p: any) => {
          const tp = transformPoint(p);
          return `${tp.x},${tp.y}`;
        }).join(' ');
        
        const defaultStrokeColor = polygon.type === 'main' ? '#4CAF50' : '#f44336';
        
        // First draw the default polygon outline
        svgContent += `<polygon points="${points}" fill="none" stroke="${defaultStrokeColor}" stroke-width="2"/>`;
        
        // Now overdraw edges that have categories with their category color
        polygon.points.forEach((point: any, index: number) => {
          const nextPoint = polygon.points[(index + 1) % polygon.points.length];
          const lineCategory = calcLines.find((l: any) => l.polygonId === polygon.id && l.pointIndex === index);
          
          if (lineCategory) {
            const tp1 = transformPoint(point);
            const tp2 = transformPoint(nextPoint);
            const catColor = getCategoryColor(lineCategory.category);
            // Draw colored line over the default
            svgContent += `<line x1="${tp1.x}" y1="${tp1.y}" x2="${tp2.x}" y2="${tp2.y}" stroke="${catColor}" stroke-width="3"/>`;
          }
        });
        
        // Draw edge lengths
        polygon.points.forEach((point: any, index: number) => {
          const nextPoint = polygon.points[(index + 1) % polygon.points.length];
          const tp1 = transformPoint(point);
          const tp2 = transformPoint(nextPoint);
          
          const midX = (tp1.x + tp2.x) / 2;
          const midY = (tp1.y + tp2.y) / 2;
          
          const length = calculateLineLength(point, nextPoint, calcScale);
          if (length < 0.1) return;
          
          // Check if this edge has a category
          const lineCategory = calcLines.find((l: any) => l.polygonId === polygon.id && l.pointIndex === index);
          const bgColor = lineCategory ? getCategoryColor(lineCategory.category) : (polygon.type === 'main' ? '#4CAF50' : '#f44336');
          
          // Get shortcut for category
          let labelText = `${length.toFixed(2)}m`;
          let labelWidth = 44;
          if (lineCategory) {
            const catInfo = pdfLineCategories.find(c => c.name === lineCategory.category);
            if (catInfo?.shortcut) {
              labelText = `${catInfo.shortcut} ${length.toFixed(2)}m`;
              labelWidth = 62;
            }
          }
          
          // Draw label background
          const labelHeight = 14;
          svgContent += `<rect x="${midX - labelWidth/2}" y="${midY - labelHeight/2}" width="${labelWidth}" height="${labelHeight}" rx="7" fill="${bgColor}"/>`;
          svgContent += `<text x="${midX}" y="${midY + 4}" text-anchor="middle" font-size="9" font-weight="bold" fill="white">${labelText}</text>`;
        });
        
        // Draw corner points (smaller)
        polygon.points.forEach((point: any) => {
          const tp = transformPoint(point);
          svgContent += `<circle cx="${tp.x}" cy="${tp.y}" r="3" fill="${polygon.type === 'main' ? '#4CAF50' : '#f44336'}" stroke="white" stroke-width="1"/>`;
        });
        
        // Draw area label in center of polygon
        if (polygon.points.length >= 3) {
          const centerX = polygon.points.reduce((sum: number, p: any) => sum + p.x, 0) / polygon.points.length;
          const centerY = polygon.points.reduce((sum: number, p: any) => sum + p.y, 0) / polygon.points.length;
          const tc = transformPoint({ x: centerX, y: centerY });
          const polyArea = calculatePolygonArea(polygon.points, calcScale);
          const areaSign = polygon.type === 'main' ? '+' : '-';
          const areaColor = polygon.type === 'main' ? '#4CAF50' : '#f44336';
          
          // Draw area name and value
          svgContent += `<rect x="${tc.x - 35}" y="${tc.y - 18}" width="70" height="36" rx="4" fill="white" fill-opacity="0.9" stroke="${areaColor}" stroke-width="1"/>`;
          svgContent += `<text x="${tc.x}" y="${tc.y - 4}" text-anchor="middle" font-size="9" font-weight="bold" fill="#333">${polygon.name || (polygon.type === 'main' ? 'Fläche' : 'Abzug')}</text>`;
          svgContent += `<text x="${tc.x}" y="${tc.y + 10}" text-anchor="middle" font-size="10" font-weight="bold" fill="${areaColor}">${areaSign}${polyArea.toFixed(2)}m²</text>`;
        }
      });
      
      // Render annotations (shapes, texts, memos)
      const calcAnnotations = calc.annotations || {};
      
      // Render shapes
      if (calcAnnotations.shapes && calcAnnotations.shapes.length > 0) {
        calcAnnotations.shapes.forEach((shape: any) => {
          const tp1 = transformPoint(shape.startPoint);
          const tp2 = transformPoint(shape.endPoint);
          const color = shape.color || '#FF0000';
          const sw = Math.max(1, shape.strokeWidth * scaleRatio * 0.5);
          
          if (shape.type === 'rectangle' || shape.type === 'rect') {
            const x = Math.min(tp1.x, tp2.x);
            const y = Math.min(tp1.y, tp2.y);
            const w = Math.abs(tp2.x - tp1.x);
            const h = Math.abs(tp2.y - tp1.y);
            svgContent += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="${color}" stroke-width="${sw}"/>`;
          } else if (shape.type === 'circle') {
            const cx = (tp1.x + tp2.x) / 2;
            const cy = (tp1.y + tp2.y) / 2;
            const rx = Math.abs(tp2.x - tp1.x) / 2;
            const ry = Math.abs(tp2.y - tp1.y) / 2;
            svgContent += `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="none" stroke="${color}" stroke-width="${sw}"/>`;
          } else if (shape.type === 'arrow') {
            const angle = Math.atan2(tp2.y - tp1.y, tp2.x - tp1.x);
            const headLen = 10;
            svgContent += `<line x1="${tp1.x}" y1="${tp1.y}" x2="${tp2.x}" y2="${tp2.y}" stroke="${color}" stroke-width="${sw}"/>`;
            svgContent += `<polygon points="${tp2.x},${tp2.y} ${tp2.x - headLen * Math.cos(angle - Math.PI/6)},${tp2.y - headLen * Math.sin(angle - Math.PI/6)} ${tp2.x - headLen * Math.cos(angle + Math.PI/6)},${tp2.y - headLen * Math.sin(angle + Math.PI/6)}" fill="${color}"/>`;
          } else if (shape.type === 'line') {
            svgContent += `<line x1="${tp1.x}" y1="${tp1.y}" x2="${tp2.x}" y2="${tp2.y}" stroke="${color}" stroke-width="${sw}"/>`;
          }
        });
      }
      
      // Render text annotations
      if (calcAnnotations.texts && calcAnnotations.texts.length > 0) {
        calcAnnotations.texts.forEach((text: any) => {
          // Handle both old format (position.x/y) and new format (x/y directly)
          const textX = text.x ?? text.position?.x ?? 0;
          const textY = text.y ?? text.position?.y ?? 0;
          const tp = transformPoint({ x: textX, y: textY });
          const fontSize = Math.max(8, (text.fontSize || 16) * scaleRatio * 0.4);
          svgContent += `<text x="${tp.x}" y="${tp.y}" font-size="${fontSize}" fill="${text.color || '#333'}">${text.text}</text>`;
        });
      }
      
      // Render memo pointers
      if (calcAnnotations.memos && calcAnnotations.memos.length > 0) {
        calcAnnotations.memos.forEach((memo: any) => {
          // Handle both old format (anchorPoint/labelOffset) and new format (x1/y1/x2/y2)
          const anchorX = memo.x2 ?? memo.anchorPoint?.x ?? 0;
          const anchorY = memo.y2 ?? memo.anchorPoint?.y ?? 0;
          const labelX = memo.x1 ?? (memo.anchorPoint?.x + memo.labelOffset?.x) ?? 0;
          const labelY = memo.y1 ?? (memo.anchorPoint?.y + memo.labelOffset?.y) ?? 0;
          
          const anchor = transformPoint({ x: anchorX, y: anchorY });
          const label = transformPoint({ x: labelX, y: labelY });
          const color = memo.color || '#FF9800';
          
          // Line from anchor to label
          svgContent += `<line x1="${anchor.x}" y1="${anchor.y}" x2="${label.x}" y2="${label.y}" stroke="${color}" stroke-width="1.5" stroke-dasharray="3,2"/>`;
          // Anchor dot
          svgContent += `<circle cx="${anchor.x}" cy="${anchor.y}" r="4" fill="${color}"/>`;
          // Label background and text
          const memoText = memo.text || '';
          const textWidth = memoText.length * 5 + 10;
          svgContent += `<rect x="${label.x - 3}" y="${label.y - 10}" width="${textWidth}" height="16" rx="3" fill="white" stroke="${color}" stroke-width="1"/>`;
          svgContent += `<text x="${label.x + 2}" y="${label.y + 2}" font-size="9" fill="${color}">${memoText}</text>`;
        });
      }
      
      svgContent += '</svg>';
      
      // If there's a background image, show it ABOVE the drawing (not overlapping)
      if (calcBackgroundImage) {
        return `
          <div>
            <div style="display: flex; justify-content: flex-end; margin-bottom: 6px;">
              <div style="text-align: center;">
                <div style="font-size: 7px; color: #666; margin-bottom: 2px;">Referenzbild</div>
                <img src="${calcBackgroundImage}" style="width: 80px; max-height: 60px; object-fit: contain; border-radius: 4px; border: 1px solid #ddd; background: #fff;" />
              </div>
            </div>
            <div>${svgContent}</div>
          </div>
        `;
      }
      
      return svgContent;
    };
    
    // Generate Area Calculations HTML - Compact details with two-column positions
    const areaCalcsHtml = areaCalculations.length > 0 ? areaCalculations.map((calc, index) => {
      const polygons = calc.polygons || [];
      const calcLines = calc.lines || [];
      const calcScale = calc.scale || 100;
      const mainAreas = polygons.filter((p: any) => p.type === 'main');
      const deductionAreas = polygons.filter((p: any) => p.type === 'deduction');
      
      const grossArea = mainAreas.reduce((sum: number, p: any) => sum + calculatePolygonArea(p.points, calcScale), 0);
      const deductionsTotal = deductionAreas.reduce((sum: number, p: any) => sum + calculatePolygonArea(p.points, calcScale), 0);
      const netArea = grossArea - deductionsTotal;
      
      // Group lines by category
      const linesByCategory: { [key: string]: number } = {};
      calcLines.forEach((line: any) => {
        const polygon = polygons.find((p: any) => p.id === line.polygonId);
        if (polygon && polygon.points && polygon.points.length > line.pointIndex) {
          const point = polygon.points[line.pointIndex];
          const nextPoint = polygon.points[(line.pointIndex + 1) % polygon.points.length];
          const length = calculateLineLength(point, nextPoint, calcScale);
          if (!linesByCategory[line.category]) linesByCategory[line.category] = 0;
          linesByCategory[line.category] += length;
        }
      });
      
      return `
        <div style="margin-bottom: 12px; page-break-inside: avoid;">
          <!-- Header with name and result - more compact -->
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; padding-bottom: 4px; border-bottom: 2px solid #4CAF50;">
            <span style="font-size: 12px; font-weight: bold;">${calc.name || `Berechnung ${index + 1}`}</span>
            <span style="font-size: 16px; font-weight: bold; color: #4CAF50;">${netArea.toFixed(2)} m²</span>
          </div>
          
          <!-- Drawing - Full width -->
          <div style="text-align: center; margin-bottom: 8px;">
            ${generateFullCalcSvg(calc)}
          </div>
          
          <!-- Compact calculation summary - ohne Hintergrund, nur border-left -->
          <div style="display: flex; gap: 6px; font-size: 8px; line-height: 1.2;">
            <!-- Rechenweg -->
            <div style="padding: 3px 6px; border-left: 2px solid #4CAF50; font-family: monospace; min-width: 90px;">
              <div style="font-size: 7px; color: #666; font-weight: 600;">Rechenweg:</div>
              <div>Brutto: ${grossArea.toFixed(2)} m²</div>
              ${deductionsTotal > 0 ? `<div>− ${deductionsTotal.toFixed(2)} m²</div>` : ''}
              <div style="border-top: 1px solid #333; margin-top: 1px; padding-top: 1px; font-weight: bold;">= ${netArea.toFixed(2)} m²</div>
            </div>
            
            <!-- Flächen -->
            <div style="flex: 1; padding: 3px 6px; border-left: 2px solid #666;">
              ${mainAreas.length > 0 ? `
                <div style="margin-bottom: 2px;">
                  <span style="font-weight: 600; color: #4CAF50; font-size: 7px;">Flächen: </span>
                  ${mainAreas.map((p: any) => `<span style="margin-right: 4px;">${p.name} +${calculatePolygonArea(p.points, calcScale).toFixed(2)}m²</span>`).join('')}
                </div>
              ` : ''}
              ${deductionAreas.length > 0 ? `
                <div>
                  <span style="font-weight: 600; color: #f44336; font-size: 7px;">Abzüge: </span>
                  ${deductionAreas.map((p: any) => `<span style="margin-right: 4px;">${p.name} -${calculatePolygonArea(p.points, calcScale).toFixed(2)}m²</span>`).join('')}
                </div>
              ` : ''}
            </div>
            
            <!-- Linien -->
            ${Object.keys(linesByCategory).length > 0 ? `
              <div style="padding: 3px 6px; border-left: 2px solid #FF9800; min-width: 150px;">
                <div style="font-weight: 600; color: #e65100; font-size: 7px; margin-bottom: 1px;">Linien:</div>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1px 8px;">
                  ${Object.entries(linesByCategory).map(([cat, length]) => `
                    <div style="display: flex; justify-content: space-between; font-size: 7px;">
                      <span style="display: flex; align-items: center;">
                        <span style="width: 4px; height: 4px; border-radius: 50%; background: ${getCategoryColor(cat)}; margin-right: 2px; display: inline-block;"></span>
                        ${formatCategoryForPdf(cat)}
                      </span>
                      <span style="margin-left: 2px;">${(length as number).toFixed(2)}m</span>
                    </div>
                  `).join('')}
                </div>
              </div>
            ` : ''}
          </div>
        </div>
      `;
    }).join('<hr style="border: none; border-top: 1px dashed #ddd; margin: 8px 0;"/>') : '<p class="empty">Keine Flächenberechnungen erfasst</p>';

    // Generate combined area calculations (Drawing + Details together for each calculation)
    const generateCombinedAreaCalcs = () => {
      if (areaCalculations.length === 0) return '<p class="empty">Keine Flächenberechnungen erfasst</p>';
      
      return areaCalculations.map((calc, calcIndex) => {
        const polygons = calc.polygons || [];
        const calcLines = calc.lines || [];
        const calcScale = calc.scale || 100;
        const mainAreas = polygons.filter((p: any) => p.type === 'main');
        const deductionAreas = polygons.filter((p: any) => p.type === 'deduction');
        
        const grossArea = mainAreas.reduce((sum: number, p: any) => sum + calculatePolygonArea(p.points, calcScale), 0);
        const deductionsTotal = deductionAreas.reduce((sum: number, p: any) => sum + calculatePolygonArea(p.points, calcScale), 0);
        const netArea = grossArea - deductionsTotal;
        
        // Generate lines per polygon for details
        const generateLinesForPolygon = (polygon: any) => {
          const polygonLines = calcLines.filter((l: any) => l.polygonId === polygon.id);
          const categoryGroups: { [key: string]: number[] } = {};
          
          polygonLines.forEach((line: any) => {
            if (polygon.points && polygon.points.length > line.pointIndex) {
              const point = polygon.points[line.pointIndex];
              const nextPoint = polygon.points[(line.pointIndex + 1) % polygon.points.length];
              const length = calculateLineLength(point, nextPoint, calcScale);
              if (length > 0.01) {
                if (!categoryGroups[line.category]) {
                  categoryGroups[line.category] = [];
                }
                categoryGroups[line.category].push(length);
              }
            }
          });
          
          if (Object.keys(categoryGroups).length === 0) {
            return '<div style="font-size: 9px; color: #999; font-style: italic; margin-left: 8px;">Keine Kategorien</div>';
          }
          
          return Object.entries(categoryGroups).map(([category, lengths]) => {
            const total = (lengths as number[]).reduce((sum, l) => sum + l, 0);
            const catColor = getCategoryColor(category);
            const breakdown = lengths.length >= 2 ? `<div style="font-size: 8px; color: ${catColor}; margin-left: 16px; opacity: 0.8;">${(lengths as number[]).map(l => l.toFixed(2)).join(' + ')} = ${total.toFixed(2)} m</div>` : '';
            const displayName = formatCategoryForPdf(category);
            
            return `
              <div style="margin-bottom: 2px;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                  <span style="display: flex; align-items: center; color: ${catColor};">
                    <span style="width: 6px; height: 6px; border-radius: 50%; background: ${catColor}; margin-right: 4px; display: inline-block;"></span>
                    <span style="font-size: 9px; font-weight: 600;">${displayName}</span>
                  </span>
                  <span style="font-size: 9px; font-weight: 700; color: ${catColor};">${total.toFixed(2)} m</span>
                </div>
                ${breakdown}
              </div>
            `;
          }).join('');
        };
        
        // Calculate total lines by category
        const totalLinesByCategory: { [key: string]: number } = {};
        calcLines.forEach((line: any) => {
          const polygon = polygons.find((p: any) => p.id === line.polygonId);
          if (polygon && polygon.points && polygon.points.length > line.pointIndex) {
            const point = polygon.points[line.pointIndex];
            const nextPoint = polygon.points[(line.pointIndex + 1) % polygon.points.length];
            const length = calculateLineLength(point, nextPoint, calcScale);
            if (!totalLinesByCategory[line.category]) totalLinesByCategory[line.category] = 0;
            totalLinesByCategory[line.category] += length;
          }
        });
        
        return `
          <!-- ========== BERECHNUNG ${calcIndex + 1}: ZEICHNUNG ========== -->
          <div style="page-break-before: ${calcIndex > 0 ? 'always' : 'auto'}; margin-bottom: 0;">
            <!-- Überschrift für die Zeichnung (Tinte sparend) -->
            <div style="border-bottom: 3px solid #4CAF50; padding-bottom: 8px; margin-bottom: 10px;">
              <div style="display: flex; justify-content: space-between; align-items: flex-end;">
                <div>
                  <div style="font-size: 9px; text-transform: uppercase; letter-spacing: 1px; color: #666;">Flächenberechnung ${calcIndex + 1}</div>
                  <div style="font-size: 16px; font-weight: bold; color: #333;">${calc.name || `Berechnung ${calcIndex + 1}`}</div>
                </div>
                <div style="text-align: right;">
                  <div style="font-size: 9px; color: #666;">Nettofläche</div>
                  <div style="font-size: 22px; font-weight: bold; color: #4CAF50;">${netArea.toFixed(2)} m²</div>
                </div>
              </div>
            </div>
            
            <!-- Zeichnung - Mindestens 60% der Seite -->
            <div style="border: 1px solid #ddd; border-radius: 4px; padding: 10px; background: #fafafa; min-height: 450px; display: flex; align-items: center; justify-content: center;">
              ${generateFullCalcSvg(calc)}
            </div>
            
            <!-- Kurzübersicht unter der Zeichnung - kompakt, kein Hintergrund -->
            <div style="display: flex; gap: 6px; margin-top: 6px; font-size: 8px;">
              <div style="padding: 2px 6px; border-left: 2px solid #4CAF50;">
                <span style="color: #666; font-weight: 600;">Rechenweg: </span>
                <span>Brutto ${grossArea.toFixed(2)} m²${deductionsTotal > 0 ? ` − ${deductionsTotal.toFixed(2)} m²` : ''} = <strong>${netArea.toFixed(2)} m²</strong></span>
              </div>
              
              ${Object.keys(totalLinesByCategory).length > 0 ? `
                <div style="flex: 1; padding: 2px 6px; border-left: 2px solid #FF9800;">
                  <span style="color: #e65100; font-weight: 600;">Linien: </span>
                  ${Object.entries(totalLinesByCategory).map(([cat, length]) => {
                    const catColor = getCategoryColor(cat);
                    return `<span style="margin-right: 6px;"><span style="display: inline-block; width: 4px; height: 4px; border-radius: 50%; background: ${catColor}; margin-right: 2px; vertical-align: middle;"></span><span style="color: ${catColor};">${formatCategoryForPdf(cat)} ${(length as number).toFixed(2)}m</span></span>`;
                  }).join('')}
                </div>
              ` : ''}
            </div>
          </div>
          
          ${showCalcDetailsPage ? `
          <!-- ========== BERECHNUNG ${calcIndex + 1}: DETAILBERECHNUNG ========== -->
          <div style="page-break-before: always;">
            <!-- Überschrift - schlank, nur border-bottom -->
            <div style="border-bottom: 2px solid #1976d2; padding-bottom: 4px; margin-bottom: 8px;">
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <div>
                  <span style="font-size: 8px; text-transform: uppercase; letter-spacing: 0.5px; color: #666;">Details: </span>
                  <span style="font-size: 12px; font-weight: bold; color: #333;">${calc.name || `Berechnung ${calcIndex + 1}`}</span>
                </div>
                <div style="font-size: 14px; font-weight: bold; color: #1976d2;">${netArea.toFixed(2)} m²</div>
              </div>
            </div>
            
            <!-- Kompakte Detail-Tabelle - ohne Hintergrundfarbe -->
            <div style="display: flex; gap: 8px; font-size: 8px;">
              <!-- Hauptflächen -->
              ${mainAreas.length > 0 ? `
                <div style="flex: 1;">
                  <div style="font-size: 9px; font-weight: 700; color: #4CAF50; border-bottom: 1px solid #4CAF50; padding-bottom: 2px; margin-bottom: 4px;">+ Hauptflächen</div>
                  ${mainAreas.map((p: any) => `
                    <div style="border-left: 2px solid #4CAF50; padding: 2px 6px; margin-bottom: 3px;">
                      <div style="display: flex; justify-content: space-between;">
                        <span style="font-weight: 600;">${p.name}</span>
                        <span style="font-weight: 600; color: #4CAF50;">+${calculatePolygonArea(p.points, calcScale).toFixed(2)} m²</span>
                      </div>
                      <div style="margin-top: 1px;">${generateLinesForPolygon(p)}</div>
                    </div>
                  `).join('')}
                </div>
              ` : ''}
              
              <!-- Abzüge -->
              ${deductionAreas.length > 0 ? `
                <div style="flex: 1;">
                  <div style="font-size: 9px; font-weight: 700; color: #f44336; border-bottom: 1px solid #f44336; padding-bottom: 2px; margin-bottom: 4px;">− Abzüge</div>
                  ${deductionAreas.map((p: any) => `
                    <div style="border-left: 2px solid #f44336; padding: 2px 6px; margin-bottom: 3px;">
                      <div style="display: flex; justify-content: space-between;">
                        <span style="font-weight: 600;">${p.name}</span>
                        <span style="font-weight: 600; color: #f44336;">−${calculatePolygonArea(p.points, calcScale).toFixed(2)} m²</span>
                      </div>
                      <div style="margin-top: 1px;">${generateLinesForPolygon(p)}</div>
                    </div>
                  `).join('')}
                </div>
              ` : ''}
            </div>
            
            <!-- Endergebnis - zwei Boxen mit Rahmen wie auf dem Bild -->
            <div style="display: flex; gap: 6px; margin-top: 8px;">
              <!-- Flächenberechnung Box - blauer Rahmen -->
              <div style="flex: 0.8; padding: 4px 8px; border: 1px solid #1976d2; border-radius: 3px;">
                <div style="font-size: 9px; font-weight: 700; color: #1976d2; margin-bottom: 3px;">Flächenberechnung</div>
                <div style="font-family: monospace; font-size: 9px; line-height: 1.3;">
                  <div>Brutto: ${grossArea.toFixed(2)} m²</div>
                  ${deductionsTotal > 0 ? `<div>− Abzüge: ${deductionsTotal.toFixed(2)} m²</div>` : ''}
                  <div style="border-top: 1px solid #333; margin-top: 3px; padding-top: 3px; font-weight: 700; font-size: 11px; color: #4CAF50;">
                    = Netto: ${netArea.toFixed(2)} m²
                  </div>
                </div>
              </div>
              
              <!-- Linien Zusammenfassung Box - oranger Rahmen, breiter -->
              ${Object.keys(totalLinesByCategory).length > 0 ? `
                <div style="flex: 1.2; padding: 4px 8px; border: 1px solid #FF9800; border-radius: 3px;">
                  <div style="font-size: 9px; font-weight: 700; color: #FF9800; margin-bottom: 3px;">Linien Zusammenfassung</div>
                  <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1px 6px;">
                    ${Object.entries(totalLinesByCategory).map(([cat, length]) => `
                      <div style="display: flex; justify-content: space-between; font-size: 8px; white-space: nowrap; overflow: hidden;">
                        <span style="display: flex; align-items: center; min-width: 0; overflow: hidden;">
                          <span style="width: 5px; height: 5px; border-radius: 50%; background: ${getCategoryColor(cat)}; margin-right: 3px; flex-shrink: 0;"></span>
                          <span style="overflow: hidden; text-overflow: ellipsis;">${formatCategoryForPdf(cat)}</span>
                        </span>
                        <span style="font-weight: 600; color: ${getCategoryColor(cat)}; margin-left: 4px; flex-shrink: 0;">${(length as number).toFixed(2)} m</span>
                      </div>
                    `).join('')}
                  </div>
                  <div style="border-top: 1px solid #333; margin-top: 3px; padding-top: 3px; display: flex; justify-content: space-between; font-weight: 700; font-size: 9px;">
                    <span>Gesamt:</span>
                    <span>${Object.values(totalLinesByCategory).reduce((sum: number, l) => sum + (l as number), 0).toFixed(2)} m</span>
                  </div>
                </div>
              ` : ''}
            </div>
          </div>
          ` : ''}
        `;
      }).join('');
    };

    // Generate detailed calculation pages (optional, controlled by showCalcDetailsPage)
    const generateDetailedCalcPages = () => {
      if (!showCalcDetailsPage || areaCalculations.length === 0) return '';
      
      return areaCalculations.map((calc, calcIndex) => {
        const polygons = calc.polygons || [];
        const calcLines = calc.lines || [];
        const calcScale = calc.scale || 100;
        const mainAreas = polygons.filter((p: any) => p.type === 'main');
        const deductionAreas = polygons.filter((p: any) => p.type === 'deduction');
        
        const grossArea = mainAreas.reduce((sum: number, p: any) => sum + calculatePolygonArea(p.points, calcScale), 0);
        const deductionsTotal = deductionAreas.reduce((sum: number, p: any) => sum + calculatePolygonArea(p.points, calcScale), 0);
        const netArea = grossArea - deductionsTotal;
        
        // Generate lines per polygon
        const generateLinesForPolygon = (polygon: any) => {
          const polygonLines = calcLines.filter((l: any) => l.polygonId === polygon.id);
          const categoryGroups: { [key: string]: number[] } = {};
          
          polygonLines.forEach((line: any) => {
            if (polygon.points && polygon.points.length > line.pointIndex) {
              const point = polygon.points[line.pointIndex];
              const nextPoint = polygon.points[(line.pointIndex + 1) % polygon.points.length];
              const length = calculateLineLength(point, nextPoint, calcScale);
              if (length > 0.01) {
                if (!categoryGroups[line.category]) {
                  categoryGroups[line.category] = [];
                }
                categoryGroups[line.category].push(length);
              }
            }
          });
          
          if (Object.keys(categoryGroups).length === 0) {
            return '<div style="font-size: 10px; color: #999; font-style: italic; margin-left: 12px;">Keine Linien-Kategorien zugewiesen</div>';
          }
          
          return Object.entries(categoryGroups).map(([category, lengths]) => {
            const total = (lengths as number[]).reduce((sum, l) => sum + l, 0);
            const breakdown = lengths.length >= 2 ? `<div style="font-size: 9px; color: #666; margin-left: 20px;">${(lengths as number[]).map(l => l.toFixed(2)).join(' + ')} = ${total.toFixed(2)} m</div>` : '';
            const displayName = formatCategoryForPdf(category);
            
            return `
              <div style="margin-bottom: 4px;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                  <span style="display: flex; align-items: center;">
                    <span style="width: 8px; height: 8px; border-radius: 50%; background: ${getCategoryColor(category)}; margin-right: 6px; display: inline-block;"></span>
                    <span style="font-size: 11px;">${displayName}</span>
                  </span>
                  <span style="font-size: 11px; font-weight: 600; color: ${getCategoryColor(category)};">${total.toFixed(2)} m</span>
                </div>
                ${breakdown}
              </div>
            `;
          }).join('');
        };
        
        // Calculate total lines by category for this calculation
        const totalLinesByCategory: { [key: string]: number } = {};
        calcLines.forEach((line: any) => {
          const polygon = polygons.find((p: any) => p.id === line.polygonId);
          if (polygon && polygon.points && polygon.points.length > line.pointIndex) {
            const point = polygon.points[line.pointIndex];
            const nextPoint = polygon.points[(line.pointIndex + 1) % polygon.points.length];
            const length = calculateLineLength(point, nextPoint, calcScale);
            if (!totalLinesByCategory[line.category]) totalLinesByCategory[line.category] = 0;
            totalLinesByCategory[line.category] += length;
          }
        });
        
        return `
          <div class="new-page" style="page-break-before: always;">
            <h2 style="color: #1976d2; font-size: 12px; margin-bottom: 6px; padding-bottom: 4px; border-bottom: 2px solid #1976d2;">
              Details: ${calc.name || `Berechnung ${calcIndex + 1}`}
            </h2>
            
            <!-- Main Areas + Deductions Side by Side - kompakt -->
            <div style="display: flex; gap: 8px; margin-bottom: 6px;">
              <!-- Main Areas Section -->
              ${mainAreas.length > 0 ? `
                <div style="flex: 1;">
                  <h3 style="font-size: 9px; color: #4CAF50; margin-bottom: 3px; border-bottom: 1px solid #4CAF50; padding-bottom: 2px;">Hauptflächen</h3>
                  ${mainAreas.map((p: any) => `
                    <div style="border-left: 2px solid #4CAF50; padding: 2px 6px; margin-bottom: 2px;">
                      <div style="display: flex; justify-content: space-between;">
                        <span style="font-weight: 600; font-size: 8px;">${p.name}</span>
                        <span style="font-weight: 600; color: #4CAF50; font-size: 8px;">+${calculatePolygonArea(p.points, calcScale).toFixed(2)} m²</span>
                      </div>
                      <div style="font-size: 7px; margin-top: 1px;">${generateLinesForPolygon(p)}</div>
                    </div>
                  `).join('')}
                  <div style="padding: 2px 6px; display: flex; justify-content: space-between; border-top: 1px solid #4CAF50;">
                    <span style="font-weight: 600; font-size: 8px;">Brutto:</span>
                    <span style="font-weight: 700; font-size: 8px;">${grossArea.toFixed(2)} m²</span>
                  </div>
                </div>
              ` : ''}
              
              <!-- Deduction Areas Section -->
              ${deductionAreas.length > 0 ? `
                <div style="flex: 1;">
                  <h3 style="font-size: 9px; color: #f44336; margin-bottom: 3px; border-bottom: 1px solid #f44336; padding-bottom: 2px;">Abzüge</h3>
                  ${deductionAreas.map((p: any) => `
                    <div style="border-left: 2px solid #f44336; padding: 2px 6px; margin-bottom: 2px;">
                      <div style="display: flex; justify-content: space-between;">
                        <span style="font-weight: 600; font-size: 8px;">${p.name}</span>
                        <span style="font-weight: 600; color: #f44336; font-size: 8px;">-${calculatePolygonArea(p.points, calcScale).toFixed(2)} m²</span>
                      </div>
                      <div style="font-size: 7px; margin-top: 1px;">${generateLinesForPolygon(p)}</div>
                    </div>
                  `).join('')}
                  <div style="padding: 2px 6px; display: flex; justify-content: space-between; border-top: 1px solid #f44336;">
                    <span style="font-weight: 600; font-size: 8px;">Gesamt:</span>
                    <span style="font-weight: 700; color: #f44336; font-size: 8px;">-${deductionsTotal.toFixed(2)} m²</span>
                  </div>
                </div>
              ` : ''}
            </div>
            
            <!-- Final Calculation + Lines Summary - mit Rahmen wie auf dem Bild -->
            <div style="display: flex; gap: 6px;">
              <!-- Flächenberechnung - blauer Rahmen -->
              <div style="flex: 0.8; padding: 4px 8px; border: 1px solid #1976d2; border-radius: 3px;">
                <h3 style="font-size: 9px; color: #1976d2; margin-bottom: 3px;">Flächenberechnung</h3>
                <div style="font-family: monospace; font-size: 9px; line-height: 1.3;">
                  <div>Brutto: ${grossArea.toFixed(2)} m²</div>
                  ${deductionsTotal > 0 ? `<div>− Abzüge: ${deductionsTotal.toFixed(2)} m²</div>` : ''}
                  <div style="border-top: 1px solid #333; margin-top: 3px; padding-top: 3px; font-weight: 700; font-size: 11px; color: #4CAF50;">
                    = Netto: ${netArea.toFixed(2)} m²
                  </div>
                </div>
              </div>
              
              <!-- Linien Zusammenfassung - oranger Rahmen, breiter -->
              ${Object.keys(totalLinesByCategory).length > 0 ? `
                <div style="flex: 1.2; padding: 4px 8px; border: 1px solid #FF9800; border-radius: 3px;">
                  <h3 style="font-size: 9px; color: #FF9800; margin-bottom: 3px;">Linien Zusammenfassung</h3>
                  <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1px 6px;">
                    ${Object.entries(totalLinesByCategory).map(([cat, length]) => `
                      <div style="display: flex; justify-content: space-between; font-size: 8px; white-space: nowrap; overflow: hidden;">
                        <span style="display: flex; align-items: center; min-width: 0; overflow: hidden;">
                          <span style="width: 5px; height: 5px; border-radius: 50%; background: ${getCategoryColor(cat)}; margin-right: 3px; flex-shrink: 0;"></span>
                          <span style="overflow: hidden; text-overflow: ellipsis;">${formatCategoryForPdf(cat)}</span>
                        </span>
                        <span style="font-weight: 600; color: ${getCategoryColor(cat)}; margin-left: 4px; flex-shrink: 0;">${(length as number).toFixed(2)} m</span>
                      </div>
                    `).join('')}
                  </div>
                  <div style="border-top: 1px solid #333; margin-top: 3px; padding-top: 3px; display: flex; justify-content: space-between; font-weight: 700; font-size: 9px;">
                    <span>Gesamt:</span>
                    <span>${Object.values(totalLinesByCategory).reduce((sum: number, l) => sum + (l as number), 0).toFixed(2)} m</span>
                  </div>
                </div>
              ` : ''}
            </div>
            
            <!-- Footer - kompakt -->
            <div style="text-align: center; font-size: 8px; color: #1976d2; font-weight: 600; margin-top: 12px; padding-top: 6px; border-top: 1px solid #1976d2;">
              ${t('pdf.createdWith')} - Aufmassprofi - • ${formatDate(new Date().toISOString())}
            </div>
          </div>
        `;
      }).join('');
    };

    const detailedCalcPagesHtml = generateDetailedCalcPages();

    // Optionales Deckblatt (Logo, Projektdaten, Titelbild)
    let coverPageHtml = '';
    if (includeCoverPage) {
      const coverPhoto = coverPhotoId === 'none'
        ? null
        : (photos.find(p => p.id === coverPhotoId) || photos[0] || null);
      const customerName = customer
        ? ([customer.first_name, customer.last_name].filter(Boolean).join(' ') || (customer as any).customer_type_name || '-')
        : '-';
      const objektAddress = [
        (project as any)?.objekt_street,
        [(project as any)?.objekt_plz, (project as any)?.objekt_city].filter(Boolean).join(' '),
      ].filter(Boolean).join(', ');
      const addressLine = objektAddress || customer?.address || '';
      const coverColor = (coverAccent && PDF_COLOR_OPTIONS[coverAccent]) || headerColor;
      coverPageHtml = buildCoverPageHtml({
        style: coverStyle,
        projectName: project?.name || '',
        projectNumber: project?.project_number || '',
        statusLabel: project?.status ? getStatusMeta(project.status).label : '',
        subtitle: coverSubtitle.trim(),
        customerName,
        addressLine,
        dateLabel: formatDate(new Date().toISOString()),
        accentColor: coverColor.color,
        accentTextColor: coverColor.textColor,
        companyLogo,
        companyName,
        companyStreet,
        companyZipCity: [companyZipCode, companyCity].filter(Boolean).join(' '),
        companyPhone,
        companyEmail,
        coverImage: coverPhoto?.image_data || null,
      });
    }

    // Optionales Inhaltsverzeichnis (Kapitelübersicht mit Anzahl; echte Seitenzahlen sind
    // bei fließendem HTML-Druck nicht vorab bestimmbar)
    let tocHtml = '';
    if (includeToc) {
      const tocAccent = ((coverAccent && PDF_COLOR_OPTIONS[coverAccent]) || headerColor).color;
      const chapters: { label: string; count: string }[] = [
        { label: 'Projektübersicht', count: '' },
        ...(roofs.length > 0 ? [{ label: 'Dachflächen', count: String(roofs.length) }] : []),
        ...(photos.length > 0 ? [{ label: 'Fotos', count: String(photos.length) }] : []),
        ...(sketches.length > 0 ? [{ label: 'Skizzen', count: String(sketches.length) }] : []),
        ...(imagemeterPhotos.length > 0 ? [{ label: 'Bemaßte Fotos', count: String(imagemeterPhotos.length) }] : []),
        ...(areaCalculations.length > 0 ? [{ label: 'Flächenberechnungen', count: String(areaCalculations.length) }] : []),
        ...(checklists.length > 0 ? [{ label: 'Checklisten', count: String(checklists.length) }] : []),
        ...((remarks || project?.remarks) ? [{ label: 'Bemerkungen', count: '' }] : []),
      ];
      const tocRows = chapters.map((c, i) => `
        <tr>
          <td style="width: 30px; padding: 9px 0; border-bottom: 1px solid #eee; color: ${tocAccent}; font-weight: 700;">${String(i + 1).padStart(2, '0')}</td>
          <td style="padding: 9px 0; border-bottom: 1px solid #eee; color: #333;">${c.label}</td>
          <td style="padding: 9px 0; border-bottom: 1px solid #eee; text-align: right; color: #888; font-size: 10pt;">${c.count}</td>
        </tr>`).join('');
      tocHtml = `
        <div style="width: 100%; page-break-after: always;">
          <div style="font-size: 10pt; letter-spacing: 3px; color: ${tocAccent}; text-transform: uppercase; font-weight: 600; margin-top: 6mm;">Inhalt</div>
          <div style="font-size: 18pt; font-weight: 800; color: #222; margin-top: 4px; margin-bottom: 8mm;">Übersicht der Dokumentation</div>
          <table style="width: 100%; border-collapse: collapse; font-size: 12pt;">${tocRows}</table>
        </div>
      `;
    }

    // Build complete HTML
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          @page {
            margin: 15mm;
            size: A4;
          }
          @media screen {
            body {
              background: #e0e0e0 !important;
              padding: 10px !important;
            }
            .page {
              background: #fff;
              width: 210mm;
              min-height: auto; /* Keine feste Höhe - Inhalt bestimmt die Höhe */
              padding: 15mm;
              margin: 0 auto 10px auto;
              box-shadow: 0 4px 12px rgba(0,0,0,0.15);
              border-radius: 2px;
              position: relative;
            }
            .page-break {
              display: none;
            }
            .new-page, .remarks-and-footer-page {
              background: #fff;
              width: 210mm;
              min-height: 297mm;
              padding: 15mm;
              margin: 10px auto;
              box-shadow: 0 4px 12px rgba(0,0,0,0.15);
              border-radius: 2px;
              position: relative;
            }
          }
          @media print {
            body {
              background: #fff !important;
              padding: 0 !important;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
              color-adjust: exact !important;
            }
            .page {
              width: auto;
              min-height: auto;
              padding: 4mm 12mm;
              margin: 0;
              box-shadow: none;
              border-radius: 0;
            }
            /* iOS WebKit Fix: Grid/Flex in Eltern-Elementen bricht page-break für alle nachfolgenden Geschwister */
            .info-grid {
              display: block !important;
            }
            .info-grid .info-box {
              display: inline-block !important;
              width: 48% !important;
              vertical-align: top !important;
              margin-right: 1% !important;
              margin-bottom: 5px !important;
            }
            .info-row {
              display: block !important;
              overflow: hidden !important;
            }
            .info-label {
              float: left !important;
              display: inline !important;
            }
            .info-value {
              display: inline !important;
            }
            .page .header {
              margin: 0 0 10px 0 !important;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
              background: ${headerBgColor} !important;
            }
            .new-page, .remarks-and-footer-page {
              width: auto;
              min-height: auto;
              padding: 4mm 12mm;
              margin: 0;
              box-shadow: none;
              border-radius: 0;
              page-break-before: always;
            }
            .remarks-page {
              page-break-before: always;
              display: block !important;
              visibility: visible !important;
            }
            .remarks-section {
              display: block !important;
              visibility: visible !important;
            }
            .remarks-box {
              display: block !important;
              visibility: visible !important;
            }
            /* Checklisten: Kein Seitenumbruch auf Sektionsebene - fließt natürlich */
            .checklists-page-break {
              /* page-break-before removed for compact layout */
            }
            /* Section-Headers nicht am Seitenende allein lassen */
            h2, h3 {
              page-break-after: avoid !important;
              break-after: avoid !important;
              orphans: 3;
              widows: 3;
            }
            /* Checklist-Kategorien als Einheit halten */
            .pdf-category-section {
              page-break-inside: avoid !important;
              break-inside: avoid !important;
            }
            /* Checklist-Cards dürfen umbrechen */
            .checklist-card {
              page-break-inside: auto !important;
              break-inside: auto !important;
            }
            /* Checklisten-Tabelle: Überschrift wiederholt sich auf jeder Seite */
            .checklists-table {
              page-break-inside: auto !important;
              width: 100%;
            }
            .checklists-table thead {
              display: table-header-group !important;
            }
            .checklists-table thead th {
              background: #fff !important;
            }
            .checklists-table tbody tr {
              page-break-inside: avoid !important;
              break-inside: avoid !important;
            }
            .checklists-table td, .checklists-table th {
              border: none !important;
            }
            /* Checklist-Items nicht umbrechen */
            .checklist-item {
              page-break-inside: avoid !important;
              break-inside: avoid !important;
            }
            /* Roof-Sections nicht umbrechen */
            .roof-detail {
              page-break-inside: avoid !important;
              break-inside: avoid !important;
            }
            /* Calculator-Sections nicht umbrechen */
            .calc-detail {
              page-break-inside: avoid !important;
              break-inside: avoid !important;
            }
            /* Neue Seite für große Abschnitte */
            .section-page-break {
              page-break-before: always !important;
              break-before: always !important;
            }
            /* Foto-Layouts für Druck */
            .photos-section {
              margin-bottom: 15px !important;
              page-break-before: auto !important;
              break-before: auto !important;
            }
            .photos-section h2 {
              page-break-after: avoid !important;
              break-after: avoid !important;
              -webkit-column-break-after: avoid !important;
              page-break-before: auto !important;
              break-before: auto !important;
            }
            .photos-print-container {
              page-break-before: auto !important;
              break-before: auto !important;
            }
            .photos-section-small {
              display: grid !important;
              grid-template-columns: repeat(3, 1fr) !important;
              gap: 8px !important;
            }
            .photos-section-small .photo-item {
              page-break-inside: avoid !important;
              break-inside: avoid !important;
            }
            .photos-section-small .photo-item img {
              max-height: 180px !important;
            }
            .photos-section-medium {
              display: grid !important;
              grid-template-columns: repeat(2, 1fr) !important;
              gap: 12px !important;
            }
            .photos-section-medium .photo-item {
              page-break-inside: avoid !important;
              break-inside: avoid !important;
            }
            .photos-section-medium .photo-item img {
              max-height: 280px !important;
            }
            .photos-section-large {
              display: flex !important;
              flex-direction: column !important;
              gap: 15px !important;
            }
            .photos-section-large .photo-item {
              page-break-inside: avoid !important;
              break-inside: avoid !important;
            }
            .photos-section-large .photo-item img {
              max-height: 340px !important;
            }
            .photo-item {
              page-break-inside: avoid !important;
              break-inside: avoid !important;
            }
            .photo-item img {
              page-break-inside: avoid !important;
              break-inside: avoid !important;
            }
            /* KRITISCH: Verhindere Abschneiden von Inhalten beim Drucken */
            img {
              max-width: 100% !important;
              height: auto !important;
              page-break-inside: avoid !important;
              break-inside: avoid !important;
            }
            /* Seitenumbrüche für Abschnitte */
            .roof-section, .calculator-section {
              page-break-inside: avoid !important;
              break-inside: avoid !important;
            }
            /* Checklisten: Sektion darf umbrechen, nur Kategorien bleiben zusammen */
            .checklists-section {
              page-break-inside: auto !important;
              break-inside: auto !important;
              page-break-before: auto !important;
              break-before: auto !important;
            }
            /* Sektionen erlauben Umbrüche, aber starten auf neuer Seite */
            .sketches-section { 
              page-break-before: auto !important;
              break-before: auto !important;
              page-break-inside: auto !important; 
            }
            .photos-section { 
              page-break-before: auto !important;
              break-before: auto !important;
              page-break-inside: auto !important; 
            }
            .sketch-item {
              page-break-inside: avoid !important;
              break-inside: avoid !important;
            }
            .sketch-item img {
              max-width: 100% !important;
              max-height: 780px !important;
              height: auto !important;
              object-fit: contain !important;
            }
            .photo-item {
              page-break-inside: avoid !important;
              break-inside: avoid !important;
              max-height: 450px !important;
              overflow: hidden !important;
            }
            .photo-item img {
              max-width: 100% !important;
              max-height: 380px !important;
              height: auto !important;
              object-fit: contain !important;
            }
            svg {
              max-width: 100% !important;
              height: auto !important;
            }
            .sketch-svg-container svg {
              max-width: 100% !important;
              height: auto !important;
            }
            .sketches-container, .photos-container {
              display: flex !important;
              flex-wrap: wrap !important;
              gap: 10px !important;
            }
            /* iPhone: inline-block für nebeneinander + saubere Seitenumbrüche */
            .sketches-container-iphone {
              display: block !important;
              font-size: 0 !important;
            }
            .sketches-container-iphone .sketch-item {
              display: inline-block !important;
              vertical-align: top !important;
              font-size: 14px !important;
              page-break-inside: avoid !important;
              break-inside: avoid !important;
              margin-bottom: 10px !important;
              margin-right: 1% !important;
            }
            .sketches-container-iphone .sketch-small {
              width: 32% !important;
              max-width: 32% !important;
            }
            .sketches-container-iphone .sketch-medium {
              width: 48% !important;
              max-width: 48% !important;
            }
            .sketches-container-iphone .sketch-large {
              width: 100% !important;
              max-width: 100% !important;
            }
            .sketches-container-iphone .sketch-full {
              width: 100% !important;
              max-width: 100% !important;
            }
            .sketches-container-iphone .sketch-item img {
              max-height: 420px !important;
              max-width: 100% !important;
              width: 100% !important;
              height: auto !important;
              object-fit: contain !important;
            }
            /* iPad: inline-block für nebeneinander + saubere Seitenumbrüche */
            .sketches-container-ipad {
              display: block !important;
              font-size: 0 !important;
            }
            .sketches-container-ipad .sketch-item {
              display: inline-block !important;
              vertical-align: top !important;
              font-size: 14px !important;
              page-break-inside: avoid !important;
              break-inside: avoid !important;
              margin-bottom: 10px !important;
              margin-right: 1% !important;
            }
            .sketches-container-ipad .sketch-small {
              width: 32% !important;
              max-width: 32% !important;
            }
            .sketches-container-ipad .sketch-medium {
              width: 48% !important;
              max-width: 48% !important;
            }
            .sketches-container-ipad .sketch-large {
              width: 100% !important;
              max-width: 100% !important;
            }
            .sketches-container-ipad .sketch-full {
              width: 100% !important;
              max-width: 100% !important;
            }
            .sketches-container-ipad .sketch-item img {
              max-width: 100% !important;
              height: auto !important;
              object-fit: contain !important;
            }
            .sketch-item, .photo-item {
              box-sizing: border-box !important;
              max-height: none !important;
              overflow: visible !important;
            }
            /* Sketch-Größen beim Drucken beibehalten */
            .sketch-small {
              flex: 0 0 calc(33.33% - 10px) !important;
              max-width: calc(33.33% - 10px) !important;
            }
            .sketch-medium {
              flex: 0 0 calc(50% - 10px) !important;
              max-width: calc(50% - 10px) !important;
            }
            .sketch-large {
              flex: 0 0 100% !important;
              max-width: 100% !important;
            }
            .sketch-full {
              flex: 0 0 100% !important;
              max-width: 100% !important;
            }
            /* Sketch/Photo: Höhenbeschränkung entfernt - inline-block mit page-break-inside: avoid reicht */
            /* iPhone: Fotos nebeneinander mit sauberen Seitenumbrüchen */
            .photos-print-iphone > div {
              display: inline-block !important;
              vertical-align: top !important;
              font-size: 14px !important;
              page-break-inside: avoid !important;
              break-inside: avoid !important;
              margin-bottom: 10px !important;
            }
            .photos-print-iphone > div img,
            .photos-print-iphone > div svg {
              max-height: 350px !important;
            }
            .photos-print-iphone .photo-annotations {
              position: absolute !important;
              top: 0 !important;
              left: 0 !important;
              width: 100% !important;
              height: 100% !important;
              pointer-events: none !important;
            }
            /* iPad: Fotos nebeneinander mit sauberen Seitenumbrüchen */
            .photos-print-ipad {
              display: block !important;
              font-size: 0 !important;
            }
            .photos-print-ipad > div {
              display: inline-block !important;
              vertical-align: top !important;
              font-size: 14px !important;
              page-break-inside: avoid !important;
              break-inside: avoid !important;
              margin-bottom: 10px !important;
            }
          }
          * {
            box-sizing: border-box;
          }
          /* Globale Überlauf-Kontrolle für alle Container */
          .sketch-item, .photo-item {
            max-width: 100%;
          }
          .photo-item {
            overflow: hidden;
          }
          img {
            max-width: 100%;
            height: auto;
          }
          svg {
            max-width: 100%;
            height: auto;
          }
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            font-size: 9px;
            line-height: 1.3;
            color: #333;
            margin: 0;
            padding: 8px;
            background: #fff;
          }
          .header {
            background: ${headerBgColor};
            color: ${headerTextColor};
            padding: ${Math.max(headerSize.padding - 2, 2)}px ${headerSize.padding + 2}px;
            margin: 0 0 4px 0;
            border-radius: 0;
            display: flex;
            flex-direction: column;
            gap: 3px;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
            ${headerBorderStyle}
          }
          .header-top {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            width: 100%;
          }
          .company-header {
            display: flex;
            align-items: flex-start;
            gap: 10px;
          }
          .company-logo {
            max-width: 60px;
            max-height: 40px;
          }
          .header h1 {
            margin: 0;
            font-size: ${headerSize.h1Size}px;
            font-weight: 600;
          }
          .header .date {
            font-size: 9px;
            opacity: 0.9;
            margin-top: 2px;
            white-space: nowrap;
          }
          .company-info {
            text-align: right;
            font-size: 8px;
            max-width: 180px;
            word-wrap: break-word;
            line-height: 1.2;
          }
          h2 {
            color: ${toolsAccentColor};
            border-bottom: 1px solid ${toolsAccentColor};
            padding-bottom: 2px;
            margin-top: 8px;
            margin-bottom: 4px;
            font-size: ${toolsSize.h2Size}px;
            page-break-after: avoid;
            page-break-inside: avoid;
          }
          /* Sektionen zusammenhalten - verstärkt für iPhone */
          .section-with-header {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            -webkit-column-break-inside: avoid !important;
          }
          /* Überschriften NIEMALS alleine lassen */
          h2, h3, h4 {
            page-break-after: avoid !important;
            break-after: avoid !important;
            -webkit-column-break-after: avoid !important;
            orphans: 3;
            widows: 3;
          }
          /* Skizzen-Sektion - neue Seite starten damit Überschrift beim Inhalt bleibt */
          .sketches-section {
            page-break-before: auto !important;
            break-before: auto !important;
            page-break-inside: auto !important;
            break-inside: auto !important;
          }
          .sketches-section h2 {
            page-break-after: avoid !important;
            break-after: avoid !important;
            margin-top: 0 !important;
            margin-bottom: 10px;
          }
          .sketches-section .sketches-container {
            page-break-before: avoid !important;
            break-before: avoid !important;
          }
          /* Einzelne Skizzen-Items nicht umbrechen */
          .sketches-section .sketch-item {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
          /* Skizzen-Wrapper: Überschrift + erste Skizze zusammen */
          .sketch-wrapper {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            -webkit-column-break-inside: avoid !important;
          }
          /* Fotos Sektion - kein erzwungener Seitenumbruch */
          .photos-section {
            page-break-before: auto !important;
            break-before: auto !important;
            page-break-inside: auto !important;
            break-inside: auto !important;
          }
          .photos-section h2 {
            page-break-after: avoid !important;
            break-after: avoid !important;
            margin-top: 0 !important;
          }
          /* Fotos-Wrapper: Überschrift + erstes Foto zusammen */
          .photos-wrapper {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            -webkit-column-break-inside: avoid !important;
          }
          /* Bemerkungen Sektion */
          .remarks-section {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
          .remarks-section h2 {
            page-break-after: avoid !important;
            break-after: avoid !important;
          }
          /* Checklisten Sektion - KEIN page-break-inside: avoid damit es auf Seite 1 beginnt */
          .checklists-section {
            width: 100%;
          }
          .checklists-section h2 {
            page-break-after: avoid !important;
            break-after: avoid !important;
          }
          /* Jede Hauptkategorie bleibt zusammen */
          .pdf-category-section {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
          /* Checklist-Card darf umbrechen, aber nicht die einzelnen Kategorien */
          .checklist-card {
            page-break-inside: auto !important;
            break-inside: auto !important;
          }
          /* Checklist Header bleibt mit erstem Inhalt zusammen */
          .checklist-main-header {
            page-break-after: avoid !important;
            break-after: avoid !important;
          }
          /* Dachflächen Sektion */
          .roofs-section {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
          .roofs-section h2 {
            page-break-after: avoid !important;
            break-after: avoid !important;
          }
          h3 {
            color: #333;
            margin-top: 8px;
            margin-bottom: 5px;
            font-size: 10px;
            page-break-after: avoid;
          }
          h4 {
            color: ${accentColor};
            margin: 5px 0 3px 0;
            font-size: 9px;
          }
          .info-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 5px;
            margin-bottom: 6px;
          }
          .info-box {
            background: #f8f9fa;
            border: 1px solid #e0e0e0;
            border-radius: 4px;
            padding: 4px 6px;
          }
          .info-box h3 {
            margin-top: 0;
            color: #1976d2;
            font-size: 8px;
            border-bottom: 1px solid #e0e0e0;
            padding-bottom: 2px;
            margin-bottom: 3px;
          }
          .info-row {
            display: flex;
            margin-bottom: 1px;
            font-size: 7px;
            line-height: 1.3;
          }
          .info-label {
            font-weight: 800;
            min-width: 80px;
            flex-shrink: 0;
            color: #000;
            font-size: 7.5px;
          }
          .info-value {
            flex: 1;
            font-size: 7.5px;
          }
          .stats-grid {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 8px;
            margin-bottom: 12px;
          }
          .stat-box {
            background: #e3f2fd;
            border-radius: 4px;
            padding: 6px 4px;
            text-align: center;
          }
          .stat-value {
            font-size: 16px;
            font-weight: 700;
            color: #1976d2;
          }
          .stat-label {
            font-size: 7px;
            color: #666;
            text-transform: uppercase;
            letter-spacing: 0.3px;
          }
          /* Projektart-Überschrift - eigene Farb- und Stil-Einstellungen */
          .project-type-header {
            background: ${projectTypeBgColor};
            ${projectTypeBorderStyle}
            border-radius: 4px;
            padding: ${Math.max(projectTypeSize.padding - 2, 2)}px ${projectTypeSize.padding + 2}px;
            margin-bottom: 6px;
            text-align: center;
            display: flex;
            align-items: center;
            justify-content: center;
          }
          .project-type-icon {
            color: ${projectTypeTextColor};
            font-size: ${projectTypeSize.fontSize - 2}px;
          }
          .project-type-text {
            font-size: ${projectTypeSize.fontSize}px;
            font-weight: 600;
            color: ${projectTypeTextColor};
            text-transform: uppercase;
            letter-spacing: 0.5px;
          }
          .roof-card, .checklist-card {
            background: #f8f9fa;
            border: 1px solid #e0e0e0;
            border-radius: 4px;
            padding: 6px 8px;
            margin-bottom: 6px;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            -webkit-column-break-inside: avoid !important;
          }
          .roof-card h4, .checklist-card h4 {
            margin-top: 0;
          }
          /* Alle Kategorie-Container nicht trennen */
          .pdf-category-section {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            -webkit-column-break-inside: avoid !important;
          }
          .pdf-level1-container {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            -webkit-column-break-inside: avoid !important;
          }
          /* Fotos nicht trennen */
          .photo-card {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            -webkit-column-break-inside: avoid !important;
          }
          .photo-card img {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
          /* Skizzen nicht trennen */
          .sketch-item {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            -webkit-column-break-inside: avoid !important;
          }
          /* Block-Struktur für Fotos und Skizzen (iPhone-kompatibel) */
          .photo-block, .sketch-block {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            -webkit-column-break-inside: avoid !important;
          }
          .photo-inline-heading, .sketch-inline-heading {
            color: ${accentColor};
            border-bottom: 1px solid ${accentColor};
            padding-bottom: 3px;
            margin-top: 8px;
            margin-bottom: 8px;
            font-size: ${toolsSize.h2Size}px;
            font-weight: bold;
            display: block !important;
            width: 100% !important;
          }
          .sketch-inline-title {
            color: ${accentColor};
            margin: 8px 0 5px 0;
            font-size: 9px;
          }
          /* New checklist PDF styles */
          .checklist-main-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding-bottom: 4px;
            border-bottom: 1px solid ${accentColor};
            margin-bottom: 6px;
          }
          .checklist-main-title {
            font-size: 11px;
            font-weight: 700;
            color: ${accentColor};
            flex: 1;
          }
          .checklist-main-count {
            font-size: 9px;
            color: #4caf50;
            font-weight: 600;
          }
          /* PDF Checklist Image Styles */
          .pdf-template-logo {
            max-width: 50px;
            max-height: 20px;
            margin-right: 6px;
            object-fit: contain;
            border-radius: 2px;
          }
          .pdf-category-logo {
            max-width: 35px;
            max-height: 14px;
            margin-right: 3px;
            object-fit: contain;
            border-radius: 2px;
          }
          .pdf-print-thumbnail {
            width: 40px;
            height: 30px;
            object-fit: contain;
            border-radius: 2px;
            border: 1px solid #4caf50;
            margin-left: auto;
            background: #f5f5f5;
          }
          .pdf-print-thumbnail-small {
            width: 32px;
            height: 24px;
            object-fit: contain;
            border-radius: 2px;
            border: 1px solid #4caf50;
            margin-left: auto;
            background: #f5f5f5;
          }
          /* Grid container for categories - IMMER 1 Spalte, da Level-1 Items das Grid haben */
          .pdf-categories-grid {
            display: block;
            width: 100%;
          }
          .pdf-categories-grid::after {
            content: "";
            display: table;
            clear: both;
          }
          .pdf-category-section {
            background: #f9f9f9;
            border: 1px solid #e0e0e0;
            border-radius: 3px;
            padding: 5px 6px;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            -webkit-column-break-inside: avoid !important;
            box-sizing: border-box;
            width: 100%;
            margin-bottom: 8px;
          }
          /* Spalten-Layout basierend auf Einstellung */
          .pdf-category-section.cols-1,
          .pdf-category-section.cols-2,
          .pdf-category-section.cols-3 {
            width: 100%;
          }
          .pdf-category-header {
            display: flex;
            align-items: center;
            gap: 4px;
            padding-bottom: 3px;
            border-bottom: 1px solid #4caf50;
            margin-bottom: 4px;
          }
          .pdf-cat-check {
            color: #4caf50;
            font-weight: bold;
            font-size: 8px;
          }
          .pdf-category-title {
            font-size: 8px;
            font-weight: 700;
            color: #333;
            flex: 1;
          }
          .pdf-category-count {
            font-size: 7px;
            color: #4caf50;
            font-weight: 600;
          }
          .pdf-category-note {
            background: #fff8e1;
            padding: 2px 4px;
            border-radius: 2px;
            font-size: 7px;
            color: #f57c00;
            font-style: italic;
            margin-bottom: 3px;
          }
          .pdf-category-measurements {
            background: #e3f2fd;
            padding: 2px 4px;
            border-radius: 2px;
            margin-bottom: 3px;
          }
          .pdf-measurement-line {
            font-size: 7px;
            color: #1565c0;
            font-weight: 500;
            margin-bottom: 1px;
          }
          .pdf-measurement-sum {
            margin-top: 2px;
            padding-top: 2px;
            border-top: 1px solid #90caf9;
            font-size: 7px;
            color: #1565c0;
          }
          .pdf-sum-badge {
            background: #bbdefb;
            padding: 1px 4px;
            border-radius: 6px;
            font-weight: 600;
            margin-left: 3px;
          }
          .pdf-level1-grid {
            display: grid;
            grid-template-columns: repeat(${checklistColumns}, 1fr);
            gap: 3px;
          }
          .pdf-level1-container {
            background: #fff;
            border: 1px solid #e0e0e0;
            border-left: 2px solid ${accentColor};
            border-radius: 2px;
            padding: 3px 4px;
            box-sizing: border-box;
          }
          .pdf-level1-header {
            display: flex;
            align-items: center;
            gap: 3px;
            padding-bottom: 2px;
            border-bottom: 1px solid #eee;
            margin-bottom: 2px;
          }
          .pdf-level1-prefix {
            background: ${accentColor};
            color: ${pdfColor.textColor};
            font-size: 7px;
            font-weight: 700;
            padding: 1px 3px;
            border-radius: 2px;
          }
          .pdf-checkmark-circle {
            color: #4caf50;
            font-size: 8px;
          }
          .pdf-level1-title {
            font-size: 8px;
            font-weight: 600;
            color: #333;
            flex: 1;
          }
          .pdf-level1-content {
            padding-left: 1px;
          }
          .pdf-deep-sub {
            display: flex;
            align-items: center;
            gap: 2px;
            padding: 0;
          }
          .pdf-deep-prefix {
            font-size: 7px;
            color: #666;
            font-weight: 600;
            min-width: 18px;
          }
          .pdf-checkmark {
            color: #4caf50;
            font-size: 7px;
          }
          .pdf-deep-text {
            font-size: 7px;
            color: #444;
            flex: 1;
          }
          .pdf-note {
            background: #fff8e1;
            padding: 2px 3px;
            border-radius: 2px;
            font-size: 6px;
            color: #f57c00;
            font-style: italic;
            margin-top: 1px;
            margin-bottom: 1px;
          }
          .pdf-note-icon {
            margin-right: 1px;
          }
          .pdf-measurement {
            background: #e3f2fd;
            padding: 2px 3px;
            border-radius: 2px;
            font-size: 6px;
            color: #1565c0;
            font-weight: 500;
            margin-top: 1px;
            margin-bottom: 1px;
          }
          .photos-grid, .sketches-grid {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 15px;
          }
          /* Flexible photo/sketch containers */
          .photos-container, .sketches-container {
            display: flex;
            flex-wrap: wrap;
            gap: 15px;
            align-items: flex-start;
          }
          .photos-container::after, .sketches-container::after {
            content: "";
            display: table;
            clear: both;
          }
          /* Photo page groups - jede Gruppe auf eigener Seite */
          .photos-page-group {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            -webkit-column-break-inside: avoid !important;
          }
          .photos-page-group .photos-container {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 15px;
          }
          .photos-page-group .photo-item {
            max-height: 320px;
            overflow: hidden;
          }
          .photos-page-group .photo-item img {
            max-height: 280px;
            object-fit: contain;
          }
          /* Neue Foto-Seiten Layouts */
          .photos-section {
            margin-bottom: 15px;
          }
          /* Klein: 3 Spalten Grid */
          .photos-section-small {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 8px;
          }
          .photos-section-small .photo-item {
            page-break-inside: avoid;
            break-inside: avoid;
          }
          .photos-section-small .photo-item img {
            max-height: 180px;
            object-fit: contain;
          }
          .photo-grid-small {
            width: 100%;
          }
          /* Mittel: 2 Spalten Grid */
          .photos-section-medium {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 12px;
          }
          .photos-section-medium .photo-item {
            page-break-inside: avoid;
            break-inside: avoid;
          }
          .photos-section-medium .photo-item img {
            max-height: 280px;
            object-fit: contain;
          }
          .photo-grid-medium {
            width: 100%;
          }
          /* Groß: 1 Spalte (übereinander) */
          .photos-section-large {
            display: flex;
            flex-direction: column;
            gap: 15px;
          }
          .photos-section-large .photo-item {
            page-break-inside: avoid;
            break-inside: avoid;
          }
          .photos-section-large .photo-item img {
            max-height: 340px;
            object-fit: contain;
          }
          .photo-grid-large {
            width: 100%;
          }
          /* iPhone-spezifischer Skizzen-Container */
          .sketches-container-iphone {
            display: block !important;
            font-size: 0 !important;
          }
          .sketches-container-iphone .sketch-item {
            display: inline-block !important;
            vertical-align: top !important;
            font-size: 14px !important;
            margin-bottom: 10px !important;
            margin-right: 1% !important;
          }
          .sketches-container-iphone .sketch-small {
            width: 32% !important;
            max-width: 32% !important;
          }
          .sketches-container-iphone .sketch-medium {
            width: 48% !important;
            max-width: 48% !important;
          }
          .sketches-container-iphone .sketch-large {
            width: 100% !important;
            max-width: 100% !important;
          }
          .sketches-container-iphone .sketch-full {
            width: 100% !important;
            max-width: 100% !important;
          }
          .sketches-container-iphone .sketch-item img {
            max-height: 420px !important;
            max-width: 100% !important;
            width: 100% !important;
            height: auto !important;
            object-fit: contain !important;
          }
          .sketch-iphone {
            width: 100%;
            margin: 0;
          }
          .sketch-iphone img {
            max-height: 280px;
            object-fit: contain;
          }
          /* iPhone-spezifischer Fotos-Container: Grid mit 2 Spalten */
          .photos-container-iphone {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 15px;
            margin-bottom: 20px;
            align-items: start;
          }
          .photos-container-iphone.photos-new-page {
            page-break-before: always !important;
            break-before: page !important;
          }
          .photo-iphone {
            width: 100%;
            margin: 0;
          }
          .photo-iphone .photo-wrapper {
            display: flex;
            align-items: center;
            justify-content: center;
            background: #f5f5f5;
            border-radius: 4px;
            overflow: hidden;
          }
          .photo-iphone img {
            width: 100%;
            height: auto;
            max-height: 200px;
            object-fit: contain;
          }
          /* Photo sizes - iPad mit Flexbox */
          .photo-small {
            flex: 0 0 calc(33.33% - 10px);
            max-width: calc(33.33% - 10px);
            margin-bottom: 15px;
          }
          .photo-medium {
            flex: 0 0 calc(50% - 10px);
            max-width: calc(50% - 10px);
            margin-bottom: 15px;
          }
          .photo-large {
            flex: 0 0 100%;
            max-width: 100%;
            margin-bottom: 15px;
          }
          .photo-full {
            flex: 0 0 100%;
            max-width: 100%;
            margin-bottom: 15px;
          }
          /* Photo wrapper for annotation overlay */
          .photo-wrapper {
            position: relative;
            display: block;
            width: 100%;
          }
          .photo-wrapper img {
            display: block;
            width: 100%;
            height: auto;
            max-height: 400px;
            object-fit: contain;
          }
          .photo-annotations {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            pointer-events: none;
          }
          /* Sketch sizes - mit Flexbox */
          .sketch-small {
            flex: 0 0 calc(33.33% - 10px);
            max-width: calc(33.33% - 10px);
            margin-bottom: 15px;
          }
          .sketch-medium {
            flex: 0 0 calc(50% - 10px);
            max-width: calc(50% - 10px);
            margin-bottom: 15px;
          }
          .sketch-large {
            flex: 0 0 100%;
            max-width: 100%;
            margin-bottom: 15px;
          }
          .sketch-full {
            flex: 0 0 100%;
            max-width: 100%;
            margin-bottom: 15px;
          }
          .sketch-item img {
            max-height: 500px;
            object-fit: contain;
          }
          .photo-item, .sketch-item {
            border: 1px solid #e0e0e0;
            border-radius: 6px;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            -webkit-column-break-inside: avoid !important;
            display: block;
          }
          .photo-item {
            overflow: hidden;
            max-height: 350px;
          }
          /* Photo/Sketch im Grid nicht umbrechen */
          .photo-iphone, .sketch-iphone {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            -webkit-column-break-inside: avoid !important;
            max-height: 280px;
            overflow: hidden;
          }
          .photo-small, .photo-medium, .photo-large, .photo-full {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            -webkit-column-break-inside: avoid !important;
          }
          .sketch-small, .sketch-medium, .sketch-large, .sketch-full {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            -webkit-column-break-inside: avoid !important;
          }
          /* All images fill their container width */
          .photo-item img, .sketch-item img {
            display: block;
            width: 100%;
            height: auto;
            max-height: 300px;
            object-fit: contain;
            background: #f5f5f5;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
          .photo-item p, .sketch-item p {
            margin: 0;
            padding: 8px;
            font-size: 10px;
            color: #666;
            background: #f8f9fa;
          }
          .sketch-title {
            margin: 0;
            padding: 8px 10px;
            font-size: 11px;
            font-weight: 600;
            color: ${accentColor};
            background: #f0f4f8;
            border-bottom: 1px solid ${accentColor};
          }
          .sketch-notes {
            padding: 8px 10px;
            background: #fafafa;
            border-top: 1px solid #e0e0e0;
          }
          .sketch-notes-filled {
            background: #fff8e1;
            border-top: 1px solid #ffe082;
          }
          .sketch-notes-label {
            font-size: 9px;
            font-weight: 600;
            color: #666;
          }
          .sketch-notes-text {
            font-size: 9px;
            color: #333;
            line-height: 1.4;
          }
          .sketch-notes-lines {
            display: flex;
            flex-direction: column;
            gap: 10px;
          }
          .sketch-note-line {
            height: 1px;
            background: #ccc;
            width: 100%;
          }
          .sketch-placeholder {
            height: 150px;
            display: flex;
            align-items: center;
            justify-content: center;
            background: #f5f5f5;
            color: #999;
          }
          .empty {
            color: #999;
            font-style: italic;
            padding: 10px;
            background: #f8f9fa;
            border-radius: 4px;
          }
          .remarks-box {
            background: #fff8e1;
            border: 1px solid #ffe082;
            border-radius: 4px;
            padding: 6px 8px;
            margin-top: 5px;
            font-size: 8px;
          }
          .footer {
            margin-top: 5px;
            padding: 3px 0;
            border-top: 1px solid ${accentColor};
            font-size: 6px;
            color: #999;
            text-align: center;
            font-weight: 400;
            page-break-inside: avoid;
            page-break-before: avoid;
            break-before: avoid;
            break-inside: avoid;
          }
          /* Wrapper um den letzten Inhalt und Footer, um sie zusammenzuhalten */
          .footer-container {
            page-break-inside: avoid;
            break-inside: avoid;
          }
          /* Footer im Druck nur anzeigen wenn genug Platz - sonst verstecken */
          @media print {
            .footer {
              /* Footer wird nur gedruckt wenn er auf die Seite passt */
              orphans: 3;
              widows: 3;
            }
          }
          .page-break {
            page-break-before: always;
          }
          .measurements-grid {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 2px;
            margin-top: 4px;
          }
          .measure-item {
            font-size: 8px;
          }
          .measure-label {
            color: #666;
          }
          .roof-area {
            font-size: 10px;
            color: ${accentColor};
            margin-bottom: 3px;
          }
          .roof-notes {
            margin-top: 4px;
            padding-top: 4px;
            border-top: 1px dashed #e0e0e0;
            font-size: 8px;
          }
          .company-header {
            display: flex;
            align-items: center;
            gap: 10px;
          }
          .company-logo {
            max-width: 120px;
            max-height: 80px;
            object-fit: contain;
          }
        </style>
      </head>
      <body>
        ${coverPageHtml}
        ${tocHtml}
        <div class="page">
        <div class="header">
          <div class="header-top">
            <div class="company-header">
              ${companyLogo ? `<img src="${companyLogo}" class="company-logo" alt="Logo" />` : ''}
              <div>
                <h1>AUFMASS-DOKUMENTATION</h1>
                <div class="date">Erstellt am: ${formatDate(new Date().toISOString())}${authorName ? ` | Verfasser: ${authorName}` : ''}</div>
              </div>
            </div>
            ${companyName ? `
              <div class="company-info">
                <strong>${companyName}</strong>
                ${companySubtitle ? `<br/><em>${companySubtitle}</em>` : ''}
                ${companyOwner ? `<br/>${companyOwner}` : ''}
                ${companyStreet ? `<br/>${companyStreet}` : ''}
                ${companyZipCode || companyCity ? `<br/>${companyZipCode} ${companyCity}` : ''}
                ${companyPhone ? `<br/>${t('pdf.phone')}: ${companyPhone}` : ''}
                ${companyMobilePhone ? `<br/>${t('pdf.mobile')}: ${companyMobilePhone}` : ''}
                ${companyFax ? `<br/>${t('pdf.fax')}: ${companyFax}` : ''}
                ${companyEmail ? `<br/>${companyEmail}` : ''}
              </div>
            ` : ''}
          </div>
        </div>
        
        <h2>${t('pdf.projectOverview')}</h2>
        <div class="info-grid">
          <div class="info-box">
            <h3>${t('pdf.project')}</h3>
            ${project?.project_number ? `
              <div class="info-row">
                <span class="info-label">${t('projects.projectNumber')}:</span>
                <span class="info-value" style="color: #4caf50; font-weight: 600;">${project.project_number}</span>
              </div>
            ` : ''}
            <div class="info-row">
              <span class="info-label">Name:</span>
              <span class="info-value">${project?.name || '-'}</span>
            </div>
            ${project?.description ? `
              <div class="info-row">
                <span class="info-label">${t('projects.description')}:</span>
                <span class="info-value">${project.description}</span>
              </div>
            ` : ''}
            <div class="info-row">
              <span class="info-label">${t('projects.status')}:</span>
              <span class="info-value">${getStatusMeta(project?.status).label}</span>
            </div>
            ${(objektStreet || objektPlz || objektCity || objektName || objektAddressName || objektDescription || objektContactPerson || objektPhone || objektEmail || objektNumber) ? `
              <div style="margin-top: 6px; padding-top: 4px; border-top: 1px solid #e0e0e0;">
                <h4 style="color: #1976d2; margin: 0 0 3px 0; font-size: 8px; border-bottom: 1px solid #e0e0e0; padding-bottom: 2px;">
                  ${t('projects.objectAddress')}${objektAddressName ? ` (${objektAddressName})` : ''}
                </h4>
                ${objektNumber ? `
                  <div class="info-row">
                    <span class="info-label">${t('projects.objectNumber')}:</span>
                    <span class="info-value" style="color: #ff9800; font-weight: 600;">${objektNumber}</span>
                  </div>
                ` : ''}
                ${objektDescription ? `
                  <div class="info-row">
                    <span class="info-label">Beschreibung:</span>
                    <span class="info-value">${objektDescription}</span>
                  </div>
                ` : ''}
                ${objektName ? `
                  <div class="info-row">
                    <span class="info-label">Objektname:</span>
                    <span class="info-value">${objektName}</span>
                  </div>
                ` : ''}
                ${objektStreet ? `
                  <div class="info-row">
                    <span class="info-label">${t('common.street')}:</span>
                    <span class="info-value">${objektStreet}</span>
                  </div>
                ` : ''}
                ${(objektPlz || objektCity) ? `
                  <div class="info-row">
                    <span class="info-label">${t('common.zip')}/${t('common.city')}:</span>
                    <span class="info-value">${objektPlz || ''} ${objektCity || ''}</span>
                  </div>
                ` : ''}
                ${objektContactPerson ? `
                  <div class="info-row">
                    <span class="info-label">Ansprechpartner:</span>
                    <span class="info-value">${objektContactPerson}</span>
                  </div>
                ` : ''}
                ${objektPhone ? `
                  <div class="info-row">
                    <span class="info-label">Tel:</span>
                    <span class="info-value">${objektPhone}</span>
                  </div>
                ` : ''}
                ${objektEmail ? `
                  <div class="info-row">
                    <span class="info-label">E-Mail:</span>
                    <span class="info-value">${objektEmail}</span>
                  </div>
                ` : ''}
              </div>
            ` : ''}
          </div>
          
          <div class="info-box">
            <h3>${t('projects.bauherr')}</h3>
            ${customer?.customer_number ? `
              <div class="info-row">
                <span class="info-label">${t('customers.customerNumber')}:</span>
                <span class="info-value" style="color: #1976d2; font-weight: 600;">${customer.customer_number}</span>
              </div>
            ` : ''}
            ${bauherrCustomerType ? `
              <div class="info-row">
                <span class="info-label">Kundentyp:</span>
                <span class="info-value" style="color: #1976d2; font-weight: 600;">${bauherrCustomerType}${bauherrCustomerTypeName ? ` ${bauherrCustomerTypeName}` : ''}</span>
              </div>
            ` : ''}
            ${bauherrName ? `
              <div class="info-row">
                <span class="info-label">Name:</span>
                <span class="info-value">${bauherrName}</span>
              </div>
            ` : ''}
            ${bauherrStreet ? `
              <div class="info-row">
                <span class="info-label">${t('common.street')}:</span>
                <span class="info-value">${bauherrStreet}</span>
              </div>
            ` : ''}
            ${(bauherrPlz || bauherrCity) ? `
              <div class="info-row">
                <span class="info-label">${t('common.zip')}/${t('common.city')}:</span>
                <span class="info-value">${bauherrPlz || ''} ${bauherrCity || ''}</span>
              </div>
            ` : ''}
            ${bauherrPhone ? `
              <div class="info-row">
                <span class="info-label">${t('common.phone')}:</span>
                <span class="info-value">${bauherrPhone}</span>
              </div>
            ` : ''}
            ${bauherrMobile ? `
              <div class="info-row">
                <span class="info-label">${t('pdf.mobile')}:</span>
                <span class="info-value">${bauherrMobile}</span>
              </div>
            ` : ''}
            ${bauherrEmail ? `
              <div class="info-row">
                <span class="info-label">${t('common.email')}:</span>
                <span class="info-value">${bauherrEmail}</span>
              </div>
            ` : ''}
          </div>
        </div>
        
        ${project?.project_type ? `
          <div class="project-type-header">
            <span class="project-type-text">${project.project_type}${project.project_type_date ? ` vom ${new Date(project.project_type_date).toLocaleDateString('de-DE')}` : ''}</span>
          </div>
        ` : ''}
        
        ${roofs.length > 0 ? `
        <div class="roofs-section">
          <h2>${t('projects.roofMeasurement')}</h2>
          ${roofsHtml}
        </div>
        ` : ''}
        
        ${checklists.length > 0 ? `
        <div class="checklists-section" style="page-break-before: auto !important; page-break-inside: auto !important; break-inside: auto !important;">
          <h2>${t('checklists.title')}</h2>
          ${checklistsHtml}
        </div>
        ` : ''}
        
        ${photos.length > 0 ? `
          <div class="photos-section" style="page-break-before: auto !important; break-before: auto !important;">
            ${photosHtml}
          </div>
        ` : ''}
        
        ${sketches.length > 0 ? `
          <div class="sketches-section" style="page-break-before: auto !important; break-before: auto !important;">
            ${sketchesHtml}
          </div>
        ` : ''}
        
        ${imagemeterHtml}
        
        ${areaCalculations.length === 0 && (photos.length > 0 || sketches.length > 0 || imagemeterHtml) ? `
          <div class="footer-container">
            ${(remarks || project?.remarks) ? `
              <div class="remarks-section" style="margin-top: 30px;">
                <h2>Bemerkungen</h2>
                <div class="remarks-box">
                  ${(remarks || project?.remarks || '').replace(/\n/g, '<br/>')}
                </div>
              </div>
            ` : ''}
            <div class="footer">
              ${t('pdf.createdWith')} - Aufmassprofi - • ${formatDate(new Date().toISOString())}
            </div>
          </div>
        ` : ''}
        </div><!-- end .page -->
        
        ${areaCalculations.length > 0 ? `
          <div class="new-page">
            <div class="area-calcs-section">
              <h2>Flächenberechnungen</h2>
              ${generateCombinedAreaCalcs()}
            </div>
            <div class="footer-container">
              ${(remarks || project?.remarks) ? `
                <div class="remarks-section" style="margin-top: 30px;">
                  <h2>Bemerkungen</h2>
                  <div class="remarks-box">
                    ${(remarks || project?.remarks || '').replace(/\n/g, '<br/>')}
                  </div>
                </div>
              ` : ''}
              <div class="footer">
                ${t('pdf.createdWith')} - Aufmassprofi - • ${formatDate(new Date().toISOString())}
              </div>
            </div>
          </div>
        ` : ''}
        
        ${photos.length === 0 && sketches.length === 0 && areaCalculations.length === 0 && !imagemeterHtml ? `
          <div class="footer-container">
            ${(remarks || project?.remarks) ? `
              <div class="remarks-section" style="margin-top: 30px;">
                <h2>Bemerkungen</h2>
                <div class="remarks-box">
                  ${(remarks || project?.remarks || '').replace(/\n/g, '<br/>')}
                </div>
              </div>
            ` : ''}
            <div class="footer">
              ${t('pdf.createdWith')} - Aufmassprofi - • ${formatDate(new Date().toISOString())}
            </div>
          </div>
        ` : ''}
      </body>
      </html>
    `;
    
    return html;
};

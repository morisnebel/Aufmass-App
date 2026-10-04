// Gemeinsame Typen, Konstanten und Geometrie-Helfer für den Skizzen-Editor
// (ausgelagert aus app/sketches/draw.tsx)
import { Platform } from 'react-native';

// Key für Tool-Größen-Einstellungen
export const TOOL_SIZES_KEY = 'aufmassprofi_tool_sizes';

// Tiefes Klonen eines Elements (schneller als JSON-Serialisierung;
// Strings sind in JS immutable und werden nur referenziert)
export function deepCloneElement(obj: any): any {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(deepCloneElement);
  const clone: any = {};
  for (const key of Object.keys(obj)) {
    clone[key] = deepCloneElement(obj[key]);
  }
  return clone;
}

export interface DrawElement {
  id: string;
  type: 'path' | 'line' | 'circle' | 'rect' | 'text' | 'image' | 'arrow' | 'pointer' | 'polygon' | 'polyline' | 'memo';
  data: any;
  color: string;
  strokeWidth: number;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  rotation?: number;
  fontSize?: number;
  fontWeight?: 'normal' | 'bold';
  fontStyle?: 'normal' | 'italic';
  fontFamily?: string;
}

export type DrawMode = 'select' | 'pen' | 'line' | 'circle' | 'rect' | 'arrow' | 'pointer' | 'text' | 'image' | 'polygon' | 'polyline' | 'memo' | 'crop' | 'addPoint' | 'removePoint';

// Verfügbare Schriftarten - Platform-spezifisch für React Native SVG
// Android verwendet die generischen Namen die von react-native-svg unterstützt werden
// iOS verwendet die nativen Systemschriftarten
export type FontFamily = 'System' | 'Handschrift' | 'Monospace' | 'Serif';
export const FONT_FAMILIES: { id: FontFamily; label: string; style: string; svgFont: string }[] = Platform.select({
  ios: [
    { id: 'System', label: 'Standard', style: 'System', svgFont: 'Helvetica' },
    { id: 'Handschrift', label: 'Handschrift', style: 'cursive', svgFont: 'Snell Roundhand' },
    { id: 'Monospace', label: 'Monospace', style: 'Courier', svgFont: 'Courier' },
    { id: 'Serif', label: 'Serif', style: 'Georgia', svgFont: 'Times New Roman' },
  ],
  android: [
    { id: 'System', label: 'Standard', style: 'normal', svgFont: 'Roboto' },
    { id: 'Handschrift', label: 'Handschrift', style: 'normal', svgFont: 'sans-serif-light' },
    { id: 'Monospace', label: 'Monospace', style: 'monospace', svgFont: 'monospace' },
    { id: 'Serif', label: 'Serif', style: 'normal', svgFont: 'serif' },
  ],
  default: [
    // Web/Browser - CSS Schriftarten funktionieren hier
    { id: 'System', label: 'Standard', style: 'system-ui, sans-serif', svgFont: 'system-ui, -apple-system, sans-serif' },
    { id: 'Handschrift', label: 'Handschrift', style: 'cursive', svgFont: 'Comic Sans MS, cursive, sans-serif' },
    { id: 'Monospace', label: 'Monospace', style: 'monospace', svgFont: 'Courier New, monospace' },
    { id: 'Serif', label: 'Serif', style: 'serif', svgFont: 'Times New Roman, Georgia, serif' },
  ],
}) as { id: FontFamily; label: string; style: string; svgFont: string }[];

// Douglas-Peucker: Linien-Vereinfachung für Freihand-Pfade
export const simplifyPath = (pathString: string, tolerance: number = 8): string => {
  const points: { x: number; y: number }[] = [];
  const parts = pathString.replace(/M/g, ' M ').replace(/L/g, ' L ').split(/\s+/).filter(p => p);

  let i = 0;
  while (i < parts.length) {
    if (parts[i] === 'M' || parts[i] === 'L') {
      if (i + 2 < parts.length) {
        const x = parseFloat(parts[i + 1]);
        const y = parseFloat(parts[i + 2]);
        if (!isNaN(x) && !isNaN(y)) {
          points.push({ x, y });
        }
        i += 3;
      } else {
        i++;
      }
    } else {
      i++;
    }
  }

  if (points.length < 3) {
    return pathString;
  }

  const simplifiedPoints = douglasPeucker(points, tolerance);
  if (simplifiedPoints.length === 0) return pathString;

  let result = `M ${simplifiedPoints[0].x.toFixed(1)} ${simplifiedPoints[0].y.toFixed(1)}`;
  for (let j = 1; j < simplifiedPoints.length; j++) {
    result += ` L ${simplifiedPoints[j].x.toFixed(1)} ${simplifiedPoints[j].y.toFixed(1)}`;
  }
  return result;
};

const douglasPeucker = (points: { x: number; y: number }[], tolerance: number): { x: number; y: number }[] => {
  if (points.length <= 2) return points;

  let maxDistance = 0;
  let maxIndex = 0;
  const start = points[0];
  const end = points[points.length - 1];

  for (let i = 1; i < points.length - 1; i++) {
    const distance = perpendicularDistance(points[i], start, end);
    if (distance > maxDistance) {
      maxDistance = distance;
      maxIndex = i;
    }
  }

  if (maxDistance > tolerance) {
    const left = douglasPeucker(points.slice(0, maxIndex + 1), tolerance);
    const right = douglasPeucker(points.slice(maxIndex), tolerance);
    return [...left.slice(0, -1), ...right];
  } else {
    return [start, end];
  }
};

const perpendicularDistance = (
  point: { x: number; y: number },
  lineStart: { x: number; y: number },
  lineEnd: { x: number; y: number }
): number => {
  const dx = lineEnd.x - lineStart.x;
  const dy = lineEnd.y - lineStart.y;

  if (dx === 0 && dy === 0) {
    return Math.sqrt(Math.pow(point.x - lineStart.x, 2) + Math.pow(point.y - lineStart.y, 2));
  }

  const t = ((point.x - lineStart.x) * dx + (point.y - lineStart.y) * dy) / (dx * dx + dy * dy);

  let nearestX, nearestY;
  if (t < 0) {
    nearestX = lineStart.x;
    nearestY = lineStart.y;
  } else if (t > 1) {
    nearestX = lineEnd.x;
    nearestY = lineEnd.y;
  } else {
    nearestX = lineStart.x + t * dx;
    nearestY = lineStart.y + t * dy;
  }

  return Math.sqrt(Math.pow(point.x - nearestX, 2) + Math.pow(point.y - nearestY, 2));
};

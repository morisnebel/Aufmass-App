// Wandflächen für Polygon-Linien: Länge × Höhe − Abzug (Türen/Fenster)
import { parseMeasurementToMeters } from './polygonArea';

export type PolygonWall = {
  height?: string; // Höhe für alle Linien des Polygons
  segments?: { [segmentIndex: number]: WallSegment };
};
export type WallOpening = { width: string; height: string }; // Tür/Fenster: Breite × Höhe
export type WallSegment = { height?: string; deduction?: string; openings?: WallOpening[] };
export type PolygonWalls = { [elementId: string]: PolygonWall };

// Abzug in m² (z.B. "1,8" oder "1.8 m²")
export const parseSquareMeters = (value?: string): number => {
  const parsed = parseFloat((value || '').replace(',', '.'));
  return isFinite(parsed) && parsed > 0 ? parsed : 0;
};

export const openingAreaM2 = (opening: WallOpening): number =>
  Math.round(parseMeasurementToMeters(opening.width || '') * parseMeasurementToMeters(opening.height || '') * 100) / 100;

// Gesamter Abzug einer Linie: Öffnungen (Breite × Höhe) + frei eingegebene m²
export const segmentDeductionM2 = (segment?: WallSegment): number =>
  Math.round(((segment?.openings || []).reduce((sum, o) => sum + openingAreaM2(o), 0) + parseSquareMeters(segment?.deduction)) * 100) / 100;

export const segmentCountOf = (element: any): number => {
  const points = element?.type === 'polyline' ? element.data?.points?.length || 0 : 0;
  return Math.max(0, element?.data?.closed ? points : points - 1);
};

// Netto-Wandfläche einer Linie; null wenn Länge oder Höhe fehlt
export const wallSegmentAreaM2 = (measurement: string | undefined, wall: PolygonWall | undefined, segmentIndex: number): number | null => {
  const length = parseMeasurementToMeters(measurement || '');
  const segment = wall?.segments?.[segmentIndex];
  const height = parseMeasurementToMeters(segment?.height || wall?.height || '');
  if (!(length > 0) || !(height > 0)) return null;
  return Math.round(Math.max(0, length * height - segmentDeductionM2(segment)) * 100) / 100;
};

// Summe aller berechenbaren Wände eines Polygons
export const calculateWallAreaM2 = (
  element: any,
  measures: { [segmentIndex: number]: string } | undefined,
  wall: PolygonWall | undefined
): { total: number; walls: number; segments: number } | null => {
  const segments = segmentCountOf(element);
  if (!wall || segments === 0) return null;
  let total = 0;
  let walls = 0;
  for (let i = 0; i < segments; i++) {
    const area = wallSegmentAreaM2(measures?.[i], wall, i);
    if (area !== null) {
      total += area;
      walls += 1;
    }
  }
  return walls > 0 ? { total: Math.round(total * 100) / 100, walls, segments } : null;
};

// Einzelne Wände eines Polygons (für die Wandliste im PDF)
export const wallRows = (element: any, measures: { [segmentIndex: number]: string } | undefined, wall: PolygonWall | undefined) => {
  const rows: { line: number; length: number; height: number; deduction: number; openings: WallOpening[]; area: number }[] = [];
  for (let i = 0; i < segmentCountOf(element); i++) {
    const area = wallSegmentAreaM2(measures?.[i], wall, i);
    if (area === null) continue;
    const segment = wall?.segments?.[i];
    rows.push({
      line: i + 1,
      length: parseMeasurementToMeters(measures?.[i] || ''),
      height: parseMeasurementToMeters(segment?.height || wall?.height || ''),
      deduction: segmentDeductionM2(segment),
      openings: (segment?.openings || []).filter(o => openingAreaM2(o) > 0),
      area,
    });
  }
  return rows;
};

// Hat das Polygon Wandhöhen? (dann werden die Linien in der Skizze nummeriert)
export const hasWallHeights = (wall: PolygonWall | undefined): boolean =>
  !!wall && (parseMeasurementToMeters(wall.height || '') > 0 ||
    Object.values(wall.segments || {}).some(s => parseMeasurementToMeters(s.height || '') > 0));

// Positionen der Linien-Nummern: Linienmitte, um `offset` nach innen (zum Schwerpunkt) versetzt
export const segmentNumberPositions = (points: { x: number; y: number }[], closed: boolean, offset: number) => {
  const cx = points.reduce((a, p) => a + p.x, 0) / points.length;
  const cy = points.reduce((a, p) => a + p.y, 0) / points.length;
  const count = closed ? points.length : points.length - 1;
  const result: { line: number; x: number; y: number }[] = [];
  for (let i = 0; i < count; i++) {
    const p1 = points[i];
    const p2 = points[(i + 1) % points.length];
    const midX = (p1.x + p2.x) / 2;
    const midY = (p1.y + p2.y) / 2;
    const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
    const nx = -Math.sin(angle);
    const ny = Math.cos(angle);
    const sign = nx * (cx - midX) + ny * (cy - midY) >= 0 ? 1 : -1;
    result.push({ line: i + 1, x: midX + nx * offset * sign, y: midY + ny * offset * sign });
  }
  return result;
};

// Schnellvorlagen für Öffnungen
export const OPENING_PRESETS: { id: string; label: string; opening: WallOpening }[] = [
  { id: 'door', label: 'Tür', opening: { width: '0,885m', height: '2,01m' } },
  { id: 'window', label: 'Fenster', opening: { width: '1,00m', height: '1,20m' } },
];

// Türen/Fenster als Markierung auf der Linie: gleichmäßig verteilt, Länge maßstäblich zur Linie
// (wenn Linienmaß und Breite bekannt sind). Höhe ab 1,80 m gilt als Tür, sonst Fenster.
export type OpeningMarker = {
  segmentIndex: number; openingIndex: number; kind: 'door' | 'window';
  x1: number; y1: number; x2: number; y2: number; // Markierung auf der Linie
  nx: number; ny: number; // Einheitsvektor quer zur Linie, zeigt ins Rauminnere
  labelX: number; labelY: number; label: string;
};
export const openingMarkers = (
  points: { x: number; y: number }[],
  closed: boolean,
  measures: { [segmentIndex: number]: string } | undefined,
  wall: PolygonWall | undefined
): OpeningMarker[] => {
  const markers: OpeningMarker[] = [];
  if (!wall?.segments || points.length < 2) return markers;
  const cx = points.reduce((a, p) => a + p.x, 0) / points.length;
  const cy = points.reduce((a, p) => a + p.y, 0) / points.length;
  const count = closed ? points.length : points.length - 1;
  const short = (value: string) => (value || '').trim().replace(/m$/i, '') || '?';
  for (let i = 0; i < count; i++) {
    const openings = wall.segments[i]?.openings || [];
    if (openings.length === 0) continue;
    const p1 = points[i];
    const p2 = points[(i + 1) % points.length];
    const pixelLength = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    if (!(pixelLength > 0)) continue;
    const ux = (p2.x - p1.x) / pixelLength;
    const uy = (p2.y - p1.y) / pixelLength;
    const midX = (p1.x + p2.x) / 2;
    const midY = (p1.y + p2.y) / 2;
    const sign = -uy * (cx - midX) + ux * (cy - midY) >= 0 ? 1 : -1;
    const nx = -uy * sign;
    const ny = ux * sign;
    const meters = parseMeasurementToMeters(measures?.[i] || '');
    const slot = pixelLength / openings.length;
    openings.forEach((opening, j) => {
      const width = parseMeasurementToMeters(opening.width || '');
      const scaled = meters > 0 && width > 0 ? (width / meters) * pixelLength : 26;
      const length = Math.max(14, Math.min(scaled, slot * 0.8));
      const center = slot * (j + 0.5);
      const ax = p1.x + ux * (center - length / 2);
      const ay = p1.y + uy * (center - length / 2);
      const kind = parseMeasurementToMeters(opening.height || '') >= 1.8 ? 'door' : 'window';
      markers.push({
        segmentIndex: i, openingIndex: j, kind, nx, ny,
        x1: ax, y1: ay, x2: ax + ux * length, y2: ay + uy * length,
        labelX: p1.x + ux * center + nx * 30, labelY: p1.y + uy * center + ny * 30,
        label: `${kind === 'door' ? 'T' : 'F'} ${short(opening.width)}×${short(opening.height)}`,
      });
    });
  }
  return markers;
};
export const OPENING_COLORS = { door: '#6d4c41', window: '#0277bd' };

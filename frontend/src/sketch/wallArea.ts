// Wandflächen für Polygon-Linien: Länge × Höhe − Abzug (Türen/Fenster)
import { parseMeasurementToMeters } from './polygonArea';

export type PolygonWall = {
  height?: string; // Höhe für alle Linien des Polygons
  segments?: { [segmentIndex: number]: { height?: string; deduction?: string } };
};
export type PolygonWalls = { [elementId: string]: PolygonWall };

// Abzug in m² (z.B. "1,8" oder "1.8 m²")
export const parseSquareMeters = (value?: string): number => {
  const parsed = parseFloat((value || '').replace(',', '.'));
  return isFinite(parsed) && parsed > 0 ? parsed : 0;
};

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
  return Math.round(Math.max(0, length * height - parseSquareMeters(segment?.deduction)) * 100) / 100;
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

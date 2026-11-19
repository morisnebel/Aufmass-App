// Reine Flächenberechnung für Grundriss-Polygone – genutzt von Skizze und Projekt-PDF

export const parseMeasurementToMeters = (measurement: string): number => {
  // Extrahiere Zahl und Einheit aus dem Maß-String (z.B. "2,50m" -> 2.50m, "25cm" -> 0.25m, "1500mm" -> 1.5m)
  const match = measurement.match(/^([\d.,]+)\s*(cm|mm|m)?/i);
  if (match) {
    const value = parseFloat(match[1].replace(',', '.'));
    if (isNaN(value)) return 0;
    const unit = (match[2] || 'm').toLowerCase();
    if (unit === 'cm') return value / 100;
    if (unit === 'mm') return value / 1000;
    return value; // Default: Meter
  }
  return 0;
};

// Eingefrorene Form je Polygon: Die Winkel für die Flächenberechnung stammen aus dem Stand,
// als zuletzt ein Maß geändert wurde – Punkte verschieben ändert die Fläche dadurch nicht.
export type PolygonAreaShapes = { [elementId: string]: { points: { x: number; y: number }[]; key: string } };

export const areaShapeKey = (pointCount: number, measures: { [seg: number]: string } | undefined): string =>
  `${pointCount}|${Array.from({ length: pointCount }, (_, i) => measures?.[i] || '').join('|')}`;

// Zusatzangaben für eine genauere Fläche
export type PolygonAreaOption = { rightAngles?: boolean; diagonal?: string; diagonals?: { [vertexIndex: number]: string } };
export type PolygonAreaOptions = { [elementId: string]: PolygonAreaOption };

const heron = (a: number, b: number, c: number): number | null => {
  const s = (a + b + c) / 2;
  const under = s * (s - a) * (s - b) * (s - c);
  return under > 0 ? Math.sqrt(under) : null;
};

// Diagonale von Ecke 0 (zwischen letzter Linie und Linie 1) zur Ecke k (zwischen Linie k und k+1)
export const getDiagonal = (option: PolygonAreaOption | undefined, k: number): string =>
  option?.diagonals?.[k] ?? (k === 2 ? option?.diagonal : undefined) ?? '';

export const diagonalTargets = (pointCount: number): number[] =>
  Array.from({ length: Math.max(0, pointCount - 3) }, (_, i) => i + 2);

// Fläche über Diagonalen: Das Polygon wird von Ecke 0 aus in Dreiecke zerlegt, jedes ist durch
// drei Längen exakt bestimmt (Heron). Die Zeichnung liefert nur noch, ob ein Dreieck dazuzählt
// oder abgezogen wird (einspringende Ecken). null, wenn Maße/Diagonalen fehlen oder nicht passen.
export const polygonDiagonalAreaM2 = (
  measures: { [seg: number]: string } | undefined,
  option: PolygonAreaOption | undefined,
  pointCount: number,
  points?: { x: number; y: number }[]
): number | null => {
  if (pointCount < 4) return null;
  const sides = Array.from({ length: pointCount }, (_, i) => parseMeasurementToMeters(measures?.[i] || ''));
  const diagonals = diagonalTargets(pointCount).map(k => parseMeasurementToMeters(getDiagonal(option, k)));
  if (sides.some(v => !(v > 0)) || diagonals.some(v => !(v > 0))) return null;
  // Abstand von Ecke 0 zu Ecke i: Seite 0, Diagonalen, letzte Seite
  const fromStart = [0, sides[0], ...diagonals, sides[pointCount - 1]];
  const cross = (i: number) => points && points.length === pointCount
    ? (points[i].x - points[0].x) * (points[i + 1].y - points[0].y) - (points[i + 1].x - points[0].x) * (points[i].y - points[0].y)
    : 1;
  let total = 0;
  let orientation = 0;
  const parts: { area: number; cross: number }[] = [];
  for (let i = 1; i < pointCount - 1; i++) {
    const area = heron(fromStart[i], sides[i], fromStart[i + 1]);
    if (area === null) return null;
    parts.push({ area, cross: cross(i) });
    orientation += cross(i);
  }
  parts.forEach(part => { total += part.cross * orientation < 0 ? -part.area : part.area; });
  return total > 0 ? Math.round(total * 100) / 100 : null;
};

export const quadDiagonalAreaM2 = (measures: { [seg: number]: string } | undefined, diagonal: string | undefined): number | null =>
  polygonDiagonalAreaM2(measures, { diagonals: { 2: diagonal || '' } }, 4);

export const calculatePolygonAreaM2 = (
  element: any,
  lineSegmentMeasurements: { [id: string]: { [seg: number]: string } },
  shapePoints?: { x: number; y: number }[],
  option?: PolygonAreaOption
): number | null => {
  if (element.type !== 'polyline' || !element.data?.closed) return null;
  const points: { x: number; y: number }[] =
    shapePoints && shapePoints.length === element.data.points?.length ? shapePoints : element.data.points;
  if (!points || points.length < 3) return null;
  const measures = lineSegmentMeasurements[element.id];
  if (!measures) return null;

  const n = points.length; // n Punkte = n Segmente (inkl. Schluss-Segment n-1)

  // Gemessene Diagonalen: exakt, unabhängig von den gezeichneten Winkeln
  if (n >= 4 && option && diagonalTargets(n).some(k => getDiagonal(option, k).trim())) {
    const diagonalArea = polygonDiagonalAreaM2(measures, option, n, points);
    if (diagonalArea !== null) return diagonalArea;
  }

  // 1) Alle Segmente müssen ein numerisches Maß haben
  const lengths: number[] = [];
  const rawAngles: number[] = [];
  for (let i = 0; i < n; i++) {
    const meters = parseMeasurementToMeters(measures[i] || '');
    if (!meters || meters <= 0) return null; // Maß fehlt oder nicht numerisch
    const p1 = points[i];
    const p2 = i === n - 1 ? points[0] : points[i + 1];
    if (!p1 || !p2) return null;
    const pxLen = Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
    if (pxLen <= 0) return null;
    lengths.push(meters);
    rawAngles.push(Math.atan2(p2.y - p1.y, p2.x - p1.x)); // Richtung aus der Zeichnung
  }

  // Sonderfall Dreieck: Fläche ist durch die 3 Seiten EXAKT bestimmt (Heron-Formel),
  // die gezeichneten Winkel werden nicht benötigt
  if (n === 3) {
    const [a, b, c] = lengths;
    const s = (a + b + c) / 2;
    const under = s * (s - a) * (s - b) * (s - c);
    if (under <= 0) return null; // Seiten ergeben kein gültiges Dreieck
    const heronArea = Math.sqrt(under);
    if (!isFinite(heronArea) || heronArea <= 0) return null;
    return Math.round(heronArea * 100) / 100;
  }

  // 1b) Winkel-Einrastung: Drehwinkel zwischen ALLEN aufeinanderfolgenden Kanten
  // (inkl. Schluss-Drehung) aufs 45°-Raster einrasten (Toleranz ±12°)
  const SNAP_STEP = Math.PI / 4; // 45°
  const SNAP_TOL = (12 * Math.PI) / 180; // ±12°
  // „Alle Ecken rechtwinklig“: jede Ecke wird auf ±90° (bzw. 0°) gesetzt, egal wie schief gezeichnet
  const forceRight = !!option?.rightAngles;
  const turns: number[] = [];
  const wasSnapped: boolean[] = [];
  for (let i = 0; i < n; i++) {
    const prevAngle = rawAngles[(i - 1 + n) % n];
    let turn = rawAngles[i] - prevAngle;
    // Normalisieren auf (-180°, 180°]
    while (turn > Math.PI) turn -= 2 * Math.PI;
    while (turn <= -Math.PI) turn += 2 * Math.PI;
    const snapped = forceRight ? Math.round(turn / (Math.PI / 2)) * (Math.PI / 2) : Math.round(turn / SNAP_STEP) * SNAP_STEP;
    if (forceRight || Math.abs(turn - snapped) <= SNAP_TOL) {
      turns.push(snapped);
      wasSnapped.push(true);
    } else {
      turns.push(turn);
      wasSnapped.push(false);
    }
  }

  // 1c) Winkelschluss-Ausgleich: Die Summe aller Drehwinkel eines geschlossenen
  // Polygons muss exakt ±360° sein. Der Restfehler wird auf die NICHT eingerasteten
  // (= unsicher gezeichneten) Ecken verteilt – so korrigieren sich schiefe Ecken selbst
  const turnSum = turns.reduce((a, b) => a + b, 0);
  const target = turnSum >= 0 ? 2 * Math.PI : -2 * Math.PI;
  const residual = target - turnSum;
  // Zeichnung lässt sich nicht rechtwinklig schließen: normale Berechnung verwenden
  if (forceRight && Math.abs(residual) > 1e-6) {
    return calculatePolygonAreaM2(element, lineSegmentMeasurements, shapePoints, { ...option, rightAngles: false });
  }
  if (Math.abs(residual) > 1e-9) {
    const freeIdx: number[] = [];
    for (let i = 0; i < n; i++) {
      if (!wasSnapped[i]) freeIdx.push(i);
    }
    const distributeOver = freeIdx.length > 0 ? freeIdx : turns.map((_, i) => i);
    for (const i of distributeOver) {
      turns[i] += residual / distributeOver.length;
    }
  }

  // 1d) Kanten-Richtungen aus den korrigierten Drehwinkeln rekonstruieren
  const angles: number[] = [rawAngles[0]];
  for (let i = 1; i < n; i++) {
    angles.push(angles[i - 1] + turns[i]);
  }

  // 2) Kanten-Vektoren aus eingegebener Länge + gezeichnetem Winkel
  const edges = lengths.map((len, i) => ({
    x: len * Math.cos(angles[i]),
    y: len * Math.sin(angles[i]),
  }));

  // 3) Schließfehler berechnen und per Bowditch-Ausgleich auf die Ecken verteilen
  const totalLength = lengths.reduce((a, b) => a + b, 0);
  const closeErrX = edges.reduce((a, e) => a + e.x, 0);
  const closeErrY = edges.reduce((a, e) => a + e.y, 0);

  const vertices: { x: number; y: number }[] = [{ x: 0, y: 0 }];
  for (let i = 0; i < n - 1; i++) {
    // Korrigierte Kante: Anteil des Schließfehlers proportional zur Seitenlänge abziehen
    const corr = lengths[i] / totalLength;
    vertices.push({
      x: vertices[i].x + edges[i].x - closeErrX * corr,
      y: vertices[i].y + edges[i].y - closeErrY * corr,
    });
  }

  // 4) Shoelace-Formel auf den rekonstruierten Ecken (in Metern)
  let areaM2 = 0;
  for (let i = 0; i < vertices.length; i++) {
    const j = (i + 1) % vertices.length;
    areaM2 += vertices[i].x * vertices[j].y - vertices[j].x * vertices[i].y;
  }
  areaM2 = Math.abs(areaM2) / 2;

  if (!isFinite(areaM2) || areaM2 <= 0) return null;
  return Math.round(areaM2 * 100) / 100;
};

export const formatAreaM2 = (area: number): string => `${area.toFixed(2).replace('.', ',')} m²`;

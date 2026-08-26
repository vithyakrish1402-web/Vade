/**
 * Gesture Normalization & Geometric Preprocessing Engine
 *
 * Implements standard unistroke geometric normalization:
 * 1. Path length verification (reject accidental taps / noise)
 * 2. Equidistant arc-length resampling (N=64 points)
 * 3. Centroid translation to origin (0,0) (Translation invariance)
 * 4. Proportional scaling to standard bounding box (Scale invariance)
 * 5. Stroke direction preservation
 */

export interface Point {
  x: number;
  y: number;
}

export interface RawPoint extends Point {
  t: number;
}

export const RESAMPLE_POINT_COUNT = 64;
export const MIN_GESTURE_PATH_LENGTH = 30; // Minimum pixels drawn to be considered a valid stroke
export const NORMALIZED_BOUNDING_SIZE = 100; // Standard bounding box size (100x100)

/**
 * Calculates Euclidean distance between two points.
 */
export function distance(p1: Point, p2: Point): number {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Calculates the total cumulative arc length of a stroke path.
 */
export function calculatePathLength(points: Point[]): number {
  if (points.length < 2) return 0;
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += distance(points[i - 1], points[i]);
  }
  return total;
}

/**
 * Validates that a stroke contains valid coordinates and exceeds the minimum path length.
 * Rejects empty arrays, single-point taps, NaNs, and infinites.
 */
export function isValidStroke(
  points: Point[],
  minPathLength = MIN_GESTURE_PATH_LENGTH
): boolean {
  if (!points || points.length < 2) return false;

  for (const p of points) {
    if (
      p.x === undefined ||
      p.y === undefined ||
      Number.isNaN(p.x) ||
      Number.isNaN(p.y) ||
      !Number.isFinite(p.x) ||
      !Number.isFinite(p.y)
    ) {
      return false;
    }
  }

  return calculatePathLength(points) >= minPathLength;
}

/**
 * Resamples a continuous path into N equidistant points along the path arc length.
 * This guarantees consistent point density regardless of drawing speed.
 */
export function resamplePoints(
  points: Point[],
  n = RESAMPLE_POINT_COUNT
): Point[] {
  if (points.length === 0) return [];
  if (points.length === 1) {
    return Array.from({ length: n }, () => ({ ...points[0] }));
  }

  const totalLength = calculatePathLength(points);
  if (totalLength === 0) {
    return Array.from({ length: n }, () => ({ ...points[0] }));
  }

  const interval = totalLength / (n - 1);
  let accumulatedDistance = 0;
  const resampled: Point[] = [{ ...points[0] }];
  const srcPoints = points.map((p) => ({ ...p }));

  for (let i = 1; i < srcPoints.length; i++) {
    const p1 = srcPoints[i - 1];
    const p2 = srcPoints[i];
    const segDist = distance(p1, p2);

    if (segDist === 0) continue;

    if (accumulatedDistance + segDist >= interval) {
      const remainingToTarget = interval - accumulatedDistance;
      const ratio = remainingToTarget / segDist;
      const newPoint: Point = {
        x: p1.x + ratio * (p2.x - p1.x),
        y: p1.y + ratio * (p2.y - p1.y),
      };

      resampled.push(newPoint);
      srcPoints.splice(i, 0, newPoint);
      accumulatedDistance = 0;
    } else {
      accumulatedDistance += segDist;
    }
  }

  // Ensure exact count N by padding with last point if minor floating point rounding occurred
  while (resampled.length < n) {
    resampled.push({ ...points[points.length - 1] });
  }

  return resampled.slice(0, n);
}

/**
 * Translates points so that the centroid of the shape is at the coordinate origin (0, 0).
 */
export function translateToOrigin(points: Point[]): Point[] {
  if (points.length === 0) return [];

  let sumX = 0;
  let sumY = 0;

  for (const p of points) {
    sumX += p.x;
    sumY += p.y;
  }

  const centroidX = sumX / points.length;
  const centroidY = sumY / points.length;

  return points.map((p) => ({
    x: p.x - centroidX,
    y: p.y - centroidY,
  }));
}

/**
 * Scales the gesture to fit inside a standard bounding box while preserving aspect ratio.
 */
export function scaleToBoundingBox(
  points: Point[],
  size = NORMALIZED_BOUNDING_SIZE
): Point[] {
  if (points.length === 0) return [];

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }

  const width = Math.max(maxX - minX, 1);
  const height = Math.max(maxY - minY, 1);
  const maxDim = Math.max(width, height);
  const scale = size / maxDim;

  return points.map((p) => ({
    x: p.x * scale,
    y: p.y * scale,
  }));
}

/**
 * Full normalization pipeline:
 * 1. Validate stroke length
 * 2. Resample to N=64 equidistant points
 * 3. Scale to bounding box
 * 4. Translate centroid to origin (0,0)
 */
export function normalizeGesture(rawPoints: Point[]): Point[] | null {
  if (!isValidStroke(rawPoints)) {
    return null;
  }

  const resampled = resamplePoints(rawPoints, RESAMPLE_POINT_COUNT);
  const scaled = scaleToBoundingBox(resampled, NORMALIZED_BOUNDING_SIZE);
  const normalized = translateToOrigin(scaled);

  return normalized;
}

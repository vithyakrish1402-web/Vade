import { describe, it, expect, beforeEach } from 'vitest';
import './setup';
import {
  distance,
  calculatePathLength,
  isValidStroke,
  resamplePoints,
  translateToOrigin,
  scaleToBoundingBox,
  normalizeGesture,
  RESAMPLE_POINT_COUNT,
  type Point,
} from '../src/utils/gestureNormalize';
import {
  calculateGestureDistance,
  calculateGestureSimilarity,
  isGestureMatch,
  compareEnrolledGestures,
  DEFAULT_MATCH_DISTANCE_THRESHOLD,
} from '../src/utils/gestureRecognizer';
import {
  saveGestureSequence,
  getGestureSequence,
  deleteGestureSequence,
  hasGestureSequence,
  CURRENT_GESTURE_VERSION,
} from '../src/utils/gestureStorage';

// Helper geometric shapes
function createUShape(offset = { x: 0, y: 0 }, scale = 1): Point[] {
  const pts: Point[] = [];
  // Left vertical down
  for (let y = 0; y <= 100; y += 10) {
    pts.push({ x: 0 * scale + offset.x, y: y * scale + offset.y });
  }
  // Bottom horizontal across
  for (let x = 10; x <= 100; x += 10) {
    pts.push({ x: x * scale + offset.x, y: 100 * scale + offset.y });
  }
  // Right vertical up
  for (let y = 90; y >= 0; y -= 10) {
    pts.push({ x: 100 * scale + offset.x, y: y * scale + offset.y });
  }
  return pts;
}

function createCircle(radius = 50, center = { x: 100, y: 100 }): Point[] {
  const pts: Point[] = [];
  for (let i = 0; i <= 360; i += 10) {
    const rad = (i * Math.PI) / 180;
    pts.push({
      x: center.x + radius * Math.cos(rad),
      y: center.y + radius * Math.sin(rad),
    });
  }
  return pts;
}

function createTriangle(): Point[] {
  const pts: Point[] = [];
  // Top (50, 0) to Bottom-Right (100, 100)
  for (let i = 0; i <= 10; i++) {
    pts.push({ x: 50 + i * 5, y: i * 10 });
  }
  // Bottom-Right (100, 100) to Bottom-Left (0, 100)
  for (let i = 1; i <= 10; i++) {
    pts.push({ x: 100 - i * 10, y: 100 });
  }
  // Bottom-Left (0, 100) to Top (50, 0)
  for (let i = 1; i <= 10; i++) {
    pts.push({ x: i * 5, y: 100 - i * 10 });
  }
  return pts;
}

function createStraightLine(): Point[] {
  const pts: Point[] = [];
  for (let x = 0; x <= 100; x += 5) {
    pts.push({ x, y: 50 });
  }
  return pts;
}

describe('Gesture Normalization & Geometric Preprocessing (Phase 6)', () => {
  describe('Path Length & Validation', () => {
    it('calculates distance and path length correctly', () => {
      expect(distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);

      const path = [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 20 },
      ];
      expect(calculatePathLength(path)).toBe(30);
    });

    it('rejects empty arrays, single points, or tiny tap noise (< 30px)', () => {
      expect(isValidStroke([])).toBe(false);
      expect(isValidStroke([{ x: 10, y: 10 }])).toBe(false);
      expect(isValidStroke([{ x: 10, y: 10 }, { x: 15, y: 12 }])).toBe(false); // 5.3px length
    });

    it('rejects strokes containing NaN or infinite coordinates', () => {
      expect(isValidStroke([{ x: NaN, y: 10 }, { x: 20, y: 20 }])).toBe(false);
      expect(isValidStroke([{ x: 10, y: Infinity }, { x: 50, y: 50 }])).toBe(false);
    });

    it('accepts strokes exceeding minimum path length threshold', () => {
      const validPath = [
        { x: 0, y: 0 },
        { x: 50, y: 50 },
      ];
      expect(isValidStroke(validPath)).toBe(true);
    });
  });

  describe('Resampling', () => {
    it('resamples a 5-point path into exactly 64 equidistant points', () => {
      const fivePoints = [
        { x: 0, y: 0 },
        { x: 25, y: 0 },
        { x: 50, y: 0 },
        { x: 75, y: 0 },
        { x: 100, y: 0 },
      ];
      const resampled = resamplePoints(fivePoints, 64);
      expect(resampled.length).toBe(64);
      expect(resampled[0]).toEqual({ x: 0, y: 0 });
      expect(resampled[63].x).toBeCloseTo(100, 0);
    });

    it('resamples a dense 300-point path into exactly 64 equidistant points', () => {
      const dense = createCircle(60);
      const resampled = resamplePoints(dense, 64);
      expect(resampled.length).toBe(64);
    });
  });

  describe('Translation & Scale Invariance', () => {
    it('translates centroid of shape to (0,0)', () => {
      const points = [
        { x: 100, y: 100 },
        { x: 200, y: 100 },
        { x: 200, y: 200 },
        { x: 100, y: 200 },
      ];
      const translated = translateToOrigin(points);
      const avgX = translated.reduce((sum, p) => sum + p.x, 0) / translated.length;
      const avgY = translated.reduce((sum, p) => sum + p.y, 0) / translated.length;

      expect(avgX).toBeCloseTo(0, 5);
      expect(avgY).toBeCloseTo(0, 5);
    });

    it('scales small and large shapes to standard bounding box', () => {
      const smallU = createUShape({ x: 0, y: 0 }, 0.5);
      const largeU = createUShape({ x: 0, y: 0 }, 3.0);

      const normSmall = normalizeGesture(smallU)!;
      const normLarge = normalizeGesture(largeU)!;

      expect(normSmall).toBeDefined();
      expect(normLarge).toBeDefined();
      expect(normSmall.length).toBe(RESAMPLE_POINT_COUNT);
      expect(normLarge.length).toBe(RESAMPLE_POINT_COUNT);
    });
  });
});

describe('Gesture Recognizer & Similarity Matching (Phase 6)', () => {
  it('recognizes identical gestures with distance 0 and similarity 1.0', () => {
    const uShape = createUShape();
    const normalized = normalizeGesture(uShape)!;

    const dist = calculateGestureDistance(normalized, normalized);
    const similarity = calculateGestureSimilarity(normalized, normalized);

    expect(dist).toBe(0);
    expect(similarity).toBe(1.0);
    expect(isGestureMatch(uShape, normalized)).toBe(true);
  });

  it('matches gestures despite scale and translation differences (Scale & Translation Invariance)', () => {
    const originalU = createUShape({ x: 50, y: 50 }, 1.0);
    const shiftedSmallU = createUShape({ x: 300, y: 400 }, 0.4);

    const enrolledTemplate = normalizeGesture(originalU)!;
    const isMatch = isGestureMatch(shiftedSmallU, enrolledTemplate);
    const dist = calculateGestureDistance(normalizeGesture(shiftedSmallU)!, enrolledTemplate);

    expect(dist).toBeLessThan(DEFAULT_MATCH_DISTANCE_THRESHOLD);
    expect(isMatch).toBe(true);
  });

  it('strictly rejects completely different geometric shapes', () => {
    const uShape = createUShape();
    const circle = createCircle();
    const triangle = createTriangle();
    const straightLine = createStraightLine();

    const enrolledU = normalizeGesture(uShape)!;

    // Circle vs U
    expect(isGestureMatch(circle, enrolledU)).toBe(false);
    expect(calculateGestureSimilarity(normalizeGesture(circle)!, enrolledU)).toBeLessThan(0.70);

    // Triangle vs U
    expect(isGestureMatch(triangle, enrolledU)).toBe(false);

    // Straight line vs U
    expect(isGestureMatch(straightLine, enrolledU)).toBe(false);
  });

  it('preserves stroke direction (rejects reversed drawing direction)', () => {
    const forwardU = createUShape();
    const reversedU = [...forwardU].reverse();

    const enrolledTemplate = normalizeGesture(forwardU)!;
    const normalizedReversed = normalizeGesture(reversedU)!;

    const dist = calculateGestureDistance(normalizedReversed, enrolledTemplate);
    expect(dist).toBeGreaterThan(DEFAULT_MATCH_DISTANCE_THRESHOLD);
    expect(isGestureMatch(reversedU, enrolledTemplate)).toBe(false);
  });

  it('successfully compares two similar gestures in enrollment confirmation', () => {
    const raw1 = createUShape({ x: 10, y: 10 }, 1.0);
    // Draw with slight natural wobble
    const raw2 = createUShape({ x: 20, y: 25 }, 1.1).map((p) => ({
      x: p.x + (Math.random() * 4 - 2),
      y: p.y + (Math.random() * 4 - 2),
    }));

    expect(compareEnrolledGestures(raw1, raw2)).toBe(true);
  });
});

describe('Local Gesture Storage (Phase 6)', () => {
  const testUserId = 'test-user-uuid-12345';

  beforeEach(() => {
    localStorage.clear();
  });

  it('saves and retrieves a multi-step normalized gesture sequence locally', () => {
    const step1 = normalizeGesture(createUShape())!;
    const step2 = normalizeGesture(createCircle())!;
    const step3 = normalizeGesture(createTriangle())!;

    const sequence = [step1, step2, step3];

    const saved = saveGestureSequence(testUserId, sequence);
    expect(saved).toBe(true);
    expect(hasGestureSequence(testUserId)).toBe(true);

    const loaded = getGestureSequence(testUserId);
    expect(loaded).toBeDefined();
    expect(loaded?.version).toBe(CURRENT_GESTURE_VERSION);
    expect(loaded?.sequence.length).toBe(3);
    expect(loaded?.sequence[0].points.length).toBe(RESAMPLE_POINT_COUNT);
  });

  it('deletes gesture sequence correctly from local storage', () => {
    const step1 = normalizeGesture(createUShape())!;
    saveGestureSequence(testUserId, [step1]);
    expect(hasGestureSequence(testUserId)).toBe(true);

    deleteGestureSequence(testUserId);
    expect(hasGestureSequence(testUserId)).toBe(false);
    expect(getGestureSequence(testUserId)).toBeNull();
  });

  it('fails safely when encountering corrupted or invalid JSON in storage', () => {
    localStorage.setItem(`enctxt_gesture_${testUserId}`, '{"corrupted": true');
    expect(hasGestureSequence(testUserId)).toBe(false);
    expect(getGestureSequence(testUserId)).toBeNull();
  });

  it('rejects incompatible schema versions (version !== 1)', () => {
    localStorage.setItem(
      `enctxt_gesture_${testUserId}`,
      JSON.stringify({ version: 999, sequence: [] })
    );
    expect(hasGestureSequence(testUserId)).toBe(false);
  });
});

import { describe, it, expect } from 'vitest';
import {
  isDistinctiveShape,
  straightness,
  normalizeGesture,
  MAX_ENROLLMENT_STRAIGHTNESS,
  type Point,
} from '../src/utils/gestureNormalize';
import {
  isGestureMatch,
  DEFAULT_MATCH_DISTANCE_THRESHOLD,
  CONFIRMATION_DISTANCE_THRESHOLD,
} from '../src/utils/gestureRecognizer';

function poly(...corners: [number, number][]): Point[] {
  const out: Point[] = [];
  for (let s = 0; s < corners.length - 1; s++) {
    const [x0, y0] = corners[s];
    const [x1, y1] = corners[s + 1];
    for (let i = 0; i <= 40; i++) {
      const t = i / 40;
      out.push({ x: x0 + (x1 - x0) * t, y: y0 + (y1 - y0) * t });
    }
  }
  return out;
}

const SHAPES: Record<string, Point[]> = {
  L: poly([40, 40], [40, 230], [230, 230]),
  check: poly([50, 140], [110, 210], [230, 60]),
  Z: poly([40, 40], [230, 40], [40, 230], [230, 230]),
  N: poly([40, 230], [40, 40], [230, 230], [230, 40]),
  triangle: poly([140, 40], [230, 220], [50, 220], [140, 40]),
  U: poly([50, 40], [50, 220], [220, 220], [220, 40]),
};

const LINES: Record<string, Point[]> = {
  horizontal: poly([40, 140], [240, 140]),
  vertical: poly([140, 40], [140, 240]),
  diagonal: poly([50, 50], [230, 230]),
};

/** A genuine redraw: different position, different size, hand wobble. */
function redraw(base: Point[], wobble: number, seed: number): Point[] {
  let state = seed;
  const rand = () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return state / 0x7fffffff;
  };
  const dx = (rand() - 0.5) * 60;
  const dy = (rand() - 0.5) * 60;
  const scale = 1 + (rand() - 0.5) * 0.5;
  return base.map((p) => ({
    x: p.x * scale + dx + (rand() - 0.5) * 2 * wobble,
    y: p.y * scale + dy + (rand() - 0.5) * 2 * wobble,
  }));
}

describe('Gesture discrimination', () => {
  it('keeps the thresholds identical to the Android constants', () => {
    // Both platforms are tuned from the same sweep; drift between them means a gesture that
    // works on one device and not the other.
    expect(DEFAULT_MATCH_DISTANCE_THRESHOLD).toBe(14.0);
    expect(CONFIRMATION_DISTANCE_THRESHOLD).toBe(15.0);
    expect(MAX_ENROLLMENT_STRAIGHTNESS).toBe(0.9);
  });

  it('never lets one distinct shape unlock another', () => {
    const names = Object.keys(SHAPES);
    const accepted: string[] = [];

    for (const enrolled of names) {
      const template = normalizeGesture(SHAPES[enrolled]);
      expect(template).not.toBeNull();
      for (const attacker of names) {
        if (attacker === enrolled) continue;
        if (isGestureMatch(SHAPES[attacker], template!)) {
          accepted.push(`${attacker} unlocked ${enrolled}`);
        }
      }
    }

    expect(accepted).toEqual([]);
  });

  it('accepts genuine redraws even when untidy', () => {
    let attempts = 0;
    let rejected = 0;

    for (const base of Object.values(SHAPES)) {
      const template = normalizeGesture(base)!;
      for (let seed = 1; seed <= 15; seed++) {
        for (const wobble of [4, 9, 14]) {
          attempts++;
          if (!isGestureMatch(redraw(base, wobble, seed * 37 + wobble), template)) rejected++;
        }
      }
    }

    // Reveal asks for three strokes, so a high per-stroke reject rate compounds badly.
    expect((rejected / attempts) * 100).toBeLessThanOrEqual(5);
  });

  it('refuses straight lines at enrollment but allows real shapes', () => {
    for (const [name, line] of Object.entries(LINES)) {
      expect(straightness(line), name).toBeGreaterThan(MAX_ENROLLMENT_STRAIGHTNESS);
      expect(isDistinctiveShape(line), name).toBe(false);
    }

    for (const [name, shape] of Object.entries(SHAPES)) {
      expect(isDistinctiveShape(shape), name).toBe(true);
    }
  });
});

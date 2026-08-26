import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import './setup';
import { normalizeGesture, type Point } from '../src/utils/gestureNormalize';
import { isGestureMatch } from '../src/utils/gestureRecognizer';
import { saveGestureSequence, getGestureSequence } from '../src/utils/gestureStorage';

// Helper geometric shapes
function createUShape(): Point[] {
  const pts: Point[] = [];
  for (let y = 0; y <= 100; y += 10) pts.push({ x: 0, y });
  for (let x = 10; x <= 100; x += 10) pts.push({ x, y: 100 });
  for (let y = 90; y >= 0; y -= 10) pts.push({ x: 100, y });
  return pts;
}

function createCircle(): Point[] {
  const pts: Point[] = [];
  for (let i = 0; i <= 360; i += 10) {
    const rad = (i * Math.PI) / 180;
    pts.push({ x: 100 + 50 * Math.cos(rad), y: 100 + 50 * Math.sin(rad) });
  }
  return pts;
}

function createTriangle(): Point[] {
  const pts: Point[] = [];
  for (let i = 0; i <= 10; i++) pts.push({ x: 50 + i * 5, y: i * 10 });
  for (let i = 1; i <= 10; i++) pts.push({ x: 100 - i * 10, y: 100 });
  for (let i = 1; i <= 10; i++) pts.push({ x: i * 5, y: 100 - i * 10 });
  return pts;
}

describe('Gesture Sequence Verification & Reveal Logic (Phase 6)', () => {
  const userId = 'sequence-test-user-id';
  let enrolledSteps: Point[][];

  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();

    const step1 = normalizeGesture(createUShape())!;
    const step2 = normalizeGesture(createCircle())!;
    const step3 = normalizeGesture(createTriangle())!;

    enrolledSteps = [step1, step2, step3];
    saveGestureSequence(userId, enrolledSteps);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('validates a correct 3-step gesture sequence in order (U -> Circle -> Triangle)', () => {
    const stored = getGestureSequence(userId)!;
    expect(stored).toBeDefined();

    // Step 1: Draw U
    const draw1 = createUShape();
    expect(isGestureMatch(draw1, stored.sequence[0].points)).toBe(true);

    // Step 2: Draw Circle
    const draw2 = createCircle();
    expect(isGestureMatch(draw2, stored.sequence[1].points)).toBe(true);

    // Step 3: Draw Triangle
    const draw3 = createTriangle();
    expect(isGestureMatch(draw3, stored.sequence[2].points)).toBe(true);
  });

  it('fails if steps are performed in the wrong order (Circle -> U -> Triangle)', () => {
    const stored = getGestureSequence(userId)!;

    // Performing Step 2 at Step 1 position should fail
    const wrongFirstStep = createCircle();
    expect(isGestureMatch(wrongFirstStep, stored.sequence[0].points)).toBe(false);
  });

  it('fails if an incorrect gesture is drawn in the middle of sequence', () => {
    const stored = getGestureSequence(userId)!;

    // Step 1: OK
    expect(isGestureMatch(createUShape(), stored.sequence[0].points)).toBe(true);

    // Step 2: Drew Triangle instead of Circle
    expect(isGestureMatch(createTriangle(), stored.sequence[1].points)).toBe(false);
  });

  it('simulates 5-failure lockout logic correctly', () => {
    let failedAttempts = 0;
    let isLockedOut = false;
    let lockedUntil = 0;

    const recordFailure = () => {
      failedAttempts++;
      if (failedAttempts >= 5) {
        isLockedOut = true;
        lockedUntil = Date.now() + 30000;
      }
    };

    // 4 failed attempts
    for (let i = 0; i < 4; i++) {
      recordFailure();
      expect(isLockedOut).toBe(false);
    }

    // 5th failed attempt triggers lockout
    recordFailure();
    expect(isLockedOut).toBe(true);
    expect(lockedUntil).toBeGreaterThan(Date.now());
  });

  it('simulates message reveal duration and automatic re-protection after 8 seconds', () => {
    let isRevealed = false;
    const durationMs = 8000;

    const revealMessage = () => {
      isRevealed = true;
      setTimeout(() => {
        isRevealed = false;
      }, durationMs);
    };

    revealMessage();
    expect(isRevealed).toBe(true);

    // Advance 4 seconds (still revealed)
    vi.advanceTimersByTime(4000);
    expect(isRevealed).toBe(true);

    // Advance remaining 4 seconds (expires -> re-protected)
    vi.advanceTimersByTime(4001);
    expect(isRevealed).toBe(false);
  });
});

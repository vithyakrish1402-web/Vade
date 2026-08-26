/**
 * Gesture Recognition & Similarity Engine
 *
 * Implements deterministic unistroke geometric similarity comparison.
 * Compares normalized 64-point templates and computes average Euclidean distance.
 */

import {
  distance,
  normalizeGesture,
  type Point,
  NORMALIZED_BOUNDING_SIZE,
} from './gestureNormalize';

// Standard matching thresholds
export const DEFAULT_MATCH_DISTANCE_THRESHOLD = 28.0; // Distance <= 28 counts as a match
export const CONFIRMATION_DISTANCE_THRESHOLD = 30.0; // Slightly more forgiving for confirmation

/**
 * Calculates the average point-to-point Euclidean distance between two normalized templates.
 * Lower distance means higher similarity.
 */
export function calculateGestureDistance(
  templateA: Point[],
  templateB: Point[]
): number {
  if (!templateA || !templateB || templateA.length === 0 || templateB.length === 0) {
    return Infinity;
  }

  const n = Math.min(templateA.length, templateB.length);
  let totalDist = 0;

  for (let i = 0; i < n; i++) {
    totalDist += distance(templateA[i], templateB[i]);
  }

  return totalDist / n;
}

/**
 * Converts average distance to a normalized similarity score between 0.0 (completely dissimilar)
 * and 1.0 (identical).
 */
export function calculateGestureSimilarity(
  templateA: Point[],
  templateB: Point[]
): number {
  const dist = calculateGestureDistance(templateA, templateB);
  if (!Number.isFinite(dist)) return 0;

  // Maximum theoretical diagonal across bounding box (sqrt(100^2 + 100^2) ≈ 141.4)
  const maxPossibleDist = Math.SQRT2 * NORMALIZED_BOUNDING_SIZE;
  const score = 1 - dist / maxPossibleDist;

  return Math.max(0, Math.min(1, score));
}

/**
 * Verifies if newly drawn raw points match an enrolled normalized gesture template.
 *
 * @param drawnRawPoints Raw points from user drawing
 * @param enrolledTemplate Pre-normalized template from storage
 * @param maxDistance Maximum distance threshold for a match
 * @returns boolean indicating match success
 */
export function isGestureMatch(
  drawnRawPoints: Point[],
  enrolledTemplate: Point[],
  maxDistance = DEFAULT_MATCH_DISTANCE_THRESHOLD
): boolean {
  if (!drawnRawPoints || !enrolledTemplate) return false;

  const normalizedDrawn = normalizeGesture(drawnRawPoints);
  if (!normalizedDrawn) return false;

  const dist = calculateGestureDistance(normalizedDrawn, enrolledTemplate);
  return dist <= maxDistance;
}

/**
 * Compares two raw gestures during the enrollment confirmation step.
 * Returns true if the user successfully reproduced their intended gesture.
 */
export function compareEnrolledGestures(
  rawGesture1: Point[],
  rawGesture2: Point[],
  maxDistance = CONFIRMATION_DISTANCE_THRESHOLD
): boolean {
  const norm1 = normalizeGesture(rawGesture1);
  const norm2 = normalizeGesture(rawGesture2);

  if (!norm1 || !norm2) return false;

  const dist = calculateGestureDistance(norm1, norm2);
  return dist <= maxDistance;
}

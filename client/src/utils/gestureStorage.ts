/**
 * Local Gesture Storage Manager
 *
 * Persists normalized gesture sequence templates locally in client storage (localStorage).
 *
 * SECURITY & PRIVACY NOTICE:
 * - Gesture data is strictly LOCAL ONLY.
 * - Gesture templates NEVER leave the client device and are NEVER sent to the backend,
 *   stored in cookies, or transmitted in WebSocket frames.
 */

import type { Point } from './gestureNormalize';

export const CURRENT_GESTURE_VERSION = 1;
const STORAGE_PREFIX = 'enctxt_gesture_';

export interface StoredGestureSequence {
  version: number;
  sequence: Array<{ points: Point[] }>;
  createdAt: string;
  updatedAt: string;
}

/**
 * Derives the unique local storage key for a user.
 */
function getStorageKey(userId: string): string {
  return `${STORAGE_PREFIX}${userId}`;
}

/**
 * Saves a normalized gesture sequence for the given user ID.
 */
export function saveGestureSequence(
  userId: string,
  sequence: Point[][]
): boolean {
  if (!userId || !sequence || sequence.length === 0) {
    return false;
  }

  try {
    const data: StoredGestureSequence = {
      version: CURRENT_GESTURE_VERSION,
      sequence: sequence.map((points) => ({
        points: points.map((p) => ({
          x: Math.round(p.x * 100) / 100, // Compact floating point precision
          y: Math.round(p.y * 100) / 100,
        })),
      })),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    localStorage.setItem(getStorageKey(userId), JSON.stringify(data));
    return true;
  } catch (error) {
    console.error('Failed to save gesture sequence to local storage:', error);
    return false;
  }
}

/**
 * Retrieves the stored gesture sequence for a user ID.
 * Returns null if not configured or if data is malformed / incompatible version.
 */
export function getGestureSequence(
  userId: string
): StoredGestureSequence | null {
  if (!userId) return null;

  try {
    const raw = localStorage.getItem(getStorageKey(userId));
    if (!raw) return null;

    const parsed = JSON.parse(raw) as StoredGestureSequence;

    // Version verification
    if (!parsed || parsed.version !== CURRENT_GESTURE_VERSION) {
      console.warn('Incompatible gesture version detected.');
      return null;
    }

    if (!Array.isArray(parsed.sequence) || parsed.sequence.length === 0) {
      return null;
    }

    // Verify all points exist
    for (const step of parsed.sequence) {
      if (!Array.isArray(step.points) || step.points.length < 10) {
        return null;
      }
    }

    return parsed;
  } catch (error) {
    console.error('Failed to read gesture sequence from local storage:', error);
    return null;
  }
}

/**
 * Checks whether the user has a valid configured gesture sequence.
 */
export function hasGestureSequence(userId: string): boolean {
  return getGestureSequence(userId) !== null;
}

/**
 * Deletes the stored gesture sequence for a user ID.
 */
export function deleteGestureSequence(userId: string): void {
  if (!userId) return;
  try {
    localStorage.removeItem(getStorageKey(userId));
  } catch (error) {
    console.error('Failed to delete gesture sequence from local storage:', error);
  }
}

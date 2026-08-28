import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../auth/AuthContext';
import {
  getGestureSequence,
  saveGestureSequence,
  deleteGestureSequence,
} from '../utils/gestureStorage';
import { isDistinctiveShape, normalizeGesture, type Point } from '../utils/gestureNormalize';
import { isGestureMatch } from '../utils/gestureRecognizer';

export function useGesture() {
  const { user } = useAuth();
  const [isConfigured, setIsConfigured] = useState(false);
  const [sequenceLength, setSequenceLength] = useState(0);

  const refresh = useCallback(() => {
    if (!user) {
      setIsConfigured(false);
      setSequenceLength(0);
      return;
    }

    const stored = getGestureSequence(user.id);
    if (stored && stored.sequence.length > 0) {
      setIsConfigured(true);
      setSequenceLength(stored.sequence.length);
    } else {
      setIsConfigured(false);
      setSequenceLength(0);
    }
  }, [user]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  /**
   * Saves a raw multi-step gesture sequence.
   * Normalizes each step before persisting.
   */
  const saveSequence = useCallback(
    (rawSteps: Point[][]): boolean => {
      if (!user) return false;

      const normalizedSteps: Point[][] = [];
      for (const raw of rawSteps) {
        // A straight swipe normalizes to the same template as any other straight swipe, so it
        // would unlock against unrelated gestures. Refused here as well as in the UI, so no
        // caller can enroll one by taking a different route in.
        if (!isDistinctiveShape(raw)) return false;
        const norm = normalizeGesture(raw);
        if (!norm) return false;
        normalizedSteps.push(norm);
      }

      const success = saveGestureSequence(user.id, normalizedSteps);
      if (success) {
        refresh();
      }
      return success;
    },
    [user, refresh]
  );

  /**
   * Verifies if a drawn stroke matches the enrolled step at `stepIndex`.
   */
  const verifyStep = useCallback(
    (stepIndex: number, rawPoints: Point[]): boolean => {
      if (!user) return false;
      const stored = getGestureSequence(user.id);
      if (!stored || !stored.sequence[stepIndex]) return false;

      const enrolledTemplate = stored.sequence[stepIndex].points;
      return isGestureMatch(rawPoints, enrolledTemplate);
    },
    [user]
  );

  /**
   * Deletes the user's gesture sequence.
   */
  const removeSequence = useCallback(() => {
    if (!user) return;
    deleteGestureSequence(user.id);
    refresh();
  }, [user, refresh]);

  return {
    isConfigured,
    sequenceLength,
    saveSequence,
    verifyStep,
    deleteSequence: removeSequence,
    refresh,
  };
}

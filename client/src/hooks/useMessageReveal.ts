import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../auth/AuthContext';

export const DEFAULT_REVEAL_DURATION_MS = 8000; // 8 seconds
export const MAX_FAILED_ATTEMPTS = 5;
export const LOCKOUT_DURATION_MS = 30000; // 30 seconds

export function useMessageReveal() {
  const { user } = useAuth();
  const [revealedMap, setRevealedMap] = useState<Map<string, number>>(new Map());
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  const [lockoutRemainingSeconds, setLockoutRemainingSeconds] = useState(0);
  const [, setTick] = useState(0);

  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // Hide all revealed messages immediately
  const hideAllMessages = useCallback(() => {
    timersRef.current.forEach((timer) => clearTimeout(timer));
    timersRef.current.clear();
    setRevealedMap(new Map());
  }, []);

  // Hide specific message
  const hideMessage = useCallback((messageId: string) => {
    const timer = timersRef.current.get(messageId);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(messageId);
    }
    setRevealedMap((prev) => {
      if (!prev.has(messageId)) return prev;
      const next = new Map(prev);
      next.delete(messageId);
      return next;
    });
  }, []);

  // Reveal specific message for a duration
  const revealMessage = useCallback(
    (messageId: string, durationMs = DEFAULT_REVEAL_DURATION_MS) => {
      // Clear existing timer if any
      const existingTimer = timersRef.current.get(messageId);
      if (existingTimer) {
        clearTimeout(existingTimer);
      }

      const expiresAt = Date.now() + durationMs;
      setRevealedMap((prev) => {
        const next = new Map(prev);
        next.set(messageId, expiresAt);
        return next;
      });

      // Reset failed attempts upon successful reveal
      setFailedAttempts(0);

      // Schedule auto re-protection timer
      const timer = setTimeout(() => {
        hideMessage(messageId);
      }, durationMs);

      timersRef.current.set(messageId, timer);
    },
    [hideMessage]
  );

  // Check if a specific message is currently revealed
  const isRevealed = useCallback(
    (messageId: string): boolean => {
      const expiresAt = revealedMap.get(messageId);
      if (!expiresAt) return false;
      return Date.now() < expiresAt;
    },
    [revealedMap]
  );

  // Get remaining reveal seconds for a message
  const getRemainingRevealSeconds = useCallback(
    (messageId: string): number => {
      const expiresAt = revealedMap.get(messageId);
      if (!expiresAt) return 0;
      const remainingMs = expiresAt - Date.now();
      return Math.max(0, Math.ceil(remainingMs / 1000));
    },
    [revealedMap]
  );

  // Periodic tick while messages are revealed to update countdown badges
  useEffect(() => {
    if (revealedMap.size === 0) return;

    const interval = setInterval(() => {
      setTick((t) => t + 1);
    }, 1000);

    return () => clearInterval(interval);
  }, [revealedMap.size]);

  // Record a failed gesture attempt (triggers lockout at 5 failures)
  const recordFailedAttempt = useCallback(() => {
    setFailedAttempts((prev) => {
      const next = prev + 1;
      if (next >= MAX_FAILED_ATTEMPTS) {
        const lockoutTime = Date.now() + LOCKOUT_DURATION_MS;
        setLockedUntil(lockoutTime);
      }
      return next;
    });
  }, []);

  // Lockout countdown timer
  useEffect(() => {
    if (!lockedUntil) {
      setLockoutRemainingSeconds(0);
      return;
    }

    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((lockedUntil - Date.now()) / 1000));
      setLockoutRemainingSeconds(remaining);

      if (remaining <= 0) {
        setLockedUntil(null);
        setFailedAttempts(0);
        clearInterval(interval);
      }
    }, 500);

    return () => clearInterval(interval);
  }, [lockedUntil]);

  // Auto Re-Protection Listeners: Visibility Change & Window Blur
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        hideAllMessages();
      }
    };

    const handleWindowBlur = () => {
      hideAllMessages();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleWindowBlur);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleWindowBlur);
      hideAllMessages();
    };
  }, [hideAllMessages]);

  // Clean up on user logout / auth change
  useEffect(() => {
    if (!user) {
      hideAllMessages();
      setFailedAttempts(0);
      setLockedUntil(null);
    }
  }, [user, hideAllMessages]);

  return {
    isRevealed,
    getRemainingRevealSeconds,
    revealMessage,
    hideMessage,
    hideAllMessages,
    failedAttempts,
    recordFailedAttempt,
    isLockedOut: Boolean(lockedUntil && lockoutRemainingSeconds > 0),
    lockoutRemainingSeconds,
  };
}

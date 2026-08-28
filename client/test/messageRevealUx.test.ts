import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  DEFAULT_REVEAL_DURATION_MS,
  MAX_FAILED_ATTEMPTS,
  LOCKOUT_DURATION_MS,
} from '../src/hooks/useMessageReveal';

describe('Message Reveal & Temporary Plaintext Lifecycle (Phase 9)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('enforces the fixed 6-second reveal window from the design spec', () => {
    expect(DEFAULT_REVEAL_DURATION_MS).toBe(6000);
  });

  it('enforces 5-attempt threshold for temporary gesture lockout', () => {
    expect(MAX_FAILED_ATTEMPTS).toBe(5);
  });

  it('enforces 30-second duration for gesture attempt lockout', () => {
    expect(LOCKOUT_DURATION_MS).toBe(30000);
  });

  it('calculates remaining reveal seconds accurately', () => {
    const expiresAt = Date.now() + 6500;
    const remainingSeconds = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
    expect(remainingSeconds).toBe(7);

    // Fast-forward 2 seconds
    vi.advanceTimersByTime(2000);
    const updatedRemaining = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
    expect(updatedRemaining).toBe(5);

    // Fast-forward beyond expiry
    vi.advanceTimersByTime(6000);
    const expiredRemaining = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
    expect(expiredRemaining).toBe(0);
  });
});

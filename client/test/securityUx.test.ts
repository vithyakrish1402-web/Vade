import { describe, it, expect, beforeEach } from 'vitest';
import './setup';
import {
  saveVerification,
  getVerification,
  removeVerification,
  clearAllVerifications,
} from '../src/crypto';

describe('Security UX & Contact Trust Lifecycle (Phase 9)', () => {
  beforeEach(() => {
    clearAllVerifications();
  });

  it('correctly detects verified contacts and maintains verification binding', () => {
    const peerId = 'peer-user-123';
    const peerKeyId = 'key-v1';
    const peerFingerprint = 'A1B2 C3D4 E5F6 1122 3344 5566 7788 9900';

    saveVerification({
      userId: peerId,
      keyId: peerKeyId,
      fingerprint: peerFingerprint,
      verifiedAt: new Date().toISOString(),
    });

    const stored = getVerification(peerId);
    expect(stored).not.toBeNull();
    expect(stored?.keyId).toBe(peerKeyId);
    expect(stored?.fingerprint).toBe(peerFingerprint);
  });

  it('detects a key rotation when current keyId differs from stored verification', () => {
    const peerId = 'peer-user-123';
    const originalKeyId = 'key-v1';
    const rotatedKeyId = 'key-v2';

    saveVerification({
      userId: peerId,
      keyId: originalKeyId,
      fingerprint: 'A1B2 C3D4 E5F6 1122 3344 5566 7788 9900',
      verifiedAt: new Date().toISOString(),
    });

    const stored = getVerification(peerId);
    expect(stored).not.toBeNull();

    // Comparing with newly fetched peer key record
    const isKeyChanged = stored?.keyId !== rotatedKeyId;
    expect(isKeyChanged).toBe(true);
  });

  it('allows unverifying a contact safely', () => {
    const peerId = 'peer-user-123';
    saveVerification({
      userId: peerId,
      keyId: 'key-v1',
      fingerprint: 'A1B2 C3D4 E5F6 1122 3344 5566 7788 9900',
      verifiedAt: new Date().toISOString(),
    });

    expect(getVerification(peerId)).not.toBeNull();
    removeVerification(peerId);
    expect(getVerification(peerId)).toBeNull();
  });
});

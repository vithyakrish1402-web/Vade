import { describe, it, expect, beforeEach } from 'vitest';
import './setup';
import {
  generateIdentityKeyPair,
  calculateKeyFingerprint,
  calculateSafetyNumber,
  saveVerification,
  getVerification,
  removeVerification,
  clearAllVerifications,
  decryptMessage,
  deriveConversationKey,
  encryptMessage,
  DecryptionError,
} from '../src/crypto';

describe('Identity Verification, Fingerprints & Safety Numbers (Phase 8)', () => {
  beforeEach(() => {
    clearAllVerifications();
  });

  describe('Cryptographic Key Fingerprint', () => {
    it('produces deterministic, formatted SHA-256 fingerprints', async () => {
      const alice = await generateIdentityKeyPair();
      const fp1 = await calculateKeyFingerprint(alice.publicKeyBase64);
      const fp2 = await calculateKeyFingerprint(alice.publicKeyBase64);

      expect(fp1).toBe(fp2);
      // Format: 8 groups of 4 hex characters separated by spaces
      expect(fp1).toMatch(/^[0-9A-F]{4}( [0-9A-F]{4}){7}$/);
    });

    it('generates distinct fingerprints for distinct identity keys', async () => {
      const alice = await generateIdentityKeyPair();
      const bob = await generateIdentityKeyPair();

      const aliceFp = await calculateKeyFingerprint(alice.publicKeyBase64);
      const bobFp = await calculateKeyFingerprint(bob.publicKeyBase64);

      expect(aliceFp).not.toBe(bobFp);
    });
  });

  describe('Symmetric Safety Numbers', () => {
    it('derives identical safety numbers regardless of participant order (Symmetry)', async () => {
      const alice = await generateIdentityKeyPair();
      const bob = await generateIdentityKeyPair();

      // Alice computes safety number with Bob
      const snFromAlice = await calculateSafetyNumber(alice.publicKeyBase64, bob.publicKeyBase64);
      // Bob computes safety number with Alice
      const snFromBob = await calculateSafetyNumber(bob.publicKeyBase64, alice.publicKeyBase64);

      expect(snFromAlice).toBe(snFromBob);
      // Format: four 5-digit blocks separated by spaces
      expect(snFromAlice).toMatch(/^\d{5} \d{5} \d{5} \d{5}$/);
    });

    it('produces different safety numbers when communicating with different peers', async () => {
      const alice = await generateIdentityKeyPair();
      const bob = await generateIdentityKeyPair();
      const charlie = await generateIdentityKeyPair();

      const aliceBobSN = await calculateSafetyNumber(alice.publicKeyBase64, bob.publicKeyBase64);
      const aliceCharlieSN = await calculateSafetyNumber(alice.publicKeyBase64, charlie.publicKeyBase64);

      expect(aliceBobSN).not.toBe(aliceCharlieSN);
    });
  });

  describe('Local Verification Storage & Key Change Lifecycle', () => {
    it('stores, retrieves, and removes verified contact identities locally', () => {
      const bobUserId = 'bob-user-uuid-1';
      const bobKeyId = 'k_bob_v1';
      const bobFingerprint = 'A1B2 C3D4 E5F6 1234 5678 9ABC DEF0 1122';

      expect(getVerification(bobUserId)).toBeNull();

      saveVerification({
        userId: bobUserId,
        keyId: bobKeyId,
        fingerprint: bobFingerprint,
        verifiedAt: new Date().toISOString(),
      });

      const retrieved = getVerification(bobUserId);
      expect(retrieved).not.toBeNull();
      expect(retrieved?.userId).toBe(bobUserId);
      expect(retrieved?.keyId).toBe(bobKeyId);
      expect(retrieved?.fingerprint).toBe(bobFingerprint);

      removeVerification(bobUserId);
      expect(getVerification(bobUserId)).toBeNull();
    });

    it('fails closed when local verification storage contains corrupted JSON', () => {
      localStorage.setItem('enctxt_verified_contacts_v1', '{ invalid json garbage');
      expect(getVerification('any-user')).toBeNull();
    });
  });

  describe('Algorithm Downgrade & Protocol Hardening Defenses', () => {
    const conversationId = 'conv-test-downgrade';
    const aliceId = 'alice-uuid';
    const bobId = 'bob-uuid';

    it('strictly rejects ciphertexts with unsupported or downgraded encryption algorithms', async () => {
      const alice = await generateIdentityKeyPair();
      const bob = await generateIdentityKeyPair();
      const key = await deriveConversationKey(alice.keyPair.privateKey, bob.keyPair.publicKey, conversationId);

      const envelope = await encryptMessage('Secret payload', key, {
        conversationId,
        senderId: aliceId,
        senderKeyId: alice.keyId,
        recipientKeyId: bob.keyId,
      });

      // Attacker or server attempts to downgrade algorithm header to AES-128-CBC or PLAINTEXT
      await expect(
        decryptMessage({ ...envelope, algorithm: 'AES-128-CBC' as any }, key, {
          conversationId,
          senderId: aliceId,
        })
      ).rejects.toThrow(DecryptionError);

      await expect(
        decryptMessage({ ...envelope, algorithm: 'PLAINTEXT' as any }, key, {
          conversationId,
          senderId: aliceId,
        })
      ).rejects.toThrow(DecryptionError);
    });

    it('strictly rejects ciphertexts with invalid key agreement algorithm', async () => {
      const alice = await generateIdentityKeyPair();
      const bob = await generateIdentityKeyPair();
      const key = await deriveConversationKey(alice.keyPair.privateKey, bob.keyPair.publicKey, conversationId);

      const envelope = await encryptMessage('Secret payload', key, {
        conversationId,
        senderId: aliceId,
        senderKeyId: alice.keyId,
        recipientKeyId: bob.keyId,
      });

      await expect(
        decryptMessage({ ...envelope, keyAgreement: 'RSA-1024' as any }, key, {
          conversationId,
          senderId: aliceId,
        })
      ).rejects.toThrow(DecryptionError);
    });
  });
});

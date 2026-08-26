import { describe, it, expect } from 'vitest';
import './setup';
import {
  generateIdentityKeyPair,
  exportPublicKey,
  importPublicKey,
  deriveConversationKey,
  encryptMessage,
  decryptMessage,
  DecryptionError,
  CURRENT_PROTOCOL_VERSION,
  ENCRYPTION_ALGORITHM,
  KEY_AGREEMENT_ALGORITHM,
} from '../src/crypto';

describe('Cryptographic Engine & E2EE Primitives (Phase 7)', () => {
  const conversationId = 'conv-uuid-12345';
  const aliceId = 'alice-uuid-11111';
  const bobId = 'bob-uuid-22222';
  const charlieId = 'charlie-uuid-33333';

  it('generates a valid ECDH P-256 identity key pair with unique keyId and SPKI public key', async () => {
    const identity = await generateIdentityKeyPair();

    expect(identity.keyId).toMatch(/^k_[a-f0-9]{32}$/);
    expect(identity.publicKeyBase64).toBeDefined();
    expect(identity.keyPair.privateKey.type).toBe('private');
    expect(identity.keyPair.publicKey.type).toBe('public');
    expect(identity.keyPair.privateKey.algorithm.name).toBe('ECDH');
  });

  it('exports and imports public keys losslessly as Base64 SPKI', async () => {
    const identity = await generateIdentityKeyPair();
    const exported = await exportPublicKey(identity.keyPair.publicKey);
    expect(typeof exported).toBe('string');
    expect(exported.length).toBeGreaterThan(50);

    const imported = await importPublicKey(exported);
    expect(imported.type).toBe('public');
    expect(imported.algorithm.name).toBe('ECDH');
  });

  it('derives identical symmetric AES-256-GCM conversation keys for Alice and Bob (ECDH Symmetry)', async () => {
    const alice = await generateIdentityKeyPair();
    const bob = await generateIdentityKeyPair();

    // Alice derives key using her private key + Bob's public key
    const aliceConvKey = await deriveConversationKey(
      alice.keyPair.privateKey,
      bob.keyPair.publicKey,
      conversationId
    );

    // Bob derives key using his private key + Alice's public key
    const bobConvKey = await deriveConversationKey(
      bob.keyPair.privateKey,
      alice.keyPair.publicKey,
      conversationId
    );

    expect(aliceConvKey).toBeDefined();
    expect(bobConvKey).toBeDefined();

    // Encrypt with Alice's derived key and decrypt with Bob's derived key
    const envelope = await encryptMessage('Symmetric ECDH handshake test', aliceConvKey, {
      conversationId,
      senderId: aliceId,
      senderKeyId: alice.keyId,
      recipientKeyId: bob.keyId,
    });

    const decrypted = await decryptMessage(envelope, bobConvKey, {
      conversationId,
      senderId: aliceId,
    });

    expect(decrypted).toBe('Symmetric ECDH handshake test');
  });

  describe('Encryption & Decryption Roundtrips', () => {
    it('encrypts and decrypts standard ASCII text with numbers and symbols', async () => {
      const alice = await generateIdentityKeyPair();
      const bob = await generateIdentityKeyPair();
      const key = await deriveConversationKey(alice.keyPair.privateKey, bob.keyPair.publicKey, conversationId);

      const plaintext = 'Meeting at 18:30 in Room #4B! Budget: $1,250.00 & Q&A ready?';
      const envelope = await encryptMessage(plaintext, key, {
        conversationId,
        senderId: aliceId,
        senderKeyId: alice.keyId,
        recipientKeyId: bob.keyId,
      });

      expect(envelope.version).toBe(CURRENT_PROTOCOL_VERSION);
      expect(envelope.algorithm).toBe(ENCRYPTION_ALGORITHM);
      expect(envelope.keyAgreement).toBe(KEY_AGREEMENT_ALGORITHM);
      expect(envelope.senderKeyId).toBe(alice.keyId);
      expect(envelope.recipientKeyId).toBe(bob.keyId);
      expect(envelope.ciphertext).not.toContain('Meeting');

      const decrypted = await decryptMessage(envelope, key, {
        conversationId,
        senderId: aliceId,
      });

      expect(decrypted).toBe(plaintext);
    });

    it('encrypts and decrypts multi-byte emojis safely without surrogate pair splitting', async () => {
      const alice = await generateIdentityKeyPair();
      const bob = await generateIdentityKeyPair();
      const key = await deriveConversationKey(alice.keyPair.privateKey, bob.keyPair.publicKey, conversationId);

      const emojiText = 'Secret keys ready 🚀✨🔥 Shield: 🛡️ Top secret: 🤫👋';
      const envelope = await encryptMessage(emojiText, key, {
        conversationId,
        senderId: aliceId,
        senderKeyId: alice.keyId,
        recipientKeyId: bob.keyId,
      });

      const decrypted = await decryptMessage(envelope, key, {
        conversationId,
        senderId: aliceId,
      });

      expect(decrypted).toBe(emojiText);
    });

    it('encrypts and decrypts international Unicode scripts', async () => {
      const alice = await generateIdentityKeyPair();
      const bob = await generateIdentityKeyPair();
      const key = await deriveConversationKey(alice.keyPair.privateKey, bob.keyPair.publicKey, conversationId);

      const unicodeText = 'Hindi: नमस्ते, Chinese: 你好, Japanese: こんにちは, Arabic: مرحبا, Russian: Привет';
      const envelope = await encryptMessage(unicodeText, key, {
        conversationId,
        senderId: aliceId,
        senderKeyId: alice.keyId,
        recipientKeyId: bob.keyId,
      });

      const decrypted = await decryptMessage(envelope, key, {
        conversationId,
        senderId: aliceId,
      });

      expect(decrypted).toBe(unicodeText);
    });

    it('encrypts and decrypts multiline formatted text with tabs and newlines', async () => {
      const alice = await generateIdentityKeyPair();
      const bob = await generateIdentityKeyPair();
      const key = await deriveConversationKey(alice.keyPair.privateKey, bob.keyPair.publicKey, conversationId);

      const multiline = 'Paragraph 1.\n\nParagraph 2 with\tindented text.\n\nParagraph 3.';
      const envelope = await encryptMessage(multiline, key, {
        conversationId,
        senderId: aliceId,
        senderKeyId: alice.keyId,
        recipientKeyId: bob.keyId,
      });

      const decrypted = await decryptMessage(envelope, key, {
        conversationId,
        senderId: aliceId,
      });

      expect(decrypted).toBe(multiline);
    });

    it('encrypts and decrypts long 5000-character messages', async () => {
      const alice = await generateIdentityKeyPair();
      const bob = await generateIdentityKeyPair();
      const key = await deriveConversationKey(alice.keyPair.privateKey, bob.keyPair.publicKey, conversationId);

      const longMessage = 'A'.repeat(5000);
      const envelope = await encryptMessage(longMessage, key, {
        conversationId,
        senderId: aliceId,
        senderKeyId: alice.keyId,
        recipientKeyId: bob.keyId,
      });

      const decrypted = await decryptMessage(envelope, key, {
        conversationId,
        senderId: aliceId,
      });

      expect(decrypted).toBe(longMessage);
    });
  });

  describe('Non-Determinism & Random Nonces', () => {
    it('produces distinct nonces and distinct ciphertexts when encrypting identical plaintext twice', async () => {
      const alice = await generateIdentityKeyPair();
      const bob = await generateIdentityKeyPair();
      const key = await deriveConversationKey(alice.keyPair.privateKey, bob.keyPair.publicKey, conversationId);

      const plaintext = 'Identical message text';
      const envelope1 = await encryptMessage(plaintext, key, {
        conversationId,
        senderId: aliceId,
        senderKeyId: alice.keyId,
        recipientKeyId: bob.keyId,
      });

      const envelope2 = await encryptMessage(plaintext, key, {
        conversationId,
        senderId: aliceId,
        senderKeyId: alice.keyId,
        recipientKeyId: bob.keyId,
      });

      expect(envelope1.nonce).not.toBe(envelope2.nonce);
      expect(envelope1.ciphertext).not.toBe(envelope2.ciphertext);

      // Both decrypt to the same plaintext
      expect(await decryptMessage(envelope1, key, { conversationId, senderId: aliceId })).toBe(plaintext);
      expect(await decryptMessage(envelope2, key, { conversationId, senderId: aliceId })).toBe(plaintext);
    });
  });

  describe('Tamper Detection & Integrity Verification', () => {
    it('fails closed when ciphertext bits are modified (GCM Auth Tag Failure)', async () => {
      const alice = await generateIdentityKeyPair();
      const bob = await generateIdentityKeyPair();
      const key = await deriveConversationKey(alice.keyPair.privateKey, bob.keyPair.publicKey, conversationId);

      const envelope = await encryptMessage('Secret transaction', key, {
        conversationId,
        senderId: aliceId,
        senderKeyId: alice.keyId,
        recipientKeyId: bob.keyId,
      });

      // Tamper with ciphertext
      const tamperedCiphertext =
        envelope.ciphertext.substring(0, 10) + 'X' + envelope.ciphertext.substring(11);

      await expect(
        decryptMessage({ ...envelope, ciphertext: tamperedCiphertext }, key, {
          conversationId,
          senderId: aliceId,
        })
      ).rejects.toThrow(DecryptionError);
    });

    it('fails closed when IV/nonce is tampered with', async () => {
      const alice = await generateIdentityKeyPair();
      const bob = await generateIdentityKeyPair();
      const key = await deriveConversationKey(alice.keyPair.privateKey, bob.keyPair.publicKey, conversationId);

      const envelope = await encryptMessage('Secret transaction', key, {
        conversationId,
        senderId: aliceId,
        senderKeyId: alice.keyId,
        recipientKeyId: bob.keyId,
      });

      // Tamper with nonce
      const tamperedNonce =
        envelope.nonce.substring(0, 4) + 'Z' + envelope.nonce.substring(5);

      await expect(
        decryptMessage({ ...envelope, nonce: tamperedNonce }, key, {
          conversationId,
          senderId: aliceId,
        })
      ).rejects.toThrow(DecryptionError);
    });

    it('fails closed when AAD context is spliced into a different conversation or sender', async () => {
      const alice = await generateIdentityKeyPair();
      const bob = await generateIdentityKeyPair();
      const key = await deriveConversationKey(alice.keyPair.privateKey, bob.keyPair.publicKey, conversationId);

      const envelope = await encryptMessage('Context bound message', key, {
        conversationId,
        senderId: aliceId,
        senderKeyId: alice.keyId,
        recipientKeyId: bob.keyId,
      });

      // Attempt to decrypt under a different conversation ID
      await expect(
        decryptMessage(envelope, key, {
          conversationId: 'different-conversation-id',
          senderId: aliceId,
        })
      ).rejects.toThrow(DecryptionError);
    });

    it('fails closed when an attacker attempts to decrypt with the wrong key (Charlie)', async () => {
      const alice = await generateIdentityKeyPair();
      const bob = await generateIdentityKeyPair();
      const charlie = await generateIdentityKeyPair();

      const aliceBobKey = await deriveConversationKey(
        alice.keyPair.privateKey,
        bob.keyPair.publicKey,
        conversationId
      );

      const charlieKey = await deriveConversationKey(
        charlie.keyPair.privateKey,
        bob.keyPair.publicKey,
        conversationId
      );

      const envelope = await encryptMessage('Confidential Alice to Bob', aliceBobKey, {
        conversationId,
        senderId: aliceId,
        senderKeyId: alice.keyId,
        recipientKeyId: bob.keyId,
      });

      // Charlie attempts to decrypt Alice's message using his own key
      await expect(
        decryptMessage(envelope, charlieKey, {
          conversationId,
          senderId: aliceId,
        })
      ).rejects.toThrow(DecryptionError);
    });

    it('rejects unsupported protocol versions', async () => {
      const alice = await generateIdentityKeyPair();
      const bob = await generateIdentityKeyPair();
      const key = await deriveConversationKey(alice.keyPair.privateKey, bob.keyPair.publicKey, conversationId);

      const envelope = await encryptMessage('Version check', key, {
        conversationId,
        senderId: aliceId,
        senderKeyId: alice.keyId,
        recipientKeyId: bob.keyId,
      });

      await expect(
        decryptMessage({ ...envelope, version: 999 }, key, {
          conversationId,
          senderId: aliceId,
        })
      ).rejects.toThrow(DecryptionError);
    });
  });
});

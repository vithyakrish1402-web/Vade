import { describe, it, expect } from 'vitest';
import vector from '../../docs/test-vectors/crypto-test-vectors.json';
import { encryptedEnvelopeSchema } from '../src/utils/validation.js';

describe('Cross-Platform E2EE Envelope & Contract Validation (Phase 11)', () => {
  it('validates test vector envelope structure against shared message envelope schema', () => {
    const envelope = {
      version: vector.metadata.protocolVersion,
      algorithm: vector.metadata.cipher,
      keyAgreement: vector.metadata.keyAgreement,
      senderKeyId: vector.conversation.senderKeyId,
      recipientKeyId: vector.conversation.recipientKeyId,
      nonce: vector.encryption.nonceBase64,
      ciphertext: vector.encryption.ciphertextBase64,
      aad: vector.encryption.aadUtf8,
    };

    const parseResult = encryptedEnvelopeSchema.safeParse(envelope);
    expect(parseResult.success).toBe(true);
  });

  it('rejects tampered or unsupported envelope versions', () => {
    const invalidVersionEnvelope = {
      version: 0, // Unsupported version (min 1)
      algorithm: vector.metadata.cipher,
      keyAgreement: vector.metadata.keyAgreement,
      senderKeyId: vector.conversation.senderKeyId,
      recipientKeyId: vector.conversation.recipientKeyId,
      nonce: vector.encryption.nonceBase64,
      ciphertext: vector.encryption.ciphertextBase64,
      aad: vector.encryption.aadUtf8,
    };

    const parseResult = encryptedEnvelopeSchema.safeParse(invalidVersionEnvelope);
    expect(parseResult.success).toBe(false);
  });
});

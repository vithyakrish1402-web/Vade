import {
  CURRENT_PROTOCOL_VERSION,
  ENCRYPTION_ALGORITHM,
  KEY_AGREEMENT_ALGORITHM,
  IV_LENGTH_BYTES,
  AUTH_TAG_LENGTH_BITS,
} from './cryptoConfig';
import { arrayBufferToBase64 } from './keyManager';
import type { EncryptedMessageEnvelope } from '@enctxt/shared';

export interface EncryptionOptions {
  conversationId: string;
  senderId: string;
  senderKeyId: string;
  recipientKeyId: string;
}

/**
 * Encrypts a plaintext message using AES-256-GCM with a fresh 12-byte random IV
 * and context-bound Authenticated Associated Data (AAD).
 */
export async function encryptMessage(
  plaintext: string,
  conversationKey: CryptoKey,
  options: EncryptionOptions
): Promise<EncryptedMessageEnvelope> {
  const enc = new TextEncoder();

  // 1. Generate fresh 96-bit (12-byte) cryptographically secure random IV
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH_BYTES));

  // 2. Build Authenticated Associated Data (AAD) context binding string
  const aadString = `${options.conversationId}:${options.senderId}:v${CURRENT_PROTOCOL_VERSION}`;
  const aadBuffer = enc.encode(aadString);

  // 3. Encrypt plaintext with AES-256-GCM
  const plaintextBuffer = enc.encode(plaintext);
  const ciphertextBuffer = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv,
      additionalData: aadBuffer,
      tagLength: AUTH_TAG_LENGTH_BITS,
    },
    conversationKey,
    plaintextBuffer
  );

  return {
    version: CURRENT_PROTOCOL_VERSION,
    algorithm: ENCRYPTION_ALGORITHM,
    keyAgreement: KEY_AGREEMENT_ALGORITHM,
    senderKeyId: options.senderKeyId,
    recipientKeyId: options.recipientKeyId,
    nonce: arrayBufferToBase64(iv.buffer),
    ciphertext: arrayBufferToBase64(ciphertextBuffer),
    aad: arrayBufferToBase64(aadBuffer.buffer),
  };
}

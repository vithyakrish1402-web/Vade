import {
  AUTH_TAG_LENGTH_BITS,
  CURRENT_PROTOCOL_VERSION,
  ENCRYPTION_ALGORITHM,
  KEY_AGREEMENT_ALGORITHM,
} from './cryptoConfig';
import { base64ToArrayBuffer } from './keyManager';
import type { EncryptedMessageEnvelope } from '@enctxt/shared';

export interface DecryptionOptions {
  conversationId: string;
  senderId: string;
}

export class DecryptionError extends Error {
  constructor(message = 'Unable to decrypt this message.') {
    super(message);
    this.name = 'DecryptionError';
  }
}

/**
 * Decrypts an EncryptedMessageEnvelope using AES-256-GCM and verifies the authentication tag & AAD.
 * Strictly enforces protocol versions and cryptographic algorithm allowlists (downgrade defense).
 * Throws DecryptionError upon any tampering or invalid keys.
 */
export async function decryptMessage(
  envelope: EncryptedMessageEnvelope,
  conversationKey: CryptoKey,
  options: DecryptionOptions
): Promise<string> {
  // Protocol Version Enforcement
  if (envelope.version !== CURRENT_PROTOCOL_VERSION) {
    throw new DecryptionError(`Unsupported protocol version: ${envelope.version}`);
  }

  // Algorithm Downgrade & Substitution Defense
  if (envelope.algorithm !== ENCRYPTION_ALGORITHM) {
    throw new DecryptionError(`Unsupported encryption algorithm: ${envelope.algorithm}`);
  }

  if (envelope.keyAgreement && envelope.keyAgreement !== KEY_AGREEMENT_ALGORITHM) {
    throw new DecryptionError(`Unsupported key agreement: ${envelope.keyAgreement}`);
  }

  try {
    const iv = new Uint8Array(base64ToArrayBuffer(envelope.nonce));
    const ciphertextBuffer = base64ToArrayBuffer(envelope.ciphertext);

    // Reconstruct expected AAD from current context to verify context binding
    const expectedAadString = `${options.conversationId}:${options.senderId}:v${envelope.version}`;
    const aadBuffer = new TextEncoder().encode(expectedAadString);

    const decryptedBuffer = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv,
        additionalData: aadBuffer,
        tagLength: AUTH_TAG_LENGTH_BITS,
      },
      conversationKey,
      ciphertextBuffer
    );

    return new TextDecoder().decode(decryptedBuffer);
  } catch (err) {
    // Fail closed with a safe generic error
    throw new DecryptionError('Unable to decrypt this message.');
  }
}

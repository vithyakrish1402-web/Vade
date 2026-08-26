import { describe, it, expect } from 'vitest';
import vector from '../../docs/test-vectors/crypto-test-vectors.json';

function base64ToUint8Array(base64: string): Uint8Array {
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(base64, 'base64'));
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function arrayBufferToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

describe('Cross-Platform Cryptographic Test Vectors (Phase 11 — Android Readiness)', () => {
  const subtle = globalThis.crypto.subtle;

  it('validates test vector metadata and protocol parameters', () => {
    expect(vector.metadata.protocolVersion).toBe(1);
    expect(vector.metadata.keyAgreement).toBe('ECDH-P256');
    expect(vector.metadata.kdf).toBe('HKDF-SHA-256');
    expect(vector.metadata.cipher).toBe('AES-256-GCM');
    expect(vector.metadata.tagLengthBits).toBe(128);
  });

  it('correctly computes ECDH + HKDF derived key matching test vector fixture', async () => {
    // 1. Import Alice Private Key (PKCS8)
    const alicePrivBytes = base64ToUint8Array(vector.keys.alice.privateKeyPkcs8Base64);
    const alicePrivKey = await subtle.importKey(
      'pkcs8',
      alicePrivBytes,
      { name: 'ECDH', namedCurve: 'P-256' },
      false,
      ['deriveBits']
    );

    // 2. Import Bob Public Key (SPKI)
    const bobPubBytes = base64ToUint8Array(vector.keys.bob.publicKeySpkiBase64);
    const bobPubKey = await subtle.importKey(
      'spki',
      bobPubBytes,
      { name: 'ECDH', namedCurve: 'P-256' },
      false,
      []
    );

    // 3. Compute ECDH shared secret bits
    const sharedBits = await subtle.deriveBits(
      { name: 'ECDH', public: bobPubKey },
      alicePrivKey,
      256
    );

    // 4. HKDF-SHA-256 Key Derivation
    const hkdfKey = await subtle.importKey('raw', sharedBits, 'HKDF', false, ['deriveKey']);
    const derivedAesKey = await subtle.deriveKey(
      {
        name: 'HKDF',
        hash: 'SHA-256',
        salt: new TextEncoder().encode(vector.kdf.saltUtf8),
        info: new TextEncoder().encode(vector.kdf.infoUtf8),
      },
      hkdfKey,
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt']
    );

    const exportedRawKey = await subtle.exportKey('raw', derivedAesKey);
    const derivedKeyHex = arrayBufferToHex(exportedRawKey);

    expect(derivedKeyHex).toBe(vector.kdf.derivedKeyHex);
  });

  it('correctly decrypts test vector ciphertext envelope to expected plaintext', async () => {
    // 1. Import Bob Private Key
    const bobPrivBytes = base64ToUint8Array(vector.keys.bob.privateKeyPkcs8Base64);
    const bobPrivKey = await subtle.importKey(
      'pkcs8',
      bobPrivBytes,
      { name: 'ECDH', namedCurve: 'P-256' },
      false,
      ['deriveBits']
    );

    // 2. Import Alice Public Key
    const alicePubBytes = base64ToUint8Array(vector.keys.alice.publicKeySpkiBase64);
    const alicePubKey = await subtle.importKey(
      'spki',
      alicePubBytes,
      { name: 'ECDH', namedCurve: 'P-256' },
      false,
      []
    );

    // 3. Derive Bob Symmetric Key
    const sharedBits = await subtle.deriveBits(
      { name: 'ECDH', public: alicePubKey },
      bobPrivKey,
      256
    );

    const hkdfKey = await subtle.importKey('raw', sharedBits, 'HKDF', false, ['deriveKey']);
    const bobAesKey = await subtle.deriveKey(
      {
        name: 'HKDF',
        hash: 'SHA-256',
        salt: new TextEncoder().encode(vector.kdf.saltUtf8),
        info: new TextEncoder().encode(vector.kdf.infoUtf8),
      },
      hkdfKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['decrypt']
    );

    // 4. Decrypt AES-256-GCM Ciphertext with AAD
    const nonceBytes = base64ToUint8Array(vector.encryption.nonceBase64);
    const ciphertextBytes = base64ToUint8Array(vector.encryption.ciphertextBase64);
    const aadBytes = new TextEncoder().encode(vector.encryption.aadUtf8);

    const decryptedBuffer = await subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: nonceBytes,
        additionalData: aadBytes,
        tagLength: 128,
      },
      bobAesKey,
      ciphertextBytes
    );

    const decryptedText = new TextDecoder().decode(decryptedBuffer);
    expect(decryptedText).toBe(vector.conversation.plaintext);
  });
});

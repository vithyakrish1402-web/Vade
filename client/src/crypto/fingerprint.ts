import { base64ToArrayBuffer } from './keyManager';

/**
 * Calculates a deterministic human-readable cryptographic fingerprint of a public key.
 *
 * Algorithm:
 * 1. Decode public key Base64 SPKI to raw binary bytes.
 * 2. Hash raw bytes using SHA-256.
 * 3. Format first 32 hex characters into 8 groups of 4 hex characters (e.g. "A7D4 92F1 8C20 4E73 19AB 63D0 7F2A 91CC").
 */
export async function calculateKeyFingerprint(publicKeyBase64: string): Promise<string> {
  const bytes = base64ToArrayBuffer(publicKeyBase64.trim());
  const hashBuffer = await crypto.subtle.digest('SHA-256', bytes);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hex = hashArray.map((b) => b.toString(16).padStart(2, '0').toUpperCase()).join('');

  // Group into 4-character chunks: A7D4 92F1 8C20 4E73 19AB 63D0 7F2A 91CC
  const chunks: string[] = [];
  for (let i = 0; i < 32; i += 4) {
    chunks.push(hex.substring(i, i + 4));
  }

  return chunks.join(' ');
}

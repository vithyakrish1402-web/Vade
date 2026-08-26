import { CURRENT_PROTOCOL_VERSION } from './cryptoConfig';

/**
 * Calculates a deterministic, symmetric safety number between two users.
 *
 * Requirements:
 * - Deterministic: Same keypair produces the same safety number.
 * - Symmetric: calculateSafetyNumber(Alice, Bob) === calculateSafetyNumber(Bob, Alice).
 * - Format: 20-digit string split into four 5-digit blocks (e.g. "48321 72904 18273 66421").
 */
export async function calculateSafetyNumber(
  publicKeyA: string,
  publicKeyB: string
): Promise<string> {
  // 1. Canonical lexicographical ordering of public key Base64 strings
  const [k1, k2] = [publicKeyA.trim(), publicKeyB.trim()].sort();

  // 2. Hash input: k1 + ":" + k2 + ":v" + protocolVersion
  const canonicalString = `${k1}:${k2}:v${CURRENT_PROTOCOL_VERSION}`;
  const encoder = new TextEncoder();
  const data = encoder.encode(canonicalString);

  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashBytes = new Uint8Array(hashBuffer);

  // 3. Derive four 5-digit numbers from the hash bytes
  const blocks: string[] = [];
  for (let i = 0; i < 4; i++) {
    // Read 4 bytes as a 32-bit unsigned integer (big-endian)
    const val =
      ((hashBytes[i * 4] << 24) |
        (hashBytes[i * 4 + 1] << 16) |
        (hashBytes[i * 4 + 2] << 8) |
        hashBytes[i * 4 + 3]) >>>
      0;

    // Modulo 100,000 to produce a 5-digit number
    const fiveDigits = (val % 100000).toString().padStart(5, '0');
    blocks.push(fiveDigits);
  }

  return blocks.join(' ');
}

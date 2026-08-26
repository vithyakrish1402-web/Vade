import { ECDH_KEY_GEN_PARAMS, KEY_AGREEMENT_ALGORITHM } from './cryptoConfig';
import { saveIdentityKeys, loadIdentityKeys } from './cryptoStorage';
import { api } from '../services/api';
import type { PublicKeyResponse } from '@enctxt/shared';

// Base64 helper functions using standard browser/Node APIs
export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Exports a public CryptoKey to a standard Base64 SPKI string.
 */
export async function exportPublicKey(key: CryptoKey): Promise<string> {
  const spki = await crypto.subtle.exportKey('spki', key);
  return arrayBufferToBase64(spki);
}

/**
 * Imports a Base64 SPKI public key into an ECDH CryptoKey.
 */
export async function importPublicKey(base64Spki: string): Promise<CryptoKey> {
  const buffer = base64ToArrayBuffer(base64Spki);
  return crypto.subtle.importKey(
    'spki',
    buffer,
    {
      name: 'ECDH',
      namedCurve: 'P-256',
    },
    true,
    []
  );
}

/**
 * Generates a fresh ECDH P-256 identity key pair and assigns a unique keyId.
 */
export async function generateIdentityKeyPair(): Promise<{
  keyId: string;
  keyPair: CryptoKeyPair;
  publicKeyBase64: string;
}> {
  const keyPair = await crypto.subtle.generateKey(
    ECDH_KEY_GEN_PARAMS,
    false, // Private key is non-extractable in production
    ['deriveKey', 'deriveBits']
  );

  const keyId = `k_${crypto.randomUUID().replace(/-/g, '')}`;
  const publicKeyBase64 = await exportPublicKey(keyPair.publicKey);

  return {
    keyId,
    keyPair,
    publicKeyBase64,
  };
}

/**
 * Loads or initializes the user's local cryptographic identity and registers public key with server.
 */
export async function getOrInitializeIdentity(userId: string): Promise<{
  keyId: string;
  keyPair: CryptoKeyPair;
  publicKeyBase64: string;
}> {
  const existing = await loadIdentityKeys(userId);
  if (existing) {
    return existing;
  }

  // Generate new identity key pair
  const newIdentity = await generateIdentityKeyPair();

  // Save private key locally in IndexedDB
  await saveIdentityKeys(
    userId,
    newIdentity.keyId,
    newIdentity.keyPair,
    newIdentity.publicKeyBase64
  );

  // Publish public key to server
  try {
    await api.post<PublicKeyResponse>('/crypto/identity', {
      keyId: newIdentity.keyId,
      publicKey: newIdentity.publicKeyBase64,
      algorithm: KEY_AGREEMENT_ALGORITHM,
    });
  } catch (error) {
    console.warn('Failed to publish public key to server:', error);
  }

  return newIdentity;
}

// In-memory cache of retrieved peer public keys
const peerKeyCache = new Map<string, { keyId: string; publicKey: string; key: CryptoKey }>();

/**
 * Fetches and imports the public key of a peer user.
 */
export async function fetchPeerPublicKey(peerUserId: string): Promise<{ keyId: string; publicKey: string; key: CryptoKey }> {
  const cached = peerKeyCache.get(peerUserId);
  if (cached) return cached;

  const res = await api.get<PublicKeyResponse>(`/crypto/users/${peerUserId}/key`);
  if (!res.key || !res.key.publicKey) {
    throw new Error(`Public key not found for user ${peerUserId}`);
  }

  const cryptoKey = await importPublicKey(res.key.publicKey);
  const result = {
    keyId: res.key.keyId,
    publicKey: res.key.publicKey,
    key: cryptoKey,
  };

  peerKeyCache.set(peerUserId, result);
  return result;
}

export function clearPeerKeyCache(): void {
  peerKeyCache.clear();
}

/**
 * Cryptographic constants & configuration for enctxt E2EE (Phase 7).
 * Standardized on native Web Crypto API primitives.
 */

export const CURRENT_PROTOCOL_VERSION = 1;
export const KEY_AGREEMENT_ALGORITHM = 'ECDH-P256';
export const ENCRYPTION_ALGORITHM = 'AES-256-GCM';
export const KDF_ALGORITHM = 'HKDF-SHA-256';

export const IV_LENGTH_BYTES = 12; // 96-bit nonce standard for AES-GCM
export const AUTH_TAG_LENGTH_BITS = 128; // 128-bit authentication tag

export const ECDH_KEY_GEN_PARAMS: EcKeyGenParams = {
  name: 'ECDH',
  namedCurve: 'P-256',
};

export const HKDF_INFO_PREFIX = 'enctxt-v1-e2ee';

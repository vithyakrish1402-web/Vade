/**
 * Browser capability checks for Web Crypto and secure key storage.
 * Ensures the client fails closed if necessary cryptographic primitives are missing.
 */

export interface BrowserCapabilities {
  isSupported: boolean;
  hasWebCrypto: boolean;
  hasIndexedDB: boolean;
  hasSubtleCrypto: boolean;
  errorMessage?: string;
}

export function checkBrowserCapabilities(): BrowserCapabilities {
  const hasWindow = typeof window !== 'undefined';
  const hasCrypto = hasWindow && typeof window.crypto !== 'undefined';
  const hasSubtleCrypto = hasCrypto && typeof window.crypto.subtle !== 'undefined';
  const hasIndexedDB = hasWindow && typeof window.indexedDB !== 'undefined';

  const isSupported = hasSubtleCrypto && hasIndexedDB;

  let errorMessage: string | undefined;
  if (!hasSubtleCrypto) {
    errorMessage = 'This browser does not support Web Cryptography (SubtleCrypto) required for end-to-end encryption.';
  } else if (!hasIndexedDB) {
    errorMessage = 'This browser does not support IndexedDB required for secure local cryptographic key storage.';
  }

  return {
    isSupported,
    hasWebCrypto: hasCrypto,
    hasIndexedDB,
    hasSubtleCrypto,
    errorMessage,
  };
}

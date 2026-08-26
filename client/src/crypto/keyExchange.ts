import { HKDF_INFO_PREFIX } from './cryptoConfig';

/**
 * Derives a symmetric AES-256-GCM encryption/decryption key using ECDH shared secret + HKDF-SHA-256.
 *
 * Mathematically:
 *   SharedSecret = ECDH(myPrivateKey, peerPublicKey)
 *   AESKey = HKDF(IKM=SharedSecret, salt=conversationId, info="enctxt-v1-e2ee", length=256)
 */
export async function deriveConversationKey(
  myPrivateKey: CryptoKey,
  peerPublicKey: CryptoKey,
  conversationId: string
): Promise<CryptoKey> {
  // 1. Derive 256-bit raw shared secret from ECDH
  const sharedBits = await crypto.subtle.deriveBits(
    {
      name: 'ECDH',
      public: peerPublicKey,
    },
    myPrivateKey,
    256
  );

  // 2. Import shared bits as HKDF key material
  const hkdfKey = await crypto.subtle.importKey(
    'raw',
    sharedBits,
    { name: 'HKDF' },
    false,
    ['deriveKey']
  );

  // 3. Derive 256-bit AES-GCM symmetric key
  const enc = new TextEncoder();
  const conversationKey = await crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: enc.encode(conversationId),
      info: enc.encode(HKDF_INFO_PREFIX),
    },
    hkdfKey,
    {
      name: 'AES-GCM',
      length: 256,
    },
    false,
    ['encrypt', 'decrypt']
  );

  return conversationKey;
}

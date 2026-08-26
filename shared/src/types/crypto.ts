export interface EncryptedMessageEnvelope {
  version: number;
  algorithm: 'AES-256-GCM' | string;
  keyAgreement: 'ECDH-P256' | string;
  senderKeyId: string;
  recipientKeyId: string;
  nonce: string; // Base64 12-byte IV
  ciphertext: string; // Base64 ciphertext + 16-byte GCM tag
  aad?: string; // Base64 AAD binding string
}

export interface PublicKeyRecord {
  id?: string;
  keyId: string;
  userId: string;
  publicKey: string; // Base64 / JWK string
  algorithm: string;
  createdAt: string;
  updatedAt?: string;
}

export interface PublishKeyInput {
  keyId: string;
  publicKey: string;
  algorithm?: string;
}

export interface PublicKeyResponse {
  key: PublicKeyRecord | null;
}

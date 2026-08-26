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

export type PublicKeyStatus = 'active' | 'revoked' | 'superseded';

export interface PublicKeyRecord {
  id?: string;
  keyId: string;
  userId: string;
  publicKey: string; // Base64 / JWK string
  algorithm: string;
  status?: PublicKeyStatus;
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

// Phase 8: Key Verification & Identity Fingerprints
export type ContactVerificationState = 'unverified' | 'verified' | 'key_changed' | 'revoked';

export interface ContactVerification {
  userId: string;
  keyId: string;
  fingerprint: string;
  verifiedAt: string;
}

// Phase 8: Device Identity & Session Management
export type DeviceStatus = 'active' | 'revoked';

export interface DeviceRecord {
  id: string;
  userId: string;
  deviceName: string;
  platform: string;
  keyId: string;
  status: DeviceStatus;
  lastSeenAt: string;
  createdAt: string;
  updatedAt?: string;
  isCurrentDevice?: boolean;
}

export interface RegisterDeviceInput {
  deviceName: string;
  platform?: string;
  keyId: string;
}

export interface DeviceListResponse {
  devices: DeviceRecord[];
}

export interface RevokeDeviceResponse {
  success: boolean;
  revokedDeviceId: string;
}

// Phase 8: Security Activity & Events
export interface SecurityEvent {
  id: string;
  type:
    | 'identity_created'
    | 'key_rotated'
    | 'contact_verified'
    | 'contact_key_changed'
    | 'contact_unverified'
    | 'device_registered'
    | 'device_revoked';
  description: string;
  timestamp: string;
  level: 'info' | 'warning' | 'security';
}

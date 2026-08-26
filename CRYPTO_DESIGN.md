# enctxt Cryptographic Design Specification (Phase 7 — End-to-End Encryption)

> **Document Version**: 1.0.0  
> **Status**: APPROVED & ACTIVE  
> **Layer**: Layer 1 — Cryptographic Security  
> **Last Updated**: 2026-08-26  

---

## 1. Threat Model & Security Objectives

### 1.1. In-Scope Security Goals
- **Server & Database Compromise**: If an attacker gains full read access to the PostgreSQL database, Redis caches, server memory, or network transport (passive/active wiretap), they cannot recover the plaintext of messages.
- **Untrusted Server Operator**: The server is treated as an untrusted intermediary for message confidentiality. The server routes and persists ciphertext only.
- **Message Integrity & Authenticity**: Message tampering, bit-flipping, or envelope modification is cryptographically detected via Galois/Counter Mode (GCM) authentication tags, causing decryption to fail closed.
- **Context Binding (AAD)**: Ciphertexts are cryptographically bound to their `conversationId`, `senderId`, and `protocolVersion` via Authenticated Associated Data (AAD), preventing attackers from splicing ciphertexts into different conversations or senders.

### 1.2. Out-of-Scope Limitations
Phase 7 End-to-End Encryption is explicitly **NOT** designed to protect against:
- Compromised user devices (rootkits, operating system backdoors, hardware compromises).
- Malicious browser extensions with DOM or memory access.
- Keyloggers or physical shoulder-surfing (addressed by Layer 2 Visual Privacy & Gestures).
- Screen capture, screen recording, or operating-system level frame buffers.
- Compromised client-side JavaScript delivery if the application origin itself is maliciously modified.

---

## 2. Trust Model & Key Hierarchy

```text
┌───────────────────────────────────────────────────────────┐
│                       USER A DEVICE                       │
│  Private Key (P-256): Stored in IndexedDB (Client Only)   │
│  Public Key (P-256): Published to Server                  │
└─────────────────────────────┬─────────────────────────────┘
                              │
                    ECDH Shared Secret (Z)
              Z = ECDH(Priv_A, Pub_B) = ECDH(Priv_B, Pub_A)
                              │
                              ▼
           HKDF-SHA-256 Key Derivation Function (KDF)
               Salt = conversationId, Info = "enctxt-v1-e2ee"
                              │
                              ▼
                 Conversation Key (AES-256)
             256-bit symmetric AEAD encryption key
                              │
                              ▼
                    AES-256-GCM Encryption
                 Fresh 96-bit (12-byte) random IV
                   AAD = conversationId:senderId:v1
                              │
                              ▼
┌───────────────────────────────────────────────────────────┐
│                     UNTRUSTED SERVER                      │
│   (Stores & Delivers Encrypted Envelope — Zero Plaintext) │
└─────────────────────────────┬─────────────────────────────┘
                              │
                              ▼
┌───────────────────────────────────────────────────────────┐
│                       USER B DEVICE                       │
│  Private Key (P-256): Stored in IndexedDB (Client Only)   │
│  Derives same AES-256 key via ECDH(Priv_B, Pub_A) + HKDF  │
│  Decrypts AES-256-GCM ciphertext & validates auth tag     │
└───────────────────────────────────────────────────────────┘
```

---

## 3. Cryptographic Primitives & Parameters

All cryptographic operations leverage the standardized, native **Web Crypto API** (`window.crypto.subtle` / `globalThis.crypto.subtle`):

| Function | Algorithm / Standard | Parameters / Key Size |
|---|---|---|
| **Identity & Key Agreement** | ECDH (Elliptic Curve Diffie-Hellman) | NIST Curve P-256 (`secp256r1`) |
| **Key Derivation (KDF)** | HKDF (RFC 5869) | HMAC-SHA-256, 256-bit output key |
| **Symmetric Encryption** | AES-GCM (NIST SP 800-38D) | 256-bit key (`AES-256-GCM`), 128-bit auth tag |
| **Initialization Vector (IV)** | Cryptographically Secure Random | 96 bits (12 bytes) via `crypto.getRandomValues()` |
| **Associated Data (AAD)** | UTF-8 metadata binding | `conversationId + ":" + senderId + ":v" + version` |
| **Randomness Source** | CSPRNG | `crypto.getRandomValues()` |

---

## 4. Key Lifecycle & Storage Architecture

### 4.1. Identity Key Generation (`keyManager.ts`)
- Upon first login on a device, the client checks IndexedDB for an existing cryptographic identity.
- If none exists, it generates a Web Crypto ECDH P-256 key pair:
  - Private key: Stored in browser `IndexedDB` (`enctxt_crypto_keys` store) under non-extractable / structured clone parameters. **NEVER sent over network.**
  - Public key: Exported as JWK / SPKI Base64 and published to the server via `POST /api/crypto/identity` with a unique `keyId` (`k_${UUID}`).

### 4.2. Public Key Distribution (`GET /api/crypto/users/:userId/key`)
- When User A opens a conversation with User B, User A requests User B's active public key from the authenticated API.
- The public key is cached in memory on User A's device for the duration of the session.

### 4.3. Key Rotation & Multiple Keys
- Each published public key carries a unique `keyId`.
- Encrypted message envelopes specify `senderKeyId` and `recipientKeyId`.
- When a user rotates their identity key on a device, old messages referencing historical key IDs remain decryptable as long as the corresponding private key exists in the user's local key store.

---

## 5. Message Envelope & Wire Format

### 5.1. JSON Wire Envelope Format (`EncryptedMessageEnvelope`)
```json
{
  "version": 1,
  "algorithm": "AES-256-GCM",
  "keyAgreement": "ECDH-P256",
  "senderKeyId": "k_9f83a2...",
  "recipientKeyId": "k_1b24c8...",
  "nonce": "dGhpcyBpcyBhIDEyLWJ5dGUgbm9uY2U=",
  "ciphertext": "Y2lwaGVydGV4dCB3aXRoIDE2LWJ5dGUgZ2NtIHRhZw==",
  "aad": "MWY3OWE2ZDItYTA...=="
}
```

### 5.2. Field Specifications
1. `version`: Integer protocol version (currently `1`).
2. `algorithm`: Literal `'AES-256-GCM'`.
3. `keyAgreement`: Literal `'ECDH-P256'`.
4. `senderKeyId`: Identifier of the public key belonging to the sender at the time of encryption.
5. `recipientKeyId`: Identifier of the public key belonging to the recipient at the time of encryption.
6. `nonce`: 12-byte Base64-encoded initialization vector. Freshly generated for every single message.
7. `ciphertext`: Base64-encoded encrypted payload including the 16-byte GCM authentication tag appended.
8. `aad`: Base64-encoded context binding string.

---

## 6. Message Encryption & Decryption Pipeline

### 6.1. Outgoing Encryption Pipeline (Sender)
```text
1. User types plaintext (e.g. "Meet me at 7 PM")
2. Retrieve User B's public key (Pub_B) from memory/API
3. Retrieve User A's private key (Priv_A) from local IndexedDB
4. Derive SharedSecret = ECDH(Priv_A, Pub_B)
5. Derive AES-256 Key = HKDF(SharedSecret, salt=conversationId, info="enctxt-v1-e2ee")
6. Generate 12 random bytes IV = crypto.getRandomValues(new Uint8Array(12))
7. Formulate AAD = UTF8(`${conversationId}:${userA.id}:v1`)
8. Encrypt: CiphertextWithTag = AES_GCM_Encrypt(Key, IV, Plaintext, AAD)
9. Package EncryptedMessageEnvelope
10. Send Envelope to POST /api/conversations/:id/messages
```

### 6.2. Incoming Decryption Pipeline (Recipient or Sender on Sync)
```text
1. Receive EncryptedMessageEnvelope from REST / WebSocket
2. Extract senderKeyId, recipientKeyId, nonce, ciphertext, aad
3. Identify partner's public key (Pub_Partner) and own private key (Priv_Self)
4. Derive SharedSecret = ECDH(Priv_Self, Pub_Partner)
5. Derive AES-256 Key = HKDF(SharedSecret, salt=conversationId, info="enctxt-v1-e2ee")
6. Verify AAD matches current conversation context
7. Decrypt: Plaintext = AES_GCM_Decrypt(Key, IV, CiphertextWithTag, AAD)
   -> If authentication tag fails: THROW DecryptionError("Unable to decrypt message.")
8. Pass Plaintext in memory to <ProtectedMessage content={Plaintext} displayMode="protected" />
9. User performs gesture reveal -> Plaintext temporarily displayed (8 seconds)
10. Auto re-protect -> Return to visual homoglyphs
```

---

## 7. Migration & Database Schema

### 7.1. Database Model Updates
- **`PublicKey` Model** (New table in PostgreSQL):
  - `id` (UUID PK)
  - `userId` (FK to User, unique)
  - `keyId` (Unique string identifier)
  - `publicKey` (SPKI Base64 / JWK serialized string)
  - `algorithm` (Default `'ECDH-P256'`)
  - `createdAt`, `updatedAt`
- **`Message` Model** (Updated schema):
  - Remove legacy plaintext `content` column.
  - Add `ciphertext` (Text), `nonce` (VarChar), `senderKeyId` (VarChar), `recipientKeyId` (VarChar), `algorithm` (VarChar), `version` (Integer).

### 7.2. Plaintext Migration Policy
- In this development phase, legacy development messages will be cleaned and reset to ensure **zero plaintext messages exist anywhere in PostgreSQL**.

---

## 8. Memory Management & Lifecycle

- **Memory-Only Plaintext**: Decrypted plaintexts reside strictly in transient React component / hook memory.
- **Zero Persistent Plaintext Storage**: Plaintext message contents are **never** stored in `localStorage`, `IndexedDB`, cookies, or browser cache.
- **Logout Cleansing**: Logging out flushes in-memory decrypted message caches, clears active reveal timers, and disconnects WebSockets.

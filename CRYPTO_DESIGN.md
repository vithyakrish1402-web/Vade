# enctxt Cryptographic Design Specification (Protocol v1)

> **Document Version**: 1.0.0-rc.1  
> **Status**: FROZEN & AUTHORITATIVE  
> **Layer**: Layer 1 — Cryptographic Security  
> **Supported Platforms**: Web (WebCrypto API) & Android Native (AndroidKeyStore + JCA)  
> **Last Updated**: 2026-08-26  

---

## 1. Threat Model & Security Objectives

### 1.1. In-Scope Security Goals
- **Server & Database Compromise**: If an attacker gains full read access to the PostgreSQL database, Redis caches, server memory, or network transport (passive/active wiretap), they cannot recover the plaintext of messages.
- **Untrusted Server Operator**: The server is treated as an untrusted intermediary for message confidentiality. The server routes and persists ciphertext only.
- **Message Integrity & Authenticity**: Message tampering, bit-flipping, or envelope modification is cryptographically detected via Galois/Counter Mode (GCM) authentication tags, causing decryption to fail closed.
- **Context Binding (AAD)**: Ciphertexts are cryptographically bound to their `conversationId`, `senderId`, and `protocolVersion` via Authenticated Associated Data (AAD), preventing attackers from splicing ciphertexts into different conversations or senders.

### 1.2. Out-of-Scope Limitations
Protocol v1 End-to-End Encryption is explicitly **NOT** designed to protect against:
- Compromised user devices (rootkits, operating system backdoors, hardware compromises).
- Malicious browser extensions with DOM or memory access / accessibility service scraping on Android.
- Keyloggers or physical shoulder-surfing (addressed by Layer 2 Visual Privacy & Layer 3 Gestures).
- Screen capture, screen recording, or operating-system level frame buffers.

---

## 2. Trust Model & Key Hierarchy

```text
┌───────────────────────────────────────────────────────────┐
│                   CLIENT DEVICE A (Web / Android)         │
│  Private Key (P-256): Stored in IndexedDB / KeyStore      │
│  Public Key (P-256): Published as SPKI Base64             │
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
│                   CLIENT DEVICE B (Web / Android)         │
│  Private Key (P-256): Stored in IndexedDB / KeyStore      │
│  Derives same AES-256 key via ECDH(Priv_B, Pub_A) + HKDF  │
│  Decrypts AES-256-GCM ciphertext & validates auth tag     │
└───────────────────────────────────────────────────────────┘
```

---

## 3. Cryptographic Primitives & Parameters

All cryptographic operations strictly adhere to cross-platform standard primitives:

| Function | Algorithm / Standard | Parameters / Key Size |
|---|---|---|
| **Identity & Key Agreement** | ECDH (Elliptic Curve Diffie-Hellman) | NIST Curve P-256 (`secp256r1` / `prime256v1`) |
| **Key Derivation (KDF)** | HKDF (RFC 5869) | HMAC-SHA-256, 256-bit output key |
| **Symmetric Encryption** | AES-GCM (NIST SP 800-38D) | 256-bit key (`AES-256-GCM`), 128-bit auth tag |
| **Initialization Vector (IV)** | Cryptographically Secure Random | 96 bits (12 bytes) via CSPRNG |
| **Associated Data (AAD)** | UTF-8 metadata binding | `${conversationId}:${senderId}:v1` |
| **Public Key Serialization** | `SubjectPublicKeyInfo` (SPKI) | Base64 encoded DER |

---

## 4. Key Lifecycle & Storage Architecture

### 4.1. Web Client (Web Crypto API)
- Private key: Stored non-extractably in browser `IndexedDB` (`enctxt_crypto_keys` store).
- Public key: Exported as SPKI Base64 and published via `POST /api/crypto/identity` with a unique `keyId` (`k_${UUID}`).

### 4.2. Android Native Client (AndroidKeyStore)
- Private key: Generated and maintained within `AndroidKeyStore` (`KeyProperties.PURPOSE_AGREE_KEY`). Private key bytes **never leave hardware isolation**.
- Public key: Exported as SPKI Base64 and published via `POST /api/crypto/identity`.

---

## 5. Message Envelope & Wire Format (`EncryptedMessageEnvelope`)

```json
{
  "version": 1,
  "algorithm": "AES-256-GCM",
  "keyAgreement": "ECDH-P256",
  "senderKeyId": "k_e0f0a460d44c40968a7f7ed2ee3b5fd2",
  "recipientKeyId": "k_0e736526c27640a7bd91082eb5780a06",
  "nonce": "dGhpcyBpcyBhIDEyLWJ5dGUgbm9uY2U=",
  "ciphertext": "Y2lwaGVydGV4dCB3aXRoIDE2LWJ5dGUgZ2NtIHRhZw==",
  "aad": "Y29udGV4dF9hYWRfc3RyaW5n"
}
```

---

## 6. Deterministic Cross-Platform Test Vectors

Both Web and Android clients must independently verify against [docs/test-vectors/crypto-test-vectors.json](docs/test-vectors/crypto-test-vectors.json):

- **Curve**: `P-256`
- **ConversationId**: `"conv-test-vector-001"`
- **Derived AES-256 Key**: `900410531c9a5c2a304d738dee0c4734b2117e5ed4add6f5e19059f62a10ca03`
- **Nonce (12 bytes Base64)**: `MTIzNDU2Nzg5MDEy`
- **AAD**: `"conv-test-vector-001:user-alice-001:v1"`
- **Ciphertext**: `Mz/hwY9pM8oHVHzJC+Us8fMQwglUGvXpyxVN9csUET6U2NbN/m8/ArvV9vbBGBbDruDY4LU2IzePl0XKRkzPjRYHVzdUqxU=`
- **Expected Plaintext**: `"Cross-platform cryptographic test vector for ENCTXT v1."`

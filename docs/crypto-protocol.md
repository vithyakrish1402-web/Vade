# ENCTXT End-to-End Cryptographic Protocol Specification (Protocol v1)

**Status**: FROZEN FOR RELEASE CANDIDATE (v1.0.0-rc.1)  
**Protocol Version**: `1`  
**Standard Algorithms**: `ECDH P-256` + `HKDF-SHA-256` + `AES-256-GCM`

---

## 1. Cryptographic Primitive Suite

| Function | Algorithm / Primitive | Specification |
|---|---|---|
| **Identity Key Generation** | `ECDH` on Curve `P-256` (secp256r1 / prime256v1) | NIST FIPS 186-4 |
| **Public Key Export/Import** | `SubjectPublicKeyInfo` (SPKI) | Base64 DER encoding |
| **Key Derivation Function** | `HKDF-SHA-256` (Extract-and-Expand) | RFC 5869 |
| **Symmetric Cipher** | `AES-256-GCM` | NIST SP 800-38D |
| **Initialization Vector (IV)** | 96-bit (12 bytes) CSPRNG random nonce | Unique per message |
| **Authentication Tag** | 128-bit (16 bytes) GCM auth tag | Appended to ciphertext |
| **Authenticated Data (AAD)** | Structured UTF-8 context string | Mandatory context binding |

---

## 2. Key Derivation & Message Encryption Pipeline

```text
Alice (Sender)                                              Bob (Recipient)
  │                                                           │
  ├── 1. Get Alice Private Key (P-256)                        │
  ├── 2. Get Bob Public Key (SPKI)                            │
  │                                                           │
  ├── 3. ECDH Shared Secret = ECDH(Alice_Priv, Bob_Pub)       │
  │                                                           │
  ├── 4. Symmetric Key (AES-256) = HKDF(                      │
  │        IKM  = SharedSecret,                               │
  │        Salt = UTF8(conversationId),                       │
  │        Info = UTF8("enctxt-v1-e2ee"),                     │
  │        Length = 32 bytes                                  │
  │      )                                                    │
  │                                                           │
  ├── 5. Generate 96-bit Nonce = CSPRNG(12 bytes)             │
  ├── 6. AAD = UTF8("${conversationId}:${senderId}:v1")       │
  │                                                           │
  ├── 7. Ciphertext = AES-GCM-Encrypt(                        │
  │        Key = SymmetricKey,                                │
  │        IV  = Nonce,                                       │
  │        AAD = AAD,                                         │
  │        Plaintext = UTF8(messageText)                      │
  │      )                                                    │
  │                                                           │
  └──── Send Envelope (Base64 Ciphertext, Nonce, AAD) ───────►│
```

---

## 3. Encrypted Message Envelope Schema (`version: 1`)

```json
{
  "version": 1,
  "algorithm": "AES-256-GCM",
  "keyAgreement": "ECDH-P256",
  "senderKeyId": "k_9f83a210-6c92-491b-87cf-6f3b0e12d4a1",
  "recipientKeyId": "k_1b2c3d4e-5f6a-7b8c-9d0e-1f2a3b4c5d6e",
  "nonce": "dGhpcyBpcyAxMiBieXRlcw==",
  "ciphertext": "Y2lwaGVydGV4dCB3aXRoIGF1dGggdGFn...",
  "aad": "conv-uuid:sender-uuid:v1"
}
```

---

## 4. Identity Fingerprint & Safety Number Derivation

### 4.1 SHA-256 Public Key Fingerprint
- **Input**: Raw binary DER bytes of the SPKI public key.
- **Hash**: `SHA-256(spkiBytes)` -> 32-byte digest.
- **Formatting**: Hex string split into 8 space-separated 4-character uppercase groups:
  ```text
  A7D4 92F1 8C20 4E73 19AB 63D0 7F2A 91CC
  ```

### 4.2 Symmetric Safety Number
- **Input**: Deterministically sorted Base64 public keys:
  ```text
  pkMin = min(alicePublicKeyBase64, bobPublicKeyBase64)
  pkMax = max(alicePublicKeyBase64, bobPublicKeyBase64)
  canonicalString = `${pkMin}:${pkMax}:v1`
  ```
- **Digest**: `hash = SHA-256(UTF8(canonicalString))`
- **Formatting**: Decimal numbers split into 5-digit blocks (e.g. `48321 72904 18273 66421`).
- **Key Change Invariant**: If either party rotates their key, the safety number changes immediately, invalidating any stored verification state.

---

## 5. Visual Protection & Gesture Authorization

1. **Layer 2 (Visual Protection)**: Messages are converted to deterministic visual homoglyphs before rendering on screen (`protectMessage`).
2. **Layer 3 (Gesture Reveal)**: 64-point resampled geometric gesture matching authorizing temporary 8-second plaintext visibility.
3. **Lockout Policy**: 5 consecutive failed attempts trigger an automatic 30-second lockout.
4. **Auto Re-Protection**: Revealed plaintexts immediately return to protected mode on window blur, tab change (`visibilitychange`), navigation, or user logout.

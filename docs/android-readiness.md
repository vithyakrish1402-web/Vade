# Vade Android Client Architecture & Verification Specification

**Target Version**: `v1.0.0-rc.1`  
**Protocol Version**: `1`  
**Compatibility Level**: 100% Interoperable with Vade Web Release Candidate  
**Status**: COMPLETE & VERIFIED (Phases 12–19)

---

## 1. Architectural Overview

The native Android client implements Vade's 4-Layer Defense-in-Depth Privacy Model and integrates with the backend and Web client without any changes to the server API, database schema, or cryptographic protocol:

```text
Android Client (Kotlin / Jetpack Compose)
  │
  ├── 1. Secure Local Storage
  │     ├── Android Keystore: Hardware-backed ECDH P-256 Identity Keypair (PURPOSE_AGREE_KEY)
  │     ├── Room Database: Stores Ciphertext Envelopes & Nonces Only (Zero Plaintext)
  │     ├── EncryptedSharedPreferences (AES-256-GCM): Gesture Templates (Layer 3)
  │     └── EncryptedSharedPreferences (AES-256-GCM): Contact Verification Records (Layer 4)
  │
  ├── 2. Cryptographic Engine
  │     ├── ECDH on NIST P-256 (secp256r1)
  │     ├── HKDF-SHA-256 (RFC 5869): salt = conversationId, info = "enctxt-v1-e2ee"
  │     ├── AES-256-GCM: 96-bit CSPRNG Nonce, 128-bit Tag, AAD = "${conversationId}:${senderId}:v1"
  │     ├── SHA-256 Identity Fingerprints (8 groups × 4 uppercase hex characters)
  │     └── Lexicographical Symmetric Safety Numbers (4 groups × 5 decimal digits)
  │
  ├── 3. Network Transport (OkHttp 4.x + MemoryCookieJar)
  │     ├── HTTPS REST API (/api/*) with secure JSON serialization
  │     ├── WebSocket client (wss://<host>/ws) with heartbeat, queue, & reconnect
  │     └── Network Security Config: Cleartext traffic strictly forbidden in production
  │
  └── 4. Privacy UX Engine
        ├── Protected Message UI: Visual homoglyphs before reveal (Zero Plaintext Display by Default)
        ├── Dynamic FLAG_SECURE: Screenshot, screen recorder, & recent-app protection during reveal
        ├── 64-point Arc-Length Normalized Gesture Reveal: ≤ 8-second temporary reveal duration
        └── Fail-Closed Re-protection: On Activity ON_STOP, Window Focus Loss, or Lockout
```

---

## 2. Release & Security Invariants

- [x] **Zero Plaintext Persistence**: Android Room database entities contain only ciphertext envelopes and nonces.
- [x] **Zero Server-Side Plaintext**: Android client only transmits AES-256-GCM encrypted envelopes to the server.
- [x] **Hardware Key Protection**: Identity private keys never leave `AndroidKeyStore`.
- [x] **Dynamic Screenshot Protection**: `FLAG_SECURE` is active during gesture authentication and plaintext reveal.
- [x] **Instant Re-Protection**: Revealed messages immediately re-protect on app backgrounding, window blur, or navigation.
- [x] **Non-Silent Re-Verification**: Key changes transition contact state to `KeyChanged` and require explicit re-verification.
- [x] **Fail-Closed Storage**: Corrupted or incompatible gesture/verification storage fails closed.
- [x] **Monotonic Delivery States**: Message delivery state progression (`Sending` $\to$ `Sent` $\to$ `Delivered` $\to$ `Read`) never regresses.

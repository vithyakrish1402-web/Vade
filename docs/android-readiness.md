# ENCTXT Android Client Implementation Contract & Readiness Guide

**Target Phase**: Phase 12 (Android Implementation)  
**Protocol Version**: `1`  
**Compatibility Level**: 100% Interoperable with ENCTXT Web Release Candidate (v1.0.0-rc.1)

---

## 1. Architectural Overview

The future Android client must integrate with the existing frozen ENCTXT backend and Web client without any changes to the server API, database schema, or cryptographic protocol:

```text
Android Client (Kotlin / Jetpack Compose)
  │
  ├── 1. Secure Local Storage
  │     ├── Android Keystore: Hardware-backed ECDH P-256 Identity Keypair
  │     ├── Room Database (SQLCipher / Encrypted): Stores Ciphertext Envelopes Only
  │     └── EncryptedSharedPreferences: Contact verification records
  │
  ├── 2. Cryptographic Engine
  │     ├── ECDH on NIST P-256 (secp256r1)
  │     ├── HKDF-SHA-256 (RFC 5869): salt = conversationId, info = "enctxt-v1-e2ee"
  │     └── AES-256-GCM: 96-bit IV, 128-bit tag, AAD = "${conversationId}:${senderId}:v1"
  │
  ├── 3. Network Transport (OkHttp 4.x + Retrofit)
  │     ├── Persistent CookieJar for HttpOnly session cookie
  │     ├── HTTPS REST API (/api/*)
  │     └── WebSocket client (wss://<host>/ws) with automatic heartbeat & reconnect
  │
  └── 4. Privacy UX Engine
        ├── Protected Message UI: Visual homoglyphs before reveal
        ├── Biometric / Custom Gesture Reveal: 8-second temporary reveal duration
        └── Auto Re-protection: On Activity onPause, onStop, or App Switcher
```

---

## 2. Cryptographic Interoperability Checklist

To ensure complete interoperability with Web users:
1. **Public Key Format**: Android must export its public identity key as Base64-encoded `SubjectPublicKeyInfo` (SPKI) DER bytes when calling `POST /api/crypto/identity`.
2. **Key Derivation (HKDF)**: Use standard BouncyCastle or Java `HKDF` with:
   - `IKM`: 32-byte raw shared secret from `ECDH(Android_Priv, Peer_Pub)`.
   - `Salt`: UTF-8 bytes of `conversationId`.
   - `Info`: UTF-8 bytes of `"enctxt-v1-e2ee"`.
   - Output length: 32 bytes (256 bits).
3. **Envelope Packaging**: Encrypt message plaintext to AES-256-GCM ciphertext + 16-byte tag, encode to Base64, and transmit via `POST /api/conversations/:id/messages`.
4. **AAD Binding**: Exact byte string `"${conversationId}:${senderId}:v1"`.
5. **Safety Number Verification**: Compute `SHA-256(min(pkA, pkB) + ":" + max(pkA, pkB) + ":v1")` matching the Web client format.

---

## 3. Cross-Platform Test Vector Verification

Prior to writing UI or network code, the Android crypto engine must execute unit tests validating against `docs/test-vectors/crypto-test-vectors.json`.

Expected test output:
- ECDH Shared Secret + HKDF produces AES key: `900410531c9a5c2a304d738dee0c4734b2117e5ed4add6f5e19059f62a10ca03`.
- Decryption of `Mz/hwY9pM8oHVHzJC+Us8fMQwglUGvXpyxVN9csUET6U2NbN/m8/ArvV9vbBGBbDruDY4LU2IzePl0XKRkzPjRYHVzdUqxU=` yields `"Cross-platform cryptographic test vector for ENCTXT v1."`.

---

## 4. Invariant Rules for Android

- [x] **Zero Plaintext Persistence**: Android Room database must never store decrypted plaintext.
- [x] **Zero Server-Side Plaintext**: Android client must never send unencrypted message payloads.
- [x] **Hardware Key Protection**: Private keys must never leave Android Keystore (KeyGenParameterSpec with `PURPOSE_AGREE_KEY`).
- [x] **Instant Re-Protection**: Revealed messages must immediately hide when the app loses focus (`onPause` / `FLAG_SECURE` window setting).

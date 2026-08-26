# ENCTXT Android Application

Native Android implementation of the **ENCTXT** end-to-end encrypted messaging client, built in Kotlin and Jetpack Compose strictly conforming to the frozen Protocol v1 contracts.

---

## 1. Architectural Overview

```text
                                ENCTXT Server
                                      │
                         ┌────────────┴────────────┐
                         │                         │
                       HTTPS                      WSS
                         │                         │
                         ▼                         ▼
                ┌────────────────────────────────────────┐
                │          ENCTXT Android Client         │
                │                                        │
                │  ┌──────────────────────────────────┐  │
                │  │ Jetpack Compose UI               │  │
                │  │ (Auth, Search, Chat, Composer)   │  │
                │  └────────────────┬─────────────────┘  │
                │                   │                    │
                │  ┌────────────────▼─────────────────┐  │
                │  │ ViewModels (StateFlow)           │  │
                │  └────────────────┬─────────────────┘  │
                │                   │                    │
                │  ┌────────────────▼─────────────────┐  │
                │  │ Domain Repositories              │  │
                │  └──────────┬─────────────┬─────────┘  │
                │             │             │            │
                │             ▼             ▼            │
                │      ┌────────────┐ ┌──────────────┐  │
                │      │ REST / WS  │ │ Room DB      │  │
                │      │ (OkHttp)   │ │ (Ciphertext) │  │
                │      └────────────┘ └──────────────┘  │
                │             │                          │
                │             ▼                          │
                │      ┌────────────────────┐            │
                │      │ Cryptographic Core │            │
                │      │ (ECDH, HKDF, GCM)  │            │
                │      └─────────┬──────────┘            │
                │                │                       │
                │                ▼                       │
                │      ┌────────────────────┐            │
                │      │ Android KeyStore   │            │
                │      │ (Hardware P-256)   │            │
                │      └────────────────────┘            │
                └────────────────────────────────────────┘
```

---

## 2. Implemented Features (Phase 13)

- **Authentication Lifecycle**: Registration, login, session restoration via `SessionInitializer`, logout cleanup.
- **User Search**: Debounced search (300ms) with safe metadata presentation.
- **1-to-1 Conversations**: Idempotent conversation creation, Room caching, zero-plaintext preview placeholders.
- **End-to-End Encryption**:
  - Recipient public key resolution (`GET /api/crypto/users/:id/key`).
  - Key agreement via `ECDH P-256`.
  - Symmetric key derivation via `HKDF-SHA-256` (`salt = conversationId`, `info = "enctxt-v1-e2ee"`).
  - Authenticated encryption/decryption via `AES-256-GCM` with 96-bit CSPRNG nonce, 128-bit tag, and structured AAD `${conversationId}:${senderId}:v1`.
- **Real-Time WebSocket Sync**:
  - Room subscriptions (`subscribe` / `unsubscribe`).
  - Real-time event handling (`message.created`, `message.delivered`, `message.read`).
  - Reconnection catchup synchronization.
- **Zero-Plaintext Invariant**: Room database persists only encrypted envelopes; plaintext exists solely in transient ViewModel memory during active display.

---

## 3. Protocol Contract Conformance

The Android application implements the frozen ENCTXT specifications:
- **REST API**: Defined in [docs/api-contract.md](../docs/api-contract.md)
- **WebSocket Protocol**: Defined in [docs/websocket-protocol.md](../docs/websocket-protocol.md)
- **Cryptographic Protocol**: Defined in [docs/crypto-protocol.md](../docs/crypto-protocol.md)
- **Test Vectors**: Verified against [docs/test-vectors/crypto-test-vectors.json](../docs/test-vectors/crypto-test-vectors.json)

---

## 4. Building & Running

```bash
# Clean and assemble debug APK
./gradlew clean assembleDebug

# Run unit tests and crypto test vector verification
./gradlew test

# Assemble release APK with R8 minification
./gradlew assembleRelease
```

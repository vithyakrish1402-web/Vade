# System Architecture & Technical Specifications

> **Project**: `enctxt` (Private Chat)  
> **Current Version**: `0.1.0` (Phase 8 Complete)  
> **Last Updated**: 2026-08-26  
> **Status**: Maintained & Updated Continuously with System Changes

---

## 1. Architectural Philosophy: Multi-Layered Privacy

`enctxt` is architected around the principle of defense-in-depth, decoupling network/data storage security from physical screen exposure:

```text
┌───────────────────────────────────────────────────────────────────────────┐
│                     LAYER 4: IDENTITY VERIFICATION                        │
│  - Public-Key Fingerprints (SHA-256 SPKI hex)                             │
│  - Symmetric Safety Numbers: SHA-256(min(A, B) + max(A, B) + v1)          │
│  - Key-Change Detection & Warnings (invalidates previous verification)    │
│  - Local-Only Contact Verification Storage (IndexedDB / localStorage)     │
└─────────────────────────────────────┬─────────────────────────────────────┘
                                      │
                                      ▼
┌───────────────────────────────────────────────────────────────────────────┐
│                 LAYER 3: CUSTOM GESTURE REVEAL (PHASE 6)                  │
│  - Local 8-second temporary plaintext reveal authorization                │
│  - Automatic Re-Protection (8s timer, tab hide, window blur, nav, logout) │
└─────────────────────────────────────┬─────────────────────────────────────┘
                                      │
                                      ▼
┌───────────────────────────────────────────────────────────────────────────┐
│             LAYER 2: PROTECTED MESSAGE RENDERING (PHASE 5)                │
│  - Protected Homoglyph Rendering on screen by default                     │
└─────────────────────────────────────┬─────────────────────────────────────┘
                                      │
                                      ▼
┌───────────────────────────────────────────────────────────────────────────┐
│               LAYER 1: END-TO-END ENCRYPTION (PHASE 7 & 8)                │
│  - Web Crypto ECDH (P-256) Identity Key Agreement                         │
│  - HKDF-SHA-256 Symmetric Conversation Key Derivation                     │
│  - AES-256-GCM Authenticated Encryption with 128-bit Tag & AAD            │
│  - Protocol Downgrade & Replay Protections                                │
│  - Zero Plaintext on Server (PostgreSQL stores ciphertext envelopes only) │
└─────────────────────────────────────┬─────────────────────────────────────┘
                                      │
                                      ▼
┌───────────────────────────────────────────────────────────────────────────┐
│                 TRANSPORT & AUTHORITATIVE SERVER INFRASTRUCTURE           │
│  - Session-based authentication & bcrypt password hashing (Phase 2)       │
│  - 1-to-1 conversation engine with deterministic pair keys (Phase 3)      │
│  - Real-Time WebSocket transport & PostgreSQL persistence (Phase 4)       │
│  - Public Key Infrastructure & Device Trust Management (Phases 7 & 8)     │
│  - HTTP Security Headers: CSP, HSTS, X-Content-Type-Options, Referrer     │
└───────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Monorepo Topology & Package Architecture

The codebase is organized as an npm workspaces monorepo with strict package boundaries:

```text
enctxt/
├── shared/                     # @enctxt/shared: Universal TypeScript types and DTOs
│   └── src/types/
│       ├── api.ts              # API error models & generic responses
│       ├── auth.ts             # Auth inputs, responses, session contracts
│       ├── user.ts             # User profiles, search summaries
│       ├── conversation.ts     # Conversation structures, participants
│       ├── message.ts          # Encrypted message models, delivery statuses
│       ├── websocket.ts        # WebSocket client/server frame protocols
│       └── crypto.ts           # Encrypted envelopes, PKI DTOs, verification & device types
│
├── server/                     # @enctxt/server: Node.js + Express + Prisma + WebSocket
│   ├── src/
│   │   ├── config/             # Zod-validated environment variables
│   │   ├── controllers/        # Express HTTP route controllers (Auth, User, Conv, Message, Crypto, Device)
│   │   ├── middleware/         # Auth, rate limiting, error handling, logging, securityHeaders
│   │   ├── routes/             # REST route declarations (/api/auth, /api/users, /api/conversations, /api/crypto, /api/devices)
│   │   ├── services/           # Business logic, DB operations, WebSocket server, Crypto PKI, DeviceService
│   │   └── utils/              # Crypto, JWT, Zod schemas, structured logger
│   ├── prisma/                 # Prisma PostgreSQL schema (User, PublicKey, Device, Session, Conversation, Message)
│   └── test/                   # Vitest automated server integration tests (Auth, Conv, Message, WS, Crypto, Device, SecurityHeaders)
│
└── client/                     # @enctxt/client: React 18 + Vite + Tailwind CSS
    ├── src/
    │   ├── auth/               # AuthContext, session hooks, ProtectedRoute
    │   ├── components/         # UI components (Gesture, Messages, Security, Layout)
    │   ├── crypto/             # Web Crypto keyManager, keyExchange, encryption, decryption, fingerprint, safetyNumber, verificationStorage
    │   ├── hooks/              # useMessages (E2EE), useContactSecurity, useGesture, useMessageReveal
    │   ├── pages/              # Landing, Login, Register, Dashboard, ConversationPage
    │   ├── services/           # REST api client, WebSocket client manager
    │   └── utils/              # protectMessage, gesture normalization & recognizer
    └── test/                   # Vitest unit and privacy test suites (protectMessage, gesture, sequence, crypto, verification)
```

---

## 3. Database Architecture & PostgreSQL Schema

Data persistence is managed through Prisma ORM targeting PostgreSQL.

```mermaid
erDiagram
    User ||--o{ PublicKey : "publishes"
    User ||--o{ Device : "owns"
    User ||--o{ Session : "has many"
    User ||--o{ ConversationMember : "participates in"
    User ||--o{ Message : "sends"
    Conversation ||--o{ ConversationMember : "contains"
    Conversation ||--o{ Message : "contains"

    User {
        string id PK "UUID"
        string username UK "lowercase alphanumeric"
        string email UK "lowercase"
        string passwordHash "bcrypt 12 rounds"
        string displayName "1-50 chars"
        datetime createdAt
        datetime updatedAt
    }

    PublicKey {
        string id PK "UUID"
        string userId FK "unique"
        string keyId UK "k_..."
        string publicKey "Base64 SPKI"
        string algorithm "ECDH-P256"
        string status "active | revoked | superseded"
        datetime createdAt
        datetime updatedAt
    }

    Device {
        string id PK "UUID"
        string userId FK
        string deviceName "e.g. Chrome on Windows"
        string platform "web | mobile"
        string keyId "k_..."
        string status "active | revoked"
        datetime lastSeenAt
        datetime createdAt
        datetime updatedAt
    }

    Session {
        string id PK "UUID"
        string userId FK
        string tokenHash UK "SHA-256 hex"
        datetime expiresAt
        datetime createdAt
    }

    Conversation {
        string id PK "UUID"
        string directKey UK "sorted user IDs [A, B]"
        datetime createdAt
        datetime updatedAt
    }

    ConversationMember {
        string id PK "UUID"
        string conversationId FK
        string userId FK
        datetime joinedAt
    }

    Message {
        string id PK "UUID"
        string conversationId FK
        string senderId FK
        string ciphertext "Base64 ciphertext + tag"
        string nonce "Base64 12-byte IV"
        string senderKeyId "k_..."
        string recipientKeyId "k_..."
        string algorithm "AES-256-GCM"
        int version "1"
        string aad "Base64 AAD binding"
        datetime createdAt
        datetime updatedAt
    }
```

---

## 4. Subsystem Specifications

### 4.1. Identity Verification & Safety Numbers — Layer 4 (Phase 8)
- **Public Key Fingerprint**: Deterministic SHA-256 hash of canonical SPKI bytes formatted in 8 groups of 4 hex characters (`A7D4 92F1 8C20 4E73 19AB 63D0 7F2A 91CC`).
- **Symmetric Safety Numbers**:
  - Derived from $\text{SHA-256}(\min(K_A, K_B) + ":" + \max(K_A, K_B) + ":\text{v" + version + "})$.
  - Formatted into four 5-digit decimal blocks (`48321 72904 18273 66421`).
  - Symmetric for both participants.
- **Key Change Detection**:
  - Local verification records store `{ userId, keyId, fingerprint, verifiedAt }`.
  - When peer key ID changes, verification state automatically flips to `'key_changed'`.
  - Prominent in-app warning banner prevents silent public-key substitution.
  - Re-verifying binds to the new key ID.

### 4.2. Device Identity & Session Management — Phase 8
- **Device Registration & Listing**: `GET /api/devices`, `POST /api/devices/register`.
- **Device Revocation**: `POST /api/devices/:id/revoke` with strict user ownership checks (`403 Forbidden` for unauthorized attempts).
- **Session vs. Device Separation**: Session expiration does not destroy long-term device identity.

### 4.3. End-to-End Encryption — Layer 1 (Phases 7 & 8)
- **Primitives**: Web Crypto `ECDH P-256`, `HKDF-SHA-256`, `AES-256-GCM` (128-bit tag), 96-bit random CSPRNG IVs, AAD context binding.
- **Downgrade Defense**: Strict algorithm allowlist. Rejects unapproved algorithms (`AES-128`, `PLAINTEXT`) and unsupported protocol versions.
- **Replay Protection**: Client message deduplication by unique `messageId`.

### 4.4. Visual Privacy Engine & Gesture Reveals — Layers 2 & 3 (Phases 5 & 6)
- **Homoglyph Protection (`protectMessage`)**: Lookalike replacement on screen by default.
- **Custom Gesture Recognition**: 64-point resampled geometric normalizer, Euclidean distance classifier, 8s reveal timer, auto re-protection, 5-strike lockout.

---

## 5. Security & Privacy Audit Matrix

| Security / Privacy Control | Implementation | Verification Status |
|---|---|---|
| **Identity Verification** | SHA-256 fingerprint & symmetric safety numbers | Verified (8/8 verification tests) |
| **Key-Change Detection** | Local verification binding to exact keyId | Verified |
| **Algorithm Downgrade Defense** | Strict allowlist for v1/AES-GCM/ECDH | Verified |
| **Device Trust & Revocation** | Authorized device listing & revoke endpoints | Verified (5/5 device tests) |
| **HTTP Security Headers** | CSP, HSTS, X-Content-Type-Options, Referrer, Permissions | Verified (5/5 header tests) |
| **E2EE Message Confidentiality** | Client-side AES-256-GCM + ECDH P-256 | Verified (14/14 crypto tests) |
| **Server Plaintext Isolation** | Ciphertext-only in DB, REST, WebSockets, and logs | Verified (13/13 message tests, 8/8 WS tests) |
| **Visual Message Protection** | Deterministic homoglyphs by default | Verified (17/17 protectMessage tests) |
| **Gesture Authorization** | Local-only browser storage (`localStorage`) | Verified (22/22 gesture tests) |

---

## 6. Architecture Evolution & Changelog

| Phase | Title | Major Architectural Additions |
|---|---|---|
| **Phase 1** | Project Foundation | Monorepo structure, Express API, Prisma integration, Tailwind CSS, health check |
| **Phase 2** | Authentication & User Identity | `User` and `Session` models, bcrypt hashing, JWT cookies, rate limiting, user search |
| **Phase 3** | 1-to-1 Conversations | `Conversation` and `ConversationMember` models, direct pair keys, membership authorization |
| **Phase 4** | Real-Time Messaging | `Message` model, cursor pagination, WebSocket server `/ws`, multi-session routing, live chat UI |
| **Phase 5** | Protected Message Rendering | Visual privacy engine (`protectMessage`), `<ProtectedMessage>` component, zero visual plaintext |
| **Phase 6** | Custom Gesture Reveal System | Geometric normalization (64-point resample), Euclidean recognizer, `GestureCanvas`, local storage, 8s reveal timer, auto re-protection, 5-strike lockout |
| **Phase 7** | End-to-End Encryption (Layer 1) | Web Crypto ECDH (P-256) identity keys, HKDF-SHA-256 conversation keys, AES-256-GCM AEAD encryption with AAD, `PublicKey` model & distribution API, encrypted message envelopes, zero plaintext on server |
| **Phase 8** | Security Hardening & Trust | Public key fingerprints, symmetric safety numbers, key-change detection and warnings, device trust and revocation API, protocol downgrade and replay protection, HTTP security headers (CSP, HSTS) |

---

*This document is maintained as the authoritative architectural record for the enctxt codebase.*

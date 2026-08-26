# enctxt (Private Chat)

A privacy-focused text communication platform designed with visual privacy, custom gesture-based reveals, and end-to-end cryptographic security architecture.

---

## Current Status: Phase 8 — Security Hardening, Key Verification & Device Trust (Complete)

Phase 8 introduces cryptographic identity verification, public-key fingerprints, symmetric safety numbers, key-change warnings, device trust and revocation management, and HTTP security headers to protect against server-side key substitution attacks, protocol downgrades, and replay attempts.

> [!NOTE]
> **4-Layer Defense-in-Depth Privacy Model**:
> - **Layer 4 — Identity Verification**: Users compare symmetric safety numbers (`48321 72904 18273 66421`) and key fingerprints (`A7D4 92F1 8C20 4E73...`) to verify whom they are communicating with. Key changes trigger in-app warnings and invalidate verification.
> - **Layer 3 — Gesture Reveal Authorization**: Custom multi-stroke geometric gestures grant 8-second temporary plaintext reveals.
> - **Layer 2 — Protected Message Rendering**: Messages appear as deterministic visual homoglyphs on screen by default (`protectMessage`).
> - **Layer 1 — End-to-End Encryption (E2EE)**: Messages are encrypted locally on client devices via Web Crypto (`ECDH P-256`, `HKDF-SHA-256`, `AES-256-GCM`). Zero plaintext on the server.

### Core Architecture

```text
┌───────────────────────────────────────────────────────────────────────────┐
│                                Web Client                                 │
│                                                                           │
│  [Identity Verification] ──> Safety Number / Fingerprint ──> Local State  │
│                                                                           │
│  Plaintext ──> [encryptMessage] ──> [EncryptedMessageEnvelope]            │
│                       ▲                                                   │
│                       │                                                   │
│            [ECDH P-256 + HKDF] (from local IndexedDB keys)                │
│                                                                           │
│  [decryptMessage] ──> Plaintext in memory ──> <ProtectedMessage />        │
└─────────────────────┬───────────────────────────────┬─────────────────────┘
                      │ HTTP REST (Cookie + CSP)      │ WebSocket (/ws)
                      ▼                               ▼
┌───────────────────────────────────────────────────────────────────────────┐
│                           Node.js + Express API                           │
│  (Ciphertext Routing, PKI Public Key API, Device Trust, Auth & Limiting)  │
└─────────────────────┬───────────────────────────────┬─────────────────────┘
                      │                               │
                      ▼                               ▼
┌───────────────────────────────────────────────────────────────────────────┐
│            Services (AuthService, UserService, MessageService, Device)    │
│                       (Ciphertext Envelopes Only)                         │
└─────────────────────────────────┬─────────────────────────────────────────┘
                                  │
                                  ▼
┌───────────────────────────────────────────────────────────────────────────┐
│                              Prisma ORM                                   │
│    (User, PublicKey, Device, Session, Conversation, Member, Message)      │
└─────────────────────────────────┬─────────────────────────────────────────┘
                                  │
                                  ▼
┌───────────────────────────────────────────────────────────────────────────┐
│                              PostgreSQL                                   │
│                       (Stores Ciphertext Only)                            │
└───────────────────────────────────────────────────────────────────────────┘
```

---

## Architectural Principles

1. **Multi-Layered Privacy Architecture**:
   - **Layer 1 — Cryptographic Security**: End-to-end encryption with Web Crypto `ECDH P-256`, `HKDF-SHA-256`, and `AES-256-GCM` with 128-bit authentication tags and AAD context binding.
   - **Layer 2 — Visual Privacy**: Protected homoglyph display on screen (`protectMessage`).
   - **Layer 3 — Gesture Reveal Authorization**: Custom gesture recognition (64-point resample) for temporary 8-second plaintext visibility.
   - **Layer 4 — Identity Verification**: Cryptographic key fingerprints and symmetric safety numbers to verify identity and detect key substitution.
2. **Device Trust & Session Independence**:
   - Long-term cryptographic device identities are separated from temporary authentication sessions.
   - Device revocation API (`POST /api/devices/:id/revoke`) allows users to revoke untrusted devices.
3. **Defense-in-Depth HTTP Hardening**:
   - `Content-Security-Policy`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`.

---

## API Endpoints

### System & Health

| Method | Endpoint | Description | Auth Required |
|---|---|---|---|
| `GET` | `/api/health` | System and database connectivity health check | No |

### Authentication

| Method | Endpoint | Description | Auth Required |
|---|---|---|---|
| `POST` | `/api/auth/register` | Register account, establish session cookie | No (Rate Limited) |
| `POST` | `/api/auth/login` | Authenticate with username/email & password | No (Rate Limited) |
| `GET` | `/api/auth/me` | Retrieve current authenticated user session | No |
| `POST` | `/api/auth/logout` | Invalidate active session & clear cookie | No |

### Users & Profiles

| Method | Endpoint | Description | Auth Required |
|---|---|---|---|
| `GET` | `/api/users/me` | Get full user profile | Yes |
| `PATCH` | `/api/users/me` | Update display name and/or username | Yes |
| `GET` | `/api/users/search?q=<query>` | Search registered users by username/name | Yes |

### Public Key Infrastructure (PKI)

| Method | Endpoint | Description | Auth Required |
|---|---|---|---|
| `POST` | `/api/crypto/identity` | Publish or rotate user's ECDH public identity key | Yes |
| `GET` | `/api/crypto/users/:userId/key` | Retrieve public key for target user | Yes |

### Device Management

| Method | Endpoint | Description | Auth Required |
|---|---|---|---|
| `GET` | `/api/devices` | List authenticated user's registered devices | Yes |
| `POST` | `/api/devices/register` | Register a new device identity | Yes |
| `POST` | `/api/devices/:id/revoke` | Revoke an existing device (owner only) | Yes |

### 1-to-1 Conversations

| Method | Endpoint | Description | Auth Required |
|---|---|---|---|
| `POST` | `/api/conversations` | Create or fetch existing 1-to-1 conversation | Yes |
| `GET` | `/api/conversations` | List all active conversations for current user | Yes |
| `GET` | `/api/conversations/:id` | Get conversation details (participant-only) | Yes |

### Encrypted Messaging (E2EE)

| Method | Endpoint | Description | Auth Required |
|---|---|---|---|
| `POST` | `/api/conversations/:id/messages` | Send encrypted envelope (persists ciphertext in PostgreSQL, emits WS event) | Yes |
| `GET` | `/api/conversations/:id/messages` | Retrieve encrypted message history with cursor pagination | Yes |
| `POST` | `/api/conversations/:id/read` | Mark conversation read & emit read receipt | Yes |

---

## Testing & Quality Assurance

```bash
# Run automated test suites across all workspaces (132 tests: 71 backend + 61 frontend)
npm test

# Run TypeScript typechecks across all workspaces
npm run typecheck

# Production builds for all workspaces
npm run build
```

---

## Roadmap

- [x] **Phase 1 — Project Foundation** (Complete)
- [x] **Phase 2 — Authentication & User Identity** (Complete)
- [x] **Phase 3 — 1-to-1 Conversation System** (Complete)
- [x] **Phase 4 — Real-Time Messaging** (Complete)
- [x] **Phase 5 — Visual Privacy Engine & Protected Rendering (Layer 2)** (Complete)
- [x] **Phase 6 — Custom Gesture Sequence & Reveal Authorization (Layer 3)** (Complete)
- [x] **Phase 7 — End-to-End Encryption Architecture (Layer 1)** (Complete)
- [x] **Phase 8 — Security Hardening, Key Verification & Device Trust (Layer 4)** (Complete)
- [ ] **Phase 9 — Multi-Client & Mobile Support (Web & Android)**

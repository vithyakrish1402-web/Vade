# enctxt (Private Chat)

A privacy-focused text communication platform designed with visual privacy, custom gesture-based reveals, and end-to-end cryptographic security architecture.

---

## Current Status: Phase 7 — End-to-End Encryption (Complete)

Phase 7 introduces genuine client-side End-to-End Encryption (Layer 1 Security) using native Web Crypto API standards (`ECDH P-256` identity key agreement + `HKDF-SHA-256` key derivation + `AES-256-GCM` authenticated encryption). The server functions as an untrusted ciphertext storage and routing intermediary with **zero access to message plaintext**.

> [!NOTE]
> **Multi-Layered Privacy Architecture**:
> - **Layer 1 — Cryptographic Security (E2EE)**: Messages are encrypted locally on the sender's device before network dispatch. PostgreSQL and WebSocket frames transport and persist ciphertext envelopes only.
> - **Layer 2 — Visual Privacy Engine**: Decrypted plaintexts exist exclusively in transient client memory and are rendered with visual homoglyphs by default (`protectMessage`), revealed only temporarily via custom gesture sequences (Phase 6).
> - **Zero Plaintext on Server**: The server has no private keys, never decrypts messages, and redacts all cryptographic identifiers and ciphertext from logs.

### Core Architecture

```text
┌───────────────────────────────────────────────────────────────────────────┐
│                                Web Client                                 │
│                                                                           │
│  Plaintext ──> [encryptMessage] ──> [EncryptedMessageEnvelope]            │
│                       ▲                                                   │
│                       │                                                   │
│            [ECDH P-256 + HKDF] (from local IndexedDB keys)                │
│                                                                           │
│  [decryptMessage] ──> Plaintext in memory ──> <ProtectedMessage />        │
└─────────────────────┬───────────────────────────────┬─────────────────────┘
                      │ HTTP REST (Cookie)            │ WebSocket (/ws)
                      ▼                               ▼
┌───────────────────────────────────────────────────────────────────────────┐
│                           Node.js + Express API                           │
│     (Ciphertext Routing, PKI Public Key API, Auth & Rate Limiting)        │
└─────────────────────┬───────────────────────────────┬─────────────────────┘
                      │                               │
                      ▼                               ▼
┌───────────────────────────────────────────────────────────────────────────┐
│            Services (AuthService, UserService, MessageService, Crypto)    │
│                       (Ciphertext Envelopes Only)                         │
└─────────────────────────────────┬─────────────────────────────────────────┘
                                  │
                                  ▼
┌───────────────────────────────────────────────────────────────────────────┐
│                              Prisma ORM                                   │
│       (User, PublicKey, Session, Conversation, Member, Message)           │
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
   - **Layer 2 — Visual Privacy**: Protected homoglyph display on screen (`protectMessage`) + custom gesture-based temporary reveals (Phase 6).
2. **Deterministic Geometric Normalization**:
   - Equidistant arc-length resampling ($N = 64$ points), centroid translation to $(0, 0)$, $100 \times 100$ bounding box scaling, stroke direction preservation.
3. **Resilient Local Security**:
   - 5-strike failed attempt lockout (30-second cooldown timer).
   - Auto re-protection on timer expiry (8s), tab switch, focus loss, conversation navigation, or user logout.
   - Zero gesture transmission: gesture data is strictly local to the client device.
   - Zero private key leakage: private keys stored in client `IndexedDB` and never sent over the network.

---

## Repository Structure

```text
enctxt/
│
├── client/                     # React + Vite + Tailwind CSS frontend
│   ├── src/
│   │   ├── auth/               # AuthContext & ProtectedRoute
│   │   ├── components/         # Navbar, ConnectionStatus, Layout
│   │   │   ├── gesture/        # GestureCanvas, GestureSequenceSetup, GestureRevealModal, GestureSettings
│   │   │   └── messages/       # ProtectedMessage
│   │   ├── crypto/             # Web Crypto keyManager, keyExchange, encryption, decryption, cryptoStorage
│   │   ├── pages/              # LandingPage, LoginPage, RegisterPage, DashboardPage, ConversationPage
│   │   ├── hooks/              # useHealthCheck, useConversations, useMessages, useGesture, useMessageReveal
│   │   ├── services/           # api, authService, userService, conversationService, messageService, websocket
│   │   ├── utils/              # protectMessage, gestureNormalize, gestureRecognizer, gestureStorage
│   │   ├── types/              # Client type definitions
│   │   ├── App.tsx             # Root routing with protected routes
│   │   ├── main.tsx            # DOM entrypoint
│   │   └── index.css           # Tailwind directives and theme
│   ├── test/                   # Client unit test suites (protectMessage, gesture, gestureSequence, crypto)
│   ├── package.json
│   ├── tsconfig.json
│   └── vite.config.ts
│
├── server/                     # Node.js + Express + Prisma + WebSocket backend
│   ├── src/
│   │   ├── config/             # Validated env configuration with Zod
│   │   ├── controllers/        # authController, userController, conversationController, messageController, cryptoController, healthController
│   │   ├── middleware/         # authMiddleware, rateLimiter, errorHandler, requestLogger
│   │   ├── routes/             # authRoutes, userRoutes, conversationRoutes, cryptoRoutes, healthRoutes
│   │   ├── services/           # authService, userService, conversationService, messageService, cryptoService, websocket, db
│   │   ├── utils/              # crypto, jwt, validation, errors, logger
│   │   ├── app.ts              # Express application setup
│   │   └── server.ts           # Server bootstrap & WebSocket binding
│   ├── prisma/
│   │   └── schema.prisma       # User, PublicKey, Session, Conversation, Member, Message models
│   ├── test/                   # Server test suite (auth, conversation, message, websocket, crypto)
│   ├── package.json
│   └── tsconfig.json
│
├── shared/                     # Shared TypeScript types
│   ├── src/
│   │   ├── types/              # Health, User, Auth, Conversation, Message, WebSocket, Crypto types
│   │   └── index.ts
│   ├── package.json
│   └── tsconfig.json
│
├── ARCHITECTURE.md             # System architecture & technical specification
├── CRYPTO_DESIGN.md            # Cryptographic design & threat model specification
├── .env.example                # Template environment variables
├── .gitignore                  # Git ignore rules
├── package.json                # Root monorepo workspace configuration
└── README.md                   # Project documentation
```

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
# Run automated test suites across all workspaces (113 tests: 60 backend + 53 frontend)
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
- [x] **Phase 6 — Custom Gesture Sequence & Reveal Authorization (Layer 2)** (Complete)
- [x] **Phase 7 — End-to-End Encryption Architecture (Layer 1)** (Complete)
- [ ] **Phase 8 — Multi-Client & Mobile Support (Web & Android)**

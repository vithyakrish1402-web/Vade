# enctxt (Private Chat)

A privacy-focused text communication platform designed with visual privacy, custom gesture-based reveals, and end-to-end cryptographic security architecture.

---

## Current Status: Phase 6 — Custom Gesture Reveal System (Complete)

Phase 6 establishes the client-side gesture-based reveal authorization system (Layer 2 Visual Privacy). Users can define private, multi-step unistroke gesture sequences stored strictly on their local device to temporarily reveal individual protected messages in the chat interface.

> [!NOTE]
> **Security & Privacy Architecture**:
> - **Local Reveal Authorization (Layer 2)**: The gesture sequence is a local display authorization mechanism. It is **NOT** a password, **NOT** an encryption key, and **NOT** End-to-End Encryption.
> - **Strictly Local Storage**: Raw gesture points, normalized templates, and similarity scores are kept in browser local storage (`localStorage`) and are **never** transmitted to the server or over WebSockets.
> - **Automatic Re-Protection**: Revealed messages automatically return to protected mode after an 8-second countdown timer, or immediately upon tab hide (`document.visibilityState`), window blur, navigation, or logout.
> - **End-to-End Encryption (Layer 1)**: Cryptographic transport and database confidentiality are scheduled for Phase 7.

### Core Architecture

```text
┌───────────────────────────────────────────────────────────────────────────┐
│                                Web Client                                 │
│                                                                           │
│  [GestureCanvas] ──> [normalizeGesture] ──> [isGestureMatch]              │
│                              │                      │                     │
│                              ▼                      ▼                     │
│                    [localStorage (v1)]     [useMessageReveal]             │
│                                                     │                     │
│                                                     ▼                     │
│  (useMessages) ──> <ProtectedMessage displayMode={isRevealed ? 'revealed' │
│                                                              : 'protected'}>
└─────────────────────┬───────────────────────────────┬─────────────────────┘
                      │ HTTP REST (Cookie)            │ WebSocket (/ws)
                      ▼                               ▼
┌───────────────────────────────────────────────────────────────────────────┐
│                           Node.js + Express API                           │
│           (Auth Middleware / Upgrade Auth → WebSocketService)             │
└─────────────────────┬───────────────────────────────┬─────────────────────┘
                      │                               │
                      ▼                               ▼
┌───────────────────────────────────────────────────────────────────────────┐
│            Services (AuthService, UserService, MessageService)            │
│                       (bcryptjs + JWT + ws)                               │
└─────────────────────────────────┬─────────────────────────────────────────┘
                                  │
                                  ▼
┌───────────────────────────────────────────────────────────────────────────┐
│                              Prisma ORM                                   │
│              (User, Session, Conversation, Member, Message)               │
└─────────────────────────────────┬─────────────────────────────────────────┘
                                  │
                                  ▼
┌───────────────────────────────────────────────────────────────────────────┐
│                              PostgreSQL                                   │
└───────────────────────────────────────────────────────────────────────────┘
```

---

## Architectural Principles

1. **Multi-Layered Privacy Architecture**:
   - **Layer 1 — Cryptographic Security**: End-to-end encryption across the wire (Phase 7).
   - **Layer 2 — Visual Privacy**: Protected homoglyph display on screen (Phase 5) + custom gesture-based temporary reveals (Phase 6).
2. **Deterministic Geometric Normalization**:
   - Equidistant arc-length resampling ($N = 64$ points).
   - Centroid translation to origin $(0, 0)$ (translation invariance).
   - Bounding box proportional scaling ($100 \times 100$) (scale invariance).
   - Preserves stroke direction and rejects tiny tap noise ($< 30\text{px}$).
3. **Resilient Local Security**:
   - 5-strike failed attempt lockout (30-second cooldown timer).
   - Auto re-protection on timer expiry (8s), tab switch, focus loss, conversation navigation, or user logout.
   - Zero gesture transmission: gesture data is strictly local to the client device.
   - Authoritative server security for authentication, conversations, and messaging.

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
│   │   ├── pages/              # LandingPage, LoginPage, RegisterPage, DashboardPage, ConversationPage
│   │   ├── hooks/              # useHealthCheck, useConversations, useMessages, useGesture, useMessageReveal
│   │   ├── services/           # api, authService, userService, conversationService, messageService, websocket
│   │   ├── utils/              # protectMessage, gestureNormalize, gestureRecognizer, gestureStorage
│   │   ├── types/              # Client type definitions
│   │   ├── App.tsx             # Root routing with protected routes
│   │   ├── main.tsx            # DOM entrypoint
│   │   └── index.css           # Tailwind directives and theme
│   ├── test/                   # Client unit test suites (protectMessage, gesture, gestureSequence)
│   ├── package.json
│   ├── tsconfig.json
│   └── vite.config.ts
│
├── server/                     # Node.js + Express + Prisma + WebSocket backend
│   ├── src/
│   │   ├── config/             # Validated env configuration with Zod
│   │   ├── controllers/        # authController, userController, conversationController, messageController, healthController
│   │   ├── middleware/         # authMiddleware, rateLimiter, errorHandler, requestLogger
│   │   ├── routes/             # authRoutes, userRoutes, conversationRoutes, healthRoutes
│   │   ├── services/           # authService, userService, conversationService, messageService, websocket, db
│   │   ├── utils/              # crypto, jwt, validation, errors, logger
│   │   ├── app.ts              # Express application setup
│   │   └── server.ts           # Server bootstrap & WebSocket binding
│   ├── prisma/
│   │   └── schema.prisma       # User, Session, Conversation, Member, Message models
│   ├── test/                   # Server test suite (auth, conversation, message, websocket)
│   ├── package.json
│   └── tsconfig.json
│
├── shared/                     # Shared TypeScript types
│   ├── src/
│   │   ├── types/              # Health, User, Auth, Conversation, Message, WebSocket types
│   │   └── index.ts
│   ├── package.json
│   └── tsconfig.json
│
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

### 1-to-1 Conversations

| Method | Endpoint | Description | Auth Required |
|---|---|---|---|
| `POST` | `/api/conversations` | Create or fetch existing 1-to-1 conversation | Yes |
| `GET` | `/api/conversations` | List all active conversations for current user | Yes |
| `GET` | `/api/conversations/:id` | Get conversation details (participant-only) | Yes |

### Real-Time Messaging

| Method | Endpoint | Description | Auth Required |
|---|---|---|---|
| `POST` | `/api/conversations/:id/messages` | Send message (persists in PostgreSQL, emits WS event) | Yes |
| `GET` | `/api/conversations/:id/messages` | Retrieve conversation history with cursor pagination | Yes |
| `POST` | `/api/conversations/:id/read` | Mark conversation read & emit read receipt | Yes |

---

## Testing & Quality Assurance

```bash
# Run automated test suites across all workspaces (94 tests: 55 backend + 39 frontend)
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
- [ ] **Phase 7 — End-to-End Encryption Architecture (Layer 1)**
- [ ] **Phase 8 — Multi-Client & Mobile Support (Web & Android)**

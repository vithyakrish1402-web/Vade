# enctxt (Private Chat)

A privacy-focused text communication platform designed with visual privacy, gesture-based reveal, and end-to-end cryptographic security architecture.

---

## Current Status: Phase 4 — Real-Time Messaging (Complete)

Phase 4 establishes real-time message exchange, PostgreSQL persistence with Prisma, cursor-based pagination, WebSocket synchronization with cookie authentication, multi-session delivery, and live chat UI with delivery/read states.

> [!NOTE]
> **Temporary Plaintext Development Implementation**: Messages are transported and stored in plaintext during Phase 4 as the base messaging foundation. End-to-end encryption (Layer 1) is scheduled for Phase 7, and visual protection/gesture reveals (Layer 2) are scheduled for Phases 5 and 6.

### Core Architecture

```text
┌───────────────────────────────────────────────────────────┐
│                        Web Client                         │
│   (React + useMessages + messageService + wsClient)       │
└───────────────┬───────────────────────────┬───────────────┘
                │ HTTP REST (Cookie)        │ WebSocket (/ws)
                ▼                           ▼
┌───────────────────────────────────────────────────────────┐
│                   Node.js + Express API                   │
│   (Auth Middleware / Upgrade Auth → WebSocketService)     │
└───────────────┬───────────────────────────┬───────────────┘
                │                           │
                ▼                           ▼
┌───────────────────────────────────────────────────────────┐
│     Services (AuthService, UserService, MessageService)   │
│                 (bcryptjs + JWT + ws)                     │
└───────────────────────────┬───────────────────────────────┘
                            │
                            ▼
┌───────────────────────────────────────────────────────────┐
│                        Prisma ORM                         │
│        (User, Session, Conversation, Member, Message)     │
└───────────────────────────┬───────────────────────────────┘
                            │
                            ▼
┌───────────────────────────────────────────────────────────┐
│                        PostgreSQL                         │
└───────────────────────────────────────────────────────────┘
```

---

## Architectural Principles

1. **Separation of Concerns**: UI components, REST APIs, WebSocket real-time transport, database services, and security layers are strictly decoupled.
2. **Authoritative Server Security**:
   - Sender identity is always derived from authenticated sessions (`req.user.id`).
   - Conversation membership is verified on every REST endpoint and WebSocket subscription.
   - Cross-tenant access is rejected with `403 Forbidden`.
   - Passwords are encrypted using one-way `bcrypt` hashing (12 salt rounds).
   - Message contents are **never** logged in server logs or error dumps.
3. **Multi-Session & Resilient Delivery**:
   - Supports multiple active client connections per user (e.g. multiple browser tabs).
   - Automatic WebSocket reconnection with exponential backoff and message deduplication.
   - Historical REST sync upon reconnect ensures no missed messages during network interruptions.

---

## Repository Structure

```text
enctxt/
│
├── client/                     # React + Vite + Tailwind CSS frontend
│   ├── src/
│   │   ├── auth/               # AuthContext & ProtectedRoute
│   │   ├── components/         # Navbar, ConnectionStatus, Layout
│   │   ├── pages/              # LandingPage, LoginPage, RegisterPage, DashboardPage, ConversationPage
│   │   ├── hooks/              # useHealthCheck, useConversations, useMessages
│   │   ├── services/           # api, authService, userService, conversationService, messageService, websocket
│   │   ├── types/              # Client type definitions
│   │   ├── App.tsx             # Root routing with protected routes
│   │   ├── main.tsx            # DOM entrypoint
│   │   └── index.css           # Tailwind directives and theme
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
│   ├── test/                   # Comprehensive Vitest test suite (auth, conversation, message, websocket)
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

## API Endpoints (Phase 4)

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

### WebSocket Real-Time Channel (`/ws`)

| Event Type | Direction | Payload Description |
|---|---|---|
| `auth` | Client $\to$ Server | Late authentication using session token |
| `subscribe` | Client $\to$ Server | Subscribe to conversation room (verified against membership) |
| `unsubscribe` | Client $\to$ Server | Unsubscribe from conversation room |
| `message.created` | Server $\to$ Client | Real-time message broadcast to conversation members |
| `message.delivered` | Client $\leftrightarrow$ Server | Delivery confirmation to sender |
| `message.read` | Client $\leftrightarrow$ Server | Read receipt acknowledgement to sender |
| `ping` / `pong` | Client $\leftrightarrow$ Server | Connection heartbeat check |

---

## Testing & Quality Assurance

```bash
# Run automated backend test suite (55 tests across Auth, Conversations, Messaging, WebSockets)
npm test

# Run TypeScript typechecks across all workspaces
npm run typecheck

# Production builds for all workspaces
npm run build

# Validate Prisma schema
npm run prisma:validate --workspace=server
```

---

## Roadmap

- [x] **Phase 1 — Project Foundation** (Complete)
- [x] **Phase 2 — Authentication & User Identity** (Complete)
- [x] **Phase 3 — 1-to-1 Conversation System** (Complete)
- [x] **Phase 4 — Real-Time Messaging** (Complete)
- [ ] **Phase 5 — Visual Privacy Engine & Protected Rendering (Layer 2)**
- [ ] **Phase 6 — Custom Gesture Sequence & Reveal Authorization**
- [ ] **Phase 7 — End-to-End Encryption Architecture (Layer 1)**
- [ ] **Phase 8 — Multi-Client & Mobile Support (Web & Android)**

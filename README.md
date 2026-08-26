# enctxt (Private Chat)

A privacy-focused text communication platform designed with visual privacy, gesture-based reveal, and end-to-end cryptographic security architecture.

---

## Current Status: Phase 5 — Protected Message Rendering (Complete)

Phase 5 establishes Layer 2 Visual Privacy via a pure, deterministic, Unicode-safe visual homoglyph transformation utility (`protectMessage`) and `<ProtectedMessage>` component that protects message text from casual shoulder-surfing in the chat interface.

> [!NOTE]
> **Visual Privacy Clarification**:
> - **Visual Protection (Layer 2)**: Prevents casual shoulder-surfing by rendering message content using stylized visual homoglyphs on screen by default.
> - **Plaintext Transport & Storage**: Messages are transported and stored in plaintext in the database/WebSocket layers during Phase 5.
> - **End-to-End Encryption (Layer 1)**: Cryptographic confidentiality is scheduled for Phase 7.
> - **Gesture-Based Reveals**: Interactive gesture drawing and temporary reveal authorization are scheduled for Phase 6.

### Core Architecture

```text
┌───────────────────────────────────────────────────────────┐
│                        Web Client                         │
│   (useMessages ──> <ProtectedMessage> ──> protectMessage) │
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

1. **Multi-Layered Privacy Architecture**:
   - **Layer 1 — Cryptographic Security**: End-to-end encryption across the wire (Phase 7).
   - **Layer 2 — Visual Privacy**: Protected homoglyph display on screen (Phase 5) with gesture-based reveal (Phase 6).
2. **Deterministic & Pure Transformation**:
   - `protectMessage(content)` is a pure, stateless function with zero side effects.
   - Preserves message lengths, word boundaries, numbers, punctuation, spaces, and multiline line breaks.
   - Preserves multi-byte Unicode code points and emojis without surrogate pair corruption.
3. **Authoritative Server Security**:
   - Sender identity is always derived from authenticated sessions (`req.user.id`).
   - Conversation membership is verified on every REST endpoint and WebSocket subscription.
   - Passwords are encrypted using one-way `bcrypt` hashing (12 salt rounds).
   - Zero sensitive logging: message content, passwords, hashes, tokens, and keys are omitted from all logs.

---

## Repository Structure

```text
enctxt/
│
├── client/                     # React + Vite + Tailwind CSS frontend
│   ├── src/
│   │   ├── auth/               # AuthContext & ProtectedRoute
│   │   ├── components/         # Navbar, ConnectionStatus, Layout, messages/ProtectedMessage
│   │   ├── pages/              # LandingPage, LoginPage, RegisterPage, DashboardPage, ConversationPage
│   │   ├── hooks/              # useHealthCheck, useConversations, useMessages
│   │   ├── services/           # api, authService, userService, conversationService, messageService, websocket
│   │   ├── utils/              # protectMessage
│   │   ├── types/              # Client type definitions
│   │   ├── App.tsx             # Root routing with protected routes
│   │   ├── main.tsx            # DOM entrypoint
│   │   └── index.css           # Tailwind directives and theme
│   ├── test/                   # Client unit test suite (protectMessage.test.ts)
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
# Run automated test suites across all workspaces (72 tests: 55 backend + 17 frontend)
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
- [ ] **Phase 6 — Custom Gesture Sequence & Reveal Authorization**
- [ ] **Phase 7 — End-to-End Encryption Architecture (Layer 1)**
- [ ] **Phase 8 — Multi-Client & Mobile Support (Web & Android)**

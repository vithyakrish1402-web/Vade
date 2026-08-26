# enctxt (Private Chat)

A privacy-focused text communication platform designed with visual privacy, gesture-based reveal, and end-to-end cryptographic security architecture.

---

## Current Status: Phase 3 — 1-to-1 Conversation System (Complete)

Phase 3 establishes the 1-to-1 direct conversation architecture, participant membership, deterministic uniqueness, and authorization controls.

### Core Architecture

```text
┌───────────────────────────────────────────────┐
│                  Web Browser                  │
│       (React + Tailwind + AuthContext)        │
└───────────────────────┬───────────────────────┘
                        │ HTTP REST (HttpOnly Cookie)
                        ▼
┌───────────────────────────────────────────────┐
│             Node.js + Express API             │
│   (Rate Limiter → Auth Middleware → Router)   │
└───────────────────────┬───────────────────────┘
                        │
                        ▼
┌───────────────────────────────────────────────┐
│  Services (AuthService, UserService, Conv)    │
│            (bcryptjs + JWT Sessions)          │
└───────────────────────┬───────────────────────┘
                        │
                        ▼
┌───────────────────────────────────────────────┐
│                  Prisma ORM                   │
│   (User, Session, Conversation, Participant)  │
└───────────────────────┬───────────────────────┘
                        │
                        ▼
┌───────────────────────────────────────────────┐
│                  PostgreSQL                   │
└───────────────────────────────────────────────┘
```

---

## Architectural Principles

1. **Separation of Concerns**: UI components, API communication, business services, database access, and security layers are isolated into distinct modules.
2. **Modular Backend**: Request flow follows `Route` $\to$ `Controller` $\to$ `Service` $\to$ `Database` $\to$ `Response`.
3. **Security by Default**:
   - Passwords hashed with `bcrypt` (12 rounds) and never stored or handled in plaintext.
   - Zero password hashes, session tokens, or sensitive credentials leaked in API responses.
   - Structured server logger automatically redacts passwords, tokens, and secrets.
   - Strict participant authorization checks return `403 Forbidden` on unauthorized conversation access.
   - Deterministic 1-to-1 pair keys (`[userA, userB].sort().join(':')`) prevent duplicate or race-condition conversations.
   - Generic authentication errors prevent account enumeration.
   - Sessions secured with `HttpOnly`, `SameSite=lax`, and conditional HTTPS `Secure` cookies.
4. **Shared Type System**: Monorepo structure shares API response and error definitions between frontend and backend.
5. **Multi-Layered Privacy Architecture**:
   - **Layer 1 — Cryptographic Security**: End-to-end encryption across the wire (Phase 5+).
   - **Layer 2 — Visual Privacy**: Protected/gibberish display on screen with gesture-based reveal (Phase 6+).

---

## Repository Structure

```text
enctxt/
│
├── client/                     # React + Vite + Tailwind CSS frontend
│   ├── src/
│   │   ├── auth/               # AuthContext & ProtectedRoute
│   │   ├── components/         # Navbar, ConnectionStatus, Layout
│   │   ├── pages/              # LandingPage, LoginPage, RegisterPage, DashboardPage
│   │   ├── hooks/              # useHealthCheck
│   │   ├── services/           # api, authService, userService, conversationService, healthService
│   │   ├── types/              # Client type definitions
│   │   ├── App.tsx             # Root routing with protected /app route
│   │   ├── main.tsx            # DOM entrypoint
│   │   └── index.css           # Tailwind directives and theme
│   ├── package.json
│   ├── tsconfig.json
│   └── vite.config.ts
│
├── server/                     # Node.js + Express + Prisma backend
│   ├── src/
│   │   ├── config/             # Validated env configuration with Zod
│   │   ├── controllers/        # authController, userController, conversationController, healthController
│   │   ├── middleware/         # authMiddleware, rateLimiter, errorHandler, requestLogger
│   │   ├── routes/             # authRoutes, userRoutes, conversationRoutes, healthRoutes
│   │   ├── services/           # authService, userService, conversationService, db
│   │   ├── utils/              # crypto, jwt, validation, errors, logger
│   │   ├── app.ts              # Express application setup
│   │   └── server.ts           # Server bootstrap & lifecycle
│   ├── prisma/
│   │   └── schema.prisma       # User, Session, Conversation, Participant models
│   ├── test/                   # Comprehensive Vitest test suite (auth.test.ts, conversation.test.ts)
│   ├── package.json
│   └── tsconfig.json
│
├── shared/                     # Shared TypeScript types
│   ├── src/
│   │   ├── types/              # HealthResponse, UserSummary, UserProfile, ConversationSummary, etc.
│   │   └── index.ts
│   ├── package.json
│   └── tsconfig.json
│
├── .env.example                # Template environment variables
├── .gitignore                  # Git ignore rules for node_modules, .env, dist
├── package.json                # Root monorepo workspace configuration
└── README.md                   # Project documentation
```

---

## Prerequisites

- **Node.js**: `v18.0.0` or later (tested on `v20` / `v24`)
- **npm**: `v9.0.0` or later
- **PostgreSQL**: `v14` or later (local instance, Docker container, or hosted service like Neon/Supabase)

---

## Getting Started

### 1. Clone & Install Dependencies

```bash
git clone <repo-url>
cd enctxt

# Install all monorepo dependencies (client, server, shared)
npm install
```

### 2. Configure Environment

Copy the example environment file:

```bash
cp .env.example .env
```

Configure your `.env` variables:

```env
# Server
PORT=5000
NODE_ENV=development
CORS_ORIGIN=http://localhost:5173

# Database (PostgreSQL)
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/enctxt_dev?schema=public"

# Auth / Sessions
JWT_SECRET="replace_with_a_secure_random_32_plus_character_secret_key"
SESSION_COOKIE_NAME="enctxt_session"
SESSION_MAX_AGE_DAYS=7

# Frontend (Vite)
VITE_API_URL=http://localhost:5000/api
```

### 3. Database Setup (Prisma)

Generate the Prisma client:

```bash
npm run prisma:generate
```

Apply database migrations:

```bash
npm run prisma:migrate
```

### 4. Running Development Servers

Run both frontend and backend concurrently:

```bash
# Run both concurrently
npm run dev

# Or run individually:
npm run dev:server    # Backend runs on http://localhost:5000
npm run dev:client    # Frontend runs on http://localhost:5173
```

---

## API Endpoints (Phase 3)

### System & Health

| Method | Endpoint | Description | Auth Required |
|---|---|---|---|
| `GET` | `/api/health` | System and database connectivity health check | No |

### Authentication

| Method | Endpoint | Description | Auth Required |
|---|---|---|---|
| `POST` | `/api/auth/register` | Register account, establish session cookie | No (Rate Limited) |
| `POST` | `/api/auth/login` | Authenticate with username/email & password | No (Rate Limited) |
| `GET` | `/api/auth/me` | Retrieve current authenticated user session | No (Returns null if guest) |
| `POST` | `/api/auth/logout` | Invalidate active session & clear cookie | No |

### Users & Profiles

| Method | Endpoint | Description | Auth Required |
|---|---|---|---|
| `GET` | `/api/users/me` | Get full user profile (email, joined date) | Yes |
| `PATCH` | `/api/users/me` | Update display name and/or username | Yes |
| `GET` | `/api/users/search?q=<query>` | Search registered users by username/name | Yes |

### 1-to-1 Conversations

| Method | Endpoint | Description | Auth Required |
|---|---|---|---|
| `POST` | `/api/conversations` | Create or fetch existing 1-to-1 conversation | Yes |
| `GET` | `/api/conversations` | List all active conversations for current user | Yes |
| `GET` | `/api/conversations/:id` | Get conversation details (participant-only) | Yes |

---

## Testing & Quality Assurance

```bash
# Run automated backend test suite (32 tests covering Auth, Sessions, Profiles, Search, Conversations)
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
- [x] **Phase 3 — 1-to-1 Conversation Architecture** (Complete)
- [ ] **Phase 4 — Actual Messaging & Real-Time Transport**
- [ ] **Phase 5 — End-to-End Encryption (Layer 1 Security)**
- [ ] **Phase 6 — Visual Privacy Engine & Gesture Recognition (Layer 2)**
- [ ] **Phase 7 — Multi-Client Support (Web & Android)**

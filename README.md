# enctxt (Private Chat)

A privacy-focused text communication platform designed with visual privacy, gesture-based reveal, and end-to-end cryptographic security architecture.

---

## Current Status: Phase 1 — Project Foundation

> **Note**: Phase 1 establishes the clean, modular, and testable foundation for the application. No messaging, encryption, or gesture functionality is implemented in this phase.

### Core Architecture

```text
┌───────────────────────────────┐
│          Web Browser          │
└──────────────┬────────────────┘
               │
               ▼
┌───────────────────────────────┐
│      React + TypeScript       │
│           Frontend            │
└──────────────┬────────────────┘
               │ HTTP API
               ▼
┌───────────────────────────────┐
│     Node.js + TypeScript      │
│            Backend            │
└──────────────┬────────────────┘
               │
               ▼
┌───────────────────────────────┐
│          Prisma ORM           │
└──────────────┬────────────────┘
               │
               ▼
┌───────────────────────────────┐
│          PostgreSQL           │
└───────────────────────────────┘
```

---

## Architectural Principles

1. **Separation of Concerns**: UI components, API communication, business services, database access, and security layers are isolated into distinct modules.
2. **Modular Backend**: Request flow follows `Route` $\to$ `Controller` $\to$ `Service` $\to$ `Database` $\to$ `Response`.
3. **Security by Default**: Sensitive parameters (passwords, tokens, encryption keys, gesture data) are automatically redacted in server logs and never leaked in error responses.
4. **Shared Type System**: Monorepo structure shares API response and error definitions between frontend and backend.
5. **Two Distinct Privacy Layers**:
   - **Layer 1 — Cryptographic Security**: End-to-end encryption across the wire (Phase 3+).
   - **Layer 2 — Visual Privacy**: Protected/gibberish display on screen with gesture-based reveal (Phase 4+).

---

## Repository Structure

```text
enctxt/
│
├── client/                     # React + Vite + Tailwind CSS frontend
│   ├── src/
│   │   ├── components/         # Reusable UI components (Navbar, ConnectionStatus, Layout)
│   │   ├── pages/              # Route pages (Landing, Login, Register, AppPlaceholder)
│   │   ├── hooks/              # Custom React hooks (useHealthCheck)
│   │   ├── services/           # API service client and health service
│   │   ├── types/              # Client-specific type definitions
│   │   ├── App.tsx             # Root routing component
│   │   ├── main.tsx            # Application DOM entrypoint
│   │   └── index.css           # Tailwind directives and theme
│   ├── package.json
│   ├── tsconfig.json
│   └── vite.config.ts
│
├── server/                     # Node.js + Express + Prisma backend
│   ├── src/
│   │   ├── config/             # Validated environment configuration (env.ts)
│   │   ├── controllers/        # Route controllers (healthController.ts)
│   │   ├── middleware/         # Error handler, request logger, 404 handler
│   │   ├── routes/             # API routes (/api/health)
│   │   ├── services/           # Business services & Prisma DB client singleton
│   │   ├── utils/              # Structured logger, AppError classes
│   │   ├── app.ts              # Express application setup
│   │   └── server.ts           # Server bootstrap & lifecycle
│   ├── prisma/
│   │   └── schema.prisma       # PostgreSQL Prisma schema
│   ├── package.json
│   └── tsconfig.json
│
├── shared/                     # Shared TypeScript types
│   ├── src/
│   │   ├── types/              # HealthResponse, ApiErrorResponse, ErrorCode
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

# Frontend (Vite)
VITE_API_URL=http://localhost:5000/api
```

### 3. Database Setup (Prisma)

Generate the Prisma client:

```bash
npm run prisma:generate
```

Apply database migrations (when PostgreSQL is active):

```bash
npm run prisma:migrate
```

### 4. Running Development Servers

Run both frontend and backend concurrently:

```bash
# Run both
npm run dev

# Or run individually:
npm run dev:server    # Backend runs on http://localhost:5000
npm run dev:client    # Frontend runs on http://localhost:5173
```

---

## API Endpoints (Phase 1)

### Health Check

```http
GET /api/health
```

**Success Response (`200 OK`)**:

```json
{
  "status": "ok",
  "timestamp": "2026-08-26T04:10:00.000Z",
  "uptime": 12,
  "database": "connected",
  "version": "0.1.0"
}
```

### Error Response Format

All API errors adhere to a standardized JSON schema:

```json
{
  "error": {
    "code": "RESOURCE_NOT_FOUND",
    "message": "Route not found: GET /api/unknown"
  }
}
```

---

## Build and Testing

```bash
# Run TypeScript typechecks across all workspaces
npm run typecheck

# Production build for all workspaces
npm run build

# Validate Prisma schema
npm run prisma:validate --workspace=server
```

---

## Roadmap

- [x] **Phase 1 — Project Foundation** (Current)
- [ ] **Phase 2 — Authentication & User Identity**
- [ ] **Phase 3 — Cryptographic Engine (Layer 1 Security)**
- [ ] **Phase 4 — Visual Privacy Engine & Gesture Recognition (Layer 2)**
- [ ] **Phase 5 — End-to-End Messaging & Real-Time Sync**
- [ ] **Phase 6 — Multi-Client Support (Web & Android)**

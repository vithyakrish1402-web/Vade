# ENCTXT (Private Chat)

A privacy-focused text communication platform designed with visual privacy, custom gesture-based reveals, end-to-end cryptographic security architecture, accessible production UX, and reproducible, secure production deployment infrastructure.

---

## Current Status: Phase 11 — Web Release Candidate, Final Security Audit & Android Readiness (Complete)

Phase 11 freezes the core web architecture, establishes definitive API, WebSocket, and E2EE protocol contracts, provides cross-platform cryptographic test vectors for future Android client integration, validates the complete threat model, and produces **Release Candidate `v1.0.0-rc.1`**.

> [!NOTE]
> **4-Layer Defense-in-Depth Privacy Model**:
> - **Layer 4 — Identity Verification**: Users compare symmetric safety numbers (`48321 72904 18273 66421`) and key fingerprints (`A7D4 92F1 8C20 4E73...`) to verify whom they are communicating with. Key changes trigger in-app warnings and invalidate verification.
> - **Layer 3 — Gesture Reveal Authorization**: Custom multi-stroke geometric gestures grant 8-second temporary plaintext reveals with active countdown UX.
> - **Layer 2 — Protected Message Rendering**: Messages appear as deterministic visual homoglyphs on screen by default (`protectMessage`).
> - **Layer 1 — End-to-End Encryption (E2EE)**: Messages are encrypted locally on client devices via Web Crypto (`ECDH P-256`, `HKDF-SHA-256`, `AES-256-GCM`). Zero plaintext on the server.

---

### Core Architecture & Production Topology

```text
                         Internet (HTTPS / WSS)
                                   │
                                   ▼
                    ┌─────────────────────────────┐
                    │ Reverse Proxy (TLS / HTTPS) │
                    │ Nginx / Caddy (Let's Enc)   │
                    └──────────────┬──────────────┘
                                   │
              ┌────────────────────┴────────────────────┐
              │                                         │
              ▼                                         ▼
    Static React/Vite SPA                     Node.js Express API & WS
    (dist/ - Hashed Assets)                   (http://backend:5000)
    - Zero-Plaintext Previews                 - /api/* (REST API)
    - Protected Message UI                    - /ws (WebSocket WSS)
    - 8s Gesture Reveal                                 │
              │                                         ▼
              │                                    PostgreSQL
              │                             (Ciphertext Envelopes Only)
              │
              ▼
    Client Browser Security
    (WebCrypto P-256 + IndexedDB Keys)
```

---

### Protocol Specifications & Documentation

- [docs/api-contract.md](docs/api-contract.md): Frozen REST API specification (Auth, Users, Conversations, Messages, PKI Crypto, Devices, Health).
- [docs/websocket-protocol.md](docs/websocket-protocol.md): Frozen WebSocket protocol specification (Auth, Room subscriptions, Real-time events, Heartbeat).
- [docs/crypto-protocol.md](docs/crypto-protocol.md): Frozen E2EE Protocol v1 specification (ECDH P-256, HKDF, AES-256-GCM, AAD, Safety numbers).
- [docs/test-vectors/crypto-test-vectors.json](docs/test-vectors/crypto-test-vectors.json): Deterministic cross-platform test fixtures for Android client verification.
- [docs/android-readiness.md](docs/android-readiness.md): Complete Android client implementation requirements, Keystore bindings, and architecture guide.
- [docs/threat-model.md](docs/threat-model.md): Security boundaries, defended threat vectors, and explicit non-protections.
- [docs/deployment.md](docs/deployment.md): Step-by-step production deployment and migration guide.
- [docs/runbook.md](docs/runbook.md): Operational metrics, health alerts, and incident response procedures.
- [docs/disaster-recovery.md](docs/disaster-recovery.md): Database backup strategies (`pg_dump` + AES-256-CBC encryption) and restore verification.

---

## Testing & Quality Assurance

```bash
# Run automated test suites across all workspaces (165 tests: 83 backend + 82 frontend)
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
- [x] **Phase 9 — Production UX, Reliability & Application Polish** (Complete)
- [x] **Phase 10 — Production Web Deployment & Infrastructure** (Complete)
- [x] **Phase 11 — Web Release Candidate, Final Security Audit & Android Readiness** (Complete)
- [ ] **Phase 12 — Android Native Client Implementation**

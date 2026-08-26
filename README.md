# Vade (Private Chat)

A privacy-focused text communication platform designed with visual privacy, custom gesture-based reveals, end-to-end cryptographic security architecture, accessible production UX, and reproducible, secure production deployment infrastructure across Web and Native Android.

---

## Current Status: Phase 19 — Final Security Audit, Release Validation & Store Submission (Complete)

Vade has achieved full release candidate status for **`v1.0.0-rc.1`** across both Web and Android clients. All 19 implementation and hardening phases are complete, audited, and verified against the 4-Layer Defense-in-Depth Privacy Model.

> [!NOTE]
> **4-Layer Defense-in-Depth Privacy Model**:
> - **Layer 4 — Identity Verification & Device Trust**: Users compare symmetric safety numbers (`48321 72904 18273 66421`) and key fingerprints (`A7D4 92F1 8C20 4E73...`) to verify contacts out-of-band. Key changes immediately trigger in-app warnings (`KeyChanged`) and require explicit re-verification. Server-authoritative device trust allows inspecting and revoking active devices.
> - **Layer 3 — Gesture Reveal Authorization & Window Protection**: Custom multi-stroke geometric gestures grant ≤ 8-second temporary plaintext reveals with active countdown progress bars. Dynamic `FLAG_SECURE` window protection blocks screenshots, screen recordings, and recent-app previews during reveal.
> - **Layer 2 — Protected Message Rendering**: Messages appear as deterministic visual homoglyphs on screen by default across timelines and previews (`ProtectedMessage` / `protectMessage`).
> - **Layer 1 — End-to-End Encryption (E2EE)**: Messages are encrypted locally on client devices via Web Crypto / Android Keystore (`ECDH P-256`, `HKDF-SHA-256`, `AES-256-GCM`). Zero plaintext on the server or in database storage.

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
               ┌────────────────────────────┼────────────────────────────┐
               │                            │                            │
               ▼                            ▼                            ▼
     Static React/Vite SPA        Android Native App            Node.js Express API & WS
     (dist/ - Web Client)         (Jetpack Compose / Keystore)  (Backend Service)
     - Protected Rendering        - Hardware Keystore EC Keys   - /api/* (REST API)
     - 8s Gesture Reveal          - Room Ciphertext Storage     - /ws (WebSocket WSS)
     - Safety Numbers / FPs       - Dynamic FLAG_SECURE                     │
               │                  - 8s Gesture Reveal                       ▼
               │                            │                          PostgreSQL
               │                            │                   (Ciphertext Envelopes Only)
               ▼                            ▼
        Client Browser               Android Keystore
       (IndexedDB Keys)             (Hardware Backed)
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

## Testing & Verification

```bash
# Web & Server Test Suite (165 tests: 83 backend + 82 frontend)
npm test

# TypeScript typechecks & Web production build
npm run typecheck
npm run build

# Android Native Test Suite (152 debug + 152 release = 304 unit test executions)
cd android
./gradlew test

# Android Lint (0 errors)
./gradlew lint

# Android Release APK & Play Store AAB Bundle Generation
./gradlew assembleRelease bundleRelease
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
- [x] **Phase 12 — Android Foundation & Security Primitives** (Complete)
- [x] **Phase 13 — Android Authentication & E2EE Messaging** (Complete)
- [x] **Phase 14 — Android Offline Synchronization & Reliability** (Complete)
- [x] **Phase 15 — Android Protected Message Rendering (Layer 2)** (Complete)
- [x] **Phase 16 — Android Custom Gesture Reveal System (Layer 3)** (Complete)
- [x] **Phase 17 — Android Key Verification & Device Trust (Layer 4)** (Complete)
- [x] **Phase 18 — Android Final UX, Security Hardening & Release Readiness** (Complete)
- [x] **Phase 19 — Final Security Audit, Release Validation & Store Submission** (Complete)

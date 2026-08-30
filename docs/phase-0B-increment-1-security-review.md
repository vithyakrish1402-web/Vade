# Vade Phase 0B — Independent Security Review of Increment 1
**CSP + WebSocket Session Security Hardening**

**Reviewer:** Independent Security Architect / Offensive Security Reviewer  
**Audit Target:** Repository working tree & Git diff following Phase 0B Increment 1  
**Target Commit Baseline:** `0e729a5`  
**Review Date:** 2026-08-30  
**Scope:** Strict CSP implementation (`vercel.json`), WebSocket session binding & invalidation (`server/src/services/websocket.ts`), AuthService logout integration (`server/src/services/authService.ts`), CORS preflight verification (`server/test/corsPreflight.test.ts`), Receipt authorization (H-5), JWT verification enforcement (M-9), Increment 0 regression verification, and test suite rigor.

---

## Standard Vocabulary

| Term | Definition |
|---|---|
| **CLOSED** | Vulnerability or defect is completely eliminated by the implementation and verified. |
| **OPEN** | Vulnerability or defect remains unaddressed or reachable. |
| **PARTIALLY CLOSED** | Part of the attack surface is eliminated, but exposure remains under specific conditions. |
| **IMPLEMENTED** | Code exists and is wired into the execution path. |
| **TESTED** | Automated tests execute against the component and assert outcomes. |
| **VERIFIED** | Proven under realistic conditions (real protocol, real sockets, end-to-end execution). |
| **NOT VERIFIED** | Static code analysis supports the claim, but operational or browser runtime proof is absent. |
| **OUT OF SCOPE** | Deliberately excluded from the current increment. |
| **BLOCKED** | Implementation is impossible without upstream architectural or schema prerequisites. |

---

## 1. Executive Summary

An independent, adversarial security review was conducted on the Phase 0B Increment 1 changes submitted by Claude Code. The implementation was inspected directly from the repository source, configuration, and Git diff, followed by independent test execution and cryptographic verification.

### Key Conclusions

1. **Increment 0 Security Perimeter is Fully Preserved:**
   - Source files [`server/src/config/origins.ts`](file:///c:/Users/Krish/Documents/Projects/enctxt/server/src/config/origins.ts) (MD5 `6ddbab2cace0af7a06998af92367ce4f`) and [`server/src/middleware/originGuard.ts`](file:///c:/Users/Krish/Documents/Projects/enctxt/server/src/middleware/originGuard.ts) (MD5 `fdeffd674c478d56e78977b4e21d00c1`) are byte-identical to their approved Increment 0 state.
   - All 102 Increment 0 tests pass without regression.
2. **WebSocket Session Lifetime & Invalidation is VERIFIED:**
   - Sockets are explicitly bound to session IDs in an in-memory index [`sessionSockets`](file:///c:/Users/Krish/Documents/Projects/enctxt/server/src/services/websocket.ts#L55).
   - `AuthService.logout` triggers immediate event-driven socket termination (close code `4001`) scoped strictly to the logged-out session.
   - Outbound delivery is gated on [`deliver()`](file:///c:/Users/Krish/Documents/Projects/enctxt/server/src/services/websocket.ts#L669-L674), checking `ws.isAuthorized === true` and `readyState === OPEN` immediately before every payload write.
   - The TOCTOU registration race condition is closed by post-registration session re-checking ([`revokeIfSessionGone`](file:///c:/Users/Krish/Documents/Projects/enctxt/server/src/services/websocket.ts#L523-L536)).
   - A 60-second bounded revalidation sweep catches out-of-band database deletions and session expirations.
3. **M-9 (JWT Verification Discard) & H-5 (Receipt Authorization) are CLOSED:**
   - `authenticateToken` now rejects invalid/expired JWT signatures before inspecting the database session row.
   - `message.delivered` and `message.read` WebSocket frames are validated for conversation membership using server-derived identity (`ws.userId`).
4. **CORS Preflight Test Gap is VERIFIED:**
   - [`server/test/corsPreflight.test.ts`](file:///c:/Users/Krish/Documents/Projects/enctxt/server/test/corsPreflight.test.ts) exercises the full Express middleware stack. Hostile preflight requests for `X-Vade-Client` are denied `Access-Control-Allow-Origin`.
5. **CSP Implementation is IMPLEMENTED & TESTED, but NOT VERIFIED in a Browser:**
   - The CSP in [`vercel.json`](file:///c:/Users/Krish/Documents/Projects/enctxt/vercel.json#L11-L13) is strict: `default-src 'none'`, no `'unsafe-inline'`, no `'unsafe-eval'`, frame ancestors denied.
   - The inline theme script hash (`'sha256-fAO9GGyBqQUmFSwhJiiThhiDv9UUOOqHmbZCwBGzoj0='`) was independently re-calculated and verified against LF-normalized `client/index.html` and `client/dist/index.html`.
   - **Critical Caveat:** `connect-src` hardcodes `https://vade-api.onrender.com` and `wss://vade-api.onrender.com`. This was inferred from the Android configuration because the authoritative Vercel dashboard environment variables (`VITE_API_URL`) are not stored in Git. If production uses any other domain or proxy, the web application will break on deployment.
6. **Device Revocation (H-1) is ARCHITECTURALLY BLOCKED:**
   - Confirmed not implemented. The `Session` model lacks a `deviceId` foreign key, JWTs lack device claims, and `requireAuth` does not consume `Device.status`.

**Overall Verdict: APPROVE WITH CAVEATS (DO NOT DEPLOY to production until preview validation).**

---

## 2. Repository & Git Safety Audit

A complete Git status, diff, and file tree inspection was performed.

### Working Tree Findings

- **Modified Files (10):**
  - `.env.example`: Hardened configuration examples.
  - `ARCHITECTURE.md`: Synchronized documentation.
  - `android/app/src/main/java/com/enctxt/core/network/Network.kt`: Increment 0 `X-Vade-Client` header on OkHttp requests and WebSocket upgrades.
  - `docker-compose.yml`: Removed insecure default passwords in favor of required environment variables.
  - `server/src/app.ts`: Mounted origin guard and CORS policy.
  - `server/src/config/env.ts`: Added validation for insecure secret patterns and production `ALLOWED_ORIGINS`.
  - `server/src/services/authService.ts`: Added `wsService.closeSession` call during `logout()`.
  - `server/src/services/websocket.ts`: Implemented session binding, sweep, outbound gate, receipt checks, JWT verification enforcement, and TOCTOU protection.
  - `server/test/mockDb.ts`: Added session helpers (`findMany`, `deleteSession`, `expireSession`, `breakSessionReads`).
  - `vercel.json`: Added CSP and 7 HTTP security headers.
- **Untracked Files (13):**
  - Increment 0 and Increment 1 test suites and implementation modules (`originPolicy.test.ts`, `csrfOriginGuard.test.ts`, `identityKeyCsrf.test.ts`, `websocketOrigin.test.ts`, `websocketSession.test.ts`, `corsPreflight.test.ts`, `csp.test.ts`, `origins.ts`, `originGuard.ts`, documentation reports).
- **Deleted / Suspicious Files:** None.
- **Secret / Credential Leakage:** None found. No production secrets, tokens, or private keys were committed.

---

## 3. CSP Security Review

### Directive-by-Directive Audit ([`vercel.json`](file:///c:/Users/Krish/Documents/Projects/enctxt/vercel.json#L11-L13))

```
default-src 'none';
script-src 'self' 'sha256-fAO9GGyBqQUmFSwhJiiThhiDv9UUOOqHmbZCwBGzoj0=';
style-src 'self' https://fonts.googleapis.com;
font-src https://fonts.gstatic.com;
img-src 'self' data:;
connect-src 'self' https://vade-api.onrender.com wss://vade-api.onrender.com;
manifest-src 'self';
base-uri 'self';
form-action 'self';
frame-ancestors 'none';
object-src 'none';
frame-src 'none';
worker-src 'none';
upgrade-insecure-requests
```

| Directive | Configured Value | Assessment |
|---|---|---|
| `default-src` | `'none'` | **SECURE.** Fails closed for any resource type not explicitly allowed. |
| `script-src` | `'self' 'sha256-fAO9GGyBqQUmFSwhJiiThhiDv9UUOOqHmbZCwBGzoj0='` | **SECURE.** Restricts execution to bundled application scripts and the specific inline theme script. No `'unsafe-inline'`, no `'unsafe-eval'`. |
| `style-src` | `'self' https://fonts.googleapis.com` | **APPROPRIATE.** Allows local Tailwind/Vite CSS chunks and Google Fonts stylesheet. |
| `font-src` | `https://fonts.gstatic.com` | **APPROPRIATE.** Required for Figtree web font binaries fetched from Google Fonts. |
| `img-src` | `'self' data:` | **APPROPRIATE.** Supports local assets and inline SVG/data URIs. |
| `connect-src` | `'self' https://vade-api.onrender.com wss://vade-api.onrender.com` | **HIGH CONFIGURATION RISK.** Critical dependency on inferred backend domain. |
| `manifest-src` | `'self'` | **SECURE.** Permits PWA web app manifest. |
| `base-uri` | `'self'` | **SECURE.** Blocks `<base href>` hijacking attacks. |
| `form-action` | `'self'` | **SECURE.** Prevents injected forms from posting credentials to external origins. |
| `frame-ancestors` | `'none'` | **SECURE.** Complete protection against clickjacking / UI redressing. |
| `object-src` | `'none'` | **SECURE.** Blocks legacy plugin execution (Flash, Java, ActiveX). |
| `frame-src` | `'none'` | **SECURE.** Disables child iframes. |
| `worker-src` | `'none'` | **SECURE.** Disables Web Workers / Service Workers (none used in `client/src`). |
| `upgrade-insecure-requests` | (flag present) | **SECURE.** Upgrades mixed content requests to HTTPS. |

### A. Inline Script SHA-256 Hash Verification

The inline script in [`client/index.html`](file:///c:/Users/Krish/Documents/Projects/enctxt/client/index.html#L16-L30) initializes theme state before first paint:

```javascript
(function () {
  try {
    var saved = localStorage.getItem('vade.theme');
    var dark =
      saved === 'dark' ||
      (saved !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    if (dark) document.documentElement.classList.add('dark');
  } catch (e) {
    /* Storage unavailable (private mode, blocked cookies) — fall through to light. */
  }
})();
```

**Independent Byte Hash Calculation:**
- LF-normalized content SHA-256 (Base64): `fAO9GGyBqQUmFSwhJiiThhiDv9UUOOqHmbZCwBGzoj0=`
- CRLF content SHA-256 (Base64): `mP0HNFvMaQ2lHAuTFpMkWs2duwN5HPO+Ta4/mzGor2c=`
- Build output (`client/dist/index.html`) inspection confirms Vite copies this script block verbatim without minification or whitespace modification.
- Because Vercel builds on a Linux environment using LF line endings, the hash in `vercel.json` (`'sha256-fAO9GGyBqQUmFSwhJiiThhiDv9UUOOqHmbZCwBGzoj0='`) is **correct**.

### B. Google Fonts Dependency

`client/index.html` lines 9–14 load Figtree via:
- `<link rel="preconnect" href="https://fonts.googleapis.com" />`
- `<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />`
- `<link href="https://fonts.googleapis.com/css2?family=Figtree:wght@400;600;700&display=swap" rel="stylesheet" />`

The CSP directives `style-src https://fonts.googleapis.com` and `font-src https://fonts.gstatic.com` allow exactly and only these required external origins.

### C. connect-src Origin Evaluation

- In `client/src/services/api.ts:3` and `client/src/services/websocket.ts:45`, the URLs default to `import.meta.env.VITE_API_URL || '/api'`.
- The only occurrence of `https://vade-api.onrender.com` in the repository is in [`android/app/build.gradle.kts:99-100`](file:///c:/Users/Krish/Documents/Projects/enctxt/android/app/build.gradle.kts#L99-L100).
- **Security Assessment:** Claude's inference is plausible but **unverified against the Vercel project configuration**. If `VITE_API_URL` on Vercel is set to a custom domain (e.g. `https://api.vade.chat`) or uses relative routing (`/api`), the CSP will block all REST API calls and WebSocket connections.
- **Classification:** **NOT VERIFIED** (requires preview environment confirmation).

### D. XSS Sink Audit

A repository-wide search across `client/src` confirmed:
- Zero occurrences of `dangerouslySetInnerHTML`, `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`, `eval()`, `new Function()`, or dynamic script/style tag creation.
- React JSX escaping is used consistently across UI components.
- The absence of `'unsafe-inline'` and `'unsafe-eval'` ensures that even if an HTML injection vulnerability were introduced, script execution would be blocked by the browser.

### E. Complementary Security Headers

The headers in `vercel.json` are standard and free of dangerous conflicts:
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()`
- `Strict-Transport-Security: max-age=31536000; includeSubDomains`
- `Cross-Origin-Opener-Policy: same-origin`
- `X-DNS-Prefetch-Control: off`

**CSP Review Verdict: IMPLEMENTED & TESTED (Configuration Validated); NOT VERIFIED in live browser.**

---

## 4. WebSocket Authentication Review

The full WebSocket lifecycle in [`server/src/services/websocket.ts`](file:///c:/Users/Krish/Documents/Projects/enctxt/server/src/services/websocket.ts) was traced:

```mermaid
sequenceDiagram
    autonumber
    actor Client as Browser / Client
    participant WSS as WebSocket Server
    participant DB as Postgres (Prisma)
    participant Outbound as deliver() Gate

    Client->>WSS: HTTP Upgrade GET /ws (Origin, Cookie)
    Note over WSS: verifyClient checks Origin allowlist
    alt Untrusted Origin
        WSS-->>Client: 403 / Handshake Aborted
    else Trusted Origin
        WSS->>Client: 101 Switching Protocols
        WSS->>DB: authenticateRequest -> verifySessionToken & findUnique(tokenHash)
        alt Invalid JWT or DB Session Missing/Expired
            WSS-->>Client: Remains unauthenticated (no registry entry)
        else Valid Session
            WSS->>WSS: registerUserSocket(userId, sessionId, ws)
            WSS->>Client: { type: "authenticated", userId }
            WSS->>DB: revokeIfSessionGone(sessionId) [TOCTOU Check]
            alt Session deleted during handshake
                WSS->>WSS: closeSession(sessionId, 4001)
            end
        end
    end

    Note over WSS,Outbound: Message Fan-out (sendToMembers / sendToUser)
    WSS->>Outbound: deliver(ws, payload)
    alt ws.isAuthorized === true && ws.readyState === OPEN
        Outbound->>Client: Send JSON Frame
    else De-authorized / Revoked
        Outbound--xClient: Frame Suppressed (return false)
    end
```

### Protocol Analysis

1. **Origin Verification at Handshake:**
   - Enforced in `verifyClient` via `isHandshakeOriginAllowed(info.req)`. Untrusted origins never complete the upgrade and never receive an open socket.
2. **Authentication Flow:**
   - Cookies extracted from upgrade headers.
   - `authenticateToken` calls `verifySessionToken(token)` (JWT verification) and `hashSessionToken(token)` (SHA-256 hash lookup in DB).
   - Valid credentials attach `ws.userId`, `ws.sessionId`, and `ws.isAuthorized = true`.
3. **Socket Tracking:**
   - `userSockets: Map<string, Set<AuthenticatedSocket>>` (indexed by `userId`).
   - `sessionSockets: Map<string, Set<AuthenticatedSocket>>` (indexed by `sessionId`).
   - `conversationSockets: Map<string, Set<AuthenticatedSocket>>` (indexed by `conversationId`).

---

## 5. M-9 — JWT Verification Enforcement

### Finding Background

Audit finding M-9 identified that `authenticateToken` called `verifySessionToken(token)` at line 349 but discarded the return value. A token with an expired or invalid JWT signature would authenticate if its SHA-256 hash matched an unexpired DB session row.

### Implementation Verification

Lines 726–728 of [`server/src/services/websocket.ts`](file:///c:/Users/Krish/Documents/Projects/enctxt/server/src/services/websocket.ts#L726-L728):
```typescript
const payload = verifySessionToken(token);
if (!payload) return null;
```

- `verifySessionToken` runs `jwt.verify(token, config.JWT_SECRET)`.
- If the token signature is invalid, expired, malformed, or signed with an old secret following `JWT_SECRET` rotation, `verifySessionToken` returns `null`.
- `authenticateToken` returns `null` immediately **before any database query is executed**.
- A valid database session row **cannot** rescue an invalid or rotated JWT.

**Status: CLOSED (VERIFIED).**

---

## 6. Session Binding Review

### Property Under Attack

*Can a socket authenticated under one session be confused with, spoofed as, or affected by another session or user?*

### Analysis

1. **Server-Derived Identity:**
   - Sockets obtain `ws.sessionId` and `ws.userId` strictly from the verified database `Session` record during server-side authentication.
   - The client has no ability to supply or overwrite `sessionId` or `userId` in client frames.
2. **Session-Scoped Indexing:**
   - Sockets are stored in `sessionSockets: Map<sessionId, Set<AuthenticatedSocket>>`.
   - Re-authenticating a socket via a late `auth` frame cleans up any prior session index via [`removeFromSessionIndex`](file:///c:/Users/Krish/Documents/Projects/enctxt/server/src/services/websocket.ts#L372-L376).
3. **Multi-Session Isolation:**
   - Logging out Session A calls `closeSession(sessionA_id)`.
   - `sessionSockets.get(sessionA_id)` contains only sockets belonging to Session A.
   - Session B for the same user remains in `sessionSockets.get(sessionB_id)` and `userSockets.get(userId)`.
   - Verified by test `8c` in [`server/test/websocketSession.test.ts:262-288`](file:///c:/Users/Krish/Documents/Projects/enctxt/server/test/websocketSession.test.ts#L262-L288).

**Status: VERIFIED.**

---

## 7. TOCTOU Review

### Race Condition Analysis

The race scenario:
1. Client sends WebSocket upgrade request with valid session cookie.
2. Server executes `authenticateRequest`: reads session row (valid).
3. Simultaneously, user logs out via `POST /api/auth/logout`: deletes session row and calls `wsService.closeSession(sessionId)`.
4. Because the connecting socket has not yet reached `registerUserSocket`, `closeSession` finds zero sockets in `sessionSockets`.
5. WebSocket connection handler executes `registerUserSocket(userId, sessionId, ws)` and marks `ws.isAuthorized = true`.
6. Without a secondary check, the socket would remain connected and receive protected messages until the next 60s sweep.

### Mitigation in Code

[`server/src/services/websocket.ts:173`](file:///c:/Users/Krish/Documents/Projects/enctxt/server/src/services/websocket.ts#L173):
```typescript
this.registerUserSocket(authenticatedUser.id, authenticatedUser.sessionId, ws);
this.send(ws, { type: 'authenticated', userId: authenticatedUser.id });

await this.revokeIfSessionGone(authenticatedUser.sessionId);
```

[`server/src/services/websocket.ts:523-536`](file:///c:/Users/Krish/Documents/Projects/enctxt/server/src/services/websocket.ts#L523-L536):
```typescript
private async revokeIfSessionGone(sessionId: string): Promise<void> {
  try {
    const prisma = getPrismaClient();
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      select: { id: true, expiresAt: true },
    });
    if (!session || session.expiresAt <= new Date()) {
      this.closeSession(sessionId, 'Session expired or revoked');
    }
  } catch {
    /* fail safe — the periodic sweep will catch it */
  }
}
```

- If logout happened *before* registration, `revokeIfSessionGone` finds the deleted row and terminates the socket immediately.
- If logout happens *during or after* registration, `AuthService.logout` -> `closeSession` finds the socket in `sessionSockets` and terminates it immediately.
- The race window is eliminated. Tested in `websocketSession.test.ts:366-381` (test `12b`).

**Status: CLOSED (VERIFIED).**

---

## 8. Logout Review

### Implementation in AuthService ([`server/src/services/authService.ts:180-199`](file:///c:/Users/Krish/Documents/Projects/enctxt/server/src/services/authService.ts#L180-L199))

```typescript
try {
  await prisma.session.delete({ where: { id: sessionId } });
} catch {
  // Session already deleted or expired
}

try {
  wsService.closeSession(sessionId, 'Logged out');
} catch (error) {
  logger.warn('Failed to revoke WebSocket sockets on logout', {
    event: 'logout_ws_revocation_failed',
    error: error instanceof Error ? error.message : 'unknown',
  });
}
```

### Audit Findings

1. `closeSession(sessionId)` executes **outside** the database `delete` try/catch block. Even if the DB row was already deleted, socket cleanup runs unconditionally.
2. Inside `closeSession`:
   - `socket.isAuthorized = false` is set synchronously.
   - `socket.close(WS_CLOSE_SESSION_REVOKED, reason)` sends close code `4001`.
   - `this.handleDisconnect(socket)` synchronously purges the socket from `userSockets`, `sessionSockets`, and `conversationSockets`.
3. Verified via HTTP endpoint `POST /api/auth/logout` in test `8b` ([`websocketSession.test.ts:244-260`](file:///c:/Users/Krish/Documents/Projects/enctxt/server/test/websocketSession.test.ts#L244-L260)).

**Status: VERIFIED.**

---

## 9. Session Revocation Review

### Invalidation Path Evaluation Matrix

| Invalidation Trigger | Mechanism | Invalidation Speed | Status |
|---|---|---|---|
| User Logout (`POST /api/auth/logout`) | `AuthService.logout` -> `wsService.closeSession` | **IMMEDIATE** | **VERIFIED** |
| Out-of-band DB Deletion (Admin / External) | Bounded periodic sweep (`revalidateSessions`) | **BOUNDED (≤ 60s)** | **VERIFIED** |
| Natural Session Expiration (`expiresAt`) | Bounded periodic sweep (`revalidateSessions`) | **BOUNDED (≤ 60s)** | **VERIFIED** |
| JWT Secret Rotation | Handshake `verifySessionToken` rejection | **IMMEDIATE (New) / BOUNDED (Open)** | **PARTIAL** (Open sockets stay until row expiry/deletion) |
| Process Restart | Node.js process shutdown drains connections | **IMMEDIATE** | **VERIFIED** |

### Sweep Efficiency & Correctness ([`server/src/services/websocket.ts:575-616`](file:///c:/Users/Krish/Documents/Projects/enctxt/server/src/services/websocket.ts#L575-L616))

- Short-circuits immediately if `sessionSockets.size === 0` (zero DB queries when idle).
- When active, executes a single batch query: `prisma.session.findMany({ where: { id: { in: sessionIds } }, select: { id: true, expiresAt: true } })`.
- Work is strictly $O(1)$ database queries per 60-second sweep regardless of socket volume.

**Status: VERIFIED (Immediate for logout, bounded ≤60s for out-of-band revocation).**

---

## 10. Critical Outbound Authorization Review

### Audit Finding Verification

The Phase 0B Security Audit highlighted that `sendToMembers` delivers to `userSockets[userId]`, bypassing conversation room subscriptions. Therefore, subscription checks at join time do not prevent message leakage if a socket remains in `userSockets`.

### The Outbound Gate ([`server/src/services/websocket.ts:669-674`](file:///c:/Users/Krish/Documents/Projects/enctxt/server/src/services/websocket.ts#L669-L674))

```typescript
private deliver(ws: AuthenticatedSocket, payload: string): boolean {
  if (ws.readyState !== WebSocket.OPEN) return false;
  if (ws.isAuthorized !== true) return false;
  ws.send(payload);
  return true;
}
```

- All three message distribution routines funnel through `deliver()`:
  1. `sendToUser(userId, event)`
  2. `sendToMembers(memberUserIds, event, excludeSocket)`
  3. `broadcastToConversation(conversationId, event, excludeSocket)`
- There are **no bypasses** in `websocket.ts`. All protected frames containing ciphertext or metadata use `deliver()`.
- Control frames (`pong`, `authenticated`, `error`, `subscribed`, `unsubscribed`) use `this.send()`, which carries zero sensitive data.

**Status: VERIFIED.**

---

## 11. H-5 Receipt Authorization Review

### Vulnerability Verification

Previously, `message.delivered` and `message.read` checked only `ws.userId` existence, allowing any authenticated user to broadcast forged read/delivered receipts into arbitrary conversation IDs.

### Fix Inspection ([`server/src/services/websocket.ts:297-357`](file:///c:/Users/Krish/Documents/Projects/enctxt/server/src/services/websocket.ts#L297-L357))

```typescript
case 'message.delivered': {
  if (!(await this.isAuthorizedForConversation(ws, message.conversationId))) return;
  this.broadcastToConversation(message.conversationId, { ... }, ws);
  break;
}

case 'message.read': {
  if (!(await this.isAuthorizedForConversation(ws, message.conversationId))) return;
  this.broadcastToConversation(message.conversationId, { ..., readBy: ws.userId! }, ws);
  break;
}
```

`isAuthorizedForConversation` verifies:
1. `ws.userId` is present and `ws.isAuthorized === true`.
2. `conversationId` is a non-empty string.
3. `ConversationService.verifyMembership(conversationId, ws.userId)` returns `isMember === true`.
4. `readBy` is populated with `ws.userId` (server-derived), preventing identity spoofing.

**Status: CLOSED (VERIFIED).**

---

## 12. H-1 Device Revocation Review

### Independent Codebase Inspection

1. In [`server/prisma/schema.prisma:80-91`](file:///c:/Users/Krish/Documents/Projects/enctxt/server/prisma/schema.prisma#L80-L91), the `Session` model contains:
   `id`, `userId`, `tokenHash`, `expiresAt`, `createdAt`, `user`.  
   **There is no `deviceId` column.**
2. In `server/src/utils/jwt.ts:4-8`, the JWT payload carries only `sub`, `username`, and `jti`.
3. In `server/src/services/deviceService.ts:77-80`, `revokeDevice` updates `status: 'revoked'`.
4. Zero code paths in `requireAuth` or `websocket.ts` query `Device.status` or correlate sessions to devices.

### Evaluation

Claude's assessment is **accurate**: Device revocation is structurally impossible without a schema migration adding `Session.deviceId` and runtime enforcement in authentication middleware. Claude properly declined to implement a counterfeit "disconnect all user sockets" workaround.

**Status: ARCHITECTURALLY BLOCKED (NOT IMPLEMENTED).**

---

## 13. M-10 Multi-Instance Security Review

### Architectural Analysis

- `sessionSockets` is an in-memory `Map<string, Set<AuthenticatedSocket>>` local to a single Node.js process.
- **Single Instance (Current Production):** Immediate revocation on logout ($O(1)$).
- **Multiple Instances (Scaled Backend):**
  - If Instance A holds the socket and Instance B processes `POST /api/auth/logout`:
    - Instance B's `closeSession` will have no effect on Instance A.
    - Instance A's socket will remain connected until Instance A's 60-second sweep executes `revalidateSessions()`, reads Postgres, detects the deleted session, and closes the socket.
  - **Exposure Window:** Bounded at **≤ 60 seconds**.
- Multi-instance immediate invalidation requires cross-node IPC (e.g. Redis Pub/Sub or Postgres `LISTEN`/`NOTIFY`), which is deferred to future scaling phases.

**Status: LIMITED (Single-process immediate; multi-process bounded by 60s sweep).**

---

## 14. Fail-Safe Database Behavior Review

### Behavior Audit

- In `revokeIfSessionGone` ([line 533](file:///c:/Users/Krish/Documents/Projects/enctxt/server/src/services/websocket.ts#L533)) and `revalidateSessions` ([lines 591–599](file:///c:/Users/Krish/Documents/Projects/enctxt/server/src/services/websocket.ts#L591-L599)), database query exceptions are caught and logged, returning without closing sockets.
- **Architectural Trade-off Assessment:**
  - *Fail-Closed:* A transient Postgres connectivity blip would disconnect every connected WebSocket client across the entire user base, causing immediate mass outages and thundering-herd reconnect storms.
  - *Fail-Safe:* Sockets that have already successfully passed initial authentication remain connected during transient DB downtime, retrying revocation on the subsequent 60s sweep.
  - **Verdict:** Fail-safe is the correct operational design for background revalidation sweeps.

**Status: VERIFIED & APPROPRIATE.**

---

## 15. CORS Preflight Review

### Independent Verification of [`server/test/corsPreflight.test.ts`](file:///c:/Users/Krish/Documents/Projects/enctxt/server/test/corsPreflight.test.ts)

- Supertest sends `OPTIONS /api/crypto/identity` with:
  - `Origin: https://evil.com`
  - `Access-Control-Request-Method: POST`
  - `Access-Control-Request-Headers: X-Vade-Client, Content-Type`
- Assertions confirm `res.headers['access-control-allow-origin']` is `undefined`.

### Analysis of the `cors` Package Behavior

The `cors` npm package emits `Access-Control-Allow-Credentials: true` and echoes `Access-Control-Allow-Headers` even when refusing an origin.  
**Offensive Assessment:** Under Section 3.2 of the W3C / WHATWG Fetch Standard, a browser fails CORS preflight if `Access-Control-Allow-Origin` is missing or does not match the requesting origin. Without `Access-Control-Allow-Origin`, the browser never sends the actual `POST` request. Furthermore, if a non-browser attacker bypasses the preflight, the `originGuard` middleware intercepts the request with a `403 Forbidden`. The behavior is completely inert.

**Status: VERIFIED.**

---

## 16. Increment 0 Regression Review

An independent regression run was executed across all test suites:

```
npm run typecheck    PASS (shared, server, client)
npm test             PASS (server: 17 files, 226 tests; client: 20 files, 235 tests)
npm run build        PASS (shared tsc, server tsc, client vite build)
```

### Increment 0 Specific Test Check

- `server/test/originPolicy.test.ts`: 32/32 PASS
- `server/test/csrfOriginGuard.test.ts`: 46/46 PASS
- `server/test/identityKeyCsrf.test.ts`: 10/10 PASS
- `server/test/websocketOrigin.test.ts`: 14/14 PASS

### Byte Verification

```
6ddbab2cace0af7a06998af92367ce4f  server/src/config/origins.ts
fdeffd674c478d56e78977b4e21d00c1  server/src/middleware/originGuard.ts
```
Hashes match Increment 0 baseline exactly.

**Status: NONE (Zero Regressions).**

---

## 17. Test Quality Assessment

| Security Claim | Test File | Test Method | Quality Rating | Rationale |
|---|---|---|---|---|
| Origin Guard & CSRF | `csrfOriginGuard.test.ts` | Real Express Stack | **STRONG** | Thorough coverage of header spoofing, method switching, form POSTs, and lookalike origins. |
| CORS Preflight Rejection | `corsPreflight.test.ts` | Real Express Stack | **STRONG** | Exercises real HTTP OPTIONS preflight and asserts lack of `Access-Control-Allow-Origin`. |
| Handshake Origin Gate | `websocketOrigin.test.ts` | Real HTTP/WS Server | **STRONG** | Validates handshake rejection before socket creation. |
| JWT Verification (M-9) | `websocketSession.test.ts` | Unit + Integration | **STRONG** | Enforced directly in `authenticateToken` and tested against expired/invalid tokens. |
| Logout Socket Termination | `websocketSession.test.ts` | Real HTTP & WebSockets | **STRONG** | Drives real `POST /api/auth/logout`, asserts close code 4001 and zero subsequent frames. |
| Session Revocation / Sweep | `websocketSession.test.ts` | Real Sockets + `mockDb` | **MODERATE** | Asserts frame suppression, but runs against in-memory `mockDb` rather than PostgreSQL. |
| Outbound Delivery Gate | `websocketSession.test.ts` | Real WebSockets | **STRONG** | Directly tests `sendToMembers`, `sendToUser`, and `broadcastToConversation` on de-authorized sockets. |
| Receipt Auth (H-5) | `websocketSession.test.ts` | Real WebSockets | **STRONG** | Directly tests outsider vs. member receipt injection. |
| TOCTOU Registration Race | `websocketSession.test.ts` | Real Sockets + `mockDb` | **MODERATE** | Simulates deletion during connect, asserted on post-registration check. |
| Fail-Safe DB Behavior | `websocketSession.test.ts` | Real Sockets + `mockDb` | **MODERATE** | Uses `mockDb.breakSessionReads()` fault injection. |
| CSP Configuration & Hash | `client/test/csp.test.ts` | Static Parser & Build | **MODERATE** | Validates LF normalization and build output matching, but not verified in real browser. |
| Device Revocation (H-1) | N/A | N/A | **NOT TESTED** | Architecturally blocked. |

---

## 18. Production Configuration Risks

1. **`connect-src` Domain Mismatch Risk (CRITICAL):**
   - `vercel.json` hardcodes `https://vade-api.onrender.com` and `wss://vade-api.onrender.com`.
   - If the Vercel project environment variable `VITE_API_URL` points to a custom domain (e.g. `api.vade.chat`) or another Render environment, all browser network requests will fail immediately upon deployment.
2. **`CORS_ORIGIN` Synchronization on Render:**
   - Render's `CORS_ORIGIN` environment variable must match the exact Vercel frontend URL.

---

## 19. Required Changes Before Deployment

Before deploying this branch to production:

1. [ ] **Verify Vercel `VITE_API_URL`:** Confirm that `VITE_API_URL` in the Vercel Project Settings matches `https://vade-api.onrender.com`. If not, update `connect-src` in `vercel.json`.
2. [ ] **Deploy to Vercel Preview:** Deploy to a non-production preview URL first.
3. [ ] **Browser DevTools Verification:** Open DevTools Console on the preview deployment and confirm:
   - Zero CSP violations on load.
   - Theme initialization script runs without flashing or errors.
   - Figtree fonts load from Google Fonts.
   - WebSocket connection opens successfully over `wss://`.
   - Login, message send/receive, and logout operate without CSP or CORS blocks.
4. [ ] **Multi-Tab Logout Validation:** Log into two browser tabs, log out of one, and verify the logged-out tab's WebSocket closes with code 4001 while the other tab remains functional.

---

## 20. Recommended Next Increments

1. **Increment 2: Rate Limiting & `trust proxy` Hardening (H-6):**
   - Fix `trust proxy` in Express app to enable accurate client IP resolution behind Render's reverse proxy.
   - Implement per-route rate limits on authentication, messaging, and WebSocket upgrades.
2. **Increment 3: Device Model & Revocation Architecture (H-1, H-4):**
   - Execute Prisma migration to add `deviceId` to `Session`.
   - Bind device identity at login, update `requireAuth` to check `Device.status`, and wire `revokeDevice` to `closeSession`.
3. **Increment 4: Replay Protection (H-3):**
   - Add nonce tracking, counter/timestamp windows, and message idempotency constraints.

---

## Final Verdict Matrix

| Check / Requirement | Status |
|---|---|
| **C-1 Increment 0** | **CLOSED** |
| **C-2 Increment 0** | **CLOSED** |
| **CSP** | **APPROVED WITH CAVEATS** |
| **M-9 (JWT Verification Enforcement)** | **CLOSED** |
| **H-5 (Receipt Authorization)** | **CLOSED** |
| **WebSocket session binding** | **VERIFIED** |
| **Logout socket invalidation** | **VERIFIED** |
| **Session revocation** | **VERIFIED** |
| **TOCTOU race protection** | **CLOSED** |
| **Outbound socket authorization** | **VERIFIED** |
| **Device revocation (H-1)** | **ARCHITECTURALLY BLOCKED** |
| **Multi-instance invalidation (M-10)** | **LIMITED** |
| **CORS preflight coverage** | **VERIFIED** |
| **Increment 0 regression** | **NONE** |
| **Production configuration** | **NOT VERIFIED** |
| **Production deployment** | **DO NOT DEPLOY** (Preview Verification Required) |
| **OVERALL INCREMENT 1** | **APPROVE WITH CAVEATS** |

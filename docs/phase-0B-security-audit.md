# Vade (ENCTXT) — Phase 0B Security Architecture & Implementation Audit

**Status:** AUDIT AND DESIGN ONLY. No application, crypto, schema, or production configuration was modified.
**Audit date:** 2026-08-30
**Repository state at audit:** branch `main`, HEAD `0e729a5`
**Scope:** server (`server/src`), web client (`client/src`), shared contracts (`shared/src`), Android (`android/app`), Prisma schema & migrations, tests, CI, dependency manifests, and existing architecture/threat documentation.

**Method:** static source review with file/line citation. No production system was contacted, no production account was created, no production message was sent, no secret was rotated, and no dependency was upgraded. Where a property could only be confirmed by exercising production, this report says so explicitly instead of asserting it.

**Standing caveat, applied throughout:** a passing test is treated as evidence that a *specific asserted behaviour* holds, never as evidence that the surrounding control is sound. Several controls in this codebase have green tests and no enforcement (see §2.18).

---

## 1. Critical Security Findings

Severity is assigned on exploitability against the **current production deployment** (Vercel web client + Render API + Neon Postgres), not on theoretical reachability. `CRITICAL` is reserved for issues whose exploitation causes catastrophic or irreversible loss of confidentiality or integrity.

### CRITICAL

| ID | Finding | Location |
|----|---------|----------|
| **C-1** | **Cross-site forgery of the E2EE identity key.** The session cookie is `SameSite=None; Secure` in production, there is no CSRF token and no `Origin`/`Referer` check on any endpoint, and the app parses `application/x-www-form-urlencoded` bodies. Any web page a logged-in victim visits can silently `POST /api/crypto/identity` and replace the victim's published ECDH public key with an attacker-controlled key. This is an irreversible break of end-to-end confidentiality for every message subsequently sent to that victim. | `server/src/controllers/authController.ts:14-21`, `server/src/app.ts:18-26`, `server/src/routes/cryptoRoutes.ts:11`, `server/src/services/cryptoService.ts:12-34` |
| **C-2** | **Cross-Site WebSocket Hijacking (CSWSH).** The `/ws` upgrade performs no `Origin` validation and authenticates purely from the cookie. With `SameSite=None`, any origin can open an authenticated socket as the victim. No subscription is required to receive data: every message for that user is pushed to *all* their registered sockets. The attacker obtains a live feed of all ciphertext envelopes and conversation metadata. | `server/src/services/websocket.ts:41-62`, `:319-340`; `server/src/services/messageService.ts:106-117` |

C-1 and C-2 compose: C-2 delivers the ciphertext to the attacker, C-1 gives the attacker the key it was encrypted under. Together they constitute full plaintext compromise of a targeted account, mounted from an arbitrary third-party web page, with no malware and no network position.

### HIGH

| ID | Finding | Location |
|----|---------|----------|
| **H-1** | **Device revocation is cosmetic.** `revokeDevice` writes `status: 'revoked'` and nothing else. No session is deleted, no socket is closed, no key is retired. No code path anywhere reads `Device.status` to deny anything. | `server/src/services/deviceService.ts:63-83`; grep confirms no server-side consumer of `device.status` |
| **H-2** | **No session killswitch over WebSocket.** A socket authenticates once at connect and is never revalidated. Logout deletes the `Session` row but the socket stays open and keeps receiving messages indefinitely. There is no server-initiated disconnect path. | `server/src/services/websocket.ts:49-62`; `server/src/services/authService.ts:167-182` |
| **H-3** | **No replay protection at any layer.** No uniqueness constraint on `nonce` or any client message id, no idempotency key, no counter, no timestamp window. Re-POSTing a captured envelope verbatim creates a new message that decrypts correctly and renders to the recipient as new. | `server/prisma/schema.prisma:127-150`; `server/src/services/messageService.ts:44-71`; `client/src/crypto/encryption.ts:33` |
| **H-4** | **The data model permits one public key per user, so a user's own devices destroy each other.** `PublicKey.userId` is `@unique` and `publishPublicKey` upserts on it. Each client generates its own identity key locally and re-publishes on every session init, so a second device silently overwrites the first device's published key and permanently breaks its ability to receive. | `server/prisma/schema.prisma:45-59`; `server/src/services/cryptoService.ts:12-34`; `client/src/crypto/keyManager.ts:97-133` |
| **H-5** | **WebSocket receipt frames are unauthorized.** `message.delivered` and `message.read` check only that the socket is authenticated — never that the sender is a member of the `conversationId` in the frame. Any authenticated user can inject forged receipts into any conversation room. | `server/src/services/websocket.ts:167-196` |
| **H-6** | **Rate limiting is misconfigured and near-absent.** `trust proxy` is never set, so behind Render's proxy `req.ip` resolves to the proxy, collapsing every user into one bucket — 30 requests globally per 15 minutes on `/auth/*`, which any attacker can exhaust to lock out all logins. No rate limit at all on messaging, key publishing, device registration, user search, or WebSocket connections. | `server/src/middleware/rateLimiter.ts:22-57`; `server/src/routes/authRoutes.ts:9-12`; no `trust proxy` anywhere in `server/src` |

### MEDIUM

| ID | Finding | Location |
|----|---------|----------|
| **M-1** | No forward secrecy and no post-compromise security. Static-static ECDH yields one permanent AES key per conversation; compromise of either identity key retroactively and prospectively decrypts everything. | `client/src/crypto/keyExchange.ts:10-52` |
| **M-2** | AES-GCM nonce uniqueness is purely probabilistic under a long-lived, bidirectionally-shared key. 96-bit random IV, no counter, no persistence, no uniqueness enforcement on either side. | `client/src/crypto/encryption.ts:30`; `android/.../core/security/Crypto.kt` (`AeadCipherEngine.encrypt`) |
| **M-3** | Silent key substitution is invisible to unverified contacts, and the peer key cache is never invalidated. `clearPeerKeyCache()` exists but has zero call sites. | `client/src/crypto/keyManager.ts:136-163`; `client/src/hooks/useContactSecurity.ts:62-74` |
| **M-4** | Logout leaves all cryptographic and privacy material on the device: IndexedDB private key, peer key cache, verification records, gesture templates. `deleteIdentityKeys()` has zero call sites. | `client/src/auth/AuthContext.tsx:62-71`; `client/src/crypto/cryptoStorage.ts:168` |
| **M-5** | Gesture reveal lockout is React state only — a page reload resets the counter. Web gesture templates are plaintext `localStorage`. | `client/src/hooks/useMessageReveal.ts:115-145`; `client/src/utils/gestureStorage.ts:55` |
| **M-6** | `PublicKey.keyId` is globally unique and fully client-chosen, with no binding to the key material and no validation that `publicKey` is a well-formed P-256 SPKI. | `server/prisma/schema.prisma:47`; `server/src/utils/validation.ts:104-108` |
| **M-7** | Device registration is unbounded and never deduplicates; every call inserts a new row despite the docstring claiming upsert semantics. | `server/src/services/deviceService.ts:30-58` |
| **M-8** | No message rate limit, no per-user storage quota. 64KB × unlimited writes. | `server/src/routes/conversationRoutes.ts:21` |
| **M-9** | WebSocket auth computes `verifySessionToken(token)` and discards the result, so JWT expiry and `JWT_SECRET` rotation are not enforced on the WebSocket path (unlike `requireAuth`). | `server/src/services/websocket.ts:349` |
| **M-10** | Rate-limit store and socket registry are per-process in-memory maps. Correctness silently degrades the moment Render runs more than one instance; any future killswitch needs cross-instance signalling. | `server/src/middleware/rateLimiter.ts:10`; `server/src/services/websocket.ts:21-22` |

### LOW

| ID | Finding | Location |
|----|---------|----------|
| **L-1** | Client-supplied `x-request-id` is echoed into logs and into the response header without validation (log injection / header reflection). | `server/src/middleware/requestLogger.ts:15-17` |
| **L-2** | Production CORS allowlist unconditionally includes `http://localhost:5173` and `http://127.0.0.1:5173`. | `server/src/app.ts:20` |
| **L-3** | `npm audit`: 3 high advisories, all `prisma` → `@prisma/config` → `deepmerge-ts` (GHSA-ggr8-5vv4-36mx). Build tooling only; not on the runtime path. | root `package-lock.json` |
| **L-4** | `androidx.security:security-crypto` pinned to `1.1.0-alpha06` (alpha, on the production credential-storage path); BouncyCastle `1.77`. | `android/gradle/libs.versions.toml` |
| **L-5** | Documentation overstates three properties (detailed in §3.E). | `ARCHITECTURE.md:104`, `:605`, `:43`; `docs/threat-model.md` §2 |
| **L-6** | `getMessages` accepts any message id as `before` cursor, including one from another conversation — a negligible timestamp oracle. | `server/src/services/messageService.ts:161-176` |
| **L-7** | CI dependency audit is `\|\| true`; it can never fail the build. | `.github/workflows/ci.yml` (final step) |

---

## 2. Area-by-Area Audit

### 2.1 Device Revocation

**What exists.** A `Device` model (`schema.prisma:62-77`) with `userId`, `deviceName`, `platform`, `keyId`, `status`, `lastSeenAt`. Three endpoints behind `requireAuth` (`routes/deviceRoutes.ts:8-12`): list, register, revoke. `revokeDevice` performs a correct ownership check before mutating (`deviceService.ts:69-75`).

**What is missing.**

- **Revocation enforces nothing.** `revokeDevice` (`deviceService.ts:77-80`) flips a string column. Searching the server for any read of `device.status` returns only the serializer in `getDevicesByUserId`. A revoked device's session still authenticates, its socket still receives, its key is still published, and it can still send.
- **No device identity exists on the request path.** `Session` has no `deviceId` (`schema.prisma:80-91`), the JWT payload carries only `sub`/`username`/`jti` (`utils/jwt.ts:4-8`), and `requireAuth` populates `req.user` and `req.sessionId` but never a device (`middleware/authMiddleware.ts:59-67`). The server therefore *cannot* attribute a request to a device even if it wanted to. This is the structural blocker: revocation cannot be enforced until device identity is bound to the session.
- **`Device.keyId` is a dangling reference.** It is a plain string with an index but no foreign key to `PublicKey.keyId` and no uniqueness within a user. Nothing prevents two devices claiming the same `keyId`, or a `keyId` that was never published.
- **Registration is unbounded.** `registerDevice` (`deviceService.ts:33-43`) always `create`s. The docstring says "or updates last seen timestamp"; the code does not. `lastSeenAt` is never updated after insert anywhere in the codebase.
- **Race conditions.** Concurrent `registerDevice` calls produce duplicate rows (no unique constraint). `revokeDevice` is a read-then-write with no transaction, so two concurrent revokes both succeed idempotently — benign today only because the write is a constant.
- **Multi-device implications.** See H-4: because a user has exactly one `PublicKey`, "devices" are a UI list with no cryptographic meaning. Revoking device B does not stop device B decrypting, because device B holds the user's *only* identity key — and if device B was the last to publish, revoking it strands device A.

**Existing tests** (`server/test/device.test.ts`): registration success, missing `keyId` → 422, unauthenticated → 401, listing scoped to owner, revoke own → 200, revoke another user's → 403. **No test asserts that a revoked device is denied anything**, because no such behaviour exists. This is the clearest instance in the codebase of test coverage that does not imply a security property.

### 2.2 Session Security / Killswitch

**What exists.** Sessions are opaque-by-hash: a JWT is signed (`utils/jwt.ts:13-24`), its SHA-256 stored as `Session.tokenHash` (`utils/crypto.ts:23-25`, `authService.ts:63-75`), and `requireAuth` requires *both* a valid JWT signature *and* a live DB row (`authMiddleware.ts:34-56`). That is a sound design: deleting the row revokes the token immediately on the HTTP path, and the expired-session branch cleans up (`:52-56`). Logout deletes the row (`authService.ts:167-182`).

**What is missing.**

- **Sessions are not bound to devices** — no `deviceId` column, so per-device logout is impossible to express.
- **No global logout.** There is no "delete all sessions for user" endpoint. Password change does not exist as an endpoint at all, so there is no path that invalidates sessions en masse.
- **No killswitch reaches live WebSockets** (H-2). Deleting a session row is invisible to `websocket.ts`, which holds `AuthenticatedSocket.userId` in memory from connect time forever. `close()` exists but is only wired to process shutdown (`server.ts:60`).
- **Asymmetric validation** (M-9). `requireAuth` rejects on JWT failure; `authenticateToken` (`websocket.ts:345-373`) calls `verifySessionToken` at line 349 and never inspects the result. A token with an expired or invalid signature authenticates over WebSocket as long as its hash matches a row whose `expiresAt` is future. Practically the two expiries are set from the same constant so they agree — but a `JWT_SECRET` rotation (as performed in Phase 0A) does **not** invalidate WebSocket sessions the way it invalidates HTTP ones. This asymmetry is undocumented and unasserted.
- **No rotation.** Sessions have a fixed 7-day `expiresAt` (`config/env.ts:32-35`, `authService.ts:66`) with no sliding renewal and no re-issue on privilege change.
- **Replay implications.** The session token is a bearer credential accepted from either the cookie or an `Authorization: Bearer` header (`authMiddleware.ts:11-22`). There is no binding to IP, user agent, or device, so a stolen token is fully portable until it expires or is explicitly deleted.

### 2.3 Replay Protection

**Verdict: absent at every layer.**

- **Message replay.** `Message` has no unique constraint on `nonce`, no client-supplied message id, no counter (`schema.prisma:127-150`). `sendMessage` (`messageService.ts:44-71`) validates envelope *shape* and size, then inserts. Re-submitting a byte-identical captured envelope produces a new row with a new server-generated UUID. The recipient's client deduplicates on `message.id` (`useMessages.ts:246`) — which the replay does not collide with — so it renders as a genuine new message. The AAD binds `conversationId:senderId:version` (`encryption.ts:33`), which prevents *cross-context* splicing but is by construction identical across replays within the same context, so it offers no replay resistance. `ARCHITECTURE.md:104` claims otherwise; see §3.E.
- **Request replay.** No nonce, no idempotency key, no `Idempotency-Key` handling. `tempId` (`validation.ts:127`) is echoed back for optimistic-UI reconciliation and is never checked for uniqueness or reuse.
- **WebSocket replay.** Client→server frames carry no sequence number or nonce. `message.delivered`/`message.read` can be replayed or forged freely (H-5).
- **Duplicate delivery.** `sendMessage` broadcasts twice — `sendToMembers` over user sockets (`messageService.ts:107`) *and* `broadcastToConversation` over room sockets (`:113`). A client subscribed to the conversation receives the same event twice; client-side ID dedup masks it. This is a correctness smell in the fan-out design that will matter once a replay-dedup layer is added.
- **Concurrency.** `sendMessage` performs the membership read, the message insert, and the conversation `updatedAt` bump as three separate unwrapped statements (`messageService.ts:26-77`). A membership revoked between the check and the insert still lands the message. No transaction boundary exists anywhere in the messaging path.
- **Database-level enforcement.** None. The only uniqueness constraints in the schema are `users.username`, `users.email`, `sessions.tokenHash`, `public_keys.userId`, `public_keys.keyId`, `conversations.directKey`, `conversation_members(conversationId,userId)`, `system_info.key`.

### 2.4 Nonce / Counter Safety

- **Generation.** Web: `crypto.getRandomValues(new Uint8Array(12))` (`encryption.ts:30`). Android: `SecureRandom` into a 12-byte array (`Crypto.kt`, `AeadCipherEngine.encrypt`). Both are CSPRNG-sourced and correctly sized for GCM. Android additionally accepts a `customNonce` parameter — present for test-vector reproduction, but it is a production-reachable code path that would allow a caller to force nonce reuse.
- **Uniqueness is probabilistic, not enforced.** There is no counter, no persisted high-water mark, no client-side seen-set, and no server-side constraint. The server stores `nonce` as an unindexed, unconstrained string.
- **The exposure is amplified by the key design.** Because `deriveConversationKey` (`keyExchange.ts:10-52`) is a pure function of two static identity keys and the conversation id, a single AES key covers the entire lifetime of a conversation and is used by **both** participants for **all** messages. All GCM invocations under that key therefore share one nonce space. NIST SP 800-38D caps a single key at 2³² invocations with random 96-bit IVs; a repeat leaks the XOR of two plaintexts and enables authentication-key recovery (the "forbidden attack"), i.e. forgery. At realistic messaging volumes this bound is not approached, which is why this is rated MEDIUM and not higher — but the system has no mechanism that would detect or prevent approaching it, and no rekey trigger.
- **Multi-device.** With H-4 unresolved, two devices sharing one identity key derive the *same* conversation key and draw from the same nonce space independently, doubling the birthday exposure with no coordination.
- **Failure/retry.** `retryMessage` (`useMessages.ts:392-434`) re-encrypts the plaintext from scratch, producing a fresh nonce rather than replaying the original envelope. That is the correct choice for nonce safety, and it is the reason a failed send does not create a nonce-reuse hazard. It does, however, mean a retry after a send that actually succeeded server-side creates a duplicate message.

### 2.5 WebSocket Security

- **Handshake.** `WebSocketServer({ server, path: '/ws', maxPayload: 64*1024 })` (`websocket.ts:43-47`). No `verifyClient`, no `Origin` check, no per-IP connection cap, no handshake rate limit. → **C-2**.
- **Authentication.** Cookie parsed manually from the upgrade request (`:319-340`), or a late `auth` frame carrying a raw token (`:120-133`). Failure to authenticate does **not** close the socket — an unauthenticated socket stays open indefinitely, consuming a connection slot and able to send frames (which are then rejected individually). Unbounded unauthenticated sockets are a trivial resource-exhaustion vector.
- **Authorization.** `subscribe` is correctly gated by `ConversationService.verifyMembership` (`:141-154`), and `server/test/websocket.test.ts:247` covers non-member rejection. But `unsubscribe` (`:161-165`) has no auth check, and the two receipt frames (`:167-196`) check only `ws.userId` truthiness — never membership. → **H-5**.
- **Subscription is not the security boundary anyway.** `sendToMembers` (`:297-308`) delivers to every socket in `userSockets[userId]` regardless of subscription. Any socket that authenticates as a user receives that user's entire live message stream with full envelopes. This is what makes C-2 a full compromise rather than a nuisance.
- **Device/session binding.** None. The socket stores only `userId` (`:206-212`). Neither the session id nor a device id is retained, so a socket cannot later be matched to a revoked session or device even if a killswitch were added — the killswitch would have to close *all* of a user's sockets indiscriminately.
- **Lifecycle.** 30s ping/pong liveness with terminate-on-miss (`:86-97`) is correct. Disconnect cleanup is correct and complete (`:242-258`). Graceful drain on shutdown is correct (`:378-410`).
- **Stale connections after revocation/logout.** The client calls `wsClient.disconnect()` on logout (`AuthContext.tsx:65`), which is *client-side courtesy only*. An attacker's socket ignores it. → **H-2**.
- **Cross-user access.** No path was found that leaks another user's data to a socket, *given* the socket's `userId` is legitimate. The failure mode is C-2 — obtaining a socket bound to someone else's `userId` in the first place.

### 2.6 CSRF

This is the area with the most serious gap, and the audit's central finding.

**Current posture.** `httpOnly: true`, `secure` in production, `sameSite: 'none'` in production / `'lax'` in development (`authController.ts:14-21`). The `SameSite=None` choice is deliberate and correct *for the deployment topology* — the comment at `:8-13` accurately explains that Vercel and Render are different sites and `Lax` would break every authenticated `fetch`. The problem is that nothing was added to replace the protection that `SameSite` was providing.

**There is no CSRF defense of any kind.** No token, no double-submit cookie, no custom-header requirement, no `Origin`/`Referer` validation. The word "csrf" does not appear in `server/src`.

**CORS is not a substitute, and the body parser widens the hole.** `cors({ origin: [...], credentials: true })` (`app.ts:18-23`) governs whether a cross-origin *response* may be read; it does not prevent the request from executing. `app.use(express.urlencoded({ extended: true, limit: '1mb' }))` (`app.ts:26`) means a plain cross-origin HTML `<form method="POST">` — a CORS-"simple" request that triggers no preflight — is parsed into `req.body` and processed normally.

**Exploitable endpoints** (all state-changing, all reachable by cross-origin form POST, all carrying the victim's cookie):

| Endpoint | Impact |
|---|---|
| `POST /api/crypto/identity` | **Overwrite the victim's E2EE public key.** `publishKeySchema` (`validation.ts:104-108`) accepts three plain strings — exactly what a form body provides. → **C-1** |
| `POST /api/devices/register` | Inject attacker-controlled device rows |
| `POST /api/devices/:id/revoke` | Revoke the victim's devices (no body required) |
| `POST /api/conversations` | Force conversations with attacker-chosen users (`recipientUsername` is a plain string) |
| `POST /api/conversations/:id/clear` | Destroy the victim's view of a conversation |
| `POST /api/auth/logout` | Forced logout |

`POST .../messages` is *incidentally* protected because `encryptedEnvelopeSchema` requires `version` to be a `z.number()` (`validation.ts:112`) and urlencoded bodies yield strings; `DELETE` is protected because it forces a preflight. Neither is a designed defense and neither should be relied on.

**WebSocket handshake implications.** `SameSite=None` also means the cookie rides along on a cross-site WebSocket upgrade, which is precisely why C-2 works. A CSRF token cannot defend the handshake — the browser WebSocket API cannot set custom headers. **Origin validation is the only mechanism that covers both the HTTP endpoints and the WebSocket upgrade**, which makes it the mandatory element of any fix.

**Browser threat model.** Attacker controls a page the victim visits while holding a live Vade session. No XSS on the Vade origin is required. No network position is required. This is the classic drive-by CSRF model, and the application is fully exposed to it.

### 2.7 Peer Key Cache

`fetchPeerPublicKey` (`keyManager.ts:141-159`) fetches `GET /crypto/users/:userId/key` and memoises into a module-level `Map` keyed by peer user id.

- **No invalidation.** No TTL, no revalidation, no ETag. `clearPeerKeyCache()` (`:161-163`) exists and **has no call sites** — confirmed by repository-wide grep.
- **Cache lifetime is the JS module lifetime**, i.e. until a full page reload. It survives logout and login-as-a-different-user in the same tab, so user B inherits user A's cached peer keys. The material is public, so the confidentiality impact is nil; the correctness impact is that B may encrypt to a key A cached.
- **Device revocation interaction.** None — nothing about revocation propagates to a cached key, and no revoked-key concept is exposed by the API. `PublicKey.status` exists in the schema (`schema.prisma:51`) but is never written by `publishPublicKey` and is not even `select`ed in either read path (`cryptoService.ts:25-33`, `:61-69`). Revoked keys are unrepresentable end-to-end.
- **Key rotation.** A peer who rotates is not observed until reload. On reload, `useContactSecurity` (`:62-74`) compares the fetched `keyId` against locally stored verification. If the contact was **previously verified**, state becomes `key_changed` and the UI warns. If the contact was **never verified** — the default for every contact — the swap produces state `unverified`, which is indistinguishable from the normal steady state. A silent substitution against an unverified contact is therefore invisible.
- **TOCTOU.** `initCrypto` (`useMessages.ts:37-63`) resolves the peer key once per conversation mount and caches the derived `CryptoKey` in `convKeyRef`. Every subsequent send in that session uses it. There is no re-check of `senderKeyId`/`recipientKeyId` against the current key at either encrypt or decrypt time (`decryptBatch`, `:93-113`, ignores both fields entirely), so a key change mid-session is neither detected nor surfaced.
- **Trust model.** Effectively trust-on-first-use with a manual, optional, out-of-band upgrade — and the TOFU pin is only recorded if the user explicitly taps "verify". Without that action there is no pin at all.
- **Multi-device.** Not applicable in the current model (one key per user); becomes the central problem once H-4 is addressed.

### 2.8 Double Ratchet / E2EE

**Explicit determination: this is not a Double Ratchet, and it is not the static-ephemeral scheme the documentation claims. It is static-static ECDH with a single permanent conversation key.**

**Implemented cryptography** (verified in source, both platforms):

| Element | Implementation |
|---|---|
| Identity keys | ECDH P-256, non-extractable. Web: `generateKey(..., false, ['deriveKey','deriveBits'])` (`keyManager.ts:58-62`), stored as a `CryptoKey` in IndexedDB (`cryptoStorage.ts:65-100`). Android: hardware-backed `AndroidKeyStore`, `PURPOSE_AGREE_KEY` (`Crypto.kt`, `KeyStoreManager.generateIdentityKeyPair`). Both correct and non-exportable. |
| Key agreement | `ECDH(myStaticPrivate, peerStaticPublic)` → 256 bits (`keyExchange.ts:16-23`) |
| KDF | HKDF-SHA-256, `salt = conversationId`, `info = "enctxt-v1-e2ee"`, 256-bit output (`keyExchange.ts:36-50`). Android reimplements RFC 5869 by hand (`HkdfKeyDerivation.deriveAesKey`) and is cross-validated against shared vectors in `docs/test-vectors/`. |
| AEAD | AES-256-GCM, 96-bit random IV, 128-bit tag, AAD = `conversationId:senderId:v1` (`encryption.ts:22-58`) |
| Downgrade defense | Version, algorithm, and key-agreement allowlists enforced at decrypt on both platforms (`decryption.ts:32-44`; `Crypto.kt` `AeadCipherEngine.decrypt`). Correct and genuinely useful. |
| Fail-closed decrypt | Generic `DecryptionError`, no oracle in the message (`decryption.ts:66-69`) |

**Consequences of the design, stated plainly:**

- **No forward secrecy.** Both inputs to the key are long-term. Compromise of one identity private key decrypts every message in every conversation that key participates in — past and future.
- **No post-compromise security / no healing.** There is no ratchet step, no ephemeral key, no chain key. Once compromised, always compromised, until identity keys are manually regenerated on both sides.
- **No replay resistance.** See §2.3.
- **Key identifiers are carried but not enforced.** `senderKeyId`/`recipientKeyId` are stored (`schema.prisma:133-134`) and populated (`useMessages.ts:336-337`) but are not inputs to the AAD and are never compared at decrypt. They are metadata, not a binding.
- **A cross-platform inconsistency in the `aad` column.** Web writes base64 of the AAD bytes (`encryption.ts:57`); Android writes the raw string (`Crypto.kt`, `EncryptedEnvelopeDto(aad = aadString)`). This is currently harmless *only* because both platforms reconstruct the AAD from context at decrypt and never read the stored field — but it means the column is not a reliable record of what was authenticated, and any future code that trusts it will break across platforms.
- **Recovery.** None. Losing the IndexedDB store or the Keystore entry permanently loses all history; the code correctly refuses to silently regenerate over an existing Keystore key (`IdentityKeyPresence.Unknown`, `Crypto.kt:28-52`), which is a genuinely good defensive decision.

**Planned vs implemented.** `ARCHITECTURE.md:605` and `docs/threat-model.md` §3.1 correctly disclaim Double Ratchet and per-message forward secrecy. That honesty is preserved here. The correction needed is narrower: the scheme is **static-static**, not "static-ephemeral" — there is no ephemeral key anywhere in the protocol.

### 2.9 Protected Text

Implementation: `client/src/utils/protectedText/` (homoglyph / illusion / pattern renderers behind `protectedTextEngine.protect(content, mode)`), rendered through `MessageBubble.tsx`, with reveal lifecycle in `useMessageReveal.ts`.

- **Threat model — accurate as scoped.** This is a *visual* privacy layer against shoulder-surfing and casual observation. It is explicitly not cryptographic (`protectMessage.ts:9`), and `docs/threat-model.md` §3.3 says so. That framing is correct and should be preserved verbatim.
- **Key handling.** None — the protected form is a deterministic transform of the plaintext, not an encryption of it. There is no key to leak.
- **Plaintext residency.** Decrypted plaintext lives in the `decryptedMap` React state for the entire conversation session (`useMessages.ts:20`, cleared only on conversation change, `:309-314`) and is passed as a prop to the bubble in **both** the protected and revealed branches (`MessageBubble.tsx:115,122`). The protected rendering therefore does not reduce in-memory plaintext exposure at all; it only controls what is painted. Any XSS or DevTools access reads plaintext regardless of protection state. This is inherent to a client-side reveal feature and is acceptable — but it must not be described as reducing memory exposure.
- **Auto re-protection.** Correct and reasonably thorough: `visibilitychange` and window `blur` both hide everything (`useMessageReveal.ts:148-167`), plus cleanup on unmount and on logout (`:170-176`).
- **Expiration.** Fixed 6s window, deliberately not user-configurable, with the rationale documented at `useMessageReveal.ts:4-8`. Sound.
- **Screen capture.** Android sets `FLAG_SECURE` during reveal and clears it after (`UI.kt:1259-1277`). The web client has no equivalent and cannot have one. `docs/threat-model.md` §2 lists FLAG_SECURE without qualifying it as Android-only.
- **Clipboard / DOM / logs.** No clipboard write path was found. No plaintext reaches `console.*` (verified by grep across `client/src` — the 13 console calls are all error paths logging error objects). No plaintext is persisted to `localStorage`, `sessionStorage`, or IndexedDB.
- **Replay / device interaction.** Not applicable; protection state is per-render and never transmitted.

### 2.10 Gesture Security

- **Security relevance: it is a local UI gate, not authentication.** `verifyStep` (`useGesture.ts:68-78`) compares a drawn stroke against a template read from `localStorage` and returns a boolean. The plaintext it gates is already decrypted and in memory. A `false` return withholds a render; it withholds nothing else.
- **Spoofing / bypass.** Trivial for anyone with script access: read the template from `localStorage` (web, plaintext — `gestureStorage.ts:55`), or call the reveal action directly, or read `decryptedMap`. This is not a flaw in the gesture matcher; it is the correct characterisation of the control's scope.
- **Lockout is defeated by a reload** (M-5). `failedAttempts` and `lockedUntil` are React state (`useMessageReveal.ts:15-16`), so the documented "5 attempts / 30s lockout" resets on refresh. The control as *described* does not hold; the control as *scoped* (deter a bystander with the device in hand) largely does.
- **False positives/negatives.** `isDistinctiveShape` refuses to enrol straight swipes at both the UI and hook layers (`useGesture.ts:47-50`) — a genuinely good defense against a template that would unlock against unrelated gestures. Discrimination is covered by tests on both platforms (`client/test/gestureDiscrimination.test.ts`, `android/.../GestureDiscriminationTest.kt`, `GestureSecurityRegressionTest.kt`).
- **Does gesture data become security-sensitive?** On the web, yes in a limited sense: the template is a stable per-user, biometric-adjacent artifact sitting in plaintext `localStorage`, readable by any XSS. Android stores it in `EncryptedSharedPreferences` (`GestureStorage.kt:84-96`). The web/Android asymmetry is not documented.
- **Client/server trust boundary.** Clean: gesture data never leaves the client. No endpoint accepts it, `logger.ts:20-23` redacts gesture keys defensively anyway, and no WebSocket frame carries it. This boundary is correctly implemented and should be preserved.

### 2.11 Database Security

- **Access pattern.** Prisma throughout; no raw SQL except the `SELECT 1` health probe (`db.ts:38`). No string-concatenated queries anywhere. SQL injection risk is effectively nil.
- **Authorization boundaries.** Ownership/membership is enforced in service code on every read and write path that was examined: conversations (`conversationService.ts:325-328`), messages read (`messageService.ts:149-152`), messages write (`:39-42`), delete (`:285-297`), clear (`conversationService.ts:265-274`), devices (`deviceService.ts:73-75`). These checks are consistent and correct. The weakness is that they are *application-layer only* — there is no row-level security and no query-level scoping helper, so a single future query that forgets the check silently becomes an IDOR.
- **Foreign keys.** Present and `ON DELETE CASCADE` on all six relations (`20260827085453_init/migration.sql`). `Device.keyId` → `PublicKey.keyId` is the notable *missing* FK.
- **Unique constraints.** Adequate for identity, absent for everything Phase 0B needs: no `(userId, keyId)` on devices, no nonce/message-id uniqueness, no session-device pairing.
- **Race conditions & transactions.** **No `$transaction` call exists anywhere in `server/src`.** Multi-statement operations that should be atomic are not: `sendMessage` (membership check → insert → conversation bump, `messageService.ts:26-77`), registration (username check → email check → create, `authService.ts:27-60`, racing to a unique-constraint 500 rather than a clean 400), and `createOrGetConversation` (find → create, `conversationService.ts:85-140`, protected only by the `directKey` unique constraint, which surfaces as an unhandled exception under concurrency rather than a retry).
- **Sensitive data exposure.** `Message.ciphertext` is the only message content stored, and delete genuinely wipes it rather than flagging it (`messageService.ts:303-313`) — a real deletion, correctly implemented. `passwordHash` is bcrypt cost 12 (`utils/crypto.ts:4`) and is never selected into a response. `Session.tokenHash` is SHA-256 of the token, so a database read does not yield usable session tokens — but note that SHA-256 of a high-entropy JWT is preimage-safe here only because the token itself is unguessable.
- **Logging.** Prisma query logging is enabled only in development (`db.ts:14-29`); production emits `error` events only, and even those are not subscribed to a handler.
- **Neon-specific.** `schema.prisma:8-11` declares only `url`; there is no `directUrl`. The uncommitted `.env.example` and `docs/phase-0A5-neon-migration-preparation.md` correctly document that `DIRECT_URL` is inert without a matching `directUrl` in the datasource block. If production `DATABASE_URL` currently points at a **pooled** Neon endpoint, `prisma migrate deploy` cannot run through PgBouncer — this must be settled before any Phase 0B migration ships. **This requires production verification and was not verified here.**
- **Connection handling.** A single lazily-constructed `PrismaClient` (`db.ts:11-33`) with no explicit `connection_limit`. On Neon's pooled endpoint under Render's process model this is workable but unverified; no pool-exhaustion behaviour was tested.

### 2.12 Authentication / Authorization

- **Registration** (`authService.ts:20-92`). Normalises username/email to lowercase, checks both for uniqueness, bcrypt cost 12. Password policy is length-only: 8–128 characters (`validation.ts:20-23`), with no complexity requirement, no breach-list check, and no effective rate limit (H-6). Non-atomic (see §2.11).
- **Login** (`:97-162`). Correct constant-message failure on both "no such user" and "bad password" (`:119`, `:129`), properly tested (`auth.test.ts:200`). Note the timing side channel: the no-user branch returns *without* a bcrypt comparison, so response time distinguishes existing from non-existing accounts. Mitigating this requires a dummy hash comparison.
- **JWT validation.** Algorithm pinned to HS256 on both sign and verify (`utils/jwt.ts:22,32`), correctly foreclosing `alg: none` and algorithm confusion. No `iss`/`aud` claims are set or checked — acceptable for a single-audience token, worth adding for defense in depth.
- **Session lookup.** Sound; see §2.2.
- **Ownership / membership.** Consistently enforced; see §2.11.
- **IDOR / BOLA.** No horizontal-access flaw was found in the HTTP API. Every object-scoped route re-derives authorization from `req.user.id` rather than trusting a client-supplied owner id. The two BOLA-shaped exposures are **not** on the HTTP path: the WebSocket receipt frames (H-5) and the socket-level identity in C-2.
- **Privilege escalation.** No roles or admin surface exists, so there is no vertical escalation path. `GET /api/crypto/users/:userId/key` is authenticated and returns any user's public key (`cryptoRoutes.ts:14`) — correct by design for a key directory, though it does allow authenticated enumeration of which users have published keys.
- **`optionalAuth` on logout** (`authRoutes.ts:18`) means an unauthenticated logout returns 200 and clears the cookie. Harmless in itself; it is one of the CSRF-reachable endpoints.

### 2.13 Input / API Security

- **Schema validation.** Zod on all auth, profile, search, conversation, key-publish, and message bodies (`utils/validation.ts`). Coverage is good. The gap is `deviceController.registerDevice` (`:28-32`), which hand-rolls a `typeof keyId === 'string'` check and applies **no length bound and no format constraint** to `deviceName`, `platform`, or `keyId` — the only route bypassing the Zod layer.
- **Malformed input.** `express.json()` parse failures land in `errorHandler` and return a generic 500 rather than a 400 (`errorHandler.ts:38-46`) — a correctness wart, not a vulnerability. Malformed WebSocket frames are caught and answered with a generic error (`websocket.ts:69-72`).
- **Oversized payloads.** 1MB body limit (`app.ts:25-26`), 64KB WebSocket frame cap (`websocket.ts:46`), 64KB ciphertext cap enforced twice — in Zod (`validation.ts:121`) and again in the service (`messageService.ts:50-52`). Layered and correct.
- **Rate limiting / abuse.** See H-6. Additionally the limiter keys on `${req.baseUrl}${req.path}:${ip}`, so register and login have *separate* buckets rather than a shared credential-attack budget.
- **Error leakage.** Production suppresses messages and stacks for unhandled errors (`errorHandler.ts:35,42-44`). `AppError` messages are intentionally returned and were reviewed — none leak internal state. Validation errors return `error.format()` (`authController.ts:47`), which echoes field structure; low risk, but it is the most verbose response the API produces.
- **HTTP method enforcement.** Express routing enforces methods; unmatched routes hit `notFoundHandler`. No method-override middleware is present.
- **Content-type enforcement.** **Not enforced.** Accepting `application/x-www-form-urlencoded` on JSON-only APIs is exactly what makes C-1 exploitable. No route asserts a content type.

### 2.14 Client Security

- **Architecture.** React 18 + Vite 6 + react-router 7. Auth state in context (`AuthContext.tsx`), no global store.
- **Cookies.** `httpOnly` session cookie, never read by JS. Correct.
- **localStorage.** Three consumers: theme, gesture templates (`enctxt_gesture_<userId>`, plaintext), contact verifications (`enctxt_verified_contacts_v1`, plaintext). The verification store is security-relevant: an XSS that rewrites it can mark an attacker's substituted key as "verified", suppressing the `key_changed` warning that is the only defense against C-1's aftermath.
- **sessionStorage.** Unused.
- **IndexedDB.** Identity keypair as non-extractable `CryptoKey` objects (`cryptoStorage.ts:65-100`). This is the right primitive — XSS can *use* the key but cannot exfiltrate it. Note the in-memory fallback (`:19`, `:80-83`): if IndexedDB is unavailable, keys are regenerated per page load and messages become undecryptable. The `openDB` comment (`:44-51`) documents a real prior incident of exactly this.
- **Memory-only secrets.** Derived conversation key (`convKeyRef`, non-extractable), plaintexts (`decryptedMap`). Neither persists.
- **DOM exposure / XSS.** No `dangerouslySetInnerHTML`, no `eval`, no `innerHTML` assignment found in `client/src`. React's default escaping is relied on throughout. The server CSP is strict (`script-src 'self'`, `frame-ancestors 'none'`, `securityHeaders.ts:8-11`) — **but the client is served by Vercel, not by this Express app, so that CSP does not apply to the HTML document that loads the React bundle.** `vercel.json` sets no headers. **The web application origin currently ships with no CSP at all.** This is a meaningful gap given that XSS on the Vade origin defeats every client-side control at once.
- **Dependencies.** Small, mainstream surface (`clsx`, `lucide-react`, `qrcode.react`, `tailwind-merge`, `react-router-dom`). No client-side runtime advisories in `npm audit`.
- **API / WebSocket URL handling.** Both derive from `VITE_API_URL` at build time (`api.ts:3`, `websocket.ts:45-59`) with sane same-origin fallbacks. Not attacker-influenceable at runtime.
- **Cryptographic material handling.** Non-extractable keys and no plaintext persistence are the two decisions that matter most, and both are made correctly. The gap is lifecycle: nothing is cleared on logout (M-4).

### 2.15 Android

**Production relevance: production-targeted, not production-distributed.** The release build hardcodes `https://vade-api.onrender.com/api` and `wss://vade-api.onrender.com/ws` (`app/build.gradle.kts:99-100`) and is versioned `1.0.0-rc.1`. No release keystore is present, and the task-graph guard (`:220-272`) hard-fails any release artifact that would be debug-signed unless explicitly opted into. So no signed build is distributable today — but **any debug or RC build talks to production**, and can publish a public key that overwrites the web client's (H-4). Android is therefore production-*impacting* even while unshipped.

- **Credential/key storage.** Best-in-class relative to the rest of the codebase. Identity key: hardware-backed `AndroidKeyStore`, `PURPOSE_AGREE_KEY`, never exportable. Session cookie ("remember me"), gesture templates, and verification records: `EncryptedSharedPreferences` with an AES256-GCM master key, all three failing **closed** to a no-op rather than degrading to plaintext (`SessionCookieStore.kt:31-49`, `GestureStorage.kt:84-96`). `allowBackup="false"` and `dataExtractionRules="@null"` (`AndroidManifest.xml`) correctly keep this material out of device backups.
- **WebView/native boundary.** None — pure Compose, no WebView anywhere. This removes an entire vulnerability class.
- **Network security.** `cleartextTrafficPermitted="false"` in base config, user CAs trusted only under `debug-overrides` (`network_security_config.xml`). Correct. **No certificate pinning** — worth flagging as a deliberate future decision rather than a defect.
- **Crypto implementation.** Mirrors the web protocol exactly, cross-validated against shared vectors in `docs/test-vectors/` (`CryptoTestVectorsTest.kt`, `E2eeMessagingPipelineTest.kt`). It inherits every protocol-level weakness in §2.8 — same static-static ECDH, same permanent key, same replay exposure. Two Android-specific notes: the `customNonce` parameter is production-reachable, and the `aad` field is serialised differently from web (§2.8).
- **Device identity.** `deriveKeyId(publicKeyBase64) = "k_" + SHA-256(pubkey)[:32]` (`Crypto.kt:117-124`) — **this is the right design**, binding the key id to the key material, and it is exactly what the web client does *not* do (`keyManager.ts:64` uses a random UUID). Any Phase 0B key-identity work should adopt the Android approach.
- **Session handling.** In-memory `CookieJar` plus opt-in encrypted persistence; `logout()` clears the jar (`Network.kt:113-117`). It inherits H-2 — the app's WebSocket is not force-closed by server-side revocation.
- **Verdict: defer Android-specific work; include Android in protocol-level work.** Nothing in Android needs a Phase 0B change *for Android's own sake*. But every protocol change (replay protection, key identity, device binding, multi-device) is a cross-platform contract change and must land on Android in the same increment, or the two clients will silently diverge.

### 2.16 Logging / Observability

- **Secrets/tokens in logs.** None found. `logger.ts:3-27` maintains a redaction key-set covering passwords, tokens, keys, ciphertext, nonces, AAD, envelopes, gestures, and plaintext, applied recursively with key normalisation (`:34`). Reviewing every `logger.*` call site in `server/src`, no sensitive value is passed. This is a genuinely well-built control.
- **Ciphertext leakage.** None. `messageService.ts:80-86` logs ids and version only.
- **PII leakage.** `userId` and `username` are logged on auth events (`authService.ts:77-81`, `:147-151`) and `participants` on conversation creation (`conversationService.ts:142-146`). Appropriate for a security audit trail; worth an explicit retention decision.
- **Auth event logging.** Login success/failure and registration success are logged with an `event` field. **Gaps:** no logging on logout-by-expiry, no logging of `requireAuth` rejections, no logging of authorization failures (403s are logged only as generic `AppError` warnings without actor identity), no WebSocket authentication-failure logging, and no device-revocation-enforcement events (because no enforcement exists).
- **Production error handling.** Correct suppression (§2.13). No error-tracking integration (no Sentry or equivalent), so unhandled production errors exist only in Render's stdout.
- **Structural gap.** Logs are unstructured strings to `console.*` with no aggregation, no alerting, and no retention policy. **There is no mechanism by which any of the attacks in §4 would be noticed.**

### 2.17 Dependency / Supply Chain

- **Runtime (server):** `express@^4.21.2`, `ws@^8.21.3`, `jsonwebtoken@^9.0.3`, `bcryptjs@^3.0.3`, `zod@^3.24.2`, `@prisma/client@^6.4.1`, `cors@^2.8.5`, `cookie-parser@^1.4.7`, `dotenv@^16.4.7`. All current-major and free of runtime advisories in the current audit. **Conspicuously absent: any CSRF library** (`csurf` is deprecated; the modern answer is `csrf-csrf` or a hand-rolled double-submit plus origin check).
- **`npm audit`:** 3 high, single chain — `prisma` (devDependency) → `@prisma/config` → `deepmerge-ts <8.0.0` (GHSA-ggr8-5vv4-36mx, stack exhaustion). **Build tooling only, not reachable at runtime.** Not upgraded, per audit constraints.
- **Crypto dependencies:** the web and Node paths use only platform primitives (Web Crypto, `node:crypto`) — no third-party crypto library on the message path, which is the correct posture. Android adds BouncyCastle `1.77` (`libs.versions.toml`), used mainly for test-vector work; 1.77 predates several 1.78/1.79 fixes and should be reviewed on its own schedule.
- **`androidx.security:security-crypto:1.1.0-alpha06`** is an **alpha** dependency sitting on the production credential-storage path. Worth an explicit accept/replace decision.
- **Build tooling:** Vite 6, TypeScript 5.8, Vitest 4, Gradle/AGP 8.3.2, Kotlin 1.9.23. No lockfile anomalies or unexpected transitive publishers were observed.
- **CI:** the dependency audit step cannot fail the build (L-7). There is no SBOM, no dependency pinning beyond the lockfile, and no provenance verification.

### 2.18 Test Coverage vs. Security Controls

| Control | Coverage | Assessment |
|---|---|---|
| Password hashing | Indirect (login/register round-trip) | No direct assertion of cost factor |
| User enumeration resistance | `auth.test.ts:200` | **Direct.** Timing channel untested |
| Session creation / cookie flags | `auth.test.ts:9,19` | **Direct** on `SameSite`/`Secure` |
| Session invalidation on logout | `auth.test.ts:266` | **Direct**, HTTP path only |
| Unauthenticated rejection | Many, all route groups | **Direct and thorough** |
| Conversation membership (HTTP) | `conversation.test.ts:230`, `message.test.ts:209,242,292` | **Direct and thorough** |
| Sender-only message delete | `message.test.ts:277,292` | **Direct** |
| Device ownership on revoke | `device.test.ts:139` | **Direct** — but revocation *enforcement* is untested because unimplemented |
| Payload size limits | `message.test.ts:142` | **Direct** |
| Envelope schema / downgrade defense | `crossPlatformCrypto.test.ts`, `client/test/crypto.test.ts` | **Direct** |
| Cross-platform crypto equivalence | Shared vectors, both platforms | **Direct and unusually good** |
| Security headers | `securityHeaders*.test.ts` | **Direct** — but only for the API origin, not the Vercel-served app |
| Production config validation | `productionConfig.test.ts` | **Direct** |
| WebSocket auth + subscribe authz | `websocket.test.ts:186-263` | **Direct** |
| Gesture discrimination / regression | Both platforms | **Direct** |

**No coverage whatsoever:**

1. CSRF — no test sends a cross-origin or form-encoded state-changing request.
2. WebSocket `Origin` validation — no test asserts a rejected origin.
3. Revoked-device enforcement — nothing to test.
4. Session killswitch over WebSocket — no test that a socket dies when its session is deleted.
5. Message replay — no test that a duplicate envelope is rejected.
6. WebSocket receipt authorization — `message.delivered`/`message.read` membership is untested.
7. Rate limiting — the limiter is short-circuited entirely under `NODE_ENV=test` (`rateLimiter.ts:24`), so it is **never exercised by any test**.
8. Concurrency/races — no concurrent-request test anywhere; no transaction boundaries to test.
9. Multi-device key collision — no test that a second `publishPublicKey` displaces the first from another device's perspective.
10. Nonce uniqueness — no test, adversarial or statistical.
11. Peer key cache invalidation — no test (nothing invalidates).
12. Key substitution / MITM — no adversarial test that a swapped key is detected.
13. Logout hygiene on the client — no test that key material is cleared.

**Adversarial testing as a category is absent.** Every existing test asserts that a legitimate actor succeeds or that an obviously-illegitimate actor is refused at a check that already exists. No test attempts to defeat a control.

---

## 3. Architectural Boundaries

Categories are exclusive; nothing appears twice.

### A. Already implemented and verified (source review + direct test)
- Password hashing, bcrypt cost 12 · `utils/crypto.ts:4`
- Constant-message login failure (user-enumeration resistance) · `authService.ts:119,129`
- Session token stored only as SHA-256 hash · `utils/crypto.ts:23-25`
- HTTP session revocation via DB lookup on every request · `authMiddleware.ts:42-56`
- JWT algorithm pinning (HS256, both directions) · `utils/jwt.ts:22,32`
- Conversation membership authorization on every HTTP message/conversation route
- Sender-only delete-for-everyone with genuine ciphertext wipe · `messageService.ts:303-313`
- Payload size limits, triple-layered (body / frame / ciphertext)
- AEAD downgrade defense (version + algorithm + key-agreement allowlists), both platforms
- Non-extractable identity private keys, both platforms
- Cross-platform crypto equivalence against shared vectors
- Log redaction of sensitive keys · `utils/logger.ts:3-27`
- Production env validation (secret strength, no wildcard CORS) · `config/env.ts:37-79`
- Security headers on the API origin · `middleware/securityHeaders.ts`
- Android: hardware-backed keystore, encrypted preferences failing closed, cleartext disabled, no WebView, fail-closed release signing
- WebSocket subscribe authorization and heartbeat/drain lifecycle

### B. Implemented but insufficient
- **Device revocation** — status flag with no enforcement (H-1)
- **Session management** — no device binding, no global logout, no rotation (§2.2)
- **WebSocket authentication** — one-shot, never revalidated, JWT result discarded (H-2, M-9)
- **Rate limiting** — broken behind proxy, auth-routes-only, test-bypassed (H-6)
- **Key-change detection** — verified contacts only, defeated by an uninvalidated cache (M-3)
- **Gesture lockout** — resets on reload (M-5)
- **Peer key cache** — no invalidation path is wired (M-3)
- **CORS** — correct for response reading, misread as request protection (C-1)
- **Envelope validation** — validates shape, not cryptographic well-formedness (M-6)

### C. Partially implemented
- **Device lifecycle** — register and revoke exist; no dedupe, no cap, no `lastSeenAt` update, no unregister
- **`PublicKey.status`** — column exists (`schema.prisma:51`), never written, never read, not even selected
- **Client crypto lifecycle** — creation and use are complete; teardown (`clearPeerKeyCache`, `deleteIdentityKeys`) is written but never called
- **Security event logging** — auth successes and failures logged; authorization failures and WebSocket events not
- **Android production readiness** — fully built and pointed at production; not signed, not distributed

### D. Missing entirely
- CSRF protection (token, double-submit, or custom-header requirement)
- `Origin` / `Referer` validation on HTTP and on the WebSocket upgrade
- Replay protection (nonce uniqueness, message ids, counters, idempotency)
- Session killswitch / server-initiated socket termination
- Device→session binding
- WebSocket receipt authorization
- `trust proxy` configuration
- Database transactions (zero `$transaction` calls in the codebase)
- Content-Security-Policy on the Vercel-served web origin
- Forward secrecy and post-compromise security
- Multi-device key model
- Key revocation as an end-to-end concept
- Rate limiting outside `/auth`
- Adversarial and concurrency test suites

### E. Architecturally ambiguous
- **`aad` column semantics** — base64 on web, raw string on Android, read by neither. Undefined contract.
- **`senderKeyId` / `recipientKeyId`** — stored, transmitted, never enforced. Metadata or binding?
- **`Device.keyId` vs `PublicKey.keyId`** — same namespace, no FK, different generation strategies per platform (random UUID on web, content-derived on Android).
- **"Device" as a concept** — currently a UI list row with no cryptographic or session identity. It is undefined what a device *is*.
- **Documentation vs implementation** — four claims overstate the system:
  - `ARCHITECTURE.md:104` — AAD binding described as "preventing replay". It prevents cross-context splicing, not replay (§2.3).
  - `ARCHITECTURE.md:605` — "static-ephemeral ECDH". The implementation is **static-static**; no ephemeral key exists (§2.8).
  - `ARCHITECTURE.md:43` — key rotations "immediately flag contacts as KeyChanged". True only for previously-verified contacts, and only after a page reload clears the peer cache (§2.7).
  - `docs/threat-model.md` §2 — "Gesture Template Theft → Encrypted Preferences" and "FLAG_SECURE" are **Android-only**; the web client stores gesture templates in plaintext and has no screen-capture defense.

### F. Requires a design decision before implementation
1. **Multi-device key model.** One key per user (status quo, single-device-only, must then be *enforced*) vs. per-device keys with fan-out encryption (multi-device, N ciphertexts per message, schema change). **This decision gates device revocation, key revocation, and peer key cache design.** Nothing in those areas should be built before it is settled.
2. **CSRF defense shape**, which follows from a deployment-topology decision: keep Vercel+Render cross-site (`SameSite=None` → requires CSRF token **and** origin check) vs. proxy the API under the web origin (`SameSite=Strict/Lax` → origin check largely sufficient). **This gates all C-1 work.**
3. **Replay-protection mechanism.** Client-generated message UUID with a DB unique constraint (simple, idempotent-friendly) vs. per-conversation monotonic counter (stronger ordering guarantees, harder with multi-device).
4. **Ratchet adoption.** Whether Phase 0B introduces forward secrecy at all, or formally defers it to a Protocol v2 with the current limitation documented and accepted.
5. **Revocation semantics.** Does revoking a device revoke its *key* (breaking history decryption for legitimate re-adds) or only its *sessions*?
6. **Single-instance assumption.** Whether Render stays at one instance (in-memory maps acceptable) or scales out (requires Redis/Postgres-backed pub-sub for killswitch and rate limiting).

### G. Requires production / integration verification
These could not be established from source and **were not tested against production**:
1. Whether production `DATABASE_URL` is a pooled or direct Neon endpoint, and therefore whether `directUrl` is required before the first Phase 0B migration.
2. Whether Render terminates TLS ahead of the app and what `X-Forwarded-*` headers arrive (determines the correct `trust proxy` value).
3. Whether Render currently runs one instance or more.
4. That the production cookie is in fact emitted with `SameSite=None; Secure` (source says so; unverified on the wire).
5. Neon connection-pool sizing under concurrent WebSocket + HTTP load.
6. Actual CSP/security headers served by Vercel for the web origin.
7. Whether any real user has ever registered a second device — i.e. whether H-4 has already caused key displacement in production data.

---

## 4. Threat Model

| # | Threat | Attack path | Current mitigation | Remaining vulnerability | Sev | Recommended mitigation |
|---|---|---|---|---|---|---|
| 1 | **Stolen session token** | Token extracted from a device or a compromised client; replayed from anywhere | DB session lookup on every HTTP request; 7-day expiry; `httpOnly` | No device/IP binding; no anomaly detection; no global logout; live WebSockets never revalidate | HIGH | Bind session→device; global-logout endpoint; periodic WebSocket revalidation |
| 2 | **Stolen device (unlocked)** | Attacker has the physical device with a live session | Android: keystore + encrypted prefs + `FLAG_SECURE`; gesture gate | Web: private key persists in IndexedDB after logout; gesture lockout resets on reload; no remote wipe | MEDIUM | Clear crypto material on logout; server-side, gesture-independent session revocation |
| 3 | **Revoked device reconnecting** | Device marked revoked; simply keeps using its session and socket | **None** | Complete. Revocation is a display flag (H-1) | HIGH | Device→session binding; reject revoked devices in `requireAuth` and on WebSocket connect; force-close existing sockets |
| 4 | **Compromised browser (malware/extension)** | Reads IndexedDB handles, DOM, memory | Non-extractable keys prevent key *export* | Attacker can still *use* the key, read all plaintext, and rewrite the verification store to hide a key swap | MEDIUM | Out of scope for a web client; document explicitly. Signed verification records would help marginally |
| 5 | **Malicious authenticated user** | Legitimate account probing others' objects | Ownership/membership checks on every HTTP route | WebSocket receipt frames unchecked (H-5); unlimited device rows; unlimited messages; `keyId` squatting (M-6) | HIGH | Membership check on receipt frames; per-user quotas; scope `keyId` uniqueness per user |
| 6 | **Malicious conversation member** | The peer you are talking to | AAD context binding; sender-only delete | Peer can replay your own envelopes back (H-3); peer holds the shared key permanently (M-1); peer can rotate keys silently | HIGH | Replay dedup; forward secrecy (Protocol v2); surface key changes for unverified contacts |
| 7 | **Replay attacker** | Captures an envelope (via C-2, a proxy, or DB read) and re-POSTs it | **None** | Complete (H-3) | HIGH | Client-generated message id + DB unique constraint; reject duplicates idempotently |
| 8 | **Network attacker (passive/active)** | On-path between client and Render | TLS everywhere; HSTS; Android cleartext disabled | No certificate pinning; TLS-terminating infrastructure sees all envelopes (encrypted, so limited) | LOW | Accept; consider pinning for Android at a later phase |
| 9 | **WebSocket attacker (cross-origin)** | Hosts a page that opens `wss://vade-api.onrender.com/ws`; the victim's `SameSite=None` cookie is attached; receives the victim's entire live message stream with no subscription needed | **None** | Complete (C-2) | **CRITICAL** | Strict `Origin` allowlist in `verifyClient`; close unauthenticated sockets; revalidate sessions periodically |
| 10 | **Database compromise** | Attacker reads Neon | E2EE — no plaintext stored; bcrypt hashes; session tokens stored hashed | Full metadata graph (who talks to whom, when, how often); public keys are writable by anyone with write access, enabling silent MITM going forward | MEDIUM | Accept and document metadata exposure; consider signing published keys so substitution is client-detectable |
| 11 | **Stale public key** | Peer rotates; cached key persists for the module lifetime | `key_changed` state — **only** for previously-verified contacts | Unverified contacts (the default) see no signal; cache never invalidated; no re-check mid-session (M-3) | MEDIUM | Wire `clearPeerKeyCache`; compare `keyId` on every fetch; warn on change regardless of prior verification |
| 12 | **Compromised device (key extraction)** | Attacker obtains an identity private key | Keys are non-extractable on both platforms — extraction requires defeating the platform | If defeated: **all history and all future messages** for that identity decrypt, because the conversation key is permanent (M-1) | MEDIUM | Forward secrecy; key rotation with re-verification; revocation that actually retires a key |
| 13 | **Malicious client** | A modified or hand-rolled client hitting the API directly | Zod schemas; membership checks | Client-chosen `nonce`, `keyId`, `senderKeyId`, `aad` are all accepted unvalidated; no envelope well-formedness check; Android's `customNonce` is reachable | MEDIUM | Validate key material server-side; enforce nonce format/uniqueness; treat every client-supplied crypto field as hostile |
| 14 | **XSS attacker** | Injects script into the Vade web origin | React escaping; no `dangerouslySetInnerHTML`; API-origin CSP | **The Vercel-served app origin has no CSP** (§2.14). An XSS reads all plaintext, uses the key, and rewrites the verification store to conceal a key swap | HIGH | Ship a CSP from Vercel; add SRI; treat the verification store as integrity-sensitive |
| 15 | **CSRF attacker** | Any page the victim visits issues a cross-origin form POST carrying the `SameSite=None` cookie | **None** | Complete. Highest impact: overwriting the victim's E2EE public key (C-1) | **CRITICAL** | Origin/Referer validation on all state-changing routes + CSRF token + reject non-JSON content types |
| 16 | **IDOR / BOLA attacker** | Manipulates object ids in requests | Consistent server-side ownership derivation from `req.user.id` | HTTP path is sound. WebSocket receipt frames accept an arbitrary `conversationId` (H-5) | MEDIUM | Membership check on every WebSocket frame carrying a `conversationId` |

---

## 5. Phase 0B Implementation Plan

Dependency-ordered. **Nothing here has been implemented.**

---

### Increment 0 — Emergency: close the cross-site attack surface

**Ships ahead of all other Phase 0B work.**

#### 0.1 — Origin validation (HTTP + WebSocket)
- **Objective:** Reject state-changing HTTP requests and WebSocket upgrades whose `Origin` is not on an explicit allowlist. Single mitigation covering both C-1 and C-2.
- **Affected files:** new `server/src/middleware/originGuard.ts`; `server/src/app.ts` (mount before routes); `server/src/services/websocket.ts` (add `verifyClient` to the `WebSocketServer` options at `:43-47`); `server/src/config/env.ts` (add `ALLOWED_ORIGINS`).
- **DB / migrations:** none.
- **Security rationale:** the only mechanism that protects the WebSocket handshake, since the browser WebSocket API cannot carry a custom header or a CSRF token.
- **Dependencies:** none. Do this first.
- **Backwards compatibility:** **breaking for the Android client**, which sends no `Origin`. Requires an explicit policy for non-browser clients — recommended: allow a missing `Origin` only when a custom app header identifies a native client, and rely on §0.2 for browser-borne CSRF. This must be decided before coding.
- **Migration requirements:** none.
- **Tests:** allowed origin accepted; disallowed origin rejected (HTTP 403 and WebSocket upgrade refused); missing origin behaves per the chosen policy; existing WebSocket suite still passes.
- **Rollback:** env-flag the guard into report-only mode for one deploy, then enforce.
- **Production verification:** confirm the web client still authenticates and connects; confirm a `curl` with a foreign `Origin` is refused; watch logs for unexpected rejections before enforcing.

#### 0.2 — CSRF token + content-type enforcement
- **Objective:** Defense in depth behind origin checking for all state-changing HTTP routes.
- **Affected files:** new `server/src/middleware/csrf.ts`; `server/src/app.ts`; `server/src/routes/*.ts`; `client/src/services/api.ts` (fetch and attach the token); new `GET /api/auth/csrf` in `authRoutes.ts`.
- **DB / migrations:** none (double-submit cookie pattern; no server state).
- **Security rationale:** origin headers can be absent or stripped by intermediaries; a token is the belt to origin-checking's braces. Rejecting `application/x-www-form-urlencoded` on API routes removes the simple-request path entirely.
- **Dependencies:** §0.1; **Decision F-2**.
- **Backwards compatibility:** breaking for any client not sending the header — both the web client and Android must be updated in the same release.
- **Tests:** POST without token → 403; with valid token → success; form-encoded content type → 415; all six endpoints in §2.6 covered.
- **Rollback:** report-only mode, then enforce.
- **Production verification:** full login → publish key → send message → logout flow on the real deployment.

#### 0.3 — Close unauthenticated WebSockets; add connection limits
- **Objective:** Terminate sockets that do not authenticate within a short grace window; cap concurrent sockets per user and per IP.
- **Affected files:** `server/src/services/websocket.ts:49-62`.
- **DB:** none. **Dependencies:** §0.1.
- **Tests:** unauthenticated socket closed after the grace period; connection cap enforced; late `auth` frame within the window still works.
- **Rollback:** trivial revert; no persisted state.

---

### Increment 1 — Foundations (unblocks everything downstream)

#### 1.1 — `trust proxy` + rate-limiter rework
- **Objective:** Make `req.ip` accurate behind Render, then extend rate limiting beyond `/auth`.
- **Affected files:** `server/src/app.ts` (`app.set('trust proxy', <n>)`); `server/src/middleware/rateLimiter.ts`; `server/src/routes/*.ts`.
- **DB:** none, unless F-6 selects a shared store.
- **Security rationale:** without this, every limiter is either a global self-DoS or a no-op (H-6). Also remove the blanket `NODE_ENV=test` bypass at `rateLimiter.ts:24` so the limiter becomes testable at all.
- **Dependencies:** **Verification G-2** (what Render actually forwards) and **Decision F-6**.
- **Backwards compatibility:** none — behaviour-only change.
- **Tests:** limiter keys on the forwarded client IP; a spoofed `X-Forwarded-For` beyond the trusted hop count does not evade; per-route budgets enforced.
- **Rollback:** revert; in-memory only, no persisted state.
- **Production verification:** confirm logged client IPs are real client IPs, not Render's.

#### 1.2 — Device→session binding
- **Objective:** Give every session a device identity so revocation can be enforced.
- **Affected files:** `server/prisma/schema.prisma` (`Session.deviceId`, nullable, FK → `Device`); new migration; `server/src/services/authService.ts` (accept and record a device at login/register); `server/src/middleware/authMiddleware.ts` (load device, reject `status='revoked'`); `server/src/utils/jwt.ts` (optional `did` claim); both clients (send a device identifier at login).
- **DB / migrations:** additive — nullable `sessions.deviceId` + FK + index. Existing rows keep `NULL`.
- **Security rationale:** the structural prerequisite for H-1, H-2, and per-device logout. Nothing about revocation can work without it.
- **Dependencies:** **Decision F-1** (the device/key model determines what a device *is*) and **F-5** (revocation semantics).
- **Backwards compatibility:** nullable column; legacy sessions with `NULL deviceId` need an explicit policy — recommended: treat as unrevocable-legacy and let them expire, or force a one-time re-login.
- **Tests:** session records the device; a revoked device's session is rejected by `requireAuth`; `NULL deviceId` sessions behave per the chosen policy.
- **Rollback:** the column is additive and nullable; enforcement is env-flagged, so rollback is flag-off without a down-migration.
- **Production verification:** **Verification G-1 must be resolved first** — confirm whether `directUrl` is needed before any migration is attempted against Neon.

#### 1.3 — Device registration hardening
- **Objective:** Deduplicate devices, cap them, and update `lastSeenAt`.
- **Affected files:** `server/src/services/deviceService.ts:33-58`; `server/src/controllers/deviceController.ts:25-44` (move to Zod); `server/src/utils/validation.ts`; `schema.prisma` (`@@unique([userId, keyId])`).
- **DB / migrations:** unique constraint — **requires a pre-migration duplicate check against production data**; a plain `CREATE UNIQUE INDEX` will fail if duplicates exist.
- **Dependencies:** §1.2, Decision F-1.
- **Backwards compatibility:** duplicate rows must be merged or removed before the constraint lands.
- **Tests:** re-registering the same `keyId` upserts rather than duplicating; per-user device cap enforced; oversized/malformed device fields rejected.
- **Rollback:** drop the index; revert the service.
- **Production verification:** count duplicate `(userId, keyId)` pairs in Neon before migrating.

---

### Increment 2 — Revocation and killswitch

#### 2.1 — Enforce device revocation
- **Objective:** Make `status='revoked'` deny access everywhere.
- **Affected files:** `server/src/services/deviceService.ts:63-83` (delete the device's sessions inside a transaction, then signal the WebSocket layer); `server/src/middleware/authMiddleware.ts`; `server/src/services/websocket.ts` (new `closeSessionsForDevice`).
- **DB:** none beyond §1.2.
- **Dependencies:** §1.2, §2.2, Decision F-5.
- **Backwards compatibility:** sessions with `NULL deviceId` are unaffected — see §1.2's policy.
- **Tests:** **adversarial** — a revoked device's existing token is rejected; its live socket is closed; a concurrent revoke+request race lands on the safe side; revoking device A does not affect device B.
- **Rollback:** env-flag enforcement.
- **Production verification:** end-to-end revocation drill on a controlled test account, confirming the socket actually drops.

#### 2.2 — Session killswitch over WebSocket
- **Objective:** Server-initiated socket termination on logout, session deletion, or device revocation; plus periodic revalidation of long-lived sockets.
- **Affected files:** `server/src/services/websocket.ts` (store `sessionId` and `deviceId` on the socket at `:206-212`; add `closeSessionsForUser`/`closeSession`; add a revalidation interval alongside the heartbeat at `:86-97`); `server/src/services/authService.ts:167-182`.
- **DB:** none.
- **Security rationale:** closes H-2 and is the enforcement arm of §2.1.
- **Dependencies:** §1.2; **Decision F-6** (multi-instance requires pub-sub, since `userSockets` is per-process).
- **Tests:** logout closes that session's socket and leaves the user's other sockets alone; a socket whose session row is deleted out-of-band dies at the next revalidation tick.
- **Rollback:** revert; the revalidation interval is env-tunable and can be disabled.
- **Production verification:** confirm sockets survive normal use and drop on logout.

#### 2.3 — Global logout and per-device logout
- **Objective:** `POST /api/auth/logout/all` and `POST /api/auth/sessions/:id/revoke`.
- **Affected files:** `authRoutes.ts`, `authController.ts`, `authService.ts`; client settings UI.
- **DB:** none. **Dependencies:** §2.2.
- **Tests:** all sessions deleted and all sockets closed; other users unaffected.
- **Rollback:** remove the routes.

#### 2.4 — Fix WebSocket receipt authorization + JWT validation
- **Objective:** Membership check on `message.delivered`/`message.read`; honour the `verifySessionToken` result.
- **Affected files:** `server/src/services/websocket.ts:167-196`, `:345-373`.
- **DB:** none. **Dependencies:** none — small and self-contained; **can ship inside Increment 0**.
- **Security rationale:** H-5 and M-9.
- **Tests:** a non-member's receipt frame is refused; an expired-JWT token is refused on the WebSocket path exactly as on the HTTP path.
- **Rollback:** trivial revert.

---

### Increment 3 — Replay protection

#### 3.1 — Message idempotency and replay rejection
- **Objective:** Reject duplicate message submissions at the database.
- **Affected files:** `schema.prisma` (add `clientMessageId String` + `@@unique([conversationId, clientMessageId])`); new migration; `server/src/utils/validation.ts` (require it in the envelope); `server/src/services/messageService.ts:44-71` (wrap insert + conversation bump in `$transaction`; map a unique violation to an idempotent 200 returning the existing message); `client/src/hooks/useMessages.ts` and `client/src/crypto/encryption.ts`; Android `Crypto.kt` / `Repositories.kt`.
- **DB / migrations:** three steps — additive nullable column, **backfill** existing rows (use the row `id`), then add the unique constraint. The constraint cannot be added before the backfill completes.
- **Security rationale:** closes H-3 and simultaneously fixes the duplicate-on-retry bug in `retryMessage`.
- **Dependencies:** **Decision F-3**.
- **Backwards compatibility:** breaking — old clients send no `clientMessageId`. Ship the field as optional, deploy both clients, then make it required. **Two releases minimum.**
- **Tests:** identical envelope submitted twice → one row, idempotent response; concurrent duplicate submissions → one row (adversarial concurrency test); a legitimate retry after a timeout does not duplicate.
- **Rollback:** the constraint can be dropped independently of the column; keep the column.
- **Production verification:** confirm no legitimate send is refused; monitor duplicate-rejection counts.

#### 3.2 — Nonce format validation and uniqueness telemetry
- **Objective:** Enforce that `nonce` is exactly 12 bytes base64; count and alert on collisions.
- **Affected files:** `server/src/utils/validation.ts:117`; `server/src/services/messageService.ts`.
- **DB:** none. **Dependencies:** §3.1.
- **Security rationale:** a genuine collision is a security event that today would be entirely invisible.
- **Tests:** malformed nonce rejected; a deliberately reused nonce is detected and logged.
- **Rollback:** trivial revert.

---

### Increment 4 — Key integrity and cache correctness

#### 4.1 — Server-side public key validation and scoped key ids
- **Objective:** Reject malformed key material; bind `keyId` to the key; stop cross-user `keyId` squatting.
- **Affected files:** `server/src/services/cryptoService.ts:12-34`; `server/src/utils/validation.ts:104-108`; `schema.prisma:47` (drop the global unique on `keyId`, add `@@unique([userId, keyId])`); `client/src/crypto/keyManager.ts:64` (adopt Android's content-derived `deriveKeyId`).
- **DB / migrations:** index change — drop the global unique, add the composite.
- **Security rationale:** M-6. Makes key identity verifiable rather than merely asserted.
- **Dependencies:** Decision F-1.
- **Backwards compatibility:** changing the web `keyId` derivation changes existing users' `keyId`s, which will fire spurious `key_changed` warnings. Needs either a one-time mapping migration or a deliberate re-verification prompt.
- **Tests:** malformed SPKI rejected; a `keyId` not matching the key material rejected; two users may hold the same `keyId` without collision.
- **Rollback:** restore the old index; revert the client derivation.
- **Production verification:** confirm no existing user is locked out of publishing.

#### 4.2 — Peer key cache invalidation
- **Objective:** Detect key changes reliably and surface them for all contacts, verified or not.
- **Affected files:** `client/src/crypto/keyManager.ts:136-163` (TTL + revalidation; actually call `clearPeerKeyCache`); `client/src/hooks/useContactSecurity.ts:62-74`; `client/src/auth/AuthContext.tsx:62-71`; Android `ContactSecurityRepository.kt`.
- **DB:** none. **Dependencies:** §4.1.
- **Security rationale:** M-3 and threat #11.
- **Tests:** cache expires and refetches; a changed `keyId` warns for an unverified contact; logout clears the cache.
- **Rollback:** trivial revert.

#### 4.3 — Client logout hygiene
- **Objective:** Clear identity keys, peer cache, verifications, and gesture templates on logout.
- **Affected files:** `client/src/auth/AuthContext.tsx:62-71`; call the already-written `deleteIdentityKeys` and `clearPeerKeyCache`.
- **DB:** none. **Dependencies:** §4.2.
- **Security rationale:** M-4, threat #2.
- **Backwards compatibility:** **destructive by design** — deleting the identity key makes history undecryptable on that device. This is a *product* decision, not purely a security one, and must be confirmed before implementing. A safer intermediate: clear caches and verifications, retain the identity key, and offer an explicit "forget this device".
- **Tests:** each store is empty after logout; a subsequent login regenerates cleanly.
- **Rollback:** trivial revert — but any key already deleted is gone.

---

### Increment 5 — Hardening and observability

#### 5.1 — Database transactions
`$transaction` around registration, message send, conversation create, and device revoke. **Depends on** §1.2, §2.1, §3.1. **Tests:** concurrent duplicate registration yields one user and a clean 400; partial failures roll back fully. **Rollback:** trivial revert.

#### 5.2 — Web-origin CSP
Add security headers via `vercel.json`. Closes the §2.14 gap (threat #14). **Independent of everything else — ship early.** **Verification:** inspect response headers on the live Vercel deployment. **Rollback:** remove the header block.

#### 5.3 — Security event logging
Log authorization failures with actor identity, WebSocket auth failures, revocation enforcement, replay rejections, and rate-limit trips. **Depends on** the increments that create those events.

#### 5.4 — Adversarial test suite
Explicit test files for CSRF, CSWSH, replay, revocation enforcement, killswitch, receipt authorization, and concurrency races — the thirteen gaps listed in §2.18. **This is a Phase 0B deliverable in its own right, not an afterthought.**

#### 5.5 — Documentation corrections
Fix the four inaccuracies in §3.E. No code change; do it in the same PR as the relevant increment so docs and behaviour move together.

---

## 6. Final Go / No-Go

### PHASE 0B IMPLEMENTATION STATUS: **GO**

The codebase is in good shape to receive this work. Authorization logic is consistent, the crypto primitives are correctly used, key storage is genuinely well-engineered on both platforms, log redaction is thorough, and the existing test suite — while not adversarial — is broad and green. The problems found are **structural gaps and missing controls**, not tangled or incorrect implementations. That is the favourable case: the work is additive, and the existing code will not fight it.

**GO is conditional on three things being true before code is written.**

**1. Two design decisions must be locked first.** Neither requires new information — both can be settled in a short design session — but building their dependents first would guarantee rework:
- **F-1, the multi-device key model.** This gates device revocation, key revocation, `keyId` scoping, and peer-cache design — Increments 1.2, 1.3, 2.1, 4.1, and 4.2. Today the schema permits exactly one public key per user while both clients independently generate and publish their own, so a user's own devices silently overwrite each other (H-4). Every revocation design implies a different answer to "what is a device".
- **F-2, the CSRF defense shape**, which follows from whether Vercel+Render stays cross-site or the API moves behind the web origin. This gates all of Increment 0.

**2. Increment 0 ships ahead of the rest of Phase 0B.** C-1 and C-2 are live, remotely exploitable, require no malware and no network position, and together yield full plaintext compromise of a targeted account from an arbitrary web page. They should not wait behind the rest of the phase.

**3. Three production facts must be established before the first migration runs** (G-1, G-2, G-3): whether `DATABASE_URL` points at a pooled Neon endpoint — which determines whether `directUrl` must be added to the datasource block before `prisma migrate deploy` can work at all; what Render forwards in `X-Forwarded-*`, which determines the correct `trust proxy` value; and whether more than one instance runs, which determines whether the killswitch and rate limiter need a shared store rather than in-memory maps.

### Recommended implementation order

```
Decisions F-1, F-2   ─┐
Verifications G-1..3 ─┴─→  0.1 Origin validation (HTTP + WS)
                           0.2 CSRF token + content-type enforcement
                           0.3 Close unauthenticated sockets, cap connections
                           2.4 WS receipt authz + JWT validation   <- small, no deps, ship with Increment 0
                           5.2 Web-origin CSP                      <- independent, ship immediately
                                │
                                ├─→ 1.1 trust proxy + rate limiter
                                ├─→ 1.2 Device -> session binding
                                │       └─→ 1.3 Device registration hardening
                                │             └─→ 2.2 Killswitch -> 2.1 Revocation enforcement -> 2.3 Global/per-device logout
                                ├─→ 3.1 Message idempotency -> 3.2 Nonce validation
                                └─→ 4.1 Key validation + scoped keyIds -> 4.2 Cache invalidation -> 4.3 Logout hygiene
                                          │
                                          └─→ 5.1 Transactions · 5.3 Security logging · 5.4 Adversarial tests · 5.5 Doc fixes
```

Increments 3 and 4 are independent of each other and of Increment 2, and can proceed in parallel once Increment 1 lands.

**Explicitly deferred, with justification:**
- **Double Ratchet / forward secrecy (M-1).** Correctly out of Phase 0B scope. It is a Protocol v2 change requiring a new envelope format, session state on both clients, and a migration path for existing conversations. The current limitation is already documented honestly at `ARCHITECTURE.md:605` and `docs/threat-model.md` §3.1. Decision F-4 should record the deferral explicitly rather than leaving it implicit.
- **Android-specific hardening.** Nothing in Android needs a Phase 0B change for its own sake (§2.15). But Android is not exempt from Phase 0B: every protocol-level change — origin/CSRF policy for native clients, `clientMessageId`, `keyId` derivation, device binding — is a cross-platform contract change and must land on Android in the same increment, or the two clients will diverge silently.
- **Dependency upgrades.** Out of scope per the audit constraints. The three `npm audit` highs are build-tooling-only (L-3). The `security-crypto` alpha (L-4) deserves its own decision, separately.

---

## 7. File Change Guarantee

Verified at the end of the audit; see the accompanying session output for `git status` and the full diff.

- **No application code was modified.** No file under `server/src`, `client/src`, `shared/src`, or `android/app` was touched.
- **No crypto primitive, database schema, migration, or production configuration was modified.**
- **No secret appears in this report.**
- The only change to the working tree from this audit is the creation of this file, `docs/phase-0B-security-audit.md`.
- The four modified files (`.env.example`, `ARCHITECTURE.md`, `docker-compose.yml`, `server/src/config/env.ts`) and one untracked file (`docs/phase-0A5-neon-migration-preparation.md`) present in `git status` were **already uncommitted before this audit began** — they are Phase 0A5 Neon-migration preparation work and were left exactly as found.

---

**AUDIT FIRST. DESIGN SECOND. IMPLEMENT ONLY AFTER EXTERNAL REVIEW.**

Nothing in §5 has been implemented. This report is written to be independently checkable: every finding cites the file and line that supports it, and every claim that could not be verified from source is labelled as requiring production verification.

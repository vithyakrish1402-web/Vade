# Vade Phase 0B — Increment 1: CSP + WebSocket Session Security Hardening

**Status vocabulary used throughout, strictly:**

| Term | Meaning |
|---|---|
| **IMPLEMENTED** | Code exists and is wired into the running path |
| **TESTED** | An automated test exercises it and asserts the security outcome |
| **VERIFIED** | Tested at the level that actually demonstrates the property (real socket, real server, real frames) |
| **NOT VERIFIED** | Believed correct from source reading, but no execution proves it |
| **OUT OF SCOPE** | Deliberately not addressed in this increment |

"Tests pass" is never written as "secure". Where the only evidence is a passing test against a mock, this report says so.

---

## 1. Executive Summary

Four things were delivered:

1. **A strict CSP for the Vercel-served frontend** (`vercel.json`), built from the application's *actual* resource usage — which I inspected rather than assumed, and which turned up two facts that would have broken a guessed policy: an inline `<script>` in `index.html`, and a Google Fonts dependency.
2. **WebSocket session lifetime enforcement.** Sockets are now bound to the session that authenticated them, logout terminates exactly that session's sockets, a bounded sweep catches revocation the server was not told about, and every protected outbound write is gated on the socket still being authorized.
3. **The missing CORS preflight test** identified by the independent review, exercising the real Express stack.
4. **Two audit findings fixed in passing** because they are WebSocket authorization defects squarely inside this increment's remit: **M-9** (the WebSocket path computed the JWT verification result and discarded it) and **H-5** (receipt frames were not membership-checked).

**Device revocation was deliberately NOT implemented.** The schema cannot support it, and a partial implementation would have been worse than none. §7 explains precisely why and what it would take.

One design correction was made during self-review: a TOCTOU race between authentication and socket registration, found by reasoning about the code rather than by a failing test. It is closed and has its own test (12b).

**Increment 0 is fully intact** — its two source files are byte-unchanged and all 102 of its tests still pass.

---

## 2. Threat Model

The actor for Part 2 is different from Increment 0's. Increment 0 defended against an *external website*. This increment defends against **a credential that has stopped being valid** — a session the user logged out of, one that expired, or one revoked out of band — and against **an authenticated user acting outside their authorization**.

| Scenario | Before Increment 1 | After |
|---|---|---|
| User logs out; their socket stays open | **Socket keeps receiving all their ciphertext indefinitely** | Socket terminated at logout (close code 4001) |
| Session expires while a socket is open | Socket unaffected — expiry never re-checked | Torn down by the sweep |
| Session deleted by another process / operator | Socket unaffected | Torn down by the sweep |
| Session deleted during the connect handshake | Socket registered on a dead session | Torn down by post-registration re-check |
| Attacker replays a valid cookie after logout | Rejected at authentication (session row gone) | Unchanged — still rejected, now also tested |
| Token with invalid/expired **JWT signature** but a live session row | **Accepted on the WebSocket path** (M-9) | Rejected — WS now agrees with `requireAuth` |
| Authenticated non-member forges a read/delivered receipt into a conversation | **Broadcast to the real members** (H-5) | Refused |
| A revoked *device* reconnects | Not enforceable | **Still not enforceable** — see §7 |
| XSS on the Vade web origin | No CSP at all on the app origin | Strict CSP; script execution limited to `'self'` + one hash |

The property this increment is built around, stated so it can be attacked in review:

> `sendToMembers` delivers to **every socket registered for a user**, ignoring subscriptions. Therefore subscription membership is not, and never was, the authorization boundary. The boundary must live on the socket itself.

---

## 3. Files Changed

**Modified (5):**

| File | Change |
|---|---|
| `vercel.json` | CSP + 7 complementary security headers |
| `server/src/services/websocket.ts` | Session binding, `closeSession`, `closeAllSessionsForUser`, `revalidateSessions`, post-registration re-check, `deliver()` authorization gate, receipt membership checks (H-5), JWT result enforced (M-9), socket-count observability |
| `server/src/services/authService.ts` | `logout()` now revokes that session's sockets |
| `server/test/mockDb.ts` | `session.findMany` / `update`, plus test helpers to revoke, expire, and fault-inject session reads |
| `client/index.html` | **unchanged** — listed only to state it explicitly |

**New (3):**

| File | Purpose |
|---|---|
| `server/test/websocketSession.test.ts` | 20 tests — session lifetime, logout, revocation, receipt authorization |
| `server/test/corsPreflight.test.ts` | 8 tests — the reviewer-identified preflight gap |
| `client/test/csp.test.ts` | 26 tests — CSP strictness and app-consistency validation |

**Untouched, confirmed:** `server/src/config/origins.ts` and `server/src/middleware/originGuard.ts` (Increment 0's two source files) were not edited — md5 recorded in §9. No schema change, no migration, no Prisma model change, no E2EE primitive touched, no Android change.

---

## 4. CSP Design

### What I inspected first

`vercel.json` had **no `headers` block at all** — no CSP, no security headers of any kind. The policy therefore had to be built from scratch against real usage:

| Finding | Evidence | Consequence for the policy |
|---|---|---|
| **An inline `<script>` exists** in `client/index.html` (theme flash-prevention, runs before first paint) and is copied **verbatim** into the build | `client/dist/index.html` | `script-src 'self'` alone would break it → needs a hash |
| **Google Fonts is used** — stylesheet from `fonts.googleapis.com`, font files from `fonts.gstatic.com` | `client/index.html` `<link>` tags | `style-src` and `font-src` must name those hosts |
| **No runtime script/style injection** — no `eval`, no `new Function`, no `innerHTML`, no `dangerouslySetInnerHTML`, no CSS-in-JS, no `insertRule` | grep across `client/src` | **No `'unsafe-inline'` and no `'unsafe-eval'` are required** |
| API and WebSocket are on a different origin (Render) | `client/src/services/api.ts:3`, `websocket.ts:45-59` | `connect-src` must name both `https://` and `wss://` |

### The policy

```
default-src 'none';
script-src 'self' 'sha256-fAO9GGyBqQUmFSwhJiiThhiDv9UUOOqHmbZCwBGzoj0=';
style-src 'self' https://fonts.googleapis.com;
font-src https://fonts.gstatic.com;
img-src 'self' data:;
connect-src 'self' https://vade-api.onrender.com wss://vade-api.onrender.com;
manifest-src 'self'; base-uri 'self'; form-action 'self';
frame-ancestors 'none'; object-src 'none'; frame-src 'none'; worker-src 'none';
upgrade-insecure-requests
```

`default-src 'none'` means every fetch type not named above is denied by default, so a future resource type cannot silently inherit a permissive fallback.

**`'unsafe-inline'` and `'unsafe-eval'` are NOT used, and no application requirement justifies either.** The inline script is admitted by hash alone.

### The inline-script hash, and a real hazard I had to handle

The hash is `sha256-fAO9GGyBqQUmFSwhJiiThhiDv9UUOOqHmbZCwBGzoj0=`.

**This repository has no `.gitattributes`, and `client/index.html` is CRLF in the Windows working tree but LF in the committed git blob.** Vercel builds from an LF checkout. A hash computed naively from a local Windows checkout would therefore be **wrong in production** — the browser would block the theme script and the app would flash the wrong colour scheme on every load.

The hash above is computed from **LF-normalized** content, and `client/test/csp.test.ts` recomputes it the same way on every test run, so the two cannot drift. The test additionally compares source against `client/dist/index.html` when a build is present, which catches the other failure mode: Vite deciding to minify the inline script, which would make a source-derived hash no longer describe the deployed file.

I considered moving the script to an external file (making `script-src 'self'` sufficient and eliminating hash fragility entirely). I did not, because that script exists specifically to run *before first paint*, and making it a separate network fetch partially defeats its purpose on slow connections. The hash plus a drift-detecting test preserves the no-flash guarantee without the fragility being silent.

### Complementary headers

`X-Content-Type-Options: nosniff` · `X-Frame-Options: DENY` (legacy backstop for `frame-ancestors`) · `Referrer-Policy: strict-origin-when-cross-origin` · `Permissions-Policy` (camera, microphone, geolocation, payment, usb, interest-cohort all disabled) · `Strict-Transport-Security` (1 year, includeSubDomains) · `Cross-Origin-Opener-Policy: same-origin` · `X-DNS-Prefetch-Control: off`.

### Two CSPs now exist, deliberately

`server/src/middleware/securityHeaders.ts` sets a CSP on **API responses** (the Render origin). The new policy covers the **application origin** (Vercel). They are different origins with different content and correctly have different policies. The API one was never the app's CSP — that was audit finding §2.14, and it is what this part closes.

**Status: IMPLEMENTED and TESTED (config validation). NOT VERIFIED** — no browser has enforced this policy, because deploying is out of scope. See §11 and §13.

---

## 5. WebSocket Authorization Design

### What I verified in the source first

1. The handshake authenticates from the cookie once, in the `connection` handler.
2. `authenticateToken` called `verifySessionToken` and **discarded the result** — confirmed at the old line 349. The audit's M-9 was correct.
3. Sockets stored `userId` only. No session identity existed, so "revoke this session's sockets" was inexpressible.
4. `AuthService.logout` deleted the session row and did nothing else.
5. `sendToMembers` iterated `userSockets[userId]` with only a `readyState === OPEN` check.
6. Receipt frames checked `ws.userId` truthiness and nothing else — H-5 confirmed.

### Chosen model: (C) both, layered

The brief asked me to choose between immediate termination, periodic revalidation, or both. **Both**, with a clear primary:

**Layer 1 — Event-driven termination (primary).** The server already knows the exact instant a session stops being valid: it is the code deleting the row. Waiting for a poll to notice would leave a window in which a revoked session still receives ciphertext, which is the entire thing this increment exists to close. A `sessionSockets: Map<sessionId, Set<socket>>` index makes `closeSession(sessionId)` O(1) and — critically — **scoped**: revoking one session does not disturb the user's other devices or tabs.

**Layer 2 — Bounded revalidation sweep (defense in depth).** Catches invalidation paths that do not call `closeSession`: clock expiry, deletion by another process or operator, or a future code path that forgets to notify. It is **not an unbounded polling loop**: it returns immediately when no socket is open, and otherwise issues **exactly one indexed query per sweep** (`findMany where id IN (...)`) regardless of socket count. 60 s interval, `unref()`'d. `revalidateSessions()` is public so tests drive it deterministically instead of waiting on timers.

**Layer 3 — Outbound authorization gate (backstop).** All three fan-out paths (`sendToUser`, `sendToMembers`, `broadcastToConversation`) now funnel through a single private `deliver()` that requires `readyState === OPEN` **and** `isAuthorized === true`. `closeSession` clears the flag *before* calling `close()`, because `close()` completes asynchronously — without that ordering a delivery racing in the same tick could still reach a revoked socket. This is the layer that directly answers "subscription authorization ≠ socket authorization".

Control frames (`pong`, `authenticated`, `error`, `subscribed`) deliberately bypass the gate: they carry no user data, and an unauthenticated socket must still be able to receive the error telling it so.

### The race I found and closed

Self-review surfaced a TOCTOU window: `authenticateRequest` reads the session, then the socket enters the registries a few statements later. A logout landing in between would call `closeSession` while the socket was still invisible to it — leaving a live socket on a dead session until the next sweep.

Closed by re-checking the session immediately *after* registration (`revokeIfSessionGone`). Cost is one indexed query per connect. Test **12b** covers it.

Both the sweep and this re-check **fail safe, not closed**, on a database error: a transient fault must not sign every connected user out. Test 9d asserts this explicitly.

### Also fixed (in-scope audit findings)

- **M-9** — `authenticateToken` now returns `null` when `verifySessionToken` fails. The WebSocket path previously accepted a token whose JWT signature was invalid or expired provided its hash matched a live row; notably a `JWT_SECRET` rotation invalidated HTTP sessions but not WebSocket ones. HTTP and WS now agree.
- **H-5** — `message.delivered` and `message.read` are authorized against conversation membership via `isAuthorizedForConversation`, which uses the **server-assigned** `ws.userId` and never a client-supplied identifier.

**Status: IMPLEMENTED, TESTED, and VERIFIED** (real sockets, real server, assertions on frames received/not received).

---

## 6. Logout / Session Invalidation Behaviour

`AuthService.logout(sessionId)` now:

1. Deletes the session row (unchanged).
2. Calls `wsService.closeSession(sessionId, 'Logged out')` — **outside** the row-deletion try/catch and **unconditionally**. Whether or not the row was still present, the caller's intent is that this session stops being usable, and a socket alive on an already-deleted row is exactly the case worth closing.
3. Failure to revoke sockets is logged and does not fail the logout request.

Sockets are closed with code **4001** (`WS_CLOSE_SESSION_REVOKED`) so a client can distinguish revocation from a transport drop.

**Scoping is enforced and tested:** logging out one session leaves the user's other sessions connected and still receiving data (test 8c).

**Verified end-to-end through the real HTTP route**, not just the service method — test 8b drives `POST /api/auth/logout` and asserts the socket closes, deliberately not treating the 200 as the outcome.

**Status: VERIFIED.**

---

## 7. Device Revocation Assessment

**NOT IMPLEMENTED. This is a deliberate refusal, not an omission.**

I re-verified the audit's H-1 against current source:

- `Session` has **no `deviceId`** (`schema.prisma:80-91`).
- The JWT payload carries `sub`, `username`, `jti` only (`utils/jwt.ts:4-8`).
- `DeviceService.revokeDevice` sets `status: 'revoked'` and does nothing else.
- **No server code reads `Device.status` to deny anything** — the only read is the list serializer.

So the server cannot attribute a socket, a request, or a session to a device. **WebSocket authorization currently cannot distinguish an active device from a revoked one**, and no amount of code in this increment changes that without a schema change.

The only thing I *could* have done — terminate all of a user's sockets when any of their devices is revoked — would be **wrong**: it signs out the user's other, non-revoked devices, and it would let this report claim "device revocation enforced" while a revoked device that simply reconnects is readmitted immediately. That is precisely the partial fake implementation the brief forbids, and it would be worse than the honest gap because it would look fixed.

**What it actually requires** (Increment 2, and gated on audit design decision F-1, the multi-device key model): a nullable `Session.deviceId` column with an FK, device identity supplied at login, `requireAuth` rejecting revoked devices, and `revokeDevice` calling the now-existing `closeSession` for that device's sessions. The socket-side machinery this increment builds is exactly what that will plug into — `closeSession` is already the right primitive.

**Status: NOT IMPLEMENTED — architecturally blocked. Documented, not faked.**

---

## 8. CORS Preflight Test

The reviewer's gap: the suite proved a hostile *actual* request is refused but never exercised the preflight — which matters because `X-Vade-Client` is only unforgeable if the preflight it triggers is refused.

`server/test/corsPreflight.test.ts` sends the exact request specified, against the real Express stack:

```
OPTIONS /api/crypto/identity
Origin: https://evil.com
Access-Control-Request-Method: POST
Access-Control-Request-Headers: X-Vade-Client
```

**A finding worth stating plainly, because it looks alarming and a reviewer will challenge it.** My first assertion (that `Access-Control-Allow-Credentials` would be absent) **failed**. I probed the actual responses rather than loosening the test, and the ground truth is:

| Header | Hostile origin | Trusted origin |
|---|---|---|
| `Access-Control-Allow-Origin` | **absent** | `https://app.vade.example` |
| `Access-Control-Allow-Credentials` | `true` | `true` |
| `Access-Control-Allow-Methods` | `GET,HEAD,PUT,PATCH,POST,DELETE` | same |
| `Access-Control-Allow-Headers` | `X-Vade-Client, Content-Type` (echoed) | same |

The `cors` package emits Allow-Credentials, Allow-Methods, and an echo of Allow-Headers **unconditionally, including for an origin it is refusing**. `Access-Control-Allow-Origin` is the only header that differs — and per the Fetch specification it is the only one that decides: a credentialed preflight succeeds only if Allow-Origin matches the request origin. Without it the browser fails the check and never issues the actual request, so the echoed header names grant nothing.

**This is a cosmetic quirk of the `cors` package, not a vulnerability.** The test now asserts the decisive property, documents why the rest is inert, and pins the hostile-vs-trusted difference so that if a future change ever started emitting Allow-Origin for an untrusted origin, the assertion catches it instead of the quirk masking it.

Belt and braces: a separate test confirms that a non-browser attacker who skips the preflight entirely is still refused with 403 by the origin guard — which is why CORS is the *second* barrier, not the primary one.

**Status: VERIFIED.**

---

## 9. Test Results

```
npm run typecheck    PASS   shared, server, client — no errors
npm test             PASS   server  17 files, 226 tests
                            client  20 files, 235 tests
npm run build        PASS   shared + server tsc; client vite build
npx prisma validate  PASS   schema is valid (unchanged)
```

Android was **not modified**, so Android tests were not re-run (Increment 0 verified them).

**New this increment — 54 tests:**

| File | Tests | Result |
|---|---|---|
| `server/test/websocketSession.test.ts` | 20 | ✅ |
| `server/test/corsPreflight.test.ts` | 8 | ✅ |
| `client/test/csp.test.ts` | 26 | ✅ |

**Increment 0 regression check — all 102 tests re-run individually, all pass:**

| File | Tests | Result |
|---|---|---|
| `originPolicy.test.ts` | 32 | ✅ unchanged |
| `csrfOriginGuard.test.ts` | 46 | ✅ unchanged |
| `identityKeyCsrf.test.ts` | 10 | ✅ unchanged |
| `websocketOrigin.test.ts` | 14 | ✅ unchanged |

Increment 0 source files confirmed byte-unchanged:
```
6ddbab2cace0af7a06998af92367ce4f  server/src/config/origins.ts
fdeffd674c478d56e78977b4e21d00c1  server/src/middleware/originGuard.ts
```

Arithmetic check that nothing was silently dropped: 96 (pre-Increment-0) + 102 (Increment 0) + 28 (new server) = **226** ✅ · 209 (pre-existing client) + 26 (CSP) = **235** ✅

---

## 10. Security Properties Proven

Each maps to a test asserting the **outcome**, not a status code.

| # | Property | Evidence |
|---|---|---|
| 1 | Valid origin + valid session → authenticated | test 1 |
| 2 | Evil origin + valid session → handshake rejected | test 2 |
| 3 | Missing origin in production → rejected | test 3 |
| 4 | `null` origin → rejected | test 4 |
| 5 | Revoked session → never authenticated, never in the registry, receives nothing | test 5 |
| 6 | Expired session → never authenticated | test 6 |
| 7 | Logout terminates the socket with code 4001 | test 7 |
| 8 | Logout → no further protected frames via `sendToUser` **or** `sendToMembers` | test 8 |
| 8b | Logout **through the real HTTP route** terminates the socket | test 8b |
| 8c | Logout is **session-scoped** — other sessions survive and still receive | test 8c |
| 9 | Out-of-band session deletion → sweep terminates, no protected frames | test 9 |
| 9b | Expired session torn down by the sweep | test 9b |
| 9c | Sweep leaves valid sessions alone | test 9c |
| 9d | Sweep **fails safe** on a database fault — no mass disconnect | test 9d |
| 10 | Rejected socket never enters `userSockets` | test 10 |
| 11 | `sendToMembers` and `broadcastToConversation` cannot deliver to an invalidated socket | test 11 |
| 12 | Reconnect after logout with the same cookie → not authenticated | test 12 |
| 12b | Session deleted **during** the handshake → torn down immediately (TOCTOU) | test 12b |
| H-5 | A non-member cannot inject a forged read/delivered receipt | receipt suite |
| H-5 | A genuine member still can | receipt suite |
| CORS | Hostile preflight for `X-Vade-Client` is not granted | preflight suite |
| CORS | Legitimate preflight and subsequent request still work | preflight suite |

**Important qualifier on how these were proven:** the server, sockets, HTTP stack, and frames are all real. **The database is `mockDb`, not PostgreSQL.** The session semantics under test (row present / absent / expired) are simple enough that the mock is a faithful stand-in, but this is not proof against Neon. Stated again in §11.

---

## 11. Limitations

1. **The CSP has never been enforced by a browser.** `client/test/csp.test.ts` validates the *configuration* — strictness, absence of wildcards, and consistency with the app's actual resources. It cannot prove the page loads under it. A wrong CSP breaks the frontend on deploy. **NOT VERIFIED.** §13 has the manual check.
2. **`connect-src` hardcodes `https://vade-api.onrender.com` / `wss://vade-api.onrender.com`.** That origin comes from `android/app/build.gradle.kts:99-100`, the only in-repo evidence of the production API. The web client's actual origin is whatever `VITE_API_URL` is set to **in the Vercel dashboard**, which is not in this repository and which I must not read or mutate. **If it differs, every API call and the WebSocket will be blocked.** This is the single highest-risk item in the increment — first line of §13.
3. **All WebSocket tests run against `mockDb`.** See §10's qualifier.
4. **The revalidation sweep bounds staleness at 60 s** for revocation paths that do not call `closeSession`. Event-driven termination covers logout immediately; the sweep is the backstop for everything else. A session revoked by a path that neither notifies nor is caught by expiry can remain live for up to one sweep interval.
5. **Single-process only.** `sessionSockets` is an in-memory map. If Render ever runs more than one instance, `closeSession` only reaches sockets on the instance handling the logout; sockets on other instances survive until the sweep (≤60 s), since the sweep is per-instance and reads shared state. This is audit finding M-10 and is **OUT OF SCOPE** here, but it is a real bound on the guarantee and must be re-examined before scaling out.
6. **Unauthenticated sockets are still not closed.** A socket that fails authentication stays open, receives nothing, and cannot subscribe. It is a resource-exhaustion concern, not a data-exposure one. **OUT OF SCOPE** (it was listed in the Increment 0 plan as 0.3 and not implemented then either — recorded here so it is not lost).
7. **Android was not modified and not re-tested.** Increment 0's `X-Vade-Client` handling is untouched. Server-side session invalidation now closes Android sockets with code 4001; Android's existing `onFailure`/`onClosing` → `scheduleReconnect` path treats that as a normal disconnect and will retry, and the retry will not authenticate because the session is gone. That is correct fail-closed behaviour, but it means **a logged-out Android client will reconnect-loop on its backoff schedule**. Cosmetically noisy, not a security issue. **NOT VERIFIED on a device.**
8. **`Access-Control-Allow-Credentials`/`-Methods`/`-Headers` are returned to untrusted origins** (§8). Analysed as inert; called out so a reviewer evaluates the reasoning rather than discovering it.
9. **No CSRF token** — Increment 0's accepted caveat, unchanged.

---

## 12. Remaining Vulnerabilities

Unaddressed and still open from `docs/phase-0B-security-audit.md`:

**HIGH** — H-1 device revocation unenforceable (§7) · H-3 no replay protection at any layer · H-4 one public key per user, so a user's own devices overwrite each other · H-6 `trust proxy` unset, so rate limiting is a global self-DoS.

**Resolved this increment:** H-2 (WebSocket session killswitch) and H-5 (receipt authorization). **M-9** also resolved.

**MEDIUM** — M-1 no forward secrecy / PCS · M-2 probabilistic nonce uniqueness · M-3 peer key cache never invalidated · M-4 no client logout hygiene · M-5 gesture lockout resets on reload · M-6 unvalidated key material, globally-unique `keyId` · M-7 unbounded device registration · M-8 no message rate limit · M-10 in-memory maps preclude multi-instance correctness (now also bounding a security guarantee — see §11.5).

**LOW** — L-1 reflected `x-request-id` · L-3 `npm audit` highs in Prisma build tooling · L-4 `security-crypto` alpha · L-5 documentation inaccuracies · L-6 cursor timestamp oracle · L-7 CI audit cannot fail the build.

---

## 13. Production Deployment Checklist

**Do not deploy from this branch without working through this in order.**

1. **☐ CONFIRM THE API ORIGIN FIRST — highest risk item.** Read `VITE_API_URL` in the Vercel project settings. If it is not `https://vade-api.onrender.com`, **correct `connect-src` in `vercel.json` before deploying** or the frontend will be unable to reach the API or open a WebSocket.
2. **☐** Confirm `CORS_ORIGIN` on Render exactly matches the Vercel production origin (Increment 0 dependency — it now gates CSRF and the WebSocket handshake, not just CORS).
3. **☐** Deploy to a **preview/staging** environment first. Never production first.
4. **☐** With DevTools open on the preview deployment, confirm **zero CSP violations** on: initial load, login, conversation list, opening a conversation, sending a message, and logout.
5. **☐** Confirm the theme script executes — no light/dark flash on load. A blocked inline script means the hash is wrong.
6. **☐** Confirm the Figtree font renders (validates `style-src`/`font-src`).
7. **☐** Confirm the WebSocket connects and messages arrive live (validates `connect-src` `wss://`).
8. **☐** Manually verify the core new property: log in on two browsers, log out of one, confirm **that** socket drops (code 4001) and the other keeps receiving.
9. **☐** Verify a logged-out tab does not receive messages sent afterwards.
10. **☐** Check server logs for `ws_session_revoked` and absence of `ws_session_revalidation_error`.
11. **☐** If Android is exercised against this backend, confirm its reconnect loop after logout is tolerable (§11.7).
12. **☐** Watch for `csrf_origin_rejected` spikes indicating a legitimate origin was missed.

---

## 14. Rollback Strategy

Every part is independently revertible; nothing is coupled to persisted state.

| Part | Rollback | Data risk |
|---|---|---|
| CSP | Remove the `headers` block from `vercel.json`, redeploy. Reverts to Increment 0 behaviour (no app-origin CSP). | **None** — headers only |
| Individual CSP directive | Loosen the single directive rather than dropping the whole policy. Prefer this. | None |
| WebSocket session invalidation | Revert `websocket.ts` + `authService.ts`. | **None** — no schema, no migration, no persisted state; all state is in-memory maps rebuilt on restart |
| Receipt authorization (H-5) | Revert the two `case` blocks. | None |
| JWT enforcement (M-9) | Revert the `if (!payload) return null;`. | None |
| CORS preflight test | Test-only; no runtime effect. | None |

**No database migration was created, so there is no down-migration and no data-loss path.** A full rollback is `git revert` of this increment's commits plus a Vercel redeploy; the running system returns to the Increment 0 security posture, which is itself approved.

Fastest partial rollback if only the CSP misbehaves: delete the `Content-Security-Policy` entry from `vercel.json` and redeploy — the WebSocket hardening is server-side and entirely unaffected.

---

## 15. Recommended Next Increment

1. **`trust proxy` + rate-limiter rework (H-6).** Small, self-contained, and currently a live self-DoS: 30 requests exhausts the login budget for *every* user. Needs production verification of what Render forwards in `X-Forwarded-*`.
2. **Device→session binding (H-1).** The socket-side machinery now exists (`closeSession` is the right primitive); what is missing is the nullable `Session.deviceId` column and device identity at login. **Gated on audit design decision F-1 (the multi-device key model)** — building revocation before that decision guarantees rework.
3. **Replay protection (H-3).** Independent of the above; needs decision F-3 and a three-step migration (add column → backfill → constraint) plus a two-release client rollout.
4. **Cross-instance socket invalidation (M-10)** *if and only if* Render is scaled past one instance — §11.5 makes this a security concern, not just a scaling one.

---

## FINAL VERDICT

**Increment 1: PASS WITH CAVEATS**

The WebSocket half is genuinely done and genuinely demonstrated: real sockets, real server, assertions on frames received and not received, including the session-scoping and fail-safe properties that a careless implementation would get wrong. I found and closed a TOCTOU race by reviewing my own work rather than waiting for a test to fail. Increment 0 is untouched and fully green.

The caveats are real and all point the same way — **nothing here has been observed running against production infrastructure**:

- The CSP is validated as configuration, never enforced by a browser.
- `connect-src` names an API origin inferred from the Android build config, because the authoritative value lives in Vercel settings I must not read or change. **If that inference is wrong, the frontend breaks on deploy.**
- All WebSocket tests run against `mockDb`, not Neon.
- Device revocation remains unenforceable, and I declined to fake it.

| Item | Status |
|---|---|
| **CSP** | **IMPLEMENTED** (tested as configuration; NOT VERIFIED in a browser) |
| **WebSocket session invalidation** | **IMPLEMENTED** — event-driven + sweep + outbound gate |
| **Logout socket invalidation** | **VERIFIED** — via the service *and* the real HTTP route, asserted on socket closure and frame absence |
| **Session revocation enforcement** | **VERIFIED** — for session-level revocation, including out-of-band deletion and expiry |
| **CORS preflight coverage** | **VERIFIED** |
| **Increment 0 regressions** | **NONE** — 102/102 pass, source files byte-unchanged |
| **Device revocation** | **NOT IMPLEMENTED** — architecturally blocked; documented, not faked |
| **Production deployment** | **DO NOT DEPLOY** — §13 must be worked through on a preview environment first |

Nothing was deployed, nothing was committed, and no production configuration, secret, or database was touched.

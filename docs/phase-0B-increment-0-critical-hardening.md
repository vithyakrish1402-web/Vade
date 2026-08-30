# Vade Phase 0B — Increment 0: Critical Security Boundary Hardening

**Scope:** close the two CRITICAL cross-site attack surfaces identified in
[`docs/phase-0B-security-audit.md`](./phase-0B-security-audit.md) — C-1 (cross-site forgery of the
E2EE identity key) and C-2 (cross-site WebSocket hijacking). Nothing else.

**Deliberately NOT in this increment:** device revocation, WebSocket killswitch, replay protection,
multi-device public-key model, read/delivered authorization, trust proxy / rate limiting, Double
Ratchet, Protected Text, gestures, and Android hardening. Those remain open and are restated in §11.

**Production safety:** local repository only. No deploy, no schema change, no migration, no secret
rotation, no Neon or Render data touched, no production account created, no production message sent,
no Vercel configuration changed.

---

## 1. Threat Model

The threat actor is **an arbitrary third-party website**. The victim is a Vade user with a live
session, who visits that website in the same browser. The attacker needs no malware, no network
position, no XSS on the Vade origin, and no prior access to the victim's account.

The enabling condition is architectural and cannot simply be removed: the web client is served from
Vercel and the API from Render, so the two are **different sites**. The session cookie is therefore
`SameSite=None; Secure` ([`authController.ts:14-21`](../server/src/controllers/authController.ts)),
because `SameSite=Lax` strips the cookie from every authenticated `fetch` and silently 401s the whole
application. That decision is correct for the deployment. The defect was that nothing had replaced
the CSRF protection that `SameSite` had been providing.

| Actor capability | Available before | Available after |
|---|---|---|
| Cause the victim's browser to send an authenticated `POST` to the API | **Yes** | No — refused at the origin boundary |
| Read the response to such a request | No (CORS) | No (CORS) |
| Open an authenticated WebSocket as the victim | **Yes** | No — refused at the handshake |
| Replace the victim's published E2EE identity key | **Yes** | No |
| Receive the victim's live ciphertext stream | **Yes** | No |
| Set an `Origin` header of their choosing from page script | No — forbidden header name | No |
| Send a custom request header cross-origin without a preflight | No | No |

The load-bearing assumption of the fix is stated explicitly so it can be challenged in review:
**`Origin` is a forbidden header name, so page script cannot set, alter, or suppress it, and browsers
attach it to every cross-site state-changing request and to every WebSocket handshake.** If that
assumption held false in some browser, this mitigation would degrade to the content-type barrier
alone. It is the same assumption every origin-based CSRF defense makes.

---

## 2. Root Cause of C-1

Four independently benign facts composed into a critical vulnerability:

1. **`SameSite=None; Secure`** on the session cookie — required by the cross-site deployment, so the
   browser attaches the cookie to requests initiated by any site.
2. **No CSRF defense of any kind.** No token, no double-submit cookie, no custom-header requirement,
   no `Origin`/`Referer` validation. The string `csrf` did not appear anywhere in `server/src`.
3. **CORS was mistaken for a request-level control.** `cors({ origin: [...], credentials: true })`
   ([`app.ts:18-23`](../server/src/app.ts)) decides whether a cross-origin *response may be read*. It
   does not prevent the request from executing, and the side effect happens either way.
4. **`express.urlencoded` was mounted** ([`app.ts:26`](../server/src/app.ts)). A cross-origin HTML
   `<form method="POST">` is a CORS *simple request*: it triggers no preflight, so CORS never gets a
   veto. The form body was parsed straight into `req.body`.

The worst-case target was `POST /api/crypto/identity`. Its schema
([`validation.ts:104-108`](../server/src/utils/validation.ts)) accepts three plain strings —
`keyId`, `publicKey`, `algorithm` — which is exactly what a form body supplies. The service then
upserts on `userId` ([`cryptoService.ts:12-34`](../server/src/services/cryptoService.ts)),
unconditionally replacing the victim's published ECDH public key.

Every peer who subsequently fetches that key derives a conversation key from the **attacker's** key
material. This is an irreversible break of end-to-end confidentiality: messages sent to the victim
afterwards are readable by the attacker, and the victim can no longer decrypt them. Because the peer
key cache is never invalidated and key-change warnings only fire for *previously verified* contacts
(audit findings M-3, §2.7), the substitution is silent for the default, unverified contact.

**Verified against the code, not taken from the audit.** All four facts were re-confirmed by reading
the current source before any change was made.

---

## 3. Root Cause of C-2

1. **`WebSocketServer` was constructed with no `verifyClient` and no origin check whatsoever**
   ([`websocket.ts:43-47`](../server/src/services/websocket.ts)).
2. **CORS does not apply to WebSocket handshakes at all.** This is not a gap in the CORS
   configuration; the mechanism simply does not exist for WebSockets. It is a genuinely separate
   security boundary, and it had no enforcement.
3. **`SameSite=None`** means the cookie is attached to a cross-site upgrade request, and
   `authenticateRequest` reads it straight off the handshake headers
   ([`websocket.ts:319-340`](../server/src/services/websocket.ts)).
4. **Subscription was never the security boundary.** `sendToMembers`
   ([`websocket.ts:297-308`](../server/src/services/websocket.ts)) delivers to *every* socket in
   `userSockets[userId]`, and `sendMessage` calls it for every message
   ([`messageService.ts:106-117`](../server/src/services/messageService.ts)). A hijacked socket
   therefore receives the victim's entire live message stream — full envelopes, sender, conversation,
   timestamps — **without subscribing to anything**. The subscribe-time membership check
   ([`websocket.ts:141-154`](../server/src/services/websocket.ts)), which is correct in itself, is
   simply not on the path that matters.

Point 4 is what elevates C-2 from a nuisance to a full compromise, and it is the detail most likely
to be missed: a reviewer checking only `subscribe` would conclude the socket was authorized.

---

## 4. Chosen Mitigation

A single decision procedure, [`server/src/config/origins.ts`](../server/src/config/origins.ts),
shared by three enforcement points so they cannot drift apart. Three barriers, **each independently
sufficient** against browser-borne CSRF:

### Barrier 1 — Origin validation (primary)

[`server/src/middleware/originGuard.ts`](../server/src/middleware/originGuard.ts), mounted at app
level ahead of the body parser and of all routing. For every state-changing method
(anything other than `GET`/`HEAD`/`OPTIONS`):

- A **present** `Origin` must match the allowlist by **exact normalized equality**, and is decisive:
  a present-but-untrusted origin is refused outright, and no other header, fallback, or environment
  setting can rescue it.
- `Referer` is consulted **only** when `Origin` is absent — strictly narrower, never wider.
- A request with **neither** header can only come from a non-browser client. In production it must
  carry `X-Vade-Client`; outside production it is allowed so curl, supertest, and the Android
  emulator keep working.

Normalization goes through the `URL` constructor, never string manipulation. Prefix/suffix/substring
matching is the classic origin-check bypass, and every one of those is covered by a test (§8).

### Barrier 2 — Custom request header for non-browser clients

`X-Vade-Client` is not merely a marker. Any custom header promotes a request out of the CORS
*simple request* category and forces a preflight, which the CORS allowlist refuses for untrusted
origins — so the actual request is never sent. **A hostile page cannot satisfy this header**, which
is what makes the headerless escape hatch safe rather than a hole.

### Barrier 3 — Content-type enforcement, and removal of the form parser

`express.urlencoded` is no longer mounted, and state-changing requests must use `application/json`
(or a `+json` suffix type). `application/x-www-form-urlencoded`, `multipart/form-data`, and
`text/plain` — the only body formats a cross-origin page can send without a preflight — are rejected
with `415`. This removes the simple-request delivery vehicle entirely.

### Why no CSRF token

Evaluated and deliberately not implemented, with the reasoning recorded so it can be overruled:

- Against this threat model a **double-submit token adds no protection the custom-header barrier does
  not already provide.** Both rest on the same property — an attacker page cannot set a request
  header cross-origin without a preflight it cannot pass. The token additionally depends on secrecy;
  the header does not.
- A token requires a issuance endpoint, cookie plumbing, rotation on login/logout, and coordinated
  changes to both the web and Android clients. Each is an availability risk on a hotfix whose purpose
  is to close a live vulnerability quickly.
- It remains a reasonable defense-in-depth addition later. It is listed in §12 as a known limitation
  rather than quietly dropped.

### WebSocket handshake

`verifyClient` on the `WebSocketServer` ([`websocket.ts`](../server/src/services/websocket.ts)),
running the same `evaluateOrigin` procedure. Rejection happens **during the handshake, before the
socket exists**, so an untrusted origin never reaches an authenticated state and is never registered
in `userSockets` — it cannot receive a single frame.

### Also fixed in passing (audit finding L-2)

The CORS allowlist previously hardcoded `http://localhost:5173` and `http://127.0.0.1:5173`
**unconditionally, including in production**. The localhost origins are now added only outside
production. Since the same allowlist now gates CSRF and the WebSocket handshake, leaving them in
would have meant production trusting localhost to publish a user's identity key.

---

## 5. Why This Is Safe for Vercel → Render

The mitigation was chosen specifically because it does **not** require changing the cross-site
deployment. Nothing here alters `SameSite=None`, and the cookie continues to be sent cross-site
exactly as before.

| Concern | Outcome |
|---|---|
| Legitimate Vercel → Render request | The browser sends `Origin: https://<vercel-app>`, which is `CORS_ORIGIN`. Allowed. |
| Credentialed cross-origin `fetch` | Unchanged. `credentials: 'include'` and `Access-Control-Allow-Credentials: true` still work. |
| Preflight | Unchanged for trusted origins; still refused for untrusted ones — which is now load-bearing for Barrier 2. |
| Web client code changes | **None required.** The browser supplies `Origin` automatically, and [`api.ts:23-26`](../client/src/services/api.ts) already sends `Content-Type: application/json` on every request, including bodyless `DELETE`. |
| WebSocket from the browser | The browser sends `Origin` on the handshake. Allowed for the trusted origin. |
| Direct browser navigation (`GET`) | Untouched — safe methods bypass the guard entirely. |
| Preview / staging deployments | Add them to `ALLOWED_ORIGINS`. Wildcards and unparseable entries fail startup in production. |
| Localhost development | `localhost`/`127.0.0.1` on ports 5173 and 3000 are trusted outside production, and headerless requests are permitted for tooling. Malicious origins are refused in development too. |
| Misconfigured `NODE_ENV` | Blast radius is bounded: the development branch relaxes only the *missing-origin* rule, never the wrong-origin rule. Explicitly tested. |

**Android uses cookie authentication** — `MemoryCookieJar` plus an opt-in
`EncryptedSharedPreferences` store ([`Network.kt:38-80`](../android/app/src/main/java/com/enctxt/core/network/Network.kt),
`SessionCookieStore.kt`) — so it is in scope for the guard, and OkHttp sends **no `Origin`** on
either HTTP requests or WebSocket upgrades. Without a change it would have been refused in
production. It now sends `X-Vade-Client: android` via an OkHttp `Interceptor` on the shared client
(so a request added later cannot silently omit it) and via an explicit header on the WebSocket
upgrade, which uses a separately-constructed client. This is a **compatibility** change, not Android
security hardening, which remains deferred.

---

## 6. Endpoint Coverage

The guard is `app.use(...)` at application level, so coverage is structural rather than a list that
must be maintained. `POST`, `PUT`, `PATCH`, `DELETE`, and any other non-safe method are covered,
including on routes that do not yet exist — a `POST` to an unknown path is refused with `403` before
routing resolves, and a `PUT` is guarded even though no route currently uses one. Both are tested.

Every current cookie-authenticated state-changing route is nonetheless enumerated in the test suite,
so a route added later without coverage shows up as a gap:

| Method | Route | Guarded |
|---|---|---|
| POST | `/api/crypto/identity` | ✅ |
| POST | `/api/devices/register` | ✅ |
| POST | `/api/devices/:id/revoke` | ✅ |
| POST | `/api/conversations` | ✅ |
| POST | `/api/conversations/:id/messages` | ✅ |
| POST | `/api/conversations/:id/read` | ✅ |
| POST | `/api/conversations/:id/clear` | ✅ |
| DELETE | `/api/conversations/:id/messages/:messageId` | ✅ |
| PATCH | `/api/users/me` | ✅ |
| POST | `/api/auth/logout` | ✅ |
| POST | `/api/auth/login` | ✅ |
| POST | `/api/auth/register` | ✅ |

Safe methods (`GET`/`HEAD`) are deliberately untouched: they perform no state change and must remain
usable for ordinary navigation and data loading. Confirmed by review that no `GET` route in the API
mutates state. Authorization is unaffected — an unauthenticated `GET /api/users/me` still returns
`401`, asserted by test.

---

## 7. WebSocket Coverage

Enforced in `verifyClient`, so it applies to the single `/ws` upgrade path — the only WebSocket
surface in the application.

| Handshake | Production | Development |
|---|---|---|
| Trusted frontend origin | ✅ accepted | ✅ accepted (localhost) |
| Malicious origin + valid session cookie | ❌ rejected | ❌ rejected |
| Malicious origin + no cookie | ❌ rejected | ❌ rejected |
| Lookalike origin (suffix / scheme / port) | ❌ rejected | ❌ rejected |
| Opaque `null` origin (sandboxed iframe) | ❌ rejected | ❌ rejected |
| Missing origin, no client header | ❌ rejected | ✅ accepted (tooling) |
| Missing origin + `X-Vade-Client` | ✅ accepted | ✅ accepted |
| Malicious origin + `X-Vade-Client` | ❌ rejected | ❌ rejected |

Rejection occurs before the `connection` event, so the socket is never registered in `userSockets`
and `sendToMembers` cannot reach it.

---

## 8. Tests Added

**102 new tests across 4 files.** All are adversarial: each attempts to defeat the control rather
than confirming the happy path. Where a deeper assertion than a status code was possible, it is made.

### `server/test/originPolicy.test.ts` — 32 tests
Unit-level coverage of the decision procedure. This is the **only** way to exercise true production
semantics, since the test process is not (and must not be) running in production mode.

- Normalization: case, ports, default-port elision, path/query/fragment stripping, non-http schemes,
  unparseable input.
- **Eight lookalike origins** that each defeat a naive `startsWith`/`endsWith`/`includes` check —
  suffix append, scheme downgrade, port swap, punycode lookalike, and userinfo confusion
  (`https://app.vade.example@evil.com`, whose real host is `evil.com`).
- Production never trusts localhost; development does.
- **The native-client header cannot rescue a malicious `Origin`** — the property that makes the
  headerless escape hatch safe.
- **An opaque `null` origin is refused, not collapsed into "missing"** — otherwise a sandboxed iframe
  would inherit the permissive development behaviour.
- **A trusted `Referer` cannot override an untrusted `Origin`.**
- A wildcard configuration yields an empty allowlist and fails closed rather than open.

### `server/test/csrfOriginGuard.test.ts` — 46 tests
Full Express stack via supertest, against an app built with a **production** origin policy.

- Every state-changing route, ×2: malicious origin blocked, missing origin blocked. Assertions check
  the guard's own `403` message, proving it ran *ahead of routing* rather than the route returning
  its own 404/422/401.
- A sweep confirming no route is blocked from the trusted origin.
- Safe methods stay usable; `Access-Control-Allow-Origin` is set only for the trusted origin;
  authentication is still enforced on `GET`.
- Content-type barrier: form, multipart, and `text/plain` refused with `415` **even from the trusted
  origin**; `Application/JSON; charset=UTF-8` accepted; a bodyless request with no content type
  accepted.
- **Header smuggling:** duplicate `Origin` headers (which Node joins into one comma-separated value)
  in three orderings — all refused, since the joined string is unparseable.
- Unknown routes guarded; `X-HTTP-Method-Override` does not convert a `GET` into a state change;
  `PUT` guarded.
- Development behaviour explicitly tested, including that its leniency never extends to a malicious
  origin or to form bodies.

### `server/test/identityKeyCsrf.test.ts` — 10 tests
C-1 asserted on the **security outcome**, not on status codes. Each test performs a forgery attempt
and then **reads the key back out of persistence** to prove the victim's key material is intact.

- Cross-origin form POST (the original attack), cross-origin JSON POST, suppressed `Origin`, opaque
  `null` origin, three lookalike origins, and a forged native-client header — all refused, and after
  each, `publicKey` still equals the victim's and **not** the attacker's.
- Legitimate rotation from the real client still works and the stored key actually changes.
- Legitimate publication from the Android client still works.
- The guard did not weaken authentication: an unauthenticated publish is still `401`, and the stored
  key is unchanged.

### `server/test/websocketOrigin.test.ts` — 14 tests
Real HTTP server, real `ws` handshakes, production and development policies.

- **A valid session cookie is not sufficient without a valid origin** — stated as its own test,
  because it is the property that actually closes C-2.
- Malicious, lookalike, `null`, and missing origins rejected; trusted origin and native client
  accepted; native-client header does not rescue a malicious origin.
- A rejected handshake never reaches an authenticated state.
- Development branch tested separately, including that it still rejects malicious and `null` origins.

---

## 9. Test Results

```
npm run typecheck   PASS   shared, server, client — no errors
npm test            PASS   server  15 files, 198 tests
                           client  19 files, 209 tests
npm run build       PASS   shared + server tsc; client vite build (1678 modules, 308.25 kB)
npx prisma validate PASS   schema is valid

Android (not part of the npm gate, run separately to verify the compatibility change):
  :app:compileDebugKotlin   BUILD SUCCESSFUL
  :app:testDebugUnitTest    BUILD SUCCESSFUL
```

New-file breakdown, each run in isolation:

| File | Tests | Result |
|---|---|---|
| `originPolicy.test.ts` | 32 | ✅ pass |
| `csrfOriginGuard.test.ts` | 46 | ✅ pass |
| `identityKeyCsrf.test.ts` | 10 | ✅ pass |
| `websocketOrigin.test.ts` | 14 | ✅ pass |
| **Total new** | **102** | ✅ |

**All 96 pre-existing server tests and all 209 client tests still pass**, unmodified. No existing
test was edited, weakened, or deleted.

Two failures occurred during development and were fixed rather than worked around: a test helper
registering against the wrong origin for the development app, and a timeout caused by 12 sequential
bcrypt-cost-12 registrations in one test.

---

## 10. Files Changed

**New (6):**

| File | Purpose |
|---|---|
| `server/src/config/origins.ts` | Shared origin trust boundary and decision procedure |
| `server/src/middleware/originGuard.ts` | CSRF guard: origin + content-type enforcement |
| `server/test/originPolicy.test.ts` | 32 unit tests |
| `server/test/csrfOriginGuard.test.ts` | 46 integration tests |
| `server/test/identityKeyCsrf.test.ts` | 10 outcome-asserting C-1 tests |
| `server/test/websocketOrigin.test.ts` | 14 handshake tests |

**Modified (5):**

| File | Change |
|---|---|
| `server/src/app.ts` | Mount guard ahead of body parser and routes; CORS from shared allowlist (localhost no longer trusted in production); **remove `express.urlencoded`**; testable `originPolicy` seam |
| `server/src/config/env.ts` | Add `ALLOWED_ORIGINS` with production wildcard/parse validation |
| `server/src/services/websocket.ts` | `verifyClient` origin validation; injectable policy; clear policy on `reset()` |
| `android/.../core/network/Network.kt` | Send `X-Vade-Client` on HTTP (interceptor) and on the WS upgrade — compatibility only |
| `.env.example` | Document `ALLOWED_ORIGINS` and the widened meaning of `CORS_ORIGIN` |

**Not touched:** ECDH, AES-GCM, HKDF, key formats, ciphertext format, the public-key schema, the
multi-device architecture, `schema.prisma`, any migration, and any production configuration. The
identity publication operation is protected, not redesigned.

Pre-existing Phase 0A/0A.5 work was preserved and verified in the final diff — specifically the
expanded `insecurePatterns` list in `env.ts` and the `DIRECT_URL` block in `.env.example`.

---

## 11. Remaining Phase 0B Findings

Unchanged by this increment and still open:

**HIGH** — H-1 device revocation is cosmetic · H-2 no WebSocket session killswitch · H-3 no replay
protection at any layer · H-4 one public key per user, so a user's own devices overwrite each other ·
H-5 `message.read`/`message.delivered` skip the membership check · H-6 `trust proxy` unset, so rate
limiting is a global self-DoS.

**MEDIUM** — M-1 no forward secrecy / PCS · M-2 probabilistic nonce uniqueness · M-3 peer key cache
never invalidated · M-4 no client logout hygiene · M-5 gesture lockout resets on reload · M-6
unvalidated key material and globally-unique `keyId` · M-7 unbounded device registration · M-8 no
message rate limit · M-9 WebSocket discards the JWT verification result · M-10 in-memory maps
preclude multi-instance correctness.

**LOW** — L-1 reflected `x-request-id` · **L-2 fixed in this increment** · L-3 `npm audit` highs in
Prisma build tooling · L-4 `security-crypto` alpha · L-5 documentation inaccuracies · L-6 cursor
timestamp oracle · L-7 CI audit cannot fail the build.

**Also still open:** the web application origin (Vercel) ships **no CSP at all** — audit §2.14,
threat #14. Not addressed here because it is a `vercel.json` change and this increment is barred from
touching Vercel configuration. It should be the first item of the next increment; an XSS on the Vade
origin defeats every client-side control at once, including this one.

---

## 12. Known Limitations

Stated plainly, because the brief asks that nothing be claimed fixed beyond what is demonstrated.

1. **The mitigation rests on `Origin` being unforgeable by page script.** True in every current
   browser (it is a forbidden header name), and the same assumption every origin-based CSRF defense
   makes — but it is an assumption, and if it failed, only the content-type barrier would remain.
2. **No CSRF token.** Evaluated and deferred with reasoning in §4. It would add a layer that does not
   depend on `Origin` at all, which is exactly the residual risk in point 1.
3. **The content-type barrier does not apply to bodyless requests.** A cross-origin `fetch` with no
   body and no headers is a simple request, so for endpoints needing no body (e.g.
   `POST /api/devices/:id/revoke`) the `Origin` check is the sole barrier. Sufficient, but it is one
   layer rather than two, and worth knowing.
4. **Not verified against production.** Every result here is from the local suite. The fix must be
   validated on a staging deployment before production: confirm the real Vercel origin is in
   `CORS_ORIGIN`/`ALLOWED_ORIGINS`, that login/messaging/WebSocket all still work, and that a
   foreign-`Origin` `curl` is refused. **A wrong `CORS_ORIGIN` value now breaks the application
   rather than merely breaking CORS**, since the same allowlist gates CSRF and the WebSocket. A
   report-only rollout period is advisable.
5. **The Android change compiles and its unit tests pass, but it has not been exercised against a
   running server.** `:app:compileDebugKotlin` and `:app:testDebugUnitTest` both succeed, so the
   interceptor and the WebSocket header are known to build; what is unproven is the end-to-end
   handshake from a real build against a real server. If it were wrong, the Android client would
   fail closed (refused) in production rather than fail open.
6. **`Referer` fallback is narrow but non-zero surface.** It applies only when `Origin` is entirely
   absent, and cannot override a present `Origin`. Both properties are tested.
7. **This increment closes cross-site abuse only.** An attacker who already holds a session token, or
   who has XSS on the Vade origin, is completely unaffected by any of it. Those are H-2 and threat
   #14 respectively, both still open.

---

## 13. Recommended Next Increment

1. **Vercel CSP** (audit §5.2). Independent of everything else, no dependencies, and the largest
   remaining single-step risk reduction. It is the one gap this increment structurally could not
   touch.
2. **WebSocket receipt authorization + honour the JWT verification result** (H-5, M-9, audit §2.4).
   Small, self-contained, no dependencies, no schema change.
3. **`trust proxy` + rate-limiter rework** (H-6). Needs production verification G-2 first (what
   Render actually forwards).
4. Then Increment 1 proper — device→session binding — but **only after design decision F-1, the
   multi-device key model, is settled**. It gates revocation, key revocation, `keyId` scoping, and
   peer-cache design, and building any of them first guarantees rework.

---

## INCREMENT 0 STATUS: **PASS WITH CAVEATS**

**Why PASS.** Both CRITICAL findings are closed at the server, by enforcement that runs before the
vulnerable code can execute, and both are demonstrated by adversarial tests rather than asserted.

- **C-1** — the cross-site form POST that replaced a victim's E2EE identity key is refused, and the
  tests prove the *outcome*: after each of seven distinct forgery attempts, the stored public key is
  read back and still equals the victim's own. Legitimate publication and rotation still work.
- **C-2** — a cross-origin handshake carrying a genuine, live session cookie is refused during the
  upgrade, before the socket exists and before authentication is attempted, so it is never registered
  and never receives a frame. A valid cookie is proven insufficient without a valid origin.

The full validation gate is green (typecheck, 198 server + 209 client tests, build, prisma validate),
all 96 pre-existing server tests still pass unmodified, and the diff is confined to the intended
files with all Phase 0A/0A.5 work preserved.

**Why WITH CAVEATS, not unqualified PASS.**

1. **Nothing has been verified against production or staging.** Local tests demonstrate the mitigation
   is correct; they cannot demonstrate it is correctly *configured* for the real deployment. Because
   the origin allowlist now gates CSRF and the WebSocket in addition to CORS, a wrong `CORS_ORIGIN`
   in Render breaks the application outright. This must be validated on staging first — that is a
   deployment-verification gap, not a defect in the code.
2. **The Android compatibility change is compile- and unit-test-verified, but not device-verified.**
   It fails closed if wrong, so it is a compatibility risk rather than a security one, but the
   end-to-end handshake from a real build is unproven.
3. **The design deliberately omits a CSRF token** (§4, §12.2). The chosen barriers are sufficient and
   standard, but the residual risk in §12.1 is real and should be an explicit, recorded acceptance
   rather than an oversight.
4. **The vulnerability remains live in production until this is deployed.** This increment is code
   and tests only; no deployment was performed, as instructed.

No Phase 0B feature outside Increment 0 was implemented.

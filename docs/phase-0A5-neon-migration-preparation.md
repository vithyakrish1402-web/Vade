# Phase 0A.5 — Neon PostgreSQL Migration Preparation & Validation

> **Status**: VALIDATION COMPLETE — Neon verified as a viable migration target
> **Date**: 2026-08-30
> **Production state at end of phase**: UNCHANGED — Vade production remains on Render PostgreSQL
> **Production cutover**: NOT PERFORMED (out of scope, by design)
> **Production data migration**: NOT PERFORMED

---

## 1. Executive Summary

Neon PostgreSQL has been validated as a migration target for Vade. The existing Prisma migration
chain was applied to an empty Neon database and the resulting schema, runtime behaviour, and
application health logic were all verified against it.

**Result: Neon is schema-compatible, Prisma-compatible, and runtime-compatible with Vade.** No
schema modification was required and none was made.

Render remains the live production database throughout. Its `DATABASE_URL`, `JWT_SECRET`, database,
data, deployment, and managed credential are all unchanged and were re-verified at the end of this
phase.

Two items remain outstanding and are **not** blockers for this phase: PostgreSQL client tools
(`pg_dump`/`pg_restore`) are not installed and are required for the eventual data migration; and the
Phase 0A credential rotation is still incomplete.

---

## 2. Repository Database Architecture

| Aspect | Finding |
|---|---|
| Prisma schema | `server/prisma/schema.prisma` |
| Prisma version | `6.19.3` (CLI and client) |
| Datasource | `provider = "postgresql"`, `url = env("DATABASE_URL")` |
| `directUrl` | Not declared — intentionally left absent (see §9) |
| Migration history | 2 migrations, linear; `provider = "postgresql"` in `migration_lock.toml` |
| Client access | `server/src/services/db.ts` — lazy singleton `PrismaClient`, injectable via `setPrismaClient` |
| Health probe | `checkDatabaseConnection()` — `SELECT 1` with 3s timeout → `connected` / `unreachable` |
| Render coupling | **None.** No `sslmode`, `pgbouncer`, `connection_limit`, `pool_timeout`, or `RENDER_*` reference in `server/src`, `client/src`, `shared/src` |

**Migration chain:** `20260827085453_init` → `20260829203000_add_message_delete_and_chat_clear`

**Models (8):** `system_info`, `users`, `public_keys`, `devices`, `sessions`, `conversations`,
`conversation_members`, `messages`

**Production start command (Render):** `npm run prisma:migrate:deploy && npm start` — migrations run
on every production deploy. This drives the §9 constraint.

---

## 3. Neon Connectivity Result

```
Neon credentials available: YES  (loaded from outside the repository)
Neon connectivity:          PASS
PostgreSQL version:         PostgreSQL 18.6 (aarch64-unknown-linux-gnu)
Database:                   neondb
Role:                       neondb_owner
Region:                     AWS ap-southeast-1 (Singapore)
Endpoint class:             DIRECT (unpooled)
SSL/TLS:                    PASS — enforced by server
Credentials exposed:        NO
```

**Pre-migration schema state:** 0 tables in `public` — database was empty, as expected for a new
project.

### TLS verification method

`pg_stat_ssl` reports `ssl = false` for the backend connection. This is expected Neon behaviour, not
a security finding: TLS terminates at Neon's connection proxy, so the PostgreSQL backend observes a
plaintext link *inside* Neon's own network. Reporting PASS on that field alone would have been
misleading.

TLS enforcement was therefore verified **empirically** instead: a deliberate connection attempt with
`sslmode=disable` was **rejected by the server**. This proves the client↔proxy link cannot be
downgraded to plaintext. The connection string additionally carries `sslmode=require` and
`channel_binding=require`.

---

## 4. Prisma Compatibility Result

**Result: PASS — no schema change required.**

| Feature | Usage in Vade | Neon result |
|---|---|---|
| Provider | `postgresql` | ✅ Verified against PostgreSQL 18.6 |
| Extensions | None — no `CREATE EXTENSION` in any migration | ✅ No dependency to port |
| UUID generation | `@default(uuid())` — client-side in Prisma | ✅ No server-side UUID function needed |
| Enums | None — status fields are `String` | ✅ No `CREATE TYPE` to port |
| Indexes | 29 created | ✅ Verified present |
| Unique constraints | 16 unique indexes | ✅ Verified present |
| Foreign keys | 7 | ✅ All verified `ON DELETE CASCADE` |
| Primary keys | 8 | ✅ Verified present |
| Timestamps | `TIMESTAMP(3)`, `@default(now())`, `@updatedAt` | ✅ Verified |
| Nullable fields | `aad`, `deletedAt`, `clearedAt` | ✅ Verified nullable |
| Text/blob | `@db.Text` on `ciphertext`, `publicKey`, `aad` | ✅ Mapped to `text` |
| Migration lock | `postgresql` | ✅ No provider-switch error |

Corroborating evidence: `.github/workflows/ci.yml` already runs `prisma migrate deploy` against a
stock `postgres:16-alpine` container on every CI run. The chain is portable across vanilla
PostgreSQL 16 and Neon's PostgreSQL 18.6.

---

## 5. Migration Result

```
Mechanism:        npx prisma migrate deploy --schema=server/prisma/schema.prisma
Target:           Neon direct (unpooled) endpoint
New baseline:     NOT created (existing chain used, as required)
Destructive ops:  NONE
Result:           PASS
```

Both migrations applied in order:

```
Applying migration `20260827085453_init`
Applying migration `20260829203000_add_message_delete_and_chat_clear`
All migrations have been successfully applied.
```

Post-apply verification:

```
npx prisma migrate status  →  "Database schema is up to date!"  (2 migrations found, 0 pending)
```

`prisma migrate reset`, `prisma db push --force-reset`, `DROP DATABASE`, `DROP TABLE`, and
`TRUNCATE` were **not** run at any point, against any database.

---

## 6. Schema Verification

Read-only verification via `information_schema` / `pg_catalog`.

```
Render:
  schema inspection: NOT PERFORMED
    Reason: deliberately not accessed. Render production is out of scope for this phase and
            its credential was not used. The repository migration chain is authoritative.

Neon:
  schema applied:   PASS
  migration status: PASS
  expected tables:  PASS  (8/8)
  primary keys:     PASS  (8)
  foreign keys:     PASS  (7, all ON DELETE CASCADE)
  unique indexes:   PASS  (16)
  indexes total:    PASS  (29)
  nullable fields:  PASS
```

### Tables (8/8 present)

`system_info` · `users` · `public_keys` · `devices` · `sessions` · `conversations` ·
`conversation_members` · `messages`

Only additional object is `_prisma_migrations` (Prisma's own history table — expected).

### `messages` — cryptographic columns verified

| Column | Type | Nullable | Default |
|---|---|---|---|
| `id` | text | NO | — |
| `conversationId` | text | NO | — |
| `senderId` | text | NO | — |
| `ciphertext` | text | NO | — |
| `nonce` | text | NO | — |
| `senderKeyId` | text | NO | — |
| `recipientKeyId` | text | NO | — |
| `algorithm` | text | NO | `'AES-256-GCM'` |
| `version` | integer | NO | `1` |
| `aad` | text | **YES** | — |
| `createdAt` | timestamp(3) | NO | `CURRENT_TIMESTAMP` |
| `updatedAt` | timestamp(3) | NO | — |
| `deletedAt` | timestamp(3) | **YES** | — |

`conversation_members.clearedAt` — `timestamp(3)`, nullable: **PASS**

All ciphertext-bearing columns are unbounded `text`, which is what permits byte-exact ciphertext
transfer during the future data migration.

### Unique indexes verified

`users_username_key` · `users_email_key` · `public_keys_userId_key` · `public_keys_keyId_key` ·
`sessions_tokenHash_key` · `conversations_directKey_key` ·
`conversation_members_conversationId_userId_key` · `system_info_key_key` · plus 8 primary-key
indexes.

---

## 7. Runtime Smoke Test & Health Check

All executed against Neon only, with an explicit datasource override so no other database could be
targeted.

| Check | Result |
|---|---|
| Prisma initialize | PASS |
| `$connect()` | PASS |
| `SELECT 1` | PASS |
| Query `users` | PASS (0 rows) |
| Query `conversations` | PASS (0 rows) |
| Query `messages` | PASS (0 rows) |
| Query `sessions` | PASS (0 rows) |
| Query `devices` | PASS (0 rows) |
| Query `public_keys` | PASS (0 rows) |
| Query `conversation_members` | PASS (0 rows) |
| Write/read round-trip | PASS |
| Test data cleanup | PASS — removed, `system_info` back to 0 rows |
| `$disconnect()` | PASS |

**Test data:** a single disposable row in `system_info` (metadata table only — no user, session, or
E2EE data involved), keyed `phase0a5_validation_probe` and explicitly labelled as test data. It was
deleted immediately and absence re-confirmed by a follow-up read. No Vade user account was created.
No message was sent.

### Application health logic (§7)

The compiled application module `server/dist/services/db.js` was executed directly against Neon:

```
checkDatabaseConnection(): connected
health verdict: PASS
```

This is the same function backing the production `/api/health/ready` endpoint. The production
endpoint itself was **not modified**.

---

## 8. Connection Strategy

Per instruction, the **lower-risk direct configuration** was used and no pooling support was added:

```
DATABASE_URL = Neon direct (unpooled) connection
directUrl    = NOT added to schema.prisma
```

`server/prisma/schema.prisma` is unchanged. The pooled Neon endpoint remains available for a future
scalability phase.

**Why this remains correct:** Vade holds a single Prisma connection pool against one Render
instance, so pooling is not load-motivated today. Adding `directUrl = env("DIRECT_URL")` would also
make `DIRECT_URL` mandatory for every `prisma migrate` invocation — and because `vade-api` runs
`prisma migrate deploy` in its start command with `autoDeploy: yes`, committing that line without
simultaneously setting `DIRECT_URL` in the deployment environment would fail the next production
deploy with `Environment variable not found: DIRECT_URL`. Deferring it is both the instructed and
the safer choice.

`.env.example` documents the variable as commented-out guidance only, with an explicit note that
both halves must be enabled together.

---

## 9. Data Migration Preparation

**Status: PREPARED — NOT EXECUTED.** No production data was migrated. Render credentials were not
used for any dump or export.

### Tooling availability

```
psql:       NOT AVAILABLE
pg_dump:    NOT AVAILABLE
pg_restore: NOT AVAILABLE
```

**Not installed, deliberately.** `winget` offers only full `PostgreSQL.PostgreSQL.<version>`
packages, each of which installs and registers a PostgreSQL **server** service. That conflicts with
the instruction not to install unnecessary database servers.

**Recommended install for the migration phase:** run the EDB PostgreSQL **18** installer and select
only the *Command Line Tools* component (deselect Server, pgAdmin, Stack Builder). Version 18 is
required because `pg_dump` must be at least the version of the source server — both Render
(`vade-postgres`, PG 18) and Neon (PG 18.6) qualify.

### Table classification for migration

| # | Class | Tables | Treatment |
|---|---|---|---|
| 1 | Identity/account | `users` | Copy verbatim incl. `passwordHash` |
| 2 | Auth/session | `sessions` | Copy, or drop to force re-login (see note) |
| 3 | Public crypto identity | `public_keys` | **Byte-exact** — `keyId`/`publicKey` must not change |
| 4 | Device | `devices` | Copy verbatim; `keyId` binds to `public_keys` |
| 5 | Conversation metadata | `conversations`, `conversation_members` | Copy verbatim incl. `directKey`, `clearedAt` |
| 6 | Ciphertext messages | `messages` | **Byte-exact, never decrypt** |
| 7 | Delivery/read state | `messages.deletedAt`, `conversation_members.clearedAt` | Copy verbatim |

> Vade has no separate receipt table; delivery/read state lives on `messages` and
> `conversation_members` and is preserved by copying those tables verbatim.

### Procedure (sanitized — credentials supplied via environment, never inline)

**1. Export production (read-only, outside the repository):**

```bash
pg_dump "$RENDER_DATABASE_URL" \
  --data-only --no-owner --no-privileges --format=custom \
  --encoding=UTF8 \
  --file="$HOME/vade-migration/vade-prod-$(date +%Y%m%d).dump"
```

Read-only by construction — `pg_dump` never writes to the source. No destructive flag is used.

**2. Restore into Neon** (schema already created by `prisma migrate deploy`):

```bash
pg_restore --dbname="$NEON_DATABASE_URL" \
  --data-only --no-owner --no-privileges --single-transaction \
  --disable-triggers \
  "$HOME/vade-migration/vade-prod-YYYYMMDD.dump"
```

`--single-transaction` makes the restore all-or-nothing. Load order must respect foreign keys:
`users → public_keys → devices → sessions → conversations → conversation_members → messages`.

**3. Verify row counts** — per table on both sides:

```sql
SELECT 'users' t, count(*) FROM users
UNION ALL SELECT 'public_keys', count(*) FROM public_keys
UNION ALL SELECT 'devices', count(*) FROM devices
UNION ALL SELECT 'sessions', count(*) FROM sessions
UNION ALL SELECT 'conversations', count(*) FROM conversations
UNION ALL SELECT 'conversation_members', count(*) FROM conversation_members
UNION ALL SELECT 'messages', count(*) FROM messages
ORDER BY 1;
```

**4. Verify ciphertext byte-equality** — aggregate hash, comparable across databases without ever
exposing or decrypting content:

```sql
SELECT md5(string_agg(ciphertext || '|' || nonce || '|' || coalesce(aad,''), '' ORDER BY id))
FROM messages;
```

Identical output on both sides proves ciphertext, nonce, and AAD transferred byte-for-byte.

**5. Verify UUIDs:**

```sql
SELECT md5(string_agg(id::text, '' ORDER BY id)) FROM messages;
```

Repeat per table.

**6. Verify timestamps** (millisecond precision preserved):

```sql
SELECT min("createdAt"), max("createdAt"), count(*) FROM messages;
SELECT count(*) FROM messages WHERE "deletedAt" IS NOT NULL;
SELECT count(*) FROM conversation_members WHERE "clearedAt" IS NOT NULL;
```

**7. Verify relationships** (zero orphans expected):

```sql
SELECT count(*) FROM messages m LEFT JOIN conversations c ON c.id = m."conversationId" WHERE c.id IS NULL;
SELECT count(*) FROM messages m LEFT JOIN users u ON u.id = m."senderId" WHERE u.id IS NULL;
SELECT count(*) FROM public_keys k LEFT JOIN users u ON u.id = k."userId" WHERE u.id IS NULL;
SELECT count(*) FROM devices d LEFT JOIN users u ON u.id = d."userId" WHERE u.id IS NULL;
```

### Integrity requirements

Ciphertext must move **byte-for-byte**. Messages are AES-256-GCM ciphertext with nonce and AAD; any
re-encoding, charset conversion, whitespace normalisation, or truncation silently destroys
decryptability for real user data. `--encoding=UTF8` must be set on both ends. Decryption is
impossible server-side by design and must never be attempted during migration.

**Session note:** `sessions` rows remain valid only if `JWT_SECRET` is unchanged. Since Phase 0A's
JWT rotation is still outstanding, coordinate the two so users re-authenticate once, not twice.

---

## 10. Repository Changes

### Applied (1 change, documentation only)

**`.env.example`** — commented `DIRECT_URL` placeholder documenting when it is required, that it is
migration-only, and that it must be enabled together with the schema change. Placeholder values
only.

### Deliberately not changed

`server/prisma/schema.prisma` (no `directUrl`, per §8), `server/src/config/env.ts`,
`server/src/services/db.ts`, `docker-compose.yml`, all migrations, all E2EE primitives (AES-GCM,
ECDH, HKDF), Protected Text, gesture recognition, device revocation, WebSocket authorization, CSRF,
key rotation, authentication architecture. No Android changes. No Phase 0B work. Nothing committed.

---

## 11. Tests Executed

| Command | Result |
|---|---|
| `npm run typecheck` | ✅ PASS — shared, server, client |
| `npm test` | ✅ PASS — server 96/96 (11 files), client 209/209 (19 files); 305 total |
| `npm run build` | ✅ PASS — tsc ×2 + vite |
| `npx prisma validate` | ✅ PASS — schema valid |
| Neon migration apply | ✅ PASS |
| Neon migration status | ✅ PASS |
| Neon schema verification | ✅ PASS |
| Neon runtime smoke test | ✅ PASS |
| Neon health-logic check | ✅ PASS |

Local development environment was not repointed: `DATABASE_URL` was scoped to individual command
invocations and confirmed unset in the shell used for the test run. Local `.env` still targets
`localhost/vade_dev`. No test was pointed at Render.

---

## 12. Security / Secret Scan

| Check | Result |
|---|---|
| Neon password in Git | ✅ ABSENT |
| Neon connection string in Git | ✅ ABSENT |
| Neon endpoint hostname in Git | ✅ ABSENT |
| Render database credentials in Git | ✅ ABSENT |
| Render API key in Git | ✅ ABSENT (stored outside the repository) |
| JWT secret in Git | ✅ ABSENT |
| Private keys in Git | ✅ ABSENT |
| `.env` ignored | ✅ `git check-ignore` → `.gitignore:12:*.env` |
| `.env.example` | ✅ Placeholders only |
| Credentials in this document | ✅ NONE |
| Credentials in logs/output | ✅ NONE — connection strings redacted at source |

Credential files live outside the repository at `~/.render/vade.env` and `~/.neon/vade.env`.

---

## 13. Rollback Strategy

Render remains the live database. No rollback was needed in this phase because no cutover occurred.

### Future cutover rollback

1. **Before cutover** — record the current Render `DATABASE_URL` in a secure store (never the repo).
   Do not delete or suspend `vade-postgres`.
2. **Cutover** — set `DATABASE_URL` on `vade-api` to the Neon direct URL; redeploy.
3. **Rollback trigger** — any of: `/api/health/ready` non-200, `database` not `connected`, login
   failure, WebSocket auth failure, message send/receive failure.
4. **Rollback action** — restore the previous `DATABASE_URL`; redeploy. No schema revert is needed,
   since no schema change was made. Recovery ≈ one Render deploy (~90s observed).
5. **Data written to Neon during the window is lost on rollback.** Keep the window short or run the
   cutover during low traffic.

### Gates before Render may be retired

Neon schema verified ✅ (this phase) · data verified · production app tested against Neon · health
endpoint passes · authentication passes · WebSocket authentication passes · messaging passes · E2EE
ciphertext round-trip passes · rollback window defined and elapsed.

> **Timing constraint:** `vade-postgres` is on Render's **free plan with `expiresAt` 2026-09-25**.
> The rollback target has a hard expiry ~26 days out. Either upgrade the Render instance to preserve
> a rollback path, or complete the migration before that date.

---

## 14. Risks

| # | Risk | Severity | Status |
|---|---|---|---|
| 1 | Render free-tier expiry 2026-09-25 removes the rollback target | **High** | OPEN — decide plan before cutover |
| 2 | Phase 0A rotation incomplete: production PostgreSQL credential and `JWT_SECRET` un-rotated | **High** | OPEN — carried over |
| 3 | Ciphertext corruption during data copy destroys decryptability | **High** | MITIGATED by §9 hash verification, not yet exercised |
| 4 | `pg_dump`/`pg_restore` unavailable; required for data migration | Medium | OPEN — install PG 18 client tools |
| 5 | Data migration itself unvalidated (no dump performed) | Medium | OPEN — next phase |
| 6 | `vade-postgres` ipAllowList `0.0.0.0/0`; Neon network controls not yet assessed | Medium | OPEN |
| 7 | Session invalidation could occur twice if JWT rotation and migration are scheduled apart | Low | OPEN — coordinate |
| 8 | Neon connection latency vs Render — both in ap-southeast-1 | Low | Same region; not measured under load |

---

## 15. Phase 0A.5 Acceptance Criteria

```
[x] Neon credentials loaded securely (outside repo)         PASS
[x] Neon connectivity verified                              PASS
[x] PostgreSQL version confirmed                            PASS (18.6)
[x] SSL/TLS verified                                        PASS (enforced; empirically tested)
[x] Database name / role verified                           PASS (neondb / neondb_owner)
[x] Existing migration chain applied (no new baseline)      PASS
[x] Migration status verified                               PASS
[x] All 8 expected tables verified                          PASS
[x] Primary keys / foreign keys / unique indexes verified   PASS
[x] Message ciphertext columns verified                     PASS
[x] Nullable fields verified                                PASS
[x] Prisma runtime smoke test                               PASS
[x] Application health logic against Neon                   PASS
[x] Test data removed                                       PASS
[x] Connection strategy = direct, no schema change          PASS
[x] Data migration procedure prepared                       PASS
[ ] pg_dump / pg_restore available                          NOT AVAILABLE (install deferred)
[x] npm run typecheck                                       PASS
[x] npm test                                                PASS
[x] npm run build                                           PASS
[x] npx prisma validate                                     PASS
[x] Security scan clean                                     PASS
[x] Render production untouched                             PASS (re-verified)
[x] No production cutover                                   PASS (by design)
[x] No production data migrated                             PASS (by design)
```

**Overall: PASS — Neon validated and ready for a future controlled data migration.**

### Remaining blockers for the migration phase

1. **`pg_dump` / `pg_restore` not installed** — install PostgreSQL 18 *Command Line Tools* only.
2. **Render free-tier expiry 2026-09-25** — resolve the plan decision to preserve a rollback target.
3. **Phase 0A rotation incomplete** — production PostgreSQL credential and `JWT_SECRET` still
   un-rotated; requires an interactive session or the Render dashboard.
4. **Explicit authorization required** before any Render dump or production cutover.

### Recommended next phase

**Phase 0A completion first** (credential + JWT rotation), then **Phase 0A.6 — controlled data
migration**: install client tools → dump Render read-only → restore into Neon → run the §9
verification suite (row counts, ciphertext hashes, UUIDs, timestamps, relationships) → rehearse
cutover and rollback → only then schedule the production cutover as its own authorized phase.

---

## Final State

```
Render PostgreSQL                    Neon PostgreSQL
      │                                    │
      │ CURRENT PRODUCTION                 │ VERIFIED TARGET
      │ untouched, healthy                 │ schema initialized, empty
      ▼                                    ▼
  Vade API  ✅ healthy               ready for controlled migration
```

| Item | State |
|---|---|
| Render `DATABASE_URL` | UNCHANGED |
| Render `JWT_SECRET` | UNCHANGED |
| Render database & data | UNTOUCHED |
| Render managed credential | UNCHANGED (`vade_user`, default) |
| Render deployment | UNCHANGED |
| Production readiness | HTTP 200, `database: connected` |
| Production cutover | NOT PERFORMED |
| Production data migration | NOT PERFORMED |
| JWT rotation | NOT PERFORMED |
| Database credential rotation | NOT PERFORMED |

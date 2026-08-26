# ENCTXT Production Deployment & Infrastructure Guide

This guide details the steps required to deploy, configure, and maintain the **ENCTXT** private messaging web application in a production environment.

---

## 1. System Architecture

```text
                                Internet
                                   │
                                   ▼
                    ┌─────────────────────────────┐
                    │ Reverse Proxy (TLS / HTTPS) │
                    │ Nginx or Caddy (Let's Enc)  │
                    └──────────────┬──────────────┘
                                   │
              ┌────────────────────┴────────────────────┐
              │                                         │
              ▼                                         ▼
    Static React/Vite App                     Node.js Express & WS
    (/usr/share/nginx/html)                   (http://backend:5000)
    - Immutable hashed assets                 - /api/* (REST API)
    - SPA routing fallback                    - /ws (WebSocket WSS)
                                                        │
                                                        ▼
                                                   PostgreSQL
                                            (Ciphertext Envelopes Only)
```

---

## 2. Prerequisites

1. **Host Operating System**: Linux (Ubuntu 22.04 LTS / Debian 12 / Alpine Linux recommended).
2. **Node.js**: v20.x or v22.x LTS with npm.
3. **Database**: PostgreSQL 15 or 16 with TLS support.
4. **Reverse Proxy**: Nginx 1.24+ or Caddy 2.7+.
5. **TLS Certificate**: Valid public certificate (e.g. Let's Encrypt / Certbot).

---

## 3. Environment Variables Classification

| Variable | Class | Description | Production Example |
|---|---|---|---|
| `NODE_ENV` | Deployment Config | Runtime mode (`production`) | `production` |
| `PORT` | Deployment Config | Internal backend HTTP port | `5000` |
| `CORS_ORIGIN` | Deployment Config | Trusted frontend domain (NEVER `*`) | `https://app.example.com` |
| `DATABASE_URL` | Server Secret | PostgreSQL connection string | `postgresql://user:pass@db:5432/enctxt_prod?sslmode=prefer` |
| `JWT_SECRET` | Server Secret | Min 32-char cryptographically random key | `openssl rand -base64 48` |
| `SESSION_COOKIE_NAME` | Server Secret | Session cookie name | `enctxt_session` |
| `SESSION_MAX_AGE_DAYS` | Server Secret | Session duration in days | `7` |
| `VITE_API_URL` | Public Config | Client API endpoint (Bundled into JS) | `/api` |

> [!CAUTION]
> **Secret Boundary Invariant**: Never put `DATABASE_URL`, `JWT_SECRET`, or private keys into `VITE_*` variables. Variables prefixed with `VITE_` are embedded into public client JavaScript bundles.

---

## 4. Production Build & Deployment Steps

### Step 1: Clean Install Dependencies
```bash
git checkout main
npm ci
```

### Step 2: Database Migration
Execute production database migrations:
```bash
npm run prisma:generate
npm run prisma:migrate:deploy
```

### Step 3: Compile Monorepo
```bash
npm run build
```

This compiles:
- `@enctxt/shared` -> `shared/dist/`
- `@enctxt/server` -> `server/dist/`
- `@enctxt/client` -> `client/dist/`

### Step 4: Run Application Process
Using PM2 or systemd:
```bash
# Using PM2
pm2 start server/dist/server.js --name "enctxt-backend" -i max --env production
```

---

## 5. Reverse Proxy Configuration

### Option A: Nginx
Copy `deploy/nginx.conf` to `/etc/nginx/nginx.conf` and test configuration:
```bash
nginx -t
systemctl reload nginx
```

### Option B: Caddy (Automated TLS)
Copy `deploy/Caddyfile` to `/etc/caddy/Caddyfile`:
```bash
caddy reload --config /etc/caddy/Caddyfile
```

---

## 6. Docker Deployment (Alternative)

To deploy using Docker and Docker Compose:
```bash
# 1. Configure production environment
cp .env.example .env
nano .env

# 2. Build and launch containers
docker compose up -d --build

# 3. Verify health
curl -f http://localhost:5000/api/health
curl -f http://localhost:5000/api/health/ready
```

---

## 7. Rollback Procedure

If a deployment fails:
1. **Frontend Rollback**: Revert `client/dist` static assets to the previous immutable release.
2. **Backend Rollback**: Revert Node.js process to previous release tag (`git checkout <previous_tag> && npm ci && npm run build && pm2 restart enctxt-backend`).
3. **Database Rollback**: Consult `docs/disaster-recovery.md` before attempting any database state rollback.

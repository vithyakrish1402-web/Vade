# ENCTXT Disaster Recovery & Backup Policy

This document defines backup strategies, retention rules, recovery objectives, and restoration procedures for the **ENCTXT** database and infrastructure.

---

## 1. Recovery Targets

- **Recovery Time Objective (RTO)**: `< 60 minutes` (Maximum acceptable duration to restore service).
- **Recovery Point Objective (RPO)**: `< 24 hours` (Daily snapshots) or `< 15 minutes` (with continuous WAL archiving).

---

## 2. Backup Privacy & E2EE Boundaries

> [!IMPORTANT]
> **Data Contained in Database Backups:**
> - User identity records (`id`, `username`, `email`, `passwordHash`, `displayName`)
> - Public cryptographic keys (`PublicKey` model)
> - Registered device records (`Device` model)
> - Active session tokens (`Session` model)
> - 1-to-1 conversation metadata (`Conversation`, `ConversationMember`)
> - **Ciphertext Message Envelopes Only** (`ciphertext`, `nonce`, `senderKeyId`, `recipientKeyId`, `algorithm`, `version`, `aad`)
>
> **Data NOT Contained in Database Backups:**
> - User private encryption keys (strictly local in browser IndexedDB)
> - Gesture templates and reveal patterns (strictly local in browser localStorage)
> - Contact verification states (strictly local in browser localStorage)
> - Message plaintext (NEVER stored or backed up)

---

## 3. Automated Backup Procedure

### Daily Encrypted PostgreSQL Backup (`pg_dump`)
```bash
#!/bin/bash
set -euo pipefail

BACKUP_DIR="/var/backups/enctxt/postgres"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="${BACKUP_DIR}/enctxt_backup_${TIMESTAMP}.sql.gz"
ENCRYPTED_FILE="${BACKUP_FILE}.enc"

mkdir -p "${BACKUP_DIR}"

# 1. Dump database and compress
pg_dump -U enctxt_user -d enctxt_prod --no-owner --clean | gzip -9 > "${BACKUP_FILE}"

# 2. Encrypt at rest with AES-256-CBC using backup key
openssl enc -aes-256-cbc -salt -pbkdf2 -in "${BACKUP_FILE}" -out "${ENCRYPTED_FILE}" -pass file:/etc/enctxt/backup_encryption_key.txt

# 3. Clean up unencrypted intermediate file
rm -f "${BACKUP_FILE}"

# 4. Enforce 30-day retention policy (prune backups older than 30 days)
find "${BACKUP_DIR}" -type f -name "enctxt_backup_*.sql.gz.enc" -mtime +30 -delete
```

---

## 4. Restoration Verification Procedure

Perform restoration testing quarterly in an isolated staging environment:

### Step 1: Decrypt & Decompress Backup Archive
```bash
openssl enc -d -aes-256-cbc -pbkdf2 -in enctxt_backup_20260825_120000.sql.gz.enc -out restore.sql.gz -pass file:/etc/enctxt/backup_encryption_key.txt
gunzip restore.sql.gz
```

### Step 2: Restore into Staging Database
```bash
# Create fresh test database
dropdb -U postgres enctxt_staging_restore || true
createdb -U postgres enctxt_staging_restore

# Restore schema and data
psql -U postgres -d enctxt_staging_restore -f restore.sql
```

### Step 3: Verify Integrity & Prisma Migration State
```bash
# Run Prisma migrate deploy to confirm migration consistency
DATABASE_URL="postgresql://postgres:pass@localhost:5432/enctxt_staging_restore" npx prisma migrate deploy --schema=server/prisma/schema.prisma

# Verify application boots and passes health checks
DATABASE_URL="postgresql://postgres:pass@localhost:5432/enctxt_staging_restore" node server/dist/server.js &
curl http://localhost:5000/api/health/ready
```

### Step 4: Clean Up Test Artifacts
```bash
rm -f restore.sql
```

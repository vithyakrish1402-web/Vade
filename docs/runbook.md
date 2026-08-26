# ENCTXT Production Operational Runbook

This document outlines daily operational maintenance, health monitoring, alerting thresholds, and incident response procedures for the **ENCTXT** messaging system.

---

## 1. System Health & Probes

### Liveness Probe (`GET /api/health`)
- **Purpose**: Verifies that the Node.js process is alive and responsive.
- **Expected Response**: HTTP 200 `{"status": "ok", "uptime": 12345, "version": "0.1.0"}`.
- **Action on Failure**: If unresponsive or returning 5xx for > 30 seconds, restart backend process.

### Readiness Probe (`GET /api/health/ready`)
- **Purpose**: Verifies that the backend is connected to PostgreSQL and ready to handle traffic.
- **Expected Response**: HTTP 200 `{"ready": true, "database": "connected"}`.
- **Failure State**: HTTP 503 `{"ready": false, "database": "disconnected"}`.
- **Action on Failure**: Inspect PostgreSQL connectivity, credentials, and connection limits.

---

## 2. Operational Metrics & Alert Thresholds

| Metric | Warning Threshold | Critical Alert | Action |
|---|---|---|---|
| **HTTP 5xx Error Rate** | > 1% over 5m | > 5% over 2m | Inspect server logs and database latency |
| **Database Pool Usage** | > 70% capacity | > 90% capacity | Check connection leaks or increase pool limit |
| **WebSocket Reconnect Spike** | > 50 reconnects/min | > 200 reconnects/min | Check reverse proxy timeouts or network flapping |
| **Node.js Memory (RSS)** | > 750 MB | > 1.2 GB | Investigate heap memory leak, trigger graceful restart |
| **TLS Certificate Expiry** | < 21 days remaining | < 7 days remaining | Trigger ACME / Let's Encrypt certificate renewal |
| **Disk Storage** | > 80% usage | > 90% usage | Prune rotated logs, expand disk volume |

---

## 3. Privacy-Preserving Observability

> [!IMPORTANT]
> **Strict Privacy Observability Rule**:
> - Never log or monitor message contents, plaintext, ciphertext payloads, nonces, or private keys.
> - Monitoring focuses strictly on **operational metadata** (durations, status codes, socket counts, memory usage).

---

## 4. Incident Response Workflows

### Incident A: Database Outage
1. Check readiness endpoint: `curl -i https://api.example.com/api/health/ready`.
2. Inspect PostgreSQL service: `systemctl status postgresql` or `docker logs enctxt_db`.
3. Verify connection string and pool limits in `.env`.
4. If database crashed, restart PostgreSQL. Backend automatically reconnects upon recovery.

### Incident B: WebSocket Disconnection Storm
1. Verify Nginx `proxy_read_timeout` is set to `3600s`.
2. Check client heartbeat intervals (client sends ping every 30s).
3. Inspect whether reverse proxy terminated upgrade headers.

### Incident C: Accidental Sensitive Logging Exposure
If plaintext or sensitive credentials ever appear in production logs:
1. **Immediate Quarantine**: Restrict access to log files immediately.
2. **Purge Affected Logs**: Permanently delete affected log chunks from storage.
3. **Investigate Root Cause**: Identify the route or middleware generating the log.
4. **Patch & Deploy**: Apply patch preventing payload logging and deploy fix.
5. **Rotate Credentials**: If passwords, session tokens, or server secrets were logged, rotate them immediately.

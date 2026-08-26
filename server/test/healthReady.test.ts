import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';

describe('Health & Readiness Probes (Phase 10 — Observability)', () => {
  const app = createApp();

  it('GET /api/health returns liveness status and exposes no internal secrets', async () => {
    const response = await request(app).get('/api/health');

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('ok');
    expect(typeof response.body.uptime).toBe('number');
    expect(response.body.timestamp).toBeDefined();

    // Invariant: Must never expose DATABASE_URL, secrets, or internal stack traces
    expect(response.body.DATABASE_URL).toBeUndefined();
    expect(response.body.JWT_SECRET).toBeUndefined();
    expect(response.body.password).toBeUndefined();
  });

  it('GET /api/health/ready evaluates readiness probe', async () => {
    const response = await request(app).get('/api/health/ready');

    expect([200, 503]).toContain(response.status);
    expect(typeof response.body.ready).toBe('boolean');
    expect(response.body.database).toBeDefined();
    expect(response.body.timestamp).toBeDefined();
  });
});

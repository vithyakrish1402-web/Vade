import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';

describe('HTTP Security Headers & Hardening (Phase 8)', () => {
  const app = createApp();

  it('serves Content-Security-Policy header on all endpoints', async () => {
    const res = await request(app).get('/api/health');

    expect(res.headers['content-security-policy']).toBeDefined();
    expect(res.headers['content-security-policy']).toContain("default-src 'self'");
    expect(res.headers['content-security-policy']).toContain("frame-ancestors 'none'");
  });

  it('serves X-Content-Type-Options: nosniff to prevent MIME confusion attacks', async () => {
    const res = await request(app).get('/api/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('serves X-Frame-Options: DENY to prevent clickjacking', async () => {
    const res = await request(app).get('/api/health');
    expect(res.headers['x-frame-options']).toBe('DENY');
  });

  it('serves Referrer-Policy: strict-origin-when-cross-origin', async () => {
    const res = await request(app).get('/api/health');
    expect(res.headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
  });

  it('serves Permissions-Policy restricting sensitive browser features', async () => {
    const res = await request(app).get('/api/health');
    expect(res.headers['permissions-policy']).toBe('camera=(), microphone=(), geolocation=()');
  });
});

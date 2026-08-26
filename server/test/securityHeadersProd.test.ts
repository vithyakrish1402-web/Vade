import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';

describe('Production HTTP Security Headers & Cache Privacy (Phase 10)', () => {
  const app = createApp();

  it('sets strict Cache-Control no-store on authenticated /api endpoints', async () => {
    const response = await request(app).get('/api/health');

    expect(response.headers['cache-control']).toBe(
      'no-store, no-cache, must-revalidate, private'
    );
    expect(response.headers['pragma']).toBe('no-cache');
  });

  it('sets security headers (CSP, X-Frame-Options, X-Content-Type-Options, Permissions-Policy)', async () => {
    const response = await request(app).get('/api/health');

    expect(response.headers['x-frame-options']).toBe('DENY');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
    expect(response.headers['permissions-policy']).toContain('camera=()');
    expect(response.headers['content-security-policy']).toContain("default-src 'self'");
  });

  it('generates and propagates correlation X-Request-Id header', async () => {
    const response = await request(app).get('/api/health');

    expect(response.headers['x-request-id']).toBeDefined();
    expect(response.headers['x-request-id']).toMatch(/^req_/);
  });

  it('preserves existing X-Request-Id if provided in request', async () => {
    const customId = 'req_custom_correlation_id_12345';
    const response = await request(app)
      .get('/api/health')
      .set('X-Request-Id', customId);

    expect(response.headers['x-request-id']).toBe(customId);
  });
});

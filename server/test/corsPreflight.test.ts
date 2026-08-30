import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { buildOriginPolicy } from '../src/config/origins.js';
import { mockDb } from './mockDb.js';

/**
 * CORS preflight coverage (Phase 0B — Increment 1, Part 3).
 *
 * Gap identified by the independent review of Increment 0: the suite proved that a hostile
 * *actual* request is refused, but never exercised the preflight that a browser sends
 * first. That matters because the preflight is where the second CSRF barrier does its
 * work. `X-Vade-Client` is only unforgeable from a browser if a custom header promotes the
 * request out of the CORS "simple request" category AND the resulting preflight is refused
 * for untrusted origins. This file tests that second half, against the real Express stack
 * rather than the policy helper in isolation.
 */

const TRUSTED_ORIGIN = 'https://app.vade.example';
const MALICIOUS_ORIGIN = 'https://evil.com';

const productionApp = createApp({
  originPolicy: buildOriginPolicy({
    corsOrigin: TRUSTED_ORIGIN,
    nodeEnv: 'production',
  }),
});

describe('CORS preflight — hostile origin requesting X-Vade-Client', () => {
  beforeEach(() => {
    mockDb.reset();
  });

  it('CRITICAL: a hostile preflight for X-Vade-Client is not granted', async () => {
    const res = await request(productionApp)
      .options('/api/crypto/identity')
      .set('Origin', MALICIOUS_ORIGIN)
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'X-Vade-Client, Content-Type');

    // THE decisive assertion. Per the Fetch spec a preflight succeeds only if the response
    // carries an Access-Control-Allow-Origin matching the request origin; without it the
    // browser fails the check and never issues the actual request, so `X-Vade-Client` can
    // never be attached cross-origin.
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('the other CORS response headers are inert without Allow-Origin', async () => {
    // Documented explicitly because it looks alarming and will be questioned in review:
    // the `cors` package emits Allow-Credentials, Allow-Methods, and an echo of
    // Allow-Headers unconditionally, including for an origin it is refusing. Those headers
    // grant nothing on their own — a credentialed preflight requires Allow-Origin to match
    // the origin, so a response missing it fails regardless of what else it contains.
    //
    // This test pins the actual behaviour so that if a future CORS change ever started
    // emitting Allow-Origin here, the assertion above would catch it rather than this
    // quirk masking the difference.
    const hostile = await request(productionApp)
      .options('/api/crypto/identity')
      .set('Origin', MALICIOUS_ORIGIN)
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'X-Vade-Client');

    const trusted = await request(productionApp)
      .options('/api/crypto/identity')
      .set('Origin', TRUSTED_ORIGIN)
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'X-Vade-Client');

    // Allow-Origin is the ONLY header that differs, and it is the one that decides.
    expect(hostile.headers['access-control-allow-origin']).toBeUndefined();
    expect(trusted.headers['access-control-allow-origin']).toBe(TRUSTED_ORIGIN);
  });

  it('CRITICAL: the actual POST from that origin cannot proceed even if the preflight is ignored', async () => {
    // A non-browser attacker can skip the preflight entirely. The origin guard is what
    // stops them, which is why CORS is a second barrier rather than the primary one.
    const registration = await request(productionApp)
      .post('/api/auth/register')
      .set('Origin', TRUSTED_ORIGIN)
      .send({
        username: 'victim',
        email: 'victim@example.com',
        password: 'Password123!',
        displayName: 'Victim',
      });
    const cookie = registration.headers['set-cookie'];

    const res = await request(productionApp)
      .post('/api/crypto/identity')
      .set('Origin', MALICIOUS_ORIGIN)
      .set('X-Vade-Client', 'android')
      .set('Cookie', cookie)
      .send({ keyId: 'k_attacker', publicKey: 'ATTACKER_KEY' });

    expect(res.status).toBe(403);
  });

  it('refuses a hostile preflight on every state-changing method', async () => {
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      const res = await request(productionApp)
        .options('/api/crypto/identity')
        .set('Origin', MALICIOUS_ORIGIN)
        .set('Access-Control-Request-Method', method)
        .set('Access-Control-Request-Headers', 'X-Vade-Client');
      expect(
        res.headers['access-control-allow-origin'],
        `preflight for ${method} must not be granted`
      ).toBeUndefined();
    }
  });

  it('refuses a hostile preflight from a lookalike origin', async () => {
    for (const origin of [
      `${TRUSTED_ORIGIN}.evil.com`,
      'http://app.vade.example',
      'https://app.vade.example:8443',
      'null',
    ]) {
      const res = await request(productionApp)
        .options('/api/crypto/identity')
        .set('Origin', origin)
        .set('Access-Control-Request-Method', 'POST')
        .set('Access-Control-Request-Headers', 'X-Vade-Client');
      expect(
        res.headers['access-control-allow-origin'],
        `preflight from ${origin} must not be granted`
      ).toBeUndefined();
    }
  });
});

describe('CORS preflight — legitimate frontend origin still works', () => {
  beforeEach(() => {
    mockDb.reset();
  });

  it('grants the preflight for the trusted origin', async () => {
    const res = await request(productionApp)
      .options('/api/crypto/identity')
      .set('Origin', TRUSTED_ORIGIN)
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'Content-Type');

    expect(res.headers['access-control-allow-origin']).toBe(TRUSTED_ORIGIN);
    expect(res.headers['access-control-allow-credentials']).toBe('true');
    expect(res.status).toBeLessThan(300);
  });

  it('grants the preflight for the trusted origin requesting X-Vade-Client', async () => {
    const res = await request(productionApp)
      .options('/api/crypto/identity')
      .set('Origin', TRUSTED_ORIGIN)
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'X-Vade-Client, Content-Type');

    expect(res.headers['access-control-allow-origin']).toBe(TRUSTED_ORIGIN);
    const allowedHeaders = (res.headers['access-control-allow-headers'] ?? '').toLowerCase();
    expect(allowedHeaders).toContain('x-vade-client');
  });

  it('the real request from the trusted origin then succeeds end to end', async () => {
    const registration = await request(productionApp)
      .post('/api/auth/register')
      .set('Origin', TRUSTED_ORIGIN)
      .send({
        username: 'alice',
        email: 'alice@example.com',
        password: 'Password123!',
        displayName: 'Alice',
      });
    const cookie = registration.headers['set-cookie'];

    const res = await request(productionApp)
      .post('/api/crypto/identity')
      .set('Origin', TRUSTED_ORIGIN)
      .set('Cookie', cookie)
      .send({ keyId: 'k_alice', publicKey: 'ALICE_KEY' });

    expect(res.status).toBe(200);
  });
});

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { buildOriginPolicy } from '../src/config/origins.js';
import { mockDb } from './mockDb.js';

/**
 * End-to-end CSRF coverage for the origin guard (Phase 0B — Increment 0, finding C-1).
 *
 * The app under test is built with a PRODUCTION origin policy so that the real production
 * behaviour is exercised through the full Express stack — routing, cookie auth, body
 * parsing and all — rather than the more permissive development behaviour.
 */

const TRUSTED_ORIGIN = 'https://app.vade.example';
const MALICIOUS_ORIGIN = 'https://evil.attacker.example';

const productionApp = createApp({
  originPolicy: buildOriginPolicy({
    corsOrigin: TRUSTED_ORIGIN,
    nodeEnv: 'production',
  }),
});

const developmentApp = createApp({
  originPolicy: buildOriginPolicy({
    corsOrigin: 'http://localhost:5173',
    nodeEnv: 'development',
  }),
});

/**
 * Registers a user through the guard itself, from an origin that app trusts. The origin is
 * explicit rather than defaulted because the development app trusts localhost and not the
 * production frontend origin — using one helper origin for both would silently 403.
 */
async function registerUser(app: typeof productionApp, username: string, origin = TRUSTED_ORIGIN) {
  const res = await request(app)
    .post('/api/auth/register')
    .set('Origin', origin)
    .send({
      username,
      email: `${username}@example.com`,
      password: 'Password123!',
      displayName: username,
    });
  expect(res.status, `setup registration failed: ${JSON.stringify(res.body)}`).toBe(201);
  return { userId: res.body.user.id as string, cookie: res.headers['set-cookie'] };
}

const DEV_ORIGIN = 'http://localhost:5173';

describe('CSRF origin guard — state-changing endpoint coverage', () => {
  beforeEach(() => {
    mockDb.reset();
  });

  // Every cookie-authenticated state-changing route in the API. Listed exhaustively so a
  // route added later without guard coverage shows up as a gap here rather than silently.
  const STATE_CHANGING_ROUTES: Array<{ method: 'post' | 'patch' | 'delete'; path: string; body?: unknown }> = [
    { method: 'post', path: '/api/crypto/identity', body: { keyId: 'k_x', publicKey: 'PUB' } },
    { method: 'post', path: '/api/devices/register', body: { keyId: 'k_x' } },
    { method: 'post', path: '/api/devices/some-device-id/revoke' },
    { method: 'post', path: '/api/conversations', body: { recipientUsername: 'bob' } },
    { method: 'post', path: '/api/conversations/some-id/messages', body: {} },
    { method: 'post', path: '/api/conversations/some-id/read' },
    { method: 'post', path: '/api/conversations/some-id/clear' },
    { method: 'delete', path: '/api/conversations/some-id/messages/some-message-id' },
    { method: 'patch', path: '/api/users/me', body: { displayName: 'New Name' } },
    { method: 'post', path: '/api/auth/logout' },
    { method: 'post', path: '/api/auth/login', body: { identifier: 'a', password: 'b' } },
    { method: 'post', path: '/api/auth/register', body: { username: 'x' } },
  ];

  for (const route of STATE_CHANGING_ROUTES) {
    it(`blocks a malicious origin on ${route.method.toUpperCase()} ${route.path}`, async () => {
      const { cookie } = await registerUser(productionApp, 'victim');

      const res = await request(productionApp)
        [route.method](route.path)
        .set('Origin', MALICIOUS_ORIGIN)
        .set('Cookie', cookie)
        .send(route.body ?? undefined);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
      // The request must be stopped at the boundary, before any handler-specific error
      // (404/422/401) could be produced — proof the guard runs ahead of routing.
      expect(res.body.error.message).toMatch(/origin is not permitted/i);
    });

    it(`blocks a missing origin on ${route.method.toUpperCase()} ${route.path} in production`, async () => {
      const { cookie } = await registerUser(productionApp, 'victim');

      const res = await request(productionApp)
        [route.method](route.path)
        .set('Cookie', cookie)
        .send(route.body ?? undefined);

      expect(res.status).toBe(403);
    });
  }

  it('permits every state-changing route to proceed past the guard from the trusted origin', async () => {
    // One registration for the whole sweep: bcrypt at cost 12 makes a per-iteration
    // registration slow enough to blow the default timeout, and the session is all these
    // requests need. Routes are probed with placeholder ids, so most will fail on their
    // own merits — the assertion below cares only that the guard was not the cause.
    const { cookie } = await registerUser(productionApp, 'victim');

    for (const route of STATE_CHANGING_ROUTES) {
      const res = await request(productionApp)
        [route.method](route.path)
        .set('Origin', TRUSTED_ORIGIN)
        .set('Cookie', cookie)
        .send(route.body ?? undefined);

      // The guard must not be the thing that stops these. They may still fail on their own
      // merits (404 for a made-up id, 422 for a stub body), but never with the guard's 403.
      expect(
        res.status === 403 && /origin is not permitted/i.test(res.body?.error?.message ?? ''),
        `${route.method.toUpperCase()} ${route.path} was blocked by the origin guard from the trusted origin`
      ).toBe(false);
    }
  });
});

describe('CSRF origin guard — safe methods stay usable', () => {
  beforeEach(() => {
    mockDb.reset();
  });

  it('allows GET with no Origin at all', async () => {
    const res = await request(productionApp).get('/api/health');
    expect(res.status).toBe(200);
  });

  it('allows GET from an arbitrary origin (CORS, not the guard, governs readability)', async () => {
    const res = await request(productionApp).get('/api/health').set('Origin', MALICIOUS_ORIGIN);
    expect(res.status).toBe(200);
    // The response is returned but is not readable cross-origin: no ACAO for evil.example.
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('allows an authenticated GET from the trusted origin', async () => {
    const { cookie } = await registerUser(productionApp, 'alice');
    const res = await request(productionApp)
      .get('/api/users/me')
      .set('Origin', TRUSTED_ORIGIN)
      .set('Cookie', cookie);
    expect(res.status).toBe(200);
  });

  it('still requires authentication on GET — the guard does not replace authorization', async () => {
    const res = await request(productionApp).get('/api/users/me').set('Origin', TRUSTED_ORIGIN);
    expect(res.status).toBe(401);
  });

  it('sets Access-Control-Allow-Origin only for the trusted origin', async () => {
    const res = await request(productionApp).get('/api/health').set('Origin', TRUSTED_ORIGIN);
    expect(res.headers['access-control-allow-origin']).toBe(TRUSTED_ORIGIN);
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });
});

describe('CSRF origin guard — content type is a second, independent barrier', () => {
  beforeEach(() => {
    mockDb.reset();
  });

  it('CRITICAL: refuses a form-encoded body even from the trusted origin', async () => {
    // The form content type is the CORS "simple request" vehicle — the only body format a
    // cross-origin page can send without a preflight. It has no legitimate use here.
    const { cookie } = await registerUser(productionApp, 'alice');

    const res = await request(productionApp)
      .post('/api/crypto/identity')
      .set('Origin', TRUSTED_ORIGIN)
      .set('Cookie', cookie)
      .set('Content-Type', 'application/x-www-form-urlencoded')
      .send('keyId=k_evil&publicKey=ATTACKER_KEY');

    expect(res.status).toBe(415);
  });

  it('refuses a multipart body', async () => {
    const { cookie } = await registerUser(productionApp, 'alice');
    const res = await request(productionApp)
      .post('/api/crypto/identity')
      .set('Origin', TRUSTED_ORIGIN)
      .set('Cookie', cookie)
      .set('Content-Type', 'multipart/form-data; boundary=----x')
      .send('------x\r\n\r\n');
    expect(res.status).toBe(415);
  });

  it('refuses a text/plain body', async () => {
    const { cookie } = await registerUser(productionApp, 'alice');
    const res = await request(productionApp)
      .post('/api/crypto/identity')
      .set('Origin', TRUSTED_ORIGIN)
      .set('Cookie', cookie)
      .set('Content-Type', 'text/plain')
      .send('{"keyId":"k_evil","publicKey":"ATTACKER_KEY"}');
    expect(res.status).toBe(415);
  });

  it('accepts application/json with charset parameters and odd casing', async () => {
    const { cookie } = await registerUser(productionApp, 'alice');
    const res = await request(productionApp)
      .post('/api/crypto/identity')
      .set('Origin', TRUSTED_ORIGIN)
      .set('Cookie', cookie)
      .set('Content-Type', 'Application/JSON; charset=UTF-8')
      .send(JSON.stringify({ keyId: 'k_ok', publicKey: 'PUB' }));
    expect(res.status).toBe(200);
  });

  it('allows a bodyless state-changing request that carries no content type', async () => {
    const { cookie } = await registerUser(productionApp, 'alice');
    const res = await request(productionApp)
      .post('/api/auth/logout')
      .set('Origin', TRUSTED_ORIGIN)
      .set('Cookie', cookie);
    expect(res.status).toBe(200);
  });
});

describe('CSRF origin guard — native (non-browser) clients', () => {
  beforeEach(() => {
    mockDb.reset();
  });

  it('accepts a headerless request carrying the native-client header in production', async () => {
    const { cookie } = await registerUser(productionApp, 'alice');
    const res = await request(productionApp)
      .post('/api/crypto/identity')
      .set('Cookie', cookie)
      .set('X-Vade-Client', 'android')
      .send({ keyId: 'k_android', publicKey: 'PUB' });
    expect(res.status).toBe(200);
  });

  it('CRITICAL: the native-client header does not rescue a malicious Origin', async () => {
    const { cookie } = await registerUser(productionApp, 'alice');
    const res = await request(productionApp)
      .post('/api/crypto/identity')
      .set('Origin', MALICIOUS_ORIGIN)
      .set('Cookie', cookie)
      .set('X-Vade-Client', 'android')
      .send({ keyId: 'k_evil', publicKey: 'ATTACKER_KEY' });
    expect(res.status).toBe(403);
  });
});

describe('CSRF origin guard — header-smuggling and routing bypasses', () => {
  beforeEach(() => {
    mockDb.reset();
  });

  it('CRITICAL: duplicate Origin headers cannot smuggle a trusted value past the check', async () => {
    // Node joins duplicate Origin headers into one comma-separated value. The joined
    // string is not a parseable origin, so it must be refused outright rather than
    // matching on the trusted half.
    const { cookie } = await registerUser(productionApp, 'alice');

    for (const smuggled of [
      `${TRUSTED_ORIGIN}, ${MALICIOUS_ORIGIN}`,
      `${MALICIOUS_ORIGIN}, ${TRUSTED_ORIGIN}`,
      `${TRUSTED_ORIGIN},${MALICIOUS_ORIGIN}`,
    ]) {
      const res = await request(productionApp)
        .post('/api/crypto/identity')
        .set('Origin', smuggled)
        .set('Cookie', cookie)
        .send({ keyId: 'k_evil', publicKey: 'ATTACKER_KEY' });
      expect(res.status, `smuggled origin "${smuggled}" must be refused`).toBe(403);
    }
  });

  it('CRITICAL: a trusted Referer cannot rescue an untrusted Origin over HTTP', async () => {
    const { cookie } = await registerUser(productionApp, 'alice');
    const res = await request(productionApp)
      .post('/api/crypto/identity')
      .set('Origin', MALICIOUS_ORIGIN)
      .set('Referer', `${TRUSTED_ORIGIN}/messages`)
      .set('Cookie', cookie)
      .send({ keyId: 'k_evil', publicKey: 'ATTACKER_KEY' });
    expect(res.status).toBe(403);
  });

  it('guards unknown routes too, so a future route cannot be added uncovered', async () => {
    const res = await request(productionApp)
      .post('/api/not-a-real-route')
      .set('Origin', MALICIOUS_ORIGIN)
      .send({ x: 1 });
    // The guard refuses before routing resolves, so this is 403 rather than 404.
    expect(res.status).toBe(403);
  });

  it('is not fooled by a method-override header', async () => {
    // No method-override middleware is mounted, so this must remain a GET and must not
    // become a state change. Asserted so that adding such middleware later breaks loudly.
    const res = await request(productionApp)
      .get('/api/health')
      .set('Origin', MALICIOUS_ORIGIN)
      .set('X-HTTP-Method-Override', 'POST');
    expect(res.status).toBe(200);
  });

  it('PUT is treated as state-changing even though no route currently uses it', async () => {
    const res = await request(productionApp)
      .put('/api/crypto/identity')
      .set('Origin', MALICIOUS_ORIGIN)
      .send({ keyId: 'k_evil', publicKey: 'ATTACKER_KEY' });
    expect(res.status).toBe(403);
  });
});

describe('CSRF origin guard — development behaviour', () => {
  beforeEach(() => {
    mockDb.reset();
  });

  it('accepts the localhost dev origin', async () => {
    const { cookie } = await registerUser(developmentApp, 'devuser', DEV_ORIGIN);
    const res = await request(developmentApp)
      .post('/api/crypto/identity')
      .set('Origin', 'http://localhost:5173')
      .set('Cookie', cookie)
      .send({ keyId: 'k_dev', publicKey: 'PUB' });
    expect(res.status).toBe(200);
  });

  it('accepts a headerless request (curl, tests, emulator) in development', async () => {
    const { cookie } = await registerUser(developmentApp, 'devuser', DEV_ORIGIN);
    const res = await request(developmentApp)
      .post('/api/crypto/identity')
      .set('Cookie', cookie)
      .send({ keyId: 'k_dev', publicKey: 'PUB' });
    expect(res.status).toBe(200);
  });

  it('CRITICAL: development leniency never extends to a malicious Origin', async () => {
    const { cookie } = await registerUser(developmentApp, 'devuser', DEV_ORIGIN);
    const res = await request(developmentApp)
      .post('/api/crypto/identity')
      .set('Origin', MALICIOUS_ORIGIN)
      .set('Cookie', cookie)
      .send({ keyId: 'k_evil', publicKey: 'ATTACKER_KEY' });
    expect(res.status).toBe(403);
  });

  it('development still refuses form-encoded bodies', async () => {
    const { cookie } = await registerUser(developmentApp, 'devuser', DEV_ORIGIN);
    const res = await request(developmentApp)
      .post('/api/crypto/identity')
      .set('Origin', 'http://localhost:5173')
      .set('Cookie', cookie)
      .set('Content-Type', 'application/x-www-form-urlencoded')
      .send('keyId=k_evil&publicKey=ATTACKER_KEY');
    expect(res.status).toBe(415);
  });
});

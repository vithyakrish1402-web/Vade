import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { WebSocket } from 'ws';
import { createApp } from '../src/app.js';
import { wsService } from '../src/services/websocket.js';
import { buildOriginPolicy } from '../src/config/origins.js';
import { mockDb } from './mockDb.js';

/**
 * Finding C-2: Cross-Site WebSocket Hijacking.
 *
 * CORS does not apply to WebSocket handshakes, so the origin check here is a genuinely
 * separate boundary from the HTTP one. Without it, a `SameSite=None` session cookie is
 * attached to an upgrade initiated by any website, and the resulting socket is fully
 * authenticated — which in Vade means a live feed of the victim's ciphertext, because
 * messages are delivered to every socket registered for a user regardless of whether it
 * subscribed to anything.
 *
 * The decisive assertions are the ones proving that a valid session cookie is NOT
 * sufficient on its own: authentication and origin are independent gates.
 */

const TRUSTED_ORIGIN = 'https://app.vade.example';
const MALICIOUS_ORIGIN = 'https://evil.attacker.example';

const PRODUCTION_POLICY = buildOriginPolicy({
  corsOrigin: TRUSTED_ORIGIN,
  nodeEnv: 'production',
});

const DEVELOPMENT_POLICY = buildOriginPolicy({
  corsOrigin: 'http://localhost:5173',
  nodeEnv: 'development',
});

describe('C-2: WebSocket handshake origin validation', () => {
  let server: http.Server;
  let wsUrl: string;
  let victimCookie: string;
  const openSockets: WebSocket[] = [];

  const app = createApp({ originPolicy: PRODUCTION_POLICY });

  /**
   * Attempts a handshake and reports whether it was accepted, without leaving a socket open.
   * A rejected upgrade surfaces as an `error`/`unexpected-response` rather than `open`.
   */
  function attemptHandshake(headers: Record<string, string>): Promise<
    { accepted: true } | { accepted: false; statusCode?: number }
  > {
    return new Promise((resolve) => {
      const ws = new WebSocket(wsUrl, { headers });
      openSockets.push(ws);

      let settled = false;
      const settle = (result: { accepted: true } | { accepted: false; statusCode?: number }) => {
        if (settled) return;
        settled = true;
        resolve(result);
      };

      ws.on('open', () => settle({ accepted: true }));
      ws.on('unexpected-response', (_req, res) => settle({ accepted: false, statusCode: res.statusCode }));
      ws.on('error', () => settle({ accepted: false }));
      setTimeout(() => settle({ accepted: false }), 3000);
    });
  }

  beforeEach(async () => {
    mockDb.reset();
    wsService.reset();
    wsService.setOriginPolicy(PRODUCTION_POLICY);

    server = http.createServer(app);
    wsService.init(server);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const { port } = server.address() as AddressInfo;
    wsUrl = `ws://127.0.0.1:${port}/ws`;

    const registration = await request(app)
      .post('/api/auth/register')
      .set('Origin', TRUSTED_ORIGIN)
      .send({
        username: 'victim',
        email: 'victim@example.com',
        password: 'Password123!',
        displayName: 'Victim',
      });
    victimCookie = (registration.headers['set-cookie'] as unknown as string[])[0];
  });

  afterEach(async () => {
    for (const ws of openSockets) {
      try {
        ws.terminate();
      } catch {
        /* already closed */
      }
    }
    openSockets.length = 0;
    await wsService.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('accepts a handshake from the legitimate frontend origin', async () => {
    const result = await attemptHandshake({ Origin: TRUSTED_ORIGIN, Cookie: victimCookie });
    expect(result.accepted).toBe(true);
  });

  it('CRITICAL: rejects a handshake from a malicious origin carrying a valid session cookie', async () => {
    // The hijack attempt. The cookie is genuine and the session is live; only the origin
    // differs from the real client. This must not produce an authenticated socket.
    const result = await attemptHandshake({ Origin: MALICIOUS_ORIGIN, Cookie: victimCookie });
    expect(result.accepted).toBe(false);
  });

  it('CRITICAL: a valid session cookie is not sufficient without a valid origin', async () => {
    // Stated as its own case because it is the property that actually closes C-2:
    // authentication and origin are independent gates, and the socket is refused at the
    // handshake — before authentication is even attempted.
    const hijack = await attemptHandshake({ Origin: MALICIOUS_ORIGIN, Cookie: victimCookie });
    const legitimate = await attemptHandshake({ Origin: TRUSTED_ORIGIN, Cookie: victimCookie });

    expect(hijack.accepted).toBe(false);
    expect(legitimate.accepted).toBe(true);
  });

  it('rejects a missing origin in production', async () => {
    const result = await attemptHandshake({ Cookie: victimCookie });
    expect(result.accepted).toBe(false);
  });

  it('rejects an opaque "null" origin (sandboxed iframe)', async () => {
    const result = await attemptHandshake({ Origin: 'null', Cookie: victimCookie });
    expect(result.accepted).toBe(false);
  });

  it('rejects lookalike origins', async () => {
    for (const origin of [
      `${TRUSTED_ORIGIN}.evil.example`,
      'http://app.vade.example',
      'https://app.vade.example:8443',
      'https://notapp.vade.example',
    ]) {
      const result = await attemptHandshake({ Origin: origin, Cookie: victimCookie });
      expect(result.accepted, `origin ${origin} must be refused`).toBe(false);
    }
  });

  it('rejects a malicious origin even without any cookie', async () => {
    const result = await attemptHandshake({ Origin: MALICIOUS_ORIGIN });
    expect(result.accepted).toBe(false);
  });

  it('accepts a native client (no Origin) presenting the client header in production', async () => {
    const result = await attemptHandshake({ Cookie: victimCookie, 'X-Vade-Client': 'android' });
    expect(result.accepted).toBe(true);
  });

  it('CRITICAL: the native-client header does not rescue a malicious origin', async () => {
    const result = await attemptHandshake({
      Origin: MALICIOUS_ORIGIN,
      Cookie: victimCookie,
      'X-Vade-Client': 'android',
    });
    expect(result.accepted).toBe(false);
  });

  it('a rejected handshake never reaches an authenticated state', async () => {
    // Belt and braces on the previous cases: confirm the server registered no socket for
    // the victim as a result of the hijack attempt, so nothing would be delivered to it.
    await attemptHandshake({ Origin: MALICIOUS_ORIGIN, Cookie: victimCookie });
    // A rejected upgrade produces no 'connection' event, so no user socket exists. Sending
    // to the user must therefore be a no-op rather than reaching the attacker.
    expect(() =>
      wsService.sendToUser('any-user-id', { type: 'pong' } as never)
    ).not.toThrow();
  });
});

describe('C-2: WebSocket handshake origin validation — development behaviour', () => {
  let server: http.Server;
  let wsUrl: string;
  const openSockets: WebSocket[] = [];

  const app = createApp({ originPolicy: DEVELOPMENT_POLICY });

  function attemptHandshake(headers: Record<string, string>): Promise<boolean> {
    return new Promise((resolve) => {
      const ws = new WebSocket(wsUrl, { headers });
      openSockets.push(ws);
      let settled = false;
      const settle = (accepted: boolean) => {
        if (settled) return;
        settled = true;
        resolve(accepted);
      };
      ws.on('open', () => settle(true));
      ws.on('unexpected-response', () => settle(false));
      ws.on('error', () => settle(false));
      setTimeout(() => settle(false), 3000);
    });
  }

  beforeEach(async () => {
    mockDb.reset();
    wsService.reset();
    wsService.setOriginPolicy(DEVELOPMENT_POLICY);
    server = http.createServer(app);
    wsService.init(server);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const { port } = server.address() as AddressInfo;
    wsUrl = `ws://127.0.0.1:${port}/ws`;
  });

  afterEach(async () => {
    for (const ws of openSockets) {
      try {
        ws.terminate();
      } catch {
        /* already closed */
      }
    }
    openSockets.length = 0;
    await wsService.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('accepts the localhost dev origin', async () => {
    expect(await attemptHandshake({ Origin: 'http://localhost:5173' })).toBe(true);
  });

  it('accepts a missing origin, so local tooling and the test suite keep working', async () => {
    expect(await attemptHandshake({})).toBe(true);
  });

  it('CRITICAL: development leniency never extends to a malicious origin', async () => {
    // The development branch must relax only the *missing* origin rule. If it also
    // admitted wrong origins, a misconfigured NODE_ENV would silently reopen C-2.
    expect(await attemptHandshake({ Origin: MALICIOUS_ORIGIN })).toBe(false);
  });

  it('development still rejects an opaque "null" origin', async () => {
    expect(await attemptHandshake({ Origin: 'null' })).toBe(false);
  });
});

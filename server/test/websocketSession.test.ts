import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { WebSocket } from 'ws';
import { createApp } from '../src/app.js';
import { wsService, WS_CLOSE_SESSION_REVOKED } from '../src/services/websocket.js';
import { AuthService } from '../src/services/authService.js';
import { buildOriginPolicy } from '../src/config/origins.js';
import { mockDb } from './mockDb.js';
import type { WSServerMessage } from '@enctxt/shared';

/**
 * WebSocket session lifetime enforcement (Phase 0B — Increment 1, Part 2).
 *
 * The property under test is NOT "logout returns 200". It is: a socket authenticated with
 * a session that is no longer valid must stop receiving protected data. Every test here
 * therefore drives a real socket over a real server and asserts on frames actually
 * received (or not received), never on an HTTP status code alone.
 *
 * `sendToMembers` reaches every socket registered for a user regardless of subscription,
 * so subscription is not the authorization boundary and is deliberately not used as a
 * proxy for one in these tests.
 */

const TRUSTED_ORIGIN = 'https://app.vade.example';
const PRODUCTION_POLICY = buildOriginPolicy({
  corsOrigin: TRUSTED_ORIGIN,
  nodeEnv: 'production',
});

interface TestClient {
  ws: WebSocket;
  frames: WSServerMessage[];
  closeCode: number | null;
  closed: Promise<number>;
  waitFor: (predicate: (m: WSServerMessage) => boolean, timeoutMs?: number) => Promise<WSServerMessage>;
}

describe('WebSocket session lifetime', () => {
  let server: http.Server;
  let wsUrl: string;
  const app = createApp({ originPolicy: PRODUCTION_POLICY });
  const openSockets: WebSocket[] = [];

  let aliceCookie: string;
  let aliceId: string;
  let aliceSessionId: string;

  beforeEach(async () => {
    mockDb.reset();
    wsService.reset();
    wsService.setOriginPolicy(PRODUCTION_POLICY);

    server = http.createServer(app);
    wsService.init(server);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    wsUrl = `ws://127.0.0.1:${(server.address() as AddressInfo).port}/ws`;

    const registration = await request(app)
      .post('/api/auth/register')
      .set('Origin', TRUSTED_ORIGIN)
      .send({
        username: 'alice',
        email: 'alice@example.com',
        password: 'Password123!',
        displayName: 'Alice',
      });
    aliceId = registration.body.user.id;
    aliceCookie = (registration.headers['set-cookie'] as unknown as string[])[0];
    aliceSessionId = mockDb.listSessions().find((s) => s.userId === aliceId)!.id;
  });

  afterEach(async () => {
    for (const ws of openSockets) {
      try {
        ws.terminate();
      } catch {
        /* already gone */
      }
    }
    openSockets.length = 0;
    await wsService.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  function connect(headers: Record<string, string>): TestClient {
    const ws = new WebSocket(wsUrl, { headers });
    openSockets.push(ws);

    const frames: WSServerMessage[] = [];
    const waiters: Array<{
      predicate: (m: WSServerMessage) => boolean;
      resolve: (m: WSServerMessage) => void;
      timer: NodeJS.Timeout;
    }> = [];

    const client: TestClient = {
      ws,
      frames,
      closeCode: null,
      closed: new Promise<number>((resolve) => {
        ws.on('close', (code) => {
          client.closeCode = code;
          resolve(code);
        });
      }),
      waitFor: (predicate, timeoutMs = 2000) =>
        new Promise((resolve, reject) => {
          const existing = frames.find(predicate);
          if (existing) return resolve(existing);
          const timer = setTimeout(() => reject(new Error('timed out waiting for frame')), timeoutMs);
          waiters.push({ predicate, resolve, timer });
        }),
    };

    ws.on('message', (data) => {
      const parsed = JSON.parse(data.toString()) as WSServerMessage;
      frames.push(parsed);
      for (let i = waiters.length - 1; i >= 0; i--) {
        if (waiters[i].predicate(parsed)) {
          clearTimeout(waiters[i].timer);
          waiters[i].resolve(parsed);
          waiters.splice(i, 1);
        }
      }
    });

    return client;
  }

  /** Connects and waits until the server confirms authentication. */
  async function connectAuthenticated(cookie = aliceCookie): Promise<TestClient> {
    const client = connect({ Origin: TRUSTED_ORIGIN, Cookie: cookie });
    await new Promise<void>((resolve, reject) => {
      client.ws.on('open', () => resolve());
      client.ws.on('error', reject);
      setTimeout(() => reject(new Error('socket never opened')), 3000);
    });
    await client.waitFor((m) => m.type === 'authenticated');
    return client;
  }

  /** Attempts a handshake; resolves true only if it reached OPEN. */
  function handshakeAccepted(headers: Record<string, string>): Promise<boolean> {
    return new Promise((resolve) => {
      const ws = new WebSocket(wsUrl, { headers });
      openSockets.push(ws);
      let settled = false;
      const settle = (v: boolean) => {
        if (!settled) {
          settled = true;
          resolve(v);
        }
      };
      ws.on('open', () => settle(true));
      ws.on('unexpected-response', () => settle(false));
      ws.on('error', () => settle(false));
      setTimeout(() => settle(false), 3000);
    });
  }

  /** A protected payload; if any of these arrive at a revoked socket, the control failed. */
  const PROTECTED_EVENT = {
    type: 'message.created',
    message: { id: 'm1', conversationId: 'c1', ciphertext: 'SECRET_CIPHERTEXT' },
  } as unknown as WSServerMessage;

  // ---------------------------------------------------------------- handshake gate

  it('1. valid origin + valid session → accepted and authenticated', async () => {
    const client = await connectAuthenticated();
    expect(client.frames.some((f) => f.type === 'authenticated')).toBe(true);
  });

  it('2. evil origin + valid session → rejected', async () => {
    expect(await handshakeAccepted({ Origin: 'https://evil.com', Cookie: aliceCookie })).toBe(false);
  });

  it('3. missing origin in production → rejected', async () => {
    expect(await handshakeAccepted({ Cookie: aliceCookie })).toBe(false);
  });

  it('4. null origin → rejected', async () => {
    expect(await handshakeAccepted({ Origin: 'null', Cookie: aliceCookie })).toBe(false);
  });

  it('5. valid origin + revoked session → connects but is never authenticated', async () => {
    // The session row is deleted before the socket is opened. The handshake itself is
    // origin-gated only, so it may complete — but authentication must fail, leaving the
    // socket out of every delivery registry.
    mockDb.deleteSession(aliceSessionId);

    const client = connect({ Origin: TRUSTED_ORIGIN, Cookie: aliceCookie });
    await new Promise((r) => setTimeout(r, 300));

    expect(client.frames.some((f) => f.type === 'authenticated')).toBe(false);
    expect(wsService.getSocketCountForUser(aliceId)).toBe(0);

    // And it receives nothing when the server fans out to that user.
    wsService.sendToUser(aliceId, PROTECTED_EVENT);
    await new Promise((r) => setTimeout(r, 150));
    expect(client.frames.some((f) => f.type === 'message.created')).toBe(false);
  });

  it('6. valid origin + expired session → never authenticated', async () => {
    mockDb.expireSession(aliceSessionId);

    const client = connect({ Origin: TRUSTED_ORIGIN, Cookie: aliceCookie });
    await new Promise((r) => setTimeout(r, 300));

    expect(client.frames.some((f) => f.type === 'authenticated')).toBe(false);
    expect(wsService.getSocketCountForUser(aliceId)).toBe(0);
  });

  // ---------------------------------------------------------------- logout

  it('7. authenticated socket → logout → socket terminated with the revocation close code', async () => {
    const client = await connectAuthenticated();
    expect(wsService.getSocketCountForUser(aliceId)).toBe(1);

    await AuthService.logout(aliceSessionId);

    const code = await Promise.race([
      client.closed,
      new Promise<number>((_, reject) => setTimeout(() => reject(new Error('socket was not closed')), 2000)),
    ]);
    expect(code).toBe(WS_CLOSE_SESSION_REVOKED);
    expect(wsService.getSocketCountForUser(aliceId)).toBe(0);
  });

  it('8. authenticated socket → logout → no further protected frames', async () => {
    const client = await connectAuthenticated();
    await AuthService.logout(aliceSessionId);

    // Fan out immediately after logout, the way a peer's message would.
    wsService.sendToUser(aliceId, PROTECTED_EVENT);
    wsService.sendToMembers([aliceId], PROTECTED_EVENT);
    await new Promise((r) => setTimeout(r, 200));

    expect(client.frames.some((f) => f.type === 'message.created')).toBe(false);
  });

  it('8b. logout through the real HTTP endpoint terminates the socket', async () => {
    // Proves the wiring, not just the service method: the actual logout route must reach
    // the socket. Asserted on the socket closing, not on the 200.
    const client = await connectAuthenticated();

    const res = await request(app)
      .post('/api/auth/logout')
      .set('Origin', TRUSTED_ORIGIN)
      .set('Cookie', aliceCookie);
    expect(res.status).toBe(200);

    const code = await Promise.race([
      client.closed,
      new Promise<number>((_, reject) => setTimeout(() => reject(new Error('socket was not closed')), 2000)),
    ]);
    expect(code).toBe(WS_CLOSE_SESSION_REVOKED);
  });

  it('8c. logout revokes only that session, leaving the user other sessions untouched', async () => {
    // A second, independent session for the same user (another device or tab).
    const secondLogin = await request(app)
      .post('/api/auth/login')
      .set('Origin', TRUSTED_ORIGIN)
      .send({ identifier: 'alice', password: 'Password123!' });
    const secondCookie = (secondLogin.headers['set-cookie'] as unknown as string[])[0];
    const secondSessionId = mockDb
      .listSessions()
      .find((s) => s.userId === aliceId && s.id !== aliceSessionId)!.id;

    const first = await connectAuthenticated(aliceCookie);
    const second = await connectAuthenticated(secondCookie);
    expect(wsService.getSocketCountForUser(aliceId)).toBe(2);

    await AuthService.logout(aliceSessionId);
    await new Promise((r) => setTimeout(r, 200));

    expect(first.closeCode).toBe(WS_CLOSE_SESSION_REVOKED);
    expect(second.closeCode).toBeNull();
    expect(wsService.getSocketCountForUser(aliceId)).toBe(1);

    // The surviving session still receives data.
    wsService.sendToUser(aliceId, PROTECTED_EVENT);
    await second.waitFor((f) => f.type === 'message.created');
    expect(secondSessionId).toBeTruthy();
  });

  // ---------------------------------------------------------------- revocation sweep

  it('9. session revoked out of band → sweep terminates the socket, no protected frames', async () => {
    const client = await connectAuthenticated();

    // Deleting the row directly models revocation by another process, an admin action, or
    // any future code path that forgets to call closeSession — the case the defense-in-
    // depth sweep exists for.
    mockDb.deleteSession(aliceSessionId);

    const revoked = await wsService.revalidateSessions();
    expect(revoked).toBe(1);

    wsService.sendToUser(aliceId, PROTECTED_EVENT);
    await new Promise((r) => setTimeout(r, 200));
    expect(client.frames.some((f) => f.type === 'message.created')).toBe(false);
    expect(wsService.getSocketCountForUser(aliceId)).toBe(0);
  });

  it('9b. an expired session is torn down by the sweep', async () => {
    const client = await connectAuthenticated();
    mockDb.expireSession(aliceSessionId);

    expect(await wsService.revalidateSessions()).toBe(1);
    await new Promise((r) => setTimeout(r, 100));
    expect(client.closeCode).toBe(WS_CLOSE_SESSION_REVOKED);
  });

  it('9c. the sweep leaves valid sessions alone', async () => {
    const client = await connectAuthenticated();
    expect(await wsService.revalidateSessions()).toBe(0);
    expect(client.closeCode).toBeNull();

    wsService.sendToUser(aliceId, PROTECTED_EVENT);
    await client.waitFor((f) => f.type === 'message.created');
  });

  it('9d. the sweep fails safe, not closed, when the database is unavailable', async () => {
    // A transient database fault must not sign every connected user out.
    const client = await connectAuthenticated();
    const restore = mockDb.breakSessionReads();
    try {
      expect(await wsService.revalidateSessions()).toBe(0);
    } finally {
      restore();
    }
    await new Promise((r) => setTimeout(r, 100));
    expect(client.closeCode).toBeNull();
    expect(wsService.getSocketCountForUser(aliceId)).toBe(1);
  });

  // ---------------------------------------------------------------- registry integrity

  it('10. a rejected socket never enters userSockets', async () => {
    await handshakeAccepted({ Origin: 'https://evil.com', Cookie: aliceCookie });
    await new Promise((r) => setTimeout(r, 200));
    expect(wsService.getSocketCountForUser(aliceId)).toBe(0);
    expect(wsService.getTotalAuthorizedSocketCount()).toBe(0);
  });

  it('11. sendToMembers cannot deliver to an invalidated socket', async () => {
    // The critical path: sendToMembers ignores subscriptions, so the check must live at
    // the socket. Delivery is attempted while the socket is still physically open.
    const client = await connectAuthenticated();
    const socketsBefore = wsService.getSocketCountForUser(aliceId);
    expect(socketsBefore).toBe(1);

    wsService.closeSession(aliceSessionId, 'test revocation');

    wsService.sendToMembers([aliceId], PROTECTED_EVENT);
    wsService.broadcastToConversation('c1', PROTECTED_EVENT);
    await new Promise((r) => setTimeout(r, 200));

    expect(client.frames.some((f) => f.type === 'message.created')).toBe(false);
  });

  it('12b. a session deleted during the connect handshake is torn down immediately', async () => {
    // The TOCTOU case: authentication reads a valid session, then logout revokes it before
    // the socket finishes registering, so closeSession() found nothing to close. The
    // post-registration re-check must catch this rather than leaving a live socket on a
    // dead session until the next sweep.
    const client = connect({ Origin: TRUSTED_ORIGIN, Cookie: aliceCookie });
    // Delete the row while the handshake is in flight.
    mockDb.deleteSession(aliceSessionId);

    await new Promise((r) => setTimeout(r, 400));

    expect(wsService.getSocketCountForUser(aliceId)).toBe(0);
    wsService.sendToUser(aliceId, PROTECTED_EVENT);
    await new Promise((r) => setTimeout(r, 150));
    expect(client.frames.some((f) => f.type === 'message.created')).toBe(false);
  });

  it('12. reconnecting after logout with the same cookie is not authenticated', async () => {
    const client = await connectAuthenticated();
    await AuthService.logout(aliceSessionId);
    await client.closed;

    // Same cookie, same origin — but the session behind it is gone.
    const reconnect = connect({ Origin: TRUSTED_ORIGIN, Cookie: aliceCookie });
    await new Promise((r) => setTimeout(r, 300));

    expect(reconnect.frames.some((f) => f.type === 'authenticated')).toBe(false);
    expect(wsService.getSocketCountForUser(aliceId)).toBe(0);

    wsService.sendToUser(aliceId, PROTECTED_EVENT);
    await new Promise((r) => setTimeout(r, 150));
    expect(reconnect.frames.some((f) => f.type === 'message.created')).toBe(false);
  });
});

describe('WebSocket receipt authorization (audit finding H-5)', () => {
  let server: http.Server;
  let wsUrl: string;
  const app = createApp({ originPolicy: PRODUCTION_POLICY });
  const openSockets: WebSocket[] = [];

  beforeEach(async () => {
    mockDb.reset();
    wsService.reset();
    wsService.setOriginPolicy(PRODUCTION_POLICY);
    server = http.createServer(app);
    wsService.init(server);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    wsUrl = `ws://127.0.0.1:${(server.address() as AddressInfo).port}/ws`;
  });

  afterEach(async () => {
    for (const ws of openSockets) {
      try {
        ws.terminate();
      } catch {
        /* already gone */
      }
    }
    openSockets.length = 0;
    await wsService.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  async function makeUser(username: string) {
    const res = await request(app)
      .post('/api/auth/register')
      .set('Origin', TRUSTED_ORIGIN)
      .send({
        username,
        email: `${username}@example.com`,
        password: 'Password123!',
        displayName: username,
      });
    return {
      id: res.body.user.id as string,
      cookie: (res.headers['set-cookie'] as unknown as string[])[0],
    };
  }

  function open(cookie: string) {
    const ws = new WebSocket(wsUrl, { headers: { Origin: TRUSTED_ORIGIN, Cookie: cookie } });
    openSockets.push(ws);
    const frames: WSServerMessage[] = [];
    ws.on('message', (d) => frames.push(JSON.parse(d.toString()) as WSServerMessage));
    return {
      ws,
      frames,
      ready: new Promise<void>((resolve, reject) => {
        ws.on('open', () => resolve());
        ws.on('error', reject);
        setTimeout(() => reject(new Error('never opened')), 3000);
      }),
    };
  }

  it('CRITICAL: an outsider cannot inject a forged read receipt into a conversation', async () => {
    const alice = await makeUser('alice');
    const bob = await makeUser('bob');
    const mallory = await makeUser('mallory');

    const conversation = await request(app)
      .post('/api/conversations')
      .set('Origin', TRUSTED_ORIGIN)
      .set('Cookie', alice.cookie)
      .send({ userId: bob.id });
    const conversationId = conversation.body.conversation?.id ?? conversation.body.id;
    expect(conversationId).toBeTruthy();

    // Alice is a genuine member and subscribes to the room.
    const aliceClient = open(alice.cookie);
    await aliceClient.ready;
    await new Promise((r) => setTimeout(r, 150));
    aliceClient.ws.send(JSON.stringify({ type: 'subscribe', conversationId }));
    await new Promise((r) => setTimeout(r, 150));

    // Mallory is authenticated but is not a member. She names the conversation directly.
    const malloryClient = open(mallory.cookie);
    await malloryClient.ready;
    await new Promise((r) => setTimeout(r, 150));
    malloryClient.ws.send(
      JSON.stringify({ type: 'message.read', conversationId, messageId: 'm1' })
    );
    malloryClient.ws.send(
      JSON.stringify({ type: 'message.delivered', conversationId, messageId: 'm1' })
    );
    await new Promise((r) => setTimeout(r, 300));

    // Alice must not see a receipt attributed to a non-member.
    expect(aliceClient.frames.some((f) => f.type === 'message.read')).toBe(false);
    expect(aliceClient.frames.some((f) => f.type === 'message.delivered')).toBe(false);
    expect(mallory.id).toBeTruthy();
  });

  it('a genuine member can still send receipts', async () => {
    const alice = await makeUser('alice');
    const bob = await makeUser('bob');

    const conversation = await request(app)
      .post('/api/conversations')
      .set('Origin', TRUSTED_ORIGIN)
      .set('Cookie', alice.cookie)
      .send({ userId: bob.id });
    const conversationId = conversation.body.conversation?.id ?? conversation.body.id;

    const aliceClient = open(alice.cookie);
    const bobClient = open(bob.cookie);
    await Promise.all([aliceClient.ready, bobClient.ready]);
    await new Promise((r) => setTimeout(r, 150));

    aliceClient.ws.send(JSON.stringify({ type: 'subscribe', conversationId }));
    bobClient.ws.send(JSON.stringify({ type: 'subscribe', conversationId }));
    await new Promise((r) => setTimeout(r, 200));

    bobClient.ws.send(JSON.stringify({ type: 'message.read', conversationId, messageId: 'm1' }));
    await new Promise((r) => setTimeout(r, 300));

    expect(aliceClient.frames.some((f) => f.type === 'message.read')).toBe(true);
  });
});

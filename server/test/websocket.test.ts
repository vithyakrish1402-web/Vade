import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { WebSocket } from 'ws';
import { createApp } from '../src/app.js';
import { wsService } from '../src/services/websocket.js';
import { mockDb } from './mockDb.js';
import type { WSServerMessage } from '@enctxt/shared';

describe('Real-Time WebSocket Architecture (Phase 4)', () => {
  let server: http.Server;
  let wsUrl: string;

  let userACookie: string;
  let userAId: string;
  let userAToken: string;

  let userBCookie: string;
  let userBId: string;

  let userCCookie: string;
  let userCId: string;

  let conversationId: string;
  const activeSockets: WebSocket[] = [];

  interface TestSocketClient {
    ws: WebSocket;
    messages: WSServerMessage[];
    waitForMessage: (predicate: (msg: WSServerMessage) => boolean, timeoutMs?: number) => Promise<WSServerMessage>;
  }

  const createTestClient = async (cookie?: string): Promise<TestSocketClient> => {
    const headers: Record<string, string> = {};
    if (cookie) {
      headers['Cookie'] = cookie;
    }
    const ws = new WebSocket(wsUrl, { headers });
    activeSockets.push(ws);

    const receivedMessages: WSServerMessage[] = [];
    const pendingWaiters: Array<{
      predicate: (msg: WSServerMessage) => boolean;
      resolve: (msg: WSServerMessage) => void;
      timer: NodeJS.Timeout;
    }> = [];

    ws.on('message', (data) => {
      try {
        const parsed = JSON.parse(data.toString()) as WSServerMessage;
        receivedMessages.push(parsed);

        // Check if any waiter is satisfied
        for (let i = pendingWaiters.length - 1; i >= 0; i--) {
          const waiter = pendingWaiters[i];
          if (waiter.predicate(parsed)) {
            clearTimeout(waiter.timer);
            pendingWaiters.splice(i, 1);
            waiter.resolve(parsed);
          }
        }
      } catch {
        // ignore malformed
      }
    });

    await new Promise<void>((resolve, reject) => {
      ws.on('open', () => resolve());
      ws.on('error', (err) => reject(err));
    });

    const waitForMessage = (
      predicate: (msg: WSServerMessage) => boolean,
      timeoutMs = 3000
    ): Promise<WSServerMessage> => {
      // First check already received messages
      const existing = receivedMessages.find(predicate);
      if (existing) {
        return Promise.resolve(existing);
      }

      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          const idx = pendingWaiters.findIndex((w) => w.timer === timer);
          if (idx !== -1) pendingWaiters.splice(idx, 1);
          reject(new Error(`Timed out after ${timeoutMs}ms waiting for WebSocket message. Received so far: ${JSON.stringify(receivedMessages)}`));
        }, timeoutMs);

        pendingWaiters.push({ predicate, resolve, timer });
      });
    };

    return {
      ws,
      messages: receivedMessages,
      waitForMessage,
    };
  };

  beforeEach(async () => {
    mockDb.reset();
    wsService.reset();

    const app = createApp();
    server = http.createServer(app);
    wsService.init(server);

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const address = server.address() as AddressInfo;
        wsUrl = `ws://127.0.0.1:${address.port}/ws`;
        resolve();
      });
    });

    // Register User A
    const resA = await request(app).post('/api/auth/register').send({
      username: 'alice',
      email: 'alice@example.com',
      password: 'Password123!',
      displayName: 'Alice Wonderland',
    });
    userACookie = resA.headers['set-cookie'][0];
    userAId = resA.body.user.id;
    userAToken = userACookie.split(';')[0].split('=')[1];

    // Register User B
    const resB = await request(app).post('/api/auth/register').send({
      username: 'bob',
      email: 'bob@example.com',
      password: 'Password123!',
      displayName: 'Bob Builder',
    });
    userBCookie = resB.headers['set-cookie'][0];
    userBId = resB.body.user.id;

    // Register User C
    const resC = await request(app).post('/api/auth/register').send({
      username: 'charlie',
      email: 'charlie@example.com',
      password: 'Password123!',
      displayName: 'Charlie Chaplin',
    });
    userCCookie = resC.headers['set-cookie'][0];
    userCId = resC.body.user.id;

    // Establish conversation between Alice and Bob
    const convRes = await request(app)
      .post('/api/conversations')
      .set('Cookie', [userACookie])
      .send({ userId: userBId });
    conversationId = convRes.body.conversation.id;
  });

  afterEach(async () => {
    for (const ws of activeSockets) {
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close();
      }
    }
    activeSockets.length = 0;

    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  // ==========================================
  // WEBSOCKET HANDSHAKE & AUTHENTICATION
  // ==========================================
  it('authenticates automatically via session cookie during handshake', async () => {
    const client = await createTestClient(userACookie);
    const authMsg = await client.waitForMessage((m) => m.type === 'authenticated');

    expect(authMsg.type).toBe('authenticated');
    if (authMsg.type === 'authenticated') {
      expect(authMsg.userId).toBe(userAId);
    }
  });

  it('allows late authentication via auth message frame', async () => {
    const client = await createTestClient(); // No cookie

    // Send auth frame
    client.ws.send(JSON.stringify({ type: 'auth', token: userAToken }));
    const authMsg = await client.waitForMessage((m) => m.type === 'authenticated');

    expect(authMsg.type).toBe('authenticated');
    if (authMsg.type === 'authenticated') {
      expect(authMsg.userId).toBe(userAId);
    }
  });

  it('rejects invalid authentication token with error frame', async () => {
    const client = await createTestClient();

    client.ws.send(JSON.stringify({ type: 'auth', token: 'invalid_token' }));
    const errMsg = await client.waitForMessage((m) => m.type === 'error');

    expect(errMsg.type).toBe('error');
    if (errMsg.type === 'error') {
      expect(errMsg.code).toBe('UNAUTHORIZED');
    }
  });

  it('responds to ping with pong', async () => {
    const client = await createTestClient(userACookie);
    await client.waitForMessage((m) => m.type === 'authenticated');

    client.ws.send(JSON.stringify({ type: 'ping' }));
    const pongMsg = await client.waitForMessage((m) => m.type === 'pong');

    expect(pongMsg.type).toBe('pong');
  });

  // ==========================================
  // CONVERSATION SUBSCRIPTION & AUTHORIZATION
  // ==========================================
  it('authorizes subscription for a valid conversation member', async () => {
    const client = await createTestClient(userACookie);
    await client.waitForMessage((m) => m.type === 'authenticated');

    client.ws.send(JSON.stringify({ type: 'subscribe', conversationId }));
    const subMsg = await client.waitForMessage((m) => m.type === 'subscribed');

    expect(subMsg.type).toBe('subscribed');
    if (subMsg.type === 'subscribed') {
      expect(subMsg.conversationId).toBe(conversationId);
    }
  });

  it('strictly rejects non-member subscription with FORBIDDEN error', async () => {
    const client = await createTestClient(userCCookie); // Charlie
    await client.waitForMessage((m) => m.type === 'authenticated');

    client.ws.send(JSON.stringify({ type: 'subscribe', conversationId }));
    const errMsg = await client.waitForMessage((m) => m.type === 'error');

    expect(errMsg.type).toBe('error');
    if (errMsg.type === 'error') {
      expect(errMsg.code).toBe('FORBIDDEN');
    }
  });

  // ==========================================
  // REAL-TIME MESSAGE DELIVERY & MULTI-SESSION
  // ==========================================
  it('delivers real-time message.created event to recipient when message is sent via REST', async () => {
    // Bob connects and subscribes
    const bobClient = await createTestClient(userBCookie);
    await bobClient.waitForMessage((m) => m.type === 'authenticated');
    bobClient.ws.send(JSON.stringify({ type: 'subscribe', conversationId }));
    await bobClient.waitForMessage((m) => m.type === 'subscribed');

    // Alice sends message via REST endpoint
    const app = createApp();
    await request(app)
      .post(`/api/conversations/${conversationId}/messages`)
      .set('Cookie', [userACookie])
      .send({ content: 'Real-time greetings from Alice!' });

    // Bob receives real-time event
    const msgEvent = await bobClient.waitForMessage((m) => m.type === 'message.created');
    expect(msgEvent.type).toBe('message.created');
    if (msgEvent.type === 'message.created') {
      expect(msgEvent.message.content).toBe('Real-time greetings from Alice!');
      expect(msgEvent.message.senderId).toBe(userAId);
      expect(msgEvent.message.conversationId).toBe(conversationId);
    }
  });

  it('handles multiple active sockets for the same user (multi-tab)', async () => {
    // Bob opens Tab 1 and Tab 2
    const bobTab1 = await createTestClient(userBCookie);
    await bobTab1.waitForMessage((m) => m.type === 'authenticated');
    bobTab1.ws.send(JSON.stringify({ type: 'subscribe', conversationId }));
    await bobTab1.waitForMessage((m) => m.type === 'subscribed');

    const bobTab2 = await createTestClient(userBCookie);
    await bobTab2.waitForMessage((m) => m.type === 'authenticated');
    bobTab2.ws.send(JSON.stringify({ type: 'subscribe', conversationId }));
    await bobTab2.waitForMessage((m) => m.type === 'subscribed');

    // Alice sends message
    const app = createApp();
    await request(app)
      .post(`/api/conversations/${conversationId}/messages`)
      .set('Cookie', [userACookie])
      .send({ content: 'Multi-tab broadcast test' });

    // Both tabs should receive the event
    const event1Promise = bobTab1.waitForMessage((m) => m.type === 'message.created');
    const event2Promise = bobTab2.waitForMessage((m) => m.type === 'message.created');

    const [ev1, ev2] = await Promise.all([event1Promise, event2Promise]);
    expect((ev1 as any).message.content).toBe('Multi-tab broadcast test');
    expect((ev2 as any).message.content).toBe('Multi-tab broadcast test');
  });
});

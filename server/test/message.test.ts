import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { mockDb } from './mockDb.js';

describe('Real-Time Messaging API (Phase 4)', () => {
  const app = createApp();

  let userACookie: string[];
  let userAId: string;

  let userBCookie: string[];
  let userBId: string;

  let userCCookie: string[];
  let userCId: string;

  let conversationId: string;

  beforeEach(async () => {
    mockDb.reset();

    // Register User A (Alice)
    const resA = await request(app).post('/api/auth/register').send({
      username: 'alice',
      email: 'alice@example.com',
      password: 'Password123!',
      displayName: 'Alice Wonderland',
    });
    userACookie = resA.headers['set-cookie'] as unknown as string[];
    userAId = resA.body.user.id;

    // Register User B (Bob)
    const resB = await request(app).post('/api/auth/register').send({
      username: 'bob',
      email: 'bob@example.com',
      password: 'Password123!',
      displayName: 'Bob Builder',
    });
    userBCookie = resB.headers['set-cookie'] as unknown as string[];
    userBId = resB.body.user.id;

    // Register User C (Charlie - Non-member)
    const resC = await request(app).post('/api/auth/register').send({
      username: 'charlie',
      email: 'charlie@example.com',
      password: 'Password123!',
      displayName: 'Charlie Chaplin',
    });
    userCCookie = resC.headers['set-cookie'] as unknown as string[];
    userCId = resC.body.user.id;

    // Establish conversation between Alice and Bob
    const convRes = await request(app)
      .post('/api/conversations')
      .set('Cookie', userACookie)
      .send({ userId: userBId });
    conversationId = convRes.body.conversation.id;
  });

  // ==========================================
  // POST /api/conversations/:id/messages (SEND)
  // ==========================================
  describe('POST /api/conversations/:conversationId/messages', () => {
    it('allows a conversation member to send a text message and persists it', async () => {
      const res = await request(app)
        .post(`/api/conversations/${conversationId}/messages`)
        .set('Cookie', userACookie)
        .send({ content: 'Hello Bob! This is Alice.' });

      expect(res.status).toBe(201);
      expect(res.body.message).toBeDefined();
      expect(res.body.message.id).toBeDefined();
      expect(res.body.message.conversationId).toBe(conversationId);
      expect(res.body.message.senderId).toBe(userAId);
      expect(res.body.message.content).toBe('Hello Bob! This is Alice.');
      expect(res.body.message.status).toBe('sent');
      expect(res.body.message.createdAt).toBeDefined();

      // Verify persistence in DB
      expect(mockDb.messages.size).toBe(1);
    });

    it('handles Unicode, punctuation, and multi-byte emojis correctly', async () => {
      const emojiContent = '🔐 Hello! Private messaging with emojis: 👋🚀✨ and 日本語';
      const res = await request(app)
        .post(`/api/conversations/${conversationId}/messages`)
        .set('Cookie', userBCookie)
        .send({ content: emojiContent });

      expect(res.status).toBe(201);
      expect(res.body.message.content).toBe(emojiContent);
      expect(res.body.message.senderId).toBe(userBId);
    });

    it('strictly forbids a non-member from sending a message with 403 Forbidden', async () => {
      const res = await request(app)
        .post(`/api/conversations/${conversationId}/messages`)
        .set('Cookie', userCCookie)
        .send({ content: 'I am Charlie trying to sneak in.' });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
      expect(mockDb.messages.size).toBe(0);
    });

    it('rejects unauthenticated send requests with 401 Unauthorized', async () => {
      const res = await request(app)
        .post(`/api/conversations/${conversationId}/messages`)
        .send({ content: 'Anonymous message' });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('rejects empty message content with 422 Unprocessable / Validation Error', async () => {
      const res = await request(app)
        .post(`/api/conversations/${conversationId}/messages`)
        .set('Cookie', userACookie)
        .send({ content: '' });

      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('VALIDATION_FAILED');
    });

    it('rejects whitespace-only message content with 422 Validation Error', async () => {
      const res = await request(app)
        .post(`/api/conversations/${conversationId}/messages`)
        .set('Cookie', userACookie)
        .send({ content: '    \n\t   ' });

      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('VALIDATION_FAILED');
      expect(res.body.error.message).toContain('whitespace');
    });

    it('rejects oversized message content (> 5000 characters)', async () => {
      const hugeContent = 'a'.repeat(5001);
      const res = await request(app)
        .post(`/api/conversations/${conversationId}/messages`)
        .set('Cookie', userACookie)
        .send({ content: hugeContent });

      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('VALIDATION_FAILED');
    });

    it('returns 404 when sending to a non-existent conversation', async () => {
      const res = await request(app)
        .post('/api/conversations/00000000-0000-0000-0000-000000000000/messages')
        .set('Cookie', userACookie)
        .send({ content: 'Lost message' });

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('RESOURCE_NOT_FOUND');
    });
  });

  // ==========================================
  // GET /api/conversations/:id/messages (RETRIEVE & PAGINATE)
  // ==========================================
  describe('GET /api/conversations/:conversationId/messages', () => {
    beforeEach(async () => {
      // Alice sends message 1
      await request(app)
        .post(`/api/conversations/${conversationId}/messages`)
        .set('Cookie', userACookie)
        .send({ content: 'Msg 1 from Alice' });

      // Bob sends message 2
      await request(app)
        .post(`/api/conversations/${conversationId}/messages`)
        .set('Cookie', userBCookie)
        .send({ content: 'Msg 2 from Bob' });

      // Alice sends message 3
      await request(app)
        .post(`/api/conversations/${conversationId}/messages`)
        .set('Cookie', userACookie)
        .send({ content: 'Msg 3 from Alice' });
    });

    it('allows a conversation member to retrieve message history in chronological order', async () => {
      const res = await request(app)
        .get(`/api/conversations/${conversationId}/messages`)
        .set('Cookie', userACookie);

      expect(res.status).toBe(200);
      expect(res.body.messages).toHaveLength(3);
      expect(res.body.messages[0].content).toBe('Msg 1 from Alice');
      expect(res.body.messages[1].content).toBe('Msg 2 from Bob');
      expect(res.body.messages[2].content).toBe('Msg 3 from Alice');
      expect(res.body.hasMore).toBe(false);
    });

    it('allows Bob to retrieve the same conversation messages', async () => {
      const res = await request(app)
        .get(`/api/conversations/${conversationId}/messages`)
        .set('Cookie', userBCookie);

      expect(res.status).toBe(200);
      expect(res.body.messages).toHaveLength(3);
    });

    it('supports pagination using limit and before cursor', async () => {
      // Fetch latest 2 messages (Msg 2, Msg 3)
      const page1Res = await request(app)
        .get(`/api/conversations/${conversationId}/messages?limit=2`)
        .set('Cookie', userACookie);

      expect(page1Res.status).toBe(200);
      expect(page1Res.body.messages).toHaveLength(2);
      expect(page1Res.body.hasMore).toBe(true);
      expect(page1Res.body.nextCursor).toBeDefined();

      const oldestOnPage1 = page1Res.body.messages[0]; // Msg 2

      // Fetch older page using before cursor
      const page2Res = await request(app)
        .get(`/api/conversations/${conversationId}/messages?limit=2&before=${oldestOnPage1.id}`)
        .set('Cookie', userACookie);

      expect(page2Res.status).toBe(200);
      expect(page2Res.body.messages).toHaveLength(1);
      expect(page2Res.body.messages[0].content).toBe('Msg 1 from Alice');
      expect(page2Res.body.hasMore).toBe(false);
    });

    it('strictly forbids a non-member from viewing messages with 403 Forbidden', async () => {
      const res = await request(app)
        .get(`/api/conversations/${conversationId}/messages`)
        .set('Cookie', userCCookie);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('rejects unauthenticated retrieval with 401 Unauthorized', async () => {
      const res = await request(app).get(`/api/conversations/${conversationId}/messages`);
      expect(res.status).toBe(401);
    });
  });

  // ==========================================
  // POST /api/conversations/:id/read (READ RECEIPTS)
  // ==========================================
  describe('POST /api/conversations/:conversationId/read', () => {
    it('allows a member to mark conversation as read', async () => {
      const res = await request(app)
        .post(`/api/conversations/${conversationId}/read`)
        .set('Cookie', userBCookie)
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('rejects non-member read receipt with 403', async () => {
      const res = await request(app)
        .post(`/api/conversations/${conversationId}/read`)
        .set('Cookie', userCCookie)
        .send({});

      expect(res.status).toBe(403);
    });
  });
});

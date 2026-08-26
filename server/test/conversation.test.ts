import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { mockDb } from './mockDb.js';

describe('1-to-1 Conversation Architecture API', () => {
  const app = createApp();

  let userACookie: string[];
  let userAId: string;

  let userBCookie: string[];
  let userBId: string;

  let userCCookie: string[];
  let userCId: string;

  beforeEach(async () => {
    mockDb.reset();

    // Register User A
    const resA = await request(app).post('/api/auth/register').send({
      username: 'alice',
      email: 'alice@example.com',
      password: 'Password123!',
      displayName: 'Alice In Wonderland',
    });
    userACookie = resA.headers['set-cookie'] as unknown as string[];
    userAId = resA.body.user.id;

    // Register User B
    const resB = await request(app).post('/api/auth/register').send({
      username: 'bob',
      email: 'bob@example.com',
      password: 'Password123!',
      displayName: 'Bob The Builder',
    });
    userBCookie = resB.headers['set-cookie'] as unknown as string[];
    userBId = resB.body.user.id;

    // Register User C
    const resC = await request(app).post('/api/auth/register').send({
      username: 'charlie',
      email: 'charlie@example.com',
      password: 'Password123!',
      displayName: 'Charlie Chaplin',
    });
    userCCookie = resC.headers['set-cookie'] as unknown as string[];
    userCId = resC.body.user.id;
  });

  // ==========================================
  // CONVERSATION CREATION TESTS
  // ==========================================
  describe('POST /api/conversations', () => {
    it('creates a new 1-to-1 direct conversation with recipientId', async () => {
      const res = await request(app)
        .post('/api/conversations')
        .set('Cookie', userACookie)
        .send({ recipientId: userBId });

      expect(res.status).toBe(201);
      expect(res.body.id).toBeDefined();
      expect(res.body.type).toBe('DIRECT');
      expect(res.body.participants).toHaveLength(2);

      const participantIds = res.body.participants.map((p: any) => p.userId);
      expect(participantIds).toContain(userAId);
      expect(participantIds).toContain(userBId);

      expect(res.body.otherParticipant).toBeDefined();
      expect(res.body.otherParticipant.userId).toBe(userBId);
      expect(res.body.otherParticipant.username).toBe('bob');
    });

    it('creates a new 1-to-1 direct conversation with recipientUsername', async () => {
      const res = await request(app)
        .post('/api/conversations')
        .set('Cookie', userACookie)
        .send({ recipientUsername: 'bob' });

      expect(res.status).toBe(201);
      expect(res.body.otherParticipant.username).toBe('bob');
    });

    it('is idempotent: returns existing conversation if one already exists between the two users', async () => {
      // User A creates conversation with User B
      const firstRes = await request(app)
        .post('/api/conversations')
        .set('Cookie', userACookie)
        .send({ recipientId: userBId });

      const convId = firstRes.body.id;

      // User B attempts to create conversation with User A
      const secondRes = await request(app)
        .post('/api/conversations')
        .set('Cookie', userBCookie)
        .send({ recipientId: userAId });

      expect(secondRes.status).toBe(201);
      expect(secondRes.body.id).toBe(convId);
      expect(mockDb.conversations.size).toBe(1);
    });

    it('rejects attempt to create a conversation with oneself', async () => {
      const res = await request(app)
        .post('/api/conversations')
        .set('Cookie', userACookie)
        .send({ recipientId: userAId });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_REQUEST');
      expect(res.body.error.message).toContain('Cannot start a conversation with yourself');
    });

    it('rejects conversation creation with non-existent recipient', async () => {
      const res = await request(app)
        .post('/api/conversations')
        .set('Cookie', userACookie)
        .send({ recipientUsername: 'nonexistentuser' });

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('RESOURCE_NOT_FOUND');
    });

    it('rejects unauthenticated request with 401', async () => {
      const res = await request(app)
        .post('/api/conversations')
        .send({ recipientId: userBId });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });
  });

  // ==========================================
  // CONVERSATION LISTING TESTS
  // ==========================================
  describe('GET /api/conversations', () => {
    it('returns all conversations for the authenticated user', async () => {
      // Alice creates conversation with Bob
      await request(app)
        .post('/api/conversations')
        .set('Cookie', userACookie)
        .send({ recipientId: userBId });

      // Alice creates conversation with Charlie
      await request(app)
        .post('/api/conversations')
        .set('Cookie', userACookie)
        .send({ recipientId: userCId });

      // Bob creates conversation with Charlie
      await request(app)
        .post('/api/conversations')
        .set('Cookie', userBCookie)
        .send({ recipientId: userCId });

      // Fetch Alice's conversations (should be 2)
      const aliceRes = await request(app)
        .get('/api/conversations')
        .set('Cookie', userACookie);

      expect(aliceRes.status).toBe(200);
      expect(aliceRes.body.conversations).toHaveLength(2);
      expect(aliceRes.body.total).toBe(2);

      // Fetch Bob's conversations (should be 2: with Alice, with Charlie)
      const bobRes = await request(app)
        .get('/api/conversations')
        .set('Cookie', userBCookie);

      expect(bobRes.status).toBe(200);
      expect(bobRes.body.conversations).toHaveLength(2);
    });

    it('rejects unauthenticated listing with 401', async () => {
      const res = await request(app).get('/api/conversations');
      expect(res.status).toBe(401);
    });
  });

  // ==========================================
  // CONVERSATION DETAILS & AUTHORIZATION TESTS
  // ==========================================
  describe('GET /api/conversations/:id', () => {
    let sharedConvId: string;

    beforeEach(async () => {
      const res = await request(app)
        .post('/api/conversations')
        .set('Cookie', userACookie)
        .send({ recipientId: userBId });
      sharedConvId = res.body.id;
    });

    it('allows participant User A to access the conversation', async () => {
      const res = await request(app)
        .get(`/api/conversations/${sharedConvId}`)
        .set('Cookie', userACookie);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(sharedConvId);
      expect(res.body.otherParticipant.userId).toBe(userBId);
    });

    it('allows participant User B to access the conversation', async () => {
      const res = await request(app)
        .get(`/api/conversations/${sharedConvId}`)
        .set('Cookie', userBCookie);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(sharedConvId);
      expect(res.body.otherParticipant.userId).toBe(userAId);
    });

    it('strictly forbids non-participant User C with 403 Forbidden', async () => {
      const res = await request(app)
        .get(`/api/conversations/${sharedConvId}`)
        .set('Cookie', userCCookie);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
      expect(res.body.error.message).toContain('not authorized');
    });

    it('returns 404 for non-existent conversation ID', async () => {
      const res = await request(app)
        .get('/api/conversations/non-existent-conv-id')
        .set('Cookie', userACookie);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('RESOURCE_NOT_FOUND');
    });
  });
});

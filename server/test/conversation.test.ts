import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { mockDb } from './mockDb.js';

describe('1-to-1 Conversation Architecture API (Phase 3)', () => {
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
  // POST /api/conversations (CREATE OR GET)
  // ==========================================
  describe('POST /api/conversations', () => {
    it('successfully creates a 1-to-1 conversation with { userId } and returns safe participant', async () => {
      const res = await request(app)
        .post('/api/conversations')
        .set('Cookie', userACookie)
        .send({ userId: userBId });

      expect(res.status).toBe(201);
      expect(res.body.conversation).toBeDefined();
      expect(res.body.conversation.id).toBeDefined();
      expect(res.body.conversation.createdAt).toBeDefined();
      expect(res.body.conversation.updatedAt).toBeDefined();

      // Participant must be the other user (Bob)
      expect(res.body.conversation.participant).toBeDefined();
      expect(res.body.conversation.participant.id).toBe(userBId);
      expect(res.body.conversation.participant.username).toBe('bob');
      expect(res.body.conversation.participant.displayName).toBe('Bob The Builder');

      // Security check: no emails, passwords, hashes in response
      expect(res.body.conversation.participant.email).toBeUndefined();
      expect(res.body.conversation.participant.passwordHash).toBeUndefined();
    });

    it('is idempotent: reverse-direction User B -> User A returns the existing conversation', async () => {
      // User A creates conversation with User B
      const firstRes = await request(app)
        .post('/api/conversations')
        .set('Cookie', userACookie)
        .send({ userId: userBId });

      const convId = firstRes.body.conversation.id;

      // User B requests conversation with User A
      const secondRes = await request(app)
        .post('/api/conversations')
        .set('Cookie', userBCookie)
        .send({ userId: userAId });

      expect(secondRes.status).toBe(201);
      expect(secondRes.body.conversation.id).toBe(convId);
      // For User B, participant is User A
      expect(secondRes.body.conversation.participant.id).toBe(userAId);
      expect(secondRes.body.conversation.participant.username).toBe('alice');

      // Ensure no duplicate was stored in database
      expect(mockDb.conversations.size).toBe(1);
    });

    it('rejects self-conversation creation with 400 Bad Request', async () => {
      const res = await request(app)
        .post('/api/conversations')
        .set('Cookie', userACookie)
        .send({ userId: userAId });

      expect(res.status).toBe(400);
      expect(res.body.error).toBeDefined();
      expect(res.body.error.code).toBe('INVALID_REQUEST');
      expect(res.body.error.message).toContain('Cannot start a conversation with yourself');
    });

    it('rejects creation with non-existent target user with 404', async () => {
      const res = await request(app)
        .post('/api/conversations')
        .set('Cookie', userACookie)
        .send({ userId: '00000000-0000-0000-0000-000000000000' });

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('RESOURCE_NOT_FOUND');
    });

    it('rejects unauthenticated request with 401 Unauthorized', async () => {
      const res = await request(app)
        .post('/api/conversations')
        .send({ userId: userBId });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });
  });

  // ==========================================
  // GET /api/conversations (LIST)
  // ==========================================
  describe('GET /api/conversations', () => {
    it('returns all conversations belonging to the authenticated user with pagination', async () => {
      // Alice creates conversation with Bob
      await request(app)
        .post('/api/conversations')
        .set('Cookie', userACookie)
        .send({ userId: userBId });

      // Alice creates conversation with Charlie
      await request(app)
        .post('/api/conversations')
        .set('Cookie', userACookie)
        .send({ userId: userCId });

      // Bob creates conversation with Charlie
      await request(app)
        .post('/api/conversations')
        .set('Cookie', userBCookie)
        .send({ userId: userCId });

      // Alice lists conversations
      const aliceRes = await request(app)
        .get('/api/conversations?page=1&limit=10')
        .set('Cookie', userACookie);

      expect(aliceRes.status).toBe(200);
      expect(aliceRes.body.conversations).toHaveLength(2);
      expect(aliceRes.body.total).toBe(2);
      expect(aliceRes.body.page).toBe(1);
      expect(aliceRes.body.limit).toBe(10);

      // Verify participant shape
      const participantUsernames = aliceRes.body.conversations.map((c: any) => c.participant.username);
      expect(participantUsernames).toContain('bob');
      expect(participantUsernames).toContain('charlie');
      expect(participantUsernames).not.toContain('alice');
    });

    it('returns empty list for a user with no conversations', async () => {
      const res = await request(app)
        .get('/api/conversations')
        .set('Cookie', userCCookie);

      expect(res.status).toBe(200);
      expect(res.body.conversations).toEqual([]);
      expect(res.body.total).toBe(0);
    });

    it('rejects unauthenticated listing with 401', async () => {
      const res = await request(app).get('/api/conversations');
      expect(res.status).toBe(401);
    });
  });

  // ==========================================
  // GET /api/conversations/:id (DETAILS & AUTHORIZATION)
  // ==========================================
  describe('GET /api/conversations/:id', () => {
    let sharedConvId: string;

    beforeEach(async () => {
      const res = await request(app)
        .post('/api/conversations')
        .set('Cookie', userACookie)
        .send({ userId: userBId });
      sharedConvId = res.body.conversation.id;
    });

    it('allows participant User A to access conversation details', async () => {
      const res = await request(app)
        .get(`/api/conversations/${sharedConvId}`)
        .set('Cookie', userACookie);

      expect(res.status).toBe(200);
      expect(res.body.conversation.id).toBe(sharedConvId);
      expect(res.body.conversation.participants).toHaveLength(2);

      const ids = res.body.conversation.participants.map((p: any) => p.id);
      expect(ids).toContain(userAId);
      expect(ids).toContain(userBId);
    });

    it('allows participant User B to access conversation details', async () => {
      const res = await request(app)
        .get(`/api/conversations/${sharedConvId}`)
        .set('Cookie', userBCookie);

      expect(res.status).toBe(200);
      expect(res.body.conversation.id).toBe(sharedConvId);
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
        .get('/api/conversations/00000000-0000-0000-0000-000000000000')
        .set('Cookie', userACookie);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('RESOURCE_NOT_FOUND');
    });
  });

  // ==========================================
  // POST /api/conversations/:id/clear (CLEAR CHAT — per-user, non-destructive)
  // ==========================================
  describe('POST /api/conversations/:conversationId/clear', () => {
    let sharedConvId: string;

    beforeEach(async () => {
      const res = await request(app)
        .post('/api/conversations')
        .set('Cookie', userACookie)
        .send({ userId: userBId });
      sharedConvId = res.body.conversation.id;
    });

    it('lets a member clear their own view of the conversation', async () => {
      const res = await request(app)
        .post(`/api/conversations/${sharedConvId}/clear`)
        .set('Cookie', userACookie);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.clearedAt).toBeDefined();
    });

    it('forbids a non-member from clearing a conversation', async () => {
      const res = await request(app)
        .post(`/api/conversations/${sharedConvId}/clear`)
        .set('Cookie', userCCookie);

      expect(res.status).toBe(403);
    });

    it('returns 404 for a non-existent conversation', async () => {
      const res = await request(app)
        .post('/api/conversations/00000000-0000-0000-0000-000000000000/clear')
        .set('Cookie', userACookie);

      expect(res.status).toBe(404);
    });

    it('removes the conversation from the clearing user\'s list, but not from the other participant\'s', async () => {
      await request(app).post(`/api/conversations/${sharedConvId}/clear`).set('Cookie', userACookie);

      const aliceList = await request(app).get('/api/conversations').set('Cookie', userACookie);
      const bobList = await request(app).get('/api/conversations').set('Cookie', userBCookie);

      expect(aliceList.body.conversations.find((c: any) => c.id === sharedConvId)).toBeUndefined();
      expect(bobList.body.conversations.find((c: any) => c.id === sharedConvId)).toBeDefined();
    });

    it('brings the conversation back into the list once a new message arrives after clearing', async () => {
      await request(app).post(`/api/conversations/${sharedConvId}/clear`).set('Cookie', userACookie);

      await request(app)
        .post(`/api/conversations/${sharedConvId}/messages`)
        .set('Cookie', userBCookie)
        .send({
          envelope: {
            version: 1,
            algorithm: 'AES-256-GCM',
            keyAgreement: 'ECDH-P256',
            senderKeyId: 'k_bob',
            recipientKeyId: 'k_alice',
            nonce: 'bm9uY2U=',
            ciphertext: 'Y2lwaGVy',
          },
        });

      const aliceList = await request(app).get('/api/conversations').set('Cookie', userACookie);
      expect(aliceList.body.conversations.find((c: any) => c.id === sharedConvId)).toBeDefined();
    });

    it('hides message history up to the clear point for that user only', async () => {
      await request(app)
        .post(`/api/conversations/${sharedConvId}/messages`)
        .set('Cookie', userACookie)
        .send({
          envelope: {
            version: 1,
            algorithm: 'AES-256-GCM',
            keyAgreement: 'ECDH-P256',
            senderKeyId: 'k_alice',
            recipientKeyId: 'k_bob',
            nonce: 'bm9uY2Ux',
            ciphertext: 'YmVmb3JlX2NsZWFy',
          },
        });

      await request(app).post(`/api/conversations/${sharedConvId}/clear`).set('Cookie', userACookie);

      await request(app)
        .post(`/api/conversations/${sharedConvId}/messages`)
        .set('Cookie', userBCookie)
        .send({
          envelope: {
            version: 1,
            algorithm: 'AES-256-GCM',
            keyAgreement: 'ECDH-P256',
            senderKeyId: 'k_bob',
            recipientKeyId: 'k_alice',
            nonce: 'bm9uY2Uy',
            ciphertext: 'YWZ0ZXJfY2xlYXI=',
          },
        });

      const aliceHistory = await request(app)
        .get(`/api/conversations/${sharedConvId}/messages`)
        .set('Cookie', userACookie);
      const bobHistory = await request(app)
        .get(`/api/conversations/${sharedConvId}/messages`)
        .set('Cookie', userBCookie);

      expect(aliceHistory.body.messages).toHaveLength(1);
      expect(aliceHistory.body.messages[0].ciphertext).toBe('YWZ0ZXJfY2xlYXI=');
      // Bob never cleared — his view still has both messages.
      expect(bobHistory.body.messages).toHaveLength(2);
    });
  });
});

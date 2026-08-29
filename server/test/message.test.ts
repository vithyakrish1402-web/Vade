import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { mockDb } from './mockDb.js';

describe('Encrypted Messaging API (Phase 7 — E2EE)', () => {
  const app = createApp();

  let userACookie: string[];
  let userAId: string;

  let userBCookie: string[];
  let userBId: string;

  let userCCookie: string[];
  let userCId: string;

  let conversationId: string;

  const validEnvelope = {
    version: 1,
    algorithm: 'AES-256-GCM',
    keyAgreement: 'ECDH-P256',
    senderKeyId: 'k_alice_123',
    recipientKeyId: 'k_bob_456',
    nonce: 'dGhpcyBpcyBhIDEyLWJ5dGUgbm9uY2U=',
    ciphertext: 'Y2lwaGVydGV4dCB3aXRoIDE2LWJ5dGUgZ2NtIHRhZw==',
    aad: 'Y29udGV4dF9hYWRfc3RyaW5n',
  };

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
    it('allows a conversation member to send an encrypted message and persists ciphertext envelope', async () => {
      const res = await request(app)
        .post(`/api/conversations/${conversationId}/messages`)
        .set('Cookie', userACookie)
        .send({ envelope: validEnvelope });

      expect(res.status).toBe(201);
      expect(res.body.message).toBeDefined();
      expect(res.body.message.id).toBeDefined();
      expect(res.body.message.conversationId).toBe(conversationId);
      expect(res.body.message.senderId).toBe(userAId);
      expect(res.body.message.ciphertext).toBe(validEnvelope.ciphertext);
      expect(res.body.message.nonce).toBe(validEnvelope.nonce);
      expect(res.body.message.senderKeyId).toBe(validEnvelope.senderKeyId);
      expect(res.body.message.recipientKeyId).toBe(validEnvelope.recipientKeyId);
      expect(res.body.message.algorithm).toBe('AES-256-GCM');
      expect(res.body.message.version).toBe(1);
      expect(res.body.message.status).toBe('sent');
      expect(res.body.message.createdAt).toBeDefined();

      // Verify persistence in DB
      expect(mockDb.messages.size).toBe(1);
    });

    it('rejects legacy plaintext requests with 422 Validation Error', async () => {
      const res = await request(app)
        .post(`/api/conversations/${conversationId}/messages`)
        .set('Cookie', userACookie)
        .send({ content: 'Legacy plaintext message' });

      expect(res.status).toBe(422);
    });

    it('strictly forbids a non-member from sending a message with 403 Forbidden', async () => {
      const res = await request(app)
        .post(`/api/conversations/${conversationId}/messages`)
        .set('Cookie', userCCookie)
        .send({ envelope: validEnvelope });

      expect(res.status).toBe(403);
      expect(mockDb.messages.size).toBe(0);
    });

    it('rejects unauthenticated send requests with 401 Unauthorized', async () => {
      const res = await request(app)
        .post(`/api/conversations/${conversationId}/messages`)
        .send({ envelope: validEnvelope });

      expect(res.status).toBe(401);
    });

    it('rejects malformed or incomplete encrypted envelopes', async () => {
      const res = await request(app)
        .post(`/api/conversations/${conversationId}/messages`)
        .set('Cookie', userACookie)
        .send({
          envelope: {
            version: 1,
            ciphertext: '',
            nonce: '',
          },
        });

      expect(res.status).toBe(422);
    });

    it('rejects oversized ciphertext payloads (> 64KB)', async () => {
      const hugeCiphertext = 'A'.repeat(70000);
      const res = await request(app)
        .post(`/api/conversations/${conversationId}/messages`)
        .set('Cookie', userACookie)
        .send({
          envelope: {
            ...validEnvelope,
            ciphertext: hugeCiphertext,
          },
        });

      expect(res.status).toBe(422);
    });

    it('returns 404 when sending to a non-existent conversation', async () => {
      const res = await request(app)
        .post('/api/conversations/00000000-0000-0000-0000-000000000000/messages')
        .set('Cookie', userACookie)
        .send({ envelope: validEnvelope });

      expect(res.status).toBe(404);
    });
  });

  // ==========================================
  // GET /api/conversations/:id/messages (RETRIEVE)
  // ==========================================
  describe('GET /api/conversations/:conversationId/messages', () => {
    it('allows a conversation member to retrieve encrypted message history', async () => {
      await request(app)
        .post(`/api/conversations/${conversationId}/messages`)
        .set('Cookie', userACookie)
        .send({ envelope: { ...validEnvelope, ciphertext: 'CIPHERTEXT_1' } });

      await request(app)
        .post(`/api/conversations/${conversationId}/messages`)
        .set('Cookie', userBCookie)
        .send({ envelope: { ...validEnvelope, ciphertext: 'CIPHERTEXT_2' } });

      const res = await request(app)
        .get(`/api/conversations/${conversationId}/messages`)
        .set('Cookie', userACookie);

      expect(res.status).toBe(200);
      expect(res.body.messages).toBeDefined();
      expect(res.body.messages.length).toBe(2);
      expect(res.body.messages[0].ciphertext).toBe('CIPHERTEXT_1');
      expect(res.body.messages[1].ciphertext).toBe('CIPHERTEXT_2');
      expect(res.body.hasMore).toBe(false);
    });

    it('allows Bob to retrieve the same conversation messages', async () => {
      await request(app)
        .post(`/api/conversations/${conversationId}/messages`)
        .set('Cookie', userACookie)
        .send({ envelope: validEnvelope });

      const res = await request(app)
        .get(`/api/conversations/${conversationId}/messages`)
        .set('Cookie', userBCookie);

      expect(res.status).toBe(200);
      expect(res.body.messages.length).toBe(1);
      expect(res.body.messages[0].ciphertext).toBe(validEnvelope.ciphertext);
    });

    it('strictly forbids a non-member from viewing messages with 403 Forbidden', async () => {
      await request(app)
        .post(`/api/conversations/${conversationId}/messages`)
        .set('Cookie', userACookie)
        .send({ envelope: validEnvelope });

      const res = await request(app)
        .get(`/api/conversations/${conversationId}/messages`)
        .set('Cookie', userCCookie);

      expect(res.status).toBe(403);
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

  // ==========================================
  // DELETE /api/conversations/:id/messages/:messageId (DELETE FOR EVERYONE)
  // ==========================================
  describe('DELETE /api/conversations/:conversationId/messages/:messageId', () => {
    it('allows the sender to delete their own message, wiping ciphertext', async () => {
      const sendRes = await request(app)
        .post(`/api/conversations/${conversationId}/messages`)
        .set('Cookie', userACookie)
        .send({ envelope: validEnvelope });
      const messageId = sendRes.body.message.id;

      const res = await request(app)
        .delete(`/api/conversations/${conversationId}/messages/${messageId}`)
        .set('Cookie', userACookie);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.deletedAt).toBeDefined();

      const stored = mockDb.messages.get(messageId);
      expect(stored?.deletedAt).not.toBeNull();
      expect(stored?.ciphertext).toBe('');
      expect(stored?.nonce).toBe('');
    });

    it('forbids the recipient from deleting a message they did not send', async () => {
      const sendRes = await request(app)
        .post(`/api/conversations/${conversationId}/messages`)
        .set('Cookie', userACookie)
        .send({ envelope: validEnvelope });
      const messageId = sendRes.body.message.id;

      const res = await request(app)
        .delete(`/api/conversations/${conversationId}/messages/${messageId}`)
        .set('Cookie', userBCookie);

      expect(res.status).toBe(403);
      expect(mockDb.messages.get(messageId)?.deletedAt).toBeNull();
    });

    it('forbids a non-member from deleting a message', async () => {
      const sendRes = await request(app)
        .post(`/api/conversations/${conversationId}/messages`)
        .set('Cookie', userACookie)
        .send({ envelope: validEnvelope });
      const messageId = sendRes.body.message.id;

      const res = await request(app)
        .delete(`/api/conversations/${conversationId}/messages/${messageId}`)
        .set('Cookie', userCCookie);

      expect(res.status).toBe(403);
    });

    it('is idempotent — deleting an already-deleted message returns success without erroring', async () => {
      const sendRes = await request(app)
        .post(`/api/conversations/${conversationId}/messages`)
        .set('Cookie', userACookie)
        .send({ envelope: validEnvelope });
      const messageId = sendRes.body.message.id;

      const first = await request(app)
        .delete(`/api/conversations/${conversationId}/messages/${messageId}`)
        .set('Cookie', userACookie);
      const second = await request(app)
        .delete(`/api/conversations/${conversationId}/messages/${messageId}`)
        .set('Cookie', userACookie);

      expect(first.status).toBe(200);
      expect(second.status).toBe(200);
      expect(second.body.deletedAt).toBe(first.body.deletedAt);
    });

    it('returns 404 for a message that does not exist', async () => {
      const res = await request(app)
        .delete(`/api/conversations/${conversationId}/messages/00000000-0000-0000-0000-000000000000`)
        .set('Cookie', userACookie);

      expect(res.status).toBe(404);
    });
  });
});

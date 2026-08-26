import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { mockDb } from './mockDb.js';

describe('Public Key Infrastructure & Crypto API (Phase 7)', () => {
  const app = createApp();

  beforeEach(() => {
    mockDb.reset();
  });

  async function registerUser(username = 'alice') {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        username,
        email: `${username}@example.com`,
        password: 'Password123!',
        displayName: `${username.charAt(0).toUpperCase() + username.slice(1)} Test`,
      });
    return {
      userId: res.body.user.id,
      cookie: res.headers['set-cookie'],
    };
  }

  describe('POST /api/crypto/identity', () => {
    it('allows an authenticated user to publish their ECDH public key', async () => {
      const { cookie, userId } = await registerUser('alice');

      const res = await request(app)
        .post('/api/crypto/identity')
        .set('Cookie', cookie)
        .send({
          keyId: 'k_alice_test_key_id_1',
          publicKey: 'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE...',
          algorithm: 'ECDH-P256',
        });

      expect(res.status).toBe(200);
      expect(res.body.key).toBeDefined();
      expect(res.body.key.keyId).toBe('k_alice_test_key_id_1');
      expect(res.body.key.userId).toBe(userId);
      expect(res.body.key.publicKey).toBe('MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE...');
      expect(res.body.key.algorithm).toBe('ECDH-P256');
    });

    it('updates public key when user rotates their identity key', async () => {
      const { cookie } = await registerUser('alice');

      // First publish
      await request(app)
        .post('/api/crypto/identity')
        .set('Cookie', cookie)
        .send({
          keyId: 'k_alice_v1',
          publicKey: 'KEY_V1...',
        });

      // Rotate to new key
      const res = await request(app)
        .post('/api/crypto/identity')
        .set('Cookie', cookie)
        .send({
          keyId: 'k_alice_v2',
          publicKey: 'KEY_V2...',
        });

      expect(res.status).toBe(200);
      expect(res.body.key.keyId).toBe('k_alice_v2');
      expect(res.body.key.publicKey).toBe('KEY_V2...');
    });

    it('rejects unauthenticated key publishing with 401 Unauthorized', async () => {
      const res = await request(app)
        .post('/api/crypto/identity')
        .send({
          keyId: 'k_unauth_key',
          publicKey: 'KEY...',
        });

      expect(res.status).toBe(401);
    });

    it('rejects empty or missing keyId with 422 Validation Error', async () => {
      const { cookie } = await registerUser('alice');

      const res = await request(app)
        .post('/api/crypto/identity')
        .set('Cookie', cookie)
        .send({
          keyId: '',
          publicKey: 'KEY...',
        });

      expect(res.status).toBe(422);
    });
  });

  describe('GET /api/crypto/users/:userId/key', () => {
    it('allows an authenticated user (Bob) to retrieve Alice’s public key', async () => {
      const alice = await registerUser('alice');
      const bob = await registerUser('bob');

      // Alice publishes her key
      await request(app)
        .post('/api/crypto/identity')
        .set('Cookie', alice.cookie)
        .send({
          keyId: 'k_alice_123',
          publicKey: 'ALICE_PUBLIC_KEY_BASE64',
          algorithm: 'ECDH-P256',
        });

      // Bob retrieves Alice's key
      const res = await request(app)
        .get(`/api/crypto/users/${alice.userId}/key`)
        .set('Cookie', bob.cookie);

      expect(res.status).toBe(200);
      expect(res.body.key).toBeDefined();
      expect(res.body.key.userId).toBe(alice.userId);
      expect(res.body.key.keyId).toBe('k_alice_123');
      expect(res.body.key.publicKey).toBe('ALICE_PUBLIC_KEY_BASE64');
    });

    it('returns { key: null } for a registered user without a published key', async () => {
      const alice = await registerUser('alice');
      const bob = await registerUser('bob');

      const res = await request(app)
        .get(`/api/crypto/users/${alice.userId}/key`)
        .set('Cookie', bob.cookie);

      expect(res.status).toBe(200);
      expect(res.body.key).toBeNull();
    });

    it('rejects unauthenticated public key retrieval with 401 Unauthorized', async () => {
      const alice = await registerUser('alice');

      const res = await request(app).get(`/api/crypto/users/${alice.userId}/key`);
      expect(res.status).toBe(401);
    });
  });
});

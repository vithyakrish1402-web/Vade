import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { mockDb } from './mockDb.js';

describe('Device Identity & Session Management API (Phase 8)', () => {
  const app = createApp();

  let userACookie: string[];
  let userAId: string;

  let userBCookie: string[];
  let userBId: string;

  beforeEach(async () => {
    mockDb.reset();

    // Register User A (Alice)
    const resA = await request(app).post('/api/auth/register').send({
      username: 'alice',
      email: 'alice@example.com',
      password: 'Password123!',
      displayName: 'Alice Device Test',
    });
    userACookie = resA.headers['set-cookie'] as unknown as string[];
    userAId = resA.body.user.id;

    // Register User B (Bob)
    const resB = await request(app).post('/api/auth/register').send({
      username: 'bob',
      email: 'bob@example.com',
      password: 'Password123!',
      displayName: 'Bob Device Test',
    });
    userBCookie = resB.headers['set-cookie'] as unknown as string[];
    userBId = resB.body.user.id;
  });

  describe('POST /api/devices/register', () => {
    it('registers a new device for the authenticated user', async () => {
      const res = await request(app)
        .post('/api/devices/register')
        .set('Cookie', userACookie)
        .send({
          deviceName: 'Alice MacBook Pro',
          platform: 'macOS',
          keyId: 'k_alice_mac_123',
        });

      expect(res.status).toBe(201);
      expect(res.body.device).toBeDefined();
      expect(res.body.device.deviceName).toBe('Alice MacBook Pro');
      expect(res.body.device.platform).toBe('macOS');
      expect(res.body.device.keyId).toBe('k_alice_mac_123');
      expect(res.body.device.status).toBe('active');
      expect(res.body.device.userId).toBe(userAId);
    });

    it('rejects device registration without keyId with 422', async () => {
      const res = await request(app)
        .post('/api/devices/register')
        .set('Cookie', userACookie)
        .send({
          deviceName: 'Incomplete Device',
        });

      expect(res.status).toBe(422);
    });

    it('rejects unauthenticated registration with 401 Unauthorized', async () => {
      const res = await request(app)
        .post('/api/devices/register')
        .send({
          deviceName: 'Unauth Device',
          keyId: 'k_unauth_123',
        });

      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/devices', () => {
    it('lists only devices belonging to the requesting user', async () => {
      // Alice registers 2 devices
      await request(app)
        .post('/api/devices/register')
        .set('Cookie', userACookie)
        .send({ deviceName: 'Alice Laptop', keyId: 'k_alice_1' });

      await request(app)
        .post('/api/devices/register')
        .set('Cookie', userACookie)
        .send({ deviceName: 'Alice Phone', keyId: 'k_alice_2' });

      // Bob registers 1 device
      await request(app)
        .post('/api/devices/register')
        .set('Cookie', userBCookie)
        .send({ deviceName: 'Bob Desktop', keyId: 'k_bob_1' });

      // Alice fetches her devices
      const resA = await request(app).get('/api/devices').set('Cookie', userACookie);

      expect(resA.status).toBe(200);
      expect(resA.body.devices).toHaveLength(2);
      expect(resA.body.devices.every((d: any) => d.userId === userAId)).toBe(true);

      // Bob fetches his devices
      const resB = await request(app).get('/api/devices').set('Cookie', userBCookie);
      expect(resB.status).toBe(200);
      expect(resB.body.devices).toHaveLength(1);
      expect(resB.body.devices[0].userId).toBe(userBId);
    });
  });

  describe('POST /api/devices/:id/revoke', () => {
    it('allows a user to revoke their own device', async () => {
      const regRes = await request(app)
        .post('/api/devices/register')
        .set('Cookie', userACookie)
        .send({ deviceName: 'Alice Old Tablet', keyId: 'k_alice_tablet' });

      const deviceId = regRes.body.device.id;

      const revokeRes = await request(app)
        .post(`/api/devices/${deviceId}/revoke`)
        .set('Cookie', userACookie);

      expect(revokeRes.status).toBe(200);
      expect(revokeRes.body.success).toBe(true);
      expect(revokeRes.body.revokedDeviceId).toBe(deviceId);

      // Verify status is revoked in list
      const listRes = await request(app).get('/api/devices').set('Cookie', userACookie);
      const revoked = listRes.body.devices.find((d: any) => d.id === deviceId);
      expect(revoked.status).toBe('revoked');
    });

    it('strictly forbids a user from revoking another user’s device with 403 Forbidden', async () => {
      // Bob registers a device
      const regRes = await request(app)
        .post('/api/devices/register')
        .set('Cookie', userBCookie)
        .send({ deviceName: 'Bob Secret Laptop', keyId: 'k_bob_sec' });

      const bobDeviceId = regRes.body.device.id;

      // Alice attempts to revoke Bob's device
      const revokeRes = await request(app)
        .post(`/api/devices/${bobDeviceId}/revoke`)
        .set('Cookie', userACookie);

      expect(revokeRes.status).toBe(403);
    });
  });
});

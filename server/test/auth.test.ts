import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { mockDb } from './mockDb.js';
import { verifyPassword } from '../src/utils/crypto.js';
import { getSessionCookieOptions } from '../src/controllers/authController.js';

describe('Session cookie cross-origin configuration', () => {
  it('uses SameSite=None (with Secure) in production so the cookie survives a cross-site fetch', () => {
    // Regression test: the client (Vercel) and API (Render) are different
    // origins in production. SameSite=Lax is dropped by browsers on
    // cross-site fetch/XHR, which let login succeed while every subsequent
    // authenticated call 401'd.
    const options = getSessionCookieOptions(true);
    expect(options.sameSite).toBe('none');
    expect(options.secure).toBe(true);
  });

  it('uses SameSite=Lax without Secure outside production (plain HTTP dev server)', () => {
    // SameSite=None requires Secure=true; over plain HTTP the browser would
    // reject the cookie outright, so local dev must stay on Lax.
    const options = getSessionCookieOptions(false);
    expect(options.sameSite).toBe('lax');
    expect(options.secure).toBe(false);
  });
});

describe('Authentication & User Identity API', () => {
  const app = createApp();

  beforeEach(() => {
    mockDb.reset();
  });

  // ==========================================
  // REGISTRATION TESTS
  // ==========================================
  describe('POST /api/auth/register', () => {
    it('successfully registers a user and sets session cookie', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          username: 'alice',
          email: 'alice@example.com',
          password: 'Password123!',
          displayName: 'Alice In Wonderland',
        });

      expect(res.status).toBe(201);
      expect(res.body.authenticated).toBe(true);
      expect(res.body.user).toBeDefined();
      expect(res.body.user.username).toBe('alice');
      expect(res.body.user.displayName).toBe('Alice In Wonderland');
      expect(res.body.user.id).toBeDefined();

      // Security check: password and hash must NEVER be in response
      expect(res.body.user.password).toBeUndefined();
      expect(res.body.user.passwordHash).toBeUndefined();
      expect(res.body.password).toBeUndefined();

      // Cookie verification
      const cookies = res.headers['set-cookie'] as unknown as string[];
      expect(cookies).toBeDefined();
      expect(cookies.some((c) => c.includes('enctxt_session='))).toBe(true);
      expect(cookies.some((c) => c.includes('HttpOnly'))).toBe(true);

      // Verify password stored in DB is hashed with bcrypt
      const dbUser = Array.from(mockDb.users.values())[0];
      expect(dbUser).toBeDefined();
      expect(dbUser.passwordHash).not.toBe('Password123!');
      const matches = await verifyPassword('Password123!', dbUser.passwordHash);
      expect(matches).toBe(true);
    });

    it('rejects registration with duplicate username', async () => {
      await request(app).post('/api/auth/register').send({
        username: 'alice',
        email: 'alice1@example.com',
        password: 'Password123!',
      });

      const res = await request(app).post('/api/auth/register').send({
        username: 'ALICE', // case-insensitive check
        email: 'alice2@example.com',
        password: 'Password123!',
      });

      expect(res.status).toBe(400);
      expect(res.body.error).toBeDefined();
      expect(res.body.error.code).toBe('INVALID_REQUEST');
      expect(res.body.error.message).toContain('Username is already taken');
    });

    it('rejects registration with duplicate email', async () => {
      await request(app).post('/api/auth/register').send({
        username: 'alice1',
        email: 'alice@example.com',
        password: 'Password123!',
      });

      const res = await request(app).post('/api/auth/register').send({
        username: 'alice2',
        email: 'ALICE@EXAMPLE.COM', // case-insensitive check
        password: 'Password123!',
      });

      expect(res.status).toBe(400);
      expect(res.body.error).toBeDefined();
      expect(res.body.error.code).toBe('INVALID_REQUEST');
      expect(res.body.error.message).toContain('Email is already registered');
    });

    it('rejects registration with weak password (< 8 characters)', async () => {
      const res = await request(app).post('/api/auth/register').send({
        username: 'bob',
        email: 'bob@example.com',
        password: 'short',
      });

      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('VALIDATION_FAILED');
      expect(res.body.error.message).toContain('at least 8 characters');
    });

    it('rejects registration with invalid username characters', async () => {
      const res = await request(app).post('/api/auth/register').send({
        username: 'bob with spaces',
        email: 'bob@example.com',
        password: 'Password123!',
      });

      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('VALIDATION_FAILED');
      expect(res.body.error.message).toContain('letters, numbers, underscores');
    });

    it('rejects registration with malformed email', async () => {
      const res = await request(app).post('/api/auth/register').send({
        username: 'bob',
        email: 'not-an-email',
        password: 'Password123!',
      });

      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('VALIDATION_FAILED');
      expect(res.body.error.message).toContain('Invalid email');
    });
  });

  // ==========================================
  // LOGIN TESTS
  // ==========================================
  describe('POST /api/auth/login', () => {
    beforeEach(async () => {
      await request(app).post('/api/auth/register').send({
        username: 'charlie',
        email: 'charlie@example.com',
        password: 'SecurePassword123!',
        displayName: 'Charlie Brown',
      });
    });

    it('successfully logs in with username', async () => {
      const res = await request(app).post('/api/auth/login').send({
        identifier: 'charlie',
        password: 'SecurePassword123!',
      });

      expect(res.status).toBe(200);
      expect(res.body.authenticated).toBe(true);
      expect(res.body.user.username).toBe('charlie');
      expect(res.body.user.displayName).toBe('Charlie Brown');

      const cookies = res.headers['set-cookie'] as unknown as string[];
      expect(cookies.some((c) => c.includes('enctxt_session='))).toBe(true);
    });

    it('successfully logs in with email', async () => {
      const res = await request(app).post('/api/auth/login').send({
        identifier: 'CHARLIE@EXAMPLE.COM',
        password: 'SecurePassword123!',
      });

      expect(res.status).toBe(200);
      expect(res.body.authenticated).toBe(true);
      expect(res.body.user.username).toBe('charlie');
    });

    it('returns generic authentication error on invalid password', async () => {
      const res = await request(app).post('/api/auth/login').send({
        identifier: 'charlie',
        password: 'WrongPassword!',
      });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('AUTHENTICATION_FAILED');
      expect(res.body.error.message).toBe('Invalid username/email or password');
    });

    it('returns generic authentication error on non-existent user (no user enumeration)', async () => {
      const res = await request(app).post('/api/auth/login').send({
        identifier: 'nonexistentuser',
        password: 'SomePassword123!',
      });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('AUTHENTICATION_FAILED');
      expect(res.body.error.message).toBe('Invalid username/email or password');
    });
  });

  // ==========================================
  // SESSION & AUTHORIZATION TESTS
  // ==========================================
  describe('Session & Authorization (/api/auth/me, /api/auth/logout)', () => {
    it('returns unauthenticated when no session cookie is provided to /api/auth/me', async () => {
      const res = await request(app).get('/api/auth/me');

      expect(res.status).toBe(200);
      expect(res.body.authenticated).toBe(false);
      expect(res.body.user).toBeNull();
    });

    it('returns user identity when session cookie is provided to /api/auth/me', async () => {
      const regRes = await request(app).post('/api/auth/register').send({
        username: 'david',
        email: 'david@example.com',
        password: 'Password123!',
      });

      const cookie = regRes.headers['set-cookie'];

      const meRes = await request(app).get('/api/auth/me').set('Cookie', cookie);

      expect(meRes.status).toBe(200);
      expect(meRes.body.authenticated).toBe(true);
      expect(meRes.body.user.username).toBe('david');
    });

    it('rejects protected endpoint /api/users/me with 401 when unauthenticated', async () => {
      const res = await request(app).get('/api/users/me');

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('allows access to /api/users/me when authenticated and returns profile', async () => {
      const regRes = await request(app).post('/api/auth/register').send({
        username: 'eve',
        email: 'eve@example.com',
        password: 'Password123!',
        displayName: 'Eve Polastri',
      });

      const cookie = regRes.headers['set-cookie'];

      const profileRes = await request(app).get('/api/users/me').set('Cookie', cookie);

      expect(profileRes.status).toBe(200);
      expect(profileRes.body.username).toBe('eve');
      expect(profileRes.body.email).toBe('eve@example.com');
      expect(profileRes.body.displayName).toBe('Eve Polastri');
      expect(profileRes.body.passwordHash).toBeUndefined();
    });

    it('successfully logs out, clears cookie, and invalidates session in DB', async () => {
      const regRes = await request(app).post('/api/auth/register').send({
        username: 'frank',
        email: 'frank@example.com',
        password: 'Password123!',
      });

      const cookie = regRes.headers['set-cookie'];

      // Logout
      const logoutRes = await request(app).post('/api/auth/logout').set('Cookie', cookie);

      expect(logoutRes.status).toBe(200);
      expect(logoutRes.body.message).toContain('Logged out');

      // Check cookie was cleared
      const clearedCookies = logoutRes.headers['set-cookie'] as unknown as string[];
      expect(clearedCookies.some((c) => c.includes('enctxt_session=;'))).toBe(true);

      // Verify session was deleted from database
      expect(mockDb.sessions.size).toBe(0);

      // Subsequent call with old cookie should fail
      const failedMeRes = await request(app).get('/api/users/me').set('Cookie', cookie);
      expect(failedMeRes.status).toBe(401);
    });
  });

  // ==========================================
  // USER PROFILE UPDATE TESTS
  // ==========================================
  describe('PATCH /api/users/me', () => {
    it('updates display name successfully', async () => {
      const regRes = await request(app).post('/api/auth/register').send({
        username: 'grace',
        email: 'grace@example.com',
        password: 'Password123!',
        displayName: 'Grace Hopper',
      });

      const cookie = regRes.headers['set-cookie'];

      const updateRes = await request(app)
        .patch('/api/users/me')
        .set('Cookie', cookie)
        .send({ displayName: 'Admiral Grace Hopper' });

      expect(updateRes.status).toBe(200);
      expect(updateRes.body.displayName).toBe('Admiral Grace Hopper');
    });

    it('updates username successfully when available', async () => {
      const regRes = await request(app).post('/api/auth/register').send({
        username: 'helen_old',
        email: 'helen@example.com',
        password: 'Password123!',
      });

      const cookie = regRes.headers['set-cookie'];

      const updateRes = await request(app)
        .patch('/api/users/me')
        .set('Cookie', cookie)
        .send({ username: 'helen_new' });

      expect(updateRes.status).toBe(200);
      expect(updateRes.body.username).toBe('helen_new');
    });

    it('rejects updating username to an existing username', async () => {
      await request(app).post('/api/auth/register').send({
        username: 'user_one',
        email: 'user1@example.com',
        password: 'Password123!',
      });

      const regRes = await request(app).post('/api/auth/register').send({
        username: 'user_two',
        email: 'user2@example.com',
        password: 'Password123!',
      });

      const cookie = regRes.headers['set-cookie'];

      const updateRes = await request(app)
        .patch('/api/users/me')
        .set('Cookie', cookie)
        .send({ username: 'user_one' });

      expect(updateRes.status).toBe(400);
      expect(updateRes.body.error.message).toContain('Username is already taken');
    });
  });

  // ==========================================
  // USER SEARCH TESTS
  // ==========================================
  describe('GET /api/users/search', () => {
    it('searches users by username excluding current user', async () => {
      // Register current user
      const currentRes = await request(app).post('/api/auth/register').send({
        username: 'searcher',
        email: 'searcher@example.com',
        password: 'Password123!',
      });
      const cookie = currentRes.headers['set-cookie'];

      // Register other users
      await request(app).post('/api/auth/register').send({
        username: 'search_target_1',
        email: 'target1@example.com',
        password: 'Password123!',
        displayName: 'Target One',
      });
      await request(app).post('/api/auth/register').send({
        username: 'search_target_2',
        email: 'target2@example.com',
        password: 'Password123!',
        displayName: 'Target Two',
      });
      await request(app).post('/api/auth/register').send({
        username: 'other_user',
        email: 'other@example.com',
        password: 'Password123!',
      });

      const res = await request(app)
        .get('/api/users/search?q=target')
        .set('Cookie', cookie);

      expect(res.status).toBe(200);
      expect(res.body.users).toHaveLength(2);
      expect(res.body.total).toBe(2);
      expect(res.body.users[0].username).toBe('search_target_1');

      // Security check: search results must never contain email or sensitive data
      expect(res.body.users[0].email).toBeUndefined();
      expect(res.body.users[0].passwordHash).toBeUndefined();
    });

    it('rejects unauthenticated search requests with 401', async () => {
      const res = await request(app).get('/api/users/search?q=target');
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });
  });
});

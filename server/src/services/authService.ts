import type { RegisterInput, LoginInput, UserSummary } from '@enctxt/shared';
import crypto from 'node:crypto';
import { getPrismaClient } from './db.js';
import { hashPassword, verifyPassword, hashSessionToken } from '../utils/crypto.js';
import { signSessionToken } from '../utils/jwt.js';
import { AppError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import { config } from '../config/env.js';
import { wsService } from './websocket.js';

export interface AuthResult {
  user: UserSummary;
  token: string;
  expiresAt: Date;
}

export class AuthService {
  /**
   * Registers a new user account, creates an initial authenticated session.
   */
  static async register(input: RegisterInput): Promise<AuthResult> {
    const prisma = getPrismaClient();
    const normalizedUsername = input.username.trim().toLowerCase();
    const normalizedEmail = input.email.trim().toLowerCase();
    const displayName = input.displayName?.trim() || input.username.trim();

    // Check username uniqueness
    const existingUsername = await prisma.user.findUnique({
      where: { username: normalizedUsername },
      select: { id: true },
    });
    if (existingUsername) {
      throw AppError.badRequest('Username is already taken', { field: 'username' });
    }

    // Check email uniqueness
    const existingEmail = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true },
    });
    if (existingEmail) {
      throw AppError.badRequest('Email is already registered', { field: 'email' });
    }

    // Hash password
    const passwordHash = await hashPassword(input.password);

    // Create user in database
    const user = await prisma.user.create({
      data: {
        username: normalizedUsername,
        email: normalizedEmail,
        displayName,
        passwordHash,
      },
      select: {
        id: true,
        username: true,
        displayName: true,
      },
    });

    // Create authenticated session
    const sessionId = crypto.randomUUID();
    const token = signSessionToken(user.id, user.username, sessionId);
    const tokenHash = hashSessionToken(token);
    const expiresAt = new Date(Date.now() + config.SESSION_MAX_AGE_DAYS * 24 * 60 * 60 * 1000);

    await prisma.session.create({
      data: {
        id: sessionId,
        userId: user.id,
        tokenHash,
        expiresAt,
      },
    });

    logger.info('User registration successful', {
      event: 'registration_success',
      userId: user.id,
      username: user.username,
    });

    return {
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
      },
      token,
      expiresAt,
    };
  }

  /**
   * Authenticates user credentials and establishes a new session.
   */
  static async login(input: LoginInput): Promise<AuthResult> {
    const prisma = getPrismaClient();
    const identifier = input.identifier.trim().toLowerCase();

    // Find by username or email
    const user = await prisma.user.findFirst({
      where: {
        OR: [{ username: identifier }, { email: identifier }],
      },
      select: {
        id: true,
        username: true,
        displayName: true,
        passwordHash: true,
      },
    });

    if (!user) {
      logger.warn('Authentication failure: user not found', {
        event: 'login_failure',
      });
      // Generic authentication error to prevent user enumeration
      throw AppError.authenticationFailed('Invalid username/email or password');
    }

    // Verify password securely
    const isValid = await verifyPassword(input.password, user.passwordHash);
    if (!isValid) {
      logger.warn('Authentication failure: invalid password', {
        event: 'login_failure',
        userId: user.id,
      });
      throw AppError.authenticationFailed('Invalid username/email or password');
    }

    // Create session
    const sessionId = crypto.randomUUID();
    const token = signSessionToken(user.id, user.username, sessionId);
    const tokenHash = hashSessionToken(token);
    const expiresAt = new Date(Date.now() + config.SESSION_MAX_AGE_DAYS * 24 * 60 * 60 * 1000);

    await prisma.session.create({
      data: {
        id: sessionId,
        userId: user.id,
        tokenHash,
        expiresAt,
      },
    });

    logger.info('User login successful', {
      event: 'login_success',
      userId: user.id,
      username: user.username,
    });

    return {
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
      },
      token,
      expiresAt,
    };
  }

  /**
   * Invalidates the active session.
   */
  static async logout(sessionId?: string): Promise<void> {
    if (!sessionId) return;

    const prisma = getPrismaClient();
    try {
      await prisma.session.delete({
        where: { id: sessionId },
      });
      logger.info('User logout successful', {
        event: 'logout',
        sessionId,
      });
    } catch {
      // Session already deleted or expired
    }

    // Phase 0B — Increment 1. Deleting the session row revokes it for HTTP immediately,
    // because requireAuth re-reads it on every request. A WebSocket authenticates once at
    // connect and never re-reads, so without this the socket stayed open and kept
    // receiving the user's ciphertext after logout.
    //
    // Runs outside the try/catch above and unconditionally: whether or not the row was
    // still there, the caller's intent is that this session stops being usable, and a
    // socket left alive on an already-deleted row is exactly the case to close. Scoped to
    // this session id so the user's other devices and tabs are untouched.
    try {
      wsService.closeSession(sessionId, 'Logged out');
    } catch (error) {
      logger.warn('Failed to revoke WebSocket sockets on logout', {
        event: 'logout_ws_revocation_failed',
        error: error instanceof Error ? error.message : 'unknown',
      });
    }
  }

  /**
   * Retrieves current user summary by user ID.
   */
  static async getCurrentUser(userId: string): Promise<UserSummary | null> {
    const prisma = getPrismaClient();
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        displayName: true,
      },
    });

    return user;
  }
}

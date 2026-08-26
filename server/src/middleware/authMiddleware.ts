import type { Request, Response, NextFunction } from 'express';
import { config } from '../config/env.js';
import { verifySessionToken } from '../utils/jwt.js';
import { AppError } from '../utils/errors.js';
import { getPrismaClient } from '../services/db.js';
import { hashSessionToken } from '../utils/crypto.js';

/**
 * Extracts raw session token from Cookie or Authorization header.
 */
function extractToken(req: Request): string | null {
  if (req.cookies && req.cookies[config.SESSION_COOKIE_NAME]) {
    return req.cookies[config.SESSION_COOKIE_NAME];
  }

  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }

  return null;
}

/**
 * Middleware that strictly enforces authenticated sessions.
 */
export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const rawToken = extractToken(req);
    if (!rawToken) {
      return next(AppError.unauthorized('Authentication required'));
    }

    const payload = verifySessionToken(rawToken);
    if (!payload) {
      return next(AppError.unauthorized('Session expired or invalid'));
    }

    const prisma = getPrismaClient();

    // Verify session in database
    const tokenHash = hashSessionToken(rawToken);
    const session = await prisma.session.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!session) {
      return next(AppError.unauthorized('Session has been revoked or invalidated'));
    }

    if (session.expiresAt <= new Date()) {
      // Clean up expired session
      await prisma.session.delete({ where: { id: session.id } }).catch(() => {});
      return next(AppError.unauthorized('Session has expired'));
    }

    const user = session.user;
    req.user = {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      email: user.email,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
    };
    req.sessionId = session.id;

    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Optional authentication middleware: populates req.user if a valid session is present.
 */
export async function optionalAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const rawToken = extractToken(req);
    if (!rawToken) {
      return next();
    }

    const payload = verifySessionToken(rawToken);
    if (!payload) {
      return next();
    }

    const prisma = getPrismaClient();
    const tokenHash = hashSessionToken(rawToken);
    const session = await prisma.session.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (session && session.expiresAt > new Date()) {
      const user = session.user;
      req.user = {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        email: user.email,
        createdAt: user.createdAt.toISOString(),
        updatedAt: user.updatedAt.toISOString(),
      };
      req.sessionId = session.id;
    }

    next();
  } catch {
    next();
  }
}

import jwt from 'jsonwebtoken';
import { config } from '../config/env.js';

export interface SessionTokenPayload {
  sub: string; // User ID
  username: string;
  jti: string; // Unique session ID
}

/**
 * Signs a JWT session token with user ID and unique session identifier.
 */
export function signSessionToken(userId: string, username: string, sessionId: string): string {
  const payload: SessionTokenPayload = {
    sub: userId,
    username,
    jti: sessionId,
  };

  return jwt.sign(payload, config.JWT_SECRET, {
    expiresIn: `${config.SESSION_MAX_AGE_DAYS}d`,
    algorithm: 'HS256',
  });
}

/**
 * Verifies and decodes a JWT session token.
 */
export function verifySessionToken(token: string): SessionTokenPayload | null {
  try {
    const decoded = jwt.verify(token, config.JWT_SECRET, {
      algorithms: ['HS256'],
    }) as SessionTokenPayload;
    return decoded;
  } catch {
    return null;
  }
}

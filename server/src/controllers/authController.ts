import type { CookieOptions, Request, Response, NextFunction } from 'express';
import type { AuthResponse, CurrentUserResponse, LogoutResponse } from '@enctxt/shared';
import { registerSchema, loginSchema } from '../utils/validation.js';
import { AuthService } from '../services/authService.js';
import { AppError } from '../utils/errors.js';
import { config } from '../config/env.js';

// Exported for direct unit testing: the client (Vercel) and API (Render) are
// served from different origins in production, so the session cookie must be
// sent cross-site. SameSite=Lax blocks that on any non-navigation request
// (every fetch/XHR), which silently 401s every authenticated call after a
// successful login. SameSite=None requires Secure=true, which is already the
// case in production.
export function getSessionCookieOptions(isProduction: boolean): CookieOptions {
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'lax',
    path: '/',
  };
}

function setSessionCookie(res: Response, token: string, expiresAt: Date): void {
  res.cookie(config.SESSION_COOKIE_NAME, token, {
    ...getSessionCookieOptions(config.NODE_ENV === 'production'),
    expires: expiresAt,
  });
}

function clearSessionCookie(res: Response): void {
  res.clearCookie(config.SESSION_COOKIE_NAME, getSessionCookieOptions(config.NODE_ENV === 'production'));
}

export class AuthController {
  /**
   * POST /api/auth/register
   */
  static async register(
    req: Request,
    res: Response<AuthResponse>,
    next: NextFunction
  ): Promise<void> {
    try {
      const validation = registerSchema.safeParse(req.body);
      if (!validation.success) {
        const firstError = validation.error.issues[0];
        throw AppError.validationFailed(firstError.message, validation.error.format());
      }

      const result = await AuthService.register(validation.data);
      setSessionCookie(res, result.token, result.expiresAt);

      res.status(201).json({
        authenticated: true,
        user: result.user,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/auth/login
   */
  static async login(req: Request, res: Response<AuthResponse>, next: NextFunction): Promise<void> {
    try {
      const validation = loginSchema.safeParse(req.body);
      if (!validation.success) {
        const firstError = validation.error.issues[0];
        throw AppError.validationFailed(firstError.message, validation.error.format());
      }

      const result = await AuthService.login(validation.data);
      setSessionCookie(res, result.token, result.expiresAt);

      res.status(200).json({
        authenticated: true,
        user: result.user,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/auth/me
   */
  static async getMe(
    req: Request,
    res: Response<CurrentUserResponse>,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) {
        res.status(200).json({
          authenticated: false,
          user: null,
        });
        return;
      }

      res.status(200).json({
        authenticated: true,
        user: {
          id: req.user.id,
          username: req.user.username,
          displayName: req.user.displayName,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/auth/logout
   */
  static async logout(
    req: Request,
    res: Response<LogoutResponse>,
    next: NextFunction
  ): Promise<void> {
    try {
      if (req.sessionId) {
        await AuthService.logout(req.sessionId);
      }
      clearSessionCookie(res);

      res.status(200).json({
        message: 'Logged out successfully',
      });
    } catch (error) {
      next(error);
    }
  }
}

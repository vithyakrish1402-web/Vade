import type { Request, Response, NextFunction } from 'express';
import type { UserProfile, UserSearchResponse } from '@enctxt/shared';
import { updateProfileSchema, searchQuerySchema } from '../utils/validation.js';
import { UserService } from '../services/userService.js';
import { AppError } from '../utils/errors.js';

export class UserController {
  /**
   * GET /api/users/me
   */
  static async getProfile(
    req: Request,
    res: Response<UserProfile>,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) {
        throw AppError.unauthorized('Authentication required');
      }

      const profile = await UserService.getProfile(req.user.id);
      res.status(200).json(profile);
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /api/users/me
   */
  static async updateProfile(
    req: Request,
    res: Response<UserProfile>,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) {
        throw AppError.unauthorized('Authentication required');
      }

      const validation = updateProfileSchema.safeParse(req.body);
      if (!validation.success) {
        const firstError = validation.error.issues[0];
        throw AppError.validationFailed(firstError.message, validation.error.format());
      }

      const updatedProfile = await UserService.updateProfile(req.user.id, validation.data);
      res.status(200).json(updatedProfile);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/users/search?q=...&page=...&limit=...
   */
  static async searchUsers(
    req: Request,
    res: Response<UserSearchResponse>,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) {
        throw AppError.unauthorized('Authentication required');
      }

      const validation = searchQuerySchema.safeParse(req.query);
      if (!validation.success) {
        const firstError = validation.error.issues[0];
        throw AppError.validationFailed(firstError.message, validation.error.format());
      }

      const { q, page, limit } = validation.data;
      const result = await UserService.searchUsers(q, req.user.id, page, limit);

      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }
}

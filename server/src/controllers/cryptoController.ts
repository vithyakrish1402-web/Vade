import type { Request, Response, NextFunction } from 'express';
import { cryptoService } from '../services/cryptoService.js';
import { publishKeySchema } from '../utils/validation.js';
import { AppError } from '../utils/errors.js';

export class CryptoController {
  /**
   * POST /api/crypto/identity
   * Publish or update the authenticated user's public key.
   */
  async publishIdentityKey(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw AppError.unauthorized('Authentication required');
      }

      const validation = publishKeySchema.safeParse(req.body);
      if (!validation.success) {
        const firstError = validation.error.issues[0];
        throw AppError.validationFailed(firstError.message, validation.error.format());
      }

      const key = await cryptoService.publishPublicKey(req.user.id, validation.data);

      res.status(200).json({ key });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/crypto/users/:userId/key
   * Retrieve the active public key of a user.
   */
  async getUserPublicKey(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { userId } = req.params;
      const key = await cryptoService.getPublicKeyByUserId(userId);

      res.status(200).json({ key });
    } catch (error) {
      next(error);
    }
  }
}

export const cryptoController = new CryptoController();

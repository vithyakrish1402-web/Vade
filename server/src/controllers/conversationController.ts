import type { Request, Response, NextFunction } from 'express';
import type { ConversationSummary, ConversationListResponse } from '@enctxt/shared';
import { createConversationSchema } from '../utils/validation.js';
import { ConversationService } from '../services/conversationService.js';
import { AppError } from '../utils/errors.js';

export class ConversationController {
  /**
   * POST /api/conversations
   */
  static async createConversation(
    req: Request,
    res: Response<ConversationSummary>,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) {
        throw AppError.unauthorized('Authentication required');
      }

      const validation = createConversationSchema.safeParse(req.body);
      if (!validation.success) {
        const firstError = validation.error.issues[0];
        throw AppError.validationFailed(firstError.message, validation.error.format());
      }

      const conversation = await ConversationService.getOrCreateDirectConversation(
        req.user.id,
        validation.data
      );

      res.status(201).json(conversation);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/conversations
   */
  static async listConversations(
    req: Request,
    res: Response<ConversationListResponse>,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) {
        throw AppError.unauthorized('Authentication required');
      }

      const response = await ConversationService.listUserConversations(req.user.id);
      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/conversations/:id
   */
  static async getConversation(
    req: Request,
    res: Response<ConversationSummary>,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) {
        throw AppError.unauthorized('Authentication required');
      }

      const conversationId = req.params.id;
      if (!conversationId) {
        throw AppError.badRequest('Conversation ID is required');
      }

      const conversation = await ConversationService.getConversationById(
        conversationId,
        req.user.id
      );

      res.status(200).json(conversation);
    } catch (error) {
      next(error);
    }
  }
}

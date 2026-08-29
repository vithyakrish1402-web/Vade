import type { Request, Response, NextFunction } from 'express';
import type {
  CreateConversationResponse,
  ConversationListResponse,
  ConversationDetailResponse,
  ClearConversationResponse,
} from '@enctxt/shared';
import { createConversationSchema, conversationListQuerySchema } from '../utils/validation.js';
import { ConversationService } from '../services/conversationService.js';
import { AppError } from '../utils/errors.js';

export class ConversationController {
  /**
   * POST /api/conversations
   */
  static async createConversation(
    req: Request,
    res: Response<CreateConversationResponse>,
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

      const conversation = await ConversationService.createOrGetConversation(
        req.user.id,
        validation.data
      );

      res.status(201).json({
        conversation,
      });
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

      const queryValidation = conversationListQuerySchema.safeParse(req.query);
      const page = queryValidation.success ? queryValidation.data.page : 1;
      const limit = queryValidation.success ? queryValidation.data.limit : 20;

      const response = await ConversationService.listConversations(req.user.id, page, limit);
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
    res: Response<ConversationDetailResponse>,
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

      const conversation = await ConversationService.getConversation(
        conversationId,
        req.user.id
      );

      res.status(200).json({
        conversation,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/conversations/:conversationId/clear
   */
  static async clearConversation(
    req: Request,
    res: Response<ClearConversationResponse>,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) {
        throw AppError.unauthorized('Authentication required');
      }

      const conversationId = req.params.conversationId;
      if (!conversationId) {
        throw AppError.badRequest('Conversation ID is required');
      }

      const response = await ConversationService.clearConversation(conversationId, req.user.id);
      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  }
}

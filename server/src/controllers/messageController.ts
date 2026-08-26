import type { Request, Response, NextFunction } from 'express';
import type { SendMessageResponse, MessageListResponse } from '@enctxt/shared';
import { sendMessageSchema, messagePaginationSchema } from '../utils/validation.js';
import { MessageService } from '../services/messageService.js';
import { AppError } from '../utils/errors.js';

export class MessageController {
  /**
   * POST /api/conversations/:conversationId/messages
   */
  static async sendMessage(
    req: Request,
    res: Response<SendMessageResponse>,
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

      const validation = sendMessageSchema.safeParse(req.body);
      if (!validation.success) {
        const firstError = validation.error.issues[0];
        throw AppError.validationFailed(firstError.message, validation.error.format());
      }

      const response = await MessageService.sendMessage(
        conversationId,
        req.user.id,
        validation.data
      );

      res.status(201).json(response);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/conversations/:conversationId/messages
   */
  static async getMessages(
    req: Request,
    res: Response<MessageListResponse>,
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

      const queryValidation = messagePaginationSchema.safeParse(req.query);
      const limit = queryValidation.success ? queryValidation.data.limit : 50;
      const before = queryValidation.success ? queryValidation.data.before : undefined;

      const response = await MessageService.getMessages(
        conversationId,
        req.user.id,
        limit,
        before
      );

      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/conversations/:conversationId/read
   */
  static async markRead(
    req: Request,
    res: Response<{ success: boolean }>,
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

      const messageId = req.body?.messageId;
      const response = await MessageService.markConversationRead(
        conversationId,
        req.user.id,
        messageId
      );

      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  }
}

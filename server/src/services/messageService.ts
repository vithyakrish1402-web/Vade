import type {
  MessageItem,
  SendMessageInput,
  SendMessageResponse,
  MessageListResponse,
} from '@enctxt/shared';
import { getPrismaClient } from './db.js';
import { AppError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import { wsService } from './websocket.js';

export class MessageService {
  /**
   * Sends and persists a message to PostgreSQL and notifies real-time WebSocket listeners.
   */
  static async sendMessage(
    conversationId: string,
    senderId: string,
    input: SendMessageInput
  ): Promise<SendMessageResponse> {
    const prisma = getPrismaClient();

    // 1. Verify conversation existence and sender membership
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        members: {
          select: { userId: true },
        },
      },
    });

    if (!conversation) {
      throw AppError.notFound('Conversation not found');
    }

    const isMember = conversation.members.some((m) => m.userId === senderId);
    if (!isMember) {
      throw AppError.forbidden('You are not authorized to send messages in this conversation');
    }

    // 2. Validate message content
    const content = input.content;
    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      throw AppError.badRequest('Message content cannot be empty or whitespace only');
    }
    if (content.length > 5000) {
      throw AppError.badRequest('Message content exceeds maximum allowed length of 5000 characters');
    }

    const now = new Date();

    // 3. Persist message to database
    const createdMessage = await prisma.message.create({
      data: {
        conversationId,
        senderId,
        content,
        createdAt: now,
        updatedAt: now,
      },
    });

    // 4. Update conversation updatedAt timestamp
    await prisma.conversation.update({
      where: { id: conversationId },
      data: { updatedAt: now },
    });

    // Note: NEVER log message.content for privacy preservation!
    logger.info('Message persisted', {
      event: 'message_created',
      messageId: createdMessage.id,
      conversationId,
      senderId,
    });

    const messageItem: MessageItem = {
      id: createdMessage.id,
      conversationId: createdMessage.conversationId,
      senderId: createdMessage.senderId,
      content: createdMessage.content,
      status: 'sent',
      createdAt: createdMessage.createdAt.toISOString(),
      updatedAt: createdMessage.updatedAt.toISOString(),
    };

    // 5. Broadcast real-time event to conversation subscribers & active user sockets
    const memberIds = conversation.members.map((m) => m.userId);
    wsService.sendToMembers(memberIds, {
      type: 'message.created',
      message: messageItem,
      tempId: input.tempId,
    });

    wsService.broadcastToConversation(conversationId, {
      type: 'message.created',
      message: messageItem,
      tempId: input.tempId,
    });

    return {
      message: messageItem,
      tempId: input.tempId,
    };
  }

  /**
   * Retrieves message history for a conversation with cursor-based pagination.
   */
  static async getMessages(
    conversationId: string,
    userId: string,
    limit = 50,
    beforeCursor?: string
  ): Promise<MessageListResponse> {
    const prisma = getPrismaClient();

    // 1. Verify conversation existence and membership
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        members: {
          select: { userId: true },
        },
      },
    });

    if (!conversation) {
      throw AppError.notFound('Conversation not found');
    }

    const isMember = conversation.members.some((m) => m.userId === userId);
    if (!isMember) {
      throw AppError.forbidden('You are not authorized to view messages in this conversation');
    }

    // 2. Build where filter for cursor pagination
    let whereFilter: any = {
      conversationId,
    };

    if (beforeCursor) {
      // Find cursor message to get its creation date
      const cursorMessage = await prisma.message.findUnique({
        where: { id: beforeCursor },
        select: { createdAt: true },
      });

      if (cursorMessage) {
        whereFilter = {
          conversationId,
          createdAt: {
            lt: cursorMessage.createdAt,
          },
        };
      }
    }

    // Fetch limit + 1 to detect if older messages exist
    const rawMessages = await prisma.message.findMany({
      where: whereFilter,
      orderBy: [
        { createdAt: 'desc' },
        { id: 'desc' },
      ],
      take: limit + 1,
    });

    const hasMore = rawMessages.length > limit;
    const pageMessages = hasMore ? rawMessages.slice(0, limit) : rawMessages;

    // Next cursor is the ID of the oldest message on this page
    const nextCursor = pageMessages.length > 0 ? pageMessages[pageMessages.length - 1].id : undefined;

    // Reverse to return messages in ascending chronological order for chat UI
    const chronologicalMessages = [...pageMessages].reverse().map((m) => ({
      id: m.id,
      conversationId: m.conversationId,
      senderId: m.senderId,
      content: m.content,
      status: 'sent' as const,
      createdAt: m.createdAt.toISOString(),
      updatedAt: m.updatedAt.toISOString(),
    }));

    return {
      messages: chronologicalMessages,
      hasMore,
      nextCursor,
    };
  }

  /**
   * Marks conversation messages as read and emits WebSocket read receipt.
   */
  static async markConversationRead(
    conversationId: string,
    userId: string,
    messageId?: string
  ): Promise<{ success: boolean }> {
    const prisma = getPrismaClient();

    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        members: {
          select: { userId: true },
        },
      },
    });

    if (!conversation) {
      throw AppError.notFound('Conversation not found');
    }

    const isMember = conversation.members.some((m) => m.userId === userId);
    if (!isMember) {
      throw AppError.forbidden('You are not authorized for this conversation');
    }

    const memberIds = conversation.members.map((m) => m.userId);
    const readEvent = {
      type: 'message.read' as const,
      conversationId,
      messageId,
      readAt: new Date().toISOString(),
      readBy: userId,
    };

    wsService.sendToMembers(memberIds, readEvent);
    wsService.broadcastToConversation(conversationId, readEvent);

    return { success: true };
  }
}

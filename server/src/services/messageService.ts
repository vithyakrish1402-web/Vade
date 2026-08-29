import type {
  MessageItem,
  SendMessageInput,
  SendMessageResponse,
  MessageListResponse,
  DeleteMessageResponse,
} from '@enctxt/shared';
import { getPrismaClient } from './db.js';
import { AppError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import { wsService } from './websocket.js';

export class MessageService {
  /**
   * Persists an encrypted message envelope to PostgreSQL and notifies real-time WebSocket listeners.
   * Server NEVER inspects or decrypts message content.
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

    // 2. Validate encrypted envelope structure
    const env = input.envelope;
    if (!env || !env.ciphertext || !env.nonce || !env.senderKeyId || !env.recipientKeyId) {
      throw AppError.badRequest('Invalid or incomplete encrypted message envelope');
    }

    if (env.ciphertext.length > 65536) {
      throw AppError.badRequest('Ciphertext exceeds maximum payload size of 64KB');
    }

    const now = new Date();

    // 3. Persist encrypted envelope to database
    const createdMessage = await prisma.message.create({
      data: {
        conversationId,
        senderId,
        ciphertext: env.ciphertext,
        nonce: env.nonce,
        senderKeyId: env.senderKeyId,
        recipientKeyId: env.recipientKeyId,
        algorithm: env.algorithm || 'AES-256-GCM',
        version: env.version ?? 1,
        aad: env.aad || null,
        createdAt: now,
        updatedAt: now,
      },
    });

    // 4. Update conversation updatedAt timestamp
    await prisma.conversation.update({
      where: { id: conversationId },
      data: { updatedAt: now },
    });

    // Log event without ciphertext or key material
    logger.info('Encrypted message persisted', {
      event: 'message_created',
      messageId: createdMessage.id,
      conversationId,
      senderId,
      version: createdMessage.version,
    });

    const messageItem: MessageItem = {
      id: createdMessage.id,
      conversationId: createdMessage.conversationId,
      senderId: createdMessage.senderId,
      ciphertext: createdMessage.ciphertext,
      nonce: createdMessage.nonce,
      senderKeyId: createdMessage.senderKeyId,
      recipientKeyId: createdMessage.recipientKeyId,
      algorithm: createdMessage.algorithm,
      version: createdMessage.version,
      aad: createdMessage.aad,
      status: 'sent',
      createdAt: createdMessage.createdAt.toISOString(),
      updatedAt: createdMessage.updatedAt.toISOString(),
      deletedAt: null,
    };

    // 5. Broadcast real-time encrypted event to conversation subscribers & user sockets
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
    };
  }

  /**
   * Retrieves encrypted message history for a conversation with cursor-based pagination.
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
          select: { userId: true, clearedAt: true },
        },
      },
    });

    if (!conversation) {
      throw AppError.notFound('Conversation not found');
    }

    const myMembership = conversation.members.find((m) => m.userId === userId);
    if (!myMembership) {
      throw AppError.forbidden('You are not authorized to view messages in this conversation');
    }

    // 2. Build where filter for cursor pagination — messages at or before this member's own
    // clearedAt are hidden from their history (the other participant is unaffected).
    let whereFilter: any = {
      conversationId,
      ...(myMembership.clearedAt ? { createdAt: { gt: myMembership.clearedAt } } : {}),
    };

    if (beforeCursor) {
      const cursorMessage = await prisma.message.findUnique({
        where: { id: beforeCursor },
        select: { createdAt: true },
      });

      if (cursorMessage) {
        whereFilter = {
          conversationId,
          createdAt: {
            lt: cursorMessage.createdAt,
            ...(myMembership.clearedAt ? { gt: myMembership.clearedAt } : {}),
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
    const chronologicalMessages: MessageItem[] = [...pageMessages].reverse().map((m) => ({
      id: m.id,
      conversationId: m.conversationId,
      senderId: m.senderId,
      ciphertext: m.ciphertext,
      nonce: m.nonce,
      senderKeyId: m.senderKeyId,
      recipientKeyId: m.recipientKeyId,
      algorithm: m.algorithm,
      version: m.version,
      aad: m.aad,
      status: 'sent',
      createdAt: m.createdAt.toISOString(),
      updatedAt: m.updatedAt.toISOString(),
      deletedAt: m.deletedAt ? m.deletedAt.toISOString() : null,
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

  /**
   * Deletes a message for everyone. Sender-only: a recipient cannot delete-for-everyone a
   * message they didn't write, since that would let anyone erase the other side's copy.
   * Ciphertext and nonce are wiped from the row — this removes the content, not just a flag.
   */
  static async deleteMessage(
    conversationId: string,
    messageId: string,
    userId: string
  ): Promise<DeleteMessageResponse> {
    const prisma = getPrismaClient();

    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        members: { select: { userId: true } },
      },
    });

    if (!conversation) {
      throw AppError.notFound('Conversation not found');
    }

    const isMember = conversation.members.some((m) => m.userId === userId);
    if (!isMember) {
      throw AppError.forbidden('You are not authorized for this conversation');
    }

    const message = await prisma.message.findUnique({ where: { id: messageId } });
    if (!message || message.conversationId !== conversationId) {
      throw AppError.notFound('Message not found');
    }

    if (message.senderId !== userId) {
      throw AppError.forbidden('Only the sender can delete this message for everyone');
    }

    // Idempotent: re-deleting an already-deleted message just returns its original deletedAt
    // rather than erroring or bumping the timestamp again.
    const deletedAt = message.deletedAt ?? new Date();

    if (!message.deletedAt) {
      await prisma.message.update({
        where: { id: messageId },
        data: {
          deletedAt,
          ciphertext: '',
          nonce: '',
          aad: null,
        },
      });
    }

    logger.info('Message deleted for everyone', {
      event: 'message_deleted',
      messageId,
      conversationId,
      deletedBy: userId,
    });

    const deleteEvent = {
      type: 'message.deleted' as const,
      conversationId,
      messageId,
      deletedAt: deletedAt.toISOString(),
      deletedBy: userId,
    };

    const memberIds = conversation.members.map((m) => m.userId);
    wsService.sendToMembers(memberIds, deleteEvent);
    wsService.broadcastToConversation(conversationId, deleteEvent);

    return { success: true, deletedAt: deletedAt.toISOString() };
  }
}

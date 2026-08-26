import type {
  ConversationSummary,
  ConversationParticipantSummary,
  CreateDirectConversationInput,
  ConversationListResponse,
} from '@enctxt/shared';
import { getPrismaClient } from './db.js';
import { AppError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

export function formatConversation(
  conversation: {
    id: string;
    type: string;
    createdAt: Date;
    updatedAt: Date;
    participants: Array<{
      userId: string;
      joinedAt: Date;
      user: {
        id: string;
        username: string;
        displayName: string;
      };
    }>;
  },
  currentUserId: string
): ConversationSummary {
  const participants: ConversationParticipantSummary[] = conversation.participants.map((p) => ({
    userId: p.user.id,
    username: p.user.username,
    displayName: p.user.displayName,
    joinedAt: p.joinedAt.toISOString(),
  }));

  const otherParticipant = participants.find((p) => p.userId !== currentUserId);

  return {
    id: conversation.id,
    type: conversation.type as 'DIRECT' | 'GROUP',
    participants,
    otherParticipant,
    createdAt: conversation.createdAt.toISOString(),
    updatedAt: conversation.updatedAt.toISOString(),
  };
}

export class ConversationService {
  /**
   * Retrieves an existing 1-to-1 conversation or creates a new one idempotently.
   */
  static async getOrCreateDirectConversation(
    currentUserId: string,
    input: CreateDirectConversationInput
  ): Promise<ConversationSummary> {
    const prisma = getPrismaClient();

    // 1. Resolve recipient
    let recipient: { id: string; username: string; displayName: string } | null = null;

    if (input.recipientId) {
      recipient = await prisma.user.findUnique({
        where: { id: input.recipientId },
        select: { id: true, username: true, displayName: true },
      });
    } else if (input.recipientUsername) {
      recipient = await prisma.user.findUnique({
        where: { username: input.recipientUsername.toLowerCase() },
        select: { id: true, username: true, displayName: true },
      });
    }

    if (!recipient) {
      throw AppError.notFound('Recipient user not found');
    }

    if (recipient.id === currentUserId) {
      throw AppError.badRequest('Cannot start a conversation with yourself');
    }

    // 2. Deterministic 1-to-1 direct key
    const directKey = [currentUserId, recipient.id].sort().join(':');

    // 3. Check for existing conversation
    const existing = await prisma.conversation.findUnique({
      where: { directKey },
      include: {
        participants: {
          include: {
            user: {
              select: { id: true, username: true, displayName: true },
            },
          },
        },
      },
    });

    if (existing) {
      return formatConversation(existing, currentUserId);
    }

    // 4. Create new conversation with participants
    const newConversation = await prisma.conversation.create({
      data: {
        type: 'DIRECT',
        directKey,
        participants: {
          create: [
            { userId: currentUserId },
            { userId: recipient.id },
          ],
        },
      },
      include: {
        participants: {
          include: {
            user: {
              select: { id: true, username: true, displayName: true },
            },
          },
        },
      },
    });

    logger.info('1-to-1 direct conversation created', {
      event: 'conversation_created',
      conversationId: newConversation.id,
      participants: [currentUserId, recipient.id],
    });

    return formatConversation(newConversation, currentUserId);
  }

  /**
   * Lists all conversations for the authenticated user.
   */
  static async listUserConversations(currentUserId: string): Promise<ConversationListResponse> {
    const prisma = getPrismaClient();

    const conversations = await prisma.conversation.findMany({
      where: {
        participants: {
          some: {
            userId: currentUserId,
          },
        },
      },
      include: {
        participants: {
          include: {
            user: {
              select: { id: true, username: true, displayName: true },
            },
          },
        },
      },
      orderBy: {
        updatedAt: 'desc',
      },
    });

    const formatted = conversations.map((c) => formatConversation(c, currentUserId));

    return {
      conversations: formatted,
      total: formatted.length,
    };
  }

  /**
   * Retrieves a single conversation by ID with strict participant authorization.
   */
  static async getConversationById(
    conversationId: string,
    currentUserId: string
  ): Promise<ConversationSummary> {
    const prisma = getPrismaClient();

    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        participants: {
          include: {
            user: {
              select: { id: true, username: true, displayName: true },
            },
          },
        },
      },
    });

    if (!conversation) {
      throw AppError.notFound('Conversation not found');
    }

    // Strict participant authorization
    const isParticipant = conversation.participants.some((p) => p.userId === currentUserId);
    if (!isParticipant) {
      throw AppError.forbidden('You are not authorized to access this conversation');
    }

    return formatConversation(conversation, currentUserId);
  }
}

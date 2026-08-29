import type {
  SingleConversationItem,
  ConversationDetails,
  CreateConversationInput,
  ConversationListResponse,
  ClearConversationResponse,
  ParticipantSummary,
} from '@enctxt/shared';
import { getPrismaClient } from './db.js';
import { AppError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import { wsService } from './websocket.js';

export class ConversationService {
  /**
   * Reusable membership verification helper.
   */
  static async verifyMembership(
    conversationId: string,
    userId: string
  ): Promise<{ isMember: boolean; conversationExists: boolean }> {
    const prisma = getPrismaClient();
    const member = await prisma.conversationMember.findUnique({
      where: {
        conversationId_userId: {
          conversationId,
          userId,
        },
      },
    });

    if (member) {
      return { isMember: true, conversationExists: true };
    }

    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { id: true },
    });

    return {
      isMember: false,
      conversationExists: !!conversation,
    };
  }

  /**
   * Creates a 1-to-1 conversation or retrieves the existing one (idempotent).
   */
  static async createOrGetConversation(
    authenticatedUserId: string,
    input: CreateConversationInput
  ): Promise<SingleConversationItem> {
    const prisma = getPrismaClient();

    // 1. Resolve target user
    let targetUser: { id: string; username: string; displayName: string } | null = null;
    const targetUserId = input.userId || input.recipientId;

    if (targetUserId) {
      targetUser = await prisma.user.findUnique({
        where: { id: targetUserId },
        select: { id: true, username: true, displayName: true },
      });
    } else if (input.recipientUsername) {
      targetUser = await prisma.user.findUnique({
        where: { username: input.recipientUsername.toLowerCase() },
        select: { id: true, username: true, displayName: true },
      });
    }

    if (!targetUser) {
      throw AppError.notFound('Target user not found');
    }

    // 2. Prevent self-conversations
    if (targetUser.id === authenticatedUserId) {
      throw AppError.badRequest('Cannot start a conversation with yourself');
    }

    // 3. Compute deterministic sorted direct key to prevent duplicates and race conditions
    const directKey = [authenticatedUserId, targetUser.id].sort().join(':');

    // 4. Find existing conversation
    const existing = await prisma.conversation.findUnique({
      where: { directKey },
      include: {
        members: {
          include: {
            user: {
              select: { id: true, username: true, displayName: true },
            },
          },
        },
      },
    });

    if (existing) {
      const otherMember = existing.members.find((m) => m.userId !== authenticatedUserId);
      const participant: ParticipantSummary = otherMember
        ? {
            id: otherMember.user.id,
            username: otherMember.user.username,
            displayName: otherMember.user.displayName,
          }
        : {
            id: targetUser.id,
            username: targetUser.username,
            displayName: targetUser.displayName,
          };

      return {
        id: existing.id,
        createdAt: existing.createdAt.toISOString(),
        updatedAt: existing.updatedAt.toISOString(),
        participant,
      };
    }

    // 5. Create new 1-to-1 conversation with exactly 2 members
    const newConversation = await prisma.conversation.create({
      data: {
        directKey,
        members: {
          create: [
            { userId: authenticatedUserId },
            { userId: targetUser.id },
          ],
        },
      },
      include: {
        members: {
          include: {
            user: {
              select: { id: true, username: true, displayName: true },
            },
          },
        },
      },
    });

    logger.info('1-to-1 conversation created', {
      event: 'conversation_created',
      conversationId: newConversation.id,
      participants: [authenticatedUserId, targetUser.id],
    });

    const otherMember = newConversation.members.find((m) => m.userId !== authenticatedUserId);
    const participant: ParticipantSummary = otherMember
      ? {
          id: otherMember.user.id,
          username: otherMember.user.username,
          displayName: otherMember.user.displayName,
        }
      : {
          id: targetUser.id,
          username: targetUser.username,
          displayName: targetUser.displayName,
        };

    return {
      id: newConversation.id,
      createdAt: newConversation.createdAt.toISOString(),
      updatedAt: newConversation.updatedAt.toISOString(),
      participant,
    };
  }

  /**
   * Lists conversations for the authenticated user with pagination and latest activity sorting.
   */
  static async listConversations(
    authenticatedUserId: string,
    page = 1,
    limit = 20
  ): Promise<ConversationListResponse> {
    const prisma = getPrismaClient();

    const whereClause = {
      members: {
        some: {
          userId: authenticatedUserId,
        },
      },
    };

    // Filtering on "has there been activity since I cleared this?" compares two columns from
    // different tables (this member's clearedAt vs. the conversation's updatedAt), which isn't
    // expressible in a single Prisma where clause — so it's applied in application code below,
    // after fetching every conversation this user belongs to. Fine at this app's scale; would
    // need a raw query if conversation counts ever grew large enough for that to matter.
    const allConversations = await prisma.conversation.findMany({
      where: whereClause,
      include: {
        members: {
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

    const visible = allConversations.filter((conv) => {
      const myMembership = conv.members.find((m) => m.userId === authenticatedUserId);
      if (!myMembership?.clearedAt) return true;
      return conv.updatedAt > myMembership.clearedAt;
    });

    const total = visible.length;
    const skip = (page - 1) * limit;
    const pageSlice = visible.slice(skip, skip + limit);

    const formatted: SingleConversationItem[] = pageSlice.map((conv) => {
      const otherMember = conv.members.find((m) => m.userId !== authenticatedUserId);
      const participant: ParticipantSummary = otherMember?.user
        ? {
            id: otherMember.user.id,
            username: otherMember.user.username,
            displayName: otherMember.user.displayName,
          }
        : {
            id: 'unknown',
            username: 'unknown',
            displayName: 'Unknown User',
          };

      return {
        id: conv.id,
        createdAt: conv.createdAt.toISOString(),
        updatedAt: conv.updatedAt.toISOString(),
        participant,
      };
    });

    return {
      conversations: formatted,
      total,
      page,
      limit,
    };
  }

  /**
   * Clears this conversation from the caller's own view: hides its message history and list
   * entry up to now, without touching the other participant's copy. A later message pushes
   * the conversation's updatedAt past this timestamp, bringing it back into view.
   */
  static async clearConversation(
    conversationId: string,
    userId: string
  ): Promise<ClearConversationResponse> {
    const prisma = getPrismaClient();

    const membership = await prisma.conversationMember.findUnique({
      where: {
        conversationId_userId: { conversationId, userId },
      },
    });

    if (!membership) {
      const conversation = await prisma.conversation.findUnique({
        where: { id: conversationId },
        select: { id: true },
      });
      if (!conversation) {
        throw AppError.notFound('Conversation not found');
      }
      throw AppError.forbidden('You are not authorized for this conversation');
    }

    const clearedAt = new Date();
    await prisma.conversationMember.update({
      where: { id: membership.id },
      data: { clearedAt },
    });

    logger.info('Conversation cleared', {
      event: 'conversation_cleared',
      conversationId,
      userId,
    });

    // Per-user only — this must never reach the other participant's session.
    wsService.sendToUser(userId, {
      type: 'conversation.cleared',
      conversationId,
      clearedAt: clearedAt.toISOString(),
    });

    return { success: true, clearedAt: clearedAt.toISOString() };
  }

  /**
   * Retrieves conversation details by ID with strict membership authorization.
   */
  static async getConversation(
    conversationId: string,
    authenticatedUserId: string
  ): Promise<ConversationDetails> {
    const prisma = getPrismaClient();

    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        members: {
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

    // Strict membership check
    const isMember = conversation.members.some((m) => m.userId === authenticatedUserId);
    if (!isMember) {
      throw AppError.forbidden('You are not authorized to access this conversation');
    }

    const participants: ParticipantSummary[] = conversation.members.map((m) => ({
      id: m.user.id,
      username: m.user.username,
      displayName: m.user.displayName,
    }));

    return {
      id: conversation.id,
      createdAt: conversation.createdAt.toISOString(),
      updatedAt: conversation.updatedAt.toISOString(),
      participants,
    };
  }
}

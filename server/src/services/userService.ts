import type { UserProfile, UpdateProfileInput, UserSearchResponse } from '@enctxt/shared';
import { getPrismaClient } from './db.js';
import { AppError } from '../utils/errors.js';

export class UserService {
  /**
   * Retrieves full profile information for the authenticated user.
   */
  static async getProfile(userId: string): Promise<UserProfile> {
    const prisma = getPrismaClient();
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        displayName: true,
        email: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      throw AppError.notFound('User not found');
    }

    return {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      email: user.email,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
    };
  }

  /**
   * Updates display name and/or username for the authenticated user.
   */
  static async updateProfile(userId: string, input: UpdateProfileInput): Promise<UserProfile> {
    const prisma = getPrismaClient();

    const dataToUpdate: { displayName?: string; username?: string } = {};

    if (input.displayName !== undefined) {
      dataToUpdate.displayName = input.displayName.trim();
    }

    if (input.username !== undefined) {
      const normalizedUsername = input.username.trim().toLowerCase();

      // Check if another user owns this username
      const existingUser = await prisma.user.findUnique({
        where: { username: normalizedUsername },
        select: { id: true },
      });

      if (existingUser && existingUser.id !== userId) {
        throw AppError.badRequest('Username is already taken', { field: 'username' });
      }

      dataToUpdate.username = normalizedUsername;
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: dataToUpdate,
      select: {
        id: true,
        username: true,
        displayName: true,
        email: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return {
      id: updatedUser.id,
      username: updatedUser.username,
      displayName: updatedUser.displayName,
      email: updatedUser.email,
      createdAt: updatedUser.createdAt.toISOString(),
      updatedAt: updatedUser.updatedAt.toISOString(),
    };
  }

  /**
   * Searches users by username or display name with pagination and safe projection.
   */
  static async searchUsers(
    query: string,
    currentUserId: string,
    page = 1,
    limit = 20
  ): Promise<UserSearchResponse> {
    const prisma = getPrismaClient();
    const cleanQuery = query.trim();
    const skip = (page - 1) * limit;

    const whereClause = {
      id: { not: currentUserId },
      OR: [
        { username: { contains: cleanQuery, mode: 'insensitive' as const } },
        { displayName: { contains: cleanQuery, mode: 'insensitive' as const } },
      ],
    };

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where: whereClause,
        select: {
          id: true,
          username: true,
          displayName: true,
        },
        skip,
        take: limit,
        orderBy: { username: 'asc' },
      }),
      prisma.user.count({
        where: whereClause,
      }),
    ]);

    return {
      users,
      total,
      page,
      limit,
    };
  }
}

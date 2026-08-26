import { getPrismaClient } from './db.js';
import type { PublishKeyInput, PublicKeyRecord } from '@enctxt/shared';
import { logger } from '../utils/logger.js';

export class CryptoService {
  /**
   * Publishes or updates the user's public identity key.
   */
  async publishPublicKey(userId: string, input: PublishKeyInput): Promise<PublicKeyRecord> {
    const prisma = getPrismaClient();

    const record = await prisma.publicKey.upsert({
      where: { userId },
      create: {
        userId,
        keyId: input.keyId,
        publicKey: input.publicKey,
        algorithm: input.algorithm || 'ECDH-P256',
      },
      update: {
        keyId: input.keyId,
        publicKey: input.publicKey,
        algorithm: input.algorithm || 'ECDH-P256',
      },
      select: {
        id: true,
        keyId: true,
        userId: true,
        publicKey: true,
        algorithm: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    logger.info('Public key published for user', {
      event: 'public_key_published',
      userId,
      keyId: input.keyId,
    });

    return {
      id: record.id,
      keyId: record.keyId,
      userId: record.userId,
      publicKey: record.publicKey,
      algorithm: record.algorithm,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  }

  /**
   * Retrieves a user's active public key by their user ID.
   */
  async getPublicKeyByUserId(userId: string): Promise<PublicKeyRecord | null> {
    const prisma = getPrismaClient();

    const record = await prisma.publicKey.findUnique({
      where: { userId },
      select: {
        id: true,
        keyId: true,
        userId: true,
        publicKey: true,
        algorithm: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!record) return null;

    return {
      id: record.id,
      keyId: record.keyId,
      userId: record.userId,
      publicKey: record.publicKey,
      algorithm: record.algorithm,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  }

  /**
   * Retrieves a public key by its specific keyId.
   */
  async getPublicKeyByKeyId(keyId: string): Promise<PublicKeyRecord | null> {
    const prisma = getPrismaClient();

    const record = await prisma.publicKey.findUnique({
      where: { keyId },
      select: {
        id: true,
        keyId: true,
        userId: true,
        publicKey: true,
        algorithm: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!record) return null;

    return {
      id: record.id,
      keyId: record.keyId,
      userId: record.userId,
      publicKey: record.publicKey,
      algorithm: record.algorithm,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  }
}

export const cryptoService = new CryptoService();

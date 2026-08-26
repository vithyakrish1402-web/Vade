import { PrismaClient } from '@prisma/client';
import type { DatabaseStatus } from '@enctxt/shared';
import { logger } from '../utils/logger.js';

let prismaInstance: PrismaClient | null = null;

export function setPrismaClient(customClient: any): void {
  prismaInstance = customClient;
}

export function getPrismaClient(): PrismaClient {
  if (!prismaInstance) {
    prismaInstance = new PrismaClient({
      log:
        process.env.NODE_ENV === 'development'
          ? [
              { emit: 'event', level: 'query' },
              { emit: 'event', level: 'error' },
              { emit: 'event', level: 'warn' },
            ]
          : [{ emit: 'event', level: 'error' }],
    });

    if (process.env.NODE_ENV === 'development') {
      // @ts-expect-error Prisma event typing
      prismaInstance.$on('query', (e: { query: string; duration: number }) => {
        logger.debug(`Prisma Query: ${e.query} (${e.duration}ms)`);
      });
    }
  }

  return prismaInstance;
}

export async function checkDatabaseConnection(timeoutMs = 3000): Promise<DatabaseStatus> {
  try {
    const prisma = getPrismaClient();
    const checkPromise = prisma.$queryRaw`SELECT 1`;
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Database connection check timed out')), timeoutMs)
    );

    await Promise.race([checkPromise, timeoutPromise]);
    return 'connected';
  } catch (error) {
    logger.warn('Database connection check failed', {
      error: error instanceof Error ? error.message : 'Unknown database error',
    });
    return 'unreachable';
  }
}

export async function disconnectDatabase(): Promise<void> {
  if (prismaInstance) {
    await prismaInstance.$disconnect();
    prismaInstance = null;
    logger.info('Database connection closed');
  }
}

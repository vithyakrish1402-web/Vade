import { beforeEach } from 'vitest';
import { setPrismaClient } from '../src/services/db.js';
import { mockDb } from './mockDb.js';

const mockPrisma = {
  user: mockDb.userDelegate,
  session: mockDb.sessionDelegate,
  $queryRaw: async () => [{ 1: 1 }],
  $disconnect: async () => {},
};

beforeEach(() => {
  mockDb.reset();
  setPrismaClient(mockPrisma as any);
});

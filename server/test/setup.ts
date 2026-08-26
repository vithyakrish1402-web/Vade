import { beforeEach } from 'vitest';
import { setPrismaClient } from '../src/services/db.js';
import { wsService } from '../src/services/websocket.js';
import { mockDb } from './mockDb.js';

const mockPrisma = {
  user: mockDb.userDelegate,
  session: mockDb.sessionDelegate,
  conversation: mockDb.conversationDelegate,
  conversationMember: mockDb.conversationMemberDelegate,
  message: mockDb.messageDelegate,
  $queryRaw: async () => [{ 1: 1 }],
  $disconnect: async () => {},
};

beforeEach(() => {
  mockDb.reset();
  wsService.reset();
  setPrismaClient(mockPrisma as any);
});

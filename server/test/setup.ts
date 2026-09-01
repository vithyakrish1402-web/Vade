import { beforeEach } from 'vitest';
import { setPrismaClient } from '../src/services/db.js';
import { wsService } from '../src/services/websocket.js';
import { resetRateLimiters } from '../src/middleware/rateLimiter.js';
import { mockDb } from './mockDb.js';

const mockPrisma = {
  user: mockDb.userDelegate,
  publicKey: mockDb.publicKeyDelegate,
  device: mockDb.deviceDelegate,
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
  // The limiter is no longer bypassed under NODE_ENV=test (it was, which is why it had
  // never been exercised by any test). Buckets are cleared per case instead, so each test
  // starts from a known state while the real middleware still runs on every request.
  resetRateLimiters();
  setPrismaClient(mockPrisma as any);
});

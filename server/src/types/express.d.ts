import type { UserProfile } from '@enctxt/shared';

declare global {
  namespace Express {
    interface Request {
      user?: UserProfile;
      sessionId?: string;
    }
  }
}

export {};

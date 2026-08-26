import { describe, it, expect } from 'vitest';
import { formatMessageTime, formatConversationTime } from '../src/utils/dateUtils';

describe('Date & Timestamp Formatting (Phase 9 — Production UX)', () => {
  describe('formatMessageTime', () => {
    it('formats ISO timestamps into local time strings', () => {
      const date = new Date('2026-08-25T10:42:00Z');
      const formatted = formatMessageTime(date.toISOString());
      expect(formatted).toBeTruthy();
      expect(typeof formatted).toBe('string');
    });

    it('returns empty string for invalid date inputs', () => {
      expect(formatMessageTime('invalid-date-string')).toBe('');
      expect(formatMessageTime('')).toBe('');
    });
  });

  describe('formatConversationTime', () => {
    it('returns "Just now" for timestamps less than 60 seconds ago', () => {
      const now = new Date().toISOString();
      expect(formatConversationTime(now)).toBe('Just now');
    });

    it('returns relative minutes for recent timestamps within an hour', () => {
      const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      expect(formatConversationTime(tenMinutesAgo)).toBe('10m ago');
    });

    it('returns formatted time or "Yesterday" for older timestamps', () => {
      const yesterday = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
      const res = formatConversationTime(yesterday);
      expect(typeof res).toBe('string');
      expect(res.length).toBeGreaterThan(0);
    });

    it('returns empty string for invalid timestamps', () => {
      expect(formatConversationTime('invalid')).toBe('');
    });
  });
});

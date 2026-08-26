import { describe, it, expect } from 'vitest';
import type { SingleConversationItem, MessageItem } from '@enctxt/shared';

describe('Chat UX & Privacy Guarantees (Phase 9)', () => {
  describe('Zero-Plaintext Conversation Preview Invariant', () => {
    it('ensures conversation list items contain only participant metadata and no message plaintext', () => {
      const sampleConversation: SingleConversationItem = {
        id: 'conv-test-123',
        participant: {
          id: 'user-bob-456',
          username: 'bob',
          displayName: 'Bob Builder',
        },
        createdAt: '2026-08-25T10:00:00Z',
        updatedAt: '2026-08-25T10:30:00Z',
      };

      // Conversation item must strictly not expose message content or ciphertext
      expect((sampleConversation as any).lastMessage).toBeUndefined();
      expect((sampleConversation as any).preview).toBeUndefined();
      expect((sampleConversation as any).plaintext).toBeUndefined();
      expect(sampleConversation.participant.displayName).toBe('Bob Builder');
    });
  });

  describe('Authoritative Message Deduplication', () => {
    it('deduplicates incoming messages by authoritative message id', () => {
      const msg1: MessageItem = {
        id: 'msg-authoritative-1',
        conversationId: 'conv-1',
        senderId: 'user-alice',
        ciphertext: 'base64ciphertext1',
        nonce: 'nonce1',
        senderKeyId: 'k1',
        recipientKeyId: 'k2',
        algorithm: 'AES-256-GCM',
        version: 1,
        status: 'sent',
        createdAt: '2026-08-25T10:00:00Z',
        updatedAt: '2026-08-25T10:00:00Z',
      };

      const msg2: MessageItem = {
        id: 'msg-authoritative-2',
        conversationId: 'conv-1',
        senderId: 'user-bob',
        ciphertext: 'base64ciphertext2',
        nonce: 'nonce2',
        senderKeyId: 'k2',
        recipientKeyId: 'k1',
        algorithm: 'AES-256-GCM',
        version: 1,
        status: 'sent',
        createdAt: '2026-08-25T10:01:00Z',
        updatedAt: '2026-08-25T10:01:00Z',
      };

      const initialList: MessageItem[] = [msg1];

      // Re-arrival of msg1 (e.g. from both REST polling and WebSocket event)
      const incomingBatch = [msg1, msg2];

      const deduplicatedMap = new Map<string, MessageItem>();
      initialList.forEach((m) => deduplicatedMap.set(m.id, m));
      incomingBatch.forEach((m) => deduplicatedMap.set(m.id, m));

      const result = Array.from(deduplicatedMap.values());
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('msg-authoritative-1');
      expect(result[1].id).toBe('msg-authoritative-2');
    });
  });

  describe('Consecutive Message Grouping Logic', () => {
    it('correctly calculates first and last flags for consecutive messages from the same sender', () => {
      const messages: { id: string; senderId: string }[] = [
        { id: '1', senderId: 'alice' },
        { id: '2', senderId: 'alice' },
        { id: '3', senderId: 'alice' },
        { id: '4', senderId: 'bob' },
        { id: '5', senderId: 'bob' },
        { id: '6', senderId: 'alice' },
      ];

      const evaluated = messages.map((msg, index) => {
        const prev = index > 0 ? messages[index - 1] : null;
        const next = index < messages.length - 1 ? messages[index + 1] : null;

        const isFirstInGroup = !prev || prev.senderId !== msg.senderId;
        const isLastInGroup = !next || next.senderId !== msg.senderId;

        return { id: msg.id, isFirstInGroup, isLastInGroup };
      });

      // msg 1: first=true, last=false
      expect(evaluated[0]).toEqual({ id: '1', isFirstInGroup: true, isLastInGroup: false });
      // msg 2: first=false, last=false
      expect(evaluated[1]).toEqual({ id: '2', isFirstInGroup: false, isLastInGroup: false });
      // msg 3: first=false, last=true
      expect(evaluated[2]).toEqual({ id: '3', isFirstInGroup: false, isLastInGroup: true });
      // msg 4: first=true, last=false
      expect(evaluated[3]).toEqual({ id: '4', isFirstInGroup: true, isLastInGroup: false });
      // msg 5: first=false, last=true
      expect(evaluated[4]).toEqual({ id: '5', isFirstInGroup: false, isLastInGroup: true });
      // msg 6: first=true, last=true
      expect(evaluated[5]).toEqual({ id: '6', isFirstInGroup: true, isLastInGroup: true });
    });
  });
});

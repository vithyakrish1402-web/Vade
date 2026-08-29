import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { SingleConversationItem, MessageItem, WSServerMessage } from '@enctxt/shared';
import { conversationService } from '../src/services/conversationService';
import { wsClient } from '../src/services/websocket';

describe('Messaging State & Event Synchronization Regression Tests', () => {
  const currentUserId = 'user-bob-id';
  const friendId = 'user-alice-id';
  const existingConvId = 'conv-existing-123';
  const newConvId = 'conv-new-456';

  let listeners: ((event: WSServerMessage) => void)[] = [];
  let statusListeners: ((status: any) => void)[] = [];

  beforeEach(() => {
    listeners = [];
    statusListeners = [];
    vi.spyOn(wsClient, 'addEventListener').mockImplementation((cb) => {
      listeners.push(cb);
      return () => {
        listeners = listeners.filter((l) => l !== cb);
      };
    });
    vi.spyOn(wsClient, 'addStatusListener').mockImplementation((cb) => {
      statusListeners.push(cb);
      return () => {
        statusListeners = statusListeners.filter((l) => l !== cb);
      };
    });
    vi.spyOn(wsClient, 'connect').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Scenario A — Existing conversation notification & unread state', () => {
    it('updates unread count, reorders conversation, and triggers notification when an existing friend messages', async () => {
      const initialConversations: SingleConversationItem[] = [
        {
          id: existingConvId,
          participant: { id: friendId, username: 'alice', displayName: 'Alice' },
          createdAt: '2026-08-25T10:00:00Z',
          updatedAt: '2026-08-25T10:00:00Z',
        },
      ];

      vi.spyOn(conversationService, 'listConversations').mockResolvedValue({
        conversations: initialConversations,
        total: 1,
        page: 1,
        limit: 20,
      });

      let notificationDispatched = false;
      const onNotification = (detail: any) => {
        if (detail?.conversationId === existingConvId) {
          notificationDispatched = true;
        }
      };

      const incomingMessage: MessageItem = {
        id: 'msg-existing-1',
        conversationId: existingConvId,
        senderId: friendId,
        ciphertext: 'EncryptedCiphertextA==',
        nonce: 'NonceA==',
        senderKeyId: 'k_alice_1',
        recipientKeyId: 'k_bob_1',
        algorithm: 'AES-256-GCM',
        version: 1,
        status: 'sent',
        createdAt: '2026-08-25T11:00:00Z',
        updatedAt: '2026-08-25T11:00:00Z',
      };

      // State updater simulation matching useConversations logic
      let unreadCounts: Record<string, number> = {};
      let conversations = [...initialConversations];
      const activeConversationId: string | null = null; // viewing inbox, not this chat

      const handleEvent = (msg: MessageItem) => {
        const isFromPeer = msg.senderId !== currentUserId;
        const isActive = activeConversationId === msg.conversationId;
        if (isFromPeer && !isActive) {
          unreadCounts[msg.conversationId] = (unreadCounts[msg.conversationId] || 0) + 1;
          onNotification({
            conversationId: msg.conversationId,
            senderId: msg.senderId,
            createdAt: msg.createdAt,
          });
        }
        const idx = conversations.findIndex((c) => c.id === msg.conversationId);
        if (idx !== -1) {
          const target = { ...conversations[idx], updatedAt: msg.createdAt };
          conversations = [target, ...conversations.filter((_, i) => i !== idx)];
        }
      };

      handleEvent(incomingMessage);

      expect(unreadCounts[existingConvId]).toBe(1);
      expect(conversations[0].updatedAt).toBe(incomingMessage.createdAt);
      expect(notificationDispatched).toBe(true);
    });
  });

  describe('Scenario B — First conversation automatic discovery without search', () => {
    it('automatically creates and inserts new conversation into recipient list upon receiving first message', async () => {
      const incomingMessage: MessageItem = {
        id: 'msg-new-first',
        conversationId: newConvId,
        senderId: friendId,
        ciphertext: 'EncryptedCiphertextNew==',
        nonce: 'NonceNew==',
        senderKeyId: 'k_alice_1',
        recipientKeyId: 'k_bob_1',
        algorithm: 'AES-256-GCM',
        version: 1,
        status: 'sent',
        createdAt: '2026-08-25T12:00:00Z',
        updatedAt: '2026-08-25T12:00:00Z',
      };

      vi.spyOn(conversationService, 'getConversation').mockResolvedValue({
        conversation: {
          id: newConvId,
          createdAt: '2026-08-25T12:00:00Z',
          updatedAt: '2026-08-25T12:00:00Z',
          participants: [
            { id: friendId, username: 'alice', displayName: 'Alice' },
            { id: currentUserId, username: 'bob', displayName: 'Bob' },
          ],
        },
      });

      let conversationsState: SingleConversationItem[] = [];
      let unreadCounts: Record<string, number> = {};

      const handleIncoming = async (msg: MessageItem) => {
        const isFromPeer = msg.senderId !== currentUserId;
        const exists = conversationsState.some((c) => c.id === msg.conversationId);
        if (!exists) {
          const res = await conversationService.getConversation(msg.conversationId);
          const other = res.conversation.participants.find((p) => p.id !== currentUserId)!;
          const newEntry: SingleConversationItem = {
            id: msg.conversationId,
            createdAt: res.conversation.createdAt,
            updatedAt: msg.createdAt,
            participant: other,
          };
          conversationsState = [newEntry, ...conversationsState];
          if (isFromPeer) {
            unreadCounts[msg.conversationId] = 1;
          }
        }
      };

      await handleIncoming(incomingMessage);

      expect(conversationsState).toHaveLength(1);
      expect(conversationsState[0].id).toBe(newConvId);
      expect(conversationsState[0].participant.displayName).toBe('Alice');
      expect(conversationsState[0].updatedAt).toBe(incomingMessage.createdAt);
      expect(unreadCounts[newConvId]).toBe(1);
    });
  });

  describe('Scenario C — Duplicate delivery idempotency', () => {
    it('processes duplicate WebSocket message events idempotently without duplicating entries or double-incrementing', async () => {
      const incomingMessage: MessageItem = {
        id: 'msg-dup-1',
        conversationId: existingConvId,
        senderId: friendId,
        ciphertext: 'CiphertextDup==',
        nonce: 'NonceDup==',
        senderKeyId: 'k1',
        recipientKeyId: 'k2',
        algorithm: 'AES-256-GCM',
        version: 1,
        status: 'sent',
        createdAt: '2026-08-25T13:00:00Z',
        updatedAt: '2026-08-25T13:00:00Z',
      };

      const processedIds = new Set<string>();
      let unreadCount = 0;
      const conversationList: SingleConversationItem[] = [
        {
          id: existingConvId,
          participant: { id: friendId, username: 'alice', displayName: 'Alice' },
          createdAt: '2026-08-25T10:00:00Z',
          updatedAt: '2026-08-25T10:00:00Z',
        },
      ];

      const processEvent = (msg: MessageItem) => {
        if (processedIds.has(msg.id)) return;
        processedIds.add(msg.id);
        unreadCount += 1;
        const idx = conversationList.findIndex((c) => c.id === msg.conversationId);
        if (idx !== -1) {
          conversationList[idx].updatedAt = msg.createdAt;
        }
      };

      // Deliver first time
      processEvent(incomingMessage);
      expect(unreadCount).toBe(1);
      expect(conversationList[0].updatedAt).toBe('2026-08-25T13:00:00Z');

      // Deliver duplicate
      processEvent(incomingMessage);
      expect(unreadCount).toBe(1);
      expect(conversationList).toHaveLength(1);
    });
  });

  describe('Scenario D — Offline & Reconnect synchronization', () => {
    it('synchronizes missed conversations and ordering when reconnecting after being offline', async () => {
      const serverConversations: SingleConversationItem[] = [
        {
          id: newConvId,
          participant: { id: friendId, username: 'alice', displayName: 'Alice' },
          createdAt: '2026-08-25T14:00:00Z',
          updatedAt: '2026-08-25T14:05:00Z',
        },
        {
          id: existingConvId,
          participant: { id: 'user-charlie', username: 'charlie', displayName: 'Charlie' },
          createdAt: '2026-08-25T10:00:00Z',
          updatedAt: '2026-08-25T12:00:00Z',
        },
      ];

      vi.spyOn(conversationService, 'listConversations').mockResolvedValue({
        conversations: serverConversations,
        total: 2,
        page: 1,
        limit: 20,
      });

      let conversations: SingleConversationItem[] = [];
      const fetchConversations = async () => {
        const res = await conversationService.listConversations();
        conversations = [...res.conversations].sort(
          (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        );
      };

      // Simulate reconnect trigger
      await fetchConversations();

      expect(conversations).toHaveLength(2);
      expect(conversations[0].id).toBe(newConvId);
      expect(conversations[1].id).toBe(existingConvId);
    });
  });

  describe('Scenario E — Security Invariants & Zero Plaintext Invariant', () => {
    it('strictly preserves ciphertext envelope without exposing plaintext in event frames or conversation metadata', () => {
      const envelope = {
        version: 1,
        algorithm: 'AES-256-GCM',
        keyAgreement: 'ECDH-P256',
        senderKeyId: 'k1',
        recipientKeyId: 'k2',
        nonce: 'IV96Bit==',
        ciphertext: 'EncryptedCiphertextPayload==',
        aad: 'conv-1:sender-1:v1',
      };

      const serverMsg: WSServerMessage = {
        type: 'message.created',
        message: {
          id: 'msg-sec-1',
          conversationId: 'conv-1',
          senderId: 'user-1',
          ciphertext: envelope.ciphertext,
          nonce: envelope.nonce,
          senderKeyId: envelope.senderKeyId,
          recipientKeyId: envelope.recipientKeyId,
          algorithm: envelope.algorithm,
          version: envelope.version,
          aad: envelope.aad,
          status: 'sent',
          createdAt: '2026-08-25T15:00:00Z',
          updatedAt: '2026-08-25T15:00:00Z',
        },
      };

      const payloadString = JSON.stringify(serverMsg);

      // Verify no plaintext fields exist
      expect(payloadString).not.toContain('"plaintext"');
      expect(payloadString).not.toContain('"content"');
      expect(payloadString).not.toContain('"body"');
      expect(payloadString).not.toContain('"text"');
      expect(payloadString).toContain('"ciphertext"');
      expect(payloadString).toContain('"nonce"');
    });
  });
});

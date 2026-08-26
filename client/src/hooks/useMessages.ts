import { useState, useEffect, useCallback, useRef } from 'react';
import type { MessageItem, EncryptedMessageEnvelope } from '@enctxt/shared';
import { messageService } from '../services/messageService';
import { wsClient, type WSConnectionStatus } from '../services/websocket';
import { ApiClientError } from '../services/api';
import {
  getOrInitializeIdentity,
  fetchPeerPublicKey,
  deriveConversationKey,
  encryptMessage,
  decryptMessage,
} from '../crypto';

export function useMessages(
  conversationId: string | undefined,
  currentUserId: string | undefined,
  peerUserId: string | undefined
) {
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [decryptedMap, setDecryptedMap] = useState<Map<string, string>>(new Map());
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<WSConnectionStatus>('disconnected');

  // Crypto references for active conversation
  const convKeyRef = useRef<CryptoKey | null>(null);
  const myKeyIdRef = useRef<string | null>(null);
  const peerKeyIdRef = useRef<string | null>(null);

  // Setup / initialize conversation key agreement
  const initCrypto = useCallback(async (): Promise<CryptoKey | null> => {
    if (!conversationId || !currentUserId || !peerUserId) return null;

    try {
      // 1. Load self identity keys
      const selfIdentity = await getOrInitializeIdentity(currentUserId);
      myKeyIdRef.current = selfIdentity.keyId;

      // 2. Fetch peer public key
      const peer = await fetchPeerPublicKey(peerUserId);
      peerKeyIdRef.current = peer.keyId;

      // 3. Derive symmetric AES-256-GCM conversation key
      const key = await deriveConversationKey(
        selfIdentity.keyPair.privateKey,
        peer.key,
        conversationId
      );
      convKeyRef.current = key;
      return key;
    } catch (err) {
      console.warn('Failed to initialize E2EE crypto keys:', err);
      return null;
    }
  }, [conversationId, currentUserId, peerUserId]);

  // Decrypt a list of messages into the in-memory decryptedMap
  const decryptBatch = useCallback(
    async (items: MessageItem[], key: CryptoKey | null) => {
      if (!conversationId) return;

      const activeKey = key || convKeyRef.current;
      if (!activeKey) return;

      const updates = new Map<string, string>();

      for (const msg of items) {
        if (decryptedMap.has(msg.id)) continue;

        // If it's a temporary optimistic message, plaintext is already cached
        if (msg.id.startsWith('temp-')) continue;

        try {
          const envelope: EncryptedMessageEnvelope = {
            version: msg.version,
            algorithm: msg.algorithm,
            keyAgreement: 'ECDH-P256',
            senderKeyId: msg.senderKeyId,
            recipientKeyId: msg.recipientKeyId,
            nonce: msg.nonce,
            ciphertext: msg.ciphertext,
            aad: msg.aad || undefined,
          };

          const plaintext = await decryptMessage(envelope, activeKey, {
            conversationId,
            senderId: msg.senderId,
          });

          updates.set(msg.id, plaintext);
        } catch {
          updates.set(msg.id, 'Unable to decrypt this message.');
        }
      }

      if (updates.size > 0) {
        setDecryptedMap((prev) => {
          const next = new Map(prev);
          updates.forEach((val, k) => next.set(k, val));
          return next;
        });
      }
    },
    [conversationId, decryptedMap]
  );

  // Subscribe to WebSocket status
  useEffect(() => {
    wsClient.connect();
    const unsubStatus = wsClient.addStatusListener((status) => {
      setConnectionStatus(status);
    });

    return () => {
      unsubStatus();
    };
  }, []);

  // Fetch initial messages for conversation
  const fetchInitialMessages = useCallback(async () => {
    if (!conversationId) return;

    setIsLoading(true);
    setError(null);

    try {
      const [key, res] = await Promise.all([
        initCrypto(),
        messageService.getMessages(conversationId, 50),
      ]);

      setMessages(res.messages);
      setHasMore(res.hasMore);
      setNextCursor(res.nextCursor);

      // Decrypt retrieved messages
      if (key) {
        await decryptBatch(res.messages, key);
      }

      // Mark read
      messageService.markRead(conversationId).catch(() => {});
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.message);
      } else {
        setError('Failed to load message history.');
      }
    } finally {
      setIsLoading(false);
    }
  }, [conversationId, initCrypto, decryptBatch]);

  // Load older historical messages
  const loadOlderMessages = useCallback(async () => {
    if (!conversationId || isLoadingOlder || !hasMore || !nextCursor) return;

    setIsLoadingOlder(true);
    try {
      const res = await messageService.getMessages(conversationId, 50, nextCursor);
      setMessages((prev) => {
        const existingIds = new Set(prev.map((m) => m.id));
        const newOlder = res.messages.filter((m) => !existingIds.has(m.id));
        return [...newOlder, ...prev];
      });
      setHasMore(res.hasMore);
      setNextCursor(res.nextCursor);

      // Decrypt older messages
      await decryptBatch(res.messages, convKeyRef.current);
    } catch {
      // Non-fatal error
    } finally {
      setIsLoadingOlder(false);
    }
  }, [conversationId, isLoadingOlder, hasMore, nextCursor, decryptBatch]);

  // WebSocket Subscription & Real-Time Events
  useEffect(() => {
    if (!conversationId) return;

    wsClient.subscribeConversation(conversationId);

    const unsubEvents = wsClient.addEventListener(async (event) => {
      if (event.type === 'message.created') {
        const incoming = event.message;
        if (incoming.conversationId !== conversationId) return;

        // Decrypt incoming message
        await decryptBatch([incoming], convKeyRef.current);

        setMessages((prev) => {
          // If tempId matches optimistic message, replace it
          if (event.tempId) {
            const tempIdx = prev.findIndex((m) => m.id === event.tempId);
            if (tempIdx !== -1) {
              const copy = [...prev];
              copy[tempIdx] = incoming;
              return copy;
            }
          }

          // Deduplicate by message ID
          if (prev.some((m) => m.id === incoming.id)) {
            return prev;
          }

          return [...prev, incoming];
        });

        // If message is from partner, send delivered acknowledgement & mark read
        if (currentUserId && incoming.senderId !== currentUserId) {
          wsClient.send({
            type: 'message.delivered',
            messageId: incoming.id,
            conversationId,
          });
          messageService.markRead(conversationId, incoming.id).catch(() => {});
        }
      } else if (event.type === 'message.delivered') {
        if (event.conversationId !== conversationId) return;
        setMessages((prev) =>
          prev.map((m) =>
            m.id === event.messageId && m.status === 'sent'
              ? { ...m, status: 'delivered' }
              : m
          )
        );
      } else if (event.type === 'message.read') {
        if (event.conversationId !== conversationId) return;
        setMessages((prev) =>
          prev.map((m) =>
            m.senderId === currentUserId
              ? { ...m, status: 'read' }
              : m
          )
        );
      }
    });

    return () => {
      wsClient.unsubscribeConversation(conversationId);
      unsubEvents();
    };
  }, [conversationId, currentUserId, decryptBatch]);

  useEffect(() => {
    fetchInitialMessages();
  }, [fetchInitialMessages]);

  // Clean up decrypted plaintexts on unmount / conversation change
  useEffect(() => {
    return () => {
      setDecryptedMap(new Map());
      convKeyRef.current = null;
    };
  }, [conversationId]);

  // Send message function with client-side E2EE encryption & optimistic UI
  const sendMessage = async (plaintext: string) => {
    if (!conversationId || !currentUserId || !plaintext.trim()) return;

    let key = convKeyRef.current;
    if (!key) {
      key = await initCrypto();
    }

    if (!key || !myKeyIdRef.current || !peerKeyIdRef.current) {
      setError('Unable to encrypt message: cryptographic identity or peer key missing.');
      return;
    }

    const tempId = `temp-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

    // 1. Encrypt message locally using AES-256-GCM + random IV
    const envelope = await encryptMessage(plaintext, key, {
      conversationId,
      senderId: currentUserId,
      senderKeyId: myKeyIdRef.current,
      recipientKeyId: peerKeyIdRef.current,
    });

    // 2. Cache plaintext in transient memory
    setDecryptedMap((prev) => {
      const next = new Map(prev);
      next.set(tempId, plaintext);
      return next;
    });

    const optimisticMessage: MessageItem = {
      id: tempId,
      conversationId,
      senderId: currentUserId,
      ciphertext: envelope.ciphertext,
      nonce: envelope.nonce,
      senderKeyId: envelope.senderKeyId,
      recipientKeyId: envelope.recipientKeyId,
      algorithm: envelope.algorithm,
      version: envelope.version,
      aad: envelope.aad,
      status: 'sending',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Optimistically add to UI
    setMessages((prev) => [...prev, optimisticMessage]);

    try {
      const res = await messageService.sendMessage(conversationId, {
        envelope,
        tempId,
      });

      // Transfer decrypted plaintext to real message ID
      setDecryptedMap((prev) => {
        const next = new Map(prev);
        next.set(res.message.id, plaintext);
        next.delete(tempId);
        return next;
      });

      setMessages((prev) =>
        prev.map((m) => (m.id === tempId ? res.message : m))
      );
    } catch {
      // Mark optimistic message as failed
      setMessages((prev) =>
        prev.map((m) => (m.id === tempId ? { ...m, status: 'failed' } : m))
      );
    }
  };

  // Retry sending a failed message
  const retryMessage = async (failedMessageId: string) => {
    const failedMsg = messages.find((m) => m.id === failedMessageId);
    if (!failedMsg || !conversationId) return;

    const plaintext = decryptedMap.get(failedMessageId);
    if (!plaintext) return;

    setMessages((prev) =>
      prev.map((m) => (m.id === failedMessageId ? { ...m, status: 'sending' } : m))
    );

    try {
      const key = convKeyRef.current || (await initCrypto());
      if (!key || !myKeyIdRef.current || !peerKeyIdRef.current) return;

      const envelope = await encryptMessage(plaintext, key, {
        conversationId,
        senderId: currentUserId!,
        senderKeyId: myKeyIdRef.current,
        recipientKeyId: peerKeyIdRef.current,
      });

      const res = await messageService.sendMessage(conversationId, {
        envelope,
        tempId: failedMessageId,
      });

      setDecryptedMap((prev) => {
        const next = new Map(prev);
        next.set(res.message.id, plaintext);
        next.delete(failedMessageId);
        return next;
      });

      setMessages((prev) =>
        prev.map((m) => (m.id === failedMessageId ? res.message : m))
      );
    } catch {
      setMessages((prev) =>
        prev.map((m) => (m.id === failedMessageId ? { ...m, status: 'failed' } : m))
      );
    }
  };

  const getDecryptedText = useCallback(
    (msg: MessageItem): string => {
      return decryptedMap.get(msg.id) || 'Decrypting...';
    },
    [decryptedMap]
  );

  return {
    messages,
    decryptedMap,
    getDecryptedText,
    isLoading,
    isLoadingOlder,
    hasMore,
    error,
    connectionStatus,
    sendMessage,
    retryMessage,
    loadOlderMessages,
    refreshMessages: fetchInitialMessages,
  };
}

import { useState, useEffect, useCallback, useRef } from 'react';
import type { MessageItem } from '@enctxt/shared';
import { messageService } from '../services/messageService';
import { wsClient, type WSConnectionStatus } from '../services/websocket';
import { ApiClientError } from '../services/api';

export function useMessages(conversationId: string | undefined, currentUserId: string | undefined) {
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<WSConnectionStatus>('disconnected');

  // Track pending optimistic messages
  const pendingMapRef = useRef<Map<string, MessageItem>>(new Map());

  // Subscribe to connection status
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
      const res = await messageService.getMessages(conversationId, 50);
      setMessages(res.messages);
      setHasMore(res.hasMore);
      setNextCursor(res.nextCursor);

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
  }, [conversationId]);

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
    } catch (err) {
      // Non-fatal error
    } finally {
      setIsLoadingOlder(false);
    }
  }, [conversationId, isLoadingOlder, hasMore, nextCursor]);

  // WebSocket Subscription & Real-Time Events
  useEffect(() => {
    if (!conversationId) return;

    wsClient.subscribeConversation(conversationId);

    const unsubEvents = wsClient.addEventListener((event) => {
      if (event.type === 'message.created') {
        const incoming = event.message;
        if (incoming.conversationId !== conversationId) return;

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
  }, [conversationId, currentUserId]);

  useEffect(() => {
    fetchInitialMessages();
  }, [fetchInitialMessages]);

  // Reconnection synchronization: reconcile missed messages
  useEffect(() => {
    if (connectionStatus === 'connected' && conversationId) {
      // Fetch latest messages to merge any missed while offline/reconnecting
      messageService
        .getMessages(conversationId, 20)
        .then((res) => {
          setMessages((prev) => {
            const existingIds = new Set(prev.map((m) => m.id));
            const newArrivals = res.messages.filter((m) => !existingIds.has(m.id));
            if (newArrivals.length === 0) return prev;
            return [...prev, ...newArrivals].sort(
              (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
            );
          });
        })
        .catch(() => {});
    }
  }, [connectionStatus, conversationId]);

  // Send message function with optimistic UI
  const sendMessage = async (content: string) => {
    if (!conversationId || !currentUserId || !content.trim()) return;

    const tempId = `temp-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    const optimisticMessage: MessageItem = {
      id: tempId,
      conversationId,
      senderId: currentUserId,
      content,
      status: 'sending',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    pendingMapRef.current.set(tempId, optimisticMessage);

    // Optimistically add to UI
    setMessages((prev) => [...prev, optimisticMessage]);

    try {
      const res = await messageService.sendMessage(conversationId, {
        content,
        tempId,
      });

      pendingMapRef.current.delete(tempId);

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

    // Set status back to sending
    setMessages((prev) =>
      prev.map((m) => (m.id === failedMessageId ? { ...m, status: 'sending' } : m))
    );

    try {
      const res = await messageService.sendMessage(conversationId, {
        content: failedMsg.content,
        tempId: failedMessageId,
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

  return {
    messages,
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

import { useState, useEffect, useCallback, useRef } from 'react';
import type { SingleConversationItem, CreateConversationInput } from '@enctxt/shared';
import { conversationService } from '../services/conversationService';
import { wsClient } from '../services/websocket';
import { ApiClientError } from '../services/api';

export function useConversations(currentUserId?: string) {
  const [conversations, setConversations] = useState<SingleConversationItem[]>([]);
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
  const [activeConversationId, setActiveConversationIdState] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const activeConversationIdRef = useRef<string | null>(null);
  const processedMessageIds = useRef<Set<string>>(new Set());
  const prevStatusRef = useRef(wsClient.getStatus());

  const setActiveConversationId = useCallback((id: string | null) => {
    activeConversationIdRef.current = id;
    setActiveConversationIdState(id);
    if (id) {
      setUnreadCounts((prev) => {
        if (!prev[id]) return prev;
        const next = { ...prev };
        delete next[id];
        return next;
      });
    }
  }, []);

  const markConversationRead = useCallback((conversationId: string) => {
    setUnreadCounts((prev) => {
      if (!prev[conversationId]) return prev;
      const next = { ...prev };
      delete next[conversationId];
      return next;
    });
  }, []);

  const fetchConversations = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await conversationService.listConversations();
      // Sort by latest activity (updatedAt descending)
      const sorted = [...data.conversations].sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      );
      setConversations(sorted);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.message);
      } else {
        setError('Failed to load conversations.');
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  const createConversation = async (input: CreateConversationInput) => {
    try {
      const res = await conversationService.createOrGetConversation(input);
      setConversations((prev) => {
        const exists = prev.some((c) => c.id === res.conversation.id);
        if (exists) {
          return prev.map((c) => (c.id === res.conversation.id ? res.conversation : c));
        }
        return [res.conversation, ...prev];
      });
      return res.conversation;
    } catch (err) {
      if (err instanceof ApiClientError) {
        throw err;
      }
      throw new Error('Failed to create conversation.');
    }
  };

  // Connect WebSocket and request notification permissions when authenticated user is present
  useEffect(() => {
    if (currentUserId) {
      wsClient.connect();
      if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
        try {
          Notification.requestPermission().catch(() => {});
        } catch {
          // Ignore
        }
      }
    }
  }, [currentUserId]);

  // Re-sync on WebSocket reconnect
  useEffect(() => {
    const unsubStatus = wsClient.addStatusListener((status) => {
      const prev = prevStatusRef.current;
      prevStatusRef.current = status;
      if (status === 'connected' && (prev === 'reconnecting' || prev === 'disconnected')) {
        fetchConversations();
      }
    });

    return () => {
      unsubStatus();
    };
  }, [fetchConversations]);

  // Listen for real-time incoming messages
  useEffect(() => {
    const unsub = wsClient.addEventListener(async (event) => {
      if (event.type === 'message.created') {
        const incoming = event.message;

        // Idempotency: skip if this message ID was already processed
        if (processedMessageIds.current.has(incoming.id)) {
          return;
        }
        processedMessageIds.current.add(incoming.id);
        if (processedMessageIds.current.size > 1000) {
          const first = processedMessageIds.current.values().next().value;
          if (first) processedMessageIds.current.delete(first);
        }

        const isFromPeer = currentUserId ? incoming.senderId !== currentUserId : true;
        const isActive = activeConversationIdRef.current === incoming.conversationId;

        // 1. Update unread state & trigger notification if from peer and not actively viewing
        if (isFromPeer) {
          if (!isActive) {
            setUnreadCounts((prev) => ({
              ...prev,
              [incoming.conversationId]: (prev[incoming.conversationId] || 0) + 1,
            }));

            // Dispatch notification safely without plaintext
            if (typeof window !== 'undefined') {
              window.dispatchEvent(
                new CustomEvent('vade:notification', {
                  detail: {
                    conversationId: incoming.conversationId,
                    senderId: incoming.senderId,
                    createdAt: incoming.createdAt,
                  },
                })
              );
              if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
                try {
                  const notif = new Notification('Vade', {
                    body: 'New protected message received',
                    tag: incoming.conversationId,
                  });
                  notif.onclick = () => {
                    try {
                      window.focus();
                    } catch {
                      // Ignore
                    }
                  };
                } catch {
                  // Ignore Notification construction error
                }
              }
            }
          }
        }

        // 2. Update conversation list & order
        setConversations((prev) => {
          const convIndex = prev.findIndex((c) => c.id === incoming.conversationId);
          if (convIndex !== -1) {
            const target = {
              ...prev[convIndex],
              updatedAt: incoming.createdAt,
            };
            const remaining = prev.filter((_, idx) => idx !== convIndex);
            return [target, ...remaining];
          }
          return prev;
        });

        // 3. If conversation is not in list (Bug 2: first message in new conversation), fetch details and insert it
        setConversations((prev) => {
          const exists = prev.some((c) => c.id === incoming.conversationId);
          if (!exists) {
            conversationService
              .getConversation(incoming.conversationId)
              .then((res) => {
                const other = res.conversation.participants.find((p) => p.id !== currentUserId) || {
                  id: incoming.senderId,
                  username: 'unknown',
                  displayName: 'Protected Contact',
                };
                const newConvItem: SingleConversationItem = {
                  id: incoming.conversationId,
                  createdAt: res.conversation.createdAt,
                  updatedAt: incoming.createdAt,
                  participant: other,
                };
                setConversations((latest) => {
                  if (latest.some((c) => c.id === incoming.conversationId)) {
                    return latest.map((c) =>
                      c.id === incoming.conversationId ? { ...c, updatedAt: incoming.createdAt } : c
                    );
                  }
                  return [newConvItem, ...latest];
                });
              })
              .catch(() => {
                fetchConversations();
              });
          }
          return prev;
        });
      }
    });

    return () => {
      unsub();
    };
  }, [currentUserId, fetchConversations]);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  return {
    conversations,
    unreadCounts,
    activeConversationId,
    setActiveConversationId,
    markConversationRead,
    isLoading,
    error,
    fetchConversations,
    createConversation,
  };
}

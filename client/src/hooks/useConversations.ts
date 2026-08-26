import { useState, useEffect, useCallback } from 'react';
import type { SingleConversationItem, CreateConversationInput } from '@enctxt/shared';
import { conversationService } from '../services/conversationService';
import { wsClient } from '../services/websocket';
import { ApiClientError } from '../services/api';

export function useConversations() {
  const [conversations, setConversations] = useState<SingleConversationItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  // Listen for real-time incoming messages to update conversation order
  useEffect(() => {
    const unsub = wsClient.addEventListener((event) => {
      if (event.type === 'message.created') {
        const incoming = event.message;
        setConversations((prev) => {
          const convIndex = prev.findIndex((c) => c.id === incoming.conversationId);
          if (convIndex === -1) {
            // Conversation not in list, fetch fresh list
            fetchConversations();
            return prev;
          }

          const target = {
            ...prev[convIndex],
            updatedAt: incoming.createdAt,
          };

          const remaining = prev.filter((_, idx) => idx !== convIndex);
          return [target, ...remaining];
        });
      }
    });

    return () => {
      unsub();
    };
  }, [fetchConversations]);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  return {
    conversations,
    isLoading,
    error,
    fetchConversations,
    createConversation,
  };
}

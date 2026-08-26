import { useState, useEffect, useCallback } from 'react';
import type { SingleConversationItem, CreateConversationInput } from '@enctxt/shared';
import { conversationService } from '../services/conversationService';
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
      setConversations(data.conversations);
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
        if (exists) return prev;
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

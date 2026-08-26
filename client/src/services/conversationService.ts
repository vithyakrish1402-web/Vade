import type {
  ConversationSummary,
  ConversationListResponse,
  CreateDirectConversationInput,
} from '@enctxt/shared';
import { api } from './api';

export const conversationService = {
  createDirectConversation: (input: CreateDirectConversationInput): Promise<ConversationSummary> => {
    return api.post<ConversationSummary>('/conversations', input);
  },

  listConversations: (): Promise<ConversationListResponse> => {
    return api.get<ConversationListResponse>('/conversations');
  },

  getConversation: (id: string): Promise<ConversationSummary> => {
    return api.get<ConversationSummary>(`/conversations/${id}`);
  },
};

import type {
  CreateConversationInput,
  CreateConversationResponse,
  ConversationListResponse,
  ConversationDetailResponse,
} from '@enctxt/shared';
import { api } from './api';

export const conversationService = {
  createOrGetConversation: (input: CreateConversationInput): Promise<CreateConversationResponse> => {
    return api.post<CreateConversationResponse>('/conversations', input);
  },

  listConversations: (page = 1, limit = 20): Promise<ConversationListResponse> => {
    const params = new URLSearchParams({
      page: String(page),
      limit: String(limit),
    });
    return api.get<ConversationListResponse>(`/conversations?${params.toString()}`);
  },

  getConversation: (id: string): Promise<ConversationDetailResponse> => {
    return api.get<ConversationDetailResponse>(`/conversations/${id}`);
  },
};

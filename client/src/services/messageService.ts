import type {
  SendMessageInput,
  SendMessageResponse,
  MessageListResponse,
  DeleteMessageResponse,
} from '@enctxt/shared';
import { api } from './api';

export const messageService = {
  sendMessage: (
    conversationId: string,
    input: SendMessageInput
  ): Promise<SendMessageResponse> => {
    return api.post<SendMessageResponse>(
      `/conversations/${conversationId}/messages`,
      input
    );
  },

  getMessages: (
    conversationId: string,
    limit = 50,
    before?: string
  ): Promise<MessageListResponse> => {
    const params = new URLSearchParams({
      limit: String(limit),
    });
    if (before) {
      params.append('before', before);
    }
    return api.get<MessageListResponse>(
      `/conversations/${conversationId}/messages?${params.toString()}`
    );
  },

  markRead: (
    conversationId: string,
    messageId?: string
  ): Promise<{ success: boolean }> => {
    return api.post<{ success: boolean }>(`/conversations/${conversationId}/read`, {
      messageId,
    });
  },

  /** Delete for everyone — only the sender may call this; the server enforces it too. */
  deleteMessage: (
    conversationId: string,
    messageId: string
  ): Promise<DeleteMessageResponse> => {
    return api.delete<DeleteMessageResponse>(
      `/conversations/${conversationId}/messages/${messageId}`
    );
  },
};

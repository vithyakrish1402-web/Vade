export type MessageStatus = 'sending' | 'sent' | 'delivered' | 'read' | 'failed';

export interface MessageItem {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  status?: MessageStatus;
  createdAt: string;
  updatedAt: string;
}

export interface SendMessageInput {
  content: string;
  tempId?: string; // Optional client-generated ID for optimistic tracking
}

export interface SendMessageResponse {
  message: MessageItem;
  tempId?: string;
}

export interface MessageListResponse {
  messages: MessageItem[];
  hasMore: boolean;
  nextCursor?: string;
  total?: number;
}

import type { EncryptedMessageEnvelope } from './crypto.js';

export type MessageStatus = 'sending' | 'sent' | 'delivered' | 'read' | 'failed';

export interface MessageItem {
  id: string;
  conversationId: string;
  senderId: string;
  ciphertext: string;
  nonce: string;
  senderKeyId: string;
  recipientKeyId: string;
  algorithm: string;
  version: number;
  aad?: string | null;
  createdAt: string;
  updatedAt: string;
  status?: MessageStatus;
}

export interface SendMessageInput {
  envelope: EncryptedMessageEnvelope;
  tempId?: string;
}

export interface SendMessageResponse {
  message: MessageItem;
}

export interface MessageListResponse {
  messages: MessageItem[];
  nextCursor?: string;
  hasMore: boolean;
}

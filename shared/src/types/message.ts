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
  /** Set once the sender deletes this message for everyone. `ciphertext`/`nonce` are wiped
   *  server-side at that point — clients must render a placeholder rather than attempt decryption. */
  deletedAt?: string | null;
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

export interface DeleteMessageResponse {
  success: boolean;
  deletedAt: string;
}

import type { MessageItem } from './message.js';

export type WSClientMessage =
  | { type: 'auth'; token?: string }
  | { type: 'subscribe'; conversationId: string }
  | { type: 'unsubscribe'; conversationId: string }
  | { type: 'message.send'; conversationId: string; content: string; tempId?: string }
  | { type: 'message.delivered'; messageId: string; conversationId: string }
  | { type: 'message.read'; conversationId: string; messageId?: string }
  | { type: 'ping' };

export type WSServerMessage =
  | { type: 'authenticated'; userId: string }
  | { type: 'subscribed'; conversationId: string }
  | { type: 'unsubscribed'; conversationId: string }
  | { type: 'message.created'; message: MessageItem; tempId?: string }
  | { type: 'message.delivered'; messageId: string; conversationId: string; deliveredAt: string }
  | { type: 'message.read'; conversationId: string; messageId?: string; readAt: string; readBy: string }
  | { type: 'pong' }
  | { type: 'error'; message: string; code?: string };

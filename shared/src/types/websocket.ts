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
  /** Sent to every member of the conversation — a delete is only ever sender-initiated
   *  ("delete for everyone"), so both sides must remove/replace the message locally. */
  | { type: 'message.deleted'; conversationId: string; messageId: string; deletedAt: string; deletedBy: string }
  /** Sent ONLY to the acting user's own other sessions/devices — clearing a chat is a private,
   *  per-user action and must never reach the other participant. */
  | { type: 'conversation.cleared'; conversationId: string; clearedAt: string }
  | { type: 'pong' }
  | { type: 'error'; message: string; code?: string };

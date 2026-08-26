export type ConversationType = 'DIRECT' | 'GROUP';

export interface ConversationParticipantSummary {
  userId: string;
  username: string;
  displayName: string;
  joinedAt: string;
}

export interface ConversationSummary {
  id: string;
  type: ConversationType;
  participants: ConversationParticipantSummary[];
  otherParticipant?: ConversationParticipantSummary;
  createdAt: string;
  updatedAt: string;
}

export interface CreateDirectConversationInput {
  recipientId?: string;
  recipientUsername?: string;
}

export interface ConversationListResponse {
  conversations: ConversationSummary[];
  total: number;
}

export interface ParticipantSummary {
  id: string;
  username: string;
  displayName: string;
}

export interface SingleConversationItem {
  id: string;
  createdAt: string;
  updatedAt: string;
  participant: ParticipantSummary;
}

export interface ConversationDetails {
  id: string;
  createdAt: string;
  updatedAt: string;
  participants: ParticipantSummary[];
}

export interface CreateConversationInput {
  userId?: string;
  recipientId?: string;
  recipientUsername?: string;
}

export interface CreateConversationResponse {
  conversation: SingleConversationItem;
}

export interface ConversationListResponse {
  conversations: SingleConversationItem[];
  total: number;
  page: number;
  limit: number;
}

export interface ConversationDetailResponse {
  conversation: ConversationDetails;
}

export interface ClearConversationResponse {
  success: boolean;
  clearedAt: string;
}

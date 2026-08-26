export interface UserSummary {
  id: string;
  username: string;
  displayName: string;
}

export interface UserProfile extends UserSummary {
  email: string;
  createdAt: string;
  updatedAt: string;
}

export interface UpdateProfileInput {
  displayName?: string;
  username?: string;
}

export interface UserSearchResponse {
  users: UserSummary[];
  total: number;
  page: number;
  limit: number;
}

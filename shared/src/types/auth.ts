import type { UserSummary } from './user.js';

export interface RegisterInput {
  username: string;
  email: string;
  password: string;
  displayName?: string;
}

export interface LoginInput {
  identifier: string; // username or email
  password: string;
}

export interface AuthResponse {
  authenticated: boolean;
  user: UserSummary;
}

export interface CurrentUserResponse {
  authenticated: boolean;
  user: UserSummary | null;
}

export interface LogoutResponse {
  message: string;
}

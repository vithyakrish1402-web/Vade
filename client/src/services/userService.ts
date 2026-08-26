import type { UserProfile, UpdateProfileInput, UserSearchResponse } from '@enctxt/shared';
import { api } from './api';

export const userService = {
  getProfile: (): Promise<UserProfile> => {
    return api.get<UserProfile>('/users/me');
  },

  updateProfile: (input: UpdateProfileInput): Promise<UserProfile> => {
    return api.patch<UserProfile>('/users/me', input);
  },

  searchUsers: (query: string, page = 1, limit = 20): Promise<UserSearchResponse> => {
    const params = new URLSearchParams({
      q: query,
      page: String(page),
      limit: String(limit),
    });
    return api.get<UserSearchResponse>(`/users/search?${params.toString()}`);
  },
};

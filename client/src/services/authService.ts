import type {
  RegisterInput,
  LoginInput,
  AuthResponse,
  CurrentUserResponse,
  LogoutResponse,
} from '@enctxt/shared';
import { api } from './api';

export const authService = {
  register: (input: RegisterInput): Promise<AuthResponse> => {
    return api.post<AuthResponse>('/auth/register', input);
  },

  login: (input: LoginInput): Promise<AuthResponse> => {
    return api.post<AuthResponse>('/auth/login', input);
  },

  getMe: (): Promise<CurrentUserResponse> => {
    return api.get<CurrentUserResponse>('/auth/me');
  },

  logout: (): Promise<LogoutResponse> => {
    return api.post<LogoutResponse>('/auth/logout');
  },
};

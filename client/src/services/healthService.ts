import type { HealthResponse } from '@enctxt/shared';
import { api } from './api';

export const healthService = {
  getHealth: async (): Promise<HealthResponse> => {
    return api.get<HealthResponse>('/health');
  },
};

import { useState, useEffect, useCallback } from 'react';
import type { HealthResponse } from '@enctxt/shared';
import { healthService } from '../services/healthService';
import { ApiClientError } from '../services/api';

export interface HealthCheckState {
  data: HealthResponse | null;
  isLoading: boolean;
  error: string | null;
  isConnected: boolean;
  lastChecked: Date | null;
  checkHealth: () => Promise<void>;
}

export function useHealthCheck(pollIntervalMs = 15000): HealthCheckState {
  const [data, setData] = useState<HealthResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);

  const checkHealth = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await healthService.getHealth();
      setData(result);
      setError(null);
    } catch (err) {
      setData(null);
      if (err instanceof ApiClientError) {
        setError(err.message);
      } else {
        setError('Server is currently unreachable');
      }
    } finally {
      setIsLoading(false);
      setLastChecked(new Date());
    }
  }, []);

  useEffect(() => {
    checkHealth();

    if (pollIntervalMs > 0) {
      const interval = setInterval(checkHealth, pollIntervalMs);
      return () => clearInterval(interval);
    }
  }, [checkHealth, pollIntervalMs]);

  return {
    data,
    isLoading,
    error,
    isConnected: !!data && data.status === 'ok',
    lastChecked,
    checkHealth,
  };
}

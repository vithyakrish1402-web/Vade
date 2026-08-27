import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../auth/AuthContext';
import { getProtectionStyle, setProtectionStyle } from '../utils/protectedText/protectionStylePreference';
import type { ProtectionMode } from '../utils/protectedText/protectedTextEngine';

/**
 * Exposes the current user's Protected Text rendering preference (Classic/Illusion/Pattern),
 * backed by local-only storage (see `protectionStylePreference.ts`). This is a client-side UI
 * preference — it is never synchronized through the server.
 */
export function useProtectionStyle() {
  const { user } = useAuth();
  const [mode, setMode] = useState<ProtectionMode>('HOMOGLYPH');

  const refresh = useCallback(() => {
    if (!user) {
      setMode('HOMOGLYPH');
      return;
    }
    setMode(getProtectionStyle(user.id));
  }, [user]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const updateMode = useCallback(
    (nextMode: ProtectionMode): boolean => {
      if (!user) return false;
      const success = setProtectionStyle(user.id, nextMode);
      if (success) {
        setMode(nextMode);
      }
      return success;
    },
    [user]
  );

  return { mode, setMode: updateMode };
}

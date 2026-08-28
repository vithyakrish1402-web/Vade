import { useEffect, useState } from 'react';
import { wsClient, type WSConnectionStatus } from '../services/websocket';

/**
 * The live socket state, for surfaces outside a conversation (the Messages banner).
 * Inside a thread, `useMessages` already reports the same value.
 */
export function useConnectionStatus(): WSConnectionStatus {
  const [status, setStatus] = useState<WSConnectionStatus>(() => wsClient.getStatus());

  useEffect(() => wsClient.addStatusListener(setStatus), []);

  return status;
}

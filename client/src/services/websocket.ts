import type { WSClientMessage, WSServerMessage } from '@enctxt/shared';

export type WSConnectionStatus = 'connected' | 'connecting' | 'reconnecting' | 'disconnected';

type WSEventListener = (event: WSServerMessage) => void;
type StatusListener = (status: WSConnectionStatus) => void;

class WebSocketClient {
  private static instance: WebSocketClient | null = null;
  private ws: WebSocket | null = null;
  private status: WSConnectionStatus = 'disconnected';
  private eventListeners: Set<WSEventListener> = new Set();
  private statusListeners: Set<StatusListener> = new Set();
  private activeSubscriptions: Set<string> = new Set();
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private isManuallyClosed = false;

  private constructor() {}

  static getInstance(): WebSocketClient {
    if (!WebSocketClient.instance) {
      WebSocketClient.instance = new WebSocketClient();
    }
    return WebSocketClient.instance;
  }

  getStatus(): WSConnectionStatus {
    return this.status;
  }

  private setStatus(newStatus: WSConnectionStatus) {
    this.status = newStatus;
    this.statusListeners.forEach((listener) => listener(newStatus));
  }

  connect(): void {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    this.isManuallyClosed = false;
    this.setStatus(this.reconnectAttempts > 0 ? 'reconnecting' : 'connecting');

    const apiUrl = import.meta.env.VITE_API_URL;
    let wsUrl: string;
    if (apiUrl) {
      // Derive the WebSocket origin from the configured API origin so the
      // client can connect to a backend hosted on a different domain.
      const apiOrigin = new URL(apiUrl, window.location.href);
      const protocol = apiOrigin.protocol === 'https:' ? 'wss:' : 'ws:';
      wsUrl = `${protocol}//${apiOrigin.host}/ws`;
    } else {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = window.location.hostname;
      // Connect to port 5000 in development or current origin in production
      const port = window.location.port === '5173' ? '5000' : window.location.port;
      wsUrl = `${protocol}//${host}${port ? `:${port}` : ''}/ws`;
    }

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        this.reconnectAttempts = 0;
        this.setStatus('connected');

        // Re-subscribe to all active conversations upon reconnect
        this.activeSubscriptions.forEach((conversationId) => {
          this.send({ type: 'subscribe', conversationId });
        });
      };

      this.ws.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data) as WSServerMessage;
          this.eventListeners.forEach((listener) => listener(parsed));
        } catch {
          // ignore malformed frame
        }
      };

      this.ws.onclose = () => {
        this.ws = null;
        if (!this.isManuallyClosed) {
          this.setStatus('disconnected');
          this.scheduleReconnect();
        } else {
          this.setStatus('disconnected');
        }
      };

      this.ws.onerror = () => {
        if (this.ws) {
          this.ws.close();
        }
      };
    } catch {
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer || this.isManuallyClosed) return;

    this.reconnectAttempts += 1;
    // Exponential backoff: 1s, 2s, 4s, max 10s
    const delay = Math.min(1000 * Math.pow(1.5, this.reconnectAttempts - 1), 10000);

    this.setStatus('reconnecting');
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  disconnect(): void {
    this.isManuallyClosed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.setStatus('disconnected');
  }

  subscribeConversation(conversationId: string): void {
    this.activeSubscriptions.add(conversationId);
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.send({ type: 'subscribe', conversationId });
    }
  }

  unsubscribeConversation(conversationId: string): void {
    this.activeSubscriptions.delete(conversationId);
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.send({ type: 'unsubscribe', conversationId });
    }
  }

  send(message: WSClientMessage): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  addEventListener(listener: WSEventListener): () => void {
    this.eventListeners.add(listener);
    return () => {
      this.eventListeners.delete(listener);
    };
  }

  addStatusListener(listener: StatusListener): () => void {
    this.statusListeners.add(listener);
    listener(this.status);
    return () => {
      this.statusListeners.delete(listener);
    };
  }
}

export const wsClient = WebSocketClient.getInstance();

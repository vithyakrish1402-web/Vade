import type { Server as HttpServer } from 'node:http';
import type { IncomingMessage } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import type { WSClientMessage, WSServerMessage } from '@enctxt/shared';
import { verifySessionToken } from '../utils/jwt.js';
import { hashSessionToken } from '../utils/crypto.js';
import { getPrismaClient } from './db.js';
import { ConversationService } from './conversationService.js';
import { logger } from '../utils/logger.js';
import { config } from '../config/env.js';

interface AuthenticatedSocket extends WebSocket {
  userId?: string;
  isAlive?: boolean;
  subscriptions?: Set<string>;
}

export class WebSocketService {
  private static instance: WebSocketService | null = null;
  private wss: WebSocketServer | null = null;
  private userSockets: Map<string, Set<AuthenticatedSocket>> = new Map();
  private conversationSockets: Map<string, Set<AuthenticatedSocket>> = new Map();
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;

  private constructor() {}

  static getInstance(): WebSocketService {
    if (!WebSocketService.instance) {
      WebSocketService.instance = new WebSocketService();
    }
    return WebSocketService.instance;
  }

  /**
   * Initializes the WebSocket server attached to an HTTP server.
   */
  initialize(server: HttpServer): WebSocketServer {
    return this.init(server);
  }

  init(server: HttpServer): WebSocketServer {
    // Limit maxPayload to 64KB for frame security
    this.wss = new WebSocketServer({
      server,
      path: '/ws',
      maxPayload: 64 * 1024,
    });

    this.wss.on('connection', async (ws: AuthenticatedSocket, req: IncomingMessage) => {
      ws.isAlive = true;
      ws.subscriptions = new Set<string>();

      ws.on('pong', () => {
        ws.isAlive = true;
      });

      // Attempt to authenticate from cookies during handshake
      const authenticatedUser = await this.authenticateRequest(req);
      if (authenticatedUser) {
        this.registerUserSocket(authenticatedUser.id, ws);
        this.send(ws, { type: 'authenticated', userId: authenticatedUser.id });
      }

      ws.on('message', async (data) => {
        try {
          const raw = data.toString();
          const parsed = JSON.parse(raw) as WSClientMessage;
          await this.handleClientMessage(ws, parsed);
        } catch (err: any) {
          logger.warn('Failed to parse WebSocket message frame', { error: err.message });
          this.send(ws, { type: 'error', message: 'Invalid message payload' });
        }
      });

      ws.on('close', () => {
        this.handleDisconnect(ws);
      });

      ws.on('error', (err) => {
        logger.warn('WebSocket client socket error', { error: err.message });
        this.handleDisconnect(ws);
      });
    });

    // Heartbeat interval (30s)
    this.heartbeatInterval = setInterval(() => {
      if (!this.wss) return;
      this.wss.clients.forEach((wsClient) => {
        const socket = wsClient as AuthenticatedSocket;
        if (socket.isAlive === false) {
          socket.terminate();
          return;
        }
        socket.isAlive = false;
        socket.ping();
      });
    }, 30000);

    this.wss.on('close', () => {
      if (this.heartbeatInterval) {
        clearInterval(this.heartbeatInterval);
        this.heartbeatInterval = null;
      }
    });

    logger.info('WebSocket server initialized on path /ws with 64KB max payload');
    return this.wss;
  }

  /**
   * Handles incoming client messages.
   */
  private async handleClientMessage(ws: AuthenticatedSocket, message: WSClientMessage): Promise<void> {
    switch (message.type) {
      case 'ping': {
        this.send(ws, { type: 'pong' });
        break;
      }

      case 'auth': {
        if (!message.token) {
          this.send(ws, { type: 'error', message: 'Authentication token required' });
          return;
        }
        const user = await this.authenticateToken(message.token);
        if (user) {
          this.registerUserSocket(user.id, ws);
          this.send(ws, { type: 'authenticated', userId: user.id });
        } else {
          this.send(ws, { type: 'error', message: 'Invalid authentication token', code: 'UNAUTHORIZED' });
        }
        break;
      }

      case 'subscribe': {
        if (!ws.userId) {
          this.send(ws, { type: 'error', message: 'Authentication required to subscribe', code: 'UNAUTHORIZED' });
          return;
        }

        const { isMember, conversationExists } = await ConversationService.verifyMembership(
          message.conversationId,
          ws.userId
        );

        if (!conversationExists) {
          this.send(ws, { type: 'error', message: 'Conversation not found', code: 'NOT_FOUND' });
          return;
        }

        if (!isMember) {
          this.send(ws, { type: 'error', message: 'Not authorized for this conversation', code: 'FORBIDDEN' });
          return;
        }

        this.subscribeToConversation(message.conversationId, ws);
        this.send(ws, { type: 'subscribed', conversationId: message.conversationId });
        break;
      }

      case 'unsubscribe': {
        this.unsubscribeFromConversation(message.conversationId, ws);
        this.send(ws, { type: 'unsubscribed', conversationId: message.conversationId });
        break;
      }

      case 'message.delivered': {
        if (!ws.userId) return;
        this.broadcastToConversation(
          message.conversationId,
          {
            type: 'message.delivered',
            messageId: message.messageId,
            conversationId: message.conversationId,
            deliveredAt: new Date().toISOString(),
          },
          ws
        );
        break;
      }

      case 'message.read': {
        if (!ws.userId) return;
        this.broadcastToConversation(
          message.conversationId,
          {
            type: 'message.read',
            conversationId: message.conversationId,
            messageId: message.messageId,
            readAt: new Date().toISOString(),
            readBy: ws.userId,
          },
          ws
        );
        break;
      }

      default:
        break;
    }
  }

  /**
   * Registers a socket for an authenticated user (supports multi-tab / multi-client).
   */
  private registerUserSocket(userId: string, socket: AuthenticatedSocket): void {
    socket.userId = userId;
    if (!this.userSockets.has(userId)) {
      this.userSockets.set(userId, new Set());
    }
    this.userSockets.get(userId)!.add(socket);
  }

  /**
   * Subscribes a socket to conversation room events.
   */
  private subscribeToConversation(conversationId: string, socket: AuthenticatedSocket): void {
    if (!this.conversationSockets.has(conversationId)) {
      this.conversationSockets.set(conversationId, new Set());
    }
    this.conversationSockets.get(conversationId)!.add(socket);
    socket.subscriptions?.add(conversationId);
  }

  /**
   * Unsubscribes a socket from a conversation room.
   */
  private unsubscribeFromConversation(conversationId: string, socket: AuthenticatedSocket): void {
    const subs = this.conversationSockets.get(conversationId);
    if (subs) {
      subs.delete(socket);
      if (subs.size === 0) {
        this.conversationSockets.delete(conversationId);
      }
    }
    socket.subscriptions?.delete(conversationId);
  }

  /**
   * Cleans up state when a socket disconnects.
   */
  private handleDisconnect(socket: AuthenticatedSocket): void {
    if (socket.userId) {
      const userSocketsSet = this.userSockets.get(socket.userId);
      if (userSocketsSet) {
        userSocketsSet.delete(socket);
        if (userSocketsSet.size === 0) {
          this.userSockets.delete(socket.userId);
        }
      }
    }

    if (socket.subscriptions) {
      socket.subscriptions.forEach((convId) => {
        this.unsubscribeFromConversation(convId, socket);
      });
    }
  }

  /**
   * Broadcasts an event to all subscribers in a conversation room.
   */
  broadcastToConversation(
    conversationId: string,
    event: WSServerMessage,
    excludeSocket?: WebSocket
  ): void {
    const sockets = this.conversationSockets.get(conversationId);
    if (!sockets) return;

    const payload = JSON.stringify(event);
    sockets.forEach((ws) => {
      if (ws !== excludeSocket && ws.readyState === WebSocket.OPEN) {
        ws.send(payload);
      }
    });
  }

  /**
   * Sends an event to all active sockets of a specific user.
   */
  sendToUser(userId: string, event: WSServerMessage): void {
    const sockets = this.userSockets.get(userId);
    if (!sockets) return;

    const payload = JSON.stringify(event);
    sockets.forEach((ws) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(payload);
      }
    });
  }

  /**
   * Sends an event to all active sockets of all conversation members.
   */
  sendToMembers(memberUserIds: string[], event: WSServerMessage, excludeSocket?: WebSocket): void {
    const payload = JSON.stringify(event);
    memberUserIds.forEach((userId) => {
      const sockets = this.userSockets.get(userId);
      if (!sockets) return;
      sockets.forEach((ws) => {
        if (ws !== excludeSocket && ws.readyState === WebSocket.OPEN) {
          ws.send(payload);
        }
      });
    });
  }

  private send(ws: WebSocket, message: WSServerMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  /**
   * Authenticates an incoming HTTP upgrade request using cookies.
   */
  private async authenticateRequest(
    req: IncomingMessage
  ): Promise<{ id: string; username: string } | null> {
    try {
      const cookieHeader = req.headers.cookie;
      if (!cookieHeader) return null;

      const cookies = Object.fromEntries(
        cookieHeader.split(';').map((c) => {
          const [k, ...v] = c.trim().split('=');
          return [k, decodeURIComponent(v.join('='))];
        })
      );

      const token = cookies[config.SESSION_COOKIE_NAME];
      if (!token) return null;

      return await this.authenticateToken(token);
    } catch {
      return null;
    }
  }

  /**
   * Verifies JWT session token and confirms database session validity.
   */
  private async authenticateToken(
    token: string
  ): Promise<{ id: string; username: string } | null> {
    try {
      const payload = verifySessionToken(token);
      const tokenHash = hashSessionToken(token);
      const prisma = getPrismaClient();

      const session = await prisma.session.findUnique({
        where: { tokenHash },
        include: {
          user: {
            select: { id: true, username: true },
          },
        },
      });

      if (!session || session.expiresAt < new Date()) {
        return null;
      }

      return {
        id: session.user.id,
        username: session.user.username,
      };
    } catch {
      return null;
    }
  }

  /**
   * Gracefully drains and closes all active WebSocket connections on server shutdown.
   */
  async close(): Promise<void> {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    if (!this.wss) return;

    logger.info('Draining active WebSocket connections...');
    const closePromises: Promise<void>[] = [];

    this.wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        closePromises.push(
          new Promise<void>((resolve) => {
            client.close(1001, 'Server shutting down');
            client.once('close', () => resolve());
            setTimeout(resolve, 2000); // 2s per-socket timeout
          })
        );
      }
    });

    await Promise.all(closePromises);

    return new Promise((resolve) => {
      this.wss?.close(() => {
        this.reset();
        this.wss = null;
        resolve();
      });
    });
  }

  /**
   * Resets all internal state (useful in test setups).
   */
  reset(): void {
    this.userSockets.clear();
    this.conversationSockets.clear();
  }
}

export const wsService = WebSocketService.getInstance();

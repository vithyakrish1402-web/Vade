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
import {
  buildOriginPolicy,
  evaluateOrigin,
  NATIVE_CLIENT_HEADER,
  type OriginPolicy,
} from '../config/origins.js';

interface AuthenticatedSocket extends WebSocket {
  userId?: string;
  /**
   * Database session this socket authenticated with. Phase 0B — Increment 1.
   *
   * Previously a socket retained only `userId`, which made it impossible to answer the
   * question that actually matters — "is the session behind this socket still valid?" —
   * and therefore impossible to revoke a specific session's sockets without tearing down
   * every socket the user has open.
   */
  sessionId?: string;
  /**
   * Cleared the moment the backing session is known to be invalid. Checked immediately
   * before every outbound delivery, so a socket cannot receive protected data in the
   * window between invalidation and the TCP close completing.
   */
  isAuthorized?: boolean;
  isAlive?: boolean;
  subscriptions?: Set<string>;
}

/** Close code sent when a socket is torn down because its session is no longer valid. */
export const WS_CLOSE_SESSION_REVOKED = 4001;

/** How often the defense-in-depth session sweep runs. */
const SESSION_REVALIDATION_INTERVAL_MS = 60_000;

export class WebSocketService {
  private static instance: WebSocketService | null = null;
  private wss: WebSocketServer | null = null;
  private userSockets: Map<string, Set<AuthenticatedSocket>> = new Map();
  private conversationSockets: Map<string, Set<AuthenticatedSocket>> = new Map();
  /**
   * Session id -> sockets authenticated with it. Lets logout and session revocation
   * terminate exactly the affected sockets in O(1), without walking every connection and
   * without disturbing the user's other sessions.
   */
  private sessionSockets: Map<string, Set<AuthenticatedSocket>> = new Map();
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private revalidationInterval: ReturnType<typeof setInterval> | null = null;
  private originPolicy: OriginPolicy | null = null;

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

  /**
   * Origin policy used by the handshake. Injectable purely so that production semantics
   * are directly testable; production always resolves it from config.
   */
  setOriginPolicy(policy: OriginPolicy | null): void {
    this.originPolicy = policy;
  }

  private resolveOriginPolicy(): OriginPolicy {
    if (!this.originPolicy) {
      this.originPolicy = buildOriginPolicy({
        corsOrigin: config.CORS_ORIGIN,
        allowedOrigins: config.ALLOWED_ORIGINS,
        nodeEnv: config.NODE_ENV,
      });
    }
    return this.originPolicy;
  }

  /**
   * Decides whether a WebSocket upgrade may proceed, based on the browser origin that
   * initiated it.
   *
   * This is a SEPARATE security boundary from CORS, which does not apply to WebSocket
   * handshakes at all. Without it, a `SameSite=None` session cookie is attached to an
   * upgrade initiated by any website, and the resulting socket is a fully authenticated
   * one — which for Vade means a live feed of the victim's ciphertext, since messages are
   * pushed to every socket registered for a user regardless of subscription.
   *
   * Exported behaviour, in order:
   *  - A present Origin must match the allowlist exactly. Browsers always send Origin on
   *    a WebSocket handshake and page script cannot alter it, so this is decisive.
   *  - An absent Origin means a non-browser client (OkHttp does not send one). It is
   *    accepted in production only when the native-client header is present, and outside
   *    production unconditionally, so local tooling and the test suite keep working.
   */
  isHandshakeOriginAllowed(req: IncomingMessage, policy?: OriginPolicy): boolean {
    const effectivePolicy = policy ?? this.resolveOriginPolicy();
    const headerValue = (name: string): string | undefined => {
      const raw = req.headers[name];
      return Array.isArray(raw) ? raw[0] : raw;
    };

    const decision = evaluateOrigin(
      {
        origin: headerValue('origin'),
        referer: headerValue('referer'),
        nativeClient: headerValue(NATIVE_CLIENT_HEADER),
      },
      effectivePolicy
    );

    if (!decision.allowed) {
      logger.warn('Rejected WebSocket handshake from untrusted origin', {
        event: 'ws_origin_rejected',
        reason: decision.reason,
        origin: headerValue('origin') ?? null,
      });
      return false;
    }

    return true;
  }

  init(server: HttpServer): WebSocketServer {
    // Limit maxPayload to 64KB for frame security
    this.wss = new WebSocketServer({
      server,
      path: '/ws',
      maxPayload: 64 * 1024,
      // Enforced during the handshake, before the socket exists and therefore before any
      // authentication or event delivery can occur. Rejecting here (rather than closing
      // after connect) means an untrusted origin never reaches an authenticated state.
      verifyClient: (info: { origin: string; req: IncomingMessage; secure: boolean }) =>
        this.isHandshakeOriginAllowed(info.req),
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
        this.registerUserSocket(authenticatedUser.id, authenticatedUser.sessionId, ws);
        this.send(ws, { type: 'authenticated', userId: authenticatedUser.id });

        // Closes a narrow TOCTOU window: the session is read during authentication, but
        // the socket only enters the delivery registries a few statements later. A logout
        // landing in between would have called closeSession() while this socket was still
        // invisible to it, leaving a live socket on a dead session. Re-checking after
        // registration means such a socket is torn down immediately instead of surviving
        // until the next revalidation sweep.
        await this.revokeIfSessionGone(authenticatedUser.sessionId);
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

    // Defense-in-depth session sweep. Bounded by design: it short-circuits when no socket
    // is open, and otherwise issues exactly one indexed query per sweep no matter how many
    // sockets there are. unref() so it never holds the process open on its own.
    this.revalidationInterval = setInterval(() => {
      void this.revalidateSessions().catch(() => {
        /* revalidateSessions already logs and fails safe */
      });
    }, SESSION_REVALIDATION_INTERVAL_MS);
    this.revalidationInterval.unref?.();

    this.wss.on('close', () => {
      if (this.heartbeatInterval) {
        clearInterval(this.heartbeatInterval);
        this.heartbeatInterval = null;
      }
      if (this.revalidationInterval) {
        clearInterval(this.revalidationInterval);
        this.revalidationInterval = null;
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
          this.registerUserSocket(user.id, user.sessionId, ws);
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

      // Receipt frames are authorized against conversation membership, not merely against
      // "this socket is authenticated" (audit finding H-5). Previously any authenticated
      // user could name any conversationId and have a forged delivered/read receipt
      // broadcast into that conversation's room.
      case 'message.delivered': {
        if (!(await this.isAuthorizedForConversation(ws, message.conversationId))) return;
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
        if (!(await this.isAuthorizedForConversation(ws, message.conversationId))) return;
        this.broadcastToConversation(
          message.conversationId,
          {
            type: 'message.read',
            conversationId: message.conversationId,
            messageId: message.messageId,
            readAt: new Date().toISOString(),
            readBy: ws.userId!,
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
   * Whether this socket may act on the named conversation: it must still be an authorized
   * authenticated socket, and its user must actually be a member.
   *
   * `ws.userId` is server-assigned at authentication time and is never read from the
   * frame, so a client cannot nominate whose behalf it is acting on.
   */
  private async isAuthorizedForConversation(
    ws: AuthenticatedSocket,
    conversationId: string
  ): Promise<boolean> {
    if (!ws.userId || ws.isAuthorized !== true) return false;
    if (typeof conversationId !== 'string' || conversationId === '') return false;

    const { isMember } = await ConversationService.verifyMembership(conversationId, ws.userId);
    if (!isMember) {
      logger.warn('Blocked WebSocket frame for a conversation the socket is not a member of', {
        event: 'ws_conversation_authorization_rejected',
        userId: ws.userId,
        conversationId,
      });
      return false;
    }
    return true;
  }

  /**
   * Registers a socket for an authenticated user (supports multi-tab / multi-client) and
   * indexes it by the session that authenticated it.
   *
   * The session index is what makes revocation enforceable: without it, "log this session
   * out" could only be approximated by closing every socket the user has, which would sign
   * out their other devices and tabs as a side effect.
   */
  private registerUserSocket(
    userId: string,
    sessionId: string,
    socket: AuthenticatedSocket
  ): void {
    // Re-authenticating an existing socket (the `auth` frame path) must not leave it
    // indexed under its previous session.
    if (socket.sessionId && socket.sessionId !== sessionId) {
      this.removeFromSessionIndex(socket);
    }

    socket.userId = userId;
    socket.sessionId = sessionId;
    socket.isAuthorized = true;

    if (!this.userSockets.has(userId)) {
      this.userSockets.set(userId, new Set());
    }
    this.userSockets.get(userId)!.add(socket);

    if (!this.sessionSockets.has(sessionId)) {
      this.sessionSockets.set(sessionId, new Set());
    }
    this.sessionSockets.get(sessionId)!.add(socket);
  }

  private removeFromSessionIndex(socket: AuthenticatedSocket): void {
    if (!socket.sessionId) return;
    const set = this.sessionSockets.get(socket.sessionId);
    if (!set) return;
    set.delete(socket);
    if (set.size === 0) this.sessionSockets.delete(socket.sessionId);
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
    socket.isAuthorized = false;

    if (socket.userId) {
      const userSocketsSet = this.userSockets.get(socket.userId);
      if (userSocketsSet) {
        userSocketsSet.delete(socket);
        if (userSocketsSet.size === 0) {
          this.userSockets.delete(socket.userId);
        }
      }
    }

    this.removeFromSessionIndex(socket);

    if (socket.subscriptions) {
      socket.subscriptions.forEach((convId) => {
        this.unsubscribeFromConversation(convId, socket);
      });
    }
  }

  // ===========================================================================
  // Session invalidation (Phase 0B — Increment 1)
  //
  // Model: event-driven termination is primary, a periodic sweep is defense in depth,
  // and an authorization check immediately before every outbound write is the backstop.
  //
  // Event-driven is primary because the server already knows the exact moment a session
  // stops being valid — it is the code deleting the row. Waiting for a poll to notice
  // would leave a window in which a revoked session still receives ciphertext, and the
  // whole point of this increment is to close that window.
  // ===========================================================================

  /**
   * Immediately revokes every socket authenticated with `sessionId`.
   *
   * De-authorizes before closing: `close()` completes asynchronously, so without clearing
   * the flag first a delivery racing in the same tick could still reach the socket.
   * Returns the number of sockets revoked, which lets callers log and tests assert.
   */
  closeSession(sessionId: string, reason = 'Session revoked'): number {
    const sockets = this.sessionSockets.get(sessionId);
    if (!sockets || sockets.size === 0) return 0;

    // Snapshot: handleDisconnect mutates the live set as each socket closes.
    const targets = Array.from(sockets);
    for (const socket of targets) {
      socket.isAuthorized = false;
      try {
        socket.close(WS_CLOSE_SESSION_REVOKED, reason);
      } catch {
        /* already closing */
      }
      // Drop from the delivery registries synchronously rather than waiting for the
      // 'close' event, so nothing can be routed to this socket in the interim.
      this.handleDisconnect(socket);
    }

    logger.info('Revoked WebSocket sockets for session', {
      event: 'ws_session_revoked',
      sessionCount: targets.length,
    });

    return targets.length;
  }

  /**
   * Revokes every socket belonging to a user, across all of their sessions. Intended for
   * a global "sign out everywhere" action; not used by ordinary logout, which must leave
   * the user's other sessions alone.
   */
  closeAllSessionsForUser(userId: string, reason = 'Session revoked'): number {
    const sockets = this.userSockets.get(userId);
    if (!sockets || sockets.size === 0) return 0;

    const sessionIds = new Set<string>();
    for (const socket of sockets) {
      if (socket.sessionId) sessionIds.add(socket.sessionId);
    }

    let revoked = 0;
    for (const sessionId of sessionIds) {
      revoked += this.closeSession(sessionId, reason);
    }
    return revoked;
  }

  /**
   * Re-reads one session and revokes its sockets if it is gone or expired.
   *
   * Fails SAFE on a database error, for the same reason the sweep does: a transient fault
   * must not disconnect a legitimately authenticated user. The sweep is the backstop.
   */
  private async revokeIfSessionGone(sessionId: string): Promise<void> {
    try {
      const prisma = getPrismaClient();
      const session = await prisma.session.findUnique({
        where: { id: sessionId },
        select: { id: true, expiresAt: true },
      });
      if (!session || session.expiresAt <= new Date()) {
        this.closeSession(sessionId, 'Session expired or revoked');
      }
    } catch {
      /* fail safe — the periodic sweep will catch it */
    }
  }

  /**
   * Number of currently authorized sockets registered for a user. Observability, and the
   * assertion surface for "a rejected or revoked socket is not in the delivery registry".
   */
  getSocketCountForUser(userId: string): number {
    const sockets = this.userSockets.get(userId);
    if (!sockets) return 0;
    let count = 0;
    for (const socket of sockets) {
      if (socket.isAuthorized === true) count += 1;
    }
    return count;
  }

  /** Total authorized sockets across all users. */
  getTotalAuthorizedSocketCount(): number {
    let count = 0;
    for (const sockets of this.userSockets.values()) {
      for (const socket of sockets) {
        if (socket.isAuthorized === true) count += 1;
      }
    }
    return count;
  }

  /**
   * Defense-in-depth sweep: re-checks every session currently backing a socket and tears
   * down any whose row has disappeared or expired.
   *
   * This catches invalidation paths that do not (or cannot) call closeSession — a session
   * expiring on the clock, a row deleted by another process or by hand, or a future code
   * path that forgets to notify. It is a single indexed query per sweep regardless of how
   * many sockets are open, and it runs only while sockets exist, so it is bounded work on
   * a fixed interval rather than a polling loop.
   *
   * Public so tests can drive it deterministically instead of waiting on a timer.
   */
  async revalidateSessions(): Promise<number> {
    const sessionIds = Array.from(this.sessionSockets.keys());
    if (sessionIds.length === 0) return 0;

    let validSessionIds: Set<string>;
    try {
      const prisma = getPrismaClient();
      const rows = await prisma.session.findMany({
        where: { id: { in: sessionIds } },
        select: { id: true, expiresAt: true },
      });

      const now = new Date();
      validSessionIds = new Set(
        rows.filter((row) => row.expiresAt > now).map((row) => row.id)
      );
    } catch (error) {
      // Fail SAFE, not closed: a transient database error must not sign every connected
      // user out. The next sweep retries, and event-driven revocation is unaffected.
      logger.warn('WebSocket session revalidation skipped due to database error', {
        event: 'ws_session_revalidation_error',
        error: error instanceof Error ? error.message : 'unknown',
      });
      return 0;
    }

    let revoked = 0;
    for (const sessionId of sessionIds) {
      if (!validSessionIds.has(sessionId)) {
        revoked += this.closeSession(sessionId, 'Session expired or revoked');
      }
    }

    if (revoked > 0) {
      logger.info('Revoked WebSocket sockets during session revalidation sweep', {
        event: 'ws_session_revalidation_revoked',
        socketCount: revoked,
      });
    }

    return revoked;
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
      if (ws !== excludeSocket) this.deliver(ws, payload);
    });
  }

  /**
   * Sends an event to all active sockets of a specific user.
   */
  sendToUser(userId: string, event: WSServerMessage): void {
    const sockets = this.userSockets.get(userId);
    if (!sockets) return;

    const payload = JSON.stringify(event);
    sockets.forEach((ws) => this.deliver(ws, payload));
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
        if (ws !== excludeSocket) this.deliver(ws, payload);
      });
    });
  }

  /**
   * The single write path for protected outbound data — every broadcast, fan-out, and
   * per-user send funnels through here.
   *
   * Subscription membership is NOT the authorization boundary: sendToMembers reaches every
   * socket registered for a user regardless of what it subscribed to, so the check has to
   * live at the socket. A socket delivers only while it is both open and still backed by a
   * session the server considers valid.
   */
  private deliver(ws: AuthenticatedSocket, payload: string): boolean {
    if (ws.readyState !== WebSocket.OPEN) return false;
    if (ws.isAuthorized !== true) return false;
    ws.send(payload);
    return true;
  }

  /**
   * Sends a control frame (pong, error, handshake acknowledgement) to one socket.
   *
   * Deliberately not gated on `isAuthorized`: these frames carry no user data, and an
   * unauthenticated socket must still be able to receive the error telling it so.
   */
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
  ): Promise<{ id: string; username: string; sessionId: string } | null> {
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
  ): Promise<{ id: string; username: string; sessionId: string } | null> {
    try {
      // The JWT verification result is now enforced (audit finding M-9). It was previously
      // computed and discarded, which meant the WebSocket path accepted a token whose
      // signature was invalid or expired so long as its hash matched a live session row —
      // notably, a JWT_SECRET rotation invalidated HTTP sessions but not WebSocket ones.
      // requireAuth has always rejected on this; the two paths now agree.
      const payload = verifySessionToken(token);
      if (!payload) return null;

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
        sessionId: session.id,
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
    if (this.revalidationInterval) {
      clearInterval(this.revalidationInterval);
      this.revalidationInterval = null;
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
    this.sessionSockets.clear();
    // Drop any injected origin policy so a test that overrode it cannot leak that
    // override into the next test; the next handshake re-resolves from config.
    this.originPolicy = null;
  }
}

export const wsService = WebSocketService.getInstance();

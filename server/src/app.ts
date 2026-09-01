import express, { type Express } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { config } from './config/env.js';
import { buildOriginPolicy, type OriginPolicy } from './config/origins.js';
import { createProxyTopologyProbe, resolveTrustedProxyHops } from './config/trustProxy.js';
import { securityHeaders } from './middleware/securityHeaders.js';
import { createOriginGuard } from './middleware/originGuard.js';
import { requestLogger } from './middleware/requestLogger.js';
import { notFoundHandler } from './middleware/notFoundHandler.js';
import { errorHandler } from './middleware/errorHandler.js';
import apiRouter from './routes/index.js';

export interface CreateAppOptions {
  /**
   * Overrides the browser-origin trust boundary. Production never passes this; it exists
   * so the test suite can exercise production semantics without the process itself
   * running in production mode.
   */
  originPolicy?: OriginPolicy;
  /**
   * Overrides how many reverse-proxy hops Express trusts when resolving `req.ip`.
   * Production never passes this; it exists so the test suite can exercise the deployed
   * proxy topology without the process itself running in production mode.
   */
  trustedProxyHops?: number;
}

export function createApp(options: CreateAppOptions = {}): Express {
  const app = express();

  // Client-IP resolution behind Render's reverse proxy (Phase 0B — Increment 2, H-6).
  //
  // Must be set before any middleware reads `req.ip`. A numeric hop count is used rather
  // than `true` on purpose: `true` resolves `req.ip` to the left-most X-Forwarded-For
  // entry, which the client writes, making every IP-keyed control forgeable. See
  // config/trustProxy.ts for the full derivation and for why under-counting is the safe
  // direction to err in.
  const trustedProxyHops =
    options.trustedProxyHops ??
    resolveTrustedProxyHops({ raw: config.TRUST_PROXY_HOPS, nodeEnv: config.NODE_ENV });
  app.set('trust proxy', trustedProxyHops);

  // Makes the hop count above falsifiable in production rather than assumed. Logs once.
  app.use(createProxyTopologyProbe(trustedProxyHops));

  // Single source of truth for the browser-origin trust boundary, shared with the
  // WebSocket handshake. Outside production this also admits the localhost dev origins;
  // in production it contains exactly what CORS_ORIGIN/ALLOWED_ORIGINS declare.
  const originPolicy =
    options.originPolicy ??
    buildOriginPolicy({
      corsOrigin: config.CORS_ORIGIN,
      allowedOrigins: config.ALLOWED_ORIGINS,
      nodeEnv: config.NODE_ENV,
    });

  // Security headers
  app.use(securityHeaders);

  // CORS & cookies.
  //
  // CORS governs whether a cross-origin *response* may be read; it is not a CSRF defense
  // and never was, which is why createOriginGuard() below exists. Its role here is to
  // refuse the preflight for any untrusted origin, which is what makes the JSON
  // content-type requirement in the guard an effective second barrier.
  app.use(
    cors({
      origin: Array.from(originPolicy.allowed),
      credentials: true,
    })
  );
  // CSRF boundary. Mounted ahead of the body parser and of every route: an untrusted
  // cross-site request is refused on its headers alone, so its body is never even parsed,
  // and coverage cannot be forgotten on a route added later.
  app.use(createOriginGuard({ policy: originPolicy }));

  app.use(cookieParser());
  app.use(express.json({ limit: '1mb' }));

  // NOTE: express.urlencoded is deliberately NOT mounted. This API accepts JSON only, and
  // a form-encoded body parser is precisely what allows a cross-origin HTML form POST — a
  // CORS "simple" request that triggers no preflight — to reach a handler. Nothing in the
  // web client, the Android client, or the test suite sends form-encoded bodies.

  // Request logging
  app.use(requestLogger);

  // Mount API routes under /api
  app.use('/api', apiRouter);

  // 404 handler
  app.use(notFoundHandler);

  // Centralized error handler
  app.use(errorHandler);

  return app;
}

import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { AppError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import {
  buildOriginPolicy,
  evaluateOrigin,
  NATIVE_CLIENT_HEADER,
  type OriginPolicy,
} from '../config/origins.js';
import { config } from '../config/env.js';

/**
 * CSRF defense for cookie-authenticated state-changing requests (Phase 0B — Increment 0).
 *
 * Vade's session cookie is `SameSite=None; Secure` in production because the client
 * (Vercel) and the API (Render) are different sites, so `Lax` would strip the cookie from
 * every authenticated fetch. That is the correct call for the deployment — but it removes
 * the browser's own CSRF defense, and nothing had replaced it. Any third-party page could
 * therefore issue an authenticated state-changing request on a victim's behalf, the worst
 * case being a silent overwrite of the victim's published E2EE identity key.
 *
 * Two independent barriers are enforced here, either of which is sufficient on its own:
 *
 *   1. ORIGIN VALIDATION. Browsers attach `Origin` to every cross-site state-changing
 *      request and it is a forbidden header name, so page script cannot set, alter, or
 *      suppress it. An exact match against the allowlist is therefore a complete answer
 *      to browser-borne CSRF.
 *
 *   2. CONTENT-TYPE ENFORCEMENT. The only request a cross-origin page can send *without*
 *      a CORS preflight is a "simple" one, which is limited to form, multipart, and plain
 *      text bodies. Requiring `application/json` means every cross-origin attempt must
 *      first pass a preflight that the CORS allowlist refuses. (`express.urlencoded` has
 *      also been removed from the stack, so a form body no longer even parses.)
 *
 * Safe methods are untouched: GET and HEAD must remain usable for ordinary navigation and
 * data loading, and they perform no state change. OPTIONS is left to the CORS layer.
 */

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Content types a cross-origin page can send without a preflight. Each of these is a CSRF
 * delivery vehicle and none is a legitimate Vade API request body.
 */
const FORBIDDEN_REQUEST_CONTENT_TYPES = [
  'application/x-www-form-urlencoded',
  'multipart/form-data',
  'text/plain',
];

export function isStateChangingMethod(method: string): boolean {
  return !SAFE_METHODS.has(method.toUpperCase());
}

function firstHeaderValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

/**
 * Extracts the media type from a Content-Type header, discarding parameters such as
 * `; charset=utf-8` and normalizing case, so that `Application/JSON; charset=UTF-8`
 * and `application/json` compare equal.
 */
function parseMediaType(headerValue: string | undefined): string | null {
  if (!headerValue) return null;
  const mediaType = headerValue.split(';')[0]?.trim().toLowerCase();
  return mediaType && mediaType !== '' ? mediaType : null;
}

function isAcceptableContentType(mediaType: string | null, hasBody: boolean): boolean {
  // A bodyless state-changing request (e.g. POST /devices/:id/revoke, DELETE) legitimately
  // carries no Content-Type. It is still fully covered by the Origin check above it.
  if (mediaType === null) return !hasBody;

  if (FORBIDDEN_REQUEST_CONTENT_TYPES.includes(mediaType)) return false;

  // Allowlist rather than blocklist: `application/json` and its `+json` structured suffix
  // are the only body formats this API accepts.
  return mediaType === 'application/json' || mediaType.endsWith('+json');
}

/**
 * Whether the request appears to carry a body at all. Used only to permit a completely
 * empty state-changing request through the content-type check.
 */
function requestHasBody(req: Request): boolean {
  const contentLength = firstHeaderValue(req.headers['content-length']);
  if (contentLength !== undefined && contentLength !== '' && contentLength !== '0') return true;
  return firstHeaderValue(req.headers['transfer-encoding']) !== undefined;
}

export interface OriginGuardOptions {
  policy?: OriginPolicy;
}

/**
 * Builds the guard. The policy is injectable so that production semantics can be tested
 * directly without needing the process to actually be running in production.
 */
export function createOriginGuard(options: OriginGuardOptions = {}): RequestHandler {
  const policy =
    options.policy ??
    buildOriginPolicy({
      corsOrigin: config.CORS_ORIGIN,
      allowedOrigins: config.ALLOWED_ORIGINS,
      nodeEnv: config.NODE_ENV,
    });

  return function originGuard(req: Request, _res: Response, next: NextFunction): void {
    if (!isStateChangingMethod(req.method)) {
      return next();
    }

    const decision = evaluateOrigin(
      {
        origin: firstHeaderValue(req.headers.origin),
        referer: firstHeaderValue(req.headers.referer),
        nativeClient: firstHeaderValue(req.headers[NATIVE_CLIENT_HEADER]),
      },
      policy
    );

    if (!decision.allowed) {
      // The rejected origin is logged because it is genuinely useful for detecting an
      // active CSRF campaign. Nothing about the session or the body is logged with it.
      logger.warn('Blocked cross-site state-changing request', {
        event: 'csrf_origin_rejected',
        reason: decision.reason,
        method: req.method,
        path: req.path,
        origin: firstHeaderValue(req.headers.origin) ?? null,
      });
      return next(
        AppError.forbidden('Request origin is not permitted for this operation')
      );
    }

    const mediaType = parseMediaType(firstHeaderValue(req.headers['content-type']));
    if (!isAcceptableContentType(mediaType, requestHasBody(req))) {
      logger.warn('Blocked state-changing request with non-JSON content type', {
        event: 'csrf_content_type_rejected',
        method: req.method,
        path: req.path,
        contentType: mediaType,
      });
      return next(
        new AppError(
          415,
          'UNSUPPORTED_MEDIA_TYPE',
          'State-changing requests must use application/json'
        )
      );
    }

    next();
  };
}

import crypto from 'node:crypto';
import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { AppError } from '../utils/errors.js';
import { clientIpKey } from '../config/trustProxy.js';

interface RateLimitRecord {
  count: number;
  resetAt: number;
}

export interface RateLimiterOptions {
  /** Diagnostic label. Never sent to clients. */
  name: string;
  windowMs: number;
  max: number;
  /**
   * Derives the bucket this request belongs to. Returning `null` skips limiting entirely —
   * used when the dimension is absent (e.g. a login body with no identifier), which the
   * request validator will reject on its own merits a moment later.
   */
  keyFor: (req: Request) => string | null;
  /**
   * When set, the request is *checked* on the way in but only *counted* on the way out, and
   * only for responses this predicate accepts. Lets a limiter count failed attempts without
   * spending a legitimate user's budget on their successful ones.
   */
  countWhen?: (res: Response) => boolean;
  /**
   * Bound on tracked buckets, so a dimension an attacker can enumerate (an identifier, say)
   * cannot grow the process's memory without limit.
   */
  maxKeys?: number;
}

/**
 * Uniform client-facing message. Every limiter in this file returns exactly this text and
 * exactly this error code, so a 429 never reveals *which* dimension tripped, whether the
 * submitted account exists, or anything else about authentication state.
 */
const RATE_LIMIT_MESSAGE = 'Too many authentication attempts. Please try again later.';

const DEFAULT_MAX_KEYS = 10_000;

export interface RateLimiterHandle extends RequestHandler {
  /** Drops all tracked buckets. Exists so tests start from a known state. */
  reset(): void;
}

const registry = new Set<RateLimiterHandle>();

/** Clears every limiter's state. Used by the test harness between cases. */
export function resetRateLimiters(): void {
  for (const limiter of registry) {
    limiter.reset();
  }
}

/**
 * Hashes a bucket dimension that may carry user-supplied text (an account identifier), so
 * the in-memory store never holds credential-adjacent plaintext for the life of a window.
 */
export function hashDimension(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex').slice(0, 32);
}

export function createRateLimiter(options: RateLimiterOptions): RateLimiterHandle {
  const store = new Map<string, RateLimitRecord>();
  const maxKeys = options.maxKeys ?? DEFAULT_MAX_KEYS;

  const purgeExpired = (now: number): void => {
    for (const [key, record] of store.entries()) {
      if (record.resetAt <= now) store.delete(key);
    }
  };

  setInterval(() => purgeExpired(Date.now()), 60_000).unref();

  const admit = (key: string, now: number): void => {
    if (store.size >= maxKeys) {
      purgeExpired(now);
    }
    if (store.size >= maxKeys) {
      // Still full: evict the bucket closest to expiring. An attacker who churns keys can
      // therefore displace a tracked bucket, but only within this limiter's dimension — the
      // per-IP limiter on the same route is unaffected and still holds.
      let oldestKey: string | null = null;
      let oldestResetAt = Infinity;
      for (const [candidate, record] of store.entries()) {
        if (record.resetAt < oldestResetAt) {
          oldestResetAt = record.resetAt;
          oldestKey = candidate;
        }
      }
      if (oldestKey !== null) store.delete(oldestKey);
    }
    store.set(key, { count: 1, resetAt: now + options.windowMs });
  };

  const consume = (key: string): void => {
    const now = Date.now();
    const record = store.get(key);
    if (!record || record.resetAt <= now) {
      admit(key, now);
      return;
    }
    record.count += 1;
  };

  const middleware = ((req: Request, res: Response, next: NextFunction): void => {
    const dimension = options.keyFor(req);
    if (dimension === null) {
      return next();
    }

    const key = `${options.name}:${dimension}`;
    const now = Date.now();
    const record = store.get(key);
    const active = record && record.resetAt > now ? record : null;

    if (active && active.count >= options.max) {
      const retryAfterSeconds = Math.max(1, Math.ceil((active.resetAt - now) / 1000));
      res.setHeader('Retry-After', String(retryAfterSeconds));
      return next(
        new AppError(429, 'INVALID_REQUEST', RATE_LIMIT_MESSAGE, true, {
          retryAfter: retryAfterSeconds,
        })
      );
    }

    if (options.countWhen) {
      // Deferred counting: spend budget only on responses the predicate accepts.
      res.on('finish', () => {
        if (options.countWhen!(res)) consume(key);
      });
      return next();
    }

    if (active) {
      active.count += 1;
    } else {
      admit(key, now);
    }
    next();
  }) as RateLimiterHandle;

  middleware.reset = () => store.clear();
  registry.add(middleware);
  return middleware;
}

/** Bucket key for the resolved client address. See config/trustProxy.ts for how it is resolved. */
const byClientIp = (req: Request): string => clientIpKey(req);

/**
 * Bucket key for the account being logged into. Absent or malformed identifiers are not
 * tracked — validation rejects those requests anyway, and tracking them would let an
 * attacker fill the store with garbage keys.
 */
const byLoginIdentifier = (req: Request): string | null => {
  const identifier = (req.body as { identifier?: unknown } | undefined)?.identifier;
  if (typeof identifier !== 'string') return null;
  const normalised = identifier.trim().toLowerCase().slice(0, 255);
  if (normalised === '') return null;
  return hashDimension(normalised);
};

/**
 * Registration abuse, per client address.
 *
 * Deliberately a separate bucket from login: sharing one budget across both — the previous
 * behaviour — meant a burst of sign-ups locked existing users out of logging in, which is
 * a lockout with no security benefit.
 */
export const registerIpRateLimiter = createRateLimiter({
  name: 'auth:register:ip',
  windowMs: 60 * 60 * 1000,
  max: 20,
  keyFor: byClientIp,
});

/**
 * Login abuse, per client address. Counts every attempt, successful or not: a single
 * address driving this many logins is the credential-stuffing shape regardless of outcome.
 * Sized to leave room for shared egress addresses (office or carrier NAT).
 */
export const loginIpRateLimiter = createRateLimiter({
  name: 'auth:login:ip',
  windowMs: 15 * 60 * 1000,
  max: 30,
  keyFor: byClientIp,
});

/**
 * Login abuse, per targeted account — the dimension a *distributed* brute force does not
 * get to change by rotating source addresses.
 *
 * Counts only 401s, so a legitimate user's successful logins never spend this budget. The
 * short window is deliberate: it caps sustained guessing at ~4 attempts/minute/account
 * while keeping the worst case an attacker can inflict on a targeted user — a lockout held
 * open by continuous wrong-password traffic — bounded to five minutes rather than fifteen.
 *
 * No authentication oracle: the bucket is keyed on the submitted identifier whether or not
 * that account exists, and the 429 body is byte-identical to every other limiter's.
 */
export const loginIdentifierRateLimiter = createRateLimiter({
  name: 'auth:login:identifier',
  windowMs: 5 * 60 * 1000,
  max: 20,
  keyFor: byLoginIdentifier,
  countWhen: (res) => res.statusCode === 401,
});

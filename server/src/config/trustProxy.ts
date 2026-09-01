import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { logger } from '../utils/logger.js';

/**
 * Client-IP resolution behind Render's reverse proxy (Phase 0B — Increment 2, finding H-6).
 *
 * ## The problem
 *
 * Express never had `trust proxy` set, so `req.ip` resolved to the address of the TCP peer —
 * which behind Render is Render's own load balancer, not the client. Every request in the
 * fleet therefore shared one rate-limit bucket: 30 requests exhausted the login budget for
 * *every* user. A per-client control was, in production, a global self-DoS.
 *
 * ## Why not `trust proxy: true`
 *
 * `true` trusts the entire forwarded chain, which makes `req.ip` the **left-most**
 * `X-Forwarded-For` entry. That entry is written by whoever spoke first — i.e. by the
 * client. Any attacker can then mint an arbitrary client identity per request and evade
 * every IP-keyed limit, or pin the identity of a third party. Verified directly against
 * this project's Express version: with `X-Forwarded-For: 9.9.9.9, 8.8.8.8, 7.7.7.7`,
 * `trust proxy: true` yields `req.ip === '9.9.9.9'` (fully attacker-supplied) while
 * `trust proxy: 1` yields `'7.7.7.7'` (the entry appended by the nearest proxy).
 *
 * ## Why a hop count, and why under-counting is the safe direction
 *
 * A numeric `trust proxy` value of `n` resolves `req.ip` to the n-th address from the
 * right of `[...X-Forwarded-For, socketPeer]`. Each proxy appends the address it received
 * the connection *from*, so the right-most `X-Forwarded-For` entry is written by the
 * outermost proxy and records the real client. Attacker-supplied entries can only ever sit
 * further **left**, so they are unreachable as long as `n` is not larger than the real hop
 * count.
 *
 * The two failure directions are therefore not symmetric:
 *
 * - **Over-counting** (n larger than reality) reaches into attacker-controlled text →
 *   spoofable client identity. Fail-open. Unacceptable.
 * - **Under-counting** (n smaller than reality) resolves to a fixed proxy address →
 *   buckets collapse, i.e. the H-6 self-DoS returns. Fail-closed. Bad, but not a bypass.
 *
 * So the default is the smallest value that can possibly be correct for a TLS-terminating
 * platform proxy: **one hop**. `TRUST_PROXY_HOPS` exists so the value can be corrected from
 * configuration once the real chain length is observed in production (audit item G-2),
 * without a code change — and it is bounded so a typo cannot widen trust arbitrarily.
 *
 * NOT VERIFIED: Render's actual forwarded-chain length has not been measured. If Render
 * forwards through two hops, this configuration is under-counting and per-IP buckets will
 * collapse to Render's inner proxy address. That is the fail-closed direction, and
 * `describeProxyChain()` exists to make it observable.
 */

/** Smallest value that can be correct behind a TLS-terminating platform proxy. */
export const DEFAULT_PRODUCTION_TRUSTED_HOPS = 1;

/**
 * Upper bound on configurable trust. Nothing in this deployment has a legitimate reason to
 * trust a chain this long; the cap exists so a configuration mistake cannot silently become
 * the `trust proxy: true` failure mode described above.
 */
export const MAX_TRUSTED_HOPS = 3;

export interface ResolveTrustedProxyHopsInput {
  /** Raw `TRUST_PROXY_HOPS` value, if configured. */
  raw?: string;
  nodeEnv: string;
}

/**
 * Resolves the number of reverse-proxy hops Express may trust.
 *
 * Outside production the app is reached directly (dev server, test harness, emulator), so
 * nothing may be trusted: forwarding headers are ignored entirely and `req.ip` is the real
 * socket peer. Trusting a hop there would let anything on the machine forge a client IP.
 */
export function resolveTrustedProxyHops({ raw, nodeEnv }: ResolveTrustedProxyHopsInput): number {
  const isProduction = nodeEnv === 'production';

  if (raw === undefined || raw.trim() === '') {
    return isProduction ? DEFAULT_PRODUCTION_TRUSTED_HOPS : 0;
  }

  const parsed = Number(raw.trim());
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > MAX_TRUSTED_HOPS) {
    throw new Error(
      `TRUST_PROXY_HOPS must be an integer between 0 and ${MAX_TRUSTED_HOPS}; received "${raw}"`
    );
  }

  if (isProduction && parsed === 0) {
    // Zero hops in production is the exact H-6 misconfiguration: every client collapses
    // into Render's load-balancer address and one attacker can exhaust everyone's budget.
    throw new Error(
      'TRUST_PROXY_HOPS must be at least 1 in production; 0 collapses every client into the proxy address'
    );
  }

  return parsed;
}

/**
 * Stable rate-limit key for the resolved client.
 *
 * Uses `req.ip`, which Express derives from the `trust proxy` setting above — so this is
 * only as trustworthy as that setting, and deliberately has no independent header parsing
 * of its own. A second, hand-rolled reading of `X-Forwarded-For` is precisely how limiters
 * acquire a spoofable side door.
 *
 * IPv4-mapped IPv6 forms are normalised so one client cannot occupy two buckets by
 * arriving over a dual-stack socket.
 */
export function clientIpKey(req: Request): string {
  const raw = req.ip ?? req.socket.remoteAddress ?? '';
  if (raw === '') return 'unknown';
  const normalised = raw.startsWith('::ffff:') ? raw.slice('::ffff:'.length) : raw;
  return normalised.toLowerCase();
}

/**
 * Non-identifying description of the forwarded chain, for confirming the configured hop
 * count against production reality (audit item G-2) without logging client addresses.
 *
 * `forwardedHops` is how many addresses the chain actually carries; if that is consistently
 * larger than the configured trust, `TRUST_PROXY_HOPS` is under-counting.
 */
export function describeProxyChain(req: Request): {
  forwardedHops: number;
  resolvedFromSocketPeer: boolean;
} {
  const header = req.headers['x-forwarded-for'];
  const values = Array.isArray(header) ? header.join(',') : (header ?? '');
  const forwardedHops = values
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry !== '').length;

  return {
    forwardedHops,
    resolvedFromSocketPeer: (req.ip ?? '') === (req.socket.remoteAddress ?? ''),
  };
}

/**
 * One-shot startup probe that records the shape of the forwarded chain the very first
 * request arrives with, so audit item G-2 — what Render actually forwards — can be closed
 * from production logs instead of from assumption.
 *
 * Logs only a hop *count* and a boolean, never an address: enough to tell whether the
 * configured trust matches reality, and nothing that identifies a client.
 */
export function createProxyTopologyProbe(configuredHops: number): RequestHandler {
  let logged = false;

  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!logged) {
      logged = true;
      const chain = describeProxyChain(req);
      logger.info('Proxy topology observed on first request', {
        configuredTrustedHops: configuredHops,
        forwardedHops: chain.forwardedHops,
        resolvedFromSocketPeer: chain.resolvedFromSocketPeer,
        // forwardedHops > configuredTrustedHops means the configuration is UNDER-counting:
        // req.ip is a proxy address and every client shares one rate-limit bucket (H-6).
        underCounting: chain.forwardedHops > configuredHops,
      });
    }
    next();
  };
}

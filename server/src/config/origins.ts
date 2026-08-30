/**
 * Browser-origin trust boundary (Phase 0B — Increment 0).
 *
 * This module is the single source of truth for "which browser origins may drive an
 * authenticated Vade session". It backs three separate enforcement points that must never
 * be allowed to drift apart:
 *
 *   1. CORS            — governs whether a cross-origin *response* may be read.
 *   2. originGuard     — governs whether a state-changing *request* may execute at all.
 *   3. WebSocket       — governs whether an upgrade handshake is accepted.
 *
 * CORS is emphatically NOT a CSRF defense: a browser will happily *send* a cross-site
 * request and let the server act on it, then merely withhold the response from the
 * attacker's script. And CORS does not apply to WebSocket handshakes at all. Points 2
 * and 3 exist precisely because point 1 does not cover them.
 */

export interface OriginPolicy {
  /** Exact, normalized origins permitted to drive authenticated sessions. */
  allowed: ReadonlySet<string>;
  /**
   * Whether a request carrying no Origin and no Referer may proceed on the strength of
   * the native-client header alone. True outside production so that curl, supertest, and
   * the Android emulator work; false in production, where the header is mandatory.
   */
  allowHeaderlessNonBrowser: boolean;
  /** True in production. Controls fail-closed behaviour on an unparseable configuration. */
  isProduction: boolean;
}

/**
 * Header that non-browser clients (Android/OkHttp) send to identify themselves.
 *
 * A browser cannot forge this on a cross-site request: any custom header promotes the
 * request out of the CORS "simple request" category and forces a preflight, which our
 * CORS allowlist refuses for untrusted origins — so the actual request is never sent.
 * That makes this header a genuine second CSRF defense, not merely a marker.
 */
export const NATIVE_CLIENT_HEADER = 'x-vade-client';

/**
 * Reduces any origin-ish string to its canonical `scheme://host[:port]` form, or null if
 * it is not a usable absolute origin.
 *
 * Parsing via the URL constructor rather than string manipulation is deliberate. Prefix
 * and suffix matching on raw strings is the classic source of origin-check bypasses
 * (`https://vade.app.evil.com` passing an `endsWith` test, `https://vade.app.evil.com`
 * passing a `startsWith` test on the scheme, and so on). Every comparison downstream of
 * this function is an exact match on the normalized value.
 */
export function normalizeOrigin(value: string | undefined | null): string | null {
  if (!value) return null;

  const trimmed = value.trim();
  // The literal string "null" is what a browser sends for an opaque origin — sandboxed
  // iframes, data: URLs, some redirect chains. It is never a trusted Vade origin, and it
  // must not be confused with "no Origin header at all", which is the native-client case.
  if (trimmed === '' || trimmed.toLowerCase() === 'null') return null;

  try {
    const url = new URL(trimmed);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    // url.host includes the port when one is present and omits it when it is the default
    // for the scheme, which is exactly the normalization the Origin header itself uses.
    return `${url.protocol}//${url.host}`.toLowerCase();
  } catch {
    return null;
  }
}

/** Origins that only ever make sense while developing against a local dev server. */
const LOCAL_DEVELOPMENT_ORIGINS = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
];

export interface BuildOriginPolicyInput {
  corsOrigin: string;
  /** Optional comma-separated additional origins (e.g. a preview deployment). */
  allowedOrigins?: string;
  nodeEnv: 'development' | 'production' | 'test';
}

/**
 * Builds the effective policy for an environment.
 *
 * The production branch deliberately does NOT append the localhost origins. They were
 * previously baked into the CORS allowlist unconditionally, which meant production
 * trusted `http://localhost:5173` — harmless in isolation, but it is exactly the kind of
 * standing exception that turns into a bypass once anything else relaxes.
 */
export function buildOriginPolicy(input: BuildOriginPolicyInput): OriginPolicy {
  const isProduction = input.nodeEnv === 'production';
  const allowed = new Set<string>();

  const configured = [input.corsOrigin, ...(input.allowedOrigins ?? '').split(',')];
  for (const candidate of configured) {
    const normalized = normalizeOrigin(candidate);
    if (normalized) allowed.add(normalized);
  }

  if (!isProduction) {
    for (const devOrigin of LOCAL_DEVELOPMENT_ORIGINS) {
      const normalized = normalizeOrigin(devOrigin);
      if (normalized) allowed.add(normalized);
    }
  }

  return {
    allowed,
    allowHeaderlessNonBrowser: !isProduction,
    isProduction,
  };
}

export type OriginDecision =
  | { allowed: true; reason: 'trusted-origin' | 'trusted-referer' | 'non-browser-client' }
  | { allowed: false; reason: 'untrusted-origin' | 'untrusted-referer' | 'missing-origin' };

export interface OriginCheckInput {
  origin?: string | undefined;
  referer?: string | undefined;
  /** Raw value of the native-client header, if the caller sent one. */
  nativeClient?: string | undefined;
}

/**
 * The single decision procedure shared by the HTTP guard and the WebSocket handshake.
 *
 * Order is load-bearing:
 *
 *  1. A *present* Origin is always decisive. If it is present and untrusted the request is
 *     refused outright — no header, no Referer, and no environment setting can rescue it.
 *     This is what makes the native-client escape hatch safe: a browser always attaches
 *     Origin to a cross-site state-changing request, so an attacker page can never reach
 *     the headerless branch below.
 *  2. Referer is consulted only when Origin is absent, as a strictly narrower fallback.
 *  3. Only a request with neither header may fall through to the native-client path, and
 *     in production that path additionally demands the custom header.
 */
export function evaluateOrigin(input: OriginCheckInput, policy: OriginPolicy): OriginDecision {
  const rawOrigin = input.origin;

  if (rawOrigin !== undefined && rawOrigin !== null && rawOrigin.trim() !== '') {
    const normalized = normalizeOrigin(rawOrigin);
    // A present-but-unparseable Origin (including the opaque "null" origin) is a refusal,
    // never a fall-through. Treating it as "absent" would hand an attacker a bypass via
    // any context that produces an opaque origin, such as a sandboxed iframe.
    if (!normalized) return { allowed: false, reason: 'untrusted-origin' };
    if (policy.allowed.has(normalized)) return { allowed: true, reason: 'trusted-origin' };
    return { allowed: false, reason: 'untrusted-origin' };
  }

  const rawReferer = input.referer;
  if (rawReferer !== undefined && rawReferer !== null && rawReferer.trim() !== '') {
    const normalized = normalizeOrigin(rawReferer);
    if (!normalized) return { allowed: false, reason: 'untrusted-referer' };
    if (policy.allowed.has(normalized)) return { allowed: true, reason: 'trusted-referer' };
    return { allowed: false, reason: 'untrusted-referer' };
  }

  // Neither header present. This is unreachable for a browser-issued state-changing
  // request or WebSocket handshake; it means a native client, a server-to-server caller,
  // or local tooling.
  const hasNativeClientHeader =
    typeof input.nativeClient === 'string' && input.nativeClient.trim() !== '';

  if (hasNativeClientHeader) return { allowed: true, reason: 'non-browser-client' };
  if (policy.allowHeaderlessNonBrowser) return { allowed: true, reason: 'non-browser-client' };

  return { allowed: false, reason: 'missing-origin' };
}

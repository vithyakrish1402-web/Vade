import { describe, it, expect } from 'vitest';
import {
  buildOriginPolicy,
  evaluateOrigin,
  normalizeOrigin,
} from '../src/config/origins.js';

/**
 * Unit-level adversarial coverage of the origin trust boundary (Phase 0B — Increment 0).
 *
 * These assert the decision procedure directly, which is the only way to exercise
 * PRODUCTION semantics — the process running the test suite is not, and must not be, in
 * production mode. The integration tests in csrfOriginGuard.test.ts and
 * websocketOrigin.test.ts then confirm the same procedure is actually wired in.
 */

const PROD_POLICY = buildOriginPolicy({
  corsOrigin: 'https://app.vade.example',
  allowedOrigins: 'https://preview.vade.example',
  nodeEnv: 'production',
});

const DEV_POLICY = buildOriginPolicy({
  corsOrigin: 'http://localhost:5173',
  nodeEnv: 'development',
});

describe('normalizeOrigin — parsing cannot be tricked into widening the boundary', () => {
  it('canonicalizes scheme and host casing', () => {
    expect(normalizeOrigin('HTTPS://APP.VADE.EXAMPLE')).toBe('https://app.vade.example');
  });

  it('preserves an explicit non-default port as part of the identity', () => {
    expect(normalizeOrigin('http://localhost:5173')).toBe('http://localhost:5173');
    // A different port is a different origin and must not normalize together.
    expect(normalizeOrigin('http://localhost:5174')).not.toBe(normalizeOrigin('http://localhost:5173'));
  });

  it('drops a redundant default port so it matches the browser-sent form', () => {
    expect(normalizeOrigin('https://app.vade.example:443')).toBe('https://app.vade.example');
  });

  it('strips any path, query, or fragment an attacker appends', () => {
    expect(normalizeOrigin('https://app.vade.example/../evil')).toBe('https://app.vade.example');
    expect(normalizeOrigin('https://app.vade.example?x=1#y')).toBe('https://app.vade.example');
  });

  it('rejects the opaque "null" origin rather than treating it as absent', () => {
    expect(normalizeOrigin('null')).toBeNull();
    expect(normalizeOrigin('NULL')).toBeNull();
  });

  it('rejects non-http(s) schemes', () => {
    expect(normalizeOrigin('file:///etc/passwd')).toBeNull();
    expect(normalizeOrigin('javascript:alert(1)')).toBeNull();
    expect(normalizeOrigin('data:text/html,x')).toBeNull();
    expect(normalizeOrigin('ftp://app.vade.example')).toBeNull();
  });

  it('rejects empty and unparseable values', () => {
    expect(normalizeOrigin('')).toBeNull();
    expect(normalizeOrigin('   ')).toBeNull();
    expect(normalizeOrigin('not a url')).toBeNull();
    expect(normalizeOrigin(undefined)).toBeNull();
  });
});

describe('Origin allowlist — substring/prefix/suffix confusion is not possible', () => {
  // Each of these passes a naive startsWith/endsWith/includes check against
  // "https://app.vade.example" and must nonetheless be refused.
  const CONFUSABLE_ORIGINS = [
    'https://app.vade.example.evil.com',
    'https://evil-app.vade.example.attacker.net',
    'https://app.vade.example.co',
    'https://notapp.vade.example',
    'http://app.vade.example', // scheme downgrade
    'https://app.vade.example:8443', // port swap
    'https://xn--app-vade-example.evil', // punycode lookalike
    'https://app.vade.example@evil.com', // userinfo confusion — real host is evil.com
  ];

  for (const origin of CONFUSABLE_ORIGINS) {
    it(`refuses lookalike origin ${origin}`, () => {
      const decision = evaluateOrigin({ origin }, PROD_POLICY);
      expect(decision.allowed).toBe(false);
    });
  }

  it('accepts only the exact configured origin', () => {
    expect(evaluateOrigin({ origin: 'https://app.vade.example' }, PROD_POLICY)).toEqual({
      allowed: true,
      reason: 'trusted-origin',
    });
  });

  it('accepts an additional origin declared via ALLOWED_ORIGINS', () => {
    expect(evaluateOrigin({ origin: 'https://preview.vade.example' }, PROD_POLICY).allowed).toBe(true);
  });
});

describe('Production policy — localhost is never trusted', () => {
  it('refuses the localhost dev origins in production', () => {
    expect(evaluateOrigin({ origin: 'http://localhost:5173' }, PROD_POLICY).allowed).toBe(false);
    expect(evaluateOrigin({ origin: 'http://127.0.0.1:5173' }, PROD_POLICY).allowed).toBe(false);
  });

  it('trusts the localhost dev origins outside production', () => {
    expect(evaluateOrigin({ origin: 'http://localhost:5173' }, DEV_POLICY).allowed).toBe(true);
    expect(evaluateOrigin({ origin: 'http://127.0.0.1:5173' }, DEV_POLICY).allowed).toBe(true);
  });

  it('still refuses an arbitrary malicious origin in development', () => {
    // Development is more permissive about *missing* origins, never about wrong ones.
    expect(evaluateOrigin({ origin: 'https://evil.com' }, DEV_POLICY).allowed).toBe(false);
  });
});

describe('Missing-origin handling — the native-client escape hatch cannot be abused', () => {
  it('rejects a request with no Origin, no Referer, and no client header in production', () => {
    expect(evaluateOrigin({}, PROD_POLICY)).toEqual({ allowed: false, reason: 'missing-origin' });
  });

  it('accepts a headerless request in production only with the native-client header', () => {
    const decision = evaluateOrigin({ nativeClient: 'android' }, PROD_POLICY);
    expect(decision).toEqual({ allowed: true, reason: 'non-browser-client' });
  });

  it('accepts a headerless request outside production, for local tooling and tests', () => {
    expect(evaluateOrigin({}, DEV_POLICY).allowed).toBe(true);
  });

  it('CRITICAL: the native-client header cannot rescue a malicious Origin', () => {
    // This is the property that makes the escape hatch safe. A browser always attaches
    // Origin to a cross-site state-changing request, so an attacker page can only ever
    // reach the "present but untrusted origin" branch — which is decisive and final.
    const decision = evaluateOrigin(
      { origin: 'https://evil.com', nativeClient: 'android' },
      PROD_POLICY
    );
    expect(decision).toEqual({ allowed: false, reason: 'untrusted-origin' });
  });

  it('CRITICAL: an opaque "null" Origin is refused, not treated as a missing header', () => {
    // A sandboxed iframe sends Origin: null. If that were collapsed into the
    // missing-origin branch it would inherit the permissive development behaviour.
    expect(evaluateOrigin({ origin: 'null' }, DEV_POLICY).allowed).toBe(false);
    expect(evaluateOrigin({ origin: 'null' }, PROD_POLICY).allowed).toBe(false);
  });

  it('an empty Origin header string falls through to the missing-origin rules', () => {
    expect(evaluateOrigin({ origin: '' }, PROD_POLICY).allowed).toBe(false);
    expect(evaluateOrigin({ origin: '', nativeClient: 'android' }, PROD_POLICY).allowed).toBe(true);
  });
});

describe('Referer fallback — narrower than Origin, never wider', () => {
  it('accepts a trusted Referer when Origin is absent', () => {
    const decision = evaluateOrigin(
      { referer: 'https://app.vade.example/messages/123' },
      PROD_POLICY
    );
    expect(decision).toEqual({ allowed: true, reason: 'trusted-referer' });
  });

  it('rejects an untrusted Referer when Origin is absent', () => {
    expect(evaluateOrigin({ referer: 'https://evil.com/attack' }, PROD_POLICY).allowed).toBe(false);
  });

  it('CRITICAL: a trusted Referer cannot override an untrusted Origin', () => {
    const decision = evaluateOrigin(
      { origin: 'https://evil.com', referer: 'https://app.vade.example/' },
      PROD_POLICY
    );
    expect(decision).toEqual({ allowed: false, reason: 'untrusted-origin' });
  });

  it('an untrusted Referer is not rescued by the native-client header', () => {
    const decision = evaluateOrigin(
      { referer: 'https://evil.com/', nativeClient: 'android' },
      PROD_POLICY
    );
    expect(decision.allowed).toBe(false);
  });
});

describe('Policy construction', () => {
  it('discards unparseable configured origins rather than trusting them verbatim', () => {
    const policy = buildOriginPolicy({
      corsOrigin: 'https://app.vade.example',
      allowedOrigins: 'not-a-url, , javascript:alert(1)',
      nodeEnv: 'production',
    });
    expect(policy.allowed.has('https://app.vade.example')).toBe(true);
    expect(policy.allowed.size).toBe(1);
  });

  it('never yields a wildcard entry', () => {
    const policy = buildOriginPolicy({
      corsOrigin: '*',
      allowedOrigins: '*',
      nodeEnv: 'production',
    });
    expect(policy.allowed.has('*')).toBe(false);
    expect(policy.allowed.size).toBe(0);
    // With an empty allowlist the boundary fails closed: nothing browser-borne is trusted.
    expect(evaluateOrigin({ origin: 'https://anything.example' }, policy).allowed).toBe(false);
  });
});

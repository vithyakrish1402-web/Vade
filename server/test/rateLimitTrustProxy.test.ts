import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { buildOriginPolicy } from '../src/config/origins.js';
import {
  DEFAULT_PRODUCTION_TRUSTED_HOPS,
  MAX_TRUSTED_HOPS,
  createProxyTopologyProbe,
  resolveTrustedProxyHops,
} from '../src/config/trustProxy.js';
import { createRateLimiter } from '../src/middleware/rateLimiter.js';

/**
 * Trust-proxy and rate-limiting coverage (Phase 0B — Increment 2, finding H-6).
 *
 * H-6: `trust proxy` was never set, so behind Render `req.ip` was the load balancer's
 * address and every client in the fleet shared one rate-limit bucket — 30 requests locked
 * *everyone* out of logging in. The fix has to satisfy two properties at once, and both
 * are asserted below rather than assumed:
 *
 *   1. Buckets are per client. One client exhausting its budget must not touch another's.
 *   2. A client cannot choose which bucket it lands in by writing forwarding headers.
 *
 * The app under test is built with `trustedProxyHops: 1`, the deployed configuration, so
 * these run against the real Express stack under production proxy semantics. Supertest
 * connects over loopback, which stands in for Render's proxy: the `X-Forwarded-For` entry
 * a test sets last is the one the proxy would have appended, i.e. the real client address.
 */

const CLIENT_A = '203.0.113.10';
const CLIENT_B = '198.51.100.22';

/** Deployed configuration. */
const proxiedApp = createApp({ trustedProxyHops: 1 });

const LOGIN_IP_MAX = 30;
const LOGIN_IDENTIFIER_MAX = 20;

function login(forwardedFor: string, identifier: string, password = 'WrongPassword123!') {
  return request(proxiedApp)
    .post('/api/auth/login')
    .set('X-Forwarded-For', forwardedFor)
    .send({ identifier, password });
}

function register(forwardedFor: string, username: string) {
  return request(proxiedApp)
    .post('/api/auth/register')
    .set('X-Forwarded-For', forwardedFor)
    .send({
      username,
      email: `${username}@example.com`,
      password: 'Password123!',
      displayName: username,
    });
}

/**
 * Burns a client's login budget without touching the per-identifier limiter, by using a
 * fresh identifier each time. Keeps the two dimensions independently observable.
 */
async function exhaustLoginIpBudget(forwardedFor: string, tag: string) {
  for (let i = 0; i < LOGIN_IP_MAX; i += 1) {
    const res = await login(forwardedFor, `${tag}-nobody-${i}`);
    expect(res.status, `attempt ${i} should still be within budget`).toBe(401);
  }
}

describe('trust proxy — hop count resolution', () => {
  it('defaults to exactly one trusted hop in production', () => {
    expect(resolveTrustedProxyHops({ nodeEnv: 'production' })).toBe(
      DEFAULT_PRODUCTION_TRUSTED_HOPS
    );
    expect(DEFAULT_PRODUCTION_TRUSTED_HOPS).toBe(1);
  });

  it('trusts nothing outside production, where the app is reached directly', () => {
    expect(resolveTrustedProxyHops({ nodeEnv: 'development' })).toBe(0);
    expect(resolveTrustedProxyHops({ nodeEnv: 'test' })).toBe(0);
    expect(resolveTrustedProxyHops({ raw: '  ', nodeEnv: 'development' })).toBe(0);
  });

  it('accepts an explicit hop count within bounds', () => {
    expect(resolveTrustedProxyHops({ raw: '2', nodeEnv: 'production' })).toBe(2);
    expect(resolveTrustedProxyHops({ raw: '0', nodeEnv: 'development' })).toBe(0);
  });

  it('CRITICAL: refuses a hop count that would widen trust beyond the deployment', () => {
    for (const raw of [String(MAX_TRUSTED_HOPS + 1), '99', '-1', '1.5', 'true', 'all']) {
      expect(() => resolveTrustedProxyHops({ raw, nodeEnv: 'production' })).toThrow(
        /TRUST_PROXY_HOPS/
      );
    }
  });

  it('CRITICAL: refuses zero hops in production — that is the H-6 misconfiguration itself', () => {
    expect(() => resolveTrustedProxyHops({ raw: '0', nodeEnv: 'production' })).toThrow(
      /at least 1 in production/
    );
  });

  it('applies the resolved hop count to the Express app', () => {
    expect(createApp({ trustedProxyHops: 1 }).get('trust proxy')).toBe(1);
    // Under NODE_ENV=test the app is reached directly, so nothing is trusted by default.
    expect(createApp().get('trust proxy')).toBe(0);
  });
});

describe('trust proxy — client IP resolution under the deployed topology', () => {
  /**
   * Mirrors app.ts's `trust proxy` setting on a bare app so the resolved address itself can
   * be read, rather than inferred from limiter behaviour. `configured` is the same value
   * app.ts passes to `app.set`.
   */
  function ipProbe(configured: number | boolean) {
    const probe = express();
    probe.set('trust proxy', configured);
    probe.get('/ip', (req, res) => {
      res.json({ ip: req.ip });
    });
    return probe;
  }

  it('resolves the address the nearest proxy appended, not the one the client wrote', async () => {
    const res = await request(ipProbe(1))
      .get('/ip')
      .set('X-Forwarded-For', `${CLIENT_B}, ${CLIENT_A}`);

    // CLIENT_A is the right-most entry, i.e. the one the proxy appended: the real peer.
    expect(res.body.ip).toBe(CLIENT_A);
  });

  it('ignores forwarding headers entirely when no hop is trusted', async () => {
    const res = await request(ipProbe(0)).get('/ip').set('X-Forwarded-For', CLIENT_B);
    expect(res.body.ip).not.toBe(CLIENT_B);
    expect(res.body.ip).toMatch(/127\.0\.0\.1$/);
  });

  it('SENTINEL: documents why `trust proxy: true` is not used', async () => {
    // With `true`, the left-most — entirely client-written — entry becomes req.ip. This
    // assertion exists so that switching the configuration to `true` breaks a test rather
    // than silently making every IP-keyed control forgeable.
    const res = await request(ipProbe(true))
      .get('/ip')
      .set('X-Forwarded-For', `${CLIENT_B}, ${CLIENT_A}`);
    expect(res.body.ip).toBe(CLIENT_B);

    expect(createApp({ trustedProxyHops: 1 }).get('trust proxy')).not.toBe(true);
  });
});

describe('login rate limiting — buckets are per client', () => {
  it('CRITICAL: one client exhausting its budget does not block another client', async () => {
    await exhaustLoginIpBudget(CLIENT_A, 'a');

    // Client A is now over budget.
    const blocked = await login(CLIENT_A, 'a-nobody-final');
    expect(blocked.status).toBe(429);

    // Client B has spent nothing and must be unaffected. Before H-6 was fixed this was a
    // 429: every client shared the proxy's single bucket.
    const other = await login(CLIENT_B, 'b-nobody-1');
    expect(other.status).toBe(401);
  });

  it('allows a client its full budget before refusing', async () => {
    await exhaustLoginIpBudget(CLIENT_A, 'budget');
    const over = await login(CLIENT_A, 'budget-nobody-final');
    expect(over.status).toBe(429);
  });

  it('CRITICAL: a forged X-Forwarded-For prefix does not move the attacker to a fresh bucket', async () => {
    await exhaustLoginIpBudget(CLIENT_A, 'forge');
    expect((await login(CLIENT_A, 'forge-check')).status).toBe(429);

    // The attacker prepends addresses of their choosing. Everything they write lands to the
    // LEFT of the entry the proxy appends, so it cannot reach req.ip at one trusted hop.
    for (const forged of [
      `${CLIENT_B}, ${CLIENT_A}`,
      `10.0.0.1, 8.8.8.8, ${CLIENT_A}`,
      `${CLIENT_A}, ${CLIENT_A}`,
    ]) {
      const res = await login(forged, 'forge-evade');
      expect(res.status, `forged chain "${forged}" escaped the limiter`).toBe(429);
    }
  });

  it('CRITICAL: a forged header cannot spend a third-party budget either', async () => {
    // The mirror image of evasion: an attacker claiming to *be* CLIENT_B must not be able
    // to burn CLIENT_B's budget from their own address.
    for (let i = 0; i < LOGIN_IP_MAX + 1; i += 1) {
      await login(`${CLIENT_B}, ${CLIENT_A}`, `impersonate-${i}`);
    }

    // CLIENT_A (the real source) is spent; CLIENT_B, who was impersonated, is untouched.
    expect((await login(CLIENT_A, 'impersonate-check')).status).toBe(429);
    expect((await login(CLIENT_B, 'victim-check')).status).toBe(401);
  });
});

describe('login rate limiting — per-account dimension', () => {
  it('caps failed attempts against one account even when the source address rotates', async () => {
    const target = 'targeted-account';

    for (let i = 0; i < LOGIN_IDENTIFIER_MAX; i += 1) {
      // A different source address every time: the per-IP limiter never engages, so only
      // the per-identifier dimension can stop this.
      const res = await login(`192.0.2.${i + 1}`, target);
      expect(res.status, `attempt ${i} should still be within budget`).toBe(401);
    }

    const blocked = await login('192.0.2.200', target);
    expect(blocked.status).toBe(429);
  });

  it('CRITICAL: does not become a user-enumeration oracle', async () => {
    // An account that exists and one that does not must reach the limit identically and
    // produce byte-identical refusals.
    await register(CLIENT_A, 'realuser');

    const exhaust = async (identifier: string, ipBase: string) => {
      for (let i = 0; i < LOGIN_IDENTIFIER_MAX; i += 1) {
        await login(`${ipBase}.${i + 1}`, identifier);
      }
      return login(`${ipBase}.200`, identifier);
    };

    const existing = await exhaust('realuser', '192.0.2');
    const missing = await exhaust('no-such-user-at-all', '198.51.100');

    expect(existing.status).toBe(429);
    expect(missing.status).toBe(429);

    // Identical refusal for both. `retryAfter` is excluded from the comparison because it
    // counts down the caller's own window — it moves with elapsed wall-clock time, not with
    // anything about the account — but its shape and bound are still asserted.
    const withoutRetryAfter = (body: any) => ({
      ...body,
      error: { ...body.error, details: undefined },
    });
    expect(withoutRetryAfter(existing.body)).toEqual(withoutRetryAfter(missing.body));
    for (const body of [existing.body, missing.body]) {
      expect(body.error.details.retryAfter).toBeGreaterThan(0);
      expect(body.error.details.retryAfter).toBeLessThanOrEqual(300);
    }
  }, 30_000);

  it('does not spend the account budget on successful logins', async () => {
    // A legitimate user must never be locked out by their own successful sign-ins, which is
    // why this limiter counts 401s only. More attempts than the cap, all correct, all fine.
    await register(CLIENT_A, 'busyuser');

    for (let i = 0; i < LOGIN_IDENTIFIER_MAX + 1; i += 1) {
      const res = await request(proxiedApp)
        .post('/api/auth/login')
        .set('X-Forwarded-For', `192.0.2.${i + 1}`)
        .send({ identifier: 'busyuser', password: 'Password123!' });
      expect(res.status, `successful login ${i} was refused`).toBe(200);
    }
  }, 30_000);

  it('does not track a request with no identifier to key on', async () => {
    // Validation rejects these on their own merits; tracking them would let an attacker
    // fill the store with keys that identify nothing.
    for (let i = 0; i < LOGIN_IDENTIFIER_MAX + 2; i += 1) {
      const res = await request(proxiedApp)
        .post('/api/auth/login')
        .set('X-Forwarded-For', '192.0.2.77')
        .send({ password: 'x' });
      expect(res.status).toBe(422);
    }
  });
});

describe('rate limiting — endpoint budgets are not shared', () => {
  it('CRITICAL: exhausting login does not lock anyone out of registration', async () => {
    await exhaustLoginIpBudget(CLIENT_A, 'sep');
    expect((await login(CLIENT_A, 'sep-check')).status).toBe(429);

    // Before the fix these shared one limiter instance, so a burst of login traffic also
    // consumed the registration budget — a lockout with no security benefit.
    const res = await register(CLIENT_A, 'stillregisters');
    expect(res.status).toBe(201);
  });

  it('keeps separately-created limiters in separate namespaces', async () => {
    // The property the route wiring relies on: two limiters over the same dimension do not
    // share a bucket, so route budgets stay independent by construction.
    const first = createRateLimiter({
      name: 'unit:first',
      windowMs: 60_000,
      max: 1,
      keyFor: () => 'k',
    });
    const second = createRateLimiter({
      name: 'unit:second',
      windowMs: 60_000,
      max: 1,
      keyFor: () => 'k',
    });

    const app = express();
    app.get('/first', first, (_req, res) => {
      res.status(200).end();
    });
    app.get('/second', second, (_req, res) => {
      res.status(200).end();
    });
    app.use((err: any, _req: any, res: any, _next: any) => {
      res.status(err.statusCode ?? 500).end();
    });

    expect((await request(app).get('/first')).status).toBe(200);
    expect((await request(app).get('/first')).status).toBe(429);
    // The second limiter has its own budget despite an identical key.
    expect((await request(app).get('/second')).status).toBe(200);
  });
});

describe('rate-limit responses', () => {
  it('answers 429 with Retry-After and leaks nothing about authentication state', async () => {
    await exhaustLoginIpBudget(CLIENT_A, 'resp');
    const res = await login(CLIENT_A, 'resp-check');

    expect(res.status).toBe(429);
    expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
    expect(res.body.error.message).toBe(
      'Too many authentication attempts. Please try again later.'
    );
    expect(res.body.error.details).toEqual({ retryAfter: expect.any(Number) });

    // No session is established, and nothing about the account, the store, or the limiter's
    // internals reaches the client.
    expect(res.headers['set-cookie']).toBeUndefined();
    const serialised = JSON.stringify(res.body);
    for (const leak of ['token', 'passwordHash', 'userId', 'auth:login', 'identifier']) {
      expect(serialised, `429 body leaked "${leak}"`).not.toContain(leak);
    }
    expect(Object.keys(res.body)).toEqual(['error']);
  });

  it('returns the same refusal whichever dimension tripped', async () => {
    await exhaustLoginIpBudget(CLIENT_A, 'same');
    const byIp = await login(CLIENT_A, 'same-check');

    for (let i = 0; i < LOGIN_IDENTIFIER_MAX; i += 1) {
      await login(`192.0.2.${i + 1}`, 'same-target');
    }
    const byIdentifier = await login('192.0.2.201', 'same-target');

    expect(byIp.status).toBe(byIdentifier.status);
    expect(byIp.body.error.code).toBe(byIdentifier.body.error.code);
    expect(byIp.body.error.message).toBe(byIdentifier.body.error.message);
  });
});

describe('rate limiting — existing authentication behaviour is preserved', () => {
  it('registration and login still succeed through the limiters', async () => {
    const created = await register(CLIENT_A, 'normaluser');
    expect(created.status).toBe(201);
    expect(created.headers['set-cookie']).toBeDefined();

    const signedIn = await request(proxiedApp)
      .post('/api/auth/login')
      .set('X-Forwarded-For', CLIENT_A)
      .send({ identifier: 'normaluser', password: 'Password123!' });

    expect(signedIn.status).toBe(200);
    expect(signedIn.body.authenticated).toBe(true);
  });

  it('the origin guard still runs ahead of the limiter', async () => {
    // Increment 0's CSRF boundary is app-level and must not have been displaced by the
    // route-level limiters: a hostile origin is refused before any budget is touched.
    const productionApp = createApp({
      originPolicy: buildOriginPolicy({
        corsOrigin: 'https://app.vade.example',
        nodeEnv: 'production',
      }),
      trustedProxyHops: 1,
    });

    const res = await request(productionApp)
      .post('/api/auth/login')
      .set('Origin', 'https://evil.attacker.example')
      .set('X-Forwarded-For', CLIENT_A)
      .send({ identifier: 'someone', password: 'x' });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });
});

describe('proxy topology probe — observation condition', () => {
  /**
   * The probe exists to answer one question in a deployed environment: how long is the
   * forwarded chain that actually reaches the Node process?
   *
   * Its first version latched on the first request of any kind, which made it useless on
   * Render: the platform's internal health check always arrives first, reaches the
   * container directly, and carries no X-Forwarded-For. It therefore reported
   * `forwardedHops: 0` — a fact about the health check, not about the edge — and consumed
   * the one-shot before any externally forwarded request could be seen. These tests pin the
   * corrected condition so that regression cannot recur silently.
   */
  function probeApp() {
    const app = express();
    app.use(createProxyTopologyProbe(1));
    app.get('/probe', (_req, res) => {
      res.status(200).end();
    });
    return app;
  }

  /** Captures what the probe logged, without changing how it logs. */
  function captureProbeLogs(): { lines: string[]; restore: () => void } {
    const lines: string[] = [];
    const original = console.info;
    console.info = (...args: unknown[]) => {
      const text = args.map(String).join(' ');
      if (text.includes('Proxy topology observed')) lines.push(text);
    };
    return { lines, restore: () => { console.info = original; } };
  }

  it('CRITICAL: a request with no X-Forwarded-For does not consume the probe', async () => {
    const { lines, restore } = captureProbeLogs();
    try {
      const app = probeApp();

      // Stands in for Render's internal health check: direct to the container, no chain.
      await request(app).get('/probe');
      await request(app).get('/probe');
      expect(lines, 'an unforwarded request must not produce telemetry').toHaveLength(0);

      // The probe is still armed, so the first forwarded request is the one observed.
      await request(app).get('/probe').set('X-Forwarded-For', `${CLIENT_B}, ${CLIENT_A}`);
      expect(lines).toHaveLength(1);
      expect(lines[0]).toContain('"forwardedHops":2');
    } finally {
      restore();
    }
  });

  it('observes the first forwarded request and reports the chain it carried', async () => {
    const { lines, restore } = captureProbeLogs();
    try {
      await request(probeApp()).get('/probe').set('X-Forwarded-For', CLIENT_A);

      expect(lines).toHaveLength(1);
      expect(lines[0]).toContain('"configuredTrustedHops":1');
      expect(lines[0]).toContain('"forwardedHops":1');
      expect(lines[0]).toContain('"underCounting":false');
      expect(lines[0]).toContain('"resolvedFromSocketPeer"');
    } finally {
      restore();
    }
  });

  it('raises underCounting when the observed chain is longer than the configured trust', async () => {
    const { lines, restore } = captureProbeLogs();
    try {
      await request(probeApp())
        .get('/probe')
        .set('X-Forwarded-For', `${CLIENT_A}, ${CLIENT_B}, 10.0.0.1`);

      expect(lines).toHaveLength(1);
      expect(lines[0]).toContain('"forwardedHops":3');
      expect(lines[0]).toContain('"underCounting":true');
    } finally {
      restore();
    }
  });

  it('stays one-shot: later requests produce no further telemetry', async () => {
    const { lines, restore } = captureProbeLogs();
    try {
      const app = probeApp();
      await request(app).get('/probe').set('X-Forwarded-For', CLIENT_A);
      expect(lines).toHaveLength(1);

      for (const chain of [CLIENT_B, `${CLIENT_A}, ${CLIENT_B}`, '10.0.0.1']) {
        await request(app).get('/probe').set('X-Forwarded-For', chain);
      }
      await request(app).get('/probe');

      expect(lines, 'the probe must log exactly once per process').toHaveLength(1);
    } finally {
      restore();
    }
  });

  it('CRITICAL: telemetry carries no IP address and no request-borne secrets', async () => {
    const { lines, restore } = captureProbeLogs();
    try {
      await request(probeApp())
        .get('/probe')
        .set('X-Forwarded-For', `${CLIENT_A}, ${CLIENT_B}`)
        .set('Cookie', 'enctxt_session=super-secret-session-token')
        .set('Authorization', 'Bearer super-secret-bearer-token');

      expect(lines).toHaveLength(1);
      const telemetry = lines[0];

      expect(telemetry, 'an IP address reached the log').not.toMatch(
        /\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/
      );
      for (const secret of [
        'super-secret-session-token',
        'super-secret-bearer-token',
        'enctxt_session',
        'Bearer',
        'Cookie',
      ]) {
        expect(telemetry, `telemetry leaked "${secret}"`).not.toContain(secret);
      }

      // Exactly the four documented fields, nothing else.
      const payload = JSON.parse(telemetry.slice(telemetry.indexOf('{')));
      expect(Object.keys(payload).sort()).toEqual([
        'configuredTrustedHops',
        'forwardedHops',
        'resolvedFromSocketPeer',
        'underCounting',
      ]);
    } finally {
      restore();
    }
  });
});

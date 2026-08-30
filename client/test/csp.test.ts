import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

/**
 * Content Security Policy validation (Phase 0B — Increment 1, Part 1).
 *
 * The CSP is served by Vercel from a static `vercel.json`, so there is no running server
 * to assert against here. What these tests do instead is verify the two things that can
 * actually go wrong without anyone noticing:
 *
 *   1. The policy is genuinely strict — no wildcards, no unsafe-inline/unsafe-eval in
 *      script-src, framing and object embedding disabled.
 *   2. The policy still MATCHES THE APPLICATION. A CSP that drifts from the app it
 *      protects gets loosened in a panic the first time production breaks. So the inline
 *      script hash is recomputed from source here, and every external host the app
 *      actually references must be present in the policy.
 *
 * This is validation of a configuration artefact, not proof of browser enforcement. Only
 * a deployed page can demonstrate the latter — see the Increment 1 report.
 */

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const vercelConfigPath = path.join(repoRoot, 'vercel.json');
const clientIndexPath = path.join(repoRoot, 'client', 'index.html');
const builtIndexPath = path.join(repoRoot, 'client', 'dist', 'index.html');

const vercelConfig = JSON.parse(fs.readFileSync(vercelConfigPath, 'utf8'));

function headerValue(key: string): string | undefined {
  const rule = (vercelConfig.headers ?? []).find((r: { source: string }) => r.source === '/(.*)');
  const entry = (rule?.headers ?? []).find(
    (h: { key: string }) => h.key.toLowerCase() === key.toLowerCase()
  );
  return entry?.value;
}

const csp = headerValue('Content-Security-Policy');

/** Parses a CSP into directive -> source list. */
function parseCsp(policy: string): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const part of policy.split(';')) {
    const tokens = part.trim().split(/\s+/).filter(Boolean);
    if (tokens.length === 0) continue;
    map.set(tokens[0].toLowerCase(), tokens.slice(1));
  }
  return map;
}

/**
 * Extracts the content of every inline <script> (one with no src attribute), with line
 * endings normalized to LF.
 *
 * The normalization is load-bearing, not cosmetic. This repository has no `.gitattributes`
 * and the working tree on Windows holds CRLF while the committed blob holds LF — so a hash
 * computed from a local checkout would not match what Vercel builds on Linux. Normalizing
 * makes the assertion agree with the deployed artefact regardless of the host it runs on.
 */
function inlineScriptContents(html: string): string[] {
  const normalized = html.replace(/\r\n/g, '\n');
  const out: string[] = [];
  const re = /<script(?![^>]*\ssrc=)([^>]*)>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(normalized)) !== null) out.push(match[2]);
  return out;
}

function sha256Base64(content: string): string {
  return crypto.createHash('sha256').update(content, 'utf8').digest('base64');
}

describe('CSP — the header exists and is well formed', () => {
  it('a Content-Security-Policy header is configured for every path', () => {
    expect(csp, 'no Content-Security-Policy header found in vercel.json').toBeTruthy();
  });

  it('parses into directives', () => {
    const directives = parseCsp(csp!);
    expect(directives.size).toBeGreaterThan(5);
  });
});

describe('CSP — script policy is restrictive', () => {
  const directives = parseCsp(csp!);

  it("script-src does not allow 'unsafe-inline'", () => {
    expect(directives.get('script-src')).not.toContain("'unsafe-inline'");
  });

  it("script-src does not allow 'unsafe-eval'", () => {
    // The app contains no eval, no new Function, and no runtime script generation, so
    // there is no requirement that would justify this.
    expect(directives.get('script-src')).not.toContain("'unsafe-eval'");
  });

  it("script-src is limited to 'self' plus explicit hashes", () => {
    const sources = directives.get('script-src') ?? [];
    for (const source of sources) {
      const allowed = source === "'self'" || source.startsWith("'sha256-");
      expect(allowed, `unexpected script-src source: ${source}`).toBe(true);
    }
  });

  it('CRITICAL: the inline theme script hash matches the current source', () => {
    // If someone edits the theme-init script and forgets the hash, the browser silently
    // blocks it in production: the app flashes the wrong colour scheme and a CSP violation
    // is reported. This test is the thing that catches that before deploy.
    const html = fs.readFileSync(clientIndexPath, 'utf8');
    const inline = inlineScriptContents(html);

    expect(inline.length, 'expected exactly one inline script in client/index.html').toBe(1);

    const expected = `'sha256-${sha256Base64(inline[0])}'`;
    expect(directives.get('script-src')).toContain(expected);
  });

  it('the built output agrees with the source, so the deployed hash is the one tested', () => {
    // Vite copies index.html without minifying the inline script. If that ever changes,
    // the hash computed from source would no longer describe the deployed file — this
    // catches that regression rather than letting it reach production.
    if (!fs.existsSync(builtIndexPath)) return; // dist/ is gitignored; skip when not built

    const sourceInline = inlineScriptContents(fs.readFileSync(clientIndexPath, 'utf8'));
    const builtInline = inlineScriptContents(fs.readFileSync(builtIndexPath, 'utf8'));

    expect(builtInline.length).toBe(sourceInline.length);
    expect(sha256Base64(builtInline[0])).toBe(sha256Base64(sourceInline[0]));
  });
});

describe('CSP — connect-src covers exactly what the app needs', () => {
  const directives = parseCsp(csp!);
  const connectSrc = directives.get('connect-src') ?? [];

  it('is present', () => {
    expect(connectSrc.length).toBeGreaterThan(0);
  });

  it('allows the HTTPS API origin', () => {
    expect(connectSrc).toContain('https://vade-api.onrender.com');
  });

  it('allows the WSS WebSocket origin', () => {
    // A missing wss:// entry is the classic CSP mistake here: connect-src governs
    // WebSocket connections, and https:// does NOT imply wss:// for the same host.
    expect(connectSrc).toContain('wss://vade-api.onrender.com');
  });

  it('does not use a scheme-wide or wildcard source', () => {
    for (const source of connectSrc) {
      expect(source).not.toBe('*');
      expect(source).not.toBe('https:');
      expect(source).not.toBe('wss:');
      expect(source, `wildcard host in connect-src: ${source}`).not.toContain('*');
    }
  });
});

describe('CSP — external resources the app actually uses are covered', () => {
  const directives = parseCsp(csp!);
  const html = fs.readFileSync(clientIndexPath, 'utf8');

  it('Google Fonts stylesheet host is allowed in style-src (it is actually referenced)', () => {
    // Asserted against the HTML rather than hardcoded, so removing the font link and
    // tightening the policy stays consistent.
    if (!html.includes('fonts.googleapis.com')) return;
    expect(directives.get('style-src')).toContain('https://fonts.googleapis.com');
  });

  it('Google Fonts file host is allowed in font-src', () => {
    if (!html.includes('fonts.gstatic.com')) return;
    expect(directives.get('font-src')).toContain('https://fonts.gstatic.com');
  });

  it('style-src is otherwise limited to self and that one host', () => {
    const sources = directives.get('style-src') ?? [];
    for (const source of sources) {
      const allowed = source === "'self'" || source === 'https://fonts.googleapis.com';
      expect(allowed, `unexpected style-src source: ${source}`).toBe(true);
    }
  });
});

describe('CSP — dangerous capabilities are disabled', () => {
  const directives = parseCsp(csp!);

  it("default-src is 'none', so every unlisted fetch type is denied by default", () => {
    expect(directives.get('default-src')).toEqual(["'none'"]);
  });

  it("object-src is 'none'", () => {
    expect(directives.get('object-src')).toEqual(["'none'"]);
  });

  it("frame-ancestors is 'none' (clickjacking)", () => {
    expect(directives.get('frame-ancestors')).toEqual(["'none'"]);
  });

  it("base-uri is 'self' (base-tag injection cannot redirect relative script URLs)", () => {
    expect(directives.get('base-uri')).toEqual(["'self'"]);
  });

  it("form-action is 'self' (an injected form cannot post credentials off-origin)", () => {
    expect(directives.get('form-action')).toEqual(["'self'"]);
  });

  it('no directive anywhere uses a bare wildcard', () => {
    for (const [directive, sources] of parseCsp(csp!)) {
      for (const source of sources) {
        expect(source, `wildcard in ${directive}`).not.toBe('*');
      }
    }
  });

  it("no directive allows a bare scheme like https: or data: for scripts", () => {
    const scriptish = ['script-src', 'default-src', 'object-src', 'frame-src'];
    for (const directive of scriptish) {
      for (const source of parseCsp(csp!).get(directive) ?? []) {
        expect(source, `bare scheme in ${directive}`).not.toMatch(/^(https?|data|blob):$/);
      }
    }
  });
});

describe('Complementary security headers', () => {
  it('X-Content-Type-Options: nosniff', () => {
    expect(headerValue('X-Content-Type-Options')).toBe('nosniff');
  });

  it('X-Frame-Options: DENY (legacy backstop for frame-ancestors)', () => {
    expect(headerValue('X-Frame-Options')).toBe('DENY');
  });

  it('Referrer-Policy does not leak full URLs cross-origin', () => {
    const value = headerValue('Referrer-Policy');
    expect(['strict-origin-when-cross-origin', 'no-referrer', 'same-origin']).toContain(value);
  });

  it('Permissions-Policy disables camera, microphone and geolocation', () => {
    const value = headerValue('Permissions-Policy') ?? '';
    expect(value).toContain('camera=()');
    expect(value).toContain('microphone=()');
    expect(value).toContain('geolocation=()');
  });

  it('Strict-Transport-Security is set with a long max-age', () => {
    const value = headerValue('Strict-Transport-Security') ?? '';
    const match = value.match(/max-age=(\d+)/);
    expect(match).toBeTruthy();
    expect(Number(match![1])).toBeGreaterThanOrEqual(31536000);
  });
});

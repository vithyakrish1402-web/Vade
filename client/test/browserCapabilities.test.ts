import { describe, it, expect } from 'vitest';
import { checkBrowserCapabilities } from '../src/utils/browserCapabilities';

describe('Browser Capability Check (Phase 9 — Fail-Closed Security)', () => {
  it('evaluates browser cryptographic environment', () => {
    const caps = checkBrowserCapabilities();
    expect(typeof caps.isSupported).toBe('boolean');
    expect(typeof caps.hasWebCrypto).toBe('boolean');
    expect(typeof caps.hasSubtleCrypto).toBe('boolean');
    expect(typeof caps.hasIndexedDB).toBe('boolean');
  });

  it('provides descriptive error messages when security primitives are missing', () => {
    // In Node test environment, subtle / indexedDB might be mocked or missing
    const caps = checkBrowserCapabilities();
    if (!caps.isSupported) {
      expect(caps.errorMessage).toBeTruthy();
      expect(typeof caps.errorMessage).toBe('string');
    }
  });
});

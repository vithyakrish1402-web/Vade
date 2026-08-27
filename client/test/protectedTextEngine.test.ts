import { describe, it, expect } from 'vitest';
import {
  protect,
  PROTECTED_RENDERER_VERSION,
  PROTECTION_MODES,
} from '../src/utils/protectedText/protectedTextEngine';

describe('ProtectedTextEngine dispatcher (Protected Text v2)', () => {
  it('exposes renderer version 2', () => {
    expect(PROTECTED_RENDERER_VERSION).toBe(2);
  });

  it('defaults to HOMOGLYPH mode, matching legacy protectMessage output', () => {
    expect(protect('Hello World')).toBe('Нєllσ Wσrld');
  });

  it('routes ILLUSION mode to the illusion renderer', () => {
    const output = protect('meet me at the station', 'ILLUSION');
    expect(output).not.toBe('meet me at the station');
    expect(output.split(' ').length).toBe('meet me at the station'.split(' ').length);
  });

  it('routes PATTERN mode to the pattern renderer', () => {
    const output = protect('Are you coming?', 'PATTERN');
    expect(output).not.toContain('coming');
    expect(output.split('·').length).toBe(3);
  });

  it('ADAPTIVE mode is not implemented and falls back to HOMOGLYPH rather than plaintext', () => {
    expect(protect('Hello World', 'ADAPTIVE')).toBe(protect('Hello World', 'HOMOGLYPH'));
  });

  it('throws on an unsupported mode value rather than returning plaintext', () => {
    // @ts-expect-error intentionally invalid mode to verify fail-closed behavior
    expect(() => protect('secret plaintext', 'NOT_A_MODE')).toThrow();
  });

  it('returns empty string for empty input regardless of mode', () => {
    for (const mode of PROTECTION_MODES) {
      expect(protect('', mode)).toBe('');
    }
  });

  it('never returns the exact original plaintext for any real mode on transformable content', () => {
    const input = 'Meet me at the station tonight';
    for (const mode of PROTECTION_MODES) {
      expect(protect(input, mode)).not.toBe(input);
    }
  });
});

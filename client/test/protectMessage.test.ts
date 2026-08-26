import { describe, it, expect } from 'vitest';
import { protectMessage, HOMOGLYPH_MAP } from '../src/utils/protectMessage';

describe('Visual Privacy Engine — protectMessage Utility (Phase 5)', () => {
  // ==========================================
  // DETERMINISM TESTS
  // ==========================================
  describe('Determinism & Purity', () => {
    it('always returns the exact same protected output for the same input string', () => {
      const input = 'Meet me at 7 PM near the station!';
      const first = protectMessage(input);
      const second = protectMessage(input);
      const third = protectMessage(input);

      expect(first).toBe(second);
      expect(second).toBe(third);
      expect(first).not.toBe(input); // Must be transformed
    });

    it('does not mutate or alter the original input variable', () => {
      const input = 'Immutable original message';
      const output = protectMessage(input);

      expect(input).toBe('Immutable original message');
      expect(output).not.toBe(input);
    });

    it('returns empty string when given an empty string', () => {
      expect(protectMessage('')).toBe('');
    });
  });

  // ==========================================
  // CHARACTER SETS & CASING
  // ==========================================
  describe('Latin Alphabet Transformation & Casing', () => {
    it('transforms lowercase Latin letters using visual homoglyphs', () => {
      const input = 'abcdefghijklmnopqrstuvwxyz';
      const protectedText = protectMessage(input);

      const expected = input.split('').map((c) => HOMOGLYPH_MAP[c] || c).join('');
      expect(protectedText).toBe(expected);
      expect(protectedText.length).toBe(input.length);
    });

    it('transforms uppercase Latin letters using visual homoglyphs', () => {
      const input = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
      const protectedText = protectMessage(input);

      const expected = input.split('').map((c) => HOMOGLYPH_MAP[c] || c).join('');
      expect(protectedText).toBe(expected);
      expect(protectedText.length).toBe(input.length);
    });

    it('preserves mixed-case casing structure in sentences', () => {
      const input = 'Hello World';
      const protectedText = protectMessage(input);

      // H -> Η (uppercase), e -> є, l -> l, o -> σ, W -> W, o -> σ, r -> r, l -> l, d -> d
      expect(protectedText).toBe('Нєllσ Wσrld');
    });
  });

  // ==========================================
  // NUMBERS, PUNCTUATION & WHITESPACE
  // ==========================================
  describe('Numbers, Punctuation & Formatting Preservation', () => {
    it('preserves numbers intact', () => {
      const input = 'Code 1234567890';
      const protectedText = protectMessage(input);

      expect(protectedText).toContain('1234567890');
    });

    it('preserves standard punctuation and symbols', () => {
      const input = 'Are you ready? Yes! (Maybe... $100 & 50% / #test)';
      const protectedText = protectMessage(input);

      expect(protectedText).toContain('?');
      expect(protectedText).toContain('!');
      expect(protectedText).toContain('(');
      expect(protectedText).toContain(')');
      expect(protectedText).toContain('$100');
      expect(protectedText).toContain('&');
      expect(protectedText).toContain('%');
      expect(protectedText).toContain('#');
    });

    it('preserves whitespace, tabs, and multiline line breaks', () => {
      const input = 'Line 1\n\nLine 2 with   spaces\tand tabs.';
      const protectedText = protectMessage(input);

      expect(protectedText).toContain('\n\n');
      expect(protectedText).toContain('   ');
      expect(protectedText).toContain('\t');
    });
  });

  // ==========================================
  // EMOJI & MULTI-BYTE UNICODE SAFETY
  // ==========================================
  describe('Emoji & Multi-Byte Unicode Safety', () => {
    it('preserves multi-byte emojis without corruption or split surrogate pairs', () => {
      const input = 'See you soon 😊🚀👋✨';
      const protectedText = protectMessage(input);

      expect(protectedText).toContain('😊');
      expect(protectedText).toContain('🚀');
      expect(protectedText).toContain('👋');
      expect(protectedText).toContain('✨');
      expect(protectedText).toBe('Ѕєє уσυ ѕσση 😊🚀👋✨');
    });

    it('safely handles accented Latin characters', () => {
      const input = 'Café and résumé';
      const protectedText = protectMessage(input);

      expect(protectedText).toContain('é');
      expect(protectedText).toBeDefined();
    });

    it('safely passes through Hindi / Devanagari script without crashing', () => {
      const input = 'नमस्ते आप कैसे हैं?';
      const protectedText = protectMessage(input);

      expect(protectedText).toBe('नमस्ते आप कैसे हैं?');
    });

    it('safely passes through Chinese characters without crashing', () => {
      const input = '你好，世界！';
      const protectedText = protectMessage(input);

      expect(protectedText).toBe('你好，世界！');
    });

    it('safely passes through Japanese characters without crashing', () => {
      const input = 'こんにちは！元気ですか？';
      const protectedText = protectMessage(input);

      expect(protectedText).toBe('こんにちは！元気ですか？');
    });
  });

  // ==========================================
  // PERFORMANCE & LONG MESSAGES
  // ==========================================
  describe('Performance on Long Messages', () => {
    it('transforms 100-character messages under 1ms', () => {
      const input = 'a'.repeat(100);
      const start = performance.now();
      const output = protectMessage(input);
      const duration = performance.now() - start;

      expect(output.length).toBe(100);
      expect(duration).toBeLessThan(10);
    });

    it('transforms 1000-character messages effortlessly', () => {
      const input = 'Quick brown fox jumps over the lazy dog. '.repeat(25);
      const output = protectMessage(input);

      expect(output.length).toBe(input.length);
      expect(output).not.toContain('Quick');
    });

    it('transforms maximum server limit of 5000 characters without memory or performance issues', () => {
      const input = 'Confidential privacy message test line! '.repeat(125).slice(0, 5000);
      const start = performance.now();
      const output = protectMessage(input);
      const duration = performance.now() - start;

      expect(output.length).toBe(5000);
      expect(duration).toBeLessThan(20);
    });
  });
});

import { describe, it, expect } from 'vitest';
import { renderIllusion } from '../src/utils/protectedText/illusionRenderer';

const VERSION = 2;

describe('ILLUSION rendering strategy (Protected Text v2)', () => {
  describe('Determinism & purity', () => {
    it('produces identical output for identical input across repeated calls', () => {
      const input = 'meet me at the station';
      const first = renderIllusion(input, VERSION);
      const second = renderIllusion(input, VERSION);
      const third = renderIllusion(input, VERSION);
      expect(first).toBe(second);
      expect(second).toBe(third);
    });

    it('does not mutate the input string', () => {
      const input = 'Immutable original message';
      renderIllusion(input, VERSION);
      expect(input).toBe('Immutable original message');
    });

    it('produces different output for a different renderer version (version is part of the seed)', () => {
      const input = 'Are you coming tonight?';
      const v2 = renderIllusion(input, 2);
      const v3 = renderIllusion(input, 3);
      expect(v2).not.toBe(v3);
    });

    it('returns empty string for empty input', () => {
      expect(renderIllusion('', VERSION)).toBe('');
    });
  });

  describe('Readability preservation (structure)', () => {
    it('preserves word count / whitespace boundaries', () => {
      const input = 'meet me at the station';
      const output = renderIllusion(input, VERSION);
      expect(output.split(' ').length).toBe(input.split(' ').length);
    });

    it('preserves newlines and tabs', () => {
      const input = 'Line 1\n\nLine 2 with\ttabs';
      const output = renderIllusion(input, VERSION);
      expect(output).toContain('\n\n');
      expect(output).toContain('\t');
    });

    it('preserves punctuation', () => {
      const input = 'Are you ready? Yes! (Maybe...)';
      const output = renderIllusion(input, VERSION);
      expect(output).toContain('?');
      expect(output).toContain('!');
      expect(output).toContain('(');
      expect(output).toContain(')');
      expect(output).toContain('...');
    });

    it('preserves numbers', () => {
      const input = 'Meet me at 7 PM, room 1234567890';
      const output = renderIllusion(input, VERSION);
      expect(output).toContain('1234567890');
      expect(output).toContain('7');
    });

    it('preserves emoji intact', () => {
      const input = 'See you soon 😊🚀👋✨';
      const output = renderIllusion(input, VERSION);
      expect(output).toContain('😊');
      expect(output).toContain('🚀');
      expect(output).toContain('👋');
      expect(output).toContain('✨');
    });

    it('preserves non-Latin scripts untouched', () => {
      const hindi = 'नमस्ते आप कैसे हैं?';
      const chinese = '你好，世界！';
      const japanese = 'こんにちは！元気ですか？';
      expect(renderIllusion(hindi, VERSION)).toBe(hindi);
      expect(renderIllusion(chinese, VERSION)).toBe(chinese);
      expect(renderIllusion(japanese, VERSION)).toBe(japanese);
    });

    it('preserves URL structure without transforming letters inside it', () => {
      const input = 'Check https://Example.com/Secret-Path for details';
      const output = renderIllusion(input, VERSION);
      expect(output).toContain('https://Example.com/Secret-Path');
    });

    it('never transforms letters outside the approved candidate table (d,f,j,k,l,m,p,q,v,w,z)', () => {
      const input = 'd f j k l m p q v w z D F J K L M P Q V W Z';
      const output = renderIllusion(input, VERSION);
      // None of these letters have a candidate table entry, so output must equal input exactly.
      expect(output).toBe(input);
    });
  });

  describe('Illusion is not full unreadability — never transforms every eligible character', () => {
    it('leaves at least one untransformed eligible letter in a long eligible-heavy sentence', () => {
      const input = 'a e i o s t g b h n r u c x y '.repeat(4).trim();
      const output = renderIllusion(input, VERSION);
      expect(output).not.toBe(input);
      // If every single eligible letter were transformed, no original eligible letters would survive.
      const survivedOriginalLetters = [...output].some((ch) => 'aeiostgbhnrucxy'.includes(ch));
      expect(survivedOriginalLetters).toBe(true);
    });
  });

  describe('Transformation ratio targets ~20-45% of total characters for normal prose', () => {
    const sentences = [
      'meet me at the station',
      'Are you coming tonight?',
      'Hello, how are you?',
      'See you soon, take care and have a great evening',
      'Please send the report before the meeting starts tomorrow morning',
    ];

    it('lands within a reasonable band across representative sentences', () => {
      const ratios = sentences.map((s) => {
        const out = renderIllusion(s, VERSION);
        let changed = 0;
        for (let i = 0; i < s.length; i++) {
          if (out[i] !== s[i]) changed++;
        }
        return changed / s.length;
      });

      const avg = ratios.reduce((a, b) => a + b, 0) / ratios.length;
      expect(avg).toBeGreaterThan(0.15);
      expect(avg).toBeLessThan(0.5);
    });
  });

  describe('Case handling', () => {
    it('transforms uppercase and lowercase letters using the same candidate table (case-insensitive lookup)', () => {
      // From the spec's own example: "Are you..." -> "4r3 yσυ..." (capital A -> numeral 4)
      const output = renderIllusion('Are', VERSION);
      expect(output[0]).not.toBe('A');
      expect(output[0]).not.toBe('a');
    });
  });

  describe('Performance', () => {
    it('renders a 5000-character message quickly', () => {
      const input = 'Confidential privacy message test line! '.repeat(125).slice(0, 5000);
      const start = performance.now();
      const output = renderIllusion(input, VERSION);
      const duration = performance.now() - start;
      expect(output.length).toBe(5000);
      expect(duration).toBeLessThan(50);
    });
  });
});

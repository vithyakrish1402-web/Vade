import { describe, it, expect } from 'vitest';
import { renderPattern, INTENT_SYMBOLS } from '../src/utils/protectedText/patternRenderer';
import { classifyIntent } from '../src/utils/protectedText/intentClassifier';

const VERSION = 2;

describe('PATTERN rendering strategy (Protected Text v2)', () => {
  it('returns empty string for empty input', () => {
    expect(renderPattern('', VERSION)).toBe('');
  });

  it('is deterministic for the same message', () => {
    const input = 'Are you coming tonight?';
    expect(renderPattern(input, VERSION)).toBe(renderPattern(input, VERSION));
  });

  it('produces different output for different messages (in general)', () => {
    const a = renderPattern('Are you coming tonight?', VERSION);
    const b = renderPattern('Meet me at the station', VERSION);
    expect(a).not.toBe(b);
  });

  it('never contains any word from the original plaintext', () => {
    const input = 'The confidential project codename is Falcon';
    const output = renderPattern(input, VERSION);
    for (const word of input.split(/\s+/)) {
      const cleaned = word.replace(/[^a-zA-Z]/g, '');
      if (cleaned.length > 2) {
        expect(output.toLowerCase()).not.toContain(cleaned.toLowerCase());
      }
    }
  });

  it('embeds the correct intent symbol for the classified category', () => {
    const input = 'Are you coming tonight?';
    const intent = classifyIntent(input);
    const output = renderPattern(input, VERSION);
    expect(output).toContain(INTENT_SYMBOLS[intent]);
  });

  it('follows the fixed PREFIX + TOKEN + SEP + SYMBOL + SEP + TOKEN grammar', () => {
    const output = renderPattern('Hello there', VERSION);
    const parts = output.split(' ');
    // prefix, token, ·, symbol, ·, token = 6 space-separated parts
    expect(parts.length).toBe(6);
    expect(parts[2]).toBe('·');
    expect(parts[4]).toBe('·');
  });
});

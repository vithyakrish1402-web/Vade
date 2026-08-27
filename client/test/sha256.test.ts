import { describe, it, expect } from 'vitest';
import { createHash } from 'crypto';
import { sha256, deriveRenderSeed } from '../src/utils/protectedText/sha256';

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function nodeSha256Hex(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

describe('sha256 (deterministic seed source for Protected Text v2)', () => {
  it('matches Node crypto SHA-256 for a battery of inputs', () => {
    const inputs = [
      '',
      'a',
      'abc',
      'The quick brown fox jumps over the lazy dog',
      'meet me at the station',
      '😊🚀👋 emoji test',
      'नमस्ते',
      '你好，世界！',
      'x'.repeat(5000),
      'plaintext:2:ILLUSION',
    ];

    for (const input of inputs) {
      expect(toHex(sha256(input))).toBe(nodeSha256Hex(input));
    }
  });

  it('produces a 32-byte digest', () => {
    expect(sha256('anything').length).toBe(32);
  });

  it('is deterministic', () => {
    expect(toHex(sha256('hello'))).toBe(toHex(sha256('hello')));
  });

  it('deriveRenderSeed matches sha256 of the composed seed string', () => {
    const seed = deriveRenderSeed('hello world', 2, 'ILLUSION');
    expect(toHex(seed)).toBe(nodeSha256Hex('hello world:2:ILLUSION'));
  });
});

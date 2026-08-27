/**
 * ILLUSION rendering strategy — Protected Text v2.
 *
 * Produces a partially-distorted, leetspeak-like rendering of the message: readable enough for
 * someone who knows the "visual language" to follow along, but harder for a casual observer to
 * read at a glance. This is NOT full obfuscation (see HOMOGLYPH for that) and NOT encryption.
 *
 * Determinism: output depends only on (plaintext, PROTECTED_RENDERER_VERSION, "ILLUSION") via
 * `deriveRenderSeed`. The seed is used purely to pick which eligible letters get transformed and
 * which visual candidate is used — never as cryptographic material.
 */

import { deriveRenderSeed } from './sha256';

// Multiple visual candidates per letter, in a fixed priority order (spec §6).
// Letters not listed here are never transformed — they always pass through unchanged.
const ILLUSION_CANDIDATES: Record<string, string[]> = {
  a: ['4', 'α', '@'],
  e: ['3', 'є', '€'],
  i: ['1', 'ι', '!'],
  o: ['0', 'σ', 'ο'],
  s: ['5', 'ѕ', '$'],
  t: ['7', 'τ'],
  g: ['9'],
  b: ['8'],
  h: ['ħ'],
  n: ['η'],
  r: ['я'],
  u: ['υ'],
  c: ['¢'],
  x: ['×'],
  y: ['γ'],
};

// Fraction (out of 100) of ELIGIBLE letters (those with a candidate table entry) that get
// transformed. Tuned so that the overall fraction of TOTAL characters transformed lands in the
// spec's target band of 20-45% for normal prose, where only a subset of letters are eligible and
// only a fraction of the message is letters at all.
const TRANSFORM_THRESHOLD = 65;

function isUrlLike(token: string): boolean {
  return /^(https?:\/\/|www\.)/i.test(token);
}

function isLetter(ch: string): boolean {
  return /\p{L}/u.test(ch);
}

/**
 * Transforms readable message text into a deterministic, partially-distorted "illusion"
 * rendering. Preserves word boundaries, whitespace (including tabs/newlines), punctuation,
 * numbers, emoji, non-Latin scripts, and URL structure.
 */
export function renderIllusion(content: string, rendererVersion: number): string {
  if (!content) return '';

  const seed = deriveRenderSeed(content, rendererVersion, 'ILLUSION');

  // Tokenize into whitespace-runs, URL-like runs, and everything else — processed grapheme by
  // grapheme so surrogate pairs / combining marks are never split.
  const tokens = content.match(/\s+|https?:\/\/\S+|www\.\S+|./gsu) ?? [];

  let result = '';
  let eligibleIndex = 0;

  for (const token of tokens) {
    if (/^\s+$/.test(token) || isUrlLike(token)) {
      result += token;
      continue;
    }

    const lower = token.toLowerCase();
    const candidates = ILLUSION_CANDIDATES[lower];

    if (!candidates) {
      result += token;
      continue;
    }

    const b = seed[eligibleIndex % seed.length];
    eligibleIndex++;

    const shouldTransform = b % 100 < TRANSFORM_THRESHOLD;
    if (!shouldTransform) {
      result += token;
      continue;
    }

    const candidateIndex = Math.floor(b / 100) % candidates.length;
    result += candidates[candidateIndex];
  }

  return result;
}

export { ILLUSION_CANDIDATES, TRANSFORM_THRESHOLD, isLetter };

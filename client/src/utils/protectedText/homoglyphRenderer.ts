/**
 * HOMOGLYPH rendering strategy — Protected Text v2's ProtectedTextEngine.
 *
 * This is the original Layer 2 Visual Privacy transformation (unchanged), extracted verbatim
 * from the legacy `protectMessage.ts` module into the strategy-based engine. Behavior, mapping,
 * and output are byte-for-byte identical to the pre-v2 implementation — all existing test
 * vectors must continue to pass unmodified.
 */

// Centralized deterministic homoglyph visual substitution dictionary
export const HOMOGLYPH_MAP: Record<string, string> = {
  // Uppercase Latin
  A: 'Λ',
  B: 'Β',
  C: 'С',
  D: 'Δ',
  E: 'Є',
  F: 'Ϝ',
  G: 'G',
  H: 'Н',
  I: 'Ι',
  J: 'Ј',
  K: 'Κ',
  L: 'L',
  M: 'Μ',
  N: 'Ν',
  O: 'Ø',
  P: 'Ρ',
  Q: 'Q',
  R: 'R',
  S: 'Ѕ',
  T: 'Τ',
  U: 'U',
  V: 'V',
  W: 'W',
  X: 'Χ',
  Y: 'Υ',
  Z: 'Ζ',

  // Lowercase Latin
  a: 'α',
  b: 'в',
  c: 'с',
  d: 'd',
  e: 'є',
  f: 'f',
  g: 'g',
  h: 'h',
  i: 'ι',
  j: 'ј',
  k: 'к',
  l: 'l',
  m: 'м',
  n: 'η',
  o: 'σ',
  p: 'ρ',
  q: 'q',
  r: 'r',
  s: 'ѕ',
  t: 'т',
  u: 'υ',
  v: 'ν',
  w: 'w',
  x: 'χ',
  y: 'у',
  z: 'z',
};

/**
 * Transforms readable message text into a visually protected representation.
 *
 * Guarantees:
 * - Deterministic: identical input yields exact identical output
 * - Preserves numbers, punctuation, spaces, and multiline line breaks
 * - Preserves multi-byte Unicode sequences and emojis without corruption
 * - Safe fallback: unsupported international scripts (Devanagari, CJK, etc.) pass through safely
 */
export function renderHomoglyph(content: string): string {
  if (!content) return '';

  const chars: string[] = [];
  for (const char of content) {
    chars.push(HOMOGLYPH_MAP[char] || char);
  }

  return chars.join('');
}

/**
 * PATTERN rendering strategy — Protected Text v2.
 *
 * Shows only a coarse, locally-classified intent hint as an abstract glyph sequence. The actual
 * plaintext is NEVER encoded — only the classified `IntentCategory` plus decorative, seed-derived
 * filler glyphs pulled from a small fixed alphabet.
 *
 * Fixed grammar (spec §14): PREFIX + VISUAL_TOKEN + SEPARATOR + INTENT_SYMBOL + SEPARATOR + VISUAL_TOKEN
 * Deterministic: same (plaintext, rendererVersion) always renders the same glyph sequence, so the
 * message doesn't flicker between renders while displayed.
 */

import { deriveRenderSeed } from './sha256';
import { classifyIntent, type IntentCategory } from './intentClassifier';

const PREFIXES = ['⟐', '◈', '❖', '✦'];
const SEPARATOR = '·';

// Small fixed alphabet used to build decorative, seed-derived visual tokens — deliberately
// styled to resemble the ILLUSION glyph set so PATTERN output reads as part of the same
// visual language, without encoding anything about the message content.
const TOKEN_ALPHABET = 'qwΜηєℓ7Xv4Ζσ9τяkPb';

const INTENT_SYMBOLS: Record<IntentCategory, string> = {
  URGENT: '‼',
  QUESTION: '?',
  TIME: '○',
  LOCATION: '⟐',
  REQUEST: '→',
  NEGATION: '-',
  AFFIRMATION: '+',
  GREETING: '~',
  FAREWELL: '»',
  ACKNOWLEDGEMENT: '✓',
  GENERAL: '•',
};

function buildVisualToken(seed: Uint8Array, offset: number, length = 3): string {
  let token = '';
  for (let i = 0; i < length; i++) {
    const byte = seed[(offset + i) % seed.length];
    token += TOKEN_ALPHABET[byte % TOKEN_ALPHABET.length];
  }
  return token;
}

/**
 * Renders a message as a PATTERN-mode intent hint. Deterministic and content-blind beyond the
 * coarse classified category.
 */
export function renderPattern(content: string, rendererVersion: number): string {
  if (!content) return '';

  const seed = deriveRenderSeed(content, rendererVersion, 'PATTERN');
  const intent = classifyIntent(content);

  const prefix = PREFIXES[seed[0] % PREFIXES.length];
  const symbol = INTENT_SYMBOLS[intent];
  const tokenA = buildVisualToken(seed, 1);
  const tokenB = buildVisualToken(seed, 4);

  return `${prefix} ${tokenA} ${SEPARATOR} ${symbol} ${SEPARATOR} ${tokenB}`;
}

export { INTENT_SYMBOLS };

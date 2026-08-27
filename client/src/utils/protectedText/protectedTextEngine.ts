/**
 * ProtectedTextEngine — Protected Text v2 strategy dispatcher.
 *
 * Routes plaintext through one of the local Layer 2 Visual Privacy rendering strategies:
 *
 *   ProtectedTextEngine
 *   ├── HomoglyphRenderer  (existing, unchanged)
 *   ├── IllusionRenderer   (new)
 *   └── PatternRenderer    (new, uses the local IntentClassifier)
 *
 * `ADAPTIVE` is reserved for a future mode that picks a strategy per-message; it is intentionally
 * NOT implemented here (falls back to HOMOGLYPH), per spec §16.
 *
 * This is a presentation-layer transform only. It is NOT encryption, does not touch the E2EE
 * pipeline, and never leaves the local device. Any renderer error must be handled by the caller
 * as fail-closed (never fall back to displaying plaintext) — this module intentionally does not
 * swallow errors itself so callers can render their own safe fallback UI.
 */

import { renderHomoglyph } from './homoglyphRenderer';
import { renderIllusion } from './illusionRenderer';
import { renderPattern } from './patternRenderer';

export const PROTECTED_RENDERER_VERSION = 2;

export type ProtectionMode = 'HOMOGLYPH' | 'ILLUSION' | 'PATTERN' | 'ADAPTIVE';

export const PROTECTION_MODES: ProtectionMode[] = ['HOMOGLYPH', 'ILLUSION', 'PATTERN'];

/**
 * Transforms plaintext into its protected representation for the given mode. Deterministic,
 * stateless, and synchronous. Throws on an unrecognized mode value rather than silently falling
 * back to plaintext.
 */
export function protect(content: string, mode: ProtectionMode = 'HOMOGLYPH'): string {
  if (!content) return '';

  switch (mode) {
    case 'HOMOGLYPH':
      return renderHomoglyph(content);
    case 'ILLUSION':
      return renderIllusion(content, PROTECTED_RENDERER_VERSION);
    case 'PATTERN':
      return renderPattern(content, PROTECTED_RENDERER_VERSION);
    case 'ADAPTIVE':
      // Not implemented yet (spec §16) — use the most conservative existing mode.
      return renderHomoglyph(content);
    default:
      throw new Error(`Unsupported protection mode: ${mode as string}`);
  }
}

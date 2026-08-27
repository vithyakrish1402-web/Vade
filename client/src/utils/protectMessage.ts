/**
 * Visual Privacy Engine — Protected Message Transformation Utility
 *
 * @deprecated Kept for backward compatibility. New code should use
 * `client/src/utils/protectedText/protectedTextEngine.ts` (`protect(content, mode)`), which
 * supports HOMOGLYPH plus the newer ILLUSION and PATTERN rendering modes. This module now just
 * re-exports the HOMOGLYPH strategy so existing imports and tests keep working unchanged.
 *
 * NOTE: This is a Layer 2 Visual Privacy feature and is NOT cryptographic encryption.
 */

export { HOMOGLYPH_MAP, renderHomoglyph as protectMessage } from './protectedText/homoglyphRenderer';

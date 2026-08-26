package com.enctxt.core.privacy

/**
 * Visual Privacy Engine — Protected Message Rendering (Layer 2)
 *
 * Transforms human-readable plaintext into a deterministic, visually protected
 * representation using Unicode homoglyph substitution to prevent casual
 * shoulder-surfing and screen observation.
 *
 * This is NOT cryptographic encryption. E2EE (Layer 1) handles cryptographic
 * message protection. This engine is responsible only for Layer 2 visual privacy.
 *
 * Contract:
 * - Pure, deterministic, stateless, side-effect free
 * - Same input always produces same output
 * - Preserves numbers, punctuation, whitespace, emojis, and multiline layout
 * - International scripts (Hindi, Chinese, Japanese, Korean, Arabic) pass through safely
 * - Unicode-safe iteration: never splits surrogate pairs or combining marks
 * - Canonical mapping matches Web implementation (client/src/utils/protectMessage.ts)
 */
object ProtectedTextEngine {

    // ========================================================================
    // Canonical Homoglyph Mapping (synchronized with Web protectMessage.ts)
    // ========================================================================

    private val homoglyphMap: Map<Char, Char> = mapOf(
        // Uppercase Latin → Visual Homoglyphs
        'A' to 'Λ',
        'B' to 'Β',   // Greek Capital Beta
        'C' to 'С',   // Cyrillic Capital Es
        'D' to 'Δ',
        'E' to 'Є',   // Ukrainian Capital Ie
        'F' to 'Ϝ',   // Greek Capital Digamma
        'G' to 'G',   // No mapping (preserves original)
        'H' to 'Н',   // Cyrillic Capital En
        'I' to 'Ι',   // Greek Capital Iota
        'J' to 'Ј',   // Cyrillic Capital Je
        'K' to 'Κ',   // Greek Capital Kappa
        'L' to 'L',   // No mapping
        'M' to 'Μ',   // Greek Capital Mu
        'N' to 'Ν',   // Greek Capital Nu
        'O' to 'Ø',   // Latin Capital O with Stroke
        'P' to 'Ρ',   // Greek Capital Rho
        'Q' to 'Q',   // No mapping
        'R' to 'R',   // No mapping
        'S' to 'Ѕ',   // Cyrillic Capital Dze
        'T' to 'Τ',   // Greek Capital Tau
        'U' to 'U',   // No mapping
        'V' to 'V',   // No mapping
        'W' to 'W',   // No mapping
        'X' to 'Χ',   // Greek Capital Chi
        'Y' to 'Υ',   // Greek Capital Upsilon
        'Z' to 'Ζ',   // Greek Capital Zeta

        // Lowercase Latin → Visual Homoglyphs
        'a' to 'α',   // Greek Small Alpha
        'b' to 'в',   // Cyrillic Small Ve
        'c' to 'с',   // Cyrillic Small Es
        'd' to 'd',   // No mapping
        'e' to 'є',   // Ukrainian Small Ie
        'f' to 'f',   // No mapping
        'g' to 'g',   // No mapping
        'h' to 'h',   // No mapping
        'i' to 'ι',   // Greek Small Iota
        'j' to 'ј',   // Cyrillic Small Je
        'k' to 'к',   // Cyrillic Small Ka
        'l' to 'l',   // No mapping
        'm' to 'м',   // Cyrillic Small Em
        'n' to 'η',   // Greek Small Eta
        'o' to 'σ',   // Greek Small Sigma
        'p' to 'ρ',   // Greek Small Rho
        'q' to 'q',   // No mapping
        'r' to 'r',   // No mapping
        's' to 'ѕ',   // Cyrillic Small Dze
        't' to 'т',   // Cyrillic Small Te
        'u' to 'υ',   // Greek Small Upsilon
        'v' to 'ν',   // Greek Small Nu
        'w' to 'w',   // No mapping
        'x' to 'χ',   // Greek Small Chi
        'y' to 'у',   // Cyrillic Small U
        'z' to 'z'    // No mapping
    )

    /**
     * Transforms readable message text into a visually protected representation.
     *
     * Guarantees:
     * - Deterministic: identical input yields exact identical output
     * - Preserves numbers, punctuation, spaces, and multiline line breaks
     * - Preserves multi-byte Unicode sequences and emojis without corruption
     * - Safe fallback: unsupported international scripts (Devanagari, CJK, etc.) pass through safely
     *
     * @param content The original readable message content
     * @return The visually protected string
     */
    fun protect(content: String): String {
        if (content.isEmpty()) return ""

        val result = StringBuilder(content.length)

        // Unicode-safe code point iteration — never splits surrogate pairs
        var i = 0
        while (i < content.length) {
            val codePoint = content.codePointAt(i)
            val charCount = Character.charCount(codePoint)

            if (charCount == 1) {
                // BMP character — check homoglyph map
                val ch = codePoint.toChar()
                val replacement = homoglyphMap[ch]
                if (replacement != null) {
                    result.append(replacement)
                } else {
                    result.append(ch)
                }
            } else {
                // Supplementary plane character (emoji, etc.) — preserve intact
                result.appendCodePoint(codePoint)
            }

            i += charCount
        }

        return result.toString()
    }
}

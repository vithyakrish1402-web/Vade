package com.enctxt.core.privacy

/**
 * HOMOGLYPH rendering strategy — Protected Text v2's ProtectedTextEngine.
 *
 * This is the original Layer 2 Visual Privacy transformation (unchanged), extracted verbatim
 * from the legacy [ProtectedTextEngine] object into the strategy-based engine. Behavior,
 * mapping, and output are byte-for-byte identical to the pre-v2 implementation — all existing
 * test vectors must continue to pass unmodified. Canonical mapping matches the Web
 * implementation (client/src/utils/protectedText/homoglyphRenderer.ts).
 */
object HomoglyphRenderer {

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

package com.enctxt.core.privacy

/**
 * ILLUSION rendering strategy — Protected Text v2.
 *
 * Produces a partially-distorted, leetspeak-like rendering of the message: readable enough for
 * someone who knows the "visual language" to follow along, but harder for a casual observer to
 * read at a glance. This is NOT full obfuscation (see [HomoglyphRenderer] for that) and NOT
 * encryption.
 *
 * Determinism: output depends only on (plaintext, rendererVersion, "ILLUSION") via [RenderSeed].
 * Must produce byte-identical output to the Web implementation
 * (client/src/utils/protectedText/illusionRenderer.ts) — verified via shared cross-platform
 * test vectors.
 */
object IllusionRenderer {

    // Multiple visual candidates per letter, in a fixed priority order (spec §6). Letters not
    // listed here are never transformed — they always pass through unchanged.
    private val candidates: Map<Char, List<Char>> = mapOf(
        'a' to listOf('4', 'α', '@'),
        'e' to listOf('3', 'є', '€'),
        'i' to listOf('1', 'ι', '!'),
        'o' to listOf('0', 'σ', 'ο'),
        's' to listOf('5', 'ѕ', '$'),
        't' to listOf('7', 'τ'),
        'g' to listOf('9'),
        'b' to listOf('8'),
        'h' to listOf('ħ'),
        'n' to listOf('η'),
        'r' to listOf('я'),
        'u' to listOf('υ'),
        'c' to listOf('¢'),
        'x' to listOf('×'),
        'y' to listOf('γ')
    )

    // Fraction (out of 100) of ELIGIBLE letters that get transformed — tuned so the overall
    // fraction of TOTAL characters transformed lands in the spec's 20-45% target band for
    // normal prose. Must match the Web implementation's threshold exactly.
    private const val TRANSFORM_THRESHOLD = 65

    /**
     * Transforms readable message text into a deterministic, partially-distorted "illusion"
     * rendering. Preserves word boundaries, whitespace (including tabs/newlines), punctuation,
     * numbers, emoji, non-Latin scripts, and URL structure.
     */
    fun protect(content: String, rendererVersion: Int): String {
        if (content.isEmpty()) return ""

        val seed = RenderSeed.derive(content, rendererVersion, "ILLUSION")
        val result = StringBuilder(content.length)
        var eligibleIndex = 0
        var i = 0

        while (i < content.length) {
            if (isUrlStart(content, i)) {
                val start = i
                while (i < content.length && !content[i].isWhitespace()) i++
                result.append(content, start, i)
                continue
            }

            val codePoint = content.codePointAt(i)
            val charCount = Character.charCount(codePoint)

            if (charCount == 1) {
                val ch = codePoint.toChar()

                if (ch.isWhitespace()) {
                    result.append(ch)
                    i++
                    continue
                }

                val letterCandidates = candidates[ch.lowercaseChar()]
                if (letterCandidates == null) {
                    result.append(ch)
                    i++
                    continue
                }

                val b = seed[eligibleIndex % seed.size].toInt() and 0xFF
                eligibleIndex++

                if (b % 100 < TRANSFORM_THRESHOLD) {
                    val candidateIndex = (b / 100) % letterCandidates.size
                    result.append(letterCandidates[candidateIndex])
                } else {
                    result.append(ch)
                }
                i++
            } else {
                // Supplementary plane character (emoji, etc.) — preserve intact, not eligible.
                result.appendCodePoint(codePoint)
                i += charCount
            }
        }

        return result.toString()
    }

    private fun isUrlStart(content: String, index: Int): Boolean {
        return content.regionMatches(index, "http://", 0, 7, ignoreCase = true) ||
            content.regionMatches(index, "https://", 0, 8, ignoreCase = true) ||
            content.regionMatches(index, "www.", 0, 4, ignoreCase = true)
    }
}

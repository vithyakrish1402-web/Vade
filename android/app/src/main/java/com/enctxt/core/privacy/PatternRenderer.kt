package com.enctxt.core.privacy

/**
 * PATTERN rendering strategy — Protected Text v2.
 *
 * Shows only a coarse, locally-classified intent hint as an abstract glyph sequence. The actual
 * plaintext is NEVER encoded — only the classified [IntentCategory] plus decorative, seed-derived
 * filler glyphs pulled from a small fixed alphabet.
 *
 * Fixed grammar (spec §14): PREFIX + VISUAL_TOKEN + SEPARATOR + INTENT_SYMBOL + SEPARATOR + VISUAL_TOKEN
 * Must match the Web implementation (client/src/utils/protectedText/patternRenderer.ts) exactly.
 */
object PatternRenderer {

    private val PREFIXES = listOf("⟐", "◈", "❖", "✦")
    private const val SEPARATOR = "·"
    private const val TOKEN_ALPHABET = "qwΜηєℓ7Xv4Ζσ9τяkPb"

    val INTENT_SYMBOLS: Map<IntentCategory, String> = mapOf(
        IntentCategory.URGENT to "‼",
        IntentCategory.QUESTION to "?",
        IntentCategory.TIME to "○",
        IntentCategory.LOCATION to "⟐",
        IntentCategory.REQUEST to "→",
        IntentCategory.NEGATION to "-",
        IntentCategory.AFFIRMATION to "+",
        IntentCategory.GREETING to "~",
        IntentCategory.FAREWELL to "»",
        IntentCategory.ACKNOWLEDGEMENT to "✓",
        IntentCategory.GENERAL to "•"
    )

    private fun buildVisualToken(seed: ByteArray, offset: Int, length: Int = 3): String {
        val sb = StringBuilder(length)
        for (i in 0 until length) {
            val byte = seed[(offset + i) % seed.size].toInt() and 0xFF
            sb.append(TOKEN_ALPHABET[byte % TOKEN_ALPHABET.length])
        }
        return sb.toString()
    }

    /**
     * Renders a message as a PATTERN-mode intent hint. Deterministic and content-blind beyond
     * the coarse classified category.
     */
    fun protect(content: String, rendererVersion: Int): String {
        if (content.isEmpty()) return ""

        val seed = RenderSeed.derive(content, rendererVersion, "PATTERN")
        val intent = IntentClassifier.classify(content)

        val prefix = PREFIXES[(seed[0].toInt() and 0xFF) % PREFIXES.size]
        val symbol = INTENT_SYMBOLS.getValue(intent)
        val tokenA = buildVisualToken(seed, 1)
        val tokenB = buildVisualToken(seed, 4)

        return "$prefix $tokenA $SEPARATOR $symbol $SEPARATOR $tokenB"
    }
}

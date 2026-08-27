package com.enctxt.core.privacy

/**
 * Local intent classifier — Protected Text v2.
 *
 * Classifies a plaintext message into one coarse category, entirely on-device, using simple
 * deterministic keyword/regex heuristics. This exists only to drive PATTERN mode's abstract
 * glyph selection — the classification result is never persisted or transmitted anywhere.
 *
 * Privacy > accuracy: false positives are acceptable (spec §12/§13). Categories are
 * deliberately coarse (e.g. "TIME", not "8pm meeting") so PATTERN mode cannot leak specifics.
 *
 * Must match the Web implementation (client/src/utils/protectedText/intentClassifier.ts)
 * exactly — same keyword lists, same first-match-wins priority order.
 */
enum class IntentCategory {
    URGENT, QUESTION, TIME, LOCATION, REQUEST, NEGATION, AFFIRMATION, GREETING, FAREWELL,
    ACKNOWLEDGEMENT, GENERAL
}

object IntentClassifier {

    private val URGENT_KEYWORDS = listOf("urgent", "emergency", "asap", "right now", "immediately", "help me")
    private val INTERROGATIVE_STARTERS = setOf(
        "who", "what", "when", "where", "why", "how",
        "can", "could", "would", "should", "is", "are", "do", "does", "did", "will"
    )
    private val TIME_KEYWORDS = listOf(
        "today", "tomorrow", "tonight", "yesterday", "morning", "afternoon", "evening", "noon", "midnight",
        "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"
    )
    private val TIME_PATTERN = Regex("""\b\d{1,2}(:\d{2})?\s?(am|pm)\b""", RegexOption.IGNORE_CASE)
    private val LOCATION_KEYWORDS = listOf(
        "station", "airport", "address", "location", "near", "building",
        "office", "home", "street", "road", "avenue", "mall", "park", "restaurant", "meet me at"
    )
    private val REQUEST_KEYWORDS = listOf("please", "can you", "could you", "would you", "send me", "give me", "help me with")
    private val NEGATION_KEYWORDS = listOf("don't", "doesn't", "not", "never", "no", "nope", "can't", "won't")
    private val AFFIRMATION_KEYWORDS = listOf("yes", "yeah", "yep", "sure", "affirmative", "agreed", "absolutely")
    private val GREETING_KEYWORDS = listOf("hello", "hi", "hey", "good morning", "good afternoon", "good evening", "yo", "hola")
    private val FAREWELL_KEYWORDS = listOf("bye", "goodbye", "see you", "take care", "farewell", "later")
    private val ACKNOWLEDGEMENT_KEYWORDS = listOf("got it", "noted", "understood", "roger", "thanks", "thank you", "ack", "ok", "okay")

    private fun containsAny(haystack: String, needles: List<String>): Boolean {
        return needles.any { needle -> Regex("\\b${Regex.escape(needle)}\\b", RegexOption.IGNORE_CASE).containsMatchIn(haystack) }
    }

    private fun startsWithAny(haystack: String, needles: List<String>): Boolean {
        return needles.any { needle -> Regex("^${Regex.escape(needle)}\\b", RegexOption.IGNORE_CASE).containsMatchIn(haystack) }
    }

    private fun countExclamations(text: String): Int = text.count { it == '!' }

    /**
     * Classifies a plaintext message into one coarse intent category. Deterministic,
     * first-match-wins against a fixed priority order. Never throws — always returns a
     * category ([IntentCategory.GENERAL] is the fallback default).
     */
    fun classify(content: String): IntentCategory {
        if (content.isEmpty()) return IntentCategory.GENERAL

        val trimmed = content.trim()
        val lower = trimmed.lowercase()
        val firstWord = lower.split(Regex("\\s+")).firstOrNull()?.replace(Regex("[^a-z']"), "") ?: ""

        if (containsAny(lower, URGENT_KEYWORDS) || countExclamations(trimmed) >= 2) {
            return IntentCategory.URGENT
        }

        if (trimmed.endsWith("?") || INTERROGATIVE_STARTERS.contains(firstWord)) {
            return IntentCategory.QUESTION
        }

        if (startsWithAny(lower, GREETING_KEYWORDS)) {
            return IntentCategory.GREETING
        }

        if (containsAny(lower, TIME_KEYWORDS) || TIME_PATTERN.containsMatchIn(lower)) {
            return IntentCategory.TIME
        }

        if (containsAny(lower, LOCATION_KEYWORDS)) {
            return IntentCategory.LOCATION
        }

        if (containsAny(lower, REQUEST_KEYWORDS)) {
            return IntentCategory.REQUEST
        }

        if (containsAny(lower, NEGATION_KEYWORDS)) {
            return IntentCategory.NEGATION
        }

        if (containsAny(lower, AFFIRMATION_KEYWORDS)) {
            return IntentCategory.AFFIRMATION
        }

        if (containsAny(lower, FAREWELL_KEYWORDS)) {
            return IntentCategory.FAREWELL
        }

        if (containsAny(lower, ACKNOWLEDGEMENT_KEYWORDS)) {
            return IntentCategory.ACKNOWLEDGEMENT
        }

        return IntentCategory.GENERAL
    }
}

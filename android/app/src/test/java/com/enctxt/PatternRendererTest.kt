package com.enctxt

import com.enctxt.core.privacy.IntentClassifier
import com.enctxt.core.privacy.PatternRenderer
import org.junit.Assert.*
import org.junit.Test

class PatternRendererTest {

    private val version = 2

    @Test
    fun testEmptyStringReturnsEmptyString() {
        assertEquals("", PatternRenderer.protect("", version))
    }

    @Test
    fun testIsDeterministic() {
        val input = "Are you coming tonight?"
        assertEquals(PatternRenderer.protect(input, version), PatternRenderer.protect(input, version))
    }

    @Test
    fun testDifferentMessagesProduceDifferentOutput() {
        val a = PatternRenderer.protect("Are you coming tonight?", version)
        val b = PatternRenderer.protect("Meet me at the station", version)
        assertNotEquals(a, b)
    }

    @Test
    fun testNeverContainsOriginalPlaintextWords() {
        val input = "The confidential project codename is Falcon"
        val output = PatternRenderer.protect(input, version).lowercase()
        for (word in input.split(Regex("\\s+"))) {
            val cleaned = word.replace(Regex("[^a-zA-Z]"), "")
            if (cleaned.length > 2) {
                assertFalse(output.contains(cleaned.lowercase()))
            }
        }
    }

    @Test
    fun testEmbedsCorrectIntentSymbol() {
        val input = "Are you coming tonight?"
        val intent = IntentClassifier.classify(input)
        val output = PatternRenderer.protect(input, version)
        assertTrue(output.contains(PatternRenderer.INTENT_SYMBOLS.getValue(intent)))
    }

    @Test
    fun testFollowsFixedGrammar() {
        val output = PatternRenderer.protect("Hello there", version)
        val parts = output.split(" ")
        assertEquals(6, parts.size)
        assertEquals("·", parts[2])
        assertEquals("·", parts[4])
    }
}

package com.enctxt

import com.enctxt.core.privacy.IllusionRenderer
import org.junit.Assert.*
import org.junit.Test

class IllusionRendererTest {

    private val version = 2

    // ========================================================================
    // Determinism & purity
    // ========================================================================

    @Test
    fun testDeterminism_sameInputProducesSameOutput() {
        val input = "meet me at the station"
        val first = IllusionRenderer.protect(input, version)
        val second = IllusionRenderer.protect(input, version)
        val third = IllusionRenderer.protect(input, version)

        assertEquals(first, second)
        assertEquals(second, third)
    }

    @Test
    fun testInputImmutability() {
        val input = "Immutable original message"
        IllusionRenderer.protect(input, version)
        assertEquals("Immutable original message", input)
    }

    @Test
    fun testDifferentVersionProducesDifferentOutput() {
        val input = "Are you coming tonight?"
        val v2 = IllusionRenderer.protect(input, 2)
        val v3 = IllusionRenderer.protect(input, 3)
        assertNotEquals(v2, v3)
    }

    @Test
    fun testEmptyStringReturnsEmptyString() {
        assertEquals("", IllusionRenderer.protect("", version))
    }

    // ========================================================================
    // Structure preservation
    // ========================================================================

    @Test
    fun testPreservesWordBoundaries() {
        val input = "meet me at the station"
        val output = IllusionRenderer.protect(input, version)
        assertEquals(input.split(" ").size, output.split(" ").size)
    }

    @Test
    fun testPreservesNewlinesAndTabs() {
        val input = "Line 1\n\nLine 2 with\ttabs"
        val output = IllusionRenderer.protect(input, version)
        assertTrue(output.contains("\n\n"))
        assertTrue(output.contains("\t"))
    }

    @Test
    fun testPreservesPunctuation() {
        val input = "Are you ready? Yes! (Maybe...)"
        val output = IllusionRenderer.protect(input, version)
        assertTrue(output.contains("?"))
        assertTrue(output.contains("!"))
        assertTrue(output.contains("("))
        assertTrue(output.contains(")"))
        assertTrue(output.contains("..."))
    }

    @Test
    fun testPreservesNumbers() {
        val input = "Meet me at 7 PM, room 1234567890"
        val output = IllusionRenderer.protect(input, version)
        assertTrue(output.contains("1234567890"))
        assertTrue(output.contains("7"))
    }

    @Test
    fun testPreservesEmoji() {
        val input = "See you soon 😊🚀👋✨"
        val output = IllusionRenderer.protect(input, version)
        assertTrue(output.contains("😊"))
        assertTrue(output.contains("🚀"))
        assertTrue(output.contains("👋"))
        assertTrue(output.contains("✨"))
    }

    @Test
    fun testPreservesNonLatinScripts() {
        val hindi = "नमस्ते आप कैसे हैं?"
        val chinese = "你好，世界！"
        val japanese = "こんにちは！元気ですか？"
        assertEquals(hindi, IllusionRenderer.protect(hindi, version))
        assertEquals(chinese, IllusionRenderer.protect(chinese, version))
        assertEquals(japanese, IllusionRenderer.protect(japanese, version))
    }

    @Test
    fun testPreservesUrlStructure() {
        val input = "Check https://Example.com/Secret-Path for details"
        val output = IllusionRenderer.protect(input, version)
        assertTrue(output.contains("https://Example.com/Secret-Path"))
    }

    @Test
    fun testNeverTransformsLettersOutsideCandidateTable() {
        val input = "d f j k l m p q v w z D F J K L M P Q V W Z"
        val output = IllusionRenderer.protect(input, version)
        assertEquals(input, output)
    }

    // ========================================================================
    // Not full unreadability
    // ========================================================================

    @Test
    fun testLeavesSomeEligibleLettersUntransformed() {
        val input = ("a e i o s t g b h n r u c x y ").repeat(4).trim()
        val output = IllusionRenderer.protect(input, version)
        assertNotEquals(input, output)
        val survivedOriginalLetters = output.any { "aeiostgbhnrucxy".contains(it) }
        assertTrue(survivedOriginalLetters)
    }

    // ========================================================================
    // Transformation ratio band (~20-45% of total characters for normal prose)
    // ========================================================================

    @Test
    fun testTransformationRatioBand() {
        val sentences = listOf(
            "meet me at the station",
            "Are you coming tonight?",
            "Hello, how are you?",
            "See you soon, take care and have a great evening",
            "Please send the report before the meeting starts tomorrow morning"
        )

        val ratios = sentences.map { sentence ->
            val output = IllusionRenderer.protect(sentence, version)
            var changed = 0
            for (i in sentence.indices) {
                if (output[i] != sentence[i]) changed++
            }
            changed.toDouble() / sentence.length
        }

        val avg = ratios.average()
        assertTrue("average ratio $avg should be > 0.15", avg > 0.15)
        assertTrue("average ratio $avg should be < 0.5", avg < 0.5)
    }

    // ========================================================================
    // Performance
    // ========================================================================

    @Test
    fun testPerformanceOn5000CharMessage() {
        val input = "Confidential privacy message test line! ".repeat(125).take(5000)
        val start = System.nanoTime()
        val output = IllusionRenderer.protect(input, version)
        val durationMs = (System.nanoTime() - start) / 1_000_000.0

        assertEquals(5000, output.length)
        assertTrue("duration was ${durationMs}ms", durationMs < 50)
    }
}

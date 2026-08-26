package com.enctxt

import com.enctxt.core.privacy.ProtectedTextEngine
import org.junit.Assert.*
import org.junit.Test

class ProtectedTextEngineTest {

    // ========================================================================
    // 1. Determinism & Purity
    // ========================================================================

    @Test
    fun testDeterminism_sameInputProducesSameOutput() {
        val input = "Meet me at 7 PM near the station!"
        val first = ProtectedTextEngine.protect(input)
        val second = ProtectedTextEngine.protect(input)
        val third = ProtectedTextEngine.protect(input)

        assertEquals(first, second)
        assertEquals(second, third)
        assertNotEquals(input, first)
    }

    @Test
    fun testInputImmutability() {
        val input = "Immutable original message"
        val output = ProtectedTextEngine.protect(input)

        assertEquals("Immutable original message", input)
        assertNotEquals(input, output)
    }

    @Test
    fun testEmptyStringReturnsEmptyString() {
        assertEquals("", ProtectedTextEngine.protect(""))
    }

    // ========================================================================
    // 2. Latin Uppercase Mapping
    // ========================================================================

    @Test
    fun testUppercaseLatinTransformation() {
        val input = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
        val expected = "ΛΒСΔЄϜGНΙЈΚLΜΝØΡQRЅΤUVWΧΥΖ"
        assertEquals(expected, ProtectedTextEngine.protect(input))
    }

    // ========================================================================
    // 3. Latin Lowercase Mapping
    // ========================================================================

    @Test
    fun testLowercaseLatinTransformation() {
        val input = "abcdefghijklmnopqrstuvwxyz"
        val expected = "αвсdєfghιјкlмησρqrѕтυνwχуz"
        assertEquals(expected, ProtectedTextEngine.protect(input))
    }

    // ========================================================================
    // 4. Mixed Case Sentences
    // ========================================================================

    @Test
    fun testMixedCaseSentence() {
        assertEquals("Нєllσ Wσrld", ProtectedTextEngine.protect("Hello World"))
    }

    @Test
    fun testMixedCaseSentenceWithEmoji() {
        assertEquals("Ѕєє уσυ ѕσση 😊🚀👋✨", ProtectedTextEngine.protect("See you soon 😊🚀👋✨"))
    }

    // ========================================================================
    // 5. Numbers Preservation
    // ========================================================================

    @Test
    fun testNumbersPreserved() {
        assertEquals("1234567890", ProtectedTextEngine.protect("1234567890"))
    }

    @Test
    fun testNumbersInContext() {
        val output = ProtectedTextEngine.protect("Code 1234567890")
        assertTrue(output.contains("1234567890"))
    }

    // ========================================================================
    // 6. Punctuation Preservation
    // ========================================================================

    @Test
    fun testPunctuationPreserved() {
        val output = ProtectedTextEngine.protect("Test @#\$%^&*()")
        assertTrue(output.contains("@"))
        assertTrue(output.contains("#"))
        assertTrue(output.contains("%"))
        assertTrue(output.contains("&"))
        assertTrue(output.contains("("))
        assertTrue(output.contains(")"))
    }

    // ========================================================================
    // 7. Whitespace Preservation
    // ========================================================================

    @Test
    fun testSpacesPreserved() {
        val output = ProtectedTextEngine.protect("word   word")
        assertTrue(output.contains("   "))
    }

    @Test
    fun testTabsPreserved() {
        val output = ProtectedTextEngine.protect("col1\tcol2")
        assertTrue(output.contains("\t"))
    }

    @Test
    fun testNewlinesPreserved() {
        val output = ProtectedTextEngine.protect("Line 1\n\nLine 2")
        assertTrue(output.contains("\n\n"))
    }

    // ========================================================================
    // 8. Emoji Safety
    // ========================================================================

    @Test
    fun testEmojiPreserved() {
        val input = "😊🚀👋🔒🛡️"
        val output = ProtectedTextEngine.protect(input)
        assertTrue(output.contains("😊"))
        assertTrue(output.contains("🚀"))
        assertTrue(output.contains("👋"))
        assertTrue(output.contains("🔒"))
    }

    @Test
    fun testComplexEmojiSequences() {
        // Family emoji with ZWJ
        val input = "Test 👨‍👩‍👧‍👦 end"
        val output = ProtectedTextEngine.protect(input)
        assertNotNull(output)
        assertTrue(output.isNotEmpty())
    }

    // ========================================================================
    // 9. International Scripts Passthrough
    // ========================================================================

    @Test
    fun testHindiPassthrough() {
        assertEquals("नमस्ते", ProtectedTextEngine.protect("नमस्ते"))
    }

    @Test
    fun testChinesePassthrough() {
        assertEquals("你好，世界！", ProtectedTextEngine.protect("你好，世界！"))
    }

    @Test
    fun testJapanesePassthrough() {
        assertEquals("こんにちは！", ProtectedTextEngine.protect("こんにちは！"))
    }

    @Test
    fun testKoreanPassthrough() {
        assertEquals("안녕하세요", ProtectedTextEngine.protect("안녕하세요"))
    }

    @Test
    fun testArabicPassthrough() {
        assertEquals("مرحبا", ProtectedTextEngine.protect("مرحبا"))
    }

    // ========================================================================
    // 10. Accented Latin Characters
    // ========================================================================

    @Test
    fun testAccentedLatinPreserved() {
        val output = ProtectedTextEngine.protect("Café and résumé")
        assertTrue(output.contains("é"))
        assertEquals("Сαfé αηd réѕυмé", output)
    }

    // ========================================================================
    // 11. Combining Characters
    // ========================================================================

    @Test
    fun testCombiningCharactersNotCorrupted() {
        // e + combining acute accent
        val input = "e\u0301"
        val output = ProtectedTextEngine.protect(input)
        assertNotNull(output)
        assertTrue(output.isNotEmpty())
    }

    // ========================================================================
    // 12. Performance
    // ========================================================================

    @Test
    fun testPerformance100Characters() {
        val input = "a".repeat(100)
        val start = System.nanoTime()
        val output = ProtectedTextEngine.protect(input)
        val durationMs = (System.nanoTime() - start) / 1_000_000.0

        assertEquals(100, output.length)
        assertTrue("100-char transformation took ${durationMs}ms, expected < 10ms", durationMs < 10.0)
    }

    @Test
    fun testPerformance1000Characters() {
        val input = "Quick brown fox jumps over the lazy dog. ".repeat(25)
        val output = ProtectedTextEngine.protect(input)

        assertEquals(input.length, output.length)
        assertFalse(output.contains("Quick"))
    }

    @Test
    fun testPerformance5000Characters() {
        val input = "Confidential privacy message test line! ".repeat(125).take(5000)
        val start = System.nanoTime()
        val output = ProtectedTextEngine.protect(input)
        val durationMs = (System.nanoTime() - start) / 1_000_000.0

        assertEquals(5000, output.length)
        assertTrue("5000-char transformation took ${durationMs}ms, expected < 50ms", durationMs < 50.0)
    }

    // ========================================================================
    // 13. Multiline Messages
    // ========================================================================

    @Test
    fun testMultilinePreservesLayout() {
        val input = "Line one\nLine two\nLine three"
        val output = ProtectedTextEngine.protect(input)
        assertEquals(3, output.split("\n").size)
    }
}

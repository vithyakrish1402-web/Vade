package com.enctxt

import com.enctxt.core.privacy.ProtectedTextEngine
import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * Cross-platform protected rendering test vectors.
 * These vectors are generated from the canonical Web implementation
 * (client/src/utils/protectMessage.ts) and stored in
 * docs/test-vectors/protected-rendering-test-vectors.json.
 *
 * Both Web and Android ProtectedTextEngine must produce identical output.
 */
class ProtectedRenderingCrossPlatformTest {

    data class RenderingVector(val input: String, val expected: String)

    private val vectors = listOf(
        RenderingVector("Hello World", "Нєllσ Wσrld"),
        RenderingVector("See you soon", "Ѕєє уσυ ѕσση"),
        RenderingVector("abcdefghijklmnopqrstuvwxyz", "αвсdєfghιјкlмησρqrѕтυνwχуz"),
        RenderingVector("ABCDEFGHIJKLMNOPQRSTUVWXYZ", "ΛΒСΔЄϜGНΙЈΚLΜΝØΡQRЅΤUVWΧΥΖ"),
        RenderingVector("1234567890", "1234567890"),
        RenderingVector("Hello! How are you?", "Нєllσ! Нσw αrє уσυ?"),
        RenderingVector("", ""),
        RenderingVector("Meet me at 7 PM near the station!", "Μєєт мє αт 7 ΡΜ ηєαr тhє ѕтαтιση!"),
        RenderingVector("Café and résumé", "Сαfé αηd réѕυмé"),
        RenderingVector("Line 1\n\nLine 2", "Lιηє 1\n\nLιηє 2"),
        RenderingVector("😊🚀👋🔒🛡️", "😊🚀👋🔒🛡️"),
        RenderingVector("नमस्ते", "नमस्ते"),
        RenderingVector("你好，世界！", "你好，世界！"),
        RenderingVector("こんにちは！", "こんにちは！"),
        RenderingVector("Test @#\$%^&*()", "Τєѕт @#\$%^&*()")
    )

    @Test
    fun testAllCrossPlatformVectorsMatch() {
        for ((index, vector) in vectors.withIndex()) {
            val actual = ProtectedTextEngine.protect(vector.input)
            assertEquals(
                "Cross-platform vector #$index failed for input: \"${vector.input}\"",
                vector.expected,
                actual
            )
        }
    }

    @Test
    fun testWebAndroidDeterministicConsistency() {
        // Verify all vectors produce stable repeated output
        for (vector in vectors) {
            val first = ProtectedTextEngine.protect(vector.input)
            val second = ProtectedTextEngine.protect(vector.input)
            assertEquals(
                "Non-deterministic output for input: \"${vector.input}\"",
                first,
                second
            )
        }
    }
}

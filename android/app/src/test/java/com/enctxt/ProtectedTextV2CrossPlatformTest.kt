package com.enctxt

import com.enctxt.core.privacy.IntentCategory
import com.enctxt.core.privacy.IntentClassifier
import com.enctxt.core.privacy.ProtectedRenderMode
import com.enctxt.core.privacy.ProtectedTextEngine
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * Cross-platform Protected Text v2 test vectors — loaded directly from
 * docs/test-vectors/protected-text-v2-test-vectors.json (a single source of truth shared with
 * the Web client's Vitest suite, exposed on this module's test classpath via the `sourceSets`
 * block in app/build.gradle.kts), rather than hand-copied into Kotlin.
 *
 * Vectors are generated from the canonical Web ProtectedTextEngine
 * (client/src/utils/protectedText/protectedTextEngine.ts). Android must produce byte-identical
 * `expected` output for every vector, and identical `expectedIntent` classification where present.
 */
class ProtectedTextV2CrossPlatformTest {

    @Serializable
    data class V2Vector(
        val description: String,
        val input: String,
        val mode: String,
        val rendererVersion: Int,
        val expected: String,
        val expectedIntent: String? = null
    )

    @Serializable
    data class V2VectorFile(val version: Int, val description: String, val vectors: List<V2Vector>)

    private val vectors: List<V2Vector> by lazy {
        val resource = javaClass.classLoader?.getResourceAsStream("protected-text-v2-test-vectors.json")
            ?: error("protected-text-v2-test-vectors.json not found on test classpath")
        val content = resource.bufferedReader(Charsets.UTF_8).use { it.readText() }
        Json { ignoreUnknownKeys = true }.decodeFromString<V2VectorFile>(content).vectors
    }

    @Test
    fun testLoadsNonEmptyVectorSet() {
        assert(vectors.isNotEmpty()) { "expected at least one test vector" }
    }

    @Test
    fun testAllVectorsProduceIdenticalOutputToWeb() {
        for (vector in vectors) {
            val mode = ProtectedRenderMode.valueOf(vector.mode)
            val actual = ProtectedTextEngine.protect(vector.input, mode)
            assertEquals(
                "[${vector.mode}] ${vector.description} — input: \"${vector.input}\"",
                vector.expected,
                actual
            )
        }
    }

    @Test
    fun testAllVectorsWithExpectedIntentClassifyIdenticallyToWeb() {
        for (vector in vectors) {
            val expectedIntent = vector.expectedIntent ?: continue
            val actual = IntentClassifier.classify(vector.input)
            assertEquals(
                "[${vector.mode}] ${vector.description} — input: \"${vector.input}\"",
                IntentCategory.valueOf(expectedIntent),
                actual
            )
        }
    }
}

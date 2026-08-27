package com.enctxt.core.privacy

import java.nio.charset.StandardCharsets
import java.security.MessageDigest

/**
 * Deterministic local seed derivation for Protected Text v2's visual rendering selection
 * (Illusion/Pattern modes).
 *
 * `seed = SHA-256(plaintext + ":" + rendererVersion + ":" + mode)`. This seed is used ONLY to
 * pick among approved visual substitutions — never as encryption/authentication material, and
 * never derived from or related to any E2EE key material.
 *
 * Matches the Web implementation (client/src/utils/protectedText/sha256.ts) byte-for-byte.
 */
object RenderSeed {
    fun derive(plaintext: String, rendererVersion: Int, mode: String): ByteArray {
        val composed = "$plaintext:$rendererVersion:$mode"
        val digest = MessageDigest.getInstance("SHA-256")
        return digest.digest(composed.toByteArray(StandardCharsets.UTF_8))
    }
}

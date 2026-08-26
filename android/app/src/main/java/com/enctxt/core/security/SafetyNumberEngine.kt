package com.enctxt.core.security

import java.nio.charset.StandardCharsets
import java.security.MessageDigest

/**
 * Computes deterministic, symmetric safety numbers between two users (Layer 4 — Identity Verification).
 *
 * Algorithm:
 * 1. Canonical lexicographical ordering of public key Base64 strings.
 * 2. Hash input: minKey + ":" + maxKey + ":v1" using SHA-256.
 * 3. Derive four 5-digit decimal blocks from the first 16 bytes (4 big-endian uint32s % 100000).
 * 4. Format into 4 groups × 5 decimal digits: "48321 72904 18273 66421".
 *
 * Properties:
 * - Deterministic: Same keypair produces the same safety number.
 * - Symmetric: calculateSafetyNumber(Alice, Bob) == calculateSafetyNumber(Bob, Alice).
 */
object SafetyNumberEngine {

    fun calculateSafetyNumber(publicKeyA: String, publicKeyB: String): String {
        val a = publicKeyA.trim()
        val b = publicKeyB.trim()
        val minKey = if (a <= b) a else b
        val maxKey = if (a <= b) b else a
        val canonicalString = "$minKey:$maxKey:v1"

        val digest = MessageDigest.getInstance("SHA-256")
            .digest(canonicalString.toByteArray(StandardCharsets.UTF_8))

        val blocks = mutableListOf<String>()
        for (i in 0 until 4) {
            val offset = i * 4
            val value = ((digest[offset].toLong() and 0xFF) shl 24) or
                    ((digest[offset + 1].toLong() and 0xFF) shl 16) or
                    ((digest[offset + 2].toLong() and 0xFF) shl 8) or
                    (digest[offset + 3].toLong() and 0xFF)
            val formatted = (value % 100000).toString().padStart(5, '0')
            blocks.add(formatted)
        }

        return blocks.joinToString(" ")
    }
}

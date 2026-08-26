package com.enctxt.core.security

import java.security.MessageDigest
import java.util.Base64

/**
 * Computes deterministic, human-readable cryptographic public-key fingerprints (Layer 4 — Identity Verification).
 *
 * Algorithm:
 * 1. Decode public key Base64 SPKI to raw binary bytes.
 * 2. Hash raw bytes using SHA-256.
 * 3. Format first 32 hex characters into 8 groups of 4 uppercase hex characters
 *    (e.g. "A7D4 92F1 8C20 4E73 19AB 63D0 7F2A 91CC").
 */
object FingerprintEngine {

    /**
     * Calculates SHA-256 public key fingerprint formatted into 8 groups of 4 hexadecimal characters.
     */
    fun calculateFingerprint(spkiBase64: String): String {
        val trimmed = spkiBase64.trim()
        val spkiBytes = Base64.getDecoder().decode(trimmed)
        return calculateFingerprint(spkiBytes)
    }

    /**
     * Calculates SHA-256 public key fingerprint from raw SPKI bytes.
     */
    fun calculateFingerprint(spkiBytes: ByteArray): String {
        val digest = MessageDigest.getInstance("SHA-256").digest(spkiBytes)
        val hex = digest.joinToString("") { "%02X".format(it) }
        // First 32 hex characters into 8 groups of 4
        return hex.substring(0, 32).chunked(4).joinToString(" ")
    }
}

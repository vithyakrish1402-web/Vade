package com.enctxt

import com.enctxt.core.security.FingerprintEngine
import com.enctxt.core.security.KeyStoreManager
import org.junit.Assert.*
import org.junit.Test

class FingerprintEngineTest {

    private val alicePublicKeySpkiBase64 =
        "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEawMQ2rcQ7O3eTx0A3MmKjcMKOcqAuojgM68JwnxzDSpi40mxKcY2A/dWMdWvp0C3sGX/aXjlwmzMLOV+EAVJdg=="

    private val bobPublicKeySpkiBase64 =
        "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEJ7Os1SMBOvYE78qWI3qRiHNcNDf9KevsKZSbJWrD8iRYKQP+ho7+QEZUVIfxuv03wn7V5hvgLMEGXYuaQdgZNg=="

    @Test
    fun `produces deterministic formatted SHA-256 fingerprints`() {
        val fp1 = FingerprintEngine.calculateFingerprint(alicePublicKeySpkiBase64)
        val fp2 = FingerprintEngine.calculateFingerprint(alicePublicKeySpkiBase64)

        assertEquals(fp1, fp2)
        // Format: 8 groups of 4 hex characters separated by spaces
        val regex = Regex("^[0-9A-F]{4}( [0-9A-F]{4}){7}$")
        assertTrue("Fingerprint must match 8x4 hex format: $fp1", regex.matches(fp1))
    }

    @Test
    fun `matches cross-platform test vectors for Alice and Bob`() {
        val aliceFp = FingerprintEngine.calculateFingerprint(alicePublicKeySpkiBase64)
        val bobFp = FingerprintEngine.calculateFingerprint(bobPublicKeySpkiBase64)

        assertEquals("9CAC FDE8 1994 6579 DD94 EE76 B00E 14F4", aliceFp)
        assertEquals("BF41 20A1 9DEA 2447 C384 CBBB 886B 29B8", bobFp)
    }

    @Test
    fun `generates distinct fingerprints for distinct identity keys`() {
        val aliceFp = FingerprintEngine.calculateFingerprint(alicePublicKeySpkiBase64)
        val bobFp = FingerprintEngine.calculateFingerprint(bobPublicKeySpkiBase64)

        assertNotEquals(aliceFp, bobFp)
    }

    @Test
    fun `handles whitespace and trims cleanly`() {
        val clean = FingerprintEngine.calculateFingerprint(alicePublicKeySpkiBase64)
        val withWhitespace = FingerprintEngine.calculateFingerprint("  \n" + alicePublicKeySpkiBase64 + " \t\n")

        assertEquals(clean, withWhitespace)
    }
}

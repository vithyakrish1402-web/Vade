package com.enctxt

import com.enctxt.core.security.SafetyNumberEngine
import org.junit.Assert.*
import org.junit.Test

class SafetyNumberEngineTest {

    private val alicePublicKeySpkiBase64 =
        "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEawMQ2rcQ7O3eTx0A3MmKjcMKOcqAuojgM68JwnxzDSpi40mxKcY2A/dWMdWvp0C3sGX/aXjlwmzMLOV+EAVJdg=="

    private val bobPublicKeySpkiBase64 =
        "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEJ7Os1SMBOvYE78qWI3qRiHNcNDf9KevsKZSbJWrD8iRYKQP+ho7+QEZUVIfxuv03wn7V5hvgLMEGXYuaQdgZNg=="

    private val charliePublicKeySpkiBase64 =
        "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE7yO76p7o9oZtE71s1m1eXhV98yVdYyQ957sN1q2s3w8j4h5k6l7m8n9o0p1q2r3s4t5u6v7w8x9y0z1a2b3c4d=="

    @Test
    fun `derives identical safety numbers regardless of participant order (Symmetry)`() {
        val snAliceBob = SafetyNumberEngine.calculateSafetyNumber(alicePublicKeySpkiBase64, bobPublicKeySpkiBase64)
        val snBobAlice = SafetyNumberEngine.calculateSafetyNumber(bobPublicKeySpkiBase64, alicePublicKeySpkiBase64)

        assertEquals("Safety number must be strictly symmetric", snAliceBob, snBobAlice)
        val regex = Regex("^\\d{5} \\d{5} \\d{5} \\d{5}$")
        assertTrue("Safety number must match 4 groups of 5 digits: $snAliceBob", regex.matches(snAliceBob))
    }

    @Test
    fun `matches cross-platform test vector for Alice and Bob`() {
        val sn = SafetyNumberEngine.calculateSafetyNumber(alicePublicKeySpkiBase64, bobPublicKeySpkiBase64)
        assertEquals("21645 15967 12315 36440", sn)
    }

    @Test
    fun `produces different safety numbers when communicating with different peers`() {
        val snAliceBob = SafetyNumberEngine.calculateSafetyNumber(alicePublicKeySpkiBase64, bobPublicKeySpkiBase64)
        val snAliceCharlie = SafetyNumberEngine.calculateSafetyNumber(alicePublicKeySpkiBase64, charliePublicKeySpkiBase64)

        assertNotEquals(snAliceBob, snAliceCharlie)
    }

    @Test
    fun `handles whitespace and padding cleanly`() {
        val sn1 = SafetyNumberEngine.calculateSafetyNumber(alicePublicKeySpkiBase64, bobPublicKeySpkiBase64)
        val sn2 = SafetyNumberEngine.calculateSafetyNumber(
            " \n" + alicePublicKeySpkiBase64 + " ",
            " \t" + bobPublicKeySpkiBase64 + " \n"
        )

        assertEquals(sn1, sn2)
    }
}

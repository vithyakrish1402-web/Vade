package com.enctxt

import com.enctxt.core.gesture.GestureRecordSerializer
import com.enctxt.core.gesture.StoredGestureSequenceDto
import com.enctxt.core.security.FingerprintEngine
import com.enctxt.core.security.SafetyNumberEngine
import com.enctxt.core.security.VerificationRecordSerializer
import com.enctxt.core.storage.EncryptedMessageEntity
import com.enctxt.core.sync.MessageStateReconciler
import com.enctxt.data.model.MessageLocalState
import org.junit.Assert.*
import org.junit.Test

class ReleaseHardeningTest {

    @Test
    fun `assert zero plaintext persistence in Room message entity`() {
        val properties = EncryptedMessageEntity::class.java.declaredFields.map { it.name }
        
        assertFalse("Entity must not contain 'plaintext'", properties.contains("plaintext"))
        assertFalse("Entity must not contain 'transientPlaintext'", properties.contains("transientPlaintext"))
        assertFalse("Entity must not contain 'decryptedMessage'", properties.contains("decryptedMessage"))
        assertFalse("Entity must not contain 'text'", properties.contains("text"))
        assertFalse("Entity must not contain 'content'", properties.contains("content"))
        
        assertTrue("Entity must persist ciphertext", properties.contains("ciphertext"))
        assertTrue("Entity must persist nonce", properties.contains("nonce"))
        assertTrue("Entity must persist senderKeyId", properties.contains("senderKeyId"))
        assertTrue("Entity must persist recipientKeyId", properties.contains("recipientKeyId"))
    }

    @Test
    fun `assert monotonic message delivery state transitions`() {
        // Read is terminal; cannot regress to Sent or Delivered
        val readState = MessageLocalState.READ
        assertEquals(MessageLocalState.READ, MessageStateReconciler.reconcileDeliveryState(readState, "sent"))
        assertEquals(MessageLocalState.READ, MessageStateReconciler.reconcileDeliveryState(readState, "delivered"))
        assertEquals(MessageLocalState.READ, MessageStateReconciler.reconcileDeliveryState(readState, "read"))

        // Delivered can advance to Read, but not regress to Sent
        val deliveredState = MessageLocalState.DELIVERED
        assertEquals(MessageLocalState.DELIVERED, MessageStateReconciler.reconcileDeliveryState(deliveredState, "sent"))
        assertEquals(MessageLocalState.READ, MessageStateReconciler.reconcileDeliveryState(deliveredState, "read"))
    }

    @Test
    fun `assert fail-closed deserialization on corrupted gesture storage`() {
        val corrupted = "{ invalid: json, corrupted: true"
        val result = GestureRecordSerializer.decode(corrupted)
        assertNull("Corrupted gesture storage must fail closed (return null)", result)
    }

    @Test
    fun `assert fail-closed deserialization on incompatible gesture schema version`() {
        val futureVersion = com.enctxt.core.gesture.StoredGestureSequenceDto(
            version = 99,
            sequence = emptyList(),
            createdAt = "2026-08-26T00:00:00Z",
            updatedAt = "2026-08-26T00:00:00Z"
        )
        val encoded = GestureRecordSerializer.encode(futureVersion)
        val result = GestureRecordSerializer.decode(encoded)
        assertNull("Incompatible gesture schema version must fail closed", result)
    }

    @Test
    fun `assert fail-closed deserialization on corrupted verification storage`() {
        val corrupted = "{ broken verification json"
        val result = VerificationRecordSerializer.decode(corrupted)
        assertNull("Corrupted verification storage must fail closed (return null)", result)
    }

    @Test
    fun `assert deterministic cross-platform identity fingerprint formatting`() {
        val keyBase64 = "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEawMQ2rcQ7O3eTx0A3MmKjcMKOcqAuojgM68JwnxzDSpi40mxKcY2A/dWMdWvp0C3sGX/aXjlwmzMLOV+EAVJdg=="
        val fingerprint = FingerprintEngine.calculateFingerprint(keyBase64)
        
        // Exact 8 groups of 4 uppercase hexadecimal characters
        val regex = Regex("^[0-9A-F]{4}( [0-9A-F]{4}){7}$")
        assertTrue("Fingerprint must match 8x4 hex format: $fingerprint", regex.matches(fingerprint))
        assertEquals(39, fingerprint.length) // 32 hex chars + 7 spaces
    }

    @Test
    fun `assert deterministic cross-platform symmetric safety number formatting`() {
        val keyA = "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEawMQ2rcQ7O3eTx0A3MmKjcMKOcqAuojgM68JwnxzDSpi40mxKcY2A/dWMdWvp0C3sGX/aXjlwmzMLOV+EAVJdg=="
        val keyB = "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEJ7Os1SMBOvYE78qWI3qRiHNcNDf9KevsKZSbJWrD8iRYKQP+ho7+QEZUVIfxuv03wn7V5hvgLMEGXYuaQdgZNg=="
        
        val snAB = SafetyNumberEngine.calculateSafetyNumber(keyA, keyB)
        val snBA = SafetyNumberEngine.calculateSafetyNumber(keyB, keyA)
        
        assertEquals(snAB, snBA)
        val regex = Regex("^\\d{5} \\d{5} \\d{5} \\d{5}$")
        assertTrue("Safety number must match 4 groups of 5 decimal digits: $snAB", regex.matches(snAB))
        assertEquals(23, snAB.length) // 20 digits + 3 spaces
    }
}

package com.enctxt

import com.enctxt.core.security.StoredVerificationContainerDto
import com.enctxt.core.security.VerificationRecordSerializer
import com.enctxt.core.security.VerificationStorage
import com.enctxt.core.security.VerifiedContact
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import java.util.concurrent.ConcurrentHashMap

class VerificationStorageTest {

    private class InMemoryVerificationStorage : VerificationStorage {
        private val verifications = ConcurrentHashMap<String, VerifiedContact>()
        var isAvailableFlag = true

        override fun isAvailable(): Boolean = isAvailableFlag

        override fun getVerification(userId: String): VerifiedContact? {
            if (!isAvailableFlag || userId.isBlank()) return null
            return verifications[userId]
        }

        override fun saveVerification(contact: VerifiedContact): Boolean {
            if (!isAvailableFlag || contact.userId.isBlank() || contact.keyId.isBlank() || contact.fingerprint.isBlank()) return false
            verifications[contact.userId] = contact
            return true
        }

        override fun removeVerification(userId: String): Boolean {
            if (!isAvailableFlag || userId.isBlank()) return false
            verifications.remove(userId)
            return true
        }

        override fun getAllVerifications(): Map<String, VerifiedContact> {
            if (!isAvailableFlag) return emptyMap()
            return verifications.toMap()
        }

        override fun clear() {
            verifications.clear()
        }
    }

    private lateinit var storage: InMemoryVerificationStorage

    @Before
    fun setUp() {
        storage = InMemoryVerificationStorage()
    }

    @Test
    fun `stores, retrieves, and removes verified contact identities`() {
        val bobId = "bob-uuid-1"
        val bobKeyId = "k_bob_v1"
        val bobFingerprint = "BF41 20A1 9DEA 2447 C384 CBBB 886B 29B8"
        val verifiedAt = 1710000000000L

        assertNull(storage.getVerification(bobId))

        val saved = storage.saveVerification(
            VerifiedContact(
                userId = bobId,
                keyId = bobKeyId,
                fingerprint = bobFingerprint,
                verifiedAt = verifiedAt
            )
        )
        assertTrue(saved)

        val retrieved = storage.getVerification(bobId)
        assertNotNull(retrieved)
        assertEquals(bobId, retrieved?.userId)
        assertEquals(bobKeyId, retrieved?.keyId)
        assertEquals(bobFingerprint, retrieved?.fingerprint)
        assertEquals(verifiedAt, retrieved?.verifiedAt)

        val removed = storage.removeVerification(bobId)
        assertTrue(removed)
        assertNull(storage.getVerification(bobId))
    }

    @Test
    fun `handles multiple distinct contacts independently`() {
        val contact1 = VerifiedContact("user-1", "k_1", "FP1", 1000L)
        val contact2 = VerifiedContact("user-2", "k_2", "FP2", 2000L)

        storage.saveVerification(contact1)
        storage.saveVerification(contact2)

        val all = storage.getAllVerifications()
        assertEquals(2, all.size)
        assertEquals("FP1", storage.getVerification("user-1")?.fingerprint)
        assertEquals("FP2", storage.getVerification("user-2")?.fingerprint)

        storage.removeVerification("user-1")
        assertNull(storage.getVerification("user-1"))
        assertNotNull(storage.getVerification("user-2"))

        storage.clear()
        assertTrue(storage.getAllVerifications().isEmpty())
    }

    @Test
    fun `fails closed when storage is unavailable`() {
        storage.saveVerification(VerifiedContact("user-1", "k_1", "FP1", 1000L))
        storage.isAvailableFlag = false

        assertNull(storage.getVerification("user-1"))
        assertTrue(storage.getAllVerifications().isEmpty())
        assertFalse(storage.saveVerification(VerifiedContact("user-2", "k_2", "FP2", 2000L)))
        assertFalse(storage.removeVerification("user-1"))
    }

    @Test
    fun `VerificationRecordSerializer decodes valid json roundtrip`() {
        val container = StoredVerificationContainerDto(
            version = 1,
            verifications = mapOf(
                "user-1" to VerifiedContact("user-1", "k_1", "FP_1", 1700000000000L)
            ),
            updatedAt = "2026-08-26T12:00:00Z"
        )
        val encoded = VerificationRecordSerializer.encode(container)
        val decoded = VerificationRecordSerializer.decode(encoded)

        assertNotNull(decoded)
        assertEquals(1, decoded?.version)
        assertEquals(1, decoded?.verifications?.size)
        assertEquals("FP_1", decoded?.verifications?.get("user-1")?.fingerprint)
    }

    @Test
    fun `VerificationRecordSerializer fails closed on corrupted json`() {
        val corrupted = "{ invalid: json, not: valid }"
        val result = VerificationRecordSerializer.decode(corrupted)
        assertNull(result)
    }

    @Test
    fun `VerificationRecordSerializer rejects schema version mismatch`() {
        val futureVersion = """{"version": 2, "verifications": {}, "updatedAt": ""}"""
        val result = VerificationRecordSerializer.decode(futureVersion)
        assertNull("Must reject version != 1 to prevent schema corruption", result)
    }
}

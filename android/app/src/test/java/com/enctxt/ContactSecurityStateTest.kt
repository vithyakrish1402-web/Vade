package com.enctxt

import com.enctxt.core.network.ApiClient
import com.enctxt.core.network.NetworkResult
import com.enctxt.core.security.ContactSecurityState
import com.enctxt.core.security.FingerprintEngine
import com.enctxt.core.security.VerificationStorage
import com.enctxt.core.security.VerifiedContact
import com.enctxt.data.model.PublicKeyResponse
import com.enctxt.data.repository.ContactSecurityRepository
import kotlinx.coroutines.test.runTest
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import java.util.concurrent.ConcurrentHashMap

class ContactSecurityStateTest {

    private class MockVerificationStorage : VerificationStorage {
        val map = ConcurrentHashMap<String, VerifiedContact>()
        override fun isAvailable(): Boolean = true
        override fun getVerification(userId: String): VerifiedContact? = map[userId]
        override fun saveVerification(contact: VerifiedContact): Boolean {
            map[contact.userId] = contact
            return true
        }
        override fun removeVerification(userId: String): Boolean {
            map.remove(userId)
            return true
        }
        override fun getAllVerifications(): Map<String, VerifiedContact> = map.toMap()
        override fun clear() = map.clear()
    }

    private class FakeApiClient : ApiClient() {
        var publicKeyHandler: (suspend (String) -> NetworkResult<PublicKeyResponse>)? = null

        override suspend fun getUserPublicKey(userId: String): NetworkResult<PublicKeyResponse> {
            return publicKeyHandler?.invoke(userId)
                ?: NetworkResult.Error("NOT_FOUND", "No key configured in fake", 404)
        }
    }

    private lateinit var storage: MockVerificationStorage
    private lateinit var apiClient: FakeApiClient
    private lateinit var repository: ContactSecurityRepository

    private val peerId = "user-bob-002"
    private val keyIdV1 = "k_bob_001"
    private val keyIdV2 = "k_bob_002"
    private val pubKeyV1 = "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEJ7Os1SMBOvYE78qWI3qRiHNcNDf9KevsKZSbJWrD8iRYKQP+ho7+QEZUVIfxuv03wn7V5hvgLMEGXYuaQdgZNg=="
    private val pubKeyV2 = "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEawMQ2rcQ7O3eTx0A3MmKjcMKOcqAuojgM68JwnxzDSpi40mxKcY2A/dWMdWvp0C3sGX/aXjlwmzMLOV+EAVJdg=="

    @Before
    fun setUp() {
        storage = MockVerificationStorage()
        apiClient = FakeApiClient()
        repository = ContactSecurityRepository(storage, apiClient)
    }

    @Test
    fun `evaluates Unverified state when no local verification exists`() = runTest {
        apiClient.publicKeyHandler = {
            NetworkResult.Success(PublicKeyResponse(userId = peerId, keyId = keyIdV1, publicKey = pubKeyV1))
        }

        val result = repository.getContactSecurityState(peerId)
        assertTrue(result is NetworkResult.Success)
        assertEquals(ContactSecurityState.Unverified, (result as NetworkResult.Success).data)
    }

    @Test
    fun `transitions from Unverified to Verified upon user verification`() = runTest {
        val fp1 = FingerprintEngine.calculateFingerprint(pubKeyV1)

        // 1. Mark as verified
        val success = repository.markAsVerified(peerId, keyIdV1, fp1)
        assertTrue(success)

        // 2. Query state
        apiClient.publicKeyHandler = {
            NetworkResult.Success(PublicKeyResponse(userId = peerId, keyId = keyIdV1, publicKey = pubKeyV1))
        }

        val result = repository.getContactSecurityState(peerId)
        assertTrue(result is NetworkResult.Success)
        val state = (result as NetworkResult.Success).data
        assertTrue("State must be Verified", state is ContactSecurityState.Verified)
        assertEquals(fp1, (state as ContactSecurityState.Verified).fingerprint)
    }

    @Test
    fun `transitions from Verified to KeyChanged when server key rotates`() = runTest {
        val fp1 = FingerprintEngine.calculateFingerprint(pubKeyV1)
        val fp2 = FingerprintEngine.calculateFingerprint(pubKeyV2)

        // Verify Bob's key v1
        repository.markAsVerified(peerId, keyIdV1, fp1)

        // Server now returns Bob's key v2 (e.g. rotated/new device)
        apiClient.publicKeyHandler = {
            NetworkResult.Success(PublicKeyResponse(userId = peerId, keyId = keyIdV2, publicKey = pubKeyV2))
        }

        val result = repository.getContactSecurityState(peerId)
        assertTrue(result is NetworkResult.Success)
        val state = (result as NetworkResult.Success).data
        assertTrue("State must be KeyChanged", state is ContactSecurityState.KeyChanged)

        val keyChanged = state as ContactSecurityState.KeyChanged
        assertEquals(keyIdV1, keyChanged.previousKeyId)
        assertEquals(fp1, keyChanged.previousFingerprint)
        assertEquals(keyIdV2, keyChanged.currentKeyId)
        assertEquals(fp2, keyChanged.currentFingerprint)
    }

    @Test
    fun `transitions from KeyChanged to Verified only upon explicit user re-verification`() = runTest {
        val fp1 = FingerprintEngine.calculateFingerprint(pubKeyV1)
        val fp2 = FingerprintEngine.calculateFingerprint(pubKeyV2)

        repository.markAsVerified(peerId, keyIdV1, fp1)

        apiClient.publicKeyHandler = {
            NetworkResult.Success(PublicKeyResponse(userId = peerId, keyId = keyIdV2, publicKey = pubKeyV2))
        }

        // 1. Initial detection of key change
        var state = (repository.getContactSecurityState(peerId) as NetworkResult.Success).data
        assertTrue(state is ContactSecurityState.KeyChanged)

        // 2. User explicitly re-verifies new key
        repository.markAsVerified(peerId, keyIdV2, fp2)

        // 3. State is now Verified with new key
        state = (repository.getContactSecurityState(peerId) as NetworkResult.Success).data
        assertTrue(state is ContactSecurityState.Verified)
        assertEquals(fp2, (state as ContactSecurityState.Verified).fingerprint)
    }

    @Test
    fun `transitions from Verified to Unverified when verification is removed`() = runTest {
        val fp1 = FingerprintEngine.calculateFingerprint(pubKeyV1)
        repository.markAsVerified(peerId, keyIdV1, fp1)

        apiClient.publicKeyHandler = {
            NetworkResult.Success(PublicKeyResponse(userId = peerId, keyId = keyIdV1, publicKey = pubKeyV1))
        }

        repository.removeVerification(peerId)

        val state = (repository.getContactSecurityState(peerId) as NetworkResult.Success).data
        assertEquals(ContactSecurityState.Unverified, state)
    }

    @Test
    fun `evaluates NoKey state when server reports 404 or empty key`() = runTest {
        apiClient.publicKeyHandler = {
            NetworkResult.Error("NOT_FOUND", "User not found", 404)
        }

        val state = (repository.getContactSecurityState(peerId) as NetworkResult.Success).data
        assertEquals(ContactSecurityState.NoKey, state)
    }
}

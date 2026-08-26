package com.enctxt.data.repository

import com.enctxt.core.network.ApiClient
import com.enctxt.core.network.NetworkResult
import com.enctxt.core.security.ContactSecurityState
import com.enctxt.core.security.FingerprintEngine
import com.enctxt.core.security.VerificationStorage
import com.enctxt.core.security.VerifiedContact
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * Repository for managing Layer 4 Contact Verification and Key Change Detection.
 *
 * SECURITY CONTRACTS:
 * - Verification records remain strictly on-device (never uploaded to server).
 * - Key changes are detected deterministically and NEVER silently re-verified.
 * - When keyId or fingerprint changes, state transitions to [ContactSecurityState.KeyChanged]
 *   and remains there until explicit user confirmation.
 */
class ContactSecurityRepository(
    private val verificationStorage: VerificationStorage,
    private val apiClient: ApiClient
) {

    /**
     * Evaluates a contact's security verification state against their current server public key.
     */
    suspend fun getContactSecurityState(userId: String): NetworkResult<ContactSecurityState> = withContext(Dispatchers.IO) {
        if (userId.isBlank()) return@withContext NetworkResult.Success(ContactSecurityState.NoKey)

        when (val res = apiClient.getUserPublicKey(userId)) {
            is NetworkResult.Success -> {
                val currentKey = res.data
                if (currentKey.publicKey.isBlank()) {
                    return@withContext NetworkResult.Success(ContactSecurityState.NoKey)
                }

                val currentFingerprint = try {
                    FingerprintEngine.calculateFingerprint(currentKey.publicKey)
                } catch (_: Exception) {
                    return@withContext NetworkResult.Success(ContactSecurityState.NoKey)
                }

                val stored = verificationStorage.getVerification(userId)
                val state = evaluateSecurityState(
                    storedVerification = stored,
                    currentKeyId = currentKey.keyId,
                    currentFingerprint = currentFingerprint
                )
                NetworkResult.Success(state)
            }
            is NetworkResult.Error -> {
                if (res.statusCode == 404) {
                    NetworkResult.Success(ContactSecurityState.NoKey)
                } else {
                    NetworkResult.Error(res.code, res.message, res.statusCode)
                }
            }
            is NetworkResult.Loading -> NetworkResult.Loading
        }
    }

    /**
     * Pure determination of security state from local stored verification and current server key details.
     */
    fun evaluateSecurityState(
        storedVerification: VerifiedContact?,
        currentKeyId: String,
        currentFingerprint: String
    ): ContactSecurityState {
        if (storedVerification == null) {
            return ContactSecurityState.Unverified
        }

        return if (storedVerification.keyId == currentKeyId && storedVerification.fingerprint == currentFingerprint) {
            ContactSecurityState.Verified(
                fingerprint = storedVerification.fingerprint,
                verifiedAt = storedVerification.verifiedAt
            )
        } else {
            ContactSecurityState.KeyChanged(
                previousKeyId = storedVerification.keyId,
                previousFingerprint = storedVerification.fingerprint,
                currentKeyId = currentKeyId,
                currentFingerprint = currentFingerprint
            )
        }
    }

    /**
     * Marks a contact as verified with their current keyId and fingerprint after explicit user confirmation.
     */
    fun markAsVerified(userId: String, keyId: String, fingerprint: String): Boolean {
        if (userId.isBlank() || keyId.isBlank() || fingerprint.isBlank()) return false
        val contact = VerifiedContact(
            userId = userId,
            keyId = keyId,
            fingerprint = fingerprint,
            verifiedAt = System.currentTimeMillis()
        )
        return verificationStorage.saveVerification(contact)
    }

    /**
     * Removes local verification for a contact, returning their state to Unverified.
     */
    fun removeVerification(userId: String): Boolean {
        if (userId.isBlank()) return false
        return verificationStorage.removeVerification(userId)
    }

    fun getStoredVerification(userId: String): VerifiedContact? =
        verificationStorage.getVerification(userId)

    fun isStorageAvailable(): Boolean = verificationStorage.isAvailable()
}

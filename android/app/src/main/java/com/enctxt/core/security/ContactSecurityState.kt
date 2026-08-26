package com.enctxt.core.security

/**
 * Domain representation of a contact's identity trust state (Layer 4 — Identity Verification).
 */
sealed interface ContactSecurityState {

    /**
     * Contact identity key exists on server, but user has not manually verified it.
     */
    data object Unverified : ContactSecurityState

    /**
     * Contact identity key has been manually verified by the user against the local fingerprint.
     */
    data class Verified(
        val fingerprint: String,
        val verifiedAt: Long
    ) : ContactSecurityState

    /**
     * Contact previously verified, but their server identity key has changed (keyId or fingerprint mismatch).
     * Must remain in KeyChanged state until user explicitly verifies the new identity key.
     */
    data class KeyChanged(
        val previousKeyId: String,
        val previousFingerprint: String,
        val currentKeyId: String,
        val currentFingerprint: String
    ) : ContactSecurityState

    /**
     * No active public identity key found for the contact.
     */
    data object NoKey : ContactSecurityState
}

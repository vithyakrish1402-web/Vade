package com.enctxt.core.security

import kotlinx.serialization.Serializable

/**
 * Local-only persistent record of a manually verified contact's identity key (Layer 4 — Identity Verification).
 *
 * PRIVACY & SECURITY CONTRACTS:
 * - Never contains private keys, plaintext messages, gesture templates, or session cookies.
 * - Stored strictly locally in encrypted preferences; never synchronized to server or Room message tables.
 */
@Serializable
data class VerifiedContact(
    val userId: String,
    val keyId: String,
    val fingerprint: String,
    val verifiedAt: Long
)

@Serializable
data class StoredVerificationContainerDto(
    val version: Int = 1,
    val verifications: Map<String, VerifiedContact> = emptyMap(),
    val updatedAt: String = ""
)

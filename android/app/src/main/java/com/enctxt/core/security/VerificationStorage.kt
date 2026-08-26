package com.enctxt.core.security

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import java.time.Instant

/**
 * Local-only storage interface for Layer 4 Contact Identity Verification.
 */
interface VerificationStorage {
    fun isAvailable(): Boolean
    fun getVerification(userId: String): VerifiedContact?
    fun saveVerification(contact: VerifiedContact): Boolean
    fun removeVerification(userId: String): Boolean
    fun getAllVerifications(): Map<String, VerifiedContact>
    fun clear()
}

/**
 * Pure JSON serializer and validator for verification records (Android-free for testability).
 */
object VerificationRecordSerializer {
    private val json = Json { ignoreUnknownKeys = true }
    const val SCHEMA_VERSION = 1

    fun encode(container: StoredVerificationContainerDto): String = json.encodeToString(container)

    /**
     * Decodes and validates stored verification records. Fails closed (returns null) on
     * corrupted JSON, schema mismatch, or missing required fields.
     */
    fun decode(raw: String): StoredVerificationContainerDto? {
        return try {
            val parsed = json.decodeFromString<StoredVerificationContainerDto>(raw)
            if (parsed.version != SCHEMA_VERSION) return null
            parsed
        } catch (_: Exception) {
            null
        }
    }
}

/**
 * EncryptedSharedPreferences-backed [VerificationStorage] using AES-256-GCM.
 * Fails closed: if the Keystore master key or encrypted preference file cannot be loaded,
 * every operation safely reports unavailable/empty rather than falling back to plaintext.
 */
class EncryptedVerificationStorage(context: Context) : VerificationStorage {

    private val appContext = context.applicationContext

    private val prefs: SharedPreferences? by lazy {
        try {
            val masterKey = MasterKey.Builder(appContext)
                .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
                .build()

            EncryptedSharedPreferences.create(
                appContext,
                PREFS_FILE_NAME,
                masterKey,
                EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
            )
        } catch (_: Exception) {
            null
        }
    }

    override fun isAvailable(): Boolean = prefs != null

    @Synchronized
    override fun getAllVerifications(): Map<String, VerifiedContact> {
        val store = prefs ?: return emptyMap()
        val raw = try {
            store.getString(KEY_CONTAINER, null)
        } catch (_: Exception) {
            null
        } ?: return emptyMap()

        val container = VerificationRecordSerializer.decode(raw) ?: return emptyMap()
        return container.verifications
    }

    @Synchronized
    override fun getVerification(userId: String): VerifiedContact? {
        if (userId.isBlank()) return null
        return getAllVerifications()[userId]
    }

    @Suppress("ApplySharedPref")
    @Synchronized
    override fun saveVerification(contact: VerifiedContact): Boolean {
        val store = prefs ?: return false
        if (contact.userId.isBlank() || contact.keyId.isBlank() || contact.fingerprint.isBlank()) return false

        return try {
            val currentMap = getAllVerifications().toMutableMap()
            currentMap[contact.userId] = contact
            val container = StoredVerificationContainerDto(
                version = VerificationRecordSerializer.SCHEMA_VERSION,
                verifications = currentMap,
                updatedAt = Instant.now().toString()
            )
            val jsonString = VerificationRecordSerializer.encode(container)
            store.edit().putString(KEY_CONTAINER, jsonString).commit()
        } catch (_: Exception) {
            false
        }
    }

    @Suppress("ApplySharedPref")
    @Synchronized
    override fun removeVerification(userId: String): Boolean {
        val store = prefs ?: return false
        if (userId.isBlank()) return false

        return try {
            val currentMap = getAllVerifications().toMutableMap()
            if (!currentMap.containsKey(userId)) return true
            currentMap.remove(userId)
            val container = StoredVerificationContainerDto(
                version = VerificationRecordSerializer.SCHEMA_VERSION,
                verifications = currentMap,
                updatedAt = Instant.now().toString()
            )
            val jsonString = VerificationRecordSerializer.encode(container)
            store.edit().putString(KEY_CONTAINER, jsonString).commit()
        } catch (_: Exception) {
            false
        }
    }

    @Suppress("ApplySharedPref")
    @Synchronized
    override fun clear() {
        val store = prefs ?: return
        try {
            store.edit().remove(KEY_CONTAINER).commit()
        } catch (_: Exception) {
            // Fail closed
        }
    }

    companion object {
        private const val PREFS_FILE_NAME = "enctxt_verification_prefs"
        private const val KEY_CONTAINER = "verifications_v1"
    }
}

package com.enctxt.core.gesture

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import kotlinx.serialization.Serializable
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

// ==============================================================================
// Wire format persisted to encrypted local storage. Deliberately minimal: never
// carries plaintext messages, conversation/message IDs, or identity key material.
// ==============================================================================

@Serializable
data class StoredGesturePointDto(val x: Float, val y: Float)

@Serializable
data class StoredGestureStepDto(val points: List<StoredGesturePointDto>)

@Serializable
data class StoredGestureSequenceDto(
    val version: Int,
    val sequence: List<StoredGestureStepDto>,
    val createdAt: String,
    val updatedAt: String
)

/**
 * Local-only persistence for enrolled gesture sequences (Layer 3 — Local Gesture Reveal).
 *
 * SECURITY & PRIVACY NOTICE:
 * - Gesture templates never leave this device: no network transmission, no server storage,
 *   no WebSocket frames, no analytics, no crash reports, no logging.
 * - Storage is authenticated/encrypted-at-rest. If encrypted storage cannot be initialized,
 *   the implementation MUST fail closed (never fall back to writing plaintext prefs).
 */
interface GestureStorage {
    fun isAvailable(): Boolean
    fun save(userId: String, sequence: StoredGestureSequenceDto): Boolean
    fun load(userId: String): StoredGestureSequenceDto?
    fun delete(userId: String)
}

/**
 * Pure (Android-free) parsing/validation logic, split out so it is unit-testable without a
 * Context or EncryptedSharedPreferences.
 */
object GestureRecordSerializer {
    private val json = Json { ignoreUnknownKeys = true }

    fun encode(sequence: StoredGestureSequenceDto): String = json.encodeToString(sequence)

    /**
     * Decodes and validates a stored record. Returns null (fail closed) for malformed JSON,
     * an unsupported schema version, or a structurally invalid sequence — the caller must
     * treat this identically to "no gesture configured" and require re-enrollment. Never
     * attempts automatic migration of an unsupported version.
     */
    fun decode(raw: String): StoredGestureSequenceDto? {
        return try {
            val parsed = json.decodeFromString<StoredGestureSequenceDto>(raw)
            if (parsed.version != GestureSequence.SCHEMA_VERSION) return null
            if (parsed.sequence.isEmpty() || parsed.sequence.size > GestureSequence.MAX_SEQUENCE_LENGTH) return null
            if (parsed.sequence.any { it.points.size < 10 }) return null
            parsed
        } catch (_: Exception) {
            null
        }
    }
}

/**
 * EncryptedSharedPreferences-backed [GestureStorage]. Fails closed: if the Android Keystore
 * master key or the encrypted preference file cannot be created, [isAvailable] reports false
 * and every operation is a safe no-op rather than silently degrading to plaintext storage.
 */
class EncryptedGestureStorage(context: Context) : GestureStorage {

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

    @Suppress("ApplySharedPref") // Intentional: saveSequence()'s Boolean result must reflect
    // whether the write actually landed (shown to the user during enrollment), so this needs
    // apply()'s asynchronous "always succeeds" semantics replaced with a synchronous outcome.
    override fun save(userId: String, sequence: StoredGestureSequenceDto): Boolean {
        val store = prefs ?: return false
        if (userId.isBlank()) return false
        return try {
            store.edit().putString(keyFor(userId), GestureRecordSerializer.encode(sequence)).commit()
        } catch (_: Exception) {
            false
        }
    }

    override fun load(userId: String): StoredGestureSequenceDto? {
        val store = prefs ?: return null
        if (userId.isBlank()) return null
        val raw = try {
            store.getString(keyFor(userId), null)
        } catch (_: Exception) {
            null
        } ?: return null
        return GestureRecordSerializer.decode(raw)
    }

    override fun delete(userId: String) {
        val store = prefs ?: return
        try {
            // Fire-and-forget is fine here: delete() returns Unit, nothing awaits confirmation.
            store.edit().remove(keyFor(userId)).apply()
        } catch (_: Exception) {
            // Fail closed: nothing further to do — a failed delete leaves storage unavailable
            // rather than exposing partial state.
        }
    }

    private fun keyFor(userId: String) = "$KEY_PREFIX$userId"

    companion object {
        private const val PREFS_FILE_NAME = "enctxt_gesture_prefs"
        private const val KEY_PREFIX = "gesture_seq_"
    }
}

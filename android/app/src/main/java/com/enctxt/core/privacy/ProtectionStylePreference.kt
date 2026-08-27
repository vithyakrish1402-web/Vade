package com.enctxt.core.privacy

import android.content.Context
import android.content.SharedPreferences

/**
 * Local Protection Style Preference Storage
 *
 * Persists the user's chosen rendering mode (Classic/Illusion/Pattern) locally on-device.
 *
 * SECURITY & PRIVACY NOTICE:
 * - This preference is strictly LOCAL ONLY.
 * - It is a UI/rendering choice, not sensitive data (unlike the gesture sequence, which uses
 *   [com.enctxt.core.gesture.EncryptedGestureStorage]) — plain [SharedPreferences] is sufficient.
 *   It is never sent to the backend and does not need to be synchronized across devices.
 */
interface ProtectionStylePreference {
    fun getMode(userId: String): ProtectedRenderMode
    fun setMode(userId: String, mode: ProtectedRenderMode): Boolean
}

class SharedPrefsProtectionStylePreference(context: Context) : ProtectionStylePreference {

    private val appContext = context.applicationContext

    private val prefs: SharedPreferences by lazy {
        appContext.getSharedPreferences(PREFS_FILE_NAME, Context.MODE_PRIVATE)
    }

    override fun getMode(userId: String): ProtectedRenderMode {
        if (userId.isBlank()) return ProtectedRenderMode.HOMOGLYPH

        val stored = try {
            prefs.getString(keyFor(userId), null)
        } catch (_: Exception) {
            null
        }

        return stored?.let { name ->
            ProtectedRenderMode.entries.find { it.name == name }
        } ?: ProtectedRenderMode.HOMOGLYPH
    }

    override fun setMode(userId: String, mode: ProtectedRenderMode): Boolean {
        if (userId.isBlank()) return false

        return try {
            prefs.edit().putString(keyFor(userId), mode.name).apply()
            true
        } catch (_: Exception) {
            false
        }
    }

    private fun keyFor(userId: String) = "${KEY_PREFIX}$userId"

    companion object {
        private const val PREFS_FILE_NAME = "protected_text_prefs"
        private const val KEY_PREFIX = "protection_style_"
    }
}

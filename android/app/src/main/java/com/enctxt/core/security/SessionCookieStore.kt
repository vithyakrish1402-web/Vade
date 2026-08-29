package com.enctxt.core.security

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

data class PersistedSessionCookie(val name: String, val value: String, val expiresAt: Long)

/**
 * "Remember me" backing store — the server session cookie, persisted only when the user opts
 * in at login, so `enctxt_session` survives process death instead of living in the in-memory
 * cookie jar alone.
 */
interface SessionCookieStore {
    fun isAvailable(): Boolean
    fun save(cookie: PersistedSessionCookie)
    fun load(): PersistedSessionCookie?
    fun clear()
}

/**
 * EncryptedSharedPreferences-backed [SessionCookieStore]. Fails closed: if the Keystore master
 * key or encrypted preference file cannot be created, every operation is a safe no-op — "remember
 * me" is simply unavailable rather than falling back to a plaintext file.
 */
class EncryptedSessionCookieStore(context: Context) : SessionCookieStore {

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

    override fun save(cookie: PersistedSessionCookie) {
        prefs?.edit()
            ?.putString(KEY_NAME, cookie.name)
            ?.putString(KEY_VALUE, cookie.value)
            ?.putLong(KEY_EXPIRES_AT, cookie.expiresAt)
            ?.apply()
    }

    override fun load(): PersistedSessionCookie? {
        val store = prefs ?: return null
        val name = store.getString(KEY_NAME, null) ?: return null
        val value = store.getString(KEY_VALUE, null) ?: return null
        val expiresAt = store.getLong(KEY_EXPIRES_AT, Long.MAX_VALUE)
        if (expiresAt in 1 until System.currentTimeMillis()) {
            clear()
            return null
        }
        return PersistedSessionCookie(name, value, expiresAt)
    }

    override fun clear() {
        prefs?.edit()?.clear()?.apply()
    }

    private companion object {
        const val PREFS_FILE_NAME = "vade_session_secure"
        const val KEY_NAME = "cookie_name"
        const val KEY_VALUE = "cookie_value"
        const val KEY_EXPIRES_AT = "cookie_expires_at"
    }
}
